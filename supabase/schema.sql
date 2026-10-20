-- =====================================================================
-- Xyntal – Datenbank für Supabase
--
-- Einmal komplett im Supabase-Dashboard ausführen:
--   SQL Editor → New query → diesen Inhalt einfügen → Run
--
-- Legt an:
--   profiles       Mitgliederprofile (1:1 zu den Supabase-Konten)
--   newsletter     Newsletter-Adressen
--   event_signups  Anmeldungen zum nächsten Treffen
--   next_event     Datum/Ort des nächsten Treffens (eine Zeile)
-- plus Zugriffsregeln (Row Level Security) und Admin-Funktionen.
-- =====================================================================


-- ---------- Profile ----------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default ''  check (char_length(name) <= 80),
  headline    text not null default ''  check (char_length(headline) <= 120),
  about       text not null default ''  check (char_length(about) <= 1500),
  phase       text check (phase in ('idee', 'nebenberuflich', 'vollzeit', 'team')),
  category    text not null default ''  check (char_length(category) <= 60),
  offer       text not null default ''  check (char_length(offer) <= 600),
  seek        text not null default ''  check (char_length(seek) <= 600),
  -- Links nur mit http(s), damit niemand Script-Links einschleusen kann
  linkedin    text not null default ''  check (linkedin  = '' or (linkedin  ~* '^https?://' and char_length(linkedin)  <= 200)),
  instagram   text not null default ''  check (instagram = '' or (instagram ~* '^https?://' and char_length(instagram) <= 200)),
  website     text not null default ''  check (website   = '' or (website   ~* '^https?://' and char_length(website)   <= 200)),
  is_public   boolean not null default false,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);


-- ---------- Newsletter ----------

create table public.newsletter (
  id          bigint generated always as identity primary key,
  email       text not null unique check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  created_at  timestamptz not null default now()
);


-- ---------- Anmeldungen zu Treffen ----------

create table public.event_signups (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 1 and 80),
  email       text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 160),
  project     text not null check (char_length(project) between 1 and 1000),
  created_at  timestamptz not null default now()
);


-- ---------- Nächstes Treffen (genau eine Zeile) ----------

create table public.next_event (
  id          int primary key default 1 check (id = 1),
  date_text   text not null default '' check (char_length(date_text) <= 60),
  time_text   text not null default '' check (char_length(time_text) <= 40),
  place       text not null default '' check (char_length(place) <= 120),
  address     text not null default '' check (char_length(address) <= 160),
  updated_at  timestamptz not null default now()
);
insert into public.next_event (id) values (1);


-- =====================================================================
-- Hilfsfunktionen
-- =====================================================================

-- Link normalisieren: "linkedin.com/in/x" -> "https://linkedin.com/in/x"
create function public.normalize_url(u text)
returns text language sql immutable set search_path = '' as $$
  select case
    when coalesce(trim(u), '') = '' then ''
    when trim(u) ~* '^https?://' then left(trim(u), 200)
    else left('https://' || trim(u), 200)
  end;
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create function public.is_approved_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;


