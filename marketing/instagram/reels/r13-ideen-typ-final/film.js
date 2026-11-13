// R13 · Der Ideen-Typ, finale Fassung. Regeln: ../REGELN.md
// Neu gegenüber r12: kinetischer Hook (immer nur ein Satz im Bild), die Karte löst sich als 3D-Objekt
// aus der App vor unscharfem Hintergrund, und ein echter Klick auf „Ich wäre dabei“.
import * as M from '../_shared/motion.js';
import T from './timing.js';

const { W, H, E, clamp, lerp, kf } = M;
const K = T.cards, WD = T.words;
const wt = (l, i) => WD[l][i][1];
const C = { bg: '#1F1F21', ui: '#0C0C0D', t1: '#ECEAE4', t2: '#B9B7B0', t3: '#918F89' };
const IN = E.bezier(0.16, 1, 0.3, 1);
const IO = E.bezier(0.65, 0, 0.35, 1);
const F = 1 / 30;

function font(ctx, size, weight, family, stretch = 'normal', spacing = 0) {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`; ctx.fontStretch = stretch; ctx.letterSpacing = `${spacing}px`;
}
const STYLE = { fat: (s) => [s, 800, 'Archivo', 'extra-condensed'], thin: (s) => [s, 200, 'Archivo', 'expanded'], ui: (s) => [s, 500, 'Plex', 'normal'] };

function line(ctx, u, tokens, { x = W / 2, y, style = 'fat', size = 160, align = 'center', color = C.t1, spacing = 0 }) {
  const [s, w, fam, st] = STYLE[style](size);
  font(ctx, s, w, fam, st, spacing);
  const space = ctx.measureText(' ').width;
  const widths = tokens.map(([t]) => ctx.measureText(t).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (tokens.length - 1);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  tokens.forEach(([txt, at], i) => {
    const p = clamp((u - at) / (10 * F));
    if (p > 0) {
      ctx.save(); ctx.globalAlpha *= clamp((u - at) / (6 * F)); ctx.fillStyle = color;
      ctx.fillText(txt, cx, y + (1 - IN(p)) * s * 0.3); ctx.restore();
    }
    cx += widths[i] + space;
  });
}
const toks = (l, from, words) => words.map((w, i) => [w, wt(l, from + i) - 0.06]);

// Partikel-X der Startseite als Grund
const PTS = (() => { const r = M.mulberry32(7), o = []; for (let i = 0; i < 1400; i++) { const g = (r() + r() + r() - 1.5) * 2; o.push({ arm: i % 2, s: r(), n: g * 18, sz: 2 + r() * 3, ph: r() * 6.28, sp: 0.004 + r() * 0.01 }); } return o; })();
const quad = (a, b, c, t) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;
function ground(ctx, t, energy = 1) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const sc = 5.2, ox = W / 2 - 256 * sc + 40 * Math.sin(t * 0.15), oy = H * 0.46 - 256 * sc;
  const cols = [[179, 107, 255], [58, 138, 255], [63, 224, 240]];
  for (const p of PTS) {
    const s = (p.s + t * p.sp) % 1;
    const x = p.arm ? quad(140, 300, 372, s) : quad(140, 212, 372, s), y = p.arm ? quad(140, 212, 372, s) : quad(372, 212, 140, s);
    const px = ox + (x + (p.arm ? -0.7 : 0.7) * p.n) * sc, py = oy + (y + 0.7 * p.n) * sc;
    if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
    const c = s < 0.5 ? cols[0].map((v, k) => lerp(v, cols[1][k], s * 2)) : cols[1].map((v, k) => lerp(v, cols[2][k], s * 2 - 1));
    ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${(0.34 + 0.22 * Math.sin(p.ph + t * 1.3)) * energy})`;
    ctx.fillRect(px, py, p.sz, p.sz);
  }
}

