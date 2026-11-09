-- Ausschließlich separate leere lokale DB. Rollen anon/authenticated vorausgesetzt.
-- Start: psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/security_hardening.sql
\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('request.jwt.claim.aal',true),''),'aal1')) $$;
create table auth.mfa_factors(user_id uuid, status text);
grant usage on schema auth, storage, public to anon, authenticated;
grant select on auth.mfa_factors to anon, authenticated;

create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
alter table storage.objects enable row level security;
grant select, insert, delete on storage.objects to authenticated;
create policy "alles" on storage.objects for all to authenticated using (true) with check (true);

create table public.profiles(id uuid primary key, status text default 'approved', is_admin boolean default false, is_premium boolean default false,
  banned boolean default false, banned_until timestamptz);
create function public.ban_active(b boolean, u timestamptz) returns boolean language sql stable as $$ select coalesce(b,false) and (u is null or u > now()) $$;
create function public.mfa_ok() returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified') $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) and public.mfa_ok() $$;
create function public.is_approved_member() returns boolean language sql stable as $$ select true $$;

create table public.waitlist_cards(id uuid primary key default gen_random_uuid(), user_id uuid, email text unique, handle text, name text, role text, level text,
  skills text[] default '{}', hours int, mode text, city text, looking text, pitch text, link text, lang text, design jsonb, is_public boolean default true, views int default 0);
grant select, insert, update on public.waitlist_cards to anon, authenticated;
create table public.profile_links(id uuid primary key default gen_random_uuid(), user_id uuid default auth.uid(), title text, url text);
alter table public.profile_links enable row level security;
grant select, insert, update, delete on public.profile_links to authenticated;
create policy "eigene" on public.profile_links for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create table public.posts(id serial primary key, author_id uuid default auth.uid(), body text);
alter table public.posts enable row level security;
grant select, insert, update on public.posts to authenticated;
grant usage on sequence public.posts_id_seq to authenticated;
create policy "lesen" on public.posts for select to authenticated using (true);
create policy "schreiben" on public.posts for insert to authenticated with check (public.is_approved_member());
create policy "ändern" on public.posts for update to authenticated using (author_id = auth.uid());
create table public.post_comments(id serial primary key, post_id int, parent_id int);
create function public.check_post_comment_parent() returns trigger language plpgsql security definer set search_path = public as $$ begin return new; end $$;
create table public.post_comment_reactions(comment_id int, member_id uuid default auth.uid(), emoji text);
alter table public.post_comment_reactions enable row level security;
grant select, insert on public.post_comment_reactions to authenticated;
create policy "setzen" on public.post_comment_reactions for insert to authenticated with check (true);

\i supabase/migrations/20261109120000_security_hardening.sql
\i supabase/migrations/20261109120000_security_hardening.sql

insert into public.profiles(id, banned, is_premium) values
  ('00000000-0000-0000-0000-000000000001', false, false),  -- normal
  ('00000000-0000-0000-0000-000000000002', true,  false),  -- gesperrt
  ('00000000-0000-0000-0000-000000000003', false, false);  -- mit 2FA
insert into auth.mfa_factors values ('00000000-0000-0000-0000-000000000003', 'verified');
insert into public.waitlist_cards(user_id, email, handle, name, link) values
  ('00000000-0000-0000-0000-000000000001', 'a@x.de', 'anna', 'Anna', 'https://anna.de');
insert into public.waitlist_cards(email, handle, name, link) values ('victim@x.de', 'victim', 'Planted', 'https://phish.example');

