-- Mindestalter 16 beim Veröffentlichen (Migration 20261113140000_age_gate_publishing.sql).
-- Geprüft wird: Karte und freie Seite werden ohne Geburtsdatum ab 16 nicht öffentlich,
-- lassen sich aber weiter anlegen und bearbeiten. Bestandskonten verlieren nichts.
-- Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_publishing.sql
\set ON_ERROR_STOP on
set datestyle = 'ISO, YMD';

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- ---------- Stubs: nur, was die beiden Migrationen anfassen ----------
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);
-- wie in 20261113120000_signup_birthdate.sql
create table public.member_birthdates (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birthdate  date not null,
  set_at     timestamptz not null default now()
);
revoke all on public.member_birthdates from anon, authenticated;
-- die für diese Migration wichtigen Spalten aus 011 und den Folgemigrationen
create table public.waitlist_cards (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  email      text,
  name       text not null default '',
  handle     text unique,
  is_public  boolean not null default false,
  page       jsonb,
  page_draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.page_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  page       jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on public.page_templates from anon, authenticated;

create function public.ban_active(b boolean, until timestamptz) returns boolean language sql immutable as $$
  select coalesce(b, false) and (until is null or until > now()) $$;
create function public.beta_application_required() returns boolean language sql stable as $$ select false $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
-- page_guard wie in 20261109120000_security_hardening.sql, nur ohne 2FA-Teil
create function public.page_guard() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  return v_uid;
end $$;
create function public.page_check(p jsonb, u uuid, t boolean default false) returns void language sql as $$ select $$;
-- aus 20261113120000_signup_birthdate.sql
create function public.birthdate_from_text(t text) returns date language plpgsql immutable set search_path = '' as $$
declare d date;
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  d := t::date;
  if d < date '1900-01-01' then return null; end if;
  return d;
exception when others then return null;
end $$;
create table public.member_birthdates_log(id int);
-- Grundlagen, die diese Migration neu schreibt (aus 20261107240000 und 20261113120000)
create or replace function public.get_invite_name(p_handle text)
returns text language sql stable security definer set search_path = '' as $$
  select c.name
    from public.waitlist_cards c join public.profiles p on p.id = c.user_id
   where c.handle = lower(trim(coalesce(p_handle, ''))) and c.user_id is not null
     and not public.ban_active(p.banned, p.banned_until);
$$;
grant execute on function public.get_invite_name(text) to anon, authenticated;
create or replace function public.admin_set_birthdate(p_id uuid, p_birthdate text)
returns void language plpgsql security definer set search_path = '' as $$
declare b date := public.birthdate_from_text(p_birthdate);
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if b is null then raise exception 'Bitte gib ein gültiges Geburtsdatum an (JJJJ-MM-TT).'; end if;
  insert into public.member_birthdates (id, birthdate) values (p_id, b)
    on conflict (id) do update set birthdate = excluded.birthdate, set_at = now();
end $$;
create or replace function public.list_page_templates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'handle', c.handle)), '[]'::jsonb)
  from (select * from public.page_templates order by created_at desc limit 60) t
  join public.profiles p on p.id = t.user_id
  left join public.waitlist_cards c on c.user_id = t.user_id
  where not public.ban_active(p.banned, p.banned_until);
$$;

create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
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
-- Ist die Karte dieses Kontos öffentlich?
create function public.test_card(uid text, want_public boolean, label text) returns void language plpgsql as $$
declare got boolean;
begin
  select is_public into got from public.waitlist_cards where user_id = uid::uuid;
  if got is null then raise exception 'TEST FEHLGESCHLAGEN (%): gar keine Karte vorhanden', label; end if;
  if got <> want_public then
    raise exception 'TEST FEHLGESCHLAGEN (%): is_public = % (erwartet %)', label, got, want_public;
  end if;
  raise notice 'OK: %', label;
end $$;

