// Xyntal – Worldwide. A pure function of time: window.seek(t) paints frame t (lib/motion.js).
// Timing is in beats (u) on the 84 BPM grid (beats.json); cues are word onsets from vo.json.
// docs/script_en.md is the plan. Helpers, the crowd, the app shots and the end card come from ../verbunden.
import * as M from './lib/motion.js';

const { W, H, E, prog, lerp, clamp, springU, springKeys, SPRING, wobble, kf, font, layout, glyph, text,
  fill, rrect, hash01, noise1, mix, bump, TAU, mulberry32 } = M;

const C = {
  bg: '#141416', bg2: '#1A1A1C', ink: '#ECEAE4', ink2: '#B9B7B0', ink3: '#918F89',
  gray: '#3A3A3F', gray2: '#5A5A61', sil: '#232326', pu: '#B36BFF', bl: '#3A8AFF', cy: '#3FE0F0',
};
const DISPLAY = 'Display', MONO = 'UI';

const HITS = [
  [0, 'hook', 'blip', { pitch: 'D6', gain: 0.1 }],
  [4.4, 'far light', 'blip', { pitch: 'A6', gain: 0.1 }],
  [6.93, 'founder tag', 'tick', { gain: 0.15 }],
  [12.1, 'idea', 'pop', { pitch: 'A5', gain: 0.22 }],
  [14.95, 'missing tile', 'blip', { pitch: 'F6', gain: 0.12 }],
  ...Array.from({ length: 14 }, (_, i) => [18.4 + i * 0.24, `asked ${i + 1}`, 'tick', { gain: 0.1 }]),
  [22.2, 'nobody fits', 'thud', { gain: 0.15 }],
  [24.85, 'travel to Lagos', 'whoosh', { len: 0.9, from: 400, to: 2000, gain: 0.16 }],
  [26.21, 'Lagos', 'tick', { gain: 0.2 }],
  [30.15, 'project?', 'pop', { pitch: 'E5', gain: 0.16 }],
  [33.3, 'travel to Seoul', 'whoosh', { len: 0.9, from: 400, to: 2000, pan: -0.3, gain: 0.16 }],
  [33.81, 'Seoul', 'tick', { gain: 0.2 }],
  [35.8, 'code', 'pop', { pitch: 'G5', gain: 0.16 }],
  [38.85, 'travel to New York', 'whoosh', { len: 0.9, from: 400, to: 2000, pan: 0.3, gain: 0.16 }],
  [39.59, 'New York', 'tick', { gain: 0.2 }],
  [40.9, 'chart', 'pop', { pitch: 'A5', gain: 0.16 }],
  [42.4, 'empty seat', 'pop', { pitch: 'D5', to: 'A4', gain: 0.14 }],
  [47.1, 'pull back', 'whoosh', { len: 1.2, from: 1500, to: 300, gain: 0.14 }],
  [48.8, 'circles', 'swell', { len: 0.8, gain: 0.1 }],
  ...[59.76, 60.4, 61.1, 61.8].map((b, i) => [b, `reach ${i}`, 'tick', { gain: 0.1 }]),
  ...[64.17, 64.39, 64.61, 64.83].map((b, i) => [b, `exists ${i}`, 'blip', { pitch: ['A5', 'C6', 'E6', 'A6'][i], gain: 0.07 }]),
  [66.4, 'drift', 'whoosh', { len: 1.5, from: 300, to: 900, gain: 0.08 }],
  [69.24, 'never touch', 'tick', { gain: 0.15 }],
  ...[0, 1, 2, 3, 4, 5].map((k) => [72.3 + k * 0.35, `bridge ${k}`, 'blip', { pitch: ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'][k], gain: 0.07 }]),
  ...[74.74, 75.86, 76.77, 77.93].map((b, i) => [b, `role ${i}`, 'tick', { gain: 0.16 }]),
  [82.75, 'app window', 'whoosh', { len: 0.6, from: 600, to: 2400, gain: 0.18 }],
  [83.2, 'window lands', 'thud', { gain: 0.2 }],
  [86.4, 'push to match', 'whoosh', { len: 0.7, from: 500, to: 1800, gain: 0.12 }],
  [86.91, '91 %', 'blip', { pitch: 'A6', gain: 0.1 }],
  [88.29, 'match cards', 'pop', { pitch: 'F5', gain: 0.2 }], [88.59, 'complement', 'pop', { pitch: 'A5', gain: 0.16 }],
  [90.55, 'cards fall', 'whoosh', { len: 0.5, from: 1800, to: 400, gain: 0.14 }],
  [91.8, 'crowd rises', 'swell', { len: 0.8, gain: 0.12 }],
  ...[92.0, 92.2, 92.45, 92.7].map((b, i) => [b, `crowd ${i}`, 'pop', { pitch: ['D5', 'F5', 'A5', 'D6'][i], gain: 0.07 }]),
  [94.38, 'Go find them', 'thud', { gain: 0.22 }],
  [96.05, 'streaks rise', 'riser', { len: 0.5, gain: 0.14 }],
  [96.4, 'stroke B', 'whoosh', { len: 0.25, from: 900, to: 4000, pan: -0.3, gain: 0.2 }],
  [96.7, 'stroke A', 'whoosh', { len: 0.25, from: 900, to: 4000, pan: 0.3, gain: 0.2 }],
  [97.0, 'logo hit', 'impact', { gain: 0.55 }],
  [97.5, 'sheen', 'bell', { pitch: 'D7', gain: 0.12 }],
];

// ---------------------------------------------------------------- helpers (from ../verbunden)
function grad(ctx, x0, y0, x1, y1, a = 1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgba(C.pu, a)); g.addColorStop(0.5, rgba(C.bl, a)); g.addColorStop(1, rgba(C.cy, a));
  return g;
}
function rgba(hex, a) { const [r, g, b] = M.hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }
// colour along the X gradient, p 0..1
function gradAt(p) { return p < 0.5 ? mix(C.pu, C.bl, p * 2) : mix(C.bl, C.cy, (p - 0.5) * 2); }

function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
// draw the first fraction p of a polyline
function drawPoly(ctx, pts, p) {
  if (p <= 0) return;
  const L = polyLen(pts) * clamp(p);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc + d >= L) { const k = (L - acc) / d; ctx.lineTo(lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)); break; }
    ctx.lineTo(pts[i][0], pts[i][1]); acc += d;
  }
  ctx.stroke();
}
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];

// Xyntal's own person symbol (head + shoulders), feet at (x, y), size s.
function person(ctx, x, y, s, col, sq = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1 + sq, 1 - sq);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-0.46 * s, 0); ctx.lineTo(-0.46 * s, -0.3 * s);
  ctx.bezierCurveTo(-0.46 * s, -0.62 * s, -0.26 * s, -0.7 * s, 0, -0.7 * s);
  ctx.bezierCurveTo(0.26 * s, -0.7 * s, 0.46 * s, -0.62 * s, 0.46 * s, -0.3 * s);
  ctx.lineTo(0.46 * s, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -0.98 * s, 0.23 * s, 0, TAU); ctx.fill();
  ctx.restore();
}

