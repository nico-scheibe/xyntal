-- Freie Seite, Ausbau: Entwurf mit automatischem Speichern, Veröffentlichen mit Versionen (letzte 10),
-- Inhaltsfilter für alle Texte, Free-Grenze 40 Elemente, Aufrufe zählen, neue Elemente „contact“ und „counter“,
-- Handy-Reihenfolge (mo, prüft nur die Seite), Vorlagen-Galerie (geteilte Seiten ohne Bilder, Videos und Links)
-- und die Liste aller benutzten Dateien (der Editor räumt damit nicht mehr benutzte Uploads auf).
-- • page_check: gemeinsame Prüfung für Seite, Entwurf und Vorlage (vorher in save_my_page, 20261108190000_page_extras.sql)
-- • save_my_page: veröffentlicht, legt eine Version an und löscht den Entwurf
-- • get_public_card: wie 20261108200000_restore_card_functions.sql, dazu 'views'
-- Nach 20261108200000_restore_card_functions.sql ausführen. Darf mehrfach laufen.
begin;

alter table public.waitlist_cards add column if not exists page_draft jsonb;
alter table public.waitlist_cards drop constraint if exists waitlist_cards_page_draft_check;
alter table public.waitlist_cards add constraint waitlist_cards_page_draft_check
  check (page_draft is null or (jsonb_typeof(page_draft) = 'object' and pg_column_size(page_draft) <= 65536));
alter table public.waitlist_cards add column if not exists page_views bigint not null default 0;
alter table public.waitlist_cards add column if not exists page_viewed_at timestamptz;

-- Höchstzahl Elemente je Seite (Links zählen mit): Free 40, mit Paid/Admin 100
create or replace function public.page_item_limit(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when coalesce(p.is_premium, false) or coalesce(p.is_admin, false) then 100 else 40 end
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.page_item_limit(uuid) from public, anon, authenticated;

-- Veröffentlichte Fassungen: je Konto bleiben die letzten 10
create table if not exists public.page_versions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  page jsonb not null check (jsonb_typeof(page) = 'object' and pg_column_size(page) <= 65536),
  created_at timestamptz not null default now()
);
create index if not exists page_versions_user_idx on public.page_versions (user_id, created_at desc);
alter table public.page_versions enable row level security;
revoke all on public.page_versions from anon, authenticated;

-- Vorlagen-Galerie: geteilte Seiten (ohne Bilder, Videos, Links und Knopf-Adressen)
create table if not exists public.page_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 40),
  page jsonb not null check (jsonb_typeof(page) = 'object' and pg_column_size(page) <= 65536),
  created_at timestamptz not null default now()
);
create index if not exists page_templates_created_idx on public.page_templates (created_at desc);
alter table public.page_templates enable row level security;
revoke all on public.page_templates from anon, authenticated;
-- Keine Policies: Lesen und Schreiben laufen nur über die security-definer-Funktionen.

-- Prüft ein Layout; Fehler als Exception. Inhaltsfilter (content_problem aus 20261028150000_content_safety.sql) über alle Texte.
create or replace function public.page_check(p_page jsonb, p_uid uuid, p_template boolean default false)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_item jsonb;
  v_src text;
  v_txt text;
  v_reason text;
