-- Grenzen für eigene Banner und animierte Profilbilder je Tarif.
-- Nach 20261107150000_banner_video.sql ausführen.
--
--   Tarif        Video (Banner)     GIF / WebP (Banner und Profilbild)
--   plus         10 MB · 15 s       4 MB
--   pro          25 MB · 30 s       8 MB
--   ultra        60 MB · 60 s       16 MB
--   enterprise   150 MB · 2 min     32 MB
--   admin        keine Grenze       keine Grenze   (Website-Admins und Admins der App)
--
-- • profiles.premium_tier: der bezahlte Tarif ('' = keiner). Setzt der App-Server beim
--   Tarif-Abgleich (supabase/premiumSync.ts im App-Repo) oder ein Admin; Mitglieder nicht.
--   is_premium bleibt der Schalter für die Paid-Extras; ein Paid-Konto ohne Stufe zählt als plus.
-- • public.media_limits(id): die Grenzen eines Profils als JSON (null = keine Grenze).
-- • Die Buckets "banners" und "avatars" haben keine eigene Größengrenze mehr (es gilt die
--   Projekt-Grenze für Uploads); geprüft wird beim Setzen von banner_path / avatar_path an
--   der tatsächlichen Dateigröße in storage.objects. Eine zu große Datei kann also
--   hochgeladen, aber keinem Profil zugewiesen werden – die Seite räumt sie wieder weg.
--   Die Videodauer prüft die Seite (bzw. die App) vor dem Upload.
-- • get_member_cards liefert avatar_path mit, damit die App das Profilbild auf Karten zeigt.
begin;

alter table public.profiles add column if not exists premium_tier text not null default '';
alter table public.profiles drop constraint if exists profiles_premium_tier_check;
alter table public.profiles add constraint profiles_premium_tier_check
  check (premium_tier in ('', 'plus', 'pro', 'ultra', 'enterprise', 'admin'));

-- Grenzen eines Profils. Admins (Website-Admin, oder Stufe 'admin' für Admins der App) haben keine.
create or replace function public.media_limits(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when p.id is null or not p.is_premium then
      jsonb_build_object('tier', '', 'video_bytes', 0, 'video_seconds', 0, 'animated_bytes', 0)
    when p.is_admin or p.premium_tier = 'admin' then
      jsonb_build_object('tier', 'admin', 'video_bytes', null, 'video_seconds', null, 'animated_bytes', null)
    else case coalesce(nullif(p.premium_tier, ''), 'plus')
      when 'pro' then jsonb_build_object('tier', 'pro', 'video_bytes', 26214400, 'video_seconds', 30, 'animated_bytes', 8388608)
      when 'ultra' then jsonb_build_object('tier', 'ultra', 'video_bytes', 62914560, 'video_seconds', 60, 'animated_bytes', 16777216)
      when 'enterprise' then jsonb_build_object('tier', 'enterprise', 'video_bytes', 157286400, 'video_seconds', 120, 'animated_bytes', 33554432)
      else jsonb_build_object('tier', 'plus', 'video_bytes', 10485760, 'video_seconds', 15, 'animated_bytes', 4194304)
    end
  end
  from (select 1) one left join public.profiles p on p.id = p_id;
$$;
revoke execute on function public.media_limits(uuid) from public, anon;
grant execute on function public.media_limits(uuid) to authenticated;

-- Tarif-Stufe ist wie is_premium nicht selbst änderbar.
create or replace function public.guard_premium_media()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.is_premium is distinct from old.is_premium or new.premium_tier is distinct from old.premium_tier then
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
create trigger guard_premium_media before update of is_premium, premium_tier, banner_path, avatar_path on public.profiles
  for each row execute function public.guard_premium_media();

-- Größe der zugewiesenen Datei gegen die Grenze des Tarifs. Gilt für alle Schreiber,
-- auch den App-Server (Service Role), damit Website und App dieselben Grenzen haben.
-- JPG/PNG-Banner und JPG-Profilbilder verkleinern Seite und App selbst; für sie gilt 4 MB.
create or replace function public.guard_media_size()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lim jsonb;
  sz bigint;
  cap bigint;
begin
  lim := public.media_limits(new.id);
  if new.banner_path <> '' and new.banner_path is distinct from old.banner_path then
    select (o.metadata->>'size')::bigint into sz from storage.objects o where o.bucket_id = 'banners' and o.name = new.banner_path;
    cap := case when new.banner_path ~ '\.(mp4|webm)$' then (lim->>'video_bytes')::bigint
                when new.banner_path ~ '\.(gif|webp)$' then (lim->>'animated_bytes')::bigint
                else 4194304 end;
    if lim->>'tier' = 'admin' then cap := null; end if;
    if sz is not null and cap is not null and sz > cap then
      raise exception 'Die Datei ist für deinen Tarif zu groß (höchstens % MB).', cap / 1048576 using errcode = '22023';
    end if;
  end if;
  if new.avatar_path <> '' and new.avatar_path is distinct from old.avatar_path then
    select (o.metadata->>'size')::bigint into sz from storage.objects o where o.bucket_id = 'avatars' and o.name = new.avatar_path;
    cap := case when new.avatar_path ~ '\.(gif|webp)$' then (lim->>'animated_bytes')::bigint else 4194304 end;
    if lim->>'tier' = 'admin' then cap := null; end if;
    if sz is not null and cap is not null and sz > cap then
      raise exception 'Die Datei ist für deinen Tarif zu groß (höchstens % MB).', cap / 1048576 using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_media_size on public.profiles;
create trigger guard_media_size before update of banner_path, avatar_path on public.profiles
  for each row execute function public.guard_media_size();

-- Admin: Paid-Extras von Hand freischalten; die Stufe bleibt, wie sie ist (leer = plus).
create or replace function public.admin_set_premium(p_id uuid, p_is_premium boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  update public.profiles
     set is_premium = coalesce(p_is_premium, false),
         premium_tier = case when coalesce(p_is_premium, false) then premium_tier else '' end
   where id = p_id;
end;
$$;

-- Keine Bucket-Grenze mehr (Grenzen siehe oben); Typen wie bisher.
update storage.buckets set file_size_limit = null where id in ('banners', 'avatars');

-- Karten liefern zusätzlich avatar_path (wie get_public_card: GIF/WebP nur mit Paid-Tarif).
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
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end,
      'avatar_path', case when p.avatar_path ~ '\.jpg$' or p.is_premium then nullif(p.avatar_path, '') end
    )), '[]'::jsonb)
  from public.waitlist_cards c
  join public.profiles p on p.id = c.user_id
  where c.is_public and c.handle is not null and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
