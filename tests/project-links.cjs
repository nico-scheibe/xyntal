const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const root = path.resolve(__dirname, '../public');
const frontend = fs.readFileSync(path.join(root, 'projects.js'), 'utf8');
function links(pathname, search = '') {
  const context = { location: { pathname, search }, URLSearchParams };
  const prefix = frontend.slice(frontend.indexOf('  const PHASE_LABEL'), frontend.indexOf('  const els ='));
  vm.runInNewContext(prefix + `\nlet projects = [{id:5,share_slug:'nico-xyntal'}, {id:6}, {id:7,share_slug:'bad/slug.xy'}]; globalThis.result={detailHref,isDetail,detailSlug};`, context);
  return context.result;
}
(async () => {
  const short = links('/nico-xyntal');
  assert.equal(short.isDetail, true);
  assert.equal(short.detailSlug, 'nico-xyntal');
  assert.equal(short.detailHref(5), '/nico-xyntal');
  assert.equal(short.detailHref('5'), '/nico-xyntal');
  assert.equal(short.detailHref(6), '/projekte?projekt=6');
  assert.equal(short.detailHref(7), '/projekte?projekt=7');
  assert.equal(links('/projekte', '?projekt=5').isDetail, true);
  assert.equal(links('/nico-xyntal/').detailSlug, 'nico-xyntal');
  assert.equal(links('/style.css').isDetail, false);
  assert.equal(links('/projekte').isDetail, false);
  assert.equal(links('/nico-' + 'a'.repeat(80)).isDetail, true);
  let server;
  const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
  const serving = source.slice(source.indexOf('const types =')).replace(/\.listen\(Number\(process.env.SERVER_PORT \|\| process.env.PORT \|\| 4129\), '0.0.0.0', \(\) => console.log\('Xyntal Daki server ready'\)\)/, ".listen(0, '127.0.0.1')");
  vm.runInNewContext(serving, { http: { createServer: fn => (server = http.createServer(fn)) }, fs, path, root, URL, commit: 'test', updating: false, update() {}, setInterval() {} });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (const url of ['/nico-xyntal', '/nico-xyntal-6', '/projekt-meine-idee-9', '/nico-xyntal/']) {
      const res = await fetch(origin + url);
      assert.equal(res.status, 200, url);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.match(await res.text(), /projects\.js/);
    }
    const redirect = await fetch(origin + '/nico-xyntal/?foo=bar', { redirect: 'manual' });
    assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/nico-xyntal?foo=bar');
    const existing = await fetch(origin + '/mitglied-werden');
    assert.equal(existing.status, 200); assert.doesNotMatch(await existing.text(), /projects\.js/);
    const card = await fetch(origin + '/nico');
    assert.equal(card.status, 200); assert.match(await card.text(), /u\.js/);
    const missing = await fetch(origin + '/does-not-exist.bad'); assert.equal(missing.status, 404);
    const head = await fetch(origin + '/nico-xyntal', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('PASS: short and legacy project links, safe fallback, Daki GET/HEAD routing, profile route, 404');
})().catch(error => { console.error(error); process.exitCode = 1; });
