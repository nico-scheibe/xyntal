// Projekte mit offenen Rollen. Rechte prüft zusätzlich die Datenbank (supabase/009_projects.sql, 018_open_projects_messages.sql).
// Anlegen, melden und anschreiben geht mit Konto – ohne auf die Freischaltung zu warten.
(() => {
  const PHASE_LABEL = { idee: "Idee", prototyp: "Prototyp", erste_kunden: "Erste Kunden", wachstum: "Wachstum" };
  const MAX_ROLES = 8;
  const detailId = new URLSearchParams(location.search).get("projekt");
  const isDetail = /^\d+$/.test(detailId || "");
  const DEMO_KEY = "xyntal-wunschrollen";
  const detailHref = (id) => `/projekte?projekt=${id}`;

  function projectStatus(p) {
    if (p.closed) return { key: "done", label: "Abgeschlossen" };
    if ((p.roles || []).some((r) => !r.filled)) return { key: "hiring", label: "Sucht Mitglieder" };
    return { key: "active", label: "In Arbeit" };
  }
  function projectExtras(p) {
    const base = window.XyntalProjectExtras?.for(p) || { goals: [], tags: [], links: [], team: [], timeframe: "" };
    return { ...base, roleTags: base.roleTags && typeof base.roleTags === "object" ? base.roleTags : {} };
  }

  const els = {
    notice: document.getElementById("notice"),
    list: document.getElementById("projects"),
    form: document.getElementById("project-form"),
    newBtn: document.getElementById("new-project"),
    rows: document.getElementById("role-rows"),
    addRole: document.getElementById("add-role"),
    status: document.getElementById("project-status"),
    mine: document.querySelector('[data-filter="meine"]'),
  };

  let v = { me: null, isMember: false, canAct: false, isAdmin: false };
  let projects = [];
  let interest = [];        // eigene Meldungen und Meldungen auf eigene Rollen
  let filter = "";
  let ready = true;         // false, solange Migration 009 fehlt

  /* ---------- Projektbilder (supabase/020_project_images.sql) ---------- */
  const IMG_BUCKET = "project-images";
  const IMG_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;
  let hasImages = true;                // false, solange Migration 020 fehlt
  const imgUrls = new Map();
  const isMissingImageColumn = (err) => /image_path/.test(String(err?.message || err)) || err?.code === "42703";

  // Bild im Browser auf 1200×675 (16:9) zuschneiden und als JPG verkleinern
  async function prepareImage(file) {
    if (!file) return null;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Bitte wähle ein JPG-, PNG- oder WebP-Bild.");
    if (!file.size || file.size > 12 * 1024 * 1024) throw new Error("Das Bild darf höchstens 12 MB groß sein.");
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { throw new Error("Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei."); }
    try {
      const W = 1200, H = 675;
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#0B0A12"; ctx.fillRect(0, 0, W, H);
      const scale = Math.max(W / bmp.width, H / bmp.height);
      const sw = W / scale, sh = H / scale;
      ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, W, H);
      for (const q of [0.85, 0.75, 0.6]) {
        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
        if (blob && blob.size <= 1500000) return blob;
      }
      throw new Error("Das Bild konnte nicht verkleinert werden. Bitte wähle ein anderes.");
    } finally { bmp.close?.(); }
  }
  async function uploadImage(blob) {
    const path = `${v.me.id}/${crypto.randomUUID()}.jpg`;
    unwrap(await sb.storage.from(IMG_BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false }));
    return path;
  }
  async function removeImage(path) {
    if (IMG_RE.test(path || "")) { try { await sb.storage.from(IMG_BUCKET).remove([path]); } catch { /* bleibt liegen, stört nicht */ } }
  }
  // Bilder sind privat: nur wer das Projekt sehen darf, bekommt sie
  function hydrateImages(root) {
    root.querySelectorAll("[data-project-image]").forEach(async (el) => {
      const path = el.dataset.projectImage;
      if (!IMG_RE.test(path) || el.querySelector("img")) return;
      try {
        let url = imgUrls.get(path);
        if (!url) {
          const { data, error } = await sb.storage.from(IMG_BUCKET).download(path);
          if (error) throw error;
          url = URL.createObjectURL(data); imgUrls.set(path, url);
        }
        if (!el.isConnected) return;
        const img = new Image(); img.alt = el.dataset.alt || ""; img.decoding = "async";
        img.onload = () => el.classList.add("is-loaded");
        img.src = url; el.append(img);
      } catch { el.remove(); }
    });
  }

  const isMissingTable = (err) => /(projects|project_roles|project_interest)\b.*(does not exist|schema cache)|schema cache.*project/i.test(String(err?.message || err));
  const myInterest = (roleId) => v.me && interest.some((i) => i.role_id === roleId && i.member_id === v.me.id);
  const roleInterest = (roleId) => interest.filter((i) => i.role_id === roleId && (!v.me || i.member_id !== v.me.id));

  /* ---------- Darstellung ---------- */

  function roleBits(r) {
    const hours = r.hours ? `<span class="role-hours">${r.hours} Std./Woche</span>` : "";
    const status = `<span class="role-dot" aria-hidden="true"></span><span class="sr-only">${r.filled ? "Besetzt" : "Offen"}</span>`;
    return { hours, status };
  }

  function roleHtml(p, r, mine, extra) {
    const bits = roleBits(r);
    const name = esc(r.name);
    const slots = r.filled ? 0 : 1;
    const slotsLabel = r.filled ? "Besetzt" : `${slots} ${slots === 1 ? "Platz" : "Plätze"} offen`;
    if (!isDetail) {
      return `<li class="role-chip${r.filled ? " is-filled" : ""}" data-role="${r.id}"${r.need ? ' tabindex="0"' : ""}>
        ${bits.status}<span class="role-name">${name}</span>${bits.hours}${r.need ? `<span class="role-need">${esc(r.need)}</span>` : ""}
      </li>`;
    }
    const hours = bits.hours;
    const skillTags = [
      ...(Array.isArray(extra?.roleTags?.[r.name]) ? extra.roleTags[r.name] : []),
      ...(Array.isArray(extra?.tags) ? extra.tags : []),
    ].filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 8);
    const tagsHtml = skillTags.length
      ? `<div class="role-tags">${skillTags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : "";
    let action = "";
    if (mine) {
      const people = roleInterest(r.id);
      if (people.length) {
        action = `<details class="role-people"><summary>${people.length} ${people.length === 1 ? "Bewerbung" : "Bewerbungen"}</summary><ul>
          ${people.map((i) => `<li>${avatar(i.member?.name || "Mitglied", "avatar-sm", i.member?.avatar_path)}<div><strong>${esc(i.member?.name || "Mitglied")}</strong>${i.member?.headline ? `<span>${esc(i.member.headline)}</span>` : ""}${i.note ? `<p>${esc(i.note)}</p>` : ""}</div><a class="btn btn-small btn-ghost" href="nachrichten?an=${esc(i.member_id)}">Nachricht</a></li>`).join("")}
        </ul></details>`;
      }
    } else if (r.filled) {
      action = `<span class="role-full">Besetzt</span>`;
    } else if (myInterest(r.id)) {
      action = `<div class="role-applied-wrap"><span class="role-applied">Beworben ✓</span><button type="button" class="role-withdraw" data-act="leave">Zurückziehen</button></div>`;
    } else if (v.canAct && !p.closed) {
      action = `<button type="button" class="role-join" data-act="join">Bewerben</button>`;
    } else if (!v.me) {
      action = `<a class="text-link" href="/login?next=${encodeURIComponent(`projekte?projekt=${p.id}`)}">Einloggen, um dich zu bewerben</a>`;
    }
    return `<li class="role-card${r.filled ? " is-filled" : ""}" id="role-${r.id}" data-role="${r.id}">
      <div class="role-card-head"><strong class="role-name">${name}</strong>${hours}<span class="role-slots">${esc(slotsLabel)}</span></div>
      ${r.need ? `<p class="role-need">${esc(r.need)}</p>` : ""}
      ${tagsHtml}
      ${action ? `<div class="role-action">${action}</div>` : ""}
    </li>`;
  }

  function cardMenu(p, mine, img, roles) {
    const items = [];
    if (mine) {
      for (const r of roles) {
        const label = r.filled ? `Besetzung aufheben: ${esc(r.name)}` : `Als besetzt markieren: ${esc(r.name)}`;
        items.push(`<button type="button" role="menuitem" data-act="fill" data-role="${r.id}" aria-pressed="${r.filled}">${label}</button>`);
      }
      if (items.length) items.push(`<div class="card-menu-sep" role="separator"></div>`);
      if (hasImages && img) items.push(`<button type="button" role="menuitem" data-act="image-remove">Bild entfernen</button>`);
      items.push(`<button type="button" role="menuitem" data-act="close">${p.closed ? "Wieder öffnen" : "Projekt schließen"}</button>`);
    }
    if (mine || v.isAdmin) {
      if (items.length) items.push(`<div class="card-menu-sep" role="separator"></div>`);
      items.push(`<button type="button" role="menuitem" class="is-danger" data-act="delete">Löschen</button>`);
    }
    if (!items.length) return "";
    return `<div class="card-menu">
      <button type="button" class="card-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Aktionen"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg></button>
      <div class="card-menu-pop" popover="auto" role="menu">${items.join("")}</div>
    </div>`;
  }

  function bannerHtml(p, canEditImage, img) {
    if (!img && !canEditImage) return "";
    const box = `<div class="project-image${img ? "" : " is-empty"}"${img ? ` data-project-image="${esc(img)}" data-alt="${esc(p.title)}"` : ""}${canEditImage ? ' data-image-drop tabindex="0" aria-label="Titelbild"' : ""}></div>`;
    if (canEditImage || isDetail) return box;
    return `<a class="project-image-link" href="${detailHref(p.id)}" tabindex="-1" aria-hidden="true">${box}</a>`;
  }

  function hoursSpan(roles) {
    const vals = (roles || []).map((r) => Number(r.hours)).filter((h) => h > 0);
    if (!vals.length) return "—";
    const min = Math.min(...vals), max = Math.max(...vals);
    return min === max ? `${min} Std.` : `${min}–${max} Std.`;
  }

  function appsSummaryHtml(p, mine) {
    if (!(mine || v.isAdmin)) return "";
    const parts = [...(p.roles || [])].sort((a, b) => a.id - b.id).map((r) => {
      const n = roleInterest(r.id).length;
      return n ? `<li><a class="pd-apps-link" href="#role-${r.id}">${esc(r.name)} · ${n} neu</a></li>` : null;
    }).filter(Boolean);
    return `<div class="pd-apps" aria-label="Bewerbungen">
      <h2>Bewerbungen</h2>
      ${parts.length ? `<ul>${parts.join("")}</ul>` : `<p class="pd-apps-empty">0 Bewerbungen</p>`}
    </div>`;
  }

  function detailMainHtml(p, owner, mine, extra, roles) {
    const timeframe = extra.timeframe || "";
    const goals = extra.goals.filter(Boolean);
    const tags = extra.tags.filter(Boolean);
    const links = extra.links.filter((l) => l?.url);
    const members = [
      { name: owner.name || "Mitglied", role: "Ersteller", avatar_path: owner.avatar_path },
      ...extra.team.filter((m) => m?.name),
    ];
    const openRoles = roles.filter((r) => !r.filled);
    const aboutBody = p.body
      ? `<div class="project-body">${richText(p.body)}</div>`
      : `<p class="project-body project-body-empty">${esc(p.pitch)}</p>`;
    return `
      <section class="project-section pd-about"><h2>Über das Projekt</h2>${aboutBody}
        ${goals.length ? `<ul class="project-goals">${goals.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>` : ""}
        ${tags.length ? `<div class="tags">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
        ${timeframe ? `<p class="pd-timeframe">${esc(timeframe)}</p>` : ""}
        ${links.length ? `<ul class="project-links">${links.map((l) => `<li><a class="text-link" href="${esc(normalizeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.label || l.url)}</a></li>`).join("")}</ul>` : ""}
      </section>
      <section class="project-section pd-team"><h2>Team</h2>
        <ul class="project-team">
          ${members.map((m) => `<li>${avatar(m.name, "avatar-sm", m.avatar_path)}<div><strong>${esc(m.name)}</strong><span>${esc(m.role || "Mitglied")}</span></div></li>`).join("")}
          ${openRoles.map((r) => `<li class="pd-team-slot"><button type="button" class="pd-slot-btn" data-act="jump-role" data-role="${r.id}"><span class="pd-slot-avatar" aria-hidden="true">?</span><div><strong>Deine Rolle?</strong><span>${esc(r.name)}</span></div></button></li>`).join("")}
        </ul>
      </section>
      <section class="project-section pd-comments">
        <details class="content-comments" open data-comment-kind="project" data-comment-id="${p.id}" data-comment-owner="${esc(p.owner_id)}" data-comment-closed="${p.closed}"><summary>Kommentare</summary></details>
      </section>`;
  }

  function projectHtml(p) {
    const owner = p.owner || { name: "Mitglied" };
    const mine = !!(v.me && p.owner_id === v.me.id);
    const roles = [...(p.roles || [])].sort((a, b) => a.id - b.id);
    const open = roles.filter((r) => !r.filled).length;
    const img = IMG_RE.test(p.image_path || "") ? p.image_path : "";
    const canEditImage = !!(mine && hasImages);
    const apps = roleInterestForProject(p).length;
    const extra = projectExtras(p);
    const rolesBlock = `<div class="project-roles">
        <h3>${open ? `${open} offene ${open === 1 ? "Rolle" : "Rollen"}` : "Alle Rollen besetzt"}</h3>
        <ul>${roles.map((r) => roleHtml(p, r, mine, extra)).join("")}</ul>
      </div>`;
    if (isDetail) {
      const status = projectStatus(p);
      const phase = PHASE_LABEL[p.phase] || "Idee";
      const teamSize = 1 + extra.team.filter((m) => m?.name).length;
      const created = p.created_at
        ? new Date(p.created_at).toLocaleDateString(document.documentElement.lang === "en" ? "en-GB" : "de-DE", { dateStyle: "medium" })
        : "";
      const metaBits = [
        `<strong>${esc(owner.name || "Mitglied")}</strong>`,
        p.place ? esc(p.place) : "",
        created ? esc(created) : "",
        p.is_public ? "öffentlich" : "",
      ].filter(Boolean);
      const showApplyBar = open > 0 && !mine && !p.closed;
      return `<article class="project${p.closed ? " closed" : ""}${img || canEditImage ? " has-banner" : ""}${img ? " has-image" : ""}" data-id="${p.id}" aria-labelledby="p-${p.id}">
        <div class="pd-hero${img || canEditImage ? " has-media" : ""}">
          ${bannerHtml(p, canEditImage, img) || `<div class="project-image is-empty" aria-hidden="true"></div>`}
          <div class="pd-hero-copy">
            <p class="pd-badges"><span class="project-status status-${status.key}">${esc(status.label)}</span><span class="phase-label phase-${esc(p.phase || "idee")}">${esc(phase)}</span></p>
            <h1 class="project-title" id="p-${p.id}">${esc(p.title)}</h1>
            <p class="project-pitch">${esc(p.pitch)}</p>
          </div>
          <div class="pd-hero-toolbar">
            <button type="button" class="pd-share" data-act="share">Teilen</button>
            ${cardMenu(p, mine, img, roles)}
          </div>
        </div>
        <div class="pd-meta-row">${avatar(owner.name, "avatar-sm", owner.avatar_path)}<p>${metaBits.join(" · ")}</p></div>
        <dl class="pd-stats" aria-label="Projektkennzahlen">
          <div><dt>Phase</dt><dd>${esc(phase)}</dd></div>
          <div><dt>Offene Rollen</dt><dd>${open}</dd></div>
          <div><dt>Team</dt><dd>${teamSize}</dd></div>
          <div><dt>Std./Woche</dt><dd>${esc(hoursSpan(roles))}</dd></div>
        </dl>
        <div class="project-detail-layout">
          <div class="project-detail-main">${detailMainHtml(p, owner, mine, extra, roles)}</div>
          <aside class="project-detail-aside" id="pd-roles" aria-label="Offene Rollen">
            ${appsSummaryHtml(p, mine)}
            <div class="project-roles">
              <h2>Offene Rollen</h2>
              <ul>${roles.map((r) => roleHtml(p, r, mine, extra)).join("")}</ul>
            </div>
            <div class="pd-creator">
              ${avatar(owner.name, "avatar-md", owner.avatar_path)}
              <div><strong>${esc(owner.name || "Mitglied")}</strong><span>Ersteller</span></div>
              ${v.canAct && !mine && !p.closed ? `<a class="btn btn-small btn-ghost pd-msg" href="nachrichten?an=${esc(p.owner_id)}">Nachricht schreiben</a>` : !v.me ? `<a class="text-link" href="/login?next=${encodeURIComponent(`projekte?projekt=${p.id}`)}">Einloggen, um zu schreiben</a>` : ""}
            </div>
          </aside>
        </div>
        ${showApplyBar ? `<div class="pd-mobile-bar" data-mobile-apply><a class="btn pd-mobile-apply" href="#pd-roles">Auf eine Rolle bewerben</a></div>` : ""}
        <p class="post-error" data-error role="alert" hidden></p>
      </article>`;
    }
    const status = projectStatus(p);
    return `<article class="project is-clickable${p.closed ? " closed" : ""}${img || canEditImage ? " has-banner" : ""}${img ? " has-image" : ""}" data-id="${p.id}" data-href="${detailHref(p.id)}" aria-labelledby="p-${p.id}">
      ${bannerHtml(p, canEditImage, img)}
      ${cardMenu(p, mine, img, roles)}
      <header class="project-heading">
        <p class="project-kicker"><span class="project-status status-${status.key}">${esc(status.label)}</span><span class="phase-label phase-${esc(p.phase || "idee")}">${PHASE_LABEL[p.phase] || "Idee"}</span>${p.place ? `<span class="project-place">${esc(p.place)}</span>` : ""}</p>
        <h2 class="project-title" id="p-${p.id}"><a href="${detailHref(p.id)}">${esc(p.title)}</a></h2>
      </header>
      <p class="project-pitch">${esc(p.pitch)}</p>
      <div class="project-meta">${avatar(owner.name, "avatar-sm", owner.avatar_path)}<p>${esc(owner.name)} · ${timeAgo(p.created_at)}${p.is_public ? " · öffentlich" : ""}</p></div>
      ${rolesBlock}
      <a class="project-open" href="${detailHref(p.id)}">${mine ? `Bewerbungen ansehen (${apps})` : "Projekt öffnen &amp; bewerben"}</a>
      <p class="post-error" data-error role="alert" hidden></p>
    </article>`;
  }

  const roleInterestForProject = p => interest.filter(i => p.roles.some(r => r.id === i.role_id) && i.member_id !== p.owner_id);
  let initialAnchor = false;
  function render() {
    els.list.setAttribute("aria-busy", "false");
    if (!ready) {
      els.list.innerHTML = `<div class="empty-block"><strong>Projekte werden gerade eingerichtet.</strong><p>Sobald alles bereit ist, kannst du hier ein Projekt mit offenen Rollen anlegen. Bis dahin findest du Gesuche in der <a class="text-link" href="boerse">Börse</a>.</p></div>`;
      return;
    }
    const list = projects.filter((p) =>
      filter === "offen" ? !p.closed && (p.roles || []).some((r) => !r.filled)
      : filter === "meine" ? v.me && p.owner_id === v.me.id
      : true);
    els.list.innerHTML = list.length ? list.map(projectHtml).join("") : isDetail ? "" : `<div class="empty-block">${
      filter === "meine" ? "<strong>Du hast noch kein Projekt angelegt.</strong><p>Beschreib dein Vorhaben in einem Satz und sag, wer dir fehlt.</p>"
      : filter === "offen" ? "<strong>Gerade sind keine Rollen offen.</strong><p>Schau später noch einmal vorbei.</p>"
      : `<strong>Noch keine Projekte.</strong><p>${v.canAct ? "Leg das erste an: Was baust du, und wer fehlt dir?" : "Sobald Mitglieder ihre Projekte teilen, findest du sie hier."}</p>`}</div>`;
    if (isDetail) {
      els.list.classList.add("project-detail");
      els.list.insertAdjacentHTML("afterbegin", '<a class="text-link project-detail-back" href="/projekte">← Zurück zur Übersicht</a>');
      if (!list.length) {
        document.title = "Projekt nicht gefunden – Xyntal";
        els.list.innerHTML = `<div class="empty-block project-not-found"><strong>Projekt nicht gefunden</strong><p>Dieses Projekt existiert nicht oder ist für dich nicht sichtbar.</p><p><a class="text-link" href="/projekte">← Zurück zur Übersicht</a></p></div>`;
      } else {
        document.title = `${list[0].title} – Xyntal`;
        const head = document.querySelector(".page-head .wrap");
        if (head) {
          head.querySelector(".eyebrow").innerHTML = `<b>xyntal</b> / <a href="/projekte">projekte</a> / detail`;
          head.querySelector("h1").hidden = true;
          head.querySelector("p")?.setAttribute("hidden", "");
        }
      }
    }
    window.XyntalComments?.mount(els.list);
    hydrateImages(els.list);
    setupMobileApplyBar(els.list);
    if (!initialAnchor && /^#p-\d+$/.test(location.hash)) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) { initialAnchor = true; target.style.scrollMarginTop = "100px"; target.scrollIntoView({block: "start"}); }
    }
  }

  let mobileApplyIo = null;
  function setupMobileApplyBar(root) {
    mobileApplyIo?.disconnect();
    mobileApplyIo = null;
    const bar = root.querySelector("[data-mobile-apply]");
    const roles = root.querySelector("#pd-roles");
    if (!bar || !roles) return;
    const sync = (visible) => { bar.hidden = visible; document.body.classList.toggle("pd-mobile-apply-on", !visible); };
    mobileApplyIo = new IntersectionObserver(([e]) => sync(e.isIntersecting), { root: null, threshold: 0.12, rootMargin: "0px 0px -48px 0px" });
    mobileApplyIo.observe(roles);
    sync(false);
  }

  /* ---------- Laden ---------- */

  async function load() {
    try {
      const cols = (img) => `id, title, pitch, body, phase, place, is_public, closed, created_at, owner_id${img ? ", image_path" : ""}, owner:profiles!projects_owner_id_fkey(id, name, headline, avatar_path), roles:project_roles(id, name, need, hours, filled)`;
      const run = (img) => {
        let query = sb.from("projects").select(cols(img));
        if (isDetail) query = query.eq("id", detailId);
        return query.order("closed").order("created_at", { ascending: false }).limit(100);
      };
      let res = await run(hasImages);
      if (res.error && hasImages && isMissingImageColumn(res.error)) { hasImages = false; res = await run(false); }
      projects = unwrap(res);
      const field = document.getElementById("project-image-field");
      if (field) field.hidden = !hasImages;
      interest = v.me ? unwrap(await sb.from("project_interest")
        .select("role_id, member_id, note, created_at, member:profiles!project_interest_member_id_fkey(id, name, headline, avatar_path)")) : [];
      ready = true;
    } catch (err) {
      if (isMissingTable(err)) { ready = false; els.newBtn.hidden = true; }
      else { els.list.innerHTML = `<p class="empty">${esc(friendlyError(err))}</p>`; return; }
    }
    render();
  }

  /* ---------- Formular ---------- */

  function roleRow(r = {}) {
    const i = els.rows.children.length + 1;
    const row = document.createElement("div");
    row.className = "role-edit";
    row.innerHTML = `
      <label>Rolle ${i}<input type="text" name="role_name" maxlength="60" placeholder="z. B. Mobile-Entwicklung" value="${esc(r.name || "")}" required></label>
      <label>Wofür?<input type="text" name="role_need" maxlength="200" placeholder="z. B. App für iOS und Android" value="${esc(r.need || "")}"></label>
      <label>Std./Woche<input type="number" name="role_hours" min="1" max="60" inputmode="numeric" value="${r.hours ? esc(r.hours) : ""}"></label>
      <button type="button" class="role-remove" aria-label="Rolle ${i} entfernen">Entfernen</button>`;
    els.rows.append(row);
    syncRoleButtons();
    return row;
  }
  function syncRoleButtons() {
    const rows = [...els.rows.children];
    rows.forEach((row, idx) => {
      row.querySelector("label").firstChild.textContent = `Rolle ${idx + 1}`;
      const btn = row.querySelector(".role-remove");
      btn.setAttribute("aria-label", `Rolle ${idx + 1} entfernen`);
      btn.hidden = rows.length === 1;
    });
    els.addRole.hidden = rows.length >= MAX_ROLES;
  }

  function openForm() {
    els.form.hidden = false;
    els.newBtn.hidden = true;
    els.rows.innerHTML = "";
    let demo = [];
    try { demo = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { /* egal */ }
    if (Array.isArray(demo) && demo.length) {
      demo.slice(0, MAX_ROLES).forEach((r) => roleRow(r));
      document.getElementById("from-demo").hidden = false;
    } else {
      roleRow();
    }
    els.form.elements.title.focus();
  }
  function closeForm() {
    resetPreview();
    els.form.hidden = true;
    els.newBtn.hidden = !v.canAct;
    els.form.reset();
    setStatus(els.status, "");
  }

  const imgInput = els.form.elements.image;
  const imgPreview = document.getElementById("project-image-preview");
  let previewUrl = "";
  function resetPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    if (imgPreview) { imgPreview.hidden = true; imgPreview.innerHTML = ""; }
  }
  imgInput?.addEventListener("change", () => {
    resetPreview();
    const f = imgInput.files?.[0];
    if (!f || !imgPreview) return;
    previewUrl = URL.createObjectURL(f);
    imgPreview.innerHTML = `<img src="${previewUrl}" alt=""><button type="button" class="btn btn-ghost btn-small" data-clear-image>Anderes Bild</button>`;
    imgPreview.hidden = false;
    imgPreview.querySelector("[data-clear-image]").addEventListener("click", () => { imgInput.value = ""; resetPreview(); imgInput.click(); });
  });

  els.newBtn.addEventListener("click", openForm);
  document.getElementById("cancel-project").addEventListener("click", () => { closeForm(); els.newBtn.focus(); });
  els.addRole.addEventListener("click", () => roleRow().querySelector("input").focus());
  els.rows.addEventListener("click", (e) => {
    const btn = e.target.closest(".role-remove");
    if (!btn) return;
    const row = btn.closest(".role-edit");
    const next = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    syncRoleButtons();
    next?.querySelector("input")?.focus();
  });

  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const roles = [...els.rows.children].map((row) => ({
      name: row.querySelector('[name="role_name"]').value.trim(),
      need: row.querySelector('[name="role_need"]').value.trim(),
      hours: Number(row.querySelector('[name="role_hours"]').value) || null,
    })).filter((r) => r.name || r.need);
    submitWith(els.form, els.status, async (data) => {
      if (!data.title || !data.pitch) throw new Error("Bitte gib einen Namen und einen Satz zum Projekt an.");
      if (!roles.length) throw new Error("Beschreib mindestens eine offene Rolle.");
      if (roles.some((r) => !r.name)) throw new Error("Jede Rolle braucht einen Namen.");
      if (roles.some((r) => r.hours && (r.hours < 1 || r.hours > 60))) throw new Error("Stunden pro Woche bitte zwischen 1 und 60.");
      let imagePath = "";
      const file = els.form.elements.image?.files?.[0];
      if (file && hasImages) imagePath = await uploadImage(await prepareImage(file));
      let project;
      try {
        project = unwrap(await sb.from("projects").insert({
          title: data.title, pitch: data.pitch, body: data.body, phase: data.phase, place: data.place, is_public: data.is_public,
          ...(imagePath ? { image_path: imagePath } : {}),
        }).select("id").single());
      } catch (err) { await removeImage(imagePath); throw err; }
      try {
        unwrap(await sb.from("project_roles").insert(roles.map((r) => ({ ...r, project_id: project.id }))));
      } catch (err) {
        await sb.from("projects").delete().eq("id", project.id); // nichts Halbes stehen lassen
        throw err;
      }
      try { localStorage.removeItem(DEMO_KEY); } catch { /* egal */ }
      closeForm();
      await load();
      document.getElementById(`p-${project.id}`)?.closest(".project")?.scrollIntoView({ block: "start" });
      setStatus(els.status, "");
    });
  });

  const application = document.createElement("dialog");
  application.className = "apply-dialog";
  application.setAttribute("aria-labelledby", "apply-title");
  document.body.append(application);
  function openApplication(project, role, trigger) {
    const name = v.me?.name || "";
    const contact = v.me?.email || "";
    application.innerHTML = `<form novalidate>
      <p class="hint">${esc(project.title)}</p>
      <h2 id="apply-title">Für ${esc(role.name)} bewerben</h2>
      <p>Erzähl kurz, warum du mitmachen möchtest und was du mitbringst.</p>
      <label>Name <input type="text" name="name" required maxlength="80" value="${esc(name)}" autocomplete="name"></label>
      <label>E-Mail / Kontakt <input type="text" name="contact" required maxlength="120" value="${esc(contact)}" autocomplete="email" placeholder="E-Mail oder anderer Kontakt"></label>
      <label>Motivation <textarea name="note" required maxlength="400" rows="5" placeholder="Warum du passt, Skills und Verfügbarkeit …"></textarea></label>
      <label>Portfolio-Link <span class="hint">optional</span><input type="url" name="portfolio" maxlength="200" placeholder="https://…" inputmode="url"></label>
      <p class="hint">Motivation max. 400 Zeichen. Sichtbar für dich und den Projektbesitzer.</p>
      <div class="btn-row"><button class="btn" type="submit">Bewerbung senden</button><button class="btn btn-ghost" type="button" data-cancel-apply>Abbrechen</button></div>
      <p role="status" class="form-status"></p>
    </form>`;
    application.querySelector("[data-cancel-apply]").addEventListener("click", () => application.close());
    application.addEventListener("close", () => trigger?.isConnected && trigger.focus(), { once: true });
    application.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const btn = form.querySelector('[type="submit"]');
      const out = form.querySelector('[role="status"]');
      const applicant = form.elements.name.value.trim();
      const contactVal = form.elements.contact.value.trim();
      const motivation = form.elements.note.value.trim();
      const portfolio = form.elements.portfolio.value.trim();
      if (!applicant || !contactVal) { out.textContent = "Bitte gib Name und Kontakt an."; return; }
      if (!motivation) { out.textContent = "Bitte beschreibe kurz deine Motivation."; return; }
      const parts = [motivation, `Name: ${applicant}`, `Kontakt: ${contactVal}`];
      if (portfolio) parts.push(`Portfolio: ${portfolio}`);
      const note = parts.join("\n").slice(0, 500);
      btn.disabled = true;
      out.textContent = "Wird gesendet …";
      try {
        unwrap(await sb.from("project_interest").insert({ role_id: role.id, note }));
        application.innerHTML = `<div class="apply-done"><h2 id="apply-title">Bewerbung gesendet</h2><p>Danke! Der Projektbesitzer kann deine Bewerbung jetzt sehen.</p><button class="btn" type="button" data-close-apply>Schließen</button></div>`;
        application.querySelector("[data-close-apply]").addEventListener("click", () => application.close());
        await load();
        const feedback = els.list.querySelector(`[data-id="${project.id}"] [data-error]`);
        if (feedback) {
          feedback.hidden = false;
          feedback.className = "form-status";
          feedback.setAttribute("role", "status");
          feedback.textContent = "Deine Bewerbung wurde gesendet. Der Projektbesitzer kann sie jetzt sehen.";
        }
      } catch (err) {
        out.textContent = err?.code === "23505" ? "Du hast dich bereits für diese Rolle beworben." : friendlyError(err);
        btn.disabled = false;
      }
    });
    application.showModal();
    application.querySelector(name ? '[name="note"]' : '[name="name"]')?.focus();
  }

  /* ---------- Aktionen in der Liste ---------- */

  function placeMenu(pop, btn) {
    pop.style.visibility = "hidden";
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let top = r.bottom + 8;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
    let left = r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.style.visibility = "visible";
  }
  els.list.addEventListener("toggle", (e) => {
    const pop = e.target;
    if (!(pop instanceof HTMLElement) || !pop.classList.contains("card-menu-pop")) return;
    const menu = pop.parentElement;
    const btn = menu?.querySelector(".card-menu-btn");
    const open = e.newState === "open";
    menu?.classList.toggle("is-open", open);
    btn?.setAttribute("aria-expanded", String(open));
    if (!open || !btn) return;
    requestAnimationFrame(() => {
      if (!pop.matches(":popover-open")) return;
      placeMenu(pop, btn);
      pop.querySelector("button")?.focus();
    });
  }, true);
  els.list.addEventListener("keydown", (e) => {
    const pop = e.target.closest?.(".card-menu-pop");
    if (!pop) return;
    const items = [...pop.querySelectorAll("button")];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); items[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); items.at(-1)?.focus(); }
  });
  const closeOpenMenu = () => document.querySelector(".card-menu-pop:popover-open")?.hidePopover();
  window.addEventListener("resize", closeOpenMenu);
  window.addEventListener("scroll", closeOpenMenu, { passive: true });

  function pickImageFile() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "image/jpeg,image/png,image/webp";
    return new Promise((res) => {
      picker.addEventListener("change", () => res(picker.files?.[0] || null), { once: true });
      picker.addEventListener("cancel", () => res(null), { once: true });
      picker.click();
    });
  }
  async function applyProjectImage(p, file) {
    const path = await uploadImage(await prepareImage(file));
    try { unwrap(await sb.from("projects").update({ image_path: path }).eq("id", p.id)); }
    catch (err) { await removeImage(path); throw err; }
    const old = p.image_path;
    p.image_path = path;
    await removeImage(old);
  }
  async function saveBannerImage(zone, file) {
    const card = zone.closest(".project");
    const p = projects.find((x) => x.id === Number(card.dataset.id));
    const errorEl = card.querySelector("[data-error]");
    if (!p || !file) return;
    errorEl.hidden = true;
    zone.setAttribute("aria-busy", "true");
    try {
      await applyProjectImage(p, file);
      render();
      document.querySelector(`[data-id="${p.id}"] [data-image-drop]`)?.focus();
    } catch (err) {
      zone.removeAttribute("aria-busy");
      errorEl.textContent = friendlyError(err);
      errorEl.hidden = false;
    }
  }
  const imageZone = (target) => target?.closest?.("[data-image-drop]");
  els.list.addEventListener("dragover", (e) => {
    const zone = imageZone(e.target);
    if (!zone || !els.list.contains(zone)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    zone.classList.add("is-drag");
  });
  els.list.addEventListener("dragleave", (e) => {
    const zone = imageZone(e.target);
    if (!zone || zone.contains(e.relatedTarget)) return;
    zone.classList.remove("is-drag");
  });
  els.list.addEventListener("drop", (e) => {
    const zone = imageZone(e.target);
    if (!zone || !els.list.contains(zone)) return;
    e.preventDefault();
    zone.classList.remove("is-drag");
    const file = [...(e.dataTransfer?.files || [])][0];
    if (file) saveBannerImage(zone, file);
  });
  els.list.addEventListener("dblclick", (e) => {
    const zone = imageZone(e.target);
    if (!zone || !els.list.contains(zone)) return;
    e.preventDefault();
    pickImageFile().then((file) => { if (file) saveBannerImage(zone, file); });
  });
  els.list.addEventListener("keydown", (e) => {
    const zone = e.target?.closest?.("[data-image-drop]") === e.target ? e.target : null;
    if (zone && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      pickImageFile().then((file) => { if (file) saveBannerImage(zone, file); });
      return;
    }
  });

  els.list.addEventListener("click", async (e) => {
    if (!isDetail) {
      const card = e.target.closest(".project.is-clickable");
      if (card && els.list.contains(card) && !e.target.closest("a[href], button, summary, input, textarea, select, label, .card-menu, [data-image-drop]")) {
        location.assign(card.dataset.href || detailHref(card.dataset.id));
        return;
      }
    }
    const menuBtn = e.target.closest(".card-menu-btn");
    if (menuBtn && els.list.contains(menuBtn)) {
      const pop = menuBtn.closest(".card-menu").querySelector(".card-menu-pop");
      if (pop.matches(":popover-open")) pop.hidePopover();
      else pop.showPopover();
      return;
    }
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".project");
    const id = Number(card.dataset.id);
    const p = projects.find((x) => x.id === id);
    const roleEl = btn.closest("[data-role]");
    const roleId = btn.dataset.role || roleEl?.dataset.role;
    const role = roleId && p?.roles?.find((r) => r.id === Number(roleId));
    const errorEl = card?.querySelector("[data-error]");
    if (errorEl) errorEl.hidden = true;
    try {
      if (btn.dataset.act === "jump-role") {
        const target = document.getElementById(`role-${roleId}`);
        target?.style.setProperty("scroll-margin-top", "96px");
        target?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        target?.classList.add("is-flash");
        setTimeout(() => target?.classList.remove("is-flash"), 1200);
        return;
      }
      if (btn.dataset.act === "share") {
        const url = location.href.split("#")[0];
        try {
          await navigator.clipboard.writeText(url);
          const prev = btn.textContent;
          btn.textContent = "Link kopiert";
          btn.classList.add("is-done");
          setTimeout(() => { if (btn.isConnected) { btn.textContent = prev; btn.classList.remove("is-done"); } }, 1800);
        } catch {
          window.prompt("Link zum Teilen:", url);
        }
        return;
      }
      btn.disabled = true;
      if (btn.dataset.act === "join") {
        openApplication(p, role, btn);
        btn.disabled = false;
        return;
      } else if (btn.dataset.act === "leave") {
        unwrap(await sb.from("project_interest").delete().eq("role_id", role.id).eq("member_id", v.me.id));
        interest = interest.filter((i) => !(i.role_id === role.id && i.member_id === v.me.id));
      } else if (btn.dataset.act === "fill") {
        unwrap(await sb.from("project_roles").update({ filled: !role.filled }).eq("id", role.id));
        role.filled = !role.filled;
      } else if (btn.dataset.act === "image") {
        const file = await pickImageFile();
        if (!file) { btn.disabled = false; return; }
        btn.textContent = "Bild wird gespeichert …";
        await applyProjectImage(p, file);
      } else if (btn.dataset.act === "image-remove") {
        unwrap(await sb.from("projects").update({ image_path: "" }).eq("id", id));
        const old = p.image_path; p.image_path = ""; await removeImage(old);
      } else if (btn.dataset.act === "close") {
        unwrap(await sb.from("projects").update({ closed: !p.closed }).eq("id", id));
        p.closed = !p.closed;
      } else if (btn.dataset.act === "delete") {
        if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Wirklich löschen?"; btn.disabled = false; return; }
        unwrap(await sb.from("projects").delete().eq("id", id));
        projects = projects.filter((x) => x.id !== id);
      }
      const focusKey = btn.dataset.act === "leave" && roleId
        ? `[data-id="${id}"] [data-role="${roleId}"] button[data-act="join"], [data-id="${id}"] [data-role="${roleId}"] .role-join`
        : btn.dataset.act === "join" && roleId
        ? `[data-id="${id}"] [data-role="${roleId}"] button[data-act]`
        : `[data-id="${id}"] .card-menu-btn`;
      render();
      document.querySelector(focusKey)?.focus();
    } catch (err) {
      btn.disabled = false;
      if (errorEl) {
        errorEl.textContent = friendlyError(err);
        errorEl.hidden = false;
      }
    }
  });

  document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    filter = b.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  }));

  (async () => {
    v = await viewer();
    if (isDetail) {
      document.querySelector('.board-bar').hidden = true;
      document.querySelector('.feed-filter').hidden = true;
      document.body.classList.add('project-detail-page');
    }
    els.notice.innerHTML = accessNotice(v, "Projekte anlegen und dich für Rollen melden", { open: true });
    els.mine.hidden = !v.me;
    await load();
    // Sprung von der Startseite zu einem bestimmten Projekt
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) { target.closest(".project")?.scrollIntoView({ block: "start" }); target.closest(".project")?.setAttribute("tabindex", "-1"); target.closest(".project")?.focus({ preventScroll: true }); }
    if (v.canAct && ready && !isDetail) {
      els.newBtn.hidden = false;
      if (new URLSearchParams(location.search).get("neu") === "1") openForm();
    }
  })();
})();
