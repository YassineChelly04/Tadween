import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { LANGUAGES } from '../i18n';
import { useApp } from '../store';
import type { Language } from '../lib/api';
import { Flag } from './Flag';

/** Large rows, used in onboarding and settings. */
export function LanguageList({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const language = useApp((s) => s.prefs.language);
  const setPrefs = useApp((s) => s.setPrefs);

  return (
    <div className={compact ? 'lang-list compact' : 'lang-list'} role="radiogroup" aria-label={t('settings.language')}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          role="radio"
          aria-checked={language === lang}
          className="lang-row"
          onClick={() => void setPrefs({ language: lang })}
        >
          <Flag lang={lang} size={compact ? 22 : 28} />
          <span className="lang-name" lang={lang}>
            {t(`languages.${lang}`)}
          </span>
          <span className="lang-check">{language === lang && <Check size={16} strokeWidth={2} />}</span>
        </button>
      ))}
    </div>
  );
}

/** A flag button with a small menu, used on the login screen. */
export function LanguageMenu() {
  const { t } = useTranslation();
  const language = useApp((s) => s.prefs.language);
  const setPrefs = useApp((s) => s.setPrefs);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (lang: Language) => {
    setOpen(false);
    void setPrefs({ language: lang });
  };

  return (
    <div className="lang-menu" ref={ref}>
      <button className="lang-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Flag lang={language} size={18} />
        <span lang={language}>{t(`languages.${language}`)}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu lang-dropdown" role="menu">
          {LANGUAGES.map((lang) => (
            <button key={lang} role="menuitemradio" aria-checked={language === lang} className="menu-item" onClick={() => pick(lang)}>
              <Flag lang={lang} size={18} />
              <span lang={lang} style={{ flex: 1 }}>
                {t(`languages.${lang}`)}
              </span>
              {language === lang && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
