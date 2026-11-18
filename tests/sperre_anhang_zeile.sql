-- Sperre wirkt auf das LÖSCHEN DER ZEILE in public.message_attachments.
-- Gehört zu supabase/migrations/20261118280000_sperre_anhang_zeile.sql. Warum diese Regel KEINE Ausnahme für die
-- Kontolöschung hat, steht im Kopf dieser Migration. Die Datei-Seite (storage.objects) prüft tests/sperre_nichts_loeschen.sql.
--
-- NACHGEBILDET, nicht aus der Produktion gelesen:
--   auth.users, auth.uid(), auth.jwt(), auth.mfa_factors: wie in tests/sperre_nichts_loeschen.sql.
--   public.profiles: nur die Spalten, die die Regeln lesen. Zeilenschutz "Profile lesen" vereinfacht (eigene Zeile).
--   public.messages: Spalten und Fremdschlüssel wie in supabase/003_community.sql, Zeile 60-67 (sender_id mit
--     default auth.uid() und on delete cascade). KEIN Zeilenschutz nachgebildet. Die Löschregel prüft nur m.sender_id.
--   public.message_attachments: Tabelle wie in 20261028140000_message_features.sql ab Zeile 286, ohne den Trigger
--     message_attachments_validate. Rechte wie in 20261117150000_tabellenrechte_zurueck.sql, Zeile 145-149.
--   public.mfa_ok(), ban_active(), me_banned(), is_admin(): WÖRTLICH aus dem Repo (Herkunft wie in
--     tests/sperre_nichts_loeschen.sql, Kopf).
--   TEST-STELLVERTRETUNG auf auth.users (nur in Block g, nicht wörtlich): Eigene Zeile lesen und löschen für authenticated,
--     und die Funktion test_eltern_loeschen() als INVOKER (kein Definer). In Supabase darf authenticated auth.users nicht
--     löschen. Das echte Konto löscht delete_my_account (SECURITY DEFINER, Eigner postgres, rolbypassrls, siehe Migration).
--     Die Stellvertretung ist nötig, damit das Eltern-Löschen überhaupt als authenticated läuft.
--
-- WÖRTLICH AUS DEM REPO:
--   "Anhänge lesen"             supabase/migrations/20261028140000_message_features.sql, Zeile 356-365
--   "Eigene Anhänge entfernen"  supabase/migrations/20261028140000_message_features.sql, Zeile 381-391
--   "Sperre: nichts loeschen"   wird über \i aus supabase/migrations/20261118280000_sperre_anhang_zeile.sql geladen.
--
-- GEPRÜFT, jede Zusage mit Gegenprobe (Zeilen in dieser Datei):
--   a) VORHER: gesperrtes M2 löscht seine Anhang-Zeile (ok:1). Lücke belegt.
--   b) NACHHER: gesperrtes M2 löscht sie nicht (ok:0). Gegenprobe: Zeile liegt noch (b2). LESEN bleibt (b3). Entsperrt
--      gelingt derselbe Löschversuch (b4), wieder gesperrt scheitert er (b5). Die Ursache ist die Sperre.
--   c) Gegenprobe: nicht gesperrtes M1 löscht seine Anhang-Zeile (ok:1).
--   d) Abgelaufene Sperre (M4) und banned = false mit Ende in der Zukunft (M5) hindern nicht.
--   e) Nicht gesperrter Admin A1 löscht die Anhang-Zeile eines gesperrten Mitglieds (ok:1). NUR FÜR DIE LÖSCHREGEL BELEGT:
--      die Lese-Sicht des Admins ist eine TEST-Stellvertreterregel (siehe Vorbehalt unten). Kein Produktionsbeleg.
--   f) Gesperrter Admin A2 scheitert an der eigenen Zeile (ok:0). Der Absender-Weg wäre offen, nur die Sperre trifft.
--      Auch f ist nur ein Beleg für die Löschregel. Der Admin-Lesepfad kommt hier nicht vor.
--   g) Kaskade wertet den Zeilenschutz des Kindes NICHT aus, belegt NUR im Testaufbau: Eltern-Löschen direkt als
--      authenticated, ohne Definer und ohne BYPASSRLS. g0: die Sperre verbietet das direkte Löschen der Zeile (ok:0).
--      g1 (M2, gesperrt) und g2 (M3, frei): die Zeilen sind nach dem Eltern-Löschen weg, über
--      auth.users → profiles → messages → message_attachments. Die Eigenschaft in der Produktion steht in der Messung des
--      Koordinators auf der Produktionsdatenbank, nicht in diesem Test.
--   h) Struktur: Regel "Sperre: nichts loeschen" steht in pg_policies, RESTRICTIVE, DELETE, nur {authenticated}.
--
-- VORBEHALT ADMIN, NICHT GELÖST. "Anhänge lesen" (20261028140000, Zeile 356-365) hat keinen Admin-Zweig. Gemessen, Messung
--   des Koordinators (Produktion, zurückgerollte Transaktionen, Wegwerf-Tabelle, Löschen "using (true)", Lesen nur eigene Zeilen):
--     delete from probe where id = 2;   ->  DELETE 0   (fremde Zeile nicht gefunden)
--     delete from probe;                ->  DELETE 2   (ohne where auch die unlesbare)
--   Die Schnittstelle erzeugt immer eine where-Bedingung. Heute kann also kein Admin einen fremden Anhang löschen, das gilt
--   ohne unsere Sperre. Der Befund steht in der Migration, Kopf "ADMIN".
--   In Block e setzt der Test die Stellvertreter-Leseregel "TEST Stellvertreter Admin lesen (message_attachments)" ein.
--   Sie ist NICHT die echte Regel und ist als TEST markiert. Ohne sie wäre der Admin-Weg auch ohne unsere Sperre zu.
--   Der Test belegt damit nur die Löschregel, nicht das Verhalten in der Produktion. Entfernt nach Block e.
--
-- NICHT GEPRÜFT, mit Absicht:
--   Die 2FA-Regel "2FA erzwingen" ist in dieser Datei NICHT geladen. is_admin() prüft mfa_ok(), das in dieser
--   Testsitzung mangels Faktoren immer wahr ist. Eine 2FA-Zusage gibt es hier also nicht.
--   Der Weichlösch-Weg soft_delete_message() (Trigger messages_soft_delete, BEFORE UPDATE OF deleted_at) ist nicht
--   geprüft. Er ist für gesperrte Mitglieder über "Sperre: nichts ändern" (20261109120000) zu, und diese Datei belegt
--   das nicht.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser (in der lokalen Testdatenbank postgres):
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/sperre_anhang_zeile.sql
\set ON_ERROR_STOP on

