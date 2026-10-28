let v = { me: null, isMember: false, isAdmin: false };
let listings = [];
let liked = new Set();
let filter = "";
let likesReady = true;

function listingHtml(l) {
  const author = l.author || { name: "Mitglied", headline: "" };
  const mine = v.me && l.author_id === v.me.id;
  const count = Number(l.like_count) || 0;
  const react = !likesReady ? ""
    : v.isMember
      ? `<button type="button" data-act="like" class="listing-like${liked.has(l.id) ? " active" : ""}" aria-pressed="${liked.has(l.id)}" aria-label="Gefällt mir"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>${count}</span></button>`
      : `<span class="listing-like is-static"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>${count}</span>`;
  const long = !!l.body && (l.body.length > 320 || l.body.split("\n").length > 6);
  const ownMenu = mine || v.isAdmin ? `<details class="listing-menu"><summary aria-label="Aktionen"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg></summary>
        <div class="listing-menu-pop">
          ${mine ? `<button type="button" data-act="edit">Bearbeiten</button>` : ""}
          ${mine ? `<button type="button" data-act="toggle">${l.closed ? "Wieder öffnen" : "Als erledigt markieren"}</button>` : ""}
          <button type="button" data-act="delete" class="is-danger">Löschen</button>
        </div></details>` : "";
  const action = l.closed ? ""
    : v.isMember && !mine && l.author
      ? `<a class="listing-reply" href="nachrichten?an=${esc(l.author_id)}&amp;anzeige=${l.id}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15v9.5h-9l-4 3.5V16h-2z"/></svg>Nachricht schreiben</a>`
      : !v.me ? `<a class="listing-reply is-ghost" href="/login?next=${encodeURIComponent(`boerse#anzeige-${l.id}`)}">Einloggen, um zu antworten</a>` : "";
  return `
    <article id="anzeige-${l.id}" class="listing listing-${l.type} ${l.closed ? "closed" : ""}" data-id="${l.id}">
      <div class="listing-top">
        <span class="listing-type type-${l.type}">${l.type === "suche" ? "Suche" : "Biete"}</span>
        ${l.category ? `<span class="tag">${esc(l.category)}</span>` : ""}
        ${l.closed ? `<span class="tag">Erledigt</span>` : ""}
        ${ownMenu}
      </div>
      <h2 class="listing-title">${esc(l.title)}</h2>
      ${l.body ? `<p class="listing-body${long ? " is-clamped" : ""}" id="lb-${l.id}">${richText(l.body)}</p>
        ${long ? `<button type="button" class="listing-more" data-act="more" aria-expanded="false" aria-controls="lb-${l.id}">Weiterlesen</button>` : ""}` : ""}
      <div class="listing-foot">
        <div class="listing-author">${avatar(author.name, "avatar-sm", author.avatar_path)}<div><strong>${esc(author.name)}</strong><span>${timeAgo(l.created_at)}${l.is_public ? " · öffentlich" : ""}</span></div></div>
        <div class="listing-actions">${react}${action}</div>
      </div>
      <details class="content-comments" data-comment-kind="listing" data-comment-id="${l.id}" data-comment-owner="${esc(l.author_id)}" data-comment-closed="${l.closed}"><summary>Kommentare &amp; Fragen</summary></details>
    </article>`;
}

function render() {
  const list = listings.filter((l) => !filter || l.type === filter);
  document.getElementById("board").innerHTML = list.length
    ? list.map(listingHtml).join("")
    : `<p class="empty">${filter ? "Hier ist noch nichts." : "Noch keine Einträge – was suchst oder bietest du?"}</p>`;
}

