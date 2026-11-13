const panel = document.getElementById("auth-panel");
const form = document.getElementById("login");
const status = document.getElementById("status");
// Nach dem Login zurück zur gewünschten Seite – nur bekannte Ziele
const nextParam = new URLSearchParams(location.search).get("next") || "";
const NEXT = (/^[a-z-]{2,30}$/.test(nextParam) && nextParam !== "login") ? nextParam : "profil";
const mfaForm = document.getElementById("mfa"), mfaStatus = document.getElementById("mfa-status");

// Zweiter Schritt: Code aus der Authenticator-App
function showMfa() {
  panel.dataset.mode = "mfa";
  for (const id of ["login", "signup", "signup-done", "auth-divider", "auth-options", "auth-note"]) document.getElementById(id).hidden = true;
  document.querySelector(".auth-switch").hidden = true;
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
  providersShown = !!shown;
  showProviders(signupDone.hidden);
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

// Passwort anzeigen oder verbergen (Auge im Feld)
document.querySelectorAll("[data-eye]").forEach((eye) => {
  const input = eye.parentElement.querySelector("input");
  eye.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    eye.setAttribute("aria-pressed", String(show));
    const label = show ? "Passwort verbergen" : "Passwort anzeigen";
    eye.setAttribute("aria-label", window.XyntalI18n ? window.XyntalI18n.t(label) : label);
    input.focus({ preventScroll: true });
  });
});