-- GUARD gegen eine echte Supabase-Datenbank. Die Datei legt auth.users an und vergibt Rechte auf auth.users. Läuft sie
-- gegen eine echte Datenbank, in der auth.users Zeilenschutz hat, schaltet der Erfolgsfall diesen Zeilenschutz dauerhaft
-- ab. Das Aufräumen wäre dann selbst der Schaden. Deshalb steht der Guard hier, vor dem ersten create, und bricht ab,
-- Das ist kein Gedankenspiel: Auf der Produktionsdatenbank hat auth.users echten Zeilenschutz (relrowsecurity = t,
-- gemessen am 18.11.2026). Das Aufräumen in Block g würde dort diesen Zeilenschutz auf der Anmeldetabelle abschalten.
-- Warum ein Guard und keine Zustandsbuchhaltung (pg_class.relrowsecurity merken und zurückschreiben): weniger
-- Maschinerie in einem Test, und der Schadensfall ist danach nicht erreichbar. Zweite Bremse neben "create table
-- auth.users" ohne if not exists (42P07), der Guard greift aber früher und sagt, warum.
-- Warum die Prüfung auf Tabellen in DIESER Datenbank geht und nicht auf pg_roles: Rollen sind clusterweit, Tabellen
-- datenbankweit, und der Schutz, um den es geht (das grant auf auth.users in Block g), wirkt nur in der Datenbank, in
-- der er erteilt wird. Eine Rollenabfrage würde deshalb in beide Richtungen falsch liegen: Wegwerf-Datenbanken im
-- selben Cluster wie die Produktion hätten die Rolle immer, auch wenn sie leer sind; ein Cluster ohne die Rolle würde
-- eine Datenbank mit echten Daten durchlassen. Nicht auf eine Rollenabfrage umstellen.
-- Geprüft wird, ob die Objekte schon da sind, die diese Datei selbst anlegt. Liegt eines davon vor, ist die Datenbank
-- nicht leer, und die Datei würde sie beschädigen.
do $$ begin
  if to_regclass('auth.users') is not null or to_regclass('public.profiles') is not null then
    raise exception 'Diese Datenbank enthält schon Objekte, die diese Testdatei selbst anlegt (auth.users oder public.profiles). Sie ist nicht leer, und die Datei würde sie beschädigen. Bitte eine frische, leere Wegwerf-Datenbank nehmen (create database ... in einem neuen Namen) und die Datei dort ausführen.';
  end if;
