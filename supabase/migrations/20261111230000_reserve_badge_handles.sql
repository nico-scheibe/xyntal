-- Sonder-Handles mit Badge gehören festen Konten: schneemann (Schneemann-Badge) und maxim (Ei „Last Egg Standing“).
-- Ohne diesen Trigger könnte jedes Konto den Handle setzen und das Badge bekommen, weil der Client
-- nur den Namen vergleicht. Gäste sehen user_id nicht (get_public_card), die Absicherung liegt deshalb hier.
-- Regeln:
--   • Anlegen ohne Konto (user_id null, z. B. anonyme Warteliste 013_waitlist_perks.sql) mit reserviertem
--     Handle: der Handle wird still weggelassen (NULL), die Anmeldung läuft durch. Der Upsert auf die
--     E-Mail (on conflict … do update) übernimmt dann über coalesce(excluded.handle, Bestand) den
--     Handle des Besitzers unverändert.
--   • Anlegen mit fremder user_id, oder Handle-Änderung durch ein fremdes Konto: abgelehnt (23514), wie
--     reject_page_handles in save_my_card.
--   • Ändert sich nur user_id (Konto gelöscht → on delete set null, Übernahme per E-Mail) und der Handle
--     gehört danach nicht mehr dem Besitzer, wird der Handle still freigegeben (NULL), statt zu werfen –
--     sonst bliebe ein Konto nicht löschbar.
--   • Der Besitzer selbst speichert normal, gibt den Handle frei und holt ihn später wieder zurück.
-- Bestandsprüfung: Vor dem Anlegen des Triggers bricht die Migration ab, wenn eine vorhandene Karte
-- schneemann oder maxim hält, aber nicht dem jeweiligen Besitzer gehört. Dann die Karte klären
-- (Wunsch-Link ändern oder Karte zuordnen) und die Datei erneut ausführen. Zur Ansicht vorab:
--   select id, handle, user_id, name from public.waitlist_cards where lower(handle) in ('schneemann', 'maxim');
-- Erwartet: schneemann → 0b842a42-ac01-4e81-9815-208108a8eb03, maxim → be172112-15cd-49de-af85-e7f71dfeac47.
-- Nach 20261111120000_design_unlocks.sql; Im Supabase SQL Editor ausführen.
--
-- Trigger-Reihenfolge: BEFORE-Trigger laufen alphabetisch nach Triggername. Der Name badge_handles_reserved
-- sortiert vor member_cards_public (setzt is_public := handle is not null). So sieht member_cards_public
-- den bereits geleerten Handle und setzt is_public korrekt auf false. Zusätzlich setzt dieser Trigger
-- is_public selbst auf false, falls er den Handle leert (für Karten ohne Konto, die member_cards_public
-- überspringt). protect_owned_card, protect_project_address und die waitlist_cards_*-Trigger sortieren
-- danach und sehen den schon geprüften Wert. protect_owned_card stellt bei anonymen Upserts auf eine
-- fremde Karte handle, user_id und is_public des Besitzers wieder her (20261109120000_security_hardening.sql).
begin;

create or replace function public.reserve_badge_handles()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_owner uuid;
begin
  if NEW.handle is null then return NEW; end if;
  v_owner := case lower(NEW.handle)
    when 'schneemann' then '0b842a42-ac01-4e81-9815-208108a8eb03'::uuid
    when 'maxim'      then 'be172112-15cd-49de-af85-e7f71dfeac47'::uuid
  end;
  if v_owner is null then return NEW; end if;            -- kein reservierter Handle
  if NEW.user_id is not distinct from v_owner then return NEW; end if;
  if TG_OP = 'INSERT' and NEW.user_id is null then
    -- Anlegen ohne Konto (z. B. anonyme Warteliste): Handle weglassen statt die Anmeldung zu verwerfen
    NEW.handle := null;
    NEW.is_public := false;
    return NEW;
  end if;
  if TG_OP = 'INSERT' or NEW.handle is distinct from OLD.handle then
    raise exception 'Dieser Link ist einem bestimmten Mitglied vorbehalten. Bitte wähle einen anderen.' using errcode = '23514';
  end if;
  if NEW.user_id is distinct from OLD.user_id then
    -- Besitz verloren (Konto gelöscht oder Karte übernommen): Handle frei geben statt zu werfen
    NEW.handle := null;
    NEW.is_public := false;
  end if;
  return NEW;
end;
$$;
revoke all on function public.reserve_badge_handles() from public;

-- Bestandsprüfung: keine fremde Karte darf schneemann oder maxim halten, bevor der Trigger aktiv wird.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s (id %s, user_id %s)', c.handle, c.id, coalesce(c.user_id::text, 'keins')), ', ')
    into v_bad
    from public.waitlist_cards c
   where (lower(c.handle) = 'schneemann' and c.user_id is distinct from '0b842a42-ac01-4e81-9815-208108a8eb03'::uuid)
      or (lower(c.handle) = 'maxim' and c.user_id is distinct from 'be172112-15cd-49de-af85-e7f71dfeac47'::uuid);
  if v_bad is not null then
    raise exception 'Abbruch: Diese Karten halten einen reservierten Handle, gehören aber nicht dem Besitzer: %. Bitte zuerst klären (Wunsch-Link ändern oder Karte zuordnen), dann die Migration erneut ausführen.', v_bad;
  end if;
end $$;

drop trigger if exists badge_handles_reserved on public.waitlist_cards;
create trigger badge_handles_reserved before insert or update of handle, user_id on public.waitlist_cards
  for each row execute function public.reserve_badge_handles();

commit;
