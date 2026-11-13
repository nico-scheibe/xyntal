// Text-Reel-Vorlage für Xyntal (9:16): eine Folge großer Schrift-Karten auf dem Beat.
// cardsFilm({ header, progress, cards: [{ at, label, fat, thin, sub, size, counter }], end: { at, line } })
//   counter: { from, to, dur, suffix, sub }   zählt groß im Logo-Verlauf hoch
import * as M from '../_shared/motion.js';
import { C, setFont, background, gradStroke, endCard } from '../_shared/chat.js';

const { W, H, FORMAT, E, prog, springU, SPRING, clamp } = M;
const DISPLAY = 'Archivo', MONO = 'JBMono';

const fmt = (n) => Math.round(n).toLocaleString('de-DE');

// Misst die Zeilen einer Karte und verkleinert, bis alles in die Breite passt.
function fitCard(ctx, card, maxW) {
  let size = card.size || 170;
  for (let i = 0; i < 30; i++) {
    let wMax = 0;
    setFont(ctx, size, 800, DISPLAY, 'extra-condensed');
    String(card.fat || '').split('\n').forEach((l) => { wMax = Math.max(wMax, ctx.measureText(l).width); });
    if (card.thin) {
      setFont(ctx, size * 0.86, 200, DISPLAY, 'expanded');
      String(card.thin).split('\n').forEach((l) => { wMax = Math.max(wMax, ctx.measureText(l).width + size * 0.22); });
    }
    if (wMax <= maxW) break;
    size *= 0.95;
  }
  return size;
}

function cardHeight(card, size) {
  const n = (v) => String(v || '').split('\n').filter(Boolean).length;
  let h = 30 + n(card.fat) * size * 0.86 + n(card.thin) * size * 0.86 * 0.92 + n(card.sub) * size * 0.38 * 1.15;
  if (card.counter) h += 330 * 0.9 + 30 + (card.counter.sub ? size * 0.5 : 0);
  return h;
}

function drawCard(ctx, card, u, x, y, size, outK) {
  const lines = [];
  String(card.fat || '').split('\n').filter(Boolean).forEach((l) => lines.push({ l, kind: 'fat' }));
  String(card.thin || '').split('\n').filter(Boolean).forEach((l) => lines.push({ l, kind: 'thin' }));
  String(card.sub || '').split('\n').filter(Boolean).forEach((l) => lines.push({ l, kind: 'sub' }));
  ctx.save();
  ctx.translate(0, -outK * H * 0.22);
  ctx.globalAlpha = 1 - clamp(outK * 1.6);
  if (card.label) {
    const k = springU(u, card.at, SPRING.snappy);
    ctx.globalAlpha *= clamp(k * 1.5);
    ctx.fillStyle = gradStroke(ctx, x, x + 52); ctx.fillRect(x, y - 22, 52 * k, 5);
    setFont(ctx, 34, 500, MONO); ctx.fillStyle = C.t3;
    ctx.fillText(card.label.toUpperCase(), x + 72, y - 10);
    ctx.globalAlpha = 1 - clamp(outK * 1.6);
  }
  let yy = y + 30;
  lines.forEach((ln, i) => {
    const k = springU(u, card.at + 0.12 + i * 0.16, ln.kind === 'thin' ? SPRING.gentle : SPRING.bouncy);
    if (k <= 0) return;
    let fs, w, st, dx, lh;
    if (ln.kind === 'fat') { fs = size; w = 800; st = 'extra-condensed'; dx = 0; lh = size * 0.86; }
    else if (ln.kind === 'thin') { fs = size * 0.86; w = 200; st = 'expanded'; dx = size * 0.22; lh = fs * 0.92; }
    else { fs = size * 0.38; w = 700; st = 'extra-condensed'; dx = size * 0.24; lh = fs * 1.15; }
    const base = yy + fs * 0.84;
    ctx.save();
    ctx.globalAlpha *= clamp(k * 1.5);
    ctx.translate(x + dx, base + (1 - k) * 90);
    if (ln.kind === 'fat') ctx.scale(1, 1 + (1 - k) * 0.25);
    setFont(ctx, fs, w, DISPLAY, st);
    ctx.fillStyle = card.warn && ln.kind !== 'sub' ? C.t1 : C.t1;
    ctx.fillText(ln.l, 0, 0);
    ctx.restore();
    yy += lh;
  });
  // Zähler
  if (card.counter) {
    const c = card.counter;
    const k = E.outCubic(prog(u, card.at + 0.2, card.at + 0.2 + (c.dur || 4)));
    const val = c.from + (c.to - c.from) * k;
    const str = fmt(val) + (c.suffix || '');
    let fs = 330;
    setFont(ctx, fs, 200, DISPLAY, 'expanded');
    const final = fmt(c.to) + (c.suffix || '');
    while (ctx.measureText(final).width > W - FORMAT.safe.x - 60 && fs > 120) { fs -= 8; setFont(ctx, fs, 200, DISPLAY, 'expanded'); }
    const pop = springU(u, card.at + 0.2 + (c.dur || 4), SPRING.bouncy);
    const by = yy + fs * 0.9;
    ctx.save();
    ctx.translate(x - 10, by);
    const sc = 1 + 0.06 * M.wobble((u - card.at - 0.2 - (c.dur || 4)) * 0.5, 2, 5);
    ctx.scale(sc, sc);
    ctx.fillStyle = gradStroke(ctx, 0, ctx.measureText(final).width);
    ctx.fillText(str, 0, 0);
    ctx.restore();
    yy = by + 30;
    if (c.sub) {
      const sk = clamp(pop * 1.4);
      ctx.globalAlpha *= sk;
      setFont(ctx, size * 0.45, 700, DISPLAY, 'extra-condensed'); ctx.fillStyle = C.t1;
      ctx.fillText(c.sub, x + 8, yy + size * 0.45 + (1 - sk) * 40);
    }
  }
  ctx.restore();
}

