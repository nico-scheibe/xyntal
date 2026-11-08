// Freie Seite unter xyntal.de/name: Layout (Text, Links, Bilder frei positioniert) prüfen und als HTML ausgeben.
// Genutzt von u.js (öffentliche Seite) und page-editor.js (Editor), damit beide exakt dasselbe zeigen.
// Alles, was aus der Datenbank kommt, wird hier auf erlaubte Werte begrenzt – Farben nur als #rrggbb, Bilder nur aus dem eigenen Ordner.
(() => {
  const W = 480;                       // Breite der Zeichenfläche in Einheiten; die Seite skaliert sie auf die echte Breite
  const MIN_H = 240, MAX_H = 4000;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const round = (n) => Math.round(n * 10) / 10;
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : d);
  const FONTS = { sans: "var(--f-text, system-ui, sans-serif)", serif: "'Source Serif 4', Georgia, serif", mono: "ui-monospace, 'IBM Plex Mono', monospace" };
  const SRC = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
  const UUID = /^[0-9a-f-]{36}$/;
  const TYPES = ["text", "link", "image", "block"];
  // Bausteine der Profilseite: Inhalt liefert u.js aus dem Profil; hier nur Name, Anzeigename und natürliche Breite in px
  const BLOCKS = { card: ["Karte", 360], head: ["Steckbrief", 440], about: ["Über mich", 440], offer: ["Ich biete", 340], seek: ["Ich suche", 340], skills: ["Skills", 440] };
  const safeUrl = (u) => (/^https?:\/\/[^\s]+$/i.test(u || "") ? u : "");

  const DEFAULTS = {
    text: { w: 240, h: 56, text: "Dein Text", size: 24, weight: 700, align: "left", font: "sans", color: "#eceae4", bg: "", radius: 0 },
    link: { w: 280, h: 56, size: 16, color: "#eceae4", bg: "#2a2a2a", radius: 14, icon: true },
    image: { w: 180, h: 180, radius: 16, fit: "cover" },
    block: { w: 300, h: 200, radius: 0 },
  };

  function cleanItem(raw, i) {
    if (!raw || typeof raw !== "object" || !TYPES.includes(raw.type)) return null;
    const type = raw.type, d = DEFAULTS[type];
    const it = {
      id: /^[a-z0-9]{1,12}$/i.test(raw.id || "") ? raw.id : `i${i}`,
      type,
      x: round(num(raw.x, -W, W * 2, 0)), y: round(num(raw.y, -MAX_H, MAX_H, 0)),
      w: round(num(raw.w, 16, W * 2, d.w)), h: round(num(raw.h, 16, MAX_H, d.h)),
      o: round(num(raw.o, 0.1, 1, 1)),
      rot: round(num(raw.rot, -360, 360, 0)),
      radius: round(num(raw.radius, 0, 200, d.radius)),
    };
    if (type !== "image" && type !== "block") {
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
    return { v: 1, h: Math.round(num(p.h, MIN_H, MAX_H, 640)), bg: { color: hex(bg.color, "#1c1c1c"), color2: hex(bg.color2, "") }, items };
  }

  const u = (n) => `calc(${round(n)} * 100cqw / ${W})`;
  const background = (bg) => (bg.color2 ? `linear-gradient(160deg, ${bg.color}, ${bg.color2})` : bg.color);

  function itemHtml(it, links, o) {
    const pos = `left:${u(it.x)};top:${u(it.y)};width:${u(it.w)};height:${u(it.h)};opacity:${it.o}${it.rot ? `;transform:rotate(${it.rot}deg)` : ""}`;
    const attrs = `class="pc-item pc-${it.type}" data-id="${esc(it.id)}" style="${pos}"`;
    if (it.type === "block") {
      // Höhe ergibt sich aus dem Inhalt; der Baustein wird mit seiner Breite skaliert (zoom, --k = Pixel je Einheit, gesetzt von mount)
      const inner = o.block ? o.block(it.kind) : "";
      if (!inner) return o.edit ? `<div class="pc-item pc-block is-empty" data-id="${esc(it.id)}" style="${pos.replace(/height:[^;]+;/, "")}"><div class="pc-blk-empty">${esc(BLOCKS[it.kind][0])}</div></div>` : "";
      return `<div class="pc-item pc-block" data-id="${esc(it.id)}" data-kind="${it.kind}" style="${pos.replace(/height:[^;]+;/, "")}"><div class="pc-blk" style="width:${BLOCKS[it.kind][1]}px;zoom:calc(var(--k, 1) * ${it.w} / ${BLOCKS[it.kind][1]})">${inner}</div></div>`;
    }
    if (it.type === "image") {
      return `<div ${attrs}><img src="${esc(`${o.base}/storage/v1/object/public/page-media/${it.src}`)}" alt="${esc(it.alt)}" draggable="false" loading="lazy" decoding="async" style="object-fit:${it.fit};border-radius:${u(it.radius)}"></div>`;
    }
    const box = `font-size:${u(it.size)};color:${it.color};${it.bg ? `background:${it.bg};` : ""}border-radius:${u(it.radius)}`;
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
    const p = normalize(page), o = { base: "", links: [], edit: false, ...opts };
    return `<div class="pc-wrap"><div class="pc${o.edit ? " is-edit" : ""}" style="aspect-ratio:${W} / ${p.h};background:${background(p.bg)}">${p.items.map((it) => itemHtml(it, o.links, o)).join("")}</div></div>`;
  }

  // --k = Pixel je Einheit, damit Bausteine (feste Pixelgröße) mit der Fläche mitskalieren
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver((list) => list.forEach((e) => e.target.style.setProperty("--k", String(e.contentRect.width / W)))) : null;
  function mount(host) {
    host.querySelectorAll(".pc").forEach((el) => {
      el.style.setProperty("--k", String(el.getBoundingClientRect().width / W));
      if (ro) ro.observe(el);
    });
  }
  const zoomOf = (it) => `calc(var(--k, 1) * ${it.w} / ${BLOCKS[it.kind][1]})`;

  window.XyntalPageCanvas = { BLOCKS, mount, zoomOf, W, MIN_H, MAX_H, DEFAULTS, normalize, html, itemHtml, background, hex, num, round, esc, safeUrl };
})();
