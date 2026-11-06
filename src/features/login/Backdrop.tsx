import { useTranslation } from 'react-i18next';
import { useApp } from '../../store';
import { useLook, type Look } from '../../lib/look';

// The eight drawings behind the cast on the login screen. Each one is quieter
// than Home's terrace: flat brand colours, hairlines, no gradients, and at most
// one small ember spark. Every drawing has its own palette for each look, and
// the sky changes what it shows: a crescent at night, a low sun on warm paper,
// a high sun on white paper.
//
// The canvas is 800 × 1000 and is cropped from the bottom centre, so the ground
// stays under the cast at any window size. The cast fills the lower half, and
// the wordmark sits top left, so each drawing keeps its weight to the upper
// right or low behind the characters.

export const BACKDROPS = ['mark', 'lines', 'sky', 'arches', 'dunes', 'zellige', 'medina', 'door'] as const;
export type BackdropId = (typeof BACKDROPS)[number];

export interface Palette {
  /** Behind everything. Must stay readable under the wordmark and the hint. */
  ground: string;
  /** The drawing itself. */
  shape: string;
  /** Hairlines and small marks. */
  line: string;
  /** The one spark. */
  spark: string;
}

export const PALETTES: Record<BackdropId, Record<Look, Palette>> = {
  mark: {
    day: { ground: '#E9ECF6', shape: '#D9DEEF', line: '#1F2F7A', spark: '#E8501A' },
    light: { ground: '#DDE1EF', shape: '#CCD2E6', line: '#1F2F7A', spark: '#E8501A' },
    night: { ground: '#1A2149', shape: '#252E5C', line: '#9DB0F5', spark: '#FF7A45' },
  },
  lines: {
    day: { ground: '#FFFFFF', shape: '#E1E6F3', line: '#B9C4E3', spark: '#E8501A' },
    light: { ground: '#F8F3EA', shape: '#E9E1D3', line: '#CFC5B4', spark: '#E8501A' },
    night: { ground: '#171513', shape: '#25221F', line: '#3E3934', spark: '#FF7A45' },
  },
  sky: {
    day: { ground: '#DCE7EE', shape: '#FFFFFF', line: '#FFFFFF', spark: '#E8501A' },
    light: { ground: '#EFE4D3', shape: '#E2C9AC', line: '#D5BE9F', spark: '#E8501A' },
    night: { ground: '#0D1128', shape: '#F4EFE6', line: '#9DB0F5', spark: '#FF7A45' },
  },
  arches: {
    day: { ground: '#F6F5F2', shape: '#1F2F7A', line: '#1F2F7A', spark: '#E8501A' },
    light: { ground: '#EDE5D7', shape: '#8E6B45', line: '#8E6B45', spark: '#E8501A' },
    night: { ground: '#121017', shape: '#5A6FD0', line: '#9DB0F5', spark: '#FF7A45' },
  },
  dunes: {
    day: { ground: '#FBFAF7', shape: '#B99F74', line: '#A2865A', spark: '#E8501A' },
    light: { ground: '#F4EFE6', shape: '#B4895A', line: '#A2865A', spark: '#E8501A' },
    night: { ground: '#10142E', shape: '#6175D6', line: '#9DB0F5', spark: '#FF7A45' },
  },
  zellige: {
    day: { ground: '#F7FAFA', shape: '#D3E4E8', line: '#2B6474', spark: '#E8501A' },
    light: { ground: '#E7EBE3', shape: '#CBD6CB', line: '#2B6474', spark: '#E8501A' },
    night: { ground: '#0E2329', shape: '#1B3B44', line: '#7DBCCB', spark: '#FF7A45' },
  },
  medina: {
    day: { ground: '#E4EAF5', shape: '#FFFFFF', line: '#CBD5E8', spark: '#E8501A' },
    light: { ground: '#E9DCC6', shape: '#F8F3EA', line: '#D6C6AB', spark: '#E8501A' },
    night: { ground: '#0D1128', shape: '#1E2652', line: '#2B3568', spark: '#FF7A45' },
  },
  door: {
    day: { ground: '#FBFAF7', shape: '#C5D6E6', line: '#1F2F7A', spark: '#E8501A' },
    light: { ground: '#EAE3D6', shape: '#AFC6D2', line: '#1F2F7A', spark: '#E8501A' },
    night: { ground: '#141210', shape: '#1F2C6E', line: '#9DB0F5', spark: '#FF7A45' },
  },
};

export function backdropOf(value: string | undefined | null): BackdropId {
  return BACKDROPS.includes(value as BackdropId) ? (value as BackdropId) : 'mark';
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

/** Corners of an eight-pointed star, the zellige's unit. */
function star(cx: number, cy: number, r: number) {
  const inner = r * 0.7654;
  const points = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const reach = i % 2 ? inner : r;
    return `${round(cx + Math.cos(angle) * reach)} ${round(cy + Math.sin(angle) * reach)}`;
  });
  return `M${points.join('L')}Z`;
}

