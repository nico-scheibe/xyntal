// /meine-karte: eigene Xyntal-Karte mit Konto laden, gestalten und speichern
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const gate = $("[data-mk-gate]"), app = $("[data-mk-app]");
  const pub = $("[data-mk-public]"), pubHint = $("[data-mk-public-hint]"), urlLabel = $("[data-mk-url]");
  const saveBtn = $("[data-mk-save]"), view = $("[data-mk-view]"), out = $("[data-mk-status]");
  const B = window.XyntalBuilder;
  let dirty = false, savedHandle = "";

  const showGate = (html) => { gate.innerHTML = html; gate.hidden = false; app.hidden = true; };
  const say = (text, kind = "") => { out.textContent = text; out.className = "mk-status" + (kind ? ` is-${kind}` : ""); };

  function updateLink() {
    const d = B.get(), ok = B.validHandle(d.handle);
    urlLabel.textContent = `xyntal.de/${ok ? d.handle : "deinname"}`;
    pubHint.hidden = ok;
    if (!ok) pub.checked = false;
    pub.disabled = !ok;
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
      handle: c.handle || "", theme: d.theme, c1: d.c1, c2: d.c2, surface: d.surface, shape: d.shape, layout: d.layout, order: d.order, off: d.off,
    };
  };

  async function loadAvatar(path) {
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path || "")) return;
    try {
      const { data, error } = await sb.storage.from("avatars").download(path);
      if (!error && data) B.set({ photo: URL.createObjectURL(data) });
    } catch { /* ohne Bild geht es auch */ }
  }

  async function start() {
    if (!sb || !B) return showGate(`<p>${t("Die Seite konnte nicht geladen werden. Bitte lade sie neu.")}</p>`);
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      return showGate(`<h2>${t("Melde dich an, um deine Karte zu bearbeiten.")}</h2>
        <p>${t("Nutze am besten dieselbe E-Mail-Adresse wie bei der Warteliste – dann ist deine Karte schon da.")}</p>
        <div class="mk-actions"><a class="btn btn-primary" href="login?next=meine-karte">${t("Einloggen")}</a><a class="btn btn-glass" href="mitglied-werden">${t("Konto anlegen")}</a></div>`);
    }
    if (await mfaPending()) return mfaRedirect();
    if (!session.user.email || !session.user.email_confirmed_at) {
      return showGate(`<h2>${t("Bitte bestätige zuerst deine E-Mail-Adresse.")}</h2><p>${t("Deine Karte ist mit deiner E-Mail-Adresse verknüpft. Schau in dein Postfach und klick auf den Bestätigungslink.")}</p>`);
    }
    let card, me;
    try {
      [card, me] = await Promise.all([sb.rpc("get_my_card").then(unwrap), currentMember()]);
    } catch (err) {
      return showGate(`<h2>${t("Deine Karte konnte nicht geladen werden.")}</h2><p>${esc(friendlyError(err))}</p><div class="mk-actions"><button class="btn btn-primary" type="button" onclick="location.reload()">${t("Neu laden")}</button></div>`);
    }
    gate.hidden = true; app.hidden = false;
    if (card) {
      B.set(fromServer(card));
      pub.checked = !!card.is_public;
      savedHandle = card.is_public ? card.handle || "" : card.handle || "";
      say(t("Deine Karte ist geladen."), "ok");
    } else {
      B.set({ name: ((me && me.name) || "").split(" ")[0] || "" });
      say(t("Du hast noch keine Karte. Gestalte sie und klick auf „Karte speichern“."));
    }
    if (me && me.avatar_path) loadAvatar(me.avatar_path);
    dirty = false;
    updateLink();
  }

  B?.onChange(markDirty);
  pub.addEventListener("change", markDirty);
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  saveBtn.addEventListener("click", async () => {
    const d = B.get();
    if (!d.name.trim()) { say(t("Bitte gib deinen Vornamen ein."), "error"); $("#bf-name")?.focus(); return; }
    if (d.handle && !B.validHandle(d.handle)) { say(t("Der Wunsch-Link braucht 3–20 Zeichen: Kleinbuchstaben, Zahlen, - und _."), "error"); $("#bf-handle")?.focus(); return; }
    saveBtn.disabled = true; say(t("Wird gespeichert …"));
    try {
      const res = unwrap(await sb.rpc("save_my_card", {
        p_name: d.name.trim().slice(0, 24), p_role: d.role, p_skills: d.skills.slice(0, 4), p_hours: d.hours, p_looking: d.looking,
        p_pitch: d.pitch.trim().slice(0, 120), p_lang: document.documentElement.lang === "en" ? "en" : "de",
        p_city: d.city.trim().slice(0, 40), p_mode: d.mode, p_level: d.level, p_link: B.linkUrl(d.link), p_handle: d.handle,
        p_public: pub.checked,
        p_design: { theme: d.theme, c1: d.c1, c2: d.c2, surface: d.surface, shape: d.shape, layout: d.layout, order: d.order, off: d.off },
      }));
      const fresh = unwrap(await sb.rpc("get_my_card"));
      if (fresh) { B.set({ handle: fresh.handle || "" }); pub.checked = !!fresh.is_public; savedHandle = fresh.handle || ""; }
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

  start();
})();
