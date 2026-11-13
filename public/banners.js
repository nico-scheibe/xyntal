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
  // Banner (banners.css) auf das Titelbild einer Karte (CW × H) im Canvas zeichnen – ein Standbild der Vorlage,
  // Animationen bleiben stehen. C: Kartenfarben; media: geladenes eigenes Bild bzw. Video (sonst Farbverlauf).
  // Für den Bild-Export (card-builder.js) und das Story-Bild (card-story.js).
  function paint(k, id, CW, H, C, media) {
    const sc = CW / 380, lin = (y0, y1, stops) => { const gr = k.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    const tg = () => { const gr = k.createLinearGradient(0, 0, CW, H); C.forEach((col, i) => gr.addColorStop(i / (C.length - 1), col)); return gr; };
    const shade = (a, b) => lin(0, H, [[0, `rgba(10,10,16,${a})`], [1, `rgba(26,26,35,${b})`]]);
    const fill = (style) => { k.fillStyle = style; k.fillRect(0, 0, CW, H); };
    const radial = (cx, cy, r, c0, c1 = "rgba(0,0,0,0)") => { const gr = k.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, c0); gr.addColorStop(1, c1); fill(gr); };
    const lines = (step, col) => { k.fillStyle = col; for (let y = 0; y < H; y += step) k.fillRect(0, y, CW, sc); for (let x = 0; x < CW; x += step) k.fillRect(x, 0, sc, H); };
    const dot = (x, y, r) => { const gr = k.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, "#fff"); gr.addColorStop(1, "rgba(255,255,255,0)"); k.fillStyle = gr; k.fillRect(x - r, y - r, r * 2, r * 2); };
    const ellipseGlow = (cx, cy, rx, ry, col) => { k.save(); k.translate(cx, cy); k.scale(rx, ry); const gr = k.createRadialGradient(0, 0, 0, 0, 0, 1); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); k.fillStyle = gr; k.fillRect(-cx / rx, -cy / ry, CW / rx, H / ry); k.restore(); };
    k.save(); k.beginPath(); k.rect(0, 0, CW, H); k.clip();
    switch (id) {
      case "mesh": fill(tg()); fill(shade(0.05, 0.45)); radial(CW * 0.88, H * 0.85, 0.55 * Math.hypot(CW * 0.88, H * 0.85), "rgba(10,10,16,0.55)"); radial(CW * 0.12, H * 0.15, 0.42 * Math.hypot(CW * 0.88, H * 0.85), "rgba(255,255,255,0.32)"); break;
      case "grid": fill(tg()); fill(shade(0.1, 0.6)); lines(16 * sc, "rgba(255,255,255,0.16)"); break;
      case "dots": fill(tg()); fill(shade(0.05, 0.55)); k.fillStyle = "rgba(255,255,255,0.34)"; for (let y = 6 * sc; y < H; y += 12 * sc) for (let x = 6 * sc; x < CW; x += 12 * sc) { k.beginPath(); k.arc(x, y, 1.5 * sc, 0, Math.PI * 2); k.fill(); } break;
      case "waves": {
        fill(tg()); fill(lin(0, H, [[0, "rgba(10,10,16,0.02)"], [1, "rgba(26,26,35,0.35)"]]));
        const w1 = new Path2D("M0 62c20-10 40-10 60 0s40 10 60 0 40-10 60 0V96H0z"), w2 = new Path2D("M0 76c20-8 40-8 60 0s40 8 60 0 40-8 60 0V96H0z"), ts = H / 96;
        for (let x = 0; x < CW; x += 160 * ts) { k.save(); k.translate(x, 0); k.scale(ts, ts); k.beginPath(); k.rect(0, 0, 160, 96); k.clip(); k.fillStyle = "rgba(255,255,255,0.14)"; k.fill(w1); k.fillStyle = "rgba(0,0,0,0.18)"; k.fill(w2); k.restore(); }
        break;
      }
      case "stripes": {
        fill(tg()); fill(shade(0.05, 0.55)); k.fillStyle = "rgba(255,255,255,0.13)";
        const step = 22 * Math.SQRT2 * sc, w = 10 * Math.SQRT2 * sc;
        for (let c = 0; c < CW + H; c += step) { k.beginPath(); k.moveTo(c, 0); k.lineTo(c + w, 0); k.lineTo(c + w - H, H); k.lineTo(c - H, H); k.closePath(); k.fill(); }
        break;
      }
      case "glow": fill(lin(0, H, [[0, "#0B0B12"], [1, "#15151E"]])); ellipseGlow(CW * 0.5, H * 1.3, CW * 0.9, H * 1.4 * 0.62, C[0]); k.globalAlpha = 0.9; k.fillStyle = tg(); k.fillRect(0, H - 2 * sc, CW, 2 * sc); break;
      case "solid": fill(C[0]); fill(lin(0, H, [[0, "rgba(0,0,0,0.12)"], [1, "rgba(0,0,0,0.38)"]])); break;
      case "flow": fill(tg()); fill(shade(0.02, 0.5)); break;
      case "stars": {
        fill(lin(0, H, [[0, "#07070D"], [1, "#12121C"]])); ellipseGlow(CW * 0.5, H * 1.4, CW * 0.8, H * 1.2 * 0.65, C[0]);
        for (const [x, y, r] of [[12, 28, 1.4], [26, 62, 1], [41, 18, 1.6], [55, 48, 1], [68, 22, 1.4], [79, 58, 1], [90, 30, 1.5], [7, 75, 1], [34, 82, 1], [62, 76, 1.2],
          [18, 45, 1], [47, 66, 1.3], [73, 40, 1], [85, 78, 1.4], [29, 12, 1]]) dot(CW * x / 100, H * y / 100, r * 2.2 * sc);
        break;
      }
      case "pulse": fill(lin(0, H, [[0, "#0D0D15"], [1, "#171722"]])); k.globalAlpha = 0.85; fill(tg()); radial(CW * 0.3, H * 0.5, 0.38 * CW, rgba(C[0], 1)); radial(CW * 0.72, H * 0.45, 0.3 * CW, "rgba(255,255,255,0.5)"); break;
      case "scan": fill(tg()); fill(shade(0.2, 0.7)); lines(14 * sc, "rgba(255,255,255,0.12)"); break;
      case "image": {
        if (!media) { fill(tg()); fill(shade(0.02, 0.6)); break; }
        const mw = media.videoWidth || media.naturalWidth || media.width, mh = media.videoHeight || media.naturalHeight || media.height;
        if (mw && mh) { const f = Math.max(CW / mw, H / mh); k.drawImage(media, (CW - mw * f) / 2, (H - mh * f) / 2, mw * f, mh * f); }
        fill(lin(0, H, [[0, "rgba(10,10,16,0.08)"], [1, "rgba(10,10,16,0.45)"]]));
        break;
      }
      default: fill(tg()); fill(shade(0.02, 0.6));
    }
    k.restore();
  }
  const rgba = (h, a) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;
  window.XyntalBanners = {
    LIST,
    fileUrl,
    valid: (id) => BY_ID.has(id),
    isPremium: (id) => !!BY_ID.get(id)?.premium,
    validPath: (path) => PATH.test(path || ""),
    isVideo: (path) => VIDEO.test(path || ""),
    showFile,
    paint,
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