-- ---------- Zustand VOR den neuen Migrationen ----------
-- Der alte Trigger: Mitgliederkarten sind öffentlich, sobald sie einen Wunsch-Link haben.
\i supabase/migrations/20261107200000_cards_always_public.sql
-- Die vorige Altersmigration liefert age_check_start() und is_active_member().
\i supabase/migrations/20261113130000_age_gate_membership.sql

-- Der Stichtag ist jetzt der Augenblick, in dem 20261113140000 laeuft. Darum relative
-- Daten statt fester: der Test soll an jedem Tag dasselbe pruefen.
\set vorher '(now() - interval ''30 days'')'
\set nachher '(now() + interval ''30 days'')'

-- 0001 Bestand ohne Geburtsdatum · 0002 neu ohne · 0003 neu mit gültigem · 0004 neu, unter 16
-- 0005 Admin · 0006 neu mit gültigem Datum, für die Admin-Ausblendung
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'bestand@x.de', now()),
  ('00000000-0000-0000-0000-000000000002', 'neu-ohne@x.de', now()),
  ('00000000-0000-0000-0000-000000000003', 'neu-mit@x.de', now()),
  ('00000000-0000-0000-0000-000000000004', 'zu-jung@x.de', now()),
  ('00000000-0000-0000-0000-000000000005', 'admin@x.de', now()),
  ('00000000-0000-0000-0000-000000000006', 'ausblenden@x.de', now());
insert into public.profiles (id, status, created_at, is_admin) values
  ('00000000-0000-0000-0000-000000000001', 'approved', :vorher,  false),
  ('00000000-0000-0000-0000-000000000002', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000003', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000004', 'pending',  :nachher, false),
  ('00000000-0000-0000-0000-000000000005', 'approved', :vorher,  true),
  ('00000000-0000-0000-0000-000000000006', 'pending',  :nachher, false);
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000003', (current_date - interval '20 years')::date),
  -- unter 16: so etwas kann nur über admin_set_birthdate() entstehen
  ('00000000-0000-0000-0000-000000000004', (current_date - interval '10 years')::date),
  ('00000000-0000-0000-0000-000000000006', (current_date - interval '20 years')::date);

-- Karten entstehen noch unter dem ALTEN Trigger, also alle mit Wunsch-Link öffentlich.
insert into public.waitlist_cards (user_id, email, name, handle) values
  ('00000000-0000-0000-0000-000000000001', 'bestand@x.de', 'Bestand', 'bestand'),
  ('00000000-0000-0000-0000-000000000002', 'neu-ohne@x.de', 'Neu Ohne', 'neuohne'),
  ('00000000-0000-0000-0000-000000000003', 'neu-mit@x.de', 'Neu Mit', 'neumit'),
  ('00000000-0000-0000-0000-000000000004', 'zu-jung@x.de', 'Zu Jung', 'zujung'),
  ('00000000-0000-0000-0000-000000000006', 'ausblenden@x.de', 'Ausblenden', 'ausblenden');
-- Wartelisten-Karte ohne Konto, mit Wunsch-Link
insert into public.waitlist_cards (user_id, email, name, handle, is_public) values
  (null, 'warteliste@x.de', 'Warteliste', 'warteliste', true);

select public.test_card('00000000-0000-0000-0000-000000000002', true,
  'Ausgangslage: vor der Migration ist auch die Karte ohne Geburtsdatum öffentlich');

-- Vorlagen, die vor der Migration ohne Altersnachweis geteilt wurden
insert into public.page_templates (user_id, name, page) values
  ('00000000-0000-0000-0000-000000000004', 'Alt ohne Datum', '{"blocks":[]}'::jsonb),
  ('00000000-0000-0000-0000-000000000003', 'Alt mit Datum', '{"blocks":[]}'::jsonb),
  ('00000000-0000-0000-0000-000000000001', 'Alt Bestand', '{"blocks":[]}'::jsonb);

-- ---------- Die Migration, um die es geht ----------
\i supabase/migrations/20261113140000_age_gate_publishing.sql

