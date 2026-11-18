-- Sperre wirkt auf Löschen: Ein gesperrtes Mitglied darf keine eigene Datei mehr entfernen, AUSSER in den drei Eimern
--   der FREILISTE avatars, banners, xyntal-app-files.
-- Gehört zu supabase/migrations/20261118270000_sperre_nichts_loeschen.sql (Sperrliste, eingespielt) UND zu
--   supabase/migrations/20261118290000_sperre_loeschen_freiliste.sql (Freiliste, ersetzt die Regel). Der Test lädt beide
--   nacheinander: die alte Regel entsteht zuerst, die neue ersetzt sie. Warum die Richtung umgedreht wurde, steht im Kopf
--   der Migration 20261118290000.
-- UMGEDREHTE ZUSAGEN sind im Blocktext mit "UMGEDREHT" gekennzeichnet. Dort steht, was vorher zugesichert wurde.
--
-- TRIGGER: GEMESSEN, nicht nachgebaut. Funktion storage.protect_delete() und Trigger protect_objects_delete stehen
--   wörtlich im Block "Trigger protect_objects_delete" unten. Sie stammen aus der Produktionsdatenbank (vom Koordinator
--   gelesen), nicht aus dem Repo. Der Platzhalter von vorher ist entfernt.
--
-- NACHGEBILDET, nicht aus der Produktion gelesen:
--   storage.objects: gleiche Spalten, Rechte und Eigentümerangaben wie in tests/sperre_uploads.sql (dort gemessen).
--   storage.foldername(): Semantik aus Supabase bekannt, nicht gemessen. Die Regeln nutzen nur den ersten Ordner [1].
--   public.profiles: nur die Spalten, die die Regeln lesen. Zeilenschutz: "Profile lesen" vereinfacht (id = auth.uid()).
--   public.ban_active(), public.me_banned(), public.mfa_ok(), public.is_admin(): WÖRTLICH aus dem Repo (Herkunft unten).
--   SELECT-Regel auf storage.objects: nur ein STELLVERTRETER "eigener Ordner" für authenticated, bucket-unabhängig. Die echten
--     Lesen-Regeln sind nicht geladen: Projektbilder und Nachrichtenanhänge verweisen auf Tabellen, die hier fehlen. Für
--     EIGENE Zeilen ist der erste Zweig der echten Regeln identisch, und nur eigene Zeilen löschen die Tests.
--   service_role: in Supabase umgeht die Rolle RLS (BYPASSRLS). Hier nicht. Stellvertreter in den Blöcken f4 und f5 erlauben ihr
--     das Löschen, damit die Gegenprobe prüft, dass die Sperre sie nicht trifft. Gemessen vom Koordinator auf der Produktionsdatenbank: service_role hat rolbypassrls = t. Hier nicht nachgebildet, deshalb
--     prüfen f4 und f5 nur die Regel-Adressierung (authenticated), nicht die echte Umgehung durch BYPASSRLS.
--
-- WÖRTLICH AUS DEM REPO (Herkunft je Regel, Zeilen wie im Repo):
--   "Xyntal Profilbilder entfernen"        supabase/005_profile_avatars.sql, Zeile 23-26
--   "Xyntal Banner entfernen"              supabase/migrations/20261107120000_card_banners_premium.sql, Zeile 104-108
--   "Xyntal Seitenbild entfernen"          supabase/migrations/20261108110000_custom_page.sql, Zeile 92-94
--   "Xyntal Nachrichtenanhänge entfernen"  supabase/migrations/20261028140000_message_features.sql, Zeile 454-462
--   "Xyntal Projektbilder entfernen"       supabase/020_project_images.sql, Zeile 34-38
--   "2FA erzwingen" (storage.objects)      supabase/migrations/20261109120000_security_hardening.sql, Zeile 30-32
--   Fünf Xyntal-Löschregeln oben. Die sechste Löschregel auf storage.objects (xyntal app files delete) gehört der zweiten
--   Anwendung, ist in einem anderen Projekt definiert und wird hier über den Stellvertreter in Block g geprüft.
--   public.ban_active()                    supabase/migrations/20261103180000_website_ban.sql, Zeile 8-13
--   public.me_banned()                     supabase/migrations/20261109120000_security_hardening.sql, Zeile 86-89
--   public.mfa_ok()                        supabase/017_security.sql, Zeile 17-23
--   public.is_admin()                      supabase/migrations/20261118250000_is_admin_sperre.sql, Zeile 67-70 (aktuelle Fassung)
--
-- GEPRÜFT, jede Zusage mit Gegenprobe:
--   a) VORHER: gesperrtes M2 löscht eigene Dateien in avatars, message-attachments und project-images (Lücke belegt).
--   b) NACHHER: gesperrtes M2 löscht in message-attachments nichts (0 Zeilen, kein Fehler). Gegenprobe: Datei liegt noch.
--      b3/b4: entsperrt gelingt derselbe Versuch, wieder gesperrt scheitert er. Die Ursache ist die Sperre.
--   c) Gegenprobe, die wichtigste: gesperrtes M2 löscht WEITER in avatars und banners (Löschweg des Kontos).
--      c3/c4 UMGEDREHT: gesperrtes M2 scheitert in page-media und project-images (vorher Gegenteil, siehe Block c).
--   d) Nicht gesperrtes M1 löscht in allen fünf Eimern, message-attachments eingeschlossen.
--   e) Abgelaufene Sperre (M4) und banned = false mit Ende in der Zukunft (M5) hindern nicht.
--   f) Struktur: Regel "Sperre: nichts loeschen" steht in pg_policies, RESTRICTIVE, DELETE, nur {authenticated}.
--      f1b/f1c: die Bedingung nennt die drei Freiliste-Eimer und keinen gesperrten Eimer.
--      f1b und f1c sind reine TEXTPRÜFUNGEN auf pg_policies.qual (like). Sie können brechen, wenn Postgres die Bedingung in
--      anderer Form ausgibt. Bestehen beweist bei ihnen KEIN Verhalten. Die Zusage, die die RICHTUNG der Bedingung
--      tatsächlich bewacht, ist g2 (zukunft-neuer-eimer), belegt durch die Mutation Sperrliste
--      "bucket_id not in ('message-attachments', 'page-media', 'project-images') or not me_banned()".
--      Lauf des Koordinators: 84 Zusagen, Exit 0. Mutationen, alle gefangen: Sperrliste mit einem Eimer (c3), page-media in
--      der Freiliste (c3), avatars aus der Freiliste (c1, der Löschweg des Kontos ist bewacht), Sperrliste mit allen drei
--      Eimern (f1b; mit stillgelegtem f1b rot g2).
--      f4/f5: anon und service_role mit der Kennung des gesperrten M2 löschen in message-attachments. Die Sperre trifft sie nicht.
--   g) xyntal-app-files bleibt frei (Freiliste). g2 UMGEDREHT: zukunft-neuer-eimer ist für gesperrtes M2 GESPERRT
--      (vorher "fail-open, bleibt löschbar"). Das ist der Beleg für die Richtung der Bedingung (siehe Block g).
--   k) Die Sperre nimmt nur das LÖSCHEN. Gesperrtes M2 liest eigene Dateien und legt neue an. KEINE Zusage über die Regel:
--      Lesen und Anlegen kommen von Stellvertretern, und durch keine Mutation an der Regel wird k rot. Die echte Upload-Sperre
--      (20261118260000) ist NICHT geladen; in der Produktion können gesperrte Mitglieder in page-media nicht hochladen.
--      Die Ausnahme für xyntal-app-files (g1) ist ebenfalls Stellvertreter-gestützt, siehe Block g.
--   h) Der Trigger ist scharf (gemessener Rumpf): ohne gesetzte Einstellung wirft jedes Löschen mit SQLSTATE 42501 (h1).
--      Gegenprobe: mit gesetzter Einstellung gelingt es (h3).
--   i) bucket_id NULL: gesperrtes M2 löscht nicht (ok:0), nicht gesperrtes M1 löscht (ok:1). NULL zählt als nicht erlaubt.
--      Die Erlaubnis kommt hier von einem STELLVERTRETER (bucket_id is null), nicht von einer echten Regel.
--   j) Admin-Weg (Datei): nicht gesperrter Admin A1 löscht die Datei eines gesperrten Mitglieds (ok:1). Gesperrter Admin A2
--      scheitert an der eigenen Datei (ok:0). Für A2 ist is_admin() false, der Eigentümer-Weg wäre offen, nur die Sperre trifft.
--      Die Sichtbarkeit für Admins kommt von einem STELLVERTRETER, als TEST markiert (siehe Kopf von
--      tests/sperre_anhang_zeile.sql, Vorbehalt Admin). Die echten Lesen-Regeln für storage.objects kennen für
--      message-attachments keinen Admin. j1 belegt damit nur die Löschregel, kein Produktionsverhalten.
--      Die gemessene Semantik (Messung des Koordinators) gilt für public.message_attachments. Für storage.objects
--      ist sie NICHT gemessen, sie wird hier nur übernommen.
--
-- KULISSE, NICHT GEPRÜFT. Diese Zusagen belegen sie nicht:
--   "2FA erzwingen" (restriktiv, for all) hängt an keiner Zusage. Der Prüfer hat sie neutralisiert, der Test blieb grün.
--   mfa_ok() ist in dieser Testsitzung immer wahr (keine Faktoren), eine 2FA-Zusage gibt es also nicht.
-- NICHT ABGEDECKT, geprüft auf andere Weise: der Abbruchpfad der Eimer-Prüfung in der Migration 20261118290000 (ein in der
--   Regel genannter Eimer fehlt in storage.buckets, oder die Regel fehlt, oder die Bedingung nennt keinen Eimernamen). Ein
--   Abbruch in der Migration beendet den ganzen Testlauf, also kann dieser Test ihn nicht als Zusage zeigen. Geprüft wird er
--   vom Koordinator durch eine Mutation (Freiliste mit einem falsch geschriebenen Eimernamen, Migration muss abbrechen).
-- UNERREICHBAR, NICHT ENTFERNT. Der Erfolgszweig "return 'ok:' || n" in test_delete_guard ist toter Code. h1 setzt
--   test_allow(false), also löst jedes Löschen dort die Ausnahme aus. Der Zweig bleibt stehen, weil er nichts kostet.
--
-- LEHREN, eingehalten:
--   Die Standardrechte (alter default privileges) stehen VOR allen Tabellen und Funktionen.
--   test_check prüft "is not true". Vergleiche laufen über "is not distinct from", damit NULL nicht besteht.
--   Keine Zusage bei leerer Menge: jede Löschzusage hat eine Vorbedingung, dass die Datei vorher existiert (test_count = 1).
--     Ohne sie wäre "ok:0" ein falscher Beleg, weil eine fehlende Datei dasselbe ergibt wie eine Sperre.
--   Die Kennung wird vor jedem Block ausdrücklich gesetzt (test_login) und die Rolle per "set role" umgestellt.
--   test_expect prüft Rolle und Kennung nach dem Rollenwechsel. Am Ende jeder Gruppe steht "reset role".
--   Jeder Stellvertreter wird am Ende seines Blocks wieder entfernt.
--   Löschen per RLS meldet KEINEN Fehler, sondern 0 Zeilen. Deshalb zählt test_delete die Zeilen (ok:n), nicht den SQLSTATE.
--   Der Trigger-Fehler (42501) fängt test_delete NICHT ab, er bricht den Lauf ab. Nur h1 fängt ihn mit test_delete_guard ab,
--   und zwar mit SQLSTATE. So sieht ein Trigger-Abbruch nie aus wie eine RLS-Ablehnung.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser (in der lokalen Testdatenbank postgres):
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/sperre_nichts_loeschen.sql
\set ON_ERROR_STOP on

