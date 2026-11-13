// R14 · Der Ideen-Typ, mobile Fassung. Regeln: ../REGELN.md, Kritik eingearbeitet (docs/kritik-r13.md).
// Idee: Das Problem ist unscharf, die App bringt Klarheit. Die echte App liegt von Frame 0 unscharf hinter dem Hook,
// auf „Es geht auch anders“ zieht die Schärfe auf. Native Handy-Ansichten der Demo (540 px, 3x), nie durch Wörter beschnitten.
import * as M from '../_shared/motion.js';
import T from './timing.js';

const { W, H, E, clamp, lerp, kf } = M;
const K = T.cards, WD = T.words;
const wt = (l, i) => WD[l][i][1];
const C = { ground: '#0E0E10', ui: '#0C0C0D', t1: '#ECEAE4', t2: '#B9B7B0', t3: '#918F89' };
const IO = E.bezier(0.65, 0, 0.35, 1);
const EXPO = E.outExpo;
const F = 1 / 30;
const BAND = 600;           // feste Textzone oben (Instagram-Leiste endet bei ~250)

function font(ctx, size, weight, family, stretch = 'normal') { ctx.font = `${weight} ${Math.round(size)}px ${family}`; ctx.fontStretch = stretch; ctx.letterSpacing = '0px'; }
const FAT = (s) => [s, 800, 'Archivo', 'extra-condensed'];

// Wörter erscheinen hart auf dem Wort (kein Einblenden), mit 4 Frames kleinem Setzen nach oben.
function words(ctx, u, tokens, { x = 72, y, size = 160, color = C.t1 }) {
  font(ctx, ...FAT(size));
  const space = ctx.measureText(' ').width;
  let cx = x;
  for (const [txt, at] of tokens) {
    const w = ctx.measureText(txt).width;
    if (u >= at) { const p = clamp((u - at) / (4 * F)); ctx.fillStyle = color; ctx.fillText(txt, cx, y + (1 - p) * 10); }
    cx += w + space;
  }
}
const toks = (l, from, ws, lead = 0.04) => ws.map((w, i) => [w, wt(l, from + i) - lead]);

function shot(ctx, img, [cx, cy, vw], filter = 'none', dy = 0) {
  ctx.fillStyle = C.ui; ctx.fillRect(0, 0, W, H);
  if (!img) return;
  const s = W / vw;
  ctx.save(); ctx.filter = filter; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-cx, -cy + dy);
  ctx.drawImage(img, 0, 0); ctx.restore();
}
function band(ctx) {
  ctx.fillStyle = 'rgba(12,12,13,0.97)'; ctx.fillRect(0, 0, W, BAND);
  const g = ctx.createLinearGradient(0, BAND, 0, BAND + 90);
  g.addColorStop(0, 'rgba(12,12,13,0.97)'); g.addColorStop(1, 'rgba(12,12,13,0)');
  ctx.fillStyle = g; ctx.fillRect(0, BAND, W, 90);
}
const cap = (ctx, u, tokens, size = 150) => { band(ctx); words(ctx, u, tokens, { y: BAND - 90, size }); };
// Kamera: weiche Fahrten zwischen Schlüsselpunkten plus ständiges langsames Heranfahren
function cam(u, a, keys, push = 0.014) { const c = kf(u, keys, E.inOutCubic); return [c[0], c[1], c[2] * (1 - push * (u - a))]; }

function cursor(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 74); ctx.lineTo(18, 57); ctx.lineTo(31, 86); ctx.lineTo(44, 80); ctx.lineTo(31, 52); ctx.lineTo(55, 52); ctx.closePath();
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6; ctx.fillStyle = '#fff'; ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.lineWidth = 4; ctx.strokeStyle = '#111'; ctx.stroke(); ctx.restore();
}

// Aufnahmen: Fenster 1518 px breit. Gemessen per DOM (siehe docs/kritik-r13.md).
const P = { pill: [390, 2004], zeit: [300, 2440], btn: [261, 2882], noahMsg: [216, 2855] };
const WIDE = (u) => [759 + 0 * u, 1046, 1518];

const SC = []; const at = (u0, fn) => SC.push([u0, fn]);

