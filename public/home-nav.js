// Startseite für Angemeldete: Inhalte für Mitglieder statt Warteliste, dazu Nachrichten und Benachrichtigungen.
// Die Kopfzeile ist auf allen Seiten gleich (site-header.css); die Suche kommt aus effects.js.
// Besucher ohne Konto bekommen die schlanke Startseite ohne Supabase.
(() => {
  let logged = false;
  try { logged = !!localStorage.getItem("sb-db-auth-token"); } catch { /* privat */ }
  if (!logged) return;

  document.body.classList.add("is-member");
  const css = document.createElement("link");
  css.rel = "stylesheet"; css.href = "home-app.css?v=5";
  document.head.append(css);
  // Inhalte der Startseite für Mitglieder: statt Warteliste direkt loslegen
  // Startseite (start.css): Mitglieder sehen statt der Beta-Bewerbung ihre Vorschläge und die Mitglieder
  const actions = document.querySelector(".hero-actions");
  if (actions) {
    actions.innerHTML = '<a class="button" href="/fuer-dich">Passende Leute ansehen</a><a class="textlink" href="/mitglieder">Mitglieder entdecken <span aria-hidden="true">→</span></a>';
  }
  const betaCta = document.querySelector(".beta-cta .button");
  if (betaCta) { betaCta.href = "/fuer-dich"; betaCta.textContent = "Zu deinen Vorschlägen"; }
  // Ältere Startseite (home.css)
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
      actions.innerHTML = '<a class="btn btn-primary" href="/fuer-dich">Passende Leute ansehen</a><a class="btn btn-glass" href="/mitglieder">Mitglieder entdecken</a>';
      form.after(actions);
    }
  }
  const bridge = document.querySelector("[data-bridge]");
  if (bridge) { bridge.href = "/fuer-dich"; bridge.textContent = "Dein Team finden"; }
  const join = document.querySelector("[data-card-join]");
  if (join) { join.href = "/meine-karte"; join.textContent = "Meine Karte bearbeiten"; }
  const launch = document.getElementById("warteliste");
  if (launch) launch.hidden = true;
  document.querySelectorAll('a[href="#warteliste"]').forEach((a) => { if (!a.closest("header")) a.href = "/fuer-dich"; });

  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.body.append(s);
  });
  (async () => {
    try {
      if (!window.supabase) await (window.__xyntalSb = window.__xyntalSb || new Promise((res, rej) => {
      const sc = document.createElement("script"); sc.src = "/vendor/supabase.js?v=31"; sc.onload = res; sc.onerror = rej; document.head.append(sc);
    }));
      await load("config.js?v=31");
      await load("app.js?v=36");
      await load("notifications.js?v=32");
    } catch { /* ohne Netz bleibt die normale Startseite */ }
  })();
})();
