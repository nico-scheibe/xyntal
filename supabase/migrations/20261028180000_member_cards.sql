-- Mitglieder-Seite: Xyntal-Karten der Mitglieder anzeigen.
-- Liefert nur Karten, die ihre Besitzer öffentlich gemacht haben (dieselben Felder wie get_public_card,
-- ohne E-Mail, Notizen oder Profil-Details) und die mit einem nicht abgelehnten Konto verknüpft sind.
-- Einmal im Supabase SQL Editor ausführen (nach 016). Läuft als Transaktion. Darf mehrfach laufen.
begin;

create or replace function public.get_member_cards()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id, 'handle', c.handle, 'name', c.name, 'role', c.role, 'level', c.level,
      'skills', to_jsonb(c.skills), 'hours', c.hours, 'mode', c.mode, 'city', c.city,
      'looking', c.looking, 'pitch', c.pitch, 'link', c.link, 'design', coalesce(c.design, '{}'::jsonb)
    )), '[]'::jsonb)
  from public.waitlist_cards c
  join public.profiles p on p.id = c.user_id
  where c.is_public and c.handle is not null and p.status <> 'rejected';
$$;
revoke execute on function public.get_member_cards() from public;
grant execute on function public.get_member_cards() to anon, authenticated;

commit;
