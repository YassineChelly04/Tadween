import type { NoteSummary } from './api';

/** Local calendar date as YYYY-MM-DD (never UTC, so late-night entries stay on their day). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const todayIso = () => isoDate(new Date());

/** The day a note belongs to: its date property, else the day it was created. */
export function noteDay(n: Pick<NoteSummary, 'date' | 'createdAt'>): string {
  return n.date ?? isoDate(new Date(n.createdAt));
}

/** Six weeks of days covering `month`, starting on Monday. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

/** Weekday names, Monday first, in the interface language. */
export function weekdayNames(lang: string, style: 'narrow' | 'short' = 'short'): string[] {
  const fmt = new Intl.DateTimeFormat(lang, { weekday: style });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
}

export function formatDay(iso: string, lang: string, style: 'long' | 'medium' = 'long'): string {
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(lang, opts).format(parseIso(iso));
}

/** Days with at least one journal entry. */
export function journalDays(notes: NoteSummary[]): Set<string> {
  return new Set(notes.filter((n) => n.journal && !n.trashedAt).map(noteDay));
}

/** Consecutive days with a journal entry, ending today (or yesterday, if today is still open). */
export function journalStreak(days: Set<string>, today = new Date()): number {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!days.has(isoDate(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(isoDate(d))) {
    streak += 1;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** The Hijri date beside the everyday one, or nothing on a system without that calendar. */
export function hijriDate(date: Date, lang: string): string {
  const locale = lang === 'ar' ? 'ar-u-ca-islamic-umalqura-nu-latn' : `${lang}-u-ca-islamic-umalqura`;
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch {
    return '';
  }
}

export type Ago = 'year' | 'month' | 'week';

/** A journal entry with words in it, from a year, a month or a week before `today`. */
export function onThisDay(notes: NoteSummary[], today: string): { note: NoteSummary; ago: Ago; day: string } | null {
  const back = (ago: Ago): string => {
    const d = parseIso(today);
    if (ago === 'year') d.setFullYear(d.getFullYear() - 1);
    else if (ago === 'month') d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    return isoDate(d);
  };
  for (const ago of ['year', 'month', 'week'] as const) {
    const day = back(ago);
    const note = notes.find((n) => n.journal && !n.trashedAt && n.preview.trim() && noteDay(n) === day);
    if (note) return { note, ago, day };
  }
  return null;
}
