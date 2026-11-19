// Uploads der freien Seite (xyntal.com/name) im eigenen Hetzner-Bucket statt bei Supabase:
// dort gilt keine 50-MB-Grenze. Ohne Pakete: S3-Signatur (AWS SigV4) von Hand.
//
//   POST   /api/page-media              Datei hochladen (Body = Datei, Content-Type = Bild/Video)
//   GET    /api/page-media              eigene Dateien auflisten (Editor räumt damit auf)
//   DELETE /api/page-media/<datei>      eigene Datei löschen
//   GET    /api/page-media/<konto>      (Admin) Dateien eines fremden Kontos auflisten
//   DELETE /api/page-media/<konto>/<datei>  (Admin) Datei eines fremden Kontos löschen
//   GET    /media/<konto>/<datei>       Datei ausliefern (mit Range für Videos)
//
// ZWEI ADMIN-BEGRIFFE, je mit Ort und Grund:
//   1) Admin-Routen (fremde Konten lesen und löschen): die DATENBANK entscheidet, bei JEDEM Aufruf. Der Server fragt
//      POST /rest/v1/rpc/is_admin mit dem Token des Nutzers. Dort gelten Sperre, zweiter Faktor (mfa_ok) und Profil.
//      KEIN Zwischenspeicher: Ein entzogenes Recht wirkt sofort. (Gemessen: Mit gemerkter Antwort blieb ein entzogenes
//      Recht eine Minute lang wirksam, fremde Dateien ließen sich weiter auflisten und löschen.) Die Abfrage kostet
//      nichts, was ins Gewicht fällt: Admin-Routen sind selten. Die Antwort zählt nur, wenn sie exakt true ist. Jede
//      andere Antwort, jede Weiterleitung und jeder Fehler ergibt "kein Admin" (403).
//      Die Admin-Routen gelten nur auf dem Admin-Host (ADMIN_HOST, dieselbe Vorgabe wie server.cjs): Der Handler wird
//      vor der Host-Logik aufgerufen, deshalb prüft die Route den Host selbst.
//   2) Größengrenze beim eigenen Upload (5 GB statt 3/15 MB): user.admin, also profiles.is_admin, ohne Datenbankabfrage.
//      Eine Abfrage bei jedem Upload wäre der schlechtere Tausch. Folge, ehrlich benannt: Ein Konto, dessen Profil
//      Admin ist, dessen Sitzung aber die Datenbank verneint (etwa ohne zweiten Faktor), darf eigene Dateien bis 5 GB
//      hochladen. Die Admin-Routen lassen es dagegen nicht zu. Gesperrte Konten sind beim Upload ohnehin abgewiesen.
//
// Anmeldung: Supabase-Token (Authorization: Bearer …). Admins bis 5 GB (größer geht ein einzelner
// S3-Upload nicht), alle anderen wie bei Supabase: Bilder 3 MB, Videos 15 MB.
// Zugang zum Bucket: MEDIA_S3_ENDPOINT, MEDIA_S3_REGION, MEDIA_S3_BUCKET, MEDIA_S3_ACCESS_KEY,
// MEDIA_S3_SECRET_KEY (deploy.sh schreibt sie aus api.env nach media.env). Fehlen sie, antwortet
// /api/page-media mit 503 und der Editor lädt wie bisher zu Supabase hoch.
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');

const MB = 1024 * 1024;
const LIMITS = { admin: 5 * 1024 * MB, image: 3 * MB, video: 15 * MB };
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/;
const PREFIX = 'page-media';

