-- Newsletter-Einwilligungen laufen ab jetzt ausschließlich über Brevo Double-Opt-in.
-- Die Mitgliedsanmeldung darf keine E-Mail-Adresse mehr unmittelbar in
-- public.newsletter eintragen. Bestehende lokale Einträge bleiben als Archiv erhalten.
begin;
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
