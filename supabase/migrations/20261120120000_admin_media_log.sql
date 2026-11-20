-- RÜCKWEG: /opt/xyntal/backups/rueckweg-admin-media-log-20261120.sql auf dem Datenbankserver. Entfernt die Tabelle
--   public.admin_media_log und die Funktion public.admin_media_log_write(uuid,text,text,text) wieder. BEIDE sind NEU,
--   es gibt keine Vorfassung; der Rückweg enthält daher nur die beiden drop-Befehle. Gemessen VOR dem Einspielen, dass
--   die Tabelle und die Funktion nicht existieren (to_regclass und to_regprocedure beide null, 20.11.2026). Probelauf
--   in einer zurückgerollten Transaktion vor dem Einspielen.
--   ACHTUNG beim Rückweg: "drop table public.admin_media_log" löscht das Prüfprotokoll. Wer zurückrollt, verliert die
--   Nachweise. Der Rückweg ist für den Fall gedacht, dass diese Migration am Tag des Einspielens scheitert, nicht für
--   eine Rücknahme Monate später. Später: erst die Zeilen wegsichern, dann zurückrollen.
--
-- WARUM: Kontoübergreifende Admin-Löschungen von Seitenbildern (Migration 20261119120000_admin_seitenbild.sql) hinterließen
--   zwei flüchtige Spuren statt eines Nachweises:
--     1) Supabase-Lager: public.admin_log_page_media_delete(text) schrieb mit "raise log" in das SERVERPROTOKOLL von
--        Postgres (20261119140000, Pfadform geschärft in 20261119150000).
--     2) Eigenes Lager: hosting/daki/media-store.cjs schrieb mit console.log in das PROZESS-LOG des Dienstes (journald).
--   Zwei Löschwege, zwei verschiedene Spuren, nicht zusammenführbar, keine in einer Tabelle, keine in der Anwendung
--   einsehbar, und die Aufbewahrung hing in beiden Fällen an einer Serverkonfiguration, die NICHT gemessen war. Für den
--   erklärten Zweck — den Nachweis des Entfernens rechtswidriger Inhalte bei Nutzern ab 16 — war das kein Prüfprotokoll.
--   Dazu ein zweiter Grund, der sich am Serverprotokoll zeigte: Dort stehen drei ERFUNDENE Einträge aus den Messungen vom
--   19.11.2026 (Konten 00000000-0000-0000-0000-000000000000 und 00000000-0000-0000-0000-00000000dead), die eine Löschung
--   behaupten, die nie stattfand. Sie lassen sich nicht nachträglich entfernen. In einer Tabelle wäre so ein Eintrag
--   kennzeichenbar oder löschbar; in einem Serverprotokoll ist er für immer da. Diese Migration legt die Tabelle an.
--
-- WAS DIESE MIGRATION ANLEGT:
--   public.admin_media_log — eine Zeile je kontoübergreifender Admin-Löschung: wer (admin_id), welches Konto
--     (account_id), welche Datei (file_name), welches Lager (store), wann (acted_at), mit welchem Ergebnis (result).
--   public.admin_media_log_write(uuid, text, text, text) — der EINZIGE Weg, eine Zeile anzulegen. SECURITY DEFINER,
--     search_path = '', prüft public.is_admin(), setzt admin_id selbst aus auth.uid() und gibt die Kennung der Zeile
--     zurück. Beide Löschwege rufen sie auf: die Oberfläche (public/pages/admin-people.js) für das Supabase-Lager, der
--     Mediendienst (hosting/daki/media-store.cjs) über die Schnittstelle für das eigene Lager.
--
-- DER PFAD, in zwei Spalten statt einer: account_id ist eine uuid und wird als uuid geprüft, file_name trägt dieselbe
--   Form wie die Upload-Regel im Speicher. Der Pfad im Supabase-Lager ist account_id || '/' || file_name, im eigenen
--   Lager 'page-media/' || account_id || '/' || file_name. Eine einzelne Textspalte hätte beides vermischt und sich
--   schwächer prüfen lassen. Die Spalte store sagt, welches Lager gemeint ist.
--
-- KEIN FREMDSCHLÜSSEL auf auth.users oder public.profiles, absichtlich, für BEIDE Kontospalten:
--   Ein Fremdschlüssel mit "on delete cascade" würde den Nachweis genau dann löschen, wenn er gebraucht wird — wenn das
--   Mitglied gelöscht wird (public.admin_delete_member) oder das Admin-Konto verschwindet. Ein Fremdschlüssel ohne cascade
--   würde das Löschen des Mitglieds blockieren und damit einen Löschanspruch nach Art. 17 DSGVO verhindern. Beides ist
--   falsch. Die Spalten halten die Kennung als uuid, ohne Verweis. Folge, ehrlich benannt: Eine Zeile kann auf ein Konto
--   zeigen, das es nicht mehr gibt. Das ist bei einem Prüfprotokoll richtig so.
--
-- DATENSPARSAMKEIT: Genau sechs Angaben, keine mehr. Kein Dateiname im Klartext über die Form hinaus, kein Bildinhalt,
--   keine Meldung, kein Grund, keine IP-Adresse, kein Freitextfeld. Ein Freitextfeld wäre der Ort, an dem früher oder
--   später der Inhalt der Meldung landet; das gehört nicht in ein Protokoll, das Admins lesen dürfen.
--
-- DAS ERGEBNIS (Spalte result) kennt ZWEI Werte, nicht drei: 'geloescht' und 'ungewiss'.
--   Die Oberfläche unterscheidet beim Melden an den Admin drei Zustände (gelöscht / nicht gelöscht / ungewiss). In das
--   Protokoll kommen nur zwei davon. 'nicht geloescht' fehlt mit Absicht: Hat der Speicher die Löschung mit einem Fehler
--   abgewiesen, ist nichts entfernt worden, es gibt nichts zu belegen — und jede abgewiesene Löschung als Zeile zu
--   schreiben hieße, das Prüfprotokoll über fehlschlagende Versuche beliebig füllbar zu machen. 'ungewiss' steht dagegen
--   drin, weil eine Löschung mit unklarem Ausgang genau das ist, was hinterher jemand wissen muss.
--   BEWUSST NICHT ERFASST: wiederholte, erfolglose Löschversuche eines Admins. Das wäre Missbrauchsbeobachtung, ein
--   anderer Zweck als der Nachweis des Entfernens. Wer das will, braucht eine eigene Tabelle, nicht diese.
--
-- RECHTE, und warum so:
--   SELECT nur für authenticated, dazu RLS mit genau einer Regel "using (public.is_admin())". Lesen darf also nur, wer
--     aktiv, nicht gesperrt und — wo ein Faktor verifiziert ist — auf aal2 angemeldet ist.
--   KEIN INSERT, KEIN UPDATE, KEIN DELETE für authenticated. Nicht als Regel, sondern als fehlendes Tabellenrecht: Dann
--     greift RLS gar nicht erst. Ein Prüfprotokoll, das sich ändern lässt, ist keins. Geschrieben wird nur über
--     admin_media_log_write, und die Funktion läuft als Eigentümer.
--   service_role: revoke all. Der Dienstschlüssel umgeht RLS (rolbypassrls); das fehlende Tabellenrecht ist die einzige
--     Sperre, die vor einem abgeflossenen Schlüssel hält. Mit dem Schlüssel ließen sich sonst Zeilen fälschen und
--     löschen. Der Mediendienst braucht ihn hier nicht: Er schreibt mit dem Token des Admins, nicht mit dem Dienstschlüssel.
--   anon: revoke all, wie überall.
--
-- GRENZE, DIE BLEIBT — ausdrücklich benannt, damit die Tabelle nicht für mehr gehalten wird, als sie leistet:
--   Die Regeln auf storage.objects ("Xyntal Seitenbild entfernen", Migration 20261119120000) erlauben einem Admin
--   DASSELBE Löschen direkt über die Storage-Schnittstelle, ohne die Oberfläche. Davon erfährt dieses Protokoll nichts.
--   Dasselbe gilt für das eigene Lager: Wer die S3-Zugangsdaten (media.env) hat, löscht dort direkt vorbei. Diese Tabelle
--   belegt also, WAS über die beiden gebauten Wege gelöscht wurde, und NICHT, dass nichts anderes gelöscht wurde. Ein
--   vollständiger Nachweis bräuchte eine andere Konstruktion: das Löschrecht aus den Regeln herausnehmen und Löschen nur
--   noch über eine SECURITY DEFINER-Funktion zulassen, die in einem Schritt löscht und protokolliert. Das ist hier NICHT
--   gebaut; es nimmt dem Admin den Notweg über die Schnittstelle, und diese Entscheidung ist nicht getroffen.
--   Zweite Grenze: Wer Eigentümer der Datenbank ist (postgres), kann Zeilen ändern und löschen. Dagegen hilft keine
--   Tabelle in derselben Datenbank, nur eine Ausleitung nach außen. Auch die ist hier NICHT gebaut.
--   WARUM [0-9a-f-]{36} UND NICHT DIE ECHTE UUID-FORM, obwohl das loser ist (von der Sicherheitsprüfung angemerkt):
--   Die Prüfung ist mit ABSICHT wortgleich zur Upload-Regel im Speicher ("Xyntal Seitenbild hochladen", with check) und
--   zur Dateiform in hosting/daki/media-store.cjs. Eine strengere Prüfung hier würde einen Dateinamen ABLEHNEN, den der
--   Speicher erlaubt — und damit genau den Fall herstellen, der an anderer Stelle gerade beseitigt wurde: Die Datei ist
--   gelöscht, und der Nachweis lässt sich nicht schreiben. Das Protokoll darf nicht strenger sein als der Speicher, den
--   es protokolliert. Dass dadurch ein formal zulässiger Name wie 36 Bindestriche durchkäme, ist harmlos (die
--   Zeichenklasse enthält kein Steuerzeichen) und kann als Datei ohnehin nicht entstehen. Wer das schärfen will, muss
--   die Upload-Regel im Speicher ZUERST schärfen, dann hier nachziehen — in dieser Reihenfolge.
--   Dritte Grenze: Die Form von file_name sagt nichts darüber, ob die Datei je existierte. Die Funktion prüft das nicht;
--   sie kann es nicht, sie sieht den Speicher nicht. Beide Aufrufer prüfen vorher (die Oberfläche am Ergebnis des
--   Löschens, der Mediendienst mit einem HEAD vor dem DELETE), aber das ist eine Zusage der Aufrufer, nicht der Tabelle.
--
-- public.admin_log_page_media_delete(text) BLEIBT bestehen, unverändert. Sie wird von niemandem mehr aufgerufen, nachdem
--   diese Migration und der zugehörige Code ausgeliefert sind. Sie hier zu entfernen wäre ein zweiter, unnötiger Eingriff
--   in derselben Migration: Solange der ALTE ausgelieferte Stand der Oberfläche noch läuft (und das tut er zwischen dem
--   Einspielen dieser Migration und dem Ausrollen des Codes), braucht er sie. Ein Aufräumen gehört in eine eigene
--   Migration, NACH dem Ausrollen.
--
-- Ausführen im Supabase SQL Editor als postgres oder per psql als postgres. Läuft als Transaktion. Darf mehrfach laufen.