-- Testkennungen (UUIDs, kein echtes Konto)
\set M1 '00000000-0000-0000-0000-000000000001'
\set M2 '00000000-0000-0000-0000-000000000002'
\set M3 '00000000-0000-0000-0000-000000000003'
\set M4 '00000000-0000-0000-0000-000000000004'
\set M5 '00000000-0000-0000-0000-000000000005'
\set A1 '00000000-0000-0000-0000-000000000006'
\set A2 '00000000-0000-0000-0000-000000000007'

set datestyle = 'ISO, YMD';

-- Rollen: in Supabase immer vorhanden. In einer leeren Testdatenbank müssen sie angelegt werden.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- Standardrechte wie in Supabase, VOR allen Tabellen und Funktionen. Ausführen als postgres.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- auth (nachgebildet) ----------
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);

-- ---------- storage.objects (wie tests/sperre_uploads.sql, dort gemessen) ----------
create table storage.objects (
  id                uuid        not null default gen_random_uuid(),
  bucket_id         text,
  name              text,
  owner             uuid,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  metadata          jsonb,
  path_tokens       text[],
  version           text,
  owner_id          text,
  user_metadata     jsonb,
  archived_at       timestamptz,
  is_delete_marker  boolean     not null default false,
  is_versioned      boolean     not null default false
);
alter table storage.objects enable row level security;
-- Rechte: GEMESSEN, tabellenweit (wie in tests/sperre_uploads.sql).
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on storage.objects to service_role;

