// Hinweise ohne Nachrichtentexte: nur der Empfänger darf sie per RLS lesen.
(async () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  const { me, isMember } = await viewer();
  if (!me || !isMember) return;
  const root = document.createElement('details');
  root.className = 'notifications';
  root.innerHTML = `<summary aria-label="Benachrichtigungen"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg><span class="badge" hidden></span></summary>
    <section class="notification-panel" aria-label="Benachrichtigungen">
      <div class="notification-head"><strong>Deine Benachrichtigungen</strong><button type="button" data-read-all>Alle gelesen</button></div>
      <div data-notification-list></div><p class="form-status" role="status" aria-live="polite"></p>
    </section>`;
  nav.prepend(root);
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
      const result = await sb.from('notifications').select('id, kind, sender_id, post_id, created_at, read_at')
        .order('created_at', { ascending: false }).limit(30);
      // Sicheres Vorab-Deployment: ohne Migration bleibt die Glocke unsichtbar.
      if (result.error && ['PGRST205', '42P01'].includes(result.error.code)) { root.hidden = true; return; }
      const rows = unwrap(result);
      const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (error) throw error;
      root.hidden = false;
      badge.hidden = !count;
      badge.textContent = count > 99 ? '99+' : String(count || '');
      root.querySelector('summary').setAttribute('aria-label', `Benachrichtigungen${count ? `, ${count} ungelesen` : ''}`);
      all.disabled = !count;
      list.innerHTML = rows.length ? rows.map(n => {
        const href = n.kind === 'message' && n.sender_id ? `nachrichten?an=${encodeURIComponent(n.sender_id)}`
          : n.kind === 'comment' ? `community?beitrag=${encodeURIComponent(n.post_id)}` : 'nachrichten';
        return `<a class="notification-item${n.read_at ? '' : ' unread'}" href="${esc(href)}" data-notification="${esc(n.id)}"><span>${n.kind === 'message' ? 'Du hast eine neue Nachricht.' : 'Jemand hat deinen Beitrag kommentiert.'}</span><small>${esc(timeAgo(n.created_at))}${n.read_at ? '' : ' · ungelesen'}</small></a>`;
      }).join('') : '<p class="empty-small">Noch keine Benachrichtigungen. Neue Nachrichten und Kommentare zu deinen Beiträgen findest du hier.</p>';
      setStatus(status, '');
    } catch {
      list.innerHTML = '<p class="empty-small">Benachrichtigungen konnten nicht geladen werden.</p>';
      all.disabled = true;
    } finally { busy = false; }
  }
  all.addEventListener('click', async () => {
    all.disabled = true;
    try {
      unwrap(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', me.id).is('read_at', null));
      await refresh();
    } catch { setStatus(status, 'Das hat nicht geklappt. Versuch es erneut.', 'error'); all.disabled = false; }
  });
  list.addEventListener('click', async e => {
    const link = e.target.closest('[data-notification]');
    if (!link || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    try {
      unwrap(await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', link.dataset.notification).eq('recipient_id', me.id));
      location.href = link.getAttribute('href');
    } catch { setStatus(status, 'Der Hinweis konnte nicht geöffnet werden. Versuch es erneut.', 'error'); }
  });
  root.addEventListener('toggle', () => { if (root.open) refresh(); });
  document.addEventListener('click', e => { if (!root.contains(e.target)) root.open = false; });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { root.open = false; root.querySelector('summary').focus(); } });
  const onVisible = () => { if (!document.hidden) refresh(); };
  document.addEventListener('visibilitychange', onVisible);
  const timer = setInterval(onVisible, 30000);
  sb.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { active = false; root.remove(); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); }
  });
  await refresh();
})();