begin
  if jsonb_typeof(p_page) <> 'object' then raise exception 'page must be an object' using errcode = '22023'; end if;
  if octet_length(p_page::text) > 60000 then raise exception 'page too large' using errcode = '54000'; end if;
  -- Hintergrund-Video: nur aus dem eigenen Ordner und nur als bestätigt eigenes Video
  if coalesce(p_page->>'bgv', '') <> '' and (p_template or
       p_page->>'bgv' !~ ('^' || p_uid::text || '/[0-9a-f-]{36}\.(mp4|webm)$') or coalesce(p_page->>'bgvOwn', '') <> 'true') then
    raise exception 'invalid background video' using errcode = '22023';
  end if;
  v_items := coalesce(p_page->'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(v_items) > coalesce(public.page_item_limit(p_uid), 40) then
    raise exception 'item limit reached' using errcode = '54000';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'type', '') not in ('link', 'text', 'image', 'block', 'shape', 'button', 'embed', 'icons', 'countdown', 'contact', 'counter') then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    -- Vorlagen: keine Bilder, Videos, Knopf-Adressen; Links nur als leere Platzhalter
    if p_template and (v_item->>'type' in ('image', 'embed') or coalesce(v_item->>'url', '') <> ''
       or (v_item->>'type' = 'link' and coalesce(v_item->>'ref', '') <> '00000000-0000-0000-0000-000000000000')) then
      raise exception 'template must not contain media or links' using errcode = '22023';
    end if;
    if v_item->>'type' = 'link' and coalesce(v_item->>'ref', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'invalid link reference' using errcode = '22023';
    end if;
    if v_item->>'type' = 'block' and coalesce(v_item->>'kind', '') not in ('card', 'head', 'about', 'offer', 'seek', 'skills') then
      raise exception 'invalid block' using errcode = '22023';
    end if;
    if v_item->>'type' = 'button' and coalesce(v_item->>'url', '') <> ''
       and (coalesce(v_item->>'url', '') !~* '^https?://[^[:space:]]{3,}$' or char_length(v_item->>'url') > 500) then
      raise exception 'invalid button url' using errcode = '22023';
    end if;
    if v_item->>'type' = 'embed' and not (
         (v_item->>'provider' = 'youtube' and coalesce(v_item->>'eid', '') ~ '^[A-Za-z0-9_-]{11}$')
      or (v_item->>'provider' = 'vimeo' and coalesce(v_item->>'eid', '') ~ '^[0-9]{6,12}$')
      or (v_item->>'provider' = 'spotify' and coalesce(v_item->>'eid', '') ~ '^(track|album|playlist|episode|show|artist)/[A-Za-z0-9]{22}$')) then
      raise exception 'invalid embed' using errcode = '22023';
    end if;
    -- Video / Musik nur als eigenes Projekt (Community-Richtlinien, Regel 8): Bestätigung ist Pflicht
    if v_item->>'type' = 'embed' and coalesce(v_item->>'own', '') <> 'true' then
      raise exception 'embed not confirmed as own content' using errcode = '22023';
    end if;
    -- Hover-Effekt: nur ein kurzer Name aus Kleinbuchstaben; welche es gibt, entscheidet public/page-canvas.js (HOVERS)
    if coalesce(v_item->>'hover', '') !~ '^[a-z]{0,16}$' then
      raise exception 'invalid hover effect' using errcode = '22023';
    end if;
    if v_item ? 'anim' and jsonb_typeof(v_item->'anim') <> 'null' then
      if jsonb_typeof(v_item->'anim') <> 'object'
         or coalesce(v_item->'anim'->>'p', '') not in ('fade', 'up', 'left', 'zoom', 'float', 'pulse', 'bounce', 'wobble', 'shake', 'spin', 'glow', 'rainbow', 'custom')
         or char_length(coalesce(v_item->'anim'->>'code', '')) > 1500
         or coalesce(v_item->'anim'->>'code', '') !~ '^[A-Za-z0-9äöüÄÖÜß%#{}():;.,@_[:space:]-]*$' then
        raise exception 'invalid animation' using errcode = '22023';
      end if;
    end if;
    if v_item->>'type' = 'countdown' and coalesce(v_item->>'date', '') !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})?$' then
      raise exception 'invalid countdown' using errcode = '22023';
    end if;
    if v_item->>'type' = 'image' then
      v_src := coalesce(v_item->>'src', '');
      if v_src !~ ('^' || p_uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$') then
        raise exception 'invalid image' using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Inhaltsfilter: Texte, Beschriftungen, Bildbeschreibungen, Knopf-Adressen (nur wenn die Funktion installiert ist)
  if to_regprocedure('public.content_problem(text)') is not null then
    select string_agg(concat_ws(' ', x->>'text', x->>'alt', x->>'url'), E'\n') into v_txt from jsonb_array_elements(v_items) x;
    execute 'select public.content_problem($1)' into v_reason using coalesce(v_txt, '');
    if v_reason is not null then
      raise exception 'XYNTAL_MODERATION:%', v_reason using errcode = 'P0001';
    end if;
  end if;
end;
$$;
revoke execute on function public.page_check(jsonb, uuid, boolean) from public, anon, authenticated;

create or replace function public.page_guard()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke execute on function public.page_guard() from public, anon, authenticated;

-- Veröffentlichen. null oder {} setzt zurück auf die Standardseite (und löscht den Entwurf).
create or replace function public.save_my_page(p_page jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.page_guard();
begin
  if p_page is null or p_page = '{}'::jsonb or p_page = 'null'::jsonb then
    update public.waitlist_cards set page = null, page_draft = null where user_id = v_uid;
    return null;
  end if;
  perform public.page_check(p_page, v_uid);
  update public.waitlist_cards set page = p_page, page_draft = null where user_id = v_uid;
  if not found then raise exception 'no card' using errcode = 'P0002'; end if;
  insert into public.page_versions (user_id, page) values (v_uid, p_page);
  delete from public.page_versions v where v.user_id = v_uid and v.id not in
    (select id from public.page_versions where user_id = v_uid order by created_at desc, id desc limit 10);
  return p_page;
end;
$$;
revoke execute on function public.save_my_page(jsonb) from public, anon;
grant execute on function public.save_my_page(jsonb) to authenticated;

-- Entwurf (automatisch gespeichert, nicht öffentlich). null löscht den Entwurf.
create or replace function public.save_my_page_draft(p_page jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public.page_guard();
begin
  if p_page is null or p_page = 'null'::jsonb then
    update public.waitlist_cards set page_draft = null where user_id = v_uid;
    return true;
  end if;
  perform public.page_check(p_page, v_uid);
  update public.waitlist_cards set page_draft = p_page where user_id = v_uid;
  if not found then raise exception 'no card' using errcode = 'P0002'; end if;
  return true;
end;
$$;
revoke execute on function public.save_my_page_draft(jsonb) from public, anon;
grant execute on function public.save_my_page_draft(jsonb) to authenticated;

create or replace function public.get_my_page_state()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('page', c.page, 'draft', c.page_draft, 'views', c.page_views,
    'versions', (select count(*) from public.page_versions v where v.user_id = c.user_id))
  from public.waitlist_cards c where c.user_id = auth.uid() limit 1;
$$;
revoke execute on function public.get_my_page_state() from public, anon;
grant execute on function public.get_my_page_state() to authenticated;

create or replace function public.list_my_page_versions()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'created_at', v.created_at,
    'items', jsonb_array_length(coalesce(v.page->'items', '[]'::jsonb))) order by v.created_at desc, v.id desc), '[]'::jsonb)
  from public.page_versions v where v.user_id = auth.uid();
