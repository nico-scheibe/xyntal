const KIND = { update: "Update", frage: "Frage", erfolg: "Erfolg" };
const COMMENT_EMOJIS = ["❤️", "👍", "😂", "😮", "😢", "🔥"];
let v = { me: null, isMember: false, isAdmin: false };
let posts = [];
let liked = new Set();
let filter = "";
const commentFeatures = { reply: true, edit: true, reactions: true };
const replyDraft = new Map(); // postId -> parent comment id

const EDIT_WINDOW = 30 * 60 * 1000;
let hasEditedAt = true;
function canEditPost(p) { return !!v.me && p.author_id === v.me.id && Date.now() < Date.parse(p.created_at) + EDIT_WINDOW; }
function canEditComment(c) { return !!v.me && c.author_id === v.me.id && Date.now() < Date.parse(c.created_at) + EDIT_WINDOW; }
async function queryPosts(id) {
  const run = () => {
    let query = sb.from('posts').select('id, kind, body, is_public, like_count, comment_count, created_at, author_id' + (hasEditedAt ? ', edited_at' : '') + ', author:profiles!posts_author_id_fkey(id, name, headline, avatar_path)');
    return id ? query.eq('id', id).maybeSingle() : query.order('created_at', { ascending: false }).limit(100);
  };
  let result = await run();
  if (result.error && hasEditedAt && /edited_at/.test(result.error.message || '')) { hasEditedAt = false; result = await run(); }
  return unwrap(result);
}
function postHtml(p) {
  const author = p.author || { name: "Mitglied", headline: "" };
  const mine = v.me && p.author_id === v.me.id;
  const canDelete = mine || v.isAdmin;
  const canMessage = v.isMember && !mine && p.author;
  return `
    <article class="post" id="beitrag-${p.id}" tabindex="-1" data-id="${p.id}">
      <header class="post-head">
        ${avatar(author.name, "", author.avatar_path)}
        <div class="post-meta">
          <strong>${esc(author.name)}</strong>
          <span>${esc(author.headline || "")}</span>
        </div>
        <span class="tag tag-${p.kind}">${KIND[p.kind]}</span>
      </header>
      <div class="post-body">${richText(p.body)}</div>
      <div class="post-editor-slot"></div>
      <footer class="post-foot">
        <span class="post-time">${timeAgo(p.created_at)}${p.edited_at ? " · bearbeitet" : ""}${p.is_public ? " · öffentlich" : ""}</span>
        <div class="post-actions">
          ${v.isMember ? `<button type="button" data-act="like" class="${liked.has(p.id) ? "active" : ""}" aria-pressed="${liked.has(p.id)}">♥ <span>${p.like_count}</span></button>` : `<span class="count">♥ ${p.like_count}</span>`}
          ${v.isMember ? `<button type="button" data-act="comments">Kommentare (${p.comment_count})</button>` : `<span class="count">${p.comment_count} Kommentare</span>`}
          ${canMessage ? `<a href="nachrichten?an=${p.author_id}">Nachricht</a>` : ""}
          ${canEditPost(p) ? `<button type="button" data-act="edit" title="Bis 30 Minuten nach dem Absenden">Bearbeiten</button>` : ""}
          ${canDelete ? `<button type="button" class="post-delete" data-act="delete">Löschen</button>` : ""}
        </div>
      </footer>
      <div class="comments" hidden></div>
    </article>`;
}

function render() {
  const list = posts.filter((p) => !filter || p.kind === filter);
  document.getElementById("feed").innerHTML = list.length
    ? list.map(postHtml).join("")
    : `<p class="empty">${filter ? "Hier ist noch nichts." : "Noch keine Beiträge – mach den Anfang!"}</p>`;
}

let linkedPostOpened = false;
async function load() {
  try {
    posts = await queryPosts();
    const target = new URLSearchParams(location.search).get("beitrag");
    if (target && /^\d+$/.test(target) && !posts.some(p => String(p.id) === target)) {
      const linked = await queryPosts(target);
      if (linked) posts.unshift(linked);
    }
    if (v.isMember) {
      const likes = unwrap(await sb.from("post_likes").select("post_id").eq("user_id", v.me.id));
      liked = new Set(likes.map((l) => l.post_id));
    }
    render();
    if (target && /^\d+$/.test(target) && !linkedPostOpened) {
      linkedPostOpened = true;
      const article = document.getElementById(`beitrag-${target}`);
      if (article) {
        if (v.isMember) { article.querySelector(".comments").hidden = false; await loadComments(article); }
        article.focus({ preventScroll: true });
        article.scrollIntoView({ block: "center", behavior: "instant" });
      } else document.getElementById("notice").insertAdjacentHTML("beforeend", '<div class="notice">Dieser Beitrag ist nicht mehr verfügbar oder für dich nicht sichtbar.</div>');
    }
  } catch (err) {
    document.getElementById("feed").innerHTML = `<p class="empty">${esc(friendlyError(err))}</p>`;
  }
}