end $$;

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
grant usage on schema public, auth to anon, authenticated, service_role;

-- Standardrechte wie in Supabase, VOR allen Tabellen und Funktionen. Ausführen als postgres.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- auth (nachgebildet) ----------
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);

-- ---------- public: Tabellen (nachgebildet, Herkunft im Kopf) ----------
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

-- Nachrichten, wie supabase/003_community.sql Zeile 60-67. Kein Zeilenschutz nachgebildet (siehe Kopf).
create table public.messages (
  id            bigint generated always as identity primary key,
  sender_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(trim(body)) between 1 and 2000),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

-- Anhänge, wie 20261028140000_message_features.sql ab Zeile 286 (ohne Validierungs-Trigger).
create table public.message_attachments (
  id         bigint generated always as identity primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  path       text not null,
  kind       text not null check (kind in ('image', 'video', 'audio', 'file')),
  mime       text not null,
  size       bigint not null check (size > 0 and size <= 52428800),
  name       text not null check (char_length(trim(name)) between 1 and 255),
  width      int,
  height     int,
  duration   numeric,
  created_at timestamptz not null default now(),
  check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$')
);
-- Rechte: wie 20261117150000_tabellenrechte_zurueck.sql, Zeile 145-149.
revoke all on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;
grant insert (message_id, path, kind, mime, size, name, width, height, duration)
  on public.message_attachments to authenticated;
grant delete on public.message_attachments to authenticated;
alter table public.message_attachments enable row level security;

-- ---------- public: Funktionen (wörtlich, Herkunft im Kopf) ----------
-- supabase/017_security.sql, Zeile 17-23
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

-- supabase/migrations/20261103180000_website_ban.sql, Zeile 8-13
create or replace function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;
revoke execute on function public.ban_active(boolean, timestamptz) from public;
grant execute on function public.ban_active(boolean, timestamptz) to anon, authenticated;

-- supabase/migrations/20261109120000_security_hardening.sql, Zeile 86-89
create or replace function public.me_banned()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and public.ban_active(banned, banned_until));
$$;
revoke execute on function public.me_banned() from public, anon;
grant execute on function public.me_banned() to authenticated, service_role;

-- supabase/migrations/20261118250000_is_admin_sperre.sql, Zeile 67-70 (aktuelle Fassung)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and not public.ban_active(banned, banned_until) from public.profiles where id = auth.uid()), false) and public.mfa_ok();
$$;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------- Bestehende Regeln auf public.message_attachments (wörtlich) ----------
-- 20261028140000_message_features.sql, Zeile 356-365
drop policy if exists "Anhänge lesen" on public.message_attachments;
create policy "Anhänge lesen" on public.message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_id
         and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

-- 20261028140000_message_features.sql, Zeile 381-391
drop policy if exists "Eigene Anhänge entfernen" on public.message_attachments;
create policy "Eigene Anhänge entfernen" on public.message_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_id
         and m.sender_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

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

-- Legt Nachricht und Anhang an. Nur als postgres aufrufen (Eigentümer umgeht RLS). Gibt die Anhang-Id zurück.
create function public.test_seed_anhang(p_sender uuid, p_recipient uuid, p_path text) returns bigint language plpgsql as $$
declare v_msg bigint; v_id bigint;
begin
  insert into public.messages (sender_id, recipient_id, body) values (p_sender, p_recipient, 'Test')
    returning id into v_msg;
  insert into public.message_attachments (message_id, path, kind, mime, size, name)
    values (v_msg, p_path, 'file', 'application/pdf', 1000, 'test.pdf')
    returning id into v_id;
  return v_id;
end $$;

-- Zählt Anhang-Zeilen. Als postgres: ohne RLS. Unter "set role authenticated": mit RLS, also die Sicht des Aufrufers.
create function public.test_count_anhang(p_id bigint) returns bigint language sql stable as $$
  select count(*) from public.message_attachments where id = p_id;
$$;

