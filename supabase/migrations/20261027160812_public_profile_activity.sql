-- Personal links show explicitly public projects and listings only.
begin;
create or replace function public.get_public_profile_activity(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select q.id, q.title, q.pitch, q.phase, q.closed,
        (select count(*) from public.project_roles r where r.project_id=q.id and not r.filled) as open_roles
      from public.projects q where q.owner_id=c.user_id and q.is_public
      order by q.closed, q.created_at desc limit 50) x), '[]'::jsonb),
    'listings', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.id, l.title, l.type, l.category, l.closed, left(l.body,240) as excerpt
      from public.listings l where l.author_id=c.user_id and l.is_public
      order by l.closed, l.created_at desc limit 50) x), '[]'::jsonb))
  from public.waitlist_cards c join public.profiles p on p.id=c.user_id
  where c.handle=lower(trim(p_handle)) and c.is_public and p.status <> 'rejected'
    and lower(trim(coalesce(p_handle,''))) ~ '^[a-z0-9][a-z0-9_-]{2,19}$';
$$;
revoke all on function public.get_public_profile_activity(text) from public;
grant execute on function public.get_public_profile_activity(text) to anon, authenticated;
commit;
