import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// The Tadween cast: five characters made from the act of writing.
//
//   Qalam  قلم   the reed pen   lapis, cut nib; writes on the ground, nods with every key
//   Waraqa ورقة  the page       ruled lines that fill as you type (or as Qalam writes);
//                               folds its corner over its eyes while a password is typed
//   Hibr   حبر   the ink drop   splashes when clicked, cries a drop on a wrong password
//   Noon   ن     the bowl       the letter that ends تدوين
//   Nuqta  نقطة  the dot        ember, the one spark. Sits above Noon: together they are
//                               the Tadween mark. Drag it, throw it, click anywhere.
//
// Left alone, they live: they wander, glance at each other, nudge each other,
// Qalam writes on Waraqa, and the Nuqta visits everyone's head before going
// home. They watch the form while you type, look away from a hidden password,
// peek at a shown one, wince at a wrong one, cheer when the vault opens, and
// fall asleep when nobody is around.

export type Mood = 'idle' | 'watch' | 'shy' | 'peek' | 'error' | 'success';

type CharId = 'qalam' | 'waraqa' | 'hibr' | 'noon' | 'nuqta';
type Walker = Exclude<CharId, 'nuqta'>;
const CAST: CharId[] = ['qalam', 'waraqa', 'hibr', 'noon', 'nuqta'];

interface Vec {
  x: number;
  y: number;
}

const VIEW = { x: 30, y: 110, w: 600, h: 320 };
const GROUND = 400;
const FORM: Vec = { x: 1100, y: 180 };
const AWAY: Vec = { x: -500, y: -200 };
const NUQTA_R = 13;
const NUQTA_HOME: Vec = { x: 515, y: 302 };

/** Rest position (bottom centre), roaming range and head height of each walker. */
const SPOTS: Record<Walker, { x: number; range: number; head: number }> = {
  qalam: { x: 160, range: 70, head: 150 },
  waraqa: { x: 270, range: 45, head: 230 },
  hibr: { x: 390, range: 55, head: 246 },
  noon: { x: 515, range: 40, head: 330 },
};

/** Side-by-side pairs and the space between their bodies at rest. */
const NEIGHBOURS: [Walker, Walker, number][] = [
  ['qalam', 'waraqa', 10],
  ['waraqa', 'hibr', 15],
  ['hibr', 'noon', 13],
];

interface Spring {
  x: number;
  v: number;
}

const spring = (s: Spring, target: number, dt: number, k = 170, c = 15) => {
  s.v += (-k * (s.x - target) - c * s.v) * dt;
  s.x += s.v * dt;
};

interface Body {
  lean: Spring; // degrees, negative leans right (toward the form)
  hop: Spring; // px, negative is up
  squash: Spring; // 1 = rest
  nod: Spring; // degrees (Qalam)
  walk: Spring; // horizontal offset from its spot
  wanderTo: number;
  wanderIn: number;
  stride: number; // walk-cycle phase
  buddy: CharId;
  buddyIn: number;
  blinkIn: number;
  blinking: number;
  curious: number; // 0..1, pointer close by
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  landed: number; // seconds since landing, -1 while flying
}

