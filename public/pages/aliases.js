// Bekannte Adressen ohne eigene Seite weiterleiten, bevor die Karte (u.html) oder ein Projekt (projekte.html) lädt.
// Der Server schickt unbekannte /name an u.html und /wort-wort an projekte.html.
(function () {
  var to = {
    "events": "/community", "treffen": "/community",
    "datenschutz": "/impressum#datenschutz", "rechte": "/impressum#deine-rechte", "deine-rechte": "/impressum#deine-rechte",
    "kontakt": "/impressum#impressum", "warteliste": "/#warteliste", "newsletter": "/#warteliste",
    "registrieren": "/mitglied-werden", "register": "/mitglied-werden", "signup": "/mitglied-werden",
    "karte": "/meine-karte", "team": "/mitglieder", "hilfe": "/beta", "help": "/beta", "support": "/beta"
  }[location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase()];
  if (to) location.replace(to);
})();
