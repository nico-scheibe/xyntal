// R12 · Der Ideen-Typ, Pro-Fassung.
// Regeln (siehe docs/regeln.md): App füllt das Bild und wird vom Rand beschnitten, Kamera bewegt sich in
// jedem Frame, harte Schnitte auf dem gesprochenen Wort, Wörter im Sprechrhythmus, Ankommen bremst ab,
// Verlassen beschleunigt, keine Labels, keine schwebenden Karten, kurzes Ende.
import * as M from '../_shared/motion.js';
import T from './timing.js';

const { W, H, E, clamp, lerp, kf } = M;
const K = T.cards, WD = T.words;
const wt = (line, i) => WD[line][i][1];          // Startbeat eines gesprochenen Worts

const C = { bg: '#1F1F21', ui: '#0C0C0D', t1: '#ECEAE4', t2: '#B9B7B0', t3: '#918F89', pu: '#B36BFF', bl: '#3A8AFF', cy: '#3FE0F0' };
const IN = E.bezier(0.16, 1, 0.3, 1);            // Ankommen: bremst ab
const OUT = E.bezier(0.7, 0, 0.84, 0);           // Verlassen: beschleunigt
const F = 1 / 30;                                // ein Frame in Beats (120 bpm, 60 fps)

function font(ctx, size, weight, family, stretch = 'normal', spacing = 0) {
  ctx.font = `${weight} ${Math.round(size)}px ${family}`;
  ctx.fontStretch = stretch;
  ctx.letterSpacing = `${spacing}px`;
}
const STYLE = {
  fat: (s) => [s, 800, 'Archivo', 'extra-condensed'],
  thin: (s) => [s, 200, 'Archivo', 'expanded'],
  ui: (s) => [s, 500, 'Plex', 'normal'],
};

