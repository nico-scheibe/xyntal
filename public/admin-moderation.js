// Admin: Meldungen, KI-Einschätzung, Verwarnpunkte und Sperren (Strafkatalog aus /community-richtlinien).
// Daten: supabase/migrations/20261029100000_moderation_strikes.sql · KI: /api/moderation-check (hosting/daki/server.cjs)
(() => {
  const panel = document.querySelector('[data-panel="moderation"]');
  if (!panel || typeof sb === "undefined" || !sb) return;
  const RULES = ["Respekt", "Kein Spam", "Sei echt", "Ideen & Vertrauen", "Match ist kein Vertrag", "Fair zusammenarbeiten", "Aufbauen statt abzocken", "Gesetz", "Technik-Tricks", "Melden"];
  const REPORT_STATUS = { neu: "Neu", in_pruefung: "In Prüfung", erledigt: "Erledigt", abgelehnt: "Abgelehnt" };
  const LEVEL = { none: "Keine Maßnahme", restricted: "Eingeschränkt", suspended: "Vorübergehend gesperrt", banned: "Dauerhaft gesperrt" };
  const when = (ts) => (ts ? new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) : "unbefristet");
  let state = { reports: [], strikes: [], sanctions: [], members: [] };

  async function loadModeration() {
    try {
      const [reports, strikes, sanctions, members] = await Promise.all([
        sb.from("moderation_reports").select("*").order("created_at", { ascending: false }).then(unwrap),
        sb.from("member_strikes").select("*").order("created_at", { ascending: false }).then(unwrap),
        sb.from("member_sanctions").select("*").order("created_at", { ascending: false }).then(unwrap),
        sb.rpc("admin_members").then(unwrap),
      ]);
      state = { reports, strikes, sanctions, members };
    } catch (err) {
      panel.innerHTML = `<p class="empty">Moderation nicht verfügbar: ${esc(err.message)}</p><p class="hint">Ist die Migration 20261029100000_moderation_strikes.sql im Supabase SQL Editor ausgeführt?</p>`;
      return;
    }
    const open = state.reports.filter((r) => r.status === "neu").length;
    const counter = document.getElementById("c-moderation");
    if (counter) counter.textContent = open ? `(${open} neu)` : "";
    render();
  }

  const memberName = (id) => { const m = state.members.find((x) => x.id === id); return m ? (m.name || m.email || "(ohne Name)") : "(gelöscht)"; };
  const activeSanction = (id) => state.sanctions.find((s) => s.member_id === id && new Date(s.starts_at) <= new Date() && (!s.ends_at || new Date(s.ends_at) > new Date()));
  const points = (id) => state.strikes.filter((s) => s.member_id === id && new Date(s.expires_at) > new Date()).reduce((n, s) => n + s.points, 0);

  function aiBox(r) {
    const a = r.ai_result;
    if (!a) return '<small class="hint">Noch nicht geprüft</small>';
    const rule = a.regel ? `Regel ${a.regel} (${RULES[a.regel - 1] || "?"})` : "keine Regel";
    return `<div class="mod-ai"><b>${a.verstoss ? "Verstoß wahrscheinlich" : "Kein Verstoß erkannt"}</b> · ${esc(rule)}${a.grad ? ` · Grad ${esc(a.grad)}` : ""} · Sicherheit ${esc(a.sicherheit)}<br>
      <span>Empfehlung: ${esc(a.empfehlung)}</span><br><small>${esc(a.begruendung)}</small>
      ${a.openai_flagged ? `<br><small>OpenAI-Moderation: ${esc((a.openai_kategorien || []).join(", ") || "markiert")}</small>` : ""}
      <br><small class="hint">KI-Einschätzung, keine Entscheidung · ${esc(a.modell || "")} · ${when(r.ai_checked_at)}</small></div>`;
  }

  function render() {
    const targets = state.members.filter((m) => !m.is_admin).sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
    const sanctioned = [...new Set([...state.strikes.map((s) => s.member_id), ...state.sanctions.map((s) => s.member_id)])];
    panel.innerHTML = `
      <p class="hint">Meldungen kommen über das Formular in den Community-Richtlinien. Die KI gibt nur eine Einschätzung – Verwarnungen und Sperren vergibst du selbst.</p>
      <h2 style="margin:24px 0 12px">Meldungen</h2>
      ${state.reports.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Eingegangen</th><th>Meldung</th><th>KI-Einschätzung</th><th>Aktionen</th></tr></thead>
        <tbody>${state.reports.map((r) => `<tr data-report="${r.id}">
          <td><small>${when(r.created_at)}</small><br>${esc(r.name)}<br><small>${esc(r.email)}</small></td>
          <td>${r.location ? `<small>Wo: ${esc(r.location)}</small><br>` : ""}${esc(r.message)}
            <label class="mod-label">Gemeldeter Inhalt (optional einfügen)<textarea class="card-note" data-reported rows="2" maxlength="5000">${esc(r.reported_text)}</textarea></label></td>
          <td>${aiBox(r)}</td>
          <td><div class="row-actions">
            <select data-report-status aria-label="Status der Meldung">${Object.entries(REPORT_STATUS).map(([k, v]) => `<option value="${k}"${r.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
            <button data-act="ai">KI prüfen</button>
            <button data-act="strike-from">Verwarnen …</button>
            <a class="admin-link" href="mailto:${esc(r.email)}?subject=${encodeURIComponent("Deine Meldung bei Xyntal")}">Antworten</a>
          </div></td></tr>`).join("")}
        </tbody></table></div>` : '<p class="empty">Noch keine Meldungen.</p>'}

      <h2 style="margin:32px 0 12px" id="mod-strike-title">Verwarnung vergeben</h2>
      <form class="admin-filters mod-form" data-strike-form>
        <input type="hidden" name="report">
        <label>Mitglied<select name="member" required><option value="">Bitte wählen</option>${targets.map((m) => `<option value="${m.id}">${esc(m.name || m.email || m.id)}${points(m.id) ? ` · ${points(m.id)} P.` : ""}</option>`).join("")}</select></label>
        <label>Grad<select name="grade" required><option value="A">A – leicht (1 Punkt)</option><option value="B">B – mittel (3 Punkte)</option><option value="C">C – schwer (Sperre)</option></select></label>
        <label>Regel<select name="rule">${RULES.map((r, i) => `<option value="${i + 1}">${i + 1}. ${r}</option>`).join("")}</select></label>
        <label class="mod-wide">Begründung (geht an das Mitglied)<input name="reason" required minlength="3" maxlength="1000" placeholder="Was ist passiert und gegen welche Regel verstößt es?"></label>
        <label class="mod-check"><input type="checkbox" name="mild"> Grad C ohne Vorsatz: 30 Tage statt dauerhaft</label>
        <div class="row-actions mod-wide"><button type="submit">Verwarnung speichern</button><span class="hint" data-strike-status role="status"></span></div>
      </form>

      <h2 style="margin:32px 0 12px">Verwarnungen und Sperren</h2>
      ${sanctioned.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Mitglied</th><th>Punkte (12 Monate)</th><th>Status</th><th>Verlauf</th></tr></thead>
        <tbody>${sanctioned.map((id) => { const s = activeSanction(id); return `<tr>
          <td>${esc(memberName(id))}</td>
          <td><b>${points(id)}</b></td>
          <td>${s ? `<span class="status-pill status-rejected">${LEVEL[s.level]}</span><br><small>bis ${when(s.ends_at)}</small><br><button data-act="lift" data-id="${s.id}">Sperre aufheben</button>` : `<span class="status-pill status-approved">${LEVEL.none}</span>`}</td>
          <td>${state.strikes.filter((k) => k.member_id === id).map((k) => `<div class="mod-strike"><small>${when(k.created_at)} · Grad ${k.grade} · ${k.points} P. · Regel ${k.rule || "–"}${new Date(k.expires_at) <= new Date() ? " · verfallen" : ""}</small><br>${esc(k.reason)} <button data-act="unstrike" data-id="${k.id}">Löschen (Einspruch)</button></div>`).join("")}</td>
        </tr>`; }).join("")}</tbody></table></div>` : '<p class="empty">Noch keine Verwarnungen.</p>'}`;
  }

  async function aiCheck(row, btn) {
    const r = state.reports.find((x) => String(x.id) === row.dataset.report);
    const reported = row.querySelector("[data-reported]").value.trim();
    btn.disabled = true; btn.textContent = "Prüfe …";
    try {
      const { data: { session } } = await sb.auth.getSession();
      const response = await fetch("/api/moderation-check", {
        method: "POST", signal: AbortSignal.timeout(45000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + session.access_token },
        body: JSON.stringify({ message: r.message, location: r.location, reported_text: reported }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "Die KI-Prüfung ist fehlgeschlagen.");
      await sb.from("moderation_reports").update({ ai_result: data.result, ai_checked_at: new Date().toISOString(), reported_text: reported,
        status: r.status === "neu" ? "in_pruefung" : r.status }).eq("id", r.id).then(unwrap);
      await loadModeration();
    } catch (err) {
      btn.disabled = false; btn.textContent = "KI prüfen";
      alert(err.message);
    }
  }

  function prefillStrike(row) {
    const r = state.reports.find((x) => String(x.id) === row.dataset.report);
    const form = panel.querySelector("[data-strike-form]");
    form.report.value = r.id;
    if (r.ai_result?.grad) form.grade.value = r.ai_result.grad;
    if (r.ai_result?.regel) form.rule.value = r.ai_result.regel;
    form.reason.value = r.ai_result?.verstoss ? r.ai_result.begruendung : "";
    document.getElementById("mod-strike-title").scrollIntoView({ behavior: "smooth", block: "start" });
    form.member.focus();
  }

  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const row = btn.closest("[data-report]");
    if (btn.dataset.act === "ai") return aiCheck(row, btn);
    if (btn.dataset.act === "strike-from") return prefillStrike(row);
    const table = btn.dataset.act === "lift" ? "member_sanctions" : btn.dataset.act === "unstrike" ? "member_strikes" : null;
    if (!table || !confirm(btn.dataset.act === "lift" ? "Sperre wirklich aufheben?" : "Verwarnung wirklich löschen? Eine daraus entstandene Sperre wird mit aufgehoben.")) return;
    try { await sb.from(table).delete().eq("id", btn.dataset.id).then(unwrap); await loadModeration(); }
    catch (err) { alert(err.message); }
  });

  panel.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-report-status]")) return;
    const id = e.target.closest("[data-report]").dataset.report;
    try { await sb.from("moderation_reports").update({ status: e.target.value }).eq("id", id).then(unwrap); await loadModeration(); }
    catch (err) { alert(err.message); }
  });

  panel.addEventListener("submit", async (e) => {
    if (!e.target.matches("[data-strike-form]")) return;
    e.preventDefault();
    const f = e.target, status = f.querySelector("[data-strike-status]");
    const name = f.member.selectedOptions[0]?.textContent || "";
    if (f.grade.value === "C" && !f.mild.checked && !confirm(`${name} wird dauerhaft gesperrt. Fortfahren?`)) return;
    f.querySelector("[type=submit]").disabled = true;
    try {
      const res = await sb.rpc("admin_add_strike", {
        p_member: f.member.value, p_grade: f.grade.value, p_rule: Number(f.rule.value), p_reason: f.reason.value.trim(),
        p_report: f.report.value ? Number(f.report.value) : null, p_mild: f.mild.checked,
      }).then(unwrap);
      await loadModeration();
      panel.querySelector("[data-strike-status]").textContent = `Gespeichert: ${res.points} Punkte, ${LEVEL[res.level]}${res.ends_at ? ` bis ${when(res.ends_at)}` : ""}. Denk daran, das Mitglied mit Begründung und Einspruchsweg zu informieren.`;
    } catch (err) {
      status.textContent = err.message;
      f.querySelector("[type=submit]").disabled = false;
    }
  });

  document.querySelector('[data-tab="moderation"]')?.addEventListener("click", loadModeration);
  // Zähler beim Start, sobald die Admin-Ansicht sichtbar ist
  const view = document.getElementById("admin-view");
  new MutationObserver((_, obs) => { if (!view.hidden) { obs.disconnect(); loadModeration(); } }).observe(view, { attributes: true, attributeFilter: ["hidden"] });
})();