interface World {
  t: number;
  pointer: Vec;
  lastPointer: Vec;
  pointerSpeed: number;
  pointerStill: number; // seconds since the pointer last moved
  idle: number; // seconds without any input
  bodies: Record<CharId, Body>;
  nuqta: {
    p: Vec;
    v: Vec;
    mode: 'home' | 'drag' | 'free' | 'hop' | 'perch';
    hop?: { from: Vec; to: Vec; t: number; dur: number; then: 'home' | 'free' | 'perch' };
    perch?: { on: Walker; t: number };
    awayFor: number;
    spin: number;
    dragHistory: { p: Vec; t: number }[];
  };
  drops: Particle[];
  scribbles: { d: string; age: number }[];
  zs: { x: number; y: number; age: number }[];
  zTimer: number;
  shakeT: number;
  cheerT: number;
  fold: Spring; // Waraqa's corner: 0 up, 1 over the eyes
  extraInk: number; // lines Qalam wrote on Waraqa
  sceneIn: number; // seconds until the next little scene
  keysIdle: number; // seconds since the last key
  /** Entrance: seconds before each walker springs up from below. */
  arriveIn: Partial<Record<Walker, number>>;
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

const makeBody = (buddy: CharId): Body => ({
  lean: { x: 0, v: 0 },
  hop: { x: 0, v: 0 },
  squash: { x: 1, v: 0 },
  nod: { x: 0, v: 0 },
  walk: { x: 0, v: 0 },
  wanderTo: 0,
  wanderIn: rand(1, 4),
  stride: 0,
  buddy,
  buddyIn: rand(2, 5),
  blinkIn: rand(1.5, 5),
  blinking: 0,
  curious: 0,
});

function createWorld(): World {
  return {
    t: 0,
    pointer: { x: 330, y: 150 },
    lastPointer: { x: 330, y: 150 },
    pointerSpeed: 0,
    pointerStill: 0,
    idle: 0,
    bodies: {
      qalam: makeBody('waraqa'),
      waraqa: makeBody('qalam'),
      hibr: makeBody('noon'),
      noon: makeBody('nuqta'),
      nuqta: makeBody('noon'),
    },
    nuqta: { p: { ...NUQTA_HOME }, v: { x: 0, y: 0 }, mode: 'home', awayFor: 0, spin: 0, dragHistory: [] },
    drops: [],
    scribbles: [],
    zs: [],
    zTimer: 0,
    shakeT: 0,
    cheerT: 0,
    fold: { x: 0, v: 0 },
    extraInk: 0,
    sceneIn: rand(4, 7),
    keysIdle: 0,
    arriveIn: {},
  };
}

/** A focused but untouched form is not interesting for long: back to living. */
function effective(w: World, mood: Mood): Mood {
  return mood === 'watch' && w.keysIdle > 2.5 ? 'idle' : mood;
}

/** Where a character is now (its centre, in scene coordinates). */
function centre(w: World, id: CharId): Vec {
  if (id === 'nuqta') return w.nuqta.p;
  const s = SPOTS[id];
  return { x: s.x + w.bodies[id].walk.x, y: (s.head + GROUND) / 2 };
}

function nuqtaHome(w: World): Vec {
  return { x: NUQTA_HOME.x + w.bodies.noon.walk.x, y: NUQTA_HOME.y + w.bodies.noon.hop.x };
}

function headOf(w: World, id: Walker): Vec {
  const s = SPOTS[id];
  // Qalam's highest point is the nib's tip, on its right.
  const dx = id === 'qalam' ? 30 : id === 'waraqa' ? -10 : 0;
  return { x: s.x + dx + w.bodies[id].walk.x, y: s.head - NUQTA_R + w.bodies[id].hop.x };
}

function look(c: Vec, target: Vec, max: number): Vec {
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  const d = Math.hypot(dx, dy) || 1;
  const k = Math.min(max, d / 16) / d;
  return { x: dx * k, y: dy * k };
}

/** A loose, hand-written line: what Qalam writes. */
function scribblePath(x0: number): string {
  let d = `M${x0} ${GROUND + 16}`;
  for (let i = 0; i < 5; i++) {
    const wdt = rand(12, 26);
    d += ` q${wdt / 2} ${-rand(5, 12)} ${wdt} 0`;
  }
  return `${d} m6 -4 a2 2 0 1 0 0.1 0`;
}

interface Props {
  mood: Mood;
  typed?: number;
  keyTick?: number;
  /** Play the welcome entrance: everyone springs up, the dot drops onto Noon, they cheer. */
  entrance?: boolean;
}

export function Characters({ mood: given, typed = 0, keyTick = 0, entrance = false }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const world = useRef<World>(createWorld());
  const moodRef = useRef(given);
  const [, setFrame] = useState(0);
  const reduced = useRef(typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (!entrance) return;
    const w = world.current;
    (['qalam', 'waraqa', 'hibr', 'noon'] as Walker[]).forEach((id, i) => {
      w.arriveIn[id] = 0.35 + i * 0.28;
      w.bodies[id].hop.x = 360;
    });
    w.nuqta.mode = 'hop';
    w.nuqta.p = { x: NUQTA_HOME.x - 160, y: VIEW.y - 120 };
    w.nuqta.hop = { from: { ...w.nuqta.p }, to: nuqtaHome(w), t: -1.5, dur: 0.9, then: 'home' };
    w.sceneIn = 6;
    const timers = [
      setTimeout(() => {
        w.cheerT = 1.8;
        CAST.forEach((c, i) => setTimeout(() => (w.bodies[c].hop.v -= 320), i * 90));
      }, 2700),
      setTimeout(() => {
        write(w);
        w.extraInk = 40;
      }, 3300),
    ];
    return () => timers.forEach(clearTimeout);
  }, [entrance]);

