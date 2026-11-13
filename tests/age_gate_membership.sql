-- Mindestalter 16 beim Zugriff (Migration 20261113130000_age_gate_membership.sql).
-- Geprüft wird is_active_member(): daran hängen Mitgliederprofile lesen, Nachrichten schreiben,
-- Projekte anlegen und sich für Rollen melden.
-- Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_membership.sql
\set ON_ERROR_STOP on
set datestyle = 'ISO, YMD';

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- Stubs: nur das, was is_active_member() anfasst
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  created_at    timestamptz not null default now()
);
-- member_birthdates wie in 20261113120000_signup_birthdate.sql
create table public.member_birthdates (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birthdate  date not null,
  set_at     timestamptz not null default now()
);
revoke all on public.member_birthdates from anon, authenticated;

create function public.ban_active(b boolean, until timestamptz) returns boolean language sql immutable as $$
  select coalesce(b, false) and (until is null or until > now()) $$;
-- Die Beta-Bewerbung ist in diesem Test nie der Grund für eine Ablehnung.
create function public.beta_application_required() returns boolean language sql stable as $$ select false $$;

create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
-- Prüft is_active_member() aus der Sicht eines bestimmten Kontos.
create function public.test_member(uid text, want boolean, label text) returns void language plpgsql as $$
declare got boolean;
begin
  perform set_config('request.jwt.claim.sub', uid, true);
  select public.is_active_member() into got;
  if got is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): is_active_member() = % (erwartet %)', label, got, want;
  end if;
  raise notice 'OK: %', label;
end $$;

-- ---------- Die Migration ----------
\i supabase/migrations/20261113130000_age_gate_membership.sql

-- Stichtag: alles davor ist Bestand, alles danach braucht ein Geburtsdatum
\set vorher '''2026-11-01 12:00:00+01'''
\set nachher '''2026-11-14 12:00:00+01'''

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'bestand-ohne@x.de', now()),
  ('00000000-0000-0000-0000-000000000002', 'neu-ohne@x.de', now()),
  ('00000000-0000-0000-0000-000000000003', 'neu-mit@x.de', now()),
  ('00000000-0000-0000-0000-000000000004', 'neu-zu-jung@x.de', now()),
  ('00000000-0000-0000-0000-000000000005', 'neu-unbestaetigt@x.de', null),
  ('00000000-0000-0000-0000-000000000006', 'neu-gesperrt@x.de', now()),
  ('00000000-0000-0000-0000-000000000007', 'neu-abgelehnt@x.de', now()),
  ('00000000-0000-0000-0000-000000000008', 'bestand-mit@x.de', now());
insert into auth.users (id, email, email_confirmed_at, phone_confirmed_at) values
  ('00000000-0000-0000-0000-000000000009', null, null, now());

insert into public.profiles (id, status, created_at, banned) values
  ('00000000-0000-0000-0000-000000000001', 'approved', :vorher, false),
  ('00000000-0000-0000-0000-000000000002', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000003', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000004', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000005', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000006', 'pending',  :nachher, true),
  ('00000000-0000-0000-0000-000000000007', 'rejected', :nachher, false),
  ('00000000-0000-0000-0000-000000000008', 'approved', :vorher, false),
  ('00000000-0000-0000-0000-000000000009', 'pending',  :nachher, false);

insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000003', (current_date - interval '20 years')::date),
  -- unter 16: so etwas kann nur über admin_set_birthdate() entstehen
  ('00000000-0000-0000-0000-000000000004', (current_date - interval '10 years')::date),
  ('00000000-0000-0000-0000-000000000008', (current_date - interval '30 years')::date),
  ('00000000-0000-0000-0000-000000000009', (current_date - interval '20 years')::date);

-- ---------- Bestandsschutz ----------
select public.test_member('00000000-0000-0000-0000-000000000001', true,
  'Bestandskonto ohne Geburtsdatum behält den Zugang (es ist nie gefragt worden)');
select public.test_member('00000000-0000-0000-0000-000000000008', true,
  'Bestandskonto mit Geburtsdatum behält den Zugang');

-- ---------- Die Lücke, die geschlossen wird ----------
select public.test_member('00000000-0000-0000-0000-000000000002', false,
  'Neues Konto ohne Geburtsdatum darf NICHT schreiben und keine Profile lesen');
select public.test_member('00000000-0000-0000-0000-000000000003', true,
  'Neues Konto mit gültigem Geburtsdatum darf mitmachen, auch während es auf die Freischaltung wartet');
select public.test_member('00000000-0000-0000-0000-000000000004', false,
  'Neues Konto mit Geburtsdatum unter 16 darf nicht mitmachen');

-- Geburtsdatum nachtragen schaltet den Zugang frei
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000002', (current_date - interval '16 years')::date);
select public.test_member('00000000-0000-0000-0000-000000000002', true,
  'Nachgetragenes Datum (genau 16 heute) schaltet den Zugang frei');

