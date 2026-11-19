-- Admin sieht und entfernt Seitenbilder (Bucket page-media) eines Mitglieds. Gehört zu
--   supabase/migrations/20261119120000_admin_seitenbild.sql (ergänzt die beiden Regeln "Xyntal Seitenbild lesen" und
--   "Xyntal Seitenbild entfernen" um den Admin-Zweig). Die Sperr-Kette (Sperrliste 20261118270000, Freiliste 20261118290000)
--   wird aus dem Repo geladen, weil die Regel "Sperre: nichts loeschen" bei gesperrten Admins mitgreift.
--
-- WARUM DIESER TEST: Ein DELETE mit "where" braucht Lese-Sichtbarkeit. Fehlt die Leseregel für Admins, trifft das Löschen
--   0 Zeilen, ohne Fehler. Das sieht wie Erfolg aus. Deshalb belegt der Test BEIDE Regeln, und zwar je Rolle.
--
-- GEMESSEN, NACHGEBILDET, GRENZEN (ehrlich):
--   auth.users, auth.mfa_factors, auth.uid(), auth.jwt(): nachgebildet. auth.uid() liest request.jwt.claim.sub, wie test_login.
--   storage.objects, storage.buckets, storage.foldername(), storage.protect_delete(): nachgebildet. Der Trigger-Rumpf
--     (protect_objects_delete) ist WÖRTLICH aus der Produktion (gemessen am 19.11.2026). Hier nicht geprüft, weil
--     test_allow(true) ihn immer öffnet. Die Sperr-Kette ist unverändert aus dem Repo.
--   Die Regeln "Xyntal Seitenbild lesen" und "Xyntal Seitenbild entfernen" vor der Migration: WÖRTLICH aus der
--     Produktion (pg_policies.qual am 19.11.2026, Block v).
--   public.mfa_ok(), public.ban_active(), public.me_banned(), public.is_admin(): WÖRTLICH aus der Produktion.
--   "2FA erzwingen" (restriktiv, ALL): WÖRTLICH aus der Produktion.
--   Die Regeln "Sperre: nichts loeschen" und "Xyntal Seitenbild ..." werden nicht nachgebaut, sondern aus dem Repo geladen
--     bzw. aus der Produktion übernommen.
--   BYPASSRLS (service_role) ist hier nicht nachgebildet. Dieser Test sagt nichts über service_role.
--   Die Mfa-Prüfung in is_admin() ist für storage.objects REDUNDANT zur restriktiven Regel "2FA erzwingen", die dieselbe
--     Funktion mfa_ok() ALL-Befehle prüft. Zusage c1/c2 belegt deshalb den Gesamtweg (Regel "2FA erzwingen" plus is_admin),
--     nicht allein is_admin(). Die Mutation "mfa_ok aus is_admin() entfernt" bleibt deshalb GRÜN (siehe Kopf der Migration
--     und Mutationsbericht).
--
-- ZUSAGEN (jede positive Messung hat eine Gegenprobe):
--   v) VORHER (Produktion): Admin sieht fremde Zeile nicht, löscht nichts (DELETE 0, Zeile bleibt). Eigentümer sieht und
--      löscht seine Zeile.
--   a) LESEN: Admin A1 sieht fremde Zeile (ein Gegenstück: M1 sieht nicht). Gesperrter Admin A2 sieht nicht. Admin A3 ohne
--      aal2 sieht nicht; mit aal2 sieht er.
--   b) LÖSCHEN durch Admin: M1 löscht nicht (Gegenprobe Zeile liegt noch). Gesperrter A2 löscht nicht. Admin A1 löscht
--      (DELETE 1; Gegenprobe Zeile weg). Dass A1 die restriktive Regel "Sperre: nichts loeschen" passiert, ist im selben
--      Zusage belegt (nicht gesperrter Admin, Bucket page-media ist nicht auf der Freiliste).
--   c) LÖSCHEN, Admin ohne aal2: A3 mit aal1 löscht nicht (Gegenprobe Zeile liegt noch). A3 mit aal2 löscht (DELETE 1).
--   d) EIGENTÜMER: M2 löscht eigene Zeile (DELETE 1). M2 löscht fremde Zeile von M1 nicht (DELETE 0, Gegenprobe Zeile liegt noch).
--   e) STRUKTUR: Beide Regeln sind PERMISSIVE, für den richtigen Befehl, nur authenticated, und der Ausdruck nennt
--      page-media, auth.uid() und is_admin(). "Sperre: nichts loeschen" und "2FA erzwingen" sind unverändert RESTRICTIVE.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser (in der lokalen Testdatenbank postgres):
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/admin_seitenbild_loeschen.sql
\set ON_ERROR_STOP on

