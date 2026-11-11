// Gutscheine im Admin (public/pages/admin-vouchers.js): Beträge, Grenzen, Formular → Anfrage,
// Beschriftungen, Suche. Läuft ohne Browser: node tests/admin-vouchers.cjs
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync('public/pages/admin-vouchers.js', 'utf8');
const win = {};
vm.runInContext(src, vm.createContext({ window: win }));
const { parseEuro, parseCount, gives, uses, validity, toIso, toLocal, limits, payload, matches, STATUS } = win.XyntalAdminVouchers;
const plain = (o) => JSON.parse(JSON.stringify(o));

// Beträge: Komma oder Punkt, höchstens zwei Nachkommastellen
assert.equal(parseEuro('5'), 500); assert.equal(parseEuro('5,5'), 550); assert.equal(parseEuro(' 12.34 € '), 1234);
assert.equal(parseEuro('0,29'), 29, 'kein Rundungsfehler bei 0,29');
for (const bad of ['', 'abc', '5,555', '-5', '1e3', '5,']) assert.equal(parseEuro(bad), null, bad);

// Anzahl: leer = keine Grenze, sonst ganze Zahl ab 1
assert.equal(parseCount(''), ''); assert.equal(parseCount(' 50 '), 50);
for (const bad of ['0', '-1', '2,5', 'x']) assert.equal(parseCount(bad), null, bad);

// Beschriftungen
const plan = { kind: 'plan', plan: 'Pro', days: 30, redeemed: 3, maxRedemptions: 50, validFrom: null, validUntil: null, code: 'LAUNCH', note: 'Messe', status: 'active' };
const credit = { kind: 'credit', creditCents: 500, redeemed: 0, maxRedemptions: null, code: 'XYN-AAAA', note: '', status: 'paused' };
assert.equal(gives(plan), 'Pro · 30 Tage'); assert.equal(gives({ ...plan, days: 1 }), 'Pro · 1 Tag');
assert.match(gives(credit), /^5,00\s€ KI-Guthaben$/);
assert.equal(uses(plan), '3 / 50'); assert.equal(uses(credit), '0 / ∞');
assert.equal(validity(plan), 'unbegrenzt');
assert.match(validity({ validFrom: '2026-12-01T09:00:00Z', validUntil: null }), /^ab /);
assert.match(validity({ validFrom: null, validUntil: '2026-12-24T09:00:00Z' }), /^bis /);
assert.match(validity({ validFrom: '2026-12-01T09:00:00Z', validUntil: '2026-12-24T09:00:00Z' }), / – /);
assert.deepEqual(Object.keys(STATUS).sort(), ['active', 'expired', 'paused', 'scheduled', 'used_up']);

// Datum: Ortszeit des Eingabefelds ↔ ISO, hin und zurück
assert.equal(toIso(''), null); assert.equal(toIso('quatsch'), null);
assert.equal(toLocal(null), ''); assert.equal(toLocal(toIso('2026-12-24T18:30')), '2026-12-24T18:30');

// Grenzen
assert.deepEqual(plain(limits({ maxRedemptions: '', validFrom: '', validUntil: '', note: ' x ' })), { maxRedemptions: null, validFrom: null, validUntil: null, note: 'x' });
assert.equal(limits({ maxRedemptions: '50' }).maxRedemptions, 50);
assert(limits({ maxRedemptions: '0' }).error);
assert(limits({ maxRedemptions: '', validFrom: '2026-12-24T10:00', validUntil: '2026-12-24T09:00' }).error, 'Ende vor Anfang');

// Formular → Anfrage
let p = payload({ kind: 'plan', plan: 'Pro', days: '30', code: ' launch ', maxRedemptions: '50', validFrom: '', validUntil: '2026-12-24T18:30', note: 'Messe' });
assert.deepEqual(plain(p.body), { kind: 'plan', plan: 'Pro', days: 30, maxRedemptions: 50, validFrom: null, validUntil: toIso('2026-12-24T18:30'), note: 'Messe', code: 'launch' });
p = payload({ kind: 'credit', amount: '5,00', plan: 'Pro', days: '30', code: '', maxRedemptions: '' });
assert.deepEqual(plain(p.body), { kind: 'credit', creditCents: 500, maxRedemptions: null, validFrom: null, validUntil: null, note: '' }, 'Guthaben schickt weder Tarif noch Tage noch einen leeren Code');
assert(payload({ kind: 'plan', plan: 'Pro', days: '0' }).error); assert(payload({ kind: 'plan', plan: 'Pro', days: '3651' }).error);
assert(payload({ kind: 'plan', plan: '', days: '30' }).error);
assert(payload({ kind: 'credit', amount: '0' }).error); assert(payload({ kind: 'credit', amount: '500,01' }).error);
assert(payload({ kind: 'credit', amount: '500' }).body);
assert(payload({ kind: 'plan', plan: 'Pro', days: '30', maxRedemptions: 'viele' }).error);

// Suche über Code, Notiz, Inhalt und Status
assert(matches(plan, '')); assert(matches(plan, 'launch')); assert(matches(plan, 'MESSE')); assert(matches(plan, 'pro ·')); assert(matches(plan, 'aktiv'));
assert(matches(credit, 'pausiert')); assert(matches(credit, 'guthaben')); assert(!matches(credit, 'launch'));

console.log('admin-vouchers ok');
