const loginView = document.getElementById("login-view");
const adminView = document.getElementById("admin-view");
let lastData = null;
// Für admin-people.js (Start + Nutzerliste): meldet, ob die Website-Daten da sind; "xa:site-data" nach jedem Laden
let siteReadyResolve;
window.XyntalAdminSite = { ready: new Promise((r) => { siteReadyResolve = r; }), reload: () => load() };
const siteChanged = () => document.dispatchEvent(new CustomEvent("xa:site-data"));
const PROVIDER_LABELS = { google: "Google", apple: "Apple", linkedin_oidc: "LinkedIn", phone: "Handynummer" };
const fmt = (ts) => new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
const statusLabel = { pending: "Wartet", approved: "Freigeschaltet", rejected: "Abgelehnt" };
const BETA_FOCUS = { entwicklung: "Entwicklung", design: "Design", gruendung: "Gründung", vertrieb: "Vertrieb & Wachstum", anderes: "Etwas anderes" };
const BETA_HOURS = { "1-2": "1–2 Std./Woche", "3-5": "3–5 Std./Woche", "6+": "mehr als 5 Std./Woche" };
const BETA_STATUS = { neu: "Neu", in_pruefung: "In Prüfung", eingeladen: "Eingeladen", warteliste: "Warteliste", angenommen: "Angenommen", abgelehnt: "Abgelehnt" };