-- Testkennungen (UUIDs, kein echtes Konto)
\set M1 '00000000-0000-0000-0000-000000000001'
\set M2 '00000000-0000-0000-0000-000000000002'
\set A1 '00000000-0000-0000-0000-000000000003'
\set A2 '00000000-0000-0000-0000-000000000004'
\set A3 '00000000-0000-0000-0000-000000000005'

set datestyle = 'ISO, YMD';

-- Rollen: in Supabase immer vorhanden. In einer leeren Testdatenbank müssen sie angelegt werden.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- Standardrechte wie in Supabase, VOR allen Tabellen und Funktionen. Ausführen als postgres.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- auth (nachgebildet) ----------
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);

-- ---------- storage.objects (wie tests/sperre_nichts_loeschen.sql) ----------
create table storage.objects (
  id                uuid        not null default gen_random_uuid(),
  bucket_id         text,
  name              text,
  owner             uuid,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  metadata          jsonb,
  path_tokens       text[],
  version           text,
  owner_id          text,
  user_metadata     jsonb,
  archived_at       timestamptz,
  is_delete_marker  boolean     not null default false,
  is_versioned      boolean     not null default false
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on storage.objects to service_role;

-- ---------- storage.buckets (nachgebildet, nur id und name und public) ----------
create table storage.buckets (id text primary key, name text, public boolean not null default false);
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', false), ('banners', 'banners', false), ('xyntal-app-files', 'xyntal-app-files', false),
  ('message-attachments', 'message-attachments', false), ('page-media', 'page-media', true), ('project-images', 'project-images', false);

-- NACHGEBILDET, nicht gemessen: Ordner-Funktion. Die Regeln nutzen nur [1], für 'M2/datei.jpg' also 'M2'.
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- ---------- Trigger protect_objects_delete (GEMESSEN, Rumpf wörtlich aus der Produktion am 19.11.2026) ----------
create or replace function storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();

-- ---------- public: Tabellen (nachgebildet) ----------
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
alter table public.profiles enable row level security;
-- Zeilenschutz vereinfacht: nur der Zweig für die eigene Zeile (nachgebildet).
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (id = (select auth.uid()));

-- ---------- public: Funktionen (wörtlich aus der Produktion, am 19.11.2026 gelesen) ----------
create or replace function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;
revoke execute on function public.ban_active(boolean, timestamptz) from public;
grant execute on function public.ban_active(boolean, timestamptz) to anon, authenticated;

create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

create or replace function public.me_banned()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and public.ban_active(banned, banned_until));
$$;
revoke execute on function public.me_banned() from public, anon;
grant execute on function public.me_banned() to authenticated, service_role;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and not public.ban_active(banned, banned_until) from public.profiles where id = auth.uid()), false) and public.mfa_ok();
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------- Bestehende Regeln auf storage.objects (wörtlich) ----------
-- 2FA erzwingen (restriktiv, für alle Befehle). Wörtlich aus supabase/migrations/20261109120000_security_hardening.sql.
drop policy if exists "2FA erzwingen" on storage.objects;
create policy "2FA erzwingen" on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Seitenbild-Regeln VOR der Migration (wörtlich aus der Produktion, pg_policies.qual am 19.11.2026)
drop policy if exists "Xyntal Seitenbild lesen" on storage.objects;
create policy "Xyntal Seitenbild lesen" on storage.objects
  as permissive for select to authenticated
  using (bucket_id = 'page-media' and ((storage.foldername(name))[1] = (select auth.uid())::text));
drop policy if exists "Xyntal Seitenbild entfernen" on storage.objects;
create policy "Xyntal Seitenbild entfernen" on storage.objects
  as permissive for delete to authenticated
  using (bucket_id = 'page-media' and ((storage.foldername(name))[1] = (select auth.uid())::text));

-- ---------- Testfunktionen (nur in dieser Testdatenbank) ----------
-- "is not true" besteht nur bei echtem true. NULL besteht nicht.
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;

