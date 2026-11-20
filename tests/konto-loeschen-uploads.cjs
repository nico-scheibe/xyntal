// Kontolöschung räumt ALLE Uploads weg (public/avatars.js, deleteMemberUploads).
// Läuft ohne Browser: node tests/konto-loeschen-uploads.cjs
//
// WAS HIER ZUGESAGT WIRD (Gegenproben in Klammern):
//   a) Alle vier Supabase-Eimer werden geleert, nicht nur avatars und banners. Gelistet wird je Eimer im
//      Ordner des Kontos, entfernt wird mit dem Kontoordner im Pfad.
//   b) Selbstlöschung nimmt das eigene Server-Lager über die EIGENEN Routen (ein Pfadteil).
//   c) Admin-Löschung nimmt es über die ADMIN-Routen (zwei Pfadteile) — dort entsteht der Protokolleintrag.
//   d) Scheitert ein Eimer (keine bestätigte Löschung trotz gelisteter Datei — der Fall der Sperre), wirft es
//      und das Konto bleibt bestehen (Gegenprobe: mit normaler Antwort läuft derselbe Fall durch).
//   e) REIHENFOLGE, die wichtigste Zusage: Erst wird das Lager nur GELESEN, dann kommen page-media und
//      project-images, erst zuletzt avatars und banners. Scheitert etwas, ist nichts zerstört. Ein
//      gesperrtes Mitglied verliert also NICHT erst sein Profilbild (Befund der Sicherheitsprüfung).
//   f) Eine abgeschnittene Admin-Liste wird erneut gelesen, bis sie leer ist.
//   g) Ein fehlender Protokolleintrag hält das Löschen NICHT auf, wird gezählt und gemeldet.
//   h) Jeder Fehlerstatus des Lagers wirft — auch 503 und 404. Beide heißen "nicht prüfbar", nicht "leer".
//   i) 429 wird abgewartet und wiederholt, statt die Löschung mitten im Lauf abzubrechen.
//   j) Im Admin-Weg wird JEDE im Supabase-Lager entfernte Seitenbild-Datei protokolliert, project-images nicht.
//   k) Einem Mitglied werden keine Eimernamen und keine Statuscodes gezeigt; dem Admin schon.
//   l) Quelltextzusagen: beide Aufrufer löschen die Dateien VOR dem Konto, der alte unvollständige Name ist
//      weg, und die Dialogtexte nennen Seitenbilder und Projektbilder (deutsch und englisch).
const fs = require('fs'), vm = require('vm'), assert = require('assert');

const KONTO = '11111111-1111-1111-1111-111111111111';
const D1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png';
const D2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png';
const D3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc.png';

