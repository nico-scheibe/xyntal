// Firmen-Seite (/unternehmen): Ersparnis-Rechner, Firmentarife und Anfrage für 30 Tage Test.
// Tarife kommen wie auf /preise vom App-Server (GET /billing/plans); fällt er aus, rechnet die
// Seite mit dem Stand unten weiter, damit der Rechner nie leer bleibt. Die Anfrage geht an
// POST /site/sales-inquiry; ist der Server nicht erreichbar, öffnet sich eine fertige E-Mail.
(() => {
  const grid = document.querySelector("[data-plans]");
  const calc = document.querySelector("[data-calc]");
  if (!grid || !calc) return;
  const api = () => (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const en = () => window.XyntalI18n?.get?.() === "en";
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const loc = () => (en() ? "en-GB" : "de-DE");
  const euro = (cents, digits) => (cents / 100).toLocaleString(loc(), { minimumFractionDigits: digits ?? (cents % 100 ? 2 : 0), maximumFractionDigits: digits ?? 2 }) + " €";
  const euroRound = (cents) => euro(Math.round(cents / 100) * 100, 0);
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token"); } catch { /* privat */ }

  // Stand des Katalogs (server/src/billing/routes.ts), nur als Rückfall ohne Server.
  const FALLBACK = [
    { id: "Free", name: "Free", priceCents: 0, yearlyPriceCents: 0, limits: { membersPerWorkspace: 5 } },
    { id: "Plus", name: "Plus", priceCents: 1200, yearlyPriceCents: 12000, limits: { membersPerWorkspace: 15 } },
    { id: "Pro", name: "Pro", priceCents: 2900, yearlyPriceCents: 29000, limits: { membersPerWorkspace: 25 } },
    { id: "Ultra", name: "Ultra", priceCents: 7900, yearlyPriceCents: 79000, blurb: "Für kleine Firmen, die auf Xyntal laufen.", features: [], limits: { membersPerWorkspace: 100 } },
    { id: "Business", name: "Business", priceCents: 29900, yearlyPriceCents: 299000, blurb: "Für mittlere Firmen: das ganze Team an einem Ort.", features: [], limits: { membersPerWorkspace: 300 } },
    { id: "Enterprise", name: "Enterprise", priceCents: 0, yearlyPriceCents: 990000, yearlyOnly: true, contactSales: true, blurb: "Für große Organisationen: ein Vertrag, alle Teams an Bord.", features: [], limits: { membersPerWorkspace: null } },
    { id: "Enterprise+", name: "Enterprise+", priceCents: 0, yearlyPriceCents: 2400000, yearlyOnly: true, contactSales: true, blurb: "Für Firmengruppen und eigene Vertragsbedingungen.", features: [], limits: { membersPerWorkspace: null } },
  ];
  const COMPANY = ["Ultra", "Business", "Enterprise", "Enterprise+"];
  const ENTERPRISE_SEATS = 750; // so weit reicht der Einstiegspreis von Enterprise (Fragen unten)
  let plans = FALLBACK;
  let live = false;

  const members = (p) => (p.limits ? p.limits.membersPerWorkspace : undefined);
  // Kleinster Tarif zum Selbstbuchen, in den alle passen; sonst Enterprise.
  function pick(people) {
    const self = plans.filter((p) => !p.contactSales && p.priceCents > 0 && members(p) !== undefined);
    return self.find((p) => members(p) === null || members(p) >= people) || plans.find((p) => p.id === "Enterprise") || null;
  }

  // ---- Rechner ----------------------------------------------------------------
  const out = (k) => document.querySelector(`[data-out-${k}]`);
  const field = (n) => calc.elements.namedItem(n);
  const TOOLS = ["chat", "pm", "wiki", "ai", "files"];
  function people() {
    const n = Number.parseInt(field("people").value, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
  }
  function update() {
    const n = people();
    let perHead = 0;
    for (const t of TOOLS) {
      const on = field(`t-${t}`).checked;
      field(`t-${t}`).closest("label").classList.toggle("is-off", !on);
      const c = Number.parseFloat(String(field(`c-${t}`).value).replace(",", "."));
      if (on && Number.isFinite(c) && c > 0) perHead += c;
    }
    const today = Math.round(n * perHead * 100); // Cent im Monat
    const plan = n > 0 ? pick(n) : null;
    out("today").textContent = n > 0 ? euroRound(today) : "–";
    if (!plan) { out("xyntal").textContent = "–"; out("save").textContent = "–"; out("plan").textContent = ""; out("head").textContent = ""; return; }
    const yearly = plan.yearlyPriceCents;
    const monthly = Math.round(yearly / 12);
    const from = plan.contactSales ? T("ab ", "from ") : "";
    out("xyntal").textContent = from + euroRound(monthly);
    out("plan").textContent = plan.contactSales
      ? T(`${plan.name}, Jahresvertrag – Angebot nach Größe`, `${plan.name}, annual contract – quoted by size`)
      : T(`${plan.name}, bei jährlicher Zahlung (monatlich ${euro(plan.priceCents)})`, `${plan.name}, billed yearly (monthly ${euro(plan.priceCents)})`);
    const save = today * 12 - yearly;
    out("save").textContent = save > 0 ? euroRound(save) : "–";
    out("head").textContent = save > 0
      ? T(`Xyntal kostet euch etwa ${euro(Math.round(monthly / n), 2)} pro Person und Monat.`, `Xyntal costs you about ${euro(Math.round(monthly / n), 2)} per person a month.`)
      : T("Wählt aus, was ihr heute bezahlt.", "Pick what you pay for today.");
    document.querySelectorAll(".pr-card[data-plan]").forEach((c) => {
      const on = c.dataset.plan === plan.id;
      c.classList.toggle("is-pick", on);
      const tag = c.querySelector(".pr-tag");
      if (tag) tag.hidden = !on;
    });
    const sel = document.querySelector("[data-inquiry] [name=plan]");
    if (sel && !sel.dataset.touched) sel.value = ["Business", "Enterprise"].includes(plan.id) ? plan.id : "";
    const size = document.querySelector("[data-inquiry] [name=size]");
    if (size && !size.dataset.touched) size.value = String(n);
  }
  calc.addEventListener("input", (e) => {
    if (e.target.name === "peopleRange") field("people").value = e.target.value;
    if (e.target.name === "people") field("peopleRange").value = String(Math.min(1000, Math.max(10, people())));
    update();
  });

  // ---- Firmentarife ---------------------------------------------------------
  function priceHtml(p) {
    // „Pro Person“ nur, wo die Größe feststeht: bei der Obergrenze des Tarifs, bei Enterprise
    // für den Einstiegspreis (bis 750 Leute). Enterprise+ wird nach Umfang angeboten.
    const n = members(p) ? members(p) : p.id === "Enterprise" ? ENTERPRISE_SEATS : 0;
    const perLine = n > 0
      ? `<em>${esc(T(`≈ ${euro(Math.round(p.yearlyPriceCents / 12 / n), 2)} pro Person und Monat bei ${n.toLocaleString(loc())} Leuten`, `≈ ${euro(Math.round(p.yearlyPriceCents / 12 / n), 2)} per person a month for ${n.toLocaleString(loc())} people`))}</em>`
      : `<em>${esc(T("Preis nach Umfang", "Priced by scope"))}</em>`;
    if (p.contactSales) return `<b>${T("ab ", "from ")}${euro(p.yearlyPriceCents)}</b><small>${T("pro Jahr · Jahresvertrag auf Rechnung", "per year · annual contract, by invoice")}</small>${perLine}`;
    return `<b>${euro(p.priceCents)}</b><small>${T(`pro Monat · oder ${euro(p.yearlyPriceCents)} im Jahr`, `per month · or ${euro(p.yearlyPriceCents)} a year`)}</small>${perLine}`;
  }
  function ctaHtml(p) {
    if (p.contactSales) return `<a class="btn" href="#anfrage" data-ask="${esc(p.id)}">${T("Angebot anfragen", "Request a quote")}</a>`;
    const buy = signedIn ? `<a class="btn btn-ghost" href="/tarif">${T(`${p.name} buchen`, `Get ${p.name}`)}</a>` : "";
    return `<a class="btn" href="#anfrage" data-ask="${esc(p.id)}">${T("30 Tage kostenlos testen", "Try free for 30 days")}</a>${buy}`;
  }
  function render() {
    const list = COMPANY.map((id) => plans.find((p) => p.id === id)).filter(Boolean);
    grid.innerHTML = list.map((p) => `<article class="pr-card${p.contactSales ? " is-company" : ""}" data-plan="${esc(p.id)}" aria-labelledby="un-${esc(p.id)}">
      <span class="pr-tag" hidden>${T("Passt zu euch", "Fits you")}</span>
      <header><h2 id="un-${esc(p.id)}">${esc(p.name)}</h2><p>${esc(p.blurb || "")}</p></header>
      <div class="pr-price">${priceHtml(p)}</div>
      ${ctaHtml(p)}
      ${members(p) !== undefined && !(p.features && p.features.length) ? `<p class="un-note">${members(p) === null ? T("Unbegrenzt viele Mitglieder", "Unlimited members") : T(`Bis ${members(p)} Mitglieder je Arbeitsbereich`, `Up to ${members(p)} members per workspace`)}</p>` : ""}
      ${p.features && p.features.length ? `<ul>${p.features.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    </article>`).join("");
    if (!live) grid.insertAdjacentHTML("beforeend", `<p class="pr-loading">${T("Die genauen Leistungen konnten gerade nicht geladen werden – alles Weitere auf der", "The full details couldn't be loaded right now – see the")} <a href="/preise">${T("Preisseite", "pricing page")}</a>.</p>`);
    update();
  }
  grid.addEventListener("click", (e) => {
    const a = e.target.closest("[data-ask]");
    if (!a) return;
    const sel = document.querySelector("[data-inquiry] [name=plan]");
    if (sel) { sel.value = ["Business", "Enterprise", "Enterprise+"].includes(a.dataset.ask) ? a.dataset.ask : ""; sel.dataset.touched = "1"; }
  });

  async function load() {
    try {
      const res = await fetch(`${api()}/billing/plans`, { headers: { "accept-language": en() ? "en" : "de" } });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data?.plans)) throw new Error("plans");
      plans = json.data.plans;
      live = true;
    } catch {
      plans = FALLBACK;
      live = false;
    }
    render();
  }

  // ---- Anfrage --------------------------------------------------------------
  const form = document.querySelector("[data-inquiry]");
  const status = document.querySelector("[data-inquiry-status]");
  form?.addEventListener("input", (e) => { if (e.target.name === "plan" || e.target.name === "size") e.target.dataset.touched = "1"; });
  function say(text, error) {
    status.textContent = text;
    status.classList.toggle("is-error", !!error);
  }
  const FIELD_MSG = {
    company: () => T("Bitte gib den Namen der Firma an.", "Please enter the company name."),
    name: () => T("Bitte gib deinen Namen an.", "Please enter your name."),
    email: () => T("Bitte gib eine gültige E-Mail-Adresse an.", "Please enter a valid email address."),
    size: () => T("Bitte gib an, wie viele Leute mitmachen.", "Please say how many people will join."),
  };
  function mailtoFallback(d) {
    const body = [
      `Firma: ${d.company}`, `Name: ${d.name}`, `E-Mail: ${d.email}`, `Teamgröße: ${d.size}`,
      `Interesse an: ${d.plan || "noch offen"}`, `30 Tage testen: ${d.pilot ? "ja" : "nein"}`, "", d.message,
    ].join("\n");
    location.href = `mailto:admin@xyntal.com?subject=${encodeURIComponent(`Firmen-Anfrage: ${d.company}`)}&body=${encodeURIComponent(body)}`;
    say(T("Der Server ist gerade nicht erreichbar – wir haben dir eine fertige E-Mail an admin@xyntal.com geöffnet.", "The server can't be reached right now – we've opened a ready-made email to admin@xyntal.com."));
  }
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = form.elements;
    const d = {
      company: f.company.value.trim(), name: f.name.value.trim(), email: f.email.value.trim(),
      size: f.size.value.trim(), plan: f.plan.value, pilot: f.pilot.checked, message: f.message.value.trim(), website: f.website.value,
    };
    const local = d.company.length < 2 ? "company" : d.name.length < 2 ? "name" : !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.email) ? "email" : !(Number.parseInt(d.size, 10) > 0) ? "size" : null;
    if (local) { say(FIELD_MSG[local](), true); f[local].focus(); return; }
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    say(T("Wird gesendet …", "Sending …"));
    try {
      const res = await fetch(`${api()}/site/sales-inquiry`, { method: "POST", headers: { "content-type": "application/json", "accept-language": en() ? "en" : "de" }, body: JSON.stringify(d) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        form.reset();
        say(T("Danke! Deine Anfrage ist angekommen. Ich melde mich per E-Mail bei dir.", "Thanks! Your request has arrived. I'll get back to you by email."));
      } else if (res.status === 400 && FIELD_MSG[json.error?.details?.field]) {
        say(FIELD_MSG[json.error.details.field](), true);
      } else if (res.status === 429) {
        say(T("Heute kamen von hier schon mehrere Anfragen. Schreib uns gern direkt an admin@xyntal.com.", "Several requests already came from here today. Feel free to write to admin@xyntal.com."), true);
      } else if (res.status === 404 || res.status >= 500) {
        mailtoFallback(d);
      } else {
        say(T("Das hat nicht geklappt. Schreib uns gern an admin@xyntal.com.", "That didn't work. Feel free to write to admin@xyntal.com."), true);
      }
    } catch {
      mailtoFallback(d);
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener("xyntal:lang", load);
  render();
  load();
})();
