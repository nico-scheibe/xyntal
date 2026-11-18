-- Zieht author_age_ok nach, wenn sich das Alter ändert, auch ohne einen Aufruf der Geburtsdatums-Funktionen.
--
-- DIE LÜCKE (auf der Produktionsdatenbank gemessen, zurückgerollt): 20261118200000 setzt author_age_ok nur in
--   set_my_birthdate() und admin_set_birthdate() neu. Am 16. Geburtstag läuft in der Datenbank nichts. Ein zweiter
--   Aufruf von set_my_birthdate() ist unmöglich (Primärschlüssel auf member_birthdates). Die Spalte blieb deshalb
--   false, und die Inhalte waren für immer verborgen, bis ein Admin das Datum berichtigt.
--
-- DIE LÖSUNG: Ein Trigger AFTER INSERT OR UPDATE auf public.profiles ruft sync_author_age_ok(id) auf. Das Speichern
--   des Profils ist der nächste Anlass, bei dem in der Datenbank überhaupt etwas geschieht. Dabei prüft
--   auto_approve_profile das Profil, und profile_review_problem() liefert den Grund "birthdate" nicht mehr
--   (20261113120000). Ist die Automatik an und der Admin hat das Profil nicht gesperrt, wird es freigeschaltet.
--   Profil und Inhalte kommen dann im selben Moment zurück. Die Datenschutzerklärung (Abschnitt zum Geburtsdatum)
--   sagt dasselbe: Die Inhalte werden mit dem 16. Geburtstag sichtbar, sobald das Profil das nächste Mal gespeichert wird.
--
-- WARUM AUF PROFILES UND WARUM AFTER: Auf public.profiles sitzen vor dieser Datei diese Trigger (gemessen in den
--   Migrationen, Stand 20261118200000):
--     BEFORE INSERT OR UPDATE  auto_approve_profile       (20261105110000, setzt status, schaltet frei)
--     BEFORE INSERT OR UPDATE  keep_admin_premium         (20261107140000, of is_admin, is_premium)
--     BEFORE UPDATE OF ...     guard_premium_media        (20261107160000)
--     BEFORE UPDATE OF ...     guard_avatar_item          (20261115120000)
--     AFTER UPDATE             notification_after_approval (20261105110000, WHEN status auf approved wechselt,
--                                                           schreibt nur in notifications)
--   Der einzige AFTER-Trigger ist notification_after_approval. Er hat eine WHEN-Bedingung und schreibt nur in
--   notifications, deshalb gibt es keine Kollision. sync_author_age_ok schreibt nur in posts, listings und projects,
--   nicht in profiles, also gibt es auch keine Rückkopplung. AFTER heißt: Das Profil ist geschrieben, bevor die Sperre
--   nachzieht, und die BEFORE-Trigger (Freischaltung, Schutz) sind vorher fertig.
--
-- Ein Fehler beim Nachziehen darf NIEMALS das Speichern eines Profils verhindern. Die Reihenfolge der Übel ist dieselbe
--   wie beim Entfernen des Metadatums in handle_new_user (20261118180000): lieber eine veraltete Spalte als ein
--   Mitglied, das sein Profil nicht speichern kann. Deshalb steht der Aufruf in begin ... exception. Mit raise log,
--   damit es nicht lautlos passiert. Die Spalte bleibt dann veraltet, und das nächste Speichern holt es nach.
--
-- ZWEI WEGE, EINE STELLE: sync_author_age_ok(p_id) ist der einzige Ort, an dem die drei Updates stehen. Der Trigger
--   und die beiden Geburtsdatums-Funktionen rufen sie auf. Die Richtung "in beide Richtungen" bleibt so an einer
--   Stelle erhalten. Eine Kopie könnte einmal nur abwärts arbeiten, und dann bliebe die Berichtigung nach oben
--   unbemerkt aus.
--
-- SICHERHEITSNETZ UND REIHENFOLGE: Diese Datei setzt 20261118200000_altersgrenze_inhalte_verbergen voraus. Sie hat die
--   Spalten author_age_ok auf posts, listings und projects, age_ok(uuid) und die beiden Geburtsdatums-Funktionen in der
--   Fassung aus 20261118200000. Fehlt eines davon, bricht die Migration ab.
--
-- Läuft als Transaktion. Darf mehrfach laufen. Einmal im Supabase SQL Editor ausführen, nach 20261118200000.
--
-- OFFEN, BEWUSST NICHT UMGESETZT: Die Spalte wird beim nächsten Schreiben der Profilzeile nachgezogen. Wer 16 wird und
--   sein Profil nie wieder speichert, bleibt verborgen. Ein täglicher Lauf der drei Anweisungen aus Block 5 würde das
--   lösen und ist bewusst nicht Teil dieser Datei, weil er einen Zeitplaner einführt, den die Datenbank heute nicht hat
--   (pg_cron ist nicht eingerichtet, das ist eine eigene Entscheidung des Betreibers). Die drei Anweisungen, zum
--   direkten Übernehmen:
--     update public.posts    set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
--     update public.listings set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
--     update public.projects set author_age_ok = public.age_ok(owner_id)  where author_age_ok is distinct from public.age_ok(owner_id);
begin;

