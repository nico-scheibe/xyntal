// Im Profilbereich eingebettet: ohne Kopf- und Fußzeile, Links öffnen die ganze Seite
if (/[?&]embed=1(&|$)/.test(location.search) && window.parent !== window) {
  document.documentElement.classList.add("mk-embed");
  const base = document.createElement("base"); base.target = "_top"; document.head.append(base);
}
