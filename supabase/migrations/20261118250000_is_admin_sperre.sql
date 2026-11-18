-- Sperre wirkt auf die Admin-Rechte: public.is_admin() prüft die Sperre auf derselben Profilzeile.
--   Ein gesperrter Admin verliert die Admin-Rechte an jeder Stelle, die is_admin() nennt. Eine abgelaufene Sperre
--   (banned_until in der Vergangenheit) gibt sie zurück, so wie ban_active() es vorsieht.
--   Gehört zu tests/is_admin_sperre.sql.
--
-- VORHER (laufende Fassung, aus der Produktionsdatenbank gelesen):
--   coalesce((select is_admin from public.profiles where id = auth.uid()), false) and public.mfa_ok()
--   Die Sperre wurde nicht geprüft. Ein gesperrter Admin kam durch jeden Admin-Zweig.
-- NACHHER: Admin-Kennzeichen UND nicht gesperrt (ban_active auf derselben Profilzeile) UND 2FA (mfa_ok).
--
-- WARNUNG, REICHWEITE, von mir gemessen: 47 Regeln nennen is_admin(). 40 liegen in public (3 ALL, 12 DELETE, 1 INSERT,
--   19 SELECT, 5 UPDATE), 7 in storage.objects (Profilbilder lesen und entfernen, Banner lesen und entfernen,
--   Nachrichtenanhänge entfernen, Projektbilder lesen und entfernen). Der Prüfer hat festgestellt, dass dort kein
--   Schaden entsteht: Jede dieser sieben Regeln hat die Form "eigener Ordner ODER is_admin()". Der Eigen-Zweig trägt
--   den Alltag weiter, und ein gesperrter Admin verliert nur das Lesen und Löschen FREMDER Medien.
--   17 Funktionen rufen is_admin() auf. 26 Funktionen enthalten die Zeichenkette, aber neun lesen nur die SPALTE
--   is_admin und sind nicht betroffen: keep_admin_premium, avatar_upload_allowed, design_unlocked, link_limit,
--   page_item_limit, get_member_cards, get_public_card, get_my_links, get_my_design_unlocks.
--   Das ist die ganze Admin-Oberfläche. Eine Änderung hier wirkt überall gleichzeitig.
--   Genau deshalb wurde sie nicht im Vorbeigehen gemacht.
-- KEINE SELBSTAUSSPERRUNG, von mir geprüft: admin_set_ban() verhindert zweierlei, dass man sich selbst sperrt und dass
--   ein Admin überhaupt gesperrt wird. Ein gesperrter Admin kann über die App also nicht entstehen, nur per direktem
--   SQL. Wer ihn so herstellt, kommt per SQL auch wieder heraus. Heute gibt es 1 Admin, nicht gesperrt.
--   Der Weg zurück für den heutigen einen Admin führt nur über direktes SQL: admin_set_ban() verlangt selbst is_admin(),
--   und das Entsperren eines Admins braucht einen ZWEITEN, nicht gesperrten Admin. Entsperren ist über die Oberfläche
--   möglich, Selbstentsperren nicht.
-- BEWUSST NICHT ERGÄNZT: status = 'approved' und die Altersprüfung age_ok. Beides birgt ein echtes Aussperr-Risiko.
--   Ein Admin, dessen Profil aus irgendeinem Grund in Prüfung steht, würde sonst die Admin-Rechte verlieren, ohne dass
--   jemand sie ihm zurückgeben kann. Freigegeben wurde nur die Sperre, nicht mehr. Wer das später ergänzen will,
--   braucht vorher einen Weg zurück, der nicht über direktes SQL führt.
-- NEBENWIRKUNGEN, von mir geprüft: keep_admin_premium() (20261107140000) benutzt die SPALTE is_admin und nicht die
--   Funktion, ist also nicht betroffen. protect_owned_card() (20261109120000) nimmt einem gesperrten Admin das
--   Bearbeiten fremder Karten und setzt die Änderung sanft zurück, statt einen Fehler zu werfen. Das ist die Absicht.
-- STILL, OHNE FEHLERMELDUNG: member_cards_public() (20261113140000, BEFORE INSERT OR UPDATE auf waitlist_cards) hat einen
--   eigenen Admin-Zweig zum Ausblenden einer Mitgliederkarte. Für einen gesperrten Admin fällt er weg, und die Zeile
--   darunter setzt is_public nach der Regel für Nicht-Admins. Die Karte bleibt also öffentlich, wenn sie einen Handle hat,
--   und der Aufruf meldet Erfolg. Kein Datenverlust, aber dieselbe stille Form wie bei protect_owned_card().
-- SPALTENBEZOGENE VORTEILE: Ein gesperrter Admin behält sie (mehr Links, mehr Seitenelemente, alle Designs, dauerhaft
--   Premium), weil die neun Funktionen oben nur die Spalte lesen. Erreichbar ist davon fast nichts: Ein Gesperrter darf
--   sein Profil ohnehin nicht ändern, und save_my_card bricht mit "account banned" ab.
--
-- FORM: Die Sperrprüfung steht als skalarer Unterausdruck in derselben Struktur wie die laufende Fassung, nicht als
--   exists(). Ohne Profilzeile liefert der Unterausdruck NULL, coalesce macht daraus false, und false and mfa_ok() ist
--   false. Das Admin-Kennzeichen ist NOT NULL (profiles.is_admin, default false) und ban_active() liefert nie NULL.
--   Ein NULL käme also nur aus der fehlenden Zeile, und die fängt coalesce ab, wie vorher.
--
-- AUSFÜHRUNGSRECHTE: anon, authenticated und service_role dürfen is_admin() ausführen, wie gemessen. create or replace
--   behält die Rechte. Der grant unten hält sie in der Datei fest, ohne etwas zu ändern. Produktion hat KEIN PUBLIC-Recht
--   auf is_admin() (Rechteliste: postgres, anon, authenticated, service_role), anders als mfa_ok(). Deshalb ist dort nichts
--   zu entziehen. Der Platzhalter im Test (revoke ... from public) entzieht es ausdrücklich, damit die Rechte-Zusage j1
--   überhaupt falsifizierbar ist.
--
-- Läuft als Transaktion. Darf mehrfach laufen.

begin;

-- ---------- 1) Sicherheitsnetz ----------
-- Fehlt eine der Vorgänger-Funktionen, bricht die Migration ab, statt auf einer falschen Grundlage zu laufen.
do $$ begin
  if to_regprocedure('public.ban_active(boolean,timestamptz)') is null
     or to_regprocedure('public.mfa_ok()') is null then
    raise exception 'Erst ban_active (20261103180000) und die 2FA-Prüfung mfa_ok (017_security.sql) einspielen, dann diese Migration.';
  end if;
end $$;

-- ---------- 2) is_admin(): Admin-Kennzeichen, nicht gesperrt, 2FA ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and not public.ban_active(banned, banned_until) from public.profiles where id = auth.uid()), false) and public.mfa_ok();
$$;

-- ---------- 3) Ausführungsrechte: wie gemessen (anon, authenticated, service_role) ----------
grant execute on function public.is_admin() to anon, authenticated, service_role;

commit;
