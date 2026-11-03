-- Die Seite /tarif (Tarif & KI-Guthaben) darf von keinem Wunsch-Link (xyntal.de/name)
-- verdeckt werden. Erweitert die Liste aus 20261101120000_reserved_page_handles.sql.
-- Im Supabase SQL Editor ausführen. Vorher prüfen, ob schon jemand den Namen hat:
--   select handle, name from public.waitlist_cards where handle = 'tarif';
-- (Eine bestehende Karte bleibt unverändert, sie wäre aber ab jetzt von der Seite verdeckt.)

create or replace function public.reject_page_handles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if NEW.handle is not null and NEW.handle = any (array[
      '404', 'index', 'u', 'koppeln', 'app-anmeldung', 'arbeitsstil', 'fuer-dich', 'matching', 'tarif']) then
    raise exception 'Dieser Link gehört zu einer Seite von Xyntal. Bitte wähle einen anderen.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.reject_page_handles() from public;
