-- Sperrliste für gelöschte Konten unter 16, Verhalten ab 20261118180000 (supabase/migrations/20261118180000_altersgrenze_sperrliste.sql).
-- Geprüft wird: Ein unter-16-Konto mit Datum hinterlässt eine Sperre (gepfefferter Hash der Adresse, Tag des 16. Geburtstags).
-- Die Neuanmeldung mit derselben Adresse stellt das Datum wieder her. Selbst- und Admin-Löschung legen dieselbe Zeile an,
-- aber nur für bestätigte Adressen. Admins können eine Sperre auf Antrag löschen, andere nicht.
-- anon, authenticated und service_role haben auf den Sperrtabellen und der Schlüsselfunktion keine Rechte.
-- Jede Zusage hat eine Gegenprobe: derselbe Weg mit einer Eingabe, die die Regel nicht auslösen darf, oder mit dem Recht,
-- das den Befund erklärt. So zeigt der Test, dass die Regel greift und nicht ein fehlender Stub oder eine fehlende Rolle.
-- Die Rechteprüfungen (Abschnitt h) laufen VOR jeder Gegenprobe mit Recht. Sonst prüft der Test den eigenen Entzug.
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_blocklist.sql
\set ON_ERROR_STOP on

-- Nur für den Test, nicht in der Migration: Eine frische Datenbank hat pgcrypto noch nicht. Die Migration
-- setzt pgcrypto voraus (extensions.gen_random_bytes, extensions.digest) und legt es deshalb nicht an. Hier
-- wird es vorab angelegt, damit der Test in einer leeren Datenbank überhaupt läuft.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

set datestyle = 'ISO, YMD';

-- Rollen: service_role gibt es in Supabase immer. In einer leeren Testdatenbank muss sie angelegt werden,
-- sonst scheitert schon das revoke der Migration.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- ---------- Stubs: nur, was die Migrationen anfassen (Stil wie tests/age_gate_publishing.sql) ----------
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
-- service_role bekommt Schemarecht, damit eine Ablehnung nur an der Tabelle hängt und nicht am Schema.
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

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
-- Produktion vor 20261118180000: service_role hatte all auf member_birthdates (gemessen). Die Standardrechte weiter
--   unten gelten nur für Objekte, die danach entstehen, und die Tabelle entsteht hier vorher. Ohne diese Zeile hätte
--   service_role auf der Tabelle nie Rechte, das revoke der Migration wäre leer, und die Rechteprüfung in Abschnitt h
--   wäre selbsterfüllend. Die Zeile muss also VOR dem Migrationslauf stehen.
grant all on public.member_birthdates to service_role;
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

-- Standardrechte wie in Supabase: neue Tabellen, Funktionen und Folgen in public sind für anon, authenticated
-- und service_role zunächst offen. Die Migration muss das für ihre Objekte zurücknehmen.
-- Gemessen in der Produktionsdatenbank in pg_default_acl (Schema public): Tabellen (r) für postgres, anon,
--   authenticated, service_role je arwdDxtm; Funktionen (f) für dieselben vier je X; Folgen (S) je rwU.
--   Ohne diese drei Zeilen prüft der Test eine Welt, die es nicht gibt, und jede Rechte-Zusage ist selbsterfüllend:
--   Ein fehlendes revoke würde nie auffallen, weil die Tabelle ohnehin keine Rechte hätte.
-- Diese Zeilen nicht als überflüssig entfernen. Sie sind der Grund, warum die Rechte-Abschnitte des Tests etwas beweisen.
-- Ausführen als postgres (nicht als anderer Superuser), sonst gelten die Standardrechte nicht für die Objekte,
--   die diese Sitzung anlegt. Nicht abgebildet: die Einträge von supabase_admin in pg_default_acl.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- Prüfhilfen (Testobjekte, nur in dieser Testdatenbank)
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

-- Stubs aus dem Test der Altersgrenze (tests/age_gate_underage.sql), dazu Newsletter und mfa_ok für delete_my_account()
create table public.newsletter (email text primary key);
create function public.mfa_ok() returns boolean language sql stable as $$ select true $$;

-- Prüfhilfen für die Sperrliste
create function public.test_block(mail text, want date, label text) returns void language plpgsql as $$
declare got date;
begin
  select blocked_until into got from public.age_blocks where key = public.age_block_key(mail);
  if got is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): Sperre % (erwartet %)', label, got, want;
  end if;
  raise notice 'OK: %', label;
end $$;
create function public.test_birthdate(uid text, want date, label text) returns void language plpgsql as $$
declare got date;
begin
  select birthdate into got from public.member_birthdates where id = uid::uuid;
  if got is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): Geburtsdatum % (erwartet %)', label, got, want;
  end if;
  raise notice 'OK: %', label;
