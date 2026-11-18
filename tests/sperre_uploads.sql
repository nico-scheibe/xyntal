-- Sperre wirkt auf Uploads: Ein gesperrtes Mitglied darf in keinem der fünf Xyntal-Eimer mehr hochladen.
-- Gehört zu supabase/migrations/20261118260000_sperre_uploads.sql.
--
-- ECHTE REGELN, wörtlich aus dem Repo übernommen. Jeder übernommene Block trägt seine Herkunft und die Zeilen.
--   Was nicht wörtlich stammt, steht unter "NACHGEBILDET".
--
-- NACHGEBILDET, nicht aus der Produktion gelesen:
--   storage.objects: GEMESSEN in der Produktion, alle 15 Spalten in gemessener Reihenfolge, dazu Rechte und Trigger.
--     Nicht nachgebildet: Primärschlüssel, Eindeutigkeit (bucket_id, name) und die Trigger-Funktionen. Keine Regel
--     und kein Test in dieser Datei braucht sie.
--   storage.buckets: NICHT nachgebildet. Keine Upload-Regel liest die Eimer-Tabelle, nur objects.bucket_id. Die sechs
--     Eimernamen stehen als Text in den Regeln und im Test.
--   storage.foldername(): entfällt, die einzige Regel, die sie brauchte, war die fremde Regel (siehe Block f).
--   Größen- und MIME-Grenzen der Eimer prüft Supabase Storage selbst, nicht die RLS. Dieser Test prüft nur die RLS-Regeln.
--   public.me_banned(): WÖRTLICH aus der Produktion (Rumpf und Sprachangaben am 18.11. gelesen). Im Repo steht sie in
--     20261109120000_security_hardening.sql mit demselben Rumpf. Die Rechte sind die gemessenen: postgres, authenticated,
--     service_role. Im Repo-Grant fehlt service_role, siehe Kommentar an der Stelle.
--   public.profiles: nur die Spalten, die die Regeln lesen. Tabellenrecht select für authenticated, wie in
--     tests/is_admin_sperre.sql. Die Spaltenrechte der Produktion fehlen.
--     Zeilenschutz: AKTIV, mit zwei Leseregeln. Die Produktionsregeln sind VEREINFACHT: "Profile lesen" nur mit dem
--     Zweig id = auth.uid(). Die Zweige is_public, is_approved_member() und is_admin() fehlen als Platzhalter.
--     "Profile lesen (angemeldet)" ist wörtlich aus 20261118120000_altersgrenze_schliessen.sql, Abschnitt 3.
--     Das ist für die Begründung ausreichend, weil der Zweig id = auth.uid() genau der ist, der dort zählt.
--   public.member_birthdates: wie in 20261113120000_signup_birthdate.sql (Spalten id, birthdate, set_at).
--   public.is_active_member(), public.age_ok(), public.is_admin(), public.is_approved_member(): Der Platzhalter ist
--     gemäß Repo nachgebildet, is_admin() und is_approved_member() fehlen hier bewusst (siehe Zeile zu profiles).
--   xyntal-app-files (zweite Anwendung): KEIN Nachbau der echten Regel. Block f nutzt einen Stellvertreter, der nur
--     beweist, dass die neue Regel diesen Eimer nicht anfasst. Die echte Regel steht in einem anderen Projekt.
--   service_role: in Supabase umgeht die Rolle RLS (BYPASSRLS). Hier ist sie NICHT mit BYPASSRLS angelegt, sondern
--     bekommt für Block g3 eine eigene Testregel. So wird geprüft, dass die Sperre sie nicht trifft. Ob die echte
--     Rolle BYPASSRLS hat, ist nicht gemessen.
--
-- GEPRÜFT wird, jede Zusage mit Gegenprobe (Blöcke im Testlauf, Ziffern wie in den Ausgaben):
--   a)  VORHER: Gesperrtes Premium-M2 darf in avatars, banners und project-images hochladen (Lücke belegt).
--       message-attachments sperrt schon vorher. page-media steht nicht in a). b) prüft es nachher.
--       banners verlangt Premium, deshalb braucht die Zusage ein Premium-Konto (M2 im Seed).
--   g)  Nach dem Laden der Migration: Regel "Sperre: nichts hochladen" steht in pg_policies, RESTRICTIVE, INSERT,
--       nur {authenticated}. g1b: Regel "Sperre: nichts ueberschreiben" steht ebenso, mit UPDATE.
--       Struktur. Das Verhalten prüft Block l, mit einem Stellvertreter, der in der Produktion nicht existiert.
--       g2 prüft, dass die fünf erlaubenden Upload-Regeln noch existieren (nur Namen, nicht ihr Inhalt).
--   h)  me_banned(): Rechteprofil postgres, authenticated, service_role ja; anon nein; kein PUBLIC-Eintrag in der ACL.
--       anon mit erteiltem Recht: ok:false, danach wieder entzogen. authenticated antwortet die eigene Lage.
--   i)  Ohne Profilzeile: ok:false, nicht null.
--   b)  NACHHER: gesperrtes M2 scheitert in allen fünf Eimern. b6 beweist die Ursache: nach Entsperren gelingt
--       derselbe Versuch in allen fünf, danach scheitert er wieder (b7).
--   c)  Gegenprobe: nicht gesperrtes M1 (frei) und M3 (Premium) dürfen weiter, wo sie es vorher durften.
--       Dateinamen und Konten erfüllen die Bedingungen der jeweiligen Regel (banners nur Premium, avatars jpg für alle).
--   d)  Abgelaufene Sperre (M4): darf in allen fünf Eimern hochladen.
--   e)  banned = false mit gesetztem Ende in der Zukunft (M5): darf in allen fünf Eimern hochladen.
--   f)  Eimer xyntal-app-files: gesperrtes M2 darf dort hochladen (f1). Ein Stellvertreter erlaubt den Upload;
--       die neue Regel schlägt nicht zu.
--   j)  Begründung der Definer-Funktion: Ohne Leseregeln auf profiles liefert me_banned() für das gesperrte M2 weiter
--       true, und der Upload scheitert weiter, obwohl ein Stellvertreter ihn erlaubt. Das exists direkt liefert dort
--       false. Der Stellvertreter macht den Beleg falsifizierbar: Die Ablehnung kommt nur von der Sperre.
--   k)  Ein NEUER Eimer (zukunft-neuer-eimer, im Test angelegt): gesperrtes M2 scheitert, nicht gesperrtes M1 darf.
--   l)  UPDATE-Verhalten mit Stellvertreter: gesperrtes M2 kann eine eigene Zeile nicht überschreiben, nicht gesperrtes M1 kann es. using und with check werden getrennt geprüft: l2 (nur using lehnt ab), l3 (nur with check lehnt ab). Stellvertreter am Ende entfernt.
--       Mit der alten not-in-Liste wäre der neue Eimer frei gewesen. Der Stellvertreter für ihn erlaubt den Upload.
--   g3) anon und service_role: Die Sperre trifft sie nicht, auch mit der Kennung des gesperrten M2.
--
-- LEHREN, eingehalten:
--   Die Standardrechte (alter default privileges) stehen VOR allen Tabellen und Funktionen.
--   test_check prüft "is not true". Vergleiche laufen über "is not distinct from", damit NULL nicht besteht.
--   Keine Zusage bei leerer Menge: die Regel-Anzahl (g0, g1b) und die Profil-Anzahl (c0, i0) sind Vorbedingungen.
--   Die Kennung wird vor jedem Block ausdrücklich gesetzt (test_login) und die Rolle per "set role" umgestellt.
--   test_expect prüft Rolle und Kennung vor jeder Gruppe. Am Ende jeder Gruppe steht "reset role".
--   Jeder Stellvertreter (TEST-Regel) wird am Ende seines Blocks wieder entfernt.
--
-- Nur in einer separaten leeren lokalen Datenbank ausführen. Niemals gegen Produktion.
-- Start aus dem Projektordner, als Superuser (in der lokalen Testdatenbank postgres):
--   psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/sperre_uploads.sql
\set ON_ERROR_STOP on

