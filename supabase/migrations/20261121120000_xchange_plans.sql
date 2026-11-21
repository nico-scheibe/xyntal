-- Xchange (Discord): Der Guard-Bot (Repo xyntal-guard) fragt ab, welchen Tarif die
-- Mitglieder des Discord-Servers haben, und vergibt danach die Rollen „Builder“ (ab Plus)
-- und „Founder Lounge“ (ab Pro).
--
-- • Zuordnung: auth.identities (provider = 'discord', provider_id = Discord-Kennung) →
--   profiles.plan. Erkannt wird also, wer sich bei Xyntal über Discord anmeldet oder
--   Discord mit seinem Konto verknüpft hat.
-- • xchange_plans(schlüssel, kennungen[]): gibt je bekannter Discord-Kennung den Tarif
--   zurück – sonst nichts (kein Name, keine E-Mail, keine Xyntal-Kennung). Unbekannte
--   Kennungen fehlen in der Antwort.
-- • Zugriff: Der Bot bekommt keinen Service-Role-Schlüssel, sondern einen eigenen
--   Schlüssel, der nur diese Abfrage öffnet. Hier liegt nur sein SHA-256-Wert.
--   Schlüssel anlegen (einmalig, im SQL-Editor; den Schlüssel selbst nur in die .env
--   des Bots als XCHANGE_SYNC_KEY):
--     insert into public.xchange_bot_keys (key_hash, label)
--     values (encode(sha256(convert_to('<mindestens 32 zufällige Zeichen>', 'UTF8')), 'hex'), 'guard');
--   Schlüssel sperren: die Zeile löschen.
begin;

create table if not exists public.xchange_bot_keys (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  label text not null default '',
  created_at timestamptz not null default now()
);
alter table public.xchange_bot_keys enable row level security;
revoke all on public.xchange_bot_keys from public, anon, authenticated;

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
    select i.provider_id::text, p.plan
      from auth.identities i
      join public.profiles p on p.id = i.user_id
     where i.provider = 'discord'
       and i.provider_id::text = any (p_discord_ids);
end;
$$;
revoke execute on function public.xchange_plans(text, text[]) from public;
grant execute on function public.xchange_plans(text, text[]) to anon, authenticated;

commit;
