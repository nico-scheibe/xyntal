-- Projekte mit offenen Rollen und „Ich wäre dabei“-Meldungen.
-- Einmal im Supabase SQL Editor ausführen, nachdem 003_community.sql gelaufen ist.
-- Läuft als Transaktion. Die Website zeigt bis dahin einen Hinweis statt der Projekte.
begin;

-- ---------- Tabellen ----------

create table if not exists public.projects (
  id          bigint generated always as identity primary key,
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(trim(title)) between 1 and 80),
  pitch       text not null check (char_length(trim(pitch)) between 1 and 200),
  body        text not null default '' check (char_length(body) <= 2000),
  phase       text not null default 'idee' check (phase in ('idee', 'prototyp', 'erste_kunden', 'wachstum')),
  place       text not null default '' check (char_length(place) <= 80),
  is_public   boolean not null default false,
  closed      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists projects_created_idx on public.projects (created_at desc);

create table if not exists public.project_roles (
  id          bigint generated always as identity primary key,
  project_id  bigint not null references public.projects (id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  need        text not null default '' check (char_length(need) <= 200),
  hours       smallint check (hours between 1 and 60),
  filled      boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists project_roles_project_idx on public.project_roles (project_id);

create table if not exists public.project_interest (
  role_id     bigint not null references public.project_roles (id) on delete cascade,
  member_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  primary key (role_id, member_id)
);

-- Höchstens acht Rollen pro Projekt
create or replace function public.limit_project_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.project_roles where project_id = new.project_id) >= 8 then
    raise exception 'Ein Projekt kann höchstens acht Rollen haben.';
  end if;
  return new;
end;
$$;
drop trigger if exists project_roles_limit on public.project_roles;
create trigger project_roles_limit before insert on public.project_roles
  for each row execute function public.limit_project_roles();
revoke execute on function public.limit_project_roles() from public, anon, authenticated;

-- Hilfsfunktion: gehört das Projekt der angemeldeten Person?
create or replace function public.owns_project(p_project_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.projects where id = p_project_id and owner_id = auth.uid());
$$;
revoke execute on function public.owns_project(bigint) from public;
grant execute on function public.owns_project(bigint) to authenticated;

-- Hilfsfunktion: darf die angemeldete Person für diese Rolle Interesse melden?
-- (freigeschaltet, nicht das eigene Projekt, Rolle offen, Projekt nicht geschlossen)
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
  ) and public.is_approved_member();
$$;
revoke execute on function public.can_join_role(bigint) from public;
grant execute on function public.can_join_role(bigint) to authenticated;

-- Hilfsfunktion: gehört die Rolle zu einem eigenen Projekt?
create or replace function public.owns_role(p_role_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_roles r join public.projects p on p.id = r.project_id
     where r.id = p_role_id and p.owner_id = auth.uid()
  );
$$;
revoke execute on function public.owns_role(bigint) from public;
grant execute on function public.owns_role(bigint) to authenticated;

-- ---------- Zugriffsrechte & Row Level Security ----------

alter table public.projects         enable row level security;
alter table public.project_roles    enable row level security;
alter table public.project_interest enable row level security;

revoke all on public.projects, public.project_roles, public.project_interest from anon, authenticated;

-- Projekte: Gäste sehen öffentliche, Mitglieder alle, Eigene immer
grant select on public.projects to anon, authenticated;
grant insert (title, pitch, body, phase, place, is_public) on public.projects to authenticated;
grant update (title, pitch, body, phase, place, is_public, closed) on public.projects to authenticated;
grant delete on public.projects to authenticated;

drop policy if exists "Projekte lesen" on public.projects;
create policy "Projekte lesen" on public.projects
  for select to anon, authenticated
  using (is_public or owner_id = (select auth.uid()) or (select public.is_approved_member()) or (select public.is_admin()));

drop policy if exists "Projekt anlegen" on public.projects;
create policy "Projekt anlegen" on public.projects
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select public.is_approved_member()));

drop policy if exists "Eigenes Projekt ändern" on public.projects;
create policy "Eigenes Projekt ändern" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Eigenes Projekt löschen (Admins alle)" on public.projects;
create policy "Eigenes Projekt löschen (Admins alle)" on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- Rollen: sichtbar, wenn das Projekt sichtbar ist; ändern nur die Projektinhaber
grant select on public.project_roles to anon, authenticated;
grant insert (project_id, name, need, hours) on public.project_roles to authenticated;
grant update (name, need, hours, filled) on public.project_roles to authenticated;
grant delete on public.project_roles to authenticated;

drop policy if exists "Rollen lesen" on public.project_roles;
create policy "Rollen lesen" on public.project_roles
  for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));

drop policy if exists "Rollen anlegen" on public.project_roles;
create policy "Rollen anlegen" on public.project_roles
  for insert to authenticated
  with check ((select public.owns_project(project_id)));

drop policy if exists "Rollen ändern" on public.project_roles;
create policy "Rollen ändern" on public.project_roles
  for update to authenticated
  using ((select public.owns_project(project_id)))
  with check ((select public.owns_project(project_id)));

drop policy if exists "Rollen löschen" on public.project_roles;
create policy "Rollen löschen" on public.project_roles
  for delete to authenticated
  using ((select public.owns_project(project_id)) or (select public.is_admin()));

-- Interesse: sehen nur die meldende Person und die Projektinhaber
grant select on public.project_interest to authenticated;
grant insert (role_id, note) on public.project_interest to authenticated;
grant delete on public.project_interest to authenticated;

drop policy if exists "Interesse lesen" on public.project_interest;
create policy "Interesse lesen" on public.project_interest
  for select to authenticated
  using (member_id = (select auth.uid()) or (select public.owns_role(role_id)));

drop policy if exists "Interesse melden" on public.project_interest;
create policy "Interesse melden" on public.project_interest
  for insert to authenticated
  with check (member_id = (select auth.uid()) and (select public.can_join_role(role_id)));

drop policy if exists "Interesse zurückziehen" on public.project_interest;
create policy "Interesse zurückziehen" on public.project_interest
  for delete to authenticated
  using (member_id = (select auth.uid()) or (select public.owns_role(role_id)));

commit;
