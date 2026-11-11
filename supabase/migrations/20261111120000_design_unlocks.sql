-- Exklusive Designs pro Konto (erstes Design: „snow“, Schneefall-Overlay der freien Seite).
-- • exclusive_designs(): die einzige Stelle mit der Liste der exklusiven Designs.
-- • design_unlocks: welches Konto welches Design hat (aktiv, solange revoked_at leer ist). Nur über Funktionen.
-- • design_unlock_log: Protokoll jeder Freischaltung und Rücknahme (nur wenn sich etwas ändert).
-- • page_check: lässt ein exklusives Design nur freigeschalteten Konten zu (nie in Vorlagen);
--   Overlay-Liste muss aus höchstens 12 kurzen Namen bestehen.
-- • Admin: admin_design_unlock (freischalten / zurücknehmen; Zurücknehmen entfernt das Overlay sofort
--   aus Seite, Entwurf und Versionen), admin_design_unlocks (aktive Designs eines Kontos).
-- • Konto: get_my_design_unlocks (aktive und neu zurückgenommene Designs), ack_design_revoked (Hinweis gelesen).
-- • Einmalige Bereinigung am Ende: snow aus Seiten, Entwürfen, Versionen und Vorlagen, die es nicht tragen dürfen.
-- Nach 20261108230000_page_media_server.sql ausführen (ersetzt page_check). Darf mehrfach laufen.
-- MUSS im Supabase SQL Editor laufen, BEVOR das Frontend live geht (siehe README).
begin;

-- Die Liste der exklusiven Designs (einzige Stelle)
create or replace function public.exclusive_designs()
returns text[] language sql immutable set search_path = '' as $$
  select array['snow']::text[];
$$;

-- Freischaltungen je Konto. Keine Policies: Lesen und Schreiben nur über die Funktionen unten.
create table if not exists public.design_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  design text not null,
  granted_by uuid,
  reason text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_seen boolean not null default false,
  primary key (user_id, design)
);
alter table public.design_unlocks enable row level security;
revoke all on public.design_unlocks from anon, authenticated;