-- Neues Konto -> Profil automatisch anlegen.
-- Die Profildaten kommen aus signUp({ options: { data: { ... } } }).
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, name, headline, about, phase, category, offer, seek,
                               linkedin, instagram, website, is_public)
  values (
    new.id,
    left(coalesce(d->>'name', ''), 80),
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

  if coalesce((d->>'newsletter')::boolean, false) then
    insert into public.newsletter (email) values (lower(new.email)) on conflict (email) do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =====================================================================
-- Zugriffsrechte & Row Level Security
-- =====================================================================

alter table public.profiles      enable row level security;
alter table public.newsletter    enable row level security;
alter table public.event_signups enable row level security;
alter table public.next_event    enable row level security;

-- Grundrechte zurücksetzen, dann gezielt erlauben
revoke all on public.profiles, public.newsletter, public.event_signups, public.next_event from anon, authenticated;

-- Profile: lesen ja; ändern nur die eigenen Inhaltsfelder (nicht status / is_admin)
grant select on public.profiles to anon, authenticated;
grant update (name, headline, about, phase, category, offer, seek, linkedin, instagram, website, is_public)
  on public.profiles to authenticated;

-- Sichtbar ist: das eigene Profil, freigeschaltete öffentliche Profile,
-- für freigeschaltete Mitglieder alle freigeschalteten Profile, für Admins alles.
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (
    id = (select auth.uid())
    or (status = 'approved' and (is_public or (select public.is_approved_member())))
    or (select public.is_admin())
  );

create policy "Eigenes Profil bearbeiten" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Anmeldungen: jeder darf sich anmelden, nur Admins lesen
grant insert on public.event_signups to anon, authenticated;
grant select on public.event_signups to authenticated;

create policy "Zum Treffen anmelden" on public.event_signups
  for insert to anon, authenticated with check (true);

create policy "Admins sehen Anmeldungen" on public.event_signups
  for select to authenticated using ((select public.is_admin()));

-- Newsletter: Eintragen nur über die Funktion unten, lesen nur Admins
grant select on public.newsletter to authenticated;

create policy "Admins sehen Newsletter" on public.newsletter
  for select to authenticated using ((select public.is_admin()));

-- Nächstes Treffen: alle lesen, Admins ändern
grant select on public.next_event to anon, authenticated;
grant update (date_text, time_text, place, address, updated_at) on public.next_event to authenticated;

create policy "Treffen lesen" on public.next_event
  for select to anon, authenticated using (true);

create policy "Admins ändern Treffen" on public.next_event
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));


-- =====================================================================
-- Funktionen, die die Website aufruft (supabase.rpc(...))
-- =====================================================================

-- Newsletter eintragen (doppelte Adressen werden still ignoriert)
create function public.subscribe_newsletter(p_email text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_email is null or lower(trim(p_email)) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Bitte gib eine gültige E-Mail-Adresse an.';
  end if;
  insert into public.newsletter (email) values (lower(trim(p_email))) on conflict (email) do nothing;
end;
$$;

-- Eigenes Konto komplett löschen (Profil wird mitgelöscht)
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  delete from public.newsletter where email = lower(v_email);
  delete from auth.users where id = auth.uid();
end;
$$;

-- Admin: alle Mitglieder inkl. E-Mail-Adresse
create function public.admin_members()
returns table (
  id uuid, email text, name text, headline text, about text, phase text, category text,
  offer text, seek text, linkedin text, instagram text, website text,
  is_public boolean, status text, is_admin boolean, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  return query
    select p.id, u.email::text, p.name, p.headline, p.about, p.phase, p.category,
           p.offer, p.seek, p.linkedin, p.instagram, p.website,
           p.is_public, p.status, p.is_admin, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by (p.status = 'pending') desc, p.created_at desc;
end;
$$;

-- Admin: Mitglied freischalten / ablehnen
create function public.admin_set_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  if p_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Ungültiger Status.';
  end if;
  update public.profiles set status = p_status where id = p_id;
  if not found then
    raise exception 'Mitglied nicht gefunden.';
  end if;
end;
$$;

-- Admin: Mitglied endgültig löschen
create function public.admin_delete_member(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Du kannst dich hier nicht selbst löschen.';
  end if;
  delete from auth.users where id = p_id;
end;
$$;

-- Ausführungsrechte: standardmäßig darf jeder alles aufrufen – das schränken wir ein
revoke execute on function
  public.normalize_url(text), public.is_admin(), public.is_approved_member(),
  public.subscribe_newsletter(text), public.delete_my_account(), public.admin_members(),
  public.admin_set_status(uuid, text), public.admin_delete_member(uuid)
from public, anon, authenticated;

grant execute on function public.is_admin(), public.is_approved_member() to anon, authenticated;
grant execute on function public.subscribe_newsletter(text) to anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_members(), public.admin_set_status(uuid, text), public.admin_delete_member(uuid)
  to authenticated;
