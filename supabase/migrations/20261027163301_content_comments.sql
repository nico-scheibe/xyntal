begin;
create table public.content_comments (
 id bigint generated always as identity primary key,
 project_id bigint references public.projects(id) on delete cascade,
 listing_id bigint references public.listings(id) on delete cascade,
 author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 body text not null check(char_length(trim(body)) between 1 and 1500),
 created_at timestamptz not null default now(),
 check(num_nonnulls(project_id,listing_id)=1)
);
create index content_comments_project on public.content_comments(project_id,created_at);
create index content_comments_listing on public.content_comments(listing_id,created_at);
create index content_comments_author on public.content_comments(author_id,created_at);
alter table public.content_comments enable row level security;
revoke all on public.content_comments from anon,authenticated;
grant select on public.content_comments to anon,authenticated;
grant insert(project_id,listing_id,body) on public.content_comments to authenticated;
grant delete on public.content_comments to authenticated;
grant usage on sequence public.content_comments_id_seq to authenticated;
create policy "Comments follow parent visibility" on public.content_comments for select to anon,authenticated using (
 exists(select 1 from public.projects p where p.id=project_id) or exists(select 1 from public.listings l where l.id=listing_id)
);
create policy "Members comment on open visible content" on public.content_comments for insert to authenticated with check (
 author_id=(select auth.uid()) and (select public.is_active_member()) and
 (exists(select 1 from public.projects p where p.id=project_id and not p.closed) or exists(select 1 from public.listings l where l.id=listing_id and not l.closed))
);
create policy "Author or owner moderates comments" on public.content_comments for delete to authenticated using (
 author_id=(select auth.uid()) or (select public.is_admin()) or
 exists(select 1 from public.projects p where p.id=project_id and p.owner_id=(select auth.uid())) or
 exists(select 1 from public.listings l where l.id=listing_id and l.author_id=(select auth.uid()))
);
create function public.limit_content_comments() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (select count(*) from public.content_comments where author_id=new.author_id and created_at>now()-interval '1 hour')>=20 then
 raise exception 'Du hast viele Kommentare geschrieben. Bitte warte etwas.'; end if;
 return new;
end $$;
revoke all on function public.limit_content_comments() from public,anon,authenticated;
create trigger content_comments_rate before insert on public.content_comments for each row execute function public.limit_content_comments();
commit;