function reactionChips(commentId, rows) {
  if (!commentFeatures.reactions) return "";
  const byEmoji = new Map();
  for (const r of rows || []) {
    if (r.comment_id !== commentId) continue;
    const list = byEmoji.get(r.emoji) || { emoji: r.emoji, count: 0, mine: false };
    list.count++;
    if (v.me && r.member_id === v.me.id) list.mine = true;
    byEmoji.set(r.emoji, list);
  }
  const chips = [...byEmoji.values()].map((x) =>
    `<button type="button" class="c-react-chip${x.mine ? " is-mine" : ""}" data-act="toggle-react" data-emoji="${esc(x.emoji)}" aria-pressed="${x.mine}">${x.emoji} ${x.count}</button>`
  ).join("");
  const pick = COMMENT_EMOJIS.map((e) => `<button type="button" class="c-react-pick" data-act="toggle-react" data-emoji="${e}" aria-label="Reagieren mit ${e}">${e}</button>`).join("");
  return `<div class="c-react-row">${chips}<details class="c-react-more"><summary aria-label="Reagieren">＋</summary><div class="c-react-pop">${pick}</div></details></div>`;
}

function commentHtml(c, reactions, depth = 0) {
  const mine = v.me && c.author_id === v.me.id;
  const canDel = mine || v.isAdmin;
  const canEdit = commentFeatures.edit && canEditComment(c);
  const actions = [
    commentFeatures.reply && depth === 0 ? `<button type="button" class="c-act" data-act="reply-comment">Antworten</button>` : "",
    canEdit ? `<button type="button" class="c-act" data-act="edit-comment">Bearbeiten</button>` : "",
    canDel ? `<button type="button" class="c-act c-act-danger" data-act="delete-comment">Löschen</button>` : "",
  ].filter(Boolean).join("");
  return `
    <article class="comment${depth ? " is-reply" : ""}" data-comment="${c.id}" data-depth="${depth}">
      ${avatar(c.author?.name, "avatar-sm", c.author?.avatar_path)}
      <div class="comment-main">
        <header class="comment-head">
          <strong class="comment-author">${esc(c.author?.name || "Mitglied")}</strong>
          <time class="comment-time">${timeAgo(c.created_at)}${c.edited_at ? " · bearbeitet" : ""}</time>
        </header>
        <div class="comment-body" data-comment-body>${richText(c.body)}</div>
        <div class="comment-toolbar">
          ${actions ? `<div class="comment-acts">${actions}</div>` : ""}
          ${reactionChips(c.id, reactions)}
        </div>
      </div>
    </article>`;
}

async function loadComments(article) {
  const id = Number(article.dataset.id);
  const box = article.querySelector(".comments");
  box.innerHTML = `<p class="empty-small">Lade Kommentare …</p>`;
  const cols = commentFeatures.reply || commentFeatures.edit
    ? "id, body, created_at, author_id, parent_id, edited_at, author:profiles!post_comments_author_id_fkey(id, name, avatar_path)"
    : "id, body, created_at, author_id, author:profiles!post_comments_author_id_fkey(id, name, avatar_path)";
  let comments;
  try {
    comments = unwrap(await sb.from("post_comments").select(cols).eq("post_id", id).order("created_at")) || [];
  } catch (err) {
    if (/parent_id|edited_at|column/.test(String(err?.message || err))) {
      commentFeatures.reply = false;
      commentFeatures.edit = false;
      comments = unwrap(await sb.from("post_comments")
        .select("id, body, created_at, author_id, author:profiles!post_comments_author_id_fkey(id, name, avatar_path)")
        .eq("post_id", id).order("created_at")) || [];
    } else throw err;
  }
  let reactions = [];
  if (commentFeatures.reactions && comments.length) {
    try {
      reactions = unwrap(await sb.from("post_comment_reactions")
        .select("comment_id, member_id, emoji")
        .in("comment_id", comments.map((c) => c.id))) || [];
    } catch {
      commentFeatures.reactions = false;
      reactions = [];
    }
  }
  const roots = comments.filter((c) => !c.parent_id);
  const kids = comments.filter((c) => c.parent_id);
  const replyTo = replyDraft.get(id);
  const replyTarget = replyTo && comments.find((c) => c.id === Number(replyTo));
  box.innerHTML = `
    <div class="comment-list">
      ${roots.length ? roots.map((c) => {
        const nested = kids.filter((k) => k.parent_id === c.id).map((k) => commentHtml(k, reactions, 1)).join("");
        return commentHtml(c, reactions, 0) + nested;
      }).join("") : `<p class="empty-small">Noch keine Kommentare. Schreib den ersten.</p>`}
    </div>
    <form class="comment-form" novalidate>
      ${replyTarget ? `<div class="comment-reply-bar"><span>Antwort auf <strong>${esc(replyTarget.author?.name || "Mitglied")}</strong></span><button type="button" class="c-act" data-act="cancel-reply">Abbrechen</button></div>` : ""}
      <div class="comment-compose">
        <label class="sr-only" for="c-input-${id}">${replyTarget ? "Antwort" : "Kommentar"}</label>
        <input id="c-input-${id}" type="text" name="body" maxlength="1500" placeholder="${replyTarget ? "Antwort schreiben …" : "Kommentar schreiben …"}" autocomplete="off">
        <button class="btn btn-small" type="submit">Senden</button>
      </div>
    </form>`;
}

