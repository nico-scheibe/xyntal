-- Xchange (Discord): Auch wer Discord in der Desktop-App verknüpft (Einstellungen →
-- Verbindungen), bekommt auf dem Xchange-Server die Rollen seines Tarifs.
--
-- • Bisher kannte xchange_plans (Migration 20261121120000) nur die Discord-Anmeldung
--   der Website (auth.identities). Die App speichert ihre Discord-Verknüpfung in der
--   eigenen Datenbank (account_links) und spiegelt sie jetzt hierher: je Website-Konto
--   höchstens eine Discord-Kennung (App-Server, server/src/supabase/discordLinkSync.ts,
--   mit dem Service-Role-Schlüssel, alle paar Minuten und gleich nach jeder Änderung).
-- • xchange_plans liest beide Quellen. Hat eine Discord-Kennung beide, gilt die
--   Verknüpfung der Website.
-- • Niemand außer dem Service-Role-Schlüssel liest oder schreibt die Tabelle; der Bot
--   sieht weiterhin nur Kennung → Tarif.
begin;

create table if not exists public.xchange_app_links (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  discord_id text not null unique check (discord_id ~ '^[0-9]{5,25}$'),
  updated_at timestamptz not null default now()
);
alter table public.xchange_app_links enable row level security;
revoke all on public.xchange_app_links from public, anon, authenticated;

create or replace function public.xchange_plans(p_key text, p_discord_ids text[])
returns table (discord_id text, plan text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 32 or not exists (
    select 1 from public.xchange_bot_keys k
     where k.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex')
  ) then
    raise exception 'Kein Zugriff.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_discord_ids, 1), 0) > 500 then
    raise exception 'Höchstens 500 Kennungen je Abfrage.' using errcode = '22023';
  end if;
  return query
    select distinct on (x.did) x.did, x.pl
      from (
        select i.provider_id::text as did, p.plan as pl, 0 as rank
          from auth.identities i
          join public.profiles p on p.id = i.user_id
         where i.provider = 'discord'
           and i.provider_id::text = any (p_discord_ids)
        union all
        select l.discord_id, p.plan, 1
          from public.xchange_app_links l
          join public.profiles p on p.id = l.profile_id
         where l.discord_id = any (p_discord_ids)
      ) x
     order by x.did, x.rank;
end;
$$;
revoke execute on function public.xchange_plans(text, text[]) from public;
grant execute on function public.xchange_plans(text, text[]) to anon, authenticated;

commit;
