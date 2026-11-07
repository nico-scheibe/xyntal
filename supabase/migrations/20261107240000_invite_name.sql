-- Einladungsseite xyntal.de/<name>/invite: Gäste sehen get_public_card ohne user_id (nur eingeloggt gesetzt),
-- die Seite kann so nicht erkennen, ob hinter dem Link ein Konto steht. get_invite_name liefert nur den Namen,
-- und nur, wenn der Wunsch-Link einem Konto gehört, das nicht gesperrt ist (genau das prüft claim_referral später).
-- Nach 20261107220000_member_invites.sql; Im Supabase SQL Editor ausführen.
create or replace function public.get_invite_name(p_handle text)
returns text language sql stable security definer set search_path = '' as $$
  select c.name
    from public.waitlist_cards c join public.profiles p on p.id = c.user_id
   where c.handle = lower(trim(coalesce(p_handle, ''))) and c.user_id is not null
     and not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.get_invite_name(text) from public;
grant execute on function public.get_invite_name(text) to anon, authenticated;
notify pgrst, 'reload schema';
