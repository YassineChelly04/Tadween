<div align="center">

<img src="brand/tadween-icon.svg" width="88" alt="">

# Tadween · تدوين

**A private notebook for writing in Arabic, French and English.**<br>
Everything stays on your computer, encrypted. You can speak instead of type, offline, in all three languages.

**[Download Tadween 1.0.0 for Windows](https://github.com/YassineChelly04/Tadween/releases/latest)**

Free · No online account · No cloud · No tracking

</div>

![Tadween's home screen at night: a drawn Tunisian terrace, a clock, a greeting and the cast of characters](docs/screenshots/home-night.png)

## A home, not a dashboard

Home says hello and steps aside. The drawn terrace follows the real hour, from morning sun to the lights of the medina at night, and it speaks your language.

| Morning, in Arabic | Afternoon, in French |
|---|---|
| ![Home in the morning, in Arabic, running right to left](docs/screenshots/home-morning-arabic.png) | ![Home in the afternoon, in French](docs/screenshots/home-afternoon-french.png) |

## Arabic is not an afterthought

Choose Arabic and the whole app runs right to left, sidebar included. Direction also follows each block of writing, so Arabic and Latin lines sit naturally on the same page, whatever the interface language.

![A diary page written in Arabic, in the Night look](docs/screenshots/editor-arabic-night.png)

## Speak, and it writes

Press **Dictate** at the foot of any page and words appear as you talk, in Arabic, French or English. It runs on your own processor: nothing is recorded and nothing leaves your computer.

![Dictation running on an Arabic page, with the voice drawn as a line along the bottom](docs/screenshots/dictation-arabic.png)

## Write the way you think

Type `/` for any block. Select text for the toolbar. Tables, columns, to-dos, toggles, callouts, images and PDFs are all there, and Markdown shortcuts work as you type.

| Blocks | Selection toolbar |
|---|---|
| ![The slash menu listing blocks](docs/screenshots/slash-menu.png) | ![The toolbar above selected text](docs/screenshots/selection-toolbar.png) |

| Notes and tables | Columns, in any language |
|---|---|
| ![English reading notes with a callout and a table](docs/screenshots/editor-english-light.png) | ![A week plan in three columns mixing French and Arabic](docs/screenshots/columns.png) |

| Study pages | Pages inside pages |
|---|---|
| ![French course notes in the Day look](docs/screenshots/editor-french-day.png) | ![A sub-page with its path at the top and nested pages in the sidebar](docs/screenshots/pages-inside-pages.png) |

## Find everything again

All your pages on one timeline, sorted into folders. A calendar that marks the days you wrote. Ctrl+K searches every word, in Arabic too.

| All pages | Calendar |
|---|---|
| ![All pages as a timeline, with the contents beside it](docs/screenshots/all-pages.png) | ![The calendar with journal days marked](docs/screenshots/calendar.png) |

![Search results for an Arabic word](docs/screenshots/search-arabic.png)

## Your lock screen, your way

Five characters made from the act of writing live on the login screen: Qalam the pen, Waraqa the page, Hibr the ink drop, Noon the bowl and Nuqta the dot. They follow your cursor, look away while you type a password, and fall asleep if you leave.

Behind them, choose from **eight backgrounds**. Each one is drawn for Night, Light and Day.

![All eight login backgrounds in Night, Light and Day](docs/screenshots/login-backgrounds.png)

| Night · Sky | Light · Door, in Arabic | Day · Medina, in French |
|---|---|---|
| ![Login at night under a crescent moon](docs/screenshots/login-night-sky.png) | ![Login in Arabic in front of a Sidi Bou Said door](docs/screenshots/login-light-door-arabic.png) | ![Login in French in front of a white medina](docs/screenshots/login-day-medina-french.png) |

![Choosing the login background in Settings](docs/screenshots/settings-login-background.png)

## Yours to shape

125 page icons of Tadween's own in 8 colours, cut in the same solid style as the characters. Four looks: Day, Light, Night and Automatic.

| Page icons | Guided first run |
|---|---|
| ![The icon picker](docs/screenshots/icon-picker.png) | ![The cast introducing the app in a first-run tour](docs/screenshots/first-run-tour.png) |

## Private by design

- **Encrypted.** Every page, title, folder, attachment, name and setting is encrypted with XChaCha20-Poly1305. The key comes from your password through Argon2id (64 MiB, 3 passes) and lives in memory only while the vault is open.
- **Local.** There is no cloud and no network access. The window's content security policy allows no outside connections. A link in a note opens in your browser only when you ask (Ctrl+click).
- **Yours.** Several people can each keep their own vault on one computer. Export everything to Markdown or a full backup at any time. Import from Obsidian, Notion, Markdown folders, spreadsheets (CSV, TSV, XLSX, XLS, ODS) or a Tadween backup.
- **Recovery key.** Created with your account and shown once. It resets a forgotten password, and you can issue a new one from Settings → Security.

> **Keep your recovery key safe.** Nobody can reset your password for you. If you lose both the password and the recovery key, your notes are gone for good.

| Security settings | Starting out |
|---|---|
| ![Security settings in Arabic](docs/screenshots/settings-security-arabic.png) | ![The first welcome screen](docs/screenshots/onboarding-welcome.png) |

The screenshots show the app's interface with a made-up sample notebook, and the dictated text in them is simulated. Nothing in them is anyone's real diary.

## Install

1. Download `Tadween_1.0.0_x64-setup.exe` from the [latest release](https://github.com/YassineChelly04/Tadween/releases/latest).
2. Run it. It installs for your user only, so it needs no admin rights.
3. Windows may show "Windows protected your PC", because the installer is not code-signed yet. Choose **More info**, then **Run anyway**.

It needs Windows 10 or 11 (64-bit) and WebView2, which is built into Windows 11. The download is about 300 MB because the speech models come with it, so dictation works with no internet.

Tadween is developed by Yassine Chelly · ياسين الشلي.

---

# For developers

Tadween is a Tauri 2 desktop app: a Rust core with a React and TipTap interface in a web view.

## Run it

Requirements on Windows: Node 20+, Rust (stable, MSVC), Visual Studio Build Tools with the C++ workload and Windows SDK, and WebView2 (built into Windows 11).

```bash
npm install
npm run app        # development: Vite + the Rust core, hot reload
npm run dist       # release: builds the branded NSIS installer in src-tauri/target/release/bundle/nsis
```

`npm run dev` alone opens the interface in a browser with an in-memory stand-in for the Rust core
(`src/lib/mock.ts`). That mode has no encryption and is only for working on the UI.

Set `TADWEEN_DATA_DIR` to keep data somewhere other than `%APPDATA%\com.tadween.app`.

## Dictation

```text
microphone (WASAPI, cpal) ─► mono ─► 16 kHz ─► Silero VAD ─┬─ while speaking: re-decode the phrase so far ─► preview at the caret
                                                            └─ at each pause (0.6 s): decode the phrase ────► text in the page
```

Arabic uses NVIDIA FastConformer Hybrid Large (ar, `pc`: punctuation, no diacritics, CC BY 4.0), transducer head,
encoder quantised to 8 bits, decoded with beam search (4 paths). French and English share NVIDIA Canary 180m Flash
(CC BY 4.0, 8-bit export from sherpa-onnx), which is told the language and also writes capitals and punctuation. Only
the language in use stays in memory. Both run on up to 4 CPU threads. Measured on this repository's target machine
(i7-10870H), on the FLEURS test sets, punctuation ignored (diacritics too for Arabic):

| | WER | Speed |
|---|---:|---:|
| Arabic, model alone, 150 sentences | 9.6 % | 18× real time |
| Arabic, full pipeline (VAD, 48 kHz microphone path), 40 sentences read in a row | 7.2 % | 14× real time |
| French, model alone, 120 sentences | 9.6 % | 5× real time |
| English, model alone, 120 sentences | 11.3 % | 5× real time |

The installer is limited to 500 MB, which rules out Parakeet TDT v3 (8.95 % / 8.26 %, 450 MB). The other candidates are
compared in `scripts/speech-model.py`.

The model files (390 MB) are not in git. Build them once before `npm run dist`; the script downloads the exports,
quantises the Arabic encoder and checks every file against the shipped checksums:

```bash
py -3.11 -m venv .venv && .venv\Scripts\pip install onnx onnxruntime==1.31.0
.venv\Scripts\python -I scripts/speech-model.py
```

The first build also downloads sherpa-onnx's static Windows libraries (built with `/MT`, hence
`src-tauri/.cargo/config.toml` linking the C runtime statically).

## Tests

```bash
npm test                          # direction, password rule, dates, import/export conversion
cd src-tauri && cargo test --lib  # crypto, vault, accounts, recovery, search, throttling, zip

# Dictation on real recordings (16 kHz WAVs, comma-separated; TADWEEN_SPEECH_LANG is ar, fr or en), and the default microphone:
TADWEEN_SPEECH_DIR=resources/speech TADWEEN_SPEECH_LANG=fr TADWEEN_SPEECH_WAVS=a.wav,b.wav cargo test --lib -- --ignored --nocapture
```

## Layout

```text
src-tauri/src/
  crypto.rs      Argon2id, XChaCha20-Poly1305 (bound to a context), recovery keys
  accounts.rs    one vault per username, legacy vault adoption, UI preferences
  vault.rs       files on disk, the unlocked session, notes, folders, attachments, search
  transfer.rs    reading imports (folders, zips) and writing export archives
  text.rs        password rule, Arabic/Latin search folding, previews
  dictation.rs   microphone, voice activity, speech recognition in three languages
  lib.rs         Tauri commands, unlock throttling, auto-lock, window sizing
src-tauri/resources/speech/      the dictation models, ar/ and latin/ (built by scripts/speech-model.py)
src-tauri/installer/
  installer.nsi  the installer template with the brand colours and copy
  *.bmp          installer art (rendered from brand/installer/art.html)
src/
  features/onboarding   first run: language, look, privacy, account, recovery key, name, greeting
  features/login        sign-in, the cast and the eight login backgrounds
  features/home         home: the drawn scene, clock and greeting
  features/pages        all pages: timeline, sheets and contents
  features/calendar     calendar and daily journal
  features/editor       editor, block direction, slash menu, toolbars, PDF, columns, properties, dictation
  features/shell        sidebar, top bar, search, settings, trash
  features/tour         first-run tours
  i18n                  en, fr, ar
  styles                brand tokens and components
brand/                  Tadween mark, app icon and installer art sources
docs/screenshots/       the images in this README
```

## On disk

```text
%APPDATA%\com.tadween.app\
  prefs.json                 plaintext: interface language, theme, login background, last username
  accounts\<hash>\           one vault per account
    vault.json               KDF parameters, salts, the data key wrapped by the password and by the recovery key
    index.tdw                encrypted: username, display name, folders, settings
    notes\<id>.tdw           encrypted: one file per page
    attachments\<id>.tdw     encrypted: PDFs
```

Each encrypted file is bound to its name, so swapping two files is detected and refused.
After 3 wrong passwords, each new attempt waits 1, 2, 4 … up to 60 seconds.

## Brand

Colours, type and rules come from the brand identity: paper, ink, lapis and one ember spark;
Readex Pro for the interface and writing, Markazi Text for titles, JetBrains Mono for labels;
square corners, hairlines instead of shadows. The Tadween mark follows the same grammar
(64-unit grid, 5.5 monoline stroke) but is its own sign: two lines of writing ending in a ن,
the last letter of تدوين, whose dot is the ember. The developer's YC mark appears only in About.

Flags: [flag-icons](https://github.com/lipis/flag-icons) (MIT).
