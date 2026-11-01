-- Beta-Bewerbungen nur noch mit eingeloggtem Konto und bestätigter E-Mail.
-- Die E-Mail kommt aus dem Konto, nicht aus dem Formular. Alte Bewerbungen ohne Konto bleiben erhalten.
begin;

alter table public.beta_applications
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create unique index if not exists beta_applications_user_idx on public.beta_applications (user_id);

-- Signatur bleibt gleich, damit ältere Seiten-Versionen nicht brechen; p_email wird ignoriert.
create or replace function public.apply_for_beta(
  p_name text, p_email text, p_focus text, p_project text, p_why text, p_hours text, p_link text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_link text := trim(coalesce(p_link, ''));
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Bitte melde dich an, um dich für die Beta zu bewerben.' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users
   where id = auth.uid() and email is not null and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Bitte bestätige zuerst deine E-Mail-Adresse.' using errcode = '42501';
  end if;
  -- Grober Schutz gegen Massen-Einsendungen
  if (select count(*) from public.beta_applications where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Gerade kommen sehr viele Bewerbungen an. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  if v_link <> '' and v_link !~* '^https?://' then
    v_link := 'https://' || v_link;
  end if;
  -- Pro Konto und pro E-Mail zählt die erste Bewerbung
  insert into public.beta_applications (name, email, focus, project, why, hours, link, user_id)
  values (trim(p_name), v_email, p_focus, trim(coalesce(p_project, '')), trim(p_why), p_hours, v_link, auth.uid())
  on conflict do nothing;
end;
$$;
revoke execute on function public.apply_for_beta(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.apply_for_beta(text, text, text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
