-- Mindestalter 16 gilt ab jetzt auch fürs VERÖFFENTLICHEN eigener Daten.
--
-- 20261113130000_age_gate_membership.sql hat geschlossen, was jemand von anderen sieht und an
-- andere schreibt. Offen blieb die andere Richtung, und für „ab 16“ ist sie die heiklere: Ein
-- neues Konto ohne Geburtsdatum konnte weiterhin eine öffentliche Karte unter xyntal.de/name
-- anlegen – Name, Stadt, Pitch, Link, dazu die freie Seite –, abrufbar für jeden im Netz, auch
-- ohne Anmeldung. Bei einer möglicherweise 13-jährigen Person sind genau das die Daten, die
-- nicht öffentlich stehen sollten.
--
-- WO DIE SPERRE SITZT: Karte und freie Seite hängen beide an waitlist_cards.is_public
--   (get_public_card in 20261108210000_page_pro.sql liefert beides nur dann – die freie Seite
--   steckt als Feld 'page' in derselben Antwort, eine eigene get_public_page gibt es nicht),
--   und is_public wird zentral vom Trigger member_cards_public() gesetzt
--   (20261107200000_cards_always_public.sql). Dieser eine Trigger deckt damit beide ab, egal
--   über welche Funktion geschrieben wird – save_my_card, der App-Server mit der Service Role
--   oder irgendetwas Künftiges. Darum sitzt die Bedingung dort und nicht in save_my_card().
--
-- SPEICHERN BLEIBT ERLAUBT, nur das Öffentlichmachen wird zurückgehalten. Wer kein
--   Geburtsdatum hinterlegt hat, kann seine Karte und seine Seite weiterhin anlegen und
--   bearbeiten; sie stehen nur noch nicht im Netz. Sonst käme ein neues Konto gar nicht erst
--   zu einer Karte und müsste bei null anfangen, sobald es das Datum nachträgt.
--
-- BESTANDSSCHUTZ: Konten von vor dem Stichtag (public.age_check_start(), 14.11.2026 00:00+01)
--   verlieren nichts. Ihre Karten bleiben öffentlich, auch ohne Geburtsdatum. Sie sind nie nach
--   ihrem Alter gefragt worden. Dieselbe Regel gilt in der vorigen Migration und im App-Server.
--   Bestehende Karten OHNE Konto werden dagegen mit ausgeblendet. Für sie gibt es keinen
--   Bestandsschutz, denn er beruht darauf, dass wir jemanden nie nach dem Alter gefragt haben
--   UND ihn kennen; hinter einer Karte ohne Konto steht niemand, den wir fragen könnten. Das
--   trifft auch Erwachsene, die nichts falsch gemacht haben – deshalb ist es eine bewusste
--   Entscheidung des Betreibers und keine technische Notwendigkeit. Verloren geht dabei nichts:
--   Die Karte bleibt mit ihrem Wunsch-Link gespeichert und geht wieder online, sobald ein Konto
--   sie übernimmt (save_my_card holt sie über die E-Mail) und das Geburtsdatum vorliegt.
--
-- KARTEN OHNE KONTO werden dagegen ab jetzt nicht mehr öffentlich. submit_waitlist_card() ist an
--   anon vergeben und schrieb is_public frei mit: Über das Formular auf der Startseite konnte
--   also jeder ohne Konto, ohne bestätigte E-Mail und ohne jede Altersangabe Name, Stadt, Pitch
--   und Link unter xyntal.de/<name> ins Netz stellen. Das ist genau das, was hier zu bleiben
--   aufhören soll, nur eine Tür weiter. Solche Karten werden jetzt gespeichert, aber nicht
--   veröffentlicht; öffentlich werden sie, sobald ein Konto sie übernimmt (save_my_card holt
--   sie über die E-Mail) und die Altersprüfung besteht.
--   DAS IST EINE SICHTBARE ÄNDERUNG AM VERHALTEN DER STARTSEITE: Wer dort eine Karte anlegt,
--   bekommt seinen Wunsch-Link reserviert, aber noch keine öffentliche Seite.
--
-- WAS WEITER OFFEN BLEIBT: get_member_cards() liefert das Kartenverzeichnis unverändert an anon.
--   Das ist Absicht („Mitgliederkarten sind immer öffentlich“). Die Sperre hier wirkt trotzdem:
--   wessen Karte nicht is_public ist, taucht dort nicht auf.
--
-- Einmal im Supabase SQL Editor ausführen, NACH 20261113130000_age_gate_membership.sql.
-- Läuft als Transaktion. Darf mehrfach laufen.
begin;

do $$ begin
  if to_regprocedure('public.age_check_start()') is null then
    raise exception 'Erst 20261113130000_age_gate_membership.sql ausführen, dann diese Migration.';
  end if;
end $$;

