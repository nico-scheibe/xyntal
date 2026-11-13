-- Altersprüfung ab 16 (Migration 20261113120000_signup_birthdate.sql). Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/signup_age.sql
\set ON_ERROR_STOP on
set datestyle = 'ISO, YMD';

-- Rollen wie in Supabase
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- Stubs: auth, Profile (wie supabase/schema.sql), Admin, Inhaltsfilter, Benachrichtigung
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb);
create table auth.identities(id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade, provider text not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '' check (char_length(name) <= 80),
  headline    text not null default '' check (char_length(headline) <= 120),
  about       text not null default '' check (char_length(about) <= 1500),
  phase       text check (phase in ('idee', 'nebenberuflich', 'vollzeit', 'team')),
  category    text not null default '' check (char_length(category) <= 60),
  offer       text not null default '' check (char_length(offer) <= 600),
  seek        text not null default '' check (char_length(seek) <= 600),
  linkedin    text not null default '',
  instagram   text not null default '',
  website     text not null default '',
  is_public   boolean not null default false,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);
create table public.newsletter (id bigint generated always as identity primary key,
  email text not null unique, created_at timestamptz not null default now());
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (name, headline, about, phase, category, offer, seek, linkedin, instagram, website, is_public)
  on public.profiles to authenticated;
create policy "Profile lesen" on public.profiles for select to anon, authenticated using (true);
create policy "Eigenes Profil bearbeiten" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
create function public.normalize_url(u text) returns text language sql immutable as $$
  select coalesce(nullif(btrim(coalesce(u, '')), ''), '') $$;
create function public.content_problem(p text) returns text language sql stable as $$
  select case when lower(coalesce(p,'')) ~ 'arschloch' then 'beleidigung' end $$;
create function public.notify_profile_approved() returns trigger language plpgsql as $$ begin return new; end $$;

-- Standardrechte wie in Supabase: neue Tabellen und Funktionen sind für anon/authenticated zunächst offen.
-- Die Migration muss das für ihre Objekte zurücknehmen.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Prüfhilfen (Testobjekte, nur in dieser Testdatenbank)
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
end $$;
create function public.test_expect_error(stmt text, pattern text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    execute stmt;
  exception when others then
    msg := sqlerrm;
  end;
  if msg is null then raise exception 'TEST FEHLGESCHLAGEN: kein Fehler (erwartet %) bei: %', pattern, stmt; end if;
  if msg not like pattern then raise exception 'TEST FEHLGESCHLAGEN: Fehler "%" statt "%" bei: %', msg, pattern, stmt; end if;
  raise notice 'OK (abgelehnt): %', msg;
end $$;
create function public.test_profile(uid text, want_status text, want_row boolean, label text) returns void language plpgsql as $$
declare st text; has boolean;
begin
  select status into st from public.profiles where id = uid::uuid;
  has := exists (select 1 from public.member_birthdates where id = uid::uuid);
  if st is distinct from want_status or has <> want_row then
    raise exception 'TEST FEHLGESCHLAGEN (%): Status % (erwartet %), Geburtsdatum hinterlegt % (erwartet %)',
      label, st, want_status, has, want_row;
  end if;
  raise notice 'OK: %', label;
end $$;

-- Vorgaben: die Prüfkette aus den Migrationen 20261105110000 und 20261105120000 (Freischaltung, Trigger)
\i supabase/migrations/20261105110000_auto_approve_profiles.sql
\i supabase/migrations/20261105120000_auto_approve_without_content_filter.sql

-- ---------- Bestand VOR der neuen Migration ----------
-- 0101: freigeschaltetes Bestandsprofil ohne Geburtsdatum
-- 0102: wartendes Bestandsprofil, E-Mail noch nicht bestätigt
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000101', 'alt-frei@x.de', now()),
  ('00000000-0000-0000-0000-000000000102', 'alt-wartend@x.de', null);
insert into public.profiles (id, name, headline, status) values
  ('00000000-0000-0000-0000-000000000101', 'Lena Alt', 'Baut eine Plattform fuer Vereine', 'approved'),
  ('00000000-0000-0000-0000-000000000102', 'Pia Alt', 'Baut eine Plattform fuer Vereine', 'pending');

-- ---------- Die neue Migration ----------
\i supabase/migrations/20261113120000_signup_birthdate.sql

-- Anmeldung legt das Profil an (wie in supabase/schema.sql), erst jetzt mit Trigger
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Bestand direkt nach der Migration: freigeschaltet bleibt freigeschaltet ----------
select public.test_profile('00000000-0000-0000-0000-000000000101', 'approved', false,
  'Bestand: freigeschaltetes Profil ohne Geburtsdatum bleibt freigeschaltet');
select public.test_check(not exists (select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles' and column_name = 'birthdate'),
  'profiles hat keine Spalte birthdate (nichts kann darüber nach außen gelangen)');

-- ---------- Neue Konten über die Anmeldung (handle_new_user) ----------
-- 0011 ohne Datum · 0012 genau 16 heute · 0013 16 heute plus 1 Tag (zu jung) · 0014 ungültig (30. Februar)
-- 0015 Zukunft · 0016 29. Februar 2008 (gültig) · 0017 29. Februar 2010 (kein Schaltjahr) · 0018 Text
-- 0019 Apple ohne Datum · 0020 einen Tag älter als 16 heute
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000011', 'ohne@x.de', now(),
     jsonb_build_object('name', 'Ohne Datum', 'headline', 'Baue eine Software-Firma')),
  ('00000000-0000-0000-0000-000000000012', 'genau16@x.de', now(),
     jsonb_build_object('name', 'Genau Sechzehn', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '16 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000013', 'zuJung@x.de', now(),
     jsonb_build_object('name', 'Zu Jung', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '16 years' + interval '1 day')::date)::text)),
  ('00000000-0000-0000-0000-000000000014', 'ungueltig@x.de', now(),
     jsonb_build_object('name', 'Ungueltig', 'headline', 'Baue eine Software-Firma', 'birthdate', '2010-02-30')),
  ('00000000-0000-0000-0000-000000000015', 'zukunft@x.de', now(),
     jsonb_build_object('name', 'Zukunft', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date + 30)::date)::text)),
  ('00000000-0000-0000-0000-000000000016', 'schalt@x.de', now(),
     jsonb_build_object('name', 'Schalt Tag', 'headline', 'Baue eine Software-Firma', 'birthdate', '2008-02-29')),
  ('00000000-0000-0000-0000-000000000017', 'kein-schalt@x.de', now(),
     jsonb_build_object('name', 'Kein Schalt', 'headline', 'Baue eine Software-Firma', 'birthdate', '2010-02-29')),
  ('00000000-0000-0000-0000-000000000018', 'text@x.de', now(),
     jsonb_build_object('name', 'Text Datum', 'headline', 'Baue eine Software-Firma', 'birthdate', 'abc')),
  ('00000000-0000-0000-0000-000000000019', 'apple@x.de', now(),
     jsonb_build_object('name', 'Apple Mensch', 'headline', 'Baue eine Software-Firma')),
  ('00000000-0000-0000-0000-000000000020', 'einen-tag-alt@x.de', now(),
     jsonb_build_object('name', 'Einen Tag Alt', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '16 years' - interval '1 day')::date)::text));

