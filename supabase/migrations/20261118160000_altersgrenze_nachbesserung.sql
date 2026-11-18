-- Bessert zwei Fehler aus 20261118140000_altersgrenze_nachziehen.sql nach. Beide betreffen die
-- Altersgrenze 16. Beide sind bisher ohne Folge geblieben, weil kein Konto betroffen ist: an der
-- Live-Datenbank nachgemessen, 0 hinterlegte Geburtsdaten und 0 Zukunftsdaten.
--
-- FEHLER 1 (hoch): set_my_birthdate() hält ein Datum unter 16 seit 20261118140000 fest, zieht aber
--   Profil und Karte nicht nach. admin_set_birthdate() tut das (20261118120000). Ein freigeschaltetes
--   Mitglied, das sein echtes Datum unter 16 selbst einträgt, konnte danach nicht mehr schreiben, blieb
--   aber mit Profil, Karte und Wunsch-Link öffentlich im Netz. Der Anstoß am Ende greift nur bei
--   status = 'pending' und hat keinen Weg nach unten. Genau der Zustand, den die Altersgrenze verhindern soll.
-- FEHLER 2 (mittel): handle_new_user() übernimmt seit 20261118140000 jedes Datum, das
--   birthdate_from_text() durchlässt. Diese Funktion prüft Format und „nicht vor 1900“, aber nicht die
--   Zukunft. Ein Tippfehler wie 2027-01-01 oder 2026 statt 1996 landete unwiderruflich in
--   member_birthdates: age_ok() wird falsch, der Primärschlüssel verhindert jede Korrektur, und das
--   Konto hängt dauerhaft in Prüfung. Vorher hat die Bedingung bd <= current_date - 16 Jahre das abgefangen.
--
-- Was diese Datei tut:
--   Block 1: set_my_birthdate() zieht Profil und Karte nach, wenn das eingetragene Datum das Konto nicht trägt.
--            Ein abgelehntes Profil wird dabei nicht angehoben.
--   Block 2: admin_set_birthdate() macht dasselbe und hebt ein abgelehntes Profil ebenfalls nicht an.
--            Der Fehler stammt aus 20261118120000 und ist live.
--   Block 3: handle_new_user() speichert kein Zukunftsdatum mehr.
--   Block 4: Nachzug für den Bestand, nur in Richtung „zu“.
--
-- Grundlage: 20261118140000_altersgrenze_nachziehen.sql, und darüber 20261118120000_altersgrenze_schliessen.sql
--   sowie 20261117120000_age_ok_known_birthdate.sql. Diese Datei setzt sie voraus. Die Funktionen
--   set_my_birthdate() und handle_new_user() werden hier vollständig neu gesetzt, nicht als Fragment.
-- Läuft als Transaktion. Darf mehrfach laufen. Einmal im Supabase SQL Editor ausführen.
begin;

-- ---------- Block 1: Fehler 1 – set_my_birthdate() zieht Profil und Karte nach ----------
-- Die Fassung unten ist die aus 20261118140000_altersgrenze_nachziehen.sql, unverändert bis auf den
-- Block am Ende. Neu ist allein der if-Block nach dem letzten update.
-- Diese Stelle sieht falsch aus und ist es nicht. Die Ausnahme „Xyntal ist ab 16 Jahren“ kann hier
--   nicht stehen bleiben. Eine Ausnahme rollt die Transaktion zurück, und damit auch das insert. Das
--   Datum wäre wieder verworfen, und genau das ist die Lücke. Deshalb wird jedes gültige Datum
--   eingetragen, und die Funktion kehrt normal zurück. Das Profil bleibt danach auf 'pending', weil
--   profile_review_problem() den Grund 'birthdate' liefert. Ein zweiter Versuch mit einem anderen
--   Datum scheitert am Primärschlüssel.
--
-- Noch nicht gelöst, bewusst nicht in dieser Migration: Die Profilseite (public/pages/profil.js,
--   REVIEW_HINTS.birthdate) zeigt danach weiter das Eintragen-Formular mit dem Hinweis „Xyntal ist
--   ab 16 Jahren“, statt in einem Satz zu sagen, dass das eingetragene Datum die Grenze nicht
--   erfüllt. Das muss auf der Website nachgezogen werden.
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
  -- Trägt das eingetragene Datum das Konto nicht, verliert das Profil Freischaltung und
  -- Sichtbarkeit, und die Karte geht offline. Dasselbe tut admin_set_birthdate(); dass es hier
  -- fehlte, war die Lücke: Schreiben war zu, das Profil stand weiter im Netz.
  -- Die Karte wird hier bedingungslos ausgeblendet, sobald age_ok nicht trägt. Anders als in
  -- admin_set_birthdate() braucht es die Prüfung „and not public.age_ok(...)“ in der where-Zeile
  -- nicht mehr, weil das if sie schon stellt. Und nur in diese Richtung: Ein Anstoß in beide
  -- Richtungen würde eine Karte wieder sichtbar machen, die ein Admin aus Moderationsgründen
  -- ausgeblendet hat.
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
revoke execute on function public.set_my_birthdate(text) from public, anon;
grant execute on function public.set_my_birthdate(text) to authenticated;