begin;

-- Blockierwartezeit, wie in den Migrationen der Seitenbild-Regeln.
set local lock_timeout = '3s';

-- ---------- 1) Sicherheitsnetz ----------
-- Ohne public.is_admin() ist weder die Leseregel noch die Prüfung in der Funktion möglich. Dann lieber abbrechen, als ein
-- Protokoll anzulegen, das jeder lesen oder schreiben darf.
do $$ begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() fehlt. Sie stammt aus 20261118250000_is_admin_sperre.sql. Die Migration wird nicht angewendet.';
  end if;
end $$;

-- ---------- 2) Die Tabelle ----------
-- "if not exists": Die Migration darf mehrfach laufen, ohne bestehende Zeilen anzutasten. Ein "create table" ohne das
-- würde beim zweiten Lauf abbrechen; ein "drop table" davor würde das Protokoll löschen.
create table if not exists public.admin_media_log (
  id         bigint generated always as identity primary key,
  acted_at   timestamptz not null default now(),
  -- Wer gehandelt hat. Von der Funktion aus auth.uid() gesetzt, nie vom Aufrufer übergeben.
  admin_id   uuid not null,
  -- Wessen Datei es war. Kein Fremdschlüssel, siehe Kopf.
  account_id uuid not null,
  -- Dateiname in der Form der Upload-Regel im Speicher: <uuid>.<endung>, kleingeschrieben.
  file_name  text not null check (file_name ~ '^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$'),
  -- Welches Lager. 'supabase' = Eimer page-media, 'eigener-server' = S3-Speicher hinter hosting/daki/media-store.cjs.
  store      text not null check (store in ('supabase', 'eigener-server')),
  -- Ergebnis der Löschung. Zwei Werte, siehe Kopf.
  result     text not null check (result in ('geloescht', 'ungewiss'))
);

