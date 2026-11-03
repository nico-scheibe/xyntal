// Matching auf der Website – über denselben App-Server wie die Desktop-App (api.xyntal.de).
// Die Matching-Angaben (Ziele, Interessen, Sprachen, Zeitzone, Tech-Stack, Verfügbarkeit,
// Arbeitsstil-Test) liegen nur dort; die Website liest und schreibt sie über die API.
// Anmeldung: Die Supabase-Sitzung der Website wird einmal gegen eine App-Sitzung getauscht
// (POST /auth/supabase). Ohne App-Konto legt der Server eines an bzw. übernimmt die
// Platzhalter-Person, die die Brücke für die Xyntal-Karte angelegt hat.
// Läuft auch auf Seiten ohne Supabase-Bibliothek (z. B. xyntal.de/name).
(() => {
  const CFG = window.XYNTAL_CONFIG || {};
  const API = CFG.appApiUrl || "https://api.xyntal.de";
  const STORE = "xyntal-app-session";
  const SB_TOKEN = (() => {
    try { return `sb-${new URL(CFG.supabaseUrl || "https://rralgrlujoupprwlvoyo.supabase.co").hostname.split(".")[0]}-auth-token`; }
    catch { return "sb-rralgrlujoupprwlvoyo-auth-token"; }
  })();
  const lang = () => (window.XyntalI18n ? window.XyntalI18n.get() : document.documentElement.lang === "en" ? "en" : "de");
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  class ApiError extends Error {
    constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
  }

  // ---------- Sitzungen ----------
  function read(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
  function forget() {
    const cached = read(STORE);
    try { localStorage.removeItem(STORE); } catch { /* privat */ }
    // Die App-Sitzung auf dem Server beenden (taucht sonst bis zum Ablauf unter „Geräte“ auf)
    if (cached && cached.token) {
      fetch(API + "/auth/logout", { method: "POST", keepalive: true, headers: { authorization: `Bearer ${cached.token}` } }).catch(() => {});
    }
  }

  // Die Supabase-Sitzung der Website: über die Bibliothek (frischt abgelaufene Tokens auf),
  // sonst direkt aus dem Speicher, solange sie noch gilt.
  async function websiteSession() {
    if (typeof sb !== "undefined" && sb) {
      const { data: { session } } = await sb.auth.getSession();
      return session ? { id: session.user.id, token: session.access_token } : null;
    }
    const raw = read(SB_TOKEN);
    if (!raw || !raw.access_token || !raw.user) return null;
    if (raw.expires_at && raw.expires_at * 1000 < Date.now() + 30000) return { id: raw.user.id, token: "" };
    return { id: raw.user.id, token: raw.access_token };
  }

  let exchanging = null;
  // `silent`: nichts nachfragen (kein 2FA-Dialog) – für Hintergrundaufrufe wie das
  // Ankündigungs-Banner, die lieber still scheitern als eine Seite zu unterbrechen.
  async function session({ fresh = false, silent = false } = {}) {
    const site = await websiteSession();
    if (!site) { forget(); throw new ApiError(401, "SIGNED_OUT", t("Bitte logg dich ein.")); }
    const cached = read(STORE);
    if (!fresh && cached && cached.sb === site.id && cached.token && Date.parse(cached.expiresAt) > Date.now() + 60000) return cached;
    if (cached && cached.sb !== site.id) forget();
    if (!site.token) throw new ApiError(401, "SIGNED_OUT", t("Deine Sitzung ist abgelaufen. Bitte logg dich neu ein."));
    if (!exchanging) exchanging = exchange(site, "", silent).finally(() => { exchanging = null; });
    return exchanging;
  }

  async function exchange(site, code = "", silent = false) {
    const res = await raw("POST", "/auth/supabase", { body: { accessToken: site.token, deviceName: "xyntal.de", code } });
    if (res.ok) {
      const s = { sb: site.id, userId: res.data.user.id, token: res.data.token, expiresAt: res.data.expiresAt };
      try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* ohne Speicher: pro Seite neu */ }
      return s;
    }
    if (res.code === "TWOFA_REQUIRED" || res.code === "TWOFA_INVALID") {
      if (silent) throw new ApiError(401, "TWOFA_REQUIRED", t("Dein Xyntal-App-Konto ist mit Zwei-Faktor-Anmeldung geschützt."));
      const next = await askCode(res.code === "TWOFA_INVALID");
      if (!next) throw new ApiError(401, "TWOFA_CANCELLED", t("Ohne den Code aus deiner Authenticator-App geht es hier nicht weiter."));
      return exchange(site, next, silent);
    }
    if (res.code === "SUPABASE_MFA_REQUIRED" && typeof mfaRedirect === "function") return mfaRedirect();
    throw new ApiError(res.status, res.code, res.message);
  }

  async function raw(method, path, { body, token } = {}) {
    const headers = { accept: "application/json", "accept-language": lang() };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      return { ok: false, status: 0, code: "NETWORK", message: t("Der Matching-Server ist gerade nicht erreichbar. Versuch es gleich noch einmal.") };
    }
    const json = await res.json().catch(() => ({}));
    const error = json.error || {};
    return { ok: res.ok, status: res.status, data: json.data, code: error.code, message: error.message || t("Das hat nicht geklappt. Versuch es gleich noch einmal."), details: error.details };
  }

  // Ein API-Aufruf mit App-Sitzung; eine abgelaufene wird einmal neu getauscht.
  async function api(method, path, body, { silent = false } = {}) {
    let s = await session({ silent });
    let res = await raw(method, path, { body, token: s.token });
    if (res.status === 401 && res.code === "UNAUTHENTICATED") {
      try { localStorage.removeItem(STORE); } catch { /* egal */ }
      s = await session({ fresh: true, silent });
      res = await raw(method, path, { body, token: s.token });
    }
    if (!res.ok) throw new ApiError(res.status, res.code, res.message, res.details);
    return res.data;
  }

  // Datei hochladen, in Stücken (POST /files/uploads, PUT je Stück, POST …/complete).
  // So gilt das Tarif-Limit pro Datei statt der Grenze einer einzelnen Anfrage;
  // eine zu große Datei lehnt der Server ab, bevor ein Byte übertragen ist.
  async function upload(file, { name = file.name, meta = {}, onProgress } = {}) {
    const start = await api("POST", "/files/uploads", { ...meta, name, mimeType: file.type || "application/octet-stream", size: file.size });
    const { id, chunkSize } = start.upload;
    try {
      for (let offset = 0, index = 0; offset < file.size; offset += chunkSize, index++) {
        const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
        let s = await session();
        let res;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            res = await fetch(`${API}/files/uploads/${encodeURIComponent(id)}/chunks/${index}`, {
              method: "PUT", body: chunk,
              headers: { accept: "application/json", "content-type": "application/octet-stream", authorization: `Bearer ${s.token}` },
            });
          } catch { res = null; }
          if (res && res.status !== 401) break;
          if (res && res.status === 401) s = await session({ fresh: true });
        }
        if (!res) throw new ApiError(0, "NETWORK", t("Der Matching-Server ist gerade nicht erreichbar. Versuch es gleich noch einmal."));
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(res.status, json.error?.code, json.error?.message || t("Das hat nicht geklappt. Versuch es gleich noch einmal."));
        if (onProgress) onProgress(Math.min(offset + chunkSize, file.size), file.size);
      }
      return await api("POST", `/files/uploads/${encodeURIComponent(id)}/complete`, {});
    } catch (err) {
      api("DELETE", `/files/uploads/${encodeURIComponent(id)}`, undefined, { silent: true }).catch(() => {});
      throw err;
    }
  }

  // Das eigene App-Konto (id, Name, Handle, Rolle, Staff-Rolle, Tarif) – z. B. für den Admin-Bereich.
  async function me(options) {
    return (await api("GET", "/auth/me", undefined, options)).user;
  }

  // App-2FA: Wer in der App die Zwei-Faktor-Anmeldung eingeschaltet hat, bestätigt hier einmal mit dem Code.
  function askCode(wrong) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "xm-dialog";
      dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
        <h2>${esc(t("Code aus deiner Authenticator-App"))}</h2>
        <p>${esc(t("Dein Xyntal-App-Konto ist mit Zwei-Faktor-Anmeldung geschützt. Gib den 6-stelligen Code ein, um dein Matching hier zu nutzen."))}</p>
        ${wrong ? `<p class="xm-error">${esc(t("Dieser Code stimmt nicht. Versuch es noch einmal."))}</p>` : ""}
        <label>${esc(t("Code"))}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" required></label>
        <div class="xm-row"><button class="btn btn-small" value="ok">${esc(t("Bestätigen"))}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>${esc(t("Abbrechen"))}</button></div>
      </form>`;
      document.body.append(dlg);
      dlg.addEventListener("close", () => {
        const code = dlg.returnValue === "ok" ? (dlg.querySelector("input").value || "").replace(/\s/g, "") : "";
        dlg.remove();
        resolve(code || null);
      });
      dlg.showModal();
    });
  }

  if (typeof sb !== "undefined" && sb) {
    sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") forget(); });
  }

  // ---------- Angaben und Auswahl wie im Profil-Editor der App ----------
  // Gespeichert wird (wie in der App) der englische Wert, damit deutsch- und englischsprachige
  // Mitglieder zueinander passen; angezeigt wird die deutsche Bezeichnung.
  const TAGS = {
    skills: {
      label: "Skills", add: "Skill hinzufügen", max: 20,
      options: { "Qt": "", "QML": "", "C++": "", "TypeScript": "", "JavaScript": "", "Python": "", "Rust": "", "Go": "", "React": "", "Node.js": "",
        "Product": "Produkt", "Design": "", "UI/UX": "", "Marketing": "", "Sales": "Vertrieb", "Data": "Daten", "DevOps": "", "AI/ML": "KI/ML",
        "Fundraising": "", "Strategy": "Strategie", "Mobile": "", "Backend": "", "Frontend": "" },
    },
    techStack: {
      label: "Tech-Stack", add: "Technologie hinzufügen", max: 20,
      options: { "Qt 6": "", "React": "", "Next.js": "", "Node.js": "", "Fastify": "", "PostgreSQL": "", "SQLite": "", "Docker": "", "Kubernetes": "",
        "AWS": "", "Azure": "", "Figma": "", "TensorFlow": "", "PyTorch": "", "Unity": "", "Swift": "", "Kotlin": "", "Flutter": "", ".NET": "", "Tailwind": "" },
    },
    interests: {
      label: "Interessen", add: "Interesse hinzufügen", max: 20,
      options: { "Developer Tools": "Entwickler-Tools", "AI": "KI", "Robotics": "Robotik", "Fintech": "", "Health": "Gesundheit", "Climate": "Klima",
        "Gaming": "", "Education": "Bildung", "E-commerce": "", "Open Source": "", "Hardware": "", "SaaS": "", "Productivity": "Produktivität",
        "Security": "Sicherheit", "Creator Economy": "" },
    },
    goals: {
      label: "Ziele – was du suchst", add: "Ziel hinzufügen", max: 8,
      options: { "Find a cofounder": "Mitgründer:in finden", "Join a startup": "Bei einem Startup einsteigen", "Hire builders": "Leute fürs Team finden",
        "Find a mentor": "Mentor:in finden", "Mentor others": "Mentoring geben", "Find collaborators": "Mitstreiter:innen finden",
        "Raise funding": "Finanzierung finden", "Learn & grow": "Lernen & wachsen", "Ship a side project": "Nebenprojekt fertigstellen",
        "Freelance work": "Freelance-Aufträge" },
    },
    languages: {
      label: "Sprachen", add: "Sprache hinzufügen", max: 12,
      options: { "English": "Englisch", "German": "Deutsch", "French": "Französisch", "Spanish": "Spanisch", "Portuguese": "Portugiesisch",
        "Italian": "Italienisch", "Dutch": "Niederländisch", "Polish": "Polnisch", "Turkish": "Türkisch", "Arabic": "Arabisch", "Hindi": "",
        "Mandarin": "Mandarin", "Japanese": "Japanisch", "Korean": "Koreanisch" },
    },
  };
  // Weitere bekannte Werte (Vokabular des Servers), damit z. B. „Russisch“ als „Russian“ gespeichert wird.
  const EXTRA = {
    languages: { "Russian": "Russisch", "Ukrainian": "Ukrainisch", "Chinese": "Chinesisch", "Swedish": "Schwedisch", "Danish": "Dänisch",
      "Norwegian": "Norwegisch", "Finnish": "Finnisch", "Czech": "Tschechisch", "Greek": "Griechisch", "Romanian": "Rumänisch",
      "Hungarian": "Ungarisch", "Croatian": "Kroatisch", "Serbian": "Serbisch", "Persian": "Persisch", "Vietnamese": "Vietnamesisch" },
    interests: { "Artificial Intelligence": "Künstliche Intelligenz", "Climate Tech": "Klimatechnologie", "Sustainability": "Nachhaltigkeit",
      "Health Tech": "Gesundheitstechnologie", "Mobility": "Mobilität", "Energy": "Energie", "Agriculture": "Landwirtschaft", "Crafts": "Handwerk",
      "Music": "Musik", "Media": "Medien", "Social Impact": "Soziales", "Space": "Raumfahrt", "Travel": "Reisen", "Food": "Essen & Ernährung",
      "Sports": "Sport", "Real Estate": "Immobilien", "Public Sector": "Öffentlicher Sektor" },
    goals: { "Find a co-founder": "Mitgründer:in finden", "Join a team": "Einem Team beitreten", "Build a team": "Ein Team aufbauen",
      "Start a company": "Startup gründen", "Build an MVP": "MVP bauen", "Side project": "Nebenprojekt", "Find customers": "Kunden finden",
      "Find investors": "Investoren finden", "Learn": "Lernen", "Networking": "Netzwerken", "Validate an idea": "Idee validieren" },
    skills: { "Software Development": "Softwareentwicklung", "Product Management": "Produktmanagement", "UX Design": "UX-Design",
      "Graphic Design": "Grafikdesign", "Business Development": "Geschäftsentwicklung", "Project Management": "Projektmanagement" },
  };
  const germanOf = (kind, value) => (TAGS[kind].options[value] || (EXTRA[kind] || {})[value] || "");
  const tagLabel = (kind, value) => (lang() === "en" ? value : germanOf(kind, value) || value);
  // Eingabe (deutsch oder englisch, beliebige Schreibweise) → gespeicherter Wert
  function canonicalTag(kind, input) {
    const v = String(input || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const key = v.toLowerCase();
    for (const map of [TAGS[kind].options, EXTRA[kind] || {}]) {
      for (const [en, de] of Object.entries(map)) if (en.toLowerCase() === key || (de && de.toLowerCase() === key)) return en;
    }
    return v;
  }

  const AVAILABILITY = [["", "Nicht gesetzt"], ["open", "Offen für Zusammenarbeit"], ["limited", "Begrenzt"], ["busy", "Fokussiert"]];
  const INTENT = [["", "Nicht gesetzt"], ["cofounder", "Mitgründer:in"], ["teammate", "Team beitreten"], ["contribute", "An Projekten mitwirken"],
    ["mentor", "Andere mentorieren"], ["mentee", "Mentor finden"], ["community", "Community & Netzwerk"], ["shortterm", "Kurzfristige Hilfe"],
    ["longterm", "Langfristiger Partner"]];
  const HOURS = [[0, "Nicht gesetzt"], [4, "< 5 Std."], [8, "5–10 Std."], [15, "10–20 Std."], [25, "20–30 Std."], [35, "30+ Std."]];
  const VISIBILITY = [["public", "Öffentlich", "Alle Builder auf Xyntal"], ["team", "Nur Team", "Leute, die einen Arbeitsbereich mit dir teilen"], ["private", "Privat", "Nur du"]];
  // Bezeichnungen, die im allgemeinen Wörterbuch (i18n-en.js) anders übersetzt sind
  const EN_LABELS = { "Mitgründer:in": "Co-founder" };
  const label = (de) => (lang() === "en" && EN_LABELS[de]) || t(de);
  const WORK_TYPES = { D: "Treiber", I: "Connector", S: "Anker", G: "Architekt" };
  const WORK_DIMS = [["d", "Antrieb"], ["i", "Einfluss"], ["s", "Beständigkeit"], ["g", "Struktur"]];
  const DISMISS = [["NOT_RELEVANT", "Nicht relevant"], ["WRONG_SKILLS", "Falsche Skills"], ["WRONG_GOAL", "Anderes Ziel"],
    ["NOT_INTERESTED", "Kein Interesse"], ["ALREADY_KNOWN", "Kenne ich schon"], ["LOW_TRUST", "Wenig Vertrauen"], ["OTHER", "Anderes …"]];

  // ---------- Darstellung eines Matches (Für dich und Mitgliederseiten) ----------
  // Texte vom Server kommen schon in der gewählten Sprache (Accept-Language) und werden
  // deshalb nicht noch einmal übersetzt (data-no-i18n).
  const tone = (n) => (n >= 75 ? "high" : n >= 50 ? "mid" : "low");
  function scoreRing(n, cls = "") {
    const v = Math.max(0, Math.min(100, Math.round(n || 0)));
    return `<span class="xm-score xm-${tone(v)} ${cls}" style="--v:${v}" role="img" aria-label="${esc(t("Passung"))} ${v} %"><b data-no-i18n>${v}</b><small>%</small></span>`;
  }
  function explanationHtml(m) {
    const dims = (m.dimensions || []).filter((d) => d.applicable).sort((a, b) => b.weight - a.weight || b.score - a.score);
    const signals = (list, kind) => (list || []).map((s) =>
      `<li class="xm-signal xm-${kind}"><b data-no-i18n>${esc(s.label)}</b>${s.detail ? ` <span data-no-i18n>${esc(s.detail)}</span>` : ""}<em data-no-i18n>${s.delta > 0 ? "+" : ""}${esc(s.delta)}</em></li>`).join("");
    return `
      ${m.explanation && m.explanation.summary ? `<p class="xm-summary" data-no-i18n>${esc(m.explanation.summary)}</p>` : ""}
      ${m.lowData ? `<p class="xm-hint">${esc(t("Noch wenige Angaben – je mehr ihr beide ausfüllt, desto genauer wird die Passung."))}</p>` : ""}
      <div class="xm-dims">${dims.map((d) => `
        <div class="xm-dim">
          <div class="xm-dim-head"><span data-no-i18n>${esc(d.label)}</span><b data-no-i18n>${Math.round(d.score)}</b></div>
          <span class="xm-bar"><i class="xm-${tone(d.score)}" style="width:${Math.max(3, Math.min(100, d.score))}%"></i></span>
          ${d.detail ? `<p data-no-i18n>${esc(d.detail)}</p>` : ""}
          ${d.about ? `<p class="xm-about" data-no-i18n>${esc(d.about)}</p>` : ""}
        </div>`).join("")}</div>
      ${(m.boosts || []).length || (m.penalties || []).length ? `<ul class="xm-signals">${signals(m.boosts, "boost")}${signals(m.penalties, "penalty")}</ul>` : ""}
      ${(m.riskFactors || []).length ? `<p class="xm-hint">${esc(t("Achte auf:"))} <span data-no-i18n>${esc(m.riskFactors.join(" · "))}</span></p>` : ""}
      <p class="xm-hint"><a class="text-link" href="/matching">${esc(t("So berechnen wir die Passung"))}</a></p>`;
  }
  // „Passt nicht“ mit Grund – wie der Dialog in der App
  function askDismissReason() {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "xm-dialog";
      dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
        <h2>${esc(t("Warum passt es nicht?"))}</h2>
        <p>${esc(t("Hilft, deine Vorschläge zu verbessern. Ähnliche Profile rücken etwas nach hinten."))}</p>
        <div class="xm-chips">${DISMISS.map(([k, l]) => `<button type="button" class="xm-chip" data-reason="${k}">${esc(t(l))}</button>`).join("")}</div>
        <label data-note hidden>${esc(t("Was passt nicht?"))}<input name="note" maxlength="200"></label>
        <div class="xm-row"><button class="btn btn-small" value="ok" data-ok hidden>${esc(t("Ausblenden"))}</button><button class="btn btn-small btn-ghost" value="skip">${esc(t("Ohne Grund ausblenden"))}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>${esc(t("Abbrechen"))}</button></div>
      </form>`;
      document.body.append(dlg);
      let reason = null;
      dlg.addEventListener("click", (e) => {
        const b = e.target.closest("[data-reason]");
        if (!b) return;
        reason = b.dataset.reason;
        if (reason === "OTHER") {
          dlg.querySelector("[data-note]").hidden = false;
          dlg.querySelector("[data-ok]").hidden = false;
          dlg.querySelector("input").focus();
          return;
        }
        dlg.close("ok");
      });
      dlg.addEventListener("close", () => {
        const v = dlg.returnValue;
        const note = (dlg.querySelector("input").value || "").trim();
        dlg.remove();
        resolve(v === "ok" ? { reason, note } : v === "skip" ? { reason: null, note: "" } : null);
      });
      dlg.showModal();
    });
  }
  async function record(targetId, action, extra = {}) {
    return api("POST", "/matches/interactions", { targetType: "user", targetId, action, ...extra });
  }

  window.XyntalApp = {
    API, ApiError, api, upload, me, session, forget, esc, t,
    TAGS, tagLabel, canonicalTag, label, AVAILABILITY, INTENT, HOURS, VISIBILITY, WORK_TYPES, WORK_DIMS,
    scoreRing, explanationHtml, askDismissReason, record,
  };
})();
