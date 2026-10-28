// Öffentliche Xyntal-Karte unter xyntal.de/name – zeigt nur, was die Person freigegeben hat
(() => {
  const root = document.querySelector("[data-profile]");
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";

  // Name aus /name, /u#name oder /u?name=…
  let handle = location.pathname.replace(/^\/+|\/+$/g, "");
  if (!HANDLE.test(handle.toLowerCase()) || handle === "u") handle = (location.hash.slice(1) || new URLSearchParams(location.search).get("name") || "");
  try { handle = decodeURIComponent(handle).toLowerCase(); } catch { handle = ""; }
  if (HANDLE.test(handle) && location.pathname !== `/${handle}`) history.replaceState(null, "", `/${handle}`);

  const page = (html) => { root.innerHTML = html; };
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
    ? `<a class="btn btn-glass" href="/projekte">${esc(t("Projekte entdecken"))}</a>`
    : `<a class="btn btn-glass" href="/#warteliste">${esc(t("Auf die Warteliste"))}</a>`}</div>`;
  const freeLink = (h) => `/?handle=${encodeURIComponent(h)}#karte`;

  function renderCard(c) {
    const name = c.name || "?";
    document.title = `${name} · xyntal.de/${c.handle}`;
    page(`
      <div class="public-intro"><span class="public-eyebrow">${esc(t("Menschen hinter den Ideen"))}</span><span class="public-address" data-no-i18n>xyntal.de/${esc(c.handle)}</span></div>
      <div class="profile-overview">
      <div class="bp-stage">
        ${window.XyntalCardHtml(c, { t, heading: "h1", avatarAttrs: "data-pub-avatar" })}
      </div>
      <div class="profile-story">${profileHtml(c.profile) || `<section class="pp glass"><p class="pp-headline">${esc(c.pitch || c.name)}</p><p>${esc(t("Lerne die Person hinter der Idee kennen."))}</p></section>`}
      </div>
      </div>
      <section class="public-activity" aria-label="Projekte und Anzeigen" data-public-activity><p role="status">${esc(t("Projekte und Anzeigen werden geladen …"))}</p></section>
      <div class="profile-msg public-join">
        <p>${esc(t("Auf Xyntal finden Entwickler, Designer und Gründer die richtigen Leute für ihre Idee."))}</p>
        ${ctas(!member
          ? `<a class="btn btn-primary" href="/#karte">${esc(t("Bau deine eigene Karte"))}</a>`
          : me && c.user_id && c.user_id === me.id
            ? `<a class="btn btn-primary" href="/meine-karte">${esc(t("Meine Karte bearbeiten"))}</a>`
            : UUID.test(c.user_id || "")
              ? `<a class="btn btn-primary" href="/nachrichten?an=${encodeURIComponent(c.user_id)}">${esc(t("Nachricht schreiben"))}</a>`
              : "")}
      </div>`);
  }

  // Profilinfos aus dem Konto (nur wenn die Person ihr Profil öffentlich gemacht hat)
  const safeUrl = (u) => (/^https?:\/\/[^\s]+$/i.test(u || "") ? u : "");
  function profileHtml(p) {
    if (!p) return "";
    const block = (title, text) => (text && text.trim() ? `<section class="pp-block"><h2>${esc(t(title))}</h2><p data-no-i18n>${esc(text)}</p></section>` : "");
    const links = [["LinkedIn", p.linkedin], ["Instagram", p.instagram], ["Website", p.website]].map(([l, u]) => [l, safeUrl(u)]).filter(([, u]) => u);
    const inner = [
      p.headline ? `<p class="pp-headline" data-no-i18n>${esc(p.headline)}</p>` : "",
      block("Über mich", p.about), block("Ich biete", p.offer), block("Ich suche", p.seek),
      links.length ? `<div class="pp-links">${links.map(([l, u]) => `<a class="btn btn-glass btn-sm" href="${esc(u)}" target="_blank" rel="noopener noreferrer nofollow">${esc(l)} ↗</a>`).join("")}</div>` : "",
    ].join("");
    return inner ? `<div class="pp glass">${inner}</div>` : "";
  }
  async function loadActivity() {
    const target = root.querySelector("[data-public-activity]");
    if (!target) return;
    try {
      const res = await fetch(`${SUPA}/rest/v1/rpc/get_public_profile_activity`, {
        method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_handle: handle }),
      });
      if (!res.ok) throw new Error("activity");
      const data = await res.json();
      if (!target.isConnected) return;
      const item = (x, kind) => {
        const id = String(x.id);
        if (!/^\d+$/.test(id)) return "";
        const isProject = kind === "project";
        const url = isProject ? `/projekte?projekt=${id}` : `/boerse#anzeige-${id}`;
        return `<a class="public-item glass" href="${url}"><span class="public-item-meta">${esc(t(isProject ? "Projekt" : (x.type === "biete" ? "Angebot" : "Gesuch")))}${x.closed ? ` · ${esc(t("Geschlossen"))}` : ""}</span><h3 data-no-i18n>${esc(x.title)}</h3><p data-no-i18n>${esc(isProject ? x.pitch : x.excerpt)}</p><span class="public-item-link">${esc(t(isProject ? "Projekt ansehen" : "Anzeige ansehen"))} ↗</span></a>`;
      };
      const section = (title, items, kind, empty) => `<section class="public-section" id="${kind === "project" ? "profil-projekte" : "profil-anzeigen"}"><div class="public-section-heading"><h2>${esc(t(title))}</h2><span class="public-count">${items.length}</span></div><div class="public-items">${items.length ? items.map(x => item(x, kind)).join("") : `<p class="public-empty">${esc(t(empty))}</p>`}</div></section>`;
      target.innerHTML = section("Projekte", data?.projects || [], "project", "Noch keine öffentlichen Projekte.") + section("Anzeigen", data?.listings || [], "listing", "Noch keine öffentlichen Anzeigen.");
    } catch {
      if (target.isConnected) target.innerHTML = `<p role="status">${esc(t("Projekte und Anzeigen konnten nicht geladen werden."))}</p><button class="btn btn-glass" type="button" data-retry-activity>${esc(t("Neu laden"))}</button>`;
      target.querySelector("[data-retry-activity]")?.addEventListener("click", loadActivity);
    }
  }
  async function loadAvatar(path) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path || "")) return;
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
      if (card && card.name) { renderCard(card); loadActivity(); if (card.profile) loadAvatar(card.profile.avatar_path); return; }
      if (card && card.reserved) {
        document.title = `xyntal.de/${handle} – ${t("reserviert")}`;
        return page(`<div class="profile-msg"><h1><b>xyntal.de/${esc(handle)}</b><br>${esc(t("ist reserviert."))}</h1><p>${esc(t("Dieses Profil ist noch nicht öffentlich freigegeben. Es kann schon jetzt im eigenen Konto veröffentlicht werden."))}</p>${ctas(`<a class="btn btn-primary" href="/#karte">${esc(t("Eigenen Link sichern"))}</a>`)}</div>`);
      }
      document.title = `xyntal.de/${handle} – ${t("noch frei")}`;
      page(`<div class="profile-msg"><h1><b>xyntal.de/${esc(handle)}</b><br>${esc(t("ist noch frei."))}</h1><p>${esc(t("Bau deine Xyntal-Karte und sichere dir diesen Link, bevor ihn jemand anders bekommt."))}</p>${ctas(`<a class="btn btn-primary" href="${freeLink(handle)}">${esc(t("Diesen Link sichern"))}</a>`)}</div>`);
    } catch {
      page(`<div class="profile-msg"><h1>${esc(t("Die Karte konnte gerade nicht geladen werden."))}</h1><p>${esc(t("Bitte versuch es gleich noch einmal."))}</p>${ctas(`<button class="btn btn-primary" type="button" onclick="location.reload()">${esc(t("Neu laden"))}</button>`)}</div>`);
    }
  }
  load();
  document.addEventListener("xyntal:lang", load);
})();
