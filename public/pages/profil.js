const form = document.getElementById("profile");
const status = document.getElementById("status");
let me = null;

function render(m) {
  document.querySelector("[data-beta-download]").hidden = m.is_beta_tester !== true;
  document.getElementById("hello").innerHTML = `Hallo, <em>${esc((m.name || "du").split(" ")[0])}.</em>`;
  const fresh = new URLSearchParams(location.search).has("neu");
  let notice = "";
  if (m.status === "pending") {
    notice = `<div class="notice">${fresh ? "<strong>Willkommen bei Xyntal!</strong> " : ""}Du kannst schon <a class="text-link" href="projekte?neu=1">Projekte anlegen</a> und <a class="text-link" href="mitglieder">andere Mitglieder anschreiben</a>. Dein Profil schaue ich mir zusätzlich persönlich an und schalte es frei – dann erscheint es auch öffentlich.</div>`;
  } else if (m.status === "rejected") {
    notice = `<div class="notice">Dein Profil wurde nicht freigeschaltet. Bei Fragen melde dich gern per E-Mail.</div>`;
  }
  if (!m.headline) {
    notice = `<div class="notice"><strong>Fast fertig:</strong> Schreib unten in einem Satz, woran du arbeitest – dann kann ich dein Profil freischalten.</div>` + notice;
  }
  document.getElementById("notice").innerHTML = notice;
  document.getElementById("preview").innerHTML = `<div class="members-grid" style="grid-template-columns: 1fr; margin-top: 0">${memberCard(m)}</div>`;
}

// ---------- Registerkarten: Profil · Xyntal-Karte · Sicherheit ----------
const tabs = [...document.querySelectorAll("[data-tab]")];
const TABS = tabs.map((b) => b.dataset.tab);
function selectTab(name, { focus = false, push = true } = {}) {
  if (!TABS.includes(name)) name = "profil";
  for (const b of tabs) {
    const on = b.dataset.tab === name;
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  for (const p of document.querySelectorAll("[data-panel]")) p.hidden = p.dataset.panel !== name;
  if (push && location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  if (name === "karte") openCardEditor();
  if (name === "sicherheit") renderSecurity();
}
// weiter unten gewechselt: zum Anfang der neuen Registerkarte springen
function toTabsTop() {
  const bar = document.querySelector(".ptabs");
  const top = bar.parentElement.getBoundingClientRect().top + scrollY - 84;
  if (scrollY > top) scrollTo({ top, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
tabs.forEach((b) => b.addEventListener("click", () => { selectTab(b.dataset.tab); toTabsTop(); }));
document.querySelector(".ptabs").addEventListener("keydown", (e) => {
  const i = tabs.findIndex((b) => b.getAttribute("aria-selected") === "true");
  const j = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
  if (j === null) return;
  e.preventDefault();
  selectTab(TABS[(j + tabs.length) % tabs.length], { focus: true });
  toTabsTop();
});
// #karte, #sicherheit … oder ein Element darin (z. B. #avatar-form)
function fromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (TABS.includes(id)) return selectTab(id, { push: false });
  const el = id && document.getElementById(id);
  const panel = el && el.closest("[data-panel]");
  selectTab(panel ? panel.dataset.panel : "profil", { push: false });
  if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
}
window.addEventListener("hashchange", fromHash);

// Nach dem Bestätigungslink kann die Sitzung einen Moment brauchen
setTimeout(async () => {
  me = await currentMember();
  if (!me) { location.href = "login"; return; }
  fillForm(form, me);
  render(me);
  setupAvatarEditor(me, updated => { me = updated; render(me); });
  renderXcard();
  fromHash();
}, 300);

// ---------- Xyntal-Karte ----------
let cardLink = "";
async function renderXcard() {
  const text = document.querySelector("[data-xcard-text]"), view = document.querySelector("[data-xcard-view]"), copy = document.querySelector("[data-xcard-copy]");
  view.hidden = copy.hidden = true;
  try {
    const card = unwrap(await sb.rpc("get_my_card"));
    if (!card) { text.textContent = "Du hast noch keine Karte. Gestalte sie unten – dann kannst du dir auch deinen Link xyntal.de/deinname sichern."; return; }
    if (card.handle && card.is_public) {
      text.innerHTML = `Dein öffentliches Profil: <b data-no-i18n>xyntal.de/${esc(card.handle)}</b> – mit deiner Karte, deinen Profilangaben sowie deinen öffentlichen Projekten und Anzeigen.`;
      cardLink = `https://xyntal.de/${card.handle}`;
      view.href = `/${card.handle}`; view.hidden = copy.hidden = false;
    } else if (card.handle) {
      text.innerHTML = `Dein Link <b data-no-i18n>xyntal.de/${esc(card.handle)}</b> führt zu deinem Profil, sobald du es freigibst. Aktiviere unten unter „Sichtbarkeit &amp; Link“ dein öffentliches Profil und speichere deine Karte.`;
    } else {
      text.textContent = "Deine Karte ist gespeichert. Sichere dir unten noch deinen Link xyntal.de/deinname.";
    }
  } catch { text.textContent = "Gestalte deine Karte und sichere dir deinen Link xyntal.de/deinname."; }
}
document.querySelector("[data-xcard-copy]").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText(cardLink); e.target.textContent = "Kopiert ✓"; }
  catch { e.target.textContent = cardLink; }
  setTimeout(() => { e.target.textContent = "Link kopieren"; }, 2000);
});
// Der Karten-Editor (/meine-karte) läuft eingebettet und passt seine Höhe an
const frame = document.querySelector("[data-xcard-frame]");
function openCardEditor() {
  if (frame.src) return;
  frame.addEventListener("load", () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    const fit = () => { frame.style.height = `${Math.ceil(doc.documentElement.scrollHeight)}px`; };
    fit();
    new ResizeObserver(fit).observe(doc.body);
  });
  frame.src = "meine-karte?embed=1";
}
window.addEventListener("message", (e) => {
  if (e.origin === location.origin && e.data && e.data.type === "xyntal-card-saved") renderXcard();
});

