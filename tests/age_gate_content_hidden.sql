-- Inhalte eines als unter 16 erkannten Kontos sind für GÄSTE und MITGLIEDER nicht lesbar, für Admins schon
--   (supabase/migrations/20261118200000_altersgrenze_inhalte_verbergen.sql).
-- Die Spalte author_age_ok und die Klausel "and author_age_ok" in den drei Leseregeln verbergen die Inhalte.
--   is_public wird von der Migration und von den Geburtsdatums-Funktionen NICHT verändert.
-- Geprüft wird:
--   A) Vorher-Beleg: Vor der Migration liest ein Mitglied über 16 die privaten Inhalte eines Kontos unter 16.
--      Nach der Migration sind sie für Gast und Mitglied zu, für den Admin nicht. Das Konto über 16 bleibt lesbar.
--      Bestandskonto unter 16: Nachtrag über den Bestand. Konto vor dem Stichtag ohne Datum bleibt unberührt.
--      Richtungsprobe: ein vom Admin ausgeblendeter Inhalt (is_public = false) bleibt nach jedem Lauf ausgeblendet.
--      Zweiter Lauf des Nachtrags schreibt keine Zeile (Prüfsumme über xmin).
--   B) Konto 68, ohne Datum vor dem Stichtag: vor dem Eintragen lesbar. Nach einem Datum unter 16: Gast, Mitglied
--      und das Konto selbst sehen nichts, der Admin sieht weiter. is_public bleibt true.
--      B3: Mitglieder können author_age_ok nicht selbst setzen, eigene Inhalte (body) aber schon.
--      B4: Berichtigung nach oben durch den Admin: die Inhalte sind danach wieder lesbar, ohne is_public anzufassen.
--      B5: Aufwärts über set_my_birthdate(): Konto 59 (nach Stichtag, ohne Datum) trägt ein Datum über 16 ein, seine
--      Inhalte sind danach für Gast und Mitglied wieder lesbar. Gegenprobe: vorher unsichtbar.
--   A6) Anlegen: Konto 55 (unter 16) und Konto 59 (ohne Datum) können nichts anlegen. Konto 62 (über 16) kann es, die
--      neue Zeile hat author_age_ok = true, und der Gast sieht sie. Gegenprobe: dasselbe Anlegen von 62 klappt.
--   C) Zusagen zum Trigger: Ein Mitglied mit einem Beitrag älter als 30 Minuten kann set_my_birthdate() aufrufen,
--      und ein Admin kann admin_set_birthdate() für ein Konto mit einem alten Beitrag aufrufen. Beides ohne Fehler.
--      Gegenprobe: ein is_public-Update auf denselben alten Beitrag aus einer SECURITY-DEFINER-Funktion wirft.
--   D) Gast und Mitglied sehen Inhalte eines Kontos vor dem Stichtag ohne Datum weiter, Konto nach dem Stichtag ohne
--      Datum sieht niemand außer dem Admin.
--   E) Ein Konto unter 16 kann keinen eigenen Inhalt wieder öffentlich schalten. Gegenprobe: ein Konto über 16 darf.
--   F) Rechte: service_role und anon haben kein EXECUTE auf age_ok(uuid), set_my_birthdate(text) und
--      admin_set_birthdate(uuid, text). Jeweils erst Ablehnung, dann Gegenprobe mit erteiltem Recht, dann Entzug.
-- Jede Zusage hat eine Gegenprobe: derselbe Weg mit einer Eingabe, die die Regel nicht auslösen darf, oder mit dem
--   Recht, das den Befund erklärt. So zeigt der Test, dass die Regel greift und nicht ein fehlender Stub.
--
-- DER TRIGGER enforce_post_edit_window (20261028220000) IST IM POSTS-STUB GELADEN, mit dem Rumpf aus dieser Datei.
--   Er wirft bei jeder Änderung von is_public, wenn auth.uid() nicht der Autor ist oder der Beitrag älter als
--   30 Minuten ist. Trigger feuern auch bei SECURITY DEFINER. Ein Stub ohne ihn hat den Fehler zweimal durchgelassen:
--   Die Migration sähe richtig aus, und der Test wäre trotzdem grün gewesen, obwohl die is_public-Updates aus den
--   Geburtsdatums-Funktionen in Produktion gescheitert wären. Deshalb steht der Trigger im Stub, und Abschnitt C
--   prüft, dass er scharf ist. Der Trigger wird aus der Migrationsdatei 20261028220000 geladen, nicht nachgebaut.
--
-- Die Standardrechte (alter default privileges) stehen VOR den Tabellen, wie in Produktion. Die Sperre kommt in diesem
--   Test allein aus den Policies, nicht aus fehlenden Rechten.
-- Die Leseregeln VOR der Migration sind wie in Produktion (is_public-basiert), angelegt NACH der Altersregel-Kette,
--   weil sie is_approved_member() und is_active_member() brauchen.
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_content_hidden.sql
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

-- ---------- Vorbedingungen VOR der Migration ----------
select public.test_check(exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relname = 'posts' and t.tgname = 'enforce_post_edit_window' and not t.tgisinternal),
  'Vorbedingung: der Trigger enforce_post_edit_window liegt auf posts (aus 20261028220000, nicht nachgebaut)');
select public.test_check(not exists (select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'posts' and column_name = 'author_age_ok'),
  'Vorbedingung: author_age_ok gibt es vor der Migration noch nicht');
select public.test_check(has_function_privilege('service_role', 'public.age_ok(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.set_my_birthdate(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE'),
  'Vorbedingung: vor der Migration hat service_role EXECUTE auf die drei Funktionen (Standardrecht beim Anlegen)');
select public.test_check(not exists (select 1 from pg_policies where schemaname = 'public'
         and tablename in ('posts', 'listings', 'projects') and qual like '%author_age_ok%'),
  'Vorbedingung: die Leseregeln kennen author_age_ok vor der Migration noch nicht');

