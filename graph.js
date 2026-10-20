// Xyntal – Matching-Netzwerk im Hero.
// Jeder Punkt ist eine Person mit Kategorien. Der Mauszeiger ist „du“:
// Personen in der Nähe verbinden sich mit dir, die besten drei zeigen ihren Match-Score.
// Ohne Abhängigkeiten, ein Canvas, pausiert außerhalb des Sichtfelds.
(() => {
  const canvas = document.getElementById("graph");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CATS = ["Design", "Entwicklung", "Marketing", "KI", "Vertrieb", "Finanzen"];
  const NAMES = ["Lena", "Jonas", "Max", "Elif", "Aylin", "Mia", "Tim", "Sophie", "David", "Noah", "Clara", "Ben", "Hanna", "Luis", "Emma", "Paul"];
  const ME = [1, 0, 1, 1, 0, 0]; // Interessen von „dir“ – Entwicklung, KI, Marketing … (Index wie CATS)

  let W = 0, H = 0, dpr = 1, nodes = [], raf = 0, visible = true, t0 = performance.now();
  const mouse = { x: -1e4, y: -1e4, active: false, sx: -1e4, sy: -1e4 };

  // Deterministischer Zufall, damit das Netz bei jedem Laden gleich „gewachsen“ aussieht
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  function score(n) {
    // Überschneidung der Kategorien + persönlicher Bonus → 62–98 %
    let overlap = 0;
    for (let i = 0; i < CATS.length; i++) overlap += n.cats[i] && ME[i] ? 1 : 0;
    return Math.min(98, Math.round(62 + overlap * 11 + n.bonus));
  }

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
        bonus: rnd() * 9,
        name: NAMES[i % NAMES.length],
        phase: rnd() * Math.PI * 2,
        hot: 0, // 0..1, weich animierte Hervorhebung
      };
      n.score = score(n);
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
        // Leichte Anziehung zur Maus für passende Personen
        if (mouse.active) {
          const dx = mouse.sx - n.x, dy = mouse.sy - n.y, d2 = dx * dx + dy * dy;
          if (d2 < REACH * REACH && n.score > 80) { n.x += dx * 0.0009 * dt; n.y += dy * 0.0009 * dt; }
        }
      }
    }

    // Raster füllen
    grid.clear();
    for (const n of nodes) {
      const k = ((n.x / LINK) | 0) + "," + ((n.y / LINK) | 0);
      (grid.get(k) || grid.set(k, []).get(k)).push(n);
    }

    // Verbindungen zwischen Personen mit gemeinsamer Kategorie
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

    // Personen in Reichweite der Maus, sortiert nach Match-Score
    const near = [];
    if (mouse.active) {
      for (const n of nodes) {
        const d = Math.hypot(n.x - mouse.sx, n.y - mouse.sy);
        if (d < REACH) near.push({ n, d });
      }
      near.sort((a, b) => b.n.score - a.n.score);
    }
    const top = new Set(near.slice(0, 3).map((o) => o.n));
    const inReach = new Set(near.map((o) => o.n));

    // Linien von „dir“ zu den Personen in Reichweite
    for (const { n, d } of near) {
      const isTop = top.has(n);
      const a = (1 - d / REACH) * (isTop ? 0.9 : 0.28);
      const g = ctx.createLinearGradient(mouse.sx, mouse.sy, n.x, n.y);
      g.addColorStop(0, `rgba(123,132,255,${a.toFixed(3)})`);
      g.addColorStop(1, `rgba(166,139,255,${(a * 0.6).toFixed(3)})`);
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
        ? `rgba(123,132,255,${(0.55 + n.hot * 0.45).toFixed(3)})`
        : "rgba(140,145,160,0.7)";
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
      if (n.hot > 0.6) {
        ctx.strokeStyle = `rgba(123,132,255,${((n.hot - 0.6) * 0.8).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, r + 5, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // Labels für die Top 3: „Lena · 94 %“
    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = "middle";
    for (const n of top) {
      if (n.hot < 0.4) continue;
      const label = `${n.name} · ${n.score} %`;
      const w = ctx.measureText(label).width + 14;
      const lx = Math.min(W - w - 4, n.x + 10), ly = n.y - 14;
      ctx.globalAlpha = Math.min(1, (n.hot - 0.4) * 2.5);
      ctx.fillStyle = "rgba(19,20,25,0.92)";
      ctx.strokeStyle = "rgba(123,132,255,0.45)";
      roundRect(lx, ly - 10, w, 20, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ECEDF1";
      ctx.fillText(label, lx + 7, ly);
      ctx.globalAlpha = 1;
    }

    // „du“
    if (mouse.active) {
      ctx.fillStyle = "#ECEDF1";
      ctx.beginPath(); ctx.arc(mouse.sx, mouse.sy, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(123,132,255,0.35)";
      ctx.beginPath(); ctx.arc(mouse.sx, mouse.sy, REACH, 0, Math.PI * 2); ctx.stroke();
    }

    if (!still && visible) raf = requestAnimationFrame(draw);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Maus relativ zum Canvas; auf Touch-Geräten wandert „du“ langsam selbst
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
