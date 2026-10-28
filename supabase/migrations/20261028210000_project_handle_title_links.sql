-- Replace provisional .xy links with /personal-handle-project-title.
begin;
alter table public.projects drop constraint if exists projects_share_slug_format;
alter table public.projects alter column share_slug drop not null;
create or replace function public.assign_project_share_slug()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_handle text; v_title text; v_base text; v_slug text; v_attempt integer := 0;
begin
  if TG_OP = 'UPDATE' then
    if OLD.share_slug is not null and OLD.share_slug !~ '\.xy$' then
      NEW.share_slug := OLD.share_slug;
      return NEW;
    end if;
  end if;
  -- Both projects and personal handles share one address namespace.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xyntal-personal-addresses', 0));
  select c.handle into v_handle from public.waitlist_cards c
    where c.user_id=NEW.owner_id and c.handle is not null order by c.handle limit 1;
  v_title := lower(NEW.title);
  v_title := replace(replace(replace(replace(v_title, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss');
  v_title := trim(both '-' from regexp_replace(v_title, '[^a-z0-9]+', '-', 'g'));
  v_title := coalesce(nullif(left(v_title,80),''), 'projekt');
  v_base := coalesce(v_handle,'projekt') || '-' || v_title;
  v_slug := v_base;
  loop
    exit when not exists(select 1 from public.projects p where p.share_slug=v_slug and p.id<>NEW.id)
      and not exists(select 1 from public.waitlist_cards c where c.handle=v_slug)
      and not (v_slug=any(array['404','admin','bestaetigt','beta','boerse','community','impressum','index','login','meine-karte','mitglied-werden','mitglieder','nachrichten','passwort-neu','profil','projekte','u']));
    v_attempt := v_attempt + 1;
    v_slug := v_base || '-' || NEW.id::text || case when v_attempt>1 then '-' || v_attempt::text else '' end;
  end loop;
  NEW.share_slug := v_slug;
  return NEW;
end;
$$;
revoke all on function public.assign_project_share_slug() from public;
-- Rebuild provisional addresses only. Final links stay stable after title changes.
do $$ declare v_id bigint; begin
  for v_id in select id from public.projects where share_slug is null or share_slug ~ '\.xy$' order by id loop
    update public.projects set share_slug=null where id=v_id;
  end loop;
end $$;
alter table public.projects alter column share_slug set not null;
alter table public.projects add constraint projects_share_slug_format
  check (share_slug ~ '^[a-z0-9][a-z0-9_-]{0,139}$' and position('-' in share_slug)>0);

create or replace function public.protect_project_address()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if NEW.handle is null then return NEW; end if;
  if TG_OP='UPDATE' then
    if NEW.handle is not distinct from OLD.handle then return NEW; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('xyntal-personal-addresses', 0));
  if exists(select 1 from public.projects p where p.share_slug=NEW.handle) then
    raise exception 'Dieser persönliche Link ist bereits vergeben.' using errcode='23505';
  end if;
  return NEW;
end;
$$;
revoke all on function public.protect_project_address() from public;
drop trigger if exists protect_project_address on public.waitlist_cards;
create trigger protect_project_address before insert or update of handle on public.waitlist_cards
  for each row execute function public.protect_project_address();
commit;
