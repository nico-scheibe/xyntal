-- Sperre wirkt auf Uploads. Ein gesperrtes Mitglied konnte bisher in drei Xyntal-Eimern weiter hochladen.
--   Gemessen: Von den Upload-Regeln auf storage.objects prüfen nur page-media (not ban_active) und
--   message-attachments (über is_active_member(), darin ban_active) die Sperre. avatars, banners und
--   project-images prüfen sie nicht. Die Lücke ist in tests/sperre_uploads.sql (Block a) belegt.
-- Zwei beschränkende Regeln statt geänderter erlaubender: "Sperre: nichts hochladen" (INSERT) und
--   "Sperre: nichts ueberschreiben" (UPDATE). Beide sind fail-closed (siehe Block 2): Sie greifen für jeden
--   Eimer, außer dem ausdrücklich genannten Ausnahme-Eimer. Ein Eimer, den jemand morgen anlegt, ist also
--   automatisch gesperrt. Die bestehenden erlaubenden Upload-Regeln bleiben unangetastet.
-- Nicht berührt: "Xyntal Profilbild: Anzahl begrenzt" begrenzt eine Anzahl, keine Sperre, dort gehört sie nicht hinein.
-- Ausnahme: der Eimer xyntal-app-files im Schema xyntal_app (zweite Anwendung). Die Regeln lassen ihn ausdrücklich frei.
-- Nicht Teil davon: project-images prüft überhaupt keine Mitgliedschaft. Das ist ein eigener Befund.
--
-- Ausführen im Supabase SQL Editor als postgres. Läuft als Transaktion. Darf mehrfach laufen.
--
-- NACHMESSEN nach dem Einspielen. storage.objects gehört supabase_storage_admin, nicht postgres. postgres kann
--   dort Regeln anlegen und entfernen (gemessen, in einer zurückgerollten Transaktion). Bei fremder Eigentümerschaft
--   ist ein stiller Fehlschlag die typische Falle. Deshalb nach dem Einspielen prüfen:
--     select policyname, permissive, cmd, roles from pg_policies
--      where schemaname = 'storage' and tablename = 'objects'
--        and policyname in ('Sperre: nichts hochladen', 'Sperre: nichts ueberschreiben')
--      order by policyname;
--   Erwartet: genau zwei Zeilen, beide RESTRICTIVE, {authenticated}: "Sperre: nichts hochladen" mit INSERT,
--   "Sperre: nichts ueberschreiben" mit UPDATE. Fehlt eine, ist die Migration nicht gelandet.

begin;

-- Blockierwartezeit. drop policy und create policy nehmen ACCESS EXCLUSIVE auf storage.objects. Hängt dort eine
--   lange Transaktion, stauen sich sonst alle Uploads dahinter. Dann lieber nach 3 Sekunden abbrechen und erneut versuchen.
set local lock_timeout = '3s';

-- Sicherheitsnetz: ohne ban_active(), me_banned() und storage.objects ist diese Migration nicht anwendbar.
do $$ begin
  if to_regprocedure('public.ban_active(boolean, timestamptz)') is null then
    raise exception 'public.ban_active(boolean, timestamptz) fehlt. Erst 20261103180000_website_ban.sql einspielen.';
  end if;
  if to_regprocedure('public.me_banned()') is null then
    raise exception 'public.me_banned() fehlt. Sie stammt aus 20261109120000_security_hardening.sql.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'storage.objects fehlt. Diese Migration gehört in eine Supabase-Datenbank mit Storage.';
  end if;
end $$;

