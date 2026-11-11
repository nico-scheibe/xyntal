// Ticket-Warteschlange im Admin (public/pages/admin-support.js): Status aus Zuweisung,
// Ansichten, Suche, Reihenfolge, Zahlen. Läuft ohne Browser: node tests/admin-support.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('public/pages/admin-support.js', 'utf8');
const win = {};
vm.runInContext(src, vm.createContext({ window: win }));
const { stateOf, inView, matches, visible, countsOf, signature, VIEWS } = win.XyntalAdminSupport;

const T = (id, o = {}) => ({ id, subject: `Ticket ${id}`, requester: 'Maxim', requesterEmail: 'maxim@example.invalid', category: 'Bug', priority: 'Normal', status: 'Open', assigneeId: null, updatedAt: '2026-11-10T10:00:00Z', ...o });
const tickets = [
  T('a', { needsReply: true }),
  T('b', { status: 'In Progress', assigneeId: 'me', assignee: 'Nico', priority: 'High', updatedAt: '2026-11-11T09:00:00Z' }),
  T('c', { status: 'In Progress', assigneeId: 'u2', assignee: 'Lena', needsReply: true, priority: 'Urgent' }),
  T('d', { status: 'Closed', assigneeId: 'me' }),
  T('e', { status: 'Waiting', assigneeId: null, subject: 'Rechnung fehlt', updatedAt: '2026-11-11T12:00:00Z' }),
  T('f', { status: 'Resolved', assigneeId: 'u2' }),
];

// Geschlossen = geschlossen, zugewiesen = in Arbeit, sonst offen – auch bei alten Statuswerten
assert.deepEqual(tickets.map(stateOf), ['open', 'work', 'work', 'closed', 'open', 'work']);
const ids = (view, q = '') => visible(tickets, view, q, 'me').map((t) => t.id).join('');
assert.equal(ids('closed'), 'd');
assert.equal(ids('mine'), 'b', 'ein geschlossenes Ticket zählt nicht mehr zu „Meine“');
assert.equal(ids('open'), 'ae', 'Antwort nötig steht oben');
assert.equal(ids('work'), 'cbf', 'Antwort nötig, dann Priorität');
assert.equal(ids('active'), 'cabef', 'Antwort nötig (dringend zuerst), dann Priorität, dann das Neueste');
assert(!inView(tickets[3], 'active', 'me'));
assert.equal(ids('active', 'rechnung'), 'e'); assert.equal(ids('active', 'LENA'), 'c'); assert.equal(ids('active', 'hoch'), 'b');
assert(matches(tickets[0], '  ') && !matches(tickets[0], 'zzz'));
assert.deepEqual({ ...countsOf(tickets, 'me', { closed: 7 }) }, { active: 5, open: 2, work: 3, mine: 1, closed: 7 });
assert.equal(countsOf(tickets, 'me', null).closed, null, 'ohne Serverzahl keine geratene Zahl');
assert.deepEqual(VIEWS.map((v) => v[0]), ['active', 'open', 'work', 'mine', 'closed']);
const d = { ticket: { status: 'Open', assigneeId: null, priority: 'Normal' }, messages: [{ id: 'm1' }] };
assert.notEqual(signature(d), signature({ ...d, messages: [...d.messages, { id: 'm2' }] }));
assert.notEqual(signature(d), signature({ ...d, ticket: { ...d.ticket, assigneeId: 'me' } }));
assert.equal(signature(null), '');
console.log('PASS: Status aus Zuweisung, Ansichten, Suche, Reihenfolge, Zahlen, Änderungserkennung');
