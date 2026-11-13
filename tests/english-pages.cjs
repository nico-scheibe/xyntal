// Englische Seiten unter /en/…: vom Server aus den deutschen Seiten und dem Wörterbuch (i18n-en.js) erzeugt.
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
  vm.runInNewContext(serving, { require, Buffer, AbortSignal, console, process, URL, fetch: async () => { throw new Error('kein fetch erwartet'); }, http: { createServer: fn => (server = http.createServer(fn)) }, fs, path, root,
    commit: 'test', updating: false, update() {}, setInterval() {}, mediaHandler: () => false, profileMeta: async () => null, withProfileMeta: (h) => h, cardSitemapXml: async () => null });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port;
  const get = (host, url) => new Promise((resolve, reject) => {
    http.request({ host: '127.0.0.1', port, path: url, headers: { host } }, (res) => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject).end();
  });
  try {
    const pages = ['index', 'matching', 'demo', 'preise', 'unternehmen', 'beta', 'ueber-uns', 'community', 'mitglieder', 'community-richtlinien', 'kuendigen'];
    const en = (p) => (p === 'index' ? '/en' : '/en/' + p), de = (p) => (p === 'index' ? '/' : '/' + p);
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    for (const p of pages) {
      const r = await get('xyntal.de', en(p));
      assert.equal(r.status, 200, en(p));
      assert.equal(r.headers['content-language'], 'en');
      assert.match(r.body, /<html lang="en"/, p);
      assert.ok(r.body.includes(`<link rel="canonical" href="https://xyntal.de${en(p)}">`), 'canonical ' + p);
      // dieselben drei Sprachverweise auf der deutschen und der englischen Fassung
      const german = fs.readFileSync(path.join(root, p + '.html'), 'utf8');
      for (const html of [german, r.body]) {
        assert.ok(html.includes(`<link rel="alternate" hreflang="de" href="https://xyntal.de${de(p)}">`), 'hreflang de ' + p);
        assert.ok(html.includes(`<link rel="alternate" hreflang="en" href="https://xyntal.de${en(p)}">`), 'hreflang en ' + p);
        assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="https://xyntal.de${de(p)}">`), 'x-default ' + p);
      }
      // Titel und Beschreibung sind übersetzt (nicht mehr der deutsche Text)
      const head = (html, re) => (re.exec(html) || [])[1];
      for (const re of [/<title>([^<]*)<\/title>/, /<meta name="description" content="([^"]*)"/]) {
        assert.ok(head(r.body, re), p + ' ' + re);
        assert.notEqual(head(r.body, re), head(german, re), p + ' nicht übersetzt: ' + head(german, re));
      }
      // keine Pfade relativ zu /en/ (sie würden ins Leere zeigen), Dateien liegen nur einmal
      assert.doesNotMatch(r.body, /\s(?:href|src)="(?![a-z][a-z0-9+.-]*:|\/|#|\?)[^"]/i, 'relativer Pfad auf ' + en(p));
      // Hauptnavigation bleibt im Englischen
      assert.match(r.body, /<a[^>]*\shref="\/en\/preise"/, 'Navigation ' + p);
      // strukturierte Daten bleiben gültig, ohne die deutsche Fragen-Liste
      for (const m of r.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        const graph = JSON.parse(m[1])['@graph'];
        assert.ok(graph.every((node) => node['@type'] !== 'FAQPage'), 'FAQ ' + p);
      }
      if (p !== 'mitglieder') assert.ok(sitemap.includes(`<loc>https://xyntal.de${en(p)}</loc>`), 'Sitemap ' + en(p));
    }
    // Stichproben für den Text
    assert.match((await get('xyntal.de', '/en')).body, /You have the idea\./);
    assert.match((await get('xyntal.de', '/en/preise')).body, /Start for free\./);
    assert.match((await get('xyntal.de', '/en/mitglieder')).body, /<meta name="robots" content="noindex, follow">/);
    // App-Screenshots: englische Fassung aus assets/img/en/, die deutsche Seite behält die deutschen Bilder
    const enHome = (await get('xyntal.de', '/en')).body;
    for (const shot of ['discover-2880', 'profil-1440', 'home-1920', 'chat-960', 'projects-1920']) {
      assert.ok(fs.existsSync(path.join(root, 'assets/img/en', shot + '.webp')), 'Datei en/' + shot);
      assert.ok(enHome.includes('/assets/img/en/' + shot + '.webp'), 'englisches Bild ' + shot);
    }
    assert.doesNotMatch(enHome, /\/assets\/img\/(?!en\/)[a-z0-9-]+\.webp/, 'kein deutsches Bild auf /en');
    assert.doesNotMatch((await get('xyntal.de', '/')).body, /assets\/img\/en\//, 'deutsche Startseite ohne englische Bilder');
    // was unter data-no-i18n steht, bleibt unverändert
    assert.match((await get('xyntal.de', '/en/ueber-uns')).body, /<a href="mailto:admin@xyntal.com" data-no-i18n>admin@xyntal.com<\/a>/);

    // Adressen: eine pro Seite, Rest leitet weiter
    for (const [host, url, status, to] of [
      ['xyntal.de', '/en/', 301, '/en'], ['xyntal.de', '/en/index.html', 301, '/en'], ['xyntal.de', '/en/preise.html?jahr=1', 301, '/en/preise?jahr=1'],
      ['xyntal.de', '/en/preise/', 301, '/en/preise'], ['www.xyntal.de', '/en/preise', 301, 'https://xyntal.de/en/preise'],
      // deutsche Seiten ohne englische Fassung (AGB, Login …): weiter zur deutschen Adresse
      // umgezogene Seite: der frühere Brief ist heute „Über uns“
      ['xyntal.de', '/brief', 301, 'https://xyntal.de/ueber-uns'], ['xyntal.de', '/en/brief', 301, 'https://xyntal.de/en/ueber-uns'], ['xyntal.de', '/brief.html?x=1', 301, 'https://xyntal.de/ueber-uns?x=1'],
      ['xyntal.de', '/en/agb', 302, '/agb'], ['xyntal.de', '/en/login?next=beta', 302, '/login?next=beta'],
    ]) {
      const r = await get(host, url);
      assert.equal(r.status, status, host + url);
      assert.equal(r.headers.location, to, host + url);
    }
    // Dateien unter /en/ sind dieselben wie ohne; Unbekanntes gibt es nicht; kein Admin über /en
    assert.equal((await get('xyntal.de', '/en/css/neu.css')).body, fs.readFileSync(path.join(root, 'css/neu.css'), 'utf8'));
    assert.equal((await get('xyntal.de', '/en/gibt-es-nicht')).status, 404);
    assert.equal((await get('xyntal.de', '/en/niemand')).status, 404);
    for (const url of ['/en/admin', '/en/admin.html']) { // weiter zu /admin, das es auf xyntal.de nicht gibt
      const r = await get('xyntal.de', url);
      assert.equal(r.status, 302, url);
      assert.equal(r.headers.location, '/admin');
      assert.doesNotMatch(r.body, /pages\/admin/);
    }
    for (const url of ['/en/pages/admin.js', '/en/admin.css', '/en/world-geo.js']) assert.equal((await get('xyntal.de', url)).status, 404, url);
    // deutsche Seiten bleiben deutsch
    assert.match((await get('xyntal.de', '/preise')).body, /<html lang="de"/);
    console.log('PASS: englische Seiten unter /en (Text, Kopfzeilen, hreflang, Pfade, Weiterleitungen)');
  } finally { server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
