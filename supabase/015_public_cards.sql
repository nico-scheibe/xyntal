-- Wunsch-Links öffnen: xyntal.de/name zeigt die Karte – aber nur, wenn die Person zugestimmt hat.
-- Ohne Zustimmung zeigt der Link nur „reserviert“, ohne persönliche Daten. Das Foto wird nie gespeichert.
-- Einmal im Supabase SQL Editor ausführen (nach 013). Läuft als Transaktion.
begin;

-- 1) Zustimmung und Gestaltung (Farben, Layout, Reihenfolge – keine persönlichen Daten)
alter table public.waitlist_cards
  add column if not exists is_public boolean not null default false,
  add column if not exists design jsonb check (design is null or (jsonb_typeof(design) = 'object' and octet_length(design::text) <= 1000));

-- 2) Karte speichern – jetzt auch mit Zustimmung zur öffentlichen Karte und ihrer Gestaltung.
drop function if exists public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text, text);
create or replace function public.submit_waitlist_card(
  p_email text, p_name text, p_role text, p_skills text[], p_hours int, p_looking text, p_pitch text, p_lang text,
  p_city text default '', p_mode text default '', p_level text default '', p_link text default '', p_handle text default '',
  p_public boolean default false, p_design jsonb default null
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(trim(p_email));
  v_skills text[];
  v_link   text := left(trim(coalesce(p_link, '')), 200);
  v_handle text := nullif(lower(trim(coalesce(p_handle, ''))), '');
  v_status text := '';
  v_design jsonb := case when jsonb_typeof(p_design) = 'object' and octet_length(p_design::text) <= 1000 then p_design end;
begin
  if (select count(*) from public.waitlist_cards where updated_at > now() - interval '10 minutes') >= 60 then
    raise exception 'Gerade kommen sehr viele Karten an. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  select coalesce(array_agg(s), '{}') into v_skills
  from (select left(trim(x), 20) as s from unnest(coalesce(p_skills, '{}')) as x where trim(x) <> '' limit 4) t;
  if v_link !~ '^https?://[^[:space:]]+$' then v_link := ''; end if;

  if v_handle is not null then
    if v_handle !~ '^[a-z0-9][a-z0-9_-]{2,19}$' or v_handle = any (array[
        'admin', 'api', 'app', 'about', 'beta', 'bestaetigt', 'blog', 'datenschutz', 'demo', 'help', 'hilfe', 'impressum',
        'karte', 'login', 'logout', 'mail', 'news', 'preise', 'pricing', 'profil', 'projekte', 'register', 'settings',
        'signup', 'support', 'team', 'warteliste', 'www', 'xyntal']) then
      v_handle := null; v_status := 'invalid';
    elsif exists (select 1 from public.waitlist_cards where handle = v_handle and email <> v_email) then
      v_handle := null; v_status := 'taken';
    else
      v_status := 'ok';
    end if;
  end if;

  begin
    insert into public.waitlist_cards (email, name, role, skills, hours, looking, pitch, lang, city, mode, level, link, handle, is_public, design)
    values (v_email, trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
            case when p_lang = 'en' then 'en' else 'de' end,
            left(trim(coalesce(p_city, '')), 40), coalesce(p_mode, ''), coalesce(p_level, ''), v_link, v_handle, coalesce(p_public, false), v_design)
    on conflict (email) do update
      set name = excluded.name, role = excluded.role, skills = excluded.skills, hours = excluded.hours,
          looking = excluded.looking, pitch = excluded.pitch, lang = excluded.lang,
          city = excluded.city, mode = excluded.mode, level = excluded.level, link = excluded.link,
          handle = coalesce(excluded.handle, public.waitlist_cards.handle), is_public = excluded.is_public, design = excluded.design, updated_at = now()
      where public.waitlist_cards.created_at > now() - interval '30 minutes';
  exception when unique_violation then
    -- gleichzeitig vergeben: ohne Wunsch-Link speichern
    v_status := 'taken';
    insert into public.waitlist_cards (email, name, role, skills, hours, looking, pitch, lang, city, mode, level, link, is_public, design)
    values (v_email, trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
            case when p_lang = 'en' then 'en' else 'de' end,
            left(trim(coalesce(p_city, '')), 40), coalesce(p_mode, ''), coalesce(p_level, ''), v_link, false, v_design)
    on conflict (email) do nothing;
  end;
  return v_status;
end;
$$;
revoke execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text, text, boolean, jsonb) from public;
grant execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text, text, boolean, jsonb) to anon, authenticated;

-- 3) Öffentliche Karte lesen: nur freigegebene Felder, nur mit Zustimmung
create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb))
  end
  from (select 1) one
  left join public.waitlist_cards c on c.handle = lower(trim(p_handle))
  where lower(trim(coalesce(p_handle, ''))) ~ '^[a-z0-9][a-z0-9_-]{2,19}$';
$$;
revoke execute on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

commit;