-- Setzt Kennung und aal der Sitzung. Die Rolle stellt der Aufrufer per "set role" um.
create function public.test_login_aal(p_uid text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  perform set_config('request.jwt.claims', case when coalesce(p_uid, '') = '' then '{}'
    else json_build_object('sub', p_uid, 'aal', p_aal)::text end, false);
end $$;
create function public.test_login(p_uid text) returns void language plpgsql as $$
begin
  perform public.test_login_aal(p_uid, 'aal1');
end $$;

-- Prüft Rolle UND Kennung. Nach jedem Rollenwechsel aufrufen.
create function public.test_expect(p_role text, p_uid text, msg text) returns void language plpgsql as $$
begin
  if current_user::text is distinct from p_role
     or coalesce(auth.uid()::text, '') is distinct from coalesce(p_uid, '') then
    raise exception 'TEST FEHLGESCHLAGEN (%): Rolle "%" (erwartet "%"), Kennung "%" (erwartet "%")',
      msg, current_user::text, p_role, coalesce(auth.uid()::text, ''), coalesce(p_uid, '');
  end if;
  raise notice 'OK: %', msg;
end $$;

-- Legt eine Datei an. Nur als postgres aufrufen (Eigentümer umgeht RLS).
create function public.test_seed(p_bucket text, p_name text) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata) values (p_bucket, p_name, jsonb_build_object('size', 1000));
end $$;

-- Zählt die Zeilen als postgres, also ohne RLS. Prüft, ob eine Datei wirklich da ist oder entfernt wurde.
create function public.test_count(p_bucket text, p_name text) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = p_bucket and name = p_name;
$$;

-- Zählt die Zeilen, die die AKTUELLE Rolle sehen darf (RLS gilt). Nach "set role authenticated" aufrufen.
create function public.test_visible(p_bucket text, p_name text) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = p_bucket and name = p_name;
$$;

-- Ist die aktuelle Sitzung Admin laut public.is_admin()? Nach "set role authenticated" aufrufen.
create function public.test_is_admin() returns boolean language sql stable as $$
  select public.is_admin();
$$;

-- Setzt die Einstellung, die der Trigger prüft. true = Löschen erlaubt.
create function public.test_allow(p_on boolean) returns void language plpgsql as $$
begin
  perform set_config('storage.allow_delete_query', case when p_on then 'true' else '' end, false);
end $$;

-- Löscht eine Datei. Ergebnis: 'ok:n' mit der Zeilenzahl. RLS meldet keinen Fehler, sondern 0 Zeilen.
create function public.test_delete(p_bucket text, p_name text) returns text language plpgsql as $$
declare n integer;
begin
  delete from storage.objects where bucket_id = p_bucket and name = p_name;
  get diagnostics n = row_count;
  return 'ok:' || n;
end $$;

-- ---------- Testdaten (nur in dieser Testdatenbank) ----------
-- M1, M2 normale Mitglieder. A1 Admin, frei, ohne 2FA-Faktor. A2 Admin, unbefristet gesperrt. A3 Admin mit verifiziertem Faktor.
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

-- Die Sperr-Kette aus dem Repo, in derselben Reihenfolge wie tests/sperre_nichts_loeschen.sql.
-- Die Regel "Sperre: nichts loeschen" in ihrer heutigen Fassung (Freiliste) entsteht durch 20261118290000.
\i supabase/migrations/20261118270000_sperre_nichts_loeschen.sql
\i supabase/migrations/20261118290000_sperre_loeschen_freiliste.sql

-- ---------- v) VORHER: die Lücke, wie sie auf der Produktion gemessen wurde ----------
\echo == v) VORHER
select public.test_allow(true);
select public.test_seed('page-media', :'M2' || '/v-datei.jpg');
select public.test_seed('page-media', :'M2' || '/v-eigen.jpg');
select public.test_check(public.test_count('page-media', :'M2' || '/v-datei.jpg') = 1, 'v0 Vorbedingung: Datei in page-media liegt vor');
select public.test_login(:'A1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'v0 Sitzung: Admin A1 als authenticated');
select public.test_check(public.test_is_admin() is true, 'v0 Vorbedingung: A1 ist is_admin() (sonst ist v1 leer)');
select public.test_check(public.test_visible('page-media', :'M2' || '/v-datei.jpg') = 0, 'v1 VORHER: Admin A1 sieht fremde Datei in page-media nicht (Lücke belegt)');
select public.test_check(public.test_delete('page-media', :'M2' || '/v-datei.jpg') is not distinct from 'ok:0', 'v2 VORHER: Admin A1 löscht fremde Datei nicht (DELETE 0, ohne Fehler)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/v-datei.jpg') = 1, 'v2 Gegenprobe: Datei liegt noch, der DELETE 0 war echt');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'v3 Sitzung: Eigentümer M2 als authenticated');
select public.test_check(public.test_visible('page-media', :'M2' || '/v-eigen.jpg') = 1, 'v3 VORHER: Eigentümer M2 sieht eigene Datei');
select public.test_check(public.test_delete('page-media', :'M2' || '/v-eigen.jpg') is not distinct from 'ok:1', 'v3 VORHER: Eigentümer M2 löscht eigene Datei (ok:1)');
reset role;

