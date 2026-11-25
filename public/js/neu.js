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
  // App-Galerie. Desktop: 3D-Bühne – das aktive Fenster steht vorn in der Mitte, die Nachbarn stehen schräg
  // dahinter (--o = Abstand zum aktiven Bild, auch gebrochen während des Ziehens). Die Bühne neigt sich leicht
  // zum Mauszeiger. Handy und ohne JS: seitlicher Scroller mit Einrasten (CSS).
  // Bedienung in beiden Fällen: Knöpfe, Ziehen, Pfeiltasten; auf der Bühne auch Klick auf ein Nachbarbild.
  (function () {
    var gal = document.querySelector('[data-gal]'); if (!gal) return;
    var list = gal.querySelector('.app__shots'), prev = gal.querySelector('[data-gal-prev]'), next = gal.querySelector('[data-gal-next]');
    if (!list || !prev || !next) return;
    var items = Array.prototype.slice.call(list.children), n = items.length;
    var mq = window.matchMedia('(min-width: 861px)'), is3d = false, active = 0;

    function step() { var a = items[0], b = items[1]; return b ? b.offsetLeft - a.offsetLeft : list.clientWidth; }
    function sync() {
      if (is3d) { prev.disabled = active <= 0; next.disabled = active >= n - 1; return; }
      prev.disabled = list.scrollLeft < 4;
      next.disabled = list.scrollLeft > list.scrollWidth - list.clientWidth - 4;
    }
    // pos: Stelle auf der Bühne, an der gerade die Mitte liegt (ganze Zahl = Bild genau vorn)
    function place(pos) {
      for (var i = 0; i < n; i++) {
        var o = i - pos, a = Math.abs(o), st = items[i].style;
        st.setProperty('--o', o.toFixed(3));
        st.setProperty('--a', Math.min(a, 2).toFixed(3));
        st.setProperty('--s', Math.max(-1, Math.min(1, o)).toFixed(3));
        st.zIndex = String(100 - Math.round(a * 10));
        items[i].classList.toggle('is-on', a < 0.5);
        items[i].classList.toggle('is-far', a > 2.4);
      }
    }
    function size() { if (is3d) list.style.height = items[0].offsetHeight + 'px'; }
    function setActive(i) { active = Math.max(0, Math.min(n - 1, i)); place(active); sync(); }
    function go(dir) {
      if (is3d) setActive(active + dir);
      else list.scrollBy({ left: dir * step(), behavior: calm ? 'auto' : 'smooth' });
    }
    function mode() {
      is3d = mq.matches;
      gal.classList.toggle('is-3d', is3d);
      if (is3d) { for (var i = 0; i < n; i++) items[i].removeAttribute('data-rv'); list.scrollLeft = 0; size(); setActive(active); }
      else {
        list.style.height = '';
        for (var j = 0; j < n; j++) { items[j].removeAttribute('style'); items[j].classList.remove('is-on', 'is-far'); }
        sync();
      }
    }
    mode();
    if (mq.addEventListener) mq.addEventListener('change', mode);
    window.addEventListener('resize', function () { size(); sync(); });
    window.addEventListener('load', size);
    if (window.ResizeObserver) new ResizeObserver(size).observe(items[0]);

    // Auftritt: die Fenster fächern sich aus der Mitte auf, sobald die Bühne ins Bild kommt.
    if ('IntersectionObserver' in window && !calm) {
      var io = new IntersectionObserver(function (es) {
        if (es[0].isIntersecting) { gal.classList.add('is-live'); io.disconnect(); }
      }, { threshold: 0.25 });
      io.observe(list);
    } else gal.classList.add('is-live');

    prev.addEventListener('click', function () { go(-1); });
    next.addEventListener('click', function () { go(1); });
    list.addEventListener('scroll', sync, { passive: true });
    list.addEventListener('keydown', function (e) {
      if (!is3d) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    });

    // Seitliches Wischen (Trackpad) blättert auf der 3D-Bühne. Das Mausrad bleibt beim Scrollen der Seite.
    var acc = 0, lock = 0;
    list.addEventListener('wheel', function (e) {
      if (!is3d || e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      var dir = e.deltaX > 0 ? 1 : -1, now = Date.now();
      if (now < lock || (dir > 0 ? next.disabled : prev.disabled)) return;
      acc += e.deltaX;
      if (Math.abs(acc) < 40) return;
      acc = 0; lock = now + 520; go(dir);
    }, { passive: false });

    // Maus: anfassen und ziehen. Beim Loslassen rastet das nächstgelegene Bild ein.
    var drag = null, dragged = false;
    list.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      drag = { x: e.clientX, left: list.scrollLeft, moved: false, pos: active };
      dragged = false;
    });
    window.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved) { drag.moved = true; dragged = true; list.classList.add('is-drag'); }
      if (is3d) {
        drag.pos = Math.max(-0.35, Math.min(n - 0.65, active - dx / (items[0].offsetWidth * 0.62)));
        place(drag.pos);
      } else list.scrollLeft = drag.left - dx;
    });
    function drop() {
      if (!drag) return;
      var d = drag; drag = null;
      if (!d.moved) return;
      if (is3d) { list.classList.remove('is-drag'); setActive(Math.round(d.pos)); return; }
      var s = step(), i = Math.round(list.scrollLeft / s);
      list.scrollTo({ left: i * s, behavior: calm ? 'auto' : 'smooth' });
      setTimeout(function () { list.classList.remove('is-drag'); }, calm ? 0 : 450);
    }
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
    list.addEventListener('dragstart', function (e) { e.preventDefault(); });
    // Klick auf ein Nachbarbild holt es nach vorn (nicht nach einem Ziehen)
    list.addEventListener('click', function (e) {
      if (!is3d || dragged) return;
      var li = e.target.closest ? e.target.closest('.app__shot') : null, i = items.indexOf(li);
      if (i >= 0 && i !== active) setActive(i);
    });

    // Von selbst weiter: alle paar Sekunden das nächste Bild, nach dem letzten wieder das erste.
    // Pause, solange die Galerie nicht zu sehen ist, die Maus darüber steht oder sie den Fokus hat,
    // und eine Weile nach jeder Bedienung. Bei reduzierter Bewegung gar nicht.
    if (!calm) {
      var seen = false, hover = false, focus = false, touched = 0, EVERY = 1300, AFTER_USE = 6000;
      function advance() {
        if (is3d) { setActive(active >= n - 1 ? 0 : active + 1); return; }
        if (list.scrollLeft > list.scrollWidth - list.clientWidth - 4) list.scrollTo({ left: 0, behavior: 'smooth' });
        else go(1);
      }
      function used() { touched = Date.now(); }
      ['pointerdown', 'wheel', 'keydown', 'touchstart'].forEach(function (t) { list.addEventListener(t, used, { passive: true }); });
      prev.addEventListener('click', used);
      next.addEventListener('click', used);
      gal.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hover = true; });
      gal.addEventListener('pointerleave', function () { hover = false; used(); });
      gal.addEventListener('focusin', function () { focus = true; });
      gal.addEventListener('focusout', function () { focus = false; });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }, { threshold: 0.4 }).observe(list);
      } else seen = true;
      setInterval(function () {
        if (!seen || hover || focus || drag || document.hidden || Date.now() - touched < AFTER_USE) return;
        advance();
      }, EVERY);
    }

    // Die Bühne neigt sich leicht zum Mauszeiger.
    if (!calm) {
      gal.addEventListener('pointermove', function (e) {
        if (!is3d || e.pointerType !== 'mouse' || drag) return;
        var r = gal.getBoundingClientRect();
        list.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 7).toFixed(2) + 'deg');
        list.style.setProperty('--rx', (((e.clientY - r.top) / r.height - 0.5) * -5).toFixed(2) + 'deg');
      });
      gal.addEventListener('pointerleave', function () { list.style.setProperty('--ry', '0deg'); list.style.setProperty('--rx', '0deg'); });
    }
  })();

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
    // Im Fenster der Xyntal KI scrollt das Mausrad den Chat, nicht die Seite
    lenis = new window.Lenis({ lerp: 0.16, wheelMultiplier: 1, smoothWheel: true, prevent: function (node) { return !!(node.closest && node.closest('.sc')); } });
  }

  // ---------- 3b Überschriften in Wörtern ----------
  // data-words: jedes Wort bekommt ein Fenster, aus dem es beim Einblenden aufsteigt (css/neu.css).
  // Der Text kommt von i18n.js (textFor) und wird beim Sprachwechsel neu gesetzt; das Element selbst
  // ist für i18n gesperrt, damit die einzelnen Wörter nicht übersetzt werden.
  if (!calm) $$('[data-words]').forEach(function (el) {
    var node = el.firstChild;
    if (!node || node.nodeType !== 3 || el.childNodes.length !== 1) return;
    el.setAttribute('data-no-i18n', '');
    function build() {
      var i18n = window.XyntalI18n;
      var txt = i18n && i18n.textFor ? i18n.textFor(node, node.data) : node.data;
      el.textContent = '';
      txt.trim().split(/\s+/).forEach(function (w, i) {
        if (i) el.appendChild(document.createTextNode(' '));
        var o = document.createElement('span'), n = document.createElement('span');
        o.className = 'w'; n.className = 'w__i'; n.style.setProperty('--i', i); n.textContent = w;
        o.appendChild(n); el.appendChild(o);
      });
    }
    build();
    document.addEventListener('xyntal:lang', build);
  });

  // Zahlen zählen hoch, wenn die Kacheln erscheinen. Am Ende steht wieder genau der Text aus dem HTML.
  function countUp(g) {
    $$('.fact__v', g).forEach(function (el, i) {
      var node = el.firstChild; if (!node || node.nodeType !== 3) return;
      var full = node.data, m = full.match(/\d+/), to = m ? +m[0] : 0;
      if (!to) return;
      var t0 = performance.now() + i * 80, dur = 1300;
      (function step(now) {
        var t = clamp((now - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 4);
        if (t < 1) { node.data = full.replace(/\d+/, Math.round(to * e)); requestAnimationFrame(step); }
        else { var i18n = window.XyntalI18n; node.data = i18n && i18n.textFor ? i18n.textFor(node, full) : full; }
      })(performance.now());
    });
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
      setTimeout(function () { el.removeAttribute('data-rv'); el.classList.remove('is-in'); }, d + 2400);
    }
    function showGroup(g) { g.classList.add('is-in'); $$('[data-rv]', g).forEach(show); if (!still && g.hasAttribute('data-count')) countUp(g); }
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

  // ---------- 4b Mit dem Scrollen verbunden ----------
  // track: rechnet je Bild einen Fortschritt 0 bis 1 aus der Lage des Elements und gibt ihn weiter, wenn er sich ändert.
  function track(el, calc, apply) {
    var last = -1;
    tickers.push(function () {
      var p = Math.round(clamp(calc(el.getBoundingClientRect()), 0, 1) * 500) / 500;
      if (p !== last) { last = p; apply(p); }
    });
  }
  function setP(el) { return function (p) { el.style.setProperty('--p', p); }; }

  if (!calm) {
    // Der große Satz hellt sich von oben nach unten auf.
    (function () {
      var el = $('[data-scrub]'); if (!el) return;
      el.classList.add('is-scrub');
      track(el, function (r) { return (vh * 0.9 - r.top) / (vh * 0.35 + r.height); }, setP(el));
    })();

    // Ablauf: die Farblinie wächst mit dem Scrollen, jede Nummer leuchtet auf, sobald die Linie sie erreicht.
    (function () {
      var el = $('.how__steps'); if (!el) return;
      var steps = $$('.how__step', el);
      el.classList.add('is-track');
      track(el, function (r) {
        return mqSmall.matches ? (vh * 0.7 - r.top) / r.height : (vh * 0.82 - r.top) / (vh * 0.42);
      }, function (p) {
        el.style.setProperty('--p', p);
        steps.forEach(function (s, i) { s.classList.toggle('is-on', p >= i / steps.length + 0.04); });
      });
    })();
  }

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
