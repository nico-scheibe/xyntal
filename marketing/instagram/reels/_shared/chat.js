// Chat-POV-Vorlage für Xyntal-Reels (9:16). Reine Funktion der Zeit: alles wird aus u (Beats) berechnet.
// Ein Film ruft chatFilm(SCRIPT) auf. SCRIPT:
//   hook:  { label, fat, thin }           oben, ab Frame 0 sichtbar
//   contact: 'Max · hat eine Idee'       Kopfzeile des Chats
//   msgs:  [[beat, 'l'|'r', 'Text'], ...] l = Gegenüber, r = du
//   punch: { at, fat, thin, sub }        Pointe als große Schrift
//   end:   { at, line }                  Endkarte mit @xyntal
import * as M from '../_shared/motion.js';

const { W, H, FORMAT, E, prog, lerp, springU, SPRING, wobble, fill, rrect, clamp } = M;

export const C = {
  bg: '#1F1F21', bg2: '#262629', bg3: '#2E2E32', bg4: '#3A3A3F',
  t1: '#ECEAE4', t2: '#B9B7B0', t3: '#918F89',
  pu: '#B36BFF', bl: '#3A8AFF', cy: '#3FE0F0',
};
const DISPLAY = 'Archivo', TEXT = 'Plex', MONO = 'JBMono';

