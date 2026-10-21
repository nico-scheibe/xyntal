// Gemeinsame Helfer für alle Xyntal-Seiten (Daten & Login über Supabase)

const sb = window.supabase.createClient(window.XYNTAL_CONFIG.supabaseUrl, window.XYNTAL_CONFIG.supabaseKey);

const PHASES = { idee: "Idee", nebenberuflich: "Nebenberuflich", vollzeit: "Vollzeit selbstständig", team: "Mit Team / Firma" };
const PROFILE_FIELDS = ["name", "headline", "about", "phase", "category", "offer", "seek", "linkedin", "instagram", "website", "is_public"];

// Supabase-Fehler in verständliches Deutsch übersetzen
function friendlyError(err) {
  const msg = (err && (err.message || err.error_description)) || String(err || "");
  const map = [
    [/bucket not found/i, "Der Bildspeicher ist noch nicht eingerichtet. Bitte versuch es später erneut."],
    [/payload too large|maximum allowed size|exceeded.*size/i, "Das Bild ist zu groß. Bitte wähle eine kleinere Datei."],
    [/mime type.*not supported|invalid.*mime/i, "Dieses Bildformat wird nicht unterstützt. Bitte wähle JPG, PNG oder WebP."],
    [/invalid login credentials/i, "E-Mail oder Passwort stimmt nicht."],
    [/email not confirmed/i, "Bitte bestätige zuerst deine E-Mail-Adresse – schau in dein Postfach."],
    [/user already registered|already been registered/i, "Mit dieser E-Mail gibt es schon ein Konto. Melde dich einfach an."],
    [/password should be at least|password.*(short|characters)/i, "Dein Passwort braucht mindestens 8 Zeichen."],
    [/weak.?password|pwned|leaked/i, "Dieses Passwort ist zu unsicher. Bitte wähle ein anderes."],
    [/rate limit|too many|security purposes/i, "Zu viele Versuche. Bitte warte kurz und versuch es dann noch einmal."],
    [/unable to validate email|invalid.*email/i, "Bitte gib eine gültige E-Mail-Adresse an."],
    [/same.?password|different from the old/i, "Das neue Passwort muss sich vom alten unterscheiden."],
    [/failed to fetch|network/i, "Keine Verbindung. Bitte prüfe dein Internet."],
    [/check constraint/i, "Ein Feld ist zu lang oder ungültig."],
    [/token has expired|invalid.*(otp|token)|otp.*(expired|invalid)/i, "Der Code ist falsch oder abgelaufen. Fordere einen neuen an."],
    [/unsupported phone provider|phone.*provider.*(disabled|not enabled)/i, "Die Anmeldung per SMS ist noch nicht eingerichtet."],
    [/provider is not enabled|unsupported provider/i, "Diese Anmeldung ist noch nicht eingerichtet."],
    [/sms|phone.*(invalid|not)/i, "Die SMS konnte nicht gesendet werden. Prüfe die Nummer."],
  ];
  for (const [re, text] of map) if (re.test(msg)) return text;
  return msg || "Da ist etwas schiefgelaufen. Bitte versuch es noch einmal.";
}

