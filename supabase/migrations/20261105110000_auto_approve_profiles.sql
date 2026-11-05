-- Profile automatisch freischalten, wenn sie die Standard-Prüfung bestehen – statt jedes
-- neue Profil von Hand im Admin-Bereich freizugeben.
--
-- Ein Profil im Status „pending“ wird von selbst „approved“, sobald alles stimmt:
--   * Name mit mindestens 2 Zeichen
--   * „Woran arbeitest du?“ (headline) mit mindestens 10 Zeichen
--   * die E-Mail-Adresse des Kontos ist bestätigt – oder das Konto meldet sich über einen
--     Anbieter wie Apple oder Google an, der die Adresse selbst geprüft hat. Wichtig für
--     „E-Mail-Adresse verbergen“ bei Apple: an @privaterelay.appleid.com-Adressen kommt
--     keine Bestätigungsmail an, solange der Absender nicht bei Apple eingetragen ist.
--   * das Konto ist nicht gesperrt
--   * kein Text verstößt gegen den Schutzfilter (public.content_problem: Beleidigungen,
--     Betrugsmaschen, gefährliche Links, eigene Sperrwörter)
-- Geprüft wird bei jedem Speichern des Profils und wenn die E-Mail bestätigt wird.
--
-- Der Admin behält das letzte Wort: Wer im Admin-Bereich freischaltet, ablehnt oder auf
-- „pending“ zurücksetzt (admin_set_status), sperrt das Profil für die Automatik
-- (review_locked). Ein abgelehntes Profil wird also nie automatisch freigeschaltet.
-- Abschalten: update public.site_settings set enabled = false where key = 'auto_approve_profiles';
--
-- Einmal im Supabase SQL Editor ausführen (nach 20261103170000_banned_accounts.sql und
-- 20261028150000_content_safety.sql). Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- ---------- Schalter (nur Admins) ----------
create table if not exists public.site_settings (
  key         text primary key check (char_length(key) between 2 and 80),
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant select, update on public.site_settings to authenticated;
drop policy if exists "Einstellungen verwalten" on public.site_settings;
create policy "Einstellungen verwalten" on public.site_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
insert into public.site_settings (key, enabled) values ('auto_approve_profiles', true)
  on conflict (key) do nothing;

-- ---------- Admin-Entscheidung schlägt Automatik ----------
alter table public.profiles add column if not exists review_locked boolean not null default false;
-- Gesperrte Konten prüft die Standard-Prüfung mit; die Spalten kommen aus
-- 20261103170000_banned_accounts.sql und werden hier nur angelegt, falls sie noch fehlen.
alter table public.profiles
  add column if not exists banned boolean not null default false,
  add column if not exists banned_until timestamptz;

create or replace function public.admin_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Ungültiger Status.';
  end if;
  update public.profiles set status = p_status, review_locked = true where id = p_id;
  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;
end;
$$;

-- ---------- Die Standard-Prüfung: Grund, warum (noch) nicht, oder null ----------
create or replace function public.profile_review_problem(p public.profiles)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if char_length(btrim(p.name)) < 2 then return 'name'; end if;
  if char_length(btrim(p.headline)) < 10 then return 'headline'; end if;
  if not exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
     and not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider <> 'email') then
    return 'email';
  end if;
  if p.banned and (p.banned_until is null or p.banned_until > now()) then return 'banned'; end if;
  if public.content_problem(concat_ws(' ', p.name, p.headline, p.about, p.category, p.offer, p.seek,
                                      p.linkedin, p.instagram, p.website)) is not null then
    return 'content';
  end if;
  return null;
end;
$$;
-- Nicht direkt aufrufbar: Sie würde für jede sichtbare Zeile verraten, ob deren E-Mail
-- bestätigt ist. Mitglieder fragen über my_profile_review() nur nach sich selbst.
revoke execute on function public.profile_review_problem(public.profiles) from public, anon, authenticated;

-- Für das eigene Profil: was der automatischen Freischaltung noch fehlt (null = nichts),
-- und ob die Automatik für dieses Profil überhaupt gilt.
create or replace function public.my_profile_review()
returns table (problem text, automatic boolean) language sql stable security definer set search_path = '' as $$
  select public.profile_review_problem(p),
         not p.review_locked
           and coalesce((select s.enabled from public.site_settings s where s.key = 'auto_approve_profiles'), false)
  from public.profiles p where p.id = (select auth.uid());
$$;
revoke execute on function public.my_profile_review() from public, anon;
grant execute on function public.my_profile_review() to authenticated;

create or replace function public.auto_approve_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending'
     and not new.review_locked
     and coalesce((select s.enabled from public.site_settings s where s.key = 'auto_approve_profiles'), false)
     and public.profile_review_problem(new) is null then
    new.status := 'approved';
  end if;
  return new;
end;
$$;
revoke execute on function public.auto_approve_profile() from public, anon, authenticated;

drop trigger if exists auto_approve_profile on public.profiles;
create trigger auto_approve_profile before insert or update on public.profiles
  for each row execute function public.auto_approve_profile();

-- Die Freischaltungs-Benachrichtigung muss auch feuern, wenn der Status vom Trigger oben
-- kommt (dann steht status nicht in der UPDATE-Liste, „after update of status“ greift nicht).
drop trigger if exists notification_after_approval on public.profiles;
create trigger notification_after_approval after update on public.profiles
  for each row when (new.status = 'approved' and old.status is distinct from 'approved')
  execute function public.notify_profile_approved();

-- E-Mail bestätigt → Profil erneut prüfen (es wurde schon vorher angelegt).
create or replace function public.recheck_profile_on_confirm()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    update public.profiles set status = status where id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.recheck_profile_on_confirm() from public, anon, authenticated;

drop trigger if exists recheck_profile_on_confirm on auth.users;
create trigger recheck_profile_on_confirm after update of email_confirmed_at on auth.users
  for each row execute function public.recheck_profile_on_confirm();

-- Anmeldung über Apple/Google kommt dazu → ebenfalls neu prüfen.
create or replace function public.recheck_profile_on_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.provider <> 'email' then
    update public.profiles set status = status where id = new.user_id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.recheck_profile_on_identity() from public, anon, authenticated;

drop trigger if exists recheck_profile_on_identity on auth.identities;
create trigger recheck_profile_on_identity after insert on auth.identities
  for each row execute function public.recheck_profile_on_identity();

-- Admin-Übersicht: warum ein Profil noch wartet.
create or replace function public.admin_profile_review_problems()
returns table (id uuid, problem text) language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  return query select p.id, public.profile_review_problem(p) from public.profiles p where p.status = 'pending';
end;
$$;
revoke execute on function public.admin_profile_review_problems() from public, anon;
grant execute on function public.admin_profile_review_problems() to authenticated;

-- Bestehende wartende Profile einmal durch die Prüfung schicken (abgelehnte bleiben abgelehnt).
update public.profiles set status = status where status = 'pending';

commit;
