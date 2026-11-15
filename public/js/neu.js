/* ==========================================================================
   Xyntal · Startseite (Entwurf „index-neu“)
   Reines JavaScript. Einzige Bibliothek: Lenis für weiches Scrollen (js/vendor).
   Alle Scroll-Szenen hängen an EINER Schleife (requestAnimationFrame) und
   schreiben nur transform/opacity (Ausnahmen sind im Code benannt).

   Inhalt:  1 Helfer · 2 Text zerlegen · 3 Start · 4 Scrollen · 5 Szenen
            7 Lichtreflex · 8 Schleife
   ========================================================================== */
(function () {
  'use strict';

  // ---------- 1 Helfer ----------
  var root = document.documentElement;
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var mqSmall = window.matchMedia('(max-width: 860px)');
  if (!fine) root.classList.add('touch');

  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  var vw = window.innerWidth, vh = window.innerHeight, scrollY = window.scrollY, lastY = scrollY, velocity = 0;
  var resizers = [], tickers = [];

  // ---------- 2 Text zerlegen ----------
  // Überschrift im Einstieg: Wörter bleiben zusammen, Zeichen werden einzeln animiert.
  $$('[data-split]').forEach(function (line) {
    var src = window.XyntalI18n ? window.XyntalI18n.t(line.textContent) : line.textContent;
    var words = src.split(' '), i = 0;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');           // der ganze Satz steht im aria-label der h1
    words.forEach(function (word, wi) {
      var w = el('span', 'wd');
      word.split('').forEach(function (c) { var s = el('span', 'ch', c); s.style.setProperty('--i', i++); w.appendChild(s); });
      line.appendChild(w);
      if (wi < words.length - 1) { line.appendChild(document.createTextNode(' ')); i++; }
    });
  });

  // Bei Sprachwechsel (Schalter DE/EN) ist die Überschrift schon zerlegt: neu laden, dann wird neu übersetzt.
  document.addEventListener('xyntal:lang', function () { location.reload(); });

  // „Warum“-Absatz: jedes Wort einzeln, damit es beim Scrollen hell wird.
  var sayWords = [];
  (function () {
    var p = $('[data-say-text]'); if (!p) return;
    var words = p.textContent.trim().split(/\s+/);
    p.textContent = '';
    words.forEach(function (w, i) { var s = el('span', 'w', w); p.appendChild(s); if (i < words.length - 1) p.appendChild(document.createTextNode(' ')); sayWords.push(s); });
  })();

  // Zitat: in die Zeilen zerlegen, wie der Browser sie gerade umbricht. Bei neuer Breite neu.
  $$('[data-reveal-lines] p').forEach(function (p) {
    var text = p.textContent.trim();
    function build() {
      p.textContent = '';
      var spans = text.split(/\s+/).map(function (w) { var s = el('span', '', w + ' '); s.style.display = 'inline-block'; s.style.whiteSpace = 'pre'; p.appendChild(s); return s; });
      var lines = [], top = null;
      spans.forEach(function (s) { if (s.offsetTop !== top) { lines.push([]); top = s.offsetTop; } lines[lines.length - 1].push(s.textContent); });
      p.textContent = '';
      lines.forEach(function (l, i) { var ln = el('span', 'ln'), inner = el('span', '', l.join('').trim()); inner.style.setProperty('--i', i); ln.appendChild(inner); p.appendChild(ln); p.appendChild(document.createTextNode(' ')); });
    }
    build(); resizers.push(build);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(build);
  });

  // Schluss-Überschrift: jedes Zeichen bekommt sein eigenes Schriftgewicht.
  var flexChars = [];
  $$('[data-flex-line]').forEach(function (line) {
    var t = line.textContent; line.textContent = ''; line.setAttribute('aria-hidden', 'true');
    t.split('').forEach(function (c) {
      if (c === ' ') { line.appendChild(document.createTextNode(' ')); return; }
      var s = el('span', 'fx', c); line.appendChild(s); flexChars.push({ el: s, x: 0, y: 0, w: 300, shown: 300 });
    });
  });

  // ---------- 3 Start der Einstiegs-Animation ----------
  requestAnimationFrame(function () { root.classList.add('go'); if (window.XyHero) window.XyHero.start(); });

  // ---------- 4 Scrollen ----------
  // Lenis nur mit Maus/Trackpad. Auf Touch bleibt das Scrollen des Systems, das fühlt sich dort besser an.
  var lenis = null;
  if (!calm && fine && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.16, wheelMultiplier: 1, smoothWheel: true });
  }

  // ---------- 5 Szenen ----------

  // 5.0 Einstieg: Punkte lösen sich beim Wegscrollen, Überschrift bleibt etwas zurück.
  (function () {
    var hero = $('[data-hero]'), h1 = $('.hero__h'); if (!hero) return;
    tickers.push(function () {
      var p = clamp(scrollY / (hero.offsetHeight || vh), 0, 1);
      if (window.XyHero) window.XyHero.spread(calm ? 0 : p * 1.1);
      if (!calm && p < 1) h1.style.transform = 'translate3d(0,' + (p * -70).toFixed(1) + 'px,0)';
    });
  })();

  // Laufband: läuft immer nach links, schneller mit dem Scrolltempo (egal in welche Richtung gescrollt wird).
  (function () {
    var track = $('[data-band-track]'); if (!track) return;
    track.innerHTML += track.innerHTML;                     // einmal verdoppeln für die Endlosschleife
    var half = 0, x = 0;
    function measure() { half = track.scrollWidth / 2; }
    measure(); resizers.push(measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if (calm) return;
    tickers.push(function () {
      x -= 0.45 + Math.min(Math.abs(velocity), 60) * 0.22;
      if (half > 0 && x <= -half) x += half;
      track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    });
  })();

  // 5.1 Warum: Wörter werden nacheinander hell.
  (function () {
    var p = $('[data-say-text]'); if (!p || calm) { sayWords.forEach(function (w) { w.classList.add('is-lit'); }); return; }
    var lit = 0;
    tickers.push(function () {
      var r = p.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) return;
      var prog = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.3), 0, 1);
      var n = Math.round(prog * sayWords.length);
      if (n === lit) return;
      for (var i = Math.min(n, lit); i < Math.max(n, lit); i++) sayWords[i].classList.toggle('is-lit', i < n);
      lit = n;
    });
  })();

  // 5.2 Matching: Abschnitt bleibt stehen. Vier Schritte, die Kamera fährt gedämpft über die echte App (max. 1.5x, mobil 1.3x).
  (function () {
    var pin = $('[data-pin]'); if (!pin) return;
    var steps = $$('[data-step]', pin), shots = $$('[data-shot]', pin), win = $('[data-win]', pin), cam = $('[data-cam]', pin);
    var now = $('[data-pin-now]', pin), bar = $('[data-pin-bar]', pin);
    var mqPhone = window.matchMedia('(max-width: 760px)');
    // Kamera je Schritt: Mittelpunkt (Anteil am Bild), Zoom (wird unten gedeckelt), welches Bild
    // Die Koordinaten gehören zu den Screens aus App-Version 0.2.19 (deutsch) und 0.2.28 (englisch,
    // assets/img/en/, gezeigt auf /en). Neue Screens: Werte hier nachziehen.
    var RATIO = [1800 / 2880, 2800 / 2880];   // Höhe/Breite je Bild (Entdecken, Profil)
    var CAMS = document.documentElement.lang === 'en' ? {
      wide: [
        { shot: 0, cx: .50, cy: .50, s: 1.00 },
        { shot: 0, cx: .29, cy: .681, s: 2.25 },
        { shot: 1, cx: .575, cy: .638, s: 1.22 },
        { shot: 1, cx: .575, cy: .88, s: 1.22 }
      ],
      small: [
        { shot: 0, cx: .33, cy: .33, s: 2.5 },
        { shot: 0, cx: .27, cy: .691, s: 3.3 },
        { shot: 1, cx: .41, cy: .608, s: 2.5 },
        { shot: 1, cx: .385, cy: .87, s: 2.5 }
      ]
    } : {
      wide: [
        { shot: 0, cx: .50, cy: .50, s: 1.00 },
        { shot: 0, cx: .29, cy: .69, s: 2.25 },
        { shot: 1, cx: .575, cy: .56, s: 1.22 },
        { shot: 1, cx: .575, cy: .765, s: 1.22 }
      ],
      small: [
        { shot: 0, cx: .33, cy: .33, s: 2.5 },
        { shot: 0, cx: .27, cy: .70, s: 3.3 },
        { shot: 1, cx: .41, cy: .53, s: 2.5 },
        { shot: 1, cx: .385, cy: .755, s: 2.5 }
      ]
    };
    // Ruhige Fassung: keine Fahrt. Jeder Schritt bekommt eine feste Kopie des Fensters mit dem Bild, das zu ihm gehört.
    if (calm) {
      steps.forEach(function (s, i) {
        var still = win.cloneNode(true), fig = document.createElement('figure');
        still.removeAttribute('data-win'); var inner = $('[data-cam]', still); if (inner) inner.removeAttribute('data-cam');
        $$('[data-shot]', still).forEach(function (im, k) { im.classList.toggle('is-on', k === CAMS.wide[i].shot); });
        still.classList.toggle('is-profil', CAMS.wide[i].shot === 1);
        fig.className = 'pin__still'; fig.appendChild(still); s.appendChild(fig);
      });
      return;
    }

    var W = 1, H = 1, cur = null, step = -1, last = 0;
    function measure() { W = win.clientWidth; H = win.clientHeight; cur = null; }
    measure(); resizers.push(measure);

    function target(i, local) {
      var phone = mqPhone.matches;
      var c = (phone ? CAMS.small : CAMS.wide)[i];
      var IH = W * RATIO[c.shot];
      var cap = phone ? 1.3 : 1.5;                                             // Zoom-Deckel
      var s = Math.max(Math.min(c.s * (1 + local * 0.035), cap), H / IH);       // kleine Fahrt im Schritt; H/IH: das Bild füllt den Rahmen, kein Rand
      return { ih: IH, s: s, x: clamp(W / 2 - c.cx * W * s, W - W * s, 0), y: clamp(H / 2 - c.cy * IH * s, H - IH * s, 0) };
    }

    tickers.push(function () {
      var r = pin.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var nowT = performance.now(), dt = Math.min(100, nowT - (last || nowT)); last = nowT;   // Zeit pro Frame, damit die Fahrt unabhängig von der Bildrate läuft
      var p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1), f = Math.min(3.999, p * 4), i = Math.floor(f), local = f - i;
      if (i !== step) {
        step = i;
        steps.forEach(function (s, k) { s.classList.toggle('is-on', k === i); s.classList.toggle('is-past', k < i); });
        var c = (mqPhone.matches ? CAMS.small : CAMS.wide)[i];
        shots.forEach(function (s, k) { s.classList.toggle('is-on', k === c.shot); });
        win.classList.toggle('is-profil', c.shot === 1); H = win.clientHeight;   // Mobil folgt der Rahmen dem Seitenverhältnis des Bildes
        now.textContent = '0' + (i + 1);
      }
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      var t = target(i, local);
      if (!cur) cur = { s: t.s, x: t.x, y: t.y };
      var k = 1 - Math.exp(-dt / 380);   // Zeitkonstante 380 ms: nach ca. 900 ms ist die Kamera fast am Ziel
      cur.s = lerp(cur.s, t.s, k); cur.x = lerp(cur.x, t.x, k); cur.y = lerp(cur.y, t.y, k);
      cam.style.transform = 'translate3d(' + cur.x.toFixed(2) + 'px,' + cur.y.toFixed(2) + 'px,0) scale(' + cur.s.toFixed(4) + ')';
    });
  })();

  // Überschrift, die beim Hochscrollen schmaler wird (Variable Font, Achse „wdth“).
  // Ändert das Layout einer einzelnen Zeile, deshalb nur, solange sie im Bild ist.
  $$('[data-stretch]').forEach(function (h) {
    if (calm) return;
    var last = -1;
    tickers.push(function () {
      var r = h.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var p = clamp((vh - r.top) / (vh * 0.75), 0, 1), wd = Math.round(lerp(80, 62, p) * 2) / 2;
      if (wd !== last) { h.style.fontStretch = wd + '%'; last = wd; }
    });
  });

  // 5.4 Der Weg: ab 861 px wird senkrechtes Scrollen zur Fahrt nach rechts, die Linie zeichnet sich mit.
  // Darunter und bei reduzierter Bewegung steht alles senkrecht; dort wächst nur die Linie am Rand mit dem Scrollen.
  // Jede Abfrage ist einzeln geprüft: fehlt ein Element, bleibt der Rest ohne Fehler.
  (function () {
    var way = $('[data-way]'); if (!way) return;
    var track = $('[data-way-track]', way);
    var line = $('[data-way-line]', way), grad = $('[data-way-grad]', way), vline = $('[data-way-vline]', way), wrap = $('[data-way-steps]', way);
    var svg = line ? line.parentNode : null;
    var steps = $$('[data-way-step]', way);
    var heads = steps.map(function (s) { return $('.way__n', s); });
    var bodies = steps.map(function (s) { return $('p', s); });
    var TW = 0, X0 = 0, x = 0, pinned = false;

    // Linie: beginnt an der Kante des ersten Schritts (nicht auf dem Titel). Fortschritt über dashoffset.
    function setLines(px) {    // px = wie weit die Fahrt ist; die Linie läuft dem Bild etwas voraus
      if (!line) return;
      var span = TW - X0 - vw * 0.28;
      var f = clamp((px + vw * 0.72 - X0) / (span > 0 ? span : 1), 0, 1);
      line.style.strokeDashoffset = (1 - f).toFixed(4);   // dashoffset: einzige Ausnahme von transform/opacity
    }
    function measure() {
      pinned = !mqSmall.matches && !calm;
      bodies.forEach(function (b) { if (b) b.style.minHeight = ''; });
      if (!pinned) { way.style.removeProperty('--way-h'); if (track) track.style.transform = ''; return; }
      if (!track) return;
      TW = track.scrollWidth;
      way.style.setProperty('--way-h', (TW - vw + vh) + 'px');
      // Alle Textblöcke gleich hoch, damit alle Ziffern auf einer Höhe sitzen wie die Linie
      var maxH = 0;
      bodies.forEach(function (b) { if (b) maxH = Math.max(maxH, b.offsetHeight); });
      bodies.forEach(function (b) { if (b) b.style.minHeight = maxH + 'px'; });
      X0 = steps[0] ? steps[0].offsetLeft : 0;
      var Y = heads[0] ? heads[0].getBoundingClientRect().bottom - track.getBoundingClientRect().top : track.offsetHeight / 2;
      track.style.setProperty('--way-y', Y.toFixed(1) + 'px');
      var H = track.offsetHeight;
      if (svg) svg.setAttribute('viewBox', '0 0 ' + TW + ' ' + H);
      if (line) line.setAttribute('d', 'M' + X0 + ' ' + Y.toFixed(1) + ' L' + TW + ' ' + Y.toFixed(1));
      if (grad) { grad.setAttribute('x1', X0); grad.setAttribute('x2', X0 + vw * 0.3); }
      setLines(x);
    }
    measure(); resizers.push(measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if (calm) { steps.forEach(function (s) { s.classList.add('is-passed'); }); return; }   // ruhige Fassung: alles steht, kein Ticker

    tickers.push(function () {
      var mob = mqSmall.matches;
      var r = way.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      // Ein Schritt wird aktiv, sobald sein Panel die Bildschirmmitte passiert (mobil: bei 82 % der Höhe). Der zuletzt passierte ist der aktive.
      var ref = mob ? vh * 0.82 : vw * 0.5, last = -1;
      steps.forEach(function (s, i) { var b = s.getBoundingClientRect(); if ((mob ? b.top : b.left) <= ref) last = i; });
      if (r.bottom <= vh + 1) last = steps.length - 1;   // Abschnittsende erreicht: der letzte Schritt ist aktiv
      steps.forEach(function (s, i) {
        var passed = i <= last;
        s.classList.toggle('is-passed', passed);
        s.classList.toggle('is-on', i === last);
        s.classList.toggle('is-read', !mob && passed && i !== last);   // gelesen: gedämpft (nur am Desktop)
      });
      if (pinned && track) {
        var p = clamp(-r.top / (r.height - vh), 0, 1), tx = p * (TW - vw);
        x = lerp(x, tx, .18); if (Math.abs(x - tx) < .1) x = tx;
        track.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,0,0)';
        setLines(x);
      } else if (vline && wrap) {
        var sr = wrap.getBoundingClientRect();
        var q = clamp((vh * 0.5 - sr.top) / Math.max(1, sr.height), 0, 1);
        vline.style.transform = 'scaleY(' + q.toFixed(4) + ')';
      }
    });
  })();

  // 5.5 App-Bilder: leichte Parallaxe (nur breit, nur mit Bewegung).
  (function () {
    var items = $$('[data-par]').map(function (n) { return { el: n, k: parseFloat(n.getAttribute('data-par')), mid: 0 }; });
    if (!items.length || calm) return;
    function measure() { items.forEach(function (it) { it.el.style.transform = ''; var r = it.el.getBoundingClientRect(); it.mid = r.top + window.scrollY + r.height / 2; }); }
    measure(); resizers.push(measure); window.addEventListener('load', measure);
    tickers.push(function () {
      if (mqSmall.matches) return;
      items.forEach(function (it) {
        var d = it.mid - scrollY - vh / 2;
        if (Math.abs(d) > vh * 1.3) return;
        it.el.style.transform = 'translate3d(0,' + (d * it.k).toFixed(1) + 'px,0)';
      });
    });
  })();

  // Einblenden per Beobachter: Durchstreichen, Zitatzeilen.
  (function () {
    var targets = $$('[data-strike], [data-reveal-lines]');
    if (!('IntersectionObserver' in window)) { targets.forEach(function (t) { t.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e, i) { if (e.isIntersecting) { var t = e.target; setTimeout(function () { t.classList.add('is-in'); }, i * 110); io.unobserve(t); } });
    }, { rootMargin: '0px 0px -18% 0px', threshold: 0.2 });
    targets.forEach(function (t) { io.observe(t); });
  })();

  // Schluss: Buchstaben werden fett, wo die Maus ist. Ohne Maus läuft eine langsame Welle durch.
  (function () {
    var end = $('[data-end]'); if (!end || !flexChars.length || calm || !fine) return;
    var mx = -9999, my = -9999, over = false, t = 0;
    function measure() { var b = end.getBoundingClientRect(); flexChars.forEach(function (c) { var r = c.el.getBoundingClientRect(); c.x = r.left - b.left + r.width / 2; c.y = r.top - b.top + r.height / 2; }); }
    measure(); resizers.push(measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    end.addEventListener('pointermove', function (e) { var b = end.getBoundingClientRect(); mx = e.clientX - b.left; my = e.clientY - b.top; over = true; }, { passive: true });
    end.addEventListener('pointerleave', function () { over = false; });
    tickers.push(function () {
      var r = end.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      t += 0.02;
      var R = vw * 0.26;
      flexChars.forEach(function (c, i) {
        var target;
        if (over) { var d = Math.hypot(c.x - mx, c.y - my); var f = clamp(1 - d / R, 0, 1); target = 240 + 660 * f * f * (3 - 2 * f); }
        else target = 520 + Math.sin(t - i * 0.42) * 300;
        c.w = lerp(c.w, target, .12);
        var w = Math.round(c.w / 10) * 10;
        if (w !== c.shown) { c.el.style.setProperty('--wg', w); c.shown = w; }   // Schriftgewicht: bewusst kein transform, nur ~20 Zeichen
      });
    });
  })();

  // Kopfzeile: bekommt Grund nach dem ersten Stück, verschwindet beim Runterscrollen.
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

  // ---------- 7 Lichtreflex (nur mit Maus) ----------
  (function () {
    if (!fine || calm) return;
    // Lichtreflex auf den App-Fenstern: die Maus ist die Lichtquelle.
    $$('.win').forEach(function (w) {
      var g = $('.win__glare', w); if (!g) return;
      w.addEventListener('pointermove', function (e) { var r = w.getBoundingClientRect(); g.style.transform = 'translate3d(' + (e.clientX - r.left).toFixed(0) + 'px,' + (e.clientY - r.top).toFixed(0) + 'px,0)'; w.classList.add('is-lit'); }, { passive: true });
      w.addEventListener('pointerleave', function () { w.classList.remove('is-lit'); });
    });
  })();

  // ---------- 8 Start: eine Schleife für alles ----------
  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { vw = window.innerWidth; vh = window.innerHeight; resizers.forEach(function (f) { f(); }); if (lenis) lenis.resize(); }, 140);
  });
  function loop(time) {
    if (lenis) lenis.raf(time);
    scrollY = window.scrollY; velocity = scrollY - lastY; lastY = scrollY;
    for (var i = 0; i < tickers.length; i++) tickers[i]();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
