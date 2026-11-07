-- Kartenbanner und Paid-Extras auf der Xyntal-Karte.
-- Nach 20261103180000_website_ban.sql ausführen (nutzt ban_active und definiert
-- get_member_cards / get_public_card von dort neu).
--
-- • profiles.is_premium: Mitglied hat einen bezahlten Tarif. Setzt der App-Server per
--   Service Role (Abgleich alle 5 Minuten, supabase/premiumSync.ts im App-Repo) oder ein
--   Admin über admin_set_premium. Mitglieder können es nicht selbst setzen.
-- • Banner-Vorlagen stehen in waitlist_cards.design.banner (keine Spalte nötig). Animierte
--   Vorlagen und das eigene Bild zeigt die Karte nur, solange is_premium gilt.
-- • profiles.banner_path + Bucket "banners": eigenes Banner-Bild (JPG, PNG, WebP oder GIF,
--   höchstens 4 MB), nur mit is_premium hochladbar. Lesbar wie Profilbilder: nur Dateien,
--   auf die ein Profil zeigt.
-- • Profilbilder: mit is_premium auch GIF und WebP (animiert), höchstens 4 MB.
begin;

alter table public.profiles add column if not exists is_premium boolean not null default false;
alter table public.profiles add column if not exists banner_path text not null default '';
alter table public.profiles drop constraint if exists profiles_banner_path_check;
alter table public.profiles add constraint profiles_banner_path_check
  check (banner_path = '' or banner_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'));
grant update (banner_path) on public.profiles to authenticated;

-- Profilbild: neben JPG auch GIF und WebP.
-- Die alte Regel aus 005_profile_avatars.sql hat einen automatisch vergebenen Namen
-- (z. B. profiles_check), daher über ihren Inhalt finden.
do $$
declare r record;
begin
  for r in select conname from pg_constraint
            where conrelid = 'public.profiles'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%avatar_path%' loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path = '' or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|gif|webp)$'));

-- Nur Paid-Mitglieder setzen ein eigenes Banner oder ein animiertes Profilbild.
-- Der Service Role (App-Server) und Admins sind davon ausgenommen.
create or replace function public.guard_premium_media()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.is_premium is distinct from old.is_premium then
    raise exception 'Der Tarif-Status lässt sich nicht selbst ändern.' using errcode = '42501';
  end if;
  if not old.is_premium then
    if new.banner_path <> '' and new.banner_path is distinct from old.banner_path then
      raise exception 'Ein eigenes Banner gibt es mit einem Paid-Tarif.' using errcode = '42501';
    end if;
    if new.avatar_path ~ '\.(gif|webp)$' and new.avatar_path is distinct from old.avatar_path then
      raise exception 'Animierte Profilbilder gibt es mit einem Paid-Tarif.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_premium_media on public.profiles;
create trigger guard_premium_media before update of is_premium, banner_path, avatar_path on public.profiles
  for each row execute function public.guard_premium_media();

-- Admin: Paid-Extras von Hand freischalten (z. B. für Konten ohne App-Tarif).
create or replace function public.admin_set_premium(p_id uuid, p_is_premium boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  update public.profiles set is_premium = coalesce(p_is_premium, false) where id = p_id;
end;
$$;
revoke execute on function public.admin_set_premium(uuid, boolean) from public, anon;
grant execute on function public.admin_set_premium(uuid, boolean) to authenticated;

-- Speicher: Profilbilder auch als GIF/WebP, bis 4 MB (JPGs verkleinert der Browser weiter auf < 1 MB).
update storage.buckets set file_size_limit = 4194304, allowed_mime_types = array['image/jpeg', 'image/gif', 'image/webp']
 where id = 'avatars';
drop policy if exists "Xyntal eigenes Profilbild hochladen" on storage.objects;
create policy "Xyntal eigenes Profilbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|gif|webp)$')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid())
               and (storage.objects.name ~ '\.jpg$' or p.is_premium))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', false, 4194304, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Xyntal Banner lesen" on storage.objects;
create policy "Xyntal Banner lesen" on storage.objects for select to anon, authenticated
using (bucket_id = 'banners' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or (select public.is_admin())
  or exists (select 1 from public.profiles p where p.banner_path = storage.objects.name)
));
drop policy if exists "Xyntal eigenes Banner hochladen" on storage.objects;
create policy "Xyntal eigenes Banner hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'banners'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_premium)
);
-- Kein UPDATE: jedes Bild bekommt einen neuen Dateinamen.
drop policy if exists "Xyntal Banner entfernen" on storage.objects;
create policy "Xyntal Banner entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'banners' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));
create index if not exists profiles_banner_path_idx on public.profiles(banner_path) where banner_path <> '';

-- Karten liefern is_premium und banner_path mit (Darstellung entscheidet die Seite).
create or replace function public.get_member_cards()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id, 'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level,
      'skills', to_jsonb(c.skills), 'hours', c.hours, 'mode', c.mode, 'city', c.city,
      'looking', c.looking, 'pitch', c.pitch, 'link', c.link, 'design', coalesce(c.design, '{}'::jsonb),
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
      'is_premium', coalesce(p.is_premium, false),
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end
    )), '[]'::jsonb)
  from public.waitlist_cards c
  join public.profiles p on p.id = c.user_id
  where c.is_public and c.handle is not null and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public or public.ban_active(p.banned, p.banned_until) then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb),
      'user_id', case when auth.uid() is not null then c.user_id end,
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
      'is_premium', coalesce(p.is_premium, false),
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end,
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