-- Löscht eine Anhang-Zeile. Ergebnis: 'ok:n' mit der Zeilenzahl. RLS meldet keinen Fehler, sondern 0 Zeilen.
create function public.test_loesche_anhang(p_id bigint) returns text language plpgsql as $$
declare n integer;
begin
  delete from public.message_attachments where id = p_id;
  get diagnostics n = row_count;
  return 'ok:' || n;
end $$;

-- Eltern-Löschen als INVOKER: läuft mit den Rechten des Aufrufers (authenticated), NICHT als Definer. Ergebnis 'ok:n'.
create function public.test_eltern_loeschen() returns text language plpgsql as $$
declare n integer;
begin
  delete from auth.users where id = auth.uid();
  get diagnostics n = row_count;
  return 'ok:' || n;
end $$;

-- ---------- Testdaten (nur in dieser Testdatenbank) ----------
-- M1 frei. M2 Premium, unbefristet gesperrt. M3 frei. M4 Sperre abgelaufen. M5 banned = false mit Ende in der Zukunft.
-- A1 Admin, nicht gesperrt. A2 Admin, gesperrt.
insert into auth.users (id, email, email_confirmed_at) values
  (:'M1', 'm1@test.invalid', now()), (:'M2', 'm2@test.invalid', now()), (:'M3', 'm3@test.invalid', now()),
  (:'M4', 'm4@test.invalid', now()), (:'M5', 'm5@test.invalid', now()),
  (:'A1', 'a1@test.invalid', now()), (:'A2', 'a2@test.invalid', now());
insert into public.profiles (id, status, banned, banned_until, is_admin, is_premium, plan) values
  (:'M1', 'approved', false, null, false, false, 'free'),
  (:'M2', 'approved', true, null, false, true, 'Pro'),
  (:'M3', 'approved', false, null, false, true, 'Pro'),
  (:'M4', 'approved', true, now() - interval '1 day', false, true, 'Pro'),
  (:'M5', 'approved', false, now() + interval '1 day', false, true, 'Pro'),
  (:'A1', 'approved', false, null, true, true, 'Pro'),
  (:'A2', 'approved', true, null, true, true, 'Pro');

-- ---------- a) VORHER: Lücke belegen ----------
\echo == a) VORHER
reset role;
select public.test_check((select public.ban_active(p.banned, p.banned_until) from public.profiles p where p.id = :'M2') is true, 'a0 Vorbedingung: M2 ist gesperrt');
select public.test_seed_anhang(:'M2', :'M3', :'M2' || '/00000000-0000-0000-0000-0000000000a1.pdf') as id \gset a_
select public.test_check(public.test_count_anhang(:a_id) = 1, 'a0 Vorbedingung: Anhang-Zeile von M2 liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'a0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_loesche_anhang(:a_id) is not distinct from 'ok:1', 'a1 VORHER: gesperrtes M2 löscht seine Anhang-Zeile (Lücke belegt)');
reset role;

-- ---------- Migration laden ----------
\echo == Migration 20261118280000_sperre_anhang_zeile.sql laden
reset role;
\i supabase/migrations/20261118280000_sperre_anhang_zeile.sql

-- ---------- b) NACHHER: gesperrtes M2 scheitert ----------
\echo == b) NACHHER
reset role;
select public.test_seed_anhang(:'M2', :'M3', :'M2' || '/00000000-0000-0000-0000-0000000000b1.pdf') as id \gset b_
select public.test_check(public.test_count_anhang(:b_id) = 1, 'b0 Vorbedingung: Anhang-Zeile von M2 liegt vor');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.test_loesche_anhang(:b_id) is not distinct from 'ok:0', 'b1 NACHHER: gesperrtes M2 löscht seine Anhang-Zeile nicht (0 Zeilen)');
reset role;
select public.test_check(public.test_count_anhang(:b_id) = 1, 'b2 Gegenprobe: die Zeile liegt noch, die Sperre hat sie nicht entfernt');
-- Gegenprobe LESEN: die Sperre gilt nur für das Löschen. Gesperrtes M2 sieht seine Zeile weiter.
set role authenticated;
select public.test_check(public.test_count_anhang(:b_id) = 1, 'b3 Gegenprobe: gesperrtes M2 LIEST seine Zeile weiter (Sperre nur für Löschen)');
reset role;
-- Ursache belegen: entsperrt gelingt derselbe Versuch.
update public.profiles set banned = false where id = :'M2';
select public.test_login(:'M2');
set role authenticated;
select public.test_check(public.test_loesche_anhang(:b_id) is not distinct from 'ok:1', 'b4 Gegenprobe: entsperrt gelingt derselbe Löschversuch (die Ursache ist die Sperre)');
reset role;
-- Wieder gesperrt, neue Zeile: scheitert erneut.
update public.profiles set banned = true where id = :'M2';
select public.test_seed_anhang(:'M2', :'M3', :'M2' || '/00000000-0000-0000-0000-0000000000b2.pdf') as id \gset b2_
select public.test_login(:'M2');
set role authenticated;
select public.test_check(public.test_loesche_anhang(:b2_id) is not distinct from 'ok:0', 'b5 wieder gesperrt: scheitert erneut');
reset role;

