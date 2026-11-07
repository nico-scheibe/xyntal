-- Linktree-Seite unter xyntal.de/name: frei wählbare Links mit Reihenfolge, Symbol und Klickzähler.
-- • profile_links: ein Link pro Zeile, nur über die Funktionen unten änderbar (kein direktes Schreiben).
-- • Grenzen: 15 Links, mit Paid (profiles.is_premium) oder als Admin bis 100; nur https/http-Adressen.
-- • get_public_card liefert 'links' (nur aktive, in Reihenfolge) – ohne Klickzahlen.
-- • get_my_links liefert alle eigenen Links; Klickzahlen nur mit Paid/Admin.
-- • track_link_click zählt einen Klick (öffentlich aufrufbar, je Link höchstens 1 Zählung pro Sekunde).
-- Nach 20261107240000_invite_name.sql ausführen. Darf mehrfach laufen.
begin;

create table if not exists public.profile_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  url text not null check (char_length(url) <= 500 and url ~* '^https?://[^[:space:]]{3,}$'),
  icon text not null default 'link' check (icon ~ '^[a-z0-9-]{1,24}$'),
  position int not null default 0,
  active boolean not null default true,
  clicks bigint not null default 0,
  last_clicked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists profile_links_user_idx on public.profile_links (user_id, position);

alter table public.profile_links enable row level security;
revoke all on public.profile_links from anon, authenticated;
-- Keine Policies: Lesen und Schreiben laufen nur über die security-definer-Funktionen.

create or replace function public.link_limit(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when coalesce(p.is_premium, false) or coalesce(p.is_admin, false) then 100 else 15 end
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.link_limit(uuid) from public, anon, authenticated;

create or replace function public.get_my_links()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'title', l.title, 'url', l.url, 'icon', l.icon, 'active', l.active,
    'clicks', case when pr.is_premium or pr.is_admin then l.clicks end) order by l.position, l.created_at), '[]'::jsonb)
  from public.profile_links l
  join public.profiles pr on pr.id = l.user_id
  where l.user_id = auth.uid();
$$;
revoke execute on function public.get_my_links() from public, anon;
grant execute on function public.get_my_links() to authenticated;

-- Ersetzt die komplette Liste: vorhandene Ids behalten ihre Klicks, fehlende werden gelöscht,
-- die Reihenfolge ist die der übergebenen Liste.
create or replace function public.save_my_links(p_links jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_max int;
  v_item jsonb;
  v_pos int := 0;
  v_id uuid;
  v_keep uuid[] := '{}';
  v_title text;
  v_url text;
  v_icon text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  if jsonb_typeof(p_links) is distinct from 'array' then raise exception 'links must be an array' using errcode = '22023'; end if;
  v_max := coalesce(public.link_limit(v_uid), 15);
  if jsonb_array_length(p_links) > v_max then
    raise exception 'link limit % reached', v_max using errcode = '54000';
  end if;

  for v_item in select * from jsonb_array_elements(p_links) loop
    v_title := btrim(coalesce(v_item->>'title', ''));
    v_url := btrim(coalesce(v_item->>'url', ''));
    v_icon := lower(coalesce(nullif(v_item->>'icon', ''), 'link'));
    v_id := case when coalesce(v_item->>'id', '') ~ '^[0-9a-f-]{36}$' then (v_item->>'id')::uuid end;
    if v_id is not null and exists (select 1 from public.profile_links where id = v_id and user_id = v_uid) then
      update public.profile_links
         set title = v_title, url = v_url, icon = v_icon, position = v_pos,
             active = coalesce((v_item->>'active')::boolean, true)
       where id = v_id and user_id = v_uid;
    else
      insert into public.profile_links (user_id, title, url, icon, position, active)
      values (v_uid, v_title, v_url, v_icon, v_pos, coalesce((v_item->>'active')::boolean, true))
      returning id into v_id;
    end if;
    v_keep := v_keep || v_id;
    v_pos := v_pos + 1;
  end loop;

  delete from public.profile_links where user_id = v_uid and not (id = any (v_keep));
  return public.get_my_links();
end;
$$;
revoke execute on function public.save_my_links(jsonb) from public, anon;
grant execute on function public.save_my_links(jsonb) to authenticated;

create or replace function public.track_link_click(p_id uuid)
returns void language sql volatile security definer set search_path = '' as $$
  update public.profile_links l set clicks = l.clicks + 1, last_clicked_at = now()
  where l.id = p_id and l.active
    and (l.last_clicked_at is null or l.last_clicked_at < now() - interval '1 second')
    and exists (select 1 from public.waitlist_cards c where c.user_id = l.user_id and c.is_public);
$$;
revoke execute on function public.track_link_click(uuid) from public;
grant execute on function public.track_link_click(uuid) to anon, authenticated;

create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public or public.ban_active(p.banned, p.banned_until) then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb),
      'user_id', case when auth.uid() is not null then c.user_id end,
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
      'is_premium', coalesce(p.is_premium, false),
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end,
      'links', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url, 'icon', l.icon)
                                          order by l.position, l.created_at)
                         from public.profile_links l where l.user_id = c.user_id and l.active), '[]'::jsonb),
      'profile', case when p.id is null then null else jsonb_build_object(
        'headline', p.headline, 'about', p.about, 'offer', p.offer, 'seek', p.seek,
        'linkedin', p.linkedin, 'instagram', p.instagram, 'website', p.website,
        'avatar_path', case when p.avatar_path ~ '\.jpg$' or p.is_premium then nullif(p.avatar_path, '') end) end)
  end
  from (select 1) one
  left join public.waitlist_cards c on c.handle = lower(trim(p_handle))
  left join public.profiles p on p.id = c.user_id
  where lower(trim(coalesce(p_handle, ''))) ~ '^[a-z0-9][a-z0-9_-]{2,19}$';
$$;
revoke execute on function public.get_public_card(text) from public;
grant execute on function public.get_public_card(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