-- ---------- Migration laden ----------
\echo == Migration 20261119120000_admin_seitenbild.sql laden
reset role;
\i supabase/migrations/20261119120000_admin_seitenbild.sql

-- ---------- a) LESEN ----------
\echo == a) Lesen
reset role;
select public.test_seed('page-media', :'M2' || '/a-datei.jpg');
select public.test_check(public.test_count('page-media', :'M2' || '/a-datei.jpg') = 1, 'a0 Vorbedingung: Datei in page-media liegt vor');
select public.test_login(:'A1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'a0 Sitzung: Admin A1 als authenticated');
select public.test_check(public.test_is_admin() is true, 'a0 Vorbedingung: A1 ist is_admin()');
select public.test_check(public.test_visible('page-media', :'M2' || '/a-datei.jpg') = 1, 'a1 NACHHER: Admin A1 sieht fremde Datei in page-media');
reset role;
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'a2 Sitzung: normales Mitglied M1 als authenticated');
select public.test_check(public.test_visible('page-media', :'M2' || '/a-datei.jpg') = 0, 'a2 Gegenprobe: normales Mitglied M1 sieht fremde Datei NICHT');
reset role;
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'a3 Sitzung: Eigentümer M2 als authenticated');
select public.test_check(public.test_visible('page-media', :'M2' || '/a-datei.jpg') = 1, 'a3 Eigentümer M2 sieht eigene Datei (Eigentümer-Zweig intakt)');
reset role;
select public.test_login(:'A2');
set role authenticated;
select public.test_expect('authenticated', :'A2', 'a4 Sitzung: gesperrter Admin A2 als authenticated');
select public.test_check(public.test_is_admin() is false, 'a4 Vorbedingung: gesperrter A2 ist NICHT is_admin()');
select public.test_check(public.test_visible('page-media', :'M2' || '/a-datei.jpg') = 0, 'a4 gesperrter Admin A2 sieht fremde Datei NICHT');
reset role;
select public.test_login_aal(:'A3', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'a5 Sitzung: Admin A3 mit aal1 als authenticated');
select public.test_check(public.test_is_admin() is false, 'a5 Vorbedingung: A3 mit aal1 ist NICHT is_admin() (verifizierter Faktor)');
select public.test_check(public.test_visible('page-media', :'M2' || '/a-datei.jpg') = 0, 'a5 Admin A3 ohne aal2 sieht fremde Datei NICHT');
reset role;
select public.test_login_aal(:'A3', 'aal2');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'a6 Sitzung: Admin A3 mit aal2 als authenticated');
select public.test_check(public.test_is_admin() is true, 'a6 Vorbedingung: A3 mit aal2 ist is_admin()');
select public.test_check(public.test_visible('page-media', :'M2' || '/a-datei.jpg') = 1, 'a6 Admin A3 mit aal2 sieht fremde Datei');
reset role;

-- ---------- b) LÖSCHEN durch Admin ----------
\echo == b) Löschen durch Admin
reset role;
select public.test_allow(true);
select public.test_seed('page-media', :'M2' || '/b-datei.jpg');
select public.test_check(public.test_count('page-media', :'M2' || '/b-datei.jpg') = 1, 'b0 Vorbedingung: Datei in page-media liegt vor');
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'b1 Sitzung: normales Mitglied M1 als authenticated');
select public.test_check(public.test_delete('page-media', :'M2' || '/b-datei.jpg') is not distinct from 'ok:0', 'b1 normales Mitglied M1 löscht fremde Datei NICHT (DELETE 0)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/b-datei.jpg') = 1, 'b2 Gegenprobe: Datei liegt noch');
select public.test_login(:'A2');
set role authenticated;
select public.test_expect('authenticated', :'A2', 'b3 Sitzung: gesperrter Admin A2 als authenticated');
select public.test_check(public.test_delete('page-media', :'M2' || '/b-datei.jpg') is not distinct from 'ok:0', 'b3 gesperrter Admin A2 löscht fremde Datei NICHT (DELETE 0)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/b-datei.jpg') = 1, 'b4 Gegenprobe: Datei liegt noch');
select public.test_login(:'A1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'b5 Sitzung: Admin A1 als authenticated');
select public.test_check(public.test_delete('page-media', :'M2' || '/b-datei.jpg') is not distinct from 'ok:1', 'b5 NACHHER: Admin A1 löscht fremde Datei (DELETE 1; nicht gesperrt, also passiert er auch die Sperre)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/b-datei.jpg') = 0, 'b6 Gegenprobe: Datei ist weg (durch den Admin, nicht durch den Test)');

