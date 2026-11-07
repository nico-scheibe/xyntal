// Symbole und Erkennung für die Link-Seite (xyntal.de/name und Editor in /meine-karte)
(() => {
  const P = {
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.9 5.6 3.9 9s-1.3 6.4-3.9 9c-2.6-2.6-3.9-5.6-3.9-9S9.4 5.6 12 3z"/>',
    github: '<path d="M9 19c-4 1.2-4-2-6-2.5M15 21v-3.2a2.8 2.8 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.3 1.3a11.4 11.4 0 0 0-6 0C6.700 2.900 5.700 3.200 5.700 3.200a4.300 4.300 0 0 0-.1 3.200A4.600 4.600 0 0 0 4.300 9.600c0 4.700 2.800 5.700 5.500 6a2.800 2.800 0 0 0-.8 2.200V21"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.500 6.500v.01"/>',
    youtube: '<rect x="2.500" y="5.500" width="19" height="13" rx="4"/><path d="M10 9.500v5l4.500-2.500z"/>',
    x: '<path d="M4 4l16 16M20 4L4 20"/>',
    tiktok: '<path d="M14 3v11.500a3.500 3.500 0 1 1-3.500-3.500M14 3c.3 2.400 1.900 4 4.500 4.200"/>',
    discord: '<path d="M8 8c2.600-1 5.400-1 8 0 1.600 2.300 2.400 4.700 2.600 7.200-1.200.9-2.400 1.500-3.800 1.800l-.9-1.600M8 8C5.400 8.800 4.400 11 4.200 15.200c1.200.9 2.400 1.500 3.800 1.800l.9-1.600"/><circle cx="9.500" cy="12.500" r="1"/><circle cx="14.500" cy="12.500" r="1"/>',
    twitch: '<path d="M4 4h16v10l-4 4h-4l-3 3v-3H4z"/><path d="M15 8v4M11 8v4"/>',
    spotify: '<circle cx="12" cy="12" r="9"/><path d="M7 9.500c3.500-1 7-.6 10 1M7.500 12.500c2.800-.8 5.600-.5 8.500 1M8 15.300c2.300-.6 4.500-.4 6.700.7"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    calendar: '<rect x="3.500" y="5" width="17" height="15" rx="2"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    shop: '<path d="M4 8h16l-1.200 11H5.200z"/><path d="M8.500 8V6.500a3.500 3.500 0 0 1 7 0V8"/>',
    phone: '<path d="M6.500 3h3l1.500 4-2 1.500a11 11 0 0 0 6.500 6.500l1.500-2 4 1.500v3a2 2 0 0 1-2 2A16 16 0 0 1 4.500 5a2 2 0 0 1 2-2z"/>',
  };
  const LABELS = { link: "Link", globe: "Website", github: "GitHub", linkedin: "LinkedIn", instagram: "Instagram", youtube: "YouTube", x: "X", tiktok: "TikTok",
    discord: "Discord", twitch: "Twitch", spotify: "Spotify", mail: "E-Mail", calendar: "Termin", file: "Datei", shop: "Shop", phone: "Telefon" };
  const HOSTS = [[/(^|\.)github\.com$/, "github"], [/(^|\.)linkedin\.com$/, "linkedin"], [/(^|\.)instagram\.com$/, "instagram"], [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
    [/(^|\.)(x\.com|twitter\.com)$/, "x"], [/(^|\.)tiktok\.com$/, "tiktok"], [/(^|\.)(discord\.com|discord\.gg)$/, "discord"], [/(^|\.)twitch\.tv$/, "twitch"],
    [/(^|\.)spotify\.com$/, "spotify"], [/(^|\.)(cal\.com|calendly\.com)$/, "calendar"]];
  const keys = Object.keys(P);
  const svg = (key) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[P[key] ? key : "link"]}</svg>`;
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const guess = (u) => { const h = hostOf(u); const hit = HOSTS.find(([re]) => re.test(h)); return hit ? hit[1] : "globe"; };
  window.XyntalLinkIcons = { keys, labels: LABELS, svg, guess, hostOf };
})();
