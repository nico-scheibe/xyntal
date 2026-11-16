// Xyntal – The Real Ones. A pure function of time: window.seek(t) paints frame t (lib/motion.js).
// Timing is in beats (u) on the 84 BPM grid; captions and cues come from the word onsets in vo.json.
// docs/script_en.md is the plan. Helpers, the app shot and the logo come from ../verbunden.
import * as M from './lib/motion.js';

const { W, H, E, prog, lerp, clamp, springU, springKeys, SPRING, wobble, kf, font, layout, glyph, text,
  fill, rrect, hash01, noise1, mix, bump, TAU, mulberry32 } = M;

const C = {
  bg: '#141416', bg2: '#1A1A1C', ink: '#ECEAE4', ink2: '#B9B7B0', ink3: '#918F89',
  gray: '#3A3A3F', gray2: '#5A5A61', sil: '#232326', pu: '#B36BFF', bl: '#3A8AFF', cy: '#3FE0F0',
};
const DISPLAY = 'Display', MONO = 'UI';

const HITS = [
  [0, 'hook', 'thud', { gain: 0.2 }],
  [1.07, 'X friends', 'click', { gain: 0.35 }], [2.66, 'X family', 'click', { gain: 0.35 }], [3.91, 'X everybody', 'click', { gain: 0.35 }],
  [7.45, 'you step up', 'pop', { pitch: 'G#4', gain: 0.2 }],
  [11.2, 'the dream', 'blip', { pitch: 'D#6', gain: 0.1 }],
  [15.0, 'SHIP', 'pop', { pitch: 'C5', gain: 0.18 }], [15.6, 'SHIP press', 'tick', { gain: 0.2 }],
  [18.9, 'customers 0', 'pop', { pitch: 'G#4', gain: 0.18 }],
  ...[21.38, 21.89, 22.72, 23.34, 24.42].map((b, i) => [b, `opinion ${i}`, 'pop', { pitch: ['C5', 'D#5', 'F5', 'G#5', 'A#5'][i], gain: 0.14 }]),
  [27.9, 'permission', 'pop', { pitch: 'D#5', gain: 0.18 }], [28.2, 'X permission', 'click', { gain: 0.35 }],
  [29.2, 'approval', 'pop', { pitch: 'G#4', gain: 0.18 }], [31.3, 'X approval', 'click', { gain: 0.35 }],
  [32.85, 'split', 'whoosh', { len: 0.4, from: 1500, to: 500, gain: 0.14 }],
  [37.2, 'clapping', 'tick', { gain: 0.15 }], [38.6, 'X clapping', 'click', { gain: 0.35 }],
  [40.6, 'phone', 'pop', { pitch: 'C5', gain: 0.16 }], [42.17, 'phone off', 'click', { gain: 0.3 }],
  ...[42.9, 43.6, 44.2, 44.8].map((b, i) => [b, `block ${i}`, 'thud', { gain: 0.14 }]),
  ...[47.95, 48.01, 48.07, 48.13, 48.19, 48.25].map((b, i) => [b, `light ${i}`, 'blip', { pitch: ['D#6', 'F#6', 'G#6', 'A#6', 'C#7', 'D#7'][i], gain: 0.06 }]),
  [49.5, 'pull back', 'whoosh', { len: 1.4, from: 1500, to: 300, gain: 0.12 }],
  ...[55.1, 55.34, 55.58, 55.82].map((b, i) => [b, `clock ${i}`, 'tick', { gain: 0.08 }]),
  [62.95, 'connected', 'impact', { gain: 0.35 }],
  [63.2, 'blocks fly', 'whoosh', { len: 1.2, from: 400, to: 2500, gain: 0.16 }],
  [64.85, 'app window', 'whoosh', { len: 0.6, from: 600, to: 2400, gain: 0.16 }],
  [65.3, 'window lands', 'thud', { gain: 0.18 }],
  [67.3, 'window falls', 'whoosh', { len: 0.5, from: 1800, to: 400, gain: 0.14 }],
  [67.55, 'Find your real ones', 'thud', { gain: 0.22 }],
  [69.7, 'streaks rise', 'riser', { len: 0.5, gain: 0.14 }],
  [70.05, 'stroke B', 'whoosh', { len: 0.25, from: 900, to: 4000, pan: -0.3, gain: 0.2 }],
  [70.35, 'stroke A', 'whoosh', { len: 0.25, from: 900, to: 4000, pan: 0.3, gain: 0.2 }],
  [70.65, 'logo hit', 'impact', { gain: 0.55 }],
  [71.15, 'sheen', 'bell', { pitch: 'D#7', gain: 0.12 }],
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
// ======================================================================= captions (the reference's big caps)
// Each VO line builds word by word at the top as it is spoken (vo.json word onsets), wrapped to two lines.
const VO = await (await fetch('vo.json')).json();
const UB = (t) => t / (60 / 84);
const CAP = [];
VO.lines.forEach((l) => {
  let cur = null;
  l.words.forEach((w, k) => {
    const word = { w: w.w.replace('Ksintal', 'Xyntal').toUpperCase(), u: UB(w.t0) };
    if (!cur) { cur = { i: l.i, t0: word.u, words: [] }; CAP.push(cur); }
    cur.words.push(word);
    if (/[.!?]$/.test(w.w) && k < l.words.length - 1) cur = null;   // a new caption per sentence
  });
});
CAP.forEach((c, k) => { c.end = k + 1 < CAP.length ? CAP[k + 1].t0 - 0.06 : 999; c.show = k === 0 ? -1 : c.t0 - 0.12; });
const BIG = { 7: 118, 10: 122 };
function captions(ctx, u) {
  const c = [...CAP].reverse().find((x) => u >= x.show);
  if (!c || u > c.end) return;
  let size = BIG[c.i] || 84;
  const maxW = 960;
  const f = () => font(size, 800, DISPLAY);
  const wid = (ws) => layout(ctx, ws.map((w) => w.w).join(' '), f(), -1).width;
  // greedy wrap, up to three lines; shrink only if it still doesn't fit
  const wrap = () => {
    const out = [[]];
    for (const w of c.words) { const ln = out[out.length - 1]; if (ln.length && wid([...ln, w]) > maxW) out.push([w]); else ln.push(w); }
    return out;
  };
  let lines = wrap();
  while ((lines.length > 3 || Math.max(...lines.map(wid)) > maxW) && size > 40) { size -= 2; lines = wrap(); }
  const lh = size * 1.05, y0 = 300 + size * 0.85;
  const out = prog(u, c.end - 0.15, c.end), inn = clamp(prog(u, c.show, c.show + 0.12));
  lines.forEach((ln, li) => {
    const L = layout(ctx, ln.map((w) => w.w).join(' '), f(), -1);
    let idx = 0;
    ln.forEach((w) => {
      const lit = clamp(prog(u, w.u - 0.03, w.u + 0.08));
      const pop = 1 + 0.08 * bump(u, w.u + 0.05, 0.12);
      [...w.w].forEach((ch, j) => {
        const g = L.glyphs[idx + j];
        glyph(ctx, ch, 540 - L.width / 2 + g.cx, y0 + li * lh, f(), rgba(C.ink, (0.22 + 0.78 * lit) * inn * (1 - out)), pop, pop);
      });
      idx += w.w.length + 1;
    });
  });
}

// ======================================================================= the floor scenes (u 0..64.9)
const FL = 1250;                                   // floor line (feet)
const HX = 540, HS = 200;                          // hero position / size
function glowPerson(ctx, x, y, s, a = 1, col = C.ink) {
  ctx.save(); ctx.shadowColor = rgba('#FFFFFF', 0.6 * a); ctx.shadowBlur = 44; person(ctx, x, y, s, rgba(col, a)); ctx.restore();
}
function cross(ctx, x, y, r, p, a = 1) {      // an X drawn in two strokes
  if (p <= 0) return;
  ctx.save(); ctx.strokeStyle = rgba(C.ink, a); ctx.lineWidth = 7; ctx.lineCap = 'round';
  drawPoly(ctx, [[x - r, y - r], [x + r, y + r]], clamp(p * 2));
  drawPoly(ctx, [[x + r, y - r], [x - r, y + r]], clamp(p * 2 - 1));
  ctx.restore();
}
function chip(ctx, x, y, s, k, a = 1) {
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  ctx.font = font(30, 500, MONO); const w = ctx.measureText(s).width + 40;
  rrect(ctx, -w / 2, -28, w, 52, 26); ctx.fillStyle = rgba(C.bg, 0.9 * a); ctx.fill();
  ctx.strokeStyle = rgba(C.ink, 0.85 * a); ctx.lineWidth = 3; ctx.stroke();
  text(ctx, s, 0, 9, font(30, 500, MONO), rgba(C.ink, a), 'center');
  ctx.restore();
}
function boxTag(ctx, x, y, lab, val, k, a = 1) {   // "APPROVAL 0 / 100" style box
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  rrect(ctx, -170, -80, 340, 160, 14); ctx.fillStyle = rgba(C.bg, 0.9); ctx.fill(); ctx.strokeStyle = rgba(C.ink, a); ctx.lineWidth = 4; ctx.stroke();
  text(ctx, lab, 0, -30, font(24, 500, MONO), rgba(C.ink3, a), 'center', 3);
  text(ctx, val, 0, 40, font(66, 500, MONO), rgba(C.ink, a), 'center');
  ctx.restore();
}
function block(ctx, x, y, w, h, a = 1, fillA = 0) {
  rrect(ctx, x - w / 2, y - h, w, h, 8);
  if (fillA) { ctx.fillStyle = rgba(C.ink, fillA * a); ctx.fill(); }
  ctx.strokeStyle = rgba(C.ink, a); ctx.lineWidth = 4; ctx.stroke();
}
const GROUPS = [[200, 'FRIENDS', 1.07], [540, 'FAMILY', 2.66], [880, 'EVERYBODY', 3.91]];
function groupAt(gi, u) {          // groups step aside once you step forward
  const [x] = GROUPS[gi];
  const aside = springU(u, 7.6, SPRING.gentle);
  const tx = gi === 1 ? (u < 7.6 ? 540 : lerp(540, 840, clamp(aside))) : gi === 0 ? lerp(200, 160, clamp(aside)) : lerp(880, 960, clamp(aside));
  return gi === 1 ? tx : tx;
}
const OPIN = [['get a real job', 300, 820, 21.38], ['be realistic', 790, 760, 21.89], ['that won\'t work', 260, 1000, 22.72],
  ['who do you think you are?', 700, 960, 23.34], ['just play it safe', 420, 690, 24.42]];
const BUILDERS = [-380, 60, 1230, 1640, -820, 2050].map((x, i) => ({ x, tw: 2 + (i % 3), clock: ['02:47', '03:12', '01:58', '02:47', '03:05', '02:21', '03:40', '01:33'][i], d: Math.abs(x - 540) }));
function stageCam(u) {
  // static on the floor; pulls back for the builders, pushes in on the shared tower at the drop
  const z = Math.exp(kf(u, [[0, 0], [47.1, 0], [49.2, Math.log(0.56)], [61.5, Math.log(0.52)], [62.9, Math.log(0.52)], [64.6, Math.log(0.6)]], E.inOutCubic));
  const cy = kf(u, [[0, 960], [47.1, 960], [49.2, 900], [62.9, 900], [64.6, 760]], E.inOutCubic);
  return { cx: 540, cy, z };
}
function sceneFloor(ctx, u) {
  fill(ctx, C.bg);
  const cam = stageCam(u), z = cam.z;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-cam.cx, -cam.cy);
  floorGrid(ctx, FL, 1, 540, 5000);
  const dark = u > 46.6 && u < 48.0;
  // ---- S1/S2: the three groups, crossed out
  if (u < 46.5) {
    const gA = 1 - prog(u, 13.4, 14.0) * 0.55;            // they stay as background later
    GROUPS.forEach(([x0, lab, b], gi) => {
      const x = groupAt(gi, u);
      for (let k = -1; k <= 1; k++) person(ctx, x + k * 70, FL, 108, rgba(C.gray2, gA));
      text(ctx, lab, x, FL + 60, font(24, 500, MONO), rgba(C.ink3, gA * (1 - prog(u, 7.0, 7.6))), 'center', 3);
      const p = prog(u, b, b + 0.45) * (1 - prog(u, 6.46, 7.2));
      cross(ctx, x, FL - 85, 95, p);
    });
  }
  // ---- you
  const heroIn = clamp(springU(u, 7.45, SPRING.bouncy), 0, 1.1);
  const heroA = u < 7.4 ? 0 : 1;
  const split = u > 32.8 && u < 39.6;
  if (heroA && !split && u < 49.6) glowPerson(ctx, HX, FL - (1 - Math.min(1, heroIn)) * 120, HS * Math.min(1, heroIn) + 0.01);
  if (heroA && u < 13.5 && u > 7.4) spark(ctx, HX, FL - HS * 1.48, 16, u);
  // the dream: an empty dashed tower above you (S2)
  const dr = clamp(springU(u, 11.2, SPRING.gentle)) * (1 - prog(u, 13.3, 13.9));
  if (dr > 0.01) { ctx.save(); ctx.setLineDash([12, 10]); for (let k = 0; k < 4; k++) block(ctx, HX + 300, FL - 40 - k * 110, 210, 96, dr * 0.7); ctx.restore(); text(ctx, 'YOUR DREAM', HX + 300, FL + 60, font(24, 500, MONO), rgba(C.ink3, dr), 'center', 3); }
  // ---- S3: SHIP stays grey, CUSTOMERS 0
  if (u > 14.5 && u < 20.3) {
    const k = clamp(springU(u, 15.0, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 19.8, 20.3));
    if (k > 0.01) {
      ctx.save(); ctx.translate(240, 840); ctx.scale(k, k);
      const press = bump(u, 15.6, 0.35);
      rrect(ctx, -120, -50 + press * 8, 240, 100, 50); ctx.fillStyle = rgba(C.gray, 0.95); ctx.fill();
      text(ctx, 'SHIP', 0, 18 + press * 8, font(44, 800, DISPLAY), rgba(C.ink3, 1), 'center', 2);
      ctx.restore();
    }
    boxTag(ctx, 820, 840, 'CUSTOMERS', '0', clamp(springU(u, 18.9, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 19.8, 20.3)));
  }
  // ---- S4: opinions
  OPIN.forEach(([s, x, y, b]) => chip(ctx, x, y, s, clamp(springU(u, b, SPRING.bouncy), 0, 1.12) * (1 - prog(u, 26.4, 26.9))));
  // ---- S5: permission, approval
  if (u > 27.0 && u < 32.9) {
    const k = clamp(springU(u, 27.9, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 32.3, 32.8));
    if (k > 0.01) { ctx.save(); ctx.translate(800, 900); ctx.scale(k, k); rrect(ctx, -170, -46, 340, 92, 10); ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.stroke(); text(ctx, 'PERMISSION', 0, 13, font(36, 500, MONO), C.ink, 'center', 2); ctx.restore(); }
    cross(ctx, 800, 900, 120, prog(u, 28.2, 28.7) * (1 - prog(u, 29.0, 29.3)));
    const ap = clamp(springU(u, 29.2, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 32.3, 32.8));
    if (u > 29.0) { boxTag(ctx, 800, 900, 'APPROVAL', '0 / 100', ap); cross(ctx, 800, 900, 120, prog(u, 31.3, 31.8) * (1 - prog(u, 32.3, 32.8))); }
  }
  // ---- S6: IDEA | LAUNCH
  if (split) {
    const a = clamp(prog(u, 32.85, 33.2)) * (1 - prog(u, 39.2, 39.6));
    ctx.strokeStyle = rgba(C.ink, 0.35 * a); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(540, 650); ctx.lineTo(540, FL + 20); ctx.stroke();
    text(ctx, 'IDEA', 270, 700, font(26, 500, MONO), rgba(C.ink3, a), 'center', 4);
    text(ctx, 'LAUNCH', 810, 700, font(26, 500, MONO), rgba(C.ink3, a), 'center', 4);
    glowPerson(ctx, 270, FL, 140, a); spark(ctx, 270, FL - 140 * 1.48, 13, u, 0, a);
    [-1, 1].forEach((sd) => person(ctx, 270 + sd * 150, FL, 100, rgba(C.gray2, a)));
    // nobody claps on the left: a flat "0" over them
    text(ctx, '0', 270, 900, font(60, 500, MONO), rgba(C.ink3, a * clamp(prog(u, 34.6, 35.0))), 'center');
    // right: a tower, and the same people suddenly clapping (crossed out on "works")
    const r = clamp(prog(u, 35.9, 36.3)) * a;
    for (let k = 0; k < 4; k++) block(ctx, 810, FL - k * 70, 150, 62, r, 0.06);
    glowPerson(ctx, 810, FL - 280, 110, r);
    [-1, 1].forEach((sd, j) => {
      const hop = Math.abs(Math.sin((u - 37.2) * 9 + j)) * 18 * clamp(prog(u, 37.1, 37.4)) * (1 - prog(u, 38.6, 38.9));
      person(ctx, 810 + sd * 170, FL - hop, 100, rgba(C.gray2, r));
      if (u > 37.15) text(ctx, '+1', 810 + sd * 170, FL - 170 - hop, font(30, 500, MONO), rgba(C.ink2, r * (1 - prog(u, 38.6, 38.9))), 'center');
    });
    cross(ctx, 810, 1110, 150, prog(u, 38.6, 39.1) * a);
  }
  // ---- S7: phone off, build alone
  if (u > 40.2 && u < 46.6) {
    const k = clamp(springU(u, 40.6, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 42.6, 43.0));
    if (k > 0.01) {
      ctx.save(); ctx.translate(800, 860); ctx.scale(k, k);
      rrect(ctx, -90, -170, 180, 340, 26); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C.ink; ctx.lineWidth = 5; ctx.stroke();
      const off = u > 42.17;
      if (!off) { ctx.beginPath(); ctx.arc(0, 0, 34, -Math.PI * 0.35, Math.PI * 1.35); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(0, -6); ctx.stroke(); }
      else text(ctx, 'OFF', 0, 16, font(48, 800, DISPLAY), C.ink, 'center', 2);
      ctx.restore();
    }
    const nb = [42.9, 43.6, 44.2, 44.8];
    nb.forEach((b, j) => {
      const kk = clamp(springU(u, b, SPRING.bouncy), 0, 1.06) * (1 - prog(u, 46.3, 46.6));
      if (kk > 0.01) block(ctx, 800, FL - j * 92 - (1 - Math.min(1, kk)) * 120, 220, 84, Math.min(1, kk), 0.05);
    });
  }
  // ---- S8-S10: the other builders light up, the shared tower
  if (u > 47.6) {
    const tower = E.inOutCubic(prog(u, 63.2, 64.6));          // their blocks fly to the middle
    BUILDERS.forEach((b, j) => {
      const on = clamp(prog(u, 47.95 + j * 0.06, 48.25 + j * 0.06));
      if (on <= 0) return;
      const fl = on < 1 ? (Math.floor(u * 22 + j) % 2 ? 0.4 : 1) : 1;
      glowPerson(ctx, b.x, FL, HS, on * fl);
      spark(ctx, b.x, FL - HS * 1.48, 16, u + j, 0, on);
      for (let k = 0; k < b.tw; k++) {
        const bk = clamp(springU(u, 52.6 + j * 0.15 + k * 0.25, SPRING.bouncy), 0, 1.05);
        if (bk <= 0.01) continue;
        const sx = b.x + 230, sy = FL - k * 92;
        // in the shared tower the blocks pack at half height, so it stays clear of the caption
        const ty = FL - 4 * 92 - (k + BUILDERS.slice(0, j).reduce((a, q) => a + q.tw, 0)) * 46;
        block(ctx, lerp(sx, 800, tower), lerp(sy, ty, tower), lerp(220, 200, tower), lerp(84, 40, tower), Math.min(1, bk), 0.05);
      }
      const ck = clamp(springU(u, 55.1 + j * 0.12, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 62.6, 63.0));
      chip(ctx, b.x, FL - HS * 1.95, b.clock, ck);
    });
    // your own four blocks stay; your clock too
    if (u > 47.6) {
      for (let k = 0; k < 4; k++) block(ctx, 800, FL - k * 92, 220, 84, 1, 0.05);
      chip(ctx, HX, FL - HS * 1.95, '02:47', clamp(springU(u, 55.1, SPRING.bouncy), 0, 1.1) * (1 - prog(u, 62.6, 63.0)));
    }
    // the drop: lines in the gradient from you to everyone
    BUILDERS.forEach((b, j) => {
      const q = E.outCubic(prog(u, 62.95 + j * 0.05, 63.4 + j * 0.05));
      if (q <= 0) return;
      const A = [HX, FL - HS * 1.5], B = [b.x, FL - HS * 1.5], Cc = [(A[0] + B[0]) / 2, A[1] - 260 - Math.abs(B[0] - A[0]) * 0.18];
      const pts = Array.from({ length: 30 }, (_, k) => qpt(A, Cc, B, k / 29));
      ctx.strokeStyle = grad(ctx, A[0], A[1], B[0], B[1]); ctx.lineWidth = 6 / z;
      drawPoly(ctx, pts, q);
      if (q >= 1) { const ph = ((u - 63.4) * 0.8 + j * 0.17) % 1; const pk = qpt(A, Cc, B, ph); bloom(ctx, pk[0], pk[1], 40 / z, 0.8); }
    });
    if (u > 62.9) bloom(ctx, HX, FL - 300, 900, 0.5 * Math.exp(-Math.max(0, u - 62.95) * 4));
    if (u > 47.6) glowPerson(ctx, HX, FL, HS);
  }
  ctx.restore();
  if (dark) { ctx.fillStyle = rgba('#000', 0.35 * bump(u, 47.3, 0.6)); ctx.fillRect(0, 0, W, H); }
}

