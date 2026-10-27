// Xyntal – Karten-Builder: eigene Karte bauen, frei gestalten, als Bild speichern.
// Läuft auf der Startseite (Warteliste) und auf /meine-karte (mit Konto). Ohne Bibliotheken.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /* ---------------------------------------------------------------
     Profil-Builder: eigene Karte, frei gestaltbar, live – bleibt nur in diesem Browser
     --------------------------------------------------------------- */
  (() => {
    const form = $("[data-builder]");
    if (!form) return;
    const STORE = "xyntal-karte";
    // Mit Konto (/meine-karte): Daten kommen vom Server, nicht aus dem Browser-Speicher
    const ACCOUNT = form.hasAttribute("data-account-form");
    const listeners = [];
    const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
    const SUGGEST = {
      "Entwicklung": ["Swift", "React", "Python", "Flutter", "Node.js"],
      "Design": ["Figma", "UX", "Branding", "Prototyping"],
      "Gründung": ["Strategie", "Finanzen", "Pitch", "Produkt"],
      "Vertrieb": ["Akquise", "Verhandlung", "CRM", "B2B"],
      "Marketing": ["TikTok", "Content", "SEO", "Ads"],
      "Daten & KI": ["Python", "LLMs", "SQL", "Machine Learning"],
    };
    const THEMES = {
      aurora: ["#B95CFF", "#FF5FD2", "#5B8CFF", "#3FD8FF"],
      sunset: ["#FFB547", "#FF6A5C", "#FF3D8B", "#B95CFF"],
      ocean: ["#34D399", "#3FD8FF", "#5B8CFF", "#6D5BFF"],
      mono: ["#FFFFFF", "#C9C9D1", "#7A7A86", "#E4E4E7"],
    };
    const BLOCKS = { place: "Ort & Arbeitsweise", pitch: "Dein Satz", looking: "Was du suchst", skills: "Skills", stats: "Zeit & Erfahrung" };
    const DEFAULT_ORDER = ["place", "pitch", "skills", "stats", "looking"];
    const LEVELS = ["Einsteiger", "Fortgeschritten", "Profi"];
    const DEFAULT_PITCH = "Ich baue eine KI-App für Musiker:innen.";
    const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
    const el = {
      name: $("#bf-name"), city: $("#bf-city"), skill: $("#bf-skill"), hours: $("#bf-hours"), pitch: $("#bf-pitch"), link: $("#bf-link"),
      handle: $("#bf-handle"), handleHint: $("[data-bf-handle-hint]"), mcSite: $("[data-mc-site]"),
      skills: $("[data-bf-skills]"), suggest: $("[data-bf-suggest]"), hoursOut: $("[data-bf-hours-out]"),
      photo: $("[data-bf-photo]"), photoPick: $("[data-bf-photo-pick]"), photoPreview: $("[data-bf-photo-preview]"),
      photoLabel: $("[data-bf-photo-label]"), photoRemove: $("[data-bf-photo-remove]"),
      custom: $("[data-bf-custom]"), customSwatch: $("[data-bf-custom-swatch]"), order: $("[data-bf-order]"),
      card: $("[data-my-card]"), blocks: $("[data-mc-blocks]"), mcAvatar: $("[data-mc-avatar]"), mcName: $("[data-mc-name]"), mcRole: $("[data-mc-role]"),
      mcLevel: $("[data-mc-level]"), mcLevel2: $("[data-mc-level-2]"), mcDots: $$("[data-mc-dots] i"), mcPlace: $("[data-mc-place]"),
      mcSkills: $("[data-mc-skills]"), mcHours: $("[data-mc-hours]"), mcBar: $("[data-mc-bar]"), mcPitch: $("[data-mc-pitch]"),
      mcLooking: $("[data-mc-looking]"), mcLink: $("[data-mc-link]"),
      status: $("[data-card-status]"), save: $("[data-card-save]"), launch: $("[data-launch-card]"),
    };
    let data = { name: "", city: "", role: "Entwicklung", level: "Fortgeschritten", skills: [], hours: 8, mode: "Hybrid",
      looking: "Mitgründer:in", pitch: "", link: "", handle: "", photo: "", touched: false,
      theme: "aurora", c1: "#FF5FD2", c2: "#3FD8FF", surface: "dark", shape: "circle", layout: "left", order: DEFAULT_ORDER.slice(), off: [] };
    if (!ACCOUNT) try { const saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved && typeof saved === "object") data = { ...data, ...saved }; } catch { /* egal */ }
    // Wunsch-Link: nur a–z, 0–9, - und _, 3–20 Zeichen, beginnt mit Buchstabe oder Zahl
    const cleanHandle = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[-_]+/, "").slice(0, 20);
    const validHandle = (s) => /^[a-z0-9][a-z0-9_-]{2,19}$/.test(s);
    // Werte absichern (aus dem Browser-Speicher oder vom Server)
    function normalize() {
      if (!THEMES[data.theme] && data.theme !== "custom") data.theme = "aurora";
      if (!isHex(data.c1)) data.c1 = "#FF5FD2";
      if (!isHex(data.c2)) data.c2 = "#3FD8FF";
      if (!LEVELS.includes(data.level)) data.level = "Fortgeschritten";
      if (!["Remote", "Hybrid", "Vor Ort"].includes(data.mode)) data.mode = "Hybrid";
      if (!["dark", "light"].includes(data.surface)) data.surface = "dark";
      if (!["circle", "rounded"].includes(data.shape)) data.shape = "circle";
      if (!["left", "center"].includes(data.layout)) data.layout = "left";
      if (!Array.isArray(data.order)) data.order = [];
      data.order = data.order.filter((b) => BLOCKS[b]).concat(DEFAULT_ORDER).filter((b, i, a) => a.indexOf(b) === i);
      data.off = Array.isArray(data.off) ? data.off.filter((b) => BLOCKS[b]) : [];
      if (typeof data.photo !== "string" || !/^(data:image\/|blob:)/.test(data.photo)) data.photo = "";
      for (const k of ["name", "city", "pitch", "link", "handle"]) if (typeof data[k] !== "string") data[k] = "";
      data.handle = cleanHandle(data.handle);
      if (!Array.isArray(data.skills)) data.skills = [];
      data.skills = data.skills.filter((x) => typeof x === "string").slice(0, 4);
      data.hours = Math.max(2, Math.min(40, Number(data.hours) || 8));
    }
    normalize();
    const siteText = () => (validHandle(data.handle) ? `xyntal.de/${data.handle}` : "xyntal.de");

    const colors = () => (data.theme === "custom" ? [data.c1, data.c2] : THEMES[data.theme]);
    const cssGrad = () => `linear-gradient(120deg, ${colors().map((c, k, a) => `${c} ${Math.round((k / (a.length - 1)) * 100)}%`).join(", ")})`;

    // Link: nur echte Webadressen, angezeigt ohne https:// und www.
    const linkUrl = (raw) => {
      const s = (raw || "").trim();
      if (!s) return "";
      try {
        const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
        return /^[^.\s]+(\.[^.\s]+)+$/.test(u.hostname) ? u.href.slice(0, 200) : "";
      } catch { return ""; }
    };
    const linkLabel = (href) => href.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").slice(0, 40);
    const placeText = () => [data.city.trim(), t(data.mode)].filter(Boolean).join(" · ");
    const shown = (b) => !data.off.includes(b);

    const radio = (name) => $(`input[name="${name}"]:checked`, form)?.value;
    const persist = () => {
      if (!data.touched) return;
      listeners.forEach((fn) => { try { fn({ ...data }); } catch { /* egal */ } });
      if (ACCOUNT) return;
      const box = $("[data-share-card]"); if (box) box.hidden = false;
      try { localStorage.setItem(STORE, JSON.stringify(data)); }
      catch { try { localStorage.setItem(STORE, JSON.stringify({ ...data, photo: "" })); } catch { /* egal */ } }
    };

    function renderChips() {
      $$(".bf-chip", el.skills).forEach((c) => c.remove());
      data.skills.forEach((s, k) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "bf-chip"; b.dataset.k = k;
        b.innerHTML = `${esc(s)}<span aria-hidden="true">×</span><span class="sr-only"> entfernen</span>`;
        el.skills.insertBefore(b, el.skill);
      });
      el.skill.hidden = data.skills.length >= 4;
      const opts = (SUGGEST[data.role] || []).filter((s) => !data.skills.includes(s)).slice(0, 4);
      el.suggest.innerHTML = data.skills.length >= 4 ? "" : opts.map((s) => `<button type="button" data-add="${esc(s)}">+ ${esc(s)}</button>`).join("");
    }

    function renderPhoto() {
      if (!el.photoPreview) return;
      const has = !!data.photo;
      el.photoPreview.innerHTML = has
        ? `<img src="${data.photo}" alt="">`
        : '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
      if (el.photoLabel) el.photoLabel.textContent = t(has ? "Foto ändern" : "Foto hinzufügen");
      if (el.photoRemove) el.photoRemove.hidden = !has;
    }

    function renderOrder(focusSel) {
      const n = data.order.length;
      el.order.innerHTML = data.order.map((b, i) => `<li class="${shown(b) ? "" : "is-off"}">
          <label><input type="checkbox" data-show="${b}"${shown(b) ? " checked" : ""}><span class="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7"/></svg></span><span>${esc(t(BLOCKS[b]))}</span></label>
          <span class="bf-move">
            <button type="button" data-move="${b}" data-dir="-1"${i === 0 ? " disabled" : ""} aria-label="${esc(t(BLOCKS[b]))}: ${esc(t("nach oben"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg></button>
            <button type="button" data-move="${b}" data-dir="1"${i === n - 1 ? " disabled" : ""} aria-label="${esc(t(BLOCKS[b]))}: ${esc(t("nach unten"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>
          </span>
        </li>`).join("");
      if (focusSel) {
        const f = $(focusSel, el.order);
        const b = f?.dataset.move;
        (f && !f.disabled ? f : b ? $(`[data-move="${b}"]:not([disabled])`, el.order) : null)?.focus();
      }
    }

    function render() {
      const name = data.name.trim() || "Alex";
      const c = el.card;
      c.dataset.theme = data.theme; c.dataset.surface = data.surface; c.dataset.shape = data.shape; c.dataset.layout = data.layout;
      c.style.setProperty("--tg", cssGrad()); c.style.setProperty("--t1", colors()[0]);
      el.customSwatch.style.setProperty("--tg", `linear-gradient(120deg, ${data.c1}, ${data.c2})`);
      el.custom.hidden = data.theme !== "custom";
      el.mcName.textContent = name;
      el.mcAvatar.innerHTML = data.photo ? `<img src="${data.photo}" alt="">` : `<span>${esc(name[0].toUpperCase())}</span>`;
      el.mcRole.textContent = t(data.role);
      el.mcLevel.textContent = el.mcLevel2.textContent = t(data.level);
      el.mcDots.forEach((d, k) => d.classList.toggle("on", k <= LEVELS.indexOf(data.level)));
      el.mcPlace.textContent = placeText();
      const skills = data.skills.length ? data.skills : (SUGGEST[data.role] || []).slice(0, 3);
      el.mcSkills.innerHTML = skills.map((s) => `<li>${esc(s)}</li>`).join("");
      el.mcSkills.classList.toggle("is-ghost", !data.skills.length);
      el.mcHours.textContent = `${data.hours} Std./Woche`;
      el.mcBar.style.width = `${Math.min(100, (data.hours / 20) * 100)}%`;
      el.hoursOut.textContent = `${data.hours} Std.`;
      el.mcPitch.textContent = data.pitch.trim() || t(DEFAULT_PITCH);
      el.mcPitch.classList.toggle("is-ghost", !data.pitch.trim());
      el.mcLooking.textContent = t(data.looking);
      // Blöcke in der gewählten Reihenfolge, ausgeblendete verstecken
      for (const b of data.order) { const node = $(`[data-block="${b}"]`, el.blocks); node.hidden = !shown(b); el.blocks.append(node); }
      const href = linkUrl(data.link);
      el.mcLink.hidden = !href;
      el.mcLink.textContent = href ? ((/(^|\.)linkedin\.com$/i.test(new URL(href).hostname) ? "LinkedIn" : "Website") + " ↗") : "";
      if (href) el.mcLink.href = href; else el.mcLink.removeAttribute("href");
      el.link.toggleAttribute("aria-invalid", !!data.link.trim() && !href);
      el.mcSite.textContent = siteText();
      const badHandle = !!data.handle && !validHandle(data.handle);
      el.handle.toggleAttribute("aria-invalid", badHandle);
      el.handleHint.classList.toggle("is-error", badHandle);
      c.classList.remove("pulse"); void c.offsetWidth; c.classList.add("pulse");
      // kleine Vorschau in der Warteliste
      if (el.launch && data.touched) {
        el.launch.hidden = false;
        const av = data.photo ? `<img src="${data.photo}" alt="">` : esc(name[0].toUpperCase());
        el.launch.innerHTML = `<span class="mc-avatar">${av}</span><span><b>${esc(name)}</b> · ${esc(t(data.role))}</span><span class="lc-ok">${esc(t("Karte bereit"))}</span>`;
      }
    }

    function sync() {
      data.name = el.name.value; data.city = el.city.value; data.pitch = el.pitch.value; data.link = el.link.value;
      const h = cleanHandle(el.handle.value);
      if (el.handle.value !== h) el.handle.value = h;
      data.handle = h;
      data.hours = Number(el.hours.value);
      for (const key of ["role", "level", "mode", "looking", "theme", "surface", "shape", "layout"]) data[key] = radio(key) || data[key];
      const c1 = form.c1.value, c2 = form.c2.value;
      if (isHex(c1)) data.c1 = c1; if (isHex(c2)) data.c2 = c2;
      data.touched = true;
      persist(); render();
    }
    function addSkill(raw) {
      const s = raw.trim().replace(/\s+/g, " ").slice(0, 20);
      if (!s || data.skills.length >= 4 || data.skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
      data.skills.push(s); data.touched = true;
      persist(); renderChips(); render();
    }

    // Anordnung: ein-/ausblenden und verschieben
    el.order.addEventListener("change", (e) => {
      const b = e.target.dataset.show; if (!b) return;
      data.off = e.target.checked ? data.off.filter((x) => x !== b) : data.off.concat(b);
      data.touched = true; persist(); renderOrder(`[data-show="${b}"]`); render();
    });
    el.order.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-move]"); if (!btn) return;
      const b = btn.dataset.move, dir = Number(btn.dataset.dir), i = data.order.indexOf(b), j = i + dir;
      if (j < 0 || j >= data.order.length) return;
      [data.order[i], data.order[j]] = [data.order[j], data.order[i]];
      data.touched = true; persist(); renderOrder(`[data-move="${b}"][data-dir="${dir}"]`); render();
    });

    // Foto: quadratisch zuschneiden und verkleinern – bleibt im Browser
    async function readPhoto(file) {
      if (!file || !/^image\//.test(file.type)) throw new Error("type");
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h);
        if (!s) throw new Error("size");
        const cv = document.createElement("canvas");
        cv.width = cv.height = 400;
        const g = cv.getContext("2d");
        g.imageSmoothingQuality = "high";
        g.drawImage(img, (w - s) / 2, (h - s) / 2.6, s, s, 0, 0, 400, 400);
        return cv.toDataURL("image/jpeg", 0.86);
      } finally { URL.revokeObjectURL(url); }
    }
    if (el.photoPick && el.photo) el.photoPick.addEventListener("click", () => el.photo.click());
    if (el.photo) el.photo.addEventListener("change", async () => {
      const file = el.photo.files && el.photo.files[0];
      el.photo.value = "";
      if (!file) return;
      try {
        data.photo = await readPhoto(file);
        data.touched = true;
        persist(); renderPhoto(); render();
        el.status.textContent = t("Foto übernommen. Es bleibt nur auf deinem Gerät.");
      } catch {
        el.status.textContent = t("Dieses Bild konnte nicht geladen werden. Probier ein JPG oder PNG.");
      }
    });
    if (el.photoRemove) el.photoRemove.addEventListener("click", () => { data.photo = ""; persist(); renderPhoto(); render(); el.photoPick.focus(); });

    // Formular mit gespeicherten Werten füllen
    // Kommt man über einen freien Link (xyntal.de/name → „Diesen Link sichern“), ist der Name schon eingetragen
    try {
      const params = new URLSearchParams(location.search), wanted = cleanHandle(params.get("handle") || "");
      if (validHandle(wanted)) { data.handle = wanted; data.touched = true; persist(); }
      if (params.has("handle")) { params.delete("handle"); history.replaceState(null, "", location.pathname + (params.toString() ? `?${params}` : "") + location.hash); }
    } catch { /* egal */ }
    function fillForm() {
      el.name.value = data.name; el.city.value = data.city; el.pitch.value = data.pitch; el.link.value = data.link; el.hours.value = data.hours;
      el.handle.value = data.handle;
      form.c1.value = data.c1; form.c2.value = data.c2;
      for (const key of ["role", "level", "mode", "looking", "theme", "surface", "shape", "layout"]) $$(`input[name="${key}"]`, form).forEach((r) => { r.checked = r.value === data[key]; });
    }
    fillForm();

    form.addEventListener("input", (e) => { if (e.target !== el.skill && e.target !== el.photo && !e.target.dataset.show) sync(); });
    form.addEventListener("change", (e) => { if (e.target.type === "radio") { sync(); renderChips(); } });
    form.addEventListener("submit", (e) => e.preventDefault());
    el.skill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(el.skill.value); el.skill.value = ""; }
      else if (e.key === "Backspace" && !el.skill.value && data.skills.length) { data.skills.pop(); persist(); renderChips(); render(); }
    });
    el.skill.addEventListener("blur", () => { if (el.skill.value.trim()) { addSkill(el.skill.value); el.skill.value = ""; } });
    el.skills.addEventListener("click", (e) => {
      const chip = e.target.closest(".bf-chip");
      if (chip) { data.skills.splice(Number(chip.dataset.k), 1); persist(); renderChips(); render(); el.skill.focus(); }
      else if (e.target === el.skills) el.skill.focus();
    });
    el.suggest.addEventListener("click", (e) => { const b = e.target.closest("[data-add]"); if (b) addSkill(b.dataset.add); });

    /* ---- Karte als Bild (PNG, 1080 × 1350) zeichnen – folgt Farben, Layout und Anordnung ---- */
    const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Arial, sans-serif';
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function wrap(g, text, maxW, max) {
      const words = text.split(" "), lines = []; let line = "";
      for (const w of words) { const test = line ? line + " " + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line);
      if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, "") + " …"; }
      return lines;
    }
    const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
    const PALETTE = {
      dark: { bg1: "#1A1A23", bg2: "#121219", text: "#F5F5F7", text2: "#C4C4CC", text3: "#8A8A95", chip: "rgba(255,255,255,0.08)", panel: "rgba(255,255,255,0.05)", line: "rgba(255,255,255,0.09)", track: "rgba(255,255,255,0.1)" },
      light: { bg1: "#FFFFFF", bg2: "#F3F3F7", text: "#121218", text2: "#3F3F4A", text3: "#71717F", chip: "rgba(0,0,0,0.06)", panel: "rgba(0,0,0,0.04)", line: "rgba(0,0,0,0.09)", track: "rgba(0,0,0,0.09)" },
    };

    // Inhalt der Karte (ohne Hintergrund) auf g zeichnen; liefert die nötige Höhe
    function paintContent(g, CW, photo) {
      const P = PALETTE[data.surface], C = colors(), pad = 64, center = data.layout === "center";
      const grad = (x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); C.forEach((col, k) => gr.addColorStop(k / (C.length - 1), col)); return gr; };
      const name = data.name.trim() || "Alex";
      const tx = center ? CW / 2 : pad, align = center ? "center" : "left";
      // Avatar
      const ar = 100, ax = center ? CW / 2 : pad + ar, ay = 230;
      const shape = (r) => { if (data.shape === "rounded") roundRect(g, ax - r, ay - r, r * 2, r * 2, r * 0.42); else { g.beginPath(); g.arc(ax, ay, r, 0, Math.PI * 2); } };
      shape(ar + 10); g.fillStyle = grad(ax - ar, ax + ar); g.fill();
      shape(ar + 3); g.fillStyle = P.bg1; g.fill();
      g.save(); shape(ar - 3); g.clip();
      if (photo) g.drawImage(photo, ax - ar, ay - ar, ar * 2, ar * 2);
      else { g.fillStyle = grad(ax - ar, ax + ar); g.fillRect(ax - ar, ay - ar, ar * 2, ar * 2); g.fillStyle = data.theme === "mono" ? "#111" : "#fff"; g.font = `700 88px ${FONT}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name[0].toUpperCase(), ax, ay + 4); }
      g.restore();
      // Name, Rolle
      let cy = ay + ar + 96; g.textBaseline = "alphabetic"; g.textAlign = align;
      g.font = `700 76px ${FONT}`; g.fillStyle = P.text; g.fillText(name, tx, cy);
      cy += 54; g.font = `500 36px ${FONT}`; g.fillStyle = P.text2; g.fillText(`${t(data.role)} · ${t(data.level)}`, tx, cy);
      cy += 22;
      const blocks = {
        place() {
          const place = placeText(); if (!place) return;
          g.font = `500 32px ${FONT}`; const pw = g.measureText(place).width + 42, x0 = center ? CW / 2 - pw / 2 : pad;
          g.save(); g.translate(x0 - 2, cy + 2); g.scale(1.4, 1.4); g.strokeStyle = P.text3; g.lineWidth = 2.2;
          g.beginPath(); g.moveTo(12, 21); g.bezierCurveTo(9, 18.5, 5.5, 14.5, 5.5, 10); g.arc(12, 10, 6.5, Math.PI, 0); g.bezierCurveTo(18.5, 14.5, 15, 18.5, 12, 21); g.stroke();
          g.beginPath(); g.arc(12, 10, 2.3, 0, Math.PI * 2); g.stroke(); g.restore();
          g.textAlign = "left"; g.fillStyle = P.text3; g.fillText(place, x0 + 42, cy + 30); g.textAlign = align;
          cy += 40;
        },
        pitch() {
          g.font = `600 42px ${FONT}`; g.fillStyle = data.pitch.trim() ? P.text : P.text3;
          for (const line of wrap(g, data.pitch.trim() || t(DEFAULT_PITCH), CW - pad * 2, 3)) { cy += 52; g.fillText(line, tx, cy); }
          cy += 12;
        },
        looking() {
          const sl = t("Sucht"), lk = t(data.looking);
          g.font = `500 28px ${FONT}`; const slw = g.measureText(sl).width; g.font = `700 30px ${FONT}`; const lkw = g.measureText(lk).width;
          const pw = Math.min(CW - pad * 2, slw + lkw + 66), px = center ? CW / 2 - pw / 2 : pad;
          roundRect(g, px, cy, pw, 60, 30); g.fillStyle = P.chip; g.fill();
          g.textAlign = "left"; g.textBaseline = "middle";
          g.font = `500 28px ${FONT}`; g.fillStyle = P.text3; g.fillText(sl, px + 26, cy + 31);
          g.font = `700 30px ${FONT}`; g.fillStyle = grad(px, px + pw); g.fillText(lk, px + 40 + slw, cy + 31);
          g.textAlign = align; g.textBaseline = "alphabetic"; cy += 60;
        },
        skills() {
          const list = data.skills.length ? data.skills : (SUGGEST[data.role] || []).slice(0, 3);
          g.font = `500 30px ${FONT}`;
          const rows = [[]]; let rw = 0;
          for (const s of list) { const sw = g.measureText(s).width + 50; if (rw + sw > CW - pad * 2 && rows.at(-1).length) { rows.push([]); rw = 0; } rows.at(-1).push([s, sw]); rw += sw + 12; }
          g.textAlign = "left"; g.textBaseline = "middle";
          rows.forEach((row, ri) => {
            const total = row.reduce((a, [, sw]) => a + sw, 0) + 12 * (row.length - 1);
            let sx = center ? CW / 2 - total / 2 : pad; const ry = cy + ri * 68;
            for (const [s, sw] of row) { roundRect(g, sx, ry, sw, 56, 28); g.fillStyle = P.chip; g.fill(); g.fillStyle = data.skills.length ? P.text : P.text3; g.fillText(s, sx + 25, ry + 29); sx += sw + 12; }
          });
          g.textAlign = align; g.textBaseline = "alphabetic"; cy += rows.length * 68 - 12;
        },
        stats() {
          const bw = (CW - pad * 2 - 20) / 2, lv = LEVELS.indexOf(data.level);
          const box = (bx, label, value) => {
            roundRect(g, bx, cy, bw, 140, 26); g.fillStyle = P.panel; g.fill();
            g.textAlign = "left"; g.font = `500 26px ${FONT}`; g.fillStyle = P.text3; g.fillText(label, bx + 28, cy + 46);
            g.font = `700 34px ${FONT}`; g.fillStyle = P.text; g.fillText(value, bx + 28, cy + 90);
          };
          box(pad, t("Zeit"), t(`${data.hours} Std./Woche`));
          roundRect(g, pad + 28, cy + 110, bw - 56, 9, 4.5); g.fillStyle = P.track; g.fill();
          roundRect(g, pad + 28, cy + 110, Math.max(18, (bw - 56) * Math.min(1, data.hours / 20)), 9, 4.5); g.fillStyle = grad(pad, pad + bw); g.fill();
          const bx2 = pad + bw + 20; box(bx2, t("Erfahrung"), t(data.level));
          const dw = (bw - 56 - 14) / 3;
          for (let k = 0; k < 3; k++) { roundRect(g, bx2 + 28 + k * (dw + 7), cy + 110, dw, 9, 4.5); g.fillStyle = k <= lv ? grad(bx2, bx2 + bw) : P.track; g.fill(); }
          g.textAlign = align; cy += 140;
        },
      };
      for (const b of data.order) if (shown(b)) { cy += 36; blocks[b](); }
      // Fuß
      cy += 48; g.fillStyle = P.line; g.fillRect(pad, cy, CW - pad * 2, 2);
      cy += 52; g.textBaseline = "middle"; g.font = `500 30px ${FONT}`; g.textAlign = "left";
      const href = linkUrl(data.link);
      if (href) { g.fillStyle = P.text2; g.fillText(linkLabel(href), pad, cy); }
      g.textAlign = "right"; g.fillStyle = validHandle(data.handle) ? P.text2 : P.text3; g.fillText(siteText(), CW - pad, cy); g.textAlign = "left";
      return cy + 50;
    }

    async function drawCard() {
      const W = 1080, H = 1350, CW = 900;
      const C = colors(), P = PALETTE[data.surface];
      const photo = data.photo ? await loadImg(data.photo) : null;
      // 1. Inhalt auf eine Zwischenfläche, um die Höhe zu kennen
      const tmp = document.createElement("canvas"); tmp.width = CW; tmp.height = 2400;
      const CH = Math.ceil(paintContent(tmp.getContext("2d"), CW, photo));
      // 2. Karte zusammensetzen
      const card = document.createElement("canvas"); card.width = CW; card.height = CH;
      const k = card.getContext("2d");
      const grad = (x0, y0, x1, y1) => { const gr = k.createLinearGradient(x0, y0, x1, y1); C.forEach((col, i) => gr.addColorStop(i / (C.length - 1), col)); return gr; };
      k.save(); roundRect(k, 2, 2, CW - 4, CH - 4, 62); const bg = k.createLinearGradient(0, 0, 0, CH); bg.addColorStop(0, P.bg1); bg.addColorStop(1, P.bg2); k.fillStyle = bg; k.fill(); k.clip();
      k.fillStyle = grad(0, 0, CW, 230); k.fillRect(0, 0, CW, 230);
      const shade = k.createLinearGradient(0, 0, 0, 230); shade.addColorStop(0, "rgba(10,10,16,0.02)"); shade.addColorStop(1, data.surface === "light" ? "rgba(255,255,255,0.35)" : "rgba(26,26,35,0.55)"); k.fillStyle = shade; k.fillRect(0, 0, CW, 230);
      k.restore();
      k.save(); roundRect(k, 2, 2, CW - 4, CH - 4, 62); k.lineWidth = 4; k.strokeStyle = grad(0, 0, CW, CH); k.stroke(); k.restore();
      // Logo und Badge im Titelbild
      const ink = data.theme === "mono" ? "#111" : "#fff";
      k.save(); k.translate(58, 42); k.scale(1.7, 1.7); k.strokeStyle = ink; k.lineWidth = 2.8; k.lineCap = "round";
      k.beginPath(); k.moveTo(5, 5); k.lineTo(19, 19); k.moveTo(19, 5); k.lineTo(13.7, 10.3); k.moveTo(10.3, 13.7); k.lineTo(5, 19); k.stroke(); k.restore();
      k.textBaseline = "middle"; k.fillStyle = ink; k.font = `700 40px ${FONT}`; k.fillText("xyntal", 104, 64);
      k.font = `600 28px ${FONT}`; const badge = t("Early Access"); const bw = k.measureText(badge).width + 48;
      roundRect(k, CW - 64 - bw, 38, bw, 54, 27); k.fillStyle = "rgba(0,0,0,0.32)"; k.fill();
      k.fillStyle = "#fff"; k.fillText(badge, CW - 64 - bw + 24, 66);
      k.drawImage(tmp, 0, 0);
      // 3. Auf das Format 1080 × 1350 setzen
      const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
      g.fillStyle = data.surface === "light" ? "#ECECF2" : "#07070B"; g.fillRect(0, 0, W, H);
      for (const [gx, gy, r, col] of [[160, 80, 900, C[0]], [W, H, 800, C[C.length - 1]]]) {
        const gl = g.createRadialGradient(gx, gy, 0, gx, gy, r); gl.addColorStop(0, rgba(col, 0.35)); gl.addColorStop(1, rgba(col, 0)); g.fillStyle = gl; g.fillRect(0, 0, W, H);
      }
      const s = Math.min(1, 1170 / CH), dw = CW * s, dh = CH * s;
      g.drawImage(card, (W - dw) / 2, 60 + (1170 - dh) / 2, dw, dh);
      const tg = g.createLinearGradient(W / 2 - 330, 0, W / 2 + 330, 0); C.forEach((col, i) => tg.addColorStop(i / (C.length - 1), col));
      g.font = `700 44px ${FONT}`; g.fillStyle = data.theme === "mono" && data.surface === "light" ? "#111" : tg; g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillText("Stop swiping. Start building.", W / 2, H - 40);
      return c;
    }

    el.save.addEventListener("click", async () => {
      const canvas = await drawCard();
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (!blob) return;
      const file = new File([blob], "meine-xyntal-karte.png", { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
          await navigator.share({ files: [file], title: "Meine Xyntal-Karte", text: "Stop swiping. Start building. – xyntal.de" });
          el.status.textContent = t("Geteilt!");
          return;
        }
      } catch (err) { if (err && err.name === "AbortError") return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "meine-xyntal-karte.png";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      el.status.textContent = t("Bild gespeichert: meine-xyntal-karte.png");
    });
    $("[data-card-join]")?.addEventListener("click", () => setTimeout(() => $("#wl-email")?.focus({ preventScroll: true }), still ? 0 : 600));

    // Für die Warteliste: nur die Angaben – Foto und Gestaltung bleiben auf dem Gerät
    window.XyntalCard = () => ({ name: data.name, city: data.city, role: data.role, level: data.level, skills: data.skills.slice(), hours: data.hours,
      mode: data.mode, looking: data.looking, pitch: data.pitch, link: linkUrl(data.link), handle: validHandle(data.handle) ? data.handle : "", touched: data.touched,
      design: { theme: data.theme, c1: data.c1, c2: data.c2, surface: data.surface, shape: data.shape, layout: data.layout, order: data.order.slice(), off: data.off.slice() } });
    window.XyntalCardDraw = drawCard;
    // Schnittstelle für /meine-karte: Karte vom Server laden, Änderungen beobachten
    window.XyntalBuilder = {
      get: () => ({ ...data, skills: data.skills.slice(), order: data.order.slice(), off: data.off.slice() }),
      set(values) {
        data = { ...data, ...values, touched: true };
        normalize(); fillForm();
        renderChips(); renderPhoto(); renderOrder(); render(); showShare();
      },
      onChange: (fn) => listeners.push(fn),
      validHandle, cleanHandle, linkUrl,
    };
    const shareBox = $("[data-share-card]"), publicBox = $("[data-public-card]");
    const showShare = () => {
      if (shareBox) shareBox.hidden = !data.touched;
      if (publicBox) {
        const ok = data.touched && validHandle(data.handle);
        publicBox.hidden = !ok;
        if (!ok) { const cb = $("input", publicBox); if (cb) cb.checked = false; }
        const label = $("[data-public-handle]", publicBox); if (label) label.textContent = `xyntal.de/${ok ? data.handle : "deinname"}`;
      }
    };
    form.addEventListener("input", showShare);
    form.addEventListener("change", showShare);
    renderChips(); renderPhoto(); renderOrder(); render(); showShare();
    document.addEventListener("xyntal:lang", () => { renderPhoto(); renderOrder(); render(); });
  })();
})();
