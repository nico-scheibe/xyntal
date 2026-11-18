-- Schließt drei weitere Wege, auf denen die Altersgrenze 16 nicht greift. Eine Sicherheitsprüfung
-- hat sie nach 20261118120000_altersgrenze_schliessen.sql gefunden, alle drei an der Live-Datenbank
-- bestätigt. Ein als unter 16 erkanntes Konto soll weder Nachrichten erhalten oder lesen, noch
-- eigene Inhalte weiter ändern, und ein ehrlich angegebenes Geburtsdatum darf nicht verloren gehen.
--
-- Weg 1: Nachrichten erreichen ein unter-16-Konto weiter. Die Sendepolicy prüfte beim Empfänger nur
--   status <> 'rejected'. 'pending' ist aber genau der Zustand, in den 20261118120000 ein solches
--   Konto setzt. Die Lesepolicy prüfte nur sender_id/recipient_id, kein Alter.
-- Weg 2: Eigene Inhalte bleiben änderbar. Alle UPDATE-Policies auf Beiträgen, Kommentaren, Börse,
--   Projekten und Projektrollen prüfen nur auth.uid(). is_approved_member() steckt nur in den
--   INSERT- und SELECT-Regeln. Belegt: Ein neuer Beitrag wurde abgewiesen, aber
--   update public.posts set body = ... where author_id = <eigene Id> ergab UPDATE 1.
-- Weg 3: Bei der Anmeldung wird ein ehrlich angegebenes Geburtsdatum unter 16 verworfen statt
--   gespeichert, und danach aus raw_user_meta_data gelöscht. Dieselbe Verwerfung steckt in
--   set_my_birthdate(). Wer sein echtes Datum angibt und abgewiesen wird, konnte anschließend ein
--   falsches eintragen. Es wurde angenommen, weil noch keine Zeile in member_birthdates stand.
--   Das System kannte die Wahrheit und hat sie weggeworfen.
--
-- Grundlage: 20261118120000_altersgrenze_schliessen.sql (und darüber 20261117120000_age_ok_known_birthdate.sql
--   sowie die Migrationen vom 13.11.). Diese Datei setzt sie voraus.
-- Läuft als Transaktion. Darf mehrfach laufen. Einmal im Supabase SQL Editor ausführen.
begin;
-- Sicherheitsnetz (siehe 20261118180000_altersgrenze_sperrliste.sql): Diese Datei setzt handle_new_user()
--   ohne die Sperrliste neu. Liefe sie nach der Sperrlisten-Migration erneut, verschwände der Schutz ohne
--   Fehlermeldung. Deshalb bricht sie dann ab. Auf der Produktionsdatenbank ändert das nichts: Die Datei ist
--   dort bereits eingespielt, das Netz greift nur bei einem erneuten Lauf.
do $$ begin
  if to_regclass('public.age_blocks') is not null then
    raise exception 'Diese Datei ist aelter als 20261118180000_altersgrenze_sperrliste.sql und wuerde handle_new_user() ohne die Sperrliste neu setzen. Erst die Sperrlisten-Migration erneut einspielen oder diese Datei auslassen.';
  end if;
end $$;

-- ---------- 1) Eigene Altersprüfung, aufrufbar aus einer Policy ----------
-- age_ok(uuid) darf anon und authenticated nicht gegeben werden. Damit könnte jeder zu jeder
--   fremden Konto-Id abfragen, ob das Konto unter 16 ist. age_ok_me() nimmt kein Argument und
--   beantwortet nur die eigene Lage (auth.uid()). Deshalb ist das Ausführungsrecht hier
--   unbedenklich. Genau so wie me_banned() in 20261109120000_security_hardening.sql.
create or replace function public.age_ok_me()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.age_ok(auth.uid());
$$;
revoke execute on function public.age_ok_me() from public, anon;
grant execute on function public.age_ok_me() to authenticated;

-- ---------- 2) Weg 2: eigene Inhalte nicht mehr anlegen oder ändern, wenn das Alter nicht passt ----------
-- Vorbild ist der Bann-Block in 20261109120000_security_hardening.sql. Die Liste der Tabellen ist
--   dieselbe, 13 Stück. Gegen die Live-Datenbank geprüft: Der Bann-Block sitzt genau auf diesen 13.
-- Die Regeln sind RESTRICTIVE, sie schränken also die bestehenden Regeln nur zusätzlich ein.
--   Sie sind mit "to authenticated" gebunden. Das darf nicht fehlen: Eine restriktive Policy
--   ohne Rollenangabe gilt für alle Rollen und würde auch anon treffen. Bei event_signups wäre
--   damit die Anmeldung zum Treffen für Unangemeldete tot.
-- Das LESEN wird hier absichtlich NICHT eingeschränkt. Sonst käme ein Konto nicht mehr an seine
--   eigenen Inhalte heran. Die SELECT-Regeln hängen ohnehin schon an is_approved_member() bzw.
--   is_active_member().
do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'post_likes', 'post_comment_reactions', 'listings',
                           'listing_likes', 'messages', 'message_reactions', 'projects', 'project_roles',
                           'project_interest', 'event_rsvps', 'event_signups'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "Altersgrenze: nichts anlegen" on public.%I', t);
      execute format('create policy "Altersgrenze: nichts anlegen" on public.%I as restrictive for insert to authenticated with check ((select public.age_ok_me()))', t);
      execute format('drop policy if exists "Altersgrenze: nichts ändern" on public.%I', t);
      execute format('create policy "Altersgrenze: nichts ändern" on public.%I as restrictive for update to authenticated using ((select public.age_ok_me())) with check ((select public.age_ok_me()))', t);
    end if;
  end loop;