// Beitrag teilen
const composer = document.getElementById("composer");
composer.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(composer, document.getElementById("composer-status"), async (data) => {
    if (!data.body) throw new Error("Schreib erst etwas.");
    const kind = composer.querySelector('input[name="kind"]:checked').value;
    unwrap(await sb.from("posts").insert({ kind, body: data.body, is_public: data.is_public }));
    composer.elements.body.value = "";
    composer.elements.is_public.checked = false;
    setStatus(document.getElementById("composer-status"), "");
    await load();
  });
});

// Filter
document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
  filter = b.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-selected", x === b));
  render();
}));

// Aktionen an Beiträgen
const feed = document.getElementById("feed");
feed.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const article = btn.closest(".post");
  const id = Number(article.dataset.id);
  const post = posts.find((p) => p.id === id);
  try {
    if (btn.dataset.act === "like") {
      btn.disabled = true;
      if (liked.has(id)) {
        unwrap(await sb.from("post_likes").delete().eq("post_id", id).eq("user_id", v.me.id));
        liked.delete(id); post.like_count--;
      } else {
        unwrap(await sb.from("post_likes").insert({ post_id: id }));
        liked.add(id); post.like_count++;
      }
      btn.classList.toggle("active", liked.has(id));
      btn.setAttribute("aria-pressed", liked.has(id));
      btn.querySelector("span").textContent = post.like_count;
      btn.disabled = false;
    } else if (btn.dataset.act === "comments") {
      const box = article.querySelector(".comments");
      box.hidden = !box.hidden;
      if (!box.hidden) await loadComments(article);
    } else if (btn.dataset.act === "edit") {
      if (!canEditPost(post)) { btn.remove(); throw new Error('Die 30 Minuten zum Bearbeiten dieses Beitrags sind abgelaufen.'); }
      const slot = article.querySelector('.post-editor-slot');
      if (slot.querySelector('form')) { slot.querySelector('textarea').focus(); return; }
      const editor = document.createElement('form'); editor.className = 'post-edit-form';
      editor.innerHTML = '<label>Beitrag bearbeiten<textarea name="body" maxlength="3000" rows="4" required></textarea></label><p class="hint" data-edit-time>Bis 30 Minuten nach dem Absenden bearbeitbar.</p><div class="post-edit-actions"><button class="btn btn-small" type="submit">Änderungen speichern</button><button class="btn btn-small btn-ghost" type="button" data-act="cancel-edit">Abbrechen</button></div><p class="form-status" role="status"></p>';
      editor.elements.body.value = post.body; editor.dataset.original = post.body;
      slot.append(editor); article.querySelector('.post-body').hidden = true;
      btn.hidden = true; editor.elements.body.focus();
    } else if (btn.dataset.act === 'cancel-edit') {
      const editor = article.querySelector('.post-edit-form');
      if (editor?.dataset.saving) return;
      article.querySelector('.post-editor-slot').replaceChildren(); article.querySelector('.post-body').hidden = false;
      const editButton = article.querySelector('[data-act=edit]');
      if (editButton) { editButton.hidden = false; editButton.focus(); }
    } else if (btn.dataset.act === "delete") {
      if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Wirklich löschen?"; return; }
      unwrap(await sb.from("posts").delete().eq("id", id));
      posts = posts.filter((p) => p.id !== id);
      render();
    } else if (btn.dataset.act === "delete-comment") {
      const cid = Number(btn.closest("[data-comment]").dataset.comment);
      unwrap(await sb.from("post_comments").delete().eq("id", cid));
      post.comment_count = Math.max(0, (post.comment_count || 1) - 1);
      article.querySelector('[data-act="comments"]').textContent = `Kommentare (${post.comment_count})`;
      await loadComments(article);
    } else if (btn.dataset.act === "reply-comment") {
      if (!commentFeatures.reply) return;
      const cid = Number(btn.closest("[data-comment]").dataset.comment);
      replyDraft.set(id, cid);
      await loadComments(article);
      article.querySelector(".comment-form input")?.focus();
    } else if (btn.dataset.act === "cancel-reply") {
      replyDraft.delete(id);
      await loadComments(article);
      article.querySelector(".comment-form input")?.focus();
    } else if (btn.dataset.act === "edit-comment") {
      if (!commentFeatures.edit) return;
      const row = btn.closest("[data-comment]");
      const bodyEl = row.querySelector("[data-comment-body]");
      if (!bodyEl || row.querySelector(".comment-edit-form")) return;
      const plain = bodyEl.innerText.trim();
      const form = document.createElement("form");
      form.className = "comment-edit-form";
      form.innerHTML = `<textarea name="body" maxlength="1500" rows="3" required></textarea><div class="comment-edit-actions"><button class="btn btn-small" type="submit">Speichern</button><button class="btn btn-small btn-ghost" type="button" data-act="cancel-edit-comment">Abbrechen</button></div>`;
      form.elements.body.value = plain;
      bodyEl.hidden = true;
      bodyEl.after(form);
      form.elements.body.focus();
    } else if (btn.dataset.act === "cancel-edit-comment") {
      const row = btn.closest("[data-comment]");
      row.querySelector(".comment-edit-form")?.remove();
      const bodyEl = row.querySelector("[data-comment-body]");
      if (bodyEl) bodyEl.hidden = false;
    } else if (btn.dataset.act === "toggle-react") {
      if (!commentFeatures.reactions) return;
      const row = btn.closest("[data-comment]");
      const cid = Number(row.dataset.comment);
      const emoji = btn.dataset.emoji;
      if (!emoji) return;
      btn.disabled = true;
      const mine = btn.classList.contains("is-mine") || btn.getAttribute("aria-pressed") === "true";
      try {
        if (mine) {
          unwrap(await sb.from("post_comment_reactions").delete().eq("comment_id", cid).eq("member_id", v.me.id).eq("emoji", emoji));
        } else {
          const res = await sb.from("post_comment_reactions").insert({ comment_id: cid, emoji });
          if (res.error?.code === "23505") {
            unwrap(await sb.from("post_comment_reactions").delete().eq("comment_id", cid).eq("member_id", v.me.id).eq("emoji", emoji));
          } else unwrap(res);
        }
        await loadComments(article);
      } catch (err) {
        if (/post_comment_reactions|does not exist|schema cache/.test(String(err?.message || err))) {
          commentFeatures.reactions = false;
          await loadComments(article);
        } else throw err;
      }
    }
  } catch (err) {
    btn.disabled = false;
    alertIn(article, friendlyError(err));
  }
});