// Akt 1 · Hook über der unscharfen App. Ein Satz pro Bild, harte Schnitte.
const blurred = (ctx, u, I, amt = 1) => shot(ctx, I.entdecken, [759, 1046 + 30 * u, 1518 * (1 - 0.006 * u)], `blur(${22 * amt}px) brightness(${lerp(1, 0.38, amt)})`);
at(0, (ctx, u, t, I) => { blurred(ctx, u, I); words(ctx, u, [['Wir', -1], ['machen', wt(0, 1) - 0.04]], { y: 1000, size: 230 }); });
at(wt(0, 2) - 0.04, (ctx, u, t, I) => { const a = wt(0, 2) - 0.04; blurred(ctx, u, I);
  const s = lerp(1.4, 1, EXPO(clamp((u - a) / (6 * F))));                // der eine gestaltete Übergang: Scale-Cut
  ctx.save(); ctx.translate(72, 1120); ctx.scale(s, s); words(ctx, u, [['50/50.', a]], { x: 0, y: 0, size: 400 }); ctx.restore(); });
at(wt(0, 3) - 0.04, (ctx, u, t, I) => { blurred(ctx, u, I);
  words(ctx, u, toks(0, 3, ['Ich', 'hab']), { y: 900, size: 230 }); words(ctx, u, toks(0, 5, ['die', 'Idee,']), { y: 1110, size: 230 }); });
at(wt(0, 7) - 0.04, (ctx, u, t, I) => { blurred(ctx, u, I);
  words(ctx, u, [['du', wt(0, 7) - 0.04]], { y: 1060, size: 560 });
  words(ctx, u, toks(0, 8, ['baust', 'die', 'App.']), { y: 1250, size: 150, color: C.t2 }); });
// Wendepunkt: Schärfe zieht auf, dieselbe Aufnahme wird zur Produkt-Szene
at(K[1] - 0.04, (ctx, u, t, I) => { const a = K[1] - 0.04;
  const f = IO(clamp((u - (wt(1, 3) - 0.1)) / 1.2));
  blurred(ctx, u, I, 1 - f);
  ctx.save(); ctx.globalAlpha = 1 - f;
  words(ctx, u, toks(1, 0, ['Es', 'geht', 'auch']), { y: 950, size: 210 }); words(ctx, u, [['anders.', wt(1, 3) - 0.04]], { y: 1150, size: 210 });
  ctx.restore(); });
// Akt 2 · Produkt
at(K[2] - 0.04, (ctx, u, t, I) => { const a = K[2] - 0.04, u0 = a;
  const c = cam(u, a, [[a, [759, 1046 + 30 * a, 1518 * (1 - 0.006 * a)]], [wt(2, 4), [700, 1500, 1300]], [K[3], [560, 1900, 1100]]], 0);
  shot(ctx, I.entdecken, c);
  if (u < wt(2, 8) - 0.1) cap(ctx, u, toks(2, 0, ['Sag,', 'was', 'du', 'baust.']));
  else cap(ctx, u, toks(2, 8, ['Wer', 'passt.']), 170); });
// Makro auf die Passung, dann auf die Zeit
at(K[3] - 0.04, (ctx, u, t, I) => { const a = K[3] - 0.04;
  shot(ctx, I.entdecken, cam(u, a, [[a, [390, P.pill[1] + 120, 700]], [wt(3, 4) - 0.2, [390, P.pill[1] + 100, 700]], [wt(3, 7) + 0.3, [390, P.zeit[1] + 60, 720]]]));
  if (u < wt(3, 4) - 0.1) cap(ctx, u, [['94 %', wt(3, 1) - 0.04], ['Passung.', wt(3, 1) - 0.04]]);
  else cap(ctx, u, [['Wie', wt(3, 5) - 0.04], ['viel', wt(3, 6) - 0.04], ['Zeit.', wt(3, 7) - 0.04]]); });
// Höhepunkt · der Klick, langsam
at(K[4] - 0.04, (ctx, u, t, I) => { const a = K[4] - 0.04;
  const press = wt(4, 2) - 0.02, arrive = press - 0.5;
  const nudge = 1 - 0.04 * EXPO(clamp((u - press) / 0.8));
  const c0 = cam(u, a, [[a, [380, 2678, 760]]], 0.01);
  const c = [c0[0], c0[1], c0[2] * nudge];
  const img = u < arrive - 0.15 ? I.k0 : u < press + 3 * F ? I.k1 : I.k2;
  shot(ctx, img, c, 'none', img === I.k1 ? 6 : 0);
  const s = W / c[2];
  const bx = W / 2 + (P.btn[0] - c[0]) * s, by = H / 2 + (P.btn[1] - c[1]) * s;
  const mv = IO(clamp((u - (arrive - 2.0)) / 2.0));
  const x = lerp(W + 140, bx + 60, mv), y = lerp(H + 120, by + 16, mv) - Math.sin(mv * Math.PI) * 140;
  const ps = 1 - 0.14 * Math.sin(Math.PI * clamp((u - press) / (8 * F)));
  if (u < wt(4, 1) - 0.1) cap(ctx, u, [['Passt?', wt(4, 0) - 0.04]], 190);
  else cap(ctx, u, toks(4, 1, ['Ein', 'Klick.']), 190);
  cursor(ctx, x, y, 1.3 * ps); });
