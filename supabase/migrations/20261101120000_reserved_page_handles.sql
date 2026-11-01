-- Wunsch-Links (xyntal.de/name) dürfen keine Seite der Website verdecken: eine echte Seite
-- gewinnt immer, eine Karte unter demselben Namen wäre nie erreichbar.
-- save_my_card() prüft eine feste Liste (016_account_cards.sql); Seiten, die danach dazukamen,
-- sperrt dieser Trigger – für jeden Schreibweg (Karte speichern, Warteliste, Admin).
-- Im Supabase SQL Editor ausführen. Vorher prüfen, ob schon jemand einen dieser Namen hat:
--   select handle, name from public.waitlist_cards
--   where handle = any (array['404','index','u','koppeln','app-anmeldung','arbeitsstil','fuer-dich']);
-- (Bestehende Karten bleiben unverändert; nur neue oder geänderte Links werden abgelehnt.)

create or replace function public.reject_page_handles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if NEW.handle is not null and NEW.handle = any (array[
      '404', 'index', 'u', 'koppeln', 'app-anmeldung', 'arbeitsstil', 'fuer-dich']) then
    raise exception 'Dieser Link gehört zu einer Seite von Xyntal. Bitte wähle einen anderen.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;
revoke all on function public.reject_page_handles() from public;

drop trigger if exists waitlist_cards_reserved_handle on public.waitlist_cards;
create trigger waitlist_cards_reserved_handle
  before insert or update of handle on public.waitlist_cards
  for each row execute function public.reject_page_handles();
