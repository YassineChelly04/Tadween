// Head-and-shoulders portraits of the Tadween cast, for the tour cards.
// Same shapes and colours as the login scene (features/login/Characters.tsx).

export type CastMember = 'qalam' | 'waraqa' | 'hibr' | 'noon' | 'nuqta';

export const CAST_NAMES: Record<CastMember, { latin: string; arabic: string }> = {
  qalam: { latin: 'Qalam', arabic: 'قلم' },
  waraqa: { latin: 'Waraqa', arabic: 'ورقة' },
  hibr: { latin: 'Hibr', arabic: 'حبر' },
  noon: { latin: 'Noon', arabic: 'ن' },
  nuqta: { latin: 'Nuqta', arabic: 'نقطة' },
};

function Eyes({ points, r, light = true, asleep = false }: { points: [number, number][]; r: number; light?: boolean; asleep?: boolean }) {
  if (asleep) {
    return (
      <g>
        {points.map(([x, y]) => (
          <path key={x} d={`M${x - r} ${y} Q${x} ${y + r * 0.8} ${x + r} ${y}`} className={light ? 'ch-stroke-light' : 'ch-stroke-dark'} />
        ))}
      </g>
    );
  }
  return (
    <g className="portrait-eyes">
      {points.map(([x, y]) =>
        light ? (
          <g key={x}>
            <circle cx={x} cy={y} r={r} className="ch-eye-white" />
            <circle cx={x + r * 0.35} cy={y - r * 0.2} r={r * 0.5} className="ch-pupil" />
          </g>
        ) : (
          <circle key={x} cx={x + 1} cy={y - 1} r={r} className="ch-dot" />
        ),
      )}
    </g>
  );
}

export function Portrait({ who, size = 72, asleep = false }: { who: CastMember; size?: number; asleep?: boolean }) {
  return (
    <svg className={`portrait portrait-${who}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      {who === 'qalam' && (
        <g>
          <path d="M28 110 V40 L72 16 V110 Z" className="ch-fill-lapis" />
          <path d="M62 24 L54 38" className="ch-nib" />
          <Eyes points={[[40, 58], [60, 58]]} r={7} asleep={asleep} />
          {!asleep && <path d="M44 76 q6 5 12 0" className="ch-stroke-light thin" />}
        </g>
      )}
      {who === 'waraqa' && (
        <g>
          <path d="M18 110 V20 H70 L88 38 V110 Z" className="ch-fill-paper" />
          <path d="M70 20 L88 38 L70 38 Z" className="ch-fold" />
          {[70, 82, 94].map((y) => (
            <line key={y} x1="28" y1={y} x2="78" y2={y} className="ch-rule" />
          ))}
          <line x1="78" y1="66" x2="40" y2="66" className="ch-writing" />
          <Eyes points={[[40, 46], [62, 46]]} r={5} light={false} asleep={asleep} />
          {!asleep && <path d="M46 56 q5 4 10 0" className="ch-stroke-dark thin" />}
        </g>
      )}
      {who === 'hibr' && (
        <g>
          <path d="M50 8 C50 8 16 62 16 82 A34 34 0 0 0 84 82 C84 62 50 8 50 8 Z" className="ch-fill-ink" />
          <Eyes points={[[38, 70], [62, 70]]} r={7} asleep={asleep} />
          {!asleep && <path d="M44 88 q6 5 12 0" className="ch-stroke-light thin" />}
        </g>
      )}
      {who === 'noon' && (
        <g>
          <circle cx="50" cy="20" r="9" className="ch-ember" />
          <path d="M8 44 A42 42 0 0 0 92 44 Z" className="ch-fill-olive" />
          <path d="M17 47 A33 33 0 0 0 83 47" className="ch-rim" />
          <Eyes points={[[38, 58], [62, 58]]} r={6} asleep={asleep} />
          {!asleep && <path d="M44 72 q6 5 12 0" className="ch-stroke-light thin" />}
        </g>
      )}
      {who === 'nuqta' && (
        <g>
          <circle cx="50" cy="54" r="34" className="ch-ember" />
          <Eyes points={[[39, 48], [61, 48]]} r={6} light={false} asleep={asleep} />
          {!asleep && <path d="M42 64 q8 7 16 0" className="ch-stroke-dark" />}
        </g>
      )}
    </svg>
  );
}
