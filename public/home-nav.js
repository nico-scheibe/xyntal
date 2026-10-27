// Startseite für Angemeldete: dieselbe Kopfzeile wie auf den App-Seiten
// (Suche, Benachrichtigungen, Nachrichten). Besucher ohne Konto bekommen die schlanke Startseite
// ohne Supabase – die Bibliotheken werden nur bei einer Sitzung nachgeladen.
(() => {
  let logged = false;
  try { logged = !!localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token"); } catch { /* privat */ }
  const bar = document.querySelector(".topbar-inner");
  const nav = document.getElementById("hauptnavigation");
  if (!logged || !bar || !nav) return;

  document.body.classList.add("is-member");
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "home-app.css?v=2";
  document.head.append(css);

  // Hauptnavigation wie auf den anderen Seiten: Nachrichten + Warteliste (Demo-Anker entfallen)
  nav.querySelectorAll('a[href^="#"]:not(.btn)').forEach((a) => { a.hidden = true; });
  const msg = document.createElement("a");
  msg.href = "nachrichten"; msg.dataset.messages = ""; msg.hidden = true; msg.textContent = "Nachrichten";
  nav.prepend(msg);

  // Platz für die Glocke (notifications.js hängt sich an #main-nav)
  const tools = document.createElement("div");
  tools.className = "home-tools"; tools.id = "main-nav";
  bar.insertBefore(tools, nav);

  // Suchen-Knopf wie auf den App-Seiten; öffnet die ⌘K-Palette aus effects.js
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const search = document.createElement("button");
  search.type = "button"; search.className = "cmdk-trigger";
  search.setAttribute("aria-label", "Befehlspalette öffnen");
  search.innerHTML = `Suchen … <kbd>${isMac ? "⌘" : "Strg"}</kbd><kbd>K</kbd>`;
  search.addEventListener("click", () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: isMac, ctrlKey: !isMac, bubbles: true })));
  bar.insertBefore(search, bar.querySelector(".lang-switch") || tools);
  // i18n.js setzt den Sprachumschalter evtl. erst später ein – dann Suchen davor schieben
  new MutationObserver(() => {
    const sw = bar.querySelector(".lang-switch");
    if (sw && search.nextElementSibling !== sw) bar.insertBefore(search, sw);
  }).observe(bar, { childList: true });

  // Inhalte der Startseite für Mitglieder: statt Warteliste direkt loslegen
  const hero = document.querySelector(".hero-inner");
  if (hero) {
    const pill = hero.querySelector(".pill");
    if (pill) pill.lastChild.textContent = "Du bist dabei";
    const lead = hero.querySelector(".hero-lead");
    if (lead) lead.textContent = "Finde Mitgründer, Entwickler und Designer, die mit dir etwas aufbauen wollen.";
    const form = hero.querySelector(".hero-signup");
    if (form) {
      form.hidden = true;
      const actions = document.createElement("div");
      actions.className = "hero-member-actions";
      actions.innerHTML = '<a class="btn btn-primary" href="/projekte?neu=1">Projekt anlegen</a><a class="btn btn-glass" href="/projekte">Projekte entdecken</a>';
      form.after(actions);
    }
  }
  const bridge = document.querySelector("[data-bridge]");
  if (bridge) { bridge.href = "/projekte?neu=1"; bridge.textContent = "Projekt mit diesem Team anlegen"; }
  const join = document.querySelector("[data-card-join]");
  if (join) { join.href = "/meine-karte"; join.textContent = "Meine Karte bearbeiten"; }
  const launch = document.getElementById("warteliste");
  if (launch) launch.hidden = true;
  document.querySelectorAll('a[href="#warteliste"]').forEach((a) => { if (!a.closest("header")) a.href = "/projekte?neu=1"; });

  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.body.append(s);
  });
  (async () => {
    try {
      if (!window.supabase) await (window.__xyntalSb = window.__xyntalSb || new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = "/vendor/supabase.js?v=31"; sc.onload = res; sc.onerror = rej; document.head.append(sc);
    }));
      await load("config.js?v=31");
      await load("app.js?v=32");
      await load("notifications.js?v=32");
      await load("effects.js?v=31");
    } catch { /* ohne Netz bleibt die normale Startseite */ }
  })();
})();
