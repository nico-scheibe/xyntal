// Private Dateien über RLS laden: Bilder als Blob, ein Video über eine kurzlebige
// signierte URL (es streamt, statt erst ganz zu kommen); keine teilbaren Links.
const avatarFiles = new Map();
function resetAvatarFiles() {
  for (const item of avatarFiles.values()) if (item.url && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
  avatarFiles.clear();
  document.querySelectorAll('[data-avatar-path] img, [data-avatar-path] video').forEach(node => node.remove());
}
function validAvatarPath(path) { return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|gif|webp|mp4|webm)$/.test(path || ''); }
function isVideoAvatar(path) { return /\.(mp4|webm)$/.test(path || ''); }
// Grenzen für animierte Profilbilder je Tarif (Bytes; Video dazu Sekunden), null = keine
// Grenze (Admins). Dieselbe Tabelle prüft der Bucket (avatar_*_limit_bytes in der Datenbank).
const MB = 1024 * 1024;
function avatarLimits(me) {
  if (!me || me.is_premium !== true) return { video: 0, seconds: 0, animated: 0 };
  if (me.is_admin === true) return { video: null, seconds: null, animated: null };
  switch (String(me.plan || '')) {
    case 'Pro': case 'Crew': case 'Nexus': return { video: 25 * MB, seconds: 30, animated: 8 * MB };
    case 'Ultra': case 'Foundry': case 'Ascend': return { video: 60 * MB, seconds: 60, animated: 16 * MB };
    case 'Enterprise': case 'Enterprise+': case 'Works': case 'Works Custom': return { video: 150 * MB, seconds: 120, animated: 32 * MB };
    default: return { video: 10 * MB, seconds: 15, animated: 4 * MB };
  }
}
// Ein stummes Video in Schleife an der Stelle des Bilds.
function avatarVideo(url) {
  const video = document.createElement('video');
  video.muted = true; video.loop = true; video.autoplay = true; video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  video.src = url;
  return video;
}
async function hydrateAvatar(el) {
  const path = el.dataset.avatarPath;
  if (!validAvatarPath(path) || el.dataset.avatarLoading) return;
  el.dataset.avatarLoading = '1';
  try {
    let entry = avatarFiles.get(path);
    if (!entry) {
      entry = {};
      entry.promise = isVideoAvatar(path)
        ? sb.storage.from('avatars').createSignedUrl(path, 3600).then(({ data, error }) => {
            if (error || !data || !data.signedUrl) throw error || new Error('no url');
            entry.url = data.signedUrl;
            return entry.url;
          })
        : sb.storage.from('avatars').download(path).then(({ data, error }) => {
            if (error) throw error;
            entry.url = URL.createObjectURL(data);
            return entry.url;
          });
      avatarFiles.set(path, entry);
    }
    const url = await entry.promise;
    if (!el.isConnected || avatarFiles.get(path) !== entry) return;
    if (isVideoAvatar(path)) {
      const video = avatarVideo(url);
      video.onloadeddata = () => el.classList.add('avatar-loaded');
      video.onerror = () => { video.remove(); el.classList.remove('avatar-loaded'); };
      el.append(video);
      video.play().catch(() => {});
      return;
    }
    const img = new Image();
    img.alt = '';
    img.onload = () => el.classList.add('avatar-loaded');
    img.onerror = () => { img.remove(); el.classList.remove('avatar-loaded'); };
    img.src = url;
    el.append(img);
  } catch { avatarFiles.delete(path); } // Initialen bleiben als Fallback.
}
function hydrateAvatars() { document.querySelectorAll('[data-avatar-path]').forEach(hydrateAvatar); }
new MutationObserver(hydrateAvatars).observe(document.body, { childList: true, subtree: true });
hydrateAvatars();
sb.auth.onAuthStateChange(event => {
  if (['SIGNED_OUT', 'SIGNED_IN'].includes(event)) {
    resetAvatarFiles();
    document.querySelectorAll('[data-avatar-path]').forEach(el => { delete el.dataset.avatarLoading; el.classList.remove('avatar-loaded'); });
    // Auf Logout keine privaten Bilder mit der alten Sitzung erneut laden.
    if (event === 'SIGNED_IN') setTimeout(hydrateAvatars, 0);
  }
});
window.addEventListener('pagehide', resetAvatarFiles);
window.addEventListener('pageshow', event => { if (event.persisted) {
  document.querySelectorAll('[data-avatar-path]').forEach(el => { delete el.dataset.avatarLoading; el.classList.remove('avatar-loaded'); });
  hydrateAvatars();
} });