// Zwei Zugänge: Website-Admin (profiles.is_admin, Supabase) für Warteliste, Karten und Beta;
// Staff-Rolle auf dem App-Server (admin-platform.js) für die Plattform-Bereiche. Wer nur eine
// der beiden Rollen hat, sieht nur diese Gruppe in der Seitenleiste.
async function load() {
  const me = await currentMember();
  if (!me || !me.is_admin) {
    const platform = window.XyntalAdminPlatform ? await window.XyntalAdminPlatform.ready : { staff: false };
    if (platform.staff) {
      document.querySelectorAll("[data-tab][data-site], .admin-tabs-group[data-group='site']").forEach((el) => { el.hidden = true; });
      loginView.hidden = true;
      adminView.hidden = false;
      siteReadyResolve({ admin: false });
      return;
    }
    siteReadyResolve({ admin: false });
    document.getElementById("login-msg").textContent = me
      ? "Dein Konto hat weder Admin-Rechte für die Website noch eine Staff-Rolle auf dem App-Server."
      : "Bitte melde dich mit deinem Admin-Konto an.";
    loginView.hidden = false;
    adminView.hidden = true;
    return;
  }
  let data;
  try {
    const [members, verifiedProfiles, signups, newsletter] = await Promise.all([
      sb.rpc("admin_members").then(unwrap),
      // Sperrstatus nur, wenn die Migration 20261103180000_website_ban.sql schon in Supabase läuft;
      // sonst ohne die Spalten laden, damit Bewerbungen, Karten und Mitglieder trotzdem erscheinen.
      sb.from("profiles").select("id,is_verified,is_beta_tester,banned,banned_until").then(unwrap)
        .catch(() => sb.from("profiles").select("id,is_verified,is_beta_tester").then(unwrap)),
      sb.from("event_signups").select("*").order("created_at", { ascending: false }).then(unwrap),
      sb.from("newsletter").select("*").order("created_at", { ascending: false }).then(unwrap),
    ]);
    const beta = await sb.from("beta_applications").select("*").order("created_at", { ascending: false })
      .then(unwrap).catch((err) => ({ error: err.message }));
    const cards = await sb.from("waitlist_cards").select("*").order("created_at", { ascending: false })
      .then(unwrap).catch((err) => ({ error: err.message }));
    const invites = await Promise.all([
      sb.from("waitlist_referrers").select("*").then(unwrap),
      sb.from("waitlist_referrals").select("*").order("created_at", { ascending: false }).then(unwrap),
    ]).then(([referrers, referrals]) => ({ referrers, referrals })).catch((err) => ({ error: err.message }));
    const verifiedById = new Map(verifiedProfiles.map((profile) => [profile.id, profile.is_verified === true]));
    const betaTesterById = new Map(verifiedProfiles.map((profile) => [profile.id, profile.is_beta_tester === true]));
    const banById = new Map(verifiedProfiles.map((profile) => [profile.id, profile]));
    members.forEach((member) => {
      member.is_verified = verifiedById.get(member.id) === true;
      member.is_beta_tester = betaTesterById.get(member.id) === true;
      // Sperre: läuft, solange banned gesetzt ist und das Ende (falls befristet) noch nicht erreicht ist
      const ban = banById.get(member.id) || {};
      member.banned_until = ban.banned_until || null;
      member.banned = ban.banned === true && (!member.banned_until || new Date(member.banned_until) > new Date());
    });
    data = { members, signups, newsletter, beta, cards, invites };
    lastData = data;
  } catch (err) {
    document.querySelector('[data-panel="cards"]').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    loginView.hidden = true;
    adminView.hidden = false;
    siteReadyResolve({ admin: false, error: err.message });
    return;
  }
  loginView.hidden = true;
  adminView.hidden = false;

  document.getElementById("c-signups").textContent = `(${data.signups.length})`;
  document.getElementById("c-newsletter").textContent = `(${data.newsletter.length})`;
  renderCards(data.cards);

  document.querySelector('[data-panel="signups"]').innerHTML = `
    <p class="hint">Archiv der früheren Anmeldung ohne festen Termin. Neue Zusagen stehen beim jeweiligen Treffen.</p><p><a class="text-link" href="#" data-csv="signups">Als CSV herunterladen</a></p>
    ${data.signups.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Woran arbeitest du?</th><th>Angemeldet</th></tr></thead>
      <tbody>${data.signups.map((s) => `
        <tr><td>${esc(s.name)}<br><small>${esc(s.email)}</small></td><td>${esc(s.project)}</td><td><small>${fmt(s.created_at)}</small></td></tr>`).join("")}
      </tbody></table></div>` : `<p class="empty">Noch keine Anmeldungen.</p>`}`;

  document.querySelector('[data-panel="newsletter"]').innerHTML = `
    <p class="hint">Neue Newsletter-Anmeldungen werden nach E-Mail-Bestätigung direkt in Brevo verwaltet. Diese Ansicht enthält nur frühere, lokale Einträge.</p>
    <p><a class="text-link" href="https://app.brevo.com/contact/forms-app/subscription" target="_blank" rel="noopener">Bestätigte Abonnenten in Brevo verwalten</a></p>
    ${data.newsletter.length ? `<details><summary>Frühere lokale Einträge (${data.newsletter.length})</summary><p><a class="text-link" href="#" data-csv="newsletter">Als CSV herunterladen</a></p><div class="table-wrap"><table>
      <thead><tr><th>E-Mail</th><th>Eingetragen</th></tr></thead>
      <tbody>${data.newsletter.map((n) => `<tr><td>${esc(n.email)}</td><td><small>${fmt(n.created_at)}</small></td></tr>`).join("")}
      </tbody></table></div></details>` : `<p class="empty">Keine früheren lokalen Einträge.</p>`}`;


  ['cards','signups','newsletter'].forEach(enhanceTablePanel);
  siteReadyResolve({ admin: true });
  siteChanged();
  refreshConfirmedCount();
}

let summaryRequest = false;
async function refreshConfirmedCount() {
  if (summaryRequest || document.hidden || adminView.hidden) return;
  summaryRequest = true;
  const target = document.getElementById("overview-confirmed");
  if (!target) { summaryRequest = false; return; }
  try {
    const response = await fetch("/api/waitlist-count?v=2", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const result = response.ok ? await response.json() : {};
    if (!Number.isSafeInteger(result.count) || result.count < 0) throw Error("unavailable");
    target.textContent = result.count.toLocaleString("de-DE");
    document.getElementById("overview-updated").textContent = `Brevo-Zahl aktualisiert um ${new Date().toLocaleTimeString("de-DE")}`;
  } catch { document.getElementById("overview-updated").textContent = "Brevo derzeit nicht erreichbar. Die letzte Zahl bleibt stehen."; }
  finally { summaryRequest = false; }
}
setInterval(refreshConfirmedCount, 15000);
document.addEventListener("visibilitychange", refreshConfirmedCount);

const panelSearch = {};
function enhanceTablePanel(key) {
  const panel = document.querySelector(`[data-panel="${key}"]`);
  const table = panel.querySelector('table');
  if (!table) return;
  panel.querySelector('[data-table-tools]')?.remove();
  const tools = document.createElement('div');tools.className='admin-filters';tools.dataset.tableTools=key;
  tools.innerHTML=`<label class="admin-search">${key==='cards'?'Karten':'Einträge'} durchsuchen<input type="search" data-panel-search="${key}" placeholder="Name, E-Mail oder Inhalt" value="${esc(panelSearch[key]||'')}"></label><span class="hint" data-table-count></span>`;
  table.closest('.table-wrap').before(tools); filterTablePanel(key);
}
function filterTablePanel(key) {
  const panel=document.querySelector(`[data-panel="${key}"]`),query=(panelSearch[key]||'').trim().toLocaleLowerCase('de'),status=panel.querySelector('[data-member-filter]')?.value;
  const rows=[...(panel.querySelector('table')?.querySelectorAll('tbody tr')||[])];let count=0;
  for(const row of rows){row.hidden=!(row.textContent.toLocaleLowerCase('de').includes(query)&&(!status||row.querySelector('.status-pill')?.textContent===status));if(!row.hidden)count++;}
  const info=panel.querySelector('[data-table-count]');if(info)info.textContent=`${count} von ${rows.length} sichtbar`;
}
adminView.addEventListener('input',e=>{if(e.target.matches('[data-panel-search]')){const key=e.target.dataset.panelSearch;panelSearch[key]=e.target.value;filterTablePanel(key);}});

// Karten der Mitglieder – zum Ansehen und Vorstellen. Einen Bearbeitungs-Stand gibt es nicht mehr:
// wer neu dazukommt, zeigt „Aufgaben & Überblick“ als Info. Wunsch-Links gehen auch unter „Nutzer“.
let cardFilter = "";
const cardSel = new Set();
const HANDLE_RE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
const mailto = (to, subject, body, bcc) => `mailto:${to.map(encodeURIComponent).join(",")}?${new URLSearchParams({ ...(bcc ? { bcc: bcc.join(",") } : {}), subject, body }).toString().replace(/\+/g, "%20")}`;
const openMail = (href) => { const a = document.createElement("a"); a.href = href; a.rel = "noopener"; document.body.append(a); a.click(); a.remove(); };
const cardMsg = (text) => { const m = document.querySelector("[data-cards-message]"); if (m) m.textContent = text; };

// Wer passt zu wem? Idee + Mitbauer:in, unterschiedliche Bereiche, gleiche Stadt oder remote, ähnlich viel Zeit
const HAS_IDEA = ["ein Team für meine Idee", "Mitgründer:in"], WANTS_IN = ["ein Projekt zum Mitbauen", "Mitgründer:in"];
function matchScore(a, b) {
  let s = 0; const why = [];
  if ((HAS_IDEA.includes(a.looking) && WANTS_IN.includes(b.looking)) || (HAS_IDEA.includes(b.looking) && WANTS_IN.includes(a.looking))) {
    s += 3; why.push(a.looking === "Mitgründer:in" && b.looking === "Mitgründer:in" ? "suchen beide Mitgründer:in" : "Idee trifft Mitbauer:in");
  }
  if (a.role && b.role && a.role !== b.role) { s += 2; why.push(`${a.role} + ${b.role}`); }
  const ca = (a.city || "").trim().toLowerCase(), cb = (b.city || "").trim().toLowerCase();
  if (ca && ca === cb) { s += 2; why.push(`beide in ${(a.city || "").trim()}`); }
  else if (a.mode === "Remote" || b.mode === "Remote" || (a.mode === "Hybrid" && b.mode === "Hybrid")) { s += 1; why.push("remote möglich"); }
  if (Math.abs((a.hours || 0) - (b.hours || 0)) <= 5) { s += 1; why.push("ähnlich viel Zeit"); }
  return { s, why };
}
function suggestionsFor(c, cards) {
  return cards.filter((o) => o.id !== c.id && o.status !== "gematcht").map((o) => ({ o, ...matchScore(c, o) }))
    .filter((x) => x.s >= 4).sort((x, y) => y.s - x.s).slice(0, 3);
}
function introHref(a, b) {
  const line = (c) => `${c.name}: ${[c.role, c.level].filter(Boolean).join(", ")}${c.city ? `, ${c.city}` : ""}${c.mode ? ` (${c.mode})` : ""}${c.pitch ? ` – „${c.pitch}“` : ""}${c.link ? `\n${c.link}` : ""}`;
  return mailto([a.email, b.email], "Xyntal: Ihr solltet euch kennenlernen",
    `Hallo ${a.name}, hallo ${b.name},\n\nich bin Nico von Xyntal. Ihr habt beide eure Karte auf die Warteliste geschickt – und ich glaube, ihr passt gut zusammen:\n\n${line(a)}\n\n${line(b)}\n\nSchreibt euch einfach direkt (Antwort an alle) und schaut, ob es passt. Ich freue mich, wenn ihr mir erzählt, was draus wird.\n\nViele Grüße\nNico`);
}

function renderCards(cards) { renderCardsList(cards); renderInvites(lastData && lastData.invites); }
function renderCardsList(cards) {
  const panel = document.querySelector('[data-panel="cards"]');
  if (cards.error) {
    document.getElementById("c-cards").textContent = "";
    panel.innerHTML = /could not find|does not exist|schema cache/i.test(cards.error)
      ? `<div class="notice">Die Tabelle für Karten fehlt noch. Führe <code>supabase/011_waitlist_cards.sql</code> einmal im Supabase SQL Editor aus.</div>`
      : `<p class="empty">${esc(cards.error)}</p>`;
    return;
  }
  for (const id of [...cardSel]) if (!cards.some((c) => String(c.id) === id)) cardSel.delete(id);
  document.getElementById("c-cards").textContent = cards.length ? String(cards.length) : "";
  const roles = [...new Set(cards.map((c) => c.role))];
  const shown = cards.filter((c) => !cardFilter || c.role === cardFilter || c.looking === cardFilter);
  const count = (k) => cards.filter((c) => c.role === k).length;
  panel.innerHTML = `
    <div class="panel-heading"><div><p class="admin-kicker">LEUTE ZUSAMMENBRINGEN</p><h2>Karten</h2>
      <p class="hint">Karten aus dem Karten-Builder, mitgeschickt beim Eintrag in die Warteliste. Unter „Passende Leute“ schlägt Xyntal vor, wer zusammenpasst – mit „Vorstellen“ öffnet sich eine fertige Mail an beide.</p></div></div>
    ${cards.length ? `<div class="card-filters" aria-label="Nach Bereich filtern">
        <button data-cfilter="" aria-pressed="${!cardFilter}">Alle Bereiche (${cards.length})</button>
        ${roles.map((r) => `<button data-cfilter="${esc(r)}" aria-pressed="${cardFilter === r}">${esc(r)} (${count(r)})</button>`).join("")}
        <button data-cfilter="ein Team für meine Idee" aria-pressed="${cardFilter === "ein Team für meine Idee"}">Haben eine Idee</button>
        <button data-cfilter="ein Projekt zum Mitbauen" aria-pressed="${cardFilter === "ein Projekt zum Mitbauen"}">Wollen mitbauen</button>
      </div>
      <div class="bulk-bar" data-bulk-bar>
        <span data-bulk-count>${cardSel.size} ausgewählt</span>
        <button data-bulk="mail">E-Mail an Auswahl</button>
        <button data-bulk="csv">Auswahl als CSV</button>
        <button class="admin-danger" data-bulk="delete">Auswahl löschen</button>
        <button data-bulk="clear">Auswahl aufheben</button>
        <a class="text-link" href="#" data-csv="cards">Alle als CSV</a>
      </div>
      <p class="admin-message" data-cards-message role="status" aria-live="polite"></p>
      <div class="table-wrap"><table>
      <thead><tr><th><input type="checkbox" data-sel-all aria-label="Alle sichtbaren auswählen"></th><th>Person</th><th>Skills & Satz</th><th>Sucht</th><th>Notiz</th><th>Aktionen</th></tr></thead>
      <tbody>${shown.map((c) => {
        const sug = suggestionsFor(c, cards);
        return `
        <tr data-card-row="${c.id}">
          <td><input type="checkbox" data-sel="${c.id}" ${cardSel.has(String(c.id)) ? "checked" : ""} aria-label="${esc(c.name)} auswählen"></td>
          <td><b>${esc(c.name)}</b>${c.handle ? ` <small>· <a class="text-link" href="/${esc(c.handle)}" target="_blank" rel="noopener">xyntal.de/${esc(c.handle)}</a>${c.is_public ? " · öffentlich" : ""}</small>` : ""}<br><small>${esc(c.role)}${c.level ? ` · ${esc(c.level)}` : ""} · ${c.hours} Std./Woche</small><br>${c.city || c.mode ? `<small>${esc([c.city, c.mode].filter(Boolean).join(" · "))}</small><br>` : ""}${/^https?:\/\//.test(c.link || "") ? `<small><a class="text-link" href="${esc(c.link)}" target="_blank" rel="noopener noreferrer nofollow">${esc(c.link.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40))}</a></small><br>` : ""}<small><a class="text-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></small><br><small>${fmt(c.created_at)}${c.lang === "en" ? " · EN" : ""}</small></td>
          <td>${(c.skills || []).map((x) => `<span class="skill-tag">${esc(x)}</span>`).join(" ")}${c.pitch ? `<p class="beta-why-text">${esc(c.pitch)}</p>` : ""}</td>
          <td><small>${esc(c.looking)}</small></td>
          <td><textarea class="card-note" data-note="${c.id}" rows="2" maxlength="500" placeholder="Notiz, z. B. passt zu …">${esc(c.note || "")}</textarea></td>
          <td><div class="row-actions">
            <a class="admin-link" href="${esc(mailto([c.email], "Deine Xyntal-Karte", `Hallo ${c.name},\n\n\n\nViele Grüße\nNico`))}">E-Mail</a>
            <button class="admin-danger" data-card="delete" data-id="${c.id}">Löschen</button>
          </div>
          <details class="card-more"><summary>Passende Leute (${sug.length})</summary>
            ${sug.length ? `<ul class="match-list">${sug.map(({ o, why }) => `<li><b>${esc(o.name)}</b> <small>${esc(o.role)} · ${esc(o.looking)}</small><br><small>${esc(why.join(" · "))}</small><br><button data-intro="${c.id}:${o.id}">Vorstellen</button></li>`).join("")}</ul>` : `<p class="hint">Noch niemand passt gut. Mit mehr Karten kommen hier Vorschläge.</p>`}
          </details>
          <details class="card-more"><summary>Wunsch-Link</summary>
            <div class="handle-edit"><span>xyntal.de/</span><input type="text" maxlength="20" value="${esc(c.handle || "")}" data-handle-input="${c.id}" aria-label="Wunsch-Link für ${esc(c.name)}" autocapitalize="off" spellcheck="false"></div>
            <div class="row-actions"><button data-handle-save="${c.id}">Speichern</button>${c.handle ? `<button data-handle-free="${c.id}">Freigeben</button>` : ""}${c.is_public ? `<button data-hide-public="${c.id}">Öffentliche Karte ausblenden</button>` : ""}</div>
            <p class="hint">${c.is_public ? "Die Karte ist unter dem Link öffentlich sichtbar (Zustimmung beim Eintragen)." : "Unter dem Link steht nur „reserviert“. Öffentlich wird die Karte nur, wenn die Person selbst zustimmt."}</p>
          </details></td>
        </tr>`; }).join("")}
      </tbody></table></div>` : `<p class="empty">Noch keine Karten. Sie erscheinen, sobald jemand seine Karte beim Eintrag in die Warteliste mitschickt.</p>`}`;
  updateBulk();
}
function updateBulk() {
  const bar = document.querySelector("[data-bulk-bar]");
  if (!bar) return;
  bar.querySelector("[data-bulk-count]").textContent = `${cardSel.size} ausgewählt`;
  bar.querySelectorAll("button[data-bulk], select").forEach((b) => { b.disabled = !cardSel.size; });
  const all = document.querySelector("[data-sel-all]");
  const visible = [...document.querySelectorAll('[data-panel="cards"] tr[data-card-row]')].filter((r) => !r.hidden).map((r) => r.dataset.cardRow);
  if (all) { all.checked = visible.length > 0 && visible.every((id) => cardSel.has(id)); all.indeterminate = !all.checked && visible.some((id) => cardSel.has(id)); }
}
const selectedCards = () => lastData.cards.filter((c) => cardSel.has(String(c.id)));
// Vorstellen hält nur in der Notiz fest, wer wem vorgestellt wurde
async function addCardNotes(notes) {
  for (const [id, line] of Object.entries(notes)) {
    const row = lastData.cards.find((c) => String(c.id) === String(id));
    const note = [row?.note, line].filter(Boolean).join("\n").slice(0, 500);
    const changed = unwrap(await sb.from("waitlist_cards").update({ note }).eq("id", id).select("id,note"));
    if (!changed.length) throw Error("Karte nicht mehr vorhanden oder keine Berechtigung.");
    if (row) Object.assign(row, changed[0]);
  }
}
function rerenderCards(msg) { renderCards(lastData.cards); enhanceTablePanel("cards"); siteChanged(); cardMsg(msg || ""); }

const cardsPanel = document.querySelector('[data-panel="cards"]');
cardsPanel.addEventListener("click", async (e) => {
  const f = e.target.closest("[data-cfilter]");
  if (f) { cardFilter = f.dataset.cfilter; rerenderCards(); return; }
  const intro = e.target.closest("[data-intro]");
  if (intro) {
    const [ida, idb] = intro.dataset.intro.split(":");
    const a = lastData.cards.find((c) => String(c.id) === ida), b = lastData.cards.find((c) => String(c.id) === idb);
    if (!a || !b) return;
    openMail(introHref(a, b));
    intro.disabled = true;
    const day = new Date().toLocaleDateString("de-DE");
    try { await addCardNotes({ [a.id]: `Vorgestellt mit ${b.name} (${day})`, [b.id]: `Vorgestellt mit ${a.name} (${day})` }); rerenderCards(`Die Mail an ${a.name} und ${b.name} öffnet sich in deinem Mailprogramm. In beiden Notizen steht jetzt, dass du sie vorgestellt hast.`); }
    catch (err) { cardMsg(`Mail geöffnet, aber Notiz nicht gespeichert: ${err.message}`); intro.disabled = false; }
    return;
  }
  const hp = e.target.closest("[data-hide-public]");
  if (hp) {
    hp.disabled = true;
    try {
      const changed = unwrap(await sb.from("waitlist_cards").update({ is_public: false }).eq("id", hp.dataset.hidePublic).select("id,is_public"));
      if (!changed.length) throw Error("Karte nicht mehr vorhanden oder keine Berechtigung.");
      Object.assign(lastData.cards.find((c) => String(c.id) === hp.dataset.hidePublic), changed[0]);
      rerenderCards("Öffentliche Karte ausgeblendet. Unter dem Link steht jetzt nur noch „reserviert“.");
    } catch (err) { cardMsg(`Nicht gespeichert: ${err.message}`); hp.disabled = false; }
    return;
  }
  const hs = e.target.closest("[data-handle-save], [data-handle-free]");
  if (hs) {
    const id = hs.dataset.handleSave || hs.dataset.handleFree;
    const input = cardsPanel.querySelector(`[data-handle-input="${id}"]`);
    const value = hs.dataset.handleFree ? null : input.value.trim().toLowerCase();
    if (value !== null && !HANDLE_RE.test(value)) { cardMsg("Wunsch-Link: 3–20 Zeichen, Kleinbuchstaben, Zahlen, - und _, beginnt mit Buchstabe oder Zahl."); input.focus(); return; }
    hs.disabled = true;
    try {
      const changed = unwrap(await sb.from("waitlist_cards").update({ handle: value }).eq("id", id).select("id,handle"));
      if (!changed.length) throw Error("Karte nicht mehr vorhanden oder keine Berechtigung.");
      Object.assign(lastData.cards.find((c) => String(c.id) === id), changed[0]);
      rerenderCards(value ? `Wunsch-Link xyntal.de/${value} gespeichert.` : "Wunsch-Link freigegeben.");
    } catch (err) {
      cardMsg(/duplicate|unique/i.test(err.message) ? `xyntal.de/${value} ist schon vergeben.` : `Nicht gespeichert: ${err.message}`);
      hs.disabled = false;
    }
    return;
  }
  const bulk = e.target.closest("[data-bulk]");
  if (bulk) {
    const list = selectedCards();
    if (bulk.dataset.bulk === "clear") { cardSel.clear(); rerenderCards(); return; }
    if (!list.length) return;
    if (bulk.dataset.bulk === "mail") {
      if (list.length > 50) { cardMsg("Bitte höchstens 50 Personen auf einmal anschreiben – sonst wird die Mail zu lang."); return; }
      openMail(mailto([], "Neuigkeiten von Xyntal", "Hallo,\n\n\n\nViele Grüße\nNico", list.map((c) => c.email)));
      cardMsg(`Mail an ${list.length} Personen vorbereitet (in BCC, damit niemand die anderen Adressen sieht).`);
      return;
    }
    if (bulk.dataset.bulk === "csv") {
      downloadCsv("xyntal-karten-auswahl.csv", ["Name", "Wunsch-Link", "E-Mail", "Bereich", "Erfahrung", "Skills", "Std./Woche", "Stadt", "Arbeitsweise", "Sucht", "Satz", "Link", "Notiz"],
        list.map((c) => [c.name, c.handle ? `xyntal.de/${c.handle}` : "", c.email, c.role, c.level || "", (c.skills || []).join(", "), c.hours, c.city || "", c.mode || "", c.looking, c.pitch, c.link || "", c.note]));
      return;
    }
    if (bulk.dataset.bulk === "delete") {
      if (!bulk.dataset.armed) { bulk.dataset.armed = "1"; bulk.textContent = `${list.length} Karten wirklich löschen?`; return; }
      bulk.disabled = true;
      try {
        const ids = list.map((c) => c.id);
        const gone = unwrap(await sb.from("waitlist_cards").delete().in("id", ids).select("id"));
        const goneIds = new Set(gone.map((g) => String(g.id)));
        lastData.cards = lastData.cards.filter((c) => !goneIds.has(String(c.id)));
        cardSel.clear(); rerenderCards(`${gone.length} Karten gelöscht.`);
      } catch (err) { cardMsg(`Nicht gelöscht: ${err.message}`); bulk.disabled = false; }
      return;
    }
  }
  const btn = e.target.closest("button[data-card]");
  if (!btn) return;
  const { id } = btn.dataset;
  if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Sicher? Nochmal klicken"; return; }
  try {
    const gone = unwrap(await sb.from("waitlist_cards").delete().eq("id", id).select("id"));
    if (!gone.length) throw Error("Karte nicht mehr vorhanden oder keine Berechtigung.");
    lastData.cards = lastData.cards.filter((c) => String(c.id) !== id); cardSel.delete(id);
    rerenderCards("Karte gelöscht.");
  } catch (err) { cardMsg(`Nicht gelöscht: ${err.message}`); }
});
cardsPanel.addEventListener("change", async (e) => {
  if (e.target.matches("[data-sel]")) { e.target.checked ? cardSel.add(e.target.dataset.sel) : cardSel.delete(e.target.dataset.sel); updateBulk(); return; }
  if (e.target.matches("[data-sel-all]")) {
    const visible = [...cardsPanel.querySelectorAll("tr[data-card-row]")].filter((r) => !r.hidden).map((r) => r.dataset.cardRow);
    visible.forEach((id) => (e.target.checked ? cardSel.add(id) : cardSel.delete(id)));
    cardsPanel.querySelectorAll("[data-sel]").forEach((b) => { b.checked = cardSel.has(b.dataset.sel); });
    updateBulk(); return;
  }
  // Notizen speichern, sobald man das Feld verlässt
  const area = e.target.closest("[data-note]");
  if (!area) return;
  try {
    unwrap(await sb.from("waitlist_cards").update({ note: area.value.slice(0, 500) }).eq("id", area.dataset.note));
    area.classList.add("is-saved"); setTimeout(() => area.classList.remove("is-saved"), 1200);
    const row = lastData.cards.find((c) => String(c.id) === area.dataset.note); if (row) row.note = area.value;
  } catch (err) { area.insertAdjacentHTML("afterend", `<small class="notice">${esc(err.message)}</small>`); }
});
cardsPanel.addEventListener("input", (e) => {
  if (e.target.matches("[data-handle-input]")) { const v = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20); if (v !== e.target.value) e.target.value = v; }
  if (e.target.matches("[data-panel-search]")) setTimeout(updateBulk);
});

// Einladungen: wer hat wie viele Leute geworben – gutschreiben, wenn die Person bestätigt hat
function renderInvites(inv) {
  const panel = document.querySelector('[data-panel="cards"]');
  if (!panel || !inv) return;
  const box = document.createElement("section");
  box.className = "invites-admin";
  if (inv.error) {
    box.innerHTML = /could not find|does not exist|schema cache/i.test(inv.error)
      ? `<h3>Einladungen</h3><div class="notice">Für Einladungen fehlt noch <code>supabase/013_waitlist_perks.sql</code>. Einmal im Supabase SQL Editor ausführen.</div>`
      : `<h3>Einladungen</h3><p class="empty">${esc(inv.error)}</p>`;
    panel.append(box); return;
  }
  const canCredit = inv.referrals.every((r) => "credited_at" in r);
  const byCode = {};
  for (const r of inv.referrals) (byCode[r.code] ||= []).push(r);
  const rows = inv.referrers.map((r) => ({ ...r, list: byCode[r.code] || [] })).filter((r) => r.list.length).sort((a, b) => b.list.length - a.list.length);
  const credited = inv.referrals.filter((r) => r.credited_at).length;
  box.innerHTML = `<h3>Einladungen <small>(${inv.referrals.length} über ${rows.length} Werber${canCredit ? ` · ${credited} gutgeschrieben` : ""})</small></h3>
    <p class="hint">Pro geworbener Person gibt es 1 Woche gratis, sobald es Abos gibt – aber nur, wenn sie ihre Anmeldung bestätigt hat. Gleich das mit der <a class="text-link" href="https://app.brevo.com/contact/list-listing/id/3" target="_blank" rel="noopener">Brevo-Liste</a> ab und schreib dann gut.</p>
    ${canCredit ? "" : `<div class="notice">Zum Gutschreiben fehlt noch <code>supabase/014_admin_actions.sql</code>. Einmal im Supabase SQL Editor ausführen.</div>`}
    <p class="admin-message" data-invites-message role="status" aria-live="polite"></p>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Werber</th><th>Geworben</th><th>Gratis-Wochen</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a class="text-link" href="mailto:${esc(r.email)}">${esc(r.email)}</a><br><small>Code ${esc(r.code)}</small></td>
        <td><ul class="ref-list">${r.list.map((x) => `<li><span>${esc(x.email)} <small>· ${fmt(x.created_at)}${x.credited_at ? ` · gutgeschrieben ${fmt(x.credited_at)}` : ""}</small></span>
          <span class="row-actions">${canCredit ? `<button data-ref-credit="${x.id}" data-on="${x.credited_at ? "0" : "1"}">${x.credited_at ? "Gutschrift zurücknehmen" : "Gutschreiben"}</button>` : ""}<button class="admin-danger" data-ref-delete="${x.id}">Entfernen</button></span></li>`).join("")}</ul></td>
        <td><b>${r.list.filter((x) => x.credited_at).length}</b> <small>von ${r.list.length}</small></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="empty">Noch niemand wurde über einen Einladungslink geworben.</p>`}`;
  panel.append(box);
}
cardsPanel.addEventListener("click", async (e) => {
  const cr = e.target.closest("[data-ref-credit]"), del = e.target.closest("[data-ref-delete]");
  if (!cr && !del) return;
  const msg = (t) => { const m = document.querySelector("[data-invites-message]"); if (m) m.textContent = t; };
  const id = (cr || del).dataset.refCredit || (cr || del).dataset.refDelete;
  const list = lastData.invites.referrals, row = list.find((r) => String(r.id) === id);
  if (del && !del.dataset.armed) { del.dataset.armed = "1"; del.textContent = "Wirklich entfernen?"; return; }
  (cr || del).disabled = true;
  try {
    if (cr) {
      const changed = unwrap(await sb.from("waitlist_referrals").update({ credited_at: cr.dataset.on === "1" ? new Date().toISOString() : null }).eq("id", id).select("id,credited_at"));
      if (!changed.length) throw Error("Einladung nicht mehr vorhanden oder keine Berechtigung.");
      Object.assign(row, changed[0]);
    } else {
      const gone = unwrap(await sb.from("waitlist_referrals").delete().eq("id", id).select("id"));
      if (!gone.length) throw Error("Einladung nicht mehr vorhanden oder keine Berechtigung.");
      lastData.invites.referrals = list.filter((r) => String(r.id) !== id);
    }
    rerenderCards();
    msg(cr ? (row.credited_at ? `${row.email}: gutgeschrieben.` : `${row.email}: Gutschrift zurückgenommen.`) : "Einladung entfernt.");
  } catch (err) { msg(`Nicht gespeichert: ${err.message}`); (cr || del).disabled = false; }
});

