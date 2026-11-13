// /admin – Partner: Partner-Links (xyntal.de/?partner=<code>) mit Klicks, neuen Konten,
// Gratis-Monaten und Zahlenden. Routen: server/src/partners/routes.ts im App-Server
// (lesen: users.view, anlegen/pausieren: billing.manage – prüft der Server).
(() => {
  const X = window.XyntalApp, P = window.XyntalAdminPlatform;
  if (!X || !P || typeof P.register !== "function") return;
  const { esc } = X;
  const panel = document.querySelector('[data-panel="partners"]');
  if (!panel) return;

  const linkOf = (code) => `https://xyntal.de/?partner=${code}`;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "–");

  function say(text, ok = true) {
    const line = panel.querySelector("[data-xp-msg]"); if (!line) return;
    line.classList.toggle("is-error", !ok);
    line.textContent = text;
  }

  function draw(r) {
    const rows = r.partners || [];
    panel.innerHTML = `
      <div class="panel-heading"><div><p class="admin-kicker">WACHSTUM</p><h2>Partner</h2>
        <p class="hint">Wer über einen Partner-Link kommt und innerhalb von ${r.claimWindowDays} Tagen ein Konto anlegt, zählt für den Partner und bekommt das Angebot einmal. Klicks zählen einmal pro Browser, ohne Daten über die Person. In Klammern: letzte 30 Tage.</p></div></div>
      <p class="admin-message" data-xp-msg role="status"></p>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Partner</th><th>Link</th><th>Angebot</th><th>Klicks</th><th>Neue Konten</th><th>Gratis-Monat erhalten</th><th>Gerade gratis</th><th>Zahlen jetzt</th><th>Klick → Konto</th><th></th></tr></thead><tbody>${rows.map((p) => `
        <tr><td><b>${esc(p.name)}</b>${p.active ? "" : ` <span class="xa-pill">Pausiert</span>`}</td>
          <td><button type="button" class="text-link" data-copy="${esc(p.code)}" title="Link kopieren">${esc(linkOf(p.code).replace("https://", ""))}</button></td>
          <td>${p.rewardDays} Tage ${esc(p.rewardPlan)}</td>
          <td>${p.clicks} <small>(${p.clicks30d})</small></td>
          <td><b>${p.signups}</b> <small>(${p.signups30d})</small></td>
          <td>${p.rewarded}</td><td>${p.inFreeMonth}</td><td>${p.paying}</td><td>${pct(p.signups, p.clicks)}</td>
          <td>${P.can("billing.manage") ? `<button type="button" data-toggle="${esc(p.code)}">${p.active ? "Pausieren" : "Aktivieren"}</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : `<p class="xa-empty">Noch keine Partner.</p>`}
      ${P.can("billing.manage") ? `<form class="xa-card xa-inline" data-xp-form>
        <h3>Partner anlegen</h3>
        <div class="xa-row">
          <label>Name<input name="name" maxlength="80" required placeholder="z. B. Closing Hub"></label>
          <label>Code im Link<input name="code" maxlength="32" required pattern="[a-z0-9]{3,32}" spellcheck="false" placeholder="z. B. closinghub"></label>
          <label>Tage Plus<input name="days" inputmode="numeric" value="30"></label>
        </div>
        <div class="row-actions"><button>Partner anlegen</button><span class="hint">Der Link gilt sofort.</span></div>
      </form>` : ""}`;

    panel.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(linkOf(b.dataset.copy)); say(`Link kopiert: ${linkOf(b.dataset.copy)}`); } catch { say(linkOf(b.dataset.copy)); }
    }));
    panel.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", async () => {
      const p = rows.find((x) => x.code === b.dataset.toggle);
      try {
        await P.api("POST", "/admin/partners", { code: p.code, name: p.name, days: p.rewardDays, active: !p.active });
        await load(); say(p.active ? `${p.name} ist pausiert – der Link wirkt nicht mehr.` : `${p.name} ist wieder aktiv.`);
      } catch (err) { say(P.reason(err), false); }
    }));
    const form = panel.querySelector("[data-xp-form]");
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = form.code.value.trim().toLowerCase();
      try {
        await P.api("POST", "/admin/partners", { code, name: form.name.value.trim(), days: Number(form.days.value) });
        await load(); say(`Angelegt. Link: ${linkOf(code)}`);
      } catch (err) { say(P.reason(err), false); }
    });
  }

  async function load() {
    try { draw(await P.api("GET", "/admin/partners")); }
    catch (err) {
      panel.innerHTML = `<div class="admin-empty"><span aria-hidden="true">%</span><h3>Partner konnten nicht geladen werden</h3><p>${esc(P.reason(err))}</p><button data-xp-retry>Erneut laden</button></div>`;
      panel.querySelector("[data-xp-retry]").addEventListener("click", load);
    }
  }

  P.register("partners", load);
})();
