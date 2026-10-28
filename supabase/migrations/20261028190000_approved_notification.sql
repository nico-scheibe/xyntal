-- „Du bist freigeschaltet“ als einmalige Benachrichtigung (Glocke) statt dauerhaftem Hinweis im Profil.
-- Neue Art „approved“; sie entsteht genau einmal, wenn der Admin ein Profil auf „approved“ setzt.
-- Einmal im Supabase SQL Editor ausführen (nach 004). Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- Prüfregeln für die Art erweitern (alte, automatisch benannte Regeln ersetzen)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.notifications'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.notifications drop constraint %I', c.conname);
  end loop;
end;
$$;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('message', 'comment', 'approved'));
alter table public.notifications add constraint notifications_refs_check
  check ((kind = 'message' and message_id is not null and comment_id is null and post_id is null)
      or (kind = 'comment' and message_id is null and comment_id is not null and post_id is not null)
      or (kind = 'approved' and message_id is null and comment_id is null and post_id is null));

-- Höchstens eine Freischaltungs-Benachrichtigung pro Person
create unique index if not exists notifications_approved_once on public.notifications (recipient_id) where kind = 'approved';

create or replace function public.notify_profile_approved()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.notifications (recipient_id, kind) values (new.id, 'approved')
    on conflict (recipient_id) where kind = 'approved' do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.notify_profile_approved() from public, anon, authenticated;

drop trigger if exists notification_after_approval on public.profiles;
create trigger notification_after_approval after update of status on public.profiles
  for each row execute function public.notify_profile_approved();

commit;