-- Testkennungen (UUIDs, kein echtes Konto)
\set M1 '00000000-0000-0000-0000-000000000001'
\set M2 '00000000-0000-0000-0000-000000000002'
\set M3 '00000000-0000-0000-0000-000000000003'
\set M4 '00000000-0000-0000-0000-000000000004'
\set M5 '00000000-0000-0000-0000-000000000005'
\set M6 '00000000-0000-0000-0000-000000000006'

set datestyle = 'ISO, YMD';

-- Rollen: in Supabase immer vorhanden. In einer leeren Testdatenbank müssen sie angelegt werden.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;
create schema if not exists storage;
grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- Standardrechte wie in Supabase, VOR allen Tabellen und Funktionen. Ohne diese Zeilen bekämen die Objekte dieser
--   Datei keine Standardrechte, und die Rechte-Zusagen wären selbsterfüllend. Ausführen als postgres.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ---------- auth (nachgebildet) ----------
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);

-- ---------- storage.objects (GEMESSEN in der Produktion, nicht abgeleitet) ----------
-- Spalten in der gemessenen Reihenfolge, mit gemessener Null-Angabe, Typ und Default.
-- Kein Primärschlüssel und keine Eindeutigkeit: nicht gemessen, daher nicht nachgebildet.
create table storage.objects (
  id                uuid        not null default gen_random_uuid(),
  bucket_id         text,
  name              text,
  owner             uuid,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  last_accessed_at  timestamptz default now(),
  metadata          jsonb,
  path_tokens       text[],
  version           text,
  owner_id          text,
  user_metadata     jsonb,
  archived_at       timestamptz,
  is_delete_marker  boolean     not null default false,
  is_versioned      boolean     not null default false
);
alter table storage.objects enable row level security;

-- Trigger auf storage.objects: GEMESSEN, hier NICHT nachgebildet (die Funktionen sind nicht gemessen).
--   update_objects_updated_at  BEFORE UPDATE  FOR EACH ROW
--   protect_objects_delete     BEFORE DELETE  FOR EACH STATEMENT
--   KEIN Trigger auf INSERT. Das ist gemessen. Wer hier einen INSERT-Trigger ergänzt, erfindet ihn.

-- Eigentümer: In der Produktion gehört storage.objects supabase_storage_admin. Hier gehört es postgres, das ist für
--   diesen Test ohne Belang. Gemessen: postgres ist dort kein Mitglied von supabase_storage_admin und kein Superuser,
--   kann aber Regeln auf storage.objects anlegen und entfernen (in einer zurückgerollten Transaktion geprüft).

-- Rechte: GEMESSEN, tabellenweit. anon und authenticated haben je DELETE, INSERT, SELECT, UPDATE. service_role hat
--   zusätzlich REFERENCES, TRIGGER, TRUNCATE. Die Zeilenschutzregeln sind also die einzige Hürde, nicht die Rechte.
grant select, insert, update, delete on storage.objects to anon, authenticated;
grant select, insert, update, delete, references, trigger, truncate on storage.objects to service_role;

-- Eimer (storage.buckets) fehlen bewusst: keine Upload-Regel liest die Eimer-Tabelle, nur objects.bucket_id.
--   Die sechs Eimernamen werden als Text verwendet, ohne Tabelle und ohne Fremdschlüssel.

-- ---------- public: Tabellen (nachgebildet) ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  banned        boolean not null default false,
  banned_until  timestamptz,
  is_admin      boolean not null default false,
  is_premium    boolean not null default false,
  plan          text not null default 'free',
  created_at    timestamptz not null default now()
);
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create table public.member_birthdates (
  id         uuid primary key references public.profiles (id) on delete cascade,
  birthdate  date not null,
  set_at     timestamptz not null default now()
);
revoke all on public.member_birthdates from anon, authenticated;
grant all on public.member_birthdates to service_role;