$$;
revoke execute on function public.list_my_page_versions() from public, anon;
grant execute on function public.list_my_page_versions() to authenticated;

create or replace function public.get_my_page_version(p_id bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select v.page from public.page_versions v where v.id = p_id and v.user_id = auth.uid();
$$;
revoke execute on function public.get_my_page_version(bigint) from public, anon;
grant execute on function public.get_my_page_version(bigint) to authenticated;

-- Alle Dateien, die Seite, Entwurf oder eine Version noch benutzen (der Editor löscht nur, was hier fehlt)
create or replace function public.get_my_page_media_refs()
returns text[] language sql stable security definer set search_path = '' as $$
  with pages as (
    select c.page as p from public.waitlist_cards c where c.user_id = auth.uid() and c.page is not null
    union all select c.page_draft from public.waitlist_cards c where c.user_id = auth.uid() and c.page_draft is not null
    union all select v.page from public.page_versions v where v.user_id = auth.uid()
  )
  select coalesce(array_agg(distinct r), '{}') from (
    select x->>'src' as r from pages, jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) x where x->>'type' = 'image'
    union all select p->>'bgv' from pages where coalesce(p->>'bgv', '') <> ''
  ) s where r is not null;
$$;
revoke execute on function public.get_my_page_media_refs() from public, anon;
grant execute on function public.get_my_page_media_refs() to authenticated;

