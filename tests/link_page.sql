-- Ausschließlich separate leere lokale DB. Rollen anon/authenticated vorausgesetzt.
-- Start: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/link_page.sql
\set ON_ERROR_STOP on
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
grant usage on schema public to anon,authenticated;
create table public.profiles(id uuid primary key, is_premium boolean default false, is_admin boolean default false, is_verified boolean default false,
  is_beta_tester boolean default false, banned boolean default false, banned_until timestamptz, headline text, about text, offer text, seek text,
  linkedin text, instagram text, website text, avatar_path text default '', banner_path text default '');
create table public.waitlist_cards(id uuid primary key default gen_random_uuid(), user_id uuid, handle text, name text, role text, level text, skills text[] default '{}',
  hours int, mode text, city text, looking text, pitch text, link text, lang text, design jsonb, is_public boolean default true);
create function public.ban_active(b boolean, u timestamptz) returns boolean language sql immutable as $$ select coalesce(b,false) and (u is null or u > now()) $$;
\i supabase/migrations/20261107220000_link_page.sql
\i supabase/migrations/20261107220000_link_page.sql

insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into public.profiles(id, is_premium) values ('00000000-0000-0000-0000-000000000001', false), ('00000000-0000-0000-0000-000000000002', true);
insert into public.waitlist_cards(user_id, handle, name) values ('00000000-0000-0000-0000-000000000001','nico','Nico'),('00000000-0000-0000-0000-000000000002','paid','Paid');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
-- anlegen, Reihenfolge, Ids bleiben beim erneuten Speichern erhalten
select public.save_my_links('[{"title":"Portfolio","url":"https://nico-scheibe.github.io","icon":"globe"},{"title":"GitHub","url":"https://github.com/nico-scheibe","icon":"github","active":false}]'::jsonb);
do $$ declare v jsonb; v2 jsonb; begin
  v := public.get_my_links();
  if jsonb_array_length(v) <> 2 or v->0->>'title' <> 'Portfolio' then raise exception 'order/insert failed: %', v; end if;
  if (v->0->'clicks') <> 'null'::jsonb then raise exception 'free user must not see clicks'; end if;
  v2 := public.save_my_links(jsonb_build_array((v->1) || '{"title":"GH"}', v->0));
  if v2->0->>'id' <> v->1->>'id' or v2->0->>'title' <> 'GH' then raise exception 'reorder/update failed: %', v2; end if;
end $$;
-- schlechte Adressen und Titel abgelehnt
do $$ begin
  begin perform public.save_my_links('[{"title":"x","url":"javascript:alert(1)"}]'); raise exception 'javascript url accepted'; exception when check_violation then null; end;
  begin perform public.save_my_links('[{"title":"","url":"https://a.de"}]'); raise exception 'empty title accepted'; exception when check_violation then null; end;
  begin perform public.save_my_links('{"a":1}'); raise exception 'non-array accepted'; exception when invalid_parameter_value then null; end;
end $$;
-- Limit 15 für Basis, mehr für Paid
do $$ declare big jsonb; begin
  select jsonb_agg(jsonb_build_object('title','L'||g,'url','https://example.com/'||g)) into big from generate_series(1,16) g;
  begin perform public.save_my_links(big); raise exception 'limit not enforced'; exception when program_limit_exceeded then null; end;
end $$;
-- kein direkter Zugriff auf die Tabelle
do $$ begin begin perform count(*) from public.profile_links; raise exception 'direct read allowed'; exception when insufficient_privilege then null; end; end $$;

-- Öffentlich: nur aktive Links, ohne Klicks; Klick zählt
set role anon;
select set_config('request.jwt.claim.sub','',false);
do $$ declare c jsonb; lid uuid; begin
  c := public.get_public_card('nico');
  if jsonb_array_length(c->'links') <> 1 or c->'links'->0 ? 'clicks' then raise exception 'public links wrong: %', c->'links'; end if;
  lid := (c->'links'->0->>'id')::uuid;
  perform public.track_link_click(lid);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
select public.save_my_links('[{"title":"A","url":"https://a.de"}]'::jsonb);
reset role;
do $$ begin
  if (select clicks from public.profile_links where title = 'Portfolio') <> 1 then raise exception 'click not counted'; end if;
  if (select clicks from public.profile_links where title = 'GH') <> 0 then raise exception 'inactive link counted'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin if (public.get_my_links()->0->'clicks') = 'null'::jsonb then raise exception 'paid user should see clicks'; end if; end $$;
select 'OK link_page' as result;
