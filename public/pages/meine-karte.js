// Im Profilbereich eingebettet: ohne Kopf- und Fußzeile, Links öffnen die ganze Seite
if (/[?&]embed=1(&|$)/.test(location.search) && window.parent !== window) {
  document.documentElement.classList.add("mk-embed");
  const base = document.createElement("base"); base.target = "_top"; document.head.append(base);
}

// Editor: Reiter Inhalt · Design · Bilder & Banner (wie in der App)
document.addEventListener("DOMContentLoaded", () => {
  const tabs = [...document.querySelectorAll("[data-bf-tab]")];
  if (!tabs.length) return;
  const show = (name, focus = false) => {
    tabs.forEach((t) => {
      const on = t.dataset.bfTab === name;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    document.querySelectorAll("[data-bf-panel]").forEach((p) => { p.hidden = p.dataset.bfPanel !== name; });
  };
  tabs.forEach((t) => t.addEventListener("click", () => show(t.dataset.bfTab)));
  tabs[0].parentElement.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const i = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    show(next.dataset.bfTab, true);
  });
  // Fehlt der Wunsch-Link beim Speichern, zum Reiter mit dem Feld springen
  document.addEventListener("invalid", (e) => {
    const panel = e.target.closest && e.target.closest("[data-bf-panel]");
    if (panel && panel.hidden) show(panel.dataset.bfPanel);
  }, true);
  const handle = document.getElementById("bf-handle");
  if (handle) new MutationObserver(() => {
    if (handle.hasAttribute("aria-invalid")) show("inhalt");
  }).observe(handle, { attributes: true, attributeFilter: ["aria-invalid"] });
});