-- ---------- storage.buckets (nachgebildet, nur id und name) ----------
-- Die Migration 20261118290000 prüft, dass die drei Freiliste-Eimer in storage.buckets existieren. Hier werden sie angelegt.
--   Eingetragen sind die Eimer, die der Test benutzt. Gesetzt in der Produktion: avatars (005_profile_avatars.sql Zeile 9),
--   banners (20261107120000_card_banners_premium.sql Zeile 87), xyntal-app-files (Produktion, gemessen).
create table storage.buckets (id text primary key, name text, public boolean not null default false);
insert into storage.buckets (id, name) values
  ('avatars', 'avatars'), ('banners', 'banners'), ('xyntal-app-files', 'xyntal-app-files'),
  ('message-attachments', 'message-attachments'), ('page-media', 'page-media'), ('project-images', 'project-images');

-- NACHGEBILDET, nicht gemessen: Ordner-Funktion. Die Regeln nutzen nur [1], für 'M2/datei.jpg' also 'M2'.
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- ---------- Trigger protect_objects_delete (GEMESSEN, nicht nachgebaut) ----------
-- Rumpf und Trigger wörtlich aus der Produktionsdatenbank.
-- Der Trigger feuert FOR EACH STATEMENT, also einmal pro DELETE-Anweisung, unabhängig von der Zeilenzahl, auch bei
--   "delete ... where false". Das unterscheidet ihn von den Zeilen-Triggern der anderen Tests.
-- WICHTIG: Das "RETURN NULL" am Ende hat KEINE abbrechende Wirkung. Bei einem Trigger auf Anweisungsebene wird der
--   Rückgabewert ignoriert. Der einzige Schutz ist das RAISE EXCEPTION. Das ist kein zweiter Mechanismus.
-- Fehler: SQLSTATE 42501. test_delete fängt ihn nicht ab. Nur test_delete_guard in Block h fängt ihn ab.
create or replace function storage.protect_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Check if storage.allow_delete_query is set to 'true'
    IF COALESCE(current_setting('storage.allow_delete_query', true), 'false') != 'true' THEN
        RAISE EXCEPTION 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
            USING HINT = 'This prevents accidental data loss from orphaned objects.',
                  ERRCODE = '42501';
    END IF;
    RETURN NULL;
END;
$function$;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();

-- ---------- public: Tabellen (nachgebildet) ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  is_admin      boolean not null default false,
  is_premium    boolean not null default false,
  plan          text not null default 'free',
  created_at    timestamptz not null default now()
);
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
alter table public.profiles enable row level security;
-- Zeilenschutz vereinfacht: nur der Zweig für die eigene Zeile (nachgebildet).
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (id = (select auth.uid()));

-- ---------- public: Funktionen (wörtlich, Herkunft im Kopf) ----------
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

create or replace function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;
revoke execute on function public.ban_active(boolean, timestamptz) from public;
grant execute on function public.ban_active(boolean, timestamptz) to anon, authenticated;

create or replace function public.me_banned()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and public.ban_active(banned, banned_until));
$$;
revoke execute on function public.me_banned() from public, anon;
grant execute on function public.me_banned() to authenticated, service_role;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and not public.ban_active(banned, banned_until) from public.profiles where id = auth.uid()), false) and public.mfa_ok();
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------- Bestehende Regeln auf storage.objects (wörtlich) ----------
-- 2FA erzwingen (restriktiv, für alle Befehle; gilt also auch für DELETE)
drop policy if exists "2FA erzwingen" on storage.objects;
create policy "2FA erzwingen" on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- STELLVERTRETER, nicht wörtlich: Sichtbarkeit eigener Zeilen (erster Zweig der echten Lesen-Regeln).
--   Ohne eine SELECT-Regel sieht authenticated keine Zeile, und DELETE träfe nichts.
drop policy if exists "TEST Stellvertreter lesen (eigener Ordner)" on storage.objects;
create policy "TEST Stellvertreter lesen (eigener Ordner)" on storage.objects for select to authenticated
  using ((storage.foldername(name))[1] = (select auth.uid())::text);

-- Die fünf erlaubenden Löschregeln (wörtlich, je Herkunft im Kopf)
drop policy if exists "Xyntal Profilbilder entfernen" on storage.objects;
create policy "Xyntal Profilbilder entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));

drop policy if exists "Xyntal Banner entfernen" on storage.objects;
create policy "Xyntal Banner entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'banners' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));

drop policy if exists "Xyntal Seitenbild entfernen" on storage.objects;
create policy "Xyntal Seitenbild entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'page-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Xyntal Nachrichtenanhänge entfernen" on storage.objects;
create policy "Xyntal Nachrichtenanhänge entfernen" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

drop policy if exists "Xyntal Projektbilder entfernen" on storage.objects;
create policy "Xyntal Projektbilder entfernen" on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));

-- ---------- Testfunktionen (nur in dieser Testdatenbank) ----------
-- "is not true" besteht nur bei echtem true. NULL besteht nicht.
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;

-- Setzt die Kennung der Sitzung. Die Rolle stellt der Aufrufer per "set role" um.
create function public.test_login(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  perform set_config('request.jwt.claims', case when coalesce(p_uid, '') = '' then '{}'
    else json_build_object('sub', p_uid, 'aal', 'aal1')::text end, false);
end $$;

-- Prüft Rolle UND Kennung. Nach jedem Rollenwechsel aufrufen.
create function public.test_expect(p_role text, p_uid text, msg text) returns void language plpgsql as $$
begin
  if current_user::text is distinct from p_role
     or coalesce(auth.uid()::text, '') is distinct from coalesce(p_uid, '') then
    raise exception 'TEST FEHLGESCHLAGEN (%): Rolle "%" (erwartet "%"), Kennung "%" (erwartet "%")',
      msg, current_user::text, p_role, coalesce(auth.uid()::text, ''), coalesce(p_uid, '');
  end if;
  raise notice 'OK: %', msg;
end $$;

-- Legt eine Datei an. Nur als postgres aufrufen (Eigentümer umgeht RLS).
create function public.test_seed(p_bucket text, p_name text) returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata) values (p_bucket, p_name, jsonb_build_object('size', 1000));
end $$;

-- Zählt die Zeilen als postgres, also ohne RLS. Prüft, ob eine Datei wirklich da ist oder entfernt wurde.
create function public.test_count(p_bucket text, p_name text) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id = p_bucket and name = p_name;
$$;