-- ---------- Block 2: Berichtigung durch den Admin – dieselbe Regel wie in Block 1 ----------
-- Der Fehler stammt aus 20261118120000_altersgrenze_schliessen.sql. Er ist live: Dort stand
--   „status <> 'pending'“ im Anstoß, und eine Berichtigung auf ein Datum unter 16 hat ein abgelehntes
--   Profil auf 'pending' gesetzt. Das ist eine Lockerung, kein Schutz: 'rejected' ist der dichtere
--   Zustand, und die Ablehnung eines Admins wurde damit überschrieben. Hier wird er mitkorrigiert,
--   damit beide Wege dieselbe Regel haben. Die Fassung unten ist die aus 20261118120000, unverändert
--   bis auf die eine Bedingung. Sie wird als vollständige Funktion neu gesetzt.
-- Heute betrifft das keine Zeile. Der Fehler wirkt erst, sobald ein Admin ein Datum unter 16 einträgt.
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
revoke execute on function public.admin_set_birthdate(uuid, text) from public, anon;
grant execute on function public.admin_set_birthdate(uuid, text) to authenticated;

-- ---------- Block 3: Fehler 2 – handle_new_user() speichert kein Zukunftsdatum ----------
-- Die Fassung unten ist die aus 20261118140000_altersgrenze_nachziehen.sql, vollständig. Geändert ist
--   genau eine Bedingung: bd <= current_date statt nur bd is not null.
--   Warum das ein Block dieser Datei ist: Ein Zukunftsdatum wird seit 20261118140000 gespeichert,
--   und der Primärschlüssel verhindert jede Korrektur. Das ist der Fehler, nicht nur eine Lücke im Komfort.
-- Warum die Prüfung HIER steht und nicht in birthdate_from_text(): Dort wäre sie zwar die eine
--   Definition von „gültig“ für alle Wege. Aber admin_set_birthdate() und set_my_birthdate() prüfen
--   b > current_date schon selbst und geben dafür die klare Meldung „Das Geburtsdatum liegt in der
--   Zukunft.“. Würde birthdate_from_text() bei einem Zukunftsdatum null liefern, bekäme ein Admin
--   stattdessen „Bitte gib ein gültiges Geburtsdatum an (JJJJ-MM-TT)“ zu sehen, was nicht stimmt.
--   Deshalb bleibt die Prüfung an den drei Stellen, und handle_new_user() holt sie hier nach.
--
-- Was dadurch NICHT gelöst ist: Ein plausibles, aber falsches Datum (1990 statt 1999) lässt sich
--   weiter nicht vom Mitglied korrigieren, nur von einem Admin. Das liegt an „einmal gesetzt, bleibt
--   es“ und ist Absicht, keine Lücke.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date := public.birthdate_from_text(d->>'birthdate');
begin
  insert into public.profiles (id, name, headline, about, phase, category, offer, seek,
                               linkedin, instagram, website, is_public)
  values (
    new.id,
    left(coalesce(nullif(d->>'name', ''), nullif(d->>'full_name', ''), ''), 80),
    left(coalesce(d->>'headline', ''), 120),
    left(coalesce(d->>'about', ''), 1500),
    case when d->>'phase' in ('idee', 'nebenberuflich', 'vollzeit', 'team') then d->>'phase' end,
    left(coalesce(d->>'category', ''), 60),
    left(coalesce(d->>'offer', ''), 600),
    left(coalesce(d->>'seek', ''), 600),
    public.normalize_url(d->>'linkedin'),
    public.normalize_url(d->>'instagram'),
    public.normalize_url(d->>'website'),
    coalesce((d->>'is_public')::boolean, false)
  );

  -- Ein gültiges Datum wird jetzt immer übernommen, auch unter 16. Vorher wurde ein zu junges Datum
  -- still verworfen und anschließend aus den Metadaten gelöscht. Danach war das einzige belastbare
  -- Alterssignal weg, und die Person konnte über das Formular auf der Profilseite ein falsches Datum
  -- nachtragen, das angenommen wurde. Jetzt steht die Wahrheit in member_birthdates. Der
  -- Primärschlüssel verhindert jede Änderung, und profile_review_problem() hält das Profil mit dem
  -- Grund birthdate auf pending. Ein ungültiges Datum (nicht lesbar) wird weiter ignoriert. Daran
  -- scheitert keine Anmeldung.
  -- Zukunftsdatum: Es wird nicht gespeichert (siehe Kommentar oben bei Block 3). Ein Tippfehler wie
  -- 2027-01-01 wäre sonst unwiderruflich, weil der Primärschlüssel jede Korrektur verhindert.
  if bd is not null and bd <= current_date then
    insert into public.member_birthdates (id, birthdate) values (new.id, bd) on conflict (id) do nothing;
    update public.profiles set status = status where id = new.id and status = 'pending';
  end if;

  -- Kein Newsletter-Eintrag hier: seit 007 läuft jede Einwilligung über Brevo Double-Opt-in.

  -- Das Geburtsdatum kam als Anmelde-Metadatum herein. Supabase legt raw_user_meta_data als
  -- user_metadata in JEDES Access-Token – und das Token liegt als JS-lesbares Cookie für
  -- .xyntal.de. Das Geburtsdatum gehört nicht dorthin, es steht jetzt in member_birthdates.
  -- Deshalb hier entfernen, sobald es übernommen ist. Der Wert dort wäre ohnehin wertlos,
  -- weil Mitglieder user_metadata über auth.updateUser() selbst überschreiben können.
  -- Bewusst mit Auffangnetz: Das ist der einzige Schreibzugriff dieses Triggers auf auth.users.
  -- Fehlt dem Eigentümer der Funktion dort das Schreibrecht, würde sonst JEDE Registrierung
  -- scheitern – auch die ohne Geburtsdatum. Das Datum steht dann weiter in den Metadaten,
  -- aber niemand wird ausgesperrt. Das ist die richtige Reihenfolge der Übel.
  if d ? 'birthdate' then
    begin
      update auth.users set raw_user_meta_data = raw_user_meta_data - 'birthdate' where id = new.id;
    exception when others then null;
    end;
  end if;

  return new;
end;
$$;

-- ---------- Block 4: Nachzug für den Bestand ----------
-- Beide Anweisungen treffen heute null Zeilen (nachgemessen). Sie greifen nur, falls bis zum
--   Einspielen dieser Datei jemand ein Datum eingetragen hat, das die Altersgrenze nicht trägt.
-- Auch hier nur in Richtung „zu“: Ein Anstoß in beide Richtungen würde ein Profil wieder
--   freischalten, das ein Admin aus Moderationsgründen zurückgestuft hat.
-- Die erste Anweisung trifft absichtlich auch freigeschaltete Konten nach dem Stichtag ohne jedes
--   hinterlegte Datum. Für sie ist kein Alter nachgewiesen, und profile_review_problem() würde sie
--   ohnehin nicht freischalten. Wer so ein Konto bewusst öffentlich haben will, trägt ein Geburtsdatum
--   nach, statt den Status von Hand zu setzen.
update public.profiles set status = 'pending', is_public = false
 where status = 'approved' and not public.age_ok(id);

update public.waitlist_cards set is_public = false
 where is_public and not public.age_ok(user_id);

commit;
