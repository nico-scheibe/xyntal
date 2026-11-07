-- Banner-Video: Größe je Tarif, keine Grenze für Admins.
-- Nach 20261107150000_banner_video.sql ausführen.
--
-- • profiles.plan: der Tarif des Mitglieds aus der App (Free, Plus, Pro, Ultra,
--   Enterprise, Enterprise+), gespiegelt vom App-Server per Service Role
--   (server/src/supabase/premiumSync.ts im App-Repo, alle 5 Minuten) oder von einem
--   Admin über admin_set_plan. Mitglieder können ihn nicht selbst setzen.
-- • banner_video_limit_bytes(plan, admin): die Obergrenze für ein Banner-Video, null =
--   keine. Dieselbe Tabelle steht in public/banners.js (Sekunden dazu); die Seite zeigt
--   sie an und prüft vor dem Upload, der Bucket prüft die Größe beim Einfügen.
-- • Bucket "banners": Grenze auf 512 MB, damit die Tarif-Grenze greift, nicht der Bucket.
begin;

alter table public.profiles add column if not exists plan text not null default 'Free';

create or replace function public.banner_video_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_admin, false) then null
    when p_plan in ('Plus', 'Forge', 'Pulse') then 25 * 1024 * 1024::bigint
    when p_plan in ('Pro', 'Crew', 'Nexus') then 60 * 1024 * 1024::bigint
    when p_plan in ('Ultra', 'Foundry', 'Ascend') then 150 * 1024 * 1024::bigint
    when p_plan in ('Enterprise', 'Enterprise+', 'Works', 'Works Custom') then 500 * 1024 * 1024::bigint
    else 0::bigint
  end;
$$;

-- Der Tarif ist wie is_premium nicht selbst änderbar.
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
    if new.avatar_path ~ '\.(gif|webp)$' and new.avatar_path is distinct from old.avatar_path then
      raise exception 'Animierte Profilbilder gibt es ab Plus.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_premium_media on public.profiles;
create trigger guard_premium_media before update of is_premium, plan, banner_path, avatar_path on public.profiles
  for each row execute function public.guard_premium_media();

create or replace function public.admin_set_plan(p_id uuid, p_plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  update public.profiles
     set plan = coalesce(nullif(trim(p_plan), ''), 'Free'),
         is_premium = coalesce(nullif(trim(p_plan), ''), 'Free') <> 'Free' or is_admin
   where id = p_id;
end;
$$;
revoke execute on function public.admin_set_plan(uuid, text) from public, anon;
grant execute on function public.admin_set_plan(uuid, text) to authenticated;

update storage.buckets set file_size_limit = 536870912 where id = 'banners';

-- Hochladen: Paid-Tarif wie bisher; ein Video zusätzlich nur bis zur Grenze des Tarifs
-- (Admins ohne Grenze). storage.objects.metadata trägt die Größe beim Einfügen.
drop policy if exists "Xyntal eigenes Banner hochladen" on storage.objects;
create policy "Xyntal eigenes Banner hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'banners'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.is_premium
       and (storage.objects.name !~ '\.(mp4|webm)$'
            or p.is_admin
            or coalesce((storage.objects.metadata->>'size')::bigint, 0)
               <= coalesce(public.banner_video_limit_bytes(p.plan, p.is_admin), 9223372036854775807))
  )
);

commit;
