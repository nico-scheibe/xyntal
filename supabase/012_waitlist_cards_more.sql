-- Xyntal-Karten: mehr Angaben für das Matching (Stadt, Arbeitsweise, Erfahrung, Link).
-- Das Foto und die Gestaltung der Karte bleiben auf dem Gerät und werden nicht gespeichert.
-- Einmal im Supabase SQL Editor ausführen (nach 011). Läuft als Transaktion.
begin;

alter table public.waitlist_cards
  add column if not exists city  text not null default '' check (char_length(city) <= 40),
  add column if not exists mode  text not null default '' check (mode in ('', 'Remote', 'Hybrid', 'Vor Ort')),
  add column if not exists level text not null default '' check (level in ('', 'Einsteiger', 'Fortgeschritten', 'Profi')),
  add column if not exists link  text not null default '' check (char_length(link) <= 200 and (link = '' or link ~ '^https?://[^[:space:]]+$'));

-- Alte Fassung ersetzen; die neuen Parameter haben Standardwerte, damit ältere Seitenstände weiter funktionieren.
drop function if exists public.submit_waitlist_card(text, text, text, text[], int, text, text, text);
create or replace function public.submit_waitlist_card(
  p_email text, p_name text, p_role text, p_skills text[], p_hours int, p_looking text, p_pitch text, p_lang text,
  p_city text default '', p_mode text default '', p_level text default '', p_link text default ''
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_skills text[];
  v_link text := left(trim(coalesce(p_link, '')), 200);
begin
  if (select count(*) from public.waitlist_cards where updated_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Gerade kommen sehr viele Karten an. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  select coalesce(array_agg(s), '{}') into v_skills
  from (select left(trim(x), 20) as s from unnest(coalesce(p_skills, '{}')) as x where trim(x) <> '' limit 4) t;
  if v_link !~ '^https?://[^[:space:]]+$' then v_link := ''; end if;

  insert into public.waitlist_cards (email, name, role, skills, hours, looking, pitch, lang, city, mode, level, link)
  values (lower(trim(p_email)), trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
          case when p_lang = 'en' then 'en' else 'de' end,
          left(trim(coalesce(p_city, '')), 40), coalesce(p_mode, ''), coalesce(p_level, ''), v_link)
  on conflict (email) do update
    set name = excluded.name, role = excluded.role, skills = excluded.skills, hours = excluded.hours,
        looking = excluded.looking, pitch = excluded.pitch, lang = excluded.lang,
        city = excluded.city, mode = excluded.mode, level = excluded.level, link = excluded.link, updated_at = now()
    where public.waitlist_cards.created_at > now() - interval '30 minutes';
end;
$$;
revoke execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text) to anon, authenticated;

commit;