/* ---------- Einloggen | Konto anlegen ---------- */
const signupForm = document.getElementById("signup"), signupStatus = document.getElementById("signup-status");
const signupDone = document.getElementById("signup-done");
const tabs = [...document.querySelectorAll(".auth-switch [data-mode]")];
let mode = "login";
// Anbieter-Buttons, „oder“ und Hinweis: nur zeigen, wenn Supabase welche liefert (providersShown)
let providersShown = false;
function showProviders(on) {
  for (const id of ["auth-options", "auth-divider", "auth-note"]) document.getElementById(id).hidden = !(on && providersShown);
}
function setMode(next, focus = false) {
  if (!mfaForm.hidden) return;
  mode = next === "signup" ? "signup" : "login";
  panel.dataset.mode = mode;
  // Anbieter-Buttons wandern zur sichtbaren Seite des Panels
  panel.querySelector(`.auth-pane--${mode}`).prepend(document.getElementById("auth-stack"));
  tabs.forEach((t) => {
    const on = t.dataset.mode === mode;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  form.hidden = mode !== "login";
  signupForm.hidden = mode !== "signup";
  signupDone.hidden = true;
  showProviders(true);
  document.querySelector("[data-legal-login]").hidden = mode !== "login";
  document.querySelector("[data-legal-signup]").hidden = mode !== "signup";
  const hash = mode === "signup" ? "#registrieren" : "";
  if (location.hash !== hash) history.replaceState(null, "", location.pathname + location.search + hash);
  if (focus) (mode === "signup" ? signupForm.elements.name : form.elements.email).focus();
}
tabs.forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode, true)));
document.querySelector(".auth-switch").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const next = mode === "login" ? "signup" : "login";
  setMode(next);
  tabs.find((t) => t.dataset.mode === next).focus();
});
document.querySelectorAll("[data-to]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); setMode(a.dataset.to, true); }));
if (/^#(registrieren|konto|signup)$/.test(location.hash) || new URLSearchParams(location.search).has("neu")) setMode("signup");

// Passwortstärke: Länge, Groß/klein, Zahl, Sonderzeichen
const LEVELS = ["Mindestens 8 Zeichen", "Schwach", "Okay", "Gut", "Stark"];
const pw = signupForm.elements.password, meter = document.getElementById("pw-strength");
pw.addEventListener("input", () => {
  const v = pw.value;
  let level = 0;
  if (v.length >= 8) {
    level = 1 + [/[a-z]/.test(v) && /[A-Z]/.test(v), /\d/.test(v), /[^A-Za-z0-9]/.test(v), v.length >= 12].filter(Boolean).length;
    level = Math.min(4, level);
  }
  meter.dataset.level = String(level);
  const label = LEVELS[level];
  meter.querySelector(".pw-label").textContent = window.XyntalI18n ? window.XyntalI18n.t(label) : label;
});

// Einladungscode (= Link-Name der einladenden Person): aus ?code= oder vom gemerkten Einladungslink vorbelegen
(() => {
  const field = signupForm.elements.code;
  if (!field) return;
  const ok = (v) => /^[a-z0-9][a-z0-9_-]{2,19}$/.test(v);
  let code = (new URLSearchParams(location.search).get("code") || "").trim().toLowerCase();
  if (!ok(code)) {
    try { const r = JSON.parse(localStorage.getItem("xyntal-ref-handle") || "null"); code = r && ok(r.handle || "") ? r.handle : ""; } catch { code = ""; }
  }
  if (ok(code)) field.value = code;
})();

// Geburtsdatum: Pflicht, ab 16 und taggenau. Die Prüfung im Server (handle_new_user, set_my_birthdate) gilt trotzdem.
const BIRTHDATE_TOO_YOUNG = "Xyntal ist ab 16 Jahren. Sobald du 16 wirst, bist du herzlich willkommen.";
function birthdateLimit() {
  const t = new Date();
  return [t.getFullYear() - 16, String(t.getMonth() + 1).padStart(2, "0"), String(t.getDate()).padStart(2, "0")].join("-");
}
function birthdateProblem(value) {
  const v = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Bitte gib dein Geburtsdatum an.";
  const [y, m, d] = v.split("-").map(Number);
  const real = new Date(Date.UTC(y, m - 1, d));
  if (real.getUTCFullYear() !== y || real.getUTCMonth() !== m - 1 || real.getUTCDate() !== d) return "Bitte gib ein gültiges Geburtsdatum an.";
  if (v > birthdateLimit()) return BIRTHDATE_TOO_YOUNG; // zukünftige Daten sind ebenfalls jünger als 16
  return "";
}
// Mit Prüfung: Fehlt das Feld einmal, soll das Modul hier nicht werfen – sonst wird der
// Submit-Handler darunter nie registriert und die Registrierung ist tot.
if (signupForm.elements.birthdate) signupForm.elements.birthdate.max = birthdateLimit();

signupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(signupForm, signupStatus, async (d) => {
    if (d.company) return; // Bots füllen das versteckte Feld aus
    requireFields(d, ["name", "email", "password"], "Bitte gib Name, E-Mail und ein Passwort an.");
    if (d.name.trim().length < 2) throw new Error("Bitte gib deinen Namen an.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) throw new Error("Bitte gib eine gültige E-Mail-Adresse an.");
    if (d.password.length < 8) throw new Error("Dein Passwort braucht mindestens 8 Zeichen.");
    const birthProblem = birthdateProblem(d.birthdate);
    if (birthProblem) { signupForm.elements.birthdate.focus(); throw new Error(birthProblem); }
    const result = unwrap(await sb.auth.signUp({
      email: d.email.trim(), password: d.password,
      options: {
        data: { ...profileFrom({ name: d.name.trim() }), birthdate: d.birthdate },
        emailRedirectTo: new URL(NEXT, location.href).href,
      },
    }));
    // Supabase meldet bei schon vorhandener E-Mail keinen Fehler, sondern ein Konto ohne Identitäten
    if (result.user && result.user.identities && result.user.identities.length === 0) {
      throw new Error("Mit dieser E-Mail gibt es schon ein Konto. Logg dich ein oder setz dein Passwort zurück.");
    }
    // Einladungscode merken: eingelöst wird er, sobald die E-Mail bestätigt ist (account-menu.js)
    const code = String(d.code || "").trim().toLowerCase();
    if (/^[a-z0-9][a-z0-9_-]{2,19}$/.test(code)) {
      try { localStorage.setItem("xyntal-ref-handle", JSON.stringify({ handle: code, at: Date.now() })); } catch { /* geht auch ohne */ }
    }
    if (result.session) { location.href = NEXT; return; }
    signupForm.hidden = true;
    showProviders(false);
    signupDone.querySelector("[data-signup-email]").textContent = d.email.trim();
    signupDone.hidden = false;
    panel.dataset.mode = "done";
    signupDone.focus();
  });
});

