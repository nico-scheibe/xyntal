-- Schutzfilter für alle Texte, die Mitglieder schreiben: Beleidigungen, Betrugs-/Spam-Maschen und gefährliche Links.
-- Läuft in der Datenbank, lässt sich also nicht im Browser umgehen. Blockierte Texte werden nicht gespeichert;
-- der Browser bekommt den Fehler „XYNTAL_MODERATION:<grund>“ und zeigt dazu einen verständlichen Hinweis.
-- Eigene Sperrwörter: als Admin in die Tabelle public.blocked_terms eintragen (klein geschrieben).
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- ---------- Eigene Sperrwörter (nur Admins) ----------
create table if not exists public.blocked_terms (
  term        text primary key check (char_length(term) between 2 and 80 and term = lower(term)),
  created_at  timestamptz not null default now()
);
alter table public.blocked_terms enable row level security;
revoke all on public.blocked_terms from anon, authenticated;
grant select, insert, delete on public.blocked_terms to authenticated;
drop policy if exists "Sperrwörter verwalten" on public.blocked_terms;
create policy "Sperrwörter verwalten" on public.blocked_terms for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Prüfung: gibt den Grund zurück oder null ----------
create or replace function public.content_problem(p text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  raw  text := lower(coalesce(p, ''));
  norm text;
  m    text[];
  host text;
begin
  -- unsichtbare Zeichen entfernen, die Filter austricksen sollen
  raw := regexp_replace(raw, '[­​-‏⁠﻿]', '', 'g');
  if btrim(raw) = '' then return null; end if;
  -- für Wortprüfungen: Leetspeak zurückübersetzen, gedehnte Buchstaben kürzen
  norm := translate(raw, '013457@$!', 'oieastasi');
  norm := regexp_replace(norm, '(.)\1{2,}', '\1', 'g');

  -- Beleidigungen, Hass, Aufforderungen zur Selbstverletzung
  if norm ~ '\m(arschloch|arschgeige|wichser|hurensohn|huren(kind|sohn|tochter)|hure\M|missgeburt|spast(i|en|is)?\M|spacko|fotze|schlampe|bastard|penner|vollidiot|drecks(au|ack|kerl|stueck|stück|fotze|hure)|schwuchtel|kanake|neger|nigger|nigga|fick (dich|deine|euch)|verpiss dich|halt (die|deine) fresse|halts maul|bring dich um|töte dich|kys\M|kill yourself|fuck (you|off)|motherfucker|faggot|fag\M|retard|cunt|bitch|whore|slut|asshole|dickhead|wanker)' then
    return 'beleidigung';
  end if;
  if exists (select 1 from public.blocked_terms b where position(b.term in norm) > 0 or position(b.term in raw) > 0) then
    return 'beleidigung';
  end if;

  -- Maschen, die immer Betrug sind
  if raw ~ '(seed.?phrase|recovery.?phrase|wiederherstellungs.?phrase|paysafe|western union|moneygram|(steam|amazon|google.?play|itunes|apple).?(gift.?card|geschenkkarte|gutschein|karte|card))' then
    return 'scam';
  end if;

  -- zu viele Links
  if (select count(*) from regexp_matches(raw, '(https?://|www\.)', 'g')) > 5 then
    return 'zu_viele_links';
  end if;

  -- Kurzlinks und IP-Logger verschleiern das Ziel
  if raw ~ '\m(bit\.ly|tinyurl\.com|t\.ly|cutt\.ly|is\.gd|rb\.gy|ow\.ly|shorturl\.at|tiny\.cc|s\.id|goo\.gl|buff\.ly|rebrand\.ly|bl\.ink|shorte\.st|adf\.ly|grabify\.link|iplogger\.(org|com|ru)|2no\.co|yip\.su)/' then
    return 'link';
  end if;

  -- Downloads von Programmen
  if raw ~ 'https?://\S+\.(exe|scr|msi|bat|cmd|vbs|jar|apk|ps1|dmg)(\M|$|[?#])' then
    return 'link';
  end if;

  -- jede Adresse einzeln prüfen
  for m in select regexp_matches(raw, '(?:https?://|www\.)([^\s/?#<>"'']+)', 'g') loop
    host := m[1];
    if position('@' in host) > 0 then return 'link'; end if;                 -- https://xyntal.de@böse.de
    host := regexp_replace(regexp_replace(host, ':\d+$', ''), '^www\.', '');
    if host ~ '^\d{1,3}(\.\d{1,3}){3}$' then return 'link'; end if;           -- nackte IP-Adresse
    if host like '%xn--%' then return 'link'; end if;                         -- Punycode-Doppelgänger
    if host ~ 'x[yi]nt[a4][l1i]' and host not in ('xyntal.de', 'xyntal.com') then return 'link'; end if; -- Xyntal-Doppelgänger
    if host ~ '\.(zip|mov|tk|ml|ga|cf|gq|top|click|loan|work|country|kim|xin|rest|cam)$' then return 'link'; end if;
  end loop;

  -- Geld- oder Gewinnversprechen zusammen mit Link, Messenger oder Telefonnummer
  if raw ~ '(verdoppl|garantiert\w* (rendite|gewinn|profit)|passive[sn]? einkommen|schnelle[sn]? geld|geld verdienen (von zu hause|ohne)|\d+ ?% (rendite|profit|gewinn) (pro|am|im|jeden) (tag|woche|monat)|investier\w* (jetzt|nur|ab)|trading.?signal|forex|sugar ?daddy|kredit ohne schufa|du hast gewonnen|you (have )?won|claim your|airdrop|double your|guaranteed (return|profit)|make money (fast|from home)|investment opportunity)'
     and raw ~ '(https?://|www\.|t\.me/|telegram|wa\.me/|whatsapp|\+?\d[\d /-]{8,}\d)' then
    return 'scam';
  end if;

  -- Phishing: „Konto gesperrt“ + Link, der nicht zu Xyntal führt
  if raw ~ '(konto|account|profil)\w*.{0,40}(gesperrt|suspended|deaktiviert|verifizier|bestätig|confirm)' and raw ~ '(https?://|www\.)(?!(www\.)?xyntal\.(de|com)\M)' then
    return 'scam';
  end if;

  return null;
end;
$$;
revoke execute on function public.content_problem(text) from public, anon;
grant execute on function public.content_problem(text) to authenticated;

-- ---------- Trigger: prüft die als Argumente genannten Spalten ----------
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
  reason := public.content_problem(txt);
  if reason is not null then
    raise exception 'XYNTAL_MODERATION:%', reason using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_content_safety() from public, anon, authenticated;

-- ---------- Spam-Bremse für Direktnachrichten ----------
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create or replace function public.limit_message_spam()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.messages
       where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 15 then
    raise exception 'XYNTAL_MODERATION:zu_schnell' using errcode = 'P0001';
  end if;
  if char_length(new.body) >= 20 and (select count(*) from public.messages
       where sender_id = new.sender_id and body = new.body and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'XYNTAL_MODERATION:wiederholung' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke execute on function public.limit_message_spam() from public, anon, authenticated;
drop trigger if exists messages_spam_limit on public.messages;
create trigger messages_spam_limit before insert on public.messages
  for each row execute function public.limit_message_spam();

-- ---------- Filter an alle Tabellen mit Mitglieder-Texten hängen ----------
-- Profile nur beim Bearbeiten (nicht beim Anlegen), damit die Registrierung nie am Filter scheitert.
do $$
declare
  t record;
begin
  for t in select * from (values
    ('messages',         'insert or update of body',                                        array['body']),
    ('posts',            'insert or update of body',                                        array['body']),
    ('post_comments',    'insert or update of body',                                        array['body']),
    ('content_comments', 'insert or update of body',                                        array['body']),
    ('listings',         'insert or update of title, body, category',                       array['title', 'body', 'category']),
    ('projects',         'insert or update of title, pitch, body, place',                   array['title', 'pitch', 'body', 'place']),
    ('project_roles',    'insert or update of name, need',                                  array['name', 'need']),
    ('project_interest', 'insert or update of note',                                        array['note']),
    ('profiles',         'update of name, headline, about, category, offer, seek, linkedin, instagram, website',
                                                                                             array['name', 'headline', 'about', 'category', 'offer', 'seek', 'linkedin', 'instagram', 'website']),
    ('waitlist_cards',   'insert or update of name, pitch, city, link, handle, skills',     array['name', 'pitch', 'city', 'link', 'handle', 'skills'])
  ) as v(tbl, events, cols)
  loop
    if to_regclass('public.' || t.tbl) is not null then
      execute format('drop trigger if exists content_safety on public.%I', t.tbl);
      execute format('create trigger content_safety before %s on public.%I for each row execute function public.enforce_content_safety(%s)',
        t.events, t.tbl, (select string_agg(quote_literal(c), ', ') from unnest(t.cols) c));
    end if;
  end loop;
end;
$$;

commit;
