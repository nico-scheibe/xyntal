-- Ein hinterlegtes Geburtsdatum entscheidet über das Mindestalter 16 – immer, egal wann das
-- Konto angelegt wurde. Bisher war age_ok() ein ODER: Der Bestandsschutz (Konto von vor dem
-- Stichtag) war für sich allein genug, und ein Datum konnte daran nichts ändern.
--
-- DIE LÜCKE: Ein Konto von vor dem Stichtag hat den Bestandsschutz immer. Trägt ein Admin über
--   admin_set_birthdate() das echte Datum eines 14-Jährigen nach, passierte deshalb nichts: Die
--   öffentliche Karte blieb online, is_active_member() blieb wahr. Genau dafür war die
--   Berichtigung gebaut, und sie wirkte nicht.
--
-- WARUM DAS DATUM DEN BESTANDSSCHUTZ SCHLÄGT: Der Bestandsschutz beruht darauf, dass wir ein
--   Konto nie nach seinem Alter gefragt haben. Liegt ein Datum vor, ist diese Voraussetzung
--   weggefallen. Dann zählt, was wir wissen, und nicht mehr, wann das Konto entstanden ist.
--
-- BESTANDSSCHUTZ BLEIBT FÜR KONTEN OHNE DATUM UNVERÄNDERT: Ein Konto von vor dem Stichtag ohne
--   hinterlegtes Datum bleibt erlaubt, wie bisher. Ein Konto ab dem Stichtag ohne Datum
--   bleibt ausgesperrt, wie bisher. Für Konten ohne Datum ändert sich nichts; niemand verliert
--   dadurch Zugang, der ihn vorher hatte. Ausgesperrt wird nur, wessen hinterlegtes Datum unter
--   16 liegt, unabhängig vom Anlagedatum – das ist der beabsichtigte Effekt.
--
-- KARTEN WERDEN SOFORT NACHGEZOGEN: Ein schon hinterlegtes unter-16-Datum muss sofort wirken,
--   nicht erst beim nächsten Speichern der Karte. Der Trigger member_cards_public() prüft nur
--   beim Schreiben, und bestehende Karten würden sonst öffentlich bleiben, bis das Mitglied sie
--   zufällig selbst anfasst. Nachgezogen wird nur in Richtung „nicht öffentlich“.
--
-- Die Funktionen is_active_member(), profile_review_problem(), member_cards_public(),
--   set_my_birthdate() und admin_set_birthdate() werden NICHT geändert. Sie rufen age_ok()
--   auf und bekommen die neue Regel von selbst.
--
-- Einmal im Supabase SQL Editor ausführen, NACH den drei Migrationen vom 13.11.
--   (20261113120000, 20261113130000, 20261113140000).
-- Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- Sicherheitsnetz: age_ok() greift auf member_birthdates und age_check_start() zu. Beides legen
-- die drei Migrationen vom 13.11. an. Ohne sie scheitert die Funktion beim Anlegen oder liefe
-- ins Leere, und die Karten-Nachziehung würde auf einer falschen Grundlage laufen. Lieber hier
-- mit klarer Ansage abbrechen.
do $$ begin
  if to_regprocedure('public.age_ok(uuid)') is null then
    raise exception 'Erst die Migrationen vom 13.11. einspielen (20261113120000, 20261113130000, 20261113140000), dann diese Migration.';
  end if;
end $$;

-- ---------- Die Altersregel: ein hinterlegtes Datum schlägt den Bestandsschutz ----------
-- Grundlage: age_ok() aus 20261113140000_age_gate_publishing.sql. Neu ist allein die Verzweigung:
-- Liegt ein Datum vor, entscheidet es. Nur ohne Datum greift der Stichtag.
-- age_ok(null) ist false: Ohne Konto gibt es weder Datum noch Bestandsschutz.
create or replace function public.age_ok(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_id is not null and case
    when exists (select 1 from public.member_birthdates b where b.id = p_id)
      then exists (select 1 from public.member_birthdates b where b.id = p_id
                    and b.birthdate <= (current_date - interval '16 years')::date)
    else exists (select 1 from public.profiles p
                  where p.id = p_id and p.created_at < public.age_check_start())
  end;
$$;
revoke execute on function public.age_ok(uuid) from public, anon, authenticated;

-- ---------- Bestehende Karten nachziehen ----------
-- Nur in Richtung „nicht öffentlich“: Karten, die die neue Regel nicht mehr trägt, werden
-- ausgeblendet. Karten, die sie weiterhin tragen, bleiben unangetastet. Idempotent, weil ein
-- zweiter Lauf nur noch Karten mit is_public = true und age_ok = false findet, und das sind
-- nach dem ersten Lauf keine mehr.
update public.waitlist_cards set is_public = false
 where is_public and not public.age_ok(user_id);

commit;