/** A horseshoe arch standing on the bottom edge. */
function arch(w: number, top: number) {
  const cy = top + w;
  return `M${round(400 - w * 0.86)} 1000V${round(cy + w * 0.5)}A${w} ${w} 0 1 1 ${round(400 + w * 0.86)} ${round(cy + w * 0.5)}V1000Z`;
}

function Mark({ p }: { p: Palette }) {
  return (
    <g transform="translate(236 -124) scale(11.4)">
      <g fill="none" stroke={p.shape} strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M50 14H14" />
        <path d="M50 26H26" />
        <path d="M50 36C50 47.5 42 54 32 54C22 54 14 47.5 14 38" />
      </g>
      <circle cx="32" cy="35.5" r="3.6" fill={p.shape} />
    </g>
  );
}

/** A Seyès school copybook: heavy rules, three faint ones between, the red margin. */
function Lines({ p }: { p: Palette }) {
  const rows = Array.from({ length: 56 }, (_, i) => i * 24);
  return (
    <g>
      {rows.map((y) => (
        <rect key={y} x="0" y={y + 12} width="800" height={y % 96 === 0 ? 2 : 1} fill={y % 96 === 0 ? p.line : p.shape} />
      ))}
      <rect x="108" y="0" width="2" height="1000" fill={p.spark} opacity="0.55" />
      <circle cx="148" cy="204" r="6" fill={p.spark} />
    </g>
  );
}

function Sky({ p, look }: { p: Palette; look: Look }) {
  if (look === 'night') {
    const stars: [number, number, number][] = [
      [140, 250, 2],
      [292, 150, 1.5],
      [356, 322, 2.5],
      [468, 92, 2],
      [214, 420, 1.5],
      [724, 118, 1.5],
      [742, 470, 2],
      [470, 470, 1.5],
    ];
    return (
      <g>
        <path d="M560 150A150 150 0 1 0 693.8 368.1A128 128 0 1 1 560 150Z" fill={p.shape} />
        {stars.map(([x, y, r]) => (
          <circle key={x} cx={x} cy={y} r={r} fill={p.line} />
        ))}
      </g>
    );
  }
  if (look === 'light') {
    return (
      <g>
        <circle cx="400" cy="660" r="300" fill={p.shape} />
        <rect x="-40" y="430" width="300" height="20" rx="10" fill={p.line} />
        <rect x="520" y="310" width="340" height="20" rx="10" fill={p.line} />
        <rect x="620" y="360" width="180" height="20" rx="10" fill={p.line} />
      </g>
    );
  }
  return (
    <g>
      <circle cx="590" cy="280" r="150" fill={p.shape} />
      <rect x="-40" y="396" width="360" height="26" rx="13" fill={p.line} />
      <rect x="110" y="456" width="240" height="26" rx="13" fill={p.line} />
      <rect x="500" y="520" width="380" height="26" rx="13" fill={p.line} />
    </g>
  );
}

function Arches({ p, look }: { p: Palette; look: Look }) {
  const steps = look === 'night' ? [0.12, 0.12, 0.14, 0.16] : [0.06, 0.07, 0.08, 0.1];
  return (
    <g>
      {[
        { w: 372, top: 110 },
        { w: 300, top: 214 },
        { w: 230, top: 318 },
        { w: 160, top: 422 },
      ].map(({ w, top }, i) => (
        <path key={w} d={arch(w, top)} fill={p.shape} fillOpacity={steps[i]} />
      ))}
    </g>
  );
}

function Dunes({ p, look }: { p: Palette; look: Look }) {
  const steps = look === 'night' ? [0.14, 0.18, 0.24] : [0.16, 0.2, 0.26];
  return (
    <g>
      <circle cx="610" cy="330" r="7" fill={p.spark} />
      <path d="M0 610C150 530 290 520 450 590S700 680 800 610V1000H0Z" fill={p.shape} fillOpacity={steps[0]} />
      <path d="M0 740C140 680 270 660 430 725S680 820 800 745V1000H0Z" fill={p.shape} fillOpacity={steps[1]} />
      <path d="M0 860C180 800 340 835 500 865S720 915 800 870V1000H0Z" fill={p.shape} fillOpacity={steps[2]} />
    </g>
  );
}

/** Stars that dissolve away from the upper right corner, one of them filled. */
function Zellige({ p }: { p: Palette }) {
  const size = 104;
  const tiles: { x: number; y: number; o: number }[] = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      const x = col * size;
      const y = row * size;
      const away = Math.hypot(800 - x, y) / 880;
      const o = Math.round((1 - away) * 8) / 8;
      if (o > 0) tiles.push({ x, y, o });
    }
  }
  return (
    <g>
      <path d={star(624, 208, size / 2)} fill={p.shape} />
      {tiles.map(({ x, y, o }) => (
        <path key={`${x}-${y}`} d={star(x, y, size / 2)} fill="none" stroke={p.line} strokeWidth="1.25" strokeOpacity={o * 0.5} />
      ))}
      <circle cx="624" cy="208" r="5" fill={p.spark} />
    </g>
  );
}

