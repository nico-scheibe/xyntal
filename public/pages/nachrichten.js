// /nachrichten – dieselben Gespräche wie in der Xyntal-App, im selben Aufbau:
// links die Gesprächsliste (Alle · Ungelesen · Anfragen · Gruppen · Archiviert),
// in der Mitte der Verlauf mit Einblick zur Zusammenarbeit und Eingabe (Anhang,
// Emoji, GIF, Sprachnachricht, /projekt · /arbeitsbereich · /gruppe, @-Erwähnung), rechts Person bzw. Gruppe.
// Alles läuft über den App-Server (app-api.js) – ein Datenbestand für App und Website.
(() => {
  const X = window.XyntalApp;
  const root = document.getElementById("chat");
  if (!X || !root) return;
  const { esc, t } = X;

  const listEl = root.querySelector("[data-list]");
  const threadEl = root.querySelector("[data-thread]");
  const infoEl = root.querySelector("[data-info]");
  const notice = document.getElementById("notice");
  const QUICK = ["👍", "❤️", "😂", "🎉", "😮", "🙏"];
  const EMOJI = ["😀", "😂", "😊", "😍", "🤔", "😅", "😮", "😢", "😡", "👍", "👎", "👏", "🙏", "💪", "🎉", "🔥", "❤️", "💯", "✨", "🚀", "👀", "✅", "❌", "☕"];
  const FILE_MAX = 10 * 1024 * 1024;
  const TAB = Math.random().toString(36).slice(2, 10);
  const BG_KEY = "xyntal-chat-bg";
  const CHAT_BGS = [["xyntal", "Xyntal"], ["space", "Weltall"], ["natur", "Natur"], ["tech", "Tech"], ["fun", "Fun"], ["none", "Ohne Muster"]];
  const FILTERS = [["all", "Alle"], ["unread", "Ungelesen"], ["requests", "Anfragen"], ["groups", "Gruppen"], ["archived", "Archiviert"]];
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const S = {
    me: "", meName: "", conversations: [], filter: "all", query: "", searchHits: [],
    active: "", messages: [], hasMore: false, readers: [], members: new Map(), users: new Map(), presence: new Map(),
    insight: new Map(), tagFilter: "", tagFilterName: "", filterTagDropped: false, chatTags: [], replyTo: null, editId: "", pending: [], tag: null,
    mentionIds: new Map(), typing: new Map(), view: "list", infoOpen: true, draft: new Map(), loadingOlder: false,
  };
  let chatBg = "xyntal";
  try { const saved = localStorage.getItem(BG_KEY); if (CHAT_BGS.some(([k]) => k === saved)) chatBg = saved; } catch { /* Standard */ }

  // ---------- Hilfen ----------
  const locale = () => (document.documentElement.lang === "en" ? "en-GB" : "de-DE");
  const timeOf = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
  function dayLabel(iso) {
    const d = new Date(iso), now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(now) - day(d)) / 86400000);
    if (diff === 0) return t("Heute");
    if (diff === 1) return t("Gestern");
    return d.toLocaleDateString(locale(), { weekday: diff < 7 ? "long" : undefined, day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  }
  function listTime(iso) {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    if (d.toDateString() === now.toDateString()) return timeOf(iso);
    if (now - d < 6 * 86400000) return d.toLocaleDateString(locale(), { weekday: "short" });
    return d.toLocaleDateString(locale(), { day: "numeric", month: "numeric" });
  }
  const initials = (name) => (String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  function avatar(user, size = "") {
    const name = user ? user.displayName : "?";
    const img = user && /^data:image\/(jpeg|png);base64,/.test(user.avatar || "") ? `<img src="${esc(user.avatar)}" alt="">` : esc(initials(name));
    return `<span class="xc-av ${size}" aria-hidden="true">${img}</span>`;
  }
  function groupAvatar(c, size = "") {
    return `<span class="xc-av xc-av-group ${size}" aria-hidden="true">${c.emoji ? esc(c.emoji) : esc(initials(c.title))}</span>`;
  }
  const presenceOf = (id) => S.presence.get(id) || "offline";
  const presenceLabel = (p) => t({ online: "Online", busy: "Beschäftigt", away: "Abwesend" }[p] || "Offline");
  function linkify(text) {
    return esc(text).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"'\]]/g, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>`);
  }
  function bodyHtml(m) {
    let html = linkify(m.body || "");
    for (const men of m.mentions || []) {
      const label = men.kind === "everyone" ? "@everyone" : `@${men.name || ""}`;
      if (label.length > 1) html = html.split(esc(label)).join(`<span class="xc-mention">${esc(label)}</span>`);
    }
    return html.replace(/\n/g, "<br>");
  }
  const fail = (err) => (err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal.");
  function say(text, kind = "") {
    const el = root.querySelector("[data-status]");
    if (!el) return;
    el.textContent = text;
    el.className = `xc-status${kind ? " " + kind : ""}`;
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, 6000);
  }
  const conv = (id) => S.conversations.find((c) => c.id === id);

  // Markierungen wie in der App: Projekt, Arbeitsbereich oder Gruppe (auf dem Server „community“).
  // Eine Nachricht trägt höchstens ein Projekt (m.project) und/oder einen Arbeitsbereich bzw. eine Gruppe (m.tag).
  const TAG_KINDS = ["project", "workspace", "community"];
  const TAG_ICON = { project: "folder", workspace: "building", community: "users" };
  const TAG_LABEL = { project: "Projekt", workspace: "Arbeitsbereich", community: "Gruppe" };
  const TAG_ABOUT = { project: "Zum Projekt", workspace: "Zum Arbeitsbereich", community: "Zur Gruppe" };
  const tagKey = (g) => `${g.kind}:${g.id}`;
  const tagsOf = (m) => [m.project ? { kind: "project", ...m.project } : null, m.tag && TAG_KINDS.includes(m.tag.kind) ? m.tag : null].filter(Boolean);
  // Die Befehle der Eingabe (wie tagCommand() in der App, qml/screens/messages/MessageFormat.js)
  const TAG_COMMANDS = [["projekt", "project"], ["project", "project"], ["arbeitsbereich", "workspace"], ["workspace", "workspace"],
    ["gruppe", "community"], ["group", "community"], ["community", "community"]];
  // Der Befehl direkt vor dem Cursor: ein einzelnes „/“ bietet alles an, „/arb“ die passenden Arten,
  // nach einem Leerzeichen grenzt der Rest die Liste ein („/projekt apo“). Nur am Anfang oder nach
  // Leerraum – „und/oder“ ist keiner. `start` ist die Stelle des Schrägstrichs.
  function tagCommand(text, cursor) {
    const head = String(text || "").slice(0, Math.max(0, Math.min(Number(cursor) || 0, String(text || "").length)));
    const none = { active: false, prefix: "", start: -1, kinds: [] };
    const m = /(^|\s)\/([A-Za-z]*)(?: ([^\n/]{0,40}))?$/.exec(head);
    if (!m) return none;
    const command = m[2].toLowerCase();
    const kinds = [];
    for (const [word, kind] of TAG_COMMANDS) {
      const hit = m[3] === undefined ? word.startsWith(command) : word === command;
      if (hit && !kinds.includes(kind)) kinds.push(kind);
    }
    if (!kinds.length) return none;
    return { active: true, prefix: m[3] === undefined ? "" : m[3], start: m.index + m[1].length, kinds };
  }
  // Was die nächste Nachricht markiert: die eigene Auswahl, sonst im gefilterten Verlauf der Filter
  // (nur, wenn du ihn selbst markieren darfst; das × nimmt ihn für diese Nachricht weg).
  function effectiveTag() {
    if (S.tag) return S.tag;
    if (!S.tagFilter || S.filterTagDropped) return null;
    const seen = S.messages.map(tagsOf).flat().find((g) => tagKey(g) === S.tagFilter);
    return seen && seen.accessible ? { kind: seen.kind, id: seen.id, name: seen.name } : null;
  }
  function tagPayload() {
    const g = effectiveTag();
    if (!g) return {};
    return g.kind === "project" ? { projectId: g.id } : { tag: { kind: g.kind, id: g.id } };
  }
  const isGroup = (c) => c && !(c.kind === "dm" && c.partnerId);

  async function user(id) {
    if (!id) return null;
    if (S.users.has(id)) return S.users.get(id);
    const p = X.api("GET", `/users/${encodeURIComponent(id)}`).then((r) => r.profile).catch(() => null);
    S.users.set(id, p);
    const profile = await p;
    S.users.set(id, profile);
    return profile;
  }
  const userNow = (id) => { const u = S.users.get(id); return u && !(u instanceof Promise) ? u : null; };

  // Dateien des App-Servers brauchen die Anmeldung: einmal holen, als blob: zeigen
  const blobs = new Map();
  async function fileUrl(id) {
    if (blobs.has(id)) return blobs.get(id);
    const p = (async () => {
      const s = await X.session();
      const res = await fetch(`${X.API}/files/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${s.token}` } });
      if (!res.ok) throw new Error(String(res.status));
      return URL.createObjectURL(await res.blob());
    })();
    blobs.set(id, p);
    p.catch(() => blobs.delete(id));
    return p;
  }

  // ---------- Gesprächsliste ----------
  function passes(c) {
    if (S.query) return (c.title || "").toLowerCase().includes(S.query.toLowerCase());
    switch (S.filter) {
      case "unread": return !c.archived && c.unread > 0;
      case "requests": return !c.archived && (c.myRole === "invited" || c.myRole === "pending");
      case "groups": return !c.archived && c.kind === "group";
      case "archived": return c.archived;
      default: return !c.archived;
    }
  }
  function snippet(c) {
    if (c.lastKind === "voice") return t("🎤 Sprachnachricht");
    if (c.lastKind === "gif") return "GIF";
    if (!c.lastSnippet && c.lastKind) return t("📎 Datei");
    return c.lastSnippet || t("Noch keine Nachrichten");
  }
  function renderList() {
    const shown = S.conversations.filter(passes);
    const items = shown.map((c) => {
      const partner = c.partnerId ? userNow(c.partnerId) : null;
      const av = isGroup(c) ? groupAvatar(c) : avatar(partner || { displayName: c.title });
      const dot = !isGroup(c) ? `<i class="xc-dot xc-${presenceOf(c.partnerId)}"></i>` : "";
      return `<li><button type="button" class="xc-item${c.id === S.active ? " is-active" : ""}${c.unread ? " is-unread" : ""}" data-open="${esc(c.id)}" aria-current="${c.id === S.active}">
        <span class="xc-av-wrap">${av}${dot}</span>
        <span class="xc-item-main"><span class="xc-item-top"><b data-no-i18n>${esc(c.title || t("Gespräch"))}</b><time>${esc(listTime(c.updatedTs))}</time></span>
        <span class="xc-item-sub"><span data-no-i18n>${esc(snippet(c))}</span>${c.mentions ? `<em class="xc-badge xc-badge-at">@</em>` : ""}${c.unread ? `<em class="xc-badge">${c.unread > 99 ? "99+" : c.unread}</em>` : ""}</span></span>
      </button></li>`;
    }).join("");
    const hits = S.query.length >= 2 && S.searchHits.length ? `<p class="xc-label">${esc(t("Nachrichten"))}</p><ul class="xc-hits">${S.searchHits.map((m) => `<li><button type="button" data-open="${esc(m.conversationId)}"><b data-no-i18n>${esc(conv(m.conversationId)?.title || m.author)}</b><span data-no-i18n>${esc(m.author)}: ${esc((m.body || "").slice(0, 90))}</span></button></li>`).join("")}</ul>` : "";
    listEl.querySelector("[data-items]").innerHTML = items || hits
      ? `<ul class="xc-items">${items}</ul>${hits}`
      : `<p class="xc-empty">${esc(t(S.query ? "Nichts gefunden." : S.filter === "all" ? "Noch keine Gespräche. Starte eins mit dem Stift oben." : "Hier ist gerade nichts."))}</p>`;
    listEl.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === S.filter)));
    const total = S.conversations.filter((c) => !c.archived).reduce((n, c) => n + (c.unread || 0), 0);
    const nav = document.querySelector("[data-messages]");
    if (nav) nav.innerHTML = `${esc(t("Nachrichten"))}${total ? ` <span class="badge">${total}</span>` : ""}`;
  }
  async function loadConversations() {
    const { conversations } = await X.api("GET", "/conversations");
    S.conversations = conversations;
    renderList();
    const ids = [...new Set(conversations.map((c) => c.partnerId).filter(Boolean))];
    await Promise.all(ids.map(user));
    if (ids.length) {
      try {
        const { statuses } = await X.api("GET", `/presence?ids=${ids.slice(0, 100).map(encodeURIComponent).join(",")}`);
        for (const [id, st] of Object.entries(statuses)) S.presence.set(id, st);
      } catch { /* ohne Status */ }
    }
    renderList();
    if (S.active) { renderHeader(); renderInfo(); }
  }
  let searchTimer = 0;
  listEl.querySelector("[data-search]").addEventListener("input", (e) => {
    S.query = e.target.value.trim();
    renderList();
    clearTimeout(searchTimer);
    if (S.query.length < 2) { S.searchHits = []; return; }
    searchTimer = setTimeout(async () => {
      try { S.searchHits = (await X.api("GET", `/messages/search?q=${encodeURIComponent(S.query)}`)).messages || []; }
      catch { S.searchHits = []; }
      renderList();
    }, 250);
  });
  listEl.addEventListener("click", (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { S.filter = f.dataset.filter; renderList(); return; }
    const o = e.target.closest("[data-open]");
    if (o) open(o.dataset.open);
    if (e.target.closest("[data-new]")) newConversation();
  });

  // ---------- Gespräch öffnen ----------
  async function open(id, { push = true } = {}) {
    if (S.active && S.active !== id) S.draft.set(S.active, composerText());
    S.active = id;
    S.messages = []; S.hasMore = false; S.readers = []; S.replyTo = null; S.editId = ""; S.pending = []; S.tag = null;
    S.mentionIds = new Map(); S.tagFilter = ""; S.tagFilterName = ""; S.filterTagDropped = false; S.chatTags = [];
    setView("thread");
    if (push) history.replaceState(null, "", `nachrichten?c=${encodeURIComponent(id)}`);
    renderList();
    renderThreadShell();
    try {
      await Promise.all([loadMessages(), loadMembers(id), loadChatTags()]);
      const c = conv(id);
      if (c && !isGroup(c)) loadInsight(c.partnerId);
      markRead();
    } catch (err) {
      threadEl.querySelector("[data-messages]").innerHTML = `<p class="xc-empty">${esc(fail(err))}</p>`;
    }
  }
  async function loadMembers(id) {
    try {
      const r = await X.api("GET", `/conversations/${encodeURIComponent(id)}/members`);
      S.members.set(id, r);
      await Promise.all(r.members.filter((m) => !m.mine).slice(0, 20).map((m) => user(m.id)));
    } catch { S.members.set(id, { members: [], can: {} }); }
    renderHeader(); renderInfo();
  }
  // Alles, was in diesem Gespräch markiert wurde (Projekte, Arbeitsbereiche, Gruppen) – die Filter rechts
  async function loadChatTags() {
    try { S.chatTags = (await X.api("GET", `/conversations/${encodeURIComponent(S.active)}/tags`)).tags || []; }
    catch { S.chatTags = []; }
    renderInfo();
  }
  async function loadInsight(partnerId) {
    if (!partnerId) return;
    if (!S.insight.has(partnerId)) {
      S.insight.set(partnerId, X.api("GET", `/matches/people/${encodeURIComponent(partnerId)}`).then((r) => r.match).catch(() => null));
    }
    const m = await S.insight.get(partnerId);
    const c = conv(S.active);
    if (!m || !c || c.partnerId !== partnerId) return;
    const box = threadEl.querySelector("[data-insight]");
    const p = userNow(partnerId);
    box.innerHTML = `${X.scoreRing(m.overall)}<div><b>${esc(t("Einblick zur Zusammenarbeit"))}</b><p data-no-i18n>${esc((m.explanation && m.explanation.summary || "").split("\n")[0])}</p></div>
      <a class="xc-link" href="${p && p.websiteCard && HANDLE.test(p.websiteCard.handle || "") ? `/${esc(p.websiteCard.handle)}` : `/fuer-dich?person=${encodeURIComponent(partnerId)}`}">${esc(t("Profil ansehen"))} →</a>`;
    box.hidden = false;
  }

  async function loadMessages({ older = false } = {}) {
    const id = S.active;
    let path = `/conversations/${encodeURIComponent(id)}/messages?limit=50`;
    if (older && S.messages.length) path += `&before=${encodeURIComponent(S.messages[0].ts)}&beforeId=${encodeURIComponent(S.messages[0].id)}`;
    if (S.tagFilter) path += `&tag=${encodeURIComponent(S.tagFilter)}`;
    const r = await X.api("GET", path);
    if (S.active !== id) return;
    if (older) {
      const scroller = threadEl.querySelector("[data-messages]");
      const before = scroller.scrollHeight - scroller.scrollTop;
      S.messages = [...r.messages, ...S.messages];
      S.hasMore = r.hasMore;
      renderMessages();
      scroller.scrollTop = scroller.scrollHeight - before;
    } else {
      S.messages = r.messages; S.hasMore = r.hasMore; S.readers = r.readers || [];
      renderMessages({ stick: true });
    }
  }
  // Live: das geladene Fenster ab der ältesten sichtbaren Nachricht neu holen
  async function refreshActive() {
    if (!S.active) return;
    const id = S.active;
    const first = S.messages[0];
    let path = `/conversations/${encodeURIComponent(id)}/messages?limit=200`;
    if (first) path += `&since=${encodeURIComponent(first.ts)}&sinceId=${encodeURIComponent(first.id)}`;
    if (S.tagFilter) path += `&tag=${encodeURIComponent(S.tagFilter)}`;
    try {
      const r = await X.api("GET", path);
      if (S.active !== id) return;
      const scroller = threadEl.querySelector("[data-messages]");
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
      S.messages = r.messages; S.readers = r.readers || [];
      renderMessages({ stick: atBottom });
      if (document.visibilityState === "visible") markRead();
    } catch { /* nächster Versuch beim nächsten Ereignis */ }
  }
  let readBusy = false;
  async function markRead() {
    const c = conv(S.active);
    if (!c || readBusy || document.visibilityState !== "visible") return;
    readBusy = true;
    try {
      await X.api("POST", `/conversations/${encodeURIComponent(c.id)}/read`, {});
      c.unread = 0; c.mentions = 0;
      renderList();
    } catch { /* später */ } finally { readBusy = false; }
  }

  // ---------- Verlauf zeichnen ----------
  function renderThreadShell() {
    const c = conv(S.active);
    threadEl.innerHTML = `
      <header class="xc-head" data-head></header>
      <div class="xc-insight" data-insight hidden></div>
      <div class="xc-filterbar" data-filterbar hidden></div>
      <div class="xc-messages" data-messages tabindex="0" aria-label="${esc(t("Verlauf"))}"><p class="xc-empty">${esc(t("Wird geladen …"))}</p></div>
      <p class="xc-typing" data-typing aria-live="polite"></p>
      <form class="xc-composer" data-composer novalidate>
        <div data-composer-top></div>
        <div class="xc-compose-row">
          <div class="xc-pop-anchor">
            <button type="button" class="xc-icon" data-plus aria-label="${esc(t("Anhängen, GIF oder Markierung"))}" aria-haspopup="menu" aria-expanded="false">${ICON.plus}</button>
            <div class="xc-menu" data-plus-menu role="menu" hidden>
              <button type="button" role="menuitem" data-attach>${ICON.clip}<span>${esc(t("Datei anhängen …"))}</span></button>
              <button type="button" role="menuitem" data-gif-open>${ICON.gif}<span>${esc(t("GIF senden …"))}</span></button>
              <button type="button" role="menuitem" data-tag-open>${ICON.folder}<span>${esc(t("Projekt, Arbeitsbereich oder Gruppe markieren …"))}</span></button>
            </div>
          </div>
          <div class="xc-pop-anchor">
            <button type="button" class="xc-icon" data-emoji-open aria-label="${esc(t("Emoji einfügen"))}" aria-haspopup="true" aria-expanded="false">😊</button>
            <div class="xc-pop xc-emoji" data-emoji-pop hidden>${EMOJI.map((e) => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join("")}</div>
          </div>
          <button type="button" class="xc-icon xc-gif-btn" data-gif-open aria-label="${esc(t("GIF senden"))}">GIF</button>
          <div class="xc-input-wrap">
            <textarea data-input rows="1" maxlength="8000" placeholder="${esc(t(matchMedia("(max-width: 600px)").matches ? "Nachricht …" : "Nachricht … (@ erwähnt, / markiert Projekt, Arbeitsbereich oder Gruppe)"))}" aria-label="${esc(t("Nachricht"))}"></textarea>
            <div class="xc-pop xc-picker" data-picker hidden></div>
          </div>
          <button type="button" class="xc-icon" data-mic aria-label="${esc(t("Sprachnachricht aufnehmen"))}">${ICON.mic}</button>
          <button type="submit" class="xc-send" data-send aria-label="${esc(t("Senden"))}">${ICON.send}</button>
        </div>
        <input type="file" data-file multiple hidden>
      </form>
      <div class="xc-pop xc-gifs" data-gif-pop hidden></div>
      <p class="xc-status" data-status role="status" aria-live="polite"></p>`;
    applyBg();
    renderHeader();
    const input = threadEl.querySelector("[data-input]");
    input.value = (c && S.draft.get(c.id)) || "";
    grow(input);
    renderComposerTop();
    syncSend();
  }
  function renderHeader() {
    const head = threadEl.querySelector("[data-head]");
    const c = conv(S.active);
    if (!head || !c) return;
    const partner = c.partnerId ? userNow(c.partnerId) : null;
    const members = (S.members.get(c.id) || {}).members || [];
    const sub = isGroup(c)
      ? (members.length === 1 ? t("Gruppe · 1 Mitglied") : `${t("Gruppe")} · ${members.length || c.memberCount} ${t("Mitglieder")}`)
      : `${t("Direktnachricht")} · ${presenceLabel(presenceOf(c.partnerId))}`;
    head.innerHTML = `
      <button type="button" class="xc-icon xc-back" data-back aria-label="${esc(t("Zurück zur Liste"))}">${ICON.back}</button>
      ${isGroup(c) ? groupAvatar(c) : avatar(partner || { displayName: c.title })}
      <div class="xc-head-main"><b data-no-i18n>${esc(c.title || t("Gespräch"))}</b><span>${esc(sub)}</span></div>
      <div class="xc-head-actions">
        ${bgPickerHtml()}
        <button type="button" class="xc-icon" data-info-toggle aria-label="${esc(t("Details anzeigen"))}" aria-pressed="${S.infoOpen}">${ICON.info}</button>
      </div>`;
  }

  function systemText(m) {
    const s = m.system || {};
    const me = s.actorId === S.me;
    const who = me ? t("Du") : s.actor || t("Jemand");
    const targets = (s.targets || []).join(", ");
    switch (s.type) {
      case "created": return targets ? `${who} ${t(me ? "hast diese Gruppe erstellt mit" : "hat diese Gruppe erstellt mit")} ${targets}` : `${who} ${t(me ? "hast diese Gruppe erstellt" : "hat diese Gruppe erstellt")}`;
      case "added": return `${who} ${t(me ? "hast hinzugefügt:" : "hat hinzugefügt:")} ${targets}`;
      case "removed": return `${who} ${t(me ? "hast entfernt:" : "hat entfernt:")} ${targets}`;
      case "left": return `${who} ${t(me ? "hast die Gruppe verlassen" : "hat die Gruppe verlassen")}`;
      case "renamed": return `${who} ${t(me ? "hast die Gruppe umbenannt in" : "hat die Gruppe umbenannt in")} „${s.title}“`;
      case "owner": return `${s.targets && s.targets[0] ? s.targets[0] : who} ${t("leitet jetzt die Gruppe")}`;
      default: return m.body || "";
    }
  }
  function attachmentHtml(a, m) {
    if (m.kind === "voice" || (a.mimeType || "").startsWith("audio/")) {
      return `<div class="xc-voice" data-file-id="${esc(a.id)}" data-kind="audio"><span>${ICON.mic}</span><audio controls preload="none"></audio>${a.durationMs ? `<small>${Math.round(a.durationMs / 1000)} s</small>` : ""}</div>`;
    }
    if (/^image\/(jpeg|png|gif|webp)$/.test(a.mimeType || "")) {
      return `<button type="button" class="xc-image" data-file-id="${esc(a.id)}" data-kind="image" data-name="${esc(a.name)}" aria-label="${esc(a.name)}"><span class="xc-image-ph"></span></button>`;
    }
    return `<button type="button" class="xc-file" data-download="${esc(a.id)}" data-name="${esc(a.name)}">${ICON.clip}<span data-no-i18n>${esc(a.name)}</span><small>${esc(fmtSize(a.size))}</small></button>`;
  }
  const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((n || 0) / 1024))} KB`);
  function bubble(m, prev, c) {
    if (m.kind === "system") return `<p class="xc-system" data-no-i18n>${esc(systemText(m))}</p>`;
    const grouped = prev && prev.kind !== "system" && prev.authorId === m.authorId && new Date(m.ts) - new Date(prev.ts) < 5 * 60000;
    const showAuthor = isGroup(c) && !m.mine && !grouped;
    const gif = m.kind === "gif" && m.gif && /^https:\/\/(media\d?|i)\.giphy\.com\//.test(m.gif.url || "")
      ? `<img class="xc-gif" src="${esc(m.gif.url)}" alt="${esc(m.gif.title || "GIF")}" loading="lazy" width="${Number(m.gif.width) || 200}" height="${Number(m.gif.height) || 150}">` : "";
    const reply = m.replyToId ? `<button type="button" class="xc-quote" data-jump="${esc(m.replyToId)}"><b data-no-i18n>${esc(m.replyToAuthor)}</b><span data-no-i18n>${esc(m.replySnippet || t(m.replyKind === "voice" ? "Sprachnachricht" : m.replyKind === "gif" ? "GIF" : m.replyKind === "file" ? "Datei" : "Nachricht"))}</span></button>` : "";
    const project = tagsOf(m).map((g) => {
      const title = g.accessible ? `${t(TAG_LABEL[g.kind])} · ${t("Klick zeigt nur Nachrichten dazu")}` : t(g.kind === "community" ? "Du bist nicht in dieser Gruppe" : "Du bist nicht in diesem Arbeitsbereich");
      return `<button type="button" class="xc-project" data-tag-filter="${esc(tagKey(g))}" data-name="${esc(g.name)}" title="${esc(title)}" aria-pressed="${S.tagFilter === tagKey(g)}">${ICON[TAG_ICON[g.kind]]}<span data-no-i18n>${esc(g.name)}</span></button>`;
    }).join("");
    const reactions = (m.reactions || []).length ? `<div class="xc-reactions">${m.reactions.map((r) => `<button type="button" class="xc-reaction${r.mine ? " is-mine" : ""}" data-react="${esc(r.emoji)}" title="${esc(r.names.join(", "))}" aria-pressed="${r.mine}">${esc(r.emoji)} <b>${r.count}</b></button>`).join("")}</div>` : "";
    const body = m.body && !(m.kind === "gif" && m.body === (m.gif && m.gif.url)) ? `<div class="xc-body" data-no-i18n>${m.isCode ? `<pre><code>${esc(m.body)}</code></pre>` : bodyHtml(m)}</div>` : "";
    const editing = S.editId === m.id;
    return `<div class="xc-msg${m.mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}${m.mentionsMe ? " is-mention" : ""}" data-msg="${esc(m.id)}">
      ${!m.mine && isGroup(c) ? (grouped ? `<span class="xc-av-gap"></span>` : avatar(userNow(m.authorId) || { displayName: m.author }, "xc-av-sm")) : ""}
      <div class="xc-bubble-wrap">
        ${showAuthor ? `<span class="xc-author" data-no-i18n>${esc(m.author)}</span>` : ""}
        <div class="xc-bubble">
          ${reply}${project ? `<div class="xc-tagrow">${project}</div>` : ""}
          ${editing ? `<form class="xc-edit" data-edit-form><textarea data-edit-input rows="2" maxlength="8000">${esc(m.body)}</textarea><div><button class="btn btn-small" type="submit">${esc(t("Speichern"))}</button><button class="btn btn-small btn-ghost" type="button" data-edit-cancel>${esc(t("Abbrechen"))}</button></div></form>` : body}
          ${gif}${(m.attachments || []).map((a) => attachmentHtml(a, m)).join("")}
          <span class="xc-meta"><time datetime="${esc(m.ts)}">${esc(timeOf(m.ts))}</time>${m.edited ? ` · ${esc(t("bearbeitet"))}` : ""}${m.threadReplyCount ? ` · ${m.threadReplyCount === 1 ? esc(t("1 Antwort im Thread")) : `${m.threadReplyCount} ${esc(t("Antworten im Thread"))}`}` : ""}</span>
        </div>
        ${reactions}
      </div>
      <div class="xc-tools" role="toolbar" aria-label="${esc(t("Aktionen"))}">
        ${QUICK.slice(0, 3).map((e) => `<button type="button" data-react="${e}" aria-label="${esc(t("Reagieren mit"))} ${e}">${e}</button>`).join("")}
        <button type="button" data-more-react aria-label="${esc(t("Weitere Reaktionen"))}">${ICON.smile}</button>
        <button type="button" data-reply aria-label="${esc(t("Antworten"))}">${ICON.reply}</button>
        ${m.mine && m.kind === "text" ? `<button type="button" data-edit aria-label="${esc(t("Bearbeiten"))}">${ICON.edit}</button>` : ""}
        ${m.mine ? `<button type="button" data-delete aria-label="${esc(t("Löschen"))}">${ICON.trash}</button>` : ""}
      </div>
    </div>`;
  }
  function renderMessages({ stick = false } = {}) {
    const scroller = threadEl.querySelector("[data-messages]");
    const c = conv(S.active);
    if (!scroller || !c) return;
    let html = S.hasMore ? `<button type="button" class="xc-older" data-older>${esc(t("Ältere Nachrichten laden"))}</button>` : "";
    let day = "";
    S.messages.forEach((m, i) => {
      const d = new Date(m.ts).toDateString();
      if (d !== day) { day = d; html += `<p class="xc-day"><span>${esc(dayLabel(m.ts))}</span></p>`; }
      html += bubble(m, i > 0 && new Date(S.messages[i - 1].ts).toDateString() === d ? S.messages[i - 1] : null, c);
    });
    // „Gesehen“ unter deiner letzten Nachricht, die die anderen schon gelesen haben
    const lastMine = [...S.messages].reverse().find((m) => m.mine && m.kind !== "system");
    if (lastMine) {
      const seen = S.readers.filter((r) => r.lastReadAt && r.lastReadAt >= lastMine.ts);
      if (seen.length) {
        const label = isGroup(c) ? `${t("Gesehen von")} ${seen.map((r) => r.name).join(", ")}` : t("Gesehen");
        html = html.replace(`data-msg="${esc(lastMine.id)}">`, `data-msg="${esc(lastMine.id)}" data-seen="${esc(label)}">`);
      }
    }
    scroller.innerHTML = html || `<p class="xc-empty">${esc(t(S.tagFilter ? "Dazu gibt es noch keine Nachrichten." : "Noch keine Nachrichten – sag hallo."))}</p>`;
    hydrate(scroller);
    if (stick) scroller.scrollTop = scroller.scrollHeight;
    const bar = threadEl.querySelector("[data-filterbar]");
    bar.hidden = !S.tagFilter;
    if (S.tagFilter) {
      const kind = S.tagFilter.split(":")[0];
      const hint = effectiveTag() && !S.tag ? `<small>${esc(t("Neue Nachrichten hier werden damit markiert."))}</small>` : "";
      bar.innerHTML = `${ICON[TAG_ICON[kind]] || ICON.folder}<span>${esc(t("Nur Nachrichten zu"))} <b data-no-i18n>${esc(S.tagFilterName)}</b> ${hint}</span><button type="button" class="xc-link" data-filter-clear>${esc(t("Alle Nachrichten"))}</button>`;
    }
    renderComposerTop();
  }
  function hydrate(scope) {
    scope.querySelectorAll("[data-file-id]").forEach(async (el) => {
      try {
        const url = await fileUrl(el.dataset.fileId);
        if (el.dataset.kind === "audio") el.querySelector("audio").src = url;
        else el.innerHTML = `<img src="${url}" alt="${esc(el.dataset.name || "")}">`;
      } catch { if (el.dataset.kind === "image") el.innerHTML = `<span class="xc-image-ph">${esc(t("Bild nicht verfügbar"))}</span>`; }
    });
    scope.querySelectorAll(".xc-gif").forEach((img) => img.addEventListener("load", () => {
      const s = threadEl.querySelector("[data-messages]");
      if (s && s.scrollHeight - s.scrollTop - s.clientHeight < 400) s.scrollTop = s.scrollHeight;
    }, { once: true }));
  }

  // ---------- Rechte Spalte ----------
  function setInfo(html) {
    infoEl.innerHTML = `<button type="button" class="xc-icon xc-info-back" data-info-back aria-label="${esc(t("Zurück zum Gespräch"))}">${ICON.back}</button>${html}`;
  }
  function renderInfo() {
    const c = conv(S.active);
    root.classList.toggle("info-closed", !S.infoOpen);
    if (!c) { setInfo(`<p class="xc-empty">${esc(t("Wähle ein Gespräch, um Details zu sehen."))}</p>`); return; }
    const projects = S.chatTags.length ? `<section><h3>${esc(t("In diesem Chat markiert"))}</h3><ul class="xc-projects">${S.chatTags.filter((g) => TAG_KINDS.includes(g.kind)).map((g) => `<li><button type="button" data-tag-filter="${esc(tagKey(g))}" data-name="${esc(g.name)}" aria-pressed="${S.tagFilter === tagKey(g)}" title="${esc(t(TAG_LABEL[g.kind]))}">${ICON[TAG_ICON[g.kind]]}<span data-no-i18n>${esc(g.name)}</span><small>${g.count}</small></button></li>`).join("")}</ul><p class="xc-hint">${esc(t("Klick auf einen Eintrag, um nur seine Nachrichten zu sehen. In einer Nachricht markierst du mit /projekt, /arbeitsbereich oder /gruppe."))}</p></section>` : "";
    if (isGroup(c)) {
      const r = S.members.get(c.id) || { members: [] };
      setInfo(`
        <div class="xc-info-head">${groupAvatar(c, "xc-av-xl")}<h2 data-no-i18n>${esc(c.title)}</h2><p>${esc(t("Gruppe"))} · ${r.members.length} ${esc(t("Mitglieder"))}</p>${c.description ? `<p class="xc-about" data-no-i18n>${esc(c.description)}</p>` : ""}</div>
        <section><h3>${esc(t("Mitglieder"))}</h3><ul class="xc-members">${r.members.map((m) => `<li>${avatar(userNow(m.id) || { displayName: m.displayName }, "xc-av-sm")}<span data-no-i18n>${esc(m.displayName)}${m.mine ? ` (${esc(t("du"))})` : ""}</span>${m.conversationRole === "owner" ? `<small>${esc(t("Inhaber"))}</small>` : m.conversationRole === "admin" ? `<small>Admin</small>` : ""}</li>`).join("")}</ul></section>
        ${projects}
        <section><button type="button" class="btn btn-small btn-ghost" data-leave>${esc(t("Gruppe verlassen"))}</button></section>`);
      return;
    }
    const p = userNow(c.partnerId);
    const handle = p && p.websiteCard && HANDLE.test(p.websiteCard.handle || "") ? p.websiteCard.handle : "";
    setInfo(`
      <div class="xc-info-head">${avatar(p || { displayName: c.title }, "xc-av-xl")}<h2 data-no-i18n>${esc(p ? p.displayName : c.title)}</h2>${p && p.headline ? `<p data-no-i18n>${esc(p.headline)}</p>` : ""}<p class="xc-presence"><i class="xc-dot xc-${presenceOf(c.partnerId)}"></i>${esc(presenceLabel(presenceOf(c.partnerId)))}</p></div>
      ${p && p.bio ? `<section><h3>${esc(t("Über"))}</h3><p class="xc-about" data-no-i18n>${esc(p.bio)}</p></section>` : ""}
      ${p && (p.skills || []).length ? `<section><h3>Skills</h3><div class="xc-tags">${p.skills.slice(0, 8).map((s) => `<span data-no-i18n>${esc(X.tagLabel("skills", s))}</span>`).join("")}</div></section>` : ""}
      ${projects}
      <section class="xc-links">${handle ? `<a class="btn btn-small btn-ghost" href="/${esc(handle)}">${esc(t("Profil ansehen"))}</a>` : ""}<a class="btn btn-small btn-ghost" href="/fuer-dich?person=${encodeURIComponent(c.partnerId)}">${esc(t("Eure Passung"))}</a></section>`);
  }
  infoEl.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-tag-filter]");
    if (f) { setTagFilter(f.dataset.tagFilter, f.dataset.name); return; }
    if (e.target.closest("[data-leave]")) {
      const b = e.target.closest("[data-leave]");
      if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = t("Wirklich verlassen?"); setTimeout(() => { delete b.dataset.armed; b.textContent = t("Gruppe verlassen"); }, 5000); return; }
      try {
        await X.api("DELETE", `/conversations/${encodeURIComponent(S.active)}/members/${encodeURIComponent(S.me)}`);
        S.active = ""; setView("list"); history.replaceState(null, "", "nachrichten");
        threadEl.innerHTML = emptyThread(); await loadConversations(); renderInfo();
      } catch (err) { say(fail(err), "error"); }
    }
  });

  // ---------- Eingabe ----------
  const input = () => threadEl.querySelector("[data-input]");
  const composerText = () => (input() ? input().value : "");
  function grow(ta) {
    ta.style.height = "auto";
    // Leer: eine Zeile, auch wenn der Platzhalter länger ist (sonst sitzen +, Emoji und GIF tiefer als der Text)
    if (ta.value) ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }
  function syncSend() {
    const has = composerText().trim().length > 0 || S.pending.length > 0;
    threadEl.querySelector("[data-send]").hidden = !has;
    threadEl.querySelector("[data-mic]").hidden = has || !canRecord();
  }
  function renderComposerTop() {
    const top = threadEl.querySelector("[data-composer-top]");
    if (!top) return;
    const parts = [];
    if (S.replyTo) parts.push(`<div class="xc-chipbar">${ICON.reply}<span>${esc(t("Antwort an"))} <b data-no-i18n>${esc(S.replyTo.author)}</b>: <span data-no-i18n>${esc((S.replyTo.body || "").slice(0, 80))}</span></span><button type="button" class="xc-x" data-reply-cancel aria-label="${esc(t("Antwort abbrechen"))}">×</button></div>`);
    const g = effectiveTag();
    if (g) parts.push(`<div class="xc-chipbar" data-tag-chip="${esc(tagKey(g))}">${ICON[TAG_ICON[g.kind]]}<span>${esc(t(TAG_ABOUT[g.kind]))} <b data-no-i18n>${esc(g.name)}</b></span><button type="button" class="xc-x" data-tag-cancel aria-label="${esc(t("Markierung entfernen"))}">×</button></div>`);
    if (S.pending.length) parts.push(`<div class="xc-pending">${S.pending.map((p, i) => `<span class="xc-pend">${p.preview ? `<img src="${p.preview}" alt="">` : ICON.clip}<span data-no-i18n>${esc(p.file.name)}</span><button type="button" class="xc-x" data-pending-remove="${i}" aria-label="${esc(t("Entfernen"))}">×</button></span>`).join("")}</div>`);
    top.innerHTML = parts.join("");
  }

  threadEl.addEventListener("input", (e) => {
    if (!e.target.matches("[data-input]")) return;
    grow(e.target);
    syncSend();
    pulseTyping();
    syncPicker();
  });
  threadEl.addEventListener("keydown", (e) => {
    if (e.target.matches("[data-input]")) {
      const picker = threadEl.querySelector("[data-picker]");
      if (!picker.hidden && ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) {
        const items = [...picker.querySelectorAll("[data-pick]")];
        let i = items.findIndex((b) => b.classList.contains("is-active"));
        if (e.key === "Escape") { picker.hidden = true; e.preventDefault(); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          i = (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
          items.forEach((b, j) => b.classList.toggle("is-active", j === i));
          return;
        }
        if (items.length) { e.preventDefault(); (items[i] || items[0]).click(); return; }
      }
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
      if (e.key === "ArrowUp" && !e.target.value) {
        const last = [...S.messages].reverse().find((m) => m.mine && m.kind === "text");
        if (last) { e.preventDefault(); S.editId = last.id; renderMessages(); threadEl.querySelector("[data-edit-input]")?.focus(); }
      }
    }
    if (e.target.matches("[data-edit-input]")) {
      if (e.key === "Escape") { S.editId = ""; renderMessages(); input().focus(); }
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.target.form.requestSubmit(); }
    }
  });
  threadEl.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.matches("[data-composer]")) send();
    if (e.target.matches("[data-edit-form]")) saveEdit(e.target.querySelector("textarea").value);
  });

  // @-Erwähnung und /projekt, /arbeitsbereich, /gruppe: Auswahl über der Eingabe
  let tagCache = null;
  function tagChoices() {
    if (tagCache) return tagCache;
    tagCache = (async () => {
      const [{ workspaces }, { communities }] = await Promise.all([
        X.api("GET", "/workspaces"),
        X.api("GET", "/communities").catch(() => ({ communities: [] })),
      ]);
      const projects = await Promise.all((workspaces || []).map((w) => X.api("GET", `/workspaces/${encodeURIComponent(w.id)}/projects`)
        .then((r) => (r.projects || []).filter((p) => p.archived !== true).map((p) => ({ kind: "project", id: p.id, name: p.name, detail: w.name })))
        .catch(() => [])));
      return [
        ...projects.flat(),
        ...(workspaces || []).map((w) => ({ kind: "workspace", id: w.id, name: w.name })),
        ...(communities || []).map((c) => ({ kind: "community", id: c.id, name: c.name })),
      ];
    })();
    tagCache.catch(() => { tagCache = null; });
    return tagCache;
  }
  function mentionAtCursor() {
    const ta = input();
    const before = ta.value.slice(0, ta.selectionStart);
    const m = /(^|\s)@([^\s@]*)$/.exec(before);
    return m ? { query: m[2].toLowerCase(), start: before.length - m[2].length - 1 } : null;
  }
  let pickerSeq = 0;
  async function syncPicker(forceTag = false) {
    const picker = threadEl.querySelector("[data-picker]");
    const ta = input();
    const seq = ++pickerSeq;
    const cmd = forceTag ? { active: true, prefix: "", start: -1, kinds: TAG_KINDS } : tagCommand(ta.value, ta.selectionStart);
    const men = cmd.active ? null : mentionAtCursor();
    let items = [];
    let start = -1;
    if (men) {
      start = men.start;
      const r = S.members.get(S.active) || { members: [] };
      items = r.members.filter((m) => !m.mine && m.displayName.toLowerCase().includes(men.query)).slice(0, 6)
        .map((m) => `<button type="button" data-pick="mention" data-id="${esc(m.id)}" data-name="${esc(m.displayName)}">${avatar(userNow(m.id) || { displayName: m.displayName }, "xc-av-sm")}<span data-no-i18n>${esc(m.displayName)}</span></button>`);
      if (isGroup(conv(S.active)) && "everyone".startsWith(men.query)) items.push(`<button type="button" data-pick="everyone"><span class="xc-av xc-av-sm">@</span><span>@everyone</span></button>`);
    } else if (cmd.active) {
      start = cmd.start;
      let list = [];
      try { list = await tagChoices(); } catch { list = []; }
      if (seq !== pickerSeq) return;
      const needle = cmd.prefix.trim().toLowerCase();
      const ofKind = list.filter((c) => cmd.kinds.includes(c.kind));
      const hits = ofKind.filter((c) => !needle || c.name.toLowerCase().includes(needle)).slice(0, 10);
      items = hits.map((c) => `<button type="button" data-pick="tag" data-kind="${esc(c.kind)}" data-id="${esc(c.id)}" data-name="${esc(c.name)}">${ICON[TAG_ICON[c.kind]]}<span data-no-i18n>${esc(c.name)}</span><small data-no-i18n>${esc(c.kind === "project" ? c.detail : t(TAG_LABEL[c.kind]))}</small></button>`);
      const empty = ofKind.length ? "Nichts gefunden."
        : cmd.kinds.length > 1 ? "Du bist noch in keinem Projekt, Arbeitsbereich oder keiner Gruppe."
        : { project: "Du bist noch in keinem Projekt.", workspace: "Du bist noch in keinem Arbeitsbereich.", community: "Du bist noch in keiner Gruppe." }[cmd.kinds[0]];
      items.unshift(`<p class="xc-picker-head">${esc(t("Nachricht markieren"))}</p>`);
      if (!hits.length) items.push(`<p class="xc-hint">${esc(t(empty))}</p>`);
    }
    if (seq !== pickerSeq) return;
    if (!items.length) { picker.hidden = true; return; }
    picker.innerHTML = items.join("");
    picker.querySelector("[data-pick]")?.classList.add("is-active");
    picker.dataset.start = String(start);
    picker.hidden = false;
  }
  threadEl.addEventListener("click", (e) => {
    const pick = e.target.closest("[data-pick]");
    if (!pick) return;
    const ta = input();
    const picker = threadEl.querySelector("[data-picker]");
    const start = Number(picker.dataset.start);
    const cut = (insert) => {
      if (start < 0) return;
      let after = ta.value.slice(ta.selectionStart);
      const before = ta.value.slice(0, start);
      // Kein doppeltes Leerzeichen, wo der Befehl stand
      if (!insert && /\s$/.test(before) && /^\s/.test(after)) after = after.slice(1);
      ta.value = before + insert + after;
      ta.selectionStart = ta.selectionEnd = start + insert.length;
    };
    if (pick.dataset.pick === "mention") { cut(`@${pick.dataset.name} `); S.mentionIds.set(pick.dataset.id, pick.dataset.name); }
    else if (pick.dataset.pick === "everyone") { cut("@everyone "); S.mentionIds.set("*", "everyone"); }
    else { cut(""); S.tag = { kind: pick.dataset.kind, id: pick.dataset.id, name: pick.dataset.name }; S.filterTagDropped = false; renderComposerTop(); }
    picker.hidden = true;
    ta.focus(); grow(ta); syncSend();
  });
  function setTagFilter(key, name) {
    S.tagFilter = S.tagFilter === key ? "" : key;
    S.tagFilterName = S.tagFilter ? name || "" : "";
    S.filterTagDropped = false;
    renderInfo(); renderComposerTop();
    loadMessages().catch((err) => say(fail(err), "error"));
  }

  // Tippen anzeigen (höchstens alle 3 Sekunden ein Hinweis an die anderen)
  let lastTyping = 0;
  function pulseTyping() {
    if (!S.active || Date.now() - lastTyping < 3000 || !composerText().trim()) return;
    lastTyping = Date.now();
    X.api("POST", `/conversations/${encodeURIComponent(S.active)}/typing`, {}).catch(() => {});
  }
  function renderTyping() {
    const el = threadEl.querySelector("[data-typing]");
    if (!el) return;
    const now = Date.now();
    const names = [...S.typing.entries()].filter(([, v]) => v.conv === S.active && v.until > now).map(([, v]) => v.name);
    el.textContent = names.length === 0 ? "" : names.length === 1 ? `${names[0]} ${t("schreibt …")}` : `${names.join(", ")} ${t("schreiben …")}`;
  }

  async function send() {
    const c = conv(S.active);
    if (!c) return;
    const ta = input();
    const text = ta.value.trim();
    if (!text && !S.pending.length) return;
    const btn = threadEl.querySelector("[data-send]");
    btn.disabled = true;
    try {
      const attachments = [];
      for (const p of S.pending) attachments.push(await upload(p.file));
      const mentions = [...S.mentionIds.entries()].filter(([id, name]) => id !== "*" && text.includes(`@${name}`)).map(([id]) => id);
      await X.api("POST", `/conversations/${encodeURIComponent(c.id)}/messages`, {
        body: text, attachments, mentions, mentionEveryone: S.mentionIds.has("*") && text.includes("@everyone"),
        replyToId: S.replyTo ? S.replyTo.id : undefined, ...tagPayload(),
      });
      const tagged = effectiveTag();
      ta.value = ""; S.draft.delete(c.id); S.pending = []; S.replyTo = null; S.mentionIds = new Map();
      if (tagged) loadChatTags();
      S.tag = null;
      grow(ta); renderComposerTop(); syncSend();
      await refreshActive();
      threadEl.querySelector("[data-messages]").scrollTop = 1e9;
      loadConversations();
    } catch (err) { say(fail(err), "error"); }
    finally { btn.disabled = false; }
  }
  async function upload(file, name = file.name) {
    if (file.size > FILE_MAX) throw new Error(`${t("Diese Datei ist zu groß (höchstens 10 MB):")} ${name}`);
    const dataBase64 = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] || "");
      r.onerror = () => reject(new Error(t("Die Datei konnte nicht gelesen werden.")));
      r.readAsDataURL(file);
    });
    const { file: saved } = await X.api("POST", "/files", { name, mimeType: file.type || "application/octet-stream", dataBase64 });
    return saved.id;
  }
  async function saveEdit(text) {
    const id = S.editId;
    if (!id) return;
    try {
      await X.api("PATCH", `/messages/${encodeURIComponent(id)}`, { body: text.trim() });
      S.editId = "";
      await refreshActive();
      input().focus();
    } catch (err) { say(fail(err), "error"); }
  }

  // Dateien: Auswahl, Ablegen, Einfügen
  function addFiles(files) {
    for (const file of files) {
      if (S.pending.length >= 10) break;
      if (file.size > FILE_MAX) { say(`${t("Diese Datei ist zu groß (höchstens 10 MB):")} ${file.name}`, "error"); continue; }
      S.pending.push({ file, preview: /^image\//.test(file.type) ? URL.createObjectURL(file) : "" });
    }
    renderComposerTop(); syncSend();
  }
  threadEl.addEventListener("change", (e) => { if (e.target.matches("[data-file]")) { addFiles([...e.target.files]); e.target.value = ""; } });
  threadEl.addEventListener("paste", (e) => { if (e.target.matches("[data-input]") && e.clipboardData.files.length) { e.preventDefault(); addFiles([...e.clipboardData.files]); } });
  threadEl.addEventListener("dragover", (e) => { if (S.active && [...(e.dataTransfer.types || [])].includes("Files")) { e.preventDefault(); threadEl.classList.add("is-drop"); } });
  threadEl.addEventListener("dragleave", (e) => { if (e.target === threadEl) threadEl.classList.remove("is-drop"); });
  threadEl.addEventListener("drop", (e) => { threadEl.classList.remove("is-drop"); if (S.active && e.dataTransfer.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } });

  // Sprachnachricht
  const canRecord = () => typeof MediaRecorder !== "undefined" && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let rec = null;
  async function toggleRecording() {
    if (rec) return stopRecording(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) || "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec = { recorder, stream, chunks, started: Date.now(), discard: false, timer: setInterval(showRec, 500) };
      recorder.onstop = () => finishRecording();
      recorder.start();
      showRec();
    } catch {
      say(t("Kein Zugriff aufs Mikrofon. Erlaube es in deinem Browser, um Sprachnachrichten aufzunehmen."), "error");
    }
  }
  function showRec() {
    const btn = threadEl.querySelector("[data-mic]");
    if (!btn || !rec) return;
    const s = Math.floor((Date.now() - rec.started) / 1000);
    btn.classList.add("is-rec");
    btn.innerHTML = `<span>${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}</span>`;
    btn.setAttribute("aria-label", t("Aufnahme beenden und senden"));
    if (s >= 900) stopRecording(false);
  }
  function stopRecording(discard) { if (!rec) return; rec.discard = discard; rec.recorder.stop(); }
  async function finishRecording() {
    const r = rec; rec = null;
    clearInterval(r.timer);
    r.stream.getTracks().forEach((tr) => tr.stop());
    const btn = threadEl.querySelector("[data-mic]");
    if (btn) { btn.classList.remove("is-rec"); btn.innerHTML = ICON.mic; btn.setAttribute("aria-label", t("Sprachnachricht aufnehmen")); }
    const durationMs = Date.now() - r.started;
    if (r.discard || durationMs < 700 || !S.active) return;
    const type = (r.recorder.mimeType || "audio/webm").split(";")[0];
    try {
      const blob = new Blob(r.chunks, { type });
      const id = await upload(blob, `Sprachnachricht.${type.includes("mp4") ? "m4a" : type.split("/")[1]}`);
      await X.api("POST", `/conversations/${encodeURIComponent(S.active)}/messages`, { body: "", attachments: [id], voice: { durationMs } });
      await refreshActive();
      threadEl.querySelector("[data-messages]").scrollTop = 1e9;
      loadConversations();
    } catch (err) { say(fail(err), "error"); }
  }

  // GIFs (über den App-Server, „Powered by GIPHY“)
  let gifTimer = 0;
  async function openGifs() {
    const pop = threadEl.querySelector("[data-gif-pop]");
    if (!pop.hidden) { pop.hidden = true; return; }
    pop.innerHTML = `<input type="search" data-gif-q placeholder="${esc(t("GIFs suchen"))}" aria-label="${esc(t("GIFs suchen"))}"><div class="xc-gif-grid" data-gif-grid><p class="xc-hint">${esc(t("Wird geladen …"))}</p></div><p class="xc-giphy">Powered by GIPHY</p>`;
    pop.hidden = false;
    pop.querySelector("[data-gif-q]").focus();
    loadGifs("");
  }
  async function loadGifs(q) {
    const grid = threadEl.querySelector("[data-gif-grid]");
    if (!grid) return;
    try {
      const r = await X.api("GET", `/gifs?limit=24${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      if (!r.available) { grid.innerHTML = `<p class="xc-hint">${esc(t("GIFs sind auf diesem Server noch nicht eingerichtet."))}</p>`; return; }
      grid.innerHTML = (r.gifs || []).map((g, i) => `<button type="button" data-gif="${i}" aria-label="${esc(g.title || "GIF")}"><img src="${esc(g.previewUrl || g.url)}" alt="" loading="lazy"></button>`).join("") || `<p class="xc-hint">${esc(t("Keine GIFs gefunden."))}</p>`;
      grid._gifs = r.gifs || [];
    } catch (err) { grid.innerHTML = `<p class="xc-hint">${esc(fail(err))}</p>`; }
  }
  threadEl.addEventListener("input", (e) => {
    if (!e.target.matches("[data-gif-q]")) return;
    clearTimeout(gifTimer);
    gifTimer = setTimeout(() => loadGifs(e.target.value.trim()), 300);
  });
  async function sendGif(g) {
    threadEl.querySelector("[data-gif-pop]").hidden = true;
    try {
      const tagged = effectiveTag();
      await X.api("POST", `/conversations/${encodeURIComponent(S.active)}/messages`, { body: "", gif: g, replyToId: S.replyTo ? S.replyTo.id : undefined, ...tagPayload() });
      S.replyTo = null; S.tag = null; renderComposerTop();
      if (tagged) loadChatTags();
      await refreshActive();
      threadEl.querySelector("[data-messages]").scrollTop = 1e9;
      loadConversations();
    } catch (err) { say(fail(err), "error"); }
  }

  // ---------- Klicks im Verlauf ----------
  threadEl.addEventListener("click", async (e) => {
    const target = e.target;
    const close = (sel) => threadEl.querySelectorAll(sel).forEach((el) => { el.hidden = true; });
    if (target.closest("[data-back]")) { setView("list"); return; }
    if (target.closest("[data-info-toggle]")) {
      // Schmale Fenster zeigen die Details als eigene Ansicht, breite als dritte Spalte
      if (window.innerWidth <= 1180) { setView("info"); return; }
      S.infoOpen = !S.infoOpen;
      renderInfo(); renderHeader();
      return;
    }
    if (target.closest("[data-plus]")) {
      const menu = threadEl.querySelector("[data-plus-menu]");
      menu.hidden = !menu.hidden;
      target.closest("[data-plus]").setAttribute("aria-expanded", String(!menu.hidden));
      return;
    }
    if (target.closest("[data-attach]")) { close("[data-plus-menu]"); threadEl.querySelector("[data-file]").click(); return; }
    if (target.closest("[data-gif-open]")) { close("[data-plus-menu]"); openGifs(); return; }
    if (target.closest("[data-tag-open]")) { close("[data-plus-menu]"); input().focus(); syncPicker(true); return; }
    if (target.closest("[data-emoji-open]")) { const pop = threadEl.querySelector("[data-emoji-pop]"); pop.hidden = !pop.hidden; return; }
    const emo = target.closest("[data-emoji]");
    if (emo) {
      const ta = input();
      const pos = ta.selectionStart ?? ta.value.length;
      ta.value = ta.value.slice(0, pos) + emo.dataset.emoji + ta.value.slice(pos);
      ta.selectionStart = ta.selectionEnd = pos + emo.dataset.emoji.length;
      close("[data-emoji-pop]"); ta.focus(); syncSend();
      return;
    }
    const gifBtn = target.closest("[data-gif]");
    if (gifBtn) { const grid = gifBtn.closest("[data-gif-grid]"); sendGif(grid._gifs[Number(gifBtn.dataset.gif)]); return; }
    if (target.closest("[data-mic]")) { toggleRecording(); return; }
    if (target.closest("[data-reply-cancel]")) { S.replyTo = null; renderComposerTop(); return; }
    if (target.closest("[data-tag-cancel]")) { S.tag = null; S.filterTagDropped = !!S.tagFilter; renderComposerTop(); renderMessages(); return; }
    const chip = target.closest("[data-tag-filter]");
    if (chip) { setTagFilter(chip.dataset.tagFilter, chip.dataset.name); return; }
    const rm = target.closest("[data-pending-remove]");
    if (rm) { const [p] = S.pending.splice(Number(rm.dataset.pendingRemove), 1); if (p && p.preview) URL.revokeObjectURL(p.preview); renderComposerTop(); syncSend(); return; }
    if (target.closest("[data-older]")) { if (!S.loadingOlder) { S.loadingOlder = true; loadMessages({ older: true }).finally(() => { S.loadingOlder = false; }); } return; }
    if (target.closest("[data-filter-clear]")) { setTagFilter(S.tagFilter, ""); return; }
    if (target.closest("[data-edit-cancel]")) { S.editId = ""; renderMessages(); return; }
    const jump = target.closest("[data-jump]");
    if (jump) { const el = threadEl.querySelector(`[data-msg="${CSS.escape(jump.dataset.jump)}"]`); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("is-flash"); setTimeout(() => el.classList.remove("is-flash"), 1200); } return; }
    const dl = target.closest("[data-download]");
    if (dl) {
      try { const url = await fileUrl(dl.dataset.download); const a = document.createElement("a"); a.href = url; a.download = dl.dataset.name || "datei"; a.click(); }
      catch (err) { say(fail(err), "error"); }
      return;
    }
    const img = target.closest("[data-kind=image]");
    if (img && img.querySelector("img")) { lightbox(img.querySelector("img").src, img.dataset.name); return; }

    const msgEl = target.closest("[data-msg]");
    if (!msgEl) {
      if (!target.closest(".xc-pop, .xc-menu")) close(".xc-pop, .xc-menu");
      return;
    }
    const m = S.messages.find((x) => x.id === msgEl.dataset.msg);
    if (!m) return;
    const react = target.closest("[data-react]");
    if (react) {
      try { await X.api("POST", `/messages/${encodeURIComponent(m.id)}/reactions`, { emoji: react.dataset.react }); await refreshActive(); }
      catch (err) { say(fail(err), "error"); }
      return;
    }
    if (target.closest("[data-more-react]")) {
      const tools = target.closest(".xc-tools");
      if (tools.querySelector(".xc-more")) { tools.querySelector(".xc-more").remove(); return; }
      tools.insertAdjacentHTML("beforeend", `<div class="xc-more">${[...QUICK.slice(3), ...EMOJI.filter((x) => !QUICK.includes(x)).slice(0, 12)].map((x) => `<button type="button" data-react="${x}" aria-label="${x}">${x}</button>`).join("")}</div>`);
      return;
    }
    if (target.closest("[data-reply]")) { S.replyTo = m; renderComposerTop(); input().focus(); return; }
    if (target.closest("[data-edit]")) { S.editId = m.id; renderMessages(); threadEl.querySelector("[data-edit-input]")?.focus(); return; }
    const del = target.closest("[data-delete]");
    if (del) {
      if (!del.dataset.armed) { del.dataset.armed = "1"; del.classList.add("is-armed"); del.setAttribute("aria-label", t("Wirklich löschen?")); setTimeout(() => { delete del.dataset.armed; del.classList.remove("is-armed"); }, 4000); return; }
      try { await X.api("DELETE", `/messages/${encodeURIComponent(m.id)}`); await refreshActive(); loadConversations(); }
      catch (err) { say(fail(err), "error"); }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    threadEl.querySelectorAll(".xc-pop, .xc-menu").forEach((el) => { el.hidden = true; });
    if (rec) stopRecording(true);
  });

  function lightbox(src, name) {
    const dlg = document.createElement("dialog");
    dlg.className = "xc-lightbox";
    dlg.innerHTML = `<form method="dialog"><button class="xc-x" aria-label="${esc(t("Schließen"))}">×</button></form><img src="${src}" alt="${esc(name || "")}">`;
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  // ---------- Neues Gespräch ----------
  function newConversation() {
    const dlg = document.createElement("dialog");
    dlg.className = "xm-dialog xc-new";
    const chosen = new Map();
    dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
      <h2>${esc(t("Neues Gespräch"))}</h2>
      <label>${esc(t("Personen suchen"))}<input type="search" data-q placeholder="${esc(t("Name eingeben …"))}" autocomplete="off"></label>
      <div class="xc-chosen" data-chosen></div>
      <ul class="xc-results" data-results></ul>
      <label data-group-name hidden>${esc(t("Gruppenname (optional)"))}<input name="title" maxlength="120" placeholder="${esc(t("z. B. Launch-Team"))}"></label>
      <p class="xm-error" data-err></p>
      <div class="xm-row"><button class="btn btn-small" value="ok" data-start disabled>${esc(t("Gespräch starten"))}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>${esc(t("Abbrechen"))}</button></div>
    </form>`;
    document.body.append(dlg);
    const q = dlg.querySelector("[data-q]"), results = dlg.querySelector("[data-results]");
    let timer = 0, found = [];
    const sync = () => {
      dlg.querySelector("[data-chosen]").innerHTML = [...chosen.values()].map((u) => `<button type="button" class="xm-chip" aria-pressed="true" data-unpick="${esc(u.id)}"><span data-no-i18n>${esc(u.displayName)}</span> ×</button>`).join("");
      dlg.querySelector("[data-group-name]").hidden = chosen.size < 2;
      const start = dlg.querySelector("[data-start]");
      start.disabled = chosen.size === 0;
      start.textContent = t(chosen.size > 1 ? "Gruppe erstellen" : "Gespräch starten");
    };
    q.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const term = q.value.trim();
        if (term.length < 2) { results.innerHTML = ""; return; }
        try { found = ((await X.api("GET", `/users/search?q=${encodeURIComponent(term)}`)).users || []).filter((u) => u.id !== S.me); }
        catch { found = []; }
        results.innerHTML = found.map((u) => `<li><button type="button" data-pick-user="${esc(u.id)}" aria-pressed="${chosen.has(u.id)}">${avatar(u, "xc-av-sm")}<span><b data-no-i18n>${esc(u.displayName)}</b>${u.headline ? `<small data-no-i18n>${esc(u.headline)}</small>` : ""}</span></button></li>`).join("") || `<li class="xc-hint">${esc(t("Niemand gefunden."))}</li>`;
      }, 250);
    });
    dlg.addEventListener("click", (e) => {
      const p = e.target.closest("[data-pick-user]");
      if (p) { const u = found.find((x) => x.id === p.dataset.pickUser); if (chosen.has(u.id)) chosen.delete(u.id); else chosen.set(u.id, u); p.setAttribute("aria-pressed", String(chosen.has(u.id))); sync(); }
      const un = e.target.closest("[data-unpick]");
      if (un) { chosen.delete(un.dataset.unpick); sync(); }
    });
    dlg.addEventListener("close", async () => {
      const go = dlg.returnValue === "ok" && chosen.size > 0;
      const title = dlg.querySelector("[name=title]").value.trim();
      dlg.remove();
      if (!go) return;
      try {
        const ids = [...chosen.keys()];
        const { conversation } = await X.api("POST", "/conversations", ids.length === 1 ? { kind: "dm", memberIds: ids } : { kind: "group", memberIds: ids, title });
        await loadConversations();
        open(conversation.id);
      } catch (err) { say(fail(err), "error"); notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; }
    });
    dlg.showModal();
    q.focus();
  }

  // ---------- Live-Updates (Long-Polling wie die App, eine Warteschlange pro Tab) ----------
  let polling = false, refreshTimer = 0;
  async function pollLoop() {
    if (polling) return;
    polling = true;
    let delay = 1000;
    while (polling) {
      try {
        const { events } = await X.api("GET", `/realtime/poll?client=${TAB}`);
        delay = 1000;
        handle(events || []);
      } catch {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30000);
      }
    }
  }
  function handle(events) {
    let refreshList = false, refreshThread = false, presence = false;
    for (const ev of events) {
      if (ev.type === "message") {
        refreshList = true;
        if (ev.conversationId === S.active) refreshThread = true;
      } else if (ev.type === "typing" && ev.userId !== S.me) {
        S.typing.set(ev.userId, { conv: ev.conversationId, name: ev.name, until: Date.now() + 5000 });
        renderTyping();
        setTimeout(renderTyping, 5100);
      } else if (ev.type === "presence") {
        S.presence.set(ev.userId, ev.online ? ev.status : "offline"); presence = true;
      } else if (ev.type === "presence.snapshot") {
        for (const [id, st] of Object.entries(ev.statuses || {})) S.presence.set(id, st);
        presence = true;
      }
    }
    if (refreshThread) { for (const [id, v] of S.typing) if (v.conv === S.active) S.typing.delete(id); renderTyping(); refreshActive(); }
    if (refreshList) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => loadConversations().catch(() => {}), 300); }
    if (presence) { renderList(); if (S.active) { renderHeader(); renderInfo(); } }
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.active) { refreshActive(); markRead(); } });

  // ---------- Ansicht (Handy: Liste → Verlauf → Details) ----------
  function setView(v) {
    S.view = v;
    root.dataset.view = v;
    if (v === "info") renderInfo();
  }
  infoEl.addEventListener("click", (e) => { if (e.target.closest("[data-info-back]")) setView("thread"); });
  const emptyThread = () => `<div class="xc-placeholder"><p>${esc(t("Wähle links ein Gespräch oder starte ein neues."))}</p></div>`;

  // Chat-Hintergrund (nur in diesem Browser gemerkt)
  function bgPickerHtml() {
    return `<div class="xc-pop-anchor"><button type="button" class="xc-icon" data-bg-btn aria-label="${esc(t("Chat-Hintergrund ändern"))}" aria-haspopup="menu" aria-expanded="false">${ICON.palette}</button>
      <div class="xc-menu xc-menu-right" data-bg-menu role="menu" hidden>${CHAT_BGS.map(([k, l]) => `<button type="button" role="menuitemradio" aria-checked="${k === chatBg}" data-bg="${k}"><span class="xc-swatch xc-swatch-${k}"></span><span>${esc(t(l))}</span></button>`).join("")}</div></div>`;
  }
  function applyBg() { root.dataset.chatBg = chatBg; }
  threadEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bg-btn]");
    if (btn) { const m = threadEl.querySelector("[data-bg-menu]"); m.hidden = !m.hidden; btn.setAttribute("aria-expanded", String(!m.hidden)); return; }
    const opt = e.target.closest("[data-bg]");
    if (opt) {
      chatBg = opt.dataset.bg;
      try { localStorage.setItem(BG_KEY, chatBg); } catch { /* nur jetzt */ }
      applyBg();
      threadEl.querySelectorAll("[data-bg]").forEach((b) => b.setAttribute("aria-checked", String(b === opt)));
      threadEl.querySelector("[data-bg-menu]").hidden = true;
    }
  });

  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.4 11.1l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.5-8.5a3.5 3.5 0 0 1 5 5L11 17.2a2 2 0 0 1-2.8-2.8l7.8-7.8"/></svg>',
    gif: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M9.5 10.5H8a1.5 1.5 0 0 0 0 3h1.5V12M12.5 10v4M15.5 14v-4h2.5M15.5 12h2"/></svg>',
    building: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14M16 10h2a2 2 0 0 1 2 2v8M3 20h18M8 8h4M8 12h4M8 16h4"/></svg>',
    users: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
    folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7L4 12l6 5M4 12h10a6 6 0 0 1 6 6"/></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
    smile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.01M15 9.5v.01"/></svg>',
    palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.2-1.8-1.2-3.2 0-1.2 1-1.8 2.2-1.8H17a4 4 0 0 0 4-4c0-4-4-7-9-7z"/></svg>',
  };

  // ---------- Start ----------
  async function openPartner(websiteId) {
    const { profile } = await X.api("GET", `/users/by-website/${encodeURIComponent(websiteId)}`);
    const { conversation } = await X.api("POST", "/conversations", { kind: "dm", memberIds: [profile.id] });
    if (!conv(conversation.id)) await loadConversations();
    await open(conversation.id);
  }
  // Von „Gesuche & Angebote“ (?anzeige=ID): Antwort mit Bezug zur Anzeige vorbereiten
  async function prefillListing(rawId) {
    if (!/^\d+$/.test(rawId || "") || typeof sb === "undefined" || !sb) return;
    try {
      const { data: l } = await sb.from("listings").select("id, title, type").eq("id", Number(rawId)).maybeSingle();
      const ta = input();
      if (!l || !ta || ta.value.trim()) return;
      ta.value = `${t("Hallo! Ich melde mich auf dein")} ${t(l.type === "suche" ? "Gesuch" : "Angebot")} „${l.title}“: https://xyntal.de/boerse#anzeige-${l.id}\n\n`;
      grow(ta); syncSend(); ta.focus();
    } catch { /* ohne Bezug weiterschreiben */ }
  }

  async function boot() {
    const me = await currentMember();
    if (!me) { location.replace("login?next=nachrichten"); return; }
    if (me.status === "rejected") { notice.innerHTML = accessNotice({ me, isMember: false, canAct: false }, "Nachrichten schreiben", { open: true }); return; }
    let s;
    try { s = await X.session(); } catch (err) { notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; return; }
    S.me = s.userId;
    root.hidden = false;
    threadEl.innerHTML = emptyThread();
    renderInfo();
    try { await loadConversations(); } catch (err) { notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; return; }
    pollLoop();
    const params = new URLSearchParams(location.search);
    try {
      if (UUID.test(params.get("an") || "") && params.get("an") !== me.id) {
        await openPartner(params.get("an"));
        await prefillListing(params.get("anzeige"));
      } else if (params.get("c") && conv(params.get("c"))) {
        await open(params.get("c"), { push: false });
      } else if (params.get("neu") === "1") {
        newConversation();
      }
    } catch (err) {
      notice.innerHTML = `<div class="notice">${esc(err && err.status === 404 ? t("Diese Person kann gerade nicht angeschrieben werden.") : fail(err))}</div>`;
    }
  }
  // Sprache gewechselt: Server-Texte (Einblick) neu holen, alles neu zeichnen, Entwurf behalten
  document.addEventListener("xyntal:lang", () => {
    renderList();
    if (!S.active) { renderInfo(); return; }
    S.draft.set(S.active, composerText());
    S.insight.clear();
    renderThreadShell(); renderMessages({ stick: true }); renderInfo();
    const c = conv(S.active);
    if (c && !isGroup(c)) loadInsight(c.partnerId);
  });
  setTimeout(() => boot().catch((err) => { notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; }), 300);
})();