-- Setzt die Einstellung, die der Trigger prüft. true = Löschen erlaubt, false = Einstellung leer.
create function public.test_allow(p_on boolean) returns void language plpgsql as $$
begin
  perform set_config('storage.allow_delete_query', case when p_on then 'true' else '' end, false);
end $$;

-- Löscht eine Datei. Ergebnis: 'ok:n' mit der Zeilenzahl. RLS meldet keinen Fehler, sondern 0 Zeilen.
create function public.test_delete(p_bucket text, p_name text) returns text language plpgsql as $$
declare n integer;
begin
  delete from storage.objects where bucket_id = p_bucket and name = p_name;
  get diagnostics n = row_count;
  return 'ok:' || n;
end $$;

-- Wie test_delete, fängt aber jeden Fehler ab und gibt den SQLSTATE zurück. Nur für den Trigger-Test in Block h.
create function public.test_delete_guard(p_bucket text, p_name text) returns text language plpgsql as $$
declare n integer;
begin
  delete from storage.objects where bucket_id = p_bucket and name = p_name;
  get diagnostics n = row_count;
  return 'ok:' || n;
exception when others then
  return 'raised:' || SQLSTATE;
end $$;

-- Zählt und löscht Dateien mit bucket_id NULL. Der Standardfall test_delete mit "bucket_id = p_bucket" trifft NULL nie.
create function public.test_count_null(p_name text) returns bigint language sql stable as $$
  select count(*) from storage.objects where bucket_id is null and name = p_name;
$$;

create function public.test_delete_null(p_name text) returns text language plpgsql as $$
declare n integer;
begin
  delete from storage.objects where bucket_id is null and name = p_name;
  get diagnostics n = row_count;
  return 'ok:' || n;
end $$;

-- ---------- Testdaten (nur in dieser Testdatenbank) ----------
-- M1 frei. M2 Premium, unbefristet gesperrt. M3 Premium, frei. M4 Premium, Sperre abgelaufen.
-- M5 Premium, banned = false mit Ende in der Zukunft.
insert into auth.users (id, email, email_confirmed_at) values
  (:'M1', 'm1@test.invalid', now()), (:'M2', 'm2@test.invalid', now()), (:'M3', 'm3@test.invalid', now()),
  (:'M4', 'm4@test.invalid', now()), (:'M5', 'm5@test.invalid', now());
insert into public.profiles (id, status, banned, banned_until, is_admin, is_premium, plan) values
  (:'M1', 'approved', false, null, false, false, 'free'),
  (:'M2', 'approved', true, null, false, true, 'Pro'),
  (:'M3', 'approved', false, null, false, true, 'Pro'),
  (:'M4', 'approved', true, now() - interval '1 day', false, true, 'Pro'),
  (:'M5', 'approved', false, now() + interval '1 day', false, true, 'Pro');

-- ---------- a) VORHER: Lücke belegen ----------
\echo == a) VORHER
reset role;
select public.test_check((select public.ban_active(p.banned, p.banned_until) from public.profiles p where p.id = :'M2') is true, 'a0 Vorbedingung: M2 ist gesperrt');
select public.test_allow(true);
select public.test_seed('avatars', :'M2' || '/a-av.jpg');
select public.test_seed('message-attachments', :'M2' || '/a-ma.pdf');
select public.test_seed('project-images', :'M2' || '/a-pi.jpg');
select public.test_check(public.test_count('avatars', :'M2' || '/a-av.jpg') = 1, 'a0 Vorbedingung: Datei in avatars liegt vor');
select public.test_check(public.test_count('message-attachments', :'M2' || '/a-ma.pdf') = 1, 'a0 Vorbedingung: Datei in message-attachments liegt vor');
select public.test_check(public.test_count('project-images', :'M2' || '/a-pi.jpg') = 1, 'a0 Vorbedingung: Datei in project-images liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'a0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.mfa_ok() is true, 'a0 2FA-Regel lässt die Testsitzung durch');
select public.test_check(public.test_delete('avatars', :'M2' || '/a-av.jpg') is not distinct from 'ok:1', 'a1 VORHER: gesperrtes M2 löscht eigene Datei in avatars (Lücke belegt)');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/a-ma.pdf') is not distinct from 'ok:1', 'a2 VORHER: gesperrtes M2 löscht eigene Datei in message-attachments (Lücke belegt)');
select public.test_check(public.test_delete('project-images', :'M2' || '/a-pi.jpg') is not distinct from 'ok:1', 'a3 VORHER: gesperrtes M2 löscht eigene Datei in project-images (Lücke belegt)');
reset role;

-- ---------- Migration laden ----------
\echo == Migration 20261118270000_sperre_nichts_loeschen.sql laden
reset role;
\i supabase/migrations/20261118270000_sperre_nichts_loeschen.sql

-- Neue Fassung: ersetzt die Regel "Sperre: nichts loeschen" durch die Freiliste. Ab hier gilt der Endzustand.
\echo == Migration 20261118290000_sperre_loeschen_freiliste.sql laden (ersetzt die Regel)
reset role;
\i supabase/migrations/20261118290000_sperre_loeschen_freiliste.sql

-- ---------- b) NACHHER: gesperrtes M2 scheitert in message-attachments ----------
\echo == b) NACHHER
reset role;
select public.test_allow(true);
select public.test_seed('message-attachments', :'M2' || '/b-ma.pdf');
select public.test_check(public.test_count('message-attachments', :'M2' || '/b-ma.pdf') = 1, 'b0 Vorbedingung: Datei in message-attachments liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/b-ma.pdf') is not distinct from 'ok:0', 'b1 NACHHER: gesperrtes M2 löscht in message-attachments nichts (0 Zeilen)');
reset role;
select public.test_check(public.test_count('message-attachments', :'M2' || '/b-ma.pdf') = 1, 'b2 Gegenprobe: Datei liegt noch, die Sperre hat sie nicht entfernt');
-- b3/b4: Ursache belegen. Entsperrt gelingt derselbe Versuch; wieder gesperrt scheitert er erneut.
update public.profiles set banned = false, banned_until = null where id = :'M2';
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b3 Sitzung: gesperrtes M2 als authenticated (entsperrt)');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/b-ma.pdf') is not distinct from 'ok:1', 'b3 Gegenprobe: entsperrt gelingt derselbe Löschversuch (die Ursache ist die Sperre)');
reset role;
update public.profiles set banned = true, banned_until = null where id = :'M2';
select public.test_seed('message-attachments', :'M2' || '/b-ma2.pdf');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b4 Sitzung: gesperrtes M2 als authenticated (wieder gesperrt)');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/b-ma2.pdf') is not distinct from 'ok:0', 'b4 wieder gesperrt: scheitert erneut');
reset role;

