// Xyntal · POV Feature-Rad (Spot A, v2 "spannender"). Pure function of time: window.seek(t) paints frame t.
// Timing in beats (u) on beats.json (124 bpm, music drop on beat 16 = the lock). docs/shotlist.md is the plan.
import * as M from './lib/motion.js';

const { W, H, FORMAT, E, prog, lerp, clamp, springU, SPRING, wobble, font, layout, text, fill, rrect, hash01, noise1, zoomAbout, TAU } = M;

const C = {
  bg: '#07070B', panel: '#111117', panel2: '#161B22', card: '#13131B', line: 'rgba(255,255,255,0.08)',
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
const bumpAt = (u, c, w) => { const x = (u - c) / w; return x < 0 || x >= 1 ? 0 : 1 - x; };

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
const N = CARDS.length;
const LOCK = 16;                 // beat the wheel locks on "Passung" (= the music drop)
const TRAVEL = 15;               // ~two turns: fast, blurred start, long ratcheting deceleration
const SPIN_POW = 2.8;
const spinPos = (u) => (u >= LOCK ? TRAVEL : TRAVEL * (1 - (1 - clamp(u / LOCK)) ** SPIN_POW));
const crossBeat = (k) => LOCK * (1 - (1 - k / TRAVEL) ** (1 / SPIN_POW));
const q4 = (x) => Math.round(x * 4) / 4;

// timeline (beats)
const T = {
  open: 16.2, prompt: 16.6, lukas: 18, ana: 18.4, count0: 18.6, count1: 20.2,
  r: [20.5, 21, 21.5], payoff: 22.5, endIn: 25.8, end: 26,
};

const HITS = [
  [0, 'frame 0: wheel already spinning', 'whoosh', { len: 0.6, from: 400, to: 3000 }],
  ...Array.from({ length: TRAVEL - 1 }, (_, i) => i + 1).map((k) => [q4(crossBeat(k)), `wheel: ${CARDS[k % N].name}`, 'click']),
  [LOCK - 1, 'riser into the lock', 'riser', { len: 1.4 }],
  [LOCK, 'lock on Passung (drop)', 'impact'],
  [LOCK + 0.25, 'lock bell', 'bell', { pitch: 'A5' }],
  [T.open, 'panel opens', 'whoosh', { len: 0.4, from: 500, to: 2600 }],
  [T.prompt, 'prompt types', 'type', { n: 16, len: 0.7 }],
  [T.lukas, 'Lukas slams in', 'thud'],
  [T.ana, 'Ana behind', 'pop', { pitch: 'E5' }],
  [T.count0, 'ring counts', 'riser', { len: (T.count1 - T.count0) * 0.4837 }],
  [T.count1, '99 lands', 'bell', { pitch: 'E6' }],
  [T.count1 + 0.02, 'shockwave', 'sub', { len: 0.5 }],
  [T.r[0], 'reason 1', 'blip', { pitch: 'A5' }],
  [T.r[1], 'reason 2', 'blip', { pitch: 'C#6' }],
  [T.r[2], 'reason 3', 'blip', { pitch: 'E6' }],
  [T.payoff, "Deshalb passt's", 'impact'],
  [T.payoff + 0.25, 'chime 2', 'bell', { pitch: 'A6' }],
  [T.end, 'end card', 'impact'],
  [T.end + 0.5, 'logo bell', 'bell', { pitch: 'A5' }],
  [T.end + 1, 'wordmark lands', 'thud'],
];

// ---------------------------------------------------------------- background
function background(ctx, u, t, cam) {
  fill(ctx, C.bg);
  let g = ctx.createRadialGradient(0, -200, 0, 0, -200, 1100);
  g.addColorStop(0, 'rgba(185,92,255,0.2)'); g.addColorStop(1, 'rgba(185,92,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W + 100, H * 0.55, 0, W + 100, H * 0.55, 900);
  g.addColorStop(0, 'rgba(63,216,255,0.14)'); g.addColorStop(1, 'rgba(63,216,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // energy bloom in the centre that swells into the lock and on the payoff
  const e = 0.35 * bumpAt(u, LOCK, 2) + 0.25 * clamp((u - LOCK + 2) / 2) * (u < LOCK ? 1 : 0) + 0.3 * bumpAt(u, T.payoff, 1.5);
  if (e > 0) {
    g = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, 900);
    g.addColorStop(0, rgba(C.blue, e * 0.5)); g.addColorStop(0.5, rgba(C.violet, e * 0.18)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // stars with parallax against the camera, streaking while the wheel spins fast
  const speed = u < LOCK ? clamp(1 - u / LOCK) ** 2 : 0;
  for (let i = 0; i < 190; i++) {
    const x = hash01(i, 11) * W + (cam.x - W / 2) * 0.08 * hash01(i, 17);
    const y = hash01(i, 12) * H + (cam.y - H / 2) * 0.08 * hash01(i, 17);
    const r = 0.6 + hash01(i, 13) * 1.4;
    const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.8 + hash01(i, 14) * 1.5) + hash01(i, 15) * TAU));
    ctx.fillStyle = `rgba(245,245,247,${(0.18 + 0.5 * hash01(i, 16)) * tw})`;
    if (speed > 0.05) {
      ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = r * 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + speed * 90 * hash01(i, 18)); ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
  }
  const nodes = [];
  for (let i = 0; i < 22; i++) nodes.push([hash01(i, 21) * W + 90 * noise1(t * 0.05 + i * 3.1, 7), hash01(i, 22) * H + 90 * noise1(t * 0.05 + i * 5.3, 9)]);
  ctx.lineWidth = 1;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const dx = nodes[i][0] - nodes[j][0], dy = nodes[i][1] - nodes[j][1], d = Math.hypot(dx, dy);
    if (d > 330) continue;
    ctx.strokeStyle = rgba(GRAD[(i + j) % 4], 0.12 * (1 - d / 330));
    ctx.beginPath(); ctx.moveTo(nodes[i][0], nodes[i][1]); ctx.lineTo(nodes[j][0], nodes[j][1]); ctx.stroke();
  }
  for (const [i, [x, y]] of nodes.entries()) { ctx.fillStyle = rgba(GRAD[i % 4], 0.35); ctx.beginPath(); ctx.arc(x, y, 2.2, 0, TAU); ctx.fill(); }
}

