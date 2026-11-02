// Xyntal · POV Feature-Rad (Spot A). Pure function of time: window.seek(t) paints frame t.
// Timing in beats (u) on beats.json (124 bpm). docs/shotlist.md is the plan this file follows.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, clamp, springU, SPRING, wobble, font, layout, glyph, text, fill, rrect, hash01, noise1, TAU } = M;

// Brand tokens from assets/brand.json + public/cosmos.css. Accent = the logo gradient.
const C = {
  bg: '#07070B', panel: '#111117', panel2: '#161B22', line: 'rgba(255,255,255,0.08)',
  text: '#F5F5F7', muted: '#A1A1AA', dim: '#6E6E78',
  violet: '#B95CFF', pink: '#FF5FD2', blue: '#5B8CFF', cyan: '#3FD8FF', green: '#34D399',
};
const DISPLAY = 'Display', UI = 'UI';
const GRAD = [C.violet, C.pink, C.blue, C.cyan];
const grad = (ctx, x0, y0, x1, y1) => {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, C.violet); g.addColorStop(0.34, C.pink); g.addColorStop(0.68, C.blue); g.addColorStop(1, C.cyan);
  return g;
};
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// ---------------------------------------------------------------- the wheel
const CARDS = [
  { name: 'Projekte', sub: 'offene Rollen, klare Erwartungen', icon: 'stack' },
  { name: 'Xyntal-Karte', sub: 'xyntal.de/deinname', icon: 'card' },
  { name: 'Arbeitsstil-Test', sub: '28 Blöcke, dein Builder-Profil', icon: 'bars' },
  { name: 'Nachrichten', sub: 'Threads, Sprachnachrichten, live', icon: 'bubble' },
  { name: 'Workspaces', sub: 'Aufgaben, Meilensteine, Team-Chat', icon: 'grid' },
  { name: 'Community', sub: 'Updates, Fragen, Erfolge', icon: 'dots' },
  { name: 'Treffen', sub: 'vor Ort und remote', icon: 'cal' },
  { name: 'Passung', sub: 'zehn Bereiche, ein Grund pro Zahl', icon: 'ring' },
];
const LOCK = 16;                       // beat the wheel locks on "Passung"
const N = CARDS.length, TRAVEL = 7;    // cards scrolled from Projekte (centre at u=0) to Passung
const SPIN_POW = 2.1;
const spinPos = (u) => (u >= LOCK ? TRAVEL : TRAVEL * (1 - (1 - clamp(u / LOCK)) ** SPIN_POW));
// beat at which card k reaches the centre (inverse of spinPos)
const crossBeat = (k) => LOCK * (1 - (1 - k / TRAVEL) ** (1 / SPIN_POW));

const HITS = [
  [0, 'frame 0: Projekte in centre', 'thud', { pitch: 70 }],
  ...[1, 2, 3, 4, 5, 6].map((k) => [Math.round(crossBeat(k) * 4) / 4, `wheel: ${CARDS[k].name}`, 'click']),
  [LOCK, 'lock on Passung', 'impact'],
  [LOCK + 0.25, 'lock bell', 'bell', { pitch: 'A5' }],
  [16.75, 'panel opens', 'whoosh', { len: 0.5, from: 500, to: 2600 }],
  [17, 'prompt types', 'type', { n: 14, len: 0.75 }],
  [18.5, 'Lukas lands', 'thud'],
  [19, 'Ana behind', 'pop', { pitch: 'E5' }],
  [20.5, 'reason 1', 'blip', { pitch: 'A5' }],
  [21.5, 'reason 2', 'blip', { pitch: 'C#6' }],
  [22.5, 'reason 3', 'blip', { pitch: 'E6' }],
  [24, 'Deshalb passt\'s', 'bell', { pitch: 'D6' }],
  [24.5, 'chime 2', 'bell', { pitch: 'A6' }],
  [26.5, 'end card', 'impact'],
  [27, 'logo', 'bell', { pitch: 'A5' }],
];

