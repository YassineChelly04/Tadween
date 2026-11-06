import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../store';
import { useLook } from '../../lib/look';
import type { CastMember } from '../../components/Cast';
import { formatDay, hijriDate, isoDate, journalDays, onThisDay } from '../../lib/dates';
import { skyAt } from '../../lib/sky';
import { TopBar } from '../shell/TopBar';
import { openJournal, openTodayJournal } from '../calendar/journal';
import { Clock } from './Clock';
import { Scene } from './Scene';

// Home is a place to arrive at, with nothing to manage: a terrace over the gulf
// that follows the real hour, a clock, someone who says hello and asks one
// gentle question. Pages live in All pages, and the numbers in the Calendar.

/** A few days without writing, and Home says welcome back. */
const AWAY_DAYS = 3;

export type Moment = 'morning' | 'afternoon' | 'evening' | 'night' | 'away';

const isLate = (hour: number) => hour >= 23 || hour < 5;

export function momentAt(hour: number, daysAway: number): Moment {
  if (daysAway >= AWAY_DAYS) return 'away';
  if (isLate(hour)) return 'night';
  if (hour < 12) return 'morning';
  return hour < 18 ? 'afternoon' : 'evening';
}

/** The sky changes slowly, so Home only looks at the time once a minute. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Home() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const notes = useApp((s) => s.notes);
  const name = useApp((s) => s.displayName || s.username);
  const open = useApp((s) => s.open);
  const now = useMinute();
  const dark = useLook() === 'night';
  const [said, setSaid] = useState<string | null>(null);

  const live = useMemo(() => notes.filter((n) => !n.trashedAt), [notes]);
  const last = useMemo(() => [...live].sort((a, b) => b.updatedAt - a.updatedAt)[0], [live]);
  const today = isoDate(now);
  const memory = useMemo(() => onThisDay(live, today), [live, today]);
  const wroteToday = journalDays(live).has(today);

  const hour = now.getHours();
  const daysAway = last ? (now.getTime() - last.updatedAt) / 86_400_000 : 0;
  const moment = momentAt(hour, daysAway);
  const asleep = isLate(hour);
  const greeting = t(`home.hello.${moment}`, { name });
  // Dark mode has its own deeper print of the scene, so it never glares.
  const sky = dark ? 'deep' : skyAt(hour);

  // The window buttons live outside Home, so they ask for the sky's colours here.
  useEffect(() => {
    document.documentElement.dataset.homeSky = sky;
    return () => void delete document.documentElement.dataset.homeSky;
  }, [sky]);

  const onCast = (who: CastMember) => setSaid(t(asleep ? 'home.cast.asleep' : `home.cast.${who}`));

  return (
    <div className="page home" data-sky={sky}>
      <Scene now={now} asleep={asleep} onCast={onCast} />
      <div className="home-top">
        <TopBar />
      </div>
      <div className="home-talk">
        <Clock lang={lang} />
        <p className="t-label home-date">
          {formatDay(today, lang)} · {hijriDate(now, lang)}
        </p>
        <h1 className="home-hello" dir="auto">
          {greeting}
          {!/[?؟]$/.test(greeting) && <span className="full-stop" aria-hidden="true" />}
        </h1>
        <p className="home-warm">{t(`home.warm.${moment}`)}</p>
        <button className="home-ask" onClick={() => void openTodayJournal()}>
          {wroteToday ? t('home.askMore') : t(`home.ask.${moment}`)}
        </button>
        {memory && (
          <button className="home-memory" onClick={() => void openJournal(memory.day)}>
            <span className="t-label">{t(`home.ago.${memory.ago}`)}</span>
            <q dir="auto">{memory.note.preview}</q>
          </button>
        )}
        {last && (
          <button className="home-last" onClick={() => open({ kind: 'page', id: last.id })}>
            {t('home.continue')} <b dir="auto">{last.title || t('page.untitled')}</b>
          </button>
        )}
        <p className="home-say" aria-live="polite">
          {said}
        </p>
      </div>
    </div>
  );
}
