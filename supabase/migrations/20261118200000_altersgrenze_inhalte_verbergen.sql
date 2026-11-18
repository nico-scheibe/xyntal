-- Verbirgt Beiträge, Börsen-Einträge und Projekte eines als unter 16 erkannten Kontos – vor GÄSTEN und
--   vor MITGLIEDERN. Admins sehen sie weiter.
--
-- DIE LÜCKE: Die Leseregeln "Beiträge lesen", "Börse lesen" und "Projekte lesen" (003_community.sql,
--   009_projects.sql, 018_open_projects_messages.sql) prüfen für Mitglieder den BETRACHTER
--   (is_approved_member() bzw. is_active_member()), nicht den Autor. Ein Mitglied über 16 liest deshalb jeden
--   Inhalt eines erkannten Kontos unter 16, auch wenn is_public = false ist, samt author_id und owner_id.
--
-- DIE LÖSUNG: Eine Spalte author_age_ok je Inhaltstabelle, die in den drei Leseregeln als zusätzliche
--   Bedingung steht. Gewählt wird eine SPALTE und keine Funktion in der Leseregel. Eine Funktion, die zu einer
--   fremden Konto-Kennung das Alter beantwortet, wäre ein Orakel über das Alter jedes Kontos. age_ok(uuid) bleibt
--   deshalb ohne Ausführungsrecht für anon und authenticated (20261118140000). Die Leseregel liest hier nur eine
--   Spalte der Zeile selbst.
--
-- WARUM NICHT is_public: is_public wird von dieser Datei NICHT angefasst. Eine frühere Fassung hat is_public
--   per update offline gezogen. Auf posts sitzt der Trigger enforce_post_edit_window (20261028220000). Er wirft
--   bei jeder Änderung von is_public, wenn der Aufrufer nicht der Autor ist oder der Beitrag älter als 30 Minuten
--   ist. Trigger feuern auch bei SECURITY DEFINER. Ein is_public-Update aus den Geburtsdatums-Funktionen hätte
--   diese Funktionen also zum Scheitern gebracht: ein Mitglied hätte sein Datum nicht mehr eintragen können, ein
--   Admin es nie berichtigen. Auf der Produktionsdatenbank gemessen. Der Trigger prüft die neue Spalte nicht.
--   Außerdem gehört is_public dem Mitglied. Die Ausblendung durch einen Admin (is_public = false) bleibt wirksam,
--   und nichts in dieser Datei macht sie wieder sichtbar.
--
-- Zur Spalte author_age_ok (je Tabelle):
--   Standardwert true. Anlegen setzt is_approved_member() bzw. is_active_member() voraus, und beide enthalten
--   age_ok(id) (20261118120000 bzw. 20261113140000). Wer anlegen darf, ist also über 16. Die Lücke entsteht nur,
--   wenn ein Konto später unter 16 wird. Das fängt der Nachtrag in Block 4 und fangen die Funktionen in Block 3 auf.
--   Ein Schreibweg ohne Altersprüfung würde den Standardwert true ungeprüft setzen. Im Migrationsbestand wurde
--   kein solcher Weg gefunden.
--   KEIN RECHT für anon und authenticated: Diese Datei erteilt AUSDRÜCKLICH KEIN Recht auf author_age_ok. anon und
--   authenticated haben auf posts, listings und projects nur SPALTENWEISE Rechte (20261117150000). Die neue Spalte
--   steht in keiner dieser Listen, also können beide sie nicht setzen. Lesbar ist sie über das Tabellen-SELECT. Das ist
--   unkritisch, weil die Leseregel eine Zeile mit false für alle außer Admins ausblendet.
--   DER DIENSTSCHLÜSSEL (service_role) KANN SIE SETZEN: Er hat auf den drei Tabellen INSERT und UPDATE auf
--   Tabellenebene aus den Supabase-Standardrechten. Eine neue Spalte erbt die Tabellenrechte, also auch diese. Gemessen
--   auf der Produktionsdatenbank. Das ist ohne Belang, weil service_role die Zeilenschutzregeln ohnehin umgeht. Die
--   Spalte ist daher keine zusätzliche Hürde gegen einen abgeflossenen Dienstschlüssel. Das behauptet dieser Kommentar nicht.
--
-- BEWUSSTE FOLGE, KEIN FEHLER: Ein zurückgehaltenes Konto (author_age_ok = false) sieht seine EIGENEN Inhalte
--   nicht. Bei projects gilt das für den Zweig owner_id = auth.uid() ebenso, weil die Bedingung alle Zweige
--   außer dem Admin-Zweig umschließt (siehe Block 2). Das ist beabsichtigt und soll nicht als Fehler "repariert"
--   werden. Eine Regel, in der nur ein Zweig ungeschützt bleibt, ist die Stelle, an der später Fehler sitzen.
--   Die Folge ist nicht endgültig: author_age_ok wird in beide Richtungen nachgezogen. Mit dem 16. Geburtstag
--   oder nach einer Berichtigung durch einen Admin wird die Spalte wieder true. Die Zeilen bleiben vollständig in
--   der Datenbank, nichts wird gelöscht.
--
-- BERICHTIGUNG NACH OBEN: Die Leseregel prüft author_age_ok, nicht is_public. Nach einer Berichtigung nach oben
--   wird author_age_ok wieder true. Mitglieder und Gäste lesen die Inhalte dann sofort wieder, sofern is_public
--   gesetzt ist. Ein Inhalt, den ein Admin ausgeblendet hat (is_public = false), bleibt ausgeblendet, weil
--   is_public nie verändert wird.
--
-- ADMIN-ZWEIG AUSSEN, EIGENTÜMER-ZWEIG INNEN: Der is_admin()-Zweig steht NACH der Klammer, also ungeschützt.
--   Grund: Ein Admin muss zurückgehaltene Inhalte sehen können, für die Moderation und für eine Auskunft nach
--   Art. 15 DSGVO. Würde der Admin-Zweig in die Klammer gezogen, sähe der Admin die Inhalte eines zurückgehaltenen
--   Kontos nicht mehr.
--   Der Eigentümer-Zweig bei projects (owner_id = auth.uid()) steht dagegen INNEN, also mitgeschützt. Grund: Die
--   Entscheidung ist so getroffen. Ein zurückgehaltenes Konto sieht seine eigenen Inhalte nicht. Eine Regel, in der
--   nur ein Zweig ungeschützt bleibt, ist die Stelle, an der später Fehler sitzen. Zwei der drei Tabellen haben
--   ohnehin keinen Eigentümer-Zweig, eine Ausnahme nur bei projects wäre eine Ungleichbehandlung ohne Grund.
--
-- SICHERHEITSNETZ UND REIHENFOLGE: Diese Datei setzt voraus: age_ok(uuid) aus 20261117120000, is_approved_member()
--   aus 20261118120000, is_active_member() aus 20261113140000, die drei Inhaltstabellen, und die Geburtsdatums-
--   Funktionen aus 20261118160000. Außerdem die Sperrliste aus 20261118180000 (Tabelle age_blocks). Sie ist die
--   jüngste Fassung beider Geburtsdatums-Funktionen. handle_new_user() und die beiden Löschwege werden hier NICHT
--   angefasst, sie kommen aus 20261118180000.
--
-- Läuft als Transaktion. Darf mehrfach laufen. Einmal im Supabase SQL Editor ausführen, nach 20261118180000.
begin;

