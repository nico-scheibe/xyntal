const form = document.getElementById("login");
const status = document.getElementById("status");
// Nach dem Login zurück zur gewünschten Seite – nur bekannte Ziele
const nextParam = new URLSearchParams(location.search).get("next") || "";
const NEXT = ((/^[a-z-]{2,30}$/.test(nextParam) && nextParam !== "login") || /^projekte\?projekt=\d+$/.test(nextParam) || /^boerse#anzeige-\d+$/.test(nextParam)) ? nextParam : "profil";
const mfaForm = document.getElementById("mfa"), mfaStatus = document.getElementById("mfa-status");

// Zweiter Schritt: Code aus der Authenticator-App
function showMfa() {
  for (const id of ["login", "auth-divider", "auth-options", "auth-note"]) document.getElementById(id).hidden = true;
  mfaForm.hidden = false;
  mfaForm.elements.code.focus();
}
(async () => {
  if (!sb) return;
  const back = new URLSearchParams(location.search + "&" + location.hash.slice(1));
  const fromProvider = back.has("access_token") || back.has("code");
  const { data: { session } } = await sb.auth.getSession();
  if (back.has("error_description")) setStatus(status, `Anmeldung fehlgeschlagen: ${back.get("error_description")}`, "error");
  if (session && await mfaPending()) showMfa();
  else if (session && fromProvider) location.replace(NEXT);
})();
mfaForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(mfaForm, mfaStatus, async (data) => {
    const code = (data.code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) throw new Error("Bitte gib den 6-stelligen Code aus deiner App ein.");
    const factors = unwrap(await sb.auth.mfa.listFactors());
    const factor = (factors.totp || []).find((f) => f.status === "verified");
    if (!factor) throw new Error("Für dein Konto ist keine Authenticator-App eingerichtet.");
    unwrap(await sb.auth.mfa.challengeAndVerify({ factorId: factor.id, code }));
    location.href = NEXT;
  });
});
document.getElementById("mfa-cancel").addEventListener("click", async (e) => {
  e.preventDefault();
  await sb.auth.signOut();
  location.href = "login";
});

renderAuthOptions(document.getElementById("auth-options"), { statusEl: status, redirectPath: NEXT }).then((shown) => {
  if (!mfaForm.hidden) return;
  document.getElementById("auth-divider").hidden = !shown;
  document.getElementById("auth-note").hidden = !shown;
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (data) => {
    requireFields(data, ["email", "password"], "Bitte gib E-Mail und Passwort ein.");
    unwrap(await sb.auth.signInWithPassword({ email: data.email, password: data.password }));
    if (await mfaPending()) { setStatus(status, ""); showMfa(); return; }
    location.href = NEXT;
  });
});

document.getElementById("forgot").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = form.elements.email.value.trim();
  if (!email) {
    setStatus(status, "Gib oben deine E-Mail ein und klick dann noch einmal auf „Passwort vergessen?“.", "error");
    form.elements.email.focus();
    return;
  }
  setStatus(status, "Einen Moment …");
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: new URL("passwort-neu", location.href).href });
  if (error) setStatus(status, friendlyError(error), "error");
  else setStatus(status, "Falls es ein Konto mit dieser E-Mail gibt, ist ein Link zum Zurücksetzen unterwegs.", "ok");
});
