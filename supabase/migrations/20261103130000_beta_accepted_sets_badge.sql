-- Beta-Programm: Status „angenommen“ setzt den Beta-Tester-Badge am verknüpften Konto.
-- Geht der Status wieder von „angenommen“ weg, wird der Badge entfernt. Der Status ist damit die
-- Quelle für den Badge; von Hand vergebene Badges ohne Bewerbung bleiben unberührt.
begin;

create or replace function public.sync_beta_tester_badge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null then return new; end if;
  if new.status = 'angenommen' and (tg_op = 'INSERT' or old.status is distinct from 'angenommen' or old.user_id is distinct from new.user_id) then
    update public.profiles set is_beta_tester = true where id = new.user_id and not is_beta_tester;
  elsif tg_op = 'UPDATE' and old.status = 'angenommen' and new.status <> 'angenommen' then
    update public.profiles set is_beta_tester = false where id = new.user_id and is_beta_tester;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_beta_tester_badge() from public, anon, authenticated;

drop trigger if exists beta_application_badge on public.beta_applications;
create trigger beta_application_badge after insert or update of status, user_id on public.beta_applications
  for each row execute function public.sync_beta_tester_badge();

-- Bereits angenommene Bewerbungen mit Konto bekommen den Badge sofort
update public.profiles p set is_beta_tester = true
  from public.beta_applications b
 where b.user_id = p.id and b.status = 'angenommen' and not p.is_beta_tester;

commit;