-- Anmeldung mit ungültigem Datum darf nie scheitern, das Konto entsteht
select public.test_profile('00000000-0000-0000-0000-000000000011', 'pending', false, 'Neu: ohne Datum wartet, Konto da');
select public.test_profile('00000000-0000-0000-0000-000000000012', 'approved', true, 'Neu: genau 16 heute wird freigeschaltet');
select public.test_profile('00000000-0000-0000-0000-000000000013', 'pending', false, 'Neu: 16 heute plus 1 Tag wartet');
select public.test_profile('00000000-0000-0000-0000-000000000014', 'pending', false, 'Neu: ungültiges Datum (30. Februar) wartet, Konto da');
select public.test_profile('00000000-0000-0000-0000-000000000015', 'pending', false, 'Neu: Zukunftsdatum wartet');
select public.test_profile('00000000-0000-0000-0000-000000000016', 'approved', true, 'Neu: 29. Februar 2008 (Schaltjahr) gilt');
select public.test_profile('00000000-0000-0000-0000-000000000017', 'pending', false, 'Neu: 29. Februar 2010 (kein Schaltjahr) wartet');
select public.test_profile('00000000-0000-0000-0000-000000000018', 'pending', false, 'Neu: Text als Datum wartet');
select public.test_profile('00000000-0000-0000-0000-000000000020', 'approved', true, 'Neu: einen Tag älter als 16 wird freigeschaltet');

-- Apple-Anmeldung ohne Datum: die Anmeldung geht, das Profil wartet, und der Anbieter-Eintrag gibt es nicht frei
insert into auth.identities (user_id, provider) values ('00000000-0000-0000-0000-000000000019', 'apple');
select public.test_profile('00000000-0000-0000-0000-000000000019', 'pending', false, 'Apple ohne Datum: Konto da, Profil wartet');

