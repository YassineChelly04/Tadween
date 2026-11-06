import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { Check, ChevronUp, Mic } from 'lucide-react';
import { Flag } from '../../components/Flag';
import { LANGUAGES } from '../../i18n';
import type { Language } from '../../lib/api';
import { useDismiss } from '../../lib/useDismiss';
import { useApp } from '../../store';
import { useDictation } from './useDictation';

/** Ctrl+Shift+D starts or stops dictation; Esc stops it. */
const DICTATION_SHORTCUT = 'Ctrl Shift D';

/** The language dictation listens for, which the writer can change at any time. */
function useLanguage(): Language {
  const chosen = useDictation((s) => s.chosen);
  const interfaceLanguage = useApp((s) => s.prefs.language);
  return chosen ?? interfaceLanguage;
}

/**
 * The band at the foot of every page. At rest it says what it does, in words:
 * a microphone, "Dictate", the language spoken and the shortcut, so nobody has
 * to go looking. While dictation runs it becomes the voice drawn as a hairline
 * signal, a node on the line for every phrase written into the page, and the
 * ember dot where the signal is now.
 */
export function DictationBar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const phase = useDictation((s) => s.phase);
  const language = useLanguage();
  const hearing = useDictation((s) => s.hearing);
  const startedAt = useDictation((s) => s.startedAt);
  const toggle = useDictation((s) => s.toggle);
  const stop = useDictation((s) => s.stop);
  const prepare = useDictation((s) => s.prepare);

  useEffect(() => {
    const { attach, detach } = useDictation.getState();
    attach(editor);
    return () => detach(editor);
  }, [editor]);

  // Capture phase: the editor handles Esc itself. An open menu or dialog keeps
  // its Esc; otherwise Esc ends the dictation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && !e.altKey && e.code === 'KeyD') {
        e.preventDefault();
        toggle();
      } else if (
        e.key === 'Escape' &&
        useDictation.getState().phase !== 'idle' &&
        !document.querySelector('.menu, [role="dialog"], [role="menu"]')
      ) {
        e.preventDefault();
        e.stopPropagation();
        stop();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [toggle, stop]);

  if (phase === 'idle') {
    return (
      <div className="dictation-bar" data-tour="page-dictation">
        <button className="dictation-start" onPointerEnter={prepare} onFocus={prepare} onClick={toggle}>
          <Mic size={16} strokeWidth={1.75} />
          {t('dictation.start')}
        </button>
        <LanguageChoice value={language} />
        <kbd className="dictation-keys">{DICTATION_SHORTCUT}</kbd>
      </div>
    );
  }

  const state =
    phase === 'starting'
      ? t('dictation.preparing')
      : phase === 'stopping'
        ? t('dictation.finishing')
        : hearing
          ? t('dictation.writing')
          : t('dictation.listening');

  return (
    <div className="dictation-strip" role="status" aria-live="polite" data-phase={phase}>
      <span className="t-label dictation-name">
        {t('dictation.title')}
        <span aria-hidden="true"> · </span>
        <span lang={language}>{t(`languages.${language}`)}</span>
      </span>
      <span className="t-label dictation-state">{state}</span>
      <Signal />
      <Clock startedAt={startedAt} />
      <button className="t-label dictation-stop" onClick={stop} disabled={phase === 'stopping'}>
        {t('dictation.stop')} <kbd>Esc</kbd>
      </button>
    </div>
  );
}

function Signal() {
  const levels = useDictation((s) => s.levels);
  const marks = useDictation((s) => s.marks);
  const ticks = useDictation((s) => s.ticks);
  const n = levels.length;
  // Alternate above and below the rule, like a trace on a scope.
  const points = levels.map((v, i) => `${i},${14 - v * 12 * (i % 2 ? 1 : -1)}`).join(' ');
  const now = levels[n - 1] ?? 0;
  return (
    <span className="dictation-signal" aria-hidden="true">
      <svg viewBox={`0 0 ${n - 1} 28`} preserveAspectRatio="none">
        <line x1="0" y1="14" x2={n - 1} y2="14" className="dictation-rule" vectorEffect="non-scaling-stroke" />
        <polyline points={points} className="dictation-trace" vectorEffect="non-scaling-stroke" />
      </svg>
      {marks.map((m) => (
        <i key={m} className="dictation-node" style={{ left: `${((m - (ticks - n)) / (n - 1)) * 100}%` }} />
      ))}
      <i className="dictation-now" style={{ transform: `translate(50%, calc(-50% - ${now * 6}px))` }} />
    </span>
  );
}

function Clock({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const seconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return <span className="t-label dictation-clock">{`${mm}:${ss}`}</span>;
}

/** Which language is being spoken, opening upward from the foot of the page. */
function LanguageChoice({ value }: { value: Language }) {
  const { t } = useTranslation();
  const setLanguage = useDictation((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        className="dictation-language"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('dictation.language')}: ${t(`languages.${value}`)}`}
        title={t('dictation.language')}
        onClick={() => setOpen((o) => !o)}
      >
        <Flag lang={value} size={16} />
        <span lang={value}>{t(`languages.${value}`)}</span>
        <ChevronUp size={13} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="menu dictation-menu" role="menu">
          <div className="menu-label t-label">{t('dictation.language')}</div>
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              role="menuitemradio"
              aria-checked={value === lang}
              className="menu-item"
              onClick={() => {
                setLanguage(lang);
                close();
              }}
            >
              <Flag lang={lang} size={16} />
              <span className="grow" lang={lang}>
                {t(`languages.${lang}`)}
              </span>
              {value === lang && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
