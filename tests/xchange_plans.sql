-- Xchange-Tarifabfrage (Migration 20261121120000_xchange_plans.sql). Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/xchange_plans.sql
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users(id uuid primary key);
create table auth.identities(provider text, provider_id text, user_id uuid);
grant usage on schema public to anon, authenticated;
create table public.profiles(id uuid primary key, plan text not null default 'Free');

\i supabase/migrations/20261121120000_xchange_plans.sql

insert into public.profiles values
  ('00000000-0000-0000-0000-000000000001', 'Pro'),
  ('00000000-0000-0000-0000-000000000002', 'Free'),
  ('00000000-0000-0000-0000-000000000003', 'Ultra');
insert into auth.identities values
  ('discord', '111111111111111111', '00000000-0000-0000-0000-000000000001'),
  ('discord', '222222222222222222', '00000000-0000-0000-0000-000000000002'),
  ('google',  '333333333333333333', '00000000-0000-0000-0000-000000000003');
insert into public.xchange_bot_keys (key_hash, label)
values (encode(sha256(convert_to('test-schluessel-mit-mindestens-32-zeichen', 'UTF8')), 'hex'), 'test');

set role anon;

-- Richtiger Schlüssel: nur Discord-Identitäten, unbekannte Kennungen fehlen
do $$
declare n int; p text;
begin
  select count(*) into n from public.xchange_plans('test-schluessel-mit-mindestens-32-zeichen',
    array['111111111111111111', '222222222222222222', '333333333333333333', '999999999999999999']);
  if n <> 2 then raise exception 'erwartet 2 Treffer, bekommen %', n; end if;
  select plan into p from public.xchange_plans('test-schluessel-mit-mindestens-32-zeichen', array['111111111111111111']);
  if p <> 'Pro' then raise exception 'erwartet Pro, bekommen %', p; end if;
end $$;

-- Falscher, zu kurzer oder fehlender Schlüssel: kein Zugriff
do $$
declare k text;
begin
  foreach k in array array['falscher-schluessel-mit-mindestens-32-zeichen', 'kurz', ''] loop
    begin
      perform * from public.xchange_plans(k, array['111111111111111111']);
      raise exception 'Schlüssel „%“ hätte abgelehnt werden müssen', k;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform * from public.xchange_plans(null, array['111111111111111111']);
    raise exception 'null hätte abgelehnt werden müssen';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Die Schlüsseltabelle selbst ist für anon nicht lesbar
do $$
begin
  perform * from public.xchange_bot_keys;
  raise exception 'xchange_bot_keys darf für anon nicht lesbar sein';
exception when insufficient_privilege then null;
end $$;

-- Mehr als 500 Kennungen werden abgelehnt
do $$
begin
  perform * from public.xchange_plans('test-schluessel-mit-mindestens-32-zeichen',
    (select array_agg(g::text) from generate_series(1, 501) g));
  raise exception 'mehr als 500 Kennungen hätten abgelehnt werden müssen';
exception when invalid_parameter_value then null;
end $$;

reset role;
\echo xchange_plans: alle Prüfungen bestanden