-- ---------- 1) Sicherheitsnetz ----------
-- Fehlt eines der Vorgänger-Objekte, bricht die Migration ab, statt auf einer falschen Grundlage zu laufen.
do $$ begin
  if to_regprocedure('public.age_ok(uuid)') is null
     or to_regprocedure('public.is_approved_member()') is null
     or to_regprocedure('public.is_active_member()') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.listings') is null
     or to_regclass('public.projects') is null
     or to_regclass('public.age_blocks') is null
     or to_regprocedure('public.set_my_birthdate(text)') is null
     or to_regprocedure('public.admin_set_birthdate(uuid, text)') is null then
    raise exception 'Erst die Altersgrenze-Migrationen einspielen (bis 20261118180000 einschließlich), dann diese Migration.';
  end if;
end $$;

-- ---------- Block 1: die Spalte ----------
-- Standardwert true, siehe Kopf. KEIN Recht auf die Spalte für authenticated oder anon (siehe Kopf).
alter table public.posts    add column if not exists author_age_ok boolean not null default true;
alter table public.listings add column if not exists author_age_ok boolean not null default true;
alter table public.projects add column if not exists author_age_ok boolean not null default true;

-- ---------- Block 2: die drei Leseregeln ----------
-- Die laufenden Bedingungen (aus pg_policies gemessen): PERMISSIVE, Rollen anon und authenticated, Befehl SELECT.
--   Deshalb "for select to anon, authenticated" ausdrücklich. Ohne "to" gölte die Regel für jede Rolle.
--   Die Namen sind genau die laufenden, damit das drop policy if exists trifft.
-- Die Klammern sind Pflicht. Ohne sie bindet "and" stärker als "or", und die Admin-Klausel würde mit
--   umschlossen. Der Admin-Zweig steht deshalb AUSSEN, siehe Kopf: Ein Admin muss zurückgehaltene Inhalte sehen.
drop policy if exists "Beiträge lesen" on public.posts;
create policy "Beiträge lesen" on public.posts
  for select to anon, authenticated
  using (((is_public or (select public.is_approved_member())) and author_age_ok) or (select public.is_admin()));

