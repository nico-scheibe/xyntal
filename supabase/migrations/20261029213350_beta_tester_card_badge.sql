-- Beta-Tester-Status wird von Admins vergeben und auf oeffentlichen Karten angezeigt.
begin;

alter table public.profiles
  add column if not exists is_beta_tester boolean not null default false;

create or replace function public.admin_set_beta_tester(p_id uuid, p_is_beta_tester boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  update public.profiles set is_beta_tester = coalesce(p_is_beta_tester, false) where id = p_id;
  if not found then
    raise exception 'Mitglied nicht gefunden.' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.admin_set_beta_tester(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_beta_tester(uuid, boolean) to authenticated;

create or replace function public.get_member_cards()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id, 'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level,
      'skills', to_jsonb(c.skills), 'hours', c.hours, 'mode', c.mode, 'city', c.city,
      'looking', c.looking, 'pitch', c.pitch, 'link', c.link, 'design', coalesce(c.design, '{}'::jsonb),
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false)
    )), '[]'::jsonb)
  from public.waitlist_cards c
  join public.profiles p on p.id = c.user_id
  where c.is_public and c.handle is not null and p.status <> 'rejected';
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public then jsonb_build_object('handle', c.handle, 'reserved', true)
    else jsonb_build_object(
      'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level, 'skills', to_jsonb(c.skills),
      'hours', c.hours, 'mode', c.mode, 'city', c.city, 'looking', c.looking, 'pitch', c.pitch,
      'link', c.link, 'lang', c.lang, 'design', coalesce(c.design, '{}'::jsonb),
      'user_id', case when auth.uid() is not null then c.user_id end,
      'is_verified', coalesce(p.is_verified, false),
      'is_admin', coalesce(p.is_admin, false),
      'is_beta_tester', coalesce(p.is_beta_tester, false),
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
