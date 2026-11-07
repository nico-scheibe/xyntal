-- xyntal.de/invite ist jetzt eine Seite der Website (Einladungsseite xyntal.de/<name>/invite).
-- Ein Wunsch-Link "invite" wäre nie erreichbar; der Trigger sperrt ihn für neue und geänderte Links
-- (bestehende Karten bleiben unverändert). Vorher prüfen:
--   select handle, name from public.waitlist_cards where handle = 'invite';
-- Nach 20261107220000_member_invites.sql; Im Supabase SQL Editor ausführen.
create or replace function public.reject_page_handles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if NEW.handle is not null and NEW.handle = any (array[
      '404', 'index', 'u', 'koppeln', 'app-anmeldung', 'arbeitsstil', 'fuer-dich', 'matching', 'invite']) then
    raise exception 'Dieser Link gehört zu einer Seite von Xyntal. Bitte wähle einen anderen.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.reject_page_handles() from public;