-- ---------- c) gesperrtes M2: avatars und banners löschen weiter, page-media und project-images nicht ----------
-- c1/c2 (avatars, banners): UNVERÄNDERT. Zusage: gesperrtes M2 löscht WEITER. Sie schützt den Löschweg des Kontos:
--   public/pages/profil.js Zeile 371 ruft deleteMemberAvatars() unmittelbar vor delete_my_account() auf, und
--   public/avatars.js Zeile 90-93 entfernt genau avatars und banners. Scheitert das Entfernen, wirft die Funktion, und das
--   Konto bleibt bestehen. Deshalb stehen beide in der Freiliste.
-- c3/c4 (page-media, project-images): UMGEDREHT. Vorher zusichert: "gesperrtes M2 löscht WEITER in page-media" (ok:1) und
--   "gesperrtes M2 löscht WEITER in project-images" (ok:1). Jetzt ok:0. Grund: Die Freiliste nennt nur avatars, banners und
--   xyntal-app-files. Die Sperre soll ALLE Löschungen eines gesperrten Mitglieds erfassen, außer den Eimern, die der
--   Löschweg der Kontolöschung braucht. page-media und project-images werden bei der Kontolöschung nicht abgeräumt, also
--   bricht ihre Sperre die Kontolöschung nicht.
\echo == c) gesperrtes M2: avatars und banners weiter, page-media und project-images gesperrt
reset role;
select public.test_seed('avatars', :'M2' || '/c-av.jpg');
select public.test_seed('banners', :'M2' || '/c-ba.jpg');
select public.test_seed('page-media', :'M2' || '/c-sp.jpg');
select public.test_seed('project-images', :'M2' || '/c-pi.jpg');
select public.test_check(public.test_count('avatars', :'M2' || '/c-av.jpg') = 1, 'c0 Vorbedingung: Datei in avatars liegt vor');
select public.test_check(public.test_count('banners', :'M2' || '/c-ba.jpg') = 1, 'c0 Vorbedingung: Datei in banners liegt vor');
select public.test_check(public.test_count('page-media', :'M2' || '/c-sp.jpg') = 1, 'c0 Vorbedingung: Datei in page-media liegt vor');
select public.test_check(public.test_count('project-images', :'M2' || '/c-pi.jpg') = 1, 'c0 Vorbedingung: Datei in project-images liegt vor');
select public.test_allow(true);
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'c0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_delete('avatars', :'M2' || '/c-av.jpg') is not distinct from 'ok:1', 'c1 Gegenprobe: gesperrtes M2 löscht WEITER in avatars (Löschweg des Kontos)');
select public.test_check(public.test_delete('banners', :'M2' || '/c-ba.jpg') is not distinct from 'ok:1', 'c2 Gegenprobe: gesperrtes M2 löscht WEITER in banners (Löschweg des Kontos)');
-- c3 UMGEDREHT (vorher: 'c3 Gegenprobe: gesperrtes M2 löscht WEITER in page-media', ok:1). Jetzt gesperrt, siehe Kopf von Block c.
select public.test_check(public.test_delete('page-media', :'M2' || '/c-sp.jpg') is not distinct from 'ok:0', 'c3 UMGEDREHT: gesperrtes M2 löscht in page-media NICHTS (vorher WEITER, ok:1)');
-- c4 UMGEDREHT (vorher: 'c4 Gegenprobe: gesperrtes M2 löscht WEITER in project-images', ok:1). Jetzt gesperrt, siehe Kopf von Block c.
select public.test_check(public.test_delete('project-images', :'M2' || '/c-pi.jpg') is not distinct from 'ok:0', 'c4 UMGEDREHT: gesperrtes M2 löscht in project-images NICHTS (vorher WEITER, ok:1)');
reset role;
-- c5/c6: Gegenprobe zu c3/c4. Die Dateien liegen noch, die Sperre hat sie nicht entfernt.
select public.test_check(public.test_count('page-media', :'M2' || '/c-sp.jpg') = 1, 'c5 Gegenprobe: Datei in page-media liegt noch (Sperre)');
select public.test_check(public.test_count('project-images', :'M2' || '/c-pi.jpg') = 1, 'c6 Gegenprobe: Datei in project-images liegt noch (Sperre)');

-- ---------- d) Nicht gesperrtes M1 löscht in allen fünf Eimern ----------
\echo == d) nicht gesperrtes M1
reset role;
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M1') is true, 'd0 Vorbedingung: M1 ist nicht gesperrt');
select public.test_seed('avatars', :'M1' || '/d-av.jpg');
select public.test_seed('banners', :'M1' || '/d-ba.jpg');
select public.test_seed('page-media', :'M1' || '/d-sp.jpg');
select public.test_seed('project-images', :'M1' || '/d-pi.jpg');
select public.test_seed('message-attachments', :'M1' || '/d-ma.pdf');
select public.test_check(public.test_count('message-attachments', :'M1' || '/d-ma.pdf') = 1, 'd0 Vorbedingung: Datei in message-attachments liegt vor');
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'd0 Sitzung: nicht gesperrtes M1 als authenticated');
select public.test_check(public.test_delete('avatars', :'M1' || '/d-av.jpg') is not distinct from 'ok:1', 'd1 nicht gesperrtes M1 löscht in avatars');
select public.test_check(public.test_delete('banners', :'M1' || '/d-ba.jpg') is not distinct from 'ok:1', 'd2 nicht gesperrtes M1 löscht in banners');
select public.test_check(public.test_delete('page-media', :'M1' || '/d-sp.jpg') is not distinct from 'ok:1', 'd3 nicht gesperrtes M1 löscht in page-media');
select public.test_check(public.test_delete('project-images', :'M1' || '/d-pi.jpg') is not distinct from 'ok:1', 'd4 nicht gesperrtes M1 löscht in project-images');
select public.test_check(public.test_delete('message-attachments', :'M1' || '/d-ma.pdf') is not distinct from 'ok:1', 'd5 nicht gesperrtes M1 löscht in message-attachments (Sperre trifft nur Gesperrte)');
reset role;

