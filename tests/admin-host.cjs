// Admin-Bereich nur auf admin.xyntal.de: xyntal.de liefert Admin-Seite und -Skripte nicht aus,
// admin.xyntal.de zeigt den Admin auf / und leitet normale Seiten auf xyntal.de um.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const root = path.resolve(__dirname, '../public');
(async () => {
  let server;
  const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
  const serving = source.slice(source.indexOf('const types =')).replace(/\.listen\(Number\(process.env.SERVER_PORT \|\| process.env.PORT \|\| 4129\), '0.0.0.0'[^)]*\)\)/, ".listen(0, '127.0.0.1')");
  vm.runInNewContext(serving, { require, Buffer, AbortSignal, fetch: async () => { throw new Error('kein fetch erwartet'); }, http: { createServer: fn => (server = http.createServer(fn)) }, fs, path, root, URL, process: { env: {} }, console,
    commit: 'test', updating: false, update() {}, setInterval() {}, mediaHandler: () => false, profileMeta: async () => null, withProfileMeta: (h) => h });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const get = (host, url, method = 'GET') => new Promise((resolve, reject) => {
    http.request({ host: '127.0.0.1', port, path: url, method, headers: { host } }, (res) => {
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

    // Eine Adresse pro Seite: .html, /index.html, Schrägstrich am Ende und www leiten dauerhaft um
    for (const [host, url, to] of [
      ['xyntal.de', '/preise.html', '/preise'], ['xyntal.de', '/preise.html?jahr=1', '/preise?jahr=1'], ['xyntal.de', '/index.html', '/'],
      ['xyntal.de', '/index', '/'], ['xyntal.de', '/preise/', '/preise'],
      ['www.xyntal.de', '/', 'https://xyntal.de/'], ['www.xyntal.de', '/preise?jahr=1', 'https://xyntal.de/preise?jahr=1'], ['www.xyntal.de', '/beta.html', 'https://xyntal.de/beta'],
    ]) {
      const r = await get(host, url);
      assert.equal(r.status, 301, host + url);
      assert.equal(r.headers.location, to, host + url);
    }
    // Dateien und Wunsch-Links bleiben, wo sie sind
    for (const url of ['/preise', '/robots.txt', '/sitemap.xml', '/css/neu.css', '/irgendwer', '/irgendwer/']) assert.equal((await get('xyntal.de', url)).status, 200, url);
    // Unveränderte Dateien kommen beim zweiten Mal als 304 ohne Inhalt
    {
      const first = await get('xyntal.de', '/css/neu.css');
      assert.match(first.headers.etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
      assert.equal(first.headers['cache-control'], 'no-cache');
      const again = await new Promise((resolve, reject) => http.request({ host: '127.0.0.1', port, path: '/css/neu.css', headers: { host: 'xyntal.de', 'if-none-match': first.headers.etag } }, (res) => { let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body })); }).on('error', reject).end());
      assert.equal(again.status, 304);
      assert.equal(again.body, '');
      assert.equal((await get('xyntal.de', '/fonts/archivo-latin.woff2')).headers['cache-control'], 'public, max-age=2592000');
    }

    // Ohne Cloudflare Access: admin.xyntal.de lädt direkt, die Anmeldung samt 2FA schützt den Inhalt
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