-- ---------- Seeds: Konten (als Eigentümer angelegt, also ohne RLS) ----------
-- 55 unter 16, Bestand mit Datum vor dem Lauf. 56 über 16 mit Datum, Bestand. 59 nach dem Stichtag ohne Datum.
-- 61 unter 16 wird in A über set_my_birthdate() eingetragen. 62 Autor über 16, 63 Mitglied über 16, 64 Admin.
-- 66 vor dem Stichtag ohne Datum. 67 und 69 haben je einen alten Beitrag (Abschnitt C). 68 ohne Datum vor dem Stichtag (B).
-- Alle außer 55, 56, 59 sind vor dem Stichtag angelegt, wie in Produktion (alle Bestandskonten liegen davor).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000055', 'bestand-unter16@x.de', now(), jsonb_build_object('name', 'Bestand Unter', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000056', 'bestand-ueber16@x.de', now(), jsonb_build_object('name', 'Bestand Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000059', 'nach-stichtag-ohne-datum@x.de', now(), jsonb_build_object('name', 'Nach Stichtag', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000061', 'bestand-unter16-m@x.de', now(), jsonb_build_object('name', 'Unter Sechzehn', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000062', 'autor-ueber16@x.de', now(), jsonb_build_object('name', 'Autor Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000063', 'mitglied-ueber16@x.de', now(), jsonb_build_object('name', 'Mitglied Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000064', 'admin-h@x.de', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000066', 'bestand-vor-stichtag@x.de', now(), jsonb_build_object('name', 'Bestand Vor Stichtag', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000067', 'alt-beitrag-mitglied@x.de', now(), jsonb_build_object('name', 'Alt Mitglied', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000068', 'unter16-ohne-datum@x.de', now(), jsonb_build_object('name', 'Ohne Datum', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000069', 'alt-beitrag-ziel@x.de', now(), jsonb_build_object('name', 'Alt Ziel', 'headline', 'Baut eine Firma'));
update public.profiles set status = 'approved'
 where id in ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000056',
              '00000000-0000-0000-0000-000000000059', '00000000-0000-0000-0000-000000000061',
              '00000000-0000-0000-0000-000000000062', '00000000-0000-0000-0000-000000000063',
              '00000000-0000-0000-0000-000000000066', '00000000-0000-0000-0000-000000000067',
              '00000000-0000-0000-0000-000000000068', '00000000-0000-0000-0000-000000000069');
update public.profiles set status = 'approved', is_admin = true where id = '00000000-0000-0000-0000-000000000064';
-- Vor dem Stichtag angelegt (Bestandsschutz). 59 bleibt nach dem Stichtag, also ohne Anpassung.
update public.profiles set created_at = public.age_check_start() - interval '1 day'
 where id in ('00000000-0000-0000-0000-000000000055', '00000000-0000-0000-0000-000000000056',
              '00000000-0000-0000-0000-000000000061', '00000000-0000-0000-0000-000000000062',
              '00000000-0000-0000-0000-000000000063', '00000000-0000-0000-0000-000000000064',
              '00000000-0000-0000-0000-000000000066', '00000000-0000-0000-0000-000000000067',
              '00000000-0000-0000-0000-000000000068', '00000000-0000-0000-0000-000000000069');
-- Bestandsdatum für 55 (unter 16) und 56 (über 16). Vor dem Lauf eingetragen, also ohne set_my_birthdate().
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000055', (current_date - interval '10 years')::date),
  ('00000000-0000-0000-0000-000000000056', (current_date - interval '20 years')::date);

-- Vorbedingung: Konten vor dem Stichtag ohne Datum gelten als über 16, Konto 59 nach dem Stichtag ohne Datum nicht.
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000061'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000063'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000066'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000068'::uuid)
  and not public.age_ok('00000000-0000-0000-0000-000000000059'::uuid),
  'Vorbedingung: Konten vor dem Stichtag ohne Datum gelten als über 16, Konto 59 nach dem Stichtag ohne Datum nicht');

-- Inhalte. Alle Beiträge mit created_at jetzt, außer 1671 und 1691 (älter als 30 Minuten, für Abschnitt C).
-- created_at wird im INSERT gesetzt und nicht nachträglich geändert: enforce_post_edit_window verbietet jede Änderung
--   von created_at, auch beim Anlegen per Eigentümer.
insert into public.posts (id, author_id, kind, body, is_public, created_at) values
  (1671, '00000000-0000-0000-0000-000000000067', 'update', 'Alt, öffentlich, Mitglied 67', true, now() - interval '2 hours'),
  (1691, '00000000-0000-0000-0000-000000000069', 'update', 'Alt, öffentlich, Ziel 69', true, now() - interval '2 hours');
insert into public.posts (id, author_id, kind, body, is_public) values
  (1141, '00000000-0000-0000-0000-000000000055', 'update', 'Öffentlich, Bestand unter 16', true),
  (1151, '00000000-0000-0000-0000-000000000056', 'update', 'Öffentlich, Bestand über 16', true),
  (1171, '00000000-0000-0000-0000-000000000056', 'update', 'Vom Admin ausgeblendet, Konto über 16', false),
  (1591, '00000000-0000-0000-0000-000000000059', 'update', 'Öffentlich, nach Stichtag ohne Datum', true),
  (1601, '00000000-0000-0000-0000-000000000061', 'update', 'Privater Beitrag 61', false),
  (1602, '00000000-0000-0000-0000-000000000061', 'update', 'Öffentlicher Beitrag 61', true),
  (1621, '00000000-0000-0000-0000-000000000062', 'update', 'Öffentlicher Beitrag 62', true),
  (1622, '00000000-0000-0000-0000-000000000062', 'update', 'Privater Beitrag 62', false),
  (1661, '00000000-0000-0000-0000-000000000066', 'update', 'Öffentlich, vor Stichtag ohne Datum', true),
  (1681, '00000000-0000-0000-0000-000000000068', 'update', 'Privater Beitrag 68', false),
  (1682, '00000000-0000-0000-0000-000000000068', 'update', 'Öffentlicher Beitrag 68', true);
insert into public.listings (id, author_id, type, category, title, is_public) values
  (1241, '00000000-0000-0000-0000-000000000055', 'suche', 'x', 'Öffentlich 55', true),
  (1251, '00000000-0000-0000-0000-000000000056', 'suche', 'x', 'Öffentlich 56', true),
  (1591, '00000000-0000-0000-0000-000000000059', 'suche', 'x', 'Öffentlich 59', true),
  (1601, '00000000-0000-0000-0000-000000000061', 'suche', 'x', 'Privat 61', false),
  (1621, '00000000-0000-0000-0000-000000000062', 'biete', 'x', 'Öffentlich 62', true),
  (1622, '00000000-0000-0000-0000-000000000062', 'biete', 'x', 'Privat 62', false),
  (1681, '00000000-0000-0000-0000-000000000068', 'suche', 'x', 'Privat 68', false);
insert into public.projects (id, owner_id, title, pitch, is_public) values
  (1341, '00000000-0000-0000-0000-000000000055', 'Öffentlich 55', 'Pitch', true),
  (1351, '00000000-0000-0000-0000-000000000056', 'Öffentlich 56', 'Pitch', true),
  (1591, '00000000-0000-0000-0000-000000000059', 'Öffentlich 59', 'Pitch', true),
  (1601, '00000000-0000-0000-0000-000000000061', 'Privat 61', 'Pitch', false),
  (1621, '00000000-0000-0000-0000-000000000062', 'Öffentlich 62', 'Pitch', true),
  (1622, '00000000-0000-0000-0000-000000000062', 'Privat 62', 'Pitch', false),
  (1681, '00000000-0000-0000-0000-000000000068', 'Privat 68', 'Pitch', false);

-- Hash des Inhalts VOR dem ersten Lauf. Ohne ihn wäre der Nachweis der Idempotenz unten wertlos.
select public.test_content_hash() as h_vor_lauf1 \gset

-- ---------- A) Vor der Migration: die Lücke ----------
-- A1) Konto 61 trägt ein Datum unter 16 ein, über die Funktion der Vorfassung (ohne author_age_ok).
select public.test_expect_uid('', 'A1: Vorbedingung, keine Kennung vor dem Eintragen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-01-01')$q$,
  'A1: Konto 61 trägt ein Datum unter 16 ein (Vorfassung läuft)');
