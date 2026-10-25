// Xyntal OS – gemeinsame Effekte für alle Seiten:
// Neon-Netzwerk im Hintergrund (Menschen, die sich verbinden), dezenter Code-Regen,
// Lichtkegel am Mauszeiger, Entschlüsseln von Überschriften und die interaktive Konsole im Hero.
// Rein dekorativ bis auf die Konsole; pausiert im Hintergrund-Tab, bei „weniger Bewegung“ nur ein Standbild.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const weak = (navigator.hardwareConcurrency || 8) <= 4 || matchMedia("(max-width: 719px)").matches;
  const FRAME_MS = weak ? 1000 / 24 : 1000 / 30;
  const lang = () => (document.documentElement.lang === "en" ? "en" : "de");
  const tr = (o) => o[lang()] ?? o.de;

  /* ---------- Verlauf für das Logo-X überall verfügbar machen ---------- */
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  defs.setAttribute("width", "0"); defs.setAttribute("height", "0"); defs.setAttribute("aria-hidden", "true");
  defs.style.position = "absolute";
  defs.innerHTML = '<defs><linearGradient id="x-mark-grad" gradientUnits="userSpaceOnUse" x1="4" y1="4" x2="20" y2="20">'
    + '<stop offset="0" stop-color="#C64BFF"/><stop offset=".35" stop-color="#FF4FD8"/><stop offset=".65" stop-color="#4F7BFF"/><stop offset="1" stop-color="#22E5FF"/></linearGradient></defs>';
  document.body.prepend(defs);

  /* ---------- Hintergrund: Netzwerk + Code-Regen ---------- */
  const canvas = document.createElement("canvas");
  canvas.id = "cosmos";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });
  const GLYPHS = "01<>/{}[]#$&*=+;:XYNTAL0x7F";
  const C_V = [198, 75, 255], C_P = [255, 79, 216], C_B = [79, 123, 255], C_C = [34, 229, 255];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const brand = (t) => (t < 0.33 ? mix(C_V, C_P, t / 0.33) : t < 0.66 ? mix(C_P, C_B, (t - 0.33) / 0.33) : mix(C_B, C_C, (t - 0.66) / 0.34));

  let w = 0, h = 0, nodes = [], drops = [], packets = [], last = -Infinity, raf = 0;
  const LINK = weak ? 120 : 150;

  function resize() {
    w = innerWidth; h = innerHeight;
    canvas.width = w; canvas.height = h;
    const count = Math.round((w * h) / (weak ? 26000 : 19000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() < 0.12 ? 2.2 : 1.2,
      p: Math.random() * Math.PI * 2,
    }));
    const cols = Math.max(4, Math.round(w / (weak ? 160 : 110)));
    drops = Array.from({ length: cols }, (_, i) => ({
      x: (i + 0.5) * (w / cols) + (Math.random() - 0.5) * 30,
      y: Math.random() * h, v: 0.6 + Math.random() * 1.4, len: 6 + Math.floor(Math.random() * 10),
      g: Array.from({ length: 18 }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]),
      c: brand(Math.random()),
    }));
    packets = [];
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    const scroll = scrollY * 0.04;

    // Code-Regen, sehr leise
    ctx.font = "12px 'JetBrains Mono', monospace";
    for (const d of drops) {
      for (let i = 0; i < d.len; i++) {
        const a = (1 - i / d.len) * (i === 0 ? 0.32 : 0.11);
        ctx.fillStyle = i === 0 ? `rgba(236, 235, 247, ${a})` : `rgba(${d.c}, ${a.toFixed(3)})`;
        ctx.fillText(d.g[(i + ((t / 140) | 0)) % d.g.length], d.x, d.y - i * 15);
      }
      if (!still) { d.y += d.v; if (d.y - d.len * 15 > h) { d.y = -10; d.c = brand(Math.random()); } }
    }

    // Netzwerk
    for (const n of nodes) {
      if (!still) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK * LINK) continue;
        const k = 1 - Math.sqrt(d2) / LINK;
        const c = brand(Math.min(1, Math.max(0, (a.x + b.x) / 2 / w)));
        ctx.strokeStyle = `rgba(${c}, ${(k * 0.3).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - scroll);
        ctx.lineTo(b.x, b.y - scroll);
        ctx.stroke();
        if (!still && k > 0.55 && Math.random() < 0.0009 && packets.length < 10) packets.push({ a, b, s: 0 });
      }
    }
    for (const n of nodes) {
      const c = brand(Math.min(1, Math.max(0, n.x / w)));
      const pulse = 0.55 + 0.45 * Math.sin(t / 900 + n.p);
      ctx.fillStyle = `rgba(${c}, ${(0.35 + pulse * 0.45).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(n.x, n.y - scroll, n.r, 0, 6.283); ctx.fill();
    }
    // Datenpakete laufen über Verbindungen
    for (const p of packets) {
      p.s += 0.02;
      const x = p.a.x + (p.b.x - p.a.x) * p.s, y = p.a.y + (p.b.y - p.a.y) * p.s - scroll;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 8);
      g.addColorStop(0, "rgba(236, 235, 247, 0.9)");
      g.addColorStop(1, "rgba(34, 229, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.283); ctx.fill();
    }
    packets = packets.filter((p) => p.s < 1);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    draw(now);
  }

  let resizeTimer = 0;
  resize();
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); draw(performance.now()); }, 150);
  });
  if (still) {
    draw(0);
  } else {
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(loop);
    });
  }

  /* ---------- Lichtkegel am Mauszeiger ---------- */
  if (!still && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const glow = document.createElement("div");
    glow.className = "x-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.append(glow);
    let gx = -999, gy = -999, queued = false;
    addEventListener("pointermove", (e) => {
      gx = e.clientX; gy = e.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; glow.style.setProperty("--gx", `${gx}px`); glow.style.setProperty("--gy", `${gy}px`); });
    }, { passive: true });
  }

  /* ---------- Entschlüsseln: Text erscheint aus zufälligen Zeichen ---------- */
  const SCR = "!<>-_\\/[]{}—=+*^?#01XYNTAL";
  const running = new WeakMap();
  function scramble(el, duration = 900) {
    if (still || running.get(el)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const items = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.data.trim()) items.push({ node, final: node.data });
    }
    if (!items.length) return;
    running.set(el, true);
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration);
      for (const it of items) {
        const final = window.XyntalI18n ? window.XyntalI18n.textFor(it.node, it.final) : it.final;
        if (k >= 1) { it.node.data = final; continue; }
        const fixed = Math.floor(final.length * k);
        let out = final.slice(0, fixed);
        for (let i = fixed; i < final.length; i++) out += final[i] === " " ? " " : SCR[(Math.random() * SCR.length) | 0];
        it.node.data = out;
      }
      if (k < 1) requestAnimationFrame(step);
      else running.set(el, false);
    };
    requestAnimationFrame(step);
  }
  window.XyntalScramble = scramble;

  document.querySelectorAll("[data-scramble]").forEach((el, i) => setTimeout(() => scramble(el, 1100), 250 + i * 380));
  if (!still && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        scramble(e.target, 750);
        io.unobserve(e.target);
      }
    }, { threshold: 0.6 });
    document.querySelectorAll(".h2, .page-head h1, .closing-title").forEach((el) => io.observe(el));
  }

  /* ---------- Interaktive Konsole im Hero ---------- */
  const box = document.querySelector("[data-console]");
  if (!box) return;
  const out = box.querySelector("[data-console-out]");
  const form = box.querySelector("[data-console-form]");
  const input = box.querySelector("[data-console-input]");
  const clock = box.querySelector("[data-clock]");
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const startHref = () => document.querySelector("[data-start]")?.getAttribute("href") || "mitglied-werden";

  const tickClock = () => { clock.textContent = new Date().toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin" }); };
  tickClock(); setInterval(tickClock, 1000);
  const label = box.querySelector("label[for='console-cmd']");
  const localize = () => {
    input.placeholder = lang() === "en" ? "type help …" : "help eingeben …";
    if (label) label.textContent = lang() === "en" ? "Enter a command" : "Befehl eingeben";
  };
  localize();
  document.addEventListener("xyntal:lang", localize);

  const print = (html, cls = "") => {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.innerHTML = html;
    out.append(line);
    out.scrollTop = out.scrollHeight;
    return line;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, still ? 0 : ms));

  const PAGES = {
    login: "login", beta: "beta",
  };
  const T = {
    boot: { de: "xyntal os v2.0 · build-netzwerk", en: "xyntal os v2.0 · build network" },
    b1: { de: "netzwerk", en: "network" }, b2: { de: "profile", en: "profiles" }, b3: { de: "matching-engine", en: "matching engine" },
    online: { de: "online", en: "online" }, ready: { de: "bereit", en: "ready" },
    hint: { de: "Tippe <span class=\"c-hi\">help</span> für Befehle – oder probier einfach was.", en: "Type <span class=\"c-hi\">help</span> for commands – or just try something." },
    scan: { de: "> suche Menschen mit passenden Skills …", en: "> scanning for people with matching skills …" },
    roles: { de: ["entwicklung", "design", "gründung", "vertrieb"], en: ["engineering", "design", "founding", "sales"] },
    linked: { de: "> 4 Verbindungen hergestellt. Dein Team wartet.", en: "> 4 connections established. Your team is waiting." },
    help: {
      de: [["about", "was ist xyntal?"], ["join", "auf die warteliste"], ["demo", "team-demo öffnen"], ["whoami", "wer bist du?"], ["nico", "wer steckt dahinter?"], ["lang en", "switch to english"], ["clear", "konsole leeren"]],
      en: [["about", "what is xyntal?"], ["join", "join the waitlist"], ["demo", "open the team demo"], ["whoami", "who are you?"], ["nico", "who is behind this?"], ["lang de", "auf deutsch wechseln"], ["clear", "clear the console"]],
    },
    about: {
      de: "Xyntal ist die Plattform, auf der Entwickler, Designer, Gründer und alle, die etwas aufbauen wollen, ihr Team finden. Du beschreibst deine Idee und wer dir fehlt – Xyntal zeigt dir Menschen, die passen, und warum.\n<span class=\"c-pk\">Stop swiping. Start building.</span>",
      en: "Xyntal is the platform where developers, designers, founders and everyone who wants to build something find their team. Describe your idea and who you're missing – Xyntal shows you people who fit, and why.\n<span class=\"c-pk\">Stop swiping. Start building.</span>",
    },
    whoami: { de: "gast@xyntal – noch nicht auf der Warteliste. Tippe <span class=\"c-hi\">join</span>, um das zu ändern.", en: "guest@xyntal – not on the waitlist yet. Type <span class=\"c-hi\">join</span> to change that." },
    nico: { de: "Nico Scheibe · Gründer von Xyntal\nbaut Xyntal, damit Gründer und Leute, die gründen wollen, ihr Team finden.", en: "Nico Scheibe · founder of Xyntal\nbuilding Xyntal so founders and future founders can find their team." },
    open: { de: "> öffne", en: "> opening" },
    sudo: { de: "Zugriff verweigert. Hier wird gebaut, nicht gehackt. ;)", en: "Permission denied. We build here, we don't hack. ;)" },
    hack: { de: "Initialisiere … nein. Aber du hast den richtigen Spirit. Tippe <span class=\"c-hi\">join</span>.", en: "Initialising … nope. But you've got the right spirit. Type <span class=\"c-hi\">join</span>." },
    exit: { de: "Es gibt kein Zurück. Nur nach vorne: <span class=\"c-hi\">join</span>", en: "There's no way back. Only forward: <span class=\"c-hi\">join</span>" },
    nf: { de: "Befehl nicht gefunden:", en: "command not found:" },
    nf2: { de: "Tippe <span class=\"c-hi\">help</span>.", en: "Type <span class=\"c-hi\">help</span>." },
    ls: { de: "idee.md  team/  projekte/  community/  beta.sh  warteliste.txt", en: "idea.md  team/  projects/  community/  beta.sh  waitlist.txt" },
  };

  async function boot() {
    print(`<span class="c-vi">${tr(T.boot)}</span>`);
    await wait(250);
    const rows = [[T.b1, T.online], [T.b2, { de: "4 rollen", en: "4 roles" }], [T.b3, T.ready]];
    for (const [k, v] of rows) {
      print(`<span class="c-ok">[ok]</span> ${esc(tr(k)).padEnd(17, ".")} <span class="c-hi">${esc(tr(v))}</span>`);
      await wait(220);
    }
    await wait(300);
    await typeCmd('xyntal connect --idee "dein-projekt"', 'xyntal connect --idea "your-project"');
    print(tr(T.scan), "c-dim");
    await wait(300);
    const names = tr(T.roles);
    for (let i = 0; i < names.length; i++) {
      const line = print(`  ${esc(names[i]).padEnd(13, " ")} <span class="c-bar" style="width:0"></span>`);
      const bar = line.querySelector(".c-bar");
      for (let p = 0; p <= 10; p++) { bar.style.width = `${p * 0.8}em`; await wait(28); }
      bar.insertAdjacentHTML("afterend", ' <span class="c-ok">✓</span>');
    }
    await wait(200);
    print(tr(T.linked), "c-pk");
    print(tr(T.hint), "c-dim");
  }

  async function typeCmd(de, en) {
    const text = lang() === "en" ? en : de;
    const line = print("", "c-cmd");
    for (let i = 1; i <= text.length; i++) { line.textContent = text.slice(0, i); await wait(28); }
    await wait(250);
  }

  const history = [];
  let hIdx = 0;
  function go(target, label) {
    const href = target === "START" ? startHref() : target;
    print(`${tr(T.open)} <span class="c-hi">${esc(label || href)}</span> …`, "c-dim");
    setTimeout(() => { location.href = href; }, still ? 0 : 450);
  }

  function run(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    print(esc(cmd), "c-cmd");
    history.push(cmd); hIdx = history.length;
    const [name, ...args] = cmd.toLowerCase().split(/\s+/);
    switch (name) {
      case "help": case "hilfe": case "?":
        tr(T.help).forEach(([c, d]) => print(`  <span class="c-hi">${esc(c).padEnd(10, " ")}</span> <span class="c-dim">${esc(d)}</span>`));
        break;
      case "about": case "xyntal": case "info": print(tr(T.about)); break;
      case "whoami": print(tr(T.whoami)); break;
      case "nico": case "founder": case "gründer": print(tr(T.nico)); break;
      case "ls": case "dir": print(tr(T.ls), "c-hi"); break;
      case "date": case "datum": print(new Date().toLocaleString(lang() === "en" ? "en-GB" : "de-DE", { timeZone: "Europe/Berlin" })); break;
      case "clear": case "cls": out.innerHTML = ""; break;
      case "join": case "start": case "warteliste": case "waitlist": {
        print(`${tr(T.open)} <span class="c-hi">warteliste</span> …`, "c-dim");
        document.getElementById("warteliste")?.scrollIntoView({ behavior: still ? "auto" : "smooth" });
        setTimeout(() => document.getElementById("wl-email")?.focus({ preventScroll: true }), still ? 0 : 700);
        break;
      }
      case "demo": {
        print(`${tr(T.open)} <span class="c-hi">demo</span> …`, "c-dim");
        document.getElementById("entdecken")?.scrollIntoView({ behavior: still ? "auto" : "smooth" });
        break;
      }
      case "lang": case "sprache": case "language": {
        const to = args[0] === "en" || args[0] === "english" ? "en" : args[0] === "de" || args[0] === "deutsch" ? "de" : lang() === "de" ? "en" : "de";
        window.XyntalI18n?.set(to);
        print(to === "en" ? "<span class=\"c-ok\">[ok]</span> language: english" : "<span class=\"c-ok\">[ok]</span> sprache: deutsch");
        break;
      }
      case "sudo": case "su": case "rm": print(tr(T.sudo), "c-err"); break;
      case "hack": case "hacken": print(tr(T.hack)); break;
      case "exit": case "quit": print(tr(T.exit)); break;
      default:
        if (PAGES[name]) go(PAGES[name], name);
        else print(`${tr(T.nf)} ${esc(name)} · ${tr(T.nf2)}`, "c-err");
    }
  }

  const COMMANDS = ["help", "about", "join", "demo", "whoami", "nico", "lang", "ls", "date", "clear"];
  form.addEventListener("submit", (e) => { e.preventDefault(); run(input.value); input.value = ""; });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && history.length) { e.preventDefault(); hIdx = Math.max(0, hIdx - 1); input.value = history[hIdx]; }
    else if (e.key === "ArrowDown" && history.length) { e.preventDefault(); hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ""; }
    else if (e.key === "Tab" && input.value) {
      const hit = COMMANDS.find((c) => c.startsWith(input.value.toLowerCase()));
      if (hit) { e.preventDefault(); input.value = hit; }
    }
  });
  out.addEventListener("click", () => input.focus({ preventScroll: true }));
  boot();
})();
