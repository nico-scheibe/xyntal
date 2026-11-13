// Story-Bild für Instagram (card-story.js): Knopf „Für Instagram-Story“ auf der eigenen Seite xyntal.de/name
// und auf /meine-karte, PNG 1080 × 1920, freie Ränder für Instagram, Profilbild und Banner aus privaten
// Buckets (Bild, GIF, Video → erstes Bild; Fehler → Initiale), am Handy navigator.share({ files }).
// Dazu „Als Bild speichern“ (1080 × 1350) im Karten-Editor.
// Start: node tests/card-story.cjs   (Server: python3 server.py auf Port 4173, oder PORT=… setzen)
// Mit OUT=<ordner> werden die Bilder und Bildschirmfotos zum Ansehen dort abgelegt.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const base = `http://localhost:${process.env.PORT || 4173}`;
const SUPA = 'https://db.xyntal.de';
const FIX = path.join(__dirname, 'fixtures/card-story');
const file = (n) => fs.readFileSync(path.join(FIX, n));
const OUT = process.env.OUT;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const save = (name, buf) => { if (OUT) fs.writeFileSync(path.join(OUT, name), buf); };

const ME = '11111111-2222-3333-4444-555555555555';
const AV = (ext) => `${ME}/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.${ext}`;
const BN = (ext) => `${ME}/bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.${ext}`;
const card = (over = {}) => ({
  user_id: ME, handle: 'nicotest', name: 'Nico', role: 'Entwicklung', level: 'Profi', city: 'Regensburg', mode: 'Hybrid',
  pitch: 'Ich baue eine Plattform, auf der Leute ihr Team finden.', looking: 'Mitgründer:in', skills: ['Qt', 'QML', 'TypeScript'],
  hours: 12, link: 'https://example.com', is_premium: true, is_verified: true,
  design: { theme: 'aurora', surface: 'dark', shape: 'circle', layout: 'left', banner: 'image' },
  banner_path: BN('png'), profile: { avatar_path: AV('jpg') }, ...over,
});

// Supabase nachstellen: Karte, Profilbild (authenticated), signierte URLs, Dateien mit CORS
async function mockSupabase(ctx, state) {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
  await ctx.route(`${SUPA}/**`, async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const json = (body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
    const p = url.pathname;
    if (p === '/rest/v1/rpc/get_public_card') return json(state.card);
    if (p.startsWith('/storage/v1/object/authenticated/avatars/')) {
      if (state.avatarStatus !== 200) return route.fulfill({ status: state.avatarStatus, headers: cors, body: 'nein' });
      return route.fulfill({ status: 200, headers: cors, contentType: 'image/jpeg', body: file(state.avatarFile) });
    }
    const sign = /^\/storage\/v1\/object\/sign\/(avatars|banners)\/(.+)$/.exec(p);
    if (sign && req.method() === 'POST') return json({ signedURL: `/object/sign/${sign[1]}/${sign[2]}?token=t` });
    if (sign) {
      const name = sign[1] === 'avatars' ? state.avatarFile : state.bannerFile;
      state.ranges.push(req.headers().range || '');
      return route.fulfill({ status: 200, headers: cors, contentType: name.endsWith('webm') ? 'video/webm' : 'image/png', body: file(name) });
    }
    return json(p.startsWith('/rest/') ? [] : {});
  });
  await ctx.route('https://api.xyntal.de/**', (r) => r.abort());
}
const session = (id) => `localStorage.setItem('sb-db-auth-token', JSON.stringify({ access_token: 'x', refresh_token: 'y', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '${id}' } }));`;

