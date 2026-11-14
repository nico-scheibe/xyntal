// Xyntal – Verbunden. A pure function of time: window.seek(t) paints frame t (lib/motion.js).
// Timing is in beats (u) on the designed 84 BPM grid (beats.json); every cue below is a word onset
// from vo.json, so picture follows the voice. docs/shotlist.md is the plan.
import * as M from './lib/motion.js';

const { W, H, E, prog, lerp, clamp, springU, springKeys, SPRING, wobble, kf, font, layout, glyph, text,
  fill, rrect, hash01, noise1, mix, bump, TAU, mulberry32 } = M;

// Brand tokens (assets/brand.json): graphite ground, off-white ink, the X gradient as the only colour.
const C = {
  bg: '#141416', bg2: '#1A1A1C', ink: '#ECEAE4', ink2: '#B9B7B0', ink3: '#918F89',
  gray: '#3A3A3F', gray2: '#5A5A61', sil: '#232326', pu: '#B36BFF', bl: '#3A8AFF', cy: '#3FE0F0',
};
const DISPLAY = 'Display', MONO = 'UI';

// ---------------------------------------------------------------- time warp
// Act I and the city were timed on an earlier read (design beats). The English read lands its words
// elsewhere, so those scenes run on warp(u): piecewise linear between matching cues
// [beat in this read, design beat]. Everything from the globe on is timed on this read directly.
const WARP = [[0, 0], [0.5, 0.5], [1.62, 1.84], [5.68, 4.89], [7.01, 6.0], [8.42, 7.47], [10.0, 9.21], [12.1, 11.4],
  [13.92, 13.41], [16.77, 16.55], [20.11, 18.5], [24.36, 20.82], [26.2, 22.6], [27.42, 23.0], [27.93, 23.85],
  [30.5, 26.15], [31.3, 26.9], [31.38, 26.93], [34.69, 28.82], [37.32, 31.35], [38.52, 32.62], [40.4, 34.39],
  [44.65, 37.28], [46.44, 39.44], [49.51, 40.99], [52.67, 42.0], [55.31, 44.37], [58.7, 47.5], [59.16, 47.97],
  [62.64, 51.4], [63.42, 52.98], [64.93, 53.89], [68.5, 55.4], [69.3, 55.84], [71.0, 57.3]];
function pw(u, A, a, b) {
  if (u <= A[0][a]) return A[0][b] + (u - A[0][a]);
  for (let i = 1; i < A.length; i++) if (u <= A[i][a]) return lerp(A[i - 1][b], A[i][b], (u - A[i - 1][a]) / (A[i][a] - A[i - 1][a]));
  const L = A[A.length - 1]; return L[b] + (u - L[a]);
}
const warp = (u) => pw(u, WARP, 0, 1), unwarp = (d) => pw(d, WARP, 1, 0);

// ---------------------------------------------------------------- hits (sfx.mjs voices these)
// Act I + city hits are written in design beats and mapped onto this read below.
const HITS_D = [
  [0, 'lamp on', 'click', { gain: 0.5 }],
  [4.89, 'others slide away', 'whoosh', { len: 0.6, from: 1400, to: 300, gain: 0.18 }],
  [9.21, 'idea bubble', 'pop', { pitch: 'A5', gain: 0.25 }],
  [10.0, 'header block', 'tick'], [10.3, 'line', 'tick'], [10.55, 'line', 'tick'], [10.8, 'tile', 'tick'],
  [11.0, 'tile', 'tick'], [11.3, 'button', 'blip', { pitch: 'D6', gain: 0.14 }],
  [10.2, 'moon + 03:12', 'tick', { gain: 0.15 }],
  [13.41, 'others return', 'whoosh', { len: 0.5, from: 300, to: 1200, gain: 0.14 }],
  [16.55, 'smile 1', 'pop', { pitch: 'F5', gain: 0.2 }], [16.8, 'smile 2', 'pop', { pitch: 'A5', gain: 0.2 }],
  [18.5, 'question', 'pop', { pitch: 'D5', gain: 0.28 }],
  [22.6, 'answers out', 'pop', { pitch: 'A4', to: 'D4', gain: 0.15 }],
  [23.85, 'idea collapses', 'pop', { pitch: 'D5', to: 'D3', gain: 0.2 }],
  [24.9, 'flicker', 'tick', { gain: 0.15 }], [25.4, 'flicker', 'tick', { gain: 0.15 }],
  [26.15, 'lamp off', 'click', { gain: 0.4 }],
  [26.93, 'Freitag tag', 'tick', { gain: 0.2 }],
  [28.82, 'walk', 'tok', { pitch: 'D4', gain: 0.06 }], [29.32, 'walk', 'tok', { pitch: 'F4', gain: 0.06 }],
  [29.82, 'walk', 'tok', { pitch: 'D4', gain: 0.06 }], [30.32, 'walk', 'tok', { pitch: 'F4', gain: 0.05 }],
  [31.35, 'push to window', 'whoosh', { len: 1.4, from: 200, to: 900, gain: 0.1 }],
  ...[35.0, 35.6, 36.2, 36.8, 37.3, 37.8, 38.3, 38.8, 39.4].map((b, i) =>
    [b, `plan node ${i}`, 'blip', { pitch: ['D5', 'F5', 'A5', 'C6', 'D6', 'F6', 'E6', 'A6', 'D7'][i], gain: 0.07 }]),
  ...[41.4, 41.9, 42.5, 43.1, 43.6].map((b, i) => [b, `node out ${i}`, 'tick', { gain: 0.08 }]),
  [47.97, 'turn', 'sub', { len: 1.2, gain: 0.25 }],
  ...[52.98, 53.53, 53.89, 54.36, 54.77, 55.1, 55.4].map((b, i) =>
    [b, `light ${i}`, 'blip', { pitch: ['A5', 'D6', 'F6', 'A6', 'C7', 'D7', 'F7'][i], gain: 0.07 }]),
];
const HITS = [
  ...HITS_D.map(([b, ...r]) => [+unwarp(b).toFixed(3), ...r]),
  [68.6, 'out to the globe', 'whoosh', { len: 1.6, from: 300, to: 2400, gain: 0.16 }],
  [71.2, 'fly to Lagos', 'whoosh', { len: 0.8, from: 500, to: 1600, gain: 0.12 }],
  [72.58, 'Lagos tag', 'tick', { gain: 0.25 }],
  [76.4, 'spin to Seoul', 'whoosh', { len: 0.7, from: 2500, to: 500, pan: 0.4, gain: 0.22 }],
  [77.62, 'Seoul tag', 'tick', { gain: 0.25 }],
  [82.35, 'spin to São Paulo', 'whoosh', { len: 0.7, from: 2500, to: 500, pan: -0.4, gain: 0.22 }],
  [83.35, 'São Paulo tag', 'tick', { gain: 0.25 }],
  [87.9, 'pull back', 'whoosh', { len: 1.0, from: 1200, to: 300, gain: 0.12 }],
  [89.06, 'arc starts', 'tick', { gain: 0.12 }],
  [93.0, 'arc breaks', 'tick', { gain: 0.18 }],
  [97.0, 'connected', 'bell', { pitch: 'F6', gain: 0.22 }],
  ...[97.6, 97.95, 98.3, 98.65, 99.0].map((b, i) => [b, `network ${i}`, 'blip', { pitch: ['C6', 'F6', 'A6', 'C7', 'F7'][i], gain: 0.06 }]),
  [99.8, 'particles fly', 'whoosh', { len: 1.2, from: 400, to: 3000, gain: 0.18 }],
  [100.6, 'X lands + wordmark', 'bell', { pitch: 'A6', gain: 0.2 }],
  [103.85, 'app window', 'whoosh', { len: 0.6, from: 600, to: 2400, gain: 0.18 }],
  [104.3, 'window lands', 'thud', { gain: 0.2 }],
  [107.3, 'push to match', 'whoosh', { len: 0.7, from: 500, to: 1800, gain: 0.12 }],
  [107.93, '91 %', 'blip', { pitch: 'A6', gain: 0.1 }],
  [109.16, 'match cards', 'pop', { pitch: 'F5', gain: 0.2 }], [109.46, 'complement', 'pop', { pitch: 'A5', gain: 0.16 }],
  [112.05, 'cards fall', 'whoosh', { len: 0.5, from: 1800, to: 400, gain: 0.14 }],
  [112.53, 'Stop', 'thud', { gain: 0.25 }],
  [113.64, 'alone', 'tick', { gain: 0.15 }],
  [114.95, 'logo', 'bell', { pitch: 'D6', gain: 0.22 }],
];

