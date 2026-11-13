// Xyntal – Sprachumschalter Deutsch/Englisch (Standard: Deutsch).
// Die Seiten sind auf Deutsch geschrieben. Für Englisch werden sichtbare Texte und Attribute
// über das Wörterbuch in i18n-en.js ersetzt – auch Inhalte, die Skripte später einfügen.
// Die Wahl wird im Browser gemerkt (localStorage „xyntal-lang“).
// Seiten ohne Wörterbuch (die Startseite lädt die 370 KB von i18n-en.js nicht) übersetzen nicht selbst:
// Dort führt „EN“ zur englischen Adresse aus <link rel="alternate" hreflang="en">, die der Server übersetzt.
(() => {
  const KEY = "xyntal-lang";
  const ATTRS = ["placeholder", "aria-label", "title", "alt"];
  const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE"]);
  const DICT = window.XYNTAL_EN || {};
  const PATTERNS = window.XYNTAL_EN_PATTERNS || [];
  const HAS_DICT = Object.keys(DICT).length > 0;
  const EN_HREF = document.querySelector('link[rel="alternate"][hreflang="en"]')?.getAttribute("href") || "";

  let lang = "de";
  try { lang = HAS_DICT && localStorage.getItem(KEY) === "en" ? "en" : "de"; } catch { /* ohne Speicher: Deutsch */ }
  // Seiten unter /en/ kommen schon englisch vom Server (eigene Adresse für Suchmaschinen). Dort gilt
  // immer Englisch – auch für Texte, die Skripte später einfügen –, und „DE“ führt zur deutschen Adresse.
  const EN_URL = /^\/en(\/|$)/.test(location.pathname);
  if (EN_URL) lang = "en";
  document.documentElement.lang = lang;

  const origText = new WeakMap();   // Textknoten -> deutscher Originaltext
  const origAttr = new WeakMap();   // Element -> { attr: deutscher Originalwert }
  const tracked = new Set();        // Knoten/Elemente, die übersetzt werden können

  const norm = (s) => s.replace(/\s+/g, " ").trim();

  function translate(de) {
    const key = norm(de);
    if (!key) return de;
    let en = DICT[key];
    if (en === undefined) {
      for (const [re, rep] of PATTERNS) {
        const m = key.match(re);
        if (m) { en = typeof rep === "function" ? rep(...m) : key.replace(re, rep); break; }
      }
    }
    if (en === undefined) return de;
    // führende/folgende Leerzeichen erhalten, damit Wörter nicht zusammenkleben
    const lead = de.match(/^\s*/)[0], trail = de.match(/\s*$/)[0];
    return lead + en + trail;
  }

  const blocked = (el) => !el || el.closest?.("[data-no-i18n], [contenteditable='true']");

  function applyText(node) {
    if (!origText.has(node)) { origText.set(node, node.data); tracked.add(node); }
    const de = origText.get(node);
    const want = lang === "en" ? translate(de) : de;
    if (node.data !== want) node.data = want;
  }
  function applyAttrs(el) {
    let store = origAttr.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      if (!store) { store = {}; origAttr.set(el, store); tracked.add(el); }
      if (!(a in store)) store[a] = el.getAttribute(a);
      const want = lang === "en" ? translate(store[a]) : store[a];
      if (el.getAttribute(a) !== want) el.setAttribute(a, want);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { if (root.data.trim() && !blocked(root.parentElement) && !SKIP.has(root.parentElement?.tagName)) applyText(root); return; }
    if (root.nodeType === 1 && root.tagName === "TEXTAREA" && !blocked(root)) { applyAttrs(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName) || blocked(root)) return;
    applyAttrs(root);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (n.nodeType === 1 && n.tagName === "TEXTAREA" && !n.hasAttribute("data-no-i18n")) { applyAttrs(n); return NodeFilter.FILTER_REJECT; }
        if (n.nodeType === 1) return SKIP.has(n.tagName) || n.hasAttribute("data-no-i18n") || n.getAttribute("contenteditable") === "true" ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return n.data.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    while (tw.nextNode()) { const n = tw.currentNode; if (n.nodeType === 3) applyText(n); else applyAttrs(n); }
  }

  // Titel und Beschreibung der Seite
  const meta = document.querySelector('meta[name="description"]');
  const head = { title: document.title, desc: meta?.content || "" };
  function applyHead() {
    document.title = lang === "en" ? translate(head.title) : head.title;
    if (meta) meta.content = lang === "en" ? translate(head.desc) : head.desc;
  }

  function applyAll() {
    for (const n of tracked) {
      if (!n.isConnected) { tracked.delete(n); continue; }
      if (n.nodeType === 3) applyText(n); else applyAttrs(n);
    }
    walk(document.body);
    applyHead();
  }

  // Für Effekte, die Text animieren: welcher Text gehört gerade in diesen Knoten?
  function textFor(node, fallback) {
    const de = origText.get(node);
    if (de === undefined) return fallback;
    return lang === "en" ? translate(de) : de;
  }

  /* ---------- Umschalter in der Kopfzeile, zwischen Suche und Bewerben ----------
     Startseite: .top__right (Aussehen in css/neu.css). Unterseiten: .nav .wrap, direkt hinter der
     Navigation, damit die Tab-Reihenfolge passt; die Stelle im Bild legt site-header.css fest. */
  function mountSwitch() {
    const host = document.querySelector(".top__right, .nav .wrap");
    if (!host || document.querySelector(".lang-switch")) return;
    const sw = document.createElement("div");
    sw.className = "lang-switch";
    sw.setAttribute("role", "group");
    sw.setAttribute("data-no-i18n", "");
    sw.setAttribute("aria-label", "Sprache / Language");
    sw.innerHTML = '<button type="button" data-lang="de" lang="de" aria-label="Deutsch">DE</button><button type="button" data-lang="en" lang="en" aria-label="English">EN</button>';
    const links = host.querySelector(":scope > .nav-links");
    if (links) links.after(sw); else host.prepend(sw);
    sw.addEventListener("click", (e) => { const b = e.target.closest("[data-lang]"); if (b) set(b.dataset.lang); });
    syncSwitch();
  }
  function syncSwitch() {
    document.querySelectorAll(".lang-switch [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }

  function set(next) {
    next = next === "en" ? "en" : "de";
    if (next === lang) return;
    if (EN_URL) {
      try { localStorage.setItem(KEY, next); } catch { /* egal */ }
      location.href = "/" + location.pathname.replace(/^\/en(?=\/|$)/, "").replace(/^\/+/, "") + location.search + location.hash;
      return;
    }
    if (!HAS_DICT) {
      if (next !== "en" || !EN_HREF) return;
      try { localStorage.setItem(KEY, next); } catch { /* egal */ }
      location.href = new URL(EN_HREF, location.href).pathname + location.search + location.hash;
      return;
    }
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch { /* egal */ }
    document.documentElement.lang = lang;
    applyAll();
    syncSwitch();
    document.dispatchEvent(new CustomEvent("xyntal:lang", { detail: { lang } }));
  }

  window.XyntalI18n = { set, get: () => lang, t: (de) => (lang === "en" ? translate(de) : de), textFor };

  function start() {
    mountSwitch();
    if (!HAS_DICT) return; // nichts zu übersetzen (Text kommt schon in der richtigen Sprache)
    walk(document.body);
    applyHead();
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) walk(n);
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
