-- Freie Seite: Bilder und Videos dürfen auch auf dem eigenen Server liegen (Hetzner-Bucket, hosting/daki/media-store.cjs,
-- Adresse xyntal.de/media/…). Im Layout stehen sie als „s/<konto>/<datei>“, Supabase-Dateien weiter als „<konto>/<datei>“.
-- Beide nur aus dem eigenen Ordner. Ersetzt page_check aus 20261108210000_page_pro.sql (sonst unverändert).
-- Nach 20261108220000_page_media_admin.sql ausführen. Darf mehrfach laufen.
begin;

create or replace function public.page_check(p_page jsonb, p_uid uuid, p_template boolean default false)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_item jsonb;
  v_src text;
  v_txt text;
  v_reason text;
begin
  if jsonb_typeof(p_page) <> 'object' then raise exception 'page must be an object' using errcode = '22023'; end if;
  if octet_length(p_page::text) > 60000 then raise exception 'page too large' using errcode = '54000'; end if;
  -- Hintergrund-Video: nur aus dem eigenen Ordner und nur als bestätigt eigenes Video
  if coalesce(p_page->>'bgv', '') <> '' and (p_template or
       p_page->>'bgv' !~ ('^(s/)?' || p_uid::text || '/[0-9a-f-]{36}\.(mp4|webm)$') or coalesce(p_page->>'bgvOwn', '') <> 'true') then
    raise exception 'invalid background video' using errcode = '22023';
  end if;
  v_items := coalesce(p_page->'items', '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then raise exception 'items must be an array' using errcode = '22023'; end if;
  if jsonb_array_length(v_items) > coalesce(public.page_item_limit(p_uid), 40) then
    raise exception 'item limit reached' using errcode = '54000';
  end if;

  for v_item in select * from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'type', '') not in ('link', 'text', 'image', 'block', 'shape', 'button', 'embed', 'icons', 'countdown', 'contact', 'counter') then
      raise exception 'invalid item' using errcode = '22023';
    end if;
    -- Vorlagen: keine Bilder, Videos, Knopf-Adressen; Links nur als leere Platzhalter
    if p_template and (v_item->>'type' in ('image', 'embed') or coalesce(v_item->>'url', '') <> ''
       or (v_item->>'type' = 'link' and coalesce(v_item->>'ref', '') <> '00000000-0000-0000-0000-000000000000')) then
      raise exception 'template must not contain media or links' using errcode = '22023';
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
    -- Hover-Effekt: nur ein kurzer Name aus Kleinbuchstaben; welche es gibt, entscheidet public/page-canvas.js (HOVERS)
    if coalesce(v_item->>'hover', '') !~ '^[a-z]{0,16}$' then
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
    if v_item->>'type' = 'countdown' and coalesce(v_item->>'date', '') !~ '^([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2})?$' then
      raise exception 'invalid countdown' using errcode = '22023';
    end if;
    if v_item->>'type' = 'image' then
      v_src := coalesce(v_item->>'src', '');
      if v_src !~ ('^(s/)?' || p_uid::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$') then
        raise exception 'invalid image' using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Inhaltsfilter: Texte, Beschriftungen, Bildbeschreibungen, Knopf-Adressen (nur wenn die Funktion installiert ist)
  if to_regprocedure('public.content_problem(text)') is not null then
    select string_agg(concat_ws(' ', x->>'text', x->>'alt', x->>'url'), E'\n') into v_txt from jsonb_array_elements(v_items) x;
    execute 'select public.content_problem($1)' into v_reason using coalesce(v_txt, '');
    if v_reason is not null then
      raise exception 'XYNTAL_MODERATION:%', v_reason using errcode = 'P0001';
    end if;
  end if;
end;
$$;
revoke execute on function public.page_check(jsonb, uuid, boolean) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
