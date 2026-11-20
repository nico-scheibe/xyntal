// /admin – „Start“ und „Nutzer“: EINE Liste für alle Menschen.
// Führt per E-Mail zusammen, was vorher in drei Bereichen lag:
//   • App-Konten (App-Server, admin-platform.js → /admin/users)
//   • Website-Konten (Supabase, admin.js → lastData.members)
//   • Beta-Bewerbungen (Supabase, admin.js → lastData.beta)
// Ein Klick auf eine Zeile öffnet rechts die Person mit großen, klar benannten Knöpfen
// (Freischalten, Beta freischalten, Verifizieren, Sperren …). Jede Aktion wirkt auf alle
// Konten der Person, für die man Rechte hat; die Rechte prüfen Server und Supabase.
(() => {
  const SITE = window.XyntalAdminSite;
  const PLAT = window.XyntalAdminPlatform || null;
  const $ = (sel, root = document) => root.querySelector(sel);
  const startPanel = $('[data-panel="start"]');
  const peoplePanel = $('[data-panel="people"]');
  if (!SITE || !startPanel || !peoplePanel) return;

  const PAGE = 50;
  const P = {
    staff: false, siteAdmin: false, appOk: false,
    app: [], appError: "", appLimited: false, stats: null,
    rows: [], filter: "all", q: "", sort: "new", shown: PAGE,
    sel: new Set(), openKey: null, appDetailsOpen: false, lastFocus: null,
    fresh: null, lastVisit: 0,
  };
  // Letzter Besuch des Admin-Bereichs (nur in diesem Browser): „seit deinem letzten Besuch“
  // Ein Besuch endet nach einer Stunde ohne Aufruf; Neuladen zählt nicht als neuer Besuch.
  try {
    const now = Date.now(), saved = JSON.parse(localStorage.getItem("xa-visit") || "{}");
    const base = saved.at && now - saved.at > 3600000 ? saved.at : saved.base || 0;
    P.lastVisit = base; localStorage.setItem("xa-visit", JSON.stringify({ base, at: now }));
  } catch { /* privates Fenster */ }

  // ---------- Hilfen ----------
  const lc = (s) => String(s || "").trim().toLowerCase();
  const time = (s) => { const t = new Date(s || 0).getTime(); return Number.isFinite(t) ? t : 0; };
  const day = (iso) => (iso && time(iso) ? new Date(iso).toLocaleDateString("de-DE", { dateStyle: "medium" }) : "–");
  const when = (iso) => (iso && time(iso) ? new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "–");
  const initials = (name) => (String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  const pill = (text, tone = "") => `<span class="xa-pill${tone ? ` xa-pill-${tone}` : ""}">${esc(text)}</span>`;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const siteData = () => (typeof lastData !== "undefined" && lastData) || null;
  const ROLE = { owner: "Inhaber", admin: "Admin", moderator: "Moderator", support: "Support", analyst: "Analyst" };
  const can = (perm) => !!(PLAT && P.staff && PLAT.can(perm));
  // Fehler, deren Ausgang ungewiss ist: wird ohne das Wort "Nicht geklappt" gemeldet
  const neutral = (msg) => Object.assign(Error(msg), { neutral: true });
  const failText = (err) => (PLAT && err && (err.status || err.code) ? PLAT.reason(err) : (err && err.message) || "Das hat nicht geklappt.");

  // Dialog: der aus admin-platform.js; ohne ihn ein einfaches confirm/prompt
  async function ask(opts) {
    if (PLAT && PLAT.ask) return PLAT.ask(opts);
    if (!confirm(`${opts.title}\n\n${opts.text || ""}`)) return null;
    const out = {};
    for (const f of opts.fields || []) out[f.name] = f.type === "checkbox" ? false : f.type === "select" ? (f.value ?? f.options[0][0]) : f.type === "password" ? (prompt(f.label) || "") : (prompt(f.label) || "").trim();
    return out;
  }

  // ---------- Zusammenführen ----------
  // Schlüssel ist die E-Mail; wer keine hat, bekommt die ID seines Kontos.
  function buildRows(members, appUsers, beta) {
    const rows = [], byEmail = new Map(), bySite = new Map();
    const add = (row, email) => { rows.push(row); if (email && !byEmail.has(email)) byEmail.set(email, row); return row; };
    for (const m of members || []) {
      const email = lc(m.email);
      const row = add({ key: email ? `e:${email}` : `s:${m.id}`, site: m, app: null, beta: null }, email);
      bySite.set(m.id, row);
    }
    for (const u of appUsers || []) {
      const email = lc(u.email), hit = email && byEmail.get(email);
      if (hit && !hit.app) hit.app = u;
      else add({ key: email && !hit ? `e:${email}` : `a:${u.id}`, site: null, app: u, beta: null }, email);
    }
    // Bewerbungen kommen neueste zuerst; pro Person zählt die neueste
    for (const b of beta || []) {
      const email = lc(b.email);
      const hit = (b.user_id && bySite.get(b.user_id)) || (email && byEmail.get(email));
      if (hit) { if (!hit.beta) hit.beta = b; continue; }
      add({ key: email ? `e:${email}` : `b:${b.id}`, site: null, app: null, beta: b }, email);
    }
    for (const r of rows) r.v = view(r);
    return rows;
  }
  // Zweitkonto-Hinweis vom App-Server (/admin/users/new): gleiches Gerät wie ein älteres Konto
  function markAlts() {
    const map = new Map((P.fresh || []).map((u) => [u.id, u]));
    for (const r of P.rows) {
      const f = r.app && map.get(r.app.id);
      r.v.altOf = f ? f.altOf || [] : [];
      r.v.alt = r.v.altOf.length > 0;
    }
  }
  function view(r) {
    const a = r.app, m = r.site, b = r.beta;
    const appMuted = !!a && a.mutedUntil !== null && a.mutedUntil !== undefined;
    const dates = [a && a.createdAt, m && m.created_at, b && b.created_at].filter((d) => time(d));
    return {
      name: (a && a.displayName) || (m && m.name) || (b && b.name) || "(noch kein Name)",
      email: (a && a.email) || (m && (m.email || m.phone)) || (b && b.email) || "",
      handle: (a && a.handle) || "",
      created: dates.sort((x, y) => time(x) - time(y))[0] || null,
      pending: !!m && m.status === "pending",
      rejected: !!m && m.status === "rejected",
      betaOn: !!(m && m.is_beta_tester) || (!!b && b.status === "angenommen"),
      betaWaiting: !!b && (b.status === "neu" || b.status === "in_pruefung"),
      banned: !!((a && a.banned) || (m && m.banned)),
      bannedUntil: (a && a.banned && a.bannedUntil) || (m && m.banned && m.banned_until) || null,
      muted: appMuted, mutedUntil: appMuted ? a.mutedUntil : null,
      verified: !!((a && a.verified) || (m && m.is_verified)),
      team: a && a.staffRole ? ROLE[a.staffRole] || a.staffRole : m && m.is_admin ? "Website-Admin" : "",
      protected: !!((m && m.is_admin) || (a && a.staffRole === "owner")),
    };
  }

  const FILTERS = [
    ["all", "Alle", () => true],
    ["todo", "Warten auf dich", (r) => r.v.pending || r.v.betaWaiting],
    ["beta", "Beta-Tester", (r) => r.v.betaOn],
    ["applied", "Beta-Bewerbungen", (r) => !!r.beta],
    ["banned", "Gesperrt", (r) => r.v.banned],
    ["team", "Team", (r) => !!r.v.team],
    ["alt", "Mögliche Zweitkonten", (r) => !!r.v.alt],
  ];
  const filterFn = (key) => (FILTERS.find((f) => f[0] === key) || FILTERS[0])[2];
  function matches(r, q) {
    if (!q) return true;
    const b = r.beta || {}, m = r.site || {};
    return [r.v.name, r.v.email, r.v.handle && `@${r.v.handle}`, m.headline, b.project, b.why, b.admin_note]
      .join(" ").toLocaleLowerCase("de").includes(q);
  }
  function visibleRows() {
    const q = P.q.trim().toLocaleLowerCase("de"), f = filterFn(P.filter);
    const list = P.rows.filter((r) => f(r) && matches(r, q));
    if (P.sort === "name") list.sort((x, y) => x.v.name.localeCompare(y.v.name, "de"));
    else if (P.sort === "old") list.sort((x, y) => time(x.v.created) - time(y.v.created));
    else list.sort((x, y) => (y.v.pending || y.v.betaWaiting) - (x.v.pending || x.v.betaWaiting) || time(y.v.created) - time(x.v.created));
    return list;
  }
  const rowByKey = (key) => P.rows.find((r) => r.key === key);

  // ---------- Laden ----------
  async function loadApp(query = "") {
    if (!P.appOk) return;
    try {
      const list = await PLAT.listUsers(query);
      if (!query) { P.app = list; P.appLimited = list.length >= 300; }
      else { const known = new Set(P.app.map((u) => u.id)); P.app = P.app.concat(list.filter((u) => !known.has(u.id))); }
      P.appError = "";
    } catch (err) { P.appError = failText(err); }
  }
  async function loadFresh() {
    if (!P.appOk || !can("users.view")) { P.fresh = null; return; }
    try { P.fresh = (await PLAT.api("GET", "/admin/users/new?days=30")).users || []; }
    catch { P.fresh = null; } // älterer App-Server ohne diese Abfrage: dann ohne Zweitkonto-Erkennung
  }
  async function loadStats() {
    if (!P.staff) return;
    try { P.stats = (await PLAT.api("GET", "/admin/stats")).stats; } catch { P.stats = PLAT.stats ? PLAT.stats() : null; }
  }
  function rebuild() {
    const d = siteData();
    P.rows = buildRows(P.siteAdmin && d ? d.members : [], P.app, P.siteAdmin && d && Array.isArray(d.beta) ? d.beta : []);
    markAlts();
    for (const k of [...P.sel]) if (!rowByKey(k)) P.sel.delete(k);
  }
  async function refresh({ app = true, site = true } = {}) {
    await Promise.all([site && P.siteAdmin ? SITE.reload() : null, app ? loadApp() : null, app ? loadFresh() : null, loadStats()]);
    rebuild(); renderAll();
  }

  // ---------- Zeichnen ----------
  function renderAll() {
    renderCounts(); renderStart(); renderList();
    if (P.openKey) { const r = rowByKey(P.openKey); if (r) renderDrawer(r); else closeDrawer(); }
  }
  function todos() {
    const d = siteData() || {}, s = P.stats || {};
    const refs = d.invites && Array.isArray(d.invites.referrals) ? d.invites.referrals : [];
    const unmailed = P.siteAdmin && Array.isArray(d.beta) ? autoUnmailed(d.beta).length : 0;
    return [
      [P.rows.filter((r) => r.v.pending).length, "Personen warten auf Freischaltung", "Neue Website-Konten prüfen und freischalten.", { filter: "todo" }],
      [P.rows.filter((r) => r.v.betaWaiting).length, "Beta-Bewerbungen warten", "Lesen und mit einem Klick freischalten oder ablehnen.", { filter: "todo" }],
      [unmailed, "Status-Mails noch nicht verschickt", "Automatisch angenommene Beta-Tester wissen noch nichts davon.", { mail: true }],
      [can("tickets.handle") ? s.openTickets || 0 : 0, "Support-Tickets offen", "Fragen von Nutzern beantworten.", { tab: "support" }],
      [can("reports.handle") ? s.openReports || 0 : 0, "Meldungen offen", "Gemeldete Inhalte oder Personen prüfen.", { tab: "reports" }],
      [P.siteAdmin ? refs.filter((r) => "credited_at" in r && !r.credited_at).length : 0, "Einladungen nicht gutgeschrieben", "Bei den Karten unten unter „Einladungen“.", { tab: "cards" }],
    ].filter(([n]) => n > 0);
  }
  function renderCounts() {
    const set = (id, n) => { const el = document.getElementById(id); if (el) { el.textContent = n ? String(n) : ""; el.hidden = !n; } };
    const t = todos();
    set("c-start", t.reduce((n, x) => n + x[0], 0));
    set("c-people", P.rows.filter((r) => r.v.pending || r.v.betaWaiting).length);
    const s = P.stats || {};
  }

  // Info statt Aufgabe: wer neu ist. Mögliche Zweitkonten zählen nicht mit, sie stehen darunter.
  function newcomers() {
    const since = P.lastVisit || Date.now() - 7 * 86400000;
    const week = Date.now() - 7 * 86400000;
    const isNew = (r, t) => time(r.v.created) > t;
    const real = (t) => P.rows.filter((r) => isNew(r, t) && !r.v.alt);
    const alts = P.rows.filter((r) => isNew(r, week) && r.v.alt);
    const sinceVisit = real(since), inWeek = real(week);
    const list = [...inWeek].sort((x, y) => time(y.v.created) - time(x.v.created)).slice(0, 12);
    const label = P.lastVisit ? `seit deinem letzten Besuch (${when(new Date(P.lastVisit).toISOString())})` : "in den letzten 7 Tagen";
    return `<section class="xp-newbox" aria-labelledby="xp-new-h">
      <div class="xp-newhead"><b>${sinceVisit.length}</b><div><h2 id="xp-new-h">${sinceVisit.length === 1 ? "neuer Nutzer" : "neue Nutzer"} ${esc(label)}</h2>
        <p>In den letzten 7 Tagen ${plural(inWeek.length, "neue Person", "neue Personen")}${P.fresh ? "" : " (Zweitkonten werden erkannt, sobald der App-Server erreichbar ist)"}. Hier musst du nichts tun.</p></div></div>
      ${list.length ? `<ul class="xp-newlist">${list.map((r) => `<li><button type="button" data-xp-open="${esc(r.key)}">${person(r)}<span class="xp-date">${esc(when(r.v.created))}</span></button></li>`).join("")}</ul>` : ""}
      ${alts.length ? `<details class="xp-alts"><summary>${plural(alts.length, "mögliches Zweitkonto", "mögliche Zweitkonten")} nicht mitgezählt</summary>
        <p class="hint">Diese Konten wurden auf einem Gerät angelegt, das schon ein älteres Konto benutzt hat.</p>
        <ul class="xp-newlist">${alts.map((r) => `<li><button type="button" data-xp-open="${esc(r.key)}">${person(r)}<span class="xp-date">Gerät wie ${esc(r.v.altOf.map((a) => a.displayName || a.email || "älteres Konto").join(", "))}</span></button></li>`).join("")}</ul></details>` : ""}
    </section>`;
  }

  function renderStart() {
    const t = todos(), s = P.stats || {};
    const week = Date.now() - 7 * 86400000;
    const recent = [...P.rows].sort((x, y) => time(y.v.created) - time(x.v.created)).slice(0, 8);
    const confirmed = document.getElementById("overview-confirmed");
    startPanel.innerHTML = `
      <div class="xp-hello"><h1>Hallo! Das steht gerade an.</h1>
        <p>Klick auf eine Aufgabe und du landest direkt an der richtigen Stelle. Alle Menschen findest du unter <button type="button" class="xp-inline-link" data-xp-goto-filter="all">Nutzer</button>.</p></div>
      ${t.length ? `<div class="xp-todos">${t.map(([n, label, hint, go]) => `
        <button type="button" class="xp-todo" ${go.filter ? `data-xp-goto-filter="${go.filter}"` : go.tab ? `data-goto="${go.tab}"` : "data-xp-mail-auto"}>
          <b>${n}</b><span><strong>${esc(label)}</strong><small>${esc(go.mail ? `Klicken, um ${plural(n, "Mail", "Mails")} jetzt zu senden.` : hint)}</small></span><i aria-hidden="true">→</i></button>`).join("")}</div>`
        : `<div class="xp-alldone"><b>Alles erledigt.</b><span>Neue Aufgaben erscheinen hier von selbst.</span></div>`}
      <p class="admin-message" data-xp-start-msg role="status" aria-live="polite"></p>
      ${newcomers()}
      <h2 class="xp-h2">Auf einen Blick</h2>
      <div class="xp-numbers">
        ${num("Nutzer insgesamt", P.rows.length, "App und Website zusammen", "people", "all")}
        ${num("Beta-Tester", P.rows.filter((r) => r.v.betaOn).length, "dürfen die Beta nutzen", "people", "beta")}
        ${num("Neu in 7 Tagen", P.rows.filter((r) => time(r.v.created) > week && !r.v.alt).length, "ohne mögliche Zweitkonten", "people", "all")}
        ${num("Gesperrt", P.rows.filter((r) => r.v.banned).length, "können sich nicht anmelden", "people", "banned")}
        ${P.siteAdmin ? `<article class="xp-num"><b id="overview-confirmed">${confirmed ? esc(confirmed.textContent) : "–"}</b><span>Bestätigte Warteliste</span><small>aus Brevo</small></article>` : ""}
        ${P.staff ? `<article class="xp-num"><b>${Number(s.activeSessions || 0).toLocaleString("de-DE")}</b><span>Gerade angemeldet</span><small>aktive Sitzungen in der App</small></article>` : ""}
      </div>
      ${P.siteAdmin ? `<p class="hint" id="overview-updated" role="status">Brevo-Zahl wird geladen …</p>` : ""}
      <h2 class="xp-h2">Zuletzt dazugekommen</h2>
      ${recent.length ? `<div class="table-wrap"><table class="xp-table xp-table-compact"><tbody>${recent.map((r) => `
        <tr data-xp-open="${esc(r.key)}" tabindex="0" class="xa-clickable"><td>${person(r)}</td><td>${statusPills(r)}</td><td class="xp-date">${esc(day(r.v.created))}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="xa-empty">Noch niemand da.</p>`}
      <div class="row-actions xp-links">
        ${P.siteAdmin ? `<a class="text-link" href="https://app.brevo.com/contact/list-listing/id/3" target="_blank" rel="noopener">Warteliste in Brevo ↗</a>` : ""}
      </div>`;
    if (P.siteAdmin && typeof refreshConfirmedCount === "function") refreshConfirmedCount();
  }
  const num = (label, n, hint, tab, filter) => `<button type="button" class="xp-num" data-xp-goto-filter="${filter}"><b>${Number(n).toLocaleString("de-DE")}</b><span>${esc(label)}</span><small>${esc(hint)}</small></button>`;

  function person(r) {
    return `<div class="xa-person"><span class="admin-avatar" aria-hidden="true">${esc(initials(r.v.name))}</span><div><b>${esc(r.v.name)}</b>${r.v.handle ? ` <small>@${esc(r.v.handle)}</small>` : ""}<br><small>${esc(r.v.email || "keine E-Mail")}</small></div></div>`;
  }
  function statusPills(r) {
    const v = r.v, out = [];
    if (v.pending) out.push(pill("Wartet auf Freischaltung", "warn"));
    if (v.rejected) out.push(pill("Abgelehnt", "danger"));
    if (v.banned) out.push(pill(v.bannedUntil ? `Gesperrt bis ${day(v.bannedUntil)}` : "Gesperrt", "danger"));
    if (v.muted) out.push(pill(v.mutedUntil ? `Stumm bis ${day(v.mutedUntil)}` : "Stumm", "warn"));
    if (v.team) out.push(pill(v.team, "accent"));
    if (v.alt) out.push(pill("Mögliches Zweitkonto", "warn"));
    if (v.verified) out.push(pill("Verifiziert", "ok"));
    if (!out.length) out.push(pill(r.site || r.app ? "Aktiv" : "Nur Bewerbung"));
    return out.join(" ");
  }
  function betaPill(r) {
    if (r.v.betaOn) return pill("Freigeschaltet", "ok");
    if (r.beta) return pill(`Bewerbung: ${BETA_STATUS[r.beta.status] || r.beta.status}`, r.v.betaWaiting ? "warn" : "");
    return `<span class="xp-none">–</span>`;
  }
  function accountPills(r) {
    return [r.app ? pill("App") : "", r.site ? pill("Website") : ""].filter(Boolean).join(" ") || `<span class="xp-none">kein Konto</span>`;
  }
  function quickAction(r) {
    if (r.v.pending && P.siteAdmin) return ["approve", "Freischalten"];
    if (r.v.betaWaiting && P.siteAdmin) return ["beta-on", "Beta freischalten"];
    return ["open", "Öffnen"];
  }

  function renderList() {
    if (!peoplePanel.querySelector("[data-xp-list]")) {
      peoplePanel.innerHTML = `
        <div class="xp-head"><div><h1>Nutzer</h1><p class="hint">Alle Menschen an einem Ort – App-Konten, Website-Konten und Beta-Bewerbungen. Klick auf eine Person, um sie freizuschalten, für die Beta freizugeben, zu verifizieren oder zu sperren.</p></div>
          <div class="row-actions"><button type="button" data-xp-refresh>Aktualisieren</button><button type="button" data-xp-csv>Liste als CSV</button></div></div>
        <div class="xp-toolbar">
          <label class="xp-search"><span class="sr-only">Suchen</span><input type="search" data-xp-search placeholder="Suchen: Name, E-Mail oder @handle" autocomplete="off"></label>
          <label class="xp-sort">Sortieren<select data-xp-sort><option value="new">Wichtiges zuerst</option><option value="old">Älteste zuerst</option><option value="name">Name A–Z</option></select></label>
        </div>
        <div class="xp-filters" role="group" aria-label="Filter" data-xp-filters></div>
        <div class="xp-bulk" data-xp-bulk hidden></div>
        <p class="admin-message" data-xp-msg role="status" aria-live="polite"></p>
        <div data-xp-notes></div>
        <div data-xp-list></div>`;
    }
    const search = $("[data-xp-search]", peoplePanel);
    if (document.activeElement !== search) search.value = P.q;
    $("[data-xp-sort]", peoplePanel).value = P.sort;
    $("[data-xp-filters]", peoplePanel).innerHTML = FILTERS.map(([key, label, fn]) => {
      const n = P.rows.filter(fn).length;
      return `<button type="button" data-xp-filter="${key}" aria-pressed="${P.filter === key}" class="${key === "todo" && n ? "has-todo" : ""}">${esc(label)} <b>${n}</b></button>`;
    }).join("");
    const notes = [];
    if (P.appError) notes.push(`App-Konten konnten nicht geladen werden: ${P.appError}`);
    if (!P.appOk && P.siteAdmin) notes.push("App-Konten fehlen in der Liste, weil dein Konto auf dem App-Server keine Staff-Rolle mit Nutzerrechten hat.");
    if (!P.siteAdmin && P.staff) notes.push("Website-Konten und Beta-Bewerbungen fehlen, weil dein Website-Konto keine Admin-Rechte hat.");
    if (P.appLimited && !P.q) notes.push("Es werden die neuesten 300 App-Konten gezeigt. Die Suche findet auch ältere.");
    $("[data-xp-notes]", peoplePanel).innerHTML = notes.map((t) => `<p class="notice">${esc(t)}</p>`).join("");

    const list = visibleRows(), shown = list.slice(0, P.shown);
    const box = $("[data-xp-list]", peoplePanel);
    box.innerHTML = list.length ? `
      <div class="table-wrap"><table class="xp-table">
        <thead><tr><th class="xp-pick"><input type="checkbox" data-xp-pick-all aria-label="Alle sichtbaren auswählen"></th><th>Person</th><th>Status</th><th>Beta</th><th>Konten</th><th>Dabei seit</th><th><span class="sr-only">Aktion</span></th></tr></thead>
        <tbody>${shown.map((r) => { const [act, label] = quickAction(r); return `
          <tr data-xp-open="${esc(r.key)}" tabindex="0" class="xa-clickable${P.openKey === r.key ? " is-open" : ""}">
            <td class="xp-pick"><input type="checkbox" data-xp-pick="${esc(r.key)}" ${P.sel.has(r.key) ? "checked" : ""} aria-label="${esc(r.v.name)} auswählen"></td>
            <td>${person(r)}</td><td>${statusPills(r)}</td><td>${betaPill(r)}</td><td>${accountPills(r)}</td>
            <td class="xp-date">${esc(day(r.v.created))}</td>
            <td class="xp-quick"><button type="button" data-xp-quick="${act}" data-key="${esc(r.key)}" class="${act === "open" ? "" : "xp-primary"}">${esc(label)}</button></td>
          </tr>`; }).join("")}</tbody></table></div>
      <div class="xp-more"><span>${shown.length} von ${list.length} ${list.length === 1 ? "Person" : "Personen"}</span>${list.length > shown.length ? `<button type="button" data-xp-more>Weitere ${Math.min(PAGE, list.length - shown.length)} anzeigen</button>` : ""}</div>`
      : `<div class="admin-empty"><span aria-hidden="true">◇</span><h3>${P.rows.length ? "Niemand passt dazu" : "Noch keine Nutzer"}</h3><p>${P.rows.length ? "Ändere die Suche oder wähle oben „Alle“." : "Sobald sich jemand anmeldet oder bewirbt, erscheint die Person hier."}</p></div>`;
    renderBulk(list);
  }
  function renderBulk(list = visibleRows()) {
    const bar = $("[data-xp-bulk]", peoplePanel); if (!bar) return;
    const picked = P.rows.filter((r) => P.sel.has(r.key));
    bar.hidden = !picked.length;
    const canApprove = P.siteAdmin && picked.some((r) => r.v.pending);
    const canBeta = P.siteAdmin && picked.some((r) => !r.v.betaOn && (r.beta || r.site));
    bar.innerHTML = picked.length ? `<span><b>${picked.length}</b> ausgewählt</span>
      ${canApprove ? `<button type="button" class="xp-primary" data-xp-bulk="approve">Freischalten</button>` : ""}
      ${canBeta ? `<button type="button" class="xp-primary" data-xp-bulk="beta-on">Beta freischalten</button>` : ""}
      <button type="button" data-xp-bulk="mail">E-Mail an Auswahl</button>
      <button type="button" data-xp-bulk="csv">Auswahl als CSV</button>
      <button type="button" data-xp-bulk="clear">Auswahl aufheben</button>` : "";
    const all = $("[data-xp-pick-all]", peoplePanel);
    if (all) { const vis = list.slice(0, P.shown).map((r) => r.key); all.checked = vis.length > 0 && vis.every((k) => P.sel.has(k)); all.indeterminate = !all.checked && vis.some((k) => P.sel.has(k)); }
  }
  const listMsg = (text, ok = true) => { const m = $("[data-xp-msg]", peoplePanel); if (m) { m.textContent = text; m.classList.toggle("is-error", !ok); } };

  // ---------- Person rechts (Schublade) ----------
  const drawer = document.createElement("div");
  drawer.className = "xp-drawer-wrap"; drawer.hidden = true;
  drawer.innerHTML = `<div class="xp-backdrop" data-xp-close></div><aside class="xp-drawer" role="dialog" aria-modal="true" aria-labelledby="xp-drawer-title" data-no-i18n><div data-xp-drawer></div></aside>`;
  document.body.append(drawer);
  const DOCK = matchMedia("(min-width:1400px)");
  // Andere Seite gewählt: eine angedockte Person schließen, damit sie nicht über fremden Inhalten steht
  new MutationObserver(() => { if (peoplePanel.hidden && document.body.classList.contains("xp-docked") && P.openKey) closeDrawer(); })
    .observe(peoplePanel, { attributes: true, attributeFilter: ["hidden"] });
  // Fenster schmaler oder breiter: neu öffnen, damit angedockt/Schublade passt
  DOCK.addEventListener?.("change", () => { if (P.openKey) { const k = P.openKey; closeDrawer(); openDrawer(k); } });
  const drawerBody = $("[data-xp-drawer]", drawer);
  const drawerMsg = (text, ok = true) => { const m = $("[data-xp-dmsg]", drawer); if (m) { m.textContent = text; m.classList.toggle("is-error", !ok); } };

  function actionsFor(r) {
    const v = r.v, a = r.app, m = r.site, b = r.beta, out = [];
    const me = PLAT && PLAT.me && a && PLAT.me() && PLAT.me().id === a.id;
    const add = (act, label, hint, tone = "") => out.push(`<button type="button" class="xp-action ${tone}" data-xp-act="${act}"><b>${esc(label)}</b><small>${esc(hint)}</small></button>`);
    if (P.siteAdmin && m && v.pending) { add("approve", "Freischalten", "Darf die Website ab sofort voll nutzen.", "is-primary"); add("reject", "Ablehnen", "Konto bleibt, wird aber nicht freigeschaltet."); }
    if (P.siteAdmin && m && v.rejected) add("approve", "Doch freischalten", "Die Ablehnung zurücknehmen.");
    if (P.siteAdmin && (b || m)) {
      if (!v.betaOn) add("beta-on", "Beta freischalten", b ? "Nimmt die Bewerbung an, schickt eine Mail und schaltet die Downloads frei." : "Gibt Zugang zur Beta und den Desktop-Downloads.", v.betaWaiting ? "is-primary" : "");
      else add("beta-off", "Beta entziehen", "Kein Zugang mehr zur Beta, ohne Mail.");
    }
    const canVerify = (a && can("users.verify")) || (m && P.siteAdmin);
    if (canVerify) add("verify", v.verified ? "Verifizierung entfernen" : "Verifizieren", v.verified ? "Der Haken am Profil verschwindet." : "Zeigt einen Haken am Profil: echte, geprüfte Person.");
    const canBan = !me && !v.protected && ((a && can("users.ban")) || (m && P.siteAdmin));
    if (canBan) v.banned ? add("unban", "Entsperren", "Kann sich wieder anmelden und schreiben.") : add("ban", "Sperren", "Kann sich nicht mehr anmelden. Du wählst, wie lange.", "is-danger");
    if (a && can("users.ban") && !me && !v.protected) v.muted ? add("unmute", "Stummschaltung aufheben", "Darf wieder schreiben.") : add("mute", "Stummschalten", "Kann lesen, aber nichts mehr schreiben.");
    if (v.email && v.email.includes("@")) out.push(`<a class="xp-action" href="mailto:${esc(v.email)}?subject=${encodeURIComponent("Dein Xyntal-Konto")}"><b>E-Mail schreiben</b><small>Öffnet dein Mailprogramm.</small></a>`);
    if (m) out.push(`<a class="xp-action" href="nachrichten?an=${esc(m.id)}"><b>Nachricht senden</b><small>Direkt hier auf Xyntal.</small></a>`);
    return out.join("");
  }

  // Wunsch-Link (xyntal.com/name) der Karte dieser Person: über das Website-Konto oder die E-Mail
  function cardOf(r) {
    const d = siteData(); if (!P.siteAdmin || !d || !Array.isArray(d.cards)) return null;
    const email = lc(r.v.email);
    return d.cards.find((c) => r.site && c.user_id === r.site.id) || (email ? d.cards.find((c) => lc(c.email) === email) : null) || null;
  }
  function wishLinkSection(r) {
    const c = cardOf(r); if (!c) return "";
    return `<section class="xp-dsec"><h3>Wunsch-Link</h3>
      <div class="handle-edit"><span>xyntal.com/</span><input type="text" maxlength="20" value="${esc(c.handle || "")}" data-xp-handle aria-label="Wunsch-Link" autocapitalize="off" spellcheck="false"></div>
      <div class="row-actions"><button type="button" data-xp-act="handle-save">Speichern</button>${c.handle ? `<button type="button" data-xp-act="handle-free">Freigeben</button><a class="text-link" href="/${esc(c.handle)}" target="_blank" rel="noopener">Öffnen ↗</a>` : ""}</div>
      <p class="hint">${c.is_public ? "Die Karte ist unter dem Link öffentlich sichtbar." : "Unter dem Link steht nur „reserviert“, bis die Person ihre Karte öffentlich macht."}</p>
    </section>`;
  }

  // Seitenbilder eines Mitglieds: ZWEI getrennte Speicher, je mit eigenem Zustand und eigenem Weg zum Entfernen.
  //   1) Supabase-Speicher (Eimer page-media): Dateien, die das Mitglied über den Editor hochgeladen hat.
  //   2) Eigener Server-Speicher (Pfad s/<konto>/<datei>, Auslieferung über /media/…): die Dateien, die Admins und
  //      Mitglieder auf den eigenen Server laden. Die Routen dort prüfen die Admin-Berechtigung in der Datenbank.
  // Entfernen löscht die Datei nur in dem Speicher, in dem sie liegt. Die Seite des Mitglieds wird NICHT geändert.
  // Fällt ein Speicher aus, zeigt die Box dieses Speichers den Grund. Der andere Speicher bleibt sichtbar.
  function pageMediaSection(m) {
    return `<section class="xp-dsec" data-xp-media-section data-member="${esc(m.id)}"><h3>Seitenbilder</h3>
      <p class="hint">Die Seitenbilder dieses Mitglieds liegen in zwei getrennten Speichern. Entfernen löscht die Datei nur in dem Speicher, in dem sie liegt. Die Seite des Mitglieds wird dabei nicht geändert. Sie kann danach an dieser Stelle leer sein.</p>
      <h4>Supabase-Speicher</h4>
      <div data-xp-media-box><p class="hint">Wird geladen …</p></div>
      <h4>Eigener Server-Speicher</h4>
      <div data-xp-media-server><p class="hint">Wird geladen …</p></div>
    </section>`;
  }
  // Einheitlicher Hinweis in einer Box (ohne Löschknöpfe)
  const setNote = (box, text) => { box.innerHTML = `<p class="notice">${esc(text)}</p>`; };
  // Anmeldung für die Server-Routen: dasselbe Token wie beim Editor
  async function authHeaders() {
    const { data: { session } } = await sb.auth.getSession();
    return { Authorization: `Bearer ${session ? session.access_token : ""}` };
  }

  // Liest ALLE Dateien des Mitglieds seitenweise ein (je 100) und zeichnet die Liste in die Box. Ist die Box inzwischen
  // weg, passiert nichts. Fängt alle Fehler selbst ab: die Box zeigt dann den Fehler, der Aufrufer muss nichts tun.
  // Seitenwechsel statt limit 1000: Ein fester Grenzwert würde ab 1001 Dateien stillschweigend Dateien verschweigen.
  // Schutz gegen Endlosschleife: höchstens 100 Seiten (10.000 Dateien). Wird das erreicht, zeigt die Box einen Hinweis.
  async function loadPageMedia(memberId, box) {
    try {
      // Zuerst der SERVER: Die Regel auf storage.objects entscheidet nach is_admin() (Konto nicht gesperrt, zweiter Faktor
      // in dieser Sitzung). Das kann vom Feld profiles.is_admin abweichen. Dann liefert list() eine LEERE, FEHLERFREIE
      // Antwort. Eine leere Liste darf deshalb nur dann "nichts vorhanden" heißen, wenn is_admin() wahr ist.
      const admin = unwrap(await sb.rpc("is_admin"));
      if (admin !== true) {
        box.innerHTML = `<p class="notice">Die Seitenbilder sind hier nicht einsehbar: Der Server bestätigt deine Admin-Berechtigung in dieser Sitzung nicht. Das passiert, wenn dein Konto gesperrt ist oder in dieser Sitzung der zweite Faktor fehlt. Ob Seitenbilder vorhanden sind, lässt sich deshalb hier nicht feststellen.</p>`;
        return;
      }
      const PAGE_SIZE = 100, MAX_PAGES = 100;
      const files = [];
      let lastFull = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const batch = unwrap(await sb.storage.from("page-media").list(memberId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })) || [];
        files.push(...batch.filter((f) => f.id));
        lastFull = batch.length === PAGE_SIZE;
        if (!lastFull) break;
      }
      // Abgeschnitten ist die Liste nur, wenn an der Stelle nach der letzten Seite noch etwas steht. Genau 10.000 Dateien
      // sind vollständig; deshalb wird nachgesehen, statt die Grenze allein zu melden.
      let truncated = false;
      if (lastFull) {
        const more = unwrap(await sb.storage.from("page-media").list(memberId, { limit: PAGE_SIZE, offset: MAX_PAGES * PAGE_SIZE })) || [];
        truncated = more.some((f) => f.id);
      }
      if (!box.isConnected) return;
      if (!files.length) { box.innerHTML = `<p class="hint">Keine Seitenbilder im Supabase-Speicher (geprüft: deine Admin-Berechtigung ist bestätigt).</p>`; return; }
      const items = files.map((f) => {
        const path = `${memberId}/${f.name}`;
        const url = sb.storage.from("page-media").getPublicUrl(path).data.publicUrl;
        const media = /\.(mp4|webm)$/i.test(f.name)
          ? `<video src="${esc(url)}" width="160" controls muted preload="metadata"></video>`
          : `<img src="${esc(url)}" width="160" alt="" loading="lazy">`;
        return `<div>${media}<div class="row-actions"><span class="hint">${esc(f.name)}</span><button type="button" class="admin-danger" data-xp-act="media-delete" data-path="${esc(path)}">Entfernen</button></div></div>`;
      }).join("");
      const hint = truncated ? `<p class="notice">Die Liste ist abgeschnitten: Es gibt mehr als ${MAX_PAGES * PAGE_SIZE} Dateien. Die übrigen sind hier nicht zu sehen.</p>` : "";
      box.innerHTML = items + hint;
    } catch (err) {
      if (box.isConnected) setNote(box, `Die Seitenbilder im Supabase-Speicher konnten nicht geladen werden: ${failText(err)}`);
    }
  }

  // Dateien im eigenen Server-Speicher. Eine leere Liste heißt nur dann "keine", wenn der Server 200 geantwortet hat.
  // 503 (nicht eingerichtet), 403 (Berechtigung in der Datenbank nicht bestätigt) und jeder andere Fehler sind eigene Hinweise.
  async function loadServerMedia(memberId, box) {
    try {
      const r = await fetch(`/api/page-media/${encodeURIComponent(memberId)}`, { headers: await authHeaders() });
      if (!box.isConnected) return;
      if (r.status === 503) return setNote(box, "Der eigene Server-Speicher ist auf dem Server nicht eingerichtet (503). Seine Seitenbilder sind hier nicht erreichbar. Ob welche vorhanden sind, lässt sich deshalb nicht feststellen.");
      if (r.status === 403) return setNote(box, "Die Seitenbilder im eigenen Server-Speicher sind hier nicht einsehbar: Der Server bestätigt deine Admin-Berechtigung in dieser Sitzung nicht. Ob welche vorhanden sind, lässt sich deshalb nicht feststellen.");
      if (r.status === 401) return setNote(box, "Die Anmeldung ist abgelaufen. Bitte lade die Seite neu.");
      if (!r.ok) return setNote(box, `Der eigene Server-Speicher ist gerade nicht erreichbar (Status ${r.status}). Ob Seitenbilder vorhanden sind, lässt sich deshalb nicht feststellen.`);
      const body = await r.json();
      if (!body || !Array.isArray(body.files)) throw new Error("unerwartete Antwort des Servers");
      if (!body.files.length) { box.innerHTML = `<p class="hint">Keine Seitenbilder im eigenen Server-Speicher.</p>`; return; }
      const cut = body.truncated === true ? `<p class="notice">Die Liste ist abgeschnitten: Es gibt mehr Dateien, als der Server auf einmal liefert. Die übrigen sind hier nicht zu sehen.</p>` : "";
      box.innerHTML = body.files.map((f) => {
        const url = `/media/${memberId}/${f.name}`;
        const media = /\.(mp4|webm)$/i.test(f.name)
          ? `<video src="${esc(url)}" width="160" controls muted preload="metadata"></video>`
          : `<img src="${esc(url)}" width="160" alt="" loading="lazy">`;
        return `<div>${media}<div class="row-actions"><span class="hint">${esc(f.name)}</span><button type="button" class="admin-danger" data-xp-act="media-server-delete" data-konto="${esc(memberId)}" data-path="${esc(f.name)}">Entfernen</button></div></div>`;
      }).join("") + cut;
    } catch (err) {
      if (box.isConnected) setNote(box, `Der eigene Server-Speicher ist nicht erreichbar: ${failText(err)}. Ob Seitenbilder vorhanden sind, lässt sich deshalb nicht feststellen.`);
    }
  }

  // Beide Speicher neu laden. Beide Loader fangen ihre Fehler selbst ab, diese Funktion wirft nicht.
  // Schreibt NUR in den Ausklapp dieses Mitglieds. Gehört der offene Ausklapp inzwischen einer anderen Person (oder ist
  // er zu), passiert nichts: Dateien einer Person dürfen nie unter dem Namen einer anderen erscheinen.
  async function loadMedia(memberId) {
    const sec = $("[data-xp-media-section]", drawer);
    if (!sec || sec.dataset.member !== memberId) return;
    const b1 = $("[data-xp-media-box]", sec), b2 = $("[data-xp-media-server]", sec);
    await Promise.all([b1 ? loadPageMedia(memberId, b1) : null, b2 ? loadServerMedia(memberId, b2) : null]);
  }

  function renderDrawer(r) {
    const v = r.v, a = r.app, m = r.site, b = r.beta;
    const link = b && /^https?:\/\//i.test(b.link || "") ? b.link : "";
    const facts = [
      ["Dabei seit", day(v.created)],
      m ? ["Website-Konto", `${statusLabel[m.status] || m.status}${m.provider && m.provider !== "email" ? ` · Anmeldung über ${PROVIDER_LABELS[m.provider] || m.provider}` : ""}${m.is_public ? " · Profil öffentlich" : ""}`] : ["Website-Konto", "keins"],
      a ? ["App-Konto", `${a.handle ? `@${a.handle} · ` : ""}${a.staffRole ? ROLE[a.staffRole] || a.staffRole : "Mitglied"} · ${Number(a.activeSessions || 0)} aktive Sitzung${Number(a.activeSessions) === 1 ? "" : "en"}`] : ["App-Konto", "keins"],
      m && (m.headline || m.phase || m.category) ? ["Vorhaben", [m.headline, PHASES[m.phase], m.category].filter(Boolean).join(" · ")] : null,
      v.banned ? ["Gesperrt", v.bannedUntil ? `bis ${when(v.bannedUntil)}` : "unbefristet"] : null,
    ].filter(Boolean);
    const danger = [
      m && P.siteAdmin && !m.is_admin ? `<button type="button" class="admin-danger" data-xp-act="delete-site">Website-Konto löschen</button>` : "",
      a && can("users.delete") && a.staffRole !== "owner" && !(PLAT.me() && PLAT.me().id === a.id) ? `<button type="button" class="admin-danger" data-xp-act="delete-app">App-Konto löschen</button>` : "",
      b && P.siteAdmin ? `<button type="button" class="admin-danger" data-xp-act="delete-beta">Beta-Bewerbung löschen</button>` : "",
    ].filter(Boolean).join("");
    drawerBody.innerHTML = `
      <header class="xp-dhead">
        <span class="admin-avatar xp-avatar-lg" aria-hidden="true">${esc(initials(v.name))}</span>
        <div><h2 id="xp-drawer-title">${esc(v.name)}</h2><p>${esc(v.email || "keine E-Mail")}${v.handle ? ` · @${esc(v.handle)}` : ""}</p></div>
        <button type="button" class="xa-close" data-xp-close aria-label="Schließen">×</button>
      </header>
      <div class="xa-badges">${statusPills(r)} ${v.betaOn ? pill("Beta-Tester", "ok") : ""}</div>
      <p class="admin-message" data-xp-dmsg role="status" aria-live="polite"></p>
      <section class="xp-dsec"><h3>Was möchtest du tun?</h3><div class="xp-actions">${actionsFor(r) || `<p class="hint">Für diese Person hast du keine Aktionen.</p>`}</div></section>
      ${b ? `<section class="xp-dsec"><h3>Beta-Bewerbung</h3>
        <div class="xp-beta-top"><label>Stand der Bewerbung<select data-xp-beta-status ${P.siteAdmin ? "" : "disabled"}>${Object.entries(BETA_STATUS).map(([k, l]) => `<option value="${k}" ${b.status === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          ${STATUS_MAILABLE.has(b.status) && P.siteAdmin ? `<button type="button" data-xp-act="beta-mail">Status-Mail ${b.mailed_status === b.status ? "erneut " : ""}senden</button>` : ""}</div>
        <p class="hint">Wenn du den Stand änderst, bekommt die Person automatisch eine Mail (außer bei „Neu“).</p>
        <ul class="xa-kv">
          <li><span>Bereich</span><b>${esc(BETA_FOCUS[b.focus] || b.focus || "–")}</b></li>
          <li><span>Zeit</span><b>${esc(BETA_HOURS[b.hours] || b.hours || "–")}</b></li>
          <li><span>Eingegangen</span><b>${esc(when(b.created_at))}</b></li>
          <li><span>Status-Mail</span><b>${b.mailed_status ? `„${esc(BETA_STATUS[b.mailed_status] || b.mailed_status)}“ am ${esc(when(b.mailed_at))}` : "noch keine"}</b></li>
        </ul>
        ${b.status === "neu" && b.auto_review_note && !b.review_locked ? `<p class="notice">Automatische Prüfung: ${esc(b.auto_review_note)}</p>` : ""}
        ${autoAccepted(b) ? `<p class="hint">Automatisch angenommen am ${esc(when(b.auto_accepted_at))}.</p>` : ""}
        <h4>Woran arbeitet die Person?</h4><p class="xp-text">${esc(b.project || "Noch kein konkretes Projekt genannt.")}</p>
        <h4>Warum will sie mitmachen?</h4><p class="xp-text">${esc(b.why || "–")}</p>
        ${link ? `<p><a class="text-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow">Projekt / Profil öffnen ↗</a></p>` : ""}
        ${P.siteAdmin ? `<label class="xp-note">Interne Notiz (sieht nur das Team)<textarea data-xp-beta-note maxlength="2000" rows="3" placeholder="Gespräch, nächste Schritte oder Rückfragen …">${esc(b.admin_note || "")}</textarea></label><button type="button" data-xp-act="beta-note">Notiz speichern</button>` : ""}
      </section>` : ""}
      ${v.alt ? `<p class="notice">Mögliches Zweitkonto: angelegt auf demselben Gerät wie ${esc(v.altOf.map((x) => x.displayName || x.email || "ein älteres Konto").join(", "))}.</p>` : ""}
      ${wishLinkSection(r)}
      ${m && P.siteAdmin ? pageMediaSection(m) : ""}
      <section class="xp-dsec"><h3>Über die Person</h3><ul class="xa-kv">${facts.map(([k, val]) => `<li><span>${esc(k)}</span><b>${esc(val)}</b></li>`).join("")}</ul></section>
      ${a && can("users.view") ? `<details class="xp-dsec xp-more-details" data-xp-app-details ${P.appDetailsOpen ? "open" : ""}><summary>Mehr zum App-Konto <small>Sitzungen, Verwarnungen, Rolle, KI-Guthaben, Notizen</small></summary><div data-xp-app-box></div></details>` : ""}
      ${danger ? `<details class="xp-dsec xp-danger-zone"><summary>Gefahrenzone <small>Löschen lässt sich nicht rückgängig machen</small></summary><div class="row-actions">${danger}</div></details>` : ""}`;
    if (m && P.siteAdmin) loadMedia(m.id); // fängt seine Fehler selbst ab, wirft nicht
    const det = $("[data-xp-app-details]", drawer);
    if (det) {
      const show = () => PLAT.showUser(a.id, $("[data-xp-app-box]", drawer), { onChange: () => refresh({ site: false }), notify: drawerMsg });
      det.addEventListener("toggle", () => { P.appDetailsOpen = det.open; if (det.open) show(); });
      if (det.open) show();
    }
  }
  function openDrawer(key) {
    const r = rowByKey(key); if (!r) return;
    if (P.openKey !== key) P.appDetailsOpen = false;
    P.lastFocus = document.activeElement; P.openKey = key;
    // Breiter Bildschirm auf „Nutzer“: Person fest rechts neben der Liste wie in der App, sonst Schublade über allem
    const docked = !peoplePanel.hidden && DOCK.matches;
    document.body.classList.toggle("xp-docked", docked);
    $(".xp-drawer", drawer).setAttribute("aria-modal", String(!docked));
    renderDrawer(r); drawer.hidden = false; if (!docked) document.body.classList.add("xp-locked");
    peoplePanel.querySelectorAll("tr.is-open").forEach((t) => t.classList.remove("is-open"));
    $(".xa-close", drawer).focus();
  }
  function closeDrawer() {
    P.openKey = null; drawer.hidden = true; document.body.classList.remove("xp-locked", "xp-docked");
    peoplePanel.querySelectorAll("tr.is-open").forEach((t) => t.classList.remove("is-open"));
    if (P.lastFocus && P.lastFocus.isConnected) P.lastFocus.focus();
  }

  // ---------- Aktionen ----------
  const rpc = async (fn, args) => unwrap(await sb.rpc(fn, args));
  const BAN_TIMES = [["1440", "1 Tag"], ["10080", "7 Tage"], ["43200", "30 Tage"], ["", "Für immer (bis du entsperrst)"]];

  // Führt eine Aktion für eine Person aus und gibt den Text für die Erfolgsmeldung zurück (null = abgebrochen)
  async function act(r, kind, el) {
    const v = r.v, a = r.app, m = r.site, b = r.beta;
    const appId = a && encodeURIComponent(a.id);
    switch (kind) {
      case "handle-save": case "handle-free": {
        const c = cardOf(r); if (!c) return null;
        const input = $("[data-xp-handle]", drawer);
        const value = kind === "handle-free" ? null : lc(input && input.value);
        if (value !== null && !HANDLE_RE.test(value)) throw Error("Wunsch-Link: 3–20 Zeichen, Kleinbuchstaben, Zahlen, - und _, beginnt mit Buchstabe oder Zahl.");
        if (value === null && !(await ask({ title: `xyntal.com/${c.handle} freigeben?`, text: "Danach kann jemand anderes diesen Link wählen.", confirm: "Freigeben", danger: true }))) return null;
        try {
          const changed = unwrap(await sb.from("waitlist_cards").update({ handle: value }).eq("id", c.id).select("id,handle"));
          if (!changed.length) throw Error("Karte nicht mehr vorhanden oder keine Berechtigung.");
        } catch (err) { if (/duplicate|unique/i.test(err.message)) throw Error(`xyntal.com/${value} ist schon vergeben.`); throw err; }
        return value ? `Wunsch-Link xyntal.com/${value} gespeichert.` : "Wunsch-Link freigegeben.";
      }
      case "approve": await rpc("admin_set_status", { p_id: m.id, p_status: "approved" }); return `${v.name} ist freigeschaltet.`;
      case "reject": {
        if (!(await ask({ title: `${v.name} ablehnen?`, text: "Das Konto bleibt bestehen, wird aber nicht freigeschaltet. Du kannst das später ändern.", confirm: "Ablehnen", danger: true }))) return null;
        await rpc("admin_set_status", { p_id: m.id, p_status: "rejected" }); return `${v.name} ist abgelehnt.`;
      }
      case "beta-on":
        if (b) return `${v.name}: ${await setBetaStatus(b.id, "angenommen")}`;
        await rpc("admin_set_beta_tester", { p_id: m.id, p_is_beta_tester: true }); return `${v.name} ist jetzt Beta-Tester.`;
      case "beta-off": {
        if (!(await ask({ title: `Beta für ${v.name} entziehen?`, text: "Die Person verliert den Zugang zur Beta und zu den Desktop-Downloads. Es wird keine Mail verschickt.", confirm: "Beta entziehen", danger: true }))) return null;
        if (b && b.status === "angenommen") await setBetaStatus(b.id, "warteliste", { mail: false });
        if (m) await rpc("admin_set_beta_tester", { p_id: m.id, p_is_beta_tester: false });
        return `Beta für ${v.name} entzogen.`;
      }
      case "verify": {
        const next = !v.verified;
        if (a && can("users.verify")) await PLAT.api("POST", `/admin/users/${appId}/verify`, { verified: next });
        if (m && P.siteAdmin) await rpc("admin_set_verified", { p_id: m.id, p_is_verified: next });
        return next ? `${v.name} ist jetzt verifiziert.` : `Verifizierung von ${v.name} entfernt.`;
      }
      case "ban": {
        const appBan = a && can("users.ban");
        const x = await ask({ title: `${v.name} sperren`, danger: true, confirm: "Sperren",
          text: `Die Person kann sich nicht mehr anmelden${appBan ? " und wird überall abgemeldet" : ""}. Profil und Daten bleiben erhalten, du kannst jederzeit entsperren.`,
          fields: [
            { name: "duration", label: "Wie lange?", type: "select", options: BAN_TIMES, value: "10080" },
            { name: "reason", label: "Grund (sieht nur das Team)", type: "textarea", required: true, placeholder: "z. B. Spam, Beleidigungen …" },
            ...(appBan ? [{ name: "banDevice", label: "Auch das Gerät sperren (gegen Zweitkonten)", type: "checkbox" }] : []),
          ] });
        if (!x) return null;
        const minutes = x.duration ? Number(x.duration) : undefined;
        if (appBan) await PLAT.api("POST", `/admin/users/${appId}/ban`, { banned: true, reason: x.reason, durationMinutes: minutes, banDevice: !!x.banDevice });
        if (m && P.siteAdmin) await rpc("admin_set_ban", { p_id: m.id, p_banned: true, p_until: minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null });
        return `${v.name} ist gesperrt${minutes ? ` (${BAN_TIMES.find((t) => t[0] === x.duration)[1]})` : ""}.`;
      }
      case "unban":
        if (a && a.banned && can("users.ban")) await PLAT.api("POST", `/admin/users/${appId}/ban`, { banned: false });
        if (m && m.banned && P.siteAdmin) await rpc("admin_set_ban", { p_id: m.id, p_banned: false, p_until: null });
        return `${v.name} ist entsperrt.`;
      case "mute": {
        const x = await ask({ title: `${v.name} stummschalten`, text: "Die Person kann alles lesen, aber keine Nachrichten, Reaktionen oder Beiträge mehr schreiben.", confirm: "Stummschalten",
          fields: [{ name: "duration", label: "Wie lange?", type: "select", options: BAN_TIMES, value: "1440" }, { name: "reason", label: "Grund (optional)", type: "textarea" }] });
        if (!x) return null;
        await PLAT.api("POST", `/admin/users/${appId}/mute`, { durationMinutes: x.duration ? Number(x.duration) : undefined, reason: x.reason });
        return `${v.name} ist stummgeschaltet.`;
      }
      case "unmute": await PLAT.api("POST", `/admin/users/${appId}/unmute`, {}); return `${v.name} darf wieder schreiben.`;
      case "beta-mail": { const res = await sendStatusMail(b.id); return res && res.skipped ? res.reason : `Status-Mail an ${b.email} gesendet.`; }
      case "beta-note": {
        const area = $("[data-xp-beta-note]", drawer);
        const changed = unwrap(await sb.from("beta_applications").update({ admin_note: area.value }).eq("id", b.id).select("id,admin_note,updated_at"));
        if (!changed.length) throw Error("Bewerbung nicht mehr vorhanden oder keine Berechtigung.");
        Object.assign(b, changed[0]); return "Notiz gespeichert.";
      }
      case "delete-site": {
        if (!(await ask({ title: `Website-Konto von ${v.name} löschen?`, text: "Profil, Karte, Profilbilder, Seitenbilder und Projektbilder werden endgültig entfernt, auch die im eigenen Server-Speicher. Das lässt sich nicht rückgängig machen. Ein App-Konto bleibt bestehen.", confirm: "Endgültig löschen", danger: true }))) return null;
        // Erst die Dateien, dann das Konto: Danach wäre die Kontokennung nirgends mehr zu finden und
        // niemand käme an die Dateien. Jede Löschung im eigenen Server-Speicher schreibt eine Zeile in
        // admin_media_log, wie jede andere Admin-Löschung eines Seitenbildes.
        const weg = await deleteMemberUploads(m.id, { asAdmin: true });
        await rpc("admin_delete_member", { p_id: m.id });
        return `Website-Konto von ${v.name} gelöscht.`
          + (weg && weg.entfernt ? ` ${weg.entfernt} Datei(en) im eigenen Server-Speicher entfernt.` : "")
          // "ohneProtokoll" zählt BEIDE Lager (Supabase-Seitenbilder und eigener Server), deshalb hier kein
          // "davon" — das würde die Zahl auf das eigene Lager beziehen und wäre im Prüfkontext falsch.
          + (weg && weg.ohneProtokoll ? ` ${weg.ohneProtokoll} Löschung(en) stehen ohne Protokolleintrag da — die Dateien sind weg, der Nachweis fehlt.` : "");
      }
      case "delete-app": {
        const x = await ask({ title: `App-Konto von ${v.name} löschen?`, danger: true, confirm: "Endgültig löschen",
          text: "Sitzungen, Mitgliedschaften und Nachrichten werden mit entfernt. Das lässt sich nicht rückgängig machen. Bestätige mit deinem Passwort.",
          fields: [{ name: "reason", label: "Grund", type: "textarea", required: true }, { name: "password", label: "Dein Passwort", type: "password", required: true }] });
        if (!x) return null;
        await PLAT.api("POST", `/admin/users/${appId}/delete`, { reason: x.reason, password: x.password });
        return `App-Konto von ${v.name} gelöscht.`;
      }
      case "delete-beta": {
        if (!(await ask({ title: "Beta-Bewerbung löschen?", text: `Die Bewerbung von ${v.name} wird endgültig entfernt.`, confirm: "Endgültig löschen", danger: true }))) return null;
        const gone = unwrap(await sb.from("beta_applications").delete().eq("id", b.id).select("id"));
        if (!gone.length) throw Error("Bewerbung nicht mehr vorhanden oder keine Berechtigung.");
        return "Bewerbung gelöscht.";
      }
      // Löschen von Seitenbildern. Beide Lager schreiben ihren Nachweis in DIESELBE Tabelle, public.admin_media_log
      // (Migration 20261120120000_admin_media_log.sql). Vorher waren es zwei flüchtige Spuren: eine Zeile im
      // Serverprotokoll der Datenbank und eine im Prozess-Log des Mediendienstes.
      // GENAU EIN SCHREIBER JE WEG, damit keine Zeile doppelt entsteht:
      //   Supabase-Lager (case "media-delete"): die OBERFLÄCHE schreibt, weil sie allein das Ergebnis des Löschens kennt.
      //   Eigener Server (case "media-server-delete"): der SERVER schreibt (media-store.cjs), weil er allein weiß, ob die
      //     Datei im S3-Speicher wirklich weg ist. Die Oberfläche schreibt dort NICHTS; sie meldet nur, was der Server
      //     über den Nachweis sagt (Feld "logged" in der Antwort).
      // GRENZE DES PROTOKOLLS, unverändert und ausdrücklich: Es erfasst nur Löschungen über diese beiden Wege. Die Regel
      //   "Xyntal Seitenbild entfernen" erlaubt einem Admin dasselbe Löschen direkt über die Storage-Schnittstelle, und
      //   wer die S3-Zugangsdaten hat, löscht im eigenen Lager direkt vorbei. Davon erfährt die Tabelle nichts. Sie belegt,
      //   WAS über diese Wege gelöscht wurde, nicht, dass nichts anderes gelöscht wurde.
      case "media-server-delete": {
        const konto = el && el.dataset.konto, datei = el && el.dataset.path;
        if (!m || konto !== m.id || !/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(datei || "")) {
          throw Error("Die Datei gehört nicht zu diesem Mitglied. Nichts wurde entfernt.");
        }
        if (!(await ask({ title: "Seitenbild im eigenen Server-Speicher entfernen?", confirm: "Endgültig entfernen", danger: true,
          text: "Die Datei wird aus dem eigenen Server-Speicher gelöscht. Das lässt sich nicht rückgängig machen. Der Server schreibt danach einen Eintrag in das Prüfprotokoll in der Datenbank: wer, welches Konto, welche Datei, wann. Erreicht der Server die Datenbank in diesem Moment nicht, ist die Datei trotzdem weg und der Eintrag fehlt — das wird dir dann ausdrücklich gemeldet. Das Protokoll erfasst nur Löschungen über diese Oberfläche, nicht Löschungen direkt über die Schnittstelle oder über die S3-Zugangsdaten. Browser, die die Datei schon geladen haben, können sie aus ihrem Zwischenspeicher weiter anzeigen (bis zu ein Jahr). Vor dem Server liegt kein CDN, das ist gemessen; wie lange einzelne Browser halten, haben wir nicht gemessen. Die Seite des Mitglieds wird nicht geändert."}))) return null;
        let r;
        try {
          r = await fetch(`/api/page-media/${encodeURIComponent(konto)}/${encodeURIComponent(datei)}`, { method: "DELETE", headers: await authHeaders() });
        } catch (err) {
          await loadMedia(m.id);
          throw neutral("Ungewiss: Die Verbindung ist beim Entfernen abgebrochen. Ob die Datei gelöscht wurde, ist unklar. Die Liste wurde neu geladen, bitte dort prüfen.");
        }
        await loadMedia(m.id);
        if (r.ok) {
          // Der Server sagt in der Antwort, ob der Nachweis in der Datenbank steht. Ein fehlender Nachweis wird gemeldet,
          // nicht verschwiegen: Die Datei ist weg, aber es gibt keinen Beleg dafür, wer sie entfernt hat.
          let logged = null, grund = "";
          try {
            const body = await r.json();
            if (body && typeof body === "object") { logged = body.logged === true; grund = String(body.log_error || ""); }
          } catch (err) {
            // Antwort ohne lesbaren Inhalt: Die Löschung ist bestätigt (r.ok), über den Nachweis wissen wir nichts.
            logged = null;
          }
          if (logged === true) return `Seitenbild von ${v.name} im eigenen Server-Speicher entfernt. Eintrag im Prüfprotokoll der Datenbank geschrieben.`;
          if (logged === false) {
            throw neutral(`Seitenbild von ${v.name} im eigenen Server-Speicher gelöscht, aber NICHT protokolliert${grund ? `: ${grund}` : ""}. Die Datei ist weg; es gibt keinen Eintrag darüber, wer sie entfernt hat.`);
          }
          throw neutral(`Seitenbild von ${v.name} im eigenen Server-Speicher entfernt. Ob der Eintrag im Prüfprotokoll geschrieben wurde, ist unklar: Der Server hat es nicht mitgeteilt.`);
        }
        // 401: die Anmeldung ist abgelaufen. Der Server hat VOR jeder Löschung abgelehnt, also ist nichts entfernt.
        if (r.status === 401) throw Error("Die Anmeldung ist abgelaufen. Nichts wurde entfernt. Bitte lade die Seite neu.");
        if (r.status === 404) throw Error("Die Datei war nicht mehr vorhanden. Die Liste wurde neu geladen.");
        if (r.status === 403) throw Error("Das Seitenbild wurde nicht entfernt: Der Server bestätigt deine Admin-Berechtigung in dieser Sitzung nicht.");
        if (r.status === 503) throw Error("Der eigene Server-Speicher ist nicht eingerichtet. Nichts wurde entfernt.");
        if (r.status === 400) throw Error("Der Server hat den Dateinamen abgelehnt. Nichts wurde entfernt.");
        throw neutral(`Ungewiss: Der Server hat den Löschvorgang nicht bestätigt (Status ${r.status}). Ob die Datei gelöscht wurde, ist unklar. Die Liste wurde neu geladen, bitte dort prüfen.`);
      }
      case "media-delete": {
        const path = el && el.dataset.path;
        if (!m) return null;
        // Punkt 5: Die Datei muss zu DIESEM Mitglied gehören. Sonst nichts löschen.
        if (!path || !path.startsWith(m.id + "/")) throw Error("Die Datei gehört nicht zu diesem Mitglied. Nichts wurde entfernt.");
        // Und sie muss die Form haben, die das Prüfprotokoll annimmt — GEPRÜFT VOR dem Löschen, nicht danach.
        // Sonst gäbe es einen Fall, in dem gelöscht wird und der Nachweis unmöglich ist: Ein Objekt mit Unterordner
        // (<konto>/unter/bild.jpg) käme durch das startsWith, die Löschung liefe, und admin_media_log_write würde den
        // Namen danach ablehnen. Der Admin läse "gelöscht, aber NICHT protokolliert", ohne dass es dafür einen Grund
        // gäbe, den er abstellen kann. Dieselbe Prüfung macht der Weg für das eigene Lager oben schon.
        if (!/^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/.test(path.slice(m.id.length + 1))) {
          throw Error("Der Dateiname hat nicht die erwartete Form. Nichts wurde entfernt, weil die Löschung dann nicht protokolliert werden könnte.");
        }
        // Punkt 6: nur versprechen, was wir halten können. Zwischenspeicher haben wir nicht gemessen.
        if (!(await ask({ title: "Seitenbild entfernen?", confirm: "Endgültig entfernen", danger: true,
          text: "Die Datei wird aus dem Speicher gelöscht. Das lässt sich nicht rückgängig machen. Danach schreibt die Oberfläche einen Eintrag in das Prüfprotokoll in der Datenbank: wer, welches Konto, welche Datei, wann. Scheitert der Eintrag, ist die Datei trotzdem weg — das wird dir dann ausdrücklich gemeldet. Der Eintrag erfasst nur Löschungen über diese Oberfläche, nicht direkte Löschungen über die Schnittstelle. Wie lange Zwischenspeicher die Datei noch ausliefern, haben wir nicht gemessen. Die Seite des Mitglieds wird nicht geändert."}))) return null;
        // Die Liste wird hier selbst neu geladen (nicht über TOUCHES): Ein fehlgeschlagenes Neuladen darf eine gelungene Löschung
        // nicht als Fehler melden. loadPageMedia wirft nicht, es zeigt Ladefehler in der Box.
        const reload = () => loadMedia(m.id);
        // Der Dateiname ohne den Kontoordner. Oben ist geprüft, dass path mit m.id + "/" beginnt.
        const datei = path.slice(m.id.length + 1);
        // Schreibt eine Zeile ins Prüfprotokoll. Ergebnis: { ok } oder { ok: false, why, unclear }.
        // ergebnis ist "geloescht" (bestätigt) oder "ungewiss" (Ausgang der Löschung unklar) — beides sind Zustände, die
        // hinterher jemand wissen muss. "nicht geloescht" wird nicht protokolliert: Dann ist nichts entfernt worden.
        const protokoll = async (ergebnis) => {
          try {
            const { error: logErr } = await sb.rpc("admin_media_log_write",
              { p_account: m.id, p_file: datei, p_store: "supabase", p_result: ergebnis });
            if (logErr) return { ok: false, why: failText(logErr), unclear: !logErr.status };
            return { ok: true };
          } catch (err) {
            return { ok: false, why: failText(err), unclear: true };
          }
        };
        let res;
        try {
          res = await sb.storage.from("page-media").remove([path]);
        } catch (err) {
          // Ausnahme während des Löschens: der Zustand ist UNGEWISS, nicht als Erfolg oder Misserfolg behaupten.
          // Eine Löschung mit unklarem Ausgang gehört ins Protokoll, genau deshalb kennt es den Wert "ungewiss".
          const log = await protokoll("ungewiss");
          await reload();
          throw neutral("Ungewiss: Die Verbindung ist beim Entfernen abgebrochen. Ob die Datei gelöscht wurde, ist unklar. Die Liste wurde neu geladen, bitte dort prüfen."
            + (log.ok ? " Der unklare Ausgang ist im Prüfprotokoll vermerkt." : ` Auch der Vermerk im Prüfprotokoll ist nicht gelungen: ${log.why}.`));
        }
        const { data, error } = res || {};
        if (error) {
          // Ein Fehler MIT Statuscode kam vom Server: Dann ist nichts gelöscht worden. Nichts zu protokollieren — ein
          // Eintrag über eine Löschung, die nicht stattgefunden hat, wäre genau der Fehler, der im alten Serverprotokoll
          // drei erfundene Zeilen hinterlassen hat.
          if (error.status) { await reload(); throw Error(`Das Seitenbild wurde nicht entfernt: ${failText(error)}`); }
          // Ohne Statuscode (Netzfehler im Client): der Zustand ist ungewiss, und das gehört ins Protokoll.
          const log = await protokoll("ungewiss");
          await reload();
          throw neutral("Ungewiss: Die Verbindung ist beim Entfernen abgebrochen. Ob die Datei gelöscht wurde, ist unklar. Die Liste wurde neu geladen, bitte dort prüfen."
            + (log.ok ? " Der unklare Ausgang ist im Prüfprotokoll vermerkt." : ` Auch der Vermerk im Prüfprotokoll ist nicht gelungen: ${log.why}.`));
        }
        // Fehlt die Berechtigung, kommt KEIN Fehler, sondern eine leere Liste. Das ist kein Erfolg.
        if (!data || !data.length) {
          await reload();
          throw Error("Das Seitenbild wurde nicht entfernt. Entweder fehlt dir die Berechtigung, oder die Datei ist schon weg. Die Liste wurde neu geladen.");
        }
        // Gelöscht. Jetzt der Protokolleintrag, NICHT vorher: Ein Eintrag vor einer Löschung, die dann scheitert, wäre falsch.
        // Scheitert der Eintrag, bleibt die Löschung bestehen. Das wird ausdrücklich gemeldet, nicht verschwiegen.
        const log = await protokoll("geloescht");
        // Ein Fehler beim Neuladen ändert an der Löschung nichts; er steht dann in der Box.
        await reload();
        if (!log.ok) {
          throw neutral(log.unclear
            ? `Seitenbild von ${v.name} gelöscht. Ob der Eintrag im Prüfprotokoll geschrieben wurde, ist unklar: ${log.why}.`
            : `Seitenbild von ${v.name} gelöscht, aber NICHT protokolliert: ${log.why}. Die Datei ist weg; es gibt keinen Eintrag darüber, wer sie entfernt hat.`);
        }
        return `Seitenbild von ${v.name} gelöscht. Eintrag im Prüfprotokoll der Datenbank geschrieben.`;
      }
      default: return null;
    }
  }
  // Was nach einer Aktion neu geladen werden muss
  const TOUCHES = { "handle-save": "site", "handle-free": "site", approve: "site", reject: "site", "beta-on": "site", "beta-off": "site", "beta-mail": "site", "beta-note": "none", "delete-site": "site", "delete-beta": "site", mute: "app", unmute: "app", "delete-app": "app", verify: "both", ban: "both", unban: "both", "media-delete": "none", "media-server-delete": "none" };
  async function runAction(key, kind, button, say) {
    const r = rowByKey(key); if (!r) return;
    // Medien-Aktionen: Ist der Ausklapp inzwischen einer anderen Person, geht die Meldung in die Liste, nie in den fremden Ausklapp.
    const media = kind.startsWith("media-");
    const sayFor = (text, ok) => (media && P.openKey !== key ? listMsg(text, ok) : say(text, ok));
    if (button) button.disabled = true;
    try {
      const text = await act(r, kind, button);
      if (text === null) return;
      const t = TOUCHES[kind] || "both";
      if (t !== "none") await refresh({ app: t !== "site", site: t !== "app" });
      if (kind.startsWith("delete-") && !rowByKey(key)) closeDrawer();
      sayFor(text);
      if (PLAT && P.staff) PLAT.refreshCounts();
    } catch (err) { sayFor(err.neutral ? err.message : `Nicht geklappt: ${failText(err)}`, false); }
    finally { if (button && button.isConnected) button.disabled = false; }
  }

  async function bulk(kind, button) {
    const picked = P.rows.filter((r) => P.sel.has(r.key));
    if (kind === "clear") { P.sel.clear(); renderList(); return; }
    if (kind === "mail") {
      const mails = [...new Set(picked.map((r) => r.v.email).filter((e) => e.includes("@")))];
      if (!mails.length) return listMsg("Keine der ausgewählten Personen hat eine E-Mail-Adresse.", false);
      if (mails.length > 50) return listMsg("Bitte höchstens 50 Personen auf einmal anschreiben.", false);
      location.href = `mailto:?${new URLSearchParams({ bcc: mails.join(","), subject: "Neuigkeiten von Xyntal", body: "Hallo,\n\n\n\nViele Grüße\nNico" }).toString().replace(/\+/g, "%20")}`;
      return listMsg(`Mail an ${plural(mails.length, "Person", "Personen")} vorbereitet (in BCC, niemand sieht die anderen Adressen).`);
    }
    if (kind === "csv") return csv(picked, "xyntal-nutzer-auswahl.csv");
    const todo = kind === "approve" ? picked.filter((r) => r.v.pending) : picked.filter((r) => !r.v.betaOn && (r.beta || r.site));
    if (!todo.length) return;
    const label = kind === "approve" ? "freischalten" : "für die Beta freischalten";
    if (!(await ask({ title: `${plural(todo.length, "Person", "Personen")} ${label}?`, text: kind === "beta-on" ? "Wer sich beworben hat, bekommt dazu eine Status-Mail." : "Alle Ausgewählten dürfen die Website danach voll nutzen.", confirm: "Ja, los" }))) return;
    button.disabled = true;
    let ok = 0; const failed = [];
    for (const r of todo) {
      listMsg(`Wird erledigt … ${ok + failed.length + 1} von ${todo.length}`);
      try {
        if (kind === "approve") await rpc("admin_set_status", { p_id: r.site.id, p_status: "approved" });
        else if (r.beta) await setBetaStatus(r.beta.id, "angenommen");
        else await rpc("admin_set_beta_tester", { p_id: r.site.id, p_is_beta_tester: true });
        ok++;
      } catch (err) { failed.push(`${r.v.name}: ${failText(err)}`); }
    }
    P.sel.clear();
    await refresh({ app: false });
    listMsg(`${plural(ok, "Person", "Personen")} erledigt.${failed.length ? ` Nicht geklappt: ${failed.join(" · ")}` : ""}`, !failed.length);
  }
  function csv(rows, file) {
    downloadCsv(file, ["Name", "E-Mail", "Handle", "Status", "Beta", "App-Konto", "Website-Konto", "Dabei seit"],
      rows.map((r) => [r.v.name, r.v.email, r.v.handle ? `@${r.v.handle}` : "", [r.v.pending && "wartet", r.v.rejected && "abgelehnt", r.v.banned && "gesperrt", r.v.muted && "stumm", r.v.verified && "verifiziert", r.v.team].filter(Boolean).join(", ") || "aktiv",
        r.v.betaOn ? "freigeschaltet" : r.beta ? `Bewerbung: ${BETA_STATUS[r.beta.status] || r.beta.status}` : "", r.app ? "ja" : "nein", r.site ? "ja" : "nein", day(r.v.created)]));
  }

  async function mailAutoAccepted(button) {
    const d = siteData(); if (!d || !Array.isArray(d.beta)) return;
    const todo = autoUnmailed(d.beta);
    const msg = (t, ok = true) => { const m = $("[data-xp-start-msg]", startPanel); if (m) { m.textContent = t; m.classList.toggle("is-error", !ok); } };
    button.disabled = true;
    let sent = 0; const failed = [];
    for (const b of todo) {
      msg(`Status-Mails werden gesendet … (${sent + failed.length + 1} von ${todo.length})`);
      try { await sendStatusMail(b.id); sent++; } catch (err) { failed.push(`${b.email}: ${err.message}`); }
    }
    renderAll();
    msg(`${plural(sent, "Status-Mail", "Status-Mails")} gesendet.${failed.length ? ` NICHT gesendet: ${failed.join(" · ")}` : ""}`, !failed.length);
  }

  // ---------- Ereignisse ----------
  function gotoPeople(filter) {
    P.filter = filter || "all"; P.shown = PAGE;
    document.querySelector('[data-tab="people"]')?.click();
    renderList();
  }
  startPanel.addEventListener("click", (e) => {
    const f = e.target.closest("[data-xp-goto-filter]"); if (f) return gotoPeople(f.dataset.xpGotoFilter);
    const mail = e.target.closest("[data-xp-mail-auto]"); if (mail) return mailAutoAccepted(mail);
    const row = e.target.closest("[data-xp-open]"); if (row) openDrawer(row.dataset.xpOpen);
  });
  peoplePanel.addEventListener("click", (e) => {
    const f = e.target.closest("[data-xp-filter]");
    if (f) { P.filter = f.dataset.xpFilter; P.shown = PAGE; renderList(); return; }
    if (e.target.closest("[data-xp-more]")) { P.shown += PAGE; renderList(); return; }
    if (e.target.closest("[data-xp-refresh]")) { const b = e.target.closest("button"); b.disabled = true; refresh().then(() => listMsg("Liste ist aktuell.")).finally(() => { b.disabled = false; }); return; }
    if (e.target.closest("[data-xp-csv]")) { csv(visibleRows(), "xyntal-nutzer.csv"); return; }
    const bk = e.target.closest("[data-xp-bulk]"); if (bk) { bulk(bk.dataset.xpBulk, bk); return; }
    const quick = e.target.closest("[data-xp-quick]");
    if (quick) {
      if (quick.dataset.xpQuick === "open") openDrawer(quick.dataset.key);
      else runAction(quick.dataset.key, quick.dataset.xpQuick, quick, listMsg);
      return;
    }
    if (e.target.closest("input[type=checkbox], a, label")) return;
    const row = e.target.closest("[data-xp-open]"); if (row) openDrawer(row.dataset.xpOpen);
  });
  for (const panelEl of [startPanel, peoplePanel]) panelEl.addEventListener("keydown", (e) => {
    if ((e.key !== "Enter" && e.key !== " ") || !e.target.matches("tr[data-xp-open]")) return;
    e.preventDefault(); openDrawer(e.target.dataset.xpOpen);
  });
  peoplePanel.addEventListener("change", (e) => {
    if (e.target.matches("[data-xp-pick]")) { e.target.checked ? P.sel.add(e.target.dataset.xpPick) : P.sel.delete(e.target.dataset.xpPick); renderBulk(); return; }
    if (e.target.matches("[data-xp-pick-all]")) {
      for (const r of visibleRows().slice(0, P.shown)) e.target.checked ? P.sel.add(r.key) : P.sel.delete(r.key);
      renderList(); return;
    }
    if (e.target.matches("[data-xp-sort]")) { P.sort = e.target.value; renderList(); }
  });
  let searchTimer;
  peoplePanel.addEventListener("input", (e) => {
    if (!e.target.matches("[data-xp-search]")) return;
    P.q = e.target.value; P.shown = PAGE; renderList();
    // Mehr als 300 App-Konten: ältere über den Server suchen
    clearTimeout(searchTimer);
    if (P.appLimited && P.q.trim().length >= 2) searchTimer = setTimeout(async () => { await loadApp(P.q.trim()); rebuild(); renderList(); }, 300);
  });
  drawer.addEventListener("click", (e) => {
    if (e.target.closest("[data-xp-close]")) { closeDrawer(); return; }
    const b = e.target.closest("[data-xp-act]");
    if (b && P.openKey) runAction(P.openKey, b.dataset.xpAct, b, drawerMsg);
  });
  drawer.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-xp-beta-status]") || !P.openKey) return;
    const r = rowByKey(P.openKey), sel = e.target, old = r.beta.status;
    sel.disabled = true;
    try { const text = await setBetaStatus(r.beta.id, sel.value); await refresh({ app: false }); drawerMsg(text); }
    catch (err) { sel.value = old; drawerMsg(`Nicht gespeichert: ${failText(err)}`, false); }
    finally { if (sel.isConnected) sel.disabled = false; }
  });
  drawer.addEventListener("input", (e) => {
    if (e.target.matches("[data-xp-handle]")) { const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20); if (v !== e.target.value) e.target.value = v; }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden && !document.querySelector("dialog[open]")) closeDrawer(); });

  // Von anderen Bereichen aus (z. B. Sicherheit): App-Konto per ID öffnen
  window.XyntalAdminPeople = {
    openApp(id) { const r = P.rows.find((x) => x.app && x.app.id === id); if (r) { document.querySelector('[data-tab="people"]')?.click(); openDrawer(r.key); } },
    buildRows, matches, FILTERS,
  };

  // ---------- Start ----------
  async function init() {
    const [plat, site] = await Promise.all([PLAT ? PLAT.ready : { staff: false }, SITE.ready]);
    P.staff = !!(plat && plat.staff); P.siteAdmin = !!(site && site.admin);
    P.appOk = can("users.view");
    if (!P.staff && !P.siteAdmin) return;
    await Promise.all([loadApp(), loadFresh(), loadStats()]);
    rebuild(); renderAll();
    document.addEventListener("xa:site-data", () => { rebuild(); renderAll(); });
  }
  init();
})();