-- ---------- Die alten Bedingungen gelten unverändert weiter ----------
select public.test_member('00000000-0000-0000-0000-000000000005', false,
  'Unbestätigte E-Mail bleibt ein Ausschlussgrund, auch ohne Geburtsdatum-Frage');
select public.test_member('00000000-0000-0000-0000-000000000006', false,
  'Gesperrtes Konto bleibt gesperrt');
select public.test_member('00000000-0000-0000-0000-000000000007', false,
  'Abgelehntes Konto bleibt draußen');
select public.test_member('00000000-0000-0000-0000-000000000009', true,
  'Bestätigte Handynummer statt E-Mail zählt weiterhin');

-- Niemand angemeldet
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(public.is_active_member() = false, 'Ohne Anmeldung kein Zugang');

-- ---------- Der Stichtag ist fest, nicht now() ----------
-- Ein zweiter Lauf der Migration darf nicht plötzlich weitere Konten als Bestand zählen.
\i supabase/migrations/20261113130000_age_gate_membership.sql
select public.test_check(public.age_check_start() = timestamptz '2026-11-14 00:00:00+01',
  'Der Stichtag bleibt nach einem zweiten Lauf derselbe');
-- Der Stichtag ist der 14., nicht der 13.: Konten vom 13. wurden nie nach dem Geburtsdatum
-- gefragt, weil das Formular da noch nicht live war. Sie gehören zum Bestand.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000010', 'kurz-vorher@x.de', now()),
  ('00000000-0000-0000-0000-000000000011', 'ganz-neu@x.de', now());
insert into public.profiles (id, status, created_at) values
  ('00000000-0000-0000-0000-000000000010', 'pending', timestamptz '2026-11-13 22:00:00+01'),
  ('00000000-0000-0000-0000-000000000011', 'pending', timestamptz '2026-11-20 10:00:00+01');
select public.test_member('00000000-0000-0000-0000-000000000010', true,
  'Konto vom 13.11. zählt zum Bestand, es konnte noch gar nicht gefragt werden');
select public.test_member('00000000-0000-0000-0000-000000000011', false,
  'Konto nach dem Stichtag ohne Geburtsdatum bleibt draußen');

-- ---------- Keine Sackgasse: wer kein Geburtsdatum hat, kommt an sein eigenes Profil ----------
-- Das ist die wichtigste Zusicherung dieser Migration. Ohne sie wäre ein neues Konto ohne
-- Geburtsdatum eingesperrt: kein Zugriff, und keine Möglichkeit, das Datum nachzutragen.
-- Darum stehen hier die echten Policies aus 20261103180000_website_ban.sql, nicht nur die Funktion.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (name) on public.profiles to authenticated;
create function public.is_admin() returns boolean language sql stable as $$ select false $$;
create function public.is_approved_member() returns boolean language sql stable as $$ select false $$;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (
    id = (select auth.uid())
    or (not public.ban_active(banned, banned_until) and status = 'approved'
        and (select public.is_approved_member()))
    or (select public.is_admin())
  );
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (not public.ban_active(banned, banned_until) and status <> 'rejected' and (select public.is_active_member()));
create policy "Eigenes Profil bearbeiten" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and not public.ban_active(banned, banned_until))
  with check (id = (select auth.uid()) and not public.ban_active(banned, banned_until));

-- 0011 ist nach dem Stichtag entstanden und hat kein Geburtsdatum: is_active_member() ist false.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select public.test_check(public.is_active_member() = false,
  'Ausgangslage: neues Konto ohne Geburtsdatum ist kein aktives Mitglied');
select public.test_check(
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000011'),
  'Es sieht trotzdem sein EIGENES Profil (sonst wäre die Profilseite leer)');
update public.profiles set name = 'Selbst geaendert' where id = '00000000-0000-0000-0000-000000000011';
select public.test_check(
  (select name from public.profiles where id = '00000000-0000-0000-0000-000000000011') = 'Selbst geaendert',
  'Es kann sein eigenes Profil bearbeiten');
select public.test_check(
  not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000003'),
  'Fremde Profile bleiben ihm verschlossen – genau das ist der Zweck der Sperre');
reset role;

-- Nach dem Nachtragen des Datums sieht es die anderen
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000011', (current_date - interval '22 years')::date);
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select public.test_check(
  exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000003'),
  'Nach dem Nachtragen des Geburtsdatums sieht es die anderen Profile – der Weg heraus funktioniert');
reset role;

-- ---------- Rechte ----------
-- Abmelden, sonst würde die Prüfung darunter die Sitzung von 0011 erben.
select set_config('request.jwt.claim.sub', '', false);
set role anon;
select public.test_check(public.is_active_member() = false, 'anon ist kein aktives Mitglied');
select public.test_check(public.age_check_start() is not null, 'age_check_start() ist für anon aufrufbar (Policies brauchen das)');
reset role;
set role authenticated;
select public.test_check(
  (select has_table_privilege('authenticated', 'public.member_birthdates', 'select')) = false,
  'member_birthdates bleibt für Mitglieder ungelesen – die Prüfung läuft nur in der Funktion');
reset role;

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Mindestalter beim Zugriff)'; end $$;
