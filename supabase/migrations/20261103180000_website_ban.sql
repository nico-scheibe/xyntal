-- Website-Konten direkt im Website-Admin sperren (befristet oder unbefristet).
-- Baut auf 20261103170000 auf: dieselben Spalten profiles.banned / banned_until. Eine
-- befristete Sperre endet von selbst, sobald banned_until erreicht ist – dafür prüfen alle
-- Regeln ab jetzt ban_active() statt nur die Spalte. Der App-Server schreibt die Spalten
-- weiterhin per Service Role, wenn in der App gesperrt wird.
begin;

create or replace function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;
revoke execute on function public.ban_active(boolean, timestamptz) from public;
grant execute on function public.ban_active(boolean, timestamptz) to anon, authenticated;

-- Admin: sperren / entsperren. Admins lassen sich nicht sperren, sich selbst auch nicht.
create or replace function public.admin_set_ban(p_id uuid, p_banned boolean, p_until timestamptz default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_target_admin boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if p_id = auth.uid() then
    raise exception 'Du kannst dich nicht selbst sperren.' using errcode = '22023';
  end if;
  select is_admin into v_target_admin from public.profiles where id = p_id;
  if v_target_admin is null then
    raise exception 'Mitglied nicht gefunden.' using errcode = 'P0002';
  end if;
  if v_target_admin and coalesce(p_banned, false) then
    raise exception 'Admins lassen sich nicht sperren.' using errcode = '22023';
  end if;
  if coalesce(p_banned, false) and p_until is not null and p_until <= now() then
    raise exception 'Das Ende der Sperre muss in der Zukunft liegen.' using errcode = '22023';
  end if;
  update public.profiles
     set banned = coalesce(p_banned, false),
         banned_until = case when coalesce(p_banned, false) then p_until else null end
   where id = p_id;
end;
$$;
revoke execute on function public.admin_set_ban(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.admin_set_ban(uuid, boolean, timestamptz) to authenticated;

-- Regeln aus 20261103170000, jetzt mit Ablauf der Sperre.
drop policy if exists "Eigenes Profil bearbeiten" on public.profiles;
create policy "Eigenes Profil bearbeiten" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and not public.ban_active(banned, banned_until))
  with check (id = (select auth.uid()) and not public.ban_active(banned, banned_until));

drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (
    id = (select auth.uid())
    or (not public.ban_active(banned, banned_until) and status = 'approved' and (is_public or (select public.is_approved_member())))
    or (select public.is_admin())
  );
drop policy if exists "Profile lesen (angemeldet)" on public.profiles;
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (not public.ban_active(banned, banned_until) and status <> 'rejected' and (select public.is_active_member()));

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until)
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) and not public.beta_application_required();
$$;
revoke execute on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

create or replace function public.block_banned_card_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid()
     and (select public.ban_active(banned, banned_until) from public.profiles where id = auth.uid()) then
    raise exception 'Dein Konto ist gesperrt. Solange die Sperre läuft, kannst du nichts ändern.' using errcode = '42501';
  end if;
  return new;
end;
$$;

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
  where c.is_public and c.handle is not null and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

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

notify pgrst, 'reload schema';
commit;