-- Protokoll (Audit): jede tatsächliche Freischaltung und Rücknahme
create table if not exists public.design_unlock_log (
  id bigint generated always as identity primary key,
  admin_id uuid,
  user_id uuid not null,
  design text not null,
  action text not null check (action in ('unlock', 'lock')),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.design_unlock_log enable row level security;
revoke all on public.design_unlock_log from anon, authenticated;

-- Ist ein Design für ein Konto freigeschaltet? Admins immer. Intern (nur für die definer-Funktionen).
create or replace function public.design_unlocked(p_uid uuid, p_design text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.design_unlocks d
                  where d.user_id = p_uid and d.design = p_design and d.revoked_at is null)
      or coalesce((select p.is_admin from public.profiles p where p.id = p_uid), false);
$$;
revoke execute on function public.design_unlocked(uuid, text) from public, anon, authenticated, service_role;

-- Konto aus einer Eingabe finden: UUID → profiles.id; Eingabe mit @ in der Mitte → E-Mail (auth.users);
-- sonst Handle (waitlist_cards). Führendes @ wird entfernt, Groß-/Kleinschreibung egal.
-- Intern: gemeinsame Kontoauflösung der Admin-Funktionen.
create or replace function public.design_unlock_account(p_account text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(btrim(regexp_replace(btrim(coalesce(p_account, '')), '^@', '')));
  v_ids uuid[];
begin
  if v_q = '' then raise exception 'XYNTAL_UNLOCK:no_account' using errcode = 'P0001'; end if;
  if v_q ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select array_agg(p.id) into v_ids from public.profiles p where p.id = v_q::uuid;
  elsif position('@' in v_q) > 0 then
    select array_agg(u.id) into v_ids from auth.users u where lower(u.email) = v_q;
  else
    select array_agg(c.user_id) into v_ids from public.waitlist_cards c where c.handle = v_q and c.user_id is not null;
  end if;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception 'XYNTAL_UNLOCK:no_account' using errcode = 'P0001'; end if;
  if cardinality(v_ids) > 1 then raise exception 'XYNTAL_UNLOCK:ambiguous' using errcode = 'P0001'; end if;
  return v_ids[1];
end;
$$;
revoke execute on function public.design_unlock_account(text) from public, anon, authenticated, service_role;

-- Gemeinsame Entfernen-Logik: nimmt die Designs p_designs aus ov. Andere Angaben bleiben unverändert;
-- ov fehlt, ist null oder kein Array → Seite unverändert. Genutzt von Zurücknehmen und Bereinigung.
create or replace function public.strip_overlays(p_page jsonb, p_designs text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
begin
  if p_page is null or jsonb_typeof(p_page->'ov') is distinct from 'array' then return p_page; end if;
  if not exists (select 1 from jsonb_array_elements(p_page->'ov') as e(v) where coalesce((e.v #>> '{}') = any (p_designs), false)) then
    return p_page;
  end if;
  return jsonb_set(p_page, '{ov}', coalesce(
    (select jsonb_agg(e.v order by e.n) from jsonb_array_elements(p_page->'ov') with ordinality as e(v, n)
      where not coalesce((e.v #>> '{}') = any (p_designs), false)), '[]'::jsonb));
end;
$$;
revoke execute on function public.strip_overlays(jsonb, text[]) from public, anon, authenticated, service_role;

-- Alle exklusiven Designs, die ein Konto nicht hat (Admins: keine). Intern für die Bereinigung.
create or replace function public.locked_designs(p_uid uuid)
returns text[] language sql stable set search_path = '' as $$
  select coalesce(array(select d from unnest(public.exclusive_designs()) as d where not public.design_unlocked(p_uid, d)), '{}'::text[]);
$$;
revoke execute on function public.locked_designs(uuid) from public, anon, authenticated, service_role;

-- Prüft ein Layout; Fehler als Exception. Wie 20261108230000_page_media_server.sql, dazu die Overlay-Prüfung.
create or replace function public.page_check(p_page jsonb, p_uid uuid, p_template boolean default false)
returns void language plpgsql stable security definer set search_path = '' as $$
declare
  v_items jsonb;
  v_item jsonb;
  v_ov jsonb;
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
  -- Overlays: Liste kurzer Namen (wie OVERLAYS in public/page-canvas.js); exklusive Designs nur freigeschaltet, nie in Vorlagen
  if p_page ? 'ov' and jsonb_typeof(p_page->'ov') <> 'null' then
    if jsonb_typeof(p_page->'ov') <> 'array' or jsonb_array_length(p_page->'ov') > 12 then
      raise exception 'invalid overlays' using errcode = '22023';
    end if;
    for v_ov in select * from jsonb_array_elements(p_page->'ov') loop
      if jsonb_typeof(v_ov) <> 'string' or (v_ov #>> '{}') !~ '^[a-z]{1,16}$' then
        raise exception 'invalid overlay' using errcode = '22023';
      end if;
      if (v_ov #>> '{}') = any (public.exclusive_designs())
         and (p_template or not public.design_unlocked(p_uid, v_ov #>> '{}')) then
        raise exception 'XYNTAL_UNLOCK:locked' using errcode = '42501';
      end if;
    end loop;
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

-- ---- Admin ----

-- Freischalten (p_on = true) oder zurücknehmen (p_on = false). Zurücknehmen entfernt das Overlay sofort
-- aus Seite und Entwurf (außer das Konto ist Admin). Jede tatsächliche Änderung landet im Protokoll.
create or replace function public.admin_design_unlock(p_account text, p_design text, p_on boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := auth.uid();
  v_uid uuid;
  v_handle text;
  v_name text;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_active boolean;
  v_target_admin boolean;
  v_changed boolean := false;
  v_was_public boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  if p_design is null or not (p_design = any (public.exclusive_designs())) then
    raise exception 'XYNTAL_UNLOCK:unknown_design' using errcode = 'P0001';
  end if;
  v_uid := public.design_unlock_account(p_account);
  select c.handle, c.name into v_handle, v_name from public.waitlist_cards c where c.user_id = v_uid;
  v_target_admin := coalesce((select p.is_admin from public.profiles p where p.id = v_uid), false);
  select (d.revoked_at is null) into v_active from public.design_unlocks d where d.user_id = v_uid and d.design = p_design;

  if coalesce(p_on, false) then
    if char_length(v_reason) not between 3 and 200 then
      raise exception 'XYNTAL_UNLOCK:reason_required' using errcode = 'P0001';
    end if;
    if not coalesce(v_active, false) then
      insert into public.design_unlocks (user_id, design, granted_by, reason, created_at, revoked_at, revoked_by, revoke_seen)
      values (v_uid, p_design, v_admin, v_reason, now(), null, null, false)
      on conflict (user_id, design) do update set granted_by = excluded.granted_by, reason = excluded.reason,
        created_at = excluded.created_at, revoked_at = null, revoked_by = null, revoke_seen = false;
      insert into public.design_unlock_log (admin_id, user_id, design, action, reason)
        values (v_admin, v_uid, p_design, 'unlock', v_reason);
      v_changed := true;
    end if;
  else
    if coalesce(v_active, false) then
      update public.design_unlocks set revoked_at = now(), revoked_by = v_admin, revoke_seen = false
        where user_id = v_uid and design = p_design;
      insert into public.design_unlock_log (admin_id, user_id, design, action, reason)
        values (v_admin, v_uid, p_design, 'lock', nullif(left(v_reason, 200), ''));
      v_changed := true;
    end if;
    -- Overlay sofort aus veröffentlichter Seite, Entwurf und Versionen nehmen (Admins behalten es)
    if not v_target_admin then
      select c.is_public into v_was_public from public.waitlist_cards c where c.user_id = v_uid;
      update public.waitlist_cards c set
        page = public.strip_overlays(c.page, array[p_design]),
        page_draft = public.strip_overlays(c.page_draft, array[p_design])
      where c.user_id = v_uid
        and (c.page is distinct from public.strip_overlays(c.page, array[p_design])
          or c.page_draft is distinct from public.strip_overlays(c.page_draft, array[p_design]));
      -- member_cards_public (20261107200000) setzt is_public bei jedem Update neu. Eine ausgeblendete Karte
      -- darf durch das Zurücknehmen nicht wieder sichtbar werden: Der Aufrufer ist Admin, deshalb lässt der
      -- Trigger dieses zweite Update (sichtbar → ausgeblendet) stehen.
      if v_was_public is false then
        update public.waitlist_cards c set is_public = false where c.user_id = v_uid and c.is_public;
      end if;
      update public.page_versions v set page = public.strip_overlays(v.page, array[p_design])
      where v.user_id = v_uid and v.page is distinct from public.strip_overlays(v.page, array[p_design]);
    end if;
  end if;

  return jsonb_build_object('handle', v_handle, 'name', v_name, 'design', p_design, 'changed', v_changed);
end;
$$;
revoke execute on function public.admin_design_unlock(text, text, boolean, text) from public, anon;
grant execute on function public.admin_design_unlock(text, text, boolean, text) to authenticated;

-- Aktive Designs eines Kontos (Admin)
create or replace function public.admin_design_unlocks(p_account text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid;
  v_handle text;
  v_name text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Nur für Admins.' using errcode = '42501';
  end if;
  v_uid := public.design_unlock_account(p_account);
  select c.handle, c.name into v_handle, v_name from public.waitlist_cards c where c.user_id = v_uid;
  return jsonb_build_object('handle', v_handle, 'name', v_name, 'designs', coalesce(
    (select jsonb_agg(d.design order by d.design) from public.design_unlocks d where d.user_id = v_uid and d.revoked_at is null),
    '[]'::jsonb));
end;
$$;
revoke execute on function public.admin_design_unlocks(text) from public, anon;
grant execute on function public.admin_design_unlocks(text) to authenticated;

-- ---- Konto ----

-- Eigene Designs: aktive (bei Admins alle) und zurückgenommene, deren Hinweis noch nicht gelesen ist
create or replace function public.get_my_design_unlocks()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce((select p.is_admin from public.profiles p where p.id = v_uid), false);
begin
  return jsonb_build_object(
    'designs', case when v_admin then to_jsonb(public.exclusive_designs()) else coalesce(
        (select jsonb_agg(d.design order by d.design) from public.design_unlocks d where d.user_id = v_uid and d.revoked_at is null),
        '[]'::jsonb) end,
    'revoked', coalesce(
        (select jsonb_agg(d.design order by d.design) from public.design_unlocks d
          where d.user_id = v_uid and d.revoked_at is not null and d.revoke_seen = false),
        '[]'::jsonb));
end;
$$;
revoke execute on function public.get_my_design_unlocks() from public, anon;
grant execute on function public.get_my_design_unlocks() to authenticated;

-- Hinweis zur Rücknahme gelesen
create or replace function public.ack_design_revoked(p_design text)
returns void language sql volatile security definer set search_path = '' as $$
  update public.design_unlocks set revoke_seen = true where user_id = auth.uid() and design = p_design;
$$;
revoke execute on function public.ack_design_revoked(text) from public, anon;
grant execute on function public.ack_design_revoked(text) to authenticated;

-- ---- Einmalige Bereinigung (Altbestand) ----
-- Vor dieser Migration konnte jedes Konto snow speichern. Das Design fliegt aus allen Fassungen, die es
-- nicht mehr tragen dürfen: Seiten und Entwürfe der Konten ohne Freischaltung (Admins behalten es),
-- alle Vorlagen (nie exklusive Designs) und die Versionen der Konten ohne Freischaltung.
-- Ohne Treffer ändert sich nichts; mehrfaches Ausführen ist unkritisch.
do $$
declare
  v_member_trigger boolean := exists (select 1 from pg_trigger
                                       where tgrelid = 'public.waitlist_cards'::regclass and tgname = 'member_cards_public');
begin
  -- member_cards_public setzt is_public bei jedem Update neu (ohne Admin-Kontext). Ausgeblendete Karten
  -- würden dabei wieder sichtbar; deshalb ist dieser eine Trigger nur für die Bereinigung aus.
  if v_member_trigger then alter table public.waitlist_cards disable trigger member_cards_public; end if;

  update public.waitlist_cards c set
    page = public.strip_overlays(c.page, public.locked_designs(c.user_id)),
    page_draft = public.strip_overlays(c.page_draft, public.locked_designs(c.user_id))
  where c.page is distinct from public.strip_overlays(c.page, public.locked_designs(c.user_id))
     or c.page_draft is distinct from public.strip_overlays(c.page_draft, public.locked_designs(c.user_id));

  if v_member_trigger then alter table public.waitlist_cards enable trigger member_cards_public; end if;

  update public.page_templates t set page = public.strip_overlays(t.page, public.exclusive_designs())
  where t.page is distinct from public.strip_overlays(t.page, public.exclusive_designs());

  update public.page_versions v set page = public.strip_overlays(v.page, public.locked_designs(v.user_id))
  where v.page is distinct from public.strip_overlays(v.page, public.locked_designs(v.user_id));
end $$;

notify pgrst, 'reload schema';
commit;
