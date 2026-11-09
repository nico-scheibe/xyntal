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
  let session = null;
  try {
    session = JSON.parse(localStorage.getItem("sb-db-auth-token") || "null");
    signedIn = !!session;
  } catch { /* privat */ }
  // Den Download sehen nur Beta-Tester (profiles.is_beta_tester – dieselbe Regel wie die
  // Download-Karte im Profil). Bis die Antwort da ist, wird kein Download gezeigt.
  let betaTester = false;
  const loadBetaAccess = async () => {
    const cfg = window.XYNTAL_CONFIG || {};
    const uid = session && session.user && session.user.id;
    const token = session && session.access_token;
    if (!uid || !token || !cfg.supabaseUrl || !cfg.supabaseKey) return false;
    if (session.expires_at && session.expires_at * 1000 < Date.now()) return false;
    try {
      const r = await fetch(`${cfg.supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}&select=is_beta_tester`, {
        headers: { apikey: cfg.supabaseKey, authorization: `Bearer ${token}` },
      });
      const rows = r.ok ? await r.json() : [];
      return Array.isArray(rows) && rows[0] && rows[0].is_beta_tester === true;
    } catch {
      return false;
    }
  };

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
    upgrade: '<circle cx="12" cy="12" r="9"/><path d="M12 16V8M8.5 11.5 12 8l3.5 3.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
    pin: '<path d="M9 4h6l-1 5 3 3H7l3-3zM12 12v8"/>',
    logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
    inbox: '<path d="M4 13h4l1.5 2.5h5L16 13h4"/><path d="M5.5 5h13L20 13v6H4v-6z"/>',
    gauge: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="m12 15 4-5"/><path d="M4 19h16"/>',
    map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/>',
    clip: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3h6v1.5M9 13l2 2 4-4"/>',
    alert: '<path d="M12 4 21 19.5H3z"/><path d="M12 10v4.5M12 17h.01"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9.5 8h5M9.5 12h5"/>',
    pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
    chart: '<path d="M4 20h16M7 20v-7M12 20V6M17 20v-10"/>',
    bulb: '<path d="M9 17h6M10 20.5h4"/><path d="M8.5 14a6 6 0 1 1 7 0c-.6.5-1 1.2-1 2v1h-5v-1c0-.8-.4-1.5-1-2z"/>',
    swap: '<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>',
    mappin: '<path d="M12 21s6.5-5.6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.400 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    mic: '<rect x="9" y="3.5" width="6" height="10.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.2 4.2 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>',
  };
  // Xyntal-KI-Zeichen der App: Sechseck mit „Auge“
  const AI_MARK = '<svg class="xa-i xa-aimark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg>';
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
    NB: { name: "Noah Becker", role: ["iOS-Entwickler", "iOS developer"], hue: "#3FE0F0" },
  };
  const AREAS = [
    { id: "forme", icon: "inbox", label: ["Für mich", "For me"] },
    { id: "home", icon: "home", label: ["Start", "Home"] },
    { id: "focus", icon: "target", label: ["Fokus", "Focus"] },
    { id: "workspaces", icon: "grid", label: ["Arbeitsbereiche", "Workspaces"] },
    { id: "messages", icon: "message", label: ["Nachrichten", "Messages"] },
    { id: "discover", icon: "compass", label: ["Entdecken", "Discover"] },
    { id: "communities", icon: "users", label: ["Communities", "Communities"] },
    { id: "files", icon: "folder", label: ["Dateien", "Files"] },
    { id: "ai-center", icon: "hexagon", label: ["KI-Center", "AI Center"] },
    { id: "automation", icon: "zap", label: ["Automationen", "Automations"] },
    { id: "calendar", icon: "calendar", label: ["Kalender", "Calendar"] },
  ];
  const DAYS = [["Mo", "Mon"], ["Di", "Tue"], ["Mi", "Wed"], ["Do", "Thu"], ["Fr", "Fri"], ["Sa", "Sat"], ["So", "Sun"]];
  const PRIO = { high: ["Hoch", "High"], mid: ["Mittel", "Medium"], low: ["Niedrig", "Low"] };
  // Werte wie in der App: Plan „Start“, Status „Online“
  const STATUS = [["online", ["Online", "Online"], "#45C99B"], ["away", ["Abwesend", "Away"], "#D9A54E"], ["busy", ["Beschäftigt", "Busy"], "#E05E6D"], ["dnd", ["Nicht stören", "Do not disturb"], "#E05E6D"], ["invisible", ["Unsichtbar", "Invisible"], "#8A8EA4"]];

  const task = (id, title, prio, status, who, due) => ({ id, title, prio, status, who, due: due || null });
  const seed = () => ({
    route: { area: "home" }, back: [], fwd: [],
    collapsed: false, notifOpen: false, acctOpen: false, searchOpen: false, status: "online",
    taskFilter: "all", taskScope: "mine", wsFilter: "all", wsQuery: "", wsSort: "name", discSort: "best", decFilter: "all", riskFilter: "active", projScope: "all", projQuery: "", projView: "board",
    favs: { loopr: true }, projStars: { app: true }, requested: {},
    openWs: [
      { id: "synth", code: "SL", name: "Synth Lab", hue: "#8B6CFF", desc: ["Open-Source-Plugins für Musikproduktion.", "Open-source plugins for music production."], members: 6, score: 88, mode: "join" },
      { id: "green", code: "GR", name: "Greenroute", hue: "#45C99B", desc: ["Routenplaner für Lastenräder.", "Route planner for cargo bikes."], members: 4, score: 79, mode: "request" },
    ],
    matchSaved: {}, matchHidden: {},
    workspaces: [
      { id: "loopr", code: "LS", name: "Loopr Studio", hue: "#007AFF", desc: ["KI-App: Du summst, sie macht den Song.", "AI app: you hum, it makes the song."], owner: true, role: "owner", plan: "PRO", tpl: "STARTUP", slug: "loopr-studio", members: ["LV", "JW", "AK", "MS"], milestone: ["Closed Beta · 7. Nov.", "Closed beta · 7 Nov"], online: 3 },
      { id: "kiez", code: "KK", name: "Kiezkiste", hue: "#3FE0F0", desc: ["Tauschbörse für die Nachbarschaft.", "A swap market for your neighbourhood."], owner: false, role: "admin", plan: "FREE", tpl: "BLANK", slug: "kiezkiste", members: ["TB", "LV", "SR"], milestone: ["MVP-Demo · 20. Nov.", "MVP demo · 20 Nov"], online: 1 },
      { id: "zirkel", code: "FZ", name: "Founder-Zirkel", hue: "#D9A54E", desc: ["Monatlicher Austausch unter Solo-Foundern.", "Monthly exchange between solo founders."], owner: false, role: "member", plan: "FREE", tpl: "BLANK", slug: "founder-zirkel", members: ["SR", "MS", "LV"], milestone: ["Demo Day · 28. Nov.", "Demo day · 28 Nov"], online: 0 },
    ],
    projects: [
      { id: "app", ws: "loopr", code: "AP", name: ["App-Prototyp", "App prototype"], hue: "#007AFF", desc: ["Summen aufnehmen, Melodie erkennen, Song erzeugen.", "Record humming, detect the melody, generate a song."], tasks: [
        task("t1", ["Onboarding-Screens finalisieren", "Finalise onboarding screens"], "high", "doing", "AK", ["Heute", "Today"]),
        task("t2", ["Audio-Upload auf Android testen", "Test audio upload on Android"], "high", "todo", "JW", ["Morgen", "Tomorrow"]),
        task("t3", ["Summen-zu-MIDI-Modelle vergleichen", "Compare hum-to-MIDI models"], "mid", "todo", "LV", ["Mi", "Wed"]),
        task("t4", ["TestFlight-Build hochladen", "Upload TestFlight build"], "mid", "todo", "JW", ["Fr", "Fri"]),
        task("t5", ["Aufnahme-Screen bauen", "Build recording screen"], "mid", "done", "AK"),
        task("t6", ["API-Schnittstelle festlegen", "Define the API contract"], "high", "review", "JW"),
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
        task("t13", ["Farbpalette festlegen", "Define the colour palette"], "mid", "review", "AK"),
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
        { from: "JW", kind: "call", dur: "12 Min", at: ["Gestern", "Yesterday"], text: ["Anruf", "Call"] },
        { from: "LV", kind: "meet", when: ["Di., 3. Nov. · 14:00–14:30", "Tue, 3 Nov · 14:00–14:30"], at: ["Gestern", "Yesterday"], text: ["Anruf gebucht", "Call booked"] },
      ], reply: { from: "JW", text: ["Klingt gut, ich schaue es mir heute Abend an.", "Sounds good, I'll look at it tonight."] } },
      { id: "kiez", group: true, name: "Kiezkiste-Team", members: ["LV", "TB", "SR"], unread: 0, msgs: [
        { from: "TB", at: ["Fr", "Fri"], text: ["Das Inserat-Formular ist zu 80 % fertig.", "The listing form is 80% done."] },
        { from: "SR", at: ["Fr", "Fri"], text: ["Ich habe drei Abholpunkte im Kiez angefragt.", "I've asked three pick-up points in the neighbourhood."] },
      ], reply: { from: "TB", text: ["Stark! Ich baue sie in die Karte ein.", "Nice! I'll add them to the map."] } },
      { id: "noah", name: "Noah Becker", with: "NB", unread: 1, request: true, msgs: [
        { from: "NB", at: "08:47", text: ["Hi Lena! Xyntal hat mich als iOS-Entwickler für Loopr vorgeschlagen. Ich habe zwei Audio-Apps veröffentlicht – sollen wir kurz sprechen?", "Hi Lena! Xyntal suggested me as an iOS developer for Loopr. I've shipped two audio apps – shall we have a quick chat?"] },
      ], reply: { from: "NB", text: ["Cool, dann schicke ich dir ein paar Zeiten.", "Cool, I'll send you a few times."] } },
    ],
    discScope: "people", role: "all", builder: null, connected: {},
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
      { id: "audio", name: ["Audio- & Musik-Tech", "Audio & music tech"], letter: "A", hue: "#8B6CFF", members: 310, joined: false, rec: true, priv: true, desc: ["Für alle, die Software rund um Klang und Musik bauen.", "For everyone building software around sound and music."], tags: ["Audio", "DSP"] },
      { id: "design", name: "Design & UX", letter: "D", hue: "#3FE0F0", members: 979, joined: true, desc: ["Austausch zu Design-Fragen, Reviews und Portfolios.", "Design questions, reviews and portfolios."], tags: ["Figma", "UX"] },
      { id: "ai", name: ["KI-Produkte bauen", "Building AI products"], letter: "K", hue: "#45C99B", members: 1560, joined: false, rec: true, fresh: true, desc: ["Von der Idee zum KI-Feature, das Menschen wirklich nutzen.", "From idea to an AI feature people actually use."], tags: ["LLM", ["Prototyping", "Prototyping"]] },
      { id: "nocode", name: "No-Code Builder", letter: "N", hue: "#D9A54E", members: 870, joined: false, fresh: true, desc: ["Schnell bauen ohne Code: Tools, Tricks und Vorlagen.", "Build fast without code: tools, tricks and templates."], tags: ["Webflow", "Make"] },
    ],
    events: [
      { id: "kick", title: ["Beta-Kickoff", "Beta kickoff"], when: ["Di, 3. Nov. · 10:00", "Tue, 3 Nov · 10:00"], going: true },
      { id: "show", title: ["Show & Tell: Audio-Apps", "Show & tell: audio apps"], when: ["Do, 5. Nov. · 18:30", "Thu, 5 Nov · 18:30"], going: false },
      { id: "pitch", title: ["Pitch-Feedback-Runde", "Pitch feedback round"], when: ["Do, 12. Nov. · 19:00", "Thu, 12 Nov · 19:00"], going: false },
    ],
    fileView: "all", fileType: "all", fileStatus: "all", fileQuery: "", fileSel: null, fileStars: { plan: true },
    files: [
      { id: "screens", ver: 3, status: "review", name: "Onboarding-Screens.fig", type: "image", ws: "Loopr Studio", owner: "AK", size: "4,2 MB", at: ["Heute, 09:16", "Today, 09:16"], recent: true },
      { id: "plan", ver: 2, status: "approved", name: "Beta-Plan.pdf", type: "doc", ws: "Loopr Studio", owner: "LV", size: "380 KB", at: ["Gestern", "Yesterday"], recent: true, shared: true },
      { id: "deck", ver: 3, status: "changes", name: "Pitch-Deck-v3.pdf", type: "doc", ws: "Loopr Studio", owner: "LV", size: "2,8 MB", at: ["28.10.26", "28/10/26"] },
      { id: "hum", ver: 1, status: "", name: "Demo-Summen.m4a", type: "audio", ws: "Loopr Studio", owner: "JW", size: "1,1 MB", at: ["Heute, 08:40", "Today, 08:40"], recent: true },
      { id: "teaser", ver: 2, status: "released", name: "Teaser-Video.mp4", type: "video", ws: "Loopr Studio", owner: "MS", size: "48 MB", at: ["30.10.26", "30/10/26"] },
      { id: "logo", ver: 4, status: "approved", name: "Logo-Varianten.png", type: "image", ws: "Loopr Studio", owner: "AK", size: "860 KB", at: ["27.10.26", "27/10/26"] },
      { id: "interviews", ver: 1, status: "", name: "Nutzerinterviews.docx", type: "doc", ws: "Kiezkiste", owner: "SR", size: "210 KB", at: ["29.10.26", "29/10/26"], shared: true },
    ],
    ai: [], aiBusy: false, aiTab: "chat", aiQuery: "",
    agents: [
      { id: "ag1", name: ["Projekt-Wächter", "Project watcher"], desc: ["Meldet Risiken bei Fristen und Abhängigkeiten.", "Flags risks in deadlines and dependencies."], on: true },
      { id: "ag2", name: ["Wochen-Reporter", "Weekly reporter"], desc: ["Schreibt freitags das Team-Update.", "Writes the team update on Fridays."], on: true },
      { id: "ag3", name: ["Match-Scout", "Match scout"], desc: ["Sucht täglich Leute für offene Rollen.", "Looks for people for open roles every day."], on: false },
    ],
    autoTab: "list",
    approvals: [
      { id: "ap1", name: ["Team-Update an #team-loopr senden", "Send team update to #team-loopr"], by: ["Wöchentliches Team-Update per KI", "Weekly AI team update"], at: ["Heute, 16:00", "Today, 16:00"] },
      { id: "ap2", name: ["Willkommensnachricht an Noah Becker", "Welcome message to Noah Becker"], by: ["Neues Match → Willkommensnachricht", "New match → welcome message"], at: ["Heute, 09:41", "Today, 09:41"] },
    ],
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
    projTab: "overview", okrFilter: "active", insRange: "8", briefBusy: null, briefOpen: "b1", chatMore: false, inboxFilter: "all", inboxDone: {},
    wsd: {
      _: { okrs: [], decisions: [], risks: [], briefs: [], memory: [], activity: [], journal: [], funding: [] },
      loopr: {
        okrs: [
          { id: "k1", state: "on", owner: "LV", due: ["fällig in 5 Tagen", "due in 5 days"], title: ["Closed Beta mit 50 Testern starten", "Start the closed beta with 50 testers"], desc: ["Die ersten echten Nutzer summen ihren ersten Song.", "The first real users hum their first song."], krs: [{ t: ["Tester auf der Warteliste bestätigt", "Testers confirmed on the waitlist"], cur: 34, target: 50, unit: ["Tester", "testers"] }, { t: ["TestFlight-Build freigegeben", "TestFlight build approved"], cur: 0, target: 1, unit: ["Build", "build"] }] },
          { id: "k2", state: "risk", owner: "JW", due: ["fällig in 19 Tagen", "due in 19 days"], title: ["Melodie-Erkennung über 90 % Trefferquote", "Melody detection above 90% accuracy"], desc: ["Gemessen an 40 Testaufnahmen auf dem Handy.", "Measured on 40 test recordings on the phone."], krs: [{ t: ["Trefferquote Tonhöhe", "Pitch accuracy"], cur: 88, target: 90, unit: ["%", "%"] }, { t: ["Latenz unter 200 ms", "Latency below 200 ms"], cur: 180, target: 200, unit: ["ms", "ms"] }] },
          { id: "k3", state: "on", owner: "MS", due: ["fällig in 40 Tagen", "due in 40 days"], title: ["Marke steht vor dem Public Launch", "Brand ready before the public launch"], desc: ["Logo, Farben und Tonalität sind abgestimmt.", "Logo, colours and tone are agreed."], krs: [{ t: ["Bausteine abgenommen", "Building blocks approved"], cur: 1, target: 3, unit: ["Teile", "parts"] }] },
        ],
        decisions: [
          { id: "d1", state: "accepted", owner: "JW", at: ["30. Okt.", "30 Oct"], tags: ["modell", "audio"], title: ["Modell B für Summen-zu-MIDI", "Model B for hum-to-MIDI"], dec: ["Wir gehen mit Modell B in die Closed Beta.", "We go into the closed beta with model B."], why: ["Fast so genau wie A, aber auf älteren Geräten flüssig.", "Almost as accurate as A, but smooth on older devices."] },
          { id: "d2", state: "proposed", owner: "MS", at: ["Heute", "Today"], tags: ["beta", "preis"], title: ["Beta bleibt kostenlos", "The beta stays free"], dec: ["Tester zahlen nichts, dafür gibt es ein Feedback-Gespräch.", "Testers pay nothing; in return there is a feedback call."], why: ["Uns ist ehrliches Feedback gerade mehr wert als Umsatz.", "Honest feedback is worth more to us right now than revenue."] },
          { id: "d3", state: "superseded", owner: "LV", at: ["12. Okt.", "12 Oct"], tags: ["plattform"], title: ["Zuerst nur iOS", "iOS only at first"], dec: ["Android kommt erst nach der Closed Beta.", "Android only comes after the closed beta."], why: ["Abgelöst: Der Audio-Upload läuft auf Android schon stabil.", "Superseded: audio upload already runs reliably on Android."] },
        ],
        risks: [
          { id: "r1", state: "progress", imp: 4, lik: 4, owner: "JW", due: ["Fr", "Fri"], title: ["TestFlight-Build wird nicht rechtzeitig fertig", "TestFlight build isn't ready in time"], desc: ["Der Build hängt am Audio-Upload-Test auf Android.", "The build depends on the audio upload test on Android."], mit: ["Test bis Mittwoch, sonst Beta nur mit iOS starten.", "Test by Wednesday, otherwise start the beta on iOS only."] },
          { id: "r2", state: "open", imp: 3, lik: 3, owner: "AK", due: ["10. Nov.", "10 Nov"], title: ["Aylin hat drei Aufgaben gleichzeitig", "Aylin has three tasks at once"], desc: ["Onboarding, Logo und Farbpalette liegen bei einer Person.", "Onboarding, logo and colour palette sit with one person."], mit: ["Lea Hoffmann aus Entdecken ansprechen (89 % Passung).", "Reach out to Lea Hoffmann from Discover (89% match)."] },
          { id: "r3", state: "open", imp: 2, lik: 2, owner: "MS", due: ["14. Nov.", "14 Nov"], title: ["Zu wenig Rücklauf auf die Warteliste-Mail", "Too little response to the waitlist email"], desc: ["Unter 50 Zusagen verzögern den Start.", "Fewer than 50 confirmations delay the start."], mit: ["Zweite Mail und Aufruf in der Community.", "Second email and a call in the community."] },
          { id: "r4", state: "closed", imp: 3, lik: 2, owner: "JW", due: ["28. Okt.", "28 Oct"], title: ["Login-Fehler beim Token-Refresh", "Login error on token refresh"], desc: ["Nutzer flogen nach einer Stunde raus.", "Users were logged out after an hour."], mit: ["Behoben.", "Fixed."] },
        ],
        briefs: [{ id: "b1", title: ["Wochenbericht", "Weekly report"], at: ["Fr, 16:00", "Fri, 16:00"], body: briefBody("weekly") }, { id: "b2", title: ["Risiko-Check", "Risk check"], at: ["Mi, 09:10", "Wed, 09:10"], body: briefBody("risk") }],
        memory: [
          { cat: "rule", pin: true, used: 14, text: ["Team-Updates gehen freitags um 16 Uhr an #team-loopr.", "Team updates go to #team-loopr on Fridays at 4 pm."] },
          { cat: "goal", used: 9, text: ["Die Closed Beta startet am 7. November mit 50 Testern.", "The closed beta starts on 7 November with 50 testers."] },
          { cat: "pref", used: 4, text: ["Lena arbeitet vormittags in Fokusblöcken – Termine lieber ab 13 Uhr.", "Lena works in focus blocks in the morning – meetings preferably from 1 pm."] },
          { cat: "decision", sug: true, used: 0, text: ["Für die Beta wird Modell B verwendet.", "Model B is used for the beta."] },
        ],
        activity: [
          { icon: "image", badge: "File uploaded", who: "AK", text: ["Onboarding-Screens.fig hochgeladen", "uploaded Onboarding-Screens.fig"], at: ["09:16", "09:16"] },
          { icon: "check", badge: "Task completed", who: "JW", text: ["API-Schnittstelle festlegen erledigt", "completed Define the API contract"], at: ["Gestern", "Yesterday"] },
          { icon: "flag", badge: "Milestone created", who: "MS", text: ["Meilenstein Closed Beta angelegt", "created the milestone Closed beta"], at: ["Fr", "Fri"] },
          { icon: "grid", badge: "Module added", who: "LV", text: ["Modul Ziele hinzugefügt", "added the Goals module"], at: ["Do", "Thu"] },
          { icon: "users", badge: "Member invited", who: "LV", text: ["Mara Schulz eingeladen", "invited Mara Schulz"], at: ["20. Okt.", "20 Oct"] },
        ],
        journal: [{ at: ["Freitag, 30. Oktober", "Friday, 30 October"], text: ["Aufnahme-Screen fertig. Zum ersten Mal einen ganzen Song aus zehn Sekunden Summen gehört – Gänsehaut.", "Recording screen done. Heard a full song from ten seconds of humming for the first time – goosebumps."] }, { at: ["Montag, 26. Oktober", "Monday, 26 October"], text: ["Modellvergleich gestartet. A ist genauer, B fühlt sich besser an.", "Started the model comparison. A is more accurate, B feels better."] }],
        funding: [{ name: ["Gründungsstipendium", "Founder grant"], source: ["EXIST", "EXIST"], at: ["Sept. 2026", "Sept 2026"], amount: 30000 }, { name: ["Preisgeld Audio-Hackathon", "Audio hackathon prize"], source: ["Music Tech Fest", "Music Tech Fest"], at: ["Juni 2026", "June 2026"], amount: 5000 }],
      },
      kiez: {
        okrs: [{ id: "k4", state: "on", owner: "TB", due: ["fällig in 18 Tagen", "due in 18 days"], title: ["MVP-Demo am 20. November", "MVP demo on 20 November"], desc: ["Inserieren, schreiben, abholen – einmal komplett.", "List, chat, pick up – once end to end."], krs: [{ t: ["Kernabläufe fertig", "Core flows done"], cur: 1, target: 3, unit: ["Abläufe", "flows"] }] }],
        decisions: [], risks: [{ id: "r5", state: "open", imp: 3, lik: 2, owner: "SR", due: ["13. Nov.", "13 Nov"], title: ["Abholpunkte springen ab", "Pick-up points drop out"], desc: ["Ohne Läden im Kiez fehlt die Übergabe.", "Without local shops there is no hand-over."], mit: ["Zwei Ersatzläden anfragen.", "Ask two backup shops."] }],
        briefs: [], memory: [], journal: [], funding: [],
        activity: [{ icon: "check", badge: "Task completed", who: "TB", text: ["Datenmodell entwerfen erledigt", "completed Design the data model"], at: ["Do", "Thu"] }, { icon: "file", badge: "File shared", who: "SR", text: ["Nutzerinterviews.docx geteilt", "shared Nutzerinterviews.docx"], at: ["Mi", "Wed"] }],
      },
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
  const initials = (n) => n.split(" ").map((x) => x[0]).join("");
  const KIND_HUE = { dev: "#007AFF", design: "#8B6CFF", music: "#E05E6D", growth: "#D9A54E" };
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

  // Start im Design 2026-11: eckige Kopfzeile, Begrüßung in 88 px, Kennzahlen-Leiste, Board in zwei Spalten
  const sqBtn = (label, attrs, cls = "") => `<button type="button" class="xa-sq ${cls}" ${attrs}>${label}</button>`;
  const homeHead = (title, s, extra = "") => `<div class="xa-topbar"><p class="xa-mono-line"><span>${T("MO · 02.11.2026 · ", "MON · 02.11.2026 · ")}</span>${title}</p><div class="xa-topbar-act">${extra}</div></div>`;
  function viewHome(s) {
    const tasks = allTasks(s);
    const open = tasks.filter((x) => x.t.status !== "done");
    const high = open.filter((x) => x.t.prio === "high");
    const today = open.filter((x) => ["Heute", "Today"].includes(L(x.t.due || "")));
    const ft = focusTask(s);
    const focusList = tasks.filter((x) => x.t.who === "LV" && (x.t.status !== "done" || x.t.focusDone)).slice(0, 4);
    const fDone = focusList.filter((x) => x.t.status === "done").length;
    const mine = tasks.filter((x) => (s.taskScope === "all" || x.t.who === "LV") && x.t.status !== "done" && (s.taskFilter === "all" || x.t.prio === s.taskFilter));
    const matches = s.builders.filter((b) => !s.matchHidden[b.id]).slice(0, 2);
    const doneAll = tasks.filter((x) => x.t.status === "done").length;
    const pd = (p) => p.tasks.length - openOf(p);
    const kpi = (n, label, cls = "") => `<div class="xa-kpi ${cls}${n ? "" : " is-zero"}"><b>${String(n).padStart(2, "0")}</b><small>${label}</small></div>`;
    const pillDot = { high: "var(--xa-warn)", mid: "var(--xa-mid)", low: "var(--xa-faint)" };
    const card = (title, body, right = "") => `<section class="xa-w"><header class="xa-w-head"><h4 class="xa-mono">${title}</h4>${right}</header>${body}</section>`;
    const ws = (p) => s.workspaces.find((w) => w.id === p.ws).name;
    return `${homeHead("START", s, `${sqBtn(T("ANPASSEN", "CUSTOMISE"), 'data-act="app-only" data-v="customize" data-k="h-custom"')}${sqBtn(`${T("MELDUNGEN", "NOTIFICATIONS")}${s.formeSeen ? "" : `<i class="xa-sq-badge">${inboxItems(s).length}</i>`}`, 'data-act="go" data-area="forme" data-k="h-notes"')}${sqBtn(`+ ${T("NEUER TASK", "NEW TASK")}`, 'data-act="newtask" data-k="h-new"', "is-primary")}`)}
    <h3 class="xa-hero" tabindex="-1" data-k="title">${T("GUTEN MORGEN, LENA.", "GOOD MORNING, LENA.")}</h3>
    <div class="xa-kpis">${kpi(open.length, T("OFFENE TASKS", "OPEN TASKS"))}${kpi(high.length, T("HOHE PRIORITÄT", "HIGH PRIORITY"))}${kpi(today.length, T("HEUTE FÄLLIG", "DUE TODAY"))}${kpi(0, T("ÜBERFÄLLIG", "OVERDUE"), "is-warn")}</div>
    <div class="xa-board">
      <div class="xa-board-main">
        ${card(T("FOKUS HEUTE", "FOCUS TODAY"), `<div class="xa-progress"><i style="width:${focusList.length ? Math.round((fDone / focusList.length) * 100) : 0}%"></i></div>
          <ul class="xa-frows">${focusList.map((x) => { const d = x.t.status === "done"; return `<li class="xa-frow${d ? " is-done" : ""}"><button type="button" class="xa-circle" role="checkbox" aria-checked="${d}" data-act="focus-check" data-id="${x.t.id}" data-k="fc-${x.t.id}" aria-label="${esc(L(x.t.title))}">${icon("check")}</button><span class="xa-grow"><b>${esc(L(x.t.title))}</b><small>${esc(ws(x.p))} · ${esc(L(x.p.name))}</small></span><span class="xa-spill${x.t.prio === "high" && !d ? " is-warn" : ""}">${d ? T("Erledigt", "Done") : L(PRIO[x.t.prio])}</span></li>`; }).join("")}</ul>
          ${ft ? `<div class="xa-w-foot"><button type="button" class="xa-pillbtn" data-act="focus-start" data-k="h-focus">${icon("play")}${T("50 Min Fokus starten", "Start 50 min focus")}</button></div>` : ""}`,
          `<span class="xa-w-meta">${T(`${fDone} von ${focusList.length} erledigt`, `${fDone} of ${focusList.length} done`)}</span>`)}
        ${card(T("MEINE TASKS", "MY TASKS"), `<ul class="xa-trows">${mine.slice(0, 5).map((x) => `<li class="xa-trow"><span class="xa-pdot" style="background:${pillDot[x.t.prio]}"></span><span class="xa-grow"><b>${esc(L(x.t.title))}</b><small>${esc(ws(x.p))} · ${x.t.status === "doing" ? T("In Arbeit", "In progress") : x.t.status === "review" ? T("In Prüfung", "In review") : T("Offen", "Open")}</small></span><span class="xa-pword">${L(PRIO[x.t.prio])}</span><button type="button" class="xa-tcheck" data-act="task-done" data-id="${x.t.id}" data-k="td-${x.t.id}" aria-label="${T(`${L(x.t.title)} erledigen`, `Complete ${L(x.t.title)}`)}">${icon("check")}</button></li>`).join("") || `<li class="xa-empty">${T("Keine Tasks mit dieser Priorität.", "No tasks with this priority.")}</li>`}</ul>
          <button type="button" class="xa-acclink" data-act="ws-sub" data-id="loopr" data-v="projects" data-k="h-alltasks">${T(`Alle ${open.length} Tasks ansehen →`, `View all ${open.length} tasks →`)}</button>`,
          `<div class="xa-pgroup" role="group" aria-label="${T("Meine oder alle", "Mine or all")}">${[["mine", T("Meine", "Mine")], ["all", T("Alle", "All")]].map(([id, l]) => `<button type="button" data-act="taskscope" data-v="${id}" data-k="taskscope-${id}" aria-pressed="${s.taskScope === id}">${l}</button>`).join("")}</div><div class="xa-pgroup" role="group" aria-label="${T("Nach Priorität filtern", "Filter by priority")}">${[["all", T("Alle", "All")], ["high", T("Hoch", "High")], ["mid", T("Mittel", "Medium")], ["low", T("Niedrig", "Low")]].map(([id, l]) => `<button type="button" data-act="taskfilter" data-v="${id}" data-k="taskfilter-${id}" aria-pressed="${s.taskFilter === id}">${l}</button>`).join("")}</div>`)}
        ${card(T("WOCHENRÜCKBLICK", "WEEKLY REVIEW"), `<div class="xa-wtiles"><div><b>${doneAll}</b><small>${T("Erledigt", "Done")}</small></div><div><b>0</b><small>${T("Überfällig", "Overdue")}</small></div><div><b>${open.filter((x) => x.t.due).length}</b><small>${T("In 7 Tagen fällig", "Due in 7 days")}</small></div></div>
          <div class="xa-wsec"><h5 class="xa-mono">${T("ERLEDIGT", "DONE")}</h5><p>${tasks.filter((x) => x.t.status === "done").slice(0, 3).map((x) => esc(L(x.t.title))).join(" · ") || "–"}</p></div>
          <div class="xa-wsec"><h5 class="xa-mono">${T("HÄNGT", "STUCK")}</h5><p>${esc(L(proj(s, "app").tasks.find((t) => t.id === "t2").title))} – ${T("blockiert den TestFlight-Build", "blocks the TestFlight build")}</p></div>
          <div class="xa-wsec"><h5 class="xa-mono">${T("ALS NÄCHSTES", "UP NEXT")}</h5><p>${high.slice(0, 2).map((x) => esc(L(x.t.title))).join(" · ") || "–"}</p></div>`)}
      </div>
      <div class="xa-board-side">
        ${card(T("MEILENSTEINE", "MILESTONES"), `<ul class="xa-srows">${s.milestones.map((m) => `<li><span class="xa-grow"><b>${esc(L(m.name))}</b><small>${esc(L(proj(s, m.project).name))}</small></span><span class="xa-spill${m.soon ? " is-warn" : ""}">${esc(L(m.when))}</span></li>`).join("")}</ul>`)}
        ${card(T("PROJEKTE", "PROJECTS"), `<ul class="xa-prows">${s.projects.map((p) => `<li><button type="button" class="xa-plain" data-act="project" data-id="${p.id}" data-k="h-p-${p.id}"><span class="xa-prow-top"><b>${esc(L(p.name))}</b><span class="xa-mono">${pd(p)} / ${p.tasks.length}</span></span><span class="xa-progress"><i style="width:${pct(p)}%"></i></span></button></li>`).join("")}</ul>`,
          `<span class="xa-w-meta">${T(`${s.projects.reduce((n, p) => n + pd(p), 0)} von ${tasks.length} erledigt`, `${s.projects.reduce((n, p) => n + pd(p), 0)} of ${tasks.length} done`)}</span>`)}
        ${card(T("SCHNELLAKTIONEN", "QUICK ACTIONS"), `<ul class="xa-qrows">${[["plus", T("Arbeitsbereich erstellen", "Create workspace"), T("Erstellen & öffnen", "Create & open"), 'data-act="app-only" data-v="workspace"'], ["plus", T("Projekt erstellen", "Create project"), T("Zu einem Arbeitsbereich hinzufügen", "Add to a workspace"), 'data-act="app-only" data-v="project"'], ["target", T("Fokus heute", "Focus today"), T("Deine wichtigste Arbeit", "Your most important work"), 'data-act="go" data-area="focus"'], ["calendar", T("Kalender öffnen", "Open calendar"), T("Plane deine Woche", "Plan your week"), 'data-act="go" data-area="calendar"']].map(([ic, t, m, a], i) => `<li><button type="button" class="xa-plain" ${a} data-k="q${i}"><span class="xa-qic">${icon(ic)}</span><span class="xa-grow"><b>${t}</b><small>${m}</small></span></button></li>`).join("")}</ul>`)}
        ${card(T("NEUE MATCHES", "NEW MATCHES"), matches.length ? `<ul class="xa-mrows">${matches.map((b) => `<li><button type="button" class="xa-plain" data-act="builder-open" data-id="${b.id}" data-k="hm-${b.id}">${ring(b.score, 40, 3)}<span class="xa-grow"><b>${esc(b.name)}</b><small>${esc(L(b.role))}</small></span></button><span class="xa-mlinks"><button type="button" data-act="match-save" data-id="${b.id}" data-k="hms-${b.id}" aria-pressed="${!!s.matchSaved[b.id]}">${s.matchSaved[b.id] ? T("Gespeichert", "Saved") : T("Speichern", "Save")}</button><button type="button" data-act="match-hide" data-id="${b.id}" data-k="hmh-${b.id}">${T("Verwerfen", "Dismiss")}</button></span></li>`).join("")}</ul><button type="button" class="xa-pillbtn" data-act="go" data-area="discover" data-k="h-disc">${T("Entdecken öffnen", "Open Discover")}</button>`
          : `<p class="xa-strong">${T("Gerade keine neuen Matches", "No new matches right now")}</p><p class="xa-muted">${T("Neue Vorschläge kommen, sobald jemand zu dir passt.", "New suggestions arrive as soon as someone fits.")}</p><button type="button" class="xa-pillbtn" data-act="go" data-area="discover" data-k="h-disc">${T("Entdecken öffnen", "Open Discover")}</button>`)}
        <div class="xa-beta-cta"><b>${T("Gefällt dir das?", "Like what you see?")}</b><span>${T("Die echte App gibt es gerade für Beta-Tester.", "The real app is available to beta testers right now.")}</span>${ctaLinks("xa-pillbtn", "xa-acclink")}</div>
      </div>
    </div>`;
  }

  // „Für mich“ wie in der App: eine Liste mit allem, was auf dich wartet – erledigen (E) oder später (S)
  const inboxItems = (s) => {
    const tasks = allTasks(s).filter((x) => x.t.who === "LV" && x.t.status !== "done" && x.t.due).slice(0, 3);
    const reqs = s.convos.filter((c) => c.request);
    return [
      { id: "i-aylin", kind: "mention", icon: "message", head: T("Aylin Kaya hat dich erwähnt", "Aylin Kaya mentioned you"), detail: T("Hast du kurz Zeit für das Design-Review? 15 Minuten reichen.", "Do you have a moment for the design review? 15 minutes is enough."), at: "10:02", place: T("Direktnachricht", "Direct message"), act: 'data-act="convo" data-id="aylin"', g: 0 },
      { id: "i-appr", kind: "approval", icon: "zap", head: T("„Team-Update an #team-loopr senden“ freigeben", "Approve “Send team update to #team-loopr”"), detail: T("Wöchentliches Team-Update per KI", "Weekly AI team update"), at: "09:41", place: T("Automationen", "Automations"), act: 'data-act="autotab-go" data-v="approvals"', g: 0 },
      ...tasks.map((x) => ({ id: "i-" + x.t.id, kind: "task", icon: "check", urgent: /Heute|Today/.test(L(x.t.due)), head: esc(L(x.t.title)), detail: `${esc(L(x.p.name))} · ${/Heute|Today/.test(L(x.t.due)) ? T("Heute fällig", "Due today") : T(`Fällig: ${L(x.t.due)}`, `Due: ${L(x.t.due)}`)}`, at: "", place: "Loopr Studio", act: `data-act="task-open" data-id="${x.p.id}"`, task: x.t.id, g: 0 })),
      { id: "i-call", kind: "call", icon: "phone", head: T("Jonas Weber schlägt einen 30-minütigen Anruf vor", "Jonas Weber suggests a 30-minute call"), detail: T("Di., 3. Nov. · 14:00–14:30", "Tue, 3 Nov · 14:00–14:30"), at: T("Gestern", "Yesterday"), place: T("Direktnachricht", "Direct message"), act: 'data-act="convo" data-id="jonas"', g: 1 },
      ...reqs.map((c) => ({ id: "i-" + c.id, kind: "thread", icon: "users", head: T(`${esc(c.name)} möchte dir schreiben`, `${esc(c.name)} wants to message you`), detail: esc(L(c.msgs[0].text)), at: T("Gestern", "Yesterday"), place: T("Anfrage", "Request"), act: `data-act="convo-req" data-id="${c.id}"`, g: 1 })),
      { id: "i-review", kind: "review", icon: "clip", head: T("„Onboarding-Screens.fig“ prüfen", "Review “Onboarding-Screens.fig”"), detail: T("Aylin Kaya bittet um Freigabe · Version 3", "Aylin Kaya asks for approval · version 3"), at: T("Fr", "Fri"), place: T("Dateien", "Files"), act: 'data-act="file" data-id="screens"', g: 1 },
    ].filter((x) => !s.inboxDone[x.id]);
  };
  function viewForMe(s) {
    s.formeSeen = true;
    const all = inboxItems(s);
    const kinds = [["all", T("Alle", "All")], ["mention", T("Erwähnungen", "Mentions")], ["task", T("Aufgaben", "Tasks")], ["approval", T("Freigaben", "Approvals")], ["review", T("Prüfungen", "Reviews")], ["thread", "Threads"], ["call", T("Anrufe", "Calls")]];
    const cnt = (k) => (k === "all" ? all.length : all.filter((x) => x.kind === k).length);
    const list = all.filter((x) => s.inboxFilter === "all" || x.kind === s.inboxFilter);
    const later = Object.values(s.inboxDone).filter((v) => v === "later").length;
    const row = (x) => `<li class="xa-ib${x.urgent ? " is-urgent" : ""}"><button type="button" class="xa-plain xa-ib-main" ${x.act} data-k="ib-${x.id}"><span class="xa-ib-ic">${icon(x.icon)}</span><span class="xa-grow"><b>${x.head}</b><small>${x.detail}</small></span><span class="xa-ib-r"><small>${x.at}</small><small>${x.place}</small></span></button>
      <span class="xa-ib-act"><button type="button" class="xa-iconbtn" data-act="inbox-done" data-id="${x.id}" data-v="${x.task || ""}" data-k="ibd-${x.id}" aria-label="${T("Erledigt (E)", "Done (E)")}" title="${T("Erledigt (E)", "Done (E)")}">${icon("check")}</button><button type="button" class="xa-iconbtn" data-act="inbox-later" data-id="${x.id}" data-k="ibl-${x.id}" aria-label="${T("Später (S)", "Later (S)")}" title="${T("Später (S)", "Later (S)")}">${icon("clock")}</button></span></li>`;
    const group = (g, label) => { const items = list.filter((x) => x.g === g); return items.length ? `<p class="xa-ib-g">${label}</p><ul class="xa-ibs">${items.map(row).join("")}</ul>` : ""; };
    return `<div class="xa-inbox"><header class="xa-ib-head"><h3 class="xa-ib-title" tabindex="-1" data-k="title">${T("Für mich", "For me")}</h3><span class="xa-faint">${T(`${all.length} warten · ${later} zurückgestellt`, `${all.length} waiting · ${later} snoozed`)}</span><span class="xa-grow"></span><button type="button" class="xa-iconbtn" data-act="inbox-reset" data-k="ib-refresh" aria-label="${T("Aktualisieren", "Refresh")}">${icon("reset")}</button></header>
      <p class="xa-ib-hint">${T("J / K zum Wechseln · Leertaste Aufgabe aufklappen · E erledigt · S später · Enter zum Öffnen", "J / K to move · Space expands a task · E done · S later · Enter to open")}</p>
      ${all.length ? `<div class="xa-ib-chips" role="group" aria-label="${T("Filtern", "Filter")}">${kinds.filter(([k]) => cnt(k)).map(([k, l]) => `<button type="button" data-act="inboxfilter" data-v="${k}" data-k="ibf-${k}" aria-pressed="${s.inboxFilter === k}">${l} <span>${cnt(k)}</span></button>`).join("")}</div>${group(0, T("Heute", "Today"))}${group(1, T("Früher", "Earlier"))}`
        : `<div class="xa-ib-empty"><span class="xa-icon-tile xa-lg">${icon("check")}</span><b>${T("Du bist auf dem neuesten Stand", "You're all caught up")}</b><p>${T("Gerade braucht dich nichts. Erwähnungen, Aufgaben, Freigaben und Antworten landen hier.", "Nothing needs you right now. Mentions, tasks, approvals and replies land here.")}</p></div>`}</div>`;
  }

  function viewFocus(s) {
    const ft = focusTask(s);
    const f = s.focus;
    const rest = allTasks(s).filter((x) => x.t.status !== "done" && (!ft || x.t.id !== ft.t.id));
    const rank = { high: 0, mid: 1, low: 2 };
    const now = [...rest].sort((a, b) => rank[a.t.prio] - rank[b.t.prio] || (b.t.who === "LV") - (a.t.who === "LV")).slice(0, 3);
    const queue = rest.filter((x) => !now.includes(x)).slice(0, 4);
    const why = (x) => x.t.prio === "high" ? T("Hohe Priorität und bald fällig.", "High priority and due soon.") : x.t.who === "LV" ? T("Dir zugewiesen, blockiert andere.", "Assigned to you, unblocks others.") : T("Passt in einen kurzen Block.", "Fits a short block.");
    const mins = { high: 50, mid: 25, low: 15 };
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
              <button type="button" class="xa-btn" data-act="focus-skip" data-k="f-skip"${now.length ? "" : " disabled"}>${icon("chevR")}${T("Überspringen", "Skip")}</button>
              <button type="button" class="xa-btn" data-act="focus-reset" data-k="f-reset">${icon("reset")}${T("Zurücksetzen", "Reset")}</button>
              ${ft ? `<button type="button" class="xa-btn" data-act="focus-done" data-k="f-done">${icon("check")}${T("Task erledigt", "Task done")}</button>` : ""}
            </div>
          </div>
        </div>
      </div>
      <div class="xa-card"><h4 class="xa-kicker">${T("Jetzt", "Now")}</h4>
        ${now.length ? `<ol class="xa-now-list">${now.map((x, i) => `<li><span class="xa-now-n">${i + 1}</span><span class="xa-grow"><b>${esc(L(x.t.title))}</b><small>~${mins[x.t.prio]} Min · ${esc(L(x.p.name))}</small><small class="xa-why">${T("Warum das?", "Why this?")} ${why(x)}</small></span><button type="button" class="xa-mini" data-act="focus-pick" data-id="${x.t.id}" data-k="fn-${x.t.id}">${T("Vorziehen", "Do now")}</button></li>`).join("")}</ol>` : `<p class="xa-empty">${T("Nichts mehr offen.", "Nothing left open.")}</p>`}
        <h4 class="xa-kicker xa-mt">${T("Wissenswert", "Worth knowing")}</h4>
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

  /* ---------- Arbeitsbereiche (Stand App 0.2.19): Liste, Arbeitsbereich mit eigener Seitenleiste, Projekte darin ---------- */
  const WS_NAV = [
    { items: [{ id: "overview", icon: "gauge", label: ["Übersicht", "Overview"] }] },
    { label: ["Plan", "Plan"], items: [{ id: "projects", icon: "kanban", label: ["Projekte", "Projects"] }, { id: "milestones", icon: "flag", label: ["Meilensteine", "Milestones"] }, { id: "roadmap", icon: "map", label: ["Roadmap", "Roadmap"] }, { id: "calendar", icon: "calendar", label: ["Kalender", "Calendar"] }] },
    { label: ["Personen", "People"], items: [{ id: "team", icon: "users", label: ["Team", "Team"] }, { id: "roles", icon: "shield", label: ["Rollen & Zugriff", "Roles & access"] }] },
    { label: ["Wissen", "Knowledge"], items: [{ id: "files", icon: "folder", label: ["Dateien", "Files"] }, { id: "notes", icon: "file", label: ["Notizen", "Notes"] }, { id: "journal", icon: "book", label: ["Journal", "Journal"] }] },
    { label: ["Wachstum", "Growth"], items: [{ id: "okrs", icon: "target", label: ["Ziele & OKRs", "Goals & OKRs"] }, { id: "decisions", icon: "clip", label: ["Entscheidungen", "Decisions"] }, { id: "risks", icon: "alert", label: ["Risiken", "Risks"] }, { id: "funding", icon: "receipt", label: ["Funding", "Funding"] }] },
    { label: ["System", "System"], items: [{ id: "insights", icon: "pulse", label: ["Insights", "Insights"] }, { id: "analytics", icon: "chart", label: ["Analysen", "Analytics"] }, { id: "ai", icon: "sparkle", label: ["Xyntal KI", "Xyntal AI"] }, { id: "briefs", icon: "zap", label: ["KI-Briefings", "AI briefings"] }, { id: "memory", icon: "bulb", label: ["Team-Gedächtnis", "Team memory"] }, { id: "activity", icon: "pulse", label: ["Aktivität", "Activity"] }] },
  ];
  const ROLE = { owner: ["Inhaber", "Owner"], admin: ["Admin", "Admin"], member: ["Mitglied", "Member"] };
  const WS_SORT = { name: ["Sortierung: Name", "Sort: Name"], members: ["Sortierung: Mitglieder", "Sort: Members"], type: ["Sortierung: Typ", "Sort: Type"] };
  const wsStats = (s, w) => {
    const ps = s.projects.filter((p) => p.ws === w.id);
    const tasks = ps.flatMap((p) => p.tasks);
    const done = tasks.filter((t) => t.status === "done").length;
    return { ps, tasks, done, open: tasks.length - done, pc: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
  };
  const pStatus = (p) => { const pc = pct(p); return pc === 100 ? ["done", T("Abgeschlossen", "Completed")] : p.tasks.some((t) => t.status === "doing" || t.status === "review") ? ["active", T("Aktiv", "Active")] : ["planned", T("Geplant", "Planned")]; };

  function viewWorkspaces(s) {
    const q = s.wsQuery.trim().toLowerCase();
    const list = s.workspaces.filter((w) => (s.wsFilter === "all" || (s.wsFilter === "fav" && s.favs[w.id]) || w.role === s.wsFilter) && (!q || w.name.toLowerCase().includes(q)));
    const n = (role) => s.workspaces.filter((w) => w.role === role).length;
    const by = { name: (a, b) => a.name.localeCompare(b.name), members: (a, b) => b.members.length - a.members.length, type: (a, b) => a.role.localeCompare(b.role) }[s.wsSort];
    const sorted = [...list].sort(by);
    const filters = [["all", T("ALLE", "ALL"), s.workspaces.length], ["fav", T("Favoriten", "Favourites"), s.workspaces.filter((w) => s.favs[w.id]).length], ["owner", T("Inhaber", "Owner"), n("owner")], ["admin", "Admin", n("admin")], ["member", T("Mitglied", "Member"), n("member")]].filter((f) => f[2]);
    return `${pageHead(T("Arbeit", "Work"), T(`${s.workspaces.length} Arbeitsbereiche · ${n("owner")} eigener`, `${s.workspaces.length} workspaces · ${n("owner")} owned`), `<button type="button" class="xa-plusbtn" data-act="app-only" data-v="workspace" data-k="w-new" aria-label="${T("Neuer Arbeitsbereich", "New workspace")}">${icon("plus")}</button>`)}
    <div class="xa-toolbar xa-ws-bar"><label class="xa-sr" for="xa-wq-${uid}">${T("Arbeitsbereiche suchen", "Search workspaces")}</label><input id="xa-wq-${uid}" class="xa-input" type="search" data-input="wsquery" data-k="wq" value="${esc(s.wsQuery)}" placeholder="${T("Arbeitsbereiche suchen", "Search workspaces")}" autocomplete="off">
      <div class="xa-mchips" role="group" aria-label="${T("Arbeitsbereiche filtern", "Filter workspaces")}">${filters.map(([id, text, count]) => `<button type="button" data-act="wsfilter" data-v="${id}" data-k="wsfilter-${id}" aria-pressed="${s.wsFilter === id}">${text} <span>${count}</span></button>`).join("")}</div>
      <span class="xa-grow"></span><button type="button" class="xa-select" data-act="wssort" data-k="wssort">${L(WS_SORT[s.wsSort])}<i aria-hidden="true"></i></button></div>
    <div class="xa-wsgrid">${sorted.map((w) => {
      const st = wsStats(s, w);
      return `<article class="xa-wscard${w.id === "loopr" ? " is-current" : ""}">
        <div class="xa-ws-top"><span class="xa-code" style="--h:${w.hue}">${w.code}</span><h4><button type="button" class="xa-plain" data-act="ws" data-id="${w.id}" data-k="ws-${w.id}">${esc(w.name)}</button>${w.id === "loopr" ? `<span class="xa-now-tag">${T("Aktuell", "Current")}</span>` : ""}</h4>
          <button type="button" class="xa-iconbtn xa-star" data-act="fav" data-id="${w.id}" data-k="fav-${w.id}" aria-pressed="${!!s.favs[w.id]}" aria-label="${T(`${w.name} als Favorit markieren`, `Mark ${w.name} as favourite`)}">${icon("star")}</button><button type="button" class="xa-iconbtn" data-act="app-only" data-v="wsmenu" data-k="wm-${w.id}" aria-label="${T("Arbeitsbereich-Aktionen", "Workspace actions")}">${icon("more")}</button></div>
        <p class="xa-ws-meta"><span class="xa-mtag">${w.tpl}</span><span>${icon("shield")}${L(ROLE[w.role])}</span><span>${T("Privat", "Private")}</span></p>
        <p class="xa-ws-desc">${esc(L(w.desc))}</p>
        <div class="xa-ws-stats"><div><b>${st.ps.length}</b><small>${T("Projekte", "Projects")}</small></div><div><b>${st.open}</b><small>${T("Offene Aufgaben", "Open tasks")}</small></div><div><b>${w.members.length}</b><small>${T("Mitglieder", "Members")}</small></div><div class="xa-stack">${w.members.map((m) => avatar(m, "xa-av-sm")).join("")}</div></div>
        <div class="xa-ws-prog"><div class="xa-progress"><i style="width:${st.pc}%"></i></div><span>${st.pc}%</span></div>
        <div class="xa-ws-foot"><span>${T(`${w.online} von ${w.members.length} online`, `${w.online} of ${w.members.length} online`)}</span><button type="button" class="xa-acc-link" data-act="ws" data-id="${w.id}" data-k="wso-${w.id}">${T("Öffnen", "Open")} →</button></div>
      </article>`;
    }).join("") || `<p class="xa-empty">${T("Keine Arbeitsbereiche passen zu diesen Filtern", "No workspaces match these filters")}</p>`}</div>
    <h4 class="xa-seclabel xa-sec-gap">${T("FÜR DICH OFFEN", "OPEN TO YOU")}</h4>
    <div class="xa-wsgrid">${s.openWs.map((w) => `<article class="xa-wscard xa-ws-open">
        <div class="xa-ws-top"><span class="xa-code" style="--h:${w.hue}">${w.code}</span><h4>${esc(w.name)}</h4><span class="xa-score-pill">${w.score}%</span></div>
        <p class="xa-ws-meta"><span>${T(`${w.members} Mitglieder`, `${w.members} members`)}</span><span>${w.mode === "join" ? T("Jeder kann beitreten", "Anyone can join") : T("Offen auf Anfrage", "Open on request")}</span></p>
        <p class="xa-ws-desc">${esc(L(w.desc))}</p>
        <div class="xa-row"><button type="button" class="xa-btn ${s.requested[w.id] ? "is-sent" : "xa-primary"}" data-act="ws-join" data-id="${w.id}" data-k="wj-${w.id}" aria-pressed="${!!s.requested[w.id]}">${s.requested[w.id] ? icon("check") + (w.mode === "join" ? T("Beigetreten", "Joined") : T("Angefragt", "Requested")) : w.mode === "join" ? T("Beitreten", "Join") : T("Zugang anfragen", "Request access")}</button><button type="button" class="xa-btn" data-act="app-only" data-v="contact" data-k="wc-${w.id}">${T("Inhaber kontaktieren", "Contact owner")}</button></div>
      </article>`).join("")}</div>`;
  }

  // Arbeitsbereich: links die Module, rechts Kopf und die gewählte Seite
  function viewWorkspace(s, r) {
    const w = s.workspaces.find((x) => x.id === r.id) || s.workspaces[0];
    const st = wsStats(s, w);
    const sub = r.sub || "overview";
    const counts = { projects: st.ps.length, team: w.members.length, notes: NOTES.filter((n) => n.ws === w.id).length };
    const canEdit = w.role !== "member";
    const nav = `<nav class="xa-wsnav" aria-label="${T(`Module von ${w.name}`, `${w.name} modules`)}">
      <button type="button" class="xa-wsswitch" data-act="ws-switch" data-k="ws-switch" aria-label="${T(`${w.name} – Arbeitsbereich wechseln`, `${w.name} – switch workspace`)}"><span class="xa-code" style="--h:${w.hue}">${w.code}</span><span class="xa-grow"><b>${esc(w.name)}</b><small><span class="xa-mtag">${w.plan}</span>${T(`${w.members.length} Mitglieder`, `${w.members.length} members`)}</small></span>${icon("swap")}</button>
      ${WS_NAV.map((g) => `${g.label ? `<p class="xa-wsnav-h">${L(g.label)}</p>` : ""}${g.items.map((m) => `<button type="button" class="xa-wsnav-i" data-act="ws-sub" data-id="${w.id}" data-v="${m.id}" data-k="wn-${m.id}"${sub === m.id ? ' aria-current="page"' : ""}>${icon(m.icon)}<span class="xa-grow">${L(m.label)}</span>${counts[m.id] ? `<small>${counts[m.id]}</small>` : ""}</button>`).join("")}`).join("")}
    </nav>`;
    const head = `<header class="xa-wshead"><div class="xa-wshead-l"><span class="xa-code" style="--h:${w.hue}">${w.code}</span><h3 class="xa-wsname" tabindex="-1" data-k="title">${esc(w.name)}</h3><span class="xa-otag">${w.tpl[0] + w.tpl.slice(1).toLowerCase()}</span><span class="xa-otag">Private</span><span class="xa-otag">${L(ROLE[w.role])}</span><span class="xa-wsurl">xyntal://${w.slug}</span><span class="xa-stack">${w.members.slice(0, 4).map((m) => avatar(m, "xa-av-sm")).join("")}</span></div>
      <div class="xa-wshead-r"><button type="button" class="xa-hbtn xa-hbtn-ai" data-act="ws-ask" data-id="${w.id}" data-k="wh-ask">${AI_MARK}${T("Xyntal fragen", "Ask Xyntal")}</button><button type="button" class="xa-hbtn" data-act="app-only" data-v="customize-ws" data-k="wh-custom">${icon("settings")}${T("Anpassen", "Customise")}</button>${canEdit ? `<button type="button" class="xa-hbtn" data-act="app-only" data-v="invite" data-k="wh-invite">+ ${T("Einladen", "Invite")}</button><button type="button" class="xa-hbtn is-primary" data-act="app-only" data-v="project" data-k="wh-new">+ ${T("Neues Projekt", "New project")}</button>` : ""}<button type="button" class="xa-iconbtn" data-act="app-only" data-v="wsmenu" data-k="wh-more" aria-label="${T("Weitere Aktionen", "More actions")}">${icon("more")}</button></div>
      <p class="xa-wsdesc">${esc(L(w.desc))}</p></header>`;
    const pnav = r.proj ? `<nav class="xa-wsnav" aria-label="${T("Abschnitte des Projekts", "Project sections")}"><button type="button" class="xa-wsnav-back" data-act="ws-sub" data-id="${w.id}" data-v="projects" data-k="pn-back">${icon("chevL")}${esc(w.name)}</button><p class="xa-wsnav-h">${T("Projekt", "Project")}</p>${P_NAV.map(([id, ic, label]) => `<button type="button" class="xa-wsnav-i" data-act="${id === "overview" || id === "work" ? "projtab" : "app-only"}" data-v="${id === "overview" || id === "work" ? id : "tab"}" data-k="pn-${id}"${(s.projTab === "work" ? "work" : "overview") === id ? ' aria-current="page"' : ""}>${icon(ic)}<span class="xa-grow">${L(label)}</span></button>`).join("")}</nav>` : "";
    if (r.proj) return `<div class="xa-wsd">${pnav}<div class="xa-wsmain" data-scroll="wsmain">${wsProject(s, w, r.proj)}</div></div>`;
    const page = r.proj ? wsProject(s, w, r.proj) : r.note ? wsNote(s, w, r.note) : (WS_PAGES[sub] || WS_PAGES.overview)(s, w, st);
    return `<div class="xa-wsd">${nav}<div class="xa-wsmain" data-scroll="wsmain">${head}${page}</div></div>`;
  }
  const secHead = (title, sub = "", actions = "") => `<div class="xa-sechead"><div><h4 class="xa-seclabel">${title}</h4>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="xa-sechead-act">${actions}</div>` : ""}</div>`;
  const wsStat = (label, value, sub = "", extra = "", tone = "") => `<div class="xa-wstat${tone ? " is-" + tone : ""}"><small>${label}</small><b>${value}</b>${extra}${sub ? `<span>${sub}</span>` : ""}</div>`;
  const oStat = (label, value, sub = "", bar = null) => `<div class="xa-ostat"><small>${label}</small><b>${value}</b>${bar !== null ? `<div class="xa-progress"><i style="width:${bar}%"></i></div>` : ""}${sub ? `<span>${sub}</span>` : ""}</div>`;
  const wchips = (act, items, current) => `<div class="xa-wchips" role="group">${items.map(([id, text, tone]) => `<button type="button" class="${tone ? "is-" + tone : ""}" data-act="${act}" data-v="${id}" data-k="${act}-${id}" aria-pressed="${current === id}">${text}</button>`).join("")}</div>`;
  const wsd = (s, w) => s.wsd[w.id] || s.wsd._;
  const OKR_STATE = { on: ["Im Plan", "On track", "ok"], risk: ["Gefährdet", "At risk", "gold"], crit: ["Kritisch", "Critical", "bad"] };
  const DEC_STATE = { proposed: ["Vorgeschlagen", "Proposed", "gold"], accepted: ["Angenommen", "Accepted", "ok"], rejected: ["Abgelehnt", "Rejected", "bad"], superseded: ["Abgelöst", "Superseded", "faint"] };
  const MEM_CAT = { rule: ["Richtlinie", "Guideline", "acc"], decision: ["Entscheidung", "Decision", "ok"], pref: ["Vorliebe", "Preference", "violet"], goal: ["Ziel", "Goal", "gold"], fact: ["Fakt", "Fact", "faint"] };
  const BRIEF_KINDS = [["exec", ["Management-Zusammenfassung", "Executive summary"], ["Stand in fünf Sätzen", "Status in five sentences"], "file"], ["weekly", ["Wochenbericht", "Weekly report"], ["Was diese Woche geschah", "What happened this week"], "calendar"], ["standup", ["Stand-up", "Stand-up"], ["Gestern, heute, Blocker", "Yesterday, today, blockers"], "users"], ["risk", ["Risiko-Check", "Risk check"], ["Was den Plan gefährdet", "What threatens the plan"], "alert"], ["dec", ["Entscheidungsüberblick", "Decision overview"], ["Was entschieden ist und was offen", "What is decided and what is open"], "clip"], ["next", ["Nächste Schritte", "Next steps"], ["Die drei wichtigsten Dinge", "The three most important things"], "arrowR"]];
  const briefBody = (kind) => (s, w) => {
    const st = wsStats(s, w); const open = st.ps.flatMap((p) => p.tasks.filter((t) => t.status !== "done").map((t) => ({ t, p }))); const high = open.filter((x) => x.t.prio === "high");
    const li = (a) => `<ul>${a.map((x) => `<li>${x}</li>`).join("")}</ul>`;
    if (kind === "risk") return `<p>${T("Das gefährdet den Plan gerade am meisten:", "This threatens the plan most right now:")}</p>${li(wsd(s, w).risks.filter((r) => r.state !== "closed").slice(0, 3).map((r) => `<b>${esc(L(r.title))}</b> – ${esc(L(r.mit))}`))}`;
    if (kind === "next" || kind === "standup") return `<p>${T("Die wichtigsten nächsten Schritte:", "The most important next steps:")}</p>${li(high.slice(0, 3).map((x) => `<b>${esc(L(x.t.title))}</b> · ${esc(PEOPLE[x.t.who].name.split(" ")[0])} · ${esc(L(x.p.name))}`))}`;
    if (kind === "dec") return `<p>${T("Entscheidungen in diesem Arbeitsbereich:", "Decisions in this workspace:")}</p>${li(wsd(s, w).decisions.map((d) => `<b>${esc(L(d.title))}</b> – ${L(DEC_STATE[d.state])}`))}`;
    return `<p>${T(`${esc(w.name)} steht bei ${st.pc} %: ${st.done} von ${st.tasks.length} Aufgaben sind erledigt, ${high.length} offene haben hohe Priorität.`, `${esc(w.name)} is at ${st.pc}%: ${st.done} of ${st.tasks.length} tasks are done, ${high.length} open ones are high priority.`)}</p>${li(st.ps.map((p) => `<b>${esc(L(p.name))}</b>: ${pct(p)} % · ${T(`${openOf(p)} offen`, `${openOf(p)} open`)}`))}<p>${T("Nichts ist überfällig. Der nächste Meilenstein ist die Closed Beta.", "Nothing is overdue. The next milestone is the closed beta.")}</p>`;
  };
  const NOTES = [
    { id: "n1", ws: "loopr", em: "🚀", title: ["Beta-Plan Closed Beta", "Closed beta plan"], at: ["Heute, 09:20", "Today, 09:20"], by: "LV", blocks: [["h", ["Ziel", "Goal"]], ["p", ["50 Tester in zwei Wochen, davon mindestens 30, die einen ganzen Song erzeugen.", "50 testers in two weeks, at least 30 of whom generate a full song."]], ["callout", ["Start ist der 7. November – wenn der TestFlight-Build bis Freitag durch ist.", "Start is 7 November – if the TestFlight build is through by Friday."]], ["h", ["Vor dem Start", "Before the start"]], ["todo", ["Warteliste-Mail schreiben", "Write the waitlist email"], "t7"], ["todo", ["Feedback-Formular einrichten", "Set up the feedback form"], "t8"], ["todo", ["20 Beta-Tester einladen", "Invite 20 beta testers"], "t9"], ["h", ["Ablauf", "Schedule"]], ["table", [[["Woche", "Week"], ["Was", "What"], ["Wer", "Who"]], [["1", "1"], ["Onboarding und erstes Summen", "Onboarding and first hum"], ["Aylin", "Aylin"]], [["2", "2"], ["Songs teilen, Abschluss-Call", "Share songs, wrap-up call"], ["Mara", "Mara"]]]]] },
    { id: "n2", ws: "loopr", em: "🎙️", title: ["Modellvergleich Summen-zu-MIDI", "Hum-to-MIDI model comparison"], at: ["Gestern", "Yesterday"], by: "JW", blocks: [["p", ["Drei Modelle auf 40 Aufnahmen getestet. Bewertet nach Trefferquote der Tonhöhe und Latenz auf dem Handy.", "Three models tested on 40 recordings. Rated by pitch accuracy and latency on the phone."]], ["table", [[["Modell", "Model"], ["Tonhöhe", "Pitch"], ["Latenz", "Latency"]], [["A", "A"], ["91 %", "91%"], ["420 ms", "420 ms"]], [["B", "B"], ["88 %", "88%"], ["180 ms", "180 ms"]], [["C", "C"], ["79 %", "79%"], ["90 ms", "90 ms"]]]], ["callout", ["Empfehlung: Modell B – fast so genau wie A, aber auf älteren Geräten flüssig.", "Recommendation: model B – almost as accurate as A, but smooth on older devices."]]] },
    { id: "n3", ws: "loopr", em: "📝", title: ["Team-Update KW 44", "Team update week 44"], at: ["30.10.26", "30/10/26"], by: "MS", blocks: [["p", ["Aufnahme-Screen ist fertig, die API-Schnittstelle liegt zur Prüfung bei Jonas. Fokus bis Freitag: TestFlight-Build.", "The recording screen is done, the API contract is with Jonas for review. Focus until Friday: the TestFlight build."]]] },
    { id: "n4", ws: "kiez", em: "🗺️", title: ["Abholpunkte im Kiez", "Pick-up points in the neighbourhood"], at: ["29.10.26", "29/10/26"], by: "SR", blocks: [["p", ["Drei Läden haben zugesagt: Späti Ecke Weserstraße, Buchladen am Platz, Fahrradwerkstatt.", "Three shops have agreed: the corner shop on Weserstraße, the bookshop on the square, the bike workshop."]]] },
  ];
  const OPENINGS = [
    { id: "o1", ws: "loopr", project: "app", title: ["iOS-Entwickler:in für die Aufnahme-Engine", "iOS developer for the recording engine"], facts: ["Teilzeit · 10 Std./Woche · Remote · Anteile · Langfristig", "Part-time · 10 h/week · Remote · Equity · Long-term"], sum: ["Du baust mit Jonas die Aufnahme und das Zusammenspiel mit dem Summen-zu-MIDI-Modell – von Core Audio bis TestFlight.", "With Jonas you build recording and the hand-off to the hum-to-MIDI model – from Core Audio to TestFlight."], must: ["Swift", "Core Audio", "SwiftUI"], score: 0, apps: 2 },
    { id: "o2", ws: "synth", project: null, by: "Synth Lab", title: ["Produkt-Gründer:in für Podcast-Schnitt mit KI", "Product founder for AI podcast editing"], facts: ["Teilzeit · 8 Std./Woche · Remote · Anteile", "Part-time · 8 h/week · Remote · Equity"], sum: ["Wir haben das Audio-Modell, uns fehlt jemand, der daraus ein Produkt macht und die ersten 20 Nutzer holt.", "We have the audio model; we need someone who turns it into a product and brings in the first 20 users."], must: ["Produkt", "Audio", "Growth"], have: [0, 1], score: 87 },
    { id: "o3", ws: "green", project: null, by: "Greenroute", title: ["Design für einen Routenplaner für Lastenräder", "Design for a cargo-bike route planner"], facts: ["Projektweise · 5 Std./Woche · Hybrid · Honorar", "Per project · 5 h/week · Hybrid · Fee"], sum: ["Karte, Routenvorschläge und ein Onboarding, das auch auf dem Lenker funktioniert.", "Map, route suggestions and an onboarding that works on the handlebars too."], must: ["Figma", "Karten-UI", "UX-Research"], have: [0], score: 74 },
  ];
  const band = (v) => v >= 80 ? [T("Starkes Match", "Strong match"), "ok"] : v >= 60 ? [T("Gutes Match", "Good match"), "acc"] : v >= 40 ? [T("Solides Match", "Solid match"), "warn"] : [T("Wachsendes Match", "Growing match"), "faint"];
  const openingCard = (s, own = true) => (o) => `<li class="xa-opening"><div class="xa-okr-head"><span class="xa-grow"><b>${esc(L(o.title))}</b><small>${o.project ? `${esc(L(proj(s, o.project).name))} · Loopr Studio` : esc(o.by)}</small></span>${own ? "" : `<span class="xa-fit">${ring(o.score, 48, 4)}<small>${T("passt", "fits")}</small></span>`}</div>
      <p class="xa-op-facts">${esc(L(o.facts))}</p><p class="xa-op-sum">${esc(L(o.sum))}</p>
      <p class="xa-ws-tags">${o.must.map((k, i) => `<span class="xa-tag${!own && (o.have || []).includes(i) ? " is-have" : ""}">${!own && (o.have || []).includes(i) ? "✓ " : ""}${esc(k)}</span>`).join("")}</p>
      ${own ? `<div class="xa-op-foot"><small>${T(`${o.apps} Bewerbungen`, `${o.apps} applications`)}</small><span class="xa-grow"></span>${hbtn(T("Passende Builder", "Matching builders"), 'data-act="go" data-area="discover" data-k="op-match-' + o.id + '"')}${hbtn(T("Bearbeiten", "Edit"), 'data-act="app-only" data-v="opening" data-k="op-edit-' + o.id + '"')}</div>`
        : `<p class="xa-op-checks">✓ ${T("Muss-Skills", "Must-have skills")}   ◐ ${T("Zeit", "Time")}   ✓ ${T("Sprache", "Language")}</p><div class="xa-op-foot">${hbtn("Details", 'data-act="app-only" data-v="opening" data-k="op-d-' + o.id + '"')}<span class="xa-grow"></span><button type="button" class="xa-ghost" data-act="app-only" data-v="opening" data-k="op-n-${o.id}">${T("Nicht für mich", "Not for me")}</button><button type="button" class="xa-hbtn is-primary${s.requested[o.id] ? " is-sent" : ""}" data-act="disc-req" data-id="${o.id}" data-k="op-a-${o.id}" aria-pressed="${!!s.requested[o.id]}">${s.requested[o.id] ? T("Beworben", "Applied") : T("Bewerben", "Apply")}</button></div>`}</li>`;

  // Projekt im Arbeitsbereich: Die Modulleiste zeigt dann die Abschnitte des Projekts
  const P_NAV = [["overview", "gauge", ["Übersicht", "Overview"]], ["work", "kanban", ["Arbeit", "Work"]], ["social", "message", ["Social", "Social"]], ["team", "users", ["Team", "Team"]], ["files", "folder", ["Dateien", "Files"]], ["notes", "file", ["Notizen", "Notes"]], ["insights", "pulse", ["Insights", "Insights"]], ["settings", "settings", ["Einstellungen", "Settings"]]];
  const COLS = () => [["todo", T("Zu erledigen", "To do")], ["doing", T("In Arbeit", "In progress")], ["review", T("In Prüfung", "In review")], ["done", T("Erledigt", "Done")]];
  function wsProject(s, w, id) {
    const p = proj(s, id) || s.projects[0];
    const cols = COLS();
    const next = { todo: "doing", doing: "review", review: "done", done: "todo" };
    const moveLabel = { todo: T("Starten", "Start"), doing: T("Zur Prüfung", "To review"), review: T("Freigeben", "Approve"), done: T("Wieder öffnen", "Reopen") };
    const ms = s.milestones.filter((m) => m.project === p.id);
    const head = `<div class="xa-phead"><div class="xa-phead-top"><h3 class="xa-pname" tabindex="-1" data-k="title">${esc(L(p.name))}</h3><div class="xa-sechead-act">${hbtn(`+ ${T("Neuer Task", "New task")}`, 'data-act="newtask-here" data-k="pd-new"', "is-soft")}${hbtn(T("Bearbeiten", "Edit"), 'data-act="app-only" data-v="project-edit" data-k="pd-edit"')}<button type="button" class="xa-iconbtn" data-act="app-only" data-v="project-edit" data-k="pd-more" aria-label="${T("Weitere Aktionen", "More actions")}">${icon("more")}</button></div></div>
      <p class="xa-pmeta"><button type="button" class="xa-ppill" data-act="ws" data-id="${w.id}" data-k="pd-ws">${icon("grid")}${esc(w.name)}</button><span class="xa-ppill is-st"><i></i>${pStatus(p)[0] === "active" ? T("In Arbeit", "In progress") : pStatus(p)[1]}</span><span class="xa-faint">${T(`${p.tasks.length} Aufgaben`, `${p.tasks.length} tasks`)}</span></p>
      <p class="xa-pdesc">${esc(L(p.desc))}</p></div>`;
    if (s.projTab !== "work") {
      const ops = OPENINGS.filter((o) => o.project === p.id);
      return `${head}
        <div class="xa-ostats">${oStat(T("FORTSCHRITT", "PROGRESS"), pct(p) + "%", T(`${p.tasks.length - openOf(p)} von ${p.tasks.length} erledigt`, `${p.tasks.length - openOf(p)} of ${p.tasks.length} done`), pct(p))}${oStat(T("OFFENE TASKS", "OPEN TASKS"), openOf(p), T("Nichts überfällig", "Nothing overdue"))}${oStat(T("NÄCHSTER MEILENSTEIN", "NEXT MILESTONE"), ms[0] ? esc(L(ms[0].name)) : "—", ms[0] ? esc(L(ms[0].when)) : "")}${oStat("MOMENTUM", pct(p) >= 20 ? T("Stabil", "Steady") : T("Anlauf", "Warming up"), T("3 Tasks in 7 Tagen", "3 tasks in 7 days"))}</div>
        <section class="xa-wcard xa-pai"><span class="xa-pai-ic">✦</span><span class="xa-grow"><b>Xyntal KI</b><small>${T("Live-Lesen der echten Daten dieses Projekts", "Reads this project's real data live")}</small></span><button type="button" class="xa-hbtn xa-hbtn-ai" data-act="go" data-area="ai-center" data-k="pa-ask">${AI_MARK}${T("Xyntal fragen", "Ask Xyntal")}</button>
          <div class="xa-pai-act">${hbtn(T("Zusammenfassen", "Summarise"), 'data-act="ai" data-v="summary" data-k="pa-sum"', "is-primary")}${hbtn(T("Analysieren", "Analyse"), 'data-act="ai" data-v="risks" data-k="pa-an"')}${hbtn(T("Tasks erzeugen", "Generate tasks"), 'data-act="app-only" data-v="ai-tasks" data-k="pa-t"')}${hbtn(T("Roadmap erzeugen", "Generate roadmap"), 'data-act="app-only" data-v="ai-tasks" data-k="pa-r"')}${hbtn(T("Risiken finden", "Find risks"), 'data-act="ai" data-v="risks" data-k="pa-risk"')}</div></section>
        <section class="xa-wcard"><header><h4>${T("Ausschreibungen", "Openings")}</h4><span class="xa-sechead-act">${hbtn(`✦ ${T("Mit Xyntal AI schreiben", "Write with Xyntal AI")}`, 'data-act="app-only" data-v="opening" data-k="po-ai"')}${hbtn(T("Neue Ausschreibung", "New opening"), 'data-act="app-only" data-v="opening" data-k="po-new"')}</span></header>
          <ul class="xa-openings">${ops.map(openingCard(s)).join("") || `<li class="xa-muted">${T("Noch keine Ausschreibung für dieses Projekt.", "No opening for this project yet.")}</li>`}</ul></section>`;
    }
    const views = [["board", "Board"], ["list", T("Liste", "List")], ["timeline", T("Zeitachse", "Timeline")], ["milestones", T("Meilensteine", "Milestones")]];
    const bar = `<div class="xa-toolbar xa-workbar"><div class="xa-seg" role="group" aria-label="${T("Ansicht", "View")}">${views.map(([v, label]) => `<button type="button" data-act="${v === "timeline" ? "app-only" : "projview"}" data-v="${v}" data-k="pv-${v}" aria-pressed="${s.projView === v}">${label}</button>`).join("")}</div><span class="xa-grow"></span><span class="xa-fakeinput">${T("Aufgaben suchen …  /", "Search tasks …  /")}</span>${hbtn("Filter", 'data-act="app-only" data-v="filter" data-k="pw-filter"')}${hbtn(T("Sortierung: Manuell", "Sort: Manual"), 'data-act="app-only" data-v="filter" data-k="pw-sort"')}${hbtn(`+ ${T("Aufgabe", "Task")}`, 'data-act="newtask-here" data-k="pw-new"', "is-primary")}</div>`;
    const dueCls = (t) => /Heute|Today/.test(L(t.due || "")) ? "is-today" : "";
    if (s.projView === "list") return `${head}${bar}<div class="xa-ttable xa-tlist" role="table" aria-label="${T("Aufgaben", "Tasks")}"><div class="xa-tt-h" role="row"><span role="columnheader">STATUS</span><span role="columnheader">${T("PRIORITÄT", "PRIORITY")}</span><span role="columnheader">${T("AUFGABE", "TASK")}</span><span role="columnheader">${T("ZUSTÄNDIG", "ASSIGNEE")}</span><span role="columnheader">${T("FÄLLIG", "DUE")}</span></div>
      ${p.tasks.map((t) => `<div class="xa-tt-r${t.status === "done" ? " is-done" : ""}" role="row"><span role="cell"><button type="button" class="xa-stbtn is-${t.status}" data-act="move" data-id="${t.id}" data-to="${next[t.status]}" data-k="mv-${t.id}"><i></i>${Object.fromEntries(cols)[t.status]}</button></span><span role="cell"><i class="xa-pbar is-${t.prio}"></i>${L(PRIO[t.prio])}</span><span role="cell"><b>${esc(L(t.title))}</b></span><span role="cell">${avatar(t.who, "xa-av-sm")}${esc(PEOPLE[t.who].name.split(" ")[0])}</span><span role="cell" class="xa-mono">${t.due && t.status !== "done" ? esc(L(t.due)) : "—"}</span></div>`).join("")}</div>`;
    if (s.projView === "milestones") return `${head}${bar}${ms.length ? `<ul class="xa-mrows2">${ms.map((m) => `<li><div><i class="xa-dot" style="--h:var(--xa-acc)"></i><span class="xa-grow"><b>${esc(L(m.name))}</b><small>${T(`${openOf(p)} offene Aufgaben`, `${openOf(p)} open tasks`)}</small></span><em class="${m.soon ? "is-warn" : ""}">${esc(L(m.when))}</em></div></li>`).join("")}</ul>` : wsEmpty("flag", T("Noch keine Meilensteine", "No milestones yet"), T("Für dieses Projekt ist noch kein Meilenstein geplant.", "No milestone planned for this project yet."))}`;
    return `${head}${bar}
    <div class="xa-kanban xa-kb2">${cols.map(([st, label]) => {
      const ts = p.tasks.filter((t) => t.status === st);
      return `<div class="xa-kcol is-${st}" role="region" aria-label="${esc(label)}"><h4><i></i>${label}<span>${ts.length}</span></h4>
        <ul class="xa-kcards">${ts.map((t) => `<li class="xa-kc is-${t.prio}${st === "done" ? " is-done" : ""}"><b>${esc(L(t.title))}</b>
          <div class="xa-kc-foot">${t.due && st !== "done" ? `<span class="xa-kc-due ${dueCls(t)}">${icon("calendar")}${esc(L(t.due))}</span>` : ""}<span class="xa-grow"></span><span class="xa-at">@${esc(PEOPLE[t.who].name.split(" ")[0])}</span></div>
          <button type="button" class="xa-kc-move" data-act="move" data-id="${t.id}" data-to="${next[st]}" data-k="mv-${t.id}">${moveLabel[st]} →</button></li>`).join("") || `<li class="xa-kdrop">${T("Aufgaben hierher ziehen", "Drag tasks here")}</li>`}</ul>
        ${st === "todo" ? `<form class="xa-addtask xa-kadd" data-form="addtask" data-id="${p.id}"><label class="xa-sr" for="xa-add-${uid}">${T("Neue Aufgabe", "New task")}</label><input id="xa-add-${uid}" name="title" maxlength="80" autocomplete="off" placeholder="+ ${T("Aufgabe hinzufügen", "Add task")}" data-k="addtask"></form>` : ""}
      </div>`;
    }).join("")}</div>`;
  }
  function wsNote(s, w, id) {
    const n = NOTES.find((x) => x.id === id) || NOTES[0];
    const block = ([kind, a, b]) => kind === "h" ? `<h4>${esc(L(a))}</h4>` : kind === "callout" ? `<p class="xa-callout"><span aria-hidden="true">💡</span>${esc(L(a))}</p>` : kind === "todo" ? (() => { const x = allTasks(s).find((y) => y.t.id === b); const d = x && x.t.status === "done"; return `<label class="xa-check xa-ntodo${d ? " is-done" : ""}"><input type="checkbox" data-act="task" data-id="${b}" data-k="task-${b}"${d ? " checked" : ""}><span class="xa-box" aria-hidden="true">${icon("check")}</span><span class="xa-task-t">${esc(L(a))}</span></label>`; })() : kind === "table" ? `<div class="xa-ntable" role="table">${a.map((row, i) => `<div role="row">${row.map((c) => `<span role="${i ? "cell" : "columnheader"}">${esc(L(c))}</span>`).join("")}</div>`).join("")}</div>` : `<p>${esc(L(a))}</p>`;
    return `<article class="xa-notepage"><div class="xa-note-bar"><button type="button" class="xa-ghost" data-act="ws-sub" data-id="${w.id}" data-v="notes" data-k="np-back">← ${T("Alle Seiten", "All pages")}</button><span class="xa-grow"></span><span class="xa-stack">${avatar(n.by, "xa-av-sm")}${n.by === "LV" ? "" : avatar("LV", "xa-av-sm")}</span>${hbtn(T("Teilen", "Share"), 'data-act="app-only" data-v="note" data-k="np-share"')}<button type="button" class="xa-hbtn xa-hbtn-ai" data-act="app-only" data-v="note-ai" data-k="np-ai">${AI_MARK}Xyntal KI</button></div>
      <span class="xa-note-icon" aria-hidden="true">${n.em}</span><h3 class="xa-note-title" tabindex="-1" data-k="title">${esc(L(n.title))}</h3><p class="xa-note-meta">${esc(PEOPLE[n.by].name)} · ${esc(L(n.at))}</p>
      <div class="xa-note-body">${n.blocks.map(block).join("")}<p class="xa-note-hint">${T("„/“ für Blöcke – Tabellen, Checklisten, Datenbanken und KI gibt es in der echten App.", "“/” for blocks – tables, checklists, databases and AI are in the real app.")}</p></div></article>`;
  }

  const hbtn = (label, attrs, cls = "") => `<button type="button" class="xa-hbtn ${cls}" ${attrs}>${label}</button>`;
  const wsEmpty = (ic, title, text) => `<div class="xa-wsempty"><span class="xa-icon-tile">${icon(ic)}</span><b>${title}</b><p>${text}</p></div>`;

  const WS_PAGES = {
    overview(s, w, st) {
      const ms = s.milestones.filter((m) => st.ps.some((p) => p.id === m.project));
      const d = wsd(s, w);
      const pulse = (ic, cls, label, value, sub, to) => `<button type="button" class="xa-pulse" data-act="ws-sub" data-id="${w.id}" data-v="${to}" data-k="pu-${to}"><span class="xa-pulse-ic ${cls}">${icon(ic)}</span><span><small>${label}</small><b>${value}</b><span>${sub}</span></span></button>`;
      const okrOn = d.okrs.filter((o) => o.state === "on").length;
      const crit = d.risks.filter((x) => x.sev === "crit").length;
      const openDec = d.decisions.filter((x) => x.state === "proposed").length;
      return `<div class="xa-wstats">${wsStat(T("GESAMTFORTSCHRITT", "OVERALL PROGRESS"), st.pc + "%", "", `<div class="xa-progress"><i style="width:${st.pc}%"></i></div>`)}${wsStat(T("OFFENE TASKS", "OPEN TASKS"), st.open, T("Nichts überfällig", "Nothing overdue"))}${wsStat(T("NÄCHSTER MEILENSTEIN", "NEXT MILESTONE"), ms[0] ? esc(L(ms[0].name)) : "—", ms[0] ? esc(L(ms[0].when)) : T("Keine offenen Meilensteine", "No open milestones"))}${wsStat("TEAM ONLINE", `${w.online} / ${w.members.length}`, T("Gerade online", "Online right now"))}</div>
        <p class="xa-wsline">${T(`${st.ps.length} Projekte · ${st.open} offene Aufgaben, ${st.pc} % erledigt`, `${st.ps.length} projects · ${st.open} open tasks, ${st.pc}% done`)}</p>
        <div class="xa-pulses">${pulse("pulse", "is-ok", T("LIEFERUNG", "DELIVERY"), st.pc + "%", T("nichts überfällig", "nothing overdue"), "insights")}${pulse("target", "", T("ZIELE", "GOALS"), d.okrs.length ? T(`${okrOn} von ${d.okrs.length}`, `${okrOn} of ${d.okrs.length}`) : "—", d.okrs.length ? T("auf Kurs", "on track") : T("setz dein erstes OKR", "set your first OKR"), "okrs")}${pulse("alert", "is-warn", T("RISIKEN", "RISKS"), d.risks.length, crit ? T(`${crit} kritisch`, `${crit} critical`) : T("keins kritisch", "none critical"), "risks")}${pulse("clip", "is-gold", T("ENTSCHEIDUNGEN", "DECISIONS"), openDec, openDec ? T("warten auf Entscheidung", "awaiting a decision") : T("alles entschieden", "all decided"), "decisions")}${pulse("sparkle", "", T("LETZTES BRIEFING", "LATEST BRIEFING"), d.briefs.length ? esc(L(d.briefs[0].at)) : T("Noch keins", "None yet"), T("ein Klick zum Statusbericht", "one click to a status report"), "briefs")}</div>
        <div class="xa-wscols">
          <section class="xa-wcard"><header><h4 class="xa-seclabel">${T("AKTIVE PROJEKTE", "ACTIVE PROJECTS")}</h4><button type="button" class="xa-acc-link" data-act="ws-sub" data-id="${w.id}" data-v="projects" data-k="ov-allp">${T(`Alle ${st.ps.length}`, `All ${st.ps.length}`)} →</button></header>
            <ul class="xa-aprows">${st.ps.map((p) => `<li><button type="button" class="xa-plain" data-act="project" data-id="${p.id}" data-k="ovp-${p.id}"><i class="xa-dot" style="--h:${p.hue}"></i><b>${esc(L(p.name))}</b><span class="xa-mtag xa-st-${pStatus(p)[0]}">${pStatus(p)[1]}</span><span class="xa-progress"><i style="width:${pct(p)}%"></i></span><small>${pct(p)}%</small></button></li>`).join("") || `<li class="xa-empty">${T("Noch keine Projekte.", "No projects yet.")}</li>`}</ul></section>
          <div class="xa-col">
            <section class="xa-wcard"><header><h4>Team</h4><button type="button" class="xa-acc-link" data-act="ws-sub" data-id="${w.id}" data-v="roles" data-k="ov-roles">${T("Rollen", "Roles")} →</button></header>
              <ul class="xa-people">${w.members.map((m, i) => `<li>${avatar(m, "xa-av-sm")}<span class="xa-grow">${esc(PEOPLE[m].name)}</span><small class="xa-muted">${i === 0 ? T("Inhaber", "Owner") : esc(L(PEOPLE[m].role))}</small></li>`).join("")}</ul></section>
            <section class="xa-wcard"><header><h4 class="xa-seclabel">${T("LETZTE AKTIVITÄT", "RECENT ACTIVITY")}</h4></header>
              <ul class="xa-actrows">${d.activity.slice(0, 4).map((a) => `<li><span class="xa-act-ic">${icon(a.icon)}</span><span class="xa-grow"><b>${esc(L(a.text))}</b><small>${esc(PEOPLE[a.who].name)}</small></span><time>${esc(L(a.at))}</time></li>`).join("") || `<li class="xa-empty">${T("Noch keine Aktivität.", "No activity yet.")}</li>`}</ul></section>
          </div>
        </div>
        <section class="xa-wcard"><header><h4>${T("Meilensteine", "Milestones")}</h4><span class="xa-mono">${T(`0 erledigt · ${ms.length} offen`, `0 done · ${ms.length} open`)}</span></header>
          ${ms.length ? `<ul class="xa-aprows">${ms.map((m) => `<li><div><i class="xa-dot" style="--h:${proj(s, m.project).hue}"></i><b>${esc(L(m.name))}</b><span class="xa-muted">${esc(L(proj(s, m.project).name))}</span><span class="xa-grow"></span><span class="xa-spill${m.soon ? " is-warn" : ""}">${esc(L(m.when))}</span></div></li>`).join("")}</ul>` : `<p class="xa-muted">${T("Keine offenen Meilensteine.", "No open milestones.")}</p>`}</section>
        <div class="xa-sechead xa-mt"><h4 class="xa-modh">${T("Module", "Modules")}</h4>${hbtn(`+ ${T("Modul hinzufügen", "Add module")}`, 'data-act="app-only" data-v="module" data-k="ov-mod"')}</div>
        <ul class="xa-mods">${[["D", T("Dateien", "Files")], ["P", T("Projekte", "Projects")], ["M", T("Meilensteine", "Milestones")], ["K", T("Kalender", "Calendar")], ["R", "Roadmap"], ["N", T("Notizen", "Notes")], ["Z", T("Ziele", "Goals")]].map(([l, name]) => `<li><span class="xa-mod-l">${l}</span><span><b>${name}</b><small><i></i>${T("Aktiviert", "Enabled")}</small></span></li>`).join("")}</ul>`;
    },
    projects(s, w, st) {
      const active = st.ps.filter((p) => pStatus(p)[0] === "active").length;
      const fin = st.ps.filter((p) => pStatus(p)[0] === "done").length;
      return `${secHead(T("PROJEKTE", "PROJECTS"), T("Alles, was sich in diesem Arbeitsbereich bewegt", "Everything moving in this workspace"), hbtn(`+ ${T("Projekt hinzufügen", "Add project")}`, 'data-act="app-only" data-v="project" data-k="pj-add"', "is-primary"))}
        <div class="xa-wstats">${wsStat(T("Projekte", "Projects"), st.ps.length, T("in diesem Arbeitsbereich", "in this workspace"))}${wsStat(T("In Arbeit", "In progress"), active, T("gerade im Aufbau", "being built right now"))}${wsStat(T("ABGESCHLOSSEN", "COMPLETED"), fin, T("geliefert", "delivered"))}${wsStat(T("TASK-ABSCHLUSS", "TASK COMPLETION"), st.pc + "%", "", `<div class="xa-progress"><i style="width:${st.pc}%"></i></div>`)}</div>
        <ul class="xa-pjgrid">${st.ps.map((p) => `<li class="xa-pj" style="--h:${p.hue}"><button type="button" class="xa-plain xa-pj-open" data-act="project" data-id="${p.id}" data-k="pc-${p.id}"><span class="xa-code">${p.code}</span><span class="xa-grow"><b>${esc(L(p.name))}</b><small>${pStatus(p)[1]}</small></span></button><button type="button" class="xa-iconbtn xa-star" data-act="pstar" data-id="${p.id}" data-k="ps-${p.id}" aria-pressed="${!!s.projStars[p.id]}" aria-label="${T(`${L(p.name)} markieren`, `Star ${L(p.name)}`)}">${icon("star")}</button>
          <p class="xa-pj-desc">${esc(L(p.desc))}</p>
          <div class="xa-pj-prog"><small>${T("AUFGABENFORTSCHRITT", "TASK PROGRESS")}</small><span>${p.tasks.length - openOf(p)}/${p.tasks.length} <b>${pct(p)}%</b></span></div>
          <div class="xa-progress"><i style="width:${pct(p)}%"></i></div>
          <div class="xa-pj-foot"><span>${openOf(p) ? T(`${openOf(p)} offene Aufgaben`, `${openOf(p)} open tasks`) : p.tasks.length ? T("Alles erledigt", "All done") : T("Noch keine Aufgaben", "No tasks yet")}</span><span class="xa-stack">${[...new Set(p.tasks.map((t) => t.who))].slice(0, 3).map((m) => avatar(m, "xa-av-sm")).join("")}</span></div></li>`).join("") || `<li class="xa-empty">${T("Noch keine Projekte.", "No projects yet.")}</li>`}</ul>`;
    },
    milestones(s, w, st) {
      const ms = s.milestones.filter((m) => st.ps.some((p) => p.id === m.project));
      return `${secHead(T("MEILENSTEINE", "MILESTONES"))}
        <div class="xa-ostats">${oStat(T("GESAMT", "TOTAL"), ms.length, T("über alle Projekte", "across all projects"))}${oStat(T("ÜBERFÄLLIG", "OVERDUE"), 0, T("alles im Plan", "all on track"))}${oStat(T("BEVORSTEHEND", "UPCOMING"), ms.length, T("fällig in den nächsten 30 Tagen", "due in the next 30 days"))}${oStat(T("NÄCHSTE FÄLLIGKEIT", "NEXT DUE"), ms[0] ? esc(L(ms[0].when)) : "—", ms[0] ? esc(L(ms[0].name)) : "")}</div>
        ${ms.length ? `<ul class="xa-mrows2">${ms.map((m) => `<li><button type="button" class="xa-plain" data-act="project" data-id="${m.project}" data-k="ms-${m.project}"><i class="xa-dot" style="--h:var(--xa-acc)"></i><span class="xa-grow"><b>${esc(L(m.name))}</b><small>${esc(L(proj(s, m.project).name))}</small></span><em class="${m.soon ? "is-warn" : ""}">${esc(L(m.when))}</em></button></li>`).join("")}</ul>` : wsEmpty("flag", T("Noch keine Meilensteine", "No milestones yet"), T("Lege in einem Projekt einen Meilenstein an, um Fristen und Fortschritt hier zu sehen.", "Add a milestone in a project to see deadlines and progress here."))}`;
    },
    roadmap(s, w, st) {
      const ms = s.milestones.filter((m) => st.ps.some((p) => p.id === m.project));
      const buckets = [[T("Diesen Monat", "This month"), ms.filter((m) => !/Dez|Dec/.test(L(m.when)))], [T("Nächster Monat", "Next month"), ms.filter((m) => /Dez|Dec/.test(L(m.when)))], [T("Später", "Later"), []]].filter((b) => b[1].length);
      return `${secHead("ROADMAP")}${buckets.map(([label, items]) => `<p class="xa-rm-h"><span class="xa-seclabel">${label}</span><span class="xa-mono">${items.length}</span></p><ul class="xa-rm">${items.map((m) => `<li><i></i><button type="button" class="xa-plain" data-act="project" data-id="${m.project}" data-k="rm-${m.project}"><span class="xa-grow"><b>${esc(L(m.name))}</b><small>${esc(L(proj(s, m.project).name))}</small></span><em>${esc(L(m.when))}</em></button></li>`).join("")}</ul>`).join("") || wsEmpty("map", T("Noch nichts auf der Roadmap", "Nothing on the roadmap yet"), T("Meilensteine mit Datum erscheinen hier nach Monaten sortiert.", "Milestones with a date appear here sorted by month."))}`;
    },
    calendar(s, w) {
      const kind = w.id === "loopr" ? ["work", "milestone", "focus"] : ["work"];
      const ev = s.cal.events.filter((e) => kind.includes(e.kind)).sort((a, b) => a.day - b.day || a.s - b.s).slice(0, w.id === "loopr" ? 9 : 2);
      return `${secHead(T("KALENDER", "CALENDAR"), T("Termine, Fristen und Fokusblöcke dieses Arbeitsbereichs", "Events, deadlines and focus blocks of this workspace"), hbtn(T("Im Kalender öffnen", "Open in calendar"), 'data-act="go" data-area="calendar" data-k="wc-open"'))}
        <ul class="xa-mrows2">${ev.map((e) => `<li><div><i class="xa-dot" style="--h:${KINDS[e.kind][3]}"></i><span class="xa-grow"><b>${esc(L(e.title))}</b><small>${en() ? KINDS[e.kind][1] : KINDS[e.kind][0]}</small></span><em>${L(DAYS[e.day])} · ${fmtH(e.s)}–${fmtH(e.e)}</em></div></li>`).join("")}</ul>`;
    },
    team(s, w) {
      const online = (i) => i < w.online;
      return `<div class="xa-sechead"><div><h4 class="xa-modh">Team</h4><p>${T(`${w.members.length} Mitglieder · ${w.online} online`, `${w.members.length} members · ${w.online} online`)}</p></div><div class="xa-sechead-act"><span class="xa-fakeinput">${T("Filtern …", "Filter …")}</span>${hbtn(T("Einladen", "Invite"), 'data-act="app-only" data-v="invite" data-k="tm-inv"', "is-primary")}</div></div>
        <div class="xa-ttable" role="table" aria-label="Team"><div class="xa-tt-h" role="row"><span role="columnheader">${T("Mitglied", "Member")}</span><span role="columnheader">${T("Rollen", "Roles")}</span><span role="columnheader">${T("Aktivität", "Activity")}</span><span role="columnheader"></span></div>
          ${w.members.map((m, i) => `<div class="xa-tt-r" role="row"><span role="cell">${avatar(m)}<span><b>${esc(PEOPLE[m].name)}${m === "LV" ? `<i class="xa-you">${T("du", "you")}</i>` : ""}</b><small>${m.toLowerCase()}@${w.slug.split("-")[0]}.studio</small></span></span><span role="cell"><span class="xa-rolepill${i === 0 ? " is-owner" : ""}">${i === 0 ? T("Inhaber", "Owner") : esc(L(PEOPLE[m].role))}</span></span><span role="cell"><span class="xa-actpill${online(i) ? " is-on" : ""}">${online(i) ? "Online" : T("vor 3 Std.", "3 h ago")}</span></span><span role="cell" class="xa-tt-act">${m === "LV" ? "" : `<button type="button" data-act="app-only" data-v="roles" data-k="tr-${m}">${T("Rollen", "Roles")}</button><button type="button" data-act="app-only" data-v="contact-m" data-k="tn-${m}">${T("Nachricht", "Message")}</button>`}</span></div>`).join("")}</div>
        ${secHead(T("AUSSCHREIBUNGEN", "OPENINGS"), T("Offene Rollen in diesem Arbeitsbereich – mit Matching und Xyntal KI", "Open roles in this workspace – with matching and Xyntal AI"), hbtn(`+ ${T("Ausschreibung", "Opening")}`, 'data-act="app-only" data-v="opening" data-k="tm-open"'))}
        <ul class="xa-openings">${OPENINGS.filter((o) => o.ws === w.id).map(openingCard(s)).join("") || `<li class="xa-empty">${T("Noch keine Ausschreibung.", "No openings yet.")}</li>`}</ul>`;
    },
    roles(s, w) {
      const rows = [[T("Inhaber", "Owner"), T("Alles, inklusive Abrechnung und Löschen", "Everything, including billing and deletion"), 1, [1, 1, 1, 1, 1]], ["Admin", T("Mitglieder, Rollen und Module verwalten", "Manage members, roles and modules"), w.id === "kiez" ? 1 : 0, [1, 1, 1, 1, 0]], [T("Mitglied", "Member"), T("Projekte, Aufgaben, Dateien und Notizen bearbeiten", "Edit projects, tasks, files and notes"), Math.max(0, w.members.length - 1), [1, 1, 1, 0, 0]], [T("Gast", "Guest"), T("Nur lesen, nur freigegebene Projekte", "Read only, shared projects only"), 0, [1, 0, 0, 0, 0]]];
      const cols = [T("Lesen", "Read"), T("Aufgaben", "Tasks"), T("Dateien", "Files"), T("Mitglieder", "Members"), T("Abrechnung", "Billing")];
      return `${secHead(T("ROLLEN & ZUGRIFF", "ROLES & ACCESS"), T("Wer was sehen und ändern darf", "Who may see and change what"), hbtn(`+ ${T("Rolle", "Role")}`, 'data-act="app-only" data-v="roles" data-k="rl-new"'))}
        <div class="xa-ttable xa-perm" role="table" aria-label="${T("Rechte", "Permissions")}"><div class="xa-tt-h" role="row"><span role="columnheader">${T("Rolle", "Role")}</span>${cols.map((c) => `<span role="columnheader">${c}</span>`).join("")}</div>
          ${rows.map(([name, desc, n, perms]) => `<div class="xa-tt-r" role="row"><span role="cell"><span><b>${name} <i class="xa-mono">${n}</i></b><small>${desc}</small></span></span>${perms.map((v) => `<span role="cell" class="${v ? "is-yes" : "is-no"}">${v ? icon("check") : "–"}</span>`).join("")}</div>`).join("")}</div>`;
    },
    files(s, w) {
      const list = s.files.filter((f) => f.ws === w.name);
      return `${secHead(T("DATEIEN", "FILES"), "", hbtn(T("Hochladen", "Upload"), 'data-act="upload" data-k="wf-up"', "is-primary"))}
        ${list.length ? `<ul class="xa-notes">${list.map((f) => `<li><button type="button" class="xa-plain" data-act="file" data-id="${f.id}" data-k="wf-${f.id}">${icon(f.type === "doc" ? "file" : f.type)}<span class="xa-grow">${esc(f.name)}</span><span class="xa-mono">${f.size} · ${esc(L(f.at))}</span></button></li>`).join("")}</ul>` : wsEmpty("folder", T("Noch keine Dateien hier", "No files here yet"), T("Dateien irgendwo ablegen oder die erste hochladen.", "Drop files anywhere or upload the first one."))}`;
    },
    notes(s, w) {
      const list = NOTES.filter((n) => n.ws === w.id);
      return `${secHead(T("NOTIZEN", "NOTES"), "", `${hbtn(T("Vorlagen", "Templates"), 'data-act="app-only" data-v="note-tpl" data-k="nt-tpl"')}${hbtn(`+ ${T("Neue Seite", "New page")}`, 'data-act="app-only" data-v="note" data-k="nt-new"', "is-primary")}`)}
        ${list.length ? `<ul class="xa-notes">${list.map((n) => `<li><button type="button" class="xa-plain" data-act="note" data-id="${n.id}" data-k="nt-${n.id}"><span class="xa-note-em" aria-hidden="true">${n.em}</span><span class="xa-grow">${esc(L(n.title))}</span><span class="xa-mono">${esc(L(n.at))}</span></button></li>`).join("")}</ul>` : wsEmpty("file", T("Noch keine Seiten", "No pages yet"), T("Schreib die erste Seite – mit Tabellen, Checklisten und KI.", "Write the first page – with tables, checklists and AI."))}`;
    },
    journal(s, w) {
      const d = wsd(s, w);
      return `${secHead("JOURNAL")}
        <form class="xa-journal-form" data-form="journal" data-id="${w.id}"><label class="xa-sr" for="xa-j-${uid}">${T("Tagebucheintrag", "Journal entry")}</label><input id="xa-j-${uid}" name="text" maxlength="300" autocomplete="off" placeholder="${T("Tagebucheintrag schreiben …", "Write a journal entry …")}" data-k="journal-input"><button type="submit" class="xa-hbtn is-primary">${T("Eintrag hinzufügen", "Add entry")}</button></form>
        <ul class="xa-journal">${d.journal.map((j) => `<li><small>${esc(L(j.at))}</small><p>${esc(L(j.text))}</p></li>`).join("") || `<li class="xa-empty">${T("Noch keine Einträge.", "No entries yet.")}</li>`}</ul>`;
    },
    okrs(s, w) {
      const d = wsd(s, w);
      const kp = (k) => Math.min(100, Math.round((k.cur / k.target) * 100));
      const op = (o) => (o.krs.length ? Math.round(o.krs.reduce((n, k) => n + kp(k), 0) / o.krs.length) : 0);
      const total = d.okrs.length ? Math.round(d.okrs.reduce((n, o) => n + op(o), 0) / d.okrs.length) : 0;
      const n = (st) => d.okrs.filter((o) => o.state === st).length;
      const done = d.okrs.filter((o) => op(o) >= 100).length;
      const list = d.okrs.filter((o) => s.okrFilter === "all" || (s.okrFilter === "done" ? op(o) >= 100 : op(o) < 100));
      return `${secHead(T("ZIELE & OKRS", "GOALS & OKRS"))}
        <div class="xa-okr-top"><span class="xa-okr-ring">${ring(total, 96, 8, false)}<span><b>${total}%</b><small>${T("gesamt", "overall")}</small></span></span>
          <div class="xa-wstats xa-wstats-sm">${wsStat(T("IM PLAN", "ON TRACK"), n("on"), "", "", "ok")}${wsStat(T("GEFÄHRDET", "AT RISK"), n("risk"), "", "", "gold")}${wsStat(T("KRITISCH", "CRITICAL"), n("crit"), "", "", "bad")}${wsStat(T("ERREICHT", "ACHIEVED"), `${done} / ${d.okrs.length}`)}</div></div>
        <div class="xa-toolbar"><span class="xa-fakeinput xa-grow">${T("Neues Ziel – z. B. „Partnerportal in Q1 starten“", "New goal – e.g. “Launch partner portal in Q1”")}</span>${hbtn(`+ ${T("Ziel hinzufügen", "Add goal")}`, 'data-act="app-only" data-v="goal" data-k="ok-add"', "is-primary")}${hbtn(T("Ausführlich …", "Detailed …"), 'data-act="app-only" data-v="goal" data-k="ok-add2"')}</div>
        <div class="xa-toolbar">${wchips("okrfilter", [["active", T("Aktiv", "Active")], ["done", T("Erreicht", "Achieved")], ["all", T("Alle", "All")]], s.okrFilter)}<span class="xa-grow"></span><button type="button" class="xa-ghost" data-act="ws-ask" data-id="${w.id}" data-v="okrs" data-k="ok-ai">${icon("sparkle")}${T("OKRs mit KI vorschlagen", "Suggest OKRs with AI")}</button></div>
        ${list.map((o) => { const stt = OKR_STATE[o.state]; return `<article class="xa-wcard xa-okr"><div class="xa-okr-head"><span class="xa-grow"><b>${esc(L(o.title))}</b><small>${esc(L(o.desc))}</small><span class="xa-meta"><button type="button" class="xa-spill2 is-${stt[2]}" data-act="okr-state" data-id="${o.id}" data-k="os-${o.id}">${L(stt)}</button><span>◉ ${esc(PEOPLE[o.owner].name)}</span><span>${esc(L(o.due))}</span></span></span><strong>${op(o)}%</strong></div>
          <div class="xa-progress is-${stt[2]}"><i style="width:${op(o)}%"></i></div>
          <ul class="xa-krs">${o.krs.map((k, i) => `<li><span class="xa-mono">KR${i + 1}</span><span class="xa-grow">${esc(L(k.t))}</span><span class="xa-progress${kp(k) >= 100 ? " is-ok" : ""}"><i style="width:${kp(k)}%"></i></span><button type="button" class="xa-kr-b" data-act="kr" data-id="${o.id}" data-v="${i}" data-to="-1" data-k="kr-${o.id}-${i}-m" aria-label="${T("Weniger", "Less")}">−</button><b>${k.cur} / ${k.target} ${esc(L(k.unit))}</b><button type="button" class="xa-kr-b" data-act="kr" data-id="${o.id}" data-v="${i}" data-to="1" data-k="kr-${o.id}-${i}-p" aria-label="${T("Mehr", "More")}">+</button></li>`).join("")}</ul></article>`; }).join("") || wsEmpty("target", T("Noch keine Ziele", "No goals yet"), T("Setz dein erstes OKR und miss den Fortschritt an Schlüsselergebnissen.", "Set your first OKR and measure progress with key results."))}`;
    },
    decisions(s, w) {
      const d = wsd(s, w);
      const n = (st) => d.decisions.filter((x) => x.state === st).length;
      const list = d.decisions.filter((x) => s.decFilter === "all" || x.state === s.decFilter);
      return `${secHead(T("ENTSCHEIDUNGSLOG", "DECISION LOG"))}
        <div class="xa-toolbar"><span class="xa-fakeinput xa-grow">${T("Entscheidungen, Gründe, Personen, Tags durchsuchen …", "Search decisions, reasons, people, tags …")}</span>${hbtn(`+ ${T("Entscheidung festhalten", "Record decision")}`, 'data-act="app-only" data-v="decision" data-k="dc-add"', "is-primary")}${hbtn(`${icon("sparkle")}${T("Mit KI zusammenfassen", "Summarise with AI")}`, `data-act="ws-ask" data-id="${w.id}" data-v="decisions" data-k="dc-ai"`)}</div>
        <div class="xa-toolbar">${wchips("decfilter", [["all", T(`Alle · ${d.decisions.length}`, `All · ${d.decisions.length}`)], ...Object.entries(DEC_STATE).map(([id, v]) => [id, `${L(v)} · ${n(id)}`, v[2]])], s.decFilter)}</div>
        ${list.map((x) => { const stt = DEC_STATE[x.state]; return `<article class="xa-wcard xa-dec is-${stt[2]}"><div class="xa-okr-head"><b class="xa-grow">${esc(L(x.title))}</b><span class="xa-spill2 is-${stt[2]}">${L(stt)}</span></div><p><b>${T("Entscheidung:", "Decision:")}</b> ${esc(L(x.dec))}</p><p class="xa-muted"><b>${T("Warum:", "Why:")}</b> ${esc(L(x.why))}</p><span class="xa-meta"><span>◉ ${esc(PEOPLE[x.owner].name)}</span><span>◷ ${esc(L(x.at))}</span>${x.tags.map((t) => `<span class="xa-htag">#${t}</span>`).join("")}</span></article>`; }).join("") || wsEmpty("clip", T("Noch keine Entscheidungen festgehalten", "No decisions recorded yet"), T("Halte fest, was ihr entscheidet und warum. Neue Teammitglieder sind in Minuten im Bild, und Xyntal KI bleibt in jeder Antwort dabei.", "Record what you decide and why. New teammates are up to speed in minutes, and Xyntal AI keeps it in every answer."))}`;
    },
    risks(s, w) {
      const d = wsd(s, w);
      const score = (x) => x.imp * x.lik;
      const lvl = (v) => v >= 15 ? ["crit", T("Kritisch", "Critical")] : v >= 8 ? ["high", T("Hoch", "High")] : v >= 4 ? ["mid", T("Mittel", "Medium")] : ["low", T("Niedrig", "Low")];
      const act = d.risks.filter((x) => x.state !== "closed");
      const list = [...d.risks].filter((x) => s.riskFilter === "all" || (s.riskFilter === "closed" ? x.state === "closed" : x.state !== "closed")).sort((a, b) => score(b) - score(a));
      let heat = "";
      for (let imp = 5; imp >= 1; imp--) for (let lik = 1; lik <= 5; lik++) { const c = act.filter((x) => x.imp === imp && x.lik === lik).length; heat += `<i class="is-${lvl(imp * lik)[0]}${c ? " has" : ""}">${c || ""}</i>`; }
      const stn = { open: [T("Offen", "Open"), ""], progress: [T("In Bearbeitung", "In progress"), "gold"], closed: [T("Geschlossen", "Closed"), "ok"] };
      return `${secHead(T("RISIKOREGISTER", "RISK REGISTER"))}
        <div class="xa-risk-top"><div class="xa-heatwrap"><span class="xa-heat-y">${T("Auswirkung", "Impact")}</span><div class="xa-heat5" role="img" aria-label="${T("Risikomatrix", "Risk matrix")}">${heat}</div><span class="xa-heat-x">${T("Wahrscheinlichkeit", "Likelihood")} →</span></div>
          <div class="xa-wstats xa-wstats-2">${wsStat(T("KRITISCH", "CRITICAL"), act.filter((x) => score(x) >= 15).length, T("Wert 15–25", "Score 15–25"), "", "bad")}${wsStat(T("HOCH", "HIGH"), act.filter((x) => score(x) >= 8 && score(x) < 15).length, T("Wert 8–14", "Score 8–14"), "", "warn")}${wsStat(T("OFFEN", "OPEN"), act.length, T(`${act.filter((x) => x.state === "progress").length} in Bearbeitung`, `${act.filter((x) => x.state === "progress").length} in progress`))}${wsStat(T("GESCHLOSSEN", "CLOSED"), d.risks.length - act.length, T("gelöste Risiken", "resolved risks"), "", "ok")}</div></div>
        <div class="xa-toolbar">${wchips("riskfilter", [["active", T("Aktiv", "Active")], ["closed", T("Geschlossen", "Closed")], ["all", T("Alle", "All")]], s.riskFilter)}<span class="xa-grow"></span>${hbtn(`${icon("sparkle")}${T("Risiken mit KI finden", "Find risks with AI")}`, 'data-act="ai" data-v="risks" data-k="rk-ai"')}${hbtn(`+ ${T("Risiko hinzufügen", "Add risk")}`, 'data-act="app-only" data-v="risk" data-k="rk-add"', "is-primary")}</div>
        ${list.map((x) => `<article class="xa-wcard xa-risk"><span class="xa-risk-score is-${lvl(score(x))[0]}"><b>${score(x)}</b><small>${lvl(score(x))[1]}</small></span><span class="xa-grow"><b>${esc(L(x.title))}</b><small>${esc(L(x.desc))}</small><small class="xa-mit">↳ ${esc(L(x.mit))}</small><span class="xa-meta"><span>${T(`Auswirkung ${x.imp} · Wahrscheinlichkeit ${x.lik}`, `Impact ${x.imp} · Likelihood ${x.lik}`)}</span><span>◉ ${esc(PEOPLE[x.owner].name)}</span><span>◷ ${esc(L(x.due))}</span></span></span><button type="button" class="xa-spill2 is-${stn[x.state][1]}" data-act="risk-state" data-id="${x.id}" data-k="rs-${x.id}">${stn[x.state][0]}</button></article>`).join("") || wsEmpty("alert", T("Keine Risiken in diesem Filter", "No risks in this filter"), T("Halte fest, was schiefgehen kann – mit Auswirkung, Wahrscheinlichkeit und Gegenmaßnahme.", "Record what could go wrong – with impact, likelihood and mitigation."))}`;
    },
    funding(s, w) {
      const d = wsd(s, w);
      const sum = d.funding.reduce((n, f) => n + f.amount, 0);
      const eur = (v) => `${v.toLocaleString(en() ? "en-GB" : "de-DE")} €`;
      const big = [...d.funding].sort((a, b) => b.amount - a.amount)[0];
      return `${secHead("FUNDING", "", hbtn(`+ ${T("Runde hinzufügen", "Add round")}`, 'data-act="app-only" data-v="funding" data-k="fd-add"', "is-primary"))}
        <div class="xa-ostats">${oStat(T("GESAMT EINGESAMMELT", "TOTAL RAISED"), eur(sum), T("über alle Runden", "across all rounds"))}${oStat(T("RUNDEN", "ROUNDS"), d.funding.length, T("bisher protokolliert", "logged so far"))}${oStat(T("GRÖSSTE", "LARGEST"), big ? eur(big.amount) : "—", big ? esc(L(big.name)) : "")}${oStat(T("DURCHSCHNITT", "AVERAGE"), d.funding.length ? eur(Math.round(sum / d.funding.length)) : "—", T("pro Runde", "per round"))}</div>
        ${d.funding.length ? `<ul class="xa-mrows2">${d.funding.map((f) => `<li><div><span class="xa-grow"><b>${esc(L(f.name))}</b><small>${esc(L(f.source))} · ${esc(L(f.at))}</small></span><em class="is-ok">${eur(f.amount)}</em></div></li>`).join("")}</ul>` : wsEmpty("receipt", T("Noch keine Runde protokolliert", "No round logged yet"), T("Fördermittel, Preisgelder und Investments an einem Ort.", "Grants, prize money and investments in one place."))}`;
    },
    insights(s, w, st) {
      const by = (f) => st.tasks.filter(f).length;
      const weeks = [[3, 1], [4, 2], [2, 3], [5, 2], [3, 4], [4, 3], [2, 2], [3, Math.max(1, st.done - 2)]];
      const mx = Math.max(...weeks.flat());
      const donut = (parts, center, sub) => { const tot = Math.max(1, parts.reduce((n, p) => n + p[1], 0)); let off = 0; const C = 2 * Math.PI * 34; return `<div class="xa-donut"><span><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="34" class="xa-ring-bg" stroke-width="9" fill="none"/>${parts.map(([, v, col]) => { const len = (v / tot) * C; const seg = `<circle cx="42" cy="42" r="34" fill="none" stroke="${col}" stroke-width="9" stroke-dasharray="${len.toFixed(1)} ${(C - len).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 42 42)"/>`; off += len; return seg; }).join("")}</svg><b>${center}</b><small>${sub}</small></span><ul>${parts.map(([l, v, col]) => `<li><i style="background:${col}"></i><span class="xa-grow">${l}</span><b>${v}</b></li>`).join("")}</ul></div>`; };
      const stack = (rows) => `<ul class="xa-stackrows">${rows.map(([l, a, b, c, sub]) => { const t = Math.max(1, a + b + c); return `<li><span>${l}</span><span class="xa-stackbar"><i style="width:${(a / t) * 100}%;background:var(--xa-ok)"></i><i style="width:${(b / t) * 100}%;background:var(--xa-acc)"></i><i style="width:${(c / t) * 100}%;background:var(--xa-warn)"></i></span><small>${sub}</small></li>`; }).join("")}</ul>`;
      const people = [...new Set(st.tasks.map((t) => t.who))];
      const chart = (title, sub, body) => `<section class="xa-wcard xa-chart"><header><span><h4>${title}</h4><small>${sub}</small></span></header>${body}</section>`;
      return `<div class="xa-sechead"><div><h4 class="xa-modh">Insights</h4><p>${T(`Live-Zahlen aus ${st.ps.length} Projekten in diesem Workspace`, `Live numbers from ${st.ps.length} projects in this workspace`)}</p></div><div class="xa-sechead-act">${wchips("insrange", [["4", T("4 Wo.", "4 wk")], ["8", T("8 Wo.", "8 wk")], ["12", T("12 Wo.", "12 wk")], ["26", T("6 Mon.", "6 mo")]], s.insRange)}${hbtn(T("Als CSV kopieren", "Copy as CSV"), 'data-act="app-only" data-v="csv" data-k="in-csv"')}${hbtn(`${icon("sparkle")}${T("Mit KI erklären", "Explain with AI")}`, `data-act="ws-ask" data-id="${w.id}" data-v="insights" data-k="in-ai"`, "is-primary")}</div></div>
        <div class="xa-wstats xa-wstats-6">${wsStat(T("ERLEDIGT", "DONE"), st.pc + "%", T(`${st.done} von ${st.tasks.length} Aufgaben`, `${st.done} of ${st.tasks.length} tasks`), "", "ok")}${wsStat(T("OFFENE ARBEIT", "OPEN WORK"), st.open, T("Aufgaben nicht erledigt", "tasks not done"))}${wsStat(T("ÜBERFÄLLIG", "OVERDUE"), 0, T("alles im Zeitplan", "all on schedule"), "", "ok")}${wsStat(T("FÄLLIG IN 7 TAGEN", "DUE IN 7 DAYS"), by((t) => t.due && t.status !== "done"), T("stehen an", "coming up"), "", "gold")}${wsStat(T("DURCHSATZ", "THROUGHPUT"), "2,4", T("▲ 12% ggü. 4 Wo. davor", "▲ 12% vs. prior 4 wk"), "", "ok")}${wsStat(T("PROGNOSE", "FORECAST"), st.open ? T("28. Nov.", "28 Nov") : T("Frei", "Clear"), st.open ? T(`≈ ${Math.max(1, Math.round(st.open / 2.4))} Wochen beim aktuellen Tempo`, `≈ ${Math.max(1, Math.round(st.open / 2.4))} weeks at the current pace`) : T("keine offene Arbeit", "no open work"))}</div>
        <div class="xa-charts">
          ${chart(T("Wöchentlicher Durchsatz", "Weekly throughput"), T("Erstellt und abgeschlossen pro Woche", "Created and completed per week"), `<div class="xa-gbars" role="img" aria-label="${T("Balken: erstellt und abgeschlossen", "Bars: created and completed")}">${weeks.map(([a, b], i) => `<span><i style="height:${(a / mx) * 100}%"></i><i class="is-ok" style="height:${(b / mx) * 100}%"></i><small>KW${38 + i}</small></span>`).join("")}</div><p class="xa-legend"><i style="background:var(--xa-acc);opacity:.5"></i>${T("Erstellt", "Created")}<i style="background:var(--xa-ok)"></i>${T("Abgeschlossen", "Completed")}</p>`)}
          ${chart("Burn-up", T("Umfang gegen erledigte Arbeit", "Scope against completed work"), `<svg class="xa-burn" viewBox="0 0 300 120" preserveAspectRatio="none" role="img" aria-label="Burn-up"><path d="M0 70 L43 62 L86 55 L129 44 L171 40 L214 30 L257 26 L300 22 L300 120 L0 120z" fill="rgba(76,141,255,.10)"/><path d="M0 70 L43 62 L86 55 L129 44 L171 40 L214 30 L257 26 L300 22" fill="none" stroke="var(--xa-acc)" stroke-width="2" vector-effect="non-scaling-stroke"/><path d="M0 116 L43 110 L86 104 L129 92 L171 86 L214 74 L257 66 L300 ${Math.max(24, 96 - st.pc)}" fill="none" stroke="var(--xa-ok)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><p class="xa-legend"><i style="background:var(--xa-acc)"></i>Scope<i style="background:var(--xa-ok)"></i>${T("Erledigt", "Done")}</p>`)}
          ${chart("Status", T("Wo die Arbeit gerade steht", "Where the work stands"), donut([[T("Zu erledigen", "To do"), by((t) => t.status === "todo"), "var(--xa-faint)"], [T("In Arbeit", "In progress"), by((t) => t.status === "doing"), "var(--xa-acc)"], ["In Review", by((t) => t.status === "review"), "var(--xa-gold)"], [T("Erledigt", "Done"), st.done, "var(--xa-ok)"]], st.tasks.length, T("Aufgaben", "tasks")))}
          ${chart(T("Prioritäten", "Priorities"), T("Offene Aufgaben nach Priorität", "Open tasks by priority"), donut([[T("Hoch", "High"), by((t) => t.prio === "high" && t.status !== "done"), "#FF4D5E"], [T("Mittel", "Medium"), by((t) => t.prio === "mid" && t.status !== "done"), "var(--xa-mid)"], [T("Niedrig", "Low"), by((t) => t.prio === "low" && t.status !== "done"), "var(--xa-ok)"]], by((t) => t.prio === "high" && t.status !== "done"), T("hoch", "high")))}
          ${chart(T("Auslastung", "Workload"), T("Aufgaben pro Person", "Tasks per person"), stack(people.map((m) => { const mine = st.tasks.filter((t) => t.who === m); const dn = mine.filter((t) => t.status === "done").length; return [esc(PEOPLE[m].name.split(" ")[0]), dn, mine.length - dn, 0, T(`${mine.length - dn} offen`, `${mine.length - dn} open`)]; })))}
          ${chart(T("Projektzustand", "Project health"), T("Erledigt, offen und überfällig je Projekt", "Done, open and overdue per project"), stack(st.ps.map((p) => [esc(L(p.name)), p.tasks.length - openOf(p), openOf(p), 0, pct(p) + "%"])))}
        </div>`;
    },
    analytics(s, w, st) {
      const ms = s.milestones.filter((m) => st.ps.some((p) => p.id === m.project));
      const fin = st.ps.filter((p) => pct(p) === 100).length;
      return `${secHead(T("ANALYSEN", "ANALYTICS"))}
        <div class="xa-ostats">${oStat(T("Projekte", "Projects"), st.ps.length, T(`${st.ps.filter((p) => pStatus(p)[0] === "active").length} in Arbeit`, `${st.ps.filter((p) => pStatus(p)[0] === "active").length} in progress`))}${oStat(T("ABGESCHLOSSEN", "COMPLETED"), fin, T(`${st.ps.length ? Math.round((fin / st.ps.length) * 100) : 0}% der Projekte`, `${st.ps.length ? Math.round((fin / st.ps.length) * 100) : 0}% of projects`))}${oStat(T("TASK-ABSCHLUSS", "TASK COMPLETION"), st.pc + "%", "", st.pc)}${oStat(T("OFFENE TASKS", "OPEN TASKS"), st.open, T(`${st.done} erledigt`, `${st.done} done`))}${oStat(T("Meilensteine", "Milestones"), ms.length, T("über alle Projekte", "across all projects"))}${oStat(T("ÜBERFÄLLIG", "OVERDUE"), 0, T("alles im Plan", "all on track"))}${oStat(T("BEVORSTEHEND", "UPCOMING"), ms.length, T("in den nächsten 30 Tagen", "in the next 30 days"))}${oStat("Team", w.members.length, T(`${w.online} gerade online`, `${w.online} online right now`))}</div>
        <section class="xa-wcard xa-byproj"><header><h4 class="xa-seclabel">${T("NACH PROJEKT", "BY PROJECT")}</h4></header><ul class="xa-aprows">${st.ps.map((p) => `<li><button type="button" class="xa-plain" data-act="project" data-id="${p.id}" data-k="an-${p.id}"><i class="xa-dot" style="--h:${p.hue}"></i><b>${esc(L(p.name))}</b><span class="xa-progress"><i style="width:${pct(p)}%"></i></span><small>${pct(p)}%</small></button></li>`).join("")}</ul></section>`;
    },
    ai(s, w) {
      return `${secHead("XYNTAL KI", T("Kennt Projekte, Aufgaben, Notizen und Entscheidungen dieses Arbeitsbereichs", "Knows this workspace's projects, tasks, notes and decisions"))}
        <div class="xa-briefgrid">${AI_ACTIONS.map(([id, label]) => `<button type="button" data-act="ai" data-v="${id}" data-k="wa-${id}"><span class="xa-rc-ic">${icon("sparkle")}</span><span><b>${L(label)}</b><small>${T("Antwort im KI-Center", "Answer in the AI Center")}</small></span></button>`).join("")}</div>
        <form class="xa-journal-form" data-form="ai"><label class="xa-sr" for="xa-wai-${uid}">${T("Frage an Xyntal KI", "Question for Xyntal AI")}</label><input id="xa-wai-${uid}" name="q" maxlength="300" autocomplete="off" placeholder="${T("Frag etwas zu diesem Workspace – z. B. „Was blockiert den Launch?“", "Ask about this workspace – e.g. “What is blocking the launch?”")}" data-k="wai-input"><button type="submit" class="xa-hbtn is-primary">${icon("sparkle")}${T("Fragen", "Ask")}</button></form>`;
    },
    briefs(s, w) {
      const d = wsd(s, w);
      return `${secHead(T("KI-BRIEFINGS", "AI BRIEFINGS"))}
        <div class="xa-briefgrid">${BRIEF_KINDS.map(([id, label, hint, ic]) => `<button type="button" data-act="brief" data-id="${w.id}" data-v="${id}" data-k="bf-${id}"${s.briefBusy === id ? ' class="is-busy"' : ""}><span class="xa-rc-ic">${icon(ic)}</span><span><b>${L(label)}</b><small>${s.briefBusy === id ? T("Xyntal KI schreibt …", "Xyntal AI is writing …") : L(hint)}</small></span></button>`).join("")}</div>
        <form class="xa-journal-form" data-form="ai"><label class="xa-sr" for="xa-bq-${uid}">${T("Frage an Xyntal KI", "Question for Xyntal AI")}</label><input id="xa-bq-${uid}" name="q" maxlength="300" autocomplete="off" placeholder="${T("Frag etwas zu diesem Workspace – z. B. „Was blockiert den Launch?“ oder „Wer ist überlastet?“", "Ask about this workspace – e.g. “What is blocking the launch?” or “Who is overloaded?”")}" data-k="bq-input"><button type="submit" class="xa-hbtn is-primary">${icon("sparkle")}${T("Fragen", "Ask")}</button></form>
        <p class="xa-seclabel xa-sec-gap">${T("BRIEFING-VERLAUF", "BRIEFING HISTORY")}</p>
        <ul class="xa-briefs">${d.briefs.map((b) => `<li class="${s.briefOpen === b.id ? "is-open" : ""}"><button type="button" class="xa-plain" data-act="brief-open" data-id="${b.id}" data-k="bo-${b.id}" aria-expanded="${s.briefOpen === b.id}">${icon("sparkle")}<b class="xa-grow">${esc(L(b.title))}</b><small>${esc(L(b.at))}</small><span aria-hidden="true">${s.briefOpen === b.id ? "▴" : "▾"}</span></button>${s.briefOpen === b.id ? `<div class="xa-brief-body">${b.body(s, w)}</div>` : ""}</li>`).join("") || `<li class="xa-empty">${T("Noch kein Briefing – ein Klick oben genügt.", "No briefing yet – one click above is enough.")}</li>`}</ul>`;
    },
    memory(s, w) {
      const d = wsd(s, w);
      const wait = d.memory.filter((m) => m.sug).length;
      return `${secHead(T("TEAM-GEDÄCHTNIS", "TEAM MEMORY"))}
        <section class="xa-wcard"><header><span><h4>${T("Was Xyntal KI über diesen Workspace immer wissen soll", "What Xyntal AI should always know about this workspace")}</h4><small>${T("Für alle Mitglieder sichtbar. Angeheftete Einträge zählen zuerst; bis zu 8 passende Einträge fließen in jede Antwort. Nichts verlässt diesen Workspace.", "Visible to all members. Pinned entries count first; up to 8 matching entries flow into every answer. Nothing leaves this workspace.")}</small></span></header>
          <form class="xa-journal-form" data-form="memory" data-id="${w.id}"><label class="xa-sr" for="xa-mem-${uid}">${T("Neuer Eintrag", "New entry")}</label><input id="xa-mem-${uid}" name="text" maxlength="200" autocomplete="off" placeholder="${T("z. B. „Texte an Kunden siezen.“", "e.g. “Address customers formally.”")}" data-k="mem-input"><button type="submit" class="xa-hbtn is-primary">${T("Merken", "Remember")}</button></form></section>
        ${wait ? `<p class="xa-gold-line">${T(`${wait} Vorschläge aus Gesprächen warten auf Prüfung`, `${wait} suggestions from conversations await review`)}</p>` : ""}
        <ul class="xa-memory">${d.memory.map((m, i) => `<li class="${m.sug ? "is-sug" : m.pin ? "is-pin" : ""}"><span class="xa-meta"><span class="xa-spill2 is-${MEM_CAT[m.cat][2]}">${L(MEM_CAT[m.cat])}</span>${m.pin ? `<span class="xa-acc-t2">${T("Angeheftet", "Pinned")}</span>` : ""}${m.sug ? `<span class="xa-gold-t">${T("Von Xyntal KI vorgeschlagen", "Suggested by Xyntal AI")}</span>` : `<span>${T(`${m.used}× genutzt`, `used ${m.used}×`)}</span>`}<span class="xa-grow"></span>${m.sug ? `<button type="button" class="xa-hbtn is-primary is-sm" data-act="mem-ok" data-id="${w.id}" data-v="${i}" data-k="mo-${i}">${T("Bestätigen", "Confirm")}</button>` : ""}</span><p>${esc(L(m.text))}</p></li>`).join("") || `<li class="xa-empty">${T("Noch nichts gemerkt.", "Nothing remembered yet.")}</li>`}</ul>`;
    },
    activity(s, w) {
      const d = wsd(s, w);
      return `<section class="xa-wcard xa-audit"><header><span><h4 class="xa-modh">Audit-Log</h4><small>${T("Jede sicherheitsrelevante Änderung in diesem Arbeitsbereich – nur anhängen.", "Every security-relevant change in this workspace – append only.")}</small></span></header>
        <ul>${d.activity.map((a) => `<li><span class="xa-spill2 is-${a.tone || "acc"}">${esc(a.badge)}</span>${avatar(a.who, "xa-av-sm")}<b>${esc(PEOPLE[a.who].name)}</b><span class="xa-muted xa-grow">· ${esc(L(a.text))}</span><time>${esc(L(a.at))}</time></li>`).join("") || `<li class="xa-empty">${T("Noch keine Einträge.", "No entries yet.")}</li>`}</ul>
        <button type="button" class="xa-hbtn" data-act="app-only" data-v="audit" data-k="au-more">${T("Ältere Einträge laden", "Load older entries")}</button></section>`;
    },
  };

  const FIT = { aylin: [82, ["Aylin passt gut zu dir, weil ihr ähnlich kommuniziert: kurze Abstimmungen, klare Zusagen. Sie ergänzt dich im Design.", "Aylin fits you well because you communicate alike: short check-ins, clear commitments. She complements you in design."]], jonas: [77, ["Jonas arbeitet gern asynchron und gründlich. Gib ihm früh Kontext, dann liefert er verlässlich.", "Jonas likes to work asynchronously and thoroughly. Give him context early and he delivers reliably."]], noah: [94, ["Noah hat zwei Audio-Apps veröffentlicht – genau die Lücke im Loopr-Team.", "Noah has shipped two audio apps – exactly the gap in the Loopr team."]] };
  function viewMessages(s) {
    const reqs = s.convos.filter((x) => x.request);
    const list = s.chatFilter === "archived" ? [] : s.convos.filter((c) => (s.chatFilter === "requests" ? c.request : !c.request) && (s.chatFilter !== "unread" || c.unread) && (s.chatFilter !== "groups" || c.group));
    const c = s.convos.find((x) => x.id === s.convo) || s.convos[0];
    const members = c.group ? c.members : ["LV", c.with];
    const together = c.group ? s.projects.filter((p) => p.ws === (c.id === "team" ? "loopr" : "kiez")) : s.projects.filter((p) => p.tasks.some((t) => t.who === c.with));
    const files = s.files.filter((f) => members.includes(f.owner) && f.owner !== "LV" || (c.group && f.ws === (c.id === "team" ? "Loopr Studio" : "Kiezkiste"))).slice(0, 3);
    const last = (x) => x.msgs[x.msgs.length - 1];
    const snippet = (m) => m.kind === "call" ? `📞 ${T("Anruf", "Call")}` : m.kind === "meet" ? `📞 ${T("Anrufvorschlag", "Call proposal")}` : esc(L(m.text));
    const nUnread = s.convos.filter((x) => x.unread && !x.request).length;
    const tabs = [["all", T("Alle", "All")], ["unread", nUnread ? T(`Ungelesen · ${nUnread}`, `Unread · ${nUnread}`) : T("Ungelesen", "Unread")], ["groups", T("Gruppen", "Groups")]];
    const hb = (ic, label, v = "tab") => `<button type="button" class="xa-iconbtn" data-act="app-only" data-v="${v}" data-k="ch-${ic}" aria-label="${label}" title="${label}">${icon(ic)}</button>`;
    const fit = !c.group && FIT[c.id];
    const msg = (m) => {
      if (m.kind === "call") return `<li class="xa-m xa-m-card${m.from === "LV" ? " is-me" : ""}"><div class="xa-callcard">${icon("phone")}<span><b>${T("Anruf beendet", "Call ended")}</b><small>${T(`Dauerte ${m.dur}`, `Lasted ${m.dur}`)}</small><small>${T(`Mit ${PEOPLE[c.with] ? PEOPLE[c.with].name.split(" ")[0] : c.name}`, `With ${PEOPLE[c.with] ? PEOPLE[c.with].name.split(" ")[0] : c.name}`)}</small></span></div></li>`;
      if (m.kind === "meet") return `<li class="xa-m xa-m-card${m.from === "LV" ? " is-me" : ""}"><div class="xa-callcard xa-meet"><span class="xa-meet-ic">${icon("calendar")}</span><span class="xa-grow"><b>${T("Anruf gebucht", "Call booked")}</b><small>${esc(L(m.when))}</small></span><div class="xa-meet-foot"><button type="button" class="xa-hbtn" data-act="app-only" data-v="call" data-k="meet-join" title="${T("Öffnet zehn Minuten vor Beginn", "Opens ten minutes before the start")}">${T("Anruf beitreten", "Join call")}</button><button type="button" class="xa-ghost" data-act="go" data-area="calendar" data-k="meet-cal">${T("In beiden Kalendern", "In both calendars")}</button></div></div></li>`;
      return m.from === "LV" ? `<li class="xa-m is-me"><div class="xa-bubble"><p${m.mine ? " data-own" : ""}>${esc(L(m.text))}</p><small>${esc(L(m.at))}</small></div></li>`
        : `<li class="xa-m">${avatar(m.from, "xa-av-sm")}<div class="xa-bubble"><span class="xa-m-head"><b>${esc(PEOPLE[m.from].name)}</b><small>${esc(L(m.at))}</small></span><p>${esc(L(m.text))}</p></div></li>`;
    };
    return `<div class="xa-msg">
      <div class="xa-msg-list">
        <h3 class="xa-title" tabindex="-1" data-k="title">${T("Nachrichten", "Messages")}</h3><p class="xa-sub">${T("Direktnachrichten und Team-Chats", "Direct messages and team chats")}</p>
        <div class="xa-msg-tabs" role="group" aria-label="${T("Gespräche filtern", "Filter conversations")}">${tabs.map(([id, l]) => `<button type="button" data-act="chatfilter" data-v="${id}" data-k="chatfilter-${id}" aria-pressed="${s.chatFilter === id}">${l}</button>`).join("")}<button type="button" data-act="chatmore" data-k="chatmore" aria-expanded="${s.chatMore}" aria-pressed="${["requests", "archived"].includes(s.chatFilter)}">${T("Mehr", "More")} ▾</button></div>
        ${s.chatMore ? `<div class="xa-msg-more"><button type="button" data-act="chatfilter" data-v="requests" data-k="chatfilter-requests" aria-pressed="${s.chatFilter === "requests"}">${T("Anfragen", "Requests")}${reqs.length ? ` · ${reqs.length}` : ""}</button><button type="button" data-act="chatfilter" data-v="archived" data-k="chatfilter-archived" aria-pressed="${s.chatFilter === "archived"}">${T("Archiviert (0)", "Archived (0)")}</button></div>` : ""}
        <div class="xa-msg-search"><span class="xa-fakeinput xa-grow">${T("Gespräche suchen", "Search conversations")}</span><button type="button" class="xa-iconbtn xa-sqbtn" data-act="app-only" data-v="group" data-k="m-group" aria-label="${T("Neue Gruppe", "New group")}" title="${T("Neue Gruppe", "New group")}">${icon("users")}</button><button type="button" class="xa-iconbtn xa-sqbtn is-acc" data-act="app-only" data-v="newmsg" data-k="m-new" aria-label="${T("Neue Nachricht", "New message")}" title="${T("Neue Nachricht", "New message")}">${icon("edit")}</button></div>
        <ul class="xa-convos">${list.map((x) => `<li><button type="button" class="xa-convo${x.unread ? " is-unread" : ""}" data-act="convo" data-id="${x.id}" data-k="cv-${x.id}" aria-current="${x.id === c.id}">
          ${x.group ? `<span class="xa-av xa-av-group" aria-hidden="true">${esc(x.name[0])}</span>` : `<span class="xa-av-wrap">${avatar(x.with)}<i class="${["AK", "JW"].includes(x.with) ? "is-on" : ""}"></i></span>`}
          <span class="xa-grow"><b>${esc(x.name)}</b><small>${snippet(last(x))}</small></span>
          <span class="xa-convo-r"><small>${esc(L(last(x).at))}</small>${x.unread ? `<span class="xa-count" aria-label="${T(`${x.unread} ungelesen`, `${x.unread} unread`)}">${x.unread}</span>` : ""}</span>
        </button></li>`).join("") || `<li class="xa-empty">${s.chatFilter === "archived" ? T("Nichts archiviert.", "Nothing archived.") : T("Keine Gespräche in diesem Filter.", "No conversations in this filter.")}</li>`}</ul>
      </div>
      <div class="xa-chat" role="region" aria-label="${T(`Gespräch: ${c.name}`, `Conversation: ${c.name}`)}">
        <header class="xa-chat-head">${c.group ? `<span class="xa-av xa-av-group" aria-hidden="true">${esc(c.name[0])}</span>` : avatar(c.with)}<div class="xa-grow"><b>${esc(c.name)}</b><small>${c.group ? T(`${c.members.length} Mitglieder`, `${c.members.length} members`) : c.request ? T("Direktnachricht", "Direct message") : `<span class="xa-on-t">Online</span>`}</small></div>
          <button type="button" class="xa-hbtn xa-hbtn-ai" data-act="ask-chat" data-k="chat-ask" title="${T("KI zu diesem Gespräch fragen", "Ask AI about this conversation")}">${AI_MARK}${T("Xyntal fragen", "Ask Xyntal")}</button>
          ${hb("phone", T("Sprachanruf starten", "Start voice call"), "call")}${hb("video", T("Videoanruf starten", "Start video call"), "call")}${hb("search", T("Im Gespräch suchen", "Search in conversation"))}${hb("bell", T("Benachrichtigungen an", "Notifications on"))}${hb("shield", T("Privatsphäre — wer dieses Gespräch lesen darf", "Privacy — who may read this conversation"))}${hb("more", T("Weitere Aktionen", "More actions"))}</header>
        ${fit && !s.fitHidden ? `<div class="xa-fitbar">${ring(fit[0], 40, 4)}<span class="xa-grow"><b>${T("Einblick zur Zusammenarbeit", "Collaboration insight")}</b><small>${esc(L(fit[1]))}</small></span><button type="button" class="xa-acc-link" data-act="app-only" data-v="profile-other" data-k="fit-profile">${T("Profil ansehen", "View profile")} →</button><button type="button" class="xa-iconbtn" data-act="fit-hide" data-k="fit-x" aria-label="${T("Einblick ausblenden", "Hide insight")}">${icon("x")}</button></div>` : ""}
        <ol class="xa-thread" data-scroll="thread">${c.msgs.map(msg).join("")}
          ${s.typing === c.id ? `<li class="xa-m xa-typing">${avatar(c.reply.from, "xa-av-sm")}<div class="xa-bubble"><span class="xa-dots" aria-label="${T("schreibt …", "typing …")}"><i></i><i></i><i></i></span></div></li>` : ""}</ol>
        ${c.request ? `<div class="xa-request"><p>${T(`${esc(c.name)} möchte dir schreiben. Wenn du annimmst, landet das Gespräch bei deinen Nachrichten.`, `${esc(c.name)} wants to message you. Accept to move the conversation to your messages.`)}</p><div class="xa-row"><button type="button" class="xa-btn xa-primary" data-act="req-accept" data-k="req-ok">${icon("check")}${T("Annehmen", "Accept")}</button><button type="button" class="xa-btn" data-act="req-decline" data-k="req-no">${T("Ablehnen", "Decline")}</button></div></div>` : `<form class="xa-composer" data-form="chat"><span class="xa-comp-ic" aria-hidden="true">${icon("plus")}${icon("smile")}<b>GIF</b></span><label class="xa-sr" for="xa-chat-${uid}">${T(`Nachricht an ${c.name}`, `Message to ${c.name}`)}</label><input id="xa-chat-${uid}" name="text" maxlength="400" autocomplete="off" placeholder="${T("Nachricht …", "Message …")}" data-k="chat-input"><span class="xa-comp-ic" aria-hidden="true">${icon("mic")}</span><button type="submit" class="xa-iconbtn xa-send" aria-label="${T("Senden", "Send")}">${icon("arrowR", "xa-up")}</button></form>`}
      </div>
      <aside class="xa-msg-info" aria-label="${T("Details zum Gespräch", "Conversation details")}">
        ${c.group ? `<span class="xa-av xa-av-xl xa-av-group" aria-hidden="true">${esc(c.name[0])}</span>` : avatar(c.with, "xa-av-xl")}
        <b>${esc(c.name)}</b><small class="xa-muted">${c.group ? T(`Gruppe · ${c.members.length} Mitglieder`, `Group · ${c.members.length} members`) : `${esc(L(PEOPLE[c.with].role))} · ${T("sucht ein Team für eine Idee", "looking for a team for an idea")}`}</small>${c.group ? "" : `<small class="xa-on-t"><i></i>Online</small>`}
        ${c.group ? `<h4 class="xa-kicker xa-mt">${T("Mitglieder", "Members")} · ${members.length}<button type="button" class="xa-acc-link" data-act="app-only" data-v="group" data-k="mi-manage">${T("Verwalten", "Manage")}</button></h4><ul class="xa-people">${members.map((m, i) => `<li>${avatar(m, "xa-av-sm")}<span class="xa-grow">${esc(PEOPLE[m].name)}${m === "LV" ? T(" (du)", " (you)") : ""}</span>${i === 0 ? `<span class="xa-mtag">${T("Inhaber", "Owner")}</span>` : ""}</li>`).join("")}</ul>`
          : `<h4 class="xa-kicker xa-mt">${T("Über", "About")}</h4><p class="xa-mi-bio">${esc(L(MBIO[c.with] || MBIO._))}</p>
        <h4 class="xa-kicker xa-mt">${T("Gemeinsame Kontakte", "Mutuals")}</h4><p class="xa-mi-bio xa-muted">${c.request ? T("Noch keine gemeinsamen Verbindungen", "No mutual connections yet") : T("2 gemeinsame Verbindungen · 1 gemeinsamer Arbeitsbereich · 1 gemeinsame Community", "2 mutual connections · 1 shared workspace · 1 shared community")}</p>`}
        <h4 class="xa-kicker xa-mt">${T("Letzte Dateien", "Recent files")}</h4>
        <ul class="xa-people xa-mi-files">${files.map((f) => `<li><button type="button" class="xa-plain xa-grow" data-act="file" data-id="${f.id}" data-k="mf-${f.id}">${icon(f.type === "doc" ? "file" : f.type)}${esc(f.name)}</button></li>`).join("") || `<li class="xa-muted">${T("Noch keine.", "None yet.")}</li>`}</ul>
        <h4 class="xa-kicker xa-mt">${T("Gemeinsame Projekte", "Projects together")}</h4>
        <ul class="xa-people">${together.map((p) => `<li><span class="xa-dot" style="--h:${p.hue}"></span><button type="button" class="xa-plain xa-grow" data-act="project" data-id="${p.id}" data-k="mp-${p.id}">${esc(L(p.name))}</button></li>`).join("") || `<li class="xa-muted">${T("Noch keine.", "None yet.")}</li>`}</ul>
      </aside>
    </div>`;
  }
  const MBIO = { AK: ["Ich gestalte Apps, die man ohne Anleitung versteht. Gerade: Onboarding für Loopr.", "I design apps you understand without a manual. Right now: onboarding for Loopr."], JW: ["Backend, APIs und alles, was nachts nicht ausfallen darf.", "Backend, APIs and everything that must not fail at night."], NB: ["iOS-Entwickler mit zwei veröffentlichten Audio-Apps. Suche ein Nebenprojekt mit Musik.", "iOS developer with two shipped audio apps. Looking for a music side project."], _: ["Builder auf Xyntal.", "Builder on Xyntal."] };

  // Entdecken wie in der App: Personen als Xyntal-Karte mit Passung, andere Bereiche als Karten mit Ring
  const OTHER_PROJECTS = [
    { id: "op1", lead: "Finn", tags: ["Audio", "Python", "Produkt"], why: ["Du hast Audio-Erfahrung, die hier fehlt.", "You have the audio experience that is missing here."], name: ["Podcast-Schnitt mit KI", "AI podcast editing"], by: "Synth Lab", role: ["Sucht: Audio-Entwickler·in", "Looking for: audio developer"], score: 87, hue: "#8B6CFF" },
    { id: "op2", lead: "Tim", tags: ["Design", "React Native"], why: ["Ihr arbeitet schon in einem gemeinsamen Arbeitsbereich.", "You already share a workspace."], name: ["Lernkarten-App für Azubis", "Flashcard app for apprentices"], by: "Kiezkiste", role: ["Sucht: Product Design", "Looking for: product design"], score: 81, hue: "#3FE0F0" },
    { id: "op3", lead: "Sophie", tags: ["Produkt", "Musik"], why: ["Musik und Produkt – beides steht in deinem Profil.", "Music and product – both are on your profile."], name: ["Bandprobe-Planer", "Band rehearsal planner"], by: "Founder-Zirkel", role: ["Sucht: Mitgründer·in", "Looking for: co-founder"], score: 76, hue: "#D9A54E" },
  ];
  // Personenkarten in Entdecken sehen aus wie die Xyntal-Karte: Banner, Abzeichen, Bild, Passung, Kurztext
  const BCARD = {
    noah: { hue: ["#3A8AFF", "#7B5BFF"], badges: [["Früher Zugang", "Early access"], ["Beta-Tester", "Beta tester"]], focus: ["Entwicklung", "Engineering"], lvl: ["Fortgeschritten", "Advanced"], n: 2, bio: ["Ich baue iOS-Apps mit Audio und suche ein Nebenprojekt mit Musik.", "I build iOS apps with audio and want a music side project."], seek: ["ein Projekt zum Mitbauen", "a project to help build"] },
    emre: { hue: ["#45C99B", "#3FE0F0"], badges: [["Beta-Tester", "Beta tester"]], focus: ["Entwicklung", "Engineering"], lvl: ["Profi", "Expert"], n: 3, bio: ["Ich forsche an Melodie-Erkennung und will sie in ein echtes Produkt bringen.", "I research melody detection and want to ship it in a real product."], seek: ["Mitgründer:in", "a co-founder"] },
    lea: { hue: ["#B36BFF", "#FF7AB8"], badges: [["Früher Zugang", "Early access"]], focus: ["Design", "Design"], lvl: ["Profi", "Expert"], n: 3, bio: ["Ich baue Design-Systeme und mag frühe Produkte, bei denen noch alles offen ist.", "I build design systems and like early products where everything is still open."], seek: ["ein Team für frühe Produkte", "a team for early products"] },
    mia: { hue: ["#E05E6D", "#D9A54E"], badges: [["Beta-Tester", "Beta tester"]], focus: ["Musik", "Music"], lvl: ["Fortgeschritten", "Advanced"], n: 2, bio: ["Ich produziere für Indie-Künstler und höre sofort, ob ein Song trägt.", "I produce for indie artists and hear at once whether a song works."], seek: ["ein Projekt zum Mitbauen", "a project to help build"] },
    clara: { hue: ["#D9A54E", "#FF6A3D"], badges: [["Früher Zugang", "Early access"]], focus: ["Wachstum", "Growth"], lvl: ["Fortgeschritten", "Advanced"], n: 2, bio: ["Ich habe eine Musik-Community mit 12.000 Mitgliedern aufgebaut.", "I grew a music community to 12,000 members."], seek: ["ein Team für meine Idee", "a team for my idea"] },
    paul: { hue: ["#8A8EA4", "#4C8DFF"], badges: [["Beta-Tester", "Beta tester"]], focus: ["Entwicklung", "Engineering"], lvl: ["Einsteiger", "Beginner"], n: 1, bio: ["Ich baue APIs in Go und habe gerade viel Zeit für ein neues Projekt.", "I build APIs in Go and have lots of time for a new project right now."], seek: ["ein Projekt zum Mitbauen", "a project to help build"] },
  };
  const COMM_SCORE = { indie: 84, audio: 93, design: 79, ai: 88, nocode: 64 };
  function viewDiscover(s) {
    const scopes = [["people", T("Personen", "People")], ["projects", T("Projekte", "Projects")], ["workspaces", T("Arbeitsbereiche", "Workspaces")], ["communities", "Communities"], ["openings", T("Ausschreibungen", "Openings")]];
    const b = s.builders.find((x) => x.id === s.builder);
    const fl = [T("Skills ergänzen sich", "Complementary skills"), T("Zeitbudget", "Time budget"), T("Gemeinsame Ziele", "Shared goals"), T("Arbeitsstil", "Working style"), T("Standort & Zeitzone", "Location & time zone")];
    const connectBtn = (x, k, cls = "") => `<button type="button" class="xa-btn ${s.connected[x.id] ? "is-sent" : "xa-primary"} ${cls}" data-act="connect" data-id="${x.id}" data-k="${k}" aria-pressed="${!!s.connected[x.id]}">${s.connected[x.id] ? icon("check") + T("Anfrage gesendet", "Request sent") : T("Vernetzen", "Connect")}</button>`;
    const entity = (id, hue, letter, title, kind, sub, desc, why, tags, score, action) => `<li class="xa-ent"><span class="xa-letter" style="--h:${hue}" aria-hidden="true">${letter}</span><div class="xa-grow"><h4>${title}<span class="xa-mtag">${kind}</span></h4><small class="xa-muted">${sub}</small><p>${desc}</p><p class="xa-ent-why">✨ ${why}</p><p class="xa-ws-tags">${tags.map((t) => `<span class="xa-tag">${esc(L(t))}</span>`).join("")}</p></div><div class="xa-ent-r"><span class="xa-fit">${ring(score, 44, 4, false)}<b class="is-${band(score)[1]}">${score}%</b><small class="is-${band(score)[1]}">${band(score)[0]}</small></span>${action}</div></li>`;
    const entHead = (t, n) => `<p class="xa-disc-count">${t} <span>${n}</span></p>`;
    const dabei = (act, id, k, on, onLabel) => `<button type="button" class="xa-hbtn is-primary${on ? " is-sent" : ""}" data-act="${act}" data-id="${id}" data-k="${k}" aria-pressed="${!!on}">${on ? onLabel : T("Ich wäre dabei", "I'd be in")}</button>`;
    let body;
    if (s.discScope === "people") {
      const list = s.builders.filter((x) => !s.matchHidden[x.id]).sort((p, q) => (s.discSort === "new" ? 0 : q.score - p.score));
      body = `<p class="xa-disc-count">${T("Personen", "People")} <span>${list.length}</span></p>
        <ul class="xa-pcgrid">${list.map((x) => { const c = BCARD[x.id]; return `<li class="xa-pc${b && x.id === b.id ? " is-sel" : ""}" style="--h:${c.hue[0]};--h2:${c.hue[1]}">
          <div class="xa-pc-banner"><span class="xa-pc-badges">${c.badges.map((t, i) => `<span class="${i ? "" : "is-first"}">${L(t)}</span>`).join("")}</span></div>
          <button type="button" class="xa-plain xa-pc-open" data-act="builder" data-id="${x.id}" data-k="bw-${x.id}" aria-pressed="${!!(b && x.id === b.id)}"><span class="xa-pc-av" aria-hidden="true">${esc(x.name[0])}</span><b>${esc(x.name.split(" ")[0])}</b></button>
          <small class="xa-pc-role">${esc(L(c.focus))} · ${esc(L(c.lvl))}</small>
          <span class="xa-pc-match">${x.score >= 89 ? `<i>+ ${T("Für dich empfohlen", "Recommended for you")}</i>` : ""}${T(`${x.score} % Passung`, `${x.score}% match`)}</span>
          <small class="xa-pc-loc">${icon("mappin")}${esc(x.city)} · ${x.kind === "growth" ? T("Hybrid", "Hybrid") : "Remote"}</small>
          <p class="xa-pc-bio">${esc(L(c.bio))}</p>
          <div class="xa-pc-facts"><span><small>${T("Zeit", "Time")}</small><b>${T(`${x.hours} Std./Woche`, `${x.hours} h/week`)}</b><i style="--v:${Math.min(100, x.hours * 5)}%"></i></span><span><small>${T("Erfahrung", "Experience")}</small><b>${esc(L(c.lvl))}</b><i class="xa-pc-seg" data-n="${c.n}"><u></u><u></u><u></u></i></span></div>
          <span class="xa-pc-seek">${T("Sucht", "Looking for")} <b>${esc(L(c.seek))}</b></span>
          <small class="xa-pc-note">${T("Gemeinsame Sprache: Deutsch, Englisch · Gleiche Zeitzone", "Shared language: German, English · Same time zone")}</small>
          <div class="xa-pc-act"><button type="button" class="xa-pc-yes${s.connected[x.id] ? " is-sent" : ""}" data-act="connect" data-id="${x.id}" data-k="bc-${x.id}" aria-pressed="${!!s.connected[x.id]}">${s.connected[x.id] ? icon("check") + T("Du bist dabei", "You're in") : T("Ich wäre dabei", "I'd be in")}</button><button type="button" class="xa-pc-no" data-act="match-hide" data-id="${x.id}" data-k="bn-${x.id}">${T("Nicht relevant", "Not relevant")}</button></div>
          <small class="xa-pc-url">xyntal.de/${x.id}</small>
        </li>`; }).join("") || `<li class="xa-empty">${T("Gerade keine weiteren Vorschläge.", "No more suggestions right now.")}</li>`}</ul>`;
    } else if (s.discScope === "projects") {
      body = `${entHead(T("Projekte, die zu dir passen", "Projects that fit you"), OTHER_PROJECTS.length)}<ul class="xa-ents">${OTHER_PROJECTS.map((p) => entity(p.id, p.hue, L(p.name)[0], esc(L(p.name)), T("Im Aufbau", "Building"), T(`in ${p.by} · geleitet von ${p.lead}`, `in ${p.by} · led by ${p.lead}`), esc(L(p.role)), esc(L(p.why)), p.tags, p.score, `${dabei("disc-req", p.id, `dp-${p.id}`, s.requested[p.id], T("Angefragt", "Requested"))}<button type="button" class="xa-ghost" data-act="app-only" data-v="contact" data-k="dpc-${p.id}">${T("Inhaber kontaktieren", "Contact owner")}</button>`)).join("")}</ul>`;
    } else if (s.discScope === "workspaces") {
      body = `${entHead(T("Arbeitsbereiche, die zu dir passen", "Workspaces that fit you"), s.openWs.length)}<ul class="xa-ents">${s.openWs.map((w) => entity(w.id, w.hue, w.code[0], esc(w.name), w.mode === "join" ? T("Offen", "Open") : T("Auf Anfrage", "On request"), T(`${w.members} Mitglieder`, `${w.members} members`), esc(L(w.desc)), T("Deine Skills in Audio und Produkt werden hier gesucht.", "Your skills in audio and product are wanted here."), w.id === "synth" ? ["Audio", "DSP", "Open Source"] : ["Karten", "Mobilität"], w.score, `${dabei("ws-join", w.id, `dw-${w.id}`, s.requested[w.id], w.mode === "join" ? T("Beigetreten", "Joined") : T("Angefragt", "Requested"))}<button type="button" class="xa-ghost" data-act="app-only" data-v="contact" data-k="dwc-${w.id}">${T("Inhaber kontaktieren", "Contact owner")}</button>`)).join("")}</ul>`;
    } else if (s.discScope === "openings") {
      const ops = OPENINGS.filter((o) => !o.project);
      body = `${entHead(T("Ausschreibungen, die zu dir passen", "Openings that fit you"), ops.length)}<p class="xa-muted xa-disc-intro">${T("Abgeglichen mit deinen Skills, deiner Zeit und dem, was du suchst.", "Matched against your skills, your time and what you are looking for.")}</p><ul class="xa-openings xa-openings-2">${ops.map(openingCard(s, false)).join("")}</ul><p class="xa-muted xa-disc-intro">${T("4 weitere offene Ausschreibungen passen gerade nicht zu deinem Profil", "4 more open openings don't fit your profile right now")} · <button type="button" class="xa-acc-link" data-act="app-only" data-v="profile" data-k="op-prof">${T("Profil ergänzen", "Complete profile")}</button></p>`;
    } else {
      const cs = s.communities.filter((c) => !c.joined);
      body = `${entHead(T("Communities, die zu dir passen", "Communities that fit you"), cs.length)}<ul class="xa-ents">${cs.map((c) => entity(c.id, c.hue, c.letter, esc(L(c.name)), esc(L(c.tags[0])), T(`${c.members.toLocaleString("de-DE")} Mitglieder`, `${c.members.toLocaleString("en-GB")} members`), esc(L(c.desc)), T("Passt zu deinen Interessen an Musik und KI.", "Fits your interests in music and AI."), c.tags, COMM_SCORE[c.id], `${dabei("join", c.id, `dc-${c.id}`, false, "")}<small class="xa-faint">${c.priv ? T("auf Anfrage", "on request") : T("offen", "open")}</small>`)).join("") || `<li class="xa-empty">${T("Du bist schon überall dabei.", "You've joined them all.")}</li>`}</ul>`;
    }
    const aside = b && s.discScope === "people"
      ? `<aside class="xa-card xa-explain" aria-label="${T(`Profil von ${b.name}`, `${b.name}'s profile`)}" data-explain>
        <div class="xa-b-top"><span class="xa-av xa-av-lg" style="--h:${KIND_HUE[b.kind]}" aria-hidden="true">${esc(initials(b.name))}</span><div class="xa-grow"><h4>${esc(b.name)}</h4><small class="xa-muted">${esc(L(b.role))} · ${esc(b.city)} · ${T(`${b.hours} Std./Woche`, `${b.hours} h/week`)}</small></div><button type="button" class="xa-iconbtn" data-act="builder-close" data-k="ex-close" aria-label="${T("Profil schließen", "Close profile")}">${icon("x")}</button></div>
        <div class="xa-b-top">${ring(b.score, 56, 5)}<div class="xa-grow"><b>${T("Eure Passung", "Your fit")}</b><small class="xa-muted">${T("Aus zehn Bereichen berechnet – so wie auf xyntal.de/matching erklärt.", "Calculated from ten areas – as explained on xyntal.de/matching.")}</small></div></div>
        <ul class="xa-factors">${b.f.map((v, i) => `<li><span>${fl[i]}</span><span class="xa-mono">${v}</span><div class="xa-progress"><i style="width:${v}%"></i></div></li>`).join("")}</ul>
        <div class="xa-ai-sum"><span class="xa-kicker">${icon("sparkle")} ${T("Warum es passt", "Why it fits")}</span><p>${esc(L(b.sum))}</p></div>
        <p class="xa-small"><b>${T("Nächster Schritt:", "Next step:")}</b> ${esc(L(b.next))}</p>
        <p class="xa-small xa-warn-t"><b>${T("Gut zu wissen:", "Worth knowing:")}</b> ${esc(L(b.risk))}</p>
        ${connectBtn(b, "ex-connect", "xa-full")}
        <p class="xa-small xa-muted">${T("Ein Match entsteht erst, wenn beide Ja sagen.", "A match only happens when you both say yes.")}</p>
      </aside>`
      : `<aside class="xa-col xa-aside xa-disc-rail">
        <div class="xa-rcard"><h4><span class="xa-rc-ic">${icon("zap")}</span>${T("Gefragte Skills", "Skills in demand")}</h4><p class="xa-ws-tags">${["Swift", "Audio-ML", "Figma", "Growth", "Rust", "Supabase"].map((t) => `<span class="xa-tag">${t}</span>`).join("")}</p>${hbtn(T("Profil vervollständigen", "Complete profile"), 'data-act="app-only" data-v="profile" data-k="dr-profile"')}</div>
        <div class="xa-rcard"><h4><span class="xa-rc-ic">${icon("compass")}</span>${T("Beliebte Kategorien", "Popular categories")}</h4><ul class="xa-people">${[[T("KI-Produkte", "AI products"), 128], [T("Musik & Audio", "Music & audio"), 46], ["Climate Tech", 39], ["Creator Tools", 31]].map(([n, c]) => `<li><span class="xa-grow">${n}</span><span class="xa-mono">${c}</span></li>`).join("")}</ul>${hbtn(T("Communities durchsuchen", "Browse communities"), 'data-act="go" data-area="communities" data-k="dr-comm"')}</div>
        <div class="xa-rcard"><h4><span class="xa-rc-ic">${icon("calendar")}</span>${T("Kommende Events", "Upcoming events")}</h4><ul class="xa-events">${s.events.map((e) => `<li><span class="xa-grow"><b>${esc(L(e.title))}</b><small>${esc(L(e.when))}</small></span><button type="button" class="xa-mini ${e.going ? "is-on" : ""}" data-act="rsvp" data-id="${e.id}" data-k="drsvp-${e.id}" aria-pressed="${e.going}">${e.going ? T("Zugesagt", "Going") : T("Zusagen", "Attend")}</button></li>`).join("")}</ul></div>
      </aside>`;
    return `<div class="xa-split">
      <div class="xa-split-main">
        ${pageHead(T("Finde deine Leute.", "Find your people."), T("Entdecke Builder, Projekte, Arbeitsbereiche und Communities — für dich gerankt.", "Discover builders, projects, workspaces and communities — ranked for you."))}
        <div class="xa-disc-search" aria-hidden="true">${icon("search")}<span>${T("Builder, Skills, Projekte, Arbeitsbereiche oder Interessen suchen …", "Search builders, skills, projects, workspaces or interests …")}</span><span class="xa-keys"><kbd>Ctrl</kbd><kbd>K</kbd></span></div>
        <div class="xa-disc-bar"><div class="xa-seg xa-scopes" role="group" aria-label="${T("Bereich", "Scope")}">${scopes.map(([id, label]) => `<button type="button" data-act="discscope" data-v="${id}" data-k="ds-${id}" aria-pressed="${s.discScope === id}">${label}</button>`).join("")}</div><span class="xa-grow"></span>
          <button type="button" class="xa-select" data-act="discsort" data-k="discsort">${s.discSort === "new" ? T("Neueste", "Newest") : T("Beste Passung", "Best match")}<i aria-hidden="true"></i></button><button type="button" class="xa-hbtn" data-act="app-only" data-v="filter" data-k="discfilter">Filter</button></div>
        ${body}
      </div>
      ${aside}
    </div>`;
  }

  // Communities im Design 2026-11: Übersicht mit 72-px-Titel, Detailseite redaktionell ohne Karten
  const CHANNELS = { indie: [["allgemein", ""], ["show-and-tell", ""], ["ankündigungen", ["Nur Moderatoren", "Moderators only"]]], design: [["allgemein", ""], ["reviews", ""], ["jobs", ["Nur lesen", "Read only"]]] };
  const POSTS = { "indie/allgemein": [{ at: "09:12", by: "Jonas Weber", text: ["Wir haben gestern 120 € MRR geknackt. Kleiner Schritt, aber der erste zahlende Kunde kam über die Warteliste.", "We passed €120 MRR yesterday. Small step, but the first paying customer came through the waitlist."] }, { at: "Gestern", by: "Xyntal-Team", team: true, text: ["Freitag 18 Uhr: Show & Tell. Fünf Minuten pro Projekt, danach Feedback.", "Friday 6 pm: show & tell. Five minutes per project, then feedback."] }], "design/allgemein": [{ at: "10:40", by: "Aylin Kaya", text: ["Kennt jemand gute Beispiele für Onboarding mit Mikrofon-Zugriff?", "Anyone know good examples of onboarding with microphone access?"] }] };
  function viewCommunities(s) {
    if (s.route.id) return viewCommunity(s, s.route.id);
    const q = (s.commQuery || "").trim().toLowerCase();
    const match = (c) => !q || L(c.name).toLowerCase().includes(q) || c.tags.some((t) => L(t).toLowerCase().includes(q));
    const by = { all: () => true, joined: (c) => c.joined, rec: (c) => c.rec, new: (c) => c.fresh, private: (c) => c.priv };
    const list = s.communities.filter((c) => by[s.commFilter](c) && match(c));
    const pinned = s.communities.find((c) => c.id === "indie");
    const filters = [["all", T("Alle", "All")], ["joined", T("Beigetreten", "Joined")], ["rec", T("Empfohlen", "Recommended")], ["new", T("Neu", "New")], ["private", T("Privat", "Private")]];
    const ccard = (c) => `<li class="xa-ccard"><button type="button" class="xa-plain" data-act="comm" data-id="${c.id}" data-k="co-${c.id}"><span class="xa-ccard-top"><span class="xa-letter">${c.letter}</span><span class="xa-score">${ring(COMM_SCORE[c.id], 36, 3)}</span></span><b>${esc(L(c.name))}</b><small>${T(`${(c.members + (c.joined ? 1 : 0)).toLocaleString("de-DE")} Mitglieder`, `${(c.members + (c.joined ? 1 : 0)).toLocaleString("en-GB")} members`)}${c.priv ? ` · ${T("Privat", "Private")}` : ""}</small><span class="xa-cdesc">${esc(L(c.desc))}</span></button>
      <button type="button" class="xa-btn xa-full ${c.joined ? "is-sent" : "xa-primary"}" data-act="join" data-id="${c.id}" data-k="cj-${c.id}" aria-pressed="${c.joined}">${c.joined ? icon("check") + T("Beigetreten", "Joined") : c.priv ? T("Beitritt anfragen", "Request to join") : T("Beitreten", "Join")}</button></li>`;
    return `<div class="xa-split">
      <div class="xa-split-main">
        <header class="xa-cbrowse-head"><div><h3 class="xa-hero72" tabindex="-1" data-k="title">${T("Baue mit den richtigen Communities.", "Build with the right communities.")}</h3><p class="xa-muted">${T("Entdecke Räume zu deinen Interessen und wachse mit anderen Buildern.", "Discover spaces for your interests and grow with other builders.")}</p></div>${sqBtn(`+ ${T("Community erstellen", "Create community")}`, 'data-act="app-only" data-v="community" data-k="c-new"')}</header>
        <div class="xa-toolbar"><div class="xa-pgroup xa-pgroup-lg" role="group" aria-label="${T("Communities filtern", "Filter communities")}">${filters.map(([id, l]) => `<button type="button" data-act="commfilter" data-v="${id}" data-k="commfilter-${id}" aria-pressed="${s.commFilter === id}">${l} <span class="xa-mono">${s.communities.filter(by[id]).length}</span></button>`).join("")}</div>
          <label class="xa-sr" for="xa-cq-${uid}">${T("Community oder Thema suchen", "Search community or topic")}</label><input id="xa-cq-${uid}" class="xa-input" type="search" data-input="commquery" data-k="cq" value="${esc(s.commQuery || "")}" placeholder="${T("Community oder Thema suchen", "Search community or topic")}" autocomplete="off"></div>
        <p class="xa-pinned-l"><i></i>${T("OFFIZIELL · ANGEPINNT", "OFFICIAL · PINNED")}</p>
        <ul class="xa-cgrid xa-cgrid-1">${ccard(pinned)}</ul>
        <ul class="xa-cgrid">${list.filter((c) => c !== pinned).map(ccard).join("")}<li class="xa-ccard xa-cnew"><button type="button" class="xa-plain" data-act="app-only" data-v="community" data-k="c-new2">${icon("plus")}<b>${T("Eigene Community gründen", "Start your own community")}</b></button></li></ul>
      </div>
      <aside class="xa-col xa-aside">
        <div class="xa-w"><h4 class="xa-mono">${T("TREND-THEMEN", "TRENDING TOPICS")}</h4><p class="xa-ws-tags">${["#closedbeta", "#audioml", "#pitchdeck", "#nocode", "#figma"].map((t) => `<span class="xa-tag">${t}</span>`).join("")}</p></div>
        <div class="xa-w"><h4 class="xa-mono">${T("KOMMENDE EVENTS", "UPCOMING EVENTS")}</h4><ul class="xa-events">${s.events.map((e) => `<li><span class="xa-grow"><b>${esc(L(e.title))}</b><small>${esc(L(e.when))}</small></span><button type="button" class="xa-mini ${e.going ? "is-on" : ""}" data-act="rsvp" data-id="${e.id}" data-k="rsvp-${e.id}" aria-pressed="${e.going}">${e.going ? T("Zugesagt", "Going") : T("Zusagen", "Attend")}</button></li>`).join("")}</ul></div>
      </aside>
    </div>`;
  }
  function viewCommunity(s, id) {
    const c = s.communities.find((x) => x.id === id) || s.communities[0];
    const chans = CHANNELS[c.id] || [["allgemein", ""]];
    const ch = chans.find((x) => x[0] === s.commChannel) ? s.commChannel : chans[0][0];
    const ci = chans.findIndex((x) => x[0] === ch);
    const posts = [...(POSTS[`${c.id}/${ch}`] || []), ...((s.commPosts || {})[`${c.id}/${ch}`] || [])];
    const members = c.id === "design" ? ["AK", "LV", "TB", "SR"] : ["JW", "LV", "MS", "TB", "SR"];
    const two = (n) => String(n).padStart(2, "0");
    return `<div class="xa-ed">
      <header class="xa-ed-bar"><button type="button" class="xa-plain xa-mono" data-act="go" data-area="communities" data-k="cd-back">← ${T("ALLE COMMUNITIES", "ALL COMMUNITIES")}</button><span class="xa-mono xa-faint">COMMUNITIES / ${esc(L(c.name)).toUpperCase()}</span><span class="xa-mono"><i class="xa-live"></i>LIVE</span></header>
      <section class="xa-ed-mast"><div><p class="xa-mono xa-acc-t">${c.id === "indie" ? T("OFFIZIELL · ", "OFFICIAL · ") : ""}${esc(L(c.tags[0])).toUpperCase()} · ${c.joined ? T("MITGLIED", "MEMBER") : T("GAST", "GUEST")}</p><h3 class="xa-ed-name" tabindex="-1" data-k="title">${esc(L(c.name))}</h3><p class="xa-ed-desc">${esc(L(c.desc))}</p></div>
        <div class="xa-ed-info"><dl><div><dt class="xa-mono">${T("ROLLE", "ROLE")}</dt><dd>${c.joined ? T("Mitglied", "Member") : T("Gast", "Guest")}</dd></div><div><dt class="xa-mono">${T("KATEGORIE", "CATEGORY")}</dt><dd>${esc(L(c.tags[0]))}</dd></div><div><dt class="xa-mono">${T("MITGLIEDER", "MEMBERS")}</dt><dd>${two(members.length)}</dd></div><div><dt class="xa-mono">${T("BEITRÄGE", "POSTS")}</dt><dd>${two(posts.length)}</dd></div></dl>
          ${c.joined ? `<button type="button" class="xa-framed" data-act="app-only" data-v="community" data-k="cd-edit">${T("COMMUNITY BEARBEITEN", "EDIT COMMUNITY")}</button>` : `<button type="button" class="xa-framed is-primary" data-act="join" data-id="${c.id}" data-k="cd-join">${T("BEITRETEN", "JOIN")}</button>`}</div></section>
      <div class="xa-ed-cols">
        <nav class="xa-ed-index" aria-label="${T("Kanäle", "Channels")}"><p class="xa-mono xa-faint">INDEX</p>${chans.map(([name, sub], i) => `<button type="button" class="xa-ed-ch" data-act="channel" data-v="${name}" data-k="ch-${name}" aria-current="${name === ch}"><span class="xa-mono">${two(i + 1)}</span><b>${name}</b>${sub ? `<small>${L(sub)}</small>` : ""}${name === ch ? `<small>${T(`${posts.length} Beiträge`, `${posts.length} posts`)}</small>` : ""}</button>`).join("")}<button type="button" class="xa-ed-ch xa-ed-add" data-act="app-only" data-v="community" data-k="ch-add"><span class="xa-mono">+ ${T("KANAL ANLEGEN", "ADD CHANNEL")}</span></button></nav>
        <div class="xa-ed-feed"><header><p class="xa-mono xa-acc-t">${two(ci + 1)} / ${two(chans.length)}</p><h4>#${ch}</h4></header>
          ${posts.length ? `<ol data-scroll="feed">${posts.map((p) => `<li class="xa-ed-post"><div class="xa-ed-meta"><span class="xa-mono">${esc(L(p.at))}</span><b>${esc(p.by)}</b>${p.team ? `<span class="xa-mono xa-acc-t">XYNTAL-TEAM</span>` : ""}</div><p>${esc(L(p.text))}</p></li>`).join("")}</ol>`
            : `<div class="xa-ed-empty"><p class="xa-ed-still">${T("NOCH STILL HIER.", "STILL QUIET HERE.")}</p><p>${T("Noch keine Beiträge. Sei der Erste, der etwas sagt.", "No posts yet. Be the first to say something.")}</p></div>`}
          ${c.joined ? `<form class="xa-ed-composer" data-form="post"><span class="xa-mono xa-acc-t" aria-hidden="true">&gt;</span><label class="xa-sr" for="xa-post-${uid}">${T(`Beitrag in #${ch}`, `Post in #${ch}`)}</label><input id="xa-post-${uid}" name="text" maxlength="400" autocomplete="off" placeholder="${T(`Beitrag schreiben in #${ch}…`, `Write a post in #${ch}…`)}" data-k="post-input"><button type="submit" class="xa-sq is-primary">${T("POSTEN ↵", "POST ↵")}</button></form>` : `<p class="xa-ed-join xa-muted">${T("Tritt bei, um mitzuschreiben.", "Join to post.")}</p>`}
        </div>
        <aside class="xa-ed-members"><p class="xa-mono xa-faint">${T("MITGLIEDER", "MEMBERS")} ${two(members.length)}</p><ul>${members.map((m) => `<li><span class="xa-sqav${m === "LV" ? " is-me" : ""}">${PEOPLE[m].name[0]}${["LV", "JW", "AK"].includes(m) ? `<i></i>` : ""}</span><span class="xa-grow"><b>${esc(PEOPLE[m].name)}${m === "LV" ? T(" (du)", " (you)") : ""}</b><small class="xa-mono ${m === members[0] ? "xa-acc-t" : "xa-faint"}">${m === members[0] ? T("INHABER", "OWNER") : T("MITGLIED", "MEMBER")}</small></span></li>`).join("")}</ul><p class="xa-muted xa-small">${T(`… und ${c.members - members.length} weitere`, `… and ${c.members - members.length} more`)}</p></aside>
      </div>
    </div>`;
  }

  function viewFiles(s) {
    const types = [["all", T("Alle Typen", "All types"), "file"], ["doc", T("Dokumente", "Documents"), "file"], ["image", T("Bilder", "Images"), "image"], ["video", T("Videos", "Videos"), "video"], ["audio", "Audio", "audio"], ["archive", T("Archive", "Archives"), "folder"]];
    const views = [["all", T("Alle Dateien", "All files"), "folder"], ["recent", T("Zuletzt", "Recent"), "clock"], ["shared", T("Geteilt", "Shared"), "users"], ["starred", T("Markiert", "Starred"), "star"], ["trash", T("Papierkorb", "Trash"), "trash"]];
    const STAT = { review: [T("In Prüfung", "In review"), "is-warn"], changes: [T("Änderungen nötig", "Changes requested"), "is-bad"], approved: [T("Freigegeben", "Approved"), "is-ok"], released: [T("Veröffentlicht", "Released"), "is-acc"] };
    const q = s.fileQuery.trim().toLowerCase();
    const list = s.files.filter((f) => (s.fileType === "all" || f.type === s.fileType) && (s.fileView === "all" || (s.fileView === "recent" && f.recent) || (s.fileView === "shared" && f.shared) || (s.fileView === "starred" && s.fileStars[f.id])) && (!s.fileWs || f.ws === s.fileWs) && (s.fileStatus === "all" || f.status === s.fileStatus) && (!q || f.name.toLowerCase().includes(q) || f.ws.toLowerCase().includes(q)));
    const sel = s.files.find((f) => f.id === s.fileSel);
    const ic = (t) => (t === "doc" ? "file" : t);
    return `<div class="xa-files">
      <nav class="xa-subnav" aria-label="${T("Dateiansichten", "File views")}"><h4 class="xa-subnav-h">${T("Dateien", "Files")}</h4>
        ${views.map(([id, label, i]) => `<button type="button" data-act="fileview" data-v="${id}" data-k="fv-${id}" aria-pressed="${s.fileView === id}">${icon(i)}${label}</button>`).join("")}
        <h4 class="xa-subnav-h xa-mt">${T("Arbeitsbereiche", "Workspaces")}</h4>
        <button type="button" class="xa-select xa-select-full" data-act="filews" data-k="filews">${s.fileWs ? esc(s.fileWs) : T("Alle Arbeitsbereiche", "All workspaces")}<i aria-hidden="true"></i></button>
        <button type="button" class="xa-subnav-add" data-act="app-only" data-v="folder" data-k="f-folder">+ ${T("Neuer Ordner", "New folder")}</button>
        <h4 class="xa-subnav-h xa-mt">${T("Typ", "Type")}</h4>
        ${types.map(([id, label, i]) => `<button type="button" data-act="filetype" data-v="${id}" data-k="ft-${id}" aria-pressed="${s.fileType === id}">${icon(i)}${label}</button>`).join("")}
      </nav>
      <div class="xa-files-main">
        ${pageHead(T("Dein gesamtes Wissen an einem Ort.", "All your knowledge in one place."), "")}
        <div class="xa-toolbar xa-files-bar"><button type="button" class="xa-hbtn xa-hbtn-ai" data-act="ask-files" data-k="f-ask">${AI_MARK}${T("Xyntal fragen", "Ask Xyntal")}</button><label class="xa-sr" for="xa-fq-${uid}">${T("Dateien suchen", "Search files")}</label><input id="xa-fq-${uid}" class="xa-input" type="search" data-input="filequery" data-k="fq" value="${esc(s.fileQuery)}" placeholder="${T("Dateien suchen …", "Search files …")}" autocomplete="off"><span class="xa-viewtog" aria-hidden="true"><i class="is-on">${icon("list")}</i><i>${icon("grid")}</i></span><button type="button" class="xa-btn xa-primary" data-act="upload" data-k="upload">${T("Hochladen", "Upload")}</button></div>
        <p class="xa-files-path">${icon("folder")}<span class="xa-grow">${T("Dein gesamtes Wissen an einem Ort", "All your knowledge in one place")}</span><span class="xa-mono">${T(`${list.length} Dateien`, `${list.length} files`)}</span></p>
        <p class="xa-files-plan">${T("Plan Start · 2,1 GB von 10 GB belegt · Upload bis 250 MB je Datei", "Start plan · 2.1 GB of 10 GB used · uploads up to 250 MB per file")}</p>
        ${chips("filestatus", [["all", T("Alle Status", "All statuses")], ...Object.entries(STAT).map(([id, [label]]) => [id, label, s.files.filter((f) => f.status === id).length])], s.fileStatus, T("Nach Prüfstatus filtern", "Filter by review status"))}
        <div class="xa-table" role="table" aria-label="${T("Dateien", "Files")}">
          <div class="xa-tr xa-th" role="row"><span role="columnheader">Name</span><span role="columnheader">${T("Arbeitsbereich", "Workspace")}</span><span role="columnheader">${T("Inhaber", "Owner")}</span><span role="columnheader">Ver</span><span role="columnheader">${T("Größe", "Size")}</span><span role="columnheader">${T("Geändert", "Modified")}</span><span role="columnheader"><span class="xa-sr">${T("Markieren", "Star")}</span></span></div>
          ${list.map((f) => `<div class="xa-tr${f.id === s.fileSel ? " is-sel" : ""}" role="row"><span role="cell"><button type="button" class="xa-plain xa-fname" data-act="file" data-id="${f.id}" data-k="file-${f.id}" aria-pressed="${f.id === s.fileSel}">${icon(ic(f.type))}${esc(f.name)}</button>${f.status ? `<span class="xa-status ${STAT[f.status][1]}">${STAT[f.status][0]}</span>` : ""}</span><span role="cell" class="xa-muted">${esc(f.ws)}</span><span role="cell" class="xa-muted">${esc(PEOPLE[f.owner].name)}</span><span role="cell" class="xa-mono">v${f.ver}</span><span role="cell" class="xa-mono">${f.size}</span><span role="cell" class="xa-mono">${esc(L(f.at))}</span><span role="cell"><button type="button" class="xa-iconbtn xa-star" data-act="filestar" data-id="${f.id}" data-k="fs-${f.id}" aria-pressed="${!!s.fileStars[f.id]}" aria-label="${T(`${f.name} markieren`, `Star ${f.name}`)}">${icon("star")}</button></span></div>`).join("") || `<p class="xa-empty">${s.fileView === "trash" ? T("Der Papierkorb ist leer.", "The trash is empty.") : T("Keine Dateien gefunden.", "No files found.")}</p>`}
        </div>
        ${sel ? `<div class="xa-card xa-filedetail" role="region" aria-label="${esc(sel.name)}"><span class="xa-icon-tile xa-lg">${icon(ic(sel.type))}</span><div class="xa-grow"><b>${esc(sel.name)}</b><small class="xa-muted">${esc(sel.ws)} · ${esc(PEOPLE[sel.owner].name)} · ${sel.size} · ${T(`Version ${sel.ver}`, `Version ${sel.ver}`)}${sel.status ? ` · ${STAT[sel.status][0]}` : ""}</small></div><button type="button" class="xa-btn xa-primary" data-act="file-ai" data-id="${sel.id}" data-k="file-ai">${icon("sparkle")}${T("Mit KI zusammenfassen", "Summarise with AI")}</button></div>` : `<p class="xa-hint">${T("Tipp: Wähle eine Datei, um sie von der KI zusammenfassen zu lassen.", "Tip: pick a file to have the AI summarise it.")}</p>`}
      </div>
    </div>`;
  }

  const AI_ACTIONS = [
    ["plan", ["Meinen Tag planen", "Plan my day"]],
    ["summary", ["Arbeit zusammenfassen", "Summarise my work"]],
    ["risks", ["Risiken finden", "Find risks"]],
    ["update", ["Update entwerfen", "Draft an update"]],
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
    if (kind === "decisions") return `<p>${T("Das habt ihr in Loopr Studio entschieden:", "This is what you decided in Loopr Studio:")}</p>${li(s.wsd.loopr.decisions.map((d) => `<b>${esc(L(d.title))}</b> (${L(DEC_STATE[d.state])}): ${esc(L(d.why))}`))}`;
    if (kind === "chat") {
      const c = s.convos.find((x) => x.id === s.convo);
      return `<p>${T(`Zusammenfassung von „${esc(c.name)}“:`, `Summary of “${esc(c.name)}”:`)}</p>${li(c.msgs.filter((m) => !m.kind).slice(-3).map((m) => `<b>${m.from === "LV" ? T("Du", "You") : esc(PEOPLE[m.from].name.split(" ")[0])}:</b> ${esc(L(m.text))}`))}`;
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
      return `<p>${T(`Für Loopr Studio passt <b>${esc(b.name)}</b> (${esc(L(b.role))}, ${esc(b.city)}) am besten: ${b.score} % Passung.`, `For Loopr Studio, <b>${esc(b.name)}</b> (${esc(L(b.role))}, ${esc(b.city)}) fits best: ${b.score}% match.`)}</p><p>${esc(L(b.sum))}</p><p><button type="button" class="xa-link" data-act="builder-open" data-id="${b.id}" data-k="ai-b-${b.id}">${T("Profil ansehen", "View profile")} ${icon("arrowR")}</button></p>`;
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
        <label class="xa-sr" for="xa-aq-${uid}">${T("Gespräche suchen", "Search conversations")}</label><input id="xa-aq-${uid}" class="xa-input xa-mt" type="search" data-input="aiquery" data-k="aq" value="${esc(s.aiQuery)}" placeholder="${T("Chats suchen …", "Search chats …")}" autocomplete="off">
        ${(() => { const q = s.aiQuery.trim().toLowerCase(); const m = (t) => !q || t.toLowerCase().includes(q); const pinned = [T("Beta-Plan Closed Beta", "Closed beta plan")].filter(m); const recent = [s.ai.length ? T("Aktuelles Gespräch", "Current conversation") : "", T("Pitch-Deck überarbeiten", "Revise the pitch deck"), T("Fragen für Nutzerinterviews", "Questions for user interviews")].filter((t) => t && m(t));
          return `<h4 class="xa-kicker xa-mt">${T("Zuletzt", "Recent")}</h4><ul class="xa-recent">${[...recent, ...pinned, T("Meinen Mittwoch entzerren", "Untangle my Wednesday"), T("Erkläre mein 94-%-Match mit Noah", "Explain my 94% match with Noah")].filter(m).map((t, i) => `<li class="${i || !s.ai.length ? "xa-muted" : ""}">${icon("message")}${esc(t)}</li>`).join("") || `<li class="xa-muted">${T("Nichts gefunden.", "Nothing found.")}</li>`}</ul>`; })()}</aside>
      <div class="xa-ai-main" role="region" aria-label="Xyntal KI">
        <header class="xa-ai-head"><h3 class="xa-title" tabindex="-1" data-k="title">Xyntal KI</h3><span class="xa-grow"></span>${hbtn(T("Neuer Chat", "New chat"), 'data-act="ai-new" data-k="ai-new2"')}</header>
        <div class="xa-seg xa-ai-tabs" role="group" aria-label="${T("Bereiche des KI-Centers", "AI Center sections")}">${[["chat", "Chat"], ["agents", T("Agenten", "Agents")], ["templates", T("Vorlagen", "Templates")], ["automation", T("Automationen", "Automations")], ["memory", T("Speicher", "Memory")], ["settings", T("Einstellungen", "Settings")]].map(([id, label]) => `<button type="button" data-act="aitab" data-v="${id}" data-k="aitab-${id}" aria-pressed="${s.aiTab === id}">${label}</button>`).join("")}</div>
        ${s.aiTab === "agents" ? `<ul class="xa-alist xa-ai-pane">${s.agents.map((a) => `<li class="xa-card xa-auto${a.on ? "" : " is-off"}"><span class="xa-icon-tile">${icon("bot")}</span><div class="xa-grow"><b id="xa-ag-${a.id}-${uid}">${esc(L(a.name))}</b><small class="xa-muted">${esc(L(a.desc))}</small></div>${sw("agent", a.id, a.on, `xa-ag-${a.id}-${uid}`)}</li>`).join("")}</ul>`
        : s.aiTab === "templates" ? `<ul class="xa-alist xa-ai-pane">${[["plan", T("Tagesplan aus Kalender und Aufgaben", "Day plan from calendar and tasks")], ["risks", T("Risiken vor einem Meilenstein finden", "Find risks before a milestone")], ["update", T("Team-Update aus der Woche", "Team update from the week")], ["summary", T("Stand aller Projekte", "Status of all projects")]].map(([id, d]) => `<li class="xa-card xa-auto"><span class="xa-icon-tile">${icon("copy")}</span><div class="xa-grow"><b>${L(AI_ACTIONS.find((x) => x[0] === id)[1])}</b><small class="xa-muted">${d}</small></div><button type="button" class="xa-btn xa-primary" data-act="ai-tpl" data-v="${id}" data-k="ait-${id}">${T("Verwenden", "Use")}</button></li>`).join("")}</ul>`
        : s.aiTab === "memory" ? `<ul class="xa-alist xa-ai-pane xa-log">${[T("Lena arbeitet am liebsten vormittags in Fokusblöcken.", "Lena prefers focus blocks in the morning."), T("Loopr Studio plant die Closed Beta für den 7. November.", "Loopr Studio plans the closed beta for 7 November."), T("Team-Updates gehen freitags an #team-loopr.", "Team updates go to #team-loopr on Fridays.")].map((m) => `<li><span class="xa-dot" style="--h:#8B6CFF"></span><span class="xa-grow">${m}</span></li>`).join("")}</ul><p class="xa-hint xa-ai-pane">${T("Du entscheidest, was die KI sich merkt – jeder Eintrag lässt sich in der App löschen.", "You decide what the AI remembers – every entry can be deleted in the app.")}</p>`
        : `<ol class="xa-ai-thread" data-scroll="ai">
          ${s.ai.length ? s.ai.map((m) => m.role === "user" ? `<li class="xa-q"><p data-own>${esc(m.text)}</p></li>` : `<li class="xa-a"><span class="xa-ai-badge" aria-hidden="true">${icon("sparkle")}</span><div>${aiAnswer(s, m.kind, m.q)}</div></li>`).join("") : `<li class="xa-ai-empty"><span class="xa-icon-tile xa-lg">${icon("hexagon")}</span><p>${T("Frag alles zu deinen Arbeitsbereichen, Projekten und Dateien.", "Ask anything about your workspaces, projects and files.")}</p><div class="xa-chips">${sugg}</div></li>`}
          ${s.aiBusy ? `<li class="xa-a"><span class="xa-ai-badge" aria-hidden="true">${icon("sparkle")}</span><span class="xa-dots" aria-label="${T("Xyntal KI denkt nach …", "Xyntal AI is thinking …")}"><i></i><i></i><i></i></span></li>` : ""}
        </ol>
        ${s.ai.length ? `<div class="xa-chips xa-ai-sugg">${sugg}</div>` : ""}`}
        <form class="xa-composer" data-form="ai"><label class="xa-sr" for="xa-ai-${uid}">${T("Frage an Xyntal KI", "Question for Xyntal AI")}</label><input id="xa-ai-${uid}" name="q" maxlength="300" autocomplete="off" placeholder="${T("Xyntal AI schreiben …", "Message Xyntal AI …")}" data-k="ai-input"${s.aiBusy ? " disabled" : ""}><button type="submit" class="xa-btn xa-primary"${s.aiBusy ? " disabled" : ""}>${T("Senden", "Send")}</button></form>
      </div>
      <aside class="xa-ai-side">
        <h4 class="xa-kicker">${T("Arbeitsbereich-Kontext", "Workspace context")}</h4><button type="button" class="xa-select xa-select-full" data-act="app-only" data-v="context" data-k="ai-ctx">Loopr Studio<i aria-hidden="true"></i></button>
        <h4 class="xa-kicker">${T("Relevante Dateien", "Relevant files")}</h4>
        <ul class="xa-flist">${["plan", "deck", "screens"].map((id) => { const f = s.files.find((x) => x.id === id); return `<li><button type="button" class="xa-plain" data-act="file-ai" data-id="${id}" data-k="aif-${id}">${icon(f.type === "doc" ? "file" : f.type)}${esc(f.name)}</button></li>`; }).join("")}</ul>
        <h4 class="xa-kicker">${T("KI-Agenten", "AI agents")}</h4>
        <button type="button" class="xa-agentbox" data-act="aitab" data-v="agents" data-k="ai-agbox"><i></i><span><b>${T(`${s.approvals.length} warten auf Prüfung`, `${s.approvals.length} awaiting review`)}</b><small>${T(`${s.agents.length} Agenten eingerichtet`, `${s.agents.length} agents set up`)}</small></span></button>
        <ul class="xa-flist">${s.agents.map((a) => `<li><button type="button" class="xa-plain" data-act="aitab" data-v="agents" data-k="aia-${a.id}"><span class="xa-dot" style="--h:${a.on ? "#45C99B" : "#8A8EA4"}"></span>${esc(L(a.name))}</button></li>`).join("")}</ul>
        <h4 class="xa-kicker">${T("Schnellaktionen", "Quick actions")}</h4>
        <div class="xa-qgrid">${AI_ACTIONS.map(([id, label]) => `<button type="button" data-act="ai" data-v="${id}" data-k="aiq-${id}"${s.aiBusy ? " disabled" : ""}>${L(label)}</button>`).join("")}</div>
      </aside>
    </div>`;
  }

  function viewAutomations(s) {
    const active = s.autos.filter((a) => a.on).length;
    const runs = s.autos.reduce((n, a) => n + a.runs, 0);
    const saved = s.autos.reduce((n, a) => n + a.runs * a.saves, 0);
    const tabs = [["list", T("Automationen", "Automations"), "zap"], ["templates", T("Vorlagen", "Templates"), "copy"], ["log", T("Verlauf", "History"), "clock"], ["approvals", T("Freigaben", "Approvals"), "shield", s.approvals.length], ["insights", T("Einblicke", "Insights"), "target"]];
    let body;
    if (s.autoTab === "approvals") {
      body = `<p class="xa-hint">${T("Bevor eine Automation in deinem Namen etwas sendet, fragt sie hier nach.", "Before an automation sends anything on your behalf, it asks here.")}</p><ul class="xa-alist">${s.approvals.map((a) => `<li class="xa-card xa-auto"><span class="xa-icon-tile xa-t-warn">${icon("shield")}</span><div class="xa-grow"><b>${esc(L(a.name))}</b><small class="xa-muted">${esc(L(a.by))} · ${esc(L(a.at))}</small></div><button type="button" class="xa-btn xa-primary" data-act="approve" data-id="${a.id}" data-v="yes" data-k="apy-${a.id}">${icon("check")}${T("Freigeben", "Approve")}</button><button type="button" class="xa-btn" data-act="approve" data-id="${a.id}" data-v="no" data-k="apn-${a.id}">${T("Ablehnen", "Reject")}</button></li>`).join("") || `<li class="xa-empty">${T("Nichts wartet auf deine Freigabe.", "Nothing is waiting for your approval.")}</li>`}</ul>`;
    } else if (s.autoTab === "insights") {
      const top = [...s.autos].sort((a, b) => b.runs * b.saves - a.runs * a.saves);
      const heat = [3, 5, 2, 6, 4, 0, 1, 4, 6, 3, 5, 2, 0, 0, 2, 4, 7, 5, 3, 1, 0, 3, 6, 4, 5, 2, 1, 0];
      body = `<div class="xa-grid xa-g2"><div class="xa-card"><h4 class="xa-kicker">${T("Gesparte Zeit je Automation", "Time saved per automation")}</h4><ul class="xa-factors">${top.map((a) => { const v = a.runs * a.saves; return `<li><span>${esc(L(a.name))}</span><span class="xa-mono">${v} Min</span><div class="xa-progress"><i style="width:${Math.round((v / Math.max(1, top[0].runs * top[0].saves)) * 100)}%"></i></div></li>`; }).join("")}</ul></div>
        <div class="xa-card"><h4 class="xa-kicker">${T("Läufe der letzten 4 Wochen", "Runs in the last 4 weeks")}</h4><div class="xa-heat" role="img" aria-label="${T("Heatmap der Läufe", "Heatmap of runs")}">${heat.map((v) => `<i style="--a:${(0.08 + v / 8).toFixed(2)}"></i>`).join("")}</div><p class="xa-small xa-muted">${T("Die meisten Läufe passieren dienstags und freitags.", "Most runs happen on Tuesdays and Fridays.")}</p></div></div>`;
    } else if (s.autoTab === "templates") {
      body = `<ul class="xa-alist">${s.templates.map((t) => `<li class="xa-card xa-auto"><span class="xa-icon-tile">${icon("copy")}</span><div class="xa-grow"><b>${esc(L(t.name))}</b><small class="xa-muted">${esc(L(t.when))} · ${T(`spart ca. ${t.saves} Min. pro Lauf`, `saves about ${t.saves} min per run`)}</small></div><button type="button" class="xa-btn xa-primary" data-act="use-tpl" data-id="${t.id}" data-k="tpl-${t.id}">${T("Verwenden", "Use")}</button></li>`).join("") || `<li class="xa-empty">${T("Alle Vorlagen sind schon im Einsatz.", "All templates are already in use.")}</li>`}</ul>`;
    } else if (s.autoTab === "log") {
      body = `<ul class="xa-alist xa-log">${s.autoLog.map((l) => `<li><span class="xa-dot" style="--h:${l.ok ? "#45C99B" : "#E05E6D"}"></span><span class="xa-grow">${esc(L(l.name))}</span><span class="xa-status is-ok">${T("Erfolgreich", "Succeeded")}</span><span class="xa-mono xa-muted">${esc(L(l.at))}</span></li>`).join("")}</ul>`;
    } else {
      body = `<ul class="xa-alist">${s.autos.map((a) => `<li class="xa-card xa-auto${a.on ? "" : " is-off"}"><span class="xa-icon-tile">${icon("zap")}</span><div class="xa-grow"><b id="xa-an-${a.id}-${uid}">${esc(L(a.name))}</b><small class="xa-muted">${esc(L(a.when))} · ${T(`${a.runs} Läufe`, `${a.runs} runs`)}</small></div><button type="button" class="xa-mini" data-act="run" data-id="${a.id}" data-k="run-${a.id}"${a.on ? "" : " disabled"}>${icon("play")}${T("Jetzt ausführen", "Run now")}</button>${sw("auto", a.id, a.on, `xa-an-${a.id}-${uid}`)}</li>`).join("")}</ul>
        ${s.templates.length ? `<h4 class="xa-seclabel xa-sec-gap">${T("SCHNELLSTART", "QUICK START")}</h4><ul class="xa-qstart">${s.templates.map((t, i) => `<li><span class="xa-qs-top"><span class="xa-rc-ic">${icon(["flag", "shield", "chart"][i % 3])}</span><span class="xa-mtag">${i ? T("KI", "AI") : T("Planung", "Planning")}</span></span><b>${esc(L(t.name))}</b><p>${esc(L(t.when))}</p><span class="xa-qs-foot"><small>${T(`spart ~${t.saves} Min. pro Lauf`, `saves ~${t.saves} min per run`)}</small><button type="button" class="xa-acc-link" data-act="use-tpl" data-id="${t.id}" data-k="qs-${t.id}">${T("Verwenden", "Use")} →</button></span></li>`).join("")}</ul>` : ""}`;
    }
    return `<div class="xa-files">
      <nav class="xa-subnav" aria-label="${T("Automation", "Automation")}"><h4 class="xa-subnav-h">Automation</h4>${tabs.map(([id, label, i, n]) => `<button type="button" data-act="autotab" data-v="${id}" data-k="at-${id}" aria-pressed="${s.autoTab === id}">${icon(i)}<span class="xa-grow">${label}</span>${n ? `<span class="xa-count">${n}</span>` : ""}</button>`).join("")}</nav>
      <div class="xa-files-main">
        ${pageHead(T("Automationen", "Automations"), T("Wenn etwas passiert, kümmert sich Xyntal um den nächsten Schritt — automatisch.", "When something happens, Xyntal takes care of the next step — automatically."), `<button type="button" class="xa-btn xa-primary" data-act="autotab" data-v="templates" data-k="a-new">${icon("plus")}${T("Neue Automation", "New automation")}</button>`)}
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
    const unplanned = allTasks(s).filter((x) => x.t.status !== "done" && x.t.prio !== "low" && !c.events.some((e) => L(e.title).includes(L(x.t.title)))).slice(0, 3);
    const loadOf = (i) => visible.filter((e) => e.day === i).reduce((n, e) => n + (e.e - e.s), 0);
    const loadWord = (h) => h === 0 ? T("Frei", "Free") : h < 2 ? T("Ruhig", "Quiet") : h < 4.5 ? T("Normal", "Normal") : T("Voll", "Busy");
    const month = [];
    for (let d = -5; d <= 36; d++) month.push(d); // Oktober-Ende bis Dezember-Anfang, Montag zuerst
    return `<div class="xa-cal">
      <aside class="xa-cal-side">
        <div class="xa-mini-cal"><b>${T("November 2026", "November 2026")}<span aria-hidden="true">${icon("chevL")}${icon("chevR")}</span></b>
          <div class="xa-mc-grid" aria-hidden="true">${DAYS.map((d) => `<span class="xa-mc-h">${L(d)[0]}</span>`).join("")}${month.map((d) => { const inMonth = d >= 1 && d <= 30; const n = d < 1 ? 31 + d : d > 30 ? d - 30 : d; const wk = d >= 2 && d <= 8; return `<span class="${inMonth ? "" : "is-out"}${wk ? " is-week" : ""}${d === 2 + c.day ? " is-sel" : ""}">${n}</span>`; }).join("")}</div></div>
        <h4 class="xa-kicker xa-mt">${T("Gespeicherte Ansichten", "Saved views")}</h4>
        <ul class="xa-switches">${[["week", T("Meine Woche", "My week")], ["agenda", T("Besprechungen und Fristen", "Meetings and deadlines")], ["focus", T("Deep Work", "Deep work")], ["unplanned", T("Ungeplante Arbeit", "Unscheduled work")]].map(([v, label]) => `<li><button type="button" class="xa-plain xa-grow" data-act="calsaved" data-v="${v}" data-k="csv-${v}">${label}</button></li>`).join("")}</ul>
        <h4 class="xa-kicker xa-mt">${T("Quellen", "Sources")}</h4>
        <ul class="xa-switches">${Object.entries(KINDS).map(([k, v]) => `<li><span class="xa-src-ic" style="--h:${v[3]}">${icon(v[2])}</span><span class="xa-grow" id="xa-k-${k}-${uid}">${en() ? v[1] : v[0]}</span>${sw("kind", k, !c.hidden[k], `xa-k-${k}-${uid}`)}</li>`).join("")}</ul>
        <h4 class="xa-kicker xa-mt">${T("Arbeitszeiten", "Working hours")}</h4>
        <p class="xa-cal-hours">${icon("clock")}<span><b>${T("Mo.–Fr. · 09:00–18:00", "Mon–Fri · 09:00–18:00")}</b><small>Europe/Berlin</small></span></p>
        <h4 class="xa-kicker xa-mt">${T("Ungeplante Arbeit", "Unscheduled work")}</h4>
        <ul class="xa-unplanned">${unplanned.map((x) => `<li><button type="button" class="xa-plain" data-act="cal-plan" data-id="${x.t.id}" data-k="up-${x.t.id}"><b>${esc(L(x.t.title))}</b><small>${esc(L(x.p.name))} · ${L(PRIO[x.t.prio])}</small></button></li>`).join("") || `<li class="xa-muted">${T("Alles eingeplant.", "Everything is scheduled.")}</li>`}</ul>
        <button type="button" class="xa-acc-link" data-act="app-only" data-v="planning" data-k="cal-planning">${T("Planung öffnen", "Open planning")} →</button>
      </aside>
      <div class="xa-cal-main" role="region" aria-label="${T("Wochenansicht", "Week view")}">
        <header class="xa-cal-head"><h3 class="xa-title" tabindex="-1" data-k="title">${icon("grid")}${T("Kalender", "Calendar")}</h3>${hbtn(T("Heute", "Today"), 'data-act="calday" data-v="0" data-k="cal-today"')}<span class="xa-cal-arrows" aria-hidden="true">${icon("chevL")}${icon("chevR")}</span><span class="xa-muted">${T("2. Nov. – 8. Nov.", "Nov 2 – Nov 8")}</span><span class="xa-grow"></span>
          <div class="xa-seg" role="group" aria-label="${T("Ansicht", "View")}"><button type="button" data-act="calview" data-v="day" data-k="cv-day" aria-pressed="${c.view === "day"}">${T("Tag", "Day")}</button><button type="button" data-act="calview" data-v="week" data-k="cv-week" aria-pressed="${c.view === "week"}">${T("Woche", "Week")}</button><button type="button" data-act="app-only" data-v="month" data-k="cv-month" aria-pressed="false">${T("Monat", "Month")}</button><button type="button" data-act="calview" data-v="agenda" data-k="cv-agenda" aria-pressed="${c.view === "agenda"}">${T("Agenda", "Agenda")}</button><button type="button" data-act="app-only" data-v="planning" data-k="cv-plan" aria-pressed="false">${T("Planung", "Planning")}</button></div><span class="xa-grow"></span>
          <button type="button" class="xa-btn xa-primary" data-act="cal-add" data-k="cal-add">${icon("plus")}${T("Erstellen", "Create")}</button></header>
        <div class="xa-days" role="group" aria-label="${T("Tag wählen", "Pick a day")}">${DAYS.map((d, i) => { const ms = visible.some((e) => e.day === i && e.kind === "milestone"); return `<button type="button" data-act="calday" data-v="${i}" data-k="cd-${i}" aria-pressed="${c.day === i}"><small>${L(d)}</small><b>${dates[i]}</b><em class="xa-day-load"><i style="--v:${Math.min(100, loadOf(i) * 14)}%"></i>${loadWord(loadOf(i))}</em>${ms ? `<i class="xa-ms-dot" aria-label="${T("Meilenstein", "Milestone")}"></i>` : ""}</button>`; }).join("")}</div>
        <div class="xa-week" data-view="${c.view}" data-scroll="week">
          <div class="xa-wgrid" style="--rows:${H1 - H0}">
            <div class="xa-hours" aria-hidden="true">${Array.from({ length: H1 - H0 }, (_, i) => `<span>${String(H0 + i).padStart(2, "0")}:00</span>`).join("")}</div>
            ${DAYS.map((d, i) => `<div class="xa-wcol${i === c.day ? " is-day" : ""}${i === 0 ? " is-today" : ""}" data-day="${i}">${visible.filter((e) => e.day === i).map((e) => `<button type="button" class="xa-ev xa-ev-${e.kind}${e.id === c.sel ? " is-sel" : ""}" style="top:calc(${e.s - H0} * var(--hh));height:calc(${e.e - e.s} * var(--hh) - 3px)" data-act="ev" data-id="${e.id}" data-k="ev-${e.id}" aria-pressed="${e.id === c.sel}"><b>${esc(L(e.title))}</b><small>${fmtH(e.s)}–${fmtH(e.e)}</small></button>`).join("")}${i === 0 ? `<span class="xa-now" style="top:calc(1.6 * var(--hh))" aria-hidden="true"></span>` : ""}</div>`).join("")}
          </div>
        </div>
        <ul class="xa-agenda" data-view="${c.view}">${dayEvents.map((e) => `<li><button type="button" class="xa-ag xa-ev-${e.kind}${e.id === c.sel ? " is-sel" : ""}" data-act="ev" data-id="${e.id}" data-k="ag-${e.id}" aria-pressed="${e.id === c.sel}"><span class="xa-mono">${fmtH(e.s)}–${fmtH(e.e)}</span><b>${esc(L(e.title))}</b></button></li>`).join("") || `<li class="xa-empty">${T("Frei. Tipp: Lege einen Fokusblock an.", "Free. Tip: add a focus block.")}</li>`}</ul>
        <p class="xa-cal-foot xa-muted"><span>${T("Freie Stelle klicken · zum Verschieben ziehen (auch über Tage) · untere Kante zieht die Dauer", "Click an empty slot · drag to move (across days too) · drag the lower edge for duration")}</span><span>${T("Persönliche Änderungen werden mit deinem Konto synchronisiert", "Personal changes sync with your account")}</span></p>
      </div>
      <aside class="xa-cal-brief" aria-label="${T("Tagesbriefing", "Daily briefing")}">
        <h4 class="xa-brief-h">${T("Tagesbriefing", "Daily briefing")}</h4><p class="xa-muted">${c.day === 0 ? T("Heute", "Today") : `${L(DAYS[c.day])}, ${dates[c.day]}. Nov`} · ${loadWord(planned)}</p>
        ${sel ? `<div class="xa-card xa-evcard xa-ev-${sel.kind}"><span class="xa-kicker">${en() ? KINDS[sel.kind][1] : KINDS[sel.kind][0]}</span><b>${esc(L(sel.title))}</b><small class="xa-muted">${L(DAYS[sel.day])} · ${fmtH(sel.s)}–${fmtH(sel.e)}</small>
          <div class="xa-row">${sel.kind === "focus" ? `<button type="button" class="xa-btn xa-primary" data-act="focus-start" data-k="ev-focus">${icon("play")}${T("Fokus starten", "Start focus")}</button>` : ""}${sel.user || sel.kind === "focus" ? `<button type="button" class="xa-btn" data-act="ev-del" data-id="${sel.id}" data-k="ev-del">${icon("trash")}${T("Entfernen", "Remove")}</button>` : ""}</div></div>` : ""}
        <h4 class="xa-kicker xa-mt">${T("Auslastung", "Load")}</h4>
        <div class="xa-progress"><i style="width:${Math.min(100, Math.round((planned / 9) * 100))}%"></i></div>
        <p class="xa-brief-t">${planned ? T(`${planned} Std. verplant – ${Math.max(0, 9 - planned)} h frei für Fokusarbeit.`, `${planned} h planned – ${Math.max(0, 9 - planned)} h free for focus work.`) : T("Freier Tag – 9 h frei für Fokusarbeit.", "Free day – 9 h free for focus work.")}</p>
        <div class="xa-loadtiles">${DAYS.slice(0, 5).map((d, i) => `<button type="button" data-act="calday" data-v="${i}" data-k="lt-${i}" aria-pressed="${c.day === i}"><i><u style="height:${Math.min(100, loadOf(i) * 14)}%"></u></i><b>${L(d).toUpperCase()}</b><small>${String(loadOf(i)).replace(".", ",")} h</small></button>`).join("")}</div>
        <h4 class="xa-kicker xa-mt">${T("Terminvorschläge", "Scheduling suggestions")}</h4>
        ${unplanned.length ? `<ul class="xa-suggest">${unplanned.map((x, i) => `<li><i class="xa-dot" style="--h:var(--xa-acc)"></i><span class="xa-grow"><b>${esc(L(x.t.title))}</b><small>${T("Morgen", "Tomorrow")} · ${fmtH(9.5 + i)}–${fmtH(10.5 + i)} · ${L(PRIO[x.t.prio])}</small></span><button type="button" class="xa-hbtn" data-act="cal-plan" data-id="${x.t.id}" data-k="sg-${x.t.id}">${T("Einplanen", "Schedule")}</button></li>`).join("")}</ul>` : `<p class="xa-muted">${T("Alles eingeplant.", "Everything is scheduled.")}</p>`}
        <button type="button" class="xa-acc-link" data-act="ai" data-v="plan" data-k="cal-ai">${T("Mit Xyntal KI planen", "Plan with Xyntal AI")} →</button>
        <h4 class="xa-kicker xa-mt">${T("Zeitplan", "Schedule")}</h4>
        ${dayEvents.length ? `<ul class="xa-brief">${dayEvents.map((e) => `<li><span class="xa-dot" style="--h:${KINDS[e.kind][3]}"></span><span class="xa-mono">${fmtH(e.s)}</span>${esc(L(e.title))}</li>`).join("")}</ul>` : `<p class="xa-muted">${T("An diesem Tag ist noch nichts. Klick auf eine freie Stelle, um das zu ändern.", "Nothing on this day yet. Click an empty slot to change that.")}</p>`}
        <h4 class="xa-kicker xa-mt">${T("Freie Fokuszeit", "Free focus time")}</h4><p class="xa-muted">${T(`Du hast ${Math.max(0, 9 - planned)} Stunden ohne Unterbrechung zwischen 09:00 und 18:00.`, `You have ${Math.max(0, 9 - planned)} uninterrupted hours between 09:00 and 18:00.`)}</p>
        <button type="button" class="xa-acc-link" data-act="focus-start" data-k="cal-focus">${T("Fokusblock starten", "Start focus block")} →</button>
        <h4 class="xa-kicker xa-mt">${T("Konflikte", "Conflicts")}</h4><p class="xa-muted">${(() => { const k = dayEvents.find((e, i) => dayEvents.slice(i + 1).some((o) => o.s < e.e)); return k ? T(`„${esc(L(k.title))}“ überschneidet sich mit einem anderen Termin.`, `“${esc(L(k.title))}” overlaps with another event.`) : T("Keine Konflikte an diesem Tag.", "No conflicts on this day."); })()}</p>
      </aside>
    </div>`;
  }

  const VIEWS = { forme: viewForMe, home: viewHome, focus: viewFocus, workspaces: viewWorkspaces, messages: viewMessages, discover: viewDiscover, communities: viewCommunities, files: viewFiles, "ai-center": viewAi, automation: viewAutomations, calendar: viewCalendar };
  // Download nur für angemeldete Beta-Tester; alle anderen sehen den Weg ins Beta-Programm.
  const ctaLinks = (primary, secondary) => betaTester
    ? `<a class="${primary}" href="/profil">${icon("download")}${T("App herunterladen", "Download the app")}</a><a class="${secondary}" href="/beta">${T("Zum Beta-Programm", "Beta programme")}</a>`
    : signedIn
      ? `<a class="${primary}" href="/beta">${T("Zum Beta-Programm", "Beta programme")}</a>`
      : `<a class="${primary}" href="/beta">${T("Für die Beta bewerben", "Apply for the beta")}</a>`;

  const NOTIFS = () => [
    { act: "convo", id: "aylin", icon: "message", text: T("Aylin fragt nach dem Design-Review", "Aylin is asking about the design review"), at: "10:02" },
    { act: "builder-open", id: "noah", icon: "compass", text: T("Neuer Vorschlag: Noah Becker (94 %)", "New suggestion: Noah Becker (94%)"), at: "09:40" },
    { act: "go", area: "calendar", icon: "flag", text: T("Closed Beta in 5 Tagen", "Closed beta in 5 days"), at: T("Heute", "Today") },
  ];

  /* ---------- Rahmen: Titelleiste und Seitenleiste ---------- */
  function crumbs(s) {
    const a = AREAS.find((x) => x.id === s.route.area);
    let c = esc(L(a.label));
    if (s.route.area === "workspaces" && s.route.id) {
      const r = s.route, w = s.workspaces.find((x) => x.id === r.id) || s.workspaces[0];
      const mod = WS_NAV.flatMap((g) => g.items).find((m) => m.id === r.sub);
      const link = (label, attrs) => `<button type="button" class="xa-crumb-l" ${attrs}>${label}</button>`;
      const deep = r.sub && r.sub !== "overview";
      c = `${link(esc(L(a.label)), 'data-act="go" data-area="workspaces" data-k="cr-ws"')} <span>/</span> ${deep ? link(esc(w.name), `data-act="ws" data-id="${w.id}" data-k="cr-w"`) : esc(w.name)}`;
      if (deep && mod) c += ` <span>/</span> ${r.proj || r.note ? link(esc(L(mod.label)), `data-act="ws-sub" data-id="${w.id}" data-v="${r.sub}" data-k="cr-m"`) : esc(L(mod.label))}`;
      if (r.proj) c += ` <span>/</span> ${esc(L(proj(s, r.proj)?.name || ""))}`;
      if (r.note) c += ` <span>/</span> ${esc(L(NOTES.find((n) => n.id === r.note)?.title || ""))}`;
    }
    if (s.route.area === "communities" && s.route.id) c += ` <span>/</span> ${esc(L(s.communities.find((x) => x.id === s.route.id)?.name || ""))}`;
    return c;
  }
  function frame(s) {
    const u = unread(s);
    const notifs = NOTIFS();
    return `<div class="xa-titlebar">
        <button type="button" class="xa-iconbtn xa-nav-h" data-act="back" data-k="tb-back" aria-label="${T("Zurück", "Back")}"${s.back.length ? "" : " disabled"}>${icon("chevL")}</button>
        <button type="button" class="xa-iconbtn xa-nav-h" data-act="fwd" data-k="tb-fwd" aria-label="${T("Vorwärts", "Forward")}"${s.fwd.length ? "" : " disabled"}>${icon("chevR")}</button>
        <span class="xa-crumb">${crumbs(s)}</span>
        <span class="xa-grow"></span>
        <div class="xa-search"><label class="xa-sr" for="xa-q-${uid}">${T("Suchen oder springen", "Search or jump to")}</label>${icon("search")}<input id="xa-q-${uid}" type="search" autocomplete="off" data-input="search" data-k="search" placeholder="${T("Suchen oder springen …", "Search or jump to …")}" aria-controls="xa-res-${uid}" aria-expanded="false"><span class="xa-keys" aria-hidden="true"><kbd>Ctrl</kbd><kbd>K</kbd></span><div class="xa-results" id="xa-res-${uid}" hidden></div></div>
        <span class="xa-grow"></span>
        ${s.focus.running ? `<button type="button" class="xa-focus-pill" data-act="go" data-area="focus" data-k="tb-focus">${icon("target")}<span data-tb-timer>${Math.floor(s.focus.left / 60)}:${String(s.focus.left % 60).padStart(2, "0")}</span></button>` : ""}
        <button type="button" class="xa-ask-btn" data-act="go" data-area="ai-center" data-k="tb-ask" aria-label="${T("Xyntal fragen", "Ask Xyntal")}">${AI_MARK}<span>${T("Xyntal fragen", "Ask Xyntal")}</span></button>
        <span class="xa-demo-pill" title="${T("Alle Inhalte sind Beispieldaten", "All content is sample data")}"><i></i>DEMO</span>
        <div class="xa-bell-wrap"><button type="button" class="xa-iconbtn xa-bell" data-act="notif" data-k="tb-bell" aria-expanded="${s.notifOpen}" aria-label="${T("Benachrichtigungen", "Notifications")}">${icon("bell")}<i></i></button>
          ${s.notifOpen ? `<div class="xa-pop" role="dialog" aria-label="${T("Benachrichtigungen", "Notifications")}"><b>${T("Benachrichtigungen", "Notifications")}</b><ul>${notifs.map((n) => `<li><button type="button" data-act="${n.act}" data-id="${n.id || ""}" data-area="${n.area || ""}" data-k="nt-${n.id || n.area}">${icon(n.icon)}<span class="xa-grow">${n.text}</span><small>${n.at}</small></button></li>`).join("")}</ul></div>` : ""}</div>
        <div class="xa-bell-wrap"><button type="button" class="xa-av xa-me" style="--h:#007AFF" data-act="acct" data-k="tb-acct" aria-expanded="${s.acctOpen}" aria-label="${T("Konto: Lena Vogt", "Account: Lena Vogt")}">LV<i style="--h:${STATUS.find((x) => x[0] === s.status)[2]}"></i></button>
          ${s.acctOpen ? `<div class="xa-pop xa-acct" role="menu" aria-label="${T("Konto", "Account")}"><div class="xa-acct-head">${avatar("LV")}<span class="xa-grow"><b>Lena Vogt</b><small>lena@loopr.studio</small></span><span class="xa-plan">Start</span></div>
            <p class="xa-kicker">${T("Status", "Status")}</p><ul>${STATUS.map(([id, label, hue]) => `<li><button type="button" role="menuitemradio" aria-checked="${s.status === id}" data-act="status" data-id="${id}" data-k="st-${id}"><span class="xa-dot" style="--h:${hue}"></span><span class="xa-grow">${L(label)}</span>${s.status === id ? icon("check") : ""}</button></li>`).join("")}</ul>
            <ul class="xa-acct-links"><li><button type="button" role="menuitem" data-act="app-only" data-v="profile" data-k="am-profile">${icon("user")}${T("Profil", "Profile")}</button></li><li><button type="button" role="menuitem" data-act="app-only" data-v="settings" data-k="am-settings">${icon("settings")}${T("Einstellungen", "Settings")}</button></li><li><button type="button" role="menuitem" data-act="app-only" data-v="support" data-k="am-support">${icon("help")}${T("Hilfe & Support", "Help & support")}</button></li><li><button type="button" role="menuitem" data-act="upgrade" data-k="am-upgrade" class="xa-gold">${icon("upgrade")}${T("Plan upgraden", "Upgrade plan")}</button></li><li><button type="button" role="menuitem" data-act="app-only" data-v="logout" data-k="am-out">${icon("logout")}${T("Abmelden", "Sign out")}</button></li></ul></div>` : ""}</div>
        <span class="xa-winctl" aria-hidden="true">${icon("minus")}${icon("square")}${icon("x")}</span>
      </div>
      <div class="xa-body${s.collapsed ? " is-collapsed" : ""}">
        <nav class="xa-side" aria-label="${T("Bereiche der App", "App areas")}">
          <div class="xa-side-top"><span class="xa-brand">${LOGO()}<b>Xyntal</b></span>
          <ul>${AREAS.map((a) => `<li><button type="button" class="xa-nav" data-act="go" data-area="${a.id}" data-k="nav-${a.id}"${s.route.area === a.id ? ' aria-current="page"' : ""}>${icon(a.icon)}<span>${L(a.label)}</span>${a.id === "forme" && !s.formeSeen ? `<span class="xa-badge" aria-label="${T(`${inboxItems(s).length} neu`, `${inboxItems(s).length} new`)}">${inboxItems(s).length}</span>` : ""}${a.id === "messages" && u ? `<span class="xa-badge" aria-label="${T(`${u} ungelesen`, `${u} unread`)}">${u}</span>` : ""}</button></li>`).join("")}</ul></div>
          <div class="xa-side-foot"><button type="button" class="xa-nav xa-upgrade" data-act="upgrade" data-k="nav-upgrade">${icon("upgrade")}<span>${T("Upgrade", "Upgrade")}</span></button>
            <div class="xa-user"><button type="button" class="xa-user-main" data-act="app-only" data-v="profile" data-k="nav-profile" aria-label="${T("Profil von Lena Vogt", "Lena Vogt's profile")}"><span class="xa-av xa-user-av" aria-hidden="true">LV<i style="--h:${STATUS.find((x) => x[0] === s.status)[2]}"></i></span><span class="xa-user-t"><b>Lena</b><small>${L(STATUS.find((x) => x[0] === s.status)[1])}</small></span></button><button type="button" class="xa-iconbtn xa-user-gear" data-act="app-only" data-v="settings" data-k="nav-settings" aria-label="${T("Einstellungen", "Settings")}">${icon("settings")}</button></div>
            <button type="button" class="xa-nav xa-collapse" data-act="collapse" data-k="collapse" aria-expanded="${!s.collapsed}">${icon(s.collapsed ? "chevR" : "chevL")}<span>${s.collapsed ? T("Seitenleiste ausklappen", "Expand sidebar") : T("Seitenleiste einklappen", "Collapse sidebar")}</span></button></div>
        </nav>
        <div class="xa-content" data-scroll="content" data-sub="${s.route.id ? "detail" : ""}" data-area="${s.route.area}">${area(s)}</div>
      </div>`;
  }
  const area = (s) => {
    const r = s.route;
    if (r.area === "workspaces" && r.id) return viewWorkspace(s, r);
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
      if (push && (route.area !== s.route.area || route.id !== s.route.id || route.sub !== s.route.sub || route.proj !== s.route.proj || route.note !== s.route.note)) { s.back.push(s.route); s.fwd = []; }
      s.route = route;
      s.notifOpen = false; s.acctOpen = false;
      if (route.area === "messages") { const c = s.convos.find((x) => x.id === s.convo); if (c) c.unread = 0; }
      render({ newArea: true, focusTitle: true, revealNav: true, toBottom: true });
      const a = AREAS.find((x) => x.id === route.area);
      announce(T(`${L(a.label)} geöffnet`, `${L(a.label)} opened`));
    };
    const announce = (msg) => { toastEl.textContent = ""; toastEl.classList.remove("is-on"); setTimeout(() => { toastEl.textContent = msg; }, 30); };
    const findTask = (id) => allTasks(s).find((x) => x.t.id === id);
    const projRoute = (id) => ({ area: "workspaces", id: (proj(s, id) || s.projects[0]).ws, sub: "projects", proj: id });

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
      const tb = app.querySelector("[data-tb-timer]");
      if (tb) tb.textContent = `${Math.floor(f.left / 60)}:${String(f.left % 60).padStart(2, "0")}`;
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
      s.aiTab = "chat";
      const label = AI_ACTIONS.find(([id]) => id === kind)?.[1];
      s.ai.push({ role: "user", text: shown || q || (label ? L(label) : "") });
      s.aiBusy = true;
      if (s.route.area !== "ai-center") go({ area: "ai-center" }); else render({ toBottom: true });
      later(() => { s.aiBusy = false; s.ai.push({ role: "ai", kind, q }); if (s.route.area === "ai-center") render({ toBottom: true, focus: "[data-k=ai-input]" }); announce(T("Xyntal KI hat geantwortet.", "Xyntal AI has replied.")); }, 1100);
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
      notif() { s.notifOpen = !s.notifOpen; s.acctOpen = false; render(); },
      acct() { s.acctOpen = !s.acctOpen; s.notifOpen = false; render(); },
      status(el) { s.status = el.dataset.id; s.acctOpen = false; render({ focus: "[data-k=tb-acct]" }); toast(T(`Status: ${L(STATUS.find((x) => x[0] === s.status)[1])}`, `Status: ${L(STATUS.find((x) => x[0] === s.status)[1])}`)); },
      upgrade() { s.acctOpen = false; render(); toast(T("Tarife: Free (kostenlos), Plus 12 €, Pro 29 €, Ultra 79 € im Monat, dazu Enterprise – Upgrade unter Mein Profil → Tarif & Rechnungen.", "Plans: Free, Plus €12, Pro €29, Ultra €79 a month, plus Enterprise – upgrade under My profile → Plan & invoices.")); },
      "app-only"(el) {
        s.acctOpen = false; render();
        const what = { profile: T("Profil", "Profile"), settings: T("Einstellungen", "Settings"), support: T("Hilfe & Support", "Help & support"), logout: T("Abmelden", "Sign out"), customize: T("Startseite anpassen", "Customise home"), project: T("Neues Projekt", "New project"), workspace: T("Neuer Arbeitsbereich", "New workspace"), community: T("Community erstellen", "Create community"), call: T("Anrufe", "Calls"), contact: T("Inhaber kontaktieren", "Contacting the owner"), tab: T("Dieser Bereich", "This section"), month: T("Die Monatsansicht", "The month view"), planning: T("Die Planung", "Planning"), invite: T("Einladen", "Inviting"), group: T("Gruppen", "Groups"), newmsg: T("Neue Nachricht", "New message"), opening: T("Ausschreibungen bearbeiten", "Editing openings"), note: T("Der Seiten-Editor", "The page editor"), "note-ai": T("Xyntal KI in Notizen", "Xyntal AI in notes"), filter: T("Filter und Sortierung", "Filters and sorting"), folder: T("Ordner", "Folders") }[el.dataset.v] || T("Das", "This");
        toast(T(`${what} gibt es in der echten App – die Demo zeigt nur Beispieldaten.`, `${what} is in the real app – the demo only shows sample data.`));
      },
      "builder-open": (el) => { s.builder = el.dataset.id; s.discScope = "people"; s.role = "all"; go({ area: "discover" }); },
      ws: (el) => go({ area: "workspaces", id: el.dataset.id, sub: "overview" }),
      project: (el) => { s.projTab = "overview"; go(projRoute(el.dataset.id)); },
      "ws-sub": (el) => go({ area: "workspaces", id: el.dataset.id || s.route.id, sub: el.dataset.v }),
      fav(el) { s.favs[el.dataset.id] = !s.favs[el.dataset.id]; render(); },
      newtask() { s.projTab = "work"; s.projView = "board"; go(projRoute("app")); render({ focus: "[data-k=addtask]" }); },
      taskfilter(el) { s.taskFilter = el.dataset.v; render(); },
      taskscope(el) { s.taskScope = el.dataset.v; render(); },
      wssort() { const o = Object.keys(WS_SORT); s.wsSort = o[(o.indexOf(s.wsSort) + 1) % o.length]; render(); },
      discsort() { s.discSort = s.discSort === "best" ? "new" : "best"; render(); },
      "ws-switch"() { const i = s.workspaces.findIndex((w) => w.id === s.route.id); const w = s.workspaces[(i + 1) % s.workspaces.length]; go({ area: "workspaces", id: w.id, sub: "overview" }); toast(T(`Gewechselt zu ${w.name}.`, `Switched to ${w.name}.`)); },
      "ws-ask"(el) { askAi(el.dataset.v === "decisions" ? "decisions" : "summary", null, { okrs: T("Schlag OKRs für diesen Arbeitsbereich vor.", "Suggest OKRs for this workspace."), decisions: T("Fasse unsere Entscheidungen zusammen.", "Summarise our decisions."), insights: T("Erkläre mir die Zahlen dieses Arbeitsbereichs.", "Explain this workspace's numbers.") }[el.dataset.v] || T("Wie steht dieser Arbeitsbereich?", "How is this workspace doing?")); },
      projtab(el) { s.projTab = el.dataset.v; render({ focus: `[data-k="pn-${el.dataset.v}"]` }); },
      "newtask-here"() { s.projTab = "work"; s.projView = "board"; render({ focus: "[data-k=addtask]" }); },
      "task-open"(el) { s.projTab = "work"; s.projView = "board"; go(projRoute(el.dataset.id)); },
      note: (el) => go({ area: "workspaces", id: s.route.id, sub: "notes", note: el.dataset.id }),
      okrfilter(el) { s.okrFilter = el.dataset.v; render(); },
      decfilter(el) { s.decFilter = el.dataset.v; render(); },
      riskfilter(el) { s.riskFilter = el.dataset.v; render(); },
      insrange(el) { s.insRange = el.dataset.v; render(); },
      "okr-state"(el) { const o = Object.values(s.wsd).flatMap((d) => d.okrs).find((x) => x.id === el.dataset.id); const k = Object.keys(OKR_STATE); o.state = k[(k.indexOf(o.state) + 1) % k.length]; render(); },
      kr(el) { const o = Object.values(s.wsd).flatMap((d) => d.okrs).find((x) => x.id === el.dataset.id); const k = o.krs[Number(el.dataset.v)]; const step = k.target >= 50 ? Math.round(k.target / 25) : 1; k.cur = Math.max(0, Math.min(k.target, k.cur + Number(el.dataset.to) * step)); render(); if (k.cur === k.target) toast(T("Schlüsselergebnis erreicht.", "Key result reached.")); },
      "risk-state"(el) { const r = Object.values(s.wsd).flatMap((d) => d.risks).find((x) => x.id === el.dataset.id); const k = ["open", "progress", "closed"]; r.state = k[(k.indexOf(r.state) + 1) % 3]; render(); },
      brief(el) {
        if (s.briefBusy) return;
        const kind = BRIEF_KINDS.find((b) => b[0] === el.dataset.v); const wid = el.dataset.id;
        s.briefBusy = kind[0]; render();
        later(() => { const id = "b" + Date.now(); s.briefBusy = null; s.wsd[wid] = s.wsd[wid] || JSON.parse(JSON.stringify(s.wsd._)); s.wsd[wid].briefs.unshift({ id, title: kind[1], at: [`${T("Heute", "Today")}, ${nowTime()}`, `Today, ${nowTime()}`], body: briefBody(kind[0]) }); s.briefOpen = id; if (s.route.sub === "briefs") render(); toast(T("Briefing fertig und im Verlauf gespeichert.", "Briefing ready and saved to the history.")); }, 1200);
      },
      "brief-open"(el) { s.briefOpen = s.briefOpen === el.dataset.id ? null : el.dataset.id; render(); },
      "mem-ok"(el) { const m = s.wsd[el.dataset.id].memory[Number(el.dataset.v)]; m.sug = false; render(); toast(T("Bestätigt – Xyntal KI nutzt den Eintrag ab jetzt.", "Confirmed – Xyntal AI uses the entry from now on.")); },
      inboxfilter(el) { s.inboxFilter = el.dataset.v; render(); },
      "inbox-done"(el) { s.inboxDone[el.dataset.id] = "done"; s.inboxFilter = "all"; if (el.dataset.v) { const x = findTask(el.dataset.v); if (x) x.t.status = "done"; } render(); toast(T("Erledigt.", "Done.")); },
      "inbox-later"(el) { s.inboxDone[el.dataset.id] = "later"; s.inboxFilter = "all"; render(); toast(T("Zurückgestellt – kommt morgen früh wieder.", "Snoozed – back tomorrow morning.")); },
      "inbox-reset"() { s.inboxDone = {}; render(); },
      "autotab-go"(el) { s.autoTab = el.dataset.v; go({ area: "automation" }); },
      chatmore() { s.chatMore = !s.chatMore; render({ focus: "[data-k=chatmore]" }); },
      "fit-hide"() { s.fitHidden = true; render(); },
      filews() { const o = [null, "Loopr Studio", "Kiezkiste"]; s.fileWs = o[(o.indexOf(s.fileWs || null) + 1) % o.length]; render({ focus: "[data-k=filews]" }); },
      "ask-files"() { askAi("free", "Dateien", T("Welche Dateien sind gerade wichtig?", "Which files matter right now?")); },
      "cal-plan"(el) { const x = findTask(el.dataset.id); if (!x) return; s.focus.task = x.t.id; addBlock(1, null); },
      wsfilter(el) { s.wsFilter = el.dataset.v; render(); },
      "ws-join"(el) { const w = s.openWs.find((x) => x.id === el.dataset.id); s.requested[w.id] = !s.requested[w.id]; render(); if (s.requested[w.id]) toast(w.mode === "join" ? T(`Willkommen bei ${w.name}!`, `Welcome to ${w.name}!`) : T(`Anfrage an ${w.name} gesendet.`, `Request sent to ${w.name}.`)); },
      projscope(el) { s.projScope = el.dataset.v; render(); },
      projview(el) { s.projView = el.dataset.v; render({ focus: `[data-k="pv-${el.dataset.v}"]` }); },
      pstar(el) { s.projStars[el.dataset.id] = !s.projStars[el.dataset.id]; render(); },
      move(el) {
        const x = findTask(el.dataset.id); if (!x) return;
        x.t.status = el.dataset.to;
        render({ focus: `[data-k="mv-${x.t.id}"]` });
        toast(x.t.status === "done" ? T(`Erledigt: ${L(x.t.title)}`, `Done: ${L(x.t.title)}`) : x.t.status === "review" ? T(`In Prüfung: ${L(x.t.title)}`, `In review: ${L(x.t.title)}`) : x.t.status === "doing" ? T(`In Arbeit: ${L(x.t.title)}`, `In progress: ${L(x.t.title)}`) : T(`Wieder offen: ${L(x.t.title)}`, `Reopened: ${L(x.t.title)}`));
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
      "focus-skip"() {
        const ft = focusTask(s); const rank = { high: 0, mid: 1, low: 2 };
        const next = allTasks(s).filter((x) => x.t.status !== "done" && (!ft || x.t.id !== ft.t.id)).sort((a, b) => rank[a.t.prio] - rank[b.t.prio])[0];
        if (next) { s.focus.task = next.t.id; render({ focus: "[data-k=f-skip]" }); toast(T(`Als Nächstes: ${L(next.t.title)}`, `Up next: ${L(next.t.title)}`)); }
      },
      "focus-pick"(el) { s.focus.task = el.dataset.id; render({ focus: "[data-k=f-main]" }); },
      "blocks-all"() { const all = Object.values(s.focus.blocks).every(Boolean); Object.keys(s.focus.blocks).forEach((k) => { s.focus.blocks[k] = !all; }); render(); },
      block(el) { s.focus.blocks[el.dataset.id] = !s.focus.blocks[el.dataset.id]; render(); },
      convo(el) {
        s.convo = el.dataset.id;
        const c = s.convos.find((x) => x.id === s.convo); if (c) c.unread = 0;
        if (s.route.area !== "messages") go({ area: "messages" }); else render({ toBottom: true });
      },
      chatfilter(el) {
        s.chatFilter = el.dataset.v;
        const first = s.convos.find((x) => (s.chatFilter === "requests" ? x.request : !x.request));
        const cur = s.convos.find((x) => x.id === s.convo);
        if (first && s.chatFilter !== "archived" && !!cur?.request !== (s.chatFilter === "requests")) { s.convo = first.id; first.unread = 0; }
        render();
      },
      "req-accept"() { const c = s.convos.find((x) => x.id === s.convo); c.request = false; s.chatFilter = "all"; render({ focus: "[data-k=chat-input]" }); toast(T(`Anfrage von ${c.name} angenommen.`, `Accepted ${c.name}'s request.`)); },
      "req-decline"() { const c = s.convos.find((x) => x.id === s.convo); s.convos = s.convos.filter((x) => x !== c); s.convo = "team"; s.chatFilter = "all"; render(); toast(T("Anfrage abgelehnt.", "Request declined.")); },
      "ask-chat"() { askAi("chat", null, T("Fasse dieses Gespräch zusammen.", "Summarise this conversation.")); },
      role(el) { s.role = el.dataset.v; render(); },
      discscope(el) { s.discScope = el.dataset.v; render({ focus: `[data-k="ds-${el.dataset.v}"]` }); },
      "builder-close"() { s.builder = null; render(); },
      "disc-req"(el) { s.requested[el.dataset.id] = !s.requested[el.dataset.id]; render(); if (s.requested[el.dataset.id]) toast(T("Bewerbung gesendet (Demo).", "Application sent (demo).")); },
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
      comm(el) { s.commChannel = null; go({ area: "communities", id: el.dataset.id }); },
      channel(el) { s.commChannel = el.dataset.v; render({ focus: `[data-k="ch-${el.dataset.v}"]` }); },
      join(el) {
        const c = s.communities.find((x) => x.id === el.dataset.id); c.joined = !c.joined; render();
        toast(c.joined ? T(`Willkommen in „${L(c.name)}“!`, `Welcome to “${L(c.name)}”!`) : T(`„${L(c.name)}“ verlassen.`, `Left “${L(c.name)}”.`));
      },
      rsvp(el) { const e = s.events.find((x) => x.id === el.dataset.id); e.going = !e.going; render(); },
      fileview(el) { s.fileView = el.dataset.v; render(); },
      filetype(el) { s.fileType = el.dataset.v; render(); },
      filestatus(el) { s.fileStatus = el.dataset.v; render(); },
      file(el) {
        if (s.route.area !== "files") { s.fileSel = el.dataset.id; s.fileType = "all"; s.fileView = "all"; s.fileStatus = "all"; s.fileQuery = ""; go({ area: "files" }); return; }
        s.fileSel = s.fileSel === el.dataset.id ? null : el.dataset.id; render();
      },
      "focus-check"(el) { const x = findTask(el.dataset.id); if (!x) return; const d = x.t.status !== "done"; x.t.status = d ? "done" : "todo"; x.t.focusDone = d; render({ focus: `[data-k="fc-${x.t.id}"]` }); if (d) toast(T(`Erledigt: ${L(x.t.title)}`, `Done: ${L(x.t.title)}`)); },
      "task-done"(el) { const x = findTask(el.dataset.id); if (!x) return; x.t.status = "done"; x.t.focusDone = true; render(); toast(T(`Erledigt: ${L(x.t.title)}`, `Done: ${L(x.t.title)}`)); },
      "convo-req"(el) { s.convo = el.dataset.id; s.chatFilter = "requests"; const c = s.convos.find((x) => x.id === s.convo); if (c) c.unread = 0; go({ area: "messages" }); },
      "match-save"(el) { s.matchSaved[el.dataset.id] = !s.matchSaved[el.dataset.id]; render(); },
      "match-hide"(el) { s.matchHidden[el.dataset.id] = true; render(); toast(T("Danke – solche Vorschläge zeigen wir seltener.", "Thanks – we'll show fewer suggestions like this.")); },
      filestar(el) { s.fileStars[el.dataset.id] = !s.fileStars[el.dataset.id]; render(); },
      upload() { toast(T("In der Demo werden keine Dateien hochgeladen.", "The demo doesn't upload any files.")); },
      "file-ai"(el) { const f = s.files.find((x) => x.id === el.dataset.id); askAi("file:" + f.id, null, T(`Fasse ${f.name} zusammen.`, `Summarise ${f.name}.`)); },
      ai(el) { askAi(el.dataset.v); },
      aitab(el) {
        if (el.dataset.v === "automation") { go({ area: "automation" }); return; }
        if (el.dataset.v === "settings") { actions["app-only"]({ dataset: { v: "settings" } }); return; }
        s.aiTab = el.dataset.v; render({ focus: `[data-k="aitab-${el.dataset.v}"]` });
      },
      agent(el) { const a = s.agents.find((x) => x.id === el.dataset.id); a.on = !a.on; render(); toast(a.on ? T(`${L(a.name)} ist aktiv.`, `${L(a.name)} is active.`) : T(`${L(a.name)} pausiert.`, `${L(a.name)} paused.`)); },
      "ai-tpl"(el) { s.aiTab = "chat"; askAi(el.dataset.v); },
      "ai-new"() { if (s.aiBusy) return; s.ai = []; render({ focus: "[data-k=ai-input]" }); },
      autotab(el) { s.autoTab = el.dataset.v; render(); },
      approve(el) {
        const a = s.approvals.find((x) => x.id === el.dataset.id); s.approvals = s.approvals.filter((x) => x !== a);
        if (el.dataset.v === "yes") s.autoLog.unshift({ name: a.name, at: [`${T("Heute", "Today")}, ${nowTime()}`, `Today, ${nowTime()}`], ok: true });
        render(); toast(el.dataset.v === "yes" ? T("Freigegeben und ausgeführt.", "Approved and run.") : T("Abgelehnt – nichts wurde gesendet.", "Rejected – nothing was sent."));
      },
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
      calsaved(el) {
        const v = el.dataset.v;
        if (v === "focus") { s.cal.view = "week"; s.cal.hidden = { personal: true, work: true, milestone: true, focus: false }; }
        else { s.cal.view = v; s.cal.hidden = {}; }
        render();
      },
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
      if ((s.notifOpen || s.acctOpen) && !e.target.closest(".xa-bell-wrap")) { s.notifOpen = false; s.acctOpen = false; render(); }
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
      ...s.projects.map((p) => ({ label: L(p.name), kind: T("Projekt", "Project"), run: () => go(projRoute(p.id)) })),
      ...s.workspaces.map((w) => ({ label: w.name, kind: T("Arbeitsbereich", "Workspace"), run: () => go({ area: "workspaces", id: w.id, sub: "overview" }) })),
      ...s.builders.map((b) => ({ label: b.name, kind: T("Builder", "Builder"), run: () => { s.builder = b.id; s.discScope = "people"; s.role = "all"; go({ area: "discover" }); } })),
      ...s.files.map((f) => ({ label: f.name, kind: T("Datei", "File"), run: () => { s.fileSel = f.id; s.fileType = "all"; s.fileView = "all"; s.fileQuery = ""; go({ area: "files" }); } })),
      ...allTasks(s).map((x) => ({ label: L(x.t.title), kind: T("Aufgabe", "Task"), run: () => { s.projTab = "work"; s.projView = "board"; go(projRoute(x.p.id)); } })),
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
      const key = { commquery: "commQuery", filequery: "fileQuery", wsquery: "wsQuery", projquery: "projQuery", aiquery: "aiQuery" }[el.dataset.input];
      if (key) {
        s[key] = el.value;
        const pos = el.selectionStart;
        render();
        const n = app.querySelector(`[data-input="${el.dataset.input}"]`);
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
      if (e.key === "Escape" && s.acctOpen) { s.acctOpen = false; render({ focus: "[data-k=tb-acct]" }); return; }
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
      } else if (form.dataset.form === "post") {
        const c = s.route.id; const chans = CHANNELS[c] || [["allgemein", ""]]; const ch = chans.find((x) => x[0] === s.commChannel) ? s.commChannel : chans[0][0];
        s.commPosts = s.commPosts || {}; (s.commPosts[`${c}/${ch}`] = s.commPosts[`${c}/${ch}`] || []).push({ at: nowTime(), by: "Lena Vogt", text: [text, text] });
        render({ focus: "[data-k=post-input]" }); toast(T("Beitrag veröffentlicht.", "Post published."));
      } else if (form.dataset.form === "journal" || form.dataset.form === "memory") {
        const wid = form.dataset.id; s.wsd[wid] = s.wsd[wid] || JSON.parse(JSON.stringify(s.wsd._));
        if (form.dataset.form === "journal") s.wsd[wid].journal.unshift({ at: [`Heute, ${nowTime()}`, `Today, ${nowTime()}`], text: [text, text] });
        else s.wsd[wid].memory.unshift({ cat: "fact", used: 0, text: [text, text] });
        render({ focus: form.dataset.form === "journal" ? "[data-k=journal-input]" : "[data-k=mem-input]" }); toast(form.dataset.form === "journal" ? T("Eintrag hinzugefügt.", "Entry added.") : T("Gemerkt.", "Remembered."));
      } else if (form.dataset.form === "ai") {
        askAi("free", text);
      }
    });

    document.addEventListener("xyntal:lang", () => { renderStrip(); render(); });
    renderStrip();
    render();
    if (signedIn) loadBetaAccess().then((yes) => { if (yes) { betaTester = true; renderStrip(); render(); } });
  });
})();