// ---------------------------------------------------------------- background
function background(ctx, u, t) {
  fill(ctx, C.bg);
  // ambient glows (cosmos.css radial gradients)
  let g = ctx.createRadialGradient(0, -200, 0, 0, -200, 1100);
  g.addColorStop(0, 'rgba(185,92,255,0.18)'); g.addColorStop(1, 'rgba(185,92,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W + 100, H * 0.55, 0, W + 100, H * 0.55, 900);
  g.addColorStop(0, 'rgba(63,216,255,0.12)'); g.addColorStop(1, 'rgba(63,216,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // stars (seeded), slow twinkle
  for (let i = 0; i < 170; i++) {
    const x = hash01(i, 11) * W, y = hash01(i, 12) * H, r = 0.6 + hash01(i, 13) * 1.4;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + hash01(i, 14) * 1.5) + hash01(i, 15) * TAU));
    ctx.fillStyle = `rgba(245,245,247,${(0.18 + 0.5 * hash01(i, 16)) * tw})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // faint network (cosmos.js): drifting nodes, lines between neighbours
  const nodes = [];
  for (let i = 0; i < 22; i++) {
    nodes.push([hash01(i, 21) * W + 90 * noise1(t * 0.05 + i * 3.1, 7), hash01(i, 22) * H + 90 * noise1(t * 0.05 + i * 5.3, 9)]);
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1], d = Math.hypot(dx, dy);
    if (d > 330) continue;
    ctx.strokeStyle = rgba(GRAD[(i + j) % 4], 0.11 * (1 - d / 330));
    ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[j][0], nodes[j][1]); ctx.stroke();
  }
  for (const [i, [x, y]] of nodes.entries()) {
    ctx.fillStyle = rgba(GRAD[i % 4], 0.35); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill();
  }
}

// ---------------------------------------------------------------- pinned header
function header(ctx, u) {
  const s = FORMAT.safe;
  const size = 62, f = font(size, 700, DISPLAY), track = -0.02 * size;
  const lines = [['POV: Du hast dich für die', null], ['Xyntal-Beta', 'beworben']];
  const y0 = s.y + 70;
  const k = springU(u, -0.3, SPRING.snappy);
  const exit = E.inBack(prog(u, 26.1, 26.5), 1.2);
  ctx.save(); ctx.globalAlpha = Math.max(0, 1 - exit);
  ctx.translate(0, (1 - k) * -40 - exit * 300);
  // line 1
  text(ctx, lines[0][0], W / 2, y0, f, C.text, 'center', track);
  // line 2: gradient word + white word
  const a = 'Xyntal-Beta', b = ' beworben';
  const La = layout(ctx, a, f, track), Lb = layout(ctx, b, f, track);
  const total = La.width + Lb.width, x = W / 2 - total / 2, y = y0 + size * 1.12;
  ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'left';
  ctx.fillStyle = grad(ctx, x, 0, x + La.width, 0); ctx.fillText(a, x, y);
  ctx.fillStyle = C.text; ctx.fillText(b, x + La.width, y);
  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ---------------------------------------------------------------- vector icons (no emoji)
function icon(ctx, kind, x, y, r, color) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = r * 0.18; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const s = r * 0.62;
  switch (kind) {
    case 'stack': for (let i = -1; i <= 1; i++) { rrect(ctx, -s, i * s * 0.75 - s * 0.22, 2 * s, s * 0.44, s * 0.2); ctx.fill(); } break;
    case 'card': rrect(ctx, -s, -s * 0.7, 2 * s, 1.4 * s, s * 0.25); ctx.stroke(); ctx.beginPath(); ctx.arc(-s * 0.45, -s * 0.15, s * 0.22, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(0, 0.3 * s); ctx.lineTo(s * 0.55, 0.3 * s); ctx.stroke(); break;
    case 'bars': [[-0.7, 0.5], [0, 1.0], [0.7, 0.75]].forEach(([dx, h]) => { ctx.beginPath(); ctx.moveTo(dx * s, s * 0.8); ctx.lineTo(dx * s, s * 0.8 - h * 1.6 * s); ctx.stroke(); }); break;
    case 'bubble': rrect(ctx, -s, -s * 0.8, 2 * s, 1.4 * s, s * 0.5); ctx.fill(); ctx.beginPath(); ctx.moveTo(-s * 0.4, s * 0.5); ctx.lineTo(-s * 0.6, s * 1.0); ctx.lineTo(0, s * 0.55); ctx.fill(); break;
    case 'grid': for (const dx of [-1, 1]) for (const dy of [-1, 1]) { rrect(ctx, dx * s * 0.55 - s * 0.42, dy * s * 0.55 - s * 0.42, s * 0.84, s * 0.84, s * 0.2); ctx.fill(); } break;
    case 'dots': [[-0.75, 0.2], [0, -0.35], [0.75, 0.2]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx * s, dy * s, s * 0.32, 0, TAU); ctx.fill(); }); ctx.beginPath(); ctx.moveTo(-0.75 * s, 0.2 * s); ctx.lineTo(0, -0.35 * s); ctx.lineTo(0.75 * s, 0.2 * s); ctx.stroke(); break;
    case 'cal': rrect(ctx, -s, -s * 0.75, 2 * s, 1.6 * s, s * 0.22); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-s, -s * 0.25); ctx.lineTo(s, -s * 0.25); ctx.stroke(); ctx.beginPath(); ctx.arc(s * 0.3, s * 0.35, s * 0.18, 0, TAU); ctx.fill(); break;
    case 'ring': ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(0, 0, s * 0.85, -Math.PI / 2, -Math.PI / 2 + TAU * 0.86); ctx.stroke(); break;
  }
  ctx.restore();
}

// ---------------------------------------------------------------- wheel
const CARD_W = 900, CARD_H = 210, STEP = 250;
function card(ctx, c, cx, cy, w, h, color, focus) {
  const r = 32;
  if (focus > 0.02) {
    ctx.save(); ctx.shadowColor = rgba(color, 0.9 * focus); ctx.shadowBlur = 60 * focus;
    rrect(ctx, cx - w / 2, cy - h / 2, w, h, r); ctx.fillStyle = rgba(color, 0.18 * focus); ctx.fill();
    ctx.restore();
  }
  rrect(ctx, cx - w / 2, cy - h / 2, w, h, r);
  ctx.fillStyle = 'rgba(17,17,23,0.86)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = focus > 0.02 ? rgba(color, 0.35 + 0.65 * focus) : C.line; ctx.stroke();
  const sc = h / CARD_H;
  const ix = cx - w / 2 + 86 * sc, iy = cy;
  ctx.beginPath(); ctx.arc(ix, iy, 46 * sc, 0, TAU); ctx.fillStyle = rgba(color, 0.14 + 0.2 * focus); ctx.fill();
  icon(ctx, c.icon, ix, iy, 46 * sc, lerp(0.6, 1, focus) === 1 ? color : rgba(color, 0.6 + 0.4 * focus));
  const tx = cx - w / 2 + 168 * sc;
  text(ctx, c.name, tx, cy - 10 * sc, font(54 * sc, 700, DISPLAY), focus > 0.5 ? C.text : rgba(C.text, 0.72), 'left', -0.5);
  text(ctx, c.sub, tx, cy + 48 * sc, font(32 * sc, 500, UI), rgba(C.muted, 0.6 + 0.4 * focus), 'left');
}

function wheel(ctx, u) {
  const s = FORMAT.safe;
  const cy0 = s.y + s.h * 0.5;
  const pos = spinPos(u);
  ctx.save(); ctx.beginPath(); ctx.rect(0, s.y + 190, W, H - s.y - 190); ctx.clip();
  const lockT = u - LOCK;
  const settle = lockT > 0 ? 1 + 0.035 * wobble(lockT, 2.4, 5.5) : 1;
  // after the lock the non-centre cards fall away as the panel opens
  const open = springU(u, 16.3, SPRING.snappy);
  const wrap = (d) => ((d + N / 2) % N + N) % N - N / 2;   // the wheel is circular: Passung sits below Projekte
  const items = CARDS.map((c, i) => ({ c, i, p: wrap(i - pos) }))
    .filter((it) => Math.abs(it.p) < 3.6)
    .sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
  for (const { c, i, p } of items) {
    const ang = p * 0.4;
    const depth = Math.cos(ang);                  // 1 at centre
    const sc = lerp(0.72, 1, depth) * (i === TRAVEL ? settle : 1);
    const focus = clamp(1 - Math.abs(p) * 1.6);
    let y = cy0 + Math.sin(ang) * 640;
    let alpha = clamp(depth * 1.6 - 0.55);
    if (i !== TRAVEL) { y += Math.sign(p || 1) * open * 900; alpha *= 1 - open; }
    if (alpha <= 0.01) continue;
    ctx.save(); ctx.globalAlpha = alpha;
    // perspective: cards above/below squash vertically
    ctx.translate(W / 2, y); ctx.scale(sc, sc * lerp(0.6, 1, depth)); ctx.translate(-W / 2, -y);
    if (i !== TRAVEL || open < 0.02) card(ctx, c, W / 2, y, CARD_W, CARD_H, GRAD[i % 4], focus);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- panel (u 16.4 .. 27)
function check(ctx, x, y, r, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = rgba(color, 0.18); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 0.45, y + r * 0.02); ctx.lineTo(x - r * 0.12, y + r * 0.38); ctx.lineTo(x + r * 0.5, y - r * 0.38); ctx.stroke();
  ctx.restore();
}

const REASONS = ['Swift, Audio', '10 von 10 Std.', 'vor Ort, abends'];
function panel(ctx, u, IMG) {
  const s = FORMAT.safe;
  const open = springU(u, 16.3, SPRING.snappy);
  if (open <= 0.001) return;
  const close = E.inBack(prog(u, 26.0, 26.5), 1.1);
  const cy0 = s.y + s.h * 0.5;
  const PW = s.w, PH = 1000;
  const w = lerp(CARD_W, PW, open), h = lerp(CARD_H, PH, open);
  const cx = W / 2, cy = lerp(cy0, s.y + 170 + PH / 2, open);
  ctx.save();
  ctx.globalAlpha = 1 - close;
  ctx.translate(cx, cy); ctx.scale(1 - close * 0.6, 1 - close * 0.6); ctx.translate(-cx, -cy);
  const x = cx - w / 2, y = cy - h / 2;
  // glow + body
  ctx.save(); ctx.shadowColor = rgba(C.blue, 0.55); ctx.shadowBlur = 70;
  rrect(ctx, x, y, w, h, 36); ctx.fillStyle = 'rgba(17,17,23,0.92)'; ctx.fill(); ctx.restore();
  rrect(ctx, x, y, w, h, 36); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(91,140,255,0.5)'; ctx.stroke();
  rrect(ctx, x, y, w, h, 36); ctx.clip();
  const inner = clamp((open - 0.5) / 0.4);
  if (inner <= 0) { ctx.restore(); return; }
  ctx.globalAlpha *= inner;
  const px = x + 44;
  // header: ring icon + "Für dich" + live pill
  icon(ctx, 'ring', px + 26, y + 62, 26, C.cyan);
  text(ctx, 'Für dich', px + 70, y + 76, font(44, 700, DISPLAY), C.text, 'left', -0.5);
  const lp = springU(u, 16.6, SPRING.snappy);
  if (lp > 0) {
    const pw = 116, pxr = x + w - 44 - pw, py = y + 38;
    ctx.save(); ctx.globalAlpha *= clamp(lp);
    rrect(ctx, pxr, py, pw, 48, 24); ctx.fillStyle = C.panel2; ctx.fill();
    const pulse = 0.7 + 0.3 * Math.sin(u * TAU * 0.5);
    ctx.fillStyle = rgba(C.green, pulse); ctx.beginPath(); ctx.arc(pxr + 26, py + 24, 7, 0, TAU); ctx.fill();
    text(ctx, 'live', pxr + 44, py + 33, font(26, 600, UI), C.text, 'left');
    ctx.restore();
  }
  // prompt pill: types on from 17.5
  const typed = clamp((u - 16.7) / 1.5);
  const prompt = 'Jana sucht: Mobile-Entwicklung · 10 Std./Woche';
  const pk = springU(u, 16.6, SPRING.snappy);
  if (pk > 0) {
    const ph = 76, py = y + 120;
    ctx.save(); ctx.globalAlpha *= clamp(pk); ctx.translate(0, (1 - pk) * 30);
    rrect(ctx, px, py, w - 88, ph, 38); ctx.fillStyle = C.panel2; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
    const n = Math.floor(typed * prompt.length);
    const shown = prompt.slice(0, n);
    text(ctx, shown, px + 34, py + 49, font(31, 500, UI), C.text, 'left');
    if (typed < 1 && Math.floor(u * 4) % 2 === 0) {
      const wTxt = layout(ctx, shown, font(31, 500, UI)).width;
      ctx.fillStyle = C.cyan; ctx.fillRect(px + 38 + wTxt, py + 22, 3, 34);
    }
    ctx.restore();
  }
  // real cards
  const cardsY = y + 226;
  const ka = springU(u, 19, SPRING.snappy);
  if (ka > 0 && IMG.ana) {
    const aw = (w - 88) * 0.84, ah = aw * (IMG.ana.height / IMG.ana.width);
    const ax = cx - aw / 2, ay = cardsY + 40 + (1 - ka) * 120;
    ctx.save(); ctx.globalAlpha *= clamp(ka) * 0.55;
    rrect(ctx, ax, ay, aw, ah, 30); ctx.clip(); ctx.drawImage(IMG.ana, ax, ay, aw, ah); ctx.restore();
  }
  const kl = springU(u, 18.5, SPRING.bouncy);
  let lh = 0;
  if (kl > 0 && IMG.lukas) {
    const lw = w - 88; lh = lw * (IMG.lukas.height / IMG.lukas.width);
    const lx = px, ly = cardsY + (1 - kl) * 700;
    const q = 0.05 * wobble(u - 18.7, 2.4, 6);
    ctx.save();
    ctx.translate(cx, ly + lh); ctx.scale(1 + q, 1 - q); ctx.translate(-cx, -(ly + lh));
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    rrect(ctx, lx, ly, lw, lh, 30); ctx.fillStyle = C.panel; ctx.fill();
    ctx.shadowColor = 'transparent';
    rrect(ctx, lx, ly, lw, lh, 30); ctx.clip(); ctx.drawImage(IMG.lukas, lx, ly, lw, lh);
    ctx.restore();
    // ring pulse on the payoff
    const pulse = bumpAt(u, 24, 1.2);
    if (pulse > 0) {
      const rx = lx + lw * 0.866, ry = ly + lh * 0.24, rr = lh * 0.135;
      ctx.save(); ctx.globalAlpha *= pulse * 0.9; ctx.strokeStyle = C.cyan; ctx.lineWidth = 6 * (1 - pulse) + 2;
      ctx.beginPath(); ctx.arc(rx, ry, rr * (1 + (1 - pulse) * 0.9), 0, TAU); ctx.stroke(); ctx.restore();
    }
  }
  // reasons
  const ry0 = cardsY + lh + 34;
  REASONS.forEach((r, i) => {
    const k = springU(u, 20.5 + i, SPRING.snappy);
    if (k <= 0) return;
    const yy = ry0 + i * 84;
    ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate((1 - k) * -60, 0);
    rrect(ctx, px, yy, w - 88, 70, 22); ctx.fillStyle = rgba(C.green, 0.08); ctx.fill();
    check(ctx, px + 40, yy + 35, 20, C.green);
    text(ctx, r, px + 82, yy + 46, font(33, 600, UI), C.text, 'left');
    ctx.restore();
  });
  // payoff line
  const kd = springU(u, 24, SPRING.bouncy);
  if (kd > 0) {
    const f = font(66, 700, DISPLAY), track = -1.5;
    const a = 'Deshalb ', b = "passt's.";
    const La = layout(ctx, a, f, track), Lb = layout(ctx, b, f, track);
    const tx = cx - (La.width + Lb.width) / 2, ty = ry0 + 3 * 84 + 76;
    ctx.save(); ctx.globalAlpha *= clamp(kd);
    ctx.translate(cx, ty); ctx.scale(lerp(0.7, 1, kd), lerp(0.7, 1, kd)); ctx.translate(-cx, -ty);
    ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'left';
    ctx.fillStyle = C.text; ctx.fillText(a, tx, ty);
    ctx.fillStyle = grad(ctx, tx + La.width, 0, tx + La.width + Lb.width, 0); ctx.fillText(b, tx + La.width, ty);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }
  ctx.restore();
}
const bumpAt = (u, c, w) => { const x = (u - c) / w; return x < 0 || x >= 1 ? 0 : 1 - x; };

// ---------------------------------------------------------------- logo mark (from assets/logo/icon_0.svg)
function mark(ctx, x, y, size) {
  ctx.save(); ctx.translate(x - size / 2, y - size / 2); ctx.scale(size / 512, size / 512);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const gb = ctx.createLinearGradient(140, 140, 372, 372); gb.addColorStop(0, '#3A8AFF'); gb.addColorStop(1, '#3FE0F0');
  const ga = ctx.createLinearGradient(140, 372, 372, 140); ga.addColorStop(0, '#B36BFF'); ga.addColorStop(1, '#3A8AFF');
  ctx.lineWidth = 60; ctx.strokeStyle = gb; ctx.beginPath(); ctx.moveTo(140, 140); ctx.quadraticCurveTo(300, 212, 372, 372); ctx.stroke();
  ctx.lineWidth = 96; ctx.strokeStyle = C.bg; ctx.beginPath(); ctx.moveTo(140, 372); ctx.quadraticCurveTo(212, 212, 372, 140); ctx.stroke();
  ctx.lineWidth = 60; ctx.strokeStyle = ga; ctx.beginPath(); ctx.moveTo(140, 372); ctx.quadraticCurveTo(212, 212, 372, 140); ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- end card (u 27 ..)
function endCard(ctx, u) {
  const s = FORMAT.safe;
  const k = springU(u, 26.3, SPRING.bouncy);
  if (k <= 0) return;
  const cy = s.y + s.h * 0.42;
  // mark
  ctx.save(); ctx.translate(W / 2, cy - 200); ctx.scale(k, k); ctx.translate(-W / 2, -(cy - 200));
  ctx.shadowColor = rgba(C.blue, 0.6); ctx.shadowBlur = 50;
  mark(ctx, W / 2, cy - 200, 300);
  ctx.restore();
  // wordmark, glyphs rising from a clip
  const f = font(170, 700, DISPLAY), track = -6;
  const L = layout(ctx, 'xyntal', f, track);
  const x0 = W / 2 - L.width / 2, base = cy + 110;
  ctx.save(); ctx.beginPath(); ctx.rect(0, base - L.asc - 60, W, L.asc + L.desc + 70); ctx.clip();
  ctx.fillStyle = grad(ctx, x0, 0, x0 + L.width, 0);
  L.glyphs.forEach((g, j) => {
    const p = E.outBack(prog(u, 26.6 + j * 0.06, 27.1 + j * 0.06), 1.3);
    if (p <= 0) return;
    ctx.save(); ctx.translate(x0 + g.cx, base + (1 - p) * (L.asc + 60));
    ctx.font = f; ctx.textAlign = 'center'; ctx.letterSpacing = `${track}px`; ctx.fillText(g.ch, 0, 0); ctx.restore();
  });
  ctx.restore();
  const t1 = E.outQuint(prog(u, 27.3, 27.9));
  if (t1 > 0) {
    ctx.save(); ctx.globalAlpha = t1; ctx.translate(0, (1 - t1) * 30);
    // pill "Beta · Link in Bio"
    const f2 = font(44, 600, UI), label = 'Beta · Link in Bio';
    const lw = layout(ctx, label, f2).width + 90, ly = base + 90;
    rrect(ctx, W / 2 - lw / 2, ly, lw, 86, 43); ctx.fillStyle = C.panel2; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(91,140,255,0.6)'; ctx.stroke();
    text(ctx, label, W / 2, ly + 57, f2, C.text, 'center');
    ctx.restore();
  }
  const t2 = E.outQuint(prog(u, 27.8, 28.4));
  if (t2 > 0) {
    ctx.save(); ctx.globalAlpha = t2 * 0.8;
    text(ctx, 'Nur eine Demonstration · Beispieldaten', W / 2, base + 260, font(27, 500, UI), C.dim, 'center');
    ctx.restore();
  }
}

M.film({
  fonts: [font(100, 700, DISPLAY), font(40, 500, UI), font(40, 600, UI)],
  images: { lukas: 'assets/card_lukas.png', ana: 'assets/card_ana.png' },
  hits: HITS,
  draw(ctx, u, t, IMG) {
    background(ctx, u, t);
    if (u < 26.5) {
      wheel(ctx, u);
      panel(ctx, u, IMG);
    }
    header(ctx, u);
    endCard(ctx, u);
  },
});
