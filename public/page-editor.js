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
      <button type="button" class="pe-btn" data-add="block">${esc(t("Bausteine"))}</button>
      <button type="button" class="pe-btn" data-add="bg">${esc(t("Hintergrund"))}</button>
      <i class="pe-sep" aria-hidden="true"></i>
      <button type="button" class="pe-btn" data-undo title="${esc(t("Rückgängig (Strg+Z)"))}" aria-label="${esc(t("Rückgängig"))}" disabled>↶</button>
      <button type="button" class="pe-btn" data-redo title="${esc(t("Wiederholen (Strg+Umschalt+Z)"))}" aria-label="${esc(t("Wiederholen"))}" disabled>↷</button>
      <button type="button" class="pe-btn pe-primary" data-save disabled>${esc(t("Speichern"))}</button>
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
    if (!window.supabase || !cfg) { loading.textContent = t("Der Editor konnte nicht geladen werden."); return; }
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

    let page = C.normalize(null), links = [], sel = null, dirty = false, busy = false, uid = "", handle = "", paid = false, hasSaved = false;
    const undo = [], redo = [];
    let lastKey = "", lastAt = 0;
    // Gleiche Grenzen prüft die Datenbank (page_item_limit, Migration 20261108110000)
    const limit = () => (paid ? 100 : 20);
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
    }
    function travel(from, to) {
      if (!from.length) return;
      to.push(snap()); page = C.normalize(JSON.parse(from.pop()));
      if (sel && !byId(sel)) sel = null;
      lastKey = ""; dirty = true; saveBtn.disabled = false;
      undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length;
      drawAll();
    }

    // ---- Zeichnen ----
    const u = (n) => `calc(${round(n)} * 100cqw / ${C.W})`;
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
      const k = cv.getBoundingClientRect().width / C.W;
      page.items.forEach((it) => {
        if (it.type !== "block") return;
        const el = cv.querySelector(`.pc-item[data-id="${CSS.escape(it.id)}"]`);
        if (el && k) { const h = round(el.offsetHeight / k); if (Math.abs(h - it.h) > 0.3) it.h = Math.max(16, h); fit(it); }
      });
    }
    function drawCanvas() {
      stage.innerHTML = C.html(page, { links, base: cfg.supabaseUrl, edit: true, t, block: (kind) => blocks[kind] || "" });
      C.mount(stage);
      if (opts.after) opts.after(stage);
      measure();
      const cv = stage.querySelector(".pc");
      cv.style.aspectRatio = `${C.W} / ${page.h}`;
      const it = current();
      if (it) {
        cv.insertAdjacentHTML("beforeend", `<div class="pe-sel"><i data-h="rot" title="${esc(t("Drehen (Umschalt = 15°-Schritte)"))}"></i><i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i></div>`);
        placeOverlay();
      }
    }
    // Hintergrund, Höhe, Anzahl: Fenster über der Werkzeugleiste
    const bgPanel = () => `<h2>${esc(t("Hintergrund"))}</h2>
      <label class="pe-field"><span>${esc(t("Farbe"))}</span><input type="color" data-bg="color" value="${page.bg.color}"></label>
      <label class="pe-field"><span>${esc(t("Verlauf"))}</span><input type="checkbox" data-bg-gradient ${page.bg.color2 ? "checked" : ""}></label>
      ${page.bg.color2 ? `<label class="pe-field"><span>${esc(t("Zweite Farbe"))}</span><input type="color" data-bg="color2" value="${page.bg.color2}"></label>` : ""}
      <label class="pe-field"><span>${esc(t("Höhe"))}</span><input type="range" min="240" max="2400" step="10" data-height value="${page.h}"></label>
      <p class="pe-count">${page.items.length} / ${limit()} ${esc(t("Elemente"))}</p>
      <button type="button" class="pe-btn pe-danger" data-reset>${esc(t("Auf Standardseite zurücksetzen"))}</button>`;
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
        pop.innerHTML = `<h2>${esc(t("Bausteine deines Profils"))}</h2>` + (free.length
          ? free.map((k) => `<button type="button" class="pe-item" data-block="${k}">${esc(t(C.BLOCKS[k][0]))}</button>`).join("")
          : `<p>${esc(t("Alle Bausteine liegen schon auf der Seite."))}</p>`);
      } else pop.innerHTML = bgPanel();
    }
    function drawSide() { if (popName === "bg") pop.innerHTML = bgPanel(); }
    function drawAll() { drawCanvas(); drawSide(); drawInsp(); }

    // ---- Eigenschaften des gewählten Elements ----
    const num$ = (k, label, v, lo, hi, step = 1) => `<label class="pe-field"><span>${esc(t(label))}</span><input type="number" data-p="${k}" value="${round(v)}" min="${lo}" max="${hi}" step="${step}"></label>`;
    const range$ = (k, label, v, lo, hi, step = 1) => `<label class="pe-field"><span>${esc(t(label))}</span><input type="range" data-p="${k}" value="${v}" min="${lo}" max="${hi}" step="${step}"></label>`;
    const color$ = (k, label, v) => `<label class="pe-field"><span>${esc(t(label))}</span><input type="color" data-p="${k}" value="${v || "#000000"}"></label>`;
    const seg$ = (k, opts, v) => `<div class="pe-row">${opts.map(([val, label]) => `<button type="button" class="pe-btn${String(v) === String(val) ? " is-on" : ""}" data-set="${k}" data-val="${val}">${esc(t(label))}</button>`).join("")}</div>`;
    function drawInsp() {
      const it = current();
      insp.hidden = !it;
      if (!it) { insp.innerHTML = ""; return; }
      let body = "";
      if (it.type === "block") {
        body = `<p class="pe-hint">${esc(t("Dieser Baustein zeigt deine Profilangaben. Ändern kannst du sie im Profil."))}</p>`;
      } else if (it.type === "text") {
        body = `<textarea data-p="text" maxlength="1000" aria-label="${esc(t("Text"))}">${esc(it.text)}</textarea>
          ${range$("size", "Schriftgröße", it.size, 8, 120)}
          ${seg$("weight", [[400, "Normal"], [700, "Fett"]], it.weight)}
          ${seg$("align", [["left", "Links"], ["center", "Mitte"], ["right", "Rechts"]], it.align)}
          ${seg$("font", [["sans", "Sans"], ["serif", "Serif"], ["mono", "Mono"]], it.font)}
          ${color$("color", "Textfarbe", it.color)}
          <label class="pe-field"><span>${esc(t("Hintergrund"))}</span><input type="checkbox" data-bgon ${it.bg ? "checked" : ""}></label>
          ${it.bg ? color$("bg", "Hintergrundfarbe", it.bg) : ""}`;
      } else if (it.type === "link") {
        body = `<label class="pe-field"><span>${esc(t("Link"))}</span><select data-p="ref">${links.map((l) => `<option value="${esc(l.id)}"${l.id === it.ref ? " selected" : ""}>${esc(l.title)}</option>`).join("")}</select></label>
          ${range$("size", "Schriftgröße", it.size, 8, 60)}
          ${color$("color", "Textfarbe", it.color)}
          ${color$("bg", "Hintergrundfarbe", it.bg || "#2a2a2a")}
          <label class="pe-field"><span>${esc(t("Symbol zeigen"))}</span><input type="checkbox" data-p="icon" ${it.icon ? "checked" : ""}></label>`;
      } else {
        body = `${seg$("fit", [["cover", "Füllen"], ["contain", "Einpassen"]], it.fit)}
          <label class="pe-field"><span>${esc(t("Beschreibung"))}</span></label>
          <input type="text" data-p="alt" maxlength="120" value="${esc(it.alt)}" placeholder="${esc(t("Alternativtext für Screenreader"))}">`;
      }
      const block = it.type === "block";
      insp.innerHTML = `<h2>${esc(t(block ? C.BLOCKS[it.kind][0] : it.type === "text" ? "Text" : it.type === "link" ? "Link" : "Bild"))}</h2>
        ${body}
        ${block ? "" : range$("radius", "Rundung", it.radius, 0, 120)}
        ${range$("o", "Deckkraft", it.o, 0.1, 1, 0.05)}
        ${range$("rot", "Drehung", it.rot, -180, 180)}
        ${it.rot ? `<button type="button" class="pe-btn" data-set="rot" data-val="0">${esc(t("Gerade stellen"))}</button>` : ""}
        <h2>${esc(t("Position"))}</h2>
        ${num$("x", "Links", it.x, -480, 960)}${num$("y", "Oben", it.y, -4000, 4000)}${num$("w", "Breite", it.w, 16, 960)}${block ? "" : num$("h", "Höhe", it.h, 16, 4000)}
        <div class="pe-row">
          <button type="button" class="pe-btn" data-act="front">${esc(t("Nach vorn"))}</button>
          <button type="button" class="pe-btn" data-act="back">${esc(t("Nach hinten"))}</button>
          ${block ? "" : `<button type="button" class="pe-btn" data-act="dup">${esc(t("Duplizieren"))}</button>`}
          <button type="button" class="pe-btn pe-danger" data-act="del">${esc(t(block ? "Entfernen" : "Löschen"))}</button>
        </div>`;
    }

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
        it.x = round((C.W - it.w) / 2); it.y = round(page.items.reduce((m, i) => Math.max(m, i.y + i.h), 6) + 18);
      } else { it.x = round(Math.max(0, (C.W - it.w) / 2) + off); it.y = round(Math.min(page.h - it.h, 40 + off * 4)); }
      page.items.push(it); sel = it.id;
      fit(it); drawAll();
      return it;
    }
    // Wächst ein Element über die Fläche hinaus, wächst die Fläche mit
    function fit(it) { const need = Math.ceil(it.y + it.h + 24); if (need > page.h) page.h = Math.min(C.MAX_H, need); }
    function setProp(it, k, v) {
      if (k === "text") it.text = String(v).slice(0, 1000);
      else if (k === "icon") it.icon = !!v;
      else if (["color", "bg"].includes(k)) it[k] = C.hex(v, it[k]);
      else if (["align", "font", "fit", "ref", "alt"].includes(k)) it[k] = v;
      else if (k === "weight") it.weight = Number(v) === 400 ? 400 : 700;
      else {
        const R = { x: [-480, 960], y: [-4000, 4000], w: [16, 960], h: [16, 4000], size: [8, 160], radius: [0, 200], o: [0.1, 1], rot: [-360, 360] }[k];
        if (R) it[k] = round(num(v, R[0], R[1], it[k]));
      }
    }
    insp.addEventListener("input", (e) => {
      const it = current(), k = e.target.dataset.p;
      if (!it || !k) return;
      touch(`${it.id}:${k}`);
      setProp(it, k, e.target.type === "checkbox" ? e.target.checked : e.target.value);
      if (["y", "h"].includes(k)) fit(it);
      drawCanvas();
    });
    insp.addEventListener("change", (e) => { if (e.target.dataset.p) drawInsp(); });
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
      else if (act.dataset.act === "dup") {
        if (page.items.length >= limit()) { say(t("Du hast die Höchstzahl an Elementen erreicht."), "error"); return; }
        touch(); const copy = { ...it, id: uid8(), x: it.x + 16, y: it.y + 16 }; page.items.push(copy); sel = copy.id; fit(copy);
      }
      drawAll();
    });
    insp.addEventListener("change", (e) => {
      const it = current();
      if (it && e.target.dataset.bgon !== undefined) { touch(); it.bg = e.target.checked ? "#2a2a2a" : ""; drawAll(); }
    });

    // ---- Seite: Hintergrund, Höhe ----
    document.addEventListener("input", (e) => {
      const el = e.target;
      if (!pop.contains(el)) return;
      if (el.dataset.bg) { touch(`bg:${el.dataset.bg}`); page.bg[el.dataset.bg] = C.hex(el.value, page.bg[el.dataset.bg]); drawCanvas(); }
      else if (el.dataset.bgGradient !== undefined) { touch(); page.bg.color2 = el.checked ? (page.bg.color2 || "#3a2a6a") : ""; drawAll(); }
      else if (el.dataset.height !== undefined) { touch("height"); page.h = Math.round(num(el.value, C.MIN_H, C.MAX_H, page.h)); drawCanvas(); }
    });

    // ---- Ziehen und Skalieren (Maus, Stift, Finger) ----
    let drag = null;
    const scale = () => C.W / stage.querySelector(".pc").getBoundingClientRect().width;
    const centerOf = (id) => { const el = stage.querySelector(`.pc-item[data-id="${CSS.escape(id)}"]`), r = el && el.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }; };
    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const handleEl = e.target.closest("[data-h]"), itemEl = e.target.closest(".pc-item");
      if (!handleEl && !itemEl) { if (sel) { sel = null; drawAll(); } return; }
      const id = handleEl ? sel : itemEl.dataset.id, it = byId(id);
      if (!it) return;
      e.preventDefault();
      if (sel !== id) { sel = id; drawCanvas(); drawInsp(); }
      drag = { id, mode: handleEl ? handleEl.dataset.h : "move", x0: e.clientX, y0: e.clientY, start: { x: it.x, y: it.y, w: it.w, h: it.h, rot: it.rot }, s: scale(), moved: false, pid: e.pointerId, c: centerOf(id) };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const it = byId(drag.id), dx = (e.clientX - drag.x0) * drag.s, dy = (e.clientY - drag.y0) * drag.s, b = drag.start;
      if (!drag.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 3 / drag.s) return;
        drag.moved = true; touch(); stage.classList.add("is-moving");
      }
      if (drag.mode === "move") {
        it.x = round(num(b.x + dx, 16 - b.w, C.W - 16, b.x)); it.y = round(num(b.y + dy, 16 - b.h, page.h - 16, b.y));
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
        const w = round(num(b.w + sx * lx, isBlock ? 60 : 16, 960, b.w));
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
        if (it.type === "block") { const inner = el.firstElementChild; if (inner && inner.classList.contains("pc-blk")) inner.style.zoom = C.zoomOf(it); }
        else el.style.height = u(it.h);
      }
      placeOverlay();
    });
    const endDrag = (e) => {
      if (!drag || (e && e.pointerId !== drag.pid)) return;
      const moved = drag.moved, it = byId(drag.id); drag = null;
      stage.classList.remove("is-moving");
      if (moved && it) { fit(it); drawAll(); }
    };
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
      const pick = e.target.closest("[data-pick]"), blk = e.target.closest("[data-block]");
      if (pick) { add("link", { ref: pick.dataset.pick }); popName = ""; pop.hidden = true; }
      else if (blk) { add("block", { kind: blk.dataset.block, w: C.BLOCKS[blk.dataset.block][0] === "Karte" ? 300 : 440 }); popName = ""; pop.hidden = true; }
      else if (e.target.closest("[data-reset]")) reset();
    });
    $("[data-done]").addEventListener("click", () => {
      if (dirty && !confirm(t("Ungespeicherte Änderungen verwerfen?"))) return;
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
    async function save() {
      if (busy || !dirty) return;
      busy = true; saveBtn.disabled = true; say(t("Wird gespeichert …"));
      try {
        const { error } = await sb.rpc("save_my_page", { p_page: page });
        if (error) throw error;
        dirty = false; hasSaved = true; say(t("Gespeichert."), "ok");
      } catch (err) {
        saveBtn.disabled = false;
        say(err && err.code === "54000" ? t("Zu viele oder zu große Elemente für deinen Tarif.")
          : err && err.code === "P0002" ? t("Lege zuerst deine Karte an.") : t("Die Seite konnte nicht gespeichert werden. Bitte versuche es erneut."), "error");
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
        undoBtn.disabled = redoBtn.disabled = true; drawAll(); say(t("Zurückgesetzt. Deine Seite zeigt wieder das Standardlayout."), "ok");
      } catch { say(t("Zurücksetzen hat nicht geklappt."), "error"); } finally { busy = false; }
    }
    window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

    // Startlayout für Neue: die Bausteine der Profilseite untereinander, dann die Links (Höhen misst relayout nach dem Zeichnen)
    let cardInfo = opts.cardInfo || null;
    function starter() {
      const items = [];
      const put = (kind, w) => { if (blocks[kind]) items.push({ id: uid8(), type: "block", kind, x: 0, y: 0, w, h: 200 }); };
      put("card", 300);
      links.filter((l) => l.active !== false).slice(0, Math.max(0, limit() - 7)).forEach((l) => items.push({ id: uid8(), type: "link", ref: l.id, x: 70, y: 0, w: 340, h: 54 }));
      ["head", "about", "offer", "seek", "skills"].forEach((k) => put(k, 440));
      return C.normalize({ h: 640, items });
    }
    // Elemente in Reihenfolge untereinander setzen, mittig, mit echter Höhe
    function relayout() {
      let y = 24;
      page.items.forEach((it) => { it.x = round((C.W - it.w) / 2); it.y = y; y += it.h + 18; });
      page.h = Math.min(C.MAX_H, Math.max(480, Math.ceil(y + 24)));
    }

    // ---- Start ----
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { loading.innerHTML = `${esc(t("Melde dich an, um deine Seite zu gestalten."))} <a class="text-link" href="/login">${esc(t("Anmelden"))}</a>`; return; }
      uid = session.user.id;
      try {
        const [l, p, pr] = await Promise.all([sb.rpc("get_my_links"), sb.rpc("get_my_page"), sb.from("profiles").select("is_premium,is_admin").eq("id", uid).maybeSingle()]);
        if (l.error || p.error) throw l.error || p.error;
        links = Array.isArray(l.data) ? l.data : [];
        paid = !!(pr.data && (pr.data.is_premium || pr.data.is_admin));
        hasSaved = !!(p.data && Array.isArray(p.data.items) && p.data.items.length);
        page = hasSaved ? C.normalize(p.data) : starter();
        loading.hidden = true; editor.hidden = false;
        drawAll();
        if (!hasSaved) { relayout(); drawAll(); dirty = true; saveBtn.disabled = false; }
      } catch {
        loading.textContent = t("Deine Seite lässt sich gerade nicht laden. Bitte versuch es später noch einmal.");
      }
    })();
  }

  window.XyntalPageEditor = { open };
})();