-- ---------- Einmaliges Nachziehen bestehender Karten ----------
select public.test_card('00000000-0000-0000-0000-000000000001', true,
  'Bestandskarte ohne Geburtsdatum bleibt öffentlich (sie ist nie gefragt worden)');
select public.test_card('00000000-0000-0000-0000-000000000002', false,
  'Karte eines Kontos nach dem Stichtag ohne Geburtsdatum wird ausgeblendet');
select public.test_card('00000000-0000-0000-0000-000000000003', true,
  'Karte mit gültigem Geburtsdatum bleibt öffentlich');
select public.test_card('00000000-0000-0000-0000-000000000004', false,
  'Karte mit Geburtsdatum unter 16 wird ausgeblendet');
select public.test_check(
  (select is_public from public.waitlist_cards where user_id is null and handle = 'warteliste') = false,
  'Auch eine schon öffentliche Karte ohne Konto wird beim Nachziehen ausgeblendet');
select public.test_check(
  (select handle from public.waitlist_cards where email = 'warteliste@x.de') = 'warteliste',
  'Sie bleibt dabei gespeichert, mit ihrem Wunsch-Link');

-- Der Weg zurück: ein Konto übernimmt die Karte über die E-Mail (das macht get_my_card) und
-- hat ein Geburtsdatum. Dann geht sie wieder online.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000009', 'warteliste@x.de', now());
insert into public.profiles (id, status, created_at) values
  ('00000000-0000-0000-0000-000000000009', 'pending', :nachher);
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000009', (current_date - interval '21 years')::date);
update public.waitlist_cards set user_id = '00000000-0000-0000-0000-000000000009'
 where email = 'warteliste@x.de' and user_id is null;
select public.test_card('00000000-0000-0000-0000-000000000009', true,
  'Übernimmt ein Konto mit Geburtsdatum die Karte, ist sie wieder öffentlich');

-- Eine Wartelisten-Karte, die NACH der Migration entsteht, wird nicht mehr öffentlich.
-- submit_waitlist_card() ist an anon vergeben und setzte is_public frei: über das Formular
-- auf der Startseite konnte jeder ohne Konto und ohne Altersangabe eine Seite unter
-- xyntal.de/<name> ins Netz stellen. Genau diese Tür wird hier zugemacht.
insert into public.waitlist_cards (user_id, email, name, handle, is_public) values
  (null, 'warteliste2@x.de', 'Warteliste Zwei', 'warteliste2', true);
select public.test_check(
  (select is_public from public.waitlist_cards where handle = 'warteliste2') = false,
  'Neue Karte ohne Konto wird nicht öffentlich – auch nicht über das Formular der Startseite');
select public.test_check(
  (select handle from public.waitlist_cards where email = 'warteliste2@x.de') = 'warteliste2',
  'Der Wunsch-Link bleibt ihr trotzdem reserviert');

-- ---------- Speichern und Bearbeiten bleiben erlaubt ----------
-- Das ist die Bedingung, unter der die Sperre zumutbar ist: niemand verliert seine Arbeit.
update public.waitlist_cards set name = 'Neu Ohne, geaendert'
 where user_id = '00000000-0000-0000-0000-000000000002';
