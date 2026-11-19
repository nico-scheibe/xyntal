-- RÜCKWEG: /opt/xyntal/backups/rueckweg-admin-seitenbild-protokoll-20261119.sql auf dem Datenbankserver. Entfernt die Funktion
--   public.admin_log_page_media_delete(text) wieder. Die Funktion ist NEU, es gibt keine Vorfassung. Der Rückweg enthält
--   daher nur das drop. Probelauf in einer zurückgerollten Transaktion vor dem Einspielen.
--
-- WARUM: Admins entfernen Seitenbilder eines Mitglieds über die Oberfläche (Migration 20261119120000_admin_seitenbild.sql,
--   public/pages/admin-people.js). Das Entfernen läuft direkt über die Storage-Schnittstelle und damit an jedem Protokoll
--   vorbei. Alle anderen Admin-Eingriffe am Mitglied laufen über SECURITY DEFINER-Funktionen, die mitschreiben
--   (admin_clear_age_block, admin_delete_member). Für das Entfernen rechtswidriger Inhalte bei Nutzern ab 16 war hinterher
--   nicht nachvollziehbar, wer welche Datei wann gelöscht hat. Diese Funktion schreibt den Eintrag.
--
-- WAS DIE FUNKTION TUT: Sie schreibt NUR einen Eintrag ins Serverprotokoll (raise log), keine Tabelle. Sie löscht nichts.
--   Die Oberfläche ruft sie NACH der bestätigten Löschung auf, nicht vorher. Eine Protokollzeile vor einer Löschung, die
--   dann scheitert, wäre falsch. Scheitert der Eintrag, ist die Datei trotzdem weg. Die Oberfläche meldet das dann
--   ausdrücklich als "gelöscht, aber nicht protokolliert".
--
-- GRENZE DES PROTOKOLLS, ehrlich benannt. Der Eintrag ist KEIN Prüfprotokoll:
--   1) Er erfasst nur Löschungen, die über diese Oberfläche laufen. Ein Admin kann dieselbe Datei direkt über die
--      Storage-Schnittstelle löschen. Die Regel "Xyntal Seitenbild entfernen" erlaubt das, und davon erfährt das
--      Protokoll nichts. Ein echtes Prüfprotokoll bräuchte den Server-Weg, zum Beispiel Löschen nur über eine Funktion.
--   2) raise log schreibt in das Serverprotokoll von Postgres, nicht in eine Tabelle. Ob und wie lange das aufbewahrt
--      wird, hängt von der Serverkonfiguration ab. Das ist hier NICHT gemessen.
--   3) Schlägt der Aufruf fehl, bleibt die Löschung bestehen. Die Oberfläche sagt das sichtbar.
--
-- SICHERHEIT. Ausführen darf nur, wer public.is_admin() erfüllt (aktiv, nicht gesperrt, mit 2. Faktor, wo verlangt).
--   Die Prüfung steht IN der Funktion, nicht nur in der Oberfläche. Der Pfad wird streng geprüft, weil er ins Protokoll
--   geschrieben wird: nur Form <uuid>/<dateiname> mit Buchstaben, Ziffern, Punkt, Unterstrich und Bindestrich. Ein Name
--   mit Zeilenumbruch könnte sonst gefälschte Protokollzeilen erzeugen.
--   SECURITY DEFINER mit search_path = '' (wie die übrigen admin_*-Funktionen). EXECUTE nur für authenticated.
--
-- Ausführen im Supabase SQL Editor als postgres oder per psql als postgres. Läuft als Transaktion. Darf mehrfach laufen.

begin;

-- Blockierwartezeit, wie in der Migration der Seitenbild-Regeln.
set local lock_timeout = '3s';

-- Sicherheitsnetz: ohne public.is_admin() ist die Prüfung nicht möglich, die Migration wird nicht angewendet.
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() fehlt. Sie stammt aus 20261118250000_is_admin_sperre.sql. Die Migration wird nicht angewendet.';
  end if;
end $$;

create or replace function public.admin_log_page_media_delete(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if p_path is null or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$' then
    raise exception 'Ungültiger Dateipfad.';
  end if;
  raise log 'admin_log_page_media_delete: Seitenbild % entfernt durch %', p_path, auth.uid();
end;
$$;

-- Rechte: wie bei den übrigen admin_*-Funktionen. Nicht für PUBLIC und nicht für anon, nur für angemeldete Nutzer.
-- Wer nicht Admin ist, scheitert an der Prüfung in der Funktion (Nur für Admins.).
revoke all on function public.admin_log_page_media_delete(text) from public, anon;
grant execute on function public.admin_log_page_media_delete(text) to authenticated;

-- Prüfung nach dem Anlegen: Die Funktion muss SECURITY DEFINER sein, mit leerem search_path, und anon darf sie nicht.
do $$
declare
  r record;
begin
  select prosecdef, proconfig, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_darf,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_darf
    into r
    from pg_proc p
   where p.oid = 'public.admin_log_page_media_delete(text)'::regprocedure;
  if r is null then raise exception 'Die Funktion fehlt nach dem Anlegen. Die Migration bricht ab.'; end if;
  if r.prosecdef is not true or not exists (select 1 from unnest(coalesce(r.proconfig, '{}'::text[])) c where c like 'search_path=%') then
    raise exception 'Die Funktion ist nicht SECURITY DEFINER mit festem search_path. Die Migration bricht ab.';
  end if;
  if r.anon_darf then raise exception 'anon darf die Funktion ausführen. Die Migration bricht ab.'; end if;
  if not r.auth_darf then raise exception 'authenticated darf die Funktion nicht ausführen. Die Migration bricht ab.'; end if;
end $$;

commit;
