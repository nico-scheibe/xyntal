-- Verbirgt Kommentare, Kommentar-Reaktionen, Beitrags-Likes, Börsen-Likes und Kommentare an Börse und Projekten
--   eines als unter 16 erkannten Kontos vor GÄSTEN und MITGLIEDERN. Admins sehen sie weiter.
--   Gehört zu supabase/migrations/20261118240000_altersgrenze_kommentare_verbergen.sql.
--
-- VORAUSGESETZT UND GELADEN, nicht Teil der Migration unter Test: 20261118200000 (Spalten und Leseregeln für Beiträge,
--   Börse und Projekte) und 20261118230000 (sync_author_age_ok mit drei Updates, Trigger auf profiles). Sie laufen in
--   diesem Test VOR der Migration unter Test.
--
-- Geprüft wird, jede Zusage mit Gegenprobe:
--   A) Vorher: Mitglied 83 und Gast sehen Kommentar, Reaktion, Likes und Kommentare des Kontos 81 (unter 16).
--   a) Nachher: Mitglied 83 sieht von 81 nichts mehr. Gegenprobe: A.
--   b) Admin 84 sieht die Zeilen von 81 in allen fünf Tabellen einzeln. Bei post_likes, listing_likes und
--      content_comments ist das der neue Admin-Zweig.
--   c) Konto 82 (über 16) bleibt sichtbar, in allen fünf Tabellen. Wichtigste Gegenprobe.
--   d) Ein Kommentar von 81 an einem FREMDEN, weiter sichtbaren Projekt (4001) ist verborgen. Das ist der Fall, der
--      ohne die Migration offen bliebe. Gegenprobe: das Projekt ist für den Gast sichtbar, der Kommentar von 82 an ihm auch.
--   e) Der Trigger auf profiles zieht die fünf Tabellen am Geburtstag nach: Konto 86 mit veraltetem Wert, Profil
--      speichern, danach sichtbar. Gegenprobe: vorher verborgen. Dasselbe für Beitrag, Börse und Projekt von 86.
--   f) Ein Mitglied kann author_age_ok auf keiner der fünf Tabellen setzen (Anlegen und Ändern). Gegenprobe: ein
--      normaler Kommentar des Mitglieds gelingt.
--   g) Die vier Indizes existieren auf der richtigen Spalte.
--   h) Der Nachtrag richtet veraltete Werte in beide Richtungen. Ein zweiter Lauf schreibt keine Zeile (xmin-Prüfsumme).
--   i) sync_author_age_ok ist für anon, authenticated, service_role und PUBLIC nicht ausführbar. Gegenprobe mit
--      erteiltem Recht, dann Entzug.
--
-- DIE STANDARDRECHTE (alter default privileges) stehen VOR den Tabellen, wie in Produktion. Ohne sie wäre jede
--   Rechte-Zusage selbsterfüllend. Die Sperre kommt in diesem Test allein aus den Policies, nicht aus fehlenden Rechten.
-- DIE TRIGGER UND ANLEGE-REGELN werden aus den Migrationsdateien geladen, nicht nachgebaut: 20261028220000,
--   20261028230500, 20261027163301, 20261028150000, 20261118140000 und supabase/008_listing_likes.sql. Die Ausnahmen
--   stehen bei den Stubs. Alle acht Trigger auf den Tabellen prüft Block Vorbedingungen.
-- NACH EINEM ROLLENWECHSEL wirkt eine Kennung nach. Deshalb setzt jeder Aufruf die Kennung ausdrücklich und stellt die
--   vorige wieder her (test_seen, test_denied_as). Vor und nach jeder Gruppe prüft test_expect_uid, dass keine Kennung übrig ist.
-- ZWEI LÄUFE DERSELBEN MIGRATION: Die Spalte entsteht erst im ersten Lauf, deshalb lassen sich veraltete Werte für Block h
--   nur ZWISCHEN Lauf 1 und Lauf 2 setzen, unmittelbar vor Lauf 2 und ohne Profil-Schreiben dazwischen (siehe Block h).
--   Lauf 3 ist die Idempotenzprobe. Für Block e werden die veralteten Werte NACH allen Läufen gesetzt, weil der Trigger
--   auf profiles sie sonst schon korrigiert hätte.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/age_gate_comments_hidden.sql
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

-- ---------- Platzhalter für Funktionen, die spätere Dateien ECHT definieren ----------
-- Postgres prüft beim Anlegen einer Policy, dass jede genannte Funktion existiert. Die Dateien unten (20261028230500,
--   008_listing_likes.sql, 20261027163301) nennen is_approved_member() und is_active_member(). Ohne Platzhalter bricht
--   20261028230500 Zeile 71 ab. Der Vorlage-Test tests/age_gate_content_hidden.sql lädt 20261028230500 NICHT, deshalb hat
--   er keine Platzhalter. Dieser Test lädt die Datei, daher die Platzhalter hier.
-- Die Platzhalter liefern false und werden später ersetzt, ohne dass die Policies neu entstehen:
--   is_active_member(): 20261113130000 Zeile 61 und 20261113140000 Zeile 104 (create or replace, gleiche Signatur).
--   is_approved_member(): die Test-Definition nach der Kette (wörtlich aus 20261118120000 Zeile 45-51, create or replace).
--   create or replace behält die OID der Funktion. Die Policies verweisen auf die OID, zeigen also danach auf die echte
--   Fassung mit Altersprüfung. Vorher wird kein Datensatz geprüft: Die Platzhalter laufen nur beim Laden, und in dieser
--   Zeit wird keine Zeile geschrieben oder gelesen.
-- is_admin() kommt schon aus dem Stub oben (Zeile 118). Es braucht keinen Platzhalter.
create function public.is_approved_member() returns boolean language sql stable as $$ select false $$;
create function public.is_active_member() returns boolean language sql stable as $$ select false $$;