  // Mood changes trigger one-off reactions.
  useEffect(() => {
    const mood = given;
    const w = world.current;
    const prev = moodRef.current;
    moodRef.current = mood;
    w.keysIdle = 0;
    if (mood === 'error') {
      w.shakeT = 0.6;
      const h = centre(w, 'hibr');
      w.drops.push({ x: h.x - 12, y: 352, vx: -10, vy: 20, r: 3.5, landed: -1 });
      w.bodies.hibr.squash.v -= 2;
    }
    if (mood === 'success') {
      w.cheerT = 1.4;
      CAST.forEach((c, i) => setTimeout(() => (w.bodies[c].hop.v -= 340), i * 80));
      sendNuqta(w, nuqtaHome(w), 'home', 0.5);
    }
    if (mood === 'shy' && prev !== 'shy') w.bodies.waraqa.squash.v -= 1;
  }, [given]);

  // Every key typed: Qalam nods, Waraqa rustles.
  useEffect(() => {
    if (!keyTick) return;
    const w = world.current;
    w.idle = 0;
    w.keysIdle = 0;
    w.bodies.qalam.nod.v += 90;
    w.bodies.waraqa.squash.v += 0.6;
  }, [keyTick]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const toScene = (clientX: number, clientY: number): Vec | null => {
      const ctm = svgRef.current?.getScreenCTM();
      if (!ctm) return null;
      const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
      return { x: p.x, y: p.y };
    };

    const onMove = (e: PointerEvent) => {
      const p = toScene(e.clientX, e.clientY);
      if (!p) return;
      const w = world.current;
      w.pointer = p;
      w.pointerStill = 0;
      if (w.idle > 12) wake(w);
      w.idle = 0;
      if (w.nuqta.mode === 'drag') {
        w.nuqta.p = { x: clamp(p.x, VIEW.x + NUQTA_R, VIEW.x + VIEW.w - NUQTA_R), y: Math.min(p.y, GROUND - NUQTA_R) };
        w.nuqta.dragHistory.push({ p: { ...w.nuqta.p }, t: performance.now() });
        if (w.nuqta.dragHistory.length > 6) w.nuqta.dragHistory.shift();
      }
    };

    const onUp = () => {
      const n = world.current.nuqta;
      if (n.mode !== 'drag') return;
      const h = n.dragHistory;
      if (h.length >= 2) {
        const a = h[0];
        const b = h[h.length - 1];
        const dt = Math.max(16, b.t - a.t) / 1000;
        n.v = { x: clamp((b.p.x - a.p.x) / dt, -1600, 1600), y: clamp((b.p.y - a.p.y) / dt, -1600, 1600) };
      } else n.v = { x: 0, y: 0 };
      n.mode = 'free';
      n.awayFor = 0;
    };

    const onKey = () => {
      const w = world.current;
      if (w.idle > 12) wake(w);
      w.idle = 0;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(world.current, dt, moodRef.current, reduced.current);
      setFrame((f) => (f + 1) % 1e6);
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const w = world.current;
  const b = w.bodies;
  const mood = effective(w, given);
  const sleeping = w.idle > 12 && mood === 'idle';
  const happy = mood === 'success' || w.cheerT > 0;
  const shy = mood === 'shy';
  const peek = mood === 'peek';
  const nuqtaAway = w.nuqta.mode !== 'home';

  // Where a character looks.
  const target = (id: CharId, eye: Vec): Vec => {
    if (mood === 'watch' || mood === 'peek') return FORM;
    if (shy) return AWAY;
    if (mood === 'error') return { x: eye.x - 30, y: eye.y + 300 };
    if (nuqtaAway && id !== 'nuqta') return w.nuqta.p;
    // The pointer is still: they look at each other instead.
    if (w.pointerStill > 2.5) return centre(w, b[id].buddy);
    return w.pointer;
  };

  const closed = (id: CharId) => sleeping || b[id].blinking > 0;
  const shakeX = w.shakeT > 0 ? Math.sin(w.shakeT * 38) * 7 * (w.shakeT / 0.6) : 0;

  const bodyTransform = (id: Walker) => {
    const s = b[id];
    const ox = SPOTS[id].x;
    const breathe = sleeping ? 1 + Math.sin(w.t * 2 + ox) * 0.015 : 1;
    const step = -Math.abs(Math.sin(s.stride)) * Math.min(6, Math.abs(s.walk.v) / 6);
    return `translate(${s.walk.x + shakeX} ${s.hop.x + step}) translate(${ox} ${GROUND}) skewX(${s.lean.x}) scale(${(2 - s.squash.x) / breathe} ${s.squash.x * breathe}) translate(${-ox} ${-GROUND})`;
  };

  // Eyes with a white and a pupil.
  const eye = (id: Walker, cx: number, cy: number, r: number) => {
    if (happy) return <path d={`M${cx - r} ${cy + 2} Q${cx} ${cy - r * 1.2} ${cx + r} ${cy + 2}`} className="ch-stroke-light" />;
    if (closed(id)) return <path d={`M${cx - r} ${cy} Q${cx} ${cy + r * 0.7} ${cx + r} ${cy}`} className="ch-stroke-light" />;
    const world = { x: cx + b[id].walk.x, y: cy + b[id].hop.x };
    const o = look(world, target(id, world), r * 0.48);
    const grow = 1 + b[id].curious * 0.15;
    return (
      <g>
        <circle cx={cx} cy={cy} r={r * grow} className="ch-eye-white" />
        <circle cx={cx + o.x} cy={cy + o.y} r={r * 0.5 * grow} className="ch-pupil" />
      </g>
    );
  };

  // Dot eyes (no white).
  const dot = (id: Walker, cx: number, cy: number, r: number) => {
    if (happy) return <path d={`M${cx - r - 1} ${cy + 1} Q${cx} ${cy - r - 3} ${cx + r + 1} ${cy + 1}`} className="ch-stroke-dark" />;
    if (closed(id)) return <path d={`M${cx - r} ${cy} H${cx + r}`} className="ch-stroke-dark" />;
    const world = { x: cx + b[id].walk.x, y: cy };
    const o = look(world, target(id, world), 4);
    return <circle cx={cx + o.x} cy={cy + o.y} r={r * (1 + b[id].curious * 0.2)} className="ch-dot" />;
  };

  const fold = clamp(w.fold.x, 0, 1.1);
  const ink = Math.min(typed + w.extraInk, 40);
  const n = w.nuqta;
  const nuqtaEyes = look(n.p, target('nuqta', n.p), 3);

  const onCharDown = (id: Walker) => (e: ReactPointerEvent) => {
    e.stopPropagation();
    poke(w, id);
  };

  const onNuqtaDown = (e: ReactPointerEvent) => {
    e.stopPropagation();
    if (n.mode === 'home' && (shy || peek)) return;
    n.mode = 'drag';
    n.perch = undefined;
    n.dragHistory = [{ p: { ...n.p }, t: performance.now() }];
    b.nuqta.squash.v += 2;
  };

  const onEmptyDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm || reduced.current) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    sendNuqta(w, { x: clamp(p.x, VIEW.x + 20, VIEW.x + VIEW.w - 20), y: GROUND - NUQTA_R }, 'free', 0.55);
  };

