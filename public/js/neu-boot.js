/* Läuft vor dem ersten Zeichnen (im <head>, ohne defer): setzt die JS-Klasse und
   entscheidet, ob das Intro läuft. Eigene Datei, weil die Website Inline-Skripte
   per Content-Security-Policy verbietet (script-src 'self'). */
(function () {
  var d = document.documentElement;
  d.classList.remove('no-js'); d.classList.add('js');
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var seen = false;
  try { seen = sessionStorage.getItem('xy-intro') === '1'; } catch (e) {}
  if (calm) d.classList.add('calm');
  if (!calm && !seen) d.classList.add('intro-on');
  // Schon in der Beta oder beworben? Gemerkten Stand sofort anwenden, damit der
  // „Bewerben“-Knopf gar nicht erst aufblitzt. Abgeglichen wird in neu-konto.js.
  try {
    var ses = JSON.parse(localStorage.getItem('sb-db-auth-token') || 'null');
    var b = JSON.parse(localStorage.getItem('xy-beta') || 'null');
    if (ses && ses.user && b && b.uid === ses.user.id && (b.s === 'in' || b.s === 'applied')) d.classList.add('beta-' + b.s);
  } catch (e) {}
})();
