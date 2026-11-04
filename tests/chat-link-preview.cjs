// Link-Vorschauen im Website-Chat (public/pages/nachrichten.js): welcher Link eine
// Karte bekommt, dass ein Player erst nach dem Klick als iframe erscheint, nur von
// den Herkünften der Anbieter (passend zu frame-src in hosting/daki/server.cjs) und
// dass Titel/Beschreibungen nie als HTML landen.
// Start: node tests/chat-link-preview.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/pages/nachrichten.js'), 'utf8');
const part = source.slice(source.indexOf('  // ---------- Link-Vorschauen'), source.indexOf('  // ---------- Gesprächsliste ----------'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const context = { window: {}, esc, t: (s) => s, X: {}, threadEl: {}, CSS: { escape: (s) => s }, URL };
vm.runInNewContext(part + `
globalThis.api = { firstLink, embedOf, linkCardHtml, previews, setPlaying: (v) => { playing = v; } };`, context);
const { firstLink, embedOf, linkCardHtml, previews, setPlaying } = context.api;

// Welcher Link: der erste http(s)-Link, ohne Satzzeichen am Ende; nicht in Code, GIFs, Sprachnachrichten
assert.equal(firstLink({ kind: 'text', body: 'Schau mal: https://youtu.be/dQw4w9WgXcQ.' }), 'https://youtu.be/dQw4w9WgXcQ');
assert.equal(firstLink({ kind: 'text', body: 'erst https://a.example/x dann https://b.example/y' }), 'https://a.example/x');
assert.equal(firstLink({ kind: 'text', body: '(https://vimeo.com/76979871)' }), 'https://vimeo.com/76979871');
assert.equal(firstLink({ kind: 'text', body: 'ohne Link' }), '');
assert.equal(firstLink({ kind: 'text', body: 'https://x.example', isCode: true }), '');
assert.equal(firstLink({ kind: 'gif', body: 'https://media2.giphy.com/a.gif' }), '');
assert.equal(firstLink({ kind: 'text', body: 'javascript:alert(1)' }), '');

// Player nur von genau den Herkünften der Anbieter
const yt = { kind: 'video', provider: 'youtube', ok: true, title: 'Video <b>x</b>', siteName: 'YouTube', author: 'Rick', thumbnail: null,
  embed: { url: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0', aspect: '16:9', player: '/links/player/' + 'a'.repeat(32) } };
assert.ok(embedOf(yt));
assert.equal(embedOf({ ...yt, embed: { ...yt.embed, url: 'https://evil.example/embed/x' } }), null);
assert.equal(embedOf({ ...yt, embed: { ...yt.embed, url: 'https://www.youtube.com/embed/x' } }), null, 'nur der No-Cookie-Player');
assert.equal(embedOf({ ...yt, provider: 'dailymotion' }), null);
assert.equal(embedOf({ ...yt, kind: 'page' }), null);
assert.ok(embedOf({ kind: 'video', provider: 'tiktok', embed: { url: 'https://www.tiktok.com/player/v1/7437212060133428535?autoplay=1', aspect: '9:16' } }));
assert.ok(embedOf({ kind: 'video', provider: 'instagram', embed: { url: 'https://www.instagram.com/reel/C5bWm2NtYkL/embed', aspect: '9:16' } }));
assert.ok(embedOf({ kind: 'video', provider: 'vimeo', embed: { url: 'https://player.vimeo.com/video/76979871?autoplay=1', aspect: '16:9' } }));
// Dieselben Herkünfte erlaubt die CSP der Website als frame-src
const csp = fs.readFileSync(path.resolve(__dirname, '../hosting/daki/server.cjs'), 'utf8');
for (const origin of ['https://www.youtube-nocookie.com', 'https://www.tiktok.com', 'https://www.instagram.com', 'https://player.vimeo.com']) {
  assert.match(csp, new RegExp(`frame-src[^;]*${origin.replace(/[.]/g, '\\.')}`), origin);
}

// Unbekannt: ein leerer Platzhalter, der beim Sichtbarwerden fragt
const url = 'https://youtu.be/dQw4w9WgXcQ';
assert.match(linkCardHtml(url, 'm1'), /data-link-preview="https:\/\/youtu\.be\/dQw4w9WgXcQ"/);
assert.equal(linkCardHtml('', 'm1'), '');
previews.set('https://nothing.example/', null);
assert.equal(linkCardHtml('https://nothing.example/', 'm1'), '', 'nichts zu zeigen: keine Karte');

// Video: Karte mit Abspiel-Taste, aber noch KEIN iframe (der Anbieter erfährt nichts vor dem Klick)
previews.set(url, yt);
const card = linkCardHtml(url, 'm1');
assert.match(card, /data-link-play/);
assert.doesNotMatch(card, /<iframe/);
assert.doesNotMatch(card, /<b>x<\/b>/, 'der Titel ist Text, kein HTML');
assert.match(card, /Video &lt;b&gt;x&lt;\/b&gt;/);
assert.match(card, /YouTube · Rick/);

// Nach dem Klick: der Player an Ort und Stelle, abgeschottet
setPlaying({ msg: 'm1', url });
const player = linkCardHtml(url, 'm1');
assert.match(player, /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1&amp;rel=0"/);
assert.match(player, /sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"/);
assert.match(player, /referrerpolicy="strict-origin-when-cross-origin"/);
assert.match(player, /data-link-close/);
assert.doesNotMatch(linkCardHtml(url, 'm2'), /<iframe/, 'nur die angeklickte Nachricht spielt');
setPlaying(null);

// Hochkant (TikTok, Reels, Shorts)
previews.set('https://vm.tiktok.com/x/', { kind: 'video', provider: 'tiktok', ok: true, title: 't', siteName: 'TikTok', author: '', thumbnail: null,
  embed: { url: 'https://www.tiktok.com/player/v1/7437212060133428535?autoplay=1&rel=0', aspect: '9:16' } });
assert.match(linkCardHtml('https://vm.tiktok.com/x/', 'm3'), /xc-lp-video is-tall/);

// Seite: Link in neuem Tab, ohne Opener; Bild nur über den eigenen Server-Pfad
previews.set('https://news.example/a', { kind: 'page', provider: null, ok: true, title: 'A "story"', siteName: 'News', author: '', description: '<img src=x onerror=alert(1)>', thumbnail: '/links/thumb/' + 'b'.repeat(32), embed: null });
const page = linkCardHtml('https://news.example/a', 'm4');
assert.match(page, /<a class="xc-lp xc-lp-page" href="https:\/\/news\.example\/a" target="_blank" rel="noopener noreferrer nofollow">/);
assert.doesNotMatch(page, /<img src=x/);
assert.match(page, /data-link-thumb="\/links\/thumb\/b{32}"/);
previews.set('https://news.example/b', { kind: 'page', ok: true, title: 'B', siteName: 'News', thumbnail: '/../../etc/passwd', embed: null });
assert.doesNotMatch(linkCardHtml('https://news.example/b', 'm5'), /data-link-thumb/, 'fremde Bildpfade werden nicht geladen');

console.log('chat link previews ok');
