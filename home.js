// Startseite: Zeile für Zeile, eigener Zeiger, Lenis, Scroll.
// Bei prefers-reduced-motion bleibt alles stehen und lesbar.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;

  const lines = document.querySelectorAll(".display .line > span");
  if (!reduce && lines.length) {
    document.body.classList.add("will-reveal");
    lines.forEach((span, i) => {
      span.style.transitionDelay = `${0.05 + i * 0.08}s`;
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => document.body.classList.add("is-ready"));
    });
  }

  const scramble = (el) => {
    const text = el.textContent;
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let frame = 0;
    const tick = () => {
      el.textContent = [...text].map((ch, i) => {
        if (ch === " " || ch === "·" || frame / 2 > i) return text[i];
        return chars[(Math.random() * chars.length) | 0];
      }).join("");
      frame += 1;
      if (frame < text.length * 2 + 6) requestAnimationFrame(tick);
      else el.textContent = text;
    };
    tick();
  };
  if (!reduce) {
    const seen = new WeakSet();
    const watch = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || seen.has(entry.target)) return;
        seen.add(entry.target);
        scramble(entry.target);
        watch.unobserve(entry.target);
      });
    }, { threshold: 0.6 });
    document.querySelectorAll("[data-scramble]").forEach((el) => watch.observe(el));
  }

  if (fine && !reduce) {
    document.querySelectorAll(".tilt").forEach((card) => {
      card.addEventListener("pointermove", (event) => {
        const rect = card.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        card.style.setProperty("--mx", `${px * 100}%`);
        card.style.setProperty("--my", `${py * 100}%`);
        card.style.transform = `perspective(700px) rotateX(${(0.5 - py) * 7}deg) rotateY(${(px - 0.5) * 8}deg)`;
      });
      card.addEventListener("pointerleave", () => { card.style.transform = ""; });
    });
  }

  document.querySelectorAll(".roll").forEach((btn) => {
    btn.addEventListener("pointermove", (event) => {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      btn.style.setProperty("--my", `${event.clientY - rect.top}px`);
    });
  });

  const cursor = document.querySelector(".cursor");
  if (fine && !reduce && cursor) {
    document.documentElement.classList.add("has-cursor");
    let x = innerWidth / 2;
    let y = innerHeight / 2;
    let cx = x;
    let cy = y;
    let tx = x;
    let ty = y;
    window.addEventListener("pointermove", (event) => {
      const typing = event.target.closest("input, textarea");
      cursor.style.opacity = typing ? "0" : "1";
      x = event.clientX;
      y = event.clientY;
      const hot = !typing && event.target.closest("a, button");
      cursor.classList.toggle("is-hot", Boolean(hot));
      if (hot) {
        const rect = hot.getBoundingClientRect();
        tx = x + (rect.left + rect.width / 2 - x) * 0.28;
        ty = y + (rect.top + rect.height / 2 - y) * 0.28;
      } else {
        tx = x;
        ty = y;
      }
    });
    document.addEventListener("pointerleave", () => { cursor.style.opacity = "0"; });
    const follow = () => {
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(follow);
    };
    follow();
  }

  const coord = document.querySelector("[data-coord]");
  if (coord && fine) {
    window.addEventListener("pointermove", (event) => {
      const px = String(Math.round(event.clientX)).padStart(4, "0");
      const py = String(Math.round(event.clientY)).padStart(4, "0");
      coord.textContent = `x ${px}  y ${py}`;
    }, { passive: true });
  }

  const closeNav = () => {
    const nav = document.getElementById("main-nav");
    const toggle = document.querySelector(".nav-toggle");
    if (!nav || !nav.classList.contains("open")) return;
    nav.classList.remove("open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menü";
    }
  };

  if (reduce || !window.gsap || !window.ScrollTrigger) return;

  const gsap = window.gsap;
  gsap.registerPlugin(window.ScrollTrigger);

  if (window.Lenis) {
    const lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on("scroll", window.ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const id = link.getAttribute("href");
        if (!id || id.length < 2) return;
        const target = document.querySelector(id);
        if (!target) return;
        event.preventDefault();
        closeNav();
        lenis.scrollTo(target, { offset: -8 });
      });
    });
    if (location.hash.length > 1) {
      const target = document.querySelector(location.hash);
      if (target) lenis.scrollTo(target, { offset: -8, immediate: true });
    }
  }

  const show = (batch) => gsap.to(batch, {
    opacity: 1,
    y: 0,
    duration: 0.9,
    stagger: 0.06,
    ease: "power3.out",
    overwrite: true,
  });
  gsap.set("[data-rise]", { opacity: 0, y: 28 });
  window.ScrollTrigger.batch("[data-rise]", {
    start: "top 90%",
    once: true,
    onEnter: show,
  });
  window.ScrollTrigger.refresh();
  show([...document.querySelectorAll("[data-rise]")].filter((el) => el.getBoundingClientRect().top < innerHeight * 0.92));

  gsap.to(".display", {
    yPercent: -8,
    ease: "none",
    scrollTrigger: { trigger: ".stage", start: "top top", end: "bottom top", scrub: true },
  });

  const spine = document.querySelector(".spine line");
  if (spine && matchMedia("(min-width: 900px)").matches) {
    gsap.to(spine, {
      strokeDashoffset: 0,
      ease: "none",
      scrollTrigger: { trigger: "main", start: "top center", end: "bottom bottom", scrub: true },
    });
  }

  const steps = [...document.querySelectorAll("[data-step]")];
  const how = document.querySelector(".how");
  if (how && steps.length && matchMedia("(min-width: 900px)").matches) {
    steps.forEach((el, index) => { if (index) el.classList.add("is-dim"); });
    window.ScrollTrigger.create({
      trigger: how,
      start: "top 72px",
      end: "+=150%",
      pin: true,
      anticipatePin: 1,
      scrub: 0.35,
      onUpdate: (self) => {
        const current = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
        steps.forEach((el, index) => {
          el.classList.toggle("is-on", index === current);
          el.classList.toggle("is-dim", index !== current);
        });
      },
    });
  }

  const quote = document.querySelector(".pull blockquote");
  if (quote) {
    gsap.to(quote, {
      yPercent: -6,
      ease: "none",
      scrollTrigger: { trigger: "#ueber", start: "top bottom", end: "bottom top", scrub: true },
    });
  }
})();
