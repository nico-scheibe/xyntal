-- Regressionstest für supabase/migrations/20261111230000_reserve_badge_handles.sql
-- Nur in einer LEEREN, SEPARATEN lokalen PostgreSQL-Datenbank ausführen, aus dem Repository-Ordner:
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/reserve_badge_handles.sql
-- Simuliert auth.uid(), auth.role(), auth.users, profiles, is_admin() und eine vereinfachte waitlist_cards.
-- Lädt 20261107200000_cards_always_public.sql, damit die Trigger-Reihenfolge mit member_cards_public
-- geprüft wird. protect_owned_card ist NICHT die Originalfunktion, sondern eine minimale Nachbildung
-- (handle, user_id, is_public, name für anonyme/angemeldete Fremdzugriffe) nach
-- 20261109120000_security_hardening.sql:119-155. Niemals produktiv ausführen.
\set QUIET on
\set ON_ERROR_STOP on
create schema if not exists auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('test.role', true), '') $$;
create table public.profiles (id uuid primary key, is_admin boolean not null default false);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false); $$;
create table public.waitlist_cards (id bigint generated always as identity primary key, handle text, user_id uuid,
  name text default 'Test', email text unique, is_public boolean not null default false,
  created_at timestamptz not null default now());

\i supabase/migrations/20261107200000_cards_always_public.sql

-- Minimale Nachbildung von protect_owned_card (nur die Felder, auf die der Test achtet)
create function public.protect_owned_card() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then return new; end if;
  if old.user_id is not null and auth.uid() is distinct from old.user_id and not public.is_admin() then
    new.user_id := old.user_id; new.handle := old.handle; new.is_public := old.is_public; new.name := old.name;
  end if;
  return new;
end;
$$;
create trigger protect_owned_card before update on public.waitlist_cards
  for each row execute function public.protect_owned_card();

\i supabase/migrations/20261111230000_reserve_badge_handles.sql

insert into auth.users (id) values
  ('0b842a42-ac01-4e81-9815-208108a8eb03'), ('be172112-15cd-49de-af85-e7f71dfeac47'), ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles (id) values
  ('0b842a42-ac01-4e81-9815-208108a8eb03'), ('be172112-15cd-49de-af85-e7f71dfeac47'), ('00000000-0000-0000-0000-00000000000b');

-- Hilfsfunktion: sql muss mit SQLSTATE 23514 abgelehnt werden, sonst bricht der Test ab.
create function pg_temp.expect_reject(p_sql text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FEHLER: hätte abgelehnt werden müssen: %', p_sql;
exception when sqlstate '23514' then
  null;
end $$;

-- 1) Fremdes Konto darf den Handle nicht setzen (neu oder geändert), auch nicht in anderer Schreibweise
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
select set_config('test.role', 'authenticated', false);
select pg_temp.expect_reject($q$insert into public.waitlist_cards (handle, user_id) values ('schneemann', '00000000-0000-0000-0000-00000000000b')$q$);
select pg_temp.expect_reject($q$insert into public.waitlist_cards (handle, user_id) values ('Schneemann', '00000000-0000-0000-0000-00000000000b')$q$);
-- Anlage ohne Konto mit Handle: kein Fehler, der Handle wird weggelassen (siehe 7b)
insert into public.waitlist_cards (handle, user_id, name) values ('anna', '00000000-0000-0000-0000-00000000000b', 'Anna');
select pg_temp.expect_reject($q$update public.waitlist_cards set handle = 'maxim' where handle = 'anna'$q$);

-- 2) Besitzer legt die Karte an: is_public wird durch member_cards_public gesetzt
select set_config('test.uid', '0b842a42-ac01-4e81-9815-208108a8eb03', false);
insert into public.waitlist_cards (handle, user_id, name) values ('schneemann', '0b842a42-ac01-4e81-9815-208108a8eb03', 'Schnee');
do $$ begin
  if not (select is_public from public.waitlist_cards where handle = 'schneemann') then
    raise exception 'FEHLER: Besitzer-Karte mit Handle muss öffentlich sein';
  end if;
end $$;

-- 3) Besitzer speichert unverändert, gibt den Handle frei und holt ihn zurück
update public.waitlist_cards set name = 'Schnee neu' where handle = 'schneemann';
update public.waitlist_cards set handle = null where handle = 'schneemann';
do $$ begin
  if (select is_public from public.waitlist_cards where name = 'Schnee neu') then
    raise exception 'FEHLER: ohne Handle darf die Karte nicht öffentlich sein';
  end if;
end $$;
update public.waitlist_cards set handle = 'schneemann' where name = 'Schnee neu';

