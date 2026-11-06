// Community-Seite, Bereich „Aus der App“ (public/pages/community-live.js): rendert die
// Antwort von GET /public/community sicher (alles escaped, nur data:-Logos, keine
// javascript:-Links), zeigt Leer- und Fehlerzustand. Aufruf: node tests/community-live.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const src = fs.readFileSync('public/pages/community-live.js', 'utf8');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function run(response, lang = 'de') {
  const nodes = new Map();
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, { id, innerHTML: '', textContent: '', hidden: false, dataset: {}, title: '', addEventListener() {}, removeAttribute() {} }); return nodes.get(id); };
  const calls = [];
  const listeners = {};
  const document = { getElementById: node, visibilityState: 'visible', documentElement: { lang }, addEventListener(type, fn) { listeners[type] = fn; } };
  const ctx = vm.createContext({
    document,
    window: {}, esc, timeAgo: () => 'gerade eben', setTimeout: () => 0, clearTimeout() {}, setInterval() {},
    fetch: async (url, opts) => { calls.push({ url, opts }); return response; },
    JSON, Date, Math, Set, String, Number, Error,
  });
  vm.runInContext(src, ctx);
  await new Promise((r) => setImmediate(r));
  return { node, calls, document, listeners };
}
const okResponse = (data) => ({ ok: true, status: 200, json: async () => ({ data, error: null }) });

(async () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { node, calls } = await run(okResponse({
    community: { name: 'Xyntal', description: '', avatar: 'javascript:alert(1)' },
    channels: ['updates', 'polls'],
    posts: [
      { id: 'a', channel: 'updates', author: evil, body: `🚀 Xyntal 9.9.9 is here\n\nSummary ${evil}\n\n✨ New\n• One\n• javascript:alert(1)\n\nhttps://xyntal.de/x`, createdAt: '2026-11-05T10:00:00Z', poll: null, reactions: [{ emoji: '🔥', count: 2 }], attachmentCount: 2 },
      { id: 'b', channel: 'polls', author: 'Nico', body: 'Frage', createdAt: '2026-11-05T09:00:00Z', poll: { question: evil, options: [{ label: evil, votes: 3 }, { label: 'B', votes: 1 }], totalVotes: 4, closed: true }, reactions: [], attachmentCount: 0 },
    ],
  }));
  assert.match(calls[0].url, /^https:\/\/api\.xyntal\.de\/public\/community\?limit=30&lang=de$/);
  assert.equal(calls[0].opts.cache, 'no-cache');
  const html = node('live-feed').innerHTML;
  assert(!html.includes('<img src=x'), 'author, body and poll are escaped');
  assert(html.includes('&lt;img src=x'));
  assert(!html.includes('href="javascript:'), 'only http(s) links');
  assert(!html.includes('src="javascript:'), 'logo must be a data: image');
  assert(html.includes('<p class="live-lead">🚀 Xyntal 9.9.9 is here</p>'), 'headline');
  assert(html.includes('<p class="live-sub">✨ New</p><ul><li>One</li>'), 'bullet section');
  assert(html.includes('href="https://xyntal.de/x"'));
  assert(html.includes('75 %') && html.includes('4 Stimmen') && html.includes('Abstimmung beendet'));
  assert(html.includes('2 Anhänge in der App') && html.includes('🔥 2'));
  assert(node('live-filter').innerHTML.includes('#updates') && node('live-filter').hidden === false);
  assert.equal(node('live-state').dataset.state, 'live');

  // Update-Übersichten in der Sprache der Seite: ?lang=en auf Englisch, und ein
  // Sprachwechsel lädt sofort in der neuen Sprache nach.
  const english = await run(okResponse({ community: null, channels: [], posts: [] }), 'en');
  assert.match(english.calls[0].url, /\?limit=30&lang=en$/);
  english.document.documentElement.lang = 'de';
  english.listeners['xyntal:lang']();
  await new Promise((r) => setImmediate(r));
  assert.match(english.calls[1].url, /\?limit=30&lang=de$/, 'language switch reloads in German');

  const empty = await run(okResponse({ community: null, channels: [], posts: [] }));
  assert(empty.node('live-feed').innerHTML.includes('Noch keine Neuigkeiten aus der App.'));
  assert.equal(empty.node('live-filter').hidden, true);

  const failed = await run({ ok: false, status: 503, json: async () => ({ data: null }) });
  assert(failed.node('live-feed').innerHTML.includes('lassen sich gerade nicht laden') && failed.node('live-feed').innerHTML.includes('Erneut versuchen'));
  assert.equal(failed.node('live-state').dataset.state, 'error');
  console.log('PASS: escaping, safe links and logo, update-overview layout, page language, polls, empty and error states');
})().catch((e) => { console.error(e); process.exit(1); });
