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
let saved = null, draft = null, shared = null, viewsTracked = 0, removed = [];
// Exklusive Designs: unlocks = null simuliert fehlende RPCs (altes SQL, 404); sonst { designs, revoked }
let unlocks = null, acks = [];
// Overlays der geladenen Version (get_my_page_version); Vorlagen mit exklusivem Design lehnt der Server ab (wie migration design_unlocks)
let versionOv = [];
const unlockedDesigns = () => (unlocks && unlocks.designs) || [];
const lockedSave = (p) => !!(p && (p.ov || []).includes('snow')) && !unlockedDesigns().includes('snow');

const stub = `window.supabase = { createClient: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: '${UID}' } } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_premium: true } }) }) }) }),
  rpc: async (name, args) => {
    const r = await fetch('/__rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    const j = await r.json();
    return r.ok ? { data: j, error: null } : { data: null, error: j };
  },
  storage: { from: () => ({ upload: async () => ({ error: null }),
    list: async () => ({ data: [{ name: '22222222-2222-2222-2222-222222222222.webp', created_at: '2020-01-01T00:00:00Z' }, { name: '33333333-3333-3333-3333-333333333333.webp', created_at: '2020-01-01T00:00:00Z' }, { name: '44444444-4444-4444-4444-444444444444.webp', created_at: new Date().toISOString() }], error: null }),
    remove: async (paths) => { await fetch('/__rpc/__remove', { method: 'POST', body: JSON.stringify(paths) }); return { error: null }; } }) },
}) };`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(e.message));
  await pg.route('**/vendor/supabase.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
  const rpcRoute = async (r) => {
    const name = new URL(r.request().url()).pathname.split('/').pop(), args = JSON.parse(r.request().postData() || '{}');
    let body = null, status = 200;
    if (name === 'get_my_links') body = links;
    else if (name === 'get_my_card') body = card;
    else if (name === 'get_my_page') body = saved;
    else if (name === 'save_my_page') {
      if (lockedSave(args.p_page)) { status = 400; body = { message: 'XYNTAL_UNLOCK:locked', code: 'P0001' }; }
      else { saved = args.p_page; draft = null; body = saved; }
    }
    else if (name === 'get_my_page_state') body = { page: saved, draft, views: 1234, versions: 1 };
    else if (name === 'save_my_page_draft') {
      if (lockedSave(args.p_page)) { status = 400; body = { message: 'XYNTAL_UNLOCK:locked', code: 'P0001' }; }
      else { draft = args.p_page; body = true; }
    }
    else if (name === 'get_my_design_unlocks') { if (unlocks === null) { status = 404; body = { message: 'function not found' }; } else body = unlocks; }
    else if (name === 'ack_design_revoked') { acks.push(args.p_design); body = true; }
    else if (name === 'list_my_page_versions') body = [{ id: 7, created_at: '2026-11-08T10:00:00Z', items: 2 }];
    else if (name === 'get_my_page_version') body = { w: 1920, h: 700, ov: versionOv, items:[{ id: 'v1', type: 'text', text: 'Alte Version', x: 20, y: 20, w: 300, h: 60 }] };
    else if (name === 'list_page_templates') body = [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Neon Grid', handle: 'lena', mine: false,
      page: { w: 1920, h: 800, items: [{ id: 't1', type: 'text', text: 'Von Lena', x: 40, y: 20, w: 300, h: 60 }, { id: 't2', type: 'link', ref: '00000000-0000-0000-0000-000000000000', x: 40, y: 120, w: 320, h: 60 }] } }];
    else if (name === 'share_page_template') {
      if ((args.p_page.ov || []).includes('snow')) { status = 400; body = { message: 'XYNTAL_UNLOCK:locked', code: '42501' }; }
      else { shared = args; body = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; }
    }
    else if (name === '__remove') { removed = args; body = true; }
    await r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  };
  await pg.route('**/__rpc/*', rpcRoute);

  // 1. Editor öffnet direkt auf der eigenen Seite (xyntal.de/name#gestalten)
  await pg.addInitScript(([uid]) => localStorage.setItem('sb-db-auth-token', JSON.stringify({ access_token: 'x', expires_at: 9999999999, user: { id: uid } })), [UID]);
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
  await pg.click('[data-add="bg"]');
  assert.equal(await pg.locator('[data-ov="snow"]').count(), 0, 'Schnee ohne Freischaltung: kein Overlay-Eintrag');
  await pg.click('[data-ov="aurora"]'); await pg.click('[data-ov="grain"]');
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
  // 3d. Extras: Countdown, Text-Effekt, Glas, Parallax, Theme, Ebenen, Mehrfachauswahl, Cursor, Partikel
  await pg.click('[data-add="block"]'); await pg.click('[data-make="countdown"]');
  assert.match(await pg.locator('.pc-cd [data-cd-n]').first().textContent(), /\d+d \d\d:\d\d:\d\d/, 'Countdown läuft');
  await pg.selectOption('select[data-p="px"]', 'front');
  await pg.keyboard.press('Escape');
  await pg.click('[data-add="block"]'); await pg.click('[data-make="gradtext"]');
  assert.equal(await pg.locator('.pc-tfx-gradient .pc-tx').count(), 1, 'Verlaufstext');
  await pg.selectOption('select[data-p="tfx"]', 'letters');
  assert.ok(await pg.locator('.pc-tfx-letters .pc-ch').count() > 5, 'Buchstaben einzeln');
  await pg.check('input[data-p="glass"]');
  assert.equal(await pg.locator('.pc-t.pc-glass').count() >= 1, true, 'Glas');
  await pg.keyboard.press('Escape');
  // Mehrfachauswahl: zwei Links mit Umschalt anklicken, links ausrichten
  const L2 = pg.locator('.pc-item.pc-link');
  await L2.nth(0).click(); await L2.nth(1).click({ modifiers: ['Shift'] });
  assert.equal(await pg.locator('.pe-in-group').count(), 2, 'zwei ausgewählt');
  await pg.click('[data-galign="left"]');
  const g = await Promise.all([0, 1].map((i) => L2.nth(i).boundingBox()));
  assert.ok(Math.abs(g[0].x - g[1].x) < 1, 'links ausgerichtet');
  await pg.keyboard.press('Escape');
  // Ebenen-Liste
  await pg.click('[data-add="layers"]');
  assert.ok(await pg.locator('.pe-layer').count() > 5, 'Ebenen-Liste');
  await pg.click('[data-add="layers"]');
  // Theme
  await pg.click('[data-add="layout"]');
  assert.equal(await pg.locator('[data-theme="snow"]').count(), 0, 'Schnee-Theme ohne Freischaltung nicht sichtbar');
  await pg.click('[data-theme="cyber"]');
  assert.equal(await pg.locator('.pc > .pc-ov-grid').count(), 1, 'Theme setzt Overlays');
  // Hintergrund: Partikel, bewegter Verlauf, Cursor
  await pg.click('[data-add="bg"]'); await pg.click('[data-ov="network"]');
  await pg.selectOption('[data-cursor-sel]', 'ring');
  await pg.click('[data-add="bg"]');
  assert.equal(await pg.locator('.pc-ov-network canvas').count(), 1, 'Netz-Partikel');
  // 3e. Kontakt, Aufrufe, Kopieren/Einfügen, Entwurf, Handy-Vorschau, Tastatur, Extras
  // (unten ablegen, damit sie nichts verdecken)
  await pg.click('[data-add="block"]'); await pg.click('[data-make="contact"]'); await pg.fill('input[data-p="y"]', '1400'); await pg.keyboard.press('Escape');
  await pg.click('[data-add="block"]'); await pg.click('[data-make="counter"]'); await pg.fill('input[data-p="y"]', '1500');
  assert.match(await pg.locator('.pc-counter .pc-cd-n').textContent(), /1\.234/, 'Aufrufe im Editor');
  await pg.fill('input[data-p="mo"]', '1');
  await pg.click('.pc-item.pc-counter');
  const nc = await pg.locator('.pc-item').count();
  await pg.keyboard.press('Control+c'); await pg.keyboard.press('Control+v');
  assert.equal(await pg.locator('.pc-item').count(), nc + 1, 'Strg+C / Strg+V fügt eine Kopie ein');
  await pg.keyboard.press('Delete');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Entwurf gespeichert'), null, { timeout: 8000 });
  assert.ok(draft && draft.items.some((i) => i.type === 'counter' && i.mo === 1), 'Entwurf automatisch gespeichert ' + JSON.stringify(draft && draft.items.filter((i) => i.type === 'counter')));
  assert.equal(saved, null, 'Entwurf ist nicht öffentlich');
  await pg.click('[data-phone]');
  assert.equal(await pg.locator('.pe-phone .pc.is-wide:not(.is-edit)').count(), 1, 'Handy-Vorschau');
  assert.equal(await pg.locator('.pe-phone .pc-item.pc-counter').evaluate((el) => getComputedStyle(el).position), 'relative', 'am Handy gestapelt');
  const first = await pg.locator('.pe-phone .pc-item').evaluateAll((els) => els.filter((e) => e.offsetHeight).map((e) => [e.className, e.getBoundingClientRect().top]).sort((a, b) => a[1] - b[1])[0][0]);
  assert.match(first, /pc-counter/, 'Platz am Handy 1 steht oben');
  await pg.click('[data-phone]');
  // Tastatur: Fokus auf ein Element wählt es aus
  await pg.locator('.pc-item.pc-contact').focus();
  assert.match(await pg.locator('.pe-insp h2').first().textContent(), /Kontakt/, 'Tab-Fokus wählt aus');
  assert.equal(await pg.locator('.pc-item.pc-contact').getAttribute('role'), 'button');
  await pg.keyboard.press('Escape');
  // Extras: Statistik, Versionen, Vorlagen
  pg.on('dialog', (d) => d.accept());
  await pg.click('[data-add="extras"]');
  await pg.waitForSelector('[data-version]');
  assert.match(await pg.locator('[data-pop]').textContent(), /1\.234/, 'Statistik zeigt Aufrufe');
  assert.equal(await pg.locator('[data-tpl="winter"]').count(), 0, 'Winter-Vorlage ohne Freischaltung nicht sichtbar');
  const keep = await pg.locator('.pc-item').count();
  await pg.click('[data-tpl="creator"]');
  assert.equal(await pg.locator('.pc-t', { hasText: 'Hi, ich bin Nico' }).count(), 1, 'eingebaute Vorlage');
  assert.equal(await pg.locator('.pc-item.pc-link').count(), 3, 'Links bleiben');
  await pg.click('[data-undo]');
  assert.equal(await pg.locator('.pc-item').count(), keep, 'Vorlage rückgängig');
  await pg.click('[data-add="extras"]'); await pg.click('[data-add="extras"]');
  await pg.waitForSelector('[data-ctpl]');
  await pg.fill('[data-share-name]', 'Meine Seite');
  await pg.click('[data-share]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('geteilt'));
  assert.ok(shared && shared.p_page.items.every((i) => i.type !== 'embed' && i.type !== 'image' && !i.url && (i.type !== 'link' || i.ref === '00000000-0000-0000-0000-000000000000')), 'Vorlage ohne Medien und Links');
  await pg.click('[data-ctpl]');
  assert.equal(await pg.locator('.pc-t', { hasText: 'Von Lena' }).count(), 1, 'Community-Vorlage übernommen');
  assert.equal(await pg.locator('.pc-item.pc-link').count(), 3, 'Platzhalter + eigene Links');
  await pg.click('[data-undo]');
  await pg.click('[data-add="extras"]'); await pg.click('[data-add="extras"]');
  await pg.waitForSelector('[data-version]');
  await pg.click('[data-version]');
  await pg.waitForSelector('.pc-t:has-text("Alte Version")', { timeout: 5000 });
  assert.equal(await pg.locator('.pc-t', { hasText: 'Alte Version' }).count(), 1, 'Version geladen');
  await pg.click('[data-undo]');
  // 4. Veröffentlichen
  await pg.click('[data-save]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Veröffentlicht'));
  await pg.waitForTimeout(300);
  // Ersetzte/unbenutzte Dateien gehen sofort weg (auch wenn nur eine alte Version sie nutzte); ein frischer fremder Upload bleibt
  assert.deepEqual(removed, [UID + '/22222222-2222-2222-2222-222222222222.webp', UID + '/33333333-3333-3333-3333-333333333333.webp'], 'unbenutzte Uploads sofort gelöscht, frische fremde bleiben');
  assert.equal(draft, null, 'Veröffentlichen löscht den Entwurf');
  assert.ok(saved && saved.items.length >= 3);
  assert.equal(await pg.evaluate(() => location.pathname), '/nico', 'Editor läuft auf der eigenen Adresse');
  assert.ok(saved.items.every((i) => ['text', 'link', 'image', 'block', 'shape', 'button', 'embed', 'icons', 'countdown', 'contact', 'counter'].includes(i.type)));
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
  assert.ok(await pub.locator('.pc > .pc-ov').count() >= 2, 'Overlays öffentlich');
  assert.equal(await pub.locator('.pc[data-cursor="ring"]').count(), 1, 'Cursor öffentlich');
  assert.ok(await pub.locator('.pc-item[data-px]').count() >= 1, 'Parallax öffentlich');
  assert.equal(await pub.locator('.pc-cd[data-cd]').count(), 1, 'Countdown öffentlich');
  assert.equal(await pub.locator('a.pc-contact[href="/nachrichten"]').count(), 1, 'Kontakt (eigene Seite) führt zu den Nachrichten');
  assert.equal(await pub.locator('.pf-report').count(), 0, 'eigene Seite: kein Melden');
  // Das Cyberpunk-Theme hat dem Knopf „Neon“ gegeben: beim Überfahren leuchtet er
  const btn = pub.locator('.pc-item[data-hover="neon"] a.pc-btn');
  const sh0 = await btn.evaluate((el) => getComputedStyle(el).boxShadow);
  await btn.hover({ force: true }); await pub.waitForTimeout(450);
  assert.notEqual(await btn.evaluate((el) => getComputedStyle(el).boxShadow), sh0, 'Hover-Effekt greift');
  assert.match(await pub.locator('.pc-item[data-anim="custom"] > *').evaluate((el) => getComputedStyle(el).animationName), /^pck-/, 'eigene Animation läuft');
  assert.equal(await pub.locator('.pc-item[data-anim="float"] > *').evaluate((el) => getComputedStyle(el).animationName), 'pc-float', 'Effekt läuft');
  assert.match(await pub.locator('.pc style').textContent(), /@keyframes pck-[a-z0-9]+\{0%\{color:#ff00aa;transform:rotate\(0deg\)\}/, 'eigene Animation öffentlich');
  assert.equal(await pub.locator('.pc-icons a.pc-ib').count(), 2, 'Symbole (2 Links, 1 Text zum Kopieren)');
  assert.equal(await pub.evaluate(() => window.__xss), undefined, 'kein Skript aus Text');
  assert.equal(await pub.locator('.pc img[src=x]').count(), 0);
  assert.equal(await pub.evaluate(() => window.XyntalPageCanvas.html({ w: 480, h: 400, ov: ['gibtsnicht', 'snow'], items: [] }, {}).includes('gibtsnicht')), false, 'unbekanntes Overlay: kein Absturz, wird weggelassen');
  // Fremde Besucher ohne Konto: Kontakt führt zur Anmeldung, Melden ist da, Aufruf wird gezählt
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const guest = await ctx2.newPage();
  guest.on('pageerror', (e) => errors.push(e.message));
  await guest.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, user_id: undefined, page: saved, design: {}, views: 42 }) }));
  await guest.route('**/rest/v1/rpc/track_page_view', (r) => { viewsTracked++; r.fulfill({ status: 204, body: '' }); });
  await guest.goto(`${base}/nico`);
  await guest.waitForSelector('.pc .pc-item');
  assert.equal(await guest.locator('a.pc-contact[href="/login"]').count(), 1, 'Gast: Kontakt → Anmeldung');
  assert.match(await guest.locator('.pc-counter .pc-cd-n').textContent(), /42/, 'Aufrufe öffentlich');
  assert.equal(await guest.locator('a.pf-report[href="/community-richtlinien?melden=nico#melden"]').count(), 1, 'Melden-Knopf');
  await guest.reload(); await guest.waitForSelector('.pc .pc-item');
  assert.equal(viewsTracked, 1, 'Aufruf einmal je Sitzung gezählt');
  await pub.setViewportSize({ width: 390, height: 800 });
  await pub.screenshot({ path: process.env.SHOT_PUBLIC || '/tmp/public.png', fullPage: true });

  // Prüfsumme der Schnee-Leinwand (Pixel); zeigt, ob sie sich bewegt
  const canvasSum = (p) => p.evaluate(() => {
    const cv = document.querySelector('.pc-ov-snow canvas'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let s = 0; for (let i = 3; i < d.length; i += 4) s = (s + d[i] * ((i % 97) + 1)) % 1000000007;
    return s;
  });
  // 6. Exklusives Design Schnee (nur freigeschaltete Konten). Jedes Szenario mit frischer Seite: im selben Kontext
  // stellt session-share.js die Sitzung nach dem zweiten Laden nicht mehr her.
  const ownerPage = async () => {
    const c = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await c.addInitScript(([uid]) => localStorage.setItem('sb-db-auth-token', JSON.stringify({ access_token: 'x', expires_at: 9999999999, user: { id: uid } })), [UID]);
    await c.route('**/vendor/supabase.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
    await c.route('**/__rpc/*', rpcRoute);
    await c.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, page: saved, design: {} }) }));
    const p = await c.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    return p;
  };
  // 6a. Entzug: einmaliger Hinweis, Schließen bestätigt beim Server, Theme-Kachel bleibt ausgeblendet
  unlocks = { designs: [], revoked: ['snow'] };
  pg = await ownerPage();
  await pg.goto(`${base}/nico#gestalten`);
  await pg.waitForSelector('.pe-stage .pc-item');
  assert.equal(await pg.locator('.pe-notice[data-revoked="snow"]').count(), 1, 'Entzug: Hinweis erscheint');
  assert.match(await pg.locator('.pe-notice p').textContent(), /Schneeflocken entfallen/, 'Entzug: Text');
  await pg.click('.pe-notice .pe-x');
  assert.equal(await pg.locator('.pe-notice').count(), 0, 'Hinweis schließbar');
  await pg.waitForTimeout(300);
  assert.deepEqual(acks, ['snow'], 'Schließen bestätigt ack_design_revoked(snow)');
  await pg.click('[data-add="layout"]');
  assert.equal(await pg.locator('[data-theme="snow"]').count(), 0, 'nach Entzug keine Kachel');
  await pg.click('[data-add="layout"]');

  // 6b. Freigeschaltet: Kachel vorn mit Badge und Hinweis, Vorlage und Overlay wählbar, Schnee läuft
  unlocks = { designs: ['snow'], revoked: [] };
  pg = await ownerPage();
  await pg.goto(`${base}/nico#gestalten`);
  await pg.waitForSelector('.pe-stage .pc-item');
  await pg.click('[data-add="layout"]');
  assert.equal(await pg.locator('[data-pop] .pe-theme').first().getAttribute('data-theme'), 'snow', 'Schnee ist die erste Kachel');
  assert.equal(await pg.locator('[data-pop] .pe-excl').count(), 1, 'Badge „Exklusiv“');
  assert.match(await pg.locator('[data-pop] .pe-hint').last().textContent(), /Nur für ausgewählte Konten/, 'Hinweis unter den Kacheln');
  await pg.click('[data-theme="snow"]');
  await pg.waitForSelector('.pc-ov-snow canvas');
  assert.equal(await pg.locator('.pc > .pc-ov-snow').count(), 1, 'Schnee-Overlay liegt auf der Seite');
  await pg.waitForTimeout(300);
  const flakes = await pg.locator('.pc-ov-snow canvas').evaluate((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
    return n;
  });
  assert.ok(flakes > 0, 'Flocken werden gezeichnet');
  // Vorlage „Winter“: Theme Schnee, Kopfzeile und Schnee-Overlay
  pg.on('dialog', (d) => d.accept());
  await pg.click('[data-add="extras"]');
  await pg.click('[data-tpl="winter"]');
  assert.equal(await pg.locator('.pc-t', { hasText: 'Lass uns im Winter etwas aufbauen' }).count(), 1, 'Winter-Vorlage übernommen');
  assert.equal(await pg.locator('.pc > .pc-ov-snow').count(), 1, 'Winter-Vorlage: Schnee-Overlay');
  // Neu-Rendern (Overlay aus/an, Handy-Vorschau): genau eine Animationsschleife, kein Doppel
  await pg.click('[data-add="bg"]');
  assert.equal(await pg.locator('[data-ov="snow"]').count(), 1, 'Schnee in der Overlay-Auswahl');
  await pg.click('[data-ov="snow"]'); await pg.click('[data-ov="snow"]');
  await pg.click('[data-add="bg"]');
  await pg.click('[data-phone]'); await pg.click('[data-phone]');
  assert.equal(await pg.locator('.pc-ov-snow canvas').count(), 1, 'ein Canvas nach dem Neu-Rendern');
  const rafPerSec = await pg.evaluate(() => new Promise((ok) => {
    const orig = window.requestAnimationFrame; let n = 0;
    // Nur Aufrufe aus page-canvas.js zählen (Schnee); andere Schleifen der Seite (xyntal-core.js) gehören nicht dazu
    window.requestAnimationFrame = (f) => { if (/page-canvas\.js/.test(new Error().stack || '')) n++; return orig(f); };
    setTimeout(() => { window.requestAnimationFrame = orig; ok(n); }, 1000);
  }));
  assert.ok(rafPerSec > 20 && rafPerSec < 100, 'eine Schnee-Schleife (rAF pro Sekunde ' + rafPerSec + ')');
  // Tab im Hintergrund: die Schnee-Leinwand bleibt stehen; zurück im Tab bewegt sie sich wieder
  const setHidden = (hidden) => pg.evaluate((hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  await pg.waitForTimeout(150);
  const h1 = await canvasSum(pg); await pg.waitForTimeout(600);
  assert.equal(await canvasSum(pg), h1, 'Hintergrund-Tab: Schnee pausiert');
  await setHidden(false);
  const v1 = await canvasSum(pg); await pg.waitForTimeout(600);
  assert.notEqual(await canvasSum(pg), v1, 'zurück im Tab: Schnee läuft weiter');

  // 6c. Gespeichert mit Schnee, aber ohne Freischaltung: Vorschau ohne Schnee, Speichern meldet es und nimmt es heraus
  unlocks = { designs: [], revoked: [] };
  saved = { ...saved, ov: ['snow', 'vignette'] };
  pg = await ownerPage();
  await pg.goto(`${base}/nico#gestalten`);
  await pg.waitForSelector('.pe-stage .pc-item');
  assert.equal(await pg.locator('.pc-ov-snow').count(), 0, 'ohne Freischaltung kein Schnee in der Vorschau');
  await pg.click('[data-add="bg"]'); await pg.click('[data-ov="grain"]'); await pg.click('[data-ov="grain"]'); await pg.click('[data-add="bg"]');
  await pg.click('[data-save]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('nicht freigeschaltet'));
  assert.equal(await pg.locator('[data-status]').textContent(), 'Das Design Schnee ist für dein Konto nicht freigeschaltet. Wähle ein anderes Design.', 'Speichern-Meldung');
  await pg.click('[data-add="bg"]');
  assert.equal(await pg.locator('[data-ov="snow"]').count(), 0, 'Schnee nach dem Fehler aus der Seite genommen');
  await pg.click('[data-add="bg"]');

  // 6c2. Version mit gesperrtem Schnee laden: Schnee fällt sofort aus der Seite, die Meldung wird nicht überschrieben, Speichern klappt
  versionOv = ['snow'];
  unlocks = { designs: [], revoked: [] };
  draft = null;
  pg = await ownerPage();
  await pg.goto(`${base}/nico#gestalten`);
  await pg.waitForSelector('.pe-stage .pc-item');
  await pg.click('[data-add="extras"]');
  await pg.waitForSelector('[data-version]');
  await pg.click('[data-version]');
  await pg.waitForSelector('.pc-t:has-text("Alte Version")', { timeout: 5000 });
  assert.equal(await pg.locator('.pc-ov-snow').count(), 0, 'Version mit gesperrtem Schnee: kein Schnee');
  // Entwurfs-Speichern läuft nach 2,5 s (ersetzt die Meldung durch „Entwurf gespeichert“) – aber kein Sperr-Fehler
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Entwurf gespeichert'), null, { timeout: 8000 });
  assert.ok(!(await pg.locator('[data-status]').evaluate((el) => el.classList.contains('is-error'))), 'Version: kein Fehler nach dem Laden');
  assert.ok(!(await pg.locator('[data-status]').textContent()).includes('nicht freigeschaltet'), 'Version: kein Sperr-Fehler');
  await pg.click('[data-add="extras"]');
  await pg.click('[data-save]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Veröffentlicht'));
  assert.ok(saved && !saved.ov.includes('snow'), 'nach Version: gesperrter Schnee nicht gespeichert');
  versionOv = [];

  // 6e. Vorlage teilen mit Schnee: die geteilte Kopie hat keinen Schnee, die eigene Seite behält ihn
  unlocks = { designs: ['snow'], revoked: [] };
  saved = { ...saved, ov: ['snow', 'vignette'] };
  draft = null;
  pg = await ownerPage();
  await pg.goto(`${base}/nico#gestalten`);
  await pg.waitForSelector('.pe-stage .pc-item');
  await pg.click('[data-add="extras"]');
  await pg.waitForSelector('[data-ctpl]');
  await pg.fill('[data-share-name]', 'Schnee Test');
  shared = null;
  await pg.click('[data-share]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Vorlage geteilt'));
  assert.ok(shared && !shared.p_page.ov.includes('snow') && shared.p_page.ov.includes('vignette'), 'geteilte Kopie ohne Schnee, übrige Overlays bleiben');
  assert.equal(await pg.locator('[data-status]').textContent(), 'Vorlage geteilt. Der Schnee-Effekt ist exklusiv und nicht Teil der Vorlage.', 'Hinweis nach dem Teilen');
  assert.equal(await pg.locator('.pc > .pc-ov-snow').count(), 1, 'eigene Seite behält Schnee in der Vorschau');
  // Eine Änderung, die sich aufhebt (Körnung an und wieder aus), damit Veröffentlichen aktiv ist
  await pg.click('[data-add="bg"]'); await pg.click('[data-ov="grain"]'); await pg.click('[data-ov="grain"]'); await pg.click('[data-add="bg"]');
  await pg.click('[data-save]');
  await pg.waitForFunction(() => document.querySelector('[data-status]').textContent.includes('Veröffentlicht'));
  assert.ok(saved.ov.includes('snow'), 'eigene Seite behält Schnee gespeichert');

  // 6d. Public: gespeicherter Schnee wird gezeigt (ohne Abfrage), mit reduzierter Bewegung statisch, unbekannte Namen stören nicht
  // Mindestens ein Element, sonst zeigt u.js das Standardprofil statt der freien Seite
  const pubPage = { w: 480, h: 400, bg: { color: '#0b1a2b' }, ov: ['snow'], items: [{ id: 'w1', type: 'text', text: 'Winter', x: 40, y: 40, w: 300, h: 60, size: 40, color: '#f2f7fc' }] };
  const still = await browser.newContext({ viewport: { width: 800, height: 700 }, reducedMotion: 'reduce' });
  const sp = await still.newPage();
  sp.on('pageerror', (e) => errors.push(e.message));
  await sp.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, page: pubPage, design: {} }) }));
  await sp.goto(`${base}/nico`);
  await sp.waitForSelector('.pc > .pc-ov-snow canvas');
  const s1 = await canvasSum(sp); await sp.waitForTimeout(700); const s2 = await canvasSum(sp);
  assert.ok(s1 > 0, 'statisches Bild ist gezeichnet');
  assert.equal(s1, s2, 'reduzierte Bewegung: statisches Bild');
  await still.close();
  const mv = await browser.newContext({ viewport: { width: 800, height: 700 } });
  const mp = await mv.newPage();
  mp.on('pageerror', (e) => errors.push(e.message));
  await mp.route('**/rest/v1/rpc/get_public_card', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...card, page: pubPage, design: {} }) }));
  await mp.goto(`${base}/nico`);
  await mp.waitForSelector('.pc > .pc-ov-snow canvas');
  const m1 = await canvasSum(mp); await mp.waitForTimeout(700); const m2 = await canvasSum(mp);
  assert.notEqual(m1, m2, 'Schnee läuft ohne reduzierte Bewegung');
  await mv.close();
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('OK custom-page');
})().catch((e) => { console.error(e); process.exit(1); });
