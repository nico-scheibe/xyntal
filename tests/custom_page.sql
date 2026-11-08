-- Freie Seite (Migration 20261108110000_custom_page.sql). Nur in einer separaten leeren lokalen Datenbank ausführen.
-- Start: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/custom_page.sql
\set ON_ERROR_STOP on
create schema auth;
create schema storage;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage to anon,authenticated;
grant usage on schema public to anon,authenticated;
create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id bigint generated always as identity, bucket_id text,name text);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to anon,authenticated;
grant usage on sequence storage.objects_id_seq to anon,authenticated;
create table public.profiles(id uuid primary key, is_premium boolean default false, is_admin boolean default false, is_verified boolean default false,
  is_beta_tester boolean default false, banned boolean default false, banned_until timestamptz, headline text, about text, offer text, seek text,
  linkedin text, instagram text, website text, avatar_path text default '', banner_path text default '');
create table public.waitlist_cards(id uuid primary key default gen_random_uuid(), user_id uuid, handle text, name text, role text, level text, skills text[] default '{}',
  hours int, mode text, city text, looking text, pitch text, link text, lang text, design jsonb, is_public boolean default true);
create table public.profile_links(id uuid primary key default gen_random_uuid(), user_id uuid, title text, url text, icon text, position int, active boolean default true, created_at timestamptz default now());
grant select on public.profiles to authenticated;
create function public.ban_active(b boolean, u timestamptz) returns boolean language sql immutable as $$ select coalesce(b,false) and (u is null or u > now()) $$;
\i supabase/migrations/20261108110000_custom_page.sql
\i supabase/migrations/20261108120000_page_blocks.sql
\i supabase/migrations/20261108130000_page_more_elements.sql
\i supabase/migrations/20261108140000_page_animations.sql
\i supabase/migrations/20261108150000_page_embed_own.sql
\i supabase/migrations/20261108160000_page_hover.sql
\i supabase/migrations/20261108160000_page_hover.sql

create trigger waitlist_cards_reserved_handle before insert or update of handle on public.waitlist_cards for each row execute function public.reject_page_handles();

insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into public.profiles(id, is_premium, banned) values ('00000000-0000-0000-0000-000000000001', false, false), ('00000000-0000-0000-0000-000000000002', true, false), ('00000000-0000-0000-0000-000000000003', false, true);
insert into public.waitlist_cards(user_id, handle, name) values ('00000000-0000-0000-0000-000000000001','nico','Nico'),('00000000-0000-0000-0000-000000000002','paid','Paid'),('00000000-0000-0000-0000-000000000003','bad','Bad');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
-- speichern, lesen, zurücksetzen
select public.save_my_page('{"v":1,"bg":{"color":"#101010"},"h":600,"items":[
  {"id":"a","type":"text","x":10,"y":10,"w":200,"h":40,"text":"Hallo"},
  {"id":"b","type":"link","ref":"11111111-1111-1111-1111-111111111111","x":10,"y":80,"w":200,"h":50},
  {"id":"d","type":"block","kind":"card","x":0,"y":0,"w":200},
  {"id":"c","type":"image","src":"00000000-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222.png","x":0,"y":0,"w":50,"h":50}]}'::jsonb);
do $$ declare p jsonb; begin
  p := public.get_my_page();
  if jsonb_array_length(p->'items') <> 4 then raise exception 'save/get failed: %', p; end if;
end $$;
-- Ablehnungen
do $$ begin
  begin perform public.save_my_page('[1]'); raise exception 'array accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"script"}]}'); raise exception 'bad type accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"text","anim":{"p":"custom","code":"0% { drehen: 1 } </style><script>"}}]}'); raise exception 'bad anim code accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"embed","provider":"youtube","eid":"dQw4w9WgXcQ"}]}'); raise exception 'unconfirmed embed accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"button","hover":"explode"}]}'); raise exception 'bad hover accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"text","anim":{"p":"explode"}}]}'); raise exception 'bad anim preset accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"button","url":"javascript:alert(1)"}]}'); raise exception 'js button accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"embed","provider":"youtube","eid":"x\"><script>"}]}'); raise exception 'bad embed accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"embed","provider":"evil","eid":"dQw4w9WgXcQ"}]}'); raise exception 'bad provider accepted'; exception when invalid_parameter_value then null; end;
  perform public.save_my_page('{"items":[{"type":"embed","provider":"youtube","eid":"dQw4w9WgXcQ","own":true},{"type":"embed","provider":"spotify","eid":"track/4uLU6hMCjMI75M1A2tKUQC","own":true},{"type":"button","url":"https://a.de","text":"Hi","hover":"neon"},{"type":"shape","kind":"circle","anim":{"p":"float","d":2}},{"type":"icons","anim":{"p":"custom","code":"0% { drehen: 0; farbe: #ff00aa } 100% { drehen: 360; schräg: 5 }"}}]}');
  begin perform public.save_my_page('{"items":[{"type":"block","kind":"evil"}]}'); raise exception 'bad block accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"link","ref":"x"}]}'); raise exception 'bad ref accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"image","src":"00000000-0000-0000-0000-000000000002/22222222-2222-2222-2222-222222222222.png"}]}'); raise exception 'foreign image accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.save_my_page('{"items":[{"type":"image","src":"https://evil.example/x.png"}]}'); raise exception 'external image accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- Grenze 20 (Free)
do $$ declare big jsonb; begin
  select jsonb_build_object('items', jsonb_agg(jsonb_build_object('type','text','text','t'||g))) into big from generate_series(1,21) g;
  begin perform public.save_my_page(big); raise exception 'limit not enforced'; exception when program_limit_exceeded then null; end;
end $$;
-- Bilder: nur im eigenen Ordner
insert into storage.objects(bucket_id,name) values ('page-media','00000000-0000-0000-0000-000000000001/22222222-2222-2222-2222-222222222222.png');
do $$ begin
  begin insert into storage.objects(bucket_id,name) values ('page-media','00000000-0000-0000-0000-000000000002/22222222-2222-2222-2222-222222222223.png'); raise exception 'foreign upload allowed'; exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id,name) values ('page-media','00000000-0000-0000-0000-000000000001/x.exe'); raise exception 'bad name allowed'; exception when insufficient_privilege then null; end;
end $$;

-- Öffentlich: Seite wird mit der Karte geliefert
set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$ begin
  if jsonb_array_length(public.get_public_card('nico')->'page'->'items') <> 5 then raise exception 'public page missing'; end if;
  begin perform public.save_my_page('{}'); raise exception 'anon save allowed'; exception when insufficient_privilege then null; end;
end $$;

-- Paid darf mehr als 20
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$ declare big jsonb; begin
  select jsonb_build_object('items', jsonb_agg(jsonb_build_object('type','text','text','t'||g))) into big from generate_series(1,40) g;
  perform public.save_my_page(big);
end $$;
-- Gesperrte Konten speichern nicht
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
do $$ begin begin perform public.save_my_page('{"items":[]}'); raise exception 'banned save allowed'; exception when insufficient_privilege then null; end; end $$;
-- Zurücksetzen
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select public.save_my_page(null);
do $$ begin if public.get_my_page() is not null then raise exception 'reset failed'; end if; end $$;
reset role;
-- Reservierter Name
do $$ begin begin update public.waitlist_cards set handle = 'meine-seite' where handle = 'nico'; raise exception 'reserved handle allowed'; exception when check_violation then null; end; end $$;
\echo OK custom_page