// App im Vollbild; filter für unscharfen Hintergrund
function shot(ctx, img, [cx, cy, vw], filter = 'none', dy = 0) {
  ctx.fillStyle = C.ui; ctx.fillRect(0, 0, W, H);
  if (!img) return;
  const s = W / vw;
  ctx.save(); ctx.filter = filter;
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-cx, -cy + dy);
  ctx.drawImage(img, 0, 0); ctx.restore();
}
function scrim(ctx, top) {
  const g = top ? ctx.createLinearGradient(0, 760, 0, 0) : ctx.createLinearGradient(0, 880, 0, H);
  g.addColorStop(0, 'rgba(12,12,13,0)'); g.addColorStop(0.45, 'rgba(12,12,13,0.92)'); g.addColorStop(1, 'rgba(12,12,13,0.97)');
  ctx.fillStyle = g; if (top) ctx.fillRect(0, 0, W, 760); else ctx.fillRect(0, 880, W, H - 880);
}
function cam(u, at, keys) {
  const c = kf(u, keys, E.inOutCubic);
  const arrive = 1 - 0.1 * (1 - IN(clamp((u - at) / (14 * F)))), drift = 1 - 0.018 * (u - at);
  return [c[0], c[1], c[2] * arrive * drift];
}

// Ausschnitt eines Bildes als Fläche im Raum, um die senkrechte Achse gedreht (rotY), in Streifen gezeichnet.
function persp(ctx, img, [sx, sy, sw, sh], cx, cy, scale, rotY) {
  const N = 64, f = 2200, w = sw * scale, h = sh * scale;
  const P = (u) => { const x = (u - 0.5) * w, z = x * Math.sin(rotY); const k = f / (f + z); return [cx + x * Math.cos(rotY) * k, k]; };
  // Schatten unter der Karte
  const [xl] = P(0), [xr] = P(1);
  const g = ctx.createRadialGradient((xl + xr) / 2, cy + h * 0.52, 10, (xl + xr) / 2, cy + h * 0.52, (xr - xl) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(xl - 300, cy, xr - xl + 600, h);
  for (let i = 0; i < N; i++) {
    const [xa, ka] = P(i / N), [xb, kb] = P((i + 1) / N), k = (ka + kb) / 2;
    const hh = h * k;
    ctx.drawImage(img, sx + (sw * i) / N, sy, sw / N + 0.5, sh, xa, cy - hh / 2, xb - xa + 0.8, hh);
    // ferne Seite etwas dunkler
    const shade = clamp((1 - k) * 2.2);
    if (shade > 0) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(xa, cy - hh / 2, xb - xa + 0.8, hh); }
  }
  // Unterkante weich ausblenden (die Karte ist im Screenshot unten beschnitten)
  const [x0, k0] = P(0), [x1, k1] = P(1), hb = h * Math.max(k0, k1);
  const fg = ctx.createLinearGradient(0, cy + hb / 2 - 160 * scale, 0, cy + hb / 2);
  fg.addColorStop(0, 'rgba(12,12,13,0)'); fg.addColorStop(1, 'rgba(12,12,13,1)');
  ctx.fillStyle = fg; ctx.fillRect(x0 - 2, cy + hb / 2 - 160 * scale, x1 - x0 + 4, 160 * scale + 2);
  return { xl: x0, xr: x1, top: cy - (h * Math.max(k0, k1)) / 2 };
}

function cursor(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 74); ctx.lineTo(18, 57); ctx.lineTo(31, 86); ctx.lineTo(44, 80); ctx.lineTo(31, 52); ctx.lineTo(55, 52); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.shadowColor = 'transparent';
  ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.stroke();
  ctx.restore();
}

const SC = [];
const at = (u0, fn) => SC.push([u0, fn]);
const drift = (ctx, u, a, amt = 0.012) => { const z = 1 + amt * (u - a); ctx.translate(W / 2, H * 0.45); ctx.scale(z, z); ctx.translate(-W / 2, -H * 0.45); };

// 1 · Hook: immer nur ein Satz, harte Schnitte im Sprechrhythmus
at(0, (ctx, u, t) => { ground(ctx, t, 1.1); ctx.save(); drift(ctx, u, 0);
  line(ctx, u, [['Wir', -1], ['machen', wt(0, 1) - 0.06]], { y: 820, size: 200 });
  line(ctx, u, [['50/50.', wt(0, 2) - 0.06]], { y: 1090, size: 300 }); ctx.restore(); });
