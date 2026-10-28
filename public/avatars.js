// Private Dateien über RLS laden; keine öffentlichen oder teilbaren Signed URLs.
const avatarFiles = new Map();
function resetAvatarFiles() {
  for (const item of avatarFiles.values()) if (item.url) URL.revokeObjectURL(item.url);
  avatarFiles.clear();
  document.querySelectorAll('[data-avatar-path] img').forEach(img => img.remove());
}
function validAvatarPath(path) { return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path || ''); }
async function hydrateAvatar(el) {
  const path = el.dataset.avatarPath;
  if (!validAvatarPath(path) || el.dataset.avatarLoading) return;
  el.dataset.avatarLoading = '1';
  try {
    let entry = avatarFiles.get(path);
    if (!entry) {
      entry = {};
      entry.promise = sb.storage.from('avatars').download(path).then(({ data, error }) => {
        if (error) throw error;
        entry.url = URL.createObjectURL(data);
        return entry.url;
      });
      avatarFiles.set(path, entry);
    }
    const url = await entry.promise;
    if (!el.isConnected || avatarFiles.get(path) !== entry) return;
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
  for (;;) {
    const { data, error } = await sb.storage.from('avatars').list(memberId, { limit: 100 });
    if (error) {
      if (/bucket not found/i.test(error.message)) return; // Vor Migration weiterhin nutzbar.
      throw error;
    }
    const paths = data.filter(file => file.id).map(file => `${memberId}/${file.name}`);
    if (!paths.length) return;
    const removed = unwrap(await sb.storage.from('avatars').remove(paths));
    if (!removed?.length) throw new Error('Die Profilbilder konnten nicht entfernt werden. Bitte versuch es erneut.');
  }
}

async function prepareAvatar(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Bitte wähle ein JPG-, PNG- oder WebP-Bild.');
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
      preview.innerHTML = `<div class="avatar avatar-lg"><img src="${esc(previewUrl)}" alt="Vorschau deines neuen Profilbilds"></div>`;
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
      selected = await prepareAvatar(file);
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
    const path = `${current.id}/${crypto.randomUUID()}.jpg`;
    let uploaded = false;
    try {
      unwrap(await sb.storage.from('avatars').upload(path, selected, { contentType: 'image/jpeg', cacheControl: '0', upsert: false }));
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
