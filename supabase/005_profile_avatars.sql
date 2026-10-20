-- Nach 004_notifications.sql einmal ausführen. Alle Änderungen atomar.
begin;
alter table public.profiles add column avatar_path text not null default ''
  check (avatar_path = '' or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}\.jpg$'));
grant update (avatar_path) on public.profiles to authenticated;

-- Privat: selbst bei bekannter URL müssen die Profilrechte geprüft werden.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/jpeg']);

create policy "Xyntal Profilbilder lesen" on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars' and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or (select public.is_admin())
  or exists (select 1 from public.profiles p where p.avatar_path = storage.objects.name)
));
create policy "Xyntal eigenes Profilbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.jpg$')
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()))
);
-- Kein UPDATE: jedes Bild hat einen neuen Dateinamen, kein Überschreiben.
create policy "Xyntal Profilbilder entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));
create index profiles_avatar_path_idx on public.profiles(avatar_path) where avatar_path <> '';
commit;
