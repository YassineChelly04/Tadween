import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

// The Tadween mark: two lines of writing that end in a ن, the last letter of
// تدوين, whose dot is the ember spark. Same grammar as the brand mark
// (64-unit grid, 5.5 monoline stroke, round caps), but its own sign.
const LINES = ['M50 14 H14', 'M50 26 H26', 'M50 36 C50 47.5 42 54 32 54 C22 54 14 47.5 14 38'];

interface MarkProps {
  size?: number;
  /** Draws the strokes in, for welcome moments. */
  animate?: boolean;
  /** One colour only (below 24px the dot becomes noise). */
  mono?: boolean;
  className?: string;
}

export function Mark({ size = 28, animate = false, mono = size < 24, className }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Tadween"
    >
      <g fill="none" stroke="var(--ink)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round">
        {LINES.map((d, i) =>
          animate ? (
            <motion.path
              key={d}
              d={d}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.15 + i * 0.22, ease: [0.65, 0, 0.35, 1] }}
            />
          ) : (
            <path key={d} d={d} />
          ),
        )}
      </g>
      {animate ? (
        <motion.circle
          cx="32"
          cy="35.5"
          r="3.6"
          fill={mono ? 'var(--ink)' : 'var(--ember)'}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 1.05, type: 'spring', stiffness: 420, damping: 18 }}
          style={{ transformOrigin: '32px 35.5px' }}
        />
      ) : (
        <circle cx="32" cy="35.5" r="3.6" fill={mono ? 'var(--ink)' : 'var(--ember)'} />
      )}
    </svg>
  );
}

/** Mark at the start of the reading direction, then the name. */
export function Wordmark({ size = 22 }: { size?: number }) {
  const { t } = useTranslation();
  return (
    <span className="wordmark">
      <Mark size={size} />
      <span className="wordmark-name">{t('app.name')}</span>
    </span>
  );
}
