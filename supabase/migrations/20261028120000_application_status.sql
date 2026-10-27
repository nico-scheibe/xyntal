-- Bewerbungen annehmen oder ablehnen: ein Status je Bewerbung.
-- Ändern darf ihn nur, wem das Projekt gehört; Bewerber können ihn lesen, aber nicht setzen.
-- Einmal im Supabase SQL Editor ausführen (nach 009). Läuft als Transaktion. Darf mehrfach laufen.
begin;

alter table public.project_interest add column if not exists status text not null default 'offen';
alter table public.project_interest drop constraint if exists project_interest_status_check;
alter table public.project_interest add constraint project_interest_status_check
  check (status in ('offen', 'angenommen', 'abgelehnt'));

grant update (status) on public.project_interest to authenticated;

drop policy if exists "Bewerbung entscheiden" on public.project_interest;
create policy "Bewerbung entscheiden" on public.project_interest for update to authenticated
  using ((select public.owns_role(role_id)))
  with check ((select public.owns_role(role_id)));

commit;