// ---------------------------------------------------------------- helpers


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

// ======================================================================= ACT I: the stage (u 0..26.9)
const FLOOR = 1240, FS = 140;
const SPOT = 540;
// figure x per index (-3..3, 0 = you) at a given beat
function stageX(i, u) {
  if (i === 0) return SPOT;
  const sg = Math.sign(i), a = Math.abs(i);
  const near = SPOT + i * 150;
  const far = SPOT + sg * (300 + (a - 1) * 200);
  const k1 = springU(u, 4.89 + a * 0.06, SPRING.gentle);           // "einsamer": they drift away
  const k2 = springU(u, 13.3 + a * 0.08, SPRING.gentle);           // "Du erzählst": they come back
  const k3 = springU(u, 23.4 + a * 0.07, SPRING.gentle);           // "Also hörst du auf": they leave
  let x = near + (far - near) * k1;
  x += (near - far) * k2;
  x += (far + sg * 120 - near) * k3;
  return x;
}
function lampLevel(u) {
  if (u < 0.3) return 1 + 0.5 * Math.exp(-u * 10);                  // clacks on, frame 0 already lit
  if (u >= 26.15) return 0;
  if (u >= 24.7) {                                                  // flicker, then out
    const f = Math.floor(u * 9);
    return hash01(f, 5) > 0.45 + (u - 24.7) * 0.25 ? 1 : 0.15;
  }
  return 1;
}

function idea(ctx, u, cx, cy, sc, p0) {
  // the wireframe inside the thought bubble draws itself from beat p0
  ctx.save(); ctx.translate(cx, cy); ctx.scale(sc, sc);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 4;
  drawPoly(ctx, [[-75, -128], [-75, 128], [-53, 150], [53, 150], [75, 128], [75, -128], [53, -150], [-53, -150], [-75, -128]], prog(u, p0, p0 + 0.8));
  ctx.lineWidth = 3;
  drawPoly(ctx, [[-18, -132], [18, -132]], prog(u, p0 + 0.6, p0 + 0.8));
  const pop = (b) => clamp(springU(u, b, SPRING.bouncy), 0, 1.2);
  const hb = pop(p0 + 0.8);
  if (hb > 0) { ctx.save(); ctx.translate(0, -85); ctx.scale(hb, hb); ctx.fillStyle = rgba(C.ink, 0.92); rrect(ctx, -55, -27, 110, 54, 8); ctx.fill(); ctx.restore(); }
  [[-35, 55], [-15, 30], [5, 45]].forEach(([y, w2], i) => drawPoly(ctx, [[-55, y], [-55 + w2 * 2, y]], prog(u, p0 + 1.1 + i * 0.25, p0 + 1.35 + i * 0.25)));
  [[-55, 30], [5, 30]].forEach(([x, y], i) => { ctx.lineWidth = 3; drawPoly(ctx, rectPts(x, y, 50, 50), prog(u, p0 + 1.6 + i * 0.2, p0 + 1.95 + i * 0.2)); });
  const bt = pop(p0 + 2.1);
  if (bt > 0) { ctx.save(); ctx.translate(0, 114); ctx.scale(bt, bt); ctx.fillStyle = grad(ctx, -55, 0, 55, 0); rrect(ctx, -55, -14, 110, 28, 14); ctx.fill(); ctx.restore(); }
  ctx.restore();
}

