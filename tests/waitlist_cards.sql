-- Regressionstest für supabase/011_waitlist_cards.sql, 012_waitlist_cards_more.sql 013_waitlist_perks.sql 014_admin_actions.sql 015_public_cards.sql, 016_account_cards.sql und 017_security.sql
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
-- 9) Migration 013: Wunsch-Link und Einladungen
\i supabase/013_waitlist_perks.sql
set role anon;
do $$ declare r text; begin
  r := public.submit_waitlist_card('h1@example.com', 'A', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', 'Alex');
  if r <> 'ok' then raise exception 'Wunsch-Link nicht ok: %', r; end if;
  r := public.submit_waitlist_card('h2@example.com', 'B', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', 'alex');
  if r <> 'taken' then raise exception 'doppelter Wunsch-Link nicht erkannt: %', r; end if;
  r := public.submit_waitlist_card('h3@example.com', 'C', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', 'admin');
  if r <> 'invalid' then raise exception 'reservierter Name angenommen: %', r; end if;
  r := public.submit_waitlist_card('h4@example.com', 'D', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', '<script>');
  if r <> 'invalid' then raise exception 'ungültiger Name angenommen: %', r; end if;
  r := public.submit_waitlist_card('h1@example.com', 'A2', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', 'alex');
  if r <> 'ok' then raise exception 'eigener Link beim Aktualisieren abgelehnt: %', r; end if;
  -- alte Aufrufform ohne Wunsch-Link
  r := public.submit_waitlist_card('h5@example.com', 'E', 'Design', '{}', 5, 'Mitgründer:in', '', 'de');
  if r <> '' then raise exception 'ohne Link sollte leer zurückkommen: %', r; end if;
end $$;
do $$ declare c1 text; c2 text; begin
  c1 := public.get_referral_code('Werber@Example.com');
  c2 := public.get_referral_code('werber@example.com');
  if c1 !~ '^[a-z0-9]{8}$' or c1 <> c2 then raise exception 'Code falsch oder nicht stabil: % %', c1, c2; end if;
  perform public.track_referral('neu1@example.com', c1);
  perform public.track_referral('neu1@example.com', c1);          -- doppelt zählt nicht
  perform public.track_referral('werber@example.com', c1);        -- sich selbst zählt nicht
  perform public.track_referral('neu2@example.com', 'zzzzzzzz');  -- unbekannter Code
  perform public.track_referral('neu3@example.com', c1);
end $$;
do $$ begin
  perform count(*) from public.waitlist_referrals;
  raise exception 'anon darf Einladungen nicht lesen';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin
  if (select handle from public.waitlist_cards where email = 'h1@example.com') <> 'alex' then raise exception 'Link nicht gespeichert'; end if;
  if (select handle from public.waitlist_cards where email = 'h2@example.com') is not null then raise exception 'vergebener Link übernommen'; end if;
  if (select count(*) from public.waitlist_referrals) <> 2 then raise exception 'Einladungen falsch gezählt: %', (select count(*) from public.waitlist_referrals); end if;
end $$;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000002';
do $$ begin if (select count(*) from public.waitlist_referrals) <> 0 then raise exception 'Mitglied sieht Einladungen'; end if; end $$;
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin if (select count(*) from public.waitlist_referrals) <> 2 then raise exception 'Admin sieht Einladungen nicht'; end if; end $$;
reset role;
-- 10) Migration 014: Gutschreiben nur durch Admins, nur credited_at
\i supabase/014_admin_actions.sql
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000002';
update public.waitlist_referrals set credited_at = now();
reset role;
do $$ begin if (select count(*) from public.waitlist_referrals where credited_at is not null) <> 0 then raise exception 'Mitglied konnte gutschreiben'; end if; end $$;
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000001';
update public.waitlist_referrals set credited_at = now() where email = 'neu1@example.com';
do $$ begin
  update public.waitlist_referrals set email = 'fake@example.com' where email = 'neu3@example.com';
  raise exception 'Admin durfte Adresse ändern';
exception when insufficient_privilege then null; end $$;
-- Admin ändert Wunsch-Link; doppelte Vergabe scheitert am eindeutigen Index
update public.waitlist_cards set handle = 'neuer-name' where email = 'h1@example.com';
do $$ begin
  update public.waitlist_cards set handle = 'neuer-name' where email = 'h5@example.com';
  raise exception 'doppelter Wunsch-Link durch Admin';
exception when unique_violation then null; end $$;
reset role;
do $$ begin
  if (select count(*) from public.waitlist_referrals where credited_at is not null) <> 1 then raise exception 'Gutschrift nicht gespeichert'; end if;
  if (select handle from public.waitlist_cards where email = 'h1@example.com') <> 'neuer-name' then raise exception 'Admin-Linkänderung fehlt'; end if;
end $$;
-- 11) Migration 015: öffentliche Karten nur mit Zustimmung
\i supabase/015_public_cards.sql
set role anon;
do $$ declare j jsonb; r text; begin
  r := public.submit_waitlist_card('pub@example.com', 'Pia', 'Design', array['Figma'], 6, 'Mitgründer:in', 'Hallo', 'de',
       'Berlin', 'Remote', 'Profi', 'https://pia.dev', 'pia', true, '{"theme":"ocean","layout":"center"}'::jsonb);
  if r <> 'ok' then raise exception 'öffentliche Karte nicht gespeichert: %', r; end if;
  j := public.get_public_card('PIA');
  if (j->>'name') is distinct from 'Pia' or (j->'design'->>'theme') is distinct from 'ocean' then raise exception 'öffentliche Karte falsch: %', j; end if;
  if j ? 'email' or j ? 'note' or j ? 'status' then raise exception 'private Felder sichtbar: %', j; end if;
  j := public.get_public_card('neuer-name');                 -- reserviert, aber ohne Zustimmung
  if (j->>'reserved') is distinct from 'true' or j ? 'name' then raise exception 'Karte ohne Zustimmung sichtbar: %', j; end if;
  if public.get_public_card('frei-name') is not null then raise exception 'freier Name liefert Daten'; end if;
  if public.get_public_card('<x>') is not null then raise exception 'ungültiger Name liefert Daten'; end if;
  -- alte Aufrufform bleibt privat
  r := public.submit_waitlist_card('old@example.com', 'O', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', 'olaf');
  if (public.get_public_card('olaf')->>'reserved') is distinct from 'true' then raise exception 'Standard sollte privat sein'; end if;
  -- zu große Gestaltung wird verworfen, nicht gespeichert
  r := public.submit_waitlist_card('big@example.com', 'B', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', 'bigdesign', true,
       jsonb_build_object('x', repeat('a', 2000)));
  if (public.get_public_card('bigdesign')->'design') is distinct from '{}'::jsonb then raise exception 'zu große Gestaltung gespeichert'; end if;
end $$;
reset role;
-- 12) Migration 016: Karte gehört zum Konto
create table if not exists auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, encrypted_password text);
-- wie in Supabase: JWT-Angaben (aal) und eingerichtete 2FA-Faktoren
create or replace function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('test.aal', true), ''), 'aal1')) $$;
grant execute on function auth.jwt() to anon, authenticated;
create table if not exists auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
insert into auth.users values
  ('00000000-0000-0000-0000-000000000011', 'Pub@Example.com', now()),      -- hat Warteliste-Karte „pia“
  ('00000000-0000-0000-0000-000000000012', 'neu-konto@example.com', now()), -- noch keine Karte
  ('00000000-0000-0000-0000-000000000013', 'old@example.com', null);      -- E-Mail nicht bestätigt