-- ---------- Zähl- und Nebenspalten wie in Produktion ----------
-- posts: like_count und comment_count aus 003_community.sql:13-22. Die Zähler-Trigger unten schreiben sie.
alter table public.posts add column if not exists like_count int not null default 0,
  add column if not exists comment_count int not null default 0;
-- waitlist_cards und messages: nur die Spalten, auf die 20261028150000 Trigger legt (Trigger-Liste der Datei, Zeile 150-160)
--   und messages.created_at für den Index messages_sender_created_idx. Der Rest der Produktionstabellen braucht dieser Test nicht.
alter table public.waitlist_cards add column if not exists pitch text, add column if not exists city text,
  add column if not exists link text, add column if not exists skills text;
alter table public.messages add column if not exists created_at timestamptz not null default now();

-- ---------- post_comments und post_likes, Spalten wörtlich aus 003_community.sql:25-42 ----------
-- parent_id und edited_at kommen über 20261028230500 weiter unten dazu.
create table public.post_comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.posts (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 1500),
  created_at  timestamptz not null default now()
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);

create table public.post_likes (
  post_id     bigint not null references public.posts (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Zähler-Trigger, Wortlaut aus 003_community.sql:76-98.
create function public.update_post_counts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'post_likes' then
    update public.posts
       set like_count = like_count + (case when tg_op = 'INSERT' then 1 else -1 end)
     where id = coalesce(new.post_id, old.post_id);
  else
    update public.posts
       set comment_count = comment_count + (case when tg_op = 'INSERT' then 1 else -1 end)
     where id = coalesce(new.post_id, old.post_id);
  end if;
  return null;
end;
$$;
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.update_post_counts();
create trigger post_comments_count after insert or delete on public.post_comments
  for each row execute function public.update_post_counts();
revoke execute on function public.update_post_counts() from public, anon, authenticated;

-- Antworten, Bearbeiten und Reaktionen: 20261028230500 wird GELADEN. Es legt parent_id, edited_at, den Parent-Trigger,
--   die Tabelle post_comment_reactions mit Regeln und Rechten an. Die Rechte der Tabelle post_comments werden unten gesetzt.
\i supabase/migrations/20261028230500_community_comment_features.sql

-- RLS und Rechte wie in 20261117150000_tabellenrechte_zurueck.sql: post_comments Zeilen 229-246, post_likes Zeilen 255-258.
-- Dieselbe Endform: lesen und löschen für authenticated, eintragen (post_id, body, parent_id), ändern (body, edited_at).
alter table public.post_comments enable row level security;
alter table public.post_likes    enable row level security;
revoke all on public.post_comments from anon, authenticated;
grant select on public.post_comments to authenticated;
grant insert (post_id, body, parent_id) on public.post_comments to authenticated;
grant update (body, edited_at) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;
revoke all on public.post_likes from anon, authenticated;
grant select on public.post_likes to authenticated;
grant insert (post_id) on public.post_likes to authenticated;
grant delete on public.post_likes to authenticated;
-- post_likes bleibt spaltenweise (nur post_id), wie im Repo (20261117150000 Zeile 255-258) und wie gemessen. Gemessen mit
--   table_schema = 'public'. Ohne Schema-Filter misst man gleichnamige Tabellen im Schema xyntal_app mit (siehe Block 4b).

-- Regeln wörtlich aus 003_community.sql:142-152 (post_comments) und 159-169 (post_likes).
create policy "Kommentare lesen" on public.post_comments
  for select to authenticated
  using ((select public.is_approved_member()) or (select public.is_admin()));

create policy "Kommentieren" on public.post_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));

create policy "Eigene Kommentare löschen (Admins alle)" on public.post_comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

create policy "Likes lesen" on public.post_likes
  for select to authenticated
  using ((select public.is_approved_member()));

create policy "Liken" on public.post_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_approved_member()));

create policy "Like zurücknehmen" on public.post_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- listing_likes: 008_listing_likes.sql wird GELADEN (Tabelle, Zähler-Trigger, RLS, Rechte, Regeln) ----------
-- Die Rechte stimmen mit 20261117150000_tabellenrechte_zurueck.sql:104-111 überein.
\i supabase/008_listing_likes.sql

-- ---------- content_comments: 20261027163301 wird GELADEN (Tabelle, Regeln, Rechte, Rate-Trigger) ----------
-- Die Rechte stimmen mit 20261117150000_tabellenrechte_zurueck.sql:75-78 überein.
\i supabase/migrations/20261027163301_content_comments.sql

-- ---------- Schutzfilter: 20261028150000 wird GELADEN ----------
-- Legt content_safety auf post_comments, content_comments und die übrigen Textspalten an. Der Trigger lässt keine
--   Sperrwörter durch. blocked_terms ist leer, also läuft er ohne Wirkung auf die Testtexte.
\i supabase/migrations/20261028150000_content_safety.sql

-- ---------- Prüfhilfen (Testobjekte, nur in dieser Testdatenbank) ----------
-- "if not ok" besteht bei NULL still: not NULL ist NULL, die IF-Bedingung greift nicht. Deshalb "is not true":
--   nur ein echtes true besteht. Eine Prüfung, die bei NULL besteht, ist keine Prüfung. Beispiel: Eine nullbare Spalte
--   author_age_ok hätte jeden neuen Kommentar für alle unsichtbar gemacht, und die Zusage wäre grün geblieben.
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
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