// Lädt avatars.js in eine Attrappe. eimer: {name: [Dateinamen]} — remove nimmt dort wirklich weg, sonst liefe
// die Schleife in deleteMemberFiles endlos. lager: Dateinamen im eigenen Server-Lager.
function lade({ eimer = {}, lager = [], leeresRemove = null, lagerStatus = 200, loeschStatus = 200,
                ohneProtokoll = [], haeppchen = 0, rpcFehler = [], bremse = 0, luegendesRemove = false, zaehUnloeschbar = [], lagerRumpf, ohneListe = false } = {}) {
  const stand = JSON.parse(JSON.stringify(eimer));
  let imLager = lager.slice();
  let bremsen = bremse;
  const aufrufe = { list: [], remove: [], fetch: [], rpc: [], warten: [] };
  const sb = {
    auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: { access_token: 'token' } } }) },
    rpc: async (name, args) => {
      aufrufe.rpc.push({ name, args });
      return rpcFehler.includes(args && args.p_file) ? { error: { message: 'nope' } } : { error: null };
    },
    storage: {
      from: (bucket) => ({
        list: async (ordner, opts) => {
          aufrufe.list.push({ bucket, ordner, opts });
          return { data: (stand[bucket] || []).map((name) => ({ id: 'x', name })), error: null };
        },
        remove: async (pfade) => {
          aufrufe.remove.push({ bucket, pfade });
          if (leeresRemove === bucket || leeresRemove === true) return { data: [], error: null };
          // meldet Erfolg, nimmt aber nichts weg — der Fall, für den die Rundenbegrenzung da ist
          if (luegendesRemove) return { data: pfade.map((pfad) => ({ name: pfad })), error: null };
          // zaehUnloeschbar: diese Dateien bleiben liegen, remove() meldet sie NICHT zurück — genau so
          // antwortet Supabase, wenn die Löschregel ein einzelnes Objekt nicht deckt.
          const namen = pfade.map((pfad) => pfad.split('/').pop()).filter((name) => !zaehUnloeschbar.includes(name));
          stand[bucket] = (stand[bucket] || []).filter((name) => !namen.includes(name));
          // Antwort mit VOLLEM Pfad, wie Supabase sie liefert
          return { data: namen.map((name) => ({ name: `${KONTO}/${name}` })), error: null };
        },
        createSignedUrl: async () => ({ data: null, error: null }),
        download: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
  };
  const fertig = (status, body, kopf = {}) => ({
    ok: status >= 200 && status < 300, status,
    headers: { get: (name) => kopf[String(name).toLowerCase()] ?? null },
    json: async () => body,
  });
  const fetchAttrappe = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    aufrufe.fetch.push({ url, method });
    if (bremsen > 0) { bremsen--; return fertig(429, {}, { 'retry-after': '1' }); }
    if (method === 'DELETE') {
      if (loeschStatus !== 200) return fertig(loeschStatus, {});
      const name = decodeURIComponent(url.split('/').pop());
      imLager = imLager.filter((vorhanden) => vorhanden !== name);
      return fertig(200, { ok: true, logged: !ohneProtokoll.includes(name), log_id: 7 });
    }
    if (lagerStatus !== 200) {
      // Rumpf wie der echte Dienst: 403 heißt auf dem eigenen Weg "account banned", 503 "not configured".
      const standard = lagerStatus === 403 ? 'account banned' : lagerStatus === 503 ? 'not configured' : undefined;
      return fertig(lagerStatus, { error: lagerRumpf !== undefined ? lagerRumpf : standard });
    }
    if (ohneListe) return fertig(200, { nichts: true }); // 200, aber keine Dateiliste
    const zeigen = haeppchen > 0 ? imLager.slice(0, haeppchen) : imLager;
    return fertig(200, { files: zeigen.map((name) => ({ name, size: 1 })), truncated: haeppchen > 0 && imLager.length > haeppchen });
  };
  const ctx = vm.createContext({
    sb, fetch: fetchAttrappe, console: { error() {}, log() {}, warn() {} },
    setTimeout: (fn, ms) => { aufrufe.warten.push(ms); return fn(); },
    unwrap: ({ data, error }) => { if (error) throw error; return data; },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} disconnect() {} },
    document: { body: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {},
      createElement: () => ({ setAttribute() {}, removeAttribute() {} }) },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  });
  vm.runInContext(fs.readFileSync('public/avatars.js', 'utf8'), ctx);
  return { ctx, aufrufe, stand, lagerStand: () => imLager };
}

async function wirft(versprechen, pruefung, name) {
  try { await versprechen; } catch (err) { return pruefung(err); }
  throw new Error(`${name} FEHLGESCHLAGEN: es hätte werfen müssen, lief aber durch`);
}

