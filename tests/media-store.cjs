// Uploads der freien Seite auf den eigenen Server (hosting/daki/media-store.cjs) mit nachgebautem
// S3-Bucket und nachgebautem Supabase. Start: node tests/media-store.cjs
const assert = require('node:assert/strict');
const http = require('node:http');
const { createMediaHandler, sign } = require('../hosting/daki/media-store.cjs');

const ADMIN = '00000000-0000-0000-0000-00000000000a', USER = '00000000-0000-0000-0000-00000000000b';
const tokens = { ['a'.repeat(30)]: ADMIN, ['b'.repeat(30)]: USER };
const objects = new Map();
const listen = (srv) => new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv.address().port)));

(async () => {
  // S3: prüft die Signatur mit den empfangenen Daten (Pfad, Query, Header) und speichert im Speicher
  const s3 = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const auth = req.headers.authorization || '';
    const signedNames = (/SignedHeaders=([^,]+)/.exec(auth) || [])[1].split(';');
    const headers = Object.fromEntries(signedNames.filter((n) => !['host', 'x-amz-content-sha256', 'x-amz-date'].includes(n)).map((n) => [n, req.headers[n]]));
    const d = req.headers['x-amz-date'];
    const again = sign({ method: req.method, host: req.headers.host, path: decodeURIComponent(u.pathname), query: Object.fromEntries(u.searchParams), headers,
      payloadHash: req.headers['x-amz-content-sha256'], region: 'nbg1', accessKey: 'AK', secretKey: 'SK',
      now: new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}Z`) });
    if (again.authorization !== auth) { res.writeHead(403); return res.end('SignatureDoesNotMatch'); }
    const key = decodeURIComponent(u.pathname).replace(/^\/bucket\//, '');
    if (req.method === 'PUT') { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => { objects.set(key, { body: Buffer.concat(c), at: new Date() }); res.writeHead(200); res.end(); }); return; }
    if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
    if (req.method === 'GET' && u.searchParams.get('list-type') === '2') {
      const pre = u.searchParams.get('prefix');
      const xml = [...objects].filter(([k]) => k.startsWith(pre)).map(([k, o]) => `<Contents><Key>${k}</Key><LastModified>${o.at.toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`).join('');
      res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<ListBucketResult>${xml}</ListBucketResult>`);
    }
    const o = objects.get(key);
    if (!o) { res.writeHead(404); return res.end(); }
    const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (m) { const a = Number(m[1]), b = m[2] ? Number(m[2]) : o.body.length - 1; res.writeHead(206, { 'content-length': b - a + 1, 'content-range': `bytes ${a}-${b}/${o.body.length}` }); return res.end(o.body.subarray(a, b + 1)); }
    res.writeHead(200, { 'content-length': o.body.length }); res.end(o.body);
  });
  const s3Port = await listen(s3);
  // Supabase: Token → Konto, Profil (Admin ja/nein)
  const supa = http.createServer((req, res) => {
    const tok = (req.headers.authorization || '').replace('Bearer ', ''), id = tokens[tok];
    if (!id) { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/auth/v1/user')) return res.end(JSON.stringify({ id }));
    res.end(JSON.stringify([{ is_admin: id === ADMIN, banned: false }]));
  });
  const supaPort = await listen(supa);
  const handle = createMediaHandler({ supabase: () => ({ url: `http://127.0.0.1:${supaPort}`, key: 'anon' }),
    env: { MEDIA_S3_ENDPOINT: `http://127.0.0.1:${s3Port}`, MEDIA_S3_REGION: 'nbg1', MEDIA_S3_BUCKET: 'bucket', MEDIA_S3_ACCESS_KEY: 'AK', MEDIA_S3_SECRET_KEY: 'SK', MEDIA_S3_FORCE_PATH_STYLE: 'true' } });
  const web = http.createServer((req, res) => { if (!handle(req, res, new URL(req.url, 'http://x').pathname)) { res.writeHead(404); res.end(); } });
  const base = `http://127.0.0.1:${await listen(web)}`;
  const as = (who) => ({ Authorization: `Bearer ${who.repeat(30)}` });

  // Admin: 20 MB Video (größer als bei Supabase-Free erlaubt wäre, hier nur Probe-Größe)
  const video = Buffer.alloc(20 * 1024 * 1024, 7);
  let r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('a'), 'Content-Type': 'video/mp4' }, body: video });
  assert.equal(r.status, 200, await r.clone().text());
  const { path: vpath, url } = await r.json();
  assert.match(vpath, new RegExp(`^s/${ADMIN}/[0-9a-f-]{36}\\.mp4$`));
  // Ausliefern, auch in Stücken (Videos springen)
  r = await fetch(base + url);
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'video/mp4'); assert.equal((await r.arrayBuffer()).byteLength, video.length);
  assert.match(r.headers.get('cache-control'), /immutable/);
  r = await fetch(base + url, { headers: { Range: 'bytes=10-19' } });
  assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 10);
  // Normale Konten: 15 MB Video zu groß, kleines Bild geht; falscher Typ, ohne Anmeldung, fremde Datei löschen
  r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('b'), 'Content-Type': 'video/mp4' }, body: Buffer.alloc(16 * 1024 * 1024) });
  assert.equal(r.status, 413);
  r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('b'), 'Content-Type': 'image/webp' }, body: Buffer.alloc(1000) });
  assert.equal(r.status, 200);
  r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('a'), 'Content-Type': 'text/html' }, body: '<script>' });
  assert.equal(r.status, 415);
  r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: Buffer.alloc(10) });
  assert.equal(r.status, 401);
  const vname = vpath.split('/').pop();
  r = await fetch(`${base}/api/page-media/${vname}`, { method: 'DELETE', headers: as('b') });
  assert.equal(objects.has(`page-media/${ADMIN}/${vname}`), true, 'fremde Datei bleibt');
  // Liste und Löschen der eigenen
  r = await fetch(`${base}/api/page-media`, { headers: as('a') });
  const { files } = await r.json();
  assert.deepEqual(files.map((f) => f.name), [vname]); assert.equal(files[0].size, video.length);
  r = await fetch(`${base}/api/page-media/${vname}`, { method: 'DELETE', headers: as('a') });
  assert.equal(r.status, 200); assert.equal(objects.has(`page-media/${ADMIN}/${vname}`), false);
  r = await fetch(base + url);
  assert.equal(r.status, 404);
  r = await fetch(`${base}/media/../secrets/x.mp4`);
  assert.equal(r.status, 404);
  // Ohne Bucket-Zugang: 503 (Editor nimmt dann Supabase)
  const off = createMediaHandler({ supabase: () => null, env: {} });
  const res503 = await new Promise((ok) => { const s = http.createServer((q, w) => off(q, w, '/api/page-media')); s.listen(0, async () => { const x = await fetch(`http://127.0.0.1:${s.address().port}/api/page-media`, { method: 'POST' }); s.close(); ok(x.status); }); });
  assert.equal(res503, 503);
  [s3, supa, web].forEach((s) => s.close());
  console.log('OK media-store');
})().catch((e) => { console.error(e); process.exit(1); });