-- ---------- c) Gegenprobe: nicht gesperrtes M1 löscht ----------
\echo == c) nicht gesperrtes M1
reset role;
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M1') is true, 'c0 Vorbedingung: M1 ist nicht gesperrt');
select public.test_seed_anhang(:'M1', :'M3', :'M1' || '/00000000-0000-0000-0000-0000000000c1.pdf') as id \gset c_
select public.test_check(public.test_count_anhang(:c_id) = 1, 'c0 Vorbedingung: Anhang-Zeile von M1 liegt vor');
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'c0 Sitzung: nicht gesperrtes M1 als authenticated');
select public.test_check(public.test_loesche_anhang(:c_id) is not distinct from 'ok:1', 'c1 Gegenprobe: nicht gesperrtes M1 löscht seine Anhang-Zeile');
reset role;

-- ---------- d) Abgelaufene Sperre und Sperre mit Ende in der Zukunft hindern nicht ----------
\echo == d) abgelaufene Sperre (M4) und banned = false mit Ende (M5)
reset role;
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M4') is true, 'd0 Vorbedingung: M4 ist nicht mehr gesperrt (Sperre abgelaufen)');
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M5') is true, 'd0 Vorbedingung: M5 ist nicht gesperrt (banned = false)');
select public.test_seed_anhang(:'M4', :'M3', :'M4' || '/00000000-0000-0000-0000-0000000000d4.pdf') as id \gset d4_
select public.test_seed_anhang(:'M5', :'M3', :'M5' || '/00000000-0000-0000-0000-0000000000d5.pdf') as id \gset d5_
select public.test_login(:'M4');
set role authenticated;
select public.test_expect('authenticated', :'M4', 'd0 Sitzung: M4 als authenticated');
select public.test_check(public.test_loesche_anhang(:d4_id) is not distinct from 'ok:1', 'd1 abgelaufene Sperre hindert nicht: M4 löscht seine Anhang-Zeile');
reset role;
select public.test_login(:'M5');
set role authenticated;
select public.test_expect('authenticated', :'M5', 'd0 Sitzung: M5 als authenticated');
select public.test_check(public.test_loesche_anhang(:d5_id) is not distinct from 'ok:1', 'd2 banned = false mit Ende in der Zukunft hindert nicht: M5 löscht seine Anhang-Zeile');
reset role;

-- ---------- e) Der wichtige Teil: nicht gesperrter Admin löscht die Zeile eines gesperrten Mitglieds ----------
\echo == e) nicht gesperrter Admin A1, Zeile von gesperrtem M2
reset role;
select public.test_check((select public.ban_active(p.banned, p.banned_until) from public.profiles p where p.id = :'M2') is true, 'e0 Vorbedingung: M2 ist gesperrt');
select public.test_seed_anhang(:'M2', :'M3', :'M2' || '/00000000-0000-0000-0000-0000000000e1.pdf') as id \gset e_
select public.test_check(public.test_count_anhang(:e_id) = 1, 'e0 Vorbedingung: Anhang-Zeile von gesperrtem M2 liegt vor');
-- STELLVERTRETER, nicht wörtlich (siehe Kopf, Vorbehalt Admin): Admin-Sichtbarkeit. Die echte "Anhänge lesen" kennt keinen Admin.
drop policy if exists "TEST Stellvertreter Admin lesen (message_attachments)" on public.message_attachments;
create policy "TEST Stellvertreter Admin lesen (message_attachments)" on public.message_attachments
  for select to authenticated using ((select public.is_admin()));
