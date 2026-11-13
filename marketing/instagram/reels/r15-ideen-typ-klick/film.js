// R15 · Der Ideen-Typ, Fassung „Klick“. Regeln: ../REGELN.md, beide Kritiken eingearbeitet (docs/kritik.md).
// Idee: Das Problem ist unscharf, Xyntal macht es klar, und am Ende reicht ein Tipp. Der Film läuft auf den Klick zu,
// und der Knopf „Du bist dabei“ fliegt per Match-Cut in die Endkarte.
import * as M from '../_shared/motion.js';
import T from './timing.js';

const { W, H, E, clamp, lerp, kf } = M;
const K = T.cards, WD = T.words;
const wt = (l, i) => WD[l][i][1];
const C = { ground: '#0E0E11', ui: '#0C0C0D', t1: '#ECEAE4', t2: '#B9B7B0', t3: '#918F89', green: '#45c99b', greenBg: '#192f2d' };
const IO = E.bezier(0.65, 0, 0.35, 1), EXPO = E.outExpo, SLIDE = E.bezier(0.2, 0.8, 0.2, 1);
const F = 1 / 30, BAND = 620;

function font(ctx, size, weight, family, stretch = 'normal') { ctx.font = `${weight} ${Math.round(size)}px ${family}`; ctx.fontStretch = stretch; ctx.letterSpacing = '0px'; }
function words(ctx, u, tokens, { x = 72, y, size = 160, color = C.t1, maxW = W - 144 }) {
  font(ctx, size, 800, 'Archivo', 'extra-condensed');
  const full = tokens.map(([t]) => t).join(' ');
  while (ctx.measureText(full).width > maxW && size > 40) { size *= 0.95; font(ctx, size, 800, 'Archivo', 'extra-condensed'); }
  const space = ctx.measureText(' ').width; let cx = x;
  for (const [txt, at] of tokens) {
    const w = ctx.measureText(txt).width;
    if (u >= at) { const p = clamp((u - at) / (4 * F)); ctx.fillStyle = color; ctx.fillText(txt, cx, y + (1 - p) * 10); }
    cx += w + space;
  }
}
const toks = (l, from, ws) => ws.map((w, i) => [w, wt(l, from + i) - 0.04]);
function shot(ctx, img, [cx, cy, vw], filter = 'none', dy = 0) {
  ctx.fillStyle = C.ui; ctx.fillRect(0, 0, W, H); if (!img) return;
  const s = W / vw;
  ctx.save(); ctx.filter = filter; ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-cx, -cy + dy); ctx.drawImage(img, 0, 0); ctx.restore();
}
// feste, deckende Textzone oben; die Oberfläche beginnt darunter
const cap = (ctx, u, tokens, size = 160) => { ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, BAND); words(ctx, u, tokens, { y: BAND - 110, size }); };
function cam(u, a, keys, push = 0.012) { const c = kf(u, keys, E.inOutCubic); return [c[0], c[1], c[2] * (1 - push * (u - a))]; }

// Bildkoordinaten in der Handy-Aufnahme (1518 px breit), gemessen per DOM
const P = { pill: [390, 2004], zeit: [300, 2440], btn: [93, 2831, 336, 102] };
// Oberfläche so legen, dass ein Bildpunkt (iy) bei Bildschirmhöhe sy landet
const camAt = (cx, iy, vw, sy) => [cx, iy - (sy - H / 2) * (vw / W), vw];

// „Du bist dabei“ als Vektor, in den Farben der echten Oberfläche
function dabei(ctx, x, y, w, press = 1) {
  const h = w * (102 / 336), r = h / 2;
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.scale(press, press); ctx.translate(-w / 2, -h / 2);
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, r); ctx.fillStyle = C.greenBg; ctx.fill();
  ctx.lineWidth = Math.max(2, w * 0.009); ctx.strokeStyle = C.green; ctx.stroke();
  const fs = h * 0.34; font(ctx, fs, 600, 'Plex'); ctx.fillStyle = C.green;
  const label = 'Du bist dabei', tw = ctx.measureText(label).width, ck = fs * 0.75, gap = fs * 0.45;
  const sx = (w - (ck + gap + tw)) / 2, cy = h / 2;
  ctx.beginPath(); ctx.moveTo(sx, cy); ctx.lineTo(sx + ck * 0.38, cy + ck * 0.36); ctx.lineTo(sx + ck, cy - ck * 0.42);
  ctx.lineWidth = fs * 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillText(label, sx + ck + gap, cy + fs * 0.36);
  ctx.restore();
}

const SC = []; const at = (u0, fn) => SC.push([u0, fn]);

