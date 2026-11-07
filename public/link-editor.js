// Link-Editor in /meine-karte: eigene Links anlegen, ordnen, ausblenden, speichern (RPC get_my_links / save_my_links)
(() => {
  const box = document.querySelector("[data-le]");
  const I = window.XyntalLinkIcons;
  if (!box || !I || typeof sb === "undefined" || !sb) return;
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const $ = (sel) => box.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const list = $("[data-le-list]"), empty = $("[data-le-empty]"), count = $("[data-le-count]"), out = $("[data-le-status]");
  const addBtn = $("[data-le-add]"), saveBtn = $("[data-le-save]");
  const LIMIT = 15, LIMIT_PAID = 100;
  let rows = [], paid = false, busy = false, dirty = false;
  const limit = () => (paid ? LIMIT_PAID : LIMIT);
  const say = (text, kind = "") => { out.textContent = text; out.className = "mk-status" + (kind ? ` is-${kind}` : ""); };
  const validUrl = (u) => /^https?:\/\/[^\s]{3,}$/i.test(u) && u.length <= 500;
  // Eingabe ohne Schema („github.com/x“) wird zu https://
  const normalize = (u) => { const v = String(u || "").trim(); return v && !/^[a-z][a-z0-9+.-]*:/i.test(v) && /^[^\s/]+\.[^\s/]+/.test(v) ? `https://${v}` : v; };

  // Kleine Symbole für die Werkzeuge einer Zeile
  const TOOL = {
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    on: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>',
    off: '<path d="M2.5 12s3.5-6 9.5-6c1.6 0 3 .4 4.3 1M21.5 12s-3.5 6-9.5 6c-1.6 0-3-.4-4.3-1M4 4l16 16"/>',
    del: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
    chev: '<path d="m7 10 5 5 5-5"/>',
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
          <input type="url" class="le-url" data-f="url" maxlength="500" inputmode="url" value="${esc(r.url)}" placeholder="https://…" aria-label="${esc(t("Adresse"))}">
        </div>
        <div class="le-tools">
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
    count.innerHTML = `<span class="le-meter" aria-hidden="true"><i style="width:${Math.min(100, (rows.length / limit()) * 100)}%"></i></span><span>${rows.length} / ${limit()} ${esc(t("Links"))}${paid ? "" : ` · ${esc(t("Klickstatistik und bis zu 100 Links mit Plus"))}`}</span>`;
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
    if (r.icon === "link" || r.iconAuto) { r.icon = I.guess(r.url); r.iconAuto = true; render(); }
  });
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
    const bad = clean.findIndex((r) => !r.title || !validUrl(r.url));
    if (bad >= 0) { say(t(`Link ${bad + 1}: bitte Titel und eine Adresse mit https:// angeben.`), "error"); list.querySelector(`[data-i="${bad}"] [data-f="${clean[bad].title ? "url" : "title"}"]`)?.focus(); return; }
    busy = true; saveBtn.disabled = true; say(t("Links werden gespeichert …"));
    try {
      const { data, error } = await sb.rpc("save_my_links", { p_links: clean });
      if (error) throw error;
      rows = Array.isArray(data) ? data : rows; dirty = false;
      say(t("Links gespeichert."), "ok");
    } catch (err) {
      say(err && err.code === "54000" ? t("Du hast die Höchstzahl an Links erreicht.") : t("Die Links konnten nicht gespeichert werden. Bitte versuche es erneut."), "error");
    } finally { busy = false; saveBtn.disabled = false; render(); }
  });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // Starten, sobald das Konto geladen ist (meine-karte.js blendet die App erst dann ein)
  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    try {
      const [{ data: links, error }, { data: prof }] = await Promise.all([sb.rpc("get_my_links"), sb.from("profiles").select("is_premium,is_admin").eq("id", session.user.id).maybeSingle()]);
      if (error) throw error;
      rows = Array.isArray(links) ? links : [];
      paid = !!(prof && (prof.is_premium || prof.is_admin));
      box.hidden = false; render();
    } catch { /* Ältere Datenbank ohne Migration: Editor bleibt verborgen */ }
  }
  const app = document.querySelector("[data-mk-app]");
  const urlLabel = document.querySelector("[data-mk-url]"), leUrl = $("[data-le-url]");
  new MutationObserver(() => { if (urlLabel && leUrl) leUrl.textContent = urlLabel.textContent; }).observe(urlLabel || box, { childList: true, characterData: true, subtree: true });
  if (app && !app.hidden) start(); else new MutationObserver((_, o) => { if (!app.hidden) { o.disconnect(); start(); } }).observe(app, { attributes: true, attributeFilter: ["hidden"] });
})();
