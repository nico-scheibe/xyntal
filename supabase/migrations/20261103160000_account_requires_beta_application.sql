-- Beta-Programm: Die Bewerbung ist Pflicht für jedes Konto.
-- Seit diesem Stand führt jeder Weg zu einem Konto über /beta (Konto und Bewerbung in einem Schritt).
-- Google, Apple, LinkedIn und SMS legen das Konto trotzdem vor der Bewerbung an. Solche Konten gelten
-- erst als aktiv (Projekte, Nachrichten, Kommentare), wenn die Bewerbung da ist; die Website schickt sie
-- bis dahin auf /beta. Konten von vor der Umstellung bleiben unberührt.
begin;

-- Fehlt diesem Konto die Pflicht-Bewerbung? Gäste: nein. Alte Bewerbungen ohne Konto zählen über die E-Mail.
create or replace function public.beta_application_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
     where u.id = auth.uid()
       and u.created_at >= timestamptz '2026-11-03 18:00:00+00'
       and not exists (
         select 1 from public.beta_applications b
          where b.user_id = u.id
             or (b.user_id is null and b.email = lower(trim(u.email)))
       )
  );
$$;
revoke execute on function public.beta_application_required() from public;
grant execute on function public.beta_application_required() to anon, authenticated;

-- Wer darf mitmachen? Wie in 018 (bestätigt, nicht abgelehnt), jetzt zusätzlich mit Bewerbung.
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected'
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) and not public.beta_application_required();
$$;
revoke execute on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

notify pgrst, 'reload schema';
commit;
