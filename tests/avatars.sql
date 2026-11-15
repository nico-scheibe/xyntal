-- Nur in einer separaten leeren lokalen PostgreSQL-Datenbank ausführen.
-- Rollen anon/authenticated müssen existieren (z.B. aus notifications.sql).
\set ON_ERROR_STOP on
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage to anon,authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create table public.profiles(id uuid primary key, status text, is_public boolean default false, is_admin boolean default false);
alter table public.profiles enable row level security;
grant select on public.profiles to anon,authenticated;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.profiles where id=auth.uid()),false) $$;
create function public.is_approved_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='approved') $$;
create policy profiles_read on public.profiles for select to anon,authenticated using(id=auth.uid() or (status='approved' and (is_public or public.is_approved_member())) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity, bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
grant usage on sequence storage.objects_id_seq to anon,authenticated;
\i supabase/005_profile_avatars.sql
insert into profiles(id,status,is_public,is_admin) values
 ('00000000-0000-0000-0000-000000000001','approved',false,false),
 ('00000000-0000-0000-0000-000000000002','approved',true,false),
 ('00000000-0000-0000-0000-000000000003','pending',false,false),
 ('00000000-0000-0000-0000-000000000004','approved',false,true);
update profiles set avatar_path=id::text||'/00000000-0000-0000-0000-000000000010.jpg';
insert into storage.objects(bucket_id,name) select 'avatars',avatar_path from profiles;
insert into storage.objects(bucket_id,name) values('avatars','00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000011.jpg');
set role anon;
do $$ begin
 if(select count(*) from storage.objects)<>1 then raise exception 'Guest must only see public profile image'; end if;
 begin insert into storage.objects(bucket_id,name) values('avatars','anything.jpg'); raise exception 'Guest upload'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 if(select count(*) from storage.objects)<>2 then raise exception 'Pending sees only own and public image'; end if;
 insert into storage.objects(bucket_id,name) values('avatars',auth.uid()::text||'/00000000-0000-0000-0000-000000000012.jpg');
 begin insert into storage.objects(bucket_id,name) values('avatars','00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000013.jpg'); raise exception 'Foreign upload'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('avatars',auth.uid()::text||'/x.svg'); raise exception 'Non-JPEG filename'; exception when insufficient_privilege then null; end;
 begin update profiles set avatar_path='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000010.jpg' where id=auth.uid(); raise exception 'Foreign profile path'; exception when check_violation then null; end;
 delete from storage.objects where name like '00000000-0000-0000-0000-000000000001/%';
 if found then raise exception 'Foreign delete'; end if;
 update storage.objects set name=name;
 if found then raise exception 'Storage overwrite'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if(select count(*) from storage.objects)<>3 then raise exception 'Member sees active approved images only'; end if;
end $$;
reset role;
update profiles set is_public=false where id='00000000-0000-0000-0000-000000000002';
set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$ begin if exists(select 1 from storage.objects) then raise exception 'Privacy toggle failed'; end if; end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin
 update profiles set avatar_path=auth.uid()::text||'/00000000-0000-0000-0000-000000000011.jpg' where id=auth.uid();
 delete from storage.objects where name=auth.uid()::text||'/00000000-0000-0000-0000-000000000010.jpg';
 if not found then raise exception 'Own cleanup failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if exists(select 1 from storage.objects where name='00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000010.jpg') then raise exception 'Old path exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 delete from storage.objects where name like '00000000-0000-0000-0000-000000000003/%';
 if not found then raise exception 'Admin account cleanup'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from storage.buckets where id='avatars' and not public and file_size_limit=1048576 and allowed_mime_types=array['image/jpeg']) then raise exception 'Bucket settings'; end if;
end $$;
select 'PASS: private bucket, visibility, uploads, ownership, cleanup, no overwrite' as result;

