const form = document.getElementById("beta-form");
const status = document.getElementById("beta-status");
const done = document.getElementById("beta-done");
const why = form.elements.why;
const whyCount = document.getElementById("why-count");
const MIN_WHY = 80;

function updateCount() {
  const n = why.value.trim().length;
  whyCount.textContent = n < MIN_WHY ? `noch ${MIN_WHY - n} Zeichen bis zum Minimum` : `${n} / 1500 Zeichen`;
  whyCount.classList.toggle("is-ok", n >= MIN_WHY);
}
why.addEventListener("input", updateCount);

// Eingeloggte Mitglieder müssen Name und E-Mail nicht noch einmal tippen
currentMember().then((me) => {
  if (!me) return;
  if (!form.elements.name.value) form.elements.name.value = me.name || "";
  if (!form.elements.email.value) form.elements.email.value = me.email || "";
}).catch(() => {});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (d) => {
    if (d.company) { showDone(); return; } // Bots füllen das versteckte Feld aus
    requireFields(d, ["name", "email", "focus", "hours", "why"], "Bitte fülle alle Pflichtfelder aus.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse an.");
    if (d.why.length < MIN_WHY) {
      why.focus();
      throw new Error(`Erzähl mir etwas mehr über dein Vorhaben – mindestens ${MIN_WHY} Zeichen.`);
    }
    if (!d.consent) throw new Error("Bitte bestätige, dass deine Angaben für die Auswahl gespeichert werden dürfen.");
    const { error } = await sb.rpc("apply_for_beta", {
      p_name: d.name, p_email: d.email, p_focus: d.focus, p_project: d.project,
      p_why: d.why, p_hours: d.hours, p_link: normalizeUrl(d.link),
    });
    if (error) {
      if (/could not find the function|schema cache/i.test(error.message || "")) {
        throw new Error("Bewerbungen sind gleich möglich – die Datenbank wird gerade eingerichtet. Bitte versuch es später noch einmal.");
      }
      throw new Error(friendlyError(error));
    }
    showDone();
  });
});

function showDone() {
  form.hidden = true;
  done.hidden = false;
  done.focus();
}