-- ---------- c) LÖSCHEN, Admin ohne aal2 ----------
\echo == c) Admin ohne aal2
reset role;
select public.test_seed('page-media', :'M2' || '/c-datei.jpg');
select public.test_check(public.test_count('page-media', :'M2' || '/c-datei.jpg') = 1, 'c0 Vorbedingung: Datei in page-media liegt vor');
select public.test_login_aal(:'A3', 'aal1');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'c1 Sitzung: Admin A3 mit aal1 als authenticated');
select public.test_check(public.test_delete('page-media', :'M2' || '/c-datei.jpg') is not distinct from 'ok:0', 'c1 Admin A3 ohne aal2 löscht NICHT (DELETE 0)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/c-datei.jpg') = 1, 'c2 Gegenprobe: Datei liegt noch');
select public.test_login_aal(:'A3', 'aal2');
set role authenticated;
select public.test_expect('authenticated', :'A3', 'c3 Sitzung: Admin A3 mit aal2 als authenticated');
select public.test_check(public.test_delete('page-media', :'M2' || '/c-datei.jpg') is not distinct from 'ok:1', 'c3 Admin A3 mit aal2 löscht (DELETE 1)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/c-datei.jpg') = 0, 'c4 Gegenprobe: Datei ist weg');

-- ---------- d) EIGENTÜMER ----------
\echo == d) Eigentümer
reset role;
select public.test_seed('page-media', :'M2' || '/d-eigen.jpg');
select public.test_seed('page-media', :'M1' || '/d-fremd.jpg');
select public.test_check(public.test_count('page-media', :'M2' || '/d-eigen.jpg') = 1 and public.test_count('page-media', :'M1' || '/d-fremd.jpg') = 1, 'd0 Vorbedingung: beide Dateien liegen vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'd1 Sitzung: Eigentümer M2 als authenticated');
select public.test_check(public.test_delete('page-media', :'M2' || '/d-eigen.jpg') is not distinct from 'ok:1', 'd1 Eigentümer M2 löscht eigene Datei (DELETE 1)');
select public.test_check(public.test_delete('page-media', :'M1' || '/d-fremd.jpg') is not distinct from 'ok:0', 'd2 M2 löscht fremde Datei von M1 NICHT (DELETE 0)');
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/d-eigen.jpg') = 0, 'd3 Gegenprobe: eigene Datei ist weg');
select public.test_check(public.test_count('page-media', :'M1' || '/d-fremd.jpg') = 1, 'd4 Gegenprobe: fremde Datei von M1 liegt noch');

-- ---------- e) STRUKTUR der Regeln in pg_policies ----------
\echo == e) Struktur
reset role;
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'Xyntal Seitenbild lesen' and permissive = 'PERMISSIVE' and cmd = 'SELECT' and roles::text = '{authenticated}'
  and qual like '%page-media%' and qual like '%auth.uid()%' and qual like '%is_admin()%') = 1,
  'e1 Regel "Xyntal Seitenbild lesen": PERMISSIVE, SELECT, {authenticated}, Ausdruck nennt page-media, auth.uid() und is_admin()');
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'Xyntal Seitenbild entfernen' and permissive = 'PERMISSIVE' and cmd = 'DELETE' and roles::text = '{authenticated}'
  and qual like '%page-media%' and qual like '%auth.uid()%' and qual like '%is_admin()%') = 1,
  'e2 Regel "Xyntal Seitenbild entfernen": PERMISSIVE, DELETE, {authenticated}, Ausdruck nennt page-media, auth.uid() und is_admin()');
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'Sperre: nichts loeschen' and permissive = 'RESTRICTIVE' and cmd = 'DELETE' and roles::text = '{authenticated}'
  and qual like '%me_banned%' and qual like '%xyntal-app-files%' and qual not like '%page-media%') = 1,
  'e3 Regel "Sperre: nichts loeschen" unverändert: RESTRICTIVE, DELETE, nennt die Freiliste und me_banned(), nicht page-media');
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname = '2FA erzwingen' and permissive = 'RESTRICTIVE' and cmd = 'ALL' and roles::text = '{authenticated}') = 1,
  'e4 Regel "2FA erzwingen" unverändert: RESTRICTIVE, ALL, {authenticated}');

\echo == Ende: alle Blöcke durchgelaufen
