// Eine Anmeldung für alle xyntal.com-Adressen (public/session-share.js):
// zwei „Adressen“ mit getrenntem localStorage und gemeinsamem Cookie-Speicher.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../public/session-share.js'), 'utf8');
const KEY = 'sb-db-auth-token';

const jar = new Map(); // gemeinsame Cookies für .xyntal.com (und für .xyntal.de beim Admin, eigener Speicher)
function origin(hostname, initial = {}) {
  const store = new Map(Object.entries(initial));
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
  };
  const document = {
    get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join('; '); },
    set cookie(text) {
      const [pair, ...attrs] = text.split('; ');
      const i = pair.indexOf('=');
      const domain = /(^|\.)xyntal\.de$/.test(hostname) ? '.xyntal.de' : '.xyntal.com';
      assert.ok(attrs.includes('Domain=' + domain), 'Cookie gilt für die Adressen von ' + domain + ': ' + text);
      assert.ok(attrs.includes('Secure') && attrs.includes('SameSite=Lax') && attrs.includes('Path=/'), text);
      assert.ok(pair.length < 4000, 'Cookie-Teil bleibt unter der Größengrenze');
      if (attrs.includes('Max-Age=0')) jar.delete(pair.slice(0, i)); else jar.set(pair.slice(0, i), pair.slice(i + 1));
    },
  };
  const window = {};
  const load = () => vm.runInNewContext(source, { window, document, localStorage, location: { hostname, protocol: 'https:' }, atob, Date, JSON, Math, Number, String, Array, decodeURIComponent, encodeURIComponent });
  load();
  return { localStorage, window, reload: load, get session() { return JSON.parse(localStorage.getItem(KEY) || 'null'); } };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const session = (sub, exp, extra = {}) => ({
  access_token: `${b64({ alg: 'HS256' })}.${b64({ sub, exp, email: `${sub}@example.com`, user_metadata: { name: 'Zoë Müller', ...extra } })}.sig`,
  refresh_token: `r-${sub}-${exp}`, expires_at: exp, expires_in: 3600, token_type: 'bearer',
  user: { id: sub, email: `${sub}@example.com`, identities: [{ provider: 'email' }] },
});
const now = Math.floor(Date.now() / 1000);

// 1. Auf der Hauptseite angemeldet: die erste Seite legt das Cookie an, die www-Adresse übernimmt die Sitzung
const main = origin('xyntal.com', { [KEY]: JSON.stringify(session('u1', now + 3600)) });
const www = origin('www.xyntal.com');
assert.equal(www.session.access_token, main.session.access_token);
assert.equal(www.session.refresh_token, 'r-u1-' + (now + 3600));
assert.equal(www.session.user.id, 'u1');
assert.equal(www.session.user.user_metadata.name, 'Zoë Müller', 'Umlaute aus dem Token');

// 2. Token auf der www-Adresse erneuert: die Hauptseite liest den neuen Stand, Nutzerdaten bleiben
www.window.XyntalSession.storage.setItem(KEY, JSON.stringify(session('u1', now + 7200)));
assert.equal(JSON.parse(main.window.XyntalSession.storage.getItem(KEY)).refresh_token, 'r-u1-' + (now + 7200));
assert.deepEqual(main.session.user.identities, [{ provider: 'email' }]);

// 3. Ein Skript ohne Abgleich hat nur localStorage erneuert: der neuere Stand gewinnt
main.localStorage.setItem(KEY, JSON.stringify(session('u1', now + 9000)));
main.reload();
assert.equal(JSON.parse(www.window.XyntalSession.storage.getItem(KEY)).refresh_token, 'r-u1-' + (now + 9000));

// 4. Großes Token wird auf mehrere Cookies verteilt und wieder zusammengesetzt
const big = session('u1', now + 9500, { bio: 'x'.repeat(6000) });
main.window.XyntalSession.storage.setItem(KEY, JSON.stringify(big));
assert.ok([...jar.keys()].filter((k) => k.startsWith('xy-sess.')).length >= 3);
www.reload();
assert.equal(www.session.access_token, big.access_token);
main.window.XyntalSession.storage.setItem(KEY, JSON.stringify(session('u1', now + 9600)));
assert.equal([...jar.keys()].filter((k) => k.startsWith('xy-sess.')).length, 1, 'übrige Teile werden gelöscht');

// 5. Anderes Konto auf der Hauptseite: gilt auch im Admin, der Kontomenü-Zwischenspeicher fliegt raus
www.localStorage.setItem('xyntal-acct', '{"name":"alt"}');
main.window.XyntalSession.storage.setItem(KEY, JSON.stringify(session('u2', now + 9700)));
www.reload();
assert.equal(www.session.user.id, 'u2');
assert.equal(www.localStorage.getItem('xyntal-acct'), null);

// 6. Abmelden gilt überall
main.window.XyntalSession.storage.removeItem(KEY);
assert.equal(www.window.XyntalSession.storage.getItem(KEY), null);
www.window.XyntalSession.storage.setItem(KEY, JSON.stringify(session('u1', now + 9800)));
main.window.XyntalSession.clear();
www.reload();
assert.equal(www.session, null);

// 7. Andere Schlüssel bleiben je Adresse
main.window.XyntalSession.storage.setItem('sb-db-auth-token-code-verifier', 'abc');
assert.equal(www.window.XyntalSession.storage.getItem('sb-db-auth-token-code-verifier'), null);
console.log('session-share: ok');

// 8. Wer nie angemeldet war, bekommt kein Cookie
jar.clear();
origin('xyntal.com');
assert.equal(jar.size, 0);
console.log('session-share: ohne Anmeldung kein Cookie');

// 9. Admin-Adresse (admin.xyntal.de) setzt ihr Cookie für .xyntal.de (der Setter prüft die Domain)
jar.clear();
origin('admin.xyntal.de', { [KEY]: JSON.stringify(session('u3', now + 3600)) });
assert.ok(jar.size > 0, 'Admin setzt sein Cookie');
console.log('session-share: Admin-Adresse mit eigenem Cookie');
