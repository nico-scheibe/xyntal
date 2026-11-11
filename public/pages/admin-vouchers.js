// /admin – Gutscheine: Codes für Tarif-Tage oder KI-Guthaben anlegen, begrenzen, pausieren und löschen.
// Dieselben Routen wie der Bereich „Gutscheine“ in der Xyntal-App (server/src/billing/vouchers.ts);
// die Rechte (billing.manage) prüft der App-Server.
//
// Aufbau wie admin-support.js, ohne Build-Schritt:
//   1. Modell  – reine Funktionen (Beträge, Datum, Beschriftungen, Formular → Anfrage). Ohne DOM,
//                deshalb in tests/admin-vouchers.cjs prüfbar.
//   2. Ansicht – Formular oben, darunter die Liste mit Stand, Grenzen und Aktionen.
(() => {
  // ---------- 1. Modell ----------
  const STATUS = {
    active: ["Aktiv", "ok"], paused: ["Pausiert", ""], scheduled: ["Geplant", "accent"],
    expired: ["Abgelaufen", "warn"], used_up: ["Aufgebraucht", "warn"],
  };
  const eur = (cents) => (Number(cents || 0) / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  // „5“, „5,50“, „5.5 €“ → Cent; null, wenn es kein Betrag mit höchstens zwei Nachkommastellen ist
  function parseEuro(input) {
    const text = String(input ?? "").replace(/[€\s]/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
    return Math.round(parseFloat(text) * 100);
  }
  // Ganze Zahl ≥ 1; "" bleibt leer (= keine Grenze), alles andere ist null (= ungültig)
  function parseCount(input) {
    const text = String(input ?? "").trim();
    if (text === "") return "";
    return /^\d+$/.test(text) && Number(text) >= 1 ? Number(text) : null;
  }
  const daysLabel = (n) => (n === 1 ? "1 Tag" : `${n} Tage`);
  const gives = (v) => (v.kind === "plan" ? `${v.plan} · ${daysLabel(v.days)}` : `${eur(v.creditCents)} KI-Guthaben`);
  const uses = (v) => `${v.redeemed} / ${v.maxRedemptions === null || v.maxRedemptions === undefined ? "∞" : v.maxRedemptions}`;
  const dateTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "–" : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }); };
  function validity(v) {
    if (v.validFrom && v.validUntil) return `${dateTime(v.validFrom)} – ${dateTime(v.validUntil)}`;
    if (v.validFrom) return `ab ${dateTime(v.validFrom)}`;
    if (v.validUntil) return `bis ${dateTime(v.validUntil)}`;
    return "unbegrenzt";
  }
  // Wert eines <input type="datetime-local"> (Ortszeit) ↔ ISO
  const toIso = (local) => { if (!local) return null; const d = new Date(local); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
  function toLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // Die Grenzen (gemeinsam für Anlegen und Bearbeiten): { error } oder die Felder für den Server
  function limits(f) {
    const max = parseCount(f.maxRedemptions);
    if (max === null) return { error: "Die Anzahl der Einlösungen muss eine ganze Zahl ab 1 sein – oder leer für unbegrenzt." };
    const validFrom = toIso(f.validFrom), validUntil = toIso(f.validUntil);
    if (validFrom && validUntil && validUntil <= validFrom) return { error: "„Gültig bis“ muss nach „Gültig ab“ liegen." };
    return { maxRedemptions: max === "" ? null : max, validFrom, validUntil, note: String(f.note || "").trim() };
  }
  // Formular → Anfrage für POST /admin/vouchers
  function payload(f) {
    const body = { kind: f.kind === "credit" ? "credit" : "plan" };
    if (body.kind === "plan") {
      const days = parseCount(f.days);
      if (!f.plan) return { error: "Bitte wähle einen Tarif." };
      if (!days || days > 3650) return { error: "Die Tage müssen eine ganze Zahl zwischen 1 und 3650 sein." };
      body.plan = f.plan; body.days = days;
    } else {
      const cents = parseEuro(f.amount);
      if (!cents || cents > 50000) return { error: "Das Guthaben muss zwischen 0,01 € und 500 € liegen." };
      body.creditCents = cents;
    }
    const l = limits(f);
    if (l.error) return l;
    const code = String(f.code || "").trim();
    return { body: { ...body, ...l, ...(code ? { code } : {}) } };
  }
  const matches = (v, query) => {
    const q = String(query || "").trim().toLowerCase();
    return !q || [v.code, v.note, gives(v), (STATUS[v.status] || [])[0], v.author].some((x) => String(x || "").toLowerCase().includes(q));
  };

  const model = { STATUS, eur, parseEuro, parseCount, gives, uses, validity, toIso, toLocal, limits, payload, matches };
  if (typeof window === "undefined") return;
  window.XyntalAdminVouchers = model;

  const X = window.XyntalApp, P = window.XyntalAdminPlatform;
  if (!X || !P || typeof P.register !== "function") return;
  const { esc } = X;
  const panel = document.querySelector('[data-panel="vouchers"]');
  if (!panel) return;

  // ---------- 2. Ansicht ----------
  const S = { vouchers: [], plans: [], query: "" };
  const pill = (text, tone = "") => `<span class="xa-pill ${tone ? `xa-pill-${tone}` : ""}">${esc(text)}</span>`;

  function say(text, ok = true) {
    const line = panel.querySelector("[data-xv-msg]"); if (!line) return;
    line.classList.toggle("is-error", !ok);
    line.textContent = text;
  }

  function frame() {
    panel.innerHTML = `
      <div class="panel-heading"><div><p class="admin-kicker">ABRECHNUNG</p><h2>Gutscheine</h2>
        <p class="hint">Codes, die ein Konto unter „Tarif“ einlöst: Tage in einem bezahlten Tarif oder KI-Guthaben. Jedes Konto kann einen Code einmal einlösen.</p></div></div>
      <p class="admin-message" data-xv-msg role="status"></p>
      <form class="xa-card xa-inline xv-form" data-xv-form>
        <h3>Neuer Gutschein</h3>
        <div class="xa-row">
          <label>Der Code bringt<select name="kind"><option value="plan">Tage in einem Tarif</option><option value="credit">KI-Guthaben</option></select></label>
          <label data-xv-plan>Tarif<select name="plan">${S.plans.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
          <label data-xv-plan>Tage<input name="days" inputmode="numeric" value="30" placeholder="z. B. 30"></label>
          <label data-xv-credit hidden>Guthaben in €<input name="amount" inputmode="decimal" placeholder="z. B. 5,00"></label>
        </div>
        <div class="xa-row">
          <label>Code (optional)<input name="code" maxlength="40" autocapitalize="characters" spellcheck="false" placeholder="leer = wird erzeugt, z. B. XYN-7KQ2-…"></label>
          <label>Wie oft einlösbar<input name="maxRedemptions" inputmode="numeric" placeholder="leer = unbegrenzt, z. B. 50"></label>
        </div>
        <div class="xa-row">
          <label>Gültig ab (optional)<input name="validFrom" type="datetime-local"></label>
          <label>Gültig bis (optional)<input name="validUntil" type="datetime-local"></label>
        </div>
        <label>Notiz (nur intern)<input name="note" maxlength="300" placeholder="Wofür ist der Code? z. B. Launch-Aktion November"></label>
        <div class="row-actions"><button>Gutschein anlegen</button><span class="hint">Der Code gilt sofort – außer du setzt „Gültig ab“.</span></div>
      </form>
      <div class="xv-listbar"><h3 class="xa-h3">Alle Gutscheine</h3><label class="admin-search">Suchen<input type="search" data-xv-search placeholder="Code, Notiz, Tarif oder Status"></label></div>
      <div data-xv-list><p class="xa-loading" role="status">Wird geladen …</p></div>`;

    const form = panel.querySelector("[data-xv-form]");
    const syncKind = () => {
      const credit = form.kind.value === "credit";
      form.querySelectorAll("[data-xv-plan]").forEach((el) => { el.hidden = credit; });
      form.querySelector("[data-xv-credit]").hidden = !credit;
    };
    form.kind.addEventListener("change", syncKind);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const p = payload(Object.fromEntries(new FormData(form)));
      if (p.error) { say(p.error, false); return; }
      const button = form.querySelector("button"); button.disabled = true;
      try {
        const { voucher } = await P.api("POST", "/admin/vouchers", p.body);
        say(`Gutschein ${voucher.code} angelegt.`);
        const kind = form.kind.value; form.reset(); form.kind.value = kind; syncKind();
        await load();
      } catch (err) { say(P.reason(err), false); }
      finally { button.disabled = false; }
    });
    panel.querySelector("[data-xv-search]").addEventListener("input", (e) => { S.query = e.target.value; draw(); });
    panel.querySelector("[data-xv-list]").addEventListener("click", onAction);
  }

  function draw() {
    const box = panel.querySelector("[data-xv-list]"); if (!box) return;
    const rows = S.vouchers.filter((v) => matches(v, S.query));
    if (!S.vouchers.length) { box.innerHTML = `<p class="xa-empty">Noch kein Gutschein angelegt.</p>`; return; }
    if (!rows.length) { box.innerHTML = `<p class="xa-empty">Kein Gutschein passt zur Suche.</p>`; return; }
    box.innerHTML = `<div class="table-wrap"><table class="xv-table"><thead><tr><th>Code</th><th>Bringt</th><th>Eingelöst</th><th>Gültig</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((v) => {
      const [label, tone] = STATUS[v.status] || [v.status, ""];
      const id = esc(v.id);
      return `<tr>
        <td><code class="xv-code">${esc(v.code)}</code>${v.note ? `<small class="xv-note">${esc(v.note)}</small>` : ""}</td>
        <td>${esc(gives(v))}</td>
        <td><button class="xv-link" data-act="uses" data-id="${id}" title="Wer hat eingelöst?">${esc(uses(v))}</button></td>
        <td>${esc(validity(v))}</td>
        <td>${pill(label, tone)}</td>
        <td><div class="row-actions">
          <button data-act="copy" data-id="${id}">Kopieren</button>
          <button data-act="edit" data-id="${id}">Grenzen ändern</button>
          <button data-act="toggle" data-id="${id}">${v.active ? "Pausieren" : "Aktivieren"}</button>
          <button class="admin-danger" data-act="delete" data-id="${id}">Löschen</button>
        </div></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  async function onAction(e) {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const v = S.vouchers.find((x) => x.id === b.dataset.id); if (!v) return;
    const path = `/admin/vouchers/${encodeURIComponent(v.id)}`;
    try {
      if (b.dataset.act === "copy") {
        try { await navigator.clipboard.writeText(v.code); say(`${v.code} kopiert.`); }
        catch { say(`Kopieren ging nicht – der Code lautet ${v.code}.`, false); }
        return;
      }
      if (b.dataset.act === "uses") { await showUses(v); return; }
      if (b.dataset.act === "toggle") {
        await P.api("PATCH", path, { active: !v.active });
        say(v.active ? `${v.code} ist pausiert und kann nicht eingelöst werden.` : `${v.code} ist wieder aktiv.`);
      } else if (b.dataset.act === "edit") {
        const a = await P.ask({
          title: `Grenzen von ${v.code}`,
          text: `Bringt: ${gives(v)} – das lässt sich nicht mehr ändern. Bisher ${v.redeemed}-mal eingelöst.`,
          confirm: "Speichern",
          fields: [
            { name: "maxRedemptions", label: "Wie oft einlösbar (leer = unbegrenzt)", value: v.maxRedemptions === null ? "" : String(v.maxRedemptions) },
            { name: "validFrom", label: "Gültig ab (leer = sofort)", type: "datetime-local", value: toLocal(v.validFrom) },
            { name: "validUntil", label: "Gültig bis (leer = ohne Ende)", type: "datetime-local", value: toLocal(v.validUntil) },
            { name: "note", label: "Notiz (nur intern)", max: 300, value: v.note || "" },
          ],
        });
        if (!a) return;
        const l = limits(a);
        if (l.error) { say(l.error, false); return; }
        await P.api("PATCH", path, l);
        say(`${v.code} gespeichert.`);
      } else if (b.dataset.act === "delete") {
        const ok = await P.ask({
          title: "Gutschein löschen",
          text: `${v.code} endgültig löschen? Der Code lässt sich danach nicht mehr einlösen. Was ${v.redeemed === 1 ? "das eine Konto" : `die ${v.redeemed} Konten`} schon bekommen ${v.redeemed === 1 ? "hat" : "haben"}, bleibt.`,
          danger: true, confirm: "Löschen",
        });
        if (!ok) return;
        await P.api("DELETE", path);
        say(`${v.code} gelöscht.`);
      }
      await load();
    } catch (err) { say(P.reason(err), false); }
  }

  async function showUses(v) {
    const { redemptions } = await P.api("GET", `/admin/vouchers/${encodeURIComponent(v.id)}/redemptions`);
    const dlg = document.createElement("dialog");
    dlg.className = "xa-dialog xa-dialog-wide";
    dlg.innerHTML = `<div class="xa-dialog-body"><div class="xa-dialog-head"><h2>Einlösungen von ${esc(v.code)}</h2><button type="button" class="xa-close" aria-label="Schließen">×</button></div>
      <p>${esc(gives(v))} · ${esc(uses(v))} eingelöst</p>
      <div class="xa-dialog-content">${redemptions.length ? `<div class="table-wrap"><table><thead><tr><th>Konto</th><th>E-Mail</th><th>Eingelöst am</th></tr></thead><tbody>${redemptions.map((r) =>
        `<tr><td>${r.userId ? `${esc(r.displayName || "–")}${r.handle ? ` <small>@${esc(r.handle)}</small>` : ""}` : "<i>gelöschtes Konto</i>"}</td><td>${esc(r.email || "–")}</td><td>${esc(dateTime(r.redeemedAt))}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="xa-empty">Noch niemand hat diesen Code eingelöst.</p>`}</div></div>`;
    document.body.append(dlg);
    dlg.querySelector(".xa-close").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => dlg.remove());
    dlg.showModal();
  }

  async function load() {
    try {
      const r = await P.api("GET", "/admin/vouchers");
      const hadPlans = S.plans.length > 0;
      S.vouchers = r.vouchers || []; S.plans = r.plans || [];
      if (!hadPlans || !panel.querySelector("[data-xv-form]")) frame();
      const live = S.vouchers.filter((v) => v.status === "active").length;
      const c = document.getElementById("c-vouchers"); if (c) c.textContent = live ? `(${live} aktiv)` : "";
      draw();
    } catch (err) {
      panel.innerHTML = `<div class="admin-empty"><span aria-hidden="true">%</span><h3>Gutscheine konnten nicht geladen werden</h3><p>${esc(P.reason(err))}</p><button data-xv-retry>Erneut laden</button></div>`;
      panel.querySelector("[data-xv-retry]").addEventListener("click", load);
    }
  }

  P.register("vouchers", load);
})();
