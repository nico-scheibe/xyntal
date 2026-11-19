-- RÜCKWEG: /opt/xyntal/backups/rueckweg-freiliste-20261118.sql auf dem Datenbankserver. Stellt die heutige Fassung der Regel
--   "Sperre: nichts loeschen" aus 20261118270000 wieder her. VOR dem Einspielen aus der Produktionsdatenbank ausgelesen und
--   in einer zurückgerollten Transaktion probegelaufen. Der Probelauf hat die heutige Bedingung wiederhergestellt.
--
-- Ersetzt die Regel "Sperre: nichts loeschen" auf storage.objects aus 20261118270000_sperre_nichts_loeschen.sql.
--   Die Datei 20261118270000 bleibt UNVERÄNDERT. Sie ist eingespielt und committet.
-- Gehört zu tests/sperre_nichts_loeschen.sql (dort ist die neue Fassung im Test belegt).
--
-- WAS SICH ÄNDERT: Die Bedingung wird von einer SPERRLISTE auf eine FREILISTE umgedreht.
--   Vorher (20261118270000): using (bucket_id <> 'message-attachments' or not (select public.me_banned()))
--   Jetzt:                   using (bucket_id in ('avatars', 'banners', 'xyntal-app-files') or not (select public.me_banned()))
--   Alles andere bleibt: as restrictive, for delete, to authenticated, dieselbe Funktion public.me_banned(), keine neue Funktion.
--
-- VORHER, gemessen auf der Produktion (zurückgerollt, also VOR 20261118270000, gesperrtes Mitglied,
--   storage.allow_delete_query gesetzt). Ein gesperrtes Mitglied löschte eigene Dateien:
--     page-media           DELETE 1
--     project-images       DELETE 1
--     avatars              DELETE 1
--     banners              DELETE 1
--     message-attachments  DELETE 0   (die Regel aus 20261118270000 greift nur hier)
--   Die Sperrliste hat also drei Eimer offen gelassen, die gesperrt sein sollten.
--
-- WARUM FREILISTE und nicht Sperrliste. Das ist die Gegenentscheidung zur Fassung von 20261118270000 (dort fail-open).
--   Sperrliste: sie nennt die gesperrten Eimer. Jeder KÜNFTIGE Eimer ist automatisch von der Sperre ausgenommen, und
--     niemand merkt es. Genau diesen Fehler hat die Sperre beim Hochladen (20261118260000) schon einmal korrigiert,
--     mit derselben Richtung wie hier.
--   Freiliste: sie nennt die erlaubten Eimer. Jeder künftige Eimer ist für ein gesperrtes Mitglied gesperrt. Wird ein
--     künftiger Eimer Teil des Löschwegs der Kontolöschung, bricht die Kontolöschung SICHTBAR ab:
--     public/avatars.js Zeile 90-105 wirft bei Fehlschlag ("Die Profilbilder konnten nicht entfernt werden").
--     Ein sichtbarer Abbruch ist besser als ein stiller Schutzverlust.
--   Folge für die Praxis: Wer einen neuen Eimer anlegt, der ein gesperrtes Mitglied selbst löschen können muss,
--     muss ihn in diese Liste aufnehmen. Sonst bleibt er für Gesperrte gesperrt.
--
-- WARUM GENAU DIESE DREI EIMER. Jeder aus einem genannten Grund:
--   avatars und banners: der Löschweg der Kontolöschung läuft darüber, als das Mitglied selbst.
--     public/pages/profil.js Zeile 371 ruft deleteMemberAvatars(me.id) unmittelbar vor delete_my_account() auf.
--     public/avatars.js Zeile 90-93 entfernt genau diese zwei Eimer. Ohne die Ausnahme könnte ein gesperrtes Mitglied
--     sein Konto nicht mehr löschen (Recht auf Löschung, Art. 17 DSGVO).
--   xyntal-app-files: der Eimer der NATIVEN iOS-App (Sources/XyntalCore/Backend/SupabaseBackend.swift, Zeile 101-107 im
--     Checkout /Users/nico/xyntal-app). Die Ausnahme ist eine BENANNTE GRENZE, keine Beruhigung:
--     - Ein auf der Website gesperrtes Mitglied, das die native App nutzt, kann dort eigene Dateien weiter löschen.
--     - Gemessen auf der Produktionsdatenbank am 18.11.2026, dass nichts anderes das verhindert: Die erlaubende Löschregel
--       "xyntal app files delete" auf storage.objects prüft nur xyntal_app.file_permission(...) = 'edit'.
--       xyntal_app.file_permission(uuid) (SECURITY DEFINER) prüft Eigentümerschaft, Projektmitgliedschaft und Einträge in
--       file_shares, KEINE Sperre, weder die der Website noch eine eigene der App. xyntal_app.is_active_user() existiert
--       auf der Produktion nicht.
--     - Warum die Ausnahme trotzdem drin ist: Sie hält den Stand der nativen App unverändert. Sie läuft außerdem mit der
--       Sperre beim Hochladen (20261118260000, Zeile 10 und 72) gleich, die denselben Eimer ausnimmt. Eine Sperre nur beim
--       Löschen, während das Hochladen frei bleibt, wäre in sich widersprüchlich.
--     - Größe, gemessen: Der Eimer enthält heute null Dateien.
--     - Hinweis für die nächste Person: Das Schema in /Users/nico/xyntal-app/supabase/schema.sql beschreibt die native App
--       und weicht von der Produktionsdatenbank ab. Wer die Regeln dieses Eimers beurteilen will, muss die Produktion
--       messen, nicht dieses Repo lesen. Genau dieser Fehler hat zu einer falschen Beruhigung geführt.
--
-- OFFENE FRAGE, ausdrücklich offen: Soll die Sperre der Website in die native App greifen? Das ist unentschieden. Bis
--   dahin ist die Ausnahme für xyntal-app-files eine BEKANNTE LÜCKE, keine geschlossene Tür.
--
-- FOLGEN, ehrlich benannt:
--   1) page-media. NACHTRAG 19.11.2026, ersetzt die frühere Fassung dieses Punkts, die heute überholt ist:
--      ÜBERHOLT: "Ein Seitenbild eines gesperrten Mitglieds kann von NIEMANDEM entfernt werden, auch nicht von einem
--      Admin." Das stimmte bis zur Migration 20261119120000_admin_seitenbild.sql. Seit dort hat die erlaubende Regel
--      "Xyntal Seitenbild entfernen" den Admin-Zweig (is_admin()). Ein nicht gesperrter Admin kann daher das Seitenbild
--      eines gesperrten Mitglieds entfernen. Die Sperre prüft den handelnden Nutzer, nicht den Eigentümer. Der Admin ist
--      nicht gesperrt, also passiert er die Sperre. is_admin() schließt gesperrte Admins aus.
--      Unverändert: Das gesperrte Mitglied selbst kann sein Seitenbild weiterhin nicht entfernen.
--      Die Grenze der Admin-Migration (die Seite selbst wird nicht mitbearbeitet) steht in 20261119120000.
--   2) Der Seiten-Editor räumt nicht benutzte page-media-Bilder beim Veröffentlichen auf (public/page-editor.js,
--      Zeile 920 und 941: cleanupMedia() steht hinter dem Aufruf von save_my_page). Dieser Weg ist für ein gesperrtes
--      Mitglied NICHT erreichbar: save_my_page ruft page_guard() auf, und page_guard() bricht bei einem gesperrten Profil
--      mit 'account banned' ab, bevor das Aufräumen startet. Die Löschsperre auf page-media trifft diesen Weg also nicht.
--      Gemessen: page-media enthält heute NULL Dateien.
--   3) Kontolöschung: page-media und project-images werden bei der Kontolöschung weiterhin NICHT abgeräumt. Das ist ein
--      älterer Befund und nicht Gegenstand dieser Datei.
--   4) Lesen und Anlegen werden von dieser Regel NICHT berührt. Sie ist nur FOR DELETE.
--   5) Die Zeilen in public.message_attachments sind eine eigene Sperre (20261118280000), nicht Gegenstand dieser Datei.
--
-- NULL: Ein Eintrag mit bucket_id NULL ist für ein gesperrtes Mitglied nicht löschbar. "NULL in (...)" ist NULL, und
--   NULL or false ist NULL, das zählt als nicht erlaubt. Das ist dasselbe Verhalten wie bisher.
--
-- "to authenticated" darf nicht fehlen. Eine beschränkende Regel ohne Rollenangabe gilt für JEDE Rolle, auch für anon und
--   service_role. Dasselbe Argument wie in 20261118260000.
--
-- public.me_banned() wird wiederverwendet (20261109120000_security_hardening.sql, Zeile 86-89). Keine neue Funktion.
--
-- Ausführen im Supabase SQL Editor als postgres. Läuft als Transaktion. Darf mehrfach laufen.
--
-- NACHMESSEN nach dem Einspielen. storage.objects gehört supabase_storage_admin. Bei fremder Eigentümerschaft ist ein
--   stiller Fehlschlag die typische Falle. Deshalb prüfen:
--     select policyname, permissive, cmd, roles, qual from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname = 'Sperre: nichts loeschen';
--   Erwartet: genau eine Zeile, RESTRICTIVE, DELETE, {authenticated}, und qual nennt avatars, banners und xyntal-app-files.
--   Steht dort noch message-attachments, ist die alte Fassung geblieben.