const STATUS_MAILABLE = new Set(['in_pruefung','eingeladen','warteliste','angenommen','abgelehnt']);
// Status-Mail über den Daki-Server (IONOS-SMTP); Rechte prüft der Server mit dem Admin-Token gegen Supabase
async function sendStatusMail(id){
  const { data: { session } } = await sb.auth.getSession();
  if(!session) throw Error('Nicht eingeloggt.');
  const response = await fetch('/api/beta-status-mail',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({id:String(id)}),signal:AbortSignal.timeout(30000)}).catch(()=>{throw Error('Server nicht erreichbar (nur auf xyntal.de möglich).');});
  const result = await response.json().catch(()=>({}));
  if(!response.ok||result.ok!==true) throw Error(result.error||'HTTP '+response.status);
  const row = lastData.beta.find(b=>String(b.id)===String(id));
  if(row&&!result.skipped){ row.mailed_status=result.status; row.mailed_at=new Date().toISOString(); }
  return result;
}
// Automatische Prüfung (20261108120000_auto_review_beta.sql): angenommen ohne Status-Mail = noch zu mailen
const autoAccepted = b => b.status==='angenommen' && !!b.auto_accepted_at;
const autoUnmailed = rows => rows.filter(b => autoAccepted(b) && b.mailed_status!=='angenommen');
// Status einer Bewerbung setzen; außer „Neu“ geht danach eine Status-Mail raus (mail:false lässt sie weg).
// „Angenommen“ setzt per Trigger den Beta-Tester-Badge am verknüpften Konto, ein anderer Status nimmt ihn weg.
async function setBetaStatus(id, status, { mail = true } = {}) {
  const row = lastData.beta.find(b => String(b.id) === String(id));
  if (!row) throw Error('Bewerbung nicht mehr vorhanden.');
  const old = row.status;
  const changed = unwrap(await sb.from('beta_applications').update({ status }).eq('id', id).select('id,status,updated_at'));
  if (!changed.length) throw Error('Keine Berechtigung oder Bewerbung nicht mehr vorhanden.');
  Object.assign(row, changed[0]);
  const member = row.user_id && lastData.members.find(m => m.id === row.user_id);
  if (member && (status === 'angenommen' || old === 'angenommen')) member.is_beta_tester = status === 'angenommen';
  let text = member && status === 'angenommen' ? 'Status gespeichert, Beta ist freigeschaltet.' : 'Status gespeichert.';
  if (mail && STATUS_MAILABLE.has(status)) {
    try { await sendStatusMail(id); text += ` Status-Mail an ${row.email} gesendet.`; }
    catch (err) { text += ` Status-Mail NICHT gesendet: ${err.message}`; }
  }
  return text;
}

