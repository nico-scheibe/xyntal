-- Mindestalter 16, Verhalten ab 20261118120000 (Migrationen 20261118120000, 20261118140000,
-- 20261118160000). Geprüft wird, was tests/age_gate_publishing.sql nicht abdeckt: Ein Konto mit
-- hinterlegtem Datum unter 16 verliert Schreiben, Lesen, Freischaltung und Sichtbarkeit. Ein abgelehntes
-- Profil bleibt abgelehnt. Die Anmeldung speichert ein Datum unter 16, aber kein Zukunftsdatum.
-- Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_underage.sql
\set ON_ERROR_STOP on
set datestyle = 'ISO, YMD';

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

-- ---------- Stubs: nur, was die Migrationen anfassen (Stil wie tests/age_gate_publishing.sql) ----------
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant usage on schema public to anon, authenticated;

-- Spalten wie in 003_community.sql, 20261113120000 und 20261105110000 (nur die, die hier gelesen werden)
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  headline      text not null default '',
  about         text not null default '',
  phase         text,
  category      text not null default '',
  offer         text not null default '',
  seek          text not null default '',
  linkedin      text not null default '',
  instagram     text not null default '',
  website       text not null default '',
  is_public     boolean not null default false,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);
grant select on public.profiles to authenticated;
-- wie in 20261113120000_signup_birthdate.sql
create table public.member_birthdates (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birthdate  date not null,
  set_at     timestamptz not null default now()
);
alter table public.member_birthdates enable row level security;
revoke all on public.member_birthdates from anon, authenticated;
-- die für diese Migrationen wichtigen Spalten aus 011 und den Folgemigrationen
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
create function public.normalize_url(u text) returns text language sql immutable as $$
  select coalesce(nullif(btrim(coalesce(u, '')), ''), '') $$;
-- page_guard und page_check wie in tests/age_gate_publishing.sql, nur für 20261113140000 nötig
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
-- wie in 20261113120000_signup_birthdate.sql
create function public.birthdate_from_text(t text) returns date language plpgsql immutable set search_path = '' as $$
declare d date;
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  d := t::date;
  if d < date '1900-01-01' then return null; end if;
  return d;
exception when others then return null;
end $$;

