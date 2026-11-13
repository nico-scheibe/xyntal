// Admin-Konsole: exklusive Designs (unlock, lock, unlocks) über Supabase-RPCs (public/pages/admin-platform.js).
// Der Supabase-Client ist gemockt, der App-Server ebenfalls. Läuft ohne Browser: node tests/admin-console-unlock.cjs
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(path.resolve(__dirname, '../public/pages/admin-platform.js'), 'utf8');

// Minimaler DOM: querySelector findet ein Attribut nur, wenn das zuletzt gesetzte HTML es enthält.
function makeEl(name) {
  const listeners = {}, kids = new Map();
  return {
    name, dataset: {}, hidden: false, value: '', scrollTop: 0, scrollHeight: 0, id: '', disabled: false, _html: '', _selected: null,
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatch(type, ev = {}) { for (const fn of listeners[type] || []) fn({ preventDefault() {}, ...ev }); },
    getAttribute(n) { return n === 'aria-selected' ? this._selected : null; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); kids.clear(); },
    get textContent() { return this._html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); },
    set textContent(v) { this._html = String(v); },
    contains() { return false; }, closest() { return null; }, append() {}, prepend() {}, remove() {}, focus() {},
    querySelectorAll() { return []; },
    querySelector(sel) {
      const m = /^\[([\w-]+)\]$/.exec(sel); if (!m) return null;
      if (!new RegExp(`\\s${m[1]}(=|\\s|>)`).test(this._html)) return null;
      if (!kids.has(m[1])) kids.set(m[1], makeEl(m[1]));
      return kids.get(m[1]);
    },
  };
}

const panels = {};
const panel = (key) => (panels[key] ||= makeEl(key));
const consoleTab = Object.assign(makeEl('tab'), { dataset: { tab: 'console', platform: '', perm: 'users.view' } });
consoleTab._selected = 'true';
const document = {
  querySelector: (sel) => { const m = /^\[data-panel="(.+)"\]$/.exec(sel); return m ? panel(m[1]) : null; },
  querySelectorAll: (sel) => (sel === '[data-tab][data-platform]' ? [consoleTab] : []),
  getElementById: () => null, createElement: () => makeEl('x'), body: makeEl('body'), addEventListener() {},
};

// Gemockter App-Server (nur Rechte, Zähler und Kontosuche) und gemockter Supabase-Client
const api = async (method, p) => {
  // Alle Rechte, damit help und Befehle auch die klassischen Befehle (uncredit, alts) zeigen
  if (p === '/admin/rbac') return { role: 'admin', matrix: { admin: ['users.view', 'users.ban', 'users.notes', 'billing.manage', 'content.moderate', 'reports.handle', 'audit.view'] } };
  if (p === '/admin/stats') return { stats: {} };
  if (p.startsWith('/admin/users?')) return { users: [] };
  throw new Error(`unerwarteter App-Server-Aufruf ${method} ${p}`);
};
const X = { esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])), me: async () => ({ id: 'me1', staffRole: 'admin' }), api };
const win = { XyntalApp: X };
let rpcCalls = [], rpcReply = () => ({ data: {}, error: null });
const sb = { rpc: async (fn, args) => { rpcCalls.push({ fn, args }); return rpcReply(fn, args); } };
const unwrap = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
vm.runInContext(src, vm.createContext({ window: win, document, sb, unwrap, URLSearchParams, CSS: { escape: (s) => s } }));

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const cons = () => panel('console');
const logText = () => cons().querySelector('[data-log]').textContent;
const suggestBox = () => cons().querySelector('[data-suggest]');
async function run(line) {
  const input = cons().querySelector('[data-console-input]');
  input.value = line;
  cons().querySelector('[data-console-form]').dispatch('submit');
  await settle();
}
const reply = (data, error = null) => { rpcReply = () => ({ data, error }); };
const fail = (message, code = 'P0001') => { rpcReply = () => ({ data: null, error: { message, code } }); };
const last = () => rpcCalls[rpcCalls.length - 1];