-- ---------- public: echte Funktionen (wörtlich) ----------
-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/017_security.sql, Zeilen 17-23
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is null
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified');
$$;
grant execute on function public.mfa_ok() to anon, authenticated;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261103180000_website_ban.sql, Zeilen 8-13
create or replace function public.ban_active(p_banned boolean, p_until timestamptz)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(p_banned, false) and (p_until is null or p_until > now());
$$;
revoke execute on function public.ban_active(boolean, timestamptz) from public;
grant execute on function public.ban_active(boolean, timestamptz) to anon, authenticated;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261109120000_security_hardening.sql, Zeilen 86-91.
--   Die Produktion hat sie laut Befund zusätzlich mit service_role; siehe Rechte unten.
create or replace function public.me_banned()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles
                  where id = auth.uid() and public.ban_active(banned, banned_until));
$$;
-- Rechteprofil wie in der Produktion (Befund: postgres, authenticated, service_role). Standardrechte geben anon
--   ebenfalls Ausführungsrecht, deshalb wird es explizit entzogen. service_role darf die Funktion; ohne Belang,
--   weil service_role den Zeilenschutz ohnehin umgeht.
revoke execute on function public.me_banned() from public, anon;
grant execute on function public.me_banned() to authenticated, service_role;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261113140000_age_gate_publishing.sql, Zeilen 67-82
create table if not exists public.age_check_config (
  id          boolean primary key default true check (id),
  started_at  timestamptz not null default now()
);
alter table public.age_check_config enable row level security;
revoke all on public.age_check_config from anon, authenticated;
insert into public.age_check_config (id) values (true) on conflict (id) do nothing;

-- Nicht mehr immutable, sondern stable: Der Wert steht jetzt in einer Tabelle. Er ändert sich
-- innerhalb einer Abfrage nie, das genügt für die aufrufenden stable-Funktionen.
create or replace function public.age_check_start()
returns timestamptz language sql stable security definer set search_path = '' as $$
  select started_at from public.age_check_config where id
$$;
revoke execute on function public.age_check_start() from public;
grant execute on function public.age_check_start() to anon, authenticated;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261117120000_age_ok_known_birthdate.sql, Zeilen 48-58
create or replace function public.age_ok(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_id is not null and case
    when exists (select 1 from public.member_birthdates b where b.id = p_id)
      then exists (select 1 from public.member_birthdates b where b.id = p_id
                    and b.birthdate <= (current_date - interval '16 years')::date)
    else exists (select 1 from public.profiles p
                  where p.id = p_id and p.created_at < public.age_check_start())
  end;
$$;
revoke execute on function public.age_ok(uuid) from public, anon, authenticated;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261108200000_restore_card_functions.sql, Zeilen 65-70
create or replace function public.beta_application_required()
returns boolean language sql stable security definer set search_path = '' as $$
  select false;
$$;
revoke execute on function public.beta_application_required() from public;
grant execute on function public.beta_application_required() to anon, authenticated;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261113140000_age_gate_publishing.sql, Zeilen 104-114
create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and p.status <> 'rejected' and not public.ban_active(p.banned, p.banned_until)
       and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
       and public.age_ok(p.id)
  ) and not public.beta_application_required();
$$;
revoke execute on function public.is_active_member() from public;
grant execute on function public.is_active_member() to anon, authenticated;

-- ---------- public: Zeilenschutz auf profiles (GEMESSEN, VEREINFACHT) ----------
-- Ohne diese Zeilen wäre die Begründung von me_banned() nicht prüfbar: Ohne Zeilenschutz verhält sich ein exists
--   genauso wie die Definer-Funktion.
-- "Profile lesen" vereinfacht: nur der Zweig id = auth.uid(). Weggelassen sind die Zweige mit is_public,
--   is_approved_member() und is_admin(), weil ihre Platzhalter hier fehlen. Der Zweig für die eigene Zeile ist der,
--   auf den es für die Begründung ankommt.
-- "Profile lesen (angemeldet)" wörtlich aus 20261118120000_altersgrenze_schliessen.sql, Zeilen 61-64 (Abschnitt 3).
alter table public.profiles enable row level security;
drop policy if exists "Profile lesen" on public.profiles;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (id = (select auth.uid()));
drop policy if exists "Profile lesen (angemeldet)" on public.profiles;
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (not public.ban_active(banned, banned_until) and status = 'approved'
         and (select public.is_active_member()));

-- ---------- Upload-Regeln der Xyntal-Eimer (wörtlich, jeweils die neueste Fassung) ----------
-- Größenfunktionen für avatars und banners
-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261107170000_avatar_video.sql, Zeilen 17-39
create or replace function public.avatar_video_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_admin, false) then null
    when p_plan in ('Plus', 'Forge', 'Pulse') then 10 * 1024 * 1024::bigint
    when p_plan in ('Pro', 'Crew', 'Nexus') then 25 * 1024 * 1024::bigint
    when p_plan in ('Ultra', 'Foundry', 'Ascend') then 60 * 1024 * 1024::bigint
    when p_plan in ('Enterprise', 'Enterprise+', 'Works', 'Works Custom') then 150 * 1024 * 1024::bigint
    else 0::bigint
  end;
$$;

create or replace function public.avatar_animated_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_admin, false) then null
    when p_plan in ('Plus', 'Forge', 'Pulse') then 4 * 1024 * 1024::bigint
    when p_plan in ('Pro', 'Crew', 'Nexus') then 8 * 1024 * 1024::bigint
    when p_plan in ('Ultra', 'Foundry', 'Ascend') then 16 * 1024 * 1024::bigint
    when p_plan in ('Enterprise', 'Enterprise+', 'Works', 'Works Custom') then 32 * 1024 * 1024::bigint
    else 4 * 1024 * 1024::bigint
  end;
$$;

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261107190000_banner_limits_table.sql, Zeilen 19-40
create or replace function public.banner_video_limit_bytes(p_plan text, p_admin boolean)
returns bigint language sql immutable set search_path = '' as $$
  select public.avatar_video_limit_bytes(p_plan, p_admin);
$$;

