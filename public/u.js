// Öffentliche Xyntal-Karte unter xyntal.de/name – zeigt nur, was die Person freigegeben hat
(() => {
  const root = document.querySelector("[data-profile]");
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  // Gesperrte Namen wie in supabase/016_account_cards.sql – nie als „noch frei“ anbieten
  const BLOCKED = new Set(["admin", "api", "app", "about", "beta", "bestaetigt", "blog", "datenschutz", "demo", "help", "hilfe", "impressum",
    "karte", "login", "logout", "mail", "meine-karte", "mitglieder", "mitglied-werden", "nachrichten", "news", "passwort-neu",
    "preise", "pricing", "profil", "projekte", "register", "settings", "signup", "support", "team", "warteliste", "www",
    "xyntal", "boerse", "community", "events"]);
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";

  // Name aus /name, /u#name oder /u?name=…
  let handle = location.pathname.replace(/^\/+|\/+$/g, "");
  if (!HANDLE.test(handle.toLowerCase()) || handle === "u") handle = (location.hash.slice(1) || new URLSearchParams(location.search).get("name") || "");
  try { handle = decodeURIComponent(handle).toLowerCase(); } catch { handle = ""; }
  if (HANDLE.test(handle) && location.pathname !== `/${handle}`) history.replaceState(null, "", `/${handle}`);

  const page = (html) => { root.innerHTML = html; };
  root.addEventListener("click", (e) => { if (e.target.closest("[data-reload]")) location.reload(); });
  // Angemeldete sind schon dabei: statt Warteliste zu den Projekten
  let member = false, me = null;
  try {
    const raw = localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token");
    if (raw) {
      member = true;
      const ses = JSON.parse(raw);
      // gültiges Token mitschicken, damit die Datenbank weiß, wer fragt (für „Nachricht schreiben“)
      if (ses?.access_token && (!ses.expires_at || ses.expires_at * 1000 > Date.now() + 30000)) me = { id: ses.user?.id, token: ses.access_token };
    }
  } catch { /* privat */ }
  const UUID = /^[0-9a-f-]{36}$/;
  const ctas = (primary) => `<div class="profile-actions">${primary}${member
    ? `<a class="btn btn-glass" href="/mitglieder">${esc(t("Mitglieder entdecken"))}</a>`
    : `<a class="btn btn-glass" href="/beta">${esc(t("Für die Beta bewerben"))}</a>`}</div>`;
  const freeLink = (h) => `/?handle=${encodeURIComponent(h)}#karte`;

  function renderCard(c) {
    const name = c.name || "?";
    const own = !!(me && c.user_id && c.user_id === me.id);
    document.title = `${name} · xyntal.de/${c.handle}`;
    const primary = !member
      ? `<a class="btn btn-primary" href="/#karte">${esc(t("Bau deine eigene Karte"))}</a>`
      : own
        ? `<a class="btn btn-primary" href="/meine-karte">${esc(t("Meine Karte bearbeiten"))}</a>`
        : UUID.test(c.user_id || "")
          ? `<a class="btn btn-primary" href="/nachrichten?an=${encodeURIComponent(c.user_id)}">${esc(t("Nachricht schreiben"))}</a>`
          : "";
    page(`
      <div class="pf">
        <aside class="pf-side">
          <div class="bp-stage">${window.XyntalCardHtml(c, { t, heading: "h1", avatarAttrs: "data-pub-avatar" })}</div>
          <div class="pf-actions">
            ${primary}
            <button class="btn btn-glass" type="button" data-copy-link>${esc(t("Link kopieren"))}</button>
            <p class="pf-copied" role="status" data-copy-status></p>
          </div>
        </aside>
        <div class="pf-main">
          ${eggHtml(c)}
          ${profileHtml(c)}
          ${me && UUID.test(c.user_id || "") && !own && window.XyntalApp ? `<section class="xm xm-public" aria-label="${esc(t("Eure Passung"))}" data-match hidden></section>` : ""}
          ${member ? "" : `<div class="pf-join"><p>${esc(t("Auf Xyntal finden Entwickler, Designer und Gründer die richtigen Leute für ihre Idee."))}</p><a class="btn btn-glass btn-sm" href="/beta">${esc(t("Für die Beta bewerben"))}</a></div>`}
        </div>
      </div>`);
  }
  root.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-copy-link]")) return;
    const status = root.querySelector("[data-copy-status]");
    try { await navigator.clipboard.writeText(location.origin + location.pathname); status.textContent = t("Link kopiert."); }
    catch { status.textContent = location.host + location.pathname; }
  });

  // Nur beim ersten User: das Ei (Last Egg Standing) mit seiner Bio in einer Sprechblase
  function eggHtml(c) {
    if (!window.XyntalCardHtml.isFirstUser || !window.XyntalCardHtml.isFirstUser(c)) return "";
    const p = c.profile || {};
    const bio = String(p.about || p.headline || c.pitch || "").trim();
    return `<figure class="pf-egg">
        <span class="pf-egg-figure"><img src="/badges/egg-stand.png" alt="" width="115" height="180" decoding="async"></span>
        <figcaption class="pf-egg-bubble">${bio ? `<span data-no-i18n>${esc(bio)}</span>` : `<span>…</span>`}</figcaption>
      </figure>
      <section class="pf-award" aria-label="Auszeichnung" data-no-i18n>
        <span class="pf-award-trophy"><span class="pf-award-float"><img src="/badges/golden-egg-award.webp" alt="Goldenes Ei als Pokal: Golden Goose Egg Award" width="85" height="180" decoding="async"><i class="pf-award-shine" aria-hidden="true"></i></span></span>
        <div>
          <p class="pf-award-kicker">Auszeichnung</p>
          <h2>Golden Goose Egg Award</h2>
          <p>Verliehen an Maxim, den ersten User von Xyntal und einzigen Träger von Last Egg Standing.</p>
        </div>
      </section>`;
  }

  // Profilinfos aus dem Konto (nur wenn die Person ihr Profil öffentlich gemacht hat)
  const safeUrl = (u) => (/^https?:\/\/[^\s]+$/i.test(u || "") ? u : "");
  function profileHtml(c) {
    const p = c.profile || {};
    const row = (title, text) => (text && text.trim() ? `<div class="pf-row"><h2>${esc(t(title))}</h2><p data-no-i18n>${esc(text)}</p></div>` : "");
    const links = [["LinkedIn", p.linkedin], ["Instagram", p.instagram], ["Website", p.website]].map(([l, u]) => [l, safeUrl(u)]).filter(([, u]) => u);
    const rows = row("Über mich", p.about) + row("Ich biete", p.offer) + row("Ich suche", p.seek)
      + (links.length ? `<div class="pf-row"><h2>${esc(t("Links"))}</h2><p class="pf-links">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l)} ↗</a>`).join("")}</p></div>` : "");
    const headline = p.headline || c.pitch || "";
    // Beim ersten User spricht das Ei (Sprechblase) – Adresse und Überschrift entfallen dort
    const egg = !!(window.XyntalCardHtml.isFirstUser && window.XyntalCardHtml.isFirstUser(c));
    return `${egg ? "" : `<header class="pf-head"><p class="pf-address" data-no-i18n>xyntal.de/${esc(c.handle)}</p>${headline ? `<p class="pf-headline" data-no-i18n>${esc(headline)}</p>` : ""}</header>`}
      ${rows ? `<section class="pf-about">${rows}</section>` : `<p class="pf-muted">${esc(t("Lerne die Person hinter der Idee kennen."))}</p>`}`;
  }
  // Eure Passung – vom Matching des App-Servers (wie „Für dich“), nur für Angemeldete.
  // Ist die Person dort nicht sichtbar (privat, blockiert), bleibt der Bereich einfach weg.
  async function loadMatch(websiteId) {
    const box = root.querySelector("[data-match]");
    if (!box) return;
    const X = window.XyntalApp;
    try {
      const { profile } = await X.api("GET", `/users/by-website/${encodeURIComponent(websiteId)}`);
      const { match } = await X.api("GET", `/matches/people/${encodeURIComponent(profile.id)}`);
      if (!box.isConnected) return;
      const btn = (attrs, label) => `<button class="btn btn-glass btn-sm" type="button" ${attrs}>${esc(t(label))}</button>`;
      box.innerHTML = `
        <div class="xm-detail">
          <div class="xm-detail-head">
            ${X.scoreRing(match.overall, "xm-lg")}
            <div><p class="xm-kicker">${esc(t("Eure Passung"))}</p><h2><span>${esc(t("Du und"))}</span> <span data-no-i18n>${esc(profile.displayName)}</span></h2></div>
          </div>
          ${match.explanation && match.explanation.summary ? `<p class="xm-summary" data-no-i18n>${esc(match.explanation.summary)}</p>` : ""}
          <details><summary>${esc(t("Wie sich die Passung zusammensetzt"))}</summary><div class="xm-explain">${X.explanationHtml({ ...match, explanation: null })}</div></details>
          <div class="profile-actions" style="justify-content:flex-start">
            ${btn(`data-match-save aria-pressed="${match.saved}"`, match.saved ? "Gespeichert ✓" : "Speichern")}
            ${match.dismissed ? "" : btn("data-match-dismiss", "Passt nicht")}
            <a class="btn btn-glass btn-sm" href="/fuer-dich?person=${encodeURIComponent(profile.id)}">${esc(t("Alle Vorschläge"))}</a>
          </div>
          <p class="xm-status" role="status" data-match-status></p>
        </div>`;
      box.hidden = false;
      const status = box.querySelector("[data-match-status]");
      box.querySelector("[data-match-save]").addEventListener("click", async (e) => {
        const b = e.currentTarget, on = b.getAttribute("aria-pressed") !== "true";
        try {
          await X.record(profile.id, on ? "saved" : "unsaved");
          b.setAttribute("aria-pressed", String(on));
          b.textContent = t(on ? "Gespeichert ✓" : "Speichern");
        } catch (err) { status.textContent = err.message; }
      });
      box.querySelector("[data-match-dismiss]")?.addEventListener("click", async (e) => {
        const choice = await X.askDismissReason();
        if (!choice) return;
        try {
          await X.record(profile.id, "dismissed", { reason: choice.reason, note: choice.note || null });
          e.target.remove();
          status.textContent = t("Ausgeblendet – diese Person erscheint nicht mehr in deinen Vorschlägen.");
        } catch (err) { status.textContent = err.message; }
      });
    } catch { /* ohne App-Sitzung oder nicht sichtbar: keine Passung */ }
  }
  async function loadAvatar(path) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|gif|webp)$/.test(path || "")) return;
    try {
      const res = await fetch(`${SUPA}/storage/v1/object/authenticated/avatars/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const slot = document.querySelector("[data-pub-avatar]");
      if (slot) slot.innerHTML = `<img src="${url}" alt="">`;
    } catch { /* Initiale bleibt */ }
  }

  async function load() {
    if (!HANDLE.test(handle)) {
      page(`<div class="profile-msg"><h1>${esc(t("Diese Karte gibt es nicht."))}</h1><p>${esc(t("Prüf den Link oder bau dir deine eigene Xyntal-Karte."))}</p>${ctas(`<a class="btn btn-primary" href="/#karte">${esc(t("Bau deine eigene Karte"))}</a>`)}</div>`);
      return;
    }
    try {
      const res = await fetch(`${SUPA}/rest/v1/rpc/get_public_card`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${me ? me.token : KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_handle: handle }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const card = await res.json();
      if (card && card.name) { renderCard(card); window.XyntalCardHtml.hydrate?.(root); loadMatch(card.user_id); if (card.profile) loadAvatar(card.profile.avatar_path); return; }
      if (card && card.reserved) {
        document.title = `xyntal.de/${handle} – ${t("reserviert")}`;
        return page(`<div class="profile-msg"><h1><b>xyntal.de/${esc(handle)}</b><br>${esc(t("ist reserviert."))}</h1><p>${esc(t("Dieses Profil ist noch nicht öffentlich freigegeben. Es kann schon jetzt im eigenen Konto veröffentlicht werden."))}</p>${ctas(`<a class="btn btn-primary" href="/#karte">${esc(t("Eigenen Link sichern"))}</a>`)}</div>`);
      }
      if (BLOCKED.has(handle)) {
        document.title = `xyntal.de/${handle} – ${t("nicht verfügbar")}`;
        return page(`<div class="profile-msg"><h1>${esc(t("Diese Seite gibt es nicht."))}</h1><p>${esc(t("Prüf den Link oder schau dich auf der Startseite um."))}</p>${ctas(`<a class="btn btn-primary" href="/">${esc(t("Zur Startseite"))}</a>`)}</div>`);
      }
      document.title = `xyntal.de/${handle} – ${t("noch frei")}`;
      page(`<div class="profile-msg"><h1><b>xyntal.de/${esc(handle)}</b><br>${esc(t("ist noch frei."))}</h1><p>${esc(t("Bau deine Xyntal-Karte und sichere dir diesen Link, bevor ihn jemand anders bekommt."))}</p>${ctas(`<a class="btn btn-primary" href="${freeLink(handle)}">${esc(t("Diesen Link sichern"))}</a>`)}</div>`);
    } catch {
      page(`<div class="profile-msg"><h1>${esc(t("Die Karte konnte gerade nicht geladen werden."))}</h1><p>${esc(t("Bitte versuch es gleich noch einmal."))}</p>${ctas(`<button class="btn btn-primary" type="button" data-reload>${esc(t("Neu laden"))}</button>`)}</div>`);
    }
  }
  load();
  document.addEventListener("xyntal:lang", load);
})();