  return (
    <svg
      ref={svgRef}
      className={`characters mood-${mood}${sleeping ? ' sleeping' : ''}`}
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-hidden="true"
      preserveAspectRatio="xMidYMax meet"
      onPointerDown={onEmptyDown}
    >
      <line x1={VIEW.x - 200} y1={GROUND + 0.5} x2={VIEW.x + VIEW.w + 200} y2={GROUND + 0.5} className="ch-ground" />

      {w.scribbles.map((s, i) => (
        <path
          key={i}
          d={s.d}
          className="ch-scribble"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - Math.min(1, s.age / 0.7)}
          opacity={s.age > 2.4 ? Math.max(0, 1 - (s.age - 2.4) / 0.8) : 1}
        />
      ))}

      {/* Qalam: the reed pen */}
      <g className="ch" transform={bodyTransform('qalam')} onPointerDown={onCharDown('qalam')}>
        <g transform={`rotate(${b.qalam.nod.x} 160 ${GROUND})`}>
          <path d={`M120 ${GROUND} V196 L200 150 V${GROUND} Z`} className="ch-fill-lapis" />
          <path d="M182 166 L168 192" className="ch-nib" />
          {eye('qalam', 144, 232, 10)}
          {eye('qalam', 178, 232, 10)}
          {shy && <path d="M136 262 h48" className="ch-stroke-light" opacity={0.5} />}
        </g>
      </g>

