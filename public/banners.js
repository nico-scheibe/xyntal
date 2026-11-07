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
  window.XyntalBanners = {
    LIST,
    valid: (id) => BY_ID.has(id),
    isPremium: (id) => !!BY_ID.get(id)?.premium,
    validPath: (path) => PATH.test(path || ""),
    isVideo: (path) => VIDEO.test(path || ""),
    showFile,
    // Was ein Banner-Video bei diesem Mitglied groß und lang sein darf: {bytes, seconds},
    // beides null für Admins (keine Grenze), bytes 0 ohne Paid-Tarif. Dieselbe Tabelle
    // prüft der Bucket (banner_video_limit_bytes in der Datenbank).
    videoLimit(me) {
      if (!me) return { bytes: 0, seconds: 0 };
      if (me.is_admin === true) return { bytes: null, seconds: null };
      const MB = 1024 * 1024;
      switch (String(me.plan || "")) {
        case "Plus": case "Forge": case "Pulse": return { bytes: 25 * MB, seconds: 30 };
        case "Pro": case "Crew": case "Nexus": return { bytes: 60 * MB, seconds: 60 };
        case "Ultra": case "Foundry": case "Ascend": return { bytes: 150 * MB, seconds: 120 };
        case "Enterprise": case "Enterprise+": case "Works": case "Works Custom": return { bytes: 500 * MB, seconds: 300 };
        default: return me.is_premium === true ? { bytes: 25 * MB, seconds: 30 } : { bytes: 0, seconds: 0 };
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