drop policy if exists "Börse lesen" on public.listings;
create policy "Börse lesen" on public.listings
  for select to anon, authenticated
  using (((is_public or (select public.is_approved_member())) and author_age_ok) or (select public.is_admin()));

-- projects: Der Eigentümer-Zweig bleibt innerhalb der Klammer (siehe Kopf).
drop policy if exists "Projekte lesen" on public.projects;
create policy "Projekte lesen" on public.projects
  for select to anon, authenticated
  using (((is_public or owner_id = (select auth.uid()) or (select public.is_active_member())) and author_age_ok)
         or (select public.is_admin()));

-- ---------- Block 3: die beiden Geburtsdatums-Funktionen, jüngste Fassung ----------
-- Grundlage: set_my_birthdate() und admin_set_birthdate() aus 20261118160000_altersgrenze_nachbesserung.sql,
--   zeichengleich übernommen. Die is_public-Updates aus einer früheren Fassung sind bewusst NICHT dabei (siehe Kopf).
-- Neu ist allein der bedingungslose Abgleich von author_age_ok in BEIDE Richtungen. Er steht direkt nach dem
--   Eintragen des Datums, vor dem if-Block. Der Abgleich gilt in beide Richtungen, weil author_age_ok eine TATSACHE
--   spiegelt (das Alter des Urhebers). Berichtigt ein Admin ein falsches Datum nach oben, muss der Urheber wieder
--   lesbar sein. Sonst blieben Inhalte nach einer Berichtigung nach oben für immer unsichtbar.
-- "is distinct from" verhindert, dass jeder Aufruf alle Zeilen neu schreibt.
create or replace function public.set_my_birthdate(p_birthdate text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  b date := public.birthdate_from_text(p_birthdate);
begin
  if uid is null then raise exception 'Bitte melde dich an.'; end if;
  if b is null then raise exception 'Bitte gib ein gültiges Geburtsdatum an.'; end if;
  if b > current_date then raise exception 'Das Geburtsdatum liegt in der Zukunft.'; end if;
  -- Einmal gesetzt, bleibt es: ein zweiter Versuch scheitert am Primärschlüssel.
  insert into public.member_birthdates (id, birthdate) values (uid, b) on conflict (id) do nothing;
  if not found then
    raise exception 'Dein Geburtsdatum ist schon eingetragen und lässt sich nicht mehr ändern.';
  end if;
  -- Wartete das Profil nur noch auf das Datum, wird es jetzt freigeschaltet.
  update public.profiles set status = status where id = uid and status = 'pending';
  -- author_age_ok in BEIDE Richtungen nachziehen, bedingungslos (siehe Kopf, Block 3).
  update public.posts    set author_age_ok = public.age_ok(uid) where author_id = uid and author_age_ok is distinct from public.age_ok(uid);
  update public.listings set author_age_ok = public.age_ok(uid) where author_id = uid and author_age_ok is distinct from public.age_ok(uid);
  update public.projects set author_age_ok = public.age_ok(uid) where owner_id  = uid and author_age_ok is distinct from public.age_ok(uid);
  -- Trägt das eingetragene Datum das Konto nicht, verliert das Profil Freischaltung und
  -- Sichtbarkeit, und die Karte geht offline. Dasselbe tut admin_set_birthdate(); dass es hier
  -- fehlte, war die Lücke: Schreiben war zu, das Profil stand weiter im Netz.
  -- Die Karte wird hier bedingungslos ausgeblendet, sobald age_ok nicht trägt. Anders als in
  -- admin_set_birthdate() braucht es die Prüfung „and not public.age_ok(...)“ in der where-Zeile
  -- nicht mehr, weil das if sie schon stellt. Und nur in diese Richtung: Ein Anstoß in beide
  -- Richtungen würde eine Karte wieder sichtbar machen, die ein Admin aus Moderationsgründen ausgeblendet hat.
  -- Nur ein freigeschaltetes Profil wird heruntergestuft. Ein abgelehntes Profil ist schon dichter als
  -- ein wartendes (is_active_member() schließt es aus) und darf durch ein Geburtsdatum nicht angehoben
  -- werden. Mit „status <> 'pending'“ hätte dieser Block genau das getan.
  if not public.age_ok(uid) then
    update public.profiles set status = 'pending', is_public = false
     where id = uid and status = 'approved';
    update public.waitlist_cards set is_public = false
     where user_id = uid and is_public;
  end if;
end;
$$;

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
  -- author_age_ok in BEIDE Richtungen nachziehen, bedingungslos (siehe Kopf, Block 3). Nach oben berichtigt
  --   wird die Spalte wieder true. Sonst könnte die Person wieder veröffentlichen, ihre Inhalte blieben aber
  --   für Mitglieder unsichtbar.
  update public.posts    set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.listings set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.projects set author_age_ok = public.age_ok(p_id) where owner_id  = p_id and author_age_ok is distinct from public.age_ok(p_id);
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
  -- Nur ein freigeschaltetes Profil wird heruntergestuft. Ein abgelehntes bleibt abgelehnt.
  if not public.age_ok(p_id) then
    update public.profiles set status = 'pending', is_public = false
     where id = p_id and status = 'approved';
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

-- ---------- Block 4: Nachtrag für den Bestand, idempotent, in BEIDE Richtungen ----------
-- Spiegelt die Tatsache author_age_ok = age_ok(Urheber) für alle Zeilen. Ein zweiter Lauf findet nichts mehr,
--   solange sich an age_ok nichts geändert hat. is_public wird hier NICHT angefasst.
-- Nachtrag für Bestandskonten mit Datum unter 16 und für Konten nach dem Stichtag ohne Datum: für beide ist
--   age_ok falsch, und ihre Inhalte werden zurückgehalten. Konten vor dem Stichtag ohne Datum (Bestandsschutz)
--   bleiben true und unberührt.
update public.posts    set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
update public.listings set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
update public.projects set author_age_ok = public.age_ok(owner_id)  where author_age_ok is distinct from public.age_ok(owner_id);

-- ---------- Block 5: Ausführungsrechte der neuen Fassungen, ausdrücklich ----------
-- Die Rechte werden nicht dem create or replace überlassen. Sie werden hier für beide Funktionen gesetzt:
--   Entzogen von public, anon und service_role, erteilt an authenticated. service_role gehört dazu, siehe Block 6.
revoke execute on function public.set_my_birthdate(text) from public, anon, service_role;
grant execute on function public.set_my_birthdate(text) to authenticated;
revoke execute on function public.admin_set_birthdate(uuid, text) from public, anon, service_role;
grant execute on function public.admin_set_birthdate(uuid, text) to authenticated;

-- ---------- Block 6: Der Dienstschlüssel bekommt kein Orakel über das Alter ----------
-- Unverändert aus der Vorfassung dieser Datei (20261118200000_altersgrenze_inhalte_offline.sql): age_ok(uuid) verrät zu jeder fremden Konto-Kennung das Alter. Für
--   anon und authenticated war das Recht schon entzogen. Für den Dienstschlüssel nicht: Die Standardrechte geben
--   service_role EXECUTE auf neue Funktionen in public. Damit war der Rechteentzug auf member_birthdates aus
--   20261118180000 umgehbar. service_role darf die Tabelle nicht lesen, age_ok() liefert aber dasselbe Ergebnis
--   mit einem einzigen Aufruf. Der Entzug hier schließt das.
-- set_my_birthdate(text) und admin_set_birthdate(uuid, text) bekommen denselben Entzug. Ihr Aufruf wäre der zweite
--   Weg zu einer Altersaussage. Geprüft: Im Quellcode des App-Servers kommt keine dieser drei Funktionen vor. In der
--   Website ruft nur public/pages/profil.js und public/pages/profil-matching.js set_my_birthdate auf, beide als
--   angemeldetes Mitglied. age_ok und admin_set_birthdate haben keinen Aufrufer.
revoke execute on function public.age_ok(uuid) from service_role;
revoke execute on function public.set_my_birthdate(text) from service_role;
revoke execute on function public.admin_set_birthdate(uuid, text) from service_role;

commit;