-- ---------- Stichtag: der Augenblick des Ausrollens, nicht ein Datum danach ----------
-- 20261113130000 hat age_check_start() fest auf den 14.11.2026 gelegt, also auf einen Zeitpunkt
-- NACH dem Ausrollen. Damit war der Bestandsschutz bis dahin für jeden abholbar: Wer sich am
-- 13. noch schnell ein Konto anlegt – über Apple, Google oder Discord sogar ohne jede
-- Geburtsdatum-Abfrage, weil nur das E-Mail-Formular danach fragt –, gilt dauerhaft als
-- Bestand und darf alles. Ein späterer Nachprüfen findet nicht statt.
-- Richtig ist der Augenblick, in dem diese Migration läuft: Alles, was es davor schon gab,
-- ist Bestand; alles danach wird gefragt. Der Wert wird beim ersten Lauf eingefroren, damit
-- ein zweiter Lauf nicht plötzlich weitere Konten als Bestand zählt.
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

-- ---------- Die Altersregel, ab jetzt an genau einer Stelle ----------
-- Bisher stand sie inline in is_active_member(). Sie wird hier zur eigenen Funktion, weil sie
-- jetzt an zwei Stellen gebraucht wird; zwei Kopien derselben Regel laufen sonst auseinander.
-- Absichtlich NUR über public.profiles.created_at und nicht über auth.users: handle_new_user()
-- legt zu jedem Konto ein Profil an, und is_active_member() prüft es ohnehin schon so.
create or replace function public.age_ok(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_id is not null and (
    exists (select 1 from public.profiles p
             where p.id = p_id and p.created_at < public.age_check_start())
    or exists (select 1 from public.member_birthdates b
                where b.id = p_id
                  and b.birthdate <= (current_date - interval '16 years')::date)
  );
$$;
revoke execute on function public.age_ok(uuid) from public, anon, authenticated;

-- ---------- 1) is_active_member() auf age_ok() umstellen ----------
-- Gleiches Verhalten wie in 20261113130000, nur ohne die doppelte Bedingung.
-- Grundlage bleibt die Fassung aus 20261103180000_website_ban.sql (Sperre, Beta-Bewerbung).
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

-- ---------- 2) Karte und freie Seite werden nicht öffentlich ohne Altersnachweis ----------
-- Grundlage: member_cards_public() aus 20261107200000_cards_always_public.sql.
-- Neu ist allein der Block mit age_ok. Die frühe Rückgabe für Karten ohne Konto, die dort
-- stand, ist bewusst weg: gerade sie war das Loch (siehe oben, submit_waitlist_card).
create or replace function public.member_cards_public()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Ohne Geburtsdatum ab 16 bleibt die Karte unsichtbar. Gespeichert wird sie trotzdem,
  -- samt Wunsch-Link: sobald das Datum nachgetragen ist, geht sie beim nächsten Speichern
  -- von selbst online. Karten ohne Konto (user_id is null) fallen ebenfalls hierunter –
  -- zu ihnen gibt es kein Geburtsdatum, also auch keine Veröffentlichung.
  if not public.age_ok(new.user_id) then
    new.is_public := false;
    return new;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and public.is_admin()
     and old.is_public and not new.is_public then
    return new; -- ein Admin blendet die Karte aus
  end if;
  new.is_public := new.handle is not null;
  return new;
end;
$$;
drop trigger if exists member_cards_public on public.waitlist_cards;
create trigger member_cards_public before insert or update on public.waitlist_cards
  for each row execute function public.member_cards_public();

-- Bestehende Karten einmal nachziehen: Wer nach dem Stichtag dazugekommen ist und kein
-- Geburtsdatum hinterlegt hat, wird ausgeblendet; ebenso jede Karte ohne Konto. Karten von
-- Konten aus der Zeit vor dem Stichtag bleiben unangetastet – das erledigt age_ok().
-- age_ok(null) ist false, deshalb genügt hier eine Bedingung für beide Fälle.
update public.waitlist_cards c set is_public = false
 where c.is_public and not public.age_ok(c.user_id);

-- ---------- 3) Vorlagen-Galerie ----------
-- Bestehende Vorlagen werden ausgeblendet, nicht gelöscht. Für Karten gilt oben dasselbe,
-- und „Speichern bleibt erlaubt“ wäre sonst nur für Karten wahr. Ein Löschen wäre außerdem
-- unwiderruflich und würde bei jedem weiteren Lauf dieser Datei erneut zuschlagen.
-- Dazu zwei Änderungen an list_page_templates(): die Altersprüfung, und der Wunsch-Link des
-- Erstellers nur noch bei öffentlicher Karte – sonst war eine ausgeblendete Karte über die
-- Galerie wieder auffindbar. Grundlage: 20261108210000_page_pro.sql.
create or replace function public.list_page_templates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'page', t.page,
    'handle', case when c.is_public then c.handle end,
    'mine', t.user_id = auth.uid(), 'created_at', t.created_at) order by t.created_at desc), '[]'::jsonb)
  from (select * from public.page_templates order by created_at desc limit 60) t
  join public.profiles p on p.id = t.user_id
  left join public.waitlist_cards c on c.user_id = t.user_id
  where not public.ban_active(p.banned, p.banned_until)
    and public.age_ok(t.user_id);
