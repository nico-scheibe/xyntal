-- =====================================================================
-- Xyntal – Community: Feed, Gesuche & Angebote, Direktnachrichten
-- (nach schema.sql und 002_login_methods.sql einmal im SQL Editor ausführen)
--
-- Schreiben dürfen nur freigeschaltete Mitglieder. Gäste sehen nur Beiträge
-- und Börsen-Einträge, die ihr Verfasser als öffentlich markiert hat.
-- Nachrichten sehen nur Absender und Empfänger.
-- =====================================================================


-- ---------- Feed ----------

create table public.posts (
  id            bigint generated always as identity primary key,
  author_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind          text not null default 'update' check (kind in ('update', 'frage', 'erfolg')),
  body          text not null check (char_length(trim(body)) between 1 and 3000),
  is_public     boolean not null default false,
  like_count    int not null default 0,
  comment_count int not null default 0,
  created_at    timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);

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


-- ---------- Gesuche & Angebote ----------

create table public.listings (
  id          bigint generated always as identity primary key,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type        text not null check (type in ('suche', 'biete')),
  category    text not null default '' check (char_length(category) <= 60),
  title       text not null check (char_length(trim(title)) between 1 and 120),
  body        text not null default '' check (char_length(body) <= 2000),
  is_public   boolean not null default false,
  closed      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index listings_created_idx on public.listings (created_at desc);


-- ---------- Direktnachrichten ----------

create table public.messages (
  id            bigint generated always as identity primary key,
  sender_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  recipient_id  uuid not null references public.profiles (id) on delete cascade,
  body          text not null check (char_length(trim(body)) between 1 and 2000),
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index messages_sender_idx on public.messages (sender_id, created_at desc);
create index messages_recipient_idx on public.messages (recipient_id, created_at desc);


-- =====================================================================
-- Zähler für Likes und Kommentare (Mitglieder dürfen sie nicht selbst ändern)
-- =====================================================================

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


-- =====================================================================
-- Zugriffsrechte & Row Level Security
-- =====================================================================

alter table public.posts         enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes    enable row level security;
alter table public.listings      enable row level security;
alter table public.messages      enable row level security;

revoke all on public.posts, public.post_comments, public.post_likes, public.listings, public.messages
  from anon, authenticated;

-- Feed
grant select on public.posts to anon, authenticated;
grant insert (kind, body, is_public) on public.posts to authenticated;
grant update (kind, body, is_public) on public.posts to authenticated;
grant delete on public.posts to authenticated;

create policy "Beiträge lesen" on public.posts
  for select to anon, authenticated
  using (is_public or (select public.is_approved_member()) or (select public.is_admin()));

create policy "Beiträge schreiben" on public.posts
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));

create policy "Eigene Beiträge ändern" on public.posts
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "Eigene Beiträge löschen (Admins alle)" on public.posts
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- Kommentare: nur Mitglieder lesen und schreiben
grant select on public.post_comments to authenticated;
grant insert (post_id, body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;

create policy "Kommentare lesen" on public.post_comments
  for select to authenticated
  using ((select public.is_approved_member()) or (select public.is_admin()));

create policy "Kommentieren" on public.post_comments
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));

create policy "Eigene Kommentare löschen (Admins alle)" on public.post_comments
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- Likes
grant select on public.post_likes to authenticated;
grant insert (post_id) on public.post_likes to authenticated;
grant delete on public.post_likes to authenticated;

create policy "Likes lesen" on public.post_likes
  for select to authenticated
  using ((select public.is_approved_member()));

create policy "Liken" on public.post_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_approved_member()));

create policy "Like zurücknehmen" on public.post_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Gesuche & Angebote
grant select on public.listings to anon, authenticated;
grant insert (type, category, title, body, is_public) on public.listings to authenticated;
grant update (type, category, title, body, is_public, closed) on public.listings to authenticated;
grant delete on public.listings to authenticated;

create policy "Börse lesen" on public.listings
  for select to anon, authenticated
  using (is_public or (select public.is_approved_member()) or (select public.is_admin()));

create policy "Börse schreiben" on public.listings
  for insert to authenticated
  with check (author_id = (select auth.uid()) and (select public.is_approved_member()));

create policy "Eigene Einträge ändern" on public.listings
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

create policy "Eigene Einträge löschen (Admins alle)" on public.listings
  for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- Nachrichten: nur Absender und Empfänger
grant select on public.messages to authenticated;
grant insert (recipient_id, body) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

create policy "Eigene Nachrichten lesen" on public.messages
  for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create policy "Nachrichten senden" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select public.is_approved_member())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.status = 'approved')
  );

create policy "Als gelesen markieren" on public.messages
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));


-- =====================================================================
-- Live-Updates für neue Nachrichten (Supabase Realtime)
-- =====================================================================

alter publication supabase_realtime add table public.messages;