at(wt(0, 3) - 0.1, (ctx, u, t) => { const a = wt(0, 3) - 0.1; ground(ctx, t, 1.1); ctx.save(); drift(ctx, u, a);
  line(ctx, u, toks(0, 3, ['Ich', 'hab', 'ja']), { y: 820, size: 190 });
  line(ctx, u, toks(0, 5, ['die', 'Idee.']), { y: 1010, size: 190 }); ctx.restore(); });
at(K[1] - 0.08, (ctx, u, t) => { const a = K[1] - 0.08; ground(ctx, t, 1.1); ctx.save(); drift(ctx, u, a);
  line(ctx, u, toks(1, 0, ['Und', 'wer', 'baut']), { y: 830, style: 'thin', size: 130 });
  line(ctx, u, toks(1, 3, ['die', 'App?']), { y: 980, style: 'thin', size: 130 }); ctx.restore(); });
at(K[2] - 0.08, (ctx, u, t) => { const a = K[2] - 0.08; ground(ctx, t, 1.1); ctx.save(); drift(ctx, u, a, 0.02);
  line(ctx, u, [['Du.', wt(2, 0) - 0.06]], { y: 1080, size: 620 });
  line(ctx, u, toks(2, 1, ['Ist', 'ja', 'nur', 'ein', 'Wochenende.']), { y: 1250, size: 84, color: C.t2 }); ctx.restore(); });
// 2 · Zuspitzung
at(K[3] - 0.08, (ctx, u, t) => { const a = K[3] - 0.08; ground(ctx, t, 1); ctx.save(); drift(ctx, u, a);
  line(ctx, u, toks(3, 0, ['So', 'verlierst', 'du']), { y: 830, size: 170 });
  line(ctx, u, [['Monate.', wt(3, 3) - 0.06]], { y: 1060, style: 'thin', size: 190, spacing: 2 + 14 * IN(clamp((u - wt(3, 3)) / 2.4)) }); ctx.restore(); });
at(K[4] - 0.08, (ctx, u, t) => { const a = K[4] - 0.08; ground(ctx, t, 1.3); ctx.save(); drift(ctx, u, a);
  line(ctx, u, toks(4, 0, ['Es', 'geht', 'viel']), { y: 830, size: 190 });
  line(ctx, u, [['einfacher.', wt(4, 3) - 0.06]], { y: 1040, style: 'thin', size: 170 }); ctx.restore(); });
// 3 · Entdecken
at(K[5] - 0.08, (ctx, u, t, I) => { const a = K[5] - 0.08;
  shot(ctx, I.entdecken, cam(u, a, [[a, [930, 779, 860]], [wt(5, 4), [930, 779, 860]], [wt(5, 9), [1420, 779, 860]]]));
  scrim(ctx, false);
  if (u < wt(5, 4) - 0.1) line(ctx, u, toks(5, 0, ['Sag,', 'was', 'du', 'baust.']), { y: 1400, size: 150, align: 'left', x: 72 });
  else line(ctx, u, toks(5, 8, ['Wer', 'passt.']), { y: 1430, size: 200, align: 'left', x: 72 }); });
