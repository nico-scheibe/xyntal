// Xyntal – Story-Bild für Instagram: die Xyntal-Karte als PNG in 1080 × 1920 (9:16).
// Für die eigene Seite xyntal.de/name (u.js) und den Karten-Editor /meine-karte (meine-karte.js).
//
// Aufbau: Markengrund #1C1C1C, darauf die Karte (so wie xcard.js/xcard.css/banners.css sie zeigen,
// als Standbild – Hover-Effekte aus card-fx.js und Animationen bleiben weg), darunter das Feld
// „xyntal.de/name“ (dort legt man den Link-Sticker hin) und „@xyntal“ in Blau (#8FB8FF, einzige Akzentfarbe).
// Oben 250 px und unten 340 px bleiben frei: Dort blendet Instagram Fortschrittsbalken, Profilname
// und Antwortfeld ein.
//
// Bilder: Profilbild und eigenes Banner liegen in privaten Buckets. Gezeichnet wird nur, was als
// Blob geladen ist (fetch mit CORS bzw. blob:/data:), so bleibt die Zeichenfläche sauber und lässt
// sich als PNG speichern. Klappt das nicht, zeigt die Karte die Initiale bzw. den Farbverlauf.
// Videos und GIFs: das erste Bild.
//
// Teilen: am Handy über navigator.share({ files }) (Teilen-Menü → Instagram), sonst als Download.
// Das Bild wird vorab erzeugt, damit navigator.share beim Tippen sofort läuft – iOS Safari und
// Chrome erlauben das Teilen nur kurz nach dem Tippen.
(() => {
  const W = 1080, H = 1920, SAFE_TOP = 250, SAFE_BOTTOM = 340;
  const BRAND = { bg: "#1C1C1C", text: "#ECEAE4", line: "rgba(236, 234, 228, 0.28)", key: "#8FB8FF" };
  const SERIF = '"Source Serif 4", Georgia, "Times New Roman", serif';
  const SANS = '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);

  // ---------- Karte: dieselben Regeln wie xcard.js ----------
  const THEMES = {
    aurora: ["#B95CFF", "#FF5FD2", "#5B8CFF", "#3FD8FF"], sunset: ["#FFB547", "#FF6A5C", "#FF3D8B", "#B95CFF"],
    ocean: ["#34D399", "#3FD8FF", "#5B8CFF", "#6D5BFF"], mono: ["#FFFFFF", "#C9C9D1", "#7A7A86", "#E4E4E7"],
  };
  const BLOCKS = ["place", "pitch", "skills", "stats", "looking"];
  const LEVELS = ["Einsteiger", "Fortgeschritten", "Profi"];
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
  // Farben wie xcard.css (--mc-*)
  const SURFACE = {
    dark: { bg1: "#1A1A23", bg2: "#121219", text: "#F5F5F7", text2: "#C4C4CC", text3: "#8A8A95", chip: "rgba(255,255,255,0.08)", panel: "rgba(255,255,255,0.045)", line: "rgba(255,255,255,0.09)", track: "rgba(255,255,255,0.1)" },
    light: { bg1: "#FFFFFF", bg2: "#F3F3F7", text: "#121218", text2: "#3F3F4A", text3: "#71717F", chip: "rgba(0,0,0,0.06)", panel: "rgba(0,0,0,0.04)", line: "rgba(0,0,0,0.09)", track: "rgba(0,0,0,0.09)" },
  };

  function model(c) {
    const d = c.design && typeof c.design === "object" ? c.design : {};
    const theme = d.theme === "custom" && isHex(d.c1) && isHex(d.c2) ? "custom" : THEMES[d.theme] ? d.theme : "aurora";
    const B = window.XyntalBanners;
    const order = (Array.isArray(d.order) ? d.order.filter((b) => BLOCKS.includes(b)) : []).concat(BLOCKS).filter((b, i, a) => a.indexOf(b) === i);
    const off = Array.isArray(d.off) ? d.off.filter((b) => BLOCKS.includes(b)) : [];
    const firstUser = window.XyntalCardHtml?.isFirstUser ? window.XyntalCardHtml.isFirstUser(c) : false;
    const handle = String(c.handle || "").toLowerCase();
    return {
      name: String(c.name || "").trim() || "?",
      role: c.role || "", level: LEVELS.includes(c.level) ? c.level : "",
      place: [c.city, c.mode ? t(c.mode) : ""].filter(Boolean).join(" · "),
      pitch: String(c.pitch || "").trim(), looking: c.looking || "",
      skills: (Array.isArray(c.skills) ? c.skills : []).filter((s) => typeof s === "string" && s.trim()).slice(0, 4),
      hours: Number(c.hours) || 0,
      link: /^https?:\/\//.test(c.link || "") ? c.link : "",
      handle: HANDLE.test(handle) ? handle : "",
      colors: theme === "custom" ? [d.c1, d.c2] : THEMES[theme], mono: theme === "mono",
      surface: d.surface === "light" ? "light" : "dark", shape: d.shape === "rounded" ? "rounded" : "circle",
      center: d.layout === "center",
      // banner_path (öffentliche Karte) oder hasBannerImage (Editor): „Eigenes Bild“ nur mit Datei
      banner: B ? B.effective(d.banner, c.is_premium === true, !!(c.banner_path || c.hasBannerImage)) : "theme",
      blocks: order.filter((b) => !off.includes(b)),
      admin: c.is_admin === true, verified: c.is_verified === true, beta: c.is_beta_tester === true, firstUser,
    };
  }

  // ---------- Zeichenhilfen ----------
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  // CSS linear-gradient(<deg>) über der Box x, y, w, h
  function cssGrad(g, deg, x, y, w, h, cols) {
    const a = (deg * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
    const len = Math.abs(w * dx) + Math.abs(h * dy), cx = x + w / 2, cy = y + h / 2;
    const gr = g.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
    cols.forEach((col, i) => gr.addColorStop(i / (cols.length - 1), col));
    return gr;
  }
  // Zeilen umbrechen; zu lange Wörter (z. B. Links) zeichenweise wie overflow-wrap: anywhere
  function wrap(g, text, maxW, max) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width <= maxW) { line = test; continue; }
      if (line) lines.push(line);
      line = "";
      for (const ch of word) {
        if (g.measureText(line + ch).width > maxW && line) { lines.push(line); line = ""; }
        line += ch;
      }
    }
    if (line) lines.push(line);
    if (lines.length > max) { lines.length = max; lines[max - 1] = fit(g, `${lines[max - 1]} …`, maxW); }
    return lines;
  }
  function fit(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && g.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s.trimEnd()}…`;
  }
  const font = (weight, size, family = SANS) => `${weight} ${size}px ${family}`;

  // ---------- Die Karte (CSS-Maße aus xcard.css; 384 px breit, gezeichnet in Faktor 2.5) ----------
  const CARD_W = 384, PAD = 24, SCALE = 2.5;

  // Zeichnet die Karte in CSS-Pixeln auf g (bereits skaliert) und gibt ihre Höhe zurück.
  // Ein erster Lauf auf einer 1 × 1-Fläche misst nur die Höhe.
  function paintCard(g, m, media) {
    const P = SURFACE[m.surface], C = m.colors, inner = CARD_W - PAD * 2;
    const tg = (x, y, w, h) => cssGrad(g, 120, x, y, w, h, C);
    const H = paintCard.height || 600;
    // Rand (1,5 px, Verlauf) und Grund
    roundRect(g, 0, 0, CARD_W, H, 30); g.fillStyle = tg(0, 0, CARD_W, H); g.fill();
    g.save();
    roundRect(g, 1.5, 1.5, CARD_W - 3, H - 3, 28.5); g.clip();
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, P.bg1); bg.addColorStop(1, P.bg2);
    g.fillStyle = bg; g.fillRect(0, 0, CARD_W, H);

    // Titelbild (96 px): Vorlage aus banners.js, eigenes Bild oder Verlauf
    const COVER = 96;
    if (m.banner === "theme" || !window.XyntalBanners?.paint) {
      g.fillStyle = tg(0, 0, CARD_W, COVER); g.fillRect(0, 0, CARD_W, COVER);
      const sh = g.createLinearGradient(0, 0, 0, COVER);
      if (m.surface === "light") { sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(255,255,255,0.35)"); }
      else { sh.addColorStop(0, "rgba(10,10,16,0.02)"); sh.addColorStop(1, "rgba(26,26,35,0.6)"); }
      g.fillStyle = sh; g.fillRect(0, 0, CARD_W, COVER);
    } else {
      window.XyntalBanners.paint(g, m.banner, CARD_W, COVER, C, m.banner === "image" ? media.banner : null);
    }
    // Abzeichen oben rechts
    const badges = [];
    if (m.admin) badges.push({ text: t("Admin").toUpperCase(), bg: "rgba(10,12,22,0.74)", fg: "#fff", ring: "#8FD0FF" });
    if (m.firstUser) badges.push({ text: "Last Egg Standing", bg: "#E6CBA4", fg: "#3A2410" });
    if (!m.admin) badges.push(m.firstUser ? { text: `01 ${t("First User")}`, bg: "#3FE0F0", fg: "#06181B" } : { text: t("Early Access"), bg: "rgba(0,0,0,0.32)", fg: "#fff" });
    if (m.beta && !m.admin) badges.push({ text: t("Beta-Tester"), bg: "rgba(63,224,240,0.2)", fg: "#F2FAFF", ring: "rgba(119,210,255,0.42)" });
    g.font = font(600, 11.5); g.textBaseline = "middle"; g.textAlign = "left";
    let bx = CARD_W - 18;
    for (const b of badges.reverse()) {
      const bw = g.measureText(b.text).width + 22;
      bx -= bw;
      if (bx < 18) break;
      roundRect(g, bx, 16, bw, 23.5, 12); g.fillStyle = b.bg; g.fill();
      if (b.ring) { g.lineWidth = 1; g.strokeStyle = b.ring; g.stroke(); }
      g.fillStyle = b.fg; g.fillText(b.text, bx + 11, 16 + 12.5);
      bx -= 6;
    }

    // Profilbild (88 px, Ring im Kartenverlauf), 54 px ins Titelbild gezogen
    const AV = 88, ax = m.center ? (CARD_W - AV) / 2 : PAD, ay = COVER + 14 - 54;
    const shape = (inset) => {
      const s = AV - inset * 2, x = ax + inset, y = ay + inset;
      if (m.shape === "rounded") roundRect(g, x, y, s, s, s * 0.28);
      else { g.beginPath(); g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); }
    };
    shape(0); g.fillStyle = tg(ax, ay, AV, AV); g.fill();
    shape(3); g.fillStyle = P.bg1; g.fill();
    g.save(); shape(6); g.clip();
    const pic = media.avatar, pw = pic && (pic.videoWidth || pic.naturalWidth || pic.width), ph = pic && (pic.videoHeight || pic.naturalHeight || pic.height);
    if (pw && ph) {
      // object-fit: cover
      const s = AV - 12, f = Math.max(s / pw, s / ph);
      g.drawImage(pic, ax + 6 + (s - pw * f) / 2, ay + 6 + (s - ph * f) / 2, pw * f, ph * f);
    } else {
      g.fillStyle = tg(ax, ay, AV, AV); g.fillRect(ax, ay, AV, AV);
      g.fillStyle = m.mono ? "#111" : "#fff"; g.font = font(700, 34); g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText([...m.name][0].toUpperCase(), ax + AV / 2, ay + AV / 2 + 1);
    }
    g.restore();

    // Name und Rolle
    const align = m.center ? "center" : "left", tx = m.center ? CARD_W / 2 : PAD;
    let y = ay + AV + 14;
    g.textAlign = align; g.textBaseline = "middle";
    g.font = font(700, 26);
    const mark = m.verified ? 23 : 0;
    const nameLines = wrap(g, m.name, inner - mark, 2);
    nameLines.forEach((line, i) => {
      const lw = g.measureText(line).width, last = i === nameLines.length - 1;
      const x = m.center ? tx - (last ? mark / 2 : 0) : tx;
      g.fillStyle = P.text; g.fillText(line, x, y + 14.3);
      if (last && mark) {
        const cx = (m.center ? x + lw / 2 : x + lw) + 5 + 9, cy = y + 14.3;
        g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fillStyle = "#3FE0F0"; g.fill();
        g.beginPath(); g.moveTo(cx - 3.8, cy + 0.3); g.lineTo(cx - 1.2, cy + 2.9); g.lineTo(cx + 4.3, cy - 2.8);
        g.lineWidth = 2; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#06181B"; g.stroke();
        g.font = font(700, 26);
      }
      y += 28.6;
    });
    y += 4;
    const role = [t(m.role || ""), m.level ? t(m.level) : ""].filter(Boolean).join(" · ");
    if (role) { g.font = font(400, 14.5); g.fillStyle = P.text2; g.fillText(fit(g, role, inner), tx, y + 11); y += 22; }

    // Bausteine in der gewählten Reihenfolge
    const blocks = {
      place() {
        if (!m.place) return false;
        g.font = font(400, 13.5);
        const text = fit(g, m.place, inner - 20), w = g.measureText(text).width + 20;
        const x0 = m.center ? (CARD_W - w) / 2 : PAD, cy = y + 10;
        g.save(); g.translate(x0, cy - 7.5); g.scale(15 / 24, 15 / 24);
        g.strokeStyle = P.text3; g.lineWidth = 1.8; g.lineJoin = "round";
        g.beginPath(); g.moveTo(12, 21); g.bezierCurveTo(12, 21, 5.5, 15.4, 5.5, 10); g.arc(12, 10, 6.5, Math.PI, 0); g.bezierCurveTo(18.5, 15.4, 12, 21, 12, 21); g.stroke();
        g.beginPath(); g.arc(12, 10, 2.3, 0, Math.PI * 2); g.stroke();
        g.restore();
        g.textAlign = "left"; g.fillStyle = P.text3; g.fillText(text, x0 + 20, cy); g.textAlign = align;
        y += 20; return true;
      },
      pitch() {
        if (!m.pitch) return false;
        g.font = font(600, 17); g.fillStyle = P.text;
        for (const line of wrap(g, m.pitch, inner, 4)) { g.fillText(line, tx, y + 11.9); y += 23.8; }
        return true;
      },
      looking() {
        if (!m.looking) return false;
        const sl = t("Sucht"), val = t(m.looking);
        g.font = font(400, 13); const slw = g.measureText(sl).width;
        g.font = font(700, 13); const lk = fit(g, val, inner - 26 - slw - 6), lkw = g.measureText(lk).width;
        const w = Math.min(inner, slw + 6 + lkw + 26), x0 = m.center ? (CARD_W - w) / 2 : PAD;
        roundRect(g, x0, y, w, 33.5, 17); g.fillStyle = P.chip; g.fill();
        g.textAlign = "left";
        g.font = font(400, 13); g.fillStyle = P.text3; g.fillText(sl, x0 + 13, y + 17);
        g.font = font(700, 13); g.fillStyle = cssGrad(g, 120, x0 + 13 + slw + 6, y, lkw, 33.5, C); g.fillText(lk, x0 + 13 + slw + 6, y + 17);
        g.textAlign = align; y += 33.5; return true;
      },
      skills() {
        if (!m.skills.length) return false;
        g.font = font(400, 13);
        const rows = [[]];
        let rw = 0;
        for (const s of m.skills) {
          const label = fit(g, s, inner - 24), sw = g.measureText(label).width + 24;
          if (rw + sw > inner && rows[rows.length - 1].length) { rows.push([]); rw = 0; }
          rows[rows.length - 1].push([label, sw]); rw += sw + 6;
        }
        g.textAlign = "left";
        rows.forEach((row) => {
          const total = row.reduce((a, [, sw]) => a + sw, 0) + 6 * (row.length - 1);
          let x = m.center ? (CARD_W - total) / 2 : PAD;
          for (const [label, sw] of row) {
            roundRect(g, x, y, sw, 31.5, 16); g.fillStyle = P.chip; g.fill();
            g.fillStyle = P.text; g.fillText(label, x + 12, y + 16); x += sw + 6;
          }
          y += 31.5 + 6;
        });
        y -= 6; g.textAlign = align; return true;
      },
      stats() {
        const bw = (inner - 8) / 2, bh = 73.5, lv = LEVELS.indexOf(m.level);
        const panel = (x, label, value) => {
          roundRect(g, x, y, bw, bh, 16); g.fillStyle = P.panel; g.fill();
          g.textAlign = "left";
          g.font = font(400, 11.5); g.fillStyle = P.text3; g.fillText(label, x + 12, y + 11 + 8.6);
          g.font = font(600, 14); g.fillStyle = P.text; g.fillText(fit(g, value, bw - 24), x + 12, y + 11 + 17.25 + 3 + 9.1);
        };
        const barY = y + 11 + 17.25 + 3 + 18.2 + 3 + 5;
        panel(PAD, t("Zeit"), t(`${m.hours} Std./Woche`));
        roundRect(g, PAD + 12, barY, bw - 24, 4, 2); g.fillStyle = P.track; g.fill();
        const fill = (bw - 24) * Math.min(1, m.hours / 20);
        if (fill > 0) { roundRect(g, PAD + 12, barY, fill, 4, 2); g.fillStyle = cssGrad(g, 120, PAD + 12, barY, bw - 24, 4, C); g.fill(); }
        if (m.level) {
          const x2 = PAD + bw + 8, dw = (bw - 24 - 8) / 3;
          panel(x2, t("Erfahrung"), t(m.level));
          for (let k = 0; k < 3; k++) {
            roundRect(g, x2 + 12 + k * (dw + 4), barY, dw, 4, 2);
            g.fillStyle = k <= lv ? cssGrad(g, 120, x2 + 12, barY, bw - 24, 4, C) : P.track; g.fill();
          }
        }
        g.textAlign = align; y += bh; return true;
      },
    };
    for (const b of m.blocks) { const top = y; y += 14; if (!blocks[b]()) y = top; }

    // Fuß: Link als Knopf, rechts die Adresse
    y += 14;
    g.fillStyle = P.line; g.fillRect(PAD, y, inner, 1);
    y += 13;
    const footH = m.link ? 44 : 19;
    g.textAlign = "left"; g.textBaseline = "middle";
    if (m.link) {
      let label = "Website";
      try { if (/(^|\.)linkedin\.com$/i.test(new URL(m.link).hostname)) label = "LinkedIn"; } catch { /* ungültig */ }
      label += " ↗";
      g.font = font(600, 12.5); const lw = g.measureText(label).width + 32;
      roundRect(g, PAD + 0.5, y + 0.5, lw - 1, 43, 22); g.lineWidth = 1; g.strokeStyle = P.text2; g.stroke();
      g.fillStyle = P.text; g.fillText(label, PAD + 16, y + 22);
    }
    g.font = font(400, 12.5); g.fillStyle = P.text3; g.textAlign = "right";
    g.fillText(m.handle ? `xyntal.de/${m.handle}` : "xyntal.de", CARD_W - PAD, y + footH / 2);
    y += footH + 20;
    g.restore();
    return Math.ceil(y);
  }

  // Karte als eigene Zeichenfläche (960 px breit)
  function cardCanvas(m, media) {
    const probe = document.createElement("canvas").getContext("2d");
    paintCard.height = 0;
    const h = paintCard(probe, m, media);
    const c = document.createElement("canvas");
    c.width = CARD_W * SCALE; c.height = Math.ceil(h * SCALE);
    const g = c.getContext("2d");
    g.scale(SCALE, SCALE);
    paintCard.height = h;
    paintCard(g, m, media);
    return c;
  }

  // ---------- Story zusammensetzen ----------
  function compose(m, media) {
    const card = cardCanvas(m, media);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = BRAND.bg; g.fillRect(0, 0, W, H);

    // Unter der Karte: Link-Feld (für den Link-Sticker) und @xyntal
    const site = m.handle ? `xyntal.de/${m.handle}` : "xyntal.de";
    const GAP1 = 64, PILL = 104, GAP2 = 34, TAG = 44, foot = GAP1 + PILL + GAP2 + TAG;
    const zoneTop = SAFE_TOP + 60, zoneBottom = H - SAFE_BOTTOM - 40;
    const s = Math.min(820 / card.width, (zoneBottom - zoneTop - foot) / card.height);
    const cw = card.width * s, ch = card.height * s;
    const top = zoneTop + (zoneBottom - zoneTop - (ch + foot)) / 2, x = (W - cw) / 2;
    g.save();
    // Schatten eng genug, dass er nicht in den freien Rand oben reicht
    g.shadowColor = "rgba(0, 0, 0, 0.5)"; g.shadowBlur = 40; g.shadowOffsetY = 24;
    g.drawImage(card, x, top, cw, ch);
    g.restore();

    let y = top + ch + GAP1;
    g.font = font(500, 54, SERIF);
    const text = fit(g, site, W - 2 * 100 - 2 * 48), pw = g.measureText(text).width + 96;
    roundRect(g, (W - pw) / 2, y, pw, PILL, PILL / 2);
    g.lineWidth = 2; g.strokeStyle = BRAND.line; g.stroke();
    g.fillStyle = BRAND.text; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, W / 2, y + PILL / 2 + 2);
    y += PILL + GAP2;
    g.font = font(600, 40); g.fillStyle = BRAND.key;
    g.fillText("@xyntal", W / 2, y + TAG / 2);
    return c;
  }

  // ---------- Bilder laden ----------
  // Prüft, ob sich etwas zeichnen lässt, ohne die Zeichenfläche zu sperren (CORS)
  function clean(el) {
    try {
      const k = document.createElement("canvas"); k.width = k.height = 1;
      const g = k.getContext("2d"); g.drawImage(el, 0, 0, 1, 1); g.getImageData(0, 0, 1, 1);
      return true;
    } catch { return false; }
  }
  const timeout = (ms) => new Promise((res) => setTimeout(() => res(null), ms));
  function imageFrom(src) {
    return new Promise((res) => {
      const i = new Image();
      i.decoding = "async";
      i.onload = () => res(i.naturalWidth ? i : null); i.onerror = () => res(null);
      i.src = src;
    });
  }
  // Erstes Bild eines Videos (blob:-Adresse, also ohne CORS-Sorgen)
  function videoFrame(src) {
    return new Promise((res) => {
      const v = document.createElement("video");
      let done = false;
      const end = (ok) => { if (done) return; done = true; try { v.pause(); } catch { /* egal */ } res(ok && v.videoWidth ? v : null); };
      v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = "auto";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
      v.addEventListener("loadeddata", () => {
        if (v.currentTime > 0.01) { v.addEventListener("seeked", () => end(true), { once: true }); v.currentTime = 0; }
        else end(true);
      }, { once: true });
      v.addEventListener("error", () => end(false), { once: true });
      setTimeout(() => end(v.readyState >= 2), 8000);
      v.src = src;
      v.load();
      // iOS lädt Videodaten erst beim Abspielen (stumm erlaubt)
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    });
  }
  // Ein Videobanner kann groß sein: Für das erste Bild reicht der Anfang der Datei
  const VIDEO_BYTES = 12 * 1024 * 1024;
  async function loadMedia(src) {
    if (!src || !src.url) return null;
    try {
      let url = src.url, temp = "";
      if (!/^(blob|data):/.test(url)) {
        const headers = { ...(src.headers || {}) };
        if (src.video) headers.Range = `bytes=0-${VIDEO_BYTES - 1}`;
        const res = await Promise.race([fetch(url, { headers, mode: "cors", credentials: "omit" }), timeout(10000)]);
        if (!res || !(res.ok || res.status === 206)) return null;
        const blob = await res.blob();
        if (!blob.size) return null;
        // Erstes Bild auch bei GIF/WebP: createImageBitmap nimmt laut Standard das erste Einzelbild
        if (!src.video && window.createImageBitmap) {
          try { const bmp = await createImageBitmap(blob); if (bmp.width) return bmp; } catch { /* unten als <img> */ }
        }
        url = temp = URL.createObjectURL(blob);
      }
      const el = await (src.video ? videoFrame(url) : imageFrom(url));
      // Eigene blob:-Adresse wieder freigeben (ein Video erst nach dem Zeichnen, siehe render)
      if (temp && (!el || !src.video)) URL.revokeObjectURL(temp);
      else if (el && temp) el.dataset.temp = temp;
      return el && clean(el) ? el : null;
    } catch { return null; }
  }

  // Schriften der Seite (fonts.css) müssen geladen sein, bevor der Canvas sie nutzt
  function fonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const need = [font(400, 20), font(600, 20), font(700, 20), font(500, 20, SERIF)].map((f) => document.fonts.load(f, "xyntal.de/Äß").catch(() => {}));
    return Promise.race([Promise.all(need), timeout(3000)]);
  }

  // input: { card (Form wie get_public_card), avatar: {url, video, headers}, banner: {url, video} }
  async function render(input) {
    const m = model(input.card || {});
    const [avatar, banner] = await Promise.all([loadMedia(input.avatar), m.banner === "image" ? loadMedia(input.banner) : null, fonts()]);
    let canvas = compose(m, { avatar, banner });
    let blob = await toPng(canvas).catch(() => null);
    // Sollte doch etwas die Fläche gesperrt haben: ohne Bilder (Initiale, Farbverlauf)
    if (!blob) { canvas = compose(m, { avatar: null, banner: null }); blob = await toPng(canvas); }
    for (const el of [avatar, banner]) {
      if (el?.close) el.close();
      if (el?.dataset?.temp) { el.removeAttribute("src"); URL.revokeObjectURL(el.dataset.temp); }
    }
    const name = `xyntal-story-${m.handle || "karte"}.png`;
    return new File([blob], name, { type: "image/png" });
  }
  const toPng = (canvas) => new Promise((res, rej) => {
    try { canvas.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png"); } catch (err) { rej(err); }
  });

  // ---------- Knopf: vorbereiten, teilen oder herunterladen ----------
  const phone = () => matchMedia("(pointer: coarse)").matches;
  const canShareFiles = (file) => {
    try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch { return false; }
  };
  function download(file) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file); a.download = file.name; a.rel = "noopener";
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  // button: der Knopf; status: Element für Meldungen; input(): {card, avatar, banner} oder Promise darauf;
  // key(): optional, Kennung des aktuellen Stands – ändert sie sich, wird das Bild neu erzeugt.
  function attach(button, { status, input, key = () => "" }) {
    const label = button.querySelector("[data-story-label]") || button;
    const idle = label.textContent;
    let cache = null, busy = false;
    const say = (text) => { if (status) status.textContent = text; };
    function prepare() {
      const k = key();
      if (cache && cache.key === k && !cache.failed) return cache;
      const entry = { key: k, file: null, failed: false };
      entry.promise = Promise.resolve().then(input).then((data) => (data ? render(data) : Promise.reject(new Error("input"))))
        .then((file) => { entry.file = file; return file; }, (err) => { entry.failed = true; throw err; });
      entry.promise.catch(() => {});
      cache = entry;
      return entry;
    }
    function ready(on) {
      button.classList.toggle("is-ready", on);
      label.textContent = on ? t("Story-Bild teilen") : t(idle);
    }
    async function go() {
      if (busy) return;
      busy = true; button.setAttribute("aria-busy", "true");
      const entry = prepare();
      let file = entry.file;
      try {
        if (!file) { say(t("Story-Bild wird erstellt …")); file = await entry.promise; }
        if (phone() && canShareFiles(file)) {
          try {
            // Nur die Datei: Mit Text daneben bietet iOS Instagram-Story oft nicht an
            await navigator.share({ files: [file] });
            ready(false);
            say(t("Geteilt! Markier in Instagram @xyntal und leg den Link-Sticker auf deinen Link."));
          } catch (err) {
            if (err && err.name === "AbortError") { ready(false); say(""); return; }
            // Das Erzeugen hat zu lange gedauert, das Tippen gilt nicht mehr: Bild ist fertig, nochmal tippen
            if (err && err.name === "NotAllowedError") { ready(true); say(t("Das Bild ist fertig. Tipp noch einmal, um es zu teilen.")); return; }
            download(file); ready(false);
            say(`${t("Bild gespeichert:")} ${file.name}`);
          }
          return;
        }
        download(file); ready(false);
        say(`${t("Bild gespeichert:")} ${file.name} – ${t("Markier in Instagram @xyntal und leg den Link-Sticker auf deinen Link.")}`);
      } catch {
        ready(false);
        say(t("Das Bild konnte nicht erstellt werden. Bitte versuch es noch einmal."));
      } finally { busy = false; button.removeAttribute("aria-busy"); }
    }
    button.addEventListener("click", go);
    // Schon beim Antippen anfangen – bis zum Loslassen ist das Bild oft fertig
    button.addEventListener("pointerdown", () => { try { prepare(); } catch { /* beim Klick erneut */ } }, { passive: true });
    let timer = 0;
    return {
      prepare: () => { try { prepare(); } catch { /* beim Klick erneut */ } },
      // Nach Änderungen: verzögert neu erzeugen, damit Tippen im Editor flüssig bleibt
      soon(ms = 1500) { clearTimeout(timer); timer = setTimeout(() => { try { prepare(); } catch { /* egal */ } }, ms); },
      ready: () => !!(cache && cache.file && cache.key === key()),
    };
  }

  window.XyntalCardStory = { render, attach, W, H, SAFE_TOP, SAFE_BOTTOM };
})();