end $$;
create function public.test_age(uid text, want boolean, label text) returns void language plpgsql as $$
declare got boolean;
begin
  got := public.age_ok(uid::uuid);
  if got is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): age_ok % (erwartet %)', label, got, want;
  end if;
  raise notice 'OK: %', label;
end $$;
-- Rechteprüfung: Der Stub führt den Aufruf als Rolle r aus und erwartet SQLSTATE 42501
create function public.test_denied_as(r text, stmt text, label text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when insufficient_privilege then
    ok := true;
  end;
  execute 'reset role';
  if not ok then raise exception 'TEST FEHLGESCHLAGEN (%): kein Rechtefehler für % bei: %', label, r, stmt; end if;
  raise notice 'OK (%, abgelehnt): %', r, label;
end $$;
-- Gegenprobe mit Recht: Der Aufruf als Rolle r darf NICHT am Recht scheitern. Die Regel selbst darf greifen,
--   aber der Fehler darf nicht SQLSTATE 42501 sein. So zeigt sich, dass das Recht da ist.
create function public.test_error_as(r text, stmt text, pattern text, label text) returns void language plpgsql as $$
declare msg text; st text;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when others then
    msg := sqlerrm;
    st := sqlstate;
  end;
  execute 'reset role';
  if msg is null then raise exception 'TEST FEHLGESCHLAGEN (%): kein Fehler (erwartet %)', label, pattern; end if;
  if st = '42501' then raise exception 'TEST FEHLGESCHLAGEN (%): Rechtefehler statt Regelfehler: %', label, msg; end if;
  if msg not like pattern then raise exception 'TEST FEHLGESCHLAGEN (%): Fehler "%" statt "%"', label, msg, pattern; end if;
  raise notice 'OK (%, Recht vorhanden, Regel greift): %', r, label;
end $$;
-- Gegenprobe mit Recht, Aufruf ohne Fehler: derselbe Weg muss als Rolle r durchlaufen.
create function public.test_runs_as(r text, stmt text, label text) returns void language plpgsql as $$
declare msg text;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when others then
    msg := sqlerrm;
  end;
  execute 'reset role';
  if msg is not null then raise exception 'TEST FEHLGESCHLAGEN (%): % bei: %', label, msg, stmt; end if;
  raise notice 'OK (%, läuft mit Recht): %', r, label;
end $$;

-- ---------- Altersregel-Kette, auf der die Sperrliste aufsetzt ----------
\i supabase/migrations/20261107200000_cards_always_public.sql
\i supabase/migrations/20261113130000_age_gate_membership.sql
\i supabase/migrations/20261113140000_age_gate_publishing.sql
\i supabase/migrations/20261117120000_age_ok_known_birthdate.sql
\i supabase/migrations/20261118160000_altersgrenze_nachbesserung.sql
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Die Migration unter Test, erster Lauf ----------
\i supabase/migrations/20261118180000_altersgrenze_sperrliste.sql
select encode(pepper, 'hex') as pepper_vorher from public.age_block_secret where id = 1 \gset

-- Zweiter Lauf: der Pfeffer darf nicht neu erzeugt werden (sonst wäre jede bestehende Sperre wertlos)
\i supabase/migrations/20261118180000_altersgrenze_sperrliste.sql
select public.test_check((select encode(pepper, 'hex') from public.age_block_secret where id = 1) = :'pepper_vorher',
  'Zweiter Lauf der Migration: der Pfeffer bleibt gleich (Gegenprobe: ein neuer Pfeffer würde die Zeichenkette ändern)');
-- Der Pfeffer geht in den Schlüssel ein. Ohne Pfeffer wäre der Schlüssel der blanke sha256 der Adresse, und genau das
--   darf er nicht sein. Die Adresse hat hier keinen Plus-Zusatz und ist schon klein geschrieben: Die Normalisierung
--   ändert dann nichts, und der Vergleich hängt nur am Pfeffer. Mit einer Adresse mit Plus-Zusatz vergliche man zwei
--   verschiedene Dinge, und die Zusage wäre aus dem falschen Grund wahr.
select public.test_check(public.age_block_key('x@x.de') <> extensions.digest(convert_to('x@x.de','UTF8'),'sha256'),
  'Der Pfeffer geht in den Schlüssel ein (Gegenprobe: ohne Pfeffer wäre es der blanke sha256)');

-- ---------- a) Unter-16-Konto mit Datum löscht sich, über-16-Konto nicht ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000021', 'unter16@x.de', now(),
   jsonb_build_object('name', 'Unter Sechzehn', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000022', 'ueber16@x.de', now(),
   jsonb_build_object('name', 'Ueber Sechzehn', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '20 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000023', 'ohne-datum@x.de', now(),
   jsonb_build_object('name', 'Ohne Datum', 'headline', 'Baut eine Firma'));
select public.test_birthdate('00000000-0000-0000-0000-000000000021', (current_date - interval '10 years')::date,
  'Vorbedingung: Konto 21 hat das Datum hinterlegt');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', false);
select public.delete_my_account();
reset role;
select public.test_check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000021'),
  'a) Konto 21 ist gelöscht');