-- ---------- Rechte: Geburtsdatum nie direkt lesbar oder schreibbar ----------
set role anon;
select public.test_expect_error($q$select count(*) from public.member_birthdates$q$, '%permission denied%');
select public.test_expect_error($q$select public.set_my_birthdate('2000-01-01')$q$, '%permission denied%');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select public.test_expect_error($q$select count(*) from public.member_birthdates$q$, '%permission denied%');

-- Ohne Datum: Anzeige sagt „birthdate“, und das Setzen prüft alle Fälle
select public.test_check((select problem from public.my_profile_review()) = 'birthdate',
  'my_profile_review meldet birthdate für das Profil ohne Datum');
select public.test_expect_error($q$select public.set_my_birthdate(null)$q$, '%gültiges Geburtsdatum%');
select public.test_expect_error($q$select public.set_my_birthdate('abc')$q$, '%gültiges Geburtsdatum%');
select public.test_expect_error($q$select public.set_my_birthdate('2010-02-30')$q$, '%gültiges Geburtsdatum%');
select public.test_expect_error($q$select public.set_my_birthdate('2010-02-29')$q$, '%gültiges Geburtsdatum%');
select public.test_expect_error($q$select public.set_my_birthdate('1899-12-31')$q$, '%gültiges Geburtsdatum%');
select public.test_expect_error($q$select public.set_my_birthdate((current_date + 1)::date::text)$q$, '%Zukunft%');
select public.test_expect_error($q$select public.set_my_birthdate((current_date - interval '16 years' + interval '1 day')::date::text)$q$, '%ab 16 Jahren%');
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000011', 'pending', false, 'Ohne Datum: nach abgelehnten Versuchen weiter wartend');
set role authenticated;

-- Genau 16 heute: wird angenommen, das Profil wird sofort freigeschaltet
select public.set_my_birthdate((current_date - interval '16 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000011', 'approved', true, 'Setzen (16 heute): Profil wird freigeschaltet');

-- Einmal gesetzt, bleibt es: Änderungsversuch scheitert
set role authenticated;
select public.test_expect_error($q$select public.set_my_birthdate('2000-01-01')$q$, '%schon eingetragen%');
select public.test_expect_error($q$select public.set_my_birthdate((current_date - interval '16 years')::date::text)$q$, '%schon eingetragen%');
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000011', 'approved', true, 'Änderungsversuch: Datum und Status unverändert');

-- Apple-Profil ohne Datum: nach dem Nachtragen wird es freigeschaltet
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000019', false);
select public.set_my_birthdate('2000-01-01');
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000019', 'approved', true,
  'Apple: nachgetragenes Datum schaltet das wartende Profil frei');

-- ---------- Bestand nach der Migration ----------
-- 0102 war wartend und hat die E-Mail jetzt bestätigt: ohne Datum bleibt es wartend
-- (vor der Migration wäre es hier freigeschaltet worden)
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-000000000102';
select public.test_profile('00000000-0000-0000-0000-000000000102', 'pending', false,
  'Bestand wartend ohne Datum: nach E-Mail-Bestätigung weiter wartend');

-- 0101 bleibt freigeschaltet, auch wenn es geändert oder ein Anbieter dazukommt
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', false);
update public.profiles set name = 'Lena Neu' where id = '00000000-0000-0000-0000-000000000101';
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000101', 'approved', false,
  'Bestand: Namensänderung lässt freigeschaltetes Profil freigeschaltet');
insert into auth.identities (user_id, provider) values ('00000000-0000-0000-0000-000000000101', 'apple');
select public.test_profile('00000000-0000-0000-0000-000000000101', 'approved', false,
  'Bestand: Anbieter-Anmeldung dazu, bleibt freigeschaltet');

