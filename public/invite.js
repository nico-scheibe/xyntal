// Einladungsprogramm: persönlicher Link xyntal.de/deinname, 7 Tage Plus gratis für beide – nur mit Konto.
// Füllt jedes [data-invite]: eingeloggt mit Wunsch-Link zeigt es den Link und den Stand, sonst (nur data-invite="always"
// oder nach dem Eintragen auf der Startseite) den Hinweis, ein Konto anzulegen. Eingelöst wird in account-menu.js.
(() => {
  const SUPA = "https://rralgrlujoupprwlvoyo.supabase.co";
  const KEY = "sb_publishable_YxSngs1ePBoxqI6f26GRww_2_kNaLfh";
  const t = (de) => (window.XyntalI18n ? window.XyntalI18n.t(de) : de);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON = '<span class="lp-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 12v8H4v-8M2 7h20v5H2zM12 22V7M12 7H8a2.5 2.5 0 1 1 0-5c3 0 4 5 4 5zM12 7h4a2.5 2.5 0 1 0 0-5c-3 0-4 5-4 5z"/></svg></span>';

  function session() {
    try {
      const s = JSON.parse(localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token") || "null");
      if (s?.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now() + 30000)) return { jwt: s.access_token, uid: s.user?.id || "" };
    } catch { /* privat */ }
    return null;
  }
  const token = () => (session() || {}).jwt || "";
  // Admins haben Plus ohnehin: die Gutschrift bucht dort nichts (App-Server überspringt sie)
  async function isAdmin(s) {
    if (!/^[0-9a-f-]{36}$/i.test(s.uid || "")) return false;
    try {
      const res = await fetch(`${SUPA}/rest/v1/profiles?id=eq.${s.uid}&select=is_admin`, { headers: { apikey: KEY, Authorization: `Bearer ${s.jwt}` } });
      const rows = res.ok ? await res.json() : [];
      return rows[0]?.is_admin === true;
    } catch { return false; }
  }
  async function myInvites(jwt) {
    const res = await fetch(`${SUPA}/rest/v1/rpc/get_my_invites`, {
      method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: "{}",
    });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  const head = () => `<div class="invite-head">${ICON}<b>${esc(t("Lade Freunde ein"))}</b></div>`;
  const REWARD = "Für jede Person, die sich über deinen Link ein Konto anlegt und die E-Mail bestätigt, bekommt ihr beide 7 Tage Plus gratis (höchstens 4 Einladungen in 3 Monaten).";

  function teaser(box) {
    box.innerHTML = `${head()}
      <p>${esc(t("Mit einem Konto bekommst du deinen persönlichen Link xyntal.de/deinname/invite. Für jede Person, die sich darüber anmeldet, bekommt ihr beide 7 Tage Plus gratis."))}</p>
      <p class="invite-count"><a class="text-link" href="/login#registrieren">${esc(t("Konto anlegen"))}</a></p>`;
    box.hidden = false;
  }

  function link(box, d) {
    const url = `https://xyntal.de/${d.handle}/invite`;
    const n = Number(d.invited) || 0;
    const stand = n === 0
      ? t("Noch niemand eingeladen.")
      : `${n} ${t(n === 1 ? "Person eingeladen" : "Personen eingeladen")} · ${Number(d.credited) || 0} ${t("gutgeschrieben")}`;
    const date = (iso) => new Date(iso).toLocaleDateString(document.documentElement.lang === "en" ? "en-GB" : "de-DE", { day: "numeric", month: "short", year: "numeric" });
    const days = Number(d.days) || 0;
    const list = Array.isArray(d.list) ? d.list : [];
    const erhalten = d.admin
      ? `${t("Gutgeschrieben:")} ${days} ${t("Tage Plus – als Admin hast du Plus ohnehin.")}`
      : `${t("Erhalten:")} ${days} ${t("Tage Plus gratis")}`;
    const next = d.next_free ? `${t("Nächste Einladung möglich ab")} ${date(d.next_free)}` : "";
    const rows = list.map((r) => `<li><span data-no-i18n>${esc(date(r.at))}</span> · ${esc(t(r.credited ? "7 Tage Plus gutgeschrieben" : "wird gutgeschrieben"))}</li>`).join("");
    const max = Number(d.max) || 4, recent = Number(d.recent) || 0;
    const grenze = `${t("Höchstens")} ${max} ${t("Einladungen in 3 Monaten – schon genutzt:")} ${recent}`;
    box.innerHTML = `${head()}
      <p>${esc(t(REWARD))}</p>
      <div class="invite-row"><input type="text" readonly value="${esc(url)}" aria-label="${esc(t("Dein Einladungslink"))}" data-no-i18n><button type="button" class="btn btn-primary" data-invite-share>${esc(t("Link teilen"))}</button></div>
      <p class="invite-count" data-invite-status role="status" aria-live="polite">${esc(stand)}</p>
      ${days > 0 ? `<p class="invite-count"><b>${esc(erhalten)}</b></p>` : ""}
      <p class="invite-count">${esc(grenze)}${next ? ` · ${esc(next)}` : ""}</p>
      ${rows ? `<ul class="invite-list">${rows}</ul>` : ""}`;
    box.hidden = false;
    const input = box.querySelector("input"), out = box.querySelector("[data-invite-status]");
    input.addEventListener("focus", () => input.select());
    box.querySelector("[data-invite-share]").addEventListener("click", async () => {
      const text = t("Ich bin bei Xyntal – der Plattform, auf der aus Ideen Teams werden. Mit meinem Link bekommen wir beide 7 Tage Plus gratis:");
      try {
        if (navigator.share && matchMedia("(pointer: coarse)").matches) { await navigator.share({ title: "Xyntal", text, url }); return; }
      } catch (err) { if (err && err.name === "AbortError") return; }
      try { await navigator.clipboard.writeText(url); out.textContent = t("Link kopiert."); }
      catch { input.focus(); input.select(); out.textContent = t("Markiert – jetzt kopieren."); }
    });
  }

  function noHandle(box) {
    box.innerHTML = `${head()}
      <p>${esc(t("Dein Einladungslink ist dein Wunsch-Link plus /invite (xyntal.de/deinname/invite). Wähle ihn in deiner Karte – dann bekommt ihr beide für jede Anmeldung 7 Tage Plus gratis."))}</p>
      <p class="invite-count"><a class="text-link" href="/meine-karte">${esc(t("Meine Karte bearbeiten"))}</a></p>`;
    box.hidden = false;
  }

  async function render(box) {
    const ses = session();
    if (!ses) { if (box.dataset.invite === "always") teaser(box); return; }
    try {
      const d = await myInvites(ses.jwt);
      if (d && d.handle) { d.admin = Number(d.days) > 0 && await isAdmin(ses); link(box, d); } else noHandle(box);
      // Wer selbst eingeladen wurde: Stand der eigenen Gutschrift
      if (d && d.invited_by) {
        const note = d.welcome_credited
          ? "Deine Einladung wurde gutgeschrieben: 7 Tage Plus sind aktiv."
          : "Einladung angenommen: 7 Tage Plus sind für dich und die Person, die dich eingeladen hat, unterwegs. Sie erscheinen in der App, sobald du dich dort mit dieser E-Mail anmeldest.";
        box.insertAdjacentHTML("afterbegin", `<p class="invite-note">${esc(t(note))}</p>`);
      }
    } catch { /* ohne Einladungsbox geht es auch */ }
  }

  const run = () => document.querySelectorAll("[data-invite]").forEach(render);
  window.XyntalInvite = { refresh: run, teaser: () => document.querySelectorAll("[data-invite]").forEach((b) => { if (!token()) teaser(b); }) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
  document.addEventListener("xyntal:lang", run);
})();
