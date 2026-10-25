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
     Beispieldaten: Projekt „Feldnah“ (erfunden)
     --------------------------------------------------------------- */
  const FOUNDER = { name: "Jana Weiß", title: "Gründerin" };

  const ROLES = [
    { id: "mobile", name: "Mobile-Entwicklung", short: "Mobile", need: "App für iOS und Android, offline-fähig", hours: 10,
      task: { text: "Offline-Warenkorb prototypen", note: "Bestellen ohne Netz, später synchronisieren" },
      hello: "Ich schaue mir zuerst an, wie schlecht das Netz in den Hofläden wirklich ist." },
    { id: "design", name: "Produktdesign", short: "Design", need: "Bestellablauf, der für alle Generationen funktioniert", hours: 8,
      task: { text: "Bestellablauf mit drei Hofläden testen", note: "Papierprototyp, je 20 Minuten" },
      hello: "Ich kann Donnerstagabend für den Kickoff. Bringe erste Skizzen mit." },
    { id: "backend", name: "Backend & Daten", short: "Backend", need: "Bestellungen, Abholfenster, Bestand", hours: 8,
      task: { text: "Datenmodell für Abholfenster entwerfen", note: "Kapazität pro Hof und Zeitfenster" },
      hello: "Abholfenster sind im Kern Reservierungen. Ich skizziere das Modell bis Sonntag." },
    { id: "sales", name: "Vertrieb & Höfe", short: "Vertrieb", need: "Die ersten zehn Höfe gewinnen", hours: 6,
      task: { text: "Gesprächsleitfaden für Höfe schreiben", note: "Was überzeugt, was schreckt ab?" },
      hello: "Drei Höfe aus meinem Netzwerk würden einen Test mitmachen." },
  ];

  // c: [Fähigkeiten, Zeit, Arbeitsweise] – "ok" passt, "part" passt teilweise
  const PEOPLE = {
    mobile: [
      { id: "lukas", name: "Lukas Brandl", title: "Flutter-Entwickler, Werkstudent", place: "Regensburg", hours: 10, from: "ab sofort",
        skills: ["Flutter", "Firebase", "Offline-Sync"],
        reason: "Hat für einen Wochenmarkt-Verein eine Vorbestell-App gebaut. Offline-Sync kennt er genau aus dem Problem, das Höfe mit schwachem Netz haben.",
        c: [["ok", "Flutter, Offline-Sync"], ["ok", "10 von 10 Std."], ["ok", "vor Ort, abends"]] },
      { id: "sara", name: "Sara Öztürk", title: "React-Native-Entwicklerin, sechs Jahre Erfahrung", place: "Nürnberg · remote", hours: 6, from: "ab Dezember",
        skills: ["React Native", "TypeScript", "Zahlungen"],
        reason: "Bringt Erfahrung mit Zahlungen in Apps mit und kann die Architektur von Anfang an sauber aufsetzen. Hat weniger Zeit, als die Rolle braucht.",
        c: [["ok", "React Native, Zahlungen"], ["part", "6 von 10 Std."], ["ok", "remote, feste Termine"]] },
      { id: "tim", name: "Tim Hofer", title: "iOS-Entwickler, Quereinsteiger", place: "Cham", hours: 12, from: "ab sofort",
        skills: ["Swift", "SwiftUI", "MapKit"],
        reason: "Entwickelt bisher nur für iOS, kennt aber die Zielgruppe: Seine Familie betreibt selbst einen Hofladen.",
        c: [["part", "nur iOS"], ["ok", "12 von 10 Std."], ["ok", "hybrid"]] },
    ],
    design: [
      { id: "mira", name: "Mira Schreiner", title: "UX/UI-Designerin", place: "Regensburg", hours: 8, from: "ab sofort",
        skills: ["Figma", "Nutzertests", "Barrierefreiheit"],
        reason: "Hat Formulare für eine Plattform für ältere Menschen gestaltet und getestet – genau die Erfahrung, die ein Bestellablauf für Stammkundschaft vom Land braucht.",
        c: [["ok", "Abläufe, Nutzertests"], ["ok", "8 von 8 Std."], ["ok", "vor Ort"]] },
      { id: "jonas", name: "Jonas Wirth", title: "Brand- und Produktdesigner", place: "München · remote", hours: 5, from: "ab sofort",
        skills: ["Figma", "Branding", "Illustration"],
        reason: "Starke visuelle Handschrift für Marke und Verpackung. Mit App-Abläufen hat er bisher weniger gearbeitet.",
        c: [["part", "eher Marke als App"], ["part", "5 von 8 Std."], ["ok", "remote"]] },
      { id: "elena", name: "Elena Kraus", title: "Service-Designerin", place: "Landshut", hours: 10, from: "ab Januar",
        skills: ["Interviews", "Prototyping", "Workshops"],
        reason: "Könnte die Gespräche mit den Höfen strukturieren und daraus die ersten Abläufe ableiten. Startet erst im Januar.",
        c: [["ok", "Interviews, Prototypen"], ["ok", "10 von 8 Std."], ["part", "erst ab Januar"]] },
    ],
    backend: [
      { id: "felix", name: "Felix Raab", title: "Backend-Entwickler", place: "Regensburg", hours: 8, from: "ab sofort",
        skills: ["Node.js", "PostgreSQL", "Supabase"],
        reason: "Hat ein Buchungssystem für einen Kletterverein gebaut: Zeitfenster, Kapazitäten, Erinnerungen – fast dasselbe Modell wie Abholfenster.",
        c: [["ok", "Zeitfenster, PostgreSQL"], ["ok", "8 von 8 Std."], ["ok", "vor Ort, abends"]] },
      { id: "ana", name: "Ana Petrović", title: "Data Engineer", place: "Ingolstadt · remote", hours: 4, from: "ab sofort",
        skills: ["Python", "dbt", "Dashboards"],
        reason: "Für den Start zu wenig Zeit, aber ideal, sobald Höfe Auswertungen zu Absatz und Saison sehen wollen.",
        c: [["part", "Daten statt Backend"], ["part", "4 von 8 Std."], ["ok", "remote"]] },
      { id: "moritz", name: "Moritz Lang", title: "Full-Stack-Entwickler", place: "Regensburg", hours: 15, from: "ab Februar",
        skills: ["Django", "PostgreSQL", "Docker"],
        reason: "Hätte viel Zeit und passende Erfahrung – allerdings erst ab Februar, wenn der Prototyp schon stehen soll.",
        c: [["ok", "Python, PostgreSQL"], ["ok", "15 von 8 Std."], ["part", "erst ab Februar"]] },
    ],
    sales: [
      { id: "katharina", name: "Katharina Bauer", title: "Beraterin für Direktvermarktung", place: "Oberpfalz", hours: 6, from: "ab sofort",
        skills: ["Direktvermarktung", "Netzwerk", "Workshops"],
        reason: "Berät seit Jahren landwirtschaftliche Betriebe zur Direktvermarktung und kennt viele Höfe in der Region persönlich.",
        c: [["ok", "Höfe, Direktvermarktung"], ["ok", "6 von 6 Std."], ["ok", "vor Ort"]] },
      { id: "david", name: "David Neumann", title: "B2B-Vertrieb", place: "Regensburg", hours: 10, from: "ab sofort",
        skills: ["Akquise", "CRM", "Verhandlung"],
        reason: "Strukturiert und erfahren im Vertrieb, hat aber noch keine Kontakte in die Landwirtschaft.",
        c: [["part", "Vertrieb, keine Höfe"], ["ok", "10 von 6 Std."], ["ok", "hybrid"]] },
      { id: "lea", name: "Lea Zimmer", title: "Marketing-Studentin", place: "Regensburg", hours: 12, from: "ab sofort",
        skills: ["Social Media", "Fotografie", "Texte"],
        reason: "Kann die Geschichten der Höfe erzählen und Kundschaft erreichen. Beim direkten Verkauf an Höfe bräuchte sie Unterstützung.",
        c: [["part", "Marketing statt Vertrieb"], ["ok", "12 von 6 Std."], ["ok", "vor Ort"]] },
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
      <span class="stamp stamp-yes" aria-hidden="true">REIN</span>
      <span class="stamp stamp-no" aria-hidden="true">WEITER</span>
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
          <p class="ms-text">${esc(first)} will bei Feldnah als ${esc(roleById[p.role].name)} mitmachen.</p>
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

  // Ziehen mit Maus oder Finger
  function bindDrag() {
    const top = $(".swipe-card.is-top", els.people);
    if (!top) return;
    let x0 = 0, y0 = 0, dx = 0, dragging = false, id = null;
    top.addEventListener("pointerdown", (e) => {
      if (busy || e.button > 0) return;
      dragging = true; id = e.pointerId; x0 = e.clientX; y0 = e.clientY; dx = 0;
      top.setPointerCapture(id);
      top.classList.add("is-dragging");
    });
    top.addEventListener("pointermove", (e) => {
      if (!dragging || e.pointerId !== id) return;
      dx = e.clientX - x0;
      const dy = (e.clientY - y0) * 0.15;
      top.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      top.style.setProperty("--yes", Math.max(0, Math.min(1, dx / 110)));
      top.style.setProperty("--no", Math.max(0, Math.min(1, -dx / 110)));
    });
    const end = (e) => {
      if (!dragging || e.pointerId !== id) return;
      dragging = false;
      top.classList.remove("is-dragging");
      if (Math.abs(dx) > 110) decide(dx > 0);
      else { top.style.transform = ""; top.style.setProperty("--yes", 0); top.style.setProperty("--no", 0); }
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
        : "Ein Vorschlagsteam für Feldnah. Stell oben in der Demo dein eigenes zusammen – dann erscheint es hier.";
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
     Zähler der Warteliste: echte Zahl vom Server (Brevo), erst ab 10 Einträgen sichtbar
     --------------------------------------------------------------- */
  (async () => {
    const box = $("[data-waitlist-count]");
    if (!box) return;
    try {
      const res = await fetch("/api/waitlist-count", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const { count } = await res.json();
      if (!Number.isFinite(count) || count < 10) return;
      const num = $("[data-waitlist-number]", box);
      box.hidden = false;
      if (still) { num.textContent = count.toLocaleString("de-DE"); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 1200);
        num.textContent = Math.round(count * (1 - Math.pow(1 - k, 3))).toLocaleString("de-DE");
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch { /* ohne Zahl bleibt der Bereich einfach weg */ }
  })();

  /* ---------------------------------------------------------------
     Warteliste: Brevo mit Double-Opt-in, Eingabe bleibt auf der Seite
     --------------------------------------------------------------- */
  const WAITLIST_URL = "https://67406864.sibforms.com/serve/MUIFAP_vKT3wGvb_oCMmNCfxk9r4kS47ziUcgIjOp7ibD-hlikkWAA_l-Wo4pedNGsTJEc-yCsM1TIj41aX0dzDASKRcDC_ZxNn9envMBdU_zWmo7HHDj-FKtvyCz63RuFRQHleImiTRDarw8DCC1sKXSfU6F-RoppW0XftCBPzMdF-ch3vutYeokCLF5_Fzn5uooz6XScdhsGQS2w==?isAjax=1";
  const SENT = "Danke. Bitte prüfe dein Postfach und bestätige deine E-Mail-Adresse. Erst danach stehst du auf der Warteliste.";
  $$("[data-waitlist]").forEach((form) => {
    const status = $(".waitlist-status", form);
    const button = $("button", form);
    const setStatus = (text, kind = "") => { status.textContent = text; status.className = "waitlist-status" + (kind ? ` is-${kind}` : ""); };
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
        setStatus(SENT, "ok");
        form.reset();
      } catch {
        setStatus("Das hat gerade nicht geklappt. Bitte versuch es noch einmal.", "error");
      } finally {
        button.disabled = false;
        button.textContent = "Eintragen";
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
})();