// Akt 1 · Hook über der App, unscharf, aber als Oberfläche erkennbar
const HOOKCAM = (u) => { const c = camAt(390, 1443, 760, 700); return [c[0], c[1] + 4 * (K[2] - u), c[2] * (1 + 0.004 * (K[2] - u))]; };
const CARDCAM = HOOKCAM(K[2]);
const bg = (ctx, u, I, amt = 1, c = HOOKCAM(u)) => {
  shot(ctx, I.entdecken, c, amt > 0 ? `blur(${14 * amt}px) brightness(${lerp(1, 0.55, amt)})` : 'none');
  if (amt > 0) {   // die Karte von Noah etwas heller, damit sie als Produkt lesbar ist
    const s = W / c[2], x = W / 2 + (42 - c[0]) * s, y = H / 2 + (1443 - c[1]) * s;
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, 696 * s, 1611 * s, 40 * s); ctx.clip();
    shot(ctx, I.entdecken, c, `blur(${14 * amt}px) brightness(${lerp(1, 0.72, amt)})`); ctx.restore();
  } };
const veil = (ctx) => { ctx.fillStyle = 'rgba(14,14,17,0.22)'; ctx.fillRect(0, 700, W, 760); };    // ruhige Fläche hinter der Schrift
at(0, (ctx, u, t, I) => {   // Frame 0: Produkt scharf. Mit dem ersten Wort zieht die Schärfe weg (12 Frames).
  const w0 = wt(0, 0) - 0.04, k = EXPO(clamp((u - w0) / (12 * F)));
  bg(ctx, u, I, Math.max(0.001, k));
  if (k > 0) { ctx.save(); ctx.globalAlpha = k; veil(ctx); ctx.restore(); }
  words(ctx, u, [['Wir', w0], ['machen', wt(0, 1) - 0.04]], { y: 1040, size: 230 }); });
at(wt(0, 2) - 0.04, (ctx, u, t, I) => { const a = wt(0, 2) - 0.04; bg(ctx, u, I); veil(ctx);
  const s = lerp(1.4, 1, EXPO(clamp((u - a) / (6 * F))));
  ctx.save(); ctx.translate(72, 1160); ctx.scale(s, s); words(ctx, u, [['50/50.', a]], { x: 0, y: 0, size: 400 }); ctx.restore(); });
at(wt(0, 3) - 0.04, (ctx, u, t, I) => { bg(ctx, u, I); veil(ctx);
  words(ctx, u, toks(0, 3, ['Ich', 'hab']), { y: 940, size: 230 }); words(ctx, u, toks(0, 5, ['die', 'Idee,']), { y: 1150, size: 230 }); });
at(wt(0, 7) - 0.04, (ctx, u, t, I) => { bg(ctx, u, I); veil(ctx);
  words(ctx, u, [['du', wt(0, 7) - 0.04]], { y: 1100, size: 560 });
  words(ctx, u, toks(0, 8, ['baust', 'die', 'App.']), { y: 1290, size: 150, color: C.t2 }); });
// Wendepunkt: Schrift steht, bis die Schärfe in 12 Frames aufzieht, dann ist sie weg (harter Schnitt)
const PULL = () => wt(1, 3) + 0.25;
at(K[1] - 0.04, (ctx, u, t, I) => {
  const f = EXPO(clamp((u - PULL()) / (12 * F)));
  const c = HOOKCAM(u).map((v, i) => lerp(v, CARDCAM[i], f));
  bg(ctx, u, I, 1 - f, c);
  if (f < 0.35) { veil(ctx); words(ctx, u, toks(1, 0, ['Es', 'geht', 'auch']), { y: 990, size: 210 }); words(ctx, u, [['anders.', wt(1, 3) - 0.04]], { y: 1190, size: 210 }); } });
