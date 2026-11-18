-- Zusagen der Migration supabase/migrations/20261118230000_altersgrenze_inhalte_nachziehen.sql, jede mit Gegenprobe.
--   K) Der Kern: Konto 61 unter 16 mit Inhalten (author_age_ok = false). Das Alter kippt über den 16. Geburtstag.
--      VOR dem Speichern des Profils bleibt die Spalte false, und niemand außer dem Admin sieht die Inhalte.
--      NACH dem Speichern des Profils ist die Spalte true, und Gast wie Mitglied sehen die Inhalte wieder.
--      Konto 62 über 16 bleibt unberührt.
--   B) Das Speichern durch einen ANDEREN (ein Admin setzt den Status) zieht die Spalte ebenfalls nach. Gegenprobe:
--      ein Mitglied ohne Adminrecht kann den Status nicht setzen.
--   C) Ein Profil-Speichern bei einem Konto, das weiter unter 16 ist, lässt die Spalte false.
--   D) Ein Fehler im Nachziehen verhindert das Speichern des Profils NICHT. Die Spalte bleibt dann veraltet, und das
--      nächste Speichern holt sie nach. Der Bruch ist eine Trigger-Sperre auf posts, nur für Konto 72 (siehe D).
--   E) Die beiden Geburtsdatums-Funktionen ziehen nach, auch ohne Speichern des Profils. Dafür wird der Trigger auf
--      profiles für E und F ausgeschaltet, damit allein die Funktion nachzieht.
--   F) Konto 74 und 75 mit set_my_birthdate(): aufwärts und abwärts.
--   G) Rechte: sync_author_age_ok(uuid) ist für anon, authenticated und service_role nicht ausführbar. Erst Ablehnung,
--      dann Gegenprobe mit erteiltem Recht, dann Entzug.
--   T1) Der Trigger sync_author_age_ok liegt AFTER INSERT OR UPDATE FOR EACH ROW auf public.profiles.
--
-- ZEITABLAUF: In der Testdatenbank lässt sich die Uhr nicht verschieben. Der Zeitablauf wird nachgestellt, indem das
--   hinterlegte Geburtsdatum auf heute minus 16 Jahre gesetzt wird. Das ist genau der Stand am 16. Geburtstag. Sonst wird
--   an der Datenbank nichts verändert: Alle Prüfungen laufen über die echten Funktionen und Trigger aus den Migrationen.
--
-- Der Aufbau (Stubs, Helfer, Standardrechte, Tabellen, Leseregeln) ist wie in tests/age_gate_content_hidden.sql.
--   Der Stand: 20261118200000 ist eingespielt, dann 20261118230000. Vor der Migration liegen die Konten nicht.
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion. Als postgres ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_content_birthday.sql
\set ON_ERROR_STOP on
-- Nur für den Test, nicht in der Migration: Eine frische Datenbank hat pgcrypto noch nicht. Die Migration
-- setzt pgcrypto voraus (extensions.gen_random_bytes, extensions.digest) und legt es deshalb nicht an.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

set datestyle = 'ISO, YMD';

-- Rollen: service_role gibt es in Supabase immer. In einer leeren Testdatenbank muss sie angelegt werden.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- ---------- Stubs: nur, was die Migrationen anfassen ----------
create schema auth;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Spalten wie in 003_community.sql, 20261113120000 und 20261105110000 (nur die, die hier gelesen werden)
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  headline      text not null default '',
  about         text not null default '',
  phase         text,
  category      text not null default '',
  offer         text not null default '',
  seek          text not null default '',
  linkedin      text not null default '',
  instagram     text not null default '',
  website       text not null default '',
  is_public     boolean not null default false,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);
