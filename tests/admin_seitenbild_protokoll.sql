-- Protokoll über das Entfernen von Seitenbildern: public.admin_log_page_media_delete(text). Gehört zu
--   supabase/migrations/20261119140000_admin_seitenbild_protokoll.sql und ihrer Ergänzung 20261119150000_admin_seitenbild_protokoll_pfad.sql
--   (die Ergänzung schärft den Dateiteil; beide Dateien werden hier in dieser Reihenfolge geladen).
--
-- WAS BELEGT WIRD: Nur ein Admin, dessen Sitzung public.is_admin() erfüllt, darf den Protokolleintrag schreiben.
--   Jede positive Messung hat eine Gegenprobe. Die Prüfung steht in der Funktion selbst, nicht nur in der Oberfläche.
--   Der Pfad wird streng geprüft, weil er in das Serverprotokoll geschrieben wird.
--
-- GRENZE DES TESTS: Der Test prüft, WER die Funktion ausführen darf und dass der Pfad geprüft wird. Ob die Zeile im
--   Serverprotokoll erscheint, zeigt der Test nicht. Das Protokoll (raise log) wird nicht als Tabelle gelesen. Beim Lauf
--   von Hand mit client_min_messages = log sieht man die Zeile in der Ausgabe.
--   Die Grenze des Protokolls selbst (nur Oberflächen-Löschungen, kein Prüfprotokoll) steht im Kopf der Migration.
--
-- NACHGEBILDET wie in tests/admin_seitenbild_loeschen.sql: auth.uid() und auth.jwt(), auth.mfa_factors, public.profiles,
--   ban_active(), mfa_ok() und is_admin() sind WÖRTLICH aus der Produktion (gelesen am 19.11.2026).
--
-- ZUSAGEN (Gegenproben in Klammern):
--   a) Nicht-Admin M1 bekommt "Nur für Admins." (Gegenprobe: Admin A1 führt aus, ok).
--   b) Gesperrter Admin A2 bekommt "Nur für Admins." (is_admin() schließt gesperrte Admins aus).
--   c) Admin A3 mit verifiziertem Faktor und aal1 bekommt "Nur für Admins." (Gegenprobe: mit aal2 ok).
--   d) anon bekommt keine Ausführung (SQLSTATE 42501).
--   e) Ungültiger Pfad wird abgelehnt (Gegenprobe: gültiger Pfad ok).
--   g) Dateiteil: nur die Form der Speicher-Regel (UUID.ext, kleingeschrieben) wird protokolliert. Ein erfundener Name
--      wie messung-protokoll.jpg wird abgelehnt (Ergänzung 20261119150000).
--   f) Struktur: SECURITY DEFINER, search_path festgelegt, anon darf nicht, authenticated darf.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser:
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/admin_seitenbild_protokoll.sql
\set ON_ERROR_STOP on

\set M1 '00000000-0000-0000-0000-000000000001'
\set M2 '00000000-0000-0000-0000-000000000002'
\set A1 '00000000-0000-0000-0000-000000000003'
\set A2 '00000000-0000-0000-0000-000000000004'
\set A3 '00000000-0000-0000-0000-000000000005'

set datestyle = 'ISO, YMD';

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- auth (nachgebildet) ----------
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);

-- ---------- public: Tabellen und Funktionen (wörtlich aus der Produktion) ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and not public.ban_active(banned, banned_until) from public.profiles where id = auth.uid()), false) and public.mfa_ok();
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------- Testfunktionen (nur in dieser Testdatenbank) ----------
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;

