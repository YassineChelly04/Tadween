// Each block of writing takes its direction from its own text. The layout around
// it follows the language: Arabic runs the whole app right to left.

export type Dir = 'ltr' | 'rtl';

// Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Arabic supplements and presentation forms.
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/u;
const STRONG = /[\p{L}]/u;

/** Direction of the first strongly-directional character, or null if there is none. */
export function detectDir(text: string): Dir | null {
  for (const ch of text) {
    if (RTL.test(ch)) return 'rtl';
    if (STRONG.test(ch)) return 'ltr';
  }
  return null;
}

/**
 * The direction of the layout. The login screen keeps its composition in every
 * language: only its writing moves, in login.css.
 */
export function layoutDir(language: string, phase: string): Dir {
  return language === 'ar' && phase !== 'locked' ? 'rtl' : 'ltr';
}
