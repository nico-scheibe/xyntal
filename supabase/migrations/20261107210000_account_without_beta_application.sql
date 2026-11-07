-- Konto anlegen ohne Beta-Bewerbung (Login-Panel, /login#registrieren).
-- Hebt die Pflicht aus 20261103160000_account_requires_beta_application.sql auf:
-- beta_application_required() liefert immer false. Damit schickt die Website neue Konten
-- nicht mehr auf /beta?pflicht=1, und is_active_member() verlangt keine Bewerbung mehr
-- (bestätigte E-Mail und nicht abgelehnt reichen wieder, wie in 018).
-- Die Beta-Bewerbung selbst (/beta, apply_for_beta, Admin) bleibt unverändert.
-- Zurück: 20261103160000_account_requires_beta_application.sql erneut ausführen.
begin;

create or replace function public.beta_application_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;
revoke execute on function public.beta_application_required() from public;
grant execute on function public.beta_application_required() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
