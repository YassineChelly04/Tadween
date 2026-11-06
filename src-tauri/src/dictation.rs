//! Live dictation, entirely on this computer.
//!
//! The microphone is read through WASAPI (cpal), mixed to mono and resampled
//! to 16 kHz. Silero VAD cuts the audio into phrases at each pause, and every
//! phrase is transcribed through sherpa-onnx, on the CPU: NVIDIA's Arabic
//! FastConformer (transducer head, int8 encoder, beam search) for Arabic, and
//! Canary 180m Flash (int8), told which language to expect, for French and
//! English. While a phrase is still being spoken, the audio so far is decoded
//! again now and then, so the words appear as they are said and settle when the
//! speaker pauses.
//!
//! Audio only lives in memory, and only while dictation runs.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::{Deserialize, Serialize};
use sherpa_onnx::{
    LinearResampler, OfflineCanaryModelConfig, OfflineRecognizer, OfflineRecognizerConfig, OfflineTransducerModelConfig,
    SileroVadModelConfig, VadModelConfig, VoiceActivityDetector,
};
use tauri::{AppHandle, Emitter};

use crate::error::{Error, Result};

/// Event sent to the UI for everything dictation does.
pub const EVENT: &str = "dictation";

const RATE: usize = 16_000;
/// Silero works on windows of 512 samples (32 ms) at 16 kHz.
const WINDOW: usize = 512;
/// Audio kept from just before the VAD notices speech, for the live preview.
const PREROLL: usize = RATE * 3 / 10;
/// Silence added after a phrase so the transducer emits its last word.
const TAIL: usize = RATE * 3 / 10;
/// Shortest phrase worth previewing.
const MIN_PREVIEW: usize = RATE / 2;
/// Level updates for the signal line, about 20 per second.
const LEVEL_EVERY: usize = RATE / 20;

/// The language being spoken.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Ar,
    Fr,
    En,
}

impl Language {
    /// The folder of its model. French and English share one.
    fn folder(self) -> &'static str {
        match self {
            Language::Ar => "ar",
            Language::Fr | Language::En => "latin",
        }
    }
}

/// What the UI hears from a running dictation. `session` tells sessions apart,
/// so text from one that is still finishing is never mixed with the next.
#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Event {
    /// The microphone is open and the model is ready.
    Listening { session: u64 },
    /// The phrase being spoken, as heard so far. Replaces the previous preview.
    Partial { session: u64, text: String },
    /// A finished phrase, to be written into the page.
    Final { session: u64, text: String },
    /// Loudness from 0 to 1, for the signal line.
    Level { session: u64, value: f32 },
    /// The microphone is closed and every phrase has been delivered.
    Stopped { session: u64 },
    Error { session: u64, message: String },
}

// ── Model ────────────────────────────────────────────────────────────────────

/// The recognizer and VAD settings, loaded once and shared by every session.
pub struct Engine {
    recognizer: OfflineRecognizer,
    vad: VadModelConfig,
    /// The transducer needs silence after a phrase to emit its last word.
    pad: bool,
}

impl Engine {
    /// `root` holds one folder per model, and `silero_vad.onnx` next to the
    /// Arabic one.
    pub fn load(root: &Path, language: Language) -> Result<Engine> {
        let dir = root.join(language.folder());
        let path_of = |path: PathBuf| -> Result<Option<String>> {
            if !path.is_file() {
                return Err(Error::SpeechModel);
            }
            Ok(Some(path.to_string_lossy().into_owned()))
        };
        let file = |name: &str| path_of(dir.join(name));
        // Half the logical cores, at most 4: the encoder gains little past
        // that, and the page must stay responsive while it works.
        let threads = std::thread::available_parallelism().map_or(2, |n| n.get() / 2).clamp(1, 4) as i32;

        let mut config = OfflineRecognizerConfig::default();
        config.model_config.tokens = file("tokens.txt")?;
        config.model_config.num_threads = threads;
        config.model_config.provider = Some("cpu".into());
        let canary = |code: &str| -> Result<OfflineCanaryModelConfig> {
            Ok(OfflineCanaryModelConfig {
                encoder: file("encoder.int8.onnx")?,
                decoder: file("decoder.int8.onnx")?,
                src_lang: Some(code.into()),
                tgt_lang: Some(code.into()),
                use_pnc: true,
            })
        };
        match language {
            Language::Ar => {
                config.model_config.transducer = OfflineTransducerModelConfig {
                    encoder: file("encoder.int8.onnx")?,
                    decoder: file("decoder.onnx")?,
                    joiner: file("joiner.onnx")?,
                };
                config.model_config.model_type = Some("nemo_transducer".into());
                config.decoding_method = Some("modified_beam_search".into());
                config.max_active_paths = 4;
            }
            Language::Fr => config.model_config.canary = canary("fr")?,
            Language::En => config.model_config.canary = canary("en")?,
        }
        let recognizer = OfflineRecognizer::create(&config).ok_or(Error::SpeechModel)?;

        let vad = VadModelConfig {
            silero_vad: SileroVadModelConfig {
                model: path_of(root.join("ar").join("silero_vad.onnx"))?,
                threshold: 0.5,
                // A pause this long ends a phrase. Measured on FLEURS Arabic:
                // 0.3 s cuts sentences apart and costs a point of WER; past
                // 0.6 s the gain is small and the text settles later.
                min_silence_duration: 0.6,
                min_speech_duration: 0.25,
                window_size: WINDOW as i32,
                max_speech_duration: 20.0,
            },
            sample_rate: RATE as i32,
            num_threads: 1,
            provider: Some("cpu".into()),
            ..Default::default()
        };
        Ok(Engine { recognizer, vad, pad: language == Language::Ar })
    }

