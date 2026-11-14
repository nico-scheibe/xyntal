-- Transactional integration checks with isolated auth fixtures; no accounts or content survive.
-- Ausführen nur gegen eine frische, lokale Wegwerf-Datenbank (nie Produktion oder Supabase):
--   psql -X -v ON_ERROR_STOP=1 -d <wegwerf_db> -f tests/project_applications_comments.sql
-- Vorab: Stubs für die Supabase-Schemas (Rollen, auth, storage, Publikation supabase_realtime, extensions),
-- danach die Migrationskette aus supabase/: schema.sql, 002-020, dann migrations/ nach Zeitstempel.
-- Ausgelassen: migrations/20261028140000_message_features.sql. Sie ändert die Publikation, bevor message_attachments
-- angelegt wird. Das ist unabhängig von Projekten und Kommentaren und lässt sich so nicht laden.
-- Stubs: Rollen anon, authenticated, service_role; auth.users (Supabase-Spalten, nur die nötigen), auth.uid(), auth.role(),
-- auth.jwt(), auth.identities, auth.mfa_factors; storage.buckets, storage.objects, storage.foldername().
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create table if not exists auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}'::jsonb, aud text, role text);
alter table auth.users add column if not exists phone_confirmed_at timestamptz;
alter table auth.users add column if not exists created_at timestamptz not null default now();
create table if not exists auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text);
create table if not exists auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, status text, factor_type text);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
create table if not exists storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if;
end $$;
grant usage on schema auth, storage to anon, authenticated, service_role;

-- Migrationskette (Pfade relativ zu dieser Datei)
\ir ../supabase/schema.sql
\ir ../supabase/002_login_methods.sql
\ir ../supabase/003_community.sql
\ir ../supabase/004_notifications.sql
\ir ../supabase/005_profile_avatars.sql
\ir ../supabase/006_events.sql
\ir ../supabase/007_newsletter_double_opt_in.sql
\ir ../supabase/008_listing_likes.sql
\ir ../supabase/009_projects.sql
\ir ../supabase/010_beta_applications.sql
\ir ../supabase/011_waitlist_cards.sql
\ir ../supabase/012_waitlist_cards_more.sql
\ir ../supabase/013_waitlist_perks.sql
\ir ../supabase/014_admin_actions.sql
\ir ../supabase/015_public_cards.sql
\ir ../supabase/016_account_cards.sql
\ir ../supabase/017_security.sql
\ir ../supabase/018_open_projects_messages.sql
\ir ../supabase/019_public_card_contact.sql
\ir ../supabase/020_project_images.sql
\ir ../supabase/migrations/20261025210417_beta_admin_workflow.sql
\ir ../supabase/migrations/20261027160812_public_profile_activity.sql
\ir ../supabase/migrations/20261027163301_content_comments.sql
\ir ../supabase/migrations/20261028120000_application_status.sql
\ir ../supabase/migrations/20261028150000_content_safety.sql
\ir ../supabase/migrations/20261028160000_fix_messages_insert_policy.sql
\ir ../supabase/migrations/20261028170000_fix_attachment_storage_cleanup.sql
\ir ../supabase/migrations/20261028180000_member_cards.sql
\ir ../supabase/migrations/20261028190000_approved_notification.sql
\ir ../supabase/migrations/20261028200000_project_share_links.sql
\ir ../supabase/migrations/20261028210000_project_handle_title_links.sql
\ir ../supabase/migrations/20261028220000_community_post_edit_window.sql
\ir ../supabase/migrations/20261028230500_community_comment_features.sql
\ir ../supabase/migrations/20261029193645_member_verified_badge.sql
\ir ../supabase/migrations/20261029195500_admin_profile_badge.sql
\ir ../supabase/migrations/20261029213350_beta_tester_card_badge.sql
\ir ../supabase/migrations/20261101120000_reserved_page_handles.sql
\ir ../supabase/migrations/20261103120000_beta_requires_account.sql
\ir ../supabase/migrations/20261103130000_beta_accepted_sets_badge.sql
\ir ../supabase/migrations/20261103140000_beta_status_mail.sql
\ir ../supabase/migrations/20261103160000_account_requires_beta_application.sql
\ir ../supabase/migrations/20261103170000_banned_accounts.sql
\ir ../supabase/migrations/20261103180000_reserve_tarif_handle.sql
\ir ../supabase/migrations/20261103180000_website_ban.sql
\ir ../supabase/migrations/20261105110000_auto_approve_profiles.sql
\ir ../supabase/migrations/20261105120000_auto_approve_without_content_filter.sql
\ir ../supabase/migrations/20261107120000_card_banners_premium.sql
\ir ../supabase/migrations/20261107140000_admin_premium.sql
\ir ../supabase/migrations/20261107150000_banner_video.sql
\ir ../supabase/migrations/20261107160000_banner_video_limits.sql
\ir ../supabase/migrations/20261107170000_avatar_video.sql
\ir ../supabase/migrations/20261107190000_banner_limits_table.sql
\ir ../supabase/migrations/20261107200000_cards_always_public.sql
\ir ../supabase/migrations/20261107210000_account_without_beta_application.sql
\ir ../supabase/migrations/20261107220000_member_invites.sql
\ir ../supabase/migrations/20261107230000_reserve_invite_handle.sql
\ir ../supabase/migrations/20261107240000_invite_name.sql
\ir ../supabase/migrations/20261107250000_link_page.sql
\ir ../supabase/migrations/20261108090000_link_limits_by_plan.sql
\ir ../supabase/migrations/20261108100000_link_text_entries.sql
\ir ../supabase/migrations/20261108110000_custom_page.sql
\ir ../supabase/migrations/20261108120000_page_blocks.sql
\ir ../supabase/migrations/20261108130000_page_more_elements.sql
\ir ../supabase/migrations/20261108140000_page_animations.sql
\ir ../supabase/migrations/20261108150000_page_embed_own.sql
\ir ../supabase/migrations/20261108160000_page_hover.sql
\ir ../supabase/migrations/20261108170000_page_hover_spotlight.sql
\ir ../supabase/migrations/20261108180000_page_hover_names.sql
\ir ../supabase/migrations/20261108190000_page_extras.sql
\ir ../supabase/migrations/20261108200000_restore_card_functions.sql
\ir ../supabase/migrations/20261108210000_page_pro.sql
\ir ../supabase/migrations/20261108220000_page_media_admin.sql
\ir ../supabase/migrations/20261108230000_page_media_server.sql
\ir ../supabase/migrations/20261109120000_security_hardening.sql
\ir ../supabase/migrations/20261109150000_business_contracts.sql
\ir ../supabase/migrations/20261110100000_content_rules.sql
\ir ../supabase/migrations/20261111120000_design_unlocks.sql
\ir ../supabase/migrations/20261111230000_reserve_badge_handles.sql
\ir ../supabase/migrations/20261113120000_signup_birthdate.sql
\ir ../supabase/migrations/20261113130000_age_gate_membership.sql
\ir ../supabase/migrations/20261113140000_age_gate_publishing.sql

