// Xyntal-Karte als HTML – gemeinsam für das öffentliche Profil (u.js) und die Mitglieder-Seite.
// Aussehen: home.css (Startseite/Profil) bzw. xcard.css (Seiten mit style.css).
(() => {
  const THEMES = {
    aurora: ["#B95CFF", "#FF5FD2", "#5B8CFF", "#3FD8FF"], sunset: ["#FFB547", "#FF6A5C", "#FF3D8B", "#B95CFF"],
    ocean: ["#34D399", "#3FD8FF", "#5B8CFF", "#6D5BFF"], mono: ["#FFFFFF", "#C9C9D1", "#7A7A86", "#E4E4E7"],
  };
  const BLOCKS = ["place", "pitch", "skills", "stats", "looking"];
  const LEVELS = ["Einsteiger", "Fortgeschritten", "Profi"];
  // This profile was matched to the requested account. Use only its public
  // card identifier/handle here; never ship the account email to visitors.
  const FIRST_USER_ID = "be172112-15cd-49de-af85-e7f71dfeac47";
  const FIRST_USER_HANDLE = "maxim";
  const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // opts: t (Übersetzung), heading ("h1"/"h3"), avatarAttrs (zusätzliche Attribute am Avatar), messageUrl (interner Nachrichtenlink)
  function html(c, opts = {}) {
    const t = opts.t || ((de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de));
    const heading = opts.heading === "h1" ? "h1" : "h3";
    const d = c.design && typeof c.design === "object" ? c.design : {};
    const theme = d.theme === "custom" && isHex(d.c1) && isHex(d.c2) ? "custom" : THEMES[d.theme] ? d.theme : "aurora";
    const cols = theme === "custom" ? [d.c1, d.c2] : THEMES[theme];
    const grad = `linear-gradient(120deg, ${cols.map((col, k, a) => `${col} ${Math.round((k / (a.length - 1)) * 100)}%`).join(", ")})`;
    const surface = d.surface === "light" ? "light" : "dark", shape = d.shape === "rounded" ? "rounded" : "circle", layout = d.layout === "center" ? "center" : "left";
    const order = (Array.isArray(d.order) ? d.order.filter((b) => BLOCKS.includes(b)) : []).concat(BLOCKS).filter((b, i, a) => a.indexOf(b) === i);
    const off = Array.isArray(d.off) ? d.off.filter((b) => BLOCKS.includes(b)) : [];
    const name = c.name || "?";
    const firstUser = opts.firstUser === true || c.user_id === FIRST_USER_ID
      || String(c.handle || "").toLowerCase() === FIRST_USER_HANDLE;
    const level = LEVELS.includes(c.level) ? c.level : "";
    const place = [c.city, c.mode ? t(c.mode) : ""].filter(Boolean).join(" · ");
    const link = /^https?:\/\//.test(c.link || "") ? c.link : "";
    let linkText = "Website";
    try { if (link && /(^|\.)linkedin\.com$/i.test(new URL(link).hostname)) linkText = "LinkedIn"; } catch { /* ungültig */ }
    const lv = LEVELS.indexOf(level);
    const blocks = {
      place: place ? `<p class="mc-place"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg><span data-no-i18n>${esc(place)}</span></p>` : "",
      pitch: c.pitch ? `<p class="mc-pitch" data-no-i18n>${esc(c.pitch)}</p>` : "",
      looking: c.looking ? `<p class="mc-looking"><span>${esc(t("Sucht"))}</span> <b>${esc(t(c.looking))}</b></p>` : "",
      skills: (c.skills || []).length ? `<ul class="mc-skills" data-no-i18n>${c.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "",
      stats: `<div class="mc-stats"><div><span>${esc(t("Zeit"))}</span><b>${esc(t(`${Number(c.hours) || 0} Std./Woche`))}</b><i class="mc-bar"><i style="width:${Math.min(100, ((Number(c.hours) || 0) / 20) * 100)}%"></i></i></div>${level ? `<div><span>${esc(t("Erfahrung"))}</span><b>${esc(t(level))}</b><i class="mc-dots">${[0, 1, 2].map((k) => `<i class="${k <= lv ? "on" : ""}"></i>`).join("")}</i></div>` : ""}</div>`,
    };
    const message = typeof opts.messageUrl === "string" && opts.messageUrl ? `<a class="mc-message mc-link-button" href="${esc(opts.messageUrl)}">Nachricht schreiben</a>` : "";
    return `<article class="my-card${firstUser ? " is-first-user" : ""}" data-first-user="${firstUser ? "true" : "false"}" data-theme="${theme}" data-surface="${surface}" data-shape="${shape}" data-layout="${layout}" style="--tg:${grad};--t1:${cols[0]}">
          <div class="mc-cover" aria-hidden="true">
            <span class="mc-mark"><svg viewBox="0 0 24 24"><defs><linearGradient id="xm-ac" x1="3" y1="21" x2="21" y2="3" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#B36BFF"/><stop offset="1" stop-color="#3A8AFF"/></linearGradient><linearGradient id="xm-bc" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3A8AFF"/><stop offset="1" stop-color="#3FE0F0"/></linearGradient><mask id="xm-gc" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="#000" stroke-width="7.4" stroke-linecap="round"/></mask></defs><path d="M3 3Q15.41 8.59 21 21" fill="none" stroke="url(#xm-bc)" stroke-width="4.6" stroke-linecap="round" mask="url(#xm-gc)"/><path d="M3 21Q8.59 8.59 21 3" fill="none" stroke="url(#xm-ac)" stroke-width="4.6" stroke-linecap="round"/></svg>xyntal</span>
            <span class="mc-badge${firstUser ? " mc-badge-first-user" : ""}">${esc(t(firstUser ? "First User" : "Early Access"))}</span>
          </div>
          <div class="mc-head"><span class="mc-avatar"${opts.avatarAttrs ? " " + opts.avatarAttrs : ""}><span>${esc(name[0].toUpperCase())}</span></span></div>
          <div class="mc-id">
            <${heading} class="mc-name${firstUser ? " mc-name-first-user" : ""}" data-no-i18n>${esc(name)}${c.is_verified === true ? ' <span class="verified-mark" role="img" aria-label="Verifiziertes Mitglied" title="Verifiziertes Mitglied"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5.2 10.3 3.1 3.1 6.7-7"/></svg></span>' : ""}</${heading}>
            <p class="mc-role">${esc(t(c.role || ""))}${level ? ` · ${esc(t(level))}` : ""}</p>
          </div>
          <div class="mc-blocks">${order.filter((b) => !off.includes(b)).map((b) => blocks[b]).join("")}</div>
          <div class="mc-foot">${link ? `<a class="mc-link mc-link-button" href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow" data-no-i18n>${esc(linkText)} ↗</a>` : ""}<span class="mc-site" data-no-i18n>xyntal.de/${esc(c.handle)}</span>${message}</div>
        </article>`;
  }

  window.XyntalCardHtml = html;
})();