update auth.users set encrypted_password = extensions.crypt('richtig-123', extensions.gen_salt('bf')) where id = '00000000-0000-0000-0000-000000000011';
alter table public.profiles add column if not exists headline text not null default '', add column if not exists about text not null default '',
  add column if not exists offer text not null default '', add column if not exists seek text not null default '',
  add column if not exists linkedin text not null default '', add column if not exists instagram text not null default '',
  add column if not exists website text not null default '', add column if not exists avatar_path text not null default '';
insert into public.profiles (id, is_admin, headline, about, offer, seek, website, avatar_path) values
  ('00000000-0000-0000-0000-000000000011', false, 'Design für Apps', 'Ich gestalte seit 5 Jahren.', 'UI, Branding', 'Ein Team', 'https://pia.dev', '00000000-0000-0000-0000-000000000011/a.jpg')
  on conflict do nothing;
\i supabase/016_account_cards.sql
-- Gäste dürfen nichts davon
set role anon;
do $$ begin perform public.get_my_card(); raise exception 'anon darf get_my_card'; exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
-- a) Konto mit Warteliste-E-Mail übernimmt die Karte
set test.uid = '00000000-0000-0000-0000-000000000011';
do $$ declare j jsonb; begin
  j := public.get_my_card();
  if (j->>'name') is distinct from 'Pia' or (j->>'handle') is distinct from 'pia' then raise exception 'Karte nicht übernommen: %', j; end if;
  if j ? 'email' or j ? 'note' or j ? 'status' then raise exception 'Admin-Felder sichtbar: %', j; end if;