create function public.test_login_aal(p_uid text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  perform set_config('request.jwt.claims', case when coalesce(p_uid, '') = '' then '{}'
    else json_build_object('sub', p_uid, 'aal', p_aal)::text end, false);
end $$;

create function public.test_expect(p_role text, p_uid text, msg text) returns void language plpgsql as $$
begin
  if current_user::text is distinct from p_role
     or coalesce(auth.uid()::text, '') is distinct from coalesce(p_uid, '') then
    raise exception 'TEST FEHLGESCHLAGEN (%): Rolle "%" (erwartet "%"), Kennung "%" (erwartet "%")',
      msg, current_user::text, p_role, coalesce(auth.uid()::text, ''), coalesce(p_uid, '');
  end if;
  raise notice 'OK: %', msg;
end $$;

-- Ruft die Funktion auf und fängt JEDEN Fehler ab. Ergebnis: 'ok' oder 'raised:<SQLSTATE>:<Meldung>'.
-- So sieht eine Ablehnung nie aus wie ein Erfolg, und ein Fehler bricht den Lauf nicht unbemerkt ab.
create function public.test_log(p_path text) returns text language plpgsql as $$
begin
  perform public.admin_log_page_media_delete(p_path);
  return 'ok';
exception when others then
  return 'raised:' || SQLSTATE || ':' || SQLERRM;
end $$;

-- ---------- Testdaten ----------
insert into auth.users (id, email, email_confirmed_at) values
  (:'M1', 'm1@test.invalid', now()), (:'M2', 'm2@test.invalid', now()),
  (:'A1', 'a1@test.invalid', now()), (:'A2', 'a2@test.invalid', now()), (:'A3', 'a3@test.invalid', now());
insert into public.profiles (id, status, banned, banned_until, is_admin) values
  (:'M1', 'approved', false, null, false),
  (:'M2', 'approved', false, null, false),
  (:'A1', 'approved', false, null, true),
  (:'A2', 'approved', true, null, true),
  (:'A3', 'approved', false, null, true);
insert into auth.mfa_factors (user_id, status) values (:'A3', 'verified');

-- ---------- Migration laden ----------
\i supabase/migrations/20261119140000_admin_seitenbild_protokoll.sql
\i supabase/migrations/20261119150000_admin_seitenbild_protokoll_pfad.sql

-- ---------- Vorbedingungen ----------
\echo == v) Vorbedingungen
reset role;
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(public.is_admin() is true, 'v1 Vorbedingung: A1 ist is_admin()');
reset role;
select public.test_login_aal(:'M1', 'aal1');
set role authenticated;
select public.test_check(public.is_admin() is false, 'v2 Vorbedingung: M1 ist NICHT is_admin()');
reset role;

-- ---------- a) Nicht-Admin ----------
\echo == a) Nicht-Admin
select public.test_login_aal(:'M1', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'a0 Sitzung: M1 als authenticated');
select public.test_check(public.test_log(:'M2' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg') = 'raised:P0001:Nur für Admins.', 'a1 Nicht-Admin M1 führt die Funktion NICHT aus (P0001, "Nur für Admins.")');
reset role;
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'a2 Sitzung: Admin A1 als authenticated');
select public.test_check(public.test_log(:'M2' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg') = 'ok', 'a3 Gegenprobe: Admin A1 führt die Funktion aus (ok)');
reset role;

-- ---------- b) gesperrter Admin ----------
\echo == b) gesperrter Admin
select public.test_login_aal(:'A2', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A2', 'b0 Sitzung: gesperrter Admin A2 als authenticated');
select public.test_check(public.is_admin() is false, 'b0 Vorbedingung: gesperrter A2 ist NICHT is_admin()');
select public.test_check(public.test_log(:'M2' || '/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg') = 'raised:P0001:Nur für Admins.', 'b1 gesperrter Admin A2 führt die Funktion NICHT aus');
reset role;

-- ---------- c) Admin ohne aal2 ----------
\echo == c) Admin mit verifiziertem Faktor
select public.test_login_aal(:'A3', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'c0 Sitzung: A3 mit aal1 als authenticated');
select public.test_check(public.test_log(:'M2' || '/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg') = 'raised:P0001:Nur für Admins.', 'c1 Admin A3 ohne aal2 führt die Funktion NICHT aus');
reset role;
select public.test_login_aal(:'A3', 'aal2');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'c2 Sitzung: A3 mit aal2 als authenticated');
select public.test_check(public.test_log(:'M2' || '/cccccccc-cccc-cccc-cccc-cccccccccccc.jpg') = 'ok', 'c3 Gegenprobe: Admin A3 mit aal2 führt die Funktion aus (ok)');
reset role;

