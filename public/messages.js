// Direktnachrichten. Spalten, Reaktionen, Anhänge: supabase/migrations/20261028140000_message_features.sql.
// Fehlt die Migration, bleiben die neuen Funktionen aus – die Seite lädt trotzdem.
(() => {
  const inbox = document.getElementById("inbox");
  if (!inbox || typeof sb === "undefined" || !sb) return;

  const BUCKET = "message-attachments";
  const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/;
  const QUICK = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
  const MORE = ["😀", "😍", "🙏", "👏", "🎉", "💯", "🤔", "🚀", "👀", "✨"];
  const MAX_ATTACH = 5;
  const MAX_VOICE = 120;
  const VIDEO_MAX = 50 * 1024 * 1024;
  const FILE_MAX = 20 * 1024 * 1024;
  const IMAGE_MAX = 50 * 1024 * 1024;
  const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/webm,audio/mp4,audio/mpeg,audio/ogg,.pdf,.txt,.zip,.docx,.xlsx,.pptx";
  const BLOCKED = new Set(["exe", "bat", "cmd", "com", "msi", "scr", "dll", "ps1", "vbs", "js", "jar", "apk", "sh", "app", "deb", "dmg", "iso", "hta", "msc", "cpl", "lnk", "bin"]);
  const KIND = new Map([
    ["image/jpeg", "image"], ["image/png", "image"], ["image/webp", "image"], ["image/gif", "image"],
    ["video/mp4", "video"], ["video/webm", "video"], ["video/quicktime", "video"],
    ["audio/webm", "audio"], ["audio/mp4", "audio"], ["audio/mpeg", "audio"], ["audio/ogg", "audio"],
    ["application/pdf", "file"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "file"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "file"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "file"],
    ["application/zip", "file"], ["text/plain", "file"],
  ]);
  const MIME_BY_EXT = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", ogg: "audio/ogg", pdf: "application/pdf", txt: "text/plain", zip: "application/zip",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  };
  const EXT_BY_MIME = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/webm": "webm", "audio/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg",
    "application/pdf": "pdf", "text/plain": "txt", "application/zip": "zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  };
  const BG_KEY = "xyntal-chat-bg";
  const CHAT_BGS = [["xyntal", "Xyntal"], ["space", "Weltall"], ["natur", "Natur"], ["tech", "Tech"], ["fun", "Fun"], ["none", "Ohne Muster"]];
  let chatBg = "xyntal";
  try { const saved = localStorage.getItem(BG_KEY); if (CHAT_BGS.some(([k]) => k === saved)) chatBg = saved; } catch { /* Standard */ }
  const ICON = {
    clip: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11.1l-8.5 8.5a5 5 0 0 1-7.1-7.1l8.5-8.5a3.5 3.5 0 0 1 5 5L11 17.2a2 2 0 0 1-2.8-2.8l7.8-7.8"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>',
    chat: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-8.5 8.5c-1.4 0-2.7-.3-3.9-.9L3 21l1.5-4.4A8.5 8.5 0 1 1 21 12z"/></svg>',
  };
  const STARTERS = [
    "Hey! Freut mich, dich kennenzulernen.",
    "Woran arbeitest du gerade?",
    "Cooles Profil – lass uns vernetzen.",
  ];

  const features = { reply: true, edit: true, delete: true, reactions: true, attachments: true, voice: true, presence: true };
  let v = { me: null, isMember: false, canAct: false };
  let messages = [];
  let directory = []; // alle anschreibbaren Mitglieder für die Suche
  const people = new Map();
  const reactions = new Map();
  const attachments = new Map();
  const urlCache = new Map();
  const watched = new Set();
  let active = null;
  let draft = "";
  let replyTo = null;
  let editingId = null;
  let confirmDelete = null;
  let pending = [];
  let voiceBlob = null;
  let rec = null;
  let uploading = false;
  let composerObs = null;
  let uploadAbort = false;
  let uploadLabel = "";
  let partnerTyping = false;
  let typingChannel = null;
  let typingTimer = null;
  let lastPulse = 0;
  let gesture = null;
  let dragTimer = 0;
  let inboxChannel = null;
  let reactChannel = null;

  const sid = (id) => String(id ?? "");
  const asId = (id) => { const n = Number(id); return Number.isSafeInteger(n) ? n : id; };
  const partnerOf = (m) => (m.sender_id === v.me.id ? m.recipient_id : m.sender_id);
  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function status(text, kind) {
    const el = document.getElementById("thread-status");
    if (el) setStatus(el, text || "", kind || "");
  }
  function fmt(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  }
  function dayLabel(ts) {
    const d = new Date(ts);
    const start = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(d)) / 86400000);
    if (diff === 0) return "Heute";
    if (diff === 1) return "Gestern";
    const lang = document.documentElement.lang === "en" ? "en-GB" : "de-DE";
    return d.toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
  }
  function clockTime(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const lang = document.documentElement.lang === "en" ? "en-GB" : "de-DE";
    return d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
  }
  function listTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const start = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
    const diff = Math.round((start(new Date()) - start(d)) / 86400000);
    if (diff === 0) return clockTime(ts);
    if (diff === 1) return "Gestern";
    if (diff < 7) {
      const lang = document.documentElement.lang === "en" ? "en-GB" : "de-DE";
      return d.toLocaleDateString(lang, { weekday: "short" });
    }
    return dayLabel(ts);
  }
  function safeName(name) {
    const base = String(name || "Datei").split(/[/\\]/).pop().replace(/[\u0000-\u001f]/g, "").trim();
    return (base || "Datei").slice(0, 255);
  }
  function grow(ta) {
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }
  function stripUndef(obj) {
    const out = {};
    for (const [k, val] of Object.entries(obj || {})) if (val !== undefined) out[k] = val;
    return out;
  }
  function upsertMessage(msg) {
    if (!msg?.id) return;
    const i = messages.findIndex((m) => sid(m.id) === sid(msg.id));
    if (i >= 0) messages[i] = { ...messages[i], ...stripUndef(msg) };
    else messages.push(msg);
  }
  function findMessage(id) { return messages.find((m) => sid(m.id) === sid(id)); }
  function isInActive(id) {
    const m = findMessage(id);
    return !!(m && active && (m.sender_id === active || m.recipient_id === active));
  }
  function canEdit(m) {
    if (!features.edit || !m || m.sender_id !== v.me.id || m.deleted_at) return false;
    return Date.now() - new Date(m.created_at).getTime() < 15 * 60 * 1000;
  }
  function closeEnough(a, b) {
    if (!a || !b || a.sender_id !== b.sender_id || a.deleted_at || b.deleted_at) return false;
    if (dayKey(a.created_at) !== dayKey(b.created_at)) return false;
    return Math.abs(new Date(b.created_at) - new Date(a.created_at)) < 5 * 60 * 1000;
  }

  async function probe() {
    let limited = false;
    try {
      const rx = await sb.from("message_reactions").select("message_id").limit(1);
      if (rx.error) { features.reactions = false; limited = true; }
    } catch { features.reactions = false; limited = true; }
    try {
      const att = await sb.from("message_attachments").select("id").limit(1);
      if (att.error) { features.attachments = false; limited = true; }
    } catch { features.attachments = false; limited = true; }
    try {
      const cols = await sb.from("messages").select("reply_to, edited_at, deleted_at").limit(1);
      if (cols.error) { features.reply = features.edit = features.delete = false; limited = true; }
    } catch { features.reply = features.edit = features.delete = false; limited = true; }
    features.voice = !!(features.attachments && typeof MediaRecorder !== "undefined" && navigator.mediaDevices?.getUserMedia);
    return limited;
  }

  async function ensurePeople(ids) {
    const missing = [...new Set(ids.filter(Boolean))].filter((id) => !people.has(id));
    if (!missing.length) return;
    const rows = unwrap(await sb.from("profiles").select("id, name, headline, avatar_path").in("id", missing)) || [];
    rows.forEach((r) => people.set(r.id, r));
    try {
      const cards = unwrap(await sb.from("waitlist_cards").select("user_id, handle").in("user_id", missing).not("handle", "is", null)) || [];
      for (const c of cards) {
        const p = people.get(c.user_id);
        if (p && c.handle) p.handle = c.handle;
      }
    } catch { /* Profil-Link optional */ }
  }
  function syncNav() {
    if (!v.me) return;
    const left = messages.filter((m) => m.recipient_id === v.me.id && !m.read_at).length;
    const link = document.querySelector("[data-messages]");
    if (link) link.innerHTML = left ? `Nachrichten <span class="badge">${left}</span>` : "Nachrichten";
  }
  function systemLabel(m) {
    if (!m) return "Nachricht";
    if (m.deleted_at) return "Diese Nachricht wurde gelöscht";
    if (String(m.body || "").trim()) return "";
    const atts = attachments.get(sid(m.id)) || [];
    if (!atts.length) return "Neue Nachricht";
    if (atts.every((a) => a.kind === "audio")) return "Sprachnachricht";
    if (atts.every((a) => a.kind === "image")) return atts.length === 1 ? "Foto" : "Fotos";
    if (atts.every((a) => a.kind === "video")) return atts.length === 1 ? "Video" : "Videos";
    if (atts.length === 1) {
      if (atts[0].kind === "image") return "Foto";
      if (atts[0].kind === "video") return "Video";
      if (atts[0].kind === "audio") return "Sprachnachricht";
    }
    return "Datei";
  }
  function fmtSize(n) {
    const b = Number(n) || 0;
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10 * 1024 ? 1 : 0) + " KB";
    return (b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }
  function listPreview(m, mine) {
    const sys = systemLabel(m);
    if (sys) return (mine ? "<span>Du</span><span>: </span>" : "") + "<span>" + sys + "</span>";
    const text = String(m.body || "").trim().replace(/\s+/g, " ").slice(0, 70);
    return esc((mine ? "Du: " : "") + text);
  }
  function conversations() {
    const byPartner = new Map();
    for (const m of messages) {
      const p = partnerOf(m);
      const c = byPartner.get(p) || { partner: p, last: m, unread: 0 };
      if (new Date(m.created_at) >= new Date(c.last.created_at)) c.last = m;
      if (m.recipient_id === v.me.id && !m.read_at) c.unread++;
      byPartner.set(p, c);
    }
    return [...byPartner.values()].sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  }
  function renderList() {
    const host = document.getElementById("conversations");
    if (!host || !v.me) return;
    const list = conversations();
    if (active && !list.some((c) => c.partner === active)) list.unshift({ partner: active, last: null, unread: 0 });
    host.innerHTML = list.length ? list.map((c) => {
      const p = people.get(c.partner) || { name: "Mitglied" };
      const mine = c.last && c.last.sender_id === v.me.id;
      const preview = c.last ? listPreview(c.last, mine) : "Neues Gespräch";
      const when = c.last ? listTime(c.last.created_at) : "";
      return `<button type="button" class="conv${c.partner === active ? " active" : ""}${c.unread ? " unread" : ""}" data-partner="${esc(c.partner)}" aria-current="${c.partner === active ? "true" : "false"}">
        ${avatar(p.name, "avatar-sm", p.avatar_path)}
        <span class="conv-text"><strong>${esc(p.name || "Mitglied")}</strong><span class="conv-preview">${preview}</span></span>
        <span class="conv-meta">${when ? `<time datetime="${esc(c.last.created_at)}">${esc(when)}</time>` : ""}${c.unread ? `<span class="badge">${c.unread}</span>` : ""}</span>
      </button>`;
    }).join("") : `<div class="inbox-empty"><p class="empty-small">Noch keine Gespräche.</p><p class="inbox-empty-hint">Suche oben nach einem Mitglied und schreib die erste Nachricht.</p></div>`;
    syncNav();
  }

  function quoteInner(m) {
    if (!m) return `<span class="quote-text">Nachricht</span>`;
    const who = v.me && m.sender_id === v.me.id;
    const name = who ? "" : esc(people.get(m.sender_id)?.name || "Mitglied");
    const sys = systemLabel(m);
    const body = sys
      ? (who ? "<span>Du</span><span>: </span>" : "") + "<span>" + sys + "</span>"
      : esc((who ? "Du: " : "") + String(m.body || "").trim().replace(/\s+/g, " ").slice(0, 140));
    return (name ? `<span class="quote-name">${name}</span>` : "") + `<span class="quote-text">${body}</span>`;
  }
  function quoteBlock(m) {
    if (!m.reply_to || m.deleted_at) return "";
    return `<button type="button" class="quote" data-jump="${esc(m.reply_to)}">${quoteInner(findMessage(m.reply_to))}</button>`;
  }
  function emojiBtn(e) {
    return `<button type="button" class="emoji-btn" data-pick="1" data-emoji="${e}">${e}</button>`;
  }
  function toolsHtml(m) {
    if (m.deleted_at || sid(editingId) === sid(m.id)) return "";
    const mine = m.sender_id === v.me.id;
    const confirming = sid(confirmDelete) === sid(m.id);
    const hasAny = features.reply || features.reactions || (mine && (canEdit(m) || features.delete));
    if (!hasAny) return "";
    const emojis = features.reactions
      ? `<div class="react-pop">${QUICK.map(emojiBtn).join("")}<button type="button" class="emoji-btn" data-emoji-more aria-expanded="false" aria-label="Mehr Emojis">+</button><div class="react-more" hidden>${MORE.map(emojiBtn).join("")}</div></div>`
      : "";
    return `<button type="button" class="msg-more" data-msg-more aria-label="Nachrichtenaktionen" aria-expanded="false" aria-haspopup="true">⋯</button>
    <div class="bubble-tools" role="toolbar" aria-label="Nachrichtenaktionen">
      ${features.reply ? `<button type="button" class="tool-btn" data-reply>Antworten</button>` : ""}
      ${emojis}
      ${mine && canEdit(m) ? `<button type="button" class="tool-btn" data-edit aria-label="Nachricht bearbeiten">Bearbeiten</button>` : ""}
      ${mine && features.delete ? `${confirming ? `<button type="button" class="tool-btn" data-delete-cancel>Abbrechen</button>` : ""}<button type="button" class="tool-btn danger" data-delete aria-label="Nachricht löschen">${confirming ? "Nachricht löschen" : "Löschen"}</button>` : ""}
    </div>`;
  }
  function chipsHtml(id) {
    if (!features.reactions) return "";
    const list = reactions.get(sid(id)) || [];
    if (!list.length) return "";
    const map = new Map();
    for (const r of list) {
      const g = map.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
      g.count += 1;
      if (r.member_id === v.me.id) g.mine = true;
      map.set(r.emoji, g);
    }
    return `<div class="react-chips">${[...map.values()].map((g) => `<button type="button" class="react-chip${g.mine ? " mine" : ""}" data-react="1" data-emoji="${g.emoji}" aria-pressed="${g.mine ? "true" : "false"}"${g.mine ? ' aria-label="Reaktion entfernen"' : ""}><span>${g.emoji}</span><span>${g.count}</span></button>`).join("")}</div>`;
  }
  function attachmentCard(a) {
    if (!PATH_RE.test(a.path || "")) return "";
    const name = esc(a.name || "Datei");
    if (a.kind === "image") {
      const dim = Number(a.width) > 0 && Number(a.height) > 0 ? ` width="${Number(a.width)}" height="${Number(a.height)}"` : "";
      return `<button type="button" class="attach-image" data-lightbox data-kind="image" data-attach-path="${esc(a.path)}" aria-label="${name}"><img alt=""${dim} data-attach-path="${esc(a.path)}"></button>`;
    }
    if (a.kind === "video") return `<div class="attach-video"><video controls playsinline preload="metadata" data-attach-path="${esc(a.path)}" aria-label="${name}"></video></div>`;
    if (a.kind === "audio") {
      return `<div class="voice-player"><button type="button" class="voice-play" aria-label="Sprachnachricht" aria-pressed="false">▶</button><input class="voice-range" type="range" min="0" max="1000" value="0" aria-label="Sprachnachricht"><span class="voice-time">${fmt(a.duration)}</span><button type="button" class="voice-speed" data-i="0" aria-label="Wiedergabegeschwindigkeit">1×</button><audio preload="metadata" data-attach-path="${esc(a.path)}"></audio></div>`;
    }
    return `<a class="file-card" data-attach-path="${esc(a.path)}" download="${name}" href="#" rel="noopener noreferrer"><span class="file-meta"><span class="file-name">${name}</span><span class="file-size">${esc(fmtSize(a.size))}</span></span><span>Herunterladen</span></a>`;
  }
  function attachmentsHtml(m) {
    if (m.deleted_at || !features.attachments) return "";
    const list = (attachments.get(sid(m.id)) || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
    if (!list.length) return "";
    return `<div class="attach-list">${list.map(attachmentCard).join("")}</div>`;
  }
  function bubbleHtml(m, grouped, tail) {
    const mine = m.sender_id === v.me.id;
    const id = esc(m.id);
    const cls = ["bubble", mine ? "mine" : "", grouped ? "grouped" : "", tail ? "tail" : "", m.deleted_at ? "deleted" : ""].filter(Boolean).join(" ");
    const stamp = clockTime(m.created_at) || timeAgo(m.created_at);
    const time = `<time datetime="${esc(m.created_at)}" title="${esc(timeAgo(m.created_at))}">${esc(stamp)}${!m.deleted_at && m.edited_at ? " · bearbeitet" : ""}</time>`;
    if (m.deleted_at) {
      return `<div class="${cls}" id="msg-${id}" data-id="${id}"><p class="deleted-text">Diese Nachricht wurde gelöscht</p>${time}</div>`;
    }
    const editing = sid(editingId) === sid(m.id);
    const text = String(m.body || "").trim();
    const body = editing
      ? `<div class="edit-box"><textarea aria-label="Nachricht bearbeiten" maxlength="2000">${esc(m.body || "")}</textarea><div class="edit-actions"><button type="button" class="btn btn-small" data-edit-save>Speichern</button><button type="button" class="btn btn-ghost btn-small" data-edit-cancel>Abbrechen</button></div></div>`
      : (text ? `<div class="bubble-body">${richText(m.body)}</div>` : "");
    const meta = tail || m.edited_at ? time : "";
    return `<div class="${cls}" id="msg-${id}" data-id="${id}">${toolsHtml(m)}${quoteBlock(m)}${attachmentsHtml(m)}${body}${chipsHtml(m.id)}${meta}</div>`;
  }
  function emptyThreadHtml(p) {
    const name = p.name || "Mitglied";
    const chips = STARTERS.map((t) => `<button type="button" class="starter-chip" data-starter="${esc(t)}">${esc(t)}</button>`).join("");
    return `<div class="thread-empty">
      <div class="thread-empty-card">
        ${avatar(name, "avatar-lg", p.avatar_path)}
        <strong class="thread-empty-name">${esc(name)}</strong>
        ${p.headline ? `<p class="thread-empty-headline">${esc(p.headline)}</p>` : ""}
        <p class="thread-empty-hint">Schreib die erste Nachricht – stell dich kurz vor.</p>
        <div class="starter-chips" role="group" aria-label="Vorschläge">${chips}</div>
      </div>
    </div>`;
  }
  function idleThreadHtml() {
    return `<div class="thread-idle">
      <div class="thread-idle-mark" aria-hidden="true">${ICON.chat}</div>
      <strong>Deine Nachrichten</strong>
      <p>Wähle links ein Gespräch oder suche oben ein Mitglied.</p>
    </div>`;
  }
  function threadBody(p) {
    const thread = messages.filter((m) => partnerOf(m) === active).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    if (!thread.length) return emptyThreadHtml(p || {});
    let html = "";
    for (let i = 0; i < thread.length; i++) {
      const m = thread[i];
      const prev = thread[i - 1];
      const next = thread[i + 1];
      if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) html += `<div class="day-sep">${esc(dayLabel(m.created_at))}</div>`;
      html += bubbleHtml(m, closeEnough(prev, m), !closeEnough(m, next));
    }
    return html;
  }
  function replySlotHtml() {
    if (!replyTo || !features.reply) return "";
    const m = findMessage(replyTo);
    if (!m || m.deleted_at) return "";
    return `<div class="reply-bar"><button type="button" class="quote" data-jump="${esc(replyTo)}">${quoteInner(m)}</button><button type="button" class="msg-icon" data-reply-cancel aria-label="Antwort abbrechen">×</button></div>`;
  }
  function pendingHtml() {
    if (!pending.length && !voiceBlob) return "";
    const voice = voiceBlob ? `<li class="pend"><span class="pend-name">Sprachnachricht</span><button type="button" data-voice-remove aria-label="Anhang entfernen">×</button></li>` : "";
    const cards = pending.map((item, i) => `<li class="pend">${item.kind === "image" && item.url ? `<img alt="" src="${esc(item.url)}">` : `<span class="pend-name">${esc(item.name)}</span>`}<button type="button" data-pend-remove="${i}" aria-label="Anhang entfernen">×</button></li>`).join("");
    return `<ul class="pend-list">${voice}${cards}</ul>`;
  }
  function recorderHtml() {
    if (!rec) return "";
    const sec = (Date.now() - rec.started) / 1000;
    return `<div class="rec-bar"><button type="button" class="msg-icon" id="rec-cancel" aria-label="Aufnahme abbrechen">×</button><span class="rec-level" aria-hidden="true"><i></i></span><span id="rec-time">${fmt(sec)}</span><button type="button" class="btn btn-small" id="rec-send">Aufnahme senden</button></div>`;
  }
  function showMicNow() {
    return features.voice && !rec && !voiceBlob && !draft.trim() && pending.length === 0;
  }
  function syncSendButton() {
    const mic = document.getElementById("mic-btn");
    const send = document.getElementById("send-btn");
    const attach = document.getElementById("attach-btn");
    const showMic = showMicNow();
    if (mic) mic.hidden = !showMic;
    if (send) { send.hidden = showMic || !!rec; send.disabled = uploading; }
    if (attach) attach.disabled = uploading;
  }
  function updateChrome() {
    const reply = document.getElementById("reply-slot");
    const pend = document.getElementById("pending-slot");
    const recorder = document.getElementById("recorder-slot");
    if (reply) reply.innerHTML = replySlotHtml();
    if (pend) pend.innerHTML = pendingHtml();
    if (recorder) recorder.innerHTML = recorderHtml();
    const ta = document.querySelector("#thread-form textarea");
    if (ta && ta.value !== draft) ta.value = draft;
    if (ta) grow(ta);
    syncSendButton();
  }
  function applyTypingLabel() {
    const el = document.getElementById("typing-indicator");
    if (!el) return;
    if (!partnerTyping || !active) { el.textContent = ""; return; }
    const name = people.get(active)?.name || "Mitglied";
    el.innerHTML = `<span data-no-i18n>${esc(name)}</span> schreibt …`;
  }
  function showUploading(text) {
    status(text || "Wird hochgeladen …");
    if (document.getElementById("cancel-upload")) return;
    const el = document.getElementById("thread-status");
    if (!el) return;
    el.insertAdjacentHTML("afterend", `<p class="upload-row"><button type="button" class="btn btn-ghost btn-small" id="cancel-upload">Upload abbrechen</button></p>`);
  }

  function applyStarter(text) {
    const ta = document.querySelector("#thread-form textarea");
    if (!ta || uploading) return;
    draft = String(text || "");
    ta.value = draft;
    grow(ta);
    syncSendButton();
    ta.focus();
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch { /* leer */ }
  }
  function renderThread() {
    const box = document.getElementById("thread");
    if (!box) return;
    if (!active) {
      box.innerHTML = idleThreadHtml();
      return;
    }
    const prevList = document.getElementById("thread-messages");
    const prevTa = document.querySelector("#thread-form textarea");
    if (prevTa) draft = prevTa.value;
    const sel = prevTa && document.activeElement === prevTa ? [prevTa.selectionStart, prevTa.selectionEnd] : null;
    const stick = !prevList || prevList.scrollHeight - prevList.scrollTop - prevList.clientHeight < 90;
    const prevScroll = prevList ? prevList.scrollTop : 0;
    const p = people.get(active) || { name: "Mitglied", headline: "" };
    const showMic = showMicNow();
    const handle = String(p.handle || "").toLowerCase();
    const profileHref = /^[a-z0-9][a-z0-9_-]{2,19}$/.test(handle) ? `/${encodeURIComponent(handle)}` : "";
    const profileOpen = profileHref
      ? `<a class="thread-profile" href="${esc(profileHref)}" aria-label="Profil von ${esc(p.name || "Mitglied")}">`
      : `<div class="thread-profile">`;
    const profileClose = profileHref ? "</a>" : "</div>";
    box.innerHTML = `
      <header class="thread-head">
        <button type="button" class="thread-back" aria-label="Zurück zur Liste">←</button>
        ${profileOpen}
          ${avatar(p.name, "avatar-sm thread-avatar", p.avatar_path)}
          <span class="thread-id">
            <strong>${esc(p.name || "Mitglied")}</strong>
            <span class="thread-headline">${esc(p.headline || "")}</span>
            <span class="typing" id="typing-indicator" role="status"></span>
          </span>
        ${profileClose}
        ${bgPickerHtml()}
      </header>
      <div class="thread-messages" id="thread-messages" role="log" aria-label="Nachrichten">
        <span class="swipe-hint" id="swipe-hint" hidden>Antworten</span>
        ${threadBody(p)}
      </div>
      <form class="thread-form" id="thread-form" novalidate>
        <div id="reply-slot">${replySlotHtml()}</div>
        <div id="pending-slot">${pendingHtml()}</div>
        <div id="recorder-slot">${recorderHtml()}</div>
        ${features.attachments ? `<div class="drop-hint">Anhänge hier ablegen</div>` : ""}
        <div class="composer-row">
          ${features.attachments ? `<button type="button" class="msg-icon" id="attach-btn" aria-label="Anhang hinzufügen">${ICON.clip}</button><input id="attach-input" type="file" multiple hidden tabindex="-1" aria-hidden="true" accept="${ACCEPT}">` : ""}
          <textarea name="body" rows="1" maxlength="2000" placeholder="Nachricht schreiben …" aria-label="Nachricht" aria-describedby="composer-hint" enterkeyhint="send">${esc(draft)}</textarea>
          ${features.voice ? `<button type="button" class="msg-icon" id="mic-btn" aria-label="Aufnahme starten"${showMic ? "" : " hidden"}>${ICON.mic}</button>` : ""}
          <button class="msg-icon send-btn" id="send-btn" type="submit" aria-label="Senden"${showMic || rec ? " hidden" : ""}>${ICON.send}</button>
        </div>
        <p class="sr-only" id="composer-hint">Tippe Enter zum Senden, Shift+Enter für neue Zeile</p>
      </form>
      <p class="form-status" id="thread-status" role="status" aria-live="polite"></p>`;
    // Eingabeleiste schwebt als Glas über den Nachrichten: Platz unten freihalten
    const form = document.getElementById("thread-form");
    if (form) {
      box.style.setProperty("--composer-h", form.offsetHeight + "px");
      composerObs?.disconnect();
      if ("ResizeObserver" in window) {
        composerObs = new ResizeObserver(() => box.style.setProperty("--composer-h", form.offsetHeight + "px"));
        composerObs.observe(form);
      }
    }
    document.getElementById("inbox").classList.add("show-thread");
    const list = document.getElementById("thread-messages");
    if (stick) list.scrollTop = list.scrollHeight;
    else list.scrollTop = prevScroll;
    const next = document.querySelector("#thread-form textarea");
    if (next) grow(next);
    const editTa = document.querySelector(".edit-box textarea");
    if (editTa) { grow(editTa); editTa.focus(); }
    else if (sel && next) { next.focus(); try { next.setSelectionRange(sel[0], sel[1]); } catch { /* leer */ } }
    applyTypingLabel();
    hydrateMedia(box);
    syncSendButton();
    if (uploading) showUploading(uploadLabel);
  }

  function setReply(id) {
    if (!features.reply || !id) return;
    const m = findMessage(id);
    if (!m || m.deleted_at) return;
    replyTo = sid(m.id);
    editingId = null;
    document.querySelectorAll(".bubble.show-tools").forEach((el) => el.classList.remove("show-tools"));
    const slot = document.getElementById("reply-slot");
    if (slot) slot.innerHTML = replySlotHtml();
    else renderThread();
    document.querySelector("#thread-form textarea")?.focus();
  }
  function jumpTo(id) {
    const el = document.getElementById("msg-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    clearTimeout(jumpTo.t);
    jumpTo.t = setTimeout(() => el.classList.remove("flash"), 1600);
  }

  function addReaction(r) {
    if (!r?.message_id || !r.emoji) return;
    const key = sid(r.message_id);
    const list = reactions.get(key) || [];
    if (!list.some((x) => x.member_id === r.member_id && x.emoji === r.emoji)) list.push({ member_id: r.member_id, emoji: r.emoji });
    reactions.set(key, list);
  }
  function removeReaction(r) {
    if (!r?.message_id) return;
    const key = sid(r.message_id);
    reactions.set(key, (reactions.get(key) || []).filter((x) => !(x.member_id === r.member_id && x.emoji === r.emoji)));
  }
  function addAttachment(a) {
    if (!a?.message_id || !a.path) return;
    const key = sid(a.message_id);
    const list = attachments.get(key) || [];
    if (!list.some((x) => sid(x.id) === sid(a.id) && x.path === a.path)) list.push(a);
    attachments.set(key, list);
  }
  async function loadExtras(ids) {
    const list = [...new Set(ids.filter((id) => id != null).map(sid))];
    if (!list.length) return;
    for (let i = 0; i < list.length; i += 80) {
      const chunk = list.slice(i, i + 80);
      if (features.reactions) {
        const { data, error } = await sb.from("message_reactions").select("message_id, member_id, emoji").in("message_id", chunk);
        if (!error) (data || []).forEach(addReaction);
      }
      if (features.attachments) {
        const { data, error } = await sb.from("message_attachments").select("id, message_id, path, kind, mime, size, name, width, height, duration").in("message_id", chunk);
        if (!error) (data || []).forEach(addAttachment);
      }
    }
  }
  // Anhänge stehen nicht in der Realtime-Publication; kurz nach dem Senden nachladen.
  function watchAttachments(id) {
    if (!features.attachments) return;
    const key = sid(id);
    if (watched.has(key)) return;
    watched.add(key);
    for (const delay of [800, 2000, 4500]) {
      setTimeout(async () => {
        try {
          const before = (attachments.get(key) || []).length;
          await loadExtras([id]);
          if ((attachments.get(key) || []).length !== before) {
            if (isInActive(id)) renderThread();
            renderList();
          }
        } catch { /* Seite nicht stören */ }
      }, delay);
    }
  }

  async function signedUrl(path) {
    if (!PATH_RE.test(path || "")) return "";
    const hit = urlCache.get(path);
    if (hit && hit.exp > Date.now()) return hit.url;
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) return "";
    urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
    return data.signedUrl;
  }
  function bindVoice(audio) {
    if (!audio || audio.dataset.bound) return;
    audio.dataset.bound = "1";
    const box = audio.closest(".voice-player");
    if (!box) return;
    const range = box.querySelector(".voice-range");
    const time = box.querySelector(".voice-time");
    const play = box.querySelector(".voice-play");
    const paint = () => {
      if (time) time.textContent = fmt(audio.currentTime || 0);
      if (range && document.activeElement !== range && audio.duration) range.value = String(Math.round(audio.currentTime / audio.duration * 1000));
    };
    audio.addEventListener("timeupdate", paint);
    audio.addEventListener("pause", () => { if (play) { play.textContent = "▶"; play.setAttribute("aria-pressed", "false"); } });
    range?.addEventListener("input", () => { if (audio.duration) audio.currentTime = audio.duration * (Number(range.value) / 1000); });
  }
  function hydrateMedia(root) {
    root.querySelectorAll("[data-attach-path]").forEach((el) => {
      const path = el.dataset.attachPath;
      if (!PATH_RE.test(path || "") || el.dataset.hydrated) return;
      if (!["IMG", "AUDIO", "VIDEO", "A"].includes(el.tagName)) return;
      el.dataset.hydrated = "1";
      signedUrl(path).then((url) => {
        if (!el.isConnected) return;
        if (!url) { delete el.dataset.hydrated; return; }
        if (el.tagName === "A") el.href = url;
        else el.src = url;
      }).catch(() => { delete el.dataset.hydrated; });
    });
    root.querySelectorAll("audio[data-attach-path]").forEach(bindVoice);
  }
  let lightbox = { paths: [], index: 0 };
  function ensureLightbox() {
    if (document.getElementById("msg-lightbox")) return;
    document.body.insertAdjacentHTML("beforeend", `<dialog class="msg-lightbox" id="msg-lightbox" aria-label="Foto">
      <button type="button" class="msg-lightbox-close" aria-label="Schließen">×</button>
      <button type="button" class="msg-lightbox-nav prev" data-lb-dir="-1" aria-label="Vorheriges">‹</button>
      <button type="button" class="msg-lightbox-nav next" data-lb-dir="1" aria-label="Nächstes">›</button>
      <div class="msg-lightbox-stage"></div>
      <a class="msg-lightbox-dl btn btn-small" href="#" download rel="noopener noreferrer" aria-label="Herunterladen">Herunterladen</a>
    </dialog>`);
    const dlg = document.getElementById("msg-lightbox");
    dlg.querySelector(".msg-lightbox-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll("[data-lb-dir]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      showLightboxAt(lightbox.index + Number(btn.dataset.lbDir));
    }));
    let touchX = null;
    dlg.addEventListener("touchstart", (e) => { touchX = e.changedTouches?.[0]?.clientX ?? null; }, { passive: true });
    dlg.addEventListener("touchend", (e) => {
      if (touchX == null) return;
      const dx = (e.changedTouches?.[0]?.clientX ?? touchX) - touchX;
      touchX = null;
      if (Math.abs(dx) > 48) showLightboxAt(lightbox.index + (dx < 0 ? 1 : -1));
    }, { passive: true });
    dlg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") showLightboxAt(lightbox.index - 1);
      if (e.key === "ArrowRight") showLightboxAt(lightbox.index + 1);
    });
    dlg.addEventListener("close", () => {
      dlg.querySelectorAll("video").forEach((node) => { node.pause(); node.removeAttribute("src"); });
      dlg.querySelector(".msg-lightbox-stage").innerHTML = "";
      lightbox = { paths: [], index: 0 };
    });
  }
  async function showLightboxAt(i) {
    const dlg = document.getElementById("msg-lightbox");
    if (!dlg || !lightbox.paths.length) return;
    const n = lightbox.paths.length;
    lightbox.index = ((i % n) + n) % n;
    const item = lightbox.paths[lightbox.index];
    const url = await signedUrl(item.path);
    if (!url) { status("Das hat nicht geklappt. Versuch es erneut.", "error"); return; }
    dlg.setAttribute("aria-label", item.name || "Foto");
    dlg.querySelector(".msg-lightbox-stage").innerHTML = `<img alt="${esc(item.name || "Foto")}" src="${esc(url)}">`;
    const dl = dlg.querySelector(".msg-lightbox-dl");
    if (dl) { dl.href = url; dl.setAttribute("download", item.name || "foto.jpg"); }
    dlg.querySelectorAll("[data-lb-dir]").forEach((btn) => { btn.hidden = n < 2; });
  }
  async function openLightbox(path, name, siblings) {
    if (!PATH_RE.test(path || "")) return;
    ensureLightbox();
    const paths = (siblings && siblings.length ? siblings : [{ path, name: name || "Foto" }])
      .filter((x) => PATH_RE.test(x.path || ""));
    if (!paths.length) return;
    lightbox = { paths, index: Math.max(0, paths.findIndex((x) => x.path === path)) };
    if (lightbox.index < 0) lightbox.index = 0;
    await showLightboxAt(lightbox.index);
    const dlg = document.getElementById("msg-lightbox");
    try { if (!dlg.open) dlg.showModal(); }
    catch { window.open(await signedUrl(path), "_blank", "noopener,noreferrer"); }
  }

  function classify(file) {
    const name = safeName(file.name);
    if (!file.size) throw new Error("Das hat nicht geklappt. Versuch es erneut.");
    const parts = name.toLowerCase().split(".");
    if (parts.slice(1).some((p) => BLOCKED.has(p)) || /msdownload|x-msdos|x-executable|x-dosexec|x-msi|x-mach-binary/i.test(file.type || "")) {
      throw new Error("Ausführbare Dateien sind nicht erlaubt.");
    }
    const ext = parts.length > 1 ? parts[parts.length - 1] : "";
    const mime = KIND.has(file.type) ? file.type : (MIME_BY_EXT[ext] || "");
    const kind = KIND.get(mime);
    if (!kind || !EXT_BY_MIME[mime]) throw new Error("Dieser Dateityp ist nicht erlaubt.");
    if (kind === "video" && file.size > VIDEO_MAX) throw new Error("Videos dürfen höchstens 50 MB groß sein.");
    if (kind === "image" && file.size > IMAGE_MAX) throw new Error("Das Bild ist zu groß. Bitte wähle eine kleinere Datei.");
    if ((kind === "file" || kind === "audio") && file.size > FILE_MAX) throw new Error("Dateien dürfen höchstens 20 MB groß sein.");
    return { file, name, mime, ext: kind === "image" ? "jpg" : EXT_BY_MIME[mime], kind, url: "" };
  }
  function addFiles(files) {
    if (!features.attachments || uploading) return;
    const room = MAX_ATTACH - pending.length - (voiceBlob ? 1 : 0);
    if (files.length > room) status("Maximal 5 Anhänge pro Nachricht.", "error");
    let added = false;
    for (const file of files.slice(0, Math.max(0, room))) {
      try {
        const info = classify(file);
        info.url = info.kind === "image" ? URL.createObjectURL(file) : "";
        pending.push(info);
        added = true;
      } catch (err) { status(err.message || "Das hat nicht geklappt. Versuch es erneut.", "error"); }
    }
    if (added) updateChrome();
  }
  async function compressImage(file) {
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { throw new Error("Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei."); }
    try {
      const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bmp, 0, 0, w, h);
      let blob = null;
      for (const q of [0.85, 0.75, 0.62, 0.5]) {
        blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
        if (blob && blob.size <= 4 * 1024 * 1024) break;
      }
      if (!blob) throw new Error("Das Bild konnte nicht verkleinert werden. Bitte wähle ein anderes.");
      const base = safeName(file.name).replace(/\.[a-z0-9]+$/i, "") || "Datei";
      return { blob, mime: "image/jpeg", ext: "jpg", kind: "image", width: w, height: h, duration: null, name: (base.slice(0, 250) + ".jpg") };
    } finally { bmp.close?.(); }
  }
  function readMediaMeta(file, kind) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const el = document.createElement(kind === "video" ? "video" : "audio");
      const done = (meta) => { URL.revokeObjectURL(url); resolve(meta); };
      const timer = setTimeout(() => done({ duration: null, width: null, height: null }), 4000);
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        clearTimeout(timer);
        done({
          duration: Number.isFinite(el.duration) ? Math.round(el.duration * 100) / 100 : null,
          width: el.videoWidth || null,
          height: el.videoHeight || null,
        });
      };
      el.onerror = () => { clearTimeout(timer); done({ duration: null, width: null, height: null }); };
      el.src = url;
    });
  }
  async function prepareAttachment(item) {
    if (item.kind === "image") return compressImage(item.file);
    let meta = { duration: item.duration || null, width: item.width || null, height: item.height || null };
    if ((item.kind === "video" || item.kind === "audio") && meta.duration == null) meta = await readMediaMeta(item.file, item.kind === "video" ? "video" : "audio");
    const duration = Number(meta.duration);
    return {
      blob: item.file, mime: item.mime, ext: item.ext, kind: item.kind, name: safeName(item.name),
      width: meta.width || null, height: meta.height || null,
      duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    };
  }
  // Hängende Anfragen nicht endlos warten lassen („Wird hochgeladen …“ blieb sonst stehen)
  const TIMEOUT = "XYNTAL_TIMEOUT", SEND_TIMEOUT = 20000, UPLOAD_TIMEOUT = 180000;
  function withTimeout(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(TIMEOUT)), ms); })])
      .finally(() => clearTimeout(timer));
  }
  async function uploadOne(messageId, prep) {
    if (!prep.blob?.size) throw new Error("Das hat nicht geklappt. Versuch es erneut.");
    const path = (String(v.me.id).toLowerCase() + "/" + crypto.randomUUID() + "." + prep.ext).toLowerCase();
    if (!PATH_RE.test(path)) throw new Error("Das hat nicht geklappt. Versuch es erneut.");
    unwrap(await withTimeout(sb.storage.from(BUCKET).upload(path, prep.blob, { contentType: prep.mime, cacheControl: "3600", upsert: false }), UPLOAD_TIMEOUT));
    try {
      const rows = unwrap(await sb.from("message_attachments").insert({
        message_id: asId(messageId), path, kind: prep.kind, mime: prep.mime, size: prep.blob.size,
        name: prep.name.slice(0, 255), width: prep.width || null, height: prep.height || null, duration: prep.duration || null,
      }).select());
      if (!rows?.[0]) throw new Error("Das hat nicht geklappt. Versuch es erneut.");
      return rows[0];
    } catch (err) {
      try { await sb.storage.from(BUCKET).remove([path]); } catch { /* Datei bleibt sonst liegen */ }
      throw err;
    }
  }
  function clearPendingUrls() { for (const item of pending) if (item.url) URL.revokeObjectURL(item.url); }
  function clearVoice() { if (voiceBlob?.url) URL.revokeObjectURL(voiceBlob.url); voiceBlob = null; }
  function restorePrepared(preps) {
    for (const p of preps) {
      if (pending.length + (voiceBlob ? 1 : 0) >= MAX_ATTACH) break;
      pending.push({
        file: p.blob, name: p.name, mime: p.mime, ext: p.ext, kind: p.kind,
        url: p.kind === "image" ? URL.createObjectURL(p.blob) : "",
        duration: p.duration, width: p.width, height: p.height,
      });
    }
    updateChrome();
  }

  function pickRecMime() {
    const types = [
      ["audio/webm;codecs=opus", "audio/webm", "webm"],
      ["audio/webm", "audio/webm", "webm"],
      ["audio/mp4", "audio/mp4", "mp4"],
      ["audio/ogg;codecs=opus", "audio/ogg", "ogg"],
      ["audio/ogg", "audio/ogg", "ogg"],
    ];
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return { rec: "", upload: "audio/webm", ext: "webm" };
    for (const row of types) if (MediaRecorder.isTypeSupported(row[0])) return { rec: row[0], upload: row[1], ext: row[2] };
    return { rec: "", upload: "audio/webm", ext: "webm" };
  }
  async function startRecording() {
    if (!features.voice || rec || uploading) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) {
      const denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      status(denied ? "Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen." : "Das hat nicht geklappt. Versuch es erneut.", "error");
      return;
    }
    const picked = pickRecMime();
    let recorder;
    try { recorder = picked.rec ? new MediaRecorder(stream, { mimeType: picked.rec }) : new MediaRecorder(stream); }
    catch {
      stream.getTracks().forEach((t) => t.stop());
      status("Das hat nicht geklappt. Versuch es erneut.", "error");
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const chunks = [];
    recorder.addEventListener("dataavailable", (e) => { if (e.data?.size) chunks.push(e.data); });
    rec = { recorder, stream, ctx, analyser, chunks, raf: 0, timer: 0, started: Date.now(), uploadMime: picked.upload, ext: picked.ext };
    updateChrome();
    const state = rec;
    const paint = () => {
      if (rec !== state) return;
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const n = (data[i] - 128) / 128; sum += n * n; }
      const level = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
      const bar = document.querySelector(".rec-level > i");
      if (bar) bar.style.transform = "scaleX(" + Math.max(0.06, level) + ")";
      state.raf = requestAnimationFrame(paint);
    };
    state.raf = requestAnimationFrame(paint);
    state.timer = setInterval(() => {
      const sec = (Date.now() - state.started) / 1000;
      const label = document.getElementById("rec-time");
      if (label) label.textContent = fmt(sec);
      if (sec >= MAX_VOICE) {
        status("Die Aufnahme darf höchstens 2 Minuten dauern.", "error");
        stopRecording(false);
      }
    }, 200);
    recorder.start(200);
  }
  function stopRecording(discard) {
    const state = rec;
    if (!state) return Promise.resolve(null);
    rec = null;
    clearInterval(state.timer);
    cancelAnimationFrame(state.raf);
    const elapsed = (Date.now() - state.started) / 1000;
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        state.stream.getTracks().forEach((t) => t.stop());
        state.ctx.close().catch(() => {});
        if (discard) { resolve(null); return; }
        const blob = new Blob(state.chunks, { type: state.uploadMime });
        resolve(blob.size ? { blob, mime: state.uploadMime, ext: state.ext, duration: Math.round(Math.min(elapsed, MAX_VOICE) * 100) / 100, kind: "audio", name: "Sprachnachricht." + state.ext } : null);
      };
      state.recorder.addEventListener("stop", finish, { once: true });
      if (state.recorder.state === "inactive") finish();
      else state.recorder.stop();
    }).then((result) => {
      if (result) {
        if (pending.length >= MAX_ATTACH) status("Maximal 5 Anhänge pro Nachricht.", "error");
        else {
          if (voiceBlob?.url) URL.revokeObjectURL(voiceBlob.url);
          voiceBlob = { ...result, url: URL.createObjectURL(result.blob), width: null, height: null };
        }
      }
      updateChrome();
      return result;
    });
  }

  async function sendCurrent() {
    if (uploading || !active || !v.me) return;
    if (rec) await stopRecording(false);
    const text = (document.querySelector("#thread-form textarea")?.value ?? draft).trim();
    draft = text;
    if (!text && !pending.length && !voiceBlob) return;
    if ((pending.length || voiceBlob) && !features.attachments) {
      status("Nachrichten konnten nicht vollständig geladen werden. Einige Funktionen sind eingeschränkt.", "error");
      return;
    }
    const recipient = active;
    const reply = features.reply ? replyTo : null;
    const queue = pending.map((item) => ({ ...item }));
    if (voiceBlob) queue.push({ file: voiceBlob.blob, name: voiceBlob.name, mime: voiceBlob.mime, ext: voiceBlob.ext, kind: "audio", duration: voiceBlob.duration, url: voiceBlob.url, voice: true });
    uploading = true;
    uploadAbort = false;
    uploadLabel = queue.some((i) => i.kind === "image") ? "Bild verkleinern …" : "Wird hochgeladen …";
    syncSendButton();
    showUploading(uploadLabel);
    let sent = null;
    const prepared = [];
    let nextUpload = 0;
    try {
      for (const item of queue) {
        if (uploadAbort) break;
        uploadLabel = item.kind === "image" ? "Bild verkleinern …" : "Wird hochgeladen …";
        showUploading(uploadLabel);
        prepared.push(await prepareAttachment(item));
      }
      if (uploadAbort || active !== recipient) { if (uploadAbort) status(""); return; }
      if (!text && !prepared.length) return;
      uploadLabel = "Wird hochgeladen …";
      showUploading(uploadLabel);
      const payload = { recipient_id: recipient, body: text };
      if (reply) payload.reply_to = asId(reply);
      let rows;
      try {
        rows = unwrap(await withTimeout(sb.from("messages").insert(payload).select(), SEND_TIMEOUT));
      } catch (err) {
        if (err?.message !== TIMEOUT) throw err;
        // Antwort kam nicht – vielleicht ist die Nachricht trotzdem angekommen
        const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        const check = await withTimeout(sb.from("messages").select("*").eq("sender_id", v.me.id).eq("recipient_id", recipient)
          .eq("body", text).gte("created_at", since).order("created_at", { ascending: false }).limit(1), 8000).catch(() => null);
        rows = check?.data?.length ? check.data : null;
        if (!rows) throw new Error("Der Server antwortet gerade nicht. Prüfe deine Verbindung und versuch es noch einmal.");
      }
      sent = rows?.[0];
      if (!sent?.id) throw new Error("Das hat nicht geklappt. Versuch es erneut.");
      upsertMessage(sent);
      draft = "";
      // renderThread übernimmt sonst den alten Text aus dem Eingabefeld wieder als Entwurf
      const sentTa = document.querySelector("#thread-form textarea");
      if (sentTa) sentTa.value = "";
      replyTo = null;
      clearPendingUrls();
      pending = [];
      clearVoice();
      stopTyping();
      renderList();
      renderThread();
      for (let i = 0; i < prepared.length; i++) {
        if (uploadAbort) break;
        showUploading("Wird hochgeladen …");
        const row = await uploadOne(sent.id, prepared[i]);
        addAttachment(row);
        nextUpload = i + 1;
        renderThread();
      }
      if (!text && nextUpload === 0) {
        if (features.delete) { try { await deleteMessage(sent.id); } catch { /* leer lassen */ } }
        restorePrepared(prepared);
        status(uploadAbort ? "" : "Das hat nicht geklappt. Versuch es erneut.", uploadAbort ? "" : "error");
        return;
      }
      if (nextUpload < prepared.length) restorePrepared(prepared.slice(nextUpload));
      status("");
      renderList();
      renderThread();
      document.querySelector("#thread-form textarea")?.focus();
    } catch (err) {
      if (!sent) { draft = text; replyTo = reply; }
      else {
        if (!text && nextUpload === 0 && features.delete) {
          try { await deleteMessage(sent.id); } catch { /* leere Nachricht bleibt */ }
        }
        if (nextUpload < prepared.length) restorePrepared(prepared.slice(nextUpload));
      }
      status(friendlyError(err), "error");
      renderList();
      renderThread();
    } finally {
      uploading = false;
      uploadAbort = false;
      document.getElementById("cancel-upload")?.remove();
      syncSendButton();
    }
  }

  async function saveEdit(id, body) {
    const m = findMessage(id);
    if (!m) return;
    if (!canEdit(m)) {
      editingId = null;
      renderThread();
      status("Bearbeiten ist nur innerhalb von 15 Minuten möglich.", "error");
      return;
    }
    const next = String(body || "").trim();
    const hasAtt = (attachments.get(sid(id)) || []).length > 0;
    if (!next && !hasAtt) return;
    const rows = unwrap(await sb.from("messages").update({ body: next, edited_at: new Date().toISOString() }).eq("id", asId(id)).select());
    if (rows?.[0]) upsertMessage(rows[0]);
    else { m.body = next; m.edited_at = new Date().toISOString(); }
    editingId = null;
    renderThread();
    renderList();
  }
  async function deleteMessage(id) {
    const now = new Date().toISOString();
    const paths = (attachments.get(sid(id)) || []).map((a) => a.path).filter(Boolean);
    const rows = unwrap(await sb.from("messages").update({ deleted_at: now }).eq("id", asId(id)).select());
    // Dateien über die Storage-API entfernen (direktes Löschen in storage.objects erlaubt Supabase nicht)
    if (paths.length) { try { await sb.storage.from(BUCKET).remove(paths); } catch { /* Datei bleibt sonst liegen */ } }
    if (rows?.[0]) upsertMessage(rows[0]);
    else {
      const m = findMessage(id);
      if (m) { m.deleted_at = now; m.body = ""; m.reply_to = null; }
    }
    reactions.delete(sid(id));
    attachments.delete(sid(id));
    if (sid(replyTo) === sid(id)) replyTo = null;
    confirmDelete = null;
    if (sid(editingId) === sid(id)) editingId = null;
    renderThread();
    renderList();
  }
  async function toggleReaction(messageId, emoji) {
    if (!features.reactions || !emoji) return;
    const m = findMessage(messageId);
    if (!m || m.deleted_at) return;
    const list = reactions.get(sid(messageId)) || [];
    const mine = list.some((r) => r.member_id === v.me.id && r.emoji === emoji);
    if (mine) {
      const { error } = await sb.from("message_reactions").delete().eq("message_id", asId(messageId)).eq("emoji", emoji).eq("member_id", v.me.id);
      if (error) throw new Error(friendlyError(error));
      removeReaction({ message_id: messageId, member_id: v.me.id, emoji });
    } else {
      const rows = unwrap(await sb.from("message_reactions").insert({ message_id: asId(messageId), emoji }).select());
      if (rows?.[0]) addReaction(rows[0]);
      else addReaction({ message_id: messageId, member_id: v.me.id, emoji });
    }
    renderThread();
  }

  async function markRead(partner) {
    const unread = messages.filter((m) => m.sender_id === partner && m.recipient_id === v.me.id && !m.read_at);
    if (!unread.length) return;
    const now = new Date().toISOString();
    const { error } = await sb.from("messages").update({ read_at: now }).in("id", unread.map((m) => asId(m.id)));
    if (error) return;
    unread.forEach((m) => { m.read_at = now; });
    renderList();
  }
  async function open(partner) {
    if (!v.me || !partner || partner === v.me.id || uploading) return;
    if (sid(partner) !== sid(active)) {
      if (rec) await stopRecording(true);
      clearPendingUrls();
      pending = [];
      clearVoice();
      draft = "";
      replyTo = null;
      editingId = null;
      confirmDelete = null;
      stopTyping();
      partnerTyping = false;
    }
    active = partner;
    await ensurePeople([partner]);
    renderList();
    renderThread();
    await markRead(partner);
    renderList();
    await bindTyping(partner);
    history.replaceState(null, "", "nachrichten?an=" + encodeURIComponent(partner));
  }

  function pulseTyping() {
    if (!typingChannel || !features.presence || !draft.trim()) return;
    const now = Date.now();
    if (now - lastPulse > 1200) {
      lastPulse = now;
      typingChannel.track({ typing: true, at: now }).catch(() => {});
    }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      lastPulse = 0;
      typingChannel?.track({ typing: false, at: Date.now() }).catch(() => {});
    }, 2200);
  }
  function stopTyping() {
    clearTimeout(typingTimer);
    typingTimer = null;
    lastPulse = 0;
    typingChannel?.track({ typing: false, at: Date.now() }).catch(() => {});
  }
  async function bindTyping(partner) {
    partnerTyping = false;
    if (typingChannel) {
      const old = typingChannel;
      typingChannel = null;
      try { await old.untrack(); } catch { /* egal */ }
      try { await sb.removeChannel(old); } catch { /* egal */ }
    }
    if (!features.presence || !partner) return;
    try {
      const topic = "type:" + [v.me.id, partner].sort().join(":");
      const ch = sb.channel(topic, { config: { presence: { key: v.me.id } } });
      ch.on("presence", { event: "sync" }, () => {
        try {
          const state = ch.presenceState() || {};
          let on = false;
          for (const [id, metas] of Object.entries(state)) {
            if (id === v.me.id) continue;
            if ((metas || []).some((m) => m && m.typing && Date.now() - Number(m.at || 0) < 5000)) on = true;
          }
          partnerTyping = on;
          applyTypingLabel();
        } catch { /* egal */ }
      });
      typingChannel = ch;
      ch.subscribe((st) => {
        if (st === "SUBSCRIBED") ch.track({ typing: false, at: Date.now() }).catch(() => {});
        if (st === "CHANNEL_ERROR" || st === "TIMED_OUT") features.presence = false;
      });
    } catch { features.presence = false; typingChannel = null; }
  }

  async function onInsert(msg) {
    if (!msg?.id || !v.me) return;
    if (msg.sender_id !== v.me.id && msg.recipient_id !== v.me.id) return;
    const known = messages.some((m) => sid(m.id) === sid(msg.id));
    upsertMessage(msg);
    try { await ensurePeople([msg.sender_id, msg.recipient_id]); } catch { /* Profil fehlt */ }
    if (!known) watchAttachments(msg.id);
    if (active && (msg.sender_id === active || msg.recipient_id === active)) {
      renderThread();
      if (msg.sender_id === active && msg.sender_id !== v.me.id && !msg.read_at) await markRead(active);
    }
    renderList();
  }
  async function onUpdate(msg) {
    if (!msg?.id || !v.me) return;
    if (msg.sender_id !== v.me.id && msg.recipient_id !== v.me.id) return;
    const prev = findMessage(msg.id);
    const same = (a, b) => (a || null) === (b || null);
    const readOnly = prev && prev.body === msg.body && same(prev.deleted_at, msg.deleted_at) && same(prev.edited_at, msg.edited_at) && same(prev.reply_to, msg.reply_to);
    upsertMessage(msg);
    if (msg.deleted_at) {
      reactions.delete(sid(msg.id));
      attachments.delete(sid(msg.id));
      if (sid(replyTo) === sid(msg.id)) replyTo = null;
    }
    if (!readOnly && active && (msg.sender_id === active || msg.recipient_id === active)) renderThread();
    renderList();
  }
  function subscribeInbox() {
    if (inboxChannel || !v.me) return;
    const id = v.me.id;
    const ch = sb.channel("inbox-" + id);
    const ins = (payload) => { onInsert(payload.new).catch(() => {}); };
    const upd = (payload) => { onUpdate(payload.new).catch(() => {}); };
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "recipient_id=eq." + id }, ins);
    ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "sender_id=eq." + id }, ins);
    ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: "recipient_id=eq." + id }, upd);
    ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: "sender_id=eq." + id }, upd);
    ch.subscribe();
    inboxChannel = ch;
    if (features.reactions) {
      reactChannel = sb.channel("msg-react-" + id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
          const row = payload.new;
          if (!row?.message_id || !findMessage(row.message_id)) return;
          addReaction(row);
          if (isInActive(row.message_id)) renderThread();
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
          const row = payload.old;
          if (!row?.message_id) return;
          removeReaction(row);
          if (isInActive(row.message_id)) renderThread();
        })
        .subscribe();
    }
    if (features.attachments) {
      sb.channel("msg-att-" + id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_attachments" }, (payload) => {
          const row = payload.new;
          if (!row?.message_id || !findMessage(row.message_id)) return;
          addAttachment(row);
          if (isInActive(row.message_id)) renderThread();
          renderList();
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_attachments" }, (payload) => {
          const row = payload.old;
          if (!row?.message_id) return;
          const key = sid(row.message_id);
          attachments.set(key, (attachments.get(key) || []).filter((a) => sid(a.id) !== sid(row.id) && a.path !== row.path));
          if (isInActive(row.message_id)) renderThread();
          renderList();
        })
        .subscribe();
    }
  }

  function endGesture(e, commit) {
    if (!gesture) return;
    clearTimeout(gesture.timer);
    const dx = e.clientX - gesture.x;
    if (gesture.bubble) gesture.bubble.style.transform = "";
    gesture.bubble?.classList.remove("swiping");
    const hint = document.getElementById("swipe-hint");
    if (hint) hint.hidden = true;
    const id = gesture.id;
    const swiping = gesture.swiping;
    gesture = null;
    if (commit && swiping && dx > 64) setReply(id);
  }

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  }
  function renderMemberResults(q) {
    const box = document.getElementById("member-results");
    if (!box) return;
    const query = norm(q).trim();
    if (!query) { box.hidden = true; box.innerHTML = ""; return; }
    const hits = directory.filter((m) => {
      if (!v.me || m.id === v.me.id) return false;
      return norm(m.name).includes(query) || norm(m.headline).includes(query);
    }).slice(0, 12);
    box.hidden = false;
    box.innerHTML = hits.length
      ? hits.map((m) => `<button type="button" class="member-hit" role="option" data-partner="${esc(m.id)}">${avatar(m.name, "avatar-sm", m.avatar_path)}<span class="conv-text"><strong>${esc(m.name || "Mitglied")}</strong>${m.headline ? `<span>${esc(m.headline)}</span>` : ""}</span></button>`).join("")
      : `<p class="empty-small">Kein Mitglied gefunden.</p>`;
  }
  function clearMemberSearch() {
    const input = document.getElementById("member-search");
    if (input) input.value = "";
    renderMemberResults("");
  }

  const thread = document.getElementById("thread");
  const convHost = document.getElementById("conversations");
  const memberSearch = document.getElementById("member-search");
  if (!thread || !convHost || !memberSearch) return;
  thread.addEventListener("click", async (e) => {
    try {
      if (e.target.closest(".thread-back")) { inbox.classList.remove("show-thread"); return; }
      if (e.target.closest("#cancel-upload")) { uploadAbort = true; e.target.closest("button").disabled = true; return; }
      const starter = e.target.closest("[data-starter]");
      if (starter) { applyStarter(starter.dataset.starter); return; }
      const msgMore = e.target.closest("[data-msg-more]");
      if (msgMore) {
        const bubble = msgMore.closest(".bubble");
        if (!bubble) return;
        const open = !bubble.classList.contains("show-tools");
        document.querySelectorAll(".bubble.show-tools").forEach((el) => {
          el.classList.remove("show-tools");
          el.querySelector("[data-msg-more]")?.setAttribute("aria-expanded", "false");
        });
        if (open) {
          bubble.classList.add("show-tools");
          msgMore.setAttribute("aria-expanded", "true");
        }
        return;
      }
      if (e.target.closest("#attach-btn")) { document.getElementById("attach-input")?.click(); return; }
      if (e.target.closest("#mic-btn")) { await startRecording(); return; }
      if (e.target.closest("#rec-cancel")) { await stopRecording(true); return; }
      if (e.target.closest("#rec-send")) { await stopRecording(false); await sendCurrent(); return; }
      if (e.target.closest("[data-voice-remove]")) { clearVoice(); updateChrome(); return; }
      const pend = e.target.closest("[data-pend-remove]");
      if (pend) {
        const item = pending.splice(Number(pend.dataset.pendRemove), 1)[0];
        if (item?.url) URL.revokeObjectURL(item.url);
        updateChrome();
        return;
      }
      const file = e.target.closest("a.file-card");
      if (file && (!file.getAttribute("href") || file.getAttribute("href") === "#")) { e.preventDefault(); return; }
      const light = e.target.closest("[data-lightbox]");
      if (light) {
        const bubble = light.closest(".bubble");
        const sibs = bubble
          ? [...bubble.querySelectorAll("[data-lightbox]")].map((el) => ({ path: el.dataset.attachPath, name: el.getAttribute("aria-label") || "Foto" }))
          : [];
        await openLightbox(light.dataset.attachPath, light.getAttribute("aria-label") || "Foto", sibs);
        return;
      }
      if (e.target.closest("[data-reply-cancel]")) { replyTo = null; updateChrome(); return; }
      const jump = e.target.closest("[data-jump]");
      if (jump) { jumpTo(jump.dataset.jump); return; }
      const bubble = e.target.closest(".bubble");
      if (e.target.closest("[data-reply]") && bubble) { setReply(bubble.dataset.id); return; }
      if (e.target.closest("[data-delete-cancel]")) { confirmDelete = null; renderThread(); return; }
      if (e.target.closest("[data-delete]") && bubble) {
        if (sid(confirmDelete) !== sid(bubble.dataset.id)) { confirmDelete = bubble.dataset.id; renderThread(); return; }
        await deleteMessage(bubble.dataset.id);
        return;
      }
      if (e.target.closest("[data-edit-cancel]")) { editingId = null; renderThread(); return; }
      if (e.target.closest("[data-edit-save]") && bubble) {
        await saveEdit(bubble.dataset.id, bubble.querySelector(".edit-box textarea")?.value || "");
        return;
      }
      if (e.target.closest("[data-edit]") && bubble) { editingId = bubble.dataset.id; confirmDelete = null; renderThread(); return; }
      const more = e.target.closest("[data-emoji-more]");
      if (more) {
        const panel = more.parentElement?.querySelector(".react-more");
        if (!panel) return;
        const willOpen = panel.hasAttribute("hidden");
        panel.toggleAttribute("hidden");
        more.setAttribute("aria-expanded", String(willOpen));
        return;
      }
      const pick = e.target.closest("[data-pick], [data-react]");
      if (pick && bubble) { await toggleReaction(bubble.dataset.id, pick.dataset.emoji); return; }
      const play = e.target.closest(".voice-play");
      if (play) {
        const audio = play.closest(".voice-player")?.querySelector("audio");
        if (!audio) return;
        if (audio.paused) {
          document.querySelectorAll(".voice-player audio").forEach((a) => { if (a !== audio) a.pause(); });
          await audio.play();
          play.textContent = "❚❚";
          play.setAttribute("aria-pressed", "true");
        } else audio.pause();
        return;
      }
      const speed = e.target.closest(".voice-speed");
      if (speed) {
        const audio = speed.closest(".voice-player")?.querySelector("audio");
        if (!audio) return;
        const order = [1, 1.5, 2];
        const i = (Number(speed.dataset.i || 0) + 1) % order.length;
        speed.dataset.i = String(i);
        audio.playbackRate = order[i];
        speed.textContent = String(order[i]) + "×";
        return;
      }
      if (!bubble) document.querySelectorAll(".bubble.show-tools").forEach((el) => el.classList.remove("show-tools"));
    } catch (err) { status(friendlyError(err), "error"); }
  });
  thread.addEventListener("submit", (e) => {
    if (e.target.id !== "thread-form") return;
    e.preventDefault();
    sendCurrent().catch((err) => status(friendlyError(err), "error"));
  });
  thread.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.target.matches("#thread-form textarea")) {
      e.preventDefault();
      if (!uploading) e.target.form?.requestSubmit();
    } else if (e.target.matches(".edit-box textarea")) {
      e.preventDefault();
      const id = e.target.closest(".bubble")?.dataset.id;
      if (id) saveEdit(id, e.target.value).catch((err) => status(friendlyError(err), "error"));
    }
  });
  thread.addEventListener("input", (e) => {
    if (e.target.matches("#thread-form textarea")) {
      draft = e.target.value;
      grow(e.target);
      if (draft.trim()) pulseTyping();
      else stopTyping();
      syncSendButton();
    } else if (e.target.matches(".edit-box textarea")) grow(e.target);
  });
  thread.addEventListener("paste", (e) => {
    if (!features.attachments || !e.target.matches("#thread-form textarea")) return;
    const files = [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
  });
  thread.addEventListener("change", (e) => {
    if (e.target.id !== "attach-input") return;
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (files.length) addFiles(files);
  });
  thread.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const bubble = e.target.closest(".bubble");
    if (!bubble || bubble.classList.contains("deleted")) return;
    if (e.target.closest("button, a, input, textarea, audio, video, label")) return;
    gesture = { id: bubble.dataset.id, x: e.clientX, y: e.clientY, bubble, swiping: false, timer: null };
    gesture.timer = setTimeout(() => {
      if (!gesture || gesture.swiping) return;
      document.querySelectorAll(".bubble.show-tools").forEach((el) => {
        el.classList.remove("show-tools");
        el.querySelector("[data-msg-more]")?.setAttribute("aria-expanded", "false");
      });
      bubble.classList.add("show-tools");
      bubble.querySelector("[data-msg-more]")?.setAttribute("aria-expanded", "true");
    }, 550);
  });
  thread.addEventListener("pointermove", (e) => {
    if (!gesture || !features.reply) return;
    const dx = e.clientX - gesture.x;
    const dy = e.clientY - gesture.y;
    if (!gesture.swiping && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) clearTimeout(gesture.timer);
    if (dx > 18 && Math.abs(dx) > Math.abs(dy) + 8) {
      gesture.swiping = true;
      clearTimeout(gesture.timer);
      if (!reduceMotion()) gesture.bubble.style.transform = "translateX(" + Math.min(dx, 84) + "px)";
      gesture.bubble.classList.add("swiping");
      const hint = document.getElementById("swipe-hint");
      if (hint) {
        hint.hidden = false;
        hint.style.top = (gesture.bubble.offsetTop + gesture.bubble.offsetHeight / 2) + "px";
      }
    }
  });
  thread.addEventListener("pointerup", (e) => endGesture(e, true));
  thread.addEventListener("pointercancel", (e) => endGesture(e, false));
  function hasFiles(e) { return [...(e.dataTransfer?.types || [])].includes("Files"); }
  thread.addEventListener("dragover", (e) => {
    if (!features.attachments || !hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    thread.classList.add("is-drag");
    clearTimeout(dragTimer);
    dragTimer = setTimeout(() => thread.classList.remove("is-drag"), 120);
  });
  thread.addEventListener("drop", (e) => {
    if (!features.attachments) return;
    e.preventDefault();
    clearTimeout(dragTimer);
    thread.classList.remove("is-drag");
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) addFiles(files);
  });

  convHost.addEventListener("click", (e) => {
    const b = e.target.closest("[data-partner]");
    if (b) open(b.dataset.partner).catch((err) => status(friendlyError(err), "error"));
  });
  memberSearch.addEventListener("input", () => renderMemberResults(memberSearch.value));
  memberSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { clearMemberSearch(); memberSearch.blur(); }
  });
  document.getElementById("member-results")?.addEventListener("click", (e) => {
    const hit = e.target.closest("[data-partner]");
    if (!hit) return;
    clearMemberSearch();
    open(hit.dataset.partner).catch((err) => status(friendlyError(err), "error"));
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".member-search")) return;
    const box = document.getElementById("member-results");
    if (box && !box.hidden) renderMemberResults("");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const dlg = document.getElementById("msg-lightbox");
    if (dlg?.open) { dlg.close(); return; }
    if (editingId) { editingId = null; confirmDelete = null; renderThread(); return; }
    if (rec) { stopRecording(true); return; }
    if (replyTo) { replyTo = null; updateChrome(); return; }
    document.querySelectorAll(".bubble.show-tools").forEach((el) => el.classList.remove("show-tools"));
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopTyping(); });

  // Composer oberhalb der mobilen Tastatur halten
  function syncKeyboardPad() {
    const form = document.getElementById("thread-form");
    if (!form || !window.visualViewport) return;
    const vv = window.visualViewport;
    const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    form.style.paddingBottom = overlap ? Math.min(overlap, 240) + "px" : "";
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncKeyboardPad);
    window.visualViewport.addEventListener("scroll", syncKeyboardPad);
  }

  async function boot() {
    try { v = await viewer(); }
    catch (err) {
      const n = document.getElementById("notice");
      if (n) n.innerHTML = `<div class="notice">${esc(friendlyError(err))}</div>`;
      return;
    }
    if (!v.me) { location.href = "login"; return; }
    if (!v.canAct) {
      document.getElementById("notice").innerHTML = accessNotice(v, "Nachrichten schreiben", { open: true });
      return;
    }
    let limited = false;
    try { limited = await probe(); }
    catch { limited = true; features.reply = features.edit = features.delete = features.reactions = features.attachments = features.voice = false; }
    inbox.hidden = false;
    try {
      const members = unwrap(await sb.from("profiles").select("id, name, headline, avatar_path").neq("status", "rejected").order("name")) || [];
      directory = members;
      members.forEach((m) => people.set(m.id, m));
      try {
        const cards = unwrap(await sb.from("waitlist_cards").select("user_id, handle").not("handle", "is", null)) || [];
        for (const c of cards) {
          const p = people.get(c.user_id);
          if (p && c.handle) p.handle = c.handle;
        }
      } catch { /* Profil-Link optional */ }
      messages = unwrap(await sb.from("messages").select("*").or(`sender_id.eq.${v.me.id},recipient_id.eq.${v.me.id}`).order("created_at", { ascending: false }).limit(1000)) || [];
      await ensurePeople(messages.map(partnerOf));
      await loadExtras(messages.map((m) => m.id));
    } catch (err) {
      document.getElementById("notice").innerHTML = `<div class="notice">${esc(friendlyError(err))}</div>`;
      return;
    }
    if (limited) {
      const n = document.getElementById("notice");
      if (n && !n.innerHTML) n.innerHTML = `<div class="notice">Nachrichten konnten nicht vollständig geladen werden. Einige Funktionen sind eingeschränkt.</div>`;
    }
    try { subscribeInbox(); } catch { /* Live-Kanal optional */ }
    for (const m of messages) {
      if (!m.deleted_at && !String(m.body || "").trim() && Date.now() - new Date(m.created_at).getTime() < 120000) watchAttachments(m.id);
    }
    const params = new URLSearchParams(location.search);
    const target = params.get("an");
    if (target && target !== v.me.id) {
      await open(target);
      await prefillListingReply(params.get("anzeige"));
    } else renderList();
  }
  // Von „Gesuche & Angebote“ kommend (?anzeige=ID): Antwort mit Bezug zur Anzeige vorbereiten
  async function prefillListingReply(rawId) {
    if (!/^\d+$/.test(rawId || "")) return;
    try {
      const { data: l } = await sb.from("listings").select("id, title, type").eq("id", Number(rawId)).maybeSingle();
      const ta = document.querySelector("#thread-form textarea");
      if (!l || !ta || ta.value.trim()) return;
      const kind = l.type === "suche" ? "Gesuch" : "Angebot";
      ta.value = `Hallo! Ich melde mich auf dein ${kind} „${l.title}“: https://xyntal.de/boerse#anzeige-${l.id}\n\n`;
      draft = ta.value;
      grow(ta);
      syncSendButton();
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    } catch { /* ohne Bezug weiterschreiben */ }
    history.replaceState(null, "", `nachrichten?an=${encodeURIComponent(active)}`);
  }

  // ---------- Chat-Hintergrund: Muster wählen (nur in diesem Browser gemerkt) ----------
  function bgPickerHtml() {
    return `<div class="bg-picker">
      <button type="button" class="msg-icon bg-btn" id="bg-btn" aria-label="Chat-Hintergrund ändern" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1.2-1.8-1.2-3.2 0-1.2 1-1.8 2.2-1.8H17a4 4 0 0 0 4-4c0-4-4-7-9-7z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10" cy="7" r="1.2"/><circle cx="15" cy="7" r="1.2"/></svg></button>
      <div class="bg-menu" id="bg-menu" role="menu" aria-label="Chat-Hintergrund" hidden>
        ${CHAT_BGS.map(([key, label]) => `<button type="button" role="menuitemradio" class="bg-option" data-bg-option="${key}" aria-checked="${key === chatBg}"><span class="bg-swatch bg-swatch-${key}" aria-hidden="true"></span><span>${label}</span></button>`).join("")}
      </div>
    </div>`;
  }
  function applyChatBg() { const ib = document.getElementById("inbox"); if (ib) ib.dataset.chatBg = chatBg; }
  applyChatBg();
  document.addEventListener("click", (e) => {
    const menu = document.getElementById("bg-menu");
    const btn = e.target.closest?.("#bg-btn");
    const opt = e.target.closest?.("[data-bg-option]");
    if (btn && menu) {
      menu.hidden = !menu.hidden;
      btn.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) menu.querySelector('[aria-checked="true"]')?.focus();
      return;
    }
    if (opt) {
      chatBg = opt.dataset.bgOption;
      try { localStorage.setItem(BG_KEY, chatBg); } catch { /* nur für diese Sitzung */ }
      applyChatBg();
      menu?.querySelectorAll("[data-bg-option]").forEach((b) => b.setAttribute("aria-checked", String(b === opt)));
    }
    if (menu && !menu.hidden && (opt || !e.target.closest?.("#bg-menu"))) {
      menu.hidden = true;
      document.getElementById("bg-btn")?.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    const menu = document.getElementById("bg-menu");
    if (e.key === "Escape" && menu && !menu.hidden) { menu.hidden = true; document.getElementById("bg-btn")?.focus(); }
  });

  boot().catch((err) => {
    const n = document.getElementById("notice");
    if (n && !n.innerHTML) n.innerHTML = `<div class="notice">${esc(friendlyError(err))}</div>`;
  });
})();
