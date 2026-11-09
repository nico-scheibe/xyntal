-- Zusatzregeln für den Schutzfilter nach den Community-Richtlinien (/community-richtlinien):
--   Regel 7  Abzocke: MLM, Krypto-Pump, Werde-reich-Versprechen zusammen mit einer Kontaktaufforderung
--   Regel 2  Bankdaten (IBAN) nicht öffentlich – in Direktnachrichten erlaubt
--   Regel 2  Kontaktdaten zum Umgehen des Matchings in Profil, Börse und Projekten
--            (E-Mail-Adressen außer @xyntal, Telefonnummern, Messenger-Links und -Namen)
-- Die Meldung an die Website kommt wie bisher als XYNTAL_MODERATION:<grund> (abzocke, daten,
-- kontaktdaten); public/app.js übersetzt sie.
--
-- Setzt 20261028150000_content_safety.sql voraus (content_problem und die Trigger). Ohne den
-- Schutzfilter ändert diese Datei nichts an Tabellen: die Trigger hängen dann nicht.
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

create or replace function public.content_problem_rules(p text, p_table text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  raw    text := lower(coalesce(p, ''));
  m      text[];
  digits text;
begin
  -- unsichtbare Zeichen (weiches Trennzeichen, Nullbreite, Richtungszeichen) entfernen
  raw := regexp_replace(raw, '[' || chr(173) || chr(8203) || '-' || chr(8207) || chr(8288) || chr(65279) || ']', '', 'g');
  if btrim(raw) = '' then return null; end if;

  -- Regel 7: Abzocke-Begriffe zusammen mit einer Aufforderung, Kontakt aufzunehmen
  if raw ~ '(network.?marketing|strukturvertrieb|\mmlm\M|schneeball.?system|pyramid.?scheme|pre.?sale|token.?sale|pump.?(and|&|n|und).?dump|to the moon|\m\d{2,4} ?x (gewinn|profit|rendite|return)|werde (schnell )?reich|get rich quick|dein eigener chef|be your own boss)'
     and raw ~ '(https?://|www\.|t\.me/|telegram|wa\.me/|whatsapp|discord\.gg/|\mdm\M|schreib mir|melde dich|join|mach mit|sei dabei|\+?\d[\d /-]{8,}\d)' then
    return 'abzocke';
  end if;

  -- Regel 2/7: Bankverbindung (IBAN) nicht öffentlich
  if p_table <> 'messages' and raw ~ '\m[a-z]{2}\d{2}( ?[0-9]{4}){3,7}( ?[0-9]{1,3})?\M' then
    return 'daten';
  end if;

  -- Regel 2: Kontaktdaten, um das Match-Prinzip zu umgehen
  if p_table in ('profiles', 'listings', 'projects', 'project_roles') then
    if raw ~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}' and raw !~ '@xyntal\.(de|com)\M' then
      return 'kontaktdaten';
    end if;
    if raw ~ '(t\.me/|wa\.me/|chat\.whatsapp\.com|discord\.gg/|(whatsapp|telegram|signal|threema|snapchat|discord)\s*[:@]\s*\S)' then
      return 'kontaktdaten';
    end if;
    for m in select regexp_matches(raw, '((\+|00)\d[\d /().-]{7,}\d|\m0\d[\d /().-]{7,}\d)', 'g') loop
      digits := regexp_replace(m[1], '\D', '', 'g');
      if char_length(digits) between 9 and 15 then return 'kontaktdaten'; end if;
    end loop;
  end if;
  return null;
end;
$$;
revoke execute on function public.content_problem_rules(text, text) from public, anon;
grant execute on function public.content_problem_rules(text, text) to authenticated;

-- Trigger aus 20261028150000 um die Zusatzregeln erweitern (Spalten-Zuordnung bleibt).
create or replace function public.enforce_content_safety()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j      jsonb := to_jsonb(new);
  col    text;
  txt    text := '';
  reason text;
begin
  foreach col in array tg_argv loop
    txt := txt || E'\n' || coalesce(
      case jsonb_typeof(j -> col)
        when 'array' then (select string_agg(x, ' ') from jsonb_array_elements_text(j -> col) x)
        else j ->> col
      end, '');
  end loop;
  reason := coalesce(public.content_problem(txt), public.content_problem_rules(txt, tg_table_name));
  if reason is not null then
    raise exception 'XYNTAL_MODERATION:%', reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_content_safety() from public, anon, authenticated;

commit;
