// Xyntal – Startseite: kleine Dinge, die man erst merkt, wenn sie fehlen.
//  1. „Wen suchst du?“ im Einstieg steuert die Geschichte darunter (story.js hört auf „xyntal:seek“).
//     Die Wahl bleibt auf diesem Gerät gemerkt.
//  2. Der Bewerben-Knopf in der Kopfzeile erscheint erst, wenn der im Einstieg aus dem Bild ist.
//  3. Tippfehler in der E-Mail-Domain („gmial.com“) werden mit einem Klick korrigiert.
(() => {
  // ---------- 1. Wen suchst du? ----------
  const KEY = "xyntal-seek";
  const seek = document.querySelector("[data-seek]");
  if (seek) {
    const radios = [...seek.querySelectorAll('input[name="seek"]')];
    const label = seek.querySelector(".seek-go-v");
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Deutscher Name der Wahl; i18n.js übersetzt ihn bei Englisch (Vertrieb → Sales)
    const nameOf = (r) => r.value;
    const tell = (r, animate) => {
      dispatchEvent(new CustomEvent("xyntal:seek", { detail: { skill: r.value } }));
      if (!label) return;
      if (!animate || reduce) { label.textContent = nameOf(r); return; }
      label.classList.add("is-swap");
      setTimeout(() => { label.textContent = nameOf(r); label.classList.remove("is-swap"); }, 160);
    };
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ohne Speicher: Standard */ }
    const start = radios.find((r) => r.value === saved);
    seek.classList.add("is-init");
    if (start) {
      start.checked = true; tell(start, false);
      // In der wischbaren Zeile (Handy) die gemerkte Wahl ins Bild rollen, ohne die Seite zu bewegen
      const row = start.closest(".seek-opts"), lab = start.closest("label");
      if (row && row.scrollWidth > row.clientWidth) row.scrollLeft = lab.offsetLeft - row.offsetLeft - 20;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => seek.classList.remove("is-init")));
    seek.addEventListener("change", (e) => {
      if (e.target.name !== "seek") return;
      try { localStorage.setItem(KEY, e.target.value); } catch { /* egal */ }
      tell(e.target, true);
    });
  }

  // ---------- 2. Ein Bewerben-Knopf zur Zeit ----------
  const heroCta = document.querySelector("[data-hero-cta]");
  if (heroCta) {
    // Beim Scrollen direkt prüfen (zuverlässiger als ein gedrosselter Observer im Hintergrund)
    let queued = false;
    const sync = () => {
      queued = false;
      const r = heroCta.getBoundingClientRect();
      document.body.classList.toggle("hero-cta-visible", r.bottom > 64 && r.top < innerHeight);
    };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(sync); } }, { passive: true });
    addEventListener("resize", sync);
    sync();
  }

  // ---------- 2b. Chat-Knopf weicht der Fußzeile ----------
  const foot = document.querySelector(".site-footer");
  if (foot && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      document.body.classList.toggle("footer-visible", e.isIntersecting);
    }).observe(foot);
  }
  // Auf dem Handy liegt der Knopf sonst über dem Text der Geschichte
  const story = document.querySelector("[data-story]");
  if (story && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      document.body.classList.toggle("story-visible", e.isIntersecting);
    }).observe(story);
  }

  // ---------- 3. Tippfehler in der E-Mail ----------
  const DOMAINS = ["gmail.com", "googlemail.com", "web.de", "gmx.de", "gmx.net", "t-online.de", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "icloud.com", "yahoo.com", "yahoo.de", "posteo.de", "proton.me", "protonmail.com", "freenet.de", "aol.com", "mail.de"];
  // Abstand nach Damerau-Levenshtein (vertauschte Buchstaben zählen als einer)
  const dist = (a, b) => {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[a.length][b.length];
  };
  const suggest = (email) => {
    const m = email.trim().toLowerCase().match(/^([^\s@]+)@([^\s@]+)$/);
    if (!m || DOMAINS.includes(m[2])) return null;
    let best = null, bestD = 3;
    for (const dom of DOMAINS) { const k = dist(m[2], dom); if (k < bestD) { best = dom; bestD = k; } }
    return best && bestD <= (m[2].length > 6 ? 2 : 1) ? `${m[1]}@${best}` : null;
  };
  document.querySelectorAll("[data-waitlist]").forEach((form) => {
    const input = form.EMAIL;
    if (!input) return;
    const hint = document.createElement("p");
    hint.className = "waitlist-typo";
    hint.hidden = true;
    form.querySelector(".waitlist-row")?.after(hint);
    const check = () => {
      const fix = suggest(input.value);
      hint.hidden = !fix;
      if (!fix) return;
      hint.innerHTML = "";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.noI18n = "";
      btn.textContent = fix;
      btn.addEventListener("click", () => { input.value = fix; hint.hidden = true; input.focus(); });
      hint.append(document.createTextNode("Meintest du "), btn, document.createTextNode("?"));
    };
    input.addEventListener("blur", check);
    input.addEventListener("input", () => { if (!hint.hidden) check(); });
  });
})();
