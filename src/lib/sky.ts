// What the sky over Home is doing right now: the light, where the sun or moon
// stands in the drawing, and the moon's real phase.

export type Sky = 'dawn' | 'day' | 'dusk' | 'night';

/** Which inks the scene prints in at this hour. */
export function skyAt(hour: number): Sky {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

const EAST = 520;
const WEST = 1250;
/** The path stays low over the gulf, under the words, and rises from behind Bou Kornine. */
const PEAK = 540;

export interface Body {
  x: number;
  y: number;
  kind: 'sun' | 'moon';
}

function onArc(t: number, horizon: number): { x: number; y: number } {
  return { x: EAST + (WEST - EAST) * t, y: horizon + 30 - Math.sin(Math.PI * t) * (horizon + 30 - PEAK) };
}

/** The sun from 6:00 to 19:00, then the moon until morning, on the same arc. */
export function bodyAt(hours: number, horizon: number): Body {
  if (hours >= 6 && hours < 19) return { ...onArc((hours - 6) / 13, horizon), kind: 'sun' };
  const sinceDusk = (hours - 19 + 24) % 24;
  return { ...onArc(sinceDusk / 11, horizon), kind: 'moon' };
}

const SYNODIC_DAYS = 29.530588;
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);

/** How far through its cycle the moon is: 0 is new, 0.5 is full. */
export function moonPhase(date: Date): number {
  const days = (date.getTime() - NEW_MOON_MS) / 86_400_000;
  return (((days % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS) / SYNODIC_DAYS;
}

/** The lit part of the moon as a path: the outer limb, then the curved terminator. */
export function moonPath(cx: number, cy: number, r: number, phase: number): string {
  const waxing = phase < 0.5;
  const terminator = r * Math.abs(Math.cos(phase * 2 * Math.PI));
  const limb = waxing ? 1 : 0;
  const gibbous = phase > 0.25 && phase < 0.75;
  const inner = gibbous === waxing ? 1 : 0;
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;
  return `M${top}A${r} ${r} 0 0 ${limb} ${bottom}A${terminator.toFixed(2)} ${r} 0 0 ${inner} ${top}z`;
}
