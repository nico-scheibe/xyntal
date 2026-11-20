-- Prüfprotokoll für kontoübergreifende Admin-Löschungen von Seitenbildern: public.admin_media_log und
--   public.admin_media_log_write(uuid,text,text,text). Gehört zu supabase/migrations/20261120120000_admin_media_log.sql,
--   die hier aus dem Repo geladen wird (nicht nachgebaut).
--
-- WAS BELEGT WIRD, in einem Satz: Schreiben kann nur ein Admin und nur über die Funktion, die handelnde Person kann der
--   Aufrufer nicht wählen, lesen kann nur ein Admin, und ändern oder löschen kann niemand über die Schnittstelle.
--   Jede positive Messung hat eine Gegenprobe.
--
-- NACHGEBILDET: auth.uid(), auth.jwt(), auth.mfa_factors, public.profiles, ban_active(), mfa_ok() und is_admin() sind
--   WÖRTLICH aus der Produktion (gelesen mit pg_get_functiondef am 20.11.2026, Zeichen für Zeichen gleich der Fassung,
--   die tests/admin_seitenbild_protokoll.sql am 19.11.2026 verwendet hat).
--   Die Vorgabe-Rechte des Schemas (alter default privileges ... grant all on tables) sind wie in Supabase gesetzt. Das
--   ist hier nicht Beiwerk: Sie geben der NEUEN Tabelle zunächst alle Rechte an anon, authenticated und service_role.
--   Dass die Tabelle hinterher trotzdem nur lesbar ist, belegt, dass der revoke der Migration gegen die Vorgabe gewinnt.
--
-- NICHT NACHGEBILDET, und was das für die Aussagekraft heißt:
--   BYPASSRLS (service_role in Supabase) ist hier nicht nachgebildet. Dieser Test belegt für service_role nur, dass das
--     TABELLENRECHT fehlt — und genau darauf kommt es an, weil BYPASSRLS nur den Zeilenschutz umgeht, nicht das
--     Tabellenrecht. Die Zusage i3 misst das.
--   Der Eigentümer (postgres) umgeht beides. Dass er Zeilen ändern kann, ist eine Grenze der Konstruktion, kein Fehler
--     des Tests; sie steht im Kopf der Migration.
--
-- ZUSAGEN (Gegenproben in Klammern):
--   v) Vorbedingungen: A1 ist is_admin(), M1 ist es nicht.
--   a) Nicht-Admin M1 bekommt "Nur für Admins." (Gegenprobe: Admin A1 schreibt, bekommt eine Kennung > 0).
--   b) Gesperrter Admin A2 bekommt "Nur für Admins.".
--   c) Admin A3 mit verifiziertem Faktor und aal1 bekommt "Nur für Admins." (Gegenprobe: mit aal2 schreibt er).
--      WICHTIG, damit diese Zusage nicht mehr verspricht, als sie hält: Sie gilt nur für einen Admin, der einen
--      VERIFIZIERTEN zweiten Faktor hat. mfa_ok() hat eine dritte Klausel und gibt wahr zurück, wenn gar kein
--      verifizierter Faktor existiert. Auf der Produktion hat der einzige Admin heute keinen (gemessen am
--      20.11.2026), dort schreibt ein Admin also auch auf aal1 — abgebildet in c4, nicht weggelassen. "aal1 wird
--      abgewiesen" wäre als Satz über diese Produktion falsch; richtig ist: aal1 wird abgewiesen, SOBALD ein
--      zweiter Faktor verifiziert ist. Wer das je ändert, muss c4 rot werden lassen, nicht c1.
--   d) anon darf die Funktion nicht ausführen (42501) und die Tabelle nicht lesen (42501).
--   e) Dateiname: nur die Form der Speicher-Regel (<uuid>.<endung>, kleingeschrieben) wird angenommen
--      (Gegenprobe: gültige Form wird angenommen). Zeilenumbruch, Großbuchstaben, fremde Endung, Überlänge: abgelehnt.
--   f) Lager und Ergebnis: nur die vorgesehenen Werte (Gegenprobe: beide Lager und beide Ergebnisse gehen).
--   g) Die handelnde Person kommt aus auth.uid(), nicht vom Aufrufer: A1 schreibt eine Zeile über das Konto M2, und in
--      der Zeile steht A1 als admin_id. Es gibt keinen Weg, eine andere Person einzutragen.
--   h) Lesen: Admin A1 sieht die Zeilen, auch die eines anderen Admins (Gegenprobe: M1 sieht 0 Zeilen, FEHLERFREI —
--      genau die selbsterfüllende Falle, die am 19.11. auf dem Leseweg der Oberfläche stand). Gesperrter A2 sieht 0.
--      A3 ohne aal2 sieht 0 (Gegenprobe: mit aal2 sieht er alle).
--   i) Unveränderlich: authenticated bekommt bei insert, update und delete 42501 (fehlendes Tabellenrecht, nicht Regel).
--      i3: anon und service_role haben auf der Tabelle überhaupt kein Recht.
--   j) Struktur: Zeilenschutz an, genau eine Regel und nur für SELECT, Funktion SECURITY DEFINER mit festem search_path,
--      EXECUTE für authenticated, nicht für anon und nicht für service_role.
--
-- GRENZE DES TESTS: Er misst die Datenbank. Dass die beiden Löschwege die Funktion WIRKLICH aufrufen, misst er nicht;
--   das steht in public/pages/admin-people.js und hosting/daki/media-store.cjs und wird dort von tests/media-store.cjs
--   und tests/admin-ui.cjs geprüft. Und er sagt nichts über Löschungen, die an beiden Wegen vorbeigehen — siehe die
--   Grenze im Kopf der Migration.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser:
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/admin_media_log.sql
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
grant usage on schema public, auth to anon, authenticated, service_role;
-- Wie in Supabase. Siehe Kopf: Die neue Tabelle bekommt dadurch zunächst ALLE Rechte, und der revoke der Migration
-- muss sie wieder abräumen.
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

