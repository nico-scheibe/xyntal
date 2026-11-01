// Xyntal – interaktive Vorschau der Desktop-App mit Beispieldaten.
// Läuft komplett im Browser: kein Konto, keine Anfragen an einen Server, Zustand nur im Speicher.
// Eingebunden über <div data-app-demo></div> (Startseite und /demo). Texte stehen hier auf
// Deutsch und Englisch, weil das Wörterbuch aus i18n.js diesen Bereich überspringt (data-no-i18n).
(() => {
  const hosts = document.querySelectorAll("[data-app-demo]");
  if (!hosts.length) return;

  /* ---------- Sprache und kleine Helfer ---------- */
  const en = () => window.XyntalI18n?.get?.() === "en";
  const L = (v) => (Array.isArray(v) ? v[en() ? 1 : 0] : v);
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token"); } catch { /* privat */ }

  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    kanban: '<path d="M6 5v14M12 5v8M18 5v11"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14a5 5 0 0 1 3 5"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    hexagon: '<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    chevL: '<path d="m15 18-6-6 6-6"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
    send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.6 7.5 9 4.3-1.4 7.5-4.5 7.5-9V6z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    flag: '<path d="M5 21V4h11l-2 4 2 4H5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.5"/><path d="M4 4v4.5h4.5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    more: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    minus: '<path d="M5 12h14"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  };
  const icon = (n, cls = "") => `<svg class="xa-i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ""}</svg>`;
  const ring = (pct, size = 40, stroke = 4, label = true) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return `<span class="xa-ring${pct >= 100 ? " is-full" : ""}" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="xa-ring-bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="xa-ring-fg" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>${label ? `<b>${pct}%</b>` : ""}</span>`;
  };

  /* ---------- Beispieldaten ---------- */
  const PEOPLE = {
    LV: { name: "Lena Vogt", role: ["Gründerin", "Founder"], hue: "#007AFF" },
    JW: { name: "Jonas Weber", role: ["Backend", "Backend"], hue: "#45C99B" },
    AK: { name: "Aylin Kaya", role: ["Design", "Design"], hue: "#B36BFF" },
    MS: { name: "Mara Schulz", role: ["Marketing", "Marketing"], hue: "#D9A54E" },
    TB: { name: "Tim Berger", role: ["Frontend", "Frontend"], hue: "#3FE0F0" },
    SR: { name: "Sophie Roth", role: ["Produkt", "Product"], hue: "#E05E6D" },
  };
  const AREAS = [
    { id: "home", icon: "home", label: ["Start", "Home"] },
    { id: "focus", icon: "target", label: ["Fokus", "Focus"] },
    { id: "workspaces", icon: "grid", label: ["Arbeitsbereiche", "Workspaces"] },
    { id: "projects", icon: "kanban", label: ["Projekte", "Projects"] },
    { id: "messages", icon: "message", label: ["Nachrichten", "Messages"] },
    { id: "discover", icon: "compass", label: ["Entdecken", "Discover"] },
    { id: "communities", icon: "users", label: ["Communities", "Communities"] },
    { id: "files", icon: "folder", label: ["Dateien", "Files"] },
    { id: "ai", icon: "hexagon", label: ["KI-Center", "AI Center"] },
    { id: "automations", icon: "zap", label: ["Automationen", "Automations"] },
    { id: "calendar", icon: "calendar", label: ["Kalender", "Calendar"] },
  ];
  const DAYS = [["Mo", "Mon"], ["Di", "Tue"], ["Mi", "Wed"], ["Do", "Thu"], ["Fr", "Fri"], ["Sa", "Sat"], ["So", "Sun"]];
  const PRIO = { high: ["Hoch", "High"], mid: ["Mittel", "Medium"], low: ["Niedrig", "Low"] };

  const task = (id, title, prio, status, who, due) => ({ id, title, prio, status, who, due: due || null });
  const seed = () => ({
    route: { area: "home" }, back: [], fwd: [],
    collapsed: false, notifOpen: false, searchOpen: false,
    taskFilter: "all", wsFilter: "all", projFilter: "all",
    favs: { loopr: true },
    workspaces: [
      { id: "loopr", code: "LS", name: "Loopr Studio", hue: "#007AFF", desc: ["KI-App: Du summst, sie macht den Song.", "AI app: you hum, it makes the song."], owner: true, members: ["LV", "JW", "AK", "MS"], milestone: ["Closed Beta · 7. Nov.", "Closed beta · 7 Nov"], online: 3 },
      { id: "kiez", code: "KK", name: "Kiezkiste", hue: "#3FE0F0", desc: ["Tauschbörse für die Nachbarschaft.", "A swap market for your neighbourhood."], owner: false, members: ["LV", "TB", "SR"], milestone: ["MVP-Demo · 20. Nov.", "MVP demo · 20 Nov"], online: 1 },
    ],
    projects: [
      { id: "app", ws: "loopr", code: "AP", name: ["App-Prototyp", "App prototype"], hue: "#007AFF", desc: ["Summen aufnehmen, Melodie erkennen, Song erzeugen.", "Record humming, detect the melody, generate a song."], tasks: [
        task("t1", ["Onboarding-Screens finalisieren", "Finalise onboarding screens"], "high", "doing", "AK", ["Heute", "Today"]),
        task("t2", ["Audio-Upload auf Android testen", "Test audio upload on Android"], "high", "todo", "JW", ["Morgen", "Tomorrow"]),
        task("t3", ["Summen-zu-MIDI-Modelle vergleichen", "Compare hum-to-MIDI models"], "mid", "todo", "LV", ["Mi", "Wed"]),
        task("t4", ["TestFlight-Build hochladen", "Upload TestFlight build"], "mid", "todo", "JW", ["Fr", "Fri"]),
        task("t5", ["Aufnahme-Screen bauen", "Build recording screen"], "mid", "done", "AK"),
        task("t6", ["API-Schnittstelle festlegen", "Define the API contract"], "high", "done", "JW"),
      ] },
      { id: "launch", ws: "loopr", code: "BL", name: ["Beta-Launch", "Beta launch"], hue: "#45C99B", desc: ["Die ersten 50 Tester an Bord holen.", "Bring the first 50 testers on board."], tasks: [
        task("t7", ["Warteliste-Mail schreiben", "Write the waitlist email"], "high", "todo", "LV", ["Heute", "Today"]),
        task("t8", ["Feedback-Formular einrichten", "Set up the feedback form"], "mid", "doing", "MS", ["Mi", "Wed"]),
        task("t9", ["20 Beta-Tester einladen", "Invite 20 beta testers"], "mid", "todo", "LV", ["Do", "Thu"]),
        task("t10", ["Teaser-Video schneiden", "Edit the teaser video"], "low", "todo", "MS"),
        task("t11", ["Domain und Mailserver", "Domain and mail server"], "mid", "done", "JW"),
      ] },
      { id: "brand", ws: "loopr", code: "MA", name: ["Markenauftritt", "Brand identity"], hue: "#D3B787", desc: ["Logo, Farben und Tonalität für Loopr.", "Logo, colours and tone of voice for Loopr."], tasks: [
        task("t12", ["Logo-Varianten abstimmen", "Agree on logo variants"], "low", "todo", "AK"),
        task("t13", ["Farbpalette festlegen", "Define the colour palette"], "mid", "done", "AK"),
        task("t14", ["Tonalität für Texte", "Tone of voice for copy"], "low", "done", "MS"),
      ] },
      { id: "mvp", ws: "kiez", code: "MK", name: ["MVP Kiezkiste", "Kiezkiste MVP"], hue: "#3FE0F0", desc: ["Inserate, Chat und Abholung im Kiez.", "Listings, chat and pick-up in the neighbourhood."], tasks: [
        task("t15", ["Inserat-Formular bauen", "Build the listing form"], "high", "doing", "TB", ["Di", "Tue"]),
        task("t16", ["Karte mit Abholpunkten", "Map with pick-up points"], "mid", "todo", "SR", ["Fr", "Fri"]),
        task("t17", ["Nutzerinterviews auswerten", "Analyse user interviews"], "mid", "todo", "LV", ["Mi", "Wed"]),
        task("t18", ["Datenmodell entwerfen", "Design the data model"], "high", "done", "TB"),
      ] },
    ],
    milestones: [
      { name: ["Closed Beta", "Closed beta"], project: "launch", when: ["In 5 Tagen", "In 5 days"], soon: true },
      { name: ["MVP-Demo", "MVP demo"], project: "mvp", when: ["20. Nov.", "20 Nov"] },
      { name: ["Public Launch", "Public launch"], project: "app", when: ["15. Dez.", "15 Dec"] },
    ],
    convo: "team", chatFilter: "all", typing: null,
    convos: [
      { id: "team", group: true, name: "Team Loopr", members: ["LV", "JW", "AK", "MS"], unread: 2, msgs: [
        { from: "JW", at: "09:12", text: ["Moin! Der Upload-Endpunkt läuft jetzt auf Staging.", "Morning! The upload endpoint is now live on staging."] },
        { from: "AK", at: "09:15", text: ["Sehr gut. Ich lege die neuen Onboarding-Screens gleich in die Dateien.", "Great. I'll put the new onboarding screens into Files in a minute."] },
        { from: "MS", at: "09:31", text: ["Kurze Frage: Schaffen wir die Closed Beta am 7. November? Dann plane ich die Warteliste-Mail.", "Quick question: can we make the closed beta on 7 November? Then I'll schedule the waitlist email."] },
        { from: "JW", at: "09:33", text: ["Wenn der TestFlight-Build bis Freitag durch ist: ja.", "If the TestFlight build is through by Friday: yes."] },
      ], reply: { from: "MS", text: ["Perfekt, ich trage es in den Kalender ein. 🙌", "Perfect, I'll put it in the calendar. 🙌"] } },
      { id: "aylin", name: "Aylin Kaya", with: "AK", unread: 1, msgs: [
        { from: "AK", at: "10:02", text: ["Hast du kurz Zeit für das Design-Review? 15 Minuten reichen.", "Do you have a moment for the design review? 15 minutes is enough."] },
      ], reply: { from: "AK", text: ["Super, ich schicke dir den Link. Bis gleich!", "Great, I'll send you the link. See you in a bit!"] } },
      { id: "jonas", name: "Jonas Weber", with: "JW", unread: 0, msgs: [
        { from: "LV", at: ["Gestern", "Yesterday"], text: ["Kannst du dir die Fehlermeldung beim Login anschauen?", "Could you take a look at the login error?"] },
        { from: "JW", at: ["Gestern", "Yesterday"], text: ["Ist behoben, lag am Token-Refresh. 👍", "Fixed, it was the token refresh. 👍"] },
      ], reply: { from: "JW", text: ["Klingt gut, ich schaue es mir heute Abend an.", "Sounds good, I'll look at it tonight."] } },
      { id: "kiez", group: true, name: "Kiezkiste-Team", members: ["LV", "TB", "SR"], unread: 0, msgs: [
        { from: "TB", at: ["Fr", "Fri"], text: ["Das Inserat-Formular ist zu 80 % fertig.", "The listing form is 80% done."] },
        { from: "SR", at: ["Fr", "Fri"], text: ["Ich habe drei Abholpunkte im Kiez angefragt.", "I've asked three pick-up points in the neighbourhood."] },
      ], reply: { from: "TB", text: ["Stark! Ich baue sie in die Karte ein.", "Nice! I'll add them to the map."] } },
    ],
    role: "all", builder: "noah", connected: {},
    builders: [
      { id: "noah", name: "Noah Becker", kind: "dev", role: ["iOS-Entwickler", "iOS developer"], city: "Leipzig", hours: 10, skills: ["Swift", "SwiftUI", "Core Audio"], score: 94,
        f: [96, 90, 92, 88, 72], sum: ["Noah hat zwei Audio-Apps veröffentlicht und sucht ein Nebenprojekt mit Musik. Genau diese Lücke hat das Loopr-Team.", "Noah has shipped two audio apps and wants a music side project. That's exactly the gap in the Loopr team."], next: ["Frag ihn nach seiner Erfahrung mit Core Audio.", "Ask him about his Core Audio experience."], risk: ["Er hat meist nur abends Zeit.", "He's mostly free in the evenings."] },
      { id: "emre", name: "Emre Yıldız", kind: "dev", role: ["ML-Engineer", "ML engineer"], city: "Berlin", hours: 12, skills: ["Python", "PyTorch", "Audio-ML"], score: 91,
        f: [94, 85, 90, 84, 88], sum: ["Emre hat an Melodie-Erkennung geforscht. Er könnte das Summen-zu-MIDI-Modell von Loopr deutlich verbessern.", "Emre has researched melody detection. He could noticeably improve Loopr's hum-to-MIDI model."], next: ["Teile die Modellvergleiche aus dem App-Prototyp.", "Share the model comparisons from the app prototype."], risk: ["Will Anteile statt Honorar, das sollte früh geklärt sein.", "Prefers equity over a fee, which should be settled early."] },
      { id: "lea", name: "Lea Hoffmann", kind: "design", role: ["Produktdesignerin", "Product designer"], city: "Hamburg", hours: 8, skills: ["Figma", ["Design-Systeme", "Design systems"], "UX-Research"], score: 89,
        f: [88, 92, 86, 94, 80], sum: ["Lea baut seit Jahren Design-Systeme und mag frühe Produkte. Sie würde Aylin beim Onboarding entlasten.", "Lea has built design systems for years and likes early products. She'd take load off Aylin for onboarding."], next: ["Lade sie zum Design-Review am Montag ein.", "Invite her to Monday's design review."], risk: ["Überschneidet sich teils mit Aylins Rolle.", "Partly overlaps with Aylin's role."] },
      { id: "mia", name: "Mia Schröder", kind: "music", role: ["Musikproduzentin", "Music producer"], city: "Wien", hours: 5, skills: ["Ableton", "Sounddesign", "Mixing"], score: 86,
        f: [92, 70, 90, 82, 76], sum: ["Mia produziert für Indie-Künstler und könnte prüfen, ob die erzeugten Songs gut klingen.", "Mia produces for indie artists and could check whether the generated songs sound good."], next: ["Schick ihr drei Beispiel-Songs aus der App.", "Send her three sample songs from the app."], risk: ["Nur 5 Std. pro Woche.", "Only 5 hours a week."] },
      { id: "clara", name: "Clara Neumann", kind: "growth", role: ["Growth & Community", "Growth & community"], city: "Köln", hours: 6, skills: ["Content", "TikTok", "Newsletter"], score: 82,
        f: [84, 78, 88, 80, 82], sum: ["Clara hat eine Musik-Community mit 12.000 Mitgliedern aufgebaut. Für den Beta-Launch ein starker Hebel.", "Clara grew a music community to 12,000 members. A strong lever for the beta launch."], next: ["Zeig ihr den Plan für die Closed Beta.", "Show her the plan for the closed beta."], risk: ["Arbeitet lieber asynchron.", "Prefers to work asynchronously."] },
      { id: "paul", name: "Paul Richter", kind: "dev", role: ["Backend-Entwickler", "Backend developer"], city: "München", hours: 15, skills: ["Go", "PostgreSQL", "APIs"], score: 78,
        f: [70, 94, 76, 80, 84], sum: ["Paul hat viel Zeit und Erfahrung mit APIs. Mit Jonas ist das Backend aber schon gut besetzt.", "Paul has lots of time and API experience. With Jonas the backend is already well covered, though."], next: ["Behalte ihn für die Skalierung nach dem Launch im Blick.", "Keep him in mind for scaling after launch."], risk: ["Skills überschneiden sich mit Jonas.", "Skills overlap with Jonas."] },
    ],
    commFilter: "all",
    communities: [
      { id: "indie", name: "Indie Hacker DACH", letter: "I", hue: "#007AFF", members: 1239, joined: true, desc: ["Bauen, launchen, Zahlen teilen. Jeden Freitag Show & Tell.", "Build, launch, share numbers. Show & tell every Friday."], tags: ["SaaS", "Bootstrapping"] },
      { id: "audio", name: ["Audio- & Musik-Tech", "Audio & music tech"], letter: "A", hue: "#B36BFF", members: 310, joined: false, rec: true, desc: ["Für alle, die Software rund um Klang und Musik bauen.", "For everyone building software around sound and music."], tags: ["Audio", "DSP"] },
      { id: "design", name: "Design & UX", letter: "D", hue: "#3FE0F0", members: 979, joined: true, desc: ["Austausch zu Design-Fragen, Reviews und Portfolios.", "Design questions, reviews and portfolios."], tags: ["Figma", "UX"] },
      { id: "ai", name: ["KI-Produkte bauen", "Building AI products"], letter: "K", hue: "#45C99B", members: 1560, joined: false, rec: true, desc: ["Von der Idee zum KI-Feature, das Menschen wirklich nutzen.", "From idea to an AI feature people actually use."], tags: ["LLM", ["Prototyping", "Prototyping"]] },
      { id: "nocode", name: "No-Code Builder", letter: "N", hue: "#D9A54E", members: 870, joined: false, desc: ["Schnell bauen ohne Code: Tools, Tricks und Vorlagen.", "Build fast without code: tools, tricks and templates."], tags: ["Webflow", "Make"] },
    ],
    events: [
      { id: "kick", title: ["Beta-Kickoff", "Beta kickoff"], when: ["Di, 3. Nov. · 10:00", "Tue, 3 Nov · 10:00"], going: true },
      { id: "show", title: ["Show & Tell: Audio-Apps", "Show & tell: audio apps"], when: ["Do, 5. Nov. · 18:30", "Thu, 5 Nov · 18:30"], going: false },
      { id: "pitch", title: ["Pitch-Feedback-Runde", "Pitch feedback round"], when: ["Do, 12. Nov. · 19:00", "Thu, 12 Nov · 19:00"], going: false },
    ],
    fileView: "all", fileType: "all", fileQuery: "", fileSel: null, fileStars: { plan: true },
    files: [
      { id: "screens", name: "Onboarding-Screens.fig", type: "image", ws: "Loopr Studio", owner: "AK", size: "4,2 MB", at: ["Heute, 09:16", "Today, 09:16"], recent: true },
      { id: "plan", name: "Beta-Plan.pdf", type: "doc", ws: "Loopr Studio", owner: "LV", size: "380 KB", at: ["Gestern", "Yesterday"], recent: true },
      { id: "deck", name: "Pitch-Deck-v3.pdf", type: "doc", ws: "Loopr Studio", owner: "LV", size: "2,8 MB", at: ["28.10.26", "28/10/26"] },
      { id: "hum", name: "Demo-Summen.m4a", type: "audio", ws: "Loopr Studio", owner: "JW", size: "1,1 MB", at: ["Heute, 08:40", "Today, 08:40"], recent: true },
      { id: "teaser", name: "Teaser-Video.mp4", type: "video", ws: "Loopr Studio", owner: "MS", size: "48 MB", at: ["30.10.26", "30/10/26"] },
      { id: "logo", name: "Logo-Varianten.png", type: "image", ws: "Loopr Studio", owner: "AK", size: "860 KB", at: ["27.10.26", "27/10/26"] },
      { id: "interviews", name: "Nutzerinterviews.docx", type: "doc", ws: "Kiezkiste", owner: "SR", size: "210 KB", at: ["29.10.26", "29/10/26"] },
    ],
    ai: [], aiBusy: false, aiTab: "chat",
    autoTab: "list",
    autos: [
      { id: "a1", name: ["Aufgabe mit Frist → Fokusblock im Kalender", "Task with a due date → focus block in the calendar"], when: ["Wenn eine Aufgabe eine Frist bekommt", "When a task gets a due date"], on: true, runs: 42, saves: 4 },
      { id: "a2", name: ["Wöchentliches Team-Update per KI", "Weekly AI team update"], when: ["Jeden Freitag, 16:00", "Every Friday, 16:00"], on: true, runs: 4, saves: 20 },
      { id: "a3", name: ["Datei hochgeladen → Projekt benachrichtigen", "File uploaded → notify the project"], when: ["Wenn eine Datei in einem Arbeitsbereich landet", "When a file lands in a workspace"], on: true, runs: 17, saves: 2 },
      { id: "a4", name: ["Neues Match → Willkommensnachricht", "New match → welcome message"], when: ["Wenn ihr beide Ja sagt", "When you both say yes"], on: false, runs: 0, saves: 3 },
    ],
    templates: [
      { id: "tp1", name: ["Überfällige Aufgaben → Erinnerung im Chat", "Overdue tasks → reminder in chat"], when: ["Täglich, 09:00", "Daily, 09:00"], saves: 3 },
      { id: "tp2", name: ["Meilenstein erreicht → Glückwunsch ans Team", "Milestone reached → congratulate the team"], when: ["Wenn ein Meilenstein 100 % erreicht", "When a milestone reaches 100%"], saves: 2 },
      { id: "tp3", name: ["Neue Bewerbung → Zusammenfassung per KI", "New application → AI summary"], when: ["Wenn sich jemand auf eine Rolle bewirbt", "When someone applies for a role"], saves: 6 },
    ],
    autoLog: [
      { name: ["Wöchentliches Team-Update per KI", "Weekly AI team update"], at: ["Fr, 16:00", "Fri, 16:00"], ok: true },
      { name: ["Datei hochgeladen → Projekt benachrichtigen", "File uploaded → notify the project"], at: ["Fr, 11:24", "Fri, 11:24"], ok: true },
      { name: ["Aufgabe mit Frist → Fokusblock im Kalender", "Task with a due date → focus block in the calendar"], at: ["Do, 17:05", "Thu, 17:05"], ok: true },
    ],
    cal: {
      day: 0, sel: null, view: "week", hidden: {},
      events: [
        { id: "e1", day: 0, s: 9, e: 9.5, kind: "work", title: ["Daily Stand-up", "Daily stand-up"] },
        { id: "e2", day: 0, s: 11, e: 11.5, kind: "work", title: ["Design-Review mit Aylin", "Design review with Aylin"] },
        { id: "e3", day: 0, s: 14, e: 16, kind: "focus", title: ["Fokus: Warteliste-Mail", "Focus: waitlist email"] },
        { id: "e4", day: 1, s: 9, e: 9.5, kind: "work", title: ["Daily Stand-up", "Daily stand-up"] },
        { id: "e5", day: 1, s: 10, e: 11, kind: "personal", title: ["Beta-Kickoff (Community)", "Beta kickoff (community)"] },
        { id: "e6", day: 1, s: 15, e: 16.5, kind: "focus", title: ["Fokus: Modellvergleich", "Focus: model comparison"] },
        { id: "e7", day: 2, s: 9, e: 9.5, kind: "work", title: ["Daily Stand-up", "Daily stand-up"] },
        { id: "e8", day: 2, s: 13, e: 14, kind: "work", title: ["Nutzerinterview Kiezkiste", "Kiezkiste user interview"] },
        { id: "e9", day: 3, s: 9, e: 9.5, kind: "work", title: ["Daily Stand-up", "Daily stand-up"] },
        { id: "e10", day: 3, s: 17, e: 18, kind: "personal", title: ["Laufen am Kanal", "Run along the canal"] },
        { id: "e11", day: 4, s: 10, e: 12, kind: "focus", title: ["Fokus: TestFlight-Build", "Focus: TestFlight build"] },
        { id: "e12", day: 4, s: 16, e: 16.5, kind: "work", title: ["Team-Update", "Team update"] },
        { id: "e13", day: 5, s: 9, e: 10, kind: "milestone", title: ["Closed Beta startet", "Closed beta starts"] },
      ],
    },
    focus: { running: false, left: 3000, total: 3000, spent: 0, task: null, blocks: { slack: true, msgs: true, pings: true, cal: false }, done: 0 },
  });

  /* ---------- Abgeleitete Werte ---------- */
  const allTasks = (s) => s.projects.flatMap((p) => p.tasks.map((t) => ({ t, p })));
  const pct = (p) => (p.tasks.length ? Math.round((p.tasks.filter((t) => t.status === "done").length / p.tasks.length) * 100) : 0);
  const openOf = (p) => p.tasks.filter((t) => t.status !== "done").length;
  const unread = (s) => s.convos.reduce((n, c) => n + c.unread, 0);
  const proj = (s, id) => s.projects.find((p) => p.id === id);
  const focusTask = (s) => {
    const all = allTasks(s).filter((x) => x.t.status !== "done");
    return all.find((x) => x.t.id === s.focus.task) || all.find((x) => x.t.prio === "high" && x.t.who === "LV") || all.find((x) => x.t.prio === "high") || all[0] || null;
  };
  const avatar = (code, size = "") => {
    const p = PEOPLE[code] || { name: code, hue: "#007AFF" };
    return `<span class="xa-av ${size}" style="--h:${p.hue}" title="${esc(p.name)}" aria-hidden="true">${esc(code)}</span>`;
  };
  const nowTime = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  /* ---------- Bereiche ---------- */
  const pageHead = (title, sub, actions = "") => `<header class="xa-ph"><div><h3 class="xa-title" tabindex="-1" data-k="title">${title}</h3>${sub ? `<p class="xa-sub">${sub}</p>` : ""}</div>${actions ? `<div class="xa-ph-act">${actions}</div>` : ""}</header>`;
  const chips = (act, items, current, label) => `<div class="xa-chips" role="group" aria-label="${esc(label)}">${items.map(([id, text, count]) => `<button type="button" class="xa-chip" data-act="${act}" data-v="${id}" data-k="${act}-${id}" aria-pressed="${current === id}">${text}${count !== undefined ? ` <span>${count}</span>` : ""}</button>`).join("")}</div>`;
  const taskRow = (t, p, opts = {}) => {
    const done = t.status === "done";
    return `<li class="xa-task${done ? " is-done" : ""}">
      <label class="xa-check"><input type="checkbox" data-act="task" data-id="${t.id}" data-k="task-${t.id}"${done ? " checked" : ""}><span class="xa-box" aria-hidden="true">${icon("check")}</span><span class="xa-task-t">${esc(L(t.title))}</span></label>
      <span class="xa-task-meta">${opts.noProject ? "" : `<span class="xa-dot" style="--h:${p.hue}"></span>${esc(L(p.name))}`}${t.due && !done ? `<span class="xa-due">${esc(L(t.due))}</span>` : ""}<span class="xa-prio xa-prio-${t.prio}">${L(PRIO[t.prio])}</span>${avatar(t.who, "xa-av-sm")}</span>
    </li>`;
  };

  function viewHome(s) {
    const tasks = allTasks(s);
    const open = tasks.filter((x) => x.t.status !== "done");
    const projOpen = new Set(open.map((x) => x.p.id)).size;
    const u = unread(s);
    const ft = focusTask(s);
    const mine = tasks.filter((x) => x.t.who === "LV" && (s.taskFilter === "all" || x.t.prio === s.taskFilter));
    return `${pageHead(T("Guten Morgen, Lena", "Good morning, Lena"), T(`Montag, 2. November · ${u} ungelesene Nachrichten · ${s.milestones.length} bevorstehende Meilensteine`, `Monday, 2 November · ${u} unread messages · ${s.milestones.length} upcoming milestones`),
      `<button type="button" class="xa-btn" data-act="go" data-area="ai" data-k="h-ask">${icon("sparkle")}${T("Xyntal fragen", "Ask Xyntal")}</button><button type="button" class="xa-btn xa-primary" data-act="newtask" data-k="h-new">${icon("plus")}${T("Neuer Task", "New task")}</button>`)}
    <div class="xa-grid xa-g2">
      <div class="xa-card"><h4 class="xa-kicker">${T("Tägliches Briefing", "Daily briefing")}</h4>
        <p class="xa-strong">${T("Schön, dass du da bist, Lena.", "Good to see you, Lena.")}</p>
        <ul class="xa-bullets">
          <li style="--h:#007AFF">${T(`${open.length} offene Aufgaben in ${projOpen} Projekten.`, `${open.length} open tasks across ${projOpen} projects.`)}</li>
          <li style="--h:#D9A54E">${T("Nächster Meilenstein: Closed Beta (Beta-Launch) in 5 Tagen.", "Next milestone: closed beta (beta launch) in 5 days.")}</li>
          <li style="--h:#45C99B">${u ? T(`${u} ungelesene Nachrichten. Aylin wartet auf eine Antwort.`, `${u} unread messages. Aylin is waiting for a reply.`) : T("Alle Nachrichten gelesen. Stark.", "All messages read. Nice.")}</li>
        </ul>
        <button type="button" class="xa-link" data-act="go" data-area="messages" data-k="h-msgs">${T("Zu den Nachrichten", "Go to messages")} ${icon("arrowR")}</button>
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Fokus heute", "Focus today")}</h4>
        ${ft ? `<span class="xa-icon-tile">${icon("target")}</span><p class="xa-strong">${esc(L(ft.t.title))}</p><p class="xa-muted">${esc(L(ft.p.name))} · ${L(PRIO[ft.t.prio])}${ft.t.due ? ` · ${T("fällig", "due")} ${esc(L(ft.t.due))}` : ""}</p>
          <div class="xa-row"><button type="button" class="xa-btn xa-primary" data-act="focus-start" data-k="h-focus">${icon("play")}${T("50 Min Fokus starten", "Start 50 min focus")}</button></div>`
        : `<span class="xa-icon-tile">${icon("check")}</span><p class="xa-strong">${T("Nichts auf dem Tisch", "Nothing on your plate")}</p><p class="xa-muted">${T("Alle Aufgaben erledigt. Zeit für eine Pause.", "All tasks done. Time for a break.")}</p>`}
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Projektgesundheit", "Project health")}</h4>
        <ul class="xa-rows">${s.projects.map((p) => `<li><button type="button" class="xa-rowbtn" data-act="project" data-id="${p.id}" data-k="h-p-${p.id}">${ring(pct(p))}<span class="xa-grow"><b>${esc(L(p.name))}</b><small>${T(`${openOf(p)} offen · ${p.tasks.length - openOf(p)}/${p.tasks.length} erledigt`, `${openOf(p)} open · ${p.tasks.length - openOf(p)}/${p.tasks.length} done`)}</small></span><span class="xa-big" style="color:${pct(p) === 100 ? "var(--xa-ok)" : "var(--xa-text)"}">${pct(p)}%</span></button></li>`).join("")}</ul>
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Bevorstehende Meilensteine", "Upcoming milestones")}</h4>
        <ul class="xa-rows">${s.milestones.map((m) => { const p = proj(s, m.project); return `<li><div class="xa-rowbtn xa-static">${ring(pct(p))}<span class="xa-grow"><b>${esc(L(m.name))}</b><small>${esc(L(p.name))}</small></span><span class="xa-pill ${m.soon ? "xa-warn" : ""}">${esc(L(m.when))}</span></div></li>`; }).join("")}</ul>
      </div>
    </div>
    <div class="xa-grid xa-g-wide">
      <div class="xa-card"><h4 class="xa-kicker">${T("Meine Tasks", "My tasks")}</h4>
        ${chips("taskfilter", [["all", T("Alle", "All")], ["high", T("Hoch", "High")], ["mid", T("Mittel", "Medium")], ["low", T("Niedrig", "Low")]], s.taskFilter, T("Nach Priorität filtern", "Filter by priority"))}
        ${mine.length ? `<ul class="xa-tasks">${mine.map((x) => taskRow(x.t, x.p)).join("")}</ul>` : `<p class="xa-empty">${T("Keine Tasks mit dieser Priorität.", "No tasks with this priority.")}</p>`}
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Schnellaktionen", "Quick actions")}</h4>
        <div class="xa-quick">
          <button type="button" data-act="ws" data-id="loopr" data-k="q1"><span class="xa-icon-tile">${icon("grid")}</span><span><b>${T("Arbeitsbereich öffnen", "Open workspace")}</b><small>Loopr Studio</small></span></button>
          <button type="button" data-act="go" data-area="discover" data-k="q2"><span class="xa-icon-tile xa-t-cyan">${icon("compass")}</span><span><b>${T("Passende Leute finden", "Find matching people")}</b><small>${T("6 neue Vorschläge", "6 new suggestions")}</small></span></button>
          <button type="button" data-act="go" data-area="calendar" data-k="q3"><span class="xa-icon-tile xa-t-ok">${icon("calendar")}</span><span><b>${T("Woche planen", "Plan the week")}</b><small>${T(`${s.cal.events.length} Termine`, `${s.cal.events.length} events`)}</small></span></button>
        </div>
        <div class="xa-beta-cta"><b>${T("Gefällt dir das?", "Like what you see?")}</b><span>${T("Die echte App gibt es gerade für Beta-Tester.", "The real app is available to beta testers right now.")}</span>${ctaLinks("xa-btn xa-primary", "xa-link")}</div>
      </div>
    </div>`;
  }

  function viewFocus(s) {
    const ft = focusTask(s);
    const f = s.focus;
    const queue = allTasks(s).filter((x) => x.t.status !== "done" && (!ft || x.t.id !== ft.t.id)).slice(0, 4);
    const today = 1.2 + f.spent / 3600;
    const week = [2.1, 1.4, 3.2, 2.6, 0.5, 0, today];
    const labels = [["Di", "Tue"], ["Mi", "Wed"], ["Do", "Thu"], ["Fr", "Fri"], ["Sa", "Sat"], ["So", "Sun"], ["Mo", "Mon"]];
    const max = Math.max(4, ...week);
    const blocks = [["slack", T("Slack-Benachrichtigungen", "Slack notifications"), "message"], ["msgs", T("Nachrichten", "Messages"), "message"], ["pings", T("Community-Pings", "Community pings"), "users"], ["cal", T("Kalender-Popups", "Calendar pop-ups"), "calendar"]];
    const allOn = Object.values(f.blocks).every(Boolean);
    return `${pageHead(T("Fokus", "Focus"), T("Schütze Deep Work und erledige, was heute zählt.", "Protect deep work and get done what matters today."),
      `<button type="button" class="xa-btn" data-act="blocks-all" data-k="f-pause" aria-pressed="${allOn}">${allOn ? T("Benachrichtigungen pausiert", "Notifications paused") : T("Benachrichtigungen pausieren", "Pause notifications")}</button><button type="button" class="xa-btn xa-primary" data-act="focus-toggle" data-k="f-top">${icon(f.running ? "pause" : "play")}${f.running ? T("Pausieren", "Pause") : f.left < f.total ? T("Fortsetzen", "Resume") : T("50 Min starten", "Start 50 min")}</button>`)}
    <div class="xa-grid xa-g3">
      <div class="xa-card xa-span2"><h4 class="xa-kicker">${T("Aktuelle Session", "Current session")}</h4>
        <div class="xa-session">
          <div class="xa-timer" data-timer-ring>${timerRing(f)}</div>
          <div class="xa-grow">
            <p class="xa-strong xa-lg">${ft ? esc(L(ft.t.title)) : T("Alles erledigt", "All done")}</p>
            <p class="xa-muted">${icon("folder")} ${ft ? esc(L(ft.p.name)) : "–"}</p>
            <div class="xa-row xa-tags"><span class="xa-tag xa-tag-acc">${T("50-Min-Block", "50-min block")}</span><span class="xa-tag">${T("Deep-Work-Session", "Deep work session")}</span></div>
            <div class="xa-row">
              <button type="button" class="xa-btn xa-primary" data-act="focus-toggle" data-k="f-main">${icon(f.running ? "pause" : "play")}${f.running ? T("Pausieren", "Pause") : f.left < f.total ? T("Fortsetzen", "Resume") : T("Starten", "Start")}</button>
              <button type="button" class="xa-btn" data-act="focus-reset" data-k="f-reset">${icon("reset")}${T("Zurücksetzen", "Reset")}</button>
              ${ft ? `<button type="button" class="xa-btn" data-act="focus-done" data-k="f-done">${icon("check")}${T("Task erledigt", "Task done")}</button>` : ""}
            </div>
          </div>
        </div>
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Wissenswert", "Worth knowing")}</h4>
        <ul class="xa-tips">
          <li><span class="xa-icon-tile">${icon("message")}</span><span><b>${T("Aktualisieren", "Catch up")}</b><small>${unread(s) ? T(`${unread(s)} ungelesene Nachrichten, jemand wartet vielleicht auf dich.`, `${unread(s)} unread messages, someone might be waiting for you.`) : T("Keine ungelesenen Nachrichten.", "No unread messages.")}</small></span></li>
          <li><span class="xa-icon-tile xa-t-warn">${icon("zap")}</span><span><b>${T("Energie-Vorschlag", "Energy tip")}</b><small>${T("Deine produktivste Zeit liegt zwischen 9 und 12 Uhr. Plane dort den nächsten Block.", "Your most productive time is 9 to 12. Put the next block there.")}</small></span></li>
        </ul>
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Danach", "Up next")}</h4>
        ${queue.length ? `<ul class="xa-queue">${queue.map((x) => `<li><span class="xa-dot" style="--h:${x.p.hue}"></span><span class="xa-grow">${esc(L(x.t.title))}<small>${esc(L(x.p.name))}</small></span><button type="button" class="xa-mini" data-act="focus-pick" data-id="${x.t.id}" data-k="fq-${x.t.id}">${T("Vorziehen", "Do now")}</button></li>`).join("")}</ul>` : `<p class="xa-empty">${T("Keine Folge-Tasks in der Warteschlange.", "No follow-up tasks queued.")}</p>`}
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Fokus-Einblicke", "Focus insights")}</h4>
        <div class="xa-stats2"><div><b data-today>${today.toFixed(1)} ${T("Std.", "h")}</b><small>${T("Deep Work heute", "Deep work today")}</small></div><div><b>${f.done}</b><small>${T("Tasks im Fokus erledigt", "Tasks done in focus")}</small></div></div>
        <div class="xa-bars" role="img" aria-label="${T("Deep-Work-Stunden der letzten 7 Tage", "Deep work hours, last 7 days")}">${week.map((v, i) => `<span class="${i === 6 ? "is-today" : ""}"><i style="height:${Math.max(4, (v / max) * 100)}%"></i><small>${L(labels[i])}</small></span>`).join("")}</div>
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Ablenkungen blockiert", "Distractions blocked")}</h4>
        <ul class="xa-switches">${blocks.map(([id, label, ic]) => `<li><span class="xa-icon-tile xa-sm">${icon(ic)}</span><span class="xa-grow" id="xa-b-${id}-${uid}">${label}</span>${sw("block", id, f.blocks[id], `xa-b-${id}-${uid}`)}</li>`).join("")}</ul>
      </div>
    </div>`;
  }
  const timerRing = (f) => {
    const m = Math.floor(f.left / 60), sec = f.left % 60;
    const p = 100 - (f.left / f.total) * 100;
    return `${ring(Math.round(p), 132, 9, false)}<span class="xa-timer-t"><b>${m}:${String(sec).padStart(2, "0")}</b><small>${T("von 50:00", "of 50:00")}</small><small>${f.running ? T("Läuft", "Running") : f.left < f.total ? T("Pausiert", "Paused") : T("Bereit", "Ready")}</small></span>`;
  };
  let uid = 0;
  const sw = (act, id, on, labelledby) => `<button type="button" class="xa-switch" role="switch" aria-checked="${!!on}" aria-labelledby="${labelledby}" data-act="${act}" data-id="${id}" data-k="sw-${act}-${id}"><i></i></button>`;

  function viewWorkspaces(s) {
    const list = s.workspaces.filter((w) => s.wsFilter === "all" || (s.wsFilter === "fav" && s.favs[w.id]) || (s.wsFilter === "owner" && w.owner));
    return `${pageHead(T("Arbeit", "Work"), T(`${s.workspaces.length} Arbeitsbereiche · ${s.workspaces.filter((w) => w.owner).length} eigener`, `${s.workspaces.length} workspaces · ${s.workspaces.filter((w) => w.owner).length} owned`))}
    ${chips("wsfilter", [["all", T("Alle", "All"), s.workspaces.length], ["fav", T("Favoriten", "Favourites"), s.workspaces.filter((w) => s.favs[w.id]).length], ["owner", T("Inhaber", "Owner"), s.workspaces.filter((w) => w.owner).length]], s.wsFilter, T("Arbeitsbereiche filtern", "Filter workspaces"))}
    <div class="xa-wslist">${list.map((w) => {
      const ps = s.projects.filter((p) => p.ws === w.id);
      const tasks = ps.flatMap((p) => p.tasks);
      const done = tasks.filter((t) => t.status === "done").length;
      const pc = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      return `<article class="xa-card xa-ws">
        <div class="xa-ws-top"><span class="xa-code" style="--h:${w.hue}">${w.code}</span><h4>${esc(w.name)}</h4>
          <button type="button" class="xa-iconbtn xa-star" data-act="fav" data-id="${w.id}" data-k="fav-${w.id}" aria-pressed="${!!s.favs[w.id]}" aria-label="${T(`${w.name} als Favorit markieren`, `Mark ${w.name} as favourite`)}">${icon("star")}</button></div>
        <p class="xa-ws-tags"><span class="xa-tag">${w.owner ? T("Inhaber", "Owner") : T("Mitglied", "Member")}</span><span class="xa-tag">${T("Privat", "Private")}</span></p>
        <p class="xa-muted">${esc(L(w.desc))}</p>
        <div class="xa-ws-stats"><div><b>${ps.length}</b><small>${T("Projekte", "Projects")}</small></div><div><b>${tasks.length - done}</b><small>${T("Offene Aufgaben", "Open tasks")}</small></div><div><b>${w.members.length}</b><small>${T("Mitglieder", "Members")}</small></div><div class="xa-stack">${w.members.map((m) => avatar(m, "xa-av-sm")).join("")}</div></div>
        <div class="xa-progress"><i style="width:${pc}%"></i></div><p class="xa-mono xa-right">${pc}%</p>
        <div class="xa-ws-foot"><span class="xa-muted">${icon("flag")} ${esc(L(w.milestone))} · ${T(`${w.online} von ${w.members.length} online`, `${w.online} of ${w.members.length} online`)}</span><button type="button" class="xa-link" data-act="ws" data-id="${w.id}" data-k="ws-${w.id}">${T("Öffnen", "Open")} ${icon("arrowR")}</button></div>
      </article>`;
    }).join("") || `<p class="xa-empty">${T("Keine Arbeitsbereiche in diesem Filter.", "No workspaces in this filter.")}</p>`}</div>`;
  }

  function viewWorkspace(s, id) {
    const w = s.workspaces.find((x) => x.id === id) || s.workspaces[0];
    const ps = s.projects.filter((p) => p.ws === w.id);
    const feed = w.id === "loopr"
      ? [["AK", T("hat „Onboarding-Screens.fig“ hochgeladen", "uploaded “Onboarding-Screens.fig”"), T("vor 2 Std.", "2 h ago")], ["JW", T("hat „API-Schnittstelle festlegen“ erledigt", "completed “Define the API contract”"), T("Gestern", "Yesterday")], ["MS", T("hat den Meilenstein „Closed Beta“ angelegt", "created the milestone “Closed beta”"), T("Fr", "Fri")]]
      : [["TB", T("hat „Datenmodell entwerfen“ erledigt", "completed “Design the data model”"), T("Do", "Thu")], ["SR", T("hat „Nutzerinterviews.docx“ geteilt", "shared “Nutzerinterviews.docx”"), T("Mi", "Wed")]];
    return `${pageHead(`<span class="xa-code" style="--h:${w.hue}">${w.code}</span> ${esc(w.name)}`, esc(L(w.desc)),
      `<button type="button" class="xa-btn" data-act="go" data-area="workspaces" data-k="ws-back">${icon("chevL")}${T("Alle Arbeitsbereiche", "All workspaces")}</button><button type="button" class="xa-btn" data-act="convo" data-id="${w.id === "loopr" ? "team" : "kiez"}" data-k="ws-chat">${icon("message")}${T("Team-Chat", "Team chat")}</button>`)}
    <div class="xa-grid xa-g-wide">
      <div class="xa-card"><h4 class="xa-kicker">${T("Projekte", "Projects")}</h4>
        <ul class="xa-rows">${ps.map((p) => `<li><button type="button" class="xa-rowbtn" data-act="project" data-id="${p.id}" data-k="wsp-${p.id}">${ring(pct(p))}<span class="xa-grow"><b>${esc(L(p.name))}</b><small>${esc(L(p.desc))}</small></span><span class="xa-muted xa-nowrap">${T(`${openOf(p)} offen`, `${openOf(p)} open`)}</span>${icon("chevR")}</button></li>`).join("")}</ul>
        <h4 class="xa-kicker xa-mt">${T("Offene Aufgaben", "Open tasks")}</h4>
        <ul class="xa-tasks">${ps.flatMap((p) => p.tasks.filter((t) => t.status !== "done").map((t) => taskRow(t, p))).join("") || `<li class="xa-empty">${T("Alles erledigt.", "All done.")}</li>`}</ul>
      </div>
      <div class="xa-col">
        <div class="xa-card"><h4 class="xa-kicker">${T("Mitglieder", "Members")}</h4>
          <ul class="xa-people">${w.members.map((m) => `<li>${avatar(m)}<span class="xa-grow"><b>${esc(PEOPLE[m].name)}${m === "LV" ? T(" (du)", " (you)") : ""}</b><small>${esc(L(PEOPLE[m].role))}</small></span></li>`).join("")}</ul>
        </div>
        <div class="xa-card"><h4 class="xa-kicker">${T("Verlauf", "Activity")}</h4>
          <ul class="xa-feed">${feed.map(([who, what, when]) => `<li>${avatar(who, "xa-av-sm")}<span><b>${esc(PEOPLE[who].name.split(" ")[0])}</b> ${esc(what)}<small>${esc(when)}</small></span></li>`).join("")}</ul>
        </div>
      </div>
    </div>`;
  }

  function viewProjects(s) {
    const tasks = allTasks(s);
    const open = tasks.filter((x) => x.t.status !== "done");
    const avg = Math.round(s.projects.reduce((n, p) => n + pct(p), 0) / s.projects.length);
    const list = s.projects.filter((p) => s.projFilter === "all" || p.ws === s.projFilter);
    const stat = (ic, cls, n, label) => `<div class="xa-card xa-stat"><span class="xa-icon-tile ${cls}">${icon(ic)}</span><div><b>${n}</b><small>${label}</small></div></div>`;
    return `${pageHead(T("Deine Projekte", "Your projects"), T(`${s.projects.length} Projekte`, `${s.projects.length} projects`), `<button type="button" class="xa-btn xa-primary" data-act="newtask" data-k="p-new">${icon("plus")}${T("Neuer Task", "New task")}</button>`)}
    <div class="xa-stats4">${stat("kanban", "", s.projects.length, T("Aktive Projekte", "Active projects"))}${stat("clock", "xa-t-ok", avg + "%", T("Ø Fortschritt", "Avg. progress"))}${stat("check", "xa-t-violet", open.length, T("Offene Aufgaben", "Open tasks"))}${stat("flag", "xa-t-warn", open.filter((x) => x.t.prio === "high").length, T("Dringend", "Urgent"))}</div>
    ${chips("projfilter", [["all", T("Alle", "All"), s.projects.length], ...s.workspaces.map((w) => [w.id, esc(w.name), s.projects.filter((p) => p.ws === w.id).length])], s.projFilter, T("Projekte filtern", "Filter projects"))}
    <div class="xa-pgrid">${list.map((p) => {
      const pc = pct(p);
      const ws = s.workspaces.find((w) => w.id === p.ws);
      const urgent = p.tasks.some((t) => t.prio === "high" && t.status !== "done");
      return `<article class="xa-card xa-pcard" style="--h:${p.hue}">
        <div class="xa-ws-top"><span class="xa-code">${p.code}</span><div class="xa-grow"><h4><button type="button" class="xa-plain" data-act="project" data-id="${p.id}" data-k="pc-${p.id}">${esc(L(p.name))}</button></h4><small class="xa-muted">${esc(ws.name)}</small></div></div>
        <p class="xa-muted">${esc(L(p.desc))}</p>
        <div class="xa-pc-prog"><span>${T(`${p.tasks.length - openOf(p)} von ${p.tasks.length} Aufgaben erledigt`, `${p.tasks.length - openOf(p)} of ${p.tasks.length} tasks done`)}</span><span class="xa-mono">${pc}%</span></div>
        <div class="xa-progress"><i style="width:${pc}%;background:${p.hue}"></i></div>
        <div class="xa-ws-foot"><span class="xa-status ${pc === 100 ? "is-ok" : urgent ? "is-warn" : ""}">${pc === 100 ? T("Abgeschlossen", "Completed") : urgent ? T("Dringende Aufgaben", "Urgent tasks") : T("Läuft", "On track")}</span><span class="xa-stack">${[...new Set(p.tasks.map((t) => t.who))].map((m) => avatar(m, "xa-av-sm")).join("")}</span></div>
      </article>`;
    }).join("")}</div>`;
  }

  function viewProject(s, id) {
    const p = proj(s, id) || s.projects[0];
    const ws = s.workspaces.find((w) => w.id === p.ws);
    const cols = [["todo", T("Offen", "To do")], ["doing", T("In Arbeit", "In progress")], ["done", T("Erledigt", "Done")]];
    const next = { todo: "doing", doing: "done", done: "todo" };
    const moveLabel = { todo: T("Starten", "Start"), doing: T("Abschließen", "Finish"), done: T("Wieder öffnen", "Reopen") };
    return `${pageHead(`<span class="xa-code" style="--h:${p.hue}">${p.code}</span> ${esc(L(p.name))}`, `${esc(ws.name)} · ${esc(L(p.desc))}`,
      `<button type="button" class="xa-btn" data-act="go" data-area="projects" data-k="pd-back">${icon("chevL")}${T("Alle Projekte", "All projects")}</button>`)}
    <div class="xa-pd-bar"><div class="xa-progress"><i style="width:${pct(p)}%;background:${p.hue}"></i></div><span class="xa-mono">${pct(p)}% · ${T(`${p.tasks.length - openOf(p)} von ${p.tasks.length} erledigt`, `${p.tasks.length - openOf(p)} of ${p.tasks.length} done`)}</span></div>
    <div class="xa-kanban">${cols.map(([st, label]) => {
      const ts = p.tasks.filter((t) => t.status === st);
      return `<div class="xa-col-k" role="region" aria-label="${esc(label)}"><h4 class="xa-kicker">${label} <span>${ts.length}</span></h4>
        ${st === "todo" ? `<form class="xa-addtask" data-form="addtask" data-id="${p.id}"><label class="xa-sr" for="xa-add-${uid}">${T("Neue Aufgabe", "New task")}</label><input id="xa-add-${uid}" name="title" maxlength="80" autocomplete="off" placeholder="${T("Neue Aufgabe …", "New task …")}" data-k="addtask"><button type="submit" class="xa-iconbtn xa-primary" aria-label="${T("Aufgabe hinzufügen", "Add task")}">${icon("plus")}</button></form>` : ""}
        <ul class="xa-kcards">${ts.map((t) => `<li class="xa-kcard${st === "done" ? " is-done" : ""}">
          <label class="xa-check"><input type="checkbox" data-act="task" data-id="${t.id}" data-k="task-${t.id}"${st === "done" ? " checked" : ""}><span class="xa-box" aria-hidden="true">${icon("check")}</span><span class="xa-task-t">${esc(L(t.title))}</span></label>
          <div class="xa-kmeta"><span class="xa-prio xa-prio-${t.prio}">${L(PRIO[t.prio])}</span>${t.due && st !== "done" ? `<span class="xa-due">${esc(L(t.due))}</span>` : ""}<span class="xa-grow"></span>${avatar(t.who, "xa-av-sm")}<button type="button" class="xa-mini" data-act="move" data-id="${t.id}" data-to="${next[st]}" data-k="mv-${t.id}">${moveLabel[st]}</button></div>
        </li>`).join("") || `<li class="xa-empty">${T("Nichts hier.", "Nothing here.")}</li>`}</ul>
      </div>`;
    }).join("")}</div>`;
  }

  function viewMessages(s) {
    const list = s.convos.filter((c) => s.chatFilter === "all" || (s.chatFilter === "unread" && c.unread) || (s.chatFilter === "groups" && c.group));
    const c = s.convos.find((x) => x.id === s.convo) || s.convos[0];
    const last = (x) => x.msgs[x.msgs.length - 1];
    const members = c.group ? c.members : ["LV", c.with];
    return `<div class="xa-msg">
      <div class="xa-msg-list">
        <h3 class="xa-title" tabindex="-1" data-k="title">${T("Nachrichten", "Messages")}</h3><p class="xa-sub">${T("Direktnachrichten und Team-Chats", "Direct messages and team chats")}</p>
        ${chips("chatfilter", [["all", T("Alle", "All")], ["unread", T("Ungelesen", "Unread")], ["groups", T("Gruppen", "Groups")]], s.chatFilter, T("Gespräche filtern", "Filter conversations"))}
        <ul class="xa-convos">${list.map((x) => `<li><button type="button" class="xa-convo" data-act="convo" data-id="${x.id}" data-k="cv-${x.id}" aria-current="${x.id === c.id}">
          ${x.group ? `<span class="xa-av xa-av-group" aria-hidden="true">${esc(x.name[0])}</span>` : avatar(x.with)}
          <span class="xa-grow"><b>${esc(x.name)}</b><small>${esc(L(last(x).text))}</small></span>
          <span class="xa-convo-r"><small>${esc(L(last(x).at))}</small>${x.unread ? `<span class="xa-count" aria-label="${T(`${x.unread} ungelesen`, `${x.unread} unread`)}">${x.unread}</span>` : ""}</span>
        </button></li>`).join("") || `<li class="xa-empty">${T("Keine Gespräche in diesem Filter.", "No conversations in this filter.")}</li>`}</ul>
      </div>
      <div class="xa-chat" role="region" aria-label="${T(`Gespräch: ${c.name}`, `Conversation: ${c.name}`)}">
        <header class="xa-chat-head">${c.group ? `<span class="xa-av xa-av-group" aria-hidden="true">#</span>` : avatar(c.with)}<div class="xa-grow"><b>${esc(c.name)}</b><small>${c.group ? T(`Gruppe · ${c.members.length} Mitglieder`, `Group · ${c.members.length} members`) : esc(L(PEOPLE[c.with].role)) + " · online"}</small></div>
          <button type="button" class="xa-btn xa-ask" data-act="ask-chat" data-k="chat-ask">${icon("sparkle")}${T("Zusammenfassen", "Summarise")}</button></header>
        <ol class="xa-thread" data-scroll="thread">${c.msgs.map((m) => `<li class="xa-m${m.from === "LV" ? " is-me" : ""}">${m.from === "LV" ? "" : avatar(m.from, "xa-av-sm")}<div class="xa-bubble"><span class="xa-m-head"><b style="color:${PEOPLE[m.from].hue}">${m.from === "LV" ? T("Du", "You") : esc(PEOPLE[m.from].name)}</b><small>${esc(L(m.at))}</small></span><p${m.mine ? " data-own" : ""}>${esc(L(m.text))}</p></div></li>`).join("")}
          ${s.typing === c.id ? `<li class="xa-m xa-typing">${avatar(c.reply.from, "xa-av-sm")}<div class="xa-bubble"><span class="xa-dots" aria-label="${T("schreibt …", "typing …")}"><i></i><i></i><i></i></span></div></li>` : ""}</ol>
        <form class="xa-composer" data-form="chat"><label class="xa-sr" for="xa-chat-${uid}">${T(`Nachricht an ${c.name}`, `Message to ${c.name}`)}</label><input id="xa-chat-${uid}" name="text" maxlength="400" autocomplete="off" placeholder="${T("Nachricht … (@ zum Erwähnen)", "Message … (@ to mention)")}" data-k="chat-input"><button type="submit" class="xa-iconbtn xa-primary" aria-label="${T("Senden", "Send")}">${icon("send")}</button></form>
      </div>
      <aside class="xa-msg-info" aria-label="${T("Details zum Gespräch", "Conversation details")}">
        ${c.group ? `<span class="xa-av xa-av-xl xa-av-group" aria-hidden="true">${esc(c.name[0])}</span>` : avatar(c.with, "xa-av-xl")}
        <b>${esc(c.name)}</b><small class="xa-muted">${c.group ? T("Gruppengespräch", "Group conversation") : esc(L(PEOPLE[c.with].role))}</small>
        <h4 class="xa-kicker xa-mt">${T("Mitglieder", "Members")}</h4>
        <ul class="xa-people">${members.map((m) => `<li>${avatar(m, "xa-av-sm")}<span class="xa-grow">${esc(PEOPLE[m].name)}</span></li>`).join("")}</ul>
      </aside>
    </div>`;
  }

  function viewDiscover(s) {
    const roles = [["all", T("Alle", "All")], ["dev", T("Entwicklung", "Engineering")], ["design", T("Design", "Design")], ["music", T("Musik", "Music")], ["growth", T("Wachstum", "Growth")]];
    const list = s.builders.filter((b) => s.role === "all" || b.kind === s.role);
    const b = s.builders.find((x) => x.id === s.builder) || s.builders[0];
    const fl = [T("Skills ergänzen sich", "Complementary skills"), T("Zeitbudget", "Time budget"), T("Gemeinsame Ziele", "Shared goals"), T("Arbeitsstil", "Working style"), T("Standort & Zeitzone", "Location & time zone")];
    return `<div class="xa-split">
      <div class="xa-split-main">
        ${pageHead(T("Finde deine Leute.", "Find your people."), T("Builder, die zu Loopr Studio passen – mit Begründung statt Endlos-Feed.", "Builders who fit Loopr Studio – with reasons instead of an endless feed."))}
        ${chips("role", roles, s.role, T("Nach Rolle filtern", "Filter by role"))}
        <ul class="xa-bgrid">${list.map((x) => `<li class="xa-card xa-builder${x.id === b.id ? " is-sel" : ""}">
          <div class="xa-b-top">${`<span class="xa-av xa-av-lg" style="--h:${x.kind === "design" ? "#B36BFF" : x.kind === "music" ? "#E05E6D" : x.kind === "growth" ? "#D9A54E" : "#007AFF"}" aria-hidden="true">${esc(x.name.split(" ").map((n) => n[0]).join(""))}</span>`}
            <div class="xa-grow"><h4>${esc(x.name)}</h4><small class="xa-muted">${esc(L(x.role))} · ${esc(x.city)}</small></div>
            <span class="xa-score" title="${T("Passung", "Match")}">${ring(x.score, 46, 4)}</span></div>
          <p class="xa-ws-tags">${x.skills.map((k) => `<span class="xa-tag">${esc(L(k))}</span>`).join("")}<span class="xa-tag xa-tag-acc">${T(`${x.hours} Std./Woche`, `${x.hours} h/week`)}</span></p>
          <div class="xa-row"><button type="button" class="xa-btn" data-act="builder" data-id="${x.id}" data-k="bw-${x.id}" aria-pressed="${x.id === b.id}">${T("Warum passt das?", "Why a match?")}</button>
            <button type="button" class="xa-btn ${s.connected[x.id] ? "is-sent" : "xa-primary"}" data-act="connect" data-id="${x.id}" data-k="bc-${x.id}" aria-pressed="${!!s.connected[x.id]}">${s.connected[x.id] ? icon("check") + T("Anfrage gesendet", "Request sent") : T("Vernetzen", "Connect")}</button></div>
        </li>`).join("")}</ul>
      </div>
      <aside class="xa-card xa-explain" aria-label="${T("Match-Erklärung", "Match explanation")}" data-explain>
        <div class="xa-b-top">${ring(b.score, 64, 6)}<div class="xa-grow"><h4>${T(`Warum du und ${b.name.split(" ")[0]} zusammenpasst`, `Why you and ${b.name.split(" ")[0]} match`)}</h4><small class="xa-muted">${esc(L(b.role))} · ${esc(b.city)} · ${T(`${b.hours} Std./Woche`, `${b.hours} h/week`)}</small></div></div>
        <ul class="xa-factors">${b.f.map((v, i) => `<li><span>${fl[i]}</span><span class="xa-mono">${v}</span><div class="xa-progress"><i style="width:${v}%"></i></div></li>`).join("")}</ul>
        <div class="xa-ai-sum"><span class="xa-kicker">${icon("sparkle")} ${T("KI-Zusammenfassung", "AI summary")}</span><p>${esc(L(b.sum))}</p></div>
        <p class="xa-small"><b>${T("Nächster Schritt:", "Next step:")}</b> ${esc(L(b.next))}</p>
        <p class="xa-small xa-warn-t"><b>${T("Gut zu wissen:", "Worth knowing:")}</b> ${esc(L(b.risk))}</p>
        <button type="button" class="xa-btn ${s.connected[b.id] ? "is-sent" : "xa-primary"} xa-full" data-act="connect" data-id="${b.id}" data-k="ex-connect" aria-pressed="${!!s.connected[b.id]}">${s.connected[b.id] ? icon("check") + T("Anfrage gesendet", "Request sent") : T(`${b.name.split(" ")[0]} eine Anfrage senden`, `Send ${b.name.split(" ")[0]} a request`)}</button>
        <p class="xa-small xa-muted">${T("Ein Match entsteht erst, wenn beide Ja sagen.", "A match only happens when you both say yes.")}</p>
      </aside>
    </div>`;
  }

  function viewCommunities(s) {
    const list = s.communities.filter((c) => s.commFilter === "all" || (s.commFilter === "joined" && c.joined) || (s.commFilter === "rec" && c.rec));
    const mine = s.communities.filter((c) => c.joined);
    return `<div class="xa-split">
      <div class="xa-split-main">
        ${pageHead(T("Baue mit den richtigen Communities.", "Build with the right communities."), T("Entdecke Räume zu deinen Interessen und wachse mit anderen Buildern.", "Discover spaces for your interests and grow with other builders."))}
        ${chips("commfilter", [["all", T("Alle", "All")], ["joined", T("Beigetreten", "Joined")], ["rec", T("Empfohlen", "Recommended")]], s.commFilter, T("Communities filtern", "Filter communities"))}
        <ul class="xa-cgrid">${list.map((c) => `<li class="xa-card xa-comm"><div class="xa-b-top"><span class="xa-letter" style="--h:${c.hue}" aria-hidden="true">${c.letter}</span><div class="xa-grow"><h4>${esc(L(c.name))}</h4><small class="xa-muted">${T(`${(c.members + (c.joined ? 1 : 0)).toLocaleString("de-DE")} Mitglieder`, `${(c.members + (c.joined ? 1 : 0)).toLocaleString("en-GB")} members`)}</small></div>${c.rec ? `<span class="xa-pill">${T("Empfohlen", "Recommended")}</span>` : ""}</div>
          <p class="xa-muted">${esc(L(c.desc))}</p><p class="xa-ws-tags">${c.tags.map((t) => `<span class="xa-tag">${esc(L(t))}</span>`).join("")}</p>
          <button type="button" class="xa-btn xa-full ${c.joined ? "is-sent" : "xa-primary"}" data-act="join" data-id="${c.id}" data-k="cj-${c.id}" aria-pressed="${c.joined}">${c.joined ? icon("check") + T("Beigetreten", "Joined") : T("Beitreten", "Join")}</button></li>`).join("") || `<li class="xa-empty">${T("Noch keiner Community beigetreten.", "You haven't joined a community yet.")}</li>`}</ul>
      </div>
      <aside class="xa-col xa-aside">
        <div class="xa-card"><h4>${T("Trend-Themen", "Trending topics")}</h4><p class="xa-ws-tags">${["#closedbeta", "#audioml", "#pitchdeck", "#nocode", "#figma"].map((t) => `<span class="xa-tag">${t}</span>`).join("")}</p></div>
        <div class="xa-card"><h4>${T("Kommende Events", "Upcoming events")}</h4><ul class="xa-events">${s.events.map((e) => `<li><span class="xa-grow"><b>${esc(L(e.title))}</b><small>${esc(L(e.when))}</small></span><button type="button" class="xa-mini ${e.going ? "is-on" : ""}" data-act="rsvp" data-id="${e.id}" data-k="rsvp-${e.id}" aria-pressed="${e.going}">${e.going ? T("Zugesagt", "Going") : T("Zusagen", "Attend")}</button></li>`).join("")}</ul></div>
        <div class="xa-card"><h4>${T("Deine Communities", "Your communities")}</h4><ul class="xa-people">${mine.map((c) => `<li><span class="xa-letter xa-sm" style="--h:${c.hue}" aria-hidden="true">${c.letter}</span><span class="xa-grow">${esc(L(c.name))}</span></li>`).join("") || `<li class="xa-muted">${T("Noch keine.", "None yet.")}</li>`}</ul></div>
      </aside>
    </div>`;
  }

  function viewFiles(s) {
    const types = [["all", T("Alle Typen", "All types"), "file"], ["doc", T("Dokumente", "Documents"), "file"], ["image", T("Bilder", "Images"), "image"], ["video", T("Videos", "Videos"), "video"], ["audio", "Audio", "audio"]];
    const views = [["all", T("Alle Dateien", "All files"), "folder"], ["recent", T("Zuletzt", "Recent"), "clock"], ["starred", T("Markiert", "Starred"), "star"]];
    const q = s.fileQuery.trim().toLowerCase();
    const list = s.files.filter((f) => (s.fileType === "all" || f.type === s.fileType) && (s.fileView === "all" || (s.fileView === "recent" && f.recent) || (s.fileView === "starred" && s.fileStars[f.id])) && (!q || f.name.toLowerCase().includes(q) || f.ws.toLowerCase().includes(q)));
    const sel = s.files.find((f) => f.id === s.fileSel);
    const ic = (t) => (t === "doc" ? "file" : t);
    return `<div class="xa-files">
      <nav class="xa-subnav" aria-label="${T("Dateiansichten", "File views")}"><h4 class="xa-subnav-h">${T("Dateien", "Files")}</h4>
        ${views.map(([id, label, i]) => `<button type="button" data-act="fileview" data-v="${id}" data-k="fv-${id}" aria-pressed="${s.fileView === id}">${icon(i)}${label}</button>`).join("")}
        <h4 class="xa-subnav-h xa-mt">${T("Typ", "Type")}</h4>
        ${types.map(([id, label, i]) => `<button type="button" data-act="filetype" data-v="${id}" data-k="ft-${id}" aria-pressed="${s.fileType === id}">${icon(i)}${label}</button>`).join("")}
      </nav>
      <div class="xa-files-main">
        ${pageHead(T("Dein gesamtes Wissen an einem Ort.", "All your knowledge in one place."), "")}
        <div class="xa-toolbar"><label class="xa-sr" for="xa-fq-${uid}">${T("Dateien suchen", "Search files")}</label><input id="xa-fq-${uid}" class="xa-input" type="search" data-input="filequery" data-k="fq" value="${esc(s.fileQuery)}" placeholder="${T("Dateien suchen …", "Search files …")}" autocomplete="off"><button type="button" class="xa-btn xa-primary" data-act="upload" data-k="upload">${icon("download", "xa-flip")}${T("Hochladen", "Upload")}</button></div>
        <div class="xa-table" role="table" aria-label="${T("Dateien", "Files")}">
          <div class="xa-tr xa-th" role="row"><span role="columnheader">Name</span><span role="columnheader">${T("Arbeitsbereich", "Workspace")}</span><span role="columnheader">${T("Inhaber", "Owner")}</span><span role="columnheader">${T("Größe", "Size")}</span><span role="columnheader">${T("Geändert", "Modified")}</span><span role="columnheader"><span class="xa-sr">${T("Markieren", "Star")}</span></span></div>
          ${list.map((f) => `<div class="xa-tr${f.id === s.fileSel ? " is-sel" : ""}" role="row"><span role="cell"><button type="button" class="xa-plain xa-fname" data-act="file" data-id="${f.id}" data-k="file-${f.id}" aria-pressed="${f.id === s.fileSel}">${icon(ic(f.type))}${esc(f.name)}</button></span><span role="cell" class="xa-muted">${esc(f.ws)}</span><span role="cell" class="xa-muted">${esc(PEOPLE[f.owner].name)}</span><span role="cell" class="xa-mono">${f.size}</span><span role="cell" class="xa-mono">${esc(L(f.at))}</span><span role="cell"><button type="button" class="xa-iconbtn xa-star" data-act="filestar" data-id="${f.id}" data-k="fs-${f.id}" aria-pressed="${!!s.fileStars[f.id]}" aria-label="${T(`${f.name} markieren`, `Star ${f.name}`)}">${icon("star")}</button></span></div>`).join("") || `<p class="xa-empty">${T("Keine Dateien gefunden.", "No files found.")}</p>`}
        </div>
        ${sel ? `<div class="xa-card xa-filedetail" role="region" aria-label="${esc(sel.name)}"><span class="xa-icon-tile xa-lg">${icon(ic(sel.type))}</span><div class="xa-grow"><b>${esc(sel.name)}</b><small class="xa-muted">${esc(sel.ws)} · ${esc(PEOPLE[sel.owner].name)} · ${sel.size} · ${T("Version 1", "Version 1")}</small></div><button type="button" class="xa-btn xa-primary" data-act="file-ai" data-id="${sel.id}" data-k="file-ai">${icon("sparkle")}${T("Mit KI zusammenfassen", "Summarise with AI")}</button></div>` : `<p class="xa-hint">${T("Tipp: Wähle eine Datei, um sie von der KI zusammenfassen zu lassen.", "Tip: pick a file to have the AI summarise it.")}</p>`}
      </div>
    </div>`;
  }

  const AI_ACTIONS = [
    ["plan", ["Meinen Tag planen", "Plan my day"]],
    ["summary", ["Arbeit zusammenfassen", "Summarise my work"]],
    ["risks", ["Risiken finden", "Find risks"]],
    ["update", ["Team-Update entwerfen", "Draft a team update"]],
  ];
  function aiAnswer(s, kind, q) {
    const open = allTasks(s).filter((x) => x.t.status !== "done");
    const high = open.filter((x) => x.t.prio === "high");
    const done = allTasks(s).filter((x) => x.t.status === "done");
    const li = (arr) => `<ul>${arr.map((x) => `<li>${x}</li>`).join("")}</ul>`;
    const name = (x) => `<b>${esc(L(x.t.title))}</b>`;
    if (kind === "plan") {
      const today = s.cal.events.filter((e) => e.day === 0).sort((a, b) => a.s - b.s);
      const plan = [
        ...today.map((e) => [e.s, esc(L(e.title))]),
        ...high.slice(0, 2).map((x, i) => [i ? 16.5 : 12, `${T("Fokus auf", "Focus on")} ${name(x)}`]),
      ].sort((a, b) => a[0] - b[0]);
      return `<p>${T("Hier ist ein Vorschlag für deinen Montag:", "Here's a suggestion for your Monday:")}</p>${li(plan.map(([h, text]) => `<span class="xa-mono">${fmtH(h)}</span> ${text}`))}<p>${T(`Du hast ${open.length} offene Aufgaben, ${high.length} davon dringend. Zwischen 12 und 14 Uhr ist dein Kalender frei.`, `You have ${open.length} open tasks, ${high.length} of them urgent. Your calendar is free between 12 and 2 pm.`)}</p>`;
    }
    if (kind === "summary") {
      return `<p>${T("Stand deiner Arbeitsbereiche:", "Where your workspaces stand:")}</p>${li(s.projects.map((p) => `<b>${esc(L(p.name))}</b>: ${pct(p)}% · ${T(`${openOf(p)} offen`, `${openOf(p)} open`)}`))}<p>${T(`Insgesamt sind ${done.length} von ${done.length + open.length} Aufgaben erledigt. Zuletzt abgeschlossen: ${done.length ? esc(L(done[done.length - 1].t.title)) : "–"}.`, `In total ${done.length} of ${done.length + open.length} tasks are done. Most recently finished: ${done.length ? esc(L(done[done.length - 1].t.title)) : "–"}.`)}</p>`;
    }
    if (kind === "risks") {
      const r = [];
      const t2 = allTasks(s).find((x) => x.t.id === "t2");
      if (t2 && t2.t.status !== "done") r.push(T("Der TestFlight-Build hängt am <b>Audio-Upload-Test</b> von Jonas. Ohne ihn wackelt die Closed Beta am 7. November.", "The TestFlight build depends on Jonas's <b>audio upload test</b>. Without it the closed beta on 7 November is at risk."));
      const t7 = allTasks(s).find((x) => x.t.id === "t7");
      if (t7 && t7.t.status !== "done") r.push(T("Die <b>Warteliste-Mail</b> ist heute fällig und noch offen.", "The <b>waitlist email</b> is due today and still open."));
      r.push(T("Aylin hat 3 Aufgaben gleichzeitig. Lea Hoffmann aus Entdecken könnte entlasten (89 % Passung).", "Aylin has 3 tasks at once. Lea Hoffmann from Discover could help (89% match)."));
      return `<p>${T("Das solltest du im Blick behalten:", "Keep an eye on this:")}</p>${li(r)}`;
    }
    if (kind === "update") {
      const p = proj(s, "launch");
      return `<p>${T("Entwurf für das Team-Update:", "Draft for the team update:")}</p><blockquote>${T(`Hallo Team! Diese Woche haben wir ${done.length} Aufgaben abgeschlossen. Der Beta-Launch steht bei ${pct(p)} %. Fokus bis Freitag: ${high.slice(0, 2).map((x) => esc(L(x.t.title))).join(" und ") || "Feinschliff"}. Danke euch! – Lena`, `Hi team! This week we closed ${done.length} tasks. The beta launch is at ${pct(p)}%. Focus until Friday: ${high.slice(0, 2).map((x) => esc(L(x.t.title))).join(" and ") || "polish"}. Thank you! – Lena`)}</blockquote><p class="xa-muted">${T("In der App kannst du den Entwurf direkt in den Team-Chat schicken.", "In the app you can send the draft straight to the team chat.")}</p>`;
    }
    if (kind === "chat") {
      const c = s.convos.find((x) => x.id === s.convo);
      return `<p>${T(`Zusammenfassung von „${esc(c.name)}“:`, `Summary of “${esc(c.name)}”:`)}</p>${li(c.msgs.slice(-3).map((m) => `<b>${m.from === "LV" ? T("Du", "You") : esc(PEOPLE[m.from].name.split(" ")[0])}:</b> ${esc(L(m.text))}`))}`;
    }
    if (kind && kind.startsWith("file:")) {
      const f = s.files.find((x) => x.id === kind.slice(5));
      const what = { doc: T("Das Dokument beschreibt", "The document describes"), image: T("Die Datei zeigt", "The file shows"), audio: T("Die Aufnahme enthält", "The recording contains"), video: T("Das Video zeigt", "The video shows") }[f.type];
      const body = { screens: T("vier Onboarding-Screens: Willkommen, Mikrofon-Zugriff, erstes Summen und Ergebnis.", "four onboarding screens: welcome, microphone access, first hum and result."), plan: T("den Ablauf der Closed Beta: 50 Tester, zwei Wochen, Feedback per Formular und ein Abschluss-Call.", "the closed beta plan: 50 testers, two weeks, feedback via a form and a wrap-up call."), deck: T("Problem, Lösung, Markt (2,3 Mio. Hobby-Musiker in DACH), Team und den Plan bis zum Launch.", "problem, solution, market (2.3m hobby musicians in DACH), team and the plan to launch."), hum: T("eine 12 Sekunden lange Testmelodie in C-Dur für den Modellvergleich.", "a 12-second test melody in C major for the model comparison."), teaser: T("in 30 Sekunden, wie aus Summen ein Song wird.", "in 30 seconds how humming turns into a song."), logo: T("drei Logo-Varianten; Aylin empfiehlt Variante B.", "three logo variants; Aylin recommends variant B."), interviews: T("acht Interviews: Abholung und Vertrauen sind die größten Hürden.", "eight interviews: pick-up and trust are the biggest hurdles.") }[f.id];
      return `<p><b>${esc(f.name)}</b></p><p>${what} ${body}</p>`;
    }
    // Freie Fragen: einfache Stichwörter statt echter KI
    const ql = String(q || "").toLowerCase();
    const want = [[/ios|swift|mobil|iphone/, "noah"], [/\bml\b|machine|modell|model|ki-ent|ai eng/, "emre"], [/design|ux|figma/, "lea"], [/musik|music|sound|produz|produc/, "mia"], [/marketing|community|growth|wachstum|reichweite|reach/, "clara"], [/backend|api|server|datenbank|database/, "paul"]].find(([re]) => re.test(ql));
    if (want || /\bwer\b|\bwho\b|mitgründ|co-?founder|entwickler|developer|team/.test(ql)) {
      const b = s.builders.find((x) => x.id === (want ? want[1] : "noah"));
      return `<p>${T(`Für Loopr Studio passt <b>${esc(b.name)}</b> (${esc(L(b.role))}, ${esc(b.city)}) am besten: ${b.score} % Passung.`, `For Loopr Studio, <b>${esc(b.name)}</b> (${esc(L(b.role))}, ${esc(b.city)}) fits best: ${b.score}% match.`)}</p><p>${esc(L(b.sum))}</p><p><button type="button" class="xa-link" data-act="builder-open" data-id="${b.id}" data-k="ai-b-${b.id}">${T("Match-Erklärung ansehen", "See the match explanation")} ${icon("arrowR")}</button></p>`;
    }
    if (/aufgab|task|todo|heute|today|dringend|urgent|offen|open/.test(ql)) return `<p>${T(`Dringend und offen sind gerade ${high.length} Aufgaben:`, `${high.length} urgent tasks are open right now:`)}</p>${li(high.map((x) => `${name(x)} · ${esc(L(x.p.name))}`))}`;
    if (/termin|kalender|woche|meeting|calendar|week|plan/.test(ql)) return aiAnswer(s, "plan");
    if (/datei|dokument|pdf|file|doc/.test(ql)) return `<p>${T("Diese Dateien sind gerade wichtig:", "These files matter right now:")}</p>${li(s.files.filter((f) => f.recent).map((f) => `<b>${esc(f.name)}</b> · ${esc(L(f.at))}`))}`;
    return `<p>${T(`Gute Frage! In der Demo antworte ich mit Beispieldaten. In der echten App kennt Xyntal KI deine Arbeitsbereiche, Projekte, Dateien und Nachrichten und antwortet genau dazu.`, `Good question! In the demo I answer with sample data. In the real app Xyntal AI knows your workspaces, projects, files and messages and answers about exactly those.`)}</p><p>${T(`Zu „${esc(q)}“ passt gerade: ${high.length ? name(high[0]) + " ist dringend." : "alles Wichtige ist erledigt."}`, `Relevant to “${esc(q)}” right now: ${high.length ? name(high[0]) + " is urgent." : "everything important is done."}`)}</p><p class="xa-muted">${T("Probier eine der Schnellaktionen aus.", "Try one of the quick actions.")}</p>`;
  }
  const fmtH = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`;

  function viewAi(s) {
    const sugg = AI_ACTIONS.map(([id, label]) => `<button type="button" class="xa-chip" data-act="ai" data-v="${id}" data-k="ais-${id}"${s.aiBusy ? " disabled" : ""}>${icon("sparkle")}${L(label)}</button>`).join("");
    return `<div class="xa-ai">
      <aside class="xa-ai-list"><button type="button" class="xa-btn xa-primary xa-full" data-act="ai-new" data-k="ai-new">${icon("plus")}${T("Neues Gespräch", "New conversation")}</button>
        <h4 class="xa-kicker xa-mt">${T("Zuletzt", "Recent")}</h4>
        <ul class="xa-recent"><li>${s.ai.length ? T("Aktuelles Gespräch", "Current conversation") : T("Noch keine Gespräche.", "No conversations yet.")}</li><li class="xa-muted">${T("Pitch-Deck überarbeiten", "Revise the pitch deck")}</li><li class="xa-muted">${T("Fragen für Nutzerinterviews", "Questions for user interviews")}</li></ul></aside>
      <div class="xa-ai-main" role="region" aria-label="Xyntal KI">
        <header class="xa-ai-head"><h3 class="xa-title" tabindex="-1" data-k="title">Xyntal KI</h3><span class="xa-grow"></span><span class="xa-tag">${T("Kontext: Loopr Studio", "Context: Loopr Studio")}</span></header>
        <ol class="xa-ai-thread" data-scroll="ai">
          ${s.ai.length ? s.ai.map((m) => m.role === "user" ? `<li class="xa-q"><p data-own>${esc(m.text)}</p></li>` : `<li class="xa-a"><span class="xa-ai-badge" aria-hidden="true">${icon("sparkle")}</span><div>${aiAnswer(s, m.kind, m.q)}</div></li>`).join("") : `<li class="xa-ai-empty"><span class="xa-icon-tile xa-lg">${icon("hexagon")}</span><p>${T("Frag alles zu deinen Arbeitsbereichen, Projekten und Dateien.", "Ask anything about your workspaces, projects and files.")}</p><div class="xa-chips">${sugg}</div></li>`}
          ${s.aiBusy ? `<li class="xa-a"><span class="xa-ai-badge" aria-hidden="true">${icon("sparkle")}</span><span class="xa-dots" aria-label="${T("Xyntal KI denkt nach …", "Xyntal AI is thinking …")}"><i></i><i></i><i></i></span></li>` : ""}
        </ol>
        ${s.ai.length ? `<div class="xa-chips xa-ai-sugg">${sugg}</div>` : ""}
        <form class="xa-composer" data-form="ai"><label class="xa-sr" for="xa-ai-${uid}">${T("Frage an Xyntal KI", "Question for Xyntal AI")}</label><input id="xa-ai-${uid}" name="q" maxlength="300" autocomplete="off" placeholder="${T("Xyntal KI fragen …", "Ask Xyntal AI …")}" data-k="ai-input"${s.aiBusy ? " disabled" : ""}><button type="submit" class="xa-btn xa-primary"${s.aiBusy ? " disabled" : ""}>${T("Senden", "Send")}</button></form>
      </div>
      <aside class="xa-ai-side">
        <h4 class="xa-kicker">${T("Arbeitsbereich-Kontext", "Workspace context")}</h4><p class="xa-boxed">Loopr Studio</p>
        <h4 class="xa-kicker">${T("Relevante Dateien", "Relevant files")}</h4>
        <ul class="xa-flist">${["plan", "deck", "screens"].map((id) => { const f = s.files.find((x) => x.id === id); return `<li><button type="button" class="xa-plain" data-act="file-ai" data-id="${id}" data-k="aif-${id}">${icon(f.type === "doc" ? "file" : f.type)}${esc(f.name)}</button></li>`; }).join("")}</ul>
        <h4 class="xa-kicker">${T("Schnellaktionen", "Quick actions")}</h4>
        <div class="xa-qgrid">${AI_ACTIONS.map(([id, label]) => `<button type="button" data-act="ai" data-v="${id}" data-k="aiq-${id}"${s.aiBusy ? " disabled" : ""}>${L(label)}</button>`).join("")}</div>
      </aside>
    </div>`;
  }

  function viewAutomations(s) {
    const active = s.autos.filter((a) => a.on).length;
    const runs = s.autos.reduce((n, a) => n + a.runs, 0);
    const saved = s.autos.reduce((n, a) => n + a.runs * a.saves, 0);
    const tabs = [["list", T("Automationen", "Automations"), "zap"], ["templates", T("Vorlagen", "Templates"), "copy"], ["log", T("Verlauf", "History"), "clock"]];
    let body;
    if (s.autoTab === "templates") {
      body = `<ul class="xa-alist">${s.templates.map((t) => `<li class="xa-card xa-auto"><span class="xa-icon-tile">${icon("copy")}</span><div class="xa-grow"><b>${esc(L(t.name))}</b><small class="xa-muted">${esc(L(t.when))} · ${T(`spart ca. ${t.saves} Min. pro Lauf`, `saves about ${t.saves} min per run`)}</small></div><button type="button" class="xa-btn xa-primary" data-act="use-tpl" data-id="${t.id}" data-k="tpl-${t.id}">${T("Verwenden", "Use")}</button></li>`).join("") || `<li class="xa-empty">${T("Alle Vorlagen sind schon im Einsatz.", "All templates are already in use.")}</li>`}</ul>`;
    } else if (s.autoTab === "log") {
      body = `<ul class="xa-alist xa-log">${s.autoLog.map((l) => `<li><span class="xa-dot" style="--h:${l.ok ? "#45C99B" : "#E05E6D"}"></span><span class="xa-grow">${esc(L(l.name))}</span><span class="xa-status is-ok">${T("Erfolgreich", "Succeeded")}</span><span class="xa-mono xa-muted">${esc(L(l.at))}</span></li>`).join("")}</ul>`;
    } else {
      body = `<ul class="xa-alist">${s.autos.map((a) => `<li class="xa-card xa-auto${a.on ? "" : " is-off"}"><span class="xa-icon-tile">${icon("zap")}</span><div class="xa-grow"><b id="xa-an-${a.id}-${uid}">${esc(L(a.name))}</b><small class="xa-muted">${esc(L(a.when))} · ${T(`${a.runs} Läufe`, `${a.runs} runs`)}</small></div><button type="button" class="xa-mini" data-act="run" data-id="${a.id}" data-k="run-${a.id}"${a.on ? "" : " disabled"}>${icon("play")}${T("Jetzt ausführen", "Run now")}</button>${sw("auto", a.id, a.on, `xa-an-${a.id}-${uid}`)}</li>`).join("")}</ul>`;
    }
    return `<div class="xa-files">
      <nav class="xa-subnav" aria-label="${T("Automation", "Automation")}"><h4 class="xa-subnav-h">Automation</h4>${tabs.map(([id, label, i]) => `<button type="button" data-act="autotab" data-v="${id}" data-k="at-${id}" aria-pressed="${s.autoTab === id}">${icon(i)}${label}</button>`).join("")}</nav>
      <div class="xa-files-main">
        ${pageHead(T("Automationen", "Automations"), T("Lass Xyntal die Routine erledigen.", "Let Xyntal handle the routine."), `<button type="button" class="xa-btn xa-primary" data-act="autotab" data-v="templates" data-k="a-new">${icon("plus")}${T("Neue Automation", "New automation")}</button>`)}
        <div class="xa-stats4">
          <div class="xa-card xa-stat"><div><b>${active} / ${s.autos.length}</b><small>${T("Aktive Automationen", "Active automations")}</small></div></div>
          <div class="xa-card xa-stat"><div><b>${runs}</b><small>${T("Läufe (30 Tage)", "Runs (30 days)")}</small></div></div>
          <div class="xa-card xa-stat"><div><b>100 %</b><small>${T("Erfolgsrate", "Success rate")}</small></div></div>
          <div class="xa-card xa-stat"><div><b>${Math.floor(saved / 60)} ${T("Std.", "h")} ${saved % 60} Min</b><small>${T("Gesparte Zeit (geschätzt)", "Time saved (estimated)")}</small></div></div>
        </div>
        ${body}
      </div>
    </div>`;
  }

  const KINDS = { personal: ["Persönlich", "Personal", "user", "#B36BFF"], work: ["Arbeitsbereiche", "Workspaces", "grid", "#007AFF"], milestone: ["Meilensteine", "Milestones", "flag", "#D9A54E"], focus: ["Fokusblöcke", "Focus blocks", "target", "#45C99B"] };
  function viewCalendar(s) {
    const c = s.cal;
    const H0 = 8, H1 = 19;
    const visible = c.events.filter((e) => !c.hidden[e.kind]);
    const sel = c.events.find((e) => e.id === c.sel);
    const dayEvents = visible.filter((e) => e.day === c.day).sort((a, b) => a.s - b.s);
    const planned = dayEvents.reduce((n, e) => n + (e.e - e.s), 0);
    const dates = [2, 3, 4, 5, 6, 7, 8];
    const month = [];
    for (let d = -5; d <= 36; d++) month.push(d); // Oktober-Ende bis Dezember-Anfang, Montag zuerst
    return `<div class="xa-cal">
      <aside class="xa-cal-side">
        <div class="xa-mini-cal"><b>${T("November 2026", "November 2026")}</b>
          <div class="xa-mc-grid" aria-hidden="true">${DAYS.map((d) => `<span class="xa-mc-h">${L(d)[0]}</span>`).join("")}${month.map((d) => { const inMonth = d >= 1 && d <= 30; const n = d < 1 ? 31 + d : d > 30 ? d - 30 : d; const wk = d >= 2 && d <= 8; return `<span class="${inMonth ? "" : "is-out"}${wk ? " is-week" : ""}${d === 2 + c.day ? " is-sel" : ""}">${n}</span>`; }).join("")}</div></div>
        <h4 class="xa-kicker xa-mt">${T("Quellen", "Sources")}</h4>
        <ul class="xa-switches">${Object.entries(KINDS).map(([k, v]) => `<li><span class="xa-dot" style="--h:${v[3]}"></span><span class="xa-grow" id="xa-k-${k}-${uid}">${en() ? v[1] : v[0]}</span>${sw("kind", k, !c.hidden[k], `xa-k-${k}-${uid}`)}</li>`).join("")}</ul>
      </aside>
      <div class="xa-cal-main" role="region" aria-label="${T("Wochenansicht", "Week view")}">
        <header class="xa-cal-head"><h3 class="xa-title" tabindex="-1" data-k="title">${icon("calendar")}${T("Kalender", "Calendar")}</h3><span class="xa-muted">${T("2. – 8. Nov. 2026", "2 – 8 Nov 2026")}</span><span class="xa-grow"></span>
          <div class="xa-seg" role="group" aria-label="${T("Ansicht", "View")}"><button type="button" data-act="calview" data-v="week" data-k="cv-week" aria-pressed="${c.view === "week"}">${T("Woche", "Week")}</button><button type="button" data-act="calview" data-v="agenda" data-k="cv-agenda" aria-pressed="${c.view === "agenda"}">${T("Agenda", "Agenda")}</button></div>
          <button type="button" class="xa-btn xa-primary" data-act="cal-add" data-k="cal-add">${icon("plus")}${T("Fokusblock", "Focus block")}</button></header>
        <div class="xa-days" role="group" aria-label="${T("Tag wählen", "Pick a day")}">${DAYS.map((d, i) => { const ms = visible.some((e) => e.day === i && e.kind === "milestone"); return `<button type="button" data-act="calday" data-v="${i}" data-k="cd-${i}" aria-pressed="${c.day === i}"><small>${L(d)}</small><b>${dates[i]}</b>${ms ? `<i class="xa-ms-dot" aria-label="${T("Meilenstein", "Milestone")}"></i>` : ""}</button>`; }).join("")}</div>
        <div class="xa-week" data-view="${c.view}" data-scroll="week">
          <div class="xa-wgrid" style="--rows:${H1 - H0}">
            <div class="xa-hours" aria-hidden="true">${Array.from({ length: H1 - H0 }, (_, i) => `<span>${String(H0 + i).padStart(2, "0")}:00</span>`).join("")}</div>
            ${DAYS.map((d, i) => `<div class="xa-wcol${i === c.day ? " is-day" : ""}${i === 0 ? " is-today" : ""}" data-day="${i}">${visible.filter((e) => e.day === i).map((e) => `<button type="button" class="xa-ev xa-ev-${e.kind}${e.id === c.sel ? " is-sel" : ""}" style="top:calc(${e.s - H0} * var(--hh));height:calc(${e.e - e.s} * var(--hh) - 3px)" data-act="ev" data-id="${e.id}" data-k="ev-${e.id}" aria-pressed="${e.id === c.sel}"><b>${esc(L(e.title))}</b><small>${fmtH(e.s)}–${fmtH(e.e)}</small></button>`).join("")}${i === 0 ? `<span class="xa-now" style="top:calc(1.6 * var(--hh))" aria-hidden="true"></span>` : ""}</div>`).join("")}
          </div>
        </div>
        <ul class="xa-agenda" data-view="${c.view}">${dayEvents.map((e) => `<li><button type="button" class="xa-ag xa-ev-${e.kind}${e.id === c.sel ? " is-sel" : ""}" data-act="ev" data-id="${e.id}" data-k="ag-${e.id}" aria-pressed="${e.id === c.sel}"><span class="xa-mono">${fmtH(e.s)}–${fmtH(e.e)}</span><b>${esc(L(e.title))}</b></button></li>`).join("") || `<li class="xa-empty">${T("Frei. Tipp: Lege einen Fokusblock an.", "Free. Tip: add a focus block.")}</li>`}</ul>
        <p class="xa-cal-foot xa-muted">${T("Klick auf eine freie Stelle legt einen Fokusblock an.", "Click an empty slot to add a focus block.")}</p>
      </div>
      <aside class="xa-cal-brief" aria-label="${T("Tagesbriefing", "Daily briefing")}">
        <h4>${T("Tagesbriefing", "Daily briefing")}</h4><p class="xa-muted">${L(DAYS[c.day])}, ${dates[c.day]}. Nov · ${T(`${planned} Std. verplant`, `${planned} h planned`)}</p>
        ${sel ? `<div class="xa-card xa-evcard xa-ev-${sel.kind}"><span class="xa-kicker">${en() ? KINDS[sel.kind][1] : KINDS[sel.kind][0]}</span><b>${esc(L(sel.title))}</b><small class="xa-muted">${L(DAYS[sel.day])} · ${fmtH(sel.s)}–${fmtH(sel.e)}</small>
          <div class="xa-row">${sel.kind === "focus" ? `<button type="button" class="xa-btn xa-primary" data-act="focus-start" data-k="ev-focus">${icon("play")}${T("Fokus starten", "Start focus")}</button>` : ""}${sel.user || sel.kind === "focus" ? `<button type="button" class="xa-btn" data-act="ev-del" data-id="${sel.id}" data-k="ev-del">${icon("trash")}${T("Entfernen", "Remove")}</button>` : ""}</div></div>` : ""}
        <h4 class="xa-kicker xa-mt">${T("Zeitplan", "Schedule")}</h4>
        ${dayEvents.length ? `<ul class="xa-brief">${dayEvents.map((e) => `<li><span class="xa-dot" style="--h:${KINDS[e.kind][3]}"></span><span class="xa-mono">${fmtH(e.s)}</span>${esc(L(e.title))}</li>`).join("")}</ul>` : `<p class="xa-muted">${T("An diesem Tag ist noch nichts geplant.", "Nothing planned for this day yet.")}</p>`}
        <h4 class="xa-kicker xa-mt">${T("Freie Fokuszeit", "Free focus time")}</h4><p class="xa-muted">${T(`Du hast ${Math.max(0, 9 - planned)} Stunden ohne Termine zwischen 09:00 und 18:00.`, `You have ${Math.max(0, 9 - planned)} hours without meetings between 09:00 and 18:00.`)}</p>
      </aside>
    </div>`;
  }

  const VIEWS = { home: viewHome, focus: viewFocus, workspaces: viewWorkspaces, projects: viewProjects, messages: viewMessages, discover: viewDiscover, communities: viewCommunities, files: viewFiles, ai: viewAi, automations: viewAutomations, calendar: viewCalendar };
  const ctaLinks = (primary, secondary) => signedIn
    ? `<a class="${primary}" href="/profil">${icon("download")}${T("App herunterladen", "Download the app")}</a><a class="${secondary}" href="/beta">${T("Zum Beta-Programm", "Beta programme")}</a>`
    : `<a class="${primary}" href="/#warteliste">${T("Auf die Warteliste", "Join the waitlist")}</a><a class="${secondary}" href="/profil">${icon("download")}${T("Beta-Tester: App laden", "Beta testers: get the app")}</a>`;

  /* ---------- Rahmen: Titelleiste und Seitenleiste ---------- */
  function crumbs(s) {
    const a = AREAS.find((x) => x.id === s.route.area);
    let c = esc(L(a.label));
    if (s.route.area === "workspaces" && s.route.id) c += ` <span>/</span> ${esc(s.workspaces.find((w) => w.id === s.route.id)?.name || "")}`;
    if (s.route.area === "projects" && s.route.id) c += ` <span>/</span> ${esc(L(proj(s, s.route.id)?.name || ""))}`;
    return c;
  }
  function frame(s) {
    const u = unread(s);
    const notifs = [
      { act: "convo", id: "aylin", icon: "message", text: T("Aylin fragt nach dem Design-Review", "Aylin is asking about the design review"), at: "10:02" },
      { act: "builder-open", id: "noah", icon: "compass", text: T("Neuer Vorschlag: Noah Becker (94 %)", "New suggestion: Noah Becker (94%)"), at: "09:40" },
      { act: "go", area: "calendar", icon: "flag", text: T("Closed Beta in 5 Tagen", "Closed beta in 5 days"), at: T("Heute", "Today") },
    ];
    return `<div class="xa-titlebar">
        <span class="xa-brand">${LOGO()}<b>Xyntal</b></span>
        <button type="button" class="xa-iconbtn xa-nav-h" data-act="back" data-k="tb-back" aria-label="${T("Zurück", "Back")}"${s.back.length ? "" : " disabled"}>${icon("chevL")}</button>
        <button type="button" class="xa-iconbtn xa-nav-h" data-act="fwd" data-k="tb-fwd" aria-label="${T("Vorwärts", "Forward")}"${s.fwd.length ? "" : " disabled"}>${icon("chevR")}</button>
        <span class="xa-crumb">${crumbs(s)}</span>
        <div class="xa-search"><label class="xa-sr" for="xa-q-${uid}">${T("Suchen oder springen", "Search or jump to")}</label>${icon("search")}<input id="xa-q-${uid}" type="search" autocomplete="off" data-input="search" data-k="search" placeholder="${T("Suchen oder springen …", "Search or jump to …")}" aria-controls="xa-res-${uid}" aria-expanded="false"><div class="xa-results" id="xa-res-${uid}" hidden></div></div>
        <span class="xa-grow"></span>
        <button type="button" class="xa-ask-btn" data-act="go" data-area="ai" data-k="tb-ask" aria-label="${T("Xyntal fragen", "Ask Xyntal")}">${icon("sparkle")}<span>${T("Xyntal fragen", "Ask Xyntal")}</span></button>
        <span class="xa-demo-pill" title="${T("Alle Inhalte sind Beispieldaten", "All content is sample data")}"><i></i>DEMO</span>
        <div class="xa-bell-wrap"><button type="button" class="xa-iconbtn xa-bell" data-act="notif" data-k="tb-bell" aria-expanded="${s.notifOpen}" aria-label="${T("Benachrichtigungen", "Notifications")}">${icon("bell")}<i></i></button>
          ${s.notifOpen ? `<div class="xa-pop" role="dialog" aria-label="${T("Benachrichtigungen", "Notifications")}"><b>${T("Benachrichtigungen", "Notifications")}</b><ul>${notifs.map((n) => `<li><button type="button" data-act="${n.act}" data-id="${n.id || ""}" data-area="${n.area || ""}" data-k="nt-${n.id || n.area}">${icon(n.icon)}<span class="xa-grow">${n.text}</span><small>${n.at}</small></button></li>`).join("")}</ul></div>` : ""}</div>
        <span class="xa-av xa-me" style="--h:#007AFF" title="Lena Vogt">LV</span>
        <span class="xa-winctl" aria-hidden="true">${icon("minus")}${icon("square")}${icon("x")}</span>
      </div>
      <div class="xa-body${s.collapsed ? " is-collapsed" : ""}">
        <nav class="xa-side" aria-label="${T("Bereiche der App", "App areas")}">
          <ul>${AREAS.map((a) => `<li><button type="button" class="xa-nav" data-act="go" data-area="${a.id}" data-k="nav-${a.id}"${s.route.area === a.id ? ' aria-current="page"' : ""}>${icon(a.icon)}<span>${L(a.label)}</span>${a.id === "messages" && u ? `<span class="xa-badge" aria-label="${T(`${u} ungelesen`, `${u} unread`)}">${u}</span>` : ""}</button></li>`).join("")}</ul>
          <div class="xa-side-foot"><span class="xa-nav xa-static" aria-hidden="true">${icon("user")}<span>${T("Profil", "Profile")}</span></span><span class="xa-nav xa-static" aria-hidden="true">${icon("settings")}<span>${T("Einstellungen", "Settings")}</span></span>
            <button type="button" class="xa-nav xa-collapse" data-act="collapse" data-k="collapse" aria-expanded="${!s.collapsed}" aria-label="${s.collapsed ? T("Seitenleiste ausklappen", "Expand sidebar") : T("Seitenleiste einklappen", "Collapse sidebar")}">${icon(s.collapsed ? "chevR" : "chevL")}<span>${T("Einklappen", "Collapse")}</span></button></div>
        </nav>
        <div class="xa-content" data-scroll="content" data-area="${s.route.area}">${area(s)}</div>
      </div>`;
  }
  const area = (s) => {
    const r = s.route;
    if (r.area === "workspaces" && r.id) return viewWorkspace(s, r.id);
    if (r.area === "projects" && r.id) return viewProject(s, r.id);
    return VIEWS[r.area](s);
  };
  let logoN = 0;
  const LOGO = () => { const n = "xa" + uid + "-" + (logoN++ % 4); return `<svg class="xa-logo" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${n}a" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#B36BFF"/><stop offset="1" stop-color="#3A8AFF"/></linearGradient><linearGradient id="${n}b" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3A8AFF"/><stop offset="1" stop-color="#3FE0F0"/></linearGradient><mask id="${n}m" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="#000" stroke-width="7.4" stroke-linecap="round"/></mask></defs><path d="M3 3Q15.41 8.59 21 21" fill="none" stroke="url(#${n}b)" stroke-width="4.6" stroke-linecap="round" mask="url(#${n}m)"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="url(#${n}a)" stroke-width="4.6" stroke-linecap="round"/></svg>`; };

  /* ---------- Einbinden ---------- */
  hosts.forEach((host, hostIndex) => {
    let s = seed();
    const myUid = hostIndex;
    host.classList.add("xa-host");
    host.setAttribute("data-no-i18n", "");
    host.innerHTML = `<div class="xa-strip"></div><div class="xa-frame"><div class="xa-app"></div><div class="xa-toast" role="status" aria-live="polite"></div></div><p class="xa-swipe-hint" aria-hidden="true"></p>`;
    const strip = host.querySelector(".xa-strip");
    const app = host.querySelector(".xa-app");
    const toastEl = host.querySelector(".xa-toast");
    let timer = null, toastT = null, pending = [];

    const renderStrip = () => {
      strip.innerHTML = `<span class="xa-badge-demo"><i aria-hidden="true"></i>${T("Demo mit Beispieldaten", "Demo with sample data")}</span>
        <p>${T("Klick dich frei durch die App. Alles bleibt in deinem Browser, nichts wird gespeichert oder gesendet.", "Click through the app freely. Everything stays in your browser; nothing is saved or sent.")}</p>
        <div class="xa-strip-act"><button type="button" class="xa-sbtn" data-act="reset">${icon("reset")}${T("Zurücksetzen", "Reset")}</button>${ctaLinks("xa-sbtn xa-sbtn-primary", "xa-sbtn")}</div>`;
      host.querySelector(".xa-swipe-hint").textContent = T("← Bereiche seitlich wischen →", "← Swipe for more areas →");
    };

    const render = (opts = {}) => {
      uid = myUid;
      const active = document.activeElement;
      const key = app.contains(active) ? active.dataset.k : null;
      const scrolls = {};
      if (!opts.newArea) app.querySelectorAll("[data-scroll]").forEach((el) => { scrolls[el.dataset.scroll] = el.scrollTop; });
      const values = {};
      if (!opts.newArea) app.querySelectorAll("input[data-k]:not([type=checkbox])").forEach((el) => { values[el.dataset.k] = el.value; });
      const inContent = !!active?.closest?.(".xa-content");
      const navScroll = app.querySelector(".xa-side ul")?.scrollLeft || 0;
      app.innerHTML = frame(s);
      Object.entries(values).forEach(([k, v]) => { const el = app.querySelector(`input[data-k="${k}"]`); if (el && !el.value) el.value = v; });
      app.querySelectorAll("[data-scroll]").forEach((el) => {
        const k = el.dataset.scroll;
        if ((k === "thread" || k === "ai") && opts.toBottom) el.scrollTop = el.scrollHeight;
        else if (scrolls[k] !== undefined) el.scrollTop = scrolls[k];
      });
      const nav = app.querySelector(".xa-side ul");
      if (nav) nav.scrollLeft = navScroll;
      if (opts.focusTitle) {
        app.querySelector(".xa-content")?.scrollTo?.(0, 0);
        // Auf dem Telefon ist das Fenster länger als der Bildschirm: zurück zum Anfang des Bereichs
        const top = app.getBoundingClientRect().top;
        if (top < 0) window.scrollBy({ top: top - 76, behavior: calm ? "auto" : "smooth" });
      }
      if (opts.focus) app.querySelector(opts.focus)?.focus({ preventScroll: false });
      else if (key) {
        const el = app.querySelector(`[data-k="${CSS.escape(key)}"]`);
        if (el && !el.disabled) el.focus({ preventScroll: true });
        else if (inContent || opts.focusTitle) app.querySelector(".xa-content [data-k=title]")?.focus({ preventScroll: true });
      }
      if (opts.revealNav) app.querySelector('.xa-nav[aria-current="page"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    };

    const toast = (msg) => {
      toastEl.textContent = msg;
      toastEl.classList.add("is-on");
      clearTimeout(toastT);
      toastT = setTimeout(() => toastEl.classList.remove("is-on"), 2600);
    };
    const later = (fn, ms) => { const id = setTimeout(() => { pending = pending.filter((x) => x !== id); fn(); }, calm ? Math.min(ms, 300) : ms); pending.push(id); };

    const go = (route, push = true) => {
      if (push && (route.area !== s.route.area || route.id !== s.route.id)) { s.back.push(s.route); s.fwd = []; }
      s.route = route;
      s.notifOpen = false;
      if (route.area === "messages") { const c = s.convos.find((x) => x.id === s.convo); if (c) c.unread = 0; }
      render({ newArea: true, focusTitle: true, revealNav: true, toBottom: true });
      const a = AREAS.find((x) => x.id === route.area);
      announce(T(`${L(a.label)} geöffnet`, `${L(a.label)} opened`));
    };
    const announce = (msg) => { toastEl.textContent = ""; toastEl.classList.remove("is-on"); setTimeout(() => { toastEl.textContent = msg; }, 30); };
    const findTask = (id) => allTasks(s).find((x) => x.t.id === id);

    const tick = () => {
      const f = s.focus;
      if (!f.running) return;
      f.left -= 1; f.spent += 1;
      if (f.left <= 0) {
        f.running = false; f.left = f.total; clearInterval(timer); timer = null;
        toast(T("Fokusblock geschafft! Zeit für eine Pause.", "Focus block done! Time for a break."));
        if (s.route.area === "focus") render();
        return;
      }
      const r = app.querySelector("[data-timer-ring]");
      if (r) r.innerHTML = timerRing(f);
      const t = app.querySelector("[data-today]");
      if (t) t.textContent = `${(1.2 + f.spent / 3600).toFixed(1)} ${T("Std.", "h")}`;
    };
    const setRunning = (on) => {
      s.focus.running = on;
      clearInterval(timer); timer = null;
      if (on) timer = setInterval(tick, 1000);
    };

    const askAi = (kind, q, shown) => {
      if (s.aiBusy) return;
      const label = AI_ACTIONS.find(([id]) => id === kind)?.[1];
      s.ai.push({ role: "user", text: shown || q || (label ? L(label) : "") });
      s.aiBusy = true;
      if (s.route.area !== "ai") go({ area: "ai" }); else render({ toBottom: true });
      later(() => { s.aiBusy = false; s.ai.push({ role: "ai", kind, q }); if (s.route.area === "ai") render({ toBottom: true, focus: "[data-k=ai-input]" }); announce(T("Xyntal KI hat geantwortet.", "Xyntal AI has replied.")); }, 1100);
    };

    const actions = {
      reset() {
        pending.forEach(clearTimeout); pending = [];
        setRunning(false);
        s = seed();
        render({ newArea: true });
        toast(T("Demo zurückgesetzt.", "Demo reset."));
      },
      go: (el) => go({ area: el.dataset.area }),
      back() { if (!s.back.length) return; s.fwd.push(s.route); go(s.back.pop(), false); },
      fwd() { if (!s.fwd.length) return; s.back.push(s.route); go(s.fwd.pop(), false); },
      collapse() { s.collapsed = !s.collapsed; render(); },
      notif() { s.notifOpen = !s.notifOpen; render(); },
      "builder-open": (el) => { s.builder = el.dataset.id; go({ area: "discover" }); },
      ws: (el) => go({ area: "workspaces", id: el.dataset.id }),
      project: (el) => go({ area: "projects", id: el.dataset.id }),
      fav(el) { s.favs[el.dataset.id] = !s.favs[el.dataset.id]; render(); },
      newtask() { go({ area: "projects", id: "app" }); render({ focus: "[data-k=addtask]" }); },
      taskfilter(el) { s.taskFilter = el.dataset.v; render(); },
      wsfilter(el) { s.wsFilter = el.dataset.v; render(); },
      projfilter(el) { s.projFilter = el.dataset.v; render(); },
      move(el) {
        const x = findTask(el.dataset.id); if (!x) return;
        x.t.status = el.dataset.to;
        render({ focus: `[data-k="mv-${x.t.id}"]` });
        toast(x.t.status === "done" ? T(`Erledigt: ${L(x.t.title)}`, `Done: ${L(x.t.title)}`) : x.t.status === "doing" ? T(`In Arbeit: ${L(x.t.title)}`, `In progress: ${L(x.t.title)}`) : T(`Wieder offen: ${L(x.t.title)}`, `Reopened: ${L(x.t.title)}`));
      },
      "focus-start"() { setRunning(true); go({ area: "focus" }); toast(T("Fokusblock läuft. 50 Minuten, keine Ablenkung.", "Focus block running. 50 minutes, no distractions.")); },
      "focus-toggle"() { setRunning(!s.focus.running); render(); },
      "focus-reset"() { setRunning(false); s.focus.left = s.focus.total; render(); },
      "focus-done"() {
        const ft = focusTask(s); if (!ft) return;
        ft.t.status = "done"; s.focus.done += 1; s.focus.task = null;
        render({ focus: "[data-k=f-main]" });
        toast(T(`Erledigt: ${L(ft.t.title)}`, `Done: ${L(ft.t.title)}`));
      },
      "focus-pick"(el) { s.focus.task = el.dataset.id; render({ focus: "[data-k=f-main]" }); },
      "blocks-all"() { const all = Object.values(s.focus.blocks).every(Boolean); Object.keys(s.focus.blocks).forEach((k) => { s.focus.blocks[k] = !all; }); render(); },
      block(el) { s.focus.blocks[el.dataset.id] = !s.focus.blocks[el.dataset.id]; render(); },
      convo(el) {
        s.convo = el.dataset.id;
        const c = s.convos.find((x) => x.id === s.convo); if (c) c.unread = 0;
        if (s.route.area !== "messages") go({ area: "messages" }); else render({ toBottom: true });
      },
      chatfilter(el) { s.chatFilter = el.dataset.v; render(); },
      "ask-chat"() { askAi("chat", null, T("Fasse dieses Gespräch zusammen.", "Summarise this conversation.")); },
      role(el) { s.role = el.dataset.v; render(); },
      builder(el) {
        s.builder = el.dataset.id; render();
        app.querySelector("[data-explain]")?.scrollIntoView?.({ block: "nearest", behavior: calm ? "auto" : "smooth" });
      },
      connect(el) {
        const id = el.dataset.id; s.connected[id] = !s.connected[id];
        const b = s.builders.find((x) => x.id === id);
        render();
        toast(s.connected[id] ? T(`Anfrage an ${b.name} gesendet (Demo).`, `Request sent to ${b.name} (demo).`) : T("Anfrage zurückgezogen.", "Request withdrawn."));
      },
      commfilter(el) { s.commFilter = el.dataset.v; render(); },
      join(el) {
        const c = s.communities.find((x) => x.id === el.dataset.id); c.joined = !c.joined; render();
        toast(c.joined ? T(`Willkommen in „${L(c.name)}“!`, `Welcome to “${L(c.name)}”!`) : T(`„${L(c.name)}“ verlassen.`, `Left “${L(c.name)}”.`));
      },
      rsvp(el) { const e = s.events.find((x) => x.id === el.dataset.id); e.going = !e.going; render(); },
      fileview(el) { s.fileView = el.dataset.v; render(); },
      filetype(el) { s.fileType = el.dataset.v; render(); },
      file(el) { s.fileSel = s.fileSel === el.dataset.id ? null : el.dataset.id; render(); },
      filestar(el) { s.fileStars[el.dataset.id] = !s.fileStars[el.dataset.id]; render(); },
      upload() { toast(T("In der Demo werden keine Dateien hochgeladen.", "The demo doesn't upload any files.")); },
      "file-ai"(el) { const f = s.files.find((x) => x.id === el.dataset.id); askAi("file:" + f.id, null, T(`Fasse ${f.name} zusammen.`, `Summarise ${f.name}.`)); },
      ai(el) { askAi(el.dataset.v); },
      "ai-new"() { if (s.aiBusy) return; s.ai = []; render({ focus: "[data-k=ai-input]" }); },
      autotab(el) { s.autoTab = el.dataset.v; render(); },
      auto(el) { const a = s.autos.find((x) => x.id === el.dataset.id); a.on = !a.on; render(); toast(a.on ? T("Automation aktiviert.", "Automation enabled.") : T("Automation pausiert.", "Automation paused.")); },
      run(el) {
        const a = s.autos.find((x) => x.id === el.dataset.id); if (!a.on) return;
        a.runs += 1; s.autoLog.unshift({ name: a.name, at: [`${T("Heute", "Today")}, ${nowTime()}`, `Today, ${nowTime()}`], ok: true });
        render();
        toast(T(`„${L(a.name)}“ ausgeführt.`, `“${L(a.name)}” ran.`));
      },
      "use-tpl"(el) {
        const t = s.templates.find((x) => x.id === el.dataset.id);
        s.templates = s.templates.filter((x) => x !== t);
        s.autos.push({ id: "u" + t.id, name: t.name, when: t.when, on: true, runs: 0, saves: t.saves });
        s.autoTab = "list"; render();
        toast(T("Vorlage übernommen und aktiviert.", "Template added and enabled."));
      },
      calview(el) { s.cal.view = el.dataset.v; render(); },
      calday(el) { s.cal.day = Number(el.dataset.v); s.cal.sel = null; render(); },
      ev(el) { const e = s.cal.events.find((x) => x.id === el.dataset.id); s.cal.sel = s.cal.sel === e.id ? null : e.id; s.cal.day = e.day; render(); },
      "ev-del"(el) { s.cal.events = s.cal.events.filter((e) => e.id !== el.dataset.id); s.cal.sel = null; render({ focus: "[data-k=cal-add]" }); toast(T("Termin entfernt.", "Event removed.")); },
      "cal-add"() { addBlock(s.cal.day, null); },
      kind(el) { s.cal.hidden[el.dataset.id] = !s.cal.hidden[el.dataset.id]; render(); },
    };
    let evN = 0;
    const addBlock = (day, hour) => {
      const busy = (h) => s.cal.events.some((e) => e.day === day && h < e.e && h + 1 > e.s);
      let h = hour;
      if (h === null) { h = 9; while (h <= 17 && busy(h)) h += 0.5; }
      if (h > 17.5 || busy(h)) { toast(T("Da ist schon etwas geplant.", "Something is already planned there.")); return; }
      const ft = focusTask(s);
      const e = { id: "n" + (++evN), day, s: h, e: h + 1, kind: "focus", user: true, title: ft ? [`Fokus: ${ft.t.title[0]}`, `Focus: ${ft.t.title[1]}`] : ["Fokusblock", "Focus block"] };
      s.cal.events.push(e); s.cal.day = day; s.cal.sel = e.id; s.cal.hidden.focus = false;
      render();
      toast(T(`Fokusblock am ${L(DAYS[day])} um ${fmtH(h)} angelegt.`, `Focus block added on ${L(DAYS[day])} at ${fmtH(h)}.`));
    };

    app.addEventListener("click", (e) => {
      const col = e.target.closest(".xa-wcol");
      if (col && !e.target.closest(".xa-ev")) {
        const r = col.getBoundingClientRect();
        const hh = r.height / 11;
        const h = 8 + Math.floor(((e.clientY - r.top) / hh) * 2) / 2;
        addBlock(Number(col.dataset.day), Math.min(17.5, h));
        return;
      }
      const el = e.target.closest("[data-act]");
      if (el && actions[el.dataset.act] && el.tagName !== "INPUT") { e.preventDefault(); actions[el.dataset.act](el); return; }
      if (s.notifOpen && !e.target.closest(".xa-bell-wrap")) { s.notifOpen = false; render(); }
    });
    strip.addEventListener("click", (e) => { const el = e.target.closest("[data-act=reset]"); if (el) actions.reset(); });
    app.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.act !== "task") return;
      const x = findTask(el.dataset.id); if (!x) return;
      x.t.status = el.checked ? "done" : x.t.status === "done" ? "todo" : x.t.status;
      render();
      toast(el.checked ? T(`Erledigt: ${L(x.t.title)}`, `Done: ${L(x.t.title)}`) : T(`Wieder offen: ${L(x.t.title)}`, `Reopened: ${L(x.t.title)}`));
    });

    // Suche in der Titelleiste: springt zu Bereichen, Projekten, Leuten und Dateien.
    const searchItems = () => [
      ...AREAS.map((a) => ({ label: L(a.label), kind: T("Bereich", "Area"), run: () => go({ area: a.id }) })),
      ...s.projects.map((p) => ({ label: L(p.name), kind: T("Projekt", "Project"), run: () => go({ area: "projects", id: p.id }) })),
      ...s.workspaces.map((w) => ({ label: w.name, kind: T("Arbeitsbereich", "Workspace"), run: () => go({ area: "workspaces", id: w.id }) })),
      ...s.builders.map((b) => ({ label: b.name, kind: T("Builder", "Builder"), run: () => { s.builder = b.id; go({ area: "discover" }); } })),
      ...s.files.map((f) => ({ label: f.name, kind: T("Datei", "File"), run: () => { s.fileSel = f.id; s.fileType = "all"; s.fileView = "all"; s.fileQuery = ""; go({ area: "files" }); } })),
      ...allTasks(s).map((x) => ({ label: L(x.t.title), kind: T("Aufgabe", "Task"), run: () => go({ area: "projects", id: x.p.id }) })),
    ];
    let hits = [];
    const showResults = (input) => {
      const box = app.querySelector(".xa-results");
      const q = input.value.trim().toLowerCase();
      hits = q ? searchItems().filter((x) => x.label.toLowerCase().includes(q)).slice(0, 6) : [];
      box.hidden = !q;
      input.setAttribute("aria-expanded", String(!!q));
      box.innerHTML = q ? (hits.length ? `<ul>${hits.map((h, i) => `<li><button type="button" data-hit="${i}"><span>${esc(h.label)}</span><small>${esc(h.kind)}</small></button></li>`).join("")}</ul>` : `<p>${T("Nichts gefunden.", "Nothing found.")}</p>`) : "";
    };
    app.addEventListener("input", (e) => {
      const el = e.target;
      if (el.dataset.input === "search") showResults(el);
      if (el.dataset.input === "filequery") {
        s.fileQuery = el.value;
        const pos = el.selectionStart;
        render();
        const n = app.querySelector("[data-k=fq]");
        if (n) { n.focus(); n.setSelectionRange(pos, pos); }
      }
    });
    app.addEventListener("mousedown", (e) => { if (e.target.closest("[data-hit]")) e.preventDefault(); });
    app.addEventListener("click", (e) => {
      const b = e.target.closest("[data-hit]");
      if (!b) return;
      const h = hits[Number(b.dataset.hit)];
      const input = app.querySelector("[data-k=search]");
      if (input) input.value = "";
      if (h) h.run();
    });
    app.addEventListener("focusout", (e) => {
      if (e.target.dataset?.input === "search" && !app.querySelector(".xa-search")?.contains(e.relatedTarget)) {
        const box = app.querySelector(".xa-results"); if (box) box.hidden = true;
        e.target.setAttribute("aria-expanded", "false");
      }
    });

    app.addEventListener("keydown", (e) => {
      const t = e.target;
      if (t.dataset?.input === "search") {
        if (e.key === "Enter") { e.preventDefault(); const h = hits[0]; if (h) { t.value = ""; h.run(); } }
        else if (e.key === "ArrowDown") { e.preventDefault(); app.querySelector(".xa-results button")?.focus(); }
        else if (e.key === "Escape") { t.value = ""; showResults(t); }
        return;
      }
      if (t.dataset?.hit !== undefined) {
        const all = [...app.querySelectorAll(".xa-results button")];
        const i = all.indexOf(t);
        if (e.key === "ArrowDown") { e.preventDefault(); all[Math.min(all.length - 1, i + 1)]?.focus(); }
        if (e.key === "ArrowUp") { e.preventDefault(); (i ? all[i - 1] : app.querySelector("[data-k=search]")).focus(); }
        if (e.key === "Escape") { const input = app.querySelector("[data-k=search]"); input.value = ""; showResults(input); input.focus(); }
        return;
      }
      if (e.key === "Escape" && s.notifOpen) { s.notifOpen = false; render({ focus: "[data-k=tb-bell]" }); return; }
      // Pfeiltasten in der Seitenleiste wie in der App
      if (t.classList?.contains("xa-nav") && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
        const all = [...app.querySelectorAll(".xa-side button.xa-nav")];
        const i = all.indexOf(t);
        const next = e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : ["ArrowDown", "ArrowRight"].includes(e.key) ? (i + 1) % all.length : (i - 1 + all.length) % all.length;
        e.preventDefault(); all[next].focus();
      }
    });

    app.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target;
      const input = form.querySelector("input");
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      input.value = "";
      if (form.dataset.form === "addtask") {
        const p = proj(s, form.dataset.id);
        p.tasks.unshift(task("n" + Date.now(), [text, text], "mid", "todo", "LV", ["Diese Woche", "This week"]));
        render({ focus: "[data-k=addtask]" });
        toast(T("Aufgabe angelegt.", "Task added."));
      } else if (form.dataset.form === "chat") {
        const c = s.convos.find((x) => x.id === s.convo);
        c.msgs.push({ from: "LV", at: nowTime(), text: [text, text], mine: true });
        render({ toBottom: true, focus: "[data-k=chat-input]" });
        const reply = c.replied ? { from: c.reply.from, text: ["👍", "👍"] } : c.reply;
        c.replied = true;
        later(() => { s.typing = c.id; if (s.route.area === "messages" && s.convo === c.id) render({ toBottom: true }); }, 600);
        later(() => {
          s.typing = null;
          c.msgs.push({ from: reply.from, at: nowTime(), text: reply.text });
          if (s.route.area === "messages" && s.convo === c.id) render({ toBottom: true }); else { c.unread += 1; render(); }
          announce(`${PEOPLE[reply.from].name}: ${L(reply.text)}`);
        }, 1900);
      } else if (form.dataset.form === "ai") {
        askAi("free", text);
      }
    });

    document.addEventListener("xyntal:lang", () => { renderStrip(); render(); });
    renderStrip();
    render();
  });
})();
