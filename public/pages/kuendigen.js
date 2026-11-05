// „Verträge hier kündigen“ (/kuendigen, § 312k BGB): Formular ohne Anmeldung, schickt die
// Kündigung an den App-Server (POST /billing/cancellation) und zeigt sofort die
// Eingangsbestätigung mit Datum und Uhrzeit. Die E-Mail-Bestätigung verschickt der Server.
(() => {
  const form = document.querySelector("[data-cancel-form]");
  if (!form) return;
  const api = () => (window.XYNTAL_CONFIG && window.XYNTAL_CONFIG.appApiUrl) || "https://api.xyntal.de";
  const en = () => window.XyntalI18n?.get?.() === "en";
  const T = (de, eng) => (en() ? eng : de);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const status = form.querySelector("[data-cancel-status]");
  const done = document.querySelector("[data-cancel-done]");

  // Angemeldet auf der Website: Name und E-Mail vorausfüllen
  try {
    const ses = JSON.parse(localStorage.getItem("sb-rralgrlujoupprwlvoyo-auth-token") || "null");
    const user = ses?.user;
    if (user?.email) form.email.value = user.email;
    const name = user?.user_metadata?.full_name || user?.user_metadata?.name;
    if (name) form.name.value = name;
  } catch { /* privat */ }

  const toggle = () => {
    form.querySelector("[data-reason]").hidden = form.kind.value !== "extraordinary";
    form.querySelector("[data-date]").hidden = form.when.value !== "date";
  };
  form.addEventListener("change", toggle);
  toggle();

  const when = (iso) => {
    const d = new Date(iso);
    return en()
      ? `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
      : `${d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    const body = {
      contract: form.contract.value,
      kind: form.kind.value,
      reason: form.reason.value.trim(),
      date: form.when.value === "date" ? form.date.value : "",
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      confirmEmail: form.confirmEmail.value.trim(),
    };
    if (body.name.length < 2) { status.textContent = T("Bitte gib deinen Namen an.", "Please enter your name."); form.name.focus(); return; }
    if (!/^\S+@\S+\.\S+$/.test(body.email)) { status.textContent = T("Bitte gib die E-Mail-Adresse deines Xyntal-Kontos an.", "Please enter the email address of your Xyntal account."); form.email.focus(); return; }
    if (body.kind === "extraordinary" && body.reason.length < 3) { status.textContent = T("Bitte nenne den Grund für die außerordentliche Kündigung.", "Please give the reason for the extraordinary cancellation."); form.reason.focus(); return; }
    if (form.when.value === "date" && !body.date) { status.textContent = T("Bitte wähle ein Datum.", "Please pick a date."); form.date.focus(); return; }
    const btn = form.querySelector(".kd-submit");
    btn.disabled = true;
    try {
      const res = await fetch(`${api()}/billing/cancellation`, { method: "POST", headers: { "content-type": "application/json", "accept-language": en() ? "en" : "de" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.data?.receivedAt) throw new Error(json.error?.message || String(res.status));
      const d = json.data;
      const r = d.request;
      const rows = [
        [T("Eingang", "Received"), when(d.receivedAt)],
        [T("Vertrag", "Contract"), r.contract === "enterprise" ? "Enterprise" : T("Xyntal-Abo", "Xyntal subscription")],
        [T("Art", "Type"), r.kind === "ordinary" ? T("Ordentliche Kündigung", "Ordinary cancellation") : `${T("Außerordentliche Kündigung", "Extraordinary cancellation")} – ${r.reason}`],
        [T("Zum", "Effective"), r.date ? new Date(`${r.date}T12:00:00`).toLocaleDateString(en() ? "en-GB" : "de-DE") : T("nächstmöglichen Zeitpunkt", "earliest possible date")],
        [T("Name", "Name"), r.name],
        [T("Konto", "Account"), r.email],
        [T("Referenz", "Reference"), d.reference],
      ];
      done.querySelector("[data-cancel-summary]").innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
      done.querySelector("[data-cancel-outcome]").textContent = T(
        `Eine Bestätigung ist unterwegs an ${r.confirmEmail}${r.confirmEmail !== r.email ? ` und an ${r.email}` : ""}. Darin steht auch, wann dein Vertrag endet.`,
        `A confirmation is on its way to ${r.confirmEmail}${r.confirmEmail !== r.email ? ` and ${r.email}` : ""}. It also says when your contract ends.`);
      form.hidden = true;
      done.hidden = false;
      done.focus();
      window.scrollTo({ top: 0 });
    } catch {
      status.innerHTML = T(
        'Die Kündigung konnte gerade nicht gesendet werden. Versuch es gleich noch einmal – oder kündige per E-Mail an <a href="mailto:admin@xyntal.com?subject=K%C3%BCndigung">admin@xyntal.com</a>; auch das gilt.',
        'The cancellation couldn\'t be sent right now. Try again in a moment – or cancel by email to <a href="mailto:admin@xyntal.com?subject=Cancellation">admin@xyntal.com</a>; that counts too.');
    } finally {
      btn.disabled = false;
    }
  });
  document.querySelector("[data-cancel-print]")?.addEventListener("click", () => window.print());

  // Rücknahme über den Link aus der Mail an die Kontoadresse (?zuruecknehmen=<id>.<token>).
  // Erst der Knopf schickt sie ab – Link-Scanner in Postfächern lösen so nichts aus.
  const param = new URLSearchParams(location.search).get("zuruecknehmen") || "";
  const m = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{16,128})$/.exec(param);
  const revoke = document.querySelector("[data-revoke]");
  if (m && revoke) {
    form.hidden = true;
    revoke.hidden = false;
    const btn = revoke.querySelector("[data-revoke-btn]");
    const st = revoke.querySelector("[data-revoke-status]");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      st.textContent = "";
      try {
        const res = await fetch(`${api()}/billing/cancellation/revoke`, { method: "POST", headers: { "content-type": "application/json", "accept-language": en() ? "en" : "de" }, body: JSON.stringify({ id: m[1], token: m[2] }) });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.data?.revoked) {
          revoke.querySelector("h2").textContent = T("Die Kündigung ist zurückgenommen.", "The cancellation has been withdrawn.");
          revoke.querySelector("[data-revoke-text]").textContent = json.data.already
            ? T("Das war schon erledigt. Dein Abo läuft weiter.", "That was already done. Your subscription continues.")
            : T("Dein Abo läuft ganz normal weiter. Eine Bestätigung ist per E-Mail unterwegs.", "Your subscription continues as normal. A confirmation is on its way by email.");
          btn.remove();
          history.replaceState(null, "", "/kuendigen");
        } else if (res.status === 404) {
          st.textContent = T("Dieser Link ist nicht gültig. Schreib uns an admin@xyntal.com.", "This link isn't valid. Write to admin@xyntal.com.");
        } else if (res.status === 409) {
          st.textContent = T("Der Vertrag ist schon beendet und lässt sich nicht mehr zurückholen. Du kannst jederzeit einen neuen Tarif wählen.", "The contract has already ended. You can choose a new plan at any time.");
        } else {
          throw new Error(String(res.status));
        }
      } catch {
        st.textContent = T("Das hat gerade nicht geklappt. Versuch es gleich noch einmal oder schreib an admin@xyntal.com.", "That didn't work right now. Try again shortly or write to admin@xyntal.com.");
        btn.disabled = false;
      }
    });
  }
})();
