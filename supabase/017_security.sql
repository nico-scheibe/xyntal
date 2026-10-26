-- Sicherheit im Profil: Zwei-Faktor-Anmeldung (Authenticator-App) wirklich durchsetzen und Passwort prüfen.
-- Einmal im Supabase SQL Editor ausführen (nach 016). Läuft als Transaktion.
-- Wer 2FA eingerichtet hat, kommt ohne Code nur bis zur Code-Abfrage – auch nicht direkt über die API.
begin;

-- 0) Aus 016 (ältere 016-Fassungen hatten das noch nicht): 2FA-Prüfung, auch beim Lesen der eigenen Karte
-- 2FA: true, wenn die Sitzung den zweiten Faktor bestätigt hat – oder das Konto keine 2FA nutzt
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

-- Eigene Karte (übernimmt beim ersten Aufruf die Warteliste-Karte mit derselben E-Mail)
create or replace function public.get_my_card()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public.my_confirmed_email();
  c       public.waitlist_cards;
begin
  if v_uid is null then raise exception 'Bitte melde dich an.' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Bitte bestätige zuerst deinen 2FA-Code.' using errcode = '42501'; end if;
  select * into c from public.waitlist_cards where user_id = v_uid;
  if c.id is null and v_email is not null then
    update public.waitlist_cards set user_id = v_uid where email = v_email and user_id is null returning * into c;
  end if;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills), 'hours', c.hours,
    'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch, 'link', c.link,
    'handle', c.handle, 'is_public', c.is_public, 'design', coalesce(c.design, '{}'::jsonb), 'lang', c.lang);
end;
$$;
revoke execute on function public.get_my_card() from public, anon;
grant execute on function public.get_my_card() to authenticated;

-- 1) Jede Tabelle mit Zeilenschutz: angemeldete Konten mit 2FA brauchen eine bestätigte Sitzung (aal2)
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity loop
    execute format('drop policy if exists "2FA erzwingen" on public.%I', t.relname);
    execute format('create policy "2FA erzwingen" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t.relname);
  end loop;
end $$;

-- 2) Admin-Rechte (auch in Admin-Funktionen) nur mit bestätigter 2FA-Sitzung
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) and public.mfa_ok();
$$;

-- 3) Konto löschen nur mit bestätigter 2FA-Sitzung
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;
  if not public.mfa_ok() then
    raise exception 'Bitte bestätige zuerst deinen 2FA-Code.';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  delete from public.newsletter where email = lower(v_email);
  delete from auth.users where id = auth.uid();
end;
$$;

-- 4) Aktuelles Passwort prüfen, bevor ein neues gesetzt wird.
--    Rückgabe: 'ok', 'wrong', 'none' (Konto ohne Passwort, z. B. Google) oder 'limit' (zu viele Versuche)
create table if not exists public.password_checks (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index if not exists password_checks_user_idx on public.password_checks (user_id, at);
alter table public.password_checks enable row level security;  -- keine Policies: nur die Funktion schreibt

create or replace function public.verify_my_password(p_password text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Bitte bestätige zuerst deinen 2FA-Code.' using errcode = '42501'; end if;
  select encrypted_password into v_hash from auth.users where id = auth.uid();
  if coalesce(v_hash, '') = '' then return 'none'; end if;
  if (select count(*) from public.password_checks where user_id = auth.uid() and at > now() - interval '15 minutes') >= 5 then
    return 'limit';
  end if;
  if extensions.crypt(coalesce(p_password, ''), v_hash) = v_hash then
    delete from public.password_checks where user_id = auth.uid();
    return 'ok';
  end if;
  insert into public.password_checks (user_id) values (auth.uid());
  return 'wrong';
end;
$$;
revoke execute on function public.verify_my_password(text) from public, anon;
grant execute on function public.verify_my_password(text) to authenticated;

commit;
