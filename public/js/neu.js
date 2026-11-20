/* ==========================================================================
   Xyntal · Startseite
   Reines JavaScript. Einzige Bibliothek: Lenis für weiches Scrollen (js/vendor), nur mit Maus
   auf dem Desktop. Bewegung nur über transform und opacity, einmal beim Eintritt.
   Jede Abfrage prüft, ob das Element da ist: fehlt eines, bleibt der Rest ohne Fehler.

   Inhalt:  1 Helfer · 2 Einstieg · 3 Scrollen · 4 Einblenden · 5 Durchstreichen
            6 Vergleich (Handy) · 7 Fragen · 8 Warteliste · 9 Kopfzeile · 10 Schleife
   ========================================================================== */
(function () {
  'use strict';

  // ---------- 1 Helfer ----------
  var root = document.documentElement;
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var mqSmall = window.matchMedia('(max-width: 860px)');

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var vh = window.innerHeight, scrollY = window.scrollY, lastY = scrollY, velocity = 0;
  var tickers = [];

  // ---------- 2 Einstieg ----------
  // Die Zeilen der Überschrift steigen per CSS auf (Klasse „go“). Hier wird nur die Klasse gesetzt
  // und der Hero-Canvas gestartet (js/hero-gl.js). Ohne WebGL bleibt das Logo als SVG stehen.
  requestAnimationFrame(function () { root.classList.add('go'); if (window.XyHero) window.XyHero.start(); });

  // Die Logo-Punkte lösen sich beim Wegscrollen etwas auf (nur mit WebGL oder 2D-Ersatz, sonst nichts).
  (function () {
    var hero = $('[data-hero]'); if (!hero) return;
    tickers.push(function () {
      if (!window.XyHero) return;
      var p = clamp(scrollY / (hero.offsetHeight || vh), 0, 1);
      window.XyHero.spread(calm ? 0 : p * 1.1);
    });
  })();

  // ---------- 3 Scrollen ----------
  // Lenis nur mit Maus/Trackpad auf dem Desktop. Auf dem Handy und bei reduzierter Bewegung bleibt das Scrollen des Systems.
  var lenis = null;
  if (!calm && fine && !mqSmall.matches && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.16, wheelMultiplier: 1, smoothWheel: true });
  }

  // ---------- 4 Einblenden ----------
  // Einmal beim Eintritt. Einzelne Elemente (data-rv) blenden ein, sobald etwa 20 % sichtbar sind;
  // Geschwister starten gestaffelt. Eine Gruppe (data-rv-group) startet alle ihre Elemente zusammen,
  // gestaffelt der Reihe nach: so sind auch Karten da, die auf dem Handy seitlich außerhalb liegen.
  // Nach dem Einblenden fällt data-rv weg, damit Hover-Übergänge nicht den Versatz erben.
  (function () {
    var groups = $$('[data-rv-group]'), items = $$('[data-rv]');
    if (!items.length && !groups.length) return;
    var solo = items.filter(function (it) { return !it.closest('[data-rv-group]'); });
    solo.forEach(function (it) {
      var idx = 0, s = it;
      while ((s = s.previousElementSibling) && s.hasAttribute('data-rv')) idx++;
      it.style.setProperty('--d', Math.min(idx, 3) * 90 + 'ms');
    });
    groups.forEach(function (g) {
      $$('[data-rv]', g).forEach(function (it, i) { it.style.setProperty('--d', Math.min(i, 5) * 80 + 'ms'); });
    });
    var still = calm || !('IntersectionObserver' in window);
    function show(el) {
      el.classList.add('is-in');
      if (still || !el.hasAttribute('data-rv')) return;
      var d = parseInt(el.style.getPropertyValue('--d'), 10) || 0;
      setTimeout(function () { el.removeAttribute('data-rv'); el.classList.remove('is-in'); }, d + 1400);
    }
    function showGroup(g) { g.classList.add('is-in'); $$('[data-rv]', g).forEach(show); }
    if (still) { solo.forEach(show); groups.forEach(showGroup); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
    solo.forEach(function (it) { io.observe(it); });
    var gio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { showGroup(e.target); gio.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    groups.forEach(function (g) { gio.observe(g); });
  })();

  // Der große Satz hellt sich beim Scrollen von oben nach unten auf (--p von 0 bis 1).
  (function () {
    var el = $('[data-scrub]'); if (!el || calm) return;
    el.classList.add('is-scrub');
    var last = -1;
    tickers.push(function () {
      var r = el.getBoundingClientRect();
      if (r.top > vh || r.bottom < 0) return;
      var p = clamp((vh * 0.9 - r.top) / (vh * 0.35 + r.height), 0, 1);
      p = Math.round(p * 500) / 500;
      if (p !== last) { last = p; el.style.setProperty('--p', p); }
    });
  })();

  // ---------- 5 Durchstreichen ----------
  // Die Linie zeichnet sich, wenn der Name im Bild ist (einmal).
  (function () {
    var targets = $$('[data-strike]'); if (!targets.length) return;
    if (!('IntersectionObserver' in window) || calm) { targets.forEach(function (t) { t.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) {
        if (!e.isIntersecting) return;
        var t = e.target;
        setTimeout(function () { t.classList.add('is-in'); }, i * 110);
        io.unobserve(t);
      });
    }, { rootMargin: '0px 0px -18% 0px', threshold: 0.2 });
    targets.forEach(function (t) { io.observe(t); });
  })();

  // ---------- 6 Vergleich (Handy): der Punkt zeigt die Karte, die gerade ganz sichtbar ist ----------
  (function () {
    var sc = $('[data-cmp]'), dots = $$('[data-cmp-dots] i');
    if (!sc || !dots.length) return;
    var list = $('.cmp__list', sc), cards = list ? $$('.cmp__card', list) : [];
    if (!cards.length) return;
    var cur = -1;
    function update() {
      var best = 0, bd = Infinity;
      cards.forEach(function (c, i) { var d = Math.abs(c.offsetLeft - sc.scrollLeft); if (d < bd) { bd = d; best = i; } });
      if (best === cur) return;
      cur = best;
      dots.forEach(function (d, i) { d.classList.toggle('is-on', i === best); });
    }
    sc.addEventListener('scroll', update, { passive: true });
    update();
  })();

  // ---------- 7 Fragen: Akkordeon ----------
  // Jede Frage ist ein Button mit aria-expanded. Die Antwort bleibt im HTML; zu ist sie erst, wenn JS läuft.
  // Auf und zu macht die Klasse is-open (css/neu.css): die Höhe gleitet, zu heißt visibility: hidden.
  $$('.qa__btn').forEach(function (b) {
    var panel = document.getElementById(b.getAttribute('aria-controls') || '');
    if (!panel) return;
    panel.classList.toggle('is-open', b.getAttribute('aria-expanded') === 'true');
    b.addEventListener('click', function () {
      var open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('is-open', open);
    });
  });

  // ---------- 8 Warteliste: der Textlink klappt das Formular auf und wieder zu ----------
  (function () {
    var btn = $('[data-wl-toggle]'), box = document.getElementById('warteliste');
    if (!btn || !box) return;
    // Die deutschen Texte stehen im HTML (data-wl-closed / data-wl-open), nicht im sichtbaren Text:
    // beim Laden ist der sichtbare Text in Englisch, wenn die Sprache EN ist. Gesetzt wird immer der
    // deutsche Text; i18n.js übersetzt ihn beim Einfügen automatisch und bei jedem Sprachwechsel.
    var textClosed = btn.getAttribute('data-wl-closed'), textOpen = btn.getAttribute('data-wl-open');
    btn.addEventListener('click', function () {
      var open = box.hidden;
      box.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (textClosed && textOpen) btn.textContent = open ? textOpen : textClosed;
      if (open) {
        var input = $('input[name="EMAIL"]', box);
        if (input) input.focus();
      } else {
        btn.focus();
      }
    });
  })();

  // ---------- 9 Kopfzeile: bekommt Grund nach dem ersten Stück, verschwindet beim Runterscrollen ----------
  (function () {
    var top = $('[data-top]'); if (!top) return;
    var acc = 0;
    tickers.push(function () {
      top.classList.toggle('is-solid', scrollY > 40);
      acc = velocity > 0 ? Math.max(0, acc) + velocity : Math.min(0, acc) + velocity;
      if (scrollY < 300 || acc < -40) top.classList.remove('is-away');
      else if (acc > 60) top.classList.add('is-away');
    });
    top.addEventListener('focusin', function () { top.classList.remove('is-away'); acc = 0; });
  })();

  // ---------- 10 Schleife: eine für alles ----------
  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { vh = window.innerHeight; if (lenis) lenis.resize(); }, 140);
  });
  function loop(time) {
    if (lenis) lenis.raf(time);
    scrollY = window.scrollY; velocity = scrollY - lastY; lastY = scrollY;
    for (var i = 0; i < tickers.length; i++) tickers[i]();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
