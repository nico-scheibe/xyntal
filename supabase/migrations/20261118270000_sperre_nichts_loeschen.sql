-- RÜCKWEG: /opt/xyntal/backups/rueckweg-loeschen-20261118.sql auf dem Datenbankserver. VOR dem Einspielen erzeugt und probegelaufen.
-- Sperre wirkt auf Löschen, aber nur im Eimer message-attachments.
-- Gemessen auf der Produktion (zurückgerollt, gesperrtes Mitglied, storage.allow_delete_query gesetzt):
--   drei Löschvorgänge gelingen mit DELETE 1, in avatars, message-attachments und project-images.
--   Die Löschregeln auf storage.objects prüfen weder Sperre noch Mitgliedschaft.
--   Die Lücke ist in tests/sperre_nichts_loeschen.sql (Block a) belegt.
--
-- WARUM NUR message-attachments, und nicht "Löschen sperren" allgemein. Das ist eine Entscheidung mit harten Gründen.
--
-- avatars und banners BLEIBEN löschbar. Sie sind der Löschweg des Kontos:
--   public/pages/profil.js Zeile 371 ruft deleteMemberAvatars(me.id) unmittelbar VOR delete_my_account() auf.
--   public/avatars.js Zeile 90-93 deckt genau diese zwei Eimer ab. Scheitert das Entfernen, wirft die Funktion
--   ("Die Profilbilder konnten nicht entfernt werden", public/avatars.js Zeile 104). Eine Sperre dort würde die
--   Kontolöschung also nicht verschlechtern, sondern ganz verhindern: für das Mitglied selbst und für den Admin-Weg
--   in public/pages/admin-people.js Zeile 536. Das ist das Recht auf Löschung nach Art. 17 DSGVO.
-- page-media und project-images BLEIBEN löschbar. Diese Eimer werden bei einer Kontolöschung überhaupt nicht
--   abgeräumt, der Löschablauf kennt sie nicht. Eine Sperre nähme einem Mitglied die einzige Möglichkeit, eigene
--   Inhalte selbst zu entfernen, ohne irgendeinen Gegenwert für die Moderation.
-- message-attachments WIRD gesperrt. Das ist der Beweis zu einer Meldung: Wenn ein Vorfall um ein Mitglied unter 16
--   aufgeklärt werden soll, darf der Betroffene die Anhänge nicht entfernen können. Der Eimer ist nicht Teil des
--   Löschwegs (die Stellen oben nennen ihn nicht), die Sperre bricht dort also nichts.
--
-- Die Grenze, ehrlich benannt: Dateien in message-attachments, page-media und project-images werden bei einer
--   Kontolöschung NICHT entfernt und überleben das Konto. Das ist ein eigener, älterer Befund und nicht Gegenstand
--   dieser Datei. Wer die Löschsperre später auf weitere Eimer ausdehnen will, muss ZUERST dem Löschablauf beibringen,
--   diese Eimer abzuräumen. Sonst sperrt er Menschen von ihren eigenen Daten aus.
--
-- FAIL-OPEN, anders als bei der Upload-Sperre (20261118260000). Das ist Absicht, kein Fehler:
--   Upload: die Liste ist fail-closed. Jeder Eimer, den morgen jemand anlegt, ist gesperrt, außer dem Ausnahme-Eimer.
--     Das ist richtig, weil ein neuer Upload-Eimer ein unkontrollierter Einstieg wäre.
--   Löschen: die Liste ist fail-OPEN. Nur message-attachments ist gesperrt, jeder andere Eimer, auch ein künftiger,
--     bleibt löschbar. Fail-closed wäre hier falsch, weil eine zu weite Löschsperre Menschen von ihren eigenen Daten
--     aussperrt und im schlimmsten Fall die Kontolöschung verhindert (siehe oben).
--   Wer die eine Form für einen Fehler hält, weil die andere Datei es anders macht, liest sie falsch.
--
-- Eine Folge der Richtung: Ein Eintrag mit bucket_id NULL ist für ein gesperrtes Mitglied nicht löschbar, denn das
--   NULL-Ergebnis von "bucket_id <> 'message-attachments'" zählt als nicht erlaubt. In Supabase ist bucket_id im
--   Normalfall gesetzt. Die Testdatenbank bildet die Spalte nullable nach, wie gemessen.
--
-- "to authenticated" darf nicht fehlen. Eine beschränkende Regel ohne Rollenangabe gilt für JEDE Rolle, auch für
--   anon und service_role. Dasselbe Argument wie in 20261118260000: Dort hätte eine solche Regel am 18.11. die
--   Treffen-Anmeldung für Gäste zerstört. Hier würde sie anon und service_role an eine Sperre binden, die nur für
--   angemeldete Mitglieder gilt.
--
-- public.me_banned() wird wiederverwendet (20261109120000_security_hardening.sql, Zeile 86-89). Es wird keine neue
--   Funktion angelegt. Die Begründung der Definer-Funktion steht in 20261118260000, Block 1.
--
-- Ausführen im Supabase SQL Editor als postgres. Läuft als Transaktion. Darf mehrfach laufen.
--
-- NACHMESSEN nach dem Einspielen. storage.objects gehört supabase_storage_admin. Bei fremder Eigentümerschaft ist
--   ein stiller Fehlschlag die typische Falle. Deshalb nach dem Einspielen prüfen:
--     select policyname, permissive, cmd, roles from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname = 'Sperre: nichts loeschen';
--   Erwartet: genau eine Zeile, RESTRICTIVE, DELETE, {authenticated}. Fehlt sie, ist die Migration nicht gelandet.

begin;

-- Blockierwartezeit. drop policy und create policy nehmen ACCESS EXCLUSIVE auf storage.objects. Hängt dort eine
--   lange Transaktion, stauen sich sonst alle Dateizugriffe dahinter. Dann lieber nach 3 Sekunden abbrechen.
set local lock_timeout = '3s';

-- Sicherheitsnetz: ohne me_banned() und storage.objects ist diese Migration nicht anwendbar.
do $$ begin
  if to_regprocedure('public.me_banned()') is null then
    raise exception 'public.me_banned() fehlt. Sie stammt aus 20261109120000_security_hardening.sql.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects fehlt. Diese Migration gehört in eine Supabase-Datenbank mit Storage.';
  end if;
end $$;

-- Eine beschränkende Regel für DELETE. Die Bedingung nennt den einen gesperrten Eimer; alles andere bleibt frei.
drop policy if exists "Sperre: nichts loeschen" on storage.objects;
create policy "Sperre: nichts loeschen" on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id <> 'message-attachments' or not (select public.me_banned()));

commit;