    /// Text for 16 kHz mono samples.
    pub fn transcribe(&self, samples: &[f32]) -> String {
        let stream = self.recognizer.create_stream();
        stream.accept_waveform(RATE as i32, samples);
        if self.pad {
            stream.accept_waveform(RATE as i32, &[0.0; TAIL]);
        }
        self.recognizer.decode(&stream);
        stream.get_result().map(|r| tidy(&r.text)).unwrap_or_default()
    }
}

/// Collapses spaces and keeps Arabic punctuation tight against its word.
/// The model sometimes opens a phrase with a stray full stop; that goes.
fn tidy(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for word in text.split_whitespace() {
        let glue = word.chars().all(|c| matches!(c, '.' | '،' | '؟' | '?' | '!' | ',' | '؛' | ':'));
        if glue && out.is_empty() {
            continue;
        }
        if !out.is_empty() && !glue {
            out.push(' ');
        }
        out.push_str(word);
    }
    out
}

// ── Phrases ──────────────────────────────────────────────────────────────────

/// Turns a stream of 16 kHz samples into previews and finished phrases.
/// Kept apart from the microphone so it can be tested on recordings.
pub struct Pipeline<'e> {
    engine: &'e Engine,
    vad: VoiceActivityDetector,
    session: u64,
    /// Samples waiting to fill a VAD window.
    pending: Vec<f32>,
    /// The last few hundred milliseconds, to start a preview a little early.
    preroll: Vec<f32>,
    /// The phrase being spoken, for previews.
    phrase: Vec<f32>,
    speaking: bool,
    /// Previews are spaced by how long the last one took, so a slow machine
    /// previews less often instead of falling behind.
    next_preview: Option<Instant>,
    last_preview: String,
    level_peak: f32,
    level_count: usize,
}

impl<'e> Pipeline<'e> {
    pub fn new(engine: &'e Engine, session: u64) -> Result<Self> {
        let vad = VoiceActivityDetector::create(&engine.vad, 60.0).ok_or(Error::SpeechModel)?;
        Ok(Pipeline {
            engine,
            vad,
            session,
            pending: Vec::with_capacity(WINDOW * 4),
            preroll: Vec::with_capacity(PREROLL + WINDOW),
            phrase: Vec::with_capacity(RATE * 20),
            speaking: false,
            next_preview: None,
            last_preview: String::new(),
            level_peak: 0.0,
            level_count: 0,
        })
    }

    /// Feeds samples; finished phrases come out through `emit`.
    pub fn push(&mut self, samples: &[f32], emit: &mut impl FnMut(Event)) {
        for &s in samples {
            self.level_peak = self.level_peak.max(s.abs());
        }
        self.level_count += samples.len();
        if self.level_count >= LEVEL_EVERY {
            // Speech peaks sit around 0.1-0.5; a gentle curve keeps quiet
            // voices visible without pinning loud ones.
            let value = (self.level_peak * 2.5).min(1.0).sqrt();
            emit(Event::Level { session: self.session, value });
            self.level_peak = 0.0;
            self.level_count = 0;
        }

        self.pending.extend_from_slice(samples);
        let mut start = 0;
        while self.pending.len() - start >= WINDOW {
            let window = &self.pending[start..start + WINDOW];
            self.vad.accept_waveform(window);
            if self.vad.detected() {
                if !self.speaking {
                    self.speaking = true;
                    self.phrase.clear();
                    self.phrase.extend_from_slice(&self.preroll);
                    self.next_preview = Some(Instant::now() + Duration::from_millis(400));
                }
                self.phrase.extend_from_slice(window);
            }
            self.preroll.extend_from_slice(window);
            if self.preroll.len() > PREROLL {
                self.preroll.drain(..self.preroll.len() - PREROLL);
            }
            start += WINDOW;
            self.drain_phrases(emit);
        }
        self.pending.drain(..start);
    }

