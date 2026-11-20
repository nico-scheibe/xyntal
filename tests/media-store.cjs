// Uploads der freien Seite auf den eigenen Server (hosting/daki/media-store.cjs) mit nachgebautem
// S3-Bucket und nachgebautem Supabase. Start: node tests/media-store.cjs
const assert = require('node:assert/strict');
const http = require('node:http');
const { createMediaHandler, sign } = require('../hosting/daki/media-store.cjs');

const ADMIN = '00000000-0000-0000-0000-00000000000a', USER = '00000000-0000-0000-0000-00000000000b';
const BANNED = '00000000-0000-0000-0000-00000000000c', MFA = '00000000-0000-0000-0000-00000000000d', ERR = '00000000-0000-0000-0000-00000000000e';
const REDIR = '00000000-0000-0000-0000-00000000000f', STR = '00000000-0000-0000-0000-000000000010', HTML = '00000000-0000-0000-0000-000000000011';
// Je Token ein Zustand. is_admin: Profil (profiles.is_admin). rpc: Antwort der DATENBANK auf is_admin().
// Der Fall MFA: Profil sagt Admin, aber die Datenbank verneint (Sitzung ohne zweiten Faktor). Der Fall ERR: die Abfrage scheitert.
const CFG = {
  a: { id: ADMIN, is_admin: true, banned: false, rpc: true },
  b: { id: USER, is_admin: false, banned: false, rpc: false },
  c: { id: BANNED, is_admin: true, banned: true, rpc: false },
  d: { id: MFA, is_admin: true, banned: false, rpc: false },
  e: { id: ERR, is_admin: true, banned: false, rpc: 'error' },
  f: { id: REDIR, is_admin: true, banned: false, rpc: 'redirect' }, // Weiterleitung auf eine Stelle, die true liefert
  g: { id: STR, is_admin: true, banned: false, rpc: 'string' },     // "true" als Zeichenkette
  h: { id: HTML, is_admin: true, banned: false, rpc: 'html' },      // HTML-Seite mit dem Wort true
};
const tokens = Object.fromEntries(Object.entries(CFG).map(([k, v]) => [k.repeat(30), v]));
const rpcCalls = new Map();
// Das Prüfprotokoll (public.admin_media_log_write). logCalls hält jeden Aufruf mit Token und Inhalt, damit der Test
// belegen kann, WAS der Dienst schreibt und MIT WESSEN Token. logMode steuert die Antwort der nachgebauten Datenbank:
//   'ok'      -> eine Kennung (so wie die echte Funktion)
//   'error'   -> 500 (Datenbank antwortet, aber nicht gut)
//   'keineId' -> 200 mit true statt einer Kennung (dann ist NICHT belegt, dass eine Zeile entstanden ist)
//   'textId'  -> 200 mit "4711" als Zeichenkette (bigint kann so serialisiert werden; muss als Kennung gelten)
const logCalls = [];
let logMode = 'ok';
let s3Hits = 0; // zählt jede Anfrage, die den S3-Speicher erreicht
const objects = new Map();
const listen = (srv) => new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv.address().port)));