// Vor Kontolöschung ALLE Uploads des Mitglieds entfernen: vier Supabase-Eimer und das eigene
// Server-Lager. Vorher waren es nur avatars und banners; Seitenbilder und Projektbilder blieben
// liegen. Gemessen am 20.11.2026: Nach einer Kontolöschung antwortete eine Seitenbild-Datei im
// eigenen Lager weiter mit 200, obwohl das Konto in auth.users und profiles weg war — und sie war
// über die Oberfläche nicht mehr auffindbar, weil die Admin-Liste des Lagers die Kontokennung
// braucht. Grundlage ist nicht ein falsches Versprechen im Dialog, sondern Art. 17 DSGVO: Was zum
// Konto gehört, muss mit dem Konto gehen.
//
// WARUM IM BROWSER und nicht auf dem Server: Der Website-Server und der Mediendienst halten nur den
// anon-Schlüssel (hosting/daki/server.cjs, supabaseConfig()). Ein bevorrechtigter Serverweg bräuchte
// den service_role-Schlüssel neu auf der Maschine — einen Schlüssel, der jede Zeilenregel der ganzen
// Datenbank aushebelt, für eine Aufräumarbeit. Und ein SECURITY DEFINER in SQL hilft nicht: Ein
// DELETE auf storage.objects löscht nur die Zeile, nicht die Datei, und genau das verhindert der
// Trigger protect_objects_delete ("prevents accidental data loss from orphaned objects").
//
// GRENZE, BEWUSST OFFEN, und die Durchsetzung liegt NUR HIER: Auf der Produktion gemessen am 20.11.2026
// prüft public.delete_my_account() nur auth.uid() und mfa_ok(), KEINE Sperre. Ein gesperrtes Mitglied kann die
// Funktion also in der Browser-Konsole aufrufen und sein Konto löschen, ohne diesen Weg zu nehmen — die
// Dateien blieben dann als Waisen liegen. Dass Beweise eine Sperre überleben, ist damit heute eine Zusage der
// Oberfläche, nicht der Datenbank. Ob die Datenbank sie durchsetzen soll, ist eine Entscheidung über Art. 17
// gegen Art. 17 Abs. 3 und steht als offener Punkt in DATENSCHUTZ-STATUS.md.
//
// Ein GESPERRTES Mitglied kann in page-media und project-images nichts
// löschen. Die beschränkende Regel "Sperre: nichts loeschen" hat die Freiliste avatars, banners,
// xyntal-app-files; in den anderen Eimern scheitert das Löschen, solange die Sperre läuft. Für ein
// gesperrtes Konto bleiben diese Dateien deshalb liegen, und das Löschen des Kontos bricht ab
// (siehe unten: jeder Fehlschlag wirft). Das ist Absicht — Beweise sollen eine Sperre überleben,
// Art. 17 Abs. 3 DSGVO trägt das. Ein Admin ist davon NICHT betroffen: me_banned() fragt die
// handelnde Person, nicht das Konto, dessen Dateien weggehen.
//
// asAdmin: true, wenn ein Admin ein fremdes Konto löscht. Dann läuft das eigene Server-Lager über die
// Admin-Route, und JEDE dortige Löschung schreibt eine Zeile in public.admin_media_log — so wie jede
// andere Admin-Löschung eines Seitenbildes auch. Rückgabe sagt, wie viele Dateien im eigenen Lager
// weggingen und wie viele davon ohne Protokolleintrag blieben.
// Reihenfolge mit Absicht: Zuerst wird das eigene Server-Lager nur GELESEN, dann kommen die Eimer, in denen
// eine Sperre das Löschen verbietet, und erst zuletzt die, in denen sie es erlaubt. Die erste Fassung hatte
// avatars und banners vorn: Ein gesperrtes Mitglied verlor dort Profilbild und Banner und bekam danach einen
// Fehler, weil page-media für es gesperrt ist — Dateien weg, Konto noch da. Von der Sicherheitsprüfung
// gefunden (hoch), hier behoben.
//
// WAS DIE REIHENFOLGE LEISTET, genau und nicht mehr: Der Fall der Sperre ist zerstörungsfrei, weil er am
// ersten Schritt scheitert. Sie macht den Vorgang NICHT unteilbar. Scheitert ein späterer Schritt (5xx, Netz,
// Ratengrenze), sind die vorherigen Eimer schon leer und das Konto besteht weiter. Was davor schützt, ist die
// Wiederholbarkeit: Ein erneuter Lauf setzt dort fort, wo es abbrach, und jede Meldung nennt, wie viel schon
// weg ist. Zweite Sicherheitsprüfung, mittel: Der frühere Kommentar behauptete hier zu viel.
const BUCKETS_SPERRE_GREIFT = ['page-media', 'project-images'];
const BUCKETS_SPERRE_FREI = ['avatars', 'banners'];
const LOG_DATEINAME = /^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$/;

