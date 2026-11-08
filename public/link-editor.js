// Link-Editor im Profil (/profil#links): eigene Links anlegen, ordnen, ausblenden, speichern (RPC get_my_links / save_my_links)
(() => {
  const box = document.querySelector("[data-le]");
  const I = window.XyntalLinkIcons;
  if (!box || !I || typeof sb === "undefined" || !sb) return;
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const $ = (sel) => box.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const list = $("[data-le-list]"), empty = $("[data-le-empty]"), count = $("[data-le-count]"), out = $("[data-le-status]");
  const addBtn = $("[data-le-add]"), saveBtn = $("[data-le-save]");
  // Wie viele Links je Tarif – dieselbe Tabelle prüft die Datenbank (link_limit, Migration 20261108090000)
  const TIERS = [
    { name: "Free", max: 5, plans: ["Free", ""] },
    { name: "Plus", max: 25, plans: ["Plus", "Forge", "Pulse"] },
    { name: "Pro", max: 50, plans: ["Pro", "Crew", "Nexus"] },
    { name: "Ultra", max: 100, plans: ["Ultra", "Foundry", "Ascend"] },
    { name: "Enterprise", max: 250, plans: ["Enterprise", "Enterprise+", "Works", "Works Custom"] },
  ];
  let rows = [], paid = false, busy = false, dirty = false, tier = TIERS[0], admin = false, grandfathered = 0;
  const limit = () => Math.max(admin ? 1000 : tier.max, grandfathered);
  const nextTier = () => (admin ? null : TIERS[TIERS.indexOf(tier) + 1] || null);
  const say = (text, kind = "") => { out.textContent = text; out.className = "mk-status" + (kind ? ` is-${kind}` : ""); };
  const validUrl = (u) => /^https?:\/\/[^\s]{3,}$/i.test(u) && u.length <= 500;
  // Statt einer Adresse darf auch Text stehen (z. B. „Username: nico“): der erscheint auf der Seite zum Kopieren
  const validEntry = (u) => { const v = String(u || "").trim(); return v.length > 0 && v.length <= 500; };
  // Eingabe ohne Schema („github.com/x“) wird zu https://
  // Nur „https://…“ oder „http://…“ ist ein Link; „xyntal.de“ ohne Schema bleibt Text (wird nicht ergänzt)
  const normalize = (u) => String(u || "").trim();

  // Kleine Symbole für die Werkzeuge einer Zeile
  const TOOL = {
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    on: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
    off: '<path d="M2.5 12s3.5-6 9.5-6c1.6 0 3 .4 4.3 1M21.5 12s-3.5 6-9.5 6c-1.6 0-3-.4-4.3-1M4 4l16 16"/>',
    del: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    chev: '<path d="m7 10 5 5 5-5"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
  };
  const tool = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${TOOL[k]}</svg>`;

  function render() {
    list.innerHTML = rows.map((r, i) => `<li class="le-row${r.active ? "" : " is-off"}" data-i="${i}">
        <label class="le-ico" title="${esc(t("Symbol"))}">
          <span data-ico>${I.svg(r.icon)}</span>
          <span class="le-ico-chev">${tool("chev")}</span>
          <select data-f="icon" aria-label="${esc(t("Symbol"))}">${I.keys.map((k) => `<option value="${k}"${k === r.icon ? " selected" : ""}>${esc(t(I.labels[k]))}</option>`).join("")}</select>
        </label>
        <div class="le-fields">
          <input type="text" class="le-title" data-f="title" maxlength="60" value="${esc(r.title)}" placeholder="${esc(t("Titel, z. B. Mein Portfolio"))}" aria-label="${esc(t("Titel"))}">
          <input type="text" class="le-url" data-f="url" maxlength="500" autocapitalize="off" spellcheck="false" value="${esc(r.url)}" placeholder="${esc(t("https://… oder Text, z. B. Username: nico"))}" aria-label="${esc(t("Adresse oder Text"))}">
          ${r.url && !validUrl(normalize(r.url)) ? `<span class="le-kind">${esc(t("Text zum Kopieren"))}</span>` : ""}
        </div>
        <div class="le-tools">
          <button type="button" class="le-btn le-grip" data-drag title="${esc(t("Ziehen zum Verschieben"))}" aria-label="${esc(t("Ziehen zum Verschieben"))}" tabindex="-1">${tool("grip")}</button>
          <button type="button" class="le-btn" data-act="up" title="${esc(t("Nach oben"))}" aria-label="${esc(t("Nach oben"))}"${i === 0 ? " disabled" : ""}>${tool("up")}</button>
          <button type="button" class="le-btn" data-act="down" title="${esc(t("Nach unten"))}" aria-label="${esc(t("Nach unten"))}"${i === rows.length - 1 ? " disabled" : ""}>${tool("down")}</button>
          <button type="button" class="le-btn" data-act="toggle" aria-pressed="${r.active ? "false" : "true"}" title="${esc(t(r.active ? "Ausblenden" : "Einblenden"))}" aria-label="${esc(t(r.active ? "Ausblenden" : "Einblenden"))}">${tool(r.active ? "on" : "off")}</button>
          <button type="button" class="le-btn le-btn-del" data-act="del" title="${esc(t("Löschen"))}" aria-label="${esc(t("Löschen"))}">${tool("del")}</button>
        </div>
        ${r.active ? "" : `<span class="le-tag">${esc(t("Ausgeblendet"))}</span>`}
        ${paid && r.clicks != null ? `<span class="le-clicks" data-no-i18n>${Number(r.clicks)} ${esc(t("Klicks"))}</span>` : ""}
      </li>`).join("");
    empty.hidden = rows.length > 0;
    addBtn.disabled = busy || rows.length >= limit();
    const up = nextTier();
    const plan = admin ? t("Admin") : tier.name;
    const more = up ? ` · <a class="text-link" href="/preise">${esc(t("Bis zu {n} Links mit {plan}").replace("{n}", up.max).replace("{plan}", up.name))}</a>` : "";
    const stats = paid ? "" : ` · ${esc(t("Klickstatistik ab Plus"))}`;
    const full = rows.length >= limit() ? ` <b class="le-full">${esc(t("Limit erreicht"))}</b>` : "";
    count.innerHTML = `<span class="le-meter${rows.length >= limit() ? " is-full" : ""}" aria-hidden="true"><i style="width:${Math.min(100, (rows.length / limit()) * 100)}%"></i></span><span>${rows.length} / ${limit()} ${esc(t("Links"))} (${esc(plan)})${full}${stats}${more}</span>`;
  }

  list.addEventListener("input", (e) => {
    const row = e.target.closest("[data-i]"), f = e.target.dataset.f;
    if (!row || !f) return;
    const r = rows[Number(row.dataset.i)];
    r[f] = e.target.value;
    dirty = true;
    if (f === "icon") row.querySelector("[data-ico]").innerHTML = I.svg(r.icon);
  });
  // Symbol aus der Adresse erkennen, solange es noch nicht von Hand gewählt wurde
  list.addEventListener("change", (e) => {
    const row = e.target.closest("[data-i]");
    if (!row || e.target.dataset.f !== "url") return;
    const r = rows[Number(row.dataset.i)];
    r.url = normalize(e.target.value);
    e.target.value = r.url;
    // Symbol nur aus echten Adressen raten; Text behält sein Symbol
    if (validUrl(r.url) && (r.icon === "link" || r.iconAuto)) { r.icon = I.guess(r.url); r.iconAuto = true; }
    render();
  });
  // Ziehen zum Sortieren: am Griff oder an einer freien Stelle der Zeile packen (Maus, Stift, Finger).
  // Die Zeile folgt dem Zeiger, die anderen rücken nach; beim Loslassen gilt die neue Reihenfolge.
  let drag = null;
  list.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || busy) return;
    const row = e.target.closest(".le-row");
    if (!row) return;
    const onGrip = e.target.closest("[data-drag]");
    if (!onGrip && e.target.closest("input, select, button, label, a")) return;
    e.preventDefault();
    drag = { row, startY: e.clientY, offset: 0, moved: false, id: e.pointerId };
    row.setPointerCapture(e.pointerId);
  });
  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    let dy = e.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dy) < 4) return;
      drag.moved = true;
      drag.row.classList.add("is-dragging");
      list.classList.add("is-sorting");
    }
    const row = drag.row;
    const gap = parseFloat(getComputedStyle(list).rowGap) || 10;
    // An einem Nachbarn vorbei: im DOM tauschen und den Versatz um dessen Höhe ausgleichen
    const next = row.nextElementSibling, prev = row.previousElementSibling;
    if (next && dy > next.offsetHeight / 2) {
      next.after(row); drag.startY += next.offsetHeight + gap; dy = e.clientY - drag.startY;
    } else if (prev && dy < -prev.offsetHeight / 2) {
      prev.before(row); drag.startY -= prev.offsetHeight + gap; dy = e.clientY - drag.startY;
    }
    row.style.transform = `translateY(${dy}px)`;
  });
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const { row, moved } = drag;
    drag = null;
    row.classList.remove("is-dragging"); list.classList.remove("is-sorting");
    row.style.transform = "";
    if (!moved) return;
    const order = [...list.children].map((li) => Number(li.dataset.i));
    if (order.some((v, i) => v !== i)) {
      rows = order.map((i) => rows[i]);
      dirty = true;
    }
    render();
  };
  list.addEventListener("pointerup", endDrag);
  list.addEventListener("pointercancel", endDrag);

  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"), row = e.target.closest("[data-i]");
    if (!b || !row) return;
    const i = Number(row.dataset.i), a = b.dataset.act;
    if (a === "up" && i > 0) [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
    else if (a === "down" && i < rows.length - 1) [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
    else if (a === "toggle") rows[i].active = !rows[i].active;
    else if (a === "del") rows.splice(i, 1);
    else return;
    dirty = true; render();
    const keep = list.querySelector(`[data-i="${Math.min(a === "up" ? i - 1 : a === "down" ? i + 1 : i, rows.length - 1)}"] [data-act="${a === "del" ? "up" : a}"]`);
    if (keep && !keep.disabled) keep.focus();
  });
  addBtn.addEventListener("click", () => {
    if (rows.length >= limit()) return;
    rows.push({ title: "", url: "", icon: "link", active: true, clicks: null });
    dirty = true; render();
    list.querySelector(`[data-i="${rows.length - 1}"] [data-f="title"]`)?.focus();
  });
  saveBtn.addEventListener("click", async () => {
    if (busy) return;
    const clean = rows.map((r) => ({ id: r.id, title: String(r.title).trim(), url: normalize(r.url), icon: r.icon, active: r.active !== false }));
    const bad = clean.findIndex((r) => !r.title || !validEntry(r.url));
    if (bad >= 0) { say(t("Eintrag {n}: bitte Titel und eine Adresse oder einen Text angeben.").replace("{n}", bad + 1), "error"); list.querySelector(`[data-i="${bad}"] [data-f="${clean[bad].title ? "url" : "title"}"]`)?.focus(); return; }
    busy = true; saveBtn.disabled = true; say(t("Links werden gespeichert …"));
    try {
      const { data, error } = await sb.rpc("save_my_links", { p_links: clean });
      if (error) throw error;
      rows = Array.isArray(data) ? data : rows; dirty = false;
      say(t("Links gespeichert."), "ok");
    } catch (err) {
      say(err && err.code === "54000" ? t("Du hast die Höchstzahl an Links für deinen Tarif erreicht.") : t("Die Links konnten nicht gespeichert werden. Bitte versuche es erneut."), "error");
    } finally { busy = false; saveBtn.disabled = false; render(); }
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // Starten, sobald eine Sitzung da ist; der Wunsch-Link kommt aus der eigenen Karte
  const loading = $("[data-le-loading]"), view = $("[data-le-view]"), leUrl = $("[data-le-url]");
  const showUi = (on) => { addBtn.hidden = !on; saveBtn.hidden = !on; if (loading) loading.hidden = true; };
  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { if (loading) loading.textContent = t("Melde dich an, um deine Links zu bearbeiten."); return; }
    try {
      const [{ data: links, error }, { data: prof }, card] = await Promise.all([
        sb.rpc("get_my_links"),
        sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle(),
        sb.rpc("get_my_card").then((r) => r.data).catch(() => null),
      ]);
      if (error) throw error;
      rows = Array.isArray(links) ? links : [];
      admin = !!(prof && prof.is_admin);
      paid = !!(prof && (prof.is_premium || prof.is_admin));
      const planName = String((prof && prof.plan) || "");
      tier = TIERS.find((x) => x.plans.includes(planName)) || (paid ? TIERS[1] : TIERS[0]);
      // Wer schon mehr Links hat, als sein Tarif erlaubt, behält sie und kann sie bearbeiten
      grandfathered = rows.length;
      const handle = card && card.handle;
      if (handle && leUrl) leUrl.textContent = `xyntal.de/${handle}`;
      if (handle && view) { view.href = `/${handle}`; view.hidden = false; }
      box.hidden = false; showUi(true); render();
    } catch {
      if (loading) loading.textContent = t("Deine Links lassen sich gerade nicht laden. Bitte versuch es später noch einmal.");
    }
  }
  start();
})();
