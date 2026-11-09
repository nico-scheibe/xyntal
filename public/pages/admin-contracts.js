// Admin → Firmenverträge: individuelle Verträge mit Firmenkunden anlegen, in der Datenbank
// (db.xyntal.de, Tabelle business_contracts, nur Admins) speichern und als PDF drucken.
// Das PDF entsteht über den Druckdialog des Browsers („Als PDF sichern“): Text bleibt
// durchsuchbar und scharf, es braucht keine zusätzliche Bibliothek.
(() => {
  const panel = document.querySelector('[data-panel="contracts"]');
  if (!panel) return;

  // Anbieter laut Impressum
  const PROVIDER = {
    name: "Nico Scheibe",
    brand: "Xyntal",
    street: "Reinhausen 5",
    city: "93059 Regensburg",
    country: "Deutschland",
    email: "admin@xyntal.com",
    web: "xyntal.de",
  };
  const STATUS = { entwurf: "Entwurf", verschickt: "Verschickt", unterschrieben: "Unterschrieben", gekuendigt: "Gekündigt" };
  const PLANS = ["Business", "Enterprise", "Individuell"];
  const INTERVALS = { monat: "monatlich", jahr: "jährlich", einmalig: "einmalig" };
  const PAYMENT = { rechnung: "per Rechnung (Überweisung)", sepa: "per SEPA-Lastschrift", karte: "per Karte über Stripe" };
  const VAT_RATE = 19;

  const eur = (n) => (Number(n) || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  const num = (v, d = 0) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : d; };
  const dateDe = (iso) => { if (!iso) return ""; const [y, m, d] = String(iso).split("-"); return d && m && y ? `${d}.${m}.${y}` : String(iso); };
  const today = () => new Date().toLocaleDateString("sv-SE"); // JJJJ-MM-TT
  const months = (n) => `${n} ${n === 1 ? "Monat" : "Monate"}`;          // „verlängert sich um 12 Monate“
  const monthsDat = (n) => (n === 1 ? "einem Monat" : `${n} Monaten`);   // „Frist von 3 Monaten“
  const para = (text) => esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  function blank() {
    return {
      id: null, number: null, status: "entwurf",
      data: {
        customer: { company: "", street: "", city: "", country: "Deutschland", vat_id: "", register: "", contact: "", email: "" },
        plan: "Business",
        items: [{ label: "Xyntal Business – Nutzung für das ganze Team", qty: 1, price: 299, interval: "monat" }],
        discount: 0,
        start: today(),
        term_months: 12,
        renew_months: 12,
        notice_months: 3,
        payment_days: 14,
        payment_method: "rechnung",
        small_business: true,
        support: "Support per E-Mail an Werktagen (Mo–Fr), Antwort in der Regel innerhalb von 24 Stunden.",
        availability: "",
        avv: true,
        special: "",
        notes: "",
        place: "Regensburg",
        sign_date: today(),
      },
    };
  }

  // ---------- Berechnung ----------
  function totals(d) {
    const sums = { monat: 0, jahr: 0, einmalig: 0 };
    (d.items || []).forEach((it) => { sums[it.interval in sums ? it.interval : "monat"] += num(it.qty, 1) * num(it.price); });
    const factor = 1 - Math.min(Math.max(num(d.discount), 0), 100) / 100;
    Object.keys(sums).forEach((k) => { sums[k] = Math.round(sums[k] * factor * 100) / 100; });
    const yearly = sums.monat * 12 + sums.jahr;
    return { ...sums, yearly };
  }

  // ---------- Vertragsdokument ----------
  function contractHtml(c) {
    const d = c.data, k = d.customer || {}, t = totals(d);
    const items = (d.items || []).filter((it) => it.label || num(it.price));
    const discount = num(d.discount);
    const vat = !d.small_business;
    let n = 0;
    const sec = (title, body) => `<section><h3>§ ${++n} ${esc(title)}</h3>${body}</section>`;
    const sumRow = (label, value) => value ? `<tr><td colspan="3">${label}</td><td class="num">${eur(value)}${vat ? ` <small>zzgl. ${VAT_RATE} % USt.</small>` : ""}</td></tr>` : "";
    const customerLines = [k.company, k.street, k.city, k.country && k.country !== "Deutschland" ? k.country : "",
      k.register, k.vat_id ? `USt-IdNr.: ${k.vat_id}` : ""].filter(Boolean).map(esc).join("<br>");

    return `<article class="contract-doc" lang="de">
      <header class="cd-head">
        <div class="cd-brand"><b>${esc(PROVIDER.brand)}</b><small>${esc(PROVIDER.name)} · ${esc(PROVIDER.street)} · ${esc(PROVIDER.city)}</small></div>
        <div class="cd-meta"><span>Vertragsnr.</span><b>${esc(c.number || "wird beim Speichern vergeben")}</b><span>Stand</span><b>${esc(dateDe(d.sign_date) || dateDe(today()))}</b></div>
      </header>

      <h1>Nutzungsvertrag Xyntal ${esc(d.plan || "")}</h1>
      <p class="cd-sub">für Unternehmen</p>

      <div class="cd-parties">
        <div><span>Anbieter</span><p>${esc(PROVIDER.name)}<br>handelnd unter „${esc(PROVIDER.brand)}“<br>${esc(PROVIDER.street)}<br>${esc(PROVIDER.city)}<br>${esc(PROVIDER.email)}</p><small>– nachfolgend „Anbieter“ –</small></div>
        <div><span>Kunde</span><p>${customerLines || "<i>Firma noch nicht eingetragen</i>"}${k.contact ? `<br>vertreten durch ${esc(k.contact)}` : ""}${k.email ? `<br>${esc(k.email)}` : ""}</p><small>– nachfolgend „Kunde“ –</small></div>
      </div>

      ${sec("Vertragsgegenstand", `<p>Der Anbieter stellt dem Kunden die Plattform Xyntal (Website ${esc(PROVIDER.web)} und Xyntal-App für macOS und Windows) im Tarif <b>${esc(d.plan || "Business")}</b> zur Nutzung durch die Mitarbeitenden des Kunden bereit. Der Leistungsumfang ergibt sich aus diesem Vertrag und der zum Vertragsschluss gültigen Leistungsbeschreibung des Tarifs auf ${esc(PROVIDER.web)}/preise.</p><p>Der Kunde schließt diesen Vertrag als Unternehmer im Sinne von § 14 BGB.</p>`)}

      ${sec("Vergütung", `
        <table class="cd-table">
          <thead><tr><th>Leistung</th><th class="num">Menge</th><th class="num">Einzelpreis</th><th class="num">Betrag</th></tr></thead>
          <tbody>${items.length ? items.map((it) => `<tr><td>${esc(it.label)}<br><small>${INTERVALS[it.interval] || "monatlich"}</small></td><td class="num">${esc(num(it.qty, 1).toLocaleString("de-DE"))}</td><td class="num">${eur(num(it.price))}</td><td class="num">${eur(num(it.qty, 1) * num(it.price))}</td></tr>`).join("") : `<tr><td colspan="4"><i>Noch keine Positionen</i></td></tr>`}</tbody>
          <tfoot>
            ${discount ? `<tr><td colspan="3">Vereinbarter Rabatt</td><td class="num">− ${esc(discount.toLocaleString("de-DE"))} %</td></tr>` : ""}
            ${sumRow("Summe monatlich", t.monat)}${sumRow("Summe jährlich", t.jahr)}${sumRow("Einmalig", t.einmalig)}
          </tfoot>
        </table>
        <p>${vat ? `Alle Preise verstehen sich netto zuzüglich der gesetzlichen Umsatzsteuer (derzeit ${VAT_RATE} %).` : "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmer)."}${discount ? " Der Rabatt ist in den Summen bereits berücksichtigt." : ""}</p>
        <p>Laufende Entgelte werden ${t.jahr && !t.monat ? "jährlich" : "monatlich"} im Voraus in Rechnung gestellt, einmalige Entgelte mit Beginn der Leistung. Rechnungen sind innerhalb von ${esc(num(d.payment_days, 14))} Tagen nach Zugang ohne Abzug zu zahlen, ${esc(PAYMENT[d.payment_method] || PAYMENT.rechnung)}.</p>`)}

      ${sec("Laufzeit und Kündigung", `<p>Der Vertrag beginnt am <b>${esc(dateDe(d.start) || "—")}</b> und hat eine Mindestlaufzeit von <b>${esc(monthsDat(num(d.term_months, 12)))}</b>. ${num(d.renew_months) ? `Er verlängert sich danach jeweils um ${esc(months(num(d.renew_months)))}, wenn er nicht mit einer Frist von ${esc(monthsDat(num(d.notice_months, 3)))} zum Ende der jeweiligen Laufzeit gekündigt wird.` : `Er endet mit Ablauf der Mindestlaufzeit, ohne dass es einer Kündigung bedarf.`}</p><p>Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Kündigungen bedürfen der Textform (z. B. E-Mail an ${esc(PROVIDER.email)}).</p>`)}

      ${sec("Support und Verfügbarkeit", `${para(d.support || "Support per E-Mail an Werktagen.")}${d.availability ? `<p>Der Anbieter sichert eine Verfügbarkeit der Plattform von ${esc(d.availability)} % im Jahresmittel zu; ausgenommen sind angekündigte Wartungsfenster und Störungen, die der Anbieter nicht zu vertreten hat.</p>` : `<p>Der Anbieter bemüht sich um eine möglichst unterbrechungsfreie Verfügbarkeit; geplante Wartungen werden nach Möglichkeit vorher angekündigt.</p>`}`)}

      ${sec("Datenschutz", `<p>Soweit der Anbieter im Rahmen dieses Vertrags personenbezogene Daten im Auftrag des Kunden verarbeitet, ${d.avv ? "schließen die Parteien eine Vereinbarung zur Auftragsverarbeitung nach Art. 28 DSGVO, die Bestandteil dieses Vertrags ist" : "gelten die gesetzlichen Vorgaben der DSGVO"}. Die Daten werden auf Servern in Deutschland (Hetzner Online GmbH, Nürnberg und Falkenstein) verarbeitet.</p>`)}

      ${sec("Haftung", `<p>Der Anbieter haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit, bei Verletzung von Leben, Körper oder Gesundheit sowie nach dem Produkthaftungsgesetz.</p><p>Bei leichter Fahrlässigkeit haftet der Anbieter nur bei Verletzung einer wesentlichen Vertragspflicht, deren Erfüllung die ordnungsgemäße Durchführung des Vertrags überhaupt erst ermöglicht und auf deren Einhaltung der Kunde regelmäßig vertrauen darf. In diesem Fall ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt, höchstens jedoch auf die Summe der im jeweiligen Vertragsjahr vereinbarten Entgelte${t.yearly ? ` (derzeit ${eur(t.yearly)})` : ""}. Für den Verlust von Daten haftet der Anbieter nur, soweit der Schaden auch bei angemessener Datensicherung durch den Kunden entstanden wäre.</p>`)}

      ${d.special && d.special.trim() ? sec("Sondervereinbarungen", para(d.special.trim())) : ""}

      ${sec("Schlussbestimmungen", `<p>Ergänzend gelten die Allgemeinen Geschäftsbedingungen des Anbieters (${esc(PROVIDER.web)}/agb); bei Widersprüchen gehen die Regelungen dieses Vertrags vor. Abweichende Geschäftsbedingungen des Kunden gelten nicht. Änderungen und Ergänzungen dieses Vertrags bedürfen der Textform.</p><p>Es gilt das Recht der Bundesrepublik Deutschland. Sollte eine Bestimmung dieses Vertrags unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>`)}

      <div class="cd-sign">
        <div><p>${esc(d.place || "Regensburg")}, ${esc(dateDe(d.sign_date) || "")}</p><i></i><span>${esc(PROVIDER.name)} (Anbieter)</span></div>
        <div><p>Ort, Datum</p><i></i><span>${esc(k.contact || "Name")}${k.company ? `, ${esc(k.company)}` : ""} (Kunde)</span></div>
      </div>
    </article>`;
  }

  // ---------- Zustand ----------
  let contracts = null;
  let current = null;   // geöffneter Vertrag
  let dirty = false;
  let loadedOnce = false;

  function msg(text, isError) {
    const el = panel.querySelector("[data-ct-msg]");
    if (el) { el.textContent = text || ""; el.classList.toggle("is-error", !!isError); }
  }

  async function loadList() {
    panel.innerHTML = `<p class="empty">Verträge werden geladen …</p>`;
    try {
      contracts = await sb.from("business_contracts").select("*").order("updated_at", { ascending: false }).then(unwrap);
      renderList();
    } catch (err) {
      const missing = /business_contracts|schema cache|does not exist/i.test(err.message);
      panel.innerHTML = `<div class="admin-empty"><span>§</span><h3>${missing ? "Tabelle fehlt noch" : "Verträge konnten nicht geladen werden"}</h3><p>${missing ? "Bitte zuerst <code>supabase/migrations/20261109150000_business_contracts.sql</code> im SQL Editor von db.xyntal.de ausführen." : esc(err.message)}</p><button data-ct="reload">Erneut laden</button></div>`;
    }
  }

  function renderList() {
    const list = contracts || [];
    const active = list.filter((c) => c.status === "unterschrieben");
    const mrr = active.reduce((s, c) => s + totals(c.data || {}).monat + totals(c.data || {}).jahr / 12, 0);
    panel.innerHTML = `
      <div class="panel-heading"><div><p class="admin-kicker">FIRMENKUNDEN</p><h2>Firmenverträge</h2><p class="hint">Verträge mit individuellen Konditionen anlegen, speichern und als PDF ausgeben. Nur für Website-Admins sichtbar.</p></div><button data-ct="new">+ Neuer Vertrag</button></div>
      <div class="admin-summary">
        <article><b>${list.length}</b><small>Verträge gesamt</small></article>
        <article><b>${active.length}</b><small>unterschrieben</small></article>
        <article><b>${eur(mrr)}</b><small>laufend pro Monat (unterschrieben)</small></article>
      </div>
      ${list.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Nummer</th><th>Firma</th><th>Tarif</th><th>Pro Monat</th><th>Status</th><th>Geändert</th><th>Aktionen</th></tr></thead>
        <tbody>${list.map((c) => { const t = totals(c.data || {}); return `<tr>
          <td><b>${esc(c.number || "–")}</b></td>
          <td>${esc(c.company)}<br><small>${esc(c.data?.customer?.contact || "")}</small></td>
          <td>${esc(c.data?.plan || "")}</td>
          <td>${eur(t.monat + t.jahr / 12)}</td>
          <td><span class="ct-status ct-status-${esc(c.status)}">${esc(STATUS[c.status] || c.status)}</span></td>
          <td><small>${new Date(c.updated_at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</small></td>
          <td><div class="row-actions"><button data-ct="open" data-id="${c.id}">Öffnen</button><button data-ct="pdf" data-id="${c.id}">PDF</button><button data-ct="copy" data-id="${c.id}">Duplizieren</button></div></td>
        </tr>`; }).join("")}</tbody></table></div>`
      : `<div class="admin-empty"><span>§</span><h3>Noch keine Firmenverträge</h3><p>Leg den ersten Vertrag an: Firma, Konditionen und Laufzeit eintragen, speichern, als PDF verschicken.</p><button data-ct="new">Ersten Vertrag anlegen</button></div>`}
      <p class="admin-message" data-ct-msg></p>`;
  }

  // ---------- Editor ----------
  const field = (label, path, opts = {}) => {
    const v = get(current, path);
    const attrs = `data-f="${path}"${opts.type === "number" ? ` inputmode="decimal"` : ""}${opts.min != null ? ` min="${opts.min}"` : ""}${opts.step ? ` step="${opts.step}"` : ""}${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ""}`;
    let input;
    if (opts.options) input = `<select ${attrs}>${Object.entries(opts.options).map(([k, l]) => `<option value="${esc(k)}"${String(v) === k ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    else if (opts.area) input = `<textarea ${attrs} rows="${opts.rows || 3}">${esc(v ?? "")}</textarea>`;
    else if (opts.type === "checkbox") return `<label class="ct-check"><input type="checkbox" ${attrs}${v ? " checked" : ""}> ${esc(label)}</label>`;
    else input = `<input type="${opts.type || "text"}" ${attrs} value="${esc(v ?? "")}">`;
    return `<label class="${opts.wide ? "ct-wide" : ""}">${esc(label)}${input}${opts.help ? `<small>${esc(opts.help)}</small>` : ""}</label>`;
  };
  function get(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
  function set(obj, path, value) { const keys = path.split("."); const last = keys.pop(); keys.reduce((o, k) => (o[k] ??= {}), obj)[last] = value; }

  function itemsHtml() {
    return (current.data.items || []).map((it, i) => `<div class="ct-item">
      <label class="ct-item-label">Position ${i + 1}<input data-item="${i}" data-key="label" value="${esc(it.label)}" placeholder="Leistung, z. B. Zusätzliche Plätze"></label>
      <label>Menge<input data-item="${i}" data-key="qty" type="number" min="0" step="1" value="${esc(it.qty)}"></label>
      <label>Einzelpreis (€)<input data-item="${i}" data-key="price" type="number" min="0" step="0.01" value="${esc(it.price)}"></label>
      <label>Abrechnung<select data-item="${i}" data-key="interval">${Object.entries(INTERVALS).map(([k, l]) => `<option value="${k}"${it.interval === k ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      <button type="button" data-ct="item-del" data-i="${i}" aria-label="Position ${i + 1} entfernen">✕</button>
    </div>`).join("");
  }

  function openEditor(contract) {
    current = JSON.parse(JSON.stringify(contract));
    const base = blank().data;
    current.data = { ...base, ...current.data, customer: { ...base.customer, ...(current.data?.customer || {}) } };
    dirty = false;
    panel.innerHTML = `
      <div class="panel-heading"><div><button data-ct="back">← Alle Verträge</button><h2>${current.number ? esc(current.number) : "Neuer Vertrag"}</h2></div>
        <div class="row-actions"><label>Status<select data-f="status">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}"${current.status === k ? " selected" : ""}>${l}</option>`).join("")}</select></label></div></div>
      <div class="ct-editor">
        <form class="ct-form" data-ct-form autocomplete="off">
          <fieldset><legend>Kunde</legend>
            ${field("Firma (mit Rechtsform)", "data.customer.company", { wide: true, placeholder: "Muster GmbH" })}
            ${field("Straße und Hausnummer", "data.customer.street")}
            ${field("PLZ und Ort", "data.customer.city")}
            ${field("Land", "data.customer.country")}
            ${field("USt-IdNr.", "data.customer.vat_id", { placeholder: "DE123456789" })}
            ${field("Handelsregister", "data.customer.register", { placeholder: "Amtsgericht Regensburg, HRB 12345" })}
            ${field("Vertreten durch", "data.customer.contact", { placeholder: "Max Muster, Geschäftsführer" })}
            ${field("E-Mail", "data.customer.email", { type: "email" })}
          </fieldset>
          <fieldset><legend>Leistung und Preis</legend>
            ${field("Tarif", "data.plan", { options: Object.fromEntries(PLANS.map((p) => [p, p])) })}
            ${field("Rabatt in %", "data.discount", { type: "number", min: 0, step: "0.5" })}
            <div class="ct-wide"><div data-ct-items>${itemsHtml()}</div><button type="button" data-ct="item-add">+ Position</button></div>
            ${field("Kleinunternehmer – keine Umsatzsteuer (§ 19 UStG)", "data.small_business", { type: "checkbox" })}
            <p class="ct-wide ct-totals" data-ct-totals></p>
          </fieldset>
          <fieldset><legend>Laufzeit und Zahlung</legend>
            ${field("Vertragsbeginn", "data.start", { type: "date" })}
            ${field("Mindestlaufzeit (Monate)", "data.term_months", { type: "number", min: 1, step: "1" })}
            ${field("Verlängerung um (Monate)", "data.renew_months", { type: "number", min: 0, step: "1", help: "0 = endet automatisch" })}
            ${field("Kündigungsfrist (Monate)", "data.notice_months", { type: "number", min: 0, step: "1" })}
            ${field("Zahlungsziel (Tage)", "data.payment_days", { type: "number", min: 0, step: "1" })}
            ${field("Zahlungsart", "data.payment_method", { options: { rechnung: "Rechnung", sepa: "SEPA-Lastschrift", karte: "Karte (Stripe)" } })}
          </fieldset>
          <fieldset><legend>Support und Datenschutz</legend>
            ${field("Support", "data.support", { area: true, wide: true, rows: 2 })}
            ${field("Zugesicherte Verfügbarkeit in % (optional)", "data.availability", { placeholder: "z. B. 99,5" })}
            ${field("Auftragsverarbeitung (AVV) ist Teil des Vertrags", "data.avv", { type: "checkbox" })}
          </fieldset>
          <fieldset><legend>Individuelle Konditionen</legend>
            ${field("Sondervereinbarungen (erscheinen im Vertrag)", "data.special", { area: true, wide: true, rows: 5, placeholder: "z. B. Die ersten 3 Monate sind kostenfrei. Onboarding-Workshop (2 Std.) inklusive." })}
            ${field("Interne Notiz (nicht im PDF)", "data.notes", { area: true, wide: true, rows: 2 })}
            ${field("Ort der Unterschrift", "data.place")}
            ${field("Datum", "data.sign_date", { type: "date" })}
          </fieldset>
          <div class="ct-actions">
            <button type="submit" class="ct-primary">Speichern</button>
            <button type="button" data-ct="pdf-current">Als PDF speichern</button>
            ${current.id ? `<button type="button" data-ct="copy-current">Duplizieren</button><button type="button" class="admin-danger" data-ct="delete">Löschen</button>` : ""}
          </div>
          <p class="admin-message" data-ct-msg></p>
          <p class="hint">Der Vertragstext ist eine Vorlage für B2B-Verträge und keine Rechtsberatung. Lass ihn vor dem ersten Einsatz einmal prüfen.</p>
        </form>
        <div class="ct-preview" aria-label="Vorschau"><div class="ct-paper" data-ct-preview></div></div>
      </div>`;
    refreshPreview();
  }

  function refreshPreview() {
    const box = panel.querySelector("[data-ct-preview]");
    if (box) box.innerHTML = contractHtml(current);
    const t = totals(current.data), el = panel.querySelector("[data-ct-totals]");
    if (el) el.textContent = [t.monat && `${eur(t.monat)} monatlich`, t.jahr && `${eur(t.jahr)} jährlich`, t.einmalig && `${eur(t.einmalig)} einmalig`].filter(Boolean).join(" · ") + (t.yearly ? ` → ${eur(t.yearly)} pro Vertragsjahr${current.data.small_business ? "" : " netto"}` : "") || "Noch keine Beträge";
  }

  const NUMERIC = new Set(["data.discount", "data.term_months", "data.renew_months", "data.notice_months", "data.payment_days"]);
  panel.addEventListener("input", (e) => {
    if (!current) return;
    const t = e.target;
    if (t.dataset.f) {
      const value = t.type === "checkbox" ? t.checked : NUMERIC.has(t.dataset.f) ? num(t.value) : t.value;
      set(current, t.dataset.f, value);
    } else if (t.dataset.item != null) {
      const it = current.data.items[+t.dataset.item];
      it[t.dataset.key] = t.dataset.key === "qty" || t.dataset.key === "price" ? num(t.value) : t.value;
    } else return;
    dirty = true;
    refreshPreview();
  });

  panel.addEventListener("submit", async (e) => {
    e.preventDefault();
    await save();
  });

  async function save() {
    const company = String(current.data.customer.company || "").trim();
    if (!company) { msg("Bitte zuerst den Firmennamen eintragen.", true); panel.querySelector('[data-f="data.customer.company"]')?.focus(); return false; }
    const btn = panel.querySelector(".ct-primary");
    if (btn) btn.disabled = true;
    msg("Wird gespeichert …");
    try {
      const row = { status: current.status, company, data: current.data };
      const saved = current.id
        ? await sb.from("business_contracts").update(row).eq("id", current.id).select().single().then(unwrap)
        : await sb.from("business_contracts").insert(row).select().single().then(unwrap);
      const isNew = !current.id;
      current.id = saved.id; current.number = saved.number;
      contracts = contracts ? [saved, ...contracts.filter((c) => c.id !== saved.id)] : [saved];
      dirty = false;
      if (isNew) openEditor(saved);
      msg(`Gespeichert als ${saved.number} um ${new Date().toLocaleTimeString("de-DE", { timeStyle: "short" })}.`);
      return true;
    } catch (err) {
      msg(`Speichern fehlgeschlagen: ${err.message}`, true);
      return false;
    } finally {
      const b = panel.querySelector(".ct-primary");
      if (b) b.disabled = false;
    }
  }

  // ---------- PDF ----------
  function printContract(contract) {
    const root = document.createElement("div");
    root.id = "contract-print-root";
    root.innerHTML = contractHtml(contract);
    document.body.appendChild(root);
    const title = document.title;
    const company = String(contract.data?.customer?.company || "Firma").replace(/[\\/:*?"<>|]+/g, "").trim();
    document.title = `Vertrag ${contract.number || "Entwurf"} – ${company}`; // wird als Dateiname vorgeschlagen
    document.body.classList.add("printing-contract");
    const cleanup = () => { document.body.classList.remove("printing-contract"); root.remove(); document.title = title; window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(() => { if (document.body.contains(root) && !matchMedia("print").matches) cleanup(); }, 1500);
  }

  // ---------- Aktionen ----------
  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ct]");
    if (!b) return;
    const act = b.dataset.ct;
    const byId = (id) => (contracts || []).find((c) => c.id === id);
    if (act === "reload") return loadList();
    if (act === "new") return openEditor(blank());
    if (act === "open") return openEditor(byId(b.dataset.id));
    if (act === "pdf") return printContract(byId(b.dataset.id));
    if (act === "copy" || act === "copy-current") {
      const src = act === "copy" ? byId(b.dataset.id) : current;
      if (act === "copy-current" && dirty && !confirm("Ungespeicherte Änderungen werden in die Kopie übernommen, aber nicht im Original gespeichert. Weiter?")) return;
      const copy = { ...blank(), data: JSON.parse(JSON.stringify(src.data)) };
      copy.data.sign_date = today();
      openEditor(copy);
      dirty = true;
      return msg("Kopie – noch nicht gespeichert. Firma und Konditionen anpassen, dann speichern.");
    }
    if (act === "back") {
      if (dirty && !confirm("Ungespeicherte Änderungen verwerfen?")) return;
      current = null; dirty = false;
      return renderList();
    }
    if (act === "item-add") {
      current.data.items.push({ label: "", qty: 1, price: 0, interval: "monat" });
      panel.querySelector("[data-ct-items]").innerHTML = itemsHtml();
      panel.querySelector(`[data-item="${current.data.items.length - 1}"][data-key="label"]`)?.focus();
      dirty = true; return refreshPreview();
    }
    if (act === "item-del") {
      current.data.items.splice(+b.dataset.i, 1);
      panel.querySelector("[data-ct-items]").innerHTML = itemsHtml();
      dirty = true; return refreshPreview();
    }
    if (act === "pdf-current") {
      if (!current.id || dirty) {
        if (!(await save())) return;
      }
      return printContract(current);
    }
    if (act === "delete") {
      if (!confirm(`Vertrag ${current.number} (${current.company || current.data.customer.company}) endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return;
      try {
        await sb.from("business_contracts").delete().eq("id", current.id).then(unwrap);
        contracts = (contracts || []).filter((c) => c.id !== current.id);
        current = null; dirty = false;
        renderList();
        msg("Vertrag gelöscht.");
      } catch (err) { msg(`Löschen fehlgeschlagen: ${err.message}`, true); }
    }
  });

  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  // Erst laden, wenn der Tab geöffnet wird
  document.querySelector('[data-tab="contracts"]')?.addEventListener("click", () => {
    if (!loadedOnce) { loadedOnce = true; loadList(); }
  });

  // Für Tests
  window.XyntalContracts = { contractHtml, totals, blank };
})();
