-- Gesperrte Konten (Bann aus dem App-Admin): nichts am Profil oder an der Karte ändern,
-- Karte und Profil sind währenddessen unsichtbar (nicht gelöscht), keine aktiven
-- Mitgliedsrechte (Projekte, Nachrichten, Kommentare). Der App-Server setzt banned /
-- banned_until mit dem Service-Role-Schlüssel, wenn ein Admin dort sperrt oder entsperrt.
begin;

alter table public.profiles
  add column if not exists banned boolean not null default false,
  add column if not exists banned_until timestamptz;

-- Nur der Service-Role-Schlüssel schreibt banned; Mitglieder können die Spalten nicht ändern
-- (grant update ist auf Inhaltsfelder begrenzt).

-- Profil: gesperrte Konten ändern nichts (auch kein Profilbild)
drop policy if exists "Eigenes Profil bearbeiten" on public.profiles;
create policy "Eigenes Profil bearbeiten" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and not banned)
  with check (id = (select auth.uid()) and not banned);

-- Andere sehen das Profil nicht, solange die Sperre läuft (das eigene Profil bleibt sichtbar)
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (
    id = (select auth.uid())
    or (not banned and status = 'approved' and (is_public or (select public.is_approved_member())))
    or (select public.is_admin())
  );
drop policy if exists "Profile lesen (angemeldet)" on public.profiles;
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (not banned and status <> 'rejected' and (select public.is_active_member()));

-- Gesperrt = kein aktives Mitglied (Projekte, Nachrichten, Kommentare, Beiträge)
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected' and not p.banned
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) and not public.beta_application_required();
$$;
revoke execute on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

-- Karte: gesperrte Konten speichern nichts. Greift auch in save_my_card (security definer),
-- weil auth.uid() dort der Aufrufer bleibt; der App-Server (Service Role, auth.uid() null) ist frei.
create or replace function public.block_banned_card_writes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and new.user_id = auth.uid()
     and coalesce((select banned from public.profiles where id = auth.uid()), false) then
    raise exception 'Dein Konto ist gesperrt. Solange die Sperre läuft, kannst du nichts ändern.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.block_banned_card_writes() from public, anon, authenticated;
drop trigger if exists waitlist_cards_banned_guard on public.waitlist_cards;
create trigger waitlist_cards_banned_guard before insert or update on public.waitlist_cards
  for each row execute function public.block_banned_card_writes();

-- Karten gesperrter Konten verschwinden aus der Mitgliederliste und von xyntal.de/<handle>,
-- bleiben aber gespeichert und kommen nach der Sperre unverändert zurück.
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
  where c.is_public and c.handle is not null and p.status <> 'rejected' and not p.banned;
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

create or replace function public.get_public_card(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when c.id is null then null
    when not c.is_public or coalesce(p.banned, false) then jsonb_build_object('handle', c.handle, 'reserved', true)
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
