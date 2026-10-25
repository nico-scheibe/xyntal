-- Xyntal-Karten von der Warteliste: Wer sich mit Karte einträgt und zustimmt, landet hier.
-- Lesen, bearbeiten und löschen nur Admins. Einfügen nur über submit_waitlist_card().
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion.
-- Bis dahin funktioniert die Warteliste normal, die Karte wird nur nicht gespeichert.
begin;

create table if not exists public.waitlist_cards (
  id          bigint generated always as identity primary key,
  email       text not null unique check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  name        text not null check (char_length(trim(name)) between 1 and 24),
  role        text not null check (role in ('Entwicklung', 'Design', 'Gründung', 'Vertrieb', 'Marketing', 'Daten & KI')),
  skills      text[] not null default '{}' check (cardinality(skills) <= 4),
  hours       int not null check (hours between 1 and 40),
  looking     text not null check (looking in ('Mitgründer:in', 'ein Team für meine Idee', 'ein Projekt zum Mitbauen')),
  pitch       text not null default '' check (char_length(pitch) <= 120),
  lang        text not null default 'de' check (lang in ('de', 'en')),
  status      text not null default 'neu' check (status in ('neu', 'kontaktiert', 'gematcht')),
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists waitlist_cards_created_idx on public.waitlist_cards (created_at desc);

alter table public.waitlist_cards enable row level security;

drop policy if exists "Karten lesen (Admins)" on public.waitlist_cards;
create policy "Karten lesen (Admins)" on public.waitlist_cards
  for select to authenticated using ((select public.is_admin()));
drop policy if exists "Karten bearbeiten (Admins)" on public.waitlist_cards;
create policy "Karten bearbeiten (Admins)" on public.waitlist_cards
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists "Karten löschen (Admins)" on public.waitlist_cards;
create policy "Karten löschen (Admins)" on public.waitlist_cards
  for delete to authenticated using ((select public.is_admin()));

-- Karte speichern. Eine Adresse kann ihre Karte nur innerhalb von 30 Minuten nach dem
-- ersten Eintrag noch ändern; danach bleibt sie, damit niemand fremde Karten überschreibt.
-- Es gibt keine Rückmeldung, ob eine Adresse schon existiert.
create or replace function public.submit_waitlist_card(
  p_email text, p_name text, p_role text, p_skills text[], p_hours int, p_looking text, p_pitch text, p_lang text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_skills text[];
begin
  if (select count(*) from public.waitlist_cards where updated_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Gerade kommen sehr viele Karten an. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  select coalesce(array_agg(s), '{}') into v_skills
  from (select left(trim(x), 20) as s from unnest(coalesce(p_skills, '{}')) as x where trim(x) <> '' limit 4) t;

  insert into public.waitlist_cards (email, name, role, skills, hours, looking, pitch, lang)
  values (lower(trim(p_email)), trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
          case when p_lang = 'en' then 'en' else 'de' end)
  on conflict (email) do update
    set name = excluded.name, role = excluded.role, skills = excluded.skills, hours = excluded.hours,
        looking = excluded.looking, pitch = excluded.pitch, lang = excluded.lang, updated_at = now()
    where public.waitlist_cards.created_at > now() - interval '30 minutes';
end;
$$;
revoke execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text) from public;
grant execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text) to anon, authenticated;

commit;