function sceneStage(ctx, u) {
  fill(ctx, C.bg);
  const lv = lampLevel(u);
  // camera: slow push, a lift toward the idea, back for the conversation
  const [cx, cy, z] = kf(u, [[0, [540, 1010, 1.32]], [4.7, [540, 880, 1.0]], [7, [540, 870, 1.03]], [9, [540, 830, 1.06]], [13, [540, 850, 1.04]], [15, [540, 880, 1.0]], [26.9, [540, 900, 1.03]]], E.inOutSine);
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cx, -cy);

  floorGrid(ctx, FLOOR, 0.6 + 0.4 * Math.min(1, lv));
  // the cone
  if (lv > 0) {
    const g = ctx.createLinearGradient(0, 330, 0, FLOOR);
    g.addColorStop(0, rgba(C.ink, 0.2 * lv)); g.addColorStop(1, rgba(C.ink, 0.05 * lv));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(SPOT - 34, 330); ctx.lineTo(SPOT + 34, 330); ctx.lineTo(SPOT + 250, FLOOR); ctx.lineTo(SPOT - 250, FLOOR); ctx.closePath(); ctx.fill();
    const pool = ctx.createRadialGradient(SPOT, FLOOR, 0, SPOT, FLOOR, 260);
    pool.addColorStop(0, rgba(C.ink, 0.22 * lv)); pool.addColorStop(1, rgba(C.ink, 0));
    ctx.save(); ctx.translate(SPOT, FLOOR); ctx.scale(1, 0.18); ctx.translate(-SPOT, -FLOOR);
    ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(SPOT, FLOOR, 260, 0, TAU); ctx.fill(); ctx.restore();
  }
  // lamp
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(SPOT, -200); ctx.lineTo(SPOT, 280); ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.beginPath(); ctx.moveTo(SPOT - 14, 280); ctx.lineTo(SPOT + 14, 280); ctx.lineTo(SPOT + 48, 328); ctx.lineTo(SPOT - 48, 328); ctx.closePath(); ctx.fill();
  if (lv > 0) { ctx.fillStyle = rgba('#FFFFFF', Math.min(1, lv)); ctx.beginPath(); ctx.ellipse(SPOT, 330, 20, 6, 0, 0, TAU); ctx.fill(); }

  // figures
  const dark = clamp(prog(u, 23.4, 25)) * 0.6;
  for (const i of [-3, 3, -2, 2, -1, 1]) {
    const x = stageX(i, u);
    const sq = 0.05 * wobble(u - (13.3 + Math.abs(i) * 0.08) - 0.5, 2, 4) + 0.06 * wobble(u - 1.84 - Math.abs(i) * 0.07, 2.2, 4);
    ctx.fillStyle = rgba('#000', 0.35); ctx.beginPath(); ctx.ellipse(x, FLOOR + 4, 60, 10, 0, 0, TAU); ctx.fill();
    person(ctx, x, FLOOR, FS, mix(C.gray2, C.gray, dark), sq);
  }
  const youC = lv > 0.5 ? C.ink : mix(C.gray2, C.ink, lv);
  person(ctx, SPOT, FLOOR, FS, youC, 0.03 * wobble(u, 2, 3));
  // the spark above you; it drains after "Also hörst du auf"
  const sparkY = FLOOR - FS * 1.21 - 46;
  const g = prog(u, 24.2, 25.4);
  const collapse = E.inBack(prog(u, 23.85, 24.6), 1.2);           // the idea folding back into the spark
  const grow = springU(u, 9.0, SPRING.gentle);                     // spark -> bubble
  spark(ctx, SPOT, sparkY, 21 + 6 * bump(u, 24.6, 0.4), u, g, 1 - 0.6 * Math.max(0, grow - collapse) * (u < 23.85 ? 1 : 0));

  // thought bubble (S2) -> speech bubble (S3)
  const bubOn = clamp(grow) * (1 - collapse);
  if (bubOn > 0.01) {
    const toLeft = springU(u, 13.6, SPRING.gentle);                // moves aside when you start talking
    const shrink = springU(u, 18.5, SPRING.gentle);                // and shrinks under the question
    let bx = lerp(SPOT, 300, toLeft), by = lerp(610, 560, toLeft);
    let sc = lerp(1, 0.78, toLeft) * lerp(1, 0.8, shrink);
    bx = lerp(bx, SPOT, collapse); by = lerp(by, sparkY, collapse);
    const s = bubOn * sc;
    // trailing dots (thought) or a tail (speech)
    const thought = 1 - toLeft;
    if (thought > 0.05) {
      [[0.25, 7], [0.5, 10], [0.75, 14]].forEach(([p, r], i) => {
        const k = clamp(springU(u, 8.9 + i * 0.12, SPRING.bouncy)) * thought * (1 - collapse);
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(lerp(SPOT, bx, p) + 8 * i, lerp(sparkY - 28, by + 210 * s, p), r * k, 0, TAU); ctx.fill();
      });
    }
    ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
    const tail = toLeft > 0.05 ? [lerp(0, (SPOT - bx) / s, 1) * 0.55, 240 + 120 * toLeft] : null;
    bubbleRect(ctx, -165, -210, 330, 420, tail, { lw: 4 / Math.max(0.5, s) * 0.9 });
    ctx.restore();
    idea(ctx, u, bx, by, s, 9.25);
  }

  // moon + "03:12" (nachts)
  moon(ctx, 850, 470, 42, clamp(springU(u, 10.2, SPRING.bouncy)) * (1 - prog(u, 13.0, 13.6)));
  if (u < 13.7) { ctx.save(); ctx.globalAlpha = 1 - prog(u, 13.1, 13.6); tag(ctx, 205, 250, 250, ['03:12', 'AM'], u, 10.25, { size: 40 }); ctx.restore(); }
  if (u >= 12.9 && u < 13.6) { /* tag retracts with the cut back to the room */ }

  // answers (S3): smiles on "Lächeln", the question on "Frage"
  const out = E.inBack(prog(u, 22.6, 23.1), 1.6);
  const smile = (x, b) => {
    const k = clamp(springU(u, b, SPRING.bouncy), 0, 1.15) * (1 - out);
    if (k <= 0.01) return;
    ctx.save(); ctx.translate(x, 945); ctx.scale(k, k);
    bubbleRect(ctx, -62, -46, 124, 86, [0, 70], { lw: 4 });
    ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, -16, 26, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(-14, -14, 4, 0, TAU); ctx.arc(14, -14, 4, 0, TAU); ctx.fill();
    ctx.restore();
  };
  smile(stageX(-2, u), 16.55);
  smile(stageX(2, u), 16.8);
  const q = clamp(springU(u, 18.45, SPRING.bouncy), 0, 1.12) * (1 - out);
  if (q > 0.01) {
    const qx = 680, qy = 760;
    ctx.save(); ctx.translate(qx, qy); ctx.scale(q, q);
    bubbleRect(ctx, -245, -105, 490, 190, [stageX(1, u) - qx, 255], { fillC: C.ink, strokeC: null });
    const f = font(M.fitSize(ctx, 'So when are you doing', 700, DISPLAY, 436, 41), 700, DISPLAY);
    text(ctx, 'So when are you doing', -212, -18, f, C.bg, 'left', -0.4);
    text(ctx, 'something real?', -212, 40, f, C.bg, 'left', -0.4);
    ctx.restore();
  }
  ctx.restore();
  // after the lamp dies the room sinks into the dark
  if (u > 26.15) { ctx.fillStyle = rgba(C.bg, 0.55); ctx.fillRect(0, 0, W, H); }
}

// ======================================================================= the city (u 26.9..86.5)
// One world for the night street, the zoom-out and the field of lights. Rows of houses stacked in
// depth; at a distance only the lit windows remain, which is the "field" the end connects.
const ROW_H = 560, GROUND0 = 1300;
const MINE = { x0: 200, x1: 560, wallH: 330, roofH: 170, row: 0 };
const MY_WIN = { x: 262, y: GROUND0 - 262, w: 138, h: 112 };
const CITY = (() => {
  const houses = [];
  const R = mulberry32(20261114);
  for (let r = -12; r <= 12; r++) {
    const base = GROUND0 + r * ROW_H;
    let x = -4700 + R() * 160;
    while (x < 4700) {
      const w = 220 + R() * 220, h = 230 + R() * 270, roof = R() > 0.45 ? 70 + R() * 90 : 0;
      const gap = 40 + R() * 90;
      const hs = { x0: x, x1: x + w, base, wallH: h, roofH: roof, row: r, wins: [] };
      x += w + gap;
      if (r === 0 && hs.x1 > -420 && hs.x0 < 1120) continue;
      const cols = Math.max(1, Math.min(3, Math.floor((w - 50) / 105))), rows = Math.max(1, Math.min(3, Math.floor((h - 70) / 125)));
      for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
        const ww = 56, wh = 70;
        const sx = hs.x0 + (w - cols * ww - (cols - 1) * 40) / 2 + cx * (ww + 40);
        hs.wins.push({ x: sx, y: base - h + 45 + cy * 120, w: ww, h: wh });
      }
      houses.push(hs);
    }
  }
  // row 0: the street from the night scene
  const add = (x0, x1, wallH, roofH, wins) => houses.push({ x0, x1, base: GROUND0, wallH, roofH, row: 0, wins, near: true });
  add(-330, 130, 430, 0, [[-270, 60], [-110, 60], [-270, 200], [-110, 200], [-270, 330], [-110, 330]].map(([x, y]) => ({ x, y: GROUND0 - 430 + y, w: 70, h: 80 })));
  const mine = { x0: MINE.x0, x1: MINE.x1, base: GROUND0, wallH: MINE.wallH, roofH: MINE.roofH, row: 0, wins: [MY_WIN, { x: 450, y: GROUND0 - 262, w: 70, h: 112 }], mine: true, near: true };
  houses.push(mine);
  add(690, 1050, 380, 120, [[730, 80], [900, 80], [730, 220], [900, 220]].map(([x, y]) => ({ x, y: GROUND0 - 380 + y, w: 70, h: 80 })));
  // lit windows: ~13% of houses, lighting up from near to far; Leipzig and Graz are two of them
  const lit = [];
  let leip = null, graz = null, bl = 1e9, bg = 1e9;
  houses.forEach((h, i) => {
    if (h.mine || !h.wins.length) return;
    const dl = Math.abs(h.row + 4) * 1e5 + Math.abs(h.x0 + 2100), dg = Math.abs(h.row - 5) * 1e5 + Math.abs(h.x0 - 2200);
    if (dl < bl) { bl = dl; leip = h; }
    if (dg < bg) { bg = dg; graz = h; }
  });
  houses.forEach((h, i) => {
    if (h.mine || !h.wins.length) return;
    if (h === leip || h === graz || hash01(i, 77) < 0.13) {
      h.lit = h.wins[Math.floor(hash01(i, 78) * h.wins.length)];
      lit.push(h);
    }
  });
  const d = (h) => Math.hypot((h.x0 + h.x1) / 2 - 380, h.base - GROUND0);
  lit.sort((a, b) => d(a) - d(b));
  lit.forEach((h, k) => { h.litU = 52.98 + 2.6 * Math.sqrt(k / lit.length); });
  leip.litU = 53.58; graz.litU = 54.02;
  const cen = (h) => [h.lit.x + h.lit.w / 2, h.lit.y + h.lit.h / 2];
  return { houses, lit, mine, LEIP: leip, GRAZ: graz, Lp: cen(leip), Gp: cen(graz), Mp: [MY_WIN.x + MY_WIN.w / 2, MY_WIN.y + MY_WIN.h / 2] };
})();

