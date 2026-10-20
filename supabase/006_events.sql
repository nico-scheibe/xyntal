-- Mehrere Treffen und verbindliche Zusagen. Nach 005 einmal ausführen.
-- Alte next_event/event_signups bleiben unverändert als Archiv erhalten.
begin;
create table public.events (
  id bigint generated always as identity primary key,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  starts_at timestamptz not null,
  place text not null check (char_length(trim(place)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 200),
  is_public boolean not null default true,
  cancelled boolean not null default false,
  created_at timestamptz not null default now()
);
create index events_starts_at_idx on public.events(starts_at);
create table public.event_rsvps (
  event_id bigint not null references public.events(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id, member_id)
);
create index event_rsvps_member_idx on public.event_rsvps(member_id, event_id);
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
revoke all on public.events, public.event_rsvps from public,anon,authenticated;
grant select on public.events to anon,authenticated;
grant insert(title,description,starts_at,place,address,is_public) on public.events to authenticated;
grant update(title,description,starts_at,place,address,is_public,cancelled) on public.events to authenticated;
grant select on public.event_rsvps to authenticated;
create policy "Treffen lesen" on public.events for select to anon,authenticated
  using(is_public or (select public.is_approved_member()) or (select public.is_admin()));
create policy "Admins erstellen Treffen" on public.events for insert to authenticated
  with check((select public.is_admin()));
create policy "Admins bearbeiten Treffen" on public.events for update to authenticated
  using((select public.is_admin())) with check((select public.is_admin()));
create policy "Eigene Zusagen und Adminliste" on public.event_rsvps for select to authenticated
  using(member_id=(select auth.uid()) or (select public.is_admin()));

-- Nur Summen, keine Mitgliedernamen: auch für Gäste, aber nur sichtbare Treffen.
create function public.event_counts(p_event_ids bigint[])
returns table(event_id bigint, attending_count bigint)
language sql stable security definer set search_path='' as $$
  select e.id, (select count(*) from public.event_rsvps r where r.event_id=e.id)
  from public.events e
  where e.id=any(p_event_ids[1:100])
    and (e.is_public or public.is_approved_member() or public.is_admin());
$$;
-- Ausschließlich eigene Zusagen. Die Zeilensperre verhindert, dass eine Zusage
-- eine gleichzeitig gespeicherte Event-Absage überholt. Direkte Schreibrechte
-- auf event_rsvps werden nicht vergeben.
create function public.set_event_attendance(p_event_id bigint, p_attending boolean)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_event public.events%rowtype;
begin
  if v_user is null then raise exception 'Bitte melde dich zuerst an.'; end if;
  if p_attending is null then raise exception 'Bitte wähle Zu- oder Absage.'; end if;
  if not p_attending then
    delete from public.event_rsvps where event_id=p_event_id and member_id=v_user;
    return;
  end if;
  if not public.is_approved_member() then raise exception 'Nach deiner Freigabe kannst du zusagen.'; end if;
  select * into v_event from public.events where id=p_event_id for update;
  if not found then raise exception 'Dieses Treffen ist nicht verfügbar.'; end if;
  if v_event.cancelled then raise exception 'Dieses Treffen wurde abgesagt.'; end if;
  if v_event.starts_at <= clock_timestamp() then raise exception 'Dieses Treffen hat bereits begonnen.'; end if;
  insert into public.event_rsvps(event_id,member_id) values(p_event_id,v_user)
  on conflict(event_id,member_id) do nothing;
end;
$$;
revoke execute on function public.event_counts(bigint[]),public.set_event_attendance(bigint,boolean)
  from public,anon,authenticated;
grant execute on function public.event_counts(bigint[]) to anon,authenticated;
grant execute on function public.set_event_attendance(bigint,boolean) to authenticated;
commit;