      {/* Waraqa: the page */}
      <g className="ch" transform={bodyTransform('waraqa')} onPointerDown={onCharDown('waraqa')}>
        <path d={`M210 ${GROUND} V230 H300 L330 260 V${GROUND} Z`} className="ch-fill-paper" />
        {[300, 322, 344, 366].map((y, i) => {
          const done = clamp(ink - i * 10, 0, 10) / 10;
          return (
            <g key={y}>
              <line x1="224" y1={y} x2="316" y2={y} className="ch-rule" />
              {done > 0 && <line x1={316} y1={y - 4} x2={316 - 92 * done} y2={y - 4} className="ch-writing" />}
            </g>
          );
        })}
        {dot('waraqa', 248, 268, 5)}
        {dot('waraqa', 282, 268, 5)}
        {!happy && <path d={mood === 'error' ? 'M258 286 q7 -5 14 0' : 'M258 283 q7 5 14 0'} className="ch-stroke-dark thin" />}
        <path d={`M300 230 L330 260 L${300 - 86 * fold} ${260 + 32 * fold} L${300 - 86 * fold} ${260 - 14 * fold} Z`} className="ch-fold" />
      </g>

      {/* Hibr: the ink drop */}
      <g className="ch" transform={bodyTransform('hibr')} onPointerDown={onCharDown('hibr')}>
        <path d="M390 246 C390 246 345 318 345 352 A45 45 0 0 0 435 352 C435 318 390 246 390 246 Z" className="ch-fill-ink" />
        {eye('hibr', 373, 344, 9)}
        {eye('hibr', 407, 344, 9)}
        {!happy && !closed('hibr') && <path d={mood === 'error' ? 'M382 372 q8 -5 16 0' : 'M383 368 q7 5 14 0'} className="ch-stroke-light thin" />}
      </g>

      {/* Nuqta, drawn before Noon so it can hide in the bowl */}
      <g
        className="ch ch-nuqta"
        transform={`translate(${n.p.x + shakeX} ${n.p.y + b.nuqta.hop.x}) rotate(${n.spin}) scale(${2 - b.nuqta.squash.x} ${b.nuqta.squash.x})`}
        onPointerDown={onNuqtaDown}
      >
        <circle r={NUQTA_R} className="ch-ember" />
        {happy ? (
          <path d="M-6 -1 q2.5 -3.5 5 0 M1 -1 q2.5 -3.5 5 0" className="ch-stroke-dark thin" />
        ) : closed('nuqta') ? (
          <path d="M-6 -1 h4 M2 -1 h4" className="ch-stroke-dark thin" />
        ) : (
          <>
            <circle cx={-4 + nuqtaEyes.x} cy={-2 + nuqtaEyes.y} r={2.3} className="ch-dot" />
            <circle cx={4 + nuqtaEyes.x} cy={-2 + nuqtaEyes.y} r={2.3} className="ch-dot" />
          </>
        )}
      </g>

      {/* Noon: the bowl of ن */}
      <g className="ch" transform={bodyTransform('noon')} onPointerDown={onCharDown('noon')}>
        <path d="M448 330 A67 67 0 0 0 582 330 Z" className="ch-fill-olive" />
        <path d="M462 334 A53 53 0 0 0 568 334" className="ch-rim" />
        {eye('noon', 497, 352, 8)}
        {eye('noon', 533, 352, 8)}
        {!closed('noon') && (
          <path d={happy ? 'M503 374 q12 10 24 0' : mood === 'error' ? 'M505 380 q10 -7 20 0' : 'M506 375 q9 6 18 0'} className="ch-stroke-light thin" />
        )}
      </g>

      {w.drops.map((d, i) =>
        d.landed < 0 ? (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} className="ch-fill-ink" />
        ) : (
          <ellipse key={i} cx={d.x} cy={GROUND - 0.5} rx={d.r * 2} ry={d.r * 0.6} className="ch-fill-ink" opacity={Math.max(0, 1 - d.landed / 2.5)} />
        ),
      )}

      {w.zs.map((z, i) => (
        <text key={i} x={z.x} y={z.y} className="ch-z" opacity={Math.max(0, 1 - z.age / 2.6)} fontSize={12 + z.age * 5}>
          z
        </text>
      ))}
    </svg>
  );
}

