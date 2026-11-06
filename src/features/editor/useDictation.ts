import { create } from 'zustand';
import type { Editor } from '@tiptap/core';
import { ApiError, api, onDictation, type DictationEvent, type Language } from '../../lib/api';
import { toast } from '../../components/Dialogs';
import i18n from '../../i18n';
import { useApp } from '../../store';
import { commitPhrase, showPreview } from './dictation';

// One dictation at a time, for the page that is open. The Rust core does the
// listening (src-tauri/src/dictation.rs); this store follows its events and
// writes the phrases into the page's editor.

type DictationPhase = 'idle' | 'starting' | 'listening' | 'stopping';

/** Level readings the strip draws: 8 seconds at 20 a second. */
const HISTORY = 160;

interface DictationState {
  phase: DictationPhase;
  /** When the microphone opened, for the clock. */
  startedAt: number | null;
  /** Recent loudness, oldest first, `HISTORY` long. */
  levels: number[];
  /** Level counts at which a phrase was written, for the nodes on the line. */
  marks: number[];
  /** Level events received so far in this dictation. */
  ticks: number;
  /** A phrase is being heard right now. */
  hearing: boolean;
  phrases: number;
  /** What the writer chose; until then dictation follows the interface language. */
  chosen: Language | null;
  setLanguage: (language: Language) => void;
  attach: (editor: Editor) => void;
  detach: (editor: Editor) => void;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
  /** Loads the model before the first click, e.g. on hover. */
  prepare: () => void;
}

let editor: Editor | null = null;
let session: number | null = null;
/** A dictation whose page closed: whatever it still says is dropped. */
let orphan: number | null = null;
let stopRequested = false;
/** The language whose model is loaded or loading. */
let prepared: Language | null = null;
let stopTimer: number | undefined;
let subscribed = false;

const dictationLanguage = (chosen: Language | null): Language => chosen ?? useApp.getState().prefs.language;

const empty = () => ({ levels: new Array<number>(HISTORY).fill(0), marks: [], ticks: 0, hearing: false, phrases: 0 });

export const useDictation = create<DictationState>((set, get) => ({
  phase: 'idle',
  startedAt: null,
  chosen: null,
  ...empty(),

  setLanguage: (language) => {
    set({ chosen: language });
    void api.setSettings({ dictationLanguage: language });
  },

  attach: (e) => {
    editor = e;
    subscribe();
    void api.getSettings().then((s) => set({ chosen: s.dictationLanguage ?? null }));
  },

  detach: (e) => {
    if (editor !== e) return;
    if (get().phase !== 'idle') {
      orphan = session;
      get().stop();
    }
    editor = null;
  },

  prepare: () => {
    const language = dictationLanguage(get().chosen);
    if (prepared === language || get().phase !== 'idle') return;
    prepared = language;
    api.dictationPrepare(language).catch(() => {
      prepared = null;
    });
  },

  start: async () => {
    if (get().phase !== 'idle' || !editor) return;
    subscribe();
    stopRequested = false;
    set({ phase: 'starting', startedAt: null, ...empty() });
    editor.commands.focus();
    try {
      const language = dictationLanguage(get().chosen);
      session = await api.dictationStart(language);
      prepared = language;
      if (stopRequested) void api.dictationStop();
    } catch (e) {
      set({ phase: 'idle' });
      const code = e instanceof ApiError ? e.code : 'io';
      toast(
        i18n.t(code === 'microphone' ? 'dictation.noMicrophone' : code === 'speech_model' ? 'dictation.noModel' : 'dictation.failed'),
      );
    }
  },

  stop: () => {
    const { phase } = get();
    if (phase === 'idle' || phase === 'stopping') return;
    stopRequested = true;
    set({ phase: 'stopping' });
    if (phase === 'listening') void api.dictationStop();
    // The core always answers with `stopped`; this only guards a lost event.
    window.clearTimeout(stopTimer);
    stopTimer = window.setTimeout(() => finish(), 10_000);
  },

  toggle: () => (get().phase === 'idle' ? void get().start() : get().stop()),
}));

function finish() {
  window.clearTimeout(stopTimer);
  if (editor) showPreview(editor, '');
  useDictation.setState({ phase: 'idle', hearing: false });
}

function handle(event: DictationEvent) {
  if (event.session === orphan && event.kind !== 'stopped') return;
  const set = useDictation.setState;
  switch (event.kind) {
    case 'listening':
      set({ phase: stopRequested ? 'stopping' : 'listening', startedAt: Date.now() });
      return;
    case 'partial':
      if (editor) showPreview(editor, event.text);
      set({ hearing: true });
      return;
    case 'final': {
      if (editor) commitPhrase(editor, event.text);
      const { ticks, marks, phrases } = useDictation.getState();
      set(event.text ? { hearing: false, marks: [...marks, ticks].filter((m) => m > ticks - HISTORY), phrases: phrases + 1 } : { hearing: false });
      return;
    }
    case 'level': {
      const { levels, ticks } = useDictation.getState();
      set({ levels: [...levels.slice(1), event.value], ticks: ticks + 1 });
      return;
    }
    case 'error':
      toast(i18n.t('dictation.failed'));
      return;
    case 'stopped':
      if (session === null || event.session >= session) finish();
      return;
  }
}

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  void onDictation(handle);
}