drop policy if exists "Xyntal eigenes Banner hochladen" on storage.objects;
create policy "Xyntal eigenes Banner hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'banners'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.is_premium
       and (storage.objects.name ~ '\.(jpg|png)$'
            or p.is_admin
            or (storage.objects.name ~ '\.(mp4|webm)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.banner_video_limit_bytes(p.plan, p.is_admin), 9223372036854775807))
            or (storage.objects.name ~ '\.(gif|webp)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.avatar_animated_limit_bytes(p.plan, p.is_admin), 9223372036854775807)))
  )
);

-- Erlaubende Upload-Regeln
-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261107170000_avatar_video.sql, Zeilen 66-83
drop policy if exists "Xyntal eigenes Profilbild hochladen" on storage.objects;
create policy "Xyntal eigenes Profilbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'avatars'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|gif|webp|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and (storage.objects.name ~ '\.jpg$' or p.is_premium)
       and (storage.objects.name ~ '\.jpg$'
            or p.is_admin
            or (storage.objects.name ~ '\.(mp4|webm)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.avatar_video_limit_bytes(p.plan, p.is_admin), 9223372036854775807))
            or (storage.objects.name ~ '\.(gif|webp)$'
                and coalesce((storage.objects.metadata->>'size')::bigint, 0)
                    <= coalesce(public.avatar_animated_limit_bytes(p.plan, p.is_admin), 9223372036854775807)))
  )
);

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261108220000_page_media_admin.sql, Zeilen 9-20
drop policy if exists "Xyntal Seitenbild hochladen" on storage.objects;
create policy "Xyntal Seitenbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'page-media'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|webm)$')
  and exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and not public.ban_active(p.banned, p.banned_until)
       and (coalesce(p.is_admin, false)
            or coalesce((storage.objects.metadata->>'size')::bigint, 0)
               <= case when storage.objects.name ~ '\.(mp4|webm)$' then 15728640 else 3145728 end)
  )
);

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261028140000_message_features.sql, Zeilen 428-435
drop policy if exists "Xyntal Nachrichtenanhänge hochladen" on storage.objects;
create policy "Xyntal Nachrichtenanhänge hochladen" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (select public.is_active_member())
    and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.[a-z0-9]+$')
  );

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/020_project_images.sql, Zeilen 28-31
drop policy if exists "Xyntal eigenes Projektbild hochladen" on storage.objects;
create policy "Xyntal eigenes Projektbild hochladen" on storage.objects for insert to authenticated
with check (bucket_id = 'project-images'
  and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.jpg$'));

-- 2FA (beschränkend, für alle Dateien) und Profilbild-Anzahl (beschränkend, nur avatars)
-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261109120000_security_hardening.sql, Zeilen 30-32
drop policy if exists "2FA erzwingen" on storage.objects;
create policy "2FA erzwingen" on storage.objects as restrictive for all to authenticated
  using ((select public.mfa_ok())) with check ((select public.mfa_ok()));

-- Wörtlich aus /Users/nico/Documents/Codex/2026-10-20/wo-2/xyntal/supabase/migrations/20261109120000_security_hardening.sql, Zeilen 162-174
create or replace function public.avatar_upload_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select count(*) from storage.objects o
           where o.bucket_id = 'avatars' and o.name like auth.uid()::text || '/%')
       < coalesce((select case when p.is_admin then 1000 when p.is_premium then 10 else 3 end
                     from public.profiles p where p.id = auth.uid()), 0);
$$;
revoke execute on function public.avatar_upload_allowed() from public, anon;
grant execute on function public.avatar_upload_allowed() to authenticated;

drop policy if exists "Xyntal Profilbild: Anzahl begrenzt" on storage.objects;
create policy "Xyntal Profilbild: Anzahl begrenzt" on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'avatars' or (select public.avatar_upload_allowed()));

-- ---------- Testfunktionen (nur in dieser Testdatenbank) ----------
-- "is not true" besteht nur bei echtem true. NULL besteht nicht.
create function public.test_check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'TEST FEHLGESCHLAGEN: %', msg; end if;
  raise notice 'OK: %', msg;
end $$;

-- Setzt die Kennung der Sitzung. Leer heißt: keine Kennung. Die Rolle stellt der Aufrufer per "set role" um.
create function public.test_login(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid, ''), false);
  perform set_config('request.jwt.claims', case when coalesce(p_uid, '') = '' then '{}'
    else json_build_object('sub', p_uid, 'aal', 'aal1')::text end, false);
end $$;

-- Prüft Rolle UND Kennung. Vor jeder Gruppe aufrufen, damit kein Rest aus einer früheren Gruppe nachwirkt.
create function public.test_expect(p_role text, p_uid text, msg text) returns void language plpgsql as $$
begin
  if current_user::text is distinct from p_role
     or coalesce(auth.uid()::text, '') is distinct from coalesce(p_uid, '') then
    raise exception 'TEST FEHLGESCHLAGEN (%): Rolle "%" (erwartet "%"), Kennung "%" (erwartet "%")',
      msg, current_user::text, p_role, coalesce(auth.uid()::text, ''), coalesce(p_uid, '');
  end if;
  raise notice 'OK: %', msg;
end $$;

-- Versucht einen Upload. Ergebnis: 'ok' oder 'denied' (SQLSTATE 42501 = RLS-Ablehnung). Jeder andere Fehler bricht ab.
create function public.test_insert(p_bucket text, p_name text, p_size bigint) returns text language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata) values (p_bucket, p_name, jsonb_build_object('size', p_size));
  return 'ok';
exception when sqlstate '42501' then
  return 'denied';
end $$;

-- Ruft einen Ausdruck auf. Ergebnis: 'ok:<wert>', 'ok:null' bei NULL, 'denied' bei fehlendem Recht.
create function public.test_call(p_expr text) returns text language plpgsql as $$
declare r text;
begin
  execute 'select (' || p_expr || ')::text' into r;
  return 'ok:' || coalesce(r, 'null');
exception when sqlstate '42501' then
  return 'denied';
end $$;