-- ---------- Prüfhilfen für diesen Test ----------
-- Zählt die Zeilen, die Rolle r mit Kennung uid sieht. pred ist ein SQL-Filter, den nur dieser Test setzt. Nötig, weil
--   post_likes und listing_likes keine gemeinsame id haben (Primärschlüssel über zwei Spalten).
-- Die Kennung wird ausdrücklich gesetzt und danach wiederhergestellt. Ein Rest aus einer früheren Gruppe kann nicht wirken.
create function public.test_seen(r text, uid text, tbl text, pred text, want int, label text) returns void language plpgsql as $$
declare n int; old_claim text := current_setting('request.jwt.claim.sub', true);
begin
  execute format('set role %I', r);
  perform set_config('request.jwt.claim.sub', uid, false);
  execute format('select count(*) from public.%I where %s', tbl, pred) into n;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', coalesce(old_claim, ''), false);
  if n is distinct from want then
    raise exception 'TEST FEHLGESCHLAGEN (%): % Zeile(n) sichtbar (erwartet %)', label, n, want;
  end if;
  raise notice 'OK (%): %', r, label;
end $$;
-- Prüfsumme über xmin aller Zeilen der fünf Tabellen. Ändert ein Lauf eine Zeile, bekommt sie eine neue xmin.
create function public.test_social_hash() returns text language sql stable as $$
  select md5(coalesce(string_agg(s, ',' order by s), ''))
    from (select 'pc' || id::text || ':' || xmin::text as s from public.post_comments
          union all select 'pr' || comment_id::text || member_id::text || emoji || ':' || xmin::text from public.post_comment_reactions
          union all select 'pl' || post_id::text || user_id::text || ':' || xmin::text from public.post_likes
          union all select 'll' || listing_id::text || user_id::text || ':' || xmin::text from public.listing_likes
          union all select 'cc' || id::text || ':' || xmin::text from public.content_comments) q
$$;

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

-- ---------- Vorgänger, geladen VOR der Migration unter Test ----------
\i supabase/migrations/20261118200000_altersgrenze_inhalte_verbergen.sql
\i supabase/migrations/20261118230000_altersgrenze_inhalte_nachziehen.sql

-- ---------- Vorbedingungen VOR der Migration unter Test ----------
select public.test_check(not exists (select 1 from information_schema.columns
         where table_schema = 'public' and column_name = 'author_age_ok'
           and table_name in ('post_comments', 'post_comment_reactions', 'post_likes', 'listing_likes', 'content_comments')),
  'Vorbedingung: author_age_ok fehlt auf den fünf Tabellen (die Migration legt die Spalte an)');
select public.test_check((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
         where not t.tgisinternal and (c.relname, t.tgname) in (
           ('post_comments', 'post_comments_count'), ('post_comments', 'post_comments_parent_check'),
           ('post_comments', 'content_safety'), ('post_likes', 'post_likes_count'),
           ('listing_likes', 'listing_likes_count'), ('content_comments', 'content_comments_rate'),
           ('content_comments', 'content_safety'), ('profiles', 'sync_author_age_ok'))) = 8,
  'Vorbedingung: die acht Trigger liegen auf ihren Tabellen (aus den geladenen Migrationsdateien)');
select public.test_check((select count(*) from pg_policies where schemaname = 'public' and roles = '{authenticated}'
         and policyname in ('Kommentare lesen', 'Kommentar-Reaktionen lesen', 'Likes lesen', 'Listing-Likes lesen')) = 4,
  'Vorbedingung: die vier Leseregeln gelten für authenticated');
select public.test_check((select roles::text from pg_policies where schemaname = 'public'
         and tablename = 'content_comments' and policyname = 'Comments follow parent visibility') = '{anon,authenticated}',
  'Vorbedingung: die Leseregel content_comments gilt für anon und authenticated');
select public.test_check(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_comments'
         and policyname = 'Altersgrenze: nichts anlegen')
  and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'content_comments'
         and policyname = 'Altersgrenze: nichts anlegen'),
  'Vorbedingung: "Altersgrenze: nichts anlegen" liegt auf post_comments, nicht auf content_comments (20261118140000)');
-- Die Lücke: NUR post_comment_reactions hat für authenticated tabellenweites INSERT (gemessen mit table_schema = 'public').
--   Block 4b schließt sie. Vor der Migration muss sie hier sichtbar sein, sonst wäre der Rechte-Test f3 nicht aussagekräftig.
--   Die anderen vier Tabellen haben nur spaltenweises INSERT und kein UPDATE. Das prüft f0 nach dem Lauf.
select public.test_check(has_table_privilege('authenticated', 'public.post_comment_reactions', 'INSERT'),
  'Vorbedingung: authenticated hat vor der Migration tabellenweites INSERT auf post_comment_reactions (die Lücke)');
select public.test_check(has_table_privilege('service_role', 'public.post_likes', 'INSERT')
  and has_table_privilege('service_role', 'public.content_comments', 'UPDATE'),
  'Vorbedingung: service_role hat Tabellenrechte aus den Standardrechten (sonst wäre der Rechteentzug selbsterfüllend)');

-- ---------- Seeds: Konten (als Eigentümer angelegt, also ohne RLS) ----------
-- 81 unter 16 (Geburtsdatum vor 14 Jahren). 82 Autor über 16. 83 Mitglied über 16. 84 Admin über 16.
--   86 über 16 mit Geburtsdatum vor 16 Jahren: Block e lässt den Geburtstag "heute" gefallen sein.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000081', 'unter16-k@x.de', now(), jsonb_build_object('name', 'Unter Sechzehn', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000082', 'autor-k@x.de', now(), jsonb_build_object('name', 'Autor Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000083', 'mitglied-k@x.de', now(), jsonb_build_object('name', 'Mitglied Ueber', 'headline', 'Baut eine Firma')),
  ('00000000-0000-0000-0000-000000000084', 'admin-k@x.de', now(), '{}'::jsonb),
  ('00000000-0000-0000-0000-000000000086', 'geburtstag-k@x.de', now(), jsonb_build_object('name', 'Geburtstag', 'headline', 'Baut eine Firma'));
update public.profiles set status = 'approved'
 where id in ('00000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000082',
              '00000000-0000-0000-0000-000000000083', '00000000-0000-0000-0000-000000000086');