-- Ruft den Schreibweg auf und fängt JEDEN Fehler ab. Ergebnis: 'ok:<kennung>' oder 'raised:<SQLSTATE>:<Meldung>'.
-- So sieht eine Ablehnung nie aus wie ein Erfolg, und ein Fehler bricht den Lauf nicht unbemerkt ab.
create function public.test_write(p_account uuid, p_file text, p_store text, p_result text)
returns text language plpgsql as $$
declare v_id bigint;
begin
  v_id := public.admin_media_log_write(p_account, p_file, p_store, p_result);
  return 'ok:' || v_id::text;
exception when others then
  return 'raised:' || SQLSTATE || ':' || SQLERRM;
end $$;

-- Zählt die Zeilen, die die aktuelle Sitzung SEHEN DARF. Ein Fehler (fehlendes Recht) wird abgefangen.
create function public.test_count() returns text language plpgsql as $$
declare n bigint;
begin
  select count(*) into n from public.admin_media_log;
  return 'n:' || n::text;
exception when others then
  return 'raised:' || SQLSTATE || ':' || SQLERRM;
end $$;

-- Versucht, das Protokoll zu verändern. Ergebnis: 'ok' (schlecht) oder 'raised:<SQLSTATE>:…'.
create function public.test_tamper(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
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
-- Die Migration enthält eine eigene Verhaltensprobe (ein Nicht-Admin wird abgewiesen). Läuft sie hier durch, ist
-- zugleich belegt, dass diese Probe in einer Datenbank mit echten Profilen greift.
\i supabase/migrations/20261120120000_admin_media_log.sql

-- ---------- v) Vorbedingungen ----------
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
select public.test_check((select count(*) from public.admin_media_log) = 0, 'v3 Vorbedingung: das Protokoll ist leer (die Probe der Migration hat nichts geschrieben)');

-- ---------- a) Nicht-Admin ----------
\echo == a) Nicht-Admin
select public.test_login_aal(:'M1', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'a0 Sitzung: M1 als authenticated');
select public.test_check(
  public.test_write(:'M2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'supabase', 'geloescht') = 'raised:P0001:Nur für Admins.',
  'a1 Nicht-Admin M1 schreibt NICHT (P0001, "Nur für Admins.")');
reset role;
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'a2 Sitzung: Admin A1 als authenticated');
select public.test_check(
  public.test_write(:'M2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'supabase', 'geloescht') like 'ok:%',
  'a3 Gegenprobe: Admin A1 schreibt (Kennung zurück)');
reset role;
select public.test_check((select count(*) from public.admin_media_log) = 1, 'a4 Gegenprobe: genau eine Zeile steht im Protokoll');

-- ---------- b) gesperrter Admin ----------
\echo == b) gesperrter Admin
select public.test_login_aal(:'A2', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A2', 'b0 Sitzung: gesperrter Admin A2 als authenticated');
select public.test_check(public.is_admin() is false, 'b0 Vorbedingung: gesperrter A2 ist NICHT is_admin()');
select public.test_check(
  public.test_write(:'M2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg', 'supabase', 'geloescht') = 'raised:P0001:Nur für Admins.',
  'b1 gesperrter Admin A2 schreibt NICHT');
reset role;

-- ---------- c) Admin ohne aal2 ----------
\echo == c) Admin mit verifiziertem Faktor
select public.test_login_aal(:'A3', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'c0 Sitzung: A3 mit aal1 als authenticated');
select public.test_check(
  public.test_write(:'M2', 'cccccccc-cccc-cccc-cccc-cccccccccccc.jpg', 'supabase', 'geloescht') = 'raised:P0001:Nur für Admins.',
  'c1 Admin A3 ohne aal2 schreibt NICHT');
