// Karten-Editor (/meine-karte): „Als Bild speichern“ (1080 × 1350) und „Als Story teilen“ (1080 × 1920).
// Start: node tests/card-story.cjs   (Server: python3 server.py auf Port 4173, oder PORT=… setzen)
// Mit OUT=<ordner> werden beide PNGs zum Ansehen dort abgelegt.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = `http://localhost:${process.env.PORT || 4173}`;

// Ohne Anmeldung: Der Editor läuft trotzdem, meine-karte.js zeigt nur den Login-Hinweis
const stub = `window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  rpc: async () => ({ data: null, error: null }),
  storage: { from: () => ({}) },
}) };`;

// Breite und Höhe aus dem IHDR-Block einer PNG-Datei
const pngSize = (buf) => {
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', 'keine PNG-Datei');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ acceptDownloads: true });
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.route('**/vendor/supabase.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await pg.goto(`${base}/meine-karte`);
  await pg.waitForFunction(() => window.XyntalBuilder && window.XyntalCardDraw);
  await pg.evaluate(() => window.XyntalBuilder.set({
    name: 'Nico Test', city: 'Regensburg', role: 'Entwicklung', skills: ['Qt', 'QML', 'TypeScript'], hours: 12,
    pitch: 'Ich baue eine Plattform, auf der Leute ihr Team finden.', handle: 'nicotest',
  }));

  const grab = async (selector) => {
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.evaluate((s) => document.querySelector(s).click(), selector)]);
    const file = await dl.path();
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(file) };
  };

  const feed = await grab('[data-card-save]');
  assert.equal(feed.name, 'meine-xyntal-karte.png');
  assert.deepEqual(pngSize(feed.buf), [1080, 1350]);

  const story = await grab('[data-card-story]');
  assert.equal(story.name, 'meine-xyntal-story.png');
  assert.deepEqual(pngSize(story.buf), [1080, 1920]);
  assert.match(await pg.textContent('[data-card-status]'), /meine-xyntal-story\.png/);
  assert.equal(await pg.isDisabled('[data-card-story]'), false, 'Knopf bleibt nach dem Export bedienbar');
  assert.match(await pg.textContent('[data-card-story-hint]'), /Link-Sticker/, 'Hinweis zum Link-Sticker steht beim Knopf');

  // Die oberen 250 px der Story bleiben frei: dort liegt nur der Hintergrund, keine Karte
  const topIsEmpty = await pg.evaluate(async () => {
    const c = await window.XyntalCardDraw('story');
    const px = c.getContext('2d').getImageData(540, 255, 1, 1).data;
    const inner = c.getContext('2d').getImageData(540, 700, 1, 1).data;
    return { top: [...px], card: [...inner] };
  });
  assert.notDeepEqual(topIsEmpty.top, topIsEmpty.card, 'Karte beginnt unterhalb des freien Bereichs');

  if (process.env.OUT) {
    fs.mkdirSync(process.env.OUT, { recursive: true });
    fs.writeFileSync(path.join(process.env.OUT, feed.name), feed.buf);
    fs.writeFileSync(path.join(process.env.OUT, story.name), story.buf);
  }
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('ok – card-story: Feed 1080×1350, Story 1080×1920');
})().catch((e) => { console.error(e); process.exit(1); });