select public.test_check(
  (select name from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002')
    = 'Neu Ohne, geaendert',
  'Ohne Geburtsdatum lässt sich die Karte weiter bearbeiten');
select public.test_card('00000000-0000-0000-0000-000000000002', false,
  'Sie wird dabei aber nicht öffentlich');
select public.test_check(
  (select handle from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002')
    = 'neuohne',
  'Der Wunsch-Link bleibt reserviert, er geht nicht verloren');

-- Auch die freie Seite lässt sich weiter speichern – sichtbar wird sie nur über is_public
update public.waitlist_cards set page = '{"blocks":[]}'::jsonb
 where user_id = '00000000-0000-0000-0000-000000000002';
select public.test_check(
  (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002') is not null,
  'Die freie Seite lässt sich weiter speichern');
select public.test_card('00000000-0000-0000-0000-000000000002', false,
  'Die freie Seite wird dadurch nicht öffentlich (sie hängt an derselben Spalte)');

-- Eine ganz neue Karte ohne Geburtsdatum entsteht, aber unsichtbar
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000007', 'ganz-neu@x.de', now());
insert into public.profiles (id, status, created_at) values
  ('00000000-0000-0000-0000-000000000007', 'pending', :nachher);
insert into public.waitlist_cards (user_id, email, name, handle, is_public) values
  ('00000000-0000-0000-0000-000000000007', 'ganz-neu@x.de', 'Ganz Neu', 'ganzneu', true);
select public.test_card('00000000-0000-0000-0000-000000000007', false,
  'Eine neu angelegte Karte ohne Geburtsdatum entsteht gar nicht erst öffentlich');

-- ---------- Der Weg heraus ----------
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000002', (current_date - interval '16 years')::date);
select public.test_card('00000000-0000-0000-0000-000000000002', false,
  'Das Nachtragen allein ändert nichts – der Trigger greift erst beim nächsten Speichern');
update public.waitlist_cards set name = 'Neu Ohne'
 where user_id = '00000000-0000-0000-0000-000000000002';
select public.test_card('00000000-0000-0000-0000-000000000002', true,
  'Nach dem Nachtragen und einmal Speichern ist die Karte öffentlich – der Weg heraus funktioniert');

-- ---------- Die alte Regel gilt unverändert weiter ----------
-- Ohne Wunsch-Link keine Adresse, also auch keine öffentliche Karte
update public.waitlist_cards set handle = null
 where user_id = '00000000-0000-0000-0000-000000000003';
select public.test_card('00000000-0000-0000-0000-000000000003', false,
  'Ohne Wunsch-Link bleibt die Karte unsichtbar, auch mit Geburtsdatum');

-- Ein Admin darf eine Karte weiter ausblenden.
-- Die Rolle bleibt hier der Eigentümer: die Admin-Policies auf waitlist_cards gehören nicht
-- zu dieser Migration und sind in den Stubs oben nicht nachgebaut. Geprüft wird der Trigger,
-- und der liest den Admin über is_admin() aus der Sitzung, nicht aus der Datenbankrolle.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
update public.waitlist_cards set is_public = false
 where user_id = '00000000-0000-0000-0000-000000000006';
select set_config('request.jwt.claim.sub', '', false);
select public.test_card('00000000-0000-0000-0000-000000000006', false,
  'Die Admin-Ausblendung funktioniert weiterhin');

-- ---------- Vorlagen-Galerie ----------
-- Sie hängt nicht an is_public und braucht darum eine eigene Prüfung.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', false);
select public.test_expect_error(
  $q$select public.share_page_template('Meine Vorlage', '{"blocks":[]}'::jsonb)$q$,
  '%Geburtsdatum%');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_check(public.share_page_template('Meine Vorlage', '{"blocks":[]}'::jsonb) is not null,
  'Mit Geburtsdatum lässt sich eine Vorlage teilen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.test_check(public.share_page_template('Bestandsvorlage', '{"blocks":[]}'::jsonb) is not null,
  'Ein Bestandskonto ohne Geburtsdatum darf weiterhin eine Vorlage teilen');
select set_config('request.jwt.claim.sub', '', false);
reset role;
select public.test_check(
  (select count(*) from public.page_templates where name in ('Meine Vorlage', 'Bestandsvorlage')) = 2,
  'Genau die beiden erlaubten Vorlagen sind angelegt, die abgelehnte nicht');

-- ---------- age_ok() selbst ----------
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000001') = true,  'age_ok: Bestand ohne Datum');
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000003') = true,  'age_ok: neu mit gültigem Datum');
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000004') = false, 'age_ok: neu, unter 16');
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000007') = false, 'age_ok: neu ohne Datum');
select public.test_check(public.age_ok(null) = false, 'age_ok: ohne Konto');
select public.test_check(public.age_ok('00000000-0000-0000-0000-0000000000ff') = false, 'age_ok: unbekanntes Konto');
set role authenticated;
select public.test_expect_error($q$select public.age_ok(null)$q$, '%permission denied%');
reset role;

-- ---------- is_active_member() verhält sich unverändert ----------
-- Diese Migration schreibt is_active_member() neu (inline-Bedingung raus, age_ok() rein).
-- tests/age_gate_membership.sql kann das nicht absichern: die Datei lädt nur 20261113130000,
-- ihre Stubs haben kein waitlist_cards und könnten diese Migration gar nicht einspielen.
-- Deshalb werden hier alle Bedingungen der Funktion noch einmal durchgegangen, nicht nur das Alter.
insert into auth.users (id, email, email_confirmed_at, phone_confirmed_at) values
  ('00000000-0000-0000-0000-000000000011', 'gesperrt@x.de', now(), null),
  ('00000000-0000-0000-0000-000000000012', 'unbestaetigt@x.de', null, null),
  ('00000000-0000-0000-0000-000000000013', 'abgelehnt@x.de', now(), null),
  ('00000000-0000-0000-0000-000000000014', 'per-telefon@x.de', null, now());
insert into public.profiles (id, status, created_at, banned) values
  ('00000000-0000-0000-0000-000000000011', 'approved', :vorher,  true),
  ('00000000-0000-0000-0000-000000000012', 'pending',  :vorher,  false),
  ('00000000-0000-0000-0000-000000000013', 'rejected', :vorher,  false),
  ('00000000-0000-0000-0000-000000000014', 'pending',  :nachher, false);
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000014', (current_date - interval '20 years')::date);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select public.test_check(public.is_active_member() = false, 'is_active_member: Sperre wirkt weiterhin');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000012', false);
select public.test_check(public.is_active_member() = false, 'is_active_member: unbestätigte E-Mail wirkt weiterhin');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000013', false);
select public.test_check(public.is_active_member() = false, 'is_active_member: abgelehntes Konto bleibt draußen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000014', false);
select public.test_check(public.is_active_member() = true,  'is_active_member: bestätigte Handynummer zählt weiterhin');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(public.is_active_member() = false, 'is_active_member: ohne Anmeldung kein Zugang');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.test_check(public.is_active_member() = true,  'is_active_member: Bestand ohne Datum weiterhin aktiv');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000007', false);
select public.test_check(public.is_active_member() = false, 'is_active_member: neu ohne Datum weiterhin nicht aktiv');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_check(public.is_active_member() = true,  'is_active_member: neu mit Datum weiterhin aktiv');
select set_config('request.jwt.claim.sub', '', false);
reset role;

-- ---------- Vorlagen-Galerie: ausblenden statt löschen ----------
-- „Speichern bleibt erlaubt“ gilt auch hier: die Vorlage bleibt in der Tabelle stehen,
-- sie wird nur nicht mehr angezeigt. Ein Löschen wäre unwiderruflich.
select public.test_check(
  exists (select 1 from public.page_templates where name = 'Alt ohne Datum'),
  'Vorlage eines Kontos unter 16 wird nicht gelöscht');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_check(
  (select count(*) from jsonb_array_elements(public.list_page_templates()) e
    where e->>'name' = 'Alt ohne Datum') = 0,
  'Sie taucht in der Galerie aber nicht mehr auf');
select public.test_check(
  (select count(*) from jsonb_array_elements(public.list_page_templates()) e
    where e->>'name' = 'Alt mit Datum') = 1,
  'Vorlage mit gültigem Geburtsdatum bleibt sichtbar');
select public.test_check(
  (select count(*) from jsonb_array_elements(public.list_page_templates()) e
    where e->>'name' = 'Alt Bestand') = 1,
  'Vorlage eines Bestandskontos bleibt sichtbar');
select set_config('request.jwt.claim.sub', '', false);
reset role;

-- Der Wunsch-Link in der Galerie nur bei öffentlicher Karte: sonst wäre die ausgeblendete
-- Karte über die Galerie wieder auffindbar.
-- Ausblenden geht hier nur über den Admin-Weg: für ein Bestandskonto setzt der Trigger
-- is_public sonst sofort wieder auf "hat einen Wunsch-Link".
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
update public.waitlist_cards set is_public = false where user_id = '00000000-0000-0000-0000-000000000001';
select public.test_check(
  (select is_public from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000001') = false,
  'Ausgangslage: der Admin hat die Bestandskarte ausgeblendet');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_check(
  (select count(*) from jsonb_array_elements(public.list_page_templates()) e
    where e->>'handle' = 'bestand') = 0,
  'Die Galerie verrät den Wunsch-Link einer ausgeblendeten Karte nicht');
select set_config('request.jwt.claim.sub', '', false);
reset role;

-- ---------- Berichtigung durch den Admin wirkt sofort ----------
-- 0003 hat eine öffentliche Karte und ein gültiges Datum. Der Admin berichtigt auf unter 16.
update public.waitlist_cards set handle = 'neumit2' where user_id = '00000000-0000-0000-0000-000000000003';
select public.test_card('00000000-0000-0000-0000-000000000003', true,
  'Ausgangslage: Karte mit gültigem Datum ist öffentlich');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000003',
  to_char(current_date - interval '12 years', 'YYYY-MM-DD'));
select set_config('request.jwt.claim.sub', '', false);
select public.test_card('00000000-0000-0000-0000-000000000003', false,
  'Berichtigt der Admin auf ein Datum unter 16, verschwindet die Karte sofort – nicht erst beim nächsten Speichern');

-- Der Anstoß darf nur ausblenden, nie einblenden: Eine Karte, die ein Admin aus
-- Moderationsgründen versteckt hat, darf durch eine Geburtsdatum-Berichtigung nicht
-- wieder online gehen.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000008', 'moderiert@x.de', now());
insert into public.profiles (id, status, created_at) values
  ('00000000-0000-0000-0000-000000000008', 'pending', :nachher);
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000008', (current_date - interval '30 years')::date);
insert into public.waitlist_cards (user_id, email, name, handle) values
  ('00000000-0000-0000-0000-000000000008', 'moderiert@x.de', 'Moderiert', 'moderiert');
select public.test_card('00000000-0000-0000-0000-000000000008', true,
  'Ausgangslage: Karte mit gültigem Datum ist öffentlich');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', false);
update public.waitlist_cards set is_public = false where user_id = '00000000-0000-0000-0000-000000000008';
select public.test_card('00000000-0000-0000-0000-000000000008', false,
  'Der Admin blendet sie aus');
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000008',
  to_char(current_date - interval '25 years', 'YYYY-MM-DD'));
select public.test_card('00000000-0000-0000-0000-000000000008', false,
  'Nach der Berichtigung bleibt sie ausgeblendet – der Anstoß hebt die Moderation nicht auf');
select set_config('request.jwt.claim.sub', '', false);

-- ---------- Einladungsname verrät nichts über ausgeblendete Karten ----------
select public.test_check(public.get_invite_name('neumit2') is null,
  'get_invite_name gibt zu einer ausgeblendeten Karte keinen Namen mehr heraus');
select public.test_check(public.get_invite_name('bestand') is null,
  'Dasselbe für eine von Hand ausgeblendete Karte');
-- wieder einblenden: das Mitglied speichert seine Karte selbst
select set_config('request.jwt.claim.sub', '', false);
update public.waitlist_cards set updated_at = now() where user_id = '00000000-0000-0000-0000-000000000001';
select public.test_check(public.get_invite_name('bestand') = 'Bestand',
  'Bei öffentlicher Karte liefert get_invite_name den Namen wie bisher');

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Mindestalter beim Veröffentlichen)'; end $$;
