// Admin → Medien-Protokoll: NUR LESEND. Zeigt public.admin_media_log, das Prüfprotokoll über kontoübergreifende
// Admin-Löschungen von Seitenbildern (supabase/migrations/20261120120000_admin_media_log.sql). Die Tabelle erlaubt
// nur SELECT; hier gibt es keine Knöpfe zum Ändern oder Löschen.
// Berechtigungsfalle: Fehlt die Berechtigung, liefert RLS eine LEERE, FEHLERFREIE Antwort. Deshalb fragt diese Ansicht
// zuerst public.is_admin() per RPC ab und zeichnet Einträge nur bei bestätigter Berechtigung. Eine leere Liste heißt
// nur dann "keine Einträge". Ein Ladefehler ist ein Fehler, keine leere Liste.
(() => {
  const panel = document.querySelector('[data-panel="medienprotokoll"]');
  if (!panel) return;

  const PAGE_SIZE = 50;
  const STORE = { supabase: "Supabase", "eigener-server": "Eigener Server" };
  const RESULT = { geloescht: "gelöscht", ungewiss: "ungewiss" };

  let rows = [];                 // geladene Einträge, neueste zuerst
  let names = new Map();         // Kennung -> Name aus public.profiles (nur id und name)
  let hasMore = false;
  let busy = false;
  let loadedOnce = false;
  let view = { kind: "loading" }; // loading | list | denied | error

  // Gekürzte Kennung für Menschen: be17…ac47. Die volle Kennung steht im Button (Kopieren) und im title.
  const short = (id) => (id && id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id || "–");
  const shortFile = (f) => { const m = /^([0-9a-f-]{36})(\.[a-z0-9]+)$/i.exec(String(f || "")); return m ? `${short(m[1])}${m[2]}` : String(f || ""); };
  const when = (ts) => new Date(ts).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "medium" });

  // Zelle für ein Konto: Name (falls aus profiles bekannt) und gekürzte Kennung als Kopierknopf
  const who = (id) => {
    const name = names.get(id);
    return `${name ? `<b>${esc(name)}</b><br>` : ""}<button type="button" class="mp-copy" data-mp="copy" data-value="${esc(id)}" title="${esc(id)}">${esc(short(id))}</button>`;
  };

  // Berechtigung in DIESER Sitzung, vom Server bestätigt. Nur true zählt.
  async function adminConfirmed() {
    return unwrap(await sb.rpc("is_admin")) === true;
  }

  async function fetchPage(offset) {
    const batch = await sb.from("admin_media_log")
      .select("id,acted_at,admin_id,account_id,file_name,store,result")
      .order("acted_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
      .then(unwrap);
    return batch || [];
  }

  // Namen holen ist Zugabe. Schlägt es fehl, bleibt die Kennung stehen, und die Zeile ist trotzdem vollständig.
  async function loadNames(batch) {
    const ids = [...new Set(batch.flatMap((r) => [r.admin_id, r.account_id]))].filter((id) => id && !names.has(id));
    if (!ids.length) return;
    try {
      const people = await sb.from("profiles").select("id,name").in("id", ids).then(unwrap);
      (people || []).forEach((p) => names.set(p.id, p.name || ""));
    } catch { /* ohne Namen bleibt die Kennung sichtbar */ }
  }

  async function load({ more = false } = {}) {
    if (busy) return;
    busy = true;
    if (!more) { rows = []; hasMore = false; names = new Map(); view = { kind: "loading" }; }
    render();
    try {
      if (!(await adminConfirmed())) {
        rows = []; hasMore = false;
        view = { kind: "denied" };
      } else {
        const batch = await fetchPage(rows.length);
        await loadNames(batch);
        rows = rows.concat(batch);
        hasMore = batch.length === PAGE_SIZE;
        view = { kind: "list" };
      }
    } catch (err) {
      // KEIN roher Datenbanktext in der Oberfläche. friendlyError() lässt unbekannte Meldungen unverändert durch, und
      // dieser Zweig ist auch OHNE bestätigte Adminrechte erreichbar (der Fehler kann schon aus dem is_admin()-Aufruf
      // kommen, bevor "denied" gesetzt ist). Ein angemeldetes Mitglied soll hier keine Regel-, Spalten- oder
      // Funktionsnamen zu lesen bekommen. Der genaue Text geht nur in die Konsole.
      console.error("admin-medienprotokoll: Laden fehlgeschlagen", err);
      view = { kind: "error" };
    } finally {
      busy = false;
    }
    render();
  }

  function render() {
    const bound = `<p class="notice">Dieses Protokoll erfasst nur Löschungen, die über die Oberfläche gehen. Dieselbe Datei kannst du auch direkt über die Storage-Schnittstelle löschen, und wer die Zugangsdaten des eigenen Server-Speichers hat, löscht dort am Protokoll vorbei. Die Liste belegt also, was über die Oberfläche gelöscht wurde, nicht, dass sonst nichts gelöscht wurde.</p>`;
    const head = `<div class="panel-heading"><div><p class="admin-kicker">PRÜFPROTOKOLL</p><h2>Medien-Protokoll</h2><p class="hint">Wer Seitenbilder kontoübergreifend entfernt hat. Neueste Einträge zuerst.</p></div></div>`;

    let body;
    if (view.kind === "denied") {
      body = `<p class="notice">Das Protokoll ist hier nicht einsehbar: Der Server bestätigt deine Admin-Berechtigung in dieser Sitzung nicht. Das passiert, wenn dein Konto gesperrt ist oder in dieser Sitzung der zweite Faktor fehlt. Ob Einträge vorhanden sind, lässt sich deshalb hier nicht feststellen.</p>
        <div class="row-actions"><button type="button" data-mp="reload">Erneut prüfen</button></div>`;
    } else if (view.kind === "loading") {
      body = `<p class="hint">Protokoll wird geladen …</p>`;
    } else {
      const errBlock = view.kind === "error"
        ? `<div class="admin-message is-error">Das Protokoll konnte nicht geladen werden. ${rows.length ? "Die übrigen Einträge fehlen in dieser Ansicht." : "Ob Einträge vorhanden sind, lässt sich deshalb nicht feststellen."} Der genaue Grund steht in der Browser-Konsole.
           <div class="row-actions"><button type="button" data-mp="${rows.length ? "more" : "reload"}">Erneut laden</button></div></div>`
        : "";
      if (!rows.length) {
        body = view.kind === "error" ? errBlock
          : `<div class="admin-empty"><span>≡</span><h3>Noch keine Einträge</h3><p>Hier ist bisher keine Löschung protokolliert (geprüft: deine Admin-Berechtigung ist bestätigt).</p></div>`;
      } else {
        const more = hasMore
          ? `<div class="row-actions"><button type="button" data-mp="more"${busy ? " disabled" : ""}>${busy ? "Wird geladen …" : "Mehr laden"}</button></div>`
          : "";
        body = `${errBlock}<div class="table-wrap"><table>
          <thead><tr><th>Zeitpunkt</th><th>Handelnder Admin</th><th>Betroffenes Konto</th><th>Datei</th><th>Lager</th><th>Ergebnis</th></tr></thead>
          <tbody>${rows.map((r) => `<tr>
            <td><small>${esc(when(r.acted_at))}</small></td>
            <td>${who(r.admin_id)}</td>
            <td>${who(r.account_id)}</td>
            <td><code title="${esc(r.file_name)}">${esc(shortFile(r.file_name))}</code></td>
            <td>${esc(STORE[r.store] || r.store)}</td>
            <td>${r.result === "ungewiss" ? `<b class="mp-ungewiss">ungewiss</b>` : esc(RESULT[r.result] || r.result)}</td>
          </tr>`).join("")}</tbody></table></div>${more}`;
      }
    }
    panel.innerHTML = `${head}${bound}${body}`;
  }

  panel.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-mp]");
    if (!b) return;
    const act = b.dataset.mp;
    if (act === "copy") {
      const full = b.dataset.value;
      const label = b.textContent;
      try { await navigator.clipboard.writeText(full); b.textContent = "Kopiert"; }
      catch { b.textContent = full; }
      setTimeout(() => { if (b.isConnected) b.textContent = label; }, 1500);
      return;
    }
    if (act === "reload") return load();
    if (act === "more") return load({ more: true });
  });

  // Erst laden, wenn der Tab geöffnet wird.
  const einmalLaden = () => { if (!loadedOnce) { loadedOnce = true; load(); } };
  document.querySelector('[data-tab="medienprotokoll"]')?.addEventListener("click", einmalLaden);

  // UND beim Aufruf über den Anker (admin.html#medienprotokoll, auch nach einem Neuladen der Seite: der Hash bleibt
  // stehen). admin.js wählt den Tab beim Seitenaufbau selbst aus, OHNE ein click-Ereignis zu erzeugen. Ohne diesen
  // Zweig stünde das Panel dann vollkommen leer da — kein Text, kein Fehler, keine Liste. Das wäre genau der Zustand,
  // den diese Datei vermeiden soll: Leer würde dann gar nichts heißen und wie "keine Einträge" aussehen.
  // Das Panel wird per hidden umgeschaltet, deshalb genügt es, die Sichtbarkeit zu beobachten.
  if (!panel.hidden) einmalLaden();
  new MutationObserver(() => { if (!panel.hidden) einmalLaden(); })
    .observe(panel, { attributes: true, attributeFilter: ["hidden"] });
})();