select public.test_expect_uid('00000000-0000-0000-0000-000000000061', 'A1: Kennung ist 61 während des Eintragens');
select set_config('request.jwt.claim.sub', '', false);
-- A2) Vorher-Beleg: Das Mitglied über 16 (63) liest die privaten Inhalte von 61, und der Gast liest den öffentlichen
--   Beitrag von 61. Das ist die Lücke, vor der die Migration steht.
select public.test_expect_uid('', 'A2: keine Kennung');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1601, 1,
  'A2) Vorher-Beleg (Lücke): Mitglied 63 liest den privaten Beitrag von 61, obwohl 61 unter 16 ist');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1601, 1,
  'A2) Vorher-Beleg (Lücke): Mitglied 63 liest den privaten Börsen-Eintrag von 61');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1601, 1,
  'A2) Vorher-Beleg (Lücke): Mitglied 63 liest das private Projekt von 61');
select public.test_visible_as('anon', '', 'posts', 1602, 1,
  'A2) Vorher-Beleg: der Gast liest den öffentlichen Beitrag von 61 (is_public ist noch gesetzt)');
select public.test_visible_as('anon', '', 'posts', 1141, 1,
  'A2) Vorher-Beleg: der Gast liest den öffentlichen Beitrag des Bestandskontos 55 unter 16');

-- ---------- Die Migration unter Test, erster Lauf ----------
\i supabase/migrations/20261118200000_altersgrenze_inhalte_verbergen.sql

-- Vorbedingungen nach dem Lauf: Die Funktionen sind die neuen Fassungen, und die Leseregeln tragen die Klausel.
select public.test_check(position('author_age_ok = public.age_ok(uid)' in pg_get_functiondef('public.set_my_birthdate(text)'::regprocedure)) > 0
  and position('author_age_ok = public.age_ok(p_id)' in pg_get_functiondef('public.admin_set_birthdate(uuid, text)'::regprocedure)) > 0,
  'Vorbedingung: set_my_birthdate() und admin_set_birthdate() sind die neuen Fassungen mit dem Abgleich von author_age_ok');
select public.test_check(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'Beiträge lesen' and qual like '%author_age_ok%')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listings' and policyname = 'Börse lesen' and qual like '%author_age_ok%')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Projekte lesen' and qual like '%author_age_ok%'),
  'Vorbedingung: die drei Leseregeln enthalten die Klausel author_age_ok');
select public.test_check(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'Beiträge lesen' and permissive = 'PERMISSIVE' and roles = '{anon,authenticated}' and cmd = 'SELECT')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listings' and policyname = 'Börse lesen' and permissive = 'PERMISSIVE' and roles = '{anon,authenticated}' and cmd = 'SELECT')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'Projekte lesen' and permissive = 'PERMISSIVE' and roles = '{anon,authenticated}' and cmd = 'SELECT'),
  'Vorbedingung: die drei Leseregeln sind PERMISSIVE, für anon und authenticated, Befehl SELECT (wie gemessen)');

-- ---------- A3) Nach der Migration: Konto 61 unter 16 ist für Gast und Mitglied zu ----------
select public.test_expect_uid('', 'A3: keine Kennung');
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000061' and author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000061' and author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000061' and author_age_ok),
  'A3) Nachtrag: author_age_ok ist für alle Zeilen von 61 auf false');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1601, 0,
  'A3) Nach der Migration: Mitglied 63 liest den privaten Beitrag von 61 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1601, 0,
  'A3) Nach der Migration: Mitglied 63 liest den privaten Börsen-Eintrag von 61 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1601, 0,
  'A3) Nach der Migration: Mitglied 63 liest das private Projekt von 61 nicht mehr');
select public.test_visible_as('anon', '', 'posts', 1602, 0,
  'A3) Nach der Migration: der Gast liest den öffentlichen Beitrag von 61 nicht mehr (author_age_ok = false)');
select public.test_flag('posts', 1602, true,
  'A3) is_public des Beitrags von 61 ist unverändert true (die Migration fasst is_public nicht an)');
-- Gegenprobe: Der Autor über 16 (62) bleibt für Gast und Mitglied lesbar.
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1621, 1,
  'A3) Gegenprobe: Mitglied 63 liest den Beitrag des Kontos über 16 (62) weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1621, 1,
  'A3) Gegenprobe: Mitglied 63 liest den Börsen-Eintrag des Kontos über 16 (62) weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1621, 1,
  'A3) Gegenprobe: Mitglied 63 liest das Projekt des Kontos über 16 (62) weiter');
select public.test_visible_as('anon', '', 'posts', 1621, 1,
  'A3) Gegenprobe: der Gast liest den öffentlichen Beitrag des Kontos über 16 (62)');
-- Der Admin sieht die zurückgehaltenen Inhalte von 61 weiter (Admin-Zweig außerhalb der Klammer).
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1601, 1,
  'A3) Admin 64 sieht den privaten Beitrag von 61 weiter (Moderation, Auskunft nach Art. 15)');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1602, 1,
  'A3) Admin 64 sieht den öffentlichen Beitrag von 61 weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'projects', 1601, 1,
  'A3) Admin 64 sieht das private Projekt von 61 weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'listings', 1601, 1,
  'A3) Admin 64 sieht den privaten Börsen-Eintrag von 61 weiter (Moderation, Auskunft nach Art. 15)');
-- Konto 61 sieht seine eigenen Inhalte nicht (bewusste Folge, siehe Kopf der Migration).
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000061', 'posts', 1601, 0,
  'A3) Bewusste Folge: Konto 61 sieht seinen eigenen privaten Beitrag nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000061', 'projects', 1601, 0,
  'A3) Bewusste Folge: Konto 61 sieht sein eigenes Projekt nicht');

-- ---------- A4) Bestand: Konto 55 (unter 16) per Nachtrag, Konto 56 (über 16) unberührt, Richtungsprobe ----------
select public.test_expect_uid('', 'A4: keine Kennung');
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000055' and author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000055' and author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000055' and author_age_ok),
  'A4) Nachtrag: die Inhalte des Bestandskontos 55 unter 16 haben author_age_ok = false');
