// Admin-Bereich nur auf admin.xyntal.de: xyntal.de liefert Admin-Seite und -Skripte nicht aus,
// admin.xyntal.de zeigt den Admin auf / und leitet normale Seiten auf xyntal.de um.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const root = path.resolve(__dirname, '../public');
const crypto = require('node:crypto');
const TEAM = 'https://morning-star-6e71.cloudflareaccess.com';
const AUD = 'f9b85c2db9a059c6b91e49223ffa7e979815ad4bab173b5b47e8b2a1bc9d52bc';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] };
function jwt(claims, { kid = 'k1', key = privateKey } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = enc({ alg: 'RS256', kid, typ: 'JWT' }) + '.' + enc(claims);
  return body + '.' + crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64url');
}
const now = Math.floor(Date.now() / 1000);
const good = jwt({ aud: [AUD], iss: TEAM, exp: now + 600, iat: now, email: 'x@example.com' });
(async () => {
  let server;
  const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
  const serving = source.slice(source.indexOf('const types =')).replace(/\.listen\(Number\(process.env.SERVER_PORT \|\| process.env.PORT \|\| 4129\), '0.0.0.0'[^)]*\)\)/, ".listen(0, '127.0.0.1')");
  let certFetches = 0;
  const fakeFetch = async (url) => { assert.equal(url, TEAM + '/cdn-cgi/access/certs'); certFetches++; return { json: async () => jwks }; };
  vm.runInNewContext(serving, { require, Buffer, AbortSignal, fetch: fakeFetch, http: { createServer: fn => (server = http.createServer(fn)) }, fs, path, root, URL, process: { env: {} }, console,
    commit: 'test', updating: false, update() {}, setInterval() {}, mediaHandler: () => false, profileMeta: async () => null, withProfileMeta: (h) => h });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const get = (host, url, method = 'GET', token = host.toLowerCase().startsWith('admin.') ? good : null) => new Promise((resolve, reject) => {
    http.request({ host: '127.0.0.1', port, path: url, method, headers: token ? { host, 'cf-access-jwt-assertion': token } : { host } }, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject).end();
  });
  try {
    for (const url of ['/admin', '/admin.html', '/admin/', '/admin.css', '/admin-contracts.css', '/world-geo.js', '/pages/admin.js', '/pages/admin-platform.js', '/pages/admin-contracts.js', '/pages/admin-people.js', '/pages/../pages/admin.js']) {
      for (const host of ['xyntal.de', 'www.xyntal.de', 'localhost:4129']) {
        const r = await get(host, url);
        // /admin/ fällt wie jeder Wunsch-Link auf die öffentliche Kartenseite – ohne Admin-Inhalt
        if (url !== '/admin/') assert.equal(r.status, 404, host + url);
        assert.doesNotMatch(r.body, /admin-platform|pages\/admin|data-tab=/, host + url);
      }
    }
    assert.equal((await get('xyntal.de', '/admin', 'HEAD')).status, 404);
    assert.equal((await get('xyntal.de', '/login')).status, 200);
    assert.equal((await get('xyntal.de', '/')).status, 200);

    // Ohne gültiges Cloudflare-Access-Token: 403 für alles auf admin.xyntal.de (auch bei direktem Zugriff auf die IP)
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    for (const token of ['', 'abc', good.slice(0, -4) + 'AAAA',
      jwt({ aud: ['other'], iss: TEAM, exp: now + 600 }),
      jwt({ aud: [AUD], iss: 'https://evil.cloudflareaccess.com', exp: now + 600 }),
      jwt({ aud: [AUD], iss: TEAM, exp: now - 10 }),
      jwt({ aud: [AUD], iss: TEAM, exp: now + 600 }, { key: other }),
      jwt({ aud: [AUD], iss: TEAM, exp: now + 600 }, { kid: 'unknown' })]) {
      for (const url of ['/', '/pages/admin.js', '/api/beta-status-mail', '/__deployment']) {
        const r = await get('admin.xyntal.de', url, 'GET', token);
        assert.equal(r.status, 403, url + ' ' + token.slice(0, 20));
        assert.doesNotMatch(r.body, /admin/);
      }
    }
    assert.ok(certFetches <= 2, 'Schlüssel werden zwischengespeichert: ' + certFetches);
    for (const url of ['/', '/admin', '/admin/']) {
      const r = await get('admin.xyntal.de', url);
      assert.equal(r.status, 200, url);
      assert.match(r.body, /pages\/admin\.js/);
      assert.equal(r.headers['x-robots-tag'], 'noindex, nofollow');
    }
    for (const url of ['/pages/admin.js', '/admin.css', '/world-geo.js', '/config.js', '/style.css', '/vendor/supabase.js']) {
      assert.equal((await get('admin.xyntal.de', url)).status, 200, url);
    }
    assert.equal((await get('admin.xyntal.de', '/login?next=admin')).status, 200);
    assert.equal((await get('Admin.Xyntal.de:443', '/')).status, 200);
    for (const [url, to] of [['/profil', 'https://xyntal.de/profil'], ['/preise.html', 'https://xyntal.de/preise.html'], ['/nico', 'https://xyntal.de/nico'], ['/nico-xyntal?x=1', 'https://xyntal.de/nico-xyntal?x=1']]) {
      const r = await get('admin.xyntal.de', url);
      assert.equal(r.status, 308, url); assert.equal(r.headers.location, to, url);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('PASS: Admin nur auf admin.xyntal.de, 404 auf xyntal.de, Umleitung normaler Seiten');
})().catch(error => { console.error(error); process.exitCode = 1; });
