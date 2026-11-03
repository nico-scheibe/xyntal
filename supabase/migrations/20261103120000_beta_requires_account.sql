-- Beta-Programm: Bewerbung nur noch mit Xyntal-Konto.
-- Jede Bewerbung gehört zu einem Nutzer; Name und E-Mail kommen aus dem Konto, nicht mehr aus dem Formular.
-- Alte Bewerbungen ohne Konto bleiben erhalten (user_id leer) und werden beim nächsten Login über die E-Mail zugeordnet.
begin;

alter table public.beta_applications
  add column if not exists user_id uuid references auth.users (id) on delete set null;
create unique index if not exists beta_applications_user_idx on public.beta_applications (user_id) where user_id is not null;

-- Der alte Endpunkt ohne Konto verschwindet samt anonymem Zugriff
drop function if exists public.apply_for_beta(text, text, text, text, text, text, text);

-- Bewerbung einreichen (nur eingeloggt). Pro Konto zählt die erste Bewerbung.
create or replace function public.apply_for_beta(
  p_focus text, p_project text, p_why text, p_hours text, p_link text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
  v_link  text := trim(coalesce(p_link, ''));
begin
  if v_uid is null then
    raise exception 'Für die Bewerbung brauchst du ein Xyntal-Konto.' using errcode = '42501';
  end if;
  select lower(trim(u.email)), nullif(trim(p.name), '')
    into v_email, v_name
    from auth.users u left join public.profiles p on p.id = u.id
   where u.id = v_uid;
  if v_email is null then
    raise exception 'Dein Konto hat keine bestätigte E-Mail-Adresse.' using errcode = '42501';
  end if;
  -- Grober Schutz gegen Massen-Einsendungen
  if (select count(*) from public.beta_applications where created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Gerade kommen sehr viele Bewerbungen an. Bitte versuch es in ein paar Minuten noch einmal.';
  end if;
  if v_link <> '' and v_link !~* '^https?://' then
    v_link := 'https://' || v_link;
  end if;
  -- Eine frühere Bewerbung ohne Konto mit derselben E-Mail gehört jetzt diesem Konto
  update public.beta_applications set user_id = v_uid where email = v_email and user_id is null;
  if exists (select 1 from public.beta_applications where user_id = v_uid or email = v_email) then
    raise exception 'Du hast dich schon beworben – deine erste Bewerbung zählt.' using errcode = '23505';
  end if;
  insert into public.beta_applications (user_id, name, email, focus, project, why, hours, link)
  values (v_uid, coalesce(v_name, split_part(v_email, '@', 1)), v_email, p_focus, trim(coalesce(p_project, '')), trim(p_why), p_hours, v_link);
end;
$$;
revoke execute on function public.apply_for_beta(text, text, text, text, text) from public, anon;
grant execute on function public.apply_for_beta(text, text, text, text, text) to authenticated;

-- Eigene Bewerbung sehen: nur Stand und Datum, keine Admin-Notiz.
-- Ordnet eine alte Bewerbung ohne Konto beim ersten Aufruf dem Konto zu.
create or replace function public.get_my_beta_application()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_row   public.beta_applications%rowtype;
begin
  if v_uid is null then return null; end if;
  select lower(trim(email)) into v_email from auth.users where id = v_uid;
  update public.beta_applications set user_id = v_uid where email = v_email and user_id is null;
  select * into v_row from public.beta_applications where user_id = v_uid;
  if not found then return null; end if;
  return jsonb_build_object('status', v_row.status, 'created_at', v_row.created_at, 'focus', v_row.focus, 'hours', v_row.hours, 'project', v_row.project);
end;
$$;
revoke execute on function public.get_my_beta_application() from public, anon;
grant execute on function public.get_my_beta_application() to authenticated;

notify pgrst, 'reload schema';
commit;