// ── Simulation ───────────────────────────────────────────────────────────────

function wake(w: World) {
  CAST.forEach((c, i) => setTimeout(() => (w.bodies[c].hop.v -= 220), i * 40));
  w.zs = [];
}

function sendNuqta(w: World, to: Vec, then: 'home' | 'free' | 'perch', dur: number, perchOn?: Walker) {
  const n = w.nuqta;
  if (n.mode === 'drag') return;
  n.hop = { from: { ...n.p }, to, t: 0, dur, then };
  n.perch = perchOn ? { on: perchOn, t: rand(1.6, 2.6) } : undefined;
  n.mode = 'hop';
  n.awayFor = 0;
}

function write(w: World) {
  const q = w.bodies.qalam;
  q.nod.v += 260;
  w.scribbles.push({ d: scribblePath(SPOTS.qalam.x + q.walk.x - 70), age: 0 });
  if (w.scribbles.length > 3) w.scribbles.shift();
}

/** Reactions to a click. */
function poke(w: World, id: Walker) {
  const b = w.bodies[id];
  w.idle = 0;
  switch (id) {
    case 'qalam':
      write(w);
      break;
    case 'waraqa':
      b.squash.v -= 3.5;
      b.hop.v -= 140;
      break;
    case 'hibr': {
      b.squash.v -= 5;
      const c = centre(w, 'hibr');
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
        const s = rand(240, 420);
        w.drops.push({ x: c.x, y: 300, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rand(3, 6), landed: -1 });
      }
      break;
    }
    case 'noon':
      b.squash.v -= 3;
      sendNuqta(w, nuqtaHome(w), 'home', 0.45);
      break;
  }
}

/** Little scenes the cast plays when left alone. */
function scene(w: World) {
  const b = w.bodies;
  switch (pick(['write', 'visit', 'visit', 'nudge', 'chat'] as const)) {
    case 'write': {
      // Qalam walks to the page and writes on it.
      b.qalam.wanderTo = Math.min(SPOTS.qalam.range, 40);
      b.qalam.wanderIn = 3;
      setTimeout(() => {
        write(w);
        w.extraInk = Math.min(40, w.extraInk + 10);
        b.waraqa.squash.v -= 1.5;
        b.waraqa.buddy = 'qalam';
      }, 900);
      break;
    }
    case 'visit': {
      // The Nuqta visits someone's head, then goes home.
      if (w.nuqta.mode !== 'home') break;
      const host = pick<Walker>(['qalam', 'waraqa', 'hibr']);
      sendNuqta(w, headOf(w, host), 'perch', 0.65, host);
      break;
    }
    case 'nudge': {
      // Hibr bumps the page; the page wobbles.
      b.hibr.wanderTo = -SPOTS.hibr.range;
      b.hibr.wanderIn = 2.5;
      setTimeout(() => {
        b.waraqa.lean.v += 160;
        b.waraqa.hop.v -= 120;
        b.hibr.squash.v -= 2;
        b.waraqa.buddy = 'hibr';
      }, 1000);
      break;
    }
    case 'chat': {
      // Two neighbours lean toward each other in turn.
      const [a, c] = pick<[Walker, Walker]>([
        ['qalam', 'waraqa'],
        ['waraqa', 'hibr'],
        ['hibr', 'noon'],
      ]);
      b[a].buddy = c;
      b[c].buddy = a;
      for (let i = 0; i < 4; i++) {
        setTimeout(() => {
          const who = i % 2 ? c : a;
          b[who].lean.v += who === a ? -70 : 70;
          b[who].hop.v -= 50;
        }, i * 380);
      }
      break;
    }
  }
}

