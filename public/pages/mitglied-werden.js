const form = document.getElementById("register");
const status = document.getElementById("status");
// Nach der Anmeldung weiter zum gewünschten Ziel – nur bekannte Seiten, sonst ins Profil
const nextParam = new URLSearchParams(location.search).get("next") || "";
const AFTER = /^[a-z-]{2,30}$/.test(nextParam) && !["login", "mitglied-werden"].includes(nextParam) ? nextParam : "profil?neu=1";
if (AFTER !== "profil?neu=1") document.querySelectorAll('a[href="login"]').forEach((a) => { a.href = `login?next=${encodeURIComponent(AFTER)}`; });

// Aus der Demo auf der Startseite: gewählte Rollen als Vorschlag für „Was suchst du gerade?“
try {
  const roles = JSON.parse(localStorage.getItem("xyntal-wunschrollen") || "[]");
  if (Array.isArray(roles) && roles.length && !form.elements.seek.value) {
    form.elements.seek.value = `Für mein Projekt suche ich Menschen für: ${roles.map((r) => r.name).join(", ")}.`;
    document.getElementById("from-demo").hidden = false;
    document.getElementById("join-more").open = true;
  }
} catch { /* ohne Speicher einfach leer */ }

renderAuthOptions(document.getElementById("auth-options"), {
  statusEl: document.getElementById("quick-status"),
  redirectPath: AFTER,
  checkConsent: () => {
    if (!document.getElementById("quick-consent").checked) throw new Error("Bitte bestätige zuerst die Datenschutz-Einwilligung.");
  },
}).then((shown) => { document.getElementById("quick-start").hidden = !shown; });
form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (data) => {
    requireFields(data, ["name", "email", "password"], "Bitte fülle Name, E-Mail und Passwort aus.");
    requireFields(data, ["headline"], "Schreib kurz, woran du arbeitest oder wobei du mitmachen willst.");
    if (data.password.length < 8) throw new Error("Dein Passwort braucht mindestens 8 Zeichen.");
    if (!data.consent) throw new Error("Bitte bestätige die Datenschutz-Einwilligung.");

    const result = unwrap(await sb.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: profileFrom(data),
        emailRedirectTo: new URL(AFTER, location.href).href,
      },
    }));

    // Supabase meldet bei schon vorhandener E-Mail keinen Fehler, sondern ein Konto ohne Identitäten
    if (result.user && result.user.identities && result.user.identities.length === 0) {
      throw new Error("Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an.");
    }
    if (result.session) {
      location.href = AFTER;
      return;
    }
    form.innerHTML = `
      <div class="notice"><strong>Fast geschafft!</strong> Wir haben dir eine E-Mail an <strong>${esc(data.email)}</strong> geschickt.
      Klick auf den Link darin, um deine Adresse zu bestätigen – danach ist dein Profil angelegt${AFTER === "beta" ? " und du kannst dich für die Beta bewerben" : " und wartet auf Freigabe"}.</div>`;
    window.scrollTo({ top: form.offsetTop - 100 });
  });
});