// The spark: ambition. A small gradient seed with a soft halo; g = 0..1 drains it to grey.
function spark(ctx, x, y, r, u, g = 0, a = 1) {
  if (r <= 0.3 || a <= 0) return;
  const pulse = 1 + 0.08 * Math.sin(u * TAU * 0.5);
  const R = r * pulse;
  ctx.save(); ctx.globalAlpha *= a;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, R * 4);
  halo.addColorStop(0, rgba(mix(C.bl, C.ink3, g), 0.35 * (1 - g * 0.7)));
  halo.addColorStop(1, rgba(C.bl, 0));
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, R * 4, 0, TAU); ctx.fill();
  const gr = ctx.createLinearGradient(x - R, y + R, x + R, y - R);
  gr.addColorStop(0, mix(C.pu, C.ink3, g)); gr.addColorStop(0.5, mix(C.bl, C.ink3, g)); gr.addColorStop(1, mix(C.cy, C.ink3, g));
  ctx.fillStyle = gr;
  // four-point star
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU - Math.PI / 2, rr = k % 2 ? R * 0.38 : R;
    ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// Hanging mono tag (the reference's price tag, in Xyntal's mono): string from (ax, ay) to the tag.
function tag(ctx, ax, ay, len, lines, u, u0, { size = 34, sw = 1, side = 0 } = {}) {
  const k = springU(u, u0, SPRING.bouncy);
  if (k <= 0.001) return;
  const rot = 0.22 * wobble(u - u0, 1.1, 1.6) * sw + 0.02 * Math.sin(u * 1.3);
  ctx.save();
  ctx.translate(ax, ay); ctx.rotate(rot);
  const L = len * k;
  ctx.strokeStyle = rgba(C.ink, 0.7); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, L); ctx.stroke();
  ctx.translate(0, L);
  ctx.scale(k, k);
  ctx.font = font(size, 500, MONO);
  const small = Math.round(size * 0.62);
  let w = 0;
  lines.forEach((ln, i) => { ctx.font = font(i ? small : size, 500, MONO); w = Math.max(w, ctx.measureText(ln).width); });
  const pad = size * 0.55, h = size * 1.15 + (lines.length - 1) * small * 1.35 + pad * 1.1;
  const x0 = side === 0 ? -w / 2 - pad : side < 0 ? -w - pad * 2 + 30 : -30;
  rrect(ctx, x0, 0, w + pad * 2, h, 6); ctx.fillStyle = C.ink; ctx.fill();
  lines.forEach((ln, i) => {
    const y = pad * 0.6 + size * 1.0 + (i ? size * 0.25 + i * small * 1.35 : 0);
    text(ctx, ln, x0 + pad, y, font(i ? small : size, 500, MONO), i ? '#3A3A3F' : C.bg, 'left', i ? 1 : 0.5);
  });
  ctx.restore();
}

// perspective floor grid under a horizon at y = hy (screen-ish world coords)
function floorGrid(ctx, hy, a, vx = 540, span = 4000) {
  if (a <= 0) return;
  ctx.save();
  ctx.strokeStyle = rgba(C.ink, 0.07 * a); ctx.lineWidth = 1.5;
  const vy = hy - 260;
  ctx.beginPath();
  for (let x = vx - span; x <= vx + span; x += 150) {
    const k = (hy - vy) / (1200);
    ctx.moveTo(vx + (x - vx) * k * 0.2, hy); ctx.lineTo(x, hy + 1200);
  }
  for (let i = 1; i < 16; i++) { const y = hy + 10 * i ** 1.75; ctx.moveTo(vx - span, y); ctx.lineTo(vx + span, y); }
  ctx.stroke();
  ctx.strokeStyle = rgba(C.ink, 0.22 * a); ctx.beginPath(); ctx.moveTo(vx - span, hy); ctx.lineTo(vx + span, hy); ctx.stroke();
  ctx.restore();
}

function bubbleRect(ctx, x, y, w, h, tail, { fillC = C.bg, strokeC = C.ink, lw = 4 } = {}) {
  // rounded rect with a tail to (tx, ty) from the bottom edge
  const r = Math.min(28, h / 3);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  if (tail) {
    const bx = clamp(tail[0], x + r + 30, x + w - r - 30);
    ctx.lineTo(bx + 22, y + h); ctx.lineTo(tail[0], tail[1]); ctx.lineTo(bx - 22, y + h);
  }
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
  if (strokeC) { ctx.strokeStyle = strokeC; ctx.lineWidth = lw; ctx.stroke(); }
}

function moon(ctx, x, y, r, k) {
  if (k <= 0) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.fillStyle = C.bg; ctx.beginPath(); ctx.arc(r * 0.42, -r * 0.28, r * 0.9, 0, TAU); ctx.fill();
  ctx.restore();
}

const STARS = Array.from({ length: 90 }, (_, i) => [hash01(i, 11) * W, 120 + hash01(i, 12) * 1000, 0.6 + hash01(i, 13) * 1.6, hash01(i, 14)]);
function stars(ctx, u, a) {
  if (a <= 0) return;
  for (const [x, y, r, ph] of STARS) {
    const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(u * 2.2 + ph * 40));
    ctx.fillStyle = rgba(C.ink, 0.5 * a * tw);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
}
// A mono label card tied to a light (the reference's price tag): a ring around the light, a thread
// up to a card that stays inside the safe area.
function label(ctx, p, lines, u, u0, sc, side, ringR = 26) {
  const k = springU(u, u0, SPRING.bouncy);
  if (k <= 0.001) return;
  const kk = clamp(k, 0, 1.15);
  // ring
  ctx.strokeStyle = rgba(C.ink, 0.9); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p[0], p[1], (ringR + 8 * wobble(u - u0, 1.2, 3)) * Math.min(1, k * 1.4), 0, TAU); ctx.stroke();
  const s1 = 64 * sc, s2 = 38 * sc, pad = 26 * sc;
  ctx.font = font(s1, 500, MONO); let w = ctx.measureText(lines[0]).width;
  ctx.font = font(s2, 500, MONO); lines.slice(1).forEach((l) => { w = Math.max(w, ctx.measureText(l).width + l.length * 1); });
  if (w + pad * 2 > 850) { const f = 850 / (w + pad * 2); return label(ctx, p, lines, u, u0, sc * f, side, ringR); }
  const cw = w + pad * 2, ch = s1 * 1.1 + (lines.length - 1) * s2 * 1.45 + pad * 1.6;
  let x = side > 0 ? p[0] + 40 : p[0] - 40 - cw;
  x = clamp(x, 72, 930 - cw);
  const y = p[1] - 120 * sc - ch;
  const ax = clamp(p[0], x + 30, x + cw - 30);
  // thread
  ctx.strokeStyle = rgba(C.ink, 0.75); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p[0], p[1] - ringR); ctx.lineTo(lerp(p[0], ax, kk), lerp(p[1] - ringR, y + ch, kk)); ctx.stroke();
  const rot = 0.06 * wobble(u - u0, 1.1, 2.2) * side;
  ctx.save(); ctx.translate(ax, y + ch); ctx.rotate(rot); ctx.scale(kk, kk); ctx.translate(-ax, -(y + ch));
  rrect(ctx, x, y, cw, ch, 6); ctx.fillStyle = C.ink; ctx.fill();
  text(ctx, lines[0], x + pad, y + pad * 0.7 + s1 * 0.95, font(s1, 500, MONO), C.bg, 'left', 1);
  lines.slice(1).forEach((l, i) => text(ctx, l, x + pad, y + pad * 0.7 + s1 * 1.1 + (i + 1) * s2 * 1.45 - s2 * 0.25, font(s2, 500, MONO), '#3A3A3F', 'left', 1));
  ctx.restore();
}