comment on table public.admin_media_log is
  'Prüfprotokoll: kontoübergreifende Admin-Löschungen von Seitenbildern. Geschrieben nur über public.admin_media_log_write. Lesen nur Admins. Kein UPDATE, kein DELETE für authenticated. Grenze: erfasst nur Löschungen über die beiden gebauten Wege, nicht direkte Löschungen über die Storage-Schnittstelle oder den S3-Zugang.';

-- Lesereihenfolge der Ansicht: das Neueste zuerst. Heute ist die Tabelle leer und der Index unnötig; er kostet nichts
-- und spart später den vollen Durchlauf.
create index if not exists admin_media_log_acted_at_idx on public.admin_media_log (acted_at desc);

-- ---------- 3) Rechte ----------
-- Erst alles entziehen, dann genau ein Recht geben. Die Reihenfolge ist wichtig: "grant select" nach dem "revoke all",
-- sonst nimmt das revoke das select wieder mit.
revoke all on public.admin_media_log from anon, authenticated, service_role;
grant select on public.admin_media_log to authenticated;
-- Zur Kennungsfolge der Spalte id ABSICHTLICH kein eigener revoke: "revoke all on all sequences in schema public" hätte
-- die Folgen ALLER Tabellen im Schema getroffen, nicht nur diese, und damit Wege beschädigt, die nichts mit dem
-- Protokoll zu tun haben. Nötig ist es auch nicht: Eine Kennungsspalte "generated always as identity" lässt sich nur
-- beim INSERT füllen, und INSERT hat hier niemand.

