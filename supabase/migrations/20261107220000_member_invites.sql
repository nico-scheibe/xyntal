-- Einladungsprogramm: Mitglied lädt mit dem persönlichen Link xyntal.de/deinname ein –
-- 7 Tage Plus gratis für beide, sobald die eingeladene Person ein Konto angelegt und die E-Mail bestätigt hat.
-- Nur mit Konto: Werbende und Geworbene sind Konten (auth.users), nicht mehr E-Mail-Adressen von der Warteliste.
-- Der Link ist der Wunsch-Link der Karte (waitlist_cards.handle); der alte ?ref=-Code der Warteliste zählt nicht mehr
-- (waitlist_referrers / waitlist_referrals bleiben unverändert liegen, nichts wird gelöscht).
-- Die Gutschrift (Plus für 7 Tage) bucht der App-Server per Service Role und setzt danach die *_credited_at-Spalten
-- (server/src/supabase/referralSync.ts im App-Repo). Mitglieder lesen nur über get_my_invites.
-- Grenze: höchstens 4 Einladungen (4 x 7 Tage gratis) je Werbende:r in 3 Monaten.
-- Nach 20261107210000_account_without_beta_application.sql; Läuft als Transaktion.
begin;

create table if not exists public.member_referrals (
  id                  bigint generated always as identity primary key,
  referrer_id         uuid not null references auth.users (id) on delete cascade,
  referred_id         uuid not null unique references auth.users (id) on delete cascade,
  handle              text not null,
  created_at          timestamptz not null default now(),
  referrer_credited_at timestamptz,
  referred_credited_at timestamptz,
  check (referrer_id <> referred_id)
);
create index if not exists member_referrals_referrer_idx on public.member_referrals (referrer_id, created_at desc);
alter table public.member_referrals enable row level security;
drop policy if exists "Einladungen lesen (Admins)" on public.member_referrals;
create policy "Einladungen lesen (Admins)" on public.member_referrals for select to authenticated using ((select public.is_admin()));
grant select on public.member_referrals to authenticated;
grant select, update (referrer_credited_at, referred_credited_at) on public.member_referrals to service_role;

-- Einladung einlösen: die eingeladene Person (neu, E-Mail bestätigt) meldet den Link-Namen.
-- Rückgabe: 'ok', 'already' (schon eingelöst), 'unconfirmed' (E-Mail noch nicht bestätigt – später erneut versuchen),
-- 'old' (Konto ist älter als 7 Tage), 'self', 'limit' (Werbende:r hat in 3 Monaten schon 4 Einladungen) oder 'unknown' (kein solches Mitglied).
create or replace function public.claim_referral(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_handle  text := lower(trim(coalesce(p_handle, '')));
  v_created timestamptz;
  v_ref     uuid;
begin
  if v_uid is null then raise exception 'Bitte melde dich an.' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Bitte bestätige zuerst deinen 2FA-Code.' using errcode = '42501'; end if;
  if v_handle !~ '^[a-z0-9][a-z0-9_-]{2,19}$' then return 'unknown'; end if;
  if exists (select 1 from public.member_referrals where referred_id = v_uid) then return 'already'; end if;
  select created_at into v_created from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_created is null then return 'unconfirmed'; end if;
  if v_created < now() - interval '7 days' then return 'old'; end if;
  select c.user_id into v_ref
    from public.waitlist_cards c join public.profiles p on p.id = c.user_id
   where c.handle = v_handle and c.user_id is not null and not public.ban_active(p.banned, p.banned_until);
  if v_ref is null then return 'unknown'; end if;
  if v_ref = v_uid then return 'self'; end if;
  -- höchstens 4 Einladungen (4 x 7 Tage) pro Werbende:r in 3 Monaten; dann bekommt auch die geworbene Person nichts
  if (select count(*) from public.member_referrals where referrer_id = v_ref and created_at > now() - interval '3 months') >= 4 then
    return 'limit';
  end if;
  insert into public.member_referrals (referrer_id, referred_id, handle) values (v_ref, v_uid, v_handle)
    on conflict (referred_id) do nothing;
  return 'ok';
end;
$$;
revoke execute on function public.claim_referral(text) from public, anon;
grant execute on function public.claim_referral(text) to authenticated;

-- Eigener Stand: Link-Name, wie viele eingeladen und davon schon gutgeschrieben, und ob man selbst eingeladen wurde
create or replace function public.get_my_invites()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Bitte melde dich an.' using errcode = '42501'; end if;
  return jsonb_build_object(
    'handle',     (select handle from public.waitlist_cards where user_id = v_uid),
    'invited',    (select count(*) from public.member_referrals where referrer_id = v_uid),
    'recent',     (select count(*) from public.member_referrals where referrer_id = v_uid and created_at > now() - interval '3 months'),
    'max',        4,
    'credited',   (select count(*) from public.member_referrals where referrer_id = v_uid and referrer_credited_at is not null),
    'days',       7 * ((select count(*) from public.member_referrals where referrer_id = v_uid and referrer_credited_at is not null)
                     + (select count(*) from public.member_referrals where referred_id = v_uid and referred_credited_at is not null)),
    'next_free',  (select case when count(*) >= 4 then min(created_at) + interval '3 months' end
                     from public.member_referrals where referrer_id = v_uid and created_at > now() - interval '3 months'),
    'list',       coalesce((select jsonb_agg(jsonb_build_object('at', r.created_at, 'credited', r.referrer_credited_at is not null) order by r.created_at desc)
                     from (select created_at, referrer_credited_at from public.member_referrals where referrer_id = v_uid order by created_at desc limit 20) r), '[]'::jsonb),
    'invited_by', (select handle from public.member_referrals where referred_id = v_uid),
    'welcome_credited', (select referred_credited_at is not null from public.member_referrals where referred_id = v_uid)
  );
end;
$$;
revoke execute on function public.get_my_invites() from public, anon;
grant execute on function public.get_my_invites() to authenticated;

notify pgrst, 'reload schema';
commit;
