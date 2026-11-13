// CSP der Website (hosting/daki/server.cjs): Videos als Profilbild und Banner kommen über signierte
// URLs direkt von https://db.xyntal.de und müssen laufen (media-src); Videos von anderen Herkünften
// bleiben gesperrt. Der Test nimmt die echte CSP aus server.cjs und spielt im Browser ein Video ab.
// Start: node tests/csp-media.cjs   (braucht keinen laufenden Server)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
const csp = /'Content-Security-Policy': "([^"]+)"/.exec(source)[1];
const video = fs.readFileSync(path.join(__dirname, 'fixtures/card-story/avatar.webm'));
const SITE = 'https://xyntal.test';

(async () => {
  const media = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('media-src '));
  assert.ok(media.split(/\s+/).includes('https://db.xyntal.de'), 'media-src erlaubt db.xyntal.de');

  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.route(`${SITE}/**`, (r) => r.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: '<!doctype html><title>csp</title>' }));
  const serve = (r) => r.fulfill({ contentType: 'video/webm', headers: { 'Access-Control-Allow-Origin': '*' }, body: video });
  await pg.route('https://db.xyntal.de/**', serve);
  await pg.route('https://example.com/**', serve);
  await pg.goto(`${SITE}/nicotest`);
  await pg.evaluate(() => { window.__blocked = []; document.addEventListener('securitypolicyviolation', (e) => window.__blocked.push(`${e.effectiveDirective} ${e.blockedURI}`)); });

  // Wie u.js/banners.js: <video src="signierte URL"> ohne crossorigin
  const plays = (url) => pg.evaluate((src) => new Promise((res) => {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true;
    v.onloadeddata = () => res(true); v.onerror = () => res(false);
    setTimeout(() => res(false), 5000);
    v.src = src; document.body.append(v);
  }), url);

  assert.equal(await plays('https://db.xyntal.de/storage/v1/object/sign/avatars/a/b.webm?token=t'), true, 'Video von db.xyntal.de läuft');
  assert.equal(await plays('https://example.com/b.webm'), false, 'Video von fremder Herkunft bleibt gesperrt');
  assert.deepEqual(await pg.evaluate(() => window.__blocked), ['media-src https://example.com/b.webm'], 'nur die fremde Herkunft verletzt die CSP');
  await browser.close();
  console.log('ok – csp-media: Videos von db.xyntal.de erlaubt, andere gesperrt');
})().catch((e) => { console.error(e); process.exit(1); });
