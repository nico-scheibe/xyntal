// Kontomenü oben rechts: Personen-Icon, klappt beim Klick auf.
// Läuft auf allen Seiten – auch auf denen ohne Supabase-Bibliothek. Ob jemand angemeldet ist,
// steht in der Supabase-Sitzung im localStorage; Name und Foto kommen, wenn möglich, aus dem Profil.
(() => {
  const REF = "rralgrlujoupprwlvoyo";
  const URL_ = `https://${REF}.supabase.co`;
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";
  const TOKEN = `sb-${REF}-auth-token`;

  // Rückkehr von Google & Co. auf einer Seite ohne Supabase (z. B. Startseite):
  // weiter zum Login, der die Sitzung aus der Adresse übernimmt bzw. den Fehler zeigt.
  const back = location.search + location.hash;
  if (!window.supabase && location.pathname !== "/login" && /(^|[?#&])(access_token|code|error_description)=/.test(back)) {
    location.replace("/login" + back);
    return;
  }

  const EN = {
    "Konto": "Account", "Einloggen": "Log in", "Konto anlegen": "Create account",
    "Noch kein Konto?": "No account yet?", "Mein Profil": "My profile", "Meine Karte": "My card",
    "Nachrichten": "Messages", "Projekte": "Projects", "Abmelden": "Log out", "Kontomenü": "Account menu",
    "Angemeldet als": "Signed in as", "Admin-Bereich": "Admin area",
  };
  const t = (de) => (document.documentElement.lang === "en" && EN[de]) || de;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function readSession() {
    try {
      const raw = localStorage.getItem(TOKEN);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const user = s?.user || s?.currentSession?.user;
      return user ? { user } : null;
    } catch { return null; }
  }
  const client = () => (typeof sb !== "undefined" && sb ? sb : null); // eslint-disable-line no-undef
  let ownClient = null;
  async function getClient() {
    const c = client();
    if (c) return c;
    if (ownClient) return ownClient;
    if (!window.supabase) await (window.__xyntalSb = window.__xyntalSb || new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = "/vendor/supabase.js?v=31"; sc.onload = res; sc.onerror = rej; document.head.append(sc);
    }));
    if (client()) return client(); // app.js war schneller
    ownClient = window.supabase.createClient(URL_, KEY);
    return ownClient;
  }
  // Name und Foto merken, damit sie beim nächsten Seitenaufruf sofort da sind
  const CACHE = "xyntal-acct";
  const readCache = (id) => { try { const c = JSON.parse(localStorage.getItem(CACHE) || "null"); return c && c.id === id ? c : null; } catch { return null; } };
  const writeCache = (v) => { try { localStorage.setItem(CACHE, JSON.stringify(v)); } catch { /* egal */ } };
  let photoUrl = "", photoPath = "";

  const ICON_USER = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.8"/><path d="M4.6 20.2c.9-3.9 3.9-6 7.4-6s6.5 2.1 7.4 6"/></svg>';
  const ICONS = {
    profil: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.6"/><path d="M5 20c.9-3.6 3.7-5.6 7-5.6s6.1 2 7 5.6"/></svg>',
    karte: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6.5 15.5c.5-1.3 1.4-2 2.5-2s2 .7 2.5 2M14 10h4M14 13.5h3"/></svg>',
    nachrichten: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v9.5h-9l-4 3.5V16h-2z"/></svg>',
    projekte: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h16v11H4zM9 7.5V5.5h6v2"/></svg>',
    admin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9v-5z"/></svg>',
    login: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 4.5H18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4.5M4.5 12h10M11 8.5 14.5 12 11 15.5"/></svg>',
    neu: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8.2" r="3.6"/><path d="M3.5 20c.9-3.6 3.5-5.6 6.5-5.6 1.4 0 2.7.4 3.8 1.2M18 14v6M15 17h6"/></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h4.5M19.5 12h-10M16 8.5l3.5 3.5-3.5 3.5"/></svg>',
  };

  const CSS = `
  .acct{position:relative;flex:none;display:flex;align-items:center;margin-left:10px;order:5;font-family:var(--f-text,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif)}
  .acct-btn{position:relative;width:38px;height:38px;padding:0;border-radius:999px;border:1px solid var(--line-2,var(--border-2,rgba(255,255,255,.16)));background:var(--surface-2,var(--panel-2,rgba(255,255,255,.07)));color:var(--text,#F5F5F7);display:grid;place-items:center;cursor:pointer;transition:border-color .15s ease,background-color .15s ease,transform .15s ease}
  .acct-btn:hover{border-color:rgba(255,255,255,.32);background:rgba(255,255,255,.1)}
  .acct-btn:active{transform:scale(.96)}
  .acct-btn:focus-visible{outline:2px solid #3FD8FF;outline-offset:3px}
  .acct-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
  .acct-face{position:absolute;inset:2px;border-radius:999px;display:grid;place-items:center;overflow:hidden;font:700 13px/1 inherit;letter-spacing:.02em;color:#fff;background:linear-gradient(135deg,#B95CFF,#FF5FD2 50%,#3FD8FF)}
  .acct-face img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .acct-btn[aria-expanded="true"]{border-color:#3FD8FF}
  .acct-dot{position:absolute;top:-1px;right:-1px;width:11px;height:11px;border-radius:999px;background:#34D399;border:2px solid var(--bg,#07070B)}
  .acct-menu{position:absolute;top:calc(100% + 10px);right:0;z-index:200;width:min(260px,calc(100vw - 24px));padding:6px;border-radius:16px;background:rgba(18,18,25,.96);border:1px solid rgba(255,255,255,.12);box-shadow:0 18px 50px rgba(0,0,0,.55);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:#F5F5F7;transform-origin:top right;animation:acct-in .16s cubic-bezier(.22,.8,.2,1)}
  .acct-menu[hidden]{display:none}
  @keyframes acct-in{from{opacity:0;transform:translateY(-4px) scale(.97)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.acct-menu{animation:none}}
  .acct-head{padding:10px 12px 10px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:4px}
  .acct-head small{display:block;font-size:11.5px;color:#A1A1AA;margin-bottom:3px}
  .acct-head b{display:block;font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .acct-head span{display:block;font-size:12.5px;color:#A1A1AA;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
  .acct-menu a,.acct-menu button.acct-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;border-radius:10px;background:none;color:#E4E4E7 !important;font:500 14px/1.2 inherit;text-align:left;text-decoration:none;cursor:pointer;margin:0 !important}
  .acct-menu a:hover,.acct-menu button.acct-item:hover,.acct-menu a:focus-visible,.acct-menu button.acct-item:focus-visible{background:rgba(255,255,255,.07);color:#fff !important;outline:none}
  .acct-menu svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
  .acct-menu a.acct-primary{justify-content:center;margin:6px 0 2px !important;padding:11px 12px;background:linear-gradient(100deg,#A855F7,#EC4899 45%,#6366F1);color:#fff !important;font-weight:600}
  .acct-menu a.acct-primary:hover{filter:brightness(1.08)}
  .acct-hint{padding:8px 12px 2px;font-size:12px;color:#A1A1AA}
  .acct-sep{height:1px;margin:4px 6px;background:rgba(255,255,255,.08)}
  .acct-out{color:#FF8A9B !important}
  [data-account]{display:none !important}
  .nav .wrap>.acct{margin-left:8px}
  .confirm-header{display:flex;align-items:center;justify-content:space-between}
  @media (max-width:700px){.acct-menu{position:fixed;top:70px;right:12px}}
  @media (max-width:480px){.topbar-inner{gap:8px}.topbar-inner .mainnav .btn{margin-left:0;padding-left:12px;padding-right:12px;font-size:13px}.topbar-inner>.acct{margin-left:2px}}
  `;

  function mountPoint() {
    return document.querySelector(".topbar-inner, .nav .wrap, .confirm-header");
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
  }

  function init() {
    const host = mountPoint();
    if (!host || host.querySelector(".acct")) return;
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.append(style);

    const root = document.createElement("div");
    root.className = "acct";
    root.setAttribute("data-no-i18n", "");
    root.innerHTML = `<button class="acct-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="acct-menu"></button><div class="acct-menu" id="acct-menu" hidden></div>`;
    // ganz rechts, aber auf kleinen Bildschirmen vor dem „Menü“-Knopf der alten Seiten
    const toggle = host.querySelector(":scope > .nav-toggle");
    host.insertBefore(root, toggle ? toggle : null);
    if (toggle) root.style.marginLeft = "8px";

    const btn = root.querySelector(".acct-btn");
    const menu = root.querySelector(".acct-menu");
    const state = { session: readSession(), name: "", avatar: "", admin: false };
    const cached = state.session && readCache(state.session.user.id);
    if (cached) { state.name = cached.name || ""; state.avatar = cached.avatar || ""; state.admin = !!cached.admin; }

    function render() {
      const s = state.session;
      btn.setAttribute("aria-label", t("Kontomenü"));
      if (s) {
        const label = state.name || s.user.user_metadata?.full_name || s.user.user_metadata?.name || s.user.email || "";
        const safeAvatar = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(state.avatar) ? state.avatar : "";
        const hadImg = btn.querySelector(".acct-face img");
        btn.innerHTML = `<span class="acct-face avatar" ${safeAvatar ? `data-avatar-path="${esc(safeAvatar)}"` : ""}>${esc(initials(label))}</span><span class="acct-dot" aria-hidden="true"></span>`;
        if (hadImg && safeAvatar) btn.querySelector(".acct-face").append(hadImg);
        else if (safeAvatar) showPhoto(safeAvatar);
        menu.innerHTML = `
          <div class="acct-head"><small>${t("Angemeldet als")}</small><b>${esc(label)}</b>${state.name && s.user.email ? `<span>${esc(s.user.email)}</span>` : ""}</div>
          <a href="/profil" role="menuitem">${ICONS.profil}${t("Mein Profil")}</a>
          <a href="/meine-karte" role="menuitem">${ICONS.karte}${t("Meine Karte")}</a>
          <a href="/nachrichten" role="menuitem">${ICONS.nachrichten}${t("Nachrichten")}</a>
          <a href="/projekte" role="menuitem">${ICONS.projekte}${t("Projekte")}</a>
          ${state.admin ? `<a href="/admin" role="menuitem">${ICONS.admin}${t("Admin-Bereich")}</a>` : ""}
          <div class="acct-sep"></div>
          <button class="acct-item acct-out" type="button" role="menuitem" data-acct-logout>${ICONS.logout}${t("Abmelden")}</button>`;
      } else {
        btn.innerHTML = ICON_USER;
        const next = location.pathname.replace(/^\/|\.html$/g, "");
        const loginHref = /^[a-z-]{2,30}$/.test(next) && !["login", "mitglied-werden"].includes(next) ? `/login?next=${next}` : "/login";
        menu.innerHTML = `
          <a href="${loginHref}" role="menuitem">${ICONS.login}${t("Einloggen")}</a>
          <div class="acct-hint">${t("Noch kein Konto?")}</div>
          <a class="acct-primary" href="/mitglied-werden" role="menuitem">${ICONS.neu}${t("Konto anlegen")}</a>`;
      }
      menu.setAttribute("role", "menu");
    }

    async function showPhoto(path) {
      if (typeof hydrateAvatar === "function") return; // avatars.js übernimmt das
      try {
        if (photoPath !== path) {
          const c = await getClient();
          const { data, error } = await c.storage.from("avatars").download(path);
          if (error || !data) return;
          if (photoUrl) URL.revokeObjectURL(photoUrl);
          photoUrl = URL.createObjectURL(data); photoPath = path;
        }
        const face = btn.querySelector(".acct-face");
        if (!face || face.querySelector("img")) return;
        const img = new Image(); img.alt = ""; img.src = photoUrl; face.append(img);
      } catch { /* Initialen bleiben */ }
    }

    const items = () => [...menu.querySelectorAll('[role="menuitem"]')];
    function open(focusFirst) {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      if (focusFirst) items()[0]?.focus();
    }
    function close(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (refocus) btn.focus();
    }
    btn.addEventListener("click", () => (menu.hidden ? open(false) : close(false)));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); open(true); }
    });
    menu.addEventListener("keydown", (e) => {
      const list = items(); const i = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close(false);
    });
    document.addEventListener("click", (e) => { if (!root.contains(e.target)) close(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(true); });

    menu.addEventListener("click", async (e) => {
      const out = e.target.closest("[data-acct-logout]");
      if (!out) return;
      out.disabled = true;
      try {
        const c = await getClient();
        await c.auth.signOut();
      } catch { /* notfalls lokal abmelden */ }
      try { localStorage.removeItem(TOKEN); localStorage.removeItem(CACHE); } catch { /* egal */ }
      location.href = "/";
    });

    async function loadProfile() {
      if (!state.session) return;
      try {
        const c = await getClient();
        const { data: { session } } = await c.auth.getSession();
        if (!session) { state.session = null; render(); return; }
        state.session = { user: session.user };
        const { data } = await c.from("profiles").select("name, avatar_path, is_admin").eq("id", session.user.id).maybeSingle();
        if (data) {
          state.name = data.name || ""; state.avatar = data.avatar_path || ""; state.admin = data.is_admin === true;
          writeCache({ id: session.user.id, name: state.name, avatar: state.avatar, admin: state.admin });
        }
        render();
      } catch { /* Initialen reichen */ }
    }

    // Eingeloggt: In der Kopfzeile „Projekt anlegen“ statt „Auf die Warteliste“
    function swapCta() {
      if (!state.session) return;
      const header = host.closest("header") || host;
      header.querySelectorAll('a.btn[href$="#warteliste"]').forEach((a) => {
        a.href = "/projekte?neu=1";
        a.textContent = "Projekt anlegen";
      });
    }

    render();
    swapCta();
    loadProfile();
    document.addEventListener("xyntal:lang", render);
    window.addEventListener("storage", (e) => { if (e.key === TOKEN) { state.session = readSession(); render(); loadProfile(); } });
    const c = client();
    if (c) c.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT" || ev === "SIGNED_IN") { state.session = readSession(); render(); loadProfile(); } });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