-- Prüfhilfen (Testobjekte, nur in dieser Testdatenbank)
-- "if not ok" besteht bei NULL still: not NULL ist NULL, die IF-Bedingung greift nicht. Deshalb "is not true":
--   nur ein echtes true besteht. Eine Prüfung, die bei NULL besteht, ist keine Prüfung. Beispiel: Eine nullbare Spalte
--   author_age_ok hätte jeden neuen Kommentar für alle unsichtbar gemacht, und die Zusage wäre grün geblieben.
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
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
-- Rechteprüfung über SQLSTATE 42501 statt Fehlertext (sprachunabhängig). Eine Verletzung einer
-- Schreib-Policy meldet Postgres mit 42501.
create function public.test_expect_denied(stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when insufficient_privilege then
    raise notice 'OK (abgelehnt, SQLSTATE 42501): %', stmt;
    return;
  end;
  raise exception 'TEST FEHLGESCHLAGEN: kein Rechtefehler bei: %', stmt;
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
-- Status, Sichtbarkeit und hinterlegtes Datum in einem Schritt prüfen
create function public.test_profile(uid text, want_status text, want_public boolean, want_row boolean, label text) returns void language plpgsql as $$
declare st text; pub boolean; has boolean;
begin
  select status, is_public into st, pub from public.profiles where id = uid::uuid;
  has := exists (select 1 from public.member_birthdates where id = uid::uuid);
  if st is distinct from want_status or pub is distinct from want_public or has <> want_row then
    raise exception 'TEST FEHLGESCHLAGEN (%): Status % (erwartet %), öffentlich % (erwartet %), Geburtsdatum hinterlegt % (erwartet %)',
      label, st, want_status, pub, want_public, has, want_row;
  end if;
  raise notice 'OK: %', label;
end $$;

-- ---------- Zustand VOR den neuen Migrationen ----------
\i supabase/migrations/20261107200000_cards_always_public.sql
\i supabase/migrations/20261113130000_age_gate_membership.sql
\i supabase/migrations/20261113140000_age_gate_publishing.sql

-- Der Stichtag ist der Augenblick, in dem 20261113140000 läuft. Darum relative Daten.
\set vorher '(now() - interval ''30 days'')'
\set nachher '(now() + interval ''30 days'')'

-- Konten: 01 Bestand ohne Datum · 02 mit Datum ab 16 · 03 Bestand, trägt später selbst ein Datum unter 16 ein
-- 04 wartend · 05 abgelehnt (Admin berichtigt) · 06 Admin · 07 freigeschaltet mit Datum, Admin berichtigt
-- 08 abgelehnt (trägt selbst ein Datum unter 16 ein)
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000001', 'bestand@x.de', now()),
  ('00000000-0000-0000-0000-000000000002', 'mit-datum@x.de', now()),
  ('00000000-0000-0000-0000-000000000003', 'selbst-unter-16@x.de', now()),
  ('00000000-0000-0000-0000-000000000004', 'wartend@x.de', now()),
  ('00000000-0000-0000-0000-000000000005', 'abgelehnt@x.de', now()),
  ('00000000-0000-0000-0000-000000000006', 'admin@x.de', now()),
  ('00000000-0000-0000-0000-000000000007', 'berichtigt@x.de', now()),
  ('00000000-0000-0000-0000-000000000008', 'abgelehnt-selbst@x.de', now());
insert into public.profiles (id, name, headline, status, is_public, is_admin, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'Bestand', 'Baut eine Plattform fuer Vereine', 'approved', true,  false, :vorher),
  ('00000000-0000-0000-0000-000000000002', 'Mit Datum', 'Baut eine Plattform fuer Vereine', 'approved', true,  false, :nachher),
  ('00000000-0000-0000-0000-000000000003', 'Selbst Sechzehn', 'Baut eine Plattform fuer Vereine', 'approved', true,  false, :vorher),
  ('00000000-0000-0000-0000-000000000004', 'Wartend', 'Baut eine Plattform fuer Vereine', 'pending', false, false, :nachher),
  ('00000000-0000-0000-0000-000000000005', 'Abgelehnt', 'Baut eine Plattform fuer Vereine', 'rejected', false, false, :nachher),
  ('00000000-0000-0000-0000-000000000006', 'Admin', 'Baut eine Plattform fuer Vereine', 'approved', false, true, :vorher),
  ('00000000-0000-0000-0000-000000000007', 'Berichtigt', 'Baut eine Plattform fuer Vereine', 'approved', true,  false, :nachher),
  ('00000000-0000-0000-0000-000000000008', 'Abgelehnt Selbst', 'Baut eine Plattform fuer Vereine', 'rejected', false, false, :nachher);
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000002', (current_date - interval '20 years')::date),
  ('00000000-0000-0000-0000-000000000007', (current_date - interval '20 years')::date);

-- Karten entstehen unter dem Trigger aus 20261113140000: öffentlich, wenn das Alter stimmt und ein Wunsch-Link da ist
insert into public.waitlist_cards (user_id, email, name, handle) values
  ('00000000-0000-0000-0000-000000000001', 'bestand@x.de', 'Bestand', 'bestand'),
  ('00000000-0000-0000-0000-000000000002', 'mit-datum@x.de', 'Mit Datum', 'mitdatum'),
  ('00000000-0000-0000-0000-000000000003', 'selbst-unter-16@x.de', 'Selbst Sechzehn', 'selbst16'),
  ('00000000-0000-0000-0000-000000000007', 'berichtigt@x.de', 'Berichtigt', 'berichtigt');

-- ---------- Die Migrationen, um die es geht ----------
\i supabase/migrations/20261117120000_age_ok_known_birthdate.sql
\i supabase/migrations/20261118120000_altersgrenze_schliessen.sql

-- Tabellen und Policies, die 20261118140000 voraussetzt. Die Policies stehen so, wie sie live vor
-- dieser Migration galten: Beiträge über is_approved_member(), Nachrichten über 20261028160000.
-- Beiträge wie live: Lesen und Schreiben aus 003_community.sql, Bearbeiten innerhalb von 30 Minuten
-- mit Trigger aus 20261028220000_community_post_edit_window.sql. Die Lese-Policy fehlte im ersten Stub.
-- Ohne sie ist der eigene Beitrag für authenticated unsichtbar, und jedes UPDATE trifft keine Zeile.
-- Dann hätte der Test eine Lücke im Stub gemessen, nicht die Altersregel.
create table public.posts (
  id            bigint generated always as identity primary key,
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind          text not null default 'update' check (kind in ('update', 'frage', 'erfolg')),
  body          text not null check (char_length(trim(body)) between 1 and 3000),
  is_public     boolean not null default false,
  edited_at     timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.posts enable row level security;
create policy "Beiträge lesen" on public.posts
  for select to anon, authenticated
  using (is_public or (select public.is_approved_member()) or (select public.is_admin()));
create policy "Beiträge schreiben" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));
create or replace function public.enforce_post_edit_window()
returns trigger language plpgsql set search_path = '' as $$
begin
  if NEW.id is distinct from OLD.id or NEW.author_id is distinct from OLD.author_id
      or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Die ursprünglichen Beitragsdaten können nicht geändert werden.' using errcode='42501';
  end if;
  NEW.edited_at := OLD.edited_at;
  if NEW.body is distinct from OLD.body or NEW.kind is distinct from OLD.kind
      or NEW.is_public is distinct from OLD.is_public then
    if auth.uid() is distinct from OLD.author_id then
      raise exception 'Du kannst nur deine eigenen Beiträge bearbeiten.' using errcode='42501';
    end if;
    if clock_timestamp() >= OLD.created_at + interval '30 minutes' then
      raise exception 'Die 30 Minuten zum Bearbeiten dieses Beitrags sind abgelaufen.' using errcode='42501';
    end if;
    NEW.edited_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_post_edit_window() from public;