select public.test_login(:'A1');
set role authenticated;
select public.test_expect('authenticated', :'A1', 'e0 Sitzung: A1 als authenticated');
select public.test_check(public.is_admin() is true, 'e0 Vorbedingung: A1 ist Admin und nicht gesperrt (is_admin)');
select public.test_check(public.test_loesche_anhang(:e_id) is not distinct from 'ok:1', 'e1 nicht gesperrter Admin A1 löscht die Anhang-Zeile von gesperrtem M2');
reset role;
drop policy if exists "TEST Stellvertreter Admin lesen (message_attachments)" on public.message_attachments;
\echo BEFUND (gemessen vom Koordinator, Wegwerf-Tabelle, nicht in dieser Datenbank): ohne Lese-Sicht löscht der Admin mit where-Bedingung 0 Zeilen, ohne Fehler.
\echo   Ursache ist die fehlende Admin-Sicht in "Anhänge lesen", nicht die Sperre. Siehe Kopf, Vorbehalt Admin.

-- ---------- f) Gesperrter Admin scheitert ----------
\echo == f) gesperrter Admin A2
reset role;
select public.test_check((select (public.ban_active(p.banned, p.banned_until) and p.is_admin) from public.profiles p where p.id = :'A2') is true, 'f0 Vorbedingung: A2 ist Admin UND gesperrt');
select public.test_seed_anhang(:'A2', :'M3', :'A2' || '/00000000-0000-0000-0000-0000000000f1.pdf') as id \gset f_
select public.test_check(public.test_count_anhang(:f_id) = 1, 'f0 Vorbedingung: Anhang-Zeile von A2 liegt vor (eigene Nachricht)');
select public.test_login(:'A2');
set role authenticated;
select public.test_expect('authenticated', :'A2', 'f0 Sitzung: A2 als authenticated');
select public.test_check(public.is_admin() is false, 'f0 Vorbedingung: is_admin() ist für gesperrten A2 false');
select public.test_check(public.test_loesche_anhang(:f_id) is not distinct from 'ok:0', 'f1 gesperrter Admin A2 scheitert an der eigenen Zeile (nur die Sperre trifft)');
reset role;

-- ---------- g) Kaskade wertet den Zeilenschutz des Kindes nicht aus (NUR Testaufbau, siehe Kopf) ----------
-- Eltern-Löschen direkt als authenticated, ohne Definer und ohne BYPASSRLS. g0 belegt, dass die Sperre für genau diese
-- Rolle das direkte Löschen verbietet. g1 und g2 belegen, dass die Kinder trotzdem mit dem Elternteil gehen.
-- Rechte und Regeln auf auth.users sind eine TEST-Stellvertretung. Sie werden am Ende wieder entfernt.
\echo == g) Kaskade (Eltern als authenticated, ohne Definer)
reset role;
-- Klammer: Bricht Block g ab (test_check wirft, ON_ERROR_STOP), darf das Recht auf auth.users NICHT liegen bleiben.
-- Ohne Klammer bliebe committet stehen, dass jede Rolle authenticated "delete from auth.users where id = auth.uid()"
-- ausführen kann. Das umgeht delete_my_account() samt remember_age_block() und die Altersgrenzen-Sperrliste, über
-- dieselbe Kaskade, die die Regel schützen soll. Die Klammer wird bei einem Abbruch zurückgerollt, das Aufräumen am
-- Blockende erreicht sie nicht. Kein psql --single-transaction: die über \i geladene Migration hat ihr eigenes begin/commit.
begin;
alter table auth.users enable row level security;
grant select, delete on auth.users to authenticated;
drop policy if exists "TEST Stellvertreter Eltern lesen (auth.users)" on auth.users;
create policy "TEST Stellvertreter Eltern lesen (auth.users)" on auth.users for select to authenticated
  using (id = (select auth.uid()));
drop policy if exists "TEST Stellvertreter Eltern löschen (auth.users)" on auth.users;
create policy "TEST Stellvertreter Eltern löschen (auth.users)" on auth.users for delete to authenticated
  using (id = (select auth.uid()));
