import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import fr from './fr.json';
import ar from './ar.json';
import type { Language } from '../lib/api';

export const LANGUAGES: Language[] = ['ar', 'fr', 'en'];

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr }, ar: { translation: ar } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnObjects: true,
});

/**
 * Switches the interface language. `lang` is set for correct shaping and
 * hyphenation; the direction of the layout depends on the screen too, so
 * `App` sets it (see `layoutDir`).
 */
export function applyLanguage(lang: Language) {
  document.documentElement.lang = lang;
  if (i18n.language !== lang) void i18n.changeLanguage(lang);
}

export default i18n;