drop trigger if exists enforce_post_edit_window on public.posts;
create trigger enforce_post_edit_window before update on public.posts
  for each row execute function public.enforce_post_edit_window();
create policy "Eigene Beiträge ändern" on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and created_at > statement_timestamp() - interval '30 minutes')
  with check (author_id = (select auth.uid()) and created_at > statement_timestamp() - interval '30 minutes');
grant select, insert, update on public.posts to anon, authenticated;

create table public.messages (
  id            bigint generated always as identity primary key,
  sender_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(trim(body)) between 1 and 2000),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
alter table public.messages enable row level security;
create policy "Eigene Nachrichten lesen" on public.messages
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "Nachrichten senden" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and (select public.is_active_member())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.status <> 'rejected')
  );
grant select, insert on public.messages to authenticated;

-- Zum Treffen anmelden: anon darf sich anmelden, wie in supabase/schema.sql
create table public.event_signups (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 80),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  project     text not null check (char_length(project) between 1 and 1000),
  created_at  timestamptz not null default now()
);
alter table public.event_signups enable row level security;
grant insert on public.event_signups to anon, authenticated;
create policy "Zum Treffen anmelden" on public.event_signups
  for insert to anon, authenticated with check (true);
-- Sequenzen für die Identity-Spalten (Inserts als anon und authenticated brauchen sie)
grant usage on all sequences in schema public to anon, authenticated;

-- Eine Nachricht von 02 an 03, bevor 03 ein Datum unter 16 einträgt. Die Zeile bleibt danach bestehen.
insert into public.messages (sender_id, recipient_id, body) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'Hallo vor dem Datum');

\i supabase/migrations/20261118140000_altersgrenze_nachziehen.sql
\i supabase/migrations/20261118160000_altersgrenze_nachbesserung.sql

-- ---------- Bestandskonto ohne Datum: vor und nach den Änderungen unverändert ----------
-- Vorbedingung: Das Konto ist vor dem Stichtag angelegt. Sonst wäre es kein Bestand, und jede
-- Prüfung unten würde die Altersregel für ein Neukonto messen.
select public.test_check(
  (select p.created_at < s.started_at from public.profiles p, public.age_check_config s
    where p.id = '00000000-0000-0000-0000-000000000001' and s.id),
  'Vorbedingung: Bestandskonto 01 ist vor dem Stichtag angelegt');
select public.test_check(
  (select p.created_at < s.started_at from public.profiles p, public.age_check_config s
    where p.id = '00000000-0000-0000-0000-000000000003' and s.id),
  'Vorbedingung: Konto 03 ist vor dem Stichtag angelegt');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.posts (author_id, body) values ('00000000-0000-0000-0000-000000000001', 'Bestandsbeitrag');
select public.test_check((select count(*) from public.posts) = 1, 'Bestand: der Beitrag wird angelegt');
update public.posts set body = 'Bestandsbeitrag geändert' where author_id = '00000000-0000-0000-0000-000000000001';
select public.test_check(public.is_approved_member() = true, 'Bestand: freigeschaltet, ohne Datum, schreibt weiter');
select public.test_check(public.is_active_member() = true, 'Bestand: ohne Datum weiterhin aktiv');
reset role;
select public.test_check(
  (select body from public.posts where author_id = '00000000-0000-0000-0000-000000000001') = 'Bestandsbeitrag geändert',
  'Bestand: der eigene Beitrag lässt sich weiter ändern');