    /// Decodes the phrase in progress if a preview is due.
    pub fn preview(&mut self, emit: &mut impl FnMut(Event)) {
        let Some(due) = self.next_preview else { return };
        if !self.speaking || Instant::now() < due || self.phrase.len() < MIN_PREVIEW {
            return;
        }
        let began = Instant::now();
        let text = self.engine.transcribe(&self.phrase);
        let took = began.elapsed();
        self.next_preview = Some(Instant::now() + (took * 2).max(Duration::from_millis(500)));
        if !text.is_empty() && text != self.last_preview {
            self.last_preview = text.clone();
            emit(Event::Partial { session: self.session, text });
        }
    }

    /// Ends the last phrase, even mid-word, and delivers it.
    pub fn finish(&mut self, emit: &mut impl FnMut(Event)) {
        if !self.pending.is_empty() {
            let mut last = std::mem::take(&mut self.pending);
            last.resize(WINDOW, 0.0);
            self.vad.accept_waveform(&last);
        }
        self.vad.flush();
        self.drain_phrases(emit);
    }

    fn drain_phrases(&mut self, emit: &mut impl FnMut(Event)) {
        while let Some(segment) = self.vad.front() {
            let text = self.engine.transcribe(segment.samples());
            drop(segment);
            self.vad.pop();
            // Still speaking when a long phrase was cut at its 20 s limit:
            // keep previewing what follows.
            self.speaking = self.vad.detected();
            self.phrase.clear();
            self.next_preview = self.speaking.then(|| Instant::now() + Duration::from_millis(400));
            self.last_preview.clear();
            // An empty result still tells the UI to drop its preview.
            emit(Event::Final { session: self.session, text });
        }
    }
}

// ── Microphone ───────────────────────────────────────────────────────────────

/// One open microphone. Dropping it closes the device; the worker then
/// finishes the last phrase and reports `Stopped`.
struct Running {
    session: u64,
    _stream: cpal::Stream,
}

/// Lives in the app state.
pub struct Dictation {
    models: PathBuf,
    /// One recognizer in memory at a time, with the language it was loaded for.
    engine: Mutex<Option<(Language, Arc<Engine>)>>,
    running: Arc<Mutex<Option<Running>>>,
    sessions: Mutex<u64>,
    /// When words were last heard. Speaking keeps the vault open; silence does not.
    heard: Arc<Mutex<Instant>>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Dictation {
    pub fn new(models: PathBuf) -> Self {
        Dictation {
            models,
            engine: Mutex::new(None),
            running: Arc::new(Mutex::new(None)),
            sessions: Mutex::new(0),
            heard: Arc::new(Mutex::new(Instant::now())),
        }
    }

    /// Loads the model the first time (a second or two); later calls are free.
    pub fn engine(&self, language: Language) -> Result<Arc<Engine>> {
        let mut slot = lock(&self.engine);
        if let Some((loaded, engine)) = slot.as_ref() {
            if *loaded == language {
                return Ok(engine.clone());
            }
        }
        // Free the other one first, so the two never sit in memory together.
        *slot = None;
        let engine = Arc::new(Engine::load(&self.models, language)?);
        *slot = Some((language, engine.clone()));
        Ok(engine)
    }

    /// How long ago words were last heard.
    pub fn silence(&self) -> Duration {
        lock(&self.heard).elapsed()
    }

    /// Opens the default microphone and starts listening. Returns the session id.
    pub fn start(&self, app: AppHandle, language: Language) -> Result<u64> {
        if let Some(running) = lock(&self.running).as_ref() {
            return Ok(running.session);
        }
        let engine = self.engine(language)?;
        let session = {
            let mut n = lock(&self.sessions);
            *n += 1;
            *n
        };
        let (tx, rx) = mpsc::channel::<Vec<f32>>();
        let lost = Arc::new(AtomicBool::new(false));
        let (stream, rate) = open_microphone(tx, lost.clone())?;
        *lock(&self.heard) = Instant::now();
        let worker = Worker { engine, session, rate, rx, lost, running: self.running.clone(), heard: self.heard.clone(), app };
        std::thread::Builder::new().name("dictation".into()).spawn(move || worker.listen()).map_err(Error::Io)?;
        stream.play().map_err(|_| Error::Microphone)?;
        *lock(&self.running) = Some(Running { session, _stream: stream });
        Ok(session)
    }

    /// Closes the microphone. The last phrase still arrives as `Final`.
    pub fn stop(&self) {
        lock(&self.running).take();
    }
}

/// The default input device, delivering mono f32 chunks at its own rate.
/// `lost` is raised if the device fails later, e.g. when it is unplugged.
fn open_microphone(tx: Sender<Vec<f32>>, lost: Arc<AtomicBool>) -> Result<(cpal::Stream, u32)> {
    let device = cpal::default_host().default_input_device().ok_or(Error::Microphone)?;
    let supported = device.default_input_config().map_err(|_| Error::Microphone)?;
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let channels = usize::from(config.channels.max(1));
    let rate = config.sample_rate;

    fn mono<T: Copy>(data: &[T], channels: usize, to_f32: impl Fn(T) -> f32) -> Vec<f32> {
        data.chunks(channels).map(|frame| frame.iter().map(|&s| to_f32(s)).sum::<f32>() / channels as f32).collect()
    }
    let on_error = move |_e: cpal::Error| lost.store(true, Ordering::Relaxed);
    let stream = match format {
        cpal::SampleFormat::F32 => device.build_input_stream(
            config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(data, channels, |s| s));
            },
            on_error,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(data, channels, |s| f32::from(s) / 32_768.0));
            },
            on_error,
            None,
        ),
        cpal::SampleFormat::I32 => device.build_input_stream(
            config,
            move |data: &[i32], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(data, channels, |s| s as f32 / 2_147_483_648.0));
            },
            on_error,
            None,
        ),
        cpal::SampleFormat::U8 => device.build_input_stream(
            config,
            move |data: &[u8], _: &cpal::InputCallbackInfo| {
                let _ = tx.send(mono(data, channels, |s| (f32::from(s) - 128.0) / 128.0));
            },
            on_error,
            None,
        ),
        _ => return Err(Error::Microphone),
    }
    .map_err(|_| Error::Microphone)?;
    Ok((stream, rate))
}