const XS = 1100, XC = [540, 850];
const qpt = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
const XB = [[140, 140], [300, 212], [372, 372]], XA = [[140, 372], [212, 212], [372, 140]];
const toX = ([x, y]) => [XC[0] + (x - 256) / 512 * XS, XC[1] + (y - 256) / 512 * XS];
// The Xyntal mark from its own SVG geometry (assets/logo/icon_0.svg): stroke B (blue -> cyan), a dark
// gap, stroke A (purple -> blue) over it. pB / pA draw each stroke; heads light the drawing tips;
// sheen (0..1) runs a light band across the mark.
function logoMark(ctx, cx, cy, size, { pB = 1, pA = 1, alpha = 1, sheen = -1, heads = true, gapC = C.bg } = {}) {
  if (alpha <= 0.002) return;
  const s = size / 512;
  const pts = (P) => Array.from({ length: 48 }, (_, i) => qpt(...P, i / 47));
  const PB = pts(XB), PA = pts(XA);
  const tip = (P, p) => qpt(...P, clamp(p));
  ctx.save(); ctx.translate(cx - 256 * s, cy - 256 * s); ctx.scale(s, s);
  ctx.globalAlpha *= alpha; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const gb = ctx.createLinearGradient(140, 140, 372, 372); gb.addColorStop(0, C.bl); gb.addColorStop(1, C.cy);
  const ga = ctx.createLinearGradient(140, 372, 372, 140); ga.addColorStop(0, C.pu); ga.addColorStop(1, C.bl);
  const band = () => {
    const a = -0.6, d = [Math.cos(a), Math.sin(a)], t = -260 + sheen * 520;
    const g = ctx.createLinearGradient(256 + d[0] * (t - 70), 256 + d[1] * (t - 70), 256 + d[0] * (t + 70), 256 + d[1] * (t + 70));
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    return g;
  };
  const sh = sheen > 0 && sheen < 1;
  ctx.lineWidth = 60; ctx.strokeStyle = gb; drawPoly(ctx, PB, pB);
  if (sh) { ctx.strokeStyle = band(); drawPoly(ctx, PB, pB); }
  if (pA > 0) {
    ctx.lineWidth = 96; ctx.strokeStyle = gapC; drawPoly(ctx, PA, pA);
    ctx.lineWidth = 60; ctx.strokeStyle = ga; drawPoly(ctx, PA, pA);
    if (sh) { ctx.strokeStyle = band(); drawPoly(ctx, PA, pA); }
  }
  if (heads) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [P, p, col] of [[XB, pB, C.cy], [XA, pA, C.bl]]) {
      if (p <= 0 || p >= 1) continue;
      const [x, y] = tip(P, p);
      const g = ctx.createRadialGradient(x, y, 0, x, y, 110);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 110, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}
