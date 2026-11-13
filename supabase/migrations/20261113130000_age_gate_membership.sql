-- Mindestalter 16 gilt ab jetzt nicht nur für die Sichtbarkeit des eigenen Profils, sondern
-- für den Zugriff: Mitgliederprofile lesen, Nachrichten schreiben, Projekte anlegen und sich
-- für Rollen melden. Bisher hielt die Altersprüfung nur das eigene Profil zurück – ein Konto
-- ohne Geburtsdatum galt trotzdem als aktives Mitglied und durfte jedem schreiben. Über die
-- Anbieter-Anmeldung (Apple, Google, Discord, LinkedIn) kam man ganz ohne Geburtsdatum dorthin.
--
-- Das alles hängt an einer einzigen Funktion, is_active_member(). Sie bekommt eine Bedingung
-- dazu, die Policies in 018 und 20261103180000 bleiben unverändert.
--
-- WAS DIESE MIGRATION NICHT ABDECKT: das Veröffentlichen eigener Daten. save_my_card(),
--   save_my_links() und save_my_page() prüfen nur Anmeldung, 2FA und Sperre (016_account_cards.sql
--   und page_guard() in 20261109120000_security_hardening.sql), nicht is_active_member(). Ein
--   neues Konto ohne Geburtsdatum kann also weiterhin eine öffentliche Karte unter xyntal.de/name
--   anlegen. Ebenso bleibt get_member_cards() für anon offen – das Kartenverzeichnis ist bewusst
--   öffentlich. Gesperrt ist hier die Tabelle profiles, nicht die Karten.
--
-- BESTANDSSCHUTZ: Konten, die es vor dieser Migration schon gab, behalten ihren Zugang ohne
--   Geburtsdatum. Sie sind nie nach ihrem Alter gefragt worden; sie jetzt auszusperren wäre
--   eine Strafe für etwas, das wir nicht gefragt haben. Dieselbe Regel gilt im App-Server:
--   dort sperrt birthdate IS NULL niemanden aus. Die Grenze ist der Zeitpunkt unten; alles,
--   was danach entsteht, braucht ein Geburtsdatum.
--
-- Wer ohne Geburtsdatum ankommt, wird nicht ausgesperrt, sondern gefragt: das eigene Profil
--   bleibt lesbar und änderbar (Policy „Profile lesen“ mit id = auth.uid()), und das Formular
--   zum Nachtragen steht auf der Profilseite (public/pages/profil.js, set_my_birthdate).
--
-- Einmal im Supabase SQL Editor ausführen, NACH 20261113120000_signup_birthdate.sql.
-- Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- Sicherheitsnetz: Ohne member_birthdates aus der vorigen Migration würde die neue Bedingung
-- jeden aussperren. Lieber hier mit klarer Ansage abbrechen als im laufenden Betrieb.
do $$ begin
  if to_regclass('public.member_birthdates') is null then
    raise exception 'Erst 20261113120000_signup_birthdate.sql ausführen, dann diese Migration.';
  end if;
  -- Zweites Sicherheitsnetz: Die Nachfolge-Migration 20261113140000 ersetzt age_check_start()
  -- durch den eingefrorenen Ausrollzeitpunkt. Liefe diese Datei danach noch einmal, würde sie
  -- den festen 14.11. zurückschreiben – und der Bestandsschutz wäre wieder für jeden abholbar,
  -- der bis dahin ein Konto anlegt. Die Dateien werden von Hand im SQL-Editor ausgeführt,
  -- deshalb hier ein klarer Abbruch statt einer stillen Rückabwicklung.
  if to_regclass('public.age_check_config') is not null then
    raise exception 'Diese Migration ist schon gelaufen und wurde von 20261113140000_age_gate_publishing.sql abgelöst. Nicht erneut ausführen.';
  end if;
end $$;

-- Stichtag des Bestandsschutzes. Bewusst ein fester Wert und nicht now(), damit ein zweiter
-- Lauf dieser Migration nicht plötzlich weitere Konten als Bestand zählt.
-- Bewusst der 14., nicht der 13.: Am 13. sind noch Konten entstanden, bevor das Geburtsdatum-
-- Formular live war. Sie wurden nie gefragt und gehören darum zum Bestand.
-- Der Zeitzonen-Versatz steht ausdrücklich dabei, sonst wäre immutable falsch.
create or replace function public.age_check_start()
returns timestamptz language sql immutable set search_path = '' as $$
  select timestamptz '2026-11-14 00:00:00+01'
$$;
revoke execute on function public.age_check_start() from public;
grant execute on function public.age_check_start() to anon, authenticated;

-- Grundlage: is_active_member() aus 20261103180000_website_ban.sql (die neueste Fassung,
-- mit Sperre und Beta-Bewerbung). Neu ist allein der letzte Block mit dem Geburtsdatum.
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until)
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
       -- Geburtsdatum vorhanden und ab 16 – oder Bestandskonto von vor dem Stichtag.
       and (
         p.created_at < public.age_check_start()
         or exists (select 1 from public.member_birthdates b
                     where b.id = p.id
                       and b.birthdate <= (current_date - interval '16 years')::date)
       )
  ) and not public.beta_application_required();
$$;
revoke execute on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

commit;
