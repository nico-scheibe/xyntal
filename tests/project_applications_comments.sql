-- Transactional integration checks with isolated auth fixtures; no accounts or content survive.
begin;
do $$
declare a uuid; b uuid; p bigint; private_p bigint; r bigint;
begin
 a:=gen_random_uuid(); b:=gen_random_uuid();
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,aud,role)
 values(a,'fixture-owner-'||a||'@example.invalid',now(),'{"name":"Test owner"}','authenticated','authenticated'),
       (b,'fixture-applicant-'||b||'@example.invalid',now(),'{"name":"Test applicant"}','authenticated','authenticated');
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