grant select on public.profiles to authenticated;
-- wie in 20261113120000_signup_birthdate.sql
create table public.member_birthdates (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birthdate  date not null,
  set_at     timestamptz not null default now()
);
alter table public.member_birthdates enable row level security;
revoke all on public.member_birthdates from anon, authenticated;
-- Produktion vor 20261118180000: service_role hatte all auf member_birthdates (gemessen). Die Zeile muss VOR dem
--   Migrationslauf stehen, sonst wäre das revoke der Migration leer und die Rechteprüfung selbsterfüllend.
grant all on public.member_birthdates to service_role;
create table public.waitlist_cards (
  id         bigint generated always as identity primary key,
  user_id    uuid references public.profiles (id) on delete set null,
  email      text,
  name       text not null default '',
  handle     text unique,
  is_public  boolean not null default false,
  page       jsonb,
  page_draft jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.page_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  name       text not null,
  page       jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on public.page_templates from anon, authenticated;

create function public.ban_active(b boolean, until timestamptz) returns boolean language sql immutable as $$
  select coalesce(b, false) and (until is null or until > now()) $$;
create function public.beta_application_required() returns boolean language sql stable as $$ select false $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;
create function public.normalize_url(u text) returns text language sql immutable as $$
  select coalesce(nullif(btrim(coalesce(u, '')), ''), '') $$;
-- page_guard und page_check wie in tests/age_gate_publishing.sql, nur für 20261113140000 nötig
create function public.page_guard() returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  return v_uid;
end $$;
create function public.page_check(p jsonb, u uuid, t boolean default false) returns void language sql as $$ select $$;
-- wie in 20261113120000_signup_birthdate.sql
create function public.birthdate_from_text(t text) returns date language plpgsql immutable set search_path = '' as $$
declare d date;
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  d := t::date;
  if d < date '1900-01-01' then return null; end if;
  return d;
exception when others then return null;
end $$;

-- Standardrechte wie in Supabase: neue Tabellen, Funktionen und Folgen in public sind für anon, authenticated
-- und service_role zunächst offen. Gemessen in der Produktionsdatenbank in pg_default_acl (Schema public): Tabellen (r)
--   für postgres, anon, authenticated, service_role je arwdDxtm; Funktionen (f) für dieselben vier je X; Folgen (S) je rwU.
-- Ausführen als postgres (nicht als anderer Superuser), sonst gelten die Standardrechte nicht für die Objekte, die
--   diese Sitzung anlegt. Nicht abgebildet: die Einträge von supabase_admin in pg_default_acl.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- Inhaltstabellen wie in Produktion VOR 20261118200000 ----------
-- Nach den Standardrechten angelegt, also mit denselben Rechten wie in Produktion.
-- author_id und owner_id haben den Standardwert auth.uid() wie in 003_community.sql:15, 46 und 009_projects.sql:10.
--   Warum sie im Stub stehen müssen, steht im Block "Anlege-Wege wie in Produktion" weiter unten.
create table public.posts (
  id         bigint generated by default as identity primary key,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       text not null default 'update',
  body       text not null default '',
  is_public  boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.listings (
  id         bigint generated by default as identity primary key,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type       text not null default 'suche',
  category   text not null default '',
  title      text not null default '',
  body       text not null default '',
  is_public  boolean not null default false,
  closed     boolean not null default false
);
create table public.projects (
  id         bigint generated by default as identity primary key,
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title      text not null default '',
  pitch      text not null default '',
  body       text not null default '',
  phase      text not null default '',
  place      text not null default '',
  is_public  boolean not null default false,
  closed     boolean not null default false
);
create table public.messages (
  id            bigint generated by default as identity primary key,
  sender_id     uuid not null references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null default ''
);

-- Spaltenrechte wie in Produktion (20261117150000_tabellenrechte_zurueck.sql: posts Zeilen 264-268,
--   listings 117-121, projects 310-314). Kein Tabellen-Update für authenticated, nur die Spaltenlisten.
--   author_age_ok steht in keiner Liste. Das ist die Vorbedingung für B3.
revoke all on public.posts, public.listings, public.projects from anon, authenticated;
grant select on public.posts, public.listings, public.projects to anon, authenticated;
grant insert (kind, body, is_public) on public.posts to authenticated;
grant update (kind, body, is_public) on public.posts to authenticated;
grant delete on public.posts to authenticated;
grant insert (type, category, title, body, is_public) on public.listings to authenticated;
grant update (type, category, title, body, is_public, closed) on public.listings to authenticated;
grant delete on public.listings to authenticated;
grant insert (title, pitch, body, phase, place, is_public) on public.projects to authenticated;
grant update (title, pitch, body, phase, place, is_public, closed) on public.projects to authenticated;
grant delete on public.projects to authenticated;

-- Zeilenschutz an, wie in Produktion.
alter table public.posts enable row level security;
alter table public.listings enable row level security;
alter table public.projects enable row level security;

-- Änderungsregeln und der Trigger wie in Produktion. posts: 20261028220000 (Fenster von 30 Minuten, Trigger
--   enforce_post_edit_window, Policy "Eigene Beiträge ändern"). Die Datei wird geladen, nicht nachgebaut.
\i supabase/migrations/20261028220000_community_post_edit_window.sql
-- listings: 003_community.sql:185-187. projects: 009_projects.sql:116-119.
create policy "Eigene Einträge ändern" on public.listings
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));
drop policy if exists "Eigenes Projekt ändern" on public.projects;
create policy "Eigenes Projekt ändern" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------- Prüfhilfen (Testobjekte, nur in dieser Testdatenbank) ----------
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;
-- Prüft, ob die Kennung der Sitzung genau uid ist. uid = '' heißt: keine Kennung (Gast). Vor jeder Gruppe aufrufen,
--   damit kein Rest aus einer früheren Gruppe nachwirkt.
create function public.test_expect_uid(uid text, label text) returns void language plpgsql as $$
begin
  if coalesce(auth.uid()::text, '') is distinct from uid then
    raise exception 'TEST FEHLGESCHLAGEN (%): Kennung ist "%" (erwartet "%")', label, coalesce(auth.uid()::text, ''), uid;
  end if;
  raise notice 'OK: %', label;
end $$;
-- Ist die Zeile in der Tabelle tbl öffentlich (is_public)?
create function public.test_flag(tbl text, row_id bigint, want boolean, label text) returns void language plpgsql as $$
declare got boolean;
begin
  execute format('select is_public from public.%I where id = $1', tbl) into got using row_id;
  if got is null then raise exception 'TEST FEHLGESCHLAGEN (%): Zeile % in % fehlt', label, row_id, tbl; end if;
  if got is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): is_public % (erwartet %)', label, got, want;
  end if;
  raise notice 'OK: %', label;
end $$;
-- Wie viele Zeilen mit id = row_id sieht die Rolle r, wenn die Kennung uid ist? Der Betrachter sieht also nur, was
--   die Leseregel ihm zeigt. Die vorherige Kennung wird danach wiederhergestellt, damit kein Rest nachwirkt.
create function public.test_visible_as(r text, uid text, tbl text, row_id bigint, want int, label text) returns void language plpgsql as $$
declare n int; old_claim text := current_setting('request.jwt.claim.sub', true);
begin
  execute format('set role %I', r);
  perform set_config('request.jwt.claim.sub', uid, false);
  execute format('select count(*) from public.%I where id = $1', tbl) into n using row_id;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', coalesce(old_claim, ''), false);
  if n is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): % Zeile(n) sichtbar (erwartet %)', label, n, want;
  end if;
  raise notice 'OK (%): %', r, label;
end $$;
-- Schreibversuch als Rolle r: Die Anzahl geänderter Zeilen muss want_rows sein. Eine Policy, die still filtert,
--   liefert 0 Zeilen ohne Fehler. Deshalb zählt der Test Zeilen.
create function public.test_rows_as(r text, stmt text, want_rows bigint, label text) returns void language plpgsql as $$
declare n bigint; msg text;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    msg := sqlerrm;
  end;
  execute 'reset role';
  if msg is not null then raise exception 'TEST FEHLGESCHLAGEN (%): % bei: %', label, msg, stmt; end if;
  if n is distinct from want_rows then
    raise exception 'TEST FEHLGESCHLAGEN (%): % Zeile(n) geändert (erwartet %)', label, n, want_rows;
  end if;
  raise notice 'OK (%): %', r, label;
end $$;
-- Prüfsumme über xmin aller Inhaltszeilen. Ändert ein Lauf eine Zeile, bekommt sie eine neue xmin.
create function public.test_content_hash() returns text language sql stable as $$
  select md5(coalesce(string_agg(s, ',' order by s), ''))
    from (select 'p' || id || ':' || xmin::text as s from public.posts
          union all select 'l' || id || ':' || xmin::text from public.listings
          union all select 'j' || id || ':' || xmin::text from public.projects) q
$$;
-- Rechteprüfung: Der Aufruf als Rolle r muss an SQLSTATE 42501 scheitern (kein EXECUTE-Recht bzw. kein Spaltenrecht).
create function public.test_denied_as(r text, stmt text, label text) returns void language plpgsql as $$
declare ok boolean := false;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when insufficient_privilege then
    ok := true;
  end;
  execute 'reset role';
  if not ok then raise exception 'TEST FEHLGESCHLAGEN (%): kein Rechtefehler für % bei: %', label, r, stmt; end if;
  raise notice 'OK (%, abgelehnt): %', r, label;
