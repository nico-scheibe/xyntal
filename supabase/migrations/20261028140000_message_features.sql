-- Messaging-Erweiterungen: Antworten, Bearbeiten, Soft-Delete, Reaktionen und Anhänge.
-- Privater Storage-Bucket „message-attachments“ (max. 50 MB) unter <sender_id>/<uuid>.ext.
-- Voraussetzung: messages aus 003, is_active_member/mfa aus 017/018, Storage-Muster wie 005/020.
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- =====================================================================
-- 1) messages: neue Spalten, leerer Body für reine Anhänge/Sprachnachrichten
-- =====================================================================

alter table public.messages add column if not exists reply_to bigint;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted_at timestamptz;

alter table public.messages drop constraint if exists messages_reply_to_fkey;
alter table public.messages
  add constraint messages_reply_to_fkey
  foreign key (reply_to) references public.messages (id) on delete set null;

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages
  add constraint messages_body_check
  check (char_length(trim(body)) between 0 and 2000);

create index if not exists messages_reply_to_idx
  on public.messages (reply_to) where reply_to is not null;
create index if not exists messages_deleted_at_idx
  on public.messages (deleted_at) where deleted_at is not null;

-- =====================================================================
-- 2) Grants (sender_id bleibt default auth.uid())
-- =====================================================================

grant insert (recipient_id, body, reply_to) on public.messages to authenticated;
grant update (read_at, body, edited_at, deleted_at) on public.messages to authenticated;

-- =====================================================================
-- 3) reply_to: nur Nachrichten derselben Unterhaltung (ungeordnetes Paar)
-- =====================================================================

create or replace function public.validate_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to is null then
    return new;
  end if;
  if not exists (
    select 1
      from public.messages r
     where r.id = new.reply_to
       and (
         (r.sender_id = new.sender_id and r.recipient_id = new.recipient_id)
         or (r.sender_id = new.recipient_id and r.recipient_id = new.sender_id)
       )
  ) then
    raise exception 'Antwort muss zur gleichen Unterhaltung gehören.';
  end if;
  return new;
end;
$$;
revoke execute on function public.validate_message_reply() from public, anon, authenticated;

drop trigger if exists messages_validate_reply on public.messages;
create trigger messages_validate_reply
  before insert or update of reply_to on public.messages
  for each row execute function public.validate_message_reply();

-- =====================================================================
-- 4) RLS: Lesen unverändert; Senden inkl. reply_to; getrennte Updates
-- =====================================================================

drop policy if exists "Nachrichten senden" on public.messages;
create policy "Nachrichten senden" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and (select public.is_active_member())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.status <> 'rejected')
    -- reply_to prüft der Trigger messages_validate_reply; eine Abfrage auf messages hier
    -- führte zu „infinite recursion detected in policy“ (siehe 20261028160000_fix_messages_insert_policy)
  );

drop policy if exists "Als gelesen markieren" on public.messages;
create policy "Als gelesen markieren" on public.messages
  for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));

drop policy if exists "Eigene Nachricht bearbeiten" on public.messages;
create policy "Eigene Nachricht bearbeiten" on public.messages
  for update to authenticated
  using (
    sender_id = (select auth.uid())
    and deleted_at is null
    and created_at > now() - interval '15 minutes'
  )
  with check (
    sender_id = (select auth.uid())
    and deleted_at is null
  );

drop policy if exists "Eigene Nachricht löschen" on public.messages;
create policy "Eigene Nachricht löschen" on public.messages
  for update to authenticated
  using (sender_id = (select auth.uid()) and deleted_at is null)
  with check (sender_id = (select auth.uid()) and deleted_at is not null);

-- Spalten-Disziplin: Empfänger darf nur read_at, Absender nur Edit/Soft-Delete
create or replace function public.enforce_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  soft_deleting boolean;
  editing boolean;
  marking_read boolean;