function s3Config(env = process.env) {
  const need = ['MEDIA_S3_ENDPOINT', 'MEDIA_S3_REGION', 'MEDIA_S3_BUCKET', 'MEDIA_S3_ACCESS_KEY', 'MEDIA_S3_SECRET_KEY'];
  if (need.some((k) => !String(env[k] || '').trim())) return null;
  let endpoint = env.MEDIA_S3_ENDPOINT.trim();
  if (!/^https?:\/\//i.test(endpoint)) endpoint = 'https://' + endpoint;
  const u = new URL(endpoint), bucket = env.MEDIA_S3_BUCKET.trim();
  const pathStyle = String(env.MEDIA_S3_FORCE_PATH_STYLE || '') === 'true';
  return {
    protocol: u.protocol, port: u.port, region: env.MEDIA_S3_REGION.trim(), bucket,
    accessKey: env.MEDIA_S3_ACCESS_KEY.trim(), secretKey: env.MEDIA_S3_SECRET_KEY.trim(),
    host: pathStyle ? u.host : `${bucket}.${u.host}`, base: pathStyle ? `/${bucket}` : '',
  };
}

// ---- AWS Signature Version 4 ----
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
// Liefert die Header (inkl. Authorization) für eine Anfrage. headers: zusätzlich zu signierende Header (Kleinbuchstaben).
function sign({ method, host, path: p, query = {}, headers = {}, payloadHash, region, accessKey, secretKey, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = { ...headers, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const names = Object.keys(all).map((k) => k.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalQuery = Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(String(query[k]))}`).join('&');
  const canonicalPath = p.split('/').map(rfc3986).join('/');
  const canonical = [method, canonicalPath, canonicalQuery, names.map((k) => `${k}:${lower[k]}\n`).join(''), names.join(';'), payloadHash].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return { ...all, authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

// Eine S3-Anfrage; body: Buffer, Stream oder nichts. Antwort als Stream (IncomingMessage).
function s3Request(cfg, { method, key = '', query = {}, headers = {}, body, unsigned }) {
  const p = `${cfg.base}/${key}`;
  const payloadHash = unsigned ? 'UNSIGNED-PAYLOAD' : sha256(Buffer.isBuffer(body) ? body : '');
  const signed = sign({ method, host: cfg.host, path: p, query, headers, payloadHash, region: cfg.region, accessKey: cfg.accessKey, secretKey: cfg.secretKey });
  const qs = Object.keys(query).sort().map((k) => `${rfc3986(k)}=${rfc3986(String(query[k]))}`).join('&');
  const lib = cfg.protocol === 'http:' ? http : https;
  const [hostname] = cfg.host.split(':');
  return new Promise((resolve, reject) => {
    const r = lib.request({ method, hostname, port: cfg.port || undefined, path: p.split('/').map(rfc3986).join('/') + (qs ? `?${qs}` : ''), headers: signed, timeout: 30000 }, resolve);
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('S3 timeout')));
    if (body && typeof body.pipe === 'function') { body.on('error', (e) => r.destroy(e)); body.pipe(r); }
    else r.end(Buffer.isBuffer(body) ? body : undefined);
  });
}
const readAll = (stream) => new Promise((ok, fail) => { const c = []; stream.on('data', (d) => c.push(d)); stream.on('end', () => ok(Buffer.concat(c).toString('utf8'))); stream.on('error', fail); });

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const bearerOf = (req) => (/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization || '') || [])[1] || null;

// Wer fragt? Supabase prüft das Token; Profil (is_admin für die Upload-Grenze, Sperre) mit demselben Token lesen. 60 s gemerkt.
const who = new Map();
async function identify(req, supabase) {
  const token = bearerOf(req);
  const sb = supabase();
  if (!token || !sb) return null;
  const hit = who.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  const headers = { apikey: sb.key, Authorization: `Bearer ${token}` };
  const r = await fetch(`${sb.url}/auth/v1/user`, { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u || !UUID.test(u.id || '')) return null;
  let admin = false, banned = false;
  const p = await fetch(`${sb.url}/rest/v1/profiles?id=eq.${u.id}&select=is_admin,banned,banned_until`, { headers, signal: AbortSignal.timeout(8000) });
  if (p.ok) {
    const row = (await p.json())[0] || {};
    admin = row.is_admin === true;
    banned = row.banned === true && (!row.banned_until || new Date(row.banned_until) > new Date());
  }
  const user = { id: u.id, admin, banned };
  if (who.size > 5000) who.clear();
  who.set(token, { user, until: Date.now() + 60000 });
  return user;
}

function createMediaHandler({ supabase, env = process.env }) {
  const cfg = s3Config(env);
  // Wie server.cjs (Zeile 608): ADMIN_HOST aus der Umgebung, Standard admin.xyntal.de, klein geschrieben.
  // Die Gleichheit mit server.cjs prüft tests/media-store.cjs gegen den Quelltext.
  const ADMIN_HOST = String(env.ADMIN_HOST || 'admin.xyntal.de').toLowerCase();
  // Wie server.cjs requestHost: Host klein geschrieben, Port abgeschnitten
  const requestHost = (req) => String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  // true, wenn die Anfrage hierher gehört (dann ist sie beantwortet)
  return function handle(req, res, pathname) {
    const api = pathname === '/api/page-media' || pathname.startsWith('/api/page-media/');
    const media = pathname.startsWith('/media/');
    if (!api && !media) return false;
    if (!cfg) { json(res, 503, { error: 'not configured' }); return true; }
    (media ? serve(req, res, pathname) : apiRoute(req, res, pathname)).catch(() => {
      if (!res.headersSent) json(res, 502, { error: 'storage unavailable' }); else res.destroy();
    });
    return true;
  };

  async function serve(req, res, pathname) {
    const m = /^\/media\/([0-9a-f-]{36})\/([0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm))$/.exec(pathname);
    if (!m || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); return res.end(); }
    const headers = {};
    if (/^bytes=\d*-\d*$/.test(req.headers.range || '')) headers.range = req.headers.range;
    const r = await s3Request(cfg, { method: req.method, key: `${PREFIX}/${m[1]}/${m[2]}`, headers });
    if (r.statusCode !== 200 && r.statusCode !== 206) { r.resume(); res.writeHead(r.statusCode === 416 ? 416 : 404); return res.end(); }
    // GEMESSEN (Agent, Produktion): Vor xyntal.com liegt KEIN CDN (Antwort mit "via: 1.1 Caddy", kein "server: cloudflare").
    // Die Reichweite dieses Headers ist deshalb auf Browser beschränkt, die die Datei SCHON geladen haben: Sie zeigen
    // sie aus ihrem Zwischenspeicher weiter, bis zu ein Jahr lang, auch nach einer Löschung. Neue Abrufe bekommen nach
    // der Löschung 404. Wie lange einzelne Browser halten, ist nicht gemessen. Wer das Entfernen rechtswidriger Inhalte
    // beurteilt, rechnet mit genau diesen Clients. Wird ein CDN davorgeschaltet, wird diese Aussage FALSCH: dann neu messen.
    const out = { 'Content-Type': MIME[m[3]], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
    for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    if (req.method === 'HEAD') { r.resume(); return res.end(); }
    r.pipe(res);
    res.on('close', () => r.destroy());
  }

  // Admin-Entscheidung aus der Datenbank (siehe Kopf). Kein Zwischenspeicher, keine Weiterleitung. Nur exakt true zählt.
  // Die Entscheidung gilt für dieses Token. Sie wird nicht über Tokens hinweg geteilt, weil mfa_ok() am aal des Tokens hängt.
  async function dbAdmin(req) {
    const sb = supabase(), token = bearerOf(req);
    if (!sb || !token) return false;
    try {
      const r = await fetch(`${sb.url}/rest/v1/rpc/is_admin`, {
        method: 'POST', headers: { apikey: sb.key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}', redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return false;
      return (await r.json()) === true;
    } catch {
      return false;
    }
  }

  // Alle Dateien unter einem Präfix (seitenweise, höchstens 20 Seiten à 1000). null, wenn der Speicher nicht antwortet.
  // truncated: true, wenn nach der letzten geladenen Seite noch ein Fortsetzungs-Token steht. Dann fehlen Dateien.
  async function listFiles(prefix) {
    const files = [];
    let token = '';
    for (let i = 0; i < 20; i++) {
      const query = { 'list-type': 2, prefix, 'max-keys': 1000, ...(token ? { 'continuation-token': token } : {}) };
      const r = await s3Request(cfg, { method: 'GET', query });
      const xml = await readAll(r);
      if (r.statusCode !== 200) return null;
      for (const c of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = (/<Key>([^<]+)<\/Key>/.exec(c[1]) || [])[1] || '';
        const name = key.slice(prefix.length);
        if (FILE.test(name)) files.push({ name, size: Number((/<Size>(\d+)<\/Size>/.exec(c[1]) || [])[1] || 0), created_at: (/<LastModified>([^<]+)<\/LastModified>/.exec(c[1]) || [])[1] || null });
      }
      token = (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml) || [])[1] || '';
      if (!token) break;
    }
    return { files, truncated: !!token };
  }

  // Admin-Routen auf FREMDE Konten. Der Präfix wird NUR aus dem geprüften Konto gebaut, nie aus dem rohen Pfad.
  // Reihenfolge: Host, Admin (Datenbank), Kontoform, Dateiform. Ein Mitglied bekommt immer 403, nie 400.
  // Einschränkung des Nachweises (Kommentar wie gewünscht): Das Protokoll unten erfasst nur Löschungen über diese Route.
  // Diese Route ist der einzige Weg in dieses Lager, AUSSER über die S3-Zugangsdaten (media.env). Wer dort direkt schreibt
  // oder löscht, erscheint hier nicht. Die Protokollzeile steht im Prozess-Log des Dienstes (journald), nicht in einer
  // Datenbanktabelle, und ist nur so lange verfügbar, wie das Log aufbewahrt wird.
  async function adminRoute(req, res, user, konto, datei) {
    if (requestHost(req) !== ADMIN_HOST) return json(res, 403, { error: 'admin host only' });
    if (!(await dbAdmin(req))) return json(res, 403, { error: 'not admin' });
    if (!UUID.test(konto)) return json(res, 400, { error: 'invalid account' });
    const prefixK = `${PREFIX}/${konto}/`;
    if (!datei) {
      const list = await listFiles(prefixK);
      if (!list) return json(res, 502, { error: 'list failed' });
      return json(res, 200, { files: list.files, truncated: list.truncated });
    }
    if (!FILE.test(datei)) return json(res, 400, { error: 'invalid file' });
    const key = prefixK + datei;
    // Erst prüfen, ob die Datei existiert. Sonst entstünde ein Protokolleintrag für eine Datei, die es nie gab.
    const head = await s3Request(cfg, { method: 'HEAD', key });
    head.resume();
    if (head.statusCode === 404) return json(res, 404, { error: 'not found' });
    if (head.statusCode !== 200) return json(res, 502, { error: 'storage check failed' });
    const del = await s3Request(cfg, { method: 'DELETE', key });
    del.resume();
    if (del.statusCode !== 204 && del.statusCode !== 200) return json(res, 502, { error: 'delete failed' });
    // Nachweis im Stil der Admin-Funktionen (raise log): wer, welches Konto, welche Datei, wann.
    console.log(`admin-media: Seitenbild ${konto}/${datei} entfernt durch ${user.id} um ${new Date().toISOString()}`);
    return json(res, 200, { ok: true, account: konto, file: datei });
  }

  async function apiRoute(req, res, pathname) {
    const user = await identify(req, supabase);
    if (!user) return json(res, 401, { error: 'not authenticated' });
    if (user.banned) return json(res, 403, { error: 'account banned' });
    // Admin-Routen: GET /api/page-media/<konto>, DELETE /api/page-media/<konto>/<datei>. Die Routen der eigenen Dateien
    // unten bleiben unverändert (dort ist nur ein Pfadteil).
    const adm = /^\/api\/page-media\/([^/]+)(?:\/([^/]+))?$/.exec(pathname);
    if (adm && ((req.method === 'GET' && !adm[2]) || (req.method === 'DELETE' && adm[2]))) {
      return adminRoute(req, res, user, adm[1], adm[2]);
    }
    const prefix = `${PREFIX}/${user.id}/`;

    if (req.method === 'POST' && pathname === '/api/page-media') {
      const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const ext = TYPES[type];
      if (!ext) return json(res, 415, { error: 'unsupported type' });
      const size = Number(req.headers['content-length']);
      if (!Number.isSafeInteger(size) || size <= 0) return json(res, 411, { error: 'length required' });
      const max = user.admin ? LIMITS.admin : type.startsWith('video/') ? LIMITS.video : LIMITS.image;
      if (size > max) return json(res, 413, { error: 'too large', max });
      const name = `${crypto.randomUUID()}.${ext}`;
      const r = await s3Request(cfg, { method: 'PUT', key: prefix + name, headers: { 'content-length': size, 'content-type': type }, body: req, unsigned: true });
      const text = await readAll(r);
      if (r.statusCode !== 200) return json(res, 502, { error: 'upload failed', status: r.statusCode, detail: text.slice(0, 200) });
      return json(res, 200, { path: `s/${user.id}/${name}`, url: `/media/${user.id}/${name}` });
    }
    if (req.method === 'GET' && pathname === '/api/page-media') {
      const list = await listFiles(prefix);
      if (!list) return json(res, 502, { error: 'list failed' });
      return json(res, 200, { files: list.files });
    }
    const del = /^\/api\/page-media\/([0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm))$/.exec(pathname);
    if (req.method === 'DELETE' && del) {
      const r = await s3Request(cfg, { method: 'DELETE', key: prefix + del[1] });
      r.resume();
      return json(res, r.statusCode === 204 || r.statusCode === 200 ? 200 : 502, { ok: r.statusCode === 204 || r.statusCode === 200 });
    }
    return json(res, 405, { error: 'method not allowed' });
  }
}

module.exports = { createMediaHandler, s3Config, sign, LIMITS };