update public.profiles set status = 'approved', is_admin = true where id = '00000000-0000-0000-0000-000000000084';
insert into public.member_birthdates (id, birthdate) values
  ('00000000-0000-0000-0000-000000000081', (current_date - interval '14 years')::date),
  ('00000000-0000-0000-0000-000000000082', (current_date - interval '30 years')::date),
  ('00000000-0000-0000-0000-000000000083', (current_date - interval '30 years')::date),
  ('00000000-0000-0000-0000-000000000084', (current_date - interval '30 years')::date),
  ('00000000-0000-0000-0000-000000000086', (current_date - interval '16 years')::date);
select public.test_check(not public.age_ok('00000000-0000-0000-0000-000000000081'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000082'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000083'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000084'::uuid)
  and public.age_ok('00000000-0000-0000-0000-000000000086'::uuid),
  'Vorbedingung: 81 ist unter 16, 82, 83, 84 und 86 sind über 16');

-- Inhalte von 82: Projekt 4001, Beitrag 2001, Börse 3001 (alle öffentlich). Daran hängen Kommentare, Reaktionen und Likes
--   der Konten 81, 82, 83 und 86. Kommentare, Reaktionen und Likes mit explizitem Urheber, als Eigentümer angelegt.
insert into public.projects (id, owner_id, title, pitch, is_public) values (4001, '00000000-0000-0000-0000-000000000082', 'Projekt Ueber', 'Pitch', true);
insert into public.posts (id, author_id, kind, body, is_public) values (2001, '00000000-0000-0000-0000-000000000082', 'update', 'Beitrag Ueber', true);
-- Zweiter Beitrag nur für die Gegenprobe f-gegen4 (ein Like von 83 auf 2001 gibt es schon, also ein neuer Ziel-Beitrag).
insert into public.posts (id, author_id, kind, body, is_public) values (2002, '00000000-0000-0000-0000-000000000082', 'update', 'Beitrag Zwei', true);
insert into public.listings (id, author_id, type, category, title, body, is_public) values (3001, '00000000-0000-0000-0000-000000000082', 'suche', 'x', 'Boerse Ueber', '', true);
insert into public.post_comments (id, post_id, author_id, body) overriding system value values
  (5001, 2001, '00000000-0000-0000-0000-000000000082', 'Kommentar Ueber'),
  (5002, 2001, '00000000-0000-0000-0000-000000000081', 'Kommentar Unter'),
  (5003, 2001, '00000000-0000-0000-0000-000000000086', 'Kommentar Sechzehn');
insert into public.post_comment_reactions (comment_id, member_id, emoji) values
  (5001, '00000000-0000-0000-0000-000000000081', 'ok'),
  (5001, '00000000-0000-0000-0000-000000000083', 'ok'),
  (5001, '00000000-0000-0000-0000-000000000086', 'ok');
insert into public.post_likes (post_id, user_id) values
  (2001, '00000000-0000-0000-0000-000000000081'),
  (2001, '00000000-0000-0000-0000-000000000083'),
  (2001, '00000000-0000-0000-0000-000000000086');
insert into public.listing_likes (listing_id, user_id) values
  (3001, '00000000-0000-0000-0000-000000000081'),
  (3001, '00000000-0000-0000-0000-000000000083'),
  (3001, '00000000-0000-0000-0000-000000000086');
-- Kommentare an Projekt 4001 (fremd, öffentlich) und an Börse 3001.
insert into public.content_comments (id, project_id, author_id, body) overriding system value values
  (6001, 4001, '00000000-0000-0000-0000-000000000081', 'Kommentar Unter Projekt'),
  (6002, 4001, '00000000-0000-0000-0000-000000000082', 'Kommentar Ueber Projekt'),
  (6003, 4001, '00000000-0000-0000-0000-000000000086', 'Kommentar Sechzehn Projekt');
insert into public.content_comments (id, listing_id, author_id, body) overriding system value values
  (6004, 3001, '00000000-0000-0000-0000-000000000081', 'Kommentar Unter Boerse'),
  (6005, 3001, '00000000-0000-0000-0000-000000000082', 'Kommentar Ueber Boerse');

-- ---------- A) Vor der Migration: die Lücke ----------
select public.test_expect_uid('', 'A: keine Kennung vor den Prüfungen');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comments', $p$body = 'Kommentar Unter'$p$, 1,
  'A1: vorher sieht 83 den Kommentar des Kontos 81');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comment_reactions', $p$member_id = '00000000-0000-0000-0000-000000000081'$p$, 1,
  'A2: vorher sieht 83 die Reaktion von 81');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_likes', $p$user_id = '00000000-0000-0000-0000-000000000081'$p$, 1,
  'A3: vorher sieht 83 das Like von 81');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listing_likes', $p$user_id = '00000000-0000-0000-0000-000000000081'$p$, 1,
  'A4: vorher sieht 83 das Börsen-Like von 81');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 1,
  'A5: vorher sieht 83 den Kommentar von 81 am fremden Projekt');
select public.test_seen('anon', '', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 1,
  'A6: vorher sieht der Gast den Kommentar von 81 am fremden Projekt');

