// Freie Seite: Editor (ziehen, skalieren, speichern) und öffentliche Darstellung, mit nachgebautem Supabase.
// Start: node tests/custom-page.cjs   (Server: python3 server.py auf Port 4173, oder PORT=… setzen)
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = `http://localhost:${process.env.PORT || 4173}`;
const UID = '00000000-0000-0000-0000-000000000001', LID = '11111111-1111-1111-1111-111111111111';
const links = [{ id: LID, title: 'Portfolio', url: 'https://example.com', icon: 'globe', active: true, clicks: null },
  { id: '11111111-1111-1111-1111-111111111112', title: 'GitHub', url: 'https://github.com/x', icon: 'github', active: true, clicks: null },
  { id: '11111111-1111-1111-1111-111111111113', title: 'Discord', url: 'Username: nico', icon: 'discord', active: true, clicks: null }];
const card = { handle: 'nico', name: 'Nico', role: 'Entwicklung', level: 'Fortgeschritten', skills: ['Qt', 'QML'], pitch: 'Ich baue Dinge', user_id: UID, links, design: {}, profile: { headline: 'Gründer von Xyntal', about: 'Ich baue Xyntal am Wochenende.', offer: 'Erfahrung', seek: 'Ein Team' } };
let saved = null;

const stub = `window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: '${UID}' } } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true } }) }) }) }),
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

  // 1. Editor öffnet direkt auf der eigenen Seite (xyntal.de/name#gestalten)
  await pg.addInitScript(([uid]) => localStorage.setItem('sb-rralgrlujoupprwlvoyo-auth-token', JSON.stringify({ access_token: 'x', expires_at: 9999999999, user: { id: uid } })), [UID]);
  await pg.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, page: saved, design: {} }) }));
  await pg.goto(`${base}/nico#gestalten`);
  await pg.waitForSelector('.pc-item');
  assert.ok(await pg.locator('.pc-item.pc-block').count() >= 5, 'Profil-Bausteine liegen als Elemente auf der Seite');
  assert.equal(await pg.locator('.pc-item.pc-link').count(), 3, 'drei Links');
  // Links verstreuen, dann am ersten anheften: alle genau untereinander, gleiche Breite
  const lk = pg.locator('.pc-item.pc-link');
  for (const [i, dx, dy] of [[1, 300, 40], [2, 520, -60]]) {
    const bb = await lk.nth(i).boundingBox();
    await pg.mouse.move(bb.x + 10, bb.y + 10); await pg.mouse.down(); await pg.mouse.move(bb.x + 10 + dx, bb.y + 10 + dy, { steps: 8 }); await pg.mouse.up();
  }
  await lk.nth(0).click();
  await pg.click('[data-act="stack"]');
  const boxes = await Promise.all([0, 1, 2].map((i) => lk.nth(i).boundingBox()));
  boxes.sort((a, b) => a.y - b.y);
  assert.ok(boxes.every((b) => Math.abs(b.x - boxes[0].x) < 1 && Math.abs(b.width - boxes[0].width) < 1), 'gleiche Kante und Breite');
  const g1 = boxes[1].y - (boxes[0].y + boxes[0].height), g2 = boxes[2].y - (boxes[1].y + boxes[1].height);
  assert.ok(g1 > 2 && Math.abs(g1 - g2) < 1, 'gleicher Abstand');
  // Magnet: einen Link grob unter einen anderen ziehen – er rastet an der linken Kante ein
  const a0 = await lk.nth(2).boundingBox(), t0 = boxes[0];
  await pg.mouse.move(a0.x + 10, a0.y + 10); await pg.mouse.down();
  await pg.mouse.move(a0.x + 10 + 200, a0.y + 10, { steps: 4 });
  await pg.mouse.move(t0.x + 10 + 4, a0.y + 10, { steps: 4 });
  assert.ok(await pg.locator('.pe-guide.is-v').count() >= 1, 'Hilfslinie sichtbar');
  await pg.mouse.up();
  const a1 = await lk.nth(2).boundingBox();
  assert.ok(Math.abs(a1.x - t0.x) < 1, 'Kante eingerastet');
  await pg.keyboard.press('Escape');
  const n0 = await pg.locator('.pc-item').count();

  // 2. Text hinzufügen, ziehen, Größe ändern
  await pg.click('[data-add="window"]');
  assert.equal(await pg.locator('.pc-item').count(), n0 + 1);
  const el = pg.locator('.pc-item').last();
  const b0 = await el.boundingBox();
  await pg.mouse.move(b0.x + 20, b0.y + 20); await pg.mouse.down(); await pg.mouse.move(b0.x + 60, b0.y + 140, { steps: 6 }); await pg.mouse.up();
  const b1 = await pg.locator('.pc-item').last().boundingBox();
  assert.ok(b1.x - b0.x > 30 && b1.y - b0.y > 100, 'Element folgt dem Zeiger');
  const se = await pg.locator('.pe-sel i[data-h="se"]').boundingBox();
  await pg.mouse.move(se.x + 7, se.y + 7); await pg.mouse.down(); await pg.mouse.move(se.x + 47, se.y + 27, { steps: 5 }); await pg.mouse.up();
  const b2 = await pg.locator('.pc-item').last().boundingBox();
  assert.ok(b2.width - b1.width > 30, 'Ecke ändert die Breite');
  await pg.fill('textarea[data-p="text"]', 'Hallo <b>Welt</b>');
  await pg.fill('input[data-p="color"]', '#ff0000');
  // 2b. Drehen: Regler und Griff über dem Element
  await pg.fill('input[data-p="rot"]', '30');
  assert.match(await pg.locator('.pc-item').last().getAttribute('style'), /rotate\(30deg\)/);
  const rh = await pg.locator('.pe-sel i[data-h="rot"]').boundingBox(), box = await pg.locator('.pc-item').last().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await pg.mouse.move(rh.x + 7, rh.y + 7); await pg.mouse.down(); await pg.mouse.move(cx + 150, cy, { steps: 6 }); await pg.mouse.up();
  const rot = Number(await pg.locator('input[data-p="rot"]').inputValue());
  assert.ok(Math.abs(rot - 90) < 3, 'Griff nach rechts = 90°, war ' + rot);
  // 3. Rückgängig
  await pg.keyboard.press('Escape');
  // 3-. Aufbau-Vorlage: Links stehen danach in einem Raster mit gleicher Breite
  await pg.click('[data-add="layout"]'); await pg.click('[data-layout="grid"]');
  const lb = await Promise.all([0, 1].map((i) => pg.locator('.pc-item.pc-link').nth(i).boundingBox()));
  assert.ok(Math.abs(lb[0].y - lb[1].y) < 1 && Math.abs(lb[0].width - lb[1].width) < 1, 'Raster-Vorlage: zwei Links nebeneinander');
  await pg.click('[data-undo]');
  // 3a. Overlays der Seite
  await pg.click('[data-add="bg"]'); await pg.click('[data-ov="aurora"]'); await pg.click('[data-ov="grain"]');
  assert.equal(await pg.locator('.pc > .pc-ov-aurora').count(), 1, 'Aurora hinter den Elementen');
  assert.equal(await pg.locator('.pc > .pc-ov-grain').count(), 1, 'Körnung über den Elementen');
  await pg.click('[data-add="bg"]');
  // 3b. Menü „+ Mehr“: Vorlagen, Formen, Knopf, Link-Symbole, Video
  const before = await pg.locator('.pc-item').count();
  for (const key of ['heading', 'quote', 'sticker', 'badge', 'card', 'rect', 'circle', 'line', 'glow', 'button', 'icons']) {
    await pg.click('[data-add="block"]'); await pg.click(`[data-make="${key}"]`); await pg.keyboard.press('Escape');
  }
  assert.equal(await pg.locator('.pc-item').count(), before + 11, 'alle Vorlagen eingefügt');
  assert.equal(await pg.locator('.pc-icons .pc-ib').count(), 3, 'Link-Symbole zeigen alle Links');
  // 3c. Animationen: fertiger Effekt mit Vorschau, eigener Code mit Prüfung
  await pg.click('.pc-item.pc-shape.is-circle');
  await pg.selectOption('select[data-p="a_p"]', 'float');
  assert.equal(await pg.locator('.pc-item.pc-shape.is-circle[data-anim="float"]').count(), 1, 'Effekt am Element');
  await pg.click('[data-act="preview"]');
  assert.equal(await pg.locator('.pc-item.is-preview').count(), 1, 'Vorschau läuft');
  await pg.keyboard.press('Escape');
  await pg.click('.pc-item.pc-button');
  await pg.selectOption('select[data-p="a_p"]', 'custom');
  await pg.fill('textarea[data-p="a_code"]', '0% { drehen: 0 } 100% { background: url(x) }');
  assert.match(await pg.locator('[data-anim-err]').textContent(), /Farbe als #rrggbb/, 'url() abgelehnt');
  await pg.fill('textarea[data-p="a_code"]', '@keyframes x { 0%, 100% { transform: translateY(0) } 50% { transform: translateY(-20px) rotate(10deg); opacity: 0.5 } }');
  assert.match(await pg.locator('[data-anim-err]').textContent(), /gültig/, 'normales CSS wird verstanden');
  await pg.fill('textarea[data-p="a_code"]', '.btn-neon:hover { animation: neon-pulse 1.5s infinite; }\n@keyframes neon-pulse { 0%, 100% { box-shadow: 0 0 5px #0ff, 0 0 20px #0ff } 50% { box-shadow: 0 0 10px #0ff, 0 0 50px rgba(0, 255, 255, 0.6); text-shadow: 0 0 10px #0ff } }');
  assert.match(await pg.locator('[data-anim-err]').textContent(), /gültig/, 'Tutorial-CSS mit :hover und Schatten');
  await pg.fill('textarea[data-p="a_code"]', '0% { drehen: 0; farbe: #ff00aa } 50% { verschieben: 0 -20; skalieren: 1.2 } 100% { drehen: 360 }');
  assert.match(await pg.locator('[data-anim-err]').textContent(), /gültig/);
  assert.equal(await pg.locator('.pc style').count(), 1, 'eigene Keyframes erzeugt');
  await pg.keyboard.press('Escape');
  await pg.click('.pc-item.pc-button');
  await pg.fill('input[data-p="url"]', 'https://cal.com/nico'); await pg.press('input[data-p="url"]', 'Enter');
  await pg.locator('input[data-p="url"]').evaluate((el) => el.dispatchEvent(new Event('change', { bubbles: true })));
  await pg.check('input[data-p="sh"]');
  await pg.selectOption('select[data-p="hover"]', 'tilt');
  await pg.click('[data-act="hover-preview"]');
  assert.equal(await pg.locator('.pc-item.pc-button.is-hover[data-hover="tilt"]').count(), 1, 'Hover-Vorschau');
  await pg.keyboard.press('Escape');
  await pg.click('[data-add="block"]'); await pg.click('[data-embed-open]');
  await pg.fill('[data-embed-url]', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10');
  assert.ok(await pg.locator('[data-embed-go]').isDisabled(), 'Einbetten erst nach Bestätigung');
  await pg.check('[data-embed-own]'); await pg.click('[data-embed-go]');
  assert.equal(await pg.locator('.pc-embed iframe[src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"]').count(), 1, 'YouTube eingebettet');
  await pg.keyboard.press('Escape');
  await pg.click('[data-add="block"]'); await pg.click('[data-embed-open]');
  await pg.fill('[data-embed-url]', 'javascript:alert(1)'); await pg.check('[data-embed-own]'); await pg.click('[data-embed-go]');
  assert.match(await pg.locator('[data-status]').textContent(), /nicht einbetten/);
  await pg.keyboard.press('Escape'); await pg.click('[data-add="block"]');
  // 4. Speichern
  await pg.click('[data-save]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Gespeichert'));
  assert.ok(saved && saved.items.length >= 3);
  assert.equal(await pg.evaluate(() => location.pathname), '/nico', 'Editor läuft auf der eigenen Adresse');
  assert.ok(saved.items.every((i) => ['text', 'link', 'image', 'block', 'shape', 'button', 'embed', 'icons'].includes(i.type)));
  await pg.screenshot({ path: process.env.SHOT_EDITOR || '/tmp/editor.png' });

  // 5. Öffentliche Seite zeigt das gespeicherte Layout, Text wird nicht als HTML gedeutet
  saved.items.push({ id: 'xss', type: 'text', text: '<img src=x onerror=window.__xss=1>', x: 10, y: 400, w: 200, h: 40, color: 'red;background:url(x)' });
  const pub = await ctx.newPage();
  pub.on('pageerror', (e) => errors.push(e.message));
  await pub.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, page: saved, design: {} }) }));
  await pub.goto(`${base}/nico`);
  await pub.waitForSelector('.pc .pc-item', { timeout: 8000 });
  assert.equal(await pub.locator('.pc-item[style*="rotate("]').count(), 1, 'Drehung öffentlich sichtbar');
  assert.ok(await pub.locator('a.pc-l[href="https://example.com"]').count() === 1, 'Link ist klickbar');
  assert.equal(await pub.locator('a.pc-btn[href="https://cal.com/nico"]').count(), 1, 'Knopf mit Adresse');
  assert.equal(await pub.locator('.pc-embed iframe').count(), 1, 'Video öffentlich');
  assert.ok(saved.items.some((i) => i.type === 'embed' && i.own === true), 'Bestätigung gespeichert');
  assert.equal(await pub.locator('.pc-item[data-anim="float"]').count(), 1, 'Animation öffentlich');
  assert.equal(await pub.locator('.pc > .pc-ov-aurora, .pc > .pc-ov-grain').count(), 2, 'Overlays öffentlich');
  const btn = pub.locator('.pc-item[data-hover="tilt"] a.pc-btn');
  const tf0 = await btn.evaluate((el) => getComputedStyle(el).transform);
  await btn.hover({ force: true }); await pub.waitForTimeout(400);
  assert.notEqual(await btn.evaluate((el) => getComputedStyle(el).transform), tf0, 'Hover-Effekt greift');
  assert.match(await pub.locator('.pc-item[data-anim="custom"] > *').evaluate((el) => getComputedStyle(el).animationName), /^pck-/, 'eigene Animation läuft');
  assert.equal(await pub.locator('.pc-item[data-anim="float"] > *').evaluate((el) => getComputedStyle(el).animationName), 'pc-float', 'Effekt läuft');
  assert.match(await pub.locator('.pc style').textContent(), /@keyframes pck-[a-z0-9]+\{0%\{color:#ff00aa;transform:rotate\(0deg\)\}/, 'eigene Animation öffentlich');
  assert.equal(await pub.locator('.pc-icons a.pc-ib').count(), 2, 'Symbole (2 Links, 1 Text zum Kopieren)');
  assert.equal(await pub.evaluate(() => window.__xss), undefined, 'kein Skript aus Text');
  assert.equal(await pub.locator('.pc img[src=x]').count(), 0);
  await pub.setViewportSize({ width: 390, height: 800 });
  await pub.screenshot({ path: process.env.SHOT_PUBLIC || '/tmp/public.png', fullPage: true });
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('OK custom-page');
})().catch((e) => { console.error(e); process.exit(1); });