select public.test_check(not exists (select 1 from public.member_birthdates where id = '00000000-0000-0000-0000-000000000021'),
  'a) Das Datum am Profil ist mit dem Konto weg (genau die Lücke)');
select public.test_block('unter16@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'a) Unter-16-Konto mit Datum löscht sich: Sperre bis Datum des 16. Geburtstags');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', false);
select public.delete_my_account();
reset role;
select public.test_block('ueber16@x.de', null,
  'a) Gegenprobe: Konto über 16 löscht sich, KEINE Zeile');
select public.test_block('unter16@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'a) Gegenprobe: die Zeile des unter-16-Kontos bleibt, das Löschen des anderen ändert sie nicht');

-- ---------- b) Konto ohne hinterlegtes Datum löscht sich: keine Zeile ----------
select count(*) as zeilen_vorher from public.age_blocks \gset
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000023', false);
select public.delete_my_account();
reset role;
select public.test_check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000023'),
  'b) Vorbedingung: Konto 23 ist gelöscht');
select public.test_check((select count(*) from public.age_blocks) = :zeilen_vorher,
  'b) Konto ohne Datum: keine neue Zeile in age_blocks');
select public.test_check(:zeilen_vorher >= 1,
  'b) Gegenprobe: die Sperrliste enthält Zeilen (aus a), die Zählung ist also aussagekräftig');

-- ---------- c) Neuanmeldung mit derselben Adresse und der Lüge 2000-01-01 ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000024', 'unter16@x.de', now(),
   jsonb_build_object('name', 'Neu Anmeldung', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01')),
  ('00000000-0000-0000-0000-000000000025', 'anderer-mensch@x.de', now(),
   jsonb_build_object('name', 'Anderer Mensch', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01'));
select public.test_birthdate('00000000-0000-0000-0000-000000000024', (current_date - interval '10 years')::date,
  'c) Neuanmeldung mit 2000-01-01: das wiederhergestellte Datum steht drin, nicht 2000-01-01');
select public.test_age('00000000-0000-0000-0000-000000000024', false,
  'c) Neuanmeldung mit derselben Adresse: age_ok ist false');
select public.test_birthdate('00000000-0000-0000-0000-000000000025', '2000-01-01',
  'c) Gegenprobe: andere Adresse mit 2000-01-01 behält das Datum');
select public.test_age('00000000-0000-0000-0000-000000000025', true,
  'c) Gegenprobe: andere Adresse mit 2000-01-01 ist age_ok true');
-- Konto 24 wieder löschen, damit die Adresse für d frei ist. Das Löschen schreibt dieselbe Sperre fort.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000024', false);
select public.delete_my_account();
reset role;

-- ---------- d) Neuanmeldung mit einem jüngeren Datum als die Sperre ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000026', 'unter16@x.de', now(),
   jsonb_build_object('name', 'Jung Anmeldung', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '5 years')::date)::text));
select public.test_birthdate('00000000-0000-0000-0000-000000000026', (current_date - interval '5 years')::date,
  'd) Jüngeres Datum als die Sperre bleibt stehen');
select public.test_age('00000000-0000-0000-0000-000000000026', false,
  'd) Jüngeres Datum: age_ok bleibt false');