-- ---------- Die Migration unter Test: ZWEI Läufe, mit Absicht, plus ein dritter für die Idempotenz ----------
-- WARUM ZWEI LÄUFE: Lauf 1 legt Spalte, Regeln, Indizes und sync_author_age_ok an. Veraltete Werte lassen sich VOR Lauf 1
--   nicht setzen, weil die Spalte dann noch fehlt. Sie stehen deshalb ZWISCHEN Lauf 1 und Lauf 2. Lauf 1 führt den Nachtrag
--   zwar auch aus, aber auf Werten, die noch nicht veraltet sind. Erst Lauf 2 trifft veraltete Werte in beide Richtungen.
-- DER ZWEITE LAUF IST DIE ZUSAGE FÜR DEN NACHTRAG. Entfernt man ihn als überflüssig, prüft h1 nichts, und der Test wird
--   grün, obwohl der Nachtrag fehlt. Deshalb steht hier kein Kommentar, der ihn "wegräumen" lässt.
-- DER DRITTE LAUF IST DIE IDEMPOTENZPROBE (h2): Die Prüfsumme wird NACH Lauf 2 gebildet und nach Lauf 3 verglichen. So misst sie
--   nur, ob Lauf 3 eine Zeile schreibt. Eine Prüfsumme über Lauf 1 bis 3 würde den Nachtrag von Lauf 2 mitmessen.
-- KEIN PROFIL ZWISCHEN DEN LÄUFEN: Der Trigger auf profiles (20261118230000) zieht author_age_ok bei jedem Profil-Schreiben
--   nach. Ein Profil-Schreiben zwischen Lauf 1 und Lauf 2 würde die veralteten Werte vorab richten, und die Zusage des
--   Nachtrags wäre selbsterfüllend. Lauf 1 schreibt kein Profil, und zwischen Lauf 1 und dem Setzen der veralteten Werte
--   steht kein Schreibvorgang auf profiles. Die Werte stehen unmittelbar vor Lauf 2.
\i supabase/migrations/20261118240000_altersgrenze_kommentare_verbergen.sql

-- Veraltete Werte, als postgres, unmittelbar vor Lauf 2. Konto über 16 (82, 83) auf false, Konto unter 16 (81) auf true.
--   In jeder der fünf Tabellen beide Richtungen, damit die Zusage je Tabelle greift.
update public.post_comments set author_age_ok = false where id = 5001;
update public.post_comments set author_age_ok = true  where id = 5002;
update public.content_comments set author_age_ok = false where id = 6002;
update public.content_comments set author_age_ok = true  where id = 6001;
update public.post_likes set author_age_ok = false where user_id = '00000000-0000-0000-0000-000000000083';
update public.post_likes set author_age_ok = true  where user_id = '00000000-0000-0000-0000-000000000081';
update public.listing_likes set author_age_ok = false where user_id = '00000000-0000-0000-0000-000000000083';
update public.listing_likes set author_age_ok = true  where user_id = '00000000-0000-0000-0000-000000000081';
update public.post_comment_reactions set author_age_ok = false where member_id = '00000000-0000-0000-0000-000000000083';
update public.post_comment_reactions set author_age_ok = true  where member_id = '00000000-0000-0000-0000-000000000081';
select public.test_social_hash() as h_vor_lauf2 \gset

-- ---------- Lauf 2: der Nachtrag, beide Richtungen ----------
\i supabase/migrations/20261118240000_altersgrenze_kommentare_verbergen.sql
select public.test_social_hash() as h_nach_lauf2 \gset
select public.test_check(:'h_vor_lauf2' <> :'h_nach_lauf2',
  'h0: Lauf 2 hat die veralteten Werte geändert (Gegenprobe: sonst wäre der Nachtrag-Test leer)');

-- ---------- Lauf 3: Idempotenz ----------
\i supabase/migrations/20261118240000_altersgrenze_kommentare_verbergen.sql
select public.test_social_hash() as h_nach_lauf3 \gset
select public.test_check(:'h_nach_lauf2' = :'h_nach_lauf3',
  'h2: Lauf 3 schreibt keine Zeile (xmin-Prüfsumme nach Lauf 2 gegen nach Lauf 3)');

-- ---------- a) Nach der Migration: Mitglied 83 sieht von Konto 81 nichts mehr ----------
select public.test_expect_uid('', 'a: keine Kennung');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comments', $p$body = 'Kommentar Unter'$p$, 0,
  'a1: nachher sieht 83 den Kommentar von 81 nicht (Gegenprobe A1)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comment_reactions', $p$member_id = '00000000-0000-0000-0000-000000000081'$p$, 0,
  'a2: nachher sieht 83 die Reaktion von 81 nicht (Gegenprobe A2)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_likes', $p$user_id = '00000000-0000-0000-0000-000000000081'$p$, 0,
  'a3: nachher sieht 83 das Like von 81 nicht (Gegenprobe A3)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listing_likes', $p$user_id = '00000000-0000-0000-0000-000000000081'$p$, 0,
  'a4: nachher sieht 83 das Börsen-Like von 81 nicht (Gegenprobe A4)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 0,
  'a5: nachher sieht 83 den Kommentar von 81 am Projekt nicht (Gegenprobe A5)');
select public.test_seen('anon', '', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 0,
  'a6: nachher sieht der Gast den Kommentar von 81 nicht (Gegenprobe A6)');

-- ---------- b) Admin 84 sieht die Zeilen von 81 weiter, in allen fünf Tabellen einzeln ----------
-- 84 ist freigeschaltet und über 16. Der Admin-Zweig greift also wirklich, nicht die Mitgliedsregel.
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000084', 'post_comments', $p$body = 'Kommentar Unter'$p$, 1,
  'b1: Admin 84 sieht den Kommentar von 81 (Admin-Zweig schon vorher da)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000084', 'post_comment_reactions', $p$member_id = '00000000-0000-0000-0000-000000000081'$p$, 1,
  'b2: Admin 84 sieht die Reaktion von 81 (Admin-Zweig schon vorher da)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000084', 'post_likes', $p$user_id = '00000000-0000-0000-0000-000000000081'$p$, 1,
  'b3: Admin 84 sieht das Like von 81 (NEUER Admin-Zweig)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000084', 'listing_likes', $p$user_id = '00000000-0000-0000-0000-000000000081'$p$, 1,
  'b4: Admin 84 sieht das Börsen-Like von 81 (NEUER Admin-Zweig)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000084', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 1,
  'b5: Admin 84 sieht den Kommentar von 81 am Projekt (NEUER Admin-Zweig)');

