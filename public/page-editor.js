// Editor der freien Seite, läuft direkt auf xyntal.de/name (u.js öffnet ihn über #gestalten): Text, Links und Bilder ohne Raster platzieren, Farben wählen, speichern (RPC save_my_page).
// Darstellung kommt aus page-canvas.js – der Editor zeigt exakt, was Besucher unter xyntal.de/name sehen.
(() => {
  const C = window.XyntalPageCanvas, I = window.XyntalLinkIcons, cfg = window.XYNTAL_CONFIG;
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const { esc, round, num } = C;
  const markup = () => `
    <p class="pe-msg" data-loading>${esc(t("Wird geladen …"))}</p>
    <div class="pe-edit" data-editor hidden>
      <section class="pe-stage" data-stage aria-label="${esc(t("Deine Seite – Elemente mit der Maus ziehen"))}"></section>
    </div>
    <aside class="pe-insp" data-insp aria-label="${esc(t("Eigenschaften"))}" hidden></aside>
    <div class="pe-pop" data-pop hidden></div>
    <div class="pe-dock" role="toolbar" aria-label="${esc(t("Seite gestalten"))}">
      <button type="button" class="pe-btn" data-done>${esc(t("Fertig"))}</button>
      <i class="pe-sep" aria-hidden="true"></i>
      <button type="button" class="pe-btn" data-add="window">+ ${esc(t("Fenster"))}</button>
      <button type="button" class="pe-btn" data-add="text">+ ${esc(t("Text"))}</button>
      <button type="button" class="pe-btn" data-add="link">+ ${esc(t("Link"))}</button>
      <label class="pe-btn" tabindex="0" data-upload-label>+ ${esc(t("Bild"))}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-upload hidden></label>
      <button type="button" class="pe-btn" data-add="block">+ ${esc(t("Mehr"))}</button>
      <button type="button" class="pe-btn" data-add="layout">${esc(t("Layout"))}</button>
      <button type="button" class="pe-btn" data-add="layers">${esc(t("Ebenen"))}</button>
      <button type="button" class="pe-btn" data-add="bg">${esc(t("Hintergrund"))}</button>
      <button type="button" class="pe-btn" data-add="extras">${esc(t("Extras"))}</button>
      <button type="button" class="pe-btn" data-phone aria-pressed="false" title="${esc(t("Handy-Vorschau"))}" aria-label="${esc(t("Handy-Vorschau"))}">📱</button>
      <i class="pe-sep" aria-hidden="true"></i>
      <button type="button" class="pe-btn" data-undo title="${esc(t("Rückgängig (Strg+Z)"))}" aria-label="${esc(t("Rückgängig"))}" disabled>↶</button>
      <button type="button" class="pe-btn" data-redo title="${esc(t("Wiederholen (Strg+Umschalt+Z)"))}" aria-label="${esc(t("Wiederholen"))}" disabled>↷</button>
      <button type="button" class="pe-btn pe-primary" data-save disabled title="${esc(t("Veröffentlichen (Strg+S)"))}">${esc(t("Veröffentlichen"))}</button>
      <p class="pe-status" role="status" aria-live="polite" data-status></p>
    </div>`;

  // Öffnet den Editor in root (auf xyntal.de/name selbst) und ersetzt dort die Seite
  function open(root, opts = {}) {
    const $ = (s) => root.querySelector(s);
    root.innerHTML = markup();
    document.body.classList.add("pe-active");
    const loading = $("[data-loading]"), editor = $("[data-editor]"), stage = $("[data-stage]"), insp = $("[data-insp]"), pop = $("[data-pop]");
    const blocks = opts.blocks || {};
    const statusEl = $("[data-status]"), saveBtn = $("[data-save]"), undoBtn = $("[data-undo]"), redoBtn = $("[data-redo]");
    // Fenster und Eigenschaften liegen immer über der Leiste, auch wenn sie in zwei Zeilen umbricht
    const dockEl = $(".pe-dock"), dockH = () => document.documentElement.style.setProperty("--pe-dock", `${dockEl.offsetHeight}px`);
    dockH(); if (typeof ResizeObserver === "function") new ResizeObserver(dockH).observe(dockEl);
    if (!window.supabase || !cfg) { loading.textContent = t("Der Editor konnte nicht geladen werden."); return; }
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

    let page = C.normalize(null), links = [], sel = null, dirty = false, busy = false, uid = "", handle = "", paid = false, hasSaved = false;
    // Entwurf: speichert automatisch (save_my_page_draft, Migration 20261108210000), öffentlich wird erst „Veröffentlichen“
    let canDraft = false, draftSaved = true, draftTimer = 0, views = 0, phone = false;
    const undo = [], redo = [];
    let lastKey = "", lastAt = 0;
    // Gleiche Grenzen prüft die Datenbank (page_item_limit, Migration 20261108110000)
    const limit = () => (paid ? 100 : 40);
    const say = (text, kind = "") => { statusEl.textContent = text; statusEl.className = "pe-status" + (kind ? ` is-${kind}` : ""); };
    const uid8 = () => Math.random().toString(36).slice(2, 10);
    const byId = (id) => page.items.find((i) => i.id === id);
    const current = () => byId(sel);

    // ---- Verlauf (Rückgängig / Wiederholen) ----
    const snap = () => JSON.stringify(page);
    function touch(key) {
      // Fortlaufende Eingaben (Regler, Farbe, Tippen) zählen als ein Schritt
      const now = Date.now();
      if (!(key && key === lastKey && now - lastAt < 900)) { undo.push(snap()); if (undo.length > 100) undo.shift(); redo.length = 0; }
      lastKey = key || ""; lastAt = now;
      dirty = true; saveBtn.disabled = false; say("");
      undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
      queueDraft();
    }
    function queueDraft() {
      draftSaved = false;
      if (!canDraft) return;
      clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2500);
    }
    async function saveDraft() {
      clearTimeout(draftTimer); draftTimer = 0;
      if (!canDraft || draftSaved || !dirty) return;
      if (busy) { draftTimer = setTimeout(saveDraft, 1500); return; }
      // Unbestätigtes Video lehnt die Datenbank ab – erst nach der Bestätigung sichern
      if (page.items.some((i) => i.type === "embed" && !i.own)) return;
      const snapshot = snap();
      try {
        const { error } = await sb.rpc("save_my_page_draft", { p_page: page });
        if (error) throw error;
        if (snap() === snapshot) { draftSaved = true; if (!statusEl.classList.contains("is-error")) say(t("Entwurf gespeichert – noch nicht veröffentlicht.")); }
      } catch (err) { say(saveError(err), "error"); }
    }
    function travel(from, to) {
      if (!from.length) return;
      to.push(snap()); page = C.normalize(JSON.parse(from.pop()));
      if (sel && !byId(sel)) sel = null;
      lastKey = ""; dirty = true; saveBtn.disabled = false;
      undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
      queueDraft(); drawAll();
    }

    // ---- Zeichnen ----
    const u = (n) => `calc(${round(n)} * 100cqw / ${page.w})`;
    function placeOverlay() {
      const el = stage.querySelector(".pe-sel"), it = current();
      if (!el) return;
      if (!it) { el.remove(); return; }
      Object.assign(el.style, { left: u(it.x), top: u(it.y), width: u(it.w), height: u(it.h), transform: it.rot ? `rotate(${it.rot}deg)` : "" });
    }
    // Bausteine haben keine feste Höhe: nach dem Zeichnen messen, damit Auswahlrahmen und Fläche stimmen
    function measure() {
      const cv = stage.querySelector(".pc");
      if (!cv) return;
      const k = cv.getBoundingClientRect().width / page.w;
      page.items.forEach((it) => {
        if (it.type !== "block") return;
        const el = cv.querySelector(`.pc-item[data-id="${CSS.escape(it.id)}"]`);
        if (el && k) { const h = round(el.offsetHeight / k); if (Math.abs(h - it.h) > 0.3) it.h = Math.max(16, h); fit(it); }
      });
    }
    function drawCanvas() {
      const focused = stage.contains(document.activeElement) && document.activeElement.classList.contains("pc-item");
      if (phone) {
        // Handy-Vorschau: so sehen Besucher die Seite am Handy (ohne Bearbeiten; Antippen wählt ein Element für die Eigenschaften)
        stage.innerHTML = `<div class="pe-phone"><div class="pe-phone-in">${C.html({ ...page, cursor: "" }, { links, base: cfg.supabaseUrl, t, views, block: (kind) => blocks[kind] || "" })}</div></div>`;
        C.mount(stage);
        if (opts.after) opts.after(stage);
        if (sel) stage.querySelector(`.pc-item[data-id="${CSS.escape(sel)}"]`)?.classList.add("pe-in-group");
        return;
      }
      stage.innerHTML = C.html(page, { links, base: cfg.supabaseUrl, edit: true, t, views, block: (kind) => blocks[kind] || "" });
      C.mount(stage);
      if (opts.after) opts.after(stage);
      measure();
      const cv = stage.querySelector(".pc");
      // Tastatur und Screenreader: jedes Element ist erreichbar (Tab), Fokus wählt es aus, Pfeile schieben
      cv.querySelectorAll(".pc-item[data-id]").forEach((el) => {
        const it = byId(el.dataset.id);
        if (!it) return;
        el.tabIndex = 0; el.setAttribute("role", "button"); el.setAttribute("aria-label", t(itemName(it)));
        if (it.id === sel) el.setAttribute("aria-pressed", "true");
      });
      if (focused && sel) cv.querySelector(`.pc-item[data-id="${CSS.escape(sel)}"]`)?.focus({ preventScroll: true });
      cv.style.aspectRatio = `${page.w} / ${page.h}`;
      group.forEach((id) => stage.querySelector(`.pc-item[data-id="${CSS.escape(id)}"]`)?.classList.add("pe-in-group"));
      const it = current();
      if (it) {
        cv.insertAdjacentHTML("beforeend", `<div class="pe-sel"><i data-h="rot" title="${esc(t("Drehen (Umschalt = 15°-Schritte)"))}"></i><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div>`);
        placeOverlay();
      }
    }
    // Hintergrund, Höhe, Anzahl: Fenster über der Werkzeugleiste
    const bgPanel = () => `<h2>${esc(t("Overlays"))}</h2>
      <div class="pe-tiles">${Object.entries(C.OVERLAYS).map(([k, v]) => `<button type="button" class="pe-tile${page.ov.includes(k) ? " is-on" : ""}" data-ov="${k}" aria-pressed="${page.ov.includes(k)}">${esc(t(v[0]))}</button>`).join("")}</div>
      <h2>${esc(t("Hintergrund"))}</h2>
      <label class="pe-field"><span>${esc(t("Farbe"))}</span><input type="color" data-bg="color" value="${page.bg.color}"></label>
      <label class="pe-field"><span>${esc(t("Verlauf"))}</span><input type="checkbox" data-bg-gradient ${page.bg.color2 ? "checked" : ""}></label>
      ${page.bg.color2 ? `<label class="pe-field"><span>${esc(t("Zweite Farbe"))}</span><input type="color" data-bg="color2" value="${page.bg.color2}"></label>` : ""}
      <div class="pe-field"><span>${esc(t("Breite"))}</span></div>
      <div class="pe-row">${[[C.FULL, "Ganzer Bildschirm"], [C.WIDE, "Inhaltsbreite"], [C.NARROW, "Eine Spalte"]].map(([w, label]) =>
        `<button type="button" class="pe-btn${page.w === w ? " is-on" : ""}" data-width="${w}">${esc(t(label))}</button>`).join("")}</div>
      <label class="pe-field"><span>${esc(t("Höhe"))}</span><input type="range" min="240" max="2400" step="10" data-height value="${page.h}"></label>
      <label class="pe-field"><span>${esc(t("Bewegter Verlauf"))}</span><input type="checkbox" data-bga ${page.bga ? "checked" : ""}></label>
      <h2 data-no-i18n>Cursor</h2>
      <label class="pe-field"><span>${esc(t("Mauszeiger"))}</span><select data-cursor-sel data-no-i18n><option value="">Default</option>${Object.entries(C.CURSORS).map(([k, v]) => `<option value="${k}"${page.cursor === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
      ${page.cursor === "emoji" ? `<div class="pe-row">${C.CURSOR_EMOJI.map((e) => `<button type="button" class="pe-btn${page.cemo === e ? " is-on" : ""}" data-cemo="${e}">${e}</button>`).join("")}</div>` : ""}
      <h2>${esc(t("Hintergrund-Video"))}</h2>
      ${page.bgv ? `<p class="pe-hint">${esc(t("Eigenes Video läuft stumm im Hintergrund."))}</p><button type="button" class="pe-btn pe-danger" data-bgv-del>${esc(t("Video entfernen"))}</button>`
        : `${ownCheck("data-bgv-own", false)}<label class="pe-btn" data-bgv-label>+ ${esc(t("Video hochladen (MP4/WebM, max. 15 MB)"))}<input type="file" accept="video/mp4,video/webm" data-bgv-file hidden></label>`}
      <p class="pe-count">${page.items.length} / ${limit()} ${esc(t("Elemente"))}</p>
      <button type="button" class="pe-btn pe-danger" data-reset>${esc(t("Auf Standardseite zurücksetzen"))}</button>`;
    // Vorlagen im Menü „+ Mehr“: Typ und Startwerte
    const MAKE = [
      { key: "heading", group: "text", icon: "H", label: "Überschrift", type: "text", v: { text: "Große Überschrift", w: 520, h: 76, size: 56, weight: 700, font: "serif" } },
      { key: "quote", group: "text", icon: "❝", label: "Zitat", type: "text", v: { text: "„Ein gutes Zitat über dich oder deine Idee.“", w: 420, h: 110, size: 26, weight: 400, font: "serif", align: "center", color: "#ece6d4" } },
      { key: "sticker", group: "text", icon: "🚀", label: "Sticker", type: "text", v: { text: "🚀", w: 120, h: 120, size: 88, align: "center" } },
      { key: "badge", group: "text", icon: "●", label: "Badge", type: "text", v: { text: "Offen für Projekte", w: 220, h: 44, size: 15, weight: 700, align: "center", bg: "#2f6b4f", color: "#d9ffe9", radius: 999 } },
      { key: "card", group: "text", icon: "▭", label: "Info-Fenster", type: "text", v: { text: "Titel\nEin paar Sätze über ein Projekt, ein Angebot oder eine Neuigkeit.", w: 320, h: 150, size: 17, weight: 400, bg: "#262633", radius: 20, bw: 1, bc: "#3d3d52", sh: true } },
      { key: "rect", group: "shape", icon: "■", label: "Rechteck", type: "shape", v: { kind: "rect", w: 260, h: 160, radius: 24, bg: "#5b8cff" } },
      { key: "circle", group: "shape", icon: "●", label: "Kreis", type: "shape", v: { kind: "circle", w: 180, h: 180, bg: "#b95cff", bg2: "#3fd8ff" } },
      { key: "line", group: "shape", icon: "―", label: "Linie", type: "shape", v: { kind: "line", w: 360, h: 4, bg: "#eceae4" } },
      { key: "glow", group: "shape", icon: "◐", label: "Verlauf", type: "shape", v: { kind: "rect", w: 420, h: 260, radius: 32, bg: "#ff5fd2", bg2: "#5b8cff", o: 0.35 } },
      { key: "button", group: "act", icon: "⬭", label: "Knopf", type: "button", v: {} },
      { key: "icons", group: "act", icon: "◎", label: "Link-Symbole", type: "icons", v: {} },
      { key: "countdown", group: "act", icon: "⏱", label: "Countdown", type: "countdown", v: {} },
      { key: "contact", group: "act", icon: "✉", label: "Kontakt", type: "contact", v: {} },
      { key: "counter", group: "act", icon: "👁", label: "Aufrufe", type: "counter", v: {} },
      { key: "status", group: "text", icon: "🟢", label: "Status", type: "text", v: { text: "● Open to Work", w: 220, h: 44, size: 15, weight: 700, align: "center", bg: "#123d2a", color: "#7dffb2", radius: 999, anim: { p: "pulse", trig: "load", d: 1.8, loop: true } } },
      { key: "gradtext", group: "text", icon: "🌈", label: "Verlaufstext", type: "text", v: { text: "Bau was Großes", w: 560, h: 80, size: 56, weight: 700, align: "center", color: "#ff5fd2", c2: "#5b8cff", tfx: "gradient" } },
      { key: "glass", group: "text", icon: "◫", label: "Glas-Fenster", type: "text", v: { text: "Glas-Fenster\nLiegt halbdurchsichtig über allem dahinter.", w: 320, h: 140, size: 17, weight: 400, bg: "#ffffff", radius: 22, glass: true } },
    ];
    // Video / Musik: nur eigene Projekte – vor dem Einbetten bestätigen (Community-Richtlinien, Regel 8)
    const ownCheck = (attr, on) => `<label class="pe-own"><input type="checkbox" ${attr}${on ? " checked" : ""}>
      <span>${esc(t("Ich bestätige: Das ist mein eigenes Projekt (selbst gemacht oder ich habe alle Rechte daran). Fremde Videos oder Musik sind nicht erlaubt und können zur Sperre des Kontos führen."))}
      <a class="text-link" href="/community-richtlinien#gesetz" target="_blank" rel="noopener">${esc(t("Richtlinien"))}</a></span></label>`;
    let popName = "";
    function showPop(name) {
      popName = popName === name ? "" : name;
      pop.hidden = !popName;
      if (!popName) return;
      if (name === "link") {
        pop.innerHTML = links.length
          ? `<h2>${esc(t("Link einfügen"))}</h2>` + links.map((l) => `<button type="button" class="pe-item" data-pick="${esc(l.id)}">${esc(l.title)}</button>`).join("")
          : `<p>${esc(t("Du hast noch keine Links."))} <a class="text-link" href="/profil#links">${esc(t("Links anlegen"))}</a></p>`;
      } else if (name === "block") {
        const free = Object.keys(C.BLOCKS).filter((k) => blocks[k] && !page.items.some((i) => i.type === "block" && i.kind === k));
        const tile = (attr, icon, label) => `<button type="button" class="pe-tile" ${attr}><span aria-hidden="true">${icon}</span>${esc(t(label))}</button>`;
        pop.innerHTML = `
          <h2>${esc(t("Vorlagen"))}</h2>
          <div class="pe-tiles">${MAKE.filter((m) => m.group === "text").map((m) => tile(`data-make="${m.key}"`, m.icon, m.label)).join("")}</div>
          <h2>${esc(t("Formen"))}</h2>
          <div class="pe-tiles">${MAKE.filter((m) => m.group === "shape").map((m) => tile(`data-make="${m.key}"`, m.icon, m.label)).join("")}</div>
          <h2>${esc(t("Interaktiv"))}</h2>
          <div class="pe-tiles">${MAKE.filter((m) => m.group === "act").map((m) => tile(`data-make="${m.key}"`, m.icon, m.label)).join("")}
            ${tile("data-embed-open", "▶", "Video / Musik")}</div>
          <div class="pe-embed" data-embed-box hidden>
            <input type="url" data-embed-url placeholder="${esc(t("Adresse von YouTube, Vimeo oder Spotify"))}">
            ${ownCheck("data-embed-own", false)}
            <button type="button" class="pe-btn pe-primary" data-embed-go disabled>${esc(t("Einbetten"))}</button>
          </div>
          <h2>${esc(t("Bausteine deines Profils"))}</h2>
          ${free.length ? `<div class="pe-tiles">${free.map((k) => tile(`data-block="${k}"`, "▣", C.BLOCKS[k][0])).join("")}</div>` : `<p>${esc(t("Alle Bausteine liegen schon auf der Seite."))}</p>`}`;
      } else if (name === "layout") {
        pop.innerHTML = `<h2>${esc(t("Aufbau-Vorlagen"))}</h2>
          <p>${esc(t("Ordnet Karte, Links, Profil-Bausteine, Texte und Bilder neu an. Rückgängig geht mit ↶."))}</p>
          <div class="pe-tiles pe-layouts">${Object.entries(LAYOUTS).map(([k, v]) => `<button type="button" class="pe-tile" data-layout="${k}">${v.icon}${esc(t(v.label))}</button>`).join("")}</div>
          <h2 data-no-i18n>Themes</h2>
          <p>${esc(t("Färbt die ganze Seite auf einmal um: Hintergrund, Overlays, Farben, Schrift und Hover."))}</p>
          <div class="pe-tiles">${Object.entries(THEMES).map(([k, v]) => `<button type="button" class="pe-tile pe-theme" data-theme="${k}" style="--t1:${v.bg[0]};--t2:${v.bg[1] || v.bg[0]};--ta:${v.accent}"><span aria-hidden="true"></span><b data-no-i18n>${v.name}</b></button>`).join("")}</div>`;
      } else if (name === "layers") {
        pop.innerHTML = layersPanel();
      } else if (name === "extras") {
        pop.innerHTML = extrasPanel(); loadExtras();
      } else pop.innerHTML = bgPanel();
    }
    function drawSide() { if (popName === "bg") pop.innerHTML = bgPanel(); else if (popName === "layers") pop.innerHTML = layersPanel(); }
    function drawAll() { drawCanvas(); drawSide(); drawInsp(); }

    // ---- Eigenschaften des gewählten Elements ----
    const num$ = (k, label, v, lo, hi, step = 1) => `<label class="pe-field"><span>${esc(t(label))}</span><input type="number" data-p="${k}" value="${round(v)}" min="${lo}" max="${hi}" step="${step}"></label>`;
    const range$ = (k, label, v, lo, hi, step = 1) => `<label class="pe-field"><span>${esc(t(label))}</span><input type="range" data-p="${k}" value="${v}" min="${lo}" max="${hi}" step="${step}"></label>`;
    const color$ = (k, label, v) => `<label class="pe-field"><span>${esc(t(label))}</span><input type="color" data-p="${k}" value="${v || "#000000"}"></label>`;
    const seg$ = (k, opts, v) => `<div class="pe-row">${opts.map(([val, label]) => `<button type="button" class="pe-btn${String(v) === String(val) ? " is-on" : ""}" data-set="${k}" data-val="${val}">${esc(t(label))}</button>`).join("")}</div>`;
    // Animation des Elements: fertiger Effekt oder eigener Code (Mini-Sprache, page-canvas.js compileAnim)
    const ANIM_EXAMPLE = "0% { verschieben: 0 0; drehen: 0 }\n50% { verschieben: 0 -30; drehen: 10; skalieren: 1.1; farbton: 120 }\n100% { verschieben: 0 0; drehen: 0 }";
    function animPanel(it) {
      const a = it.anim;
      const opts = [["", "Keine"], ...Object.entries(C.ANIMS).map(([k, v]) => [k, v[0]]), ["custom", "Eigene (Code)"]];
      let html = `<h2>${esc(t("Animation"))}</h2>
        <label class="pe-field"><span>${esc(t("Effekt"))}</span><select data-p="a_p">${opts.map(([k, l]) => `<option value="${k}"${(a ? a.p : "") === k ? " selected" : ""}>${esc(t(l))}</option>`).join("")}</select></label>`;
      if (!a) return html;
      html += `${seg$("a_trig", [["load", "Beim Laden"], ["view", "Beim Scrollen"], ["hover", "Bei Maus"]], a.trig)}
        ${range$("a_d", `Dauer (${a.d} s)`, a.d, 0.2, 20, 0.1)}
        ${range$("a_dl", `Verzögerung (${a.dl} s)`, a.dl, 0, 10, 0.1)}
        <label class="pe-field"><span>${esc(t("Endlos wiederholen"))}</span><input type="checkbox" data-p="a_loop" ${a.loop ? "checked" : ""}></label>`;
      if (a.p === "custom") {
        const c = C.compileAnim(a.code, "x");
        html += `<textarea class="pe-code" data-p="a_code" maxlength="1500" spellcheck="false" aria-label="${esc(t("Animations-Code"))}">${esc(a.code)}</textarea>
          <p class="pe-hint${c.error ? " is-err" : ""}" data-anim-err>${esc(c.error ? t(c.error) : t("Code ist gültig."))}</p>
          <details class="pe-help"><summary>${esc(t("Was geht im Code?"))}</summary>
            <p>${esc(t("Schritte in Prozent (0% … 100%, oder von/bis) mit Eigenschaften:"))}</p>
            <p><code>verschieben: x y</code> · <code>drehen: grad</code> · <code>skalieren: f</code> · <code>schräg: grad</code> · <code>deckkraft: 0–1</code> · <code>unschärfe: px</code> · <code>farbton: grad</code> · <code>helligkeit: f</code> · <code>farbe: #rrggbb</code> · <code>hintergrund: #rrggbb</code></p>
            <p>${esc(t("Englisch geht auch: move, rotate, scale, skew, opacity, blur, hue, brightness, color, background."))}</p>
            <p>${esc(t("Normales CSS geht auch – kopiertes CSS mit @keyframes einfach einfügen (Regeln wie .btn:hover { … } werden übersprungen, Hover stellst du unter Auslöser „Bei Maus“ ein). Unterstützt: transform (translate, rotate, scale, skew), filter (blur, hue-rotate, brightness, saturate, contrast, grayscale), opacity, color, background-color, border-color, box-shadow und text-shadow. Farben als #rgb, #rrggbb oder rgba(…)."))}</p>
          </details>`;
      }
      html += `<button type="button" class="pe-btn" data-act="preview">▶ ${esc(t("Vorschau"))}</button>`;
      return html;
    }
    const glass$ = (it) => `<label class="pe-field"><span data-no-i18n>Glass</span><input type="checkbox" data-p="glass" ${it.glass ? "checked" : ""}></label>`;
    function drawInsp() {
      if (group.size > 1) return drawGroupInsp();
      const it = current();
      insp.hidden = !it;
      if (!it) { insp.innerHTML = ""; return; }
      let body = "";
      if (it.type === "block") {
        body = `<p class="pe-hint">${esc(t("Dieser Baustein zeigt deine Profilangaben. Ändern kannst du sie im Profil."))}</p>
          ${color$("color", "Effektfarbe", it.color || "#b95cff")}`;
      } else if (it.type === "text") {
        body = `<textarea data-p="text" maxlength="1000" aria-label="${esc(t("Text"))}">${esc(it.text)}</textarea>
          ${range$("size", "Schriftgröße", it.size, 8, 120)}
          ${seg$("weight", [[400, "Normal"], [700, "Fett"]], it.weight)}
          ${seg$("align", [["left", "Links"], ["center", "Mitte"], ["right", "Rechts"]], it.align)}
          ${seg$("font", [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]], it.font)}
          ${color$("color", "Textfarbe", it.color)}
          <label class="pe-field"><span>${esc(t("Hintergrund"))}</span><input type="checkbox" data-bgon ${it.bg ? "checked" : ""}></label>
          ${it.bg ? color$("bg", "Hintergrundfarbe", it.bg) : ""}
          <label class="pe-field"><span>${esc(t("Text-Effekt"))}</span><select data-p="tfx" data-no-i18n><option value="">None</option>${Object.entries(C.TEXT_FX).map(([k, v]) => `<option value="${k}"${it.tfx === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
          ${it.tfx === "gradient" || it.tfx === "shimmer" ? color$("c2", "Zweite Farbe", it.c2) : ""}
          ${glass$(it)}`;
      } else if (it.type === "countdown") {
        body = `<label class="pe-field"><span>${esc(t("Beschriftung"))}</span></label>
          <input type="text" data-p="text" maxlength="60" value="${esc(it.text)}">
          <label class="pe-field"><span>${esc(t("Bis"))}</span><input type="datetime-local" data-p="date" value="${esc(it.date)}"></label>
          ${range$("size", "Schriftgröße", it.size, 12, 120)}
          ${color$("color", "Textfarbe", it.color)}
          ${color$("bg", "Hintergrundfarbe", it.bg || "#1f1f2b")}`;
      } else if (it.type === "contact" || it.type === "counter") {
        body = `<label class="pe-field"><span>${esc(t("Beschriftung"))}</span></label>
          <input type="text" data-p="text" maxlength="${it.type === "contact" ? 80 : 40}" value="${esc(it.text)}">
          <p class="pe-hint">${esc(t(it.type === "contact" ? "Besucher kommen damit direkt in deine Nachrichten (ohne Konto erst zur Anmeldung)." : "Zeigt, wie oft deine Seite aufgerufen wurde. Deine eigenen Aufrufe zählen nicht."))}</p>
          ${range$("size", "Schriftgröße", it.size, 8, 80)}
          ${color$("color", "Textfarbe", it.color)}
          ${color$("bg", "Hintergrundfarbe", it.bg || "#eceae4")}
          ${it.type === "contact" ? glass$(it) : ""}`;
      } else if (it.type === "link") {
        body = `<label class="pe-field"><span>${esc(t("Link"))}</span><select data-p="ref">${links.map((l) => `<option value="${esc(l.id)}"${l.id === it.ref ? " selected" : ""}>${esc(l.title)}</option>`).join("")}</select></label>
          ${range$("size", "Schriftgröße", it.size, 8, 60)}
          ${color$("color", "Textfarbe", it.color)}
          ${color$("bg", "Hintergrundfarbe", it.bg || "#2a2a2a")}
          <label class="pe-field"><span>${esc(t("Symbol zeigen"))}</span><input type="checkbox" data-p="icon" ${it.icon ? "checked" : ""}></label>`;
      } else if (it.type === "shape") {
        body = `${seg$("kind", [["rect", "Rechteck"], ["circle", "Kreis"], ["line", "Linie"]], it.kind)}
          ${color$("bg", "Farbe", it.bg)}
          <label class="pe-field"><span>${esc(t("Verlauf"))}</span><input type="checkbox" data-bg2on ${it.bg2 ? "checked" : ""}></label>
          ${it.bg2 ? color$("bg2", "Zweite Farbe", it.bg2) : ""}
          ${glass$(it)}`;
      } else if (it.type === "button") {
        body = `<label class="pe-field"><span>${esc(t("Beschriftung"))}</span></label>
          <input type="text" data-p="text" maxlength="80" value="${esc(it.text)}">
          <label class="pe-field"><span>${esc(t("Adresse"))}</span></label>
          <input type="text" data-p="url" maxlength="500" value="${esc(it.url)}" placeholder="https://…" autocapitalize="off" spellcheck="false">
          ${it.url ? "" : `<p class="pe-hint">${esc(t("Ohne gültige https://-Adresse ist der Knopf auf der Seite nicht klickbar."))}</p>`}
          ${range$("size", "Schriftgröße", it.size, 8, 60)}
          ${color$("color", "Textfarbe", it.color)}
          ${color$("bg", "Hintergrundfarbe", it.bg || "#eceae4")}
          ${glass$(it)}`;
      } else if (it.type === "icons") {
        body = `<p class="pe-hint">${esc(t("Zeigt alle deine Links als Symbole. Links verwaltest du im Profil unter Links."))}</p>
          ${range$("size", "Größe", it.size, 12, 60)}
          ${seg$("align", [["left", "Links"], ["center", "Mitte"], ["right", "Rechts"]], it.align)}
          ${color$("color", "Symbolfarbe", it.color)}
          ${color$("bg", "Hintergrund", it.bg || "#2a2a2a")}`;
      } else if (it.type === "embed") {
        body = `<p class="pe-hint">${esc(t({ youtube: "YouTube-Video", vimeo: "Vimeo-Video", spotify: "Spotify" }[it.provider]))}</p>
          ${it.own ? "" : `<p class="pe-hint is-err">${esc(t("Noch nicht bestätigt – wird auf deiner Seite nicht gezeigt."))}</p>`}
          ${ownCheck("data-own-confirm", it.own)}
          <input type="url" data-embed-change placeholder="${esc(t("Neue Adresse einfügen"))}">`;
      } else {
        body = `${seg$("fit", [["cover", "Füllen"], ["contain", "Einpassen"]], it.fit)}
          <label class="pe-field"><span>${esc(t("Beschreibung"))}</span></label>
          <input type="text" data-p="alt" maxlength="120" value="${esc(it.alt)}" placeholder="${esc(t("Alternativtext für Screenreader"))}">`;
      }
      const block = it.type === "block";
      const TITLES = { text: "Text", link: "Link", image: "Bild", shape: "Form", button: "Knopf", icons: "Link-Symbole", embed: "Video / Musik", countdown: "Countdown", contact: "Kontakt", counter: "Aufrufe" };
      const frame = block ? "" : `${range$("bw", "Rahmen", it.bw, 0, 16)}${it.bw ? color$("bc", "Rahmenfarbe", it.bc) : ""}
        <label class="pe-field"><span>${esc(t("Schatten"))}</span><input type="checkbox" data-p="sh" ${it.sh ? "checked" : ""}></label>`;
      insp.innerHTML = `<div class="pe-insp-head" data-insp-drag title="${esc(t("Ziehen zum Verschieben"))}"><h2>${esc(t(block ? C.BLOCKS[it.kind][0] : TITLES[it.type]))}</h2><button type="button" class="pe-x" data-insp-close aria-label="${esc(t("Schließen"))}">×</button></div>
        ${body}
        ${block || (it.type === "shape" && it.kind !== "rect") ? "" : range$("radius", "Rundung", Math.min(it.radius, 200), 0, 200)}
        ${frame}
        ${range$("o", "Deckkraft", it.o, 0.1, 1, 0.05)}
        ${range$("rot", "Drehung", it.rot, -180, 180)}
        ${it.rot ? `<button type="button" class="pe-btn" data-set="rot" data-val="0">${esc(t("Gerade stellen"))}</button>` : ""}
        ${C.HOVER_TYPES.includes(it.type) ? `<h2 data-no-i18n>Hover</h2>
        <label class="pe-field"><span>${esc(t("Bei Maus"))}</span><select data-p="hover" data-no-i18n><option value="">None</option>${[...new Set(Object.values(C.HOVERS).map((v) => v[1]))].map((g) => { const opts = Object.entries(C.HOVERS).filter(([k, v]) => v[1] === g && C.hoverFits(k, it.type, it.kind)).map(([k, v]) => `<option value="${k}"${it.hover === k ? " selected" : ""}>${esc(v[0])}</option>`).join(""); return opts ? `<optgroup label="${esc(g)}">${opts}</optgroup>` : ""; }).join("")}</select></label>
        ${it.hover ? `<button type="button" class="pe-btn" data-act="hover-preview">▶ ${esc(t("Hover testen"))}</button>` : ""}` : ""}
        ${animPanel(it)}
        <h2>${esc(t("Position"))}</h2>
        <label class="pe-field"><span data-no-i18n>Parallax</span><select data-p="px" data-no-i18n><option value="">Off</option><option value="back"${it.px === "back" ? " selected" : ""}>Back (slow)</option><option value="mid"${it.px === "mid" ? " selected" : ""}>Middle</option><option value="front"${it.px === "front" ? " selected" : ""}>Front (fast)</option></select></label>
        ${num$("x", "Links", it.x, -page.w, page.w * 2)}${num$("y", "Oben", it.y, -4000, 4000)}${num$("w", "Breite", it.w, 16, page.w * 2)}${block ? "" : num$("h", "Höhe", it.h, 16, 4000)}
        ${page.w === C.NARROW ? "" : `${num$("mo", "Platz am Handy", it.mo, 0, 99)}<p class="pe-hint">${esc(t("Am Handy steht alles untereinander. 1 = ganz oben, 0 = automatisch nach Lage. 📱 zeigt die Vorschau."))}</p>`}
        ${it.type === "link" ? `<button type="button" class="pe-btn pe-primary" data-act="stack">${esc(t("Alle Links hierunter anheften"))}</button>
        <p class="pe-hint">${esc(t("Alle anderen Links bekommen Breite, Höhe und Aussehen dieses Links und stehen genau untereinander."))}</p>` : ""}
        <div class="pe-row">
          <button type="button" class="pe-btn" data-act="front">${esc(t("Nach vorn"))}</button>
          <button type="button" class="pe-btn" data-act="back">${esc(t("Nach hinten"))}</button>
          ${block ? "" : `<button type="button" class="pe-btn" data-act="dup">${esc(t("Duplizieren"))}</button>`}
          <button type="button" class="pe-btn pe-danger" data-act="del">${esc(t(block ? "Entfernen" : "Löschen"))}</button>
        </div>`;
    }

    // Eigenschaften-Fenster: am Kopf verschiebbar (große Bildschirme), × hebt die Auswahl auf
    let pane = null;
    insp.addEventListener("pointerdown", (e) => {
      if (!e.target.closest("[data-insp-drag]") || e.target.closest("[data-insp-close]") || !matchMedia("(min-width: 1101px)").matches) return;
      const r = insp.getBoundingClientRect();
      pane = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      insp.setPointerCapture(e.pointerId); e.preventDefault();
    });
    insp.addEventListener("pointermove", (e) => {
      if (!pane || e.pointerId !== pane.id) return;
      const x = Math.min(innerWidth - 80, Math.max(0, e.clientX - pane.dx)), y = Math.min(innerHeight - 60, Math.max(56, e.clientY - pane.dy));
      Object.assign(insp.style, { left: `${x}px`, top: `${y}px`, right: "auto" });
    });
    insp.addEventListener("pointerup", () => { pane = null; });
    insp.addEventListener("click", (e) => { if (e.target.closest("[data-insp-close]")) { sel = null; drawAll(); } });

    // ---- Elemente ändern ----
    function add(type, extra = {}) {
      if (page.items.length >= limit()) { say(t("Du hast die Höchstzahl an Elementen erreicht."), "error"); return null; }
      touch();
      const d = C.DEFAULTS[type];
      const it = C.normalize({ items: [{ id: uid8(), type, x: 0, y: 0, ...d, ...extra }] }).items[0];
      if (!it) return null;
      // In die sichtbare Mitte der Fläche, leicht versetzt, damit mehrere neue nicht exakt übereinander liegen
      const off = (page.items.length % 6) * 12;
      if (type === "block") {
        // Bausteine kommen unter die vorhandenen Elemente, mittig
        it.x = round((page.w - it.w) / 2); it.y = round(page.items.reduce((m, i) => Math.max(m, i.y + i.h), 6) + 18);
      } else { it.x = round(Math.max(0, (page.w - it.w) / 2) + off); it.y = round(Math.min(page.h - it.h, 40 + off * 4)); }
      page.items.push(it); sel = it.id;
      fit(it); drawAll();
      return it;
    }
    // Wächst ein Element über die Fläche hinaus, wächst die Fläche mit
    function fit(it) { const need = Math.ceil(it.y + it.h + 24); if (need > page.h) page.h = Math.min(C.MAX_H, need); }
    function setProp(it, k, v) {
      if (k.startsWith("a_")) {
        const f = k.slice(2);
        if (f === "p" && !v) { it.anim = null; return; }
        const base = f === "p" ? { p: v, code: v === "custom" ? (it.anim && it.anim.code) || ANIM_EXAMPLE : "", trig: it.anim ? it.anim.trig : "load" } : { ...it.anim, [f]: v };
        // beim Wechsel des Effekts Dauer und Wiederholung auf dessen Standard zurücksetzen
        if (f === "p") { delete base.d; delete base.loop; }
        it.anim = C.cleanAnim(base);
        return;
      }
      if (k === "text") it.text = String(v).slice(0, { button: 80, contact: 80, countdown: 60, counter: 40 }[it.type] || 1000);
      else if (k === "mo") it.mo = Math.round(num(v, 0, 99, it.mo || 0));
      else if (k === "date") { if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) it.date = v; }
      else if (k === "tfx") it.tfx = C.TEXT_FX[v] ? v : "";
      else if (k === "px") it.px = C.PARALLAX[v] !== undefined ? v : "";
      else if (k === "url") it.url = C.safeUrl(String(v).trim().slice(0, 500));
      else if (k === "icon" || k === "sh" || k === "glass") it[k] = !!v;
      else if (["color", "bg", "bg2", "bc", "c2"].includes(k)) it[k] = C.hex(v, it[k]);
      else if (["align", "font", "fit", "ref", "alt", "kind"].includes(k)) it[k] = v;
      else if (k === "hover") it.hover = C.HOVERS[v] ? v : "";
      else if (k === "weight") it.weight = Number(v) === 400 ? 400 : 700;
      else {
        const R = { x: [-C.FULL, C.FULL * 2], y: [-4000, 4000], w: [16, C.FULL * 2], h: [16, 4000], size: [8, 160], radius: [0, 999], o: [0.1, 1], rot: [-360, 360], bw: [0, 16] }[k];
        if (R) it[k] = round(num(v, R[0], R[1], it[k]));
      }
    }
    insp.addEventListener("input", (e) => {
      const it = current(), k = e.target.dataset.p;
      if (!it || !k || k === "url") return;
      touch(`${it.id}:${k}`);
      setProp(it, k, e.target.type === "checkbox" ? e.target.checked : e.target.value);
      if (["y", "h"].includes(k)) fit(it);
      drawCanvas();
      if (k === "a_code") {
        const c = C.compileAnim(e.target.value, "x"), out = insp.querySelector("[data-anim-err]");
        if (out) { out.textContent = c.error ? t(c.error) : t("Code ist gültig."); out.classList.toggle("is-err", !!c.error); }
      }
    });
    // Nach Auswahl-Feldern neu zeichnen (Beschriftungen, abhängige Felder); Textfelder nicht – sonst verschwindet beim
    // Weiterklicken das Feld, in das man gerade klickt
    insp.addEventListener("change", (e) => { if (e.target.dataset.p && e.target.tagName !== "TEXTAREA" && !["text", "number"].includes(e.target.type)) drawInsp(); });
    insp.addEventListener("click", (e) => {
      const it = current();
      const seg = e.target.closest("[data-set]"), act = e.target.closest("[data-act]");
      if (!it) return;
      if (seg) { touch(); setProp(it, seg.dataset.set, seg.dataset.val); drawAll(); return; }
      if (!act) return;
      const i = page.items.indexOf(it);
      if (act.dataset.act === "del") { touch(); page.items.splice(i, 1); sel = null; }
      else if (act.dataset.act === "front") { touch(); page.items.push(page.items.splice(i, 1)[0]); }
      else if (act.dataset.act === "back") { touch(); page.items.unshift(page.items.splice(i, 1)[0]); }
      else if (act.dataset.act === "stack") { stackLinks(it); return; }
      else if (act.dataset.act === "preview") { preview(it); return; }
      else if (act.dataset.act === "hover-preview") {
        // Hover im Editor zeigen (Mausereignisse gehen hier an den Editor): Zustand 1,6 s halten
        const el = stage.querySelector(`.pc-item[data-id="${CSS.escape(it.id)}"]`);
        if (el) { el.classList.add("is-hover"); clearTimeout(el._hv); el._hv = setTimeout(() => el.classList.remove("is-hover"), 1600); }
        return;
      }
      else if (act.dataset.act === "dup") {
        if (page.items.length >= limit()) { say(t("Du hast die Höchstzahl an Elementen erreicht."), "error"); return; }
        touch(); const copy = { ...it, id: uid8(), x: it.x + 16, y: it.y + 16 }; page.items.push(copy); sel = copy.id; fit(copy);
      }
      drawAll();
    });
    insp.addEventListener("change", (e) => {
      const it = current();
      if (!it) return;
      if (e.target.dataset.bgon !== undefined) { touch(); it.bg = e.target.checked ? "#2a2a2a" : ""; drawAll(); }
      else if (e.target.dataset.bg2on !== undefined) { touch(); it.bg2 = e.target.checked ? "#3fd8ff" : ""; drawAll(); }
      else if (e.target.dataset.p === "url") { touch(); setProp(it, "url", e.target.value); if (!it.url && e.target.value.trim()) say(t("Bitte eine Adresse mit https:// angeben."), "error"); drawCanvas(); }
      else if (e.target.dataset.ownConfirm !== undefined) { touch(); it.own = e.target.checked; drawAll(); }
      else if (e.target.dataset.embedChange !== undefined) {
        const got = C.parseEmbed(e.target.value);
        if (!got) { say(t("Diese Adresse lässt sich nicht einbetten. Möglich sind YouTube, Vimeo und Spotify."), "error"); return; }
        // Neue Adresse = neuer Inhalt: Bestätigung erneut nötig
        touch(); it.provider = got.provider; it.eid = got.id; it.own = false; drawAll();
        say(t("Bitte bestätige, dass auch das neue Video bzw. die neue Musik dein eigenes Projekt ist."), "");
      }
    });

    // ---- Seite: Hintergrund, Höhe ----
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!pop.contains(el)) return;
      if (el.dataset.bg) { touch(`bg:${el.dataset.bg}`); page.bg[el.dataset.bg] = C.hex(el.value, page.bg[el.dataset.bg]); drawCanvas(); }
      else if (el.dataset.bgGradient !== undefined) { touch(); page.bg.color2 = el.checked ? (page.bg.color2 || "#3a2a6a") : ""; drawAll(); }
      else if (el.dataset.bga !== undefined) { touch(); page.bga = el.checked ? "flow" : ""; if (el.checked && !page.bg.color2) page.bg.color2 = "#3a2a6a"; drawAll(); }
      else if (el.dataset.cursorSel !== undefined) { touch(); page.cursor = C.CURSORS[el.value] ? el.value : ""; drawAll(); }
      else if (el.dataset.height !== undefined) { touch("height"); page.h = Math.round(num(el.value, C.MIN_H, C.MAX_H, page.h)); drawCanvas(); }
    });

    // ---- Ziehen und Skalieren (Maus, Stift, Finger) ----
    let drag = null;
    const scale = () => page.w / stage.querySelector(".pc").getBoundingClientRect().width;
    const centerOf = (id) => { const el = stage.querySelector(`.pc-item[data-id="${CSS.escape(id)}"]`), r = el && el.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }; };
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // Klick auf die Seite beendet die Eingabe im Eigenschaften-Feld (sonst greifen Tastenkürzel wie Strg+C nicht)
      if (document.activeElement && (insp.contains(document.activeElement) || pop.contains(document.activeElement))) document.activeElement.blur();
      if (phone) {
        e.preventDefault();
        const pe = e.target.closest(".pc-item[data-id]");
        sel = pe && byId(pe.dataset.id) ? pe.dataset.id : null; group.clear(); drawCanvas(); drawInsp(); return;
      }
      const handleEl = e.target.closest("[data-h]"), itemEl = e.target.closest(".pc-item");
      if (!handleEl && !itemEl) { if (sel || group.size) { sel = null; group.clear(); drawAll(); } return; }
      // Umschalt+Klick: zur Mehrfachauswahl hinzufügen/entfernen
      if (itemEl && !handleEl && e.shiftKey) {
        e.preventDefault();
        const gid = itemEl.dataset.id;
        if (sel && !group.size) group.add(sel);
        if (group.has(gid)) group.delete(gid); else group.add(gid);
        sel = group.size === 1 ? [...group][0] : null;
        if (group.size === 1) group.clear();
        drawAll(); return;
      }
      // Gruppe ziehen
      if (itemEl && !handleEl && group.size > 1 && group.has(itemEl.dataset.id)) {
        e.preventDefault();
        drag = { mode: "group", x0: e.clientX, y0: e.clientY, s: scale(), moved: false, pid: e.pointerId,
          starts: [...group].map((gid) => { const g = byId(gid); return g && { it: g, x: g.x, y: g.y }; }).filter(Boolean) };
        stage.setPointerCapture(e.pointerId); return;
      }
      if (group.size) { group.clear(); }
      const id = handleEl ? sel : itemEl.dataset.id, it = byId(id);
      if (!it) return;
      e.preventDefault();
      if (sel !== id) { sel = id; drawCanvas(); drawInsp(); }
      drag = { id, mode: handleEl ? handleEl.dataset.h : "move", x0: e.clientX, y0: e.clientY, start: { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot }, s: scale(), moved: false, pid: e.pointerId, c: centerOf(id) };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      if (drag.mode === "group") {
        const gx = (e.clientX - drag.x0) * drag.s, gy = (e.clientY - drag.y0) * drag.s;
        if (!drag.moved) { if (Math.abs(gx) + Math.abs(gy) < 3 / drag.s) return; drag.moved = true; touch(); stage.classList.add("is-moving"); }
        drag.starts.forEach((st) => {
          st.it.x = round(st.x + gx); st.it.y = round(st.y + gy);
          const el = stage.querySelector(`.pc-item[data-id="${CSS.escape(st.it.id)}"]`);
          if (el) Object.assign(el.style, { left: u(st.it.x), top: u(st.it.y) });
        });
        return;
      }
      const it = byId(drag.id), dx = (e.clientX - drag.x0) * drag.s, dy = (e.clientY - drag.y0) * drag.s, b = drag.start;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 3 / drag.s) return;
        drag.moved = true; touch(); stage.classList.add("is-moving");
      }
      if (drag.mode === "move") {
        it.x = round(num(b.x + dx, 16 - b.w, page.w - 16, b.x)); it.y = round(num(b.y + dy, 16 - b.h, page.h - 16, b.y));
        // Magnet: Kanten und Mitten rasten an anderen Elementen ein, und genau 14 Einheiten unter/über einem Element (Alt = frei)
        if (!e.altKey) magnet(it, 7 * drag.s); else showGuides([]);
      } else if (drag.mode === "rot") {
        // Der Griff über dem Element zeigt zum Zeiger
        let a = Math.atan2(e.clientY - drag.c.y, e.clientX - drag.c.x) * 180 / Math.PI + 90;
        if (a > 180) a -= 360;
        it.rot = round(e.shiftKey ? Math.round(a / 15) * 15 : a);
      } else {
        // Gegenüberliegende Ecke bleibt stehen; bei gedrehtem Element wird in dessen Achsen gerechnet
        const sx = drag.mode.includes("w") ? -1 : 1, sy = drag.mode.includes("n") ? -1 : 1;
        const th = (b.rot || 0) * Math.PI / 180, cos = Math.cos(th), sin = Math.sin(th);
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
        const isBlock = it.type === "block";
        const w = round(num(b.w + sx * lx, isBlock ? 60 : 16, page.w * 2, b.w));
        // Bausteine behalten ihr Seitenverhältnis, alles andere ändert Breite und Höhe getrennt
        const h = isBlock ? round(w * b.h / b.w) : round(num(b.h + sy * ly, 16, 4000, b.h));
        const px = sx * (w - b.w) / 2, py = sy * (h - b.h) / 2;
        const cx = b.x + b.w / 2 + px * cos - py * sin, cy = b.y + b.h / 2 + px * sin + py * cos;
        it.w = w; it.h = h; it.x = round(cx - w / 2); it.y = round(cy - h / 2);
      }
      // Direkt am Element, ohne die Fläche neu aufzubauen
      const el = stage.querySelector(`.pc-item[data-id="${CSS.escape(it.id)}"]`);
      if (el) {
        Object.assign(el.style, { left: u(it.x), top: u(it.y), width: u(it.w), transform: it.rot ? `rotate(${it.rot}deg)` : "" });
        if (it.type === "block") { const inner = el.firstElementChild; if (inner && inner.classList.contains("pc-blk")) inner.style.zoom = C.zoomOf(it, page.w); }
        else el.style.height = u(it.h);
      }
      placeOverlay();
    });
    // Hilfslinien: senkrecht (x) und waagerecht (y) über die ganze Fläche
    function showGuides(lines) {
      const cv = stage.querySelector(".pc");
      if (!cv) return;
      cv.querySelectorAll(".pe-guide").forEach((g) => g.remove());
      lines.forEach(([axis, v]) => cv.insertAdjacentHTML("beforeend", axis === "x"
        ? `<i class="pe-guide is-v" style="left:${u(v)}"></i>` : `<i class="pe-guide is-h" style="top:${u(v)}"></i>`));
    }
    const GAP = 14;
    function magnet(it, tol) {
      const others = page.items.filter((o) => o !== it && !o.rot);
      let bestX = null, bestY = null;
      const tryX = (mine, target, line) => { const d = target - mine; if (Math.abs(d) <= tol && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, line }; };
      const tryY = (mine, target, line) => { const d = target - mine; if (Math.abs(d) <= tol && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, line }; };
      const mx = [it.x, it.x + it.w / 2, it.x + it.w], my = [it.y, it.y + it.h / 2, it.y + it.h];
      [0, page.w / 2, page.w].forEach((v) => mx.forEach((m) => tryX(m, v, v)));
      others.forEach((o) => {
        [o.x, o.x + o.w / 2, o.x + o.w].forEach((v) => mx.forEach((m) => tryX(m, v, v)));
        [o.y, o.y + o.h / 2, o.y + o.h].forEach((v) => my.forEach((m) => tryY(m, v, v)));
        tryY(it.y, o.y + o.h + GAP, o.y + o.h + GAP / 2);   // gleichmäßig darunter
        tryY(it.y + it.h, o.y - GAP, o.y - GAP / 2);        // gleichmäßig darüber
      });
      if (bestX) it.x = round(it.x + bestX.d);
      if (bestY) it.y = round(it.y + bestY.d);
      showGuides([bestX && ["x", bestX.line], bestY && ["y", bestY.line]].filter(Boolean));
    }
    // Animation im Editor einmal abspielen (sonst ruhen Animationen beim Bearbeiten)
    function preview(it) {
      const el = stage.querySelector(`.pc-item[data-id="${CSS.escape(it.id)}"]`);
      if (!el || !it.anim) return;
      el.classList.remove("is-preview"); void el.offsetWidth; el.classList.add("is-preview");
      clearTimeout(el._pv); el._pv = setTimeout(() => el.classList.remove("is-preview"), Math.max(2500, (it.anim.d * (it.anim.loop ? 3 : 1) + it.anim.dl) * 1000 + 200));
    }
    // Alle Links wie der gewählte: gleiche Breite, Höhe und Abstand, genau untereinander (Reihenfolge wie bisher von oben nach unten)
    function stackLinks(anchor) {
      const rest = page.items.filter((o) => o.type === "link" && o !== anchor).sort((a, b) => a.y - b.y || a.x - b.x);
      if (!rest.length) { say(t("Es gibt nur einen Link auf der Seite."), ""); return; }
      touch();
      let y = anchor.y + anchor.h + GAP;
      rest.forEach((o) => {
        Object.assign(o, { x: anchor.x, y, w: anchor.w, h: anchor.h, rot: 0, size: anchor.size, color: anchor.color, bg: anchor.bg, radius: anchor.radius, icon: anchor.icon, o: anchor.o });
        y += anchor.h + GAP;
        fit(o);
      });
      drawAll(); say(t("Links untereinander ausgerichtet."), "ok");
    }
    const endDrag = (e) => {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      showGuides([]);
      const moved = drag.moved, it = drag.id ? byId(drag.id) : null, wasGroup = drag.mode === "group"; drag = null;
      stage.classList.remove("is-moving");
      if (moved && wasGroup) { page.items.filter((i) => group.has(i.id)).forEach(fit); drawAll(); }
      else if (moved && it) { fit(it); drawAll(); }
    };
    stage.addEventListener("focusin", (e) => {
      const el = e.target.closest && e.target.closest(".pc-item[data-id]");
      if (!el || phone || drag || el.dataset.id === sel || !byId(el.dataset.id)) return;
      sel = el.dataset.id; group.clear(); drawCanvas(); drawInsp();
    });
    stage.addEventListener("keydown", (e) => {
      // Enter auf einem Element: in die Eigenschaften springen
      if (e.key === "Enter" && e.target.closest(".pc-item[data-id]")) { e.preventDefault(); insp.querySelector("textarea, input, select, button:not(.pe-x)")?.focus(); }
    });
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("dblclick", (e) => { if (e.target.closest(".pc-text")) insp.querySelector("textarea")?.focus(); });

    // Tastatur: Pfeile schieben, Entf löscht, Strg+Z/Y, Strg+D, Strg+S
    document.addEventListener("keydown", (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "checkbox" && e.target.type !== "range";
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === "s") { e.preventDefault(); save(); return; }
      if (typing) return;
      if (mod && k === "z") { e.preventDefault(); travel(e.shiftKey ? redo : undo, e.shiftKey ? undo : redo); return; }
      if (mod && k === "y") { e.preventDefault(); travel(redo, undo); return; }
      if (mod && (k === "c" || k === "x")) { if (copyItems(k === "x")) e.preventDefault(); return; }
      if (mod && k === "v") { if (pasteItems()) e.preventDefault(); return; }
      // Mehrfachauswahl: Pfeile schieben alle, Entf löscht alle, Esc hebt auf
      if (group.size > 1) {
        if (k === "escape") { group.clear(); drawAll(); }
        else if (k === "delete" || k === "backspace") { e.preventDefault(); touch(); page.items = page.items.filter((i) => !group.has(i.id)); group.clear(); drawAll(); }
        else if (k.startsWith("arrow")) {
          e.preventDefault(); touch("group:nudge");
          const n = e.shiftKey ? 10 : 1;
          page.items.filter((i) => group.has(i.id)).forEach((i) => { if (k === "arrowleft") i.x -= n; else if (k === "arrowright") i.x += n; else if (k === "arrowup") i.y -= n; else i.y += n; });
          drawAll();
        }
        return;
      }
      const it = current();
      if (!it) return;
      if (mod && k === "d") { e.preventDefault(); insp.querySelector('[data-act="dup"]')?.click(); }
      else if (k === "delete" || k === "backspace") { e.preventDefault(); insp.querySelector('[data-act="del"]')?.click(); }
      else if (k === "escape") { sel = null; drawAll(); }
      else if (k.startsWith("arrow")) {
        e.preventDefault(); touch(`${it.id}:nudge`);
        const n = e.shiftKey ? 10 : 1;
        if (k === "arrowleft") it.x -= n; else if (k === "arrowright") it.x += n; else if (k === "arrowup") it.y -= n; else it.y += n;
        it.x = round(it.x); it.y = round(it.y); fit(it); drawAll();
      }
    });
    // ---- Kopieren / Einfügen (Strg+C, Strg+X, Strg+V; auch zwischen Tabs über localStorage) ----
    const CLIP = "xyntal-page-clip";
    let clip = null;
    function copyItems(cut) {
      const list = group.size > 1 ? page.items.filter((i) => group.has(i.id)) : current() ? [current()] : [];
      if (!list.length || (window.getSelection && String(window.getSelection()))) return false;
      clip = JSON.parse(JSON.stringify(list));
      try { localStorage.setItem(CLIP, JSON.stringify({ uid, items: clip })); } catch { /* nur in diesem Tab */ }
      if (cut) { touch(); page.items = page.items.filter((i) => !list.includes(i)); sel = null; group.clear(); drawAll(); }
      say(t(cut ? "Ausgeschnitten – mit Strg+V einfügen." : "Kopiert – mit Strg+V einfügen."), "ok");
      return true;
    }
    function pasteItems() {
      let list = clip;
      try { const st = JSON.parse(localStorage.getItem(CLIP) || "null"); if (st && st.uid === uid && Array.isArray(st.items)) list = st.items; } catch { /* Speicher gesperrt */ }
      if (!Array.isArray(list) || !list.length) return false;
      // Profil-Bausteine gibt es nur einmal; Links und Bilder nur eigene
      const ok = list.filter((i) => i && !(i.type === "block" && page.items.some((x) => x.type === "block" && x.kind === i.kind))
        && !(i.type === "link" && !links.some((l) => l.id === i.ref)) && !(i.type === "image" && !String(i.src || "").startsWith(`${uid}/`)));
      const room = limit() - page.items.length;
      if (!ok.length) { say(t("Das lässt sich hier nicht einfügen (Baustein schon da oder fremder Link)."), "error"); return true; }
      if (room <= 0) { say(t("Du hast die Höchstzahl an Elementen erreicht."), "error"); return true; }
      touch();
      const fresh = C.normalize({ items: ok.slice(0, room).map((i) => ({ ...i, id: uid8(), x: (i.x || 0) + 24, y: (i.y || 0) + 24 })) }).items;
      fresh.forEach((i) => { page.items.push(i); fit(i); });
      group.clear();
      if (fresh.length > 1) { fresh.forEach((i) => group.add(i.id)); sel = null; } else sel = fresh[0] ? fresh[0].id : null;
      drawAll(); say(t(ok.length > room ? "Eingefügt – nicht alles passte unter die Höchstzahl." : "Eingefügt."), ok.length > room ? "error" : "ok");
      return true;
    }
    undoBtn.addEventListener("click", () => travel(undo, redo));
    redoBtn.addEventListener("click", () => travel(redo, undo));

    // ---- Hinzufügen ----
    root.addEventListener("click", (e) => {
      const a = e.target.closest("[data-add]");
      if (a) {
        const kind = a.dataset.add;
        if (kind === "text") { popName = ""; pop.hidden = true; add("text"); insp.querySelector("textarea")?.select(); return; }
        if (kind === "window") { popName = ""; pop.hidden = true; add("text", { text: "Neues Fenster", w: 260, h: 120, size: 18, weight: 400, bg: "#2a2a2a", radius: 20 }); insp.querySelector("textarea")?.select(); return; }
        showPop(kind);
        return;
      }
      const make = e.target.closest("[data-make]");
      if (make) {
        const m = MAKE.find((x) => x.key === make.dataset.make);
        if (m) {
          popName = ""; pop.hidden = true;
          const extra = m.type === "countdown" ? { date: new Date(Date.now() + 7 * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) } : {};
          add(m.type, { ...C.DEFAULTS[m.type], ...m.v, ...extra }); if (m.type === "text") insp.querySelector("textarea")?.select(); }
        return;
      }
      if (e.target.closest("[data-embed-open]")) { const box = pop.querySelector("[data-embed-box]"); box.hidden = false; box.querySelector("input").focus(); return; }
      if (e.target.closest("[data-embed-go]")) {
        const got = C.parseEmbed(pop.querySelector("[data-embed-url]").value);
        if (!got) { say(t("Diese Adresse lässt sich nicht einbetten. Möglich sind YouTube, Vimeo und Spotify."), "error"); return; }
        const r = C.EMBEDS[got.provider].ratio, w = got.provider === "spotify" ? 420 : 520;
        popName = ""; pop.hidden = true;
        if (!pop.querySelector("[data-embed-own]").checked) { say(t("Bitte bestätige, dass es dein eigenes Projekt ist."), "error"); return; }
        add("embed", { provider: got.provider, eid: got.id, own: true, w, h: got.provider === "spotify" ? 152 : Math.round(w * r[1] / r[0]) });
        return;
      }
      const pick = e.target.closest("[data-pick]"), blk = e.target.closest("[data-block]");
      if (pick) { add("link", { ref: pick.dataset.pick }); popName = ""; pop.hidden = true; }
      else if (blk) { add("block", { kind: blk.dataset.block, w: C.natOf(blk.dataset.block, page.w) }); popName = ""; pop.hidden = true; }
      else if (e.target.closest("[data-reset]")) reset();
      else if (e.target.closest("[data-width]")) setWidth(Number(e.target.closest("[data-width]").dataset.width));
      else if (e.target.closest("[data-theme]")) { applyTheme(e.target.closest("[data-theme]").dataset.theme); popName = ""; pop.hidden = true; }
      else if (e.target.closest("[data-cemo]")) { touch(); page.cemo = e.target.closest("[data-cemo]").dataset.cemo; drawAll(); }
      else if (e.target.closest("[data-bgv-del]")) { touch(); page.bgv = ""; page.bgvOwn = false; drawAll(); }
      else if (e.target.closest("[data-lsel]")) { group.clear(); sel = e.target.closest("[data-lsel]").dataset.lsel; drawAll(); }
      else if (e.target.closest("[data-lmove]")) {
        const b = e.target.closest("[data-lmove]"), i = page.items.findIndex((x) => x.id === b.dataset.lmove), j = i + Number(b.dataset.dir);
        if (i >= 0 && j >= 0 && j < page.items.length) { touch(); [page.items[i], page.items[j]] = [page.items[j], page.items[i]]; drawAll(); }
      }
      else if (e.target.closest("[data-layout]")) { applyLayout(e.target.closest("[data-layout]").dataset.layout); popName = ""; pop.hidden = true; }
      else if (e.target.closest("[data-ov]")) {
        const k = e.target.closest("[data-ov]").dataset.ov;
        touch(); page.ov = page.ov.includes(k) ? page.ov.filter((x) => x !== k) : [...page.ov, k]; drawAll();
      }
    });
    pop.addEventListener("change", async (e) => {
      if (e.target.matches("[data-embed-own]")) pop.querySelector("[data-embed-go]").disabled = !e.target.checked;
      if (e.target.matches("[data-bgv-file]")) {
        const file = e.target.files && e.target.files[0]; e.target.value = "";
        if (!file) return;
        if (!pop.querySelector("[data-bgv-own]")?.checked) { say(t("Bitte bestätige, dass es dein eigenes Video ist."), "error"); return; }
        if (!/^video\/(mp4|webm)$/.test(file.type)) { say(t("Nur MP4 oder WebM."), "error"); return; }
        if (file.size > 15 * 1024 * 1024) { say(t("Das Video ist größer als 15 MB."), "error"); return; }
        say(t("Video wird hochgeladen …"));
        try {
          const path = `${uid}/${crypto.randomUUID()}.${file.type === "video/webm" ? "webm" : "mp4"}`;
          const { error } = await sb.storage.from("page-media").upload(path, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          touch(); page.bgv = path; page.bgvOwn = true; drawAll(); say(t("Video eingefügt."), "ok");
        } catch { say(t("Das Video konnte nicht hochgeladen werden."), "error"); }
      }
    });
    $("[data-phone]").addEventListener("click", (e) => {
      phone = !phone; group.clear();
      e.currentTarget.classList.toggle("is-on", phone); e.currentTarget.setAttribute("aria-pressed", String(phone));
      stage.classList.toggle("is-phone", phone);
      drawAll(); say(phone ? t("Handy-Vorschau: so sieht deine Seite am Handy aus. Antippen wählt ein Element.") : "");
    });
    // Fertig: offenen Entwurf noch sichern; ohne Entwurfs-Funktion (altes SQL) wie bisher nachfragen
    $("[data-done]").addEventListener("click", async () => {
      if (dirty && canDraft && !draftSaved) { say(t("Entwurf wird gespeichert …")); await saveDraft(); }
      if (dirty && !draftSaved && !confirm(t("Ungespeicherte Änderungen verwerfen?"))) return;
      dirty = false; location.assign(location.pathname);
    });
    $("[data-upload-label]").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("[data-upload]").click(); } });

    // Bild: Fotos werden auf höchstens 1600 px verkleinert und als WebP hochgeladen; GIFs bleiben unverändert (Animation)
    async function prepare(file) {
      if (file.type === "image/gif") return { blob: file, ext: "gif" };
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, "image/webp", 0.86));
      return blob && blob.type === "image/webp" ? { blob, ext: "webp", w: cv.width, h: cv.height } : { blob: file, ext: file.type === "image/png" ? "png" : "jpg", w: cv.width, h: cv.height };
    }
    $("[data-upload]").addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0]; e.target.value = "";
      if (!file) return;
      if (page.items.length >= limit()) { say(t("Du hast die Höchstzahl an Elementen erreicht."), "error"); return; }
      say(t("Bild wird hochgeladen …"));
      try {
        const { blob, ext, w, h } = await prepare(file);
        if (blob.size > 3 * 1024 * 1024) throw new Error("size");
        const path = `${uid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await sb.storage.from("page-media").upload(path, blob, { contentType: blob.type, upsert: false });
        if (error) throw error;
        const ratio = w && h ? h / w : 1, width = 200;
        add("image", { src: path, w: width, h: Math.round(width * ratio) });
        say("");
      } catch (err) {
        say(err && err.message === "size" ? t("Das Bild ist größer als 3 MB.") : t("Das Bild konnte nicht hochgeladen werden."), "error");
      }
    });

    // ---- Speichern, Zurücksetzen ----
    // Fehler von save_my_page verständlich machen (Meldungstexte aus den Migrationen 20261108110000 ff.)
    function saveError(err) {
      const code = err && err.code, msg = String((err && err.message) || "");
      if (code === "54000" && !/template/.test(msg)) return t(/too large/.test(msg) ? "Die Seite ist zu groß. Entferne ein paar Elemente oder kürze Texte und Code." : "Zu viele Elemente für deinen Tarif.");
      if (code === "P0002") return t("Lege zuerst deine Karte an.");
      if (code === "42501") return t("Dein Konto ist gesperrt – Änderungen sind gerade nicht möglich.");
      if (code === "28000") return t("Bitte melde dich neu an.");
      if (/XYNTAL_MODERATION:beleidigung/.test(msg)) return t("Bitte bleib respektvoll: Ein Text enthält eine Beleidigung und wurde nicht gespeichert.");
      if (/XYNTAL_MODERATION:scam/.test(msg)) return t("Ein Text sieht nach Betrug oder Spam aus und wurde nicht gespeichert.");
      if (/XYNTAL_MODERATION/.test(msg)) return t("Ein Text oder eine Adresse ist nicht erlaubt (z. B. Kurzlinks oder verschleierte Adressen).");
      if (/template limit/.test(msg)) return t("Du hast schon 10 Vorlagen geteilt – lösche zuerst eine.");
      if (/template must not/.test(msg)) return t("Vorlagen dürfen keine Bilder, Videos oder Links enthalten.");
      if (/invalid template name/.test(msg)) return t("Gib der Vorlage einen Namen (2–40 Zeichen).");
      const known = {
        "invalid animation": "Die Datenbank lehnt eine Animation ab. Wahrscheinlich fehlt das neueste SQL (Klammern im Code erlaubt) – bitte im Supabase SQL Editor ausführen.",
        "invalid hover effect": "Die Datenbank kennt den Hover-Effekt nicht – bitte das neueste SQL im Supabase SQL Editor ausführen.",
        "embed not confirmed": "Bitte bestätige beim Video / bei der Musik, dass es dein eigenes Projekt ist.",
        "invalid embed": "Ein Video / eine Musik-Adresse ist ungültig.",
        "invalid button url": "Ein Knopf hat eine ungültige Adresse (nur https://).",
        "invalid image": "Ein Bild gehört nicht zu deinem Konto – bitte neu hochladen.",
        "invalid block": "Ein Baustein ist unbekannt – bitte das neueste SQL ausführen.",
        "invalid item": "Ein Element ist unbekannt – bitte das neueste SQL im Supabase SQL Editor ausführen.",
      };
      const hit = Object.keys(known).find((k) => msg.includes(k));
      return hit ? t(known[hit]) : `${t("Die Seite konnte nicht gespeichert werden.")}${msg ? ` (${msg.slice(0, 120)})` : ""}`;
    }
    async function save() {
      if (busy || !dirty) return;
      if (page.items.some((i) => i.type === "embed" && !i.own)) {
        sel = page.items.find((i) => i.type === "embed" && !i.own).id; drawAll();
        say(t("Bitte bestätige beim Video / bei der Musik, dass es dein eigenes Projekt ist – oder entferne es."), "error"); return;
      }
      busy = true; saveBtn.disabled = true; say(t("Wird veröffentlicht …"));
      clearTimeout(draftTimer);
      try {
        const { error } = await sb.rpc("save_my_page", { p_page: page });
        if (error) throw error;
        dirty = false; draftSaved = true; hasSaved = true; say(t("Veröffentlicht – deine Seite ist jetzt so online."), "ok");
        cleanupMedia();
      } catch (err) {
        saveBtn.disabled = false;
        say(saveError(err), "error");
      } finally { busy = false; }
    }
    saveBtn.addEventListener("click", save);
    async function reset() {
      if (!confirm(t("Die freie Seite wirklich löschen und zur Standardseite zurückkehren?"))) return;
      busy = true; say(t("Wird zurückgesetzt …"));
      try {
        const { error } = await sb.rpc("save_my_page", { p_page: null });
        if (error) throw error;
        page = starter(); drawAll(); relayout(); undo.length = redo.length = 0; sel = null; dirty = true; hasSaved = false; saveBtn.disabled = false;
        undoBtn.disabled = redoBtn.disabled = true; draftSaved = true; drawAll(); say(t("Zurückgesetzt. Deine Seite zeigt wieder das Standardlayout."), "ok");
      } catch { say(t("Zurücksetzen hat nicht geklappt."), "error"); } finally { busy = false; }
    }
    window.addEventListener("beforeunload", (e) => { if (dirty && !draftSaved) { e.preventDefault(); e.returnValue = ""; } });
    // Hochgeladene Dateien, die weder Seite, Entwurf, Versionen noch der Verlauf hier benutzen, nach 1 Stunde löschen
    async function cleanupMedia() {
      try {
        const r = await sb.rpc("get_my_page_media_refs");
        if (r.error || !uid) return;
        const keep = new Set(Array.isArray(r.data) ? r.data : []);
        [snap(), ...undo, ...redo].forEach((js) => { (js.match(/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)/g) || []).forEach((m) => keep.add(m)); });
        const { data, error } = await sb.storage.from("page-media").list(uid, { limit: 1000 });
        if (error || !Array.isArray(data)) return;
        const old = Date.now() - 36e5;
        const gone = data.filter((f) => /^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(f.name || "") && !keep.has(`${uid}/${f.name}`)
          && new Date(f.created_at || Date.now()).getTime() < old).map((f) => `${uid}/${f.name}`);
        if (gone.length) await sb.storage.from("page-media").remove(gone.slice(0, 100));
      } catch { /* Aufräumen ist optional */ }
    }

    // Startlayout für Neue: wie die normale Profilseite – links Karte und Links, rechts Steckbrief, Über mich,
    // Ich biete / Ich suche nebeneinander und Skills (Höhen misst relayout nach dem ersten Zeichnen)
    let cardInfo = opts.cardInfo || null;
    function starter() {
      const items = [];
      const put = (kind, w) => { if (blocks[kind]) items.push({ id: uid8(), type: "block", kind, x: 0, y: 0, w, h: 200 }); };
      put("card", 340);
      links.filter((l) => l.active !== false).slice(0, Math.max(0, limit() - 7)).forEach((l) => items.push({ id: uid8(), type: "link", ref: l.id, x: 0, y: 0, w: 340, h: 60, size: 16 }));
      put("head", 620); put("about", 620); put("offer", 300); put("seek", 300); put("skills", 620);
      return C.normalize({ w: C.FULL, h: 900, items });
    }
    function relayout() {
      if (page.w === C.NARROW) {
        // Eine Spalte: alles mittig untereinander
        let y = 24;
        page.items.forEach((it) => { it.x = round((page.w - it.w) / 2); it.y = y; y += it.h + 18; });
        page.h = Math.min(C.MAX_H, Math.max(480, Math.ceil(y + 24)));
        return;
      }
      // Zwei Spalten (zusammen 1000 Einheiten) mittig auf der Fläche; der Rest bleibt frei zum Gestalten
      const L = Math.round((page.w - 1000) / 2);
      let yl = 40, yr = 40, prev = null;
      page.items.forEach((it) => {
        if (it.type === "link" || it.kind === "card") { it.x = L; it.y = yl; yl += it.h + 14; return; }
        if (it.kind === "seek" && prev && prev.kind === "offer") { it.x = L + 700; it.y = prev.y; yr = Math.max(yr, it.y + it.h + 24); }
        else { it.x = L + 380; it.y = yr; yr += it.h + 24; }
        prev = it;
      });
      page.h = Math.min(C.MAX_H, Math.max(600, Math.ceil(Math.max(yl, yr) + 40)));
    }
    // ---- Themes: ganze Seite auf einmal umfärben ----
    const THEMES = {
      cyber: { name: "Cyberpunk", bg: ["#0a0014", "#2a0045"], ov: ["grid", "scan"], flow: true, text: "#f6ecff", panel: "#16052a", accent: "#ff2bd6", accent2: "#2bf3ff", font: "mono", hover: "neon" },
      minimal: { name: "Minimal", bg: ["#111111", ""], ov: [], flow: false, text: "#ececec", panel: "#1c1c1c", accent: "#ececec", accent2: "#8a8a8a", font: "sans", hover: "lift" },
      pastel: { name: "Pastel", bg: ["#2a2340", "#3d2f57"], ov: ["aurora"], flow: true, text: "#fde7f3", panel: "#382c52", accent: "#ffc4e1", accent2: "#b7e4ff", font: "serif", hover: "pop" },
      retro: { name: "Retro", bg: ["#1b120a", "#3a2210"], ov: ["grain", "vignette"], flow: false, text: "#ffe2b3", panel: "#2a1a0c", accent: "#ffb347", accent2: "#ff6b3d", font: "serif", hover: "shine" },
      ocean: { name: "Ocean", bg: ["#021a26", "#05445e"], ov: ["network"], flow: true, text: "#d8f7ff", panel: "#06293a", accent: "#7ee7ff", accent2: "#3fa9ff", font: "sans", hover: "glow" },
      space: { name: "Space", bg: ["#05050c", "#140a30"], ov: ["stars", "aurora"], flow: false, text: "#ecebff", panel: "#12122a", accent: "#b95cff", accent2: "#5b8cff", font: "sans", hover: "spotlight" },
    };
    function applyTheme(key, quiet) {
      const th = THEMES[key];
      if (!th) return;
      if (!quiet) touch();
      page.bg = { color: th.bg[0], color2: th.bg[1] }; page.ov = [...th.ov]; page.bga = th.flow && th.bg[1] ? "flow" : "";
      page.items.forEach((it) => {
        if (it.type === "text") { it.color = th.text; it.font = th.font; if (it.bg && !it.glass) it.bg = th.panel; if (it.tfx === "gradient" || it.tfx === "shimmer") { it.color = th.accent; it.c2 = th.accent2; } }
        else if (it.type === "link") { it.bg = th.panel; it.color = th.accent; it.hover = th.hover; }
        else if (it.type === "button" || it.type === "contact") { it.bg = th.accent; it.color = th.bg[0]; it.hover = th.hover; }
        else if (it.type === "counter") { it.bg = th.panel; it.color = th.accent; }
        else if (it.type === "icons") { it.bg = th.panel; it.color = th.accent; it.hover = th.hover; }
        else if (it.type === "countdown") { it.bg = th.panel; it.color = th.accent; }
        else if (it.type === "shape") { it.bg = th.accent; if (it.bg2) it.bg2 = th.accent2; }
        else if (it.type === "block") { it.color = th.accent; }
      });
      drawAll(); if (!quiet) say(t("Theme angewendet – mit ↶ rückgängig."), "ok");
    }

    // ---- Ebenen: alle Elemente als Liste (oben = vorne), auswählen und Reihenfolge ändern ----
    function itemName(it) {
      if (it.type === "block") return C.BLOCKS[it.kind][0];
      if (it.type === "link") { const l = links.find((x) => x.id === it.ref); return `Link · ${l ? l.title : "?"}`; }
      if (["text", "button", "countdown", "contact", "counter"].includes(it.type)) return `${{ text: "Text", button: "Knopf", countdown: "Countdown", contact: "Kontakt", counter: "Aufrufe" }[it.type]} · ${String(it.text || "").replace(/\s+/g, " ").slice(0, 24)}`;
      return { image: "Bild", shape: "Form", icons: "Link-Symbole", embed: "Video / Musik" }[it.type] || it.type;
    }
    function layersPanel() {
      const list = [...page.items].reverse();
      return `<h2>${esc(t("Ebenen"))}</h2><p>${esc(t("Oben liegt vorne. Mit Umschalt+Klick auf der Seite wählst du mehrere Elemente aus."))}</p>
        <div class="pe-layers">${list.map((it, n) => `<div class="pe-layer${it.id === sel || group.has(it.id) ? " is-on" : ""}">
          <button type="button" class="pe-item" data-lsel="${esc(it.id)}">${esc(itemName(it))}</button>
          <button type="button" class="pe-x" data-lmove="${esc(it.id)}" data-dir="1" aria-label="${esc(t("Nach vorn"))}"${n === 0 ? " disabled" : ""}>▲</button>
          <button type="button" class="pe-x" data-lmove="${esc(it.id)}" data-dir="-1" aria-label="${esc(t("Nach hinten"))}"${n === list.length - 1 ? " disabled" : ""}>▼</button></div>`).join("")}</div>`;
    }

    // ---- Extras: Statistik, Versionen, Vorlagen-Galerie, Tastenkürzel ----
    const fmtDate = (iso) => { try { return new Date(iso).toLocaleString(document.documentElement.lang === "en" ? "en-GB" : "de-DE", { dateStyle: "medium", timeStyle: "short" }); } catch { return ""; } };
    function extrasPanel() {
      const clicks = links.filter((l) => typeof l.clicks === "number");
      return `<h2>${esc(t("Statistik"))}</h2>
        <p><b data-no-i18n>${esc(Number(views || 0).toLocaleString("de-DE"))}</b> ${esc(t("Aufrufe deiner Seite (deine eigenen zählen nicht)"))}</p>
        ${clicks.length ? `<div class="pe-stats">${clicks.map((l) => `<div><span data-no-i18n>${esc(l.title)}</span><b data-no-i18n>${esc(l.clicks.toLocaleString("de-DE"))}</b></div>`).join("")}</div>`
          : links.length ? `<p class="pe-hint">${esc(t("Klicks je Link siehst du mit Plus."))}</p>` : ""}
        <h2>${esc(t("Vorlagen"))}</h2>
        <p>${esc(t("Ersetzt Texte, Bilder und Formen durch die Vorlage – Karte, Links und Profil-Bausteine bleiben. Rückgängig geht mit ↶."))}</p>
        <div class="pe-tiles">${Object.entries(TEMPLATES).map(([k, v]) => `<button type="button" class="pe-tile pe-theme" data-tpl="${k}" style="--t1:${THEMES[v.theme].bg[0]};--t2:${THEMES[v.theme].bg[1] || THEMES[v.theme].bg[0]};--ta:${THEMES[v.theme].accent}"><span aria-hidden="true"></span><b data-no-i18n>${esc(v.name)}</b></button>`).join("")}</div>
        <h2>${esc(t("Vorlagen der Community"))}</h2>
        <div data-community><p class="pe-hint">${esc(t("Wird geladen …"))}</p></div>
        <div class="pe-embed">
          <input type="text" data-share-name maxlength="40" placeholder="${esc(t("Name deiner Vorlage"))}">
          <button type="button" class="pe-btn" data-share>${esc(t("Meine Seite als Vorlage teilen"))}</button>
          <p class="pe-hint">${esc(t("Geteilt werden Aufbau, Farben, Texte und Effekte – keine Bilder, Videos, Links oder Knopf-Adressen."))}</p>
        </div>
        <h2>${esc(t("Versionen"))}</h2>
        <div data-versions><p class="pe-hint">${esc(t("Wird geladen …"))}</p></div>
        <h2>${esc(t("Tastenkürzel"))}</h2>
        <p class="pe-help">${esc(t("Strg+Z / Strg+Umschalt+Z rückgängig / wiederholen · Strg+C, Strg+X, Strg+V kopieren, ausschneiden, einfügen · Strg+D duplizieren · Pfeile verschieben (Umschalt = 10) · Tab wählt Elemente der Reihe nach · Entf löscht · Umschalt+Klick wählt mehrere · Alt beim Ziehen = ohne Magnet · Strg+S veröffentlicht"))}</p>`;
    }
    let community = [];
    async function loadExtras() {
      const vBox = pop.querySelector("[data-versions]"), cBox = pop.querySelector("[data-community]");
      const [v, c] = await Promise.all([sb.rpc("list_my_page_versions"), sb.rpc("list_page_templates")]).catch(() => [{ error: true }, { error: true }]);
      if (!pop.contains(vBox)) return;
      const missing = t("Noch nicht verfügbar – bitte das neueste SQL im Supabase SQL Editor ausführen.");
      vBox.innerHTML = v.error ? `<p class="pe-hint">${esc(missing)}</p>` : (v.data || []).length
        ? `<div class="pe-layers">${v.data.map((x, n) => `<div class="pe-layer"><button type="button" class="pe-item" data-version="${esc(x.id)}">${esc(fmtDate(x.created_at))}${n === 0 ? ` · ${esc(t("aktuell online"))}` : ""} <span class="pe-count">(${esc(x.items)})</span></button></div>`).join("")}</div>`
        : `<p class="pe-hint">${esc(t("Nach dem ersten Veröffentlichen stehen hier deine letzten 10 Fassungen."))}</p>`;
      community = c.error ? [] : (c.data || []);
      cBox.innerHTML = c.error ? `<p class="pe-hint">${esc(missing)}</p>` : community.length
        ? `<div class="pe-layers">${community.map((x) => `<div class="pe-layer"><button type="button" class="pe-item" data-ctpl="${esc(x.id)}"><span data-no-i18n>${esc(x.name)}</span>${x.handle ? ` <span class="pe-count" data-no-i18n>· ${esc(x.handle)}</span>` : ""}</button>${x.mine ? `<button type="button" class="pe-x" data-ctpl-del="${esc(x.id)}" aria-label="${esc(t("Vorlage löschen"))}">×</button>` : ""}</div>`).join("")}</div>`
        : `<p class="pe-hint">${esc(t("Noch keine geteilten Vorlagen – teile die erste!"))}</p>`;
    }
    // Eingebaute Vorlagen: Aufbau + Theme + Kopfbereich (Überschrift, Badge, Kontakt)
    const TEMPLATES = {
      creator: { name: "Creator", layout: "hero", theme: "space", head: ["Hi, ich bin {name}", "● Open to Work"] },
      startup: { name: "Startup", layout: "split", theme: "cyber", head: ["Wir bauen die Zukunft", "Suche Mitgründer:in"] },
      portfolio: { name: "Portfolio", layout: "grid", theme: "minimal", head: ["{name}", "Projekte · Ideen · Kontakt"] },
      vintage: { name: "Vintage", layout: "classic", theme: "retro", head: ["Willkommen", "Seit heute auf Xyntal"] },
      calm: { name: "Calm", layout: "center", theme: "ocean", head: ["{name}", "Lass uns zusammen etwas bauen"] },
      dream: { name: "Dream", layout: "mirror", theme: "pastel", head: ["Ideen brauchen Menschen", "Schreib mir einfach"] },
    };
    function applyTemplate(key) {
      const tp = TEMPLATES[key];
      if (!tp || !confirm(t("Vorlage übernehmen? Eigene Texte, Bilder und Formen werden ersetzt (↶ macht es rückgängig)."))) return;
      touch();
      const name = String((cardInfo && cardInfo.name) || "").slice(0, 40) || t("Xyntal");
      page.items = page.items.filter((i) => i.type === "block" || i.type === "link");
      applyLayout(tp.layout, true);
      const H = 190, W = page.w;
      page.items.forEach((i) => { i.y = round(i.y + H); });
      const mk = (type, v) => C.normalize({ items: [{ id: uid8(), type, ...C.DEFAULTS[type], ...v }] }).items[0];
      const head = mk("text", { text: tp.head[0].replace("{name}", name), w: Math.min(W - 40, 860), h: 80, size: 56, weight: 700, align: "center", tfx: "gradient", anim: { p: "up", trig: "load" } });
      head.x = round((W - head.w) / 2); head.y = 32;
      const badge = mk("text", { text: tp.head[1], w: 300, h: 44, size: 15, weight: 700, align: "center", bg: "#262633", radius: 999 });
      badge.x = round(W / 2 - 310); badge.y = 128;
      const contact = mk("contact", { w: 300, h: 44, size: 15, hover: "lift" });
      contact.x = round(W / 2 + 10); contact.y = 128;
      page.items.unshift(head, badge, contact);
      page.h = Math.min(C.MAX_H, page.h + H);
      applyTheme(tp.theme, true);
      sel = null; group.clear(); drawAll(); say(t("Vorlage übernommen – mit ↶ rückgängig."), "ok");
    }
    // Geteilte Vorlage: Link-Platzhalter bekommen die eigenen Links, übrige eigene Links kommen darunter
    function applyCommunity(id) {
      const tp = community.find((x) => x.id === id);
      if (!tp || !confirm(t("Vorlage übernehmen? Deine Seite wird durch die Vorlage ersetzt (↶ macht es rückgängig)."))) return;
      touch();
      const next = C.normalize(tp.page), mine = links.filter((l) => l.active !== false);
      let n = 0, last = null;
      next.items = next.items.filter((i) => {
        if (i.type !== "link") return i.type !== "block" || !!blocks[i.kind];
        if (n >= mine.length) return false;
        i.ref = mine[n++].id; last = i; return true;
      });
      mine.slice(n).forEach((l) => {
        const base = last || { x: round((next.w - 340) / 2), y: 40 - 74, w: 340, h: 60, size: 16, radius: 14 };
        const it = C.normalize({ items: [{ ...base, id: uid8(), type: "link", ref: l.id, y: base.y + base.h + 14 }] }).items[0];
        next.items.push(it); last = it;
      });
      next.items = next.items.slice(0, limit());
      page = next; page.items.forEach(fit);
      sel = null; group.clear(); drawAll(); say(t("Vorlage übernommen – mit ↶ rückgängig."), "ok");
    }
    async function shareTemplate() {
      const name = String(pop.querySelector("[data-share-name]")?.value || "").trim();
      if (name.length < 2) { say(t("Gib der Vorlage einen Namen (2–40 Zeichen)."), "error"); return; }
      const copy = JSON.parse(snap());
      copy.items = copy.items.filter((i) => i.type !== "image" && i.type !== "embed").map((i) => (i.type === "link" ? { ...i, ref: C.SLOT } : i.type === "button" ? { ...i, url: "" } : i));
      copy.bgv = ""; copy.bgvOwn = false;
      const { error } = await sb.rpc("share_page_template", { p_name: name, p_page: copy });
      if (error) { say(saveError(error), "error"); return; }
      say(t("Vorlage geteilt – danke!"), "ok"); loadExtras();
    }
    pop.addEventListener("click", async (e) => {
      const tpl = e.target.closest("[data-tpl]"), ct = e.target.closest("[data-ctpl]"), del = e.target.closest("[data-ctpl-del]"), ver = e.target.closest("[data-version]");
      if (tpl) applyTemplate(tpl.dataset.tpl);
      else if (ct) applyCommunity(ct.dataset.ctpl);
      else if (e.target.closest("[data-share]")) shareTemplate();
      else if (del) {
        if (!confirm(t("Diese Vorlage löschen?"))) return;
        const { error } = await sb.rpc("delete_my_page_template", { p_id: del.dataset.ctplDel });
        if (error) say(saveError(error), "error"); else loadExtras();
      } else if (ver) {
        const { data, error } = await sb.rpc("get_my_page_version", { p_id: Number(ver.dataset.version) });
        if (error || !data) { say(t("Diese Version lässt sich gerade nicht laden."), "error"); return; }
        touch(); page = C.normalize(data); sel = null; group.clear(); drawAll();
        say(t("Version geladen – „Veröffentlichen“ macht sie wieder öffentlich."), "ok");
      }
    });

    // ---- Mehrfachauswahl: Umschalt+Klick, zusammen verschieben, ausrichten, verteilen ----
    const group = new Set();
    function drawGroupInsp() {
      insp.hidden = false;
      const b = (k, label) => `<button type="button" class="pe-btn" data-galign="${k}">${esc(t(label))}</button>`;
      insp.innerHTML = `<div class="pe-insp-head" data-insp-drag><h2>${group.size} ${esc(t("Elemente"))}</h2><button type="button" class="pe-x" data-gclear aria-label="${esc(t("Auswahl aufheben"))}">×</button></div>
        <p class="pe-hint">${esc(t("Ziehen verschiebt alle zusammen. Umschalt+Klick nimmt Elemente dazu oder heraus."))}</p>
        <h2>${esc(t("Ausrichten"))}</h2>
        <div class="pe-row">${b("left", "Links")}${b("hcenter", "Mitte")}${b("right", "Rechts")}</div>
        <div class="pe-row">${b("top", "Oben")}${b("vcenter", "Mittig")}${b("bottom", "Unten")}</div>
        <h2>${esc(t("Verteilen"))}</h2>
        <div class="pe-row">${b("dist-h", "Waagerecht")}${b("dist-v", "Senkrecht")}</div>
        <div class="pe-row"><button type="button" class="pe-btn pe-danger" data-gdel>${esc(t("Alle löschen"))}</button></div>`;
    }
    function alignGroup(kind) {
      const L = [...group].map(byId).filter(Boolean);
      if (L.length < 2) return;
      touch();
      const minX = Math.min(...L.map((i) => i.x)), maxR = Math.max(...L.map((i) => i.x + i.w)), minY = Math.min(...L.map((i) => i.y)), maxB = Math.max(...L.map((i) => i.y + i.h));
      L.forEach((i) => {
        if (kind === "left") i.x = minX; else if (kind === "right") i.x = round(maxR - i.w); else if (kind === "hcenter") i.x = round((minX + maxR) / 2 - i.w / 2);
        else if (kind === "top") i.y = minY; else if (kind === "bottom") i.y = round(maxB - i.h); else if (kind === "vcenter") i.y = round((minY + maxB) / 2 - i.h / 2);
      });
      if (kind === "dist-h" || kind === "dist-v") {
        const h = kind === "dist-h", key = h ? "x" : "y", size = h ? "w" : "h";
        const sorted = [...L].sort((a, b) => a[key] - b[key]);
        const span = (h ? maxR - minX : maxB - minY) - sorted.reduce((t2, i) => t2 + i[size], 0);
        const gap = span / (sorted.length - 1);
        let pos = h ? minX : minY;
        sorted.forEach((i) => { i[key] = round(pos); pos += i[size] + gap; });
      }
      drawAll();
    }
    insp.addEventListener("click", (e) => {
      if (!(group.size > 1)) return;
      const a = e.target.closest("[data-galign]");
      if (a) { alignGroup(a.dataset.galign); return; }
      if (e.target.closest("[data-gclear]")) { group.clear(); drawAll(); return; }
      if (e.target.closest("[data-gdel]")) { touch(); page.items = page.items.filter((i) => !group.has(i.id)); group.clear(); drawAll(); }
    });

    // ---- Aufbau-Vorlagen ----
    // Kleine Skizzen: K = Karte, Striche = Links, Flächen = Profil-Bausteine
    const sk = (inner) => `<svg viewBox="0 0 60 40" aria-hidden="true" fill="currentColor">${inner}</svg>`;
    const LAYOUTS = {
      classic: { label: "Klassisch", icon: sk('<rect x="6" y="5" width="16" height="20" rx="2"/><rect x="6" y="28" width="16" height="3" rx="1"/><rect x="6" y="33" width="16" height="3" rx="1"/><rect x="26" y="5" width="28" height="6" rx="1" opacity=".6"/><rect x="26" y="14" width="28" height="10" rx="1" opacity=".6"/><rect x="26" y="27" width="13" height="8" rx="1" opacity=".6"/><rect x="41" y="27" width="13" height="8" rx="1" opacity=".6"/>') },
      mirror: { label: "Gespiegelt", icon: sk('<rect x="38" y="5" width="16" height="20" rx="2"/><rect x="38" y="28" width="16" height="3" rx="1"/><rect x="38" y="33" width="16" height="3" rx="1"/><rect x="6" y="5" width="28" height="6" rx="1" opacity=".6"/><rect x="6" y="14" width="28" height="10" rx="1" opacity=".6"/><rect x="6" y="27" width="13" height="8" rx="1" opacity=".6"/><rect x="21" y="27" width="13" height="8" rx="1" opacity=".6"/>') },
      center: { label: "Zentriert", icon: sk('<rect x="22" y="3" width="16" height="16" rx="2"/><rect x="18" y="21" width="24" height="3" rx="1"/><rect x="18" y="26" width="24" height="3" rx="1"/><rect x="16" y="31" width="28" height="7" rx="1" opacity=".6"/>') },
      hero: { label: "Hero", icon: sk('<rect x="6" y="3" width="48" height="9" rx="1" opacity=".6"/><rect x="6" y="15" width="14" height="18" rx="2"/><rect x="23" y="15" width="14" height="3" rx="1"/><rect x="23" y="20" width="14" height="3" rx="1"/><rect x="23" y="25" width="14" height="3" rx="1"/><rect x="40" y="15" width="14" height="18" rx="1" opacity=".6"/>') },
      grid: { label: "Raster", icon: sk('<rect x="22" y="3" width="16" height="14" rx="2"/><rect x="12" y="20" width="17" height="4" rx="1"/><rect x="31" y="20" width="17" height="4" rx="1"/><rect x="12" y="26" width="17" height="4" rx="1"/><rect x="31" y="26" width="17" height="4" rx="1"/><rect x="12" y="32" width="36" height="6" rx="1" opacity=".6"/>') },
      split: { label: "Halbe-Halbe", icon: sk('<rect x="4" y="4" width="25" height="32" rx="2" opacity=".35"/><rect x="9" y="9" width="15" height="20" rx="2"/><rect x="33" y="6" width="23" height="4" rx="1"/><rect x="33" y="12" width="23" height="4" rx="1"/><rect x="33" y="18" width="23" height="4" rx="1"/><rect x="33" y="25" width="23" height="10" rx="1" opacity=".6"/>') },
    };
    // Fehlende Profil-Bausteine und Links ergänzen (ohne Doppelte), damit jede Vorlage vollständig ist
    function ensureBasics() {
      Object.keys(C.BLOCKS).forEach((k) => {
        if (blocks[k] && !page.items.some((i) => i.type === "block" && i.kind === k) && page.items.length < limit()) page.items.push(C.normalize({ items: [{ id: uid8(), type: "block", kind: k, x: 0, y: 0, w: 300, h: 200 }] }).items[0]);
      });
      links.filter((l) => l.active !== false).forEach((l) => {
        if (!page.items.some((i) => i.type === "link" && i.ref === l.id) && page.items.length < limit()) page.items.push(C.normalize({ items: [{ id: uid8(), type: "link", ref: l.id, x: 0, y: 0, w: 340, h: 60 }] }).items[0]);
      });
    }
    function applyLayout(name, quiet) {
      if (!LAYOUTS[name]) return;
      if (!quiet) touch();
      ensureBasics();
      const narrow = page.w === C.NARROW, col = narrow || name === "center";
      const blk = (k) => page.items.find((i) => i.type === "block" && i.kind === k);
      const lnk = page.items.filter((i) => i.type === "link");
      const rest = page.items.filter((i) => i.type !== "link" && i.type !== "block");
      // 1) Breiten setzen, zeichnen (misst die Höhen der Bausteine), 2) anordnen
      const sizeW = { card: 340, head: 620, about: 620, offer: 300, seek: 300, skills: 620 };
      if (col) Object.assign(sizeW, { card: narrow ? 300 : 360, head: narrow ? 440 : 600, about: narrow ? 440 : 600, offer: narrow ? 440 : 600, seek: narrow ? 440 : 600, skills: narrow ? 440 : 600 });
      if (name === "hero") Object.assign(sizeW, { card: 320, head: 1000, about: 620, offer: 320, seek: 320, skills: 360 });
      if (name === "grid") Object.assign(sizeW, { card: 340, head: 640, about: 640, offer: 310, seek: 310, skills: 640 });
      if (name === "split") Object.assign(sizeW, { card: 380, head: 460, about: 460, offer: 460, seek: 460, skills: 460 });
      page.items.forEach((it) => { if (it.type === "block") it.w = sizeW[it.kind]; });
      lnk.forEach((it) => { it.w = col ? (narrow ? 380 : 420) : name === "grid" ? 300 : name === "hero" ? 300 : name === "split" ? 460 : 340; it.h = 60; it.rot = 0; });
      drawAll();
      const W = page.w, L = Math.round((W - 1000) / 2), G = 18;
      const stack = (list, x, y, gap = G) => { list.filter(Boolean).forEach((it) => { it.x = x; it.y = y; it.rot = 0; y += it.h + gap; }); return y; };
      const centerX = (it) => round((W - it.w) / 2);
      let bottom = 40;
      if (col) {
        let y = 32;
        [blk("card"), ...lnk, blk("head"), blk("about"), blk("offer"), blk("seek"), blk("skills")].filter(Boolean).forEach((it) => { it.x = centerX(it); it.y = y; it.rot = 0; y += it.h + G; });
        bottom = y;
      } else if (name === "classic" || name === "mirror") {
        const left = name === "classic" ? L : L + 660, right = name === "classic" ? L + 380 : L;
        const yl = stack([blk("card"), ...lnk], left, 40, 14);
        let yr = stack([blk("head"), blk("about")], right, 40, 24);
        const o = blk("offer"), s2 = blk("seek");
        if (o) { o.x = right; o.y = yr; } if (s2) { s2.x = right + 320; s2.y = yr; }
        if (o || s2) yr += Math.max(o ? o.h : 0, s2 ? s2.h : 0) + 24;
        yr = stack([blk("skills")], right, yr, 24);
        bottom = Math.max(yl, yr);
      } else if (name === "hero") {
        let y = stack([blk("head")], L, 40, 28);
        const c = blk("card"); if (c) { c.x = L; c.y = y; }
        const yl = stack(lnk, L + 350, y, 14);
        const yo = stack([blk("offer"), blk("seek")], L + 680, y, 16);
        y = Math.max(c ? y + c.h : y, yl, yo) + 28;
        const a = blk("about"); if (a) { a.x = L; a.y = y; }
        const sk2 = blk("skills"); if (sk2) { sk2.x = L + 640; sk2.y = y; }
        bottom = y + Math.max(a ? a.h : 0, sk2 ? sk2.h : 0) + 24;
      } else if (name === "grid") {
        const c = blk("card"); let y = 40;
        if (c) { c.x = centerX(c); c.y = y; y += c.h + 28; }
        lnk.forEach((it, i) => { it.x = round(W / 2 - 310 + (i % 2) * 320); it.y = y + Math.floor(i / 2) * 74; });
        if (lnk.length) y += Math.ceil(lnk.length / 2) * 74 + 14;
        [blk("head"), blk("about")].filter(Boolean).forEach((it) => { it.x = centerX(it); it.y = y; y += it.h + 24; });
        const o = blk("offer"), s2 = blk("seek");
        if (o) { o.x = round(W / 2 - 320); o.y = y; } if (s2) { s2.x = round(W / 2 + 10); s2.y = y; }
        if (o || s2) y += Math.max(o ? o.h : 0, s2 ? s2.h : 0) + 24;
        const sk2 = blk("skills"); if (sk2) { sk2.x = centerX(sk2); sk2.y = y; y += sk2.h + 24; }
        bottom = y;
      } else if (name === "split") {
        const c = blk("card"); if (c) { c.x = L + 40; c.y = 60; }
        const yr = stack([...lnk, blk("head"), blk("about"), blk("offer"), blk("seek"), blk("skills")], L + 520, 40, 16);
        bottom = Math.max(yr, c ? 60 + c.h + 40 : 0);
      }
      // Eigene Texte, Bilder, Formen usw.: unter die Vorlage, mittig nebeneinander mit Umbruch
      if (rest.length) {
        let x = 0, y = bottom + 24, rowH = 0; const maxW = Math.min(W - 40, 1000), x0 = round((W - maxW) / 2);
        rest.forEach((it) => {
          if (x && x + it.w > maxW) { x = 0; y += rowH + G; rowH = 0; }
          it.x = round(x0 + x); it.y = round(y); x += it.w + G; rowH = Math.max(rowH, it.h);
        });
        bottom = y + rowH + G;
      }
      page.h = Math.min(C.MAX_H, Math.max(narrow ? 480 : 600, Math.ceil(bottom + 40)));
      sel = null; drawAll();
      if (!quiet) say(t("Vorlage angewendet – mit ↶ rückgängig."), "ok");
    }

    // Zwischen „Ganze Seite“ und „Eine Spalte“ wechseln: alles maßstabsgetreu umrechnen
    function setWidth(w) {
      if (w === page.w || !C.WIDTHS.includes(w)) return;
      touch();
      // Inhaltsbreite ↔ ganzer Bildschirm: gleiche Pixelgröße, nur mittig verschieben; von/zu „Eine Spalte“ maßstabsgetreu umrechnen
      if (page.w !== C.NARROW && w !== C.NARROW) {
        const dx = (w - page.w) / 2;
        page.items.forEach((it) => { it.x = round(it.x + dx); });
        page.w = w; drawAll(); return;
      }
      const f = w / page.w;
      page.items.forEach((it) => {
        ["x", "y", "w", "h", "radius"].forEach((k) => { it[k] = round(it[k] * f); });
        if (it.size) it.size = round(Math.min(160, Math.max(8, it.size * f)));
      });
      page.w = w; page.h = Math.min(C.MAX_H, Math.max(C.MIN_H, Math.round(page.h * f)));
      drawAll();
    }

    // ---- Start ----
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { loading.innerHTML = `${esc(t("Melde dich an, um deine Seite zu gestalten."))} <a class="text-link" href="/login">${esc(t("Anmelden"))}</a>`; return; }
      uid = session.user.id;
      try {
        const [l, st, pr] = await Promise.all([sb.rpc("get_my_links"), sb.rpc("get_my_page_state"), sb.from("profiles").select("is_premium,is_admin").eq("id", uid).maybeSingle()]);
        if (l.error) throw l.error;
        // Ohne neuestes SQL (get_my_page_state fehlt): wie bisher ohne Entwurf
        let p = st, draft = null;
        if (st.error) { p = await sb.rpc("get_my_page"); if (p.error) throw p.error; }
        else { canDraft = true; views = Number(st.data && st.data.views) || 0; draft = st.data && st.data.draft; p = { data: st.data && st.data.page }; }
        links = Array.isArray(l.data) ? l.data : [];
        paid = !!(pr.data && (pr.data.is_premium || pr.data.is_admin));
        hasSaved = !!(p.data && Array.isArray(p.data.items) && p.data.items.length);
        const hasDraft = !!(draft && typeof draft === "object" && Array.isArray(draft.items));
        page = hasDraft ? C.normalize(draft) : hasSaved ? C.normalize(p.data) : starter();
        loading.hidden = true; editor.hidden = false;
        drawAll();
        if (hasDraft) { dirty = true; draftSaved = true; saveBtn.disabled = false; say(t("Dein Entwurf ist geladen – noch nicht veröffentlicht.")); }
        else if (!hasSaved) { relayout(); drawAll(); dirty = true; saveBtn.disabled = false; draftSaved = false; }
      } catch {
        loading.textContent = t("Deine Seite lässt sich gerade nicht laden. Bitte versuch es später noch einmal.");
      }
    })();
  }

  window.XyntalPageEditor = { open };
})();
