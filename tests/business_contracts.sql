-- Regressionstest für supabase/migrations/20261109150000_business_contracts.sql
-- Nur in einer LEEREN, SEPARATEN lokalen PostgreSQL-Datenbank ausführen, aus dem Repository-Ordner:
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/business_contracts.sql
-- Simuliert auth.uid(), auth.users, is_admin(), mfa_ok() und vereinfachte profiles. Niemals produktiv ausführen.
\set QUIET on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.profiles (id uuid primary key, is_admin boolean not null default false);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false); $$;
create function public.mfa_ok() returns boolean language sql stable as $$ select coalesce(current_setting('test.mfa', true), 'on') = 'on' $$;
grant execute on function public.is_admin(), public.mfa_ok() to anon, authenticated;

insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into public.profiles values ('00000000-0000-0000-0000-00000000000a', true), ('00000000-0000-0000-0000-00000000000b', false);

\i supabase/migrations/20261109150000_business_contracts.sql
\i supabase/migrations/20261109150000_business_contracts.sql

create function pg_temp.expect(p_label text, p_got text, p_want text) returns void language plpgsql as $$
begin if p_got is distinct from p_want then raise exception '% : erwartet %, bekommen %', p_label, p_want, p_got; end if; end $$;

-- Gast: kein Zugriff
set role anon;
do $$ begin perform 1 from public.business_contracts; raise exception 'anon darf nicht lesen';
exception when insufficient_privilege then null; end $$;

-- Normales Mitglied: sieht nichts, darf nichts anlegen
reset role; set role authenticated; select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
do $$ begin insert into public.business_contracts (company) values ('Fremd GmbH'); raise exception 'Mitglied darf nicht anlegen';
exception when insufficient_privilege then null; end $$;

-- Admin: legt an, Nummern laufen fort, Nummer und Ersteller lassen sich nicht ändern
select set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
insert into public.business_contracts (company, data, number, created_by)
  values ('Muster GmbH', '{"plan":"Business"}', 'XY-1999-9999', '00000000-0000-0000-0000-00000000000b');
insert into public.business_contracts (company) values ('Zweite AG');
select pg_temp.expect('erste Nummer', (select number from public.business_contracts where company = 'Muster GmbH'),
  'XY-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-0001');
select pg_temp.expect('zweite Nummer', (select number from public.business_contracts where company = 'Zweite AG'),
  'XY-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-0002');
select pg_temp.expect('Ersteller', (select created_by::text from public.business_contracts where company = 'Muster GmbH'),
  '00000000-0000-0000-0000-00000000000a');
update public.business_contracts set number = 'XY-0000-0001', status = 'unterschrieben' where company = 'Muster GmbH';
select pg_temp.expect('Nummer fest', (select number from public.business_contracts where company = 'Muster GmbH'),
  'XY-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-0001');
select pg_temp.expect('Status geändert', (select status from public.business_contracts where company = 'Muster GmbH'), 'unterschrieben');
do $$ begin update public.business_contracts set status = 'quatsch'; raise exception 'ungültiger Status angenommen';
exception when check_violation then null; end $$;
do $$ begin insert into public.business_contracts (company) values ('  '); raise exception 'leere Firma angenommen';
exception when check_violation then null; end $$;

-- Mitglied sieht die Verträge des Admins nicht und kann sie nicht ändern oder löschen
select set_config('test.uid', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect('Mitglied sieht nichts', (select count(*)::text from public.business_contracts), '0');
update public.business_contracts set company = 'gehackt';
delete from public.business_contracts;

-- Admin ohne bestätigten 2FA-Code: kein Zugriff
select set_config('test.uid', '00000000-0000-0000-0000-00000000000a', false);
select set_config('test.mfa', 'off', false);
select pg_temp.expect('ohne 2FA nichts sichtbar', (select count(*)::text from public.business_contracts), '0');
select set_config('test.mfa', 'on', false);
select pg_temp.expect('Admin sieht beide, unverändert', (select string_agg(company, ',' order by company) from public.business_contracts), 'Muster GmbH,Zweite AG');

-- Löschen durch Admin
delete from public.business_contracts where company = 'Zweite AG';
select pg_temp.expect('gelöscht', (select count(*)::text from public.business_contracts), '1');

\echo 'PASS: business_contracts – nur Admins mit 2FA, fortlaufende Nummer, Nummer/Ersteller fest, Status-/Firmenprüfung, wiederholbar'
