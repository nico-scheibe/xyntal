-- Reaktionen (Likes) auf Börsen-Einträge.
-- Einmal im Supabase SQL Editor ausführen, nachdem 003_community.sql gelaufen ist.
begin;

alter table public.listings
  add column if not exists like_count int not null default 0;

create table if not exists public.listing_likes (
  listing_id  bigint not null references public.listings (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (listing_id, user_id)
);

create or replace function public.update_listing_like_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.listings
     set like_count = like_count + (case when tg_op = 'INSERT' then 1 else -1 end)
   where id = coalesce(new.listing_id, old.listing_id);
  return null;
end;
$$;

drop trigger if exists listing_likes_count on public.listing_likes;
create trigger listing_likes_count after insert or delete on public.listing_likes
  for each row execute function public.update_listing_like_count();

revoke execute on function public.update_listing_like_count() from public, anon, authenticated;

alter table public.listing_likes enable row level security;
revoke all on public.listing_likes from anon, authenticated;
grant select on public.listing_likes to authenticated;
grant insert (listing_id) on public.listing_likes to authenticated;
grant delete on public.listing_likes to authenticated;

drop policy if exists "Listing-Likes lesen" on public.listing_likes;
create policy "Listing-Likes lesen" on public.listing_likes
  for select to authenticated
  using ((select public.is_approved_member()));

drop policy if exists "Listing liken" on public.listing_likes;
create policy "Listing liken" on public.listing_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_approved_member()));

drop policy if exists "Listing-Like zurücknehmen" on public.listing_likes;
create policy "Listing-Like zurücknehmen" on public.listing_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

commit;
