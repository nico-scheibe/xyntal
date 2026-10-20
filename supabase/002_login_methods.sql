-- =====================================================================
-- Xyntal – Anmeldung mit Google, Apple, LinkedIn und Telefonnummer
-- (nach schema.sql einmal im SQL Editor ausführen)
--
-- 1. Neue Konten übernehmen den Namen auch aus Google/Apple/LinkedIn
--    (dort heißt das Feld "full_name" statt "name").
-- 2. Der Admin-Bereich zeigt zusätzlich die Telefonnummer und
--    womit sich jemand angemeldet hat.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, name, headline, about, phase, category, offer, seek,
                               linkedin, instagram, website, is_public)
  values (
    new.id,
    left(coalesce(nullif(d->>'name', ''), nullif(d->>'full_name', ''), ''), 80),
    left(coalesce(d->>'headline', ''), 120),
    left(coalesce(d->>'about', ''), 1500),
    case when d->>'phase' in ('idee', 'nebenberuflich', 'vollzeit', 'team') then d->>'phase' end,
    left(coalesce(d->>'category', ''), 60),
    left(coalesce(d->>'offer', ''), 600),
    left(coalesce(d->>'seek', ''), 600),
    public.normalize_url(d->>'linkedin'),
    public.normalize_url(d->>'instagram'),
    public.normalize_url(d->>'website'),
    coalesce((d->>'is_public')::boolean, false)
  );

  if new.email is not null and coalesce((d->>'newsletter')::boolean, false) then
    insert into public.newsletter (email) values (lower(new.email)) on conflict (email) do nothing;
  end if;

  return new;
end;
$$;

-- Rückgabetyp ändert sich -> Funktion neu anlegen
drop function if exists public.admin_members();

create function public.admin_members()
returns table (
  id uuid, email text, phone text, provider text, name text, headline text, about text, phase text,
  category text, offer text, seek text, linkedin text, instagram text, website text,
  is_public boolean, status text, is_admin boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  return query
    select p.id, u.email::text, u.phone::text, (u.raw_app_meta_data->>'provider')::text,
           p.name, p.headline, p.about, p.phase, p.category,
           p.offer, p.seek, p.linkedin, p.instagram, p.website,
           p.is_public, p.status, p.is_admin, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by (p.status = 'pending') desc, p.created_at desc;
end;
$$;

revoke execute on function public.admin_members() from public, anon, authenticated;
grant execute on function public.admin_members() to authenticated;
