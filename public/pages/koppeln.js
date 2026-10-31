// /koppeln – die Desktop-App zeigt einen QR-Code mit diesem Link (#<id>) und eine
// zweistellige Zahl. Hier bestätigst du mit deinem eingeloggten Konto, indem du
// dieselbe Zahl antippst; der App-Server gibt der App dann eine Sitzung.
// Eine falsche Zahl bricht die Anfrage ab (Schutz vor fremden QR-Codes).
const API = (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
const KEY = "xyntal-pair";
const card = document.getElementById("pair");
const status = document.getElementById("status");
const numbers = document.getElementById("pair-numbers");
const codeForm = document.getElementById("pair-code");
let pairId = "", choice = null;

function show(step) {
  for (const el of card.querySelectorAll(".pair-step")) el.hidden = el.dataset.step !== step;
  card.classList.toggle("is-done", step === "done");
  setStatus(status, "");
  if (step !== "loading") card.scrollIntoView({ block: "center", behavior: "smooth" });
}

function gone(title, text) {
  try { sessionStorage.removeItem(KEY); } catch {}
  if (title) document.getElementById("pair-gone-title").textContent = title;
  if (text) document.getElementById("pair-gone-text").textContent = text;
  show("gone");
}

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json.data, error: json.error || {} };
}

async function approve(code) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.replace("login?next=koppeln");
  for (const b of numbers.querySelectorAll("button")) b.disabled = true;
  const r = await call("POST", `/auth/pair/${encodeURIComponent(pairId)}/approve`, {
    accessToken: session.access_token, choice, code: code || "",
  });
  if (r.ok) {
    try { sessionStorage.removeItem(KEY); } catch {}
    return show("done");
  }
  for (const b of numbers.querySelectorAll("button")) b.disabled = false;
  switch (r.error.code) {
    case "PAIR_MISMATCH":
      return gone("Das war nicht die Zahl aus der App",
        "Zur Sicherheit wurde die Anfrage abgebrochen. Tippe in der App auf „Neuen Code anzeigen“ und scanne ihn noch einmal.");
    case "PAIR_EXPIRED":
      return gone();
    case "TWOFA_REQUIRED":
      show("code");
      return codeForm.elements.code.focus();
    case "TWOFA_INVALID":
      show("code");
      return setStatus(status, "Dieser Code stimmt nicht. Versuch es noch einmal.", "error");
    case "SUPABASE_MFA_REQUIRED":
      return mfaRedirect();
    case "ACCOUNT_BANNED":
      return gone("Konto gesperrt", "Dieses Konto ist gesperrt und kann keine App anmelden.");
    default:
      return setStatus(status, r.error.message || "Das hat nicht geklappt. Versuch es gleich noch einmal.", "error");
  }
}

codeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = (codeForm.elements.code.value || "").replace(/\s/g, "");
  if (code.length < 6) return setStatus(status, "Bitte gib den 6-stelligen Code ein.", "error");
  approve(code);
});

document.getElementById("pair-deny").addEventListener("click", async () => {
  await call("POST", `/auth/pair/${encodeURIComponent(pairId)}/deny`).catch(() => {});
  gone("Abgebrochen", "Die Anfrage wurde abgelehnt. Wenn dir jemand einen Code geschickt hat: Das ist ein Versuch, dein Konto zu übernehmen.");
});

(async () => {
  // Die ID steht im Link (#…). Für den Umweg über den Login merken wir sie uns.
  const fromLink = location.hash.slice(1);
  if (fromLink) {
    try { sessionStorage.setItem(KEY, fromLink); } catch {}
    history.replaceState(null, "", location.pathname);
  }
  try { pairId = fromLink || sessionStorage.getItem(KEY) || ""; } catch { pairId = fromLink; }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(pairId)) {
    return gone("Kein Code gefunden", "Öffne in der Xyntal-App „Mit dem Handy anmelden“ und scanne den QR-Code mit der Kamera.");
  }
  if (!sb) return setStatus(status, "Die Anmeldung ist gerade nicht erreichbar.", "error");
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return location.replace("login?next=koppeln");
  if (await mfaPending()) return mfaRedirect();

  const r = await call("GET", `/auth/pair/${encodeURIComponent(pairId)}`).catch(() => null);
  if (!r) return setStatus(status, "Der Xyntal-Server ist gerade nicht erreichbar. Versuch es gleich noch einmal.", "error");
  if (!r.ok) return gone();
  // "MacBook Air von Nico (macOS Tahoe (26.6))" → Name als Überschrift, System darunter
  const device = (r.data.deviceName || "Xyntal").match(/^(.*?) \((.*)\)$/);
  document.getElementById("pair-device").textContent = device ? device[1] : (r.data.deviceName || "Xyntal");
  document.getElementById("pair-system").textContent = device ? device[2] : "";
  document.getElementById("pair-email").textContent = session.user.email || "";
  numbers.innerHTML = "";
  for (const n of r.data.choices) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pair-num";
    b.textContent = n;
    b.setAttribute("aria-label", `Zahl ${n}`);
    b.addEventListener("click", () => { choice = n; approve(""); });
    numbers.append(b);
  }
  show("choose");
})();
