// Xyntal – Startseite: „Heute / Mit Xyntal“.
// Eine Grafik mit Punkten (= Leute) erzählt beim Scrollen das Problem und die Lösung.
// Jeder Schritt (.story-step[data-step]) hat einen Zielzustand; die Punkte gleiten dorthin.
// Läuft nur, solange der Abschnitt sichtbar ist. Bei „Bewegung reduzieren“ springt die Grafik.
(() => {
  const root = document.querySelector("[data-story]");
  if (!root) return;
  const stage = root.querySelector(".story-stage");
  const svg = stage.querySelector("svg");
  const tagLayer = stage.querySelector(".story-tags");
  const phaseEl = stage.querySelector(".story-phase");
  const dotsEl = stage.querySelector(".story-dots");
  const steps = [...root.querySelectorAll(".story-step")];
  const NS = "http://www.w3.org/2000/svg";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const css = getComputedStyle(document.documentElement);
  const C = {
    text: css.getPropertyValue("--text").trim() || "#ECEAE4",
    dim: css.getPropertyValue("--text-3").trim() || "#73716B",
    line: css.getPropertyValue("--line-2").trim() || "#4A4A4A",
    key: css.getPropertyValue("--key").trim() || "#8FB8FF",
  };

  // ---------- Leute ----------
  // 0 = du · 1–3 = passen · 4–6 = Gespräche, die scheitern · Rest = alle anderen
  const N = 31, MATCH = [1, 2, 3], FAIL = [4, 5, 6];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const people = Array.from({ length: N }, (_, i) => {
    let u, v;
    do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; } while (Math.hypot(u, v * 0.9) < 0.3);
    return { i, u, v, ph: rnd() * Math.PI * 2, sp: 0.4 + rnd() * 0.5,
      x: 0, y: 0, o: 0, r: 4, c: [0, 0, 0] };
  });

  const hex = (h) => { const n = parseInt(h.replace("#", ""), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const RGB = { text: hex(C.text), dim: hex(C.dim), key: hex(C.key) };

  const lineG = document.createElementNS(NS, "g");
  const dotG = document.createElementNS(NS, "g");
  const pulse = document.createElementNS(NS, "circle");
  pulse.setAttribute("r", "3"); pulse.setAttribute("fill", C.key); pulse.setAttribute("opacity", "0");
  svg.append(lineG, dotG, pulse);
  people.forEach((p) => { p.el = document.createElementNS(NS, "circle"); dotG.append(p.el); });
  const halo = document.createElementNS(NS, "circle");
  halo.setAttribute("fill", "none"); halo.setAttribute("stroke", C.text); halo.setAttribute("stroke-width", "1");
  dotG.append(halo);

  // ---------- Schilder ----------
  const TAGS = [
    { node: 4, dy: -24, text: "keine Zeit", steps: [1], fail: 0 },
    { node: 5, dy: -24, text: "nur gegen Bezahlung", steps: [1], fail: 1 },
    { node: 6, dy: 24, text: "ganz andere Vorstellung", steps: [1], fail: 2 },
    { node: 0, dy: 34, text: "Suche: Backend · 10 Std./Woche · Mitgründer:in", steps: [2, 3], cls: "is-me" },
    { node: 1, dy: -28, text: "Backend ✓ · 12 Std./Woche ✓ · Mitgründer:in ✓", steps: [4], cls: "is-key" },
    { node: 2, dy: 26, text: "Backend · 8 Std./Woche", steps: [4], cls: "is-key", wide: true },
    { node: 3, dy: 26, text: "Backend · am Wochenende", steps: [4], cls: "is-key", wide: true },
    { node: 1, dy: -58, text: "„Klingt spannend! Wann hast du Zeit für einen Call?“", steps: [5], cls: "is-msg" },
  ].map((t) => {
    const el = document.createElement("span");
    el.className = "story-tag" + (t.cls ? " " + t.cls : "");
    el.textContent = t.text;
    tagLayer.append(el);
    return { ...t, el };
  });

  steps.forEach(() => dotsEl.append(document.createElement("span")));

  // ---------- Maße ----------
  let W = 0, H = 0, cx = 0, cy = 0, R = 0;
  function measure() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height; cx = W / 2; cy = H / 2 + 10;
    R = Math.min(W * 0.46, H * 0.4);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  }

  // ---------- Zielzustände ----------
  const polar = (a, rad) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  const deg = (d) => (d * Math.PI) / 180;
  const FAIL_AT = [deg(205), deg(325), deg(90)];
  const MATCH_AT = [deg(-40), deg(90), deg(165)];
  const others = people.filter((p) => p.i !== 0);

  function target(p, step, t, te) {
    const scatter = () => {
      const dx = reduce ? 0 : Math.sin(t * p.sp + p.ph) * 9;
      const dy = reduce ? 0 : Math.cos(t * p.sp * 0.8 + p.ph) * 7;
      return [cx + p.u * (W / 2 - 24) + dx, cy - 10 + p.v * (H / 2 - 40) + dy];
    };
    if (p.i === 0) {
      if (step === 5) return { xy: [cx - R * 0.42, cy], o: 1, r: 7, c: "text" };
      return { xy: [cx, cy], o: 1, r: 7, c: "text" };
    }
    const fi = FAIL.indexOf(p.i), mi = MATCH.indexOf(p.i);
    if (step === 0) return { xy: scatter(), o: 0.6, r: 4, c: "dim" };
    if (step === 1) {
      if (fi >= 0) {
        const broken = te > 1.5 + fi * 0.7;
        return { xy: polar(FAIL_AT[fi], R * 0.68), o: broken ? 0.3 : 1, r: 5, c: broken ? "dim" : "text" };
      }
      return { xy: scatter(), o: 0.28, r: 4, c: "dim" };
    }
    // ab hier: alle sortiert im Kreis
    const k = others.indexOf(p);
    const inner = k < 12;
    const ringA = inner ? (k / 12) * Math.PI * 2 + 0.2 : ((k - 12) / 18) * Math.PI * 2;
    const ring = polar(ringA, inner ? R * 0.6 : R * 0.98);
    if (step === 2) return { xy: ring, o: 0.75, r: 4.5, c: "dim" };
    if (mi >= 0) {
      if (step === 5) {
        if (mi === 0) return { xy: [cx + R * 0.42, cy], o: 1, r: 7, c: "key" };
        return { xy: polar(MATCH_AT[mi], R * 0.62), o: 0.3, r: 5, c: "key" };
      }
      return { xy: polar(MATCH_AT[mi], R * 0.62), o: 1, r: 6, c: "key" };
    }
    const out = polar(ringA, R * (inner ? 1.02 : 1.12));
    return { xy: out, o: step === 5 ? 0.07 : 0.14, r: 3.5, c: "dim" };
  }

  function linesFor(step, t, te) {
    const L = [];
    if (step === 0 && !reduce) {
      const slot = Math.floor(t / 1.3), ph = (t / 1.3) % 1;
      const pick = 7 + ((slot * 7919) % (N - 7));
      L.push({ k: "try" + slot, a: 0, b: pick, color: C.line, dash: "3 5", o: Math.sin(Math.PI * ph) * 0.9, w: 1 });
    }
    if (step === 1) FAIL.forEach((n, fi) => {
      if (te < fi * 0.5 && !reduce) return;
      const broken = reduce || te > 1.5 + fi * 0.7;
      L.push({ k: "fail" + n, a: 0, b: n, color: C.line, dash: "3 5", o: broken ? 0.15 : 0.9, w: 1 });
    });
    if (step === 4) MATCH.forEach((n) => L.push({ k: "m" + n, a: 0, b: n, color: C.key, dash: "", o: 0.8, w: 1.4 }));
    if (step === 5) L.push({ k: "m1", a: 0, b: 1, color: C.key, dash: "", o: 1, w: 2 });
    return L;
  }

  // ---------- Zeichnen ----------
  const lineEls = new Map(); // key -> { el, o }
  let step = 0, stepAt = 0, last = 0, running = false, first = true;

  function frame(now) {
    const t = now / 1000, te = t - stepAt;
    const ease = reduce || first ? 1 : 1 - Math.pow(0.0015, Math.min(0.05, (now - last) / 1000));
    last = now;

    people.forEach((p) => {
      const g = target(p, step, t, reduce ? 99 : te);
      p.x += (g.xy[0] - p.x) * ease; p.y += (g.xy[1] - p.y) * ease;
      p.o += (g.o - p.o) * ease; p.r += (g.r - p.r) * ease;
      const want = RGB[g.c];
      p.c = p.c.map((v, j) => v + (want[j] - v) * ease);
      p.el.setAttribute("cx", p.x.toFixed(1)); p.el.setAttribute("cy", p.y.toFixed(1));
      p.el.setAttribute("r", p.r.toFixed(2)); p.el.setAttribute("opacity", p.o.toFixed(3));
      p.el.setAttribute("fill", `rgb(${p.c.map(Math.round).join(",")})`);
    });
    const me = people[0];
    halo.setAttribute("cx", me.x.toFixed(1)); halo.setAttribute("cy", me.y.toFixed(1));
    halo.setAttribute("r", (13 + (reduce ? 0 : Math.sin(t * 2) * 2)).toFixed(1));
    halo.setAttribute("opacity", "0.35");

    // Linien: ein- und ausblenden statt hart wechseln
    const want = linesFor(step, t, reduce ? 99 : te);
    const keys = new Set(want.map((l) => l.k));
    want.forEach((l) => {
      let rec = lineEls.get(l.k);
      if (!rec) { rec = { el: document.createElementNS(NS, "line"), o: 0 }; lineG.append(rec.el); lineEls.set(l.k, rec); }
      rec.o += (l.o - rec.o) * (reduce ? 1 : Math.min(1, ease * 1.6));
      Object.assign(rec, { a: l.a, b: l.b });
      rec.el.setAttribute("stroke", l.color); rec.el.setAttribute("stroke-width", l.w);
      if (l.dash) rec.el.setAttribute("stroke-dasharray", l.dash); else rec.el.removeAttribute("stroke-dasharray");
    });
    lineEls.forEach((rec, k) => {
      if (!keys.has(k)) { rec.o -= rec.o * (reduce ? 1 : Math.min(1, ease * 1.6)); if (rec.o < 0.01) { rec.el.remove(); lineEls.delete(k); return; } }
      const a = people[rec.a], b = people[rec.b];
      rec.el.setAttribute("x1", a.x.toFixed(1)); rec.el.setAttribute("y1", a.y.toFixed(1));
      rec.el.setAttribute("x2", b.x.toFixed(1)); rec.el.setAttribute("y2", b.y.toFixed(1));
      rec.el.setAttribute("opacity", rec.o.toFixed(3));
    });

    // Nachricht läuft hin und her
    if (step === 5 && !reduce) {
      const q = (t / 1.6) % 1, f = q < 0.5 ? q * 2 : 2 - q * 2;
      const a = people[0], b = people[1];
      pulse.setAttribute("cx", (a.x + (b.x - a.x) * f).toFixed(1));
      pulse.setAttribute("cy", (a.y + (b.y - a.y) * f).toFixed(1));
      pulse.setAttribute("opacity", "0.9");
    } else pulse.setAttribute("opacity", "0");

    // Schilder folgen ihrem Punkt
    TAGS.forEach((tg) => {
      const p = people[tg.node];
      const on = tg.steps.includes(step) && (!tg.wide || W >= 520) && (tg.fail === undefined || reduce || te > tg.fail * 0.5 + 0.2);
      const off = tg.fail !== undefined && (reduce || te > 1.5 + tg.fail * 0.7);
      tg.el.classList.toggle("is-on", on);
      tg.el.classList.toggle("is-off", off);
      const w = tg.el.offsetWidth / 2;
      const x = Math.max(w + 8, Math.min(W - w - 8, p.x));
      const y = Math.max(40, Math.min(H - 20, p.y + tg.dy));
      if (on) { tg.el.style.left = x.toFixed(1) + "px"; tg.el.style.top = y.toFixed(1) + "px"; } // aus: bleibt stehen und blendet aus
    });

    first = false;
    if (running) requestAnimationFrame(frame);
  }

  // ---------- Welcher Schritt ist dran? ----------
  function pickStep() {
    const sr = stage.getBoundingClientRect();
    const wide = innerWidth >= 900;
    const below = Math.max(sr.bottom, 0);
    const line = wide ? innerHeight * 0.55 : below + (innerHeight - below) * 0.4;
    let s = 0;
    steps.forEach((el, i) => { if (el.getBoundingClientRect().top < line) s = i; });
    if (s !== step) { step = s; stepAt = performance.now() / 1000; }
    steps.forEach((el, i) => el.classList.toggle("is-active", i === step));
    [...dotsEl.children].forEach((d, i) => d.classList.toggle("is-on", i === step));
    const ph = steps[step].dataset.phase;
    phaseEl.dataset.phase = ph;
    phaseEl.textContent = ph === "xyntal" ? "Mit Xyntal" : "Heute";
  }

  let queued = false;
  addEventListener("scroll", () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; pickStep(); });
  }, { passive: true });
  addEventListener("resize", pickStep);
  // Größe der Bühne kann sich nach dem Laden noch ändern (Schriften, Karten oben drüber)
  new ResizeObserver(() => { measure(); first = true; }).observe(stage);

  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; last = performance.now(); requestAnimationFrame(frame); }
    else if (!e.isIntersecting) running = false;
  }).observe(root);

  measure();
  pickStep();
})();