// Navigation wie in der App: links eine Liste in 4 Gruppen (data-group), jede Seite direkt anklickbar.
// Seiten ohne Recht blendet admin-platform.js/load() per hidden aus; eine Gruppe ohne sichtbare Seite verschwindet samt Überschrift.
const allTabs = [...document.querySelectorAll("[data-tab]")];
const groupTitles = [...document.querySelectorAll("[data-group-title]")];
const OLD_HASH = { users: "people", members: "people", beta: "people", overview: "start" };
function syncSections() {
  for (const g of groupTitles) g.hidden = !allTabs.some((t) => t.dataset.group === g.dataset.groupTitle && !t.hidden);
}
function selectTab(btn) {
  allTabs.forEach((b) => { b.setAttribute("aria-selected", b === btn); b.tabIndex = b === btn ? 0 : -1; });
  history.replaceState(null, "", `#${btn.dataset.tab}`);
  document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
  if (matchMedia("(max-width:1000px)").matches) btn.scrollIntoView({ block: "nearest", inline: "center" });
}
allTabs.forEach((btn) => btn.addEventListener("click", () => { selectTab(btn); window.scrollTo({ top: 0 }); }));
new MutationObserver(syncSections).observe(document.querySelector(".xa-nav"), { subtree: true, attributes: true, attributeFilter: ["hidden"] });
document.querySelector('.xa-nav').addEventListener('keydown',e=>{
  const tabs=allTabs.filter(t=>!t.hidden),index=tabs.indexOf(document.activeElement);if(index<0)return;
  const fwd=e.key==='ArrowDown'||e.key==='ArrowRight',back=e.key==='ArrowUp'||e.key==='ArrowLeft';
  const next=fwd?(index+1)%tabs.length:back?(index-1+tabs.length)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;
  if(next!==null){e.preventDefault();tabs[next].click();tabs[next].focus();}
});
allTabs.forEach((tab,i)=>{tab.tabIndex=i===0?0:-1; const panel=document.querySelector(`[data-panel="${tab.dataset.tab}"]`);tab.id=`tab-${tab.dataset.tab}`;panel.id=`panel-${tab.dataset.tab}`;tab.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);});
{ const h = location.hash.slice(1), wanted = OLD_HASH[h] || h; const tab = allTabs.find((t) => t.dataset.tab === wanted); selectTab(tab || allTabs[0]); syncSections(); }
adminView.addEventListener('click',e=>{if(e.target.closest('[data-reload]'))load();});
document.getElementById("admin-logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.href = "./";
});

