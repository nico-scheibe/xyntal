// /fuer-dich – Vorschläge aus dem Matching des App-Servers (dieselben wie unter „Entdecken“ in
// der App): Passung, Erklärung, Speichern, „Passt nicht“ und „Nachricht schreiben“.
// Sichtbarkeit, Blockierungen und ausgeblendete Personen regelt allein der Server.
(() => {
  const X = window.XyntalApp;
  const { esc, t } = X;
  const list = document.getElementById("list");
  const detail = document.getElementById("detail");
  const notice = document.getElementById("notice");
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  let view = "people", people = [], me = null, canMessage = false, openId = "";

  const initials = (name) => (String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  const avatarHtml = (p) => `<span class="xm-avatar" aria-hidden="true">${/^data:image\/(jpeg|png);base64,/.test(p.avatar || "") ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.displayName))}</span>`;
  const handleOf = (p) => (p.websiteCard && HANDLE.test(p.websiteCard.handle || "") ? p.websiteCard.handle : "");
  const fail = (err) => esc((err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal."));

  function actions(p, { saved, inDetail }) {
    const handle = handleOf(p);
    return `
      ${inDetail ? "" : `<button class="btn btn-small" type="button" data-open="${esc(p.id)}">${esc(t("Warum passt es?"))}</button>`}
      <button class="btn btn-small btn-ghost" type="button" data-save="${esc(p.id)}" aria-pressed="${saved}">${esc(t(saved ? "Gespeichert ✓" : "Speichern"))}</button>
      ${view === "people" || inDetail ? `<button class="btn btn-small btn-ghost" type="button" data-dismiss="${esc(p.id)}">${esc(t("Passt nicht"))}</button>` : ""}
      ${canMessage && UUID.test(p.websiteId || "") ? `<a class="btn btn-small btn-ghost" href="nachrichten?an=${encodeURIComponent(p.websiteId)}">${esc(t("Nachricht schreiben"))}</a>` : ""}
      ${handle ? `<a class="btn btn-small btn-ghost" href="/${esc(handle)}">${esc(t("Profil ansehen"))}</a>` : ""}`;
  }

  function card(p) {
    const saved = view === "saved" || p.saved === true;
    const reason = view === "people" ? p.reason : "";
    return `
      <article class="xm-person" data-person="${esc(p.id)}">
        <div class="xm-person-head">
          ${X.scoreRing(p.overall)}
          <div>
            <h3 data-no-i18n>${esc(p.displayName)}</h3>
            ${p.headline ? `<p class="xm-headline" data-no-i18n>${esc(p.headline)}</p>` : ""}
          </div>
        </div>
        <div class="xm-meta">
          ${p.lowData ? `<span class="xm-pill">${esc(t("Wenige Angaben"))}</span>` : ""}
          ${p.hasDna ? `<span class="xm-pill">${esc(t("Arbeitsstil-Test gemacht"))}</span>` : ""}
          ${(p.topFactors || []).slice(0, 2).map((f) => `<span class="xm-pill xm-on" data-no-i18n>${esc(f.label)}</span>`).join("")}
        </div>
        ${reason ? `<p class="xm-reason" data-no-i18n>${esc(reason)}</p>` : ""}
        <div class="xm-actions">${actions(p, { saved, inDetail: false })}</div>
      </article>`;
  }

  function empty() {
    return view === "saved"
      ? `<div class="xm-empty" style="grid-column:1/-1"><p>${esc(t("Noch niemand gespeichert. Mit „Speichern“ merkst du dir Leute für später."))}</p></div>`
      : `<div class="xm-empty" style="grid-column:1/-1"><p>${esc(t("Gerade keine Vorschläge. Je mehr du im Profil unter „Matching“ angibst, desto mehr passende Leute findet Xyntal für dich."))}</p><a class="btn btn-small" href="profil#matching">${esc(t("Matching-Angaben ergänzen"))}</a></div>`;
  }

  async function loadList() {
    list.innerHTML = `<p class="xm-status" role="status">${esc(t("Wird geladen …"))}</p>`;
    try {
      const data = view === "saved"
        ? await X.api("GET", "/matches/interactions?action=saved")
        : await X.api("GET", "/matches/people?limit=30");
      people = data.people || [];
      list.innerHTML = people.length ? people.map(card).join("") : empty();
    } catch (err) {
      list.innerHTML = `<p class="xm-status error">${fail(err)}</p>`;
      if (err && err.code === "SIGNED_OUT") location.replace("login?next=fuer-dich");
    }
  }

  // Hinweis, wenn die eigenen Angaben noch dünn sind
  async function loadNotice(userId) {
    try {
      const { profile } = await X.api("GET", `/users/${encodeURIComponent(userId)}`);
      const missing = [];
      if (!(profile.goals || []).length) missing.push("Ziele");
      if (!(profile.interests || []).length) missing.push("Interessen");
      if (!(profile.skills || []).length && !(profile.techStack || []).length) missing.push("Skills");
      if (!(profile.languages || []).length) missing.push("Sprachen");
      const parts = [];
      if (missing.length) parts.push(`${esc(t("Für genauere Vorschläge fehlen noch:"))} ${missing.map((m) => esc(t(m))).join(", ")}. <a class="text-link" href="profil#matching">${esc(t("Jetzt ergänzen"))}</a>`);
      if (!profile.workStyle) parts.push(`${esc(t("Mit dem Arbeitsstil-Test passt Xyntal auch eure Arbeitsweise zusammen."))} <a class="text-link" href="arbeitsstil">${esc(t("Test starten"))}</a>`);
      notice.innerHTML = parts.length ? `<div class="notice">${parts.join("<br>")}</div>` : "";
    } catch { notice.innerHTML = ""; }
  }

  async function openDetail(id, { push = true } = {}) {
    openId = id;
    detail.hidden = false;
    detail.innerHTML = `<div class="xm-detail"><p class="xm-status" role="status">${esc(t("Passung wird berechnet …"))}</p></div>`;
    if (push) history.replaceState(null, "", `fuer-dich?person=${encodeURIComponent(id)}`);
    detail.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    try {
      const { match } = await X.api("GET", `/matches/people/${encodeURIComponent(id)}`);
      if (openId !== id) return;
      const p = { ...match.target, overall: match.overall };
      detail.innerHTML = `
        <article class="xm-detail" data-person="${esc(p.id)}" aria-labelledby="detail-name">
          <div class="xm-detail-head">
            ${X.scoreRing(match.overall, "xm-lg")}
            <div>
              <h2 id="detail-name" data-no-i18n>${esc(p.displayName)}</h2>
              ${p.headline ? `<p data-no-i18n>${esc(p.headline)}</p>` : ""}
            </div>
          </div>
          <div class="xm-explain">${X.explanationHtml(match)}</div>
          <div class="xm-row">${actions(p, { saved: match.saved, inDetail: true })}<button class="btn btn-small btn-ghost" type="button" data-close>${esc(t("Schließen"))}</button></div>
        </article>`;
      detail.querySelector("h2").focus?.();
    } catch (err) {
      detail.innerHTML = `<div class="xm-detail"><p class="xm-status error">${err && err.status === 404 ? esc(t("Dieses Profil ist nicht (mehr) sichtbar.")) : fail(err)}</p><div class="xm-row"><button class="btn btn-small btn-ghost" type="button" data-close>${esc(t("Schließen"))}</button></div></div>`;
    }
  }
  function closeDetail() {
    openId = "";
    detail.hidden = true;
    detail.innerHTML = "";
    history.replaceState(null, "", "fuer-dich");
  }

  document.addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-view]");
    if (tab) {
      view = tab.dataset.view;
      document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b === tab)));
      closeDetail();
      loadList();
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) return openDetail(open.dataset.open);
    if (e.target.closest("[data-close]")) return closeDetail();

    const save = e.target.closest("[data-save]");
    if (save) {
      const on = save.getAttribute("aria-pressed") !== "true";
      save.disabled = true;
      try {
        await X.record(save.dataset.save, on ? "saved" : "unsaved");
        document.querySelectorAll(`[data-save="${CSS.escape(save.dataset.save)}"]`).forEach((b) => {
          b.setAttribute("aria-pressed", String(on));
          b.textContent = t(on ? "Gespeichert ✓" : "Speichern");
        });
        if (!on && view === "saved") loadList();
      } catch (err) { alertIn(save, err); } finally { save.disabled = false; }
      return;
    }
    const dismiss = e.target.closest("[data-dismiss]");
    if (dismiss) {
      const choice = await X.askDismissReason();
      if (!choice) return;
      try {
        await X.record(dismiss.dataset.dismiss, "dismissed", { reason: choice.reason, note: choice.note || null });
        list.querySelector(`[data-person="${CSS.escape(dismiss.dataset.dismiss)}"]`)?.remove();
        if (openId === dismiss.dataset.dismiss) closeDetail();
        if (!list.querySelector("[data-person]")) list.innerHTML = empty();
      } catch (err) { alertIn(dismiss, err); }
    }
  });
  function alertIn(button, err) {
    const host = button.closest(".xm-actions, .xm-row");
    let el = host.querySelector(".xm-status");
    if (!el) { el = document.createElement("p"); el.className = "xm-status error"; el.setAttribute("role", "status"); host.append(el); }
    el.textContent = (err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal.");
  }

  async function start() {
    me = await currentMember();
    if (!me) { location.replace("login?next=fuer-dich"); return; }
    canMessage = me.status !== "rejected";
    let s;
    try { s = await X.session(); } catch (err) { list.innerHTML = `<p class="xm-status error">${fail(err)}</p>`; return; }
    loadNotice(s.userId);
    loadList();
    const person = new URLSearchParams(location.search).get("person");
    if (person && UUID.test(person)) openDetail(person, { push: false });
  }
  document.addEventListener("xyntal:lang", () => {
    if (!me) return;
    loadList();
    if (openId) openDetail(openId, { push: false });
  });
  setTimeout(start, 300);
})();
