// Profil → Tarif & Rechnungen: der Tarif des App-Kontos und seine Rechnungen
// (GET /billing und GET /billing/invoices des App-Servers). Rechnungen gibt es nur
// für das eigene Konto: Der Server fragt bei Stripe ausschließlich den Kunden ab,
// der zu diesem Konto gehört. Kaufen und Aufladen bleiben auf /tarif.
(() => {
  const X = window.XyntalApp;
  if (!X) return;
  const { esc, t } = X;
  const planBox = document.getElementById("pb-plan");
  const listBox = document.getElementById("pb-invoices");
  if (!planBox || !listBox) return;
  let loaded = false, busy = false;
  // Zurück aus dem Abo-Portal (…/profil?checkout=portal): wieder auf dieser Registerkarte landen.
  if (new URLSearchParams(location.search).get("checkout") === "portal" && !location.hash) {
    history.replaceState(null, "", location.pathname + "#rechnungen");
  }

  const locale = () => ((window.XyntalI18n ? window.XyntalI18n.get() : "de") === "en" ? "en-GB" : "de-DE");
  const money = (cents, currency) =>
    (Number(cents || 0) / 100).toLocaleString(locale(), { style: "currency", currency: (currency || "eur").toUpperCase() });
  const day = (iso) => {
    const d = new Date(iso || "");
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
  };
  const planName = (id) => (id === "Start" ? "Free" : id);
  const STATUS = { paid: "Bezahlt", open: "Offen", void: "Storniert", uncollectible: "Uneinbringlich" };
  const fail = (err) => (err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal.");
  const signedOut = (err) => err && (err.status === 401 || err.code === "SIGNED_OUT");

  function renderPlan(d) {
    const free = d.plan === "Free" || d.plan === "Start";
    const text = d.locked
      ? t("Die letzte Zahlung ist nicht durchgegangen. Begleiche die Rechnung im Abo-Portal, dann ist Xyntal wieder frei.")
      : free
        ? t("Du nutzt Free. Tarife und KI-Guthaben findest du unter Tarif & KI-Guthaben.")
        : d.renewsAt
          ? t("Aktiv bis {date} – dann verlängert er sich, oder er endet, wenn er für eine feste Zeit gutgeschrieben wurde.").replace("{date}", day(d.renewsAt))
          : t("Aktiv ohne Enddatum.");
    planBox.innerHTML = `
      <p class="pb-plan-line"><span class="xm-pill xm-on" data-no-i18n>${esc(planName(d.plan))}</span>${d.locked ? ` <span class="xm-pill xm-warn">${esc(t("Zahlung überfällig"))}</span>` : ""}</p>
      <p class="hint ${d.locked ? "xm-bad" : ""}">${esc(text)}</p>
      <div class="btn-row sec-row">
        <a class="btn btn-small" href="/tarif">${esc(t(free ? "Tarif upgraden" : "Tarif & KI-Guthaben"))}</a>
        ${free ? "" : `<button class="btn btn-small btn-ghost" type="button" data-pb-portal>${esc(t("Abo verwalten"))}</button>`}
      </div>`;
  }

  function renderInvoices(list) {
    if (!list.length) {
      listBox.innerHTML = `<p class="hint">${esc(t("Noch keine Rechnungen. Sobald du einen Tarif buchst oder KI-Guthaben kaufst, erscheint die Rechnung hier."))}</p>`;
      return;
    }
    listBox.innerHTML = `<ul class="pb-invoices">${list.map((i) => `
      <li class="pb-invoice">
        <div class="pb-invoice-main">
          <b>${esc(i.description || t("Rechnung"))}</b>
          <small>${esc(day(i.createdAt))}${i.number ? ` · <span data-no-i18n>${esc(i.number)}</span>` : ""}</small>
        </div>
        <div class="pb-invoice-side">
          <span class="pb-amount">${esc(money(i.totalCents, i.currency))}</span>
          <span class="xm-pill ${i.status === "paid" ? "pb-paid" : i.status === "open" || i.status === "uncollectible" ? "pb-open" : ""}">${esc(t(STATUS[i.status] || i.status))}</span>
          ${i.pdf ? `<a class="btn btn-small btn-ghost" href="${esc(i.pdf)}" target="_blank" rel="noopener">PDF</a>` : ""}
          ${i.url ? `<a class="btn btn-small btn-ghost" href="${esc(i.url)}" target="_blank" rel="noopener">${esc(t("Ansehen"))}</a>` : ""}
        </div>
        ${i.status === "open" || i.status === "uncollectible" ? `<p class="pb-invoice-warn">${esc(t(i.status === "open"
          ? "Die Zahlung hat nicht funktioniert – die Buchung ist noch offen. Bezahle die Rechnung über „Ansehen“ oder ändere deine Zahlungsmethode unter „Abo verwalten“."
          : "Die Zahlung ist endgültig fehlgeschlagen – die Buchung ist nicht zustande gekommen. Schreib uns, wenn du Hilfe brauchst."))}</p>` : ""}
      </li>`).join("")}</ul>`;
  }

  async function load() {
    try {
      const [bill, inv] = await Promise.all([X.api("GET", "/billing"), X.api("GET", "/billing/invoices")]);
      renderPlan(bill);
      renderInvoices((inv && inv.invoices) || []);
      loaded = true;
    } catch (err) {
      const msg = signedOut(err) ? t("Logg dich ein, um deinen Tarif und deine Rechnungen zu sehen.") : fail(err);
      planBox.innerHTML = `<p class="hint">${esc(msg)}</p>`;
      listBox.innerHTML = signedOut(err) ? "" : `<div class="btn-row sec-row"><button class="btn btn-small btn-ghost" type="button" data-pb-retry>${esc(t("Noch einmal versuchen"))}</button></div>`;
    }
  }

  planBox.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-pb-portal]");
    if (!b || busy) return;
    busy = true;
    b.disabled = true;
    b.textContent = t("Weiter zu Stripe …");
    try {
      const r = await X.api("POST", "/billing/portal", { returnTo: location.origin + "/profil#rechnungen" });
      if (r && r.url) { location.href = r.url; return; }
    } catch (err) {
      planBox.insertAdjacentHTML("beforeend", `<p class="form-status xm-bad">${esc(fail(err))}</p>`);
    }
    busy = false;
    b.disabled = false;
    b.textContent = t("Abo verwalten");
  });
  listBox.addEventListener("click", (e) => { if (e.target.closest("[data-pb-retry]")) load(); });

  // Geladen wird erst, wenn die Registerkarte aufgeht (profil.js ruft das auf).
  window.openBillingTab = () => { if (!loaded) load(); };
  // Zurück auf der offenen Registerkarte (etwa nach einem Kauf in einem anderen Tab):
  // Tarif und Rechnungen neu holen.
  const panel = document.getElementById("panel-rechnungen");
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && loaded && !busy && panel && !panel.hidden) load();
  });
})();
