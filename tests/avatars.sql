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