// ======================================================================= end card (logo once, xyntal.com)
const TE2 = { card: 69.7 };
function endCard(ctx, u) {
  const t0 = TE2.card + 0.15, hit = t0 + 0.8;
  const LX = 540, LY = 1000, LS = 460;
  // streaks rise from the builders' places on the floor into the mark
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let n = 0; n < 48; n++) {
    const d = hash01(n, 42), sx = 80 + hash01(n, 41) * 920, sy = 1650 + hash01(n, 43) * 200;
    const a0 = t0 - 0.35 + d * 0.3, pt = prog(u, a0, a0 + 0.55);
    if (pt <= 0 || pt >= 1) continue;
    const at = (q) => { const e = E.inCubic(q); return [lerp(sx, LX, e), lerp(sy, LY, e)]; };
    const [x1, y1] = at(pt), [x0, y0] = at(Math.max(0, pt - 0.22));
    const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, rgba(gradAt(d), 0)); g.addColorStop(1, rgba(gradAt(d), 0.9));
    ctx.strokeStyle = g; ctx.lineWidth = 3 + 3 * d; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
  if (u <= t0) return;
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
    ctx.beginPath(); ctx.arc(LX, LY, r, 0, TAU); ctx.stroke(); ctx.restore();
  }
  wordmarkIn(ctx, u, hit + 0.15, 540, 1340, 132);
  const t2 = E.outQuint(prog(u, t0 + 1.6, t0 + 2.4));
  if (t2 > 0) text(ctx, 'XYNTAL.COM', 540, 1440, font(40, 500, MONO), rgba(C.ink2, t2), 'center', 4);
}

