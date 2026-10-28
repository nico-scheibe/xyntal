// Daki: serve public/ and atomically publish new commits from the public main branch.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const state = path.join(__dirname, '.deploy');
const repository = 'https://github.com/nico-scheibe/xyntal.git';
const cache = path.join(state, 'repo.git');
fs.mkdirSync(state, { recursive: true });
let root, commit, updating = false;
const activeFile = path.join(state, 'active.json');
if (fs.existsSync(activeFile)) {
  const active = JSON.parse(fs.readFileSync(activeFile));
  if (/^[a-f0-9]{40}$/.test(active.commit)) {
    commit = active.commit;
    root = path.join(state, commit, 'public');
  }
}
async function update() {
  if (updating) return;
  updating = true;
  try {
    const { stdout } = await exec('git', ['ls-remote', repository, 'refs/heads/main'], { timeout: 30000 });
    const next = stdout.split(/\s+/)[0];
    if (!/^[a-f0-9]{40}$/.test(next)) throw new Error('Invalid GitHub revision');
    if (next === commit) return;
    if (!fs.existsSync(cache)) execFileSync('git', ['init', '--bare', cache], { stdio: 'ignore' });
    await exec('git', ['--git-dir=' + cache, 'fetch', '--depth=1', repository, next], { timeout: 120000 });
    const release = path.join(state, next);
    fs.mkdirSync(release, { recursive: true });
    const archive = path.join(release, 'site.tar');
    await exec('git', ['--git-dir=' + cache, 'archive', '--format=tar', '--output=' + archive, next, 'public'], { timeout: 30000 });
    await exec('tar', ['-xf', archive, '-C', release], { timeout: 30000 });
    fs.unlinkSync(archive);
    const nextRoot = path.join(release, 'public');
    for (const file of ['index.html', 'login.html', '404.html']) {
      if (!fs.statSync(path.join(nextRoot, file)).isFile()) throw new Error('Missing page: ' + file);
    }
    fs.writeFileSync(activeFile + '.tmp', JSON.stringify({ commit: next }));
    fs.renameSync(activeFile + '.tmp', activeFile);
    root = nextRoot;
    commit = next;
    console.log('Published GitHub main ' + commit);
    // Keep one previous release for rollback; remove only generated release directories.
    const releases = fs.readdirSync(state).filter(x => /^[a-f0-9]{40}$/.test(x))
      .sort((a,b) => fs.statSync(path.join(state,b)).mtimeMs - fs.statSync(path.join(state,a)).mtimeMs);
    for (const name of releases.slice(2)) if (name !== commit) fs.rmSync(path.join(state,name), {recursive:true,force:true});
  } catch (error) { console.error('Deployment failed; keeping previous website:', error.message); }
  finally { updating = false; }
}
// Zähler der Warteliste: liest nur die Anzahl der Kontakte einer Brevo-Liste.
// Schlüssel und Listen-ID liegen nur auf dem Server (.brevo-key / .brevo-list oder BREVO_API_KEY / BREVO_LIST_ID).
const readSecret = (file, env) => {
  if (process.env[env]) return process.env[env].trim();
  try { return fs.readFileSync(path.join(__dirname, file), 'utf8').trim(); } catch { return ''; }
};
const feedbackKeyAtStartup = readSecret('.brevo-key', 'BREVO_API_KEY');
const feedbackSenderAtStartup = readSecret('.brevo-sender', 'BREVO_SENDER_EMAIL');
console.log('[beta-feedback] Brevo config key=' + (feedbackKeyAtStartup ? 'yes' : 'no') + ' keyLength=' + feedbackKeyAtStartup.length + ' sender=' + (feedbackSenderAtStartup ? 'yes' : 'no'));
let waitlist = { count: null, at: 0, pending: null };
async function waitlistCount() {
  if (Date.now() - waitlist.at < 20 * 1000) return waitlist.count;
  if (waitlist.pending) return waitlist.pending;
  const key = readSecret('.brevo-key', 'BREVO_API_KEY');
  const list = readSecret('.brevo-list', 'BREVO_LIST_ID');
  if (!key || !/^\d+$/.test(list)) return null;
  waitlist.pending = (async () => {
    try {
      const response = await fetch('https://api.brevo.com/v3/contacts/lists/' + list, { headers: { 'api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Brevo HTTP ' + response.status);
      const data = await response.json();
      const count = Number(data.uniqueSubscribers ?? data.totalSubscribers);
      if (Number.isFinite(count)) waitlist.count = count;
    } catch (error) { console.error('Waitlist count failed:', error.message); }
    waitlist.at = Date.now();
    waitlist.pending = null;
    return waitlist.count;
  })();
  return waitlist.pending;
}

// Beta feedback: fixed recipient, server-side mail credentials only.
const feedbackLimits = new Map();
function feedbackJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function handleBetaFeedback(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return feedbackJson(res, 405, { error: 'Bitte sende das Feedback über das Formular.' }); }
  if (req.headers.origin && !['https://xyntal.de', 'https://www.xyntal.de'].includes(req.headers.origin)) {
    return feedbackJson(res, 403, { error: 'Diese Anfrage ist nicht erlaubt.' });
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return feedbackJson(res, 415, { error: 'Ungültiges Datenformat.' });
  if (Number(req.headers['content-length']) > 16384) { req.resume(); return feedbackJson(res, 413, { error: 'Deine Nachricht ist zu lang.' }); }
  try {
    const raw = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0, tooLarge = false;
      req.setTimeout(15000, () => { reject(new Error('timeout')); req.destroy(); });
      req.on('data', chunk => { size += chunk.length; if (size > 16384) tooLarge = true; else chunks.push(chunk); });
      req.on('end', () => { req.setTimeout(0); resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')); });
      req.on('error', reject);
    });
    if (raw === null) return feedbackJson(res, 413, { error: 'Deine Nachricht ist zu lang.' });
    let data;
    try { data = JSON.parse(raw); } catch { return feedbackJson(res, 400, { error: 'Die Nachricht konnte nicht gelesen werden.' }); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return feedbackJson(res, 400, { error: 'Die Nachricht konnte nicht gelesen werden.' });
    if (data.website) return feedbackJson(res, 200, { ok: true });
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    const email = typeof data.email === 'string' ? data.email.trim() : '';
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    // Meldungen aus den Community-Richtlinien nutzen denselben Versand.
    const report = data.kind === 'report';
    const where = report && typeof data.where === 'string' ? data.where.trim() : '';
    if (where.length > 500 || /[\r\n]/.test(where)) return feedbackJson(res, 400, { error: 'Bitte gib den Ort des Verstoßes in einer Zeile mit höchstens 500 Zeichen an.' });
    if (!name || name.length > 80 || /[\r\n]/.test(name) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10 || message.length > 5000) {
      return feedbackJson(res, 400, { error: 'Bitte gib deinen Namen, eine gültige E-Mail-Adresse und eine Nachricht mit 10 bis 5000 Zeichen an.' });
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.requestId || '')) return feedbackJson(res, 400, { error: 'Bitte lade das Formular neu und versuche es erneut.' });
    const key = readSecret('.brevo-key', 'BREVO_API_KEY');
    const sender = readSecret('.brevo-sender', 'BREVO_SENDER_EMAIL') || 'admin@xyntal.com';
    if (!key) return feedbackJson(res, 503, { error: 'Der Feedbackversand ist gerade nicht verfügbar. Bitte versuche es später erneut.' });
    const now = Date.now();
    for (const [id, item] of feedbackLimits) if (item.until <= now) feedbackLimits.delete(id);
    const remote = req.socket.remoteAddress || 'unknown';
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
    const ip = local && req.headers['cf-connecting-ip'] ? req.headers['cf-connecting-ip'] : remote;
    const limits = [['all', 40], ['ip:' + ip, 10], ['email:' + email.toLowerCase(), 3]];
    if (limits.some(([id, max]) => (feedbackLimits.get(id)?.count || 0) >= max)) return feedbackJson(res, 429, { error: 'Du hast gerade mehrere Nachrichten gesendet. Bitte versuche es später erneut.' });
    for (const [id] of limits) {
      const item = feedbackLimits.get(id) || { count: 0, until: now + 3600000 };
      item.count++; feedbackLimits.set(id, item);
    }
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: sender, name: report ? 'Xyntal Meldung' : 'Xyntal Feedback' },
        to: [{ email: 'admin@xyntal.com', name: 'Nico' }],
        replyTo: { email, name }, subject: report ? 'Xyntal Meldung: Verstoß gegen die Community-Richtlinien' : 'Xyntal Beta-Feedback',
        textContent: report
          ? ['Meldung von ' + name, 'Antwort an: ' + email, 'Wo: ' + (where || '–'), '', message].join('\n')
          : ['Beta-Feedback von ' + name, 'Antwort an: ' + email, '', message].join('\n'),
        headers: { IdempotencyKey: (report ? 'report-' : 'beta-feedback-') + data.requestId },
      }), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      let responseText = '';
      try { responseText = await response.text(); } catch {}
      let code = '', detail = responseText.slice(0, 300);
      try {
        const data = JSON.parse(responseText);
        if (data && typeof data === 'object') {
          if (data.code != null) code = String(data.code);
          if (data.message != null) detail = String(data.message);
        }
      } catch {}
      for (const value of [key, name, email, where, message]) if (value) {
        code = code.split(value).join('[redacted]');
        detail = detail.split(value).join('[redacted]');
      }
      console.error('[beta-feedback] Brevo ' + response.status + ' ' + code + ': ' + detail);
      return feedbackJson(res, 502, { error: 'Das Feedback konnte nicht gesendet werden. Bitte versuche es erneut.' });
    }
    return feedbackJson(res, 200, { ok: true });
  } catch (err) {
    console.error('[beta-feedback] ' + err.name + ': ' + err.message);
    if (!res.destroyed && !res.headersSent) feedbackJson(res, 502, { error: 'Das Feedback konnte nicht gesendet werden. Bitte versuche es erneut.' });
  }
}

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2', '.woff':'font/woff', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8' };
// Sicherheits-Header für alle Antworten. Skripte nur aus eigenen Dateien (keine Inline-Skripte);
// Inline-Styles bleiben erlaubt, weil Seiten style-Attribute setzen.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://rralgrlujoupprwlvoyo.supabase.co; font-src 'self'; connect-src 'self' https://rralgrlujoupprwlvoyo.supabase.co wss://rralgrlujoupprwlvoyo.supabase.co https://*.sibforms.com; form-action 'self' https://*.sibforms.com; frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
};
http.createServer((req,res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (/^\/[a-z0-9][a-z0-9_-]{0,19}-[a-z0-9][a-z0-9_-]{0,118}\/$/.test(pathname)) {
    res.writeHead(308, { Location: pathname.slice(0, -1) + new URL(req.url, 'http://localhost').search });
    return res.end();
  }
  if (pathname === '/api/beta-feedback') { handleBetaFeedback(req, res); return; }
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  if (pathname === '/__deployment') {
    res.writeHead(root ? 200 : 503, {'Content-Type':'application/json','Cache-Control':'no-store'});
    return res.end(JSON.stringify({commit, branch:'main', updating}));
  }
  if (pathname === '/api/waitlist-count') {
    waitlistCount().then((count) => {
      res.writeHead(count === null ? 404 : 200, {'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(count === null ? {error:'not configured'} : {count}));
    });
    return;
  }
  if (!root) { res.writeHead(503, {'Retry-After':'10'}); return res.end('Website is starting'); }
  const currentRoot = root;
  let file = path.resolve(currentRoot, '.' + pathname);
  if (file !== currentRoot && !file.startsWith(currentRoot + path.sep)) { res.writeHead(403); return res.end(); }
  if (file === currentRoot || pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  // Project short links use the project page and its existing access checks.
  if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && /^\/[a-z0-9][a-z0-9_-]{0,19}-[a-z0-9][a-z0-9_-]{0,118}\/?$/.test(pathname)) file = path.join(currentRoot, 'projekte.html');
  // xyntal.de/name: Wunsch-Link zeigt die öffentliche Karte (die Seite fragt Supabase selbst)
  if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && /^\/[a-z0-9][a-z0-9_-]{2,19}\/?$/i.test(pathname) && fs.existsSync(path.join(currentRoot, 'u.html'))) file = path.join(currentRoot, 'u.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(currentRoot,'404.html')));
  }
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(currentRoot) + path.sep)) { res.writeHead(403); return res.end(); }
  res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'X-Xyntal-Commit':commit});
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}).listen(Number(process.env.SERVER_PORT || process.env.PORT || 4129), '0.0.0.0', () => console.log('Xyntal Daki server ready'));
update();
setInterval(update, 30000);