begin;

-- Blockierwartezeit. drop policy und create policy nehmen ACCESS EXCLUSIVE auf storage.objects. Hängt dort eine
--   lange Transaktion, stauen sich sonst alle Dateizugriffe dahinter. Dann lieber nach 3 Sekunden abbrechen.
set local lock_timeout = '3s';

-- Sicherheitsnetz: ohne me_banned(), storage.objects und storage.buckets ist diese Migration nicht anwendbar.
-- Die Eimer-Prüfung steht NACH der Regel, siehe unten. Sie liest die Eimernamen aus der erzeugten Regel.
do $$ begin
  if to_regprocedure('public.me_banned()') is null then
    raise exception 'public.me_banned() fehlt. Sie stammt aus 20261109120000_security_hardening.sql.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects fehlt. Diese Migration gehört in eine Supabase-Datenbank mit Storage.';
  end if;
  if to_regclass('storage.buckets') is null then
    raise exception 'storage.buckets fehlt. Diese Migration gehört in eine Supabase-Datenbank mit Storage.';
  end if;
end $$;

-- Beschränkende Regel für DELETE. FREILISTE: genannt sind die Eimer, die ein gesperrtes Mitglied selbst löschen darf.
--   Alle anderen Eimer, auch künftige, sind für ein gesperrtes Mitglied gesperrt.
drop policy if exists "Sperre: nichts loeschen" on storage.objects;
create policy "Sperre: nichts loeschen" on storage.objects
  as restrictive for delete to authenticated
  using (bucket_id in ('avatars', 'banners', 'xyntal-app-files') or not (select public.me_banned()));