-- ---------- 1) Sicherheitsnetz ----------
do $$ begin
  if to_regprocedure('public.age_ok(uuid)') is null
     or to_regprocedure('public.set_my_birthdate(text)') is null
     or to_regprocedure('public.admin_set_birthdate(uuid, text)') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.posts') is null
     or to_regclass('public.listings') is null
     or to_regclass('public.projects') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'posts' and column_name = 'author_age_ok')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'listings' and column_name = 'author_age_ok')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'projects' and column_name = 'author_age_ok') then
    raise exception 'Erst 20261118200000_altersgrenze_inhalte_verbergen einspielen, dann diese Migration.';
  end if;
end $$;

-- ---------- 2) Die eine Stelle: sync_author_age_ok(p_id) ----------
-- Spiegelt die Tatsache author_age_ok = age_ok(Urheber) für alle Inhalte eines Kontos, in BEIDE Richtungen.
--   "is distinct from" schreibt nur die Zeilen, bei denen sich der Wert tatsächlich ändert.
create or replace function public.sync_author_age_ok(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.posts    set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.listings set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.projects set author_age_ok = public.age_ok(p_id) where owner_id  = p_id and author_age_ok is distinct from public.age_ok(p_id);
end;
$$;
-- Kein Ausführungsrecht für die Rollen, die die Anwendung benutzt. Aufgerufen wird sie nur von den Funktionen unten,
--   die als Eigentümer laufen. Der Dienstschlüssel bekommt sie auch nicht (Standardrechte, siehe 20261118200000, Block 6).
revoke execute on function public.sync_author_age_ok(uuid) from public, anon, authenticated, service_role;

-- ---------- 2b) Indizes auf den Urheber-Spalten ----------
-- Der Trigger auf profiles sucht bei jedem Speichern die Zeilen dieses Urhebers in drei Tabellen. Ohne Index ist das je
--   ein vollständiger Scan, und die Kosten wachsen mit jedem Mitglied. Gemessen am 18.11.2026: vorher kein Index auf
--   author_id bzw. owner_id, auf keiner der drei Tabellen. Die Spalten benutzen außerdem die Leseregeln und jede Abfrage
--   "meine Beiträge", der Index zahlt sich also doppelt aus. Die Namen folgen dem Muster <tabelle>_<spalte>_idx der
--   bestehenden Indizes (zum Beispiel beta_applications_user_idx, page_versions_user_idx). Kein "concurrently": Die
--   Tabellen sind klein, und die Migration läuft als Transaktion.
create index if not exists posts_author_idx    on public.posts    (author_id);
create index if not exists listings_author_idx on public.listings (author_id);
create index if not exists projects_owner_idx  on public.projects (owner_id);