(async () => {
  // S3: prüft die Signatur mit den empfangenen Daten (Pfad, Query, Header) und speichert im Speicher
  const s3 = http.createServer((req, res) => {
    s3Hits++;
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
      const pre = u.searchParams.get('prefix'), max = Number(u.searchParams.get('max-keys') || 1000);
      const all = [...objects].filter(([k]) => k.startsWith(pre)).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const start = Number(u.searchParams.get('continuation-token') || 0), end = Math.min(all.length, start + max);
      const xml = all.slice(start, end).map(([k, o]) => `<Contents><Key>${k}</Key><LastModified>${o.at.toISOString()}</LastModified><Size>${o.body.length}</Size></Contents>`).join('');
      const next = end < all.length ? `<IsTruncated>true</IsTruncated><NextContinuationToken>${end}</NextContinuationToken>` : '<IsTruncated>false</IsTruncated>';
      res.writeHead(200, { 'content-type': 'application/xml' }); return res.end(`<ListBucketResult>${xml}${next}</ListBucketResult>`);
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
    const tok = (req.headers.authorization || '').replace('Bearer ', ''), c = tokens[tok];
    if (!c) { res.writeHead(401); return res.end('{}'); }
    if (req.url.startsWith('/rest/v1/rpc/ja')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('true'); }
    if (req.url.startsWith('/rest/v1/rpc/admin_media_log_write')) {
      const chunks = [];
      req.on('data', (x) => chunks.push(x));
      req.on('end', () => {
        let body = null;
        try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = null; }
        logCalls.push({ tok, body });
        if (logMode === 'error') { res.writeHead(500); return res.end('{}'); }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(logMode === 'keineId' ? 'true' : logMode === 'textId' ? '"4711"' : '4711');
      });
      return;
    }
    if (req.url.startsWith('/rest/v1/rpc/is_admin')) {
      rpcCalls.set(tok, (rpcCalls.get(tok) || 0) + 1);
      if (c.rpc === 'error') { res.writeHead(500); return res.end('{}'); }
      if (c.rpc === 'redirect') { res.writeHead(302, { Location: '/rest/v1/rpc/ja' }); return res.end(); }
      if (c.rpc === 'string') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('"true"'); }
      if (c.rpc === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html>true</html>'); }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(c.rpc));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url.startsWith('/auth/v1/user')) return res.end(JSON.stringify({ id: c.id }));
    res.end(JSON.stringify([{ is_admin: c.is_admin, banned: c.banned, banned_until: null }]));
  });
  const supaPort = await listen(supa);
  const handle = createMediaHandler({ supabase: () => ({ url: `http://127.0.0.1:${supaPort}`, key: 'anon' }),
    env: { ADMIN_HOST: '127.0.0.1', MEDIA_S3_ENDPOINT: `http://127.0.0.1:${s3Port}`, MEDIA_S3_REGION: 'nbg1', MEDIA_S3_BUCKET: 'bucket', MEDIA_S3_ACCESS_KEY: 'AK', MEDIA_S3_SECRET_KEY: 'SK', MEDIA_S3_FORCE_PATH_STYLE: 'true' } });
  // Wie hosting/daki/server.cjs: der Pfad wird DEKODIERT, bevor der Handler ihn sieht (dort: decodeURIComponent).
  const web = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    if (!handle(req, res, pathname)) { res.writeHead(404); res.end(); }
  });
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
  // ---- Admin-Routen auf fremde Konten ----
  // Vorbedingung: ein Mitglied (USER) hat eine Datei. Sie wird über die eigene Route angelegt.
  r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('b'), 'Content-Type': 'image/png' }, body: Buffer.alloc(500) });
  assert.equal(r.status, 200, 'Vorbedingung: Mitglied hat eine Datei');
  const uname = (await r.json()).path.split('/').pop();
  assert.equal(objects.has(`page-media/${USER}/${uname}`), true, 'Vorbedingung: Datei liegt bei USER');
  // Träge: normale Uploads und Löschungen des Mitglieds fragen die Datenbank nicht
  assert.equal(rpcCalls.get('b'.repeat(30)) || 0, 0, 'träge: Mitglied ohne Admin-Route wird nie bei der Datenbank gefragt');
  // Admin listet und löscht fremd; Gegenprobe: Mitglied bekommt 403 auf beiden Routen
  r = await fetch(`${base}/api/page-media/${USER}`, { headers: as('a') });
  assert.equal(r.status, 200, await r.clone().text());
  assert.ok((await r.json()).files.map((f) => f.name).includes(uname), 'Admin sieht die fremde Datei');
  r = await fetch(`${base}/api/page-media/${ADMIN}`, { headers: as('b') });
  assert.equal(r.status, 403, 'Gegenprobe: Mitglied listet ein fremdes Konto NICHT (403)');
  r = await fetch(`${base}/api/page-media/${USER}/${uname}`, { method: 'DELETE', headers: as('b') });
  assert.equal(r.status, 403, 'Gegenprobe: Mitglied löscht fremde Datei NICHT (403)');
  assert.equal(objects.has(`page-media/${USER}/${uname}`), true, 'Gegenprobe: Datei bleibt nach dem 403');
  // Gesperrter Admin: 403 durch Sperre; Admin, dessen Sitzung die Datenbank verneint (zweiter Faktor): 403
  r = await fetch(`${base}/api/page-media/${USER}`, { headers: as('c') });
  assert.equal(r.status, 403, 'gesperrter Admin wird beim Listen abgewiesen');
  r = await fetch(`${base}/api/page-media/${USER}/${uname}`, { method: 'DELETE', headers: as('c') });
  assert.equal(r.status, 403, 'gesperrter Admin wird beim Löschen abgewiesen');
  r = await fetch(`${base}/api/page-media/${USER}`, { headers: as('d') });
  assert.equal(r.status, 403, 'Profil-Admin ohne Bestätigung der Datenbank wird abgewiesen (Liste)');
  r = await fetch(`${base}/api/page-media/${USER}/${uname}`, { method: 'DELETE', headers: as('d') });
  assert.equal(r.status, 403, 'Profil-Admin ohne Bestätigung der Datenbank wird abgewiesen (Löschen)');
  assert.equal(objects.has(`page-media/${USER}/${uname}`), true, 'Gegenprobe: Datei bleibt bei gesperrt und ohne Bestätigung');
  r = await fetch(`${base}/api/page-media/${USER}`, { headers: as('e') });
  assert.equal(r.status, 403, 'Scheitert die Datenbankabfrage, gilt kein Admin (zugeschlossen)');
  // Konto-Prüfung: kein UUID-Konto wird abgewiesen, auch mit Pfadtrick; Gegenprobe ist der gültige Aufruf oben
  r = await fetch(`${base}/api/page-media/nicht-uuid`, { headers: as('a') });
  assert.equal(r.status, 400, 'ein Konto, das keine UUID ist, wird abgewiesen');
  const hitsBefore = s3Hits;
  r = await fetch(`${base}/api/page-media/..%2F..%2Fx`, { headers: as('a') });
  assert.equal(r.status, 405, 'Pfadtrick ..%2F..%2Fx: nach dem Dekodieren (wie die Produktion) keine Route, 405');
  assert.equal(s3Hits, hitsBefore, 'Pfadtrick: der S3-Speicher wird NICHT erreicht');
  r = await fetch(`${base}/api/page-media/${USER}%2F..%2Fx`, { method: 'DELETE', headers: as('a') });
  assert.equal(r.status, 405, 'Pfadtrick im Konto beim Löschen: keine Route, 405');
  assert.equal(s3Hits, hitsBefore, 'Pfadtrick beim Löschen: S3 wird NICHT erreicht');
  r = await fetch(`${base}/api/page-media/${USER}/nicht-datei.exe`, { method: 'DELETE', headers: as('a') });
  assert.equal(r.status, 400, 'Dateiname außerhalb der Form wird abgewiesen');
  // ---- Prüfprotokoll in der Datenbank (public.admin_media_log) ----
  // Vor dem Löschen darf nichts geschrieben sein: Ein Eintrag entsteht NACH der bestätigten Löschung, nie vorher.
  // Die abgewiesenen Versuche oben (403, 400, 405, Pfadtricks) haben nichts gelöscht und dürfen nichts geschrieben haben.
  assert.equal(logCalls.length, 0, 'bis hierher wurde nichts protokolliert: kein Versuch hat gelöscht');
  // Admin löscht fremd; zweiter Versuch: Datei nicht mehr da (404), kein zweiter Protokolleintrag
  r = await fetch(`${base}/api/page-media/${USER}/${uname}`, { method: 'DELETE', headers: as('a') });
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(objects.has(`page-media/${USER}/${uname}`), false, 'Admin hat die fremde Datei entfernt');
  // Der Nachweis steht in der Datenbank, nicht im Prozess-Log, und trägt genau die Angaben der Tabelle.
  assert.equal(logCalls.length, 1, 'die Löschung hat GENAU EINEN Eintrag geschrieben');
  assert.deepEqual(logCalls[0].body, { p_account: USER, p_file: uname, p_store: 'eigener-server', p_result: 'geloescht' },
    'der Eintrag nennt Konto, Datei, Lager "eigener-server" und Ergebnis "geloescht"');
  assert.equal(logCalls[0].tok, 'a'.repeat(30),
    'geschrieben wird mit dem Token des ADMINS (nicht mit dem Dienstschlüssel): nur so setzt die Datenbank auth.uid()');
  assert.deepEqual(await r.json(), { ok: true, account: USER, file: uname, logged: true, log_id: 4711 },
    'die Antwort sagt der Oberfläche, DASS protokolliert wurde, und nennt die Kennung des Eintrags');
  r = await fetch(`${base}/api/page-media/${USER}/${uname}`, { method: 'DELETE', headers: as('a') });
  assert.equal(r.status, 404, 'Gegenprobe: zweites Löschen findet nichts mehr (404)');
  assert.equal(logCalls.length, 1, 'Gegenprobe: das erfolglose zweite Löschen schreibt KEINEN Eintrag');
  // Scheitert der Eintrag, ist die Datei TROTZDEM weg. Das darf nicht verschwiegen und nicht als Fehlschlag der
  // Löschung gemeldet werden: Status bleibt 200, die Antwort trägt logged:false und den Grund.
  for (const [modus, grund] of [['error', 'Datenbank antwortet 500'], ['keineId', 'keine Eintragskennung']]) {
    logMode = modus;
    r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('b'), 'Content-Type': 'image/png' }, body: Buffer.alloc(300) });
    assert.equal(r.status, 200, `Vorbedingung (${modus}): Mitglied hat wieder eine Datei`);
    const n2 = (await r.json()).path.split('/').pop();
    const vorher = logCalls.length;
    r = await fetch(`${base}/api/page-media/${USER}/${n2}`, { method: 'DELETE', headers: as('a') });
    assert.equal(r.status, 200, `${modus}: die Löschung gilt, der Status bleibt 200`);
    assert.deepEqual(await r.json(), { ok: true, account: USER, file: n2, logged: false, log_error: grund },
      `${modus}: die Antwort meldet den fehlenden Nachweis mit Grund "${grund}"`);
    assert.equal(objects.has(`page-media/${USER}/${n2}`), false,
      `${modus}: die Datei ist weg — ein fehlender Nachweis nimmt die Löschung NICHT zurück`);
    assert.equal(logCalls.length, vorher + 1, `${modus}: der Schreibversuch wurde unternommen`);
  }
  // Gegenprobe zu beiden Fällen oben: Eine Kennung als Zeichenkette ("4711") ist eine GÜLTIGE Kennung. Würde sie als
  // fehlend gelten, bekäme der Admin bei jedem erfolgreichen Eintrag "nicht protokolliert" zu lesen, obwohl die Zeile steht.
  logMode = 'textId';
  r = await fetch(`${base}/api/page-media`, { method: 'POST', headers: { ...as('b'), 'Content-Type': 'image/png' }, body: Buffer.alloc(300) });
  assert.equal(r.status, 200, 'Vorbedingung (textId): Mitglied hat wieder eine Datei');
  const n3 = (await r.json()).path.split('/').pop();
  r = await fetch(`${base}/api/page-media/${USER}/${n3}`, { method: 'DELETE', headers: as('a') });
  assert.equal(r.status, 200, 'textId: Status 200');
  assert.deepEqual(await r.json(), { ok: true, account: USER, file: n3, logged: true, log_id: 4711 },
    'textId: eine Kennung als Zeichenkette gilt als Nachweis, und log_id ist eine Zahl');
  logMode = 'ok';
  // Kein Zwischenspeicher für die Admin-Entscheidung: jeder Admin-Aufruf fragt die Datenbank neu
  const rpcA = rpcCalls.get('a'.repeat(30)) || 0;
  r = await fetch(`${base}/api/page-media/${USER}`, { headers: as('a') });
  assert.equal(r.status, 200, 'Gegenprobe: Admin darf weiterhin');
  assert.equal(rpcCalls.get('a'.repeat(30)), rpcA + 1, 'jede Admin-Anfrage wird bei der Datenbank neu entschieden (kein Zwischenspeicher)');
  // Entzogenes Recht wirkt SOFORT, mit demselben Token, innerhalb der 60 s von identify()
  CFG.a.rpc = false;
  r = await fetch(`${base}/api/page-media/${USER}`, { headers: as('a') });
  assert.equal(r.status, 403, 'entzogenes Recht wirkt sofort: Liste mit demselben Token 403');
  CFG.a.rpc = true;
  // Vertrauensfrage: nur exakt true zählt. Weiterleitung, Zeichenkette "true", HTML mit true: je 403
  for (const [who, why] of [['f', 'Weiterleitung auf eine Stelle, die true liefert'], ['g', 'Zeichenkette "true"'], ['h', 'HTML-Seite']]) {
    r = await fetch(`${base}/api/page-media/${USER}`, { headers: as(who) });
    assert.equal(r.status, 403, `Admin-Entscheidung: ${why} ergibt kein Admin (403)`);
  }
  // Admin-Host: die Admin-Route gilt nur unter ADMIN_HOST. Über einen anderen Host (xyntal.com) 403, S3 wird nicht erreicht.
  const rawGet = (path, host, token) => new Promise((ok, fail) => {
    const u = new URL(base);
    const q = http.request({ host: u.hostname, port: u.port, path, method: 'GET', headers: { Host: host, Authorization: `Bearer ${token}` } }, (res) => {
      let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => ok({ status: res.statusCode, body: d }));
    });
    q.on('error', fail); q.end();
  });
  const hitsHost = s3Hits;
  let rh = await rawGet(`/api/page-media/${USER}`, 'xyntal.com', 'a'.repeat(30));
  assert.equal(rh.status, 403, 'Admin-Route über xyntal.com: 403, auch für den Admin');
  assert.equal(s3Hits, hitsHost, 'Admin-Route über xyntal.com: S3 wird NICHT erreicht');
  rh = await rawGet(`/api/page-media/${USER}`, 'xyntal.com:443', 'a'.repeat(30));
  assert.equal(rh.status, 403, 'Port am Host wird abgeschnitten, xyntal.com:443 bleibt 403');
  rh = await rawGet(`/api/page-media/${USER}`, '127.0.0.1:1', 'a'.repeat(30));
  assert.equal(rh.status, 200, 'Gegenprobe: ADMIN_HOST mit anderem Port ist derselbe Host (200)');
  // Die Host-Vorgabe ist dieselbe wie in server.cjs (Zeile 608). Der Test prüft den Quelltext beider Dateien.
  const srvSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '../hosting/daki/server.cjs'), 'utf8');
  const mediaSrc = require('node:fs').readFileSync(require('node:path').join(__dirname, '../hosting/daki/media-store.cjs'), 'utf8');
  assert.ok(srvSrc.includes("process.env.ADMIN_HOST || 'admin.xyntal.de'") && mediaSrc.includes("env.ADMIN_HOST || 'admin.xyntal.de'"), 'ADMIN_HOST-Vorgabe: server.cjs und media-store.cjs nennen denselben Standard');
  // Kürzung der Admin-Liste: 20 Seiten à 1000. Genau 20.000 Dateien sind vollständig, 20.001 sind abgeschnitten (Hinweis).
  const BIG = '00000000-0000-0000-0000-0000000000f1';
  const bigName = (i) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-${i.toString(16).padStart(12, '0')}.jpg`;
  for (let i = 0; i < 20000; i++) objects.set(`page-media/${BIG}/${bigName(i)}`, { body: Buffer.alloc(1), at: new Date() });
  r = await fetch(`${base}/api/page-media/${BIG}`, { headers: as('a') });
  let big = await r.json();
  assert.equal(big.files.length, 20000, 'Grenze: genau 20.000 Dateien kommen vollständig zurück');
  assert.equal(big.truncated, false, 'Grenze: genau 20.000 Dateien sind NICHT abgeschnitten (kein falscher Hinweis)');
  objects.set(`page-media/${BIG}/${bigName(20000)}`, { body: Buffer.alloc(1), at: new Date() });
  r = await fetch(`${base}/api/page-media/${BIG}`, { headers: as('a') });
  big = await r.json();
  assert.equal(big.files.length, 20000, 'Grenze: 20.001 Dateien ergeben 20.000 zurückgegebene Dateien');
  assert.equal(big.truncated, true, 'Grenze: 20.001 Dateien sind abgeschnitten und das wird gemeldet');
  for (let i = 0; i <= 20000; i++) objects.delete(`page-media/${BIG}/${bigName(i)}`);
  const res503 = await new Promise((ok) => { const s = http.createServer((q, w) => off(q, w, '/api/page-media')); s.listen(0, async () => { const x = await fetch(`http://127.0.0.1:${s.address().port}/api/page-media`, { method: 'POST' }); s.close(); ok(x.status); }); });
  assert.equal(res503, 503);
  [s3, supa, web].forEach((s) => s.close());
  console.log('OK media-store');
})().catch((e) => { console.error(e); process.exit(1); });
