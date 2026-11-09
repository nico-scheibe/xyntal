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
  const TAB = Math.random().toString(36).slice(2, 10);
  const BG_KEY = "xyntal-chat-bg";
  const CHAT_BGS = [["xyntal", "Xyntal"], ["space", "Weltall"], ["natur", "Natur"], ["tech", "Tech"], ["fun", "Fun"], ["none", "Ohne Muster"]];
  const GROUP_EMOJI = ["", "🚀", "💡", "🎯", "🛠️", "🎨", "📈", "🤝", "🔥", "🌱", "📚", "🎉"];
  const emojiRow = (attr, current, label) => `<div class="xc-emoji-row" role="radiogroup" aria-label="${esc(label)}">${GROUP_EMOJI.map((x) => `<button type="button" role="radio" aria-checked="${x === current}" ${attr}="${x}" aria-label="${esc(x || t("Initialen"))}">${x || "Aa"}</button>`).join("")}</div>`;
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const INVITE = /^[A-Za-z0-9_-]{8,64}$/;
  // Gruppen finden und beitreten (App-Server: messaging/groups.ts)
  const CATEGORY_LABEL = { tech: "Tech & Code", design: "Design", startup: "Gründen", marketing: "Marketing", ai: "KI", gaming: "Gaming",
    learning: "Lernen", career: "Karriere", local: "Vor Ort", social: "Austausch", other: "Sonstiges" };
  const CATEGORY_EMOJI = { tech: "💻", design: "🎨", startup: "🚀", marketing: "📣", ai: "🤖", gaming: "🎮", learning: "📚", career: "💼", local: "📍", social: "💬", other: "✨" };
  const VIS_LABEL = { private: "Privat", workspace: "Nur Arbeitsbereich", public: "Öffentlich" };
  const POLICY_LABEL = { open: "Offen – direkt beitreten", request: "Auf Anfrage", invite: "Nur mit Einladung" };

  const S = {
    me: "", meName: "", conversations: [], filter: "all", space: "all", query: "", searchHits: [], myRequests: [],
    mode: "thread", discover: { q: "", category: "", scope: "all", groups: [], loading: false, categoryCounts: {} },
    access: new Map(), requests: new Map(), invites: new Map(),
    active: "", messages: [], hasMore: false, readers: [], members: new Map(), users: new Map(), presence: new Map(),
    insight: new Map(), tagFilter: "", tagFilterName: "", filterTagDropped: false, chatTags: [], replyTo: null, editId: "", pending: [], tag: null,
    mentionIds: new Map(), typing: new Map(), view: "list", infoOpen: true, draft: new Map(), loadingOlder: false,
    editGroup: false, editEmoji: "", addingPeople: false, confirmDelete: false,
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
  // Jede Gruppe bekommt einen festen Farbton aus dem Logo-Verlauf (Lila → Blau → Cyan), abgeleitet vom Namen
  function hue(text) {
    let h = 0;
    for (const ch of String(text || "")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return h % 4;
  }
  // Ein eigenes Gruppenbild (vom Server als data-URL) geht vor Emoji und Initialen.
  const PICTURE_OK = /^data:image\/(jpeg|png);base64,/;
  function groupAvatar(c, size = "") {
    const pic = PICTURE_OK.test(c.avatar || "");
    const inner = pic ? `<img src="${esc(c.avatar)}" alt="">` : c.emoji ? esc(c.emoji) : esc(initials(c.title));
    // Emoji und Initialen sitzen auf einer farbigen Kachel, ein hochgeladenes Bild ist rund (wie die Profilbilder).
    return `<span class="xc-av xc-av-group xc-hue-${hue(c.id || c.title)}${pic ? " xc-av-pic" : c.emoji ? " has-emoji" : ""} ${size}" aria-hidden="true">${inner}</span>`;
  }
  // In welchen Bereich ein Gespräch gehört: Privat (Direktnachrichten, private Gruppen),
  // Teams (an einen Arbeitsbereich oder ein Projekt gebunden), Gruppen (öffentlich, zum Beitreten)
  function spaceOf(c) {
    if (c.workspaceId || c.projectId) return "teams";
    if (c.kind !== "dm" && c.visibility === "public") return "groups";
    return "private";
  }
  const ICON_SVG = (name) => ICON[name] || "";
  function visBadge(c) {
    // Heißt der Chat wie sein Projekt bzw. Arbeitsbereich, reicht das Symbol
    const named = (name) => (name && name !== c.title ? `<span data-no-i18n>${esc(name)}</span>` : "");
    if (c.projectName) return `<span class="xc-vis" title="${esc(t("Projekt"))}: ${esc(c.projectName)}">${ICON_SVG("folder")}${named(c.projectName)}</span>`;
    if (c.workspaceName) return `<span class="xc-vis" title="${esc(t("Arbeitsbereich"))}: ${esc(c.workspaceName)}">${ICON_SVG("building")}${named(c.workspaceName)}</span>`;
    if (c.kind !== "dm" && c.visibility === "public") return `<span class="xc-vis" title="${esc(t("Öffentliche Gruppe"))}">${ICON_SVG("globe")}</span>`;
    return "";
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
  function say(text, kind = "", ms = 6000) {
    const el = root.querySelector("[data-status]");
    if (!el) return;
    el.textContent = text;
    el.className = `xc-status${kind ? " " + kind : ""}`;
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ""; }, ms);
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

  // ---------- Link-Vorschauen (wie LinkPreviewCard.qml in der App) ----------
  // Der App-Server liest die verlinkte Seite und liefert ihr Bild selbst aus
  // (GET /links/preview, /links/thumb/…) – beim Scrollen erfährt die verlinkte
  // Seite nichts. Den Player von YouTube, TikTok, Instagram oder Vimeo lädt erst
  // der Klick auf „Abspielen“, an Ort und Stelle statt der Karte.
  const PLAYER_ORIGINS = { youtube: "https://www.youtube-nocookie.com", tiktok: "https://www.tiktok.com", instagram: "https://www.instagram.com", vimeo: "https://player.vimeo.com" };
  const LINK_RE = /\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)"'\]]/;
  const previews = new Map(); // URL → Vorschau | null (nichts zu zeigen) | Promise
  const thumbs = new Map();   // "/links/thumb/<id>" → blob:-URL | Promise
  let playing = null;         // { msg, url } – das laufende Video
  function firstLink(m) {
    if (!m.body || m.isCode || m.kind === "gif" || m.kind === "voice") return "";
    const hit = LINK_RE.exec(m.body);
    return hit ? hit[0] : "";
  }
  // Nur die Player, die der Server baut: genau diese Herkunft, sonst kein iframe
  function embedOf(p) {
    if (!p || p.kind !== "video" || !p.embed || !PLAYER_ORIGINS[p.provider]) return null;
    try { return new URL(p.embed.url).origin === PLAYER_ORIGINS[p.provider] ? p.embed : null; } catch { return null; }
  }
  function loadPreview(url) {
    if (previews.has(url)) return Promise.resolve(previews.get(url));
    const p = X.api("GET", `/links/preview?url=${encodeURIComponent(url)}`)
      .then((r) => { const v = r && r.enabled !== false && r.preview && r.preview.ok ? r.preview : null; previews.set(url, v); return v; })
      // „Später“ (429) oder kein Netz: beim nächsten Zeichnen erneut fragen; alles andere ist endgültig
      .catch((err) => { if (!err || err.status === 429 || !err.status) previews.delete(url); else previews.set(url, null); return null; });
    previews.set(url, p);
    return p;
  }
  function thumbUrl(path) {
    if (thumbs.has(path)) return Promise.resolve(thumbs.get(path));
    const p = (async () => {
      const s = await X.session();
      const res = await fetch(X.API + path, { headers: { authorization: `Bearer ${s.token}` } });
      const blob = res.ok ? await res.blob() : null;
      if (!blob || !/^image\/(jpeg|png|webp|gif)$/.test(blob.type)) throw new Error(String(res.status));
      const u = URL.createObjectURL(blob);
      thumbs.set(path, u);
      return u;
    })();
    thumbs.set(path, p);
    p.catch(() => thumbs.delete(path));
    return p;
  }
  function thumbHtml(p) {
    if (!p.thumbnail || !/^\/links\/thumb\/[0-9a-f]{32}$/.test(p.thumbnail)) return `<span class="xc-lp-ph" aria-hidden="true"></span>`;
    const ready = thumbs.get(p.thumbnail);
    return typeof ready === "string"
      ? `<img src="${ready}" alt="" loading="lazy">`
      : `<span class="xc-lp-ph" aria-hidden="true"></span><img data-link-thumb="${esc(p.thumbnail)}" alt="" hidden>`;
  }
  const siteLine = (p) => [p.siteName, p.author].filter(Boolean).join(" · ");
  function linkCardHtml(url, msgId) {
    if (!url) return "";
    const p = previews.get(url);
    if (p === undefined || p instanceof Promise) return `<div class="xc-lp-slot" data-link-preview="${esc(url)}"></div>`;
    if (!p) return "";
    const embed = embedOf(p);
    const tall = embed && embed.aspect === "9:16" ? " is-tall" : "";
    const title = p.title ? `<b data-no-i18n>${esc(p.title)}</b>` : "";
    const meta = siteLine(p) ? `<small data-no-i18n>${esc(siteLine(p))}</small>` : "";
    if (embed && playing && playing.msg === msgId && playing.url === url) {
      return `<div class="xc-lp xc-lp-player${tall}" data-link-live data-url="${esc(url)}">
        <iframe src="${esc(embed.url)}" title="${esc(p.title || p.siteName || t("Video"))}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"></iframe>
        <div class="xc-lp-bar"><span>${meta}</span><a href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(t("Original öffnen"))}</a><button type="button" class="xc-x" data-link-close aria-label="${esc(t("Player schließen"))}">×</button></div>
      </div>`;
    }
    if (embed) {
      return `<div class="xc-lp xc-lp-video${tall}" data-url="${esc(url)}">
        <button type="button" class="xc-lp-media" data-link-play aria-label="${esc(t("Video abspielen"))}: ${esc(p.title || p.siteName)}">${thumbHtml(p)}<span class="xc-lp-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg></span></button>
        <span class="xc-lp-text">${meta}${title}</span>
      </div>`;
    }
    const desc = p.description ? `<span data-no-i18n>${esc(p.description)}</span>` : "";
    const pic = p.thumbnail ? `<span class="xc-lp-thumb">${thumbHtml(p)}</span>` : "";
    return `<a class="xc-lp xc-lp-page" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow"><span class="xc-lp-text">${meta}${title}${desc}</span>${pic}</a>`;
  }
  // Erst wenn eine Karte in Sichtweite kommt, wird gefragt – ein langer Verlauf löst nicht für jeden Link eine Anfrage aus
  const previewObserver = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { previewObserver.unobserve(e.target); fillPreview(e.target); } }), { rootMargin: "240px 0px" })
    : null;
  async function fillPreview(slot) {
    const url = slot.dataset.linkPreview;
    await loadPreview(url);
    if (!slot.isConnected) return; // inzwischen neu gezeichnet – die neue Fassung zeigt sie aus dem Zwischenspeicher
    const scroller = threadEl.querySelector("[data-messages]");
    const atBottom = scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
    const msgEl = slot.closest("[data-msg]");
    slot.outerHTML = linkCardHtml(url, msgEl ? msgEl.dataset.msg : "");
    if (msgEl) hydrateLinks(msgEl);
    if (atBottom) scroller.scrollTop = scroller.scrollHeight;
  }
  function hydrateLinks(scope) {
    scope.querySelectorAll("[data-link-preview]").forEach((slot) => (previewObserver ? previewObserver.observe(slot) : fillPreview(slot)));
    scope.querySelectorAll("[data-link-thumb]").forEach(async (img) => {
      try {
        img.src = await thumbUrl(img.dataset.linkThumb);
        img.hidden = false;
        img.previousElementSibling?.remove();
      } catch { /* bleibt ohne Bild */ }
    });
  }
  function startPlayer(card) {
    const msgEl = card.closest("[data-msg]");
    const url = card.dataset.url;
    if (!msgEl || !embedOf(previews.get(url))) { window.open(url, "_blank", "noopener"); return; }
    stopPlayer();
    playing = { msg: msgEl.dataset.msg, url };
    const box = msgEl.querySelector(`.xc-lp[data-url="${CSS.escape(url)}"]`);
    if (box) box.outerHTML = linkCardHtml(url, playing.msg);
    msgEl.querySelector("[data-link-live] iframe")?.focus();
  }
  // Das iframe verschwindet ganz – damit endet die Wiedergabe, und der Anbieter hört nichts mehr
  function stopPlayer() {
    const live = threadEl.querySelector("[data-link-live]");
    const was = playing;
    playing = null;
    if (live && was) { const msgEl = live.closest("[data-msg]"); live.outerHTML = linkCardHtml(was.url, was.msg); if (msgEl) hydrateLinks(msgEl); }
  }

  // ---------- Gesprächsliste ----------
  function passes(c) {
    if (S.space !== "all" && spaceOf(c) !== S.space) return false;
    if (S.query) {
      const q = S.query.toLowerCase();
      return [c.title, c.workspaceName, c.projectName, c.description].some((v) => (v || "").toLowerCase().includes(q));
    }
    switch (S.filter) {
      case "unread": return !c.archived && c.unread > 0;
      case "requests": return !c.archived && c.pendingRequests > 0;
      case "archived": return c.archived;
      default: return !c.archived;
    }
  }
  function snippet(c) {
    if (c.lastKind === "voice") return t("🎤 Sprachnachricht");
    if (c.lastKind === "gif") return "GIF";
    if (c.lastKind === "system") return t("Neues in der Gruppe");
    if (!c.lastSnippet && c.lastKind) return t("📎 Datei");
    return c.lastSnippet || t("Noch keine Nachrichten");
  }
  function itemHtml(c) {
    const partner = c.partnerId ? userNow(c.partnerId) : null;
    const av = isGroup(c) ? groupAvatar(c) : avatar(partner || { displayName: c.title });
    const dot = !isGroup(c) ? `<i class="xc-dot xc-${presenceOf(c.partnerId)}"></i>` : "";
    const req = c.pendingRequests ? `<em class="xc-badge xc-badge-req" title="${esc(t("Beitrittsanfragen"))}">+${c.pendingRequests}</em>` : "";
    return `<li><button type="button" class="xc-item${c.id === S.active && S.mode === "thread" ? " is-active" : ""}${c.unread ? " is-unread" : ""}" data-open="${esc(c.id)}" aria-current="${c.id === S.active}">
      <span class="xc-av-wrap">${av}${dot}</span>
      <span class="xc-item-main"><span class="xc-item-top"><b data-no-i18n>${esc(c.title || t("Gespräch"))}</b>${visBadge(c)}<time>${esc(listTime(c.updatedTs))}</time></span>
      <span class="xc-item-sub"><span data-no-i18n>${esc(snippet(c))}</span>${req}${c.mentions ? `<em class="xc-badge xc-badge-at">@</em>` : ""}${c.unread ? `<em class="xc-badge">${c.unread > 99 ? "99+" : c.unread}</em>` : ""}</span></span>
    </button></li>`;
  }
  function renderList() {
    const shown = S.conversations.filter(passes);
    // Favoriten zuerst, dann wie gehabt nach letzter Nachricht
    const pinned = shown.filter((c) => c.favorite);
    const rest = shown.filter((c) => !c.favorite);
    let items = "";
    if (pinned.length && !S.query) items += `<p class="xc-label">${esc(t("Angeheftet"))}</p><ul class="xc-items">${pinned.map(itemHtml).join("")}</ul>`;
    if (rest.length) items += `${pinned.length && !S.query ? `<p class="xc-label">${esc(t("Gespräche"))}</p>` : ""}<ul class="xc-items">${rest.map(itemHtml).join("")}</ul>`;
    // Eigene offene Beitrittsanfragen: sichtbar unter „Anfragen“, bis jemand entscheidet
    const waiting = S.filter === "requests" && !S.query && S.myRequests.length
      ? `<p class="xc-label">${esc(t("Deine Anfragen"))}</p><ul class="xc-items">${S.myRequests.map((g) => `<li><div class="xc-item is-waiting">${groupAvatar({ id: g.id, title: g.title, emoji: g.emoji, avatar: g.avatar })}<span class="xc-item-main"><span class="xc-item-top"><b data-no-i18n>${esc(g.title)}</b></span><span class="xc-item-sub"><span>${esc(t("Wartet auf Freigabe"))}</span></span></span><button type="button" class="xc-link" data-withdraw="${esc(g.id)}">${esc(t("Zurückziehen"))}</button></div></li>`).join("")}</ul>`
      : "";
    const hits = S.query.length >= 2 && S.searchHits.length ? `<p class="xc-label">${esc(t("Nachrichten"))}</p><ul class="xc-hits">${S.searchHits.map((m) => `<li><button type="button" data-open="${esc(m.conversationId)}"><b data-no-i18n>${esc(conv(m.conversationId)?.title || m.author)}</b><span data-no-i18n>${esc(m.author)}: ${esc((m.body || "").slice(0, 90))}</span></button></li>`).join("")}</ul>` : "";
    const emptyText = S.query ? "Nichts gefunden."
      : S.filter === "requests" ? "Keine offenen Anfragen."
      : S.filter !== "all" ? "Hier ist gerade nichts."
      : { all: "Noch keine Gespräche. Starte eins mit dem Plus oben.", private: "Noch keine privaten Gespräche.",
          teams: "Noch kein Team-Chat. Leg einen für deinen Arbeitsbereich oder ein Projekt an.", groups: "Du bist noch in keiner öffentlichen Gruppe – schau mal unter „Gruppen entdecken“." }[S.space];
    listEl.querySelector("[data-items]").innerHTML = items || hits || waiting
      ? `${waiting}${items}${hits}`
      : `<div class="xc-empty xc-empty-list"><p>${esc(t(emptyText))}</p>${S.space === "teams" ? `<button type="button" class="btn btn-small btn-ghost" data-new-team>${esc(t("Team-Chat anlegen"))}</button>` : S.space === "groups" ? `<button type="button" class="btn btn-small btn-ghost" data-discover>${esc(t("Gruppen entdecken"))}</button>` : ""}</div>`;
    listEl.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === S.filter)));
    listEl.querySelectorAll("[data-space]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.space === S.space)));
    // Ungelesene je Bereich an den Reitern
    for (const sp of ["all", "private", "teams", "groups"]) {
      const n = S.conversations.filter((c) => !c.archived && (sp === "all" || spaceOf(c) === sp)).reduce((sum, c) => sum + (c.unread || 0), 0);
      const el = listEl.querySelector(`[data-space-count="${sp}"]`);
      if (el) el.textContent = n ? (n > 99 ? "99+" : String(n)) : "";
    }
    const reqs = S.conversations.reduce((n, c) => n + (c.pendingRequests || 0), 0);
    const reqChip = listEl.querySelector('[data-filter="requests"]');
    if (reqChip) reqChip.dataset.count = reqs ? String(reqs) : "";
    listEl.querySelector("[data-discover]")?.classList.toggle("is-active", S.mode === "discover");
    const total = S.conversations.filter((c) => !c.archived).reduce((n, c) => n + (c.unread || 0), 0);
    const nav = document.querySelector("[data-messages]");
    if (nav) nav.innerHTML = `${esc(t("Nachrichten"))}${total ? ` <span class="badge">${total}</span>` : ""}`;
  }
  async function loadConversations() {
    const [{ conversations }, mine] = await Promise.all([
      X.api("GET", "/conversations"),
      X.api("GET", "/groups/requests/mine").catch(() => ({ requests: [] })),
    ]);
    S.conversations = conversations;
    S.myRequests = mine.requests || [];
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
  listEl.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { S.filter = f.dataset.filter; renderList(); return; }
    const sp = e.target.closest("[data-space]");
    if (sp) { S.space = sp.dataset.space; renderList(); return; }
    const w = e.target.closest("[data-withdraw]");
    if (w) {
      try { await X.api("DELETE", `/groups/${encodeURIComponent(w.dataset.withdraw)}/request`); await loadConversations(); }
      catch (err) { notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; }
      return;
    }
    const o = e.target.closest("[data-open]");
    if (o) { open(o.dataset.open); return; }
    if (e.target.closest("[data-discover]")) { openDiscover(); return; }
    if (e.target.closest("[data-new-team]")) { newConversation("team"); return; }
    if (e.target.closest("[data-new-group]")) { newConversation("group"); return; }
    if (e.target.closest("[data-new]")) newConversation();
  });

  // ---------- Gespräch öffnen ----------
  async function open(id, { push = true } = {}) {
    if (S.active && S.active !== id) S.draft.set(S.active, composerText());
    S.active = id; S.editGroup = false; S.addingPeople = false; S.confirmDelete = false;
    S.mode = "thread";
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
      if (c && isGroup(c)) loadAccess(id);
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
  // Wer die Gruppe finden darf, wie man reinkommt, offene Anfragen und Einladungslinks (nur Inhaber/Admins)
  async function loadAccess(id) {
    try {
      const r = await X.api("GET", `/conversations/${encodeURIComponent(id)}/join-settings`);
      S.access.set(id, r);
      if (r.canManage) {
        const [reqs, inv] = await Promise.all([
          r.pendingRequests ? X.api("GET", `/conversations/${encodeURIComponent(id)}/requests`).catch(() => ({ requests: [] })) : { requests: [] },
          X.api("GET", `/conversations/${encodeURIComponent(id)}/invites`).catch(() => ({ invites: [] })),
        ]);
        S.requests.set(id, reqs.requests || []);
        S.invites.set(id, inv.invites || []);
      }
    } catch { S.access.delete(id); }
    if (S.active === id) { renderInfo(); renderHeader(); }
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
            <button type="button" class="xc-icon" data-emoji-open aria-label="${esc(t("Emoji einfügen"))}" aria-haspopup="true" aria-expanded="false">${ICON.smile}</button>
            <div class="xc-pop xc-emoji" data-emoji-pop hidden>${EMOJI.map((e) => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join("")}</div>
          </div>
          <button type="button" class="xc-icon xc-gif-btn" data-gif-open aria-label="${esc(t("GIF senden"))}">GIF</button>
          <div class="xc-input-wrap">
            <textarea data-input rows="1" maxlength="8000" placeholder="${esc(t("Nachricht …"))}" aria-label="${esc(t("Nachricht"))}"></textarea>
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
    const count = members.length || c.memberCount;
    const kindLabel = c.projectName ? `${t("Projekt-Chat")} · ${c.projectName}` : c.workspaceName ? `${t("Team-Chat")} · ${c.workspaceName}`
      : c.visibility === "public" ? t("Öffentliche Gruppe") : t("Gruppe");
    const sub = isGroup(c)
      ? `${kindLabel} · ${count === 1 ? t("1 Mitglied") : `${count} ${t("Mitglieder")}`}`
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
      case "joined": return `${who} ${t(me ? "bist der Gruppe beigetreten" : "ist der Gruppe beigetreten")}`;
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
          ${editing ? "" : linkCardHtml(firstLink(m), m.id)}
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
    // Läuft ein Video in diesem Verlauf? Nur dann bleibt es beim Neuzeichnen stehen
    const liveMsg = playing ? scroller.querySelector("[data-link-live]")?.closest("[data-msg]") : null;
    if (!liveMsg) playing = null;
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
    if (previewObserver) previewObserver.disconnect();
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const fresh = liveMsg ? [...tpl.content.children].find((el) => el.dataset.msg === liveMsg.dataset.msg) : null;
    if (fresh) {
      // Ein iframe, das aus dem Dokument genommen wird, lädt neu (das Video finge von vorn an):
      // alles um die laufende Nachricht herum wird ersetzt, sie selbst bleibt stehen.
      const nodes = [...tpl.content.childNodes];
      const at = nodes.indexOf(fresh);
      while (liveMsg.previousSibling) liveMsg.previousSibling.remove();
      while (liveMsg.nextSibling) liveMsg.nextSibling.remove();
      liveMsg.before(...nodes.slice(0, at));
      liveMsg.after(...nodes.slice(at + 1));
      if (fresh.dataset.seen) liveMsg.dataset.seen = fresh.dataset.seen; else delete liveMsg.dataset.seen;
    } else {
      playing = null;
      scroller.innerHTML = html || `<p class="xc-empty">${esc(t(S.tagFilter ? "Dazu gibt es noch keine Nachrichten." : "Noch keine Nachrichten – sag hallo."))}</p>`;
    }
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
    hydrateLinks(scope);
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
  // Löschen trifft alle Mitglieder: erst nach Eingabe des Gruppennamens möglich (nur Inhaber).
  function deleteBlock(c) {
    if (!S.confirmDelete) return `<section><button type="button" class="btn btn-small btn-ghost xc-danger" data-delete-open>${esc(t("Gruppe löschen"))}</button></section>`;
    return `<section class="xc-delete"><p class="xc-hint">${esc(t("Das löscht die Gruppe und alle Nachrichten für alle. Tippe zur Bestätigung den Gruppennamen ein:"))} <b data-no-i18n>${esc(c.title)}</b></p>
      <input data-delete-name autocomplete="off" placeholder="${esc(c.title)}" aria-label="${esc(t("Gruppenname zur Bestätigung"))}">
      <div class="xm-row"><button type="button" class="btn btn-small xc-danger-fill" data-delete-confirm disabled>${esc(t("Endgültig löschen"))}</button><button type="button" class="btn btn-small btn-ghost" data-delete-cancel>${esc(t("Abbrechen"))}</button></div></section>`;
  }
  function renderInfo() {
    const c = conv(S.active);
    root.classList.toggle("info-closed", !S.infoOpen);
    if (S.mode === "discover") {
      setInfo(`<div class="xc-info-head"><span class="xc-ph-mark" aria-hidden="true">${ICON_SVG("compass")}</span><h2>${esc(t("So funktionieren Gruppen"))}</h2></div>
        <section><h3>${esc(t("Drei Arten"))}</h3><ul class="xc-howto">
          <li>${ICON_SVG("lock")}<span><b>${esc(t("Privat"))}</b>${esc(t("Nur wer eingeladen ist, sieht die Gruppe – für Freunde und Privates."))}</span></li>
          <li>${ICON_SVG("building")}<span><b>${esc(t("Team"))}</b>${esc(t("Gehört zu einem Arbeitsbereich oder Projekt. Alle dort können sie finden."))}</span></li>
          <li>${ICON_SVG("globe")}<span><b>${esc(t("Öffentlich"))}</b>${esc(t("Steht hier unter Entdecken. Jeder auf Xyntal kann beitreten oder anfragen."))}</span></li>
        </ul></section>
        <section><h3>${esc(t("Voraussetzungen"))}</h3><p class="xc-about">${esc(t("Gruppen können verlangen, dass dein Profil bestimmte Skills, Sprachen oder ein bestätigtes Konto zeigt. Was dir fehlt, siehst du direkt an der Karte."))}</p><a class="btn btn-small btn-ghost" href="/profil#matching">${esc(t("Meine Skills pflegen"))}</a></section>`);
      return;
    }
    if (!c) { setInfo(`<p class="xc-empty">${esc(t("Wähle ein Gespräch, um Details zu sehen."))}</p>`); return; }
    const projects = S.chatTags.length ? `<section><h3>${esc(t("In diesem Chat markiert"))}</h3><ul class="xc-projects">${S.chatTags.filter((g) => TAG_KINDS.includes(g.kind)).map((g) => `<li><button type="button" data-tag-filter="${esc(tagKey(g))}" data-name="${esc(g.name)}" aria-pressed="${S.tagFilter === tagKey(g)}" title="${esc(t(TAG_LABEL[g.kind]))}">${ICON[TAG_ICON[g.kind]]}<span data-no-i18n>${esc(g.name)}</span><small>${g.count}</small></button></li>`).join("")}</ul><p class="xc-hint">${esc(t("Klick auf einen Eintrag, um nur seine Nachrichten zu sehen. In einer Nachricht markierst du mit /projekt, /arbeitsbereich oder /gruppe."))}</p></section>` : "";
    if (isGroup(c)) {
      const r = S.members.get(c.id) || { members: [] };
      const can = r.can || {};
      const myRole = (r.members.find((m) => m.mine) || {}).conversationRole;
      const roleLabel = (role) => (role === "owner" ? t("Inhaber") : role === "admin" ? "Admin" : "");
      const memberRow = (m) => {
        const canRole = can.setRole && !m.mine;
        const canRemove = can.removeMember && !m.mine && m.conversationRole !== "owner" && (m.conversationRole !== "admin" || myRole === "owner");
        const role = canRole
          ? `<select class="xc-role" data-role="${esc(m.id)}" aria-label="${esc(t("Rolle"))}"><option value="member"${m.conversationRole === "member" ? " selected" : ""}>${esc(t("Mitglied"))}</option><option value="admin"${m.conversationRole === "admin" ? " selected" : ""}>Admin</option><option value="owner"${m.conversationRole === "owner" ? " selected" : ""}>${esc(t("Inhaber werden"))}</option></select>`
          : roleLabel(m.conversationRole) ? `<small>${esc(roleLabel(m.conversationRole))}</small>` : "";
        const remove = canRemove ? `<button type="button" class="xc-x" data-remove-member="${esc(m.id)}" aria-label="${esc(t("Entfernen"))}" title="${esc(t("Entfernen"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>` : "";
        return `<li>${avatar(userNow(m.id) || { displayName: m.displayName }, "xc-av-sm")}<span data-no-i18n>${esc(m.displayName)}${m.mine ? ` (${esc(t("du"))})` : ""}</span>${role}${remove}</li>`;
      };
      const editForm = S.editGroup && can.rename ? `<section class="xc-edit">
          <label>${esc(t("Name"))}<input data-edit-title maxlength="120" value="${esc(c.title)}"></label>
          <label>${esc(t("Beschreibung"))}<textarea data-edit-desc maxlength="500" rows="3" placeholder="${esc(t("Wofür ist diese Gruppe?"))}">${esc(c.description || "")}</textarea></label>
          <span class="xc-edit-label">${esc(t("Gruppenbild"))}</span>
          ${emojiRow("data-edit-emoji", S.editEmoji, t("Gruppenbild"))}
          <div class="xm-row"><button type="button" class="btn btn-small btn-ghost" data-pick-image>${esc(t("Bild hochladen"))}</button>${PICTURE_OK.test(c.avatar || "") ? `<button type="button" class="btn btn-small btn-ghost" data-remove-image>${esc(t("Bild entfernen"))}</button>` : ""}<input type="file" accept="image/png,image/jpeg,image/webp" data-image-file hidden></div>
          <div class="xm-row"><button type="button" class="btn btn-small" data-edit-save>${esc(t("Speichern"))}</button><button type="button" class="btn btn-small btn-ghost" data-edit-cancel>${esc(t("Abbrechen"))}</button></div>
        </section>` : "";
      // „+“ neben „Mitglieder“ öffnet die Suche direkt unter der Liste; dasselbe Zeichen dreht sich zum Schließen.
      const addToggle = can.invite ? `<button type="button" class="xc-icon xc-add-toggle${S.addingPeople ? " is-open" : ""}" data-add-toggle aria-expanded="${S.addingPeople}" aria-label="${esc(t("Personen hinzufügen"))}" title="${esc(t("Personen hinzufügen"))}">${ICON.plus}</button>` : "";
      const addPeople = can.invite && S.addingPeople ? `<div class="xc-add"><input type="search" data-add-q placeholder="${esc(t("Name eingeben …"))}" autocomplete="off" aria-label="${esc(t("Personen suchen"))}"><ul class="xc-results" data-add-results></ul></div>` : "";
      const acc = S.access.get(c.id);
      const a = acc ? acc.access : { visibility: c.visibility || "private", joinPolicy: c.joinPolicy || "invite", criteria: null, tags: [] };
      const manage = acc && acc.canManage;
      const chips = [
        `<span class="xc-chip">${ICON_SVG(a.visibility === "public" ? "globe" : a.visibility === "workspace" ? "building" : "lock")}${esc(t(VIS_LABEL[a.visibility] || "Privat"))}</span>`,
        a.visibility !== "private" ? `<span class="xc-chip">${esc(t(POLICY_LABEL[a.joinPolicy] || ""))}</span>` : "",
        a.category ? `<span class="xc-chip">${CATEGORY_EMOJI[a.category] || ""} ${esc(t(CATEGORY_LABEL[a.category] || a.category))}</span>` : "",
        a.memberLimit ? `<span class="xc-chip">${esc(t("max."))} ${a.memberLimit}</span>` : "",
      ].join("");
      const team = a.projectName || a.workspaceName
        ? `<section><h3>${esc(t(a.projectName ? "Projekt" : "Arbeitsbereich"))}</h3><p class="xc-team">${ICON_SVG(a.projectName ? "folder" : "building")}<span data-no-i18n>${esc(a.projectName || a.workspaceName)}</span>${a.projectName && a.workspaceName ? `<small data-no-i18n>${esc(a.workspaceName)}</small>` : ""}</p></section>` : "";
      const crit = criteriaHtml(a.criteria);
      const reqs = manage ? (S.requests.get(c.id) || []) : [];
      const requests = reqs.length ? `<section class="xc-requests"><h3>${esc(t("Beitrittsanfragen"))} <em class="xc-badge xc-badge-req">${reqs.length}</em></h3><ul>${reqs.map((q) => `<li>
          <div class="xc-req-top">${avatar({ displayName: q.displayName, avatar: q.avatar }, "xc-av-sm")}<span><b data-no-i18n>${esc(q.displayName)}</b>${q.headline ? `<small data-no-i18n>${esc(q.headline)}</small>` : ""}</span></div>
          ${q.message ? `<p class="xc-req-msg" data-no-i18n>„${esc(q.message)}“</p>` : ""}
          ${q.skills.length ? `<div class="xc-tags">${q.skills.slice(0, 6).map((s) => `<span data-no-i18n>${esc(X.tagLabel("skills", s))}</span>`).join("")}</div>` : ""}
          ${q.eligibility && !q.eligibility.ok ? `<p class="xc-hint xc-warn">${esc(t("Erfüllt die Voraussetzungen gerade nicht"))}</p>` : ""}
          <div class="xc-req-actions"><button type="button" class="btn btn-small" data-req-approve="${esc(q.userId)}">${esc(t("Aufnehmen"))}</button><button type="button" class="btn btn-small btn-ghost" data-req-decline="${esc(q.userId)}">${esc(t("Ablehnen"))}</button></div>
        </li>`).join("")}</ul></section>` : "";
      const invites = manage ? (S.invites.get(c.id) || []) : [];
      const inviteBox = manage ? `<section><h3>${esc(t("Einladungslink"))}</h3>${invites.length ? invites.slice(0, 3).map((i) => `<div class="xc-invite"><code data-no-i18n>${esc(inviteUrl(c.id, i.code).replace(/^https?:\/\//, ""))}</code><button type="button" class="xc-icon" data-invite-copy="${esc(i.code)}" aria-label="${esc(t("Link kopieren"))}" title="${esc(t("Link kopieren"))}">${ICON_SVG("copy")}</button><button type="button" class="xc-icon" data-invite-revoke="${esc(i.code)}" aria-label="${esc(t("Link widerrufen"))}" title="${esc(t("Link widerrufen"))}">${ICON_SVG("trash")}</button></div>`).join("") : `<p class="xc-hint">${esc(t("Mit einem Link kommen Leute direkt in die Gruppe – auch wenn sie privat ist. Die Voraussetzungen gelten trotzdem."))}</p>`}<button type="button" class="btn btn-small btn-ghost" data-invite-new>${esc(t(invites.length ? "Weiteren Link erstellen" : "Link erstellen"))}</button></section>` : "";
      setInfo(`
        <div class="xc-info-head">${groupAvatar(c, "xc-av-xl")}<h2 data-no-i18n>${esc(c.title)}</h2><p>${esc(t("Gruppe"))} · ${r.members.length} ${esc(t("Mitglieder"))}</p><div class="xc-chips">${chips}</div>${c.description ? `<p class="xc-about" data-no-i18n>${esc(c.description)}</p>` : ""}${(can.rename && !S.editGroup) || manage ? `<div class="xm-row xc-info-actions">${can.rename && !S.editGroup ? `<button type="button" class="btn btn-small btn-ghost" data-edit-open>${esc(t("Gruppe bearbeiten"))}</button>` : ""}${manage ? `<button type="button" class="btn btn-small btn-ghost" data-group-settings>${ICON_SVG("gear")}${esc(t("Sichtbarkeit & Beitritt"))}</button>` : ""}</div>` : ""}</div>
        ${editForm}
        ${requests}
        ${team}
        ${crit ? `<section><h3>${esc(t("Voraussetzungen"))}</h3>${crit}</section>` : ""}
        ${a.tags && a.tags.length ? `<section><h3>${esc(t("Themen"))}</h3><div class="xc-tags">${a.tags.map((x) => `<span data-no-i18n>#${esc(x)}</span>`).join("")}</div></section>` : ""}
        <section><div class="xc-sec-head"><h3>${esc(t("Mitglieder"))}</h3>${addToggle}</div><ul class="xc-members">${r.members.map(memberRow).join("")}</ul>${addPeople}</section>
        ${inviteBox}
        ${projects}
        <section><button type="button" class="btn btn-small btn-ghost" data-leave>${esc(t("Gruppe verlassen"))}</button></section>
        ${can.delete ? deleteBlock(c) : ""}`);
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
  // ---------- Gruppe verwalten (wie im Gruppen-Dialog der App) ----------
  const base = () => `/conversations/${encodeURIComponent(S.active)}`;
  async function afterGroupChange(id = S.active) {
    await loadMembers(id);
    await loadConversations();
    renderInfo();
  }
  async function patchGroup(fields) {
    try { await X.api("PATCH", base(), fields); await afterGroupChange(); return true; }
    catch (err) { say(fail(err), "error"); return false; }
  }
  // Mittig zugeschnitten, 256 px, JPEG – wie das Profilbild in der App.
  function squarePicture(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(256, side);
        const cv = document.createElement("canvas");
        cv.width = cv.height = out;
        cv.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("Das Bild konnte nicht gelesen werden."))); };
      img.src = url;
    });
  }
  let addTimer = 0;
  infoEl.addEventListener("input", (e) => {
    const dn = e.target.closest("[data-delete-name]");
    if (dn) { infoEl.querySelector("[data-delete-confirm]").disabled = dn.value.trim() !== (conv(S.active) || {}).title; return; }
    const q = e.target.closest("[data-add-q]");
    if (!q) return;
    clearTimeout(addTimer);
    addTimer = setTimeout(async () => {
      const list = infoEl.querySelector("[data-add-results]");
      const term = q.value.trim();
      if (!list) return;
      if (term.length < 2) { list.innerHTML = ""; return; }
      const inGroup = new Set(((S.members.get(S.active) || {}).members || []).map((m) => m.id));
      let found = [];
      try { found = ((await X.api("GET", `/users/search?q=${encodeURIComponent(term)}`)).users || []).filter((u) => u.id !== S.me && !inGroup.has(u.id)); } catch { found = []; }
      list.innerHTML = found.map((u) => `<li><button type="button" data-add-user="${esc(u.id)}">${avatar(u, "xc-av-sm")}<span><b data-no-i18n>${esc(u.displayName)}</b>${u.headline ? `<small data-no-i18n>${esc(u.headline)}</small>` : ""}</span></button></li>`).join("") || `<li class="xc-hint">${esc(t("Niemand gefunden."))}</li>`;
    }, 250);
  });
  infoEl.addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-role]");
    if (sel) {
      if (sel.value === "owner" && !confirm(t("Du gibst die Gruppe ab und wirst Admin. Fortfahren?"))) { renderInfo(); return; }
      try { await X.api("PATCH", `${base()}/members/${encodeURIComponent(sel.dataset.role)}`, { role: sel.value }); await afterGroupChange(); }
      catch (err) { say(fail(err), "error"); renderInfo(); }
      return;
    }
    const file = e.target.closest("[data-image-file]");
    if (file && file.files[0]) {
      try { await patchGroup({ avatar: await squarePicture(file.files[0]) }); }
      catch (err) { say(fail(err), "error"); }
    }
  });
  infoEl.addEventListener("click", async (e) => {
    const f = e.target.closest("[data-tag-filter]");
    if (f) { setTagFilter(f.dataset.tagFilter, f.dataset.name); return; }
    if (e.target.closest("[data-delete-open]")) { S.confirmDelete = true; renderInfo(); infoEl.querySelector("[data-delete-name]")?.focus(); return; }
    if (e.target.closest("[data-delete-cancel]")) { S.confirmDelete = false; renderInfo(); return; }
    if (e.target.closest("[data-delete-confirm]")) {
      const input = infoEl.querySelector("[data-delete-name]");
      if (!input || input.value.trim() !== (conv(S.active) || {}).title) return;
      try {
        await X.api("DELETE", base());
        S.confirmDelete = false; S.active = ""; setView("list"); history.replaceState(null, "", "nachrichten");
        threadEl.innerHTML = emptyThread(); await loadConversations(); renderInfo();
      } catch (err) { say(fail(err), "error"); }
      return;
    }
    if (e.target.closest("[data-edit-open]")) { S.editGroup = true; S.editEmoji = (conv(S.active) || {}).emoji || ""; renderInfo(); return; }
    if (e.target.closest("[data-edit-cancel]")) { S.editGroup = false; renderInfo(); return; }
    const em = e.target.closest("[data-edit-emoji]");
    if (em) { S.editEmoji = em.dataset.editEmoji; infoEl.querySelectorAll("[data-edit-emoji]").forEach((b) => b.setAttribute("aria-checked", String(b === em))); return; }
    if (e.target.closest("[data-pick-image]")) { infoEl.querySelector("[data-image-file]").click(); return; }
    if (e.target.closest("[data-remove-image]")) { await patchGroup({ avatar: "" }); return; }
    if (e.target.closest("[data-edit-save]")) {
      const c = conv(S.active), title = infoEl.querySelector("[data-edit-title]").value.trim();
      if (!title) { say(t("Die Gruppe braucht einen Namen."), "error"); return; }
      const fields = { title, description: infoEl.querySelector("[data-edit-desc]").value.trim(), emoji: S.editEmoji };
      // Ein neu gewähltes Emoji (oder die Initialen) ersetzt ein eigenes Bild.
      if (S.editEmoji !== (c.emoji || "") && PICTURE_OK.test(c.avatar || "")) fields.avatar = "";
      if (await patchGroup(fields)) { S.editGroup = false; renderInfo(); }
      return;
    }
    if (e.target.closest("[data-add-toggle]")) { S.addingPeople = !S.addingPeople; renderInfo(); infoEl.querySelector("[data-add-q]")?.focus(); return; }
    const add = e.target.closest("[data-add-user]");
    if (add) {
      try { await X.api("POST", `${base()}/members`, { userIds: [add.dataset.addUser] }); add.closest("li").remove(); await afterGroupChange(); }
      catch (err) { say(fail(err), "error"); }
      return;
    }
    const rm = e.target.closest("[data-remove-member]");
    if (rm) {
      if (!rm.dataset.armed) { rm.dataset.armed = "1"; rm.classList.add("is-armed"); rm.setAttribute("aria-label", t("Wirklich entfernen?")); setTimeout(() => { delete rm.dataset.armed; rm.classList.remove("is-armed"); rm.setAttribute("aria-label", t("Entfernen")); }, 4000); return; }
      try { await X.api("DELETE", `${base()}/members/${encodeURIComponent(rm.dataset.removeMember)}`); await afterGroupChange(); }
      catch (err) { say(fail(err), "error"); }
      return;
    }
    const id = S.active;
    const ap = e.target.closest("[data-req-approve], [data-req-decline]");
    if (ap) {
      const approve = ap.hasAttribute("data-req-approve");
      const who = approve ? ap.dataset.reqApprove : ap.dataset.reqDecline;
      ap.disabled = true;
      try {
        await X.api("POST", `/conversations/${encodeURIComponent(id)}/requests/${encodeURIComponent(who)}`, { approve });
        await Promise.all([loadAccess(id), loadMembers(id), loadConversations()]);
      } catch (err) { say(fail(err), "error"); ap.disabled = false; }
      return;
    }
    if (e.target.closest("[data-invite-new]")) {
      try {
        const { invite } = await X.api("POST", `/conversations/${encodeURIComponent(id)}/invites`, {});
        await loadAccess(id);
        copyText(inviteUrl(id, invite.code));
      } catch (err) { say(fail(err), "error"); }
      return;
    }
    const cp = e.target.closest("[data-invite-copy]");
    if (cp) { copyText(inviteUrl(id, cp.dataset.inviteCopy)); return; }
    const rv = e.target.closest("[data-invite-revoke]");
    if (rv) {
      if (!rv.dataset.armed) { rv.dataset.armed = "1"; rv.classList.add("is-armed"); setTimeout(() => { delete rv.dataset.armed; rv.classList.remove("is-armed"); }, 4000); return; }
      try { await X.api("DELETE", `/conversations/${encodeURIComponent(id)}/invites/${encodeURIComponent(rv.dataset.inviteRevoke)}`); await loadAccess(id); }
      catch (err) { say(fail(err), "error"); }
      return;
    }
    if (e.target.closest("[data-group-settings]")) { groupSettings(id); return; }
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
    // In Stücken über den App-Server: es gilt das Limit des Tarifs, der Server sagt vorher, wenn es nicht passt.
    const { file: saved } = await X.upload(file, { name });
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
    } catch (err) {
      say(await micProblem(err), "error", 15000);
    }
  }
  // Warum der Browser das Mikrofon nicht freigibt. Oft fragt er gar nicht erst: wenn Windows bzw. macOS
  // dem Browser das Mikrofon sperrt, wenn xyntal.de früher einmal blockiert wurde oder wenn keins da ist.
  async function micProblem(err) {
    const name = (err && err.name) || "";
    const detail = (err && err.message) || "";
    console.warn("Mikrofon:", name, detail);
    const win = /Windows/.test(navigator.userAgent);
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return t(win ? "Kein Mikrofon gefunden. Schließ eins an und prüf unter Windows-Einstellungen → System → Sound, ob ein Eingabegerät aktiv ist."
        : "Kein Mikrofon gefunden. Schließ eins an und versuch es noch einmal.");
    }
    if (name === "NotReadableError" || name === "AbortError") {
      return t("Das Mikrofon lässt sich gerade nicht öffnen – vermutlich nutzt es ein anderes Programm (z. B. Teams, Discord oder Zoom).");
    }
    if (name === "NotAllowedError" || name === "SecurityError") {
      let state = "";
      try { state = (await navigator.permissions.query({ name: "microphone" })).state; } catch { /* nicht überall abfragbar */ }
      // Chrome/Edge melden eine Sperre durch das Betriebssystem mit „Permission denied by system“
      if (/system/i.test(detail) || (state === "granted")) {
        return t(win ? "Windows sperrt das Mikrofon für deinen Browser. Öffne Einstellungen → Datenschutz und Sicherheit → Mikrofon, schalte „Mikrofonzugriff“ und „Desktop-Apps den Zugriff erlauben“ ein und lade die Seite neu."
          : "Dein Betriebssystem sperrt das Mikrofon für deinen Browser. Erlaube es in den Systemeinstellungen unter Datenschutz → Mikrofon und lade die Seite neu.");
      }
      if (state === "denied") {
        return t("Das Mikrofon ist für xyntal.de blockiert. Klick links neben der Adresse auf das Symbol für die Website-Einstellungen, stell „Mikrofon“ auf „Zulassen“ und lade die Seite neu.");
      }
    }
    return t("Kein Zugriff aufs Mikrofon. Erlaube es in deinem Browser, um Sprachnachrichten aufzunehmen.");
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
    const play = target.closest("[data-link-play]");
    if (play) { startPlayer(play.closest(".xc-lp")); return; }
    if (target.closest("[data-link-close]")) { stopPlayer(); return; }

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
    if (playing && !threadEl.querySelector(".xc-pop:not([hidden]), .xc-menu:not([hidden])")) stopPlayer();
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

  // ---------- Gruppen: Voraussetzungen, Links ----------
  const inviteUrl = (id, code) => `${location.origin}/nachrichten?gruppe=${encodeURIComponent(id)}&einladung=${encodeURIComponent(code)}`;
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); say(t("Link kopiert.")); }
    catch { window.prompt(t("Link kopieren:"), text); }
  }
  const skillName = (s) => X.tagLabel("skills", s);
  // Die Voraussetzungen als Zeilen; mit `elig` (Prüfung für dich) bekommt jede ein ✓ oder ✗
  function criteriaHtml(c, elig) {
    if (!c) return "";
    const miss = new Set(((elig && elig.missing) || []).map((m) => m.kind));
    const row = (kind, text) => `<li class="${elig ? (miss.has(kind) ? "is-miss" : "is-ok") : ""}">${elig ? ICON_SVG(miss.has(kind) ? "x" : "check") : ICON_SVG("dot")}<span>${text}</span></li>`;
    const rows = [];
    if (c.skills && c.skills.length) {
      const list = c.skills.map((s) => `<b data-no-i18n>${esc(skillName(s))}</b>`).join(c.skillsMode === "all" ? " + " : ` ${esc(t("oder"))} `);
      rows.push(row("skills", `${esc(t(c.skillsMode === "all" ? "Skills (alle):" : "Skills (mind. einer):"))} ${list}`));
    }
    if (c.languages && c.languages.length) rows.push(row("languages", `${esc(t("Spricht"))} ${c.languages.map((l) => `<b data-no-i18n>${esc(X.tagLabel("languages", l))}</b>`).join(` ${esc(t("oder"))} `)}`));
    if (c.verifiedOnly) rows.push(row("verified", esc(t("Bestätigtes Konto"))));
    if (c.minAccountDays) rows.push(row("accountAge", `${esc(t("Konto seit mindestens"))} ${c.minAccountDays} ${esc(t(c.minAccountDays === 1 ? "Tag" : "Tagen"))}`));
    return rows.length ? `<ul class="xc-criteria">${rows.join("")}</ul>` : "";
  }

  // ---------- Gruppen entdecken ----------
  async function openDiscover({ push = true } = {}) {
    if (S.active) S.draft.set(S.active, composerText());
    S.mode = "discover";
    S.active = "";
    stopPlayer();
    setView("thread");
    if (push) history.replaceState(null, "", "nachrichten?entdecken=1");
    renderList();
    renderInfo();
    threadEl.innerHTML = `
      <div class="xd" data-discover-view>
        <header class="xd-hero">
          <button type="button" class="xc-icon xc-back" data-back aria-label="${esc(t("Zurück zur Liste"))}">${ICON.back}</button>
          <div class="xd-hero-text">
            <p class="xd-kicker">${ICON_SVG("compass")}${esc(t("Entdecken"))}</p>
            <h2>${esc(t("Finde deine Leute"))}</h2>
            <p>${esc(t("Öffentliche Gruppen zu Themen, die dich interessieren, und die Gruppen deiner Arbeitsbereiche. Manche sind offen, andere nehmen nur Leute mit bestimmten Skills auf."))}</p>
          </div>
          <button type="button" class="btn btn-small" data-new-group>${ICON_SVG("plus")}${esc(t("Gruppe gründen"))}</button>
        </header>
        <div class="xd-controls">
          <input type="search" data-d-q placeholder="${esc(t("Gruppen, Themen oder Skills suchen"))}" value="${esc(S.discover.q)}" autocomplete="off" aria-label="${esc(t("Gruppen suchen"))}">
          <div class="xd-scopes" role="tablist">
            ${[["all", "Alle"], ["fits", "Passt zu dir"], ["public", "Öffentlich"], ["workspace", "Meine Arbeitsbereiche"]].map(([k, l]) => `<button type="button" role="tab" data-d-scope="${k}" aria-selected="${S.discover.scope === k}">${esc(t(l))}</button>`).join("")}
          </div>
        </div>
        <div class="xd-cats" data-d-cats></div>
        <div class="xd-grid" data-d-grid><p class="xc-empty">${esc(t("Wird geladen …"))}</p></div>
      </div>
      <p class="xc-status" data-status role="status" aria-live="polite"></p>`;
    await loadDiscover();
  }
  let discoverSeq = 0;
  async function loadDiscover() {
    const seq = ++discoverSeq;
    const d = S.discover;
    const qs = new URLSearchParams({ scope: d.scope });
    if (d.q) qs.set("q", d.q);
    if (d.category) qs.set("category", d.category);
    try {
      const r = await X.api("GET", `/groups/discover?${qs}`);
      if (seq !== discoverSeq) return;
      d.groups = r.groups || [];
      d.categoryCounts = r.categoryCounts || {};
    } catch (err) {
      if (seq !== discoverSeq) return;
      d.groups = [];
      const grid = threadEl.querySelector("[data-d-grid]");
      if (grid) grid.innerHTML = `<p class="xc-empty">${esc(fail(err))}</p>`;
      return;
    }
    renderDiscover();
  }
  function renderDiscover() {
    const view = threadEl.querySelector("[data-discover-view]");
    if (!view) return;
    const d = S.discover;
    view.querySelectorAll("[data-d-scope]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.dScope === d.scope)));
    const cats = Object.keys(CATEGORY_LABEL);
    view.querySelector("[data-d-cats]").innerHTML = [`<button type="button" class="xm-chip" data-d-cat="" aria-pressed="${!d.category}">${esc(t("Alle Themen"))}</button>`,
      ...cats.map((k) => `<button type="button" class="xm-chip" data-d-cat="${k}" aria-pressed="${d.category === k}">${CATEGORY_EMOJI[k]} ${esc(t(CATEGORY_LABEL[k]))}${d.categoryCounts[k] ? ` <small>${d.categoryCounts[k]}</small>` : ""}</button>`)].join("");
    const grid = view.querySelector("[data-d-grid]");
    if (!d.groups.length) {
      grid.innerHTML = `<div class="xd-empty"><span class="xd-empty-ico">${ICON_SVG("compass")}</span><h3>${esc(t(d.q || d.category || d.scope !== "all" ? "Nichts Passendes gefunden" : "Noch keine öffentlichen Gruppen"))}</h3><p>${esc(t(d.scope === "fits" ? "Trag deine Skills im Profil ein – dann zeigen wir dir Gruppen, die zu dir passen." : "Gründe die erste Gruppe zu deinem Thema. Andere finden sie dann hier."))}</p><div class="xm-row">${d.scope === "fits" ? `<a class="btn btn-small btn-ghost" href="/profil#matching">${esc(t("Skills eintragen"))}</a>` : ""}<button type="button" class="btn btn-small" data-new-group>${esc(t("Gruppe gründen"))}</button></div></div>`;
      return;
    }
    grid.innerHTML = d.groups.map(groupCard).join("");
  }
  function groupCard(g) {
    const e = g.eligibility || { ok: true, missing: [] };
    const fits = g.fit > 0 && e.ok && !g.isMember;
    const where = g.projectName ? `${ICON_SVG("folder")}<span data-no-i18n>${esc(g.projectName)}</span>` : g.workspaceName ? `${ICON_SVG("building")}<span data-no-i18n>${esc(g.workspaceName)}</span>` : `${ICON_SVG("globe")}<span>${esc(t("Öffentlich"))}</span>`;
    const people = (g.membersPreview || []).slice(0, 4).map((p) => avatar(userNow(p.id) || { displayName: p.name }, "xc-av-xs")).join("");
    const activity = g.activeWeek ? `${g.activeWeek} ${esc(t(g.activeWeek === 1 ? "Nachricht diese Woche" : "Nachrichten diese Woche"))}` : esc(t("Ruhig gerade"));
    let cta;
    if (g.isMember) cta = `<button type="button" class="btn btn-small btn-ghost" data-open="${esc(g.id)}">${esc(t("Öffnen"))}</button>`;
    else if (g.request === "pending") cta = `<button type="button" class="btn btn-small btn-ghost" data-d-withdraw="${esc(g.id)}">${esc(t("Angefragt · zurückziehen"))}</button>`;
    else if (g.full) cta = `<button type="button" class="btn btn-small btn-ghost" disabled>${esc(t("Voll"))}</button>`;
    else if (!e.ok) cta = `<button type="button" class="btn btn-small btn-ghost" data-d-why="${esc(g.id)}">${esc(t("Voraussetzungen ansehen"))}</button>`;
    else if (g.joinable === "join") cta = `<button type="button" class="btn btn-small" data-d-join="${esc(g.id)}">${esc(t("Beitreten"))}</button>`;
    else if (g.joinable === "request") cta = `<button type="button" class="btn btn-small" data-d-ask="${esc(g.id)}">${esc(t("Beitritt anfragen"))}</button>`;
    else cta = `<span class="xc-hint">${esc(t("Nur mit Einladung"))}</span>`;
    return `<article class="xd-card${fits ? " is-fit" : ""}${g.isMember ? " is-member" : ""}" data-group-card="${esc(g.id)}">
      <div class="xd-card-top">${groupAvatar(g, "xc-av-lg")}<div class="xd-card-title"><h3 data-no-i18n>${esc(g.title)}</h3><p class="xd-where">${where}${g.category ? `<span class="xd-dot">·</span><span>${CATEGORY_EMOJI[g.category] || ""} ${esc(t(CATEGORY_LABEL[g.category] || ""))}</span>` : ""}</p></div>${g.isMember ? `<span class="xd-fit is-in">${ICON_SVG("check")}${esc(t("Dabei"))}</span>` : fits ? `<span class="xd-fit">${ICON_SVG("spark")}${esc(t("Passt zu dir"))}</span>` : ""}</div>
      ${g.description ? `<p class="xd-desc" data-no-i18n>${esc(g.description)}</p>` : ""}
      ${g.tags && g.tags.length ? `<div class="xc-tags">${g.tags.slice(0, 5).map((x) => `<span data-no-i18n>#${esc(x)}</span>`).join("")}</div>` : ""}
      ${criteriaHtml(g.criteria, e)}
      <footer class="xd-card-foot"><span class="xd-people">${people}<small>${g.memberCount} ${esc(t(g.memberCount === 1 ? "Mitglied" : "Mitglieder"))}${g.memberLimit ? ` / ${g.memberLimit}` : ""} · ${activity}</small></span>${cta}</footer>
    </article>`;
  }
  async function joinGroup(id, { message = "", invite = "" } = {}) {
    const body = {};
    if (message) body.message = message;
    if (invite) body.invite = invite;
    const r = await X.api("POST", `/groups/${encodeURIComponent(id)}/join`, body);
    await loadConversations();
    if (r.status === "member") { await open(id); say(t("Willkommen in der Gruppe!")); }
    return r.status;
  }
  // Beitritt anfragen: kurze Nachricht an die Admins (freiwillig)
  function askToJoin(g, invite = "") {
    const dlg = document.createElement("dialog");
    dlg.className = "xm-dialog xc-new";
    dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
      <h2>${esc(t("Beitritt anfragen"))}</h2>
      <p class="xc-hint">${esc(t("Die Admins von"))} <b data-no-i18n>${esc(g.title)}</b> ${esc(t("sehen deine Anfrage mit deinem Profil und deinen Skills."))}</p>
      <label>${esc(t("Nachricht an die Admins (optional)"))}<textarea name="message" rows="3" maxlength="500" placeholder="${esc(t("z. B. woran du arbeitest und warum du dabei sein willst"))}"></textarea></label>
      <div class="xm-row"><button class="btn btn-small" value="ok">${esc(t("Anfrage senden"))}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>${esc(t("Abbrechen"))}</button></div>
    </form>`;
    document.body.append(dlg);
    dlg.addEventListener("close", async () => {
      const message = dlg.querySelector("[name=message]").value.trim();
      const go = dlg.returnValue === "ok";
      dlg.remove();
      if (!go) return;
      try {
        const status = await joinGroup(g.id, { message, invite });
        if (status === "pending") { say(t("Anfrage gesendet. Du bekommst Bescheid, sobald jemand entscheidet.")); if (S.mode === "discover") loadDiscover(); }
      } catch (err) { say(fail(err), "error"); }
    });
    dlg.showModal();
  }
  // Warum es nicht klappt – und was du tun kannst
  function showWhy(g) {
    const dlg = document.createElement("dialog");
    dlg.className = "xm-dialog xc-new";
    dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
      <h2 data-no-i18n>${esc(g.title)}</h2>
      <p class="xc-hint">${esc(t("Diese Gruppe nimmt Leute auf, deren Profil Folgendes zeigt:"))}</p>
      ${criteriaHtml(g.criteria, g.eligibility)}
      <p class="xc-hint">${esc(t("Skills, Sprachen und Bestätigung pflegst du in deinem Profil. Danach kannst du direkt beitreten."))}</p>
      <div class="xm-row"><a class="btn btn-small" href="/profil#matching">${esc(t("Profil ergänzen"))}</a><button class="btn btn-small btn-ghost" value="cancel">${esc(t("Schließen"))}</button></div>
    </form>`;
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }
  // Ein geteilter Link (?gruppe=…&einladung=…): Vorschau mit Beitreten
  async function previewGroup(id, invite) {
    let g;
    try {
      const path = invite && !id ? `/groups/invite/${encodeURIComponent(invite)}` : `/groups/${encodeURIComponent(id)}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
      g = (await X.api("GET", path)).group;
    } catch (err) {
      notice.innerHTML = `<div class="notice">${esc(err && err.status === 404 ? t("Diese Gruppe gibt es nicht (mehr) oder der Link gilt nicht mehr.") : fail(err))}</div>`;
      return;
    }
    if (g.isMember) { await open(g.id); return; }
    const dlg = document.createElement("dialog");
    dlg.className = "xm-dialog xc-new xc-preview";
    dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">${groupCard(g)}<div class="xm-row"><button class="btn btn-small btn-ghost" value="cancel">${esc(t("Schließen"))}</button></div></form>`;
    document.body.append(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => discoverAction(e, g, invite, dlg));
    dlg.showModal();
  }
  async function discoverAction(e, g, invite = "", dlg = null) {
    const done = () => { if (dlg) dlg.close(); };
    if (e.target.closest("[data-d-join]")) {
      e.preventDefault();
      try { done(); await joinGroup(g.id, { invite }); }
      catch (err) {
        // Profil passt (inzwischen) nicht: frisch nachsehen, was fehlt
        const fresh = err && err.status === 403 ? await X.api("GET", `/groups/${encodeURIComponent(g.id)}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`).then((r) => r.group).catch(() => null) : null;
        if (fresh && fresh.eligibility && !fresh.eligibility.ok) showWhy(fresh); else say(fail(err), "error");
      }
      return true;
    }
    if (e.target.closest("[data-d-ask]")) { e.preventDefault(); done(); askToJoin(g, invite); return true; }
    if (e.target.closest("[data-d-why]")) { e.preventDefault(); done(); showWhy(g); return true; }
    if (e.target.closest("[data-d-withdraw]")) {
      e.preventDefault();
      try { await X.api("DELETE", `/groups/${encodeURIComponent(g.id)}/request`); done(); await loadConversations(); if (S.mode === "discover") loadDiscover(); }
      catch (err) { say(fail(err), "error"); }
      return true;
    }
    if (e.target.closest("[data-open]")) { e.preventDefault(); done(); open(g.id); return true; }
    return false;
  }
  let dTimer = 0;
  threadEl.addEventListener("input", (e) => {
    if (!e.target.matches("[data-d-q]")) return;
    clearTimeout(dTimer);
    dTimer = setTimeout(() => { S.discover.q = e.target.value.trim(); loadDiscover(); }, 250);
  });
  threadEl.addEventListener("click", async (e) => {
    if (S.mode !== "discover") return;
    const sc = e.target.closest("[data-d-scope]");
    if (sc) { S.discover.scope = sc.dataset.dScope; loadDiscover(); return; }
    const cat = e.target.closest("[data-d-cat]");
    if (cat) { S.discover.category = S.discover.category === cat.dataset.dCat ? "" : cat.dataset.dCat; loadDiscover(); return; }
    if (e.target.closest("[data-new-group]")) { newConversation("group"); return; }
    const card = e.target.closest("[data-group-card]");
    if (!card) return;
    const g = S.discover.groups.find((x) => x.id === card.dataset.groupCard);
    if (g) await discoverAction(e, g);
  });

  // ---------- Neues Gespräch, neue Gruppe, Team-Chat ----------
  // Ein Formular für Gründen und Bearbeiten: Name, Emoji, Beschreibung, wer sie finden darf,
  // wie man reinkommt, Thema, Stichwörter, Voraussetzungen (Skills, Sprachen, Bestätigung, Kontoalter), Höchstzahl
  const FORM_EMOJI = ["💬", "🚀", "💻", "🎨", "🤖", "📚", "🎮", "📣", "💼", "📍", "⚡", "🌱", "🔥", "🧠", "🛠️", "🎧"];
  function groupFormHtml(v, { team = false, workspaces = [] } = {}) {
    const c = v.criteria || {};
    const skillOpts = Object.keys(X.TAGS.skills.options).concat(Object.keys(X.TAGS.techStack.options)).filter((s, i, all) => all.indexOf(s) === i);
    return `
      <div class="xg-row xg-ident">
        <div class="xc-pop-anchor"><button type="button" class="xg-emoji" data-g-emoji-btn aria-label="${esc(t("Emoji wählen"))}">${esc(v.emoji || "💬")}</button>
          <div class="xc-pop xc-emoji xg-emoji-pop" data-g-emoji-pop hidden>${FORM_EMOJI.map((x) => `<button type="button" data-g-emoji="${x}">${x}</button>`).join("")}</div></div>
        <label class="xg-grow">${esc(t(team ? "Name (leer = Name des Projekts bzw. Arbeitsbereichs)" : "Name der Gruppe"))}<input name="title" maxlength="120" value="${esc(v.title || "")}" placeholder="${esc(t(team ? "z. B. Website-Relaunch" : "z. B. React Builders Berlin"))}"></label>
      </div>
      <input type="hidden" name="emoji" value="${esc(v.emoji || "")}">
      <label>${esc(t("Worum geht's? (optional)"))}<textarea name="description" rows="2" maxlength="500" placeholder="${esc(t("Ein Satz, damit andere wissen, ob sie hier richtig sind"))}">${esc(v.description || "")}</textarea></label>
      ${team ? `<label>${esc(t("Arbeitsbereich oder Projekt"))}<select name="where">${workspaces.map((w) => `<option value="ws:${esc(w.id)}" ${v.workspaceId === w.id && !v.projectId ? "selected" : ""}>${esc(w.name)}</option>${(w.projects || []).map((p) => `<option value="pr:${esc(p.id)}" ${v.projectId === p.id ? "selected" : ""}>&nbsp;&nbsp;↳ ${esc(p.name)}</option>`).join("")}`).join("")}</select></label>` : ""}
      <fieldset class="xg-seg"><legend>${esc(t("Wer kann die Gruppe finden?"))}</legend>
        ${(team ? [["workspace", "Alle im Arbeitsbereich", "building"], ["private", "Nur eingeladene Leute", "lock"]] : [["private", "Nur eingeladene Leute", "lock"], ["public", "Alle auf Xyntal", "globe"]])
          .map(([k, l, ic]) => `<label class="xg-opt"><input type="radio" name="visibility" value="${k}" ${v.visibility === k ? "checked" : ""}><span>${ICON_SVG(ic)}<b>${esc(t(l))}</b><small>${esc(t({ private: "Privat – unsichtbar für alle anderen", public: "Erscheint unter „Gruppen entdecken“", workspace: "Mitglieder des Arbeitsbereichs sehen und betreten sie" }[k]))}</small></span></label>`).join("")}
      </fieldset>
      <div class="xg-public" data-g-public ${v.visibility === "private" ? "hidden" : ""}>
        <fieldset class="xg-seg xg-seg-3"><legend>${esc(t("Wie kommt man rein?"))}</legend>
          ${[["open", "Direkt beitreten"], ["request", "Auf Anfrage"], ["invite", "Nur mit Einladung"]].map(([k, l]) => `<label class="xg-opt"><input type="radio" name="joinPolicy" value="${k}" ${v.joinPolicy === k ? "checked" : ""}><span><b>${esc(t(l))}</b></span></label>`).join("")}
        </fieldset>
        ${team ? "" : `<label>${esc(t("Thema"))}<select name="category"><option value="">${esc(t("Kein Thema"))}</option>${Object.keys(CATEGORY_LABEL).map((k) => `<option value="${k}" ${v.category === k ? "selected" : ""}>${CATEGORY_EMOJI[k]} ${esc(t(CATEGORY_LABEL[k]))}</option>`).join("")}</select></label>
        <label>${esc(t("Stichwörter (mit Komma getrennt)"))}<input name="tags" maxlength="200" value="${esc((v.tags || []).join(", "))}" placeholder="${esc(t("z. B. Frontend, Open Source, Berlin"))}"></label>`}
      </div>
      <details class="xg-crit" ${(c.skills || []).length || (c.languages || []).length || c.verifiedOnly || c.minAccountDays || v.memberLimit ? "open" : ""}>
        <summary>${ICON_SVG("filter")}<span><b>${esc(t("Voraussetzungen für neue Mitglieder"))}</b><small>${esc(t("z. B. nur Leute mit React oder Figma im Profil"))}</small></span></summary>
        <label>${esc(t("Skills"))}<input name="skills" list="xg-skill-list" value="${esc((c.skills || []).map(skillName).join(", "))}" placeholder="${esc(t("z. B. React, TypeScript, Figma"))}"></label>
        <datalist id="xg-skill-list">${skillOpts.map((s) => `<option value="${esc(skillName(s))}">`).join("")}</datalist>
        <div class="xg-inline"><label class="xg-check"><input type="radio" name="skillsMode" value="any" ${c.skillsMode !== "all" ? "checked" : ""}>${esc(t("mindestens einer davon"))}</label><label class="xg-check"><input type="radio" name="skillsMode" value="all" ${c.skillsMode === "all" ? "checked" : ""}>${esc(t("alle davon"))}</label></div>
        <label>${esc(t("Sprachen (eine davon)"))}<input name="languages" value="${esc((c.languages || []).map((l) => X.tagLabel("languages", l)).join(", "))}" placeholder="${esc(t("z. B. Deutsch, Englisch"))}"></label>
        <div class="xg-inline">
          <label class="xg-check"><input type="checkbox" name="verifiedOnly" ${c.verifiedOnly ? "checked" : ""}>${esc(t("Nur bestätigte Konten"))}</label>
          <label class="xg-num">${esc(t("Konto mind."))} <input type="number" name="minAccountDays" min="0" max="3650" value="${Number(c.minAccountDays) || ""}" placeholder="0"> ${esc(t("Tage alt"))}</label>
          <label class="xg-num">${esc(t("Höchstens"))} <input type="number" name="memberLimit" min="0" max="5000" value="${Number(v.memberLimit) || ""}" placeholder="∞"> ${esc(t("Mitglieder"))}</label>
        </div>
      </details>`;
  }
  const splitList = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  function readGroupForm(form) {
    const val = (n) => (form.querySelector(`[name=${n}]`) || {}).value || "";
    const checked = (n) => (form.querySelector(`[name=${n}]:checked`) || {}).value || "";
    const skills = splitList(val("skills")).map((s) => X.canonicalTag("skills", s));
    const languages = splitList(val("languages")).map((s) => X.canonicalTag("languages", s));
    const out = {
      title: val("title").trim(),
      emoji: val("emoji"),
      description: val("description").trim(),
      visibility: checked("visibility") || "private",
      joinPolicy: checked("joinPolicy") || "open",
      criteria: { skills, skillsMode: checked("skillsMode") || "any", languages, verifiedOnly: !!form.querySelector("[name=verifiedOnly]:checked"), minAccountDays: Number(val("minAccountDays")) || 0 },
      memberLimit: Number(val("memberLimit")) || 0,
    };
    if (form.querySelector("[name=category]")) { out.category = val("category"); out.tags = splitList(val("tags")); }
    const where = val("where");
    if (where.startsWith("pr:")) out.projectId = where.slice(3);
    else if (where.startsWith("ws:")) out.workspaceId = where.slice(3);
    if (out.visibility === "private") out.joinPolicy = "invite";
    return out;
  }
  function wireGroupForm(dlg) {
    dlg.addEventListener("change", (e) => {
      if (e.target.name === "visibility") dlg.querySelector("[data-g-public]").hidden = e.target.value === "private";
    });
    dlg.addEventListener("click", (e) => {
      if (e.target.closest("[data-g-emoji-btn]")) { const p = dlg.querySelector("[data-g-emoji-pop]"); p.hidden = !p.hidden; return; }
      const em = e.target.closest("[data-g-emoji]");
      if (em) { dlg.querySelector("[name=emoji]").value = em.dataset.gEmoji; dlg.querySelector("[data-g-emoji-btn]").textContent = em.dataset.gEmoji; dlg.querySelector("[data-g-emoji-pop]").hidden = true; }
    });
  }
  let teamCache = null;
  function teamChoices() {
    if (teamCache) return teamCache;
    teamCache = (async () => {
      const { workspaces } = await X.api("GET", "/workspaces");
      return Promise.all((workspaces || []).map(async (w) => ({
        id: w.id, name: w.name,
        projects: await X.api("GET", `/workspaces/${encodeURIComponent(w.id)}/projects`).then((r) => (r.projects || []).filter((p) => p.archived !== true)).catch(() => []),
      })));
    })();
    teamCache.catch(() => { teamCache = null; });
    return teamCache;
  }

  async function newConversation(startMode = "dm") {
    const dlg = document.createElement("dialog");
    dlg.className = "xm-dialog xc-new xc-new-wide";
    const chosen = new Map();
    let mode = startMode;
    let workspaces = [];
    dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
      <h2>${esc(t("Neu"))}</h2>
      <div class="xg-tabs" role="tablist">
        ${[["dm", "Direktnachricht", "chat"], ["group", "Gruppe", "users"], ["team", "Team-Chat", "building"]].map(([k, l, ic]) => `<button type="button" role="tab" data-mode="${k}" aria-selected="${k === mode}">${ICON_SVG(ic)}<span>${esc(t(l))}</span></button>`).join("")}
      </div>
      <div data-people>
        <label>${esc(t("Personen suchen"))}<input type="search" data-q placeholder="${esc(t("Name eingeben …"))}" autocomplete="off"></label>
        <div class="xc-chosen" data-chosen></div>
        <ul class="xc-results" data-results></ul>
      </div>
      <div data-group-form></div>
      <label class="xg-check" data-addall hidden><input type="checkbox" name="addWorkspaceMembers" checked>${esc(t("Alle Mitglieder des Arbeitsbereichs gleich hinzufügen"))}</label>
      <p class="xm-error" data-err></p>
      <div class="xm-row"><button class="btn btn-small" value="ok" data-start>${esc(t("Gespräch starten"))}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>${esc(t("Abbrechen"))}</button></div>
    </form>`;
    document.body.append(dlg);
    wireGroupForm(dlg);
    const q = dlg.querySelector("[data-q]"), results = dlg.querySelector("[data-results]");
    let timer = 0, found = [];
    const sync = () => {
      dlg.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
      dlg.querySelector("[data-chosen]").innerHTML = [...chosen.values()].map((u) => `<button type="button" class="xm-chip" aria-pressed="true" data-unpick="${esc(u.id)}"><span data-no-i18n>${esc(u.displayName)}</span> ×</button>`).join("");
      dlg.querySelector("[data-addall]").hidden = mode !== "team" || !workspaces.length;
      const start = dlg.querySelector("[data-start]");
      start.disabled = (mode === "dm" && chosen.size !== 1) || (mode === "team" && !workspaces.length);
      start.textContent = t(mode === "dm" ? "Gespräch starten" : mode === "team" ? "Team-Chat anlegen" : "Gruppe gründen");
      dlg.querySelector("[data-people] label").firstChild.textContent = t(mode === "dm" ? "Mit wem?" : "Leute einladen (optional)");
      // Bei Gruppen zuerst Name und Einstellungen, dann wen du einlädst
      dlg.querySelector("form").classList.toggle("xg-group-first", mode !== "dm");
    };
    const renderForm = async () => {
      const box = dlg.querySelector("[data-group-form]");
      if (mode === "dm") { box.innerHTML = ""; sync(); return; }
      if (mode === "team") {
        box.innerHTML = `<p class="xc-hint">${esc(t("Wird geladen …"))}</p>`;
        try { workspaces = await teamChoices(); } catch { workspaces = []; }
        if (mode !== "team") return;
        box.innerHTML = workspaces.length
          ? groupFormHtml({ visibility: "workspace", joinPolicy: "open", emoji: "🛠️" }, { team: true, workspaces })
          : `<p class="xc-hint">${esc(t("Du bist noch in keinem Arbeitsbereich. Leg einen in der Xyntal-App an – dann kannst du hier Team- und Projekt-Chats anlegen."))}</p>`;
      } else {
        box.innerHTML = groupFormHtml({ visibility: "public", joinPolicy: "open", emoji: "💬" });
      }
      sync();
    };
    sync();
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
      const m = e.target.closest("[data-mode]");
      if (m) { mode = m.dataset.mode; if (mode === "dm" && chosen.size > 1) { const [first] = chosen; chosen.clear(); chosen.set(first[0], first[1]); } renderForm(); return; }
      const p = e.target.closest("[data-pick-user]");
      if (p) {
        const u = found.find((x) => x.id === p.dataset.pickUser);
        if (chosen.has(u.id)) chosen.delete(u.id);
        else { if (mode === "dm") chosen.clear(); chosen.set(u.id, u); }
        results.querySelectorAll("[data-pick-user]").forEach((b) => b.setAttribute("aria-pressed", String(chosen.has(b.dataset.pickUser))));
        sync();
      }
      const un = e.target.closest("[data-unpick]");
      if (un) { chosen.delete(un.dataset.unpick); sync(); }
    });
    dlg.addEventListener("close", async () => {
      const go = dlg.returnValue === "ok";
      const form = dlg.querySelector("form");
      const ids = [...chosen.keys()];
      const payload = mode === "dm" ? null : readGroupForm(form);
      const addAll = !!dlg.querySelector("[name=addWorkspaceMembers]:checked");
      dlg.remove();
      if (!go) return;
      try {
        const body = mode === "dm" ? { kind: "dm", memberIds: ids }
          : { kind: "group", memberIds: ids, ...payload, ...(mode === "team" ? { addWorkspaceMembers: addAll } : {}) };
        const { conversation } = await X.api("POST", "/conversations", body);
        await loadConversations();
        open(conversation.id);
        if (mode === "group" && body.visibility === "public") say(t("Deine Gruppe ist jetzt unter „Gruppen entdecken“ zu finden."));
      } catch (err) { notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; }
    });
    renderForm();
    dlg.showModal();
    if (mode === "dm") q.focus();
  }

  // Gruppe bearbeiten (Inhaber/Admins): dieselben Felder wie beim Gründen
  async function groupSettings(id) {
    const c = conv(id);
    const acc = S.access.get(id);
    if (!c || !acc) return;
    const a = acc.access;
    const team = !!a.workspaceId;
    let workspaces = [];
    if (team) { try { workspaces = await teamChoices(); } catch { workspaces = []; } }
    const dlg = document.createElement("dialog");
    dlg.className = "xm-dialog xc-new xc-new-wide";
    dlg.innerHTML = `<form method="dialog" class="xm-dialog-body">
      <h2>${esc(t("Sichtbarkeit & Beitritt"))}</h2>
      ${groupFormHtml({ ...a, title: c.title, emoji: c.emoji, description: c.description }, { team, workspaces })}
      <p class="xm-error" data-err></p>
      <div class="xm-row"><button class="btn btn-small" value="ok">${esc(t("Speichern"))}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>${esc(t("Abbrechen"))}</button></div>
    </form>`;
    document.body.append(dlg);
    wireGroupForm(dlg);
    dlg.addEventListener("close", async () => {
      const go = dlg.returnValue === "ok";
      const v = readGroupForm(dlg.querySelector("form"));
      dlg.remove();
      if (!go) return;
      try {
        const look = { description: v.description, emoji: v.emoji };
        if (v.title) look.title = v.title;
        // Ein neu gewähltes Emoji (oder die Initialen) ersetzt ein eigenes Bild – wie beim Bearbeiten in der Spalte.
        if ((v.emoji || "") !== (c.emoji || "") && PICTURE_OK.test(c.avatar || "")) look.avatar = "";
        await X.api("PATCH", `/conversations/${encodeURIComponent(id)}`, look);
        const { title, emoji, description, ...rest } = v;
        await X.api("PUT", `/conversations/${encodeURIComponent(id)}/join-settings`, rest);
        await Promise.all([loadConversations(), loadAccess(id)]);
        renderHeader();
        say(t("Gespeichert."));
      } catch (err) { say(fail(err), "error"); }
    });
    dlg.showModal();
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
    if (refreshThread && isGroup(conv(S.active))) loadAccess(S.active);
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
  const emptyThread = () => `<div class="xc-placeholder">
    <span class="xc-ph-mark" aria-hidden="true">${ICON_SVG("chat")}</span>
    <h2>${esc(t("Deine Nachrichten"))}</h2>
    <p>${esc(t("Schreib Leuten direkt, organisier dein Team in Projekt-Chats oder tritt Gruppen zu deinen Themen bei."))}</p>
    <div class="xc-ph-actions">
      <button type="button" data-ph="dm">${ICON_SVG("chat")}<span><b>${esc(t("Direktnachricht"))}</b><small>${esc(t("Eine Person anschreiben"))}</small></span></button>
      <button type="button" data-ph="group">${ICON_SVG("users")}<span><b>${esc(t("Gruppe gründen"))}</b><small>${esc(t("Privat oder öffentlich, mit Voraussetzungen"))}</small></span></button>
      <button type="button" data-ph="team">${ICON_SVG("building")}<span><b>${esc(t("Team-Chat"))}</b><small>${esc(t("Für Arbeitsbereich oder Projekt"))}</small></span></button>
      <button type="button" data-ph="discover">${ICON_SVG("compass")}<span><b>${esc(t("Gruppen entdecken"))}</b><small>${esc(t("Leute mit deinen Interessen finden"))}</small></span></button>
    </div>
  </div>`;
  threadEl.addEventListener("click", (e) => {
    const ph = e.target.closest("[data-ph]");
    if (!ph) return;
    if (ph.dataset.ph === "discover") openDiscover(); else newConversation(ph.dataset.ph);
  });

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
    globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
    compass: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12z"/></svg>',
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
      } else if (UUID.test(params.get("gruppe") || "") || INVITE.test(params.get("einladung") || "")) {
        // Geteilter Gruppen- oder Einladungslink
        const id = UUID.test(params.get("gruppe") || "") ? params.get("gruppe") : "";
        const code = INVITE.test(params.get("einladung") || "") ? params.get("einladung") : "";
        if (id && conv(id)) await open(id); else { await openDiscover({ push: false }); await previewGroup(id, code); }
        history.replaceState(null, "", id && conv(id) ? `nachrichten?c=${encodeURIComponent(id)}` : "nachrichten?entdecken=1");
      } else if (params.get("entdecken") === "1") {
        await openDiscover({ push: false });
      } else if (params.get("neu") === "1") {
        newConversation(params.get("art") === "gruppe" ? "group" : params.get("art") === "team" ? "team" : "dm");
      }
    } catch (err) {
      notice.innerHTML = `<div class="notice">${esc(err && err.status === 404 ? t("Diese Person kann gerade nicht angeschrieben werden.") : fail(err))}</div>`;
    }
  }
  // Sprache gewechselt: Server-Texte (Einblick) neu holen, alles neu zeichnen, Entwurf behalten
  document.addEventListener("xyntal:lang", () => {
    renderList();
    if (S.mode === "discover") { openDiscover({ push: false }); return; }
    if (!S.active) { renderInfo(); return; }
    S.draft.set(S.active, composerText());
    S.insight.clear();
    renderThreadShell(); renderMessages({ stick: true }); renderInfo();
    const c = conv(S.active);
    if (c && !isGroup(c)) loadInsight(c.partnerId);
  });
  setTimeout(() => boot().catch((err) => { notice.innerHTML = `<div class="notice">${esc(fail(err))}</div>`; }), 300);
})();