-- 1) 2FA: Konto mit 2FA, nur aal1 → Schreiben blockiert; mit aal2 erlaubt
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select set_config('request.jwt.claim.aal','aal1',false);
do $$ begin
  begin insert into public.profile_links(title, url) values ('x', 'https://a.de'); raise exception 'aal1 insert accepted';
  exception when insufficient_privilege then null; end;
  begin insert into storage.objects(bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000003/a.jpg'); raise exception 'aal1 upload accepted';
  exception when insufficient_privilege then null; end;
end $$;
-- page_guard läuft nur aus anderen Funktionen heraus, daher hier ohne Rolle
reset role;
do $$ begin
  begin perform public.page_guard(); raise exception 'aal1 page_guard accepted';
  exception when insufficient_privilege then
    if sqlerrm not like '%2FA%' then raise; end if;
  end;
end $$;
set role authenticated;
select set_config('request.jwt.claim.aal','aal2',false);
insert into public.profile_links(title, url) values ('ok', 'https://a.de');
reset role;
do $$ begin if public.page_guard() is null then raise exception 'aal2 page_guard failed'; end if; end $$;
set role authenticated;

-- 2) Gesperrt: keine Mitgliedsrechte, nichts anlegen oder ändern
select set_config('request.jwt.claim.aal','aal1',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into public.posts(body) values ('von Anna');
do $$ begin if not public.is_approved_member() then raise exception 'normal member lost rights'; end if; end $$;
reset role;
update public.posts set author_id = '00000000-0000-0000-0000-000000000002' where body = 'von Anna';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ declare n int; begin
  if public.is_approved_member() then raise exception 'banned user still member'; end if;
  begin insert into public.posts(body) values ('spam'); raise exception 'banned insert accepted';
  exception when insufficient_privilege then null; end;
  update public.posts set body = 'geändert' where body = 'von Anna';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'banned update accepted'; end if;
end $$;

-- 3) Karten: ohne Login bleibt eine Konto-Karte unverändert, Zähler laufen weiter
set role anon;
select set_config('request.jwt.claim.role','anon',false);
select set_config('request.jwt.claim.sub','',false);
update public.waitlist_cards set name = 'Gekapert', link = 'https://phish.example', views = views + 1 where email = 'a@x.de';
do $$ declare c public.waitlist_cards; begin
  select * into c from public.waitlist_cards where email = 'a@x.de';
  if c.name <> 'Anna' or c.link <> 'https://anna.de' then raise exception 'owned card overwritten: %', c; end if;
  if c.views <> 1 then raise exception 'view counter blocked'; end if;
end $$;
-- Besitzerin darf ändern
set role authenticated;
select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
update public.waitlist_cards set name = 'Anna B.' where email = 'a@x.de';
do $$ begin if (select name from public.waitlist_cards where email = 'a@x.de') <> 'Anna B.' then raise exception 'owner update blocked'; end if; end $$;
-- Übernahme beim ersten Login: Link der untergeschobenen Karte fällt weg
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select set_config('request.jwt.claim.aal','aal2',false);
update public.waitlist_cards set user_id = '00000000-0000-0000-0000-000000000003' where email = 'victim@x.de' and user_id is null;
do $$ declare c public.waitlist_cards; begin
  select * into c from public.waitlist_cards where email = 'victim@x.de';
  if c.user_id is null or c.link <> '' then raise exception 'attach kept planted link: %', c; end if;
end $$;

-- 4) Profilbilder: höchstens 3 Dateien ohne Premium
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
select set_config('request.jwt.claim.aal','aal1',false);
insert into storage.objects(bucket_id, name) select 'avatars', '00000000-0000-0000-0000-000000000001/' || gen_random_uuid() || '.jpg' from generate_series(1, 3);
do $$ begin
  begin insert into storage.objects(bucket_id, name) values ('avatars', '00000000-0000-0000-0000-000000000001/' || gen_random_uuid() || '.jpg'); raise exception '4th avatar accepted';
  exception when insufficient_privilege then null; end;
end $$;
insert into storage.objects(bucket_id, name) values ('banners', '00000000-0000-0000-0000-000000000001/b.jpg');

-- 5) Emoji nur aus der Auswahl, keine javascript:-Links
do $$ begin
  insert into public.post_comment_reactions(comment_id, emoji) values (1, '🔥');
  begin insert into public.post_comment_reactions(comment_id, emoji) values (1, '<b>x</b>'); raise exception 'html emoji accepted';
  exception when check_violation then null; end;
  begin insert into public.profile_links(title, url) values ('x', ' JavaScript:alert(1)'); raise exception 'javascript link accepted';
  exception when check_violation then null; end;
  insert into public.profile_links(title, url) values ('Text', 'Nur ein Text');
end $$;

reset role;
select 'security_hardening ok';
