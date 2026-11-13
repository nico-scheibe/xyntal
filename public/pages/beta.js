const form = document.getElementById("beta-form");
const status = document.getElementById("beta-status");
const done = document.getElementById("beta-done");
const confirmBox = document.getElementById("beta-confirm");
const why = form.elements.why;
const whyCount = document.getElementById("why-count");
const MIN_WHY = 80;
const DRAFT_KEY = "xyntal-beta-draft";
const APPLICATION_FIELDS = ["focus", "project", "why", "hours", "link"];
const STATE = {
  neu: "Stand: eingegangen, noch nicht geprüft.",
  in_pruefung: "Stand: in Prüfung.",
  eingeladen: "Stand: eingeladen – die nächsten Schritte kommen per E-Mail.",
  warteliste: "Stand: auf der Warteliste.",
  angenommen: "Stand: angenommen – willkommen in der Beta!",
  abgelehnt: "Stand: diesmal leider nicht dabei.",
};
let guest = true;
// Die Einwilligung steht bei den Anmelde-Buttons und noch einmal unten im Formular; einer der Haken reicht
const consentGiven = () => form.elements.consent.checked || (form.elements.consent_quick && form.elements.consent_quick.checked);

function updateCount() {
  const n = why.value.trim().length;
  whyCount.textContent = n < MIN_WHY ? `noch ${MIN_WHY - n} Zeichen bis zum Minimum` : `${n} / 1500 Zeichen`;
  whyCount.classList.toggle("is-ok", n >= MIN_WHY);
}
why.addEventListener("input", updateCount);

// Zwischenspeicher für die Bewerbung, solange die E-Mail-Bestätigung oder der Login läuft
const readDraft = () => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch { return null; } };
const saveDraft = (d) => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(APPLICATION_FIELDS.map((k) => [k, d[k] || ""])))); } catch { /* ohne Speicher geht es ohne Entwurf weiter */ } };
const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} };
const applicationFrom = (d) => ({ p_focus: d.focus, p_project: d.project, p_why: d.why, p_hours: d.hours, p_link: normalizeUrl(d.link) });

async function submitApplication(d) {
  const { error } = await sb.rpc("apply_for_beta", applicationFrom(d));
  if (!error) return { ok: true };
  if (/could not find the function|schema cache/i.test(error.message || "")) {
    throw new Error("Bewerbungen sind gleich möglich – die Datenbank wird gerade eingerichtet. Bitte versuch es später noch einmal.");
  }
  if (/schon beworben/i.test(error.message || "")) {
    const { data: mine } = await sb.rpc("get_my_beta_application");
    return { ok: true, mine: mine || { status: "neu" } };
  }
  throw new Error(friendlyError(error));
}

