// Profil · Matching: dieselben Angaben wie im Profil-Editor der Desktop-App (Ziele, Interessen,
// Sprachen, Zeitzone, Tech-Stack, Verfügbarkeit, Arbeitsstil). Gespeichert wird nur auf dem
// App-Server (PATCH /profile) – die App zeigt sofort dasselbe.
(() => {
  const X = window.XyntalApp;
  const form = document.getElementById("matching");
  if (!X || !form) return;
  const { esc, t } = X;
  const loadEl = form.querySelector("[data-matching-load]");
  const fields = form.querySelector("[data-matching-fields]");
  const status = form.querySelector("[data-matching-status]");
  const tz = form.elements.timezone;
  const tzDetect = form.querySelector("[data-tz-detect]");
  const state = { tags: {}, choice: {}, assessment: null };
  let loading = null;

  const say = (el, text, kind = "") => { el.textContent = text; el.className = `${el.className.split(" ")[0]}${kind ? " " + kind : ""}`; };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString(document.documentElement.lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "long", year: "numeric" });

  // ---------- Geburtsdatum fürs erste App-Konto (der Server prüft: ab 16) ----------
  const birth = form.querySelector("[data-matching-birth]");
  const birthInput = birth.querySelector("[data-birthdate-input]");
  const birthButton = birth.querySelector("[data-birthdate-save]");
  const birthStatus = birth.querySelector("[data-birthdate-status]");
  const birthLimit = () => { const d = new Date(); return [d.getFullYear() - 16, String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-"); };
  function sendBirthdate() {
    const v = birthInput.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > birthLimit()) {
      say(birthStatus, v ? t("Xyntal ist ab 16 Jahren. Sobald du 16 wirst, bist du herzlich willkommen.") : t("Bitte gib dein Geburtsdatum an."), "error");
      birthInput.focus();
      return;
    }
    birth.dataset.sent = "1";
    birthButton.disabled = true;
    say(birthStatus, t("Wird gespeichert …"));
    // Auch auf der Website nachtragen, falls es dort noch fehlt
    if (typeof sb !== "undefined" && sb) sb.rpc("set_my_birthdate", { p_birthdate: v }).then(() => {}, () => {});
    if (!loading) loading = load(v).catch((e) => { loading = null; loadFailed(e); });
  }
  birthButton.addEventListener("click", sendBirthdate);
  birthInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); sendBirthdate(); } });

  window.openMatchingTab = () => {
    if (!loading) loading = load().catch((err) => { loading = null; loadFailed(err); });
  };

  async function load(birthdate = "") {
    if (!birthdate) {
      loadEl.hidden = false;
      say(loadEl, t("Wird geladen …"));
    }
    const s = await X.session({ birthdate });
    const [{ profile }, assessment] = await Promise.all([X.api("GET", `/users/${encodeURIComponent(s.userId)}`), X.api("GET", "/profile/assessment")]);
    fill(profile);
    state.assessment = assessment;
    renderWorkStyle();
    loadEl.hidden = true;
    birth.hidden = true;
    fields.hidden = false;
  }

  function loadFailed(err) {
    loadEl.hidden = false;
    birth.hidden = true;
    if (err && err.code === "SIGNED_OUT") {
      loadEl.innerHTML = `${esc(err.message)} <a class="text-link" href="login?next=profil">${esc(t("Zum Login"))}</a>`;
      return;
    }
    // Erstes App-Konto: Der Server prüft das Mindestalter (16). Das Datum wird hier im Profil eingetragen.
    if (err && (err.code === "BIRTHDATE_REQUIRED" || err.code === "UNDERAGE" || (birth.dataset.sent && err.code === "VALIDATION_FAILED"))) {
      loadEl.hidden = true;
      birth.hidden = false;
      birthInput.max = birthLimit();
      birthButton.disabled = false;
      if (err.code === "BIRTHDATE_REQUIRED") say(birthStatus, "");
      else say(birthStatus, err.message, "error");
      return;
    }
    // Login-Limit des Servers: Sekunden herunterzählen und dann von selbst neu laden
    if (err && err.retryAt) {
      const tick = () => {
        const s = Math.ceil((err.retryAt - Date.now()) / 1000);
        if (s <= 0) { clearInterval(timer); window.openMatchingTab(); return; }
        say(loadEl, t("Gerade gab es zu viele Anmeldeversuche von deinem Internetanschluss. Matching lädt in {s} Sekunden von selbst neu.").replace("{s}", s));
      };
      const timer = setInterval(tick, 1000);
      tick();
      return;
    }
    loadEl.innerHTML = `${esc((err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal."))} <button class="btn btn-small btn-ghost" type="button" data-retry>${esc(t("Neu laden"))}</button>`;
    loadEl.querySelector("[data-retry]").addEventListener("click", () => window.openMatchingTab());
  }

  // ---------- Felder füllen ----------
  function fill(p) {
    for (const kind of Object.keys(X.TAGS)) state.tags[kind] = Array.isArray(p[kind]) ? p[kind].slice() : [];
    state.choice = {
      collaborationIntent: p.collaborationIntent || "",
      availability: p.availability || "",
      weeklyHours: Number(p.weeklyHours) || 0,
      visibility: p.visibility || "public",
    };
    tz.value = p.timezone || "";
    renderAllTags();
    renderChoices();
    syncDetect();
  }

  // ---------- Tag-Felder (Chips + eigene Einträge) ----------
  function renderTags(kind) {
    const host = form.querySelector(`[data-tags="${kind}"]`);
    const def = X.TAGS[kind];
    const chosen = state.tags[kind];
    const id = `xm-tags-${kind}`;
    const open = Object.keys(def.options).filter((v) => !chosen.some((c) => c.toLowerCase() === v.toLowerCase()));
    const full = chosen.length >= def.max;
    const keepFocus = document.activeElement && host.contains(document.activeElement) && document.activeElement.matches("input");
    const draft = host.querySelector("input")?.value || "";
    host.innerHTML = `
      <span class="xm-label" id="${id}">${esc(t(def.label))} <span class="hint">${chosen.length}/${def.max}</span></span>
      <div class="xm-tags">
        <div class="xm-chips xm-chosen" data-empty="${esc(t("Noch nichts ausgewählt"))}">${chosen.map((v, i) =>
          `<button type="button" class="xm-chip" aria-pressed="true" data-remove="${i}" aria-label="${esc(X.tagLabel(kind, v))} – ${esc(t("entfernen"))}"><span data-no-i18n>${esc(X.tagLabel(kind, v))}</span><span class="xm-x" aria-hidden="true">×</span></button>`).join("")}</div>
        ${full ? `<p class="hint">${esc(t("Maximum erreicht – entferne erst einen Eintrag."))}</p>` : `
        <div class="xm-add"><input type="text" maxlength="40" placeholder="${esc(t(def.add))}" aria-labelledby="${id}" data-add-input><button class="btn btn-small btn-ghost" type="button" data-add>${esc(t("Hinzufügen"))}</button></div>
        ${open.length ? `<div class="xm-chips xm-suggest" aria-label="${esc(t("Vorschläge"))}">${open.map((v) =>
          `<button type="button" class="xm-chip" aria-pressed="false" data-pick="${esc(v)}"><span aria-hidden="true">+</span><span data-no-i18n>${esc(X.tagLabel(kind, v))}</span></button>`).join("")}</div>` : ""}`}
      </div>`;
    const input = host.querySelector("[data-add-input]");
    if (input) {
      input.value = draft;
      if (keepFocus) input.focus();
    }
  }
  function renderAllTags() { for (const kind of Object.keys(X.TAGS)) renderTags(kind); }
  function addTag(kind, raw) {
    const def = X.TAGS[kind];
    for (const part of String(raw).split(",")) {
      const v = X.canonicalTag(kind, part);
      const list = state.tags[kind];
      if (!v || list.length >= def.max || list.some((c) => c.toLowerCase() === v.toLowerCase())) continue;
      list.push(v);
    }
  }
  form.addEventListener("click", (e) => {
    const host = e.target.closest("[data-tags]");
    if (!host) return;
    const kind = host.dataset.tags;
    const rm = e.target.closest("[data-remove]");
    const pick = e.target.closest("[data-pick]");
    if (rm) {
      state.tags[kind].splice(Number(rm.dataset.remove), 1);
      renderTags(kind);
      (host.querySelector("[data-remove]") || host.querySelector("[data-add-input]"))?.focus();
    } else if (pick) {
      addTag(kind, pick.dataset.pick);
      renderTags(kind);
      host.querySelector("[data-pick]")?.focus();
    } else if (e.target.closest("[data-add]")) {
      const input = host.querySelector("[data-add-input]");
      addTag(kind, input.value);
      input.value = "";
      renderTags(kind);
      host.querySelector("[data-add-input]")?.focus();
    }
  });
  form.addEventListener("keydown", (e) => {
    const input = e.target.closest("[data-add-input]");
    if (!input || (e.key !== "Enter" && e.key !== ",")) return;
    e.preventDefault();
    const host = input.closest("[data-tags]");
    addTag(host.dataset.tags, input.value);
    input.value = "";
    renderTags(host.dataset.tags);
    host.querySelector("[data-add-input]")?.focus();
  });

  // ---------- Auswahl (eine Option) ----------
  const CHOICES = {
    collaborationIntent: X.INTENT.map(([v, l]) => [v, l, ""]),
    availability: X.AVAILABILITY.map(([v, l]) => [v, l, ""]),
    weeklyHours: X.HOURS.map(([v, l]) => [v, l, ""]),
    visibility: X.VISIBILITY,
  };
  function renderChoices() {
    for (const [key, options] of Object.entries(CHOICES)) {
      const host = form.querySelector(`[data-choice="${key}"]`);
      host.innerHTML = options.map(([v, label, hint]) =>
        `<button type="button" class="xm-chip" role="radio" aria-checked="${state.choice[key] === v}" tabindex="${state.choice[key] === v ? 0 : -1}" data-value="${esc(v)}"><span data-no-i18n>${esc(X.label(label))}</span>${hint ? `<small>${esc(t(hint))}</small>` : ""}</button>`).join("");
    }
  }
  function choose(host, button, focus) {
    const key = host.dataset.choice;
    const raw = button.dataset.value;
    state.choice[key] = key === "weeklyHours" ? Number(raw) : raw;
    renderChoices();
    if (focus) form.querySelector(`[data-choice="${key}"] [aria-checked="true"]`)?.focus();
  }
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-choice] [data-value]");
    if (b) choose(b.closest("[data-choice]"), b, true);
  });
  form.addEventListener("keydown", (e) => {
    const b = e.target.closest("[data-choice] [data-value]");
    if (!b || !["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const all = [...b.parentElement.children];
    const next = all[(all.indexOf(b) + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length];
    choose(b.closest("[data-choice]"), next, true);
  });

  // ---------- Zeitzone ----------
  const detected = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
  try {
    const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
    form.querySelector("#xm-timezones").innerHTML = zones.map((z) => `<option value="${esc(z)}">`).join("");
  } catch { /* ohne Liste: freie Eingabe */ }
  function syncDetect() {
    tzDetect.hidden = !detected || tz.value.trim() === detected;
    tzDetect.querySelector("span").textContent = detected;
  }
  tz.addEventListener("input", syncDetect);
  tzDetect.addEventListener("click", () => { tz.value = detected; syncDetect(); tz.focus(); });

  // ---------- Arbeitsstil ----------
  function renderWorkStyle() {
    const box = form.querySelector("[data-workstyle]");
    const st = state.assessment && state.assessment.status;
    if (!st) {
      box.innerHTML = `
        <h3>${esc(t("Arbeitsstil-Test"))}</h3>
        <p>${esc(t("28 kurze Fragen, etwa 8 Minuten: Wähle in jedem Block, was am meisten und was am wenigsten nach dir klingt. Das Ergebnis fließt in deine Passung ein und ist dasselbe wie in der App."))}</p>
        <div class="xm-row"><a class="btn btn-small" href="arbeitsstil">${esc(t("Test starten"))}</a></div>`;
      return;
    }
    const again = Date.parse(st.nextAvailableAt) <= Date.now();
    const typeName = (k) => t(X.WORK_TYPES[k] || k);
    box.innerHTML = `
      <h3>${esc(t("Dein Arbeitsstil:"))} <span>${esc(typeName(st.primaryType))}</span> · <span>${esc(typeName(st.secondaryType))}</span></h3>
      <div class="xm-style-bars">${X.WORK_DIMS.map(([k, label]) => `
        <div class="xm-style-bar"><span>${esc(t(label))}</span><span class="xm-bar"><i style="width:${Math.max(3, st.scores[k])}%"></i></span><b data-no-i18n>${esc(st.scores[k])}</b></div>`).join("")}</div>
      <p><span>${esc(t("Gemacht am"))}</span> <span data-no-i18n>${esc(fmtDate(st.completedAt))}</span> · ${again
        ? `<a class="text-link" href="arbeitsstil">${esc(t("Test wiederholen"))}</a>`
        : `<span>${esc(t("Wiederholen möglich ab"))}</span> <span data-no-i18n>${esc(fmtDate(st.nextAvailableAt))}</span>`}</p>`;
  }

  // ---------- Speichern ----------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (fields.hidden) return;
    // Noch nicht übernommene Eingaben in den Tag-Feldern mitnehmen
    for (const input of form.querySelectorAll("[data-add-input]")) if (input.value.trim()) addTag(input.closest("[data-tags]").dataset.tags, input.value);
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    say(status, t("Wird gespeichert …"));
    try {
      const { profile } = await X.api("PATCH", "/profile", { ...state.tags, ...state.choice, timezone: tz.value.trim() });
      fill(profile);
      say(status, t("Gespeichert. Gilt ab sofort auch in der Xyntal-App."), "ok");
    } catch (err) {
      say(status, (err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal."), "error");
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener("xyntal:lang", () => {
    if (fields.hidden) return;
    renderAllTags();
    renderChoices();
    renderWorkStyle();
  });
})();
