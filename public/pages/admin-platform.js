// /admin – Plattform: derselbe Admin-Bereich wie in der Xyntal-App, über den App-Server
// (app-api.js, api.xyntal.de). Jeder Bereich spricht genau die Routen, die auch die
// Desktop-App nutzt (server/src/admin/*); die Rechte prüft ausschließlich der Server –
// die Seitenleiste blendet nur aus, was die eigene Staff-Rolle ohnehin nicht darf.
// Die Website-Bereiche (Warteliste, Karten, Beta) bleiben in admin.js.
(() => {
  const X = window.XyntalApp;
  if (!X) return;
  const { esc } = X;
  const api = (method, path, body) => X.api(method, path, body);
  const $ = (sel, root = document) => root.querySelector(sel);
  const panel = (key) => document.querySelector(`[data-panel="${key}"]`);
  const q = (params) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "";
  };

  const S = {
    me: null, role: null, matrix: {}, staff: false,
    stats: null, flags: [],
    users: { detail: null, box: null, onChange: null, notify: null },
    workspaces: { list: [], members: new Map(), open: "" },
    projects: [], conversations: [],
    reports: { status: "open", list: [] },
    access: { scope: "active", grants: [] },
    audit: { action: "", query: "", entries: [] },
    announcements: [],
    console: { lines: [], history: [], pos: -1, pending: null, pendingText: "", suggestions: [], selected: -1, seq: 0, userIds: {} },
  };

  // ---------- Hilfen ----------
  const ROLE_LABEL = { owner: "Inhaber", admin: "Admin", moderator: "Moderator", support: "Support", analyst: "Analyst" };
  const roleLabel = (r) => (r ? ROLE_LABEL[r] || r : "Mitglied");
  const can = (perm) => !perm || (S.role && Array.isArray(S.matrix[S.role]) && S.matrix[S.role].includes(perm));
  const num = (n) => Number(n || 0).toLocaleString("de-DE");
  const fmt = (iso) => { if (!iso) return "–"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); };
  const day = (iso) => { if (!iso) return "–"; const d = new Date(iso); return Number.isNaN(d.getTime()) ? "–" : d.toLocaleDateString("de-DE", { dateStyle: "medium" }); };
  const stamp = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }); };
  function ago(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 60000) return "gerade eben";
    const m = Math.floor(ms / 60000); if (m < 60) return `vor ${m} Min.`;
    const h = Math.floor(m / 60); if (h < 24) return `vor ${h} Std.`;
    return `vor ${Math.floor(h / 24)} T.`;
  }
  function bytes(n) {
    n = Number(n || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
    return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  function duration(seconds) {
    seconds = Number(seconds || 0);
    const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
    return d ? `${d} T. ${h} Std.` : h ? `${h} Std. ${m} Min.` : `${m} Min.`;
  }
  const initials = (name) => (String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("") || "?").toUpperCase();
  const pill = (text, tone = "") => `<span class="xa-pill ${tone ? `xa-pill-${tone}` : ""}">${esc(text)}</span>`;
  const empty = (text) => `<p class="xa-empty">${esc(text)}</p>`;
  const loading = (text = "Wird geladen …") => `<p class="xa-loading" role="status">${esc(text)}</p>`;
  const head = (kicker, title, text, actions = "") => `
    <div class="panel-heading"><div><p class="admin-kicker">${esc(kicker)}</p><h2>${esc(title)}</h2>${text ? `<p class="hint">${esc(text)}</p>` : ""}</div>${actions ? `<div class="row-actions">${actions}</div>` : ""}</div>`;
  const stat = (label, value, hint = "", tone = "") => `<article class="xa-stat ${tone ? `xa-stat-${tone}` : ""}"><b>${esc(value)}</b><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ""}</article>`;
  const table = (cols, rows) => `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;

  function reason(err) {
    if (!err) return "Das hat nicht geklappt.";
    if (err.code === "SIGNED_OUT" || err.code === "TWOFA_CANCELLED") return "Bitte logg dich ein.";
    if (err.status === 403) return "Deine Rolle erlaubt das nicht.";
    if (err.code === "NETWORK") return "Der App-Server ist gerade nicht erreichbar.";
    return err.message || "Das hat nicht geklappt.";
  }
  // Statuszeile oben im Bereich (Ergebnis einer Aktion)
  function say(key, text, ok = true) {
    const p = panel(key); if (!p) return;
    let line = p.querySelector("[data-xa-message]");
    if (!line) { line = document.createElement("p"); line.className = "admin-message"; line.dataset.xaMessage = "1"; line.setAttribute("role", "status"); p.prepend(line); }
    line.classList.toggle("is-error", !ok);
    line.textContent = text;
  }

  // Strafkatalog (xyntal.de/community-richtlinien#strafkatalog): Grad und Regel einer Verwarnung.
  // Der App-Server zählt die Punkte und sperrt ab 3 / 6 / 9 Punkten von selbst (admin/strikes.ts).
  const RULES = ["Respekt", "Kein Spam", "Sei echt", "Ideen sind Vertrauenssache", "Ein Match ist kein Vertrag", "Fair zusammenarbeiten", "Aufbauen statt abzocken", "Gesetz", "Keine Technik-Tricks", "Melden"];
  const STRIKE_FIELDS = [
    { name: "grade", label: "Schweregrad", type: "select", value: "A", options: [["A", "A – leicht (1 Punkt)"], ["B", "B – mittel (3 Punkte)"], ["C", "C – schwer (sofortige Sperre)"]] },
    { name: "rule", label: "Regel", type: "select", value: "", options: [["", "keine Angabe"], ...RULES.map((r, i) => [String(i + 1), `${i + 1}. ${r}`])] },
    { name: "hint", label: "Nur Hinweis (Stufe 0): Vermerk ohne Punkte, nur bei Grad A", type: "checkbox" },
    { name: "mild", label: "Grad C ohne Vorsatz: 30 Tage statt dauerhaft", type: "checkbox" },
  ];
  const strikeBody = (a) => ({ grade: a.grade, rule: a.rule ? Number(a.rule) : null, hint: a.hint, mild: a.mild });
  const strikeResult = (name, r) => {
    const s = r && r.sanction;
    const what = !s ? "" : s.kind === "mute" ? ` Folge: eingeschränkt${s.until ? ` bis ${fmt(s.until)}` : ""}.` : s.until ? ` Folge: gesperrt bis ${fmt(s.until)}.` : " Folge: dauerhaft gesperrt.";
    return `${name} wurde verwarnt (Grad ${r && r.grade ? r.grade : "A"}), jetzt ${r && typeof r.points === "number" ? r.points : "?"} Punkte.${what}`;
  };

  // Dialog mit Feldern (Grund, Dauer, Passwort …). Löst mit den Werten auf, null bei Abbruch.
  function ask({ title, text = "", fields = [], confirm = "Bestätigen", danger = false }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "xa-dialog";
      dlg.innerHTML = `<form method="dialog" class="xa-dialog-body">
        <h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ""}
        ${fields.map((f) => {
          if (f.type === "select") return `<label>${esc(f.label)}<select name="${esc(f.name)}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${f.value === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
          if (f.type === "textarea") return `<label>${esc(f.label)}<textarea name="${esc(f.name)}" maxlength="${f.max || 500}" ${f.required ? "required" : ""} placeholder="${esc(f.placeholder || "")}"></textarea></label>`;
          if (f.type === "checkbox") return `<label class="xa-check"><input type="checkbox" name="${esc(f.name)}"> ${esc(f.label)}</label>`;
          return `<label>${esc(f.label)}<input name="${esc(f.name)}" type="${esc(f.type || "text")}" ${f.required ? "required" : ""} maxlength="${f.max || 500}" placeholder="${esc(f.placeholder || "")}" value="${esc(f.value || "")}" ${f.type === "password" ? 'autocomplete="current-password"' : ""}></label>`;
        }).join("")}
        <div class="xa-row"><button class="btn btn-small ${danger ? "xa-btn-danger" : ""}" value="ok">${esc(confirm)}</button><button class="btn btn-small btn-ghost" value="cancel" formnovalidate>Abbrechen</button></div>
      </form>`;
      document.body.append(dlg);
      dlg.addEventListener("close", () => {
        const out = {};
        if (dlg.returnValue === "ok") for (const f of fields) {
          const el = dlg.querySelector(`[name="${f.name}"]`);
          out[f.name] = f.type === "checkbox" ? el.checked : (el.value || "").trim();
        }
        dlg.remove();
        resolve(dlg.returnValue === "ok" ? out : null);
      });
      dlg.showModal();
      const first = dlg.querySelector("input, textarea, select"); if (first) first.focus();
    });
  }
  // Fensterchen mit Inhalt (Verlauf, Kontext)
  function modal(title, html) {
    const dlg = document.createElement("dialog");
    dlg.className = "xa-dialog xa-dialog-wide";
    dlg.innerHTML = `<div class="xa-dialog-body"><div class="xa-dialog-head"><h2>${esc(title)}</h2><button type="button" class="xa-close" aria-label="Schließen">×</button></div><div class="xa-dialog-content">${html}</div></div>`;
    document.body.append(dlg);
    dlg.querySelector(".xa-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
    return dlg;
  }

  // ---------- Start: eigenes Konto und Rechte ----------
  const platformTabs = [...document.querySelectorAll("[data-tab][data-platform]")];
  const platformKeys = platformTabs.map((b) => b.dataset.tab);
  let readyResolve;
  const loaders = {};
  // Für admin-people.js (Start + Nutzerliste): Rechte, Server-Aufrufe, Dialog und die App-Konto-Details
  window.XyntalAdminPlatform = {
    ready: new Promise((r) => { readyResolve = r; }),
    can: (perm) => S.staff && can(perm),
    api, ask, reason, roleLabel,
    me: () => S.me,
    stats: () => S.stats,
    listUsers: async (query = "") => (await api("GET", `/admin/users${q({ q: query })}`)).users,
    // App-Konto-Details (Sitzungen, Verwarnungen, Rolle, KI-Guthaben, Notizen …) in einen Kasten zeichnen
    showUser: (id, box, { onChange, notify } = {}) => openUser(id, box, onChange, notify),
    refreshCounts: () => loadCounts(),
    // Eigene Module (admin-support.js) hängen ihren Bereich hier ein
    register: (key, loader) => { loaders[key] = loader; },
    openThread: (conversationId) => openThread(conversationId),
    emergencyAccess: (conversationId, after, notify) => emergencyAccess(conversationId, after, notify),
  };

  function gate(text) {
    for (const key of platformKeys) {
      const p = panel(key); if (p) p.innerHTML = `<div class="admin-empty"><span aria-hidden="true">⌘</span><h3>Plattform-Verwaltung</h3><p>${esc(text)}</p></div>`;
    }
    readyResolve({ staff: false });
  }

  async function boot() {
    try { S.me = await X.me(); }
    catch (err) {
      gate(err && (err.code === "SIGNED_OUT" || err.code === "TWOFA_CANCELLED") ? "Bitte logg dich ein, um die Plattform zu verwalten."
        : err && err.code === "NETWORK" ? "Der App-Server ist gerade nicht erreichbar." : reason(err));
      return;
    }
    if (!S.me.staffRole) { gate("Dein App-Konto hat keine Staff-Rolle. Rollen vergibt ein Inhaber in der App oder hier unter „Nutzer“."); return; }
    try { const r = await api("GET", "/admin/rbac"); S.matrix = r.matrix || {}; S.role = r.role || S.me.staffRole; }
    catch (err) { gate(reason(err)); return; }
    S.staff = true;
    const badge = document.getElementById("admin-role");
    if (badge) { badge.textContent = roleLabel(S.role); badge.hidden = false; }
    for (const b of platformTabs) if (!can(b.dataset.perm)) b.hidden = true;
    readyResolve({ staff: true });
    const current = platformTabs.find((b) => b.getAttribute("aria-selected") === "true");
    if (current) open(current.dataset.tab);
    loadCounts();
  }

  async function loadCounts() {
    try {
      const { stats } = await api("GET", "/admin/stats");
      S.stats = stats;
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ? `(${num(v)})` : ""; };
      set("c-users", stats.users); set("c-projects", stats.projects); set("c-workspaces", stats.workspaces);
      set("c-support", stats.openTickets); set("c-reports", stats.openReports);
    } catch { /* Zahlen sind Beiwerk */ }
  }

  function open(key) {
    if (!S.staff || !loaders[key]) return;
    const b = platformTabs.find((t) => t.dataset.tab === key);
    if (b && !can(b.dataset.perm)) { panel(key).innerHTML = empty("Deine Rolle erlaubt diesen Bereich nicht."); return; }
    loaders[key]();
  }
  for (const b of platformTabs) b.addEventListener("click", () => open(b.dataset.tab));

  // Weltkarte wie in der App (AdminWorldMap.qml): vorprojizierte Länder aus world-geo.js,
  // Füllung nach Mitgliederzahl (Wurzel, damit ein einzelnes Mitglied sichtbar bleibt), Hover-Tipp.
  function drawMap(canvas, tip, countries, max) {
    const G = window.XyntalWorldGeo;
    if (!canvas || !G) { if (canvas) canvas.closest(".xa-map").innerHTML = empty("Kartendaten nicht geladen."); return; }
    const counts = new Map(countries.map((c) => [c.code, c.count]));
    const ctx = canvas.getContext("2d");
    const s = canvas.width / G.mapWidth;
    let hovered = "";
    const paint = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.scale(s, s); ctx.lineWidth = 0.8 / s;
      for (const c of G.countries) {
        ctx.beginPath();
        for (const f of c.p) { ctx.moveTo(f[0], f[1]); for (let k = 2; k < f.length; k += 2) ctx.lineTo(f[k], f[k + 1]); ctx.closePath(); }
        const n = counts.get(c.c);
        ctx.fillStyle = n ? `rgba(185,92,255,${(0.2 + 0.75 * Math.sqrt(n / max)).toFixed(2)})` : "rgba(255,255,255,0.07)";
        ctx.fill();
        ctx.strokeStyle = c.c === hovered ? "#D9BBFF" : "rgba(255,255,255,0.12)";
        ctx.stroke();
      }
    };
    const countryAt = (mx, my) => {
      const x = mx * G.mapWidth / canvas.clientWidth, y = my * G.mapWidth / canvas.clientWidth;
      for (let i = G.countries.length - 1; i >= 0; --i) {
        for (const f of G.countries[i].p) {
          let inside = false;
          for (let k = 0, l = f.length - 2; k < f.length; l = k, k += 2) {
            if ((f[k + 1] > y) !== (f[l + 1] > y) && x < (f[l] - f[k]) * (y - f[k + 1]) / (f[l + 1] - f[k + 1]) + f[k]) inside = !inside;
          }
          if (inside) return G.countries[i].c;
        }
      }
      return "";
    };
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect(), code = countryAt(e.clientX - r.left, e.clientY - r.top);
      if (code !== hovered) { hovered = code; paint(); }
      if (!code) { tip.hidden = true; return; }
      tip.hidden = false; tip.textContent = `${G.nameOf(code)}: ${num(counts.get(code) || 0)}`;
      tip.style.left = `${e.clientX - r.left + 12}px`; tip.style.top = `${e.clientY - r.top + 12}px`;
    });
    canvas.addEventListener("mouseleave", () => { hovered = ""; tip.hidden = true; paint(); });
    paint();
  }

  // ---------- Übersicht ----------
  loaders.platform = async () => {
    const p = panel("platform");
    p.innerHTML = loading();
    try {
      const [{ stats }, flags, audit] = await Promise.all([
        api("GET", "/admin/stats"),
        api("GET", "/admin/flags").then((r) => r.flags).catch(() => []),
        can("audit.view") ? api("GET", "/admin/audit").then((r) => r.entries.slice(0, 8)).catch(() => []) : Promise.resolve([]),
      ]);
      S.stats = stats; S.flags = flags;
      const FLAGS = [["communities", "Communities", "Öffentliche Community-Räume und Mitgliedschaft."], ["discover", "Entdecken", "Der Entdecken-Feed mit Arbeitsbereichen und Leuten."], ["ai", "KI", "KI-Assistent und Generierung."]];
      // Wie Server und App: ein nie gesetztes Flag gilt als eingeschaltet.
      const on = (k) => { const f = flags.find((x) => x.key === k); return f ? f.enabled : true; };
      const countries = stats.usersByCountry || [];
      const max = Math.max(1, ...countries.map((c) => c.count));
      const G = window.XyntalWorldGeo;
      p.innerHTML = `
        ${head("AUSWERTUNG", "Plattform-Zahlen", "Die App-Plattform auf einen Blick: Konten, Aktivität und Moderationslast.", `<button data-act="refresh">Aktualisieren</button>`)}
        <div class="xa-stats">
          ${stat("Nutzer", num(stats.users), `${num(stats.newUsers24h)} neu in 24 Std.`)}
          ${stat("Staff", num(stats.staff))}
          ${stat("Verifiziert", num(stats.verifiedUsers))}
          ${stat("Gesperrt", num(stats.bannedUsers), "", stats.bannedUsers ? "warn" : "")}
          ${stat("Aktive Sitzungen", num(stats.activeSessions))}
          ${stat("Arbeitsbereiche", num(stats.workspaces))}
          ${stat("Projekte", num(stats.projects))}
          ${stat("Gespräche", num(stats.conversations), `${num(stats.messages)} Nachrichten`)}
          ${stat("Offene Tickets", num(stats.openTickets), "", stats.openTickets ? "accent" : "")}
          ${stat("Offene Meldungen", num(stats.openReports), "", stats.openReports ? "warn" : "")}
          ${stat("Fehlgeschlagene Logins (24h)", num(stats.loginFails24h), "", stats.loginFails24h >= 10 ? "warn" : "")}
          ${stat("KI-Anfragen (24h)", num(stats.aiRequests24h))}
        </div>
        <div class="xa-cols">
          <section class="xa-card">
            <h3>Feature-Flags</h3><p class="hint">Bereiche für alle ein- oder ausschalten. Änderungen gelten sofort.</p>
            <ul class="xa-list">${FLAGS.map(([k, l, d]) => `<li><div><b>${esc(l)}</b><small>${esc(d)}</small></div><button class="xa-switch" role="switch" aria-checked="${on(k)}" data-flag="${k}" ${can("flags.manage") ? "" : "disabled"} aria-label="${esc(l)} ${on(k) ? "ausschalten" : "einschalten"}"><i></i></button></li>`).join("")}</ul>
          </section>
          <section class="xa-card xa-map-card">
            <h3>Mitglieder nach Land</h3><p class="hint">Selbst angegebene Länder im Profil. ${num(stats.users - countries.reduce((n, c) => n + c.count, 0))} ohne Angabe.</p>
            <div class="xa-map"><canvas data-map width="1000" height="423" role="img" aria-label="Weltkarte der Mitgliederländer"></canvas><div class="xa-map-tip" data-map-tip hidden></div></div>
            ${countries.length ? `<ul class="xa-bars">${countries.slice(0, 8).map((c) => `<li><span title="${esc(G ? G.nameOf(c.code) : c.code)}">${esc(c.code)}</span><i style="width:${Math.round((c.count / max) * 100)}%"></i><b>${num(c.count)}</b></li>`).join("")}</ul>` : empty("Noch keine Länderangaben.")}
          </section>
        </div>
        ${can("audit.view") ? `<section class="xa-card"><div class="xa-card-head"><h3>Letzte Admin-Aktionen</h3><button data-goto="audit">Audit-Log</button></div>
          ${audit.length ? `<ul class="xa-feed">${audit.map((a) => `<li><code>${esc(a.action)}</code><span>${esc(a.actor || a.actorEmail || "System")}</span>${a.reason ? `<em>${esc(a.reason)}</em>` : ""}<small title="${esc(fmt(a.createdAt))}">${esc(ago(a.createdAt))}</small></li>`).join("")}</ul>` : empty("Noch nichts.")}</section>` : ""}`;
      p.querySelector('[data-act="refresh"]').addEventListener("click", () => { loaders.platform(); loadCounts(); });
      drawMap(p.querySelector("[data-map]"), p.querySelector("[data-map-tip]"), countries, max);
      p.querySelectorAll("[data-flag]").forEach((b) => b.addEventListener("click", async () => {
        const next = b.getAttribute("aria-checked") !== "true";
        b.disabled = true;
        try { await api("POST", "/admin/flags", { key: b.dataset.flag, enabled: next }); b.setAttribute("aria-checked", String(next)); say("platform", `Flag „${b.dataset.flag}“ ${next ? "eingeschaltet" : "ausgeschaltet"}.`); }
        catch (err) { say("platform", reason(err), false); }
        finally { b.disabled = false; }
      }));
    } catch (err) { p.innerHTML = head("AUSWERTUNG", "Plattform-Zahlen", "") + empty(reason(err)); }
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-goto]"); if (!b) return;
    document.querySelector(`[data-tab="${b.dataset.goto}"]`)?.click();
  });

  // ---------- App-Konto-Details (eingebettet in die Nutzerliste von admin-people.js) ----------
  async function openUser(id, box, onChange, notify) {
    S.users.box = box; S.users.onChange = onChange || null; S.users.notify = notify || null;
    if (!box.dataset.xaBound) {
      box.dataset.xaBound = "1";
      box.addEventListener("click", userDetailClick);
      box.addEventListener("submit", userDetailSubmit);
    }
    box.innerHTML = loading("App-Konto wird geladen …");
    try { S.users.detail = await api("GET", `/admin/users/${encodeURIComponent(id)}`); renderUser(); }
    catch (err) { box.innerHTML = empty(reason(err)); }
  }
  const tell = (text, ok = true) => { if (S.users.notify) S.users.notify(text, ok); };
  function renderUser() {
    const d = S.users.detail, u = d.user, box = S.users.box;
    const me = u.id === S.me.id;
    const roleOpts = [["none", "Mitglied (keine Staff-Rolle)"], ...Object.keys(ROLE_LABEL).map((r) => [r, ROLE_LABEL[r]])];
    box.innerHTML = `<section class="xa-detail">
      <p class="hint">${esc(u.email)} · App-Konto seit ${esc(day(u.createdAt))} · Zwei-Faktor-Anmeldung ${u.twoFactor ? "an" : "aus"}${u.plan ? ` · Tarif ${esc(u.subscribed ? `${u.plan} (Abo)` : u.planRenewsAt ? `${u.plan} bis ${day(u.planRenewsAt)}` : u.plan)}` : ""}</p>
      ${u.headline || u.bio || u.location || u.website || u.github ? `<p class="xa-bio">${[u.headline, u.location, u.website, u.github].filter(Boolean).map(esc).join(" · ")}${u.bio ? `<br><span>${esc(u.bio)}</span>` : ""}</p>` : ""}
      <div class="xa-stats xa-stats-sm">
        ${stat("Arbeitsbereiche (Inhaber)", num(d.counts.workspacesOwned))}${stat("Mitgliedschaften", num(d.counts.memberships))}${stat("Tickets", num(d.counts.tickets))}
        ${stat("Follower", num(d.counts.followers))}${stat("Folgt", num(d.counts.following))}${stat("Meldungen gegen", num(d.counts.reportsAgainst), "", d.counts.reportsAgainst ? "warn" : "")}
      </div>
      ${u.aiCredit ? `<h4>KI-Guthaben</h4>
      <div class="xa-stats xa-stats-sm">
        ${stat("Guthaben übrig", euro(u.aiCredit.balanceCents), "", u.aiCredit.balanceCents < 0 ? "warn" : "")}${stat("Bezahlt (gekauft)", euro(u.aiCredit.purchasedCents))}${stat("Von Hand gutgeschrieben", euro(u.aiCredit.grantedCents))}
        ${stat("Verbraucht aus Guthaben", euro(u.aiCredit.spentCents))}${stat("Abo-Budget diesen Monat", u.aiCredit.includedCentsPerMonth ? `${euro(u.aiCredit.includedUsedCents)} / ${euro(u.aiCredit.includedCentsPerMonth)}` : "keins")}${stat("Entfernbar (Gutschriften)", euro(u.aiCredit.removableCents))}
      </div>
      ${can("billing.manage") ? `<div class="row-actions xa-actions"><button data-act="credit">Guthaben gutschreiben</button>${u.aiCredit.removableCents > 0 ? `<button class="admin-danger" data-act="uncredit">Gutschrift entfernen</button>` : ""}</div>
      <p class="hint">Entfernen nimmt nur von Hand gutgeschriebenes, noch nicht verbrauchtes Guthaben zurück – Bezahltes bleibt immer.</p>` : ""}` : ""}
      <h4>Weitere Aktionen</h4>
      <div class="row-actions xa-actions">
        ${can("users.ban") && !me ? `<button data-act="warn">Verwarnen</button>` : ""}
        ${can("billing.manage") && u.plan && u.plan !== "Free" && u.plan !== "Start" && !u.subscribed ? `<button class="admin-danger" data-act="unplan">Tarif ${esc(u.plan)} entfernen</button>` : ""}
        ${can("users.reset2fa") ? `<button data-act="reset2fa">2FA zurücksetzen</button>` : ""}
        ${can("users.ban") ? `<button data-act="kill">Überall abmelden</button>` : ""}
        ${can("users.ban") ? `<button data-act="alts">Verknüpfte Konten</button>` : ""}
      </div>
      ${can("staff.manage") && !me ? `<form class="xa-inline" data-form="role"><label>Staff-Rolle<select name="staffRole">${roleOpts.map(([v, l]) => `<option value="${v}" ${(u.staffRole || "none") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label><label>Grund<input name="reason" maxlength="500" placeholder="optional"></label><button>Rolle setzen</button></form>` : ""}
      <div class="xa-cols">
        <section><h4>Sitzungen (${d.sessions.length})</h4>${d.sessions.length ? `<ul class="xa-list xa-list-plain">${d.sessions.map((s) => `<li><div><b>${esc(s.deviceName || "Gerät")}</b><small>${esc(s.ip || "")} · zuletzt ${esc(ago(s.lastSeenAt || s.createdAt))}</small></div></li>`).join("")}</ul>` : empty("Keine aktiven Sitzungen.")}</section>
        <section><h4>Letzte Anmeldungen</h4>${d.authEvents.length ? `<ul class="xa-list xa-list-plain">${d.authEvents.map((e) => `<li><div><b>${esc(e.type)}</b><small>${esc([e.ip, e.device].filter(Boolean).join(" · "))} · ${esc(fmt(e.createdAt))}</small></div></li>`).join("")}</ul>` : empty("Keine Ereignisse.")}</section>
        <section><h4>Verwarnungen (${d.warnings.length}) · ${d.points || 0} Punkte</h4>${d.warnings.length ? `<ul class="xa-list xa-list-plain">${d.warnings.map((w) => `<li><div><b>${esc(w.reason)}</b><small>Grad ${esc(w.grade || "A")} · ${w.points ? `${w.points} P.` : "Hinweis"}${w.rule ? ` · Regel ${w.rule}` : ""} · ${esc(w.actor || "Staff")} · ${esc(fmt(w.createdAt))}</small></div>${can("users.ban") && w.id ? `<button data-act="unwarn" data-warning="${esc(w.id)}">Zurücknehmen</button>` : ""}</li>`).join("")}</ul>` : empty("Keine Verwarnungen.")}</section>
        <section><h4>Offene Meldungen (${d.openReports.length})</h4>${d.openReports.length ? `<ul class="xa-list xa-list-plain">${d.openReports.map((r) => `<li><div><b>${esc(r.reason)}</b><small>von ${esc(r.reporter || "?")} · ${esc(fmt(r.createdAt))}</small></div></li>`).join("")}</ul>` : empty("Keine offenen Meldungen.")}</section>
        <section><h4>Arbeitsbereiche (${d.memberships.length})</h4>${d.memberships.length ? `<ul class="xa-list xa-list-plain">${d.memberships.map((m) => `<li><div><b>${esc(m.name)}</b><small>${esc(m.role)}${m.slug ? ` · ${esc(m.slug)}` : ""}</small></div></li>`).join("")}</ul>` : empty("In keinem Arbeitsbereich.")}</section>
        ${Array.isArray(d.notes) ? `<section><h4>Staff-Notizen (${d.notes.length})</h4><p class="hint">Nur Staff sieht diese Notizen.</p>
          <form class="xa-inline" data-form="note"><textarea name="body" maxlength="2000" required placeholder="Was das Team über dieses Konto wissen sollte …"></textarea><button>Notiz hinzufügen</button></form>
          ${d.notes.length ? `<ul class="xa-list xa-list-plain">${d.notes.map((n) => `<li><div><b>${esc(n.body)}</b><small>${esc(n.author ? n.author.displayName : "Staff")} · ${esc(fmt(n.createdAt))}</small></div><button data-act="note-delete" data-note="${esc(n.id)}" aria-label="Notiz löschen">Löschen</button></li>`).join("")}</ul>` : ""}</section>` : ""}
      </div></section>`;
  }
  async function userAction(label, fn) {
    try {
      await fn(); tell(typeof label === "function" ? label() : label);
      const id = S.users.detail && S.users.detail.user.id;
      if (S.users.onChange) await S.users.onChange();
      if (id && S.users.box && S.users.box.isConnected) await openUser(id, S.users.box, S.users.onChange, S.users.notify);
    } catch (err) { tell(reason(err), false); }
  }
  const DURATIONS = [["", "Unbefristet"], ["30", "30 Minuten"], ["720", "12 Stunden"], ["1440", "1 Tag"], ["10080", "7 Tage"], ["20160", "2 Wochen"], ["43200", "30 Tage"]];
  async function userDetailClick(e) {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const d = S.users.detail; if (!d && b.dataset.act !== "close") return;
    const u = d && d.user, id = u && encodeURIComponent(u.id), name = u && u.displayName;
    switch (b.dataset.act) {
      case "verify": { const next = b.dataset.on !== "true"; return userAction(next ? `${name} ist jetzt verifiziert.` : `Verifizierung von ${name} entfernt.`, () => api("POST", `/admin/users/${id}/verify`, { verified: next })); }
      case "warn": { const a = await ask({ title: `${name} verwarnen`, text: `Die Person sieht die Verwarnung sofort in der App. Stand: ${d.points || 0} Punkte in 12 Monaten; ab 3 / 6 / 9 Punkten wird automatisch eingeschränkt bzw. gesperrt.`, fields: [{ name: "reason", label: "Grund", type: "textarea", required: true }, ...STRIKE_FIELDS], confirm: "Verwarnen" }); if (!a) return;
        if (a.grade === "C" && !a.mild && !confirm(`${name} wird dauerhaft gesperrt. Fortfahren?`)) return;
        let res = null;
        return userAction(() => strikeResult(name, res), async () => { res = await api("POST", `/admin/users/${id}/warn`, { reason: a.reason, ...strikeBody(a) }); return res; }); }
      case "ban": { const a = await ask({ title: `${name} sperren`, text: "Alle Sitzungen werden beendet. Ein Grund ist Pflicht.", danger: true, confirm: "Sperren", fields: [
          { name: "reason", label: "Grund", type: "textarea", required: true }, { name: "duration", label: "Dauer", type: "select", options: DURATIONS },
          { name: "banDevice", label: "Auch die Geräte des Kontos blockieren", type: "checkbox" }, { name: "banIp", label: "Auch die Netzwerke des Kontos blockieren", type: "checkbox" }] }); if (!a) return;
        return userAction(`${name} ist gesperrt.`, () => api("POST", `/admin/users/${id}/ban`, { banned: true, reason: a.reason, durationMinutes: a.duration ? Number(a.duration) : undefined, banDevice: a.banDevice, banIp: a.banIp })); }
      case "unban": return userAction(`Sperre von ${name} aufgehoben.`, () => api("POST", `/admin/users/${id}/ban`, { banned: false }));
      case "mute": { const a = await ask({ title: `${name} stummschalten`, text: "Das Konto kann lesen, aber keine Nachrichten, Reaktionen oder Beiträge schreiben.", confirm: "Stummschalten", fields: [{ name: "duration", label: "Dauer", type: "select", options: DURATIONS }, { name: "reason", label: "Grund", type: "textarea" }] }); if (!a) return;
        return userAction(`${name} ist stummgeschaltet.`, () => api("POST", `/admin/users/${id}/mute`, { durationMinutes: a.duration ? Number(a.duration) : undefined, reason: a.reason })); }
      case "unmute": return userAction(`${name} kann wieder schreiben.`, () => api("POST", `/admin/users/${id}/unmute`, {}));
      case "reset2fa": { const a = await ask({ title: `2FA von ${name} zurücksetzen`, text: "Authenticator und Wiederherstellungscodes werden entfernt; die Person kann sich mit dem Passwort anmelden.", confirm: "Zurücksetzen", fields: [{ name: "reason", label: "Grund", type: "textarea" }] }); if (!a) return;
        return userAction(`2FA von ${name} zurückgesetzt.`, () => api("POST", `/admin/users/${id}/reset-2fa`, { reason: a.reason })); }
      case "kill": { const a = await ask({ title: `Alle Sitzungen von ${name} beenden`, text: "Die Person wird überall sofort abgemeldet.", confirm: "Sitzungen beenden", fields: [{ name: "reason", label: "Grund", type: "textarea" }] }); if (!a) return;
        return userAction(`Sitzungen von ${name} beendet.`, () => api("POST", `/admin/users/${id}/kill-sessions`, { reason: a.reason })); }
      case "alts": {
        try {
          const r = await api("GET", `/admin/users/${id}/linked`);
          modal(`Verknüpfte Konten von ${name}`, `<p class="hint">Konten, die in den letzten 90 Tagen dasselbe Gerät genutzt haben oder innerhalb von 24 Stunden dasselbe Netzwerk. Ein geteiltes Netzwerk kann auch ein Büro oder Haushalt sein; ein geteiltes Gerät sagt mehr.</p>
            <p><small>Geräte: ${num(r.devices.length)} · Netzwerke: ${num(r.ips.length)}</small></p>
            ${r.accounts.length ? `<ul class="xa-list xa-list-plain">${r.accounts.map((a) => `<li><div><b>${esc(a.displayName || a.email)}</b><small>${esc(a.email)}${a.handle ? ` · @${esc(a.handle)}` : ""} · ${esc((a.via || []).map((v) => (v === "device" ? "gleiches Gerät" : "gleiches Netzwerk")).join(", "))}${(a.sharedIps || []).map((x) => `<br>Netzwerk ${esc(x.ip)} · ${esc(stamp(x.at))}`).join("")}</small></div></li>`).join("")}</ul>` : empty("Kein anderes Konto hat dasselbe Gerät oder Netzwerk genutzt.")}`);
        } catch (err) { tell(reason(err), false); }
        return;
      }
      case "delete": { const a = await ask({ title: `Konto von ${name} löschen`, text: "Unwiderruflich: Sitzungen, Mitgliedschaften und Nachrichten werden mit entfernt. Bestätige mit deinem Passwort.", danger: true, confirm: "Endgültig löschen", fields: [{ name: "reason", label: "Grund", type: "textarea", required: true }, { name: "password", label: "Dein Passwort", type: "password", required: true }] }); if (!a) return;
        try { await api("POST", `/admin/users/${id}/delete`, { reason: a.reason, password: a.password }); tell(`App-Konto von ${name} gelöscht.`); S.users.detail = null; if (S.users.onChange) await S.users.onChange(); loadCounts(); }
        catch (err) { tell(reason(err), false); }
        return; }
      case "credit": { const a = await ask({ title: `KI-Guthaben für ${name}`, text: "Wird zusätzlich zum bezahlten Guthaben gutgeschrieben und lässt sich später wieder entfernen.", confirm: "Gutschreiben", fields: [{ name: "euros", label: "Betrag in Euro (z. B. 5 oder 2,50)", required: true }, { name: "reason", label: "Grund", type: "textarea", required: true }] }); if (!a) return;
        const cents = parseEuroCents(String(a.euros).trim());
        if (cents === undefined || cents < 0) { tell("Der Betrag ist in Euro, höchstens zwei Nachkommastellen und höchstens 500: 5, 2,50.", false); return; }
        return userAction(`${euro(cents)} KI-Guthaben für ${name} gutgeschrieben.`, () => api("POST", `/admin/users/${id}/ai-credit`, { cents, reason: a.reason })); }
      case "uncredit": { const max = u.aiCredit.removableCents;
        const a = await ask({ title: `Gutschrift von ${name} entfernen`, text: `Von Hand gutgeschrieben und noch übrig: ${euro(max)}. Bezahltes Guthaben bleibt unberührt. Ohne Betrag wird alles davon entfernt.`, danger: true, confirm: "Entfernen", fields: [{ name: "euros", label: "Betrag in Euro (leer = alles)" }, { name: "reason", label: "Grund", type: "textarea", required: true }] }); if (!a) return;
        const raw = String(a.euros || "").trim(), cents = raw ? parseEuroCents(raw) : undefined;
        if (raw && (cents === undefined || cents < 0)) { tell("Der Betrag ist in Euro, höchstens zwei Nachkommastellen: 5, 2,50.", false); return; }
        return userAction(`Gutschrift von ${name} entfernt.`, () => api("POST", `/admin/users/${id}/ai-credit/remove`, { cents, reason: a.reason })); }
      case "unwarn": { const w = d.warnings.find((x) => x.id === b.dataset.warning);
        const a = await ask({ title: `Verwarnung von ${name} zurücknehmen`, text: `„${w ? w.reason : ""}“ zählt danach nicht mehr, die Benachrichtigung verschwindet. Das Audit-Log behält beides.`, confirm: "Zurücknehmen", fields: [{ name: "reason", label: "Grund (optional)", type: "textarea" }] }); if (!a) return;
        return userAction(`Verwarnung von ${name} zurückgenommen.`, () => api("POST", `/admin/users/${id}/unwarn`, { warningId: b.dataset.warning, reason: a.reason })); }
      case "unplan": { if (u.subscribed) { tell("Ein bezahltes Abo lässt sich hier nicht entfernen.", false); return; }
        const a = await ask({ title: `Tarif von ${name} entfernen`, text: `${u.plan}${u.planRenewsAt ? ` (bis ${day(u.planRenewsAt)})` : ""} wurde von Hand vergeben. Das Konto ist danach sofort wieder im kostenlosen Tarif. Bezahlte Abos lassen sich hier nicht entfernen.`, danger: true, confirm: "Tarif entfernen", fields: [{ name: "reason", label: "Grund", type: "textarea", required: true }] }); if (!a) return;
        return userAction(`Tarif ${u.plan} von ${name} entfernt.`, () => api("POST", `/admin/users/${id}/plan/remove`, { reason: a.reason })); }
      case "note-delete": return userAction("Notiz gelöscht.", () => api("DELETE", `/admin/users/${id}/notes/${encodeURIComponent(b.dataset.note)}`));
      default: return;
    }
  }
  async function userDetailSubmit(e) {
    const form = e.target.closest("form[data-form]"); if (!form) return;
    e.preventDefault();
    const u = S.users.detail.user, id = encodeURIComponent(u.id);
    if (form.dataset.form === "role") {
      const v = form.staffRole.value;
      return userAction(`Staff-Rolle von ${u.displayName}: ${v === "none" ? "Mitglied" : roleLabel(v)}.`, () => api("POST", `/admin/users/${id}/staff-role`, { staffRole: v, reason: form.reason.value }));
    }
    if (form.dataset.form === "note") return userAction("Notiz hinzugefügt. Nur Staff sieht sie.", () => api("POST", `/admin/users/${id}/notes`, { body: form.body.value }));
  }

  // ---------- Konsole ----------
  // Exklusive Designs: Spiegel der Serverliste (Supabase, admin_design_unlock). Der Server prüft den echten Wert.
  const DESIGNS = { snow: "Schnee" };
  const DESIGN_HINTS = { snow: "Winter-Design" };
  const isDesign = (k) => Object.prototype.hasOwnProperty.call(DESIGNS, k);
  const designNames = (keys) => keys.map((k) => (isDesign(k) ? DESIGNS[k] : k)).join(", ");
  const COMMANDS = [
    ["help", "", "help [Befehl]", "Befehle auflisten oder einen erklären."],
    ["user", "users.view", "user <@handle|E-Mail|ID>", "Konto anzeigen: Status, Rolle, Verwarnungen, Meldungen, Arbeitsbereiche."],
    ["ban", "users.ban", "ban <Konto> [Dauer] <Grund> [--device] [--ip]", "Konto sperren, dauerhaft oder befristet (30m, 12h, 7d, 2w). --device und --ip blockieren auch Anmeldung und Registrierung von den Geräten und Netzwerken des Kontos. Fragt vorher nach."],
    ["unban", "users.ban", "unban <Konto>", "Sperre aufheben."],
    ["warn", "users.ban", "warn <Konto> <Grund>", "Konto verwarnen. Die Person sieht die Verwarnung in der App."],
    ["unwarn", "users.ban", "unwarn <Konto> [Grund]", "Die letzte Verwarnung des Kontos zurücknehmen. Ihre Benachrichtigung verschwindet; das Audit-Log behält beides."],
    ["mute", "users.ban", "mute <Konto> [Dauer] [Grund]", "Konto stummschalten: lesen ja, Nachrichten, Reaktionen und Beiträge nein."],
    ["unmute", "users.ban", "unmute <Konto>", "Stummschaltung aufheben."],
    ["kick", "content.moderate", "kick <Konto> <Arbeitsbereich> [Grund]", "Konto aus einem seiner Arbeitsbereiche entfernen. Fragt vorher nach."],
    ["plan", "billing.manage", "plan <Konto> <Tage> [Tarif] <Grund>", "Mitgliedschaftstage gutschreiben (30, 30d, 4w). Sie zählen ab dem Ende der laufenden Mitgliedschaft. Ein kostenloses Konto braucht den Tarif (Plus, Pro, Ultra); ein bezahltes behält seinen, außer du nennst einen anderen. Die Tage laufen von selbst ab."],
    ["unplan", "billing.manage", "unplan <Konto> <Grund>", "Einen von Hand vergebenen Tarif zurücknehmen: Das Konto ist sofort wieder im kostenlosen Tarif. Per Abo bezahlte Tarife werden nie entfernt. Fragt vorher nach."],
    ["credit", "billing.manage", "credit <Konto> <Euro> <Grund>", "KI-Guthaben gutschreiben (5, 2,50; negativ korrigiert). Das Konto bezahlt seine KI-Aufrufe daraus, sobald das Inklusivbudget des Tarifs aufgebraucht ist."],
    ["uncredit", "billing.manage", "uncredit <Konto> [Euro] <Grund>", "Von Hand gutgeschriebenes KI-Guthaben zurücknehmen: den Betrag, ohne Betrag alles, was davon übrig ist. Bezahltes Guthaben wird nie entfernt."],
    // Exklusive Designs: das Recht prüft Supabase (admin_design_unlock*), nicht die Staff-Matrix – daher kein Recht hier.
    ["unlock", "", "unlock <Konto> <Design> <Grund>", "Exklusives Design für ein Konto freischalten (z. B. snow). Das Design erscheint im Editor des Kontos."],
    ["lock", "", "lock <Konto> <Design> [Grund]", "Freischaltung eines exklusiven Designs zurücknehmen. Die Seite behält ihre Farben, der Effekt entfällt. Fragt vorher nach."],
    ["unlocks", "", "unlocks <Konto>", "Freigeschaltete exklusive Designs eines Kontos auflisten."],
    ["alts", "users.ban", "alts <Konto>", "Andere Konten, die dasselbe Gerät oder Netzwerk genutzt haben."],
    ["reports", "reports.handle", "reports", "Offene Meldungen auflisten."],
    ["note", "users.notes", "note <Konto> [Text]", "Staff-Notiz zu einem Konto; ohne Text werden die Notizen gelistet."],
    ["audit", "audit.view", "audit [Konto]", "Die letzten Audit-Einträge, oder die zu einem Konto."],
    ["clear", "", "clear", "Konsole leeren."],
  ];
  loaders.console = () => {
    const p = panel("console");
    if (p.querySelector("[data-console]")) return;
    p.innerHTML = `${head("MODERATION", "Konsole", "Moderation per Befehl. Jeder Befehl wird auf dem Server gegen deine Rolle geprüft und ins Audit-Log geschrieben.")}
      <div class="xa-console" data-console>
        <div class="xa-console-log" data-log role="log" aria-live="polite" aria-label="Konsolenausgabe"></div>
        <div class="xa-suggest" data-suggest role="listbox" aria-label="Vorschläge" hidden></div>
        <form class="xa-console-form" data-console-form><span class="xa-prompt" aria-hidden="true">›</span><input data-console-input autocomplete="off" spellcheck="false" placeholder="help, user @handle, note @handle Text, ban @handle 7d Grund …" aria-label="Konsolenbefehl" aria-autocomplete="list" aria-controls="xa-suggest-list"><button>Ausführen</button></form>
        <p class="hint">Konten per @handle, E-Mail oder ID ansprechen. Dauern: 30m, 12h, 7d, 2w, perm. Ein führender / ist erlaubt.</p>
      </div>`;
    const input = p.querySelector("[data-console-input]");
    const box = p.querySelector("[data-suggest]"); box.id = "xa-suggest-list";
    p.querySelector("[data-console-form]").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value; input.value = ""; setSuggestions([]); submitConsole(v); });
    input.addEventListener("input", () => { S.console.pos = -1; updateSuggestions(input.value); });
    input.addEventListener("blur", () => { setTimeout(() => { if (document.activeElement !== input && !box.contains(document.activeElement)) renderSuggestions(true); }, 120); });
    input.addEventListener("focus", () => renderSuggestions());
    input.addEventListener("keydown", (e) => {
      const h = S.console.history, list = S.console.suggestions, open = list.length && !box.hidden;
      if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { e.preventDefault(); const n = list.length; S.console.selected = e.key === "ArrowDown" ? (S.console.selected + 1) % n : (S.console.selected - 1 + n) % n; renderSuggestions(); return; }
      if (open && (e.key === "Tab" || (e.key === "Enter" && S.console.selected >= 0))) { e.preventDefault(); complete(Math.max(0, S.console.selected)); return; }
      if (e.key === "Escape" && open) { e.preventDefault(); setSuggestions([]); return; }
      if (e.key === "ArrowUp" && h.length) { e.preventDefault(); S.console.pos = S.console.pos < 0 ? h.length - 1 : Math.max(0, S.console.pos - 1); input.value = h[S.console.pos]; }
      else if (e.key === "ArrowDown" && S.console.pos >= 0) { e.preventDefault(); S.console.pos = S.console.pos + 1 >= h.length ? -1 : S.console.pos + 1; input.value = S.console.pos < 0 ? "" : h[S.console.pos]; }
    });
    box.addEventListener("mousedown", (e) => e.preventDefault()); // Fokus bleibt in der Eingabe
    box.addEventListener("click", (e) => { const b = e.target.closest("[data-index]"); if (b) { complete(Number(b.dataset.index)); input.focus(); } });
    // Vorschlag übernehmen: ersetzt das gerade getippte Wort (bzw. hängt an), wie in der App
    function complete(i) {
      const s = S.console.suggestions[i]; if (!s) return;
      const v = input.value, cut = v.endsWith(" ") ? v.length : v.lastIndexOf(" ") + 1;
      input.value = v.slice(0, cut) + s.insert;
      setSuggestions([]); updateSuggestions(input.value);
    }
    renderConsole();
    if (!S.console.lines.length) print("info", "Tipp help ein, um die Befehle deiner Rolle zu sehen.");
    input.focus();
  };
  // ---------- Vorschläge beim Tippen (wie die Konsole in der App) ----------
  const USER_COMMANDS = ["user", "ban", "unban", "warn", "unwarn", "mute", "unmute", "kick", "plan", "unplan", "credit", "uncredit", "unlock", "lock", "unlocks", "audit", "alts", "note"];
  const euro = (cents) => (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  // Euro für credit: "5", "5.50", "5,50", "-2" → Cent; nie null, höchstens 500 € wie auf dem Server.
  function parseEuroCents(token) {
    const m = /^(-?)(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(token || ""); if (!m) return undefined;
    const cents = Number(m[2]) * 100 + Number((m[3] || "").padEnd(2, "0"));
    return cents > 0 && cents <= 50000 ? (m[1] ? -cents : cents) : undefined;
  }
  // Bezahlte Tarife, die plan vergeben kann – Spiegel des Katalogs in server/src/billing/routes.ts; der Server prüft den echten.
  const PLAN_IDS = ["Plus", "Pro", "Ultra", "Enterprise", "Enterprise+"];
  // Tage für plan: "30", "30d"/"30t" oder "4w"; Stunden sind keine Tage.
  function parseDays(token) {
    const m = /^(\d{1,5})(d|t|w)?$/i.exec(token || ""); if (!m) return undefined;
    const days = Number(m[1]) * (m[2]?.toLowerCase() === "w" ? 7 : 1);
    return days > 0 && days <= 3650 ? days : undefined;
  }
  function setSuggestions(list) { S.console.suggestions = list; S.console.selected = list.length ? 0 : -1; renderSuggestions(); }
  function renderSuggestions(hide = false) {
    const box = $("[data-suggest]", panel("console")); if (!box) return;
    const list = S.console.suggestions;
    box.hidden = hide || !list.length;
    if (box.hidden) { box.innerHTML = ""; return; }
    box.innerHTML = list.map((s, i) => `<button type="button" role="option" data-index="${i}" aria-selected="${i === S.console.selected}" class="${i === S.console.selected ? "is-active" : ""}"><b>${esc(s.label)}</b><span>${esc(s.detail)}</span></button>`).join("");
  }
  async function updateSuggestions(line) {
    const seq = ++S.console.seq;
    const slash = line.startsWith("/");
    if ((!slash && !line.trim()) || S.console.pending) { setSuggestions([]); return; }
    const trailing = line.endsWith(" ");
    const tokens = (slash ? line.slice(1) : line).trim().split(/\s+/).filter(Boolean);
    const partial = trailing || !tokens.length ? "" : tokens[tokens.length - 1];
    const argIndex = !tokens.length ? -1 : (trailing ? tokens.length - 1 : tokens.length - 2);
    const prefix = partial.toLowerCase();
    const pick = (pairs, prepend = "") => pairs.filter(([k]) => k.startsWith(prefix) && k !== prefix).map(([k, d]) => ({ label: k, detail: d, insert: `${prepend}${k} ` }));
    if (argIndex < 0) { setSuggestions(pick(COMMANDS.filter((c) => can(c[1])).map((c) => [c[0], c[3]]), slash ? "/" : "")); return; }
    const name = tokens[0].toLowerCase();
    const cmd = COMMANDS.find((c) => c[0] === name);
    if (!cmd || !can(cmd[1])) { setSuggestions([]); return; }
    if (name === "ban" && argIndex >= 1 && partial.startsWith("-")) {
      setSuggestions(pick([["--device", "auch die Geräte des Kontos blockieren"], ["--ip", "auch die Netzwerke des Kontos blockieren"]].filter(([f]) => !tokens.includes(f)))); return;
    }
    if (argIndex === 0 && USER_COMMANDS.includes(name)) {
      if (!partial || !can("users.view")) { setSuggestions([]); return; }
      try {
        const { users } = await api("GET", `/admin/users${q({ q: partial })}`);
        if (seq !== S.console.seq) return;
        setSuggestions((users || []).slice(0, 8).map((u) => {
          const insert = u.handle ? `@${u.handle}` : u.email;
          S.console.userIds[insert.toLowerCase()] = u.id;
          let detail = u.handle ? `@${u.handle} · ${u.email}` : u.email;
          if (u.banned) detail += " · gesperrt";
          if (u.staffRole) detail += ` · ${roleLabel(u.staffRole)}`;
          return { label: u.displayName, detail, insert: `${insert} ` };
        }));
      } catch { if (seq === S.console.seq) setSuggestions([]); }
      return;
    }
    if (argIndex === 1 && (name === "ban" || name === "mute")) {
      setSuggestions(pick([["1h", "1 Stunde"], ["24h", "24 Stunden"], ["7d", "7 Tage"], ["30d", "30 Tage"], ["perm", "dauerhaft"]])); return;
    }
    if (name === "plan" && (argIndex === 1 || argIndex === 2)) {
      const choices = argIndex === 1 ? [["7", "7 Tage"], ["30", "30 Tage"], ["90", "90 Tage"], ["365", "365 Tage"]] : PLAN_IDS.map((p) => [p, "Tarif"]);
      setSuggestions(choices.filter(([v]) => v.toLowerCase().startsWith(prefix) && v.toLowerCase() !== prefix).map(([v, d]) => ({ label: v, detail: d, insert: `${v} ` })));
      return;
    }
    if (argIndex === 1 && name === "kick") {
      const id = S.console.userIds[tokens[1].toLowerCase()];
      if (!id) { setSuggestions([]); return; }
      try {
        const d = await api("GET", `/admin/users/${encodeURIComponent(id)}`);
        if (seq !== S.console.seq) return;
        setSuggestions((d.memberships || []).filter((m) => m.name.toLowerCase().includes(prefix)).slice(0, 8).map((m) => ({ label: m.name, detail: m.role || "", insert: `${m.id} ` })));
      } catch { if (seq === S.console.seq) setSuggestions([]); }
      return;
    }
    if (argIndex === 1 && (name === "unlock" || name === "lock")) {
      setSuggestions(Object.keys(DESIGNS).filter((k) => k.startsWith(prefix) && k !== prefix).map((k) => ({ label: k, detail: `${DESIGNS[k]} – ${DESIGN_HINTS[k] || "exklusives Design"}`, insert: `${k} ` })));
      return;
    }
    setSuggestions([]);
  }
  function print(kind, text) {
    S.console.lines.push({ kind, text });
    if (S.console.lines.length > 500) S.console.lines.splice(0, S.console.lines.length - 500);
    renderConsole();
  }
  function renderConsole() {
    const log = $("[data-log]", panel("console")); if (!log) return;
    log.innerHTML = S.console.lines.map((l) => `<div class="xa-line xa-line-${l.kind}">${l.kind === "input" ? "<span>›</span> " : ""}${esc(l.text)}</div>`).join("")
      + (S.console.pending ? `<div class="xa-line xa-line-ask">${esc(S.console.pendingText)} — y zum Bestätigen, alles andere bricht ab.</div>` : "");
    log.scrollTop = log.scrollHeight;
  }
  const DUR_RE = /^(\d+)(m|h|d|w)$/i;
  function parseDur(token) {
    if (!token) return undefined;
    if (/^perm(anent)?$/i.test(token)) return null;
    const m = DUR_RE.exec(token); if (!m) return undefined;
    return Number(m[1]) * { m: 1, h: 60, d: 1440, w: 10080 }[m[2].toLowerCase()];
  }
  async function resolveUser(term) {
    try { return (await api("GET", `/admin/users/resolve${q({ q: term })}`)).user; }
    catch (err) {
      if (err.status === 409 && err.details && Array.isArray(err.details.candidates)) {
        print("error", "Mehrere Konten passen – nutze @handle, E-Mail oder ID:");
        for (const c of err.details.candidates) print("info", `  ${c.displayName} · ${c.email}${c.handle ? ` · @${c.handle}` : ""} · ${c.id}`);
        return null;
      }
      print("error", err.status === 404 ? "Kein Konto passt dazu." : reason(err));
      return null;
    }
  }
  // Exklusive Designs laufen über Supabase-RPCs, nicht über den App-Server (die IDs passen dort nicht).
  // Der Server prüft Admin-Recht inkl. 2FA und schreibt das Protokoll; die Auflösung des Kontos macht er ebenfalls.
  async function designRpc(fn, args) {
    // sb ist ein Skript-Top-Level-const aus app.js: typeof statt direktem Zugriff, damit kein ReferenceError kommt
    if (typeof sb === "undefined" || !sb) throw new Error("Die Datenbank-Verbindung ist auf dieser Seite nicht geladen.");
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(designFailText(error));
    return data || {};
  }
  function designFailText(error) {
    const msg = String(error.message || "");
    if (error.code === "PGRST202" || /Could not find the function/i.test(msg)) return "Die Freischaltungen sind in der Datenbank noch nicht eingerichtet (Migration design_unlocks fehlt).";
    if (error.code === "42501" || /Nur für Admins\./.test(msg)) return "Dafür brauchst du Website-Admin-Rechte mit aktiver 2FA.";
    if (/XYNTAL_UNLOCK:no_account/.test(msg)) return "Kein Konto passt dazu.";
    if (/XYNTAL_UNLOCK:ambiguous/.test(msg)) return "Mehrere Konten passen – nutze @handle, E-Mail oder ID.";
    if (/XYNTAL_UNLOCK:reason_required/.test(msg)) return "Der Grund braucht 3 bis 200 Zeichen.";
    if (/XYNTAL_UNLOCK:unknown_design/.test(msg)) return unknownDesign();
    if (msg.startsWith("XYNTAL_UNLOCK:")) return `Das hat nicht geklappt (${msg.slice("XYNTAL_UNLOCK:".length).trim()}).`;
    return msg || "Das hat nicht geklappt.";
  }
  // Anzeige des Kontos: @handle aus der Antwort, sonst Name, sonst der getippte Begriff
  const accountLabel = (r, term) => (r.handle ? `@${r.handle}` : r.name || term);
  const unknownDesign = () => `Unbekanntes Design. Verfügbar: ${Object.keys(DESIGNS).join(", ")}.`;

  async function submitConsole(raw) {
    const line = raw.trim(); if (!line) return;
    print("input", line);
    const h = S.console.history; if (!h.length || h[h.length - 1] !== line) h.push(line); if (h.length > 100) h.shift(); S.console.pos = -1;
    if (S.console.pending) {
      const fn = S.console.pending; S.console.pending = null; S.console.pendingText = "";
      if (/^(y|yes|j|ja|\/confirm)$/i.test(line)) { try { await fn(); } catch (err) { print("error", reason(err)); } }
      else print("info", "Abgebrochen.");
      renderConsole(); return;
    }
    const args = line.replace(/^\//, "").split(/\s+/);
    const name = args.shift().toLowerCase();
    const cmd = COMMANDS.find((c) => c[0] === name);
    if (!cmd) { print("error", `Unbekannter Befehl ${name}. Tipp help ein.`); return; }
    if (!can(cmd[1])) { print("error", "Deine Rolle erlaubt diesen Befehl nicht."); return; }
    const need = (n) => { if (args.length < n) { print("error", `Aufruf: ${cmd[2]}`); return false; } return true; };
    try {
      switch (name) {
        case "help": {
          if (args[0]) { const c = COMMANDS.find((x) => x[0] === args[0].replace(/^\//, "")); if (c) { print("info", c[2]); print("info", c[3]); } else print("error", `Unbekannter Befehl ${args[0]}.`); return; }
          for (const c of COMMANDS) if (can(c[1])) print("info", `${c[2].padEnd(46)} ${c[3]}`);
          return;
        }
        case "clear": S.console.lines = []; renderConsole(); return;
        case "user": {
          if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const d = await api("GET", `/admin/users/${encodeURIComponent(u.id)}`);
          const x = d.user;
          print("ok", `${x.displayName}${x.handle ? ` (@${x.handle})` : ""} · ${x.email}`);
          print("info", `Konto-ID: ${x.id}`); print("info", `Staff-Rolle: ${roleLabel(x.staffRole)}`);
          if (x.aiCredit) {
            const c = x.aiCredit;
            print("info", `KI-Guthaben: ${euro(c.balanceCents)} (bezahlt ${euro(c.purchasedCents)} · von Hand gutgeschrieben ${euro(c.grantedCents)} · verbraucht ${euro(c.spentCents)})`);
            if (c.removableCents > 0) print("info", `Davon entfernbar (Gutschriften, uncredit): ${euro(c.removableCents)}`);
            if (c.includedCentsPerMonth) print("info", `Abo-KI-Budget diesen Monat: ${euro(c.includedUsedCents)} von ${euro(c.includedCentsPerMonth)} verbraucht`);
          } else if (x.aiCreditCents !== undefined) print("info", `KI-Guthaben: ${euro(x.aiCreditCents)}`);
          print("info", `Tarif: ${x.plan}${x.subscribed ? ` (Abo${x.planRenewsAt ? `, verlängert sich ${fmt(x.planRenewsAt)}` : ""})` : x.planRenewsAt ? ` bis ${fmt(x.planRenewsAt)}` : ""}`);
          print("info", `Status: ${x.banned ? (x.bannedUntil ? `gesperrt bis ${fmt(x.bannedUntil)}` : "dauerhaft gesperrt") : "aktiv"}${x.mutedUntil !== null && x.mutedUntil !== undefined ? ` · stumm${x.mutedUntil ? ` bis ${fmt(x.mutedUntil)}` : ""}` : ""}${x.verified ? " · verifiziert" : ""}`);
          print("info", `Dabei seit ${day(x.createdAt)} · 2FA ${x.twoFactor ? "an" : "aus"} · ${d.sessions.length} aktive Sitzung(en)`);
          print("info", `Verwarnungen: ${d.warnings.length} · offene Meldungen gegen das Konto: ${d.openReports.length}${Array.isArray(d.notes) ? ` · Staff-Notizen: ${d.notes.length}` : ""}`);
          print("info", `Arbeitsbereiche: ${d.memberships.length ? d.memberships.map((m) => `${m.name} (${m.role})`).join(", ") : "keine"}`);
          return;
        }
        case "ban": {
          if (!need(2)) return;
          const flags = { banDevice: false, banIp: false };
          const rest = args.slice(1).filter((a) => { if (a === "--device") { flags.banDevice = true; return false; } if (a === "--ip") { flags.banIp = true; return false; } if (a.startsWith("--")) { print("error", `Unbekannte Option ${a}. ban kennt --device und --ip.`); return false; } return true; });
          const u = await resolveUser(args[0]); if (!u) return;
          let minutes = parseDur(rest[0]); const durToken = minutes !== undefined ? rest.shift() : "";
          const why = rest.join(" ").trim();
          if (!why) { print("error", `Eine Sperre braucht einen Grund. Aufruf: ${cmd[2]}`); return; }
          S.console.pendingText = minutes ? `${u.displayName} für ${durToken} sperren? Grund: ${why}` : `${u.displayName} dauerhaft sperren? Grund: ${why}`;
          S.console.pending = async () => {
            const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/ban`, { banned: true, reason: why, durationMinutes: minutes || undefined, ...flags });
            print("ok", r.until ? `${u.displayName} ist bis ${fmt(r.until)} gesperrt. Die Sitzungen wurden beendet.` : `${u.displayName} ist dauerhaft gesperrt. Die Sitzungen wurden beendet.`);
            if (r.devices || r.ips) print("info", `Ebenfalls blockiert: ${r.devices || 0} Gerät(e), ${r.ips || 0} Netzwerk(e).`);
            loadCounts();
          };
          renderConsole(); return;
        }
        case "unban": { if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/ban`, { banned: false }); print("ok", r.changed ? `${u.displayName} ist nicht mehr gesperrt.` : `${u.displayName} war nicht gesperrt.`); return; }
        case "warn": { if (!need(2)) return; const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/warn`, { reason: args.slice(1).join(" ") }); print("ok", `${u.displayName} wurde verwarnt und benachrichtigt. Verwarnungen bisher: ${r.warnings}.`); return; }
        case "unwarn": { if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/unwarn`, { reason: args.slice(1).join(" ") }); print("ok", `Verwarnung „${r.warning}“ von ${u.displayName} zurückgenommen. Verwarnungen jetzt: ${r.warnings}.`); return; }
        case "mute": { if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const rest = args.slice(1); let minutes = parseDur(rest[0]); if (minutes !== undefined) rest.shift();
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/mute`, { durationMinutes: minutes || undefined, reason: rest.join(" ") });
          print("ok", r.until ? `${u.displayName} ist bis ${fmt(r.until)} stummgeschaltet.` : `${u.displayName} ist stummgeschaltet, bis du es mit unmute aufhebst.`); return; }
        case "unmute": { if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/unmute`, {}); print("ok", r.changed ? `${u.displayName} kann wieder schreiben.` : `${u.displayName} war nicht stummgeschaltet.`); return; }
        case "kick": { if (!need(2)) return; const u = await resolveUser(args[0]); if (!u) return;
          const ws = args[1], why = args.slice(2).join(" ");
          S.console.pendingText = `${u.displayName} aus dem Arbeitsbereich „${ws}“ entfernen?`;
          S.console.pending = async () => {
            try { const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/kick`, { workspace: ws, reason: why }); print("ok", `${u.displayName} wurde aus „${r.workspace.name}“ entfernt und benachrichtigt.`); }
            catch (err) { if (err.status === 409 && err.details && err.details.candidates) { print("error", "Mehrere Arbeitsbereiche passen – nutze die ID:"); for (const c of err.details.candidates) print("info", `  ${c.name} · ${c.id}`); } else throw err; }
          };
          renderConsole(); return;
        }
        case "plan": {
          if (!need(3)) return;
          const days = parseDays(args[1]);
          if (days === undefined) { print("error", `Tage sind eine ganze Zahl von Tagen: 30, 30d oder 4w. Aufruf: ${cmd[2]}`); return; }
          // Optionaler Tarif vor dem Grund: plan @bob 30 Plus Danke
          const rest = args.slice(2);
          const planWords = [2, 1].find((n) => PLAN_IDS.some((p) => p.toLowerCase() === rest.slice(0, n).join(" ").toLowerCase())) || 0;
          const planText = rest.splice(0, planWords).join(" ").toLowerCase();
          const plan = planWords ? PLAN_IDS.find((p) => p.toLowerCase() === planText) : undefined;
          const why = rest.join(" ").trim();
          if (!why) { print("error", "Gib einen Grund an – er landet im Audit-Log."); return; }
          const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/plan/extend`, { days, plan, reason: why });
          print("ok", `${u.displayName} ist bis ${fmt(r.renewsAt)} auf ${r.plan} (${r.days} Tage gutgeschrieben).`);
          return;
        }
        case "unplan": {
          if (!need(2)) return; const u = await resolveUser(args[0]); if (!u) return;
          const why = args.slice(1).join(" ").trim();
          S.console.pendingText = `Den von Hand vergebenen Tarif von ${u.displayName} entfernen? Grund: ${why}`;
          S.console.pending = async () => {
            const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/plan/remove`, { reason: why });
            print("ok", `${u.displayName} ist wieder auf ${r.plan} (${r.removed} entfernt).`);
          };
          renderConsole(); return;
        }
        case "credit": {
          if (!need(3)) return;
          const cents = parseEuroCents(args[1]);
          if (cents === undefined) { print("error", `Der Betrag ist in Euro, höchstens zwei Nachkommastellen und höchstens 500: 5, 2,50, -1. Aufruf: ${cmd[2]}`); return; }
          const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/ai-credit`, { cents, reason: args.slice(2).join(" ") });
          print("ok", `${u.displayName} hat jetzt ${euro(r.creditCents)} KI-Guthaben.`);
          return;
        }
        case "uncredit": {
          if (!need(2)) return;
          const amount = args.length > 2 ? parseEuroCents(args[1]) : undefined;
          if (amount !== undefined && amount < 0) { print("error", "Der Betrag zum Zurücknehmen ist positiv: 5, 2,50."); return; }
          const why = args.slice(amount !== undefined ? 2 : 1).join(" ");
          const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("POST", `/admin/users/${encodeURIComponent(u.id)}/ai-credit/remove`, { cents: amount, reason: why });
          print("ok", `${euro(r.removedCents)} entfernt – ${u.displayName} hat jetzt ${euro(r.creditCents)} KI-Guthaben.`);
          return;
        }
        case "unlock": {
          if (!need(2)) return;
          const design = args[1].toLowerCase();
          if (!isDesign(design)) { print("error", unknownDesign()); return; }
          if (args.length < 3) { print("error", "Bitte einen Grund angeben: unlock <Konto> <Design> <Grund>."); return; }
          const why = args.slice(2).join(" ");
          const r = await designRpc("admin_design_unlock", { p_account: args[0], p_design: design, p_on: true, p_reason: why });
          const who = accountLabel(r, args[0]);
          print("ok", r.changed ? `${DESIGNS[design]} für ${who} freigeschaltet.` : `${who} hat ${DESIGNS[design]} bereits.`);
          return;
        }
        case "lock": {
          if (!need(2)) return;
          const design = args[1].toLowerCase();
          if (!isDesign(design)) { print("error", unknownDesign()); return; }
          const term = args[0], why = args.slice(2).join(" ").trim();
          S.console.pendingText = `${DESIGNS[design]} für ${term} zurücknehmen`;
          S.console.pending = async () => {
            const r = await designRpc("admin_design_unlock", { p_account: term, p_design: design, p_on: false, p_reason: why });
            const who = accountLabel(r, term);
            print("ok", r.changed ? `${DESIGNS[design]} für ${who} zurückgenommen.` : `${who} hat ${DESIGNS[design]} nicht freigeschaltet.`);
          };
          renderConsole(); return;
        }
        case "unlocks": {
          if (!need(1)) return;
          const r = await designRpc("admin_design_unlocks", { p_account: args[0] });
          const who = accountLabel(r, args[0]);
          const designs = Array.isArray(r.designs) ? r.designs : [];
          print("info", designs.length ? `${who}: ${designNames(designs)}` : `${who} hat keine exklusiven Designs freigeschaltet.`);
          return;
        }
        case "alts": { if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const r = await api("GET", `/admin/users/${encodeURIComponent(u.id)}/linked`);
          print("info", `${u.displayName} nutzte (letzte 90 Tage): Geräte ${r.devices.length} · Netzwerke ${r.ips.length}`);
          if (!r.accounts.length) { print("ok", "Kein anderes Konto hat dasselbe Gerät oder Netzwerk genutzt."); return; }
          print("info", "Andere Konten auf demselben Gerät oder Netzwerk:");
          for (const a of r.accounts) {
            print("info", `  ${a.displayName || a.email} · ${a.email}${a.handle ? ` · @${a.handle}` : ""} · ${(a.via || []).map((v) => (v === "device" ? "Gerät" : "Netzwerk")).join(" + ")}${a.banned ? " · gesperrt" : ""}`);
            for (const s of a.sharedIps || []) print("info", `      Netzwerk ${s.ip} · dort angemeldet ${stamp(s.at)}`);
          }
          print("info", "Netzwerk zählt nur, wenn beide es innerhalb von 24 Stunden genutzt haben. Auch dann kann es ein Büro oder Haushalt sein; ein geteiltes Gerät sagt mehr.");
          return; }
        case "reports": { const { reports } = await api("GET", "/admin/reports?status=open");
          if (!reports.length) { print("ok", "Keine offenen Meldungen."); return; }
          for (const r of reports) print("info", `${r.targetType}: ${r.targetLabel || r.targetId} · ${r.reason} · von ${r.reporter || "?"} · ${ago(r.createdAt)}`);
          print("info", "Erledigen unter „Meldungen“."); return; }
        case "note": { if (!need(1)) return; const u = await resolveUser(args[0]); if (!u) return;
          const text = args.slice(1).join(" ").trim();
          if (text) { await api("POST", `/admin/users/${encodeURIComponent(u.id)}/notes`, { body: text }); print("ok", `Notiz zu ${u.displayName} hinzugefügt. Nur Staff sieht sie.`); return; }
          const { notes } = await api("GET", `/admin/users/${encodeURIComponent(u.id)}/notes`);
          if (!notes.length) { print("info", `Noch keine Notizen zu ${u.displayName}. Hinzufügen mit: note ${args[0]} <Text>`); return; }
          print("info", `Notizen zu ${u.displayName} (${notes.length}):`);
          for (const n of notes) print("info", `  ${fmt(n.createdAt)} · ${n.author ? n.author.displayName : "Staff"}: ${n.body}`);
          return; }
        case "audit": {
          let path = "/admin/audit", label = "Letzte Audit-Einträge:";
          if (args[0]) { const u = await resolveUser(args[0]); if (!u) return; path += q({ target: u.id }); label = `Audit-Einträge zu ${u.displayName}:`; }
          const { entries } = await api("GET", path);
          if (!entries.length) { print("info", "Keine Audit-Einträge."); return; }
          print("info", label);
          for (const a of entries.slice(0, 25)) print("info", `  ${fmt(a.createdAt)} · ${a.action} · ${a.actor || a.actorEmail || "System"} → ${a.target || ""}${a.reason ? ` · ${a.reason}` : ""}`);
          return;
        }
        default: return;
      }
    } catch (err) { print("error", reason(err)); }
  }

  // ---------- Projekte (nach Inhaber) ----------
  // Wie gewünscht nicht jedes Projekt einzeln: zuerst die Inhaber mit Anzahl, ein Klick zeigt
  // die Projekte dieser Person mit den Aktionen (Archivieren, Löschen, Wiederherstellen).
  const ownerKey = (x) => x.ownerEmail || x.owner || "?";
  function groupByOwner(list) {
    const m = new Map();
    for (const x of list) { const k = ownerKey(x); if (!m.has(k)) m.set(k, { key: k, owner: x.owner || "(ohne Namen)", email: x.ownerEmail || "", items: [] }); m.get(k).items.push(x); }
    return [...m.values()].sort((a, b) => b.items.length - a.items.length || a.owner.localeCompare(b.owner));
  }
  function ownerList(groups, open, filter, unit) {
    const f = (filter || "").toLowerCase();
    const rows = groups.filter((g) => !f || [g.owner, g.email, ...g.items.map((i) => i.name)].some((v) => String(v || "").toLowerCase().includes(f)));
    return rows.length ? `<ul class="xa-owners">${rows.map((g) => `<li><button data-owner="${esc(g.key)}" aria-expanded="${open === g.key}"><span class="admin-avatar">${esc(initials(g.owner))}</span><span class="xa-owner-name"><b>${esc(g.owner)}</b><small>${esc(g.email)}</small></span><span class="xa-owner-count">${num(g.items.length)} ${esc(g.items.length === 1 ? unit[0] : unit[1])}</span><i aria-hidden="true">${open === g.key ? "▾" : "▸"}</i></button></li>`).join("")}</ul>` : "";
  }
  loaders.projects = async () => {
    const p = panel("projects");
    p.innerHTML = `${head("AUFSICHT", "Projekte", "Alle Projekte, nach Inhaber gruppiert. Eine Person anklicken zeigt ihre Projekte; archivieren, löschen oder wiederherstellen – jede Aktion mit Grund im Audit-Log.")}
      <div class="admin-filters"><label class="admin-search">Inhaber oder Projekt filtern<input type="search" data-filter placeholder="Name, E-Mail, Projekt …"></label></div><div data-list>${loading()}</div>`;
    let open = "";
    const render = () => {
      const groups = groupByOwner(S.projects);
      const list = ownerList(groups, open, p.querySelector("[data-filter]").value, ["Projekt", "Projekte"]);
      p.querySelector("[data-list]").innerHTML = list || empty(S.projects.length ? "Niemand passt zum Filter." : "Noch keine Projekte.");
      const g = groups.find((x) => x.key === open); if (!g) return;
      const li = p.querySelector(`[data-owner="${CSS.escape(open)}"]`)?.closest("li"); if (!li) return;
      li.insertAdjacentHTML("beforeend", `<div class="xa-owner-items">${table(["Projekt", "Arbeitsbereich", "Status", "Erstellt", "Aktionen"], g.items.map((x) => `<tr>
        <td><b>${esc(x.name || "Ohne Titel")}</b></td><td>${esc(x.workspaceName)}</td>
        <td>${x.deleted ? pill("Gelöscht", "danger") : x.archived ? pill("Archiviert", "warn") : pill(x.status || "Aktiv", "ok")}</td><td><small>${esc(day(x.createdAt))}</small></td>
        <td><div class="row-actions">${can("content.moderate") ? (x.deleted ? `<button data-act="restore" data-id="${esc(x.id)}">Wiederherstellen</button>` : `${x.archived ? `<button data-act="unarchive" data-id="${esc(x.id)}">Aus Archiv holen</button>` : `<button data-act="archive" data-id="${esc(x.id)}">Archivieren</button>`}<button class="admin-danger" data-act="delete" data-id="${esc(x.id)}">Löschen</button>`) : ""}</div></td></tr>`).join(""))}</div>`);
    };
    p.querySelector("[data-filter]").addEventListener("input", render);
    p.querySelector("[data-list]").addEventListener("click", async (e) => {
      const o = e.target.closest("[data-owner]"); if (o) { open = open === o.dataset.owner ? "" : o.dataset.owner; render(); return; }
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const x = S.projects.find((y) => y.id === b.dataset.id); if (!x) return;
      const L = { archive: ["archivieren", "Archivieren"], unarchive: ["aus dem Archiv holen", "Aus Archiv holen"], delete: ["löschen", "Löschen"], restore: ["wiederherstellen", "Wiederherstellen"] };
      const [verb, confirm] = L[b.dataset.act];
      const a = await ask({ title: `„${x.name}“ ${verb}`, text: b.dataset.act === "delete" ? "Das Projekt wird für Mitglieder unsichtbar; es kann wiederhergestellt werden." : "", danger: b.dataset.act === "delete", confirm, fields: [{ name: "reason", label: "Grund", type: "textarea" }] }); if (!a) return;
      try { await api("POST", `/admin/projects/${encodeURIComponent(x.id)}/action`, { action: b.dataset.act, reason: a.reason }); say("projects", `„${x.name}“: ${verb} erledigt.`); S.projects = (await api("GET", "/admin/projects")).projects; render(); loadCounts(); }
      catch (err) { say("projects", reason(err), false); }
    });
    try { S.projects = (await api("GET", "/admin/projects")).projects; render(); }
    catch (err) { p.querySelector("[data-list]").innerHTML = empty(reason(err)); }
  };

  // ---------- Arbeitsbereiche (nach Inhaber) ----------
  loaders.workspaces = async () => {
    const p = panel("workspaces");
    p.innerHTML = `${head("AUFSICHT", "Arbeitsbereiche", "Alle Arbeitsbereiche, nach Inhaber gruppiert. Eine Person anklicken zeigt ihre Arbeitsbereiche; „Mitglieder“ klappt die Mitgliederliste auf.")}
      <div class="admin-filters"><label class="admin-search">Inhaber oder Arbeitsbereich filtern<input type="search" data-filter placeholder="Name, E-Mail, Arbeitsbereich …"></label></div><div data-list>${loading()}</div>`;
    let open = "";
    const render = () => {
      const groups = groupByOwner(S.workspaces.list);
      const list = ownerList(groups, open, p.querySelector("[data-filter]").value, ["Arbeitsbereich", "Arbeitsbereiche"]);
      p.querySelector("[data-list]").innerHTML = list || empty(S.workspaces.list.length ? "Niemand passt zum Filter." : "Noch keine Arbeitsbereiche.");
      const g = groups.find((x) => x.key === open); if (!g) return;
      const li = p.querySelector(`[data-owner="${CSS.escape(open)}"]`)?.closest("li"); if (!li) return;
      li.insertAdjacentHTML("beforeend", `<div class="xa-owner-items">${table(["Arbeitsbereich", "Typ", "Mitglieder", "Projekte", "Elemente", "Speicher", "Aktionen"], g.items.map((x) => {
        const members = S.workspaces.members.get(x.id);
        return `<tr><td><b>${esc(x.name || "Ohne Titel")}</b>${x.archived ? ` ${pill("Archiviert", "warn")}` : ""}<br><small>seit ${esc(day(x.createdAt))}</small></td><td>${esc(x.type || "")}</td>
          <td><button data-members="${esc(x.id)}" aria-expanded="${S.workspaces.open === x.id}">${num(x.memberCount)} Mitglieder</button></td><td>${num(x.projectCount)}</td><td>${num(x.itemCount)}</td><td>${esc(bytes(x.storageBytes))}</td>
          <td><div class="row-actions">${can("content.moderate") ? (x.archived ? `<button data-act="restore" data-id="${esc(x.id)}">Wiederherstellen</button>` : `<button data-act="archive" data-id="${esc(x.id)}">Archivieren</button>`) : ""}${can("workspaces.delete") && x.archived ? `<button class="admin-danger" data-act="purge" data-id="${esc(x.id)}">Endgültig löschen</button>` : ""}</div></td></tr>
          ${S.workspaces.open === x.id ? `<tr class="xa-subrow"><td colspan="7">${members === undefined ? loading("Mitglieder werden geladen …") : members.length ? `<ul class="xa-list xa-list-plain xa-list-inline">${members.map((m) => `<li><div><b>${esc(m.displayName)}</b><small>${esc(m.email)} · ${esc(m.role)} · seit ${esc(day(m.joinedAt))}</small></div></li>`).join("")}</ul>` : empty("Keine Mitglieder geladen.")}</td></tr>` : ""}`;
      }).join(""))}</div>`);
    };
    p.querySelector("[data-filter]").addEventListener("input", render);
    p.querySelector("[data-list]").addEventListener("click", async (e) => {
      const o = e.target.closest("[data-owner]"); if (o) { open = open === o.dataset.owner ? "" : o.dataset.owner; render(); return; }
      const mb = e.target.closest("[data-members]");
      if (mb) {
        const id = mb.dataset.members;
        S.workspaces.open = S.workspaces.open === id ? "" : id; render();
        if (S.workspaces.open && !S.workspaces.members.has(id)) {
          try { S.workspaces.members.set(id, (await api("GET", `/admin/workspaces/${encodeURIComponent(id)}/members`)).members); } catch { S.workspaces.members.set(id, []); }
          render();
        }
        return;
      }
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const x = S.workspaces.list.find((y) => y.id === b.dataset.id); if (!x) return;
      try {
        if (b.dataset.act === "purge") {
          const a = await ask({ title: "Arbeitsbereich endgültig löschen", text: `„${x.name}“ wird mit allen Projekten, Aufgaben, Dateien, Chats und Mitgliedschaften gelöscht (${num(x.memberCount)} Mitglieder, ${num(x.projectCount)} Projekte). Das lässt sich nicht rückgängig machen.`, danger: true, confirm: "Endgültig löschen",
            fields: [{ name: "confirmName", label: `Zur Bestätigung den Namen eingeben: ${x.name}`, required: true }, { name: "reason", label: "Grund", type: "textarea", required: true }] }); if (!a) return;
          const r = await api("POST", `/admin/workspaces/${encodeURIComponent(x.id)}/delete`, { confirmName: a.confirmName, reason: a.reason });
          say("workspaces", `„${x.name}“ gelöscht: ${num(r.removed.members)} Mitgliedschaften, ${num(r.removed.projects)} Projekte, ${num(r.removed.files)} Dateien.`);
        } else {
          const archive = b.dataset.act === "archive";
          const a = await ask({ title: archive ? "Arbeitsbereich archivieren" : "Arbeitsbereich wiederherstellen", text: archive ? `„${x.name}“ archivieren? Mitglieder verlieren den Zugriff, bis er wiederhergestellt wird.` : `„${x.name}“ für seine Mitglieder wiederherstellen?`, confirm: archive ? "Archivieren" : "Wiederherstellen", fields: [{ name: "reason", label: "Grund", type: "textarea" }] }); if (!a) return;
          await api("POST", `/admin/workspaces/${encodeURIComponent(x.id)}/action`, { action: b.dataset.act, reason: a.reason });
          say("workspaces", `„${x.name}“ ${archive ? "archiviert" : "wiederhergestellt"}.`);
        }
        S.workspaces.list = (await api("GET", "/admin/workspaces")).workspaces; render(); loadCounts();
      } catch (err) { say("workspaces", reason(err), false); }
    });
    try { S.workspaces.list = (await api("GET", "/admin/workspaces")).workspaces; render(); }
    catch (err) { p.querySelector("[data-list]").innerHTML = empty(reason(err)); }
  };

  // ---------- Gesprächsverlauf (Support-Freigabe, Notfallzugriff) ----------
  function messageList(messages, highlightId = "") {
    return messages.length ? `<ol class="xa-thread">${messages.map((m) => `<li class="${m.id === highlightId ? "is-reported" : ""} ${m.deletedAt || m.deleted ? "is-deleted" : ""}"><b>${esc(m.author || "?")}</b><small>${esc(fmt(m.createdAt || m.ts || m.time))}${m.deletedAt || m.deleted ? " · gelöscht" : ""}${m.kind && m.kind !== "text" ? ` · ${esc(m.kind)}` : ""}</small><p>${esc(m.body || (m.gif ? "GIF" : ""))}</p></li>`).join("")}</ol>` : empty("Keine Nachrichten in diesem Fenster.");
  }
  async function openThread(conversationId) {
    try {
      const r = await api("GET", `/admin/conversations/${encodeURIComponent(conversationId)}/thread?limit=40`);
      const via = r.via === "emergency" ? "Notfallzugriff" : r.via === "consent" ? "vom Mitglied geteilt" : r.via === "report" ? "gemeldete Nachricht" : r.via || "";
      modal(r.conversation.title || "Gespräch", `<p class="hint">Zugriff: ${esc(via)} · bis ${esc(fmt(r.grant.expiresAt))}${r.grant.reason ? ` · Grund: ${esc(r.grant.reason)}` : ""}. Jeder Aufruf wird im Audit-Log festgehalten.</p>
        <p><small>Mitglieder: ${r.members.map((m) => esc(m.displayName)).join(", ")}</small></p>${messageList(r.messages)}${r.hasMore ? '<p class="hint">Ältere Nachrichten gibt es in der App.</p>' : ""}`);
    } catch (err) { modal("Gespräch", empty(reason(err))); }
  }

  // ---------- Support ----------
  // Die Ticket-Warteschlange liegt in admin-support.js (meldet sich über register() an).
  async function emergencyAccess(conversationId, after, notify) {
    const tell = notify || ((text, ok = true) => { say("support", text, ok); if (!ok) say("access", text, false); });
    const a = await ask({ title: "Notfallzugriff auf ein privates Gespräch", text: "Nur für den Ernstfall: Der Zugriff ist zeitlich begrenzt, braucht einen Grund, wird allen Mitgliedern des Gesprächs angezeigt und vollständig protokolliert.", danger: true, confirm: "Zugriff gewähren",
      fields: [{ name: "reason", label: "Grund (mindestens 10 Zeichen)", type: "textarea", required: true }, { name: "durationMinutes", label: "Dauer", type: "select", options: [["30", "30 Minuten"], ["60", "1 Stunde"], ["240", "4 Stunden"], ["1440", "24 Stunden"]] }] });
    if (!a) return;
    try {
      const r = await api("POST", `/admin/conversations/${encodeURIComponent(conversationId)}/emergency-access`, { reason: a.reason, durationMinutes: Number(a.durationMinutes) });
      tell(r.grant.alreadyActive ? `Du hast bereits Zugriff bis ${fmt(r.grant.expiresAt)}.` : `Notfallzugriff gewährt bis ${fmt(r.grant.expiresAt)}.`);
      if (after) after();
    } catch (err) { tell(reason(err), false); }
  }

  // ---------- Meldungen ----------
  const R_TYPE = { user: "Konto", message: "Nachricht", project: "Projekt", community: "Community", workspace: "Arbeitsbereich", website: "Website-Formular" };
  loaders.reports = async () => {
    const p = panel("reports");
    p.innerHTML = `${head("MODERATION", "Meldungen", "Von Mitgliedern eingereichte Meldungen. Offene erledigen – der Grund landet im Audit-Log.")}
      <div class="card-filters">${[["open", "Offen"], ["resolved", "Erledigt"], ["dismissed", "Verworfen"], ["all", "Alle"]].map(([k, l]) => `<button data-rs="${k}" aria-pressed="${S.reports.status === k}">${l}</button>`).join("")}</div><div data-list>${loading()}</div>`;
    p.querySelectorAll("[data-rs]").forEach((b) => b.addEventListener("click", () => { S.reports.status = b.dataset.rs; loaders.reports(); }));
    p.querySelector("[data-list]").addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      const r = S.reports.list.find((x) => x.id === b.dataset.id); if (!r) return;
      if (b.dataset.act === "context") {
        try {
          const c = await api("GET", `/admin/reports/${encodeURIComponent(r.id)}/context`);
          modal(`Gemeldete Nachricht im Zusammenhang`, `<p class="hint">Begrenztes Fenster um die gemeldete Nachricht – nie das ganze Gespräch. Der Aufruf wird im Audit-Log festgehalten.</p><p><small>${esc(c.conversation.title || "Gespräch")}</small></p>${messageList(c.messages, c.reportedMessageId)}`);
        } catch (err) { say("reports", reason(err), false); }
        return;
      }
      const L = { dismiss: ["Meldung verwerfen", "Verwerfen", false], done: ["Meldung erledigen", "Erledigt", false], warn: ["Konto verwarnen", "Verwarnen", false], ban: ["Konto sperren", "Sperren", true], remove: ["Inhalt entfernen", "Entfernen", true] };
      const [title, confirmLabel, danger] = L[b.dataset.act];
      const warn = b.dataset.act === "warn";
      const a = await ask({ title, text: `${R_TYPE[r.targetType] || r.targetType}: ${r.targetLabel || r.targetId} · gemeldet wegen „${r.reason}“`, danger, confirm: confirmLabel,
        fields: [{ name: "reason", label: warn ? "Grund (geht an die Person)" : "Begründung", type: "textarea", required: b.dataset.act !== "dismiss" }, ...(warn ? STRIKE_FIELDS : [])] }); if (!a) return;
      if (warn && a.grade === "C" && !a.mild && !confirm(`${r.targetLabel || "Das Konto"} wird dauerhaft gesperrt. Fortfahren?`)) return;
      try { const res = await api("POST", `/admin/reports/${encodeURIComponent(r.id)}/resolve`, { action: b.dataset.act, reason: a.reason, ...(warn ? strikeBody(a) : {}) }); say("reports", warn ? strikeResult(r.targetLabel || "Das Konto", res) : `Meldung erledigt: ${confirmLabel.toLowerCase()}.`); await loaders.reports(); loadCounts(); }
      catch (err) { say("reports", reason(err), false); }
    });
    try {
      S.reports.list = (await api("GET", `/admin/reports?status=${S.reports.status}`)).reports;
      const L = S.reports.list;
      p.querySelector("[data-list]").innerHTML = L.length ? `<div class="xa-reports">${L.map((r) => `<article class="xa-card xa-report">
        <div class="xa-card-head"><div><b>${esc(R_TYPE[r.targetType] || r.targetType)}: ${esc(r.targetLabel || r.targetId)}</b><br><small>${r.targetType === "website" ? "über das Formular in den Community-Richtlinien" : `gemeldet von ${esc(r.reporter || "?")} (${esc(r.reporterEmail || "")})`} · ${esc(fmt(r.createdAt))}</small></div>${r.status === "open" ? pill("Offen", "warn") : r.status === "resolved" ? pill(`Erledigt: ${r.resolution || ""}`, "ok") : pill("Verworfen")}</div>
        <p><b>${esc(r.reason)}</b>${r.details ? `<br><span class="xa-pre">${esc(r.details)}</span>` : ""}</p>
        ${r.resolver ? `<small>Bearbeitet von ${esc(r.resolver)} · ${esc(fmt(r.resolvedAt))}</small>` : ""}
        <div class="row-actions">
          ${r.targetType === "message" && can("view_reported_messages") ? `<button data-act="context" data-id="${esc(r.id)}">Im Zusammenhang ansehen</button>` : ""}
          ${r.status === "open" && can("reports.handle") ? `<button data-act="dismiss" data-id="${esc(r.id)}">Verwerfen</button>${r.targetType === "user" ? `<button data-act="warn" data-id="${esc(r.id)}">Verwarnen</button><button class="admin-danger" data-act="ban" data-id="${esc(r.id)}">Konto sperren</button>` : r.targetType === "website" ? `<button data-act="done" data-id="${esc(r.id)}">Erledigt</button>` : `<button class="admin-danger" data-act="remove" data-id="${esc(r.id)}">Inhalt entfernen</button>`}` : ""}
        </div></article>`).join("")}</div>`
        : empty({ open: "Keine offenen Meldungen. Die Warteschlange ist leer.", resolved: "Keine erledigten Meldungen.", dismissed: "Keine verworfenen Meldungen.", all: "Noch keine Meldungen." }[S.reports.status]);
    } catch (err) { p.querySelector("[data-list]").innerHTML = empty(reason(err)); }
  };

  // ---------- Nachrichtenzugriff ----------
  loaders.access = async () => {
    const p = panel("access");
    p.innerHTML = `${head("TRANSPARENZ", "Nachrichtenzugriff", "Private Gespräche sind standardmäßig nur für Mitglieder. Jeder Weg für Staff hinein – eine Support-Freigabe, eine gemeldete Nachricht oder ein Notfallzugriff – steht hier und im Audit-Log.")}
      <div class="card-filters"><button data-as="active" aria-pressed="${S.access.scope === "active"}">Aktiv</button><button data-as="all" aria-pressed="${S.access.scope === "all"}">Alle (auch abgelaufene)</button></div>
      <div data-list>${loading()}</div>
      ${can("oversight.view") ? `<h3 class="xa-h3">Gespräche</h3><p class="hint">Alle Gespräche der Plattform – ohne Inhalte. ${can("emergency_message_access") ? "Ein Notfallzugriff ist zeitlich begrenzt, braucht einen Grund und wird den Mitgliedern angezeigt." : ""}</p><div class="admin-filters"><label class="admin-search">Gespräche filtern<input type="search" data-cfilter placeholder="Titel, Ersteller …"></label></div><div data-convs>${loading()}</div>` : ""}`;
    p.querySelectorAll("[data-as]").forEach((b) => b.addEventListener("click", () => { S.access.scope = b.dataset.as; loaders.access(); }));
    if (!p.dataset.bound) p.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-act]"); if (!b) return;
      if (b.dataset.act === "thread") return openThread(b.dataset.conv);
      if (b.dataset.act === "emergency") return emergencyAccess(b.dataset.conv, () => loaders.access());
      if (b.dataset.act === "revoke") {
        const a = await ask({ title: "Zugriff beenden", text: "Der Zugriff endet sofort; die Mitglieder des Gesprächs sehen das.", confirm: "Zugriff beenden" }); if (!a) return;
        try { await api("POST", `/admin/message-access/${encodeURIComponent(b.dataset.id)}/revoke`, {}); say("access", "Zugriff beendet."); loaders.access(); }
        catch (err) { say("access", reason(err), false); }
      }
    });
    p.dataset.bound = "1";
    try {
      const { grants } = await api("GET", `/admin/message-access${q({ scope: S.access.scope })}`);
      S.access.grants = grants;
      const K = { emergency: ["Notfallzugriff", "danger"], consent: ["Support-Freigabe", "accent"], report: ["Meldung", "warn"] };
      p.querySelector("[data-list]").innerHTML = grants.length ? table(["Gespräch", "Art", "Für", "Grund", "Gültig", "Zugriffe", "Aktionen"], grants.map((g) => `<tr>
        <td><b>${esc(g.conversationTitle || g.conversationId)}</b><br><small>${esc(g.conversationKind || "")}${g.ticketSubject ? ` · Ticket: ${esc(g.ticketSubject)}` : ""}</small></td>
        <td>${pill((K[g.kind] || [g.kind])[0], (K[g.kind] || [])[1])}</td>
        <td>${esc(g.grantee || "Support-Team")}<br><small>freigegeben von ${esc(g.grantedBy || "?")}</small></td><td><small>${esc(g.reason || "")}</small></td>
        <td><small>${esc(fmt(g.createdAt))} – ${esc(fmt(g.expiresAt))}${g.revokedAt ? `<br>beendet ${esc(fmt(g.revokedAt))}${g.revokedBy ? ` von ${esc(g.revokedBy)}` : ""}` : ""}</small> ${g.active ? pill("aktiv", "ok") : ""}</td>
        <td>${num(g.accessCount)}${g.lastAccessedAt ? `<br><small>zuletzt ${esc(ago(g.lastAccessedAt))}</small>` : ""}</td>
        <td><div class="row-actions">${g.active ? `<button data-act="thread" data-conv="${esc(g.conversationId)}">Gespräch öffnen</button><button class="admin-danger" data-act="revoke" data-id="${esc(g.id)}">Zugriff beenden</button>` : ""}</div></td></tr>`).join(""))
        : empty(S.access.scope === "active" ? "Keine aktiven Zugriffe – kein Staff-Mitglied kann gerade ein privates Gespräch lesen." : "Es wurde noch nie ein Zugriff erteilt.");
    } catch (err) { p.querySelector("[data-list]").innerHTML = empty(reason(err)); }
    if (can("oversight.view")) {
      const render = () => {
        const f = (p.querySelector("[data-cfilter]").value || "").toLowerCase();
        const rows = S.conversations.filter((c) => !f || [c.title, c.creator, c.creatorEmail, c.kind].some((v) => String(v || "").toLowerCase().includes(f)));
        p.querySelector("[data-convs]").innerHTML = rows.length ? table(["Gespräch", "Art", "Erstellt von", "Mitglieder", "Nachrichten", "Erstellt", "Aktionen"], rows.slice(0, 100).map((c) => `<tr><td><b>${esc(c.title || "Ohne Titel")}</b><br><small><code>${esc(c.id)}</code></small></td><td>${esc(c.kind)}</td><td>${esc(c.creator)}<br><small>${esc(c.creatorEmail)}</small></td><td>${num(c.memberCount)}</td><td>${num(c.messageCount)}</td><td><small>${esc(day(c.createdAt))}</small></td><td>${can("emergency_message_access") ? `<button data-act="emergency" data-conv="${esc(c.id)}">Notfallzugriff …</button>` : ""}</td></tr>`).join("")) + (rows.length > 100 ? `<p class="hint">${num(rows.length - 100)} weitere – Filter eingrenzen.</p>` : "") : empty("Keine Gespräche.");
      };
      p.querySelector("[data-cfilter]").addEventListener("input", render);
      try { S.conversations = (await api("GET", "/admin/conversations")).conversations; render(); }
      catch (err) { p.querySelector("[data-convs]").innerHTML = empty(reason(err)); }
    }
  };

  // ---------- Sicherheit (nach Nutzer) ----------
  // Kennzahlen oben; darunter jede Person mit ihren Anmeldeereignissen. Ein Klick zeigt alles
  // zu diesem Konto: Ereignisse, aktive Sitzungen, 2FA, Sperre. Fehlversuche ohne Konto
  // (unbekannte E-Mail) stehen als eigene Gruppe, die auffälligen IPs darunter.
  loaders.security = async () => {
    const p = panel("security");
    p.innerHTML = head("SICHERHEIT", "Sicherheit", "Anmeldesignale je Konto. Jeder Anmeldeversuch wird serverseitig festgehalten.", `<button data-act="refresh">Aktualisieren</button>`) + loading();
    p.querySelector('[data-act="refresh"]').addEventListener("click", loaders.security);
    try {
      const [r, { users }] = await Promise.all([api("GET", "/admin/security"), can("users.view") ? api("GET", "/admin/users") : Promise.resolve({ users: [] })]);
      const s = r.summary;
      const byUser = new Map();
      for (const u of users) byUser.set((u.email || "").toLowerCase(), { user: u, events: [] });
      const unknown = [];
      for (const e of r.events) { const g = byUser.get((e.email || "").toLowerCase()); if (g) g.events.push(e); else unknown.push(e); }
      const groups = [...byUser.values()].sort((a, b) => b.events.length - a.events.length || new Date(b.user.createdAt) - new Date(a.user.createdAt));
      const fails = (ev) => ev.filter((e) => e.type !== "login.success").length;
      let open = "";
      const eventRows = (ev) => ev.length ? table(["Ereignis", "IP", "Gerät", "Zeit"], ev.map((e) => `<tr><td>${pill(e.type, e.type === "login.success" ? "ok" : "warn")}</td><td><code>${esc(e.ip || "")}</code></td><td><small>${esc(e.device || "")}</small></td><td><small>${esc(fmt(e.createdAt))}</small></td></tr>`).join("")) : empty("Keine Anmeldeereignisse in den letzten 100 Einträgen.");
      const render = () => {
        const box = p.querySelector("[data-sec-list]");
        box.innerHTML = `<ul class="xa-owners">${groups.map((g) => { const u = g.user, f = fails(g.events); return `<li><button data-sec-user="${esc(u.id)}" aria-expanded="${open === u.id}"><span class="admin-avatar">${esc(initials(u.displayName))}</span><span class="xa-owner-name"><b>${esc(u.displayName)}</b><small>${esc(u.email)}</small></span><span class="xa-owner-count">${num(g.events.length)} Ereignisse${f ? ` · <em>${num(f)} fehlgeschlagen</em>` : ""} · ${num(u.activeSessions)} Sitzungen${u.banned ? " · gesperrt" : ""}</span><i aria-hidden="true">${open === u.id ? "▾" : "▸"}</i></button>${open === u.id ? `<div class="xa-owner-items" data-sec-detail>${loading("Konto wird geladen …")}</div>` : ""}</li>`; }).join("")}
          ${unknown.length ? `<li><button data-sec-user="unknown" aria-expanded="${open === "unknown"}"><span class="admin-avatar">?</span><span class="xa-owner-name"><b>Ohne Konto</b><small>Versuche mit unbekannter E-Mail</small></span><span class="xa-owner-count">${num(unknown.length)} Ereignisse</span><i aria-hidden="true">${open === "unknown" ? "▾" : "▸"}</i></button>${open === "unknown" ? `<div class="xa-owner-items">${eventRows(unknown)}</div>` : ""}</li>` : ""}</ul>`;
      };
      p.querySelector(".xa-loading").outerHTML = `<div class="xa-stats">${stat("Fehlgeschlagene Logins (24h)", num(s.fails24h), "", s.fails24h >= 10 ? "warn" : "")}${stat("Erfolgreiche Logins (24h)", num(s.success24h))}${stat("Gesperrte Konten", num(s.bannedUsers))}${stat("Konten mit 2FA", num(s.twoFactorUsers))}${stat("Aktive Sitzungen", num(s.activeSessions))}</div>
        <h3 class="xa-h3">Nach Konto</h3><div data-sec-list></div>
        <h3 class="xa-h3">Auffällige IP-Adressen</h3><p class="hint">Adressen mit wiederholt fehlgeschlagenen Versuchen in 24 Stunden – kann auf Brute-Force hindeuten.</p>
        ${r.suspiciousIps.length ? table(["IP-Adresse", "Versuche", "Letzter Versuch"], r.suspiciousIps.map((x) => `<tr><td><code>${esc(x.ip)}</code></td><td>${num(x.attempts)}</td><td><small>${esc(fmt(x.lastAt))}</small></td></tr>`).join("")) : empty("Keine auffälligen IPs – keine wiederholten Fehlversuche.")}`;
      render();
      p.querySelector("[data-sec-list]").addEventListener("click", async (e) => {
        const b = e.target.closest("[data-sec-user]"); if (!b) return;
        open = open === b.dataset.secUser ? "" : b.dataset.secUser; render();
        if (!open || open === "unknown") return;
        const g = byUser.get((groups.find((x) => x.user.id === open) || { user: {} }).user.email?.toLowerCase());
        const box = p.querySelector("[data-sec-detail]"); if (!g || !box) return;
        try {
          const d = await api("GET", `/admin/users/${encodeURIComponent(open)}`);
          const u = d.user;
          box.innerHTML = `<div class="xa-badges">${pill(roleLabel(u.staffRole), u.staffRole ? "accent" : "")}${pill(u.twoFactor ? "2FA an" : "2FA aus", u.twoFactor ? "ok" : "warn")}${u.banned ? pill(u.bannedUntil ? `Gesperrt bis ${fmt(u.bannedUntil)}` : "Gesperrt", "danger") : pill("Nicht gesperrt", "ok")}${u.verified ? pill("Verifiziert", "ok") : ""}</div>
            <div class="xa-cols"><section><h4>Aktive Sitzungen (${d.sessions.length})</h4>${d.sessions.length ? `<ul class="xa-list xa-list-plain">${d.sessions.map((x) => `<li><div><b>${esc(x.deviceName || "Gerät")}</b><small>${esc(x.ip || "")} · seit ${esc(fmt(x.createdAt))} · zuletzt ${esc(ago(x.lastSeenAt || x.createdAt))}</small></div></li>`).join("")}</ul>` : empty("Keine aktiven Sitzungen.")}</section>
            <section><h4>Verwarnungen (${d.warnings.length})</h4>${d.warnings.length ? `<ul class="xa-list xa-list-plain">${d.warnings.map((w) => `<li><div><b>${esc(w.reason)}</b><small>${esc(w.actor || "Staff")} · ${esc(fmt(w.createdAt))}</small></div></li>`).join("")}</ul>` : empty("Keine Verwarnungen.")}</section></div>
            <h4>Anmeldeereignisse</h4>${eventRows(g.events.length ? g.events : d.authEvents)}
            <div class="row-actions"><button data-goto-user="${esc(u.id)}">Konto unter „Nutzer“ öffnen</button></div>`;
        } catch (err) { box.innerHTML = empty(reason(err)); }
      });
      p.querySelector("[data-sec-list]").addEventListener("click", (e) => { const b = e.target.closest("[data-goto-user]"); if (!b) return; if (window.XyntalAdminPeople) window.XyntalAdminPeople.openApp(b.dataset.gotoUser); });
    } catch (err) { p.querySelector(".xa-loading").outerHTML = empty(reason(err)); }
  };

  // ---------- KI ----------
  loaders.ai = async () => {
    const p = panel("ai");
    p.innerHTML = head("KI", "KI", "Nutzung des KI-Proxys auf der ganzen Plattform. Token-Zahlen meldet das Modell bei jeder Antwort; Kosten sind, was jeder Aufruf zum Guthabenpreis gekostet hat.", `<button data-act="refresh">Aktualisieren</button>`) + loading();
    // Einzelne Aufrufe kosten Bruchteile eines Cents: kleine Beträge mit vier Nachkommastellen statt 0,00 €.
    const eur = (cents) => (cents === null || cents === undefined ? "–" : (cents / 100).toLocaleString("de-DE", { minimumFractionDigits: cents !== 0 && Math.abs(cents) < 1 ? 4 : 2, maximumFractionDigits: cents !== 0 && Math.abs(cents) < 1 ? 4 : 2 }) + " €");
    p.querySelector('[data-act="refresh"]').addEventListener("click", loaders.ai);
    try {
      const r = await api("GET", "/admin/ai");
      p.querySelector(".xa-loading").outerHTML = `${r.configured ? "" : '<div class="notice">Auf dem Server ist kein API-Schlüssel für den KI-Proxy hinterlegt – „KI fragen“ ist nicht verfügbar, es entsteht keine Nutzung.</div>'}
        <div class="xa-stats">${stat("Anfragen", num(r.totals.requests))}${stat("Eingabe-Tokens", num(r.totals.inputTokens))}${stat("Ausgabe-Tokens", num(r.totals.outputTokens))}${stat("Ablehnungen", num(r.totals.refusals), "", r.totals.refusals ? "warn" : "")}${stat("Berechnet diesen Monat", eur(r.totals.monthCents ?? 0))}${stat("Berechnet gesamt", eur(r.totals.costCents ?? 0))}${stat("Modellkosten (geschätzt)", eur(r.totals.modelCostCents ?? 0))}</div>
        <h3 class="xa-h3">Nutzung je Konto</h3>
        ${r.perUser.length ? table(["Konto", "Anfragen", "Tokens", "Diesen Monat", "Kosten", "Guthaben übrig", "Ablehnungen"], r.perUser.map((u) => `<tr><td>${esc(u.displayName || "Gelöschtes Konto")}<br><small>${esc(u.email || "")}</small></td><td>${num(u.requests)}</td><td>${num(u.tokens)}</td><td>${eur(u.monthCents ?? 0)}</td><td title="davon aus Guthaben: ${eur(u.creditPaidCents ?? 0)}"><b>${eur(u.costCents ?? 0)}</b></td><td>${eur(u.creditCents)}</td><td>${num(u.refusals)}</td></tr>`).join("")) : empty(r.configured ? "Noch keine KI-Nutzung." : "Keine Nutzung – der KI-Proxy ist nicht eingerichtet.")}
        <h3 class="xa-h3">Letzte Ablehnungen</h3>
        ${r.recentRefusals.length ? table(["Konto", "Zeit"], r.recentRefusals.map((u) => `<tr><td>${esc(u.displayName || "")}<br><small>${esc(u.email || "")}</small></td><td><small>${esc(fmt(u.createdAt))}</small></td></tr>`).join("")) : empty("Keine Ablehnungen.")}`;
    } catch (err) { p.querySelector(".xa-loading").outerHTML = empty(reason(err)); }
  };

  // ---------- Matching ----------
  loaders.matching = async () => {
    const p = panel("matching");
    p.innerHTML = head("MATCHING", "Matching", "Jede Match-Benachrichtigung, die der Durchlauf je verschickt hat, und was daraus wurde.", `<button data-act="refresh">Aktualisieren</button>`) + loading();
    p.querySelector('[data-act="refresh"]').addEventListener("click", loaders.matching);
    try {
      const { analytics: a } = await api("GET", "/admin/matching-analytics");
      const n = a.notifications, i = a.interactions;
      const max = Math.max(1, ...a.series14d.map((d) => d.n));
      p.querySelector(".xa-loading").outerHTML = `<div class="xa-stats">${stat("Verschickt", num(n.total))}${stat("Geöffnet", num(n.opened), `${n.ctr} % Klickrate`)}${stat("Verworfen", num(n.dismissed), `${n.dismissRate} % Verwerfrate`)}${stat("Noch ungesehen", num(n.byType.reduce((s, t) => s + t.unseen, 0)))}</div>
        <h3 class="xa-h3">Benachrichtigungen – letzte 14 Tage</h3>
        ${a.series14d.length ? `<ul class="xa-bars xa-bars-cols">${a.series14d.map((d) => `<li><i style="height:${Math.max(4, Math.round((d.n / max) * 100))}%" title="${esc(d.d)}: ${num(d.n)}"></i><span>${esc(d.d.slice(5))}</span><b>${num(d.n)}</b></li>`).join("")}</ul>` : empty("Noch keine Match-Benachrichtigungen – der Durchlauf läuft alle 15 Minuten und meldet nur oberhalb der Qualitätsschwelle.")}
        <h3 class="xa-h3">Nach Empfehlungstyp</h3>
        ${n.byType.length ? table(["Typ", "Verschickt", "Geöffnet", "Klickrate", "Verworfen", "Verwerfrate", "Ungesehen"], n.byType.map((t) => `<tr><td>${esc(t.type)}</td><td>${num(t.total)}</td><td>${num(t.opened)}</td><td>${t.ctr} %</td><td>${num(t.dismissed)}</td><td>${t.dismissRate} %</td><td>${num(t.unseen)}</td></tr>`).join("")) : empty("Noch nichts.")}
        <h3 class="xa-h3">Interaktionen</h3><p class="hint">Was Mitglieder auf den Matching-Flächen selbst getan haben – speichern, verwerfen, Gespräch beginnen (das Ehrlichste, was einer Conversion nahekommt).</p>
        <div class="xa-stats">${stat("Gespeichert (gesamt)", num(i.allTime.saved), `${num(i.last30d.saved)} in 30 Tagen`)}${stat("Verworfen (gesamt)", num(i.allTime.dismissed), `${num(i.last30d.dismissed)} in 30 Tagen`)}${stat("Kontaktiert (gesamt)", num(i.allTime.contacted), `${num(i.last30d.contacted)} in 30 Tagen`)}${stat("Angesehen (gesamt)", num(i.allTime.viewed))}</div>`;
    } catch (err) { p.querySelector(".xa-loading").outerHTML = empty(reason(err)); }
  };

  // ---------- Systemzustand ----------
  loaders.health = async () => {
    const p = panel("health");
    p.innerHTML = head("BETRIEB", "Systemzustand", "Echte Zahlen von Server, Datenbank und Speicher. Was noch nicht gemessen wird, steht als solches da.", `<button data-act="refresh">Aktualisieren</button><button data-act="ping">Verbindung testen</button>`) + loading();
    p.querySelector('[data-act="refresh"]').addEventListener("click", loaders.health);
    p.querySelector('[data-act="ping"]').addEventListener("click", async () => {
      const t0 = performance.now();
      try { await X.me(); say("health", `Verbindung zu ${X.API} steht – Antwort in ${Math.round(performance.now() - t0)} ms.`); }
      catch (err) { say("health", reason(err), false); }
    });
    try {
      const { health: h } = await api("GET", "/admin/health");
      const kv = (k, v) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`;
      p.querySelector(".xa-loading").outerHTML = `<div class="xa-cols">
        <section class="xa-card"><h3>Server</h3><ul class="xa-kv">${kv("Version", h.serverVersion)}${kv("Node", h.nodeVersion)}${kv("Läuft seit", duration(h.uptimeSeconds))}${kv("Adresse", X.API)}</ul></section>
        <section class="xa-card"><h3>Datenbank</h3><ul class="xa-kv">${kv("Größe", bytes(h.dbSizeBytes))}${kv("Journal", h.walMode)}${kv("Audit-Einträge", num(h.auditEntries))}</ul></section>
        <section class="xa-card"><h3>Speicher</h3><ul class="xa-kv">${kv("RSS", bytes(h.rssBytes))}${kv("Heap belegt", bytes(h.heapUsedBytes))}</ul></section>
        <section class="xa-card"><h3>Noch nicht gemessen</h3><p class="hint">Diese Teilsysteme sind noch nicht Teil der Plattform, deshalb gibt es nichts Echtes zu zeigen – sie stehen hier ehrlich statt mit Platzhalterzahlen.</p><ul class="xa-kv">${kv("Hintergrund-Warteschlangen", "–")}${kv("E-Mail-Zustellung", "–")}${kv("Antwortzeiten (p95)", "–")}</ul></section></div>`;
    } catch (err) { p.querySelector(".xa-loading").outerHTML = empty(reason(err)); }
  };

  // ---------- Feedback & Herkunft ----------
  // „Wie bist du auf uns aufmerksam geworden?“ und die Antworten auf „Wie hilfreich ist
  // Xyntal für dich?“ aus App und Website (GET /admin/feedback, users/feedback.ts im App-Server).
  const SOURCE_LABEL = {
    tiktok: "TikTok", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube", google: "Google-Suche",
    friend: "Freunde / Empfehlung", community: "Community / Event", other: "Sonstiges", skip: "Übersprungen", unanswered: "Noch nicht gefragt",
  };
  const FACE = ["", "😞", "🙁", "😐", "🙂", "😍"];
  loaders.feedback = async () => {
    const p = panel("feedback");
    p.innerHTML = `${head("COMMUNITY", "Feedback & Herkunft", "Woher neue Mitglieder kommen und wie hilfreich sie Xyntal finden – aus der App und von xyntal.de. Gefragt wird einmal nach der Herkunft, nach Feedback frühestens nach 7 Tagen und höchstens alle 30 Tage.")}<div data-list>${loading()}</div>`;
    const box = $("[data-list]", p);
    try {
      const d = await api("GET", "/admin/feedback");
      const total = d.referral.sources.reduce((n, s) => n + s.count, 0) || 1;
      const answered = d.referral.sources.filter((s) => s.source !== "unanswered" && s.source !== "skip");
      const c = document.getElementById("c-feedback"); if (c) c.textContent = d.feedback.count ? `(${d.feedback.count})` : "";
      box.innerHTML = `
        <div class="xa-cols">
          <section class="xa-card"><h3>Feedback</h3><ul class="xa-kv">
            <li><span>Antworten gesamt</span><b>${esc(num(d.feedback.count))}</b></li>
            <li><span>Durchschnitt</span><b>${d.feedback.average === null ? "–" : `${esc(String(d.feedback.average).replace(".", ","))} / 5`}</b></li>
            <li><span>Letzte 30 Tage</span><b>${esc(num(d.feedback.last30Days.count))}${d.feedback.last30Days.average === null ? "" : ` · Ø ${esc(String(d.feedback.last30Days.average).replace(".", ","))}`}</b></li>
          </ul></section>
          <section class="xa-card"><h3>Herkunft</h3>${answered.length || d.referral.sources.length ? `<ul class="xa-kv">${d.referral.sources.map((s) =>
            `<li><span>${esc(SOURCE_LABEL[s.source] || s.source)}</span><b>${esc(num(s.count))} <small>(${Math.round((s.count / total) * 100)} %)</small></b></li>`).join("")}</ul>` : empty("Noch keine Antworten.")}</section>
        </div>
        ${d.referral.others.length ? `<section class="xa-card"><h3>„Sonstiges“ im Wortlaut</h3><ul class="xa-list xa-list-plain">${d.referral.others.map((o) =>
          `<li><div><b>${esc(o.note)}</b><small>${esc(fmt(o.at))}</small></div></li>`).join("")}</ul></section>` : ""}
        <section class="xa-card"><h3>Letzte Antworten</h3>${d.feedback.recent.length ? `<ul class="xa-list xa-list-plain">${d.feedback.recent.map((f) =>
          `<li><div><b>${esc(FACE[f.rating] || "")} ${esc(String(f.rating))} / 5${f.comment ? ` – ${esc(f.comment)}` : ""}</b><small>${esc(f.displayName || f.email || "Mitglied")} · ${esc(f.surface === "app" ? "App" : "Website")} · ${esc(f.moment === "first_week" ? "nach der ersten Woche" : "monatlich")} · ${esc(fmt(f.createdAt))}</small></div></li>`).join("")}</ul>` : empty("Noch kein Feedback.")}</section>`;
    } catch (err) {
      box.innerHTML = empty(reason(err));
    }
  };

  // ---------- Ankündigungen ----------
  const A_KIND = { info: ["Hinweis", "accent"], warning: ["Warnung", "warn"], maintenance: ["Wartung", "danger"] };
  loaders.announcements = async () => {
    const p = panel("announcements");
    if (!p.querySelector("[data-ann-form]")) {
      p.innerHTML = `${head("KOMMUNIKATION", "Ankündigungen", "Banner für alle Mitglieder – in der Xyntal-App und auf xyntal.de – veröffentlichen und schalten, welche gerade live sind.")}
        <form class="xa-card xa-inline xa-ann-form" data-ann-form>
          <h3>Neue Ankündigung</h3>
          <label>Titel<input name="title" maxlength="160" required placeholder="Kurze Überschrift (Pflicht)"></label>
          <label>Text<textarea name="body" maxlength="2000" placeholder="Was sollen alle wissen?"></textarea></label>
          <div class="xa-row"><label>Art<select name="kind">${Object.entries(A_KIND).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join("")}</select></label>
          <label>Endet am (optional)<input name="endsAt" type="datetime-local"></label></div>
          <div class="row-actions"><button>Veröffentlichen</button><span class="hint">Erscheint sofort als Banner, bis du es ausblendest oder das Ende erreicht ist.</span></div>
        </form><div data-list>${loading()}</div>`;
      p.querySelector("[data-ann-form]").addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = e.target, endsAt = f.endsAt.value ? new Date(f.endsAt.value).toISOString() : "";
        try { await api("POST", "/admin/announcements", { title: f.title.value, body: f.body.value, kind: f.kind.value, endsAt }); say("announcements", "Ankündigung veröffentlicht."); f.reset(); await loadAnnouncements(); }
        catch (err) { say("announcements", reason(err), false); }
      });
      p.querySelector("[data-list]").addEventListener("click", async (e) => {
        const b = e.target.closest("button[data-act]"); if (!b) return;
        const a = S.announcements.find((x) => x.id === b.dataset.id); if (!a) return;
        try {
          if (b.dataset.act === "toggle") { await api("POST", `/admin/announcements/${encodeURIComponent(a.id)}/active`, { active: !a.active }); say("announcements", a.active ? "Ankündigung ausgeblendet." : "Ankündigung ist live."); }
          else { const ok = await ask({ title: "Ankündigung löschen", text: `„${a.title}“ endgültig löschen?`, danger: true, confirm: "Löschen" }); if (!ok) return; await api("DELETE", `/admin/announcements/${encodeURIComponent(a.id)}`); say("announcements", "Ankündigung gelöscht."); }
          await loadAnnouncements();
        } catch (err) { say("announcements", reason(err), false); }
      });
    }
    await loadAnnouncements();
  };
  async function loadAnnouncements() {
    const box = $("[data-list]", panel("announcements"));
    try {
      S.announcements = (await api("GET", "/admin/announcements")).announcements;
      const live = S.announcements.filter((a) => a.active && (!a.endsAt || new Date(a.endsAt) > new Date())).length;
      const c = document.getElementById("c-announcements"); if (c) c.textContent = live ? `(${live} live)` : "";
      box.innerHTML = `<h3 class="xa-h3">Veröffentlicht</h3>` + (S.announcements.length ? `<ul class="xa-announcements">${S.announcements.map((a) => {
        const over = a.endsAt && new Date(a.endsAt) <= new Date();
        return `<li class="xa-ann xa-ann-${esc(a.kind)}"><div><b>${esc(a.title)}</b> ${pill(A_KIND[a.kind] ? A_KIND[a.kind][0] : a.kind, A_KIND[a.kind] && A_KIND[a.kind][1])} ${a.active && !over ? pill("Live", "ok") : pill(over ? "Abgelaufen" : "Ausgeblendet")}${a.body ? `<p>${esc(a.body)}</p>` : ""}<small>${esc(a.author || "Staff")} · ${esc(fmt(a.createdAt))}${a.endsAt ? ` · endet ${esc(fmt(a.endsAt))}` : ""}</small></div>
          <div class="row-actions"><button data-act="toggle" data-id="${esc(a.id)}">${a.active ? "Ausblenden" : "Live schalten"}</button><button class="admin-danger" data-act="delete" data-id="${esc(a.id)}">Löschen</button></div></li>`;
      }).join("")}</ul>` : empty("Noch nichts veröffentlicht."));
    } catch (err) { box.innerHTML = empty(reason(err)); }
  }

  // ---------- Audit-Log ----------
  loaders.audit = async () => {
    const p = panel("audit");
    if (!p.querySelector("[data-audit-filters]")) {
      p.innerHTML = `${head("PROTOKOLL", "Audit-Log", "Nur anfügend: Jeder Eintrag ist dauerhaft – das Protokoll kann weder bearbeitet noch gelöscht werden.")}
        <div class="admin-filters" data-audit-filters><label>Aktion<select data-audit-action><option value="">Alle Aktionen</option>${["user.", "project.", "workspace.", "report.", "announcement.", "flag.", "access."].map((a) => `<option value="${a}" ${S.audit.action === a ? "selected" : ""}>${a}*</option>`).join("")}</select></label><label class="admin-search">Durchsuchen<input type="search" data-audit-q placeholder="Akteur, Ziel, Grund, IP …" value="${esc(S.audit.query)}"></label></div><div data-list>${loading()}</div>`;
      let timer;
      p.querySelector("[data-audit-action]").addEventListener("change", (e) => { S.audit.action = e.target.value; loadAudit(); });
      p.querySelector("[data-audit-q]").addEventListener("input", (e) => { clearTimeout(timer); S.audit.query = e.target.value; timer = setTimeout(loadAudit, 250); });
    }
    await loadAudit();
  };
  const show = (v) => (v === null || v === undefined || v === "" ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  async function loadAudit() {
    const box = $("[data-list]", panel("audit"));
    try {
      const { entries } = await api("GET", `/admin/audit${q({ action: S.audit.action, q: S.audit.query })}`);
      S.audit.entries = entries;
      box.innerHTML = entries.length ? `<div class="xa-audit">${table(["Wann", "Aktion", "Akteur", "Ziel", "Vorher → Nachher", "IP"], entries.map((a) => `<tr><td><small>${esc(fmt(a.createdAt))}</small></td><td><code>${esc(a.action)}</code></td><td>${esc(a.actor || "System")}<br><small>${esc(a.actorEmail || "")}</small></td><td><small><code>${esc(a.target || "")}</code></small>${a.reason ? `<br><small>Grund: ${esc(a.reason)}</small>` : ""}</td><td><small class="xa-pre">${esc(show(a.before))}${show(a.before) || show(a.after) ? " → " : ""}${esc(show(a.after))}${a.meta ? `<br>${esc(show(a.meta))}` : ""}</small></td><td><small><code title="${esc(a.ip || "")}">${esc(a.ip || "")}</code></small></td></tr>`).join(""))}</div>` : empty("Noch nichts.");
    } catch (err) { box.innerHTML = empty(reason(err)); }
  }

  boot();
})();