// ---------- Profil speichern ----------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, status, async (data) => {
    requireFields(data, ["name", "headline"], "Name und „Woran arbeitest du?“ dürfen nicht leer sein.");
    const updated = unwrap(await sb.from("profiles").update(profileFrom(data)).eq("id", me.id).select().single());
    me = { ...me, ...updated };
    fillForm(form, me);
    render(me);
    setStatus(status, "Gespeichert.", "ok");
  });
});

document.getElementById("logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.href = "./";
});

// ---------- Sicherheit ----------
const statusOf = (root) => root.querySelector(".form-status");
const PROVIDERS = { email: "E-Mail und Passwort", google: "Google", apple: "Apple", linkedin_oidc: "LinkedIn", linkedin: "LinkedIn", phone: "Handynummer (SMS)" };
let secUser = null;

async function renderSecurity() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  secUser = user;
  document.querySelector("[data-sec-email]").textContent = user.email || "keine";
  const pending = document.querySelector("[data-sec-email-pending]");
  pending.hidden = !user.new_email;
  if (user.new_email) pending.innerHTML = `Änderung zu <b data-no-i18n>${esc(user.new_email)}</b> wartet auf Bestätigung – schau in dein Postfach.`;
  // Passwort: ändern oder (bei Google/SMS) neu festlegen
  const providers = [...new Set((user.identities || []).map((i) => i.provider))];
  const hasPw = providers.includes("email");
  document.querySelector("[data-pw-title]").textContent = hasPw ? "Passwort ändern" : "Passwort festlegen";
  document.querySelector("[data-pw-none]").hidden = hasPw;
  document.querySelector("[data-pw-current]").hidden = !hasPw;
  document.querySelector("[data-sec-methods]").innerHTML = (providers.length ? providers : ["email"]).map((p) =>
    `<li><span class="sec-dot" aria-hidden="true"></span>${esc(PROVIDERS[p] || p)}${p === "email" && user.email ? ` <span class="hint" data-no-i18n>· ${esc(user.email)}</span>` : ""}${p === "phone" && user.phone ? ` <span class="hint" data-no-i18n>· +${esc(user.phone)}</span>` : ""}</li>`).join("");
  renderMfa();
}

