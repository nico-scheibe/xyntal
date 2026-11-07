-- Profilbild auch als Video (MP4/WebM, stumm in Schleife) und Grenzen je Tarif,
-- Admins ohne Grenze. Nach 20261107160000_banner_video_limits.sql ausführen.
--
-- • profiles.avatar_path erlaubt .mp4 und .webm (Pfadform bleibt <uid>/<uuid>.<ext>).
-- • Bucket "avatars": Videos als MIME-Typ, Grenze auf 512 MB, damit die Tarif-Grenze
--   greift (ein Video wird nicht umgerechnet; die Seite prüft Dauer und Lesbarkeit).
-- • avatar_video_limit_bytes / avatar_animated_limit_bytes (plan, admin): die Grenze
--   für ein Video bzw. ein animiertes GIF/WebP, null = keine. Dieselbe Tabelle steht
--   in public/avatars.js; die Upload-Regel prüft die Größe beim Einfügen.
-- • Ohne Paid-Tarif bleibt es bei JPG (umgerechnet im Browser).
begin;

alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles add constraint profiles_avatar_path_check
  check (avatar_path = '' or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|gif|webp|mp4|webm)$'));

create or replace function public.avatar_video_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_admin, false) then null
    when p_plan in ('Plus', 'Forge', 'Pulse') then 10 * 1024 * 1024::bigint
    when p_plan in ('Pro', 'Crew', 'Nexus') then 25 * 1024 * 1024::bigint
    when p_plan in ('Ultra', 'Foundry', 'Ascend') then 60 * 1024 * 1024::bigint
    when p_plan in ('Enterprise', 'Enterprise+', 'Works', 'Works Custom') then 150 * 1024 * 1024::bigint
    else 0::bigint
  end;
$$;

create or replace function public.avatar_animated_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_admin, false) then null
    when p_plan in ('Plus', 'Forge', 'Pulse') then 4 * 1024 * 1024::bigint
    when p_plan in ('Pro', 'Crew', 'Nexus') then 8 * 1024 * 1024::bigint
    when p_plan in ('Ultra', 'Foundry', 'Ascend') then 16 * 1024 * 1024::bigint
    when p_plan in ('Enterprise', 'Enterprise+', 'Works', 'Works Custom') then 32 * 1024 * 1024::bigint
    else 4 * 1024 * 1024::bigint
  end;
$$;

-- Ohne Paid-Tarif kein animiertes Bild und kein Video als Profilbild.
create or replace function public.guard_premium_media()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.is_premium is distinct from old.is_premium or new.plan is distinct from old.plan then
    raise exception 'Der Tarif-Status lässt sich nicht selbst ändern.' using errcode = '42501';
  end if;
  if not old.is_premium then
    if new.banner_path <> '' and new.banner_path is distinct from old.banner_path then
      raise exception 'Ein eigenes Banner gibt es ab Plus.' using errcode = '42501';
    end if;
    if new.avatar_path ~ '\.(gif|webp|mp4|webm)$' and new.avatar_path is distinct from old.avatar_path then
      raise exception 'Animierte Profilbilder gibt es ab Plus.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

update storage.buckets
   set file_size_limit = 536870912,
       allowed_mime_types = array['image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']
 where id = 'avatars';

drop policy if exists "Xyntal eigenes Profilbild hochladen" on storage.objects;
create policy "Xyntal eigenes Profilbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|gif|webp|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and (storage.objects.name ~ '\.jpg$' or p.is_premium)
       and (storage.objects.name ~ '\.jpg$'
            or p.is_admin
            or (storage.objects.name ~ '\.(mp4|webm)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.avatar_video_limit_bytes(p.plan, p.is_admin), 9223372036854775807))
            or (storage.objects.name ~ '\.(gif|webp)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.avatar_animated_limit_bytes(p.plan, p.is_admin), 9223372036854775807)))
  )
);

commit;
