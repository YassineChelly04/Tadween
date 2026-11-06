import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fold } from '../../lib/fold';
import { useDismiss } from '../../lib/useDismiss';
import { Glyph } from './PageIcon';
import { ICONS, ICON_COLOURS, parseIcon, type IconColour } from './set';

/**
 * The page icon picker: a filter, the set on a hairline grid drawn in the
 * chosen colour, and the eight colours as a row of squares.
 */
export function IconPicker({ value, onChange, onClose }: { value: string | null; onChange: (v: string | null) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const current = parseIcon(value);
  const [colour, setColour] = useState<IconColour>(current?.colour ?? 'ink');
  const [query, setQuery] = useState('');

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return q ? ICONS.filter((i) => fold(`${i.id} ${i.words}`).includes(q)) : ICONS;
  }, [query]);

  const pickColour = (c: IconColour) => {
    setColour(c);
    if (current) onChange(`${current.def.id}:${c}`);
  };

  return (
    <div ref={ref} className="icon-picker" role="dialog" aria-label={t('icons.title')}>
      <div className="icon-picker-head">
        <input
          autoFocus
          dir="auto"
          value={query}
          placeholder={t('icons.filter')}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && shown[0]) {
              onChange(`${shown[0].id}:${colour}`);
              onClose();
            }
          }}
        />
        {current && (
          <button
            className="text-tab t-label"
            onClick={() => {
              onChange(null);
              onClose();
            }}
          >
            {t('icons.remove')}
          </button>
        )}
      </div>

      <div className="icon-colours" role="radiogroup" aria-label={t('icons.colour')}>
        {ICON_COLOURS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={colour === c}
            aria-label={t(`icons.colours.${c}`)}
            title={t(`icons.colours.${c}`)}
            className="icon-swatch"
            style={{ background: `var(--icon-${c})` }}
            onClick={() => pickColour(c)}
          />
        ))}
      </div>

      <div className="icon-grid">
        {shown.map((i) => (
          <button
            key={i.id}
            className="icon-cell"
            aria-pressed={current?.def.id === i.id}
            title={i.id}
            onClick={() => {
              onChange(`${i.id}:${colour}`);
              onClose();
            }}
          >
            <Glyph def={i} colour={colour} size={22} />
          </button>
        ))}
        {!shown.length && <p className="icon-empty">{t('find.noResults', { q: query })}</p>}
      </div>
      <p className="icon-foot t-label">{t('icons.count', { count: ICONS.length })}</p>
    </div>
  );
}
