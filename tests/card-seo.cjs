// Öffentliche Karten in Suchmaschinen: Kopfzeilen der Kartenseite und die Sitemap der Karten.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
const cut = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));
(async () => {
  let reply = { ok: true, json: async () => [] };
  const calls = [];
  const box = { AbortSignal, JSON, Date, Set, Array, String, supabaseConfig: () => ({ url: 'https://db.example', key: 'anon' }),
    fetch: async (url, init) => { calls.push([url, init]); return reply; } };
  vm.runInNewContext(/^const escapeHtml = .*$/m.exec(source)[0] + '\n' + cut('function withProfileMeta', 'function mimeBody')
    + cut('let cardSitemap =', 'function supabaseConfig() {') + '\nthis.withProfileMeta = withProfileMeta; this.cardSitemapXml = cardSitemapXml; this.reset = () => { cardSitemap = { xml: null, until: 0 }; };', box);

  // Kartenseite: ohne Karte bleibt „noindex“, mit Karte Canonical und ProfilePage
  const page = fs.readFileSync(path.resolve(__dirname, '../public/u.html'), 'utf8');
  assert.match(page, /<meta name="robots" content="noindex">/);
  const html = box.withProfileMeta(page, { name: 'Ada <b>', title: 'Ada <b> · xyntal.de/ada', description: 'Baut </script><script>x' }, 'ada');
  assert.doesNotMatch(html, /name="robots"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/xyntal\.de\/ada">/);
  assert.equal(html.split('</script><script>x').length, 1, 'kein Ausbruch aus dem JSON-LD');
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(html)[1]);
  assert.equal(ld['@type'], 'ProfilePage');
  assert.deepEqual(ld.mainEntity, { '@type': 'Person', name: 'Ada <b>', description: 'Baut </script><script>x', url: 'https://xyntal.de/ada' });
  assert.match(html, /<title>Ada &lt;b&gt; · xyntal\.de\/ada<\/title>/);

  // Sitemap: nur gültige Namen, klein geschrieben, ohne Dopplungen
  reply = { ok: true, json: async () => [{ handle: 'Nico' }, { handle: 'ada' }, { handle: 'ada' }, { handle: 'x"><y' }, { handle: null }, {}] };
  const xml = await box.cardSitemapXml();
  assert.equal(calls[0][0], 'https://db.example/rest/v1/rpc/get_member_cards');
  assert.deepEqual(xml.match(/<loc>[^<]+<\/loc>/g), ['<loc>https://xyntal.de/ada</loc>', '<loc>https://xyntal.de/nico</loc>']);
  // gemerkt: zweite Abfrage ohne neuen Aufruf
  await box.cardSitemapXml();
  assert.equal(calls.length, 1);
  // Störung: null statt einer leeren Liste
  box.reset();
  reply = { ok: false, json: async () => ({}) };
  assert.equal(await box.cardSitemapXml(), null);
  console.log('PASS: Karten-Kopfzeilen (Canonical, ProfilePage, kein noindex) und Sitemap der Karten');
})().catch((e) => { console.error(e); process.exit(1); });
