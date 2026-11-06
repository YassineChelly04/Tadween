const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "2 minutes ago", "il y a 2 minutes", "قبل دقيقتين". */
export function relativeTime(ms: number, lang: string, now = Date.now()): string {
  const seconds = Math.round((ms - now) / 1000);
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return fmt.format(Math.round(seconds / size), unit);
  }
  return fmt.format(0, 'second');
}
