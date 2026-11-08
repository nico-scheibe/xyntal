// Freie Seite unter xyntal.de/name: Layout (Text, Links, Bilder frei positioniert) prüfen und als HTML ausgeben.
// Genutzt von u.js (öffentliche Seite) und page-editor.js (Editor), damit beide exakt dasselbe zeigen.
// Alles, was aus der Datenbank kommt, wird hier auf erlaubte Werte begrenzt – Farben nur als #rrggbb, Bilder nur aus dem eigenen Ordner.
(() => {
  // Breite der Zeichenfläche in Einheiten; die Seite skaliert sie auf die echte Breite.
  // Schmal (480, ältere Seiten): eine Spalte. Breit (1080): ganze Seitenbreite, 1 Einheit = 1 px bei voller Breite;
  // auf schmalen Bildschirmen stapelt page-canvas.css die Elemente einer breiten Seite untereinander.
  // Ganzer Bildschirm (1920): die Fläche reicht über die volle Fensterbreite, 1 Einheit = 1 px bei 1920 px.
  const NARROW = 480, WIDE = 1080, FULL = 1920, W = NARROW;
  const WIDTHS = [NARROW, WIDE, FULL];
  const MIN_H = 240, MAX_H = 4000;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const round = (n) => Math.round(n * 10) / 10;
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : d);
  const FONTS = { sans: "var(--f-text, system-ui, sans-serif)", serif: "'Source Serif 4', Georgia, serif", mono: "ui-monospace, 'IBM Plex Mono', monospace" };
  const SRC = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
  const UUID = /^[0-9a-f-]{36}$/;
  const TYPES = ["text", "link", "image", "block", "shape", "button", "embed", "icons"];
  // Einbettungen: nur diese Anbieter, nur geprüfte Ids (Adressen baut page-canvas.js selbst); CSP frame-src in hosting/daki/server.cjs
  const EMBEDS = {
    youtube: { re: /^[A-Za-z0-9_-]{11}$/, src: (id) => `https://www.youtube-nocookie.com/embed/${id}`, ratio: [16, 9] },
    vimeo: { re: /^[0-9]{6,12}$/, src: (id) => `https://player.vimeo.com/video/${id}`, ratio: [16, 9] },
    spotify: { re: /^(track|album|playlist|episode|show|artist)\/[A-Za-z0-9]{22}$/, src: (id) => `https://open.spotify.com/embed/${id}`, ratio: [5, 2] },
  };
  // Adresse aus YouTube, Vimeo oder Spotify → { provider, id } oder null
  function parseEmbed(url) {
    let u; try { u = new URL(String(url || "").trim()); } catch { return null; }
    const h = u.hostname.replace(/^(www\.|m\.)/, ""), parts = u.pathname.split("/").filter(Boolean);
    let provider = "", id = "";
    if (h === "youtu.be") { provider = "youtube"; id = parts[0]; }
    else if (h === "youtube.com" || h === "youtube-nocookie.com") { provider = "youtube"; id = u.searchParams.get("v") || (["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : ""); }
    else if (h === "vimeo.com" || h === "player.vimeo.com") { provider = "vimeo"; id = parts.find((x) => /^[0-9]{6,12}$/.test(x)) || ""; }
    else if (h === "open.spotify.com") { provider = "spotify"; const q = parts.filter((x) => !/^intl-/.test(x) && x !== "embed"); id = q.length >= 2 ? `${q[0]}/${q[1]}` : ""; }
    return EMBEDS[provider] && EMBEDS[provider].re.test(id || "") ? { provider, id } : null;
  }
  // Bausteine der Profilseite: Inhalt liefert u.js aus dem Profil; hier Anzeigename und natürliche Breite in px (schmale / breite Seite)
  const BLOCKS = { card: ["Karte", 360, 340], head: ["Steckbrief", 440, 620], about: ["Über mich", 440, 620], offer: ["Ich biete", 340, 300], seek: ["Ich suche", 340, 300], skills: ["Skills", 440, 620] };
  const natOf = (kind, pw) => BLOCKS[kind][pw === NARROW ? 1 : 2];
  const safeUrl = (u) => (/^https?:\/\/[^\s]+$/i.test(u || "") ? u : "");

  // ---- Animationen ----
  // Fertige Effekte (Keyframes in page-canvas.css). Einblend-Effekte laufen einmal, die anderen standardmäßig endlos.
  const ANIMS = {
    fade: ["Einblenden", false], up: ["Von unten", false], left: ["Von links", false], zoom: ["Heranzoomen", false],
    float: ["Schweben", true], pulse: ["Pulsieren", true], bounce: ["Hüpfen", true], wobble: ["Wackeln", true],
    shake: ["Schütteln", true], spin: ["Drehen", true], glow: ["Leuchten", true], rainbow: ["Farbwechsel", true],
  };
  const TRIGGERS = ["load", "view", "hover"];
  // Hover-Effekte für Knöpfe, Links, Symbole, Fenster, Bilder und Formen (page-canvas.css; „tilt“ braucht mount)
  const HOVERS = {
    lift: "Anheben", pop: "Aufploppen", glow: "Leuchten", neon: "Neon", shine: "Glanz", fill: "Füllen",
    ring: "Ring", outline: "Rahmen-Puls", rainbow: "Regenbogen", tilt: "3D-Kippen", shake: "Wackeln", blur: "Fokus",
  };
  const HOVER_TYPES = ["link", "button", "icons", "text", "image", "shape"];
  // Leuchtfarbe: die hellere der beiden Farben des Elements, damit Leuchten/Ring auf dunklem Grund sichtbar sind
  const lum = (h) => { const n = parseInt(String(h || "").slice(1), 16); return Number.isFinite(n) ? ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 : 0; };
  const glowOf = (it) => { const a = it.bg || "", b = it.color || ""; return (lum(a) >= lum(b) ? a : b) || "#eceae4"; };
  // Eigene Animation: nur diese Zeichen (keine Anführungszeichen, <, >, /, \) – dieselbe Regel prüft save_my_page.
  // Klammern und @ sind erlaubt, damit normales CSS (@keyframes, translateY(-20px)) geht; das CSS wird ohnehin neu gebaut.
  const CODE_CHARS = /[^A-Za-z0-9äöüÄÖÜß%#{}():;.,@_\s-]/g;
  function cleanAnim(a) {
    if (!a || typeof a !== "object" || !(ANIMS[a.p] || a.p === "custom")) return null;
    const loopDefault = a.p === "custom" ? true : ANIMS[a.p][1];
    return {
      p: a.p,
      trig: TRIGGERS.includes(a.trig) ? a.trig : "load",
      d: round(num(a.d, 0.2, 20, a.p === "spin" || a.p === "rainbow" ? 6 : 1.2)),
      dl: round(num(a.dl, 0, 10, 0)),
      loop: typeof a.loop === "boolean" ? a.loop : loopDefault,
      code: a.p === "custom" ? String(a.code ?? "").replace(CODE_CHARS, "").slice(0, 1500) : "",
    };
  }
  // Mini-Sprache für eigene Animationen → sicheres CSS. Werte werden als Zahlen/Farben geprüft und neu geschrieben,
  // nichts aus dem Text landet ungeprüft im CSS.
  //   0% { verschieben: 0 -20; drehen: 8; skalieren: 1.1; deckkraft: 1; unschärfe: 0; farbton: 90; helligkeit: 1.2; schräg: 5; farbe: #ff00aa; hintergrund: #112233 }
  const PROPS = {
    verschieben: "move", move: "move", translate: "move", drehen: "rot", rotate: "rot", skalieren: "scale", scale: "scale",
    deckkraft: "op", opacity: "op", "unschärfe": "blur", unschaerfe: "blur", blur: "blur", farbton: "hue", hue: "hue",
    helligkeit: "bright", brightness: "bright", "schräg": "skew", schraeg: "skew", skew: "skew", farbe: "color", color: "color",
    hintergrund: "bg", background: "bg",
  };
  // Versteht die Mini-Sprache UND normales CSS (@keyframes, transform: translateY(-20px) rotate(10deg), opacity,
  // filter: blur() hue-rotate(), color, background). Alles wird geprüft und neu geschrieben – nichts geht ungeprüft durch.
  function compileAnim(code, name) {
    let src = String(code || "");
    if (!src.trim()) return { error: "Noch kein Code." };
    if (CODE_CHARS.test(src)) { CODE_CHARS.lastIndex = 0; return { error: "Nicht erlaubt: Anführungszeichen, <, >, / und \\. Farben bitte als #rrggbb." }; }
    CODE_CHARS.lastIndex = 0;
    // @keyframes name { … } und Selektoren davor (.box { animation … }) entfernen: nur die Schritte zählen
    const kf = src.match(/@keyframes\s+[\w-]+\s*\{([\s\S]*)\}\s*$/i);
    if (kf) src = kf[1];
    const frames = [];
    const rest = src.replace(/((?:\s*(?:\d{1,3}(?:\.\d+)?%|von|bis|from|to)\s*,?)+)\{([^{}]*)\}/gi, (m, stops, body) => {
      stops.split(",").map((x) => x.trim()).filter(Boolean).forEach((at) => {
        const pct = /^(von|from)$/i.test(at) ? 0 : /^(bis|to)$/i.test(at) ? 100 : Number(at.slice(0, -1));
        frames.push({ pct, body });
      });
      return "";
    });
    if (rest.trim()) return { error: `Nicht verstanden: „${rest.trim().slice(0, 30)}“. Aufbau: 0% { drehen: 10 } oder 0% { transform: rotate(10deg) }` };
    if (frames.length < 2) return { error: "Mindestens zwei Schritte, z. B. 0% { … } und 100% { … }." };
    // Zahl mit optionaler Einheit (px, deg, turn, %) in Grenzen
    const n = (v, lo, hi, unit) => {
      const m = String(v ?? "").trim().match(/^(-?\d*\.?\d+)(px|deg|turn|%)?$/i);
      if (!m) throw new Error(`Zahl erwartet: „${v ?? ""}“`);
      let x = Number(m[1]);
      if (m[2] && m[2].toLowerCase() === "turn") x *= 360;
      if (m[2] === "%" && unit === "f") x /= 100;
      if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`Zahl außerhalb ${lo} bis ${hi}: ${v}`);
      return x;
    };
    const px = (v) => `calc(${n(v, -3000, 3000)}px * var(--k, 1))`;
    const out = [];
    try {
      frames.forEach(({ pct, body }) => {
        if (!(pct >= 0 && pct <= 100)) throw new Error(`Prozent muss zwischen 0 und 100 liegen: ${pct}%`);
        const tf = [], fl = [], css = [];
        // CSS-Funktionen wie translateY(-20px) rotate(10deg) scale(1.1) blur(4px)
        const fns = (val, allowed) => {
          const list = [...val.matchAll(/([a-z-]+)\(([^()]*)\)/gi)];
          if (!list.length || val.replace(/([a-z-]+)\(([^()]*)\)/gi, "").trim()) throw new Error(`Nicht verstanden: „${val.slice(0, 40)}“`);
          list.forEach(([, fn, args]) => {
            const a = args.split(/[\s,]+/).filter(Boolean), f = fn.toLowerCase();
            if (!allowed.includes(f)) throw new Error(`Nicht unterstützt: ${fn}()`);
            if (f === "translate") tf.push(`translate(${px(a[0])}, ${px(a[1] ?? 0)})`);
            else if (f === "translatex") tf.push(`translateX(${px(a[0])})`);
            else if (f === "translatey") tf.push(`translateY(${px(a[0])})`);
            else if (f === "rotate" || f === "rotatez") tf.push(`rotate(${n(a[0], -3600, 3600)}deg)`);
            else if (f === "scale") tf.push(`scale(${n(a[0], 0, 10, "f")}, ${n(a[1] ?? a[0], 0, 10, "f")})`);
            else if (f === "scalex") tf.push(`scaleX(${n(a[0], 0, 10, "f")})`);
            else if (f === "scaley") tf.push(`scaleY(${n(a[0], 0, 10, "f")})`);
            else if (f === "skew") tf.push(`skew(${n(a[0], -80, 80)}deg, ${n(a[1] ?? 0, -80, 80)}deg)`);
            else if (f === "skewx") tf.push(`skewX(${n(a[0], -80, 80)}deg)`);
            else if (f === "skewy") tf.push(`skewY(${n(a[0], -80, 80)}deg)`);
            else if (f === "blur") fl.push(`blur(calc(${n(a[0], 0, 60)}px * var(--k, 1)))`);
            else if (f === "hue-rotate") fl.push(`hue-rotate(${n(a[0], -3600, 3600)}deg)`);
            else if (f === "brightness") fl.push(`brightness(${n(a[0], 0, 5, "f")})`);
            else if (f === "saturate") fl.push(`saturate(${n(a[0], 0, 10, "f")})`);
            else if (f === "contrast") fl.push(`contrast(${n(a[0], 0, 5, "f")})`);
            else if (f === "grayscale") fl.push(`grayscale(${n(a[0], 0, 1, "f")})`);
          });
        };
        const color = (v) => { const h = hex(String(v || "").trim(), ""); if (!h) throw new Error(`Farbe als #rrggbb angeben: ${v || ""}`); return h; };
        body.split(";").map((x) => x.trim()).filter(Boolean).forEach((decl) => {
          const i = decl.indexOf(":");
          if (i < 1) throw new Error(`„${decl.slice(0, 30)}“ braucht die Form name: wert`);
          const rawKey = decl.slice(0, i).trim().toLowerCase(), val = decl.slice(i + 1).trim();
          // normales CSS
          if (rawKey === "transform") return fns(val, ["translate", "translatex", "translatey", "rotate", "rotatez", "scale", "scalex", "scaley", "skew", "skewx", "skewy"]);
          if (rawKey === "filter") return fns(val, ["blur", "hue-rotate", "brightness", "saturate", "contrast", "grayscale"]);
          if (rawKey === "background-color") return void css.push(`background-color:${color(val)}`);
          // Mini-Sprache (und opacity, color, background)
          const key = PROPS[rawKey], vals = val.split(/[\s,]+/).filter(Boolean);
          if (!key) throw new Error(`Unbekannt: „${decl.slice(0, i).trim()}“`);
          if (key === "move") tf.push(`translate(${px(vals[0])}, ${px(vals[1] ?? 0)})`);
          else if (key === "rot") tf.push(`rotate(${n(vals[0], -3600, 3600)}deg)`);
          else if (key === "scale") tf.push(`scale(${n(vals[0], 0, 10, "f")}, ${n(vals[1] ?? vals[0], 0, 10, "f")})`);
          else if (key === "skew") tf.push(`skew(${n(vals[0], -80, 80)}deg, ${n(vals[1] ?? 0, -80, 80)}deg)`);
          else if (key === "op") css.push(`opacity:${n(vals[0], 0, 1, "f")}`);
          else if (key === "blur") fl.push(`blur(calc(${n(vals[0], 0, 60)}px * var(--k, 1)))`);
          else if (key === "hue") fl.push(`hue-rotate(${n(vals[0], -3600, 3600)}deg)`);
          else if (key === "bright") fl.push(`brightness(${n(vals[0], 0, 5, "f")})`);
          else css.push(`${key === "color" ? "color" : "background-color"}:${color(vals[0])}`);
        });
        if (tf.length) css.push(`transform:${tf.join(" ")}`);
        if (fl.length) css.push(`filter:${fl.join(" ")}`);
        out.push(`${pct}%{${css.join(";")}}`);
      });
    } catch (err) { return { error: err.message }; }
    return { css: `@keyframes ${name}{${out.join("")}}` };
  }

  const DEFAULTS = {
    text: { w: 240, h: 56, text: "Dein Text", size: 24, weight: 700, align: "left", font: "sans", color: "#eceae4", bg: "", radius: 0 },
    link: { w: 280, h: 56, size: 16, color: "#eceae4", bg: "#2a2a2a", radius: 14, icon: true },
    image: { w: 180, h: 180, radius: 16, fit: "cover" },
    shape: { w: 200, h: 200, radius: 24, bg: "#5b8cff" },
    button: { w: 240, h: 56, size: 17, color: "#1c1c1c", bg: "#eceae4", radius: 999, text: "Schreib mir" },
    embed: { w: 480, h: 270, radius: 16 },
    icons: { w: 320, h: 56, size: 22, color: "#eceae4", bg: "#2a2a2a", radius: 999, align: "center" },
    block: { w: 300, h: 200, radius: 0 },
  };

  function cleanItem(raw, i) {
    if (!raw || typeof raw !== "object" || !TYPES.includes(raw.type)) return null;
    const type = raw.type, d = DEFAULTS[type];
    const it = {
      id: /^[a-z0-9]{1,12}$/i.test(raw.id || "") ? raw.id : `i${i}`,
      type,
      x: round(num(raw.x, -FULL, FULL * 2, 0)), y: round(num(raw.y, -MAX_H, MAX_H, 0)),
      w: round(num(raw.w, 16, FULL * 2, d.w)), h: round(num(raw.h, 16, MAX_H, d.h)),
      o: round(num(raw.o, 0.1, 1, 1)),
      rot: round(num(raw.rot, -360, 360, 0)),
      anim: cleanAnim(raw.anim),
      hover: HOVERS[raw.hover] && HOVER_TYPES.includes(raw.type) ? raw.hover : "",
      radius: round(num(raw.radius, 0, 999, d.radius)),
      // Rahmen und Schatten (alle außer Profil-Bausteinen)
      bw: round(num(raw.bw, 0, 16, 0)), bc: hex(raw.bc, "#eceae4"), sh: raw.sh === true,
    };
    if (type === "text" || type === "link" || type === "button" || type === "icons") {
      it.size = round(num(raw.size, 8, 160, d.size));
      it.color = hex(raw.color, d.color);
      it.bg = raw.bg === "" ? "" : hex(raw.bg, d.bg);
    }
    if (type === "text") {
      it.text = String(raw.text ?? "").slice(0, 1000);
      it.weight = raw.weight === 400 || raw.weight === "400" ? 400 : 700;
      it.align = ["left", "center", "right"].includes(raw.align) ? raw.align : d.align;
      it.font = FONTS[raw.font] ? raw.font : d.font;
    } else if (type === "link") {
      it.ref = UUID.test(raw.ref || "") ? raw.ref : "";
      if (!it.ref) return null;
      it.icon = raw.icon !== false;
    } else if (type === "block") {
      if (!BLOCKS[raw.kind]) return null;
      it.kind = raw.kind;
    } else if (type === "shape") {
      it.kind = ["rect", "circle", "line"].includes(raw.kind) ? raw.kind : "rect";
      it.bg = hex(raw.bg, d.bg); it.bg2 = hex(raw.bg2, "");
    } else if (type === "button") {
      it.text = String(raw.text ?? d.text).slice(0, 80);
      it.url = safeUrl(String(raw.url || "").slice(0, 500));
      it.align = "center";
    } else if (type === "icons") {
      it.align = ["left", "center", "right"].includes(raw.align) ? raw.align : d.align;
    } else if (type === "embed") {
      const e = EMBEDS[raw.provider];
      if (!e || !e.re.test(String(raw.eid || ""))) return null;
      it.provider = raw.provider; it.eid = raw.eid;
      // Nur eigene Inhalte (Community-Richtlinien Regel 8): ohne Bestätigung wird nichts öffentlich gezeigt
      it.own = raw.own === true;
    } else {
      if (!SRC.test(raw.src || "")) return null;
      it.src = raw.src;
      it.fit = raw.fit === "contain" ? "contain" : "cover";
      it.alt = String(raw.alt ?? "").slice(0, 120);
    }
    return it;
  }

  // Beliebiges JSON → gültiges Layout (unbrauchbare Elemente fallen weg)
  function normalize(raw) {
    const p = raw && typeof raw === "object" ? raw : {};
    const bg = p.bg && typeof p.bg === "object" ? p.bg : {};
    const seen = new Set();
    const items = (Array.isArray(p.items) ? p.items : []).slice(0, 200).map(cleanItem).filter(Boolean).map((it, i) => {
      while (seen.has(it.id)) it.id = `i${i}x${seen.size}`;
      seen.add(it.id);
      return it;
    });
    return { v: 1, w: WIDTHS.includes(p.w) ? p.w : NARROW, h: Math.round(num(p.h, MIN_H, MAX_H, 640)), bg: { color: hex(bg.color, "#1c1c1c"), color2: hex(bg.color2, "") }, items };
  }

  const u = (n, pw = NARROW) => `calc(${round(n)} * 100cqw / ${pw})`;
  const background = (bg) => (bg.color2 ? `linear-gradient(160deg, ${bg.color}, ${bg.color2})` : bg.color);

  function itemHtml(it, links, o) {
    const pw = o.pw || NARROW, uu = (n) => u(n, pw);
    // --ord: Reihenfolge, wenn eine breite Seite am Handy gestapelt wird (oben vor unten, links vor rechts)
    const ord = Math.round(Math.max(0, it.y)) * 8000 + Math.round(it.x + FULL);
    const pos = `left:${uu(it.x)};top:${uu(it.y)};width:${uu(it.w)};height:${uu(it.h)};opacity:${it.o};--ord:${ord}${it.rot ? `;transform:rotate(${it.rot}deg)` : ""}`;
    const attrs = `class="pc-item pc-${it.type}" data-id="${esc(it.id)}" style="${pos}"`;
    if (it.type === "block") {
      // Höhe ergibt sich aus dem Inhalt; der Baustein wird mit seiner Breite skaliert (zoom, --k = Pixel je Einheit, gesetzt von mount)
      const inner = o.block ? o.block(it.kind) : "";
      if (!inner) return o.edit ? `<div class="pc-item pc-block is-empty" data-id="${esc(it.id)}" style="${pos.replace(/height:[^;]+;/, "")}"><div class="pc-blk-empty">${esc(BLOCKS[it.kind][0])}</div></div>` : "";
      return `<div class="pc-item pc-block" data-id="${esc(it.id)}" data-kind="${it.kind}" style="${pos.replace(/height:[^;]+;/, "")}"><div class="pc-blk" style="width:${natOf(it.kind, pw)}px;zoom:${zoomOf(it, pw)}">${inner}</div></div>`;
    }
    // Rahmen/Schatten für Kästen
    const deco = `${it.bw ? `border:${uu(it.bw)} solid ${it.bc};` : ""}${it.sh ? "box-shadow:0 18px 40px -16px rgba(0,0,0,.75);" : ""}`;
    if (it.type === "shape") {
      const fill = it.bg2 ? `linear-gradient(135deg, ${it.bg}, ${it.bg2})` : it.bg;
      const r = it.kind === "circle" ? "50%" : it.kind === "line" ? "999px" : uu(it.radius);
      return `<div ${attrs.replace('class="pc-item', `class="pc-item is-${it.kind}`)}><div class="pc-shape" style="background:${fill};border-radius:${r};${deco}"></div></div>`;
    }
    if (it.type === "embed") {
      if (!it.own && !o.edit) return "";
      const e = EMBEDS[it.provider], title = { youtube: "YouTube", vimeo: "Vimeo", spotify: "Spotify" }[it.provider];
      return `<div ${attrs.replace('class="pc-item', `class="pc-item is-${it.provider}`)}><iframe class="pc-frame" src="${esc(e.src(it.eid))}" title="${title}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="border-radius:${uu(it.radius)};${deco}"></iframe></div>`;
    }
    if (it.type === "icons") {
      const I = window.XyntalLinkIcons, list = (links || []).filter((l) => l && l.active !== false);
      const btn = `--fs:${it.size};width:${uu(it.size * 2.2)};height:${uu(it.size * 2.2)};color:${it.color};background:${it.bg || "transparent"};border-radius:${it.radius >= 999 ? "50%" : uu(it.radius)};${deco}`;
      const one = (l) => {
        const ico = I ? I.svg(l.icon) : "";
        if (o.edit) return `<span class="pc-ib" style="${btn}">${ico}</span>`;
        return safeUrl(l.url)
          ? `<a class="pc-ib" style="${btn}" href="${esc(l.url)}" data-link-id="${esc(l.id)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="${esc(l.title)}">${ico}</a>`
          : `<button type="button" class="pc-ib pc-copy" style="${btn}" data-link-id="${esc(l.id)}" data-copy-text="${esc(l.url)}" aria-label="${esc(l.title)}: ${esc(l.url)}">${ico}<span class="pc-copied" aria-live="polite"></span></button>`;
      };
      if (!list.length && !o.edit) return "";
      return `<div ${attrs}><div class="pc-icons" style="justify-content:${{ left: "flex-start", center: "center", right: "flex-end" }[it.align]};gap:${uu(it.size * 0.6)}">${list.length ? list.map(one).join("") : `<span class="pc-blk-empty">${esc(o.t ? o.t("Noch keine Links") : "Noch keine Links")}</span>`}</div></div>`;
    }
    if (it.type === "button") {
      const box = `--fs:${it.size};font-size:${uu(it.size)};color:${it.color};background:${it.bg || "transparent"};border-radius:${uu(it.radius)};${deco}`;
      if (o.edit || !it.url) return `<div ${attrs}><div class="pc-l pc-btn" style="${box}"><b data-no-i18n>${esc(it.text)}</b></div></div>`;
      return `<div ${attrs}><a class="pc-l pc-btn" style="${box}" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow"><b data-no-i18n>${esc(it.text)}</b></a></div>`;
    }
    if (it.type === "image") {
      return `<div ${attrs}><img src="${esc(`${o.base}/storage/v1/object/public/page-media/${it.src}`)}" alt="${esc(it.alt)}" draggable="false" loading="lazy" decoding="async" style="object-fit:${it.fit};border-radius:${uu(it.radius)};${deco}"></div>`;
    }
    const box = `--fs:${it.size};font-size:${uu(it.size)};color:${it.color};${it.bg ? `background:${it.bg};` : ""}border-radius:${uu(it.radius)};${deco}`;
    if (it.type === "text") {
      return `<div ${attrs}><div class="pc-t${it.bg ? " has-bg" : ""}" data-no-i18n style="${box};text-align:${it.align};font-weight:${it.weight};font-family:${FONTS[it.font]}">${esc(it.text)}</div></div>`;
    }
    const l = (links || []).find((x) => x && x.id === it.ref);
    const I = window.XyntalLinkIcons;
    if (!l) return o.edit ? `<div ${attrs}><div class="pc-l is-missing" style="${box}"><b>${esc(o.t ? o.t("Link nicht mehr vorhanden") : "Link nicht mehr vorhanden")}</b></div></div>` : "";
    const inner = `${it.icon && I ? `<span class="pc-ico">${I.svg(l.icon)}</span>` : ""}<b data-no-i18n>${esc(l.title)}</b>`;
    if (o.edit) return `<div ${attrs}><div class="pc-l" style="${box}">${inner}</div></div>`;
    const idAttr = ` data-link-id="${esc(l.id)}"`;
    if (safeUrl(l.url)) {
      return `<div ${attrs}><a class="pc-l" style="${box}" href="${esc(l.url)}"${idAttr} target="_blank" rel="noopener noreferrer nofollow">${inner}</a></div>`;
    }
    return `<div ${attrs}><button type="button" class="pc-l pc-copy" style="${box}"${idAttr} data-copy-text="${esc(l.url)}" aria-label="${esc(l.title)}: ${esc(l.url)}">${inner}<span class="pc-copied" aria-live="polite"></span></button></div>`;
  }

  // opts: { links, base (Supabase-URL), edit, t }
  function html(page, opts) {
    const p = normalize(page), o = { base: "", links: [], edit: false, ...opts, pw: p.w };
    const wide = p.w !== NARROW, full = p.w === FULL;
    const keyframes = [];
    const items = p.items.map((it) => {
      let out = itemHtml(it, o.links, o);
      if (out && it.hover) {
        // Hover: Effekt als Attribut, Farben des Elements als Variablen (--hc Text/Akzent, --hb Hintergrund)
        out = out.replace(/^<div /, `<div data-hover="${it.hover}" `)
          .replace('style="', `style="--hc:${glowOf(it)};--hf:${it.color || "#eceae4"};--hb:${it.bg || "#1c1c1c"};`);
      }
      const a = it.anim;
      if (!out || !a) return out;
      // Animation am Element: Effekt, Auslöser und Zeiten als Attribute/Variablen; eigene Keyframes aus compileAnim
      let name = "";
      if (a.p === "custom") { const c = compileAnim(a.code, `pck-${it.id}`); if (!c.css) return out; keyframes.push(c.css); name = `;--akf:pck-${it.id}`; }
      return out.replace(/^<div /, `<div data-anim="${a.p}" data-trig="${a.trig}" `)
        .replace('style="', `style="--ad:${a.d}s;--adl:${a.dl}s;--ai:${a.loop ? "infinite" : 1}${name};`);
    }).join("");
    const style = keyframes.length ? `<style>${keyframes.join("")}</style>` : "";
    return `<div class="pc-wrap${full ? " is-full" : ""}"${p.w === WIDE ? ' style="max-width:1080px"' : ""}><div class="pc${o.edit ? " is-edit" : ""}${wide ? " is-wide" : ""}" data-w="${p.w}" style="aspect-ratio:${p.w} / ${p.h};background:${background(p.bg)}">${style}${items}</div></div>`;
  }

  // --k = Pixel je Einheit, damit Bausteine (feste Pixelgröße) mit der Fläche mitskalieren
  const widthOf = (el) => Number(el.dataset.w) || NARROW;
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((list) => list.forEach((e) => e.target.style.setProperty("--k", String(e.contentRect.width / widthOf(e.target))))) : null;
  // Animation „beim Scrollen“: startet, sobald das Element sichtbar wird
  const io = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((list) => list.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); } }), { threshold: 0.2 }) : null;
  function mount(host) {
    host.querySelectorAll(".pc").forEach((el) => {
      el.style.setProperty("--k", String(el.getBoundingClientRect().width / widthOf(el)));
      if (ro) ro.observe(el);
    });
    host.querySelectorAll('.pc-item[data-trig="view"]').forEach((el) => { if (io) io.observe(el); else el.classList.add("is-in"); });
    // 3D-Kippen: Neigung und Lichtreflex folgen dem Mauszeiger (nur Maus, nicht bei reduzierter Bewegung)
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    host.querySelectorAll(".pc").forEach((cv) => {
      if (cv._tilt) return;
      cv._tilt = true;
      cv.addEventListener("pointermove", (e) => {
        const item = e.target.closest && e.target.closest('.pc-item[data-hover="tilt"]');
        if (!item) return;
        const box = item.querySelector(".pc-ib:hover") || item.firstElementChild, r = box.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        box.style.setProperty("--rx", `${((0.5 - y) * 18).toFixed(1)}deg`); box.style.setProperty("--ry", `${((x - 0.5) * 22).toFixed(1)}deg`);
        box.style.setProperty("--mx", `${(x * 100).toFixed(0)}%`); box.style.setProperty("--my", `${(y * 100).toFixed(0)}%`);
      });
      cv.addEventListener("pointerout", (e) => {
        const item = e.target.closest && e.target.closest('.pc-item[data-hover="tilt"]');
        if (item && !item.contains(e.relatedTarget)) item.querySelectorAll("*").forEach((el) => { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); });
      });
    });
  }
  function zoomOf(it, pw) { return `calc(var(--k, 1) * ${it.w} / ${natOf(it.kind, pw)})`; }

  window.XyntalPageCanvas = { HOVERS, HOVER_TYPES, ANIMS, TRIGGERS, cleanAnim, compileAnim, EMBEDS, parseEmbed, BLOCKS, NARROW, WIDE, FULL, WIDTHS, natOf, mount, zoomOf, W, MIN_H, MAX_H, DEFAULTS, normalize, html, itemHtml, background, hex, num, round, esc, safeUrl };
})();
