// Xyntal – Interaktions-Schicht: Entschlüsseln-Effekt,
// Scroll-Reveal, Spotlight auf Karten und Neigung der App-Vorschau.
// Läuft auf allen Seiten, ohne Bibliotheken.
(() => {
  document.documentElement.classList.add("js");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------
     Entschlüsseln: Text löst sich aus Zeichen auf (Elemente mit data-scramble)
     --------------------------------------------------------------- */
  const GLYPHS = "!<>-_\\/[]{}—=+*^?#01ABCDEFX";
  function scramble(el) {
    // Nur Textknoten anfassen, damit <em> & Co. erhalten bleiben
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push({ node: walker.currentNode, text: walker.currentNode.textContent });
    const total = nodes.reduce((s, n) => s + n.text.length, 0);
    const start = performance.now();
    const dur = Math.min(1100, 380 + total * 18);
    el.setAttribute("aria-label", el.textContent.replace(/\s+/g, " ").trim());
    el.style.minHeight = el.offsetHeight + "px";
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      let offset = 0;
      for (const n of nodes) {
        let out = "";
        for (let i = 0; i < n.text.length; i++) {
          const c = n.text[i];
          const reveal = (offset + i) / total;
          out += c === " " || p >= reveal + 0.12 ? c : p > reveal - 0.25 ? GLYPHS[(Math.random() * GLYPHS.length) | 0] : " ";
        }
        n.node.textContent = out;
        offset += n.text.length;
      }
      if (p < 1) requestAnimationFrame(frame);
      else { nodes.forEach((n) => (n.node.textContent = n.text)); el.style.minHeight = ""; }
    }
    requestAnimationFrame(frame);
  }
  const calm = document.body.matches(".home, .page-404, .confirm-page");
  if (!still && !calm) document.querySelectorAll("[data-scramble]").forEach((el) => {
    if (document.fonts?.ready) document.fonts.ready.then(() => scramble(el)); else scramble(el);
  });

  /* ---------------------------------------------------------------
     Scroll-Reveal mit Staffelung innerhalb eines Rasters
     --------------------------------------------------------------- */
  const revealables = calm ? [] : document.querySelectorAll(
    ".section-head, .feature, .card, .plan, .perk, .list li, .rail li, .matrix-cell, .event-info, .event form, .mac, .quote, .code, .preview-stage"
  );
  revealables.forEach((el) => {
    el.classList.add("reveal");
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    el.style.setProperty("--d", `${Math.min(siblings.indexOf(el), 5) * 70}ms`);
  });
  if (still || !("IntersectionObserver" in window)) {
    revealables.forEach((el) => el.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealables.forEach((el) => io.observe(el));
  }

  /* ---------------------------------------------------------------
     Spotlight: Licht folgt dem Mauszeiger auf Karten
     --------------------------------------------------------------- */
  document.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.(".feature, .card, .plan, .perk, .list li");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ---------------------------------------------------------------
     Neigung der App-Vorschau zur Maus
     --------------------------------------------------------------- */
  const stage = document.querySelector(".preview-stage");
  const win = stage?.querySelector(".app-preview");
  if (stage && win && !still && matchMedia("(hover: hover)").matches) {
    let raf = 0;
    stage.addEventListener("pointermove", (e) => {
      const r = win.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        win.style.transform = `rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg) translateZ(0)`;
      });
    });
    stage.addEventListener("pointerleave", () => { win.style.transform = ""; });
  }

  /* ---------------------------------------------------------------
     App-Vorschau „lebt“: Aufgaben haken sich ab, Ringe zählen hoch
     --------------------------------------------------------------- */
  if (win && !still) {
    win.querySelectorAll(".ring[data-label]").forEach((ring) => {
      const target = +ring.dataset.label;
      let v = 0;
      const io = new IntersectionObserver(([en]) => {
        if (!en.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        (function step(now) {
          const p = Math.min(1, (now - t0) / 1200);
          v = Math.round(target * (1 - Math.pow(1 - p, 3)));
          ring.style.setProperty("--p", v);
          ring.dataset.label = v;
          if (p < 1) requestAnimationFrame(step);
        })(t0);
      });
      io.observe(ring);
    });
    const checks = [...win.querySelectorAll(".app-check")];
    let i = 0;
    setInterval(() => {
      if (document.hidden) return;
      const c = checks[i % checks.length];
      c.classList.toggle("done");
      i++;
    }, 2400);
  }
})();
