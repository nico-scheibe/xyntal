-- Freie Seite unter xyntal.de/name: Links, Texte und Bilder frei positionieren, Farben wählen.
-- • waitlist_cards.page: das Layout als JSON (Version, Hintergrund, Höhe, Elemente mit Position/Größe/Farben).
--   Links werden nur per Id (ref) aus profile_links eingebunden – Titel, Adresse und Klickzähler bleiben dort.
-- • get_my_page / save_my_page: nur die eigene Seite; save prüft Größe, Typen, Anzahl und dass Bilder dem Konto gehören.
-- • get_public_card liefert 'page' (nur bei öffentlichen Karten); Darstellung und Farbprüfung macht public/page-canvas.js.
-- • Bucket page-media: öffentlich lesbar (die Bilder stehen auf einer öffentlichen Seite), schreiben nur in den eigenen Ordner,
--   JPG/PNG/WebP/GIF bis 3 MB; Wechsel des Bildes = neue Datei.
-- • Der Editor liegt auf der Seite /meine-seite: der Name wird als Wunsch-Link gesperrt.
-- Nach 20261108100000_link_text_entries.sql. Darf mehrfach laufen.
begin;

alter table public.waitlist_cards add column if not exists page jsonb;
alter table public.waitlist_cards drop constraint if exists waitlist_cards_page_check;
alter table public.waitlist_cards add constraint waitlist_cards_page_check
  check (page is null or (jsonb_typeof(page) = 'object' and pg_column_size(page) <= 65536));

-- Höchstzahl Elemente je Seite (Links zählen mit): Free 20, mit Paid/Admin 100
create or replace function public.page_item_limit(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when coalesce(p.is_premium, false) or coalesce(p.is_admin, false) then 100 else 20 end
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.page_item_limit(uuid) from public, anon, authenticated;

create or replace function public.get_my_page()
returns jsonb language sql stable security definer set search_path = '' as $$
  select c.page from public.waitlist_cards c where c.user_id = auth.uid() limit 1;
$$;
revoke execute on function public.get_my_page() from public, anon;
grant execute on function public.get_my_page() to authenticated;

-- Ersetzt das Layout. null oder {} setzt zurück auf die Standardseite.
create or replace function public.save_my_page(p_page jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_item jsonb;
  v_src text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  if p_page is null or p_page = '{}'::jsonb or p_page = 'null'::jsonb then
    update public.waitlist_cards set page = null where user_id = v_uid;
    return null;
  end if;
  if jsonb_typeof(p_page) <> 'object' then raise exception 'page must be an object' using errcode = '22023'; end if;
  if octet_length(p_page::text) > 60000 then raise exception 'page too large' using errcode = '54000'; end if;
  v_items := coalesce(p_page->'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(v_items) > coalesce(public.page_item_limit(v_uid), 20) then
    raise exception 'item limit reached' using errcode = '54000';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'type', '') not in ('link', 'text', 'image') then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    if v_item->>'type' = 'link' and coalesce(v_item->>'ref', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'invalid link reference' using errcode = '22023';
    end if;
    if v_item->>'type' = 'image' then
      v_src := coalesce(v_item->>'src', '');
      if v_src !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$') then
        raise exception 'invalid image' using errcode = '22023';
      end if;
    end if;
  end loop;

  update public.waitlist_cards set page = p_page where user_id = v_uid;
  if not found then raise exception 'no card' using errcode = 'P0002'; end if;
  return p_page;
end;
$$;
revoke execute on function public.save_my_page(jsonb) from public, anon;
grant execute on function public.save_my_page(jsonb) to authenticated;

-- Bilder der Seite
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('page-media', 'page-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Xyntal Seitenbild hochladen" on storage.objects;
create policy "Xyntal Seitenbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'page-media'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
  and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and public.ban_active(p.banned, p.banned_until))
);
-- Kein UPDATE: jedes Bild bekommt einen neuen Dateinamen.
drop policy if exists "Xyntal Seitenbild entfernen" on storage.objects;
create policy "Xyntal Seitenbild entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'page-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Eigene Bilder auflisten (Editor räumt nicht benutzte auf); Anzeige läuft über die öffentliche URL.
drop policy if exists "Xyntal Seitenbild lesen" on storage.objects;
create policy "Xyntal Seitenbild lesen" on storage.objects for select to authenticated
using (bucket_id = 'page-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Seite /meine-seite (Editor) darf von keinem Wunsch-Link verdeckt werden.
create or replace function public.reject_page_handles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if NEW.handle is not null and NEW.handle = any (array[
      '404', 'index', 'u', 'koppeln', 'app-anmeldung', 'arbeitsstil', 'fuer-dich', 'matching', 'tarif', 'invite', 'meine-seite']) then
    raise exception 'Dieser Link gehört zu einer Seite von Xyntal. Bitte wähle einen anderen.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.reject_page_handles() from public;

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
