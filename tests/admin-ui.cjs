// Nutzerliste im Admin (public/pages/admin-people.js): Zusammenführen per E-Mail, Filter, Suche.
// Läuft ohne Browser: node tests/admin-ui.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('public/pages/admin-people.js', 'utf8');
const el = () => { const e = { innerHTML: '', textContent: '', hidden: false, dataset: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, append() {}, querySelector: () => el(), querySelectorAll: () => [] }; return e; };
const win = { XyntalAdminSite: { ready: new Promise(() => {}), reload() {} } };
const ctx = vm.createContext({ window: win, matchMedia: () => ({ matches: false }), MutationObserver: class { observe() {} }, document: { querySelector: () => el(), createElement: el, body: el(), addEventListener() {} }, esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) });
vm.runInContext(src, ctx);
const { buildRows, matches, FILTERS } = win.XyntalAdminPeople;

const members = [
  { id: 'p1', email: 'Lena@Example.invalid', name: 'Lena', status: 'pending', created_at: '2026-11-01' },
  { id: 'p2', email: 'tom@example.invalid', name: 'Tom', status: 'approved', is_beta_tester: true, banned: true, created_at: '2026-10-01' },
];
const app = [
  { id: 'u2', email: 'TOM@example.invalid', displayName: 'Tom App', handle: 'tom', verified: true, createdAt: '2026-09-01', mutedUntil: null },
  { id: 'u9', email: 'nur-app@example.invalid', displayName: 'Ali', staffRole: 'moderator', createdAt: '2026-10-05', mutedUntil: null },
];
const beta = [
  { id: 11, user_id: 'p1', email: 'lena@example.invalid', name: 'Lena', status: 'neu', project: 'Nachbarschafts-App', created_at: '2026-11-02' },
  { id: 12, user_id: null, email: 'max@example.invalid', name: 'Max', status: 'in_pruefung', created_at: '2026-11-03' },
  { id: 10, user_id: 'p1', email: 'lena@example.invalid', name: 'Lena', status: 'abgelehnt', created_at: '2026-10-02' },
];
const rows = buildRows(members, app, beta);
assert.equal(rows.length, 4, 'Lena, Tom, Ali, Max – je eine Zeile');
const by = (k) => rows.find((r) => r.key === k);
const tom = by('e:tom@example.invalid');
assert(tom.app && tom.site, 'Tom: App- und Website-Konto über die E-Mail (Groß-/Kleinschreibung egal) zusammengeführt');
assert.equal(tom.v.name, 'Tom App'); assert(tom.v.banned && tom.v.verified && tom.v.betaOn);
assert.equal(tom.v.created, '2026-09-01', 'Dabei seit = ältestes Konto');
const lena = by('e:lena@example.invalid');
assert.equal(lena.beta.id, 11, 'pro Person zählt die neueste Bewerbung');
assert(lena.v.pending && lena.v.betaWaiting);
assert(by('e:max@example.invalid').beta && !by('e:max@example.invalid').site, 'Bewerbung ohne Konto bekommt eigene Zeile');
assert.equal(by('e:nur-app@example.invalid').v.team, 'Moderator');
const count = (key) => rows.filter(FILTERS.find((f) => f[0] === key)[2]).length;
assert.deepEqual({ todo: count('todo'), beta: count('beta'), applied: count('applied'), banned: count('banned'), team: count('team') }, { todo: 2, beta: 1, applied: 2, banned: 1, team: 1 });
assert(matches(lena, 'nachbarschaft'), 'Suche findet das Projekt aus der Bewerbung');
assert(matches(tom, '@tom') && !matches(tom, 'zzz'));
console.log('PASS: Zusammenführen per E-Mail, neueste Bewerbung, Zeilen ohne Konto, Filterzahlen, Suche');
