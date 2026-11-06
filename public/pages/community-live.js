// Community-Seite: die offizielle Xyntal-Community aus der App, live und nur lesend.
// Quelle ist GET /public/community auf dem App-Server (api.xyntal.de, ohne Konto):
// nur die Kanäle, in denen ausschließlich das Team schreibt (#updates, #roadmap,
// #polls), nur Beiträge des Teams. Jedes App-Update landet dort automatisch in
// #updates (server/src/communities/releaseNotes.ts in xyntal-app-windows).
// Der Echtzeit-Kanal des App-Servers braucht ein Konto, deshalb fragt die Seite
// alle 30 Sekunden nach, solange der Tab sichtbar ist. Der Server antwortet mit
// ETag, unveränderte Stände kosten nur ein 304.
// Eigener Gültigkeitsbereich: community.js liegt im selben globalen Scope.
(() => {
  const API = (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const REFRESH_MS = 30 * 1000;
  const RETRY_MS = 60 * 1000;
  const FIRST_PAGE = 5;

  const root = document.getElementById("app-community");
  if (!root) return;
  const feedEl = document.getElementById("live-feed");
  const filterEl = document.getElementById("live-filter");
  const moreBtn = document.getElementById("live-more");
  const stateEl = document.getElementById("live-state");
  const stateText = document.getElementById("live-state-text");

  const escape = typeof esc === "function" ? esc : (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ago = typeof timeAgo === "function" ? timeAgo : (ts) => new Date(ts).toLocaleDateString();
  const linkify = (s) => escape(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>');

  let data = null;        // letzte gute Antwort
  let lastJson = "";
  let channel = "";       // "" = alle
  let expanded = false;
  let seen = new Set();   // Beitrags-IDs, die schon zu sehen waren
  let timer = 0;
  let lastLoad = 0;
  let loading = false;

  function setState(kind, text, title = "") {
    stateEl.dataset.state = kind;
    stateText.textContent = text;
    if (title) stateEl.title = title; else stateEl.removeAttribute("title");
  }

  // Beitragstext: Absätze nach Leerzeilen; Blöcke aus „• “-Zeilen werden Listen,
  // eine kurze Zeile direkt davor ihre Überschrift (so sehen die Update-Übersichten aus).
  function bodyHtml(text) {
    const blocks = String(text || "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.split("\n").filter((l) => l.trim() !== "")).filter((b) => b.length);
    return blocks.map((lines, i) => {
      const bullet = (l) => /^\s*[•\-–]\s+/.test(l);
      const items = lines.filter(bullet);
      if (items.length && items.length >= lines.length - 1 && lines.slice(1).every(bullet)) {
        const head = bullet(lines[0]) ? "" : `<p class="live-sub">${linkify(lines[0])}</p>`;
        const list = (bullet(lines[0]) ? lines : lines.slice(1)).map((l) => `<li>${linkify(l.replace(/^\s*[•\-–]\s+/, ""))}</li>`).join("");
        return `${head}<ul>${list}</ul>`;
      }
      const html = lines.map(linkify).join("<br>");
      return i === 0 && blocks.length > 1 && lines.length === 1 && lines[0].length <= 90 ? `<p class="live-lead">${html}</p>` : `<p>${html}</p>`;
    }).join("");
  }

  function pollHtml(poll) {
    const total = poll.totalVotes || 0;
    const max = Math.max(0, ...poll.options.map((o) => o.votes));
    const rows = poll.options.map((o) => {
      const pct = total ? Math.round((o.votes / total) * 100) : 0;
      return `<li class="${total && o.votes === max ? "is-top" : ""}">
          <span class="live-poll-label" data-no-i18n>${escape(o.label)}</span>
          <span class="live-poll-pct">${pct} %</span>
          <span class="live-poll-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </li>`;
    }).join("");
    return `<div class="live-poll">
        <p class="live-poll-q" data-no-i18n>${escape(poll.question)}</p>
        <ul>${rows}</ul>
        <p class="live-poll-meta"><span>${total === 1 ? "1 Stimme" : `${total} Stimmen`}</span><span>${poll.closed ? "Abstimmung beendet" : "Abstimmen in der App"}</span></p>
      </div>`;
  }

  function avatarHtml() {
    const logo = data && data.community && data.community.avatar;
    if (typeof logo === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(logo)) {
      return `<img class="live-avatar" src="${logo}" alt="" width="40" height="40">`;
    }
    return `<span class="live-avatar live-avatar-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3Q15.41 8.59 21 21" fill="none" stroke="#3FE0F0" stroke-width="3.6" stroke-linecap="round"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="#B36BFF" stroke-width="3.6" stroke-linecap="round"/></svg></span>`;
  }

  function postHtml(p) {
    const fresh = seen.size > 0 && !seen.has(p.id);
    const when = new Date(p.createdAt);
    const reactions = (p.reactions || []).map((r) => `<span class="live-react" aria-label="${escape(r.emoji)} ${r.count}">${escape(r.emoji)} ${r.count}</span>`).join("");
    const files = p.attachmentCount > 0 ? `<span class="live-files">${p.attachmentCount === 1 ? "1 Anhang in der App" : `${p.attachmentCount} Anhänge in der App`}</span>` : "";
    return `
      <article class="live-post${fresh ? " is-new" : ""}" data-id="${escape(p.id)}">
        <div class="live-post-head">
          ${avatarHtml()}
          <div class="live-post-meta">
            <strong data-no-i18n>${escape(p.author)}</strong>
            <span>Xyntal-Team</span>
          </div>
          <span class="live-channel" data-no-i18n>#${escape(p.channel)}</span>
        </div>
        <div class="live-post-body" data-no-i18n>${bodyHtml(p.body)}</div>
        ${p.poll ? pollHtml(p.poll) : ""}
        <div class="live-post-foot">
          <time datetime="${escape(p.createdAt)}" title="${escape(isNaN(when) ? "" : when.toLocaleString(document.documentElement.lang === "en" ? "en-GB" : "de-DE"))}">${escape(ago(p.createdAt))}</time>
          ${reactions || files ? `<div class="live-post-extra">${reactions}${files}</div>` : ""}
        </div>
      </article>`;
  }

  function renderFilter() {
    const names = (data && data.channels) || [];
    if (names.length < 2) { filterEl.hidden = true; return; }
    filterEl.hidden = false;
    const tab = (value, label, noI18n) => `<button type="button" role="tab" data-channel="${escape(value)}" aria-selected="${channel === value}"${noI18n ? " data-no-i18n" : ""}>${escape(label)}</button>`;
    filterEl.innerHTML = tab("", "Alle", false) + names.map((n) => tab(n, `#${n}`, true)).join("");
  }

  function render() {
    feedEl.removeAttribute("aria-busy");
    renderFilter();
    const list = ((data && data.posts) || []).filter((p) => !channel || p.channel === channel);
    if (!list.length) {
      feedEl.innerHTML = `<p class="live-empty">${channel ? "In diesem Kanal gibt es noch keine Beiträge." : "Noch keine Neuigkeiten aus der App."}</p>`;
      moreBtn.hidden = true;
    } else {
      const shown = expanded ? list : list.slice(0, FIRST_PAGE);
      feedEl.innerHTML = shown.map(postHtml).join("");
      moreBtn.hidden = expanded || list.length <= FIRST_PAGE;
    }
    for (const p of (data && data.posts) || []) seen.add(p.id);
  }

  function renderError() {
    feedEl.removeAttribute("aria-busy");
    feedEl.innerHTML = `<div class="live-error"><p>Die Neuigkeiten aus der App lassen sich gerade nicht laden.</p><button type="button" class="live-retry">Erneut versuchen</button></div>`;
    moreBtn.hidden = true;
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (document.visibilityState === "visible") timer = setTimeout(load, ms);
  }

  async function load() {
    if (loading) return;
    loading = true;
    try {
      // no-cache: der Browser fragt mit dem ETag nach, ein 304 liefert den gespeicherten Stand.
      // lang: Update-Übersichten in #updates kommen in der Sprache der Seite.
      const lang = document.documentElement.lang === "en" ? "en" : "de";
      const res = await fetch(`${API}/public/community?limit=30&lang=${lang}`, { cache: "no-cache", headers: { accept: "application/json" } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json || !json.data) throw new Error(`HTTP ${res.status}`);
      lastLoad = Date.now();
      const text = JSON.stringify(json.data);
      if (text !== lastJson) {
        lastJson = text;
        data = json.data;
        if (channel && !(data.channels || []).includes(channel)) channel = "";
        render();
      }
      const time = new Date().toLocaleTimeString(document.documentElement.lang === "en" ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" });
      setState("live", "Live", `Zuletzt aktualisiert: ${time}`);
      schedule(REFRESH_MS);
    } catch {
      if (data) setState("error", "Verbindung unterbrochen");
      else { setState("error", "Nicht erreichbar"); renderError(); }
      schedule(RETRY_MS);
    } finally {
      loading = false;
    }
  }

  filterEl.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-channel]");
    if (!btn) return;
    channel = btn.dataset.channel;
    expanded = false;
    render();
  });
  moreBtn.addEventListener("click", () => { expanded = true; render(); });
  feedEl.addEventListener("click", (e) => {
    if (!e.target.closest(".live-retry")) return;
    feedEl.innerHTML = '<p class="live-empty">Lade Neuigkeiten …</p>';
    setState("loading", "Verbinde …");
    load();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") { clearTimeout(timer); return; }
    if (Date.now() - lastLoad >= REFRESH_MS) load(); else schedule(REFRESH_MS - (Date.now() - lastLoad));
  });
  // Sprachwechsel: sofort in der neuen Sprache nachladen.
  document.addEventListener("xyntal:lang", () => { clearTimeout(timer); load(); });
  // Zeitangaben („vor 3 Min.“) und neue Beiträge auch ohne Änderung frisch halten.
  setInterval(() => { if (data && document.visibilityState === "visible") render(); }, 60 * 1000);

  load();
})();