async function deleteMemberUploads(memberId, { asAdmin = false } = {}) {
  // 1) Nur lesen. Wirft, wenn das Lager nicht sicher geprüft werden kann — BEVOR irgendetwas weg ist.
  let imLager = await serverLagerListe(memberId, asAdmin);
  let entfernt = 0, ohneProtokoll = 0;
  // 2) Eimer, in denen eine Sperre greift.
  for (const bucket of BUCKETS_SPERRE_GREIFT) {
    // Ein Admin, der fremde Seitenbilder im Supabase-Lager entfernt, muss das protokollieren — sonst wäre das
    // Prüfprotokoll genau für den häufigeren Weg blind. Protokolliert wird nach JEDER Runde, damit ein
    // Abbruch später die schon gelöschten Dateien nicht aus dem Nachweis fallen lässt.
    // project-images bleibt draußen: admin_media_log kennt nur die Lager "supabase" und "eigener-server" und
    // keine Spalte für den Eimer, eine Zeile dafür wäre nicht von einem Seitenbild zu unterscheiden.
    const nachRunde = asAdmin && bucket === 'page-media'
      ? async (namen) => { ohneProtokoll += await protokolliereSupabase(memberId, namen); }
      : null;
    await deleteMemberFiles(bucket, memberId, { asAdmin, nachRunde });
  }
  // 3) Eimer, in denen sie nicht greift.
  for (const bucket of BUCKETS_SPERRE_FREI) await deleteMemberFiles(bucket, memberId, { asAdmin });
  // 4) Das eigene Lager.
  for (let runde = 0; runde < 100; runde++) {
    if (!imLager.length) return { entfernt, ohneProtokoll };
    for (const name of imLager) {
      const pfad = asAdmin
        ? `/api/page-media/${encodeURIComponent(memberId)}/${encodeURIComponent(name)}`
        : `/api/page-media/${encodeURIComponent(name)}`;
      const antwort = await fetchGeduldig(pfad, { method: 'DELETE' });
      if (!antwort.ok) {
        const inhalt = await antwort.json().catch(() => null);
        throw lagerFehler(antwort.status, asAdmin, entfernt, inhalt && inhalt.error);
      }
      entfernt++;
      // Die Admin-Route meldet mit "logged", ob der Nachweis in der Datenbank ankam. Die Datei ist in jedem
      // Fall weg; ein fehlender Nachweis hält das Löschen NICHT auf, wird aber gezählt und gemeldet. Ein
      // Abbruch hier hieße: Konto nicht löschbar, solange das Protokoll klemmt.
      if (asAdmin) {
        const inhalt = await antwort.json().catch(() => ({}));
        if (inhalt && inhalt.logged === false) ohneProtokoll++;
      }
    }
    // Die Admin-Liste kann abgeschnitten sein ("truncated"), deshalb neu lesen, bis sie leer ist.
    imLager = await serverLagerListe(memberId, asAdmin);
  }
  throw new Error('Im eigenen Server-Speicher bleiben Dateien übrig, die sich nicht entfernen lassen. Das Konto bleibt bestehen.');
}

// Liest die Dateinamen im eigenen Server-Lager. Wirft bei JEDEM Status, der nicht 200 ist — auch bei 503 und
// 404. Grund: Beide heißen "ich kann es nicht prüfen", nicht "dort liegt nichts". Würden wir hier
// weitermachen, wäre das Konto gelöscht und die Dateien lägen weiter im Speicher, auffindbar über keine
// Oberfläche mehr, weil die Admin-Liste die Kontokennung braucht. Genau das sollte dieser Umbau beseitigen.
// Preis dieser Entscheidung, ausdrücklich: Auf einer Installation OHNE eigenes Lager (Dienst antwortet 503
// "not configured") ist die Kontolöschung blockiert, bis das Lager erreichbar ist. Auf der Produktion ist es
// eingerichtet. Von der Sicherheitsprüfung als stiller Fail-open gemeldet (mittel), hier geschlossen.
async function serverLagerListe(memberId, asAdmin) {
  const pfad = asAdmin ? `/api/page-media/${encodeURIComponent(memberId)}` : '/api/page-media';
  const antwort = await fetchGeduldig(pfad, { cache: 'no-store' });
  const inhalt = (await antwort.json().catch(() => null));
  if (!antwort.ok) throw lagerFehler(antwort.status, asAdmin, 0, inhalt && inhalt.error);
  // Status 200 ohne Dateiliste ist KEIN leeres Lager, sondern eine Antwort, die wir nicht verstehen (etwa von
  // einem Proxy oder einer Zwischenseite). Sie als "nichts da" zu lesen wäre derselbe Fail-open, den die
  // Strenge oben beseitigt. Zweite Sicherheitsprüfung, niedrig.
  if (!inhalt || !Array.isArray(inhalt.files)) throw lagerFehler(antwort.status, asAdmin, 0, 'keine Dateiliste');
  return inhalt.files.map((datei) => datei && datei.name).filter((name) => typeof name === 'string' && name);
}