end $$;
-- b) speichern: Name ändern, Link „mia“ (vergeben) wird abgelehnt, alter Link bleibt
do $$ declare r text; begin
  r := public.save_my_card('Pia K', 'Design', array['Figma'], 8, 'Mitgründer:in', 'Neu', 'de', 'Berlin', 'Remote', 'Profi', 'pia.dev', 'pub-taken-test', true, '{"theme":"sunset"}');
  if r <> 'ok' then raise exception 'Speichern fehlgeschlagen: %', r; end if;
end $$;
reset role;
insert into public.waitlist_cards (email, name, role, hours, looking, handle) values ('x@y.de', 'X', 'Design', 3, 'Mitgründer:in', 'besetzt');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000011';
do $$ declare r text; j jsonb; begin
  r := public.save_my_card('Pia K', 'Design', array['Figma'], 8, 'Mitgründer:in', 'Neu', 'de', 'Berlin', 'Remote', 'Profi', '', 'besetzt', true, null);
  if r <> 'taken' then raise exception 'vergebener Link nicht erkannt: %', r; end if;
  j := public.get_my_card();
  if (j->>'handle') is distinct from 'pub-taken-test' then raise exception 'alter Link verloren: %', j; end if;
end $$;
-- c) Konto ohne Karte legt beim Speichern eine an
set test.uid = '00000000-0000-0000-0000-000000000012';
do $$ declare r text; j jsonb; begin
  if public.get_my_card() is not null then raise exception 'sollte keine Karte haben'; end if;
  r := public.save_my_card('Neu', 'Entwicklung', array['Go'], 10, 'ein Projekt zum Mitbauen', '', 'de', '', 'Hybrid', 'Einsteiger', '', 'neu-konto', false, null);
  j := public.get_my_card();
  if r <> 'ok' or (j->>'name') is distinct from 'Neu' or (j->>'is_public')::boolean then raise exception 'Neuanlage falsch: % %', r, j; end if;
end $$;
-- d) unbestätigte E-Mail übernimmt keine fremde Karte
set test.uid = '00000000-0000-0000-0000-000000000013';
do $$ begin
  if public.get_my_card() is not null then raise exception 'unbestätigte E-Mail hat Karte übernommen'; end if;
  perform public.save_my_card('Hack', 'Design', '{}', 5, 'Mitgründer:in', '', 'de', '', '', '', '', '', false, null);
  raise exception 'unbestätigte E-Mail durfte speichern';
exception when insufficient_privilege then null; end $$;
-- e) Mitglied kann fremde Karten weder lesen noch direkt ändern
set test.uid = '00000000-0000-0000-0000-000000000012';
do $$ begin if (select count(*) from public.waitlist_cards) <> 0 then raise exception 'Mitglied sieht Karten'; end if; end $$;
reset role;
do $$ begin
  if (select name from public.waitlist_cards where email = 'old@example.com') <> 'O' then raise exception 'fremde Karte verändert'; end if;
  if (select user_id from public.waitlist_cards where email = 'old@example.com') is not null then raise exception 'fremde Karte übernommen'; end if;
  if (select status from public.waitlist_cards where email = 'pub@example.com') <> 'neu' then raise exception 'Stand verändert'; end if;
