-- Admins haben immer die Paid-Extras der Karte (animierte Banner, eigenes Banner-Bild,
-- animiertes Profilbild). Nach 20261107120000_card_banners_premium.sql ausführen.
--
-- Ein Trigger hält profiles.is_premium bei Admins auf true – auch wenn der App-Server
-- beim Tarif-Abgleich false schreiben würde. Wird jemandem der Admin-Status entzogen,
-- bleibt is_premium stehen, bis der nächste Abgleich (Tarif in der App) oder ein Admin
-- es ändert.
begin;

create or replace function public.keep_admin_premium()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_admin then new.is_premium := true; end if;
  return new;
end;
$$;
drop trigger if exists keep_admin_premium on public.profiles;
create trigger keep_admin_premium before insert or update of is_admin, is_premium on public.profiles
  for each row execute function public.keep_admin_premium();

update public.profiles set is_premium = true where is_admin and not is_premium;

commit;
