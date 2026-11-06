import { useEffect, useRef, type CSSProperties } from 'react';
import { Portrait, type CastMember } from '../../components/Cast';
import { bodyAt, moonPath, moonPhase } from '../../lib/sky';
import { FAR, HORIZON, LAND, LEDGE, SCENE_H, SCENE_W, SEA, SKY, TERRACE } from './scene.generated';

// The terrace. The drawing itself is generated (scripts/draw-home-scene.mjs);
// this file slips the live parts between its layers: the sun or moon in the
// sky, a boat on the water, and the cast looking over the wall.

// `tilt` is how far each one leans when it falls asleep, `blink` its own moment to blink.
const CAST: { who: CastMember; size: number; drop: number; tilt: number; blink: number; sink?: boolean }[] = [
  { who: 'qalam', size: 122, drop: 2, tilt: 5, blink: -0.4, sink: true },
  { who: 'waraqa', size: 112, drop: 2, tilt: -4, blink: -1.5, sink: true },
  { who: 'hibr', size: 106, drop: 2, tilt: 4, blink: -2.6, sink: true },
  { who: 'noon', size: 118, drop: 16, tilt: -5, blink: -3.3 },
  { who: 'nuqta', size: 92, drop: 12, tilt: 8, blink: -0.9 },
];
const CAST_STEP = 126;
/** The flat-based ones sink a little when they lean, so their base stays behind the wall. */
const SLEEP_SINK = 8;
/** How far a pupil can move, in the portrait's own units. */
const EYE_REACH = 2.4;

const Layer = ({ svg }: { svg: string }) => <g dangerouslySetInnerHTML={{ __html: svg }} />;

function Light({ now }: { now: Date }) {
  const body = bodyAt(now.getHours() + now.getMinutes() / 60, HORIZON);
  const r = body.kind === 'sun' ? 34 : 30;
  return (
    <g>
      <circle className="home-halo" cx={body.x} cy={body.y} r={r * 2.3} />
      {body.kind === 'sun' ? <circle className="home-sun" cx={body.x} cy={body.y} r={r} /> : <path className="home-sun" d={moonPath(body.x, body.y, r, moonPhase(now))} />}
    </g>
  );
}

function Reflection({ now }: { now: Date }) {
  const { x, y } = bodyAt(now.getHours() + now.getMinutes() / 60, HORIZON);
  if (y > HORIZON) return null;
  return (
    <g>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const half = 6 + i * 5;
        const row = HORIZON + 9 + i * i * 2.1 + i * 7;
        return <line key={i} className="home-glint" x1={x - half} x2={x + half} y1={row} y2={row} />;
      })}
    </g>
  );
}

/** A felucca that crosses the gulf once a day. */
function Boat({ now }: { now: Date }) {
  const x = 590 + ((now.getHours() + now.getMinutes() / 60) / 24) * 320;
  return (
    <g transform={`translate(${x} 668)`}>
      <path className="home-boat-sail" d="M1 -3 L1 -38 C-12 -28 -21 -14 -23 -3 Z" />
      <path className="home-boat-sail" d="M3 -3 L3 -30 C11 -22 15 -12 16 -3 Z" />
      <path className="home-boat-hull" d="M-26 -1 H21 L14 7 H-19 Z" />
    </g>
  );
}

/** The z that rise from a sleeper, as on the login screen. */
function Snore({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 1, 2].map((i) => (
        <text key={i} className="home-z" fontSize={20 + i * 5} style={{ animationDelay: `${delay + i * 2}s` }}>
          z
        </text>
      ))}
    </g>
  );
}

export function Scene({ now, asleep, onCast }: { now: Date; asleep: boolean; onCast: (who: CastMember) => void }) {
  const ref = useRef<SVGSVGElement>(null);

  // The cast's eyes follow the pointer, as they do on the login screen.
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    const look = () => {
      frame = 0;
      ref.current?.querySelectorAll<SVGGElement>('.home-cast').forEach((g) => {
        const box = g.getBoundingClientRect();
        const dx = px - (box.left + box.width / 2);
        const dy = py - (box.top + box.height * 0.4);
        const distance = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, distance / 220) * EYE_REACH;
        g.style.setProperty('--look-x', `${((dx / distance) * reach).toFixed(2)}px`);
        g.style.setProperty('--look-y', `${((dy / distance) * reach).toFixed(2)}px`);
      });
    };
    const move = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!frame) frame = requestAnimationFrame(look);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <svg ref={ref} className="home-scene" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <Layer svg={SKY} />
      <Light now={now} />
      <Layer svg={FAR} />
      <Layer svg={SEA} />
      <Reflection now={now} />
      <Boat now={now} />
      <Layer svg={LAND} />
      {CAST.map(({ who, size, drop, tilt, blink, sink }, i) => {
        const x = SCENE_W / 2 + (i - 2) * CAST_STEP - size / 2;
        const y = LEDGE - size + drop + (asleep && sink ? SLEEP_SINK : 0);
        return (
          <g
            key={who}
            className="home-cast"
            style={{ '--blink': `${blink}s`, '--breath': `${blink}s` } as CSSProperties}
            transform={`translate(${x} ${y})${asleep ? ` rotate(${tilt} ${size / 2} ${size})` : ''}`}
            onClick={() => onCast(who)}
          >
            <g className={asleep ? 'home-breath' : undefined}>
              <Portrait who={who} size={size} asleep={asleep} />
            </g>
          </g>
        );
      })}
      {asleep && (
        <>
          <Snore x={SCENE_W / 2 - CAST_STEP * 1.05} y={LEDGE - 118} delay={0} />
          <Snore x={SCENE_W / 2 + CAST_STEP * 0.3} y={LEDGE - 112} delay={3} />
        </>
      )}
      <Layer svg={TERRACE} />
    </svg>
  );
}