select public.test_seed_anhang(:'M2', :'M3', :'M2' || '/00000000-0000-0000-0000-000000009001.pdf') as id \gset g_
select public.test_seed_anhang(:'M3', :'M1', :'M3' || '/00000000-0000-0000-0000-000000009002.pdf') as id \gset g3_
select public.test_check(public.test_count_anhang(:g_id) = 1 and public.test_count_anhang(:g3_id) = 1, 'g0 Vorbedingung: Zeilen von gesperrtem M2 und von M3 liegen vor');
select public.test_check((select public.ban_active(p.banned, p.banned_until) from public.profiles p where p.id = :'M2') is true, 'g0 Vorbedingung: M2 ist gesperrt');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'g0 Sitzung: gesperrtes M2 als authenticated (ohne Definer, ohne BYPASSRLS)');
select public.test_check(public.test_loesche_anhang(:g_id) is not distinct from 'ok:0', 'g0 Gegenprobe: die Sperre verbietet das direkte Löschen der Zeile (ok:0)');
select public.test_check(public.test_eltern_loeschen() is not distinct from 'ok:1', 'g0 Eltern-Löschen: authenticated löscht die eigene auth.users-Zeile (ok:1, ohne Definer)');
reset role;
select public.test_check(public.test_count_anhang(:g_id) = 0, 'g1 Kaskade: die Anhang-Zeile von M2 ist nach dem Eltern-Löschen weg, obwohl die Sperre das direkte Löschen verbietet');
select public.test_check((select count(*) from public.messages where sender_id = :'M2') = 0, 'g1 Kaskade: die Nachrichten von M2 sind über die Kaskade weg');
select public.test_check((select count(*) from auth.users where id = :'M2') = 0 and (select count(*) from public.profiles where id = :'M2') = 0, 'g1 Kaskade: auth.users und profiles von M2 sind weg');
select public.test_login(:'M3');
set role authenticated;
select public.test_check(public.test_eltern_loeschen() is not distinct from 'ok:1', 'g2 Eltern-Löschen: M3 (frei) löscht die eigene auth.users-Zeile (ok:1)');
reset role;
select public.test_check(public.test_count_anhang(:g3_id) = 0, 'g2 Kaskade: die Anhang-Zeile von M3 ist nach dem Eltern-Löschen weg');
select public.test_check((select count(*) from auth.users where id = :'M3') = 0, 'g2 Kaskade: auth.users von M3 ist weg');
-- Stellvertretung zurücknehmen.
drop policy if exists "TEST Stellvertreter Eltern lesen (auth.users)" on auth.users;
drop policy if exists "TEST Stellvertreter Eltern löschen (auth.users)" on auth.users;
alter table auth.users disable row level security;
revoke select, delete on auth.users from authenticated;
commit;

-- ---------- h) Struktur der Regel ----------
\echo == h) Struktur
reset role;
select public.test_check((select count(*) from pg_policies where schemaname = 'public' and tablename = 'message_attachments' and policyname = 'Sperre: nichts loeschen') = 1, 'h0 Vorbedingung: genau eine Regel "Sperre: nichts loeschen" auf public.message_attachments');
select public.test_check(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'message_attachments' and policyname = 'Sperre: nichts loeschen' and permissive = 'RESTRICTIVE' and cmd = 'DELETE' and roles = array['authenticated']::name[]), 'h1 Regel "Sperre: nichts loeschen" ist RESTRICTIVE, DELETE, nur {authenticated}');
-- Rechtelage, die die Löschsperre trägt. Ohne diese Rechte ist die Löschsperre über die Kaskade umgehbar.
-- Wer später "grant delete" auf eine dieser Tabellen erteilt, öffnet den Weg, und die Regel sieht es nicht.
-- Warum has_table_privilege(..., 'delete') hier abschließend ist, anders als bei insert und update: DELETE lässt sich in
-- PostgreSQL NICHT spaltenweise vergeben, das Recht gibt es nur auf Tabellenebene. insert und update dagegen sind bei
-- messages und profiles spaltenweise vergeben (has_table_privilege meldet dort false, obwohl geschrieben werden darf).
-- Diesen Vergleich nicht als Muster für insert oder update übernehmen; dort braucht es eine Spaltenprüfung.
select public.test_check(has_table_privilege('authenticated', 'public.messages', 'delete') = false, 'h2 Rechtelage: authenticated hat KEIN DELETE auf public.messages. Ohne diese Rechtelage ist die Löschsperre über die Kaskade umgehbar (Herkunft: 20261117150000_tabellenrechte_zurueck.sql, Zeile 165-168)');
select public.test_check(has_table_privilege('authenticated', 'public.profiles', 'delete') = false, 'h3 Rechtelage: authenticated hat KEIN DELETE auf public.profiles. Ohne diese Rechtelage ist die Löschsperre über die Kaskade umgehbar (Herkunft: 20261117140000_profiles_grants_zurueck.sql, Zeile 39-40)');

\echo == Ende: alle Blöcke durchgelaufen