-- ---------- c) Konto 82 über 16 bleibt sichtbar. Wichtigste Gegenprobe. ----------
-- Die Zeilen von 82 standen vor dem Lauf auf false und müssen durch den Nachtrag wieder true werden.
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comments', $p$body = 'Kommentar Ueber'$p$, 1,
  'c1: Mitglied 83 sieht den Kommentar von 82 (vorher false, nach dem Nachtrag true)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comment_reactions', $p$member_id = '00000000-0000-0000-0000-000000000083'$p$, 1,
  'c2: Mitglied 83 sieht die eigene Reaktion (vorher false, nach dem Nachtrag true)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_likes', $p$user_id = '00000000-0000-0000-0000-000000000083'$p$, 1,
  'c3: Mitglied 83 sieht das eigene Like (vorher false, nach dem Nachtrag true)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listing_likes', $p$user_id = '00000000-0000-0000-0000-000000000083'$p$, 1,
  'c4: Mitglied 83 sieht das eigene Börsen-Like');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Ueber Projekt'$p$, 1,
  'c5: Mitglied 83 sieht den Kommentar von 82 am Projekt (vorher false, nach dem Nachtrag true)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Ueber Boerse'$p$, 1,
  'c6: Mitglied 83 sieht den Kommentar von 82 an der Börse');
select public.test_seen('anon', '', 'content_comments', $p$body = 'Kommentar Ueber Projekt'$p$, 1,
  'c7: Gast sieht den Kommentar von 82 am Projekt');

-- ---------- d) Kommentar von 81 an einem FREMDEN, weiter sichtbaren Projekt ist verborgen ----------
select public.test_seen('anon', '', 'projects', $p$id = 4001$p$, 1,
  'd1: Gegenprobe: das fremde Projekt 4001 ist für den Gast sichtbar');
select public.test_seen('anon', '', 'content_comments', $p$body = 'Kommentar Ueber Projekt'$p$, 1,
  'd2: Gegenprobe: der Kommentar von 82 am selben Projekt ist sichtbar');
select public.test_seen('anon', '', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 0,
  'd3: der Kommentar von 81 am selben Projekt ist für den Gast verborgen');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Unter Projekt'$p$, 0,
  'd4: der Kommentar von 81 am selben Projekt ist für das Mitglied 83 verborgen');

-- ---------- f) Ein Mitglied kann author_age_ok auf keiner der fünf Tabellen setzen ----------
-- f0 ist die Struktur: Kein Recht auf die Spalte, weder beim Anlegen noch beim Ändern, für alle fünf Tabellen.
--   has_column_privilege meldet auch ein tabellenweites Recht als Ja. Deshalb wird die Spalte je Tabelle gemessen,
--   nicht nur die Regel.
select public.test_check(not has_column_privilege('authenticated', 'public.post_comments', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.post_comments', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.post_comment_reactions', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.post_comment_reactions', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.post_likes', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.post_likes', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.listing_likes', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.listing_likes', 'author_age_ok', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.content_comments', 'author_age_ok', 'INSERT')
  and not has_column_privilege('authenticated', 'public.content_comments', 'author_age_ok', 'UPDATE'),
  'f0: authenticated hat auf author_age_ok kein INSERT und kein UPDATE, auf allen fünf Tabellen');
select public.test_check(not has_table_privilege('authenticated', 'public.post_comment_reactions', 'INSERT')
  and not has_table_privilege('authenticated', 'public.post_comment_reactions', 'UPDATE'),
  'f0b: Block 4b hat das tabellenweite INSERT auf post_comment_reactions entfernt, UPDATE bleibt aus');
select public.test_expect_uid('', 'f: keine Kennung vor den Ablehnungen');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000083', false);
select public.test_denied_as('authenticated', $q$insert into public.post_comments (post_id, body, author_age_ok) values (2001, 'Versuch', true)$q$,
  'f1: Anlegen eines Kommentars mit author_age_ok');
select public.test_denied_as('authenticated', $q$update public.post_comments set author_age_ok = true where id = 5001$q$,
  'f2: Ändern eines Kommentars über author_age_ok');
select public.test_denied_as('authenticated', $q$insert into public.post_comment_reactions (comment_id, emoji, author_age_ok) values (5001, 'mm', true)$q$,
  'f3: Anlegen einer Reaktion mit author_age_ok');
select public.test_denied_as('authenticated', $q$update public.post_comment_reactions set author_age_ok = true where member_id = '00000000-0000-0000-0000-000000000083'$q$,
  'f4: Ändern einer Reaktion über author_age_ok');
select public.test_denied_as('authenticated', $q$insert into public.post_likes (post_id, author_age_ok) values (2001, true)$q$,
  'f5: Anlegen eines Likes mit author_age_ok');
select public.test_denied_as('authenticated', $q$update public.post_likes set author_age_ok = true where user_id = '00000000-0000-0000-0000-000000000083'$q$,
  'f6: Ändern eines Likes über author_age_ok');
select public.test_denied_as('authenticated', $q$insert into public.listing_likes (listing_id, author_age_ok) values (3001, true)$q$,
  'f7: Anlegen eines Börsen-Likes mit author_age_ok');
select public.test_denied_as('authenticated', $q$insert into public.content_comments (project_id, body, author_age_ok) values (4001, 'Versuch', true)$q$,
  'f8: Anlegen eines Kommentars an Projekt mit author_age_ok');
select public.test_denied_as('authenticated', $q$update public.content_comments set author_age_ok = true where id = 6005$q$,
  'f9: Ändern eines Börsen-Kommentars über author_age_ok');
select public.test_denied_as('authenticated', $q$update public.listing_likes set author_age_ok = true where user_id = '00000000-0000-0000-0000-000000000083'$q$,
  'f10: Ändern eines Börsen-Likes über author_age_ok');
