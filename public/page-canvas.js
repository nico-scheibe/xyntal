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
    return `<div class="pc-wrap${full ? " is-full" : ""}"${p.w === WIDE ? ' style="max-width:1080px"' : ""}><div class="pc${o.edit ? " is-edit" : ""}${wide ? " is-wide" : ""}" data-w="${p.w}" style="aspect-ratio:${p.w} / ${p.h};background:${background(p.bg)}">${p.items.map((it) => itemHtml(it, o.links, o)).join("")}</div></div>`;
  }

  // --k = Pixel je Einheit, damit Bausteine (feste Pixelgröße) mit der Fläche mitskalieren
  const widthOf = (el) => Number(el.dataset.w) || NARROW;
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((list) => list.forEach((e) => e.target.style.setProperty("--k", String(e.contentRect.width / widthOf(e.target))))) : null;
  function mount(host) {
    host.querySelectorAll(".pc").forEach((el) => {
      el.style.setProperty("--k", String(el.getBoundingClientRect().width / widthOf(el)));
      if (ro) ro.observe(el);
    });
  }
  function zoomOf(it, pw) { return `calc(var(--k, 1) * ${it.w} / ${natOf(it.kind, pw)})`; }

  window.XyntalPageCanvas = { EMBEDS, parseEmbed, BLOCKS, NARROW, WIDE, FULL, WIDTHS, natOf, mount, zoomOf, W, MIN_H, MAX_H, DEFAULTS, normalize, html, itemHtml, background, hex, num, round, esc, safeUrl };
})();