begin;
do $$
declare a uuid; b uuid; p bigint; private_p bigint; r bigint;
begin
 a:=gen_random_uuid(); b:=gen_random_uuid();
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
 values(a,'fixture-owner-'||a||'@example.invalid',now(),'{"name":"Test owner"}','authenticated','authenticated'),
       (b,'fixture-applicant-'||b||'@example.invalid',now(),'{"name":"Test applicant"}','authenticated','authenticated');
 -- Die Regeln verlangen ein freigeschaltetes, volljähriges Mitglied (is_approved_member, is_active_member/age_ok)
 update public.profiles set status = 'approved' where id in (a,b);
 insert into public.member_birthdates(id,birthdate) values (a,date '1990-01-01'),(b,date '1990-01-01');
 perform set_config('test.owner',a::text,true); perform set_config('test.applicant',b::text,true);
 insert into public.projects(owner_id,title,pitch,is_public) values(a,'Integration public','Fixture',true) returning id into p;
 insert into public.projects(owner_id,title,pitch,is_public) values(a,'Integration private','Fixture',false) returning id into private_p;
 insert into public.project_roles(project_id,name) values(p,'Design') returning id into r;
 perform set_config('test.project',p::text,true); perform set_config('test.role',r::text,true);
 insert into public.content_comments(project_id,author_id,body) values(p,b,'Public fixture comment'),(private_p,a,'Private fixture comment');
end $$;
set local role anon;
do $$ begin
 if not exists(select 1 from public.content_comments where body='Public fixture comment') then raise exception 'Public comments missing'; end if;
 if exists(select 1 from public.content_comments where body='Private fixture comment') then raise exception 'Private comments exposed'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.applicant'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.applicant'),'role','authenticated')::text,true);
set local role authenticated;
insert into public.project_interest(role_id,note) values(current_setting('test.role')::bigint,'Motivation and skills fixture');
insert into public.content_comments(project_id,body) values(current_setting('test.project')::bigint,'Applicant comment');
do $$ begin
 if not exists(select 1 from public.project_interest where role_id=current_setting('test.role')::bigint and note='Motivation and skills fixture') then raise exception 'Applicant cannot read own application'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true),set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
 if not exists(select 1 from public.project_interest where role_id=current_setting('test.role')::bigint and note='Motivation and skills fixture') then raise exception 'Owner cannot read application'; end if;
end $$;
delete from public.content_comments where project_id=current_setting('test.project')::bigint and body='Applicant comment';
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true),set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.project_interest where role_id=current_setting('test.role')::bigint) then raise exception 'Application exposed to stranger'; end if;
end $$;
reset role;
rollback;
