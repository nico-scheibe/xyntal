-- Newsletter-Einwilligungen laufen ab jetzt ausschließlich über Brevo Double-Opt-in.
-- Die Mitgliedsanmeldung darf keine E-Mail-Adresse mehr unmittelbar in
-- public.newsletter eintragen. Bestehende lokale Einträge bleiben als Archiv erhalten.
begin;
-- Sicherheitsnetz (siehe 20261118180000_altersgrenze_sperrliste.sql): Diese Datei setzt handle_new_user() neu, und
--   zwar ohne die Sperrliste. Liefe sie nach der Sperrlisten-Migration erneut, verschwände der Schutz ohne
--   Fehlermeldung. Deshalb bricht sie dann ab.
do $$ begin
  if to_regclass('public.age_blocks') is not null then
    raise exception 'Diese Datei ist aelter als 20261118180000_altersgrenze_sperrliste.sql und wuerde handle_new_user() ohne die Sperrliste neu setzen. Erst die Sperrlisten-Migration erneut einspielen oder diese Datei auslassen.';
  end if;
end $$;

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
  return new;
end;
$$;

-- Die Website nutzt die alte RPC nicht mehr; ohne Ausführungsrecht kann sie
-- auch von außen keine unbestätigten Adressen mehr eintragen.
revoke execute on function public.subscribe_newsletter(text) from public, anon, authenticated;
commit;