// Save without rebuilding the card, preserving open comments and drafts.
feed.addEventListener('submit', async e => {
  const editor = e.target.closest('.post-edit-form'); if (!editor) return;
  e.preventDefault(); if (editor.dataset.saving) return;
  const article = editor.closest('.post'); const post = posts.find(p => p.id === Number(article.dataset.id));
  const status = editor.querySelector('[role=status]');
  if (!canEditPost(post)) { setStatus(status, 'Die 30 Minuten zum Bearbeiten dieses Beitrags sind abgelaufen.', 'error'); return; }
  const body = editor.elements.body.value.trim(); if (!body) { setStatus(status, 'Schreib erst etwas.', 'error'); return; }
  editor.dataset.saving = '1'; editor.querySelectorAll('button').forEach(b => b.disabled = true); editor.elements.body.readOnly = true;
  try {
    const result = await sb.rpc('edit_community_post', { p_id: post.id, p_body: body, p_original_body: editor.dataset.original });
    if (result.error && /could not find the function|schema cache/i.test(result.error.message || '')) throw new Error('Die Bearbeitungsfunktion ist noch nicht eingerichtet. Bitte versuche es später erneut.');
    const data = unwrap(result); post.body = data.body; post.edited_at = data.edited_at;
    const content = article.querySelector('.post-body'); content.innerHTML = richText(post.body); content.hidden = false;
    article.querySelector('.post-time').textContent = timeAgo(post.created_at) + (post.edited_at ? ' · bearbeitet' : '') + (post.is_public ? ' · öffentlich' : '');
    editor.remove(); const button = article.querySelector('[data-act=edit]'); if (button) { button.hidden = false; button.focus(); }
  } catch (err) { setStatus(status, friendlyError(err), 'error'); }
  finally { delete editor.dataset.saving; editor.querySelectorAll('button').forEach(b => b.disabled = false); editor.elements.body.readOnly = false; }
});
setInterval(() => {
  feed.querySelectorAll('.post').forEach(article => {
    const post = posts.find(p => p.id === Number(article.dataset.id)); if (!post || canEditPost(post)) return;
    article.querySelector('[data-act=edit]')?.remove();
    const editor = article.querySelector('.post-edit-form'); if (!editor || editor.dataset.saving) return;
    editor.querySelector('[type=submit]').disabled = true;
    editor.querySelector('[data-edit-time]').textContent = 'Die 30 Minuten zum Bearbeiten dieses Beitrags sind abgelaufen.';
  });
}, 10000);

