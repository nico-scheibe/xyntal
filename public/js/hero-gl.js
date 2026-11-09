/* ==========================================================================
   Xyntal · Einstieg: das Logo aus Lichtpunkten

   Jeder Punkt hat einen festen Platz auf einer der zwei Logo-Linien.
   Am Anfang liegen alle verstreut und finden zusammen. Die Maus (oder der
   Finger) schiebt sie auseinander, danach suchen sie ihren Platz wieder.

   Die Physik läuft auf der CPU (ein paar tausend Punkte, je eine Feder).
   Gezeichnet wird mit WebGL (ein Draw-Call, GL_POINTS). Gibt es kein WebGL
   (abgeschaltet, Treiber gesperrt, Kontext verloren), zeichnet dieselbe
   Animation auf einem normalen 2D-Canvas mit weniger Punkten. Erst wenn auch
   das nicht geht, bleibt das Logo als SVG stehen (Klasse „no-gl“).
   Schnittstelle: window.XyHero = { start(), spread(0..1), ok, mode }
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.querySelector('[data-hero-gl]');
  var hero = document.querySelector('[data-hero]');
  var api = (window.XyHero = { ok: false, mode: 'none', start: function () {}, spread: function () {}, settle: function () {} });
  if (!canvas || !hero) return;

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia('(max-width: 760px)').matches;

  // ---------- Zeichner 1: WebGL ----------
  var VS = [
    'attribute vec3 aPos;',      // x, y in CSS-Pixeln, z = Energie (0..1)
    'attribute vec3 aCol;',
    'attribute vec2 aMeta;',     // Größe, Zufallswert
    'uniform vec2 uRes; uniform vec2 uCenter; uniform float uDpr; uniform float uSpread; uniform float uFade;',
    'varying vec3 vCol; varying float vA;',
    'void main(){',
    '  vec2 p = aPos.xy;',
    '  p = uCenter + (p - uCenter) * (1.0 + uSpread * (0.25 + aMeta.y * 2.2));',
    '  vec2 c = p / uRes * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);',
    '  float e = aPos.z;',
    '  gl_PointSize = aMeta.x * uDpr * (1.0 + e * 1.6);',
    '  vCol = mix(aCol, vec3(1.0), e * 0.65);',
    '  vA = uFade * (0.5 + 0.6 * aMeta.y) * (1.0 + e) * (1.0 - uSpread * 0.85);',
    '}'
  ].join('\n');
  var FS = [
    'precision mediump float;',
    'varying vec3 vCol; varying float vA;',
    'void main(){',
    '  float d = length(gl_PointCoord - 0.5);',
    '  float a = smoothstep(0.5, 0.12, d) * vA;',
    '  gl_FragColor = vec4(vCol * a, a);',
    '}'
  ].join('\n');

  var gl = null, loc = null, bPos = null, ctx = null;
  function initGL() {
    try {
      var g = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: true }) ||
              canvas.getContext('experimental-webgl', { alpha: true, antialias: false, premultipliedAlpha: true });
      if (!g) return false;
      var sh = function (type, src) { var s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s); return g.getShaderParameter(s, g.COMPILE_STATUS) ? s : null; };
      var vs = sh(g.VERTEX_SHADER, VS), fs = sh(g.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return false;
      var prog = g.createProgram();
      g.attachShader(prog, vs); g.attachShader(prog, fs); g.linkProgram(prog);
      if (!g.getProgramParameter(prog, g.LINK_STATUS)) return false;
      g.useProgram(prog);
      loc = {
        pos: g.getAttribLocation(prog, 'aPos'), col: g.getAttribLocation(prog, 'aCol'), meta: g.getAttribLocation(prog, 'aMeta'),
        res: g.getUniformLocation(prog, 'uRes'), center: g.getUniformLocation(prog, 'uCenter'), dpr: g.getUniformLocation(prog, 'uDpr'),
        spread: g.getUniformLocation(prog, 'uSpread'), fade: g.getUniformLocation(prog, 'uFade')
      };
      g.enable(g.BLEND); g.blendFunc(g.ONE, g.ONE);   // Licht addiert sich
      g.disable(g.DEPTH_TEST);
      gl = g;
      return true;
    } catch (e) { return false; }
  }
  // ---------- Zeichner 2: 2D-Canvas (Ersatz) ----------
  // Ein Canvas, das schon einen WebGL-Kontext hatte, gibt keinen 2D-Kontext mehr her: deshalb ein neues Element.
  function init2D() {
    try {
      var fresh = canvas.cloneNode(false);
      canvas.parentNode.replaceChild(fresh, canvas);
      canvas = fresh;
      ctx = canvas.getContext('2d');
      gl = null;
      return !!ctx;
    } catch (e) { return false; }
  }

  var force2d = /[?&]hero=2d\b/.test(location.search);   // zum Prüfen des Ersatzes: /?hero=2d
  var mode = (!force2d && initGL()) ? 'gl' : (init2D() ? '2d' : 'none');
  if (mode === 'none') { document.documentElement.classList.add('no-gl'); return; }

  // ---------- Logo-Geometrie (aus assets/brand/xyntal-mark.svg, viewBox 512) ----------
  // Linie B: lila → blau (liegt oben).  Linie A: blau → cyan (hat die Lücke, wo B kreuzt).
  var CURVE_B = [[140, 372], [212, 212], [372, 140]];
  var CURVE_A = [[140, 140], [300, 212], [372, 372]];
  var PU = [0.70, 0.42, 1.0], BL = [0.23, 0.54, 1.0], CY = [0.25, 0.88, 0.94];

  function bez(c, t) {
    var u = 1 - t;
    return [u * u * c[0][0] + 2 * u * t * c[1][0] + t * t * c[2][0], u * u * c[0][1] + 2 * u * t * c[1][1] + t * t * c[2][1]];
  }
  function bezN(c, t) { // Normale
    var dx = 2 * (1 - t) * (c[1][0] - c[0][0]) + 2 * t * (c[2][0] - c[1][0]);
    var dy = 2 * (1 - t) * (c[1][1] - c[0][1]) + 2 * t * (c[2][1] - c[1][1]);
    var l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l];
  }
  var B_SAMPLES = []; for (var k = 0; k <= 80; k++) B_SAMPLES.push(bez(CURVE_B, k / 80));
  function distToB(x, y) { var m = 1e9; for (var i = 0; i < B_SAMPLES.length; i++) { var d = Math.hypot(x - B_SAMPLES[i][0], y - B_SAMPLES[i][1]); if (d < m) m = d; } return m; }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }

  // ---------- Punkte ----------
  // Der 2D-Ersatz bekommt weniger Punkte, dafür etwas größere: so bleibt er flüssig und das Logo gleich dicht.
  var N_MARK = mode === 'gl' ? (small ? 4200 : 11000) : (small ? 2600 : 5200);
  var N_DUST = small ? 90 : 220, N = N_MARK + N_DUST;
  var unit = new Float32Array(N * 2);   // Platz im Logo-Raum (-0.5..0.5) bzw. Staub im Bild (0..1)
  var home = new Float32Array(N * 2), pos = new Float32Array(N * 3), vel = new Float32Array(N * 2);
  var col = new Float32Array(N * 3), meta = new Float32Array(N * 2), phase = new Float32Array(N);
  var css = new Array(N);               // Farbe als CSS-Text, nur für den 2D-Zeichner

  (function build() {
    var i = 0;
    while (i < N_MARK) {
      var onB = Math.random() < 0.5, c = onB ? CURVE_B : CURVE_A;
      var t = Math.random();
      var p = bez(c, t), n = bezN(c, t);
      var halo = Math.random() < 0.14;                    // ein Teil streut als Lichthof
      var off = halo ? gauss() * 44 : (Math.random() + Math.random() - 1) * 31;   // Dreiecksverteilung: Kern dichter, Rand weicher
      if (!halo && (t < 0.04 || t > 0.96)) {              // Kappe: Punkt im Halbkreis verteilen
        var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 30;
        p = bez(c, t < 0.5 ? 0 : 1); p[0] += Math.cos(a) * r; p[1] += Math.sin(a) * r; off = 0;
      }
      var x = p[0] + n[0] * off, y = p[1] + n[1] * off;
      if (!onB && !halo && distToB(x, y) < 48) continue;  // Lücke in Linie A
      unit[i * 2] = (x - 256) / 312; unit[i * 2 + 1] = (y - 256) / 312;
      var cc = onB ? mix3(PU, BL, t) : mix3(BL, CY, t);
      col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
      meta[i * 2] = halo ? 1.2 + Math.random() * 1.0 : 1.3 + Math.random() * 1.9;
      meta[i * 2 + 1] = halo ? Math.random() * 0.3 : 0.3 + Math.random() * 0.7;
      phase[i] = Math.random() * 6.283;
      i++;
    }
    for (; i < N; i++) {                                    // Staub im ganzen Bild
      unit[i * 2] = Math.random(); unit[i * 2 + 1] = Math.random();
      var g = 0.4 + Math.random() * 0.2;
      col[i * 3] = g; col[i * 3 + 1] = g; col[i * 3 + 2] = g + 0.1;
      meta[i * 2] = 1 + Math.random() * 1.1; meta[i * 2 + 1] = Math.random() * 0.2;
      phase[i] = Math.random() * 6.283;
    }
    for (i = 0; i < N; i++) css[i] = 'rgb(' + Math.round(col[i * 3] * 255) + ',' + Math.round(col[i * 3 + 1] * 255) + ',' + Math.round(col[i * 3 + 2] * 255) + ')';
  })();

  function uploadGL() {
    var buf = function (data, usage, l, size) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); return b; };
    buf(col, gl.STATIC_DRAW, loc.col, 3);
    buf(meta, gl.STATIC_DRAW, loc.meta, 2);
    bPos = buf(pos, gl.DYNAMIC_DRAW, loc.pos, 3);
  }
  if (mode === 'gl') uploadGL();

  // ---------- Größe und Platz des Logos ----------
  var W = 0, H = 0, dpr = 1, cx = 0, cy = 0, size = 0, placed = false;
  function layout() {
    var r = hero.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, mode === 'gl' ? 2 : 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    small = W <= 760;
    if (small) { size = Math.min(W * 0.92, H * 0.46); cx = W * 0.56; cy = 84 + size * 0.52; }
    else { size = Math.min(H * 0.84, W * 0.5); cx = W * 0.74; cy = H * 0.47; }
    for (var i = 0; i < N; i++) {
      if (i < N_MARK) { home[i * 2] = cx + unit[i * 2] * size; home[i * 2 + 1] = cy + unit[i * 2 + 1] * size; }
      else { home[i * 2] = unit[i * 2] * W; home[i * 2 + 1] = unit[i * 2 + 1] * H; }
      if (!placed) {       // Start: verstreut (oder gleich am Platz in der ruhigen Fassung)
        if (calm) { pos[i * 3] = home[i * 2]; pos[i * 3 + 1] = home[i * 2 + 1]; }
        else {
          var a = Math.random() * 6.283, d = (0.35 + Math.random() * 0.9) * Math.max(W, H);
          pos[i * 3] = home[i * 2] + Math.cos(a) * d * (i < N_MARK ? 1 : 0.1);
          pos[i * 3 + 1] = home[i * 2 + 1] + Math.sin(a) * d * (i < N_MARK ? 1 : 0.1);
        }
      }
    }
    placed = true;
    if (mode === 'gl') {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(loc.res, W, H); gl.uniform2f(loc.center, cx, cy); gl.uniform1f(loc.dpr, dpr);
    }
  }

  // ---------- Zeiger ----------
  var ptr = { x: -9999, y: -9999, on: false, last: 0 };
  function onMove(e) {
    var r = canvas.getBoundingClientRect();
    ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true; ptr.last = performance.now();
  }
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerdown', onMove, { passive: true });
  hero.addEventListener('pointerleave', function () { ptr.on = false; });

  // ---------- Zeichnen ----------
  var running = false, started = false, visible = true, fade = 0, spread = 0, raf = 0, t0 = 0;
  function drawGL() {
    gl.uniform1f(loc.spread, spread); gl.uniform1f(loc.fade, fade);
    gl.bindBuffer(gl.ARRAY_BUFFER, bPos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.POINTS, 0, N);
  }
  function draw2D() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';              // Licht addiert sich, wie in der WebGL-Fassung
    var dim = fade * (1 - spread * 0.85);
    if (dim <= 0.004) return;
    for (var i = 0; i < N; i++) {
      var j = i * 3, m = i * 2, rnd = meta[m + 1], e = pos[j + 2];
      var k = 1 + spread * (0.25 + rnd * 2.2);
      var s = meta[m] * (1 + e * 1.6) * 0.95;
      ctx.globalAlpha = Math.min(1, dim * (0.5 + 0.6 * rnd) * (1 + e));
      ctx.fillStyle = e > 0.45 ? '#fff' : css[i];
      ctx.fillRect(cx + (pos[j] - cx) * k - s / 2, cy + (pos[j + 1] - cy) * k - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function draw() { if (mode === 'gl') drawGL(); else draw2D(); }

  function frame(now) {
    raf = 0;
    if (!running) return;
    sim(now); draw();
    raf = requestAnimationFrame(frame);
  }
  function sim(now) {
    var t = (now - t0) / 1000;
    fade += (1 - fade) * 0.04;
    // Ohne Zeiger wandert ein stiller Störer durchs Logo, damit das Bild lebt.
    var px = ptr.x, py = ptr.y, R = small ? 90 : 150, force = 7;
    if (!ptr.on || now - ptr.last > 2600) {
      px = cx + Math.cos(t * 0.45) * size * 0.34; py = cy + Math.sin(t * 0.62) * size * 0.34; R *= 0.75; force = 3;
    }
    var R2 = R * R, k = t < 2.4 ? 0.010 + t * 0.006 : 0.024;   // Feder zieht beim Zusammenfinden langsam an
    for (var i = 0; i < N; i++) {
      var j = i * 3, h = i * 2;
      var hx = home[h] + Math.cos(t * 0.7 + phase[i]) * 1.6, hy = home[h + 1] + Math.sin(t * 0.9 + phase[i]) * 1.6;
      var x = pos[j], y = pos[j + 1], vx = vel[h], vy = vel[h + 1];
      vx += (hx - x) * k; vy += (hy - y) * k;
      var dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        var d = Math.sqrt(d2) + 0.001, f = (1 - d / R); f = f * f * force;
        vx += (dx / d) * f - (dy / d) * f * 0.35; vy += (dy / d) * f + (dx / d) * f * 0.35;   // weg + leichter Wirbel
      }
      vx *= 0.86; vy *= 0.86;
      pos[j] = x + vx; pos[j + 1] = y + vy; vel[h] = vx; vel[h + 1] = vy;
      var e = Math.min(1, (Math.abs(vx) + Math.abs(vy)) * 0.11);
      pos[j + 2] += (e - pos[j + 2]) * 0.2;
    }
  }
  function play() { if (started && visible && !document.hidden && !calm && !raf) { running = true; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  layout();
  var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { layout(); if (calm) { fade = 1; draw(); } }, 120); });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; visible ? play() : stop(); }).observe(hero);
  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : play(); });

  // Geht der WebGL-Kontext verloren (Treiber, Energiesparen), läuft die Animation auf 2D weiter.
  if (mode === 'gl') canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); stop();
    if (init2D()) { mode = api.mode = '2d'; layout(); if (calm) { fade = 1; draw(); } else play(); }
    else { api.ok = false; document.documentElement.classList.add('no-gl'); }
  });

  api.ok = true; api.mode = mode;
  api.start = function () { if (started) return; started = true; t0 = performance.now(); if (calm) { fade = 1; draw(); } else play(); };
  api.spread = function (p) { spread = p; };
  // Nur zum Prüfen: rechnet n Schritte am Stück (z. B. wenn der Tab im Hintergrund gedrosselt ist).
  api.settle = function (n) { var now = performance.now(); for (var i = 0; i < (n || 200); i++) sim(now + i * 16); draw(); };
})();