export function setFont(ctx, size, weight, family, stretch = 'normal') {
  ctx.font = `${Math.round(weight)} ${Math.round(size)}px ${family}`;
  ctx.fontStretch = stretch;
}
export function wrap(ctx, str, maxW) {
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

// Hintergrund: Anthrazit, ein weiches Licht im Logo-Verlauf, das langsam wandert, feines Korn.
export function background(ctx, t, seed = 1) {
  fill(ctx, C.bg);
  const lights = [[C.bl, 0.95, 0.12, 0.55], [C.pu, 0.05, 0.92, 0.4]];
  lights.forEach(([col, fx, fy, a], i) => {
    const x = W * (fx + 0.04 * Math.sin(t * 0.35 + i * 2 + seed));
    const y = H * (fy + 0.03 * Math.cos(t * 0.3 + i + seed));
    const r = W * 0.9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const [R, G, B] = M.hexRgb(col);
    g.addColorStop(0, `rgba(${R},${G},${B},${0.2 * a})`);
    g.addColorStop(1, `rgba(${R},${G},${B},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });
}

export function gradStroke(ctx, x0, x1) {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, C.pu); g.addColorStop(0.5, C.bl); g.addColorStop(1, C.cy);
  return g;
}

// Zwei Zeilen im Stil der Startseite: schmal und fett, darunter breit und dünn.
export function fatThin(ctx, { fat, thin, sub }, x, y, size, k = 1, color = C.t1) {
  ctx.save();
  ctx.globalAlpha *= clamp(k * 1.4);
  const dy = (1 - k) * 60;
  setFont(ctx, size, 800, DISPLAY, 'extra-condensed');
  ctx.fillStyle = color; ctx.textBaseline = 'alphabetic';
  let yy = y + size * 0.84 + dy;
  const lines = [];
  for (const l of String(fat).split('\n')) { ctx.fillText(l, x, yy); lines.push(yy); yy += size * 0.86; }
  if (thin) {
    const ts = size * 0.86;
    setFont(ctx, ts, 200, DISPLAY, 'expanded');
    yy += ts * 0.02;
    for (const l of String(thin).split('\n')) { ctx.fillText(l, x + size * 0.22, yy); yy += ts * 0.9; }
  }
  if (sub) {
    const ss = size * 0.36;
    setFont(ctx, ss, 700, DISPLAY, 'extra-condensed');
    yy += ss * 0.15 - size * 0.2 + ss;
    for (const l of String(sub).split('\n')) { ctx.fillText(l, x + size * 0.24, yy); yy += ss * 1.1; }
  }
  ctx.restore();
  return yy;
}

export function logo(ctx, IMG, x, y, s) { if (IMG.logo) ctx.drawImage(IMG.logo, x, y, s, s); }

// Endkarte: Logo, @xyntal als Pille, eine Zeile Text.
export function endCard(ctx, u, at, line, IMG) {
  const s = FORMAT.safe;
  const k = springU(u, at, SPRING.gentle);
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp(k * 1.5);
  ctx.fillStyle = C.bg; ctx.globalAlpha = clamp(k * 2.5); ctx.fillRect(0, 0, W, H); ctx.globalAlpha = clamp(k * 1.5);
  const cy = H * 0.42;
  const ls = 150;
  const lk = springU(u, at + 0.25, SPRING.bouncy);
  ctx.save(); ctx.translate(W / 2, cy - 160); ctx.scale(lk, lk); logo(ctx, IMG, -ls / 2, -ls / 2, ls); ctx.restore();
  const pk = springU(u, at + 0.5, SPRING.gentle);
  setFont(ctx, 92, 700, DISPLAY, 'normal');
  const label = '@xyntal';
  const tw = ctx.measureText(label).width;
  const pw = tw + 110, ph = 150, px = (W - pw) / 2, py = cy + 10 + (1 - pk) * 60;
  ctx.globalAlpha = clamp(pk * 1.5);
  rrect(ctx, px, py, pw, ph, ph / 2); ctx.fillStyle = C.t1; ctx.fill();
  ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, py + ph / 2 + 32);
  const lk2 = springU(u, at + 0.9, SPRING.gentle);
  ctx.globalAlpha = clamp(lk2 * 1.5);
  setFont(ctx, 46, 400, TEXT);
  ctx.fillStyle = C.t2;
  wrap(ctx, line, s.w - 40).forEach((l, i) => ctx.fillText(l, W / 2, py + ph + 110 + i * 64 + (1 - lk2) * 30));
  ctx.textAlign = 'left';
  ctx.restore();
}

export function chatFilm(SCRIPT) {
  const HITS = [];
  SCRIPT.msgs.forEach(([b, side], i) => {
    if (side === 'd') { HITS.push([b, 'divider ' + i, 'whoosh', { len: 0.5 }]); return; }
    if (side === 'l') HITS.push([b - 0.9, 'typing ' + i, 'type', { len: 0.35 }]);
    HITS.push([b, 'msg ' + i, 'pop', { pitch: side === 'l' ? 'E5' : 'B5' }]);
  });
  HITS.push([SCRIPT.punch.at, 'punch', 'impact']);
  HITS.push([SCRIPT.end.at + 0.5, 'end', 'bell', { pitch: 'E6' }]);

  const BUB = { font: 58, lh: 76, padX: 46, padY: 36, gap: 28, maxW: 820 };
  let LAYOUT = null;
  function measure(ctx) {
    setFont(ctx, BUB.font, 400, TEXT);
    let y = 0;
    LAYOUT = SCRIPT.msgs.map(([b, side, str]) => {
      if (side === 'd') { const item = { b, side, lines: [str], w: 0, h: 90, y: y + 10 }; y += 110 + BUB.gap; return item; }
      const lines = wrap(ctx, str, BUB.maxW - BUB.padX * 2);
      const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + BUB.padX * 2;
      const h = lines.length * BUB.lh + BUB.padY * 2 - (BUB.lh - BUB.font) + 4;
      const item = { b, side, lines, w, h, y };
      y += h + BUB.gap;
      return item;
    });
  }

  function hook(ctx, u, top) {
    const s = FORMAT.safe;
    setFont(ctx, 30, 500, MONO);
    ctx.fillStyle = C.t3;
    const label = SCRIPT.hook.label || 'POV';
    ctx.fillText(label.toUpperCase().split('').join(' '), s.x + 70, top + 30);
    ctx.fillStyle = gradStroke(ctx, s.x, s.x + 52); ctx.fillRect(s.x, top + 18, 52, 5);
    return fatThin(ctx, SCRIPT.hook, s.x, top + 60, SCRIPT.hook.size || 120, 1);
  }

  function chat(ctx, u, top, bottom, dim) {
    const s = FORMAT.safe;
    const x0 = s.x, x1 = W - 72;
    // Kopfzeile des Chats
    ctx.save();
    ctx.globalAlpha = 1 - dim;
    ctx.strokeStyle = 'rgba(236,234,228,.12)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x1, top); ctx.stroke();
    const av = 64;
    ctx.fillStyle = C.bg4; ctx.beginPath(); ctx.arc(x0 + av / 2, top + 30 + av / 2, av / 2, 0, M.TAU); ctx.fill();
    setFont(ctx, 30, 600, TEXT); ctx.fillStyle = C.t1; ctx.textAlign = 'center';
    ctx.fillText((SCRIPT.contact || '?')[0], x0 + av / 2, top + 30 + av / 2 + 11); ctx.textAlign = 'left';
    setFont(ctx, 36, 600, TEXT); ctx.fillStyle = C.t1;
    ctx.fillText(SCRIPT.contact.split(' · ')[0], x0 + av + 24, top + 30 + 30);
    setFont(ctx, 26, 400, MONO); ctx.fillStyle = C.t3;
    ctx.fillText(SCRIPT.contact.split(' · ')[1] || 'online', x0 + av + 24, top + 30 + 68);
    const chatTop = top + 30 + av + 44;

    // Scrollen: die neueste Nachricht bleibt im sichtbaren Bereich.
    const visH = bottom - chatTop;
    let scroll = 0, prev = 0;
    LAYOUT.forEach((m) => {
      const need = Math.max(prev, m.y + m.h - visH);
      scroll += (need - prev) * springU(u, m.b - (m.side === 'l' ? 1.0 : 0.2), SPRING.snappy);
      prev = need;
    });
    ctx.beginPath(); ctx.rect(0, chatTop - 10, W, visH + 20); ctx.clip();

    LAYOUT.forEach((m, i) => {
      const k = springU(u, m.b, SPRING.bouncy);
      const isL = m.side === 'l';
      // Tippen-Anzeige vor Nachrichten des Gegenübers
      if (isL) {
        const tp = prog(u, m.b - 0.9, m.b - 0.85) * (1 - prog(u, m.b - 0.05, m.b));
        if (tp > 0 && k <= 0.01) {
          const ty = chatTop + m.y - scroll;
          ctx.globalAlpha = tp * (1 - dim);
          rrect(ctx, x0, ty, 170, 100, 50); ctx.fillStyle = C.bg3; ctx.fill();
          for (let d = 0; d < 3; d++) {
            const ph = Math.max(0, Math.sin((u * 4 - d * 0.6) * Math.PI));
            ctx.fillStyle = C.t3; ctx.beginPath(); ctx.arc(x0 + 50 + d * 35, ty + 50 - ph * 9, 11, 0, M.TAU); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      }
      if (k <= 0) return;
      const y = chatTop + m.y - scroll;
      if (m.side === 'd') {
        ctx.save(); ctx.globalAlpha = clamp(k * 2) * (1 - dim);
        setFont(ctx, 30, 500, MONO); ctx.fillStyle = C.t3; ctx.textAlign = 'center';
        const lbl = m.lines[0].toUpperCase();
        const tw = ctx.measureText(lbl).width;
        ctx.fillText(lbl, W / 2, y + 56);
        ctx.fillStyle = 'rgba(236,234,228,.18)';
        const half = (x1 - x0 - tw) / 2 - 30;
        ctx.fillRect(x0, y + 46, half * k, 2); ctx.fillRect(x1 - half * k, y + 46, half * k, 2);
        ctx.restore(); return;
      }
      const x = isL ? x0 : x1 - m.w;
      ctx.save();
      ctx.globalAlpha = clamp(k * 2) * (1 - dim);
      const ox = isL ? x : x + m.w, oy = y + m.h;
      ctx.translate(ox, oy); ctx.scale(lerp(0.6, 1, k), lerp(0.6, 1, k)); ctx.translate(-ox, -oy);
      rrect(ctx, x, y, m.w, m.h, 44);
      ctx.fillStyle = isL ? C.bg3 : C.t1; ctx.fill();
      setFont(ctx, BUB.font, 400, TEXT);
      ctx.fillStyle = isL ? C.t1 : C.bg;
      m.lines.forEach((l, j) => ctx.fillText(l, x + BUB.padX, y + BUB.padY + BUB.font * 0.82 + j * BUB.lh));
      ctx.restore();
    });
    ctx.restore();
  }

  // Intro im Vollbild vor dem Chat: Sprechblasen und große Schrift, ab Frame 0 sichtbar.
  function intro(ctx, u) {
    const s = FORMAT.safe;
    SCRIPT.intro.items.forEach((it) => {
      const k = it.at <= 0.3 ? 1 : springU(u, it.at, SPRING.bouncy);
      if (k <= 0) return;
      const y = s.y + (it.y || 0);
      if (it.bubble) {
        const fs = it.size || 84, lh = fs * 1.25, pad = fs * 0.62;
        setFont(ctx, fs, 500, TEXT);
        const lines = wrap(ctx, it.bubble, s.w - pad * 2 - 40);
        const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
        const h = lines.length * lh + pad * 1.4;
        const x = it.right ? W - 72 - w : s.x;
        ctx.save();
        ctx.globalAlpha = clamp(k * 2);
        const ox = it.right ? x + w : x, oy = y + h;
        ctx.translate(ox, oy); ctx.scale(lerp(0.5, 1, k), lerp(0.5, 1, k)); ctx.translate(-ox, -oy);
        rrect(ctx, x, y, w, h, Math.min(64, h / 2)); ctx.fillStyle = it.right ? C.t1 : C.bg3; ctx.fill();
        ctx.fillStyle = it.right ? C.bg : C.t1;
        lines.forEach((l, j) => ctx.fillText(l, x + pad, y + pad * 0.7 + fs * 0.85 + j * lh));
        if (it.name) { setFont(ctx, 30, 500, MONO); ctx.fillStyle = C.t3; ctx.fillText(it.name.toUpperCase(), x + 8, y - 22); }
        ctx.restore();
      } else {
        fatThin(ctx, it, s.x, y, it.size || 150, clamp(k));
      }
    });
  }

  M.film({
    fonts: [`800 100px ${DISPLAY}`, `200 100px ${DISPLAY}`, `400 40px ${TEXT}`, `600 40px ${TEXT}`, `500 30px ${MONO}`],
    images: { logo: '../_shared/fonts/logo.svg' },
    hits: HITS,
    samples: 6,
    draw(ctx, u, t, IMG) {
      if (!LAYOUT) measure(ctx);
      background(ctx, t);
      const s = FORMAT.safe;
      const pk = springU(u, SCRIPT.punch.at, SPRING.gentle);
      let dim = clamp(pk), shift = 0;
      if (SCRIPT.intro) {
        const iu = SCRIPT.intro.until;
        const out = E.inCubic(prog(u, iu - 0.2, iu + 0.3));
        if (out < 1) { ctx.save(); ctx.globalAlpha = 1 - out; ctx.translate(0, -out * 220); intro(ctx, u); ctx.restore(); }
        const ik = springU(u, iu + 0.35, SPRING.gentle);
        if (ik <= 0) { endCard(ctx, u, SCRIPT.end.at, SCRIPT.end.line, IMG); return; }
        dim = Math.max(dim, 1 - clamp(ik * 1.5)); shift = (1 - clamp(ik)) * 120;
      }
      // Hook oben (ohne Intro ab Frame 0)
      ctx.save();
      ctx.globalAlpha = 1 - dim; ctx.translate(0, shift);
      const hookBottom = hook(ctx, u, s.y - 120);
      ctx.restore();
      ctx.save(); ctx.translate(0, shift);
      chat(ctx, u, hookBottom + 10, s.y + s.h, dim);
      ctx.restore();
      if (pk > 0) {
        const p = SCRIPT.punch;
        ctx.save();
        
        ctx.restore();
        fatThin(ctx, p, s.x, H * 0.27, p.size || 150, clamp(pk));
      }
      endCard(ctx, u, SCRIPT.end.at, SCRIPT.end.line, IMG);
    },
  });
}
