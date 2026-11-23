-- Xchange (Discord): Der Guard-Bot (Repo xyntal-guard) beantwortet den Befehl /xyntal-card
-- mit dem Link zur öffentlichen Xyntal-Karte des Mitglieds (xyntal.de/<handle>).
--
-- • Zuordnung wie xchange_plans (neueste Fassung, 20261122120000_xchange_app_links.sql):
--   Discord-Kennung → Konto über auth.identities (provider = 'discord', Anmeldung bzw.
--   Verknüpfung auf der Website) oder über public.xchange_app_links (Verknüpfung in der
--   Desktop-App). Hat eine Kennung beide, gilt die Verknüpfung der Website. Erst wird so das
--   Konto bestimmt, dann dessen Karte geprüft – es kommt also immer die Karte desselben
--   Kontos, das auch die Tarif-Rollen bekommt, und nie ersatzweise die eines anderen.
-- • xchange_card_handle(schlüssel, kennung): gibt nur den Wunsch-Link (handle) zurück, und
--   nur, wenn die Karte auch über get_member_cards() öffentlich zu sehen ist: Karte öffentlich
--   (is_public), handle vorhanden, Profil nicht abgelehnt (status <> 'rejected'), Konto nicht
--   gesperrt (ban_active). Bedingungen wörtlich aus get_member_cards in
--   20261108200000_restore_card_functions.sql (neueste Fassung).
-- • In allen anderen Fällen null – unbekannte Kennung, ungültige Kennung, keine Karte, Karte
--   ausgeblendet, abgelehnt oder gesperrt. Nie Name, E-Mail oder Xyntal-Kennung (user_id).
-- • Zugriff: derselbe Bot-Schlüssel wie bei xchange_plans (20261121120000_xchange_plans.sql),
--   geprüft über public.xchange_bot_keys. Falscher oder fehlender Schlüssel: Fehler 42501.
begin;

create or replace function public.xchange_card_handle(p_key text, p_discord_id text)
returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_handle text;
begin
  if p_key is null or length(p_key) < 32 or not exists (
    select 1 from public.xchange_bot_keys k
     where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'Kein Zugriff.' using errcode = '42501';
  end if;
  if p_discord_id is null or p_discord_id !~ '^\d{17,20}$' then
    return null;
  end if;
  -- Konto bestimmen: Website (rank 0) vor App (rank 1), bei Gleichstand fest nach user_id
  select x.uid into v_uid
    from (
      select p.id as uid, 0 as rank
        from auth.identities i
        join public.profiles p on p.id = i.user_id
       where i.provider = 'discord'
         and i.provider_id::text = p_discord_id
      union all
      select p.id, 1
        from public.xchange_app_links l
        join public.profiles p on p.id = l.profile_id
       where l.discord_id = p_discord_id
    ) x
   order by x.rank, x.uid
   limit 1;
  if v_uid is null then
    return null;
  end if;
  -- Karte dieses Kontos, nur wenn sie wie in get_member_cards öffentlich zu sehen ist
  select c.handle into v_handle
    from public.waitlist_cards c
    join public.profiles p on p.id = c.user_id
   where c.user_id = v_uid
     and c.is_public and c.handle is not null
     and p.status <> 'rejected'
     and not public.ban_active(p.banned, p.banned_until)
   order by c.handle
   limit 1;
  return v_handle;
end;
$$;
revoke execute on function public.xchange_card_handle(text, text) from public;
grant execute on function public.xchange_card_handle(text, text) to anon, authenticated;

commit;