// E-Mail ändern (Bestätigungslink an die neue Adresse)
const emailForm = document.getElementById("sec-email");
emailForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(emailForm, statusOf(emailForm), async (data) => {
    const email = (data.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Bitte gib eine gültige E-Mail-Adresse an.");
    if (secUser && email === (secUser.email || "").toLowerCase()) throw new Error("Das ist schon deine aktuelle E-Mail-Adresse.");
    unwrap(await sb.auth.updateUser({ email }, { emailRedirectTo: new URL("profil#sicherheit", location.href).href }));
    emailForm.reset();
    await renderSecurity();
    setStatus(statusOf(emailForm), "Fast geschafft: Bestätige die Änderung über den Link, den wir dir geschickt haben. Je nach Einstellung kommt auch an deine bisherige Adresse ein Link.", "ok");
  });
});

// Passwort ändern: aktuelles Passwort prüfen, dann neues setzen
const pwForm = document.getElementById("sec-password");
const nonceRow = pwForm.querySelector("[data-pw-nonce]");
pwForm.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(pwForm, statusOf(pwForm), async (data) => {
    if ((data.password || "").length < 8) throw new Error("Das neue Passwort braucht mindestens 8 Zeichen.");
    if (data.password !== data.password2) throw new Error("Die beiden neuen Passwörter stimmen nicht überein.");
    const check = unwrap(await sb.rpc("verify_my_password", { p_password: data.current || "" }));
    if (check === "wrong") throw new Error("Dein aktuelles Passwort stimmt nicht.");
    if (check === "limit") throw new Error("Zu viele Versuche. Bitte warte 15 Minuten.");
    const attrs = { password: data.password };
    if (!nonceRow.hidden && data.nonce) attrs.nonce = data.nonce.trim();
    const { error } = await sb.auth.updateUser(attrs);
    if (error && /reauthenticat/i.test(error.message || "") && nonceRow.hidden) {
      unwrap(await sb.auth.reauthenticate());
      nonceRow.hidden = false;
      pwForm.elements.nonce.focus();
      setStatus(statusOf(pwForm), "Zur Sicherheit haben wir dir einen Code per E-Mail geschickt. Gib ihn ein und klick noch einmal auf „Passwort speichern“.");
      return;
    }
    if (error) throw new Error(friendlyError(error));
    pwForm.reset(); nonceRow.hidden = true;
    await renderSecurity();
    setStatus(statusOf(pwForm), "Dein Passwort ist geändert.", "ok");
  });
});

// Zwei-Faktor-Anmeldung mit Authenticator-App (TOTP)
const mfaBox = document.getElementById("sec-2fa");
const mfaState = mfaBox.querySelector("[data-mfa-state]"), mfaStatus = mfaBox.querySelector("[data-mfa-status]");
const mfaStart = mfaBox.querySelector("[data-mfa-start]"), mfaOff = mfaBox.querySelector("[data-mfa-off]");
const mfaSetup = mfaBox.querySelector("[data-mfa-setup]");
let mfaFactor = null, enrolling = null;

