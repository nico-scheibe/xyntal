-- Community-Kommentare: Antworten (1 Ebene), Bearbeiten, Emoji-Reaktionen.
-- Idempotent. Im Supabase SQL Editor ausführen.

begin;

alter table public.post_comments
  add column if not exists parent_id bigint references public.post_comments (id) on delete cascade,
  add column if not exists edited_at timestamptz;

create index if not exists post_comments_parent_idx on public.post_comments (parent_id)
  where parent_id is not null;

-- Antworten nur eine Ebene tief, gleicher Beitrag
create or replace function public.check_post_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.post_comments%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  select * into parent from public.post_comments where id = new.parent_id;
  if not found then
    raise exception 'Antwortziel existiert nicht.';
  end if;
  if parent.post_id <> new.post_id then
    raise exception 'Antwort gehört nicht zu diesem Beitrag.';
  end if;
  if parent.parent_id is not null then
    raise exception 'Auf Antworten kann nicht erneut geantwortet werden.';
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_parent_check on public.post_comments;
create trigger post_comments_parent_check
  before insert or update of parent_id on public.post_comments
  for each row execute function public.check_post_comment_parent();

grant update (body, edited_at) on public.post_comments to authenticated;

drop policy if exists "Eigene Kommentare bearbeiten" on public.post_comments;
create policy "Eigene Kommentare bearbeiten" on public.post_comments
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- Reaktionen auf Kommentare
create table if not exists public.post_comment_reactions (
  comment_id bigint not null references public.post_comments (id) on delete cascade,
  member_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id, emoji)
);
create index if not exists post_comment_reactions_comment_idx
  on public.post_comment_reactions (comment_id);

alter table public.post_comment_reactions enable row level security;
revoke all on public.post_comment_reactions from anon, authenticated;
grant select, insert, delete on public.post_comment_reactions to authenticated;

drop policy if exists "Kommentar-Reaktionen lesen" on public.post_comment_reactions;
create policy "Kommentar-Reaktionen lesen" on public.post_comment_reactions
  for select to authenticated
  using ((select public.is_approved_member()) or (select public.is_admin()));

drop policy if exists "Kommentar-Reaktion setzen" on public.post_comment_reactions;
create policy "Kommentar-Reaktion setzen" on public.post_comment_reactions
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and (select public.is_approved_member())
    and exists (select 1 from public.post_comments c where c.id = comment_id)
  );

drop policy if exists "Eigene Kommentar-Reaktion entfernen" on public.post_comment_reactions;
create policy "Eigene Kommentar-Reaktion entfernen" on public.post_comment_reactions
  for delete to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));

-- insert darf parent_id setzen
grant insert (post_id, body, parent_id) on public.post_comments to authenticated;

commit;
