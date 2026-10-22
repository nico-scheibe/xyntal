// Projekte mit offenen Rollen. Rechte prüft zusätzlich die Datenbank (supabase/009_projects.sql).
(() => {
  const PHASE_LABEL = { idee: "Idee", prototyp: "Prototyp", erste_kunden: "Erste Kunden", wachstum: "Wachstum" };
  const MAX_ROLES = 8;
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

  let v = { me: null, isMember: false, isAdmin: false };
  let projects = [];
  let interest = [];        // eigene Meldungen und Meldungen auf eigene Rollen
  let filter = "";
  let ready = true;         // false, solange Migration 009 fehlt

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
        ${people.length ? `<details class="role-people"><summary>${people.length} ${people.length === 1 ? "Meldung" : "Meldungen"}</summary><ul>
          ${people.map((i) => `<li>${avatar(i.member?.name || "Mitglied", "avatar-sm", i.member?.avatar_path)}<div><strong>${esc(i.member?.name || "Mitglied")}</strong>${i.member?.headline ? `<span>${esc(i.member.headline)}</span>` : ""}${i.note ? `<p>${esc(i.note)}</p>` : ""}</div><a class="btn btn-small btn-ghost" href="nachrichten?an=${esc(i.member_id)}">Nachricht</a></li>`).join("")}
        </ul></details>` : `<span class="role-quiet">Noch keine Meldung</span>`}`;
    } else if (r.filled) {
      action = `<span class="tag">Besetzt</span>`;
    } else if (v.isMember && !p.closed) {
      action = myInterest(r.id)
        ? `<button type="button" class="role-join is-on" data-act="leave" aria-pressed="true">Gemeldet · zurückziehen</button>`
        : `<button type="button" class="role-join" data-act="join" aria-pressed="false">Ich wäre dabei</button>`;
    } else if (!v.me) {
      action = `<a class="text-link" href="login">Einloggen, um dich zu melden</a>`;
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
    return `<article class="project${p.closed ? " closed" : ""}" data-id="${p.id}" aria-labelledby="p-${p.id}">
      <div class="listing-top">
        <span class="tag tag-update">${PHASE_LABEL[p.phase] || "Idee"}</span>
        ${p.place ? `<span class="tag">${esc(p.place)}</span>` : ""}
        ${p.closed ? `<span class="tag">Geschlossen</span>` : ""}
      </div>
      <h2 class="project-title" id="p-${p.id}">${esc(p.title)}</h2>
      <p class="project-pitch">${esc(p.pitch)}</p>
      ${p.body ? `<details class="project-more"><summary>Mehr dazu</summary><p>${richText(p.body)}</p></details>` : ""}
      <div class="project-roles">
        <h3>${open ? `${open} offene ${open === 1 ? "Rolle" : "Rollen"}` : "Alle Rollen besetzt"}</h3>
        <ul>${roles.map((r) => roleHtml(p, r, mine)).join("")}</ul>
      </div>
      <div class="listing-foot">
        <div class="listing-author">${avatar(owner.name, "avatar-sm", owner.avatar_path)}<div><strong>${esc(owner.name)}</strong><span>${timeAgo(p.created_at)}${p.is_public ? " · öffentlich" : ""}</span></div></div>
        <div class="post-actions">
          ${v.isMember && !mine && !p.closed ? `<a class="btn btn-small btn-ghost" href="nachrichten?an=${esc(p.owner_id)}">Nachricht</a>` : ""}
          ${mine ? `<button type="button" data-act="close">${p.closed ? "Wieder öffnen" : "Projekt schließen"}</button>` : ""}
          ${mine || v.isAdmin ? `<button type="button" data-act="delete">Löschen</button>` : ""}
        </div>
      </div>
      <p class="post-error" data-error role="alert" hidden></p>
    </article>`;
  }

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
    els.list.innerHTML = list.length ? list.map(projectHtml).join("") : `<div class="empty-block">${
      filter === "meine" ? "<strong>Du hast noch kein Projekt angelegt.</strong><p>Beschreib dein Vorhaben in einem Satz und sag, wer dir fehlt.</p>"
      : filter === "offen" ? "<strong>Gerade sind keine Rollen offen.</strong><p>Schau später noch einmal vorbei.</p>"
      : `<strong>Noch keine Projekte.</strong><p>${v.isMember ? "Leg das erste an: Was baust du, und wer fehlt dir?" : "Sobald Mitglieder ihre Projekte teilen, findest du sie hier."}</p>`}</div>`;
  }

  /* ---------- Laden ---------- */

  async function load() {
    try {
      projects = unwrap(await sb.from("projects")
        .select("id, title, pitch, body, phase, place, is_public, closed, created_at, owner_id, owner:profiles!projects_owner_id_fkey(id, name, headline, avatar_path), roles:project_roles(id, name, need, hours, filled)")
        .order("closed").order("created_at", { ascending: false }).limit(100));
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
    els.form.hidden = true;
    els.newBtn.hidden = !v.isMember;
    els.form.reset();
    setStatus(els.status, "");
  }

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
      const project = unwrap(await sb.from("projects").insert({
        title: data.title, pitch: data.pitch, body: data.body, phase: data.phase, place: data.place, is_public: data.is_public,
      }).select("id").single());
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
        unwrap(await sb.from("project_interest").insert({ role_id: role.id }));
        interest.push({ role_id: role.id, member_id: v.me.id });
      } else if (btn.dataset.act === "leave") {
        unwrap(await sb.from("project_interest").delete().eq("role_id", role.id).eq("member_id", v.me.id));
        interest = interest.filter((i) => !(i.role_id === role.id && i.member_id === v.me.id));
      } else if (btn.dataset.act === "fill") {
        unwrap(await sb.from("project_roles").update({ filled: !role.filled }).eq("id", role.id));
        role.filled = !role.filled;
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
    els.notice.innerHTML = accessNotice(v, "Projekte anlegen und dich für Rollen melden");
    els.mine.hidden = !v.me;
    await load();
    // Sprung von der Startseite zu einem bestimmten Projekt
    const target = location.hash && document.getElementById(location.hash.slice(1));
    if (target) { target.closest(".project")?.scrollIntoView({ block: "start" }); target.closest(".project")?.setAttribute("tabindex", "-1"); target.closest(".project")?.focus({ preventScroll: true }); }
    if (v.isMember && ready) {
      els.newBtn.hidden = false;
      if (new URLSearchParams(location.search).get("neu") === "1") openForm();
    }
  })();
})();
