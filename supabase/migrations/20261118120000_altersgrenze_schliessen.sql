-- Schließt zwei Lücken bei der Altersgrenze 16. Ein Konto, dessen hinterlegtes Geburtsdatum
-- unter 16 liegt, soll weder schreiben noch über sein Profil gefunden werden.
--
-- TÜR 1: is_approved_member() prüfte nur den Status und die Sperre, nicht das Alter. Diese
--   Funktion steckt in fast allen Community-Regeln (Beiträge, Kommentare, Likes, Nachrichten,
--   Projekte, Veranstaltungs-Anmeldungen). Ein unter-16-Konto mit freigeschaltetem Profil konnte
--   dort weiter schreiben. Die Karte war schon ausgeblendet, das Schreiben nicht.
--
-- TÜR 2: Das Profil eines unter-16-Kontos blieb lesbar. Die Lesepolicy für angemeldete Mitglieder
--   ließ jede Zeile außer 'rejected' zu, also auch 'pending'. Außerdem wirkte eine Berichtigung
--   des Geburtsdatums durch den Admin in admin_set_birthdate() nicht auf das Profil selbst, nur
--   auf die Karte.
--
-- Die Migration setzt die Migrationen vom 13.11. und die Altersregel vom 17.11.
--   (20261117120000_age_ok_known_birthdate.sql) voraus. Block 1 prüft das und bricht sonst ab.
-- Läuft als Transaktion. Darf mehrfach laufen.
--
-- Heute sperrt diese Migration kein Konto aus: Alle 16 Profile sind 'approved', haben kein
--   hinterlegtes Geburtsdatum und sind vor dem Stichtag (2026-11-17 11:00:22+00) angelegt. Für
--   sie ist age_ok() wahr. Ausgesperrt wird nur, wessen hinterlegtes Datum unter 16 liegt.
begin;

-- ---------- 1) Sicherheitsnetz ----------
-- age_ok() greift auf member_birthdates und age_check_start() zu. Beides legen die Migrationen
-- vom 13.11. an, die Altersregel selbst die vom 17.11. Fehlt eine davon, hätte diese Datei
-- keine Grundlage. Dann lieber sofort mit klarer Meldung abbrechen.
do $$ begin
  if to_regprocedure('public.age_ok(uuid)') is null then
    raise exception 'Erst die Migrationen vom 13.11. und 17.11. einspielen (20261113120000, 20261113130000, 20261113140000, 20261117120000), dann diese Migration.';
  end if;
end $$;

-- ---------- 2) Tür 1: Schreiben nur für Konten ab 16 ----------
-- Grundlage: is_approved_member() aus 20261109120000_security_hardening.sql. Neu ist allein die
-- Prüfung public.age_ok(id).
--
-- Warum das geht: Die Funktion ist security definer und gehört der Rolle postgres. Der Aufruf
--   von age_ok() läuft daher mit postgres-Rechten, auch wenn anon und authenticated das
--   Ausführungsrecht auf age_ok() entzogen ist. Eine Prüfung direkt in einer Policy wäre dagegen
--   nicht möglich: Policy-Ausdrücke laufen mit den Rechten des Fragenden. Dafür müsste age_ok()
--   an anon gegeben werden, und dann könnte jeder zu jeder Konto-Id abfragen, ob sie unter 16 ist.
--
-- Die Rechte auf is_approved_member() bleiben unverändert (anon, authenticated, service_role).
--   create or replace lässt sie stehen; es gibt hier bewusst kein grant und kein revoke.
create or replace function public.is_approved_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and status = 'approved'
                    and not public.ban_active(banned, banned_until)
                    and public.age_ok(id));
$$;