-- ---------- 4) Zeilenschutz ----------
alter table public.admin_media_log enable row level security;

-- Genau eine Regel, und nur fürs Lesen. Für INSERT, UPDATE und DELETE gibt es absichtlich KEINE Regel: Ohne
-- Tabellenrecht kommt dort niemand an, und eine Regel würde nur den falschen Eindruck erzeugen, es gäbe einen Weg.
drop policy if exists "Xyntal Medienprotokoll lesen" on public.admin_media_log;
create policy "Xyntal Medienprotokoll lesen" on public.admin_media_log
  as permissive for select to authenticated
  using ((select public.is_admin()));

-- ---------- 5) Der einzige Schreibweg ----------
-- p_account und p_file bilden den Pfad, p_store das Lager, p_result das Ergebnis. admin_id kommt NICHT vom Aufrufer:
--   Ein Aufrufer, der die handelnde Person selbst angeben darf, kann sie fälschen. Die Funktion nimmt auth.uid().
-- Die Prüfung der Berechtigung steht IN der Funktion, nicht nur in der Oberfläche und nicht nur im Mediendienst.
-- Rückgabe: die Kennung der geschriebenen Zeile. Damit kann der Aufrufer belegen, dass geschrieben wurde, und sie dem
--   Admin anzeigen. Ohne Rückgabewert müsste er dem Ausbleiben eines Fehlers vertrauen.
create or replace function public.admin_media_log_write(
  p_account uuid,
  p_file    text,
  p_store   text,
  p_result  text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := auth.uid();
  v_id    bigint;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  -- auth.uid() muss gesetzt sein. is_admin() wäre ohne angemeldete Sitzung schon false; die Prüfung steht hier, damit
  -- admin_id niemals null wird, falls is_admin() je anders gebaut wird.
  if v_admin is null then raise exception 'Keine angemeldete Sitzung.'; end if;
  if p_account is null then raise exception 'Kein Konto angegeben.'; end if;
  -- Dieselbe Form wie die Upload-Regel im Speicher und wie die Prüfung in admin_log_page_media_delete. Der Wert geht in
  -- eine Tabelle, die Admins lesen; ein Name mit Zeilenumbruch oder Steuerzeichen hat dort nichts zu suchen.
  if p_file is null or length(p_file) > 60
     or p_file !~ '^[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$' then
    raise exception 'Ungültiger Dateiname.';
  end if;
  if p_store is null or p_store not in ('supabase', 'eigener-server') then
    raise exception 'Unbekanntes Lager.';
  end if;
  if p_result is null or p_result not in ('geloescht', 'ungewiss') then
    raise exception 'Unbekanntes Ergebnis.';
  end if;
  insert into public.admin_media_log (admin_id, account_id, file_name, store, result)
  values (v_admin, p_account, p_file, p_store, p_result)
  returning id into v_id;
  return v_id;
end;
$$;

-- Rechte wie bei den übrigen admin_*-Funktionen. Nicht für PUBLIC, nicht für anon. Wer nicht Admin ist, scheitert an der
-- Prüfung in der Funktion. service_role bekommt sie NICHT: Der Dienstschlüssel soll keine Zeilen anlegen können, denn
-- auth.uid() wäre dabei null und die Zeile hätte keine handelnde Person. Der Mediendienst nutzt das Token des Admins.
revoke all on function public.admin_media_log_write(uuid, text, text, text) from public, anon, service_role;
grant execute on function public.admin_media_log_write(uuid, text, text, text) to authenticated;

-- ---------- 6) Prüfung nach dem Anlegen ----------
-- Tatsachen, nicht Textvergleiche: Zeilenschutz an, genau eine Regel und nur für select, Rechte wie beschrieben,
-- Funktion SECURITY DEFINER mit festem search_path.
do $$
declare
  r    record;
  n    int;
  priv text;