// Fehlertext für das eigene Lager. Einem MITGLIED wird kein Eimername und kein Statuscode gezeigt (das sagt
// ihm nichts und verrät Interna); die Einzelheiten gehen in die Konsole. Für ein Mitglied ist 403 eindeutig:
// Auf dem eigenen Weg prüft der Dienst nur die Sperre (media-store.cjs, apiRoute), Adminrechte erst danach.
function lagerFehler(status, asAdmin, bereitsEntfernt, grund) {
  console.error('Kontolöschung: eigener Server-Speicher antwortet', status, grund || '', asAdmin ? '(Admin-Weg)' : '(eigener Weg)');
  const dazu = bereitsEntfernt ? ` ${bereitsEntfernt} Datei(en) wurden dort vorher bereits entfernt; ein erneuter Versuch macht weiter.` : '';
  if (asAdmin) return new Error(`Der eigene Server-Speicher antwortet mit ${status}. Es wurde dort nichts weiter gelöscht und das Konto bleibt bestehen.${dazu}`);
  // Die Sperre wird am RUMPF erkannt, nicht am Status: Auf dem eigenen Weg ist 403 heute eindeutig die Sperre
  // (media-store.cjs, apiRoute prüft sie vor der Admin-Verzweigung), aber käme je eine Schutzschicht vor die
  // Hauptdomain, bekäme jedes Mitglied fälschlich "dein Konto ist gesperrt" zu lesen. Zweite Prüfung, niedrig.
  if (status === 403 && grund === 'account banned') {
    return new Error('Dein Konto ist gesperrt. Solange die Sperre läuft, lässt sich das Konto nicht löschen, weil deine Dateien nicht entfernt werden dürfen. Bitte wende dich an den Support.');
  }
  return new Error(`Deine Bilder konnten gerade nicht entfernt werden, deshalb wurde das Konto nicht gelöscht. Bitte versuch es später noch einmal.${dazu}`);
}

// Wie fetch, aber wartet bei 429 die vom Server genannte Zeit ab und versucht es erneut. Der Website-Server
// lässt unter /api/ nur 60 Anfragen je Minute und IP durch (server.cjs, SITE_RATE_LIMIT_HEAVY) und schickt
// Retry-After mit. Ohne das bricht die Löschung eines Kontos mit vielen Dateien mitten im Lauf ab: Eimer
// geleert, Dateien teils weg, Konto noch da. Von der Sicherheitsprüfung gefunden (mittel).
async function fetchGeduldig(pfad, opts = {}) {
  for (let versuch = 0; versuch < 10; versuch++) {
    // Der Kopf wird in JEDER Runde neu geholt: Zehn Wiederholungen mit je bis zu 65 Sekunden sind gut elf
    // Minuten, in denen ein Zugangstoken ablaufen kann. getSession() erneuert es dabei selbst.
    const kopf = await authKopf();
    const antwort = await fetch(pfad, { ...opts, headers: { ...kopf, ...(opts.headers || {}) } });
    if (antwort.status !== 429) return antwort;
    const genannt = Number(antwort.headers && antwort.headers.get ? antwort.headers.get('Retry-After') : 0);
    const warten = Math.min(Math.max(Number.isFinite(genannt) && genannt > 0 ? genannt : 2, 1), 65) * 1000;
    await new Promise((fertig) => setTimeout(fertig, warten));
  }
  return { ok: false, status: 429, json: async () => ({}) };
}
async function authKopf() {
  const { data: { session } } = await sb.auth.getSession();
  return { Authorization: `Bearer ${session ? session.access_token : ''}` };
}

// Schreibt für jede im Supabase-Lager entfernte Seitenbild-Datei eine Zeile in das Prüfprotokoll. Gibt die
// Zahl der Dateien zurück, für die das NICHT gelang. Kein Abbruch: Die Dateien sind weg, und ein klemmendes
// Protokoll darf die Kontolöschung nicht verhindern — gemeldet wird es trotzdem.
async function protokolliereSupabase(memberId, namen) {
  let ohne = 0;
  for (const name of namen) {
    if (!LOG_DATEINAME.test(name)) { ohne++; console.error('Kontolöschung: Dateiname passt nicht in das Prüfprotokoll', name); continue; }
    const { error } = await sb.rpc('admin_media_log_write',
      { p_account: memberId, p_file: name, p_store: 'supabase', p_result: 'geloescht' });
    if (error) { ohne++; console.error('Kontolöschung: Protokolleintrag fehlgeschlagen', error); }
  }
  return ohne;
}

