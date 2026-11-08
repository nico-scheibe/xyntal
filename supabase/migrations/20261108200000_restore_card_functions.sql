-- Reparatur: ALLES-AUSFUEHREN.sql aus einem veralteten lokalen Stand hat am 08.11. alte Fassungen
-- von get_public_card, get_member_cards (aus 20261103180000_website_ban.sql) und
-- beta_application_required (aus 20261103160000_account_requires_beta_application.sql) zurückgespielt.
-- Folgen: keine Banner, keine animierten Profilbilder (is_premium fehlte), freie Seite (page) und
-- Links wurden nicht mehr geladen, und ein Konto verlangte wieder eine Beta-Bewerbung.
-- Hier stehen wörtlich die neuesten Fassungen aus:
--   20261108110000_custom_page.sql               (get_public_card)
--   20261107190000_banner_limits_table.sql       (get_member_cards)
--   20261107210000_account_without_beta_application.sql (beta_application_required)
-- Darf mehrfach laufen.
begin;

create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public or public.ban_active(p.banned, p.banned_until) then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb),
      'page', c.page,
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

create or replace function public.get_member_cards()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id, 'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level,
      'skills', to_jsonb(c.skills), 'hours', c.hours, 'mode', c.mode, 'city', c.city,
      'looking', c.looking, 'pitch', c.pitch, 'link', c.link, 'design', coalesce(c.design, '{}'::jsonb),
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
      'is_premium', coalesce(p.is_premium, false),
      'banner_path', case when p.is_premium then nullif(p.banner_path, '') end,
      'avatar_path', case when p.avatar_path ~ '\.jpg$' or p.is_premium then nullif(p.avatar_path, '') end
    )), '[]'::jsonb)
  from public.waitlist_cards c
  join public.profiles p on p.id = c.user_id
  where c.is_public and c.handle is not null and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

create or replace function public.beta_application_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;
revoke execute on function public.beta_application_required() from public;
grant execute on function public.beta_application_required() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
