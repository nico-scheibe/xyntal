-- Moderation nach den Community-Richtlinien (/community-richtlinien):
--   1. Zusatzregeln für den Schutzfilter (Kontaktdaten, Abzocke, Bankdaten)
--   2. Meldungen, Verwarnpunkte und Sperren (Strafkatalog: A = 1, B = 3 Punkte, C = sofortige Sperre;
--      ab 3 / 6 / 9 Punkten in 12 Monaten: 7 Tage Einschränkung / 30 Tage Sperre / dauerhafte Sperre)
-- Setzt 20261028150000_content_safety.sql voraus.
-- Einmal im Supabase SQL Editor ausführen. Läuft als Transaktion. Darf mehrfach laufen.
begin;

-- ---------- Meldungen ----------
create table if not exists public.moderation_reports (
  id            bigint generated always as identity primary key,
  reporter_id   uuid references public.profiles (id) on delete set null,
  name          text not null check (char_length(name) between 1 and 80),
  email         text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  location      text not null default '' check (char_length(location) <= 500),
  message       text not null check (char_length(message) between 10 and 5000),
  status        text not null default 'neu' check (status in ('neu', 'in_pruefung', 'erledigt', 'abgelehnt')),
  reported_text text not null default '' check (char_length(reported_text) <= 5000),
  ai_result     jsonb,
  ai_checked_at timestamptz,
  admin_note    text not null default '' check (char_length(admin_note) <= 2000),
  created_at    timestamptz not null default now()
);
alter table public.moderation_reports enable row level security;
revoke all on public.moderation_reports from anon, authenticated;
grant select, update, delete on public.moderation_reports to authenticated;
drop policy if exists "Meldungen verwalten" on public.moderation_reports;
create policy "Meldungen verwalten" on public.moderation_reports for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create index if not exists moderation_reports_created_idx on public.moderation_reports (created_at desc);

