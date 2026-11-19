-- RÜCKWEG: /opt/xyntal/backups/rueckweg-admin-seitenbild-20261119.sql auf dem Datenbankserver. Stellt die beiden Regeln
--   "Xyntal Seitenbild lesen" und "Xyntal Seitenbild entfernen" in ihrer Fassung VOR dieser Migration wieder her (nur der
--   Eigentümer-Zweig). Die Datei wurde VOR dem Einspielen aus der Produktionsdatenbank ausgelesen (pg_policies.qual,
--   wortgleich) und in einer zurückgerollten Transaktion probegelaufen.
--
-- WARUM: Admins konnten Seitenbilder eines Mitglieds (Bucket page-media) über die Storage-Schnittstelle weder sehen noch
--   entfernen. Die Regeln auf storage.objects hatten nur den Eigentümer-Zweig. Die vier anderen Eimer (avatars, banners,
--   project-images, message-attachments) haben seit jeher je einen Admin-Zweig in Lese- und Löschregel. page-media war der
--   Ausreißer. Gemessen auf der Produktion am 19.11.2026.
--
-- WAS SICH ÄNDERT: Beide Regeln bekommen "or (select public.is_admin())" im using. Alles andere bleibt wortgleich:
--   Befehl (SELECT bzw. DELETE), permissive, Rolle authenticated, Eigentümer-Zweig, Bucket-Bedingung.
--   Keine neue Funktion, keine Änderung an public.is_admin(), keine Änderung an den restriktiven Regeln
--   ("2FA erzwingen", "Sperre: nichts loeschen"). Die Sperre prüft den handelnden Nutzer. is_admin() schließt gesperrte
--   Admins aus, und ohne aal2 (bei verifiziertem 2FA-Faktor) ist is_admin() false.
--
-- WARUM AUCH DIE LESEREGEL. Ein DELETE mit "where" braucht Sichtbarkeit. Fehlt die Leseregel, trifft das Löschen 0 Zeilen,
--   und das sieht wie Erfolg aus. Eine Löschregel ohne Leseregel ist kein Löschweg.
--
-- WAS DIESE MIGRATION NICHT LÖST:
--   1) Die gespeicherte Seite des Mitglieds (public.custom_page o. ä.) wird NICHT mitbearbeitet. Nach dem Entfernen einer
--      Datei zeigt die Seite an dieser Stelle eine Lücke. Für das Entfernen rechtswidriger Inhalte zählt, dass die Datei
--      weg ist. Die Seite selbst bleibt unangetastet, das ist eine bewusste Grenze.
--   2) page-media ist ein ÖFFENTLICHER Bucket (storage.buckets.public = t). Die Datei ist per URL erreichbar, solange sie
--      existiert, auch ohne Anmeldung. Deshalb zählt der Löschweg: Eine Regel, die nur in der Oberfläche greift, reicht
--      nicht. Die Löschung über sb.storage.from('page-media').remove() entfernt Zeile und Datei. Ein SQL-DELETE auf
--      storage.objects entfernt nur die Zeile, nicht die Datei (siehe public/avatars.js Zeile 88-89).
--   3) Kein Server-Endpunkt. /api/page-media in public/page-editor.js existiert in server.py nicht. Das ist ein eigenes Thema.
--
-- VORHER, gemessen auf der Produktion (rückgerollt, siehe Kopf von tests/admin_seitenbild_loeschen.sql):
--   Admin sieht fremde page-media-Zeile: nein. Admin löscht fremde page-media-Zeile: DELETE 0 (ohne Fehlermeldung).
--
-- Ausführen im Supabase SQL Editor als postgres oder per psql als postgres. Läuft als Transaktion. Darf mehrfach laufen.
--
-- GRENZE DER PRÜFUNG (ehrlich): Die Prüfung am Ende vergleicht den erzeugten Ausdruck mit der Bedingung DIESER Datei.
--   Sie belegt, dass die Regel die Bedingung mit dem Admin-Zweig per OR trägt. Sie belegt nicht, dass die Bedingung
--   fachlich das Richtige erlaubt. Das belegt der Test tests/admin_seitenbild_loeschen.sql mit echten Zusagen.
-- NACHMESSEN nach dem Einspielen. storage.objects gehört supabase_storage_admin. Die Prüfung am Ende dieser Datei vergleicht den
--   erzeugten Ausdruck (pg_policies.qual) beider Regeln mit der Bedingung dieser Datei und bricht bei Abweichung ab. Manuell:
--     select policyname, cmd, qual from pg_policies
--      where schemaname = 'storage' and tablename = 'objects' and policyname like 'Xyntal Seitenbild%';
--   Erwartet: beide Zeilen enthalten is_admin(), per OR an den Eigentümer-Zweig gehängt.

begin;

-- Blockierwartezeit. drop policy und create policy nehmen ACCESS EXCLUSIVE auf storage.objects. Hängt dort eine lange
--   Transaktion, stauen sich sonst alle Dateizugriffe dahinter. Dann lieber nach 3 Sekunden abbrechen.
set local lock_timeout = '3s';

