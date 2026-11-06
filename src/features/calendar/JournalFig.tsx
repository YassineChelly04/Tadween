import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { formatDay, isoDate, parseIso, todayIso } from '../../lib/dates';
import { openJournal, openTodayJournal } from './journal';

const DAYS = 30;

/** Fig. 01: the journal over the last 30 days, a node for each day on one hairline. */
export function JournalFig({ journal }: { journal: Set<string> }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = todayIso();
  const wroteToday = journal.has(today);

  const days = useMemo(() => {
    const d = parseIso(today);
    d.setDate(d.getDate() - DAYS);
    return Array.from({ length: DAYS }, () => {
      d.setDate(d.getDate() + 1);
      return isoDate(d);
    });
  }, [today]);
  const kept = days.filter((d) => journal.has(d)).length;
  const shortDate = (iso: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(parseIso(iso));

  return (
    <figure className="fig">
      <svg className="fig-svg" viewBox={`0 0 ${DAYS * 24} 44`} preserveAspectRatio="none" role="img" aria-label={t('home.figCaption')}>
        <line x1="12" y1="18" x2={DAYS * 24 - 12} y2="18" className="fig-rule" />
        {days.map((d, i) => {
          const x = 12 + i * 24;
          const wrote = journal.has(d);
          return (
            <g key={d} className="fig-node" onClick={() => void openJournal(d)}>
              <title>{`${formatDay(d, lang)} · ${wrote ? t('calendar.written') : t('calendar.notWritten')}`}</title>
              <rect x={x - 12} y="0" width="24" height="36" fill="transparent" />
              {d === today ? (
                <circle cx={x} cy="18" r="6.5" className={wrote ? 'node-today' : 'node-today-open'} />
              ) : wrote ? (
                <circle cx={x} cy="18" r="5" className="node-kept" />
              ) : (
                <circle cx={x} cy="18" r="3.2" className="node-missed" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="fig-axis t-label">
        <span>{shortDate(days[0])}</span>
        <span>{shortDate(days[Math.floor(DAYS / 2)])}</span>
        <span>{t('calendar.today')}</span>
      </div>
      <figcaption className="fig-caption">
        <span className="t-label">{t('home.figCaption')}</span>
        <span className="fig-figure">
          {kept}
          <small> / {DAYS}</small>
        </span>
        <button className="text-action" onClick={() => void openTodayJournal()}>
          {wroteToday ? t('home.openJournal') : t('home.writeJournal')}
          <ArrowUpRight size={14} strokeWidth={1.75} />
        </button>
      </figcaption>
    </figure>
  );
}
