(async () => {
  const grid = document.getElementById("grid");
  try {
    const me = await currentMember();
    // Mit Konto (nicht abgelehnt): alle Profile sehen und anschreiben
    const viewerIsMember = !!me && me.status !== "rejected";
    // Welche Profile sichtbar sind, regelt die Datenbank (Row Level Security)
    let members = unwrap(await sb.from("profiles").select("*").neq("status", "rejected").order("created_at", { ascending: false }));
    if (!viewerIsMember) {
      document.getElementById("notice").innerHTML = `
        <div class="notice">Du siehst hier die öffentlichen Profile. Mit Konto siehst du alle und kannst sie direkt anschreiben.
        <a class="text-link" href="mitglied-werden">Werde Mitglied</a> oder <a class="text-link" href="login">logg dich ein</a>.</div>`;
    }
    // Xyntal-Karten (nur öffentlich freigegebene); ohne Karte das normale Profil
    let cards = new Map();
    try {
      const { data } = await sb.rpc("get_member_cards");
      if (Array.isArray(data)) cards = new Map(data.map((c) => [c.user_id, c]));
    } catch { /* ohne Funktion: nur Profile */ }
    const tile = (m) => {
      const c = cards.get(m.id);
      if (!c || !window.XyntalCardHtml) return memberCard(m, { message: viewerIsMember && m.id !== me.id });
      const photo = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(m.avatar_path || "") ? `data-avatar-path="${esc(m.avatar_path)}"` : "";
      const canMessage = viewerIsMember && m.id !== me.id;
      return `<div class="member-xcard xcard-host"><div class="member-xcard-link" data-profile-url="/${esc(c.handle)}" role="group" tabindex="0" aria-label="${esc(c.name || m.name)} – Profil öffnen">${window.XyntalCardHtml({ ...c, is_verified: m.is_verified === true }, { avatarAttrs: photo, messageUrl: canMessage ? `/nachrichten?an=${encodeURIComponent(m.id)}` : "" })}</div></div>`;
    };
    grid.innerHTML = members.length
      ? members.map(tile).join("")
      : `<p class="empty" style="grid-column: 1 / -1">Die ersten Profile entstehen gerade. <a class="text-link" href="mitglied-werden">Sei eines der ersten Mitglieder.</a></p>`;
    grid.addEventListener("click", (e) => {
      if (e.target.closest("a,button")) return;
      const card = e.target.closest("[data-profile-url]");
      if (card) location.href = card.dataset.profileUrl;
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.target.closest("a,button")) return;
      const card = e.target.closest("[data-profile-url]");
      if (card) location.href = card.dataset.profileUrl;
    });
  } catch (err) {
    grid.innerHTML = `<p class="empty">${esc(friendlyError(err))}</p>`;
  }
})();
