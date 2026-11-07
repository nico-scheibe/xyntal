// Banner der Xyntal-Karte: Vorlagen für alle, animierte Vorlagen und ein eigenes Bild
// oder Video (MP4/WebM, stumm in Schleife) mit Paid-Tarif (profiles.is_premium).
// Aussehen in banners.css.
(() => {
  const LIST = [
    { id: "theme", label: "Farbverlauf" },
    { id: "mesh", label: "Nebel" },
    { id: "grid", label: "Raster" },
    { id: "dots", label: "Punkte" },
    { id: "waves", label: "Wellen" },
    { id: "stripes", label: "Streifen" },
    { id: "glow", label: "Glühen" },
    { id: "solid", label: "Einfarbig" },
    { id: "flow", label: "Fließend", premium: true, animated: true },
    { id: "stars", label: "Sternenhimmel", premium: true, animated: true },
    { id: "pulse", label: "Puls", premium: true, animated: true },
    { id: "scan", label: "Scan", premium: true, animated: true },
    { id: "image", label: "Eigenes Bild", premium: true },
  ];
  const BY_ID = new Map(LIST.map((b) => [b.id, b]));
  const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/;
  const VIDEO = /\.(mp4|webm)$/;
  // Zeigt die eigene Datei in einer .mc-cover: ein Video als stummes, laufendes
  // <video> im Cover, ein Bild als --banner-img auf der Karte (banners.css).
  function showFile(cover, url, isVideo) {
    if (!cover) return;
    const card = cover.closest(".my-card") || cover;
    let video = cover.querySelector("video.mc-banner-video");
    if (isVideo && url) {
      if (!video) {
        video = document.createElement("video");
        video.className = "mc-banner-video";
        video.muted = true; video.loop = true; video.autoplay = true; video.playsInline = true;
        video.setAttribute("aria-hidden", "true");
        cover.prepend(video);
      }
      if (video.getAttribute("src") !== url) video.src = url;
      video.play().catch(() => {});
      card.style.removeProperty("--banner-img");
    } else {
      if (video) video.remove();
      if (url) card.style.setProperty("--banner-img", `url("${url}")`);
      else card.style.removeProperty("--banner-img");
    }
  }
  // Eine kurzlebige, signierte URL auf die eigene Datei im privaten Bucket „banners“:
  // Bild und Video laden damit direkt vom Speicher (ein Video streamt, statt erst
  // komplett als Blob zu kommen). Lesbar ist nur, was ein Profil zeigt; mit der
  // Sitzung (sb) auch das eigene noch nicht gezeigte Banner. "" wenn nichts geht.
  async function fileUrl(path, sb, cfg, ttl = 3600) {
    if (!PATH.test(path || "")) return "";
    try {
      if (sb && sb.storage) {
        const { data, error } = await sb.storage.from("banners").createSignedUrl(path, ttl);
        if (!error && data && data.signedUrl) return data.signedUrl;
      }
    } catch { /* unten ohne Sitzung versuchen */ }
    try {
      const c = cfg || window.XYNTAL_CONFIG;
      if (!c || !c.supabaseUrl || !c.supabaseKey) return "";
      const res = await fetch(`${c.supabaseUrl}/storage/v1/object/sign/banners/${path}`, {
        method: "POST",
        headers: { apikey: c.supabaseKey, Authorization: `Bearer ${c.supabaseKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: ttl }),
      });
      if (!res.ok) return "";
      const body = await res.json();
      return body && typeof body.signedURL === "string" ? `${c.supabaseUrl}/storage/v1${body.signedURL}` : "";
    } catch { return ""; }
  }
  window.XyntalBanners = {
    LIST,
    fileUrl,
    valid: (id) => BY_ID.has(id),
    isPremium: (id) => !!BY_ID.get(id)?.premium,
    validPath: (path) => PATH.test(path || ""),
    isVideo: (path) => VIDEO.test(path || ""),
    showFile,
    // Was ein Banner bei diesem Mitglied groß und lang sein darf: {bytes, seconds} fürs
    // Video, animated für ein GIF/WebP; null für Admins (keine Grenze), 0 ohne Paid-Tarif.
    // Dieselbe Tabelle wie beim Profilbild (avatarLimits in avatars.js); der Bucket prüft
    // die Größe noch einmal (banner_video_limit_bytes / avatar_animated_limit_bytes).
    videoLimit(me) {
      if (!me || me.is_premium !== true) return { bytes: 0, seconds: 0, animated: 0 };
      if (me.is_admin === true) return { bytes: null, seconds: null, animated: null };
      const MB = 1024 * 1024;
      switch (String(me.plan || "")) {
        case "Pro": case "Crew": case "Nexus": return { bytes: 25 * MB, seconds: 30, animated: 8 * MB };
        case "Ultra": case "Foundry": case "Ascend": return { bytes: 60 * MB, seconds: 60, animated: 16 * MB };
        case "Enterprise": case "Enterprise+": case "Works": case "Works Custom": return { bytes: 150 * MB, seconds: 120, animated: 32 * MB };
        default: return { bytes: 10 * MB, seconds: 15, animated: 4 * MB };
      }
    },
    // Was die Karte zeigt: Paid-Banner nur mit Paid-Tarif, das eigene Bild nur mit Datei.
    effective(id, premium, hasImage = true) {
      const b = BY_ID.get(id);
      if (!b) return "theme";
      if (b.premium && !premium) return "theme";
      if (b.id === "image" && !hasImage) return "theme";
      return b.id;
    },
  };
})();