begin
  if to_regclass('public.admin_media_log') is null then
    raise exception 'Die Tabelle fehlt nach dem Anlegen. Die Migration bricht ab.';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.admin_media_log'::regclass) then
    raise exception 'Zeilenschutz ist auf public.admin_media_log nicht aktiv. Die Migration bricht ab.';
  end if;

  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'admin_media_log';
  if n <> 1 then
    raise exception 'Erwartet war genau eine Regel auf public.admin_media_log, gefunden %. Die Migration bricht ab.', n;
  end if;
  select cmd into r from pg_policies
   where schemaname = 'public' and tablename = 'admin_media_log';
  if r.cmd is distinct from 'SELECT' then
    raise exception 'Die einzige Regel ist nicht für SELECT, sondern für %. Die Migration bricht ab.', r.cmd;
  end if;

  -- Tabellenrechte: authenticated darf NUR lesen. anon und service_role dürfen nichts.
  if not has_table_privilege('authenticated', 'public.admin_media_log', 'SELECT') then
    raise exception 'authenticated darf nicht lesen. Die Migration bricht ab.';
  end if;
  foreach priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
    if has_table_privilege('authenticated', 'public.admin_media_log', priv) then
      raise exception 'authenticated hat % auf dem Protokoll. Ein Protokoll, das sich ändern lässt, ist keins. Die Migration bricht ab.', priv;
    end if;
  end loop;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('anon', 'public.admin_media_log', priv) then
      raise exception 'anon hat % auf dem Protokoll. Die Migration bricht ab.', priv;
    end if;
    if has_table_privilege('service_role', 'public.admin_media_log', priv) then
      raise exception 'service_role hat % auf dem Protokoll. Ein abgeflossener Dienstschlüssel könnte Zeilen fälschen. Die Migration bricht ab.', priv;
    end if;
  end loop;

  -- Die Funktion.
  select prosecdef, proconfig,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_darf,
         has_function_privilege('service_role', p.oid, 'EXECUTE') as dienst_darf,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_darf
    into r
    from pg_proc p
   where p.oid = 'public.admin_media_log_write(uuid,text,text,text)'::regprocedure;
  if r is null then raise exception 'Die Funktion fehlt nach dem Anlegen. Die Migration bricht ab.'; end if;
  if r.prosecdef is not true
     or not exists (select 1 from unnest(coalesce(r.proconfig, '{}'::text[])) c where c like 'search_path=%') then
    raise exception 'Die Funktion ist nicht SECURITY DEFINER mit festem search_path. Die Migration bricht ab.';
  end if;
  if r.anon_darf then raise exception 'anon darf die Funktion ausführen. Die Migration bricht ab.'; end if;
  if r.dienst_darf then raise exception 'service_role darf die Funktion ausführen. Die Migration bricht ab.'; end if;
  if not r.auth_darf then raise exception 'authenticated darf die Funktion nicht ausführen. Die Migration bricht ab.'; end if;
