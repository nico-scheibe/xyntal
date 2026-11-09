// Öffentliche Preisseite (/preise): Tarife und Grenzen aus dem App-Server (GET /billing/plans),
// dieselbe Quelle wie Profil → Tarif und der Xyntal-Assistent. Ohne Konto und ohne Supabase.
// Darstellung: eine Treppe aus den Tarifen, ein Punkt für dich, darunter der gewählte Tarif.
// Jede Zahl auf der Seite kommt aus dieser einen Antwort – nichts ist hier fest eingetragen.
(() => {
  const X = window.XyTarife;
  const stairs = document.querySelector("[data-stairs]");
  if (!X || !stairs) return;
  const { en, T, esc, euro, count, bytes, calm, clamp } = X;
  const $ = (s, root = document) => root.querySelector(s);

  let plans = null;
  let callCents = 0;
  let packs = [];
  let packCredits = [];
  let cycle = "month";
  let needAi = false;
  let picked = null;      // von Hand gewählte Stufe; null = die empfohlene
  let aiPlan = null;      // Tarif in der Guthaben-Anzeige; null = folgt der Stufe
  let pack = 0;
  let month = 1;
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("sb-db-auth-token"); } catch { /* privat */ }

  // Regler: 1 bis 25 einzeln, dann in Fünfer-, dann in Zwanzigerschritten bis 400
  const PEOPLE = [
    ...Array.from({ length: 25 }, (_, i) => i + 1),
    ...Array.from({ length: 15 }, (_, i) => 30 + i * 5),
    ...Array.from({ length: 15 }, (_, i) => 120 + i * 20),
  ];
  const range = $("[data-people]");
  range.max = String(PEOPLE.length - 1);
  const people = () => PEOPLE[clamp(Number(range.value) || 0, 0, PEOPLE.length - 1)];

  const requests = (cents) => X.requests(cents, callCents);
  const lim = (v) => (v === null ? T("Unbegrenzt", "Unlimited") : String(v));
  const members = (p) => (p.limits ? p.limits.membersPerWorkspace : undefined);
  const company = (p) => !!(p.businessOnly || p.contactSales);
  const aiLine = (p) => T(`etwa ${count(requests(p.aiIncludedCents))} KI-Anfragen pro Monat inklusive`, `about ${count(requests(p.aiIncludedCents))} AI requests a month included`);
  // Ohne Kosten pro Anfrage (älterer Server) bleibt die Budget-Zeile in Euro.
  const features = (p) => (p.aiBudgetLine && p.aiIncludedCents > 0 && callCents > 0
    ? p.features.map((f) => (f === p.aiBudgetLine ? { text: aiLine(p), ai: true } : { text: f }))
    : p.features.map((f) => ({ text: f, ai: f === p.aiBudgetLine })));

  // Preis eines Tarifs: Betrag, die Zeile darunter und die Kurzform für die Stufe.
  function price(p) {
    if (p.priceCents === 0 && p.yearlyPriceCents === 0) return { amount: euro(0), per: T("für immer", "forever"), unit: "" };
    if (p.contactSales) return { amount: `${T("ab ", "from ")}${euro(p.yearlyPriceCents)}`, per: T("pro Jahr · auf Anfrage", "per year · on request"), unit: T("/ Jahr", "/ year") };
    if (p.yearlyOnly || cycle === "year") {
      return {
        amount: euro(p.yearlyPriceCents),
        per: T("pro Jahr", "per year") + (!p.yearlyOnly && p.priceCents ? ` · ${T(`entspricht ${euro(Math.round(p.yearlyPriceCents / 12))} im Monat`, `equals ${euro(Math.round(p.yearlyPriceCents / 12))} a month`)}` : ""),
        unit: T("/ Jahr", "/ year"),
      };
    }
    if (Array.isArray(p.intervals) && !p.intervals.includes("month") && p.quarterlyPriceCents > 0) {
      return { amount: euro(p.quarterlyPriceCents), per: T("pro Quartal · nur für Unternehmen", "per quarter · companies only") + (p.trialDays > 0 ? T(" · 30 Tage kostenlos", " · 30 days free") : ""), unit: T("/ Quartal", "/ quarter") };
    }
    return { amount: euro(p.priceCents), per: T("pro Monat", "per month"), unit: T("/ Monat", "/ month") };
  }
  function cta(p) {
    const more = company(p) ? `<a class="xs-tlink" href="/unternehmen">${T("Alles für Firmen", "Everything for companies")}</a>` : "";
    if (p.contactSales) return `<a class="xs-pill" href="mailto:admin@xyntal.com?subject=${encodeURIComponent(`Xyntal ${p.name}`)}">${T("Kontakt aufnehmen", "Get in touch")} <i aria-hidden="true">→</i></a>${more}`;
    if (p.priceCents === 0) return `<a class="xs-pill" href="/beta">${T("Kostenlos starten", "Start for free")} <i aria-hidden="true">→</i></a>`;
    return (signedIn
      ? `<a class="xs-pill" href="/tarif">${esc(T(`${p.name} wählen`, `Choose ${p.name}`))} <i aria-hidden="true">→</i></a>`
      : `<a class="xs-pill" href="/beta">${T("Erst für die Beta bewerben", "Apply for the beta first")} <i aria-hidden="true">→</i></a>`) + more;
  }

  // Kleinste Stufe, in die alle passen – mit KI erst ab der ersten Stufe, die KI hat.
  const fits = (p, n) => members(p) === null || members(p) >= n;
  function recommend() {
    const n = people();
    const sized = plans.filter((p) => members(p) !== undefined);
    return sized.find((p) => fits(p, n) && (!needAi || p.limits.ai)) || sized[sized.length - 1] || plans[0];
  }
  const current = () => plans.find((p) => p.id === picked) || recommend();

  function why(p, rec) {
    const n = people();
    const max = members(p);
    if (p !== rec) {
      if (max !== null && max !== undefined && max < n) return T(`${p.name} reicht für ${count(n)} Leute nicht: höchstens ${count(max)} je Arbeitsbereich.`, `${p.name} isn't enough for ${count(n)} people: ${count(max)} per workspace at most.`);
      if (needAi && p.limits && !p.limits.ai) return T(`${p.name} hat keine KI in der App.`, `${p.name} has no AI in the app.`);
      return T(`Geht auch. Für ${n === 1 ? "dich" : "euch"} würde ${rec.name} schon reichen.`, `Works too. ${rec.name} would already be enough for you.`);
    }
    const bySize = plans.find((q) => members(q) !== undefined && fits(q, n));
    const bumped = needAi && bySize && bySize !== p ? T(`${bySize.name} hat keine KI in der App, darum ${p.name}. `, `${bySize.name} has no AI in the app, hence ${p.name}. `) : "";
    if (max === null) {
      const top = plans.map(members).filter((m) => typeof m === "number").pop();
      return bumped + (top ? T(`Mehr als ${count(top)} Leute: ${p.name} hat keine Obergrenze.`, `More than ${count(top)} people: ${p.name} has no upper limit.`) : T(`${p.name} hat keine Obergrenze.`, `${p.name} has no upper limit.`));
    }
    if (n === 1) return bumped + T(`Allein passt du in ${p.name}: bis ${count(max)} Leute je Arbeitsbereich.`, `On your own you fit into ${p.name}: up to ${count(max)} people per workspace.`);
    return bumped + T(`${count(n)} Leute passen in ${p.name}: bis ${count(max)} je Arbeitsbereich.`, `${count(n)} people fit into ${p.name}: up to ${count(max)} per workspace.`);
  }

  // ---- Treppe -------------------------------------------------------------------
  function renderStairs() {
    const firstCo = plans.findIndex(company);
    stairs.classList.remove("is-loading");
    stairs.style.setProperty("--n", plans.length);
    stairs.innerHTML = plans.map((p, i) => {
      const max = members(p);
      const cap = max === undefined ? "" : max === null ? T("ohne Grenze", "no limit") : T(`bis ${count(max)}`, `up to ${count(max)}`);
      return `<li class="xp-step${company(p) ? " is-co" : ""}${i === firstCo ? " is-co-first" : ""}" style="--i:${i}" data-id="${esc(p.id)}">
        <button type="button" aria-pressed="false">
          <span class="xp-step__price" data-step-price></span>
          <span class="xp-step__riser" data-land></span>
          <span class="xp-step__foot"><span class="xp-step__name" data-no-i18n>${esc(p.name)}</span><span class="xp-step__cap">${esc(cap)}</span></span>
        </button>
        ${i === firstCo ? `<span class="xs-mono xp-step__co" aria-hidden="true">${T("Für Firmen", "For companies")}</span>` : ""}
      </li>`;
    }).join("");
  }
  function paintStairs() {
    const cur = current();
    stairs.querySelectorAll(".xp-step").forEach((li) => {
      const p = plans.find((q) => q.id === li.dataset.id);
      const pr = price(p);
      const on = p === cur;
      li.classList.toggle("is-sel", on);
      li.querySelector("button").setAttribute("aria-pressed", String(on));
      li.querySelector("[data-step-price]").innerHTML = `${esc(pr.amount)}${pr.unit ? `<small>${esc(pr.unit)}</small>` : ""}`;
    });
    placeYou();
  }
  // Der Punkt steht auf der empfohlenen Stufe – so weit rechts, wie das Team die Stufe füllt.
  const you = $("[data-you]");
  function placeYou() {
    if (!plans) return;
    const rec = recommend();
    const li = [...stairs.children].find((x) => x.dataset.id === rec.id);
    const land = li?.querySelector("[data-land]");
    if (!land) return;
    const n = people();
    const i = plans.indexOf(rec);
    const before = plans.slice(0, i).map(members).filter((m) => typeof m === "number").pop() || 0;
    const max = members(rec);
    const frac = typeof max === "number" && max > before ? clamp((n - before) / (max - before), 0.14, 0.86) : 0.5;
    const s = stairs.parentElement.getBoundingClientRect();
    const r = land.getBoundingClientRect();
    you.hidden = false;
    you.style.setProperty("--x", `${Math.round(r.left - s.left + r.width * frac)}px`);
    you.style.setProperty("--y", `${Math.round(r.top - s.top)}px`);
    $("[data-you-text]").textContent = n === 1 ? T("du", "you") : T("ihr", "you");
    requestAnimationFrame(() => you.classList.add("is-set"));
  }

  // ---- Der gewählte Tarif ----------------------------------------------------------
  const panel = $("[data-plan]");
  let srTimer = 0;
  function paintPlan() {
    const p = current();
    const rec = recommend();
    const pr = price(p);
    panel.classList.remove("is-loading");
    panel.classList.toggle("is-other", p !== rec);
    $("[data-plan-tag]").textContent = p === rec ? (people() === 1 ? T("Passt zu dir", "Fits you") : T("Passt zu euch", "Fits you")) : T("Du schaust dir an", "You're looking at");
    $("[data-plan-name]").textContent = p.name;
    X.odometer($("[data-plan-price]"), pr.amount);
    $("[data-plan-per]").textContent = pr.per;
    $("[data-plan-why]").textContent = why(p, rec);
    $("[data-plan-blurb]").textContent = p.blurb || "";
    $("[data-plan-cta]").innerHTML = cta(p) + (p !== rec ? `<button type="button" class="xs-tlink" data-back>${esc(T(`Zurück zu ${rec.name}`, `Back to ${rec.name}`))}</button>` : "");
    // Die Zahl am Anfang einer Zeile ist das, was man vergleicht – sie steht heller da.
    const lead = (t) => { const m = t.match(/^((?:etwa |about )?\d[\d.,]*(?:\s?(?:GB|MB|TB|€|×))?)(\s.*)$/); return m ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(t); };
    $("[data-plan-feat]").innerHTML = features(p).map((f) => `<li${f.ai ? ' class="is-ai"' : ""}>${lead(f.text)}</li>`).join("");
    paintMonths(p);
    clearTimeout(srTimer);
    srTimer = setTimeout(() => { $("[data-plan-sr]").textContent = `${p.name}: ${pr.amount} ${pr.per}. ${why(p, rec)}`; }, 500);
  }
  // Zwölf Kästchen: wie viele Monate man bei jährlicher Zahlung wirklich bezahlt.
  function paintMonths(p) {
    const box = $("[data-months]");
    const paid = p.priceCents > 0 && !p.yearlyOnly && !p.contactSales && (!p.intervals || p.intervals.includes("month")) ? p.yearlyPriceCents / p.priceCents : 0;
    const ok = paid > 0 && paid < 12 && Math.abs(paid - Math.round(paid)) < 0.01;
    box.hidden = !ok;
    if (!ok) return;
    const cells = $("[data-months-cells]");
    if (cells.children.length !== 12) cells.innerHTML = Array.from({ length: 12 }, (_, m) => `<li style="--m:${m}"></li>`).join("");
    const full = Math.round(paid);
    const yearly = cycle === "year";
    [...cells.children].forEach((c, m) => {
      c.classList.toggle("is-paid", yearly && m < full);
      c.classList.toggle("is-free", yearly && m >= full);
    });
    const gift = 12 - full;
    $("[data-months-say]").innerHTML = yearly
      ? `<span>${esc(T(`${full} × ${euro(p.priceCents)} bezahlt`, `${full} × ${euro(p.priceCents)} paid`))}</span><b>${esc(T(`${gift} Monate geschenkt · ${euro(12 * p.priceCents - p.yearlyPriceCents)} gespart`, `${gift} months free · ${euro(12 * p.priceCents - p.yearlyPriceCents)} saved`))}</b>`
      : `<span>${esc(T(`12 × ${euro(p.priceCents)} = ${euro(12 * p.priceCents)} im Jahr`, `12 × ${euro(p.priceCents)} = ${euro(12 * p.priceCents)} a year`))}</span><span>${esc(T(`Jährlich: ${gift} Monate geschenkt`, `Yearly: ${gift} months free`))}</span>`;
  }

  // ---- KI-Guthaben -------------------------------------------------------------------
  // Zwei Anzeigen auf derselben Skala: was im Tarif steckt (füllt sich jeden Monat neu) und
  // was man selbst auflädt (bleibt). Pakete kommen aus demselben Katalog wie die Tarife.
  const tank = $(".xp-tank");
  const unitOf = (cents) => (callCents > 0 ? requests(cents) : cents / 100);
  function paintCredit() {
    const box = $("[data-credit]");
    const withAi = plans.filter((p) => p.aiIncludedCents > 0);
    if (!box || !withAi.length) { if (box) box.hidden = true; return; }
    box.hidden = false;
    const cur = current();
    const shown = plans.find((p) => p.id === aiPlan) || (cur.aiIncludedCents > 0 ? cur : withAi[0]);
    const chips = withAi.filter((p) => !company(p) || p === shown);
    $("[data-ai-plans]").innerHTML = chips.map((p) => `<button type="button" data-ai-plan="${esc(p.id)}" aria-pressed="${p === shown}" data-no-i18n>${esc(p.name)}</button>`).join("");
    const credit = (i) => (Number(packCredits[i]) > 0 ? Number(packCredits[i]) : packs[i]);
    const scale = Math.max(...chips.map((p) => unitOf(p.aiIncludedCents)), ...packs.map((_, i) => unitOf(credit(i))), 1);
    const show = (key, value) => {
      $(`[data-bar="${key}"]`).style.setProperty("--v", clamp(value / scale, 0.012, 1).toFixed(4));
      const n = $(`[data-n="${key}"]`);
      X.tween(n, value, (v) => { n.textContent = callCents > 0 ? count(Math.round(v)) : euro(Math.round(v * 100)); });
    };
    show("inc", unitOf(shown.aiIncludedCents));
    $('[data-unit="inc"]').textContent = callCents > 0 ? T("KI-Anfragen im Monat", "AI requests a month") : T("KI-Budget im Monat", "AI budget a month");
    box.querySelectorAll("[data-about]").forEach((a) => { a.hidden = !(callCents > 0); a.textContent = T("etwa", "about"); });
    const topRow = $('[data-tank="top"]');
    topRow.hidden = packs.length === 0;
    if (packs.length) {
      pack = clamp(pack, 0, packs.length - 1);
      $("[data-packs]").innerHTML = packs.map((c, i) => `<button type="button" data-pack="${i}" aria-pressed="${i === pack}" data-no-i18n>${esc(euro(c))}</button>`).join("");
      const got = credit(pack);
      show("top", unitOf(got));
      $('[data-unit="top"]').textContent = callCents > 0 ? T(`KI-Anfragen für ${euro(packs[pack])}`, `AI requests for ${euro(packs[pack])}`) : T(`Guthaben für ${euro(packs[pack])}`, `credit for ${euro(packs[pack])}`);
      const bonus = got > packs[pack] ? Math.round(((got - packs[pack]) / packs[pack]) * 100) : 0;
      const b = $("[data-bonus]");
      b.hidden = bonus <= 0;
      b.textContent = T(`+${bonus} % Bonus`, `+${bonus}% bonus`);
    }
    $("[data-month-n]").textContent = T(`Monat ${month}`, `Month ${month}`);
    $("[data-credit-cta]").innerHTML = signedIn
      ? `<a class="xs-tlink" href="/tarif">${T("Verbrauch ansehen und aufladen", "See usage and top up")}</a>`
      : `<a class="xs-tlink" href="/beta">${T("Erst für die Beta bewerben", "Apply for the beta first")}</a>`;
  }
  $("[data-credit]")?.addEventListener("click", (e) => {
    const a = e.target.closest("[data-ai-plan]");
    const k = e.target.closest("[data-pack]");
    if (a) { aiPlan = a.dataset.aiPlan; paintCredit(); }
    if (k) { pack = Number(k.dataset.pack); paintCredit(); }
    if (e.target.closest("[data-month]")) {
      // Ein Monat vergeht: das Enthaltene läuft leer und füllt sich neu, das Aufgeladene bleibt stehen.
      month += 1;
      $("[data-month-n]").textContent = T(`Monat ${month}`, `Month ${month}`);
      const bar = $('[data-tank="inc"] .xp-tank__bar');
      tank.classList.remove("is-turn");
      bar.classList.add("is-drain");
      setTimeout(() => { bar.classList.remove("is-drain"); tank.classList.add("is-turn"); }, 380);
      setTimeout(() => tank.classList.remove("is-turn"), 1700);
    }
  });

  // ---- Vergleich ----------------------------------------------------------------------
  const cmpWrap = $("[data-cmp]");
  const cmp = X.table(cmpWrap, { onPick: (col) => pick(plans[col].id) });
  const yes = () => `<span class="xs-y" role="img" aria-label="${T("Enthalten", "Included")}" data-no-i18n></span>`;
  const no = () => `<span class="xs-n" role="img" aria-label="${T("Nicht enthalten", "Not included")}" data-no-i18n></span>`;
  function renderCompare() {
    const rows = [
      [T("Arbeitsbereiche", "Workspaces"), (l) => esc(lim(l.workspaces))],
      [T("Mitglieder pro Arbeitsbereich", "Members per workspace"), (l) => esc(lim(l.membersPerWorkspace))],
      [T("Speicher", "Storage"), (l) => esc(bytes(l.storageBytes))],
      [T("Größte Datei", "Largest file"), (l) => esc(bytes(l.maxUploadBytes))],
      [T("KI inklusive", "AI included"), (l, p) => esc(!l.ai ? T("Nur Profil, 1×", "Profile only, once") : p.aiIncludedCents > 0 && callCents > 0 ? T(`etwa ${count(requests(p.aiIncludedCents))} Anfragen`, `about ${count(requests(p.aiIncludedCents))} requests`) : T("Ja", "Yes"))],
      [T("Eigene KI-Agenten", "Custom AI agents"), (l) => esc(lim(l.agents))],
      [T("Aktive Automationen", "Active automations"), (l) => esc(String(l.activeAutomations))],
      [T("Automations-Läufe pro Monat", "Automation runs per month"), (l) => esc(l.automationRunsPerMonth === null ? T("Fair Use", "Fair use") : count(l.automationRunsPerMonth))],
      [T("Eigene Rollen und Rechte", "Custom roles and permissions"), (l) => (l.customRoles ? yes() : no())],
      [T("Support", "Support"), (l) => esc({ Normal: T("Standard", "Standard"), High: T("Bevorzugt", "Priority"), Urgent: T("Höchste Priorität", "Highest priority") }[l.supportPriority] || l.supportPriority)],
    ];
    $("[data-compare-table]").innerHTML = `<caption class="sr-only">${T("Grenzen der Tarife im Vergleich", "Plan limits compared")}</caption>
      <colgroup><col class="is-first">${plans.map(() => "<col>").join("")}</colgroup>
      <thead><tr><th scope="col"><span class="xs-mono">${T("Tarif", "Plan")}</span></th>${plans.map((p) => `<th scope="col" data-name="${esc(p.name)}" data-id="${esc(p.id)}"${company(p) ? ' class="is-co"' : ""}><button type="button" class="xp-th" data-pick="${esc(p.id)}"><b data-no-i18n>${esc(p.name)}</b><small data-th-price data-no-i18n></small></button></th>`).join("")}</tr></thead>
      <tbody>${rows.map(([label, fn]) => `<tr><th scope="row">${label}</th>${plans.map((p) => `<td>${p.limits ? fn(p.limits, p) : "–"}</td>`).join("")}</tr>`).join("")}</tbody>`;
    cmpWrap.classList.remove("is-loading");
    cmp.dress();
  }
  function paintCompare() {
    const cur = current();
    cmp.select(plans.indexOf(cur));
    document.querySelectorAll("[data-compare-table] thead th[data-id]").forEach((th) => {
      const p = plans.find((q) => q.id === th.dataset.id);
      const pr = price(p);
      th.querySelector("[data-th-price]").textContent = `${pr.amount}${pr.unit ? ` ${pr.unit}` : ""}`;
      th.querySelector("button").setAttribute("aria-pressed", String(p === cur));
    });
  }

  // ---- Zusammenspiel --------------------------------------------------------------------
  function paint() {
    if (!plans) return;
    paintStairs();
    paintPlan();
    paintCredit();
    paintCompare();
  }
  function pick(id) {
    picked = id === recommend().id ? null : id;
    paint();
  }
  function render() {
    if (!plans) return;
    $("[data-plans-status]").textContent = "";
    $("[data-stage]").classList.remove("is-failed");
    renderStairs();
    renderCompare();
    paintAsk();
    paint();
    X.watch();
  }
  function paintAsk() {
    const n = people();
    $("[data-people-n]").textContent = n === PEOPLE[PEOPLE.length - 1] ? `${count(n)}+` : count(n);
    $("[data-people-unit]").textContent = n === 1 ? T("nur du", "just you") : T("Leute", "people");
    range.style.setProperty("--p", ((Number(range.value) / (PEOPLE.length - 1)) * 100).toFixed(2));
    range.setAttribute("aria-valuetext", n === 1 ? T("1 Person, nur du", "1 person, just you") : T(`${count(n)} Leute`, `${count(n)} people`));
    $("[data-ai-text]").textContent = needAi ? T("Ja", "Yes") : T("Nein", "No");
  }

  range.addEventListener("input", () => { picked = null; paintAsk(); paint(); });
  $("[data-ai]").addEventListener("click", (e) => {
    needAi = !needAi;
    e.currentTarget.setAttribute("aria-checked", String(needAi));
    picked = null;
    paintAsk();
    paint();
  });
  const cycleSeg = X.seg($("[data-cycle]"), (v) => { cycle = v; paint(); });
  stairs.addEventListener("click", (e) => {
    const li = e.target.closest(".xp-step[data-id]");
    if (li && plans) pick(li.dataset.id);
  });
  panel.addEventListener("click", (e) => { if (e.target.closest("[data-back]")) { picked = null; paint(); } });
  $("[data-compare-table]").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (b && plans) pick(b.dataset.pick);
  });
  $("[data-finder]").addEventListener("submit", (e) => e.preventDefault());
  if ("ResizeObserver" in window) new ResizeObserver(() => placeYou()).observe(stairs);
  document.fonts?.ready.then(placeYou);

  async function load() {
    try {
      const res = await fetch(`${X.api()}/billing/plans`, { headers: { "accept-language": en() ? "en" : "de" } });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data?.plans) || !json.data.plans.length) throw new Error("plans");
      plans = json.data.plans;
      callCents = Number(json.data.ai?.callCents) || 0;
      packs = Array.isArray(json.data.ai?.packs) ? json.data.ai.packs.map(Number) : [];
      packCredits = Array.isArray(json.data.ai?.packCredits) ? json.data.ai.packCredits : [];
      render();
      cycleSeg.place();
    } catch {
      // Server nicht erreichbar: Treppe bleibt als Umriss stehen, dazu Neu laden und E-Mail.
      plans = null;
      $("[data-stage]").classList.add("is-failed");
      stairs.classList.remove("is-loading");
      you.hidden = true;
      $("[data-plans-status]").innerHTML = `${T("Die Tarife konnten gerade nicht geladen werden.", "The plans couldn't be loaded right now.")} <a href="/preise">${T("Neu laden", "Reload")}</a> · <a href="mailto:admin@xyntal.com" data-no-i18n>admin@xyntal.com</a>`;
      panel.hidden = true;
      for (const s of ["[data-credit]", "[data-compare]"]) { const el = $(s); if (el) el.hidden = true; }
    }
  }

  X.faq($("[data-faq]"));
  X.watch();
  paintAsk();
  // Sprache gewechselt: Texte des Servers kommen in der anderen Sprache neu
  document.addEventListener("xyntal:lang", () => { panel.hidden = false; for (const s of ["[data-credit]", "[data-compare]"]) { const el = $(s); if (el) el.hidden = false; } load(); });
  load();
})();
