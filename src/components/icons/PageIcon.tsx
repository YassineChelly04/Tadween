import { useId, type CSSProperties } from 'react';
import { parseIcon, type IconColour, type IconDef } from './set';

const STROKE = { strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/**
 * One icon of the set, stamped in `colour` (a `--icon-*` token). The icon is a
 * mask over a solid square, so its cuts are real holes that show whatever is
 * behind the icon. The ember dot sits in a small hole of its own; on an ember
 * icon it turns ink, or it would vanish.
 */
export function Glyph({ def, colour, size = 16, className }: { def: IconDef; colour: IconColour; size?: number; className?: string }) {
  const mask = `stamp${useId().replace(/\W/g, '')}`;
  const [cx, cy, r] = def.dot;
  return (
    <svg className={className} style={{ color: `var(--icon-${colour})` } as CSSProperties} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        {def.shape && <path d={def.shape} fill="#fff" />}
        {def.line && <path d={def.line} stroke="#fff" strokeWidth={1.8} {...STROKE} />}
        {def.hole && <path d={def.hole} fill="#000" />}
        {def.cut && <path d={def.cut} stroke="#000" strokeWidth={1.5} {...STROKE} />}
        <circle cx={cx} cy={cy} r={r + 0.7} fill="#000" />
      </mask>
      <rect width="24" height="24" fill="currentColor" mask={`url(#${mask})`} />
      <circle cx={cx} cy={cy} r={r} fill={colour === 'ember' ? 'var(--ink)' : 'var(--icon-ember)'} />
    </svg>
  );
}

/** A page's icon (`name:colour`), or nothing when the page has none. */
export function PageIcon({ value, size = 16, className }: { value: string | null | undefined; size?: number; className?: string }) {
  const icon = parseIcon(value);
  if (!icon) return null;
  return <Glyph def={icon.def} colour={icon.colour} size={size} className={className} />;
}
