// xyntal.de/name: Wunsch-Link zur Karte weiterleiten (bis der Server die Adresse selbst kennt)
(function () {
  var h = location.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  if (/^[a-z0-9][a-z0-9_-]{2,19}$/.test(h)) location.replace("/u#" + h);
})();
