// Treffen: Datenrechte und Zusagen werden zusätzlich serverseitig geprüft.
const EVENT_FIELDS = 'id,title,description,starts_at,place,address,is_public,cancelled,created_at';
function eventDate(ts) { return new Date(ts).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function eventLocalInput(ts) {
  const d = new Date(ts); const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function eventCard(ev, { count = 0, going = false, v = {}, teaser = false } = {}) {
  const past = new Date(ev.starts_at) <= new Date();
  const hint = ev.cancelled ? 'Abgesagt' : past ? 'Vergangen' : 'Geplant';
  return `<article class="event-card" id="event-${esc(ev.id)}" data-event="${esc(ev.id)}" tabindex="-1">
    <div class="event-card-top"><span class="tag${ev.cancelled ? ' event-cancelled' : ''}">${hint}</span><span class="hint">${ev.is_public ? 'Öffentlich' : 'Nur Mitglieder'}</span></div>
    <h2>${esc(ev.title)}</h2><p class="event-date"><time datetime="${esc(ev.starts_at)}">${esc(eventDate(ev.starts_at))} Uhr</time></p>
    <p class="event-location">${esc(ev.place)}${ev.address ? `<br><span>${esc(ev.address)}</span>` : ''}</p>
    ${ev.description && !teaser ? `<div class="event-description">${richText(ev.description)}</div>` : ''}
    <div class="event-card-bottom"><span>${Number(count) || 0} ${Number(count) === 1 ? 'Zusage' : 'Zusagen'}${going ? ' · Du bist dabei' : ''}</span>
    ${teaser ? `<a class="text-link" href="events?treffen=${esc(ev.id)}">Zum Treffen →</a>` : `<div class="row-actions">
      ${going ? '<button type="button" data-event-action="withdraw">Zusage zurücknehmen</button>' : !past && !ev.cancelled && v.isMember ? '<button type="button" class="btn btn-small" data-event-action="join">Ich bin dabei</button>' : ''}
      ${!v.isMember && !past && !ev.cancelled ? (v.me ? '<span class="hint">Zusagen nach deiner Freigabe möglich.</span>' : '<a class="text-link" href="login">Einloggen und zusagen</a>') : ''}
      ${v.isAdmin ? '<button type="button" data-event-action="edit">Bearbeiten</button>' + (!ev.cancelled && !past ? '<button type="button" data-event-action="cancel">Treffen absagen</button>' : '') : ''}
    </div>`}</div>
    ${v.isAdmin && !teaser ? '<details class="event-attendees"><summary>Zusagen ansehen</summary><div data-attendees></div></details>' : ''}
    <p class="form-status" data-event-status role="status" aria-live="polite"></p>
  </article>`;
}
async function countsFor(events) {
  if (!events.length) return new Map();
  const result = unwrap(await sb.rpc('event_counts', { p_event_ids: events.map(e => e.id) }));
  return new Map(result.map(row => [String(row.event_id), Number(row.attending_count)]));
}
(async () => {
  const teaser = document.getElementById('events-preview');
  if (!teaser) return;
  try {
    const events = unwrap(await sb.from('events').select(EVENT_FIELDS).eq('cancelled', false).gte('starts_at', new Date().toISOString()).order('starts_at').limit(3));
    const counts = await countsFor(events);
    teaser.innerHTML = events.length ? events.map(ev => eventCard(ev, { teaser: true, count: counts.get(String(ev.id)) })).join('') : '<p class="empty">Die nächsten Termine sind in Planung. Sobald ein Treffen feststeht, findest du es hier.</p>';
  } catch { teaser.innerHTML = '<p class="empty">Die Termine konnten gerade nicht geladen werden. <a class="text-link" href="events">Zur Treffen-Seite</a></p>'; }
})();
(async () => {
  const list = document.getElementById('events-list');
  if (!list) return;
  let v = { me: null, isMember: false, isAdmin: false }, events = [], counts = new Map(), mine = new Set();
  let filter = 'upcoming', editing = null, loading = false, page = 0;
  const pageSize = 30;
  const status = document.getElementById('events-status');
  const more = document.getElementById('events-more');
  const refreshButton = document.getElementById('events-refresh');
  const editor = document.getElementById('event-editor');
  const editorStatus = document.getElementById('event-editor-status');
  const actions = new Set();
  let targetOpened = false;
  function render() {
    list.innerHTML = events.length ? events.map(ev => eventCard(ev, { count: counts.get(String(ev.id)), going: mine.has(String(ev.id)), v })).join('')
      : `<p class="empty">${filter === 'past' ? 'Noch keine vergangenen Treffen.' : 'Die nächsten Treffen sind in Planung.'}${v.isAdmin ? ' Lege oben den ersten Termin an.' : ''}</p>`;
    list.querySelectorAll('.event-attendees').forEach(details => details.addEventListener('toggle', async () => {
      if (!details.open) return;
      const box = details.querySelector('[data-attendees]');
      box.textContent = 'Lade Zusagen …';
      try {
        const rows = unwrap(await sb.from('event_rsvps').select('member_id,created_at,member:profiles!event_rsvps_member_id_fkey(name,headline)')
          .eq('event_id', details.closest('[data-event]').dataset.event).order('created_at'));
        box.innerHTML = rows.length ? `<ul>${rows.map(r => `<li><strong>${esc(r.member?.name || 'Mitglied')}</strong>${r.member?.headline ? ` · ${esc(r.member.headline)}` : ''}</li>`).join('')}</ul>` : '<p class="hint">Noch keine Zusagen.</p>';
      } catch (err) { box.textContent = friendlyError(err); }
    }));
  }
  async function load(append = false) {
    if (loading || actions.size) return;
    loading = true; list.setAttribute('aria-busy', 'true'); more.disabled = refreshButton.disabled = true;
    document.querySelectorAll('[data-event-filter]').forEach(b => b.disabled = true);
    try {
      const next = append ? page + 1 : 0;
      let query = sb.from('events').select(EVENT_FIELDS).order('starts_at', { ascending: filter !== 'past' }).order('id', { ascending: filter !== 'past' });
      query = filter === 'past' ? query.lt('starts_at', new Date().toISOString()) : query.gte('starts_at', new Date().toISOString());
      const rows = unwrap(await query.range(next * pageSize, (next + 1) * pageSize - 1));
      const rowCounts = await countsFor(rows);
      if (!append) { counts = new Map(); events = []; }
      rowCounts.forEach((value,key) => counts.set(key,value));
      const ids = new Set(events.map(e => String(e.id)));
      events.push(...rows.filter(e => !ids.has(String(e.id))));
      if (v.me) {
        const rsvps = unwrap(await sb.from('event_rsvps').select('event_id').eq('member_id', v.me.id));
        mine = new Set(rsvps.map(row => String(row.event_id)));
      }
      page = next; more.hidden = rows.length < pageSize;
      render(); setStatus(status, '');
      const target = new URLSearchParams(location.search).get('treffen');
      if (target && /^\d+$/.test(target) && !targetOpened) {
        targetOpened = true;
        if (!events.some(ev => String(ev.id) === target)) {
          const ev = unwrap(await sb.from('events').select(EVENT_FIELDS).eq('id', target).maybeSingle());
          if (ev) { events.unshift(ev); const c = await countsFor([ev]); c.forEach((value,key) => counts.set(key,value)); render(); }
        }
        const article = document.getElementById(`event-${target}`);
        if (article) { article.focus({ preventScroll: true }); article.scrollIntoView({ block: 'center' }); }
        else setStatus(status, 'Dieses Treffen ist nicht mehr verfügbar oder für dich nicht sichtbar.');
      }
    } catch (err) {
      if (!events.length) list.innerHTML = '<p class="empty">Treffen konnten nicht geladen werden. Versuch es mit „Aktualisieren“ erneut.</p>';
      setStatus(status, friendlyError(err), 'error');
    } finally {
      loading = false; list.setAttribute('aria-busy','false'); more.disabled = refreshButton.disabled = false;
      document.querySelectorAll('[data-event-filter]').forEach(b => b.disabled = false);
    }
  }
  document.querySelectorAll('[data-event-filter]').forEach(b => b.addEventListener('click', () => {
    if (loading || actions.size) return;
    filter = b.dataset.eventFilter;
    document.querySelectorAll('[data-event-filter]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    load();
  }));
  more.addEventListener('click', () => load(true));
  refreshButton.addEventListener('click', () => load());
  function resetEditor() {
    editing = null; editor.reset(); document.getElementById('event-editor-title').textContent = 'Neues Treffen';
    document.getElementById('event-save').textContent = 'Treffen anlegen';
  }
  document.getElementById('event-reset').addEventListener('click', () => { resetEditor(); setStatus(editorStatus,''); });
  editor.addEventListener('submit', e => {
    e.preventDefault();
    const reset = document.getElementById('event-reset'); reset.disabled = true;
    submitWith(editor,editorStatus,async data => {
      requireFields(data,['title','starts_at','place'],'Bitte gib Titel, Datum mit Uhrzeit und Ort an.');
      const date = new Date(data.starts_at);
      if (!Number.isFinite(date.getTime()) || eventLocalInput(date.toISOString()) !== data.starts_at) throw new Error('Bitte prüfe Datum und Uhrzeit; diese Ortszeit existiert nicht.');
      if (!editing && date <= new Date()) throw new Error('Ein neues Treffen muss in der Zukunft liegen.');
      const values = { title: data.title, description: data.description, starts_at: date.toISOString(), place: data.place, address: data.address, is_public: data.is_public };
      const ev = editing ? unwrap(await sb.from('events').update(values).eq('id',editing).select().single()) : unwrap(await sb.from('events').insert(values).select().single());
      resetEditor(); await load();
      setStatus(editorStatus, `„${ev.title}“ ist gespeichert.`, 'ok');
    }).finally(() => { reset.disabled = false; });
  });
  list.addEventListener('click', async e => {
    const button = e.target.closest('[data-event-action]'); if (!button) return;
    const article = button.closest('[data-event]'); const id = article.dataset.event;
    const ev = events.find(ev => String(ev.id) === id); if (!ev || loading || actions.has(id)) return;
    const kind = button.dataset.eventAction;
    if (kind === 'edit') {
      editing = ev.id; fillForm(editor, { ...ev, starts_at: eventLocalInput(ev.starts_at) });
      document.getElementById('event-editor-title').textContent = 'Treffen bearbeiten'; document.getElementById('event-save').textContent = 'Änderungen speichern';
      document.getElementById('event-admin').open = true; setStatus(editorStatus, ''); editor.elements.title.focus(); return;
    }
    if (kind === 'cancel' && !button.dataset.armed) {
      button.dataset.armed = '1'; button.textContent = 'Wirklich absagen?';
      setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; button.textContent = 'Treffen absagen'; } }, 5000); return;
    }
    actions.add(id); button.disabled = true; more.disabled = refreshButton.disabled = true;
    document.querySelectorAll('[data-event-filter]').forEach(b => b.disabled = true);
    const localStatus = article.querySelector('[data-event-status]');
    try {
      if (kind === 'cancel') {
        unwrap(await sb.from('events').update({cancelled:true}).eq('id',id).select().single()); ev.cancelled = true;
      } else {
        unwrap(await sb.rpc('set_event_attendance',{p_event_id:ev.id,p_attending:kind === 'join'}));
        if (kind === 'join') mine.add(id); else mine.delete(id);
      }
      const c = await countsFor([ev]); c.forEach((value,key) => counts.set(key,value)); render();
      const updated = document.getElementById(`event-${id}`);
      setStatus(updated.querySelector('[data-event-status]'),kind === 'cancel' ? 'Treffen abgesagt. Bestehende Zusagen bleiben für dich einsehbar.' : kind === 'join' ? 'Du bist dabei. Wir freuen uns auf dich!' : 'Deine Zusage wurde zurückgenommen.','ok');
      updated.querySelector('[data-event-action]')?.focus({ preventScroll:true });
    } catch(err) { setStatus(localStatus,friendlyError(err),'error'); button.disabled=false; }
    finally { actions.delete(id); if (!actions.size) { more.disabled = refreshButton.disabled = false; document.querySelectorAll('[data-event-filter]').forEach(b => b.disabled = false); } }
  });
  try {
    v = await viewer();
    document.getElementById('event-admin').hidden = !v.isAdmin;
    document.getElementById('event-timezone').textContent = `Eingabe in deiner Geräte-Zeitzone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
    if (!v.isMember) document.getElementById('events-notice').innerHTML = v.me ? '<div class="notice">Sobald dein Profil freigeschaltet ist, kannst du bei Treffen zusagen.</div>' : '<div class="notice">Du siehst öffentliche Termine. <a class="text-link" href="mitglied-werden">Werde Mitglied</a>, um zuzusagen und auch interne Treffen zu sehen.</div>';
    if (v.isAdmin && new URLSearchParams(location.search).has('verwalten')) document.getElementById('event-admin').open = true;
    await load();
  } catch(err) { list.innerHTML = `<p class="empty">${esc(friendlyError(err))}</p>`; list.setAttribute('aria-busy','false'); }
})();
