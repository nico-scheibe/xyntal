begin;
alter table public.posts add column if not exists edited_at timestamptz;

create or replace function public.enforce_post_edit_window()
returns trigger language plpgsql set search_path = '' as $$
begin
  if NEW.id is distinct from OLD.id or NEW.author_id is distinct from OLD.author_id
      or NEW.created_at is distinct from OLD.created_at then
    raise exception 'Die ursprünglichen Beitragsdaten können nicht geändert werden.' using errcode='42501';
  end if;
  NEW.edited_at := OLD.edited_at;
  -- Counter updates from likes/comments must continue after the editing window.
  if NEW.body is distinct from OLD.body or NEW.kind is distinct from OLD.kind
      or NEW.is_public is distinct from OLD.is_public then
    if auth.uid() is distinct from OLD.author_id then
      raise exception 'Du kannst nur deine eigenen Beiträge bearbeiten.' using errcode='42501';
    end if;
    if clock_timestamp() >= OLD.created_at + interval '30 minutes' then
      raise exception 'Die 30 Minuten zum Bearbeiten dieses Beitrags sind abgelaufen.' using errcode='42501';
    end if;
    NEW.edited_at := clock_timestamp();
  end if;
  return NEW;
end;
$$;
revoke all on function public.enforce_post_edit_window() from public;
drop trigger if exists enforce_post_edit_window on public.posts;
create trigger enforce_post_edit_window before update on public.posts
  for each row execute function public.enforce_post_edit_window();

drop policy if exists "Eigene Beiträge ändern" on public.posts;
create policy "Eigene Beiträge ändern" on public.posts for update to authenticated
  using(author_id=(select auth.uid()) and created_at>statement_timestamp()-interval '30 minutes')
  with check(author_id=(select auth.uid()) and created_at>statement_timestamp()-interval '30 minutes');

create or replace function public.edit_community_post(p_id bigint, p_body text, p_original_body text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_post public.posts;
begin
  select * into v_post from public.posts where id=p_id for update;
  if not found or auth.uid() is distinct from v_post.author_id then
    raise exception 'Dieser Beitrag kann nicht bearbeitet werden.' using errcode='42501';
  end if;
  if clock_timestamp() >= v_post.created_at + interval '30 minutes' then
    raise exception 'Die 30 Minuten zum Bearbeiten dieses Beitrags sind abgelaufen.' using errcode='42501';
  end if;
  if v_post.body is distinct from p_original_body then
    raise exception 'Der Beitrag wurde inzwischen geändert. Lade die Seite neu, bevor du ihn erneut bearbeitest.';
  end if;
  if p_body is null or char_length(trim(p_body)) not between 1 and 3000 then
    raise exception 'Dein Beitrag muss 1 bis 3000 Zeichen enthalten.';
  end if;
  update public.posts set body=trim(p_body) where id=p_id returning * into v_post;
  return jsonb_build_object('body',v_post.body,'edited_at',v_post.edited_at);
end;
$$;
revoke all on function public.edit_community_post(bigint,text,text) from public;
grant execute on function public.edit_community_post(bigint,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