-- ---------- d) anon ----------
\echo == d) anon
reset role;
select public.test_login_aal('', 'aal1');
set role anon;
select public.test_expect('anon', '', 'd0 Sitzung: anon');
select public.test_check(public.test_log(:'M2' || '/dddddddd-dddd-dddd-dddd-dddddddddddd.jpg') like 'raised:42501:%', 'd1 anon darf die Funktion nicht ausführen (42501)');
reset role;

-- ---------- e) Pfad ----------
\echo == e) Pfad
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(public.test_log('kein-pfad') = 'raised:P0001:Ungültiger Dateipfad.', 'e1 Pfad ohne Ordner wird abgelehnt');
select public.test_check(public.test_log(:'M2' || '/x' || chr(10) || 'gefaelscht.jpg') = 'raised:P0001:Ungültiger Dateipfad.', 'e2 Zeilenumbruch im Dateinamen wird abgelehnt');
select public.test_check(public.test_log(:'M2' || '/../x.jpg') = 'raised:P0001:Ungültiger Dateipfad.', 'e3 Pfad mit .. wird abgelehnt');
select public.test_check(public.test_log(:'M2' || '/eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.jpg') = 'ok', 'e4 Gegenprobe: gültiger Pfad wird protokolliert (ok)');
reset role;

-- ---------- g) Dateiteil in der Form der Speicher-Regel (20261119150000) ----------
\echo == g) Dateiteil
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(public.test_log(:'M2' || '/messung-protokoll.jpg') = 'raised:P0001:Ungültiger Dateipfad.', 'g1 erfundener Name messung-protokoll.jpg wird abgelehnt (genau der Fall aus den Probeeinträgen)');
select public.test_check(public.test_log(:'M2' || '/x.jpg') = 'raised:P0001:Ungültiger Dateipfad.', 'g2 Dateiname ohne UUID-Form wird abgelehnt');
select public.test_check(public.test_log(:'M2' || '/AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA.jpg') = 'raised:P0001:Ungültiger Dateipfad.', 'g3 Großbuchstaben im Dateinamen werden abgelehnt');
select public.test_check(public.test_log(:'M2' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.exe') = 'raised:P0001:Ungültiger Dateipfad.', 'g4 Endung außerhalb der Liste wird abgelehnt');
select public.test_check(public.test_log(:'M2' || '/' || repeat('a', 120) || '.jpg') = 'raised:P0001:Ungültiger Dateipfad.', 'g5 überlanger Dateiname wird abgelehnt');
select public.test_check(public.test_log(:'M2' || '/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.webp') = 'ok', 'g6 Gegenprobe: gültige Form (webp) wird protokolliert (ok)');
reset role;

-- ---------- f) Struktur ----------
\echo == f) Struktur
reset role;
select public.test_check((select p.prosecdef from pg_proc p where p.oid = 'public.admin_log_page_media_delete(text)'::regprocedure) is true,
  'f1 Funktion ist SECURITY DEFINER');
select public.test_check(exists (select 1 from pg_proc p, unnest(p.proconfig) c where p.oid = 'public.admin_log_page_media_delete(text)'::regprocedure and c like 'search_path=%'),
  'f2 search_path ist festgelegt');
select public.test_check(not has_function_privilege('anon', 'public.admin_log_page_media_delete(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_log_page_media_delete(text)', 'EXECUTE'),
  'f3 EXECUTE: authenticated ja, anon nein');

\echo == Ende: alle Blöcke durchgelaufen
