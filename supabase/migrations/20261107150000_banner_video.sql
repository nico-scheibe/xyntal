-- Eigenes Banner auch als Video (MP4 oder WebM, stumm in Schleife), mit Paid-Tarif
-- wie das eigene Bild. Nach 20261107120000_card_banners_premium.sql ausführen.
--
-- • profiles.banner_path erlaubt .mp4 und .webm (Pfadform bleibt <uid>/<uuid>.<ext>).
-- • Bucket "banners": Videos als MIME-Typ, Grenze 12 MB (ein Video wird nicht
--   umgerechnet; die Seite prüft vor dem Upload Dauer ≤ 30 s und Lesbarkeit).
-- • Hochladen-Regel: dieselben Endungen wie die Spalte.
begin;

alter table public.profiles drop constraint if exists profiles_banner_path_check;
alter table public.profiles add constraint profiles_banner_path_check
  check (banner_path = '' or banner_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$'));

update storage.buckets
   set file_size_limit = 12582912,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm']
 where id = 'banners';

drop policy if exists "Xyntal eigenes Banner hochladen" on storage.objects;
create policy "Xyntal eigenes Banner hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'banners'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_premium)
);

commit;