/// The thread behind one dictation.
struct Worker {
    engine: Arc<Engine>,
    session: u64,
    rate: u32,
    rx: Receiver<Vec<f32>>,
    lost: Arc<AtomicBool>,
    running: Arc<Mutex<Option<Running>>>,
    heard: Arc<Mutex<Instant>>,
    app: AppHandle,
}

impl Worker {
    /// Runs until the microphone closes, then delivers the rest.
    fn listen(self) {
        let Worker { engine, session, rate, rx, lost, running, heard, app } = self;
        let mut emit = |event: Event| {
            if matches!(&event, Event::Partial { .. }) || matches!(&event, Event::Final { text, .. } if !text.is_empty()) {
                *lock(&heard) = Instant::now();
            }
            let _ = app.emit(EVENT, event);
        };
        let mut pipeline = match Pipeline::new(&engine, session) {
            Ok(p) => p,
            Err(e) => {
                emit(Event::Error { session, message: e.to_string() });
                emit(Event::Stopped { session });
                return;
            }
        };
        let resampler = (rate as usize != RATE).then(|| LinearResampler::create(rate as i32, RATE as i32)).flatten();
        emit(Event::Listening { session });
        loop {
            match rx.recv_timeout(Duration::from_millis(60)) {
                Ok(chunk) => {
                    let chunk = match &resampler {
                        Some(r) => r.resample(&chunk, false),
                        None => chunk,
                    };
                    pipeline.push(&chunk, &mut emit);
                    // Catch up on audio that queued while decoding before previewing.
                    while let Ok(more) = rx.try_recv() {
                        let more = match &resampler {
                            Some(r) => r.resample(&more, false),
                            None => more,
                        };
                        pipeline.push(&more, &mut emit);
                    }
                    pipeline.preview(&mut emit);
                }
                Err(RecvTimeoutError::Timeout) => {
                    // The device went away: say so and close it, which ends this loop.
                    if lost.swap(false, Ordering::Relaxed) {
                        emit(Event::Error { session, message: Error::Microphone.to_string() });
                        let mut open = lock(&running);
                        if open.as_ref().is_some_and(|r| r.session == session) {
                            open.take();
                        }
                    }
                    pipeline.preview(&mut emit);
                }
                Err(RecvTimeoutError::Disconnected) => break,
            }
        }
        if let Some(r) = &resampler {
            let rest = r.resample(&[], true);
            pipeline.push(&rest, &mut emit);
        }
        pipeline.finish(&mut emit);
        emit(Event::Stopped { session });
    }
}