begin
  if new.sender_id is distinct from old.sender_id
     or new.recipient_id is distinct from old.recipient_id
     or new.created_at is distinct from old.created_at
     or new.reply_to is distinct from old.reply_to
     or new.id is distinct from old.id then
    raise exception 'Diese Felder dürfen nicht geändert werden.';
  end if;

  soft_deleting := old.deleted_at is null and new.deleted_at is not null;
  editing := (new.body is distinct from old.body or new.edited_at is distinct from old.edited_at)
             and not soft_deleting;
  marking_read := new.read_at is distinct from old.read_at;

  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'Gelöschte Nachrichten können nicht wiederhergestellt werden.';
  end if;

  if soft_deleting then
    if uid is distinct from old.sender_id then
      raise exception 'Nur der Absender kann die Nachricht löschen.';
    end if;
    -- Inhalt hier schon leeren, damit soft_delete_message und reply_to-Schutz nicht kollidieren
    new.body := '';
    new.reply_to := null;
    return new;
  end if;

  if editing then
    if uid is distinct from old.sender_id then
      raise exception 'Nur der Absender kann die Nachricht bearbeiten.';
    end if;
    if old.deleted_at is not null then
      raise exception 'Gelöschte Nachrichten können nicht bearbeitet werden.';
    end if;
    if old.created_at <= now() - interval '15 minutes' then
      raise exception 'Bearbeiten ist nur innerhalb von 15 Minuten möglich.';
    end if;
    if new.edited_at is null then
      new.edited_at := now();
    end if;
  end if;

  if marking_read then
    if uid is distinct from old.recipient_id then
      raise exception 'Nur der Empfänger kann als gelesen markieren.';
    end if;
    if new.body is distinct from old.body
       or new.edited_at is distinct from old.edited_at
       or new.deleted_at is distinct from old.deleted_at then
      raise exception 'Beim Lesen dürfen keine anderen Felder geändert werden.';
    end if;
  end if;

  if not soft_deleting and not editing and not marking_read and new is distinct from old then
    raise exception 'Ungültige Nachrichtenänderung.';
  end if;

  return new;
end;
$$;
revoke execute on function public.enforce_message_update() from public, anon, authenticated;

drop trigger if exists messages_enforce_update on public.messages;
create trigger messages_enforce_update
  before update on public.messages
  for each row execute function public.enforce_message_update();

-- Soft-Delete: Body leeren, reply_to lösen, Anhänge und Reaktionen entfernen
create or replace function public.soft_delete_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.body := '';
    new.reply_to := null;
    delete from public.message_attachments where message_id = old.id;
    delete from public.message_reactions where message_id = old.id;
  end if;
  return new;
end;
$$;
revoke execute on function public.soft_delete_message() from public, anon, authenticated;

drop trigger if exists messages_soft_delete on public.messages;
create trigger messages_soft_delete
  before update of deleted_at on public.messages
  for each row execute function public.soft_delete_message();

-- =====================================================================
-- 5) message_reactions
-- =====================================================================

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  member_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, member_id, emoji)
);

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id, created_at);

alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
grant insert (message_id, emoji) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;

drop policy if exists "Reaktionen lesen" on public.message_reactions;
create policy "Reaktionen lesen" on public.message_reactions
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_id
         and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists "Reaktionen setzen" on public.message_reactions;
create policy "Reaktionen setzen" on public.message_reactions
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and (select public.is_active_member())
    and exists (
      select 1 from public.messages m
       where m.id = message_id
         and m.deleted_at is null
         and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists "Eigene Reaktion entfernen" on public.message_reactions;
create policy "Eigene Reaktion entfernen" on public.message_reactions
  for delete to authenticated
  using (member_id = (select auth.uid()));

do $$
begin
  alter publication supabase_realtime add table public.message_reactions;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.message_attachments;
exception
  when duplicate_object then null;
end $$;

-- =====================================================================
-- 6) message_attachments
-- =====================================================================

create table if not exists public.message_attachments (
  id         bigint generated always as identity primary key,
  message_id bigint not null references public.messages (id) on delete cascade,
  path       text not null,
  kind       text not null check (kind in ('image', 'video', 'audio', 'file')),
  mime       text not null,
  size       bigint not null check (size > 0 and size <= 52428800),
  name       text not null check (char_length(trim(name)) between 1 and 255),
  width      int,
  height     int,
  duration   numeric,
  created_at timestamptz not null default now(),
  check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$')
);