-- ---------- Testdaten (nur in dieser Testdatenbank) ----------
-- M1 frei, nicht gesperrt. M2 Premium, unbefristet gesperrt. M3 Premium, nicht gesperrt.
-- M4 Premium, Sperre abgelaufen. M5 Premium, banned false mit Ende in der Zukunft. M6 ohne Profilzeile.
insert into auth.users (id, email, email_confirmed_at) values
  (:'M1', 'm1@test.invalid', now()), (:'M2', 'm2@test.invalid', now()), (:'M3', 'm3@test.invalid', now()),
  (:'M4', 'm4@test.invalid', now()), (:'M5', 'm5@test.invalid', now()), (:'M6', 'm6@test.invalid', now());
insert into public.profiles (id, status, banned, banned_until, is_admin, is_premium, plan) values
  (:'M1', 'approved', false, null, false, false, 'free'),
  (:'M2', 'approved', true, null, false, true, 'Pro'),
  (:'M3', 'approved', false, null, false, true, 'Pro'),
  (:'M4', 'approved', true, now() - interval '1 day', false, true, 'Pro'),
  (:'M5', 'approved', false, now() + interval '1 day', false, true, 'Pro');
insert into public.member_birthdates (id, birthdate) values
  (:'M1', '1990-01-01'), (:'M2', '1990-01-01'), (:'M3', '1990-01-01'), (:'M4', '1990-01-01'), (:'M5', '1990-01-01');

-- Vor dem Laden der Migration: die Regeln von heute.
-- ---------- a) VORHER: Lücke belegen ----------
\echo == a) VORHER
reset role;
select public.test_check((select public.ban_active(p.banned, p.banned_until) from public.profiles p where p.id = :'M2') is true, 'a0 Vorbedingung: M2 ist gesperrt');
select public.test_check(has_table_privilege('authenticated', 'storage.objects', 'INSERT') is true, 'a0 Vorbedingung: authenticated hat INSERT auf storage.objects (die Zeilenregeln sind die Hürde)');
-- banners verlangt Premium (is_premium). M2 ist im Seed Premium. Ein normales Konto ohne Premium scheitert in banners
--   schon an is_premium, nicht an der Sperre. Wer die Zusage a2 mit einem normalen Konto nachstellt, hält sie fälschlich
--   für kaputt. Dann braucht es ein eigenes Premium-Konto oder ein Setzen von is_premium.
select public.test_check((select p.is_premium from public.profiles p where p.id = :'M2') is true, 'a0 Vorbedingung: M2 ist Premium (banners verlangt is_premium)');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'a0 Sitzung: gesperrtes M2 als authenticated');
select public.test_check(public.mfa_ok() is true, 'a0 2FA-Regel lässt die Testsitzung durch');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'a1 VORHER: gesperrtes M2 darf in avatars hochladen (Lücke belegt)');
-- .jpg, damit nur die Sperre geprüft wird und nicht eine Größengrenze der Regel (für .jpg genügt is_premium).
select public.test_check(public.test_insert('banners', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'a2 VORHER: gesperrtes Premium-M2 darf in banners hochladen (Lücke belegt)');
select public.test_check(public.test_insert('project-images', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'a3 VORHER: gesperrtes M2 darf in project-images hochladen (Lücke belegt)');
select public.test_check(public.test_insert('message-attachments', :'M2' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'denied', 'a4 VORHER: message-attachments sperrt schon (Kontrolle)');
reset role;

-- ---------- Migration laden ----------
\echo == Migration 20261118260000_sperre_uploads.sql laden
\i supabase/migrations/20261118260000_sperre_uploads.sql

-- ---------- g) Regeln in pg_policies ----------
\echo == g) pg_policies
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts hochladen') = 1, 'g0 Vorbedingung: genau eine Regel "Sperre: nichts hochladen" auf storage.objects');
select public.test_check(exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts hochladen' and permissive = 'RESTRICTIVE' and cmd = 'INSERT' and roles = array['authenticated']::name[]), 'g1 Regel "Sperre: nichts hochladen" ist RESTRICTIVE, INSERT, nur {authenticated} (anon und service_role nicht betroffen)');
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts ueberschreiben' and permissive = 'RESTRICTIVE' and cmd = 'UPDATE' and roles = array['authenticated']::name[]) = 1, 'g1b Regel "Sperre: nichts ueberschreiben" ist RESTRICTIVE, UPDATE, nur {authenticated}. Struktur. Verhalten: Block l');
select public.test_check((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('Xyntal eigenes Profilbild hochladen', 'Xyntal eigenes Banner hochladen', 'Xyntal Nachrichtenanhänge hochladen', 'Xyntal Seitenbild hochladen', 'Xyntal eigenes Projektbild hochladen')) = 5, 'g2 die fünf erlaubenden Upload-Regeln sind noch vorhanden');

-- ---------- h) Rechte von me_banned() ----------
\echo == h) Rechte
select public.test_check(to_regprocedure('public.me_banned()') is not null, 'h0 Vorbedingung: me_banned() existiert');
select public.test_check((select proacl is not null from pg_proc where oid = 'public.me_banned()'::regprocedure), 'h0b Vorbedingung: eigene ACL gesetzt, sonst gilt ein PUBLIC-Recht');
select public.test_check(has_function_privilege('postgres', 'public.me_banned()', 'EXECUTE') is true, 'h1a Eigentümer postgres darf me_banned() ausführen (Rechteprofil der Produktion)');
select public.test_check(has_function_privilege('authenticated', 'public.me_banned()', 'EXECUTE') is true, 'h1b authenticated darf me_banned() ausführen (Rechteprofil der Produktion)');
select public.test_check(has_function_privilege('service_role', 'public.me_banned()', 'EXECUTE') is true, 'h1c service_role darf me_banned() ausführen (Rechteprofil der Produktion; ohne Belang, weil service_role den Zeilenschutz umgeht)');
select public.test_check(has_function_privilege('anon', 'public.me_banned()', 'EXECUTE') is false, 'h1d anon darf me_banned() nicht ausführen (Rechteprofil der Produktion)');
select public.test_check(not exists (select 1 from pg_proc p, unnest(p.proacl) acl where p.oid = 'public.me_banned()'::regprocedure and acl::text like '=%'), 'h1e kein PUBLIC-Eintrag in der ACL');