// camera over the city: { cx, cy, z }
function cityCam(u) {
  const M0 = CITY.Mp, L = CITY.Lp, G = CITY.Gp;
  if (u < 34.2) {
    const z = kf(u, [[26.9, 1.0], [31.35, 1.03], [33.6, 2.4]], E.inOutCubic);
    const [cx, cy] = kf(u, [[26.9, [540, 960]], [31.35, [540, 960]], [33.6, M0]], E.inOutCubic);
    return { cx, cy, z };
  }
  if (u < 47.5) {
    const z = kf(u, [[34.2, 2.4], [36.2, 1.05], [40.6, 1.0], [46.9, 3.6]], E.inOutCubic);
    const [cx, cy] = kf(u, [[34.2, M0], [36.2, [440, 820]], [40.6, [440, 830]], [46.9, M0]], E.inOutCubic);
    return { cx, cy, z };
  }
  if (u < 51.2) return { cx: M0[0], cy: M0[1], z: 0.34 * Math.pow(0.9, prog(u, 47.5, 51.2)) };
  // the pull back, in log space (a constant-rate dolly), then the city collapses into your point
  if (u < 55.4) return { cx: M0[0], cy: M0[1], z: 0.306 * Math.pow(0.1 / 0.306, E.inOutSine(prog(u, 51.2, 55.4))) };
  return { cx: M0[0], cy: M0[1], z: 0.1 * Math.pow(0.003 / 0.1, E.inQuad(prog(u, 55.4, 57.3))) };
}
const toS = (p, cam) => [(p[0] - cam.cx) * cam.z + W / 2, (p[1] - cam.cy) * cam.z + H / 2];