-- ---------- e) Groß-/Kleinschreibung und Leerzeichen machen keinen Unterschied ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000027', '  Gross@Schreibung.DE ', now(),
   jsonb_build_object('name', 'Gross Schreibung', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
select public.test_check(public.age_block_key('  Gross@Schreibung.DE ') = public.age_block_key('gross@schreibung.de'),
  'e) Der Schlüssel ignoriert Groß-/Kleinschreibung und Leerzeichen');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000027', false);
select public.delete_my_account();
reset role;
select public.test_block('gross@schreibung.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'e) Sperre unter der bereinigten Adresse gefunden');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000028', '  GROSS@schreibung.de ', now(),
   jsonb_build_object('name', 'Gross Neu', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01')),
  ('00000000-0000-0000-0000-000000000029', 'grossschreibung@x.de', now(),
   jsonb_build_object('name', 'Andere Adresse', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01'));
select public.test_birthdate('00000000-0000-0000-0000-000000000028', (current_date - interval '10 years')::date,
  'e) Neuanmeldung in anderer Schreibweise: Datum wird wiederhergestellt');
select public.test_age('00000000-0000-0000-0000-000000000029', true,
  'e) Gegenprobe: eine andere Adresse (nicht nur Schreibung) bleibt unberührt, age_ok true');

-- ---------- f) Abgelaufene Sperre wirkt nicht und wird bei Anmeldung oder Löschung entfernt ----------
insert into public.age_blocks (key, blocked_until) values
  (public.age_block_key('abgelaufen@x.de'), current_date - 1),
  (public.age_block_key('gueltig-f@x.de'), current_date + 1);
select public.test_block('abgelaufen@x.de', current_date - 1, 'f) Vorbedingung: abgelaufene Zeile liegt vor');
select public.test_block('gueltig-f@x.de', current_date + 1, 'f) Vorbedingung: gültige Zeile (bis morgen) liegt vor');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000002a', 'abgelaufen@x.de', now(),
   jsonb_build_object('name', 'Abgelaufen', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01'));
select public.test_birthdate('00000000-0000-0000-0000-00000000002a', '2000-01-01',
  'f) Abgelaufene Sperre wirkt nicht: 2000-01-01 bleibt stehen');
select public.test_age('00000000-0000-0000-0000-00000000002a', true,
  'f) Abgelaufene Sperre wirkt nicht: age_ok true');
select public.test_block('abgelaufen@x.de', null,
  'f) Abgelaufene Zeile wird bei der Anmeldung entfernt (Aufräumen in handle_new_user)');
select public.test_block('gueltig-f@x.de', current_date + 1,
  'f) Gegenprobe: das Aufräumen bei der Anmeldung fasst die gültige Zeile nicht an');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002a', false);
select public.delete_my_account();
reset role;
select public.test_block('abgelaufen@x.de', null,
  'f) Abgelaufene Zeile fehlt auch nach dem Löschen (Aufräumen in remember_age_block)');

-- ---------- g) Admin-Löschung legt dieselbe Zeile an wie die Selbstlöschung ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000002b', 'admin@x.de', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-00000000002c', 'admin-loescht@x.de', now(),
   jsonb_build_object('name', 'Admin Loescht', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text)),
  ('00000000-0000-0000-0000-00000000002d', 'admin-ueber@x.de', now(),
   jsonb_build_object('name', 'Admin Ueber', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '20 years')::date)::text));
update public.profiles set is_admin = true where id = '00000000-0000-0000-0000-00000000002b';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002b', false);
select public.admin_delete_member('00000000-0000-0000-0000-00000000002c'::uuid);
select public.admin_delete_member('00000000-0000-0000-0000-00000000002d'::uuid);
reset role;
select public.test_check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000002c'),
  'g) Admin-Löschung hat das Konto entfernt');
select public.test_block('admin-loescht@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'g) Admin-Löschung unter 16: dieselbe Sperre wie bei der Selbstlöschung (gleiches Datum)');
select public.test_block('admin-ueber@x.de', null,
  'g) Gegenprobe: Admin-Löschung eines Kontos über 16 legt KEINE Zeile an');

-- ---------- i) Unbestätigte Adresse legt beim Löschen KEINE Sperre an (Befund 1) ----------
-- Angriff: Jemand legt ein Konto mit der FREMDEN Adresse opfer@x.de an, ohne Bestätigung, und gibt ein Datum
--   unter 16 an. Löscht der Admin dieses Konto, darf daraus keine Sperre auf die Adresse des Opfers entstehen.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000031', 'opfer@x.de', null,
   jsonb_build_object('name', 'Unbestaetigt', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text)),
  ('00000000-0000-0000-0000-000000000032', 'bestaetigt-loeschen@x.de', now(),
   jsonb_build_object('name', 'Bestaetigt Loeschen', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
select public.test_birthdate('00000000-0000-0000-0000-000000000031', (current_date - interval '10 years')::date,
  'i) Vorbedingung: unbestätigtes Konto hat das Datum hinterlegt');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002b', false);
select public.admin_delete_member('00000000-0000-0000-0000-000000000031'::uuid);
select public.admin_delete_member('00000000-0000-0000-0000-000000000032'::uuid);
reset role;
select public.test_check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000031'),
  'i) Admin-Löschung hat das unbestätigte Konto entfernt');
select public.test_block('opfer@x.de', null,
  'i) Unbestätigte Adresse: KEINE Sperre beim Löschen durch den Admin');
select public.test_block('bestaetigt-loeschen@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'i) Gegenprobe: bestätigte Adresse mit gleichem Datum legt die Sperre an');
-- Das Opfer meldet sich mit seiner echten, bestätigten Adresse an: Das erfundene Datum wird NICHT aufgezwungen.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000033', 'opfer@x.de', now(),
   jsonb_build_object('name', 'Opfer', 'headline', 'Baut eine Firma', 'birthdate', '1990-06-15'));
select public.test_birthdate('00000000-0000-0000-0000-000000000033', '1990-06-15',
  'i) Opfer mit bestätigter Adresse: das eigene Datum bleibt stehen, keine Sperre greift');
select public.test_age('00000000-0000-0000-0000-000000000033', true,
  'i) Opfer mit bestätigter Adresse: age_ok true');

