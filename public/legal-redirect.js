/* Die Datenschutzerklärung hat seit November 2026 eine eigene Seite (/datenschutz).
   Alte Links wie /impressum#datenschutz oder /impressum#deine-rechte (auch in verschickten Mails) landen dort. */
(function () {
  var h = location.hash.slice(1);
  var moved = { datenschutz: '', 'deine-rechte': '#deine-rechte', app: '#app', beta: '#beta', assistent: '#assistent', kuendigung: '#kuendigung' };
  if (Object.prototype.hasOwnProperty.call(moved, h)) location.replace('/datenschutz' + moved[h]);
})();
