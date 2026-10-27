-- Projektbilder: ein Titelbild pro Projekt (JPG, im Browser auf 1200×675 verkleinert).
-- Gespeichert im privaten Bucket „project-images“ unter <owner_id>/<uuid>.jpg.
-- Lesen darf, wer das Projekt sehen darf (gleiche Regeln wie für die Projekte selbst).
-- Einmal im Supabase SQL Editor ausführen (nach 009 und 018). Läuft als Transaktion. Darf mehrfach laufen.
begin;

alter table public.projects add column if not exists image_path text not null default '';
alter table public.projects drop constraint if exists projects_image_path_check;
alter table public.projects add constraint projects_image_path_check
  check (image_path = '' or image_path ~ ('^' || owner_id::text || '/[0-9a-f-]{36}\.jpg$'));
grant insert (image_path) on public.projects to authenticated;
grant update (image_path) on public.projects to authenticated;
create index if not exists projects_image_path_idx on public.projects (image_path) where image_path <> '';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', false, 1572864, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "Xyntal Projektbilder lesen" on storage.objects;
create policy "Xyntal Projektbilder lesen" on storage.objects for select to anon, authenticated
using (bucket_id = 'project-images' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or (select public.is_admin())
  -- unterliegt den Leserechten der Projekte: Gäste sehen nur Bilder öffentlicher Projekte
  or exists (select 1 from public.projects p where p.image_path = storage.objects.name)
));

drop policy if exists "Xyntal eigenes Projektbild hochladen" on storage.objects;
create policy "Xyntal eigenes Projektbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'project-images'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.jpg$'));

-- Kein UPDATE: jedes Bild bekommt einen neuen Dateinamen.
drop policy if exists "Xyntal Projektbilder entfernen" on storage.objects;
create policy "Xyntal Projektbilder entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));

commit;