function bloom(ctx, x, y, r, a, col = '#FFFFFF') {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(0.35, rgba(C.bl, a * 0.35)); g.addColorStop(1, rgba(C.bl, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
// wordmark that tracks in: letters start spread and faint, close up to the brand's tracking
function wordmarkIn(ctx, u, t0, x, base, size, a = 1) {
  const wf = font(size, 600, DISPLAY);
  const L = layout(ctx, 'xyntal', wf, -size * 0.02);
  L.glyphs.forEach((g, j) => {
    const k = clamp(springU(u, t0 + j * 0.035, SPRING.snappy), 0, 1.05);
    if (k <= 0) return;
    const spread = (j - 2.5) * size * 0.3 * (1 - k);
    glyph(ctx, g.ch, x - L.width / 2 + g.cx + spread, base + (1 - k) * size * 0.12, wf, rgba(C.ink, clamp(k) * a));
  });
}
// ======================================================================= the world (u 0..82.75)
// One continuous camera over a tall world: four cities stacked in a zig-zag (Berlin, Lagos, Seoul, New York),
// each with its own dashed ground line. The camera travels between them along a dotted route, pulls back to
// show their circles, which drift close but never touch, until Xyntal links them and the field of everyone else.
const CITIES = [
  { name: 'BERLIN', role: 'FOUNDER', p: [-1000, 0], at: 0 },
  { name: 'LAGOS', role: 'DESIGNER', p: [1000, 0], at: 26.21 },
  { name: 'SEOUL', role: 'ENGINEER', p: [-1000, 1600], at: 33.81 },
  { name: 'NEW YORK', role: 'CEO', p: [1000, 1600], at: 39.59 },
];
const KM = [0, 5196, 5196 + 12399, 5196 + 12399 + 11053];
const FS2 = 170;                                   // hero figure size (world units)
const CEN = [CITIES.reduce((a, c) => a + c.p[0], 0) / 4, CITIES.reduce((a, c) => a + c.p[1], 0) / 4];
const CONV = 0.64;                                 // how close the circles drift (they stay just apart)
const RING = 480;                                  // circle radius (world)
// where each hero stands at beat u: home, then drifting toward the middle ("their circles never touch")
function heroPos(i, u) {
  const p = CITIES[i].p;
  const k = E.inOutCubic(prog(u, 66.4, 69.6));
  return [lerp(p[0], CEN[0] + (p[0] - CEN[0]) * CONV, k), lerp(p[1], CEN[1] + (p[1] - CEN[1]) * CONV, k)];
}
const FRAME = (p) => [p[0], p[1] - 210];           // camera centre that puts the feet low in the frame

function worldCam(u) {
  const Z0 = 1.0;
  const legs = [[24.85, 26.7, 0, 1], [33.3, 34.9, 1, 2], [38.85, 40.45, 2, 3]];
  let c = FRAME(CITIES[0].p), z = kf(u, [[0, 1.3], [5.5, 1.0], [17.6, 1.0], [18.6, 0.86], [23.6, 0.86], [24.85, 1.0]], E.inOutSine);
  for (const [a, b, i, j] of legs) {
    if (u >= a) {
      const p = E.inOutCubic(prog(u, a, b));
      c = [lerp(FRAME(CITIES[i].p)[0], FRAME(CITIES[j].p)[0], p), lerp(FRAME(CITIES[i].p)[1], FRAME(CITIES[j].p)[1], p)];
      z = Z0 * (1 - 0.42 * Math.sin(Math.PI * p));
    }
  }
  if (u >= 47.1) {   // pull back: all four
    const p = E.inOutCubic(prog(u, 47.1, 49.8));
    // framed so the top circle clears the counter and the bottom one the captions (screen 440..1490)
    const d = E.inOutCubic(prog(u, 66.4, 69.8));
    const far = [CEN[0], lerp(718, 690, d)];   // content between the counter and the captions
    c = [lerp(FRAME(CITIES[3].p)[0], far[0], p), lerp(FRAME(CITIES[3].p)[1], far[1], p)];
    z = Math.exp(lerp(Math.log(Z0), Math.log(0.34), p));
    z *= Math.exp(Math.log(1.31) * d);                                         // in with the drift
    z *= Math.exp(Math.log(0.22) * E.inOutSine(prog(u, 73.4, 81.6)));        // out over everyone
  }
  return { cx: c[0], cy: c[1], z };
}
const W2S = (p, cam) => [(p[0] - cam.cx) * cam.z + W / 2, (p[1] - cam.cy) * cam.z + H / 2];

// figures with a glow (the reference's soft light), props drawn in the hero's hand
function hero(ctx, x, y, s, u, glow = 1, wob = 0) {
  ctx.save();
  ctx.shadowColor = rgba('#FFFFFF', 0.55 * glow); ctx.shadowBlur = 46;
  person(ctx, x, y, s, C.ink, wob);
  ctx.restore();
}
function ground(ctx, x, y, half, a, z) {
  if (a <= 0) return;
  ctx.save(); ctx.strokeStyle = rgba(C.ink, 0.28 * a); ctx.lineWidth = 2.4 / Math.max(z, 0.3);
  ctx.setLineDash([14 / Math.max(z, 0.3), 12 / Math.max(z, 0.3)]);
  ctx.beginPath(); ctx.moveTo(x - half, y + 4); ctx.lineTo(x + half, y + 4); ctx.stroke(); ctx.restore();
}
// faint dot grid that slides with the camera (parallax 0.5)
function dotGrid(ctx, cam) {
  const sp = 64, ox = ((-cam.cx * cam.z * 0.5) % sp + sp) % sp, oy = ((-cam.cy * cam.z * 0.5) % sp + sp) % sp;
  ctx.fillStyle = rgba(C.ink, 0.05);
  for (let x = ox; x < W; x += sp) for (let y = oy; y < H; y += sp) ctx.fillRect(x, y, 2, 2);
}
// a counter at the top: tiny caps label + a big value (numbers roll, text swaps)
function counter(ctx, lab, val, a, dy = 0) {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a;
  text(ctx, lab, 540, 318 + dy, font(26, 500, MONO), C.ink3, 'center', 3);
  text(ctx, val, 540, 410 + dy, font(86, 500, MONO), C.ink, 'center', -2);
  ctx.restore();
}
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function caption(ctx, s, a) {
  if (a <= 0.01 || !s) return;
  text(ctx, s, 540, 1420, font(34, 500, MONO), rgba(C.ink2, a), 'center', 2);
}
// the founder's idea: a phone sketch with one empty, dashed tile (the missing designer)
function sketch(ctx, u, x, y, s) {
  const k = clamp(springU(u, 12.1, SPRING.bouncy), 0, 1.15);
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k * s, k * s);
  bubbleRect(ctx, -150, -190, 300, 330, [-40, 220], { lw: 4 });
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4; rrect(ctx, -62, -160, 124, 250, 18); ctx.stroke();
  ctx.fillStyle = rgba(C.ink, 0.9); rrect(ctx, -44, -136, 88, 46, 6); ctx.fill();
  [[-44, -76], [4, -76], [-44, -26]].forEach(([tx, ty]) => { rrect(ctx, tx, ty, 40, 40, 6); ctx.fill(); });
  const miss = 1 + 0.12 * Math.sin(u * 8) * clamp(prog(u, 14.9, 15.3)) * (1 - prog(u, 17.0, 17.6));
  ctx.save(); ctx.translate(24, -6); ctx.scale(miss, miss);
  ctx.setLineDash([6, 6]); ctx.strokeStyle = grad(ctx, -20, 0, 20, 0); ctx.lineWidth = 3; rrect(ctx, -20, -20, 40, 40, 6); ctx.stroke();
  ctx.setLineDash([]); text(ctx, '?', 0, 11, font(30, 800, DISPLAY), C.ink, 'center');
  ctx.restore();
  ctx.fillStyle = grad(ctx, -44, 0, 44, 0); rrect(ctx, -44, 40, 88, 24, 12); ctx.fill();
  ctx.restore();
}
// the 14 people the founder asks (two rows), each with a "?" when counted, a head shake on "Nobody fits"
const ASK = Array.from({ length: 14 }, (_, i) => {
  const back = i >= 7, k = back ? i - 7 : i;
  const side = k % 2 ? 1 : -1, n = Math.floor((k + 1) / 2);
  return { x: side * (150 + n * 150 + (back ? 75 : 0)), back, s: back ? 120 : 150, u0: 18.4 + i * 0.24, side };
});
function askers(ctx, u) {
  if (u < 18.2 || u > 24.9) return;
  const out = E.inCubic(prog(u, 23.5, 24.6));
  for (const [pass, rowBack] of [[0, true], [1, false]]) {
    for (const a of ASK) {
      if (a.back !== rowBack) continue;
      const k = clamp(springU(u, a.u0 - 0.3, SPRING.gentle), 0, 1.05);
      if (k <= 0.01) continue;
      const x = a.x + a.side * (1 - k) * 700 + a.side * out * 900, y = rowBack ? -40 : 0;
      const shake = 10 * Math.sin((u - 22.13) * 30) * bump(u, 22.6 + Math.abs(a.x) * 0.0006, 0.5);
      person(ctx, x + shake, y, a.s, rowBack ? '#45454B' : C.gray2);
      const q = clamp(springU(u, a.u0, SPRING.bouncy), 0, 1.2) * (1 - prog(u, 21.9, 22.3));
      if (q > 0.01) { ctx.save(); ctx.translate(x, y - a.s * 1.45); ctx.scale(q, q); text(ctx, '?', 0, 0, font(54, 800, DISPLAY), C.ink3, 'center'); ctx.restore(); }
      const no = clamp(springU(u, 22.2 + Math.abs(a.x) * 0.0006, SPRING.bouncy), 0, 1.2) * (1 - out);
      if (no > 0.01) {
        ctx.save(); ctx.translate(x, y - a.s * 1.5); ctx.scale(no, no); ctx.strokeStyle = C.ink3; ctx.lineWidth = 6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(14, 14); ctx.moveTo(14, -14); ctx.lineTo(-14, 14); ctx.stroke(); ctx.restore();
      }
    }
  }
}
// props per hero
function prop(ctx, i, x, y, s, u) {
  ctx.save(); ctx.strokeStyle = C.ink; ctx.fillStyle = C.ink; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (i === 1) {        // designer: a sketchbook with a curve on it, and an empty frame (the project worth her time)
    ctx.save(); ctx.translate(x + s * 0.62, y - s * 0.5); ctx.rotate(-0.12);
    rrect(ctx, -34, -44, 68, 88, 6); ctx.fillStyle = C.bg; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = grad(ctx, -24, 0, 24, 0); ctx.beginPath(); ctx.moveTo(-22, 18); ctx.bezierCurveTo(-10, -30, 10, 30, 22, -18); ctx.stroke();
    ctx.restore();
    const f = clamp(springU(u, 30.15, SPRING.bouncy), 0, 1.15) * (1 - prog(u, 33.0, 33.4));
    if (f > 0.01) { ctx.save(); ctx.translate(x - s * 0.9, y - s * 1.7); ctx.scale(f, f); ctx.setLineDash([10, 8]); ctx.lineWidth = 4; ctx.strokeStyle = C.ink2; rrect(ctx, -60, -46, 120, 92, 10); ctx.stroke(); ctx.setLineDash([]); text(ctx, 'PROJECT?', 0, 8, font(20, 500, MONO), C.ink2, 'center', 1); ctx.restore(); }
  } else if (i === 2) { // engineer: laptop + code brackets
    ctx.beginPath(); ctx.moveTo(x + s * 0.42, y - s * 0.32); ctx.lineTo(x + s * 0.95, y - s * 0.32); ctx.lineTo(x + s * 1.08, y - s * 0.78); ctx.stroke();
    const f = clamp(springU(u, 35.8, SPRING.bouncy), 0, 1.15) * (1 - prog(u, 38.6, 39.0));
    if (f > 0.01) { ctx.save(); ctx.translate(x + s * 0.9, y - s * 1.45); ctx.scale(f, f); text(ctx, '</>', 0, 0, font(52, 500, MONO), C.ink, 'center'); ctx.restore(); }
  } else if (i === 3) { // CEO: a rising chart and an empty seat next to him
    const f = clamp(springU(u, 40.9, SPRING.bouncy), 0, 1.15);
    if (f > 0.01) {
      ctx.save(); ctx.translate(x - s * 1.05, y - s * 1.35); ctx.scale(f, f);
      ctx.strokeStyle = grad(ctx, -50, 30, 50, -30); ctx.beginPath(); ctx.moveTo(-50, 30); ctx.lineTo(-15, 5); ctx.lineTo(10, 15); ctx.lineTo(50, -30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, -30); ctx.lineTo(50, -30); ctx.lineTo(50, -12); ctx.stroke(); ctx.restore();
    }
    const e = clamp(springU(u, 42.4, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 46.6, 47.2));
    if (e > 0.01) {
      ctx.save(); ctx.translate(x + s * 1.15, y); ctx.scale(e, e); ctx.setLineDash([9, 8]); ctx.lineWidth = 4; ctx.strokeStyle = C.ink3;
      ctx.beginPath(); ctx.arc(0, -s * 0.98, s * 0.23, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.46 * s, 0); ctx.lineTo(-0.46 * s, -0.3 * s); ctx.bezierCurveTo(-0.46 * s, -0.62 * s, -0.26 * s, -0.7 * s, 0, -0.7 * s); ctx.bezierCurveTo(0.26 * s, -0.7 * s, 0.46 * s, -0.62 * s, 0.46 * s, -0.3 * s); ctx.lineTo(0.46 * s, 0); ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
}
// each hero's circle: a ring with the people they happen to know
function circleOf(ctx, cx, cy, u, a, seed, z) {
  if (a <= 0.01) return;
  ctx.save();
  ctx.strokeStyle = rgba(C.ink, 0.3 * a); ctx.lineWidth = 3 / Math.max(z, 0.2);
  ctx.beginPath(); ctx.arc(cx, cy, RING, 0, TAU); ctx.stroke();
  for (let k = 0; k < 9; k++) {
    const ang = (k / 9) * TAU + seed;
    const r = RING * (0.62 + 0.2 * hash01(k, seed * 10 + 3));
    const px = cx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r * 0.9 + 60;
    const kk = clamp(springU(u, 48.8 + k * 0.08 + seed * 0.1, SPRING.bouncy), 0, 1.1) * a;
    const bob = 10 * Math.sin(u * 1.7 + k * 1.3 + seed * 2);
    if (kk > 0.01) person(ctx, px, py + bob, 110 * Math.min(1, kk), rgba(mix(C.gray, C.gray2, hash01(k, seed)), Math.min(1, kk)));
  }
  ctx.restore();
}
// the field: everyone else, in their own circles, all over the world
const FIELD = (() => {
  const out = [], R = mulberry32(4242);
  const heroEnd = CITIES.map((c) => [CEN[0] + (c.p[0] - CEN[0]) * CONV, CEN[1] + (c.p[1] - CEN[1]) * CONV]);
  for (let gx = -6; gx <= 6; gx++) for (let gy = -8; gy <= 13; gy++) {
    const x = CEN[0] + gx * 1250 + (R() - 0.5) * 520, y = CEN[1] + (gy - 2.5) * 1250 + (R() - 0.5) * 520;
    if (heroEnd.some((h) => Math.hypot(h[0] - x, h[1] - y) < 1450)) continue;
    out.push({ x, y, d: Math.hypot(x - CEN[0], (y - CEN[1]) * 0.6), role: Math.floor(R() * 4), tag: R() < 0.22, seed: R() * 6, n: 5 + Math.floor(R() * 5) });
  }
  out.sort((a, b) => a.d - b.d);
  const P = [...heroEnd, ...out.map((f) => [f.x, f.y])];
  const E2 = [];
  P.forEach((p, i) => {
    const near = P.map((q, j) => [Math.hypot(q[0] - p[0], q[1] - p[1]), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]);
    for (const [, j] of near.slice(0, 2)) if (!E2.some(([a, b]) => (a === j && b === i) || (a === i && b === j))) E2.push([i, j]);
  });
  return { out, P, E: E2 };
})();
const ROLES = [['DESIGNER', 74.74], ['FOUNDER', 75.86], ['ENGINEER', 76.77], ['CEO', 77.93]];

function sceneWorld(ctx, u) {
  fill(ctx, C.bg);
  const cam = worldCam(u);
  dotGrid(ctx, cam);
  const z = cam.z;
  const fade = 1 - prog(u, 82.75, 83.5);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cam.cx, -cam.cy);
  // the field (from "Meet Xyntal")
  if (u > 73) {
    for (const f of FIELD.out) {
      const a = clamp(prog(u, 73.4 + f.d / 9000 * 5, 74.2 + f.d / 9000 * 5)) * fade;
      if (a <= 0.01) continue;
      ctx.strokeStyle = rgba(C.ink, 0.22 * a); ctx.lineWidth = 3 / z;
      ctx.beginPath(); ctx.arc(f.x, f.y, RING * 0.8, 0, TAU); ctx.stroke();
      for (let k = 0; k < f.n; k++) {
        const ang = (k / f.n) * TAU + f.seed, r = RING * 0.5;
        person(ctx, f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r * 0.9 + 60, 100, rgba(C.gray2, a));
      }
      ctx.save(); ctx.shadowColor = rgba('#FFFFFF', 0.5 * a); ctx.shadowBlur = 30; person(ctx, f.x, f.y + 70, 150, rgba(C.ink, 0.9 * a)); ctx.restore();
    }
  }
  // the route between the cities (S4-S6), drawn as the camera travels
  [[24.85, 26.7, 0, 1], [33.3, 34.9, 1, 2], [38.85, 40.45, 2, 3]].forEach(([a, b, i, j]) => {
    const p = E.inOutCubic(prog(u, a, b));
    if (p <= 0) return;
    const A = heroPos(i, u), B = heroPos(j, u);
    const dx = B[0] - A[0], dy = B[1] - A[1], dl = Math.hypot(dx, dy) || 1;
    const mid = [(A[0] + B[0]) / 2 + (dy / dl) * 520, (A[1] + B[1]) / 2 - Math.abs(dx / dl) * 520 - 300];   // arcs over the top
    const pts = Array.from({ length: 40 }, (_, k) => qpt([A[0], A[1] - 300], mid, [B[0], B[1] - 300], k / 39));
    const ra = (1 - prog(u, 47.1, 49.0)) * fade;
    ctx.save(); ctx.setLineDash([10 / z, 16 / z]); ctx.strokeStyle = rgba(C.ink, 0.45 * ra); ctx.lineWidth = 3 / z; drawPoly(ctx, pts, p); ctx.restore();
    if (p < 1) { const q = qpt([A[0], A[1] - 300], mid, [B[0], B[1] - 300], p); bloom(ctx, q[0], q[1], 60 / z, 0.8); }
  });
  // circles (from "your network is an accident")
  const ca = clamp(prog(u, 48.4, 49.4)) * fade;
  CITIES.forEach((c, i) => { const p = heroPos(i, u); circleOf(ctx, p[0], p[1] - 200, u, ca, i + 1, z); });
  // "the best teams never form": dashed reaches between the heroes that stop at the edge of their circle
  if (u > 59.5 && u < 66.5) {
    [[0, 1, 59.76], [2, 3, 60.4], [1, 2, 61.1], [0, 3, 61.8]].forEach(([i, j, b]) => {
      const A = heroPos(i, u), B = heroPos(j, u);
      const a0 = [A[0], A[1] - 260], b0 = [B[0], B[1] - 260];
      const len = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
      const reach = Math.min(0.92, (RING - 40) / len) * E.outCubic(prog(u, b, b + 0.6));
      const die = prog(u, b + 1.6, b + 2.4);
      if (reach <= 0 || die >= 1) return;
      ctx.save(); ctx.setLineDash([14 / z, 12 / z]); ctx.strokeStyle = rgba(C.ink, 0.7 * (1 - die)); ctx.lineWidth = 3.5 / z;
      drawPoly(ctx, [a0, b0], reach);
      ctx.restore();
      const end = [lerp(a0[0], b0[0], reach), lerp(a0[1], b0[1], reach)];
      if (reach > 0.05) { ctx.fillStyle = rgba(C.ink3, 0.8 * (1 - die)); ctx.beginPath(); ctx.arc(end[0], end[1], 9 / z, 0, TAU); ctx.fill(); }
    });
  }
  if (u > 63.8 && u < 67) {
    CITIES.forEach((c, i) => { const p = heroPos(i, u); bloom(ctx, p[0], p[1] - 120, 260, 0.75 * bump(u, 64.17 + i * 0.22, 0.45)); });
  }
  // Xyntal: bridges between the four, then links across the field, with light packets
  if (u > 72.1) {
    const H4 = CITIES.map((_, i) => { const p = heroPos(i, u); return [p[0], p[1] - 260]; });
    const pairs = [[0, 1], [1, 2], [2, 3], [0, 2], [1, 3], [0, 3]];
    pairs.forEach(([i, j], k) => {
      const q = E.outCubic(prog(u, 72.3 + k * 0.35, 72.8 + k * 0.35));
      if (q <= 0) return;
      ctx.strokeStyle = grad(ctx, H4[i][0], H4[i][1], H4[j][0], H4[j][1], fade); ctx.lineWidth = 7 / Math.max(z, 0.25);
      drawPoly(ctx, [H4[i], H4[j]], q);
    });
    FIELD.E.forEach(([i, j], k) => {
      if (i < 4 && j < 4) return;
      const d = Math.min(i < 4 ? 0 : FIELD.out[i - 4].d, j < 4 ? 0 : FIELD.out[j - 4].d);
      const t0 = 76.0 + d / 9000 * 4.5;
      const q = E.outCubic(prog(u, t0, t0 + 0.6));
      if (q <= 0) return;
      const A = FIELD.P[i], B = FIELD.P[j];
      ctx.strokeStyle = grad(ctx, A[0], A[1], B[0], B[1], 0.8 * fade); ctx.lineWidth = 4 / Math.max(z, 0.2);
      drawPoly(ctx, [A, B], q);
      if (q >= 1) {
        const ph = ((u - t0) * 0.6 + hash01(k, 8)) % 1;
        bloom(ctx, lerp(A[0], B[0], ph), lerp(A[1], B[1], ph), 30 / z, 0.7 * fade);
      }
    });
  }
  // the four heroes, on their ground lines
  CITIES.forEach((c, i) => {
    const p = heroPos(i, u);
    const seen = i === 0 ? 1 : clamp(prog(u, c.at - 1.6, c.at - 0.6));
    ground(ctx, p[0], p[1], 760, seen * (1 - prog(u, 47.4, 48.6)) * fade, z);
    if (seen <= 0) return;
    hero(ctx, p[0], p[1], FS2, u, seen * fade, i === 0 ? 0.03 * wobble(u, 2, 3) : 0.04 * wobble(u - c.at + 0.6, 2, 3));
    if (u < 47.4) prop(ctx, i, p[0], p[1], FS2, u);
    if (i === 0) {
      spark(ctx, p[0], p[1] - FS2 * 1.48, 15, u, 0, fade);
      if (u < 18.0) sketch(ctx, u, p[0] + 240, p[1] - 470, 0.95);
    }
  });
  if (u < 25) { ctx.save(); ctx.translate(CITIES[0].p[0], CITIES[0].p[1]); askers(ctx, u); ctx.restore(); }
  ctx.restore();

  // far light on the hook (another one out there)
  const far = bump(u, 4.4, 1.4);
  if (far > 0.01) { bloom(ctx, W - 60, 980, 90, 0.9 * far); text(ctx, '→', W - 120, 990, font(40, 500, MONO), rgba(C.ink2, far), 'center'); }
  // role tags on the field
  if (u > 74.5 && u < 83.4) {
    FIELD.out.forEach((f, k) => {
      if (!f.tag) return;
      const [role, b] = ROLES[f.role];
      const t = b + (k % 7) * 0.05;
      const kk = clamp(springU(u, t, SPRING.bouncy), 0, 1.1) * fade;
      if (kk <= 0.01) return;
      const s = W2S([f.x, f.y - 260], cam);
      if (s[0] < 60 || s[0] > W - 60 || s[1] < 470 || s[1] > 1340) return;
      ctx.save(); ctx.translate(s[0], s[1]); ctx.scale(kk, kk);
      ctx.font = font(22, 500, MONO); const tw = ctx.measureText(role).width + 22;
      rrect(ctx, -tw / 2, -18, tw, 30, 6); ctx.fillStyle = rgba(C.ink, 0.92); ctx.fill();
      text(ctx, role, 0, 4, font(22, 500, MONO), C.bg, 'center', 1);
      ctx.restore();
    });
  }
  // counters
  const tOn = (a, b) => clamp(prog(u, a, a + 0.3)) * (1 - prog(u, b - 0.3, b));
  counter(ctx, 'CITY', 'BERLIN', u < 0.3 ? 1 : tOn(0, 18.2));
  if (u > 18 && u < 24.9) {
    const n = Math.min(14, Math.floor(clamp(prog(u, 18.3, 21.6)) * 14 + 0.0001));
    counter(ctx, 'PEOPLE ASKED', String(n), tOn(18.1, 24.9));
    counter(ctx, 'DESIGNERS FOUND', '0', tOn(18.6, 24.9) * 0.9, 150);
  }
  if (u > 24.7 && u < 47.4) {
    let km = 0;
    [[24.85, 26.7, 1], [33.3, 34.9, 2], [38.85, 40.45, 3]].forEach(([a, b, j]) => { if (u >= a) km = lerp(KM[j - 1], KM[j], E.inOutCubic(prog(u, a, b))); });
    counter(ctx, 'DISTANCE TRAVELLED', fmt(km) + ' KM', tOn(24.75, 47.4));
  }
  if (u > 57.8 && u < 82.8) {
    const team = u < 72.3 ? 0 : 1 + Math.min(3, Math.floor(prog(u, 72.3, 74.0) * 3.999));
    counter(ctx, 'TEAM', `${team} / 4`, tOn(57.9, 82.8));
  }
  // captions under the scene
  const caps = [[6.93, 14.9, 'FOUNDER · BERLIN'], [14.95, 18.0, 'MISSING: DESIGN'], [18.66, 22.1, 'FRIENDS · CLASSMATES · COLLEAGUES'],
    [22.13, 24.8, 'NOBODY FITS'], [26.21, 33.2, 'LAGOS · DESIGNER'], [33.81, 38.8, 'SEOUL · ENGINEER'], [39.59, 47.0, 'NEW YORK · CEO'],
    [48.39, 51.7, 'YOUR CIRCLE'], [51.84, 53.4, 'WHERE YOU GREW UP'], [53.48, 55.1, 'WHERE YOU STUDIED'], [55.2, 57.9, 'WHO YOU SAT NEXT TO'],
    [67.56, 72.1, 'CIRCLES NEVER TOUCH'], [74.74, 78.8, 'DESIGNERS · FOUNDERS · ENGINEERS · CEOS'], [78.89, 82.6, 'ALL OVER THE WORLD']];
  for (const [a, b, s] of caps) caption(ctx, s, clamp(prog(u, a, a + 0.25)) * (1 - prog(u, b - 0.25, b)));
}

// ======================================================================= the real app (English)
// Source-pixel crops of the real screenshots (public/assets/img/en/, converted to assets/app/en-*.png).
const DISC_FULL = [440, 100, 1640, 1660];                 // "Find your people." + Selin + Tom
const DISC_SELIN = [380, 700, 900, 911];                  // Selin's card, 91 % match
const PROF_MATCH = [560, 1415, 1060, 205];                // 91 % ring + "How well you and Selin Kaya fit"
const PROF_ADD = [560, 1895, 1100, 145];                  // Complement: what she brings that you lack
const PROF_WHY = [560, 2290, 1090, 135];                  // Vision Fit 20/20
const TA = { rise: 82.75, push: 86.4, why: 88.29, fall: 90.55 };
function sceneApp(ctx, u, IMG) {
  const rise = springU(u, TA.rise, { stiffness: 140, damping: 19 });
  const fall = E.inCubic(prog(u, TA.fall, TA.fall + 0.7));
  const wX = 60, wW = 960, wH = 972, wY0 = 380;
  const toWhy = springU(u, TA.why, SPRING.gentle);
  if (u < TA.why + 0.3 || toWhy < 0.6) {
    const y = lerp(H + 80, wY0, rise) + 1100 * E.inCubic(prog(u, TA.why - 0.02, TA.why + 0.48));
    const zin = clamp(springU(u, TA.push, { stiffness: 60, damping: 14 }), 0, 1.05);
    const r = DISC_FULL.map((v, i) => lerp(v, DISC_SELIN[i], zin));
    const tilt = 0.012 * (1 - rise);
    ctx.save(); ctx.translate(540, y + wH / 2); ctx.rotate(tilt); ctx.translate(-540, -(y + wH / 2));
    ctx.fillStyle = rgba('#000', 0.45); rrect(ctx, wX + 10, y + 26, wW, wH, 18); ctx.fill();
    ctx.save(); rrect(ctx, wX, y, wW, wH, 18); ctx.clip();
    ctx.fillStyle = '#121216'; ctx.fillRect(wX, y, wW, wH);
    if (IMG.disc) ctx.drawImage(IMG.disc, r[0], r[1], r[2], r[3], wX, y, wW, wH);
    ctx.restore();
    ctx.strokeStyle = rgba(C.ink, 0.16); ctx.lineWidth = 2; rrect(ctx, wX, y, wW, wH, 18); ctx.stroke();
    ctx.restore();
  }
  if (u > TA.why - 0.15) {
    const cards = [[PROF_MATCH, TA.why, 660], [PROF_ADD, TA.why + 0.3, 900], [PROF_WHY, TA.why + 0.58, 1072]];
    cards.forEach(([src, b, yy], i) => {
      const k = springU(u, b, { stiffness: 200, damping: 20 });
      if (k <= 0) return;
      const h = 960 * src[3] / src[2];
      const y = lerp(H + 100, yy, k) + fall * (1300 + i * 200);
      const rot = (i ? -0.015 : 0.012) * (1 - k) + fall * (i ? 0.25 : -0.2);
      ctx.save(); ctx.translate(540, y + h / 2); ctx.rotate(rot); ctx.translate(-540, -(y + h / 2));
      ctx.fillStyle = rgba('#000', 0.45); rrect(ctx, 70, y + 22, 960, h, 18); ctx.fill();
      ctx.save(); rrect(ctx, 60, y, 960, h, 18); ctx.clip();
      ctx.fillStyle = '#18181B'; ctx.fillRect(60, y, 960, h);
      if (IMG.prof) ctx.drawImage(IMG.prof, src[0], src[1], src[2], src[3], 60, y, 960, h);
      ctx.restore();
      ctx.strokeStyle = rgba(C.ink, 0.16); ctx.lineWidth = 2; rrect(ctx, 60, y, 960, h, 18); ctx.stroke();
      ctx.restore();
    });
  }
}

// ======================================================================= the crowd (end)
// Hundreds of builders in rows of depth, each with a spark: an illustration of the community, not a
// product screen (no names, no counts). They rise in a wave as the app cards fall, link up on "alone",
// and stay as a dim base under the end card.
const CROWD = (() => {
  const out = [];
  const R = 13;
  for (let r = 0; r <= R; r++) {
    const p = (r / R) ** 1.55;
    const y = 1010 + 930 * p, s = 17 + 78 * p, gap = s * 1.22;
    const n = Math.ceil((W + 2 * gap) / gap);
    for (let i = 0; i < n; i++) {
      const x = -gap + i * gap + (r % 2 ? gap / 2 : 0) + (hash01(r * 97 + i, 5) - 0.5) * gap * 0.25;
      const d = Math.hypot((x - 540) / 540, (y - 1500) / 600);
      out.push({ x, y, s, r, i, d, spk: hash01(r * 97 + i, 6), link: hash01(r * 97 + i, 7) });
    }
  }
  return out;
})();
function crowd(ctx, u) {
  const t0 = CR.rise;
  if (u < t0) return;
  const sink = springU(u, TE.card, SPRING.gentle);
  const dim = lerp(1, 0.55, clamp(sink)) + 0.5 * bump(u, TE.card + 1.3, 0.5);
  ctx.save(); ctx.translate(0, 560 * sink);
  // links between neighbours on "alone"
  const byRow = new Map();
  for (const c of CROWD) { if (!byRow.has(c.r)) byRow.set(c.r, []); byRow.get(c.r).push(c); }
  ctx.lineCap = 'round';
  for (const c of CROWD) {
    if (c.link > 0.62) continue;
    const row = byRow.get(c.r), nb = row[c.i + 1];
    const lp = E.outCubic(prog(u, CR.link + c.d * 0.5, CR.link + 0.5 + c.d * 0.5));
    if (!nb || lp <= 0) continue;
    const hy = c.y - c.s * 1.25, hy2 = nb.y - nb.s * 1.25;
    ctx.strokeStyle = grad(ctx, c.x, hy, nb.x, hy2, 0.85 * dim * (0.45 + 0.55 * c.r / 13));
    ctx.lineWidth = 1.5 + 2.5 * (c.r / 13);
    drawPoly(ctx, [[c.x, hy], [nb.x, hy2]], lp);
  }
  for (const c of CROWD) {
    const k = clamp(springU(u, t0 + c.d * 1.1, SPRING.bouncy), 0, 1.15);
    if (k <= 0.01) continue;
    const depth = 0.35 + 0.65 * (c.r / 13);
    const col = rgba(mix(C.gray2, C.ink, depth * 0.85), Math.min(1, k) * dim);
    person(ctx, c.x, c.y + (1 - k) * c.s * 0.9, c.s, col, 0.04 * wobble(u - t0 - c.d * 1.1, 2, 4));
    const sk = clamp(springU(u, t0 + 0.35 + c.d * 1.1 + c.spk * 0.4, SPRING.bouncy));
    if (sk > 0 && c.spk > 0.25) spark(ctx, c.x, c.y - c.s * 1.5 + (1 - k) * c.s * 0.9, Math.max(3, c.s * 0.11) * sk, u + c.spk * 5, 0, dim);
  }
  ctx.restore();
}

// ======================================================================= the line + end card
const TE = {
  lines: [[['The', 90.94], ['right', 91.02], ['people', 91.43]], [['are', 91.97], ['already', 92.36], ['out', 92.99], ['there.', 93.36]], [['Go', 94.38], ['find', 94.91], ['them.', 95.72]]],
  card: 96.05 };
const CR = { rise: 91.8, link: 94.4 };
function sceneEnd(ctx, u) {
  const up = springU(u, TE.card, SPRING.gentle);
  const sc = lerp(1, 0.6, up);
  const ox = 72, oy = lerp(540, 330, up);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
  const fThin = font(M.fitSize(ctx, 'are already out there.', 300, DISPLAY, 900, 110, -0.02), 300, DISPLAY);
  const fBold = font(M.fitSize(ctx, 'Go find them.', 800, DISPLAY, 920, 200, -0.03), 800, DISPLAY);
  const fs = [fThin, fThin, fBold], ys = [0, 120, 330], clipH = [150, 150, 240];
  TE.lines.forEach((ws, li) => {
    const str = ws.map((w) => w[0]).join(' ');
    const Lw = layout(ctx, str, fs[li], li === 2 ? -6 : -3);
    let idx = 0;
    ws.forEach(([wd, b]) => {
      [...wd].forEach((ch, j) => {
        const gph = Lw.glyphs[idx + j];
        const k = springU(u, b + j * 0.025, SPRING.bouncy);
        if (k <= 0) return;
        ctx.save(); ctx.beginPath(); ctx.rect(-20, ys[li] - clipH[li] + 20, 1300, clipH[li] + 30); ctx.clip();
        glyph(ctx, ch, gph.cx, ys[li] + (1 - k) * clipH[li], fs[li], li === 2 ? C.ink : rgba(C.ink, 0.92));
        ctx.restore();
      });
      idx += wd.length + 1;
    });
  });
  ctx.restore();
  if (u > TE.card - 0.4) {
    const t0 = TE.card + 0.15, hit = t0 + 0.8;
    const LX = 540, LY = 910, LS = 460;
    // light streaks rise from the crowd into the mark
    const sink = springU(u, TE.card, SPRING.gentle);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (let n = 0; n < 56; n++) {
      const c = CROWD[Math.floor(hash01(n, 41) * CROWD.length)];
      const d = hash01(n, 42);
      const a0 = t0 - 0.35 + d * 0.3, a1 = a0 + 0.55;
      const pt = prog(u, a0, a1);
      if (pt <= 0 || pt >= 1) continue;
      const hx = c.x, hy = c.y - c.s * 1.5 + 560 * sink;
      const at = (q) => { const e = E.inCubic(q); return [lerp(hx, LX, e), lerp(hy, LY, e) - Math.sin(Math.PI * q) * 120 * (d - 0.5)]; };
      const [x1, y1] = at(pt), [x0, y0] = at(Math.max(0, pt - 0.22));
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgba(gradAt(d), 0)); g.addColorStop(1, rgba(gradAt(d), 0.9));
      ctx.strokeStyle = g; ctx.lineWidth = 3 + 3 * d;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.restore();
    if (u > t0) {
      // two strokes slash in, then the hit: flash, a jolt, a ring of the gradient going out
      ctx.save();
      M.shake(ctx, u, hit, 12, 5, 0.1);
      const pB = E.outExpo(prog(u, t0 + 0.2, t0 + 0.5)), pA = E.outExpo(prog(u, t0 + 0.5, hit));
      const sc = 1 + 0.25 * (1 - clamp(springU(u, t0 + 0.2, { stiffness: 210, damping: 13 }), 0, 1.3)) + 0.012 * Math.sin(u * 1.6);
      ctx.translate(LX, LY); ctx.scale(sc, sc); ctx.translate(-LX, -LY);
      bloom(ctx, LX, LY, 520, 0.6 * Math.exp(-Math.max(0, u - hit) * 5) * (u > hit ? 1 : 0));
      const halo = ctx.createRadialGradient(LX, LY, 0, LX, LY, 330);
      halo.addColorStop(0, rgba(C.bl, 0.16 * clamp(prog(u, hit, hit + 0.6)))); halo.addColorStop(1, rgba(C.bl, 0));
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(LX, LY, 330, 0, TAU); ctx.fill();
      logoMark(ctx, LX, LY, LS, { pB, pA, sheen: prog(u, hit + 0.45, hit + 1.5) });
      ctx.restore();
      const rp = prog(u, hit, hit + 1.7);
      if (rp > 0 && rp < 1) {
        const r = 140 + 1100 * E.outCubic(rp);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = grad(ctx, LX - r, LY, LX + r, LY, 0.8 * (1 - rp)); ctx.lineWidth = 5 * (1 - rp) + 1;
        ctx.beginPath(); ctx.arc(LX, LY, r, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      wordmarkIn(ctx, u, hit + 0.15, 540, 1240, 132);
    }
    const t1 = E.outQuint(prog(u, t0 + 1.4, t0 + 2.2));
    if (t1 > 0) {
      const tf = font(44, 400, DISPLAY);
      text(ctx, 'The place that connects', 540, 1318 + (1 - t1) * 24, tf, rgba(C.ink2, t1), 'center');
      text(ctx, 'ambitious people.', 540, 1372 + (1 - t1) * 24, tf, rgba(C.ink2, t1), 'center');
    }
    const t2 = E.outQuint(prog(u, t0 + 2.0, t0 + 2.8));
    if (t2 > 0) text(ctx, 'XYNTAL.COM · FREE DURING THE BETA', 540, 1462, font(32, 500, MONO), rgba(C.ink3, t2), 'center', 1.5);
  }
}

// ---------------------------------------------------------------- grain + vignette (after blur)
let GRAIN = null;
function makeGrain() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d'); const im = g.createImageData(512, 512); const R = mulberry32(9);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (R() - 0.5) * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}
let VIG = null;


M.film({
  fonts: [font(100, 800, DISPLAY), font(100, 300, DISPLAY), font(100, 600, DISPLAY), font(100, 700, DISPLAY), font(100, 400, DISPLAY), font(40, 500, MONO)],
  images: { disc: 'assets/app/en-discover-2880.png', prof: 'assets/app/en-profil-2880.png' },
  hits: HITS,
  samples: 10,
  init() { GRAIN = makeGrain(); },
  draw(ctx, u, t, IMG) {
    if (u < 82.75) sceneWorld(ctx, u);
    else if (u < 90.55) {
      if (u < 83.5) sceneWorld(ctx, u); else fill(ctx, C.bg);
      sceneApp(ctx, u, IMG);
    } else {
      fill(ctx, C.bg);
      crowd(ctx, u);
      if (u < 91.4) sceneApp(ctx, u, IMG);
      sceneEnd(ctx, u);
    }
  },
  post(ctx, u) {
    if (!VIG) {
      VIG = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.25, W / 2, H * 0.5, H * 0.75);
      VIG.addColorStop(0, 'rgba(0,0,0,0)'); VIG.addColorStop(1, 'rgba(0,0,0,0.45)');
    }
    ctx.fillStyle = VIG; ctx.fillRect(0, 0, W, H);
    if (GRAIN) {
      ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
      const f = Math.floor(u * 8);
      const ox = -Math.floor(hash01(f, 1) * 512), oy = -Math.floor(hash01(f, 2) * 512);
      for (let x = ox; x < W; x += 512) for (let y = oy; y < H; y += 512) ctx.drawImage(GRAIN, x, y);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  },
});
