-- Regressionstest für supabase/018_open_projects_messages.sql (Projekte und Nachrichten mit Konto).
-- Nur in einer LEEREN, SEPARATEN lokalen PostgreSQL-Datenbank mit den Rollen anon und authenticated ausführen,
-- aus dem Repository-Ordner:  psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/projects_messages.sql
\set QUIET on
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, email_confirmed_at timestamptz, phone_confirmed_at timestamptz);
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create publication supabase_realtime;  -- gibt es in Supabase schon
\i supabase/schema.sql
\i supabase/003_community.sql
\i supabase/009_projects.sql
\i supabase/018_open_projects_messages.sql
-- Personen: A freigeschaltet, B neu (bestätigt), C neu (E-Mail nicht bestätigt), D abgelehnt, E neu per Handy
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at, phone_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.de', '{"name":"Anna","headline":"A"}', now(), null),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.de', '{"name":"Ben","headline":"B"}', now(), null),
  ('00000000-0000-0000-0000-00000000000c', 'c@x.de', '{"name":"Cem","headline":"C"}', null, null),
  ('00000000-0000-0000-0000-00000000000d', 'd@x.de', '{"name":"Dora","headline":"D"}', now(), null),
  ('00000000-0000-0000-0000-00000000000e', null, '{"name":"Emil","headline":"E"}', null, now());
update public.profiles set status = 'approved' where name = 'Anna';
update public.profiles set status = 'rejected' where name = 'Dora';
set role authenticated;
-- B (neu, nicht freigeschaltet) legt ein Projekt mit Rolle an und schreibt A
set test.uid = '00000000-0000-0000-0000-00000000000b';
do $$ declare pid bigint; begin
  insert into public.projects (title, pitch) values ('Loopr', 'App für Bands') returning id into pid;
  insert into public.project_roles (project_id, name) values (pid, 'iOS');
  insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000a', 'Hi Anna');
  if (select count(*) from public.profiles where status = 'pending') < 2 then raise exception 'B sieht andere neue Profile nicht'; end if;
  if exists (select 1 from public.profiles where name = 'Dora') then raise exception 'abgelehntes Profil sichtbar'; end if;
end $$;
-- B darf nicht an Abgelehnte oder sich selbst schreiben
do $$ begin
  insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000d', 'x');
  raise exception 'Nachricht an Abgelehnte erlaubt';
exception when insufficient_privilege or check_violation then null; end $$;
-- A (freigeschaltet) sieht B (Absender) und antwortet; meldet sich für die Rolle
set test.uid = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if not exists (select 1 from public.profiles where name = 'Ben') then raise exception 'A sieht Absender nicht'; end if;
  if not exists (select 1 from public.projects where title = 'Loopr') then raise exception 'A sieht Projekt nicht'; end if;
  insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000b', 'Hi Ben');
  insert into public.project_interest (role_id, note) select id, 'Bin dabei' from public.project_roles where name = 'iOS';
end $$;
-- E (nur Handy bestätigt) darf auch
set test.uid = '00000000-0000-0000-0000-00000000000e';
do $$ begin insert into public.projects (title, pitch) values ('E-Projekt', 'x'); end $$;
-- C (E-Mail unbestätigt) und D (abgelehnt) dürfen nichts
set test.uid = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  begin insert into public.projects (title, pitch) values ('Spam', 'x'); raise exception 'unbestätigt: Projekt erlaubt'; exception when insufficient_privilege then null; end;
  begin insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000a', 'x'); raise exception 'unbestätigt: Nachricht erlaubt'; exception when insufficient_privilege then null; end;
  if exists (select 1 from public.profiles where name = 'Ben') then raise exception 'unbestätigt sieht neue Profile'; end if;
end $$;
set test.uid = '00000000-0000-0000-0000-00000000000d';
do $$ begin
  begin insert into public.projects (title, pitch) values ('Spam', 'x'); raise exception 'abgelehnt: Projekt erlaubt'; exception when insufficient_privilege then null; end;
end $$;
-- Gäste: nur öffentliche Projekte, nur freigeschaltete öffentliche Profile
reset role; set role anon; set test.uid = '';
do $$ begin
  if exists (select 1 from public.projects where title = 'Loopr') then raise exception 'Gast sieht nicht öffentliches Projekt'; end if;
  if exists (select 1 from public.profiles where status = 'pending') then raise exception 'Gast sieht neue Profile'; end if;
end $$;
reset role;
-- Grenzen: 5 Projekte/Tag, 3 neue Gespräche/Stunde, 30 Nachrichten/Stunde
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
  select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'n' || i || '@x.de', jsonb_build_object('name', 'N' || i, 'headline', 'n'), now()
  from generate_series(1, 6) i;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  for i in 1..4 loop insert into public.projects (title, pitch) values ('P' || i, 'x'); end loop;  -- jetzt 5
  begin insert into public.projects (title, pitch) values ('P6', 'x'); raise exception '6. Projekt erlaubt'; exception when raise_exception then
    if sqlerrm not like '%5 Projekte%' then raise; end if; end;
  -- A zählt nicht als neues Gespräch (A hat B geschrieben); zwei neue + A ok, das dritte neue noch ok, das vierte nicht
  insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-000000000101', 'x');
  insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-000000000102', 'x');
  insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000a', 'nochmal');
  begin insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-000000000103', 'x'); raise exception '4. neues Gespräch erlaubt'; exception when raise_exception then
    if sqlerrm not like '%3 neue Gespräche%' then raise; end if; end;
  for i in 1..30 loop insert into public.messages (recipient_id, body) values ('00000000-0000-0000-0000-00000000000a', 'm' || i); end loop;
  raise exception '31. Nachricht erlaubt';
exception when raise_exception then
  if sqlerrm not like '%sehr viele Nachrichten%' then raise; end if;
end $$;
reset role;
\echo 'projects messages ok'