/// `<resources>/speech`, or `TADWEEN_SPEECH_DIR` when set (tests, development).
pub fn models_dir(resources: Option<PathBuf>) -> PathBuf {
    if let Some(dir) = std::env::var_os("TADWEEN_SPEECH_DIR") {
        return PathBuf::from(dir);
    }
    resources.unwrap_or_default().join("speech")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn punctuation_sticks_to_its_word() {
        assert_eq!(tidy("  مرحبا  ، كيف حالك ؟ "), "مرحبا، كيف حالك؟");
        assert_eq!(tidy("انتهى ."), "انتهى.");
        assert_eq!(tidy(". قامت الفرقة"), "قامت الفرقة");
        assert_eq!(tidy(""), "");
    }

    #[test]
    fn french_and_english_share_a_model() {
        assert_eq!(Language::Fr.folder(), Language::En.folder());
        assert_ne!(Language::Ar.folder(), Language::Fr.folder());
        let parsed: Language = serde_json::from_str("\"fr\"").unwrap();
        assert_eq!(parsed, Language::Fr);
    }

    #[test]
    fn a_missing_model_is_reported_not_a_crash() {
        let dir = tempfile::tempdir().unwrap();
        assert!(matches!(Engine::load(dir.path(), Language::Fr), Err(Error::SpeechModel)));
    }

    /// Needs a microphone: `cargo test --lib -- --ignored opens_microphone`.
    #[test]
    #[ignore]
    fn opens_microphone() {
        let (tx, rx) = mpsc::channel();
        let (stream, rate) = open_microphone(tx, Arc::default()).expect("microphone");
        stream.play().unwrap();
        let mut samples = 0usize;
        let mut peak = 0f32;
        let until = Instant::now() + Duration::from_secs(2);
        while Instant::now() < until {
            if let Ok(chunk) = rx.recv_timeout(Duration::from_millis(100)) {
                samples += chunk.len();
                peak = chunk.iter().fold(peak, |p, s| p.max(s.abs()));
            }
        }
        println!("MIC {rate} Hz, {samples} samples in 2 s, peak {peak:.3}");
        assert!(samples as u32 > rate);
    }

    /// Needs the models: `TADWEEN_SPEECH_DIR=resources/speech TADWEEN_SPEECH_LANG=fr TADWEEN_SPEECH_WAVS=a.wav,b.wav cargo test --lib -- --ignored`.
    /// Plays the recordings one after another with pauses, as a speaker would,
    /// and prints what the pipeline wrote.
    #[test]
    #[ignore]
    fn dictates_recordings() {
        let language = match std::env::var("TADWEEN_SPEECH_LANG").as_deref() {
            Ok("fr") => Language::Fr,
            Ok("en") => Language::En,
            _ => Language::Ar,
        };
        let engine = Engine::load(&models_dir(None), language).expect("model");
        let wavs = std::env::var("TADWEEN_SPEECH_WAVS").expect("TADWEEN_SPEECH_WAVS");
        let mut pipeline = Pipeline::new(&engine, 1).unwrap();
        let mut finals = Vec::new();
        let mut emit = |e: Event| {
            if let Event::Final { text, .. } = e {
                finals.push(text);
            }
        };
        let began = Instant::now();
        let mut seconds = 0.0;
        for path in wavs.split(',') {
            let wave = sherpa_onnx::Wave::read(path).expect("wav");
            assert_eq!(wave.sample_rate() as usize, RATE);
            // 20 ms chunks, like the microphone; then a second of silence.
            // With TADWEEN_SPEECH_RATE (e.g. 48000) the audio first goes up to
            // that rate and back, as a real microphone's does.
            let rate = std::env::var("TADWEEN_SPEECH_RATE").ok().and_then(|r| r.parse::<i32>().ok());
            let round_trip = rate.map(|r| {
                (LinearResampler::create(RATE as i32, r).unwrap(), LinearResampler::create(r, RATE as i32).unwrap())
            });
            for chunk in wave.samples().chunks(RATE / 50) {
                match &round_trip {
                    Some((up, down)) => pipeline.push(&down.resample(&up.resample(chunk, false), false), &mut emit),
                    None => pipeline.push(chunk, &mut emit),
                }
            }
            pipeline.push(&vec![0.0; RATE], &mut emit);
            seconds += wave.samples().len() as f64 / RATE as f64 + 1.0;
        }
        pipeline.finish(&mut emit);
        let took = began.elapsed().as_secs_f64();
        println!("PHRASES {}", finals.len());
        for f in &finals {
            println!("FINAL\t{f}");
        }
        println!("AUDIO {seconds:.1}s DECODED IN {took:.1}s");
        assert!(!finals.is_empty());
    }
}
