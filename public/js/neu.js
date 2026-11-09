/* ==========================================================================
   Xyntal · Startseite (Entwurf „index-neu“)
   Reines JavaScript. Einzige Bibliothek: Lenis für weiches Scrollen (js/vendor).
   Alle Scroll-Szenen hängen an EINER Schleife (requestAnimationFrame) und
   schreiben nur transform/opacity (Ausnahmen sind im Code benannt).

   Inhalt:  1 Helfer · 2 Text zerlegen · 3 Intro · 4 Scrollen · 5 Szenen
            6 Rechenbeispiel · 7 Magnet, Lichtreflex · 8 Start
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
    var words = line.textContent.split(' '), i = 0;
    line.textContent = '';
    line.setAttribute('aria-hidden', 'true');           // der ganze Satz steht im aria-label der h1
    words.forEach(function (word, wi) {
      var w = el('span', 'wd');
      word.split('').forEach(function (c) { var s = el('span', 'ch', c); s.style.setProperty('--i', i++); w.appendChild(s); });
      line.appendChild(w);
      if (wi < words.length - 1) { line.appendChild(document.createTextNode(' ')); i++; }
    });
  });

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

  // ---------- 3 Intro ----------
  function go() { root.classList.add('go'); if (window.XyHero) window.XyHero.start(); }
  (function () {
    var intro = $('[data-intro]');
    if (!intro || !root.classList.contains('intro-on')) { if (intro) intro.remove(); requestAnimationFrame(go); return; }
    var done = false, timer = setTimeout(out, 1050);
    function out() {
      if (done) return; done = true; clearTimeout(timer);
      try { sessionStorage.setItem('xy-intro', '1'); } catch (e) {}
      intro.style.display = 'grid';
      root.classList.remove('intro-on');
      intro.classList.add('is-out');
      go();
      setTimeout(function () { intro.remove(); }, 700);
      window.removeEventListener('keydown', out); window.removeEventListener('pointerdown', out);
    }
    window.addEventListener('keydown', out); window.addEventListener('pointerdown', out);
  })();

  // ---------- 4 Scrollen ----------
  // Lenis nur mit Maus/Trackpad. Auf Touch bleibt das Scrollen des Systems, das fühlt sich dort besser an.
  var lenis = null;
  if (!calm && fine && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.115, wheelMultiplier: 1, smoothWheel: true });
  }

  // ---------- 5 Szenen ----------

  // 5.0 Einstieg: Punkte lösen sich beim Wegscrollen, Überschrift bleibt etwas zurück.
  (function () {
    var hero = $('[data-hero]'), h1 = $('.hero__h'); if (!hero) return;
    var hint = $('[data-hero-hint]'); if (hint && !fine) hint.textContent = 'Tipp ins Logo';
    tickers.push(function () {
      var p = clamp(scrollY / (hero.offsetHeight || vh), 0, 1);
      if (window.XyHero) window.XyHero.spread(calm ? 0 : p * 1.1);
      if (!calm && p < 1) h1.style.transform = 'translate3d(0,' + (p * -70).toFixed(1) + 'px,0)';
    });
  })();

  // Laufband: läuft immer leicht, schneller mit dem Scrolltempo, in Scrollrichtung.
  (function () {
    var track = $('[data-band-track]'); if (!track) return;
    track.innerHTML += track.innerHTML;                     // einmal verdoppeln für die Endlosschleife
    var half = 0, x = 0, dir = -1;
    function measure() { half = track.scrollWidth / 2; }
    measure(); resizers.push(measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if (calm) return;
    tickers.push(function () {
      if (velocity > 0.5) dir = -1; else if (velocity < -0.5) dir = 1;
      x += dir * (0.45 + Math.min(Math.abs(velocity), 60) * 0.22);
      if (x <= -half) x += half; if (x > 0) x -= half;
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

  // 5.2 Matching: Abschnitt bleibt stehen. Vier Schritte, die Kamera fährt über die echte App.
  (function () {
    var pin = $('[data-pin]'); if (!pin || calm) return;
    var steps = $$('[data-step]', pin), shots = $$('[data-shot]', pin), win = $('[data-win]', pin), cam = $('[data-cam]', pin);
    var focus = $('[data-focus]', pin), focusLabel = $('[data-focus-label]', pin), now = $('[data-pin-now]', pin), bar = $('[data-pin-bar]', pin);
    // Kamera je Schritt: Mittelpunkt (Anteil am Bild), Zoom, welches Bild, optionaler Rahmen (x, y, b, h als Anteil)
    // Die Koordinaten gehören zu den Screens aus App-Version 0.2.19. Neue Screens: Werte hier nachziehen.
    var RATIO = [1800 / 2880, 2800 / 2880];   // Höhe/Breite je Bild (Entdecken, Profil)
    var CAMS = {
      wide: [
        { shot: 0, cx: .50, cy: .50, s: 1.00 },
        { shot: 0, cx: .29, cy: .69, s: 2.25, f: [.175, .650, .185, .042], label: '89 % Passung' },
        { shot: 1, cx: .575, cy: .56, s: 1.22, f: [.196, .460, .754, .215], label: 'Der Grund' },
        { shot: 1, cx: .575, cy: .765, s: 1.22, f: [.196, .686, .754, .126], label: 'Jeder Bereich einzeln' }
      ],
      small: [
        { shot: 0, cx: .33, cy: .33, s: 2.5 },
        { shot: 0, cx: .27, cy: .70, s: 3.3, f: [.175, .650, .185, .042], label: '89 % Passung' },
        { shot: 1, cx: .41, cy: .53, s: 2.5, f: [.196, .460, .754, .215], label: 'Der Grund' },
        { shot: 1, cx: .385, cy: .755, s: 2.5, f: [.196, .686, .754, .126], label: 'Jeder Bereich einzeln' }
      ]
    };
    var W = 1, H = 1, cur = null, step = -1, tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    function measure() { W = win.clientWidth; H = win.clientHeight; cur = null; }
    measure(); resizers.push(measure);

    function target(i, local) {
      var c = (mqSmall.matches ? CAMS.small : CAMS.wide)[i];
      var IH = W * RATIO[c.shot];
      var s = Math.max(c.s * (1 + local * 0.035), H / IH);                 // kleine Fahrt innerhalb des Schritts
      return { ih: IH, s: s, x: clamp(W / 2 - c.cx * W * s, W - W * s, 0), y: clamp(H / 2 - c.cy * IH * s, H - IH * s, 0), c: c };
    }
    if (fine) pin.addEventListener('pointermove', function (e) { tilt.tx = e.clientX / vw - .5; tilt.ty = e.clientY / vh - .5; }, { passive: true });

    tickers.push(function () {
      var r = pin.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var p = clamp(-r.top / (r.height - vh), 0, 1), f = Math.min(3.999, p * 4), i = Math.floor(f), local = f - i;
      if (i !== step) {
        step = i;
        steps.forEach(function (s, k) { s.classList.toggle('is-on', k === i); s.classList.toggle('is-past', k < i); });
        var c = (mqSmall.matches ? CAMS.small : CAMS.wide)[i];
        shots.forEach(function (s, k) { s.classList.toggle('is-on', k === c.shot); });
        now.textContent = '0' + (i + 1);
        focus.classList.toggle('is-on', !!c.f);
        if (c.label) focusLabel.textContent = c.label;
      }
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      var t = target(i, local);
      if (!cur) cur = { s: t.s, x: t.x, y: t.y };
      cur.s = lerp(cur.s, t.s, .085); cur.x = lerp(cur.x, t.x, .085); cur.y = lerp(cur.y, t.y, .085);
      cam.style.transform = 'translate3d(' + cur.x.toFixed(2) + 'px,' + cur.y.toFixed(2) + 'px,0) scale(' + cur.s.toFixed(4) + ')';
      if (t.c.f) {   // Rahmen folgt dem Bild (Breite/Höhe ändern das Layout nur dieses einen Elements)
        var fx = cur.x + t.c.f[0] * W * cur.s, fy = cur.y + t.c.f[1] * t.ih * cur.s;
        focus.style.transform = 'translate3d(' + fx.toFixed(1) + 'px,' + fy.toFixed(1) + 'px,0)';
        focus.style.width = (t.c.f[2] * W * cur.s).toFixed(1) + 'px'; focus.style.height = (t.c.f[3] * t.ih * cur.s).toFixed(1) + 'px';
      }
      if (fine && !mqSmall.matches) {   // Fenster neigt sich leicht zur Maus
        tilt.x = lerp(tilt.x, tilt.tx, .06); tilt.y = lerp(tilt.y, tilt.ty, .06);
        win.style.transform = 'rotateY(' + (-7 + tilt.x * 5).toFixed(2) + 'deg) rotateX(' + (2 - tilt.y * 4).toFixed(2) + 'deg)';
      }
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

  // 5.4 Der Weg: senkrechtes Scrollen wird zur Fahrt nach rechts. Die zwei Linien zeichnen sich mit.
  (function () {
    var way = $('[data-way]'); if (!way) return;
    var track = $('[data-way-track]', way), scroller = $('[data-way-scroller]', way), lines = $$('[data-way-line]', way);
    var TW = 0, x = 0, pinned = false;
    function setLines(px) {    // px = wie weit die Fahrt ist; die Linien laufen dem Bild etwas voraus
      var d = 1 - clamp((px + vw * 0.72) / TW, 0, 1);
      lines.forEach(function (l, k) { l.style.strokeDashoffset = clamp(d + k * 0.012, 0, 1).toFixed(4); });   // dashoffset: einzige Ausnahme von transform/opacity
    }
    function measure() {
      TW = track.scrollWidth; pinned = !mqSmall.matches && !calm;
      if (pinned) way.style.setProperty('--way-h', (TW - vw + vh) + 'px'); else { way.style.removeProperty('--way-h'); track.style.transform = ''; }
      if (!calm) setLines(pinned ? 0 : scroller.scrollLeft);
    }
    measure(); resizers.push(measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if (calm) return;
    scroller.addEventListener('scroll', function () { if (!pinned) setLines(scroller.scrollLeft); }, { passive: true });
    tickers.push(function () {
      if (!pinned) return;
      var r = way.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      var p = clamp(-r.top / (r.height - vh), 0, 1), tx = p * (TW - vw);
      x = lerp(x, tx, .14); if (Math.abs(x - tx) < .1) x = tx;
      track.style.transform = 'translate3d(' + (-x).toFixed(2) + 'px,0,0)';
      setLines(x);
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

  // ---------- 6 Rechenbeispiel ----------
  // Gewichte wie in server/src/matching/scoring.ts (DIMENSION_WEIGHTS) und auf /matching.
  // Vereinfacht: gewichteter Schnitt der Bereiche plus/minus feste Punkte. Risiko und Aussagekraft fehlen.
  (function () {
    var box = $('[data-dims]'); if (!box) return;
    var DIMS = [
      ['vision', 'Vision', 80], ['skills', 'Ergänzende Fähigkeiten', 72], ['execution', 'Umsetzung', 60], ['intent', 'Absicht', 85],
      ['trust', 'Vertrauen', 65], ['comm', 'Kommunikation', 70], ['avail', 'Verfügbarkeit', 75], ['need', 'Projektbedarf', 50],
      ['person', 'Persönlichkeit', 60], ['long', 'Langfristiges Potenzial', 70]
    ];
    var WEIGHTS = {
      allgemein:    { vision: 15, skills: 15, execution: 15, intent: 10, trust: 10, comm: 10, avail: 8,  need: 7, person: 5, long: 5 },
      mitgruendung: { vision: 20, skills: 15, execution: 14, intent: 12, trust: 10, comm: 6,  avail: 5,  need: 0, person: 8, long: 10 },
      mentoring:    { vision: 10, skills: 20, execution: 8,  intent: 12, trust: 15, comm: 15, avail: 10, need: 0, person: 5, long: 5 },
      umsetzung:    { vision: 8,  skills: 15, execution: 25, intent: 10, trust: 10, comm: 10, avail: 12, need: 0, person: 5, long: 5 }
    };
    var rows = {}, type = 'allgemein', shown = 0, goal = 0;
    var scoreEl = $('[data-score]'), dot = $('[data-score-dot]'), say = $('[data-score-say]'), scoreBox = $('.score');

    DIMS.forEach(function (d, i) {
      var row = el('div', 'dim'), name = el('span', 'dim__name', d[1]), w = el('span', 'dim__w'), v = el('output', 'dim__v', d[2]);
      var id = 'dim-' + d[0];
      name.appendChild(el('i')); name.id = id + '-l';
      var input = el('input'); input.type = 'range'; input.min = 0; input.max = 100; input.step = 1; input.value = d[2]; input.id = id;
      input.setAttribute('aria-labelledby', id + '-l');
      input.style.setProperty('--p', d[2] + '%');
      input.addEventListener('input', function () { v.textContent = input.value; input.style.setProperty('--p', input.value + '%'); update(); });
      row.appendChild(name); row.appendChild(w); row.appendChild(input); row.appendChild(v);
      box.appendChild(row); rows[d[0]] = { row: row, w: w, input: input, name: name };
    });

    function update() {
      var W = WEIGHTS[type], sum = 0, total = 0;
      DIMS.forEach(function (d) {
        var r = rows[d[0]], w = W[d[0]];
        r.w.textContent = w ? w + ' %' : '–';
        r.name.style.setProperty('--w', (w / 25).toFixed(3));
        r.row.classList.toggle('is-off', !w); r.input.disabled = !w;
        sum += w * Number(r.input.value); total += w;
      });
      var mod = 0; $$('.mods input:checked').forEach(function (c) { mod += Number(c.value); });
      goal = clamp(Math.round(sum / total + mod), 0, 100);
      dot.style.setProperty('--x', goal + '%');
      scoreBox.classList.toggle('is-low', goal < 65);
      say.innerHTML = goal >= 85 ? '<b>Sehr hohe Passung.</b> So jemand steht bei dir weit oben.'
        : goal >= 65 ? '<b>Wird dir vorgeschlagen.</b> Vorschläge gibt es ab 65 Punkten.'
        : '<b>Unter 65.</b> Taucht in deinen Vorschlägen in der Regel nicht auf.';
      if (calm) { shown = goal; scoreEl.textContent = goal; }
    }
    $$('input[name=mt]').forEach(function (r) { r.addEventListener('change', function () { type = r.value; update(); }); });
    $$('.mods input').forEach(function (c) { c.addEventListener('change', update); });
    update();
    // Die Zahl zählt weich zum neuen Wert.
    tickers.push(function () {
      if (Math.round(shown) === goal) return;
      shown = lerp(shown, goal, .16); if (Math.abs(shown - goal) < .6) shown = goal;
      scoreEl.textContent = Math.round(shown);
    });
  })();

  // ---------- 7 Magnet, Lichtreflex (nur mit Maus) ----------
  (function () {
    if (!fine || calm) return;
    // Magnet: der Knopf kommt der Maus ein Stück entgegen.
    $$('[data-magnet]').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.transition = 'transform .15s linear, background .3s';
        b.style.transform = 'translate3d(' + ((e.clientX - r.left - r.width / 2) * .28).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * .38).toFixed(1) + 'px,0)';
      });
      b.addEventListener('pointerleave', function () { b.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1), background .3s'; b.style.transform = ''; });
    });

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