end $$;
-- Gegenprobe mit Recht: Der Aufruf als Rolle r scheitert an der Regel selbst, nicht am Recht. Ein 42501 aus der
--   Regel selbst (Trigger) zählt hier als Fehler, deshalb die Prüfung über test_raises_as().
create function public.test_error_as(r text, stmt text, pattern text, label text) returns void language plpgsql as $$
declare msg text; st text;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when others then
    msg := sqlerrm;
    st := sqlstate;
  end;
  execute 'reset role';
  if msg is null then raise exception 'TEST FEHLGESCHLAGEN (%): kein Fehler (erwartet %)', label, pattern; end if;
  if st = '42501' then raise exception 'TEST FEHLGESCHLAGEN (%): Rechtefehler statt Regelfehler: %', label, msg; end if;
  if msg not like pattern then raise exception 'TEST FEHLGESCHLAGEN (%): Fehler "%" statt "%"', label, msg, pattern; end if;
  raise notice 'OK (%, Recht vorhanden, Regel greift): %', r, label;
end $$;
-- Wie test_error_as, prüft aber nur die Meldung. Für Fehler aus Triggern, die SQLSTATE 42501 tragen.
create function public.test_raises_as(r text, stmt text, pattern text, label text) returns void language plpgsql as $$
declare msg text;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when others then
    msg := sqlerrm;
  end;
  execute 'reset role';
  if msg is null then raise exception 'TEST FEHLGESCHLAGEN (%): kein Fehler (erwartet %)', label, pattern; end if;
  if msg not like pattern then raise exception 'TEST FEHLGESCHLAGEN (%): Fehler "%" statt "%"', label, msg, pattern; end if;
  raise notice 'OK (%, Trigger greift): %', r, label;
end $$;
-- Aufruf als Rolle r ohne Fehler.
create function public.test_runs_as(r text, stmt text, label text) returns void language plpgsql as $$
declare msg text;
begin
  execute format('set role %I', r);
  begin
    execute stmt;
  exception when others then
    msg := sqlerrm;
  end;
  execute 'reset role';
  if msg is not null then raise exception 'TEST FEHLGESCHLAGEN (%): % bei: %', label, msg, stmt; end if;
  raise notice 'OK (%, läuft): %', r, label;
end $$;
-- Ein is_public-Update aus einer SECURITY-DEFINER-Funktion heraus. Läuft als Eigentümer, aber der Trigger prüft
--   auth.uid() und das Alter des Beitrags. Genau dieser Weg lag bei den Geburtsdatums-Funktionen nahe.
create function public.test_is_public_update_definer(p_id bigint) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.posts set is_public = false where id = p_id;
end $$;

-- ---------- Altersregel-Kette, auf der die Migration aufsetzt ----------
\i supabase/migrations/20261107200000_cards_always_public.sql
\i supabase/migrations/20261113130000_age_gate_membership.sql
\i supabase/migrations/20261113140000_age_gate_publishing.sql
\i supabase/migrations/20261117120000_age_ok_known_birthdate.sql
\i supabase/migrations/20261118140000_altersgrenze_nachziehen.sql
\i supabase/migrations/20261118160000_altersgrenze_nachbesserung.sql
\i supabase/migrations/20261118180000_altersgrenze_sperrliste.sql
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- is_approved_member() wörtlich aus 20261118120000_altersgrenze_schliessen.sql (Zeilen 45-51). Die Leseregeln brauchen sie.
--   Die Kette oben lädt diese Datei nicht, deshalb steht die Funktion hier, unverändert.
create or replace function public.is_approved_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and status = 'approved'
                    and not public.ban_active(banned, banned_until)
                    and public.age_ok(id));
$$;

-- ---------- Leseregeln VOR der Migration, wie in Produktion (003_community.sql:120-122 und 177-179, 018_open_projects_messages.sql:26-29) ----------
-- Die Leseregeln sind wie in Produktion: "for select to anon, authenticated" und die is_public-basierten Bedingungen.
--   drop policy if exists davor, damit der Test nicht auf einer Vorlage aufsetzt, die schon da ist.
drop policy if exists "Beiträge lesen" on public.posts;
create policy "Beiträge lesen" on public.posts
  for select to anon, authenticated
  using (is_public or (select public.is_approved_member()) or (select public.is_admin()));
drop policy if exists "Börse lesen" on public.listings;
create policy "Börse lesen" on public.listings
  for select to anon, authenticated
  using (is_public or (select public.is_approved_member()) or (select public.is_admin()));
drop policy if exists "Projekte lesen" on public.projects;
create policy "Projekte lesen" on public.projects
  for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()) or (select public.is_active_member()) or (select public.is_admin()));

-- ---------- Anlege-Wege wie in Produktion ----------
-- Ohne permissive INSERT-Policy scheitert in dieser Testdatenbank jeder Insert, für jedes Konto. Dann wären der
--   Standardwert author_age_ok = true und die Altersregel beim Anlegen nie geprüft. Deshalb stehen die drei Policies hier.
--   Wortlaut aus 003_community.sql:124 ("Beiträge schreiben") und 181 ("Börse schreiben") sowie aus
--   018_open_projects_messages.sql:31 ("Projekt anlegen", die jüngere Fassung mit is_active_member; 009 steht davor).
--   Die Altersregel "Altersgrenze: nichts anlegen" (20261118140000) ist über die Kette oben schon geladen.
-- author_id und owner_id haben oben den Standardwert auth.uid(). Die Insert-Grants nennen diese Spalten nicht
--   (kind, body, is_public usw.). Die Kennung des neuen Eintrags kommt also allein aus dem Standardwert. Ohne ihn
--   bliebe author_id leer (NOT NULL, Fehler 23502), und die Altersregel würde nie erreicht.
drop policy if exists "Beiträge schreiben" on public.posts;
create policy "Beiträge schreiben" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));
drop policy if exists "Börse schreiben" on public.listings;
create policy "Börse schreiben" on public.listings
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));
drop policy if exists "Projekt anlegen" on public.projects;
create policy "Projekt anlegen" on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_member()));