reset role;
select public.test_login_aal(:'A3', 'aal2');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'c2 Sitzung: A3 mit aal2 als authenticated');
select public.test_check(
  public.test_write(:'M2', 'cccccccc-cccc-cccc-cccc-cccccccccccc.jpg', 'supabase', 'geloescht') like 'ok:%',
  'c3 Gegenprobe: Admin A3 mit aal2 schreibt');
reset role;

-- c4 bildet die Produktion vom 20.11.2026 ab: A1 hat KEINEN verifizierten Faktor, also greift die dritte Klausel von
-- mfa_ok() und er schreibt auch auf aal1. Das ist keine Lücke dieser Tabelle, sondern die Entscheidung von mfa_ok(),
-- und sie gilt für jede Zusage im Projekt, die an is_admin() hängt. Die Gegenprobe dazu ist c1: dasselbe Konto mit
-- einem verifizierten Faktor wird auf aal1 abgewiesen.
-- Die Vorbedingung wird als postgres geprüft: authenticated hat auf auth.mfa_factors kein Leserecht, und ein
-- Rechtefehler an dieser Stelle würde nur den Test aufhalten, nicht eine Zusage belegen.
select public.test_check(
  (select not exists (select 1 from auth.mfa_factors where user_id = :'A1' and status = 'verified')),
  'c4a Vorbedingung: A1 hat keinen verifizierten Faktor');
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(
  public.test_write(:'M2', 'cccccccc-cccc-cccc-cccc-cccccccccccd.jpg', 'supabase', 'geloescht') like 'ok:%',
  'c4b Admin ohne verifizierten Faktor schreibt auf aal1 (dritte Klausel von mfa_ok)');
reset role;

-- ---------- d) anon ----------
\echo == d) anon
reset role;
select public.test_login_aal('', 'aal1');
set role anon;
select public.test_expect('anon', '', 'd0 Sitzung: anon');
select public.test_check(
  public.test_write(:'M2', 'dddddddd-dddd-dddd-dddd-dddddddddddd.jpg', 'supabase', 'geloescht') like 'raised:42501:%',
  'd1 anon darf die Funktion nicht ausführen (42501)');
select public.test_check(public.test_count() like 'raised:42501:%', 'd2 anon darf die Tabelle nicht lesen (42501)');
reset role;

-- ---------- e) Dateiname ----------
\echo == e) Dateiname
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(public.test_write(:'M2', 'x.jpg', 'supabase', 'geloescht') = 'raised:P0001:Ungültiger Dateiname.',
  'e1 Dateiname ohne UUID-Form wird abgelehnt');
select public.test_check(public.test_write(:'M2', 'messung-protokoll.jpg', 'supabase', 'geloescht') = 'raised:P0001:Ungültiger Dateiname.',
  'e2 erfundener Name messung-protokoll.jpg wird abgelehnt (der Fall aus den drei Probeeinträgen vom 19.11.)');
select public.test_check(public.test_write(:'M2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' || chr(10) || '.jpg', 'supabase', 'geloescht') = 'raised:P0001:Ungültiger Dateiname.',
  'e3 Zeilenumbruch im Dateinamen wird abgelehnt');
select public.test_check(public.test_write(:'M2', 'EEEEEEEE-EEEE-EEEE-EEEE-EEEEEEEEEEEE.jpg', 'supabase', 'geloescht') = 'raised:P0001:Ungültiger Dateiname.',
  'e4 Großbuchstaben werden abgelehnt');