function step(w: World, dt: number, given: Mood, reduced: boolean) {
  w.keysIdle += dt;
  const mood = effective(w, given);
  w.t += dt;
  w.idle += dt;
  w.pointerStill += dt;
  const speed = dist(w.pointer, w.lastPointer) / Math.max(dt, 1e-3);
  w.pointerSpeed = w.pointerSpeed * 0.8 + speed * 0.2;
  w.lastPointer = { ...w.pointer };
  w.shakeT = Math.max(0, w.shakeT - dt);
  w.cheerT = Math.max(0, w.cheerT - dt);
  w.extraInk = Math.max(0, w.extraInk - dt * 1.2);
  const sleeping = w.idle > 12 && mood === 'idle';
  const lively = mood === 'idle' && !sleeping && !reduced;

  if (w.pointerSpeed > 2600 && !sleeping && !reduced) CAST.forEach((c) => (w.bodies[c].hop.v -= 8));

  if (lively) {
    w.sceneIn -= dt;
    if (w.sceneIn <= 0) {
      w.sceneIn = rand(5, 9);
      scene(w);
    }
  }

  for (const id of CAST) {
    const b = w.bodies[id];
    const c = centre(w, id);

    const arriving = id !== 'nuqta' ? w.arriveIn[id] : undefined;
    if (arriving !== undefined) {
      // Waiting below the ground for its entrance, then a spring up.
      w.arriveIn[id as Walker] = arriving - dt;
      if (arriving - dt > 0) {
        b.hop.x = 360;
        b.hop.v = 0;
        continue;
      }
      delete w.arriveIn[id as Walker];
      b.hop.v = -900;
      b.squash.v -= 2;
    }

    if (id !== 'nuqta') {
      // Wander a little around their spot; come back when someone types.
      const spot = SPOTS[id];
      b.wanderIn -= dt;
      if (lively && b.wanderIn <= 0) {
        b.wanderTo = rand(-spot.range, spot.range);
        b.wanderIn = rand(3, 7);
      }
      spring(b.walk, lively ? b.wanderTo : 0, dt, 18, 7.5);
      b.stride += Math.abs(b.walk.v) * dt * 0.22;
    }

    let lean = 0;
    if (mood === 'watch') lean = -4;
    else if (mood === 'peek') lean = -11;
    else if (mood === 'shy') lean = id === 'noon' ? 3 : 8;
    else if (lively) lean = -clamp((w.pointer.x - c.x) / 36, -7, 7) - clamp(b.walk.v / 12, -5, 5);
    if (id === 'noon') lean *= 0.35;
    if (id === 'hibr') lean *= 0.7;
    spring(b.lean, reduced ? 0 : lean, dt, 120, 13);
    spring(b.hop, 0, dt, 260, 13);
    spring(b.squash, 1, dt, 300, 11);
    spring(b.nod, 0, dt, 260, 12);
    b.squash.x = clamp(b.squash.x, 0.7, 1.3);

    const near = clamp(1 - dist(w.pointer, c) / 120, 0, 1);
    b.curious += (near - b.curious) * Math.min(1, dt * 8);

    // Glance at a neighbour now and then.
    b.buddyIn -= dt;
    if (b.buddyIn <= 0) {
      b.buddyIn = rand(2.5, 6);
      b.buddy = pick(CAST.filter((x) => x !== id));
    }

    if (b.blinking > 0) b.blinking -= dt;
    else if ((b.blinkIn -= dt) <= 0) {
      b.blinking = 0.12;
      b.blinkIn = rand(2, 7);
    }
  }

  // Neighbours may touch (and bump), but never cover each other's faces.
  for (const [l, r, gap] of NEIGHBOURS) {
    const overlap = w.bodies[l].walk.x - w.bodies[r].walk.x - gap - 6;
    if (overlap > 0) {
      w.bodies[l].walk.x -= overlap / 2;
      w.bodies[r].walk.x += overlap / 2;
      w.bodies[l].walk.v = Math.min(w.bodies[l].walk.v, 0);
      w.bodies[r].walk.v = Math.max(w.bodies[r].walk.v, 0);
    }
  }

  if (sleeping && !reduced) {
    w.zTimer -= dt;
    if (w.zTimer <= 0) {
      w.zTimer = 1.1;
      const from = w.zs.length % 2 ? centre(w, 'hibr') : centre(w, 'noon');
      w.zs.push({ x: from.x + 20, y: from.y - 50, age: 0 });
    }
  }
  w.zs = w.zs.filter((z) => (z.age += dt) < 2.6).map((z) => ({ ...z, x: z.x + dt * 10, y: z.y - dt * 22 }));

  for (const d of w.drops) {
    if (d.landed >= 0) {
      d.landed += dt;
      continue;
    }
    d.vy += 900 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.y >= GROUND - d.r) {
      d.y = GROUND - d.r;
      d.landed = 0;
    }
  }
  w.drops = w.drops.filter((d) => d.landed < 2.5);
  w.scribbles.forEach((s) => (s.age += dt));
  w.scribbles = w.scribbles.filter((s) => s.age < 3.2);

  spring(w.fold, mood === 'shy' ? 1 : mood === 'peek' ? 0.45 : 0, dt, 200, 16);
  stepNuqta(w, dt, mood, reduced);
}

