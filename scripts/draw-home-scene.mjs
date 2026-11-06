// Draws the Home scene: a Tunisian terrace looking over the gulf, printed like
// an engraving in flat inks. No gradients and no shadows; shade is hatching and
// clouds are gaps in the sky's lines. Every colour is a `--s-*` token, so the
// same drawing prints at dawn, by day, at dusk and at night (see styles/home.css).
//
// Seeded, so a run always gives the same drawing:
//   node scripts/draw-home-scene.mjs
// writes src/features/home/scene.generated.ts. Sun, moon, boat and the cast are
// live, and go between the layers in Scene.tsx.

import { writeFileSync } from 'node:fs';

const W = 1600;
const H = 1000;
const HORIZON = 590;
const LEDGE = 902;

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry(2026);
const between = (a, b) => a + rnd() * (b - a);
const pick = (list) => list[Math.floor(rnd() * list.length)];
const n = (v) => +v.toFixed(1);
const pts = (list) => list.map(([x, y]) => `${n(x)} ${n(y)}`).join('L');

const fill = (d, colour, extra = '') => `<path d="${d}" fill="var(--s-${colour})"${extra}/>`;
const lines = (d, colour, width = 1, extra = '') => `<path d="${d}" fill="none" stroke="var(--s-${colour})" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
const rect = (x, y, w, h) => `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
const circle = (cx, cy, r) => `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0z`;

/** Where a polyline of [x, y] sits at height `y`. */
function xAtY(poly, y) {
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[i + 1];
    if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) return x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
  }
  return null;
}
function yAtX(poly, x) {
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[i + 1];
    if ((x1 - x) * (x2 - x) <= 0 && x1 !== x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }
  return null;
}

// ── Sky ─────────────────────────────────────────────────────────────────────
// Banknote lines, broken where a cloud sits. A cloud is a few ellipses, and a
// line is simply not drawn inside them.

const CLOUDS = [
  [[250, 210, 150, 22], [330, 188, 110, 24], [170, 226, 90, 14], [400, 216, 120, 15]],
  [[1270, 150, 130, 18], [1350, 132, 90, 20], [1210, 162, 70, 11], [1440, 160, 90, 12]],
  [[720, 395, 190, 13], [640, 382, 100, 13], [840, 404, 130, 10]],
  [[1120, 330, 110, 12], [1180, 318, 70, 12], [1040, 338, 80, 8]],
  [[120, 420, 120, 11], [210, 410, 80, 11]],
];
const inCloud = (x, y) => CLOUDS.some((c) => c.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1));