// Breite und Höhe aus dem IHDR-Block einer PNG-Datei
const pngSize = (buf) => {
  assert.equal(buf.subarray(1, 4).toString('latin1'), 'PNG', 'keine PNG-Datei');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
};
// Pixel zählen: rot (Profilbild, erstes Bild), blau (zweites Bild von GIF/Video), grün (Banner);
// dazu: Sind die Ränder für Instagram (oben 250, unten 340 px) nur Grund (#1C1C1C)?
async function analyse(pg, buf) {
  return pg.evaluate(async (b64) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const near = (i, r, gg, bb) => Math.abs(d[i] - r) < 14 && Math.abs(d[i + 1] - gg) < 14 && Math.abs(d[i + 2] - bb) < 14;
    let red = 0, blue = 0, green = 0, edge = 0, accent = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (near(i, 255, 0, 0)) red++;
      if (near(i, 0, 0, 255)) blue++;
      if (d[i + 1] > 100 && d[i] < 30 && d[i + 2] < 30) green++; // Banner (unter der Abdunklung der Karte)
      if (near(i, 0x8F, 0xB8, 0xFF)) accent++;
      if ((y < 250 || y >= c.height - 340) && !(d[i] === 28 && d[i + 1] === 28 && d[i + 2] === 28)) edge++;
    }
    return { red, blue, green, edge, accent };
  }, buf.toString('base64'));
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // ---------- 1. Eigene Seite am Computer: Knopf neben „Teilen“, Download ----------
  {
    const state = { card: card(), avatarStatus: 200, avatarFile: 'avatar.jpg', bannerFile: 'banner.png', ranges: [] };
    const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
    await mockSupabase(ctx, state);
    await ctx.addInitScript(session(ME));
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${base}/nicotest`);
    await pg.waitForSelector('[data-story-share]');
    const row = await pg.$$eval('.pf-share > *', (els) => els.map((e) => e.textContent.trim()));
    // „Teilen“ heißt ohne navigator.share (Chromium am Computer) „Link kopieren“
    assert.deepEqual(row, [await pg.evaluate(() => (navigator.share ? 'Teilen' : 'Link kopieren')), 'Für Instagram-Story'], 'Story-Knopf steht neben „Teilen“');

    const grab = async (sel) => {
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click(sel)]);
      return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
    };
    const story = await grab('[data-story-share]');
    assert.equal(story.name, 'xyntal-story-nicotest.png');
    save('story-desktop.png', story.buf);
    assert.deepEqual(pngSize(story.buf), [1080, 1920]);
    const px = await analyse(pg, story.buf);
    console.log('  eigene Seite:', px);
    assert.ok(px.red > 1500, 'Profilbild ist gezeichnet');
    assert.ok(px.green > 5000, 'eigenes Banner ist gezeichnet');
    assert.ok(px.accent > 300, '@xyntal in Blau');
    assert.equal(px.edge, 0, 'oben 250 px und unten 340 px nur Grund');
    assert.match(await pg.textContent('[data-copy-status]'), /xyntal-story-nicotest\.png/);

    // Fremde Seite: kein Story-Knopf
    state.card = card({ user_id: '99999999-2222-3333-4444-555555555555' });
    await pg.reload();
    await pg.waitForSelector('[data-copy-link]');
    assert.equal(await pg.$('[data-story-share]'), null, 'nur auf der eigenen Seite');
    await ctx.close();
  }

  // ---------- 2. Bilder: GIF und Video → erstes Bild, Fehler → Initiale ----------
  for (const [label, over, expect] of [
    ['gif', { avatarFile: 'avatar.gif' }, { red: true, blue: false }],
    ['video', { avatarFile: 'avatar.webm', bannerFile: 'banner.webm', card: card({ profile: { avatar_path: AV('webm') }, banner_path: BN('webm') }) }, { red: true, blue: false, green: true }],
    ['ohne-bild', { avatarStatus: 403, card: card({ is_premium: false }) }, { red: false, blue: false, green: false }],
  ]) {
    const state = { card: card(), avatarStatus: 200, avatarFile: 'avatar.jpg', bannerFile: 'banner.png', ranges: [], ...over };
    const ctx = await browser.newContext({ acceptDownloads: true });
    await mockSupabase(ctx, state);
    await ctx.addInitScript(session(ME));
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${base}/nicotest`);
    await pg.waitForSelector('[data-story-share]');
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-story-share]')]);
    const buf = fs.readFileSync(await dl.path());
    save(`story-${label}.png`, buf);
    assert.deepEqual(pngSize(buf), [1080, 1920], label);
    const px = await analyse(pg, buf);
    console.log(`  ${label}:`, px);
    assert.equal(px.red > 1500, expect.red, `${label}: Profilbild`);
    assert.equal(px.blue > 200, expect.blue, `${label}: nur das erste Bild`);
    if ('green' in expect) assert.equal(px.green > 5000, expect.green, `${label}: Banner`);
    if (label === 'video') assert.ok(state.ranges.filter((r) => r === 'bytes=0-12582911').length >= 2, 'Video: fürs Story-Bild nur der Anfang der Datei');
    await ctx.close();
  }

  // ---------- 3. Handy: Teilen-Menü mit der Datei, sofort beim Tippen ----------
  {
    const state = { card: card(), avatarStatus: 200, avatarFile: 'avatar.jpg', bannerFile: 'banner.png', ranges: [] };
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    await mockSupabase(ctx, state);
    await ctx.addInitScript(session(ME));
    await ctx.addInitScript(() => {
      window.__shared = []; window.__deny = 0;
      Object.defineProperty(navigator, 'canShare', { value: (d) => !!(d && d.files && d.files.length && d.files.every((f) => f.type === 'image/png')) });
      Object.defineProperty(navigator, 'share', { value: async (d) => {
        window.__shared.push({ at: performance.now(), keys: Object.keys(d), files: d.files.map((f) => [f.name, f.type, f.size]) });
        if (window.__deny > 0) { window.__deny--; throw new DOMException('Kein Tippen', 'NotAllowedError'); }
      } });
      document.addEventListener('click', () => { window.__clickAt = performance.now(); }, true);
    });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.goto(`${base}/nicotest`);
    await pg.waitForSelector('[data-story-share]');
    // Das Bild ist vorbereitet, bevor jemand tippt …
    await pg.waitForTimeout(2500);
    await pg.tap('[data-story-share]');
    await pg.waitForFunction(() => window.__shared.length === 1);
    const shared = await pg.evaluate(() => ({ ...window.__shared[0], delay: window.__shared[0].at - window.__clickAt }));
    assert.deepEqual(shared.keys, ['files'], 'nur die Datei, ohne Text');
    assert.equal(shared.files.length, 1);
    assert.deepEqual(shared.files[0].slice(0, 2), ['xyntal-story-nicotest.png', 'image/png']);
    assert.ok(shared.delay < 100, `Teilen-Menü direkt beim Tippen (${Math.round(shared.delay)} ms)`);
    assert.match(await pg.textContent('[data-copy-status]'), /@xyntal/);
    if (OUT) await pg.screenshot({ path: path.join(OUT, 'profil-handy.png'), fullPage: false });

    // … und wenn das Tippen doch abgelaufen ist: Knopf zeigt „Story-Bild teilen“, das nächste Tippen teilt
    await pg.evaluate(() => { window.__deny = 1; });
    await pg.tap('[data-story-share]');
    await pg.waitForSelector('[data-story-share].is-ready');
    assert.equal((await pg.textContent('[data-story-share]')).trim(), 'Story-Bild teilen');
    await pg.tap('[data-story-share]');
    await pg.waitForFunction(() => window.__shared.length === 3);
    assert.equal(await pg.$('[data-story-share].is-ready'), null);
    assert.equal((await pg.textContent('[data-story-share]')).trim(), 'Für Instagram-Story');
    await ctx.close();
  }

  // ---------- 4. Karten-Editor /meine-karte ----------
  {
    // Ohne Anmeldung: Der Editor läuft trotzdem, meine-karte.js zeigt nur den Login-Hinweis
    const stub = `window.supabase = { createClient: () => ({
      auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
      rpc: async () => ({ data: null, error: null }),
      storage: { from: () => ({}) },
    }) };`;
    const ctx = await browser.newContext({ acceptDownloads: true });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => errors.push(e.message));
    await pg.route('**/vendor/supabase.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: stub }));
    await pg.goto(`${base}/meine-karte`);
    await pg.waitForFunction(() => window.XyntalBuilder && window.XyntalCardDraw && window.XyntalCardStory);
    const red = `data:image/jpeg;base64,${file('avatar.jpg').toString('base64')}`;
    await pg.evaluate((photo) => window.XyntalBuilder.set({
      name: 'Nico Test', city: 'Regensburg', role: 'Entwicklung', skills: ['Qt', 'QML', 'TypeScript'], hours: 12,
      pitch: 'Ich baue eine Plattform, auf der Leute ihr Team finden.', handle: 'nicotest', photo, theme: 'ocean', layout: 'center',
    }), red);
    const grab = async (sel) => {
      const [dl] = await Promise.all([pg.waitForEvent('download'), pg.evaluate((s) => document.querySelector(s).click(), sel)]);
      return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()) };
    };
    const feed = await grab('[data-card-save]');
    assert.equal(feed.name, 'meine-xyntal-karte.png');
    assert.deepEqual(pngSize(feed.buf), [1080, 1350]);

    const story = await grab('[data-story-share]');
    assert.equal(story.name, 'xyntal-story-nicotest.png');
    assert.deepEqual(pngSize(story.buf), [1080, 1920]);
    const px = await analyse(pg, story.buf);
    assert.ok(px.red > 1500, 'Profilbild aus dem Editor');
    assert.equal(px.edge, 0);
    assert.match(await pg.textContent('[data-card-status]'), /xyntal-story-nicotest\.png/);
    assert.match(await pg.textContent('[data-story-hint]'), /Link-Sticker/, 'Hinweis zum Link-Sticker steht beim Knopf');

    // Änderung im Editor → neues Bild (anderer Name in der Datei)
    await pg.evaluate(() => window.XyntalBuilder.set({ handle: 'anderer' }));
    const again = await grab('[data-story-share]');
    assert.equal(again.name, 'xyntal-story-anderer.png');
    save('story-meine-karte.png', story.buf);
    save('feed-meine-karte.png', feed.buf);
    await ctx.close();
  }

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('ok – card-story: Story 1080×1920 (eigene Seite, Handy, Editor), Feed 1080×1350');
})().catch((e) => { console.error(e); process.exit(1); });