// Leert einen Eimer im Ordner des Kontos. `nachRunde` wird nach JEDER erfolgreichen Runde mit den wirklich
// entfernten Dateinamen aufgerufen — nicht erst am Ende. Die erste Fassung gab die Namen zurück und der
// Aufrufer protokollierte danach; warf eine spätere Runde, war der Rückgabewert verloren und 100 bereits
// gelöschte fremde Seitenbilder standen in keinem Protokoll, während die Meldung "nichts gelöscht" behauptete.
// Von der zweiten Sicherheitsprüfung mit einer eigenen Attrappe belegt (hoch), hier behoben.
//
// Welche Namen als entfernt gelten, entscheidet die ANTWORT von remove(), nicht die Liste davor: Supabase
// meldet nur die Objekte, die wirklich weg sind. Sonst entstünde eine Protokollzeile für eine Datei, die noch
// liegt — genau die Behauptung, die das Prüfprotokoll nie enthalten darf (zweite Prüfung, mittel).
//
// Die Rundenbegrenzung ist eine Vorsichtsmaßnahme: Sollte remove() je Erfolg melden, ohne zu löschen, drehte
// die Schleife sonst endlos, ohne Fehler und ohne Anzeige.
async function deleteMemberFiles(bucket, memberId, { asAdmin = false, nachRunde = null } = {}) {
  let entferntGesamt = 0;
  for (let runde = 0; runde < 100; runde++) {
    const { data, error } = await sb.storage.from(bucket).list(memberId, { limit: 100 });
    if (error) {
      if (/bucket not found/i.test(error.message)) return entferntGesamt; // Vor Migration weiterhin nutzbar.
      throw eimerFehler(bucket, asAdmin, entferntGesamt, error.message);
    }
    const dateien = data.filter((file) => file.id).map((file) => file.name);
    if (!dateien.length) return entferntGesamt;
    const weg = unwrap(await sb.storage.from(bucket).remove(dateien.map((name) => `${memberId}/${name}`)));
    // Namen aus der Antwort, auf den Dateinamen gekürzt (Supabase gibt den vollen Pfad), und auf die
    // angefragten Dateien beschnitten.
    const bestaetigt = (weg || [])
      .map((eintrag) => String((eintrag && eintrag.name) || '').split('/').pop())
      .filter((name) => dateien.includes(name));
    if (nachRunde && bestaetigt.length) await nachRunde(bestaetigt);
    entferntGesamt += bestaetigt.length;
    // Keine bestätigte Löschung, obwohl Dateien gelistet waren: fehlende Berechtigung (etwa die Sperre).
    // Darf NICHT als Erfolg durchgehen, sonst verschwindet das Konto, während die Dateien bleiben.
    if (!bestaetigt.length) throw eimerFehler(bucket, asAdmin, entferntGesamt, 'keine Datei bestätigt');
  }
  throw eimerFehler(bucket, asAdmin, entferntGesamt, 'Rundenbegrenzung erreicht');
}

// Fehlertext für einen Eimer. Nennt die Zahl der bereits entfernten Dateien — "nichts gelöscht" wäre nach
// einer teilweise gelaufenen Löschung falsch, und zwar an der empfindlichsten Stelle: im Prüfkontext.
function eimerFehler(bucket, asAdmin, bereitsEntfernt, grund) {
  console.error('Kontolöschung: Eimer', bucket, '—', grund, '| bereits entfernt:', bereitsEntfernt);
  const dazu = bereitsEntfernt
    ? ` ${bereitsEntfernt} Datei(en) in diesem Speicher wurden dabei schon entfernt; ein erneuter Versuch macht dort weiter.`
    : ' In diesem Speicher wurde nichts entfernt.';
  if (asAdmin) return new Error(`Die Dateien im Speicher "${bucket}" konnten nicht vollständig entfernt werden, das Konto bleibt bestehen.${dazu}`);
  return new Error('Deine Bilder konnten nicht vollständig entfernt werden, deshalb wurde das Konto nicht gelöscht. Ist dein Konto gesperrt, wende dich bitte an den Support. Sonst versuch es bitte später noch einmal.');
}

