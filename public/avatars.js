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
  const status = form.querySelector('[role=status]');
  function renderPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    preview.innerHTML = avatar(current.name, 'avatar-lg', current.avatar_path);
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
  renderPreview();
}
