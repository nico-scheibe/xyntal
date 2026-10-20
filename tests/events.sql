-- Ausschließlich separate leere lokale DB. Rollen anon/authenticated vorausgesetzt.
\set ON_ERROR_STOP on
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
create table public.profiles(id uuid primary key,status text,is_admin boolean default false);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select coalesce((select is_admin from public.profiles where id=auth.uid()),false) $$;
create function public.is_approved_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='approved') $$;
\i supabase/006_events.sql
insert into profiles values('00000000-0000-0000-0000-000000000001','approved',true),('00000000-0000-0000-0000-000000000002','approved',false),('00000000-0000-0000-0000-000000000003','pending',false),('00000000-0000-0000-0000-000000000004','approved',false);
insert into events(id,title,starts_at,place,is_public,cancelled) overriding system value values
 (10,'Öffentlich',now()+interval '7 days','Regensburg',true,false),
 (11,'Intern',now()+interval '8 days','Regensburg',false,false),
 (12,'Abgesagt',now()+interval '9 days','Regensburg',true,true),
 (13,'Vergangen',now()-interval '1 day','Regensburg',true,false),
 (20,'Paralleltest',now()+interval '7 days','Regensburg',true,false);
set role anon;
do $$ begin
 if(select count(*) from events)<>4 then raise exception 'Private event leaked'; end if;
 if exists(select 1 from event_counts(array[11]::bigint[])) then raise exception 'Private counts leaked'; end if;
 begin perform * from event_rsvps; raise exception 'Guest sees identities'; exception when insufficient_privilege then null; end;
 begin perform set_event_attendance(10,true); raise exception 'Guest RSVP'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin
 begin perform set_event_attendance(10,true); raise exception 'Pending RSVP allowed'; exception when raise_exception then if sqlerrm not like '%Freigabe%' then raise; end if; end;
 if(select count(*) from events)<>4 then raise exception 'Pending private visibility'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_event_attendance(10,true);
select set_event_attendance(10,true);
select set_event_attendance(11,true);
do $$ begin
 if(select count(*) from event_rsvps)<>2 then raise exception 'Duplicate or missing RSVP'; end if;
 begin insert into event_rsvps values(10,auth.uid(),now()); raise exception 'Direct insert'; exception when insufficient_privilege then null; end;
 begin update event_rsvps set member_id='00000000-0000-0000-0000-000000000004'; raise exception 'Reassignment'; exception when insufficient_privilege then null; end;
 begin insert into events(title,starts_at,place) values('Invalid',now()+interval '1 day','X'); raise exception 'Non-admin created'; exception when insufficient_privilege then null; end;
 update events set cancelled=true where id=10;
 if found then raise exception 'Non-admin edited'; end if;
 begin perform set_event_attendance(12,true); raise exception 'Cancelled RSVP'; exception when raise_exception then if sqlerrm not like '%abgesagt%' then raise; end if; end;
 begin perform set_event_attendance(13,true); raise exception 'Past RSVP'; exception when raise_exception then if sqlerrm not like '%begonnen%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
do $$ begin
 if exists(select 1 from event_rsvps) then raise exception 'Other member sees identities'; end if;
 if(select attending_count from event_counts(array[10]::bigint[]))<>1 then raise exception 'Count wrong'; end if;
 perform set_event_attendance(10,false);
 if(select attending_count from event_counts(array[10]::bigint[]))<>1 then raise exception 'Other RSVP withdrawn'; end if;
end $$;
select set_event_attendance(10,true);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_event_attendance(10,false);
do $$ begin if exists(select 1 from event_rsvps where event_id=10) then raise exception 'Withdraw failed'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into events(title,starts_at,place) values('Admin erstellt',now()+interval '10 days','Regensburg');
update events set cancelled=true where id=11;
do $$ begin if(select count(*) from event_rsvps)<>2 then raise exception 'Admin attendance list'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
select set_event_attendance(11,false);
reset role;
select 'PASS: event visibility, admin rights, RSVP isolation, duplicates, cancellation, past dates' as result;