// Kommentar / Antwort senden
feed.addEventListener("submit", async (e) => {
  const editForm = e.target.closest(".comment-edit-form");
  if (editForm) {
    e.preventDefault();
    const article = editForm.closest(".post");
    const row = editForm.closest("[data-comment]");
    const cid = Number(row.dataset.comment);
    const body = editForm.elements.body.value.trim();
    if (!body) return;
    try {
      editForm.querySelector("[type=submit]").disabled = true;
      unwrap(await sb.from("post_comments").update({ body, edited_at: new Date().toISOString() }).eq("id", cid));
      await loadComments(article);
    } catch (err) {
      editForm.querySelector("[type=submit]").disabled = false;
      if (/edited_at|column/.test(String(err?.message || err))) {
        try {
          unwrap(await sb.from("post_comments").update({ body }).eq("id", cid));
          commentFeatures.edit = false;
          await loadComments(article);
          return;
        } catch (err2) { alertIn(article, friendlyError(err2)); return; }
      }
      alertIn(article, friendlyError(err));
    }
    return;
  }
  const form = e.target.closest(".comment-form");
  if (!form) return;
  e.preventDefault();
  const article = form.closest(".post");
  const id = Number(article.dataset.id);
  const body = form.elements.body.value.trim();
  if (!body) return;
  const parentId = commentFeatures.reply ? replyDraft.get(id) : null;
  try {
    form.querySelector("button").disabled = true;
    const payload = { post_id: id, body };
    if (parentId) payload.parent_id = Number(parentId);
    try {
      unwrap(await sb.from("post_comments").insert(payload));
    } catch (err) {
      if (parentId && /parent_id|column|schema/.test(String(err?.message || err))) {
        commentFeatures.reply = false;
        unwrap(await sb.from("post_comments").insert({ post_id: id, body }));
      } else throw err;
    }
    replyDraft.delete(id);
    const post = posts.find((p) => p.id === id);
    post.comment_count++;
    article.querySelector('[data-act="comments"]').textContent = `Kommentare (${post.comment_count})`;
    await loadComments(article);
    article.querySelector(".comment-form input")?.focus();
  } catch (err) {
    form.querySelector("button").disabled = false;
    alertIn(article, friendlyError(err));
  }
});

function alertIn(article, text) {
  article.querySelector(".post-error")?.remove();
  article.insertAdjacentHTML("beforeend", `<p class="post-error">${esc(text)}</p>`);
}

(async () => {
  v = await viewer();
  document.getElementById("notice").innerHTML = accessNotice(v, "Beiträge schreiben, kommentieren und liken");
  if (v.isMember) {
    composer.hidden = false;
    document.getElementById("composer-avatar").innerHTML = avatar(v.me.name, "", v.me.avatar_path);
  }
  await load();
  if (v.isMember && new URLSearchParams(location.search).get("neu") === "1") {
    composer.scrollIntoView({ block: "center", behavior: "smooth" });
    composer.elements.body.focus({ preventScroll: true });
  }
})();
