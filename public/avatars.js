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

// Vor Kontolöschung alle eigenen Uploads über die Storage-API entfernen.
// SQL-DELETE auf storage.objects würde die eigentlichen Dateien nicht löschen.
async function deleteMemberAvatars(memberId) {
  await deleteMemberFiles('avatars', memberId);
  await deleteMemberFiles('banners', memberId); // eigene Kartenbanner (Paid)
}
async function deleteMemberFiles(bucket, memberId) {
  for (;;) {
    const { data, error } = await sb.storage.from(bucket).list(memberId, { limit: 100 });
    if (error) {
      if (/bucket not found/i.test(error.message)) return; // Vor Migration weiterhin nutzbar.
      throw error;
    }
    const paths = data.filter(file => file.id).map(file => `${memberId}/${file.name}`);
    if (!paths.length) return;
    const removed = unwrap(await sb.storage.from(bucket).remove(paths));
    if (!removed?.length) throw new Error('Die Profilbilder konnten nicht entfernt werden. Bitte versuch es erneut.');
  }
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
