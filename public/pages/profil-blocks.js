// Profil · Gesperrte Mitglieder: die eigenen Sperren (GET /users/blocks des App-Servers) mit
// Entsperren (DELETE /users/:id/block). Wie der Abschnitt im Profil der iPhone-App.
(() => {
  const X = window.XyntalApp;
  const box = document.getElementById("pb-blocks");
  const status = document.getElementById("pb-blocks-status");
  if (!X || !box || !status) return;
  const { esc, t } = X;
  const busy = new Set();
  const fail = (err) => (err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal.");

  // Die Liste nutzt die Klassen pb-invoices und pb-invoice aus der Rechnungsliste: dort gibt es
  // schon Abstände, Trennlinien und Zeilen-Layout. Die Namen sind für Rechnungen gemeint, hier
  // dienen sie nur als Layout – bewusst ohne neues CSS.
  function render(list) {
    if (!list.length) { box.innerHTML = `<p class="hint">${esc(t("Du hast niemanden gesperrt."))}</p>`; return; }
    box.innerHTML = `<ul class="pb-invoices">${list.map((m) => `
      <li class="pb-invoice">
        <div class="pb-invoice-main"><b data-no-i18n>${esc(m.displayName || t("Mitglied"))}</b></div>
        <div class="pb-invoice-side"><button type="button" class="btn btn-small btn-ghost" data-unblock="${esc(m.id)}"${busy.has(m.id) ? " disabled" : ""}>${esc(t("Entsperren"))}</button></div>
      </li>`).join("")}</ul>`;
  }
  // Hintergrundaufruf (silent): öffnet beim Laden der Profilseite keine 2FA-Abfrage
  async function load() {
    try {
      const { blocks } = await X.api("GET", "/users/blocks", undefined, { silent: true });
      render(blocks || []);
    } catch (err) {
      box.innerHTML = `<p class="hint">${esc(fail(err))}</p><div class="btn-row sec-row"><button class="btn btn-small btn-ghost" type="button" data-blocks-retry>${esc(t("Noch einmal versuchen"))}</button></div>`;
    }
  }
  box.addEventListener("click", async (e) => {
    if (e.target.closest("[data-blocks-retry]")) { box.innerHTML = `<p class="hint">${esc(t("Wird geladen …"))}</p>`; load(); return; }
    const b = e.target.closest("[data-unblock]");
    if (!b || busy.has(b.dataset.unblock)) return;
    const id = b.dataset.unblock;
    busy.add(id); b.disabled = true; status.textContent = "";
    try {
      await X.api("DELETE", `/users/${encodeURIComponent(id)}/block`);
      busy.delete(id);
      await load();
    } catch (err) {
      busy.delete(id); b.disabled = false;
      status.textContent = fail(err);
    }
  });
  load();
})();