-- ---------- e) Abgelaufene Sperre und Sperre mit Ende in der Zukunft hindern nicht ----------
\echo == e) abgelaufene Sperre (M4) und banned = false mit Ende (M5)
reset role;
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M4') is true, 'e0 Vorbedingung: M4 ist nicht mehr gesperrt (Sperre abgelaufen)');
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M5') is true, 'e0 Vorbedingung: M5 ist nicht gesperrt (banned = false)');
select public.test_seed('message-attachments', :'M4' || '/e4-ma.pdf');
select public.test_seed('message-attachments', :'M5' || '/e5-ma.pdf');
select public.test_check(public.test_count('message-attachments', :'M4' || '/e4-ma.pdf') = 1, 'e0 Vorbedingung: Datei von M4 liegt vor');
select public.test_check(public.test_count('message-attachments', :'M5' || '/e5-ma.pdf') = 1, 'e0 Vorbedingung: Datei von M5 liegt vor');
select public.test_login(:'M4');
set role authenticated;
select public.test_expect('authenticated', :'M4', 'e0 Sitzung: M4 als authenticated');
select public.test_check(public.test_delete('message-attachments', :'M4' || '/e4-ma.pdf') is not distinct from 'ok:1', 'e1 abgelaufene Sperre hindert nicht: M4 löscht in message-attachments');
reset role;
select public.test_login(:'M5');
set role authenticated;
select public.test_expect('authenticated', :'M5', 'e0 Sitzung: M5 als authenticated');
select public.test_check(public.test_delete('message-attachments', :'M5' || '/e5-ma.pdf') is not distinct from 'ok:1', 'e2 banned = false mit Ende in der Zukunft hindert nicht: M5 löscht in message-attachments');
reset role;

