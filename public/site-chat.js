// Xyntal-Assistent: kleiner Chat unten rechts auf der Website (Spezifikation A–D, L in XYNTAL-KI-SPEZIFIKATION.md).
// Die Antworten kommen von der KI des App-Servers (POST /site/chat, ohne Konto). Der Verlauf bleibt nur in
// diesem Tab (sessionStorage); an den Server gehen die letzten 12 Nachrichten ohne Fehlerblasen.
(() => {
  // In eingebetteten Seiten (z. B. Karten-Editor im Profil) zeigt schon die äußere Seite den Assistenten
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; }
  if (framed || window.__xyntalSiteChat || document.body.classList.contains("page-admin")) return;
  window.__xyntalSiteChat = true;

  const api = () => (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const KEY = "xyntal-site-chat-v2";
  const MAX = 800; // Grenze des Servers pro Nachricht (inkl. Anhang)
  const TIMEOUT = 30000;
  const en = () => window.XyntalI18n?.get?.() === "en";
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Verlauf: { id, role: "user", text, att? } | { id, role: "assistant", versions: [{ text, plan, aborted }], v, fb?, fbReason? }
  // Fehler: { id, role: "assistant", error: "offline" | "down" | "rate" | "daily" | "blocked", reason?, until?, retry }
  let msgs = [];
  try { msgs = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { msgs = []; }
  if (!Array.isArray(msgs)) msgs = [];
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-300))); } catch { /* privat */ } };

  let busy = false, run = null, streamId = null;
  let confirmPII = null, confirmClear = false, editId = null, fbOpen = null, att = null, attErr = "", listening = null, speakingId = null;

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "/site-chat.css?v=7";
  document.head.append(css);

  const root = document.createElement("div");
  root.className = "sc";
  root.setAttribute("data-no-i18n", "");
  document.body.append(root);
  const $ = (s) => root.querySelector(s);

  // ---- Links (D14): nur echte Seiten der Website, die Support-Adresse und der App Store; alles andere fliegt raus.
  const PAGES = new Set(["agb", "app", "app-anmeldung", "arbeitsstil", "beta", "boerse", "community", "community-richtlinien", "datenschutz", "demo", "fuer-dich", "impressum", "invite", "koppeln", "kuendigen", "login", "matching", "meine-karte", "meine-seite", "mitglied-werden", "mitglieder", "nachrichten", "partner", "preise", "profil", "projekte", "tarif", "ueber-uns", "unternehmen", "widerruf"]);
  const pageOk = (path) => { const p = path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, "").replace(/\.html$/, ""); return p === "" || PAGES.has(p); };
  function safeHref(url) {
    if (url.startsWith("/")) return pageOk(url) ? url : null;
    if (/^mailto:admin@xyntal\.com$/i.test(url)) return url;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:") return null;
      if (/^(www\.)?xyntal\.(de|com)$/i.test(u.hostname)) return pageOk(u.pathname) ? u.pathname + u.hash : null;
      if (u.hostname === "apps.apple.com" && /xyntal/i.test(u.pathname)) return u.href;
    } catch { /* kein Link */ }
    return null;
  }
  const anchor = (h, t) => `<a href="${esc(h)}"${h.startsWith("http") ? ' target="_blank" rel="noopener noreferrer"' : ""}>${esc(t)}</a>`;
  const TOK = /\[([^\]\n]{1,120})\]\(([^)\s]{1,300})\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?“"'])|(^|[\s(„"])(\/[a-z0-9-]+(?:\.html)?(?:#[a-z0-9-]+)?)(?=[\s).,;:!?“"]|$)|\b(admin@xyntal\.com)\b|\*\*([^*\n]+)\*\*|`([^`\n]+)`/gi;
  function inline(raw) {
    let out = "", last = 0;
    for (const m of raw.matchAll(TOK)) {
      out += esc(raw.slice(last, m.index)); last = m.index + m[0].length;
      const [, lt, lu, url, pre, path, mail, bold, code] = m;
      if (lt !== undefined) { const h = safeHref(lu); out += h ? anchor(h, lt) : esc(lt); }
      else if (url !== undefined) { const h = safeHref(url); out += h ? anchor(h, url.replace(/^https:\/\/(www\.)?/, "")) : ""; }
      else if (path !== undefined) { const h = safeHref(path); out += esc(pre) + (h ? anchor(h, path) : esc(path)); }
      else if (mail !== undefined) out += anchor("mailto:" + mail, mail);
      else if (bold !== undefined) out += `<b>${esc(bold)}</b>`;
      else if (code !== undefined) out += `<code>${esc(code)}</code>`;
    }
    return out + esc(raw.slice(last));
  }
  // Kleines Markdown: Absätze, Listen, Tabellen, Überschriften. Alles wird escaped – <script> bleibt Text.
  function md(text) {
    const lines = String(text).replace(/\r/g, "").split("\n");
    const out = [];
    let para = [];
    const flush = () => { if (para.length) out.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*\|.*\|\s*$/.test(l)) {
        flush();
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
        i--;
        const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map(cells);
        const [head, ...rest] = body;
        out.push(`<div class="sc-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      } else if (/^\s*([-*•]|\d+[.)])\s+/.test(l)) {
        flush();
        const ordered = /^\s*\d/.test(l);
        const items = [];
        while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, "")); i++; }
        i--;
        out.push(`<${ordered ? "ol" : "ul"}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      } else if (/^#{1,4}\s+/.test(l)) { flush(); out.push(`<p><b>${inline(l.replace(/^#+\s+/, ""))}</b></p>`); }
      else if (!l.trim()) flush();
      else para.push(l);
    }
    flush();
    return out.join("");
  }
  const plain = (text) => String(text).replace(/\*\*|`|^#+\s+/gm, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Antwortsprache grob erkennen (fürs Vorlesen, B17)
  function guessLang(t) {
    if (/[؀-ۿ]/.test(t)) return "ar";
    if (/[ğışİŞ]/.test(t)) return "tr";
    if (/[ąęłńśźżĄĘŁŃŚŹŻ]/.test(t)) return "pl";
    if (/[ñ¿¡]/.test(t)) return "es";
    if (/[àâçèêëîïôûœ]/.test(t) && /\b(le|la|les|et|vous|est)\b/i.test(t)) return "fr";
    const de = (t.match(/\b(und|der|die|das|ist|du|nicht|mit|ich|dein)\b/gi) || []).length;
    const eng = (t.match(/\b(the|and|you|is|to|your|with|not|of)\b/gi) || []).length;
    return de || eng ? (de >= eng ? "de" : "en") : (en() ? "en" : "de");
  }

  // Persönliche Daten vor dem Senden erkennen (D11)
  const PII = [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/i, /(?:\+|\b00)\d[\d\s/().-]{7,}\d|\b0\d{2,4}[\s/-]?\d{4,}\b/, /\b(passwort|password|kennwort)\s*[:=]/i];
  const hasPII = (t) => PII.some((r) => r.test(t.replace(/admin@xyntal\.com/gi, "")));

  const PLAN_LINE = { Free: ["Kostenlos, für den Einstieg", "Free, to get started"], Plus: ["Für alle, die jede Woche liefern", "For builders shipping every week"], Pro: ["Für kleine Teams mit KI und Agenten", "For small teams with AI and agents"], Ultra: ["Für Teams, die viel automatisieren", "For teams that automate a lot"], Enterprise: ["Für Firmen, auf Anfrage", "For companies, on request"], "Enterprise+": ["Für große Firmen, auf Anfrage", "For large companies, on request"] };
  const planCard = (id) => `<div class="sc-plan"><span class="sc-mono">${T("Empfehlung", "Recommendation")}</span><b>${esc(id)}</b><small>${esc((PLAN_LINE[id] || ["", ""])[en() ? 1 : 0])}</small><a href="${id.startsWith("Enterprise") ? "mailto:admin@xyntal.com" : "/preise"}">${id.startsWith("Enterprise") ? T("Kontakt aufnehmen", "Get in touch") : T("Mehr ansehen", "Learn more")} →</a></div>`;
  const SUGGEST = () => [
    T("Was ist Xyntal?", "What is Xyntal?"),
    T("Wie funktioniert das Matching?", "How does matching work?"),
    T("Wie komme ich in die Beta?", "How do I get into the beta?"),
    T("Ich habe ein Problem mit meinem Konto", "I have a problem with my account"),
  ];
  const ERR = {
    offline: () => T("Keine Verbindung. Prüf dein Internet und versuch es noch mal.", "No connection. Check your internet and try again."),
    down: () => T("Der Assistent ist gerade nicht erreichbar.", "The assistant isn't available right now."),
    daily: () => T("Für heute sind alle Fragen aufgebraucht. Schreib gern an admin@xyntal.com – ich antworte persönlich.", "That's all questions for today. Feel free to write to admin@xyntal.com."),
    blocked: () => T("Dabei kann ich nicht helfen.", "I can't help with that."),
  };
  const rateText = (m) => { const s = Math.max(0, Math.ceil((m.until - Date.now()) / 1000)); return s > 0 ? T(`Kurz durchatmen – in ${s} Sekunden geht's weiter.`, `Take a breath – back in ${s} seconds.`) : T("Weiter geht's.", "Ready again."); };
  const rateLeft = () => { const r = msgs.findLast?.((m) => m.error === "rate") ?? [...msgs].reverse().find((m) => m.error === "rate"); return r ? r.until - Date.now() : 0; };

  // Bildschirmleser-Ansagen (B18): eigene Statuszeile, damit nicht der ganze Verlauf neu vorgelesen wird
  const announce = (text) => { const s = $(".sc-status"); if (!s) return; s.textContent = ""; setTimeout(() => { s.textContent = text; }, 30); };
  let toastT = 0;
  const toast = (text) => { const t = $(".sc-toast"); if (t) { t.textContent = text; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 1800); } announce(text); };

  // Die Xyntal-Marke: Sechseck mit Auge (atmet, blinzelt; läuft ein Bogen, während der Assistent antwortet).
  const ORB = '<span class="sc-orb" aria-hidden="true"><svg viewBox="0 0 48 48"><polygon class="sc-orb-hex" points="24,3.5 41.8,13.75 41.8,34.25 24,44.5 6.2,34.25 6.2,13.75"/><polygon class="sc-orb-sweep" points="24,3.5 41.8,13.75 41.8,34.25 24,44.5 6.2,34.25 6.2,13.75" pathLength="100"/><ellipse class="sc-orb-eye" cx="24" cy="24" rx="6.5" ry="6.5"/></svg></span>';

  // 3D-Kern im Button und im Chat-Kopf: three.js und der Kern laden erst im Leerlauf. Ohne WebGL, bei reduzierter
  // Bewegung oder wenn das Laden scheitert, bleibt die flache SVG-Marke stehen.
  const cores = { btn: null, head: null };
  let speakTimer = 0, libs = null;
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const loadScript = (src) => new Promise((ok, fail) => { const el = document.createElement("script"); el.src = src; el.onload = ok; el.onerror = fail; document.head.append(el); });
  const loadLibs = () => (libs ||= (async () => {
    if (!window.THREE) await loadScript("/vendor/three.min.js?v=2");
    if (!window.XyntalCore) await loadScript("/xyntal-core.js?v=2");
  })().catch((e) => { libs = null; throw e; }));
  const coreState = () => { const st = busy ? "think" : speakTimer ? "speak" : "idle"; for (const c of Object.values(cores)) c && c.setState(st); };
  const isOpen = () => !$(".sc-panel")?.hidden;
  const coreVisibility = () => { const open = isOpen(); if (cores.btn) cores.btn.setActive(!open); if (cores.head) cores.head.setActive(open); };
  async function mountCore(key) {
    if (cores[key] || reduced()) return;
    const slot = root.querySelector(`[data-core="${key}"]`);
    if (!slot) return;
    try {
      await loadLibs();
      if (cores[key] || !root.contains(slot)) return;
      const canvas = document.createElement("canvas");
      canvas.className = "sc-core-canvas";
      const api3d = window.XyntalCore.mount(canvas);
      if (!api3d) return;
      slot.replaceChildren(canvas); slot.classList.add("is-3d"); cores[key] = api3d;
      coreState(); coreVisibility();
    } catch { /* bleibt bei der SVG-Marke */ }
  }
  const destroyCores = () => { for (const k of Object.keys(cores)) { if (cores[k]) cores[k].destroy(); cores[k] = null; } };
  const whenIdle = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const TTS = "speechSynthesis" in window;
  const ICON = {
    copy: '<path d="M9 9h10v10H9zM5 15V5h10"/>',
    speak: '<path d="M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    regen: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
    up: '<path d="M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2 3l-1 3h6c1 0 2 1 1.7 2l-1.5 6c-.3 1-1 2-2.2 2H7"/>',
    down: '<path d="M7 13V4H4v9zM7 13l4 7c1.5 0 2.5-1 2-3l-1-3h6c1 0 2-1 1.7-2l-1.5-6C18 5 17.3 4 16 4H7"/>',
    clip: '<path d="M20 11.5 12 19.5a5 5 0 0 1-7-7l8-8a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/>',
    mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/>',
    stop: '<rect x="7" y="7" width="10" height="10"/>',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
  const tool = (act, id, label, icon, extra = "") => `<button type="button" class="sc-tool" data-sc="${act}" data-id="${id}" aria-label="${label}" title="${label}"${extra}>${svg(icon)}</button>`;

  function renderShell() {
    const draft = $("#sc-input")?.value || "";
    root.innerHTML = `
      <button type="button" class="sc-open" aria-expanded="false" aria-controls="sc-panel"><span class="sc-core sc-core-btn" data-core="btn">${ORB}</span>${T("Fragen zu Xyntal?", "Questions about Xyntal?")}</button>
      <section class="sc-panel" id="sc-panel" role="dialog" aria-modal="false" aria-labelledby="sc-title" hidden>
        <header class="sc-head"><div class="sc-id"><span class="sc-core" data-core="head">${ORB}</span><div><p class="sc-mono">${T("KI-Assistent · Beta", "AI assistant · beta")}</p><h2 id="sc-title">Xyntal KI</h2></div></div>
          <div class="sc-head-act"><button type="button" class="sc-icon" data-sc="clear" aria-label="${T("Gespräch löschen", "Clear conversation")}" title="${T("Gespräch löschen", "Clear conversation")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button><button type="button" class="sc-icon" data-sc="close" aria-label="${T("Schließen", "Close")}" title="${T("Schließen (Esc)", "Close (Esc)")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div></header>
        <ol class="sc-log" aria-label="${T("Gesprächsverlauf", "Conversation")}"></ol>
        <p class="sc-status sc-sr" role="status" aria-live="polite"></p>
        <p class="sc-toast" role="presentation" hidden></p>
        <div class="sc-drop" hidden>${T("Datei hier ablegen", "Drop file here")}</div>
        <form class="sc-form">
          <div class="sc-att" hidden></div>
          <div class="sc-row">
            <button type="button" class="sc-tool sc-clip" data-sc="attach" aria-label="${T("Datei anhängen", "Attach file")}" title="${T("Datei anhängen", "Attach file")}">${svg("clip")}</button>
            <input type="file" class="sc-file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv" hidden>
            <label class="sc-sr" for="sc-input">${T("Deine Frage", "Your question")}</label>
            <textarea id="sc-input" rows="1" placeholder="${T("Frag etwas zu Xyntal …", "Ask anything about Xyntal …")}" aria-describedby="sc-count"></textarea>
            ${SR ? `<button type="button" class="sc-tool sc-mic" data-sc="mic" aria-pressed="false" aria-label="${T("Spracheingabe", "Voice input")}" title="${T("Spracheingabe", "Voice input")}">${svg("mic")}</button>` : ""}
            <button type="submit" class="sc-send">${T("Senden", "Send")}</button>
            <button type="button" class="sc-stop" data-sc="stop" hidden>${svg("stop")}${T("Stopp", "Stop")}</button>
          </div>
          <p class="sc-count" id="sc-count" aria-live="polite"></p>
        </form>
      </section>`;
    const ta = $("#sc-input");
    ta.value = draft; grow(ta);
    composer();
  }

  // Eingabezeile: Zähler (B5), Senden aus bei leer/zu lang/Wartezeit (B3, C3), Stopp während der Antwort (B6)
  function composer() {
    const ta = $("#sc-input");
    if (!ta) return;
    const len = ta.value.trim().length + (att ? att.text.length + att.name.length + 12 : 0);
    const over = len > MAX;
    const wait = rateLeft() > 0;
    const send = $(".sc-send"), stop = $(".sc-stop"), count = $(".sc-count");
    send.disabled = busy || !ta.value.trim() || over || wait || !!confirmPII;
    send.hidden = busy; stop.hidden = !busy;
    count.classList.toggle("is-over", over);
    count.textContent = attErr || (over ? T(`Zu lang: ${len}/${MAX} Zeichen. Bitte kürzen.`, `Too long: ${len}/${MAX} characters. Please shorten.`) : len > MAX * 0.75 ? `${len}/${MAX}` : "");
    count.classList.toggle("is-err", !!attErr);
    const a = $(".sc-att");
    a.hidden = !att;
    a.innerHTML = att ? `<span>${svg("clip")}${esc(att.name)}</span><button type="button" class="sc-tool" data-sc="unattach" aria-label="${T("Anhang entfernen", "Remove attachment")}">×</button>` : "";
    const mic = $(".sc-mic");
    if (mic) { mic.classList.toggle("is-on", !!listening); mic.setAttribute("aria-pressed", String(!!listening)); }
    for (const b of root.querySelectorAll(".sc-chips button, [data-sc=regen], [data-sc=edit], [data-sc=retry]")) b.disabled = busy || wait;
  }

  function msgHtml(m, i) {
    const lastAssistant = i === msgs.length - 1;
    if (m.role === "user") {
      if (editId === m.id) {
        return `<li class="sc-msg sc-me" data-id="${m.id}"><textarea class="sc-edit" aria-label="${T("Frage bearbeiten", "Edit question")}">${esc(m.text)}</textarea><div class="sc-tools sc-tools-end"><button type="button" class="sc-btn" data-sc="edit-cancel">${T("Abbrechen", "Cancel")}</button><button type="button" class="sc-btn is-key" data-sc="edit-save" data-id="${m.id}">${T("Senden", "Send")}</button></div></li>`;
      }
      return `<li class="sc-msg sc-me" data-id="${m.id}"><div class="sc-bubble">${esc(m.text).replace(/\n/g, "<br>")}${m.att ? `<span class="sc-attchip">${svg("clip")}${esc(m.att.name)}</span>` : ""}</div><div class="sc-tools sc-tools-end">${tool("edit", m.id, T("Frage bearbeiten", "Edit question"), "edit")}</div></li>`;
    }
    if (m.error) {
      const text = m.error === "rate" ? rateText(m) : ERR[m.error]();
      const canRetry = m.error !== "daily" && m.error !== "blocked" && !(m.error === "rate" && m.until > Date.now());
      return `<li class="sc-msg sc-bot sc-err" data-id="${m.id}"><div class="sc-bubble" ${m.error === "rate" ? 'data-rate="1"' : ""}><p>${esc(text)}${m.reason ? ` <span class="sc-reason">${esc(m.reason)}</span>` : ""}</p></div>${canRetry ? `<div class="sc-tools"><button type="button" class="sc-btn" data-sc="retry" data-id="${m.id}">${T("Erneut versuchen", "Try again")}</button></div>` : ""}</li>`;
    }
    const v = m.versions[m.v] || { text: "" };
    const streaming = streamId === m.id;
    const nav = m.versions.length > 1 ? `<span class="sc-ver"><button type="button" class="sc-tool" data-sc="ver-prev" data-id="${m.id}" aria-label="${T("Vorherige Antwort", "Previous answer")}"${m.v === 0 ? " disabled" : ""}>‹</button><span>${m.v + 1}/${m.versions.length}</span><button type="button" class="sc-tool" data-sc="ver-next" data-id="${m.id}" aria-label="${T("Nächste Antwort", "Next answer")}"${m.v === m.versions.length - 1 ? " disabled" : ""}>›</button></span>` : "";
    const fb = fbOpen === m.id ? `<div class="sc-fb" role="group" aria-label="${T("Was war nicht gut?", "What wasn't good?")}">${[T("Falsch", "Wrong"), T("Unklar", "Unclear"), T("Nicht hilfreich", "Not helpful")].map((r) => `<button type="button" class="sc-btn" data-sc="fb-reason" data-id="${m.id}">${esc(r)}</button>`).join("")}<button type="button" class="sc-btn" data-sc="fb-skip" data-id="${m.id}">${T("Überspringen", "Skip")}</button></div>` : "";
    const tools = streaming ? "" : `<div class="sc-tools">${tool("copy", m.id, T("Kopieren", "Copy"), "copy")}${TTS ? tool("speak", m.id, speakingId === m.id ? T("Vorlesen stoppen", "Stop reading") : T("Vorlesen", "Read aloud"), "speak", ` aria-pressed="${speakingId === m.id}"`) : ""}${lastAssistant ? tool("regen", m.id, T("Neu generieren", "Regenerate"), "regen") : ""}${nav}${tool("fb-up", m.id, T("Gute Antwort", "Good answer"), "up", ` aria-pressed="${m.fb === "up"}"`)}${tool("fb-down", m.id, T("Schlechte Antwort", "Bad answer"), "down", ` aria-pressed="${m.fb === "down"}"`)}</div>`;
    return `<li class="sc-msg sc-bot" data-id="${m.id}"><div class="sc-bubble sc-md">${md(v.text)}${v.aborted ? `<span class="sc-flag">${T("abgebrochen", "stopped")}</span>` : ""}</div>${v.plan && !streaming ? planCard(v.plan) : ""}${tools}${fb}</li>`;
  }

  function renderLog() {
    root.classList.toggle("is-busy", busy);
    coreState();
    const log = $(".sc-log");
    if (!log) return;
    const stick = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const intro = `<li class="sc-msg sc-bot"><div class="sc-bubble"><p>${T("Hallo! Ich beantworte Fragen zu Xyntal – was es ist, wie das Matching funktioniert, wie du in die Beta kommst – und sage dir, wo du bei Problemen Hilfe bekommst.", "Hi! I answer questions about Xyntal – what it is, how matching works, how to get into the beta – and tell you where to get help with problems.")}</p></div></li>`;
    const chips = msgs.length ? "" : `<li class="sc-chips">${SUGGEST().map((q) => `<button type="button" data-sc="ask">${esc(q)}</button>`).join("")}</li>`;
    const typing = busy && !streamId ? `<li class="sc-msg sc-bot sc-typing"><span></span><span></span><span></span><em>${T("Xyntal KI denkt nach …", "Xyntal AI is thinking …")}</em></li>` : "";
    const pii = confirmPII ? `<li class="sc-confirm" role="alertdialog" aria-label="${T("Persönliche Daten", "Personal data")}"><p>${T("Das sieht nach persönlichen Daten aus. Trotzdem senden?", "This looks like personal data. Send anyway?")}</p><div><button type="button" class="sc-btn" data-sc="pii-no">${T("Bearbeiten", "Edit")}</button><button type="button" class="sc-btn is-key" data-sc="pii-yes">${T("Trotzdem senden", "Send anyway")}</button></div></li>` : "";
    const clear = confirmClear ? `<li class="sc-confirm" role="alertdialog" aria-label="${T("Gespräch löschen", "Clear conversation")}"><p>${T("Gespräch löschen?", "Clear conversation?")}</p><div><button type="button" class="sc-btn" data-sc="clear-no">${T("Abbrechen", "Cancel")}</button><button type="button" class="sc-btn is-key" data-sc="clear-yes">${T("Löschen", "Delete")}</button></div></li>` : "";
    log.innerHTML = intro + msgs.map(msgHtml).join("") + chips + typing + pii + clear;
    if (stick || busy || confirmPII || confirmClear) log.scrollTop = log.scrollHeight;
    composer();
    root.querySelector(".sc-confirm .is-key")?.focus();
  }
  const paintStream = (m) => {
    const b = root.querySelector(`[data-id="${m.id}"] .sc-bubble`);
    if (!b) return renderLog();
    b.innerHTML = md(m.versions[m.v].text);
    const log = $(".sc-log"); log.scrollTop = log.scrollHeight;
  };

  // Verlauf für den Server: ohne Fehlerblasen (C8), Anhang als Teil der Frage
  const wire = (list = msgs) => list.filter((m) => !m.error).map((m) => m.role === "user"
    ? { role: "user", text: (m.text + (m.att ? `\n\n[${m.att.name}]\n${m.att.text}` : "")).slice(0, MAX) }
    : { role: "assistant", text: (m.versions[m.v]?.text || "").trim() }).filter((m) => m.text).slice(-12);

  async function fetchReply(body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctl = new AbortController();
      run.ctl = ctl;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, TIMEOUT);
      let res;
      try {
        res = await fetch(`${api()}/site/chat`, { method: "POST", signal: ctl.signal, headers: { "content-type": "application/json", "accept-language": en() ? "en" : "de" }, body: JSON.stringify(body) });
      } catch {
        clearTimeout(timer);
        if (run.stopped) throw { kind: "stopped" };
        if (timedOut || navigator.onLine === false) throw { kind: "offline" };
        if (attempt === 0) continue; // C2: einmal automatisch wiederholen
        throw { kind: "offline" };
      }
      clearTimeout(timer);
      const json = await res.json().catch(() => ({}));
      if (run.stopped) throw { kind: "stopped" };
      if (res.ok && json.data?.reply) return json.data;
      if (res.status === 429) {
        const msg = String(json.error?.message || "");
        if (/daily|today/i.test(msg)) throw { kind: "daily" };
        const after = Number(res.headers.get("retry-after")) || Number(res.headers.get("x-ratelimit-reset")) || 30;
        throw { kind: "rate", after: Math.min(Math.max(after, 3), 120) };
      }
      if (/CONTENT|POLICY|BLOCK|MODERAT/i.test(String(json.error?.code || ""))) throw { kind: "blocked", reason: json.error?.message };
      if (res.status >= 500 && attempt === 0) continue;
      throw { kind: "down" };
    }
    throw { kind: "down" };
  }

  // Eine Antwort holen und wortweise zeigen (B7). regenId: neue Fassung an diese Antwort hängen (B9).
  async function request({ regenId = null, fromInput = "" } = {}) {
    busy = true; streamId = null; fbOpen = null;
    run = { stopped: false, ctl: null, timer: 0 };
    const me = run;
    renderLog(); announce(T("Xyntal KI denkt nach …", "Xyntal AI is thinking …"));
    const history = regenId ? wire(msgs.slice(0, msgs.findIndex((m) => m.id === regenId))) : wire();
    let target = null;
    try {
      const data = await fetchReply({ messages: history });
      if (regenId) { target = msgs.find((m) => m.id === regenId); target.versions.push({ text: "", plan: null }); target.v = target.versions.length - 1; }
      else { target = { id: uid(), role: "assistant", versions: [{ text: "", plan: null }], v: 0 }; msgs.push(target); }
      const ver = target.versions[target.v];
      streamId = target.id; renderLog();
      const parts = data.reply.split(/(\s+)/);
      const step = Math.max(2, Math.ceil(parts.length / 90));
      await new Promise((done) => {
        let i = 0;
        const tick = () => {
          if (me.stopped) { ver.aborted = true; return done(); }
          ver.text += parts.slice(i, i + step).join(""); i += step;
          paintStream(target);
          if (i >= parts.length) { ver.plan = data.plan || null; return done(); }
          me.timer = setTimeout(tick, reduced() ? 0 : 22);
        };
        tick();
      });
      announce(plain(ver.text) + (ver.aborted ? " – " + T("abgebrochen", "stopped") : ""));
    } catch (e) {
      const kind = e?.kind || "down";
      if (kind === "stopped") {
        if (!regenId) msgs.push({ id: uid(), role: "assistant", versions: [{ text: "", aborted: true }], v: 0 });
        announce(T("Abgebrochen", "Stopped"));
      } else {
        const err = { id: uid(), role: "assistant", error: kind, retry: regenId ? { regenId } : kind === "offline" && fromInput ? "input" : "last" };
        if (kind === "rate") err.until = Date.now() + e.after * 1000;
        if (kind === "blocked" && e.reason) err.reason = e.reason;
        if (kind === "offline" && fromInput && !regenId) {
          // C1: Frage zurück ins Feld, Verlauf ohne sie
          const last = msgs[msgs.length - 1];
          if (last?.role === "user") { msgs.pop(); const ta = $("#sc-input"); if (ta && !ta.value.trim()) { ta.value = fromInput; if (last.att) att = last.att; grow(ta); } }
        }
        msgs.push(err);
        announce(kind === "rate" ? rateText(err) : ERR[kind]());
        if (kind === "rate") startCountdown();
      }
    }
    if (run !== me) return;
    busy = false; streamId = null; run = null; save();
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => { speakTimer = 0; coreState(); }, 2800);
    renderLog();
    if (isOpen()) $("#sc-input")?.focus();
  }

  let countdown = 0;
  function startCountdown() {
    clearInterval(countdown);
    countdown = setInterval(() => {
      const left = rateLeft();
      for (const el of root.querySelectorAll("[data-rate] p")) {
        const m = msgs.find((x) => x.id === el.closest("[data-id]").dataset.id);
        if (m) el.textContent = rateText(m);
      }
      if (left <= 0) { clearInterval(countdown); renderLog(); }
    }, 1000);
  }

  function ask(text, { force = false } = {}) {
    const q = String(text).trim();
    if (!q || busy || rateLeft() > 0) return; // B3, B4
    const len = q.length + (att ? att.text.length + att.name.length + 12 : 0);
    if (len > MAX) { composer(); return; } // B5
    if (!force && hasPII(q + (att ? "\n" + att.text : ""))) { confirmPII = q; renderLog(); return; } // D11
    confirmPII = null; confirmClear = false; editId = null;
    msgs = msgs.filter((m) => !m.error);
    msgs.push({ id: uid(), role: "user", text: q, ...(att ? { att } : {}) });
    att = null; attErr = "";
    const input = $("#sc-input");
    if (input) { input.value = ""; grow(input); }
    save();
    request({ fromInput: q });
  }

  function stop() {
    if (!run) return;
    run.stopped = true;
    run.ctl?.abort();
  }

  // Anhang (B15): auf der Website nur kurze Textdateien – die Frage samt Anhang darf 800 Zeichen haben (Grenze des Servers).
  async function attachFile(file) {
    attErr = "";
    if (!file) return;
    if (/^(image|video|audio)\//.test(file.type) || /\.(pdf|docx?|pptx?|xlsx?|key|zip)$/i.test(file.name)) {
      attErr = T("Diese Datei kann der Website-Assistent nicht lesen – nur kurze Textdateien (.txt, .md, .csv). Bilder, PDFs und Präsentationen bis 20 MB / 200 Seiten gehen in der App.", "The website assistant can't read this file – only short text files (.txt, .md, .csv). Images, PDFs and decks up to 20 MB / 200 pages work in the app.");
    } else if (file.size > MAX * 4) {
      attErr = T(`Datei zu groß: höchstens ${MAX} Zeichen (inkl. Frage).`, `File too large: max. ${MAX} characters (incl. question).`);
    } else {
      try {
        const text = (await file.text()).trim();
        if (/\u0000/.test(text)) attErr = T("Datei nicht lesbar: Sie enthält keinen Text.", "File not readable: it contains no text.");
        else if (!text) attErr = T("Datei nicht lesbar: Sie ist leer.", "File not readable: it's empty.");
        else att = { name: file.name.slice(0, 80), text };
      } catch { attErr = T("Datei nicht lesbar: Sie konnte nicht geöffnet werden.", "File not readable: it couldn't be opened."); }
    }
    composer();
    if (attErr) announce(attErr); else { announce(T(`${file.name} angehängt`, `${file.name} attached`)); $("#sc-input")?.focus(); }
  }

  // Spracheingabe (B16, A10): Text erscheint im Feld zum Prüfen, wird nicht automatisch gesendet
  function toggleMic() {
    if (listening) { listening.stop(); return; }
    const rec = new SR();
    rec.lang = navigator.language || (en() ? "en-US" : "de-DE");
    rec.interimResults = true;
    const ta = $("#sc-input");
    const base = ta.value ? ta.value.replace(/\s*$/, " ") : "";
    rec.onresult = (e) => { ta.value = base + [...e.results].map((r) => r[0].transcript).join(""); grow(ta); composer(); };
    rec.onerror = (e) => { if (e.error === "not-allowed") toast(T("Mikrofon ist nicht erlaubt.", "Microphone isn't allowed.")); };
    rec.onend = () => { listening = null; composer(); ta.focus(); };
    try { rec.start(); listening = rec; composer(); announce(T("Ich höre zu …", "Listening …")); } catch { listening = null; }
  }

  function speak(m) {
    speechSynthesis.cancel();
    if (speakingId === m.id) { speakingId = null; renderLog(); return; }
    const text = plain(m.versions[m.v].text);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = guessLang(text);
    u.onend = u.onerror = () => { if (speakingId === m.id) { speakingId = null; renderLog(); } };
    speakingId = m.id; renderLog();
    speechSynthesis.speak(u);
  }

  const grow = (ta) => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; };
  const setOpen = (open) => {
    const panel = $(".sc-panel");
    const btn = $(".sc-open");
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (open) { renderLog(); $("#sc-input").focus(); mountCore("head"); fitViewport(); } else { btn.focus(); if (TTS) speechSynthesis.cancel(); speakingId = null; listening?.stop(); }
    coreVisibility();
  };

  const byId = (id) => msgs.find((m) => m.id === id);
  root.addEventListener("click", async (e) => {
    if (e.target.closest(".sc-open")) { setOpen($(".sc-panel").hidden); return; }
    const b = e.target.closest("[data-sc]");
    if (!b || b.disabled) return;
    const id = b.dataset.id, m = id ? byId(id) : null;
    switch (b.dataset.sc) {
      case "close": setOpen(false); break;
      case "ask": ask(b.textContent); break; // B12
      case "stop": stop(); break;
      case "clear": if (msgs.length) { confirmClear = true; renderLog(); } break; // D12
      case "clear-no": confirmClear = false; renderLog(); $("#sc-input").focus(); break;
      case "clear-yes": stop(); msgs = []; confirmClear = false; editId = null; fbOpen = null; save(); renderLog(); $("#sc-input").focus(); announce(T("Gespräch gelöscht", "Conversation cleared")); break;
      case "pii-yes": { const q = confirmPII; confirmPII = null; ask(q, { force: true }); break; }
      case "pii-no": confirmPII = null; renderLog(); $("#sc-input").focus(); break;
      case "copy": try { await navigator.clipboard.writeText(plain(m.versions[m.v].text)); toast(T("Kopiert", "Copied")); } catch { toast(T("Kopieren nicht möglich", "Couldn't copy")); } break;
      case "speak": speak(m); break;
      case "regen": if (!busy) request({ regenId: id }); break;
      case "ver-prev": m.v = Math.max(0, m.v - 1); save(); renderLog(); break;
      case "ver-next": m.v = Math.min(m.versions.length - 1, m.v + 1); save(); renderLog(); break;
      case "fb-up": m.fb = m.fb === "up" ? null : "up"; m.fbReason = null; fbOpen = null; save(); renderLog(); if (m.fb) toast(T("Danke für dein Feedback", "Thanks for your feedback")); break;
      case "fb-down": m.fb = m.fb === "down" ? null : "down"; fbOpen = m.fb ? id : null; save(); renderLog(); break;
      case "fb-reason": m.fbReason = b.textContent; fbOpen = null; save(); renderLog(); toast(T("Danke für dein Feedback", "Thanks for your feedback")); break;
      case "fb-skip": fbOpen = null; renderLog(); toast(T("Danke für dein Feedback", "Thanks for your feedback")); break;
      case "edit": if (!busy) { editId = id; renderLog(); const ta = root.querySelector(".sc-edit"); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } break;
      case "edit-cancel": editId = null; renderLog(); break;
      case "edit-save": { // B10: Frage ändern, alles danach fällt weg, Antwort neu
        const t = root.querySelector(".sc-edit").value.trim();
        if (!t || t.length > MAX || busy) break;
        const i = msgs.findIndex((x) => x.id === id);
        msgs = msgs.slice(0, i + 1); msgs[i].text = t; editId = null; save();
        request();
        break;
      }
      case "retry": {
        msgs = msgs.filter((x) => x.id !== id);
        if (m.retry === "input") ask($("#sc-input").value);
        else if (m.retry?.regenId && byId(m.retry.regenId)) request({ regenId: m.retry.regenId });
        else request();
        break;
      }
      case "attach": $(".sc-file").click(); break;
      case "unattach": att = null; attErr = ""; composer(); $("#sc-input").focus(); break;
      case "mic": toggleMic(); break;
    }
  });
  root.addEventListener("change", (e) => { if (e.target.classList.contains("sc-file")) { attachFile(e.target.files[0]); e.target.value = ""; } });
  root.addEventListener("submit", (e) => { e.preventDefault(); ask($("#sc-input").value); });
  root.addEventListener("input", (e) => { if (e.target.id === "sc-input") { grow(e.target); composer(); } });
  root.addEventListener("keydown", (e) => {
    const enter = e.key === "Enter" && !e.shiftKey && !e.isComposing; // B2: Shift+Enter = neue Zeile
    if (e.target.id === "sc-input" && enter) { e.preventDefault(); ask(e.target.value); return; }
    if (e.target.classList.contains("sc-edit") && enter) { e.preventDefault(); root.querySelector("[data-sc=edit-save]")?.click(); return; }
    if (e.key === "Escape" && isOpen()) { // B14
      e.preventDefault();
      if (editId) { editId = null; renderLog(); }
      else if (confirmPII || confirmClear) { confirmPII = null; confirmClear = false; renderLog(); $("#sc-input").focus(); }
      else if (busy) stop();
      else setOpen(false);
    }
  });
  // Drag & Drop (B15)
  let dragDepth = 0;
  root.addEventListener("dragenter", (e) => { if (!isOpen() || !e.dataTransfer?.types?.includes("Files")) return; e.preventDefault(); dragDepth++; $(".sc-drop").hidden = false; });
  root.addEventListener("dragover", (e) => { if (isOpen() && e.dataTransfer?.types?.includes("Files")) e.preventDefault(); });
  root.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; const d = $(".sc-drop"); if (d) d.hidden = true; } });
  root.addEventListener("drop", (e) => { if (!isOpen()) return; e.preventDefault(); dragDepth = 0; $(".sc-drop").hidden = true; attachFile(e.dataTransfer.files[0]); });

  // Mobil: Bildschirmtastatur verdeckt die Eingabe nicht (Panel folgt dem sichtbaren Bereich)
  function fitViewport() {
    const vv = window.visualViewport;
    if (!vv || window.innerWidth > 480) { root.style.removeProperty("--sc-vh"); root.style.removeProperty("--sc-vtop"); return; }
    root.style.setProperty("--sc-vh", vv.height + "px");
    root.style.setProperty("--sc-vtop", vv.offsetTop + "px");
    if (isOpen()) { const log = $(".sc-log"); if (log) log.scrollTop = log.scrollHeight; }
  }
  window.visualViewport?.addEventListener("resize", fitViewport);
  window.visualViewport?.addEventListener("scroll", fitViewport);

  // A9: UI-Sprache wechselt ohne Neuladen; Fehlermeldungen werden beim Zeichnen in der UI-Sprache erzeugt
  document.addEventListener("xyntal:lang", () => { const open = isOpen(); destroyCores(); renderShell(); mountCore("btn"); mountCore("head"); if (open) setOpen(true); });

  renderShell();
  if (rateLeft() > 0) startCountdown();
  if (document.readyState === "complete") whenIdle(() => mountCore("btn"));
  else window.addEventListener("load", () => whenIdle(() => mountCore("btn")), { once: true });
})();
