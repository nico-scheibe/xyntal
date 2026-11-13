// Problem-zu-Produkt-Reel (9:16): eine Folge von Szenen, jede ersetzt die vorige.
//   chat: Sprechblasen, die nacheinander erscheinen (das Problem)
//   text: große Schrift (Zuspitzung, Wendepunkt)
//   shot: echte App-Ansicht mit Kamerafahrt und Untertitel pro Kamerapunkt (die Lösung)
// storyFilm({ images: {name: path}, scenes: [...], end: { at, line } })
//   { at, type: 'chat', items: [{ at, text, right, name }] }
//   { at, type: 'text', label, fat, thin, sub, size }
//   { at, type: 'shot', img, keys: [{ at, cam: [cx, cy, sichtbareBreite], cap: { fat, thin } }] }
import * as M from '../_shared/motion.js';
import { C, setFont, wrap, background, fatThin, endCard } from '../_shared/chat.js';

const { W, H, FORMAT, E, prog, lerp, springU, springKeys, SPRING, clamp, rrect } = M;

function bubbleScene(ctx, sc, u) {
  const s = FORMAT.safe;
  let y = s.y + 40;
  sc.items.forEach((it, i) => {
    const k = it.at <= 0.3 ? 1 : springU(u, it.at, SPRING.bouncy);
    const fs = it.size || 76, lh = fs * 1.25, pad = fs * 0.6;
    setFont(ctx, fs, 500, 'Plex');
    const lines = wrap(ctx, it.text, s.w - pad * 2 - 60);
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const h = lines.length * lh + pad * 1.3;
    if (k > 0) {
      const x = it.right ? W - 72 - w : s.x;
      ctx.save();
      ctx.globalAlpha *= clamp(k * 2);
      const ox = it.right ? x + w : x, oy = y + h;
      ctx.translate(ox, oy); ctx.scale(lerp(0.5, 1, k), lerp(0.5, 1, k)); ctx.translate(-ox, -oy);
      if (it.name) { setFont(ctx, 30, 500, 'JBMono'); ctx.fillStyle = C.t3; ctx.textAlign = it.right ? 'right' : 'left'; ctx.fillText(it.name.toUpperCase(), it.right ? x + w - 8 : x + 8, y - 20); ctx.textAlign = 'left'; }
      rrect(ctx, x, y, w, h, Math.min(60, h / 2)); ctx.fillStyle = it.right ? C.t1 : C.bg3; ctx.fill();
      setFont(ctx, fs, 500, 'Plex'); ctx.fillStyle = it.right ? C.bg : C.t1;
      lines.forEach((l, j) => ctx.fillText(l, x + pad, y + pad * 0.65 + fs * 0.85 + j * lh));
      ctx.restore();
    }
    y += h + 90;
  });
}

function textScene(ctx, sc, u) {
  const s = FORMAT.safe;
  const k = sc.at <= 0.3 ? 1 : springU(u, sc.at + 0.25, SPRING.gentle);
  const size = sc.size || 190;
  const n = (v) => String(v || '').split('\n').filter(Boolean).length;
  const h = n(sc.fat) * size * 0.86 + n(sc.thin) * size * 0.8 + n(sc.sub) * size * 0.42;
  const y = s.y - 20 + (s.h - h) * 0.42;
  if (sc.label) {
    ctx.save(); ctx.globalAlpha *= clamp(k * 1.5);
    setFont(ctx, 34, 500, 'JBMono'); ctx.fillStyle = C.t3; ctx.fillText(sc.label.toUpperCase(), s.x, y - 10);
    ctx.restore();
  }
  fatThin(ctx, sc, s.x, y + 20, size, clamp(k));
}

function shotScene(ctx, sc, u, IMG) {
  const s = FORMAT.safe;
  const img = IMG[sc.img];
  const k = springU(u, sc.at + 0.2, SPRING.gentle);
  const ax = 40, aw = W - 80, ay = s.y - 70, ah = sc.h || 960;
  const y = ay + (1 - clamp(k)) * 120;
  const cam = springKeys(u, sc.keys.map((q) => [q.at, q.cam]), SPRING.gentle);
  const [cx, cy, vw] = cam;
  const sc2 = aw / vw;
  ctx.save();
  ctx.globalAlpha *= clamp(k * 2);
  rrect(ctx, ax, y, aw, ah, 36); ctx.fillStyle = C.bg2; ctx.fill();
  rrect(ctx, ax, y, aw, ah, 36); ctx.clip();
  ctx.translate(ax + aw / 2, y + ah / 2); ctx.scale(sc2, sc2); ctx.translate(-cx, -cy);
  if (img) ctx.drawImage(img, 0, 0);
  ctx.restore();
  rrect(ctx, ax, y, aw, ah, 36); ctx.strokeStyle = 'rgba(236,234,228,.16)'; ctx.lineWidth = 2; ctx.stroke();
  setFont(ctx, 26, 500, 'JBMono'); ctx.fillStyle = C.t3;
  ctx.fillText('XYNTAL-APP · DEMO MIT BEISPIELDATEN', ax + 4, y - 26);
  sc.keys.forEach((q, i) => {
    if (!q.cap) return;
    const nk = sc.keys.slice(i + 1).find((q2) => q2.cap);
    const next = nk ? nk.at : Infinity;
    const ck = springU(u, q.at + 0.1, SPRING.bouncy);
    const o = E.inCubic(prog(u, next - 0.3, next));
    if (ck <= 0 || o >= 1) return;
    ctx.save(); ctx.globalAlpha *= 1 - o; ctx.translate(0, -o * 40);
    fatThin(ctx, q.cap, s.x, y + ah + 46, q.cap.size || 112, clamp(ck));
    ctx.restore();
  });
}

export function storyFilm(SCRIPT) {
  const scenes = SCRIPT.scenes;
  const imgs = Object.assign({ logo: '../_shared/fonts/logo.svg' }, SCRIPT.images || {});
  M.film({
    fonts: ['800 100px Archivo', '200 100px Archivo', '500 40px Plex', '500 30px JBMono'],
    images: imgs,
    hits: [],
    samples: 8,
    draw(ctx, u, t, IMG) {
      background(ctx, t, SCRIPT.seed || 3);
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i];
        const next = scenes[i + 1] ? scenes[i + 1].at : SCRIPT.end.at;
        if (i > 0 && u < sc.at - 0.01) continue;
        // gleicher Screenshot wie die vorige Szene: kein Wechsel-Effekt, die Kamera fährt weiter
        const out = E.inCubic(prog(u, next - 0.05, next + 0.35));
        if (out >= 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - out;
        ctx.translate(0, -out * 260);
        if (sc.type === 'chat') bubbleScene(ctx, sc, u);
        else if (sc.type === 'text') textScene(ctx, sc, u);
        else if (sc.type === 'shot') shotScene(ctx, sc, u, IMG);
        ctx.restore();
      }
      endCard(ctx, u, SCRIPT.end.at, SCRIPT.end.line, IMG);
    },
  });
}
