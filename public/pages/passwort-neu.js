const form = document.getElementById("reset");
const status = document.getElementById("status");

// Der Link aus der E-Mail meldet dich automatisch an; ohne gültigen Link geht es hier nicht weiter
setTimeout(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    setStatus(status, "Dieser Link ist ungültig oder abgelaufen. Fordere auf der Login-Seite einen neuen an.", "error");
    form.querySelector("button").disabled = true;
  }
}, 800);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (data) => {
    if (data.password.length < 8) throw new Error("Dein Passwort braucht mindestens 8 Zeichen.");
    unwrap(await sb.auth.updateUser({ password: data.password }));
    setStatus(status, "Gespeichert! Du wirst zu deinem Profil weitergeleitet …", "ok");
    setTimeout(() => (location.href = "profil"), 1200);
  });
});
