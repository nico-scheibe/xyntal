// Comments inherit parent visibility through database RLS.
(() => {
  const sessions = new WeakMap();
  const t = x => window.XyntalI18n?.t(x) || x;
  const html = x => esc(x);
  function setSummary(box, count) {
    const summary = box.querySelector(':scope > summary');
    if (!summary) return;
    summary.textContent = `Kommentare (${count})`;
  }
  function wireExpandableForm(form) {
    if (!form) return;
    const ta = form.querySelector('textarea');
    if (!ta) return;
    const expand = () => {
      if (form.classList.contains('is-expanded')) return;
      form.classList.add('is-expanded');
      ta.rows = 4;
    };
    ta.addEventListener('focus', expand);
    if (ta.value.trim()) expand();
  }
  async function show(box, force=false) {
    if (!box.open || (sessions.has(box) && !force)) return;
    const kind=box.dataset.commentKind, id=box.dataset.commentId;
    if (!['project','listing'].includes(kind) || !/^\d+$/.test(id)) return;
    const field=kind==='project'?'project_id':'listing_id';
    sessions.set(box,true);
    let content=box.querySelector('[data-comment-content]');
    if (!content) { content=document.createElement('div');content.dataset.commentContent='';box.append(content); }
    content.innerHTML=`<p role="status">${html(t('Kommentare werden geladen …'))}</p>`;
    try {
      const v=await viewer();
      const rows=unwrap(await sb.from('content_comments').select('id,author_id,body,created_at,author:profiles!content_comments_author_id_fkey(name,avatar_path)').eq(field,id).order('created_at',{ascending:false}).limit(100));
      if (!box.isConnected) return;
      setSummary(box, rows.length);
      content.innerHTML=`<div class="comment-list">${rows.length?rows.map(c=>{const who=c.author?.name||t('Mitglied');return`<article class="content-comment"><header>${avatar(who,'avatar-sm',c.author?.avatar_path)}<div class="comment-meta"><strong>${html(who)}</strong><time datetime="${html(c.created_at)}">${html(new Date(c.created_at).toLocaleString(document.documentElement.lang==='en'?'en-GB':'de-DE',{dateStyle:'medium',timeStyle:'short'}))}</time></div></header><p>${html(c.body)}</p>${v.me&&(v.isAdmin||c.author_id===v.me.id||box.dataset.commentOwner===v.me.id)?`<button type="button" class="comment-delete" data-comment-delete="${c.id}">${html(t('Kommentar löschen'))}</button>`:''}</article>`;}).join(''):`<p class="hint">${html(t('Noch keine Kommentare. Starte das Gespräch.'))}</p>`}</div>
      ${box.dataset.commentClosed==='true'?`<p class="hint">${html(t('Dieser Eintrag ist geschlossen. Neue Kommentare sind nicht möglich.'))}</p>`:v.canAct?`<form class="comment-form"><label>${html(t('Dein Kommentar'))}<textarea name="body" maxlength="1500" rows="1" required placeholder="${html(t('Stell eine Frage oder teile dein Feedback.'))}"></textarea></label><button class="btn btn-small" type="submit">${html(t('Kommentar veröffentlichen'))}</button></form>`:`<p><a class="text-link" href="/login?next=${encodeURIComponent(kind==='project'?`projekte?projekt=${id}`:`boerse#anzeige-${id}`)}">${html(t('Einloggen, um zu kommentieren'))}</a></p>`}<p role="status" class="form-status" data-comment-status></p>`;
      const status=content.querySelector('[data-comment-status]');
      const form=content.querySelector('form');
      wireExpandableForm(form);
      form?.addEventListener('submit',async e=>{
        e.preventDefault();const btn=form.querySelector('button'),body=form.elements.body.value.trim();if(!body)return;
        btn.disabled=true;status.textContent='';
        try{unwrap(await sb.from('content_comments').insert({[field]:Number(id),body}));await show(box,true);}
        catch(err){status.textContent=friendlyError(err);btn.disabled=false;}
      });
      content.querySelectorAll('[data-comment-delete]').forEach(btn=>btn.addEventListener('click',async()=>{
        if(!btn.dataset.confirmed){btn.dataset.confirmed='1';btn.textContent=t('Wirklich löschen?');return;}
        btn.disabled=true;
        try{unwrap(await sb.from('content_comments').delete().eq('id',btn.dataset.commentDelete));await show(box,true);}
        catch(err){status.textContent=friendlyError(err);btn.disabled=false;}
      }));
    } catch(err) {
      sessions.delete(box);content.innerHTML=`<p role="alert">${html(t('Kommentare konnten nicht geladen werden.'))}</p><button type="button" class="btn btn-small btn-ghost">${html(t('Erneut versuchen'))}</button>`;
      content.querySelector('button').addEventListener('click',()=>show(box,true));
    }
  }
  document.addEventListener('toggle',e=>{if(e.target.matches?.('[data-comment-kind]'))show(e.target);},true);
  window.XyntalComments={mount(root=document){root.querySelectorAll('[data-comment-kind][open]').forEach(x=>show(x));}};
})();
