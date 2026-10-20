// Xyntal – Interaktions-Schicht: ⌘K-Befehlspalette, Entschlüsseln-Effekt,
// Scroll-Reveal, Spotlight auf Karten und Neigung der App-Vorschau.
// Läuft auf allen Seiten, ohne Bibliotheken.
(() => {
  document.documentElement.classList.add("js");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const MOD = isMac ? "⌘" : "Strg";

  /* ---------------------------------------------------------------
     ⌘K – Befehlspalette (wie in der App)
     --------------------------------------------------------------- */
  const PAGES = [
    { label: "Startseite", href: "./", glyph: "~", keys: "home start" },
    { label: "Community", href: "community", glyph: "#", keys: "feed beiträge fragen erfolge" },
    { label: "Gesuche & Angebote", href: "boerse", glyph: "⇄", keys: "börse suche biete mitgründer" },
    { label: "Treffen", href: "events", glyph: "▦", keys: "events termine zusagen veranstaltungen" },
    { label: "Mitglieder", href: "mitglieder", glyph: "@", keys: "profile menschen leute" },
    { label: "Nachrichten", href: "nachrichten", glyph: "✉", keys: "chat dm inbox" },
    { label: "Mein Profil", href: "profil", glyph: "◐", keys: "konto account bearbeiten" },
    { label: "Login", href: "login", glyph: "→", keys: "anmelden einloggen" },
    { label: "Kostenlos starten", href: "mitglied-werden", glyph: "+", keys: "registrieren mitglied werden konto anlegen" },
    { label: "Impressum & Datenschutz", href: "impressum", glyph: "§", keys: "rechtliches datenschutz" },
  ];

  // Abschnitte der aktuellen Seite: Name aus dem Label („06 — pläne“ → „Pläne“), Überschrift als Suchtext
  function sectionsOnPage() {
    return [...document.querySelectorAll("main section[id]")]
      .map((s) => {
        const h = s.querySelector("h1, h2");
        if (!h) return null;
        const heading = h.textContent.replace(/\s+/g, " ").trim();
        const eyebrow = s.querySelector(".eyebrow")?.textContent.replace(/^\s*\d+\s*—\s*/, "").replace(/\s*Bald\s*$/, "").trim();
        const label = eyebrow && s.id !== "top" ? eyebrow.charAt(0).toUpperCase() + eyebrow.slice(1) : heading;
        return { label, target: s, glyph: "¶", keys: (heading + " " + s.id).toLowerCase() };
      })
      .filter(Boolean);
  }

  let root = null, input, list, items = [], sel = 0, lastFocus = null;

  function build() {
    root = document.createElement("div");
    root.className = "cmdk";
    root.hidden = true;
    root.innerHTML = `
      <div class="cmdk-box" role="dialog" aria-modal="true" aria-label="Befehlspalette">
        <div class="cmdk-input">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input type="text" placeholder="Seite oder Abschnitt suchen …" aria-label="Suchen" autocomplete="off" spellcheck="false">
          <kbd>esc</kbd>
        </div>
        <div class="cmdk-list" role="listbox"></div>
        <div class="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> auswählen</span><span><kbd>↵</kbd> öffnen</span><span><kbd>${MOD}</kbd> <kbd>K</kbd> schließen</span></div>
      </div>`;
    document.body.appendChild(root);
    input = root.querySelector("input");
    list = root.querySelector(".cmdk-list");
    root.addEventListener("mousedown", (e) => { if (e.target === root) close(); });
    input.addEventListener("input", render);
    input.addEventListener("keydown", onKey);
    list.addEventListener("mousemove", (e) => {
      const b = e.target.closest(".cmdk-item");
      if (b && +b.dataset.i !== sel) { sel = +b.dataset.i; mark(); }
    });
    list.addEventListener("click", (e) => {
      const b = e.target.closest(".cmdk-item");
      if (b) run(items[+b.dataset.i]);
    });
  }

  // Unscharfe Suche: alle Buchstaben in Reihenfolge, Treffer am Wortanfang zählen mehr
  function fuzzy(q, text) {
    if (!q) return { score: 0, hits: [] };
    const t = text.toLowerCase();
    let ti = 0, score = 0;
    const hits = [];
    for (const ch of q.toLowerCase()) {
      const i = t.indexOf(ch, ti);
      if (i < 0) return null;
      score += i === ti && hits.length ? 5 : 1;
      if (i === 0 || t[i - 1] === " ") score += 4;
      hits.push(i);
      ti = i + 1;
    }
    return { score: score - text.length * 0.02, hits };
  }

  function highlight(text, hits) {
    const set = new Set(hits);
    return [...text].map((c, i) => (set.has(i) ? `<mark>${esc(c)}</mark>` : esc(c))).join("");
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function render() {
    const q = input.value.trim();
    const groups = [["Auf dieser Seite", sectionsOnPage()], ["Seiten", PAGES]];
    items = [];
    let html = "";
    for (const [name, entries] of groups) {
      const found = entries
        .map((e) => {
          // Treffer im Namen zählen voll, Treffer nur in der Überschrift/den Stichworten halb
          const inLabel = fuzzy(q, e.label);
          const inKeys = !inLabel && q ? fuzzy(q, e.keys) : null;
          const m = inLabel || (inKeys ? { score: inKeys.score * 0.5, hits: [] } : null);
          return m ? { ...e, m } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.m.score - a.m.score);
      if (!found.length) continue;
      html += `<div class="cmdk-group">${name}</div>`;
      for (const e of found) {
        const i = items.push(e) - 1;
        html += `<button type="button" class="cmdk-item" role="option" data-i="${i}" aria-selected="false">
          <span class="g">${esc(e.glyph)}</span><span>${highlight(e.label, e.m.hits)}</span><span class="k">${e.href ? esc(e.href === "./" ? "/" : "/" + e.href) : "#" + esc(e.target.id)}</span></button>`;
      }
    }
    list.innerHTML = html || `<div class="cmdk-empty">Nichts gefunden für „${esc(q)}“</div>`;
    sel = 0;
    mark();
  }

  function mark() {
    list.querySelectorAll(".cmdk-item").forEach((b) => {
      const on = +b.dataset.i === sel;
      b.setAttribute("aria-selected", on);
      if (on) b.scrollIntoView({ block: "nearest" });
    });
  }

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === "Enter") { e.preventDefault(); if (items[sel]) run(items[sel]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); }
  }

  function run(item) {
    close(false);
    if (item.target) {
      item.target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      history.replaceState(null, "", "#" + item.target.id);
    } else {
      location.href = item.href;
    }
  }

  function open() {
    if (!root) build();
    lastFocus = document.activeElement;
    root.hidden = false;
    input.value = "";
    render();
    input.focus();
  }

  function close(restoreFocus = true) {
    if (!root || root.hidden) return;
    root.hidden = true;
    if (restoreFocus) lastFocus?.focus?.({ preventScroll: true });
  }

  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      root && !root.hidden ? close() : open();
    } else if (e.key === "/" && !typing && (!root || root.hidden)) {
      e.preventDefault();
      open();
    }
  });

  // Auslöser in der Kopfzeile
  const navWrap = document.querySelector(".nav .wrap");
  if (navWrap) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cmdk-trigger";
    btn.setAttribute("aria-label", "Befehlspalette öffnen");
    btn.innerHTML = `Suchen … <kbd>${MOD}</kbd><kbd>K</kbd>`;
    btn.addEventListener("click", open);
    const toggle = navWrap.querySelector(".nav-toggle");
    navWrap.insertBefore(btn, toggle);
    btn.style.marginLeft = "auto";
  }

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
  if (!still) document.querySelectorAll("[data-scramble]").forEach((el) => {
    if (document.fonts?.ready) document.fonts.ready.then(() => scramble(el)); else scramble(el);
  });

  /* ---------------------------------------------------------------
     Scroll-Reveal mit Staffelung innerhalb eines Rasters
     --------------------------------------------------------------- */
  const revealables = document.querySelectorAll(
    ".section-head, .feature, .card, .plan, .perk, .list li, .event-info, .event form, .mac, .about, .code, .preview-stage"
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