select public.test_visible_as('anon', '', 'posts', 1141, 0,
  'A4) Der Gast liest den öffentlichen Beitrag des Bestandskontos 55 nicht mehr');
select public.test_flag('posts', 1141, true,
  'A4) is_public des Bestandsbeitrags 55 ist unverändert true');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1241, 0,
  'A4) Mitglied 63 liest den Börsen-Eintrag des Bestandskontos 55 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1341, 0,
  'A4) Mitglied 63 liest das Projekt des Bestandskontos 55 nicht mehr');
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000056' and not author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000056' and not author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000056' and not author_age_ok),
  'A4) Konto 56 über 16: author_age_ok bleibt für alle Zeilen true');
select public.test_visible_as('anon', '', 'posts', 1151, 1,
  'A4) Gegenprobe: der Gast liest den öffentlichen Beitrag des Kontos 56 über 16 weiter');
-- Richtungsprobe: Eine vom Admin ausgeblendete Zeile (is_public = false) bleibt ausgeblendet, auch nach dem Lauf.
select public.test_flag('posts', 1171, false,
  'A4) Richtungsprobe: der vom Admin ausgeblendete Beitrag 1171 bleibt is_public = false');
select public.test_visible_as('anon', '', 'posts', 1171, 0,
  'A4) Richtungsprobe: der Gast liest den vom Admin ausgeblendeten Beitrag 1171 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1171, 1,
  'A4) Richtungsprobe: der Admin sieht den ausgeblendeten Beitrag 1171 weiter');
-- Konto 66 vor dem Stichtag ohne Datum (Bestandsschutz): author_age_ok bleibt true, Inhalt bleibt öffentlich.
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000066'::uuid)
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000066' and not author_age_ok),
  'A4) Konto 66 (vor Stichtag, ohne Datum) hat author_age_ok = true und ist vom Nachtrag unberührt');
select public.test_visible_as('anon', '', 'posts', 1661, 1,
  'A4) Konto 66 (vor Stichtag, ohne Datum): der Gast liest den öffentlichen Beitrag');
-- Konto 59 nach dem Stichtag ohne Datum: der Nachtrag erfasst es.
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000059' and author_age_ok),
  'A4) Konto 59 (nach Stichtag, ohne Datum): author_age_ok ist false');
select public.test_visible_as('anon', '', 'posts', 1591, 0,
  'A4) Konto 59 (nach Stichtag, ohne Datum): der Gast liest den Beitrag nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1591, 0,
  'A4) Konto 59 (nach Stichtag, ohne Datum): Mitglied 63 liest den Beitrag nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1591, 1,
  'A4) Konto 59 (nach Stichtag, ohne Datum): der Admin sieht den Beitrag weiter');
select public.test_flag('posts', 1591, true,
  'A4) Konto 59 (nach Stichtag, ohne Datum): is_public bleibt true');

-- ---------- A5) Idempotenz: ein zweiter Lauf des Nachtrags schreibt keine Zeile ----------
select public.test_content_hash() as h_nach_lauf1 \gset
select public.test_check(:'h_vor_lauf1' <> :'h_nach_lauf1',
  'A5) Gegenprobe: die Prüfsumme sieht den ersten Lauf als Änderung (sonst wäre der Nachweis unten wertlos)');
\i supabase/migrations/20261118200000_altersgrenze_inhalte_verbergen.sql
select public.test_content_hash() as h_nach_lauf2 \gset
select public.test_check(:'h_nach_lauf1' = :'h_nach_lauf2',
  'A5) Zweiter Lauf der Migration schreibt keine Zeile in posts, listings und projects (gleiche Prüfsumme)');
select public.test_flag('posts', 1171, false,
  'A5) Richtungsprobe nach dem zweiten Lauf: der ausgeblendete Beitrag 1171 bleibt is_public = false');

-- ---------- A6) Anlegen: Altersregel, Standardwert true, und der Gast sieht den neuen Inhalt ----------
-- Konto 59 hat hier noch kein Datum (das trägt B5 ein). Konto 55 hat ein Bestandsdatum unter 16.
select public.test_check(not public.age_ok('00000000-0000-0000-0000-000000000055'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000062'::uuid),
  'A6: Vorbedingung: Konto 55 gilt als unter 16, Konto 62 als über 16');
-- Ablehnung von 55 über die Altersregel. Gegenprobe unten: dasselbe Anlegen von 62 klappt. Gleiche Rolle, gleiche
--   Grants, gleiche Policies. Nur das Alter unterscheidet die beiden. Ein fehlendes Recht träfe also auch 62.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000055', false);
select public.test_denied_as('authenticated', $q$insert into public.posts (kind, body, is_public) values ('update', 'Anlage 55', true)$q$,
  'A6) Konto 55 (unter 16, Datum hinterlegt) kann keinen Beitrag anlegen');
select public.test_denied_as('authenticated', $q$insert into public.listings (type, category, title, body, is_public) values ('suche', 'x', 'Anlage 55', '', true)$q$,
  'A6) Konto 55 (unter 16) kann keinen Börsen-Eintrag anlegen');
select public.test_denied_as('authenticated', $q$insert into public.projects (title, pitch, body, phase, place, is_public) values ('Anlage 55', 'Pitch', '', '', '', true)$q$,
  'A6) Konto 55 (unter 16) kann kein Projekt anlegen');
select public.test_expect_uid('00000000-0000-0000-0000-000000000055', 'A6: Kennung ist 55 während der Ablehnungen');
-- Konto 59: nach dem Stichtag ohne Datum, also nichts anlegen.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000059', false);
select public.test_denied_as('authenticated', $q$insert into public.posts (kind, body, is_public) values ('update', 'Anlage 59', true)$q$,
  'A6) Konto 59 (nach Stichtag, ohne Datum) kann keinen Beitrag anlegen');
select public.test_denied_as('authenticated', $q$insert into public.listings (type, category, title, body, is_public) values ('suche', 'x', 'Anlage 59', '', true)$q$,
  'A6) Konto 59 (nach Stichtag, ohne Datum) kann keinen Börsen-Eintrag anlegen');
select public.test_denied_as('authenticated', $q$insert into public.projects (title, pitch, body, phase, place, is_public) values ('Anlage 59', 'Pitch', '', '', '', true)$q$,
  'A6) Konto 59 (nach Stichtag, ohne Datum) kann kein Projekt anlegen');
select public.test_expect_uid('00000000-0000-0000-0000-000000000059', 'A6: Kennung ist 59 während der Ablehnungen');
-- Gegenprobe: Konto 62 (über 16) legt dasselbe an. Die Zeilen bekommen die Kennung 62 aus dem Standardwert.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', false);
select public.test_rows_as('authenticated', $q$insert into public.posts (kind, body, is_public) values ('update', 'Anlage 62 Beitrag', true)$q$, 1,
  'A6) Gegenprobe Konto 62 (über 16): derselbe Beitrag-Insert klappt (1 Zeile)');
select public.test_rows_as('authenticated', $q$insert into public.listings (type, category, title, body, is_public) values ('suche', 'x', 'Anlage 62 Börse', '', true)$q$, 1,
  'A6) Gegenprobe Konto 62 (über 16): derselbe Börsen-Insert klappt (1 Zeile)');
select public.test_rows_as('authenticated', $q$insert into public.projects (title, pitch, body, phase, place, is_public) values ('Anlage 62 Projekt', 'Pitch', '', '', '', true)$q$, 1,
  'A6) Gegenprobe Konto 62 (über 16): dasselbe Projekt klappt (1 Zeile)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'A6: keine Kennung nach den Anlagen');
-- Die Ids vergibt die Identity-Spalte, die Grants erlauben sie nicht. Deshalb über den eindeutigen Text finden (als Eigentümer).
select max(id) as anlage_beitrag_62 from public.posts where body = 'Anlage 62 Beitrag' \gset
select max(id) as anlage_boerse_62 from public.listings where title = 'Anlage 62 Börse' \gset
select max(id) as anlage_projekt_62 from public.projects where title = 'Anlage 62 Projekt' \gset
-- Die neuen Zeilen haben author_age_ok = true (Standardwert). Mit default false stünde hier false.
select public.test_check(coalesce((select author_age_ok from public.posts where id = :anlage_beitrag_62), false),
  'A6) Die neue Zeile von 62 in posts hat author_age_ok = true (Standardwert)');
select public.test_check(coalesce((select author_age_ok from public.listings where id = :anlage_boerse_62), false),
  'A6) Die neue Zeile von 62 in listings hat author_age_ok = true (Standardwert)');
select public.test_check(coalesce((select author_age_ok from public.projects where id = :anlage_projekt_62), false),
  'A6) Die neue Zeile von 62 in projects hat author_age_ok = true (Standardwert)');
-- Der GAST sieht die drei neuen Zeilen.
select public.test_visible_as('anon', '', 'posts', :anlage_beitrag_62, 1,
  'A6) Der GAST sieht den neuen Beitrag von 62');
select public.test_visible_as('anon', '', 'listings', :anlage_boerse_62, 1,
  'A6) Der GAST sieht den neuen Börsen-Eintrag von 62');
select public.test_visible_as('anon', '', 'projects', :anlage_projekt_62, 1,
  'A6) Der GAST sieht das neue Projekt von 62');

-- ---------- B) Konto 68, ohne Datum vor dem Stichtag ----------
-- B1) Vor dem Eintragen ist alles lesbar.
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1681, 1,
  'B1) Gegenprobe VOR dem Eintragen: Mitglied 63 liest den privaten Beitrag von 68');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1681, 1,
  'B1) Gegenprobe VOR dem Eintragen: Mitglied 63 liest den privaten Börsen-Eintrag von 68');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1681, 1,
  'B1) Gegenprobe VOR dem Eintragen: Mitglied 63 liest das private Projekt von 68');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000068', 'projects', 1681, 1,
  'B1) Gegenprobe VOR dem Eintragen: Konto 68 sieht sein eigenes Projekt');
