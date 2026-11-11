// /admin – Support: die Ticket-Warteschlange als eigenes Modul.
//
// Aufbau (bewusst ohne Build-Schritt, die Seite wird statisch ausgeliefert):
//   1. Modell   – reine Funktionen (Zustand eines Tickets, Ansichten, Suche, Sortierung, Zahlen).
//                 Ohne DOM, deshalb in tests/admin-support.cjs prüfbar.
//   2. Speicher – ein Zustandsobjekt; jede Änderung läuft über set() und zeichnet nur die
//                 betroffenen Teile neu (Reiter, Liste, Ticket). Der Entwurf im Antwortfeld
//                 überlebt jedes Neuzeichnen und jede Hintergrund-Aktualisierung.
//   3. Ansicht  – Liste links, Gespräch rechts; die Warteschlange lädt sich alle 20 s neu,
//                 solange der Bereich sichtbar ist.
//
// Der Status wird nicht von Hand gesetzt, er folgt dem Ticket (Server: support/routes.ts):
//   Offen        – niemand hat es übernommen
//   In Arbeit    – es ist jemandem zugewiesen
//   Geschlossen  – es ist geschlossen
(() => {
  // ---------- 1. Modell ----------
  const STATES = { open: "Offen", work: "In Arbeit", closed: "Geschlossen" };
  const PRIO = { Low: "Niedrig", Normal: "Normal", High: "Hoch", Urgent: "Dringend" };
  const PRIO_RANK = { Urgent: 0, High: 1, Normal: 2, Low: 3 };
  const VIEWS = [["active", "Alle aktiven"], ["open", "Offen"], ["work", "In Arbeit"], ["mine", "Meine"], ["closed", "Geschlossen"]];

  // Aus Zuweisung und „Geschlossen“ abgeleitet – stimmt damit auch für Tickets, die noch
  // einen alten Status (Wartet, Gelöst) tragen.
  const stateOf = (t) => (t.status === "Closed" ? "closed" : t.assigneeId ? "work" : "open");
  const inView = (t, view, meId) => {
    const s = stateOf(t);
    if (view === "closed") return s === "closed";
    if (s === "closed") return false;
    if (view === "mine") return t.assigneeId === meId;
    return view === "active" || view === s;
  };
  const matches = (t, query) => {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return [t.subject, t.requester, t.requesterEmail, t.category, t.assignee, t.preview, PRIO[t.priority]]
      .some((v) => String(v || "").toLowerCase().includes(q));
  };
  // Oben steht, was eine Antwort braucht; darunter nach Priorität, dann das Neueste zuerst.
  const sortQueue = (list) => [...list].sort((a, b) =>
    (stateOf(a) === "closed" || stateOf(b) === "closed" ? 0 : Number(!!b.needsReply) - Number(!!a.needsReply))
    || (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2)
    || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const visible = (tickets, view, query, meId) => sortQueue(tickets.filter((t) => inView(t, view, meId) && matches(t, query)));
  // Zahlen für die Reiter: vom Server (`counts`), sonst aus der geladenen Liste gezählt.
  const countsOf = (active, meId, server) => {
    const n = (view) => active.filter((t) => inView(t, view, meId)).length;
    return { active: n("active"), open: n("open"), work: n("work"), mine: n("mine"), closed: server && Number.isFinite(server.closed) ? server.closed : null };
  };
  // Woran man erkennt, dass sich ein geöffnetes Ticket geändert hat (für die Hintergrund-Aktualisierung).
  const signature = (d) => (d ? [d.ticket.status, d.ticket.assigneeId || "", d.ticket.priority, d.ticket.threadAccessActive ? 1 : 0, d.messages.length, (d.messages[d.messages.length - 1] || {}).id || ""].join("|") : "");

  const model = { STATES, PRIO, VIEWS, stateOf, inView, matches, sortQueue, visible, countsOf, signature };
  if (typeof window === "undefined") return;
  window.XyntalAdminSupport = model;

  const X = window.XyntalApp, P = window.XyntalAdminPlatform;
  if (!X || !P || typeof P.register !== "function") return;
  const { esc } = X;
  const POLL_MS = 20000;

  // ---------- 2. Speicher ----------
  const S = {
    view: "active", query: "",
    active: [], closed: [], counts: null, loaded: false, error: "",
    openId: "", detail: null, detailError: "", detailLoading: false,
    drafts: {}, mode: "reply", busy: false,
  };
  let root = null, timer = 0, toastTimer = 0;
  const meId = () => (P.me() || {}).id || "";
  const source = () => (S.view === "closed" ? S.closed : S.active);
  const shown = () => visible(source(), S.view, S.query, meId());

  // ---------- Hilfen ----------
  const fmt = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); };
  function ago(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 60000) return "gerade eben";
    const m = Math.floor(ms / 60000); if (m < 60) return `vor ${m} Min.`;
    const h = Math.floor(m / 60); if (h < 24) return `vor ${h} Std.`;
    const d = Math.floor(h / 24); return d < 30 ? `vor ${d} T.` : fmt(iso);
  }
  const initials = (name) => (String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  const bytes = (n) => { n = Number(n || 0); return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`; };
  const statePill = (t) => { const s = stateOf(t); return `<span class="xs-state xs-state-${s}">${esc(STATES[s])}</span>`; };
  const $ = (sel) => root.querySelector(sel);

  function toast(text, ok = true) {
    const el = $("[data-toast]"); if (!el) return;
    el.textContent = text; el.classList.toggle("is-error", !ok); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ok ? 2600 : 6000);
  }

  // ---------- Laden ----------
  async function loadQueue({ quiet = false } = {}) {
    try {
      const jobs = [P.api("GET", "/admin/support/tickets")];
      if (S.view === "closed") jobs.push(P.api("GET", "/admin/support/tickets?archived=1"));
      const [a, c] = await Promise.all(jobs);
      S.active = a.tickets || []; S.counts = a.counts || null;
      if (c) S.closed = c.tickets || [];
      S.loaded = true; S.error = "";
    } catch (err) { if (!quiet || !S.loaded) S.error = P.reason(err); }
    renderTabs(); renderList();
  }
  async function loadDetail(id, { quiet = false } = {}) {
    if (!quiet) { S.detailLoading = true; S.detailError = ""; renderDetail(); }
    try {
      const d = await P.api("GET", `/support/tickets/${encodeURIComponent(id)}`);
      if (S.openId !== id) return;
      const changed = signature(d) !== signature(S.detail) || !S.detail || S.detail.ticket.id !== id;
      S.detail = d; S.detailLoading = false; S.detailError = "";
      if (changed || !quiet) renderDetail({ toEnd: changed });
    } catch (err) {
      if (S.openId !== id || quiet) return;
      S.detail = null; S.detailLoading = false; S.detailError = P.reason(err); renderDetail();
    }
  }
  async function refresh({ quiet = true } = {}) {
    await Promise.all([loadQueue({ quiet }), S.openId ? loadDetail(S.openId, { quiet: true }) : null]);
    P.refreshCounts();
  }
  function select(id) {
    S.openId = id; S.detail = null; S.mode = "reply";
    root.classList.toggle("has-open", !!id);
    renderList();
    if (id) loadDetail(id); else renderDetail();
  }

  // ---------- 3. Ansicht ----------
  function mount(panel) {
    root = panel;
    root.classList.add("xs");
    root.innerHTML = `
      <div class="xs-top">
        <div><p class="admin-kicker">SUPPORT</p><h2>Support</h2></div>
        <label class="xs-search"><span class="sr-only">Tickets durchsuchen</span><input type="search" data-search placeholder="Betreff, Person, E-Mail …" autocomplete="off"></label>
      </div>
      <div class="xs-tabs" role="tablist" aria-label="Ansicht" data-tabs></div>
      <div class="xs-split">
        <section class="xs-list" aria-label="Tickets" data-list></section>
        <section class="xs-pane" aria-label="Ticket" data-detail></section>
      </div>
      <p class="xs-toast" role="status" aria-live="polite" data-toast hidden></p>`;
    $("[data-search]").addEventListener("input", (e) => { S.query = e.target.value; renderList(); });
    $("[data-tabs]").addEventListener("click", (e) => {
      const b = e.target.closest("[data-view]"); if (!b || b.dataset.view === S.view) return;
      S.view = b.dataset.view; renderTabs(); renderList();
      if (S.view === "closed") loadQueue();
    });
    $("[data-list]").addEventListener("click", (e) => { const b = e.target.closest("[data-id]"); if (b) select(b.dataset.id); });
    const pane = $("[data-detail]");
    pane.addEventListener("click", onClick);
    pane.addEventListener("change", onChange);
    pane.addEventListener("submit", onSubmit);
    pane.addEventListener("input", (e) => { if (e.target.matches("[data-body]") && S.openId) { S.drafts[S.openId] = e.target.value; syncSend(); } });
    pane.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && e.target.matches("[data-body]")) { e.preventDefault(); send(false); }
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !root.hidden && S.loaded) refresh(); });
    timer = setInterval(() => { if (!document.hidden && !root.hidden && !S.busy) refresh(); }, POLL_MS);
    renderTabs(); renderList(); renderDetail();
  }

  function renderTabs() {
    const c = countsOf(S.active, meId(), S.counts);
    $("[data-tabs]").innerHTML = VIEWS.map(([key, label]) =>
      `<button role="tab" data-view="${key}" aria-selected="${S.view === key}">${esc(label)}${c[key] === null || !S.loaded ? "" : ` <em>${c[key]}</em>`}</button>`).join("");
  }

  function renderList() {
    const box = $("[data-list]");
    if (!S.loaded) { box.innerHTML = S.error ? `<p class="xs-empty">${esc(S.error)}</p>` : `<p class="xs-empty" role="status">Tickets werden geladen …</p>`; return; }
    const list = shown();
    if (!list.length) {
      box.innerHTML = `<p class="xs-empty">${esc(S.query.trim() ? "Kein Ticket passt zur Suche." : S.view === "closed" ? "Noch keine geschlossenen Tickets." : S.view === "mine" ? "Dir ist gerade kein Ticket zugewiesen." : S.view === "work" ? "Gerade ist kein Ticket in Arbeit." : "Alles erledigt – keine offenen Tickets.")}</p>`;
      return;
    }
    box.innerHTML = `<ul>${list.map((t) => {
      const s = stateOf(t), hot = t.priority === "Urgent" || t.priority === "High";
      return `<li><button type="button" data-id="${esc(t.id)}" aria-current="${S.openId === t.id}" class="xs-row xs-row-${s}${t.needsReply && s !== "closed" ? " needs-reply" : ""}">
        <span class="xs-row-top"><b>${esc(t.subject || "(ohne Betreff)")}</b><time>${esc(ago(t.updatedAt))}</time></span>
        <span class="xs-row-who">${esc(t.requester || "Unbekannt")}${t.category ? ` · ${esc(t.category)}` : ""}</span>
        ${t.preview ? `<span class="xs-row-preview">${t.lastFromStaff ? "↩ " : ""}${esc(t.preview)}</span>` : ""}
        <span class="xs-row-meta">${statePill(t)}${hot ? `<span class="xs-prio xs-prio-${t.priority.toLowerCase()}">${esc(PRIO[t.priority])}</span>` : ""}${t.category === "Crash" ? `<span class="xs-prio xs-prio-urgent">Absturz</span>` : ""}${t.needsReply && s !== "closed" ? `<span class="xs-flag">Antwort nötig</span>` : ""}${t.attachmentCount ? `<span class="xs-count">${Number(t.attachmentCount)} Anhang${t.attachmentCount > 1 ? "e" : ""}</span>` : ""}<span class="xs-row-owner">${t.assignee ? `<i class="xs-av" aria-hidden="true">${esc(initials(t.assignee))}</i>${esc(t.assignee)}` : ""}</span></span>
      </button></li>`;
    }).join("")}</ul>`;
  }

  function renderDetail({ toEnd = true } = {}) {
    const box = $("[data-detail]");
    if (!S.openId) { box.innerHTML = `<div class="xs-blank"><b>Kein Ticket ausgewählt</b><p>Wähle links ein Ticket. Wer antwortet, übernimmt es – damit ist es „In Arbeit“.</p></div>`; return; }
    if (S.detailError) { box.innerHTML = `<div class="xs-blank"><button type="button" class="xs-back" data-act="back">← Tickets</button><p>${esc(S.detailError)}</p></div>`; return; }
    if (!S.detail) { box.innerHTML = `<div class="xs-blank" role="status"><p>Ticket wird geladen …</p></div>`; return; }
    const prev = box.querySelector("[data-body]");
    const keep = prev && document.activeElement === prev ? [prev.selectionStart, prev.selectionEnd] : null;
    const thread = box.querySelector("[data-thread]");
    const scrollTop = thread ? thread.scrollTop : 0;

    const { ticket: t, messages } = S.detail, s = stateOf(t), mine = t.assigneeId === meId(), closed = s === "closed";
    const diag = Object.entries(t.diagnostics || {}).filter(([, v]) => v !== null && typeof v !== "object" && String(v) !== "");
    const files = t.attachments || [];
    box.innerHTML = `<article class="xs-detail">
      <header class="xs-head">
        <button type="button" class="xs-back" data-act="back">← Tickets</button>
        <div class="xs-title"><h3>${esc(t.subject || "(ohne Betreff)")}</h3>
          <p>${esc(t.requester || "Unbekannt")}${t.requesterEmail ? ` · <a href="mailto:${esc(t.requesterEmail)}">${esc(t.requesterEmail)}</a>` : ""}${t.category ? ` · ${esc(t.category)}` : ""} · erstellt ${esc(fmt(t.createdAt))}</p></div>
        ${statePill(t)}
      </header>
      <div class="xs-bar">
        <div class="xs-owner">${t.assignee ? `<i class="xs-av" aria-hidden="true">${esc(initials(t.assignee))}</i>` : `<i class="xs-av xs-av-none" aria-hidden="true">?</i>`}<span><small>Zuständig</small><b>${t.assignee ? esc(t.assignee) + (mine ? " (du)" : "") : "Niemand"}</b></span></div>
        ${closed ? "" : mine ? `<button type="button" data-act="release">Abgeben</button>` : `<button type="button" data-act="take" class="${t.assignee ? "" : "xs-primary"}">${t.assignee ? "Selbst übernehmen" : "Übernehmen"}</button>`}
        <label class="xs-select"><small>Priorität</small><select data-priority>${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${t.priority === k ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <span class="xs-grow"></span>
        ${closed ? `<button type="button" data-act="reopen" class="xs-primary">Wieder öffnen</button>` : `<button type="button" data-act="close">Schließen</button>`}
      </div>
      ${t.conversationId ? `<p class="xs-note">Verknüpftes Gespräch: <b>${esc(t.conversationTitle || t.conversationId)}</b> – ${t.threadAccessActive ? `vom Mitglied geteilt; jeder Aufruf steht im Audit-Log. <button type="button" data-act="thread">Gespräch öffnen</button>` : "nicht mehr geteilt (zurückgezogen oder Ticket geschlossen)."}${!t.threadAccessActive && P.can("emergency_message_access") ? ` <button type="button" data-act="emergency">Notfallzugriff …</button>` : ""}</p>` : ""}
      ${diag.length || files.length ? `<details class="xs-diag"><summary>Diagnose${files.length ? ` · ${files.length} Anhang${files.length > 1 ? "e" : ""}` : ""}</summary>
        ${diag.length ? `<dl>${diag.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
        ${files.length ? `<ul>${files.map((f) => `<li><button type="button" data-file="${esc(f.id)}" data-name="${esc(f.name || "anhang")}">${esc(f.name || f.kind || "Anhang")}</button> <small>${esc(bytes(f.size))}</small></li>`).join("")}</ul>` : ""}</details>` : ""}
      <ol class="xs-thread" data-thread>${messages.length ? messages.map((m) => `<li class="${m.isInternal ? "is-note" : m.isStaff ? "is-staff" : "is-user"}">
        <div class="xs-msg-head"><b>${esc(m.author || "?")}</b>${m.isInternal ? `<span class="xs-tag xs-tag-note">Interne Notiz</span>` : m.isStaff ? `<span class="xs-tag">Team</span>` : ""}<time>${esc(fmt(m.createdAt))}</time></div>
        <p>${esc(m.body)}</p></li>`).join("") : `<li class="xs-thread-empty">Noch keine Nachrichten in diesem Ticket.</li>`}</ol>
      ${closed ? `<p class="xs-closed">Dieses Ticket ist geschlossen. Zum Antworten wieder öffnen.</p>` : `<form class="xs-compose${S.mode === "note" ? " is-note" : ""}" data-compose>
        <div class="xs-mode" role="group" aria-label="Art der Nachricht"><button type="button" data-mode="reply" aria-pressed="${S.mode === "reply"}">Antwort</button><button type="button" data-mode="note" aria-pressed="${S.mode === "note"}">Interne Notiz</button></div>
        <textarea data-body maxlength="8000" rows="3" aria-label="${S.mode === "note" ? "Interne Notiz" : "Antwort"}" placeholder="${S.mode === "note" ? "Nur für das Team sichtbar …" : `Antwort an ${esc(t.requester || "die Person")} …`}"></textarea>
        <div class="xs-send"><small>${S.mode === "note" ? "Die Person sieht interne Notizen nie." : t.assignee ? "Strg/⌘ + Enter sendet." : "Antworten übernimmt das Ticket für dich."}</small>
          ${S.mode === "reply" ? `<button type="button" data-act="send-close" data-needs-text>Senden &amp; schließen</button>` : ""}
          <button class="xs-primary" data-needs-text>${S.mode === "note" ? "Notiz speichern" : "Antworten"}</button></div>
      </form>`}
    </article>`;
    const area = box.querySelector("[data-body]");
    if (area) {
      area.value = S.drafts[t.id] || "";
      if (keep) { area.focus(); area.setSelectionRange(keep[0], keep[1]); }
    }
    syncSend();
    const next = box.querySelector("[data-thread]");
    if (next) next.scrollTop = toEnd ? next.scrollHeight : scrollTop;
  }
  function syncSend() {
    const has = !!(S.drafts[S.openId] || "").trim();
    root.querySelectorAll("[data-needs-text]").forEach((b) => { b.disabled = !has || S.busy; });
  }

  // ---------- Aktionen ----------
  async function act(label, fn) {
    if (S.busy) return false;
    S.busy = true; syncSend();
    try { await fn(); S.busy = false; await refresh({ quiet: false }); toast(label); return true; }
    catch (err) { S.busy = false; syncSend(); toast(P.reason(err), false); return false; }
  }
  const path = (rest) => `/support/tickets/${encodeURIComponent(S.openId)}${rest}`;
  async function send(andClose) {
    const id = S.openId, body = (S.drafts[id] || "").trim(), note = S.mode === "note";
    if (!id || !body) return;
    const done = await act(note ? "Interne Notiz gespeichert." : andClose ? "Antwort gesendet, Ticket geschlossen." : "Antwort gesendet.", async () => {
      await P.api("POST", path("/messages"), { body, internal: note });
      delete S.drafts[id];
      if (andClose && !note) await P.api("POST", path("/status"), { status: "Closed" });
    });
    if (done && S.openId === id) renderDetail();
  }
  async function download(id, name) {
    try {
      const { token } = await X.session();
      const res = await fetch(`${X.API}${path(`/attachments/${encodeURIComponent(id)}`)}`, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Der Anhang konnte nicht geladen werden.");
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) { toast(err.message || P.reason(err), false); }
  }
  function onClick(e) {
    const mode = e.target.closest("[data-mode]");
    if (mode) { S.mode = mode.dataset.mode; renderDetail({ toEnd: false }); const a = $("[data-body]"); if (a) a.focus(); return; }
    const file = e.target.closest("[data-file]");
    if (file) return download(file.dataset.file, file.dataset.name);
    const b = e.target.closest("[data-act]"); if (!b) return;
    const t = S.detail && S.detail.ticket;
    switch (b.dataset.act) {
      case "back": return select("");
      case "take": return act("Ticket übernommen – jetzt in Arbeit.", () => P.api("POST", path("/assign"), { assigneeId: "me" }));
      case "release": return act("Ticket abgegeben – wieder offen.", () => P.api("POST", path("/assign"), { assigneeId: "" }));
      case "close": return act("Ticket geschlossen.", () => P.api("POST", path("/status"), { status: "Closed" }));
      case "reopen": return act("Ticket wieder geöffnet.", () => P.api("POST", path("/status"), { status: "Open" }));
      case "send-close": return send(true);
      case "thread": return t && P.openThread(t.conversationId);
      case "emergency": return t && P.emergencyAccess(t.conversationId, () => loadDetail(t.id), toast);
      default: return undefined;
    }
  }
  function onChange(e) {
    if (!e.target.matches("[data-priority]")) return;
    const value = e.target.value;
    act(`Priorität: ${PRIO[value] || value}.`, () => P.api("POST", path("/priority"), { priority: value }));
  }
  function onSubmit(e) { if (e.target.matches("[data-compose]")) { e.preventDefault(); send(false); } }

  P.register("support", async () => {
    const panel = document.querySelector('[data-panel="support"]');
    if (!panel) return;
    if (!root) mount(panel);
    await refresh({ quiet: false });
  });
  window.addEventListener("pagehide", () => clearInterval(timer));
})();
