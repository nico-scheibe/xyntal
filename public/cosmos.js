// Xyntal – kleine gemeinsame Helfer für die Unterseiten:
// stellt den Logo-Verlauf (#x-mark-grad) für alle SVG-Logos bereit. Keine Hintergrund-Effekte mehr.
(() => {
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true");
  defs.style.position = "absolute";
  defs.innerHTML = '<defs><linearGradient id="x-mark-grad" gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="20" y2="20">'
    + '<stop offset="0" stop-color="#B95CFF"/><stop offset=".45" stop-color="#FF5FD2"/><stop offset="1" stop-color="#3FD8FF"/></linearGradient></defs>';
  document.body.prepend(defs);
})();
