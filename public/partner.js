// Xyntal – Partnerseite: dezentes Einblenden beim Scrollen.
// Setzt .is-visible auf .partner-reveal-Elemente (Animation steht in partner.html).
// Läuft ohne Bibliotheken; ohne Unterstützung sofort sichtbar.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!still && "IntersectionObserver" in window) document.documentElement.classList.add("partner-anim");
  const els = document.querySelectorAll(".partner-reveal");
  if (still || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("is-visible");
      io.unobserve(e.target);
    }
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
})();
