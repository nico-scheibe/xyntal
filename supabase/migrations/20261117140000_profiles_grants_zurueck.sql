-- Rechte auf public.profiles auf die Absicht aus supabase/schema.sql:143-148 zurücksetzen.
--
-- Warum das nötig ist: Auf der laufenden Datenbank haben anon und authenticated
-- INSERT, UPDATE, DELETE und TRUNCATE auf ALLEN Spalten von public.profiles --
-- einschließlich is_admin, status, is_verified, review_locked, banned und created_at.
-- Das sind Supabases Standardrechte; sie sind beim Umzug von Supabase Cloud
-- mitgekommen, denn die gezielten revoke/grant-Zeilen aus schema.sql waren auf
-- dem alten Projekt nie wirksam.
--
-- Belegt (in einer zurückgerollten Transaktion, mit den Ansprüchen, die PostgREST setzt):
-- Ein normales Mitglied ohne 2FA konnte bei sich is_admin = true setzen; danach gab
-- is_admin() true zurück und eine Admin-Funktion auf ein FREMDES Konto ging durch.
-- mfa_ok() lässt jeden durch, der gar keinen bestätigten Faktor hat -- das sind 15
-- von 16 Konten. Die Policy "Eigenes Profil bearbeiten" erlaubt die eigene Zeile,
-- die Spaltenrechte waren die einzige Grenze, und die fehlte.
--
-- Nebenwirkung für die heute eingespielte Altersprüfung: Mit schreibbarem created_at
-- ließ sich der Bestandsschutz fälschen, mit schreibbarem status die Prüfung ganz
-- umgehen (Selbstfreischaltung auf 'approved').
--
-- Die Grant-Liste unten ist nicht geraten, sondern abgeglichen mit dem, was die
-- Website wirklich schreibt:
--   public/app.js:9        PROFILE_FIELDS (die elf Inhaltsfelder), geschrieben in
--                          public/pages/profil.js:182
--   public/avatars.js:230  avatar_path
--   public/meine-karte.js:125  banner_path
-- INSERT braucht der Client nicht: Profile entstehen über den Trigger
-- handle_new_user() auf auth.users (security definer). DELETE braucht er auch nicht:
-- Löschen läuft über die Funktion delete_my_account().
--
-- avatar_item steht absichtlich NICHT in der Liste: Die Spalte existiert auf der
-- laufenden Datenbank nicht (Migration 20261115120000_avatar_items.sql ist nie
-- eingespielt worden), public/avatars.js:352 ist dort also schon vorher kaputt.
-- Der do-Block unten erteilt das Recht trotzdem, falls die Spalte doch da ist --
-- dann ändert diese Migration an diesem Weg nichts.

begin;

revoke insert, update, delete, truncate, references, trigger
  on public.profiles from anon, authenticated;

grant select on public.profiles to anon, authenticated;

grant update (name, headline, about, phase, category, offer, seek,
              linkedin, instagram, website, is_public,
              avatar_path, banner_path)
  on public.profiles to authenticated;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'profiles'
                and column_name = 'avatar_item') then
    execute 'grant update (avatar_item) on public.profiles to authenticated';
  end if;
end $$;

commit;
