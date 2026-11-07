// Banner der Xyntal-Karte: Vorlagen für alle, animierte Vorlagen und ein eigenes Bild
// mit Paid-Tarif (profiles.is_premium). Aussehen in banners.css, gleiche Liste im App-Repo
// (server/src/supabase/ownCard.ts BANNERS, qml/components/CardBanner.qml).
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
  const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
  window.XyntalBanners = {
    LIST,
    valid: (id) => BY_ID.has(id),
    isPremium: (id) => !!BY_ID.get(id)?.premium,
    validPath: (path) => PATH.test(path || ""),
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
