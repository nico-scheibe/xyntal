-- Sicherheits-Durchsicht vom 09.11.2026. Einmal im SQL Editor von db.xyntal.de ausführen
-- (nach allen anderen Migrationen). Läuft als Transaktion und ist wiederholbar.
--
-- 1) 2FA: Wer 2FA eingeschaltet hat, aber nur das Passwort eingegeben hat (aal1), konnte über
--    save_my_links, save_my_page, apply_for_beta und Uploads trotzdem Daten ändern.
-- 2) Gesperrte Konten konnten weiter posten, kommentieren, liken und eigene Beiträge ändern.
-- 3) Fremde Karten: submit_waitlist_card (ohne Login) konnte eine frisch angelegte Karte eines
--    Kontos überschreiben; eine untergeschobene Karte brachte beim ersten Login ihren Link mit.
-- 4) Profilbild-Speicher: unbegrenzt viele Dateien (bis 512 MB) pro Konto.
-- 5) Kleinere Härtungen: Emoji-Reaktionen nur aus der Auswahl, keine javascript:-Links in der
--    Link-Seite, alte Empfehlungs-Funktionen ohne Login gesperrt, fester search_path.
begin;

-- ---------------------------------------------------------------------------
-- 1) 2FA überall durchsetzen
-- ---------------------------------------------------------------------------

-- a) Restriktive 2FA-Regel (aus 017/018) für alle Tabellen, auch die später angelegten.
do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity loop
    execute format('drop policy if exists "2FA erzwingen" on public.%I', t.relname);
    execute format('create policy "2FA erzwingen" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', t.relname);
  end loop;
end $$;

-- b) Dateien (Profilbilder, Banner, Projektbilder, Seiten-Medien)
drop policy if exists "2FA erzwingen" on storage.objects;
create policy "2FA erzwingen" on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- c) SECURITY-DEFINER-Funktionen umgehen RLS. Deshalb zusätzlich ein Trigger auf den Tabellen,
--    in die sie schreiben. Server (service_role) und Migrationen haben keine auth.uid() und
--    sind nicht betroffen.
create or replace function public.require_mfa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.mfa_ok() then
    raise exception 'Bitte bestätige zuerst deinen 2FA-Code.' using errcode = '42501';
  end if;
  return null;
end;
$$;
revoke execute on function public.require_mfa() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['profile_links', 'waitlist_cards', 'page_versions', 'page_templates', 'beta_applications'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists require_mfa on public.%I', t);
      execute format('create trigger require_mfa before insert or update or delete on public.%I for each statement execute function public.require_mfa()', t);
    end if;
  end loop;
end $$;

-- Gleiches Prinzip direkt in der gemeinsamen Prüfung der freien Seite.
create or replace function public.page_guard()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not public.mfa_ok() then raise exception 'Bitte bestätige zuerst deinen 2FA-Code.' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;
revoke execute on function public.page_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Gesperrte Konten: keine Mitgliedsrechte, nichts mehr schreiben
-- ---------------------------------------------------------------------------

-- is_approved_member() steckt in fast allen Community-Regeln; eine Sperre ändert status nicht.
create or replace function public.is_approved_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and status = 'approved'
                    and not public.ban_active(banned, banned_until));
$$;

create or replace function public.me_banned()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and public.ban_active(banned, banned_until));
$$;
revoke execute on function public.me_banned() from public, anon;
grant execute on function public.me_banned() to authenticated;

