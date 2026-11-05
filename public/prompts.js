// „Wie bist du auf Xyntal aufmerksam geworden?“ (einmal) und „Wie hilfreich ist Xyntal
// für dich?“ (frühestens 7 Tage nach der Anmeldung, höchstens alle 30 Tage – über App und
// Website zusammen). Was gerade dran ist, entscheidet der App-Server (GET /me/prompts);
// hier wird es nur angezeigt: klein unten rechts, nie als Sperre, mit einem Klick weg.
// Braucht app-api.js (window.XyntalApp) und eine Anmeldung; sonst passiert nichts.
(() => {
  const X = window.XyntalApp;
  if (!X || window.__xyntalPrompts) return;
  window.__xyntalPrompts = true;
  const { esc, t } = X;
  const LABELS = {
    tiktok: "TikTok", instagram: "Instagram", linkedin: "LinkedIn", youtube: "YouTube",
    google: "Google-Suche", friend: "Freunde oder Empfehlung", community: "Community oder Event", other: "Etwas anderes",
  };
  const FACES = ["😞", "🙁", "😐", "🙂", "😍"];
  let box = null, prompt = null, choice = "", rating = 0, busy = false;

  function css() {
    if (document.getElementById("xp-style")) return;
    const s = document.createElement("style");
    s.id = "xp-style";
    s.textContent = `
      .xp { position: fixed; right: 18px; bottom: 18px; z-index: 60; width: min(380px, calc(100vw - 32px)); display: grid; gap: 12px;
            padding: 18px; border: 1px solid var(--border, #333); border-radius: 10px; background: var(--panel, #1d1d1d);
            box-shadow: 0 18px 48px rgba(0,0,0,.45); color: var(--text, #eee); font-size: 14px; }
      .xp h3 { margin: 0; font-size: 17px; padding-right: 22px; }
      .xp p { margin: 0; color: var(--text-2, #aaa); font-size: 13px; }
      .xp-x { position: absolute; top: 10px; right: 10px; border: 0; background: none; color: var(--text-2, #aaa); font-size: 20px; cursor: pointer; line-height: 1; }
      .xp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .xp-chip { border: 1px solid var(--border, #333); background: none; color: inherit; border-radius: 999px; padding: 6px 11px; font: inherit; font-size: 13px; cursor: pointer; }
      .xp-chip[aria-pressed="true"] { border-color: var(--accent, #7c5cff); background: color-mix(in srgb, var(--accent, #7c5cff) 18%, transparent); }
      .xp-faces { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
      .xp-faces .xp-chip { font-size: 20px; padding: 6px 0; border-radius: 8px; }
      .xp input, .xp textarea { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--border, #333); border-radius: 6px;
            background: var(--bg, #111); color: inherit; font: inherit; font-size: 13px; }
      .xp textarea { min-height: 64px; resize: vertical; }
      .xp-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; }
      .xp-row .xp-never { margin-right: auto; border: 0; background: none; color: var(--text-2, #aaa); font: inherit; font-size: 12.5px; cursor: pointer; text-decoration: underline; padding: 0; }
      @media (max-width: 560px) { .xp { right: 16px; left: 16px; width: auto; bottom: 16px; } }`;
    document.head.append(s);
  }

  function close() { if (box) { box.remove(); box = null; } }

  function render() {
    css();
    if (!box) {
      box = document.createElement("section");
      box.className = "xp";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-live", "polite");
      document.body.append(box);
      box.addEventListener("click", onClick);
      box.addEventListener("input", onInput);
    }
    if (prompt.kind === "referral") {
      box.setAttribute("aria-label", t("Wie bist du auf Xyntal aufmerksam geworden?"));
      box.innerHTML = `
        <button class="xp-x" type="button" data-xp="skip" aria-label="${esc(t("Überspringen"))}">×</button>
        <h3>${esc(t("Wie bist du auf Xyntal aufmerksam geworden?"))}</h3>
        <p>${esc(t("Ein Klick hilft uns, mehr Leute wie dich zu finden. Freiwillig – überspring es gern."))}</p>
        <div class="xp-chips">${(prompt.sources || []).map((k) => `<button class="xp-chip" type="button" data-src="${esc(k)}" aria-pressed="${choice === k}">${esc(t(LABELS[k] || k))}</button>`).join("")}</div>
        ${choice === "other" ? `<input data-xp-note maxlength="200" placeholder="${esc(t("Wo genau? (optional)"))}">` : ""}
        <div class="xp-row">
          <button class="btn btn-small btn-ghost" type="button" data-xp="skip">${esc(t("Überspringen"))}</button>
          <button class="btn btn-small" type="button" data-xp="send" ${choice && !busy ? "" : "disabled"}>${esc(t("Senden"))}</button>
        </div>`;
    } else {
      box.setAttribute("aria-label", t("Wie hilfreich ist Xyntal für dich?"));
      box.innerHTML = `
        <button class="xp-x" type="button" data-xp="later" aria-label="${esc(t("Später"))}">×</button>
        <h3>${esc(t("Wie hilfreich ist Xyntal für dich?"))}</h3>
        <p>${esc(t("Deine ehrliche Antwort zeigt uns, was wir als Nächstes verbessern. Dauert zehn Sekunden."))}</p>
        <div class="xp-faces">${FACES.map((f, i) => `<button class="xp-chip" type="button" data-rate="${i + 1}" aria-pressed="${rating === i + 1}" aria-label="${esc(t("{n} von 5").replace("{n}", i + 1))}">${f}</button>`).join("")}</div>
        ${rating ? `<textarea data-xp-comment maxlength="2000" placeholder="${esc(t(rating >= 4 ? "Was gefällt dir am meisten? (optional)" : "Was sollen wir besser machen? (optional)"))}"></textarea>` : ""}
        <div class="xp-row">
          <button class="xp-never" type="button" data-xp="never">${esc(t("Nicht mehr fragen"))}</button>
          <button class="btn btn-small btn-ghost" type="button" data-xp="later">${esc(t("Später"))}</button>
          <button class="btn btn-small" type="button" data-xp="send" ${rating && !busy ? "" : "disabled"}>${esc(t("Senden"))}</button>
        </div>`;
    }
  }

  let note = "", comment = "";
  function onInput(e) {
    if (e.target.matches("[data-xp-note]")) note = e.target.value;
    if (e.target.matches("[data-xp-comment]")) comment = e.target.value;
  }

  async function send(path, body) {
    busy = true;
    try { await X.api("POST", path, body, { silent: true }); } catch { /* still close: the server asks again later */ }
    busy = false;
  }

  async function onClick(e) {
    const b = e.target.closest("button");
    if (!b || busy) return;
    if (b.dataset.src) { choice = b.dataset.src; render(); if (choice === "other") box.querySelector("[data-xp-note]")?.focus(); return; }
    if (b.dataset.rate) { rating = Number(b.dataset.rate); render(); box.querySelector("[data-xp-comment]")?.focus(); return; }
    const act = b.dataset.xp;
    if (prompt.kind === "referral") {
      if (act === "skip") { close(); await send("/me/referral", { source: "skip" }); }
      if (act === "send" && choice) { close(); await send("/me/referral", { source: choice, note }); }
      return;
    }
    if (act === "later" || act === "never") { close(); await send("/me/feedback/dismiss", { never: act === "never" }); }
    if (act === "send" && rating) {
      box.innerHTML = `<h3>${esc(t("Danke für dein Feedback!"))}</h3>`;
      await send("/me/feedback", { rating, comment, surface: "web", moment: prompt.moment || "" });
      setTimeout(close, 2200);
    }
  }

  async function check() {
    try {
      const r = await X.api("GET", "/me/prompts", undefined, { silent: true });
      if (!r || !r.prompt) return;
      prompt = { ...r.prompt, sources: r.sources };
      render();
    } catch {
      // nicht angemeldet, offline oder ein älterer Server: kein Hinweis
    }
  }

  // Erst nachdem die Seite steht – eine Frage soll nie das Erste sein, was man sieht.
  const start = () => setTimeout(check, 4000);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
})();