-- ---------- Eimer-Prüfung NACH der Regel ----------
-- Was geprüft wird: Die Eimernamen werden aus der ERZEUGTEN Regel gelesen (pg_policies.qual) und gegen storage.buckets
--   gehalten. Es gibt damit KEINE zweite Liste, die auseinanderlaufen kann. Die Regel selbst ist die einzige Quelle der
--   Eimernamen. Ein Tippfehler in der Regel ('avatar' statt 'avatars') wird gefangen, weil der Name in storage.buckets fehlt.
-- Drei Abbruchgründe, jeder mit eigenem Satz im Fehlertext:
--   (a) Die Regel steht nicht in pg_policies. Dann ist das create policy nicht gelandet.
--   (b) Die Bedingung nennt keinen Eimernamen. Dann hat Postgres pg_policies.qual anders ausgegeben als erwartet, und die
--       Prüfung kann nichts belegen. Sie besteht dann NICHT stillschweigend, sondern bricht ab.
--   (c) Ein in der Regel genannter Eimer fehlt in storage.buckets. Ein Tippfehler in der Freiliste würde dann die
--       Kontolöschung eines gesperrten Mitglieds stumm sperren.
-- Was NICHT geprüft wird: ob die genannten Namen die richtigen Eimer meinen. Ein Name, der existiert, aber falsch gemeint
--   ist, fällt hier nicht auf.
-- Belege, dass die drei Eimer existieren:
--   avatars:          supabase/005_profile_avatars.sql, Zeile 9 (insert into storage.buckets ... 'avatars')
--   banners:          supabase/migrations/20261107120000_card_banners_premium.sql, Zeile 87 (insert ... 'banners')
--   xyntal-app-files: auf der Produktionsdatenbank vorhanden (gemessen am 18.11.2026). Die Anlage steht im Checkout der
--                     nativen App, /Users/nico/xyntal-app/supabase/schema.sql, Zeile 2150.
do $$
declare v_qual text; v_fehlend text; v_anzahl integer;
begin
  select qual into v_qual from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts loeschen';
  if v_qual is null then
    raise exception 'Die Regel "Sperre: nichts loeschen" steht nicht in pg_policies. Das create policy ist nicht gelandet. Die Migration bricht ab.';
  end if;
  -- Alle Eimernamen aus der Bedingung der Regel holen (Form: ''avatars''::text).
  with namen as (select (regexp_matches(v_qual, '''([a-z0-9-]+)''::text', 'g'))[1] as b)
  select count(*), string_agg(b, ', ') filter (where b not in (select id from storage.buckets))
    into v_anzahl, v_fehlend from namen;
  if v_anzahl = 0 then
    raise exception 'Die Bedingung der Regel "Sperre: nichts loeschen" nennt keinen einzigen Eimernamen. Die Ausgabeform von pg_policies.qual hat sich womöglich geändert, und die Eimer-Prüfung muss angepasst werden. Die Migration bricht ab, weil die Prüfung sonst nichts belegen würde.';
  end if;
  if v_fehlend is not null then
    raise exception 'Die Regel "Sperre: nichts loeschen" nennt Eimer, die in storage.buckets nicht existieren: %. Ein Tippfehler in der Freiliste würde die Kontolöschung eines gesperrten Mitglieds stumm sperren, weil der Löschweg dann einen Eimer nennt, den es nicht gibt. Die Migration bricht deshalb ab. Bitte den Eimernamen in der Freiliste korrigieren.', v_fehlend;
  end if;
end $$;

commit;
