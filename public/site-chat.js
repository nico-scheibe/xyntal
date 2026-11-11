// Xyntal-Assistent: kleiner Chat unten rechts auf der Website. Beantwortet Fragen zu Xyntal,
// empfiehlt einen Tarif und hilft bei Support-Fragen weiter. Die Antworten kommen von der KI
// des App-Servers (POST /site/chat, ohne Konto, mit Tageslimit). Der Verlauf bleibt nur in
// diesem Tab (sessionStorage) und geht mit jeder Frage an den Server.
(() => {
  // In eingebetteten Seiten (z. B. Karten-Editor im Profil) zeigt schon die äußere Seite den Assistenten
  let framed = false;
  try { framed = window.self !== window.top; } catch { framed = true; }
  if (framed || window.__xyntalSiteChat || document.body.classList.contains("page-admin")) return;
  window.__xyntalSiteChat = true;

  const api = () => (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const KEY = "xyntal-site-chat";
  const en = () => window.XyntalI18n?.get?.() === "en";
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let msgs = [];
  try { msgs = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { msgs = []; }
  if (!Array.isArray(msgs)) msgs = [];
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20))); } catch { /* privat */ } };
  let busy = false;

  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "/site-chat.css?v=4";
  document.head.append(css);

  const root = document.createElement("div");
  root.className = "sc";
  root.setAttribute("data-no-i18n", "");
  document.body.append(root);

  // Links in Antworten: Seiten der Website (/beta, /tarif …) und die Support-Adresse
  const linkify = (text) => esc(text)
    .replace(/(^|[\s(„"])(\/(?:[a-z0-9-]+)(?:#[a-z0-9-]+)?)(?=[\s).,;:!?“"]|$)/gi, '$1<a href="$2">$2</a>')
    .replace(/\b(admin@xyntal\.com)\b/g, '<a href="mailto:$1">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");

  const PLAN_LINE = { Free: ["Kostenlos, für den Einstieg", "Free, to get started"], Plus: ["Für alle, die jede Woche liefern", "For builders shipping every week"], Pro: ["Für kleine Teams mit KI und Agenten", "For small teams with AI and agents"], Ultra: ["Für Teams, die viel automatisieren", "For teams that automate a lot"], Enterprise: ["Für Firmen, auf Anfrage", "For companies, on request"], "Enterprise+": ["Für große Firmen, auf Anfrage", "For large companies, on request"] };
  const planCard = (id) => `<div class="sc-plan"><span class="sc-mono">${T("Empfehlung", "Recommendation")}</span><b>${esc(id)}</b><small>${esc((PLAN_LINE[id] || ["", ""])[en() ? 1 : 0])}</small><a href="${id.startsWith("Enterprise") ? "mailto:admin@xyntal.com" : "/preise"}">${id.startsWith("Enterprise") ? T("Kontakt aufnehmen", "Get in touch") : T("Tarife ansehen", "See plans")} →</a></div>`;
  const SUGGEST = () => [
    T("Welcher Tarif passt zu mir?", "Which plan fits me?"),
    T("Wie komme ich in die Beta?", "How do I get into the beta?"),
    T("Ich habe ein Problem mit meinem Konto", "I have a problem with my account"),
  ];

  // Die Xyntal-Marke: Sechseck mit Auge (atmet, blinzelt; läuft ein Bogen, während der Assistent antwortet).
  const ORB = '<span class="sc-orb" aria-hidden="true"><svg viewBox="0 0 48 48"><polygon class="sc-orb-hex" points="24,3.5 41.8,13.75 41.8,34.25 24,44.5 6.2,34.25 6.2,13.75"/><polygon class="sc-orb-sweep" points="24,3.5 41.8,13.75 41.8,34.25 24,44.5 6.2,34.25 6.2,13.75" pathLength="100"/><ellipse class="sc-orb-eye" cx="24" cy="24" rx="6.5" ry="6.5"/></svg></span>';

  // 3D-Kern im Button und im Chat-Kopf: three.js (ca. 600 KB) und der Kern laden erst nach dem Seitenaufbau im Leerlauf,
  // nicht blockierend. Ohne WebGL, bei reduzierter Bewegung oder wenn das Laden scheitert, bleibt die flache SVG-Marke stehen.
  const cores = { btn: null, head: null };
  let speakTimer = 0, libs = null;
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const loadScript = (src) => new Promise((ok, fail) => {
    const el = document.createElement("script");
    el.src = src; el.onload = ok; el.onerror = fail; document.head.append(el);
  });
  const loadLibs = () => (libs ||= (async () => {
    if (!window.THREE) await loadScript("/vendor/three.min.js?v=2");
    if (!window.XyntalCore) await loadScript("/xyntal-core.js?v=2");
  })().catch((e) => { libs = null; throw e; }));
  const coreState = () => { const st = busy ? "think" : speakTimer ? "speak" : "idle"; for (const c of Object.values(cores)) c && c.setState(st); };
  // Gezeichnet wird nur, was gerade sichtbar ist: bei offenem Chat der Kopf, sonst der Button.
  const coreVisibility = () => {
    const open = !root.querySelector(".sc-panel")?.hidden;
    if (cores.btn) cores.btn.setActive(!open);
    if (cores.head) cores.head.setActive(open);
  };
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

  function renderShell() {
    root.innerHTML = `
      <button type="button" class="sc-open" aria-expanded="false" aria-controls="sc-panel"><span class="sc-core sc-core-btn" data-core="btn">${ORB}</span>${T("Fragen zu Xyntal?", "Questions about Xyntal?")}</button>
      <section class="sc-panel" id="sc-panel" role="dialog" aria-modal="false" aria-labelledby="sc-title" hidden>
        <header class="sc-head"><div class="sc-id"><span class="sc-core" data-core="head">${ORB}</span><div><p class="sc-mono">${T("KI-Assistent · Beta", "AI assistant · beta")}</p><h2 id="sc-title">${T("Xyntal-Assistent", "Xyntal assistant")}</h2></div></div>
          <div class="sc-head-act"><button type="button" class="sc-icon" data-sc="clear" aria-label="${T("Gespräch löschen", "Clear conversation")}" title="${T("Gespräch löschen", "Clear conversation")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button><button type="button" class="sc-icon" data-sc="close" aria-label="${T("Schließen", "Close")}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div></header>
        <ol class="sc-log" aria-live="polite"></ol>
        <form class="sc-form"><label class="sc-sr" for="sc-input">${T("Deine Frage", "Your question")}</label><textarea id="sc-input" rows="1" maxlength="800" placeholder="${T("Frag etwas zu Xyntal …", "Ask anything about Xyntal …")}"></textarea><button type="submit" class="sc-send">${T("Senden", "Send")}</button></form>
        <p class="sc-note">${T("Antworten kommen von einer KI und können falsch sein. Deine Nachrichten gehen über unseren Server an OpenAI (USA) – bitte keine persönlichen Daten eingeben.", "Answers come from an AI and can be wrong. Your messages go through our server to OpenAI (USA) – please don't enter personal data.")} <a href="/datenschutz#assistent">${T("Datenschutz", "Privacy")}</a></p>
      </section>`;
  }

  function renderLog() {
    root.classList.toggle("is-busy", busy);
    coreState();
    const log = root.querySelector(".sc-log");
    if (!log) return;
    const intro = `<li class="sc-msg sc-bot"><p>${T("Hallo! Ich beantworte Fragen zu Xyntal, helfe dir, den passenden Tarif zu finden, und sage dir, wo du bei Problemen Hilfe bekommst.", "Hi! I answer questions about Xyntal, help you find the right plan and tell you where to get help with problems.")}</p></li>`;
    const chips = msgs.length ? "" : `<li class="sc-chips">${SUGGEST().map((q) => `<button type="button" data-sc="ask">${esc(q)}</button>`).join("")}</li>`;
    log.innerHTML = intro + msgs.map((m) => `<li class="sc-msg ${m.role === "user" ? "sc-me" : "sc-bot"}${m.error ? " sc-err" : ""}"><p>${m.role === "user" ? esc(m.text).replace(/\n/g, "<br>") : linkify(m.text)}</p>${m.plan ? planCard(m.plan) : ""}</li>`).join("") + chips
      + (busy ? `<li class="sc-msg sc-bot sc-typing"><span></span><span></span><span></span><span class="sc-sr">${T("Der Assistent schreibt …", "The assistant is typing …")}</span></li>` : "");
    log.scrollTop = log.scrollHeight;
  }

  async function ask(text) {
    const q = text.trim();
    if (!q || busy) return;
    msgs.push({ role: "user", text: q.slice(0, 800) });
    busy = true; save(); renderLog();
    const input = root.querySelector("#sc-input");
    if (input) { input.value = ""; grow(input); }
    try {
      const res = await fetch(`${api()}/site/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "accept-language": en() ? "en" : "de" },
        body: JSON.stringify({ messages: msgs.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, text: m.text })) }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.data?.reply) msgs.push({ role: "assistant", text: json.data.reply, plan: json.data.plan || null });
      else if (res.status === 429) msgs.push({ role: "assistant", error: true, text: T("Für heute ist das Limit erreicht. Schreib gern an admin@xyntal.com – ich antworte persönlich.", "Today's limit is reached. Feel free to write to admin@xyntal.com.") });
      else msgs.push({ role: "assistant", error: true, text: T("Der Assistent ist gerade nicht erreichbar. Versuch es gleich noch einmal oder schreib an admin@xyntal.com.", "The assistant isn't available right now. Try again shortly or write to admin@xyntal.com.") });
    } catch {
      msgs.push({ role: "assistant", error: true, text: T("Keine Verbindung. Prüf dein Internet oder schreib an admin@xyntal.com.", "No connection. Check your internet or write to admin@xyntal.com.") });
    }
    busy = false; save();
    clearTimeout(speakTimer);
    speakTimer = setTimeout(() => { speakTimer = 0; coreState(); }, 2800);
    renderLog();
    root.querySelector("#sc-input")?.focus();
  }

  const grow = (ta) => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; };
  const setOpen = (open) => {
    const panel = root.querySelector(".sc-panel");
    const btn = root.querySelector(".sc-open");
    panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    root.classList.toggle("is-open", open);
    if (open) { renderLog(); root.querySelector("#sc-input").focus(); mountCore("head"); } else btn.focus();
    coreVisibility();
  };

  root.addEventListener("click", (e) => {
    if (e.target.closest(".sc-open")) { setOpen(root.querySelector(".sc-panel").hidden); return; }
    const b = e.target.closest("[data-sc]");
    if (!b) return;
    if (b.dataset.sc === "close") setOpen(false);
    if (b.dataset.sc === "ask") ask(b.textContent);
    if (b.dataset.sc === "clear") { msgs = []; save(); renderLog(); root.querySelector("#sc-input").focus(); }
  });
  root.addEventListener("submit", (e) => { e.preventDefault(); ask(root.querySelector("#sc-input").value); });
  root.addEventListener("input", (e) => { if (e.target.id === "sc-input") grow(e.target); });
  root.addEventListener("keydown", (e) => {
    if (e.target.id === "sc-input" && e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(e.target.value); }
    if (e.key === "Escape" && !root.querySelector(".sc-panel").hidden) setOpen(false);
  });
  document.addEventListener("xyntal:lang", () => { const open = !root.querySelector(".sc-panel")?.hidden; destroyCores(); renderShell(); mountCore("btn"); mountCore("head"); if (open) setOpen(true); });

  renderShell();
  if (document.readyState === "complete") whenIdle(() => mountCore("btn"));
  else window.addEventListener("load", () => whenIdle(() => mountCore("btn")), { once: true });
})();
