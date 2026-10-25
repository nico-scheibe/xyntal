-- Beta-Programm: Bewerbungen auch ohne Konto, lesen und bearbeiten nur Admins.
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion.
-- Bis dahin zeigt /beta beim Absenden einen Hinweis statt die Bewerbung zu speichern.
begin;

create table if not exists public.beta_applications (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(trim(name)) between 1 and 80),
  email       text not null unique check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  focus       text not null check (focus in ('entwicklung', 'design', 'gruendung', 'vertrieb', 'anderes')),
  project     text not null default '' check (char_length(project) <= 200),
  why         text not null check (char_length(trim(why)) between 80 and 1500),
  hours       text not null check (hours in ('1-2', '3-5', '6+')),
  link        text not null default '' check (char_length(link) <= 300),
  status      text not null default 'neu' check (status in ('neu', 'in_pruefung', 'eingeladen', 'warteliste', 'angenommen', 'abgelehnt')),
  admin_note  text not null default '' check (char_length(admin_note) <= 2000),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index if not exists beta_applications_created_idx on public.beta_applications (created_at desc);

alter table public.beta_applications add column if not exists admin_note text not null default '' check (char_length(admin_note) <= 2000);
alter table public.beta_applications add column if not exists updated_at timestamptz not null default now();
alter table public.beta_applications drop constraint if exists beta_applications_status_check;
alter table public.beta_applications add constraint beta_applications_status_check check (status in ('neu','in_pruefung','eingeladen','warteliste','angenommen','abgelehnt'));
alter table public.beta_applications enable row level security;
revoke all on public.beta_applications from anon, authenticated;
grant select, delete on public.beta_applications to authenticated;
grant update (status, admin_note) on public.beta_applications to authenticated;

create or replace function public.touch_beta_application()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.touch_beta_application() from public, anon, authenticated;
create or replace trigger beta_application_updated before update on public.beta_applications
  for each row execute function public.touch_beta_application();

-- Kein direktes Einfügen: Bewerbungen laufen nur über apply_for_beta()
drop policy if exists "Beta-Bewerbungen lesen (Admins)" on public.beta_applications;
create policy "Beta-Bewerbungen lesen (Admins)" on public.beta_applications
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "Beta-Bewerbungen bewerten (Admins)" on public.beta_applications;
create policy "Beta-Bewerbungen bewerten (Admins)" on public.beta_applications
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Beta-Bewerbungen löschen (Admins)" on public.beta_applications;
create policy "Beta-Bewerbungen löschen (Admins)" on public.beta_applications
  for delete to authenticated using ((select public.is_admin()));

-- Bewerbung einreichen. Pro E-Mail-Adresse zählt die erste Bewerbung; eine zweite wird
-- stillschweigend ignoriert, damit niemand prüfen kann, wer sich schon beworben hat.
create or replace function public.apply_for_beta(
  p_name text, p_email text, p_focus text, p_project text, p_why text, p_hours text, p_link text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_link text := trim(coalesce(p_link, ''));
begin
  -- Grober Schutz gegen Massen-Einsendungen
  if (select count(*) from public.beta_applications where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Gerade kommen sehr viele Bewerbungen an. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  if v_link <> '' and v_link !~* '^https?://' then
    v_link := 'https://' || v_link;
  end if;
  insert into public.beta_applications (name, email, focus, project, why, hours, link)
  values (trim(p_name), lower(trim(p_email)), p_focus, trim(coalesce(p_project, '')), trim(p_why), p_hours, v_link)
  on conflict (email) do nothing;
end;
$$;
revoke execute on function public.apply_for_beta(text, text, text, text, text, text, text) from public;
grant execute on function public.apply_for_beta(text, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