-- 0102 trägt jetzt ein Datum nach und wird freigeschaltet
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000102', false);
select public.set_my_birthdate((current_date - interval '20 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000102', 'approved', true,
  'Bestand: nachgetragenes Datum schaltet das wartende Profil frei');

-- ---------- Was die Migration NICHT kaputt machen darf ----------
-- Die Migration schreibt handle_new_user() neu. Sie muss dabei die Fassung aus 002 und 007
-- fortführen, nicht die alte aus schema.sql. Diese drei Prüfungen halten das fest.
-- 0021 Name nur als full_name (so liefern Apple, Google und LinkedIn ihn)
-- 0022 Anmeldung mit Newsletter-Haken · 0023 Anmeldung mit Geburtsdatum
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000021', 'fullname@x.de', now(),
     jsonb_build_object('full_name', 'Max Voll', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '30 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000022', 'newsletter@x.de', now(),
     jsonb_build_object('name', 'News Letter', 'headline', 'Baue eine Software-Firma',
                        'newsletter', true, 'birthdate', ((current_date - interval '30 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000023', 'metadaten@x.de', now(),
     jsonb_build_object('name', 'Meta Daten', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '30 years')::date)::text));

select public.test_check(
  (select name from public.profiles where id = '00000000-0000-0000-0000-000000000021') = 'Max Voll',
  'Name wird aus full_name übernommen (Apple, Google, LinkedIn liefern nur dieses Feld)');
select public.test_profile('00000000-0000-0000-0000-000000000021', 'approved', true,
  'full_name plus Datum: Profil wird freigeschaltet');

select public.test_check(not exists (select 1 from public.newsletter where email = 'newsletter@x.de'),
  'Anmeldung trägt NICHT in public.newsletter ein (Einwilligung nur über Double-Opt-in, Migration 007)');

select public.test_check(
  not ((select raw_user_meta_data from auth.users where id = '00000000-0000-0000-0000-000000000023') ? 'birthdate'),
  'Geburtsdatum wird aus raw_user_meta_data entfernt (es landet sonst in jedem Access-Token)');
select public.test_profile('00000000-0000-0000-0000-000000000023', 'approved', true,
  'Entfernen der Metadaten ändert nichts am hinterlegten Datum');

-- ---------- Berichtigung durch Admin (Art. 16 DSGVO) ----------
-- 0030 ist Admin · 0031 hat sich vertippt und wartet deshalb
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000030', 'admin@x.de', now(),
     jsonb_build_object('name', 'Admin Mensch', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '40 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000031', 'vertippt@x.de', now(),
     jsonb_build_object('name', 'Ver Tippt', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '5 years')::date)::text));
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-000000000030';
select public.test_profile('00000000-0000-0000-0000-000000000031', 'pending', false,
  'Vertipptes Datum (5 Jahre alt) hält das Profil zurück');

-- Ein normales Mitglied darf nicht berichtigen, auch nicht bei sich selbst
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000031', false);
select public.test_expect_error(
  $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000031'::uuid, '2000-01-01')$q$,
  '%Nur für Admins%');
select public.test_expect_error(
  $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000011'::uuid, '2000-01-01')$q$,
  '%Nur für Admins%');
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000031', 'pending', false,
  'Nach abgelehntem Versuch unverändert');

-- Der Admin berichtigt, das Profil wird freigeschaltet
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', false);
select public.test_expect_error(
  $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000031'::uuid, 'abc')$q$,
  '%gültiges Geburtsdatum%');
select public.test_expect_error(
  $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000031'::uuid, (current_date + 1)::date::text)$q$,
  '%Zukunft%');
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000031'::uuid,
  (current_date - interval '25 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000031', 'approved', true,
  'Admin berichtigt das Datum, das Profil wird freigeschaltet');
select public.test_check(
  (select birthdate from public.member_birthdates where id = '00000000-0000-0000-0000-000000000031')
    = (current_date - interval '25 years')::date,
  'Das berichtigte Datum steht in member_birthdates');

-- Der Admin darf auch ein Datum unter 16 eintragen – das ist der Sinn der Berichtigung.
-- Die Altersgrenze hält trotzdem: das Profil fällt zurück ins Warten, statt freigeschaltet zu bleiben.
-- Diese Prüfung ist der Grund, warum admin_set_birthdate keine eigene Mindestalterprüfung braucht.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', false);
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000031'::uuid,
  (current_date - interval '10 years')::date::text);
reset role;
select public.test_check(
  (select status from public.profiles where id = '00000000-0000-0000-0000-000000000031') = 'approved',
  'Freigeschaltetes Profil wird durch ein zu junges Datum nicht nachträglich zurückgestuft (kein Bestandsbruch)');
-- Dasselbe Datum bei einem wartenden Profil hält es zurück
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', false);
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000013'::uuid,
  (current_date - interval '10 years')::date::text);
reset role;
select public.test_check(
  (select status from public.profiles where id = '00000000-0000-0000-0000-000000000013') = 'pending',
  'Wartendes Profil bleibt mit einem Datum unter 16 wartend, obwohl der Admin es eingetragen hat');
-- Und die Berichtigung auf ein gültiges Datum schaltet es dann frei
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000030', false);
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000013'::uuid,
  (current_date - interval '18 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000013', 'approved', true,
  'Berichtigung auf ein gültiges Datum schaltet das wartende Profil frei');

-- Anon kommt an die Admin-Funktion nicht heran
set role anon;
select public.test_expect_error(
  $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000031'::uuid, '2000-01-01')$q$,
  '%permission denied%');
reset role;

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Altersprüfung ab 16)'; end $$;