function downloadCsv(filename, header, rows) {
  const cell = (v) => { const text = String(v ?? ""); return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`; };
  const csv = "\ufeff" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

adminView.addEventListener("click", (e) => {
  const link = e.target.closest("[data-csv]");
  if (!link || !lastData) return;
  e.preventDefault();
  if (link.dataset.csv === "cards") {
    downloadCsv("xyntal-karten.csv", ["Name", "Wunsch-Link", "Öffentlich", "E-Mail", "Bereich", "Erfahrung", "Skills", "Std./Woche", "Stadt", "Arbeitsweise", "Sucht", "Satz", "Link", "Notiz", "Sprache", "Eingegangen"],
      lastData.cards.map((c) => [c.name, c.handle ? `xyntal.de/${c.handle}` : "", c.is_public ? "ja" : "nein", c.email, c.role, c.level || "", (c.skills || []).join(", "), c.hours, c.city || "", c.mode || "", c.looking, c.pitch, c.link || "", c.note, c.lang, fmt(c.created_at)]));
  } else if (link.dataset.csv === "signups") {
    downloadCsv("xyntal-anmeldungen.csv", ["Name", "E-Mail", "Projekt", "Angemeldet"],
      lastData.signups.map((s) => [s.name, s.email, s.project, fmt(s.created_at)]));
  } else {
    downloadCsv("xyntal-newsletter.csv", ["E-Mail", "Eingetragen"],
      lastData.newsletter.map((n) => [n.email, fmt(n.created_at)]));
  }
});


// Partnerprogramm: Zahlen kommen vom App-Server (GET /admin/partners, Partner-Links xyntal.de/?partner=<code>)
async function renderPartners() {
  const panel = document.querySelector('[data-panel="partners"]');
  panel.innerHTML = '<p class="empty">Partner werden geladen …</p>';
  let data;
  try { data = await window.XyntalApp.api("GET", "/admin/partners"); }
  catch (e) { panel.innerHTML = `<div class="notice">${esc(e.status === 403 ? "Dein App-Konto hat keine Staff-Rechte für Partner-Zahlen." : e.message || "Die Partner-Zahlen sind gerade nicht erreichbar.")}</div>`; return; }
  const rows = data.partners || [];
  panel.innerHTML = `
    <p class="hint">Wer über den Link kommt und innerhalb von ${data.claimWindowDays} Tagen ein Konto anlegt, zählt für den Partner und bekommt das Angebot einmal. Klicks: Aufrufe des Links (einmal pro Browser), ohne Daten über die Person.</p>
    ${rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Partner</th><th>Link</th><th>Angebot</th><th>Klicks (30 T.)</th><th>Konten (30 T.)</th><th>Gratis-Monat erhalten</th><th>Gerade im Gratis-Monat</th><th>Zahlen jetzt</th><th>Konversion</th></tr></thead>
      <tbody>${rows.map((p) => {
        const link = `https://xyntal.de/?partner=${p.code}`;
        const conv = p.clicks ? Math.round((p.signups / p.clicks) * 100) + " %" : "–";
        return `<tr><td><b>${esc(p.name)}</b>${p.active ? "" : " <small>(pausiert)</small>"}</td>
          <td><button type="button" class="text-link" data-copy="${esc(link)}" title="Link kopieren">${esc(link.replace("https://", ""))}</button></td>
          <td>${p.rewardDays} Tage ${esc(p.rewardPlan)}</td>
          <td>${p.clicks} <small>(${p.clicks30d})</small></td><td><b>${p.signups}</b> <small>(${p.signups30d})</small></td>
          <td>${p.rewarded}</td><td>${p.inFreeMonth}</td><td>${p.paying}</td><td>${conv}</td></tr>`;
      }).join("")}</tbody></table></div>` : '<p class="empty">Noch keine Partner.</p>'}
    <div class="row-actions"><button type="button" data-partners-refresh>Aktualisieren</button></div>`;
  panel.querySelector("[data-partners-refresh]").addEventListener("click", renderPartners);
  panel.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Kopiert ✓"; setTimeout(() => { b.textContent = b.dataset.copy.replace("https://", ""); }, 1500); } catch { /* ohne Zwischenablage */ }
  }));
}
document.querySelector('[data-tab="partners"]').addEventListener("click", renderPartners);
if (location.hash === "#partners") renderPartners();

load();