end $$;

-- ---------- 3) Weg 1a: nicht mehr an Konten schreiben, die nicht freigeschaltet sind ----------
-- Grundlage: "Nachrichten senden" aus 20261028160000_fix_messages_insert_policy.sql. Neu ist allein
--   status = 'approved' statt status <> 'rejected' bei der Empfängerprüfung.
-- Ein als unter 16 erkanntes Konto steht auf 'pending', nie auf 'approved'. profile_review_problem()
--   liefert dafür den Grund 'birthdate'. Über status = 'approved' greift die Altersgrenze also auch
--   beim Empfänger, ohne dass age_ok() nach außen gegeben werden muss.
-- Beabsichtigte Nebenwirkung: Ein Profil, das noch in Prüfung ist, kann nicht mehr angeschrieben
--   werden. Es steht seit 20261118120000 ohnehin nicht mehr in der Mitgliederliste.
drop policy if exists "Nachrichten senden" on public.messages;
create policy "Nachrichten senden" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and (select public.is_active_member())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.status = 'approved')
  );

-- ---------- 4) Weg 1b: ein Konto unter 16 liest keine Nachrichten mehr ----------
-- Grundlage: "Eigene Nachrichten lesen" aus 003_community.sql. Neu ist allein die Altersbedingung.
-- Warum age_ok_me() und NICHT is_active_member(): is_active_member() prüft zusätzlich die bestätigte
--   E-Mail, den Bann und not beta_application_required(). Würde das Lesen daran hängen, sperrte ein
--   Umschalten des Beta-Modus alle Mitglieder aus ihrem eigenen Postfach aus. Ein gesperrtes Konto
--   käme nicht mehr an seine Nachrichtenhistorie. Gefragt ist hier allein das Alter.
drop policy if exists "Eigene Nachrichten lesen" on public.messages;
create policy "Eigene Nachrichten lesen" on public.messages
  for select to authenticated
  using ((sender_id = (select auth.uid()) or recipient_id = (select auth.uid()))
         and (select public.age_ok_me()));

-- ---------- 5) Weg 3: ein bekanntes Geburtsdatum wird nie mehr verworfen ----------
-- 5a) Anmeldung. Grundlage: handle_new_user() aus 20261113120000_signup_birthdate.sql, die neueste
--   Fassung. Geändert ist genau eine Bedingung. Der Rumpf bleibt wie er ist.
--   Nicht aus schema.sql übernehmen: dort trägt der Trigger die E-Mail noch ohne bestätigte
--   Einwilligung in public.newsletter ein, was 007 bewusst abgeschafft hat. Und der Name kommt auch
--   aus "full_name", wie Apple, Google und LinkedIn ihn liefern. Beides muss erhalten bleiben.
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
  if bd is not null then
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

-- 5b) Nachträgliche Eingabe im Profil. Grundlage: set_my_birthdate() aus 20261113120000_signup_birthdate.sql.
--   Zwei Änderungen: Die Ausnahme für ein Datum unter 16 fällt weg, das Datum wird festgehalten.
--
-- Diese Stelle sieht falsch aus und ist es nicht. Die Ausnahme „Xyntal ist ab 16 Jahren" kann hier
--   nicht stehen bleiben. Eine Ausnahme rollt die Transaktion zurück, und damit auch das insert. Das
--   Datum wäre wieder verworfen, und genau das ist die Lücke. Deshalb wird jedes gültige Datum
--   eingetragen, und die Funktion kehrt normal zurück. Das Profil bleibt danach auf 'pending', weil
--   profile_review_problem() den Grund 'birthdate' liefert. Ein zweiter Versuch mit einem anderen
--   Datum scheitert am Primärschlüssel.
--
-- Noch nicht gelöst, bewusst nicht in dieser Migration: Die Profilseite (public/pages/profil.js,
--   REVIEW_HINTS.birthdate) zeigt danach weiter das Eintragen-Formular mit dem Hinweis „Xyntal ist
--   ab 16 Jahren", statt in einem Satz zu sagen, dass das eingetragene Datum die Grenze nicht
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
end;
$$;
revoke execute on function public.set_my_birthdate(text) from public, anon;
grant execute on function public.set_my_birthdate(text) to authenticated;

commit;