select public.test_visible_as('anon', '', 'posts', 1682, 1,
  'B1) Gegenprobe VOR dem Eintragen: der Gast liest den öffentlichen Beitrag von 68');

-- B2) Konto 68 trägt ein Datum unter 16 ein (Funktion aus der Migration).
select public.test_expect_uid('', 'B2: keine Kennung vor dem Eintragen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000068', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-01-01')$q$,
  'B2) Konto 68 trägt ein Datum unter 16 ein (Funktion aus der Migration)');
select public.test_expect_uid('00000000-0000-0000-0000-000000000068', 'B2: Kennung ist 68 während des Eintragens');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'B2: keine Kennung nach dem Eintragen');
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000068' and author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000068' and author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000068' and author_age_ok),
  'B2) Nach dem Datum: author_age_ok ist für alle Zeilen von 68 auf false');
select public.test_flag('posts', 1682, true,
  'B2) is_public des öffentlichen Beitrags von 68 bleibt true (nur author_age_ok wird gezogen)');
select public.test_visible_as('anon', '', 'posts', 1682, 0,
  'B2) Gast liest den öffentlichen Beitrag von 68 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1681, 0,
  'B2) Mitglied 63 liest den privaten Beitrag von 68 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1681, 0,
  'B2) Mitglied 63 liest den privaten Börsen-Eintrag von 68 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1681, 0,
  'B2) Mitglied 63 liest das private Projekt von 68 nicht mehr');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1681, 1,
  'B2) Admin 64 sieht den privaten Beitrag von 68 weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1682, 1,
  'B2) Admin 64 sieht den öffentlichen Beitrag von 68 weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'projects', 1681, 1,
  'B2) Admin 64 sieht das private Projekt von 68 weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'listings', 1681, 1,
  'B2) Admin 64 sieht den privaten Börsen-Eintrag von 68 weiter');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000068', 'posts', 1681, 0,
  'B2) Konto 68 sieht seinen eigenen Beitrag nicht (bewusste Folge, siehe Kopf der Migration)');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000068', 'listings', 1681, 0,
  'B2) Konto 68 sieht seinen eigenen Börsen-Eintrag nicht (bewusste Folge)');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000068', 'projects', 1681, 0,
  'B2) Konto 68 sieht sein eigenes Projekt nicht (bewusste Folge)');
-- Gegenprobe: Das Konto über 16 (62) bleibt für Mitglied 63 lesbar, auch nach dem Datum von 68.
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1621, 1,
  'B2) Gegenprobe: Mitglied 63 liest das Projekt von 62 (über 16) weiter');

