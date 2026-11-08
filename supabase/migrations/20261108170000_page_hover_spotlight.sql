-- Freie Seite: Hover-Effekt „Spotlight“ (Lichtkreis folgt der Maus). Ersetzt save_my_page aus
-- 20261108160000_page_hover.sql (nur die Liste der Hover-Effekte wächst). Danach ausführen. Darf mehrfach laufen.
begin;

create or replace function public.save_my_page(p_page jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_item jsonb;
  v_src text;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.profiles where id = v_uid and public.ban_active(banned, banned_until)) then
    raise exception 'account banned' using errcode = '42501';
  end if;
  if p_page is null or p_page = '{}'::jsonb or p_page = 'null'::jsonb then
    update public.waitlist_cards set page = null where user_id = v_uid;
    return null;
  end if;
  if jsonb_typeof(p_page) <> 'object' then raise exception 'page must be an object' using errcode = '22023'; end if;
  if octet_length(p_page::text) > 60000 then raise exception 'page too large' using errcode = '54000'; end if;
  v_items := coalesce(p_page->'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(v_items) > coalesce(public.page_item_limit(v_uid), 20) then
    raise exception 'item limit reached' using errcode = '54000';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'type', '') not in ('link', 'text', 'image', 'block', 'shape', 'button', 'embed', 'icons') then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    if v_item->>'type' = 'link' and coalesce(v_item->>'ref', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'invalid link reference' using errcode = '22023';
    end if;
    if v_item->>'type' = 'block' and coalesce(v_item->>'kind', '') not in ('card', 'head', 'about', 'offer', 'seek', 'skills') then
      raise exception 'invalid block' using errcode = '22023';
    end if;
    if v_item->>'type' = 'button' and coalesce(v_item->>'url', '') <> ''
       and (coalesce(v_item->>'url', '') !~* '^https?://[^[:space:]]{3,}$' or char_length(v_item->>'url') > 500) then
      raise exception 'invalid button url' using errcode = '22023';
    end if;
    if v_item->>'type' = 'embed' and not (
         (v_item->>'provider' = 'youtube' and coalesce(v_item->>'eid', '') ~ '^[A-Za-z0-9_-]{11}$')
      or (v_item->>'provider' = 'vimeo' and coalesce(v_item->>'eid', '') ~ '^[0-9]{6,12}$')
      or (v_item->>'provider' = 'spotify' and coalesce(v_item->>'eid', '') ~ '^(track|album|playlist|episode|show|artist)/[A-Za-z0-9]{22}$')) then
      raise exception 'invalid embed' using errcode = '22023';
    end if;
    -- Video / Musik nur als eigenes Projekt (Community-Richtlinien, Regel 8): Bestätigung ist Pflicht
    if v_item->>'type' = 'embed' and coalesce(v_item->>'own', '') <> 'true' then
      raise exception 'embed not confirmed as own content' using errcode = '22023';
    end if;
    if coalesce(v_item->>'hover', '') not in ('', 'lift', 'pop', 'glow', 'neon', 'shine', 'fill', 'ring', 'outline', 'rainbow', 'tilt', 'shake', 'blur', 'spotlight') then
      raise exception 'invalid hover effect' using errcode = '22023';
    end if;
    if v_item ? 'anim' and jsonb_typeof(v_item->'anim') <> 'null' then
      if jsonb_typeof(v_item->'anim') <> 'object'
         or coalesce(v_item->'anim'->>'p', '') not in ('fade', 'up', 'left', 'zoom', 'float', 'pulse', 'bounce', 'wobble', 'shake', 'spin', 'glow', 'rainbow', 'custom')
         or char_length(coalesce(v_item->'anim'->>'code', '')) > 1500
         or coalesce(v_item->'anim'->>'code', '') !~ '^[A-Za-z0-9äöüÄÖÜß%#{}():;.,@_[:space:]-]*$' then
        raise exception 'invalid animation' using errcode = '22023';
      end if;
    end if;
    if v_item->>'type' = 'image' then
      v_src := coalesce(v_item->>'src', '');
      if v_src !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$') then
        raise exception 'invalid image' using errcode = '22023';
      end if;
    end if;
  end loop;

  update public.waitlist_cards set page = p_page where user_id = v_uid;
  if not found then raise exception 'no card' using errcode = 'P0002'; end if;
  return p_page;
end;
$$;
revoke execute on function public.save_my_page(jsonb) from public, anon;
grant execute on function public.save_my_page(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
