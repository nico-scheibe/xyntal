/* Läuft vor dem ersten Zeichnen (im <head>, ohne defer): setzt die JS-Klasse. Eigene Datei, weil die Website Inline-Skripte
   per Content-Security-Policy verbietet (script-src 'self'). */
(function () {
  var d = document.documentElement;
  d.classList.remove('no-js'); d.classList.add('js');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calm) d.classList.add('calm');
  // Logo-Animation (WebGL) nur ab 860 px und ohne reduzierte Bewegung. Sonst steht das SVG (js/hero-gl.js).
  if (calm || !window.matchMedia('(min-width: 860px)').matches) d.classList.add('no-gl');
  // Angemeldet? Dann verschwinden „Konto anlegen“-Knöpfe sofort ([data-apply]) und der Ersatz für Mitglieder
  // erscheint ([data-if~="in"], s. css/neu.css) – ohne Aufblitzen, weil das hier vor dem ersten Zeichnen läuft.
  try {
    var ses = JSON.parse(localStorage.getItem('sb-db-auth-token') || 'null');
    if (ses && (ses.user || (ses.currentSession && ses.currentSession.user))) d.classList.add('beta-in');
  } catch (e) {}
})();
