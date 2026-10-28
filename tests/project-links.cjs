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
  vm.runInNewContext(prefix + `\nlet projects = [{id:5,share_slug:'nico-projekt.xy'}, {id:6}, {id:7,share_slug:'bad/slug.xy'}]; globalThis.result={detailHref,isDetail,detailSlug};`, context);
  return context.result;
}
(async () => {
  const short = links('/nico-projekt.xy');
  assert.equal(short.isDetail, true);
  assert.equal(short.detailSlug, 'nico-projekt.xy');
  assert.equal(short.detailHref(5), '/nico-projekt.xy');
  assert.equal(short.detailHref('5'), '/nico-projekt.xy');
  assert.equal(short.detailHref(6), '/projekte?projekt=6');
  assert.equal(short.detailHref(7), '/projekte?projekt=7');
  assert.equal(links('/projekte', '?projekt=5').isDetail, true);
  assert.equal(links('/nico-projekt.xy/').detailSlug, 'nico-projekt.xy');
  assert.equal(links('/style.css').isDetail, false);
  let server;
  const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
  const serving = source.slice(source.indexOf('const types =')).replace(/\.listen\(Number\(process.env.SERVER_PORT \|\| process.env.PORT \|\| 4129\), '0.0.0.0', \(\) => console.log\('Xyntal Daki server ready'\)\)/, ".listen(0, '127.0.0.1')");
  vm.runInNewContext(serving, { http: { createServer: fn => (server = http.createServer(fn)) }, fs, path, root, URL, commit: 'test', updating: false, update() {}, setInterval() {} });
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (const url of ['/nico-projekt.xy', '/nico-projekt-6.xy', '/projekt-9.xy', '/nico-projekt.xy/']) {
      const res = await fetch(origin + url);
      assert.equal(res.status, 200, url);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.match(await res.text(), /projects\.js/);
    }
    const redirect = await fetch(origin + '/nico-projekt.xy/?foo=bar', { redirect: 'manual' });
    assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), '/nico-projekt.xy?foo=bar');
    const card = await fetch(origin + '/nico');
    assert.equal(card.status, 200); assert.match(await card.text(), /u\.js/);
    const missing = await fetch(origin + '/does-not-exist.bad'); assert.equal(missing.status, 404);
    const head = await fetch(origin + '/nico-projekt.xy', { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(await head.text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
  console.log('PASS: short and legacy project links, safe fallback, Daki GET/HEAD routing, profile route, 404');
})().catch(error => { console.error(error); process.exitCode = 1; });
