const form = document.getElementById("beta-form");
const gate = document.getElementById("beta-gate");
const status = document.getElementById("beta-status");
const done = document.getElementById("beta-done");
const why = form.elements.why;
const whyCount = document.getElementById("why-count");
const MIN_WHY = 80;
const STATE = {
  neu: "Stand: eingegangen, noch nicht geprüft.",
  in_pruefung: "Stand: in Prüfung.",
  eingeladen: "Stand: eingeladen – die nächsten Schritte kommen per E-Mail.",
  warteliste: "Stand: auf der Warteliste.",
  angenommen: "Stand: angenommen – willkommen in der Beta!",
  abgelehnt: "Stand: diesmal leider nicht dabei.",
};

function updateCount() {
  const n = why.value.trim().length;
  whyCount.textContent = n < MIN_WHY ? `noch ${MIN_WHY - n} Zeichen bis zum Minimum` : `${n} / 1500 Zeichen`;
  whyCount.classList.toggle("is-ok", n >= MIN_WHY);
}
why.addEventListener("input", updateCount);

// Bewerben geht nur mit Konto: Gäste sehen den Einstieg, Mitglieder das Formular oder ihren Stand
(async () => {
  const me = await currentMember();
  if (!me) { gate.hidden = false; return; }
  const { data: mine } = await sb.rpc("get_my_beta_application");
  if (mine) { showDone(mine); return; }
  form.querySelector("[data-beta-as-name]").textContent = me.name || me.email;
  form.querySelector("[data-beta-as-email]").textContent = me.name ? `(${me.email})` : "";
  form.querySelector("[data-beta-as]").hidden = false;
  form.hidden = false;
})().catch(() => { gate.hidden = false; });

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (d) => {
    if (d.company) { showDone(); return; } // Bots füllen das versteckte Feld aus
    requireFields(d, ["focus", "hours", "why"], "Bitte fülle alle Pflichtfelder aus.");
    if (d.why.length < MIN_WHY) {
      why.focus();
      throw new Error(`Erzähl mir etwas mehr über dein Vorhaben – mindestens ${MIN_WHY} Zeichen.`);
    }
    if (!d.consent) throw new Error("Bitte bestätige, dass deine Angaben für die Auswahl gespeichert werden dürfen.");
    const { error } = await sb.rpc("apply_for_beta", {
      p_focus: d.focus, p_project: d.project, p_why: d.why, p_hours: d.hours, p_link: normalizeUrl(d.link),
    });
    if (error) {
      if (/could not find the function|schema cache/i.test(error.message || "")) {
        throw new Error("Bewerbungen sind gleich möglich – die Datenbank wird gerade eingerichtet. Bitte versuch es später noch einmal.");
      }
      if (/schon beworben/i.test(error.message || "")) {
        const { data: mine } = await sb.rpc("get_my_beta_application");
        showDone(mine || { status: "neu" });
        return;
      }
      if (/Xyntal-Konto/.test(error.message || "")) { form.hidden = true; gate.hidden = false; return; }
      throw new Error(friendlyError(error));
    }
    showDone();
  });
});

function showDone(mine) {
  form.hidden = true;
  gate.hidden = true;
  if (mine) {
    done.querySelector(".beta-done-line").textContent = "Deine Bewerbung";
    done.querySelector("#beta-done-head").textContent = "Du hast dich schon beworben.";
    done.querySelector("[data-beta-done-text]").textContent = "Deine erste Bewerbung zählt. Wenn sich etwas ändert, melde ich mich per E-Mail bei dir.";
    const state = done.querySelector("[data-beta-state]");
    const when = mine.created_at ? new Date(mine.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
    state.textContent = `${when ? `Eingegangen am ${when}. ` : ""}${STATE[mine.status] || ""}`.trim();
    state.hidden = !state.textContent;
  }
  done.hidden = false;
  done.focus();
}