-- ---------- f) Struktur der Regel und Verhalten für anon und service_role ----------
\echo == f) Regel in pg_policies und Rollen
reset role;
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts loeschen') = 1, 'f0 Vorbedingung: genau eine Regel "Sperre: nichts loeschen" auf storage.objects');
select public.test_check(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts loeschen' and permissive = 'RESTRICTIVE' and cmd = 'DELETE' and roles = array['authenticated']::name[]), 'f1 Regel "Sperre: nichts loeschen" ist RESTRICTIVE, DELETE, nur {authenticated}');
-- f1b/f1c: Bedingung der Freiliste. Die Regel nennt die drei Eimer avatars, banners, xyntal-app-files und me_banned().
--   f1c: sie nennt KEINEN der gesperrten Eimer. Die Prüfung über den Text ist grob. Sie fängt aber die alte Sperrliste ab:
--   deren Bedingung nennt message-attachments, und f1c schlägt dann fehl. f1b schlägt ebenfalls fehl, weil die alte
--   Bedingung keinen der drei Freiliste-Eimer nennt.
--   f1b und f1c sind reine TEXTPRÜFUNGEN auf pg_policies.qual (like). Sie können brechen, wenn Postgres denselben Ausdruck
--   in einer anderen Form ausgibt. Bestehen beweist bei ihnen KEIN Verhalten.
--   Die Zusage, die die RICHTUNG der Bedingung tatsächlich bewacht, ist g2 (zukunft-neuer-eimer). Belegt durch die Mutation
--   Sperrliste "bucket_id not in ('message-attachments', 'page-media', 'project-images') or not me_banned()": c3 und c4
--   bleiben grün, rot wird f1b, und mit stillgelegtem f1b rot wird g2.
select public.test_check(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts loeschen' and qual like '%''avatars''%' and qual like '%''banners''%' and qual like '%''xyntal-app-files''%' and qual like '%me_banned%'), 'f1b Bedingung nennt die drei Freiliste-Eimer avatars, banners, xyntal-app-files und me_banned()');
select public.test_check(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts loeschen' and qual not like '%message-attachments%' and qual not like '%page-media%' and qual not like '%project-images%'), 'f1c Bedingung nennt keinen gesperrten Eimer (message-attachments, page-media, project-images)');
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE' and policyname in ('Xyntal Profilbilder entfernen', 'Xyntal Banner entfernen', 'Xyntal Seitenbild entfernen', 'Xyntal Nachrichtenanhänge entfernen', 'Xyntal Projektbilder entfernen')) = 5, 'f2 die fünf erlaubenden Löschregeln sind noch vorhanden');

-- STELLVERTRETER für anon und service_role. Ohne sie gäbe es nichts zu löschen, und die Gegenprobe wäre leer.
--   Sie sind NICHT die echten Regeln. Sie beweisen nur, dass die Sperre (nur authenticated) diese Rollen nicht trifft.
drop policy if exists "TEST Stellvertreter lesen (anon, service_role)" on storage.objects;
create policy "TEST Stellvertreter lesen (anon, service_role)" on storage.objects for select to anon, service_role using (true);
drop policy if exists "TEST Stellvertreter entfernen (anon, service_role)" on storage.objects;
create policy "TEST Stellvertreter entfernen (anon, service_role)" on storage.objects for delete to anon, service_role using (true);
select public.test_seed('message-attachments', :'M2' || '/f-anon.pdf');
select public.test_seed('message-attachments', :'M2' || '/f-srv.pdf');
select public.test_check(public.test_count('message-attachments', :'M2' || '/f-anon.pdf') = 1, 'f3 Vorbedingung: Datei für anon liegt vor');
select public.test_check(public.test_count('message-attachments', :'M2' || '/f-srv.pdf') = 1, 'f3 Vorbedingung: Datei für service_role liegt vor');
select public.test_login(:'M2');
set role anon;
select public.test_expect('anon', :'M2', 'f4 Sitzung: anon mit der Kennung des gesperrten M2');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/f-anon.pdf') is not distinct from 'ok:1', 'f4 Gegenprobe: anon mit Kennung des gesperrten M2 löscht in message-attachments (Sperre trifft nur authenticated)');
reset role;
select public.test_login(:'M2');
set role service_role;
select public.test_expect('service_role', :'M2', 'f5 Sitzung: service_role mit der Kennung des gesperrten M2');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/f-srv.pdf') is not distinct from 'ok:1', 'f5 Gegenprobe: service_role mit Kennung des gesperrten M2 löscht in message-attachments');
reset role;
drop policy if exists "TEST Stellvertreter lesen (anon, service_role)" on storage.objects;
drop policy if exists "TEST Stellvertreter entfernen (anon, service_role)" on storage.objects;

-- ---------- g) Freiliste: xyntal-app-files frei, jeder nicht genannte Eimer gesperrt ----------
-- zukunft-neuer-eimer ist der NEUE Eimer, der in keiner Liste steht. Er ist eigens für diesen Beleg da und wird nur hier
--   angelegt. Die Stellvertreter-Regel erlaubt das Löschen dort. Was blockiert, ist allein die Sperre.
-- g1 (xyntal-app-files): UNVERÄNDERTES ERGEBNIS, neue BEGRÜNDUNG. Vorher stand: "zweite Anwendung bleibt unberührt, weil sie
--   nicht in der Sperrliste steht". Jetzt steht der Eimer in der Freiliste. Das ist der Eimer der nativen App.
--   KEIN Produktionsverhalten: Die Erlaubnis kommt vom STELLVERTRETER "TEST Stellvertreter entfernen (fremde Eimer)"
--   (Zeile 551-552). g1 belegt nur, dass die Freiliste den Eimer nicht sperrt. Wird xyntal-app-files aus der Freiliste
--   genommen, wird g1 rot. Ob die echte Löschregel des Eimers in der Produktion gesperrte Mitglieder zulässt, belegt g1
--   NICHT. Gemessen (Produktion): Die Regel prüft nur xyntal_app.file_permission(), keine Sperre.
-- g2 (zukunft-neuer-eimer): UMGEDREHT. Vorher zusichert: "gesperrtes M2 löscht in zukunft-neuer-eimer" (ok:1, fail-open,
--   "ein künftiger Eimer ist nicht gesperrt"). Jetzt ok:0. Grund: Die Richtung der Bedingung ist umgekehrt. Eine Freiliste
--   sperrt jeden Eimer, der nicht genannt ist. Ein künftiger Eimer ist damit für ein gesperrtes Mitglied gesperrt, und die
--   Kontolöschung bricht sichtbar ab, falls der Eimer in ihren Löschweg kommt. Stellvertreter-Regel nur für diese zwei
--   Eimer, am Ende entfernt.
\echo == g) Freiliste
reset role;
drop policy if exists "TEST Stellvertreter entfernen (fremde Eimer)" on storage.objects;
create policy "TEST Stellvertreter entfernen (fremde Eimer)" on storage.objects for delete to authenticated
  using (bucket_id in ('xyntal-app-files', 'zukunft-neuer-eimer'));
select public.test_seed('xyntal-app-files', :'M2' || '/g-app.jpg');
select public.test_seed('zukunft-neuer-eimer', :'M2' || '/g-neu.jpg');
select public.test_check(public.test_count('xyntal-app-files', :'M2' || '/g-app.jpg') = 1, 'g0 Vorbedingung: Datei in xyntal-app-files liegt vor');
select public.test_check(public.test_count('zukunft-neuer-eimer', :'M2' || '/g-neu.jpg') = 1, 'g0 Vorbedingung: Datei in zukunft-neuer-eimer liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'g0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_delete('xyntal-app-files', :'M2' || '/g-app.jpg') is not distinct from 'ok:1', 'g1 gesperrtes M2 löscht in xyntal-app-files (Freiliste: nativer Eimer bleibt frei)');
-- g2 UMGEDREHT (vorher ok:1, "fail-open: ein künftiger Eimer ist nicht gesperrt"). Jetzt ok:0, siehe Kopf von Block g.
select public.test_check(public.test_delete('zukunft-neuer-eimer', :'M2' || '/g-neu.jpg') is not distinct from 'ok:0', 'g2 UMGEDREHT: gesperrtes M2 löscht in zukunft-neuer-eimer NICHTS (Freiliste: nicht genannter Eimer ist gesperrt)');
-- g3: Gegenprobe zu g2. Die Datei liegt noch.
select public.test_check(public.test_count('zukunft-neuer-eimer', :'M2' || '/g-neu.jpg') = 1, 'g3 Gegenprobe: Datei in zukunft-neuer-eimer liegt noch (Sperre)');
reset role;
drop policy if exists "TEST Stellvertreter entfernen (fremde Eimer)" on storage.objects;

-- ---------- h) Der Trigger ist scharf ----------
-- Ohne gesetzte Einstellung wirft jedes Löschen. Eine Gegenprobe zeigt, dass nur die Einstellung den Unterschied macht.
\echo == h) Trigger
reset role;
select public.test_check(exists (select 1 from pg_trigger where tgrelid = 'storage.objects'::regclass and tgname = 'protect_objects_delete' and not tgisinternal), 'h0 Vorbedingung: Trigger protect_objects_delete existiert auf storage.objects');
select public.test_seed('avatars', :'M3' || '/h-av.jpg');
select public.test_check(public.test_count('avatars', :'M3' || '/h-av.jpg') = 1, 'h0 Vorbedingung: Datei von M3 in avatars liegt vor');
select public.test_allow(false);
select public.test_login(:'M3');
set role authenticated;
select public.test_expect('authenticated', :'M3', 'h0 Sitzung: M3 als authenticated');
select public.test_check(public.test_delete_guard('avatars', :'M3' || '/h-av.jpg') is not distinct from 'raised:42501', 'h1 Trigger scharf: ohne storage.allow_delete_query wirft das Löschen mit SQLSTATE 42501 (M3, nicht gesperrt)');
reset role;
select public.test_check(public.test_count('avatars', :'M3' || '/h-av.jpg') = 1, 'h2 Gegenprobe: die Zeile liegt noch, nichts wurde gelöscht');
select public.test_allow(true);
select public.test_login(:'M3');
set role authenticated;
select public.test_check(public.test_delete('avatars', :'M3' || '/h-av.jpg') is not distinct from 'ok:1', 'h3 Gegenprobe: mit gesetzter Einstellung gelingt dasselbe Löschen');
reset role;

-- ---------- i) bucket_id NULL: gesperrt darf nicht löschen, nicht gesperrt darf ----------
-- Die Freiliste "bucket_id in ('avatars', 'banners', 'xyntal-app-files') or not me_banned()" ergibt bei bucket_id NULL für
--   gesperrtes M2: NULL in (...) ist NULL, NULL or false ist NULL. NULL zählt als nicht erlaubt. (Vorher stand hier die
--   Sperrliste "bucket_id <> 'message-attachments' or not me_banned()"; das Ergebnis für NULL ist dasselbe.)
-- Erlaubt wird hier nur durch einen STELLVERTRETER (bucket_id is null). Er ist NICHT wörtlich und wird am Ende entfernt.
\echo == i) bucket_id NULL
reset role;
drop policy if exists "TEST Stellvertreter entfernen (bucket NULL)" on storage.objects;
create policy "TEST Stellvertreter entfernen (bucket NULL)" on storage.objects for delete to authenticated
  using (bucket_id is null);
