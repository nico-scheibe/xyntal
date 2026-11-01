// /app-anmeldung: the sign-in mail from the Xyntal desktop app links here.
// Supabase appends ?code=… (PKCE). Only the app that asked for the mail holds
// the matching verifier, so this page never touches the code itself: it hands
// it to the app through the xyntal:// scheme and explains what to do when
// the mail was opened somewhere else (another computer, a phone).
(function () {
  var params = new URLSearchParams(location.search);
  var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  var code = params.get('code') || '';
  var error = params.get('error_description') || hash.get('error_description') || '';

  function show(step) {
    document.querySelectorAll('#handoff [data-step]').forEach(function (el) {
      el.hidden = el.getAttribute('data-step') !== step;
    });
  }

  if (error) {
    show('error');
    if (!/expired|invalid|abgelaufen/i.test(error)) document.getElementById('error-text').textContent = error;
    return;
  }
  if (!/^[A-Za-z0-9-]{8,200}$/.test(code)) {
    show('empty');
    return;
  }
  var target = 'xyntal://auth/callback?code=' + encodeURIComponent(code);
  document.getElementById('open-app').href = target;
  show('open');
  // Hand over right away; the button stays for browsers that ask first.
  setTimeout(function () { location.href = target; }, 300);
  // Keep the code out of history and screenshots once handed over.
  history.replaceState(null, '', location.pathname);
})();