(async () => {
  // ---------- a) alle vier Eimer + b) eigene Routen + e) Reihenfolge ----------
  {
    const t = lade({ eimer: { avatars: ['a.jpg'], banners: ['b.jpg'], 'page-media': [D1], 'project-images': ['p.jpg'] } });
    const r = await t.ctx.deleteMemberUploads(KONTO);
    const eimer = [...new Set(t.aufrufe.list.map((a) => a.bucket))];
    assert.deepEqual(eimer, ['page-media', 'project-images', 'avatars', 'banners'],
      'a1/e1 alle vier Eimer, und die gesperrten zuerst');
    assert.ok(t.aufrufe.list.every((a) => a.ordner === KONTO), 'a2 gelistet wird im Ordner des Kontos');
    assert.deepEqual(t.aufrufe.remove.map((a) => a.pfade), [[`${KONTO}/${D1}`], [`${KONTO}/p.jpg`], [`${KONTO}/a.jpg`], [`${KONTO}/b.jpg`]],
      'a3 entfernt wird mit dem Kontoordner im Pfad, in derselben Reihenfolge');
    for (const [name, rest] of Object.entries(t.stand)) assert.deepEqual(rest, [], `a4 ${name} ist leer`);
    assert.equal(t.aufrufe.fetch[0].url, '/api/page-media', 'b1 Selbstlöschung liest die EIGENE Liste');
    assert.equal(t.aufrufe.fetch[0].method, 'GET', 'e2 der erste Zugriff auf das Lager ist ein LESEN');
    assert.deepEqual(r, { entfernt: 0, ohneProtokoll: 0 }, 'b2 leeres Lager: nichts entfernt');
  }

  // ---------- e3) gesperrtes Mitglied: nichts wird zerstört ----------
  // So verhält sich die Produktion (gemessen): avatars/banners dürfte es löschen, page-media nicht.
  {
    const t = lade({ eimer: { avatars: ['a.jpg'], banners: ['b.jpg'], 'page-media': [D1] }, leeresRemove: 'page-media' });
    await wirft(t.ctx.deleteMemberUploads(KONTO), (err) => {
      assert.ok(/Support/.test(err.message), 'e3 die Meldung weist das Mitglied an den Support: ' + err.message);
      assert.ok(!/page-media|Status|403/.test(err.message), 'k1 und nennt dem Mitglied weder Eimer noch Status');
    }, 'e3');
    assert.deepEqual(t.stand.avatars, ['a.jpg'], 'e4 das Profilbild ist NOCH DA — nichts wurde vorher zerstört');
    assert.deepEqual(t.stand.banners, ['b.jpg'], 'e5 der Banner ebenso');
    assert.ok(!t.aufrufe.remove.some((a) => a.bucket === 'avatars'), 'e6 avatars wurde gar nicht angefasst');
  }

  // ---------- h) jeder Fehlerstatus des Lagers wirft, auch 503 und 404 ----------
  for (const status of [503, 404, 403, 500]) {
    const t = lade({ eimer: { avatars: ['a.jpg'] }, lager: [D1], lagerStatus: status });
    await wirft(t.ctx.deleteMemberUploads(KONTO, { asAdmin: true }), (err) => {
      assert.ok(new RegExp(String(status)).test(err.message), `h-${status} der Admin-Text nennt den Status: ` + err.message);
      assert.ok(/Konto bleibt bestehen/.test(err.message), `h-${status} und sagt, dass das Konto bleibt`);
    }, `h-${status}`);
    assert.deepEqual(t.stand.avatars, ['a.jpg'], `h-${status} nichts wurde gelöscht, das Lesen kam zuerst`);
    assert.ok(!t.aufrufe.fetch.some((a) => a.method === 'DELETE'), `h-${status} und es wurde nichts gelöscht`);
  }
  // Gegenprobe zu h) für das Mitglied: 403 heißt dort Sperre und wird als solche benannt
  {
    const t = lade({ lager: [D1], lagerStatus: 403 });
    await wirft(t.ctx.deleteMemberUploads(KONTO), (err) => {
      assert.ok(/gesperrt/.test(err.message), 'k2 dem Mitglied wird die Sperre genannt: ' + err.message);
      assert.ok(!/403/.test(err.message), 'k3 ohne Statuscode');
    }, 'k2');
  }

  // ---------- c) + g) + j) Admin-Weg ----------
  {
    const t = lade({ eimer: { 'page-media': [D1], 'project-images': ['p.jpg'] }, lager: [D2, D3], ohneProtokoll: [D3] });
    const r = await t.ctx.deleteMemberUploads(KONTO, { asAdmin: true });
    assert.equal(t.aufrufe.fetch[0].url, `/api/page-media/${KONTO}`, 'c1 gelistet wird über die Admin-Route');
    assert.deepEqual(t.aufrufe.fetch.filter((a) => a.method === 'DELETE').map((a) => a.url),
      [`/api/page-media/${KONTO}/${D2}`, `/api/page-media/${KONTO}/${D3}`],
      'c2 gelöscht wird über die Admin-Route, mit Kontokennung im Pfad');
    assert.deepEqual(t.lagerStand(), [], 'c3 das Lager ist leer');
    assert.deepEqual(t.aufrufe.rpc, [{ name: 'admin_media_log_write',
      args: { p_account: KONTO, p_file: D1, p_store: 'supabase', p_result: 'geloescht' } }],
      'j1 genau eine Protokollzeile: die Supabase-Seitenbild-Datei. project-images wird NICHT protokolliert');
    assert.deepEqual(r, { entfernt: 2, ohneProtokoll: 1 },
      'g1 beide Lager-Dateien weg, eine ohne Protokolleintrag — gezählt, nicht abgebrochen');
  }
  // j2: ein Protokolleintrag, der scheitert, wird gezählt und bricht nicht ab
  {
    const t = lade({ eimer: { 'page-media': [D1, 'kein-uuid-name.png'] }, rpcFehler: [D1] });
    const r = await t.ctx.deleteMemberUploads(KONTO, { asAdmin: true });
    assert.equal(r.ohneProtokoll, 2, 'j2 fehlgeschlagener Eintrag und unpassender Dateiname zählen beide');
    assert.deepEqual(t.stand['page-media'], [], 'j3 die Dateien sind trotzdem weg');
  }

  // ---------- d) leere Entfernen-Antwort wirft (Admin-Text nennt den Eimer) ----------
  {
    const t = lade({ eimer: { 'project-images': ['p.jpg'] }, leeresRemove: true });
    await wirft(t.ctx.deleteMemberUploads(KONTO, { asAdmin: true }), (err) => {
      assert.ok(/project-images/.test(err.message), 'd1 der Admin-Text nennt den Eimer: ' + err.message);
      assert.ok(/nichts entfernt/i.test(err.message), 'd2 und sagt, dass in diesem Speicher nichts entfernt wurde');
    }, 'd1');
    const gut = lade({ eimer: { 'project-images': ['p.jpg'] } });
    await gut.ctx.deleteMemberUploads(KONTO);
    assert.deepEqual(gut.stand['project-images'], [], 'd3 Gegenprobe: mit normaler Antwort ist der Eimer leer');
  }

  // ---------- f) abgeschnittene Liste wird erneut gelesen ----------
  {
    const t = lade({ lager: [D1, D2, D3], haeppchen: 1 });
    const r = await t.ctx.deleteMemberUploads(KONTO, { asAdmin: true });
    assert.equal(r.entfernt, 3, 'f1 alle drei Dateien sind weg, obwohl je nur eine gelistet wurde');
    assert.deepEqual(t.lagerStand(), [], 'f2 das Lager ist leer');
  }

  // ---------- i) 429 wird abgewartet, nicht als Fehler behandelt ----------
  {
    const t = lade({ lager: [D1], bremse: 3 });
    const r = await t.ctx.deleteMemberUploads(KONTO, { asAdmin: true });
    assert.equal(r.entfernt, 1, 'i1 die Datei ist trotz dreimal 429 weg');
    assert.deepEqual(t.aufrufe.warten, [1000, 1000, 1000], 'i2 gewartet wurde die vom Server genannte Zeit');
  }
  // i3 Gegenprobe: ein echter Fehlerstatus wird NICHT wiederholt, sondern wirft
  {
    const t = lade({ lager: [D1], loeschStatus: 502 });
    await wirft(t.ctx.deleteMemberUploads(KONTO, { asAdmin: true }), (err) => {
      assert.ok(/502/.test(err.message), 'i3 der Fehler nennt den Status');
      assert.ok(/Konto bleibt bestehen/.test(err.message), 'i4 und sagt, dass das Konto bleibt');
    }, 'i3');
  }

  // ---------- n) H1: spätere Runde scheitert — die schon gelöschten Dateien sind TROTZDEM protokolliert ----
  {
    const viele = Array.from({ length: 100 }, (_, i) => `${String(i).padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png`);
    const zaeh = 'dddddddd-dddd-dddd-dddd-dddddddddddd.png';
    const t = lade({ eimer: { 'page-media': [...viele, zaeh] }, zaehUnloeschbar: [zaeh] });
    await wirft(t.ctx.deleteMemberUploads(KONTO, { asAdmin: true }), (err) => {
      assert.ok(/100 Datei/.test(err.message), 'n1 die Meldung nennt die 100 schon entfernten Dateien: ' + err.message);
      assert.ok(!/nichts gelöscht/i.test(err.message), 'n2 und behauptet NICHT, es sei nichts gelöscht worden');
    }, 'n1');
    assert.equal(t.aufrufe.rpc.length, 100, 'n3 alle 100 echten Löschungen stehen im Protokoll, obwohl danach abgebrochen wurde');
    assert.ok(!t.aufrufe.rpc.some((a) => a.args.p_file === zaeh),
      'n4 für die Datei, die liegen blieb, steht KEINE Zeile im Protokoll (sie wäre eine Löschung, die nie stattfand)');
    assert.deepEqual(t.stand['page-media'], [zaeh], 'n5 genau diese Datei liegt noch im Eimer');
  }

  // ---------- o) N1/N2: 403 mit anderem Rumpf, und 200 ohne Dateiliste ----------
  {
    const t = lade({ lager: [D1], lagerStatus: 403, lagerRumpf: 'blocked by edge' });
    await wirft(t.ctx.deleteMemberUploads(KONTO), (err) => {
      assert.ok(!/gesperrt/.test(err.message),
        'o1 ein 403 von irgendwo sonst sagt dem Mitglied NICHT, sein Konto sei gesperrt: ' + err.message);
    }, 'o1');
  }
  {
    const t = lade({ eimer: { avatars: ['a.jpg'] }, ohneListe: true });
    await wirft(t.ctx.deleteMemberUploads(KONTO, { asAdmin: true }), (err) => {
      assert.ok(/nichts weiter gelöscht|Konto bleibt bestehen/.test(err.message), 'o2 200 ohne Dateiliste wirft: ' + err.message);
    }, 'o2');
    assert.deepEqual(t.stand.avatars, ['a.jpg'], 'o3 und nichts wurde gelöscht');
  }

  // ---------- m) Rundenbegrenzung: remove() meldet Erfolg, löscht aber nichts ----------
  // Heute nicht auslösbar (ohne Recht kommt eine LEERE Antwort, siehe d). Die Begrenzung ist für den Fall,
  // dass eine Bibliotheksfassung Erfolg meldet, ohne zu löschen. ACHTUNG beim Mutieren dieser Zeile: Fällt
  // die Begrenzung weg, endet dieser Test nicht mit einer roten Zusage, sondern mit Exit 134: die endlose
  // Schleife sprengt den Speicher (nachgemessen). Auch das ist rot, nur eben ohne sprechende Meldung.
  {
    const t = lade({ eimer: { 'page-media': [D1] }, luegendesRemove: true });
    await wirft(t.ctx.deleteMemberUploads(KONTO, { asAdmin: true }), (err) => {
      assert.ok(/nicht vollständig entfernt/.test(err.message), 'm1 nach der letzten Runde wirft es: ' + err.message);
    }, 'm1');
    assert.equal(t.aufrufe.list.filter((a) => a.bucket === 'page-media').length, 100, 'm2 genau 100 Runden, dann Schluss');
  }

  // ---------- l) Quelltextzusagen ----------
  {
    const profil = fs.readFileSync('public/pages/profil.js', 'utf8');
    const admin = fs.readFileSync('public/pages/admin-people.js', 'utf8');
    const avatars = fs.readFileSync('public/avatars.js', 'utf8');
    assert.ok(/deleteMemberUploads\(me\.id\)[\s\S]{0,200}?delete_my_account/.test(profil),
      'l1 profil.js: erst deleteMemberUploads, dann delete_my_account');
    assert.ok(/deleteMemberUploads\(m\.id, \{ asAdmin: true \}\)[\s\S]{0,400}?admin_delete_member/.test(admin),
      'l2 admin-people.js: erst deleteMemberUploads mit asAdmin, dann admin_delete_member');
    assert.ok(!/deleteMemberAvatars/.test(profil + admin + avatars),
      'l3 der alte, unvollständige Name ist weg — ein alt gecachter Aufrufer soll laut scheitern, nicht still zu wenig löschen');
    assert.ok(/Seitenbilder und Projektbilder/.test(fs.readFileSync('public/profil.html', 'utf8')),
      'l4 der Dialogtext nennt Seitenbilder und Projektbilder');
    assert.ok(fs.readFileSync('public/i18n-en.js', 'utf8').includes('page images and project images'),
      'l5 die englische Fassung auch');
  }

  console.log('PASS: Kontolöschung räumt alle vier Eimer und das eigene Server-Lager');
})().catch((err) => { console.error(String((err && err.message) || err)); process.exit(1); });