-- Projekte: Spalte share_slug und Trigger wie in Produktion.
--   share_slug wie 20261028200000 (Spalte und eindeutiger Index). Diese Datei selbst lässt sich nicht laden: Sie enthält
--   get_public_profile_activity() mit project_roles, und die Tabelle fehlt im Stub.
alter table public.projects add column if not exists share_slug text;
create unique index if not exists projects_share_slug_key on public.projects (share_slug);
--   Rumpf des Triggers und Formatregel projects_share_slug_format kommen aus 20261028210000, der jüngeren Fassung.
--   Geladen, nicht nachgebaut. Diese Datei legt außerdem protect_project_address() auf waitlist_cards an. Der Test
--   fügt keine Karten ein, dort also ohne Wirkung.
\i supabase/migrations/20261028210000_project_handle_title_links.sql
-- WARUM DER TRIGGER IM STUB STEHT, obwohl er nichts tut: assign_project_share_slug ist BEFORE INSERT OR UPDATE OHNE
--   Spaltenliste. Er feuert also bei jeder Änderung von author_age_ok. Er ist harmlos: Bei vorhandenem Slug ohne Punkt
--   kehrt er sofort zurück, und der Neuberechnungs-Zweig ist wegen der Formatregel unerreichbar. Genau diese Klasse von
--   Trigger ist zweimal durchgekommen, einmal fast mit einer Betriebsstörung. Deshalb steht er im Stub.
create trigger assign_project_share_slug before insert or update on public.projects
  for each row execute function public.assign_project_share_slug();


-- ---------- Vorbedingung: der Trigger enforce_post_edit_window liegt auf posts (aus 20261028220000, nicht nachgebaut) ----------
select public.test_check(exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relname = 'posts' and t.tgname = 'enforce_post_edit_window' and not t.tgisinternal),
  'Vorbedingung: der Trigger enforce_post_edit_window liegt auf posts (aus 20261028220000, nicht nachgebaut)');

-- ---------- Stand der Produktion: 20261118200000 ist eingespielt, dann diese Migration ----------
\i supabase/migrations/20261118200000_altersgrenze_inhalte_verbergen.sql

-- ---------- Veralteter Bestand für Block 5 (Nachtrag von 20261118230000), eingefügt ZWISCHEN den beiden Läufen ----------
-- Warum hier: author_age_ok entsteht erst in 20261118200000. Der Nachtrag in Block 4 von 20261118200000 läuft im selben
--   Lauf und fand mit leeren Tabellen nichts. Die Seeds weiter unten entstehen erst nach beiden Läufen. Liegen veraltete Werte
--   also vor 20261118230000, kann nur dessen Block 5 sie richten, und nur er wird hier geprüft.
-- Konto 81 ist über 16 (Datum 2000), trägt aber false. Konto 82 ist unter 16 (Datum vor 10 Jahren), trägt aber true.
--   Der Zustand entspricht einem Geburtstag ohne anschließendes Speichern (Konto 81) bzw. einer Rücknahme nach unten (Konto 82).
-- Die Profilzeilen entstehen über handle_new_user. Der Trigger sync_author_age_ok liegt noch nicht auf profiles, und
--   danach wird das Profil nicht mehr geschrieben. Nur Block 5 hat also eine Chance, die Zeilen zu richten.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000081', 'bestand-ueber16@x.de', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000082', 'bestand-unter16@x.de', now(), '{}'::jsonb);
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000081', date '2000-01-01'),
  ('00000000-0000-0000-0000-000000000082', (current_date - interval '10 years')::date);
insert into public.posts (id, author_id, kind, body, is_public, author_age_ok) values
  (1811, '00000000-0000-0000-0000-000000000081', 'update', 'Bestand, Konto 81', true, false),
  (1821, '00000000-0000-0000-0000-000000000082', 'update', 'Bestand, Konto 82', true, true);
insert into public.listings (id, author_id, type, category, title, is_public, author_age_ok) values
  (1811, '00000000-0000-0000-0000-000000000081', 'suche', 'x', 'Bestand 81', true, false),
  (1821, '00000000-0000-0000-0000-000000000082', 'suche', 'x', 'Bestand 82', true, true);
insert into public.projects (id, owner_id, title, pitch, is_public, author_age_ok) values
  (1811, '00000000-0000-0000-0000-000000000081', 'Bestand 81', 'Pitch', true, false),
  (1821, '00000000-0000-0000-0000-000000000082', 'Bestand 82', 'Pitch', true, true);
-- Gegenprobe des Vorzustands: Die veralteten Werte stehen wirklich da, bevor der Lauf startet. Sonst wäre die
--   Prüfung nach dem Lauf selbsterfüllend.
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000081'::uuid)
  and not public.age_ok('00000000-0000-0000-0000-000000000082'::uuid)
  and not exists (select 1 from public.posts where id = 1811 and author_age_ok)
  and not exists (select 1 from public.listings where id = 1811 and author_age_ok)
  and not exists (select 1 from public.projects where id = 1811 and author_age_ok)
  and exists (select 1 from public.posts where id = 1821 and author_age_ok)
  and exists (select 1 from public.listings where id = 1821 and author_age_ok)
  and exists (select 1 from public.projects where id = 1821 and author_age_ok),
  'Vorzustand vor 20261118230000: Konto 81 (über 16) trägt false, Konto 82 (unter 16) trägt true, in Posts, Börse und Projekten');

\i supabase/migrations/20261118230000_altersgrenze_inhalte_nachziehen.sql

-- ---------- Indizes aus 20261118230000, Block 2b: vorhanden UND auf der richtigen Spalte ----------
-- pg_indexes.indexdef endet immer mit der Spaltenliste, egal ob pg_get_indexdef den Tabellennamen schreibt. Die Endung
--   " USING btree (spalte)" prüft also die Spalte, nicht nur den Namen.
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'posts'
           and indexname = 'posts_author_idx' and indexdef like '% USING btree (author_id)'),
  'Index: posts_author_idx liegt auf posts (author_id)');
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'listings'
           and indexname = 'listings_author_idx' and indexdef like '% USING btree (author_id)'),
  'Index: listings_author_idx liegt auf listings (author_id)');
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'projects'
           and indexname = 'projects_owner_idx' and indexdef like '% USING btree (owner_id)'),
  'Index: projects_owner_idx liegt auf projects (owner_id)');
-- Gegenprobe: dieselbe Suche findet einen Index nicht, der so nicht existiert (falscher Name, falsche Spalte).
select public.test_check(not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'posts'
           and indexname = 'posts_author_idx' and indexdef like '% USING btree (kind)')
  and not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'posts'
           and indexname = 'posts_owner_idx'),
  'Gegenprobe: posts_author_idx liegt nicht auf posts (kind), und posts_owner_idx gibt es nicht');

