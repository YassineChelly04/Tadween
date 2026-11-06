import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isoDate, monthGrid, parseIso, todayIso, weekdayNames } from '../lib/dates';

interface Props {
  value: string | null;
  onChange: (iso: string | null) => void;
}

export function DatePicker({ value, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const start = value ? parseIso(value) : new Date();
  const [cursor, setCursor] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const days = monthGrid(cursor.y, cursor.m);
  const today = todayIso();
  const title = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date(cursor.y, cursor.m, 1));
  const shift = (delta: number) => {
    const d = new Date(cursor.y, cursor.m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="datepicker">
      <div className="dp-head">
        <span className="dp-title">{title}</span>
        <button type="button" className="icon-btn sm" aria-label={t('calendar.previous')} onClick={() => shift(-1)}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" className="icon-btn sm" aria-label={t('calendar.next')} onClick={() => shift(1)}>
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="dp-grid">
        {weekdayNames(i18n.language, 'narrow').map((d, i) => (
          <span key={i} className="dp-weekday">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const iso = isoDate(d);
          return (
            <button
              key={iso}
              type="button"
              className="dp-day"
              data-out={d.getMonth() !== cursor.m}
              data-today={iso === today}
              aria-pressed={iso === value}
              onClick={() => onChange(iso)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
      <div className="dp-foot">
        <button type="button" className="btn-link" onClick={() => onChange(today)}>
          {t('calendar.today')}
        </button>
        {value && (
          <button type="button" className="btn-link muted" onClick={() => onChange(null)}>
            {t('properties.clear')}
          </button>
        )}
      </div>
    </div>
  );
}
