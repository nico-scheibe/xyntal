// Xyntal – Startseite: Navigation, interaktive Demo (Beispieldaten),
// Team-Moment und einmaliges Einblenden. Ohne Bibliotheken, ohne Backend.
(() => {
  document.documentElement.classList.add("js");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = (name) => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  /* ---------------------------------------------------------------
     Beispieldaten: Projekt „Loopr“ (erfunden) – KI-App, die aus Summen einen Song macht
     --------------------------------------------------------------- */
  const PROJECT = "Loopr";
  const FOUNDER = { name: "Jana Weiß", title: "Gründerin" };

  const ROLES = [
    { id: "mobile", name: "Mobile-Entwicklung", short: "Mobile", need: "App für iOS und Android mit sauberer Audioaufnahme", hours: 10,
      task: { text: "Aufnahme-Screen prototypen", note: "Summen rein, Beat raus – in unter 10 Sekunden" },
      hello: "Bis Sonntag steht ein Aufnahme-Prototyp, den wir am Handy testen können." },
    { id: "design", name: "Produktdesign", short: "Design", need: "Ein Studio, das sich wie ein Spiel anfühlt", hours: 8,
      task: { text: "Onboarding mit fünf Musiker:innen testen", note: "Klickdummy, je 15 Minuten" },
      hello: "Ich kann Donnerstagabend für den Kickoff. Bringe erste Screens mit." },
    { id: "backend", name: "KI & Audio", short: "KI", need: "Melodie erkennen, passenden Beat erzeugen", hours: 8,
      task: { text: "Melodie-Erkennung mit 50 Sprachmemos testen", note: "Wie oft trifft die KI den Ton?" },
      hello: "Ich vergleiche zuerst drei offene Modelle für die Tonhöhenerkennung." },
    { id: "sales", name: "Community & Creator", short: "Community", need: "Die ersten 1.000 Nutzer:innen über TikTok", hours: 6,
      task: { text: "Creator-Liste für die Beta anlegen", note: "20 Musik-Creator, die Loopr zeigen" },
      hello: "Zwei Musik-Creator aus meinem Netzwerk würden die Beta in ihren Videos zeigen." },
  ];

  // c: [Fähigkeiten, Zeit, Arbeitsweise] – "ok" passt, "part" passt teilweise
  const PEOPLE = {
    mobile: [
      { id: "lukas", name: "Lukas Brandl", title: "Swift-Entwickler, Werkstudent", place: "Regensburg", hours: 10, from: "ab sofort",
        skills: ["Swift", "AVFoundation", "Core ML"],
        reason: "Hat eine Stimmgeräte-App mit 20.000 Downloads gebaut und kennt Audioaufnahme auf dem iPhone in- und auswendig.",
        c: [["ok", "Swift, Audio"], ["ok", "10 von 10 Std."], ["ok", "vor Ort, abends"]] },
      { id: "sara", name: "Sara Öztürk", title: "React-Native-Entwicklerin, sechs Jahre Erfahrung", place: "Nürnberg · remote", hours: 6, from: "ab Dezember",
        skills: ["React Native", "TypeScript", "In-App-Käufe"],
        reason: "Baut iOS und Android mit einer Codebasis und kennt In-App-Käufe. Hat weniger Zeit, als die Rolle braucht.",
        c: [["ok", "React Native, In-App-Käufe"], ["part", "6 von 10 Std."], ["ok", "remote, feste Termine"]] },
      { id: "tim", name: "Tim Hofer", title: "Spieleentwickler, Quereinsteiger", place: "Cham", hours: 12, from: "ab sofort",
        skills: ["Unity", "C#", "Sounddesign"],
        reason: "Baut Rhythmusspiele und versteht Timing auf die Millisekunde. In native Apps müsste er sich erst einarbeiten.",
        c: [["part", "Unity statt App"], ["ok", "12 von 10 Std."], ["ok", "hybrid"]] },
    ],
    design: [
      { id: "mira", name: "Mira Schreiner", title: "UX/UI-Designerin", place: "Regensburg", hours: 8, from: "ab sofort",
        skills: ["Figma", "Nutzertests", "Motion"],
        reason: "Hat eine Musik-Lern-App gestaltet und mit Jugendlichen getestet – genau die Zielgruppe von Loopr.",
        c: [["ok", "UI, Nutzertests"], ["ok", "8 von 8 Std."], ["ok", "vor Ort"]] },
      { id: "jonas", name: "Jonas Wirth", title: "Brand- und Produktdesigner", place: "München · remote", hours: 5, from: "ab sofort",
        skills: ["Figma", "Branding", "Albumcover"],
        reason: "Gestaltet Albumcover für Indie-Bands und hat eine starke Handschrift. Mit App-Abläufen hat er bisher weniger gearbeitet.",
        c: [["part", "eher Marke als App"], ["part", "5 von 8 Std."], ["ok", "remote"]] },
      { id: "elena", name: "Elena Kraus", title: "Motion-Designerin", place: "Landshut", hours: 10, from: "ab Januar",
        skills: ["After Effects", "Rive", "Prototyping"],
        reason: "Könnte die Animationen bauen, die Loopr verspielt machen. Startet erst im Januar.",
        c: [["ok", "Animation, Prototypen"], ["ok", "10 von 8 Std."], ["part", "erst ab Januar"]] },
    ],
    backend: [
      { id: "felix", name: "Felix Raab", title: "ML-Engineer", place: "Regensburg", hours: 8, from: "ab sofort",
        skills: ["Python", "PyTorch", "Audio-KI"],
        reason: "Hat in seiner Masterarbeit Melodien aus Summen erkannt – fast genau das Herzstück von Loopr.",
        c: [["ok", "Audio-KI, PyTorch"], ["ok", "8 von 8 Std."], ["ok", "vor Ort, abends"]] },
      { id: "ana", name: "Ana Petrović", title: "Data Engineer", place: "Ingolstadt · remote", hours: 4, from: "ab sofort",
        skills: ["Python", "dbt", "Dashboards"],
        reason: "Für den Start zu wenig Zeit, aber ideal, sobald ihr auswerten wollt, welche Songs geteilt werden.",
        c: [["part", "Daten statt KI"], ["part", "4 von 8 Std."], ["ok", "remote"]] },
      { id: "moritz", name: "Moritz Lang", title: "Musikproduzent und Entwickler", place: "Regensburg", hours: 15, from: "ab Februar",
        skills: ["Ableton", "Python", "Docker"],
        reason: "Produziert selbst Beats und programmiert – allerdings erst ab Februar, wenn der Prototyp schon stehen soll.",
        c: [["ok", "Beats, Python"], ["ok", "15 von 8 Std."], ["part", "erst ab Februar"]] },
    ],
    sales: [
      { id: "nina", name: "Nina Berger", title: "Musik-Creatorin, 80.000 Follower", place: "Regensburg · remote", hours: 6, from: "ab sofort",
        skills: ["TikTok", "Songwriting", "Community"],
        reason: "Postet täglich eigene Songs auf TikTok und kennt die Szene. Genau die Reichweite, die Loopr zum Start braucht.",
        c: [["ok", "TikTok, Musik"], ["ok", "6 von 6 Std."], ["ok", "remote"]] },
      { id: "david", name: "David Neumann", title: "Growth-Marketer", place: "Regensburg", hours: 10, from: "ab sofort",
        skills: ["Ads", "Analytics", "A/B-Tests"],
        reason: "Erfahren mit bezahlter Werbung und Zahlen, hat aber noch keine Kontakte in die Musikszene.",
        c: [["part", "Ads, keine Creator"], ["ok", "10 von 6 Std."], ["ok", "hybrid"]] },
      { id: "lea", name: "Lea Zimmer", title: "Marketing-Studentin", place: "Regensburg", hours: 12, from: "ab sofort",
        skills: ["Social Media", "Video", "Texte"],
        reason: "Schneidet Kurzvideos, die zeigen, wie Loopr klingt. Kontakte zu großen Creatorn fehlen ihr noch.",
        c: [["part", "Video statt Creator-Netzwerk"], ["ok", "12 von 6 Std."], ["ok", "vor Ort"]] },
    ],
  };
  const CRIT_LABELS = ["Fähigkeiten", "Zeit", "Arbeitsweise"];
  const roleById = Object.fromEntries(ROLES.map((r) => [r.id, r]));
  const personById = {};
  for (const [roleId, list] of Object.entries(PEOPLE)) for (const p of list) personById[p.id] = { ...p, role: roleId };

  /* ---------------------------------------------------------------
     Zustand (nur in diesem Tab gemerkt)
     --------------------------------------------------------------- */
  const KEY = "xyntal-demo-team";
  const state = { role: null, team: {}, view: "select", done: new Set(), kickoff: false };
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "{}");
    for (const [r, p] of Object.entries(saved)) if (roleById[r] && personById[p]?.role === r) state.team[r] = p;
  } catch { /* ohne Speicher geht es auch */ }
  const saveTeam = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state.team)); } catch { /* egal */ } };
  const teamList = () => ROLES.filter((r) => state.team[r.id]).map((r) => personById[state.team[r.id]]);

  const listeners = [];
  const onTeamChange = (fn) => listeners.push(fn);
  const teamChanged = () => { saveTeam(); listeners.forEach((fn) => fn()); };

  /* ---------------------------------------------------------------
     Navigation
     --------------------------------------------------------------- */
  const topbar = $(".topbar");
  const setScrolled = () => topbar.classList.toggle("is-scrolled", scrollY > 8);
  addEventListener("scroll", setScrolled, { passive: true });
  setScrolled();

  const toggle = $(".menu-toggle");
  const nav = $("#hauptnavigation");
  const setMenu = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    $(".menu-toggle-label", toggle).textContent = open ? "Schließen" : "Menü";
  };
  toggle.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); toggle.focus(); }
  });

  // Angemeldet? Die Supabase-Sitzung liegt im localStorage – dafür muss die große Bibliothek nicht laden.
  // Angemeldete landen bei „Projekt starten“ direkt im Projektformular statt in der Anmeldung.
  try {
    const ref = "rralgrlujoupprwlvoyo";
    if (localStorage.getItem(`sb-${ref}-auth-token`)) {
      const slot = $("[data-account]");
      if (slot) { slot.textContent = "Mein Profil"; slot.href = "profil"; }
      $$("[data-start]").forEach((a) => { a.href = "projekte?neu=1"; });
    }
  } catch { /* privat surfen o. Ä. */ }

  /* ---------------------------------------------------------------
     Demo
     --------------------------------------------------------------- */
  const demo = $("[data-demo]");
  const els = {
    roles: $("[data-roles]", demo),
    people: $("[data-people]", demo),
    peopleTitle: $("[data-people-title]", demo),
    peopleCount: $("[data-people-count]", demo),
    team: $("[data-team]", demo),
    teamCount: $("[data-team-count]", demo),
    teamMeter: $("[data-team-meter]", demo),
    open: $("[data-open-workspace]", demo),
    wsHint: $("[data-ws-hint]", demo),
    select: $('[data-view="select"]', demo),
    workspace: $('[data-view="workspace"]', demo),
    announce: $("[data-announce]", demo),
    steps: $$(".demo-steps li", demo),
  };
  const ICON_CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>';
  const ICON_PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>';
  const ICON_X = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

  const announce = (text) => { els.announce.textContent = ""; requestAnimationFrame(() => { els.announce.textContent = text; }); };

  function renderSteps() {
    const current = state.view === "workspace" ? 3 : teamList().length >= 2 ? 2 : 1;
    els.steps.forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle("is-current", n === current);
      li.classList.toggle("is-done", n < current);
      if (n === current) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
  }

  /* ---------- Swipe-Stapel ---------- */
  const appClock = $("[data-app-clock]");
  const setClock = () => { if (appClock) appClock.textContent = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" }); };
  setClock(); setInterval(setClock, 30000);
  // Passung als Zahl: „passt“ zählt voll, „passt teilweise“ knapp zur Hälfte
  const score = (p) => Math.round(55 + 44 * (p.c.reduce((n, [st]) => n + (st === "ok" ? 1 : 0.45), 0) / p.c.length));
  state.idx = {};
  if (!state.role) state.role = (ROLES.find((r) => !state.team[r.id]) || ROLES[0]).id;
  let busy = false;

  function renderRoles() {
    els.roles.innerHTML = ROLES.map((r) => {
      const filled = !!state.team[r.id];
      const who = filled ? personById[state.team[r.id]] : null;
      return `<button type="button" class="role-tab${filled ? " is-filled" : ""}" data-role="${r.id}" aria-pressed="${state.role === r.id}">
        <span class="role-tab-dot" aria-hidden="true">${filled ? initials(who.name) : ""}</span>
        <span class="role-tab-name">${esc(r.short)}</span>
      </button>`;
    }).join("");
  }

  const candidates = () => PEOPLE[state.role].map((p) => personById[p.id]);
  const currentIndex = () => state.idx[state.role] || 0;

  function card(p, depth) {
    const role = roleById[p.role];
    const picked = state.team[p.role] === p.id;
    const pct = Math.min(100, Math.round((p.hours / role.hours) * 100));
    return `<article class="swipe-card${depth ? " is-under" : " is-top"}${picked ? " is-picked" : ""}" style="--depth:${depth}" data-card="${p.id}" ${depth ? 'aria-hidden="true"' : `aria-labelledby="pn-${p.id}"`}>
      <span class="stamp stamp-yes" aria-hidden="true">Ins Team</span>
      <span class="stamp stamp-no" aria-hidden="true">Weiter</span>
      <div class="person-top">
        <span class="avatar${picked ? " is-ice" : ""}" aria-hidden="true">${initials(p.name)}</span>
        <div>
          <h5 class="person-name" id="${depth ? "" : "pn-"}${p.id}">${esc(p.name)}</h5>
          <p class="person-sub">${esc(p.title)} · ${esc(p.place)}</p>
        </div>
        <span class="score" style="--p:${score(p)}" aria-hidden="true"><b>${score(p)}<small>%</small></b></span>
      </div>
      ${picked ? '<p class="card-badge">Im Team</p>' : ""}
      <ul class="skills" aria-label="Fähigkeiten">${p.skills.map((sk) => `<li>${esc(sk)}</li>`).join("")}</ul>
      <div class="avail">
        <div class="avail-row"><span>Verfügbar</span><b>${p.hours} Std./Woche · ${esc(p.from)}</b></div>
        <div class="meter" aria-hidden="true"><i class="${pct >= 100 ? "is-full" : ""}" style="width:${pct}%"></i></div>
      </div>
      <p class="reason"><span class="reason-k">Warum das passt</span>${esc(p.reason)}</p>
      <ul class="criteria" aria-label="Abgleich">
        ${p.c.map(([st, t], i) => `<li class="c-${st}" title="${esc(t)}"><span class="crit crit-${st}" aria-hidden="true">${st === "ok" ? "OK" : "~"}</span><b>${CRIT_LABELS[i]}</b><span class="sr-only">: ${esc(t)} – ${st === "ok" ? "passt" : "passt teilweise"}</span></li>`).join("")}
      </ul>
    </article>`;
  }

  function renderPeople() {
    const role = roleById[state.role];
    const list = candidates();
    const i = currentIndex() % list.length;
    els.peopleTitle.innerHTML = `Gesucht: <b>${esc(role.name)}</b>`;
    els.peopleCount.textContent = `${i + 1} von ${list.length}`;
    const order = [0, 1, 2].map((k) => list[(i + k) % list.length]);
    // unterste Karte zuerst, damit die oberste im DOM zuletzt liegt
    els.people.innerHTML = order.map((p, d) => card(p, d)).reverse().join("");
    bindDrag();
  }

  function renderDone() {
    els.peopleTitle.textContent = "Team komplett.";
    els.peopleCount.textContent = "";
    els.people.innerHTML = `<div class="deck-done">
      <div class="done-avatars" aria-hidden="true">${teamList().map((p) => `<span class="avatar is-ice">${initials(p.name)}</span>`).join("")}</div>
      <p><strong>Alle vier Rollen sind besetzt.</strong><br>Zeit für den gemeinsamen Workspace.</p>
      <button type="button" class="btn btn-primary" data-done-open>Workspace öffnen <span aria-hidden="true">→</span></button>
    </div>`;
    $("[data-done-open]", els.people).addEventListener("click", () => showView("workspace"));
  }

  function renderDeck() {
    const done = teamList().length === ROLES.length && state.showDone;
    els.select.classList.toggle("is-done", !!done);
    if (done) renderDone(); else renderPeople();
  }

  function selectRole(id) {
    state.role = id;
    state.showDone = false;
    renderRoles();
    renderSteps();
    renderDeck();
    els.people.classList.remove("is-shuffling"); void els.people.offsetWidth; els.people.classList.add("is-shuffling");
  }

  function decide(yes) {
    if (busy || matchOpen() || els.select.classList.contains("is-done")) return;
    const top = $(".swipe-card.is-top", els.people);
    if (!top) return;
    const p = personById[top.dataset.card];
    busy = true;
    rememberSwipe();
    buzz(yes ? [12, 40, 18] : 10);
    // Auch per Knopf/Taste: Stempel kurz zeigen, dann wegfliegen
    top.style.setProperty(yes ? "--yes" : "--no", 1);
    top.style.setProperty(yes ? "--no" : "--yes", 0);
    nextCard()?.style.setProperty("--lift", 1);
    top.classList.add(yes ? "fly-right" : "fly-left");
    top.style.transform = "";
    setTimeout(() => {
      busy = false;
      if (yes) {
        const role = roleById[p.role];
        const prev = state.team[p.role];
        if (prev !== p.id) {
          state.team[p.role] = p.id;
          justFilled = p.role;
          announce(prev ? `${p.name} ersetzt ${personById[prev].name} für ${role.name}.` : `${p.name} ist jetzt im Team für ${role.name}.`);
        }
        const next = ROLES.find((r) => !state.team[r.id]);
        if (next) state.role = next.id; else state.showDone = true;
        teamChanged();
        showMatch(p);
      } else {
        state.idx[state.role] = currentIndex() + 1;
        renderPeople();
      }
    }, still ? 0 : 300);
  }

  // Gegenseitiges Match: erst Anfrage, dann Antwort – wie in der echten App geplant
  const matchScreen = $("[data-match-screen]", demo);
  let matchTimer = 0;
  function showMatch(p) {
    clearTimeout(matchTimer);
    const first = p.name.split(" ")[0];
    matchScreen.hidden = false;
    matchScreen.className = "match-screen is-waiting";
    matchScreen.innerHTML = `<div class="ms-wait">
        <span class="ms-ping" aria-hidden="true"><span class="avatar is-ice">${initials(p.name)}</span></span>
        <p>Anfrage an ${esc(first)} gesendet …</p>
      </div>`;
    const reveal = () => {
      const canOpen = teamList().length >= 2;
      matchScreen.className = "match-screen is-match";
      matchScreen.innerHTML = `<div class="ms-match" role="dialog" aria-modal="false" aria-labelledby="ms-title">
          <p class="ms-kicker">Beide haben Ja gesagt</p>
          <h5 class="ms-title" id="ms-title">It's a Match!</h5>
          <div class="ms-pair" aria-hidden="true">
            <span class="avatar ms-a">${initials(FOUNDER.name)}</span>
            <span class="ms-spark">✦</span>
            <span class="avatar is-ice ms-b">${initials(p.name)}</span>
          </div>
          <p class="ms-text">${esc(first)} will bei ${PROJECT} als ${esc(roleById[p.role].name)} mitmachen.</p>
          <div class="ms-actions">
            ${canOpen ? '<button type="button" class="ms-btn ms-primary" data-match-ws>Workspace öffnen</button>' : ""}
            <button type="button" class="ms-btn${canOpen ? "" : " ms-primary"}" data-match-close>Weiter swipen</button>
          </div>
        </div>`;
      $("[data-match-close]", matchScreen).addEventListener("click", closeMatch);
      $("[data-match-ws]", matchScreen)?.addEventListener("click", () => { closeMatch(); showView("workspace"); });
      $(".ms-btn", matchScreen).focus({ preventScroll: true });
      announce(`Match mit ${p.name}.`);
    };
    matchTimer = setTimeout(reveal, still ? 0 : 900);
  }
  function closeMatch() {
    clearTimeout(matchTimer);
    matchScreen.hidden = true;
    matchScreen.innerHTML = "";
    els.people.focus({ preventScroll: true });
  }
  const matchOpen = () => !matchScreen.hidden;

  // Vibration am Handy (wo der Browser es kann)
  const buzz = (pattern) => { try { if (!still && navigator.vibrate) navigator.vibrate(pattern); } catch { /* egal */ } };
  // Karten liegen im DOM von unten nach oben – die direkt darunter ist das vorige Element
  const nextCard = () => { const top = $(".swipe-card.is-top", els.people); const prev = top?.previousElementSibling; return prev?.classList.contains("swipe-card") ? prev : null; };
  const SWIPED = "xyntal-demo-swiped";
  const rememberSwipe = () => { try { localStorage.setItem(SWIPED, "1"); } catch { /* egal */ } };
  let hintHand = null;
  // Beim ersten Besuch einmal zeigen, dass man wischen kann
  function showHint() {
    try { if (localStorage.getItem(SWIPED)) return; } catch { /* zeigen */ }
    const top = $(".swipe-card.is-top", els.people);
    if (!top || still || busy) return;
    hintHand = document.createElement("span");
    hintHand.className = "swipe-hand";
    hintHand.setAttribute("aria-hidden", "true");
    hintHand.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v4.5a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.7-2.3L4.3 15a1.5 1.5 0 0 1 2.3-1.9L9 15.5"/></svg>';
    els.people.parentElement.append(hintHand);
    top.classList.add("is-hint");
    setTimeout(() => { top.classList.remove("is-hint"); hintHand?.remove(); hintHand = null; }, 2600);
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) { io.disconnect(); setTimeout(showHint, 500); }
    }, { threshold: 0.6 });
    io.observe(els.people);
  }

  // Ziehen mit Maus oder Finger
  function bindDrag() {
    const top = $(".swipe-card.is-top", els.people);
    if (!top) return;
    let x0 = 0, y0 = 0, dx = 0, dragging = false, id = null, past = false, vx = 0, lastX = 0, lastT = 0;
    const under = nextCard();
    top.addEventListener("pointerdown", (e) => {
      if (busy || e.button > 0) return;
      dragging = true; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0; past = false;
      vx = 0; lastX = e.clientX; lastT = e.timeStamp;
      top.setPointerCapture(id);
      top.classList.add("is-dragging");
      top.classList.remove("is-hint");
      hintHand?.remove();
      under?.classList.add("is-dragging");
    });
    top.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== id) return;
      dx = e.clientX - x0;
      const dt = e.timeStamp - lastT;
      if (dt > 0) { vx = 0.5 * vx + 0.5 * ((e.clientX - lastX) / dt); lastX = e.clientX; lastT = e.timeStamp; }
      const dy = (e.clientY - y0) * 0.15;
      top.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      top.style.setProperty("--yes", Math.max(0, Math.min(1, dx / 110)));
      top.style.setProperty("--no", Math.max(0, Math.min(1, -dx / 110)));
      under?.style.setProperty("--lift", Math.min(1, Math.abs(dx) / 160));
      // kurzes Tippen am Handy, sobald die Entscheidung „einrastet“
      const nowPast = Math.abs(dx) > 110;
      if (nowPast !== past) { past = nowPast; if (past) buzz(8); }
    });
    const end = (e) => {
      if (!dragging || e.pointerId !== id) return;
      dragging = false;
      top.classList.remove("is-dragging");
      under?.classList.remove("is-dragging");
      // weit genug gezogen – oder schnell geschnippt
      const flick = Math.abs(dx) > 45 && Math.abs(vx) > 0.45 && Math.sign(vx) === Math.sign(dx);
      if (Math.abs(dx) > 110 || flick) decide(dx > 0);
      else {
        top.style.transform = ""; top.style.setProperty("--yes", 0); top.style.setProperty("--no", 0);
        under?.style.setProperty("--lift", 0);
      }
    };
    top.addEventListener("pointerup", end);
    top.addEventListener("pointercancel", end);
  }

  let justFilled = null;
  function togglePick(pid) {
    const p = personById[pid];
    const role = roleById[p.role];
    if (state.team[p.role] === pid) {
      delete state.team[p.role];
      state.showDone = false;
      announce(`${p.name} ist nicht mehr im Team. ${role.name} ist wieder offen.`);
      teamChanged();
    }
  }

  function renderTeam() {
    const n = teamList().length;
    els.team.innerHTML = ROLES.map((r) => {
      const p = state.team[r.id] && personById[state.team[r.id]];
      if (!p) return `<li class="slot"><span class="slot-ph" aria-hidden="true">+</span><span class="slot-text"><b>${esc(r.name)}</b><span>noch offen</span></span></li>`;
      return `<li class="slot is-filled${justFilled === r.id ? " just-filled" : ""}">
        <span class="avatar avatar-sm is-ice" aria-hidden="true">${initials(p.name)}</span>
        <span class="slot-text"><b>${esc(p.name)}</b><span>${esc(r.name)}</span></span>
        <button type="button" class="slot-remove" data-remove="${p.id}" aria-label="${esc(p.name)} aus dem Team entfernen">${ICON_X}</button>
      </li>`;
    }).join("");
    justFilled = null;
    els.teamCount.textContent = `${n} von ${ROLES.length}`;
    const badge = $("[data-match-badge]", demo);
    if (badge) { badge.hidden = n === 0; badge.textContent = n; }
    const need = ROLES.reduce((sum, r) => sum + r.hours, 0);
    const have = ROLES.reduce((sum, r) => sum + (state.team[r.id] ? Math.min(personById[state.team[r.id]].hours, r.hours) : 0), 0);
    const cover = Math.round((have / need) * 100);
    const power = $("[data-team-power]", demo);
    if (power) { power.style.setProperty("--p", cover); $("b", power).textContent = `${cover}%`; }
    [...els.teamMeter.children].forEach((seg, i) => seg.classList.toggle("on", i < n));
    els.open.disabled = n < 2;
    els.wsHint.textContent = n < 2
      ? (n === 0 ? "Hol mindestens zwei Menschen ins Team." : "Noch eine Person, dann kann es losgehen.")
      : n < ROLES.length ? "Offene Rollen kannst du auch später besetzen." : "Alle Rollen sind besetzt.";
  }

  /* Workspace */
  function tasksFor() {
    const list = [{ id: "kickoff", text: "Kickoff: Ziele für die ersten sechs Wochen", note: "Gemeinsam, 60 Minuten", who: FOUNDER.name }];
    for (const r of ROLES) {
      const p = state.team[r.id] && personById[state.team[r.id]];
      list.push(p ? { id: r.id, text: r.task.text, note: r.task.note, who: p.name }
                  : { id: `open-${r.id}`, text: `Weiter suchen: ${r.name}`, note: "Rolle ist noch offen", who: FOUNDER.name });
    }
    return list;
  }

  function renderProgress(total) {
    const done = $$(".task input:checked", els.workspace).length;
    $("[data-progress-label]", els.workspace).textContent = `${done} von ${total} erledigt`;
    $("[data-progress-bar]", els.workspace).style.width = `${total ? (done / total) * 100 : 0}%`;
  }

  function renderWorkspace() {
    const tasks = tasksFor();
    $("[data-tasks]", els.workspace).innerHTML = tasks.map((t) => `<li class="task">
      <label>
        <input type="checkbox" data-task="${t.id}"${state.done.has(t.id) ? " checked" : ""}>
        <span class="task-box" aria-hidden="true">${ICON_CHECK}</span>
        <span class="task-text"><span>${esc(t.text)}</span><small>${esc(t.note)}</small></span>
        <span class="avatar avatar-sm" title="${esc(t.who)}" aria-label="zuständig: ${esc(t.who)}">${initials(t.who)}</span>
      </label>
    </li>`).join("");
    renderProgress(tasks.length);

    const members = teamList();
    $("[data-ws-members]", els.workspace).innerHTML =
      `<li><span class="avatar avatar-sm" aria-hidden="true">${initials(FOUNDER.name)}</span><div>${esc(FOUNDER.name)}<span>${FOUNDER.title}</span></div></li>` +
      members.map((p) => `<li><span class="avatar avatar-sm is-ice" aria-hidden="true">${initials(p.name)}</span><div>${esc(p.name)}<span>${esc(roleById[p.role].name)}</span></div></li>`).join("");

    const feed = [{ who: FOUNDER.name, when: "vor 4 Min.", text: "Willkommen im Team! Ich habe die ersten Aufgaben angelegt – schaut gern drüber." }]
      .concat(members.slice(0, 3).map((p, i) => ({ who: p.name, when: i === 0 ? "vor 2 Min." : "gerade eben", text: roleById[p.role].hello })));
    if (state.kickoff) feed.push({ who: "Du", when: "jetzt", text: "Kickoff vorgeschlagen: Donnerstag, 19:00 Uhr, Coworking am Bahnhof oder per Video.", fresh: true });
    $("[data-feed]", els.workspace).innerHTML = feed.map((m) => `<li${m.fresh ? ' class="is-new"' : ""}>
      <span class="avatar avatar-sm${m.who === "Du" ? " is-ice" : ""}" aria-hidden="true">${m.who === "Du" ? "Du" : initials(m.who)}</span>
      <div><b>${esc(m.who)}</b><time>${m.when}</time><p>${esc(m.text)}</p></div>
    </li>`).join("");

    const kick = $("[data-kickoff]", els.workspace);
    kick.disabled = state.kickoff;
    kick.textContent = state.kickoff ? "Kickoff vorgeschlagen" : "Kickoff-Termin vorschlagen";
  }

  function showView(view) {
    state.view = view;
    els.select.hidden = view !== "select";
    els.workspace.hidden = view !== "workspace";
    renderSteps();
    if (view === "workspace") {
      renderWorkspace();
      els.workspace.focus({ preventScroll: true });
      const top = demo.getBoundingClientRect().top;
      if (top < 0) demo.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
      announce("Workspace geöffnet.");
    } else {
      els.open.focus({ preventScroll: true });
    }
  }

  // Ereignisse
  els.roles.addEventListener("click", (e) => {
    const b = e.target.closest("[data-role]");
    if (b) selectRole(b.dataset.role);
  });
  $("[data-swipe-actions]", demo).addEventListener("click", (e) => {
    const b = e.target.closest("[data-swipe]");
    if (b) decide(b.dataset.swipe === "yes");
  });
  els.people.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); decide(true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); decide(false); }
  });
  els.team.addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    const idx = $$("[data-remove]", els.team).indexOf(b);
    togglePick(b.dataset.remove);
    const rest = $$("[data-remove]", els.team);
    (rest[Math.min(idx, rest.length - 1)] || els.open).focus();
  });
  els.open.addEventListener("click", () => showView("workspace"));
  $("[data-back]", els.workspace).addEventListener("click", () => showView("select"));
  els.workspace.addEventListener("change", (e) => {
    const box = e.target.closest("[data-task]");
    if (!box) return;
    if (box.checked) state.done.add(box.dataset.task); else state.done.delete(box.dataset.task);
    renderProgress($$("[data-task]", els.workspace).length);
  });
  // Brücke zur echten Seite: Rollen des Demo-Teams als Vorschlag mitnehmen (bleibt nur in diesem Browser, auch über die Bestätigungsmail hinweg)
  $("[data-bridge]", els.workspace).addEventListener("click", () => {
    const roles = ROLES.filter((r) => state.team[r.id]).map((r) => ({ name: r.name, need: r.need, hours: r.hours }));
    try { localStorage.setItem("xyntal-wunschrollen", JSON.stringify(roles)); } catch { /* geht auch ohne */ }
  });
  $("[data-kickoff]", els.workspace).addEventListener("click", () => {
    state.kickoff = true;
    renderWorkspace();
    const status = $("[data-kickoff-status]", els.workspace);
    status.textContent = "Demo: Es wurde keine Einladung verschickt.";
    status.focus(); // der Button ist jetzt deaktiviert – Fokus nicht verlieren
  });

  onTeamChange(() => {
    renderRoles();
    renderTeam();
    renderSteps();
    renderDeck();
  });

  renderRoles();
  renderTeam();
  renderSteps();
  renderDeck();

  /* ---------------------------------------------------------------
     Team-Moment: Profile verbinden sich zur Projektansicht
     --------------------------------------------------------------- */
  if ($("[data-assembly]")) (() => {
  const asm = $("[data-assembly]");
    const asmList = $("[data-assembly-list]", asm);
    const asmSource = $("[data-assembly-source]");
    const asmStatus = $("[data-assembly-status]", asm);
    const asmHours = $("[data-assembly-hours]", asm);
    // Wohin die Karten vor dem Verbinden verstreut liegen (Anteil der Bühne, Drehung)
    const SCATTER = [[-0.30, -0.36, -5], [0.32, -0.16, 4], [-0.26, 0.20, 3], [0.30, 0.40, -4]];
    let played = false;

    function asmMembers() {
      const own = teamList();
      if (own.length) return { own: true, list: own };
      return { own: false, list: ROLES.map((r) => personById[PEOPLE[r.id][0].id]) };
    }

    function renderAssembly() {
      const { own, list } = asmMembers();
      asmList.innerHTML = list.map((p) => `<li class="a-card">
        <span class="avatar is-ice" aria-hidden="true">${initials(p.name)}</span>
        <div><b>${esc(p.name)}</b><span>${esc(roleById[p.role].name)} · ${esc(p.place)}</span></div>
        <em>${p.hours} Std.</em>
      </li>`).join("");
      const hours = list.reduce((s, p) => s + p.hours, 0);
      asmHours.textContent = `${hours} Std./Woche gemeinsam`;
      const open = ROLES.length - list.length;
      asmStatus.textContent = open ? `${list.length} von ${ROLES.length} Rollen besetzt` : "Team steht";
      asmSource.classList.toggle("is-own", own);
      asmSource.textContent = own
        ? `Dein Demo-Team aus der Auswahl oben: ${list.map((p) => p.name.split(" ")[0]).join(", ")}.`
        : "Ein Vorschlagsteam für Loopr. Stell oben in der Demo dein eigenes zusammen – dann erscheint es hier.";
    }

    function scatter() {
      asm.classList.remove("is-joined");
      asm.classList.add("is-scattered");
      const cards = $$(".a-card", asm);
      cards.forEach((c) => { c.getAnimations().forEach((a) => a.cancel()); c.style.transform = ""; });
      const stage = asm.getBoundingClientRect();
      const view = document.documentElement.clientWidth;
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const [fx, fy, rot] = SCATTER[i % SCATTER.length];
        let dx = stage.left + stage.width * (0.5 + fx) - (r.left + r.width / 2);
        const dy = stage.top + stage.height * (0.5 + fy) - (r.top + r.height / 2);
        // nie über den Bildschirmrand hinaus
        dx = Math.max(12 - r.left, Math.min(view - 12 - r.right, dx));
        c.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot}deg) scale(0.96)`;
      });
    }

    function join() {
      played = true;
      const cards = $$(".a-card", asm);
      const from = cards.map((c) => c.style.transform);
      asm.classList.remove("is-scattered");
      asm.classList.add("is-joined");
      cards.forEach((c, i) => {
        c.style.transform = "";
        if (!from[i] || still) return;
        c.animate([{ transform: from[i] }, { transform: "none" }], {
          duration: 680, delay: i * 70, easing: "cubic-bezier(0.2, 0.7, 0.1, 1)", fill: "backwards",
        });
      });
    }

    renderAssembly();
    if (still || !("IntersectionObserver" in window)) {
      asm.classList.add("is-joined");
    } else {
      scatter();
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting && !played) join();
      }, { threshold: 0.55 });
      io.observe(asm);
      addEventListener("resize", () => { if (!played) scatter(); });
    }
    onTeamChange(() => {
      renderAssembly();
      // Mit dem neuen Team spielt der Moment beim nächsten Hinsehen erneut.
      if (!still && "IntersectionObserver" in window) { played = false; scatter(); }
      else asm.classList.add("is-joined");
    });
    $("[data-replay]").addEventListener("click", () => {
      if (still) return;
      scatter();
      requestAnimationFrame(() => requestAnimationFrame(join));
    });

  })();

  /* ---------------------------------------------------------------
     Echte offene Rollen (öffentliche Projekte) – ohne die große Supabase-Bibliothek
     --------------------------------------------------------------- */
  (async () => {
    const box = $("[data-live-roles]");
    if (!box) return;
    const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
    const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";   // öffentlich, Schutz über Row-Level-Security
    try {
      const url = `${SUPA}/rest/v1/project_roles?select=id,name,need,hours,project:projects!inner(id,title,closed)&filled=eq.false&project.closed=eq.false&order=created_at.desc&limit=6`;
      const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      if (!res.ok) return;                  // z. B. solange die Projekte-Tabellen noch fehlen
      const roles = await res.json();
      if (!Array.isArray(roles) || !roles.length) return;
      $("[data-live-list]", box).innerHTML = roles.map((r) => `<li><a class="live-role" href="projekte#p-${Number(r.project.id)}">
        <span class="live-role-name">${esc(r.name)}</span>
        ${r.need ? `<span class="live-role-need">${esc(r.need)}</span>` : ""}
        ${r.hours ? `<span class="live-role-hours">≈ ${Number(r.hours)} Std./Woche</span>` : ""}
        <span class="live-role-project">für <b>${esc(r.project.title)}</b></span>
      </a></li>`).join("");
      box.hidden = false;
    } catch { /* ohne Verbindung bleibt der Bereich einfach weg */ }
  })();

  /* ---------------------------------------------------------------
     Zähler der Warteliste: echte Zahl vom Server (Brevo), auch bei einem einzelnen Eintrag sichtbar
     --------------------------------------------------------------- */
  (() => {
    const box = $("[data-waitlist-count]");
    if (!box) return;
    let pending = false;
    async function refreshWaitlistCount() {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const res = await fetch("/api/waitlist-count?v=2", {
          headers: { Accept: "application/json" }, cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return;
        const { count } = await res.json();
        if (!Number.isSafeInteger(count) || count < 0) return;
        const num = $("[data-waitlist-number]", box);
        const value = count.toLocaleString("de-DE");
        if (num.textContent !== value) num.textContent = value;
        box.hidden = false;
      } catch { /* Bei Ausfällen bleibt die letzte bestätigte Zahl stehen. */ }
      finally { pending = false; }
    }
    refreshWaitlistCount();
    setInterval(refreshWaitlistCount, 15000);
    document.addEventListener("visibilitychange", refreshWaitlistCount);
    window.addEventListener("focus", refreshWaitlistCount);
    window.addEventListener("pageshow", refreshWaitlistCount);
    window.addEventListener("online", refreshWaitlistCount);
  })();

  /* ---------------------------------------------------------------
     Warteliste: Brevo mit Double-Opt-in, Eingabe bleibt auf der Seite
     --------------------------------------------------------------- */
  const WAITLIST_URL = "https://67406864.sibforms.com/serve/MUIFAP_vKT3wGvb_oCMmNCfxk9r4kS47ziUcgIjOp7ibD-hlikkWAA_l-Wo4pedNGsTJEc-yCsM1TIj41aX0dzDASKRcDC_ZxNn9envMBdU_zWmo7HHDj-FKtvyCz63RuFRQHleImiTRDarw8DCC1sKXSfU6F-RoppW0XftCBPzMdF-ch3vutYeokCLF5_Fzn5uooz6XScdhsGQS2w==?isAjax=1";
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const SUPA_KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";
  const rpc = (fn, args) => fetch(`${SUPA}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  // Karte zusammen mit der Anmeldung speichern (Supabase, nur für den Admin lesbar).
  // Rückgabe: null (nicht gespeichert) oder der Stand des Wunsch-Links: "", "ok", "taken", "invalid".
  async function sendCard(email, card, isPublic) {
    if (!card || !card.touched) return null;
    try {
      const res = await rpc("submit_waitlist_card", {
        p_email: email, p_name: (card.name || "").trim().slice(0, 24) || "Anonym", p_role: card.role,
        p_skills: (card.skills || []).slice(0, 4), p_hours: Math.max(1, Math.min(40, Number(card.hours) || 1)),
        p_looking: card.looking, p_pitch: (card.pitch || "").trim().slice(0, 120),
        p_lang: document.documentElement.lang === "en" ? "en" : "de",
        p_city: (card.city || "").trim().slice(0, 40), p_mode: card.mode || "", p_level: card.level || "", p_link: card.link || "",
        p_handle: card.handle || "",
        p_public: !!(isPublic && card.handle), p_design: card.design || null,
      });
      if (!res.ok) return /XYNTAL_MODERATION/.test(await res.text().catch(() => "")) ? "blocked" : null;
      const out = await res.json().catch(() => "");
      return typeof out === "string" ? out : "";
    } catch { return null; }
  }

  // Einladungen: ?ref=code aus dem Link merken, nach dem Eintragen gutschreiben
  const REF_KEY = "xyntal-ref", INVITE_KEY = "xyntal-einladung";
  try {
    const params = new URLSearchParams(location.search);
    const ref = (params.get("ref") || "").toLowerCase();
    if (/^[a-z0-9]{8}$/.test(ref)) localStorage.setItem(REF_KEY, ref);
    if (params.has("ref")) { params.delete("ref"); history.replaceState(null, "", location.pathname + (params.toString() ? `?${params}` : "") + location.hash); }
  } catch { /* geht auch ohne */ }
  const inviteBox = $("[data-invite]");
  function showInvite(code) {
    if (!inviteBox || !/^[a-z0-9]{8}$/.test(code || "")) return;
    const url = `https://xyntal.de/?ref=${code}`;
    inviteBox.innerHTML = `
      <div class="invite-head"><span class="lp-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H8a2.5 2.5 0 1 1 0-5c3 0 4 5 4 5zM12 7h4a2.5 2.5 0 1 0 0-5c-3 0-4 5-4 5z"/></svg></span><b>Lade Freunde ein</b></div>
      <p>Für jede Person, die sich über deinen Link einträgt und bestätigt, bekommst du 1 Woche gratis, sobald es Abos gibt.</p>
      <div class="invite-row"><input type="text" readonly value="${url}" aria-label="Dein Einladungslink" data-no-i18n><button type="button" class="btn btn-primary" data-invite-share>Link teilen</button></div>
      <p class="invite-count" data-invite-status role="status" aria-live="polite"></p>
      <p class="invite-count">Deine Karte später ändern? Leg mit derselben E-Mail ein Konto an: <a class="text-link" href="meine-karte">Meine Karte bearbeiten</a></p>`;
    inviteBox.hidden = false;
    const input = $("input", inviteBox), out = $("[data-invite-status]", inviteBox);
    input.addEventListener("focus", () => input.select());
    $("[data-invite-share]", inviteBox).addEventListener("click", async () => {
      const text = "Ich bin auf der Warteliste von Xyntal – der Plattform, auf der aus Ideen Teams werden. Trag dich auch ein:";
      try {
        if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Xyntal", text, url }); return; }
      } catch (err) { if (err && err.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(url); out.textContent = "Link kopiert."; }
      catch { input.focus(); input.select(); out.textContent = "Markiert – jetzt kopieren."; }
    });
  }
  try { showInvite(localStorage.getItem(INVITE_KEY)); } catch { /* egal */ }
  async function afterSignup(email) {
    let ref = ""; try { ref = localStorage.getItem(REF_KEY) || ""; } catch { /* egal */ }
    if (ref) rpc("track_referral", { p_email: email, p_code: ref }).catch(() => {});
    try {
      const res = await rpc("get_referral_code", { p_email: email });
      const code = res.ok ? await res.json() : "";
      if (typeof code === "string" && /^[a-z0-9]{8}$/.test(code)) {
        try { localStorage.setItem(INVITE_KEY, code); } catch { /* egal */ }
        showInvite(code);
      }
    } catch { /* ohne Einladungslink geht es auch */ }
  }

  const SENT = "Fast geschafft – bestätige jetzt deine E-Mail.";
  $$("[data-waitlist]").forEach((form) => {
    const status = $(".waitlist-status", form);
    const button = $('button[type="submit"]', form);
    const buttonLabel = button.textContent;
    // Mehrere Sätze als eigene Teile, damit jeder für sich übersetzt werden kann
    const setStatus = (text, kind = "") => {
      const parts = (Array.isArray(text) ? text : [text]).filter(Boolean);
      status.innerHTML = parts.map((p) => `<span>${esc(p)}</span>`).join(" ");
      status.className = "waitlist-status" + (kind ? ` is-${kind}` : "");
    };
    form.EMAIL.addEventListener("input", () => form.EMAIL.removeAttribute("aria-invalid"));
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = form.EMAIL.value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        form.EMAIL.setAttribute("aria-invalid", "true");
        setStatus("Bitte gib eine gültige E-Mail-Adresse ein.", "error");
        form.EMAIL.focus();
        return;
      }
      if (!form.OPT_IN.checked) {
        setStatus("Bitte bestätige, dass du Bescheid bekommen möchtest.", "error");
        form.OPT_IN.focus();
        return;
      }
      if (form.email_address_check.value) { setStatus(SENT, "ok"); return; } // Bots
      button.disabled = true;
      button.textContent = "Wird gesendet …";
      setStatus("");
      try {
        const body = new URLSearchParams({ EMAIL: email, OPT_IN: "1", email_address_check: "", locale: "de" });
        const res = await fetch(WAITLIST_URL, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || data.success !== true) throw new Error("waitlist");
        const parts = [SENT, `Öffne die E-Mail an ${email} und klicke auf den Bestätigungslink. Erst dann bist du auf der Warteliste.`, "Keine Mail gefunden? Warte ein paar Minuten und prüfe auch deinen Spam-Ordner."];
        if (form.SHARE_CARD?.checked && window.XyntalCard) {
          const card = window.XyntalCard();
          const isPublic = !!form.PUBLIC_CARD?.checked;
          const res = await sendCard(email, card, isPublic);
          if (res === "blocked") {
            parts.push("Deine Karte wurde nicht gespeichert: Sie enthält eine Beleidigung, Spam oder einen unsicheren Link.");
          } else if (res !== null) {
            parts.push("Deine Karte ist gespeichert.");
            if (res === "ok") parts.push(isPublic ? `Deine Karte ist jetzt unter xyntal.de/${card.handle} zu sehen.` : `Dein Link xyntal.de/${card.handle} ist reserviert.`);
            else if (res === "taken") parts.push(`xyntal.de/${card.handle} ist leider schon vergeben. Du kannst dir nach dem Start einen anderen aussuchen.`);
            else if (res === "invalid") parts.push("Dieser Wunsch-Link ist nicht verfügbar. Du kannst dir nach dem Start einen anderen aussuchen.");
          }
        }
        setStatus(parts, "ok");
        afterSignup(email);
        form.reset();
        status.setAttribute("tabindex", "-1");
        status.focus({ preventScroll: true });
        status.scrollIntoView({ behavior: still ? "instant" : "smooth", block: "nearest" });
      } catch {
        setStatus("Das hat gerade nicht geklappt. Bitte versuch es noch einmal.", "error");
      } finally {
        button.disabled = false;
        button.textContent = buttonLabel;
      }
    });
  });

  /* ---------------------------------------------------------------
     Einmaliges Einblenden und Linien zeichnen
     --------------------------------------------------------------- */
  const reveal = $$(".reveal, [data-draw]");
  if (still || !("IntersectionObserver" in window)) {
    reveal.forEach((el) => el.classList.add("is-visible", "is-drawn"));
  } else {
    const ro = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-visible");
        if (e.target.hasAttribute("data-draw")) e.target.classList.add("is-drawn");
        ro.unobserve(e.target);
      }
    }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });
    reveal.forEach((el) => ro.observe(el));
  }

  /* ---------------------------------------------------------------
     Hero: Kartenstapel, der von selbst wischt
     --------------------------------------------------------------- */
  (() => {
    const show = $("[data-hero-show]");
    if (!show) return;
    const deck = $("[data-hs-deck]", show);
    const toast = $("[data-hs-toast]", show);
    const toastName = $("[data-hs-toast-name]", show);
    const slots = $$("[data-hs-slots] i", show);
    const CARDS = [
      { n: "Lukas Brandl", r: "Mobile-Entwicklung", s: ["Swift", "Core ML"], h: 10, m: 99, yes: true },
      { n: "Jonas Wirth", r: "Brand-Design", s: ["Figma", "Albumcover"], h: 5, m: 86, yes: false },
      { n: "Mira Schreiner", r: "Produktdesign", s: ["Figma", "Motion"], h: 8, m: 99, yes: true },
      { n: "Ana Petrović", r: "Data Engineer", s: ["Python", "dbt"], h: 4, m: 79, yes: false },
      { n: "Felix Raab", r: "KI & Audio", s: ["PyTorch", "Audio-KI"], h: 8, m: 99, yes: true },
      { n: "David Neumann", r: "Growth-Marketing", s: ["Ads", "Analytics"], h: 10, m: 92, yes: false },
      { n: "Nina Berger", r: "Community & Creator", s: ["TikTok", "Songwriting"], h: 6, m: 99, yes: true },
    ];
    let i = 0, filled = 0, timer = 0, running = false;
    const card = (c, depth) => `<div class="hs-card" style="--d:${depth}">
        <span class="hs-stamp hs-yes">Ins Team</span><span class="hs-stamp hs-no">Weiter</span>
        <div class="hs-top"><span class="hs-av">${initials(c.n)}</span><div><b>${esc(c.n)}</b><span>${esc(c.r)}</span></div><em style="--p:${c.m}">${c.m}</em></div>
        <div class="hs-chips">${c.s.map((x) => `<i>${esc(x)}</i>`).join("")}</div>
        <div class="hs-meter"><span>Verfügbar</span><b>${c.h} Std./Woche</b></div>
        <div class="hs-bar"><i style="width:${Math.min(100, c.h * 10)}%"></i></div>
      </div>`;
    const render = () => {
      deck.innerHTML = [2, 1, 0].map((d) => card(CARDS[(i + d) % CARDS.length], d)).join("");
    };
    const step = () => {
      const top = deck.lastElementChild;
      const c = CARDS[i % CARDS.length];
      top.classList.add(c.yes ? "go-yes" : "go-no");
      if (c.yes) {
        setTimeout(() => {
          toastName.textContent = c.n.split(" ")[0];
          toast.classList.remove("on"); void toast.offsetWidth; toast.classList.add("on");
          if (filled >= slots.length) { slots.forEach((s) => { s.className = ""; s.textContent = ""; }); filled = 0; }
          const slot = slots[filled++];
          slot.textContent = initials(c.n); slot.className = "on";
        }, 280);
      }
      setTimeout(() => { i++; render(); }, 620);
    };
    render();
    if (still) { slots.slice(0, 2).forEach((s, k) => { s.className = "on"; s.textContent = initials(CARDS[k * 2].n); }); return; }
    const start = () => { if (running) return; running = true; timer = setInterval(step, 2300); };
    const stop = () => { running = false; clearInterval(timer); };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting && !document.hidden ? start() : stop())), { threshold: 0.2 }).observe(show);
    } else start();
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  })();

})();
