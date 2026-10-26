-- Projekte anlegen und andere anschreiben – schon mit Konto, ohne auf die Freischaltung zu warten.
-- Voraussetzung: angemeldet, E-Mail (oder Handynummer) bestätigt und nicht abgelehnt.
-- Gegen Spam: höchstens 30 Nachrichten pro Stunde, 3 neue Gespräche pro Stunde und 5 neue Projekte pro Tag.
-- Einmal im Supabase SQL Editor ausführen (nach 009 und 017). Läuft als Transaktion.
begin;

-- 1) Wer darf mitmachen? Konto bestätigt, nicht abgelehnt (Freischaltung nicht nötig)
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected'
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  );
$$;
revoke execute on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

-- 2) Profile: Angemeldete sehen alle nicht abgelehnten Profile (sonst wüsste man nicht, wer schreibt)
drop policy if exists "Profile lesen (angemeldet)" on public.profiles;
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (status <> 'rejected' and (select public.is_active_member()));

-- 3) Projekte: lesen, anlegen und sich für Rollen melden mit Konto
drop policy if exists "Projekte lesen" on public.projects;
create policy "Projekte lesen" on public.projects
  for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()) or (select public.is_active_member()) or (select public.is_admin()));

drop policy if exists "Projekt anlegen" on public.projects;
create policy "Projekt anlegen" on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_active_member()));

create or replace function public.can_join_role(p_role_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.project_roles r
      join public.projects p on p.id = r.project_id
     where r.id = p_role_id
       and not r.filled
       and not p.closed
       and p.owner_id <> auth.uid()
  ) and public.is_active_member();
$$;

-- Höchstens 5 neue Projekte pro Tag und Person
create or replace function public.limit_new_projects()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.projects where owner_id = new.owner_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Du hast heute schon 5 Projekte angelegt. Bitte versuch es morgen wieder.';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_limit on public.projects;
create trigger projects_limit before insert on public.projects
  for each row execute function public.limit_new_projects();
revoke execute on function public.limit_new_projects() from public, anon, authenticated;

-- 4) Nachrichten: mit Konto an alle nicht abgelehnten Profile (nicht an sich selbst)
drop policy if exists "Nachrichten senden" on public.messages;
create policy "Nachrichten senden" on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and recipient_id <> (select auth.uid())
    and (select public.is_active_member())
    and exists (select 1 from public.profiles p where p.id = recipient_id and p.status <> 'rejected')
  );

-- Gegen Spam: 30 Nachrichten pro Stunde, höchstens 3 neue Gespräche pro Stunde
create or replace function public.limit_messages()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Du hast gerade sehr viele Nachrichten geschickt. Bitte warte etwas.';
  end if;
  if not exists (select 1 from public.messages
                  where (sender_id = new.sender_id and recipient_id = new.recipient_id)
                     or (sender_id = new.recipient_id and recipient_id = new.sender_id))
     and (select count(distinct m.recipient_id) from public.messages m
           where m.sender_id = new.sender_id and m.created_at > now() - interval '1 hour'
             and not exists (select 1 from public.messages e
                              where e.sender_id = m.recipient_id and e.recipient_id = m.sender_id
                                and e.created_at < m.created_at)
             and not exists (select 1 from public.messages f
                              where f.sender_id = m.sender_id and f.recipient_id = m.recipient_id
                                and f.created_at < now() - interval '1 hour')) >= 3 then
    raise exception 'Du kannst höchstens 3 neue Gespräche pro Stunde beginnen. Bitte versuch es später noch einmal.';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_limit on public.messages;
create trigger messages_limit before insert on public.messages
  for each row execute function public.limit_messages();
revoke execute on function public.limit_messages() from public, anon, authenticated;

commit;