-- anon: erst Ablehnung, dann Gegenprobe mit erteiltem Recht, dann wieder entzogen
reset role;
select public.test_login('');
set role anon;
select public.test_expect('anon', '', 'h2 Sitzung ohne Kennung als anon');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'denied', 'h2 anon: Aufruf abgelehnt (fehlendes Recht)');
reset role;
grant execute on function public.me_banned() to anon;
set role anon;
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:false', 'h3 Gegenprobe mit erteiltem Recht: anon bekommt ok:false');
reset role;
revoke execute on function public.me_banned() from anon;
set role anon;
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'denied', 'h4 anon nach dem Entziehen wieder abgelehnt');

-- service_role: hat das Recht laut Rechteprofil. Ohne Kennung antwortet die Funktion ok:false.
reset role;
select public.test_login('');
set role service_role;
select public.test_expect('service_role', '', 'h5 Sitzung ohne Kennung als service_role');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:false', 'h5 service_role (Rechteprofil erlaubt den Aufruf): ohne Kennung ok:false');
reset role;

-- authenticated: beantwortet die eigene Lage
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'h8 Sitzung gesperrtes M2');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:true', 'h8 authenticated M2 (gesperrt): ok:true');
reset role;
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'h9 Sitzung nicht gesperrtes M1');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:false', 'h9 authenticated M1 (nicht gesperrt): ok:false');
reset role;

-- ---------- i) Ohne Profilzeile ----------
\echo == i) ohne Profilzeile
select public.test_check(not exists (select 1 from public.profiles where id = :'M6'), 'i0 Vorbedingung: M6 hat keine Profilzeile');
select public.test_login(:'M6');
set role authenticated;
select public.test_expect('authenticated', :'M6', 'i0 Sitzung M6 als authenticated');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:false', 'i1 ohne Profilzeile: ok:false, nicht null');
reset role;

