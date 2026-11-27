-- Unbestätigte Konten: nach 24 Stunden automatisch löschen und in der Admin-Liste getrennt zeigen.
--
-- WARUM: Am 27.11.2026 standen in der Admin-Nutzerliste Dutzende Konten wie otp-test1@example.com,
--   nonexistent-magiclink-test@example.com oder cors-test-probe@example.invalid, alle "(noch kein Name)" und
--   "Wartet auf Freischaltung". Am 20.11.2026 waren es noch 16 Profile (DATENSCHUTZ-STATUS.md).
--   Ursache: GoTrue legt ein Konto in auth.users an, sobald jemand mit dem öffentlichen Schlüssel eine Registrierung
--   oder einen Login-Code (/auth/v1/signup, /auth/v1/otp) anfordert, auch wenn die Adresse nie bestätigt wird.
--   handle_new_user() legt dazu sofort ein Profil mit status = 'pending' an. Die Website bietet gar keinen Login per
--   E-Mail-Code an; die Konten stammen von Tests und Skripten, die die Schnittstelle direkt aufgerufen haben. Dasselbe
--   kann jeder mit dem Schlüssel aus dem Quelltext der Seite tun.
--
-- WAS DIESE DATEI TUT:
--   1) public.purge_unconfirmed_accounts() löscht Konten, die
--        - weder E-Mail noch Telefon bestätigt haben,
--        - sich nie angemeldet haben,
--        - seit mehr als 24 Stunden keinen Bestätigungslink mehr bekommen haben (der Link verfällt nach 24 Stunden,
--          GOTRUE_MAILER_OTP_EXP; danach kann das Konto ohnehin nichts mehr),
--        - kein Admin sind, nicht freigeschaltet und nicht abgelehnt wurden (ein Admin hat sie dann bewusst angefasst),
--        - keine Anmeldung über Google, Apple, Discord oder LinkedIn haben.
--      Gibt die Anzahl zurück. Nur für den Datenbank-Eigentümer ausführbar; läuft täglich per Cron auf dem
--      Datenbankserver (hosting/hetzner/supabase/xyntal-unbestaetigt.cron, eingerichtet von install.sh).
--   2) public.admin_purge_unconfirmed() — derselbe Lauf auf Knopfdruck für Admins (Admin → Nutzer → "Unbestätigt").
--   3) public.admin_members() liefert zusätzlich die Spalte "confirmed". Die Admin-Liste blendet unbestätigte Konten
--      aus "Alle", aus den Aufgaben und aus der Zahl am Reiter aus und zeigt sie unter einem eigenen Filter.
--   4) Einmal sofort aufräumen: Am Ende dieser Datei läuft purge_unconfirmed_accounts() einmal.
--
-- ALTERSGRENZE: remember_age_block() setzt für unbestätigte Adressen bewusst keine Sperre (siehe
--   20261118180000_altersgrenze_sperrliste.sql, Block 5). Deshalb wird es hier gar nicht erst aufgerufen; das Löschen
--   hinterlässt keine Spur.
--
-- VORHER ANSEHEN, WAS WEGFÄLLT (ändert nichts):
--   select u.email, u.created_at, u.confirmation_sent_at from auth.users u
--   left join public.profiles p on p.id = u.id
--   where u.email_confirmed_at is null and u.phone_confirmed_at is null and u.last_sign_in_at is null
--     and coalesce(u.confirmation_sent_at, u.created_at) < now() - interval '24 hours'
--     and not coalesce(p.is_admin, false) and coalesce(p.status, 'pending') = 'pending'
--   order by u.created_at;
--
-- RÜCKWEG: Gelöschte Konten kommen nur aus dem nächtlichen Backup zurück (/opt/xyntal/backups). Die Funktionen
--   entfernen: drop function public.admin_purge_unconfirmed(); drop function public.purge_unconfirmed_accounts();
--   admin_members() in der Fassung aus supabase/002_login_methods.sql neu anlegen (drop + create, die Spalten ändern
--   sich).
--
-- Läuft als Transaktion. Darf mehrfach laufen. Einmal im Supabase SQL Editor ausführen.
begin;

-- ---------- 1) Sicherheitsnetz ----------
do $$ begin
  if to_regclass('public.profiles') is null
     or to_regclass('auth.users') is null
     or to_regclass('auth.identities') is null
     or to_regprocedure('public.is_admin()') is null then
    raise exception 'Voraussetzungen fehlen (public.profiles, auth.users, auth.identities, public.is_admin()).';
  end if;
end $$;

-- ---------- 2) Aufräumen ----------
create or replace function public.purge_unconfirmed_accounts()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_n  integer := 0;
begin
  for v_id in
    select u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where u.email_confirmed_at is null
      and u.phone_confirmed_at is null
      and u.last_sign_in_at is null
      and coalesce(u.confirmation_sent_at, u.created_at) < now() - interval '24 hours'
      and u.created_at < now() - interval '24 hours'
      and not coalesce(p.is_admin, false)
      and coalesce(p.status, 'pending') = 'pending'
      and not exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider not in ('email', 'phone')
      )
    for update of u skip locked
  loop
    -- Jedes Konto einzeln: Scheitert eines (z. B. ein Fremdschlüssel ohne cascade), bleiben die anderen nicht liegen.
    begin
      delete from auth.users where id = v_id;
      v_n := v_n + 1;
    exception when others then
      raise log 'purge_unconfirmed_accounts: Konto % nicht gelöscht (SQLSTATE %)', v_id, sqlstate;
    end;
  end loop;
  return v_n;
end;
$$;
-- Nur der Eigentümer (Cron auf dem Datenbankserver) und admin_purge_unconfirmed() rufen das auf.
revoke execute on function public.purge_unconfirmed_accounts() from public, anon, authenticated, service_role;

-- ---------- 3) Auf Knopfdruck für Admins ----------
create or replace function public.admin_purge_unconfirmed()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  return public.purge_unconfirmed_accounts();
end;
$$;
revoke execute on function public.admin_purge_unconfirmed() from public, anon, service_role;
grant execute on function public.admin_purge_unconfirmed() to authenticated;

-- ---------- 4) Admin-Liste: Spalte "confirmed" ----------
-- Grundlage: admin_members() aus supabase/002_login_methods.sql, übernommen. Neu ist nur die letzte Spalte.
--   Die Rückgabe ändert sich, deshalb drop + create statt create or replace.
drop function if exists public.admin_members();
create function public.admin_members()
returns table (
  id uuid, email text, phone text, provider text, name text, headline text, about text, phase text,
  category text, offer text, seek text, linkedin text, instagram text, website text,
  is_public boolean, status text, is_admin boolean, created_at timestamptz, confirmed boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  return query
    select p.id, u.email::text, u.phone::text, (u.raw_app_meta_data->>'provider')::text,
           p.name, p.headline, p.about, p.phase, p.category,
           p.offer, p.seek, p.linkedin, p.instagram, p.website,
           p.is_public, p.status, p.is_admin, p.created_at,
           (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by (p.status = 'pending') desc, p.created_at desc;
end;
$$;
revoke execute on function public.admin_members() from public, anon, service_role;
grant execute on function public.admin_members() to authenticated;

-- ---------- 5) Einmal sofort aufräumen ----------
do $$
declare v_n integer;
begin
  v_n := public.purge_unconfirmed_accounts();
  raise notice 'Unbestätigte Konten gelöscht: %', v_n;
end $$;

commit;

notify pgrst, 'reload schema';