select public.test_allow(true);
select public.test_seed(null, :'M2' || '/i-m2.jpg');
select public.test_seed(null, :'M1' || '/i-m1.jpg');
select public.test_check(public.test_count_null(:'M2' || '/i-m2.jpg') = 1, 'i0 Vorbedingung: Datei mit bucket_id NULL von M2 liegt vor');
select public.test_check(public.test_count_null(:'M1' || '/i-m1.jpg') = 1, 'i0 Vorbedingung: Datei mit bucket_id NULL von M1 liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'i0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_delete_null(:'M2' || '/i-m2.jpg') is not distinct from 'ok:0', 'i1 gesperrtes M2 löscht Datei mit bucket_id NULL nicht (NULL zählt als nicht erlaubt)');
reset role;
select public.test_check(public.test_count_null(:'M2' || '/i-m2.jpg') = 1, 'i2 Gegenprobe: Datei von M2 liegt noch');
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'i0 Sitzung: nicht gesperrtes M1 als authenticated');
select public.test_check(public.test_delete_null(:'M1' || '/i-m1.jpg') is not distinct from 'ok:1', 'i3 Gegenprobe: nicht gesperrtes M1 löscht Datei mit bucket_id NULL');
reset role;
drop policy if exists "TEST Stellvertreter entfernen (bucket NULL)" on storage.objects;

-- ---------- j) Admin-Weg für Dateien ----------
-- A1: Admin, nicht gesperrt. A2: Admin, gesperrt. Die Sichtbarkeit für Admins kommt von einem STELLVERTRETER
-- (siehe Kopf, KULISSE/Vorbehalt). Die echten Lesen-Regeln für storage.objects kennen für message-attachments keinen Admin.
\echo == j) Admin-Weg (Datei)
reset role;
insert into auth.users (id, email, email_confirmed_at) values
  (:'A1', 'a1@test.invalid', now()), (:'A2', 'a2@test.invalid', now());
insert into public.profiles (id, status, banned, banned_until, is_admin, is_premium, plan) values
  (:'A1', 'approved', false, null, true, true, 'Pro'),
  (:'A2', 'approved', true, null, true, true, 'Pro');
select public.test_seed('message-attachments', :'M2' || '/j-m2.pdf');
select public.test_seed('message-attachments', :'A2' || '/j-a2.pdf');
select public.test_check(public.test_count('message-attachments', :'M2' || '/j-m2.pdf') = 1, 'j0 Vorbedingung: Datei von gesperrtem M2 in message-attachments liegt vor');
select public.test_check(public.test_count('message-attachments', :'A2' || '/j-a2.pdf') = 1, 'j0 Vorbedingung: Datei von gesperrtem Admin A2 in message-attachments liegt vor');
drop policy if exists "TEST Stellvertreter Admin lesen (storage)" on storage.objects;
create policy "TEST Stellvertreter Admin lesen (storage)" on storage.objects for select to authenticated
  using ((select public.is_admin()));
select public.test_login(:'A1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'j0 Sitzung: A1 als authenticated');
select public.test_check(public.is_admin() is true, 'j0 Vorbedingung: A1 ist Admin und nicht gesperrt (is_admin)');
select public.test_check(public.test_delete('message-attachments', :'M2' || '/j-m2.pdf') is not distinct from 'ok:1', 'j1 nicht gesperrter Admin A1 löscht die Datei des gesperrten M2');
reset role;
select public.test_login(:'A2');
set role authenticated;
select public.test_expect('authenticated', :'A2', 'j0 Sitzung: gesperrter A2 als authenticated');
select public.test_check(public.is_admin() is false, 'j0 Vorbedingung: is_admin() ist für gesperrten A2 false');
select public.test_check(public.test_delete('message-attachments', :'A2' || '/j-a2.pdf') is not distinct from 'ok:0', 'j2 gesperrter Admin A2 scheitert an der eigenen Datei (nur die Sperre trifft)');
reset role;
drop policy if exists "TEST Stellvertreter Admin lesen (storage)" on storage.objects;

-- ---------- k) Die Sperre nimmt nur das LÖSCHEN, nicht das Lesen oder Anlegen ----------
-- WICHTIG: Dieser Block trägt KEINE Zusage über die Regel "Sperre: nichts loeschen". Er wird durch keine Mutation an ihr rot.
--   Eine FOR-DELETE-Regel kann SELECT und INSERT konstruktionsbedingt nicht beeinflussen. Die Erlaubnis für Lesen und
--   Anlegen kommt hier aus STELLVERTRETERN (eigener Ordner). Der Block dokumentiert nur den UMFANG der Regel: sie ist
--   FOR DELETE und erfasst INSERT nicht. Er ist eine Tautologie und bleibt, weil er den Umfang festhält.
--   Die echten Lesen- und Upload-Regeln sind hier NICHT geladen.
\echo == k) Lesen und Anlegen
reset role;
drop policy if exists "TEST Stellvertreter anlegen (eigener Ordner)" on storage.objects;
create policy "TEST Stellvertreter anlegen (eigener Ordner)" on storage.objects for insert to authenticated
  with check ((storage.foldername(name))[1] = (select auth.uid())::text);
select public.test_seed('message-attachments', :'M2' || '/k-ma.pdf');
select public.test_seed('page-media', :'M2' || '/k-sp.jpg');
select public.test_check(public.test_count('message-attachments', :'M2' || '/k-ma.pdf') = 1, 'k0 Vorbedingung: Datei in message-attachments liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'k0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_count('message-attachments', :'M2' || '/k-ma.pdf') = 1, 'k1 Lesen (nur Stellvertreter): gesperrtes M2 sieht eigene Datei in message-attachments');
select public.test_check(public.test_count('page-media', :'M2' || '/k-sp.jpg') = 1, 'k2 Lesen (nur Stellvertreter): gesperrtes M2 sieht eigene Datei in page-media');
-- k3: Anlegen. NUR die Löschsperre (FOR DELETE) ist hier geladen, INSERT ist nicht erfasst. Die echte Upload-Sperre
--   (20261118260000, Zeile 79) ist in diesem Test NICHT geladen. In der PRODUKTION können gesperrte Mitglieder in page-media
--   NICHT hochladen. Diese Zeile belegt das nicht.
insert into storage.objects (bucket_id, name, metadata) values ('page-media', :'M2' || '/k-neu.jpg', jsonb_build_object('size', 1000));
reset role;
select public.test_check(public.test_count('page-media', :'M2' || '/k-neu.jpg') = 1, 'k3 Anlegen (nur Stellvertreter, NUR Löschsperre geladen, INSERT nicht erfasst; echte Upload-Sperre 20261118260000 NICHT geladen): Datei in page-media angelegt');
drop policy if exists "TEST Stellvertreter anlegen (eigener Ordner)" on storage.objects;

\echo == Ende: alle Blöcke durchgelaufen