-- ---------- b) NACHHER: gesperrtes M2 scheitert in allen fünf Eimern ----------
\echo == b) NACHHER
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b0 Sitzung gesperrtes M2');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'denied', 'b1 NACHHER: gesperrtes M2 scheitert in avatars');
select public.test_check(public.test_insert('banners', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'denied', 'b2 NACHHER: gesperrtes M2 scheitert in banners');
select public.test_check(public.test_insert('message-attachments', :'M2' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'denied', 'b3 NACHHER: gesperrtes M2 scheitert in message-attachments');
select public.test_check(public.test_insert('page-media', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'denied', 'b4 NACHHER: gesperrtes M2 scheitert in page-media');
select public.test_check(public.test_insert('project-images', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'denied', 'b5 NACHHER: gesperrtes M2 scheitert in project-images');
reset role;
-- Ursache: derselbe Versuch gelingt nach dem Entsperren in allen fünf, und scheitert nach dem erneuten Sperren wieder.
update public.profiles set banned = false, banned_until = null where id = :'M2';
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b6 Sitzung M2 (entsperrt, nur für die Ursachenprobe)');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'b6a entsperrt: avatars gelingt');
select public.test_check(public.test_insert('banners', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'b6b entsperrt: banners gelingt');
select public.test_check(public.test_insert('message-attachments', :'M2' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'b6c entsperrt: message-attachments gelingt');
select public.test_check(public.test_insert('page-media', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'b6d entsperrt: page-media gelingt');
select public.test_check(public.test_insert('project-images', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'b6e entsperrt: project-images gelingt');
reset role;
update public.profiles set banned = true, banned_until = null where id = :'M2';
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'b7 Sitzung M2 (wieder gesperrt)');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'denied', 'b7 wieder gesperrt: scheitert erneut in avatars');
reset role;

-- ---------- c) Gegenprobe: nicht gesperrte Mitglieder dürfen weiter ----------
\echo == c) Gegenprobe
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M1') is true, 'c0 Vorbedingung: M1 ist nicht gesperrt');
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M3') is true, 'c0 Vorbedingung: M3 ist nicht gesperrt');
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'c0 Sitzung M1 (frei, nicht gesperrt)');
select public.test_check(public.test_insert('avatars', :'M1' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'c1 M1 darf in avatars hochladen (jpg, frei erlaubt)');
select public.test_check(public.test_insert('page-media', :'M1' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'c2 M1 darf in page-media hochladen');
select public.test_check(public.test_insert('message-attachments', :'M1' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'c3 M1 darf in message-attachments hochladen');
select public.test_check(public.test_insert('project-images', :'M1' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'c4 M1 darf in project-images hochladen');
reset role;
select public.test_login(:'M3');
set role authenticated;
select public.test_expect('authenticated', :'M3', 'c0 Sitzung M3 (Premium, nicht gesperrt)');
select public.test_check(public.test_insert('banners', :'M3' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'c5 M3 (Premium) darf in banners hochladen');
select public.test_check(public.test_insert('avatars', :'M3' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'c6 M3 darf in avatars hochladen');
select public.test_check(public.test_insert('message-attachments', :'M3' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'c7 M3 darf in message-attachments hochladen');
reset role;

-- ---------- d) Abgelaufene Sperre verhindert nichts ----------
\echo == d) abgelaufene Sperre
select public.test_check((select (not public.ban_active(p.banned, p.banned_until)) from public.profiles p where p.id = :'M4') is true, 'd0 Vorbedingung: die Sperre von M4 ist abgelaufen');
select public.test_login(:'M4');
set role authenticated;
select public.test_expect('authenticated', :'M4', 'd0 Sitzung M4 (abgelaufen)');
select public.test_check(public.test_insert('avatars', :'M4' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'd1 abgelaufen: avatars gelingt');
select public.test_check(public.test_insert('banners', :'M4' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'd2 abgelaufen: banners gelingt');
select public.test_check(public.test_insert('page-media', :'M4' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'd3 abgelaufen: page-media gelingt');
select public.test_check(public.test_insert('message-attachments', :'M4' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'd4 abgelaufen: message-attachments gelingt');
select public.test_check(public.test_insert('project-images', :'M4' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'd5 abgelaufen: project-images gelingt');
reset role;

-- ---------- e) banned = false mit Ende in der Zukunft verhindert nichts ----------
\echo == e) banned false mit Ende
select public.test_check((select (not p.banned and p.banned_until > now()) from public.profiles p where p.id = :'M5') is true, 'e0 Vorbedingung: M5 hat banned false mit Ende in der Zukunft');
select public.test_login(:'M5');
set role authenticated;
select public.test_expect('authenticated', :'M5', 'e0 Sitzung M5');
select public.test_check(public.test_insert('avatars', :'M5' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'e1 banned false: avatars gelingt');
select public.test_check(public.test_insert('banners', :'M5' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'e2 banned false: banners gelingt');
select public.test_check(public.test_insert('page-media', :'M5' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'e3 banned false: page-media gelingt');
select public.test_check(public.test_insert('message-attachments', :'M5' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'e4 banned false: message-attachments gelingt');
select public.test_check(public.test_insert('project-images', :'M5' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'e5 banned false: project-images gelingt');
reset role;

-- ---------- f) Eimer xyntal-app-files ----------
\echo == f) xyntal-app-files
-- STELLVERTRETER, nur für diesen Block. Die echte Regel der zweiten Anwendung steht in einem anderen Projekt und wird
--   hier bewusst NICHT nachgebaut. Der Stellvertreter beweist allein, dass die neue Regel diesen Eimer nicht anfasst.
--   Wenn sich die echte Regel ändert, ist das für diese Zusage ohne Belang.
create policy "TEST Stellvertreter xyntal-app-files" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'xyntal-app-files');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'f0 Sitzung gesperrtes M2');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:true', 'f0 Vorbedingung: M2 ist in dieser Sitzung gesperrt');
select public.test_check(public.test_insert('xyntal-app-files', :'M2' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'f1 gesperrtes M2 darf in xyntal-app-files hochladen (Stellvertreter erlaubt, die neue Regel schlägt nicht zu)');
reset role;
drop policy "TEST Stellvertreter xyntal-app-files" on storage.objects;

-- ---------- j) Begründung: Definer-Funktion statt exists über profiles ----------
\echo == j) Begründung der Definer-Funktion
-- Ohne Leseregeln auf profiles sieht authenticated die eigene Zeile nicht mehr. Ein Stellvertreter erlaubt den Upload
--   in avatars, damit allein die Sperre den Versuch aufhalten kann. Danach werden die Leseregeln wieder gesetzt.
reset role;
drop policy "Profile lesen" on public.profiles;
drop policy "Profile lesen (angemeldet)" on public.profiles;
create policy "TEST Stellvertreter avatars" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'avatars');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'j0 Sitzung gesperrtes M2 ohne Leseregeln');
select public.test_check((select count(*) from public.profiles where id = :'M2') = 0, 'j0 Vorbedingung: ohne Leseregeln sieht authenticated die eigene Zeile nicht');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:true', 'j1 ohne Leseregeln: me_banned() bleibt true für das gesperrte M2');
select public.test_check(public.test_call('exists (select 1 from public.profiles p where p.id = auth.uid() and public.ban_active(p.banned, p.banned_until))') is not distinct from 'ok:false', 'j2 Gegenprobe: dasselbe exists direkt liefert ohne Leseregeln false (die Begründung ist prüfbar)');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'denied', 'j3 ohne Leseregeln: gesperrtes M2 scheitert in avatars, obwohl der Stellvertreter erlaubt');
reset role;
drop policy "TEST Stellvertreter avatars" on storage.objects;
create policy "Profile lesen" on public.profiles
  for select to anon, authenticated
  using (id = (select auth.uid()));
create policy "Profile lesen (angemeldet)" on public.profiles
  for select to authenticated
  using (not public.ban_active(banned, banned_until) and status = 'approved'
         and (select public.is_active_member()));

-- ---------- k) Ein NEUER Eimer ist automatisch gesperrt ----------
\echo == k) neuer Eimer
-- Ein Eimer, den es heute nicht gibt. Der Stellvertreter erlaubt den Upload, damit allein die Sperre ihn aufhält.
create policy "TEST neuer Eimer" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'zukunft-neuer-eimer');
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'k0 Sitzung gesperrtes M2');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:true', 'k0 Vorbedingung: M2 ist gesperrt');
select public.test_check(public.test_insert('zukunft-neuer-eimer', :'M2' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'denied', 'k1 NEUER Eimer: gesperrtes M2 scheitert (mit der alten not-in-Liste wäre er frei gewesen)');
reset role;
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'k2 Sitzung nicht gesperrtes M1');
select public.test_check(public.test_insert('zukunft-neuer-eimer', :'M1' || '/' || gen_random_uuid()::text || '.pdf', 1000) is not distinct from 'ok', 'k2 Gegenprobe: nicht gesperrtes M1 darf in den neuen Eimer (der Stellvertreter erlaubt ihn)');
reset role;
drop policy "TEST neuer Eimer" on storage.objects;

-- ---------- l) UPDATE: Sperre im Verhalten (mit Stellvertreter) ----------
\echo == l) UPDATE
-- STELLVERTRETER, nur für diesen Block. In der Produktion gibt es KEINE erlaubende UPDATE-Regel auf storage.objects.
--   Ohne sie ist die beschränkende Regel dort nicht messbar. Die beiden Stellvertreter erlauben Lesen und Ändern
--   (using true, with check true), damit allein die Sperre übrig bleibt. Sie bilden die Produktion NICHT ab und
--   werden am Ende des Blocks wieder entfernt.
\set A1 '00000000-0000-0000-0000-0000000000a1'
\set A2 '00000000-0000-0000-0000-0000000000a2'
\set A3 '00000000-0000-0000-0000-0000000000a3'
create policy "TEST Stellvertreter lesen" on storage.objects as permissive for select to authenticated using (true);
create policy "TEST Stellvertreter aendern" on storage.objects as permissive for update to authenticated using (true) with check (true);

-- Ergebnis: 'ok' (eine Zeile geändert), 'filtered' (0 Zeilen: using hat die alte Zeile ausgeblendet, kein Fehler),
--   'denied' (SQLSTATE 42501: with check hat die neue Zeile abgewiesen). Ohne diese Unterscheidung sähen zwei
--   verschiedene Ursachen gleich aus, denn bei Postgres ist ein using-Treffer kein Fehler.
create function public.test_update(p_id uuid, p_bucket text) returns text language plpgsql as $$
declare n integer;
begin
  update storage.objects set bucket_id = p_bucket, metadata = jsonb_build_object('size', 2000) where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then return 'filtered'; end if;
  return 'ok';
exception when sqlstate '42501' then
  return 'denied';
end $$;

-- Testzeilen, als postgres angelegt (Eigentümer, nicht durch die Regeln geprüft)
reset role;
insert into storage.objects (id, bucket_id, name, owner, metadata) values
  (:'A1', 'avatars', :'M2' || '/alt-a1.jpg', :'M2', '{"size": 1000}'),
  (:'A2', 'xyntal-app-files', :'M2' || '/alt-a2.pdf', :'M2', '{"size": 1000}'),
  (:'A3', 'avatars', :'M1' || '/alt-a3.jpg', :'M1', '{"size": 1000}');
select public.test_check((select count(*) from storage.objects where id in (:'A1', :'A2', :'A3')) = 3, 'l0 Vorbedingung: drei Testzeilen angelegt');

-- Gesperrtes M2
select public.test_login(:'M2');
set role authenticated;
select public.test_expect('authenticated', :'M2', 'l1 Sitzung gesperrtes M2');
select public.test_check(public.test_call('public.me_banned()') is not distinct from 'ok:true', 'l1 Vorbedingung: M2 ist gesperrt');
-- using allein: die alte Zeile liegt im gesperrten Eimer avatars, der neue Eimer ist frei. Nur using kann ablehnen.
select public.test_check(public.test_update(:'A1', 'xyntal-app-files') is not distinct from 'filtered', 'l2 using allein: gesperrtes M2 kann eine eigene avatars-Zeile nicht in den freien Eimer verschieben (0 Zeilen)');
-- with check allein: die alte Zeile liegt im freien Eimer, der neue Eimer avatars ist gesperrt. Nur with check kann ablehnen.
select public.test_check(public.test_update(:'A2', 'avatars') is not distinct from 'denied', 'l3 with check allein: gesperrtes M2 kann eine Zeile nicht in den gesperrten Eimer avatars schieben (42501)');
-- Kernfall: gleicher Eimer, Überschreiben der eigenen Zeile
select public.test_check(public.test_update(:'A1', 'avatars') is not distinct from 'filtered', 'l4 gesperrtes M2 kann die eigene avatars-Zeile nicht überschreiben (0 Zeilen)');
select public.test_check((select metadata->>'size' from storage.objects where id = :'A1') is not distinct from '1000', 'l5 Ursache: die Zeile A1 ist unverändert (Größe 1000)');
reset role;

-- Gegenprobe: nicht gesperrtes M1
select public.test_login(:'M1');
set role authenticated;
select public.test_expect('authenticated', :'M1', 'l6 Sitzung nicht gesperrtes M1');
select public.test_check(public.test_update(:'A3', 'avatars') is not distinct from 'ok', 'l6 Gegenprobe: nicht gesperrtes M1 kann die eigene avatars-Zeile überschreiben');
select public.test_check((select metadata->>'size' from storage.objects where id = :'A3') is not distinct from '2000', 'l7 Ursache: die Zeile A3 hat die neue Größe 2000');
reset role;

-- Struktur, zusätzlich: Die Regel hat beide Ausdrücke. Ein fehlendes with check ist im Verhalten nicht von einem
--   vorhandenen zu unterscheiden (Postgres nimmt dann das using), deshalb prüft das hier der Katalog.
select public.test_check((select qual is not null and with_check is not null from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'Sperre: nichts ueberschreiben'), 'l8 Struktur: die UPDATE-Regel hat using UND with check gesetzt');

-- Aufräumen: Stellvertreter und Testzeilen entfernen, damit die folgenden Zusagen auf dem Ausgangszustand laufen
reset role;
drop policy "TEST Stellvertreter aendern" on storage.objects;
drop policy "TEST Stellvertreter lesen" on storage.objects;
delete from storage.objects where id in (:'A1', :'A2', :'A3');

-- ---------- g3) anon und service_role: die Sperre trifft sie nicht ----------
-- Testregeln nur für diesen Block. Sie geben anon und service_role einen Weg frei, damit der Versuch die Sperre
--   überhaupt erreicht. Ohne sie scheiterte jeder Versuch schon am fehlenden Recht, und die Gegenprobe wäre leer.
\echo == g3) anon und service_role
create policy "TEST anon darf einfuegen" on storage.objects as permissive for insert to anon with check (true);
create policy "TEST service_role darf einfuegen" on storage.objects as permissive for insert to service_role with check (true);
select public.test_login(:'M2');
set role anon;
select public.test_expect('anon', :'M2', 'g3a Sitzung anon mit Kennung des gesperrten M2');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'g3a anon mit Kennung eines gesperrten Mitglieds: avatars gelingt (Sperre gilt nicht für anon)');
reset role;
set role service_role;
select public.test_expect('service_role', :'M2', 'g3b Sitzung service_role mit Kennung des gesperrten M2');
select public.test_check(public.test_insert('avatars', :'M2' || '/' || gen_random_uuid()::text || '.jpg', 1000) is not distinct from 'ok', 'g3b service_role mit Kennung eines gesperrten Mitglieds: avatars gelingt (Sperre gilt nicht für service_role)');
reset role;

\echo ALLE PRUEFUNGEN BESTANDEN