function drawHouse(ctx, h, cam, a, u) {
  const z = cam.z;
  ctx.strokeStyle = h.mine ? rgba(C.ink, a) : rgba(C.ink3, a * (h.near ? 0.9 : 0.75));
  ctx.lineWidth = (h.mine ? 3.2 : 2.2) / Math.max(z, 0.35);
  ctx.beginPath();
  const top = h.base - h.wallH;
  ctx.moveTo(h.x0, h.base); ctx.lineTo(h.x0, top);
  if (h.roofH) { ctx.lineTo((h.x0 + h.x1) / 2, top - h.roofH); ctx.lineTo(h.x1, top); } else ctx.lineTo(h.x1, top);
  ctx.lineTo(h.x1, h.base);
  ctx.fillStyle = rgba(C.bg, Math.min(1, a * 1.6)); ctx.fill();
  ctx.stroke();
  if (h.mine) {   // chimney + door
    ctx.beginPath(); ctx.moveTo(470, top - 70); ctx.lineTo(470, top - 140); ctx.lineTo(510, top - 140); ctx.lineTo(510, top - 45); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(470, h.base); ctx.lineTo(470, h.base - 120); ctx.lineTo(530, h.base - 120); ctx.lineTo(530, h.base); ctx.stroke();
  }
  ctx.lineWidth = 1.8 / Math.max(z, 0.35);
  if (z < 0.2) return;
  for (const w of h.wins) {
    if (w === h.lit || (h.mine && w === MY_WIN)) continue;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
}

// a lit window: glow + light + someone sitting at a laptop (when close enough to see)
function litWindow(ctx, w, cam, u, k, { spk = 0, me = false, sparkGray = 0 } = {}) {
  if (k <= 0) return;
  const z = cam.z;
  const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
  const glowR = Math.max(w.w * 1.6, 26 / z);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  g.addColorStop(0, rgba(C.ink, 0.28 * k)); g.addColorStop(1, rgba(C.ink, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, TAU); ctx.fill();
  // the window itself: never smaller than a few screen pixels
  const minPx = 6 / z;
  const ww = Math.max(w.w, minPx), wh = Math.max(w.h, minPx * 0.8);
  ctx.fillStyle = rgba(C.ink, 0.95 * k);
  ctx.fillRect(cx - ww / 2, cy - wh / 2, ww, wh);
  if (z * w.w > 28) {     // the person inside, a dark silhouette against the light
    const s = w.h * 0.62;
    const px = cx - w.w * 0.12, py = w.y + w.h;
    ctx.save(); ctx.beginPath(); ctx.rect(w.x, w.y, w.w, w.h); ctx.clip();
    person(ctx, px, py + s * 0.08, s, mix(C.ink, C.sil, k));
    ctx.strokeStyle = mix(C.ink, C.sil, k); ctx.lineWidth = Math.max(3, w.h * 0.05);
    ctx.beginPath(); ctx.moveTo(px + s * 0.55, py - s * 0.28); ctx.lineTo(px + s * 0.95, py - s * 0.28); ctx.lineTo(px + s * 1.08, py - s * 0.62); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba(C.ink, k); ctx.lineWidth = Math.max(2.5, 3 / z); ctx.strokeRect(w.x, w.y, w.w, w.h);
    ctx.beginPath(); ctx.moveTo(cx, w.y); ctx.lineTo(cx, w.y + w.h); ctx.stroke();
  }
  if (spk > 0) spark(ctx, cx - w.w * 0.12, w.y - Math.max(18, 10 / z), Math.max(7, 4 / z), u, sparkGray, spk);
}

function sceneCity(ctx, u) {
  fill(ctx, C.bg);
  const cam = cityCam(u);
  const z = cam.z;
  const night = u < 47.5;
  stars(ctx, u, night ? 1 : clamp((0.3 - z) / 0.2) * 0.6 * (1 - prog(u, 79, 82)));
  if (night) moon(ctx, 150, 330, 46, 1);

  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cam.cx, -cam.cy);
  // visible world rect
  const vx0 = cam.cx - W / 2 / z, vx1 = cam.cx + W / 2 / z, vy0 = cam.cy - H / 2 / z, vy1 = cam.cy + H / 2 / z;
  const cityA = u < 47.5 ? 1 : u < 51.2 ? 0 : clamp(prog(u, 51.6, 53.6)) * clamp((z - 0.12) / 0.18) + clamp((z - 0.3) / 0.3) * (u > 57 ? 1 : 0);
  const fadeEnd = 1 - prog(u, 80.8, 82.2);
  if (u < 47.5) floorGrid(ctx, GROUND0, clamp((z - 0.6) / 0.4), 540, 3000);
  // houses
  const A = clamp(cityA) * fadeEnd;
  if (A > 0.01) {
    // ground lines per row
    ctx.strokeStyle = rgba(C.ink, 0.18 * A); ctx.lineWidth = 2 / Math.max(z, 0.35);
    ctx.beginPath();
    for (let r = -12; r <= 12; r++) { if (u < 47.5 && r !== 0) continue; const y = GROUND0 + r * ROW_H; if (y < vy0 - 50 || y > vy1 + 600) continue; ctx.moveTo(Math.max(-4800, vx0), y); ctx.lineTo(Math.min(4800, vx1), y); }
    ctx.stroke();
    for (const h of CITY.houses) {
      if (h.x1 < vx0 || h.x0 > vx1 || h.base < vy0 || h.base - h.wallH - h.roofH > vy1) continue;
      // only the street is there before the pull back
      if (u < 47.5 && !h.near) continue;
      const a = h.near ? (u < 47.5 ? 1 : A * 0.6) : A * (u < 51.2 ? 0 : 0.5);
      if (a < 0.01) continue;
      drawHouse(ctx, h, cam, a, u);
    }
  }
  // the others head out for the night (S5)
  if (u > 26.9 && u < 33) {
    for (let i = 0; i < 5; i++) {
      const t = Math.max(0, u - 28.82 - i * 0.08);
      const x = 600 + i * 118 + t * 330 + 6 * Math.sin(i * 3);
      const hop = Math.abs(Math.sin((t * 2.0 + i * 0.3) * Math.PI)) * 16 * (t > 0 ? 1 : 0);
      person(ctx, x, GROUND0 - hop, 104, C.gray2, t > 0 ? 0.03 * Math.cos(t * TAU * 2) : 0);
    }
    tag(ctx, 760, 250, 230, ['FRIDAY', '10:47 PM'], u, 26.93, { size: 46 });
  }
  // my window
  const myK = u < 47.5 ? 1 - 0.25 * bump(u, 43.5, 1.5) : 1;
  const sparkG = u < 47.5 ? prog(u, 42, 44.5) * 0.7 : 0;
  litWindow(ctx, MY_WIN, cam, u, myK, { spk: u > 33 && u < 47.5 ? 1 - 0.5 * bump(u, 44.4, 0.3) * (Math.floor(u * 10) % 2) : 0, me: true, sparkGray: sparkG });
  // the plan in the night sky (S6) that only you can see; it falls apart in S7
  if (u > 34.5 && u < 47.5) plan(ctx, u, cam);
  // the "?" (S7)
  if (u > 42.3 && u < 47.5) {
    const k = clamp(springU(u, 42.45, SPRING.bouncy), 0, 1.2);
    glyph(ctx, '?', MY_WIN.x + MY_WIN.w - 18, MY_WIN.y - 16, font(64, 800, DISPLAY), C.ink, k, k, 0.12 * Math.sin(u * 2.5));
  }
  // the other lights
  for (const h of CITY.lit) {
    if (u < h.litU) continue;
    const k = clamp(prog(u, h.litU, h.litU + 0.12)) * (1 - 0.6 * bump(u, h.litU + 0.06, 0.06));
    const special = h === CITY.LEIP || h === CITY.GRAZ;
    litWindow(ctx, h.lit, cam, u, k, { spk: special && z > 0.35 ? clamp((z - 0.35) / 0.15) : 0 });
  }
  // S12/S13: the line that doesn't reach, then the network
  ctx.restore();

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

// The plan: nodes and lines drawn out of your window into the sky (S6), falling apart (S7).
const PLAN = [[440, 690], [300, 560], [590, 560], [220, 410], [420, 430], [700, 420], [330, 290], [560, 290], [790, 260]];
const PLAN_E = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 4], [2, 5], [4, 6], [4, 7], [5, 8], [7, 8], [3, 6]];
const PLAN_T = [35.0, 35.6, 36.2, 36.8, 37.3, 37.8, 38.3, 38.8, 39.4];
const PLAN_OUT = [44.0, 41.4, 43.6, 41.9, 43.1, 42.5, 41.4, 43.1, 42.5];
function plan(ctx, u, cam) {
  const z = cam.z;
  ctx.save();
  ctx.lineCap = 'round';
  // the dotted thread from the window up to the first node
  const w0 = [MY_WIN.x + MY_WIN.w / 2, MY_WIN.y];
  ctx.setLineDash([6, 12]); ctx.strokeStyle = rgba(C.ink, 0.55); ctx.lineWidth = 2.5;
  const th = prog(u, 34.5, 35.0) * (1 - prog(u, 43.4, 43.9));
  drawPoly(ctx, [w0, PLAN[0]], th);
  ctx.setLineDash([]);
  for (const [a, b] of PLAN_E) {
    const p = prog(u, Math.max(PLAN_T[a], PLAN_T[b]) - 0.3, Math.max(PLAN_T[a], PLAN_T[b]) + 0.15);
    const off = Math.min(PLAN_OUT[a], PLAN_OUT[b]);
    const k = 1 - prog(u, off - 0.2, off + 0.1);
    if (p <= 0 || k <= 0) continue;
    ctx.strokeStyle = rgba(C.ink, 0.5 * k); ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 9]);
    const A = PLAN[PLAN_T[a] < PLAN_T[b] ? a : b], B = PLAN[PLAN_T[a] < PLAN_T[b] ? b : a];
    drawPoly(ctx, [A, B], p);
    ctx.setLineDash([]);
  }
  PLAN.forEach(([x, y], i) => {
    const k = clamp(springU(u, PLAN_T[i], SPRING.bouncy), 0, 1.25);
    const off = prog(u, PLAN_OUT[i], PLAN_OUT[i] + 0.25);
    const fl = off > 0 && off < 1 ? (Math.floor(u * 16) % 2 ? 0.3 : 1) : 1;
    const r = 13 * k * (1 - off);
    if (r <= 0.2) return;
    ctx.fillStyle = rgba(C.bg, 1); ctx.strokeStyle = rgba(C.ink, fl); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = rgba(C.ink, fl); ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, TAU); ctx.fill();
  });
  ctx.restore();
}

