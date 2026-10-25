// Öffentliche Xyntal-Karte unter xyntal.de/name – zeigt nur, was die Person freigegeben hat
(() => {
  const root = document.querySelector("[data-profile]");
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HANDLE = /^[a-z0-9][a-z0-9_-]{2,19}$/;
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";
  const THEMES = {
    aurora: ["#B95CFF", "#FF5FD2", "#5B8CFF", "#3FD8FF"], sunset: ["#FFB547", "#FF6A5C", "#FF3D8B", "#B95CFF"],
    ocean: ["#34D399", "#3FD8FF", "#5B8CFF", "#6D5BFF"], mono: ["#FFFFFF", "#C9C9D1", "#7A7A86", "#E4E4E7"],
  };
  const BLOCKS = ["place", "pitch", "skills", "stats", "looking"];
  const LEVELS = ["Einsteiger", "Fortgeschritten", "Profi"];
  const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

  // Name aus /name, /u#name oder /u?name=…
  let handle = location.pathname.replace(/^\/+|\/+$/g, "");
  if (!HANDLE.test(handle.toLowerCase()) || handle === "u") handle = (location.hash.slice(1) || new URLSearchParams(location.search).get("name") || "");
  handle = decodeURIComponent(handle).toLowerCase();
  if (HANDLE.test(handle) && location.pathname !== `/${handle}`) history.replaceState(null, "", `/${handle}`);

  const page = (html) => { root.innerHTML = html; };
  const ctas = (primary) => `<div class="profile-actions">${primary}<a class="btn btn-glass" href="/#warteliste">${esc(t("Auf die Warteliste"))}</a></div>`;
  const freeLink = (h) => `/?handle=${encodeURIComponent(h)}#karte`;

  function renderCard(c) {
    const d = c.design && typeof c.design === "object" ? c.design : {};
    const theme = d.theme === "custom" && isHex(d.c1) && isHex(d.c2) ? "custom" : THEMES[d.theme] ? d.theme : "aurora";
    const cols = theme === "custom" ? [d.c1, d.c2] : THEMES[theme];
    const grad = `linear-gradient(120deg, ${cols.map((col, k, a) => `${col} ${Math.round((k / (a.length - 1)) * 100)}%`).join(", ")})`;
    const surface = d.surface === "light" ? "light" : "dark", shape = d.shape === "rounded" ? "rounded" : "circle", layout = d.layout === "center" ? "center" : "left";
    const order = (Array.isArray(d.order) ? d.order.filter((b) => BLOCKS.includes(b)) : []).concat(BLOCKS).filter((b, i, a) => a.indexOf(b) === i);
    const off = Array.isArray(d.off) ? d.off.filter((b) => BLOCKS.includes(b)) : [];
    const name = c.name || "?";
    const level = LEVELS.includes(c.level) ? c.level : "";
    const place = [c.city, c.mode ? t(c.mode) : ""].filter(Boolean).join(" · ");
    const link = /^https?:\/\//.test(c.link || "") ? c.link : "";
    const lv = LEVELS.indexOf(level);
    const blocks = {
      place: place ? `<p class="mc-place"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg><span data-no-i18n>${esc(place)}</span></p>` : "",
      pitch: c.pitch ? `<p class="mc-pitch" data-no-i18n>${esc(c.pitch)}</p>` : "",
      looking: c.looking ? `<p class="mc-looking"><span>${esc(t("Sucht"))}</span> <b>${esc(t(c.looking))}</b></p>` : "",
      skills: (c.skills || []).length ? `<ul class="mc-skills" data-no-i18n>${c.skills.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "",
      stats: `<div class="mc-stats"><div><span>${esc(t("Zeit"))}</span><b>${esc(t(`${Number(c.hours) || 0} Std./Woche`))}</b><i class="mc-bar"><i style="width:${Math.min(100, ((Number(c.hours) || 0) / 20) * 100)}%"></i></i></div>${level ? `<div><span>${esc(t("Erfahrung"))}</span><b>${esc(t(level))}</b><i class="mc-dots">${[0, 1, 2].map((k) => `<i class="${k <= lv ? "on" : ""}"></i>`).join("")}</i></div>` : ""}</div>`,
    };
    document.title = `${name} · xyntal.de/${c.handle}`;
    page(`
      <div class="bp-stage">
        <article class="my-card" data-theme="${theme}" data-surface="${surface}" data-shape="${shape}" data-layout="${layout}" style="--tg:${grad};--t1:${cols[0]}">
          <div class="mc-cover" aria-hidden="true">
            <span class="mc-mark"><svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5l-5.3 5.3M10.3 13.7L5 19"/></svg>xyntal</span>
            <span class="mc-badge">${esc(t("Early Access"))}</span>
          </div>
          <div class="mc-head"><span class="mc-avatar"><span>${esc(name[0].toUpperCase())}</span></span></div>
          <div class="mc-id">
            <h1 class="mc-name" data-no-i18n>${esc(name)}</h1>
            <p class="mc-role">${esc(t(c.role || ""))}${level ? ` · ${esc(t(level))}` : ""}</p>
          </div>
          <div class="mc-blocks">${order.filter((b) => !off.includes(b)).map((b) => blocks[b]).join("")}</div>
          <div class="mc-foot">${link ? `<a class="mc-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer nofollow" data-no-i18n>${esc(link.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "").slice(0, 40))}</a>` : ""}<span class="mc-site" data-no-i18n>xyntal.de/${esc(c.handle)}</span></div>
        </article>
      </div>
      <div class="profile-msg">
        <p>${esc(t("Auf Xyntal finden Entwickler, Designer und Gründer die richtigen Leute für ihre Idee."))}</p>
        ${ctas(`<a class="btn btn-primary" href="/#karte">${esc(t("Bau deine eigene Karte"))}</a>`)}
      </div>`);
  }

  async function load() {
    if (!HANDLE.test(handle)) {
      page(`<div class="profile-msg"><h1>${esc(t("Diese Karte gibt es nicht."))}</h1><p>${esc(t("Prüf den Link oder bau dir deine eigene Xyntal-Karte."))}</p>${ctas(`<a class="btn btn-primary" href="/#karte">${esc(t("Bau deine eigene Karte"))}</a>`)}</div>`);
      return;
    }
    try {
      const res = await fetch(`${SUPA}/rest/v1/rpc/get_public_card`, {
        method: "POST",
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_handle: handle }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const card = await res.json();
      if (card && card.name) return renderCard(card);
      if (card && card.reserved) {
        document.title = `xyntal.de/${handle} – ${t("reserviert")}`;
        return page(`<div class="profile-msg"><h1><b>xyntal.de/${esc(handle)}</b><br>${esc(t("ist reserviert."))}</h1><p>${esc(t("Diese Person ist schon auf der Warteliste. Ihre Karte erscheint hier, sobald Xyntal startet."))}</p>${ctas(`<a class="btn btn-primary" href="/#karte">${esc(t("Eigenen Link sichern"))}</a>`)}</div>`);
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