let initialAnchor = false;
function revealLinkedListing() {
  if (initialAnchor || !/^#anzeige-\d+$/.test(location.hash)) return;
  const target = document.getElementById(location.hash.slice(1));
  if (target) { initialAnchor = true; target.style.scrollMarginTop = "100px"; target.scrollIntoView({block: "start"}); }
}
async function load() {
  try {
    listings = unwrap(await sb.from("listings")
      .select("id, type, category, title, body, is_public, closed, like_count, created_at, author_id, author:profiles!listings_author_id_fkey(id, name, headline, avatar_path)")
      .order("closed").order("created_at", { ascending: false }).limit(200));
    likesReady = true;
    if (v.isMember) {
      const likes = unwrap(await sb.from("listing_likes").select("listing_id").eq("user_id", v.me.id));
      liked = new Set(likes.map((row) => row.listing_id));
    } else {
      liked = new Set();
    }
    render();
    revealLinkedListing();
  } catch (err) {
    // Migration 008 noch nicht ausgeführt: Börse ohne Reaktionen weiter nutzbar.
    if (String(err?.message || err).includes("like_count") || String(err?.message || err).includes("listing_likes")) {
      likesReady = false;
      try {
        listings = unwrap(await sb.from("listings")
          .select("id, type, category, title, body, is_public, closed, created_at, author_id, author:profiles!listings_author_id_fkey(id, name, headline, avatar_path)")
          .order("closed").order("created_at", { ascending: false }).limit(200));
        liked = new Set();
        render();
    revealLinkedListing();
        return;
      } catch (fallbackErr) {
        document.getElementById("board").innerHTML = `<p class="empty">${esc(friendlyError(fallbackErr))}</p>`;
        return;
      }
    }
    document.getElementById("board").innerHTML = `<p class="empty">${esc(friendlyError(err))}</p>`;
  }
}

const form = document.getElementById("listing-form");
const newBtn = document.getElementById("new-listing");
const submitBtn = form.querySelector('button[type="submit"]');
let editingListing = null;   // Eintrag, der gerade bearbeitet wird (sonst: neuer Eintrag)
function openListingForm(l) {
  editingListing = l || null;
  form.reset();
  if (l) {
    const f = form.elements;
    f.type.value = l.type; f.category.value = l.category || ""; f.title.value = l.title || "";
    f.body.value = l.body || ""; f.is_public.checked = !!l.is_public;
  }
  submitBtn.textContent = l ? "Änderungen speichern" : "Veröffentlichen";
  form.hidden = false;
  newBtn.hidden = true;
  if (l) form.scrollIntoView({ block: "start" });
  form.elements.title.focus({ preventScroll: !!l });
}
function closeListingForm() {
  form.hidden = true;
  newBtn.hidden = false;
  form.reset();
  editingListing = null;
  submitBtn.textContent = "Veröffentlichen";
  setStatus(document.getElementById("listing-status"), "");
}
newBtn.addEventListener("click", () => openListingForm());
document.getElementById("cancel-listing").addEventListener("click", closeListingForm);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitWith(form, document.getElementById("listing-status"), async (data) => {
    if (!data.title) throw new Error("Bitte gib einen Titel an.");
    const fields = { type: data.type, category: data.category, title: data.title, body: data.body, is_public: data.is_public };
    const edited = editingListing;
    if (edited) unwrap(await sb.from("listings").update(fields).eq("id", edited.id));
    else unwrap(await sb.from("listings").insert(fields));
    closeListingForm();
    await load();
    if (edited) document.getElementById(`anzeige-${edited.id}`)?.scrollIntoView({ block: "center" });
  });
});

document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
  filter = b.dataset.filter;
  document.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-selected", x === b));
  render();
}));

document.getElementById("board").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "more") {
    const open = btn.getAttribute("aria-expanded") !== "true";
    document.getElementById(btn.getAttribute("aria-controls")).classList.toggle("is-clamped", !open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Weniger anzeigen" : "Weiterlesen";
    return;
  }
  const id = Number(btn.closest(".listing").dataset.id);
  const l = listings.find((x) => x.id === id);
  try {
    if (btn.dataset.act === "like") {
      if (!v.isMember || !likesReady) return;
      btn.disabled = true;
      if (liked.has(id)) {
        unwrap(await sb.from("listing_likes").delete().eq("listing_id", id).eq("user_id", v.me.id));
        liked.delete(id);
        l.like_count = Math.max(0, (Number(l.like_count) || 0) - 1);
      } else {
        unwrap(await sb.from("listing_likes").insert({ listing_id: id }));
        liked.add(id);
        l.like_count = (Number(l.like_count) || 0) + 1;
      }
      btn.classList.toggle("active", liked.has(id));
      btn.setAttribute("aria-pressed", liked.has(id));
      btn.querySelector("span").textContent = Number(l.like_count) || 0;
      btn.disabled = false;
    } else if (btn.dataset.act === "edit") {
      btn.closest("details")?.removeAttribute("open");
      if (l) openListingForm(l);
    } else if (btn.dataset.act === "toggle") {
      unwrap(await sb.from("listings").update({ closed: !l.closed }).eq("id", id));
      l.closed = !l.closed;
      render();
    revealLinkedListing();
    } else if (btn.dataset.act === "delete") {
      if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Wirklich löschen?"; return; }
      unwrap(await sb.from("listings").delete().eq("id", id));
      listings = listings.filter((x) => x.id !== id);
      render();
    revealLinkedListing();
    }
  } catch (err) {
    btn.disabled = false;
    btn.closest(".listing").insertAdjacentHTML("beforeend", `<p class="post-error">${esc(friendlyError(err))}</p>`);
  }
});

(async () => {
  v = await viewer();
  document.getElementById("notice").innerHTML = accessNotice(v, "Einträge erstellen, reagieren und Mitglieder kontaktieren");
  if (v.isMember) newBtn.hidden = false;
  await load();
})();