-- Gegenprobe: derselbe Mitglieds-Weg ohne die Spalte gelingt. Ohne sie wäre jede Ablehnung oben nur ein Rechtefehler anderer Art.
select public.test_rows_as('authenticated', $q$insert into public.post_comments (post_id, body) values (2001, 'Gegenprobe Kommentar')$q$, 1,
  'f-gegen1: Mitglied 83 kann normal kommentieren');
-- Sichtprobe: Mitglied 83 sieht den eigenen neuen Kommentar wirklich. Ein NULL-Wert wäre für den Urheber unsichtbar.
--   Die Strukturzusage f-gegen2 allein wuerde das nicht zeigen.
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comments', $p$body = 'Gegenprobe Kommentar'$p$, 1,
  'f-gegen1b: Mitglied 83 sieht den eigenen neuen Kommentar');
-- Kein Skalar: "gibt es eine Zeile mit diesem Text und hat author_age_ok den Wert true". Das braucht keine Eindeutigkeit.
--   Form wie f-gegen5 ("is true"). Eine NULL-Spalte fiele hier durch.
select public.test_check(exists (select 1 from public.post_comments where body = 'Gegenprobe Kommentar' and author_age_ok is true),
  'f-gegen2: der neue Kommentar hat den Standardwert true');
-- Gegenprobe Reaktion und Like in der Form, die die Website sendet (community.js 220 und 297): nur die Spalten ohne Urheber.
--   Vor Block 4b wären sie mit dem Recht erlaubt, nach Block 4b bleiben sie erlaubt, weil die Spalten in der Liste stehen.
select public.test_rows_as('authenticated', $q$insert into public.post_comment_reactions (comment_id, emoji) values (5001, 'ok2')$q$, 1,
  'f-gegen3: Mitglied 83 kann eine Reaktion in der Website-Form anlegen (comment_id, emoji)');
select public.test_rows_as('authenticated', $q$insert into public.post_likes (post_id) values (2002)$q$, 1,
  'f-gegen4: Mitglied 83 kann ein Like in der Website-Form anlegen (post_id)');
-- Über den Schlüssel: Reaktion (5001, 83, 'ok2') und Like (2002, 83) sind eindeutig, weil der Primärschlüssel sie festlegt.
select public.test_check(
  (select author_age_ok from public.post_comment_reactions where comment_id = 5001 and member_id = '00000000-0000-0000-0000-000000000083' and emoji = 'ok2') is true
  and (select author_age_ok from public.post_likes where post_id = 2002 and user_id = '00000000-0000-0000-0000-000000000083') is true,
  'f-gegen5: die neuen Zeilen haben den Standardwert true (Urheber 83 über 16)');
select set_config('request.jwt.claim.sub', '', false);
select public.test_expect_uid('', 'f: keine Kennung nach den Ablehnungen');

-- ---------- g) Die vier Indizes liegen auf der richtigen Spalte ----------
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'post_comments'
         and indexname = 'post_comments_author_idx' and indexdef like '%(author_id)%'),
  'g1: post_comments_author_idx liegt auf (author_id)');
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'post_likes'
         and indexname = 'post_likes_user_idx' and indexdef like '%(user_id)%'),
  'g2: post_likes_user_idx liegt auf (user_id)');
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'listing_likes'
         and indexname = 'listing_likes_user_idx' and indexdef like '%(user_id)%'),
  'g3: listing_likes_user_idx liegt auf (user_id)');
select public.test_check(exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'post_comment_reactions'
         and indexname = 'post_comment_reactions_member_idx' and indexdef like '%(member_id)%'),
  'g4: post_comment_reactions_member_idx liegt auf (member_id)');
select public.test_check((select count(*) from information_schema.columns where table_schema = 'public'
         and column_name = 'author_age_ok' and table_name in ('post_comments', 'post_comment_reactions', 'post_likes', 'listing_likes', 'content_comments')) = 5,
  'g5: author_age_ok existiert auf allen fünf Tabellen');

-- ---------- h) Nachtrag in beide Richtungen, geprüft zeilenweise ----------
-- Jede Unterabfrage hier wählt über den SCHLÜSSEL der Tabelle (id oder Primärschlüssel), nicht über einen Text oder einen
--   Teilschlüssel. Ein Teilschlüssel wie user_id = 83 trifft seit f-gegen3/f-gegen4 zwei Zeilen (Beitrag 2001 und 2002),
--   und eine skalare Unterabfrage mit zwei Zeilen bricht ab. Die Kennungen stehen fest, siehe Seeds (5001 bis 6005).
select public.test_check(
  (select author_age_ok from public.post_comments where id = 5001) is true
  and (select author_age_ok from public.post_comments where id = 5002) is false
  and (select author_age_ok from public.content_comments where id = 6002) is true
  and (select author_age_ok from public.content_comments where id = 6001) is false
  and (select author_age_ok from public.post_likes where post_id = 2001 and user_id = '00000000-0000-0000-0000-000000000083') is true
  and (select author_age_ok from public.post_likes where post_id = 2001 and user_id = '00000000-0000-0000-0000-000000000081') is false
  and (select author_age_ok from public.listing_likes where listing_id = 3001 and user_id = '00000000-0000-0000-0000-000000000081') is false
  and (select author_age_ok from public.post_comment_reactions where comment_id = 5001 and member_id = '00000000-0000-0000-0000-000000000083' and emoji = 'ok') is true
  and (select author_age_ok from public.post_comment_reactions where comment_id = 5001 and member_id = '00000000-0000-0000-0000-000000000081' and emoji = 'ok') is false,
  'h1: der Nachtrag richtet veraltete Werte in beide Richtungen (nach oben: 82 und 83, nach unten: 81)');

-- ---------- i) sync_author_age_ok ist für keine Anwendungsrolle ausführbar ----------
select public.test_check(not has_function_privilege('anon', 'public.sync_author_age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.sync_author_age_ok(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.sync_author_age_ok(uuid)', 'EXECUTE')
  and not exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                   where p.oid = 'public.sync_author_age_ok(uuid)'::regprocedure
                     and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'i1: sync_author_age_ok ist für anon, authenticated, service_role und PUBLIC nicht ausführbar');