export function cardsFilm(SCRIPT) {
  const cards = SCRIPT.cards;
  const HITS = [];
  cards.forEach((c, i) => {
    HITS.push([c.at, 'card ' + i, i === 0 ? 'thud' : 'whoosh', i === 0 ? {} : { len: 0.45 }]);
    if (c.counter) {
      HITS.push([c.at + 0.2 + (c.counter.dur || 4), 'counter lands', 'impact']);
      HITS.push([c.at + 0.25, 'counter runs', 'type', { len: (c.counter.dur || 4) * 0.4 }]);
    }
  });
  HITS.push([SCRIPT.end.at + 0.5, 'end', 'bell', { pitch: 'E6' }]);
  const sizes = [];

  M.film({
    fonts: [`800 100px ${DISPLAY}`, `200 100px ${DISPLAY}`, `400 40px Plex`, `500 30px ${MONO}`],
    images: { logo: '../_shared/fonts/logo.svg' },
    hits: HITS,
    samples: 8,
    draw(ctx, u, t, IMG) {
      const s = FORMAT.safe;
      background(ctx, t, SCRIPT.seed || 2);
      if (!sizes.length) cards.forEach((c) => sizes.push(fitCard(ctx, c, s.w - 20)));
      // Kopfzeile mit Fortschritt (z. B. Tag 1 / 30)
      if (SCRIPT.header) {
        setFont(ctx, 32, 500, MONO); ctx.fillStyle = C.t2;
        ctx.fillText(SCRIPT.header.toUpperCase(), s.x, s.y - 100);
        if (SCRIPT.progress != null) {
          const bw = s.w, bx = s.x, by = s.y - 70;
          ctx.fillStyle = 'rgba(236,234,228,.14)'; ctx.fillRect(bx, by, bw, 6);
          const pk = E.outCubic(prog(u, 0.3, 2.5));
          ctx.fillStyle = gradStroke(ctx, bx, bx + bw); ctx.fillRect(bx, by, bw * SCRIPT.progress * pk, 6);
        }
      }
      const zoneTop = s.y - 20, zoneH = s.y + s.h - zoneTop;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i], next = cards[i + 1];
        const endAt = next ? next.at : SCRIPT.end.at;
        if (u < c.at - 0.01 && i > 0) continue;
        const outK = E.inCubic(prog(u, endAt - 0.05, endAt + 0.35));
        if (outK >= 1) continue;
        const y0 = zoneTop + (zoneH - cardHeight(c, sizes[i])) * 0.45;
        drawCard(ctx, c, Math.max(u, i === 0 ? c.at + 2 : u), s.x, y0, sizes[i], outK);
      }
      endCard(ctx, u, SCRIPT.end.at, SCRIPT.end.line, IMG);
    },
  });
}
