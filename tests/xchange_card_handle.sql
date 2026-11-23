-- Xchange-Kartenabfrage (Migration 20261123120000_xchange_card_handle.sql). Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/xchange_card_handle.sql
\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema auth;
create table auth.users(id uuid primary key);
create table auth.identities(provider text, provider_id text, user_id uuid);
grant usage on schema public to anon, authenticated;
create table public.profiles(id uuid primary key, plan text not null default 'Free',
  status text not null default 'approved', banned boolean not null default false, banned_until timestamptz);
create table public.waitlist_cards(id uuid primary key default gen_random_uuid(), user_id uuid,
  handle text, name text, email text, is_public boolean not null default true);
create function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;

-- Schlüsseltabelle aus der Tarifabfrage, dann die neue Funktion
\i supabase/migrations/20261121120000_xchange_plans.sql
\i supabase/migrations/20261123120000_xchange_card_handle.sql

insert into public.profiles (id, status, banned, banned_until) values
  ('00000000-0000-0000-0000-000000000001', 'approved', false, null),               -- öffentlich
  ('00000000-0000-0000-0000-000000000002', 'approved', false, null),               -- Karte ausgeblendet
  ('00000000-0000-0000-0000-000000000003', 'rejected', false, null),               -- abgelehnt
  ('00000000-0000-0000-0000-000000000004', 'approved', true,  null),               -- dauerhaft gesperrt
  ('00000000-0000-0000-0000-000000000005', 'approved', true,  now() + interval '1 day'), -- befristet gesperrt
  ('00000000-0000-0000-0000-000000000006', 'approved', true,  now() - interval '1 day'), -- Sperre abgelaufen
  ('00000000-0000-0000-0000-000000000007', 'approved', false, null),               -- Karte ohne handle
  ('00000000-0000-0000-0000-000000000008', 'approved', false, null),               -- keine Karte
  ('00000000-0000-0000-0000-000000000009', 'approved', false, null);               -- nur Google
insert into public.waitlist_cards (user_id, handle, name, email, is_public) values
  ('00000000-0000-0000-0000-000000000001', 'anna',   'Anna A.',   'anna@example.org',   true),
  ('00000000-0000-0000-0000-000000000002', 'bernd',  'Bernd B.',  'bernd@example.org',  false),
  ('00000000-0000-0000-0000-000000000003', 'clara',  'Clara C.',  'clara@example.org',  true),
  ('00000000-0000-0000-0000-000000000004', 'dora',   'Dora D.',   'dora@example.org',   true),
  ('00000000-0000-0000-0000-000000000005', 'emil',   'Emil E.',   'emil@example.org',   true),
  ('00000000-0000-0000-0000-000000000006', 'frieda', 'Frieda F.', 'frieda@example.org', true),
  ('00000000-0000-0000-0000-000000000007', null,     'Gustav G.', 'gustav@example.org', true),
  ('00000000-0000-0000-0000-000000000009', 'ida',    'Ida I.',    'ida@example.org',    true);
insert into auth.identities values
  ('discord', '111111111111111111', '00000000-0000-0000-0000-000000000001'),
  ('discord', '222222222222222222', '00000000-0000-0000-0000-000000000002'),
  ('discord', '333333333333333333', '00000000-0000-0000-0000-000000000003'),
  ('discord', '444444444444444444', '00000000-0000-0000-0000-000000000004'),
  ('discord', '555555555555555555', '00000000-0000-0000-0000-000000000005'),
  ('discord', '666666666666666666', '00000000-0000-0000-0000-000000000006'),
  ('discord', '777777777777777777', '00000000-0000-0000-0000-000000000007'),
  ('discord', '888888888888888888', '00000000-0000-0000-0000-000000000008'),
  ('google',  '999999999999999999', '00000000-0000-0000-0000-000000000009'),
  ('discord', '1234',               '00000000-0000-0000-0000-000000000001');
insert into public.xchange_bot_keys (key_hash, label)
values (encode(sha256(convert_to('test-schluessel-mit-mindestens-32-zeichen', 'UTF8')), 'hex'), 'test');

set role anon;

-- Richtiger Schlüssel: nur öffentliche, nicht abgelehnte, nicht gesperrte Karten liefern den handle
do $$
declare
  k constant text := 'test-schluessel-mit-mindestens-32-zeichen';
  r record;
  got text;
begin
  for r in select * from (values
      ('111111111111111111', 'anna'),
      ('222222222222222222', null),     -- ausgeblendet
      ('333333333333333333', null),     -- abgelehnt
      ('444444444444444444', null),     -- dauerhaft gesperrt
      ('555555555555555555', null),     -- befristet gesperrt
      ('666666666666666666', 'frieda'), -- Sperre abgelaufen
      ('777777777777777777', null),     -- kein handle
      ('888888888888888888', null),     -- keine Karte
      ('999999999999999999', null),     -- nur Google-Identität
      ('000000000000000000', null),     -- unbekannt
      ('1234', null),                   -- zu kurz, obwohl als Identität vorhanden
      ('111111111111111111x', null),    -- keine reine Ziffernfolge
      (' 111111111111111111', null),
      ('123456789012345678901', null),  -- 21 Ziffern
      ('', null),
      (null, null)
    ) v(id, expected) loop
    got := public.xchange_card_handle(k, r.id);
    if got is distinct from r.expected then
      raise exception 'Kennung %: erwartet %, bekommen %', coalesce(r.id, 'null'), coalesce(r.expected, 'null'), coalesce(got, 'null');
    end if;
  end loop;
end $$;

-- Falscher, zu kurzer oder fehlender Schlüssel: kein Zugriff
do $$
declare k text;
begin
  foreach k in array array['falscher-schluessel-mit-mindestens-32-zeichen', 'kurz', ''] loop
    begin
      perform public.xchange_card_handle(k, '111111111111111111');
      raise exception 'Schlüssel „%“ hätte abgelehnt werden müssen', k;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.xchange_card_handle(null, '111111111111111111');
    raise exception 'null hätte abgelehnt werden müssen';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Rechte: public hat kein Ausführungsrecht, anon und authenticated haben es; nur Rückgabe text
do $$
begin
  if has_function_privilege('public', 'public.xchange_card_handle(text, text)', 'execute') then
    raise exception 'public darf xchange_card_handle nicht ausführen';
  end if;
  if not has_function_privilege('anon', 'public.xchange_card_handle(text, text)', 'execute')
     or not has_function_privilege('authenticated', 'public.xchange_card_handle(text, text)', 'execute') then
    raise exception 'anon und authenticated müssen xchange_card_handle ausführen dürfen';
  end if;
  if (select prorettype from pg_proc where oid = 'public.xchange_card_handle(text, text)'::regprocedure) <> 'text'::regtype
     or not (select prosecdef from pg_proc where oid = 'public.xchange_card_handle(text, text)'::regprocedure) then
    raise exception 'xchange_card_handle muss security definer sein und text liefern';
  end if;
end $$;

\echo xchange_card_handle: alle Prüfungen bestanden