-- ---------- 3) Tür 2a: Mitglieder sehen nur freigeschaltete Profile ----------
-- Grundlage: "Profile lesen (angemeldet)" aus 20261103180000_website_ban.sql. Neu ist allein
--   status = 'approved' statt status <> 'rejected'.
-- Ohne diese Änderung würde ein Profil, das wegen eines unter-16-Datums auf 'pending' zurückgesetzt
--   ist, von jedem Mitglied weiter gelesen werden. 'pending' schließt nur die erste Lesepolicy,
--   nicht diese. Die erste Policy verlangt 'approved' ohnehin, beide sind jetzt gleich streng.
-- Beabsichtigte Nebenwirkung: Ein Profil in Prüfung erscheint Mitgliedern nicht mehr.
-- Heute betrifft das null Zeilen; kein Profil steht auf 'pending'.
drop policy if exists "Profile lesen (angemeldet)" on public.profiles;
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (not public.ban_active(banned, banned_until) and status = 'approved'
         and (select public.is_active_member()));

-- ---------- 4) Tür 2b: Berichtigung durch den Admin wirkt auch auf das Profil ----------
-- Grundlage: admin_set_birthdate() aus 20261113140000_age_gate_publishing.sql. Neu ist allein der
--   Schritt nach dem raise log: Trägt das berichtigte Datum das Konto nicht mehr, wird das Profil
--   auf 'pending' gesetzt und ausgeblendet.
create or replace function public.admin_set_birthdate(p_id uuid, p_birthdate text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b date := public.birthdate_from_text(p_birthdate);
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if b is null then raise exception 'Bitte gib ein gültiges Geburtsdatum an (JJJJ-MM-TT).'; end if;
  if b > current_date then raise exception 'Das Geburtsdatum liegt in der Zukunft.'; end if;
  insert into public.member_birthdates (id, birthdate) values (p_id, b)
    on conflict (id) do update set birthdate = excluded.birthdate, set_at = now();
  -- Absichtlich OHNE die Datumswerte: das Postgres-Log ist unverschlüsselt, langlebig und wird
  -- beim Löschen eines Kontos nicht mitgelöscht. Dass berichtigt wurde, genügt; worauf, steht
  -- in member_birthdates.
  raise log 'admin_set_birthdate: Geburtsdatum von % berichtigt durch %', p_id, auth.uid();
  -- Wartet das Profil nur noch auf das Datum, wird es jetzt geprüft.
  update public.profiles set status = status where id = p_id and status = 'pending';
  -- Trägt das berichtigte Datum das Konto nicht mehr, verliert das Profil Freischaltung und
  -- Sichtbarkeit: 'pending' schließt die Lesepolicy für anon, is_public = false zusätzlich den
  -- Weg über is_public, und profile_review_problem() hält es auf 'pending', weil es den Grund
  -- 'birthdate' zurückgibt. Heilt von selbst: am 16. Geburtstag wird der Grund wahr, und die
  -- Automatik schaltet beim nächsten Speichern frei.
  if not public.age_ok(p_id) then
    update public.profiles set status = 'pending', is_public = false
     where id = p_id and status <> 'pending';
  end if;
  -- Karte sofort ausblenden, wenn das berichtigte Datum sie nicht mehr trägt.
  -- Bewusst nur in diese Richtung: Ein allgemeiner Anstoß würde auch eine Karte wieder
  -- sichtbar machen, die ein Admin aus Moderationsgründen ausgeblendet hat (die Ausnahme
  -- im Trigger greift nur bei old.is_public). Nach oben berichtigt wird die Karte beim
  -- nächsten Speichern durch das Mitglied selbst wieder öffentlich.
  update public.waitlist_cards set is_public = false
   where user_id = p_id and is_public and not public.age_ok(p_id);
end;
$$;
revoke execute on function public.admin_set_birthdate(uuid, text) from public, anon;
grant execute on function public.admin_set_birthdate(uuid, text) to authenticated;

-- ---------- 5) Nachzug für den Bestand ----------
-- Nur in Richtung "zu". Ein Anstoß in beide Richtungen würde ein Profil wieder freischalten,
--   das ein Admin aus Moderationsgründen zurückgestuft hat. Die Richtung "auf" ist deshalb
--   bewusst nicht enthalten.
-- Heute trifft das null Zeilen (nachgemessen). Der Schritt greift nur, wenn vor dieser Datei
--   ein unter-16-Datum nachgetragen wurde.
update public.profiles set status = 'pending', is_public = false
 where status = 'approved' and not public.age_ok(id);

commit;
