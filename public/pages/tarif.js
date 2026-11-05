// /tarif – Tarif und KI-Guthaben des App-Kontos, derselbe Stand wie in der App unter
// Einstellungen → Tarif (GET /billing des App-Servers). Aufladen, Upgrade und das Abo-Portal
// laufen über Stripe; der Server schickt den Browser danach mit ?checkout=… hierher zurück
// (nur auf eine Adresse aus WEBSITE_ORIGINS). Ein bezahlter Checkout wird beim nächsten
// GET /billing mit Stripe abgeglichen – ein Neuladen reicht, kein Webhook nötig.
(() => {
  const X = window.XyntalApp;
  const { esc, t } = X;
  const box = document.getElementById("billing");
  const notice = document.getElementById("notice");
  const returnTo = location.origin + location.pathname;
  let data = null, yearly = false, busy = false;

  const lang = () => (window.XyntalI18n ? window.XyntalI18n.get() : document.documentElement.lang === "en" ? "en" : "de");
  const locale = () => (lang() === "en" ? "en-GB" : "de-DE");
  // Einzelne KI-Aufrufe kosten Bruchteile eines Cents; Guthaben und Budget sind ganze Cent.
  const euro = (cents) => (Number(cents || 0) / 100).toLocaleString(locale(), { style: "currency", currency: "EUR" });
  const price = (cents) => {
    const v = Number(cents || 0) / 100;
    return v.toLocaleString(locale(), { style: "currency", currency: "EUR", minimumFractionDigits: v % 1 === 0 ? 0 : 2 });
  };
  const day = (iso) => {
    const d = new Date(iso || "");
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
  };
  // Budgets read as KI-Anfragen, not euros: the server says what one average request
  // costs (measured from real usage, or estimated). Rounded down so a promise never
  // overstates what the money buys.
  const requests = (cents, callCents) => {
    const n = callCents > 0 ? Math.floor(Number(cents || 0) / callCents) : 0;
    if (n < 20) return Math.max(0, n);
    const step = n < 100 ? 5 : n < 1000 ? 10 : 50;
    return Math.floor(n / step) * step;
  };
  // What is left is counted exactly: two requests out of ~775 must show, and the
  // rounded steps above would keep "770 von 770" until the sixth.
  const exactRequests = (cents, callCents) => (callCents > 0 ? Math.max(0, Math.floor(Number(cents || 0) / callCents)) : 0);
  const count = (n) => Number(n).toLocaleString(locale());
  // Tarifnamen sind Markennamen und bleiben unübersetzt. „Start“ ist die alte Id des
  // kostenlosen Tarifs (vor 2026-11) und wird wie „Free“ angezeigt.
  const planName = (id) => (id === "Start" ? "Free" : id);
  const say = (text, kind = "") => { notice.innerHTML = text ? `<p class="xm-status ${kind}" role="status">${esc(text)}</p>` : ""; };
  const fail = (err) => (err && err.message) || t("Das hat nicht geklappt. Versuch es gleich noch einmal.");

  // ---------- Bereiche ----------
  function planPanel(d) {
    const ai = d.ai || {};
    const free = d.plan === "Free" || d.plan === "Start";
    const status = d.locked
      ? t("Die letzte Zahlung ist nicht durchgegangen. Begleiche die Rechnung im Abo-Portal, dann ist Xyntal wieder frei.")
      : free
        ? t("Free ist kostenlos, so lange du willst. Bezahlte Tarife bringen mehr Arbeitsbereiche, Mitglieder, Speicher, Automationen und ein KI-Budget pro Monat.")
        : d.renewsAt
          ? t("Aktiv bis {date} – dann verlängert er sich, oder er endet, wenn er für eine feste Zeit gutgeschrieben wurde.").replace("{date}", day(d.renewsAt))
          : t("Aktiv ohne Enddatum.");
    return `
      <section class="xm-detail xm-billing">
        <div class="xm-billing-head">
          <h2>${esc(t("Dein Tarif"))}</h2>
          <span class="xm-pill xm-on" data-no-i18n>${esc(planName(d.plan))}</span>
          ${d.locked ? `<span class="xm-pill xm-warn">${esc(t("Zahlung überfällig"))}</span>` : ""}
        </div>
        <p class="xm-billing-text ${d.locked ? "xm-bad" : ""}">${esc(status)}</p>
        ${free ? "" : `<div class="xm-actions"><button class="btn btn-small btn-ghost" type="button" data-portal>${esc(t("Abo verwalten"))}</button></div>`}
        ${free || !ai ? "" : `<p class="xm-billing-hint">${esc(t("Tarif wechseln, Zahlungsmethode, Rechnungen und Kündigung findest du im Abo-Portal von Stripe."))}</p>`}
      </section>`;
  }

  function aiPanel(d) {
    const ai = d.ai || {};
    const call = Number(ai.callCents || 0);
    const included = Number(ai.includedCents || 0);
    const usedCents = Math.min(Number(ai.includedUsedCents || 0), included);
    const credit = Number(ai.creditCents || 0);
    const nearly = included > 0 && ai.reminderShare > 0 && Number(ai.includedUsedCents || 0) >= included * ai.reminderShare;
    const share = included > 0 ? Math.min(100, Math.round((usedCents / included) * 100)) : 0;
    // An older server sends no per-request cost: then the budget stays in euros
    // instead of reading "0 Anfragen".
    const asRequests = call > 0;
    const includedN = requests(included, call);
    const leftN = exactRequests(included - usedCents, call);
    const totalN = exactRequests(included, call);
    const creditN = requests(Math.max(0, credit), call);
    const intro = !asRequests
      ? (included > 0
        ? t("Xyntal AI zahlst du nach Verbrauch: {amount} pro Monat sind in deinem Tarif enthalten, darüber hinaus zahlt dein Guthaben.").replace("{amount}", euro(included))
        : t("Xyntal AI zahlst du nach Verbrauch: jeder Aufruf geht von deinem Guthaben ab."))
      : included > 0
        ? t("In deinem Tarif sind etwa {n} KI-Anfragen pro Monat enthalten. Brauchst du mehr, zahlt dein Guthaben.").replace("{n}", count(includedN))
        : t("Xyntal AI zahlst du nach Verbrauch: jede KI-Anfrage geht von deinem Guthaben ab.");
    const packs = (ai.packs || []).map((c) =>
      `<button class="btn btn-small" type="button" data-pack="${esc(c)}" ${d.configured ? "" : "disabled"}>${esc(asRequests
        ? t("{n} Anfragen für {amount}").replace("{n}", count(requests(c, call))).replace("{amount}", price(c))
        : t("{amount} aufladen").replace("{amount}", price(c)))}</button>`).join("");
    return `
      <section class="xm-detail xm-billing">
        <div class="xm-billing-head"><h2>${esc(t(asRequests ? "KI-Anfragen" : "KI-Guthaben"))}</h2></div>
        <p class="xm-billing-text">${esc(intro)}</p>
        <dl class="xm-billing-figures">
          ${included > 0 ? `
          <div><dt>${esc(t("Diesen Monat inklusive"))}</dt>
            <dd class="${nearly ? "xm-warn-text" : ""}">${esc(asRequests
              ? t("noch etwa {left} von {total}").replace("{left}", count(leftN)).replace("{total}", count(totalN))
              : t("{used} von {total} verbraucht").replace("{used}", euro(usedCents)).replace("{total}", euro(included)))}</dd>
            <div class="xm-billing-bar${nearly ? " xm-nearly" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${share}" aria-label="${esc(t("Inklusive Anfragen verbraucht"))}"><i style="width:${share}%"></i></div>
            <small>${esc(t("Setzt sich am {date} zurück.").replace("{date}", day(ai.resetsAt)))}</small>
          </div>` : ""}
          <div><dt>${esc(t("Aus deinem Guthaben"))}</dt>
            <dd class="${credit > 0 ? "" : "xm-warn-text"}">${esc(asRequests ? t("etwa {n} Anfragen").replace("{n}", count(creditN)) : euro(Math.max(0, credit)))}</dd>
            ${asRequests ? `<small>${esc(t("Guthaben: {amount}").replace("{amount}", euro(Math.max(0, credit))))}</small>` : ""}
          </div>
        </dl>
        ${nearly && ai.available ? `<p class="xm-billing-text xm-warn-text">${esc(credit > 0
          ? t("Die inklusiven Anfragen dieses Monats sind fast aufgebraucht – danach zahlt dein Guthaben.")
          : t("Die inklusiven Anfragen dieses Monats sind fast aufgebraucht – lade Guthaben auf, damit Xyntal AI danach weiterläuft."))}</p>` : ""}
        ${!ai.available && ai.reason ? `<p class="xm-billing-text xm-warn-text" data-no-i18n>${esc(ai.reason)}</p>` : ""}
        <div class="xm-actions">${packs}</div>
        ${d.configured ? "" : `<p class="xm-billing-hint">${esc(t("Zahlungen sind auf diesem Server noch nicht eingerichtet."))}</p>`}
        <p class="xm-billing-hint">${esc(t(ai.callEstimateMeasured
          ? "Eine Anfrage ist ein durchschnittlicher KI-Aufruf der letzten 30 Tage – eine Frage an den Assistenten, ein Agenten-Lauf oder eine Zusammenfassung. Aufgaben mit vielen Schritten zählen mehr, kurze Fragen weniger. Guthaben verfällt nie und wird nie automatisch abgebucht."
          : "Eine Anfrage ist ein geschätzter durchschnittlicher KI-Aufruf – eine Frage an den Assistenten, ein Agenten-Lauf oder eine Zusammenfassung. Aufgaben mit vielen Schritten zählen mehr, kurze Fragen weniger. Guthaben verfällt nie und wird nie automatisch abgebucht."))}</p>
      </section>`;
  }

  // Die Grenzen des Tarifs und was davon belegt ist – dieselben Zahlen, an denen der
  // App-Server prüft (entitlements + usage aus GET /billing). Ein älterer Server schickt
  // die Felder nicht; dann entfällt der Bereich.
  function limitsPanel(d) {
    const e = d.entitlements || {};
    if (e.activeAutomations === undefined) return "";
    const a = (d.usage && d.usage.automations) || { active: 0, runsThisMonth: 0 };
    const none = (n) => n === null || n === undefined;
    const limit = (n) => (none(n) ? t("Unbegrenzt") : count(n));
    const ofLimit = (used, n) => (none(n)
      ? t("{used} · ohne Grenze").replace("{used}", count(used))
      : t("{used} von {total}").replace("{used}", count(used)).replace("{total}", count(n)));
    const days = (n) => (none(n) ? t("Unbegrenzt") : n === 1 ? t("1 Tag") : t("{n} Tage").replace("{n}", count(n)));
    const feature = (on, from) => (on ? t("Inklusive") : t(from));
    const rows = [
      [t("Aktive Automationen"), ofLimit(a.active, e.activeAutomations), a.active >= e.activeAutomations],
      [t("Automations-Läufe diesen Monat"), ofLimit(a.runsThisMonth, e.automationRunsPerMonth), !none(e.automationRunsPerMonth) && a.runsThisMonth >= e.automationRunsPerMonth],
      [t("Automationen mit Zeitplan"), feature(e.scheduledAutomations, "Ab Plus")],
      [t("Freigaben und Rückgängig für Automationen"), feature(e.criticalAutomationActions, "Ab Pro")],
      [t("KI-Agenten"), limit(e.agents) + (e.hourlyAgents || e.agents === 0 ? "" : " " + t("· höchstens täglich"))],
      [t("Eigene Rollen und Ausnahmen"), feature(e.customRoles, "Ab Pro")],
      [t("Versionen je Datei"), limit(e.versionsPerFile)],
      [t("Lauf-Verlauf und Audit-Log"), days(e.historyDays)],
      [t("Aus dem Papierkorb wiederherstellen"), days(e.trashRestoreDays)],
      [t("Gemerkte Personen"), limit(e.savedMatches)],
    ];
    return `
      <section class="xm-detail xm-billing xm-billing-limits-wrap">
        <div class="xm-billing-head"><h2>${esc(t("Grenzen deines Tarifs"))}</h2></div>
        <p class="xm-billing-text">${esc(t("Grenzen halten nur Neues auf. Gelöscht wird nichts: Überzählige Automationen pausieren, ältere Versionen und Verlauf bleiben erhalten, und ein größerer Tarif bringt alles zurück."))}</p>
        <dl class="xm-billing-limits">${rows.map(([label, value, full]) =>
          `<div><dt>${esc(label)}</dt><dd class="${full ? "xm-warn-text" : ""}">${esc(value)}</dd></div>`).join("")}</dl>
      </section>`;
  }

  // Die Feature-Zeilen eines Tarifs, die KI-Budget-Zeile als Anfragen statt in Euro.
  function planFeatures(p, d) {
    const call = Number((d.ai || {}).callCents || 0);
    if (!p.aiBudgetLine || !(p.aiIncludedCents > 0) || !(call > 0)) return p.features || [];
    const line = t("etwa {n} KI-Anfragen pro Monat inklusive").replace("{n}", count(requests(p.aiIncludedCents, call)));
    return (p.features || []).map((f) => (f === p.aiBudgetLine ? line : f));
  }

  // Upgrade-Karten nur für Free: bezahlte Tarife wechseln im Abo-Portal (der Server lehnt
  // einen zweiten Checkout ab). Beschreibung und Feature-Zeilen kommen vom Server schon
  // in der Seitensprache, daher data-no-i18n.
  function plansPanel(d) {
    const free = d.plan === "Free" || d.plan === "Start";
    const plans = (d.plans || []).filter((p) => p.priceCents > 0 && p.contactSales !== true);
    if (!free || !plans.length) return "";
    const cards = plans.map((p) => {
      const full = yearly ? p.yearlyPriceCents : p.priceCents;
      const unit = t(yearly ? "/Jahr" : "/Monat");
      return `
        <article class="xm-person xm-plan">
          <div class="xm-billing-head"><h3 data-no-i18n>${esc(p.name)}</h3></div>
          <p class="xm-plan-price"><b>${esc(price(full))}</b>${esc(unit)}</p>
          <p class="xm-billing-text" data-no-i18n>${esc(p.blurb)}</p>
          <ul class="xm-plan-features" data-no-i18n>${planFeatures(p, d).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
          <div class="xm-actions"><button class="btn btn-small" type="button" data-upgrade="${esc(p.id)}" ${d.configured ? "" : "disabled"}>${esc(t("{plan} wählen").replace("{plan}", p.name))}</button></div>
        </article>`;
    }).join("");
    return `
      <div class="xm-billing-plans">
        <div class="xm-billing-head">
          <h2>${esc(t("Tarif upgraden"))}</h2>
          <div class="xm-tabs" role="group" aria-label="${esc(t("Abrechnung"))}">
            <button type="button" class="xm-chip" aria-pressed="${!yearly}" data-interval="month">${esc(t("Monatlich"))}</button>
            <button type="button" class="xm-chip" aria-pressed="${yearly}" data-interval="year">${esc(t("Jährlich – zwei Monate gratis"))}</button>
          </div>
        </div>
        <div class="xm-list">${cards}</div>
        <p class="xm-billing-hint">${esc(t("Endpreise. Es wird keine Umsatzsteuer berechnet (Kleinunternehmer nach § 19 UStG)."))}</p>
      </div>`;
  }

  function render() {
    if (!data) return;
    box.innerHTML = `<div class="xm-billing-grid">${planPanel(data)}${aiPanel(data)}</div>${limitsPanel(data)}${plansPanel(data)}`;
  }

  // ---------- Laden ----------
  async function load() {
    try {
      data = await X.api("GET", "/billing");
      render();
    } catch (err) {
      data = null;
      box.innerHTML = err && err.status === 401
        ? `<div class="xm-empty"><p>${esc(t("Logg dich ein, um deinen Tarif und dein KI-Guthaben zu sehen."))}</p><a class="btn btn-small" href="/login?next=tarif">${esc(t("Einloggen"))}</a></div>`
        : `<div class="xm-empty"><p>${esc(fail(err))}</p><button class="btn btn-small btn-ghost" type="button" data-retry>${esc(t("Noch einmal versuchen"))}</button></div>`;
    }
  }

  // Ein Checkout oder das Portal öffnet Stripe im selben Tab; danach kommt man hierher zurück.
  async function go(path, body, button) {
    if (busy) return;
    busy = true;
    if (button) { button.disabled = true; button.textContent = t("Weiter zu Stripe …"); }
    try {
      const r = await X.api("POST", path, { ...body, returnTo });
      if (r && r.url) { location.href = r.url; return; }
      say(t("Stripe hat keinen Link geliefert. Versuch es gleich noch einmal."), "error");
    } catch (err) {
      say(fail(err), "error");
    }
    busy = false;
    render();
  }

  box.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-retry")) { load(); return; }
    if (b.dataset.pack) { go("/billing/credits/checkout", { cents: Number(b.dataset.pack) }, b); return; }
    if (b.dataset.upgrade) { go("/billing/checkout", { plan: b.dataset.upgrade, interval: yearly ? "year" : "month" }, b); return; }
    if (b.hasAttribute("data-portal")) { go("/billing/portal", {}, b); return; }
    if (b.dataset.interval) { yearly = b.dataset.interval === "year"; render(); }
  });

  // Zurück von Stripe: Hinweis zeigen, den Parameter aus der Adresse nehmen.
  const outcome = new URLSearchParams(location.search).get("checkout");
  if (outcome) {
    history.replaceState(null, "", location.pathname + location.hash);
    if (outcome === "success") say(t("Zahlung eingegangen. Dein Tarif bzw. Guthaben ist gebucht."), "ok");
    else if (outcome === "cancelled") say(t("Bezahlung abgebrochen – es wurde nichts berechnet."));
  }

  // Verbrauch aktuell halten: KI-Anfragen in der App ziehen vom Budget ab. Neu geladen
  // wird, wenn man zur Seite zurückkehrt, und jede Minute, solange sie sichtbar ist –
  // still (ein kurzer Ausfall lässt den letzten Stand stehen) und nie mitten in einem
  // Checkout. Gerendert wird nur, wenn sich etwas geändert hat.
  async function refresh() {
    if (busy || !data || document.hidden) return;
    try {
      const next = await X.api("GET", "/billing", undefined, { silent: true });
      if (busy || JSON.stringify(next) === JSON.stringify(data)) return;
      data = next;
      render();
    } catch {
      // Der letzte Stand bleibt stehen; der nächste Durchgang versucht es wieder.
    }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("focus", refresh);
  setInterval(refresh, 60_000);

  // Beschreibung und Feature-Zeilen kommen vom Server in der Seitensprache: neu holen.
  document.addEventListener("xyntal:lang", load);
  // Erst nach den verzögert geladenen Skripten rendern: sonst steht der Text vor
  // der Übersetzung (i18n.js) auf der Seite, und eingefüllte Sätze wie
  // „Aktiv bis …“ blieben auf Englisch deutsch.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})();
