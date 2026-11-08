// Freie Seite: Editor (ziehen, skalieren, speichern) und öffentliche Darstellung, mit nachgebautem Supabase.
// Start: node tests/custom-page.cjs   (Server: python3 server.py auf Port 4173, oder PORT=… setzen)
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = `http://localhost:${process.env.PORT || 4173}`;
const UID = '00000000-0000-0000-0000-000000000001', LID = '11111111-1111-1111-1111-111111111111';
const links = [{ id: LID, title: 'Portfolio', url: 'https://example.com', icon: 'globe', active: true, clicks: null }];
const card = { handle: 'nico', name: 'Nico', pitch: 'Ich baue Dinge', user_id: UID, links, profile: {} };
let saved = null;

const stub = `window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: '${UID}' } } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: false } }) }) }) }),
  rpc: async (name, args) => {
    const r = await fetch('/__rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    return { data: await r.json(), error: null };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
}) };`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.route('**/vendor/supabase.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  await pg.route('**/__rpc/*', async (r) => {
    const name = new URL(r.request().url()).pathname.split('/').pop(), args = JSON.parse(r.request().postData() || '{}');
    let body = null;
    if (name === 'get_my_links') body = links;
    else if (name === 'get_my_card') body = card;
    else if (name === 'get_my_page') body = saved;
    else if (name === 'save_my_page') { saved = args.p_page; body = saved; }
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });

  // 1. Editor: Startlayout aus Karte und Links
  await pg.goto(`${base}/meine-seite`);
  await pg.waitForSelector('.pc-item');
  assert.equal(await pg.locator('.pc-item').count(), 3, 'Name, Kurztext, ein Link');

  // 2. Text hinzufügen, ziehen, Größe ändern
  await pg.click('[data-add="text"]');
  assert.equal(await pg.locator('.pc-item').count(), 4);
  const el = pg.locator('.pc-item').last();
  const b0 = await el.boundingBox();
  await pg.mouse.move(b0.x + 20, b0.y + 20); await pg.mouse.down(); await pg.mouse.move(b0.x + 120, b0.y + 160, { steps: 6 }); await pg.mouse.up();
  const b1 = await pg.locator('.pc-item').last().boundingBox();
  assert.ok(b1.x - b0.x > 80 && b1.y - b0.y > 100, 'Element folgt dem Zeiger');
  const se = await pg.locator('.pe-sel i[data-h="se"]').boundingBox();
  await pg.mouse.move(se.x + 7, se.y + 7); await pg.mouse.down(); await pg.mouse.move(se.x + 87, se.y + 47, { steps: 5 }); await pg.mouse.up();
  const b2 = await pg.locator('.pc-item').last().boundingBox();
  assert.ok(b2.width - b1.width > 60, 'Ecke ändert die Breite');
  await pg.fill('textarea[data-p="text"]', 'Hallo <b>Welt</b>');
  await pg.fill('input[data-p="color"]', '#ff0000');
  // 3. Rückgängig
  await pg.keyboard.press('Escape');
  await pg.click('[data-undo]');
  // 4. Speichern
  await pg.click('[data-save]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Gespeichert'));
  assert.ok(saved && saved.items.length >= 3);
  assert.ok(saved.items.every((i) => ['text', 'link', 'image'].includes(i.type)));
  await pg.screenshot({ path: process.env.SHOT_EDITOR || '/tmp/editor.png' });

  // 5. Öffentliche Seite zeigt das gespeicherte Layout, Text wird nicht als HTML gedeutet
  saved.items.push({ id: 'xss', type: 'text', text: '<img src=x onerror=window.__xss=1>', x: 10, y: 400, w: 200, h: 40, color: 'red;background:url(x)' });
  const pub = await ctx.newPage();
  pub.on('pageerror', (e) => errors.push(e.message));
  await pub.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, page: saved, design: {} }) }));
  await pub.goto(`${base}/nico`);
  await pub.waitForSelector('.pc .pc-item', { timeout: 8000 });
  assert.ok(await pub.locator('a.pc-l[href="https://example.com"]').count() === 1, 'Link ist klickbar');
  assert.equal(await pub.evaluate(() => window.__xss), undefined, 'kein Skript aus Text');
  assert.equal(await pub.locator('.pc img[src=x]').count(), 0);
  await pub.setViewportSize({ width: 390, height: 800 });
  await pub.screenshot({ path: process.env.SHOT_PUBLIC || '/tmp/public.png', fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('OK custom-page');
})().catch((e) => { console.error(e); process.exit(1); });
