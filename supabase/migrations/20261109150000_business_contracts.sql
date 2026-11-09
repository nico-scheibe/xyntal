-- Firmenverträge: individuelle Verträge mit Firmenkunden, angelegt im Admin-Bereich
-- (xyntal.de/admin#contracts) und dort als PDF gedruckt.
-- Einmal im SQL Editor von db.xyntal.de ausführen (nach 20261109120000_security_hardening.sql).
-- Läuft als Transaktion und darf mehrfach laufen.
--
-- Nur Website-Admins (profiles.is_admin) lesen und schreiben; wer 2FA eingerichtet hat, braucht
-- wie überall den bestätigten Code (aal2). Die Vertragsnummer (XY-JJJJ-0001) vergibt die
-- Datenbank beim ersten Speichern, fortlaufend pro Jahr.
begin;

create table if not exists public.business_contracts (
  id          uuid primary key default gen_random_uuid(),
  number      text unique,
  status      text not null default 'entwurf'
              check (status in ('entwurf', 'verschickt', 'unterschrieben', 'gekuendigt')),
  company     text not null check (length(btrim(company)) between 1 and 200),
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 200000),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists business_contracts_updated_idx on public.business_contracts (updated_at desc);

-- Fortlaufende Nummer pro Jahr; ein Advisory-Lock verhindert doppelte Nummern bei gleichzeitigem Speichern.
create or replace function public.business_contract_defaults()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  yr  text := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
  nxt int;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('business_contracts_number'));
    select coalesce(max(substring(c.number from '^XY-' || yr || '-(\d+)$')::int), 0) + 1 into nxt
      from public.business_contracts c where c.number like 'XY-' || yr || '-%';
    new.number := 'XY-' || yr || '-' || lpad(nxt::text, 4, '0');
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.number := old.number;          -- Nummer und Ersteller bleiben fest
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists business_contract_defaults on public.business_contracts;
create trigger business_contract_defaults before insert or update on public.business_contracts
  for each row execute function public.business_contract_defaults();

alter table public.business_contracts enable row level security;

drop policy if exists "Admins verwalten Firmenverträge" on public.business_contracts;
create policy "Admins verwalten Firmenverträge" on public.business_contracts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "2FA erzwingen" on public.business_contracts;
create policy "2FA erzwingen" on public.business_contracts as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

revoke all on public.business_contracts from anon;
grant select, insert, update, delete on public.business_contracts to authenticated;

notify pgrst, 'reload schema';
commit;
