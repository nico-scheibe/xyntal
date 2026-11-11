-- Exklusive Designs (Migration 20261111120000_design_unlocks.sql). Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start aus dem Projektordner: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/design_unlocks.sql
\set ON_ERROR_STOP on

-- Rollen wie in Supabase
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

-- Stubs (wie tests/custom_page.sql): auth, storage, Profile, Karten, Inhaltsfilter, 2FA
create schema auth;
create schema storage;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity, bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
grant usage on sequence storage.objects_id_seq to anon,authenticated;
create table public.profiles(id uuid primary key, is_premium boolean default false, is_admin boolean default false, is_verified boolean default false,
  is_beta_tester boolean default false, banned boolean default false, banned_until timestamptz, headline text, about text, offer text, seek text,
  linkedin text, instagram text, website text, avatar_path text default '', banner_path text default '');
create table public.waitlist_cards(id uuid primary key default gen_random_uuid(), user_id uuid unique, handle text, name text, role text, level text, skills text[] default '{}',
  hours int, mode text, city text, looking text, pitch text, link text, lang text, design jsonb, is_public boolean default true);
create table public.profile_links(id uuid primary key default gen_random_uuid(), user_id uuid, title text, url text, icon text, position int, active boolean default true, created_at timestamptz default now());
create function public.ban_active(b boolean, u timestamptz) returns boolean language sql immutable as $$ select coalesce(b,false) and (u is null or u > now()) $$;
-- 2FA: in dieser Testumgebung immer erfüllt (die echte Prüfung steht in 017_security.sql / 20261109120000_security_hardening.sql)
create function public.mfa_ok() returns boolean language sql stable as $$ select true $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) and public.mfa_ok() $$;
-- Inhaltsfilter (vereinfacht wie 20261028150000_content_safety.sql)
create function public.content_problem(p text) returns text language sql stable as $$ select case when lower(coalesce(p,'')) ~ 'arschloch' then 'beleidigung' end $$;

-- Vorgaben: Seite, Vorlagen, Versionen (Kette wie in tests/custom_page.sql)
\i supabase/migrations/20261108110000_custom_page.sql
\i supabase/migrations/20261108120000_page_blocks.sql
\i supabase/migrations/20261108130000_page_more_elements.sql
\i supabase/migrations/20261108140000_page_animations.sql
\i supabase/migrations/20261108150000_page_embed_own.sql
\i supabase/migrations/20261108160000_page_hover.sql
\i supabase/migrations/20261108170000_page_hover_spotlight.sql
\i supabase/migrations/20261108180000_page_hover_names.sql
\i supabase/migrations/20261108190000_page_extras.sql
\i supabase/migrations/20261108210000_page_pro.sql
\i supabase/migrations/20261108220000_page_media_admin.sql
\i supabase/migrations/20261108230000_page_media_server.sql

-- Standardrechte wie in Supabase: neue Tabellen und Funktionen sind für anon/authenticated zunächst offen.
-- Die Migration muss das für ihre Objekte zurücknehmen.
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;

-- Testkonten: 1 Admin (mit Karte), 2 Anna (Karte), 3 Ben (Karte), 4/5 gleiche E-Mail in anderer Schreibweise
insert into auth.users values
  ('00000000-0000-0000-0000-000000000001', 'admin@x.de'),
  ('00000000-0000-0000-0000-000000000002', 'anna@x.de'),
  ('00000000-0000-0000-0000-000000000003', 'ben@x.de'),
  ('00000000-0000-0000-0000-000000000004', 'Dup@x.de'),
  ('00000000-0000-0000-0000-000000000005', 'dup@x.de');
insert into public.profiles(id, is_admin) values ('00000000-0000-0000-0000-000000000001', true), ('00000000-0000-0000-0000-000000000002', false), ('00000000-0000-0000-0000-000000000003', false);
insert into public.waitlist_cards(user_id, handle, name) values
  ('00000000-0000-0000-0000-000000000001', 'nico', 'Nico'),
  ('00000000-0000-0000-0000-000000000002', 'anna', 'Anna'),
  ('00000000-0000-0000-0000-000000000003', 'ben', 'Ben');