-- ---------- Block 5 nach dem Lauf: veraltete Zeilen sind gerichtet, in beide Richtungen ----------
-- coalesce(..., false): Fehlt eine Zeile, liefert bool_and NULL, und test_check ließe NULL still durch.
select public.test_check(
  coalesce((select bool_and(author_age_ok) from public.posts where id = 1811), false)
  and coalesce((select bool_and(author_age_ok) from public.listings where id = 1811), false)
  and coalesce((select bool_and(author_age_ok) from public.projects where id = 1811), false),
  'Block 5 aufwärts: Konto 81 (über 16) trägt nach dem Lauf true in Posts, Börse und Projekten');
select public.test_check(
  coalesce((select not bool_or(author_age_ok) from public.posts where id = 1821), false)
  and coalesce((select not bool_or(author_age_ok) from public.listings where id = 1821), false)
  and coalesce((select not bool_or(author_age_ok) from public.projects where id = 1821), false),
  'Block 5 abwärts: Konto 82 (unter 16) trägt nach dem Lauf false in Posts, Börse und Projekten');
select public.test_visible_as('anon', '', 'posts', 1811, 1,
  'Block 5: nach dem Lauf sieht der Gast den Beitrag von Konto 81 wieder');
select public.test_visible_as('anon', '', 'posts', 1821, 0,
  'Block 5 Gegenprobe: der Gast sieht den Beitrag von Konto 82 nicht');

-- Vorbedingungen nach dem Lauf
select public.test_check(position('perform public.sync_author_age_ok(uid)' in pg_get_functiondef('public.set_my_birthdate(text)'::regprocedure)) > 0
  and position('perform public.sync_author_age_ok(p_id)' in pg_get_functiondef('public.admin_set_birthdate(uuid, text)'::regprocedure)) > 0,
  'Vorbedingung: set_my_birthdate() und admin_set_birthdate() rufen sync_author_age_ok auf (die neuen Fassungen)');
select public.test_check(exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'profiles' and t.tgname = 'sync_author_age_ok' and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 1 and (t.tgtype & 4) <> 0 and (t.tgtype & 16) <> 0
     and t.tgenabled = 'O'),
  'T1) Trigger sync_author_age_ok liegt AFTER INSERT OR UPDATE FOR EACH ROW auf public.profiles und ist eingeschaltet');

-- ---------- Stubs für diesen Test ----------
-- Spaltenrecht für das eigene Profil (Test-Stub). Ein Profil speichern heißt hier, about zu schreiben. In Produktion
--   laufen die Schreibwege über Spaltenlisten. Der Trigger zählt nur, dass eine Zeile geschrieben wird.
grant update (about) on public.profiles to authenticated;
-- Stub für den Admin-Statuswechsel, Rumpf wie admin_set_status (20261105110000, Zeilen 48-62), ohne review_locked, weil die
--   Spalte in dieser Testdatenbank fehlt. Der Schreibweg ist derselbe: ein UPDATE auf profiles, also feuert der Trigger.
create function public.test_admin_set_status(p_id uuid, p_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'Ungültiger Status.'; end if;
  update public.profiles set status = p_status where id = p_id;
  if not found then raise exception 'Mitglied nicht gefunden.'; end if;
end $$;

-- ---------- Seeds: Konten (als Eigentümer angelegt, also ohne RLS) ----------
-- 61 unter 16 (Kern). 62 über 16 (Kontrolle). 63 Mitglied über 16. 64 Admin. 65 Konto für den Statuswechsel durch den
--   Admin. 71 bleibt unter 16. 72 für den Bruch. 73 für admin_set_birthdate(). 74 und 75 nach dem Stichtag ohne Datum
--   (für set_my_birthdate() aufwärts und abwärts). Alle außer 74 und 75 sind vor dem Stichtag angelegt, wie in Produktion.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000061', 'kern-unter16@x.de', now(), jsonb_build_object('name', 'Kern Unter', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000062', 'autor-ueber16@x.de', now(), jsonb_build_object('name', 'Autor Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000063', 'mitglied-ueber16@x.de', now(), jsonb_build_object('name', 'Mitglied Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000064', 'admin-b@x.de', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000065', 'admin-speichert@x.de', now(), jsonb_build_object('name', 'Admin Speichert', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000071', 'bleibt-unter16@x.de', now(), jsonb_build_object('name', 'Bleibt Unter', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000072', 'bruch-beim-speichern@x.de', now(), jsonb_build_object('name', 'Bruch Konto', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000073', 'admin-berichtigt@x.de', now(), jsonb_build_object('name', 'Admin Berichtigt', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000074', 'datum-aufwaerts@x.de', now(), jsonb_build_object('name', 'Datum Aufwaerts', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000075', 'datum-abwaerts@x.de', now(), jsonb_build_object('name', 'Datum Abwaerts', 'headline', 'Baut eine Firma'));
update public.profiles set status = 'approved'
 where id in ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062',
              '00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000065',
              '00000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000072',
              '00000000-0000-0000-0000-000000000073', '00000000-0000-0000-0000-000000000074',
              '00000000-0000-0000-0000-000000000075');
update public.profiles set status = 'approved', is_admin = true where id = '00000000-0000-0000-0000-000000000064';
-- Vor dem Stichtag angelegt (Bestandsschutz): ohne Datum gilt das Konto als über 16.
update public.profiles set created_at = public.age_check_start() - interval '1 day'
 where id in ('00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062',
              '00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000064',
              '00000000-0000-0000-0000-000000000065', '00000000-0000-0000-0000-000000000071',
              '00000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000073');

-- Inhalte. Die Beiträge stehen mit der Standardspalte author_age_ok = true.
insert into public.posts (id, author_id, kind, body, is_public) values
  (1601, '00000000-0000-0000-0000-000000000061', 'update', 'Privater Beitrag 61', false),
  (1602, '00000000-0000-0000-0000-000000000061', 'update', 'Öffentlicher Beitrag 61', true),
  (1621, '00000000-0000-0000-0000-000000000062', 'update', 'Öffentlicher Beitrag 62', true),
  (1651, '00000000-0000-0000-0000-000000000065', 'update', 'Öffentlich, Konto 65', true),
  (1711, '00000000-0000-0000-0000-000000000071', 'update', 'Öffentlich, Konto 71', true),
  (1721, '00000000-0000-0000-0000-000000000072', 'update', 'Öffentlich, Konto 72', true),
  (1731, '00000000-0000-0000-0000-000000000073', 'update', 'Öffentlich, Konto 73', true),
  (1741, '00000000-0000-0000-0000-000000000074', 'update', 'Öffentlich, Konto 74', true),
  (1751, '00000000-0000-0000-0000-000000000075', 'update', 'Öffentlich, Konto 75', true);
insert into public.listings (id, author_id, type, category, title, is_public) values
  (1241, '00000000-0000-0000-0000-000000000061', 'suche', 'x', 'Öffentlich 61', true),
  (1242, '00000000-0000-0000-0000-000000000061', 'suche', 'x', 'Privat 61', false),
  (1621, '00000000-0000-0000-0000-000000000062', 'biete', 'x', 'Öffentlich 62', true);
insert into public.projects (id, owner_id, title, pitch, is_public) values
  (1341, '00000000-0000-0000-0000-000000000061', 'Privat 61', 'Pitch', false),
  (1621, '00000000-0000-0000-0000-000000000062', 'Öffentlich 62', 'Pitch', true);

-- ---------- K) Der Kern: Konto 61 unter 16, Zeitablauf, Profil speichern ----------
select public.test_expect_uid('', 'K: Vorbedingung, keine Kennung');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-01-01')$q$,
  'K1) Konto 61 trägt ein Datum unter 16 ein');
select public.test_expect_uid('00000000-0000-0000-0000-000000000061', 'K1: Kennung ist 61 während des Eintragens');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'K1: keine Kennung nach dem Eintragen');
select public.test_check(not public.age_ok('00000000-0000-0000-0000-000000000061'::uuid)
  and exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000061')
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000061' and author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000061' and author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000061' and author_age_ok),
  'K1) Nach dem Eintragen: age_ok(61) ist falsch und author_age_ok ist für alle Inhalte von 61 false');
