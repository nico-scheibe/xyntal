// Xyntal – Startseite: „Heute / Mit Xyntal“.
// Rechts (bzw. oben) eine Bühne mit Profilkarten, links die Schritte. Beim Scrollen wechselt
// die Bühne in den Zustand des aktiven Schritts (.story-step[data-step]):
//   0  Überall suchen: Man sieht, was jemand kann. Zeit und Ziel sind „?“.
//   1  Drei Calls über Wochen, jeder scheitert an etwas, das man vorher hätte wissen können.
//   2  Du beschreibst dein Vorhaben, alle anderen ihres: Die „?“ werden zu echten Angaben.
//   3  Was nicht passt, fällt raus. Übrig bleiben drei.
//   4  Die drei mit Begründung (✓ je Angabe).
//   5  Ihr schreibt euch. Woche 1 statt Woche 9.
// Karten bewegen sich per CSS-Transition; dieses Skript setzt nur Ziele und Klassen.
// Bei „Bewegung reduzieren“ springt alles sofort in den Endzustand.
(() => {
  const root = document.querySelector("[data-story]");
  if (!root) return;
  const stage = root.querySelector(".story-stage");
  const phaseEl = stage.querySelector(".story-phase");
  const dotsEl = stage.querySelector(".story-dots");
  const steps = [...root.querySelectorAll(".story-step")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  // Alte Punkte-Grafik aufräumen, falls das HTML sie noch enthält
  stage.querySelector(":scope > svg")?.remove();
  stage.querySelector(".story-tags")?.remove();

  // ---------- Daten ----------
  // Gesucht: Backend · etwa 10 Std. · Mitgründung
  // Die gesuchte Fähigkeit wählt man oben im Einstieg („Wen suchst du?“, front.js).
  // Karten mit skill: null bekommen genau diese Fähigkeit; die übrigen behalten ihre
  // eigene, außer sie wäre zufällig die gesuchte – dann werden sie zu Backend.
  const WANT = { skill: "Backend", goal: "Mitgründen" };
  const FOR = { Backend: "fürs Backend", Frontend: "fürs Frontend", Design: "fürs Design", Marketing: "fürs Marketing", Vertrieb: "für den Vertrieb" };
  const okTime = (h) => h >= 8 && h <= 16;
  const PEOPLE = [
    { n: "Lena", src: "Discord", skill: null, h: 12, goal: "Mitgründen" },
    { n: "Jonas", src: "LinkedIn", skill: null, h: 2, goal: "Mitgründen", fail: "time" },
    { n: "Mira", src: "Freunde", skill: "Design", h: 6, goal: "Nebenbei" },
    { n: "Can", src: "LinkedIn", skill: null, h: 15, goal: "nur bezahlt", fail: "goal" },
    { n: "Tom", src: "Discord", skill: "Marketing", h: 10, goal: "Mitgründen" },
    { n: "Aylin", src: "Freunde", skill: null, h: 8, goal: "Mitgründen" },
    { n: "Sara", src: "Discord", skill: null, h: 10, goal: "eigene Idee", fail: "goal" },
    { n: "Noah", src: "LinkedIn", skill: null, h: 10, goal: "Mitgründen" },
    { n: "Felix", src: "Discord", skill: "Frontend", h: 4, goal: "Nebenbei" },
    { n: "Ben", src: "LinkedIn", skill: "Daten", h: 20, goal: "nur bezahlt" },
    { n: "Emma", src: "Freunde", skill: "Design", h: 12, goal: "Mitgründen" },
    { n: "Paul", src: "Discord", skill: "Vertrieb", h: 5, goal: "nur bezahlt" },
  ].map((p, i) => ({ ...p, i, own: p.skill }));
  function setWant(skill) {
    WANT.skill = FOR[skill] ? skill : "Backend";
    PEOPLE.forEach((p) => {
      p.skill = p.own == null ? WANT.skill : p.own === WANT.skill ? "Backend" : p.own;
      p.ok = { skill: p.skill === WANT.skill, time: okTime(p.h), goal: p.goal === WANT.goal };
      p.match = p.ok.skill && p.ok.time && p.ok.goal;
    });
  }
  setWant("Backend");
  // Was im Vorschlag als Begründung steht – ein Satz, wie ihn die App aus dem Profil zieht
  const WHY = {
    Lena: "Hat schon zwei Produkte mit aufgebaut · will ab März fest einsteigen",
    Aylin: "Sucht ein Projekt mit echten Nutzern · abends und am Wochenende",
    Noah: "Hat zwei Jahre im Start-up gearbeitet · lieber Anteile als Gehalt",
  };
  // Die drei Calls von „Heute · 2“: Woche, Person, woran es scheitert
  const CALLS = [
    { wk: 2, who: 1, why: "keine Zeit" },
    { wk: 5, who: 3, why: "nur gegen Bezahlung" },
    { wk: 9, who: 6, why: "ganz andere Vorstellung" },
  ];
  const WEEKS = 10;

  // ---------- Bühne bauen ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "st-lines");
  svg.innerHTML = `<defs><linearGradient id="st-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#B36BFF"/><stop offset=".55" stop-color="#3A8AFF"/><stop offset="1" stop-color="#3FE0F0"/></linearGradient></defs>`;
  const path = (cls) => { const p = document.createElementNS(NS, "path"); p.setAttribute("class", cls); svg.append(p); return p; };

  const brief = el("div", "st-brief");
  brief.innerHTML = `<span class="st-av st-av-me">Du</span><span class="st-brief-l">Du suchst</span>`;
  const briefVals = [WANT.skill, "8–16 h/Woche", "Mitgründen"].map((t) => {
    const s = el("span", "st-brief-v", t); brief.append(s); return s;
  });

  const cards = PEOPLE.map((p) => {
    const c = el("div", "sp");
    const head = el("div", "sp-head");
    const av = el("span", "st-av", p.n[0]); av.dataset.noI18n = "";
    const name = el("span", "sp-name", p.n); name.dataset.noI18n = "";
    head.append(av, name, el("span", "sp-src", p.src));
    const attrs = el("div", "sp-attrs");
    const attr = (k, val, q) => {
      const a = el("div", "sp-a"); a.dataset.k = k;
      if (q) a.append(el("span", "sp-q", q));
      a.append(el("span", "sp-v", val));
      attrs.append(a); return a;
    };
    p.a = {
      skill: attr("skill", p.skill),
      time: attr("time", `${p.h} h/Woche`, "Zeit"),
      goal: attr("goal", p.goal, "Ziel"),
    };
    c.append(head, attrs);
    if (WHY[p.n]) c.append(el("p", "sp-why", WHY[p.n]));
    p.el = c;
    return c;
  });

  const time = el("div", "st-time");
  const timeBar = el("div", "st-time-bar");
  const timeFill = el("i");
  timeBar.append(timeFill);
  for (let w = 0; w <= WEEKS; w++) { const t = el("b"); t.style.left = `${(w / WEEKS) * 100}%`; timeBar.append(t); }
  const timeHint = el("span", "st-time-l st-hint");
  timeHint.append(el("i", "st-hint-bar"), el("span", "", "erfährst du erst im Gespräch"));
  const timeBad = el("span", "st-time-l st-bad", "Woche 9 · 3 Calls · noch niemand gefunden");
  const timeGood = el("span", "st-time-l st-good", "Woche 1 · Call ausgemacht");
  const timeEnd = el("span", "st-time-wk st-wkN", `Woche ${WEEKS}`);
  const marks = CALLS.map((c) => {
    const m = el("span", "st-mark");
    m.style.left = `${(c.wk / WEEKS) * 100}%`;
    m.append(el("span", "st-mark-why", c.why));
    if (c.wk / WEEKS > 0.75) m.classList.add("is-end");
    timeBar.append(m);
    return m;
  });
  const goodMark = el("span", "st-mark st-mark-good");
  goodMark.style.left = `${(1 / WEEKS) * 100}%`;
  timeBar.append(goodMark);
  time.append(timeHint, timeBad, timeGood, timeBar, timeEnd);

  const count = el("div", "st-count");
  count.innerHTML = `<span class="st-count-n">12</span> <span class="st-count-l">Profile</span> <span class="st-count-arrow">→</span> <span class="st-count-n st-count-k">3</span> <span class="st-count-l">passen</span>`;

  const chat = el("div", "st-chat");
  const bubbles = [
    ["me", `Hi Lena, du suchst auch eine Mitgründung ${FOR[WANT.skill]}. Lust auf einen Call?`],
    ["them", "Klingt spannend! Donnerstag, 18 Uhr?"],
    ["me", "Passt. Bis Donnerstag!"],
  ].map(([who, text]) => { const b = el("p", `st-bubble is-${who}`, text); chat.append(b); return b; });
  const typing = el("p", "st-bubble is-them st-typing");
  typing.setAttribute("aria-hidden", "true");
  typing.innerHTML = "<i></i><i></i><i></i>";
  chat.insertBefore(typing, bubbles[1]);

  const linesRail = path("st-rail");
  const linesLink = path("st-link");
  const callLines = CALLS.map(() => path("st-call"));

  stage.append(svg, time, count, brief, ...cards, chat);
  steps.forEach(() => dotsEl.append(el("span")));

  // ---------- Maße ----------
  let G = {};
  function measure() {
    const r = stage.getBoundingClientRect();
    const W = r.width, H = r.height;
    const compact = W < 560;
    const cols = compact ? 3 : 4;
    const pad = compact ? 12 : 22;
    const gap = compact ? 8 : 12;
    const top = compact ? 40 : 54;
    const tlH = compact ? 62 : 74;
    const briefH = compact ? 40 : 50;
    const cw = (W - 2 * pad - (cols - 1) * gap) / cols;
    const ch = Math.max(64, Math.min(compact ? 92 : 108,
      (H - top - tlH - 2 * gap) / 3,
      (H - top - briefH - gap - 40 - 2 * gap) / 3));
    const gridY2 = top + briefH + gap + 4;
    // Zeitleiste direkt unter das Raster, nicht ganz unten an den Rand
    const tlY = Math.min(H - tlH, top + 3 * ch + 2 * gap + (compact ? 20 : 34));
    G = { W, H, compact, cols, pad, gap, top, tlH, tlY, briefH, cw, ch, gridY2,
      rowH: compact ? 86 : 84, indent: compact ? 18 : 26 };
    stage.classList.toggle("is-compact", compact);
    stage.style.setProperty("--cw", cw + "px");
    stage.style.setProperty("--ch", ch + "px");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const lg = svg.querySelector("#st-grad");
    lg.setAttribute("y1", top); lg.setAttribute("y2", top + briefH + G.rowH + 40);
  }

  const place = (e, x, y, w, h) => {
    e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (w != null) e.style.width = w.toFixed(1) + "px";
    if (h != null) e.style.height = h.toFixed(1) + "px";
  };
  const gridXY = (k, y0) => [
    G.pad + (k % G.cols) * (G.cw + G.gap),
    y0 + Math.floor(k / G.cols) * (G.ch + G.gap),
  ];

  // ---------- Zustände ----------
  let timers = [], scanTimer = 0;
  const later = (ms, fn) => { if (reduce) fn(); else timers.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearInterval(scanTimer); scanTimer = 0; };

  const matches = PEOPLE.filter((p) => p.match);
  const visible = () => PEOPLE.slice(0, G.cols * 3);

  // Unterkante des Inhalts je Schritt (bezogen auf G.top), damit er mittig auf der Bühne sitzt
  function blockFor(step) {
    const B = G;
    const rows = B.top + B.briefH + B.gap + 6;
    const chatY = rows + B.rowH + B.gap * 2;
    const chatH = B.compact ? 146 : 150;
    if (step === 0) return { bottom: B.tlY + 20, tlY: B.tlY };   // nur die Legende unter dem Raster
    if (step === 1) return { bottom: B.tlY + B.tlH, tlY: B.tlY };
    if (step <= 3) return { bottom: B.gridY2 + 3 * B.ch + 2 * B.gap + (B.compact ? 44 : 56), tlY: B.tlY };
    if (step === 4) return { bottom: rows + 3 * (B.rowH + B.gap) + (B.compact ? 30 : 40), tlY: B.tlY };
    const tl = chatY + chatH + (B.compact ? 16 : 28);
    return { bottom: tl + B.tlH, tlY: tl };
  }

  function apply(step, instant) {
    const base = G;
    const blk = blockFor(step);
    const oy = Math.max(0, Math.round((base.H - (blk.bottom - base.top)) / 2 - base.top));
    G = { ...base, top: base.top + oy, gridY2: base.gridY2 + oy, tlY: blk.tlY + oy, oy };
    try { applyAt(step, instant); } finally { G = base; }
  }

  function applyAt(step, instant) {
    clearTimers();
    stage.dataset.step = step;
    stage.classList.toggle("is-instant", !!instant || reduce);
    const shown = visible();

    // Alles zurücksetzen, was nur in einzelnen Schritten gilt
    PEOPLE.forEach((p) => {
      p.el.className = "sp";
      p.el.style.setProperty("--d", "0ms");
      Object.values(p.a).forEach((a) => { a.className = "sp-a"; a.style.setProperty("--d", "0ms"); });
      p.el.hidden = !shown.includes(p);
    });
    marks.forEach((m) => m.classList.remove("is-on"));
    callLines.forEach((l) => l.classList.remove("is-on"));
    bubbles.forEach((b) => b.classList.remove("is-on"));
    typing.classList.remove("is-on");
    briefVals.forEach((v) => v.classList.remove("is-on"));
    timeFill.style.width = "0%";

    // Feste Plätze: Vorhaben oben, Zeitleiste/Zähler unten, Chat unter dem Vorschlag
    place(brief, G.pad, G.top, G.W - 2 * G.pad, G.briefH);
    place(time, G.pad, G.tlY, G.W - 2 * G.pad);
    place(count, G.pad, G.gridY2 + 3 * G.ch + 2 * G.gap + (G.compact ? 14 : 22));
    const chatY = G.top + G.briefH + G.gap + 6 + G.rowH + G.gap * 2;
    place(chat, G.pad + G.indent, chatY, G.W - 2 * G.pad - G.indent, G.tlY - chatY - G.gap);

    // --- 0 + 1: Heute ---
    if (step <= 1) {
      shown.forEach((p, k) => {
        const [x, y] = gridXY(k, G.top);
        place(p.el, x, y, G.cw, G.ch);
        p.el.style.setProperty("--d", `${k * 25}ms`);
      });
    }
    if (step === 0 && !reduce) {
      // Man klickt sich durch Profile: ein Rahmen springt von Karte zu Karte
      let last = -1;
      const hop = () => {
        shown[last]?.el.classList.remove("is-scan");
        let k; do { k = Math.floor(Math.random() * shown.length); } while (k === last);
        last = k; shown[k].el.classList.add("is-scan");
      };
      hop(); scanTimer = setInterval(hop, 1100);
    }
    if (step === 1) {
      shown.forEach((p) => p.el.classList.add("is-dim"));
      const barY = G.tlY + (G.compact ? 30 : 36);
      CALLS.forEach((c, j) => {
        const p = PEOPLE[c.who];
        if (!shown.includes(p)) return;
        const at = 250 + j * 1100;
        later(at, () => {
          p.el.classList.remove("is-dim");
          p.el.classList.add("is-focus");
          const [x, y] = gridXY(shown.indexOf(p), G.top);
          const mx = G.pad + (c.wk / WEEKS) * (G.W - 2 * G.pad);
          const sx = x + G.cw / 2, sy = y + G.ch;
          callLines[j].setAttribute("d", `M${sx},${sy} C${sx},${(sy + barY) / 2} ${mx},${(sy + barY) / 2} ${mx},${barY - 6}`);
          callLines[j].classList.add("is-on");
          marks[j].classList.add("is-on");
          timeFill.style.width = `${(c.wk / WEEKS) * 100}%`;
        });
        later(at + 550, () => {
          p.el.classList.add("is-known");
          p.a[p.fail].classList.add("is-no");
        });
        later(at + 1050, () => {
          p.el.classList.remove("is-focus");
          p.el.classList.add("is-failed");
          callLines[j].classList.add("is-past");
        });
      });
    }

    // --- 2 + 3: Vorhaben beschreiben, Filtern ---
    if (step === 2 || step === 3) {
      shown.forEach((p, k) => {
        const [x, y] = gridXY(k, G.gridY2);
        place(p.el, x, y, G.cw, G.ch);
        p.el.style.setProperty("--d", `${k * 30}ms`);
        p.el.classList.add("is-known");
        // Angaben klappen eine nach der anderen auf
        ["time", "goal"].forEach((key, j) => p.a[key].style.setProperty("--d", `${(step === 2 ? 350 : 0) + k * 60 + j * 90}ms`));
      });
      briefVals.forEach((v, j) => later(step === 2 ? 120 + j * 140 : 0, () => v.classList.add("is-on")));
    }
    if (step === 3) {
      shown.forEach((p, k) => {
        const delay = 150 + k * 40;
        Object.entries(p.ok).forEach(([key, ok], j) => {
          p.a[key].style.setProperty("--d", `${delay + j * 60}ms`);
          p.a[key].classList.add(ok ? "is-ok" : "is-no");
        });
        later(delay + 380, () => p.el.classList.add(p.match ? "is-match" : "is-out"));
      });
    }

    // --- 4: Vorschläge mit Begründung ---
    if (step === 4 || step === 5) {
      briefVals.forEach((v) => v.classList.add("is-on"));
      shown.forEach((p) => { if (!p.match) { p.el.classList.add("is-gone"); } });
      const x0 = G.pad + G.indent;
      const w = G.W - 2 * G.pad - G.indent;
      const y0 = G.top + G.briefH + G.gap + 6;
      matches.forEach((p, j) => {
        const show = step === 4 || j === 0;
        p.el.classList.add("is-known", "is-row", "is-match");
        Object.entries(p.ok).forEach(([key], q) => {
          p.a[key].classList.add("is-ok");
          p.a[key].style.setProperty("--d", step === 4 ? `${300 + j * 160 + q * 90}ms` : "0ms");
        });
        p.el.style.setProperty("--d", `${j * 90}ms`);
        place(p.el, x0, y0 + j * (G.rowH + G.gap), w, G.rowH);
        if (!show) p.el.classList.add("is-gone");
      });
      // Linie vom Vorhaben zu den Vorschlägen
      const rx = G.pad + 12, ry = G.top + G.briefH;
      const ends = (step === 4 ? matches : matches.slice(0, 1)).map((_, j) => y0 + j * (G.rowH + G.gap) + G.rowH / 2);
      linesRail.setAttribute("d", ends.map((ey) => `M${rx},${ry} V${ey - 6} Q${rx},${ey} ${rx + 6},${ey} H${x0}`).join(" "));
      linesLink.setAttribute("d", `M${rx},${ry} V${ends[0] - 6} Q${rx},${ends[0]} ${rx + 6},${ends[0]} H${x0}`);
      place(count, x0, y0 + 3 * (G.rowH + G.gap) + (G.compact ? 4 : 8));
    }

    // --- 5: Nachricht ---
    if (step === 5) {
      later(300, () => bubbles[0].classList.add("is-on"));
      later(1000, () => typing.classList.add("is-on"));
      later(2100, () => { typing.classList.remove("is-on"); bubbles[1].classList.add("is-on"); });
      later(3000, () => bubbles[2].classList.add("is-on"));
      later(400, () => { timeFill.style.width = `${(1 / WEEKS) * 100}%`; });
    }

    const lg = svg.querySelector("#st-grad");
    lg.setAttribute("y1", G.top); lg.setAttribute("y2", G.top + G.briefH + G.rowH + 40);

    // Phase oben links, Punkte oben rechts
    const ph = steps[step].dataset.phase;
    phaseEl.dataset.phase = ph;
    phaseEl.textContent = ph === "xyntal" ? "Mit Xyntal" : "Heute";
    [...dotsEl.children].forEach((d, i) => d.classList.toggle("is-on", i === step));
    steps.forEach((s, i) => s.classList.toggle("is-active", i === step));
  }

  // ---------- Welcher Schritt ist dran? ----------
  let step = -1;
  function pickStep(force) {
    const sr = stage.getBoundingClientRect();
    const wide = innerWidth >= 900;
    const below = Math.max(sr.bottom, 0);
    const line = wide ? sr.top + sr.height / 2 : below + (innerHeight - below) * 0.4;
    let s = 0;
    steps.forEach((e, i) => { if (e.getBoundingClientRect().top < line) s = i; });
    if (s !== step || force) { const first = step < 0; step = s; apply(step, first || force === "instant"); }
  }

  let queued = false;
  addEventListener("scroll", () => {
    if (queued) return; queued = true;
    requestAnimationFrame(() => { queued = false; pickStep(); });
  }, { passive: true });
  let lastW = 0, lastH = 0;
  new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    if (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1) return;
    lastW = r.width; lastH = r.height;
    measure(); pickStep("instant");
  }).observe(stage);

  // Nach einer Auswahl oben: die geänderten Werte leuchten kurz auf –
  // aber erst, wenn man die Bühne auch sieht
  let pendingFlash = false;
  function flash() {
    if (!pendingFlash || reduce) { pendingFlash = false; return; }
    pendingFlash = false;
    const hits = [briefVals[0], ...PEOPLE.filter((p) => p.skill === WANT.skill).map((p) => p.a.skill)];
    setTimeout(() => hits.forEach((h) => { h.classList.remove("is-flash"); void h.offsetWidth; h.classList.add("is-flash"); }), 350);
  }

  // Animationen erst starten, wenn die Bühne im Bild ist, damit man den Anfang sieht
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { pickStep(true); flash(); }
    else clearTimers();
  }, { threshold: 0.35 }).observe(stage);

  // Auswahl oben ändert die Suche: Karten, Vorhaben und erste Nachricht ziehen mit
  addEventListener("xyntal:seek", (e) => {
    const next = e.detail?.skill;
    if (!FOR[next] || next === WANT.skill) return;
    setWant(next);
    PEOPLE.forEach((p) => { p.a.skill.querySelector(".sp-v").textContent = p.skill; });
    briefVals[0].textContent = WANT.skill;
    pendingFlash = true;
    bubbles[0].textContent = `Hi Lena, du suchst auch eine Mitgründung ${FOR[WANT.skill]}. Lust auf einen Call?`;
    // Außer Sicht (z. B. beim Laden mit gemerkter Wahl) ohne Bewegung umbauen
    const r = stage.getBoundingClientRect();
    const seen = r.bottom > 0 && r.top < innerHeight;
    if (step >= 0) apply(step, !seen);
    if (seen) flash();
  });

  // Punkte oben rechts: Klick springt zum Schritt
  dotsEl.addEventListener("click", (e) => {
    const i = [...dotsEl.children].indexOf(e.target);
    if (i < 0) return;
    const wide = innerWidth >= 900;
    const sr = stage.getBoundingClientRect();
    // Ziel: Schritt-Text mittig neben der Bühne (Desktop) bzw. knapp unter ihr (Handy)
    const er = steps[i].getBoundingClientRect();
    // Die Bühne klebt auf dem Desktop bei top: 96px (story.css)
    const y = wide
      ? scrollY + er.top + er.height / 2 - (96 + sr.height / 2)
      : scrollY + er.top - (sr.bottom + (innerHeight - sr.bottom) * 0.4) + 24;
    scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  });

  measure();
  pickStep("instant");
})();
