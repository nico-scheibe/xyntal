-- Regressionstest für supabase/011_waitlist_cards.sql und 012_waitlist_cards_more.sql
-- Nur in einer LEEREN, SEPARATEN lokalen PostgreSQL-Datenbank mit den Rollen anon und authenticated ausführen,
-- aus dem Repository-Ordner:  psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/waitlist_cards.sql
-- Simuliert auth.uid() und eine vereinfachte profiles-Tabelle. Niemals im produktiven Projekt ausführen.
\set QUIET on
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table if not exists public.profiles (id uuid primary key, is_admin boolean not null default false);
insert into public.profiles values ('00000000-0000-0000-0000-000000000001', true), ('00000000-0000-0000-0000-000000000002', false) on conflict do nothing;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false); $$;
grant usage on schema public to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;

\i supabase/011_waitlist_cards.sql
-- wie in Supabase: Tabellenrechte für authenticated, RLS entscheidet
grant select, update, delete on public.waitlist_cards to authenticated;

-- 1) Gast speichert Karte
set role anon;
select public.submit_waitlist_card('Test@Example.com', 'Nico', 'Gründung', array['Swift', ' ', 'Pitch', 'a', 'b', 'c'], 12, 'ein Team für meine Idee', 'Ich baue Xyntal.', 'de');
-- 2) Gast darf nichts lesen
do $$ begin
  perform count(*) from public.waitlist_cards;
  raise exception 'anon darf Karten nicht lesen';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ declare r record; begin
  select * into r from public.waitlist_cards;
  if r.email <> 'test@example.com' then raise exception 'E-Mail nicht normalisiert: %', r.email; end if;
  if cardinality(r.skills) <> 4 or r.skills[1] <> 'Swift' or r.skills[2] <> 'Pitch' then raise exception 'Skills falsch: %', r.skills; end if;
end $$;

-- 3) Ungültige Werte werden abgelehnt
set role anon;
do $$ begin
  perform public.submit_waitlist_card('x@y.de', 'A', 'Hacker', '{}', 5, 'Mitgründer:in', '', 'de');
  raise exception 'ungültige Rolle angenommen';
exception when check_violation then null; end $$;
do $$ begin
  perform public.submit_waitlist_card('x@y.de', 'A', 'Design', '{}', 99, 'Mitgründer:in', '', 'de');
  raise exception 'ungültige Stunden angenommen';
exception when check_violation then null; end $$;
-- 4) Direktes Einfügen ist nicht erlaubt
do $$ begin
  insert into public.waitlist_cards (email, name, role, hours, looking) values ('z@z.de', 'Z', 'Design', 3, 'Mitgründer:in');
  raise exception 'direktes Einfügen erlaubt';
exception when insufficient_privilege then null; end $$;
-- 5) Innerhalb von 30 Minuten aktualisierbar
select public.submit_waitlist_card('test@example.com', 'Nico S', 'Design', '{}', 8, 'Mitgründer:in', '', 'en');
reset role;
do $$ begin if (select name from public.waitlist_cards where email = 'test@example.com') <> 'Nico S' then raise exception 'Update innerhalb 30 Min. fehlgeschlagen'; end if; end $$;
-- 6) Nach 30 Minuten nicht mehr überschreibbar
update public.waitlist_cards set created_at = now() - interval '2 hours';
set role anon;
select public.submit_waitlist_card('test@example.com', 'Fremd', 'Vertrieb', '{}', 3, 'Mitgründer:in', '', 'de');
reset role;
do $$ begin if (select name from public.waitlist_cards where email = 'test@example.com') <> 'Nico S' then raise exception 'fremde Karte überschrieben'; end if; end $$;

-- 7) Eingeloggtes Nicht-Admin-Mitglied sieht nichts, Admin sieht, bearbeitet und löscht
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000002';
do $$ begin if (select count(*) from public.waitlist_cards) <> 0 then raise exception 'Mitglied sieht Karten'; end if; end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin if (select count(*) from public.waitlist_cards) <> 1 then raise exception 'Admin sieht Karten nicht'; end if; end $$;
update public.waitlist_cards set status = 'kontaktiert', note = 'passt zu Loopr';
do $$ begin if (select status from public.waitlist_cards) <> 'kontaktiert' then raise exception 'Admin-Update fehlgeschlagen'; end if; end $$;
delete from public.waitlist_cards;
reset role;
do $$ begin if (select count(*) from public.waitlist_cards) <> 0 then raise exception 'Admin-Löschen fehlgeschlagen'; end if; end $$;
-- 8) Migration 012: Stadt, Arbeitsweise, Erfahrung, Link
\i supabase/012_waitlist_cards_more.sql
set role anon;
-- alte Aufrufform (8 Parameter) funktioniert weiter
select public.submit_waitlist_card('alt@example.com', 'Alt', 'Design', '{}', 5, 'Mitgründer:in', '', 'de');
-- neue Felder
select public.submit_waitlist_card('neu@example.com', 'Neu', 'Entwicklung', array['Swift'], 10, 'Mitgründer:in', 'Hi', 'de',
  ' Regensburg ', 'Remote', 'Profi', 'https://github.com/neu');
-- ungültiger Link wird verworfen, nicht abgelehnt
select public.submit_waitlist_card('link@example.com', 'L', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', 'Hybrid', 'Einsteiger', 'javascript:alert(1)');
do $$ begin
  perform public.submit_waitlist_card('x2@y.de', 'A', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', 'Mond', '', '');
  raise exception 'ungültige Arbeitsweise angenommen';
exception when check_violation then null; end $$;
do $$ begin
  perform public.submit_waitlist_card('x3@y.de', 'A', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', 'Gott', '');
  raise exception 'ungültige Erfahrung angenommen';
exception when check_violation then null; end $$;
reset role;
do $$ declare r record; begin
  select * into r from public.waitlist_cards where email = 'neu@example.com';
  if r.city <> 'Regensburg' or r.mode <> 'Remote' or r.level <> 'Profi' or r.link <> 'https://github.com/neu' then raise exception 'neue Felder falsch: % % % %', r.city, r.mode, r.level, r.link; end if;
  if (select link from public.waitlist_cards where email = 'link@example.com') <> '' then raise exception 'unsicherer Link gespeichert'; end if;
  if (select mode from public.waitlist_cards where email = 'alt@example.com') <> '' then raise exception 'Standardwert fehlt'; end if;
end $$;
\echo 'waitlist cards ok'