// ---------------------------------------------------------------- pinned header: slams in word by word
function header(ctx, u) {
  const s = FORMAT.safe;
  const size = 64, f = font(size, 700, DISPLAY), track = -0.02 * size;
  const y0 = s.y + 70;
  const exit = E.inBack(prog(u, T.endIn, T.end), 1.2);
  ctx.save(); ctx.globalAlpha = Math.max(0, 1 - exit);
  ctx.translate(0, -exit * 300);
  const words1 = ['POV:', 'Du', 'hast', 'dich', 'für', 'die'];
  const L1 = layout(ctx, words1.join(' '), f, track);
  const x1 = W / 2 - L1.width / 2;
  ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'left';
  let xi = 0;
  words1.forEach((w, i) => {
    const k = springU(u, -0.2 + i * 0.12, SPRING.snappy);
    const wl = layout(ctx, w + ' ', f, track).width;
    if (k > 0) {
      ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate(x1 + xi + wl / 2, y0); ctx.scale(lerp(1.6, 1, k), lerp(1.6, 1, k)); ctx.translate(-(x1 + xi + wl / 2), -y0);
      ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.fillStyle = C.text; ctx.fillText(w, x1 + xi, y0); ctx.restore();
    }
    xi += wl;
  });
  const a = 'Xyntal-Beta', b = ' beworben';
  const La = layout(ctx, a, f, track), Lb = layout(ctx, b, f, track);
  const x = W / 2 - (La.width + Lb.width) / 2, y = y0 + size * 1.12;
  const ka = springU(u, 0.55, SPRING.bouncy), kb = springU(u, 0.75, SPRING.snappy);
  if (ka > 0) {
    ctx.save(); ctx.globalAlpha *= clamp(ka); ctx.translate(x + La.width / 2, y); ctx.scale(lerp(1.8, 1, ka), lerp(1.8, 1, ka)); ctx.translate(-(x + La.width / 2), -y);
    ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.fillStyle = grad(ctx, x, 0, x + La.width, 0); ctx.fillText(a, x, y); ctx.restore();
  }
  if (kb > 0) {
    ctx.save(); ctx.globalAlpha *= clamp(kb); ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.fillStyle = C.text; ctx.fillText(b, x + La.width + (1 - kb) * 40, y); ctx.restore();
  }
  ctx.letterSpacing = '0px';
  ctx.restore();
}