create index if not exists message_attachments_message_idx
  on public.message_attachments (message_id);
create index if not exists message_attachments_path_idx
  on public.message_attachments (path);

alter table public.message_attachments enable row level security;
revoke all on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;
grant insert (message_id, path, kind, mime, size, name, width, height, duration)
  on public.message_attachments to authenticated;
grant delete on public.message_attachments to authenticated;
grant usage on sequence public.message_attachments_id_seq to authenticated;

-- Pfad-Ordner = Absender der Nachricht; nur Absender, kurz nach dem Senden
create or replace function public.validate_message_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  created timestamptz;
begin
  if new.path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]+$' then
    raise exception 'Ungültiger Anhangspfad.';
  end if;

  select m.sender_id, m.created_at into sid, created
    from public.messages m
   where m.id = new.message_id;

  if sid is null then
    raise exception 'Nachricht nicht gefunden.';
  end if;
  if sid is distinct from auth.uid() then
    raise exception 'Nur der Absender kann Anhänge hinzufügen.';
  end if;
  if split_part(new.path, '/', 1) is distinct from sid::text then
    raise exception 'Anhangspfad muss zum Absender gehören.';
  end if;
  if created < now() - interval '5 minutes' then
    raise exception 'Anhänge können nur kurz nach dem Senden hinzugefügt werden.';
  end if;

  return new;
end;
$$;
revoke execute on function public.validate_message_attachment() from public, anon, authenticated;

drop trigger if exists message_attachments_validate on public.message_attachments;
create trigger message_attachments_validate
  before insert on public.message_attachments
  for each row execute function public.validate_message_attachment();

drop policy if exists "Anhänge lesen" on public.message_attachments;
create policy "Anhänge lesen" on public.message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_id
         and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
    )
  );

drop policy if exists "Anhänge anhängen" on public.message_attachments;
create policy "Anhänge anhängen" on public.message_attachments
  for insert to authenticated
  with check (
    (select public.is_active_member())
    and exists (
      select 1 from public.messages m
       where m.id = message_id
         and m.sender_id = (select auth.uid())
         and m.deleted_at is null
         and m.created_at > now() - interval '5 minutes'
    )
  );

drop policy if exists "Eigene Anhänge entfernen" on public.message_attachments;
create policy "Eigene Anhänge entfernen" on public.message_attachments
  for delete to authenticated
  using (
    exists (
      select 1 from public.messages m
       where m.id = message_id
         and m.sender_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

-- =====================================================================
-- 7) Storage-Bucket message-attachments
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-attachments',
  'message-attachments',
  false,
  52428800,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
    'audio/ogg',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Xyntal Nachrichtenanhänge hochladen" on storage.objects;
create policy "Xyntal Nachrichtenanhänge hochladen" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (select public.is_active_member())
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.[a-z0-9]+$')
  );

drop policy if exists "Xyntal Nachrichtenanhänge lesen" on storage.objects;
create policy "Xyntal Nachrichtenanhänge lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
          from public.message_attachments a
          join public.messages m on m.id = a.message_id
         where a.path = storage.objects.name
           and (m.sender_id = (select auth.uid()) or m.recipient_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "Xyntal Nachrichtenanhänge entfernen" on storage.objects;
create policy "Xyntal Nachrichtenanhänge entfernen" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
    )
  );

-- =====================================================================
-- 8) Storage-Aufräumen: kein Trigger mehr – direktes Löschen in storage.objects verbietet Supabase.
--    Dateien entfernt der Browser über die Storage-API (siehe 20261028170000_fix_attachment_storage_cleanup).
-- =====================================================================

drop trigger if exists message_attachments_cleanup_storage on public.message_attachments;
drop function if exists public.cleanup_message_attachment_storage();

-- =====================================================================
-- 9) 2FA-Schutz (restriktiv) für neue und bestehende RLS-Tabellen
-- =====================================================================

do $$
declare t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists "2FA erzwingen" on public.%I', t.relname);
    execute format(
      'create policy "2FA erzwingen" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))',
      t.relname
    );
  end loop;
end $$;

commit;
