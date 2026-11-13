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

-- ---------- Geburtsdatum berichtigen (nur Admin) ----------
-- Mitglieder können ihr Datum nicht selbst ändern, sonst wäre die Altersgrenze wertlos.
-- Ein Tippfehler darf aber niemanden dauerhaft aussperren, und Art. 16 DSGVO gibt ein Recht
-- auf Berichtigung. Deshalb dieser Weg – mit Admin-Prüfung und einer Zeile im Protokoll.
create or replace function public.admin_set_birthdate(p_id uuid, p_birthdate text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b date := public.birthdate_from_text(p_birthdate);
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if b is null then raise exception 'Bitte gib ein gültiges Geburtsdatum an (JJJJ-MM-TT).'; end if;
  if b > current_date then raise exception 'Das Geburtsdatum liegt in der Zukunft.'; end if;
  insert into public.member_birthdates (id, birthdate) values (p_id, b)
    on conflict (id) do update set birthdate = excluded.birthdate, set_at = now();
  -- Absichtlich OHNE die Datumswerte: das Postgres-Log ist unverschlüsselt, langlebig und wird
  -- beim Löschen eines Kontos nicht mitgelöscht. Dass berichtigt wurde, genügt; worauf, steht
  -- in member_birthdates.
  raise log 'admin_set_birthdate: Geburtsdatum von % berichtigt durch %', p_id, auth.uid();
  -- Wartet das Profil nur noch auf das Datum, wird es jetzt geprüft.
  update public.profiles set status = status where id = p_id and status = 'pending';
end;
$$;
revoke execute on function public.admin_set_birthdate(uuid, text) from public, anon;
grant execute on function public.admin_set_birthdate(uuid, text) to authenticated;

-- ---------- Neues Konto: Geburtsdatum aus der Anmeldung übernehmen ----------
-- Grundlage: handle_new_user() aus supabase/007_newsletter_double_opt_in.sql – die neueste Fassung.
-- NICHT aus schema.sql: dort trägt der Trigger die E-Mail noch ohne bestätigte Einwilligung in
-- public.newsletter ein, was 007 bewusst abgeschafft hat (Newsletter läuft nur über Brevo
-- Double-Opt-in). Und der Name kommt aus 002 auch aus "full_name", wie Apple, Google und LinkedIn
-- ihn liefern. Beides muss hier erhalten bleiben, sonst macht diese Migration es rückgängig.
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

  -- Gültig und ab 16: übernehmen und das Profil gleich erneut prüfen.
  -- Sonst wartet das Profil, bis set_my_birthdate() das Datum bekommt.
  if bd is not null and bd <= (current_date - interval '16 years')::date then
    insert into public.member_birthdates (id, birthdate) values (new.id, bd) on conflict (id) do nothing;
    update public.profiles set status = status where id = new.id and status = 'pending';
  end if;

  -- Kein Newsletter-Eintrag hier: seit 007 läuft jede Einwilligung über Brevo Double-Opt-in.

  -- Das Geburtsdatum kam als Anmelde-Metadatum herein. Supabase legt raw_user_meta_data als
  -- user_metadata in JEDES Access-Token – und das Token liegt als JS-lesbares Cookie für
  -- .xyntal.de. Das Geburtsdatum gehört nicht dorthin, es steht jetzt in member_birthdates.
  -- Deshalb hier entfernen, sobald es übernommen ist. Der Wert dort wäre ohnehin wertlos,
  -- weil Mitglieder user_metadata über auth.updateUser() selbst überschreiben können.
  -- Bewusst mit Auffangnetz: Das ist der einzige Schreibzugriff dieses Triggers auf auth.users.
  -- Fehlt dem Eigentümer der Funktion dort das Schreibrecht, würde sonst JEDE Registrierung
  -- scheitern – auch die ohne Geburtsdatum. Das Datum steht dann weiter in den Metadaten,
  -- aber niemand wird ausgesperrt. Das ist die richtige Reihenfolge der Übel.
  if d ? 'birthdate' then
    begin
      update auth.users set raw_user_meta_data = raw_user_meta_data - 'birthdate' where id = new.id;
    exception when others then null;
    end;
  end if;

  return new;
end;
$$;

commit;