-- Meldung speichern (vom Server nach dem Formular aufgerufen; auch ohne Konto möglich)
create or replace function public.submit_report(p_name text, p_email text, p_location text, p_message text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
begin
  if (select count(*) from public.moderation_reports where lower(email) = lower(btrim(p_email)) and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.moderation_reports where created_at > now() - interval '1 hour') >= 200 then
    raise exception 'XYNTAL_MODERATION:zu_schnell' using errcode = 'P0001';
  end if;
  insert into public.moderation_reports (reporter_id, name, email, location, message)
  values (auth.uid(), btrim(p_name), btrim(p_email), btrim(coalesce(p_location, '')), btrim(p_message))
  returning id into new_id;
  return new_id;
end;
$$;
revoke execute on function public.submit_report(text, text, text, text) from public;
grant execute on function public.submit_report(text, text, text, text) to anon, authenticated;

-- ---------- Verwarnpunkte und Sperren ----------
create table if not exists public.member_strikes (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.profiles (id) on delete cascade,
  grade       text not null check (grade in ('A', 'B', 'C')),
  points      smallint not null check (points between 0 and 9),
  rule        smallint check (rule between 1 and 10),
  reason      text not null check (char_length(reason) between 3 and 1000),
  report_id   bigint references public.moderation_reports (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '12 months'
);
create table if not exists public.member_sanctions (
  id          bigint generated always as identity primary key,
  member_id   uuid not null references public.profiles (id) on delete cascade,
  level       text not null check (level in ('restricted', 'suspended', 'banned')),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz,
  strike_id   bigint references public.member_strikes (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists member_strikes_member_idx on public.member_strikes (member_id, expires_at);
create index if not exists member_sanctions_member_idx on public.member_sanctions (member_id, ends_at);

alter table public.member_strikes enable row level security;
alter table public.member_sanctions enable row level security;
revoke all on public.member_strikes, public.member_sanctions from anon, authenticated;
-- Anlegen nur über admin_add_strike, damit die Schwellen immer greifen. Löschen = Einspruch erfolgreich.
grant select, delete on public.member_strikes, public.member_sanctions to authenticated;
drop policy if exists "Eigene Verwarnungen sehen" on public.member_strikes;
create policy "Eigene Verwarnungen sehen" on public.member_strikes for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "Verwarnungen löschen" on public.member_strikes;
create policy "Verwarnungen löschen" on public.member_strikes for delete to authenticated
  using ((select public.is_admin()));
drop policy if exists "Eigene Sperren sehen" on public.member_sanctions;
create policy "Eigene Sperren sehen" on public.member_sanctions for select to authenticated
  using (member_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "Sperren aufheben" on public.member_sanctions;
create policy "Sperren aufheben" on public.member_sanctions for delete to authenticated
  using ((select public.is_admin()));

-- Aktuell stärkste Maßnahme: 'none' | 'restricted' | 'suspended' | 'banned'
create or replace function public.moderation_level(p_member uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((
    select s.level from public.member_sanctions s
     where s.member_id = p_member and s.starts_at <= now() and (s.ends_at is null or s.ends_at > now())
     order by case s.level when 'banned' then 3 when 'suspended' then 2 else 1 end desc
     limit 1), 'none');
$$;
revoke execute on function public.moderation_level(uuid) from public, anon, authenticated;

-- Gesperrte Mitglieder verlieren den Mitgliederzugang (alle Regeln, die is_approved_member nutzen)
create or replace function public.is_approved_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved')
     and public.moderation_level(auth.uid()) not in ('suspended', 'banned');
$$;

-- Auch Projekte, Nachrichten und Profile lesen (018) sind für Gesperrte zu
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected'
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  ) and public.moderation_level(auth.uid()) not in ('suspended', 'banned');
$$;

-- Eigener Stand für die Website (Hinweis bei Einschränkung oder Sperre)
create or replace function public.my_moderation_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'level', public.moderation_level(auth.uid()),
    'ends_at', (select max(s.ends_at) from public.member_sanctions s
                 where s.member_id = auth.uid() and s.starts_at <= now() and s.ends_at > now()
                   and s.level = public.moderation_level(auth.uid())),
    'points', (select coalesce(sum(k.points), 0) from public.member_strikes k
                where k.member_id = auth.uid() and k.expires_at > now()));
$$;
revoke execute on function public.my_moderation_status() from public, anon;
grant execute on function public.my_moderation_status() to authenticated;

-- Verwarnung vergeben (nur Admins). Punkte und Folgen nach dem Strafkatalog.
-- p_mild: Grad C ohne Vorsatz -> 30 Tage Sperre statt dauerhaft. p_hint: Grad A als Hinweis (Stufe 0, keine Punkte).
drop function if exists public.admin_add_strike(uuid, text, int, text, bigint, boolean);
create or replace function public.admin_add_strike(p_member uuid, p_grade text, p_rule int, p_reason text,
                                                   p_report bigint default null, p_mild boolean default false,
                                                   p_hint boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  pts       smallint := case when p_hint and p_grade = 'A' then 0 when p_grade = 'A' then 1 when p_grade = 'B' then 3 else 0 end;
  total     int;
  prev      int;
  lvl       text;
  ends      timestamptz;
  strike    bigint;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.' using errcode = '42501'; end if;
  if p_grade not in ('A', 'B', 'C') then raise exception 'Ungültiger Grad.'; end if;
  if (select is_admin from public.profiles where id = p_member) then raise exception 'Admins können nicht verwarnt werden.'; end if;

  insert into public.member_strikes (member_id, grade, points, rule, reason, report_id, created_by)
  values (p_member, p_grade, pts, p_rule, btrim(p_reason), p_report, auth.uid())
  returning id into strike;

  select coalesce(sum(points), 0) into total from public.member_strikes where member_id = p_member and expires_at > now();
  prev := total - pts;

  if p_grade = 'C' then
    lvl := case when p_mild then 'suspended' else 'banned' end;
  elsif p_grade = 'B' and exists (select 1 from public.member_sanctions
                                   where member_id = p_member and level = 'suspended'
                                     and ends_at > now() - interval '6 months') then
    lvl := 'banned';  -- nach einer vorübergehenden Sperre: weiterer B-Verstoß in 6 Monaten
  elsif prev < 9 and total >= 9 then lvl := 'banned';
  elsif prev < 6 and total >= 6 then lvl := 'suspended';
  elsif prev < 3 and total >= 3 then lvl := 'restricted';
  end if;

  if lvl is not null then
    ends := case lvl when 'restricted' then now() + interval '7 days' when 'suspended' then now() + interval '30 days' end;
    insert into public.member_sanctions (member_id, level, ends_at, strike_id) values (p_member, lvl, ends, strike);
  end if;
  -- Stufe 4: Profil und Karte nicht mehr öffentlich, Wunsch-Link wird frei
  if lvl = 'banned' then
    update public.profiles set is_public = false where id = p_member;
    update public.waitlist_cards set is_public = false, handle = null where user_id = p_member;
  end if;
  if p_report is not null then
    update public.moderation_reports set status = 'erledigt' where id = p_report;
  end if;
  return jsonb_build_object('strike', strike, 'points', total, 'level', coalesce(lvl, 'none'), 'ends_at', ends);
end;
$$;
revoke execute on function public.admin_add_strike(uuid, text, int, text, bigint, boolean, boolean) from public, anon;
grant execute on function public.admin_add_strike(uuid, text, int, text, bigint, boolean, boolean) to authenticated;

-- ---------- Zusatzregeln für den Schutzfilter ----------
-- p_table bestimmt, welche Regeln gelten: Kontaktdaten nur in Profil, Projekten und Börse,
-- Bankdaten überall außer in Direktnachrichten.
create or replace function public.content_problem_rules(p text, p_table text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  raw    text := lower(coalesce(p, ''));
  m      text[];
  digits text;
begin
  raw := regexp_replace(raw, '[­​-‏⁠﻿]', '', 'g');
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

-- Trigger erweitern: Sperren/Einschränkungen und Zusatzregeln (Tabellen-Zuordnung bleibt wie bisher)
create or replace function public.enforce_content_safety()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j      jsonb := to_jsonb(new);
  col    text;
  txt    text := '';
  reason text;
  lvl    text;
begin
  if auth.uid() is not null and not public.is_admin() then
    lvl := public.moderation_level(auth.uid());
    if lvl in ('suspended', 'banned') then
      raise exception 'XYNTAL_MODERATION:gesperrt' using errcode = 'P0001';
    end if;
    if lvl = 'restricted' and tg_op = 'INSERT'
       and tg_table_name in ('posts', 'post_comments', 'content_comments', 'listings', 'projects', 'project_roles', 'project_interest') then
      raise exception 'XYNTAL_MODERATION:eingeschraenkt' using errcode = 'P0001';
    end if;
  end if;

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
