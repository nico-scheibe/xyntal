// Partnerprogramm: xyntal.de/?partner=<code> (z. B. closinghub).
// 1) Der Code wird beim App-Server geprüft, der Besuch gezählt (nur ein Zähler pro Tag,
//    nichts über die Person) und im Browser gemerkt (localStorage „xyntal-partner“, 30 Tage).
// 2) Ein Hinweis zeigt das Angebot (1 Monat Plus gratis), bis das Konto da ist.
// 3) Sobald jemand angemeldet ist, löst die Seite den Code einmal ein (POST /me/partner).
//    Der Server entscheidet: nur neue Konten (14 Tage), nur einmal, bezahlte Konten bekommen nichts dazu.
// Geladen von account-menu.js, nur wenn ein Partner-Link im Spiel ist.
(() => {
  const API = (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const KEY = "xyntal-partner";
  const SB_TOKEN = "sb-rralgrlujoupprwlvoyo-auth-token";
  const KEEP_MS = 30 * 86400000;
  const en = () => document.documentElement.lang === "en";
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* privat: nur diese Seite */ } };
  const signedIn = () => { try { return !!JSON.parse(localStorage.getItem(SB_TOKEN) || "null")?.access_token; } catch { return false; } };

  const offer = (p) => p.days === 30 ? T(`1 Monat ${p.plan} gratis`, `1 month of ${p.plan} free`) : T(`${p.days} Tage ${p.plan} gratis`, `${p.days} days of ${p.plan} free`);

  function style() {
    if (document.getElementById("xp-style")) return;
    const st = document.createElement("style");
    st.id = "xp-style";
    st.textContent = `.xp-bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;max-width:calc(100% - 32px);width:max-content;padding:10px 10px 10px 16px;border-radius:999px;background:#15151c;border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 40px rgba(0,0,0,.5);color:#f5f5f7;font:500 14px/1.35 Inter,system-ui,sans-serif}
.xp-bar b{background:linear-gradient(100deg,#c084fc,#ec4899 45%,#60a5fa);-webkit-background-clip:text;background-clip:text;color:transparent}
.xp-bar a{flex:none;padding:7px 14px;border-radius:999px;background:linear-gradient(100deg,#a855f7,#ec4899 45%,#6366f1);color:#fff;text-decoration:none;font-weight:700}
.xp-bar button{flex:none;width:28px;height:28px;border:0;border-radius:50%;background:transparent;color:#a1a1aa;font-size:18px;line-height:1;cursor:pointer}
.xp-bar button:hover{color:#fff;background:rgba(255,255,255,.08)}
@media (max-width:560px){.xp-bar{left:16px;right:16px;transform:none;width:auto;border-radius:16px;flex-wrap:wrap}.xp-bar span{flex:1 1 100%}}`;
    document.head.append(st);
  }

  function bar(html, cta) {
    style();
    document.querySelector(".xp-bar")?.remove();
    const el = document.createElement("div");
    el.className = "xp-bar";
    el.setAttribute("role", "status");
    el.setAttribute("data-no-i18n", "");
    el.innerHTML = `<span>${html}</span>${cta ? `<a href="${cta.href}">${esc(cta.label)}</a>` : ""}<button type="button" aria-label="${T("Schließen", "Close")}">×</button>`;
    el.querySelector("button").addEventListener("click", () => {
      el.remove();
      const p = load();
      if (p && !p.done) save({ ...p, hidden: true });
    });
    document.body.append(el);
    return el;
  }

  async function fromUrl() {
    const params = new URLSearchParams(location.search);
    const code = (params.get("partner") || "").trim().toLowerCase();
    if (!code) return;
    params.delete("partner");
    const rest = params.toString();
    history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    if (!/^[a-z0-9]{3,32}$/.test(code)) return;
    const prev = load();
    if (prev && prev.done) return; // schon eingelöst: nichts mehr ändern
    try {
      const res = await fetch(`${API}/partners/${code}`, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const { data } = await res.json();
      // Ein Besuch zählt pro Browser einmal, auch wenn der Link mehrmals geöffnet wird.
      if (!prev || prev.code !== data.code) fetch(`${API}/partners/${data.code}/visit`, { method: "POST", keepalive: true }).catch(() => {});
      save({ code: data.code, name: data.name, plan: data.plan, days: data.days, at: Date.now() });
    } catch { /* Server nicht erreichbar: Link einfach ignorieren */ }
  }

  function loadAppApi() {
    if (window.XyntalApp) return Promise.resolve(window.XyntalApp);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/app-api.js?v=7";
      s.onload = () => (window.XyntalApp ? resolve(window.XyntalApp) : reject(new Error("app-api")));
      s.onerror = reject;
      document.head.append(s);
    });
  }

  let claiming = false;
  async function claim(p) {
    if (claiming) return;
    claiming = true;
    try {
      const app = await loadAppApi();
      const r = await app.api("POST", "/me/partner", { code: p.code });
      save({ ...p, done: true, status: r.status });
      if (r.status === "granted") {
        const until = new Date(r.until).toLocaleDateString(en() ? "en-GB" : "de-DE", { day: "numeric", month: "long", year: "numeric" });
        const el = bar(T(`Danke, dass du über ${esc(p.name)} gekommen bist: <b>${esc(r.plan)} ist aktiv</b> bis ${esc(until)}.`,
          `Thanks for coming via ${esc(p.name)}: <b>${esc(r.plan)} is active</b> until ${esc(until)}.`));
        setTimeout(() => el.remove(), 12000);
      }
    } catch (e) {
      // Unbekannter Code: vergessen. Sonst (Netz, Sitzung) beim nächsten Seitenaufruf erneut.
      if (e && e.status === 404) { try { localStorage.removeItem(KEY); } catch { /* egal */ } }
    } finally { claiming = false; }
  }

  async function run() {
    await fromUrl();
    const p = load();
    if (!p || p.done) return;
    if (Date.now() - p.at > KEEP_MS) { try { localStorage.removeItem(KEY); } catch { /* egal */ } return; }
    if (signedIn()) { claim(p); return; }
    if (!p.hidden) {
      const onSignup = /^\/(mitglied-werden|login)/.test(location.pathname);
      bar(T(`Über ${esc(p.name)}: <b>${esc(offer(p))}</b> für dein neues Konto.`, `Via ${esc(p.name)}: <b>${esc(offer(p))}</b> for your new account.`),
        onSignup ? null : { href: "/mitglied-werden", label: T("Konto anlegen", "Create account") });
    }
  }

  window.addEventListener("storage", (e) => { if (e.key === SB_TOKEN && signedIn()) { const p = load(); if (p && !p.done) claim(p); } });
  window.XyntalPartner = { pending: () => { const p = load(); return p && !p.done ? p : null; }, offer };
  run();
})();
