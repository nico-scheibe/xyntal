// /meine-karte: eigene Xyntal-Karte mit Konto laden, gestalten und speichern
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const gate = $("[data-mk-gate]"), app = $("[data-mk-app]");
  // Mitgliederkarten sind immer öffentlich (Migration 20261107200000_cards_always_public.sql),
  // daher braucht jede Karte einen Wunsch-Link.
  const pubHint = $("[data-mk-public-hint]"), urlLabel = $("[data-mk-url]");
  const saveBtn = $("[data-mk-save]"), view = $("[data-mk-view]"), out = $("[data-mk-status]");
  const B = window.XyntalBuilder;
  let dirty = false, savedHandle = "", importedWaitlistCard = false;

  const showGate = (html) => { gate.innerHTML = html; gate.hidden = false; app.hidden = true; };
  gate.addEventListener("click", (e) => { if (e.target.closest("[data-reload]")) location.reload(); });
  const say = (text, kind = "") => { out.textContent = text; out.className = "mk-status" + (kind ? ` is-${kind}` : ""); };

  function updateLink() {
    const d = B.get(), ok = B.validHandle(d.handle);
    urlLabel.textContent = `xyntal.de/${ok ? d.handle : "deinname"}`;
    pubHint.hidden = ok;
    view.hidden = !savedHandle;
    if (savedHandle) view.href = `/${savedHandle}`;
  }
  function markDirty() { dirty = true; saveBtn.textContent = t("Änderungen speichern"); updateLink(); }

  // Server-Karte → Builder
  const fromServer = (c) => {
    const d = c.design && typeof c.design === "object" ? c.design : {};
    return {
      name: c.name || "", role: c.role || "Entwicklung", level: c.level || "Fortgeschritten", skills: c.skills || [], hours: c.hours || 8,
      mode: c.mode || "Hybrid", city: c.city || "", looking: c.looking || "Mitgründer:in", pitch: c.pitch || "", link: c.link || "",
      handle: c.handle || "", theme: d.theme, c1: d.c1, c2: d.c2, surface: d.surface, shape: d.shape, layout: d.layout, fx: d.fx, banner: d.banner, order: d.order, off: d.off,
    };
  };

  // Ein Video als Profilbild kommt über eine signierte URL (streamt), ein Bild als Blob.
  async function loadAvatar(path) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|gif|webp|mp4|webm)$/.test(path || "")) return;
    try {
      if (/\.(mp4|webm)$/.test(path)) {
        const { data, error } = await sb.storage.from("avatars").createSignedUrl(path, 3600);
        if (!error && data && data.signedUrl) B.set({ photo: data.signedUrl, photoIsVideo: true });
        return;
      }
      const { data, error } = await sb.storage.from("avatars").download(path);
      if (!error && data) B.set({ photo: URL.createObjectURL(data), photoIsVideo: false });
    } catch { /* ohne Bild geht es auch */ }
  }

  // ---- Eigenes Banner (Paid): Bild oder Video im Bucket „banners“, Verweis in profiles.banner_path ----
  let member = null, bannerBusy = false;
  const bannerFile = $("#bf-banner-file"), bannerStatus = $("[data-bf-banner-status]");
  const BANNER_MAX = 4 * 1024 * 1024;
  // Ein Video wird nicht umgerechnet; wie groß und lang es sein darf, hängt vom Tarif ab
  // (banners.js videoLimit, Admins ohne Grenze). Der Bucket prüft die Größe noch einmal.
  const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" };
  const mb = (bytes) => String(Math.round(bytes / (1024 * 1024)));
  const videoLimit = () => window.XyntalBanners.videoLimit(member);
  // Der Hinweis unter den Knöpfen nennt die Grenze dieses Mitglieds.
  function bannerHint() {
    const limit = videoLimit();
    const video = limit.bytes === null ? t("oder MP4/WebM-Video ohne Größenlimit (Admin)")
      : limit.bytes > 0 ? t("oder MP4/WebM-Video · bis {mb} MB und {s} Sekunden").replace("{mb}", mb(limit.bytes)).replace("{s}", String(limit.seconds))
      : "";
    const gif = limit.animated === null ? t("GIF ohne Größenlimit (Admin)")
      : limit.animated > 0 ? t("GIF bis {mb} MB").replace("{mb}", mb(limit.animated)) : "";
    return [t("JPG, PNG oder WebP · bis 4 MB"), gif, video, t("läuft stumm in Schleife · am besten 1200 × 300 Pixel")].filter(Boolean).join(" · ");
  }
  const bannerSay = (text, kind = "") => { if (bannerStatus) { bannerStatus.textContent = text; bannerStatus.classList.toggle("is-error", kind === "error"); } };
  // Signierte URL statt Download: ein Video streamt in die Vorschau, statt erst
  // komplett zu laden (ein Banner darf je Tarif hunderte MB haben).
  async function loadBanner(path) {
    if (!window.XyntalBanners?.validPath(path)) return;
    try {
      const url = await window.XyntalBanners.fileUrl(path, sb, window.XYNTAL_CONFIG);
      if (url) B.set({ bannerUrl: url, bannerIsVideo: window.XyntalBanners.isVideo(path) });
    } catch { /* ohne Datei zeigt die Karte den Farbverlauf */ }
  }
  // Ein Video wird so hochgeladen, wie es ist, nachdem der Browser es lesen konnte
  // (Dauer und Maße): kaputte Dateien und Stundenfilme kommen nicht in den Bucket.
  function probeVideo(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), video = document.createElement("video");
      video.preload = "metadata"; video.muted = true;
      const done = (fn) => { URL.revokeObjectURL(url); video.removeAttribute("src"); fn(); };
      video.onloadedmetadata = () => done(() => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
      video.onerror = () => done(() => reject(new Error(t("Das Video konnte nicht gelesen werden. Bitte wähle eine MP4- oder WebM-Datei."))));
      video.src = url;
    });
  }
  // GIFs und Videos bleiben unverändert (Animation), alles andere wird auf 1200 × 300 zugeschnitten.
  async function prepareBanner(file) {
    if (VIDEO_TYPES[file.type]) {
      const limit = videoLimit();
      if (limit.bytes === 0) throw new Error(t("Ein Banner-Video gibt es ab Plus."));
      if (!file.size) throw new Error(t("Das Video konnte nicht gelesen werden. Bitte wähle eine MP4- oder WebM-Datei."));
      if (limit.bytes !== null && file.size > limit.bytes) throw new Error(t("Das Video darf in deinem Tarif höchstens {mb} MB groß sein.").replace("{mb}", mb(limit.bytes)));
      const info = await probeVideo(file);
      if (!info.width || !info.height) throw new Error(t("Das Video konnte nicht gelesen werden. Bitte wähle eine MP4- oder WebM-Datei."));
      if (limit.seconds !== null && Number.isFinite(info.duration) && info.duration > limit.seconds) throw new Error(t("Das Video darf in deinem Tarif höchstens {s} Sekunden lang sein.").replace("{s}", String(limit.seconds)));
      return { blob: file, ext: VIDEO_TYPES[file.type], type: file.type, video: true };
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) throw new Error(t("Bitte wähle ein JPG-, PNG-, WebP- oder GIF-Bild oder ein MP4-/WebM-Video."));
    if (file.type === "image/gif") {
      const limit = videoLimit();
      if (!file.size || (limit.animated !== null && file.size > limit.animated)) throw new Error(t("Ein GIF darf in deinem Tarif höchstens {mb} MB groß sein.").replace("{mb}", mb(limit.animated)));
      return { blob: file, ext: "gif", type: "image/gif" };
    }
    if (!file.size || file.size > BANNER_MAX) throw new Error(t("Das Banner darf höchstens 4 MB groß sein."));
    let bitmap;
    try { bitmap = await createImageBitmap(file); } catch { throw new Error(t("Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei.")); }
    try {
      const W = 1200, H = 300, canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const scale = Math.max(W / bitmap.width, H / bitmap.height);
      const w = bitmap.width * scale, h = bitmap.height * scale;
      canvas.getContext("2d").drawImage(bitmap, (W - w) / 2, (H - h) / 2, w, h);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
      if (!blob) throw new Error(t("Das Bild konnte nicht verkleinert werden. Bitte wähle ein anderes."));
      return { blob, ext: "jpg", type: "image/jpeg" };
    } finally { bitmap.close(); }
  }
  async function setBannerPath(path) {
    const old = member && member.banner_path;
    const updated = unwrap(await sb.from("profiles").update({ banner_path: path }).eq("id", member.id).select("banner_path").single());
    member = { ...member, banner_path: updated.banner_path };
    if (old && old !== path) await sb.storage.from("banners").remove([old]);
  }
  $("[data-bf-banner-pick]")?.addEventListener("click", () => { if (!bannerBusy) bannerFile?.click(); });
  bannerFile?.addEventListener("change", async () => {
    const file = bannerFile.files[0];
    bannerFile.value = "";
    if (!file || bannerBusy || !member) return;
    bannerBusy = true; bannerSay(t("Banner wird hochgeladen …"));
    let path = "";
    try {
      const { blob, ext, type, video } = await prepareBanner(file);
      path = `${member.id}/${crypto.randomUUID()}.${ext}`;
      unwrap(await sb.storage.from("banners").upload(path, blob, { contentType: type, cacheControl: "3600", upsert: false }));
      await setBannerPath(path);
      B.set({ bannerUrl: URL.createObjectURL(blob), bannerIsVideo: video === true, banner: "image" });
      markDirty();
      bannerSay(t("Banner gespeichert. Klick auf „Karte speichern“, damit deine Karte es zeigt."), "ok");
      setTimeout(() => { if (!bannerBusy && bannerStatus && !bannerStatus.classList.contains("is-error")) bannerSay(bannerHint()); }, 6000);
    } catch (err) {
      if (path && member && member.banner_path !== path) await sb.storage.from("banners").remove([path]).catch(() => {});
      bannerSay(friendlyError(err), "error");
    } finally { bannerBusy = false; }
  });
  $("[data-bf-banner-remove]")?.addEventListener("click", async () => {
    if (bannerBusy || !member || !member.banner_path) return;
    bannerBusy = true; bannerSay(t("Banner wird entfernt …"));
    try {
      await setBannerPath("");
      B.set({ bannerUrl: "", bannerIsVideo: false, banner: "theme" });
      markDirty();
      bannerSay(t("Banner entfernt."), "ok");
    } catch (err) { bannerSay(friendlyError(err), "error"); }
    finally { bannerBusy = false; }
  });

  async function start() {
    if (!sb || !B) return showGate(`<p>${t("Die Seite konnte nicht geladen werden. Bitte lade sie neu.")}</p>`);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      return showGate(`<h2>${t("Melde dich an, um deine Karte zu bearbeiten.")}</h2>
        <p>${t("Nutze am besten dieselbe E-Mail-Adresse wie bei der Warteliste – dann ist deine Karte schon da.")}</p>
        <div class="mk-actions"><a class="btn btn-primary" href="login?next=meine-karte">${t("Einloggen")}</a><a class="btn btn-glass" href="login#registrieren">${t("Konto anlegen")}</a></div>`);
    }
    if (await mfaPending()) return mfaRedirect();
    if (!session.user.email || !session.user.email_confirmed_at) {
      return showGate(`<h2>${t("Bitte bestätige zuerst deine E-Mail-Adresse.")}</h2><p>${t("Deine Karte ist mit deiner E-Mail-Adresse verknüpft. Schau in dein Postfach und klick auf den Bestätigungslink.")}</p>`);
    }
    let card, me;
    try {
      [card, me] = await Promise.all([sb.rpc("get_my_card").then(unwrap), currentMember()]);
    } catch (err) {
      return showGate(`<h2>${t("Deine Karte konnte nicht geladen werden.")}</h2><p>${esc(friendlyError(err))}</p><div class="mk-actions"><button class="btn btn-primary" type="button" data-reload>${t("Neu laden")}</button></div>`);
    }
    gate.hidden = true; app.hidden = false;
    // Gesperrtes Konto: Karte bleibt gespeichert, ist aber eingefroren und für andere unsichtbar
    if (me && me.banned === true && (!me.banned_until || new Date(me.banned_until) > new Date())) {
      saveBtn.disabled = true;
      say(t("Dein Konto ist gesperrt. Solange die Sperre läuft, kannst du deine Karte nicht ändern, und sie wird nicht angezeigt."), "error");
    }
    if (card) {
      B.set(fromServer(card));
      savedHandle = card.handle || "";
      try {
        const saved = JSON.parse(localStorage.getItem("xyntal-waitlist-card") || "null");
        if (saved?.email === session.user.email.trim().toLowerCase()) localStorage.removeItem("xyntal-waitlist-card");
      } catch { /* Server-Karte bleibt maßgeblich. */ }
      say(t("Deine Karte ist geladen."), "ok");
    } else {
      let waitlistDraft = null;
      try {
        const saved = JSON.parse(localStorage.getItem("xyntal-waitlist-card") || "null");
        if (saved?.email === session.user.email.trim().toLowerCase() && saved.card?.touched) {
          waitlistDraft = saved.card;
        }
      } catch { /* kein lokaler Entwurf */ }
      if (waitlistDraft) {
        B.set(fromServer(waitlistDraft));
        importedWaitlistCard = true;
        say(t("Deine Wartelisten-Karte wird in dein Konto übernommen …"));
      } else {
        B.set({ name: ((me && me.name) || "").split(" ")[0] || "" });
        say(t("Du hast noch keine Karte. Gestalte sie und klick auf „Karte speichern“."));
      }
    }
    if (me && me.avatar_path) loadAvatar(me.avatar_path);
    member = me || null;
    // Paid-Tarif schaltet animierte Banner und das eigene Banner-Bild frei (profiles.is_premium)
    B.set({ premium: !!me && me.is_premium === true });
    bannerSay(bannerHint());
    if (me && me.is_premium === true && me.banner_path) loadBanner(me.banner_path);
    dirty = false;
    updateLink();
  }

  B?.onChange(markDirty);
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  saveBtn.addEventListener("click", async () => {
    const d = B.get();
    if (!d.name.trim()) { say(t("Bitte gib deinen Vornamen ein."), "error"); $("#bf-name")?.focus(); return; }
    if (!d.handle) { say(t("Bitte wähle einen Wunsch-Link – darunter ist deine Karte öffentlich zu sehen."), "error"); $("#bf-handle")?.focus(); return; }
    if (!B.validHandle(d.handle)) { say(t("Der Wunsch-Link braucht 3–20 Zeichen: Kleinbuchstaben, Zahlen, - und _."), "error"); $("#bf-handle")?.focus(); return; }
    saveBtn.disabled = true; say(t("Wird gespeichert …"));
    try {
      const res = unwrap(await sb.rpc("save_my_card", {
        p_name: d.name.trim().slice(0, 24), p_role: d.role, p_skills: d.skills.slice(0, 4), p_hours: d.hours, p_looking: d.looking,
        p_pitch: d.pitch.trim().slice(0, 120), p_lang: document.documentElement.lang === "en" ? "en" : "de",
        p_city: d.city.trim().slice(0, 40), p_mode: d.mode, p_level: d.level, p_link: B.linkUrl(d.link), p_handle: d.handle,
        p_public: true,
        p_design: { theme: d.theme, c1: d.c1, c2: d.c2, surface: d.surface, shape: d.shape, layout: d.layout, fx: d.fx, banner: d.banner, order: d.order, off: d.off },
      }));
      const fresh = unwrap(await sb.rpc("get_my_card"));
      if (fresh) { B.set({ handle: fresh.handle || "" }); savedHandle = fresh.handle || ""; }
      if (importedWaitlistCard && fresh) {
        try { localStorage.removeItem("xyntal-waitlist-card"); } catch { /* Karte ist bereits sicher auf dem Server. */ }
        importedWaitlistCard = false;
      }
      if (importedWaitlistCard && !fresh) throw new Error(t("Die Übernahme konnte nicht bestätigt werden. Deine Karte bleibt auf diesem Gerät gespeichert."));
      dirty = false; saveBtn.textContent = t("Karte speichern"); updateLink();
      if (res === "taken") say(t("Gespeichert – aber dieser Wunsch-Link ist schon vergeben. Dein bisheriger Link bleibt."), "error");
      else if (res === "invalid") say(t("Gespeichert – dieser Wunsch-Link ist nicht verfügbar. Dein bisheriger Link bleibt."), "error");
      else if (fresh && fresh.is_public) say(t(`Gespeichert. Dein Profil ist unter xyntal.de/${fresh.handle} zu sehen.`), "ok");
      else say(t("Gespeichert."), "ok");
      // eingebettet im Profilbereich: Übersicht oben aktualisieren
      if (window.parent !== window) window.parent.postMessage({ type: "xyntal-card-saved" }, location.origin);
    } catch (err) {
      say(friendlyError(err), "error");
    } finally { saveBtn.disabled = false; }
  });

  // Ist bereits eine bestätigte Wartelisten-Karte für diese E-Mail vorhanden,
  // wird sie sofort geladen. Andernfalls die ausdrücklich freigegebene lokale
  // Karte automatisch im angemeldeten Konto sichern.
  start().then(() => { if (importedWaitlistCard) saveBtn.click(); });
})();