-- 4) Konto wird gelöscht (on delete set null → user_id null): Handle wird still freigegeben, kein Fehler
update public.waitlist_cards set user_id = null where name = 'Schnee neu';
do $$ begin
  if (select handle from public.waitlist_cards where name = 'Schnee neu') is not null
     or (select is_public from public.waitlist_cards where name = 'Schnee neu') then
    raise exception 'FEHLER: nach Verlust des Besitzes muss der Handle frei und die Karte nicht öffentlich sein';
  end if;
end $$;

-- 5) Fremdes Konto darf den freien Handle danach nicht holen
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_reject($q$update public.waitlist_cards set handle = 'schneemann' where name = 'Anna'$q$);

-- 6) Übernahme durch fremdes Konto (user_id wechselt) bei maxim: Handle frei, kein Fehler
select set_config('test.uid', '', false);
select set_config('test.role', 'service_role', false);
insert into public.waitlist_cards (handle, user_id, name) values ('maxim', 'be172112-15cd-49de-af85-e7f71dfeac47', 'Maxim');
update public.waitlist_cards set user_id = '00000000-0000-0000-0000-00000000000b' where name = 'Maxim';
do $$ begin
  if (select handle from public.waitlist_cards where name = 'Maxim') is not null then
    raise exception 'FEHLER: maxim muss nach Übernahme durch Fremdkonto frei sein';
  end if;
end $$;

-- 7a) Anonymer Upsert auf die Besitzer-Karte (013_waitlist_perks.sql: on conflict (email) do update,
--     handle = coalesce(excluded.handle, Bestand)) mit Handle schneemann: kein Fehler, Besitzer behält Handle
select set_config('test.uid', '0b842a42-ac01-4e81-9815-208108a8eb03', false);
select set_config('test.role', 'authenticated', false);
insert into public.waitlist_cards (email, handle, user_id, name) values ('owner@x.de', 'schneemann', '0b842a42-ac01-4e81-9815-208108a8eb03', 'Schnee 2');
select set_config('test.uid', '', false);
select set_config('test.role', 'anon', false);
insert into public.waitlist_cards (email, name, handle) values ('owner@x.de', 'Anon-Versuch', 'schneemann')
  on conflict (email) do update
    set name = excluded.name, handle = coalesce(excluded.handle, public.waitlist_cards.handle)
    where public.waitlist_cards.created_at > now() - interval '30 minutes';
do $$ begin
  if (select count(*) from public.waitlist_cards where email = 'owner@x.de') <> 1 then
    raise exception 'FEHLER: Upsert muss die Besitzer-Karte treffen, nicht eine zweite anlegen';
  end if;
  if not exists (select 1 from public.waitlist_cards where email = 'owner@x.de'
                 and handle = 'schneemann' and user_id = '0b842a42-ac01-4e81-9815-208108a8eb03') then
    raise exception 'FEHLER: Besitzer muss nach anonymem Upsert Handle und Konto behalten';
  end if;
end $$;

-- 7b) Anonymer Insert mit neuer E-Mail und Handle maxim: Zeile entsteht ohne Handle, nicht öffentlich
insert into public.waitlist_cards (email, name, handle) values ('neu@x.de', 'Neu', 'maxim');
do $$ begin
  if not exists (select 1 from public.waitlist_cards where email = 'neu@x.de'
                 and handle is null and user_id is null and not is_public) then
    raise exception 'FEHLER: anonyme Anlage mit reserviertem Handle muss ohne Handle entstehen';
  end if;
end $$;

-- 8) Bestandsprüfung bricht die Migration ab (Test am Ende, weil die Migration dabei zurückgerollt wird):
--    Fremde Karte hält maxim → kein Trigger danach. Das Abbruch-Fenster ist die Migration selbst.
select set_config('test.uid', '', false);
select set_config('test.role', 'service_role', false);
drop trigger badge_handles_reserved on public.waitlist_cards;
insert into public.waitlist_cards (handle, user_id, name) values ('maxim', '00000000-0000-0000-0000-00000000000b', 'Falsch');
\set ON_ERROR_STOP off
\i supabase/migrations/20261111230000_reserve_badge_handles.sql
\set ON_ERROR_STOP on
do $$ begin
  if exists (select 1 from pg_trigger where tgname = 'badge_handles_reserved') then
    raise exception 'FEHLER: Bestandsprüfung hat die Migration nicht abgebrochen';
  end if;
end $$;
delete from public.waitlist_cards where name = 'Falsch';
\i supabase/migrations/20261111230000_reserve_badge_handles.sql
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'badge_handles_reserved') then
    raise exception 'FEHLER: Trigger fehlt nach erneuter Migration';
  end if;
end $$;

select 'reserve_badge_handles: alle Prüfungen bestanden' as ergebnis;