-- ---------- 1) Sperrprüfung: public.me_banned() wiederverwenden (nicht neu anlegen) ----------
-- public.me_banned() existiert bereits. Sie stammt aus 20261109120000_security_hardening.sql, Rumpf:
--   select exists (select 1 from public.profiles where id = auth.uid() and public.ban_active(banned, banned_until));
--   (returns boolean, LANGUAGE sql, STABLE, SECURITY DEFINER, SET search_path = ''.)
-- Sie wird bewusst wiederverwendet statt eine zweite Funktion mit derselben Prüfung anzulegen. Zwei Namen für
--   dieselbe Prüfung laufen auseinander: Wird die Sperrsemantik an einer Stelle geändert, erwischt man leicht nur
--   die andere. Diese Migration legt deshalb keine Funktion an und ändert keine.
-- Rechte: In der Produktion hat me_banned() laut Befund die Rechte postgres, authenticated, service_role. Das
--   Repo-Grant in 20261109120000 nennt nur authenticated. service_role steht also nicht im Repo, sondern kommt dort
--   vermutlich über die Standardrechte. Dass service_role die Funktion ausführen darf, ist ohne Belang, weil
--   service_role den Zeilenschutz ohnehin umgeht. Die Regeln unten wirken für service_role nicht.
-- Warum eine Funktion statt eines exists über public.profiles direkt in der Regel, wie "Xyntal Seitenbild
--   hochladen" es tut? Die Unterabfrage einer Regel über public.profiles unterliegt der Leseregel von profiles.
--   Genau daran ist am 18.11. die Sende-Regel für Nachrichten still kaputtgegangen, als die Leseregel von profiles
--   verschärft wurde: Das exists lieferte false, ohne Fehlermeldung. Die Definer-Funktion läuft dagegen mit den
--   Rechten des Eigentümers und ist davon unabhängig.
-- Ehrlich dazu: Heute enthält "Profile lesen" den Zweig id = auth.uid(). Ein gesperrtes Mitglied kann seine eigene
--   Zeile also weiterhin lesen, und ein exists würde heute ebenfalls funktionieren. Die Funktion ist trotzdem die
--   robustere Wahl, weil genau dieser Zweig morgen wegfallen kann, und am 18.11. ist genau das passiert.
-- Kein Argument, also kein Orakel: Die Funktion beantwortet nur die eigene Lage (auth.uid()).

-- ---------- 2) Beschränkende Regel für INSERT (fail-closed) ----------
-- WARNUNG: "to authenticated" darf nicht fehlen. Eine beschränkende Regel ohne Rollenangabe gilt für JEDE Rolle.
--   Genau das hätte am 18.11. die Treffen-Anmeldung für Gäste zerstört.
-- Fail-closed statt Liste: Die Bedingung nennt den einen Ausnahme-Eimer und sperrt alles andere. Jeder Eimer, der
--   künftig angelegt wird, ist damit automatisch erfasst. Die frühere Form "bucket_id not in (...)" war fail-open:
--   Sie war für jeden Eimer wahr, der nicht in der Liste stand. Die Behauptung "greift auch für jede künftige
--   Upload-Regel" stimmte damit nur für die fünf genannten Eimer. Mit der Umkehrung stimmt sie.
-- xyntal-app-files ist der Eimer der zweiten Anwendung (Schema xyntal_app). Er ist ausdrücklich ausgenommen.
-- page-media und message-attachments prüfen die Sperre schon selbst. Die Regel erfasst sie trotzdem, damit sie
--   nicht von der Reihenfolge anderer Prüfungen abhängt.
drop policy if exists "Sperre: nichts hochladen" on storage.objects;
create policy "Sperre: nichts hochladen" on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id = 'xyntal-app-files' or not (select public.me_banned())
  );

-- ---------- 3) Beschränkende Regel für UPDATE ----------
-- Heute gibt es keine erlaubende UPDATE-Regel auf storage.objects. Ein Überschreiben ist für authenticated daher
--   unmöglich. Sobald jemand upsert ermöglicht (die Storage-Schnittstelle schreibt dann per UPDATE), würde ein
--   gesperrtes Mitglied wieder hochladen. Diese Regel verhindert das schon vorher.
-- NICHT "for all": Das würde auch SELECT und DELETE erfassen. Ein gesperrtes Mitglied könnte dann seine eigenen
--   Bilder nicht mehr sehen und nicht mehr löschen. Freigegeben hat der Nutzer nur das Einschränken des Hochladens,
--   nicht das Lesen oder Löschen. Daraus kein "for all" machen, auch wenn es kürzer aussieht.
drop policy if exists "Sperre: nichts ueberschreiben" on storage.objects;
create policy "Sperre: nichts ueberschreiben" on storage.objects
  as restrictive for update to authenticated
  using (bucket_id = 'xyntal-app-files' or not (select public.me_banned()))
  with check (bucket_id = 'xyntal-app-files' or not (select public.me_banned()));

commit;
