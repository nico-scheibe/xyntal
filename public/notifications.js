// Hinweise ohne Nachrichtentexte: nur der Empfänger darf sie per RLS lesen.
// Läuft auf jeder Seite: mit app.js (viewer, sb) oder allein – dann kommt der Supabase-Client
// von account-menu.js, das dieses Skript für Angemeldete nachlädt.
(async () => {
  if (window.__xyntalBell) return;
  const nav = document.getElementById('main-nav');
  const top = nav ? null : document.querySelector('.top__right');
  if (!nav && !top) return;
  window.__xyntalBell = true;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const unwrap = ({ data, error }) => { if (error) throw error; return data; };
  const setStatus = (el, text, kind = '') => { el.className = 'form-status' + (kind ? ' ' + kind : ''); el.textContent = text; };
  const timeAgo = ts => {
    const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'gerade eben';
    if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
    if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
    if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? 'gestern' : `vor ${d} Tagen`; }
    return new Date(ts).toLocaleDateString(document.documentElement.lang === 'en' ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  let db, me;
  try {
    if (typeof viewer === 'function' && typeof sb !== 'undefined' && sb) { // eslint-disable-line no-undef
      const v = await viewer(); // eslint-disable-line no-undef
      if (!v.me || !v.canAct) return;
      db = sb; me = v.me; // eslint-disable-line no-undef
    } else {
      if (typeof window.XyntalAccountClient !== 'function') return;
      db = await window.XyntalAccountClient();
      const { data: { session } } = await db.auth.getSession();
      if (!session) return;
      const { data: profile } = await db.from('profiles').select('id, status').eq('id', session.user.id).maybeSingle();
      if (!profile || profile.status === 'rejected') return;
      me = profile;
    }
  } catch { return; }

  // Aussehen der Glocke: eigene Datei, damit sie auf jeder Seite gleich ist
  if (!document.querySelector('link[href^="/site-bell.css"]')) {
    await new Promise(done => {
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = '/site-bell.css?v=1';
      link.onload = link.onerror = done;
      document.head.append(link);
    });
  }

  const root = document.createElement('details');
  root.className = 'notifications site-bell';
  root.hidden = true;
  root.innerHTML = `<summary aria-label="Benachrichtigungen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg><span class="badge" hidden></span></summary>
    <section class="notification-panel" aria-label="Benachrichtigungen">
      <div class="notification-head"><strong>Deine Benachrichtigungen</strong><button type="button" data-read-all>Alle gelesen</button></div>
      <div data-notification-list></div><p class="form-status" role="status" aria-live="polite"></p>
    </section>`;
  // Unterseiten: vorn in die Linkliste (site-header.css rückt sie neben die Lupe). Startseite: vor das Konto.
  if (nav) nav.prepend(root);
  else top.insertBefore(root, top.querySelector(':scope > .acct'));
  const list = root.querySelector('[data-notification-list]');
  const badge = root.querySelector('.badge');
  const status = root.querySelector('[role="status"]');
  const all = root.querySelector('[data-read-all]');
  let busy = false;
  let active = true;
  async function refresh() {
    if (busy || !active) return;
    busy = true;
    try {
      const result = await db.from('notifications').select('id, kind, sender_id, post_id, created_at, read_at')
        .order('created_at', { ascending: false }).limit(30);
      // Sicheres Vorab-Deployment: ohne Migration bleibt die Glocke unsichtbar.
      if (result.error && ['PGRST205', '42P01'].includes(result.error.code)) { root.hidden = true; return; }
      const rows = unwrap(result);
      // Who wrote: names of the senders (profiles are readable to members);
      // without them the hint stays generic.
      const senderIds = [...new Set(rows.filter(n => n.kind === 'message' && n.sender_id).map(n => n.sender_id))];
      const names = {};
      if (senderIds.length) {
        try {
          const people = unwrap(await db.from('profiles').select('id, name').in('id', senderIds)) || [];
          for (const p of people) names[p.id] = (p.name || '').trim();
        } catch { /* generic text below */ }
      }
      const { count, error } = await db.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw error;
      root.hidden = false;
      badge.hidden = !count;
      badge.textContent = count > 99 ? '99+' : String(count || '');
      root.querySelector('summary').setAttribute('aria-label', `Benachrichtigungen${count ? `, ${count} ungelesen` : ''}`);
      all.disabled = !count;
      list.innerHTML = rows.length ? rows.map(n => {
        const href = n.kind === 'message' && n.sender_id ? `nachrichten?an=${encodeURIComponent(n.sender_id)}`
          : n.kind === 'comment' ? `community?beitrag=${encodeURIComponent(n.post_id)}`
          : n.kind === 'approved' ? 'mitglieder' : 'nachrichten';
        const text = n.kind === 'message' ? (names[n.sender_id] ? `Neue Nachricht von <b>${esc(names[n.sender_id])}</b>.` : 'Du hast eine neue Nachricht.')
          : n.kind === 'approved' ? 'Du bist freigeschaltet – dein Profil ist jetzt für Mitglieder sichtbar.'
          : 'Jemand hat deinen Beitrag kommentiert.';
        return `<a class="notification-item${n.read_at ? '' : ' unread'}" href="${esc(href)}" data-notification="${esc(n.id)}"><span>${text}</span><small>${esc(timeAgo(n.created_at))}${n.read_at ? '' : ' · ungelesen'}</small></a>`;
      }).join('') : '<p class="empty-small">Noch keine Benachrichtigungen. Neue Nachrichten und Kommentare zu deinen Beiträgen findest du hier.</p>';
      setStatus(status, '');
    } catch {
      root.hidden = false;
      list.innerHTML = '<p class="empty-small">Benachrichtigungen konnten nicht geladen werden.</p>';
      all.disabled = true;
    } finally { busy = false; }
  }
  all.addEventListener('click', async () => {
    all.disabled = true;
    try {
      unwrap(await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', me.id).is('read_at', null));
      await refresh();
    } catch { setStatus(status, 'Das hat nicht geklappt. Versuch es erneut.', 'error'); all.disabled = false; }
  });
  list.addEventListener('click', async e => {
    const link = e.target.closest('[data-notification]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try {
      unwrap(await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', link.dataset.notification).eq('recipient_id', me.id));
      location.href = link.getAttribute('href');
    } catch { setStatus(status, 'Der Hinweis konnte nicht geöffnet werden. Versuch es erneut.', 'error'); }
  });
  root.addEventListener('toggle', () => { if (root.open) refresh(); });
  document.addEventListener('click', e => { if (!root.contains(e.target)) root.open = false; });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { root.open = false; root.querySelector('summary').focus(); } });
  const onVisible = () => { if (!document.hidden) refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(onVisible, 30000);
  db.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { active = false; root.remove(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); }
  });
  await refresh();
})();
