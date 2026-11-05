-- Fix für 20261105110000_auto_approve_profiles.sql: Die Standard-Prüfung rief
-- public.content_problem() fest auf. Wo 20261028150000_content_safety.sql (noch) nicht
-- ausgeführt ist, gibt es die Funktion nicht – dann schlug jedes Speichern eines
-- wartenden Profils fehl („function public.content_problem(text) does not exist“).
-- Jetzt prüft sie Texte nur, wenn der Schutzfilter da ist.
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

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

-- Wartende Profile, deren Speichern bisher scheiterte, einmal erneut prüfen.
update public.profiles set status = status where status = 'pending';

commit;