-- ---- Profil-Symbole (supabase/migrations/20261115120000_avatar_items.sql) ----
-- Profilfelder, die die Freischaltung prüft, im Minimalschema nachziehen; danach die Migration laden.
reset role;
alter table public.profiles
  add column headline text not null default '', add column about text not null default '',
  add column offer text not null default '', add column seek text not null default '',
  add column linkedin text not null default '', add column website text not null default '';
\i supabase/migrations/20261115120000_avatar_items.sql
do $$ begin
 if (select count(*) from public.avatar_items()) <> 18 or (select count(*) from public.avatar_items() where tier = 1) <> 6 then raise exception 'Avatar catalog'; end if;
end $$;
-- Basis: freigeschaltetes Mitglied mit leerem Profil darf Basis-Symbole setzen, Profil-Symbole nicht
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ begin
 update profiles set avatar_item='berg' where id=auth.uid();
 if (select avatar_item from profiles where id=auth.uid()) <> 'berg' then raise exception 'Basis symbol not saved'; end if;
 begin update profiles set avatar_item='eule' where id=auth.uid(); raise exception 'Profile symbol without complete profile'; exception when insufficient_privilege then null; end;
 begin update profiles set avatar_item='gibtsnicht' where id=auth.uid(); raise exception 'Unknown symbol accepted'; exception when insufficient_privilege then null; end;
 -- Ungültiges Format: der BEFORE-Trigger läuft vor den CHECK-Constraints und lehnt 'BERG' zuerst mit 42501 ab
 -- (Symbol nicht in der Liste). Der CHECK-Constraint greift danach nicht mehr. Erwartet wird daher 42501.
 begin update profiles set avatar_item='BERG' where id=auth.uid(); raise exception 'Invalid symbol format accepted'; exception when insufficient_privilege then null; end;
 update profiles set avatar_item='' where id=auth.uid();
end $$;
-- Pending-Mitglied: auch Basis-Symbole gesperrt
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 begin update profiles set avatar_item='berg' where id=auth.uid(); raise exception 'Pending member symbol accepted'; exception when insufficient_privilege then null; end;
end $$;
-- Profil-Set: nach vollständigem Profil ist das Symbol frei; Freischaltung nur für das eigene Konto abfragbar.
-- Mindestlängen (avatar_profile_min): Überschrift 10, Erzähl mehr 40, Angebot oder Suche je 10, LinkedIn oder Website je 8.
reset role;
update profiles set headline='Ich baue eine App', about='Ich baue eine App und suche Menschen, die mitmachen wollen.', offer='Marketing und Vertrieb', linkedin='https://example.org' where id='00000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ begin
 update profiles set avatar_item='eule' where id=auth.uid();
 if not public.avatar_item_unlocked(auth.uid(), 'eule') then raise exception 'Unlock check false for complete profile'; end if;
 if public.avatar_item_unlocked('00000000-0000-0000-0000-000000000002', 'eule') then raise exception 'Unlock check leaks other account'; end if;
end $$;
-- Unverändertes Symbol bleibt bei fehlender Freischaltung erlaubt (Profil-Änderung ohne Symbol-Wechsel)
reset role;
update profiles set headline='' where id='00000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
do $$ begin
 update profiles set avatar_item='eule' where id=auth.uid();
end $$;
-- Freischaltung verloren (Profil nicht mehr vollständig): das gesetzte Symbol bleibt lesbar,
-- ein anderes Profil-Symbol wird abgelehnt, ein Basis-Symbol bleibt erlaubt
do $$ begin
 if (select avatar_item from profiles where id=auth.uid()) <> 'eule' then raise exception 'Symbol lost after unlock loss'; end if;
 if public.avatar_item_unlocked(auth.uid(), 'eule') then raise exception 'Unlock still true without complete profile'; end if;
 begin update profiles set avatar_item='stern' where id=auth.uid(); raise exception 'Locked profile symbol accepted after unlock loss'; exception when insufficient_privilege then null; end;
 update profiles set avatar_item='berg' where id=auth.uid();
