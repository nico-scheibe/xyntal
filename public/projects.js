// Projekte mit offenen Rollen. Rechte prüft zusätzlich die Datenbank (supabase/009_projects.sql, 018_open_projects_messages.sql).
// Anlegen, melden und anschreiben geht mit Konto – ohne auf die Freischaltung zu warten.
(() => {
  const PHASE_LABEL = { idee: "Idee", prototyp: "Prototyp", erste_kunden: "Erste Kunden", wachstum: "Wachstum" };
  const MAX_ROLES = 8;
  const detailId = new URLSearchParams(location.search).get("projekt");
  const isDetail = /^\d+$/.test(detailId || "");
  const DEMO_KEY = "xyntal-wunschrollen";

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

  function roleHtml(p, r, mine) {
    const meta = [r.need && esc(r.need), r.hours && `${r.hours} Std./Woche`].filter(Boolean).join(" · ");
    let action = "";
    if (mine) {
      const people = roleInterest(r.id);
      action = `
        <button type="button" class="role-toggle" data-act="fill" aria-pressed="${r.filled}">${r.filled ? "Besetzt" : "Als besetzt markieren"}</button>
        ${people.length ? `<details class="role-people"><summary>${people.length} ${people.length === 1 ? "Bewerbung" : "Bewerbungen"}</summary><ul>
          ${people.map((i) => `<li>${avatar(i.member?.name || "Mitglied", "avatar-sm", i.member?.avatar_path)}<div><strong>${esc(i.member?.name || "Mitglied")}</strong>${i.member?.headline ? `<span>${esc(i.member.headline)}</span>` : ""}${i.note ? `<p>${esc(i.note)}</p>` : ""}</div><a class="btn btn-small btn-ghost" href="nachrichten?an=${esc(i.member_id)}">Nachricht</a></li>`).join("")}
        </ul></details>` : `<span class="role-quiet">Noch keine Bewerbung</span>`}`;
    } else if (r.filled) {
      action = `<span class="tag">Besetzt</span>`;
    } else if (v.canAct && !p.closed) {
      action = myInterest(r.id)
        ? `<button type="button" class="role-join is-on" data-act="leave" aria-pressed="true">Bewerbung zurückziehen</button>`
        : `<button type="button" class="role-join" data-act="join" aria-pressed="false">Jetzt bewerben</button>`;
    } else if (!v.me) {
      action = `<a class="text-link" href="/login?next=${encodeURIComponent(`projekte?projekt=${p.id}`)}">Einloggen, um dich zu bewerben</a>`;
    }
    return `<li class="role-row${r.filled ? " is-filled" : ""}" data-role="${r.id}">
      <div class="role-info"><strong>${esc(r.name)}</strong>${meta ? `<span>${meta}</span>` : ""}</div>
      <div class="role-action">${action}</div>
    </li>`;
  }

  function projectHtml(p) {
    const owner = p.owner || { name: "Mitglied" };
    const mine = v.me && p.owner_id === v.me.id;
    const roles = [...(p.roles || [])].sort((a, b) => a.id - b.id);
    const open = roles.filter((r) => !r.filled).length;
    const img = IMG_RE.test(p.image_path || "") ? p.image_path : "";
    const imgBox = img ? `<div class="project-image" data-project-image="${esc(img)}" data-alt="${esc(p.title)}"></div>` : "";
    return `<article class="project${p.closed ? " closed" : ""}${img ? " has-image" : ""}" data-id="${p.id}" aria-labelledby="p-${p.id}">
      ${img ? (isDetail ? imgBox : `<a class="project-image-link" href="/projekte?projekt=${p.id}" tabindex="-1" aria-hidden="true">${imgBox}</a>`) : ""}
      <div class="listing-top">
        <span class="tag tag-update">${PHASE_LABEL[p.phase] || "Idee"}</span>
        ${p.place ? `<span class="tag">${esc(p.place)}</span>` : ""}
        ${p.closed ? `<span class="tag">Geschlossen</span>` : ""}
      </div>
      <h2 class="project-title" id="p-${p.id}">${isDetail ? esc(p.title) : `<a href="/projekte?projekt=${p.id}">${esc(p.title)}</a>`}</h2>
      <p class="project-pitch">${esc(p.pitch)}</p>
      ${isDetail && p.body ? `<div class="project-body">${richText(p.body)}</div>` : p.body ? `<details class="project-more"><summary>Mehr dazu</summary><p>${richText(p.body)}</p></details>` : ""}
      ${mine && isDetail ? `<div class="applications-heading"><strong>${roleInterestForProject(p).length} ${roleInterestForProject(p).length === 1 ? "Bewerbung" : "Bewerbungen"}</strong><p>Die Bewerbungen findest du unten bei der jeweiligen Rolle. Nur du und die jeweilige Person haben Zugriff darauf.</p></div>` : ""}
      ${!isDetail ? `<a class="text-link project-open" href="/projekte?projekt=${p.id}">Projekt öffnen &amp; bewerben →</a>` : ""}
      <div class="project-roles">
        <h3>${open ? `${open} offene ${open === 1 ? "Rolle" : "Rollen"}` : "Alle Rollen besetzt"}</h3>
        <ul>${roles.map((r) => roleHtml(p, r, mine)).join("")}</ul>
      </div>
      <div class="listing-foot">
        <div class="listing-author">${avatar(owner.name, "avatar-sm", owner.avatar_path)}<div><strong>${esc(owner.name)}</strong><span>${timeAgo(p.created_at)}${p.is_public ? " · öffentlich" : ""}</span></div></div>
        <div class="post-actions">
          ${v.canAct && !mine && !p.closed ? `<a class="btn btn-small btn-ghost" href="nachrichten?an=${esc(p.owner_id)}">Nachricht</a>` : ""}
          ${mine && hasImages ? `<button type="button" data-act="image">${img ? "Bild ändern" : "Bild hinzufügen"}</button>` : ""}
          ${mine && hasImages && img ? `<button type="button" data-act="image-remove">Bild entfernen</button>` : ""}
          ${mine ? `<button type="button" data-act="close">${p.closed ? "Wieder öffnen" : "Projekt schließen"}</button>` : ""}
          ${mine || v.isAdmin ? `<button type="button" data-act="delete">Löschen</button>` : ""}
        </div>
      </div>
      <p class="post-error" data-error role="alert" hidden></p>
      ${isDetail ? `<details class="content-comments" data-comment-kind="project" data-comment-id="${p.id}" data-comment-owner="${esc(p.owner_id)}" data-comment-closed="${p.closed}"><summary>Kommentare &amp; Fragen</summary></details>` : ""}
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
      els.list.insertAdjacentHTML("afterbegin", '<a class="text-link project-detail-back" href="/projekte">← Alle Projekte</a>');
      if (!list.length) els.list.innerHTML += '<p class="empty">Dieses Projekt ist nicht verfügbar oder nicht für dich sichtbar.</p>';
      if (list[0]) document.title = `${list[0].title} – Xyntal`;
    }
    window.XyntalComments?.mount(els.list);
    hydrateImages(els.list);
    if (!initialAnchor && /^#p-\d+$/.test(location.hash)) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) { initialAnchor = true; target.style.scrollMarginTop = "100px"; target.scrollIntoView({block: "start"}); }
    }
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
    application.innerHTML = `<form><p class="hint">${esc(project.title)}</p><h2 id="apply-title">Für ${esc(role.name)} bewerben</h2><p>Erzähl kurz, warum du mitmachen möchtest, was du mitbringst und wie viel Zeit du hast.</p><label>Deine Bewerbung<textarea name="note" required maxlength="500" rows="6" placeholder="Deine Motivation, passende Skills und Verfügbarkeit …"></textarea></label><p class="hint">Maximal 500 Zeichen. Sichtbar für dich und den Projektbesitzer.</p><div class="btn-row"><button class="btn" type="submit">Bewerbung senden</button><button class="btn btn-ghost" type="button" data-cancel-apply>Abbrechen</button></div><p role="status" class="form-status"></p></form>`;
    application.querySelector('[data-cancel-apply]').addEventListener('click',()=>application.close());
    application.addEventListener('close',()=>trigger?.isConnected && trigger.focus(),{once:true});
    application.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault(); const form=e.currentTarget,btn=form.querySelector('[type="submit"]'),out=form.querySelector('[role="status"]'),note=form.elements.note.value.trim();
      if(!note){out.textContent="Bitte beschreibe kurz deine Bewerbung.";return;}
      btn.disabled=true;out.textContent="Wird gesendet …";
      try{
        unwrap(await sb.from('project_interest').insert({role_id:role.id,note}));
        application.close(); await load();
        const feedback=els.list.querySelector(`[data-id="${project.id}"] [data-error]`);
        if(feedback){feedback.hidden=false;feedback.className="form-status";feedback.setAttribute('role','status');feedback.textContent="Deine Bewerbung wurde gesendet. Der Projektbesitzer kann sie jetzt sehen.";feedback.scrollIntoView({block:'nearest'});}
      }catch(err){out.textContent=err?.code === "23505" ? "Du hast dich bereits für diese Rolle beworben." : friendlyError(err);btn.disabled=false;}
    });
    application.showModal();
  }

  /* ---------- Aktionen in der Liste ---------- */

  els.list.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const card = btn.closest(".project");
    const id = Number(card.dataset.id);
    const p = projects.find((x) => x.id === id);
    const roleEl = btn.closest("[data-role]");
    const role = roleEl && p.roles.find((r) => r.id === Number(roleEl.dataset.role));
    const errorEl = card.querySelector("[data-error]");
    errorEl.hidden = true;
    try {
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
        const picker = document.createElement("input");
        picker.type = "file"; picker.accept = "image/jpeg,image/png,image/webp";
        const file = await new Promise((res) => {
          picker.addEventListener("change", () => res(picker.files?.[0] || null), { once: true });
          // Abbrechen im Dateidialog: Knopf wieder freigeben
          picker.addEventListener("cancel", () => res(null), { once: true });
          picker.click();
        });
        if (!file) { btn.disabled = false; return; }
        btn.textContent = "Bild wird gespeichert …";
        const path = await uploadImage(await prepareImage(file));
        try { unwrap(await sb.from("projects").update({ image_path: path }).eq("id", id)); }
        catch (err) { await removeImage(path); throw err; }
        const old = p.image_path; p.image_path = path; await removeImage(old);
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
      const focusKey = roleEl ? `[data-id="${id}"] [data-role="${roleEl.dataset.role}"] button` : `[data-id="${id}"] [data-act="${btn.dataset.act}"]`;
      render();
      document.querySelector(focusKey)?.focus();
    } catch (err) {
      btn.disabled = false;
      errorEl.textContent = friendlyError(err);
      errorEl.hidden = false;
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