select public.test_visible_as('anon', '', 'posts', 1602, 0,
  'K2) Vor dem Ablauf: der Gast sieht den öffentlichen Beitrag von 61 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1601, 0,
  'K2) Vor dem Ablauf: Mitglied 63 sieht den privaten Beitrag von 61 nicht');

-- Zeitablauf nachstellen: Das hinterlegte Geburtsdatum wird auf heute minus 16 Jahre gesetzt, also den Stand am 16.
--   Geburtstag. Am Trigger und an den Funktionen wird nichts angefasst. Es gibt keinen Lauf, der die Spalte nachzieht.
update public.member_birthdates set birthdate = (current_date - interval '16 years')::date
 where id = '00000000-0000-0000-0000-000000000061';
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000061'::uuid),
  'K3) Zeitablauf: age_ok(61) ist nach dem 16. Geburtstag wahr');

-- K4) Gegenprobe VOR dem Speichern: Die Spalte bleibt false, und niemand außer dem Admin sieht die Inhalte. Das ist die
--   Zusage, die den Fehler festhält. Ohne den Trigger auf profiles bliebe das so, mit ihm kommt die Spalte erst beim Speichern.
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000061' and author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000061' and author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000061' and author_age_ok),
  'K4) Gegenprobe VOR dem Speichern: author_age_ok bleibt false, obwohl das Alter wieder passt');
select public.test_visible_as('anon', '', 'posts', 1602, 0,
  'K4) Gegenprobe VOR dem Speichern: der Gast sieht den Beitrag von 61 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1601, 0,
  'K4) Gegenprobe VOR dem Speichern: Mitglied 63 sieht den privaten Beitrag von 61 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1242, 0,
  'K4) Gegenprobe VOR dem Speichern: Mitglied 63 sieht den privaten Börsen-Eintrag von 61 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1341, 0,
  'K4) Gegenprobe VOR dem Speichern: Mitglied 63 sieht das private Projekt von 61 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1601, 1,
  'K4) Gegenprobe: der Admin 64 sieht den Inhalt von 61 weiter');

-- K5) Das Mitglied speichert sein Profil. Eine Zeile, ohne Fehler.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', false);
select public.test_rows_as('authenticated', $q$update public.profiles set about = 'Profil nach dem Geburtstag' where id = '00000000-0000-0000-0000-000000000061'$q$, 1,
  'K5) Konto 61 speichert sein Profil (eine Zeile, ohne Fehler)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'K5: keine Kennung nach dem Speichern');

-- K6) Nach dem Speichern: Die Spalte ist wieder true.
select public.test_check(exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000061')
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000061' and not author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000061' and not author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000061' and not author_age_ok),
  'K6) Nach dem Speichern: author_age_ok ist für alle Inhalte von 61 wieder true');
-- K7) Nach dem Speichern sehen Gast und Mitglied die Inhalte wieder.
select public.test_visible_as('anon', '', 'posts', 1602, 1,
  'K7) Nach dem Speichern: der Gast sieht den öffentlichen Beitrag von 61');
select public.test_visible_as('anon', '', 'listings', 1241, 1,
  'K7) Nach dem Speichern: der Gast sieht den öffentlichen Börsen-Eintrag von 61');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1601, 1,
  'K7) Nach dem Speichern: Mitglied 63 sieht den privaten Beitrag von 61 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1242, 1,
  'K7) Nach dem Speichern: Mitglied 63 sieht den privaten Börsen-Eintrag von 61 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1341, 1,
  'K7) Nach dem Speichern: Mitglied 63 sieht das private Projekt von 61 wieder');
-- K8) Gegenproben: Ein Eintrag, den das Mitglied selbst auf privat gestellt hat, bleibt zu, und Konto 62 bleibt unberührt.
select public.test_visible_as('anon', '', 'posts', 1601, 0,
  'K8) Gegenprobe: der private Beitrag von 61 bleibt für den Gast zu (is_public wirkt weiter)');
select public.test_flag('posts', 1602, true,
  'K8) Gegenprobe: is_public des Beitrags von 61 ist unverändert true');
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000062' and not author_age_ok),
  'K8) Gegenprobe: Konto 62 über 16 hat author_age_ok = true und bleibt unberührt');
select public.test_visible_as('anon', '', 'posts', 1621, 1,
  'K8) Gegenprobe: der Gast sieht den Beitrag von Konto 62 über 16');

-- ---------- B) Das Speichern durch einen ANDEREN: der Admin setzt den Status ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000065', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-01-01')$q$,
  'B1) Konto 65 trägt ein Datum unter 16 ein');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000065')
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000065' and author_age_ok),
  'B1) Konto 65 unter 16: author_age_ok ist für 65 false');
update public.member_birthdates set birthdate = (current_date - interval '16 years')::date
 where id = '00000000-0000-0000-0000-000000000065';
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000065'::uuid)
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000065' and author_age_ok),
  'B2) Zeitablauf: age_ok(65) ist wahr, author_age_ok bleibt ohne Speichern false');