function stepNuqta(w: World, dt: number, mood: Mood, reduced: boolean) {
  const n = w.nuqta;
  const b = w.bodies.nuqta;
  const base = nuqtaHome(w);
  const home = mood === 'shy' ? { x: base.x, y: 350 } : mood === 'peek' ? { x: base.x, y: 322 } : base;

  // Typing always calls the dot home.
  if (mood !== 'idle' && (n.mode === 'perch' || (n.mode === 'hop' && n.hop?.then === 'perch'))) {
    sendNuqta(w, home, 'home', 0.4);
  }

  if (n.mode === 'home') {
    n.p.x += (home.x - n.p.x) * Math.min(1, dt * 10);
    n.p.y += (home.y - n.p.y) * Math.min(1, dt * 10);
    n.spin *= 0.9;
    if (mood === 'idle' && !reduced) b.hop.x += Math.sin(w.t * 3.2) * 0.12;
  } else if (n.mode === 'perch' && n.perch) {
    // Ride along on someone's head.
    const top = headOf(w, n.perch.on);
    n.p.x += (top.x - n.p.x) * Math.min(1, dt * 14);
    n.p.y += (top.y - n.p.y) * Math.min(1, dt * 14);
    n.spin *= 0.9;
    n.perch.t -= dt;
    if (n.perch.t <= 0) sendNuqta(w, nuqtaHome(w), 'home', 0.7);
  } else if (n.mode === 'hop' && n.hop) {
    const h = n.hop;
    h.t += dt;
    const k = clamp(h.t / h.dur, 0, 1); // t < 0 means "not yet": it waits at the start
    const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const to = h.then === 'home' ? nuqtaHome(w) : h.then === 'perch' && n.perch ? headOf(w, n.perch.on) : h.to;
    const height = 60 + Math.abs(to.x - h.from.x) * 0.25;
    n.p = {
      x: h.from.x + (to.x - h.from.x) * ease,
      y: h.from.y + (to.y - h.from.y) * ease - Math.sin(Math.PI * k) * height,
    };
    n.spin += dt * 540 * Math.sign(to.x - h.from.x || 1);
    if (k >= 1) {
      n.mode = h.then;
      n.v = { x: 0, y: 0 };
      n.hop = undefined;
      b.squash.v -= 3;
      if (n.mode === 'home') {
        w.bodies.noon.squash.v -= 2;
        w.bodies.noon.hop.v -= 60;
      } else if (n.mode === 'perch' && n.perch) {
        w.bodies[n.perch.on].squash.v -= 2.5;
      }
    }
  } else if (n.mode === 'free') {
    n.v.y += 1400 * dt;
    n.p.x += n.v.x * dt;
    n.p.y += n.v.y * dt;
    n.spin += n.v.x * dt * 2;
    if (n.p.y > GROUND - NUQTA_R) {
      n.p.y = GROUND - NUQTA_R;
      if (Math.abs(n.v.y) > 120) b.squash.v -= Math.min(6, Math.abs(n.v.y) / 120);
      n.v.y *= -0.55;
      n.v.x *= 0.82;
    }
    const lo = VIEW.x + NUQTA_R;
    const hi = VIEW.x + VIEW.w - NUQTA_R;
    if (n.p.x < lo || n.p.x > hi) {
      n.p.x = clamp(n.p.x, lo, hi);
      n.v.x *= -0.7;
    }
    if (dist(n.p, base) < 34 && n.v.y > 0) {
      n.mode = 'home';
      w.bodies.noon.hop.v -= 90;
      return;
    }
    const resting = Math.abs(n.v.x) < 12 && Math.abs(n.v.y) < 40 && n.p.y >= GROUND - NUQTA_R - 1;
    if (resting) {
      n.awayFor += dt;
      if (n.awayFor > 2.4 || mood !== 'idle') sendNuqta(w, nuqtaHome(w), 'home', 0.6);
    }
  }
}
