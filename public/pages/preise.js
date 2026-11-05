// Öffentliche Preisseite (/preise): Tarife und Grenzen aus dem App-Server (GET /billing/plans),
// dieselbe Quelle wie Profil → Tarif und der Xyntal-Assistent. Ohne Konto und ohne Supabase.
(() => {
  const grid = document.querySelector("[data-plans]");
  if (!grid) return;
  const api = () => (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const en = () => window.XyntalI18n?.get?.() === "en";
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let plans = null;
  let cycle = "month";
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token"); } catch { /* privat */ }

  const euro = (cents) => (cents / 100).toLocaleString(en() ? "en-GB" : "de-DE", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
  const bytes = (n) => (n >= 1024 ** 3 ? `${Math.round(n / 1024 ** 3)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
  const lim = (v) => (v === null ? T("Unbegrenzt", "Unlimited") : String(v));

  function price(p) {
    if (p.priceCents === 0 && p.yearlyPriceCents === 0) return `<b>0 €</b><small>${T("für immer", "forever")}</small>`;
    if (p.contactSales) return `<b>${T("ab ", "from ")}${euro(p.yearlyPriceCents)}</b><small>${T("pro Jahr · auf Anfrage", "per year · on request")}</small>`;
    if (p.yearlyOnly || cycle === "year") return `<b>${euro(p.yearlyPriceCents)}</b><small>${T("pro Jahr", "per year")}${!p.yearlyOnly && p.priceCents ? ` · ${T(`entspricht ${euro(Math.round(p.yearlyPriceCents / 12))} im Monat`, `equals ${euro(Math.round(p.yearlyPriceCents / 12))} a month`)}` : ""}</small>`;
    return `<b>${euro(p.priceCents)}</b><small>${T("pro Monat", "per month")}</small>`;
  }
  function cta(p) {
    if (p.contactSales) return `<a class="btn btn-ghost" href="mailto:admin@xyntal.com?subject=${encodeURIComponent(`Xyntal ${p.name}`)}">${T("Kontakt aufnehmen", "Get in touch")}</a>`;
    if (p.priceCents === 0) return `<a class="btn" href="/beta">${T("Kostenlos starten", "Start for free")}</a>`;
    return signedIn
      ? `<a class="btn btn-ghost" href="/tarif">${T(`${p.name} wählen`, `Choose ${p.name}`)}</a>`
      : `<a class="btn btn-ghost" href="/beta">${T("Erst für die Beta bewerben", "Apply for the beta first")}</a>`;
  }

  function render() {
    if (!plans) return;
    grid.innerHTML = plans.map((p) => `<article class="pr-card${p.contactSales ? " is-company" : ""}" aria-labelledby="pr-${esc(p.id)}">
      <header><h2 id="pr-${esc(p.id)}">${esc(p.name)}</h2><p>${esc(p.blurb)}</p></header>
      <div class="pr-price">${price(p)}</div>
      ${cta(p)}
      <ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </article>`).join("");
    const rows = [
      [T("Arbeitsbereiche", "Workspaces"), (l) => lim(l.workspaces)],
      [T("Mitglieder pro Arbeitsbereich", "Members per workspace"), (l) => lim(l.membersPerWorkspace)],
      [T("Speicher", "Storage"), (l) => bytes(l.storageBytes)],
      [T("Größte Datei", "Largest file"), (l) => bytes(l.maxUploadBytes)],
      [T("KI inklusive", "AI included"), (l) => (l.ai ? T("Ja", "Yes") : T("Mit Guthaben", "With credit"))],
      [T("Eigene KI-Agenten", "Custom AI agents"), (l) => lim(l.agents)],
      [T("Aktive Automationen", "Active automations"), (l) => String(l.activeAutomations)],
      [T("Automations-Läufe pro Monat", "Automation runs per month"), (l) => (l.automationRunsPerMonth === null ? T("Fair Use", "Fair use") : l.automationRunsPerMonth.toLocaleString(en() ? "en-GB" : "de-DE"))],
      [T("Eigene Rollen und Rechte", "Custom roles and permissions"), (l) => (l.customRoles ? T("Ja", "Yes") : "–")],
      [T("Support", "Support"), (l) => ({ Normal: T("Standard", "Standard"), High: T("Bevorzugt", "Priority"), Urgent: T("Höchste Priorität", "Highest priority") }[l.supportPriority] || l.supportPriority)],
    ];
    const table = document.querySelector("[data-compare-table]");
    table.innerHTML = `<caption class="sr-only">${T("Grenzen der Tarife im Vergleich", "Plan limits compared")}</caption><thead><tr><th scope="col">${T("Tarif", "Plan")}</th>${plans.map((p) => `<th scope="col">${esc(p.name)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${plans.map((p) => `<td>${esc(p.limits ? fn(p.limits) : "–")}</td>`).join("")}</tr>`).join("")}</tbody>`;
    document.querySelector("[data-compare]").hidden = false;
  }

  async function load() {
    try {
      const res = await fetch(`${api()}/billing/plans`, { headers: { "accept-language": en() ? "en" : "de" } });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data?.plans)) throw new Error("plans");
      plans = json.data.plans;
      render();
    } catch {
      grid.innerHTML = `<p class="pr-loading">${T("Die Tarife konnten gerade nicht geladen werden.", "The plans couldn't be loaded right now.")} <a href="/preise">${T("Neu laden", "Reload")}</a> · <a href="mailto:admin@xyntal.com">admin@xyntal.com</a></p>`;
    }
  }

  document.querySelector(".pr-toggle")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cycle]");
    if (!b) return;
    cycle = b.dataset.cycle;
    document.querySelectorAll(".pr-toggle [data-cycle]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    render();
  });
  // Sprache gewechselt: Texte des Servers kommen in der anderen Sprache neu
  document.addEventListener("xyntal:lang", load);
  load();
})();
