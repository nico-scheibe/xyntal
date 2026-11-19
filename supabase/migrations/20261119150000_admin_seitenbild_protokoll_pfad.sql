-- RÜCKWEG: /opt/xyntal/backups/rueckweg-admin-seitenbild-protokoll-pfad-20261119.sql auf dem Datenbankserver. Stellt die Fassung
--   von public.admin_log_page_media_delete(text) VOR dieser Migration wieder her (aus der Produktion gelesen mit
--   pg_get_functiondef, wortgleich, VOR dem Einspielen). Die Rechte bleiben in beiden Fassungen gleich (CREATE OR REPLACE
--   behält die Rechte bei). Probelauf in einer zurückgerollten Transaktion vor dem Einspielen.
--
-- WARUM: Die Pfadprüfung der Vorfassung (20261119140000) war zu lose. Der Dateiteil hieß nur [A-Za-z0-9._-]+. Damit ging
--   ein erfundener Name wie messung-protokoll.jpg durch, und das Protokoll schrieb eine Löschung, die nie stattgefunden hat.
--   Ein Protokoll, das das Entfernen rechtswidriger Inhalte belegen soll, darf nur Pfade festhalten, die es wirklich geben
--   kann. Die Vorfassung hat zwei solche Einträge geschrieben (Ordner 00000000-0000-0000-0000-000000000000, Probelauf und
--   Nachmessung). Die Einträge bleiben im Serverprotokoll stehen. Sie lassen sich von hier aus nicht entfernen.
--
-- WAS SICH ÄNDERT: Nur die Pfadprüfung. Der Dateiteil hat jetzt dieselbe Form wie die Upload-Regel im Speicher
--   ("Xyntal Seitenbild hochladen", with check): [0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm), kleingeschrieben, ohne Zusätze.
--   Der Ordner bleibt eine UUID. Dazu eine Längengrenze (100 Zeichen). Die Prüfung der Berechtigung (is_admin()) bleibt
--   unverändert. Die Funktion löscht weiterhin nichts.
--
-- GRENZE, bleibt bestehen: Die Form des Pfades sagt nichts darüber, ob die Datei existiert. Die Funktion prüft das nicht.
--   Das Protokoll ist kein Prüfprotokoll: Es erfasst nur Löschungen über die Oberfläche. Siehe 20261119140000.
--
-- Ausführen als postgres. Läuft als Transaktion. Darf mehrfach laufen.

begin;

set local lock_timeout = '3s';

-- Sicherheitsnetz: die Funktion muss schon existieren (sonst wäre das hier eine Neuanlage ohne Vorfassung).
do $$ begin
  if to_regprocedure('public.admin_log_page_media_delete(text)') is null then
    raise exception 'public.admin_log_page_media_delete(text) fehlt. Sie stammt aus 20261119140000_admin_seitenbild_protokoll.sql. Die Migration wird nicht angewendet.';
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
  if p_path is null or length(p_path) > 100
     or p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$' then
    raise exception 'Ungültiger Dateipfad.';
  end if;
  raise log 'admin_log_page_media_delete: Seitenbild % entfernt durch %', p_path, auth.uid();
end;
$$;

-- Prüfung nach dem Anlegen: Die Funktion ist weiterhin SECURITY DEFINER mit festem search_path, anon darf sie nicht,
-- authenticated darf sie, und die Pfadprüfung weist einen Dateinamen in der alten, losen Form ab.
do $$
declare
  r record;
begin
  select prosecdef, proconfig,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_darf,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_darf,
         pg_get_functiondef(p.oid) as def
    into r
    from pg_proc p
   where p.oid = 'public.admin_log_page_media_delete(text)'::regprocedure;
  if r.prosecdef is not true or not exists (select 1 from unnest(coalesce(r.proconfig, '{}'::text[])) c where c like 'search_path=%') then
    raise exception 'Die Funktion ist nicht SECURITY DEFINER mit festem search_path. Die Migration bricht ab.';
  end if;
  if r.anon_darf then raise exception 'anon darf die Funktion ausführen. Die Migration bricht ab.'; end if;
  if not r.auth_darf then raise exception 'authenticated darf die Funktion nicht ausführen. Die Migration bricht ab.'; end if;
  -- Die Prüfung nach dem Anlegen liest den erzeugten Funktionstext: die neue Längengrenze muss darin stehen.
  if r.def !~ 'length\(p_path\) > 100' then
    raise exception 'Der erzeugte Funktionstext enthält die Längengrenze nicht. Die Migration bricht ab und wird zurückgerollt.';
  end if;
end $$;

commit;
