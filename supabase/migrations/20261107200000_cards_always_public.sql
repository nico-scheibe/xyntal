-- Mitgliederkarten sind immer öffentlich. Nach 20261107190000_banner_limits_table.sql ausführen.
--
-- • Ein Trigger setzt is_public bei jeder Karte mit Konto (user_id) auf "hat einen
--   Wunsch-Link": save_my_card, der App-Server (Service Role) und alles andere schreiben
--   damit dasselbe. Ohne Wunsch-Link gibt es keine Adresse, unter der die Karte stehen
--   könnte; meine-karte und die App verlangen deshalb einen.
-- • Ausnahme: Ein Admin kann eine Karte ausblenden (Admin-Seite, is_public = false). Das
--   gilt, bis das Mitglied die Karte das nächste Mal speichert. Dauerhaft geht das über
--   die Kontosperre (gesperrte Karten zeigt keine Liste).
-- • Wartelisten-Karten ohne Konto bleiben, wie sie sind (dort fehlt die bestätigte E-Mail).
-- • Bestehende Mitgliederkarten mit Wunsch-Link werden einmal öffentlich geschaltet.
begin;

create or replace function public.member_cards_public()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and public.is_admin()
     and old.is_public and not new.is_public then
    return new; -- ein Admin blendet die Karte aus
  end if;
  new.is_public := new.handle is not null;
  return new;
end;
$$;
drop trigger if exists member_cards_public on public.waitlist_cards;
create trigger member_cards_public before insert or update on public.waitlist_cards
  for each row execute function public.member_cards_public();

update public.waitlist_cards set is_public = true
 where user_id is not null and handle is not null and not is_public;

commit;
