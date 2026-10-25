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
  (async () => {
    const box = $("[data-waitlist-count]");
    if (!box) return;
    try {
      const res = await fetch("/api/waitlist-count", { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const { count } = await res.json();
      if (!Number.isSafeInteger(count) || count < 0) return;
      const num = $("[data-waitlist-number]", box);
      num.textContent = count.toLocaleString("de-DE");
      box.hidden = false;
    } catch { /* ohne Zahl bleibt der Bereich einfach weg */ }
  })();

  /* ---------------------------------------------------------------
     Warteliste: Brevo mit Double-Opt-in, Eingabe bleibt auf der Seite
     --------------------------------------------------------------- */
  const WAITLIST_URL = "https://67406864.sibforms.com/serve/MUIFAP_vKT3wGvb_oCMmNCfxk9r4kS47ziUcgIjOp7ibD-hlikkWAA_l-Wo4pedNGsTJEc-yCsM1TIj41aX0dzDASKRcDC_ZxNn9envMBdU_zWmo7HHDj-FKtvyCz63RuFRQHleImiTRDarw8DCC1sKXSfU6F-RoppW0XftCBPzMdF-ch3vutYeokCLF5_Fzn5uooz6XScdhsGQS2w==?isAjax=1";
  // Karte zusammen mit der Anmeldung speichern (Supabase, nur für den Admin lesbar).
  // Fehlt die Tabelle noch, bleibt es still – die Anmeldung selbst hat ja geklappt.
  async function sendCard(email, card) {
    if (!card || !card.touched) return false;
    const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
    const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";
    try {
      const res = await fetch(`${SUPA}/rest/v1/rpc/submit_waitlist_card`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_email: email, p_name: (card.name || "").trim().slice(0, 24) || "Anonym", p_role: card.role,
          p_skills: (card.skills || []).slice(0, 4), p_hours: Math.max(1, Math.min(40, Number(card.hours) || 1)),
          p_looking: card.looking, p_pitch: (card.pitch || "").trim().slice(0, 120),
          p_lang: document.documentElement.lang === "en" ? "en" : "de",
        }),
      });
      return res.ok;
    } catch { return false; }
  }
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
        let note = "";
        if (form.SHARE_CARD?.checked && window.XyntalCard) {
          note = (await sendCard(email, window.XyntalCard())) ? " Deine Karte ist gespeichert." : "";
        }
        // Echte Platznummer: bestätigte Einträge laut Brevo + 1 (nur, wenn der Server eine Zahl liefert)
        let place = "";
        try {
          const r = await fetch("/api/waitlist-count", { headers: { Accept: "application/json" } });
          const n = r.ok ? (await r.json()).count : null;
          if (Number.isFinite(n) && n >= 0) place = ` Nach deiner Bestätigung bist du Nr. ${(n + 1).toLocaleString("de-DE")} auf der Warteliste.`;
        } catch { /* ohne Zahl kein Hinweis */ }
        setStatus(SENT + note + place, "ok");
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

  /* ---------------------------------------------------------------
     Profil-Builder: eigene Karte, live – bleibt nur in diesem Browser
     --------------------------------------------------------------- */
  (() => {
    const form = $("[data-builder]");
    if (!form) return;
    const STORE = "xyntal-karte";
    const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
    const SUGGEST = {
      "Entwicklung": ["Swift", "React", "Python", "Flutter", "Node.js"],
      "Design": ["Figma", "UX", "Branding", "Prototyping"],
      "Gründung": ["Strategie", "Finanzen", "Pitch", "Produkt"],
      "Vertrieb": ["Akquise", "Verhandlung", "CRM", "B2B"],
      "Marketing": ["TikTok", "Content", "SEO", "Ads"],
      "Daten & KI": ["Python", "LLMs", "SQL", "Machine Learning"],
    };
    const el = {
      name: $("#bf-name"), skill: $("#bf-skill"), hours: $("#bf-hours"), pitch: $("#bf-pitch"),
      skills: $("[data-bf-skills]"), suggest: $("[data-bf-suggest]"), hoursOut: $("[data-bf-hours-out]"),
      card: $("[data-my-card]"), mcInitial: $("[data-mc-initial]"), mcName: $("[data-mc-name]"), mcRole: $("[data-mc-role]"),
      mcSkills: $("[data-mc-skills]"), mcHours: $("[data-mc-hours]"), mcBar: $("[data-mc-bar]"), mcPitch: $("[data-mc-pitch]"), mcLooking: $("[data-mc-looking]"),
      status: $("[data-card-status]"), save: $("[data-card-save]"), saveLabel: $("[data-card-save-label]"), launch: $("[data-launch-card]"),
    };
    let data = { name: "", role: "Entwicklung", skills: [], hours: 8, looking: "Mitgründer:in", pitch: "", touched: false };
    try { const saved = JSON.parse(localStorage.getItem(STORE) || "null"); if (saved && typeof saved === "object") data = { ...data, ...saved }; } catch { /* egal */ }

    const radio = (name) => $(`input[name="${name}"]:checked`, form)?.value;
    const persist = () => {
      if (!data.touched) return;
      const box = $("[data-share-card]"); if (box) box.hidden = false;
      try { localStorage.setItem(STORE, JSON.stringify(data)); } catch { /* egal */ }
    };

    function renderChips() {
      $$(".bf-chip", el.skills).forEach((c) => c.remove());
      data.skills.forEach((s, k) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "bf-chip"; b.dataset.k = k;
        b.innerHTML = `${esc(s)}<span aria-hidden="true">×</span><span class="sr-only"> entfernen</span>`;
        el.skills.insertBefore(b, el.skill);
      });
      el.skill.hidden = data.skills.length >= 4;
      const opts = (SUGGEST[data.role] || []).filter((s) => !data.skills.includes(s)).slice(0, 4);
      el.suggest.innerHTML = data.skills.length >= 4 ? "" : opts.map((s) => `<button type="button" data-add="${esc(s)}">+ ${esc(s)}</button>`).join("");
    }

    function render() {
      const name = data.name.trim() || "Alex";
      el.mcName.textContent = name;
      el.mcInitial.textContent = name[0].toUpperCase();
      el.mcRole.textContent = data.role;
      el.mcSkills.innerHTML = (data.skills.length ? data.skills : (SUGGEST[data.role] || []).slice(0, 2)).map((s) => `<li>${esc(s)}</li>`).join("");
      el.mcSkills.classList.toggle("is-ghost", !data.skills.length);
      el.mcHours.textContent = `${data.hours} Std./Woche`;
      el.mcBar.style.width = `${Math.min(100, (data.hours / 20) * 100)}%`;
      el.hoursOut.textContent = `${data.hours} Std.`;
      el.mcPitch.textContent = data.pitch.trim() || "Ich baue eine KI-App für Musiker:innen.";
      el.mcPitch.classList.toggle("is-ghost", !data.pitch.trim());
      el.mcLooking.textContent = data.looking;
      el.card.classList.remove("pulse"); void el.card.offsetWidth; el.card.classList.add("pulse");
      // kleine Vorschau in der Warteliste
      if (el.launch && data.touched) {
        el.launch.hidden = false;
        el.launch.innerHTML = `<span class="mc-avatar">${esc(name[0].toUpperCase())}</span><span><b>${esc(name)}</b> · ${esc(data.role)}</span><span class="lc-ok">Karte bereit</span>`;
      }
    }

    function sync() {
      data.name = el.name.value; data.pitch = el.pitch.value; data.hours = Number(el.hours.value);
      data.role = radio("role") || data.role; data.looking = radio("looking") || data.looking;
      data.touched = true;
      persist(); render();
    }
    function addSkill(raw) {
      const s = raw.trim().replace(/\s+/g, " ").slice(0, 20);
      if (!s || data.skills.length >= 4 || data.skills.some((x) => x.toLowerCase() === s.toLowerCase())) return;
      data.skills.push(s); data.touched = true;
      persist(); renderChips(); render();
    }

    // Formular mit gespeicherten Werten füllen
    el.name.value = data.name; el.pitch.value = data.pitch; el.hours.value = data.hours;
    $$(`input[name="role"]`, form).forEach((r) => { r.checked = r.value === data.role; });
    $$(`input[name="looking"]`, form).forEach((r) => { r.checked = r.value === data.looking; });

    form.addEventListener("input", (e) => { if (e.target !== el.skill) sync(); });
    form.addEventListener("change", (e) => { if (e.target.type === "radio") { sync(); renderChips(); } });
    form.addEventListener("submit", (e) => e.preventDefault());
    el.skill.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addSkill(el.skill.value); el.skill.value = ""; }
      else if (e.key === "Backspace" && !el.skill.value && data.skills.length) { data.skills.pop(); persist(); renderChips(); render(); }
    });
    el.skill.addEventListener("blur", () => { if (el.skill.value.trim()) { addSkill(el.skill.value); el.skill.value = ""; } });
    el.skills.addEventListener("click", (e) => {
      const chip = e.target.closest(".bf-chip");
      if (chip) { data.skills.splice(Number(chip.dataset.k), 1); persist(); renderChips(); render(); el.skill.focus(); }
      else if (e.target === el.skills) el.skill.focus();
    });
    el.suggest.addEventListener("click", (e) => { const b = e.target.closest("[data-add]"); if (b) addSkill(b.dataset.add); });

    /* ---- Karte als Bild (PNG) zeichnen ---- */
    const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Arial, sans-serif';
    function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function wrap(g, text, maxW) {
      const words = text.split(" "), lines = []; let line = "";
      for (const w of words) { const test = line ? line + " " + w : w; if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line); return lines.slice(0, 3);
    }
    function drawCard() {
      const W = 1080, H = 1350, c = document.createElement("canvas");
      c.width = W; c.height = H; const g = c.getContext("2d");
      const grad = (x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, "#B95CFF"); gr.addColorStop(0.4, "#FF5FD2"); gr.addColorStop(0.7, "#5B8CFF"); gr.addColorStop(1, "#3FD8FF"); return gr; };
      g.fillStyle = "#07070B"; g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(200, 120, 0, 200, 120, 900); glow.addColorStop(0, "rgba(185,92,255,0.45)"); glow.addColorStop(1, "rgba(185,92,255,0)"); g.fillStyle = glow; g.fillRect(0, 0, W, H);
      const glow2 = g.createRadialGradient(W, H, 0, W, H, 800); glow2.addColorStop(0, "rgba(63,216,255,0.3)"); glow2.addColorStop(1, "rgba(63,216,255,0)"); g.fillStyle = glow2; g.fillRect(0, 0, W, H);
      // Karte
      const x = 90, y = 150, w = W - 180, h = 1000;
      g.save(); roundRect(g, x, y, w, h, 64); g.fillStyle = "#14141C"; g.fill(); g.lineWidth = 4; g.strokeStyle = grad(x, y, x + w, y + h); g.stroke(); g.restore();
      // Badge
      g.font = `600 30px ${FONT}`; const badge = t("Early Access"); const bw = g.measureText(badge).width + 56;
      roundRect(g, x + w - bw - 50, y + 50, bw, 58, 29); g.fillStyle = grad(x + w - bw, 0, x + w, 0); g.fill();
      g.fillStyle = "#fff"; g.textBaseline = "middle"; g.fillText(badge, x + w - bw - 22, y + 80);
      // Avatar
      roundRect(g, x + 60, y + 150, 170, 170, 48); g.fillStyle = grad(x + 60, y + 150, x + 230, y + 320); g.fill();
      const name = data.name.trim() || "Alex";
      g.fillStyle = "#fff"; g.font = `700 84px ${FONT}`; g.textAlign = "center"; g.fillText(name[0].toUpperCase(), x + 145, y + 238); g.textAlign = "left";
      g.font = `700 76px ${FONT}`; g.fillStyle = "#F5F5F7"; g.fillText(name, x + 270, y + 210);
      g.font = `500 40px ${FONT}`; g.fillStyle = "#A1A1AA"; g.fillText(t(data.role), x + 272, y + 285);
      // Skills
      let cx = x + 60, cy = y + 400; g.font = `500 36px ${FONT}`;
      for (const s of (data.skills.length ? data.skills : (SUGGEST[data.role] || []).slice(0, 2))) {
        const sw = g.measureText(s).width + 56; if (cx + sw > x + w - 60) { cx = x + 60; cy += 84; }
        roundRect(g, cx, cy, sw, 66, 33); g.fillStyle = "rgba(255,255,255,0.08)"; g.fill(); g.fillStyle = "#F5F5F7"; g.fillText(s, cx + 28, cy + 34); cx += sw + 16;
      }
      // Zeit
      cy += 130; g.font = `500 34px ${FONT}`; g.fillStyle = "#A1A1AA"; g.fillText(t("Zeit"), x + 60, cy);
      g.textAlign = "right"; g.fillStyle = "#F5F5F7"; g.font = `700 36px ${FONT}`; g.fillText(t(`${data.hours} Std./Woche`), x + w - 60, cy); g.textAlign = "left";
      roundRect(g, x + 60, cy + 36, w - 120, 14, 7); g.fillStyle = "rgba(255,255,255,0.08)"; g.fill();
      roundRect(g, x + 60, cy + 36, Math.max(30, (w - 120) * Math.min(1, data.hours / 20)), 14, 7); g.fillStyle = grad(x, 0, x + w, 0); g.fill();
      // Satz
      cy += 130; g.font = `600 44px ${FONT}`; g.fillStyle = "#F5F5F7";
      for (const line of wrap(g, data.pitch.trim() || t("Ich baue eine KI-App für Musiker:innen."), w - 120)) { g.fillText(line, x + 60, cy); cy += 58; }
      // Sucht
      cy += 40; g.font = `500 34px ${FONT}`; g.fillStyle = "#A1A1AA"; const sl = t("Sucht") + " "; g.fillText(sl, x + 60, cy);
      g.font = `700 34px ${FONT}`; g.fillStyle = grad(x + 60, 0, x + 600, 0); g.fillText(t(data.looking), x + 60 + g.measureText(sl).width + 10, cy);
      // Fuß
      g.font = `700 44px ${FONT}`; g.fillStyle = "#F5F5F7"; g.fillText("xyntal", x + 120, y + h - 70);
      g.save(); g.translate(x + 60, y + h - 92); g.scale(1.9, 1.9); g.strokeStyle = grad(0, 0, 24, 24); g.lineWidth = 2.8; g.lineCap = "round";
      g.beginPath(); g.moveTo(5, 5); g.lineTo(19, 19); g.moveTo(19, 5); g.lineTo(13.7, 10.3); g.moveTo(10.3, 13.7); g.lineTo(5, 19); g.stroke(); g.restore();
      g.textAlign = "right"; g.font = `500 34px ${FONT}`; g.fillStyle = "#A1A1AA"; g.fillText("xyntal.de", x + w - 60, y + h - 70); g.textAlign = "left";
      g.font = `700 54px ${FONT}`; g.fillStyle = grad(0, 0, W, 0); g.textAlign = "center"; g.fillText("Stop swiping. Start building.", W / 2, H - 90);
      return c;
    }

    el.save.addEventListener("click", async () => {
      const canvas = drawCard();
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      if (!blob) return;
      const file = new File([blob], "meine-xyntal-karte.png", { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) {
          await navigator.share({ files: [file], title: "Meine Xyntal-Karte", text: "Stop swiping. Start building. – xyntal.de" });
          el.status.textContent = t("Geteilt!");
          return;
        }
      } catch (err) { if (err && err.name === "AbortError") return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "meine-xyntal-karte.png";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      el.status.textContent = t("Bild gespeichert: meine-xyntal-karte.png");
    });
    $("[data-card-join]").addEventListener("click", () => setTimeout(() => $("#wl-email")?.focus({ preventScroll: true }), still ? 0 : 600));

    window.XyntalCard = () => ({ ...data });
    const shareBox = $("[data-share-card]");
    const showShare = () => { if (shareBox) shareBox.hidden = !data.touched; };
    form.addEventListener("input", showShare);
    form.addEventListener("change", showShare);
    renderChips(); render(); showShare();
    document.addEventListener("xyntal:lang", render);
  })();
})();
