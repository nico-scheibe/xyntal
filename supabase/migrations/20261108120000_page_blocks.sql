-- Freie Seite: die Bausteine der Profilseite (Karte, Steckbrief, Über mich, Ich biete, Ich suche, Skills) lassen sich
-- wie Texte und Bilder frei platzieren. Ein Baustein ist ein Element mit type 'block' und kind aus der festen Liste;
-- Inhalt und Darstellung kommen aus dem Profil (public/u.js), im Layout stehen nur Position, Größe, Drehung und Deckkraft.
-- Ersetzt save_my_page aus 20261108110000_custom_page.sql. Nach dieser Migration ausführen. Darf mehrfach laufen.
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
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'type', '') not in ('link', 'text', 'image', 'block') then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    if v_item->>'type' = 'link' and coalesce(v_item->>'ref', '') !~ '^[0-9a-f-]{36}$' then
      raise exception 'invalid link reference' using errcode = '22023';
    end if;
    if v_item->>'type' = 'block' and coalesce(v_item->>'kind', '') not in ('card', 'head', 'about', 'offer', 'seek', 'skills') then
      raise exception 'invalid block' using errcode = '22023';
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
