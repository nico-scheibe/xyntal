// Bekannte Adressen ohne eigene Seite weiterleiten, bevor die Karte (u.html) oder ein Projekt (projekte.html) lädt.
// Der Server schickt unbekannte /name (3–20 Zeichen, auch mit Bindestrich) an u.html, längere /wort-wort an projekte.html.
(function () {
  var to = {
    "events": "/community", "treffen": "/community",
    "rechte": "/datenschutz#deine-rechte", "deine-rechte": "/datenschutz#deine-rechte",
    "kontakt": "/impressum#impressum", "warteliste": "/#warteliste", "newsletter": "/#warteliste",
    "registrieren": "/login#registrieren", "register": "/login#registrieren", "signup": "/login#registrieren",
    "karte": "/meine-karte", "pricing": "/preise", "kuendigung": "/kuendigen", "kündigen": "/kuendigen", "cancel": "/kuendigen", "terms": "/agb", "nutzungsbedingungen": "/agb", "widerrufsrecht": "/widerruf", "widerrufsbelehrung": "/widerruf", "withdrawal": "/widerruf", "tarife": "/preise", "firmen": "/unternehmen", "business": "/unternehmen", "enterprise": "/unternehmen", "firma": "/unternehmen", "companies": "/unternehmen", "kosten": "/preise", "team": "/mitglieder", "hilfe": "/beta", "help": "/beta", "support": "/beta"
  }[location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase()];
  if (to) location.replace(to);
})();
