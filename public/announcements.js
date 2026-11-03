// Ankündigungen: dieselben Banner, die angemeldete Mitglieder in der Xyntal-App sehen,
// auch auf xyntal.de – unter der Kopfzeile, je nach Art gefärbt (Hinweis, Warnung, Wartung).
// Quelle ist der App-Server (GET /announcements/active); veröffentlicht wird im Admin-Bereich
// (App oder /admin → Ankündigungen). Lädt account-menu.js nur für angemeldete Mitglieder.
// Läuft still: ohne App-Sitzung oder bei 2FA-Pflicht erscheint einfach kein Banner.
// Weggeklickte Banner merkt sich der Browser (localStorage) – wie die App pro Gerät.
(() => {
  if (window.__xyntalAnnouncements) return;
  window.__xyntalAnnouncements = true;
  const DISMISSED = "xyntal-ann-dismissed";
  const REFRESH = 5 * 60 * 1000;
  const EN = { info: "Notice", warning: "Warning", maintenance: "Maintenance", close: "Dismiss" };
  const DE = { info: "Hinweis", warning: "Warnung", maintenance: "Wartung", close: "Ausblenden" };
  const t = (k) => (document.documentElement.lang === "en" ? EN : DE)[k];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const readDismissed = () => { try { const v = JSON.parse(localStorage.getItem(DISMISSED) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeDismissed = (list) => { try { localStorage.setItem(DISMISSED, JSON.stringify(list.slice(-50))); } catch { /* ohne Speicher: pro Seite */ } };

  const CSS = `
  .xy-ann{position:relative;z-index:40;margin:0;padding:0;list-style:none;font-family:var(--f-text,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif)}
  .xy-ann li{display:flex;align-items:flex-start;gap:14px;padding:11px max(16px,calc((100vw - 1160px)/2));border-left:3px solid var(--xy-ann-accent);border-bottom:1px solid rgba(255,255,255,.08);background:var(--xy-ann-soft);color:#F5F5F7;animation:xy-ann-in .24s cubic-bezier(.22,.8,.2,1)}
  .xy-ann li.is-info{--xy-ann-accent:#3FE0F0;--xy-ann-soft:rgba(63,224,240,.12)}
  .xy-ann li.is-warning{--xy-ann-accent:#FFB84D;--xy-ann-soft:rgba(255,184,77,.12)}
  .xy-ann li.is-maintenance{--xy-ann-accent:#F56A8F;--xy-ann-soft:rgba(245,106,143,.12)}
  .xy-ann-kind{flex:none;margin-top:3px;padding:2px 8px;border-radius:999px;font:600 10px/1.5 inherit;letter-spacing:.08em;text-transform:uppercase;color:var(--xy-ann-accent);border:1px solid var(--xy-ann-accent)}
  .xy-ann-text{flex:1;min-width:0;display:grid;gap:2px}
  .xy-ann-text b{font-size:13.5px;font-weight:600}
  .xy-ann-text p{margin:0;font-size:12.5px;line-height:1.5;color:rgba(245,245,247,.78);white-space:pre-wrap;overflow-wrap:anywhere}
  .xy-ann-x{flex:none;width:30px;height:30px;border:0;border-radius:8px;background:transparent;color:rgba(245,245,247,.7);font-size:20px;line-height:1;cursor:pointer}
  .xy-ann-x:hover{background:rgba(255,255,255,.1);color:#fff}
  .xy-ann-x:focus-visible{outline:2px solid #3FD8FF;outline-offset:2px}
  @keyframes xy-ann-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
  @media (prefers-reduced-motion:reduce){.xy-ann li{animation:none}}
  @media (max-width:600px){.xy-ann li{padding:10px 14px}.xy-ann-kind{display:none}}`;

  let host = null;
  function mount() {
    if (host) return host;
    const header = document.querySelector("header.nav");
    if (!header) return null;
    const style = document.createElement("style"); style.textContent = CSS; document.head.append(style);
    host = document.createElement("ul");
    host.className = "xy-ann";
    host.setAttribute("aria-label", document.documentElement.lang === "en" ? "Announcements" : "Ankündigungen");
    host.setAttribute("data-no-i18n", "");
    header.after(host);
    host.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dismiss]"); if (!b) return;
      writeDismissed([...readDismissed(), b.dataset.dismiss]);
      b.closest("li").remove();
      if (!host.children.length) host.hidden = true;
    });
    return host;
  }

  function render(list) {
    const el = mount(); if (!el) return;
    const dismissed = new Set(readDismissed());
    const shown = list.filter((a) => a && a.id && !dismissed.has(a.id));
    el.hidden = shown.length === 0;
    el.innerHTML = shown.map((a) => {
      const kind = ["info", "warning", "maintenance"].includes(a.kind) ? a.kind : "info";
      return `<li class="is-${kind}" role="status"><span class="xy-ann-kind">${esc(t(kind))}</span><div class="xy-ann-text"><b>${esc(a.title)}</b>${a.body ? `<p>${esc(a.body)}</p>` : ""}</div><button class="xy-ann-x" type="button" data-dismiss="${esc(a.id)}" aria-label="${esc(t("close"))}">×</button></li>`;
    }).join("");
  }

  function ensureApi() {
    if (window.XyntalApp) return Promise.resolve();
    return (window.__xyntalAppApi = window.__xyntalAppApi || new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = "/app-api.js?v=4"; sc.onload = res; sc.onerror = rej; document.head.append(sc);
    }));
  }

  let timer = 0;
  async function refresh() {
    if (document.hidden) return;
    try {
      await ensureApi();
      const data = await window.XyntalApp.api("GET", "/announcements/active", undefined, { silent: true });
      render(Array.isArray(data.announcements) ? data.announcements : []);
    } catch (err) {
      // Abgemeldet, 2FA nötig oder Server nicht erreichbar: kein Banner, aber auch kein Lärm.
      if (err && err.code === "SIGNED_OUT") { clearInterval(timer); if (host) host.hidden = true; }
    }
  }
  const start = () => { refresh(); timer = setInterval(refresh, REFRESH); document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); }); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
