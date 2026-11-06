import { useEffect, useState } from 'react';
import { useApp } from '../store';
import type { Theme } from './api';

/** The three looks the app can be showing. `system` always lands on one of them. */
export type Look = 'day' | 'light' | 'night';

export function lookOf(theme: Theme, systemDark: boolean): Look {
  if (theme === 'day' || theme === 'light') return theme;
  return theme === 'dark' || systemDark ? 'night' : 'light';
}

/** The look showing now, following Windows when the theme is `system`. */
export function useLook(): Look {
  const theme = useApp((s) => s.prefs.theme);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return lookOf(theme, systemDark);
}