async function renderMfa() {
  try {
    const data = unwrap(await sb.auth.mfa.listFactors());
    mfaFactor = (data.totp || []).find((f) => f.status === "verified") || null;
  } catch (err) { mfaState.textContent = friendlyError(err); return; }
  mfaState.innerHTML = mfaFactor
    ? `<span class="sec-badge on">Aktiv</span> Beim Login fragen wir nach dem Code aus deiner App.`
    : `<span class="sec-badge">Aus</span> Dein Konto ist nur mit Passwort bzw. Login-Anbieter geschützt.`;
  mfaStart.hidden = !!mfaFactor || !mfaSetup.hidden;
  mfaOff.hidden = !mfaFactor;
}
mfaStart.addEventListener("click", async () => {
  mfaStart.disabled = true;
  setStatus(mfaStatus, "Einen Moment …");
  try {
    // alte, nie bestätigte Versuche aufräumen
    const all = unwrap(await sb.auth.mfa.listFactors()).all || [];
    for (const f of all) if (f.factor_type === "totp" && f.status !== "verified") await sb.auth.mfa.unenroll({ factorId: f.id });
    enrolling = unwrap(await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Xyntal ${new Date().toISOString().slice(0, 10)}` }));
    // Supabase liefert das SVG roh (teils mit „data:…,“ davor) – sauber kodieren, sonst bricht z. B. ein „#“ das Bild
    let qr = (enrolling.totp.qr_code || "").trim();
    const raw = qr.startsWith("<svg") ? qr : /^data:image\/svg\+xml;(utf-?8|charset=utf-?8),\s*</i.test(qr) ? qr.slice(qr.indexOf(",") + 1) : "";
    if (raw) qr = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
    mfaSetup.querySelector("[data-mfa-qr]").src = qr;
    mfaSetup.querySelector("[data-mfa-secret]").textContent = (enrolling.totp.secret || "").replace(/(.{4})/g, "$1 ").trim();
    mfaSetup.hidden = false; mfaStart.hidden = true;
    setStatus(mfaStatus, "");
    mfaSetup.elements.code.focus();
  } catch (err) {
    setStatus(mfaStatus, friendlyError(err), "error");
  } finally { mfaStart.disabled = false; }
});
mfaSetup.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(mfaSetup, mfaStatus, async (data) => {
    const code = (data.code || "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(code)) throw new Error("Bitte gib den 6-stelligen Code aus deiner App ein.");
    unwrap(await sb.auth.mfa.challengeAndVerify({ factorId: enrolling.id, code }));
    enrolling = null; mfaSetup.reset(); mfaSetup.hidden = true;
    await renderMfa();
    setStatus(mfaStatus, "2FA ist eingeschaltet. Ab jetzt fragen wir beim Login nach dem Code aus deiner App.", "ok");
  });
});
mfaSetup.querySelector("[data-mfa-cancel]").addEventListener("click", async () => {
  if (enrolling) { try { await sb.auth.mfa.unenroll({ factorId: enrolling.id }); } catch { /* bleibt unbestätigt und wird beim nächsten Mal aufgeräumt */ } }
  enrolling = null; mfaSetup.reset(); mfaSetup.hidden = true;
  setStatus(mfaStatus, "");
  renderMfa();
});
mfaOff.addEventListener("click", async () => {
  if (!mfaOff.dataset.armed) {
    mfaOff.dataset.armed = "1";
    mfaOff.textContent = "Wirklich ausschalten?";
    setTimeout(() => { delete mfaOff.dataset.armed; mfaOff.textContent = "2FA ausschalten"; }, 5000);
    return;
  }
  mfaOff.disabled = true;
  try {
    unwrap(await sb.auth.mfa.unenroll({ factorId: mfaFactor.id }));
    await sb.auth.refreshSession();
    setStatus(mfaStatus, "2FA ist ausgeschaltet.", "ok");
  } catch (err) {
    setStatus(mfaStatus, friendlyError(err), "error");
  } finally {
    delete mfaOff.dataset.armed; mfaOff.textContent = "2FA ausschalten"; mfaOff.disabled = false;
    renderMfa();
  }
});

// Überall abmelden
document.querySelector("[data-signout-all]").addEventListener("click", async () => {
  await sb.auth.signOut({ scope: "global" });
  location.href = "login";
});

// Konto löschen: zweistufig statt Browser-Dialog – erster Klick fragt nach, zweiter löscht
const del = document.getElementById("delete");
const delStatus = document.querySelector("[data-delete-status]");
del.addEventListener("click", async () => {
  if (!del.dataset.armed) {
    del.dataset.armed = "1";
    del.textContent = "Wirklich endgültig löschen?";
    setTimeout(() => { delete del.dataset.armed; del.textContent = "Konto löschen"; }, 5000);
    return;
  }
  try {
    await deleteMemberAvatars(me.id);
    unwrap(await sb.rpc("delete_my_account"));
    await sb.auth.signOut();
    location.href = "./";
  } catch (err) {
    setStatus(delStatus, friendlyError(err), "error");
  }
});