select public.test_visible_as('anon', '', 'posts', 1651, 0,
  'B2) Gegenprobe ohne Speichern: der Gast sieht den Beitrag von 65 nicht');
-- B3) Gegenprobe: Ein Mitglied ohne Adminrecht kann den Status nicht setzen.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000063', false);
select public.test_error_as('authenticated', $q$select public.test_admin_set_status('00000000-0000-0000-0000-000000000065'::uuid, 'approved')$q$,
  'Nur für Admins.%', 'B3) Gegenprobe: Mitglied 63 (kein Admin) kann den Status von 65 nicht setzen');
-- B4) Der Admin 64 setzt den Status von 65. Das ist ein Speichern durch einen anderen.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_runs_as('authenticated', $q$select public.test_admin_set_status('00000000-0000-0000-0000-000000000065'::uuid, 'approved')$q$,
  'B4) Admin 64 setzt den Status von 65 auf approved');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'B4: keine Kennung nach dem Statuswechsel');
select public.test_check(exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000065')
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000065' and not author_age_ok),
  'B5) Nach dem Statuswechsel durch den Admin: author_age_ok ist für 65 wieder true');
select public.test_visible_as('anon', '', 'posts', 1651, 1,
  'B5) Nach dem Statuswechsel durch den Admin: der Gast sieht den Beitrag von 65');

-- ---------- C) Profil-Speichern bei einem Konto, das weiter unter 16 ist ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-06-01')$q$,
  'C1) Konto 71 trägt ein Datum unter 16 ein');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000071' and author_age_ok)
  and exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000071'),
  'C1) Konto 71 unter 16: author_age_ok ist false');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000071', false);
select public.test_rows_as('authenticated', $q$update public.profiles set about = 'Profil unter 16' where id = '00000000-0000-0000-0000-000000000071'$q$, 1,
  'C2) Konto 71 unter 16 speichert sein Profil (eine Zeile, ohne Fehler)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not public.age_ok('00000000-0000-0000-0000-000000000071'::uuid)
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000071' and author_age_ok),
  'C3) Konto 71 ist weiter unter 16: author_age_ok bleibt false');
select public.test_visible_as('anon', '', 'posts', 1711, 0,
  'C4) Gegenprobe: der Gast sieht den Beitrag von 71 nicht');

-- ---------- D) Ein Fehler im Nachziehen verhindert das Speichern NICHT ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-03-01')$q$,
  'D1) Konto 72 trägt ein Datum unter 16 ein');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000072' and author_age_ok),
  'D1) Konto 72 unter 16: author_age_ok ist false');
update public.member_birthdates set birthdate = (current_date - interval '16 years')::date
 where id = '00000000-0000-0000-0000-000000000072';
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000072'::uuid)
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000072' and author_age_ok),
  'D2) Zeitablauf: age_ok(72) ist wahr, die Spalte ist veraltet false');
-- Der Bruch: Ein BEFORE-Trigger auf posts, der nur das Nachziehen für Konto 72 trifft. age_ok bleibt unberührt, und die
--   Stelle, die für alle anderen Konten nachzieht, bleibt unverändert. Er wird nach D7 entfernt.
create function public.test_break_posts() returns trigger language plpgsql as $$
begin raise exception 'TEST-BRUCH: Nachziehen von author_age_ok bricht absichtlich ab'; end $$;
create trigger test_break_posts before update on public.posts for each row
  when (old.author_id = '00000000-0000-0000-0000-000000000072')
  execute function public.test_break_posts();
do $$ declare msg text; begin
  begin
    perform public.sync_author_age_ok('00000000-0000-0000-0000-000000000072'::uuid);
  exception when others then
    msg := sqlerrm;
  end;
  if msg is null then raise exception 'TEST FEHLGESCHLAGEN (D3): der Bruch greift nicht, sync_author_age_ok(72) läuft durch'; end if;
  raise notice 'OK: D3) Der Bruch ist scharf: sync_author_age_ok(72) wirft (%)', msg;
end $$;
-- D4) Speichern trotz Bruch: Das Profil wird geschrieben, ohne Fehler. Das ist die Zusage.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', false);
select public.test_rows_as('authenticated', $q$update public.profiles set about = 'Profil trotz Bruch' where id = '00000000-0000-0000-0000-000000000072'$q$, 1,
  'D4) Speichern trotz Bruch: das Profil wird geschrieben und das Speichern schlägt nicht fehl');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000072' and about = 'Profil trotz Bruch'),
  'D5) Das Profil steht nach dem Speichern in der Tabelle (es ist nicht zurückgerollt)');
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000072' and author_age_ok),
  'D6) Nach dem Bruch bleibt author_age_ok veraltet false (das Nachziehen ist ganz zurückgerollt, nicht halb ausgeführt)');
select public.test_visible_as('anon', '', 'posts', 1721, 0,
  'D6) Nach dem Bruch sieht der Gast den Beitrag von 72 nicht (veraltete Spalte, bewusste Folge)');
-- D7) Der Bruch wird entfernt. Das nächste Speichern holt das Nachziehen nach.
drop trigger test_break_posts on public.posts;
drop function public.test_break_posts();
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000072', false);
select public.test_rows_as('authenticated', $q$update public.profiles set about = 'Profil ohne Bruch' where id = '00000000-0000-0000-0000-000000000072'$q$, 1,
  'D7) Nach dem Entfernen des Bruchs: das nächste Speichern läuft durch');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000072' and not author_age_ok),
  'D7) Nach dem nächsten Speichern: author_age_ok ist für 72 wieder true');
select public.test_visible_as('anon', '', 'posts', 1721, 1,
  'D7) Nach dem nächsten Speichern: der Gast sieht den Beitrag von 72');

-- ---------- E) Die Geburtsdatums-Funktionen ziehen nach, auch ohne Speichern des Profils ----------
-- Der Trigger auf profiles wird für E und F ausgeschaltet. So zieht allein die Funktion nach.
alter table public.profiles disable trigger sync_author_age_ok;
select public.test_check(exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'profiles' and t.tgname = 'sync_author_age_ok' and t.tgenabled = 'D'),
  'E) Vorbedingung: der Trigger auf profiles ist für E und F ausgeschaltet (allein die Funktion zieht nach)');
-- E1) Der Admin trägt für 73 ein Datum unter 16 ein. Die Spalte geht per admin_set_birthdate() auf false.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_runs_as('authenticated', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000073'::uuid, '2016-03-01')$q$,
  'E1) Admin 64 trägt für 73 ein Datum unter 16 ein (admin_set_birthdate)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000073' and author_age_ok),
  'E1) Nach admin_set_birthdate(): author_age_ok für 73 ist false (ohne Profil-Speichern)');