// Leute finden dich · die Kamera liest die Nachricht, nur diese Zeile ist scharf
at(K[5] - 0.04, (ctx, u, t, I) => { const a = K[5] - 0.04;
  const c = cam(u, a, [[a, [572, 2900, 770]]], 0.012);
  shot(ctx, I.frmich, c, 'blur(9px) brightness(0.4)');
  const s = W / c[2], y0 = H / 2 + (2830 - c[1]) * s, y1 = H / 2 + (2990 - c[1]) * s;
  ctx.save(); ctx.beginPath(); ctx.rect(0, y0, W, y1 - y0); ctx.clip(); shot(ctx, I.frmich, c); ctx.restore();
  const fade = ctx.createLinearGradient(W - 220, 0, W, 0);                // Zeile läuft weich aus dem Bild statt hart abzubrechen
  fade.addColorStop(0, 'rgba(12,12,13,0)'); fade.addColorStop(1, 'rgba(12,12,13,0.95)');
  ctx.fillStyle = fade; ctx.fillRect(W - 220, y0, 220, y1 - y0);
  cap(ctx, u, [['Leute', wt(5, 1) - 0.04], ['finden', wt(5, 4) - 0.04], ['dich.', wt(5, 6) - 0.04]]); });
// Alles an einem Ort · eine durchgehende Fahrt durch den Team-Chat
at(K[6] - 0.04, (ctx, u, t, I) => { const a = K[6] - 0.04;
  shot(ctx, I.nachrichten, cam(u, a, [[a, [760, 1700, 1300]], [T.end, [760, 2150, 1300]]], 0.01));
  if (u < wt(6, 5) - 0.1) cap(ctx, u, [['Dann', wt(6, 0) - 0.04], ['baut', wt(6, 1) - 0.04], ['ihr', wt(6, 2) - 0.04], ['los.', wt(6, 4) - 0.04]]);
  else cap(ctx, u, [['Alles', wt(6, 5) - 0.04], ['an', wt(6, 6) - 0.04], ['einem', wt(6, 7) - 0.04], ['Ort.', wt(6, 8) - 0.04]]); });
// Akt 3 · Ende, kurz: der echte Knopf „Du bist dabei“ als Abschluss
at(T.end - 0.04, (ctx, u, t, I) => { const a = T.end - 0.04;
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  const k = EXPO(clamp((u - a) / (12 * F))), z = 1 - 0.01 * (u - a);
  const sc = lerp(3.2, 2.6, k) * z, bw = 336 * sc, bh = 102 * sc;           // Knopf aus der echten Aufnahme
  if (I.k2) ctx.drawImage(I.k2, 93, 2831, 336, 102, W / 2 - bw / 2, 700 - bh / 2, bw, bh);
  const e = WD[7];
  words(ctx, u, [['Kostenlos', a]], { y: 1060, size: 150 });
  words(ctx, u, [['in', e[1][1] - 0.04], ['der', e[2][1] - 0.04], ['Beta.', e[3][1] - 0.04]], { y: 1210, size: 150 });
  font(ctx, 46, 500, 'Plex');
  if (u >= e[4][1] - 0.04) { ctx.fillStyle = C.t2; ctx.fillText('Link im Profil · xyntal.de', 76, 1310); }
  font(ctx, 28, 400, 'Plex'); ctx.fillStyle = C.t3; ctx.fillText('Gezeigt: App-Demo mit Beispieldaten', 76, 1420); });

const GRAIN = [];
M.film({
  fonts: ['800 100px Archivo', '500 40px Plex', '400 28px Plex'],
  images: {
    entdecken: '../_shared/shots/m_entdecken.png', frmich: '../_shared/shots/m_frmich.png', nachrichten: '../_shared/shots/m_nachrichten.png',
    k0: '../_shared/shots/m_klick_0.png', k1: '../_shared/shots/m_klick_1.png', k2: '../_shared/shots/m_klick_2.png',
  },
  hits: [], samples: 6,
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
    if (!GRAIN.length) return;
    const f = Math.floor(t * 60);
    ctx.save(); ctx.globalAlpha = 0.05; ctx.globalCompositeOperation = 'overlay';
    ctx.translate((f * 37) % 256, (f * 91) % 256); ctx.fillStyle = ctx.createPattern(GRAIN[f % 6], 'repeat');
    ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
  },
});
