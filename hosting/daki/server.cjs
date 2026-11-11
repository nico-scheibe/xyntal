// Daki: serve public/ and atomically publish new commits from the public main branch.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const tls = require('node:tls');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
// Uploads der freien Seite im eigenen Bucket (Hetzner); fehlt das Modul (alter Daki-Stand), läuft alles wie bisher.
let mediaHandler = () => false;
try { mediaHandler = require('./media-store.cjs').createMediaHandler({ supabase: () => supabaseConfig() }); } catch {}
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
    // Hetzner: Caddy sits in front (TRUST_PROXY=1) and overwrites X-Forwarded-For with the real client.
    const forwarded = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
    const ip = forwarded || (local && req.headers['cf-connecting-ip'] ? req.headers['cf-connecting-ip'] : remote);
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

// Beta status mail: Admin ändert den Status, der Bewerber bekommt eine E-Mail über IONOS-SMTP.
// Zugangsdaten nur auf dem Server (.ionos-user / .ionos-pass oder IONOS_SMTP_USER / IONOS_SMTP_PASSWORD).
// Wer die Mail auslösen darf, entscheidet Supabase: Die Bewerbung wird mit dem Token des Aufrufers gelesen,
// und beta_applications ist per RLS nur für Admins lesbar.
const STATUS_MAILS = {
  in_pruefung: {
    subject: 'Deine Xyntal-Beta-Bewerbung ist in Prüfung', kicker: 'Beta-Bewerbung · In Prüfung', accent: '#60a5fa',
    heading: 'Ich schaue mir deine Bewerbung an.',
    paragraphs: ['ich habe deine Bewerbung für die Xyntal-Beta gelesen und schaue sie mir gerade genauer an. Ich lese jede Bewerbung selbst, deshalb dauert das ein paar Tage.', 'Du hörst von mir, sobald ich entschieden habe. Bis dahin kannst du dein Profil schon einmal vervollständigen – das hilft mir bei der Einschätzung.'],
    button: 'Mein Profil ansehen', link: 'https://xyntal.de/profil',
  },
  eingeladen: {
    subject: 'Du bist zur Xyntal-Beta eingeladen', kicker: 'Beta-Bewerbung · Eingeladen', accent: '#a855f7',
    heading: 'Du bist eingeladen.',
    paragraphs: ['ich möchte dich gern in der Xyntal-Beta dabeihaben. Dein Vorhaben passt gut zu dem, was wir gerade testen.', 'Logg dich ein und vervollständige dein Profil: Was du baust, was du kannst und wen du suchst. Sobald das steht, schalte ich dich frei und du bekommst Zugang zur Desktop-App.'],
    button: 'Jetzt einloggen', link: 'https://xyntal.de/login?next=profil',
  },
  warteliste: {
    subject: 'Du stehst auf der Warteliste für die Xyntal-Beta', kicker: 'Beta-Bewerbung · Warteliste', accent: '#f59e0b',
    heading: 'Du stehst auf der Warteliste.',
    paragraphs: ['danke für deine Bewerbung. Die erste Testrunde ist gerade voll, deshalb habe ich dich auf die Warteliste gesetzt. Sobald ein Platz frei wird, melde ich mich bei dir.', 'Projekte, Gesuche und Nachrichten kannst du mit deinem Konto schon jetzt nutzen – so bist du nicht untätig, bis es losgeht.'],
    button: 'Projekte entdecken', link: 'https://xyntal.de/projekte',
  },
  angenommen: {
    subject: 'Willkommen in der Xyntal-Beta', kicker: 'Beta-Bewerbung · Angenommen', accent: '#34d399',
    heading: 'Du bist dabei. Willkommen in der Beta!',
    paragraphs: ['dein Konto ist für die Beta freigeschaltet. In deinem Profil findest du ab sofort die Desktop-App für Mac und Windows zum Download.', 'Probier alles aus, bau dein Projekt auf und sag mir, was gut läuft und was fehlt. Dein Feedback kommt direkt bei mir an und entscheidet mit, was als Nächstes gebaut wird.'],
    button: 'Desktop-App herunterladen', link: 'https://xyntal.de/profil',
  },
  abgelehnt: {
    subject: 'Deine Xyntal-Beta-Bewerbung', kicker: 'Beta-Bewerbung · Diesmal nicht', accent: '#8a8a95',
    heading: 'Diesmal leider nicht.',
    paragraphs: ['danke, dass du dich für die Xyntal-Beta beworben hast. Diesmal kann ich dich leider nicht aufnehmen – die Plätze der ersten Runde sind begrenzt und ich muss sehr eng auswählen.', 'Projekte, Gesuche und Nachrichten kannst du mit deinem Konto trotzdem nutzen. Und ich melde mich, sobald es neue Plätze gibt.'],
    button: 'Projekte entdecken', link: 'https://xyntal.de/projekte',
  },
};
const STATUS_LABELS = { in_pruefung: 'In Prüfung', eingeladen: 'Eingeladen', warteliste: 'Warteliste', angenommen: 'Angenommen', abgelehnt: 'Abgelehnt' };
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Gleicher Look wie die Anmelde-Mails (supabase/functions/send-auth-email): dunkle Karte, Farbverlauf, Logo, Button.
function statusMailText(name, status) {
  const mail = STATUS_MAILS[status];
  const safeName = escapeHtml(name);
  const text = ['Hallo ' + name + ',', '', ...mail.paragraphs.flatMap((p) => [p, '']), 'Stand deiner Bewerbung: ' + STATUS_LABELS[status], '', mail.button + ': ' + mail.link, '', 'Viele Grüße', 'Nico von Xyntal', '', 'Antworte einfach auf diese E-Mail, wenn du Fragen hast.', 'https://xyntal.de/impressum · https://xyntal.de/datenschutz'].join('\n');
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHtml(mail.subject)}</title></head><body style="margin:0;background:#07070b;color:#f5f5f7;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(mail.heading)} Stand deiner Bewerbung: ${STATUS_LABELS[status]}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07070b"><tr><td align="center" style="padding:40px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td align="center" style="padding:0 0 26px"><a href="https://xyntal.de/"><img src="https://xyntal.de/email/logo.png" width="113" height="31" alt="Xyntal" style="display:block;border:0"></a></td></tr><tr><td style="padding:1px;border-radius:24px;background:#26262f"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:40px;background:#121219;border-radius:23px"><div style="height:4px;background:linear-gradient(90deg,#a855f7,#ec4899,#6366f1);border-radius:4px"></div><p style="margin:28px 0 8px;color:${mail.accent};font-size:12px;letter-spacing:.08em;text-transform:uppercase">${escapeHtml(mail.kicker)}</p><h1 style="margin:0 0 16px;font-size:30px;line-height:1.15">${escapeHtml(mail.heading)}</h1><p style="margin:0 0 16px;color:#f5f5f7;font-size:16px;line-height:1.6">Hallo ${safeName},</p>${mail.paragraphs.map((p) => `<p style="margin:0 0 16px;color:#b4b4be;font-size:16px;line-height:1.6">${escapeHtml(p)}</p>`).join('')}<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 28px"><tr><td style="padding:12px 16px;border-radius:14px;background:#1a1a23;border:1px solid #26262f"><span style="color:#8a8a95;font-size:12px;letter-spacing:.08em;text-transform:uppercase">Stand deiner Bewerbung</span><br><span style="color:${mail.accent};font-size:16px;font-weight:bold">${STATUS_LABELS[status]}</span></td></tr></table><a href="${escapeHtml(mail.link)}" style="display:inline-block;padding:16px 26px;border-radius:999px;background:#a855f7;background-image:linear-gradient(100deg,#a855f7,#ec4899 50%,#6366f1);color:#fff;font-weight:bold;text-decoration:none">${escapeHtml(mail.button)} &rarr;</a><hr style="margin:28px 0 16px;border:0;border-top:1px solid #26262f"><p style="margin:0 0 6px;color:#f5f5f7;font-size:14px;line-height:1.5">Viele Grüße<br>Nico von Xyntal</p><p style="margin:0;color:#8a8a95;font-size:13px;line-height:1.5">Antworte einfach auf diese E-Mail, wenn du Fragen hast.</p></td></tr></table></td></tr><tr><td align="center" style="padding:24px 10px 0;color:#8a8a95;font-size:12px">Stop swiping. <span style="color:#e879f9">Start building.</span><br><a href="https://xyntal.de/impressum" style="color:#8a8a95">Impressum</a> · <a href="https://xyntal.de/datenschutz" style="color:#8a8a95">Datenschutz</a></td></tr></table></td></tr></table></body></html>`;
  return { subject: mail.subject, text, html };
}
// Supabase-Adresse und öffentlicher Schlüssel kommen aus der veröffentlichten config.js, damit nichts doppelt gepflegt wird.
// Sitemap der öffentlichen Karten (xyntal.de/name), damit Suchmaschinen sie finden, ohne dass eine Seite
// sie alle verlinkt. Liste aus get_member_cards (nur öffentliche Karten nicht gesperrter Konten), 10 Minuten gemerkt.
// null = Abfrage hat nicht geklappt.
let cardSitemap = { xml: null, until: 0 };
async function cardSitemapXml() {
  if (cardSitemap.xml && cardSitemap.until > Date.now()) return cardSitemap.xml;
  const config = supabaseConfig();
  if (!config) return null;
  try {
    const response = await fetch(config.url + '/rest/v1/rpc/get_member_cards', {
      method: 'POST', headers: { apikey: config.key, Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
      body: '{}', signal: AbortSignal.timeout(4000) });
    if (!response.ok) return null;
    const cards = await response.json();
    if (!Array.isArray(cards)) return null;
    const handles = [...new Set(cards.map((c) => String(c && c.handle || '').toLowerCase()).filter((h) => /^[a-z0-9][a-z0-9_-]{2,19}$/.test(h)))].sort().slice(0, 45000);
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + handles.map((h) => '  <url><loc>https://xyntal.de/' + h + '</loc></url>\n').join('') + '</urlset>\n';
    cardSitemap = { xml, until: Date.now() + 600000 };
    return xml;
  } catch { return null; }
}
function supabaseConfig() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) return { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY };
  try {
    const text = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
    const url = /supabaseUrl:\s*"([^"]+)"/.exec(text), key = /supabaseKey:\s*"([^"]+)"/.exec(text);
    if (url && key) return { url: url[1], key: key[1] };
  } catch {}
  return null;
}
// Vorschau beim Teilen (WhatsApp, Discord, X …): Name und Beschreibung der Seite xyntal.de/name in Titel und og:-Tags.
// Fragt get_public_card (öffentlich), merkt sich das Ergebnis 5 Minuten und wartet höchstens 2,5 Sekunden.
const metaCache = new Map();
async function profileMeta(handle) {
  const hit = metaCache.get(handle);
  if (hit && hit.until > Date.now()) return hit.meta;
  // null = diese Karte gibt es nicht (oder sie ist nicht öffentlich); undefined = die Abfrage hat
  // nicht geklappt, dann bleibt die Seite wie bisher bei 200 statt fälschlich „nicht gefunden“ zu melden.
  let meta;
  const config = supabaseConfig();
  if (config) {
    try {
      const response = await fetch(config.url + '/rest/v1/rpc/get_public_card', {
        method: 'POST', headers: { apikey: config.key, Authorization: 'Bearer ' + config.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_handle: handle }), signal: AbortSignal.timeout(2500) });
      const card = response.ok ? await response.json() : undefined;
      if (response.ok) meta = null;
      if (card && card.name) {
        const p = card.profile || {};
        const clip = (v, n) => { const t = String(v || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
        const desc = clip(p.headline || card.pitch || p.about || [card.role, card.city].filter(Boolean).join(' · '), 180);
        meta = { name: clip(card.name, 60), title: clip(card.name, 60) + ' · xyntal.de/' + card.handle, description: desc || 'Die Seite von ' + clip(card.name, 60) + ' auf Xyntal.' };
      }
    } catch {}
  }
  if (metaCache.size > 2000) metaCache.clear();
  metaCache.set(handle, { meta, until: Date.now() + (meta ? 300000 : 60000) });
  return meta;
}
function withProfileMeta(html, meta, handle) {
  const e = escapeHtml;
  const url = 'https://xyntal.de/' + handle;
  // Öffentliche Karten dürfen in Suchmaschinen erscheinen: statt „noindex“ (das für freie, reservierte
  // und nicht öffentliche Namen stehen bleibt) bekommt die Seite ihre feste Adresse und eine maschinenlesbare
  // Kurzfassung. Nur Angaben, die auf der öffentlichen Seite ohnehin stehen.
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'ProfilePage', url, inLanguage: 'de',
    mainEntity: { '@type': 'Person', name: meta.name || meta.title, description: meta.description, url } }).replace(/</g, '\\u003c');
  // Ersetzungen als Funktion, damit „$“ im Text nicht als Platzhalter gelesen wird
  return html
    .replace(/<meta name="robots" content="noindex">/, () => '<link rel="canonical" href="' + e(url) + '">\n  <script type="application/ld+json">' + ld + '</script>')
    .replace(/<title>[^<]*<\/title>/, () => '<title>' + e(meta.title) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*/, (m, a) => a + e(meta.description))
    .replace(/(<meta property="og:title" content=")[^"]*/, (m, a) => a + e(meta.title))
    .replace(/(<meta property="og:description" content=")[^"]*/, (m, a) => a + e(meta.description))
    .replace('<meta property="og:image"', () => '<meta property="og:url" content="https://xyntal.de/' + e(handle) + '">\n  <meta name="twitter:card" content="summary_large_image">\n  <meta property="og:image"');
}
// Kleiner SMTP-Client für IONOS (Port 465, TLS von Anfang an). Keine Abhängigkeiten nötig.
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
// Text immer, HTML dazu als multipart/alternative; alles base64, damit Umlaute und lange Zeilen sicher ankommen.
const wrap76 = (s) => b64(s).replace(/.{76}/g, '$&\r\n');
function mimeBody(text, html) {
  const part = (type, content) => ['Content-Type: ' + type + '; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(content)];
  if (!html) return part('text/plain', text);
  const boundary = 'xy-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  return ['Content-Type: multipart/alternative; boundary="' + boundary + '"', '', '--' + boundary, ...part('text/plain', text), '', '--' + boundary, ...part('text/html', html), '', '--' + boundary + '--'];
}
function smtpSend({ host, port, user, pass, from, fromName, to, subject, text, html }) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    let buffer = '', step = 0, finished = false;
    const fail = (error) => { if (finished) return; finished = true; socket.destroy(); reject(error); };
    const timer = setTimeout(() => fail(new Error('SMTP timeout')), 20000);
    const message = [
      'From: ' + (fromName ? '=?UTF-8?B?' + b64(fromName) + '?= <' + from + '>' : from),
      'To: <' + to + '>',
      'Reply-To: <' + from + '>',
      'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'Date: ' + new Date().toUTCString(),
      'Message-ID: <' + Date.now() + '.' + Math.random().toString(36).slice(2) + '@' + from.split('@')[1] + '>',
      'MIME-Version: 1.0', ...mimeBody(text, html),
    ].join('\r\n');
    const steps = [
      [220, 'EHLO xyntal.de'], [250, 'AUTH LOGIN'], [334, b64(user)], [334, b64(pass)], [235, 'MAIL FROM:<' + from + '>'],
      [250, 'RCPT TO:<' + to + '>'], [250, 'DATA'], [354, message + '\r\n.'], [250, 'QUIT'], [221, null],
    ];
    socket.setEncoding('utf8');
    socket.on('error', fail);
    socket.on('close', () => { if (!finished) fail(new Error('SMTP connection closed')); });
    socket.on('data', (chunk) => {
      buffer += chunk;
      // Antworten sind Zeilen "NNN-text" (weitere folgen) oder "NNN text" (letzte Zeile)
      while (/^\d{3} .*\r\n/m.test(buffer)) {
        const end = buffer.search(/^\d{3} .*\r\n/m) + /^\d{3} .*\r\n/m.exec(buffer)[0].length;
        const reply = buffer.slice(0, end); buffer = buffer.slice(end);
        const code = Number(reply.slice(0, 3));
        const [expected, command] = steps[step];
        if (code !== expected) return fail(new Error('SMTP ' + code + ' at step ' + step + ': ' + reply.replace(/[\r\n]+$/, '').replace(user, '[user]').replace(pass, '[pass]').slice(0, 200)));
        step++;
        if (command === null) { finished = true; clearTimeout(timer); socket.end(); return resolve(); }
        socket.write(command + '\r\n');
      }
    });
  });
}
// SMTP-Zugang: Umgebungsvariablen SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM (auch als Zeilen in .smtp.env),
// ersatzweise die Einzeldateien .ionos-user / .ionos-pass / .ionos-sender. SMTP_FROM darf „Name <adresse>“ sein.
function smtpConfig() {
  const fileEnv = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '.smtp.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) fileEnv[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  } catch {}
  const get = (name, file, legacy) => process.env[name] || fileEnv[name] || process.env[legacy] || (file ? readSecret(file, legacy) : '');
  const user = get('SMTP_USER', '.ionos-user', 'IONOS_SMTP_USER').trim();
  const pass = get('SMTP_PASS', '.ionos-pass', 'IONOS_SMTP_PASSWORD');
  const fromRaw = get('SMTP_FROM', '.ionos-sender', 'IONOS_SENDER_EMAIL').trim();
  const named = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(fromRaw);
  return {
    host: get('SMTP_HOST', null, 'IONOS_SMTP_HOST') || 'smtp.ionos.de', port: Number(get('SMTP_PORT', null, 'IONOS_SMTP_PORT') || 465),
    user, pass, from: named ? named[2] : (fromRaw || user), fromName: named ? named[1].replace(/^"|"$/g, '') || 'Xyntal' : 'Nico von Xyntal',
  };
}
const statusMailTransport = { send: smtpSend };
const statusMailLimits = { count: 0, until: 0 };
async function handleBetaStatusMail(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return feedbackJson(res, 405, { error: 'Nur POST.' }); }
  // Der Admin-Bereich läuft unter admin.xyntal.de (ADMIN_HOST, siehe unten) und ruft diese Route von dort auf.
  if (req.headers.origin && !['https://xyntal.de', 'https://www.xyntal.de', 'https://' + (process.env.ADMIN_HOST || 'admin.xyntal.de').toLowerCase()].includes(req.headers.origin)) return feedbackJson(res, 403, { error: 'Diese Anfrage ist nicht erlaubt.' });
  const token = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(req.headers.authorization || '');
  if (!token) return feedbackJson(res, 401, { error: 'Bitte als Admin einloggen.' });
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return feedbackJson(res, 415, { error: 'Ungültiges Datenformat.' });
  if (Number(req.headers['content-length']) > 1024) { req.resume(); return feedbackJson(res, 413, { error: 'Anfrage zu groß.' }); }
  try {
    const raw = await new Promise((resolve, reject) => {
      const chunks = []; let size = 0;
      req.setTimeout(15000, () => { reject(new Error('timeout')); req.destroy(); });
      req.on('data', chunk => { size += chunk.length; if (size <= 1024) chunks.push(chunk); });
      req.on('end', () => { req.setTimeout(0); resolve(size > 1024 ? null : Buffer.concat(chunks).toString('utf8')); });
      req.on('error', reject);
    });
    let data; try { data = raw === null ? null : JSON.parse(raw); } catch { data = null; }
    if (!data || typeof data !== 'object' || !/^\d{1,12}$/.test(String(data.id ?? ''))) return feedbackJson(res, 400, { error: 'Bewerbung nicht angegeben.' });
    const smtp = smtpConfig();
    const config = supabaseConfig();
    if (!smtp.user || !smtp.pass || !config) return feedbackJson(res, 503, { error: 'Der Mailversand über IONOS ist auf dem Server noch nicht eingerichtet.' });
    const now = Date.now();
    if (statusMailLimits.until <= now) { statusMailLimits.count = 0; statusMailLimits.until = now + 3600000; }
    // Nur geprüfte Admin-Anfragen zählen gegen die Grenze; sonst könnte jeder mit einem
    // erfundenen Token die Status-Mails für eine Stunde blockieren.
    if (statusMailLimits.count >= 60) return feedbackJson(res, 429, { error: 'Zu viele Status-Mails in der letzten Stunde.' });
    // Bewerbung mit den Rechten des Aufrufers lesen: Nicht-Admins bekommen hier nichts zurück.
    const headers = { apikey: config.key, Authorization: 'Bearer ' + token[1], Accept: 'application/json' };
    const lookup = await fetch(config.url + '/rest/v1/beta_applications?id=eq.' + data.id + '&select=id,name,email,status', { headers, signal: AbortSignal.timeout(10000) });
    if (lookup.status === 401) return feedbackJson(res, 401, { error: 'Deine Anmeldung ist abgelaufen. Bitte neu einloggen.' });
    if (!lookup.ok) throw new Error('Supabase HTTP ' + lookup.status);
    const [application] = await lookup.json();
    if (!application) return feedbackJson(res, 403, { error: 'Bewerbung nicht gefunden oder keine Admin-Rechte.' });
    statusMailLimits.count++;
    if (!STATUS_MAILS[application.status]) return feedbackJson(res, 200, { ok: true, skipped: true, reason: 'Für den Status „Neu“ gibt es keine Mail.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.email) || /[\r\n<>]/.test(application.name || '')) return feedbackJson(res, 400, { error: 'Bewerberdaten unbrauchbar.' });
    const { subject, text, html } = statusMailText(application.name || 'du', application.status);
    await statusMailTransport.send({ ...smtp, to: application.email, subject, text, html });
    // Merken, welcher Status zuletzt gemailt wurde (Spalten aus 20261103140000_beta_status_mail.sql)
    const mark = await fetch(config.url + '/rest/v1/beta_applications?id=eq.' + application.id, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ mailed_status: application.status, mailed_at: new Date().toISOString() }), signal: AbortSignal.timeout(10000),
    }).then((r) => r.ok).catch(() => false);
    return feedbackJson(res, 200, { ok: true, status: application.status, marked: mark });
  } catch (err) {
    console.error('[beta-status-mail] ' + err.name + ': ' + err.message);
    if (!res.destroyed && !res.headersSent) feedbackJson(res, 502, { error: 'Die Status-Mail konnte nicht gesendet werden: ' + err.message.slice(0, 160) });
  }
}

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2', '.woff':'font/woff', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml; charset=utf-8' };
// ---------- Englische Seiten unter /en/… ----------
// Dieselben Dateien wie die deutschen Seiten, auf dem Server mit dem Wörterbuch aus public/i18n-en.js
// (plus demo-i18n.js, beta-i18n.js) übersetzt – damit Suchmaschinen und Vorschauen englischen Text unter einer
// eigenen Adresse bekommen, ohne dass es zwei Fassungen jeder Seite zu pflegen gibt. Was im Wörterbuch fehlt,
// bleibt deutsch stehen. AGB und Widerruf gibt es bewusst nur auf Deutsch (nicht übersetzt).
const EN_PAGES = new Set(['index', 'matching', 'demo', 'preise', 'unternehmen', 'beta', 'brief', 'community', 'mitglieder', 'community-richtlinien', 'kuendigen']);
const enCache = new Map(); // "commit:seite" -> HTML
let enDict = { commit: null, dict: {}, patterns: [] };
function englishDict(currentRoot) {
  if (enDict.commit === commit) return enDict;
  const win = {};
  const box = require('node:vm').createContext({ window: win });
  for (const name of ['i18n-en.js', 'demo-i18n.js', 'beta-i18n.js']) {
    try { require('node:vm').runInContext(fs.readFileSync(path.join(currentRoot, name), 'utf8'), box, { timeout: 2000 }); } catch {}
  }
  enDict = { commit, dict: win.XYNTAL_EN || {}, patterns: win.XYNTAL_EN_PATTERNS || [] };
  return enDict;
}
const EN_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', shy: '­' };
const enDecode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp|shy);/g, (m, n) => EN_ENTITIES[n]).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
const enText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;').replace(/­/g, '&shy;');
const enAttr = (s) => enText(s).replace(/"/g, '&quot;');
// Wie translate() in public/i18n.js: Schlüssel = Text mit zusammengefassten Leerzeichen; undefined = kein Eintrag
function englishText(de, { dict, patterns }) {
  const key = de.replace(/\s+/g, ' ').trim();
  if (!key) return undefined;
  let en = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : undefined;
  if (en === undefined) {
    for (const [re, rep] of patterns) {
      const m = key.match(re);
      if (m) { try { en = typeof rep === 'function' ? rep(...m) : key.replace(re, rep); } catch {} break; }
    }
  }
  if (typeof en !== 'string') return undefined;
  return de.match(/^\s*/)[0] + en + de.match(/\s*$/)[0];
}
const EN_VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const EN_SKIP = new Set(['script', 'style', 'noscript', 'textarea', 'code']);
// Übersetzt Textknoten und die Attribute placeholder, aria-label, title, alt – dieselben Regeln wie im Browser
// (nichts in script/style/noscript/textarea/code und nichts unter data-no-i18n).
function englishHtml(html, words) {
  const out = [], stack = [];
  let blocked = 0;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][^\s>]*)\s*>|<([a-zA-Z][^\s>\/]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</gi;
  let m;
  while ((m = re.exec(html))) {
    const tok = m[0];
    if (m[1]) {
      const name = m[1].toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === name) { while (stack.length > i) { if (stack.pop().blocks) blocked--; } break; }
      }
      out.push(tok);
    } else if (m[2]) {
      const name = m[2].toLowerCase();
      let attrs = m[3] || '';
      const blocks = EN_SKIP.has(name) || /\sdata-no-i18n(?=[\s=\/]|$)/.test(attrs) || /\scontenteditable="true"/.test(attrs);
      if (!blocked && (!blocks || name === 'textarea')) {
        attrs = attrs.replace(/(\s(?:placeholder|aria-label|title|alt)=")([^"]*)(")/g, (all, a, value, z) => {
          const en = englishText(enDecode(value), words);
          return en === undefined ? all : a + enAttr(en) + z;
        });
      }
      out.push('<' + m[2] + attrs + '>');
      if (!EN_VOID.has(name) && !/\/\s*$/.test(attrs)) {
        stack.push({ name, blocks });
        if (blocks) blocked++;
        if (name === 'script' || name === 'style') { // Inhalt unverändert bis zum Ende-Tag
          const end = html.toLowerCase().indexOf('</' + name, re.lastIndex);
          out.push(html.slice(re.lastIndex, end < 0 ? html.length : end));
          re.lastIndex = end < 0 ? html.length : end;
        }
      }
    } else if (tok[0] === '<' || blocked || !tok.trim()) {
      out.push(tok);
    } else {
      const en = englishText(enDecode(tok), words);
      out.push(en === undefined ? tok : enText(en));
    }
  }
  return out.join('');
}
const enPath = (name) => (name === 'index' ? '/en' : '/en/' + name);
// Eine deutsche Seite als englische Fassung: Text, Kopfzeilen, Adressen und strukturierte Daten.
function englishPage(currentRoot, name) {
  const cacheKey = commit + ':' + name;
  if (enCache.has(cacheKey)) return enCache.get(cacheKey);
  const words = englishDict(currentRoot);
  const say = (de) => englishText(de, words);
  let html = englishHtml(fs.readFileSync(path.join(currentRoot, name + '.html'), 'utf8'), words);
  const site = 'https://xyntal.de';
  const here = site + enPath(name);
  html = html
    .replace(/<html lang="de"/, '<html lang="en"')
    .replace(/(<meta (?:name="description"|property="og:(?:title|description|image:alt)") content=")([^"]*)/g, (all, a, value) => { const en = say(enDecode(value)); return en === undefined ? all : a + enAttr(en); })
    .replace(/(<meta property="og:locale" content=")de_DE/, '$1en_US')
    .replace(/(<link rel="canonical" href=")[^"]*/, () => '<link rel="canonical" href="' + here)
    .replace(/(<meta property="og:url" content=")[^"]*/, () => '<meta property="og:url" content="' + here)
    // Strukturierte Daten: Adressen der Seite auf /en, deutsche Fragen-Liste weglassen (die Antworten sind
    // aus mehreren Textstücken zusammengesetzt und stehen so nicht im Wörterbuch)
    .replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (all, a, body, z) => {
      try {
        const data = JSON.parse(body);
        data['@graph'] = (data['@graph'] || []).filter((node) => node['@type'] !== 'FAQPage').map((node) => {
          if (node.inLanguage) node.inLanguage = 'en';
          if (node['@type'] === 'BreadcrumbList') for (const item of node.itemListElement || []) {
            const page = String(item.item || '').replace(site, '').replace(/^\//, '') || 'index';
            if (EN_PAGES.has(page)) item.item = site + enPath(page);
            item.name = say(String(item.name)) ?? item.name;
          }
          for (const holder of [node, node.offers || {}]) {
            if (typeof holder.description !== 'string') continue;
            const en = say(holder.description);
            if (en === undefined) delete holder.description; else holder.description = en;
          }
          return node;
        });
        return a + JSON.stringify(data).replace(/</g, '\\u003c') + z;
      } catch { return ''; }
    })
    // Dateien liegen nur einmal: Pfade ohne Schrägstrich am Anfang (css/neu.css) gelten ab der Wurzel
    .replace(/(\s(?:href|src|poster|action)=")(?![a-z][a-z0-9+.-]*:|\/|#|\?)(?:\.\/)?([^"]+)/gi, '$1/$2')
    .replace(/(\ssrcset=")([^"]*)/gi, (all, a, list) => a + list.split(',').map((part) => part.replace(/^(\s*)(?![a-z][a-z0-9+.-]*:|\/)(?:\.\/)?/i, '$1/')).join(','))
    // Links auf Seiten, die es englisch gibt, bleiben im Englischen
    .replace(/(<a(?:\s(?:[^>"']|"[^"]*"|'[^']*')*?)?\shref=")\/([a-z0-9-]*)(?=["#?])/gi, (all, a, page) => (EN_PAGES.has(page || 'index') ? a + enPath(page || 'index') : all));
  if (enCache.size > 64) enCache.clear();
  enCache.set(cacheKey, html);
  return html;
}
// Sicherheits-Header für alle Antworten. Skripte nur aus eigenen Dateien (keine Inline-Skripte);
// Inline-Styles bleiben erlaubt, weil Seiten style-Attribute setzen.
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Mikrofon nur für die eigene Seite: Sprachnachrichten in /nachrichten
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=(), payment=()',
  // frame-src: die eigene Seite (Profil bettet die Karte ein) und genau die Player, die
  // /nachrichten nach einem Klick auf „Abspielen“ lädt (YouTube ohne Cookies, TikTok,
  // Instagram, Vimeo) sowie die Einbettungen der freien Seite xyntal.de/name (YouTube, Vimeo, Spotify; page-canvas.js).
  // Vorschaubilder kommen als blob: vom App-Server (img-src blob:).
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://db.xyntal.de https://media.giphy.com https://media0.giphy.com https://media1.giphy.com https://media2.giphy.com https://media3.giphy.com https://media4.giphy.com https://i.giphy.com; media-src 'self' blob:; font-src 'self'; connect-src 'self' https://api.xyntal.de https://db.xyntal.de wss://db.xyntal.de https://*.sibforms.com; frame-src 'self' https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https://player.vimeo.com https://open.spotify.com; form-action 'self' https://*.sibforms.com; frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
};
// Bot-Schutz: höchstens so viele Anfragen pro IP und Minute. Eine Seite lädt rund 30 Dateien,
// 600 reichen also für etwa 20 Seiten pro Minute; Profilseiten (fragen Supabase) und
// Schnittstellen sind enger begrenzt. Zahlen per Umgebung änderbar, 0 schaltet ab.
const LIMITS = {
  all: Number(process.env.SITE_RATE_LIMIT ?? 600),
  heavy: Number(process.env.SITE_RATE_LIMIT_HEAVY ?? 60),
};
const hits = new Map();
let hitsWindow = 0;
function clientIp(req) {
  const remote = req.socket.remoteAddress || 'unknown';
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  const forwarded = process.env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
  return { ip: forwarded || (local && req.headers['cf-connecting-ip'] ? String(req.headers['cf-connecting-ip']) : remote), local: local && !forwarded };
}
// true = zu viele Anfragen (Antwort 429 ist dann schon geschrieben)
function overLimit(req, res, kind) {
  const { ip, local } = clientIp(req);
  if (local) return false; // Container-interne Abfragen (Deploy-Prüfung)
  const now = Date.now(), win = Math.floor(now / 60000);
  if (win !== hitsWindow || hits.size > 100000) { hits.clear(); hitsWindow = win; }
  const count = (key) => { const n = (hits.get(key) || 0) + 1; hits.set(key, n); return n; };
  const tooMany = (LIMITS.all > 0 && count('a:' + ip) > LIMITS.all) || (kind === 'heavy' && LIMITS.heavy > 0 && count('h:' + ip) > LIMITS.heavy);
  if (!tooMany) return false;
  const retry = String(60 - Math.floor((now % 60000) / 1000));
  res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': retry, 'Cache-Control': 'no-store' });
  res.end('Zu viele Anfragen. Bitte warte kurz und lade die Seite dann neu.');
  return true;
}
const HEAVY_PATH = /^\/(api\/|[a-z0-9][a-z0-9_-]{2,19}(\/invite)?\/?$)/i;

// Admin-Bereich nur unter admin.xyntal.de. Auf xyntal.de gibt es Admin-Seite und Admin-Skripte nicht
// (404); die Rechte prüfen Supabase (is_admin + 2FA) und der App-Server (Staff-Rolle).
const ADMIN_HOST = (process.env.ADMIN_HOST || 'admin.xyntal.de').toLowerCase();
const ADMIN_ONLY_FILES = new Set(['admin.html', 'admin.css', 'admin-contracts.css', 'admin-support.css', 'world-geo.js',
  'pages/admin.js', 'pages/admin-platform.js', 'pages/admin-contracts.js', 'pages/admin-people.js', 'pages/admin-support.js']);
// Seiten, die auf admin.xyntal.de bleiben (Anmeldung samt 2FA); alle anderen Seiten leiten auf xyntal.de um.
const ADMIN_HOST_PAGES = new Set(['admin.html', 'login.html', 'passwort-neu.html', '404.html']);
const MAIN_SITE = (process.env.MAIN_SITE_URL || 'https://xyntal.de').replace(/\/+$/, '');
const requestHost = (req) => String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
const httpServer = http.createServer(serve).listen(Number(process.env.SERVER_PORT || process.env.PORT || 4129), '0.0.0.0', () => console.log('Xyntal Daki server ready'));
function serve(req, res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  {
    let p = '/';
    try { p = new URL(req.url, 'http://localhost').pathname; } catch {}
    if (overLimit(req, res, HEAVY_PATH.test(p) ? 'heavy' : 'all')) return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (/^\/[a-z0-9][a-z0-9_-]{0,19}-[a-z0-9][a-z0-9_-]{0,118}\/$/.test(pathname)) {
    res.writeHead(308, { Location: pathname.slice(0, -1) + new URL(req.url, 'http://localhost').search });
    return res.end();
  }
  if (mediaHandler(req, res, pathname)) return;
  if (pathname === '/api/beta-feedback') { handleBetaFeedback(req, res); return; }
  if (pathname === '/api/beta-status-mail') { handleBetaStatusMail(req, res); return; }
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
  if (pathname === '/sitemap-karten.xml' && requestHost(req) !== ADMIN_HOST) {
    cardSitemapXml().then((xml) => {
      if (xml === null) { res.writeHead(503, {'Retry-After':'600', 'Cache-Control':'no-store'}); return res.end(); }
      res.writeHead(200, {'Content-Type':'application/xml; charset=utf-8', 'Cache-Control':'public, max-age=600'});
      res.end(req.method === 'HEAD' ? undefined : xml);
    });
    return;
  }
  if (!root) { res.writeHead(503, {'Retry-After':'10'}); return res.end('Website is starting'); }
  const currentRoot = root;
  // Englische Seiten: /en und /en/seite. Alles andere unter /en/ ist dieselbe Datei wie ohne /en
  // (Skripte laden manches relativ zur Seite); deutsche Seiten ohne englische Fassung leiten weiter.
  if ((pathname === '/en' || pathname.startsWith('/en/')) && requestHost(req) !== ADMIN_HOST) {
    const search = new URL(req.url, 'http://localhost').search;
    const rest = pathname.slice(4);
    const clean = rest.replace(/\/$/, '').replace(/\.html$/, '');
    const name = clean === '' ? 'index' : clean;
    const www = requestHost(req) === 'www.' + new URL(MAIN_SITE).hostname;
    if (EN_PAGES.has(name)) {
      if (www || pathname !== enPath(name)) {
        res.writeHead(301, { Location: (www ? MAIN_SITE : '') + enPath(name) + search, 'Cache-Control': 'public, max-age=3600' });
        return res.end();
      }
      let html;
      try { html = englishPage(currentRoot, name); } catch (error) { console.error('Englische Seite ' + name + ':', error.message); }
      if (html) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Language': 'en', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Xyntal-Commit': commit });
        return res.end(req.method === 'HEAD' ? undefined : html);
      }
    }
    if (/^[a-z0-9][a-z0-9_-]*$/i.test(name) && fs.existsSync(path.join(currentRoot, name + '.html'))) {
      res.writeHead(302, { Location: (name === 'index' ? '/' : '/' + name) + search, 'Cache-Control': 'no-store' });
      return res.end();
    }
    // Dateien (css, js, Bilder …) gibt es nur einmal; alles andere unter /en/ existiert nicht
    if (!path.extname(rest)) {
      res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
      return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(currentRoot,'404.html')));
    }
    pathname = '/' + rest;
  }
  let file = path.resolve(currentRoot, '.' + pathname);
  if (file !== currentRoot && !file.startsWith(currentRoot + path.sep)) { res.writeHead(403); return res.end(); }
  const onAdminHost = requestHost(req) === ADMIN_HOST;
  if (file === currentRoot || pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!path.extname(file) && fs.existsSync(file + '.html')) file += '.html';
  if (onAdminHost && (pathname === '/' || pathname === '/admin' || pathname === '/admin/')) file = path.join(currentRoot, 'admin.html');
  const relative = path.relative(currentRoot, file).split(path.sep).join('/');
  if (onAdminHost) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // Normale Seiten (und Kurzlinks) gehören zu xyntal.de, nicht in den Admin-Bereich.
    if (!ADMIN_HOST_PAGES.has(relative) && (relative.endsWith('.html') || !path.extname(relative))) {
      res.writeHead(308, { Location: MAIN_SITE + new URL(req.url, 'http://localhost').pathname + new URL(req.url, 'http://localhost').search });
      return res.end();
    }
  } else if (ADMIN_ONLY_FILES.has(relative)) {
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(currentRoot,'404.html')));
  }
  // Eine Adresse pro Seite (für Suchmaschinen und geteilte Links): www.xyntal.de, /seite.html,
  // /index.html und /seite/ leiten dauerhaft auf https://xyntal.de/seite um. Suchteil bleibt erhalten,
  // den Teil nach # reicht der Browser selbst weiter. Der Admin-Bereich bleibt, wie er ist.
  if (!onAdminHost) {
    const search = new URL(req.url, 'http://localhost').search;
    // Bestätigungsdateien von Suchmaschinen (google….html, yandex_….html) müssen genau unter ihrer Adresse antworten
    const isPage = (name) => /^[a-z0-9][a-z0-9_-]*$/i.test(name) && !/^(google|yandex_)[0-9a-f]+$/i.test(name) && fs.existsSync(path.join(currentRoot, name + '.html'));
    let clean = null;
    const html = /^\/([^/]+)\.html$/.exec(pathname);
    const slash = /^\/([^/]+)\/$/.exec(pathname);
    if (html && isPage(html[1])) clean = html[1] === 'index' ? '/' : '/' + html[1];
    else if (slash && isPage(slash[1])) clean = '/' + slash[1];
    else if (pathname === '/index') clean = '/';
    const www = requestHost(req) === 'www.' + new URL(MAIN_SITE).hostname;
    if (clean !== null || www) {
      res.writeHead(301, { Location: (www ? MAIN_SITE : '') + encodeURI(clean ?? pathname) + search, 'Cache-Control': 'public, max-age=3600' });
      return res.end();
    }
  }
  // Project short links use the project page and its existing access checks.
  if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && /^\/[a-z0-9][a-z0-9_-]{0,19}-[a-z0-9][a-z0-9_-]{0,118}\/?$/.test(pathname)) file = path.join(currentRoot, 'projekte.html');
  // xyntal.de/name/invite: Einladungsseite (Promo-Code = Link-Name, führt zur Registrierung)
  if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && /^\/[a-z0-9][a-z0-9_-]{2,19}\/invite\/?$/i.test(pathname) && fs.existsSync(path.join(currentRoot, 'invite.html'))) file = path.join(currentRoot, 'invite.html');
  // xyntal.de/name: Wunsch-Link zeigt die öffentliche Karte (die Seite fragt Supabase selbst)
  if ((!fs.existsSync(file) || !fs.statSync(file).isFile()) && /^\/[a-z0-9][a-z0-9_-]{2,19}\/?$/i.test(pathname) && fs.existsSync(path.join(currentRoot, 'u.html'))) file = path.join(currentRoot, 'u.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(path.join(currentRoot,'404.html')));
  }
  if (!fs.realpathSync(file).startsWith(fs.realpathSync(currentRoot) + path.sep)) { res.writeHead(403); return res.end(); }
  // Wunsch-Link xyntal.de/name: Vorschau-Tags mit Name und Beschreibung (ohne Treffer bleibt die Seite unverändert)
  const handleMatch = file === path.join(currentRoot, 'u.html') && /^\/([a-z0-9][a-z0-9_-]{2,19})\/?$/i.exec(pathname);
  if (handleMatch && req.method === 'GET') {
    profileMeta(handleMatch[1].toLowerCase()).then((meta) => {
      let html = fs.readFileSync(file, 'utf8');
      if (meta) html = withProfileMeta(html, meta, handleMatch[1].toLowerCase());
      // Keine öffentliche Karte unter diesem Namen: dieselbe Seite (sie zeigt „gibt es nicht“ bzw. „reserviert“
      // und lässt die Besitzerin oder den Besitzer weiter an die eigene Seite), aber als 404.
      res.writeHead(meta === null ? 404 : 200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff', 'X-Xyntal-Commit':commit});
      res.end(html);
    }).catch(() => { if (!res.headersSent) { res.writeHead(500); res.end(); } });
    return;
  }
  // ETag: der Browser fragt weiter jedes Mal nach (no-cache), lädt eine unveränderte Datei aber nicht
  // noch einmal (304). Schriften ändern sich praktisch nie und dürfen 30 Tage ohne Nachfrage bleiben.
  const stat = fs.statSync(file);
  const etag = 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
  const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': /\.woff2?$/.test(file) ? 'public, max-age=2592000' : 'no-cache', 'ETag': etag, 'X-Content-Type-Options':'nosniff', 'X-Xyntal-Commit':commit};
  if (String(req.headers['if-none-match'] || '').split(',').some((tag) => tag.trim() === etag)) { res.writeHead(304, headers); return res.end(); }
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}
// Große Uploads (Videos der freien Seite) dürfen länger als die Standard-5-Minuten dauern
httpServer.requestTimeout = 0;
// …aber wer nur Verbindungen offen hält (langsame Kopfzeilen, kein Datenfluss), fliegt raus.
httpServer.headersTimeout = 20000;
httpServer.timeout = 120000;
update();
setInterval(update, 30000);
