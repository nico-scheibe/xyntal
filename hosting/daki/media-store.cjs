// Uploads der freien Seite (xyntal.de/name) im eigenen Hetzner-Bucket statt bei Supabase:
// dort gilt keine 50-MB-Grenze. Ohne Pakete: S3-Signatur (AWS SigV4) von Hand.
//
//   POST   /api/page-media              Datei hochladen (Body = Datei, Content-Type = Bild/Video)
//   GET    /api/page-media              eigene Dateien auflisten (Editor räumt damit auf)
//   DELETE /api/page-media/<datei>      eigene Datei löschen
//   GET    /media/<konto>/<datei>       Datei ausliefern (mit Range für Videos)
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

// Wer fragt? Supabase prüft das Token; Profil (Admin, Sperre) mit demselben Token lesen. 60 s gemerkt.
const who = new Map();
async function identify(req, supabase) {
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization || '');
  const sb = supabase();
  if (!m || !sb) return null;
  const token = m[1], hit = who.get(token);
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
    const out = { 'Content-Type': MIME[m[3]], 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' };
    for (const h of ['content-length', 'content-range', 'etag', 'last-modified']) if (r.headers[h]) out[h] = r.headers[h];
    res.writeHead(r.statusCode, out);
    if (req.method === 'HEAD') { r.resume(); return res.end(); }
    r.pipe(res);
    res.on('close', () => r.destroy());
  }

  async function apiRoute(req, res, pathname) {
    const user = await identify(req, supabase);
    if (!user) return json(res, 401, { error: 'not authenticated' });
    if (user.banned) return json(res, 403, { error: 'account banned' });
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
      const files = [];
      let token = '';
      for (let i = 0; i < 20; i++) {
        const query = { 'list-type': 2, prefix, 'max-keys': 1000, ...(token ? { 'continuation-token': token } : {}) };
        const r = await s3Request(cfg, { method: 'GET', query });
        const xml = await readAll(r);
        if (r.statusCode !== 200) return json(res, 502, { error: 'list failed' });
        for (const c of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
          const key = (/<Key>([^<]+)<\/Key>/.exec(c[1]) || [])[1] || '';
          const name = key.slice(prefix.length);
          if (FILE.test(name)) files.push({ name, size: Number((/<Size>(\d+)<\/Size>/.exec(c[1]) || [])[1] || 0), created_at: (/<LastModified>([^<]+)<\/LastModified>/.exec(c[1]) || [])[1] || null });
        }
        token = (/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml) || [])[1] || '';
        if (!token) break;
      }
      return json(res, 200, { files });
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