end $$;

-- ---------- 7) Verhaltensprobe: ein Nicht-Admin wird abgewiesen ----------
-- Keine Textsuche im Funktionsrumpf, sondern ein echter Aufruf. Die Lehre aus 20261119120000: Eine Prüfung, die nur
--   nachsieht, ob is_admin() im Text VORKOMMT, hätte eine Sabotage mit "and" statt "or" durchgelassen.
-- Die Probe nimmt eine Kennung, die es in public.profiles nicht gibt. is_admin() ist damit false, die Funktion weist ab,
--   und es wird NICHTS geschrieben.
-- KEINE Gegenprobe mit einem echten Admin an dieser Stelle, mit Absicht: Sie würde eine Zeile in das Prüfprotokoll
--   schreiben, die eine Löschung behauptet, die nie stattfand — genau der Fehler, der im Serverprotokoll drei erfundene
--   Einträge hinterlassen hat. Die Gegenprobe (Admin darf schreiben) steht in tests/admin_media_log.sql, in einer
--   leeren Testdatenbank. Diese Asymmetrie ist gewollt: In der Produktion wird nur geprüft, was nichts schreibt.
do $$
declare
  abgewiesen boolean := false;
  meldung    text;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c0de', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c0de","aal":"aal1"}', true);
  if (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000c0de') <> 0 then
    raise exception 'Die Probe-Kennung existiert als Profil. Die Probe wäre sinnlos. Die Migration bricht ab.';
  end if;
  begin
    perform public.admin_media_log_write(
      '00000000-0000-0000-0000-00000000c0de'::uuid,
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', 'supabase', 'geloescht');
  exception when others then
    abgewiesen := true;
    meldung := SQLERRM;
  end;
  if not abgewiesen then
    raise exception 'Die Funktion hat einen Nicht-Admin durchgelassen. Die Migration bricht ab und wird zurückgerollt.';
  end if;
  if meldung is distinct from 'Nur für Admins.' then
    raise exception 'Der Nicht-Admin wurde abgewiesen, aber mit der falschen Meldung: "%". Erwartet: "Nur für Admins.". Die Migration bricht ab.', meldung;
  end if;
  -- Nach der Probe muss die Tabelle so leer sein wie vorher, was die Probe-Kennung betrifft.
  if exists (select 1 from public.admin_media_log where admin_id = '00000000-0000-0000-0000-00000000c0de'
             or account_id = '00000000-0000-0000-0000-00000000c0de') then
    raise exception 'Die Probe hat eine Zeile hinterlassen. Die Migration bricht ab und wird zurückgerollt.';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

commit;