// Supabase-Antwort auspacken: Fehler werfen, sonst Daten zurückgeben
function unwrap({ data, error }) {
  if (error) throw new Error(friendlyError(error));
  return data;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function initials(name) {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}

function normalizeUrl(u) {
  u = (u || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : "https://" + u;
}

// Formular -> Objekt (Checkboxen als true/false)
function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    out[el.name] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  return out;
}

function fillForm(form, data) {
  for (const el of form.elements) {
    if (!el.name || !(el.name in data)) continue;
    if (el.type === "checkbox") el.checked = !!data[el.name];
    else el.value = data[el.name] ?? "";
  }
}

// Nur die Profilfelder, Links normalisiert
function profileFrom(data) {
  const p = {};
  for (const k of PROFILE_FIELDS) p[k] = data[k] ?? (k === "is_public" ? false : "");
  for (const k of ["linkedin", "instagram", "website"]) p[k] = normalizeUrl(p[k]);
  if (!p.phase) p.phase = null;
  return p;
}

function setStatus(el, text, kind = "") {
  el.className = "form-status" + (kind ? " " + kind : "");
  el.textContent = text;
}

function requireFields(data, fields, message) {
  if (fields.some((f) => !data[f])) throw new Error(message);
}

// Formular mit Lade-Zustand absenden
async function submitWith(form, statusEl, fn) {
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  setStatus(statusEl, "Einen Moment …");
  try {
    await fn(formData(form));
  } catch (err) {
    setStatus(statusEl, friendlyError(err), "error");
  } finally {
    btn.disabled = false;
  }
}

// Eingeloggter Nutzer + Profil (oder null)
async function currentMember() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data: profile } = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
  return profile ? { ...profile, email: session.user.email } : null;
}

function memberCard(m, opts = {}) {
  const links = [
    m.linkedin && `<a href="${esc(m.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`,
    m.instagram && `<a href="${esc(m.instagram)}" target="_blank" rel="noopener">Instagram</a>`,
    m.website && `<a href="${esc(m.website)}" target="_blank" rel="noopener">Website</a>`,
  ].filter(Boolean).join("");
  const tags = [PHASES[m.phase], m.category].filter(Boolean).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  return `
    <article class="member">
      <div class="member-head">
        ${avatar(m.name, "", m.avatar_path)}
        <div>
          <h3>${esc(m.name)}</h3>
          <p class="member-headline">${esc(m.headline)}</p>
        </div>
      </div>
      ${tags ? `<div class="tags">${tags}</div>` : ""}
      ${m.about ? `<p class="member-about">${esc(m.about)}</p>` : ""}
      ${m.offer ? `<p class="member-kv"><span>Kann helfen bei</span>${esc(m.offer)}</p>` : ""}
      ${m.seek ? `<p class="member-kv"><span>Sucht</span>${esc(m.seek)}</p>` : ""}
      ${links ? `<div class="member-links">${links}</div>` : ""}
      ${opts.message ? `<a class="btn btn-small btn-ghost member-message" href="nachrichten?an=${esc(m.id)}">Nachricht schreiben</a>` : ""}
    </article>`;
}

// Navigation: "Login" bzw. "Mein Profil" anzeigen
(async () => {
  const slot = document.querySelector("[data-account]");
  if (!slot) return;
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    slot.textContent = "Mein Profil";
    slot.href = "profil";
    slot.classList.remove("hide-sm");
    document.querySelectorAll('.nav-links a.btn[href="mitglied-werden"], .nav-links a.btn[href="#warteliste"]').forEach((a) => a.remove());
  }
})();

// ---------- Anmeldung mit Google, Apple, LinkedIn und Telefonnummer ----------

const OAUTH_PROVIDERS = [
  {
    key: "google",
    label: "Mit Google fortfahren",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z"/><path fill="#4285F4" d="M21.4 12.2c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.2-1 2.2-2.1 2.9l3.2 2.5c1.9-1.8 2.8-4.4 2.8-7.7z"/><path fill="#FBBC05" d="M6.2 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3L3 7.3C2.4 8.7 2 10.3 2 12s.4 3.3 1 4.7l3.2-2.4z"/><path fill="#34A853" d="M12 21.8c2.6 0 4.8-.9 6.4-2.4l-3.2-2.5c-.9.6-2 1-3.2 1-2.5 0-4.6-1.7-5.4-3.9L3.4 16.4c1.6 3.2 4.9 5.4 8.6 5.4z"/></svg>',
  },
  {
    key: "apple",
    label: "Mit Apple fortfahren",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.2-1.2 3-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.5-1-2.5-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>',
  },
  {
    key: "linkedin_oidc",
    provider: "linkedin_oidc",
    label: "Mit LinkedIn fortfahren",
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0A66C2" d="M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6zM8 19H5V9.5h3V19zM6.5 8.2c-1 0-1.7-.8-1.7-1.7s.8-1.7 1.7-1.7 1.7.8 1.7 1.7-.7 1.7-1.7 1.7zM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5S12.8 13 12.8 14.3V19h-3V9.5h2.8v1.3h.1c.4-.7 1.4-1.5 2.8-1.5 3 0 3.5 2 3.5 4.5V19z"/></svg>',
  },
];