-- Aufruf zählen (öffentlich; je Seite höchstens 1 Zählung pro Sekunde, nur öffentliche Karten)
create or replace function public.track_page_view(p_handle text)
returns void language sql volatile security definer set search_path = '' as $$
  update public.waitlist_cards c set page_views = c.page_views + 1, page_viewed_at = now()
  where c.handle = lower(trim(p_handle)) and c.is_public
    and (c.user_id is null or c.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid))
    and (c.page_viewed_at is null or c.page_viewed_at < now() - interval '1 second');
$$;
revoke execute on function public.track_page_view(text) from public;
grant execute on function public.track_page_view(text) to anon, authenticated;

-- ---- Vorlagen-Galerie ----
create or replace function public.share_page_template(p_name text, p_page jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.page_guard();
  v_id uuid;
  v_reason text;
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 40 then raise exception 'invalid template name' using errcode = '22023'; end if;
  if (select count(*) from public.page_templates where user_id = v_uid) >= 10 then raise exception 'template limit reached' using errcode = '54000'; end if;
  perform public.page_check(p_page, v_uid, true);
  if to_regprocedure('public.content_problem(text)') is not null then
    execute 'select public.content_problem($1)' into v_reason using p_name;
    if v_reason is not null then raise exception 'XYNTAL_MODERATION:%', v_reason using errcode = 'P0001'; end if;
  end if;
  insert into public.page_templates (user_id, name, page) values (v_uid, btrim(p_name), p_page) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.share_page_template(text, jsonb) from public, anon;
grant execute on function public.share_page_template(text, jsonb) to authenticated;

create or replace function public.list_page_templates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'page', t.page, 'handle', c.handle,
    'mine', t.user_id = auth.uid(), 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
  from (select * from public.page_templates order by created_at desc limit 60) t
  join public.profiles p on p.id = t.user_id
  left join public.waitlist_cards c on c.user_id = t.user_id
  where not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.list_page_templates() from public, anon;
grant execute on function public.list_page_templates() to authenticated;

create or replace function public.delete_my_page_template(p_id uuid)
returns boolean language sql volatile security definer set search_path = '' as $$
  with d as (delete from public.page_templates t where t.id = p_id and t.user_id = auth.uid() returning 1)
  select exists (select 1 from d);
$$;
revoke execute on function public.delete_my_page_template(uuid) from public, anon;
grant execute on function public.delete_my_page_template(uuid) to authenticated;

-- Öffentliche Karte: wie 20261108200000_restore_card_functions.sql, dazu 'views' (für das Element „Aufrufe“)
create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public or public.ban_active(p.banned, p.banned_until) then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb),
      'page', c.page,
      'views', c.page_views,
      'user_id', case when auth.uid() is not null then c.user_id end,
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
      'is_premium', coalesce(p.is_premium, false),
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end,
      'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url, 'icon', l.icon)
                                          order by l.position, l.created_at)
                         from public.profile_links l where l.user_id = c.user_id and l.active), '[]'::jsonb),
      'profile', case when p.id is null then null else jsonb_build_object(
        'headline', p.headline, 'about', p.about, 'offer', p.offer, 'seek', p.seek,
        'linkedin', p.linkedin, 'instagram', p.instagram, 'website', p.website,
        'avatar_path', case when p.avatar_path ~ '\.jpg$' or p.is_premium then nullif(p.avatar_path, '') end) end)
  end
  from (select 1) one
  left join public.waitlist_cards c on c.handle = lower(trim(p_handle))
  left join public.profiles p on p.id = c.user_id
  where lower(trim(coalesce(p_handle, ''))) ~ '^[a-z0-9][a-z0-9_-]{2,19}$';
$$;
revoke execute on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