select public.test_denied_as('anon', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000083'::uuid)$q$,
  'i2: Aufruf durch anon scheitert am Recht');
select public.test_denied_as('authenticated', $q$select public.sync_author_age_ok('00000000-0000-0000-0000-000000000083'::uuid)$q$,
  'i3: Aufruf durch authenticated scheitert am Recht');
-- Gegenprobe: mit erteiltem Recht ist der Aufruf für service_role möglich. Danach wird es wieder entzogen.
grant execute on function public.sync_author_age_ok(uuid) to service_role;
select public.test_check(has_function_privilege('service_role', 'public.sync_author_age_ok(uuid)', 'EXECUTE'),
  'i4: Gegenprobe: mit erteiltem Recht ist der Aufruf für service_role möglich');
revoke execute on function public.sync_author_age_ok(uuid) from service_role;
select public.test_check(not has_function_privilege('service_role', 'public.sync_author_age_ok(uuid)', 'EXECUTE'),
  'i5: nach dem Entzug ist service_role wieder gesperrt');

-- ---------- e) Der Trigger auf profiles zieht die fünf Tabellen am Geburtstag nach ----------
-- Nach dem Lauf veraltet setzen: Konto 86 ist über 16, aber die Werte stehen auf false, als hätte der Geburtstag
--   gerade eben stattgefunden. Vor dem Lauf hätte der Nachtrag das schon korrigiert.
update public.post_comments set author_age_ok = false where id = 5003;
update public.post_comment_reactions set author_age_ok = false where member_id = '00000000-0000-0000-0000-000000000086';
update public.post_likes set author_age_ok = false where user_id = '00000000-0000-0000-0000-000000000086';
update public.listing_likes set author_age_ok = false where user_id = '00000000-0000-0000-0000-000000000086';
update public.content_comments set author_age_ok = false where id = 6003;
-- Beitrag, Börse und Projekt von 86 (20261118200000 deckt sie ab, der Trigger auf profiles zieht sie nach). Als Eigentümer angelegt.
insert into public.posts (id, author_id, kind, body, is_public) values (2003, '00000000-0000-0000-0000-000000000086', 'update', 'Beitrag Sechzehn', true);
insert into public.listings (id, author_id, type, category, title, body, is_public) values (3002, '00000000-0000-0000-0000-000000000086', 'suche', 'x', 'Boerse Sechzehn', '', true);
insert into public.projects (id, owner_id, title, pitch, is_public) values (4002, '00000000-0000-0000-0000-000000000086', 'Projekt Sechzehn', 'Pitch', true);
update public.posts set author_age_ok = false where id = 2003;
update public.listings set author_age_ok = false where id = 3002;
update public.projects set author_age_ok = false where id = 4002;
select public.test_check(public.age_ok('00000000-0000-0000-0000-000000000086'::uuid),
  'e0: Vorbedingung, Konto 86 ist über 16 (Geburtsdatum vor 16 Jahren)');
-- Gegenprobe vorher: Mitglied 83 sieht nichts von 86.
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comments', $p$body = 'Kommentar Sechzehn'$p$, 0,
  'e1: vor dem Speichern des Profils verborgen (Gegenprobe)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comment_reactions', $p$member_id = '00000000-0000-0000-0000-000000000086'$p$, 0,
  'e2: vor dem Speichern verborgen (Reaktion)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_likes', $p$user_id = '00000000-0000-0000-0000-000000000086'$p$, 0,
  'e3: vor dem Speichern verborgen (Like)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listing_likes', $p$user_id = '00000000-0000-0000-0000-000000000086'$p$, 0,
  'e4: vor dem Speichern verborgen (Börsen-Like)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Sechzehn Projekt'$p$, 0,
  'e5: vor dem Speichern verborgen (Kommentar am Projekt)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'posts', $p$id = 2003$p$, 0,
  'e5a: vor dem Speichern verborgen (Beitrag)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listings', $p$id = 3002$p$, 0,
  'e5b: vor dem Speichern verborgen (Börse)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'projects', $p$id = 4002$p$, 0,
  'e5c: vor dem Speichern verborgen (Projekt)');
-- Profil speichern. Der Trigger auf profiles ruft sync_author_age_ok(86) auf.
update public.profiles set name = name where id = '00000000-0000-0000-0000-000000000086';
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comments', $p$body = 'Kommentar Sechzehn'$p$, 1,
  'e6: nach dem Speichern sichtbar (Kommentar)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_comment_reactions', $p$member_id = '00000000-0000-0000-0000-000000000086'$p$, 1,
  'e7: nach dem Speichern sichtbar (Reaktion)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'post_likes', $p$user_id = '00000000-0000-0000-0000-000000000086'$p$, 1,
  'e8: nach dem Speichern sichtbar (Like)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listing_likes', $p$user_id = '00000000-0000-0000-0000-000000000086'$p$, 1,
  'e9: nach dem Speichern sichtbar (Börsen-Like)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'content_comments', $p$body = 'Kommentar Sechzehn Projekt'$p$, 1,
  'e10: nach dem Speichern sichtbar (Kommentar am Projekt)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'posts', $p$id = 2003$p$, 1,
  'e10a: nach dem Speichern sichtbar (Beitrag)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'listings', $p$id = 3002$p$, 1,
  'e10b: nach dem Speichern sichtbar (Börse)');
select public.test_seen('authenticated', '00000000-0000-0000-0000-000000000083', 'projects', $p$id = 4002$p$, 1,
  'e10c: nach dem Speichern sichtbar (Projekt)');

select public.test_expect_uid('', 'Ende: keine Kennung übrig');
do $$ begin raise notice 'ENDE: alle Prüfungen bestanden'; end $$;