-- Altbestand vor der Migration: snow war für jedes Konto speicherbar (Seite, Entwurf, Vorlage, Version)
update public.waitlist_cards set page = '{"ov":["snow","vignette"],"items":[]}', page_draft = '{"ov":["snow"],"items":[]}'
  where user_id = '00000000-0000-0000-0000-000000000002';
update public.waitlist_cards set page = '{"ov":["grain","snow"],"items":[{"type":"text","text":"Hallo"}]}', page_draft = '{"ov":null,"items":[]}'
  where user_id = '00000000-0000-0000-0000-000000000003';
update public.waitlist_cards set page = '{"ov":["snow"],"items":[]}'
  where user_id = '00000000-0000-0000-0000-000000000001';
insert into public.page_templates(user_id, name, page) values
  ('00000000-0000-0000-0000-000000000002', 'Alt', '{"ov":["snow","vignette"],"items":[]}'),
  ('00000000-0000-0000-0000-000000000001', 'Admin alt', '{"ov":["snow"],"items":[]}');
insert into public.page_versions(user_id, page) values
  ('00000000-0000-0000-0000-000000000002', '{"ov":["snow"],"items":[]}'),
  ('00000000-0000-0000-0000-000000000002', '{"ov":null,"items":[]}'),
  ('00000000-0000-0000-0000-000000000003', '{"ov":["snow","grain"],"items":[]}'),
  ('00000000-0000-0000-0000-000000000001', '{"ov":["snow"],"items":[]}');

-- Die Migration zweimal ausführen (darf mehrfach laufen)
\i supabase/migrations/20261111120000_design_unlocks.sql
\i supabase/migrations/20261111120000_design_unlocks.sql