// ---------------------------------------------------------------- vector icons
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
const CARD_W = 900, CARD_H = 210;
function card(ctx, c, cx, cy, w, h, color, focus) {
  const r = 32;
  if (focus > 0.02) {
    ctx.save(); ctx.shadowColor = rgba(color, 0.95 * focus); ctx.shadowBlur = 70 * focus;
    rrect(ctx, cx - w / 2, cy - h / 2, w, h, r); ctx.fillStyle = rgba(color, 0.2 * focus); ctx.fill();
    ctx.restore();
  }
  rrect(ctx, cx - w / 2, cy - h / 2, w, h, r);
  ctx.fillStyle = 'rgba(17,17,23,0.86)'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = focus > 0.02 ? rgba(color, 0.35 + 0.65 * focus) : C.line; ctx.stroke();
  const sc = h / CARD_H;
  const ix = cx - w / 2 + 86 * sc, iy = cy;
  ctx.beginPath(); ctx.arc(ix, iy, 46 * sc, 0, TAU); ctx.fillStyle = rgba(color, 0.14 + 0.2 * focus); ctx.fill();
  icon(ctx, c.icon, ix, iy, 46 * sc, rgba(color, 0.6 + 0.4 * focus));
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
  const settle = lockT > 0 ? 1 + 0.06 * wobble(lockT, 2.6, 5) : 1;
  const open = springU(u, T.open, SPRING.snappy);
  const wrap = (d) => ((d + N / 2) % N + N) % N - N / 2;
  const items = CARDS.map((c, i) => ({ c, i, p: wrap(i - pos) })).filter((it) => Math.abs(it.p) < 3.6).sort((a, b) => Math.abs(b.p) - Math.abs(a.p));
  const spd = u < LOCK ? clamp(1 - u / LOCK) ** 1.5 : 0;   // fast at the start: cards stretch along the motion
  for (const { c, i, p } of items) {
    const ang = p * 0.4;
    const depth = Math.cos(ang);
    const isLock = i === TRAVEL % N;
    const sc = lerp(0.72, 1, depth) * (isLock ? settle : 1);
    const focus = clamp(1 - Math.abs(p) * 1.6) * (u < LOCK - 0.5 ? 1 : isLock ? 1 : 0.4);
    let y = cy0 + Math.sin(ang) * 640;
    let alpha = clamp(depth * 1.6 - 0.55);
    if (!isLock) { y += Math.sign(p || 1) * open * 1000; alpha *= 1 - open; }
    if (alpha <= 0.01) continue;
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.translate(W / 2, y); ctx.scale(sc, sc * lerp(0.6, 1, depth) * (1 + spd * 0.25)); ctx.translate(-W / 2, -y);
    if (!isLock || open < 0.02) card(ctx, c, W / 2, y, CARD_W, CARD_H, GRAD[i % 4], focus);
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- panel
function check(ctx, x, y, r, color) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = r * 0.28; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = rgba(color, 0.18); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 0.45, y + r * 0.02); ctx.lineTo(x - r * 0.12, y + r * 0.38); ctx.lineTo(x + r * 0.5, y - r * 0.38); ctx.stroke();
  ctx.restore();
}
// ring on the real card: cover the static 99 and count it up live
function liveRing(ctx, u, lx, ly, lw, lh) {
  const k = lw / 978;
  const rx = lx + 846 * k, ry = ly + 118 * k, rr = 60 * k;
  const p = E.outExpo(prog(u, T.count0, T.count1));
  const val = Math.round(99 * p);
  ctx.save();
  ctx.fillStyle = 'rgb(19,19,27)'; ctx.beginPath(); ctx.arc(rx, ry, rr + 14 * k, 0, TAU); ctx.fill();
  ctx.lineWidth = 9 * k; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, TAU); ctx.stroke();
  const g = ctx.createConicGradient ? ctx.createConicGradient(-Math.PI / 2, rx, ry) : null;
  if (g) { g.addColorStop(0, C.violet); g.addColorStop(0.5, C.pink); g.addColorStop(1, C.cyan); ctx.strokeStyle = g; } else ctx.strokeStyle = C.pink;
  if (p > 0) { ctx.beginPath(); ctx.arc(rx, ry, rr, -Math.PI / 2, -Math.PI / 2 + TAU * 0.99 * p); ctx.stroke(); }
  const punch = 1 + 0.25 * bumpAt(u, T.count1, 0.6);
  text(ctx, String(val), rx, ry + 17 * k * punch, font(44 * k * punch, 700, DISPLAY), C.text, 'center', -1);
  // shockwave at 99
  for (let i = 0; i < 2; i++) {
    const w = bumpAt(u, T.count1 + i * 0.3, 1.6);
    if (w <= 0) continue;
    ctx.globalAlpha = w * 0.9; ctx.strokeStyle = C.cyan; ctx.lineWidth = 10 * (w) + 1;
    ctx.beginPath(); ctx.arc(rx, ry, rr + (1 - w) * 420, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

const REASONS = ['Swift, Audio', '10 von 10 Std.', 'vor Ort, abends'];
function panel(ctx, u, IMG) {
  const s = FORMAT.safe;
  const open = springU(u, T.open, SPRING.snappy);
  if (open <= 0.001) return;
  const close = E.inBack(prog(u, T.endIn, T.end), 1.1);
  const cy0 = s.y + s.h * 0.5;
  const PW = s.w, PH = 1000;
  const w = lerp(CARD_W, PW, open), h = lerp(CARD_H, PH, open);
  const cx = W / 2, cy = lerp(cy0, s.y + 170 + PH / 2, open);
  ctx.save();
  ctx.globalAlpha = 1 - close;
  ctx.translate(cx, cy); ctx.scale(1 - close * 0.7, 1 - close * 0.7); ctx.translate(-cx, -cy);
  const x = cx - w / 2, y = cy - h / 2;
  const glow = 0.55 + 0.45 * bumpAt(u, T.count1, 1) + 0.45 * bumpAt(u, T.payoff, 1);
  ctx.save(); ctx.shadowColor = rgba(C.blue, glow); ctx.shadowBlur = 70 + 40 * glow;
  rrect(ctx, x, y, w, h, 36); ctx.fillStyle = 'rgba(17,17,23,0.92)'; ctx.fill(); ctx.restore();
  rrect(ctx, x, y, w, h, 36); ctx.lineWidth = 2; ctx.strokeStyle = rgba(C.blue, 0.5 + 0.5 * (glow - 0.55)); ctx.stroke();
  rrect(ctx, x, y, w, h, 36); ctx.clip();
  const inner = clamp((open - 0.5) / 0.4);
  if (inner <= 0) { ctx.restore(); return; }
  ctx.globalAlpha *= inner;
  const px = x + 44;
  icon(ctx, 'ring', px + 26, y + 62, 26, C.cyan);
  text(ctx, 'Für dich', px + 70, y + 76, font(44, 700, DISPLAY), C.text, 'left', -0.5);
  const lp = springU(u, T.open + 0.3, SPRING.snappy);
  if (lp > 0) {
    const pw = 116, pxr = x + w - 44 - pw, py = y + 38;
    ctx.save(); ctx.globalAlpha *= clamp(lp);
    rrect(ctx, pxr, py, pw, 48, 24); ctx.fillStyle = C.panel2; ctx.fill();
    ctx.fillStyle = rgba(C.green, 0.7 + 0.3 * Math.sin(u * TAU * 0.5)); ctx.beginPath(); ctx.arc(pxr + 26, py + 24, 7, 0, TAU); ctx.fill();
    text(ctx, 'live', pxr + 44, py + 33, font(26, 600, UI), C.text, 'left');
    ctx.restore();
  }
  const prompt = 'Jana sucht: Mobile-Entwicklung · 10 Std./Woche';
  const typed = clamp((u - T.prompt) / 1.3);
  const pk = springU(u, T.prompt - 0.1, SPRING.snappy);
  if (pk > 0) {
    const ph = 76, py = y + 120;
    ctx.save(); ctx.globalAlpha *= clamp(pk); ctx.translate(0, (1 - pk) * 30);
    rrect(ctx, px, py, w - 88, ph, 38); ctx.fillStyle = C.panel2; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
    const shown = prompt.slice(0, Math.floor(typed * prompt.length));
    text(ctx, shown, px + 34, py + 49, font(31, 500, UI), C.text, 'left');
    if (typed < 1 && Math.floor(u * 4) % 2 === 0) { const wTxt = layout(ctx, shown, font(31, 500, UI)).width; ctx.fillStyle = C.cyan; ctx.fillRect(px + 38 + wTxt, py + 22, 3, 34); }
    ctx.restore();
  }
  const cardsY = y + 226;
  const ka = springU(u, T.ana, SPRING.snappy);
  if (ka > 0 && IMG.ana) {
    const aw = (w - 88) * 0.84, ah = aw * (IMG.ana.height / IMG.ana.width);
    const ax = cx - aw / 2, ay = cardsY + 40 + (1 - ka) * 120;
    ctx.save(); ctx.globalAlpha *= clamp(ka) * 0.55; rrect(ctx, ax, ay, aw, ah, 30); ctx.clip(); ctx.drawImage(IMG.ana, ax, ay, aw, ah); ctx.restore();
  }
  const kl = springU(u, T.lukas, SPRING.bouncy);
  let lh = 0;
  if (kl > 0 && IMG.lukas) {
    const lw = w - 88; lh = lw * (IMG.lukas.height / IMG.lukas.width);
    const lx = px, ly = cardsY + (1 - kl) * 900;
    const q = 0.07 * wobble(u - T.lukas - 0.2, 2.4, 6);
    ctx.save();
    ctx.translate(cx, ly + lh); ctx.scale(1 + q, 1 - q); ctx.translate(-cx, -(ly + lh));
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    rrect(ctx, lx, ly, lw, lh, 30); ctx.fillStyle = C.panel; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save(); rrect(ctx, lx, ly, lw, lh, 30); ctx.clip(); ctx.drawImage(IMG.lukas, lx, ly, lw, lh); ctx.restore();
    liveRing(ctx, u, lx, ly, lw, lh);
    ctx.restore();
  }
  const ry0 = cardsY + lh + 34;
  REASONS.forEach((r, i) => {
    const k = springU(u, T.r[i], SPRING.bouncy);
    if (k <= 0) return;
    const yy = ry0 + i * 84;
    ctx.save(); ctx.globalAlpha *= clamp(k); ctx.translate((1 - k) * -160, 0);
    rrect(ctx, px, yy, w - 88, 70, 22); ctx.fillStyle = rgba(C.green, 0.08 + 0.2 * bumpAt(u, T.r[i], 0.6)); ctx.fill();
    check(ctx, px + 40, yy + 35, 20, C.green);
    text(ctx, r, px + 82, yy + 46, font(33, 600, UI), C.text, 'left');
    ctx.restore();
  });
  const kd = springU(u, T.payoff, SPRING.bouncy);
  if (kd > 0) {
    const f = font(70, 700, DISPLAY), track = -1.5;
    const a = 'Deshalb ', b = "passt's.";
    const La = layout(ctx, a, f, track), Lb = layout(ctx, b, f, track);
    const tx = cx - (La.width + Lb.width) / 2, ty = ry0 + 3 * 84 + 78;
    ctx.save(); ctx.globalAlpha *= clamp(kd);
    ctx.translate(cx, ty); ctx.scale(lerp(2.2, 1, kd), lerp(2.2, 1, kd)); ctx.translate(-cx, -ty);
    ctx.font = f; ctx.letterSpacing = `${track}px`; ctx.textAlign = 'left';
    ctx.fillStyle = C.text; ctx.fillText(a, tx, ty);
    ctx.fillStyle = grad(ctx, tx + La.width, 0, tx + La.width + Lb.width, 0); ctx.fillText(b, tx + La.width, ty);
    ctx.letterSpacing = '0px';
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- logo mark
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

// ---------------------------------------------------------------- end card
function endCard(ctx, u) {
  const s = FORMAT.safe;
  const k = springU(u, T.end - 0.1, SPRING.bouncy);
  if (k <= 0) return;
  const cy = s.y + s.h * 0.42;
  // shockwave rings behind the mark
  for (let i = 0; i < 2; i++) {
    const w = bumpAt(u, T.end + i * 0.25, 1.8);
    if (w <= 0) continue;
    ctx.save(); ctx.globalAlpha = w * 0.7; ctx.strokeStyle = i ? C.violet : C.cyan; ctx.lineWidth = 8 * w + 1;
    ctx.beginPath(); ctx.arc(W / 2, cy - 200, 120 + (1 - w) * 700, 0, TAU); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.translate(W / 2, cy - 200); ctx.scale(lerp(2.5, 1, k), lerp(2.5, 1, k)); ctx.translate(-W / 2, -(cy - 200));
  ctx.shadowColor = rgba(C.blue, 0.7); ctx.shadowBlur = 60;
  mark(ctx, W / 2, cy - 200, 300);
  ctx.restore();
  const f = font(170, 700, DISPLAY), track = -6;
  const L = layout(ctx, 'xyntal', f, track);
  const x0 = W / 2 - L.width / 2, base = cy + 110;
  L.glyphs.forEach((g, j) => {
    const p = springU(u, T.end + 0.45 + j * 0.09, SPRING.bouncy);
    if (p <= 0) return;
    ctx.save(); ctx.globalAlpha = clamp(p); ctx.translate(x0 + g.cx, base); ctx.scale(lerp(3, 1, p), lerp(3, 1, p));
    ctx.fillStyle = grad(ctx, -g.cx, 0, L.width - g.cx, 0);
    ctx.font = f; ctx.textAlign = 'center'; ctx.letterSpacing = `${track}px`; ctx.fillText(g.ch, 0, 0); ctx.restore();
  });
  const t1 = springU(u, T.end + 1.2, SPRING.snappy);
  if (t1 > 0) {
    ctx.save(); ctx.globalAlpha = clamp(t1); ctx.translate(0, (1 - t1) * 40);
    const f2 = font(44, 600, UI), label = 'Beta · Link in Bio';
    const lw = layout(ctx, label, f2).width + 90, ly = base + 90;
    rrect(ctx, W / 2 - lw / 2, ly, lw, 86, 43); ctx.fillStyle = C.panel2; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(91,140,255,0.6)'; ctx.stroke();
    text(ctx, label, W / 2, ly + 57, f2, C.text, 'center');
    ctx.restore();
  }
  const t2 = E.outQuint(prog(u, T.end + 1.6, T.end + 2.2));
  if (t2 > 0) { ctx.save(); ctx.globalAlpha = t2 * 0.8; text(ctx, 'Nur eine Demonstration · Beispieldaten', W / 2, base + 260, font(27, 500, UI), C.dim, 'center'); ctx.restore(); }
}

// ---------------------------------------------------------------- camera: slow push, punches on hits, shake on impacts
function camera(u) {
  const s = FORMAT.safe;
  let z = 1.0 + 0.06 * clamp(u / LOCK);                          // creeping push-in through the spin
  z += 0.10 * bumpAt(u, LOCK, 0.6) ** 2;                          // punch on the lock
  z += 0.06 * bumpAt(u, T.lukas, 0.5) + 0.05 * bumpAt(u, T.count1, 0.5) + 0.07 * bumpAt(u, T.payoff, 0.6);
  z *= 1 - 0.06 * springU(u, T.open, SPRING.gentle);              // settle back out when the panel opens
  z += 0.08 * bumpAt(u, T.end, 0.5) ** 2;
  let x = W / 2, y = s.y + s.h * 0.5;
  const shakes = [[LOCK, 22], [T.lukas, 12], [T.count1, 10], [T.payoff, 12], [T.end, 16]];
  for (const [u0, amp] of shakes) {
    const d = u - u0;
    if (d < 0 || d > 0.6) continue;
    const env = (1 - d / 0.6) ** 2;
    x += amp * env * noise1(d * 40, 3); y += amp * env * noise1(d * 40, 5);
  }
  return { z, x, y };
}

M.film({
  fonts: [font(100, 700, DISPLAY), font(40, 500, UI), font(40, 600, UI)],
  images: { lukas: 'assets/card_lukas.png', ana: 'assets/card_ana.png' },
  hits: HITS,
  draw(ctx, u, t, IMG) {
    const cam = camera(u);
    background(ctx, u, t, cam);
    ctx.save();
    zoomAbout(ctx, cam.z, cam.x, cam.y);
    ctx.translate(cam.x - W / 2, cam.y - (FORMAT.safe.y + FORMAT.safe.h * 0.5));
    if (u < T.end) { wheel(ctx, u); panel(ctx, u, IMG); }
    header(ctx, u);
    endCard(ctx, u);
    ctx.restore();
  },
  // flashes must not be averaged away by the motion-blur samples
  post(ctx, u) {
    const f = 0.4 * bumpAt(u, LOCK, 0.35) ** 1.5 + 0.3 * bumpAt(u, T.end, 0.3) ** 1.5 + 0.2 * bumpAt(u, T.count1, 0.25);
    if (f > 0.01) { ctx.fillStyle = `rgba(230,235,255,${f})`; ctx.fillRect(0, 0, W, H); }
  },
});
