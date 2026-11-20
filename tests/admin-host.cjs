// Admin-Bereich nur auf admin.xyntal.de: xyntal.com liefert Admin-Seite und -Skripte nicht aus,
// admin.xyntal.de zeigt den Admin auf / und leitet normale Seiten auf xyntal.com um.
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
    commit: 'test', updating: false, update() {}, setInterval() {}, mediaHandler: () => false, profileMeta: async (handle) => handle === 'nico' ? { title: 'Nico · xyntal.com/nico', description: 'Baut Xyntal.' } : handle === 'stoerung' ? undefined : null, withProfileMeta: (h) => h });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const get = (host, url, method = 'GET') => new Promise((resolve, reject) => {
    http.request({ host: '127.0.0.1', port, path: url, method, headers: { host } }, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject).end();
  });
  try {
    for (const url of ['/admin', '/admin.html', '/admin/', '/admin.css', '/admin-contracts.css', '/world-geo.js', '/pages/admin.js', '/pages/admin-platform.js', '/pages/admin-contracts.js', '/pages/admin-people.js', '/pages/admin-support.js', '/pages/admin-partners.js', '/pages/admin-vouchers.js', '/admin-support.css', '/pages/../pages/admin.js']) {
      for (const host of ['xyntal.com', 'www.xyntal.com', 'localhost:4129']) {
        const r = await get(host, url);
        // /admin/ fällt wie jeder Wunsch-Link auf die öffentliche Kartenseite – ohne Admin-Inhalt
        if (url !== '/admin/') assert.equal(r.status, 404, host + url);
        assert.doesNotMatch(r.body, /admin-platform|pages\/admin|data-tab=/, host + url);
      }
    }
    // Dieselbe Zusage ohne Aufzählung: Was im Dateibaum nach Admin aussieht, muss auf xyntal.com fehlen.
    // So fällt die nächste neue Admin-Seite von selbst auf, auch wenn niemand eine Liste pflegt.
    {
      const adminFiles = [
        ...fs.readdirSync(root).filter(name => /^admin.*\.(html|css)$/i.test(name)).map(name => '/' + name),
        ...fs.readdirSync(path.join(root, 'pages')).filter(name => /^admin.*\.js$/i.test(name)).map(name => '/pages/' + name),
      ];
      assert.ok(adminFiles.length >= 11, 'Admin-Dateien gefunden: ' + adminFiles.length);
      for (const url of adminFiles) {
        assert.equal((await get('xyntal.com', url)).status, 404, 'xyntal.com' + url + ' muss 404 sein');
        // Gegenprobe: im Admin-Bereich ist dieselbe Datei erreichbar, die Sperre gilt nur öffentlich
        assert.equal((await get('admin.xyntal.de', url)).status, 200, 'admin.xyntal.de' + url + ' muss 200 sein');
      }
    }
    assert.equal((await get('xyntal.com', '/admin', 'HEAD')).status, 404);
    assert.equal((await get('xyntal.com', '/login')).status, 200);
    assert.equal((await get('xyntal.com', '/')).status, 200);

    // Eine Adresse pro Seite: .html, /index.html, Schrägstrich am Ende und www leiten dauerhaft um
    for (const [host, url, to] of [
      ['xyntal.com', '/preise.html', '/preise'], ['xyntal.com', '/preise.html?jahr=1', '/preise?jahr=1'], ['xyntal.com', '/index.html', '/'],
      ['xyntal.com', '/index', '/'], ['xyntal.com', '/preise/', '/preise'],
      ['www.xyntal.com', '/', 'https://xyntal.com/'], ['www.xyntal.com', '/preise?jahr=1', 'https://xyntal.com/preise?jahr=1'], ['www.xyntal.com', '/beta.html', 'https://xyntal.com/beta'],
    ]) {
      const r = await get(host, url);
      assert.equal(r.status, 301, host + url);
      assert.equal(r.headers.location, to, host + url);
    }
    // Dateien und Wunsch-Links bleiben, wo sie sind
    for (const url of ['/preise', '/robots.txt', '/sitemap.xml', '/css/neu.css', '/nico', '/nico/', '/stoerung']) assert.equal((await get('xyntal.com', url)).status, 200, url);
    // Wunsch-Link ohne öffentliche Karte: 404, aber mit der Kartenseite als Inhalt (sie zeigt „gibt es nicht“ / „reserviert“)
    {
      const r = await get('xyntal.com', '/irgendwer');
      assert.equal(r.status, 404);
      assert.match(r.body, /u\.js/);
    }
    // Bestätigungsdatei der Google Search Console: genau diese Adresse, ohne Weiterleitung
    {
      const r = await get('xyntal.com', '/google9117876a08b467ff.html');
      assert.equal(r.status, 200);
      assert.equal(r.body.trim(), 'google-site-verification: google9117876a08b467ff.html');
    }
    // Unveränderte Dateien kommen beim zweiten Mal als 304 ohne Inhalt
    {
      const first = await get('xyntal.com', '/css/neu.css');
      assert.match(first.headers.etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
      assert.equal(first.headers['cache-control'], 'no-cache');
      const again = await new Promise((resolve, reject) => http.request({ host: '127.0.0.1', port, path: '/css/neu.css', headers: { host: 'xyntal.com', 'if-none-match': first.headers.etag } }, (res) => { let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, body })); }).on('error', reject).end());
      assert.equal(again.status, 304);
      assert.equal(again.body, '');
      assert.equal((await get('xyntal.com', '/fonts/archivo-latin.woff2')).headers['cache-control'], 'public, max-age=2592000');
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
    for (const [url, to] of [['/profil', 'https://xyntal.com/profil'], ['/preise.html', 'https://xyntal.com/preise.html'], ['/nico', 'https://xyntal.com/nico'], ['/nico-xyntal?x=1', 'https://xyntal.com/nico-xyntal?x=1']]) {
      const r = await get('admin.xyntal.de', url);
      assert.equal(r.status, 308, url); assert.equal(r.headers.location, to, url);
    }
    // Der ausgerollte Commit ist auf admin.xyntal.de nirgends abzuholen (dort schützt nichts an der Kante):
    // /__deployment antwortet hart mit 404 – keine Umleitung, die den Endpunkt auf xyntal.com wieder zeigt.
    {
      const r = await get('admin.xyntal.de', '/__deployment');
      assert.equal(r.status, 404, '/__deployment auf admin.xyntal.de');
      assert.equal(r.headers.location, undefined, '/__deployment darf nicht umleiten');
      assert.doesNotMatch(r.body, /commit/, '/__deployment darf den Commit nicht nennen');
      const oeffentlich = await get('xyntal.com', '/__deployment');
      assert.equal(oeffentlich.status, 200, '/__deployment auf xyntal.com');
      assert.equal(JSON.parse(oeffentlich.body).branch, 'main');
      assert.equal(JSON.parse(oeffentlich.body).commit, 'test');
    }
    // …und auch nicht als Antwort-Kopfzeile jeder Datei. Auf xyntal.com bleibt die Kopfzeile wie bisher.
    {
      const admin = await get('admin.xyntal.de', '/admin.css');
      assert.equal(admin.status, 200);
      assert.equal(admin.headers['x-xyntal-commit'], undefined, '/admin.css auf admin.xyntal.de');
      assert.match(admin.headers.etag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
      assert.equal((await get('admin.xyntal.de', '/style.css')).headers['x-xyntal-commit'], undefined, '/style.css auf admin.xyntal.de');
      const oeffentlich = await get('xyntal.com', '/style.css');
      assert.equal(oeffentlich.status, 200);
      assert.equal(oeffentlich.headers['x-xyntal-commit'], 'test', '/style.css auf xyntal.com');
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('PASS: Admin nur auf admin.xyntal.de, 404 auf xyntal.com, Umleitung normaler Seiten');
})().catch(error => { console.error(error); process.exitCode = 1; });
