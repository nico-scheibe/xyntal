// Xyntal – Weltraum-Hintergrund für alle Seiten: Sterne mit Parallaxe, Sternschnuppen,
// ein rotierender Wireframe-Planet und sparsamer Code-Regen in Türkis.
// Rein dekorativ (aria-hidden), pausiert im Hintergrund-Tab, bei „weniger Bewegung“ nur ein Standbild.
// Auf Tempo gebaut: Sterne liegen vorgerendert auf eigenen Ebenen, gezeichnet wird mit
// höchstens 30 Bildern pro Sekunde in einfacher Auflösung, Linien gehen gebündelt raus.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia("(max-width: 719px)").matches;
  const FRAME_MS = weak ? 1000 / 24 : 1000 / 30;
  const TQ = "45, 226, 206";
  const GLYPHS = "01<>/{}[]#$&*=+;:XYNTAL0x7F";
  const BUCKETS = 4;

  const canvas = document.createElement("canvas");
  canvas.id = "cosmos";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });

  let w = 0, h = 0, layers = [], twinklers = [], drops = [], shooters = [];
  let t = 0, last = -Infinity, raf = 0, globe = null;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    // Hintergrund braucht keine Retina-Schärfe: einfache Auflösung spart bis zu 75 % Pixel
    canvas.width = w;
    canvas.height = h;

    // Feste Sterne einmal pro Ebene vorrendern, danach nur noch verschieben
    const count = Math.round((w * h) / (weak ? 6500 : 4200));
    layers = [0.04, 0.1, 0.2].map((depth) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      return { depth, c, g: c.getContext("2d") };
    });
    twinklers = [];
    for (let i = 0; i < count; i++) {
      const li = Math.random() < 0.7 ? 0 : Math.random() < 0.75 ? 1 : 2;
      const s = {
        x: Math.random() * w, y: Math.random() * h,
        r: [0.5, 0.9, 1.4][li] * (0.7 + Math.random() * 0.6),
        depth: layers[li].depth,
        tint: Math.random() < 0.18,
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
      };
      if (!still && i % 7 === 0) { twinklers.push(s); continue; }
      const g = layers[li].g;
      g.fillStyle = s.tint ? `rgba(${TQ}, 0.75)` : "rgba(214, 224, 223, 0.6)";
      g.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }

    const col = 18;
    drops = [];
    for (let x = col / 2; x < w; x += col) {
      if (Math.random() < (weak ? 0.06 : 0.1)) {
        const len = 6 + Math.floor(Math.random() * 12);
        drops.push({
          x, y: Math.random() * h, v: 1.2 + Math.random() * 2.6, len,
          chars: Array.from({ length: len }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]),
        });
      }
    }

    // Auf der Startseite hat der Hero schon einen Planeten: der Hintergrund-Planet ist dort kleiner,
    // blasser und startet unter dem Bildrand, sodass er erst beim Scrollen hochsteigt
    const home = !!document.querySelector(".hero-cosmos");
    const R = home ? Math.max(110, Math.min(w, h) * 0.22) : Math.max(140, Math.min(w, h) * 0.34);
    const halo = ctx.createRadialGradient(0, 0, R * 0.85, 0, 0, R * 1.5);
    halo.addColorStop(0, `rgba(${TQ}, 0.10)`);
    halo.addColorStop(1, `rgba(${TQ}, 0)`);
    const body = ctx.createRadialGradient(-R * 0.45, -R * 0.5, R * 0.1, 0, 0, R);
    body.addColorStop(0, "rgba(16, 40, 38, 0.95)");
    body.addColorStop(0.6, "rgba(6, 14, 14, 0.96)");
    body.addColorStop(1, "rgba(3, 6, 7, 0.98)");
    globe = { R, halo, body, cx: w * (w < 720 ? 0.1 : 0.06), baseY: home ? h + R * 1.15 : h * 1.08, alpha: home ? 0.6 : 1 };
    ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
  }

  function drawGlobe(scroll) {
    const { R, halo, body, cx } = globe;
    const cy = globe.baseY - scroll * 0.12;
    if (cy - R * 1.6 > h || cy + R * 1.6 < 0) return;
    const tilt = 0.38, ct = Math.cos(tilt), st = Math.sin(tilt);
    const spin = t * 0.00012;

    ctx.save();
    ctx.globalAlpha = globe.alpha;
    ctx.translate(cx, cy);
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();

    // Gitterlinien nach Helligkeit in wenige Pfade bündeln statt jede Strecke einzeln zu zeichnen
    const paths = Array.from({ length: BUCKETS }, () => new Path2D());
    const segment = (lat0, lon0, lat1, lon1) => {
      const z0 = Math.cos(lat0) * Math.cos(lon0) * ct + Math.sin(lat0) * st;
      const z1 = Math.cos(lat1) * Math.cos(lon1) * ct + Math.sin(lat1) * st;
      if (z0 <= 0 || z1 <= 0) return;
      const p = paths[Math.min(BUCKETS - 1, (z1 * BUCKETS) | 0)];
      p.moveTo(Math.cos(lat0) * Math.sin(lon0) * R, -(Math.sin(lat0) * ct - Math.cos(lat0) * Math.cos(lon0) * st) * R);
      p.lineTo(Math.cos(lat1) * Math.sin(lon1) * R, -(Math.sin(lat1) * ct - Math.cos(lat1) * Math.cos(lon1) * st) * R);
    };
    const MER = 14, MSTEPS = weak ? 20 : 28;
    for (let m = 0; m < MER; m++) {
      const lon = (m / MER) * Math.PI * 2 + spin;
      for (let i = 0; i < MSTEPS; i++) {
        segment(-Math.PI / 2 + (i / MSTEPS) * Math.PI, lon, -Math.PI / 2 + ((i + 1) / MSTEPS) * Math.PI, lon);
      }
    }
    const PSTEPS = weak ? 32 : 44;
    for (let k = 1; k < 9; k++) {
      const lat = -Math.PI / 2 + (k / 9) * Math.PI;
      for (let i = 0; i < PSTEPS; i++) {
        segment(lat, (i / PSTEPS) * Math.PI * 2, lat, ((i + 1) / PSTEPS) * Math.PI * 2);
      }
    }
    ctx.lineWidth = 1;
    paths.forEach((p, b) => {
      ctx.strokeStyle = `rgba(${TQ}, ${(0.08 + ((b + 0.5) / BUCKETS) * 0.2).toFixed(3)})`;
      ctx.stroke(p);
    });

    // Knotenpunkte, die wie Verbindungen aufleuchten
    for (let n = 0; n < 22; n++) {
      const lat = Math.sin(n * 12.9898) * 1.2;
      const lon = n * 2.3999 + spin;
      const z = Math.cos(lat) * Math.cos(lon) * ct + Math.sin(lat) * st;
      if (z <= 0.05) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + n);
      ctx.fillStyle = `rgba(${TQ}, ${(z * (0.35 + pulse * 0.55)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(Math.cos(lat) * Math.sin(lon) * R, -(Math.sin(lat) * ct - Math.cos(lat) * Math.cos(lon) * st) * R, 1.6 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = `rgba(${TQ}, 0.35)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, R, Math.PI * 0.9, Math.PI * 1.75); ctx.stroke();

    // Umlaufbahn mit Mond (Leuchten als zweiter Kreis statt teurem shadowBlur)
    ctx.rotate(-0.35);
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = `rgba(${TQ}, 0.18)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.55, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const a = t * 0.00035;
    const mx = Math.cos(a) * R * 1.55, my = Math.sin(a) * R * 0.42;
    if (!(Math.sin(a) < 0 && Math.abs(mx) < R)) {
      ctx.fillStyle = `rgba(${TQ}, 0.25)`;
      ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(200, 214, 212, 0.9)";
      ctx.beginPath(); ctx.arc(mx, my, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    if (!w || !h) return; // eingeklapptes Fenster: nichts zu zeichnen
    const scroll = window.scrollY || 0;
    ctx.clearRect(0, 0, w, h);

    for (const l of layers) {
      let off = (scroll * l.depth) % h;
      ctx.drawImage(l.c, 0, -off);
      ctx.drawImage(l.c, 0, h - off);
    }
    for (const s of twinklers) {
      let y = (s.y - scroll * s.depth) % h;
      if (y < 0) y += h;
      const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * 0.001 * s.speed + s.phase));
      ctx.fillStyle = s.tint ? `rgba(${TQ}, ${tw.toFixed(2)})` : `rgba(214, 224, 223, ${(tw * 0.85).toFixed(2)})`;
      ctx.fillRect(s.x - s.r, y - s.r, s.r * 2, s.r * 2);
    }

    // Code-Regen
    for (const d of drops) {
      for (let i = 0; i < d.len; i++) {
        const y = d.y - i * 15;
        if (y < -15 || y > h + 15) continue;
        ctx.fillStyle = i === 0 ? "rgba(200, 255, 248, 0.5)" : `rgba(${TQ}, ${(0.22 * (1 - i / d.len)).toFixed(2)})`;
        ctx.fillText(d.chars[i], d.x, y);
      }
      if (!still) {
        d.y += d.v;
        if (Math.random() < 0.05) d.chars[(Math.random() * d.len) | 0] = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        if (d.y - d.len * 15 > h) { d.y = -Math.random() * 200; d.v = 1.2 + Math.random() * 2.6; }
      }
    }

    drawGlobe(scroll);

    // Sternschnuppen
    if (!still && Math.random() < 0.008 && shooters.length < 2) {
      shooters.push({ x: Math.random() * w * 0.8, y: Math.random() * h * 0.4, vx: 14 + Math.random() * 10, vy: 5 + Math.random() * 4, life: 1 });
    }
    ctx.lineWidth = 1.5;
    for (const s of shooters) {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 7, s.y - s.vy * 7);
      g.addColorStop(0, `rgba(220, 255, 250, ${s.life.toFixed(2)})`);
      g.addColorStop(1, `rgba(${TQ}, 0)`);
      ctx.strokeStyle = g;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 7, s.y - s.vy * 7); ctx.stroke();
      s.x += s.vx; s.y += s.vy; s.life -= 0.03;
    }
    shooters = shooters.filter((s) => s.life > 0 && s.x < w + 200 && s.y < h + 200);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    t = now;
    draw();
  }

  // Terminal im Hero tippt sich selbst
  const term = document.querySelector("[data-term]");
  if (term) {
    const LINES = [
      ["cmd", '$ xyntal connect --idee "dein-projekt"'],
      ["", "> suche Menschen mit passenden Skills …"],
      ["ok", "> entwicklung   [ok]"],
      ["ok", "> design        [ok]"],
      ["ok", "> gründung      [ok]"],
      ["", "> verbindung hergestellt."],
    ];
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const render = (upto, chars) => {
      term.innerHTML = LINES.slice(0, upto + 1).map(([cls, txt], i) => {
        const shown = i === upto ? txt.slice(0, chars) : txt;
        return `<span class="${cls}">${esc(shown)}</span>`;
      }).join("\n") + '<span class="caret"></span>';
    };
    if (still) render(LINES.length - 1, Infinity);
    else {
      let line = 0, ch = 0;
      const tick = () => {
        render(line, ch);
        const len = LINES[line][1].length;
        if (ch < len) { ch += line === 0 ? 1 : 3; setTimeout(tick, line === 0 ? 55 : 18); }
        else if (line < LINES.length - 1) { line++; ch = 0; setTimeout(tick, 380); }
        else setTimeout(() => { line = 0; ch = 0; tick(); }, 6000);
      };
      setTimeout(tick, 700);
    }
  }

  let resizeTimer = 0;
  resize();
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); draw(); }, 150);
  });
  if (still) {
    draw();
    let queued = false;
    window.addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; draw(); });
    }, { passive: true });
  } else {
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    });
  }
})();
