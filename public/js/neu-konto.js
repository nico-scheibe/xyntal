/* ==========================================================================
   Xyntal · Startseite: Wer schon dabei ist oder sich beworben hat, sieht keinen
   „Bewerben“-Knopf mehr.

   Zustand als Klasse am <html>:
     beta-in       angenommen, oder ein älteres Konto ohne Pflicht-Bewerbung
     beta-applied  beworben, aber (noch) nicht angenommen
   Die Klassen blenden [data-apply] aus und [data-if="in"] / [data-if="applied"] ein (css/neu.css).

   Damit beim nächsten Besuch nichts aufblitzt, merkt sich der Browser den Stand
   („xy-beta“); neu-boot.js setzt die Klasse daraus schon vor dem ersten Zeichnen.
   Hier wird er mit der Datenbank abgeglichen (Supabase-RPCs wie auf /beta).
   ========================================================================== */
(function () {
  'use strict';
  var SUPA = 'https://db.xyntal.de';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzk0MTc3MzEwLCJleHAiOjE5NTE4NTczMTB9.1H1nAG_eqZLMIsCvkNDqdCGDluTM0p3zhdx5aWLvToQ';   // öffentlicher anon-Schlüssel, derselbe wie in invite.js
  var root = document.documentElement;

  function session() {
    try {
      var s = JSON.parse(localStorage.getItem('sb-db-auth-token') || 'null');
      if (s && s.access_token && s.user && s.user.id) return { jwt: s.access_token, uid: s.user.id, fresh: !s.expires_at || s.expires_at * 1000 > Date.now() + 30000 };
    } catch (e) { /* privater Modus */ }
    return null;
  }
  function apply(state) {
    root.classList.toggle('beta-in', state === 'in');
    root.classList.toggle('beta-applied', state === 'applied');
  }
  function remember(uid, state) {
    try { if (state) localStorage.setItem('xy-beta', JSON.stringify({ uid: uid, s: state })); else localStorage.removeItem('xy-beta'); } catch (e) {}
  }
  function rpc(fn, jwt) {
    return fetch(SUPA + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { if (!r.ok) throw new Error(fn); return r.json(); });
  }

  var s = session();
  if (!s) { apply(''); remember('', ''); return; }      // abgemeldet: Knöpfe zeigen
  if (!s.fresh) return;                                  // Sitzung abgelaufen: beim gemerkten Stand bleiben, nichts raten

  Promise.all([rpc('get_my_beta_application', s.jwt), rpc('beta_application_required', s.jwt)]).then(function (res) {
    var mine = res[0], required = res[1] === true;
    var state = '';
    if (mine && mine.status) state = mine.status === 'angenommen' ? 'in' : 'applied';
    else if (!required) state = 'in';                    // älteres Konto, für das keine Bewerbung nötig ist
    apply(state); remember(s.uid, state);
  }).catch(function () { /* ohne Netz oder bei einem Fehler bleibt der gemerkte Stand */ });
})();
