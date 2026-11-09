// Firmen-Seite (/unternehmen): Ersparnis-Rechner, Firmentarife und Anfrage für 30 Tage Test.
// Tarife kommen wie auf /preise vom App-Server (GET /billing/plans); fällt er aus, rechnet die
// Seite mit dem Stand unten weiter, damit der Rechner nie leer bleibt. Die Anfrage geht an
// POST /site/sales-inquiry; ist der Server nicht erreichbar, öffnet sich eine fertige E-Mail.
// Alles, was auf der Seite einen Preis zeigt – Einstieg, Balken, Kostenkurve, Tarifblatt –
// liest denselben Stand des Rechners (state()).
(() => {
  const X = window.XyTarife;
  const calc = document.querySelector("[data-calc]");
  const sheet = document.querySelector("[data-sheet]");
  if (!X || !calc || !sheet) return;
  const { en, T, esc, euro, count, clamp, calm, loc } = X;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const euroRound = (cents) => euro(Math.round(cents / 100) * 100, 0);
  let signedIn = false;
  try { signedIn = !!localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token") || !!localStorage.getItem("sb-db-auth-token"); } catch { /* privat */ }

  // Stand des Katalogs (server/src/billing/routes.ts), nur als Rückfall ohne Server.
  const FALLBACK = [
    { id: "Free", name: "Free", priceCents: 0, yearlyPriceCents: 0, limits: { membersPerWorkspace: 5 } },
    { id: "Plus", name: "Plus", priceCents: 1200, yearlyPriceCents: 12000, limits: { membersPerWorkspace: 15 } },
    { id: "Pro", name: "Pro", priceCents: 2900, yearlyPriceCents: 29000, limits: { membersPerWorkspace: 25 } },
    { id: "Ultra", name: "Ultra", priceCents: 7900, yearlyPriceCents: 79000, blurb: "Für kleine Firmen, die auf Xyntal laufen.", features: [], limits: { membersPerWorkspace: 100 } },
    { id: "Business", name: "Business", priceCents: 29900, quarterlyPriceCents: 89700, intervals: ["quarter", "year"], businessOnly: true, trialDays: 30, yearlyPriceCents: 299000, blurb: "Für mittlere Firmen: das ganze Team an einem Ort.", features: [], limits: { membersPerWorkspace: 300 } },
    { id: "Enterprise", name: "Enterprise", priceCents: 0, yearlyPriceCents: 990000, yearlyOnly: true, contactSales: true, blurb: "Für große Organisationen: ein Vertrag, alle Teams an Bord.", features: [], limits: { membersPerWorkspace: null } },
    { id: "Enterprise+", name: "Enterprise+", priceCents: 0, yearlyPriceCents: 2400000, yearlyOnly: true, contactSales: true, blurb: "Für Firmengruppen und eigene Vertragsbedingungen.", features: [], limits: { membersPerWorkspace: null } },
  ];
  const COMPANY = ["Ultra", "Business", "Enterprise", "Enterprise+"];
  const ENTERPRISE_SEATS = 750; // so weit reicht der Einstiegspreis von Enterprise (Fragen unten)
  let plans = FALLBACK;
  let live = false;
  let callCents = 0;

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
  const out = (k) => $(`[data-out-${k}]`);
  const field = (n) => calc.elements.namedItem(n);
  const warn = $("[data-calc-warn]");
  const TOOLS = ["chat", "pm", "wiki", "ai", "files"];
  const TOOL_NAME = {
    chat: () => T("Chat und Anrufe", "Chat and calls"), pm: () => T("Projekte und Aufgaben", "Projects and tasks"), wiki: () => T("Notizen und Wiki", "Notes and wiki"),
    ai: () => T("KI-Abo", "AI subscription"), files: () => T("Dateien und Speicher", "Files and storage"),
  };
  function people() {
    const n = Number.parseInt(field("people").value, 10);
    return Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 0;
  }
  // Der ganze Stand des Rechners an einer Stelle.
  function state() {
    const n = people();
    let perHead = 0;
    let capped = false;
    const tools = TOOLS.map((key) => {
      const on = field(`t-${key}`).checked;
      let c = Number.parseFloat(String(field(`c-${key}`).value).replace(",", "."));
      const tooHigh = on && Number.isFinite(c) && c > MAX_PER_HEAD;
      if (tooHigh) { c = MAX_PER_HEAD; capped = true; }
      const price = Number.isFinite(c) && c > 0 ? c : 0;
      if (on) perHead += price;
      return { key, on, price, tooHigh };
    });
    const today = Math.round(n * perHead * 100); // Cent im Monat
    const plan = n > 0 ? pick(n) : null;
    const yearly = plan ? plan.yearlyPriceCents : 0;
    const monthly = Math.round(yearly / 12);
    return { n, perHead, capped, tools, today, plan, yearly, monthly, save: today * 12 - yearly };
  }
  function scopeText(plan) {
    const max = members(plan);
    return max ? T(`fester Preis für bis zu ${count(max)} Leute`, `fixed price for up to ${count(max)} people`)
      : plan.id === "Enterprise" ? T(`Jahresvertrag, Einstiegspreis gilt bis ${count(ENTERPRISE_SEATS)} Leute`, `annual contract, entry price covers up to ${count(ENTERPRISE_SEATS)} people`)
      : T("Jahresvertrag, Angebot nach Größe", "annual contract, quoted by size");
  }
  let srTimer = 0;
  function update() {
    const s = state();
    const { n, perHead, plan } = s;
    for (const t of s.tools) {
      const row = field(`t-${t.key}`).closest(".xu-tool");
      row.classList.toggle("is-off", !t.on);
      row.classList.toggle("is-capped", t.tooHigh);
    }
    warn.hidden = !s.capped;
    warn.textContent = s.capped
      ? T(`Mehr als ${MAX_PER_HEAD} € pro Kopf und Tool? Bitte den Preis pro Person eintragen, nicht die Summe fürs ganze Team. Wir rechnen hier mit höchstens ${MAX_PER_HEAD} €.`,
          `More than €${MAX_PER_HEAD} per person and tool? Please enter the price per person, not the total for the whole team. We count at most €${MAX_PER_HEAD} here.`)
      : "";
    out("today").textContent = n > 0 ? T(`${euroRound(s.today)} im Monat`, `${euroRound(s.today)} a month`) : "–";
    out("today-how").textContent = n > 0
      ? T(`${count(n)} ${n === 1 ? "Person" : "Personen"} × ${euro(Math.round(perHead * 100))} pro Kopf`, `${count(n)} ${n === 1 ? "person" : "people"} × ${euro(Math.round(perHead * 100))} per person`)
      : T("Tragt oben ein, wie viele ihr seid.", "Enter above how many you are.");
    const note = out("note");
    note.hidden = !field("t-ai").checked;
    note.textContent = T("Die KI in Xyntal läuft über ein gemeinsames Budget pro Monat statt über ein Abo pro Kopf. Wer viel KI nutzt, lädt Guthaben auf.",
      "AI in Xyntal runs on one shared monthly budget instead of a subscription per person. Heavy users top up credit.");
    const saveEl = out("save");
    const range = field("peopleRange");
    range.style.setProperty("--p", (((clamp(n, 10, 1000) - 10) / 990) * 100).toFixed(2));
    range.setAttribute("aria-valuetext", T(`${count(n)} Personen`, `${count(n)} people`));
    paintFold(s);
    drawChart(s);
    if (!plan) {
      out("xyntal").textContent = "–"; out("plan").textContent = ""; saveEl.textContent = "–"; saveEl._n = undefined;
      setBars(0, 0); paintRec(s);
      return;
    }
    const from = plan.contactSales ? T("ab ", "from ") : "";
    out("xyntal").textContent = T(`${from}${euroRound(s.monthly)} im Monat`, `${from}${euroRound(s.monthly)} a month`);
    const scope = scopeText(plan);
    out("plan").textContent = plan.contactSales
      ? T(`${plan.name} · ${scope}`, `${plan.name} · ${scope}`)
      : T(`${plan.name} · ${scope}, bei jährlicher Zahlung`, `${plan.name} · ${scope}, billed yearly`);
    const save = s.save;
    saveEl.parentElement.classList.toggle("is-zero", save <= 0);
    if (save > 0) X.tween(saveEl, save, (v) => { saveEl.textContent = euroRound(v); });
    else { saveEl._n = 0; saveEl.textContent = T("nichts", "nothing"); }
    if (save <= 0 && n > 0) {
      note.hidden = false;
      note.textContent = T("Bei so wenigen Tools oder Leuten spart ihr mit Xyntal kein Geld – dann lohnt es sich eher, weil alles an einem Ort ist.",
        "With this few tools or people you won't save money with Xyntal – the gain is having everything in one place.");
    }
    setBars(s.today, s.monthly);
    paintRec(s);
    clearTimeout(srTimer);
    srTimer = setTimeout(() => {
      $("[data-out-sr]").textContent = save > 0
        ? T(`Ihr spart im Jahr etwa ${euroRound(save)}. Heute ${euroRound(s.today)} im Monat, mit Xyntal ${from}${euroRound(s.monthly)} im Monat (${plan.name}).`, `You save about ${euroRound(save)} a year. Today ${euroRound(s.today)} a month, with Xyntal ${from}${euroRound(s.monthly)} a month (${plan.name}).`)
        : T("Mit diesen Angaben spart ihr kein Geld.", "With these numbers you don't save money.");
    }, 600);
    const sel = $("[data-inquiry] [name=plan]");
    if (sel && !sel.dataset.touched) sel.value = ["Business", "Enterprise"].includes(plan.id) ? plan.id : "";
    const size = $("[data-inquiry] [name=size]");
    if (size && !size.dataset.touched) size.value = String(n);
  }
  // Zwei Balken auf einer Skala: der längere füllt die Breite, der andere steht im Verhältnis dazu.
  function setBars(today, xyntal) {
    const max = Math.max(today, xyntal, 1);
    $('[data-bar="today"] i').style.setProperty("--v", (today / max).toFixed(4));
    $('[data-bar="xyntal"] i').style.setProperty("--v", (xyntal > 0 ? Math.max(xyntal / max, 0.006) : 0).toFixed(4));
  }
  calc.addEventListener("input", (e) => {
    if (e.target.name === "peopleRange") field("people").value = e.target.value;
    if (e.target.name === "people") field("peopleRange").value = String(Math.min(1000, Math.max(10, people())));
    update();
  });
  calc.addEventListener("submit", (e) => e.preventDefault());

  // Ergebnis weitergeben: als Text für die nächste Besprechung oder als Link, der den Rechner so öffnet.
  function shareUrl(s) {
    const t = s.tools.filter((x) => x.on).map((x) => `${x.key}-${x.price}`).join(",");
    return `${location.origin}${location.pathname}?n=${s.n}&t=${t}#rechner`;
  }
  $("[data-copy-result]")?.addEventListener("click", () => {
    const s = state();
    if (!s.plan) return;
    const from = s.plan.contactSales ? T("ab ", "from ") : "";
    const used = s.tools.filter((x) => x.on && x.price > 0).map((x) => `${TOOL_NAME[x.key]()} ${euro(Math.round(x.price * 100))}`).join(", ");
    const lines = [
      T(`Xyntal für ${count(s.n)} Leute`, `Xyntal for ${count(s.n)} people`),
      T(`Heute: ${euroRound(s.today)} im Monat (${used || "keine Tools gewählt"}, pro Kopf)`, `Today: ${euroRound(s.today)} a month (${used || "no tools selected"}, per person)`),
      T(`Mit Xyntal: ${from}${euroRound(s.monthly)} im Monat (${s.plan.name}, ${scopeText(s.plan)})`, `With Xyntal: ${from}${euroRound(s.monthly)} a month (${s.plan.name}, ${scopeText(s.plan)})`),
      s.save > 0 ? T(`Ersparnis im Jahr: etwa ${euroRound(s.save)}`, `Saved per year: about ${euroRound(s.save)}`) : T("Ersparnis im Jahr: keine", "Saved per year: none"),
      shareUrl(s),
    ];
    X.copy(lines.join("\n"), T("Ergebnis kopiert", "Result copied"));
  });
  $("[data-copy-link]")?.addEventListener("click", async () => {
    const s = state();
    const url = shareUrl(s);
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try { await navigator.share({ title: document.title, url }); return; } catch { /* abgebrochen: dann kopieren */ }
    }
    X.copy(url, T("Link kopiert", "Link copied"));
  });
  // Link mit ?n=120&t=chat-7,pm-10 öffnet den Rechner mit genau diesen Angaben.
  (function fromUrl() {
    const q = new URLSearchParams(location.search);
    const n = Number.parseInt(q.get("n"), 10);
    if (n > 0) { field("people").value = String(Math.min(n, 100000)); field("peopleRange").value = String(clamp(n, 10, 1000)); }
    if (q.has("t")) {
      const given = Object.fromEntries(q.get("t").split(",").map((x) => x.split("-")).filter((x) => TOOLS.includes(x[0])));
      for (const key of TOOLS) {
        field(`t-${key}`).checked = key in given;
        const c = Number.parseFloat(given[key]);
        if (key in given && Number.isFinite(c) && c >= 0) field(`c-${key}`).value = String(Math.min(c, MAX_PER_HEAD));
      }
    }
  })();

  // ---- Einstieg: fünf Werkzeuge werden eins -----------------------------------
  const fold = $("[data-fold]");
  let foldTouched = false;
  function paintFold(s) {
    if (!fold) return;
    for (const t of s.tools) {
      const li = $(`[data-tool="${t.key}"]`, fold);
      li.classList.toggle("is-off", !t.on);
      $("[data-tool-price]", li).textContent = euro(Math.round(Number(field(`c-${t.key}`).value.replace(",", ".")) * 100) || 0);
    }
    const from = s.plan?.contactSales ? T("ab ", "from ") : "";
    $("[data-fold-price]").textContent = s.plan ? T(`${from}${euroRound(s.monthly)} im Monat`, `${from}${euroRound(s.monthly)} a month`) : "–";
    $("[data-fold-today]").textContent = s.n > 0 ? T(`${count(s.n)} Leute × ${euro(Math.round(s.perHead * 100))} pro Kopf = ${euroRound(s.today)} im Monat`, `${count(s.n)} people × ${euro(Math.round(s.perHead * 100))} per person = ${euroRound(s.today)} a month`) : "";
    $("[data-fold-xyntal]").textContent = s.plan ? T(`${s.plan.name}: ${from}${euroRound(s.monthly)} im Monat für alle ${count(s.n)}`, `${s.plan.name}: ${from}${euroRound(s.monthly)} a month for all ${count(s.n)}`) : "";
  }
  // Wohin jede Kachel fällt: auf ihre Zeile im Arbeitsbereich.
  function measureFold() {
    if (!fold) return;
    const one = $(".xu-fold__one", fold);
    for (const li of $$("[data-tool]", fold)) {
      const row = $(`[data-row="${li.dataset.tool}"]`, one);
      const ul = row.parentElement;
      const tx = one.offsetLeft + ul.offsetLeft + row.offsetLeft + Math.min(row.offsetWidth / 2, 70);
      const ty = one.offsetTop + ul.offsetTop + row.offsetTop + row.offsetHeight / 2;
      li.style.setProperty("--dx", `${Math.round(tx - (li.offsetLeft + li.offsetWidth / 2))}px`);
      li.style.setProperty("--dy", `${Math.round(ty - (li.offsetTop + li.offsetHeight / 2))}px`);
    }
  }
  if (fold) {
    const seg = X.seg($("[data-fold-seg]"), (v) => { foldTouched = true; fold.classList.toggle("is-one", v === "xyntal"); });
    measureFold();
    if ("ResizeObserver" in window) new ResizeObserver(measureFold).observe($(".xu-fold__stage", fold));
    // Einmal von selbst: kurz die fünf zeigen, dann zusammenfallen lassen.
    if (!calm() && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        setTimeout(() => { if (!foldTouched) { fold.classList.add("is-one"); seg.set("xyntal"); } }, 1500);
      }, { threshold: 0.55 });
      io.observe(fold);
    }
  }

  // ---- Kostenkurve ---------------------------------------------------------------
  // Heute: eine Gerade, jede Person kostet dasselbe dazu. Xyntal: Stufen – innerhalb eines
  // Tarifs flach, erst an seiner Obergrenze der nächste. Der Strich steht bei eurer Teamgröße.
  const chart = $("[data-chart]");
  const plot = $("[data-chart-plot]");
  const svg = $("[data-chart-svg]");
  function steps() {
    const self = plans.filter((p) => !p.contactSales && p.priceCents > 0 && typeof members(p) === "number").sort((a, b) => members(a) - members(b));
    const list = [];
    let from = 1;
    for (const p of self) { list.push({ from, to: members(p), cents: Math.round(p.yearlyPriceCents / 12), name: p.name }); from = members(p) + 1; }
    const ent = plans.find((p) => p.id === "Enterprise");
    if (ent) list.push({ from, to: ENTERPRISE_SEATS, cents: Math.round(ent.yearlyPriceCents / 12), name: ent.name });
    return list;
  }
  const NICE_X = [50, 100, 150, 200, 300, 400, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 20000, 50000, 100000, 200000];
  function niceStep(max, ticks) {
    const raw = max / ticks;
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw) || raw;
  }
  function drawChart(s) {
    if (!chart || !plot.clientWidth) return;
    const W = plot.clientWidth, H = plot.clientHeight;
    const m = { l: 2, r: 2, t: 22, b: 28 };
    const st = steps();
    const xmax = NICE_X.find((v) => v >= Math.max(s.n * 1.6, 100)) || Math.ceil(s.n * 1.6);
    const xyAt = (n) => (st.find((q) => n <= q.to) || st[st.length - 1] || { cents: 0 }).cents;
    const todayAt = (n) => n * s.perHead * 100;
    const ymaxRaw = Math.max(todayAt(xmax), xyAt(xmax), 100) * 1.08;
    const yStep = niceStep(ymaxRaw / 100, 4) * 100;
    const ymax = Math.ceil(ymaxRaw / yStep) * yStep;
    const x = (n) => m.l + (n / xmax) * (W - m.l - m.r);
    const y = (c) => H - m.b - (c / ymax) * (H - m.t - m.b);
    const f = (v) => v.toFixed(1);
    let g = `<defs><linearGradient id="xu-cg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#B36BFF"/><stop offset=".5" stop-color="#3A8AFF"/><stop offset="1" stop-color="#3FE0F0"/></linearGradient><linearGradient id="xu-ca" gradientUnits="userSpaceOnUse" x1="0" y1="${m.t}" x2="0" y2="${H - m.b}"><stop offset="0" stop-color="rgba(63,224,240,.16)"/><stop offset="1" stop-color="rgba(63,224,240,0)"/></linearGradient></defs>`;
    for (let c = yStep; c <= ymax + 1; c += yStep) g += `<line class="c-grid" x1="${m.l}" x2="${W - m.r}" y1="${f(y(c))}" y2="${f(y(c))}"/><text x="${m.l + 2}" y="${f(y(c) - 6)}">${esc(euro(c, 0))}</text>`;
    g += `<line class="c-axis" x1="${m.l}" x2="${W - m.r}" y1="${f(y(0))}" y2="${f(y(0))}"/>`;
    const xStep = niceStep(xmax, W < 520 ? 4 : 5);
    for (let n = xStep; n < xmax - xStep * 0.45; n += xStep) g += `<line class="c-axis" x1="${f(x(n))}" x2="${f(x(n))}" y1="${f(y(0))}" y2="${f(y(0) + 5)}"/><text x="${f(x(n))}" y="${H - 6}" text-anchor="middle">${esc(count(n))}</text>`;
    g += `<line class="c-axis" x1="${f(x(xmax))}" x2="${f(x(xmax))}" y1="${f(y(0))}" y2="${f(y(0) + 5)}"/><text x="${f(x(xmax))}" y="${H - 6}" text-anchor="end">${esc(count(xmax))} ${T("Leute", "people")}</text>`;
    // Xyntal: Stufen bis zur Grenze des Einstiegspreises, dahinter gestrichelt (Angebot nach Größe)
    let d = "", prevY = null, lastX = m.l;
    const labels = [];
    for (const q of st) {
      if (q.from > xmax) break;
      const x0 = x(Math.max(q.from - 1, 0)), x1 = x(Math.min(q.to, xmax)), yy = y(q.cents);
      d += prevY === null ? `M${f(x0)} ${f(yy)}` : `V${f(yy)}`;
      d += `H${f(x1)}`;
      if (x1 - x0 > 54) labels.push(`<text class="c-plan c-late" x="${f(Math.min(x0 + 6, W - 60))}" y="${f(yy - 8)}">${esc(q.name)}</text>`);
      prevY = yy; lastX = x1;
    }
    // Fläche zwischen den Linien: das ist die Ersparnis
    if (s.perHead > 0 && d) {
      const cross = st.map((q) => q.cents / (s.perHead * 100)).find((n, i) => n >= (st[i].from - 1) && n <= st[i].to);
      const startN = clamp(cross ?? 0, 0, xmax);
      let area = `M${f(x(startN))} ${f(y(todayAt(startN)))} L${f(lastX)} ${f(y(todayAt(lastX === x(xmax) ? xmax : Math.min(st[st.length - 1].to, xmax))))}`;
      const back = st.filter((q) => q.from <= xmax && q.to >= startN).reverse();
      for (const q of back) area += ` L${f(x(Math.min(q.to, xmax)))} ${f(y(q.cents))} L${f(x(Math.max(q.from - 1, startN)))} ${f(y(q.cents))}`;
      g += `<path class="c-area c-late" d="${area} Z"/>`;
    }
    if (lastX < x(xmax) - 1) g += `<path class="c-xy-open c-late" d="M${f(lastX)} ${f(prevY)} H${f(x(xmax))}"/><text class="c-late" x="${f(Math.min(lastX + 8, W - 150))}" y="${f(prevY - 8)}">${T("Angebot nach Größe", "quoted by size")}</text>`;
    if (s.perHead > 0) g += `<path class="c-today" pathLength="1" d="M${f(x(0))} ${f(y(0))} L${f(x(xmax))} ${f(y(todayAt(xmax)))}"/>`;
    if (d) g += `<path class="c-xy" pathLength="1" d="${d}"/>`;
    g += labels.join("");
    // Marke bei der eigenen Teamgröße
    if (s.n > 0 && s.plan) {
      const mx = x(Math.min(s.n, xmax)), yt = y(todayAt(s.n)), yx = y(s.monthly);
      const right = mx < W * 0.62;
      const tx = right ? mx + 10 : mx - 10, anchor = right ? "start" : "end";
      g += `<g class="c-late"><line class="c-mark" x1="${f(mx)}" x2="${f(mx)}" y1="${m.t - 8}" y2="${f(y(0))}"/>`;
      if (s.save > 0) g += `<line class="c-gap" x1="${f(mx)}" x2="${f(mx)}" y1="${f(yt)}" y2="${f(yx)}"/>`;
      if (s.perHead > 0) g += `<circle class="c-dot-t" cx="${f(mx)}" cy="${f(yt)}" r="4.5"/><text class="c-label" x="${f(tx)}" y="${f(clamp(yt - 8, m.t + 2, H))}" text-anchor="${anchor}">${esc(T(`Heute ${euroRound(s.today)}`, `Today ${euroRound(s.today)}`))}</text>`;
      g += `<circle class="c-dot-x" cx="${f(mx)}" cy="${f(yx)}" r="5"/><text class="c-label" x="${f(tx)}" y="${f(yx - 9)}" text-anchor="${anchor}">${esc(`Xyntal ${euroRound(s.monthly)}`)}</text>`;
      if (s.save > 0 && Math.abs(yt - yx) > 44) g += `<text class="c-save" x="${f(tx)}" y="${f((yt + yx) / 2 + 4)}" text-anchor="${anchor}">${esc(T(`− ${euroRound(s.today - s.monthly)} im Monat`, `− ${euroRound(s.today - s.monthly)} a month`))}</text>`;
      g += "</g>";
    }
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = g;
    $("[data-chart-alt]").textContent = s.plan
      ? T(`Bei ${count(s.n)} Leuten: heute ${euroRound(s.today)} im Monat, mit Xyntal ${euroRound(s.monthly)} im Monat. Die Kosten pro Kopf steigen mit jeder Person, der Xyntal-Preis bleibt innerhalb eines Tarifs gleich.`,
          `At ${count(s.n)} people: today ${euroRound(s.today)} a month, with Xyntal ${euroRound(s.monthly)} a month. Per-head costs rise with every person, the Xyntal price stays the same within a plan.`)
      : "";
  }
  if (chart) {
    if ("ResizeObserver" in window) new ResizeObserver(() => drawChart(state())).observe(plot);
    if (calm() || !("IntersectionObserver" in window)) chart.classList.add("is-in");
    else {
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        chart.classList.add("is-in", "is-draw");
        setTimeout(() => chart.classList.remove("is-draw"), 2000);
      }, { threshold: 0.3 });
      io.observe(chart);
    }
  }

  // ---- Zusammenhang: Linien zwischen den Bereichen ---------------------------------
  const net = $("[data-net]");
  const LINKS = [["pm", "chat"], ["files", "pm"], ["ai", "pm"], ["ai", "chat"]];
  function drawNet() {
    if (!net) return;
    const lines = $("[data-net-svg]");
    if (getComputedStyle(lines).display === "none") return;
    const R = net.getBoundingClientRect();
    const hub = $("[data-hub]").getBoundingClientRect();
    const hx = hub.left - R.left + hub.width / 2, hy = hub.top - R.top + hub.height / 2, hr = hub.width / 2;
    const box = (id) => { const r = $(`[data-node="${id}"]`, net).getBoundingClientRect(); return { l: r.left - R.left, r: r.right - R.left, y: r.top - R.top + r.height / 2 }; };
    let g = "";
    $$("[data-node]", net).forEach((el, k) => {
      const b = box(el.dataset.node);
      const left = b.r < hx;
      const x0 = left ? b.r : b.l, x1 = hx + (left ? -hr : hr), mx = (x0 + x1) / 2;
      g += `<path data-for="${el.dataset.node}" pathLength="1" style="--k:${k}" d="M${x0.toFixed(1)} ${b.y.toFixed(1)} C${mx.toFixed(1)} ${b.y.toFixed(1)} ${mx.toFixed(1)} ${hy.toFixed(1)} ${x1.toFixed(1)} ${hy.toFixed(1)}"/>`;
    });
    const order = $$(".xu-net__col--a [data-node]", net).map((el) => el.dataset.node);
    LINKS.forEach(([a, b], k) => {
      const A = box(a), B = box(b);
      const depth = 10 + 13 * Math.abs(order.indexOf(a) - order.indexOf(b));
      g += `<path class="is-x" data-link="${a}-${b}" pathLength="1" style="--k:${8 + k}" d="M${A.l.toFixed(1)} ${A.y.toFixed(1)} C${(A.l - depth * 1.6).toFixed(1)} ${A.y.toFixed(1)} ${(B.l - depth * 1.6).toFixed(1)} ${B.y.toFixed(1)} ${B.l.toFixed(1)} ${B.y.toFixed(1)}"/>`;
    });
    lines.querySelectorAll("path").forEach((p) => p.remove());
    lines.insertAdjacentHTML("beforeend", g);
    const defs = lines.querySelector("linearGradient");
    defs?.setAttribute("y2", String(Math.round(R.height)));
  }
  function hot(links, nodes) {
    if (!net) return;
    net.classList.toggle("is-busy", links.length + nodes.length > 0);
    $$("path", net).forEach((p) => p.classList.toggle("is-hot", links.includes(p.dataset.link) || nodes.includes(p.dataset.for) || (!!p.dataset.link && nodes.some((n) => p.dataset.link.split("-").includes(n)))));
    const lit = new Set([...nodes, ...links.flatMap((l) => l.split("-"))]);
    $$("[data-node]", net).forEach((el) => el.classList.toggle("is-hot", lit.has(el.dataset.node)));
    $$("[data-link]", net).forEach((b) => { if (b.tagName === "BUTTON") b.classList.toggle("is-hot", links.length > 0 && b.dataset.link.split(" ").every((l) => links.includes(l))); });
  }
  if (net) {
    drawNet();
    if ("ResizeObserver" in window) new ResizeObserver(drawNet).observe(net);
    document.fonts?.ready.then(drawNet);
    let netTouched = false;
    net.addEventListener("pointerover", (e) => {
      const node = e.target.closest("[data-node]"), btn = e.target.closest("button[data-link]");
      if (node) { netTouched = true; hot([], [node.dataset.node]); }
      else if (btn) { netTouched = true; hot(btn.dataset.link.split(" "), []); }
    });
    net.addEventListener("pointerleave", () => hot([], []));
    net.addEventListener("focusin", (e) => { const btn = e.target.closest("button[data-link]"); if (btn) { netTouched = true; hot(btn.dataset.link.split(" "), []); } });
    net.addEventListener("focusout", () => hot([], []));
    net.addEventListener("click", (e) => { const btn = e.target.closest("button[data-link]"); if (btn) { netTouched = true; hot(btn.dataset.link.split(" "), []); } });
    // Einmal vorführen: die drei Sätze nacheinander, jeweils mit ihrer Linie.
    if (!calm() && "IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const says = $$("button[data-link]", net);
        says.forEach((b, i) => setTimeout(() => { if (!netTouched) hot(b.dataset.link.split(" "), []); }, 1500 + i * 1500));
        setTimeout(() => { if (!netTouched) hot([], []); }, 1500 + says.length * 1500);
      }, { threshold: 0.45 });
      io.observe(net);
    }
  }

  // ---- Sicherheit: Schichten als Reiter ---------------------------------------------
  const layers = $("[data-layers]");
  if (layers) {
    const tabs = $$('[role="tab"]', layers);
    const plates = $$("[data-plate]", layers);
    const select = (i, focus) => {
      tabs.forEach((t, k) => {
        t.setAttribute("aria-selected", String(k === i));
        t.tabIndex = k === i ? 0 : -1;
        $(`#${t.getAttribute("aria-controls")}`).hidden = k !== i;
      });
      plates.forEach((p) => { const k = Number(p.dataset.plate); p.classList.toggle("is-on", k === i); p.classList.toggle("is-above", k < i); });
      if (focus) tabs[i].focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => select(i));
      t.addEventListener("keydown", (e) => {
        const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        select((to + tabs.length) % tabs.length, true);
      });
    });
    plates.forEach((p) => p.addEventListener("click", () => select(Number(p.dataset.plate))));
    select(0);
  }

  // ---- Firmentarife: ein Blatt ----------------------------------------------------------
  const cmp = X.table($("[data-cmp]"));
  const companyPlans = () => COMPANY.map((id) => plans.find((p) => p.id === id)).filter(Boolean);
  function priceParts(p) {
    // „Pro Person“ nur, wo die Größe feststeht: bei der Obergrenze des Tarifs, bei Enterprise
    // für den Einstiegspreis (bis 750 Leute). Enterprise+ wird nach Umfang angeboten.
    const n = members(p) ? members(p) : p.id === "Enterprise" ? ENTERPRISE_SEATS : 0;
    const per = n > 0
      ? T(`≈ ${euro(Math.round(p.yearlyPriceCents / 12 / n), 2)} pro Person und Monat bei ${n.toLocaleString(loc())} Leuten`, `≈ ${euro(Math.round(p.yearlyPriceCents / 12 / n), 2)} per person a month for ${n.toLocaleString(loc())} people`)
      : T("Preis nach Umfang", "Priced by scope");
    if (p.contactSales) return { amount: `${T("ab ", "from ")}${euro(p.yearlyPriceCents)}`, sub: T("pro Jahr · Jahresvertrag auf Rechnung", "per year · annual contract, by invoice"), per };
    if (Array.isArray(p.intervals) && !p.intervals.includes("month") && p.quarterlyPriceCents > 0) {
      return { amount: euro(p.quarterlyPriceCents), sub: T(`pro Quartal · oder ${euro(p.yearlyPriceCents)} im Jahr${p.trialDays > 0 ? " · 30 Tage kostenlos" : ""}`, `per quarter · or ${euro(p.yearlyPriceCents)} a year${p.trialDays > 0 ? " · 30 days free" : ""}`), per };
    }
    return { amount: euro(p.priceCents), sub: T(`pro Monat · oder ${euro(p.yearlyPriceCents)} im Jahr`, `per month · or ${euro(p.yearlyPriceCents)} a year`), per };
  }
  function ctaHtml(p) {
    if (p.contactSales) return `<a class="xs-tlink" href="#anfrage" data-ask="${esc(p.id)}">${T("Angebot anfragen", "Request a quote")}</a>`;
    // Ultra lässt sich nicht kostenlos testen – nur direkt buchen.
    if (p.id === "Ultra") {
      return signedIn
        ? `<a class="xs-tlink" href="/tarif">${esc(T(`${p.name} buchen`, `Get ${p.name}`))}</a>`
        : `<a class="xs-tlink" href="/beta">${T("Erst für die Beta bewerben", "Apply for the beta first")}</a>`;
    }
    const buy = signedIn ? `<a class="xs-tlink" href="/tarif">${esc(T(`${p.name} buchen`, `Get ${p.name}`))}</a>` : "";
    return `<a class="xs-tlink" href="#anfrage" data-ask="${esc(p.id)}">${T("30 Tage kostenlos testen", "Try free for 30 days")}</a>${buy}`;
  }
  const LIVE = {
    members: (p) => (members(p) === null ? T("Unbegrenzt", "Unlimited") : count(members(p))),
    storage: (p) => X.bytes(p.limits.storageBytes),
    upload: (p) => X.bytes(p.limits.maxUploadBytes),
    ai: (p) => euro(p.aiIncludedCents) + (callCents > 0 ? ` · ${T(`etwa ${count(X.requests(p.aiIncludedCents, callCents))} Anfragen`, `about ${count(X.requests(p.aiIncludedCents, callCents))} requests`)}` : ""),
    automations: (p) => count(p.limits.activeAutomations),
    runs: (p) => (p.limits.automationRunsPerMonth === null ? T("Unbegrenzt (Fair Use)", "Unlimited (fair use)") : count(p.limits.automationRunsPerMonth)),
  };
  function render() {
    const list = companyPlans();
    // Kopf des Blatts: Name und Preis bleiben beim Scrollen stehen, darunter Einzelheiten und Buchung
    $$("thead th[data-plan]", sheet).forEach((th) => {
      const p = list.find((q) => q.id === th.dataset.plan);
      if (!p) return;
      th.innerHTML = `<div class="xu-ph"><b class="xu-ph__name" data-no-i18n>${esc(p.name)}</b><span class="xu-ph__price" data-no-i18n>${esc(priceParts(p).amount)}</span></div>`;
    });
    $("[data-more]", sheet)?.remove();
    sheet.querySelector("tbody").insertAdjacentHTML("beforebegin", `<tbody data-more><tr class="is-more"><th scope="row"><span class="sr-only">${T("Preis und Buchung", "Price and booking")}</span></th>${list.map((p) => {
      const pr = priceParts(p);
      return `<td data-plan="${esc(p.id)}"><div class="xu-pm"><span>${esc(pr.sub)}</span><em>${esc(pr.per)}</em><span>${esc(p.blurb || "")}</span><div class="xu-pm__cta">${ctaHtml(p)}</div></div></td>`;
    }).join("")}</tr></tbody>`);
    // Grenzen aus dem Katalog, wo der Server sie liefert; sonst bleibt der Stand aus der Seite stehen.
    if (live) {
      for (const tr of $$("tr[data-live]", sheet)) {
        const fn = LIVE[tr.dataset.live];
        list.forEach((p, i) => { const td = tr.children[i + 1]; if (td && p.limits && p.limits.storageBytes !== undefined) { try { td.textContent = fn(p); } catch { /* Feld fehlt: Stand der Seite bleibt */ } } });
      }
    }
    const trial = plans.find((p) => p.trialDays > 0)?.trialDays;
    if (trial) $(".xu-days")?.style.setProperty("--days", String(trial));
    const note = $("[data-plans-note]");
    note.hidden = live;
    note.innerHTML = live ? "" : `${T("Der App-Server ist gerade nicht erreichbar. Die Preise auf dieser Seite sind der letzte bekannte Stand.", "The app server can't be reached right now. The prices on this page are the last known state.")} <a href="/unternehmen">${T("Neu laden", "Reload")}</a> · <a href="mailto:admin@xyntal.com" data-no-i18n>admin@xyntal.com</a>`;
    cmp.dress();
    update();
  }
  function paintRec(s) {
    const rec = $("[data-rec]");
    const list = companyPlans();
    const plan = s.plan;
    const col = plan ? list.findIndex((p) => p.id === plan.id) : -1;
    cmp.select(col);
    if (!plan || !s.n) { rec.textContent = ""; return; }
    rec.innerHTML = col >= 0
      ? `<i aria-hidden="true"></i>${esc(T(`Für ${count(s.n)} Leute passt `, `For ${count(s.n)} people, `))}<b data-no-i18n>${esc(plan.name)}</b>${esc(T(".", " fits."))}`
      : `<i aria-hidden="true"></i>${esc(T(`Für ${count(s.n)} Leute reicht schon `, `For ${count(s.n)} people, `))}<b data-no-i18n>${esc(plan.name)}</b>${esc(T(" – ", " is already enough – "))}<a href="/preise">${T("zur Preisseite", "see pricing")}</a>`;
  }
  sheet.addEventListener("click", (e) => {
    const a = e.target.closest("[data-ask]");
    if (!a) return;
    const sel = $("[data-inquiry] [name=plan]");
    if (sel) { sel.value = ["Business", "Enterprise", "Enterprise+"].includes(a.dataset.ask) ? a.dataset.ask : ""; sel.dataset.touched = "1"; }
  });
  $("[data-print]")?.addEventListener("click", () => window.print());

  async function load() {
    try {
      const res = await fetch(`${X.api()}/billing/plans`, { headers: { "accept-language": en() ? "en" : "de" } });
      const json = await res.json();
      if (!res.ok || !Array.isArray(json.data?.plans)) throw new Error("plans");
      plans = json.data.plans;
      callCents = Number(json.data.ai?.callCents) || 0;
      live = true;
    } catch {
      plans = FALLBACK;
      callCents = 0;
      live = false;
    }
    render();
  }

  // ---- Anfrage --------------------------------------------------------------
  const form = $("[data-inquiry]");
  const status = $("[data-inquiry-status]");
  const done = $("[data-inquiry-done]");
  form?.addEventListener("input", (e) => {
    if (e.target.name === "plan" || e.target.name === "size") e.target.dataset.touched = "1";
    clearBad(e.target.name);
  });
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
  // Fehler stehen direkt am Feld; der Fokus springt dorthin.
  function clearBad(name) {
    const err = name && $(`[data-err="${name}"]`, form);
    if (!err) return;
    err.textContent = "";
    err.closest(".xu-field").classList.remove("is-bad");
    form.elements[name].removeAttribute("aria-invalid");
  }
  function bad(name) {
    const err = $(`[data-err="${name}"]`, form);
    err.textContent = FIELD_MSG[name]();
    err.closest(".xu-field").classList.add("is-bad");
    form.elements[name].setAttribute("aria-invalid", "true");
    form.elements[name].focus();
    say("");
  }
  function sending(on) {
    const btn = $("button[type=submit]", form);
    btn.disabled = on;
    btn.setAttribute("aria-busy", String(on));
    form.classList.toggle("is-sending", on);
    $("[data-submit-text]", form).textContent = on ? T("Wird gesendet …", "Sending …") : T("Anfrage senden", "Send request");
  }
  // Echte Bestätigung statt einer Zeile: was angekommen ist und wie es weitergeht.
  function success(d) {
    const rows = [
      [T("Firma", "Company"), d.company],
      [T("Antwort an", "Reply to"), d.email],
      [T("Team", "Team"), T(`${d.size} Leute`, `${d.size} people`)],
      [T("Tarif", "Plan"), d.plan || T("noch offen", "still open")],
      [T("30 Tage testen", "30-day trial"), d.pilot ? T("ja", "yes") : T("nein", "no")],
    ];
    $("[data-done-facts]").innerHTML = rows.map(([k, v]) => `<div><dt class="xs-mono">${esc(k)}</dt><dd data-no-i18n>${esc(v)}</dd></div>`).join("");
    form.reset();
    form.hidden = true;
    done.hidden = false;
    done.focus();
  }
  $("[data-inquiry-again]")?.addEventListener("click", () => {
    done.hidden = true;
    form.hidden = false;
    say("");
    update();
    form.elements.company.focus();
  });
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
    Object.keys(FIELD_MSG).forEach(clearBad);
    const local = d.company.length < 2 ? "company" : d.name.length < 2 ? "name" : !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.email) ? "email" : !(Number.parseInt(d.size, 10) > 0) ? "size" : null;
    if (local) { bad(local); return; }
    sending(true);
    say("");
    try {
      const res = await fetch(`${X.api()}/site/sales-inquiry`, { method: "POST", headers: { "content-type": "application/json", "accept-language": en() ? "en" : "de" }, body: JSON.stringify(d) });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        success(d);
      } else if (res.status === 400 && FIELD_MSG[json.error?.details?.field]) {
        sending(false);
        bad(json.error.details.field);
        return;
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
      sending(false);
    }
  });

  X.faq($("[data-faq]"));
  X.watch();
  document.addEventListener("xyntal:lang", load);
  render();
  load();
})();
