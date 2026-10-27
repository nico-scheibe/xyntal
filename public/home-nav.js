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
  css.rel = "stylesheet"; css.href = "home-app.css?v=1";
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

  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.body.append(s);
  });
  (async () => {
    try {
      if (!window.supabase) await load("vendor/supabase.js?v=31");
      await load("config.js?v=31");
      await load("app.js?v=32");
      await load("notifications.js?v=32");
      await load("effects.js?v=31");
    } catch { /* ohne Netz bleibt die normale Startseite */ }
  })();
})();