// 4 · Die Karte löst sich als Objekt aus der App, dann fährt die Kamera an die Passung
at(K[6] - 0.08, (ctx, u, t, I) => { const a = K[6] - 0.08;
  shot(ctx, I.entdecken, [1000 + 30 * (u - a), 820, 1250], 'blur(16px) brightness(0.42)');
  const rev = IN(clamp((u - a) / 1.4));
  const push = IO(clamp((u - (wt(6, 1) - 0.2)) / 1.6));
  const why = IO(clamp((u - (wt(6, 4) - 0.2)) / 1.4));
  const S = lerp(1.25, 3.3, push) * lerp(0.88, 1, rev);
  const rot = lerp(lerp(-0.62, -0.2, rev), -0.03, push);
  const relY = lerp(lerp(0, -107, push), 58, why);           // Pille (−107) oder Begründung (+58) relativ zur Kartenmitte
  const cy = lerp(lerp(1080, 900, rev), 900, push) - relY * S;
  const cx = W / 2 + lerp(80 * (1 - rev), 0, push);
  ctx.save(); ctx.globalAlpha = clamp((u - a) / (6 * F));
  const box = persp(ctx, I.entdecken, [468, 596, 468, 962], cx, cy, S, rot);
  // Lichtkante, die einmal über die Karte läuft
  const sweep = clamp((u - a - 0.3) / 1.6);
  if (sweep > 0 && sweep < 1) {
    const x = lerp(box.xl - 300, box.xr + 300, IO(sweep));
    const g = ctx.createLinearGradient(x - 160, 0, x + 160, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(box.xl, 0, box.xr - box.xl, H);
  }
  ctx.restore(); });
// 5 · Zeit und was jemand sucht
at(K[7] - 0.08, (ctx, u, t, I) => { const a = K[7] - 0.08;
  shot(ctx, I.entdecken, cam(u, a, [[a, [1095, 1262, 420]], [wt(7, 5) - 0.2, [1100, 1270, 420]], [wt(7, 8) + 0.4, [1235, 1400, 470]]])); });
// 6 · Ein Klick: Cursor fährt hin, drückt, die echte Oberfläche antwortet
at(K[8] - 0.08, (ctx, u, t, I) => { const a = K[8] - 0.08;
  const press = wt(8, 2) - 0.05, arrive = press - 0.55;
  const nudge = 1 - 0.035 * IN(clamp((u - press) / 0.6));
  const c = cam(u, a, [[a, [690, 674, 540]]]);
  const img = u < arrive - 0.15 ? I.klick0 : u < press + 3 * F ? I.klick1 : I.klick2;
  const dy = img === I.klick1 ? 4 : 0;           // gemessener Versatz: Hover liegt 4 px höher
  shot(ctx, img, [c[0], c[1], c[2] * nudge], 'none', dy);
  // Knopfmitte im Bild: (616, 819)
  const s = W / (c[2] * nudge);
  const bx = W / 2 + (616 - c[0]) * s, by = H / 2 + (819 - c[1]) * s;
  const mv = IN(clamp((u - (arrive - 1.1)) / 1.1));
  const cx0 = lerp(W + 120, bx + 70, mv), cy0 = lerp(H + 80, by + 18, mv) + Math.sin(mv * Math.PI) * -120;
  const ps = 1 - 0.14 * Math.sin(Math.PI * clamp((u - press) / (8 * F)));
  scrim(ctx, true);
  if (u < wt(8, 1) - 0.1) line(ctx, u, [['Passt?', wt(8, 0) - 0.06]], { y: 470, size: 240, align: 'left', x: 72 });
  else line(ctx, u, toks(8, 1, ['Ein', 'Klick.']), { y: 470, size: 240, align: 'left', x: 72 });
  cursor(ctx, cx0, cy0, 1.25 * ps); });
// 7 · Leute finden dich
at(K[9] - 0.08, (ctx, u, t, I) => { const a = K[9] - 0.08;
  shot(ctx, I.frmich, cam(u, a, [[a, [1000, 1180, 660]], [K[10], [1150, 1195, 660]]]));
  scrim(ctx, true);
  line(ctx, u, [['Leute,', wt(9, 1) - 0.06], ['die', wt(9, 2) - 0.06], ['passen,', wt(9, 3) - 0.06]], { y: 360, style: 'thin', size: 80, x: 84, align: 'left', color: C.t2 });
  line(ctx, u, toks(9, 4, ['finden', 'auch', 'dich.']), { y: 540, size: 170, align: 'left', x: 72 }); });
// 8 · Dann direkt los
at(K[10] - 0.08, (ctx, u, t) => { const a = K[10] - 0.08; ground(ctx, t, 1.1); ctx.save(); drift(ctx, u, a);
  line(ctx, u, toks(10, 0, ['Dann', 'direkt', 'los.']), { y: 960, size: 210 }); ctx.restore(); });
const big = (ctx, u, word, w0) => { scrim(ctx, false); line(ctx, u, [[word, w0]], { y: 1430, size: 260, align: 'left', x: 72 }); };
at(wt(10, 3) - 0.1, (ctx, u, t, I) => { const a = wt(10, 3) - 0.1; shot(ctx, I.nachrichten, cam(u, a, [[a, [1467, 560, 700]]])); big(ctx, u, 'Chat.', a); });
at(wt(10, 4) - 0.1, (ctx, u, t, I) => { const a = wt(10, 4) - 0.1; shot(ctx, I.start, cam(u, a, [[a, [930, 1090, 760]]])); big(ctx, u, 'Aufgaben.', a); });
at(wt(10, 5) - 0.1, (ctx, u, t, I) => { const a = wt(10, 5) - 0.1, o = wt(10, 6) - 0.1;
  shot(ctx, I.nachrichten, cam(u, a, [[a, [2290, 1000, 560]], [o, [2290, 1000, 560]], [o + 2.2, [1700, 760, 1150]]]));
  scrim(ctx, false);
  if (u < o) line(ctx, u, [['Dateien.', a]], { y: 1430, size: 260, align: 'left', x: 72 });
  else line(ctx, u, toks(10, 6, ['An', 'einem', 'Ort.']), { y: 1430, size: 210, align: 'left', x: 72 }); });
// 9 · Ende
at(T.end - 0.08, (ctx, u, t, I) => { const a = T.end - 0.08; ground(ctx, t, 0.8);
  const k = IN(clamp((u - a) / (22 * F))), s = lerp(3.5, 1, k), size = 150;
  ctx.save(); ctx.globalAlpha = clamp((u - a) / (6 * F)); ctx.translate(W / 2, 760); ctx.scale(s, s);
  if (I.logo) ctx.drawImage(I.logo, -size / 2, -size / 2, size, size); ctx.restore();
  line(ctx, u, [['xyntal', a + 0.35]], { y: 990, style: 'thin', size: 120 });
  const e = WD[11];
  line(ctx, u, [['Kostenlos', e[3][1] - 0.06], ['in', e[3][1]], ['der', e[3][1] + 0.05], ['Beta.', e[3][1] + 0.1]], { y: 1130, size: 92 });
  line(ctx, u, [['Link', e[4][1] - 0.06], ['im', e[5][1] - 0.06], ['Profil.', e[6][1] - 0.06]], { y: 1220, style: 'ui', size: 44, color: C.t2 });
  line(ctx, u, [['Gezeigt:', a + 0.6], ['App-Demo', a + 0.6], ['mit', a + 0.6], ['Beispieldaten', a + 0.6]], { y: 1440, style: 'ui', size: 26, color: C.t3 }); });

const GRAIN = [];
M.film({
  fonts: ['800 100px Archivo', '200 100px Archivo', '500 40px Plex'],
  images: {
    logo: '../_shared/fonts/logo.svg',
    entdecken: '../_shared/shots/demo_entdecken.png', frmich: '../_shared/shots/demo_frmich.png',
    nachrichten: '../_shared/shots/demo_nachrichten.png', start: '../_shared/shots/demo_start.png',
    klick0: '../_shared/shots/klick_0.png', klick1: '../_shared/shots/klick_1_hover.png', klick2: '../_shared/shots/klick_2_dabei.png',
  },
  hits: [],
  samples: 6,
  init() {
    for (let k = 0; k < 6; k++) {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d'), d = g.createImageData(256, 256), r = M.mulberry32(100 + k);
      for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0); GRAIN.push(c);
    }
  },
  draw(ctx, u, t, IMG) { let i = SC.length - 1; while (i > 0 && u < SC[i][0]) i--; SC[i][1](ctx, u, t, IMG); },
  post(ctx, u, t) {
    // Vignette für Tiefe, dann Filmkorn
    const v = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.32, W / 2, H * 0.45, H * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    if (!GRAIN.length) return;
    const f = Math.floor(t * 60);
    ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
    ctx.translate((f * 37) % 256, (f * 91) % 256); ctx.fillStyle = ctx.createPattern(GRAIN[f % 6], 'repeat');
    ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  },
});