function sky() {
  let d = '';
  for (let y = 30, gap = 11; y < HORIZON; y += gap, gap = Math.max(4.2, gap * 0.984)) {
    let start = null;
    for (let x = 0; x <= W; x += 5) {
      const open = !inCloud(x, y);
      if (open && start === null) start = x;
      if ((!open || x === W) && start !== null) {
        if (x - start > 8) d += `M${start} ${n(y)}H${x}`;
        start = null;
      }
    }
  }
  let soft = '';
  for (const c of CLOUDS) for (const [cx, cy, rx, ry] of c) soft += `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;
  let stars = '';
  for (let i = 0; i < 170; i++) {
    const x = between(0, W);
    const y = rnd() ** 1.5 * (HORIZON - 40);
    const r = pick([0.7, 0.7, 0.9, 0.9, 1.2, 1.7]);
    stars += circle(x, y, r);
    if (r > 1.5) stars += `M${n(x - 5)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y - 5)}Q${n(x)} ${n(y)} ${n(x + 5)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + 5)}Q${n(x)} ${n(y)} ${n(x - 5)} ${n(y)}z`;
  }
  return fill(rect(0, 0, W, H), 'sky') + fill(soft, 'cloud') + lines(d, 'sky-line', 0.8) + fill(stars, 'star');
}

// ── Far shore ───────────────────────────────────────────────────────────────
// Bou Kornine, the two-horned mountain across the gulf from Sidi Bou Said.

function far() {
  const ridge = [
    [0, 590], [70, 584], [150, 578], [210, 570], [262, 548], [300, 530], [330, 500], [352, 468], [368, 456], [386, 476], [404, 492], [420, 486],
    [440, 452], [456, 438], [474, 458], [500, 494], [536, 524], [590, 548], [650, 562], [740, 572], [850, 580], [980, 586], [1100, 590],
  ];
  let out = fill(`M${pts(ridge)}V590H0z`, 'far');
  // Ridge lines run down the slopes, thinning out to nothing at the foot.
  let d = '';
  for (let i = 0; i < 90; i++) {
    const x = between(240, 640);
    const top = yAtX(ridge, x);
    if (top === null) continue;
    const len = between(10, 60) * ((590 - top) / 150 + 0.25);
    const lean = (x < 368 || (x > 420 && x < 456) ? -1 : 1) * between(0.2, 0.55);
    d += `M${n(x)} ${n(top + between(2, 18))}l${n(lean * len)} ${n(len)}`;
  }
  out += lines(d, 'far-line', 0.9);
  return out;
}

// ── Sea ─────────────────────────────────────────────────────────────────────
// Short engraved strokes that open up as they come towards you.

function sea() {
  let out = fill(rect(0, HORIZON, W, H - HORIZON), 'sea');
  out += lines(`M0 ${HORIZON}H${W}`, 'sea-line', 1);
  let a = '';
  for (let y = HORIZON + 5, gap = 3.4; y < 900; y += gap, gap *= 1.052) {
    const depth = (y - HORIZON) / 310;
    const len = 18 + depth * 150;
    for (let x = between(-60, 0); x < W; x += len * between(1.3, 3.1)) {
      const l = len * between(0.45, 1.15);
      const sag = 1 + depth * 2.4;
      a += `M${n(x)} ${n(y + between(-0.8, 0.8))}q${n(l / 2)} ${n(between(-sag, sag))} ${n(l)} 0`;
    }
  }
  return out + lines(a, 'sea-line', 1);
}

// ── Plants ──────────────────────────────────────────────────────────────────

function olive(x, y, s) {
  // Shade on the ground is hatching, so no shadow is ever drawn.
  let ground = '';
  for (let i = 0; i < 5; i++) ground += `M${n(x - 16 * s + i * 2 * s)} ${n(y + 1.5 * s + i * 1.5 * s)}h${n((30 - i * 5) * s)}`;
  let out = lines(ground, 'hill-line', 0.8);
  const trunk = `M${n(x - 3 * s)} ${n(y)}C${n(x - 1 * s)} ${n(y - 7 * s)} ${n(x - 5 * s)} ${n(y - 12 * s)} ${n(x - 3 * s)} ${n(y - 22 * s)}L${n(x + 2 * s)} ${n(y - 26 * s)}C${n(x + 1 * s)} ${n(y - 15 * s)} ${n(x + 5 * s)} ${n(y - 8 * s)} ${n(x + 4 * s)} ${n(y)}z`;
  out += fill(trunk, 'trunk');
  out += lines(`M${n(x - 2 * s)} ${n(y - 18 * s)}l${n(-10 * s)} ${n(-12 * s)}M${n(x + 1 * s)} ${n(y - 22 * s)}l${n(10 * s)} ${n(-10 * s)}`, 'trunk', 1.6 * s);
  let deep = '';
  let mid = '';
  let high = '';
  const lobes = [[-13, -34, 13, 9], [10, -35, 14, 9], [-1, -43, 14, 8], [-20, -28, 8, 5], [21, -29, 7, 5]];
  for (const [lx, ly, rx, ry] of lobes) {
    for (let i = 0; i < 16; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.sqrt(rnd());
      const cx = x + (lx + Math.cos(a) * rr * rx) * s;
      const cy = y + (ly + Math.sin(a) * rr * ry) * s;
      const r = between(1.5, 3.6) * s;
      const up = (ly + Math.sin(a) * rr * ry + 30) / 18;
      if (up > 0.2) deep += circle(cx, cy, r);
      else if (rnd() < 0.55) mid += circle(cx - 0.8 * s, cy, r * 0.9);
      else high += circle(cx - 1 * s, cy - 0.6 * s, r * 0.7);
    }
  }
  return out + fill(deep, 'green-deep') + fill(mid, 'green') + fill(high, 'leaf-light');
}

function cypress(x, y, s) {
  const h = 74 * s;
  const w = 8.5 * s;
  let out = fill(`M${n(x)} ${n(y - h)}C${n(x + w)} ${n(y - h * 0.62)} ${n(x + w)} ${n(y - h * 0.2)} ${n(x + w * 0.3)} ${n(y)}H${n(x - w * 0.3)}C${n(x - w)} ${n(y - h * 0.2)} ${n(x - w)} ${n(y - h * 0.62)} ${n(x)} ${n(y - h)}z`, 'green-deep');
  let d = '';
  for (let i = 0; i < 9; i++) {
    const py = y - h * (0.1 + i * 0.09);
    d += `M${n(x + 1 * s)} ${n(py)}l${n(4 * s)} ${n(-9 * s)}`;
  }
  return out + lines(d, 'green', 0.8 * s);
}

function palm(x, y, s) {
  const top = [x + 7 * s, y - 92 * s];
  let out = lines(`M${n(x)} ${n(y)}Q${n(x - 4 * s)} ${n(y - 50 * s)} ${n(top[0])} ${n(top[1])}`, 'trunk', 3.6 * s);
  let d = '';
  for (const [dx, dy, bow] of [[-46, 8, -26], [-38, -20, -30], [-16, -32, -24], [18, -32, -24], [40, -18, -30], [48, 10, -26], [-24, 22, -14], [28, 22, -14]]) {
    const ex = top[0] + dx * s;
    const ey = top[1] + dy * s;
    const cx = top[0] + dx * 0.5 * s;
    const cy = top[1] + bow * s;
    d += `M${n(top[0])} ${n(top[1])}Q${n(cx)} ${n(cy)} ${n(ex)} ${n(ey)}Q${n(cx)} ${n(cy + 10 * s)} ${n(top[0])} ${n(top[1])}z`;
  }
  return out + fill(d, 'green-deep');
}

function bush(x, y, s, flower = false) {
  let d = '';
  let f = '';
  for (let i = 0; i < 9; i++) {
    const cx = x + between(-20, 20) * s;
    const cy = y - between(0, 14) * s;
    d += circle(cx, cy, between(5, 9) * s);
    if (flower && rnd() < 0.9) f += circle(cx + between(-3, 3) * s, cy + between(-3, 3) * s, between(2.2, 3.8) * s);
  }
  return fill(d, 'green') + (flower ? fill(f, 'flower') : '');
}

// ── Houses ──────────────────────────────────────────────────────────────────

const arch = (x, y, w, h) => `M${n(x)} ${n(y)}v${n(-(h - w / 2))}a${n(w / 2)} ${n(w / 2)} 0 0 1 ${n(w)} 0v${n(h - w / 2)}z`;

function dome(cx, y, r) {
  const h = r * 1.05;
  const left = `M${n(cx - r)} ${n(y)}C${n(cx - r * 1.04)} ${n(y - h * 0.8)} ${n(cx - r * 0.42)} ${n(y - h * 1.02)} ${n(cx)} ${n(y - h * 1.3)}`;
  const right = `C${n(cx + r * 0.42)} ${n(y - h * 1.02)} ${n(cx + r * 1.04)} ${n(y - h * 0.8)} ${n(cx + r)} ${n(y)}z`;
  let out = fill(left + right, 'wall');
  const shade = `M${n(cx + r * 0.2)} ${n(y)}C${n(cx + r * 0.42)} ${n(y - h * 0.6)} ${n(cx + r * 0.2)} ${n(y - h * 0.96)} ${n(cx)} ${n(y - h * 1.3)}${right}`;
  out += fill(shade, 'shade');
  out += lines(left + right, 'edge', 0.7);
  return out + lines(`M${n(cx)} ${n(y - h * 1.3)}v${n(-r * 0.36)}`, 'edge', 0.9);
}

/** One whitewashed block, lit on the left, with its shaded side in hatching. */
function house(x, base, w, h, s) {
  const side = w * between(0.18, 0.3);
  const top = base - h;
  let out = fill(`M${n(x + w)} ${n(top)}l${n(side)} ${n(-side * 0.14)}V${n(base)}H${n(x + w)}z`, 'shade');
  let hatch = '';
  for (let hx = x + w + 2.6 * s; hx < x + w + side; hx += 2.8 * s) {
    const t = (hx - (x + w)) / side;
    hatch += `M${n(hx)} ${n(top - side * 0.14 * t)}V${n(base)}`;
  }
  out += lines(hatch, 'hatch', 0.7);
  out += fill(rect(x, top, w, h), 'wall');
  // The parapet: every roof ends in a thin raised line.
  out += fill(rect(x - 1 * s, top - 2.4 * s, w + 2 * s, 2.4 * s), 'wall');
  out += lines(`M${n(x - 1 * s)} ${n(top - 2.4 * s)}h${n(w + 2 * s)}`, 'edge', 0.7);
  out += lines(`M${n(x)} ${n(top)}V${n(base)}`, 'edge', 0.6);

  // Windows, set on a loose grid. By day they are blue shutters; at night they light up.
  const ww = 5.2 * s;
  const wh = 9.5 * s;
  const cols = Math.max(1, Math.floor((w - 8 * s) / (ww * 2.6)));
  const rows = Math.max(1, Math.floor((h - 10 * s) / (wh * 2.1)));
  let glass = '';
  let lit = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() < 0.34) continue;
      const wx = x + (w - cols * ww * 2.6) / 2 + c * ww * 2.6 + ww * 0.8;
      const wy = top + 7 * s + r * wh * 2.1 + wh;
      const shape = arch(wx, wy, ww, wh);
      if (rnd() < 0.45) lit += shape;
      else glass += shape;
    }
  }
  if (glass) out += fill(glass, 'door');
  if (lit) out += fill(lit, 'window');
  if (w > 26 * s && rnd() < 0.72) {
    const dw = 8 * s;
    const dx = x + between(4 * s, w - dw - 4 * s);
    out += fill(arch(dx, base, dw, 15 * s), 'door');
    out += lines(`M${n(dx + dw / 2)} ${n(base)}v${n(-11 * s)}`, 'wall', 0.5);
  }
  return out;
}

function bougainvillea(x, y, s) {
  let f = '';
  let g = '';
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = rnd() ** 0.5;
    const cx = x + Math.cos(a) * rr * 20 * s;
    const cy = y + Math.sin(a) * rr * 11 * s + rr * 5 * s;
    if (i % 3 === 0) g += circle(cx, cy, 3.4 * s);
    else f += circle(cx, cy, between(1.8, 3.4) * s);
  }
  return fill(g, 'green') + fill(f, 'flower');
}

/** The square Tunisian minaret, with its gallery and small lantern on top. */
function minaret(x, base) {
  const w = 38;
  const h = 150;
  let out = house(x, base, w, h, 1.1);
  const top = base - h;
  out += fill(rect(x - 5, top - 9, w + 14, 9), 'wall') + lines(`M${x - 5} ${top - 9}h${w + 14}M${x - 5} ${top}h${w + 14}`, 'edge', 0.8);
  let teeth = '';
  for (let i = 0; i < 7; i++) teeth += rect(x - 5 + i * 8.2, top - 15, 5, 6);
  out += fill(teeth, 'wall');
  out += fill(rect(x + 9, top - 34, 22, 25), 'wall') + lines(`M${x + 9} ${top - 34}h22M${x + 31} ${top - 34}v25`, 'edge', 0.8);
  out += fill(arch(x + 15, top - 12, 8, 15), 'door');
  out += dome(x + 20, top - 34, 12);
  out += fill(arch(x + 12, top + 58, 14, 34), 'door') + fill(arch(x + 12, top + 118, 14, 34), 'door');
  return out;
}

function town() {
  const hill = [[800, 900], [905, 806], [1010, 730], [1096, 640], [1170, 548], [1262, 492], [1390, 462], [1500, 448], [1600, 440]];
  let out = fill(`M${pts(hill)}V${H}H800z`, 'hill');
  // Scrub on the slope, so the land reads between the houses.
  let d = '';
  for (let i = 0; i < 260; i++) {
    const y = between(460, 900);
    const left = xAtY(hill, y);
    if (left === null) continue;
    const x = between(left + 6, W);
    d += `M${n(x)} ${n(y)}l${n(between(5, 14))} ${n(between(-1, 2))}`;
  }
  out += lines(d, 'hill-line', 0.8);

  const items = [];
  const push = (y, svg) => items.push({ y, svg });

  // The big white rows, back to front. Each row is one street of the village.
  for (let row = 0; row < 15; row++) {
    const t = row / 14;
    const y = 498 + t * t * 80 + t * 310;
    const s = 0.72 + t * 0.72;
    const left = xAtY(hill, y);
    if (left === null) continue;
    let x = left + between(-4, 18);
    while (x < W + 30) {
      const w = pick([26, 30, 34, 40, 48, 56]) * s;
      const h = pick([22, 26, 30, 36, 42]) * s;
      const base = y + between(-5, 5) * s;
      let svg = house(x, base, w, h, s);
      if (w > 32 * s && rnd() < 0.2) svg += dome(x + w * 0.5, base - h - 2.4 * s, Math.min(w * 0.3, 13 * s));
      if (rnd() < 0.24) svg += bougainvillea(x + between(0, w), base - h * between(0.3, 0.95), s * 0.8);
      push(y, svg);
      const gapRoll = rnd();
      if (gapRoll < 0.13) push(y + 1, cypress(x + w + 10 * s, base + 2, s * between(0.62, 0.95)));
      else if (gapRoll < 0.22) push(y + 1, bush(x + w + 12 * s, base + 2, s * 0.8, rnd() < 0.5));
      x += w * 1.2 + (gapRoll < 0.22 ? 24 * s : between(2, 10) * s);
    }
  }
  // The landmarks stand at the top of the village, drawn by hand.
  push(505, minaret(1248, 548));
  push(506, dome(1344, 524, 26));
  push(506, house(1314, 562, 60, 38, 1.05));
  push(507, cypress(1214, 544, 1.1) + cypress(1296, 548, 0.9));
  push(508, palm(1430, 520, 1) + palm(1190, 584, 0.86));

  items.sort((a, b) => a.y - b.y);
  // Rocks where the village meets the water.
  let rocks = '';
  for (let x = 830; x < 1040; x += between(10, 26)) {
    const y = yAtX(hill, x) ?? 880;
    rocks += `M${n(x)} ${n(y + between(4, 14))}l${n(between(8, 16))} ${n(between(-7, -2))}l${n(between(8, 16))} ${n(between(4, 9))}z`;
  }
  out += fill(rocks, 'rock');
  out += items.map((i) => i.svg).join('');
  return out;
}

function headland() {
  const ridge = [[0, 648], [90, 650], [190, 662], [262, 684], [300, 712], [344, 726], [368, 758], [408, 776], [428, 812], [472, 830], [492, 866], [536, 876], [570, 902]];
  let out = fill(`M${pts(ridge)}V${H}H0z`, 'hill');
  // Terraces follow the hill in long curves, each held up by a low dry-stone wall.
  let walls = '';
  let stones = '';
  for (let i = 0; i < 7; i++) {
    const y = 682 + i * 32;
    const end = xAtY(ridge, y + 8) ?? 500;
    walls += `M0 ${n(y)}C${n(end * 0.3)} ${n(y - 8)} ${n(end * 0.7)} ${n(y - 2)} ${n(end)} ${n(y + 8)}`;
    for (let x = between(0, 22); x < end - 8; x += between(11, 24)) {
      const t = x / end;
      const yy = y - 8 * Math.sin(t * Math.PI) * 0.75 + 8 * t * t;
      stones += `M${n(x)} ${n(yy + 3)}h${n(between(5, 10))}`;
    }
  }
  out += lines(walls, 'hill-line', 1.1) + lines(stones, 'hill-line', 1);
  let d = '';
  for (let i = 0; i < 120; i++) {
    const x = between(0, 520);
    const top = yAtX(ridge, x);
    if (top === null) continue;
    d += `M${n(x)} ${n(between(top + 6, 900))}l${n(between(4, 10))} ${n(between(0, 2))}`;
  }
  out += lines(d, 'hill-line', 0.7);
  // Foam along the shore, a double line that follows the land.
  let foam = '';
  for (const off of [3.5, 8]) {
    for (let i = 0; i < ridge.length - 1; i++) {
      const [x1, y1] = ridge[i];
      const [x2, y2] = ridge[i + 1];
      if (x2 < 240) continue;
      foam += `M${n(x1 + off * 0.8)} ${n(y1 - off * 0.55)}L${n(x2 + off * 0.8)} ${n(y2 - off * 0.55)}`;
    }
  }
  out += lines(foam, 'wall', 1, ' stroke-dasharray="9 6"');
  // A koubba, the small white shrine found on Tunisian hills, among the olives.
  out += olive(70, 662, 0.95) + olive(150, 668, 0.8);
  out += house(186, 702, 52, 40, 1.05) + fill(rect(196, 658, 32, 6), 'wall') + dome(212, 658, 20);
  out += cypress(262, 708, 1) + palm(36, 668, 0.95);
  out += olive(70, 752, 1.25) + olive(320, 772, 1.1) + olive(190, 800, 1.35) + olive(400, 842, 1.05) + olive(70, 868, 1.5) + olive(286, 884, 1.4);
  out += bush(452, 868, 1, true) + bush(170, 878, 1.05, true);
  return out;
}

// ── Terrace ─────────────────────────────────────────────────────────────────

/** The eight-pointed star of Tunisian tiles, two squares turned on each other. */
function star(cx, cy, r) {
  const a = r * 0.72;
  return `M${n(cx - a)} ${n(cy - a)}h${n(a * 2)}v${n(a * 2)}h${n(-a * 2)}zM${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}z`;
}

function terrace() {
  const wallTop = LEDGE + 14;
  let out = fill(rect(0, wallTop, W, H - wallTop), 'terrace');
  // The tile frieze along the wall.
  let band = lines(`M0 ${wallTop + 13}H${W}M0 ${wallTop + 67}H${W}`, 'tile', 1);
  let stars = '';
  let dots = '';
  for (let x = 20; x < W; x += 54) {
    stars += star(x, wallTop + 40, 21);
    dots += circle(x, wallTop + 40, 3.4);
    dots += circle(x + 27, wallTop + 40, 1.8);
  }
  out += band + fill(stars, 'tile-field', ' fill-rule="evenodd"') + lines(stars, 'tile', 1) + fill(dots, 'tile');
  // The ledge itself, a slab of stone with hatching along its lit edge.
  out += fill(rect(0, LEDGE, W, 14), 'ledge');
  out += lines(`M0 ${LEDGE}H${W}M0 ${LEDGE + 14}H${W}`, 'edge', 1);
  let hatch = '';
  for (let x = 0; x < W; x += 5) hatch += `M${x} ${LEDGE + 9}v5`;
  out += lines(hatch, 'hatch', 0.7);

  // Left of the cast: a pot of jasmine and a glass of mint tea.
  const pot = 322;
  out += fill(`M${pot - 34} ${LEDGE - 54}h68l-9 54h-50z`, 'pot');
  out += lines(`M${pot - 34} ${LEDGE - 44}h68`, 'edge', 1);
  let leaf = '';
  let bloom = '';
  for (let i = 0; i < 46; i++) {
    const a = between(Math.PI, Math.PI * 2);
    const rr = rnd() ** 0.55;
    const cx = pot + Math.cos(a) * rr * 62;
    const cy = LEDGE - 54 + Math.sin(a) * rr * 58;
    leaf += circle(cx, cy, between(5, 10));
    if (i % 2 === 0) {
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2;
        bloom += circle(cx + Math.cos(pa) * 3.1, cy + Math.sin(pa) * 3.1, 2);
      }
    }
  }
  out += fill(leaf, 'green-deep') + fill(bloom, 'bloom');
  const tea = 424;
  out += fill(`M${tea - 15} ${LEDGE - 46}h30l-4 46h-22z`, 'glass');
  out += fill(`M${tea - 13.500} ${LEDGE - 34}h27l-3 34h-21z`, 'tea');
  out += lines(`M${tea - 15} ${LEDGE - 46}h30l-4 46h-22zM${tea - 14} ${LEDGE - 40}h28`, 'edge', 1);
  out += fill(rect(tea - 27, LEDGE - 6, 54, 6), 'door');
  let mint = '';
  for (const [dx, dy] of [[-6, -54], [3, -60], [9, -52], [-1, -50]]) mint += circle(tea + dx, LEDGE + dy, 5);
  out += fill(mint, 'green');

  // Right of the cast: an open notebook with the pen on it, and a lantern.
  const book = 1256;
  out += fill(`M${book - 92} ${LEDGE}l16 -22q38 -7 76 3v19zM${book + 92} ${LEDGE}l-16 -22q-38 -7 -76 3v19z`, 'paper');
  out += lines(`M${book - 92} ${LEDGE}l16 -22q38 -7 76 3q38 -10 76 -3l16 22zM${book} ${LEDGE}v-19`, 'edge', 1);
  let script = '';
  for (let i = 0; i < 4; i++) {
    const y = LEDGE - 17 + i * 4.2;
    script += `M${book - 72 - i * 3} ${n(y)}h${n(between(38, 56))}`;
    if (i < 2) script += `M${book + 12} ${n(y)}h${n(between(34, 54))}`;
  }
  out += lines(script, 'hatch', 1);
  out += lines(`M${book + 26} ${LEDGE - 7}l52 -30`, 'door', 3.2) + fill(circle(book + 24, LEDGE - 6, 2.3), 'sun');

  // A brass fanous: cap, ribbed glass, and a ring to carry it by.
  const lamp = 1388;
  const glass = `M${lamp - 15} ${LEDGE - 92}h30l11 26-11 54h-30l-11-54z`;
  out += fill(glass, 'lamp');
  out += lines(`M${lamp - 26} ${LEDGE - 66}h52M${lamp - 6} ${LEDGE - 92}l-4 26 4 54M${lamp + 6} ${LEDGE - 92}l4 26-4 54`, 'brass', 1.3);
  out += lines(glass, 'brass', 1.8);
  out += fill(`M${lamp - 18} ${LEDGE - 92}l18 -20 18 20z${rect(lamp - 19, LEDGE - 12, 38, 12)}`, 'brass');
  out += lines(`M${lamp} ${LEDGE - 112}v-9M${lamp - 5} ${LEDGE - 125}a5 5 0 1 0 10 0a5 5 0 1 0 -10 0`, 'brass', 1.6);
  return out;
}

// ── Branches that frame the view ────────────────────────────────────────────

function oliveBranch() {
  // Hangs in from the top left corner.
  let out = lines('M-8 112C70 118 150 150 212 214C252 256 286 276 340 290M92 128C118 96 150 80 190 74M168 172C160 214 170 250 196 290', 'trunk', 3);
  const stems = [[[-8, 112], [70, 118], [150, 150], [212, 214], [252, 256], [340, 290]], [[92, 128], [140, 88], [190, 74]], [[168, 172], [164, 220], [196, 290]]];
  let leaf = '';
  let shine = '';
  for (const stem of stems) {
    for (let i = 0; i < stem.length - 1; i++) {
      const [x1, y1] = stem[i];
      const [x2, y2] = stem[i + 1];
      for (let t = 0.1; t < 1; t += 0.2) {
        const x = x1 + (x2 - x1) * t;
        const y = y1 + (y2 - y1) * t;
        const base = Math.atan2(y2 - y1, x2 - x1);
        for (const flip of [-1, 1]) {
          const a = base + flip * between(0.5, 1);
          const len = between(26, 40);
          const ex = x + Math.cos(a) * len;
          const ey = y + Math.sin(a) * len;
          const wx = Math.cos(a + Math.PI / 2) * 6;
          const wy = Math.sin(a + Math.PI / 2) * 6;
          const mx = (x + ex) / 2;
          const my = (y + ey) / 2;
          leaf += `M${n(x)} ${n(y)}Q${n(mx + wx)} ${n(my + wy)} ${n(ex)} ${n(ey)}Q${n(mx - wx)} ${n(my - wy)} ${n(x)} ${n(y)}z`;
          shine += `M${n(x + (ex - x) * 0.15)} ${n(y + (ey - y) * 0.15)}L${n(x + (ex - x) * 0.85)} ${n(y + (ey - y) * 0.85)}`;
        }
      }
    }
  }
  let fruit = '';
  for (const [x, y] of [[214, 236], [152, 176], [262, 278], [118, 116]]) fruit += circle(x, y, 8);
  return out + fill(leaf, 'green-deep') + lines(shine, 'green', 0.9) + fill(fruit, 'trunk');
}

function bougainvilleaBranch() {
  // Falls in from the top right corner.
  const cane = 'M1608 58C1520 72 1452 118 1398 182C1362 226 1330 262 1272 286M1500 86C1480 128 1484 180 1508 232M1420 158C1392 150 1352 150 1316 166';
  let out = lines(cane, 'trunk', 3);
  let leaf = '';
  let petal = '';
  let heart = '';
  const spots = [[1540, 70], [1486, 96], [1440, 128], [1400, 176], [1360, 222], [1316, 262], [1274, 284], [1492, 150], [1496, 196], [1510, 234], [1384, 152], [1344, 152], [1318, 166], [1452, 86], [1560, 104], [1422, 214], [1544, 170]];
  for (const [x, y] of spots) {
    for (let i = 0; i < 2; i++) {
      const a = between(0, Math.PI * 2);
      const len = between(22, 32);
      const ex = x + Math.cos(a) * len;
      const ey = y + Math.sin(a) * len;
      const wx = Math.cos(a + Math.PI / 2) * 9;
      const wy = Math.sin(a + Math.PI / 2) * 9;
      leaf += `M${n(x)} ${n(y)}Q${n((x + ex) / 2 + wx)} ${n((y + ey) / 2 + wy)} ${n(ex)} ${n(ey)}Q${n((x + ex) / 2 - wx)} ${n((y + ey) / 2 - wy)} ${n(x)} ${n(y)}z`;
    }
  }
  for (const [x0, y0] of spots) {
    for (let k = 0; k < 3; k++) {
      const x = x0 + between(-20, 20);
      const y = y0 + between(-12, 16);
      const r = between(11, 16);
      const turn = rnd() * 2;
      for (let p = 0; p < 4; p++) {
        const a = turn + (p / 4) * Math.PI * 2;
        petal += `M${n(x)} ${n(y)}Q${n(x + Math.cos(a - 0.5) * r)} ${n(y + Math.sin(a - 0.5) * r)} ${n(x + Math.cos(a) * r * 1.25)} ${n(y + Math.sin(a) * r * 1.25)}Q${n(x + Math.cos(a + 0.5) * r)} ${n(y + Math.sin(a + 0.5) * r)} ${n(x)} ${n(y)}z`;
      }
      heart += circle(x, y, 2);
    }
  }
  return out + fill(leaf, 'green-deep') + fill(petal, 'flower') + fill(heart, 'bloom');
}

function birds() {
  const gull = (x, y, s) => `M${n(x - 11 * s)} ${n(y - 2 * s)}Q${n(x - 5 * s)} ${n(y - 7 * s)} ${n(x)} ${n(y)}Q${n(x + 5 * s)} ${n(y - 7 * s)} ${n(x + 11 * s)} ${n(y - 2 * s)}`;
  return lines(gull(286, 408, 0.9) + gull(330, 386, 0.65) + gull(252, 382, 0.55) + gull(1206, 402, 0.7), 'ink', 1.4);
}

const layers = {
  SKY: sky(),
  FAR: far() + birds(),
  SEA: sea(),
  LAND: headland() + town(),
  TERRACE: terrace() + oliveBranch() + bougainvilleaBranch(),
};

let out = `// Generated by scripts/draw-home-scene.mjs. Change the drawing there, not here.\n\n`;
out += `export const SCENE_W = ${W};\nexport const SCENE_H = ${H};\nexport const HORIZON = ${HORIZON};\nexport const LEDGE = ${LEDGE};\n\n`;
for (const [name, svg] of Object.entries(layers)) out += `export const ${name} = ${JSON.stringify(svg)};\n`;
writeFileSync(new URL('../src/features/home/scene.generated.ts', import.meta.url), out);
console.log(Object.entries(layers).map(([k, v]) => `${k} ${Math.round(v.length / 1024)}KB`).join('  '));
