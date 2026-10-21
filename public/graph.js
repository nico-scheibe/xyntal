// Xyntal – abstraktes Netz im Hero.
// Punkte und Linien sind nur eine Grafik, keine Personen und keine Matches.
// Ohne Abhängigkeiten, ein Canvas, pausiert außerhalb des Sichtfelds.
(() => {
  const canvas = document.getElementById("graph");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CATS = [0, 1, 2, 3, 4, 5];

  let W = 0, H = 0, dpr = 1, nodes = [], raf = 0, visible = true, t0 = performance.now();
  const mouse = { x: -1e4, y: -1e4, active: false, sx: -1e4, sy: -1e4 };

  // Deterministischer Zufall, damit das Netz bei jedem Laden gleich „gewachsen“ aussieht
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function build() {
    seed = 7;
    const count = Math.max(28, Math.min(96, Math.round((W * H) / 15000)));
    nodes = Array.from({ length: count }, (_, i) => {
      const cats = CATS.map(() => (rnd() < 0.34 ? 1 : 0));
      const n = {
        x: rnd() * W,
        y: rnd() * H,
        vx: (rnd() - 0.5) * 0.22,
        vy: (rnd() - 0.5) * 0.22,
        r: 1.2 + rnd() * 1.6,
        cats,
        phase: rnd() * Math.PI * 2,
        hot: 0, // 0..1, weich animierte Hervorhebung
      };
      return n;
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    if (still) draw(performance.now());
  }

  const LINK = 120;       // Abstand für Verbindungen untereinander
  const REACH = 210;      // Reichweite des Mauszeigers
  const grid = new Map(); // räumliches Raster → O(n) statt O(n²) bei vielen Punkten

  function draw(now) {
    const dt = Math.min(48, now - t0);
    t0 = now;
    ctx.clearRect(0, 0, W, H);

    // Maus weich nachziehen
    mouse.sx += (mouse.x - mouse.sx) * 0.18;
    mouse.sy += (mouse.y - mouse.sy) * 0.18;

    // Bewegen
    if (!still) {
      for (const n of nodes) {
        n.x += n.vx * dt * 0.06;
        n.y += n.vy * dt * 0.06;
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
        if (mouse.active) {
          const dx = mouse.sx - n.x, dy = mouse.sy - n.y, d2 = dx * dx + dy * dy;
          if (d2 < REACH * REACH) { n.x += dx * 0.0004 * dt; n.y += dy * 0.0004 * dt; }
        }
      }
    }

    // Raster füllen
    grid.clear();
    for (const n of nodes) {
      const k = ((n.x / LINK) | 0) + "," + ((n.y / LINK) | 0);
      (grid.get(k) || grid.set(k, []).get(k)).push(n);
    }

    // Verbindungen zwischen benachbarten Punkten derselben Gruppe
    ctx.lineWidth = 1;
    for (const n of nodes) {
      const gx = (n.x / LINK) | 0, gy = (n.y / LINK) | 0;
      for (let ox = 0; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        if (ox === 0 && oy < 0) continue;
        const cell = grid.get((gx + ox) + "," + (gy + oy));
        if (!cell) continue;
        for (const m of cell) {
          if (m === n || (ox === 0 && oy === 0 && m.x < n.x)) continue;
          const dx = m.x - n.x, dy = m.y - n.y, d = Math.hypot(dx, dy);
          if (d > LINK) continue;
          let shared = false;
          for (let i = 0; i < CATS.length; i++) if (n.cats[i] && m.cats[i]) { shared = true; break; }
          if (!shared) continue;
          const a = (1 - d / LINK) * 0.22 + (n.hot + m.hot) * 0.12;
          ctx.strokeStyle = `rgba(164,168,180,${a.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(n.x, n.y); ctx.lineTo(m.x, m.y); ctx.stroke();
        }
      }
    }

    const near = [];
    if (mouse.active) {
      for (const n of nodes) {
        const d = Math.hypot(n.x - mouse.sx, n.y - mouse.sy);
        if (d < REACH) near.push({ n, d });
      }
      near.sort((a, b) => a.d - b.d);
    }
    const top = new Set(near.slice(0, 3).map((o) => o.n));
    const inReach = new Set(near.map((o) => o.n));

    // Linien vom Mauszeiger zu nahen Punkten
    for (const { n, d } of near) {
      const isTop = top.has(n);
      const a = (1 - d / REACH) * (isTop ? 0.9 : 0.28);
      const g = ctx.createLinearGradient(mouse.sx, mouse.sy, n.x, n.y);
      g.addColorStop(0, `rgba(198,255,61,${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(243,240,231,${(a * 0.45).toFixed(3)})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = isTop ? 1.4 : 1;
      if (isTop) ctx.setLineDash([]); else ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(mouse.sx, mouse.sy); ctx.lineTo(n.x, n.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    // Punkte
    for (const n of nodes) {
      const target = top.has(n) ? 1 : inReach.has(n) ? 0.45 : 0;
      n.hot += (target - n.hot) * (still ? 1 : 0.12);
      const pulse = still ? 0 : Math.sin(now / 900 + n.phase) * 0.3;
      const r = n.r + pulse + n.hot * 2.2;
      ctx.fillStyle = n.hot > 0.05
        ? `rgba(198,255,61,${(0.45 + n.hot * 0.5).toFixed(3)})`
        : "rgba(243,240,231,0.45)";
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
    }

    if (!still && visible) raf = requestAnimationFrame(draw);
  }

  // Maus relativ zum Canvas; auf Touch-Geräten wandert der Zeiger langsam selbst
  const host = canvas.parentElement;
  host.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
    if (!mouse.active) { mouse.sx = mouse.x; mouse.sy = mouse.y; }
    mouse.active = true;
    if (still) draw(performance.now());
  });
  host.addEventListener("pointerleave", () => { mouse.active = false; mouse.x = mouse.y = -1e4; });

  if (matchMedia("(hover: none)").matches && !still) {
    let a = 0;
    setInterval(() => {
      a += 0.012;
      mouse.x = W * (0.62 + Math.cos(a) * 0.22);
      mouse.y = H * (0.5 + Math.sin(a * 1.3) * 0.28);
      if (!mouse.active) { mouse.sx = mouse.x; mouse.sy = mouse.y; }
      mouse.active = true;
    }, 16);
  }

  // Nur rechnen, wenn sichtbar
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting && !document.hidden;
    cancelAnimationFrame(raf);
    if (visible && !still) { t0 = performance.now(); raf = requestAnimationFrame(draw); }
  }).observe(canvas);
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    cancelAnimationFrame(raf);
    if (visible && !still) { t0 = performance.now(); raf = requestAnimationFrame(draw); }
  });

  new ResizeObserver(resize).observe(canvas);
  resize();
  if (!still) raf = requestAnimationFrame(draw);
})();