update public.member_birthdates set birthdate = (current_date - interval '16 years')::date
 where id = '00000000-0000-0000-0000-000000000073';
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000073'::uuid)
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000073' and author_age_ok),
  'E2) Zeitablauf: age_ok(73) ist wahr, die Spalte bleibt ohne Funktionsaufruf false');
-- E3) Der Admin berichtigt das Datum nach oben. Die Funktion zieht die Spalte auf true, ohne Profil-Speichern.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_runs_as('authenticated', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000073'::uuid, '2000-01-01')$q$,
  'E3) Admin 64 berichtigt das Datum von 73 nach oben');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000073' and not author_age_ok),
  'E4) Nach admin_set_birthdate() nach oben: author_age_ok für 73 ist wieder true, ohne Profil-Speichern');
select public.test_visible_as('anon', '', 'posts', 1731, 1,
  'E4) Nach der Berichtigung nach oben: der Gast sieht den Beitrag von 73');

-- ---------- F) set_my_birthdate() zieht aufwärts und abwärts nach, ohne Profil-Speichern ----------
-- F1) Konto 74 nach dem Stichtag ohne Datum: author_age_ok false, der Gast sieht den Beitrag nicht.
update public.posts set author_age_ok = false where author_id = '00000000-0000-0000-0000-000000000074';
select public.test_visible_as('anon', '', 'posts', 1741, 0,
  'F1) Vor dem Eintragen: der Gast sieht den Beitrag von 74 nicht (author_age_ok false)');
-- F2) Konto 74 trägt ein Datum über 16 ein. set_my_birthdate() zieht die Spalte auf true, ohne Profil-Speichern.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000074', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2000-01-01')$q$,
  'F2) Konto 74 trägt ein Datum über 16 ein (aufwärts)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000074' and not author_age_ok),
  'F2) Nach set_my_birthdate() aufwärts: author_age_ok für 74 ist true, ohne Profil-Speichern');
select public.test_visible_as('anon', '', 'posts', 1741, 1,
  'F2) Nach set_my_birthdate() aufwärts: der Gast sieht den Beitrag von 74');
-- F3) Gegenprobe abwärts: Konto 75 nach dem Stichtag ohne Datum trägt ein Datum unter 16 ein. Die Funktion zieht die
--   Spalte auf false.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000075', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-01-01')$q$,
  'F3) Konto 75 trägt ein Datum unter 16 ein (abwärts)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000075' and author_age_ok),
  'F3) Gegenprobe abwärts: set_my_birthdate() unter 16 setzt author_age_ok für 75 auf false');
select public.test_visible_as('anon', '', 'posts', 1751, 0,
  'F3) Gegenprobe abwärts: der Gast sieht den Beitrag von 75 nicht');

-- Trigger wieder einschalten und prüfen.
alter table public.profiles enable trigger sync_author_age_ok;
select public.test_check(exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where c.relname = 'profiles' and t.tgname = 'sync_author_age_ok' and t.tgenabled = 'O'),
  'E/F) Der Trigger auf profiles ist wieder eingeschaltet');

-- ---------- G) Rechte: sync_author_age_ok(uuid) ist für anon, authenticated und service_role nicht ausführbar ----------
select public.test_expect_uid('', 'G: keine Kennung vor den Rechteprüfungen');
select public.test_denied_as('anon', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000062'::uuid)$q$,
  'G1) anon: sync_author_age_ok(uuid) ist nicht ausführbar');
select public.test_denied_as('authenticated', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000062'::uuid)$q$,
  'G1) authenticated: sync_author_age_ok(uuid) ist nicht ausführbar');
select public.test_denied_as('service_role', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000062'::uuid)$q$,
  'G1) service_role: sync_author_age_ok(uuid) ist nicht ausführbar');
-- Gegenprobe mit erteiltem Recht, danach wieder entziehen. Konto 62 hat nichts zu ändern, der Aufruf läuft also durch.
grant execute on function public.sync_author_age_ok(uuid) to anon;
select public.test_runs_as('anon', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000062'::uuid)$q$,
  'G1) Gegenprobe anon: sync_author_age_ok(uuid) läuft mit erteiltem Recht');
revoke execute on function public.sync_author_age_ok(uuid) from anon;
grant execute on function public.sync_author_age_ok(uuid) to authenticated;
select public.test_runs_as('authenticated', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000062'::uuid)$q$,
  'G1) Gegenprobe authenticated: sync_author_age_ok(uuid) läuft mit erteiltem Recht');
revoke execute on function public.sync_author_age_ok(uuid) from authenticated;
grant execute on function public.sync_author_age_ok(uuid) to service_role;
select public.test_runs_as('service_role', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000062'::uuid)$q$,
  'G1) Gegenprobe service_role: sync_author_age_ok(uuid) läuft mit erteiltem Recht');
revoke execute on function public.sync_author_age_ok(uuid) from service_role;
-- PUBLIC: Über proacl wird geprüft, ob PUBLIC ein EXECUTE hat. NULL bedeutet Standardrecht, und das gibt PUBLIC EXECUTE.
select public.test_check(coalesce((select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       from pg_proc p where p.oid = 'public.sync_author_age_ok(uuid)'::regprocedure), false),
  'G2) PUBLIC: sync_author_age_ok(uuid) hat kein EXECUTE (proacl gesetzt, ohne PUBLIC)');
-- Der Trigger selbst: anon, authenticated und service_role haben kein EXECUTE auf die Triggerfunktion.
select public.test_check(not has_function_privilege('anon', 'public.profiles_sync_author_age_ok()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.profiles_sync_author_age_ok()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.profiles_sync_author_age_ok()', 'EXECUTE'),
  'G3) Die Triggerfunktion profiles_sync_author_age_ok() hat für anon, authenticated und service_role kein EXECUTE');
-- Endzustand der Rechte, wie in 20261118230000 gesetzt.
select public.test_check(not has_function_privilege('anon', 'public.sync_author_age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.sync_author_age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.sync_author_age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_my_birthdate(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.set_my_birthdate(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_my_birthdate(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.age_ok(uuid)', 'EXECUTE'),
  'G4) Endzustand: sync_author_age_ok ist für alle drei Rollen gesperrt, die Schreibfunktionen für authenticated offen');

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Spalte author_age_ok folgt dem Alter, auch ohne Geburtstags-Ereignis)'; end $$;