-- Auch das Bearbeiten eigener Beiträge (diese Regeln prüfen is_approved_member nicht).
do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'post_likes', 'post_comment_reactions', 'listings',
                           'listing_likes', 'messages', 'message_reactions', 'projects', 'project_roles',
                           'project_interest', 'event_rsvps', 'event_signups'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "Sperre: nichts anlegen" on public.%I', t);
      execute format('create policy "Sperre: nichts anlegen" on public.%I as restrictive for insert to authenticated with check (not (select public.me_banned()))', t);
      execute format('drop policy if exists "Sperre: nichts ändern" on public.%I', t);
      execute format('create policy "Sperre: nichts ändern" on public.%I as restrictive for update to authenticated using (not (select public.me_banned())) with check (not (select public.me_banned()))', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Karten von Konten schützen
-- ---------------------------------------------------------------------------
-- a) Ohne Login (submit_waitlist_card) und von fremden Konten bleiben die Inhalte einer Karte,
--    die zu einem Konto gehört, unverändert. Zähler wie Aufrufe laufen weiter. Admins, der
--    Server (service_role) und die Besitzerin selbst dürfen ändern.
-- b) Übernimmt ein Konto beim ersten Login eine Karte von der Warteliste, fällt der Link weg:
--    Die Warteliste prüft die E-Mail nicht, eine untergeschobene Karte könnte sonst einen
--    Phishing-Link auf die öffentliche Seite bringen. Name, Text und Wunsch-Link bleiben.
create or replace function public.protect_owned_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if old.user_id is null and new.user_id is not null then
    new.link := '';
    return new;
  end if;
  if old.user_id is not null
     and auth.uid() is distinct from old.user_id
     and not public.is_admin() then
    new.user_id   := old.user_id;
    new.email     := old.email;
    new.name      := old.name;
    new.role      := old.role;
    new.skills    := old.skills;
    new.hours     := old.hours;
    new.looking   := old.looking;
    new.pitch     := old.pitch;
    new.lang      := old.lang;
    new.city      := old.city;
    new.mode      := old.mode;
    new.level     := old.level;
    new.link      := old.link;
    new.handle    := old.handle;
    new.is_public := old.is_public;
    new.design    := old.design;
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_owned_card() from public, anon, authenticated;
drop trigger if exists protect_owned_card on public.waitlist_cards;
create trigger protect_owned_card before update on public.waitlist_cards
  for each row execute function public.protect_owned_card();

-- ---------------------------------------------------------------------------
-- 4) Profilbild-Speicher: höchstens 3 Dateien pro Konto (Premium 10, Admins frei).
--    avatars.js löscht das alte Bild nach jedem Wechsel, im Alltag liegt also eine Datei dort.
-- ---------------------------------------------------------------------------
-- Zählt unabhängig von den Leserechten (security definer), nur die eigenen Dateien.
create or replace function public.avatar_upload_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from storage.objects o
           where o.bucket_id = 'avatars' and o.name like auth.uid()::text || '/%')
       < coalesce((select case when p.is_admin then 1000 when p.is_premium then 10 else 3 end
                     from public.profiles p where p.id = auth.uid()), 0);
$$;
revoke execute on function public.avatar_upload_allowed() from public, anon;
grant execute on function public.avatar_upload_allowed() to authenticated;

drop policy if exists "Xyntal Profilbild: Anzahl begrenzt" on storage.objects;
create policy "Xyntal Profilbild: Anzahl begrenzt" on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'avatars' or (select public.avatar_upload_allowed()));

-- ---------------------------------------------------------------------------
-- 5) Kleinere Härtungen
-- ---------------------------------------------------------------------------

-- Emoji-Reaktionen auf Kommentare nur aus der Auswahl der Website (COMMENT_EMOJIS in
-- public/pages/community.js). "not valid": bestehende Zeilen bleiben, neue werden geprüft.
alter table public.post_comment_reactions drop constraint if exists post_comment_reactions_emoji_allowed;
alter table public.post_comment_reactions add constraint post_comment_reactions_emoji_allowed
  check (emoji in ('❤️', '👍', '😂', '😮', '😢', '🔥')) not valid;

-- Link-Seite: Texteinträge sind erlaubt, gefährliche Link-Arten nicht.
alter table public.profile_links drop constraint if exists profile_links_url_scheme;
alter table public.profile_links add constraint profile_links_url_scheme
  check (url !~* '^[[:space:]]*(javascript|data|vbscript|file):') not valid;

-- Alte Empfehlungs-Funktionen der Warteliste (ohne Login, beliebige E-Mail) werden von der
-- Website nicht mehr benutzt; Empfehlungen laufen über claim_referral.
do $$
begin
  if to_regprocedure('public.get_referral_code(text)') is not null then
    revoke execute on function public.get_referral_code(text) from public, anon, authenticated;
  end if;
  if to_regprocedure('public.track_referral(text,text)') is not null then
    revoke execute on function public.track_referral(text, text) from public, anon, authenticated;
  end if;
end $$;

-- Trigger-Funktion mit vollständig qualifizierten Namen: fester, leerer search_path.
alter function public.check_post_comment_parent() set search_path = '';

commit;