// S13: every light flies into the Xyntal X (the particle X of xyntal.de's hero).
const XS = 1100, XC = [540, 850];
const qpt = (p0, p1, p2, t) => [(1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]];
const XB = [[140, 140], [300, 212], [372, 372]], XA = [[140, 372], [212, 212], [372, 140]];
const toX = ([x, y]) => [XC[0] + (x - 256) / 512 * XS, XC[1] + (y - 256) / 512 * XS];
const PARTS = (() => {
  const R = mulberry32(777);
  const out = [];
  const n = 2400;
  for (let i = 0; i < n; i++) {
    const stroke = i % 2;
    const t = R();
    const [x, y] = qpt(...(stroke ? XA : XB), t);
    // spread across the stroke like the hero's particle cloud
    const ang = R() * TAU, rad = Math.abs((R() + R() + R()) / 3 - 0.5) * 2 * 34;
    const tgt = toX([x + Math.cos(ang) * rad, y + Math.sin(ang) * rad]);
    const col = stroke ? gradAt(t * 0.5) : gradAt(0.5 + t * 0.5);
    out.push({ tgt, col, src: R(), jx: R() * 2 - 1, jy: R() * 2 - 1, d: R(), r: 1.4 + R() * 2.6, ph: R() * 100 });
  }
  return out;
})();
const FLY0 = 99.8, WORD0 = 100.6, SCATTER = [103.6, 104.25];
function particlesX(ctx, u, srcAt) {
  const fly0 = FLY0;
  const out = E.inCubic(prog(u, SCATTER[0], SCATTER[1]));   // scatter into the app window
  const flash = 1;
  for (const p of PARTS) {
    const start = fly0 + p.d * 0.9;
    if (u < start) continue;
    const s = srcAt(p.src);
    const k = clamp(springU(u, start, { stiffness: 70, damping: 13 }), 0, 1.08);
    let x = lerp(s[0] + p.jx * 12, p.tgt[0], k), y = lerp(s[1] + p.jy * 12, p.tgt[1], k);
    // shimmer once in place
    x += noise1(u * 1.4 + p.ph, 3) * 4 * k; y += noise1(u * 1.4 + p.ph, 7) * 4 * k;
    // fly out toward the screen edges at the end
    if (out > 0) { x += (x - 540) * out * 2.2; y += (y - 860) * out * 2.2 + 900 * out; }
    const a = (k > 0 ? 0.35 + 0.65 * Math.min(1, k) : 0) * (1 - out) * flash;
    if (a <= 0.01) continue;
    ctx.fillStyle = rgba(p.col, a);
    ctx.beginPath(); ctx.arc(x, y, p.r, 0, TAU); ctx.fill();
  }
  // wordmark under the X
  const wm = 'xyntal';
  const f = font(150, 600, DISPLAY);
  const L = layout(ctx, wm, f, -3);
  const x0 = 540 - L.width / 2, base = 1335;
  L.glyphs.forEach((g, j) => {
    const k = springU(u, WORD0 + j * 0.05, SPRING.bouncy);
    if (k <= 0) return;
    glyph(ctx, g.ch, x0 + g.cx, base + (1 - k) * 60 + out * 900, f, rgba(C.ink, clamp(k) * (1 - out)));
  });
}

// ======================================================================= the globe (this read's beats)
// A dotted Earth (assets/world.json, land points from tools/world.py). The city collapses into your
// light over Germany; the camera flies to Lagos, Seoul and São Paulo, pulls back, and at "Meet
// Xyntal" arcs join the lights before they fly into the X.
const WORLD = await (await fetch('assets/world.json')).json();
const D2R = Math.PI / 180;
const vec = (lat, lon) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
const LAND = WORLD.map(([a, b]) => vec(a, b));
const HOME = [50.1, 8.7];
const HEROES = [
  { ll: [6.5, 3.4], lines: ['LAGOS · NIGERIA', 'DEVELOPER', 'LOOKING FOR: DESIGN'], u0: 72.58, side: 1 },
  { ll: [37.6, 127.0], lines: ['SEOUL · SOUTH KOREA', 'DESIGNER', 'LOOKING FOR: PROJECT'], u0: 77.62, side: 1 },
  { ll: [-23.5, -46.6], lines: ['SÃO PAULO · BRAZIL', 'FOUNDER', 'LOOKING FOR: TEAM'], u0: 83.35, side: 1 },
];
const CITY_LL = [[6.5, 3.4], [37.6, 127.0], [-23.5, -46.6], [5.6, -0.2], [-1.3, 36.8], [9.0, 38.7], [-4.3, 15.3], [-26.2, 28.0],
  [-33.9, 18.4], [30.0, 31.2], [33.6, -7.6], [14.7, -17.4], [-1.9, 30.1], [-15.4, 28.3], [35.7, 139.7], [31.2, 121.5],
  [22.5, 114.1], [25.0, 121.5], [14.6, 121.0], [-6.2, 106.8], [1.35, 103.8], [13.75, 100.5], [21.0, 105.8], [12.97, 77.6],
  [19.1, 72.9], [28.6, 77.2], [23.8, 90.4], [24.9, 67.0], [25.2, 55.3], [24.7, 46.7], [41.0, 29.0], [35.7, 51.4], [43.2, 76.9],
  [52.5, 13.4], [51.5, -0.1], [48.9, 2.35], [40.4, -3.7], [38.7, -9.1], [59.3, 18.1], [52.2, 21.0], [50.45, 30.5], [41.9, 12.5],
  [-34.6, -58.4], [4.7, -74.1], [-12.0, -77.0], [-33.45, -70.7], [19.4, -99.1], [-22.9, -43.2], [40.7, -74.0], [43.7, -79.4],
  [37.8, -122.4], [41.9, -87.6], [25.8, -80.2], [30.3, -97.7], [49.3, -123.1], [-33.9, 151.2], [-37.8, 145.0], [-36.85, 174.8],
  [6.4, 2.4], [12.0, 8.5], [-8.8, 13.2], [33.9, 35.5], [55.75, 37.6], [64.1, -21.9], [-41.3, 174.8], [10.5, -66.9]];
const angle = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
const HOMEV = vec(...HOME);
const CITIES = CITY_LL.map((ll, i) => ({ ll, v: vec(...ll), hero: i < 3 ? HEROES[i] : null }));
CITIES.forEach((c) => { c.d = angle(c.v, HOMEV); });
[...CITIES].sort((a, b) => a.d - b.d).forEach((c, k) => { c.litU = 69.2 + 1.8 * Math.sqrt(k / CITIES.length); });
CITIES[0].litU = Math.min(CITIES[0].litU, 70.4);
const ALLV = [HOMEV, ...CITIES.map((c) => c.v)];
const ARCS = (() => {
  const E2 = [];
  ALLV.forEach((v, i) => {
    const d = ALLV.map((w, j) => [angle(v, w), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]);
    for (const [, j] of d.slice(0, 2)) if (!E2.some(([a, b]) => (a === j && b === i) || (a === i && b === j))) E2.push([i, j]);
  });
  return E2;
})();