-- 0) Altbestand bereinigt: nicht freigeschaltete Konten ohne snow, Rest unverändert, Admin behält es
do $$ begin
  if (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002') is distinct from '{"ov":["vignette"],"items":[]}'::jsonb then
    raise exception 'Altbestand Seite Anna: %', (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002');
  end if;
  if (select page_draft from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002') is distinct from '{"ov":[],"items":[]}'::jsonb then
    raise exception 'Altbestand Entwurf Anna: %', (select page_draft from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002');
  end if;
  if (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000003') is distinct from '{"ov":["grain"],"items":[{"type":"text","text":"Hallo"}]}'::jsonb then
    raise exception 'Altbestand Seite Ben: %', (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000003');
  end if;
  if (select page_draft from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000003') is distinct from '{"ov":null,"items":[]}'::jsonb then
    raise exception 'Altbestand Entwurf Ben (ov null) geändert: %', (select page_draft from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000003');
  end if;
  if (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000001') is distinct from '{"ov":["snow"],"items":[]}'::jsonb then
    raise exception 'Altbestand Admin verloren: %', (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000001');
  end if;
  if exists (select 1 from public.page_templates where page->'ov' ? 'snow') then
    raise exception 'Vorlage mit snow nach Bereinigung';
  end if;
  if (select page from public.page_templates where name = 'Alt') is distinct from '{"ov":["vignette"],"items":[]}'::jsonb then
    raise exception 'Vorlage Alt: %', (select page from public.page_templates where name = 'Alt');
  end if;
  if (select count(*) from public.page_versions where user_id = '00000000-0000-0000-0000-000000000002' and page->'ov' ? 'snow') <> 0 then
    raise exception 'Version von Anna mit snow nach Bereinigung';
  end if;
  if (select page from public.page_versions where user_id = '00000000-0000-0000-0000-000000000002' order by id desc limit 1) is distinct from '{"ov":null,"items":[]}'::jsonb then
    raise exception 'Version mit ov null geändert';
  end if;
  if (select count(*) from public.page_versions where user_id = '00000000-0000-0000-0000-000000000003' and page->'ov' ? 'snow') <> 0 then
    raise exception 'Version von Ben mit snow nach Bereinigung';
  end if;
  if (select count(*) from public.page_versions where user_id = '00000000-0000-0000-0000-000000000001' and page->'ov' ? 'snow') <> 1 then
    raise exception 'Admin-Version mit snow verloren';
  end if;
end $$;

-- Hilfsfunktion: erwartet einen Fehler mit SQLSTATE und Textanfang
create schema xtest;
grant usage on schema xtest to anon, authenticated;
create function xtest.expect_fail(p_sql text, p_state text, p_msg text) returns void language plpgsql as $$
declare v_state text := null; v_err text := null;
begin
  begin
    execute p_sql;
  exception when others then
    v_state := sqlstate; v_err := sqlerrm;
  end;
  if v_err is null or v_state <> p_state or v_err not like (p_msg || '%') then
    raise exception 'erwarteter Fehler % (%) fehlt, erhalten: % (%) bei: %', p_msg, p_state, coalesce(v_err, 'kein Fehler'), v_state, p_sql;
  end if;
end $$;
grant execute on function xtest.expect_fail(text, text, text) to anon, authenticated;

-- 1) Nicht-Admin darf nichts davon
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select xtest.expect_fail($$select public.admin_design_unlock('anna', 'snow', true, 'Testgrund')$$, '42501', 'Nur für Admins.');
select xtest.expect_fail($$select public.admin_design_unlocks('anna')$$, '42501', 'Nur für Admins.');
-- Ben (kein Admin) darf nicht freischalten, auch nicht sein eigenes Konto; sein Entwurf und Seite ohne Overlay gehen weiter
select xtest.expect_fail($$select public.save_my_page('{"ov":["snow"],"items":[]}')$$, '42501', 'XYNTAL_UNLOCK:locked');
select xtest.expect_fail($$select public.save_my_page_draft('{"ov":["snow"],"items":[]}')$$, '42501', 'XYNTAL_UNLOCK:locked');
select public.save_my_page('{"ov":["vignette"],"items":[]}');
-- Vorlage mit snow: immer abgelehnt (auch für Ben)
select xtest.expect_fail($$select public.share_page_template('Schnee', '{"ov":["snow"],"items":[]}')$$, '42501', 'XYNTAL_UNLOCK:locked');

-- 2) Admin: Eingaben prüfen
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select xtest.expect_fail($$select public.admin_design_unlock('anna', 'xyz', true, 'Testgrund')$$, 'P0001', 'XYNTAL_UNLOCK:unknown_design');
select xtest.expect_fail($$select public.admin_design_unlock('anna', 'snow', true, '')$$, 'P0001', 'XYNTAL_UNLOCK:reason_required');
select xtest.expect_fail($$select public.admin_design_unlock('anna', 'snow', true, '  ab  ')$$, 'P0001', 'XYNTAL_UNLOCK:reason_required');
select xtest.expect_fail($$select public.admin_design_unlock('nobody', 'snow', true, 'Testgrund')$$, 'P0001', 'XYNTAL_UNLOCK:no_account');
select xtest.expect_fail($$select public.admin_design_unlock('dup@x.de', 'snow', true, 'Testgrund')$$, 'P0001', 'XYNTAL_UNLOCK:ambiguous');
select xtest.expect_fail($$select public.admin_design_unlocks('nobody')$$, 'P0001', 'XYNTAL_UNLOCK:no_account');

-- 3) Freischalten per Handle (mit @), dann nochmal: changed false. Auch per UUID und E-Mail (Großschreibung egal)
do $$ declare r jsonb; begin
  r := public.admin_design_unlock('@anna', 'snow', true, 'Pilotgruppe Designs');
  if r is distinct from jsonb_build_object('handle', 'anna', 'name', 'Anna', 'design', 'snow', 'changed', true) then
    raise exception 'unlock by handle: %', r;
  end if;
  r := public.admin_design_unlock('00000000-0000-0000-0000-000000000002', 'snow', true, 'Pilotgruppe Designs');
  if (r->>'changed')::boolean then raise exception 'second unlock reported change: %', r; end if;
  r := public.admin_design_unlock('ANNA@X.DE', 'snow', true, 'Pilotgruppe Designs');
  if (r->>'changed')::boolean or r->>'handle' <> 'anna' then raise exception 'unlock by email: %', r; end if;
  r := public.admin_design_unlocks('anna');
  if r is distinct from jsonb_build_object('handle', 'anna', 'name', 'Anna', 'designs', '["snow"]'::jsonb) then
    raise exception 'admin_design_unlocks: %', r;
  end if;
end $$;

-- 4) Anna: sieht snow, speichert es (veröffentlicht und Entwurf)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare r jsonb; begin
  r := public.get_my_design_unlocks();
  if r is distinct from '{"designs":["snow"],"revoked":[]}'::jsonb then raise exception 'get_my_design_unlocks after unlock: %', r; end if;
end $$;
select public.save_my_page('{"ov":["snow","vignette"],"items":[]}');
select public.save_my_page_draft('{"ov":["snow"],"items":[]}');

-- 5) Ungültige Overlay-Angaben (für alle Konten)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select xtest.expect_fail($$select public.save_my_page('{"ov":"snow","items":[]}')$$, '22023', 'invalid overlays');
select xtest.expect_fail($$select public.save_my_page('{"ov":["Snow"],"items":[]}')$$, '22023', 'invalid overlay');
select xtest.expect_fail($$select public.save_my_page('{"ov":[1],"items":[]}')$$, '22023', 'invalid overlay');
select xtest.expect_fail($$select public.save_my_page('{"ov":["grain","grain","grain","grain","grain","grain","grain","grain","grain","grain","grain","grain","grain"],"items":[]}')$$, '22023', 'invalid overlays');
select xtest.expect_fail($$select public.save_my_page('{"ov":["grain-x"],"items":[]}')$$, '22023', 'invalid overlay');
-- Anna mit Freischaltung: Vorlage mit snow bleibt trotzdem abgelehnt; ohne snow geht es
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select xtest.expect_fail($$select public.share_page_template('Schnee', '{"ov":["snow"],"items":[]}')$$, '42501', 'XYNTAL_UNLOCK:locked');
select public.share_page_template('Nebel', '{"ov":["vignette"],"items":[]}');

-- 6) Zurücknehmen durch den Admin (Anna hat snow in Seite und Entwurf)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare r jsonb; begin
  -- Langer Grund (250 Zeichen): wird auf 200 gekürzt, siehe Schritt 11
  r := public.admin_design_unlock('anna', 'snow', false, rpad('Missbrauch gemeldet ', 250, 'x'));
  if r is distinct from jsonb_build_object('handle', 'anna', 'name', 'Anna', 'design', 'snow', 'changed', true) then
    raise exception 'lock: %', r;
  end if;
  r := public.admin_design_unlock('anna', 'snow', false, 'Missbrauch gemeldet');
  if (r->>'changed')::boolean then raise exception 'second lock reported change: %', r; end if;
  -- Ben war nie freigeschaltet: keine Änderung, kein Protokolleintrag
  r := public.admin_design_unlock('ben', 'snow', false, 'Testgrund');
  if (r->>'changed')::boolean then raise exception 'lock of never-unlocked reported change: %', r; end if;
end $$;
-- Overlay ist aus Seite und Entwurf verschwunden, der Rest blieb
reset role;
do $$ begin
  if (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002') is distinct from '{"ov":["vignette"],"items":[]}'::jsonb then
    raise exception 'page after lock: %', (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002');
  end if;
  if (select page_draft from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002') is distinct from '{"ov":[],"items":[]}'::jsonb then
    raise exception 'draft after lock: %', (select page_draft from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000002');
  end if;
  -- Versionen nach der Rücknahme: kein snow mehr (auch nicht die aus Schritt 4), der Rest bleibt
  if exists (select 1 from public.page_versions where user_id = '00000000-0000-0000-0000-000000000002' and page->'ov' ? 'snow') then
    raise exception 'Version von Anna trägt snow nach lock';
  end if;
  if not exists (select 1 from public.page_versions where user_id = '00000000-0000-0000-0000-000000000002' and page = '{"ov":["vignette"],"items":[]}'::jsonb) then
    raise exception 'Version von Anna ohne Rest (vignette) nach lock';
  end if;
end $$;
set role authenticated;

-- 7) Anna: Rücknahme sichtbar, quittieren, danach nicht mehr
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare r jsonb; begin
  r := public.get_my_design_unlocks();
  if r is distinct from '{"designs":[],"revoked":["snow"]}'::jsonb then raise exception 'revoked not shown: %', r; end if;
end $$;
select public.ack_design_revoked('snow');
do $$ declare r jsonb; begin
  r := public.get_my_design_unlocks();
  if r is distinct from '{"designs":[],"revoked":[]}'::jsonb then raise exception 'ack did not hide revoke: %', r; end if;
end $$;
-- Wiederherstellen einer alten Version mit snow ist gesperrt
select xtest.expect_fail($$select public.save_my_page('{"ov":["snow","vignette"],"items":[]}')$$, '42501', 'XYNTAL_UNLOCK:locked');
select xtest.expect_fail($$select public.save_my_page_draft('{"ov":["snow"],"items":[]}')$$, '42501', 'XYNTAL_UNLOCK:locked');

-- 8) Admin selbst: darf snow ohne Freischaltung; Zurücknehmen lässt es bei Admins stehen
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public.save_my_page('{"ov":["snow"],"items":[]}');
do $$ declare r jsonb; begin
  r := public.get_my_design_unlocks();
  if r->'designs' is distinct from to_jsonb(public.exclusive_designs()) then raise exception 'admin designs: %', r; end if;
  r := public.admin_design_unlock('nico', 'snow', false, 'Test Admin');
  if (r->>'changed')::boolean then raise exception 'admin lock reported change: %', r; end if;
end $$;
reset role;
do $$ begin
  if (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000001') is distinct from '{"ov":["snow"],"items":[]}'::jsonb then
    raise exception 'admin page lost snow: %', (select page from public.waitlist_cards where user_id = '00000000-0000-0000-0000-000000000001');
  end if;
end $$;
set role authenticated;

-- 9) Wieder freischalten: Anna darf snow wieder, Hinweis-Flag ist zurückgesetzt
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
do $$ declare r jsonb; begin
  r := public.admin_design_unlock('anna', 'snow', true, 'Wieder freigeschaltet');
  if (r->>'changed')::boolean is distinct from true then raise exception 'reactivate: %', r; end if;
  -- Zurücknehmen mit leerem Grund (nur Leerzeichen): erlaubt, im Protokoll ohne Grund
  r := public.admin_design_unlock('anna', 'snow', false, '   ');
  if (r->>'changed')::boolean is distinct from true then raise exception 'lock with blank reason: %', r; end if;
  r := public.admin_design_unlock('anna', 'snow', true, 'Wieder freigeschaltet');
  if (r->>'changed')::boolean is distinct from true then raise exception 'reactivate 2: %', r; end if;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
do $$ declare r jsonb; begin
  r := public.get_my_design_unlocks();
  if r is distinct from '{"designs":["snow"],"revoked":[]}'::jsonb then raise exception 'after reactivate: %', r; end if;
end $$;
select public.save_my_page('{"ov":["snow"],"items":[]}');

-- 10) Anon und direkter Tabellenzugriff: nichts davon
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select xtest.expect_fail($$select public.get_my_design_unlocks()$$, '42501', '');
select xtest.expect_fail($$select public.admin_design_unlock('anna', 'snow', true, 'Testgrund')$$, '42501', '');
select xtest.expect_fail($$select public.design_unlocked('00000000-0000-0000-0000-000000000002', 'snow')$$, '42501', '');
select xtest.expect_fail($$select count(*) from public.design_unlocks$$, '42501', '');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select xtest.expect_fail($$select count(*) from public.design_unlocks$$, '42501', '');
select xtest.expect_fail($$select count(*) from public.design_unlock_log$$, '42501', '');
select xtest.expect_fail($$select public.design_unlocked('00000000-0000-0000-0000-000000000002', 'snow')$$, '42501', '');

-- 11) Protokoll: genau die Änderungen, keine Einträge für Leerläufe; Gründe auf 200 Zeichen gekürzt, leer = null
reset role;
do $$ declare a text; begin
  select string_agg(action || ':' || user_id::text, ',' order by id) into a from public.design_unlock_log;
  if a is distinct from concat_ws(',', 'unlock:00000000-0000-0000-0000-000000000002', 'lock:00000000-0000-0000-0000-000000000002',
                                  'unlock:00000000-0000-0000-0000-000000000002', 'lock:00000000-0000-0000-0000-000000000002',
                                  'unlock:00000000-0000-0000-0000-000000000002') then
    raise exception 'log: %', a;
  end if;
  if (select char_length(reason) from public.design_unlock_log where action = 'lock' order by id limit 1) <> 200 then
    raise exception 'langer Grund nicht auf 200 gekürzt: %', (select char_length(reason) from public.design_unlock_log where action = 'lock' order by id limit 1);
  end if;
  if (select reason from public.design_unlock_log where action = 'lock' order by id desc limit 1) is not null then
    raise exception 'leerer Grund nicht als null gespeichert';
  end if;
end $$;

-- Aufräumen (Wegwerf-Datenbank)
drop schema xtest cascade;