$$;
revoke execute on function public.list_page_templates() from public, anon;
grant execute on function public.list_page_templates() to authenticated;

-- Sie hängt nicht an is_public, also braucht sie eine eigene Prüfung. Grundlage:
-- share_page_template() aus 20261108210000_page_pro.sql, neu ist allein der age_ok-Block.
create or replace function public.share_page_template(p_name text, p_page jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.page_guard();
  v_id uuid;
  v_reason text;
begin
  if not public.age_ok(v_uid) then
    raise exception 'Bitte trag zuerst dein Geburtsdatum im Profil ein.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 40 then raise exception 'invalid template name' using errcode = '22023'; end if;
  if (select count(*) from public.page_templates where user_id = v_uid) >= 10 then raise exception 'template limit reached' using errcode = '54000'; end if;
  perform public.page_check(p_page, v_uid, true);
  if to_regprocedure('public.content_problem(text)') is not null then
    execute 'select public.content_problem($1)' into v_reason using p_name;
    if v_reason is not null then raise exception 'XYNTAL_MODERATION:%', v_reason using errcode = 'P0001'; end if;
  end if;
  insert into public.page_templates (user_id, name, page) values (v_uid, btrim(p_name), p_page) returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.share_page_template(text, jsonb) from public, anon;
grant execute on function public.share_page_template(text, jsonb) to authenticated;

-- ---------- 4) Einladungsname ----------
-- get_invite_name() ist an anon vergeben und gab den Namen jeder Karte mit Konto heraus, ohne
-- is_public zu prüfen. Nach dem Ausblenden blieb der Klarname damit abrufbar: get_public_card
-- verrät über {handle, reserved} weiterhin, welche Wunsch-Links es gibt, und mit demselben
-- Wunsch-Link lieferte get_invite_name den Namen. Grundlage: 20261107240000_invite_name.sql,
-- neu ist allein c.is_public.
create or replace function public.get_invite_name(p_handle text)
returns text language sql stable security definer set search_path = '' as $$
  select c.name
    from public.waitlist_cards c join public.profiles p on p.id = c.user_id
   where c.handle = lower(trim(coalesce(p_handle, ''))) and c.user_id is not null
     and c.is_public
     and not public.ban_active(p.banned, p.banned_until);
$$;
revoke execute on function public.get_invite_name(text) from public;
grant execute on function public.get_invite_name(text) to anon, authenticated;

-- ---------- 5) Berichtigung durch den Admin wirkt sofort ----------
-- Die Sperre greift nur beim Schreiben. Berichtigt ein Admin ein Geburtsdatum auf ein echtes
-- unter 16, blieb die Karte öffentlich, bis das Mitglied zufällig selbst speichert. Darum
-- stößt admin_set_birthdate() die Karte jetzt selbst an; den Rest macht der Trigger.
-- Grundlage: 20261113120000_signup_birthdate.sql, neu ist allein die letzte Zeile.
create or replace function public.admin_set_birthdate(p_id uuid, p_birthdate text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  b date := public.birthdate_from_text(p_birthdate);
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  if b is null then raise exception 'Bitte gib ein gültiges Geburtsdatum an (JJJJ-MM-TT).'; end if;
  if b > current_date then raise exception 'Das Geburtsdatum liegt in der Zukunft.'; end if;
  insert into public.member_birthdates (id, birthdate) values (p_id, b)
    on conflict (id) do update set birthdate = excluded.birthdate, set_at = now();
  -- Absichtlich OHNE die Datumswerte: das Postgres-Log ist unverschlüsselt, langlebig und wird
  -- beim Löschen eines Kontos nicht mitgelöscht. Dass berichtigt wurde, genügt; worauf, steht
  -- in member_birthdates.
  raise log 'admin_set_birthdate: Geburtsdatum von % berichtigt durch %', p_id, auth.uid();
  -- Wartet das Profil nur noch auf das Datum, wird es jetzt geprüft.
  update public.profiles set status = status where id = p_id and status = 'pending';
  -- Karte sofort ausblenden, wenn das berichtigte Datum sie nicht mehr trägt.
  -- Bewusst nur in diese Richtung: Ein allgemeiner Anstoß würde auch eine Karte wieder
  -- sichtbar machen, die ein Admin aus Moderationsgründen ausgeblendet hat (die Ausnahme
  -- im Trigger greift nur bei old.is_public). Nach oben berichtigt wird die Karte beim
  -- nächsten Speichern durch das Mitglied selbst wieder öffentlich.
  update public.waitlist_cards set is_public = false
   where user_id = p_id and is_public and not public.age_ok(p_id);
end;
$$;
revoke execute on function public.admin_set_birthdate(uuid, text) from public, anon;
grant execute on function public.admin_set_birthdate(uuid, text) to authenticated;

commit;
