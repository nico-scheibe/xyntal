-- Unbestätigte Konten: public.purge_unconfirmed_accounts(), public.admin_purge_unconfirmed() und die Spalte
--   "confirmed" in public.admin_members(). Gehört zu supabase/migrations/20261127120000_unbestaetigte_konten.sql,
--   die hier aus dem Repo geladen wird (nicht nachgebaut).
--
-- WAS BELEGT WIRD: Gelöscht werden nur Konten, die nie bestätigt, nie angemeldet, älter als 24 Stunden, nicht
--   angefasst (pending, kein Admin) und ohne Anbieter-Anmeldung sind. Jede dieser Bedingungen hat ein eigenes Konto,
--   das stehen bleiben muss. Aufrufen dürfen nur Admins (über admin_purge_unconfirmed) und der Eigentümer.
--
-- NACHGEBILDET: auth.users, auth.identities und public.profiles nur mit den Spalten, die die Migration liest.
--   is_admin() ist vereinfacht (Admin-Kennzeichen auf dem Profil); die echte Fassung prüft zusätzlich Sperre und 2FA,
--   das belegen tests/is_admin_sperre.sql und tests/admin_media_log.sql.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser:
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/unbestaetigte_konten.sql
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
grant usage on schema public, auth to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key, email text, phone text,
  email_confirmed_at timestamptz, phone_confirmed_at timestamptz, last_sign_in_at timestamptz,
  confirmation_sent_at timestamptz, created_at timestamptz not null default now(),
  raw_app_meta_data jsonb not null default '{}'::jsonb
);
create table auth.identities (user_id uuid not null references auth.users (id) on delete cascade, provider text not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text, headline text, about text, phase text, category text, offer text, seek text,
  linkedin text, instagram text, website text, is_public boolean not null default false,
  status text not null default 'pending', is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
$$;

-- Konten. "alt" = vor 3 Tagen angelegt.
insert into auth.users (id, email, email_confirmed_at, phone_confirmed_at, last_sign_in_at, confirmation_sent_at, created_at) values
  ('00000000-0000-0000-0000-000000000001', 'otp-test1@example.com',  null,  null, null, now() - interval '3 days', now() - interval '3 days'),   -- weg
  ('00000000-0000-0000-0000-000000000002', 'ohne-profil@example.com', null, null, null, null,                     now() - interval '3 days'),   -- weg
  ('00000000-0000-0000-0000-000000000003', 'frisch@example.com',     null,  null, null, now() - interval '1 hour', now() - interval '1 hour'),   -- bleibt: jünger als 24 h
  ('00000000-0000-0000-0000-000000000004', 'neuer-link@example.com', null,  null, null, now() - interval '2 hours', now() - interval '3 days'), -- bleibt: Link noch gültig
  ('00000000-0000-0000-0000-000000000005', 'bestaetigt@example.com', now(), null, null, now() - interval '3 days', now() - interval '3 days'),  -- bleibt: bestätigt
  ('00000000-0000-0000-0000-000000000006', 'telefon@example.com',    null,  now(), null, null,                    now() - interval '3 days'),   -- bleibt: Telefon bestätigt
  ('00000000-0000-0000-0000-000000000007', 'angemeldet@example.com', null,  null, now(), null,                    now() - interval '3 days'),   -- bleibt: schon angemeldet
  ('00000000-0000-0000-0000-000000000008', 'freigeschaltet@example.com', null, null, null, null,                  now() - interval '3 days'),   -- bleibt: approved
  ('00000000-0000-0000-0000-000000000009', 'abgelehnt@example.com',  null,  null, null, null,                     now() - interval '3 days'),   -- bleibt: rejected
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.com',      null,  null, null, null,                     now() - interval '3 days'),   -- bleibt: Admin
  ('00000000-0000-0000-0000-00000000000b', 'google@example.com',     null,  null, null, null,                     now() - interval '3 days'),   -- bleibt: Google
  ('00000000-0000-0000-0000-00000000000c', 'echter-admin@example.com', now(), null, now(), null,                  now() - interval '30 days');  -- der Admin für die Proben
insert into public.profiles (id, status, is_admin)
  select id, case email when 'freigeschaltet@example.com' then 'approved' when 'abgelehnt@example.com' then 'rejected' else 'pending' end,
         email in ('admin@example.com', 'echter-admin@example.com')
  from auth.users where email <> 'ohne-profil@example.com';
insert into auth.identities values
  ('00000000-0000-0000-0000-000000000001', 'email'),
  ('00000000-0000-0000-0000-00000000000b', 'google');

-- Migration laden: legt die Funktionen an und räumt einmal auf.
\i supabase/migrations/20261127120000_unbestaetigte_konten.sql

do $$
declare v_left text;
begin
  select string_agg(email, ',' order by email) into v_left from auth.users;
  if v_left <> 'abgelehnt@example.com,admin@example.com,angemeldet@example.com,bestaetigt@example.com,echter-admin@example.com,freigeschaltet@example.com,frisch@example.com,google@example.com,neuer-link@example.com,telefon@example.com' then
    raise exception 'u1 falsch: übrig sind %', v_left;
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000001') then
    raise exception 'u2: Profil hängt noch am gelöschten Konto';
  end if;
  -- Zweiter Lauf löscht nichts mehr
  if public.purge_unconfirmed_accounts() <> 0 then raise exception 'u3: zweiter Lauf hat gelöscht'; end if;
end $$;
\echo 'PASS u1-u3: nur nie bestätigte, nie angemeldete, unberührte Konten älter als 24 Stunden sind weg'

-- Rechte
do $$ begin
  if has_function_privilege('authenticated', 'public.purge_unconfirmed_accounts()', 'execute')
     or has_function_privilege('anon', 'public.purge_unconfirmed_accounts()', 'execute')
     or has_function_privilege('service_role', 'public.purge_unconfirmed_accounts()', 'execute') then
    raise exception 'r1: purge_unconfirmed_accounts ist von außen aufrufbar';
  end if;
  if has_function_privilege('anon', 'public.admin_purge_unconfirmed()', 'execute') then
    raise exception 'r2: anon darf admin_purge_unconfirmed';
  end if;
end $$;

-- Mitglied ohne Admin-Recht wird abgewiesen
update auth.users set confirmation_sent_at = null, created_at = now() - interval '3 days' where email = 'frisch@example.com';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
do $$ begin
  perform public.admin_purge_unconfirmed();
  raise exception 'r3: Mitglied durfte aufräumen';
exception when others then
  if sqlerrm <> 'Nur für Admins.' then raise; end if;
end $$;
-- Admin darf, und admin_members liefert confirmed
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  if public.admin_purge_unconfirmed() <> 1 then raise exception 'r4: Admin-Lauf hat nicht genau ein Konto gelöscht'; end if;
  if (select confirmed from public.admin_members() where email = 'bestaetigt@example.com') is not true
     or (select confirmed from public.admin_members() where email = 'neuer-link@example.com') is not false
     or (select confirmed from public.admin_members() where email = 'telefon@example.com') is not true then
    raise exception 'r5: admin_members().confirmed stimmt nicht';
  end if;
end $$;
reset role;
\echo 'PASS r1-r5: nur Admins und der Eigentümer räumen auf; admin_members liefert confirmed'
