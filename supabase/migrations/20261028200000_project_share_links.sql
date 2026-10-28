-- Stable project addresses: /nico-projekt.xy, /nico-projekt-6.xy.
begin;
alter table public.projects add column if not exists share_slug text;
create unique index if not exists projects_share_slug_key on public.projects(share_slug);

create or replace function public.assign_project_share_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_handle text;
  v_base text;
begin
  -- Ignore client-supplied changes; published addresses remain stable.
  if TG_OP = 'UPDATE' then
    if OLD.share_slug is not null then
      NEW.share_slug := OLD.share_slug;
      return NEW;
    end if;
  end if;
  select c.handle into v_handle from public.waitlist_cards c
    where c.user_id = NEW.owner_id and c.handle is not null
    order by c.handle limit 1;
  v_base := case when v_handle is not null then v_handle || '-projekt'
                 else 'projekt-' || NEW.id::text end;
  -- Serialize assignment of the short address for concurrent project creation.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_base, 0));
  if exists (select 1 from public.projects p where p.share_slug = v_base || '.xy' and p.id <> NEW.id) then
    v_base := v_base || '-' || NEW.id::text;
  end if;
  NEW.share_slug := v_base || '.xy';
  return NEW;
end;
$$;
revoke all on function public.assign_project_share_slug() from public;
drop trigger if exists assign_project_share_slug on public.projects;
create trigger assign_project_share_slug before insert or update on public.projects
  for each row execute function public.assign_project_share_slug();
-- Oldest project receives the short name. Do not rewrite existing published links.
do $$ declare v_id bigint; begin
  for v_id in select id from public.projects where share_slug is null order by id loop
    update public.projects set share_slug = null where id = v_id;
  end loop;
end $$;
alter table public.projects alter column share_slug set not null;
alter table public.projects drop constraint if exists projects_share_slug_format;
alter table public.projects add constraint projects_share_slug_format
  check (share_slug ~ '^[a-z0-9][a-z0-9_-]{0,60}\.xy$');
-- The column uses the existing project SELECT policies; no new public access.

create or replace function public.get_public_profile_activity(p_handle text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'projects', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select q.id, q.share_slug, q.title, q.pitch, q.phase, q.closed,
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