(async () => {
  await settle();
  assert(cons().querySelector('[data-console-form]'), 'Konsole ist geöffnet');
  const T = [];
  const test = async (name, fn) => { await run('clear'); rpcCalls = []; rpcReply = () => ({ data: {}, error: null }); await fn(); T.push(name); };

  await test('help listet unlock, lock, unlocks direkt nach uncredit', async () => {
    await run('help');
    const t = logText();
    for (const s of ['unlock <Konto> <Design> <Grund>', 'lock <Konto> <Design> [Grund]', 'unlocks <Konto>', 'Exklusives Design für ein Konto freischalten (z. B. snow).']) assert(t.includes(s), `help enthält ${s}`);
    assert(t.indexOf('uncredit <') < t.indexOf('unlock <') && t.indexOf('unlocks <') < t.indexOf('alts <'), 'Reihenfolge');
    assert.equal(rpcCalls.length, 0);
  });

  await test('unlock Erfolg ruft admin_design_unlock mit p_on=true und klein geschriebenem Design', async () => {
    reply({ handle: 'tom', name: 'Tom', design: 'snow', changed: true });
    await run('unlock @tom SNOW Winterfest');
    assert.equal(rpcCalls.length, 1);
    assert.equal(last().fn, 'admin_design_unlock');
    assert.deepEqual(last().args, { p_account: '@tom', p_design: 'snow', p_on: true, p_reason: 'Winterfest' });
    assert(logText().includes('Schnee für @tom freigeschaltet.'), logText());
  });

  await test('unlock mit changed=false meldet, dass das Konto Schnee schon hat', async () => {
    reply({ handle: 'tom', name: 'Tom', design: 'snow', changed: false });
    await run('unlock @tom snow Winterfest');
    assert(logText().includes('@tom hat Schnee bereits.'), logText());
  });

  await test('unlock ohne Grund ruft den Server nicht auf', async () => {
    await run('unlock @tom snow');
    assert.equal(rpcCalls.length, 0);
    assert(logText().includes('Bitte einen Grund angeben: unlock <Konto> <Design> <Grund>.'), logText());
  });

  await test('unbekanntes Design wird lokal abgelehnt ohne RPC', async () => {
    await run('unlock @tom frost Grund');
    await run('lock @tom frost');
    await run('unlocks @tom');
    assert.equal(rpcCalls.length, 1, 'nur unlocks ruft den Server');
    assert(logText().includes('Unbekanntes Design. Verfügbar: snow.'), logText());
  });

  await test('lock fragt nach und ruft erst nach "y" mit p_on=false', async () => {
    reply({ handle: 'tom', name: 'Tom', design: 'snow', changed: true });
    await run('lock @tom snow Test');
    assert.equal(rpcCalls.length, 0, 'noch kein RPC vor der Bestätigung');
    assert(logText().includes('Schnee für @tom zurücknehmen — y zum Bestätigen, alles andere bricht ab.'), logText());
    await run('y');
    assert.equal(rpcCalls.length, 1);
    assert.deepEqual(last().args, { p_account: '@tom', p_design: 'snow', p_on: false, p_reason: 'Test' });
    assert(logText().includes('Schnee für @tom zurückgenommen.'), logText());
  });

  await test('lock bricht bei anderer Eingabe ab', async () => {
    await run('lock @tom snow');
    await run('nein');
    assert.equal(rpcCalls.length, 0);
    assert(logText().includes('Abgebrochen.'), logText());
  });

  await test('lock mit changed=false meldet, dass nichts freigeschaltet war', async () => {
    reply({ handle: 'tom', name: 'Tom', design: 'snow', changed: false });
    await run('lock @tom snow');
    await run('y');
    assert(logText().includes('@tom hat Schnee nicht freigeschaltet.'), logText());
  });

  await test('unlocks leer und gefüllt', async () => {
    reply({ handle: 'tom', name: 'Tom', designs: [] });
    await run('unlocks @tom');
    assert(logText().includes('@tom hat keine exklusiven Designs freigeschaltet.'), logText());
    reply({ handle: 'tom', name: 'Tom', designs: ['snow'] });
    await run('unlocks @tom');
    assert(logText().includes('@tom: Schnee'), logText());
    assert.equal(last().fn, 'admin_design_unlocks');
    assert.deepEqual(last().args, { p_account: '@tom' });
  });

  await test('Konto ohne handle zeigt name, sonst den getippten Begriff', async () => {
    reply({ name: 'Lena', designs: ['snow'] });
    await run('unlocks lena@example.invalid');
    assert(logText().includes('Lena: Schnee'), logText());
    reply({ designs: [] });
    await run('unlocks lena@example.invalid');
    assert(logText().includes('lena@example.invalid hat keine exklusiven Designs freigeschaltet.'), logText());
  });

  await test('Fehler: no_account, ambiguous, 42501, reason_required, unknown_design', async () => {
    fail('XYNTAL_UNLOCK:no_account');
    await run('unlock @niemand snow Grund');
    assert(logText().includes('Kein Konto passt dazu.'), logText());
    fail('XYNTAL_UNLOCK:ambiguous');
    await run('unlocks max');
    assert(logText().includes('Mehrere Konten passen – nutze @handle, E-Mail oder ID.'), logText());
    fail('Nur für Admins.', '42501');
    await run('unlock @tom snow Grund');
    assert(logText().includes('Dafür brauchst du Website-Admin-Rechte mit aktiver 2FA.'), logText());
    fail('XYNTAL_UNLOCK:reason_required');
    await run('unlock @tom snow Grund');
    assert(logText().includes('Der Grund braucht 3 bis 200 Zeichen.'), logText());
    fail('XYNTAL_UNLOCK:unknown_design');
    await run('unlocks @tom');
    assert(logText().includes('Unbekanntes Design. Verfügbar: snow.'), logText());
  });

  await test('reason_required: deutscher Text statt Rohcode, Server wird trotzdem gerufen', async () => {
    fail('XYNTAL_UNLOCK:reason_required');
    await run('unlock @tom snow Grund');
    assert.equal(rpcCalls.length, 1, 'der Server prüft den Grund selbst');
    assert(logText().includes('Der Grund braucht 3 bis 200 Zeichen.'), logText());
    assert(!logText().includes('XYNTAL_UNLOCK'), 'kein Rohcode im Log');
  });

  await test('unbekannter XYNTAL_UNLOCK-Code: "Das hat nicht geklappt (<Code>)."', async () => {
    fail('XYNTAL_UNLOCK:something_new');
    await run('unlock @tom snow Grund');
    assert(logText().includes('Das hat nicht geklappt (something_new).'), logText());
  });

  await test('fehlende Funktion in der Datenbank', async () => {
    fail('Could not find the function public.admin_design_unlocks(p_account) in the schema cache', 'PGRST202');
    await run('unlocks @tom');
    assert(logText().includes('Die Freischaltungen sind in der Datenbank noch nicht eingerichtet (Migration design_unlocks fehlt).'), logText());
    fail('Could not find the function public.admin_design_unlock', 'PGRST202');
    await run('unlock @tom snow Grund');
    assert(logText().includes('Migration design_unlocks fehlt'), logText());
  });

  await test('Autovervollständigung: Design-Vorschlag an Position 1 von unlock und lock', async () => {
    const input = cons().querySelector('[data-console-input]');
    for (const line of ['unlock @tom sn', 'lock @tom sn']) {
      input.value = line; input.dispatch('input');
      assert(suggestBox()._html.includes('snow') && suggestBox()._html.includes('Schnee – Winter-Design'), line);
    }
    input.value = 'unlocks @tom sn'; input.dispatch('input');
    assert(!suggestBox()._html.includes('Schnee – Winter-Design'), 'unlocks hat kein Design-Argument');
    input.value = ''; input.dispatch('input');
  });

  // Bestehende Befehle unverändert: uncredit läuft weiter über den App-Server
  await test('bestehender Befehl uncredit läuft unverändert über den App-Server', async () => {
    const calls = [];
    const old = X.api;
    X.api = async (m, p, b) => { if (p.startsWith('/admin/users/resolve')) return { user: { id: 'u1', displayName: 'Tom' } }; if (p.endsWith('/ai-credit/remove')) { calls.push(b); return { removedCents: 500, creditCents: 0 }; } return old(m, p, b); };
    await run('uncredit @tom 5 Kulanz');
    X.api = old;
    assert.equal(rpcCalls.length, 0, 'kein Supabase-RPC');
    assert.deepEqual(calls, [{ cents: 500, reason: 'Kulanz' }]);
    assert(/5,00\s€ entfernt/.test(logText()), logText());
  });

  // plan für ein Konto, das es nur auf der Website gibt: der App-Server findet die E-Mail nicht,
  // sucht sie unter den Website-Konten und legt das App-Konto an; danach werden die Tage gutgeschrieben.
  await test('plan findet ein reines Website-Konto über die E-Mail', async () => {
    const calls = [];
    const old = X.api;
    const notFound = () => Object.assign(new Error('No account matches that.'), { status: 404 });
    X.api = async (m, p, b) => {
      if (p.startsWith('/admin/users/resolve')) throw notFound();
      if (p === '/admin/users/website-account') { calls.push(['website', b]); return { user: { id: 'u9', displayName: 'Paul Seegert', email: 'paul@example.com' }, source: 'created' }; }
      if (p.endsWith('/plan/extend')) { calls.push(['plan', p, b]); return { plan: 'Ultra', renewsAt: '2027-02-11T12:00:00.000Z', days: 90 }; }
      return old(m, p, b);
    };
    await run('plan paul@example.com 90 Ultra Legende');
    assert.deepEqual(calls[0], ['website', { email: 'paul@example.com', reason: 'Legende' }]);
    assert.deepEqual(calls[1], ['plan', '/admin/users/u9/plan/extend', { days: 90, plan: 'Ultra', reason: 'Legende' }]);
    assert(logText().includes('App-Konto für Paul Seegert angelegt'), logText());
    assert(logText().includes('90 Tage gutgeschrieben'), logText());

    calls.length = 0;
    X.api = async (m, p, b) => {
      if (p.startsWith('/admin/users/resolve') || p === '/admin/users/website-account') { calls.push(p); throw notFound(); }
      return old(m, p, b);
    };
    await run('plan niemand@example.com 30 Plus Test');
    assert(logText().includes('Kein Konto passt dazu – weder in der App noch auf der Website.'), logText());
    // Ein @handle sucht nicht auf der Website, andere Befehle auch nicht
    calls.length = 0;
    await run('plan @niemand 30 Plus Test');
    await run('credit niemand@example.com 5 Test');
    X.api = old;
    assert(!calls.includes('/admin/users/website-account'), calls.join(', '));
  });

  console.log(`PASS: ${T.length} Fälle für unlock, lock, unlocks (${T.join(' · ')})`);
})().catch((err) => { console.error('FAIL:', err.message); process.exitCode = 1; });
