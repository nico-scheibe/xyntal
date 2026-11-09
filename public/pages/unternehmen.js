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
  // Zwei Schritte: wie viele Leute, welche Tools zu welchem Preis pro Kopf. Das Ergebnis
  // nennt zuerst die Ersparnis im Jahr und darunter die Rechnung im Klartext. Mehr als
  // 100 € pro Kopf und Tool ist fast immer eine Gesamtsumme – dann wird gekappt und
  // darauf hingewiesen, statt Millionen-Ersparnisse auszurechnen.
  const MAX_PER_HEAD = 100;
  const out = (k) => document.querySelector(`[data-out-${k}]`);
  const field = (n) => calc.elements.namedItem(n);
  const warn = document.querySelector("[data-calc-warn]");
  const TOOLS = ["chat", "pm", "wiki", "ai", "files"];
  const count = (n) => n.toLocaleString(loc());
  function people() {
    const n = Number.parseInt(field("people").value, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
  }
  function update() {
    const n = people();
    let perHead = 0;
    let capped = false;
    for (const t of TOOLS) {
      const on = field(`t-${t}`).checked;
      const row = field(`t-${t}`).closest("label");
      row.classList.toggle("is-off", !on);
      let c = Number.parseFloat(String(field(`c-${t}`).value).replace(",", "."));
      const tooHigh = on && Number.isFinite(c) && c > MAX_PER_HEAD;
      row.classList.toggle("is-capped", tooHigh);
      if (tooHigh) { c = MAX_PER_HEAD; capped = true; }
      if (on && Number.isFinite(c) && c > 0) perHead += c;
    }
    warn.hidden = !capped;
    warn.textContent = capped
      ? T(`Mehr als ${MAX_PER_HEAD} € pro Kopf und Tool? Bitte den Preis pro Person eintragen, nicht die Summe fürs ganze Team. Wir rechnen hier mit höchstens ${MAX_PER_HEAD} €.`,
          `More than €${MAX_PER_HEAD} per person and tool? Please enter the price per person, not the total for the whole team. We count at most €${MAX_PER_HEAD} here.`)
      : "";
    const today = Math.round(n * perHead * 100); // Cent im Monat
    const plan = n > 0 ? pick(n) : null;
    out("today").textContent = n > 0 ? T(`${euroRound(today)} im Monat`, `${euroRound(today)} a month`) : "–";
    out("today-how").textContent = n > 0
      ? T(`${count(n)} ${n === 1 ? "Person" : "Personen"} × ${euro(Math.round(perHead * 100))} pro Kopf`, `${count(n)} ${n === 1 ? "person" : "people"} × ${euro(Math.round(perHead * 100))} per person`)
      : T("Tragt oben ein, wie viele ihr seid.", "Enter above how many you are.");
    const note = out("note");
    note.hidden = !field("t-ai").checked;
    note.textContent = T("Die KI in Xyntal läuft über ein gemeinsames Budget pro Monat statt über ein Abo pro Kopf. Wer viel KI nutzt, lädt Guthaben auf.",
      "AI in Xyntal runs on one shared monthly budget instead of a subscription per person. Heavy users top up credit.");
    if (!plan) { out("xyntal").textContent = "–"; out("save").textContent = "–"; out("plan").textContent = ""; return; }
    const yearly = plan.yearlyPriceCents;
    const monthly = Math.round(yearly / 12);
    const max = members(plan);
    const from = plan.contactSales ? T("ab ", "from ") : "";
    out("xyntal").textContent = T(`${from}${euroRound(monthly)} im Monat`, `${from}${euroRound(monthly)} a month`);
    const scope = max ? T(`fester Preis für bis zu ${count(max)} Leute`, `fixed price for up to ${count(max)} people`)
      : plan.id === "Enterprise" ? T(`Jahresvertrag, Einstiegspreis gilt bis ${count(ENTERPRISE_SEATS)} Leute`, `annual contract, entry price covers up to ${count(ENTERPRISE_SEATS)} people`)
      : T("Jahresvertrag, Angebot nach Größe", "annual contract, quoted by size");
    out("plan").textContent = plan.contactSales
      ? T(`${plan.name} · ${scope}`, `${plan.name} · ${scope}`)
      : T(`${plan.name} · ${scope}, bei jährlicher Zahlung`, `${plan.name} · ${scope}, billed yearly`);
    const save = today * 12 - yearly;
    out("save").textContent = save > 0 ? euroRound(save) : T("nichts", "nothing");
    if (save <= 0 && n > 0) {
      note.hidden = false;
      note.textContent = T("Bei so wenigen Tools oder Leuten spart ihr mit Xyntal kein Geld – dann lohnt es sich eher, weil alles an einem Ort ist.",
        "With this few tools or people you won't save money with Xyntal – the gain is having everything in one place.");
    }
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
