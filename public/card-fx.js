// Xyntal-Karte: Hover-Effekt (design.fx). Gilt für jede .my-card[data-fx="soft"|"strong"] auf der Seite –
// Builder-Vorschau, öffentliche Karte und Mitglieder-Kacheln. Aussehen: card-fx.css.
// Nur mit Maus oder Stift: Auf Touch bleibt die Karte ruhig (kein Wackeln beim Scrollen).
// prefers-reduced-motion: keine Neigung, nur der Lichtschein folgt der Maus.
(() => {
  const MAX = { soft: 7, strong: 13 }; // Grad an der Kante
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const SEL = '.my-card[data-fx="soft"], .my-card[data-fx="strong"]';
  let card = null, rect = null, last = null, raf = 0;

  function release() {
    if (!card) return;
    card.classList.remove("fx-on");
    card.style.removeProperty("--fx-rot");
    card = null; rect = null; last = null;
  }

  function apply() {
    raf = 0;
    if (!card || !last) return;
    const level = card.dataset.fx;
    if (!MAX[level] || !card.isConnected) { release(); return; }
    const x = Math.min(1, Math.max(0, (last.x - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (last.y - rect.top) / rect.height));
    card.style.setProperty("--fx-x", `${(x * 100).toFixed(1)}%`);
    card.style.setProperty("--fx-y", `${(y * 100).toFixed(1)}%`);
    card.style.setProperty("--fx-sx", `${((x * 0.7 + y * 0.3) * 100).toFixed(1)}%`);
    if (still.matches) { card.style.removeProperty("--fx-rot"); return; }
    // Die Stelle unter dem Zeiger gibt etwas nach: oben → rotateX+, links → rotateY−
    const rx = (0.5 - y) * MAX[level], ry = (x - 0.5) * MAX[level];
    const angle = Math.hypot(rx, ry);
    if (angle < 0.05) card.style.removeProperty("--fx-rot");
    else card.style.setProperty("--fx-rot", `${rx.toFixed(3)} ${ry.toFixed(3)} 0 ${angle.toFixed(2)}deg`);
  }

  document.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    if (card && rect) {
      // Geht der Zeiger aus der (beim Betreten gemessenen) Fläche, ist Schluss – kein Flackern an der Kante
      const out = e.clientX < rect.left - 2 || e.clientX > rect.right + 2 || e.clientY < rect.top - 2 || e.clientY > rect.bottom + 2;
      if (out) release();
    }
    if (!card) {
      const hit = e.target.closest?.(SEL);
      if (!hit) return;
      card = hit; rect = hit.getBoundingClientRect();
      card.classList.add("fx-on");
    }
    last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  }, { passive: true });

  document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) release(); }, { passive: true });
  addEventListener("scroll", release, { passive: true, capture: true });
  addEventListener("blur", release);
})();