-- ---------- j) Nicht-Admin erzeugt über admin_delete_member() keine Sperre für ein fremdes Konto ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000034', 'nicht-admin-ziel@x.de', now(),
   jsonb_build_object('name', 'Nicht Admin Ziel', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000025', false);
reset role;
select public.test_error_as('authenticated',
  $q$select public.admin_delete_member('00000000-0000-0000-0000-000000000034'::uuid)$q$,
  'Nur für Admins.%', 'j) Nicht-Admin: Löschung eines fremden Kontos wird abgelehnt');
select public.test_check(exists (select 1 from auth.users where id = '00000000-0000-0000-0000-000000000034'),
  'j) Nicht-Admin: das fremde Konto ist noch da');
select public.test_block('nicht-admin-ziel@x.de', null,
  'j) Nicht-Admin: keine Sperre für das fremde Konto');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002b', false);
select public.admin_delete_member('00000000-0000-0000-0000-000000000034'::uuid);
reset role;
select public.test_block('nicht-admin-ziel@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'j) Gegenprobe: Admin-Löschung desselben Kontos legt die Sperre an');

-- ---------- k) Eine zweite Sperre verkürzt eine bestehende nicht, eine längere verlängert sie (greatest) ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000035', 'verkuerzung@x.de', now(),
   jsonb_build_object('name', 'Verkuerzung', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000035', false);
select public.delete_my_account();
reset role;
select public.test_block('verkuerzung@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'k) Vorbedingung: erste Sperre bis Datum des 16. Geburtstags (10 Jahre)');
-- Zweites Konto mit einem früheren Geburtsdatum (12 Jahre). Die Adresse wird danach auf die gesperrte geändert.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000036', 'andere-adresse@x.de', now(),
   jsonb_build_object('name', 'Andere Adresse K', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '12 years')::date)::text));
update auth.users set email = 'verkuerzung@x.de' where id = '00000000-0000-0000-0000-000000000036';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000036', false);
select public.delete_my_account();
reset role;
select public.test_block('verkuerzung@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'k) Kürzere zweite Sperre (12 Jahre) verkürzt die bestehende nicht');
-- Gegenprobe: ein späteres Datum (5 Jahre) verlängert die Sperre tatsächlich.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000037', 'andere-zwei@x.de', now(),
   jsonb_build_object('name', 'Andere Zwei', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '5 years')::date)::text));
update auth.users set email = 'verkuerzung@x.de' where id = '00000000-0000-0000-0000-000000000037';
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000037', false);
select public.delete_my_account();
reset role;
select public.test_block('verkuerzung@x.de', ((current_date - interval '5 years')::date + interval '16 years')::date,
  'k) Gegenprobe: längere zweite Sperre (5 Jahre) setzt das spätere Datum');