-- B3) Rechte: Ein Mitglied kann author_age_ok nicht setzen, eigene Inhalte aber schon.
select public.test_check(
  not has_column_privilege('authenticated', 'public.posts', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.posts', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.listings', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.listings', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.projects', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.projects', 'author_age_ok', 'INSERT')
  and not has_column_privilege('anon', 'public.posts', 'author_age_ok', 'UPDATE'),
  'B3) authenticated hat kein UPDATE- und kein INSERT-Recht auf author_age_ok (alle drei Tabellen)');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000068', false);
select public.test_denied_as('authenticated', $q$update public.posts set author_age_ok = true where id = 1681$q$,
  'B3) Konto 68 kann author_age_ok auf seinem eigenen Beitrag nicht auf true setzen');
select public.test_expect_uid('00000000-0000-0000-0000-000000000068', 'B3: Kennung ist 68');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', false);
select public.test_denied_as('authenticated', $q$update public.posts set author_age_ok = false where id = 1621$q$,
  'B3) Autor 62 kann author_age_ok auf seinem Beitrag nicht setzen');
-- Gegenprobe mit Recht: Der Autor darf seinen eigenen Beitrag ändern, und zwar die Spalte body.
select public.test_rows_as('authenticated', $q$update public.posts set body = 'Geändert' where id = 1621$q$, 1,
  'B3) Gegenprobe: Autor 62 darf body auf seinem Beitrag ändern (1 Zeile)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'B3: keine Kennung nach den Rechteprüfungen');

-- B4) Berichtigung nach oben durch den Admin: die Inhalte sind danach wieder lesbar, ohne is_public anzufassen.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_runs_as('authenticated', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000068'::uuid, '2000-01-01')$q$,
  'B4) Admin 64 berichtigt das Datum von 68 nach oben');
select public.test_expect_uid('00000000-0000-0000-0000-000000000064', 'B4: Kennung ist 64 während der Berichtigung');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'B4: keine Kennung nach der Berichtigung');
select public.test_check((select count(*) from public.posts where author_id = '00000000-0000-0000-0000-000000000068' and author_age_ok) = 2
  and (select count(*) from public.listings where author_id = '00000000-0000-0000-0000-000000000068' and author_age_ok) = 1
  and (select count(*) from public.projects where owner_id = '00000000-0000-0000-0000-000000000068' and author_age_ok) = 1,
  'B4) Nach der Berichtigung nach oben: author_age_ok ist wieder true (alle Zeilen von 68)');
select public.test_flag('posts', 1682, true,
  'B4) is_public des Beitrags von 68 ist unverändert true (die Berichtigung fasst is_public nicht an)');
-- Der Gast liest sofort wieder, weil is_public noch gesetzt ist und author_age_ok wieder true ist.
select public.test_visible_as('anon', '', 'posts', 1682, 1,
  'B4) Der Gast liest den öffentlichen Beitrag von 68 nach der Berichtigung wieder');
-- Freischaltung: admin_set_birthdate() stuft nur herunter und schaltet nicht frei. In Produktion übernimmt das die
--   Automatik beim nächsten Speichern des Profils. Hier als Eigentümer nachgestellt. Das ist eine SIMULATION der App,
--   nicht Teil der Migration. Ohne sie sieht 68 seine Inhalte nicht, weil is_approved_member() den Status braucht.
update public.profiles set status = 'approved' where id = '00000000-0000-0000-0000-000000000068';
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1681, 1,
  'B4) Mitglied 63 liest den privaten Beitrag von 68 wieder, ohne is_public zu ändern');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1681, 1,
  'B4) Mitglied 63 liest den privaten Börsen-Eintrag von 68 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1681, 1,
  'B4) Mitglied 63 liest das private Projekt von 68 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000068', 'posts', 1681, 1,
  'B4) Konto 68 sieht seinen eigenen Beitrag nach der Berichtigung wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000068', 'projects', 1681, 1,
  'B4) Konto 68 sieht sein eigenes Projekt nach der Berichtigung wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000064', 'posts', 1681, 1,
  'B4) Admin 64 sieht den Beitrag von 68 nach der Berichtigung weiter');

-- ---------- B5) Aufwärts: Konto 59 trägt nach dem Stichtag ein Datum über 16 ein, seine Inhalte kommen zurück ----------
-- Konto 59 ist nach dem Stichtag ohne Datum. Der Nachtrag (A4) hat seine Inhalte auf author_age_ok = false gesetzt.
--   Trägt es jetzt ein Datum über 16 ein, muss set_my_birthdate() die Spalte wieder auf true ziehen. Sonst bleibt der
--   Inhalt für alle außer dem Admin verborgen, obwohl das Konto über 16 ist. Gegenprobe: vorher unsichtbar.
select public.test_expect_uid('', 'B5: keine Kennung vor der Gegenprobe');
select public.test_visible_as('anon', '', 'posts', 1591, 0,
  'B5) Gegenprobe VOR dem Eintragen: der Gast liest den Beitrag von 59 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1591, 0,
  'B5) Gegenprobe VOR dem Eintragen: Mitglied 63 liest den Beitrag von 59 nicht');
select public.test_visible_as('anon', '', 'listings', 1591, 0,
  'B5) Gegenprobe VOR dem Eintragen: der Gast liest den Börsen-Eintrag von 59 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1591, 0,
  'B5) Gegenprobe VOR dem Eintragen: Mitglied 63 liest den Börsen-Eintrag von 59 nicht');
select public.test_visible_as('anon', '', 'projects', 1591, 0,
  'B5) Gegenprobe VOR dem Eintragen: der Gast liest das Projekt von 59 nicht');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1591, 0,
  'B5) Gegenprobe VOR dem Eintragen: Mitglied 63 liest das Projekt von 59 nicht');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000059', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2000-01-01')$q$,
  'B5) Konto 59 trägt ein Datum über 16 ein (Funktion aus der Migration)');
select public.test_expect_uid('00000000-0000-0000-0000-000000000059', 'B5: Kennung ist 59 während des Eintragens');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'B5: keine Kennung nach dem Eintragen');
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000059'::uuid)
  and not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000059' and not author_age_ok)
  and not exists (select 1 from public.listings where author_id = '00000000-0000-0000-0000-000000000059' and not author_age_ok)
  and not exists (select 1 from public.projects where owner_id = '00000000-0000-0000-0000-000000000059' and not author_age_ok),
  'B5) Nach dem Datum über 16: author_age_ok ist für alle Zeilen von 59 wieder true');
select public.test_visible_as('anon', '', 'posts', 1591, 1,
  'B5) Der GAST liest den Beitrag von 59 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1591, 1,
  'B5) Mitglied 63 liest den Beitrag von 59 wieder');
select public.test_visible_as('anon', '', 'listings', 1591, 1,
  'B5) Der GAST liest den Börsen-Eintrag von 59 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'listings', 1591, 1,
  'B5) Mitglied 63 liest den Börsen-Eintrag von 59 wieder');
select public.test_visible_as('anon', '', 'projects', 1591, 1,
  'B5) Der GAST liest das Projekt von 59 wieder');
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'projects', 1591, 1,
  'B5) Mitglied 63 liest das Projekt von 59 wieder');
select public.test_flag('posts', 1591, true,
  'B5) is_public des Beitrags von 59 ist unverändert true (nur author_age_ok wurde gezogen)');

-- ---------- C) Zusagen zum Trigger: ein Beitrag älter als 30 Minuten ----------
-- C0) Vorbedingung: Der Trigger ist scharf, und die Beiträge sind älter als 30 Minuten.
select public.test_check(exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relname = 'posts' and t.tgname = 'enforce_post_edit_window' and not t.tgisinternal)
  and (select created_at from public.posts where id = 1671) < clock_timestamp() - interval '30 minutes'
  and (select created_at from public.posts where id = 1691) < clock_timestamp() - interval '30 minutes',
  'C0) Vorbedingung: der Trigger liegt auf posts, und die Beiträge 1671 und 1691 sind älter als 30 Minuten');
