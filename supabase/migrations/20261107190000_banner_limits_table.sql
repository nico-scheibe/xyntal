-- Banner: dieselben Grenzen je Tarif wie beim Profilbild, Admins ohne Grenze.
-- Nach 20261107170000_avatar_video.sql ausführen.
--
--   Tarif        Video               GIF / WebP
--   Plus         10 MB · 15 s        4 MB
--   Pro          25 MB · 30 s        8 MB
--   Ultra        60 MB · 60 s        16 MB
--   Enterprise   150 MB · 2 min      32 MB
--   Admin        keine Grenze        keine Grenze
--
-- • banner_video_limit_bytes bekommt die Werte der Tabelle (vorher 25/60/150/500 MB);
--   die Sekunden prüft die Seite (banners.js videoLimit) bzw. die App vor dem Upload.
-- • Ein GIF/WebP-Banner darf so groß sein wie ein animiertes Profilbild
--   (avatar_animated_limit_bytes); vorher galten für jedes Banner-Bild 4 MB.
-- • get_member_cards liefert avatar_path mit (wie get_public_card), damit die App das
--   Profilbild auf den Karten unter „Entdecken“ zeigen kann.
begin;

create or replace function public.banner_video_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select public.avatar_video_limit_bytes(p_plan, p_admin);
$$;

drop policy if exists "Xyntal eigenes Banner hochladen" on storage.objects;
create policy "Xyntal eigenes Banner hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'banners'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.is_premium
       and (storage.objects.name ~ '\.(jpg|png)$'
            or p.is_admin
            or (storage.objects.name ~ '\.(mp4|webm)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.banner_video_limit_bytes(p.plan, p.is_admin), 9223372036854775807))
            or (storage.objects.name ~ '\.(gif|webp)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.avatar_animated_limit_bytes(p.plan, p.is_admin), 9223372036854775807)))
  )
);

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