/** White houses climbing a hill to a minaret: two flat layers, one lit window. */
function Medina({ p }: { p: Palette }) {
  // x, width, top of each house, left to right up the hill.
  const far: [number, number, number][] = [
    [300, 60, 760],
    [352, 74, 716],
    [418, 58, 676],
    [468, 80, 628],
    [540, 64, 590],
    [596, 88, 548],
    [676, 70, 512],
    [738, 90, 476],
  ];
  const near: [number, number, number][] = [
    [-10, 120, 880],
    [104, 78, 846],
    [176, 100, 812],
    [270, 70, 852],
    [334, 92, 790],
    [420, 66, 824],
    [480, 96, 744],
    [570, 72, 700],
    [636, 104, 650],
    [734, 90, 604],
  ];
  const window = (x: number, y: number) => <path key={x} d={`M${x} ${y + 26}V${y + 8}A7 7 0 0 1 ${x + 14} ${y + 8}V${y + 26}Z`} fill={p.line} />;
  return (
    <g>
      <rect x="610" y="298" width="46" height="260" fill={p.line} />
      <rect x="622" y="264" width="22" height="36" fill={p.line} />
      <path d="M622 264A11 11 0 0 1 644 264Z" fill={p.line} />
      {far.map(([x, w, top]) => (
        <rect key={x} x={x} y={top} width={w} height={1000 - top} fill={p.line} />
      ))}
      <path d="M490 628A42 42 0 0 1 574 628Z" fill={p.line} transform="translate(-20 0)" />
      {near.map(([x, w, top]) => (
        <rect key={x} x={x} y={top} width={w} height={1000 - top} fill={p.shape} />
      ))}
      <path d="M336 790A44 44 0 0 1 424 790Z" fill={p.shape} />
      <path d="M640 650A48 48 0 0 1 736 650Z" fill={p.shape} />
      {window(208, 838)}
      {window(372, 820)}
      {window(516, 776)}
      {window(762, 640)}
      <path d="M690 700V682A7 7 0 0 1 704 682V700Z" fill={p.spark} />
    </g>
  );
}

/** A Sidi Bou Said door: an arch, its rows of studs, one knocker. */
function Door({ p }: { p: Palette }) {
  const left = 196;
  const right = 604;
  const spring = 430;
  const inset = 28;
  const reach = (right - left) / 2 - inset;
  const studs: [number, number][] = [];
  // Round the arch, then down both sides.
  for (let i = 0; i <= 14; i++) {
    const a = Math.PI + (i * Math.PI) / 14;
    studs.push([400 + Math.cos(a) * reach, spring + Math.sin(a) * reach]);
  }
  for (let y = spring + 38; y < 1000; y += 38) {
    studs.push([400 - reach, y], [400 + reach, y]);
  }
  // A diamond of studs high on the door, above the cast.
  for (let row = -3; row <= 3; row++) {
    const span = 3 - Math.abs(row);
    for (let col = -span; col <= span; col += 2) {
      studs.push([400 + col * 30, 420 + row * 30]);
    }
  }
  const outline = `M${left} 1000V${spring}A${(right - left) / 2} ${(right - left) / 2} 0 0 1 ${right} ${spring}V1000`;
  return (
    <g>
      <path d={`${outline}Z`} fill={p.shape} />
      <rect x="399.25" y={spring - (right - left) / 2} width="1.5" height="800" fill={p.line} fillOpacity="0.28" />
      {studs.map(([x, y]) => (
        <circle key={`${round(x)}-${round(y)}`} cx={round(x)} cy={round(y)} r="3.6" fill={p.line} fillOpacity="0.55" />
      ))}
      <circle cx="442" cy="566" r="8" fill={p.spark} />
    </g>
  );
}

const DRAWINGS: Record<BackdropId, (props: { p: Palette; look: Look }) => React.JSX.Element> = {
  mark: Mark,
  lines: Lines,
  sky: Sky,
  arches: Arches,
  dunes: Dunes,
  zellige: Zellige,
  medina: Medina,
  door: Door,
};

export function Backdrop({ id, className = 'login-backdrop' }: { id: string | undefined; className?: string }) {
  const look = useLook();
  const which = backdropOf(id);
  const palette = PALETTES[which][look];
  const Drawing = DRAWINGS[which];
  return (
    <svg className={className} data-backdrop={which} viewBox="0 0 800 1000" preserveAspectRatio="xMidYMax slice" style={{ background: palette.ground }} aria-hidden="true">
      <Drawing p={palette} look={look} />
    </svg>
  );
}

export function BackdropPicker() {
  const { t } = useTranslation();
  const current = useApp((s) => backdropOf(s.prefs.loginBackdrop));
  const setPrefs = useApp((s) => s.setPrefs);
  return (
    <div className="backdrop-picker" role="radiogroup" aria-label={t('settings.backdrop')}>
      {BACKDROPS.map((id) => (
        <button key={id} role="radio" aria-checked={current === id} className="theme-card" onClick={() => void setPrefs({ loginBackdrop: id })}>
          <Backdrop id={id} className="backdrop-preview" />
          <span className="theme-name">{t(`settings.backdrops.${id}`)}</span>
        </button>
      ))}
    </div>
  );
}