// Ein Video so lesen, wie der Browser es sieht (Dauer und Maße): kaputte Dateien und
// Stundenfilme kommen nicht in den Bucket.
function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true;
    const done = fn => { URL.revokeObjectURL(url); video.removeAttribute('src'); fn(); };
    video.onloadedmetadata = () => done(() => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight }));
    video.onerror = () => done(() => reject(new Error('Das Video konnte nicht gelesen werden. Bitte wähle eine MP4- oder WebM-Datei.')));
    video.src = url;
  });
}
const mbOf = bytes => String(Math.round(bytes / MB));
// Mit Paid-Tarif (profiles.is_premium) bleiben GIF, WebP und Video unverändert – so bleibt
// die Animation erhalten; wie groß sie sein dürfen, sagt der Tarif (avatarLimits).
async function prepareAvatar(file, me = null) {
  const premium = !!me && me.is_premium === true;
  const limits = avatarLimits(me);
  if (['video/mp4', 'video/webm'].includes(file.type)) {
    if (!premium) throw new Error('Ein Video als Profilbild gibt es ab Plus. Wähle ein JPG-, PNG- oder WebP-Bild.');
    if (!file.size) throw new Error('Das Video konnte nicht gelesen werden. Bitte wähle eine MP4- oder WebM-Datei.');
    if (limits.video !== null && file.size > limits.video) throw new Error(`Das Video darf in deinem Tarif höchstens ${mbOf(limits.video)} MB groß sein.`);
    const info = await probeVideo(file);
    if (!info.width || !info.height) throw new Error('Das Video konnte nicht gelesen werden. Bitte wähle eine MP4- oder WebM-Datei.');
    if (limits.seconds !== null && Number.isFinite(info.duration) && info.duration > limits.seconds) throw new Error(`Das Video darf in deinem Tarif höchstens ${limits.seconds} Sekunden lang sein.`);
    return file;
  }
  if (file.type === 'image/gif' && !premium) throw new Error('Animierte Profilbilder (GIF) gibt es ab Plus. Wähle ein JPG-, PNG- oder WebP-Bild.');
  if (premium && ['image/gif', 'image/webp'].includes(file.type)) {
    if (!file.size) throw new Error('Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei.');
    if (limits.animated !== null && file.size > limits.animated) throw new Error(`Animierte Profilbilder dürfen in deinem Tarif höchstens ${mbOf(limits.animated)} MB groß sein.`);
    return file;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Bitte wähle ein JPG-, PNG-, WebP- oder GIF-Bild.');
  if (!file.size || file.size > 8 * 1024 * 1024) throw new Error('Dein Bild darf höchstens 8 MB groß sein.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('Das Bild konnte nicht gelesen werden. Bitte wähle eine andere Datei.'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40000000) throw new Error('Das Bild ist zu groß. Bitte verkleinere es vor dem Hochladen.');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0B0A12'; ctx.fillRect(0, 0, 512, 512);
    const side = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size > 1048576) throw new Error('Das Bild konnte nicht verkleinert werden. Bitte wähle ein anderes.');
    return blob;
  } finally { bitmap.close(); }
}