// Eine Zeile aus Wörtern, jedes erscheint zu seinem Zeitpunkt: 10 Frames Weg nach oben, 6 Frames Deckkraft.
function line(ctx, u, tokens, { x = 72, y, style = 'fat', size = 160, align = 'left', color = C.t1, spacing = 0 }) {
  const [s, w, fam, st] = STYLE[style](size);
  font(ctx, s, w, fam, st, spacing);
  const space = ctx.measureText(' ').width;
  const widths = tokens.map(([txt]) => ctx.measureText(txt).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (tokens.length - 1);
  let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
  tokens.forEach(([txt, at], i) => {
    const p = clamp((u - at) / (10 * F));
    if (p > 0) {
      ctx.save();
      ctx.globalAlpha *= clamp((u - at) / (6 * F));
      ctx.fillStyle = color;
      ctx.fillText(txt, cx, y + (1 - IN(p)) * s * 0.32);
      ctx.restore();
    }
    cx += widths[i] + space;
  });
}

// Hintergrund für Schrift-Szenen: Anthrazit und das Partikel-X der Startseite, das langsam fließt.
const PTS = (() => {
  const r = M.mulberry32(7), out = [];
  for (let i = 0; i < 1300; i++) {
    const g = (r() + r() + r() - 1.5) * 2;    // grob normalverteilt
    out.push({ arm: i % 2, s: r(), n: g * 18, sz: 2 + r() * 3, ph: r() * 6.28, sp: 0.004 + r() * 0.01 });
  }
  return out;
})();
const quad = (a, b, c, t) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;
function ground(ctx, t, energy = 1) {
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  const sc = 5.2, ox = W / 2 - 256 * sc + 40 * Math.sin(t * 0.15), oy = H * 0.46 - 256 * sc;
  const cols = [[179, 107, 255], [58, 138, 255], [63, 224, 240]];
  for (const p of PTS) {
    const s = (p.s + t * p.sp) % 1;
    // die beiden Bögen des Logos: [140,140]→[300,212]→[372,372] und [140,372]→[212,212]→[372,140]
    const x = p.arm ? quad(140, 300, 372, s) : quad(140, 212, 372, s);
    const y = p.arm ? quad(140, 212, 372, s) : quad(372, 212, 140, s);
    const nx = p.arm ? -0.7 : 0.7, ny = 0.7;
    const px = ox + (x + nx * p.n) * sc, py = oy + (y + ny * p.n) * sc;
    if (px < -10 || px > W + 10 || py < -10 || py > H + 10) continue;
    const c = s < 0.5 ? cols[0].map((v, k) => lerp(v, cols[1][k], s * 2)) : cols[1].map((v, k) => lerp(v, cols[2][k], s * 2 - 1));
    const a = (0.34 + 0.22 * Math.sin(p.ph + t * 1.3)) * energy;
    ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
    ctx.fillRect(px, py, p.sz, p.sz);
  }
}

// Echte App-Ansicht im Vollbild. cam = [Mitte x, Mitte y, sichtbare Breite] in Bildpixeln.
function shot(ctx, img, [cx, cy, vw]) {
  ctx.fillStyle = C.ui; ctx.fillRect(0, 0, W, H);
  if (!img) return;
  const s = W / vw;
  ctx.save();
  ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-cx, -cy);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
function scrim(ctx, top) {
  const g = top ? ctx.createLinearGradient(0, 760, 0, 0) : ctx.createLinearGradient(0, 880, 0, H);
  g.addColorStop(0, 'rgba(12,12,13,0)'); g.addColorStop(0.45, 'rgba(12,12,13,0.92)'); g.addColorStop(1, 'rgba(12,12,13,0.97)');
  ctx.fillStyle = g;
  if (top) ctx.fillRect(0, 0, W, 760); else ctx.fillRect(0, 880, W, H - 880);
}
// Kamera: Schlüsselpunkte mit weicher Fahrt, dazu ständiges langsames Heranfahren und ein Ankommen aus der Nähe.
function cam(u, at, keys) {
  const c = kf(u, keys, E.inOutCubic);
  const arrive = 1 - 0.1 * (1 - IN(clamp((u - at) / (14 * F))));
  const drift = 1 - 0.018 * (u - at);
  return [c[0], c[1], c[2] * arrive * drift];
}

const SCENES = [];
const at = (u0, fn) => SCENES.push([u0, fn]);
const toks = (lineIdx, from, words) => words.map((w, i) => [w, wt(lineIdx, from + i) - 0.06]);

// 1 · Der Sketch als Schrift: Max schmal und fett, du breit und dünn
at(0, (ctx, u, t) => {
  ground(ctx, t, 0.8);
  ctx.save();
  const z = 1 + 0.004 * u; ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  line(ctx, u, [['Wir', -1], ['machen', wt(0, 1) - 0.06]], { y: 450, size: 190 });
  line(ctx, u, [['50/50.', wt(0, 2) - 0.06]], { y: 640, size: 190 });
  line(ctx, u, toks(0, 3, ['Ich', 'hab', 'ja', 'die', 'Idee.']), { y: 760, style: 'thin', size: 66, x: 84, color: C.t2 });
  line(ctx, u, toks(1, 0, ['Und', 'wer', 'baut']), { y: 960, style: 'thin', size: 112, align: 'right', x: W - 72 });
  line(ctx, u, toks(1, 3, ['die', 'App?']), { y: 1070, style: 'thin', size: 112, align: 'right', x: W - 72 });
  line(ctx, u, [['Du.', wt(2, 0) - 0.06]], { y: 1350, size: 300 });
  line(ctx, u, toks(2, 1, ['Ist', 'ja', 'nur', 'ein', 'Wochenende.']), { y: 1440, size: 66, x: 84, color: C.t2 });
  ctx.restore();
});
// 2 · Zuspitzung: „Monate“ zieht sich in die Länge
at(K[3] - 0.08, (ctx, u, t) => {
  ground(ctx, t, 1);
  line(ctx, u, toks(3, 0, ['So', 'verlierst', 'du']), { y: 820, size: 160 });
  const sp = 2 + 14 * IN(clamp((u - wt(3, 3)) / 2.4));
  line(ctx, u, [['Monate.', wt(3, 3) - 0.06]], { y: 1060, style: 'thin', size: 200, spacing: sp, x: 84 });
});
// 3 · Wendepunkt
at(K[4] - 0.08, (ctx, u, t) => {
  ground(ctx, t, 1.3);
  line(ctx, u, toks(4, 0, ['Es', 'geht', 'viel']), { y: 820, size: 180 });
  line(ctx, u, [['einfacher.', wt(4, 3) - 0.06]], { y: 1040, style: 'thin', size: 170, x: 84 });
});
// 4 · Entdecken: wer passt
at(K[5] - 0.08, (ctx, u, t, I) => {
  const a = K[5] - 0.08;
  shot(ctx, I.entdecken, cam(u, a, [[a, [930, 779, 860]], [wt(5, 4), [930, 779, 860]], [wt(5, 9), [1420, 779, 860]]]));
  scrim(ctx, false);
  if (u < wt(5, 4) - 0.1) line(ctx, u, toks(5, 0, ['Sag,', 'was', 'du', 'baust.']), { y: 1400, size: 150 });
  else {
    line(ctx, u, toks(5, 8, ['Wer', 'passt.']), { y: 1430, size: 200 });
  }
});
// 5 · Passung, ganz nah – die Oberfläche ist der Beweis
at(K[6] - 0.08, (ctx, u, t, I) => {
  const a = K[6] - 0.08;
  shot(ctx, I.entdecken, cam(u, a, [[a, [702, 968, 430]], [wt(6, 4) - 0.2, [702, 990, 430]], [wt(6, 5) + 0.6, [702, 1140, 540]]]));
});
// 6 · Zeit und was jemand sucht
at(K[7] - 0.08, (ctx, u, t, I) => {
  const a = K[7] - 0.08;
  shot(ctx, I.entdecken, cam(u, a, [[a, [1095, 1262, 420]], [wt(7, 5) - 0.2, [1100, 1270, 420]], [wt(7, 8) + 0.4, [1235, 1400, 470]]]));
});
// 7 · Leute finden dich
at(K[8] - 0.08, (ctx, u, t, I) => {
  const a = K[8] - 0.08;
  shot(ctx, I.frmich, cam(u, a, [[a, [1000, 1180, 660]], [K[9], [1150, 1195, 660]]]));
  scrim(ctx, true);
  line(ctx, u, [['Leute,', wt(8, 1) - 0.06], ['die', wt(8, 2) - 0.06], ['passen,', wt(8, 3) - 0.06]], { y: 360, style: 'thin', size: 80, x: 84, color: C.t2 });
  line(ctx, u, toks(8, 4, ['finden', 'auch', 'dich.']), { y: 540, size: 170 });
});
// 8 · Dann direkt los – Schnitte auf jedem Wort
at(K[9] - 0.08, (ctx, u, t) => {
  ground(ctx, t, 1.1);
  line(ctx, u, toks(9, 0, ['Dann', 'direkt', 'los.']), { y: 960, size: 200 });
});
const big = (ctx, u, word, w0) => { scrim(ctx, false); line(ctx, u, [[word, w0]], { y: 1430, size: 260 }); };
at(wt(9, 3) - 0.1, (ctx, u, t, I) => { const a = wt(9, 3) - 0.1; shot(ctx, I.nachrichten, cam(u, a, [[a, [1467, 560, 700]]])); big(ctx, u, 'Chat.', a); });
at(wt(9, 4) - 0.1, (ctx, u, t, I) => { const a = wt(9, 4) - 0.1; shot(ctx, I.start, cam(u, a, [[a, [930, 1090, 760]]])); big(ctx, u, 'Aufgaben.', a); });
at(wt(9, 5) - 0.1, (ctx, u, t, I) => {
  const a = wt(9, 5) - 0.1, o = wt(9, 6) - 0.1;
  shot(ctx, I.nachrichten, cam(u, a, [[a, [2290, 1000, 560]], [o, [2290, 1000, 560]], [o + 2.2, [1700, 760, 1150]]]));
  scrim(ctx, false);
  if (u < o) line(ctx, u, [['Dateien.', a]], { y: 1430, size: 260 });
  else line(ctx, u, toks(9, 6, ['An', 'einem', 'Ort.']), { y: 1430, size: 210 });
});
// 9 · Ende: Zeichen kommt aus der Nähe an, kurzer Halt
at(T.end - 0.08, (ctx, u, t, I) => {
  const a = T.end - 0.08;
  ground(ctx, t, 0.7);
  const k = IN(clamp((u - a) / (22 * F)));
  const s = lerp(3.5, 1, k), size = 150;
  ctx.save(); ctx.globalAlpha = clamp((u - a) / (6 * F));
  ctx.translate(W / 2, 760); ctx.scale(s, s);
  if (I.logo) ctx.drawImage(I.logo, -size / 2, -size / 2, size, size);
  ctx.restore();
  line(ctx, u, [['xyntal', a + 0.35]], { y: 990, style: 'thin', size: 120, align: 'center', x: W / 2 });
  const e = WD[10];
  line(ctx, u, [['Kostenlos', e[3][1] - 0.06], ['in', e[3][1]], ['der', e[3][1] + 0.05], ['Beta.', e[3][1] + 0.1]], { y: 1130, size: 92, align: 'center', x: W / 2 });
  line(ctx, u, [['Link', e[4][1] - 0.06], ['im', e[5][1] - 0.06], ['Profil.', e[6][1] - 0.06]], { y: 1220, style: 'ui', size: 44, align: 'center', x: W / 2, color: C.t2 });
  line(ctx, u, [['Gezeigt:', a + 0.6], ['App-Demo', a + 0.6], ['mit', a + 0.6], ['Beispieldaten', a + 0.6]], { y: 1440, style: 'ui', size: 26, align: 'center', x: W / 2, color: C.t3 });
});

// Filmkorn: vorab erzeugte Rauschkacheln, pro Frame eine andere (seeded, also rein aus der Zeit).
const GRAIN = [];
M.film({
  fonts: ['800 100px Archivo', '200 100px Archivo', '500 40px Plex'],
  images: {
    logo: '../_shared/fonts/logo.svg',
    entdecken: '../_shared/shots/demo_entdecken.png',
    frmich: '../_shared/shots/demo_frmich.png',
    nachrichten: '../_shared/shots/demo_nachrichten.png',
    start: '../_shared/shots/demo_start.png',
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
  draw(ctx, u, t, IMG) {
    let i = SCENES.length - 1;
    while (i > 0 && u < SCENES[i][0]) i--;
    SCENES[i][1](ctx, u, t, IMG);
  },
  post(ctx, u, t) {
    if (!GRAIN.length) return;
    const f = Math.floor(t * 60);
    ctx.save(); ctx.globalAlpha = 0.045; ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(GRAIN[f % 6], 'repeat');
    ctx.translate((f * 37) % 256, (f * 91) % 256);
    ctx.fillStyle = pat; ctx.fillRect(-256, -256, W + 512, H + 512);
    ctx.restore();
  },
});
