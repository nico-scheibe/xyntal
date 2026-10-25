-- Admin-Aktionen: Einladungen als gutgeschrieben markieren (1 Woche gratis, sobald es Abos gibt).
-- Einmal im Supabase SQL Editor ausführen (nach 013). Läuft als Transaktion.
begin;

alter table public.waitlist_referrals add column if not exists credited_at timestamptz;

drop policy if exists "Einladungen gutschreiben (Admins)" on public.waitlist_referrals;
create policy "Einladungen gutschreiben (Admins)" on public.waitlist_referrals
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
-- Admins dürfen nur den Gutschrift-Zeitpunkt ändern, nicht Code oder Adresse
revoke update on public.waitlist_referrals from authenticated;
grant update (credited_at) on public.waitlist_referrals to authenticated;

commit;
