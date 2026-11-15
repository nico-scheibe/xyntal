-- Profil-Symbole („Avatar-Items“) statt Initialen, ohne Kauf und ohne Upload.
-- • avatar_items(): die einzige Liste der Symbole mit Stufe (1 = Basis für alle freigeschalteten Mitglieder,
--   2 = Profil-Set, sobald das Profil ausgefüllt ist). Aktivitäts-Set ist nicht Teil dieser Migration.
-- • profiles.avatar_item: gewähltes Symbol ('' = Initialen). Schreibbar nur für diese eine Spalte (Column-Grant).
-- • avatar_profile_min(feld): Mindestlängen für Stufe 2 (Überschrift 10, Erzähl mehr 40, Angebot/Suche je 10,
--   LinkedIn/Website je 8). Die einzige Stelle mit den Schwellen.
-- • avatar_blank_chars(), avatar_field_filled(text, min): Leerraum und unsichtbare Zeichen an den Rändern
--   zählen nicht; gezählt wird die Länge nach dem Bereinigen.
-- • avatar_item_unlocked_by(...): reine Regel, rechnet aus Profilfeldern (auch aus den neuen Werten im Trigger).
-- • avatar_item_unlocked(uid, item): Freischaltung eines Kontos aus seinen Profildaten (nur für das eigene Konto).
-- • guard_avatar_item: BEFORE-UPDATE-Trigger. Ein neu gesetztes Symbol muss freigeschaltet sein, sonst Fehler.
--   Ein bereits gesetztes Symbol bleibt bei anderen Änderungen unberührt.
-- Keine neuen Policies. Darf mehrfach laufen.
-- MUSS im Supabase SQL Editor laufen, BEVOR das Frontend live geht.
begin;

alter table public.profiles add column if not exists avatar_item text not null default ''
  check (avatar_item ~ '^[a-z]{0,24}$');
grant update (avatar_item) on public.profiles to authenticated;

-- Die Liste der Symbole und Stufen (einzige Stelle)
create or replace function public.avatar_items()
returns table (item text, tier int) language sql immutable set search_path = '' as $$
  select v.item, v.tier from (values
    ('berg', 1), ('kompass', 1), ('schachfigur', 1), ('gluehbirne', 1), ('rakete', 1), ('leuchtturm', 1),
    ('eule', 2), ('kleeblatt', 2), ('stern', 2), ('anker', 2), ('buch', 2), ('bruecke', 2),
    ('schluessel', 2), ('segel', 2), ('fackel', 2), ('krone', 2), ('zielscheibe', 2), ('zahnrad', 2)
  ) as v(item, tier);
$$;

-- Zeichen, die als Leerraum oder unsichtbar gelten. Sie werden an Anfang und Ende entfernt und zählen nicht zur Länge:
-- Tab, LF, VT, FF, CR, Leerzeichen, U+00A0, U+00AD (weiches Trennzeichen), U+1680, U+2000–U+200D (inkl. Null-Breite-
-- Zeichen), U+2028, U+2029, U+202F, U+205F, U+2060, U+3000, U+FEFF (BOM). Als chr()-Codes, damit die Datei ASCII bleibt.
-- Dieselbe Menge steht in public/avatars.js (itemBlank); bei Änderungen beide Stellen anpassen.
create or replace function public.avatar_blank_chars()
returns text language sql immutable set search_path = '' as $$
  select string_agg(chr(c), '')
  from unnest(array[9,10,11,12,13,32,160,173,5760,8232,8233,8239,8287,8288,12288,65279]
              || array(select generate_series(8192, 8205))) as u(c);
$$;

-- Mindestlängen für das Profil-Set (Stufe 2) – die einzige Stelle mit den Schwellen.
-- Begründung: Platzhalter wie „a“ oder „x“ sollen nicht reichen, damit die Freischaltung ein echtes Profil voraussetzt.
-- Gezählt werden Zeichen (keine Bytes) nach dem Bereinigen (avatar_blank_chars an Anfang und Ende).
create or replace function public.avatar_profile_min(p_field text)
returns integer language sql immutable set search_path = '' as $$
  select case p_field
    when 'headline' then 10
    when 'about' then 40
    when 'offer' then 10
    when 'seek' then 10
    when 'linkedin' then 8
    when 'website' then 8
  end;
$$;

-- Ausgefüllt = nach dem Bereinigen mindestens p_min Zeichen lang.
create or replace function public.avatar_field_filled(p text, p_min integer)
returns boolean language sql immutable set search_path = '' as $$
  select char_length(btrim(coalesce(p, ''), public.avatar_blank_chars())) >= p_min;
$$;

-- Freischaltung aus Profilwerten. Stufe 1: freigeschaltetes Mitglied. Stufe 2: zusätzlich Vorhaben (headline),
-- Erzähl mehr (about), Angebot oder Suche (offer/seek) und LinkedIn oder Website – jeweils mit den Mindestlängen oben.
create or replace function public.avatar_item_unlocked_by(
  p_status text, p_headline text, p_about text, p_offer text, p_seek text,
  p_linkedin text, p_website text, p_item text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.avatar_items() a
    where a.item = p_item and (
         (a.tier = 1 and p_status = 'approved')
      or (a.tier = 2 and p_status = 'approved'
          and public.avatar_field_filled(p_headline, public.avatar_profile_min('headline'))
          and public.avatar_field_filled(p_about, public.avatar_profile_min('about'))
          and (public.avatar_field_filled(p_offer, public.avatar_profile_min('offer'))
            or public.avatar_field_filled(p_seek, public.avatar_profile_min('seek')))
          and (public.avatar_field_filled(p_linkedin, public.avatar_profile_min('linkedin'))
            or public.avatar_field_filled(p_website, public.avatar_profile_min('website'))))));
$$;

-- Freischaltung eines Kontos aus seinen Profildaten. Nur das eigene Konto (keine Auskunft über andere).
create or replace function public.avatar_item_unlocked(p_uid uuid, p_item text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_uid = (select auth.uid())
     and exists (select 1 from public.profiles p
                  where p.id = p_uid
                    and public.avatar_item_unlocked_by(p.status, p.headline, p.about, p.offer, p.seek,
                                                       p.linkedin, p.website, p_item));
$$;
revoke execute on function public.avatar_item_unlocked(uuid, text) from public, anon;
grant execute on function public.avatar_item_unlocked(uuid, text) to authenticated;

-- Wer ein Symbol setzt, muss es freigeschaltet haben (serverseitig, nicht nur im Browser).
-- Nur wenn sich avatar_item tatsächlich ändert: so bleibt ein bereits gesetztes Symbol bei Profiländerungen gültig.
create or replace function public.guard_avatar_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.avatar_item is distinct from old.avatar_item and new.avatar_item <> ''
     and not public.avatar_item_unlocked_by(new.status, new.headline, new.about, new.offer, new.seek,
                                            new.linkedin, new.website, new.avatar_item) then
    raise exception 'XYNTAL_AVATAR:locked' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_avatar_item on public.profiles;
create trigger guard_avatar_item before update of avatar_item on public.profiles
  for each row execute function public.guard_avatar_item();

notify pgrst, 'reload schema';
commit;
