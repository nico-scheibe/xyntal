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
})();
