-- Nach 003_community.sql einmal im Supabase SQL Editor ausführen.
-- Nur neue Aktivitäten: keine historischen Nachrichten/Kommentare nachtragen.
begin;

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('message', 'comment')),
  sender_id uuid references public.profiles(id) on delete set null,
  message_id bigint unique references public.messages(id) on delete cascade,
  comment_id bigint unique references public.post_comments(id) on delete cascade,
  post_id bigint references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check ((kind = 'message' and message_id is not null and comment_id is null and post_id is null)
      or (kind = 'comment' and message_id is null and comment_id is not null and post_id is not null))
);
create index notifications_inbox_idx on public.notifications(recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications(recipient_id) where read_at is null;
alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "Eigene Hinweise lesen" on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) and (select public.is_approved_member()));
create policy "Eigene Hinweise gelesen setzen" on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()) and (select public.is_approved_member()))
  with check (recipient_id = (select auth.uid()) and (select public.is_approved_member()));

-- Ausschließlich Trigger erzeugen Hinweise; kein INSERT-Recht für Clients.
create function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id, kind, sender_id, message_id)
  values (new.recipient_id, 'message', new.sender_id, new.id);
  return new;
end;
$$;
create function public.notify_post_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(recipient_id, kind, sender_id, comment_id, post_id)
  select p.author_id, 'comment', new.author_id, new.id, new.post_id
  from public.posts p join public.profiles recipient on recipient.id = p.author_id
  where p.id = new.post_id and p.author_id <> new.author_id and recipient.status = 'approved';
  return new;
end;
$$;
-- Lesen einer Unterhaltung räumt auch die zugehörigen Nachrichtenhinweise auf.
create function public.sync_message_notification_read()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.read_at is not null and old.read_at is null then
    update public.notifications set read_at = new.read_at
    where message_id = new.id and read_at is null;
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_new_message(), public.notify_post_comment(),
  public.sync_message_notification_read() from public, anon, authenticated;
create trigger notification_after_message after insert on public.messages
  for each row execute function public.notify_new_message();
create trigger notification_after_comment after insert on public.post_comments
  for each row execute function public.notify_post_comment();
create trigger notification_after_message_read after update of read_at on public.messages
  for each row execute function public.sync_message_notification_read();
commit;