function globeCam(u) {
  const keys = [[68.4, HOME], [71.15, HEROES[0].ll], [76.4, HEROES[1].ll], [82.35, HEROES[2].ll], [87.9, [14, 4]]];
  let [lat0, lon0] = springKeys(u, keys, { stiffness: 55, damping: 13 });
  lon0 += 0.45 * Math.max(0, u - 88.5) + 34 * E.inOutSine(prog(u, 96.8, 103.5));
  let lr = kf(u, [[68.4, Math.log(60000)], [71.0, Math.log(1500)]], E.inOutSine);
  if (u > 71) lr = Math.log(1500) + Math.log(0.42) * bump(u, 76.95, 0.75) + Math.log(0.4) * bump(u, 82.9, 0.75);
  if (u > 87.9) lr = lerp(Math.log(1500), Math.log(455), clamp(springU(u, 87.9, { stiffness: 40, damping: 12 }), 0, 1.03));
  const R = Math.exp(lr);
  const la = lat0 * D2R, lo = lon0 * D2R;
  return { R, cx: 540, cy: 960,
    c: [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)],
    e: [-Math.sin(lo), Math.cos(lo), 0],
    n: [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)] };
}
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// project a point (unit vector scaled by h) -> [sx, sy, depth, visible]
function gp(v, g, h = 1) {
  const x = g.R * h * dot3(v, g.e), y = g.R * h * dot3(v, g.n), z = dot3(v, g.c);
  const vis = z > 0 || x * x + y * y > g.R * g.R;
  return [g.cx + x, g.cy - y, z, vis];
}
function slerp(a, b, t) {
  const w = angle(a, b), s0 = Math.sin(w);
  if (s0 < 1e-6) return a;
  const k0 = Math.sin((1 - t) * w) / s0, k1 = Math.sin(t * w) / s0;
  return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1];
}
// a great-circle arc lifted off the surface, drawn up to fraction p; hidden where it passes behind
function arc(ctx, a, b, g, p, style, lw, dash) {
  if (p <= 0) return;
  const w = angle(a, b), n = 40, lift = 0.08 + 0.22 * (w / Math.PI);
  ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.setLineDash(dash || []);
  ctx.beginPath();
  let pen = false;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * p;
    const q = gp(slerp(a, b, t), g, 1 + lift * Math.sin(Math.PI * t));
    if (q[3]) { if (pen) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); pen = true; } else pen = false;
  }
  ctx.stroke(); ctx.setLineDash([]);
}
// the window motif at a hero city, seen close
function heroWindow(ctx, x, y, s, u) {
  if (s <= 0.02) return;
  const w = 74 * s, h = 58 * s;
  const glow = ctx.createRadialGradient(x, y, 0, x, y, 90 * s);
  glow.addColorStop(0, rgba(C.ink, 0.3)); glow.addColorStop(1, rgba(C.ink, 0));
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, 90 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = C.ink; ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, y - h / 2, w, h); ctx.clip();
  person(ctx, x - w * 0.12, y + h / 2 + h * 0.05, h * 0.62, C.sil);
  ctx.strokeStyle = C.sil; ctx.lineWidth = Math.max(2, 3 * s);
  ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + h * 0.28); ctx.lineTo(x + w * 0.33, y + h * 0.28); ctx.lineTo(x + w * 0.4, y + h * 0.02); ctx.stroke();
  ctx.restore();
  spark(ctx, x - w * 0.12, y - h / 2 - 16 * s, 8 * s, u);
}

function sceneGlobe(ctx, u, alpha = 1) {
  const g = globeCam(u);
  const A = alpha * clamp(prog(u, 68.3, 69.6)) * (1 - prog(u, 100.0, 101.0));
  if (A > 0.003) globeBody(ctx, u, g, A);
  if (u > FLY0 - 0.05) {
    const vis = globeSources();
    const gf = globeCam(Math.min(u, FLY0 + 1.2));
    particlesX(ctx, u, (r) => { const q = gp(vis[Math.floor(r * vis.length)], gf); return [q[0], q[1]]; });
  }
}
function globeBody(ctx, u, g, A) {
  ctx.save(); ctx.globalAlpha = 1;
  // the sphere: a faint disc and limb
  if (g.R < 6000) {
    const disc = ctx.createRadialGradient(g.cx - g.R * 0.3, g.cy - g.R * 0.35, g.R * 0.1, g.cx, g.cy, g.R);
    disc.addColorStop(0, rgba('#202024', 0.9 * A)); disc.addColorStop(1, rgba('#161618', 0.9 * A));
    ctx.fillStyle = disc; ctx.beginPath(); ctx.arc(g.cx, g.cy, g.R, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(C.ink, 0.16 * A); ctx.lineWidth = 2; ctx.stroke();
  }
  // land dots, bucketed by depth so each bucket is one path
  const r0 = clamp(g.R * 0.0052, 1.3, 4.6);
  const buckets = [[], [], [], []];
  for (const v of LAND) {
    const z = dot3(v, g.c);
    if (z <= 0.02) continue;
    const x = g.cx + g.R * dot3(v, g.e), y = g.cy - g.R * dot3(v, g.n);
    if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
    buckets[Math.min(3, Math.floor(z * 4))].push(x, y);
  }
  buckets.forEach((b, k) => {
    if (!b.length) return;
    const r = r0 * (0.6 + 0.13 * k);
    ctx.fillStyle = rgba(C.ink3, (0.22 + 0.17 * k) * A);
    ctx.beginPath();
    for (let i = 0; i < b.length; i += 2) { ctx.moveTo(b[i] + r, b[i + 1]); ctx.arc(b[i], b[i + 1], r, 0, TAU); }
    ctx.fill();
  });
  // arcs: the dashed one that stops halfway (Lagos -> São Paulo), then the network in the gradient
  const fade = 1 - prog(u, 100.0, 100.8);
  if (u > 89 && u < 97) {
    const pp = 0.46 * E.outCubic(prog(u, 89.06, 91.3));
    const die = prog(u, 92.2, 93.4);
    const fl = die > 0 && die < 1 ? (Math.floor(u * 14) % 3 ? 1 : 0.2) : 1;
    arc(ctx, CITIES[0].v, CITIES[2].v, g, pp * (1 - 0.3 * die), rgba(C.ink, 0.8 * (1 - die) * fl * A), 3, [12, 10]);
  }
  if (u >= 97) {
    const a0 = gp(CITIES[0].v, g), a1 = gp(CITIES[2].v, g);
    arc(ctx, CITIES[0].v, CITIES[2].v, g, E.outCubic(prog(u, 97.0, 97.45)), grad(ctx, a0[0], a0[1], a1[0], a1[1], fade), 5);
    ARCS.forEach(([i, j], k) => {
      const t0 = 97.5 + 1.7 * hash01(k, 31);
      const q = E.outCubic(prog(u, t0, t0 + 0.4));
      if (q <= 0) return;
      const p0 = gp(ALLV[i], g), p1 = gp(ALLV[j], g);
      arc(ctx, ALLV[i], ALLV[j], g, q, grad(ctx, p0[0], p0[1], p1[0], p1[1], 0.85 * fade), 2.6);
    });
  }
  // lights
  const lightA = A * (1 - prog(u, 99.9, 100.5));
  const drawLight = (v, k, big) => {
    const q = gp(v, g);
    if (q[2] <= 0.04 || k <= 0) return null;
    const a = k * lightA * Math.min(1, q[2] * 3);
    const gl = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], big ? 30 : 22);
    gl.addColorStop(0, rgba(C.ink, 0.5 * a)); gl.addColorStop(1, rgba(C.ink, 0));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(q[0], q[1], big ? 30 : 22, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(C.ink, a); ctx.beginPath(); ctx.arc(q[0], q[1], big ? 5.5 : 4, 0, TAU); ctx.fill();
    return q;
  };
  const hq = drawLight(HOMEV, 1, true);
  if (hq && g.R < 4000) spark(ctx, hq[0], hq[1] - 22, 7, u, 0, lightA * Math.min(1, hq[2] * 3));
  for (const c of CITIES) {
    const k = clamp(prog(u, c.litU, c.litU + 0.15)) * (1 - 0.6 * bump(u, c.litU + 0.08, 0.08));
    const q = drawLight(c.v, k, !!c.hero);
    if (q && c.hero) heroWindow(ctx, q[0], q[1], clamp((g.R - 900) / 500) * lightA, u);
  }
  // labels: visible while their city faces us and is on screen
  for (const h of HEROES) {
    if (u < h.u0 || u > 96.6) continue;
    const q = gp(vec(...h.ll), g);
    const on = clamp(q[2] * 4) * clamp((q[0] + 40) / 120) * clamp((W + 40 - q[0]) / 120) * clamp((q[1] - 200) / 120) * clamp((H - 300 - q[1]) / 120);
    const a = on * A * (1 - prog(u, 95.8, 96.6));
    if (a <= 0.01) continue;
    const close = clamp((g.R - 900) / 500);
    const sc = lerp(0.68, 1, close);
    ctx.save(); ctx.globalAlpha = a;
    label(ctx, [q[0], q[1]], h.lines, u, h.u0, sc, h.side, lerp(18, 56, close));
    ctx.restore();
  }
  ctx.restore();
}
let VIS_CACHE = null;   // the lights that face us when the particles leave: a pure function of FLY0
function globeSources() {
  if (VIS_CACHE) return VIS_CACHE;
  const g = globeCam(FLY0);
  VIS_CACHE = ALLV.filter((v) => dot3(v, g.c) > 0.1);
  return VIS_CACHE;
}