-- Sicherheitsnetz: ohne public.is_admin() und storage.objects ist diese Migration nicht anwendbar.
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() fehlt. Sie stammt aus 20261118250000_is_admin_sperre.sql. Die Migration wird nicht angewendet.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects fehlt. Diese Migration gehört in eine Supabase-Datenbank mit Storage.';
  end if;
end $$;

-- Lesen: Eigentümer und Admin. Wortgleich zur bisherigen Regel, nur um den Admin-Zweig erweitert.
drop policy if exists "Xyntal Seitenbild lesen" on storage.objects;
create policy "Xyntal Seitenbild lesen" on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'page-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- Entfernen: Eigentümer und Admin. Wortgleich zur bisherigen Regel, nur um den Admin-Zweig erweitert.
drop policy if exists "Xyntal Seitenbild entfernen" on storage.objects;
create policy "Xyntal Seitenbild entfernen" on storage.objects
  as permissive for delete to authenticated
  using (
    bucket_id = 'page-media'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- ---------- Prüfung NACH dem Anlegen ----------
-- Verglichen wird der GERENDERTE Ausdruck der echten Regel (pg_policies.qual) mit dem gerenderten Ausdruck derselben
--   Bedingung, angelegt auf einer temporären Tabelle. Beide Seiten rendert dieselbe Datenbank, also entfällt jede
--   Normalisierung von Klammern, Casts oder "( SELECT ... )"-Hüllen. Ein Ausdruck, bei dem der Admin-Zweig fehlt oder
--   statt per OR mit AND verknüpft ist, weicht im Ganzen ab und bricht die Migration ab.
-- Zusätzlich geprüft: Befehl, Art und Rolle (SELECT bzw. DELETE, PERMISSIVE, {authenticated}), und dass genau zwei
--   Regeln da sind.
-- WAS DIE PRÜFUNG NICHT BELEGT: Sie zeigt, dass die echte Regel denselben Ausdruck hat wie die Bedingung in DIESER
--   Datei. Sie prüft nicht, ob diese Bedingung fachlich richtig ist. Wer beide Stellen (create policy und Vergleich)
--   gemeinsam ändert, umgeht die Prüfung bewusst. Die Bedingung ist deshalb der Ort, an dem man die Rechte liest.
-- Die temporäre Tabelle berührt storage.objects nicht. Sie wird am Ende der Prüfung wieder entfernt.
do $$
declare
  r record;
  n integer := 0;
  erwartet_lesen text;
  erwartet_entfernen text;
begin
  create temp table pruef_seitenbild (bucket_id text, name text);
  create policy "pruef lesen" on pruef_seitenbild as permissive for select to authenticated
    using (bucket_id = 'page-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
  create policy "pruef entfernen" on pruef_seitenbild as permissive for delete to authenticated
    using (bucket_id = 'page-media' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));
  select qual into erwartet_lesen from pg_policies where tablename = 'pruef_seitenbild' and policyname = 'pruef lesen';
  select qual into erwartet_entfernen from pg_policies where tablename = 'pruef_seitenbild' and policyname = 'pruef entfernen';
  drop table pruef_seitenbild;
  if erwartet_lesen is null or erwartet_entfernen is null then
    raise exception 'Die Referenz für den Vergleich konnte nicht gerendert werden. Die Migration bricht ab.';
  end if;

  for r in
    select policyname, cmd, permissive, roles::text as rollen, qual
      from pg_policies
     where schemaname = 'storage' and tablename = 'objects'
       and policyname in ('Xyntal Seitenbild lesen', 'Xyntal Seitenbild entfernen')
  loop
    n := n + 1;
    if r.permissive is distinct from 'PERMISSIVE' or r.rollen is distinct from '{authenticated}' then
      raise exception 'Die Regel "%" hat nicht die erwartete Art oder Rolle (permissive=%, roles=%). Die Migration bricht ab.', r.policyname, r.permissive, r.rollen;
    end if;
    if r.policyname = 'Xyntal Seitenbild lesen' and (r.cmd is distinct from 'SELECT' or r.qual is distinct from erwartet_lesen) then
      raise exception 'Die Regel "Xyntal Seitenbild lesen" weicht vom erwarteten Ausdruck ab (Befehl=%). Erwartet: %. Gefunden: %. Die Migration bricht ab und wird zurückgerollt.', r.cmd, erwartet_lesen, r.qual;
    end if;
    if r.policyname = 'Xyntal Seitenbild entfernen' and (r.cmd is distinct from 'DELETE' or r.qual is distinct from erwartet_entfernen) then
      raise exception 'Die Regel "Xyntal Seitenbild entfernen" weicht vom erwarteten Ausdruck ab (Befehl=%). Erwartet: %. Gefunden: %. Die Migration bricht ab und wird zurückgerollt.', r.cmd, erwartet_entfernen, r.qual;
    end if;
  end loop;
  if n <> 2 then
    raise exception 'Erwartet waren 2 Regeln "Xyntal Seitenbild ...", gefunden: %. Die Migration bricht ab.', n;
  end if;
end $$;

commit;