// Welche Anmeldewege sind in Supabase eingeschaltet?
async function authSettings() {
  try {
    const res = await fetch(window.XYNTAL_CONFIG.supabaseUrl + "/auth/v1/settings", {
      headers: { apikey: window.XYNTAL_CONFIG.supabaseKey },
    });
    return (await res.json()).external || {};
  } catch {
    return {};
  }
}

// "0171 1234567" -> "+491711234567"
function normalizePhone(p) {
  let n = (p || "").replace(/[\s\-/()]/g, "");
  if (n.startsWith("00")) n = "+" + n.slice(2);
  else if (n.startsWith("0")) n = "+49" + n.slice(1);
  return n;
}

// Rendert Google/Apple/LinkedIn-Buttons und den SMS-Code-Ablauf in `container`.
// checkConsent(): wirft einen Fehler, wenn die Einwilligung fehlt.
async function renderAuthOptions(container, { statusEl, redirectPath, checkConsent = () => {} }) {
  const enabled = await authSettings();
  const providers = OAUTH_PROVIDERS.filter((p) => enabled[p.key]);
  const phone = !!enabled.phone;
  if (!providers.length && !phone) return false;

  container.innerHTML = `
    ${providers.map((p) => `<button type="button" class="oauth-btn" data-provider="${p.provider || p.key}">${p.icon}<span>${p.label}</span></button>`).join("")}
    ${phone ? `
      <div class="phone-login">
        <div class="phone-step" data-step="number">
          <label>Mit Handynummer <span class="hint">Du bekommst einen Code per SMS.</span>
            <input type="tel" name="phone" autocomplete="tel" placeholder="0171 1234567">
          </label>
          <button type="button" class="btn btn-ghost" data-action="send-code">Code senden</button>
        </div>
        <div class="phone-step" data-step="code" hidden>
          <label>Code aus der SMS
            <input type="text" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="123456">
          </label>
          <button type="button" class="btn" data-action="verify-code">Bestätigen</button>
          <a href="#" class="text-link" data-action="change-number" style="font-size: 0.9rem">Andere Nummer</a>
        </div>
      </div>` : ""}
  `;
  container.hidden = false;

  const fail = (err) => setStatus(statusEl, friendlyError(err), "error");
  const redirectTo = new URL(redirectPath, location.href).href;

  container.querySelectorAll("[data-provider]").forEach((btn) => btn.addEventListener("click", async () => {
    try {
      checkConsent();
      setStatus(statusEl, "Du wirst weitergeleitet …");
      unwrap(await sb.auth.signInWithOAuth({ provider: btn.dataset.provider, options: { redirectTo } }));
    } catch (err) { fail(err); }
  }));

  if (phone) {
    const numberStep = container.querySelector('[data-step="number"]');
    const codeStep = container.querySelector('[data-step="code"]');
    const phoneInput = container.querySelector('input[name="phone"]');
    const otpInput = container.querySelector('input[name="otp"]');
    let number = "";

    container.querySelector('[data-action="send-code"]').addEventListener("click", async (e) => {
      try {
        checkConsent();
        number = normalizePhone(phoneInput.value);
        if (!/^\+\d{8,15}$/.test(number)) throw new Error("Bitte gib eine gültige Handynummer ein, z. B. 0171 1234567.");
        e.target.disabled = true;
        setStatus(statusEl, "Code wird gesendet …");
        unwrap(await sb.auth.signInWithOtp({ phone: number }));
        numberStep.hidden = true;
        codeStep.hidden = false;
        otpInput.focus();
        setStatus(statusEl, `Wir haben dir einen Code an ${number} geschickt.`, "ok");
      } catch (err) { fail(err); } finally { e.target.disabled = false; }
    });

    container.querySelector('[data-action="verify-code"]').addEventListener("click", async (e) => {
      try {
        const token = otpInput.value.replace(/\s/g, "");
        if (!/^\d{4,8}$/.test(token)) throw new Error("Bitte gib den Code aus der SMS ein.");
        e.target.disabled = true;
        setStatus(statusEl, "Einen Moment …");
        unwrap(await sb.auth.verifyOtp({ phone: number, token, type: "sms" }));
        location.href = redirectPath;
      } catch (err) { fail(err); } finally { e.target.disabled = false; }
    });

    container.querySelector('[data-action="change-number"]').addEventListener("click", (e) => {
      e.preventDefault();
      codeStep.hidden = true;
      numberStep.hidden = false;
      setStatus(statusEl, "");
    });
  }
  return true;
}