select public.test_card('00000000-0000-0000-0000-000000000001', true,
  'Bestand: Karte ohne Datum bleibt öffentlich');
select public.test_profile('00000000-0000-0000-0000-000000000001', 'approved', true, false,
  'Bestand: Profil bleibt freigeschaltet und sichtbar');

-- ---------- Konto mit Datum unter 16 selbst eingetragen (Block 1) ----------
-- 03 ist freigeschaltet und hat noch kein Datum. Vorher legt es einen Beitrag an und liest seine Nachricht.
-- Der Beitrag ist öffentlich. So bleibt er für 03 auch nach dem Datum sichtbar, und ein verweigertes
-- UPDATE kommt sicher von der Altersregel und nicht davon, dass die Zeile unsichtbar ist.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
insert into public.posts (author_id, body, is_public) values ('00000000-0000-0000-0000-000000000003', 'Vor dem Datum', true);
select public.test_check((select count(*) from public.messages) = 1,
  'Vor dem Eintragen liest 03 seine Nachricht');
select public.test_check(public.is_active_member() = true, 'Vor dem Eintragen: 03 ist aktiv (Gegenprobe zu „nicht mehr aktiv“ unten)');
-- Gegenprobe zum UPDATE unten: vor dem Datum geht das Ändern des eigenen Beitrags
update public.posts set body = 'Vor dem Datum, geändert' where author_id = '00000000-0000-0000-0000-000000000003';
reset role;
select public.test_check(
  (select body from public.posts where author_id = '00000000-0000-0000-0000-000000000003') = 'Vor dem Datum, geändert',
  'Vor dem Eintragen: der eigene Beitrag lässt sich ändern (Gegenprobe)');
select public.test_profile('00000000-0000-0000-0000-000000000003', 'approved', true, false,
  'Vor dem Eintragen: freigeschaltet, sichtbar, ohne Datum');
select public.test_card('00000000-0000-0000-0000-000000000003', true,
  'Vor dem Eintragen: Karte öffentlich');

