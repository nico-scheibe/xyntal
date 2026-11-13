// R07 · Produkt: So findet Xyntal deine Leute (Säule E). Echte Demo-Ansicht, Beispieldaten.
import * as M from '../_shared/motion.js';
import { C, setFont, background, fatThin, endCard, gradStroke } from '../_shared/chat.js';
import T from './timing.js';
const K = T.cards;

const { W, H, FORMAT, E, prog, springU, springKeys, SPRING, clamp, rrect } = M;

const HITS = [
  [4, 'shot in', 'whoosh', { len: 0.5 }],
  [4.4, 'shot lands', 'thud'],
  [7, 'zoom Noah', 'whoosh', { len: 0.4, from: 600, to: 2400 }],
  [7.5, 'caption 1', 'pop', { pitch: 'B5' }],
  [11, 'pan Emre', 'whoosh', { len: 0.4, from: 2400, to: 900 }],
  [11.5, 'caption 2', 'pop', { pitch: 'D6' }],
  [15, 'tilt Zeit', 'tick'],
  [15.5, 'caption 3', 'pop', { pitch: 'E6' }],
  [19, 'statement', 'impact'],
  [25, 'end', 'bell', { pitch: 'E6' }],
];
const END = T.end;
// Kamera über dem Screenshot (Bildpixel): [Mitte x, Mitte y, sichtbare Breite]
const CAM = [[K[1], [1000, 820, 1450]], [K[2] - 0.2, [702, 900, 600]], [K[3] - 0.2, [1198, 900, 600]], [K[4] - 0.2, [1198, 1230, 560]]];
const CAPS = [
  [K[2], K[3], { fat: '94 % Passung.', thin: 'Mit Grund.' }],
  [K[3], K[4], { fat: 'Was jemand sucht.', thin: 'Vorher.' }],
  [K[4], K[5], { fat: 'Wie viel Zeit', thin: 'jemand hat.' }],
];

M.film({
  fonts: ['800 100px Archivo', '200 100px Archivo', '400 40px Plex', '500 30px JBMono'],
  images: { logo: '../_shared/fonts/logo.svg', shot: '../_shared/shots/demo_entdecken.png' },
  hits: HITS,
  samples: 8,
  draw(ctx, u, t, IMG) {
    const s = FORMAT.safe;
    background(ctx, t, 4);
    // Hook ab Frame 0
    const hookOut = E.inCubic(prog(u, K[1] - 0.3, K[1] + 0.2));
    if (hookOut < 1) {
      ctx.save(); ctx.translate(0, -hookOut * 300); ctx.globalAlpha = 1 - hookOut;
      fatThin(ctx, { fat: 'Du suchst', thin: 'jemanden,\nder mitbaut?' }, s.x, s.y + 150, 165, 1);
      ctx.restore();
    }
    // Screenshot mit Kamerafahrt
    const sk = springU(u, K[1], SPRING.gentle);
    const outK = E.inCubic(prog(u, K[5] - 0.3, K[5] + 0.2));
    if (sk > 0 && outK < 1 && IMG.shot) {
      const ax = 40, aw = W - 80, ay = s.y - 70, ah = 900;
      const y = ay + (1 - sk) * H * 0.6 - outK * H * 0.5;
      const [cx, cy, vw] = springKeys(u, CAM, SPRING.gentle);
      const sc = aw / vw;
      ctx.save();
      ctx.globalAlpha = 1 - outK;
      rrect(ctx, ax, y, aw, ah, 36); ctx.fillStyle = C.bg2; ctx.fill();
      rrect(ctx, ax, y, aw, ah, 36); ctx.clip();
      ctx.translate(ax + aw / 2, y + ah / 2); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
      ctx.drawImage(IMG.shot, 0, 0);
      ctx.restore();
      ctx.save(); ctx.globalAlpha = 1 - outK;
      rrect(ctx, ax, y, aw, ah, 36); ctx.strokeStyle = 'rgba(236,234,228,.16)'; ctx.lineWidth = 2; ctx.stroke();
      // Ehrlich: Beispieldaten
      setFont(ctx, 26, 500, 'JBMono'); ctx.fillStyle = C.t3;
      ctx.fillText('XYNTAL-APP · DEMO MIT BEISPIELDATEN', ax + 4, y - 26);
      ctx.restore();
      // Untertitel unter dem Bild
      CAPS.forEach(([a, b, cap]) => {
        const k = springU(u, a, SPRING.bouncy);
        const o = E.inCubic(prog(u, b - 0.3, b));
        if (k <= 0 || o >= 1) return;
        ctx.save(); ctx.globalAlpha = 1 - o; ctx.translate(0, -o * 40);
        fatThin(ctx, cap, s.x, y + ah + 50, 118, clamp(k));
        ctx.restore();
      });
    }
    // Aussage
    const st = springU(u, K[5], SPRING.gentle);
    if (st > 0) fatThin(ctx, { fat: 'Bedingungen', thin: 'zuerst.', sub: 'Anteile, Geld oder Nebenprojekt.\nBevor jemand Zeit investiert.' }, s.x, s.y + 200, 210, clamp(st));
    endCard(ctx, u, END, 'Die Beta ist kostenlos. Bewerben über den Link im Profil.', IMG);
  },
});
