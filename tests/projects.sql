-- Ausschließlich separate leere lokale DB. Rollen anon/authenticated vorausgesetzt.
-- Start: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/projects.sql
\set ON_ERROR_STOP on
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
grant usage on schema public to anon,authenticated;
create table public.profiles(id uuid primary key,status text,is_admin boolean default false);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.profiles where id=auth.uid()),false) $$;
create function public.is_approved_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='approved') $$;
grant execute on function public.is_admin(), public.is_approved_member() to anon, authenticated;
\i supabase/009_projects.sql
-- 1 Admin, 2 Inhaberin, 3 wartet auf Freigabe, 4 Mitglied
insert into profiles values('00000000-0000-0000-0000-000000000001','approved',true),('00000000-0000-0000-0000-000000000002','approved',false),('00000000-0000-0000-0000-000000000003','pending',false),('00000000-0000-0000-0000-000000000004','approved',false);

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 begin insert into projects(title,pitch) values('Nicht frei','x'); raise exception 'Pending member created project'; exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
insert into projects(title,pitch,is_public) values('Öffentlich','Eine App für Hofläden',true);
insert into projects(title,pitch,is_public) values('Intern','Nur für Mitglieder',false);
insert into project_roles(project_id,name,hours) select id,'Mobile',10 from projects where title='Öffentlich';
insert into project_roles(project_id,name,hours) select id,'Design',8 from projects where title='Öffentlich';
insert into project_roles(project_id,name) select id,'Backend' from projects where title='Intern';
do $$ begin
 begin insert into project_interest(role_id) select id from project_roles where name='Mobile'; raise exception 'Owner joined own role'; exception when insufficient_privilege then null; end;
 begin insert into project_roles(project_id,name) select id,'x'||g from projects, generate_series(1,7) g where title='Öffentlich'; raise exception 'Role limit missing'; exception when raise_exception then if sqlerrm not like '%acht Rollen%' then raise; end if; end;
end $$;
reset role;

select set_config('request.jwt.claim.sub','',false);
set role anon;
do $$ begin
 if (select count(*) from projects)<>1 then raise exception 'Guest sees private project'; end if;
 if (select count(*) from project_roles)<>2 then raise exception 'Guest sees private roles'; end if;
 begin perform * from project_interest; raise exception 'Guest sees interest'; exception when insufficient_privilege then null; end;
 begin insert into projects(title,pitch) values('Gast','x'); raise exception 'Guest created project'; exception when insufficient_privilege then null; end;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
insert into project_interest(role_id,note) select id,'Hab Flutter-Erfahrung' from project_roles where name='Mobile';
do $$ begin
 if (select count(*) from projects)<>2 then raise exception 'Member misses internal project'; end if;
 begin update project_roles set filled=true where name='Design'; if found then raise exception 'Foreign role updated'; end if; end;
 if (select filled from project_roles where name='Design') then raise exception 'Foreign role filled'; end if;
 update projects set title='Gekapert' where title='Öffentlich';
 if exists(select 1 from projects where title='Gekapert') then raise exception 'Foreign project updated'; end if;
 begin insert into project_interest(member_id,role_id) select '00000000-0000-0000-0000-000000000003',id from project_roles where name='Design'; raise exception 'Interest for someone else'; exception when insufficient_privilege then null; end;
end $$;

-- Inhaberin sieht Interesse und besetzt die Rolle
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 if (select count(*) from project_interest)<>1 then raise exception 'Owner misses interest'; end if;
end $$;
update project_roles set filled=true where name='Design';

-- Für besetzte Rollen kein Interesse mehr; fremdes Interesse unsichtbar
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 begin insert into project_interest(role_id) select id from project_roles where name='Design'; raise exception 'Interest on filled role'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$ begin
 if (select count(*) from project_interest)<>0 then raise exception 'Uninvolved admin sees interest'; end if;
end $$;
delete from projects where title='Intern';
reset role;
do $$ begin
 if exists(select 1 from projects where title='Intern') then raise exception 'Admin delete failed'; end if;
 if exists(select 1 from project_roles where name='Backend') then raise exception 'Cascade failed'; end if;
end $$;
select 'projects ok';