end $$;
-- f) öffentliches Profil mit Profilinfos, ohne private Felder
set role anon;
do $$ declare j jsonb; begin
  j := public.get_public_card('pub-taken-test');
  if (j->'profile'->>'about') is distinct from 'Ich gestalte seit 5 Jahren.' or (j->'profile'->>'avatar_path') is null then raise exception 'Profilinfos fehlen: %', j; end if;
  if j ? 'email' or (j->'profile') ? 'status' or (j->'profile') ? 'is_admin' then raise exception 'private Felder sichtbar: %', j; end if;
  if (public.get_public_card('neu-konto')->>'reserved') is distinct from 'true' then raise exception 'nicht öffentliche Karte sichtbar'; end if;
end $$;
reset role;
-- 13) Migration 017: 2FA durchsetzen und Passwort prüfen
grant select on public.profiles to authenticated;
alter table public.profiles enable row level security;
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles for select to authenticated using (true);
\i supabase/017_security.sql
grant select, insert, delete on public.password_checks to authenticated;  -- wie in Supabase: Rechte da, RLS entscheidet
-- Pia richtet 2FA ein (bestätigter Faktor)
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-000000000011', 'verified'), ('00000000-0000-0000-0000-000000000012', 'unverified');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-000000000011';
set test.aal = 'aal1';
do $$ begin
  if (select count(*) from public.profiles) <> 0 then raise exception 'ohne 2FA-Code Profile lesbar'; end if;
  begin perform public.get_my_card(); raise exception 'ohne 2FA-Code Karte lesbar'; exception when insufficient_privilege then null; end;
  begin perform public.verify_my_password('richtig-123'); raise exception 'ohne 2FA-Code Passwort prüfbar'; exception when insufficient_privilege then null; end;
  begin perform public.delete_my_account(); raise exception 'ohne 2FA-Code Konto löschbar'; exception when raise_exception then
    if sqlerrm not like '%2FA%' then raise; end if; end;
end $$;
set test.aal = 'aal2';
do $$ begin
  if (select count(*) from public.profiles) = 0 then raise exception 'mit 2FA-Code keine Profile'; end if;
  if public.get_my_card() is null then raise exception 'mit 2FA-Code keine Karte'; end if;
  if public.verify_my_password('falsch') <> 'wrong' then raise exception 'falsches Passwort akzeptiert'; end if;
  if public.verify_my_password('richtig-123') <> 'ok' then raise exception 'richtiges Passwort abgelehnt'; end if;
  for i in 1..5 loop perform public.verify_my_password('falsch'); end loop;
  if public.verify_my_password('richtig-123') <> 'limit' then raise exception 'keine Begrenzung nach 5 Fehlversuchen'; end if;
end $$;
-- Konto ohne bestätigten Faktor: aal1 reicht, kein Passwort -> 'none'
set test.uid = '00000000-0000-0000-0000-000000000012';
set test.aal = 'aal1';
do $$ begin
  if (select count(*) from public.profiles) = 0 then raise exception 'ohne 2FA blockiert'; end if;
  if public.verify_my_password('x') <> 'none' then raise exception 'Konto ohne Passwort falsch erkannt'; end if;
  if (select count(*) from public.password_checks) <> 0 then raise exception 'Fehlversuche lesbar'; end if;
end $$;
reset role;
set test.uid = '00000000-0000-0000-0000-000000000001';
do $$ begin
  if not public.is_admin() then raise exception 'Admin ohne 2FA verliert Rechte'; end if;
  insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-000000000001', 'verified');
  if public.is_admin() then raise exception 'Admin mit 2FA ohne Code hat Rechte'; end if;
  perform set_config('test.aal', 'aal2', true);
  if not public.is_admin() then raise exception 'Admin mit 2FA-Code ohne Rechte'; end if;
end $$;
\echo 'waitlist cards ok'
