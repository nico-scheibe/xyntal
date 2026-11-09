// „Bestätige, dass du kein Bot bist“ (Cloudflare Turnstile) für die Registrierung.
// Aktiv nur, wenn in config.js ein turnstileSiteKey steht; sonst passiert hier nichts.
// Geprüft wird das Token auf dem Server (Supabase-Hook before-user-created), nicht hier.
window.XyntalTurnstile = (() => {
  const siteKey = (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.turnstileSiteKey) || "";
  const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  let loading = null;
  const widgets = new WeakMap();

  function load() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (!loading) {
      loading = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = SCRIPT; s.async = true; s.defer = true;
        s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Bot-Prüfung nicht geladen")));
        s.onerror = () => { loading = null; reject(new Error("Die Bot-Prüfung konnte nicht geladen werden. Bitte prüfe deine Verbindung oder einen Werbeblocker.")); };
        document.head.append(s);
      });
    }
    return loading;
  }

  // Zeigt das Kästchen im Element an (einmal pro Element).
  async function mount(el) {
    if (!siteKey || !el || widgets.has(el)) return;
    widgets.set(el, null);
    el.hidden = false;
    try {
      const ts = await load();
      const lang = (document.documentElement.lang || "de").slice(0, 2);
      widgets.set(el, ts.render(el, { sitekey: siteKey, language: lang, theme: "dark", appearance: "interaction-only", action: "signup" }));
    } catch (err) {
      widgets.delete(el);
      el.textContent = err.message;
    }
  }

  // Token holen; wartet kurz, falls die unsichtbare Prüfung noch läuft.
  async function token(el) {
    if (!siteKey) return "";
    await mount(el);
    const id = widgets.get(el);
    if (id === null || id === undefined || !window.turnstile) throw new Error("Die Bot-Prüfung lädt noch. Bitte versuche es gleich noch einmal.");
    for (let i = 0; i < 40; i++) {
      const t = window.turnstile.getResponse(id);
      if (t) return t;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("Bitte bestätige zuerst, dass du kein Bot bist.");
  }

  // Nach einem Fehlversuch: neues Token holen (jedes gilt nur einmal).
  function reset(el) {
    const id = widgets.get(el);
    if (id !== null && id !== undefined && window.turnstile) window.turnstile.reset(id);
  }

  return { enabled: !!siteKey, mount, token, reset };
})();
