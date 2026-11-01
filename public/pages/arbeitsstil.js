// /arbeitsstil – der Arbeitsstil-Test der Xyntal-App auf der Website: 28 Blöcke mit je vier
// Aussagen, pro Block „am meisten“ und „am wenigsten wie ich“. Ausgewertet und gespeichert
// wird auf dem App-Server (POST /profile/assessment); das Ergebnis gilt auch in der App.
(() => {
  const X = window.XyntalApp;
  const box = document.getElementById("test");
  const { esc, t } = X;
  const KEY = "xyntal-arbeitsstil";
  let blocks = [], answers = [], index = 0, status = null, userId = "", sending = false;

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(document.documentElement.lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "long", year: "numeric" });
  const typeName = (k) => t(X.WORK_TYPES[k] || k);
  // Zwischenstand im Tab merken, damit ein Neuladen nichts kostet
  const saveDraft = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ userId, index, answers })); } catch { /* egal */ } };
  const loadDraft = () => {
    try {
      const d = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (d && d.userId === userId && Array.isArray(d.answers) && d.answers.length === blocks.length) { answers = d.answers; index = Math.min(d.index || 0, blocks.length - 1); }
    } catch { /* neu anfangen */ }
  };
  const clearDraft = () => { try { sessionStorage.removeItem(KEY); } catch { /* egal */ } };

  async function load() {
    const me = await currentMember();
    if (!me) { location.replace("login?next=arbeitsstil"); return; }
    try {
      const s = await X.session();
      userId = s.userId;
      const data = await X.api("GET", "/profile/assessment");
      blocks = data.questionnaire || [];
      status = data.status;
      if (answers.length !== blocks.length) answers = blocks.map(() => ({ most: -1, least: -1 }));
      loadDraft();
      if (status && !canRetake()) return showResult(false);
      if (status && !answers.some((a) => a.most >= 0 || a.least >= 0)) return showResult(true);
      renderBlock();
    } catch (err) {
      box.innerHTML = `<p class="xm-status error">${esc(err.message || t("Das hat nicht geklappt. Versuch es gleich noch einmal."))}</p>
        <div class="xm-row"><button class="btn btn-small btn-ghost" type="button" data-retry>${esc(t("Neu laden"))}</button><a class="btn btn-small btn-ghost" href="profil#matching">${esc(t("Zurück zum Profil"))}</a></div>`;
      box.querySelector("[data-retry]").addEventListener("click", load);
    }
  }
  const canRetake = () => !status || Date.parse(status.nextAvailableAt) <= Date.now();

  function renderBlock(focusName) {
    const block = blocks[index];
    const a = answers[index];
    const last = index === blocks.length - 1;
    const done = a.most >= 0 && a.least >= 0;
    box.innerHTML = `
      <div class="xm-progress">
        <div class="xm-progress-head"><span>${esc(t("Block"))} <span data-no-i18n>${index + 1}</span> ${esc(t("von"))} <span data-no-i18n>${blocks.length}</span></span><span data-no-i18n>${Math.round((index / blocks.length) * 100)} %</span></div>
        <span class="xm-bar"><i style="width:${Math.max(2, (index / blocks.length) * 100)}%"></i></span>
      </div>
      <fieldset class="xm-block">
        <legend>${esc(t("Was ist am meisten wie du – und was am wenigsten?"))}</legend>
        <div class="xm-block-head" aria-hidden="true"><span></span><span>${esc(t("Am meisten"))}</span><span>${esc(t("Am wenigsten"))}</span></div>
        ${block.statements.map((text, i) => `
          <div class="xm-stmt ${a.most === i ? "xm-most" : a.least === i ? "xm-least" : ""}">
            <p id="stmt-${i}" data-no-i18n>${esc(text)}</p>
            <label class="xm-pick xm-pick-most"><input type="radio" name="most" value="${i}" ${a.most === i ? "checked" : ""} aria-labelledby="stmt-${i} most-${i}"><span aria-hidden="true">✓</span><b class="sr-only" id="most-${i}">${esc(t("am meisten wie ich"))}</b></label>
            <label class="xm-pick xm-pick-least"><input type="radio" name="least" value="${i}" ${a.least === i ? "checked" : ""} aria-labelledby="stmt-${i} least-${i}"><span aria-hidden="true">✕</span><b class="sr-only" id="least-${i}">${esc(t("am wenigsten wie ich"))}</b></label>
          </div>`).join("")}
      </fieldset>
      <p class="xm-status" data-status role="status">${done ? "" : esc(t("Wähle eine Aussage für „am meisten“ und eine andere für „am wenigsten“."))}</p>
      <div class="xm-row">
        <button class="btn btn-small btn-ghost" type="button" data-back ${index === 0 ? "disabled" : ""}>${esc(t("Zurück"))}</button>
        <button class="btn btn-small" type="button" data-next ${done && !sending ? "" : "disabled"}>${esc(t(sending ? "Wird gespeichert …" : last ? "Fertig" : "Weiter"))}</button>
      </div>`;
    if (focusName) box.querySelector(`input[name="${focusName}"][value="${focusName === "most" ? a.most : a.least}"]`)?.focus();
  }

  box.addEventListener("change", (e) => {
    const input = e.target.closest("input[type=radio]");
    if (!input) return;
    const a = answers[index];
    const i = Number(input.value);
    // Dieselbe Aussage kann nicht beides sein: die andere Spalte gibt sie frei
    if (input.name === "most") { a.most = i; if (a.least === i) a.least = -1; }
    else { a.least = i; if (a.most === i) a.most = -1; }
    saveDraft();
    renderBlock(input.name);
  });
  box.addEventListener("click", (e) => {
    if (e.target.closest("[data-back]") && index > 0) { index--; saveDraft(); renderBlock(); box.scrollIntoView({ block: "start" }); }
    else if (e.target.closest("[data-next]")) {
      if (index < blocks.length - 1) { index++; saveDraft(); renderBlock(); box.querySelector("input")?.focus({ preventScroll: true }); box.scrollIntoView({ block: "start" }); }
      else submit();
    } else if (e.target.closest("[data-start]")) { answers = blocks.map(() => ({ most: -1, least: -1 })); index = 0; renderBlock(); }
  });

  async function submit() {
    const open = answers.findIndex((a) => a.most < 0 || a.least < 0);
    if (open >= 0) { index = open; renderBlock(); return; }
    sending = true;
    renderBlock();
    try {
      const res = await X.api("POST", "/profile/assessment", { answers });
      status = res.status;
      clearDraft();
      showResult(false, true);
      box.scrollIntoView({ block: "start" });
    } catch (err) {
      sending = false;
      renderBlock();
      const el = box.querySelector("[data-status]");
      el.className = "xm-status error";
      el.textContent = err.message || t("Das hat nicht geklappt. Versuch es gleich noch einmal.");
    } finally { sending = false; }
  }

  function showResult(retake, fresh = false) {
    const st = status;
    box.innerHTML = `
      ${fresh ? `<p class="xm-status ok">${esc(t("Gespeichert. Dein Arbeitsstil fließt ab sofort in deine Passung ein – auf der Website und in der App."))}</p>` : ""}
      <h2>${esc(t("Dein Arbeitsstil:"))} ${esc(typeName(st.primaryType))} · ${esc(typeName(st.secondaryType))}</h2>
      <div class="xm-style-bars">${X.WORK_DIMS.map(([k, label]) => `
        <div class="xm-style-bar"><span>${esc(t(label))}</span><span class="xm-bar"><i style="width:${Math.max(3, st.scores[k])}%"></i></span><b data-no-i18n>${esc(st.scores[k])}</b></div>`).join("")}</div>
      <p class="hint">${esc(t("Gemacht am"))} <span data-no-i18n>${esc(fmtDate(st.completedAt))}</span>. ${retake ? "" : `${esc(t("Wiederholen möglich ab"))} <span data-no-i18n>${esc(fmtDate(st.nextAvailableAt))}</span>.`}</p>
      <div class="xm-row">
        <a class="btn btn-small" href="fuer-dich">${esc(t("Meine Vorschläge ansehen"))}</a>
        <a class="btn btn-small btn-ghost" href="profil#matching">${esc(t("Zurück zum Profil"))}</a>
        ${retake ? `<button class="btn btn-small btn-ghost" type="button" data-start>${esc(t("Test wiederholen"))}</button>` : ""}
      </div>`;
  }

  // Sprache gewechselt: Aussagen in der neuen Sprache holen, Antworten bleiben
  document.addEventListener("xyntal:lang", async () => {
    if (!blocks.length) return;
    try { blocks = (await X.api("GET", "/profile/assessment")).questionnaire || blocks; } catch { /* alte Texte behalten */ }
    if (box.querySelector(".xm-block")) renderBlock();
    else if (status) showResult(canRetake());
  });

  setTimeout(load, 300);  // wie im Profil: frisch bestätigte Sitzungen brauchen einen Moment
})();
