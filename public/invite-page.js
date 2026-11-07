// xyntal.de/<name>/invite: Einladungsseite. Zeigt, wer einlädt, nennt den Promo-Code (= der Link-Name) und führt
// zur Registrierung. Der Name wird gemerkt (xyntal-ref-handle); eingelöst wird er in account-menu.js, sobald das
// neue Konto die E-Mail bestätigt hat. Eingeloggte Konten brauchen keine Einladung.
(() => {
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";
  const $ = (s) => document.querySelector(s);
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const m = location.pathname.toLowerCase().match(/^\/([a-z0-9][a-z0-9_-]{2,19})\/invite\/?$/);
  const handle = m ? m[1] : "";
  const title = $("[data-inv-title]"), text = $("[data-inv-text]"), eyebrow = $("[data-inv-eyebrow]");
  const set = (el, de) => { el.textContent = t(de); };

  let member = false;
  try { member = !!localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token"); } catch { /* privat */ }

  function invalid() {
    set(eyebrow, "Einladung");
    set(title, "Dieser Einladungslink gilt nicht.");
    set(text, "Prüf den Link oder leg trotzdem ein Konto an – die Gratiswoche gibt es nur mit einem gültigen Einladungslink.");
  }

  async function load() {
    if (!handle) return invalid();
    try {
      // Nur der Name, und nur wenn der Link einem Konto gehört (get_public_card verbirgt user_id vor Gästen)
      const res = await fetch(`${SUPA}/rest/v1/rpc/get_invite_name`, {
        method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_handle: handle }),
      });
      const name = res.ok ? await res.json() : null;
      if (typeof name !== "string" || !name) return invalid();
      const card = { name };
      document.title = `${card.name} ${t("lädt dich zu Xyntal ein")} – Xyntal`;
      if (member) {
        set(title, "Du hast schon ein Konto.");
        set(text, "Einladungen gelten nur für neue Konten. Du kannst aber selbst Freunde einladen: Deinen Link findest du unter Profil → Tarif & Rechnungen.");
        $("[data-inv-signup]").hidden = true;
        return;
      }
      try { localStorage.setItem("xyntal-ref-handle", JSON.stringify({ handle, at: Date.now() })); } catch { /* geht auch ohne */ }
      title.textContent = `${card.name} ${t("lädt dich zu Xyntal ein.")}`;
      set(text, "Leg ein Konto an und ihr bekommt beide 7 Tage Plus gratis.");
      $("[data-inv-code-value]").textContent = handle;
      $("[data-inv-code]").hidden = false;
      $("[data-inv-signup]").href = `/login?code=${encodeURIComponent(handle)}#registrieren`;
    } catch { invalid(); }
  }
  load();
  document.addEventListener("xyntal:lang", load);
})();