-- ---------- l) Plus-Zusatz: max+neu@x.de und max@x.de sind derselbe Schlüssel (Befund 6) ----------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000038', 'plus-test+tag@x.de', now(),
   jsonb_build_object('name', 'Plus Tag', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000038', false);
select public.delete_my_account();
reset role;
select public.test_block('plus-test@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'l) Sperre unter der Adresse ohne Zusatz gefunden (Konto war plus-test+tag@x.de)');
select public.test_check(public.age_block_key('plus-test+a@x.de') = public.age_block_key('plus-test@x.de'),
  'l) Der Zusatz nach + ändert den Schlüssel nicht');
select public.test_check(public.age_block_key('plus-test@x.de') <> public.age_block_key('plustest@x.de'),
  'l) Gegenprobe: ein Bindestrich ist kein Zusatz, der Schlüssel bleibt anders');
select public.test_check(public.age_block_key('p.lus@x.de') <> public.age_block_key('plus@x.de'),
  'l) Gegenprobe: Punkte werden NICHT entfernt (bewusst offen, siehe Migration Block 4)');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000039', 'plus-test+neu@x.de', now(),
   jsonb_build_object('name', 'Plus Neu', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01'));
select public.test_birthdate('00000000-0000-0000-0000-000000000039', ((current_date - interval '10 years')::date)::date,
  'l) Neuanmeldung mit Zusatz (plus-test+neu@x.de) stellt das Datum wieder her');

-- ---------- m) Sperre auf Antrag löschen: nur Admin, und sonst nichts (Befund 3, Nachbesserung) ----------
-- Vorbedingung: Sperre für unter16@x.de (aus a) und das daraus stammende Datum des Kontos 26 (aus d).
select public.test_block('unter16@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'm) Vorbedingung: Sperre für unter16@x.de liegt vor');
select public.test_birthdate('00000000-0000-0000-0000-000000000026', (current_date - interval '5 years')::date,
  'm) Vorbedingung: Konto 26 hat sein Datum hinterlegt');
select public.test_profile('00000000-0000-0000-0000-000000000026', 'pending', false, true,
  'm) Vorbedingung: Konto 26 wartet auf Prüfung und hat ein Datum');
-- Nicht-Admin (25) darf nicht löschen. Die Sperre bleibt stehen.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000025', false);
reset role;
select public.test_error_as('authenticated',
  $q$select public.admin_clear_age_block('unter16@x.de')$q$,
  'Nur für Admins.%', 'm) Nicht-Admin: Sperre löschen wird abgelehnt');
select public.test_block('unter16@x.de', ((current_date - interval '10 years')::date + interval '16 years')::date,
  'm) Nicht-Admin: die Sperre bleibt stehen');
select public.test_birthdate('00000000-0000-0000-0000-000000000026', (current_date - interval '5 years')::date,
  'm) Nicht-Admin: das Datum bleibt stehen');
-- Admin (2b) hebt die Sperre auf. Mehr geschieht nicht: Das Geburtsdatum von Konto 26 und sein Profil bleiben.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002b', false);
select public.test_check(public.admin_clear_age_block('unter16@x.de') is true,
  'm) Admin: admin_clear_age_block liefert true, wenn eine Sperre gelöscht wurde (Gegenprobe zum Nicht-Admin oben)');
reset role;
select public.test_block('unter16@x.de', null, 'm) Admin: die Sperre ist gelöscht');
select public.test_birthdate('00000000-0000-0000-0000-000000000026', (current_date - interval '5 years')::date,
  'm) Admin: das Geburtsdatum von Konto 26 bleibt unverändert (die Aufhebung der Sperre berührt kein Datum)');
select public.test_profile('00000000-0000-0000-0000-000000000026', 'pending', false, true,
  'm) Admin: Profil 26 bleibt unverändert (wartend, nicht öffentlich, Datum vorhanden)');
-- Die Zusage, die den hohen Befund festhält: Ohne Sperre, aber mit vorhandenem Datum, weist
--   set_my_birthdate() ein Lügendatum weiterhin ab. Die Abweisung kommt vom Primärschlüssel.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000026', false);
select public.test_error_as('authenticated',
  $q$select public.set_my_birthdate('2000-01-01')$q$,
  'Dein Geburtsdatum ist schon eingetragen%',
  'm) Nach dem Aufheben: set_my_birthdate mit Lügendatum 2000-01-01 wird weiter abgewiesen (Befund hoch)');
select public.test_birthdate('00000000-0000-0000-0000-000000000026', (current_date - interval '5 years')::date,
  'm) Nach der Abweisung: das Datum von Konto 26 ist unverändert');
-- Gegenprobe: Adresse OHNE Sperre. Konto 25 hat ein Datum (2000-01-01, aus c) und nie eine Sperre bekommen.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002b', false);
select public.test_check(public.admin_clear_age_block('anderer-mensch@x.de') is false,
  'm) Admin: Adresse ohne Sperre liefert false');
reset role;
select public.test_birthdate('00000000-0000-0000-0000-000000000025', '2000-01-01',
  'm) Adresse ohne Sperre: das Geburtsdatum von Konto 25 bleibt unberührt');
-- Zweiter Aufruf nach erfolgreichem Aufheben: nichts mehr da, also false.
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000002b', false);
select public.test_check(public.admin_clear_age_block('unter16@x.de') is false,
  'm) Admin: zweiter Aufruf nach erfolgreichem Aufheben liefert false');
reset role;

-- ---------- o) Datensparsamkeit: set_at ist weg, blocked_until bleibt (Befund 7) ----------
select public.test_check(
  not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'age_blocks' and column_name = 'set_at')
  and exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'age_blocks' and column_name = 'blocked_until'),
  'o) Spalte set_at ist weg, blocked_until ist da (Gegenprobe)');

