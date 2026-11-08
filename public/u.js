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
    "xyntal", "invite", "boerse", "community", "events"]);
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";

  // Name aus /name, /u#name oder /u?name=…
  let handle = location.pathname.replace(/^\/+|\/+$/g, "");
  if (!HANDLE.test(handle.toLowerCase()) || handle === "u") handle = (location.hash.slice(1) || new URLSearchParams(location.search).get("name") || "");
  try { handle = decodeURIComponent(handle).toLowerCase(); } catch { handle = ""; }
  if (HANDLE.test(handle) && location.pathname !== `/${handle}`) history.replaceState(null, "", `/${handle}`);

  const page = (html) => { document.body.classList.remove("admin-profile"); root.innerHTML = html; };
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

  let shown = null;
  function renderCard(c) {
    shown = c;
    const name = c.name || "?";
    const own = !!(me && c.user_id && c.user_id === me.id);
    const admin = c.is_admin === true;
    document.title = `${name} · xyntal.de/${c.handle}`;
    // Einladungsprogramm: Wer über diesen Link kommt und ein Konto anlegt, löst die Einladung ein (account-menu.js)
    if (!own && HANDLE.test(c.handle || "")) {
      try { localStorage.setItem("xyntal-ref-handle", JSON.stringify({ handle: c.handle, at: Date.now() })); } catch { /* geht auch ohne */ }
    }
    const primary = !member
      ? `<a class="btn btn-primary" href="/#karte">${esc(t("Bau deine eigene Karte"))}</a>`
      : own
        ? `<a class="btn btn-primary" href="/meine-karte">${esc(t("Meine Karte bearbeiten"))}</a>`
        : UUID.test(c.user_id || "")
          ? `<a class="btn btn-primary" href="/nachrichten?an=${encodeURIComponent(c.user_id)}">${esc(t("Nachricht schreiben"))}</a>`
          : "";
    if (customPage(c)) return renderCustom(c, primary);
    page(`
      <div class="pf pf--links">
        <aside class="pf-side">
          <div class="bp-stage${admin ? " pf-admin-stage" : ""}">${window.XyntalCardHtml(c, { t, heading: "h1", avatarAttrs: "data-pub-avatar" })}</div>
          <div class="pf-actions">
            ${primary}
            ${own ? `<a class="btn btn-glass" href="#gestalten" data-edit-page>${esc(t("Seite frei gestalten"))}</a>` : ""}
            ${!member && !own ? `<p class="pf-invited">${esc(t("Du wurdest eingeladen: Mit einem Konto bekommst du 7 Tage Plus gratis – und die Person, die dich eingeladen hat, auch."))} <a class="text-link" href="/login#registrieren">${esc(t("Konto anlegen"))}</a></p>` : ""}
            <button class="btn btn-glass" type="button" data-copy-link>${esc(t(navigator.share ? "Profil teilen" : "Link kopieren"))}</button>
            <p class="pf-copied" role="status" data-copy-status></p>
          </div>
          ${linksHtml(c)}
        </aside>
        <div class="pf-main">
          ${eggHtml(c)}
          ${profileHtml(c)}
          ${me && UUID.test(c.user_id || "") && !own && window.XyntalApp ? `<section class="xm xm-public" aria-label="${esc(t("Eure Passung"))}" data-match hidden></section>` : ""}
          ${member ? "" : `<div class="pf-join"><p>${esc(t("Auf Xyntal finden Entwickler, Designer und Gründer die richtigen Leute für ihre Idee."))}</p><a class="btn btn-glass btn-sm" href="/beta">${esc(t("Für die Beta bewerben"))}</a></div>`}
        </div>
      </div>`);
    // Admins bekommen eine eigene, exklusive Profilseite (Aussehen: u.html, Abschnitt „Admin-Profil“)
    document.body.classList.toggle("admin-profile", admin);
    if (admin) adminTilt();
    else linkGlow();
  }
  // Editor: öffnet sich direkt auf der eigenen Seite (xyntal.de/name#gestalten) und ersetzt sie, bis „Fertig“ gedrückt wird
  const loadAsset = (tag, attr, url) => new Promise((ok, fail) => { const el = document.createElement(tag); if (tag === "link") el.rel = "stylesheet"; el[attr] = url; el.onload = ok; el.onerror = fail; document.head.append(el); });
  let editing = false;
  async function startEditor() {
    if (editing) return;
    editing = true;
    try {
      const css = loadAsset("link", "href", "/page-canvas.css?v=8"), css2 = loadAsset("link", "href", "/page-editor.css?v=12");
      if (!window.supabase) await loadAsset("script", "src", "/vendor/supabase.js?v=31");
      await Promise.all([css, css2]);
      await loadAsset("script", "src", "/page-editor.js?v=10");
      document.body.classList.remove("admin-profile");
      window.XyntalPageEditor.open(root, { card: shown, blocks: blockMap(shown), after: (host) => afterBlocks(host, shown), cardInfo: shown });
    } catch { editing = false; location.assign(location.pathname); }
  }
  root.addEventListener("click", (e) => { if (e.target.closest("[data-edit-page]")) { e.preventDefault(); history.replaceState(null, "", "#gestalten"); startEditor(); } });
  // Freie Seite (Editor): nur wenn die Person Elemente platziert hat, sonst bleibt die Standardseite
  const customPage = (c) => !!(window.XyntalPageCanvas && c.page && Array.isArray(c.page.items) && window.XyntalPageCanvas.normalize(c.page).items.length);
  function renderCustom(c, primary) {
    const own = !!(me && c.user_id && c.user_id === me.id);
    const blocks = blockMap(c);
    page(`
      <div class="pf pf--custom">
        ${window.XyntalPageCanvas.html(c.page, { links: Array.isArray(c.links) ? c.links : [], base: SUPA, t, block: (kind) => blocks[kind] || "" })}
        <div class="pf-actions">
          ${primary}
          ${own ? `<a class="btn btn-glass" href="#gestalten" data-edit-page>${esc(t("Seite frei gestalten"))}</a>` : ""}
          ${!member && !own ? `<p class="pf-invited">${esc(t("Du wurdest eingeladen: Mit einem Konto bekommst du 7 Tage Plus gratis – und die Person, die dich eingeladen hat, auch."))} <a class="text-link" href="/login#registrieren">${esc(t("Konto anlegen"))}</a></p>` : ""}
          <button class="btn btn-glass" type="button" data-copy-link>${esc(t(navigator.share ? "Profil teilen" : "Link kopieren"))}</button>
          <p class="pf-copied" role="status" data-copy-status></p>
        </div>
      </div>`);
    document.body.classList.remove("admin-profile");
    window.XyntalPageCanvas.mount(root);
    afterBlocks(root, c);
  }
  // Bausteine der Profilseite als HTML (leer, wenn es nichts anzuzeigen gibt) – im freien Layout einzeln platzierbar
  function blockMap(c) {
    const p = c.profile || {}, text = (s) => (s && String(s).trim() ? String(s).trim() : "");
    const about = text(p.about), offer = text(p.offer), seek = text(p.seek), headline = p.headline || c.pitch || "";
    const skills = Array.isArray(c.skills) ? c.skills.filter((s) => text(s)) : [];
    const tile = (cls, title, body) => `<section class="pf-tile ${cls}"><h2>${esc(t(title))}</h2><p data-no-i18n>${esc(body)}</p></section>`;
    return {
      card: `<div class="bp-stage">${window.XyntalCardHtml(c, { t, heading: "h1", avatarAttrs: "data-pub-avatar" })}</div>`,
      head: `<header class="pf-head"><p class="pf-address"><span data-no-i18n>xyntal.de/${esc(c.handle)}</span></p>${headline ? `<p class="pf-headline" data-no-i18n>${esc(headline)}</p>` : ""}${factsHtml(c)}</header>`,
      about: about ? `<section class="pf-section"><h2>${esc(t("Über mich"))}</h2><p class="pf-prose" data-no-i18n>${esc(about)}</p></section>` : "",
      offer: offer ? tile("pf-tile-offer", "Ich biete", offer) : "",
      seek: seek ? tile("pf-tile-seek", "Ich suche", seek) : "",
      skills: skills.length ? `<section class="pf-section"><h2>${esc(t("Skills"))}</h2><ul class="pf-chips" data-no-i18n>${skills.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : "",
    };
  }
  // Karte und Profilbild brauchen nach dem Einfügen ihre Effekte bzw. das Bild
  function afterBlocks(host, c) {
    window.XyntalCardHtml.hydrate?.(host);
    if (c.profile) loadAvatar(c.profile.avatar_path);
  }
  // Normale Profile: Links leuchten beim Überfahren in der Kartenfarbe der Person, das Licht folgt dem Mauszeiger
  function linkGlow() {
    const side = root.querySelector(".pf-side"), card = side && side.querySelector(".my-card");
    if (!side || !card) return;
    const accent = card.style.getPropertyValue("--t1").trim();
    if (accent) side.style.setProperty("--lp-accent", accent);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    side.addEventListener("pointermove", (e) => {
      const a = e.target.closest && e.target.closest(".lp-link");
      if (!a) return;
      const r = a.getBoundingClientRect();
      a.style.setProperty("--mx", `${Math.round(e.clientX - r.left)}px`);
      a.style.setProperty("--my", `${Math.round(e.clientY - r.top)}px`);
    });
  }
  root.addEventListener("click", async (e) => {
    if (!e.target.closest("[data-copy-link]")) return;
    const status = root.querySelector("[data-copy-status]");
    const url = location.origin + location.pathname;
    if (navigator.share) {
      try { await navigator.share({ title: document.title, url }); return; }
      catch (err) { if (err && err.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); status.textContent = t("Link kopiert."); }
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

  // Admin-Profil: Siegel (Xyntal-Zeichen mit langsam drehendem Schriftring) und Kennzeichen des Teams
  const ADMIN_LOGO = `<svg class="pf-admin-logo" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="pfa-a" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#B36BFF"/><stop offset="1" stop-color="#3A8AFF"/></linearGradient><linearGradient id="pfa-b" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3A8AFF"/><stop offset="1" stop-color="#3FE0F0"/></linearGradient><mask id="pfa-g" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="#000" stroke-width="7.4" stroke-linecap="round"/></mask></defs><path d="M3 3Q15.41 8.59 21 21" fill="none" stroke="url(#pfa-b)" stroke-width="4.6" stroke-linecap="round" mask="url(#pfa-g)"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="url(#pfa-a)" stroke-width="4.6" stroke-linecap="round"/></svg>`;
  function adminHtml(c) {
    const first = String(c.name || "").trim().split(/\s+/)[0] || "";
    const ring = `${t("Team Xyntal")} · ${t("Offizielles Konto")} · ${t("Verifiziert")} · `.toUpperCase();
    const spec = (k, v) => `<div><dt>${esc(t(k))}</dt><dd>${esc(t(v))}</dd></div>`;
    return `<section class="pf-admin" aria-label="${esc(t("Team Xyntal"))}">
        <div class="pf-admin-top">
          <span class="pf-admin-seal" aria-hidden="true">
            <svg class="pf-admin-ring" viewBox="0 0 120 120"><defs><path id="pfa-circle" d="M60 60m-47 0a47 47 0 1 1 94 0a47 47 0 1 1 -94 0"/></defs><text><textPath href="#pfa-circle" textLength="292" lengthAdjust="spacing">${esc(ring)}</textPath></text></svg>
            ${ADMIN_LOGO}
          </span>
          <div class="pf-admin-body">
            <p class="pf-admin-kicker"><i aria-hidden="true"></i>${esc(t("Team Xyntal"))}</p>
            <h2>${esc(t("Admin von Xyntal"))}</h2>
            <p><span data-no-i18n>${esc(first)}</span> ${esc(t("gehört zum Team hinter Xyntal und kümmert sich um Community, Mitglieder und Sicherheit. Nachrichten von diesem Konto sind offiziell."))}</p>
          </div>
        </div>
        <dl class="pf-admin-specs">
          ${spec("Rolle", "Admin")}
          ${spec("Status", "Verifiziert")}
          ${spec("Zuständig", "Community & Sicherheit")}
        </dl>
      </section>`;
  }
  // Admin-Karte neigt sich zum Mauszeiger, ein Lichtreflex folgt ihm (nicht bei Touch oder reduzierter Bewegung)
  function adminTilt() {
    const stage = root.querySelector(".pf-admin-stage");
    const card = stage && stage.querySelector(".my-card");
    if (!card || !matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    stage.addEventListener("pointermove", (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        card.style.setProperty("--pfa-rx", `${((0.5 - y) * 10).toFixed(2)}deg`);
        card.style.setProperty("--pfa-ry", `${((x - 0.5) * 12).toFixed(2)}deg`);
        card.style.setProperty("--pfa-mx", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--pfa-my", `${(y * 100).toFixed(1)}%`);
        card.classList.add("is-tilting");
      });
    });
    stage.addEventListener("pointerleave", () => { cancelAnimationFrame(frame); card.classList.remove("is-tilting"); ["--pfa-rx", "--pfa-ry"].forEach((v) => card.style.removeProperty(v)); });
  }

  // Profilinfos aus dem Konto (nur wenn die Person ihr Profil öffentlich gemacht hat)
  const safeUrl = (u) => (/^https?:\/\/[^\s]+$/i.test(u || "") ? u : "");
  // Link-Seite: frei gewählte Links der Person; ohne eigene Links die festen Angaben aus Karte und Profil
  // Gleiche Adresse trotz www, Schrägstrich am Ende oder Groß-/Kleinschreibung
  const sameUrl = (a, b) => { const k = (u) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}${x.search}`.toLowerCase(); } catch { return u; } }; return k(a) === k(b); };
  const isOwnSite = (u) => { try { return /^(www\.)?xyntal\.(de|com)$/i.test(new URL(u).hostname); } catch { return false; } };
  function linkItems(c) {
    // Eigene Einträge: Links (http/https) und reiner Text, z. B. „Username: nico“
    const own = Array.isArray(c.links) ? c.links.filter((l) => l && String(l.url || "").trim() && String(l.title || "").trim()) : [];
    if (own.length) return own;
    const p = c.profile || {};
    return [["LinkedIn", p.linkedin, "linkedin"], ["Instagram", p.instagram, "instagram"], ["Website", p.website, "globe"], ["Website", c.link, "globe"]]
      .map(([title, url, icon]) => ({ title, url: safeUrl(url), icon }))
      // Ein automatischer Link auf xyntal.de selbst führt nur hierher zurück: weglassen
      .filter((l) => !isOwnSite(l.url))
      .filter((l, i, a) => l.url && a.findIndex((x) => sameUrl(x.url, l.url)) === i);
  }
  function linksHtml(c) {
    const items = linkItems(c), I = window.XyntalLinkIcons;
    if (!items.length || !I) return "";
    const idAttr = (l) => (l.id && UUID.test(l.id) ? ` data-link-id="${esc(l.id)}"` : "");
    const COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
    return `<ul class="lp-list" aria-label="${esc(t("Links"))}">${items.map((l) => safeUrl(l.url)
      ? `<li><a class="lp-link" href="${esc(l.url)}"${idAttr(l)} target="_blank" rel="noopener noreferrer nofollow">
        <span class="lp-ico">${I.svg(l.icon)}</span><span class="lp-txt"><b data-no-i18n>${esc(l.title)}</b><small data-no-i18n>${esc(I.hostOf(l.url))}</small></span><i class="lp-arrow" aria-hidden="true">↗</i></a></li>`
      : `<li><button type="button" class="lp-link lp-text"${idAttr(l)} data-copy-text="${esc(l.url)}" aria-label="${esc(l.title)}: ${esc(l.url)} – ${esc(t("kopieren"))}">
        <span class="lp-ico">${I.svg(l.icon)}</span><span class="lp-txt"><b data-no-i18n>${esc(l.title)}</b><small data-no-i18n>${esc(l.url)}</small></span><i class="lp-arrow lp-copy" aria-hidden="true">${COPY}</i><span class="lp-copied" aria-live="polite"></span></button></li>`).join("")}</ul>`;
  }
  // Text-Einträge: Klick kopiert den Text und zeigt kurz „Kopiert“
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy-text]");
    if (!b) return;
    const note = b.querySelector(".lp-copied, .pc-copied");
    try { await navigator.clipboard.writeText(b.dataset.copyText); note.textContent = t("Kopiert"); }
    catch { note.textContent = t("Zum Kopieren markieren"); }
    b.classList.add("is-copied");
    clearTimeout(b._copyTimer);
    b._copyTimer = setTimeout(() => { b.classList.remove("is-copied"); note.textContent = ""; }, 1600);
  });
  // Klick zählen (Paid-Mitglieder sehen die Zahl im Editor); darf die Navigation nie aufhalten
  root.addEventListener("click", (e) => {
    const a = e.target.closest("[data-link-id]");
    if (!a) return;
    try {
      fetch(`${SUPA}/rest/v1/rpc/track_link_click`, { method: "POST", keepalive: true,
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_id: a.dataset.linkId }) }).catch(() => {});
    } catch { /* Zählen ist optional */ }
  });
  // Steckbrief: die wichtigsten Angaben der Karte auf einen Blick (nur was ausgefüllt ist)
  function factsHtml(c) {
    const hours = Number(c.hours) || 0;
    const facts = [
      ["Rolle", c.role ? t(c.role) : "", true],
      ["Sucht", c.looking ? t(c.looking) : "", true],
      ["Zeit", hours > 0 ? t(`${hours} Std./Woche`) : "", false],
      ["Ort", [c.city, c.mode ? t(c.mode) : ""].filter(Boolean).join(" · "), false],
    ].filter(([, v]) => v);
    if (!facts.length) return "";
    return `<dl class="pf-facts">${facts.map(([k, v, tr]) => `<div><dt>${esc(t(k))}</dt><dd${tr ? "" : " data-no-i18n"}>${esc(v)}</dd></div>`).join("")}</dl>`;
  }
  function profileHtml(c) {
    const p = c.profile || {};
    const text = (s) => (s && String(s).trim() ? String(s).trim() : "");
    const about = text(p.about), offer = text(p.offer), seek = text(p.seek);
    const skills = Array.isArray(c.skills) ? c.skills.filter((s) => text(s)) : [];
    const headline = p.headline || c.pitch || "";
    // Beim ersten User spricht das Ei (Sprechblase) – Adresse, Überschrift und „Über mich“ entfallen dort
    const egg = !!(window.XyntalCardHtml.isFirstUser && window.XyntalCardHtml.isFirstUser(c));
    const tile = (cls, title, body) => `<section class="pf-tile ${cls}"><h2>${esc(t(title))}</h2><p data-no-i18n>${esc(body)}</p></section>`;
    const sections = [
      about && !egg ? `<section class="pf-section"><h2>${esc(t("Über mich"))}</h2><p class="pf-prose" data-no-i18n>${esc(about)}</p></section>` : "",
      offer || seek ? `<div class="pf-duo">${offer ? tile("pf-tile-offer", "Ich biete", offer) : ""}${seek ? tile("pf-tile-seek", "Ich suche", seek) : ""}</div>` : "",
      skills.length ? `<section class="pf-section"><h2>${esc(t("Skills"))}</h2><ul class="pf-chips" data-no-i18n>${skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>` : "",
    ].join("");
    return `<header class="pf-head">${egg ? "" : `<p class="pf-address"><span data-no-i18n>xyntal.de/${esc(c.handle)}</span>${c.is_admin === true ? `<span class="pf-admin-chip"><i aria-hidden="true"></i>${esc(t("Offizielles Konto"))}</span>` : ""}</p>${headline ? `<p class="pf-headline" data-no-i18n>${esc(headline)}</p>` : ""}`}
        ${factsHtml(c)}</header>
      ${c.is_admin === true ? adminHtml(c) : ""}
      ${sections || `<p class="pf-muted">${esc(t("Lerne die Person hinter der Idee kennen."))}</p>`}`;
  }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
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
  // Ein Video als Profilbild kommt über eine signierte URL und streamt stumm in Schleife.
  async function loadAvatar(path) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|gif|webp|mp4|webm)$/.test(path || "")) return;
    try {
      const slot = document.querySelector("[data-pub-avatar]");
      if (!slot) return;
      if (/\.(mp4|webm)$/.test(path)) {
        const res = await fetch(`${SUPA}/storage/v1/object/sign/avatars/${path}`, {
          method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }),
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!body || typeof body.signedURL !== "string") return;
        slot.innerHTML = `<video src="${esc(`${SUPA}/storage/v1${body.signedURL}`)}" muted loop autoplay playsinline aria-hidden="true"></video>`;
        slot.querySelector("video")?.play().catch(() => {});
        return;
      }
      const res = await fetch(`${SUPA}/storage/v1/object/authenticated/avatars/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      slot.innerHTML = `<img src="${url}" alt="">`;
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
      if (card && card.name && !editing) { renderCard(card); window.XyntalCardHtml.hydrate?.(root); loadMatch(card.user_id); if (card.profile) loadAvatar(card.profile.avatar_path);
        if (location.hash === "#gestalten" && me && card.user_id === me.id) startEditor();
        return; }
      if (card && card.name && editing) return;
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