-- C1) Zusage: Ein Mitglied mit einem Beitrag älter als 30 Minuten kann set_my_birthdate() aufrufen, ohne Fehler.
select public.test_expect_uid('', 'C1: keine Kennung vor dem Eintragen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000067', false);
select public.test_runs_as('authenticated', $q$select public.set_my_birthdate('2016-01-01')$q$,
  'C1) Zusage: Mitglied 67 mit altem Beitrag trägt ein Datum unter 16 ein, ohne Fehler');
select public.test_expect_uid('00000000-0000-0000-0000-000000000067', 'C1: Kennung ist 67 während des Eintragens');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000067' and author_age_ok),
  'C1) Der alte Beitrag von 67 hat author_age_ok = false');
select public.test_flag('posts', 1671, true,
  'C1) Der alte Beitrag von 67 bleibt is_public = true (der Trigger wurde nicht ausgelöst)');
-- C2) Zusage: Ein Admin kann admin_set_birthdate() für ein Konto mit altem Beitrag aufrufen, ohne Fehler.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_runs_as('authenticated', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000069'::uuid, '2016-01-01')$q$,
  'C2) Zusage: Admin 64 trägt für Konto 69 mit altem Beitrag ein Datum unter 16 ein, ohne Fehler');
select public.test_expect_uid('00000000-0000-0000-0000-000000000064', 'C2: Kennung ist 64 während der Berichtigung');
select set_config('request.jwt.claim.sub', '', false);
select public.test_check(not exists (select 1 from public.posts where author_id = '00000000-0000-0000-0000-000000000069' and author_age_ok),
  'C2) Der alte Beitrag von 69 hat author_age_ok = false');
select public.test_flag('posts', 1691, true,
  'C2) Der alte Beitrag von 69 bleibt is_public = true (der Trigger wurde nicht ausgelöst)');
-- C3) Gegenprobe: Der Trigger ist wirklich scharf. Ein is_public-Update aus einer SECURITY-DEFINER-Funktion heraus
--   wirft auf den alten Beitrag. Mit der Kennung des Autors greift die 30-Minuten-Regel, mit der des Admins die Autorenregel.
select public.test_expect_uid('', 'C3: vor der Gegenprobe keine Kennung');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000067', false);
select public.test_expect_uid('00000000-0000-0000-0000-000000000067', 'C3: Kennung ist 67 (Autor des alten Beitrags)');
select public.test_raises_as('authenticated', $q$select public.test_is_public_update_definer(1671)$q$,
  'Die 30 Minuten%', 'C3) Gegenprobe: is_public-Update auf den alten Beitrag von 67 wirft (Autor, 30-Minuten-Regel)');
select public.test_flag('posts', 1671, true,
  'C3) Gegenprobe: nach dem geworfenen Update ist der Beitrag von 67 unverändert true');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_raises_as('authenticated', $q$select public.test_is_public_update_definer(1691)$q$,
  'Du kannst nur deine eigenen%', 'C3) Gegenprobe: is_public-Update auf den Beitrag von 69 wirft für den Admin (Autorenregel)');
select public.test_expect_uid('00000000-0000-0000-0000-000000000064', 'C3: Kennung ist 64 vor dem Zurücksetzen');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'C3: keine Kennung nach den Gegenproben');

-- ---------- D) Konto vor dem Stichtag ohne Datum bleibt für Mitglieder lesbar (Gegenprobe zu 59 in A4) ----------
-- Der Nachweis für Konto 59 (nach dem Stichtag, ohne Datum) steht in A4. Hier die Gegenprobe zu 66: vor dem Stichtag
--   gilt das Konto als über 16, also ist der öffentliche Beitrag für das Mitglied lesbar.
select public.test_visible_as('authenticated', '00000000-0000-0000-0000-000000000063', 'posts', 1661, 1,
  'D) Gegenprobe: Mitglied 63 liest den Beitrag von 66 (vor Stichtag, ohne Datum)');

-- ---------- E) Ein Konto unter 16 kann nichts wieder öffentlich schalten (Altersgrenze aus 20261118140000) ----------
select public.test_check(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts'
            and policyname = 'Altersgrenze: nichts ändern' and permissive = 'RESTRICTIVE')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listings'
            and policyname = 'Altersgrenze: nichts ändern' and permissive = 'RESTRICTIVE')
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects'
            and policyname = 'Altersgrenze: nichts ändern' and permissive = 'RESTRICTIVE'),
  'E) Vorbedingung: die restriktive Policy "Altersgrenze: nichts ändern" liegt auf allen drei Tabellen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000061', false);
select public.test_rows_as('authenticated', $q$update public.posts set is_public = true where id = 1601$q$, 0,
  'E) Konto 61 unter 16 kann seinen privaten Beitrag nicht wieder öffentlich schalten (0 Zeilen)');
select public.test_rows_as('authenticated', $q$update public.listings set is_public = true where id = 1601$q$, 0,
  'E) Konto 61 unter 16 kann seinen privaten Börsen-Eintrag nicht wieder öffentlich schalten (0 Zeilen)');
select public.test_rows_as('authenticated', $q$update public.projects set is_public = true where id = 1601$q$, 0,
  'E) Konto 61 unter 16 kann sein privates Projekt nicht wieder öffentlich schalten (0 Zeilen)');
select public.test_expect_uid('00000000-0000-0000-0000-000000000061', 'E: Kennung ist 61 während des Schreibversuchs');
select set_config('request.jwt.claim.sub', '', false);
select public.test_flag('posts', 1601, false, 'E) Der Beitrag von 61 bleibt privat');
-- Gegenprobe mit Recht: Ein Konto über 16 darf denselben Weg gehen. Ohne diese Zeilen wäre das Ergebnis oben
--   auch ein Fehler in der Rolle oder in der Policy, nicht die Altersregel.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000062', false);
select public.test_rows_as('authenticated', $q$update public.posts set is_public = true where id = 1622$q$, 1,
  'E) Gegenprobe über 16: Konto 62 darf seinen privaten Beitrag öffentlich schalten (1 Zeile)');
select public.test_rows_as('authenticated', $q$update public.listings set is_public = true where id = 1622$q$, 1,
  'E) Gegenprobe über 16: Konto 62 darf seinen privaten Börsen-Eintrag öffentlich schalten (1 Zeile)');
select public.test_rows_as('authenticated', $q$update public.projects set is_public = true where id = 1622$q$, 1,
  'E) Gegenprobe über 16: Konto 62 darf sein privates Projekt öffentlich schalten (1 Zeile)');
select public.test_expect_uid('00000000-0000-0000-0000-000000000062', 'E: Kennung ist 62 während der Gegenprobe');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'E: keine Kennung nach der Gegenprobe');