// ======================================================================= the real app (English)
// Source-pixel crops of the real screenshots (public/assets/img/en/, converted to assets/app/en-*.png).
const DISC_FULL = [440, 100, 1640, 1660];                 // "Find your people." + Selin + Tom
const DISC_SELIN = [380, 700, 900, 911];                  // Selin's card, 91 % match
const PROF_MATCH = [560, 1415, 1060, 205];                // 91 % ring + "How well you and Selin Kaya fit"
const PROF_ADD = [560, 1895, 1100, 145];                  // Complement: what she brings that you lack
const PROF_WHY = [560, 2290, 1090, 135];                  // Vision Fit 20/20
const TA = { rise: 64.85, push: 65.6, why: 999, fall: 67.3 };
function sceneApp(ctx, u, IMG) {
  const rise = springU(u, TA.rise, { stiffness: 140, damping: 19 });
  const fall = E.inCubic(prog(u, TA.fall, TA.fall + 0.7));
  const wX = 60, wW = 960, wH = 972, wY0 = 600;
  const toWhy = springU(u, TA.why, SPRING.gentle);
  if (u < TA.why + 0.3 || toWhy < 0.6) {
    const y = lerp(H + 80, wY0, rise) + 1300 * fall;
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
  fonts: [font(100, 800, DISPLAY), font(100, 600, DISPLAY), font(40, 500, MONO)],
  images: { disc: 'assets/app/en-discover-2880.png', prof: 'assets/app/en-profil-2880.png' },
  hits: HITS,
  samples: 10,
  init() { GRAIN = makeGrain(); },
  draw(ctx, u, t, IMG) {
    if (u < 67.9) {
      sceneFloor(ctx, u);
      if (u > 64.7) { ctx.fillStyle = rgba(C.bg, 0.75 * clamp(prog(u, 64.7, 65.2)) * (1 - prog(u, 67.3, 67.9))); ctx.fillRect(0, 0, W, H); sceneApp(ctx, u, IMG); }
    } else fill(ctx, C.bg);
    if (u > 67.5) endCard(ctx, u);
    captions(ctx, u);
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
