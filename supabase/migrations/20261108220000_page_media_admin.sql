-- Freie Seite: Admins laden Bilder und Videos (Hintergrund-Video) ohne Größenlimit hoch.
-- Alle anderen wie bisher: Bilder bis 3 MB, Videos bis 15 MB – jetzt in der Upload-Regel geprüft,
-- weil die Bucket-Grenze für Admins auf 500 MB steigt (wie beim Banner-Bucket).
-- Nach 20261108210000_page_pro.sql ausführen. Darf mehrfach laufen.
begin;

update storage.buckets set file_size_limit = 536870912 where id = 'page-media';

drop policy if exists "Xyntal Seitenbild hochladen" on storage.objects;
create policy "Xyntal Seitenbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'page-media'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and not public.ban_active(p.banned, p.banned_until)
       and (coalesce(p.is_admin, false)
            or coalesce((storage.objects.metadata->>'size')::bigint, 0)
               <= case when storage.objects.name ~ '\.(mp4|webm)$' then 15728640 else 3145728 end)
  )
);

notify pgrst, 'reload schema';
commit;
