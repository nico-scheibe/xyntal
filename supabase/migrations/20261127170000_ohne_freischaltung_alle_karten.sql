-- Keine Freischaltung mehr, alle Karten sichtbar.
-- 1) Freischaltung läuft immer und ohne Bedingungen an den Inhalt: Ein Profil in 'pending' wird
--    'approved', sobald die E-Mail bestätigt ist (oder Apple/Google), es nicht gesperrt ist und
--    age_ok() stimmt. Name, „Woran arbeitest du?“ und Schutzfilter verlangt die Freischaltung
--    nicht mehr; auch site_settings.auto_approve_profiles und review_locked gelten nicht mehr.
--    Bleibt bewusst: E-Mail (sonst löscht purge_unconfirmed_accounts() unbestätigte Konten nicht,
--    die es nur bei 'pending' tut), Sperre und Altersgrenze ab 16. 'rejected' bleibt 'rejected'.
-- 2) get_member_cards() liefert jede Karte mit Konto – auch ohne Wunsch-Link und auch, wenn ein
--    Admin sie unter dem Link ausgeblendet hat. Ausgenommen: gesperrt, abgelehnt, unter 16.
-- Nach 20261127150000_profile_public_with_card.sql; darf mehrfach laufen.
begin;

create or replace function public.profile_review_problem(p public.profiles)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from auth.users u where u.id = p.id
                  and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null))
     and not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider not in ('email', 'phone')) then
    return 'email';
  end if;
  if public.ban_active(p.banned, p.banned_until) then return 'banned'; end if;
  if not public.age_ok(p.id) then return 'birthdate'; end if;
  return null;
end;
$$;
revoke execute on function public.profile_review_problem(public.profiles) from public, anon, authenticated;

create or replace function public.my_profile_review()
returns table (problem text, automatic boolean) language sql stable security definer set search_path = '' as $$
  select public.profile_review_problem(p), true
  from public.profiles p where p.id = (select auth.uid());
$$;
revoke execute on function public.my_profile_review() from public, anon;
grant execute on function public.my_profile_review() to authenticated;

create or replace function public.auto_approve_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and public.profile_review_problem(new) is null then
    new.status := 'approved';
  end if;
  return new;
end;
$$;
revoke execute on function public.auto_approve_profile() from public, anon, authenticated;
drop trigger if exists auto_approve_profile on public.profiles;
create trigger auto_approve_profile before insert or update on public.profiles
  for each row execute function public.auto_approve_profile();

-- E-Mail-Bestätigung kommt nach dem Anlegen des Profils: dann noch einmal prüfen.
create or replace function public.approve_on_confirm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.email_confirmed_at is not null and old.email_confirmed_at is null)
     or (new.phone_confirmed_at is not null and old.phone_confirmed_at is null) then
    begin
      update public.profiles set status = status where id = new.id and status = 'pending';
    exception when others then
      raise log 'approve_on_confirm: %', sqlerrm; -- Bestätigung darf nie daran scheitern
    end;
  end if;
  return new;
end;
$$;
revoke execute on function public.approve_on_confirm() from public, anon, authenticated;
drop trigger if exists approve_on_confirm on auth.users;
create trigger approve_on_confirm after update of email_confirmed_at, phone_confirmed_at on auth.users
  for each row execute function public.approve_on_confirm();

-- Alle wartenden Profile einmal durch die neue Prüfung schicken.
update public.profiles set status = status where status = 'pending';

-- Alle Karten mit Konto (Felder wie 20261108200000_restore_card_functions.sql).
create or replace function public.get_member_cards()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id, 'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level,
      'skills', to_jsonb(c.skills), 'hours', c.hours, 'mode', c.mode, 'city', c.city,
      'looking', c.looking, 'pitch', c.pitch, 'link', c.link, 'design', coalesce(c.design, '{}'::jsonb),
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
      'is_premium', coalesce(p.is_premium, false),
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end,
      'avatar_path', case when p.avatar_path ~ '\.jpg$' or p.is_premium then nullif(p.avatar_path, '') end
    ) order by c.created_at desc), '[]'::jsonb)
  from public.waitlist_cards c
  join public.profiles p on p.id = c.user_id
  where p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until) and public.age_ok(c.user_id);
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