select public.test_check(public.test_write(:'M2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.exe', 'supabase', 'geloescht') = 'raised:P0001:Ungültiger Dateiname.',
  'e5 Endung außerhalb der Liste wird abgelehnt');
select public.test_check(public.test_write(:'M2', repeat('a', 70) || '.jpg', 'supabase', 'geloescht') = 'raised:P0001:Ungültiger Dateiname.',
  'e6 überlanger Dateiname wird abgelehnt');
select public.test_check(public.test_write(:'M2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.webp', 'supabase', 'geloescht') like 'ok:%',
  'e7 Gegenprobe: gültige Form (webp) wird angenommen');
reset role;

-- ---------- f) Lager und Ergebnis ----------
\echo == f) Lager und Ergebnis
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(public.test_write(:'M2', 'ffffffff-ffff-ffff-ffff-ffffffffffff.jpg', 'irgendwo', 'geloescht') = 'raised:P0001:Unbekanntes Lager.',
  'f1 unbekanntes Lager wird abgelehnt');
select public.test_check(public.test_write(:'M2', 'ffffffff-ffff-ffff-ffff-ffffffffffff.jpg', 'supabase', 'nicht geloescht') = 'raised:P0001:Unbekanntes Ergebnis.',
  'f2 "nicht geloescht" ist kein erlaubtes Ergebnis (bewusste Entscheidung, siehe Migrationskopf)');
select public.test_check(public.test_write(:'M2', 'ffffffff-ffff-ffff-ffff-ffffffffffff.jpg', 'eigener-server', 'geloescht') like 'ok:%',
  'f3 Gegenprobe: Lager "eigener-server" geht');
select public.test_check(public.test_write(:'M2', 'ffffffff-ffff-ffff-ffff-ffffffffffff.mp4', 'supabase', 'ungewiss') like 'ok:%',
  'f4 Gegenprobe: Ergebnis "ungewiss" geht');
reset role;

-- ---------- g) die handelnde Person kommt aus auth.uid() ----------
\echo == g) handelnde Person
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
-- A1 schreibt eine Zeile über das Konto M2. In der Zeile muss A1 stehen, nicht M2. Es gibt keinen Parameter für die
-- handelnde Person; diese Zusage belegt, dass auch keiner über p_account hineinrutscht.
select public.test_check(public.test_write(:'M2', '99999999-9999-9999-9999-999999999999.png', 'supabase', 'geloescht') like 'ok:%',
  'g0 A1 schreibt eine Zeile über das Konto M2');
reset role;
select public.test_check(
  (select admin_id from public.admin_media_log where file_name = '99999999-9999-9999-9999-999999999999.png') = :'A1'::uuid,
  'g1 In der Zeile steht A1 als handelnde Person (aus auth.uid())');
select public.test_check(
  (select account_id from public.admin_media_log where file_name = '99999999-9999-9999-9999-999999999999.png') = :'M2'::uuid,
  'g2 In der Zeile steht M2 als betroffenes Konto');
select public.test_check(
  (select count(*) from pg_proc p, unnest(p.proargnames) a
    where p.oid = 'public.admin_media_log_write(uuid,text,text,text)'::regprocedure and a like '%admin%') = 0,
  'g3 Die Funktion hat überhaupt keinen Parameter für die handelnde Person');

-- ---------- h) Lesen ----------
\echo == h) Lesen
select public.test_check((select count(*) from public.admin_media_log) > 1, 'h0 Vorbedingung: es stehen mehrere Zeilen im Protokoll');
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
select public.test_check(public.test_count() = 'n:' || (select count(*) from public.admin_media_log)::text, 'h1 Admin A1 sieht ALLE Zeilen');
reset role;
-- Die Gegenprobe, die am 19.11. auf dem Leseweg gefehlt hat: M1 bekommt KEINEN Fehler, sondern eine leere Antwort.
-- Deshalb steht hier beides: dass es 0 Zeilen sind UND dass es kein Fehler war.
select public.test_login_aal(:'M1', 'aal1');
set role authenticated;
select public.test_check(public.test_count() = 'n:0', 'h2 Gegenprobe: Nicht-Admin M1 sieht 0 Zeilen, FEHLERFREI (leere Antwort, kein 42501)');
reset role;
select public.test_login_aal(:'A2', 'aal1');
set role authenticated;
select public.test_check(public.test_count() = 'n:0', 'h3 gesperrter Admin A2 sieht 0 Zeilen');
reset role;
select public.test_login_aal(:'A3', 'aal1');
set role authenticated;
select public.test_check(public.test_count() = 'n:0', 'h4 Admin A3 ohne aal2 sieht 0 Zeilen');
reset role;
select public.test_login_aal(:'A3', 'aal2');
set role authenticated;
select public.test_check(public.test_count() = 'n:' || (select count(*) from public.admin_media_log)::text, 'h5 Gegenprobe: A3 mit aal2 sieht alle Zeilen');
reset role;

