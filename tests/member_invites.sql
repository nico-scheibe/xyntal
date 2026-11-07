-- Regressionstest für supabase/migrations/20261107220000_member_invites.sql
-- Nur in einer LEEREN, SEPARATEN lokalen PostgreSQL-Datenbank ausführen, aus dem Repository-Ordner:
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/member_invites.sql
-- Simuliert auth.uid(), auth.users, mfa_ok(), ban_active() und vereinfachte profiles / waitlist_cards. Niemals produktiv ausführen.
\set QUIET on
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;
create table public.profiles (id uuid primary key, is_admin boolean not null default false, banned boolean not null default false, banned_until timestamptz);
create table public.waitlist_cards (id bigint generated always as identity primary key, handle text, user_id uuid);
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false); $$;
create function public.mfa_ok() returns boolean language sql stable as $$ select true $$;
create function public.ban_active(p_banned boolean, p_until timestamptz) returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now()); $$;
grant execute on function public.is_admin(), public.mfa_ok(), public.ban_active(boolean, timestamptz) to anon, authenticated;
grant select on public.waitlist_cards, public.profiles to service_role;

insert into auth.users (id, email, email_confirmed_at, created_at) values
  ('00000000-0000-0000-0000-00000000000a', 'anna@x.de', now(), now() - interval '90 days'),
  ('00000000-0000-0000-0000-00000000000b', 'ben@x.de', now(), now()),
  ('00000000-0000-0000-0000-00000000000c', 'cara@x.de', null, now()),
  ('00000000-0000-0000-0000-00000000000d', 'dan@x.de', now(), now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@x.de', now(), now());
insert into public.profiles (id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c'),
  ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e');
insert into public.waitlist_cards (handle, user_id) values ('anna', '00000000-0000-0000-0000-00000000000a'), ('ben', '00000000-0000-0000-0000-00000000000b'), ('waitlist', null);

\i supabase/migrations/20261107220000_member_invites.sql

create function pg_temp.expect(p_label text, p_got text, p_want text) returns void language plpgsql as $$
begin if p_got is distinct from p_want then raise exception '% : erwartet %, bekommen %', p_label, p_want, p_got; end if; end $$;

set role authenticated;
-- Gast darf nichts einlösen
reset role; set role anon;
do $$ begin perform public.claim_referral('anna'); raise exception 'anon darf nicht einlösen';
exception when insufficient_privilege then null; end $$;
reset role; set role authenticated;

set test.uid = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect('Ben löst anna ein', public.claim_referral('anna'), 'ok');
select pg_temp.expect('nochmal', public.claim_referral('anna'), 'already');
set test.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect('Anna (90 Tage alt)', public.claim_referral('anna'), 'old');          -- Anna ist 90 Tage alt
set test.uid = '00000000-0000-0000-0000-00000000000c';
select pg_temp.expect('E-Mail unbestätigt', public.claim_referral('anna'), 'unconfirmed');
set test.uid = '00000000-0000-0000-0000-00000000000d';
select pg_temp.expect('Konto zu alt', public.claim_referral('anna'), 'old');
set test.uid = '00000000-0000-0000-0000-00000000000e';
select pg_temp.expect('unbekannter Name', public.claim_referral('niemand'), 'unknown');
select pg_temp.expect('Wartelisten-Name ohne Konto', public.claim_referral('waitlist'), 'unknown');
select pg_temp.expect('ungültiger Name', public.claim_referral('A B'), 'unknown');
select pg_temp.expect('Eva löst ben ein', public.claim_referral('ben'), 'ok');
-- Stand
set test.uid = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect('Anna hat 1 eingeladen', (public.get_my_invites() ->> 'invited'), '1');
select pg_temp.expect('Annas Link', (public.get_my_invites() ->> 'handle'), 'anna');
set test.uid = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect('Ben wurde von anna eingeladen', (public.get_my_invites() ->> 'invited_by'), 'anna');
-- Mitglieder lesen die Tabelle nicht direkt
do $$ begin perform count(*) from public.member_referrals; raise exception 'Mitglied darf member_referrals lesen';
exception when others then if sqlstate <> '42501' and sqlstate <> '0A000' then null; end if; end $$;
reset role;
-- gesperrte Werbende zählen nicht
update public.profiles set banned = true where id = '00000000-0000-0000-0000-00000000000a';
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000000f', 'f@x.de', now());
set role authenticated; set test.uid = '00000000-0000-0000-0000-00000000000f';
select pg_temp.expect('gesperrt', public.claim_referral('anna'), 'unknown');
reset role;
-- Service Role schreibt die Gutschrift
set role service_role;
update public.member_referrals set referrer_credited_at = now() where referred_id = '00000000-0000-0000-0000-00000000000b';
reset role;
\echo OK: member_invites
