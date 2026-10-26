-- Persönliche Profile: Die Xyntal-Karte gehört zum Konto.
-- Wer sich mit derselben (bestätigten) E-Mail anmeldet wie bei der Warteliste, übernimmt seine Karte.
-- Bearbeitet wird nur über get_my_card / save_my_card – Stand, Notiz und E-Mail bleiben beim Admin.
-- Das öffentliche Profil unter xyntal.de/name zeigt zusätzlich Profilinfos – nur mit Zustimmung (is_public).
-- Einmal im Supabase SQL Editor ausführen (nach 015). Läuft als Transaktion.
begin;

alter table public.waitlist_cards
  add column if not exists user_id uuid unique references auth.users (id) on delete set null;

-- Eigene, bestätigte E-Mail-Adresse des eingeloggten Kontos (oder null)
create or replace function public.my_confirmed_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email is not null and email_confirmed_at is not null;
$$;
revoke execute on function public.my_confirmed_email() from public, anon;

-- 2FA: true, wenn die Sitzung den zweiten Faktor bestätigt hat – oder das Konto keine 2FA nutzt
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

-- Eigene Karte (übernimmt beim ersten Aufruf die Warteliste-Karte mit derselben E-Mail)
create or replace function public.get_my_card()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := public.my_confirmed_email();
  c       public.waitlist_cards;
begin
  if v_uid is null then raise exception 'Bitte melde dich an.' using errcode = '42501'; end if;
  if not public.mfa_ok() then raise exception 'Bitte bestätige zuerst deinen 2FA-Code.' using errcode = '42501'; end if;
  select * into c from public.waitlist_cards where user_id = v_uid;
  if c.id is null and v_email is not null then
    update public.waitlist_cards set user_id = v_uid where email = v_email and user_id is null returning * into c;
  end if;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills), 'hours', c.hours,
    'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch, 'link', c.link,
    'handle', c.handle, 'is_public', c.is_public, 'design', coalesce(c.design, '{}'::jsonb), 'lang', c.lang);
end;
$$;
revoke execute on function public.get_my_card() from public, anon;
grant execute on function public.get_my_card() to authenticated;

-- Eigene Karte speichern. Rückgabe: Stand des Wunsch-Links ('', 'ok', 'taken', 'invalid')
create or replace function public.save_my_card(
  p_name text, p_role text, p_skills text[], p_hours int, p_looking text, p_pitch text, p_lang text,
  p_city text, p_mode text, p_level text, p_link text, p_handle text, p_public boolean, p_design jsonb
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := public.my_confirmed_email();
  v_skills text[];
  v_link   text := left(trim(coalesce(p_link, '')), 200);
  v_handle text := nullif(lower(trim(coalesce(p_handle, ''))), '');
  v_status text := '';
  v_design jsonb := case when jsonb_typeof(p_design) = 'object' and octet_length(p_design::text) <= 1000 then p_design end;
  v_id     bigint;
begin
  if v_uid is null then raise exception 'Bitte melde dich an.' using errcode = '42501'; end if;
  perform public.get_my_card();  -- vorhandene Warteliste-Karte übernehmen
  select id into v_id from public.waitlist_cards where user_id = v_uid;
  if v_id is null and v_email is null then
    raise exception 'Bitte bestätige zuerst deine E-Mail-Adresse.' using errcode = '42501';
  end if;
  select coalesce(array_agg(s), '{}') into v_skills
  from (select left(trim(x), 20) as s from unnest(coalesce(p_skills, '{}')) as x where trim(x) <> '' limit 4) t;
  if v_link !~ '^https?://[^[:space:]]+$' then v_link := ''; end if;

  if v_handle is not null then
    if v_handle !~ '^[a-z0-9][a-z0-9_-]{2,19}$' or v_handle = any (array[
        'admin', 'api', 'app', 'about', 'beta', 'bestaetigt', 'blog', 'datenschutz', 'demo', 'help', 'hilfe', 'impressum',
        'karte', 'login', 'logout', 'mail', 'meine-karte', 'mitglieder', 'mitglied-werden', 'nachrichten', 'news', 'passwort-neu',
        'preise', 'pricing', 'profil', 'projekte', 'register', 'settings', 'signup', 'support', 'team', 'warteliste', 'www',
        'xyntal', 'boerse', 'community', 'events']) then
      v_status := 'invalid';
    elsif exists (select 1 from public.waitlist_cards where handle = v_handle and (v_id is null or id <> v_id)) then
      v_status := 'taken';
    else
      v_status := 'ok';
    end if;
  end if;

  begin
    if v_id is null then
      insert into public.waitlist_cards (email, user_id, name, role, skills, hours, looking, pitch, lang, city, mode, level, link, handle, is_public, design)
      values (v_email, v_uid, trim(p_name), p_role, v_skills, p_hours, p_looking, left(trim(coalesce(p_pitch, '')), 120),
              case when p_lang = 'en' then 'en' else 'de' end, left(trim(coalesce(p_city, '')), 40), coalesce(p_mode, ''),
              coalesce(p_level, ''), v_link, case when v_status = 'ok' then v_handle end,
              coalesce(p_public, false) and v_status = 'ok', v_design);
    else
      update public.waitlist_cards set
        name = trim(p_name), role = p_role, skills = v_skills, hours = p_hours, looking = p_looking,
        pitch = left(trim(coalesce(p_pitch, '')), 120), lang = case when p_lang = 'en' then 'en' else 'de' end,
        city = left(trim(coalesce(p_city, '')), 40), mode = coalesce(p_mode, ''), level = coalesce(p_level, ''), link = v_link,
        -- leerer Wunsch-Link gibt ihn frei; ein vergebener/ungültiger lässt den bisherigen stehen
        handle = case when v_handle is null then null when v_status = 'ok' then v_handle else handle end,
        design = v_design, updated_at = now()
      where id = v_id;
      -- öffentlich nur mit eigenem Wunsch-Link
      update public.waitlist_cards set is_public = coalesce(p_public, false) and handle is not null where id = v_id;
    end if;
  exception when unique_violation then
    v_status := 'taken';
  end;
  return v_status;
end;
$$;
revoke execute on function public.save_my_card(text, text, text[], int, text, text, text, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_my_card(text, text, text[], int, text, text, text, text, text, text, text, text, boolean, jsonb) to authenticated;

-- Öffentliches Profil: Karte + Profilinfos des verknüpften Kontos – nur mit Zustimmung
create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb),
      'profile', case when p.id is null then null else jsonb_build_object(
        'headline', p.headline, 'about', p.about, 'offer', p.offer, 'seek', p.seek,
        'linkedin', p.linkedin, 'instagram', p.instagram, 'website', p.website,
        'avatar_path', nullif(p.avatar_path, '')) end)
  end
  from (select 1) one
  left join public.waitlist_cards c on c.handle = lower(trim(p_handle))
  left join public.profiles p on p.id = c.user_id
  where lower(trim(coalesce(p_handle, ''))) ~ '^[a-z0-9][a-z0-9_-]{2,19}$';
$$;
revoke execute on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

commit;