-- ---------- i) unveränderlich ----------
\echo == i) unveraenderlich
select public.test_login_aal(:'A1', 'aal1');
set role authenticated;
-- Ein Admin ist hier bewusst angemeldet: Selbst wer lesen darf, darf nicht ändern. 42501 heißt "fehlendes Recht";
-- es kommt NICHT von einer Regel, denn für insert, update und delete gibt es gar keine.
select public.test_check(
  public.test_tamper($$insert into public.admin_media_log (admin_id, account_id, file_name, store, result)
    values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111.jpg','supabase','geloescht')$$) like 'raised:42501:%',
  'i1 Admin A1 kann nicht direkt einfügen (42501, fehlendes Tabellenrecht)');
select public.test_check(
  public.test_tamper($$update public.admin_media_log set result = 'ungewiss'$$) like 'raised:42501:%',
  'i2a Admin A1 kann keine Zeile ändern (42501)');
select public.test_check(
  public.test_tamper($$delete from public.admin_media_log$$) like 'raised:42501:%',
  'i2b Admin A1 kann keine Zeile löschen (42501)');
select public.test_check(
  public.test_tamper($$truncate public.admin_media_log$$) like 'raised:42501:%',
  'i2c Admin A1 kann die Tabelle nicht leeren (42501)');
reset role;
-- Gegenprobe zu i1 bis i2c: Die Zeilen sind nach den Versuchen unverändert.
select public.test_check((select count(*) from public.admin_media_log where result = 'geloescht') >= 4,
  'i2d Gegenprobe: die Zeilen stehen nach allen Versuchen unverändert da');
select public.test_check(
  not has_table_privilege('anon', 'public.admin_media_log', 'SELECT')
  and not has_table_privilege('anon', 'public.admin_media_log', 'INSERT')
  and not has_table_privilege('service_role', 'public.admin_media_log', 'SELECT')
  and not has_table_privilege('service_role', 'public.admin_media_log', 'INSERT')
  and not has_table_privilege('service_role', 'public.admin_media_log', 'UPDATE')
  and not has_table_privilege('service_role', 'public.admin_media_log', 'DELETE'),
  'i3 anon und service_role haben auf der Tabelle kein Recht (der revoke gewinnt gegen die Vorgabe-Rechte des Schemas)');
select public.test_check(
  has_table_privilege('authenticated', 'public.admin_media_log', 'SELECT')
  and not has_table_privilege('authenticated', 'public.admin_media_log', 'INSERT')
  and not has_table_privilege('authenticated', 'public.admin_media_log', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.admin_media_log', 'DELETE'),
  'i4 authenticated darf NUR lesen');

-- ---------- j) Struktur ----------
\echo == j) Struktur
reset role;
select public.test_check((select relrowsecurity from pg_class where oid = 'public.admin_media_log'::regclass) is true,
  'j1 Zeilenschutz ist aktiv');
select public.test_check((select count(*) from pg_policies where schemaname='public' and tablename='admin_media_log') = 1,
  'j2 es gibt genau eine Regel');
select public.test_check((select cmd from pg_policies where schemaname='public' and tablename='admin_media_log') = 'SELECT',
  'j3 die einzige Regel ist für SELECT');
select public.test_check((select p.prosecdef from pg_proc p where p.oid = 'public.admin_media_log_write(uuid,text,text,text)'::regprocedure) is true,
  'j4 die Funktion ist SECURITY DEFINER');
select public.test_check(exists (select 1 from pg_proc p, unnest(p.proconfig) c
    where p.oid = 'public.admin_media_log_write(uuid,text,text,text)'::regprocedure and c like 'search_path=%'),
  'j5 search_path ist festgelegt');
select public.test_check(
  has_function_privilege('authenticated', 'public.admin_media_log_write(uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_media_log_write(uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_media_log_write(uuid,text,text,text)', 'EXECUTE'),
  'j6 EXECUTE: authenticated ja, anon und service_role nein');

\echo == Ende: alle Bloecke durchgelaufen