// ---------- Community: gemeinsame Helfer ----------

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? "gestern" : `vor ${d} Tagen`; }
  return new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
}

// Text sicher ausgeben, Zeilenumbrüche und Links erhalten
function richText(s) {
  return esc(s)
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener nofollow">$1</a>')
    .replace(/\n/g, "<br>");
}

// Jede Person bekommt einen festen Farbverlauf (wie in der App)
function avatarTone(name) {
  let h = 0;
  for (const c of String(name || "")) h = (h * 31 + c.codePointAt(0)) >>> 0;
  return "av-" + ((h % 6) + 1);
}

function avatar(name, cls = "", path = "") {
  const safePath = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path || "") ? path : "";
  return `<div class="avatar ${avatarTone(name)} ${esc(cls)}" ${safePath ? `data-avatar-path="${esc(safePath)}"` : ""} aria-hidden="true"><span>${esc(initials(name))}</span></div>`;
}

// Wer schaut gerade? { me, isMember, isAdmin }
async function viewer() {
  const me = await currentMember();
  return { me, isMember: !!me && me.status === "approved", isAdmin: !!me && me.is_admin };
}

// Hinweisbox für Gäste und nicht freigeschaltete Mitglieder
function accessNotice(v, what) {
  if (v.isMember) return "";
  if (v.me) {
    return `<div class="notice">Dein Profil wartet noch auf Freigabe. Danach kannst du ${what} und siehst alle Inhalte.</div>`;
  }
  return `<div class="notice">Du siehst hier, was Mitglieder öffentlich geteilt haben. <a class="text-link" href="mitglied-werden">Werde Mitglied</a> oder <a class="text-link" href="login">logg dich ein</a>, um ${what} und alles zu sehen.</div>`;
}

// Navigation: Link zu Nachrichten mit Zähler ungelesener Nachrichten
(async () => {
  const link = document.querySelector("[data-messages]");
  if (!link) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  link.hidden = false;
  const { count } = await sb.from("messages").select("id", { count: "exact", head: true })
    .eq("recipient_id", session.user.id).is("read_at", null);
  if (count) link.innerHTML = `Nachrichten <span class="badge">${count}</span>`;
})();

// Handy-Menü in der Kopfzeile
(() => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("main-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
    toggle.textContent = open ? "Schließen" : "Menü";
  });
})();

// Navigation: aktuelle Seite markieren (wie der aktive Eintrag in der App-Seitenleiste)
(() => {
  const page = location.pathname.replace(/\.html$/, "").split("/").filter(Boolean).pop() || "";
  document.querySelectorAll("#main-nav a").forEach((a) => {
    const href = (a.getAttribute("href") || "").split(/[?#]/)[0];
    if (href && href !== "./" && href === page) a.setAttribute("aria-current", "page");
  });
})();
