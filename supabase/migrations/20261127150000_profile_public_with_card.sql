-- Alle Profile sind öffentlich, sobald die Karte steht.
-- 1) profiles.is_public ist immer true (Standard + einmal nachziehen). Den Haken im Profil gibt es nicht mehr.
-- 2) Wer eine öffentliche Karte hat (waitlist_cards.is_public – setzt der Trigger member_cards_public()
--    bei Wunsch-Link, nicht gesperrt, Altersnachweis), dessen Profil darf jede:r lesen, auch ohne
--    Freischaltung ('approved'). Gesperrte und abgelehnte Profile bleiben verborgen.
-- Nach 20261127120000_unbestaetigte_konten.sql; darf mehrfach laufen.
begin;

alter table public.profiles alter column is_public set default true;
update public.profiles set is_public = true where not is_public;

-- Ohne RLS-Schleife: security definer liest waitlist_cards direkt.
create or replace function public.has_public_card(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.waitlist_cards c
                  where c.user_id = p_id and c.is_public and c.handle is not null);
$$;
revoke execute on function public.has_public_card(uuid) from public;
grant execute on function public.has_public_card(uuid) to anon, authenticated;

drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (
    id = (select auth.uid())
    or (not public.ban_active(banned, banned_until) and status = 'approved' and (is_public or (select public.is_approved_member())))
    or (not public.ban_active(banned, banned_until) and status <> 'rejected' and public.has_public_card(id))
    or (select public.is_admin())
  );

notify pgrst, 'reload schema';
commit;