-- ---------- 3) Der Trigger auf profiles ----------
-- Der Aufruf steht in begin ... exception. Ein Fehler beim Nachziehen darf das Speichern des Profils nie verhindern
--   (siehe Kopf). Die Spalte bleibt dann veraltet, und das nächste Speichern holt es nach. raise log macht den Fehler
--   im Postgres-Log sichtbar. Dort steht nur die Kennung und die Fehlermeldung, kein Datum.
create or replace function public.profiles_sync_author_age_ok()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.sync_author_age_ok(new.id);
  exception when others then
    raise log 'profiles_sync_author_age_ok: Nachziehen von author_age_ok für % fehlgeschlagen: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke execute on function public.profiles_sync_author_age_ok() from public, anon, authenticated, service_role;

-- Vorher drop, damit die Migration mehrfach laufen darf.
drop trigger if exists sync_author_age_ok on public.profiles;
create trigger sync_author_age_ok after insert or update on public.profiles
  for each row execute function public.profiles_sync_author_age_ok();

-- ---------- 4) Die beiden Geburtsdatums-Funktionen, jüngste Fassung, nur der Abgleich ist neu ----------
-- Grundlage: set_my_birthdate() und admin_set_birthdate() aus 20261118200000, zeichengleich bis auf die Stellen,
--   an denen die drei Updates durch perform public.sync_author_age_ok(...) ersetzt sind.
-- Die Funktionen behalten den Aufruf, obwohl der Trigger auf profiles ihn meistens schon erledigt. Sie sollen nicht
--   davon abhängen, dass dabei auch die Profilzeile geschrieben wird. Ein Geburtsdatum wird auch dann nachgezogen,
--   wenn das Profil nicht gespeichert wird.
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
  -- author_age_ok in BEIDE Richtungen nachziehen. Der Aufruf steht hier, auch wenn der Trigger auf profiles ihn
  --   meistens schon erledigt (siehe Kopf, Block 4).
  perform public.sync_author_age_ok(uid);
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
  -- author_age_ok in BEIDE Richtungen nachziehen. Der Aufruf steht hier, auch wenn der Trigger auf profiles ihn
  --   meistens schon erledigt (siehe Kopf, Block 4). Nach oben berichtigt wird die Spalte wieder true. Sonst könnte
  --   die Person wieder veröffentlichen, ihre Inhalte blieben aber für Mitglieder unsichtbar.
  perform public.sync_author_age_ok(p_id);
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

-- ---------- 5) Nachtrag für den Bestand, ohne Einschränkung auf eine Kennung, idempotent ----------
-- Derselbe Abgleich wie in sync_author_age_ok(), aber für alle Konten. Er holt nach, was seit dem Lauf von
--   20261118200000 durch Zeitablauf veraltet ist, etwa ein Konto, dessen 16. Geburtstag seitdem gefallen ist.
--   Trifft er zum Zeitpunkt des Einspielens meist 0 Zeilen, weil sich seit dem letzten Lauf nichts geändert hat.
--   Trifft er welche, sind es genau solche Konten. "is distinct from" macht einen zweiten Lauf zu einem No-op.
update public.posts    set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
update public.listings set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
update public.projects set author_age_ok = public.age_ok(owner_id)  where author_age_ok is distinct from public.age_ok(owner_id);

-- ---------- 6) Ausführungsrechte der neuen Fassungen, ausdrücklich ----------
-- Wie in 20261118200000, Block 5: Die Rechte werden nicht dem create or replace überlassen.
revoke execute on function public.set_my_birthdate(text) from public, anon, service_role;
grant execute on function public.set_my_birthdate(text) to authenticated;
revoke execute on function public.admin_set_birthdate(uuid, text) from public, anon, service_role;
grant execute on function public.admin_set_birthdate(uuid, text) to authenticated;

commit;