// Akt 2 · EINE durchgehende Kamerafahrt über Noahs Karte, ohne Jump-Cuts.
// Harte Schnitte nur, wo sich das Bild wirklich ändert: Einschub „94 %“ und Match-Cut ins Ende.
const PILL = camAt(390, 2004, 640, 1100), ZEIT = camAt(390, 2330, 760, 840), TAP = camAt(390, 2560, 760, 820);
const CARD2 = camAt(390, 1500, 760, 700);
const N0 = () => wt(3, 3) - 0.04, N1 = () => N0() + 1.1;            // Einschub „94 %“ auf „Prozent“
function PATH(u) {
  const a = K[2] - 0.04;
  if (u < N1()) return cam(u, a, [[a, CARDCAM], [wt(2, 8), camAt(390, 1470, 700, 700)], [K[3] - 0.3, camAt(390, 1500, 680, 700)], [wt(3, 1) + 0.2, PILL]], 0.006);
  // nach dem Einschub: neue Einstellung (Zeit-Bereich), dann gleitend weiter bis zum Knopf
  const b = N1(), press = wt(5, 2) - 0.02;
  const c = cam(u, b, [[b, ZEIT], [K[5] - 0.5, [ZEIT[0], ZEIT[1] + 40, ZEIT[2]]], [K[5] + 0.6, TAP]], 0.006);
  return [c[0], c[1], c[2] * (1 - 0.03 * EXPO(clamp((u - press) / 0.8)))];
}
function btnRect(c) { const s = W / c[2]; return [W / 2 + (P.btn[0] - c[0]) * s, H / 2 + (P.btn[1] - c[1]) * s, P.btn[2] * s, P.btn[3] * s, s]; }
function dabeiDraw(ctx, x, y, w, k = 1) {     // Vektor-Knopf; k = Fortschritt des Hakens 0..1
  const h = w * (102 / 336), r = h / 2;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = C.greenBg; ctx.fill();
  ctx.lineWidth = Math.max(2, w * 0.009); ctx.strokeStyle = C.green; ctx.stroke();
  const fs = h * 0.34; font(ctx, fs, 600, 'Plex'); ctx.fillStyle = C.green;
  const label = 'Du bist dabei', tw = ctx.measureText(label).width, ck = fs * 0.75, gap = fs * 0.45;
  const sx = x + (w - (ck + gap + tw)) / 2, cy = y + h / 2;
  const p1 = [sx, cy], p2 = [sx + ck * 0.38, cy + ck * 0.36], p3 = [sx + ck, cy - ck * 0.42];
  const l1 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), l2 = Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), d = k * (l1 + l2);
  ctx.beginPath(); ctx.moveTo(...p1);
  if (d <= l1) ctx.lineTo(p1[0] + (p2[0] - p1[0]) * d / l1, p1[1] + (p2[1] - p1[1]) * d / l1);
  else { ctx.lineTo(...p2); const e = (d - l1) / l2; ctx.lineTo(p2[0] + (p3[0] - p2[0]) * e, p2[1] + (p3[1] - p2[1]) * e); }
  ctx.lineWidth = fs * 0.12; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; if (k > 0) ctx.stroke();
  ctx.fillText(label, sx + ck + gap, cy + fs * 0.36); ctx.restore();
}
function banner(ctx, I, by) {
  const bx = 40, bw = W - 80, bh = 290;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 44); ctx.fillStyle = '#202024'; ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(236,234,228,0.10)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 44); ctx.stroke();
  if (I.logo) ctx.drawImage(I.logo, bx + 40, by + 44, 92, 92);
  font(ctx, 48, 600, 'Plex'); ctx.fillStyle = C.t1; ctx.fillText('Noah Becker möchte dir schreiben', bx + 160, by + 92);
  font(ctx, 40, 400, 'Plex'); ctx.fillStyle = C.t2;
  ctx.fillText('Hi Lena! Xyntal hat mich als', bx + 160, by + 168); ctx.fillText('iOS-Entwickler für Loopr vorgeschlagen.', bx + 160, by + 222);
}
at(K[2] - 0.04, (ctx, u, t, I) => { const a = K[2] - 0.04, press = wt(5, 2) - 0.02;
  // Einschub „94 %“: harter Schnitt hinein auf „Prozent“, harter Schnitt hinaus in eine neue Einstellung
  if (u >= N0() && u < N1()) {
    ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
    const z2 = 1 + 0.03 * (u - N0());
    ctx.save(); ctx.translate(W / 2, 1060); ctx.scale(z2, z2);
    font(ctx, 520, 800, 'Archivo', 'extra-condensed'); ctx.textAlign = 'center'; ctx.fillStyle = C.t1; ctx.fillText('94 %', 0, 180);
    ctx.restore(); ctx.textAlign = 'left';
    font(ctx, 96, 800, 'Archivo', 'extra-condensed'); ctx.fillStyle = C.t2; ctx.fillText('Passung', 80, 1440);
    return;
  }
  const c = PATH(u);
  // Benachrichtigung: Bild dunkelt ab, Banner gleitet unter der Textzone hervor und verlässt das Bild wieder nach oben
  const b0 = K[4] - 0.04 + 0.15, b1 = K[5] - 0.25;
  const din = clamp((u - (K[4] - 0.04)) / (10 * F)), dout = clamp((u - b1) / (10 * F));
  const dim = din * (1 - dout);
  shot(ctx, I.k0, c, dim > 0 ? `brightness(${lerp(1, 0.55, dim)})` : 'none');
  // Tipp auf den Knopf
  const [bx, by, bw, bh] = btnRect(c);
  const down = u >= press - 4 * F && u < press;
  if (down || u >= press) { ctx.fillStyle = '#111318'; ctx.fillRect(bx - 6, by - 6, bw + 12, bh + 12); }
  if (down && I.k0) { const sc = 0.94; ctx.drawImage(I.k0, ...P.btn, bx + bw * (1 - sc) / 2, by + bh * (1 - sc) / 2, bw * sc, bh * sc); }
  if (u >= press) dabeiDraw(ctx, bx, by, bw, clamp((u - press) / (10 * F)));
  const tx = bx + bw * 0.5, ty = by + bh + 8;
  if (u >= press - 4 * F) {
    const out = clamp((u - (press + 8 * F)) / (8 * F));
    ctx.save(); ctx.globalAlpha = 0.2 * (1 - out); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tx, ty, 30, 0, M.TAU); ctx.fill(); ctx.restore();
    const r = clamp((u - press) / (18 * F));
    if (r < 1) { ctx.save(); ctx.globalAlpha = 0.9 * (1 - r); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(tx, ty, 30 * lerp(1, 1.8, EXPO(r)), 0, M.TAU); ctx.stroke(); ctx.restore(); }
  }
  if (u >= b0 && dout < 1) {
    const kin = SLIDE(clamp((u - b0) / (14 * F))), kout = E.inCubic(dout);
    banner(ctx, I, lerp(BAND - 60, 700, kin) - kout * 420);
  }
  // Textzone: hält immer den aktuellen Satz
  if (u < wt(2, 8) - 0.04) cap(ctx, u, [['Sag,', a]].concat(toks(2, 1, ['was', 'du', 'baust.'])));
  else if (u < K[3] - 0.04) cap(ctx, u, toks(2, 8, ['Wer', 'passt.']), 190);
  else if (u < N0()) cap(ctx, u, [['Mit', K[3] - 0.04], ['Passung.', wt(3, 1) - 0.04]], 190);
  else if (u < K[4] - 0.04) cap(ctx, u, [['Wie', N1()], ['viel', wt(3, 6) - 0.04], ['Zeit.', wt(3, 7) - 0.04]], 190);
  else if (u < K[5] - 0.04) cap(ctx, u, [['Leute', K[4] - 0.04], ['finden', wt(4, 4) - 0.04], ['dich.', wt(4, 6) - 0.04]], 190);
  else if (u < wt(5, 1) - 0.04) cap(ctx, u, [['Passt?', K[5] - 0.04]], 200);
  else cap(ctx, u, toks(5, 1, ['Ein', 'Klick.']), 200); });
