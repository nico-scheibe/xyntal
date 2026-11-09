// Gemeinsame Helfer für /preise und /unternehmen (tarife.css): Formatierung, Zählwerk,
// Umschalter, Erscheinen beim Scrollen, Fragen mit eigener Adresse, Vergleichstabelle.
// Keine Daten, keine Preise – die holen die Seiten selbst vom App-Server.
window.XyTarife = (() => {
  const en = () => window.XyntalI18n?.get?.() === "en";
  const T = (de, eng) => (en() ? eng : de);
  const loc = () => (en() ? "en-GB" : "de-DE");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = () => (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const calmQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const calm = () => calmQuery.matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const euro = (cents, digits) => (cents / 100).toLocaleString(loc(), { minimumFractionDigits: digits ?? (cents % 100 ? 2 : 0), maximumFractionDigits: digits ?? 2 }) + " €";
  const count = (n) => n.toLocaleString(loc());
  const bytes = (n) => (n >= 1024 ** 4 ? `${Math.round(n / 1024 ** 4)} TB` : n >= 1024 ** 3 ? `${Math.round(n / 1024 ** 3)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
  // Das KI-Budget als Anfragen statt in Euro, gerundet wie unter Profil → Tarif (pages/tarif.js):
  // abgerundet, damit die Zahl nie mehr verspricht, als das Budget hergibt.
  const requests = (cents, callCents) => {
    const n = callCents > 0 ? Math.floor(cents / callCents) : 0;
    if (n < 20) return Math.max(0, n);
    const step = n < 100 ? 5 : n < 1000 ? 10 : 50;
    return Math.floor(n / step) * step;
  };

  // ---- Zählwerk ---------------------------------------------------------------
  // Zeigt einen Text wie „1.290 €“; jede Ziffer ist eine Walze von 0 bis 9, die auf ihren
  // Wert rollt. Ausgerichtet wird von rechts, damit die Einer-Stelle ihre Walze behält.
  const REEL = Array.from({ length: 10 }, (_, i) => `<span>${i}</span>`).join("");
  function odometer(el, text) {
    text = String(text);
    if (el.dataset.odo === text) return;
    el.dataset.odo = text;
    el.classList.add("xs-odo");
    el.setAttribute("data-no-i18n", "");
    const old = [...el.children].reverse();
    const chars = [...text].reverse();
    const next = [];
    let digitIndex = 0;
    chars.forEach((ch, i) => {
      const isDigit = ch >= "0" && ch <= "9";
      let node = old[i];
      if (isDigit) {
        if (!node || !node.classList.contains("xs-odo__d")) {
          node = document.createElement("span");
          node.className = "xs-odo__d";
          node.innerHTML = `<span class="xs-odo__r">${REEL}</span>`;
          node.dataset.v = calm() ? ch : "0";
          node.firstChild.style.transform = `translateY(${-10 * Number(node.dataset.v)}%)`;
        }
        node.firstChild.style.setProperty("--i", digitIndex++);
        node.dataset.to = ch;
      } else if (!node || !node.classList.contains("xs-odo__c") || node.textContent !== ch) {
        node = document.createElement("span");
        node.className = "xs-odo__c" + (ch === " " || ch === "\u00a0" ? " xs-odo__c--sp" : "");
        node.textContent = ch;
      }
      next.push(node);
    });
    el.replaceChildren(...next.reverse());
    // Erst einhängen, dann drehen – sonst gibt es nichts zu überblenden.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll(".xs-odo__d").forEach((d) => {
        if (d.dataset.v === d.dataset.to) return;
        d.dataset.v = d.dataset.to;
        d.firstChild.style.transform = `translateY(${-10 * Number(d.dataset.to)}%)`;
      });
    }));
  }

  // ---- Zahl weich hochzählen ---------------------------------------------------
  function tween(el, to, render, ms = 650) {
    const from = typeof el._n === "number" ? el._n : to;
    el._n = to;
    cancelAnimationFrame(el._raf || 0);
    if (calm() || from === to || document.hidden) { render(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = clamp((t - t0) / ms, 0, 1);
      const e = 1 - Math.pow(1 - k, 4);
      render(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }

  // ---- Umschalter: die helle Fläche gleitet unter die gewählte Seite -------------
  function seg(root, onChange) {
    const thumb = document.createElement("span");
    thumb.className = "xs-seg__thumb";
    thumb.setAttribute("aria-hidden", "true");
    root.prepend(thumb);
    const place = () => {
      const on = root.querySelector('[aria-pressed="true"]');
      if (!on || !root.offsetWidth) return;
      const inner = root.clientWidth - 8;
      thumb.style.setProperty("--l", `${on.offsetLeft - 4}px`);
      thumb.style.setProperty("--r", `${inner - (on.offsetLeft - 4) - on.offsetWidth}px`);
      root.classList.add("is-ready");
    };
    root.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-value]");
      if (!b || b.getAttribute("aria-pressed") === "true") return;
      root.querySelectorAll("button[data-value]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      place();
      onChange(b.dataset.value);
    });
    if ("ResizeObserver" in window) new ResizeObserver(place).observe(root);
    document.fonts?.ready.then(place);
    place();
    return { place, set(v) { root.querySelectorAll("button[data-value]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.value === v))); place(); } };
  }

  // ---- Erscheinen: [data-in] bekommt .is-in, sobald es im Bild ist ----------------
  let io = null;
  function watch(root = document) {
    const els = root.querySelectorAll("[data-in]:not(.is-in):not([data-in-bound])");
    if (!("IntersectionObserver" in window) || calm()) { els.forEach((el) => el.classList.add("is-in")); return; }
    io ||= new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 });
    els.forEach((el) => { el.setAttribute("data-in-bound", ""); io.observe(el); });
  }

  // ---- Meldung ---------------------------------------------------------------------
  let toastEl = null, toastTimer = 0;
  function toast(text) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "xs-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("data-no-i18n", "");
      document.body.append(toastEl);
    }
    toastEl.textContent = text;
    requestAnimationFrame(() => toastEl.classList.add("is-on"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), 2200);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.append(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* dann eben nicht */ }
      ta.remove();
    }
    toast(done);
  }

  // ---- Fragen ------------------------------------------------------------------------
  // <details class="xs-q" id="frage-…">: funktioniert ohne Skript. Mit Skript gleitet alles,
  // was darunter steht, an seinen neuen Platz (nur transform), die Antwort blendet ein, und
  // die Adresse der Frage steht in der Adresszeile – zum Weitergeben.
  function following(el) {
    const out = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        if (s.tagName === "SCRIPT" || s.classList.contains("sc") || s.classList.contains("xs-toast")) continue;
        out.push(s);
      }
    }
    return out;
  }
  function glide(item, change) {
    if (calm() || !item.animate) { change(); return; }
    const before = item.getBoundingClientRect().height;
    change();
    const delta = item.getBoundingClientRect().height - before;
    if (!delta) return;
    const opts = { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" };
    for (const el of following(item)) el.animate([{ transform: `translateY(${-delta}px)` }, { transform: "none" }], opts);
    const a = item.querySelector(".xs-q__a");
    if (a && item.open) a.animate([{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "none" }], { duration: 420, delay: 80, easing: opts.easing, fill: "backwards" });
  }
  function faq(root) {
    if (!root) return;
    const items = [...root.querySelectorAll("details.xs-q")];
    for (const item of items) {
      const sum = item.querySelector("summary");
      sum.addEventListener("click", (e) => {
        e.preventDefault();
        const open = !item.open;
        glide(item, () => { item.open = open; });
        if (item.id) history.replaceState(null, "", open ? `#${item.id}` : location.pathname + location.search);
      });
      const link = item.querySelector(".xs-q__link");
      link?.addEventListener("click", (e) => {
        e.preventDefault();
        history.replaceState(null, "", `#${item.id}`);
        copy(location.origin + location.pathname + `#${item.id}`, T("Link zur Frage kopiert", "Link to this question copied"));
      });
    }
    const fromHash = () => {
      const item = location.hash.length > 1 && items.find((i) => `#${i.id}` === location.hash);
      if (!item) return;
      item.open = true;
      requestAnimationFrame(() => item.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" }));
    };
    window.addEventListener("hashchange", fromHash);
    fromHash();
    // Ausweg: der Xyntal-Assistent unten rechts (site-chat.js)
    root.querySelectorAll("[data-open-chat]").forEach((b) => b.addEventListener("click", () => {
      const btn = document.querySelector(".sc .sc-open");
      if (!btn) { location.href = "mailto:admin@xyntal.com"; return; }
      if (btn.getAttribute("aria-expanded") !== "true") btn.click();
      setTimeout(() => document.querySelector(".sc textarea, .sc input")?.focus(), 250);
    }));
  }

  // ---- Vergleichstabelle ---------------------------------------------------------------
  // Haken als SVG, die sich zeichnen. Schmal: Knöpfe über der Tabelle springen zur Spalte,
  // und beim Wischen zeigt der Knopf, welche Spalte gerade vorn steht.
  const CHECK = '<svg viewBox="0 0 18 18" aria-hidden="true"><path pathLength="1" d="M3.5 9.6l3.6 3.6 7.4-8"/></svg>';
  function table(wrap, { onPick } = {}) {
    const scroller = wrap.querySelector(".xs-cmp__scroll");
    const jump = wrap.querySelector(".xs-cmp__jump");
    const tbl = wrap.querySelector("table");
    function dress() {
      tbl.querySelectorAll(".xs-y:empty").forEach((y) => { y.innerHTML = CHECK; });
      tbl.querySelectorAll("tbody tr:not(.is-group)").forEach((tr) => {
        tr.setAttribute("data-in", "");
        [...tr.children].forEach((c, i) => c.style.setProperty("--c", i));
      });
      watch(tbl);
      if (!jump) return;
      const heads = [...tbl.querySelectorAll("thead th")].slice(1);
      jump.innerHTML = heads.map((th, i) => `<button type="button" data-col="${i}" aria-pressed="false">${esc(th.dataset.name || th.textContent.trim())}</button>`).join("");
      sync();
    }
    function select(col) {
      tbl.querySelectorAll(".is-sel").forEach((c) => c.classList.remove("is-sel"));
      if (col < 0) return;
      tbl.querySelectorAll("tr").forEach((tr) => { if (!tr.classList.contains("is-group")) tr.children[col + 1]?.classList.add("is-sel"); });
    }
    function front() {
      const heads = [...tbl.querySelectorAll("thead th")].slice(1);
      if (!heads.length) return 0;
      const w = heads[0].offsetWidth || 1;
      return clamp(Math.round(scroller.scrollLeft / w), 0, heads.length - 1);
    }
    function sync() {
      if (!jump) return;
      const f = front();
      jump.querySelectorAll("button").forEach((b, i) => {
        const on = i === f;
        if (on && b.getAttribute("aria-pressed") !== "true" && jump.scrollWidth > jump.clientWidth) jump.scrollTo({ left: b.offsetLeft - 20, behavior: calm() ? "auto" : "smooth" });
        b.setAttribute("aria-pressed", String(on));
      });
    }
    function show(col) {
      const th = tbl.querySelectorAll("thead th")[col + 1];
      if (!th || scroller.scrollWidth <= scroller.clientWidth) return;
      scroller.scrollTo({ left: th.offsetWidth * col, behavior: calm() ? "auto" : "smooth" });
    }
    let raf = 0;
    scroller?.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
    jump?.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-col]");
      if (!b) return;
      show(Number(b.dataset.col));
      onPick?.(Number(b.dataset.col));
    });
    return { dress, select, show };
  }

  return { en, T, loc, esc, api, calm, clamp, euro, count, bytes, requests, odometer, tween, seg, watch, toast, copy, faq, table };
})();