end $$;
reset role;

-- Mindestlängen, Leerraum und unsichtbare Zeichen. Hilfsfunktion setzt die Felder von Konto 0002 und versucht
-- 'eule' (der Trigger gilt auch für den Superuser). Rückgabe true = erlaubt, false = vom Trigger abgelehnt (42501).
create function pg_temp.avatar_try(p_headline text, p_about text, p_offer text, p_seek text, p_linkedin text, p_website text)
returns boolean language plpgsql as $$
begin
  update public.profiles set avatar_item='', headline=p_headline, about=p_about, offer=p_offer, seek=p_seek,
    linkedin=p_linkedin, website=p_website where id='00000000-0000-0000-0000-000000000002';
  update public.profiles set avatar_item='eule' where id='00000000-0000-0000-0000-000000000002';
  return true;
exception when insufficient_privilege then return false;
end $$;
do $$
declare
  ok_head text := 'Abcdefghij';            -- 10 Zeichen
  ok_about text := repeat('b', 40);        -- 40 Zeichen
  ok_mkt text := 'Marketing und Vertrieb'; -- 22 Zeichen
  ok_lk text := 'https://example.org';     -- 19 Zeichen
begin
  -- Überschrift: 9 abgelehnt, 10 erlaubt
  if pg_temp.avatar_try('Abcdefghi', ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Headline of 9 characters accepted'; end if;
  if not pg_temp.avatar_try(ok_head, ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Headline of 10 characters rejected'; end if;
  -- Erzähl mehr: 39 abgelehnt, 40 erlaubt
  if pg_temp.avatar_try(ok_head, repeat('b', 39), ok_mkt, '', ok_lk, '') then raise exception 'About of 39 characters accepted'; end if;
  if not pg_temp.avatar_try(ok_head, repeat('b', 40), ok_mkt, '', ok_lk, '') then raise exception 'About of 40 characters rejected'; end if;
  -- Angebot oder Suche: beide mit 9 abgelehnt, eines mit 10 reicht
  if pg_temp.avatar_try(ok_head, ok_about, 'Abcdefghi', 'Abcdefghi', ok_lk, '') then raise exception 'Offer and seek of 9 characters accepted'; end if;
  if not pg_temp.avatar_try(ok_head, ok_about, '', ok_head, ok_lk, '') then raise exception 'Seek of 10 characters alone rejected'; end if;
  -- LinkedIn oder Website: 7 abgelehnt, 8 erlaubt (Website allein reicht)
  if pg_temp.avatar_try(ok_head, ok_about, ok_mkt, '', 'abcdefg', '') then raise exception 'LinkedIn of 7 characters accepted'; end if;
  if not pg_temp.avatar_try(ok_head, ok_about, ok_mkt, '', '', 'abcdefgh') then raise exception 'Website of 8 characters alone rejected'; end if;
  -- Leerraum zählt nicht zur Länge: 8 Buchstaben mit Leerzeichen außen bleiben 8
  if pg_temp.avatar_try('   Abcdefgh   ', ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Padded 8-character headline accepted'; end if;
  if pg_temp.avatar_try(E'\n\t          \n', ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Whitespace-only headline accepted'; end if;
  if not pg_temp.avatar_try(E' \tAbcdefghij \n', ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Padded 10-character headline rejected'; end if;
  -- Unsichtbare Zeichen zählen nicht zur Länge
  if pg_temp.avatar_try(chr(8203)||'Abcdefgh'||chr(173)||'  ', ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Invisible characters counted as length'; end if;
  if not pg_temp.avatar_try(chr(8203)||chr(65279)||'Abcdefghij'||chr(173)||chr(160), ok_about, ok_mkt, '', ok_lk, '') then raise exception 'Invisible-framed 10-character headline rejected'; end if;
end $$;

select 'PASS: avatar items catalog, tiers, trigger, unlock loss, minimum lengths, whitespace, invisible characters, own-account unlock check' as result;