// ======================================================================= the real app (English)
// Source-pixel crops of the real screenshots (public/assets/img/en/, converted to assets/app/en-*.png).
const DISC_FULL = [440, 100, 1640, 1660];                 // "Find your people." + Selin + Tom
const DISC_SELIN = [380, 700, 900, 911];                  // Selin's card, 91 % match
const PROF_MATCH = [560, 1415, 1060, 205];                // 91 % ring + "How well you and Selin Kaya fit"
const PROF_ADD = [560, 1895, 1100, 145];                  // Complement: what she brings that you lack
const PROF_WHY = [560, 2290, 1090, 135];                  // Vision Fit 20/20
const TA = { rise: 103.85, push: 107.3, why: 109.16, fall: 112.05 };
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

// ======================================================================= the line + end card
const TE = { words: [['Stop', 112.53, 0], ['building', 112.71, 1], ['alone.', 113.64, 1]], card: 114.85 };
function sceneEnd(ctx, u) {
  const up = springU(u, TE.card, SPRING.gentle);
  const sc = lerp(1, 0.62, up);
  const ox = 72, oy = lerp(760, 380, up);
  ctx.save(); ctx.translate(ox, oy); ctx.scale(sc, sc);
  const f1 = font(230, 800, DISPLAY);
  const f2 = font(M.fitSize(ctx, 'building alone.', 300, DISPLAY, 860, 160, -0.03), 300, DISPLAY);
  const lines = [[], []];
  TE.words.forEach((w) => lines[w[2]].push(w));
  lines.forEach((ws, li) => {
    const str = ws.map((w) => w[0]).join(' ');
    const L = layout(ctx, str, li ? f2 : f1, li ? -4 : -6);
    let idx = 0;
    ws.forEach(([wd, b]) => {
      [...wd].forEach((ch, j) => {
        const gph = L.glyphs[idx + j];
        const k = springU(u, b + j * 0.025, SPRING.bouncy);
        if (k <= 0) return;
        ctx.save(); ctx.beginPath(); ctx.rect(-20, li ? 40 : -240, 1300, li ? 210 : 290); ctx.clip();
        glyph(ctx, ch, gph.cx, (li ? 175 : 0) + (1 - k) * 200, li ? f2 : f1, C.ink);
        ctx.restore();
      });
      idx += wd.length + 1;
    });
  });
  ctx.restore();
  if (u > TE.card) {
    const t0 = TE.card + 0.15;
    const k = prog(u, t0, t0 + 0.9);
    const cx = 540, cy = 930, size = 360;
    const s = size / 512;
    ctx.save(); ctx.translate(cx - 256 * s, cy - 256 * s); ctx.scale(s, s);
    ctx.lineCap = 'round';
    const drawQ = (P, p, style, lw) => {
      const pts = Array.from({ length: 40 }, (_, i) => qpt(...P, i / 39));
      ctx.strokeStyle = style; ctx.lineWidth = lw; drawPoly(ctx, pts, p);
    };
    const gb = ctx.createLinearGradient(140, 140, 372, 372); gb.addColorStop(0, C.bl); gb.addColorStop(1, C.cy);
    const ga = ctx.createLinearGradient(140, 372, 372, 140); ga.addColorStop(0, C.pu); ga.addColorStop(1, C.bl);
    drawQ(XB, E.outCubic(k), gb, 60);
    drawQ(XA, E.outCubic(prog(u, t0 + 0.3, t0 + 1.2)), C.bg, 96);
    drawQ(XA, E.outCubic(prog(u, t0 + 0.3, t0 + 1.2)), ga, 60);
    ctx.restore();
    const wf = font(132, 600, DISPLAY);
    const L = layout(ctx, 'xyntal', wf, -3);
    L.glyphs.forEach((g, j) => {
      const kk = springU(u, t0 + 0.7 + j * 0.04, SPRING.snappy);
      if (kk <= 0) return;
      glyph(ctx, g.ch, 540 - L.width / 2 + g.cx, 1240 + (1 - kk) * 50, wf, rgba(C.ink, clamp(kk)));
    });
    const t1 = E.outQuint(prog(u, t0 + 1.4, t0 + 2.2));
    if (t1 > 0) {
      const tf = font(44, 400, DISPLAY);
      text(ctx, 'The place that connects', 540, 1318 + (1 - t1) * 24, tf, rgba(C.ink2, t1), 'center');
      text(ctx, 'ambitious people.', 540, 1372 + (1 - t1) * 24, tf, rgba(C.ink2, t1), 'center');
    }
    const t2 = E.outQuint(prog(u, t0 + 2.0, t0 + 2.8));
    if (t2 > 0) text(ctx, 'XYNTAL.DE · FREE DURING THE BETA', 540, 1462, font(32, 500, MONO), rgba(C.ink3, t2), 'center', 1.5);
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
  fonts: [font(100, 800, DISPLAY), font(100, 200, DISPLAY), font(100, 300, DISPLAY), font(100, 600, DISPLAY), font(100, 700, DISPLAY), font(100, 400, DISPLAY), font(40, 500, MONO)],
  images: { disc: 'assets/app/en-discover-2880.png', prof: 'assets/app/en-profil-2880.png' },
  hits: HITS,
  samples: 12,
  init() { GRAIN = makeGrain(); },
  draw(ctx, u, t, IMG) {
    const d = warp(u);                              // design beats for Act I + the city
    if (u < 31.3) sceneStage(ctx, d);
    else if (u < 71.0) {
      fill(ctx, C.bg);
      ctx.save(); ctx.globalAlpha = 1 - prog(u, 69.0, 70.4); sceneCity(ctx, d); ctx.restore();
      sceneGlobe(ctx, u);
    } else if (u < 103.85) { fill(ctx, C.bg); sceneGlobe(ctx, u); }
    else if (u < 112.05) {
      fill(ctx, C.bg);
      if (u < 104.3) particlesX(ctx, u, (r) => { const vis = globeSources(); const q = gp(vis[Math.floor(r * vis.length)], globeCam(FLY0 + 1.2)); return [q[0], q[1]]; });
      sceneApp(ctx, u, IMG);
    } else {
      fill(ctx, C.bg);
      if (u < 112.9) sceneApp(ctx, u, IMG);
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

