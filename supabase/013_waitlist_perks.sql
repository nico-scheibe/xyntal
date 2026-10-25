-- Vorteile der Warteliste: Wunsch-Link (xyntal.de/name) und Einladungen (1 Woche gratis pro geworbener Person).
-- Einmal im Supabase SQL Editor ausführen (nach 011 und 012). Läuft als Transaktion.
-- Lesen und Löschen nur Admins; geschrieben wird nur über die Funktionen unten.
begin;

-- 1) Wunsch-Link auf der Karte – jeder Name nur einmal
alter table public.waitlist_cards
  add column if not exists handle text check (handle is null or handle ~ '^[a-z0-9][a-z0-9_-]{2,19}$');
create unique index if not exists waitlist_cards_handle_key on public.waitlist_cards (handle) where handle is not null;

-- 2) Einladungen: jede Adresse bekommt einen Code, jede neue Adresse zählt höchstens einmal
create table if not exists public.waitlist_referrers (
  code       text primary key check (code ~ '^[a-z0-9]{8}$'),
  email      text not null unique check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now()
);
create table if not exists public.waitlist_referrals (
  id         bigint generated always as identity primary key,
  code       text not null references public.waitlist_referrers (code) on delete cascade,
  email      text not null unique check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now()
);
create index if not exists waitlist_referrals_code_idx on public.waitlist_referrals (code);
alter table public.waitlist_referrers enable row level security;
alter table public.waitlist_referrals enable row level security;
drop policy if exists "Werber lesen (Admins)" on public.waitlist_referrers;
create policy "Werber lesen (Admins)" on public.waitlist_referrers for select to authenticated using ((select public.is_admin()));
drop policy if exists "Werber löschen (Admins)" on public.waitlist_referrers;
create policy "Werber löschen (Admins)" on public.waitlist_referrers for delete to authenticated using ((select public.is_admin()));
drop policy if exists "Einladungen lesen (Admins)" on public.waitlist_referrals;
create policy "Einladungen lesen (Admins)" on public.waitlist_referrals for select to authenticated using ((select public.is_admin()));
drop policy if exists "Einladungen löschen (Admins)" on public.waitlist_referrals;
create policy "Einladungen löschen (Admins)" on public.waitlist_referrals for delete to authenticated using ((select public.is_admin()));
grant select, delete on public.waitlist_referrers, public.waitlist_referrals to authenticated;

-- 3) Karte speichern – jetzt mit Wunsch-Link. Rückgabe: '' (kein Link), 'ok', 'taken' oder 'invalid'.
drop function if exists public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text);
create or replace function public.submit_waitlist_card(
  p_email text, p_name text, p_role text, p_skills text[], p_hours int, p_looking text, p_pitch text, p_lang text,
  p_city text default '', p_mode text default '', p_level text default '', p_link text default '', p_handle text default ''
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email  text := lower(trim(p_email));
  v_skills text[];
  v_link   text := left(trim(coalesce(p_link, '')), 200);
  v_handle text := nullif(lower(trim(coalesce(p_handle, ''))), '');
  v_status text := '';
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
    insert into public.waitlist_cards (email, name, role, skills, hours, looking, pitch, lang, city, mode, level, link, handle)
    values (v_email, trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
            case when p_lang = 'en' then 'en' else 'de' end,
            left(trim(coalesce(p_city, '')), 40), coalesce(p_mode, ''), coalesce(p_level, ''), v_link, v_handle)
    on conflict (email) do update
      set name = excluded.name, role = excluded.role, skills = excluded.skills, hours = excluded.hours,
          looking = excluded.looking, pitch = excluded.pitch, lang = excluded.lang,
          city = excluded.city, mode = excluded.mode, level = excluded.level, link = excluded.link,
          handle = coalesce(excluded.handle, public.waitlist_cards.handle), updated_at = now()
      where public.waitlist_cards.created_at > now() - interval '30 minutes';
  exception when unique_violation then
    -- gleichzeitig vergeben: ohne Wunsch-Link speichern
    v_status := 'taken';
    insert into public.waitlist_cards (email, name, role, skills, hours, looking, pitch, lang, city, mode, level, link)
    values (v_email, trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
            case when p_lang = 'en' then 'en' else 'de' end,
            left(trim(coalesce(p_city, '')), 40), coalesce(p_mode, ''), coalesce(p_level, ''), v_link)
    on conflict (email) do nothing;
  end;
  return v_status;
end;
$$;
revoke execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text, text) from public;
grant execute on function public.submit_waitlist_card(text, text, text, text[], int, text, text, text, text, text, text, text, text) to anon, authenticated;

-- 4) Eigenen Einladungscode holen (wird beim ersten Mal angelegt)
create or replace function public.get_referral_code(p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_code  text;
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(v_email) > 254 then
    raise exception 'Ungültige E-Mail-Adresse.' using errcode = '22023';
  end if;
  select code into v_code from public.waitlist_referrers where email = v_email;
  if v_code is not null then return v_code; end if;
  if (select count(*) from public.waitlist_referrers where created_at > now() - interval '10 minutes') >= 120 then
    raise exception 'Gerade ist viel los. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  loop
    v_code := substr(md5(random()::text || clock_timestamp()::text || v_email), 1, 8);
    begin
      insert into public.waitlist_referrers (code, email) values (v_code, v_email);
      return v_code;
    exception when unique_violation then
      select code into v_code from public.waitlist_referrers where email = v_email;
      if v_code is not null then return v_code; end if;
    end;
  end loop;
end;
$$;
revoke execute on function public.get_referral_code(text) from public;
grant execute on function public.get_referral_code(text) to anon, authenticated;

-- 5) Einladung festhalten: neue Adresse + gültiger Code, nicht sich selbst, nur die erste zählt
create or replace function public.track_referral(p_email text, p_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(p_email));
  v_code  text := lower(trim(p_code));
begin
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(v_email) > 254 or v_code !~ '^[a-z0-9]{8}$' then
    return;
  end if;
  if (select count(*) from public.waitlist_referrals where created_at > now() - interval '10 minutes') >= 120 then
    return;
  end if;
  if not exists (select 1 from public.waitlist_referrers where code = v_code and email <> v_email) then
    return;
  end if;
  insert into public.waitlist_referrals (code, email) values (v_code, v_email) on conflict (email) do nothing;
end;
$$;
revoke execute on function public.track_referral(text, text) from public;
grant execute on function public.track_referral(text, text) to anon, authenticated;

commit;