-- ---------- F) Der Dienstschlüssel und der Gast haben kein Orakel über das Alter und keinen Zugriff auf die Funktionen ----------
-- Vorbedingung Zustand: Die Kennung ist leer, bevor die Rechte geprüft werden. set role wechselt nur die Rolle, nicht
--   die Kennung. Deshalb wird sie hier ausdrücklich gelöscht und belegt.
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'F: Vorbedingung, keine Kennung vor den Rechteprüfungen');
-- F1) age_ok(uuid): Ablehnung, dann Gegenprobe mit Recht, dann Entzug.
select public.test_denied_as('service_role', $q$select public.age_ok('00000000-0000-0000-0000-000000000061'::uuid)$q$,
  'F1) service_role: age_ok(uuid) ist nicht ausführbar (kein Orakel über das Alter fremder Konten)');
select public.test_denied_as('anon', $q$select public.age_ok('00000000-0000-0000-0000-000000000061'::uuid)$q$,
  'F1) anon: age_ok(uuid) ist nicht ausführbar');
grant execute on function public.age_ok(uuid) to service_role;
select public.test_runs_as('service_role', $q$select public.age_ok('00000000-0000-0000-0000-000000000061'::uuid)$q$,
  'F1) Gegenprobe service_role: age_ok(uuid) läuft mit erteiltem Recht');
revoke execute on function public.age_ok(uuid) from service_role;
-- F2) set_my_birthdate(text): Ablehnung, Gegenprobe mit Recht (Regel antwortet ohne Kennung), Entzug.
select public.test_denied_as('service_role', $q$select public.set_my_birthdate('2000-01-01')$q$,
  'F2) service_role: set_my_birthdate(text) ist nicht ausführbar');
select public.test_denied_as('anon', $q$select public.set_my_birthdate('2000-01-01')$q$,
  'F2) anon: set_my_birthdate(text) ist nicht ausführbar');
grant execute on function public.set_my_birthdate(text) to service_role;
select public.test_error_as('service_role', $q$select public.set_my_birthdate('2000-01-01')$q$, 'Bitte melde dich an.%',
  'F2) Gegenprobe service_role: set_my_birthdate(text) läuft mit Recht bis zur eigenen Prüfung (ohne Kennung)');
revoke execute on function public.set_my_birthdate(text) from service_role;
-- F3) admin_set_birthdate(uuid, text): Ablehnung, Gegenprobe mit Recht, Entzug.
select public.test_denied_as('service_role', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000062'::uuid, '2000-01-01')$q$,
  'F3) service_role: admin_set_birthdate(uuid, text) ist nicht ausführbar');
select public.test_denied_as('anon', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000062'::uuid, '2000-01-01')$q$,
  'F3) anon: admin_set_birthdate(uuid, text) ist nicht ausführbar');
grant execute on function public.admin_set_birthdate(uuid, text) to service_role;
select public.test_error_as('service_role', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000062'::uuid, '2000-01-01')$q$, 'Nur für Admins.%',
  'F3) Gegenprobe service_role: admin_set_birthdate(uuid, text) läuft mit Recht bis zur Admin-Prüfung (ohne Kennung)');
revoke execute on function public.admin_set_birthdate(uuid, text) from service_role;
-- Beweis, dass die Admin-Meldung an der fehlenden Kennung liegt: Mit der Kennung des Admins besteht die Prüfung, und es
--   scheitert erst am Datum. Das Datum ist absichtlich ungültig, damit nichts geschrieben wird.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000064', false);
select public.test_error_as('authenticated', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000062'::uuid, 'kein-datum')$q$,
  'Bitte gib ein gültiges Geburtsdatum an%',
  'F3) Gegenprobe Admin: mit der Admin-Kennung besteht die Admin-Prüfung und scheitert erst am Datum');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'F3: keine Kennung nach der Admin-Gegenprobe');
-- F4) PUBLIC: Über proacl wird geprüft, ob PUBLIC ein EXECUTE hat. NULL bedeutet Standardrecht, und das gibt PUBLIC
--   EXECUTE. Deshalb verlangt die Prüfung eine gesetzte proacl ohne PUBLIC.
select public.test_check(coalesce((select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       from pg_proc p where p.oid = 'public.set_my_birthdate(text)'::regprocedure), false),
  'F4) PUBLIC: set_my_birthdate(text) hat kein EXECUTE (proacl gesetzt, ohne PUBLIC)');
select public.test_check(coalesce((select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       from pg_proc p where p.oid = 'public.admin_set_birthdate(uuid, text)'::regprocedure), false),
  'F4) PUBLIC: admin_set_birthdate(uuid, text) hat kein EXECUTE (proacl gesetzt, ohne PUBLIC)');
select public.test_check(coalesce((select p.proacl is not null and not exists (select 1 from aclexplode(p.proacl) a
         where a.grantee = 0 and a.privilege_type = 'EXECUTE')
       from pg_proc p where p.oid = 'public.age_ok(uuid)'::regprocedure), false),
  'F4) PUBLIC: age_ok(uuid) hat kein EXECUTE (proacl gesetzt, ohne PUBLIC)');
-- Gegenprobe PUBLIC: Mit erteiltem PUBLIC-Recht läuft die Funktion bis zur eigenen Prüfung, dann wird wieder entzogen.
grant execute on function public.set_my_birthdate(text) to public;
select public.test_error_as('anon', $q$select public.set_my_birthdate('2000-01-01')$q$, 'Bitte melde dich an.%',
  'F4) Gegenprobe PUBLIC (über anon): set_my_birthdate(text) läuft mit PUBLIC-Recht bis zur eigenen Prüfung');
revoke execute on function public.set_my_birthdate(text) from public;
grant execute on function public.admin_set_birthdate(uuid, text) to public;
select public.test_error_as('anon', $q$select public.admin_set_birthdate('00000000-0000-0000-0000-000000000062'::uuid, '2000-01-01')$q$, 'Nur für Admins.%',
  'F4) Gegenprobe PUBLIC (über anon): admin_set_birthdate(uuid, text) läuft mit PUBLIC-Recht bis zur Admin-Prüfung');
revoke execute on function public.admin_set_birthdate(uuid, text) from public;
-- Entzug bestätigen: Nach allen Gegenproben hat niemand außer authenticated ein EXECUTE auf die drei Funktionen.
select public.test_check(not has_function_privilege('anon', 'public.set_my_birthdate(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.set_my_birthdate(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.age_ok(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.set_my_birthdate(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_set_birthdate(uuid, text)', 'EXECUTE'),
  'F) Endzustand: anon und service_role haben kein EXECUTE auf die drei Funktionen, authenticated hat es auf die beiden Schreibfunktionen');

do $$ begin raise notice 'ALLE PRÜFUNGEN BESTANDEN (Inhalte für Gäste und Mitglieder verborgen, Migration 20261118200000)'; end $$;
