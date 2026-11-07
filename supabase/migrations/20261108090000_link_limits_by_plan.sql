-- Links auf xyntal.de/name: Grenze je Tarif statt „15 frei, 100 mit Paid“.
-- Free 5 · Plus 25 · Pro 50 · Ultra 100 · Enterprise 250 · Admins 1000.
-- Tarifnamen wie banner_video_limit_bytes (profiles.plan, vom App-Server gespiegelt).
-- Wer schon mehr Links hat, behält sie: die Grenze ist nie kleiner als die aktuelle Anzahl,
-- neue Links kommen dann erst wieder unter der Grenze dazu.
-- Dieselbe Tabelle steht in public/link-editor.js (TIERS). Nach 20261107250000_link_page.sql.
begin;

create or replace function public.link_limit(p_user uuid)
returns int language sql stable security definer set search_path = '' as $$
  select greatest(
    case
      when coalesce(p.is_admin, false) then 1000
      when p.plan in ('Enterprise', 'Enterprise+', 'Works', 'Works Custom') then 250
      when p.plan in ('Ultra', 'Foundry', 'Ascend') then 100
      when p.plan in ('Pro', 'Crew', 'Nexus') then 50
      when p.plan in ('Plus', 'Forge', 'Pulse') then 25
      when coalesce(p.is_premium, false) then 25
      else 5
    end,
    (select count(*)::int from public.profile_links l where l.user_id = p_user)
  )
  from public.profiles p where p.id = p_user;
$$;
revoke execute on function public.link_limit(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