// Akt 3 · Match-Cut: Karte tritt zurück (8 Frames), der Knopf wächst und wandert in die Endkarte (20 Frames)
at(T.end - 0.04, (ctx, u, t, I) => { const a = T.end - 0.04, press = wt(5, 2) - 0.02;
  ctx.fillStyle = C.ground; ctx.fillRect(0, 0, W, H);
  const cA = PATH(a), [x0, y0, w0] = btnRect(cA);
  const fo = clamp((u - a) / (8 * F));
  if (fo < 1) {
    const sc = lerp(1, 0.92, fo), cx = x0 + w0 / 2, cy = y0 + w0 * 0.15;
    ctx.save(); ctx.globalAlpha = 1 - fo; ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    shot(ctx, I.k0, cA); ctx.fillStyle = '#111318'; ctx.fillRect(x0 - 6, y0 - 6, w0 + 12, w0 * (102 / 336) + 12); ctx.restore();
  }
  const m = IO(clamp((u - a) / (20 * F)));
  const drift = 1 + 0.02 * clamp((u - a - 0.7) / 3);
  const w1 = 820 * drift, x1 = (W - w1) / 2, y1 = 640 - (w1 - 820) * 0.15;
  dabeiDraw(ctx, lerp(x0, x1, m), lerp(y0, y1, m), lerp(w0, w1, m), 1);
  const e = WD[6], tx = (W - 820) / 2;
  if (u > a + 0.5) {
    words(ctx, u, [['Kostenlos', e[0][1] - 0.04]], { y: 1120, size: 170, x: tx });
    words(ctx, u, [['in', e[1][1] - 0.04], ['der', e[2][1] - 0.04], ['Beta.', e[3][1] - 0.04]], { y: 1280, size: 170, x: tx });
    font(ctx, 44, 500, 'Plex'); ctx.fillStyle = C.t2; ctx.fillText('Link im Profil · xyntal.de', tx + 4, 1380);
    font(ctx, 28, 400, 'Plex'); ctx.fillStyle = C.t3; ctx.fillText('Gezeigt: App-Demo mit Beispieldaten', tx + 4, 1450);
  } });

const GRAIN = [];
M.film({
  fonts: ['800 100px Archivo', '600 40px Plex', '500 40px Plex', '400 28px Plex'],
  images: { logo: '../_shared/fonts/logo.svg', entdecken: '../_shared/shots/m_entdecken.png', k0: '../_shared/shots/m_klick_0.png', k2: '../_shared/shots/m_klick_2.png' },
  hits: [], samples: 1,          // keine Mehrfachbelichtung: harte Schnitte, keine Geisterbilder
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