// Gäste legen im selben Formular ein Konto an; Mitglieder sehen nur die Bewerbung oder ihren Stand
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    form.querySelector("[data-beta-account]").hidden = false;
    form.querySelector("[data-beta-sub]").hidden = false;
    const draft = readDraft();
    if (draft) for (const k of APPLICATION_FIELDS) if (form.elements[k] && !form.elements[k].value) form.elements[k].value = draft[k] || "";
    updateCount();
    // Einwilligung und Rückmeldung direkt bei den Buttons, damit der Klick nicht still scheitert
    const quickConsent = form.querySelector("[data-beta-auth-consent]");
    renderAuthOptions(form.querySelector("[data-beta-auth]"), {
      statusEl: form.querySelector("[data-beta-auth-status]"), redirectPath: "beta",
      // Vor dem Sprung zu Google & Co. die bisherigen Eingaben sichern
      checkConsent: () => {
        if (!consentGiven()) {
          quickConsent.querySelector("input").focus();
          throw new Error("Bitte setze zuerst den Haken bei der Einwilligung.");
        }
        saveDraft(Object.fromEntries(new FormData(form)));
      },
    }).then((shown) => {
      form.querySelector("[data-beta-auth-divider]").hidden = !shown;
      quickConsent.hidden = !shown;
    }).catch(() => {});
    return;
  }
  guest = false;
  const { data: mine } = await sb.rpc("get_my_beta_application");
  if (mine) { clearDraft(); showDone(mine); return; }
  // Nach E-Mail-Bestätigung oder Login: zwischengespeicherte Bewerbung automatisch abschicken
  const draft = readDraft();
  if (draft && draft.focus && draft.hours && (draft.why || "").length >= MIN_WHY) {
    try {
      const result = await submitApplication(draft);
      clearDraft();
      showDone(result.mine);
      return;
    } catch (err) {
      for (const k of APPLICATION_FIELDS) if (form.elements[k]) form.elements[k].value = draft[k] || "";
      updateCount();
      setStatus(status, err.message, "error");
    }
  }
  const me = await currentMember().catch(() => null);
  // Von einer Mitgliederseite hierher geschickt: das Konto gibt es schon, die Pflicht-Bewerbung fehlt noch
  form.querySelector("[data-beta-required]").hidden = !new URLSearchParams(location.search).has("pflicht");
  form.querySelector("[data-beta-as-name]").textContent = (me && me.name) || session.user.email;
  form.querySelector("[data-beta-as-email]").textContent = me && me.name ? `(${session.user.email})` : "";
  form.querySelector("[data-beta-as]").hidden = false;
  form.querySelector("[data-beta-submit]").textContent = "Bewerbung abschicken";
  // Konto ist da, Bewerbung fehlt: direkt zum Formular statt oben auf der Seite zu landen
  document.getElementById("bewerben").scrollIntoView({ block: "start" });
  form.elements.focus.focus({ preventScroll: true });
})().catch((err) => setStatus(status, friendlyError(err), "error"));

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (d) => {
    if (d.company) { showDone(); return; } // Bots füllen das versteckte Feld aus
    requireFields(d, ["focus", "hours", "why"], "Bitte fülle alle Pflichtfelder aus.");
    if (d.why.length < MIN_WHY) {
      why.focus();
      throw new Error(`Erzähl uns etwas mehr über dein Vorhaben – mindestens ${MIN_WHY} Zeichen.`);
    }
    if (!consentGiven()) throw new Error("Bitte bestätige, dass deine Angaben für die Auswahl gespeichert werden dürfen.");
    if (guest) {
      requireFields(d, ["name", "email", "password"], "Bitte gib Name, E-Mail und ein Passwort mit mindestens 8 Zeichen an.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse an.");
      if (d.password.length < 8) throw new Error("Dein Passwort braucht mindestens 8 Zeichen.");
      saveDraft(d);
      const result = unwrap(await sb.auth.signUp({
        email: d.email.trim(), password: d.password,
        options: {
          data: profileFrom({ name: d.name.trim(), headline: (d.project || d.why).trim().slice(0, 120) }),
          emailRedirectTo: new URL("beta", location.href).href,
        },
      }));
      // Supabase meldet bei schon vorhandener E-Mail keinen Fehler, sondern ein Konto ohne Identitäten
      if (result.user && result.user.identities && result.user.identities.length === 0) {
        throw new Error("Mit dieser E-Mail gibt es schon ein Konto. Logg dich ein, dann füllst du nur noch die Bewerbung aus.");
      }
      if (!result.session) {
        form.hidden = true;
        confirmBox.querySelector("[data-beta-confirm-email]").textContent = d.email.trim();
        confirmBox.hidden = false;
        confirmBox.focus();
        return;
      }
      guest = false;
    }
    const result = await submitApplication(d);
    clearDraft();
    showDone(result.mine);
  });
});

function showDone(mine) {
  form.hidden = true;
  confirmBox.hidden = true;
  if (mine) {
    done.querySelector(".beta-done-line").textContent = "Deine Bewerbung";
    done.querySelector("#beta-done-head").textContent = "Du hast dich schon beworben.";
    done.querySelector("[data-beta-done-text]").textContent = "Deine erste Bewerbung zählt. Wenn sich etwas ändert, melden wir uns per E-Mail bei dir.";
    const state = done.querySelector("[data-beta-state]");
    const when = mine.created_at ? new Date(mine.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
    state.textContent = `${when ? `Eingegangen am ${when}. ` : ""}${STATE[mine.status] || ""}`.trim();
    state.hidden = !state.textContent;
  }
  done.hidden = false;
  done.focus();
}