set role authenticated;
select public.set_my_birthdate((current_date - interval '10 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000003', 'pending', false, true,
  'Selbst unter 16 eingetragen: Freischaltung weg, Profil unsichtbar, Datum hinterlegt');
select public.test_card('00000000-0000-0000-0000-000000000003', false,
  'Selbst unter 16 eingetragen: Karte geht offline');

-- Ein zweiter Versuch scheitert, wie bei jedem anderen Datum
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_expect_error($q$select public.set_my_birthdate('2000-01-01')$q$, '%schon eingetragen%');
reset role;

-- Ein Konto mit hinterlegtem Datum unter 16 kann nichts anlegen und nichts ändern
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_expect_denied($q$insert into public.posts (author_id, body)
  values ('00000000-0000-0000-0000-000000000003', 'Neuer Beitrag')$q$);
-- Das Insert oben scheitert mit 42501 (Gegenprobe: derselbe Insert ging vor dem Datum). Das UPDATE
-- meldet Postgres nicht als Fehler, es trifft nur keine Zeile. Darum wird nach dem reset geprüft,
-- ob der Text unverändert ist. Der Beitrag ist öffentlich und bleibt sichtbar, also greift hier
-- allein die neue Restriktiv-Policy.
update public.posts set body = 'Geändert trotz Altersgrenze'
 where author_id = '00000000-0000-0000-0000-000000000003';
reset role;
select public.test_check(
  (select body from public.posts where author_id = '00000000-0000-0000-0000-000000000003') = 'Vor dem Datum, geändert',
  'Unter 16: der eigene, vorher angelegte Beitrag lässt sich nicht mehr ändern');

-- Dasselbe Konto liest keine Nachrichten, obwohl die Zeile da ist
select public.test_check(
  (select count(*) from public.messages where recipient_id = '00000000-0000-0000-0000-000000000003') = 1,
  'Ausgangslage: die Nachricht an 03 existiert');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_check((select count(*) from public.messages) = 0,
  'Unter 16: keine Nachricht mehr lesbar, obwohl eine Zeile für das Konto existiert');
select public.test_check(public.is_active_member() = false, 'Unter 16: nicht mehr aktiv');
reset role;

-- ---------- An ein wartendes Profil kann niemand schreiben (Weg 1a) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select public.test_expect_denied($q$insert into public.messages (sender_id, recipient_id, body)
  values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004', 'Hallo')$q$);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', false);
select public.test_expect_denied($q$insert into public.messages (sender_id, recipient_id, body)
  values ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000004', 'Hallo')$q$);
reset role;
-- Gegenprobe: an ein freigeschaltetes Profil geht es weiterhin
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
insert into public.messages (sender_id, recipient_id, body) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Hallo Bestand');
reset role;
select public.test_check(
  (select count(*) from public.messages where sender_id = '00000000-0000-0000-0000-000000000002'
     and recipient_id = '00000000-0000-0000-0000-000000000001') = 1,
  'An ein freigeschaltetes Profil lässt sich weiter schreiben');
-- Gegenprobe zum Admin oben: der Admin darf an ein freigeschaltetes Profil schreiben
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', false);
insert into public.messages (sender_id, recipient_id, body) values
  ('00000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Hallo vom Admin');
reset role;

-- ---------- Abgelehnt bleibt abgelehnt (Block 1 und Block 2) ----------
-- Der Admin berichtigt ein abgelehntes Profil auf ein Datum unter 16. Die Ablehnung bleibt.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', false);
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000005'::uuid,
  (current_date - interval '12 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000005', 'rejected', false, true,
  'Admin berichtigt ein abgelehntes Profil auf unter 16: bleibt abgelehnt');

-- Dasselbe, wenn das abgelehnte Mitglied sein Datum selbst eintragt
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000008', false);
select public.set_my_birthdate((current_date - interval '10 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000008', 'rejected', false, true,
  'Abgelehntes Mitglied trägt selbst unter 16 ein: bleibt abgelehnt');

-- ---------- Admin-Berichtigung eines freigeschalteten Mitglieds (Block 2) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000006', false);
select public.admin_set_birthdate('00000000-0000-0000-0000-000000000007'::uuid,
  (current_date - interval '12 years')::date::text);
reset role;
select public.test_profile('00000000-0000-0000-0000-000000000007', 'pending', false, true,
  'Admin berichtigt freigeschaltetes Mitglied auf unter 16: Profil wartet und ist unsichtbar');
select public.test_card('00000000-0000-0000-0000-000000000007', false,
  'Admin berichtigt auf unter 16: Karte geht offline');

-- ---------- Anmeldung: Datum unter 16 gespeichert, Zukunftsdatum nicht (Block 3) ----------
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000010', 'anmeldung-unter-16@x.de', now(),
     jsonb_build_object('name', 'Anmeldung Unter', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date - interval '10 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000011', 'anmeldung-zukunft@x.de', now(),
     jsonb_build_object('name', 'Anmeldung Zukunft', 'headline', 'Baue eine Software-Firma',
                        'birthdate', ((current_date + 30)::date)::text));
select public.test_profile('00000000-0000-0000-0000-000000000010', 'pending', false, true,
  'Anmeldung mit Datum unter 16: Datum wird gespeichert, Profil wartet');
select public.test_profile('00000000-0000-0000-0000-000000000011', 'pending', false, false,
  'Anmeldung mit Zukunftsdatum: kein Datum gespeichert, Profil wartet');

-- ---------- Treffen-Anmeldung bleibt für anon offen (Restriktiv-Policies nur für authenticated) ----------
set role anon;
insert into public.event_signups (name, email, project) values ('Gast', 'gast@x.de', 'Projekt');
reset role;
select public.test_check(
  (select count(*) from public.event_signups where email = 'gast@x.de') = 1,
  'anon kann sich weiter zum Treffen anmelden');
-- Die Restriktiv-Policies gelten nur für authenticated. Gegenprobe: Ein Bestandskonto darf sich
-- als authenticated anmelden, ein Konto unter 16 nicht. Nur so zeigt die Prüfung, dass die Altersregel
-- für authenticated greift und anon ausgenommen bleibt.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
insert into public.event_signups (name, email, project) values ('Bestand', 'bestand-treffen@x.de', 'Projekt');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
select public.test_expect_denied($q$insert into public.event_signups (name, email, project)
  values ('Unter Sechzehn', 'unter16-treffen@x.de', 'Projekt')$q$);
reset role;
select public.test_check(
  (select count(*) from public.event_signups where email = 'bestand-treffen@x.de') = 1,
  'Bestandskonto meldet sich als authenticated zum Treffen an (Gegenprobe)');

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Mindestalter 16, Verhalten ab 20261118120000)'; end $$;