-- ---------- h) Rechte: anon, authenticated, service_role (Befund 5 und Rechte der Migration) ----------
-- Reihenfolge je Zusage: ZUERST die Prüfung, dass es abgelehnt wird (das ist der Zustand, den die Migration
--   herstellt). DANN die Gegenprobe mit erteiltem Recht. DANN der Entzug, damit der Rest nicht auf einem
--   veränderten Zustand läuft.
-- Vorab die Sitzung leeren: Eine noch gesetzte Kennung würde anon wie einen angemeldeten Nutzer behandeln.
select set_config('request.jwt.claim.sub', '', false);
select public.test_check((select relrowsecurity from pg_class where oid = 'public.age_blocks'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.age_block_secret'::regclass),
  'h) Zeilenschutz ist an für age_blocks und age_block_secret');

-- a) Zustand der Migration: keine Rechte
select public.test_denied_as('anon', $q$select count(*) from public.age_blocks$q$, 'h) anon: age_blocks ohne Recht');
select public.test_denied_as('authenticated', $q$select count(*) from public.age_blocks$q$, 'h) authenticated: age_blocks ohne Recht');
select public.test_denied_as('service_role', $q$select count(*) from public.age_blocks$q$, 'h) service_role: age_blocks ohne Recht');
select public.test_denied_as('anon', $q$select count(*) from public.age_block_secret$q$, 'h) anon: age_block_secret ohne Recht');
select public.test_denied_as('authenticated', $q$select count(*) from public.age_block_secret$q$, 'h) authenticated: age_block_secret ohne Recht');
select public.test_denied_as('service_role', $q$select count(*) from public.age_block_secret$q$, 'h) service_role: age_block_secret ohne Recht');
select public.test_denied_as('service_role', $q$select count(*) from public.member_birthdates$q$, 'h) service_role: member_birthdates ohne Recht (die Sperre gegen das Nachtragen)');
select public.test_denied_as('anon', $q$select public.age_block_key('x@x.de')$q$, 'h) anon: age_block_key nicht ausführbar');
select public.test_denied_as('authenticated', $q$select public.age_block_key('x@x.de')$q$, 'h) authenticated: age_block_key nicht ausführbar');
select public.test_denied_as('service_role', $q$select public.age_block_key('x@x.de')$q$, 'h) service_role: age_block_key nicht ausführbar');
select public.test_denied_as('anon', $q$select public.remember_age_block('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'h) anon: remember_age_block nicht ausführbar');
select public.test_denied_as('authenticated', $q$select public.remember_age_block('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'h) authenticated: remember_age_block nicht ausführbar');
select public.test_denied_as('service_role', $q$select public.remember_age_block('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'h) service_role: remember_age_block nicht ausführbar');
select public.test_denied_as('anon', $q$select public.delete_my_account()$q$, 'h) anon: delete_my_account nicht ausführbar');
select public.test_denied_as('anon', $q$select public.admin_delete_member('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'h) anon: admin_delete_member nicht ausführbar');
select public.test_denied_as('anon', $q$select public.admin_clear_age_block('x@x.de')$q$, 'h) anon: admin_clear_age_block nicht ausführbar');
select public.test_denied_as('service_role', $q$select public.admin_clear_age_block('x@x.de')$q$, 'h) service_role: admin_clear_age_block nicht ausführbar');

-- b) Gegenprobe: mit erteiltem Recht funktioniert derselbe Weg. Ohne diesen Schritt wäre die Ablehnung oben
--    auch ein Fehler im Stub oder in der Rolle.
grant select on public.age_blocks, public.age_block_secret to anon, authenticated, service_role;
grant execute on function public.age_block_key(text) to anon, authenticated, service_role;
grant execute on function public.remember_age_block(uuid) to anon, authenticated, service_role;
grant execute on function public.delete_my_account() to anon;
grant execute on function public.admin_delete_member(uuid) to anon;
grant execute on function public.admin_clear_age_block(text) to anon;
grant execute on function public.admin_clear_age_block(text) to service_role;
grant select on public.member_birthdates to service_role;
select public.test_runs_as('anon', $q$select count(*) from public.age_blocks$q$, 'h) Gegenprobe anon: age_blocks ist mit Recht abfragbar');
select public.test_runs_as('authenticated', $q$select count(*) from public.age_blocks$q$, 'h) Gegenprobe authenticated: age_blocks ist mit Recht abfragbar');
select public.test_runs_as('service_role', $q$select count(*) from public.age_blocks$q$, 'h) Gegenprobe service_role: age_blocks ist mit Recht abfragbar');
select public.test_runs_as('service_role', $q$select count(*) from public.age_block_secret$q$, 'h) Gegenprobe service_role: age_block_secret ist mit Recht abfragbar');
select public.test_runs_as('service_role', $q$select count(*) from public.member_birthdates$q$, 'h) Gegenprobe service_role: member_birthdates ist mit Recht abfragbar');
select public.test_runs_as('anon', $q$select public.age_block_key('x@x.de')$q$, 'h) Gegenprobe anon: age_block_key läuft mit Recht');
select public.test_runs_as('service_role', $q$select public.age_block_key('x@x.de')$q$, 'h) Gegenprobe service_role: age_block_key läuft mit Recht');
-- remember_age_block ohne hinterlegtes Datum ist ein No-Op und damit gefahrlos aufrufbar.
select public.test_runs_as('anon', $q$select public.remember_age_block('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'h) Gegenprobe anon: remember_age_block läuft mit Recht (No-Op ohne Datum)');
select public.test_runs_as('service_role', $q$select public.remember_age_block('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'h) Gegenprobe service_role: remember_age_block läuft mit Recht (No-Op)');
select public.test_error_as('anon', $q$select public.delete_my_account()$q$, 'Nicht angemeldet.%',
  'h) Gegenprobe anon: delete_my_account läuft mit Recht bis zur eigenen Prüfung (ohne Kennung)');
select public.test_error_as('anon', $q$select public.admin_delete_member('00000000-0000-0000-0000-0000000000ff'::uuid)$q$, 'Nur für Admins.%',
  'h) Gegenprobe anon: admin_delete_member läuft mit Recht bis zur eigenen Prüfung');
select public.test_error_as('anon', $q$select public.admin_clear_age_block('x@x.de')$q$, 'Nur für Admins.%',
  'h) Gegenprobe anon: admin_clear_age_block läuft mit Recht bis zur eigenen Prüfung');
select public.test_error_as('service_role', $q$select public.admin_clear_age_block('x@x.de')$q$, 'Nur für Admins.%',
  'h) Gegenprobe service_role: admin_clear_age_block läuft mit Recht bis zur eigenen Prüfung');

-- c) Entzug wieder: der Rest des Tests läuft auf dem Zustand der Migration.
revoke all on public.age_blocks, public.age_block_secret from anon, authenticated, service_role;
revoke execute on function public.age_block_key(text) from public, anon, authenticated, service_role;
revoke execute on function public.remember_age_block(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.delete_my_account() from anon;
revoke execute on function public.admin_delete_member(uuid) from anon;
revoke execute on function public.admin_clear_age_block(text) from anon, service_role;
revoke all on public.member_birthdates from service_role;

-- ---------- n) Auffangnetz: Anmeldung und Löschung gehen durch, auch wenn die Sperrliste fehlt (Befund 4) ----------
-- Die Protokolleinträge lassen sich in psql nicht als Ergebnis prüfen. Geprüft wird, dass die Anmeldung
--   durchläuft und ein Profil entsteht, und dass das Löschen nicht scheitert.

-- n1) new.email ist null
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000003a', null, now(),
   jsonb_build_object('name', 'Ohne Mail', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
select public.test_check(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000003a'),
  'n1) new.email ist null: Anmeldung läuft durch, Profil entsteht');

-- n2) new.email ist leer
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000003b', '', now(),
   jsonb_build_object('name', 'Leere Mail', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
select public.test_check(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000003b'),
  'n2) new.email ist leer: Anmeldung läuft durch, Profil entsteht');

-- n3) Die Pfeffer-Zeile fehlt. Sie wird gesichert und danach zurückgeschrieben.
create table tmp_pepper as select * from public.age_block_secret;
delete from public.age_block_secret;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000003c', 'pfeffer-fehlt@x.de', now(),
   jsonb_build_object('name', 'Pfeffer Fehlt', 'headline', 'Baut eine Firma',
                      'birthdate', ((current_date - interval '10 years')::date)::text));
select public.test_check(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000003c'),
  'n3) Pfeffer-Zeile fehlt: Anmeldung läuft durch, Profil entsteht');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000003c', false);
select public.delete_my_account();
reset role;
select public.test_check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000003c'),
  'n3) Pfeffer-Zeile fehlt: das Löschen läuft durch (kein Fehler nach außen)');
insert into public.age_block_secret select * from tmp_pepper;
drop table tmp_pepper;
select public.test_check((select encode(pepper, 'hex') from public.age_block_secret where id = 1) = :'pepper_vorher',
  'n3) Pfeffer nach der Wiederherstellung unverändert');
select public.test_block('verkuerzung@x.de', ((current_date - interval '5 years')::date + interval '16 years')::date,
  'n3) Nach der Wiederherstellung des Pfeffers ist die Sperrliste wieder lesbar (Zeile aus k)');

-- n4) Die Tabelle age_blocks fehlt. Sie wird gesichert und danach neu angelegt.
create table tmp_blocks as select * from public.age_blocks;
drop table public.age_blocks;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000003d', 'tabelle-fehlt@x.de', now(),
   jsonb_build_object('name', 'Tabelle Fehlt', 'headline', 'Baut eine Firma', 'birthdate', '2000-01-01'));
select public.test_check(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000003d'),
  'n4) age_blocks fehlt: Anmeldung läuft durch, Profil entsteht');
select public.test_birthdate('00000000-0000-0000-0000-00000000003d', '2000-01-01',
  'n4) age_blocks fehlt: das Datum bleibt wie eingetragen (Sperre übersprungen, mit Protokolleintrag)');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000003d', false);
select public.delete_my_account();
reset role;
select public.test_check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000003d'),
  'n4) age_blocks fehlt: das Löschen läuft durch (kein Fehler nach außen)');
create table public.age_blocks (
  key           bytea primary key,
  blocked_until date not null
);
alter table public.age_blocks enable row level security;
revoke all on public.age_blocks from anon, authenticated, service_role;
insert into public.age_blocks select * from tmp_blocks;
drop table tmp_blocks;
select public.test_block('verkuerzung@x.de', ((current_date - interval '5 years')::date + interval '16 years')::date,
  'n4) Nach Wiederherstellung der Tabelle sind die Zeilen wieder da (Zeile aus k)');

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Sperrliste Mindestalter 16, Migration 20261118180000)'; end $$;
