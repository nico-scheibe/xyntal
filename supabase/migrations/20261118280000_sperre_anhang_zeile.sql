-- RÜCKWEG: /opt/xyntal/backups/rueckweg-anhangzeile-20261118.sql auf dem Datenbankserver. VOR dem Einspielen erzeugt und probegelaufen.
-- Sperre wirkt auf das LÖSCHEN DER ZEILE in public.message_attachments.
-- Gehört zu tests/sperre_anhang_zeile.sql. Die Datei-Seite (storage.objects) steht in 20261118270000_sperre_nichts_loeschen.sql.
--
-- DIE LÜCKE. Die Datei bleibt nach 20261118270000 liegen, aber die Zeile in public.message_attachments konnte ein
--   gesperrtes Mitglied weiter löschen. Die erlaubende Regel "Eigene Anhänge entfernen" (20261028140000, Zeile 381-391)
--   prüft keine Sperre. Die restriktiven Sperrregeln aus 20261109120000 gelten nur für INSERT und UPDATE, und nur für
--   eine Tabellenliste, in der message_attachments nicht steht. Eine DELETE-Variante gibt es nirgends.
--   Gemessen vom Prüfer (Wegwerf-Datenbank, Regeln wörtlich aus der Produktion): gesperrtes Mitglied löscht die Zeile,
--   ok:1, danach 0 verbleibende Zeilen. Erreichbar mit einem gültigen Zugangstoken über DELETE /rest/v1/message_attachments.
--   Folge: Pfadzuordnung, Dateityp, Größe und die Verbindung Datei → Nachricht → Empfänger sind weg.
--
-- WAS DIESE REGEL TUT, UND WAS NICHT. Sie beschränkt nur das EINZELNE Löschen einer Anhang-Zeile durch ein gesperrtes
--   Mitglied. Sie beschränkt weder Lesen noch Anlegen, und sie beschränkt die Kontolöschung nicht (siehe nächster Block).
--
-- KEINE AUSNAHME FÜR DIE KONTOLÖSCHUNG. Das ist die Unterscheidung, auf der diese Regel ruht.
--   ERSTER GRUND, der die Entscheidung trägt: delete_my_account() ist SECURITY DEFINER mit Eigner postgres (Angabe des
--   Koordinators; die Definition steht in 20261118180000_altersgrenze_sperrliste.sql, Zeile 198-199). postgres hat
--   rolbypassrls. Gemessen vom Koordinator auf der Produktionsdatenbank:
--     rolname        rolsuper  rolbypassrls
--     postgres       f         t
--     service_role   f         t
--     authenticated  f         f
--   Die Kontolöschung umgeht den Zeilenschutz also vollständig. Diese Regel kann sie nicht treffen, unabhängig davon,
--   wie eine Kaskade mit dem Zeilenschutz umgeht. Eine Ausnahme wäre wirkungslos, deshalb steht keine hier.
--
--   ZWEITES ARGUMENT, schwächer und NICHT tragend: Die Zeilen verschwinden über die Kaskade
--     auth.users → profiles → messages → message_attachments. Die Kette steht im Repo, jeweils on delete cascade:
--     profiles.id          references auth.users        supabase/schema.sql, Zeile 19
--     messages.sender_id   references public.profiles  supabase/003_community.sql, Zeile 63
--     message_attachments.message_id references messages 20261028140000_message_features.sql, Zeile 288
--   GEMESSEN, Messung des Koordinators (Produktionsdatenbank, zurückgerollte Transaktion, zwei Wegwerf-Tabellen; nicht vom
--   Entwickler dieser Datei nachgemessen): Auf dem Kind liegt eine BESCHRÄNKENDE Löschregel "using (false)", also ein
--   absolutes Löschverbot. Als authenticated scheiterte "delete from kind" mit DELETE 0. Das Löschen des Elternteils nahm
--   das Kind trotzdem mit. Eine Fremdschlüssel-Kaskade wertet die Zeilenschutzregeln also nicht aus.
--   Der Test (Block g in tests/sperre_anhang_zeile.sql) belegt die Kaskade NUR in seinem Testaufbau, ohne BYPASSRLS. Die
--   Eigenschaft in der Produktion steht in der Messung des Koordinators, nicht im Test.
--
--   Die Grenze, die bleibt: Die DATEI in message-attachments überlebt die Kontolöschung weiter (siehe 20261118270000).
--   Diese Migration ändert daran nichts. Die Zeile verschwindet, die Datei nicht.
--
-- ADMIN: DIE MODERATION VON ANHÄNGEN FUNKTIONIERT HEUTE NICHT, UNABHÄNGIG VON DIESER MIGRATION.
--   Die erlaubende Löschregel "Eigene Anhänge entfernen" (20261028140000, Zeile 381-391) nennt is_admin(). Aber
--   "Anhänge lesen" (20261028140000, Zeile 356-365) hat KEINEN Admin-Zweig. Ein DELETE mit where-Bedingung verlangt die
--   Lese-Sichtbarkeit. Gemessen, Messung des Koordinators (Produktion, zurückgerollte Transaktionen, Wegwerf-Tabelle mit
--   Löschen "using (true)" und Lesen nur für eigene Zeilen):
--     delete from probe where id = 2;   ->  DELETE 0   (die fremde Zeile wird nicht gefunden)
--     delete from probe;                ->  DELETE 2   (ohne where auch die unlesbare)
--   Die Schnittstelle erzeugt immer eine where-Bedingung. Folge: Ein Admin kann einen fremden Anhang heute NICHT löschen,
--   unabhängig von dieser Migration. Das Löschrecht existiert, ist aber nicht benutzbar.
--   Diese Migration ändert daran nichts, in keine Richtung. Sie nimmt dem gesperrten Mitglied das Löschen der EIGENEN
--   Zeile, sonst nichts.
--   Wer die Moderation von Anhängen handlungsfähig machen will, muss "Anhänge lesen" um einen Admin-Zweig erweitern. Das
--   ist eine eigene Entscheidung, weil sie die Admin-Einsicht in Direktnachricht-Anhänge erweitert. Sie gehört nicht in diese Datei.
--   Im Test (tests/sperre_anhang_zeile.sql, Block e) gibt es dafür eine Stellvertreter-Leseregel, als TEST markiert. Ohne
--   sie wäre der Admin-Weg auch ohne unsere Sperre zu. Der Test belegt damit nur die Löschregel, nicht das Verhalten in der Produktion.
--
-- WEICHLÖSCHEN, der zweite Weg. soft_delete_message() (20261028140000, Zeile 194-210) löscht Anhänge als Definer und
--   umgeht damit RLS. Der Trigger messages_soft_delete feuert BEFORE UPDATE OF deleted_at. Für ein gesperrtes Mitglied
--   bleibt dieser Weg zu, weil "Sperre: nichts ändern" (20261109120000) auf messages das UPDATE verbietet, bevor der
--   Trigger feuert. Diese Migration ändert daran nichts. Entfällt die Sperre "nichts ändern" auf messages, öffnet sich
--   dieser Weg wieder, und zwar ohne dass diese Regel ihn sieht.
--
-- WORAUF DIESE REGEL AUSSERDEM RUHT. Der Schutz setzt voraus, dass DELETE auf public.messages und public.profiles für
--   authenticated NICHT vergeben ist (gemessen auf der Produktionsdatenbank am 18.11.2026; Herkunft:
--   supabase/migrations/20261117150000_tabellenrechte_zurueck.sql, Zeile 165-168, und
--   supabase/migrations/20261117140000_profiles_grants_zurueck.sql, Zeile 39-40). Ein späteres "grant delete on
--   public.messages to authenticated" (oder auf profiles) öffnet den Weg über die Kaskade, und keine Regel in dieser
--   Datei sieht das. Der Test prüft es in tests/sperre_anhang_zeile.sql, Block h (h2, h3).
--
-- Ausführen im Supabase SQL Editor als postgres. Läuft als Transaktion. Darf mehrfach laufen.
--
-- NACHMESSEN nach dem Einspielen. Erwartet: genau eine Zeile, RESTRICTIVE, DELETE, {authenticated}. Fehlt sie, ist die
--   Migration nicht gelandet.
--     select policyname, permissive, cmd, roles from pg_policies
--      where schemaname = 'public' and tablename = 'message_attachments'
--        and policyname = 'Sperre: nichts loeschen';

begin;

-- Blockierwartezeit wie in 20261118270000. Die Regel nimmt eine Sperre auf public.message_attachments.
set local lock_timeout = '3s';

-- Sicherheitsnetz: ohne me_banned() und message_attachments ist diese Migration nicht anwendbar.
do $$ begin
  if to_regprocedure('public.me_banned()') is null then
    raise exception 'public.me_banned() fehlt. Sie stammt aus 20261109120000_security_hardening.sql.';
  end if;
  if to_regclass('public.message_attachments') is null then
    raise exception 'public.message_attachments fehlt. Sie stammt aus 20261028140000_message_features.sql.';
  end if;
end $$;

-- Eine beschränkende Regel für DELETE, nach dem Muster der anderen Sperrregeln.
-- KEINE Ausnahme für Eimer oder Kontolöschung (siehe Kopf): Die Kontolöschung läuft als Definer mit BYPASSRLS
-- (postgres) und wird von dieser Regel nicht getroffen. Diese Tabelle ist nicht Teil des Löschwegs des Kontos.
drop policy if exists "Sperre: nichts loeschen" on public.message_attachments;
create policy "Sperre: nichts loeschen" on public.message_attachments
  as restrictive for delete to authenticated
  using (not (select public.me_banned()));

commit;
