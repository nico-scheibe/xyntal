// Xyntal – Weltraum-Hintergrund für alle Seiten: Sterne mit Parallaxe, Sternschnuppen,
// ein rotierender Wireframe-Planet und sparsamer Code-Regen in Türkis.
// Rein dekorativ (aria-hidden), pausiert im Hintergrund-Tab, bei „weniger Bewegung“ nur ein Standbild.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TQ = "45, 226, 206";
  const GLYPHS = "01<>/{}[]#$&*=+;:XYNTAL0x7F";

  const canvas = document.createElement("canvas");
  canvas.id = "cosmos";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");

  let w = 0, h = 0, dpr = 1, stars = [], drops = [], shooters = [], t = 0, raf = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.round((w * h) / 4200);
    stars = Array.from({ length: count }, () => {
      const layer = Math.random() < 0.7 ? 0 : Math.random() < 0.75 ? 1 : 2;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: [0.5, 0.9, 1.4][layer] * (0.7 + Math.random() * 0.6),
        depth: [0.04, 0.1, 0.2][layer],
        phase: Math.random() * Math.PI * 2,
        speed: 0.6 + Math.random() * 1.8,
        tint: Math.random() < 0.18,
      };
    });

    // Nur jede x-te Spalte regnet, damit der Text lesbar bleibt
    const col = 18;
    drops = [];
    for (let x = col / 2; x < w; x += col) {
      if (Math.random() < 0.11) {
        drops.push({ x, y: Math.random() * h, v: 0.6 + Math.random() * 1.4, len: 6 + Math.floor(Math.random() * 14), chars: [] });
      }
    }
    drops.forEach((d) => { d.chars = Array.from({ length: d.len }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]); });
  }

  function drawGlobe(scroll) {
    const R = Math.max(140, Math.min(w, h) * 0.34);
    const cx = w * (w < 720 ? 0.1 : 0.06);
    const cy = h * 1.08 - scroll * 0.12;
    if (cy - R > h || cy + R < 0) return;
    const tilt = 0.38;
    const spin = t * 0.00012;

    // Atmosphäre
    const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.5);
    glow.addColorStop(0, `rgba(${TQ}, 0.10)`);
    glow.addColorStop(1, `rgba(${TQ}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2); ctx.fill();

    // Körper mit Schattenseite
    const body = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.1, cx, cy, R);
    body.addColorStop(0, "rgba(16, 40, 38, 0.95)");
    body.addColorStop(0.6, "rgba(6, 14, 14, 0.96)");
    body.addColorStop(1, "rgba(3, 6, 7, 0.98)");
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.lineWidth = 1;

    const project = (lat, lon) => {
      const x = Math.cos(lat) * Math.sin(lon);
      const y = Math.sin(lat);
      const z = Math.cos(lat) * Math.cos(lon);
      const y2 = y * Math.cos(tilt) - z * Math.sin(tilt);
      const z2 = y * Math.sin(tilt) + z * Math.cos(tilt);
      return [cx + x * R, cy - y2 * R, z2];
    };

    // Längengrade
    for (let m = 0; m < 14; m++) {
      const lon = (m / 14) * Math.PI * 2 + spin;
      let prev = null;
      for (let i = 0; i <= 40; i++) {
        const lat = -Math.PI / 2 + (i / 40) * Math.PI;
        const p = project(lat, lon);
        if (prev && p[2] > 0 && prev[2] > 0) {
          ctx.strokeStyle = `rgba(${TQ}, ${(0.08 + p[2] * 0.22).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        }
        prev = p;
      }
    }
    // Breitengrade
    for (let k = 1; k < 9; k++) {
      const lat = -Math.PI / 2 + (k / 9) * Math.PI;
      let prev = null;
      for (let i = 0; i <= 60; i++) {
        const p = project(lat, (i / 60) * Math.PI * 2);
        if (prev && p[2] > 0 && prev[2] > 0) {
          ctx.strokeStyle = `rgba(${TQ}, ${(0.06 + p[2] * 0.16).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
        }
        prev = p;
      }
    }
    // Knotenpunkte, die wie Verbindungen aufleuchten
    for (let n = 0; n < 22; n++) {
      const lat = Math.sin(n * 12.9898) * 1.2;
      const lon = n * 2.3999 + spin;
      const p = project(lat, lon);
      if (p[2] <= 0.05) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.002 + n);
      ctx.fillStyle = `rgba(${TQ}, ${(p[2] * (0.35 + pulse * 0.55)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.6 + pulse * 1.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Kante
    ctx.strokeStyle = `rgba(${TQ}, 0.35)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI * 0.9, Math.PI * 1.75); ctx.stroke();

    // Umlaufbahn mit Mond
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.35);
    ctx.setLineDash([3, 7]);
    ctx.strokeStyle = `rgba(${TQ}, 0.18)`;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.55, R * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    const a = t * 0.00035;
    const mx = Math.cos(a) * R * 1.55, my = Math.sin(a) * R * 0.42;
    if (!(Math.sin(a) < 0 && Math.abs(mx) < R)) {
      ctx.fillStyle = "rgba(200, 214, 212, 0.85)";
      ctx.shadowColor = `rgba(${TQ}, 0.8)`;
      ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(mx, my, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function frame(now) {
    t = now || 0;
    const scroll = window.scrollY || 0;
    ctx.clearRect(0, 0, w, h);

    // Sterne
    for (const s of stars) {
      let y = (s.y - scroll * s.depth) % h;
      if (y < 0) y += h;
      const tw = still ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(t * 0.001 * s.speed + s.phase));
      ctx.fillStyle = s.tint ? `rgba(${TQ}, ${tw})` : `rgba(214, 224, 223, ${tw * 0.85})`;
      ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, Math.PI * 2); ctx.fill();
    }

    // Code-Regen
    ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
    for (const d of drops) {
      for (let i = 0; i < d.len; i++) {
        const y = d.y - i * 15;
        if (y < -15 || y > h + 15) continue;
        const head = i === 0;
        const alpha = head ? 0.5 : 0.22 * (1 - i / d.len);
        ctx.fillStyle = head ? `rgba(200, 255, 248, ${alpha})` : `rgba(${TQ}, ${alpha})`;
        ctx.fillText(d.chars[i], d.x, y);
      }
      if (!still) {
        d.y += d.v;
        if (Math.random() < 0.03) d.chars[(Math.random() * d.len) | 0] = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        if (d.y - d.len * 15 > h) { d.y = -Math.random() * 200; d.v = 0.6 + Math.random() * 1.4; }
      }
    }

    drawGlobe(scroll);

    // Sternschnuppen
    if (!still && Math.random() < 0.004 && shooters.length < 2) {
      shooters.push({ x: Math.random() * w * 0.8, y: Math.random() * h * 0.4, vx: 7 + Math.random() * 5, vy: 2.5 + Math.random() * 2, life: 1 });
    }
    for (const s of shooters) {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
      g.addColorStop(0, `rgba(220, 255, 250, ${s.life})`);
      g.addColorStop(1, `rgba(${TQ}, 0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14); ctx.stroke();
      s.x += s.vx; s.y += s.vy; s.life -= 0.015;
    }
    shooters = shooters.filter((s) => s.life > 0 && s.x < w + 200 && s.y < h + 200);

    if (!still) raf = requestAnimationFrame(frame);
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

  resize();
  window.addEventListener("resize", () => { resize(); if (still) frame(0); });
  if (still) {
    frame(0);
    window.addEventListener("scroll", () => frame(0), { passive: true });
  } else {
    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    });
  }
})();
