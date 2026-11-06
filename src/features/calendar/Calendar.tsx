import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookHeart, ChevronLeft, ChevronRight, FileText, Plus } from 'lucide-react';
import { useApp } from '../../store';
import { formatDay, isoDate, journalDays, journalStreak, monthGrid, noteDay, parseIso, todayIso, weekdayNames } from '../../lib/dates';
import type { NoteSummary } from '../../lib/api';
import { TopBar } from '../shell/TopBar';
import { openJournal } from './journal';
import { JournalFig } from './JournalFig';

export function Calendar() {
  const { t, i18n } = useTranslation();
  const notes = useApp((s) => s.notes);
  const open = useApp((s) => s.open);
  const createNote = useApp((s) => s.createNote);
  const today = todayIso();
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [day, setDay] = useState(today);

  const live = useMemo(() => notes.filter((n) => !n.trashedAt), [notes]);
  const byDay = useMemo(() => {
    const map = new Map<string, NoteSummary[]>();
    for (const n of live) {
      const d = noteDay(n);
      map.set(d, [...(map.get(d) ?? []), n]);
    }
    return map;
  }, [live]);
  const journal = useMemo(() => journalDays(live), [live]);
  const streak = journalStreak(journal);
  const words = live.reduce((sum, n) => sum + n.words, 0);
  const firstDay = live.reduce((first, n) => Math.min(first, parseIso(noteDay(n)).getTime()), Date.now());
  const dayCount = Math.max(1, Math.round((parseIso(today).getTime() - firstDay) / 86_400_000) + 1);
  const num = (n: number) => n.toLocaleString(i18n.language === 'ar' ? 'en' : i18n.language);

  const grid = monthGrid(cursor.y, cursor.m);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const writtenThisMonth = [...journal].filter((d) => d.startsWith(monthPrefix)).length;
  const daysElapsed = (() => {
    const last = new Date(cursor.y, cursor.m + 1, 0).getDate();
    if (monthPrefix < today.slice(0, 7)) return last;
    if (monthPrefix > today.slice(0, 7)) return 0;
    return now.getDate();
  })();

  const title = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date(cursor.y, cursor.m, 1));
  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  const dayNotes = byDay.get(day) ?? [];
  const entry = dayNotes.find((n) => n.journal);
  const others = dayNotes.filter((n) => n !== entry);

  return (
    <div className="page">
      <TopBar>
        <span className="crumb crumb-current">{t('calendar.title')}</span>
      </TopBar>
      <div className="page-scroll">
        <div className="calendar">
          <section className="cal-main">
            <header className="cal-head">
              <h1 className="t-display cal-title">{title}</h1>
              <div className="cal-nav">
                <button className="icon-btn" aria-label={t('calendar.previous')} onClick={() => shift(-1)}>
                  <ChevronLeft size={18} strokeWidth={1.5} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setCursor({ y: now.getFullYear(), m: now.getMonth() });
                    setDay(today);
                  }}
                >
                  {t('calendar.today')}
                </button>
                <button className="icon-btn" aria-label={t('calendar.next')} onClick={() => shift(1)}>
                  <ChevronRight size={18} strokeWidth={1.5} />
                </button>
              </div>
            </header>

            <dl className="cal-stats">
              <div className="stat-streak">
                <dt className="t-label">{t('home.streak')}</dt>
                <dd>
                  {streak}
                  <small>{t('home.days', { count: streak })}</small>
                </dd>
              </div>
              <div>
                <dt className="t-label">{t('calendar.thisMonth')}</dt>
                <dd>
                  {writtenThisMonth}
                  <small>/ {daysElapsed}</small>
                </dd>
              </div>
              <div>
                <dt className="t-label">{t('calendar.pages')}</dt>
                <dd>{num(live.length)}</dd>
              </div>
              <div>
                <dt className="t-label">{t('calendar.words')}</dt>
                <dd>{num(words)}</dd>
              </div>
              <div>
                <dt className="t-label">{t('calendar.notebookDay')}</dt>
                <dd>{num(dayCount)}</dd>
              </div>
            </dl>

            <div className="cal-grid" role="grid">
              {weekdayNames(i18n.language).map((w, i) => (
                <div key={i} className="cal-weekday t-label">
                  {w}
                </div>
              ))}
              {grid.map((d) => {
                const iso = isoDate(d);
                const items = byDay.get(iso) ?? [];
                const wrote = journal.has(iso);
                const past = iso < today;
                const other = items.filter((n) => !n.journal);
                return (
                  <button
                    key={iso}
                    role="gridcell"
                    className="cal-day"
                    data-out={d.getMonth() !== cursor.m}
                    data-today={iso === today}
                    data-future={iso > today}
                    aria-selected={iso === day}
                    aria-label={`${formatDay(iso, i18n.language)}: ${wrote ? t('calendar.written') : t('calendar.notWritten')}`}
                    onClick={() => setDay(iso)}
                    onDoubleClick={() => void openJournal(iso)}
                  >
                    <span className="cal-num">{d.getDate()}</span>
                    <span className="cal-marks">
                      {wrote ? (
                        <span className="mark-journal" title={t('calendar.written')} />
                      ) : past ? (
                        <span className="mark-missed" title={t('calendar.notWritten')} />
                      ) : null}
                      {other.slice(0, 3).map((n) => (
                        <span key={n.id} className="mark-note" />
                      ))}
                      {other.length > 3 && <span className="mark-more">+{other.length - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="cal-legend t-label">
              <span>
                <span className="mark-journal" /> {t('calendar.written')}
              </span>
              <span>
                <span className="mark-missed" /> {t('calendar.notWritten')}
              </span>
              <span>
                <span className="mark-note" /> {t('calendar.otherPages')}
              </span>
            </div>

            <JournalFig journal={journal} />
          </section>

          <aside className="cal-side">
            <p className="t-label">{day === today ? t('calendar.today') : t('calendar.selected')}</p>
            <h2 className="cal-day-title">{formatDay(day, i18n.language)}</h2>

            <div className="cal-entry">
              {entry ? (
                <button className="cal-entry-card" onClick={() => open({ kind: 'page', id: entry.id })}>
                  <BookHeart size={18} strokeWidth={1.5} />
                  <span>
                    <strong dir="auto">{entry.title || t('page.untitled')}</strong>
                    <small dir="auto">{entry.preview || t('calendar.emptyEntry')}</small>
                  </span>
                </button>
              ) : (
                <button className="btn btn-lapis btn-block" disabled={day > today} onClick={() => void openJournal(day)}>
                  <BookHeart size={16} strokeWidth={1.5} />
                  {day === today ? t('home.writeJournal') : t('calendar.writeFor')}
                </button>
              )}
            </div>

            <div className="cal-pages">
              <p className="t-label">{t('calendar.pagesThatDay', { count: others.length })}</p>
              {others.length === 0 && <p className="t-muted cal-none">{t('calendar.none')}</p>}
              {others.map((n) => (
                <button key={n.id} className="side-row" onClick={() => open({ kind: 'page', id: n.id })}>
                  <FileText size={15} strokeWidth={1.5} className="side-icon" />
                  <span className="side-label" dir="auto">
                    {n.title || t('page.untitled')}
                  </span>
                </button>
              ))}
              <button className="side-row cal-add" onClick={() => void createNote({ date: day })}>
                <Plus size={15} strokeWidth={1.5} className="side-icon" />
                <span className="side-label">{t('calendar.newOnDay')}</span>
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
