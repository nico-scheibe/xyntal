(() => {
  const dialog = document.getElementById('feedback');
  if (!dialog) return;
  const form = document.getElementById('feedback-form');
  const status = form.querySelector('[data-feedback-status]');
  const submit = form.querySelector('[type=submit]');
  let busy = false;
  let requestId = crypto.randomUUID();
  const t = text => window.XyntalI18n?.t(text) || text;
  document.querySelectorAll('[data-feedback-open]').forEach(link => link.addEventListener('click', async e => {
    e.preventDefault(); dialog.showModal();
    try {
      const me = await currentMember();
      if (me && !form.elements.name.value) form.elements.name.value = me.name || '';
      if (me && !form.elements.email.value) form.elements.email.value = me.email || '';
    } catch { /* Guests can send feedback too. */ }
  }));
  dialog.querySelectorAll('[data-feedback-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy || !form.reportValidity()) return;
    busy = true; submit.disabled = true; status.textContent = t(form.dataset.sending || 'Feedback wird gesendet …'); status.className = 'form-status';
    try {
      const response = await fetch('/api/beta-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...Object.fromEntries(new FormData(form)), requestId }), signal: AbortSignal.timeout(25000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Das Feedback konnte nicht gesendet werden. Bitte versuche es erneut.');
      form.hidden = true;
      dialog.querySelector('[data-feedback-success]').hidden = false;
      dialog.querySelector('[data-feedback-success] button').focus();
    } catch (error) {
      status.textContent = t(error.name === 'TimeoutError' ? 'Der Versand dauert zu lange. Bitte versuche es erneut.' : error.message);
      status.className = 'form-status error';
    } finally { busy = false; submit.disabled = false; }
  });
})();
