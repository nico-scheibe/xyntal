-- Altersprüfung ab 16: Ein Konto darf entstehen, aber das PROFIL bleibt zurückgehalten, bis ein
-- gültiges Geburtsdatum vorliegt (Mindestalter 16, taggenau). Keine Sperre der Anmeldung:
-- Apple- und Google-Anmeldungen liefern kein Geburtsdatum.
--
-- Warum eine eigene Tabelle und keine Spalte an public.profiles:
--   schema.sql gibt anon und authenticated das SELECT auf die ganze Tabelle profiles. Eine Spalte
--   „birthdate“ dort wäre öffentlich lesbar. Ein Spaltenentzug würde außerdem jedes select * und
--   jedes update(...).select() auf profiles brechen (Anmeldung, Profil, Avatar, Karte).
--   public.member_birthdates hat für anon/authenticated keine Rechte und keine Policy. Gelesen wird
--   das Datum nur in Funktionen, die es nie herausgeben.
--
-- Bestandsschutz: Die neue Bedingung sitzt in profile_review_problem. Diese Funktion wird nur für
--   Profile im Status „pending“ ausgewertet (Trigger auto_approve_profile, recheck_*-Trigger,
--   admin_profile_review_problems). Ein „approved“ Profil wird dadurch nie zurückgestuft, egal ob es
--   ein Geburtsdatum hat. Wartende Bestandsprofile ohne Datum bleiben wartend, bis sie es nachtragen.
--
-- Einmal im Supabase SQL Editor ausführen (nach 20261105120000_auto_approve_without_content_filter.sql).
-- Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- ---------- Geburtsdatum (nur für die Altersprüfung, nie öffentlich) ----------
create table if not exists public.member_birthdates (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birthdate  date not null,
  set_at     timestamptz not null default now()
);
alter table public.member_birthdates enable row level security;
revoke all on public.member_birthdates from anon, authenticated;
-- Absichtlich ohne Policy: Mitglieder setzen das Datum über set_my_birthdate(), lesen können sie es nicht.

-- Text (JJJJ-MM-TT) → Datum. Null bei leer, falschem Format, nicht existierendem Datum
-- (z. B. 30. Februar) oder vor 1900.
create or replace function public.birthdate_from_text(t text)
returns date language plpgsql immutable set search_path = '' as $$
declare
  d date;
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  d := t::date;
  if d < date '1900-01-01' then return null; end if;
  return d;
exception when others then
  return null;
end;
$$;
revoke execute on function public.birthdate_from_text(text) from public, anon, authenticated;

-- ---------- Die Standard-Prüfung: um den Grund „birthdate“ erweitert ----------
-- Grundlage: 20261105120000_auto_approve_without_content_filter.sql. Neu ist nur die Altersbedingung.
create or replace function public.profile_review_problem(p public.profiles)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  found_problem text;
begin
  if char_length(btrim(p.name)) < 2 then return 'name'; end if;
  if char_length(btrim(p.headline)) < 10 then return 'headline'; end if;
  if not exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
     and not exists (select 1 from auth.identities i where i.user_id = p.id and i.provider <> 'email') then
    return 'email';
  end if;
  if p.banned and (p.banned_until is null or p.banned_until > now()) then return 'banned'; end if;
  -- Geburtsdatum: vorhanden und taggenau ab 16 (am 16. Geburtstag ist man 16).
  if not exists (select 1 from public.member_birthdates b
                  where b.id = p.id and b.birthdate <= (current_date - interval '16 years')::date) then
    return 'birthdate';
  end if;
  -- Schutzfilter nur, wenn 20261028150000_content_safety.sql ausgeführt ist.
  if to_regprocedure('public.content_problem(text)') is not null then
    execute 'select public.content_problem($1)' into found_problem
      using concat_ws(' ', p.name, p.headline, p.about, p.category, p.offer, p.seek,
                      p.linkedin, p.instagram, p.website);
    if found_problem is not null then return 'content'; end if;
  end if;
  return null;
end;
$$;
revoke execute on function public.profile_review_problem(public.profiles) from public, anon, authenticated;

-- ---------- Geburtsdatum setzen (Mitglied, nur einmal) ----------
create or replace function public.set_my_birthdate(p_birthdate text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  b date := public.birthdate_from_text(p_birthdate);
begin
  if uid is null then raise exception 'Bitte melde dich an.'; end if;
  if b is null then raise exception 'Bitte gib ein gültiges Geburtsdatum an.'; end if;
  if b > current_date then raise exception 'Das Geburtsdatum liegt in der Zukunft.'; end if;
  if b > (current_date - interval '16 years')::date then
    raise exception 'Xyntal ist ab 16 Jahren. Sobald du 16 wirst, bist du herzlich willkommen.';
  end if;
  -- Einmal gesetzt, bleibt es: ein zweiter Versuch scheitert am Primärschlüssel.
  insert into public.member_birthdates (id, birthdate) values (uid, b) on conflict (id) do nothing;
  if not found then
    raise exception 'Dein Geburtsdatum ist schon eingetragen und lässt sich nicht mehr ändern.';
  end if;
  -- Wartete das Profil nur noch auf das Datum, wird es jetzt freigeschaltet.
  update public.profiles set status = status where id = uid and status = 'pending';
end;
$$;
revoke execute on function public.set_my_birthdate(text) from public, anon;
grant execute on function public.set_my_birthdate(text) to authenticated;

-- ---------- Neues Konto: Geburtsdatum aus der Anmeldung übernehmen ----------
-- Grundlage: handle_new_user() aus supabase/schema.sql. Neu ist nur der Teil mit dem Geburtsdatum.
-- Ein ungültiges oder zu junges Datum wird still ignoriert, die Anmeldung scheitert nie daran.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date := public.birthdate_from_text(d->>'birthdate');
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

  -- Gültig und ab 16: übernehmen und das Profil gleich erneut prüfen.
  -- Sonst wartet das Profil, bis set_my_birthdate() das Datum bekommt.
  if bd is not null and bd <= (current_date - interval '16 years')::date then
    insert into public.member_birthdates (id, birthdate) values (new.id, bd) on conflict (id) do nothing;
    update public.profiles set status = status where id = new.id and status = 'pending';
  end if;

  if coalesce((d->>'newsletter')::boolean, false) then
    insert into public.newsletter (email) values (lower(new.email)) on conflict (email) do nothing;
  end if;

  return new;
end;
$$;

commit;