function setupAvatarEditor(member, onChange) {
  const form = document.getElementById('avatar-form');
  if (!form) return;
  let current = member;
  let selected = null;
  let previewUrl = null;
  let preparing = 0;
  let busy = false;
  const input = form.querySelector('input[type=file]');
  const preview = form.querySelector('[data-avatar-preview]');
  const save = form.querySelector('[data-avatar-save]');
  const remove = form.querySelector('[data-avatar-remove]');
  const cancel = form.querySelector('[data-avatar-cancel]');
  const status = form.querySelector('[data-avatar-status]'); // Foto-Status; Symbol-Auswahl hat ihr eigenes Element
  function renderPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.innerHTML = avatar(current.name, 'avatar-lg', current.avatar_path, current.avatar_item);
    if (selected) {
      previewUrl = URL.createObjectURL(selected);
      preview.innerHTML = selected.type.startsWith('video/')
        ? `<div class="avatar avatar-lg"><video src="${esc(previewUrl)}" muted loop autoplay playsinline aria-label="Vorschau deines neuen Profilbilds"></video></div>`
        : `<div class="avatar avatar-lg"><img src="${esc(previewUrl)}" alt="Vorschau deines neuen Profilbilds"></div>`;
    }
    save.disabled = !selected || busy;
    input.disabled = busy;
    remove.disabled = !current.avatar_path || busy;
    cancel.hidden = true;
    cancel.disabled = busy;
  }
  async function selectFile(file) {
    if (busy || !file) return;
    busy = true; selected = null; renderPreview();
    setStatus(status, 'Bild wird vorbereitet …');
    try {
      selected = await prepareAvatar(file, current);
      busy = false;
      await savePicture();
    } catch (err) { selected = null; setStatus(status, friendlyError(err), 'error'); }
    finally { busy = false; input.value = ''; renderPreview(); }
  }
  input.addEventListener('change', () => selectFile(input.files[0]));
  const profilePreview = document.getElementById('preview');
  function editableAvatar(target) { return target.closest('#preview .avatar'); }
  function decorateAvatar() {
    const target = profilePreview?.querySelector('.avatar');
    if (!target) return;
    target.tabIndex = 0;
    target.setAttribute('role', 'button');
    target.setAttribute('aria-label', 'Profilbild ändern');
    target.setAttribute('aria-describedby', 'avatar-hint');
    target.title = 'Bild hier ablegen oder doppelklicken';
  }
  profilePreview?.addEventListener('dblclick', e => { if (editableAvatar(e.target) && !busy) input.click(); });
  profilePreview?.addEventListener('keydown', e => {
    if (editableAvatar(e.target) && ['Enter', ' '].includes(e.key)) { e.preventDefault(); if (!busy) input.click(); }
  });
  profilePreview?.addEventListener('dragover', e => {
    const target = editableAvatar(e.target);
    if (target) { e.preventDefault(); e.dataTransfer.dropEffect = busy ? 'none' : 'copy'; target.classList.add('avatar-drop'); }
  });
  profilePreview?.addEventListener('dragleave', e => { editableAvatar(e.target)?.classList.remove('avatar-drop'); });
  profilePreview?.addEventListener('drop', e => {
    const target = editableAvatar(e.target);
    if (!target) return;
    e.preventDefault(); target.classList.remove('avatar-drop'); selectFile(e.dataTransfer.files[0]);
  });
  if (profilePreview) new MutationObserver(decorateAvatar).observe(profilePreview, { childList: true, subtree: true });
  decorateAvatar();
  cancel.addEventListener('click', () => { ++preparing; selected = null; input.value = ''; setStatus(status, ''); renderPreview(); });
  async function changePicture(path, successText) {
    const old = current.avatar_path;
    const updated = unwrap(await sb.from('profiles').update({ avatar_path: path }).eq('id', current.id).select().single());
    current = { ...current, ...updated };
    selected = null; input.value = '';
    onChange(current);
    resetAvatarFiles();
    document.querySelectorAll('[data-avatar-path]').forEach(el => { delete el.dataset.avatarLoading; el.classList.remove('avatar-loaded'); });
    hydrateAvatars();
    if (old && old !== path) {
      const { error } = await sb.storage.from('avatars').remove([old]);
      if (error) { setStatus(status, `${successText} Die alte Datei konnte nicht aufgeräumt werden. Versuch es über „Alte Dateien aufräumen“ erneut.`, 'error'); form.querySelector('[data-avatar-cleanup]').hidden = false; return; }
    }
    setStatus(status, successText, 'ok');
  }
  form.addEventListener('submit', e => { e.preventDefault(); savePicture(); });
  async function savePicture() {
    if (!selected || busy) return;
    busy = true; renderPreview(); setStatus(status, 'Bild wird gespeichert …');
    const EXT = { 'image/gif': 'gif', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm' };
    const type = EXT[selected.type] ? selected.type : 'image/jpeg';
    const path = `${current.id}/${crypto.randomUUID()}.${EXT[type] || 'jpg'}`;
    let uploaded = false;
    try {
      unwrap(await sb.storage.from('avatars').upload(path, selected, { contentType: type, cacheControl: '0', upsert: false }));
      uploaded = true;
      await changePicture(path, 'Dein Profilbild ist gespeichert.');
    } catch (err) {
      // Bei einem fehlgeschlagenen Profil-Update die neue Datei wieder entfernen.
      if (uploaded && current.avatar_path !== path) {
        // Bei Netzfehlern kann das Update serverseitig bereits erfolgt sein.
        // Erst den aktuellen Verweis prüfen, bevor eine Datei gelöscht wird.
        const check = await sb.from('profiles').select('avatar_path').eq('id', current.id).single();
        if (!check.error && check.data.avatar_path !== path) {
          const cleanup = await sb.storage.from('avatars').remove([path]);
          if (cleanup.error) form.querySelector('[data-avatar-cleanup]').hidden = false;
        } else {
          form.querySelector('[data-avatar-cleanup]').hidden = false;
          if (!check.error) { current.avatar_path = path; selected = null; input.value = ''; onChange(current); }
        }
      }
      setStatus(status, friendlyError(err), 'error');
    } finally { busy = false; renderPreview(); }
  }
  remove.addEventListener('click', async () => {
    if (busy || !current.avatar_path) return;
    if (!remove.dataset.armed) {
      remove.dataset.armed = '1'; remove.textContent = 'Bild wirklich entfernen?';
      setTimeout(() => { delete remove.dataset.armed; remove.textContent = 'Bild entfernen'; }, 5000);
      return;
    }
    busy = true; renderPreview();
    try { await changePicture('', 'Dein Profilbild wurde entfernt.'); }
    catch (err) { setStatus(status, friendlyError(err), 'error'); }
    finally { busy = false; delete remove.dataset.armed; remove.textContent = 'Bild entfernen'; renderPreview(); }
  });
  form.querySelector('[data-avatar-cleanup]').addEventListener('click', async e => {
    if (busy) return;
    busy = true; renderPreview();
    try {
      const files = unwrap(await sb.storage.from('avatars').list(current.id, { limit: 1000 }));
      const paths = files.filter(file => file.id && `${current.id}/${file.name}` !== current.avatar_path).map(file => `${current.id}/${file.name}`);
      if (paths.length) unwrap(await sb.storage.from('avatars').remove(paths));
      e.target.hidden = true; setStatus(status, 'Alte Dateien wurden aufgeräumt.', 'ok');
    } catch (err) { setStatus(status, friendlyError(err), 'error'); }
    finally { busy = false; renderPreview(); }
  });
  // Symbol wählen (profiles.avatar_item): schreibt nur diese Spalte, ein Foto bleibt unberührt.
  // Freischaltung zeigt die Oberfläche aus den Profilfeldern; der Server prüft beim Speichern (Trigger).
  const itemBox = form.querySelector('[data-avatar-items]');
  const itemStatus = form.querySelector('[data-avatar-item-status]');
  const itemClear = form.querySelector('[data-avatar-item-clear]');
  let itemRows = [];
  // Gleiche Zeichenmenge wie avatar_blank_chars in der Migration (Leerraum und unsichtbare Zeichen an den Rändern):
  // Tab, LF, VT, FF, CR, Leerzeichen, U+00A0, U+00AD, U+1680, U+2000–U+200D, U+2028, U+2029, U+202F, U+205F, U+2060, U+3000, U+FEFF
  const itemBlankCodes = new Set([9, 10, 11, 12, 13, 32, 160, 173, 5760, 8232, 8233, 8239, 8287, 8288, 12288, 65279]);
  for (let c = 8192; c <= 8205; c++) itemBlankCodes.add(c);
  // Mindestlängen für Stufe 2, gleich wie avatar_profile_min in der Migration
  const itemMin = { headline: 10, about: 40, offer: 10, seek: 10, linkedin: 8, website: 8 };
  // Länge nach dem Bereinigen der Ränder, in Zeichen (Code-Punkte) wie char_length in Postgres.
  // Schleife statt Regex: linear, ohne Rückverfolgung bei langen Leerraum-Folgen; Innenleerraum bleibt.
  function itemLen(v) {
    const cps = [...String(v || '')];
    let a = 0, b = cps.length;
    while (a < b && itemBlankCodes.has(cps[a].codePointAt(0))) a++;
    while (b > a && itemBlankCodes.has(cps[b - 1].codePointAt(0))) b--;
    return b - a;
  }
  const itemFilled = (v, field) => itemLen(v) >= itemMin[field];
  function itemTier(m) {
    if (m.status !== 'approved') return 0;
    const complete = itemFilled(m.headline, 'headline') && itemFilled(m.about, 'about')
      && (itemFilled(m.offer, 'offer') || itemFilled(m.seek, 'seek'))
      && (itemFilled(m.linkedin, 'linkedin') || itemFilled(m.website, 'website'));
    return complete ? 2 : 1;
  }
  // Hinweis auf gesperrten Kacheln: ohne Freigabe des Kontos nicht „Profil ausfüllen“
  const itemLockText = reached => reached === 0 ? 'Dein Konto muss zuerst freigeschaltet werden.' : 'Profil ausfüllen';
  function renderItems() {
    if (!itemBox) return;
    const reached = itemTier(current);
    const tone = avatarTone(current.name);
    const groups = [[1, 'Für alle Mitglieder'], [2, 'Mit vollständigem Profil']];
    itemBox.querySelector('[data-avatar-items-groups]').innerHTML = groups.map(([tier, title]) => {
      const cells = itemRows.filter(row => row.tier === tier && window.AVATAR_ITEMS?.[row.item]).map(row => {
        const meta = window.AVATAR_ITEMS[row.item];
        const open = reached >= tier;
        const chosen = current.avatar_item === row.item;
        const lock = itemLockText(reached);
        const label = open ? meta.name : `${meta.name} (gesperrt: ${lock})`;
        return `<div class="avatar-item-cell"><button type="button" class="avatar avatar-item-tile ${tone}" data-avatar-item="${esc(row.item)}" aria-pressed="${chosen}" aria-label="${esc(label)}" title="${esc(label)}"${open && !busy ? '' : ' disabled'}>${meta.svg}</button>${open ? '' : `<small>${esc(lock)}</small>`}</div>`;
      }).join('');
      return cells ? `<h3 class="avatar-items-title">${esc(title)}</h3><div class="avatar-items-grid">${cells}</div>` : '';
    }).join('');
    if (itemClear) itemClear.disabled = busy || !current.avatar_item;
  }
  async function loadItems() {
    try { itemRows = unwrap(await sb.rpc('avatar_items')) || []; renderItems(); }
    catch (err) { setStatus(itemStatus, friendlyError(err), 'error'); }
  }
  async function pickItem(item) {
    if (busy) return;
    busy = true; renderItems(); setStatus(itemStatus, 'Symbol wird gespeichert …');
    try {
      const updated = unwrap(await sb.from('profiles').update({ avatar_item: item }).eq('id', current.id).select().single());
      current = { ...current, ...updated };
      onChange(current);
      setStatus(itemStatus, !item ? 'Ohne Symbol zeigen wir wieder deine Initialen.'
        : current.avatar_path ? 'Dein Symbol ist gespeichert. Solange ein Foto gesetzt ist, zeigen wir das Foto.'
        : 'Dein Symbol ist gespeichert.', 'ok');
    } catch (err) { setStatus(itemStatus, friendlyError(err), 'error'); }
    finally { busy = false; renderItems(); renderPreview(); }
  }
  itemBox?.addEventListener('click', e => {
    const tile = e.target.closest('[data-avatar-item]');
    if (tile && !tile.disabled) pickItem(tile.dataset.avatarItem);
  });
  itemClear?.addEventListener('click', () => { if (current.avatar_item) pickItem(''); });
  loadItems();
  renderPreview();
}
