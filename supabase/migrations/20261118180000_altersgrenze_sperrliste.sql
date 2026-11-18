-- SUPPORT-WEG (Sperre auf Antrag): Erst admin_clear_age_block('adresse') aufrufen, damit die Sperre nicht wieder
--   zuschlägt. Danach admin_set_birthdate(konto, 'richtiges_datum') aufrufen, um das aufgezwungene Datum zu
--   berichtigen. Nur in dieser Reihenfolge.
--
-- Schließt die Lücke, durch die ein Konto unter 16 die Altersgrenze per Löschen und Neuanmeldung umgeht.
--
-- DIE LÜCKE: Ein Konto unter 16 mit ehrlich eingetragenem Geburtsdatum löschte sich über
--   delete_my_account(). Das Datum hängt an public.member_birthdates, und die Zeile fällt mit dem
--   Profil weg (on delete cascade). Danach meldete sich dieselbe E-Mail-Adresse wieder an, diesmal mit
--   2000-01-01, und age_ok() war wieder wahr. Auf der Produktionsdatenbank belegt.
--
-- WAS DIESE DATEI TUT: Beim Löschen bleibt eine Zeile in public.age_blocks zurück. Sie enthält einen
--   gepfefferten Hash der E-Mail-Adresse und den Tag, an dem die Sperre endet (der 16. Geburtstag).
--   Bei einer Neuanmeldung mit derselben Adresse wird daraus das Geburtsdatum wiederhergestellt, und
--   zwar in handle_new_user(). Kein Geburtsdatum und keine E-Mail-Adresse im Klartext überleben die
--   Löschung.
--
-- WARUM EIN PFEFFER: Ein blanker sha256 einer E-Mail-Adresse ist in der Praxis umkehrbar, weil man
--   Adressen durchprobieren kann. Mit dem geheimen Pfeffer in age_block_secret ist ein Teilabfluss
--   genau dieser Tabelle wertlos. Der Pfeffer liegt in einer Tabelle, die für anon, authenticated und
--   service_role gesperrt ist, und age_block_key() ist für sie nicht ausführbar.
--
-- WARUM NUR DER TAG DES 16. GEBURTSTAGS: Gespeichert wird bewusst KEIN Geburtsdatum, sondern nur der Tag,
--   an dem die Sperre endet. Dieser Tag ist das Geburtsdatum um 16 Jahre verschoben und lässt sich exakt
--   zurückrechnen. Das ist gewollt und ehrlich: Die Zeile ist an den gepfefferten Hash gebunden und wird
--   nach Ablauf entfernt. Die Datenschutzerklärung nennt diesen Sachverhalt, er wird nicht verschleiert.
--
-- KEIN RUNDEN AUF DEN MONAT: Ein gerundeter Stichtag würde das Geburtsdatum zwar verschleiern, aber die
--   betroffene Person bis zu einem Monat über ihren 16. Geburtstag hinaus festhalten, und sie kann das
--   Datum nicht selbst berichtigen. Ein konkreter Nachteil für einen echten Menschen wiegt schwerer als
--   die Verschleierung eines Werts, der ohne den Pfeffer keiner Person zuzuordnen ist. Deshalb bleibt der
--   Tag exakt. Die Ehrlichkeit gehört in die Datenschutzerklärung, nicht in eine verlustbehaftete Umrechnung.
--
-- BERICHTIGUNG: admin_clear_age_block() (Block 10) hebt nur eine Sperre auf Antrag auf. Sie löscht kein
--   Geburtsdatum und stößt kein Profil an. Ohne sie könnte eine Sperre, die eine unbeteiligte Person trifft,
--   nicht aufgehoben werden. Ein falsch hinterlegtes Datum berichtigt admin_set_birthdate() (Support-Weg oben).
--
-- REIHENFOLGE: Diese Datei setzt die Altersregel vom 17.11. (20261117120000_age_ok_known_birthdate.sql)
--   voraus und ersetzt handle_new_user() aus 20261118160000_altersgrenze_nachbesserung.sql. Sie muss
--   also NACH 20261118160000 laufen. delete_my_account() und admin_delete_member() werden hier neu
--   gesetzt, und zwar mit dem Aufruf von remember_age_block() vor dem Löschen. Fehlt die Sperrliste,
--   fehlt auch dieser Schutz: Die Funktionen sind dann Alt-Fassungen, und das Löschen legt keine Zeile an.
--
-- HINWEIS ZUR SPALTE set_at: Sie ist entfernt, weil sie nirgends gelesen wird (Datensparsamkeit). Eine
--   Tabelle public.age_blocks, die schon mit set_at angelegt wurde, würde die Spalte behalten, denn
--   „create table if not exists“ ändert eine bestehende Tabelle nicht. Dann vorher
--   „alter table public.age_blocks drop column if exists set_at;“ ausführen. Heute gibt es die Tabelle
--   nirgends.
--
-- Einmal im Supabase SQL Editor ausführen, nach den Migrationen vom 13.11., 17.11. und 18.11.
--   (20261113120000 bis 20261113140000, 20261117120000, 20261118160000).
-- Läuft als Transaktion. Darf mehrfach laufen.
-- Die Migration erzeugt den Pfeffer nur, wenn er fehlt, und erzeugt ihn nie neu (siehe Block 2).
begin;

-- ---------- 1) Sicherheitsnetz ----------
-- age_ok() kommt aus 20261113140000 und 20261117120000, member_birthdates aus 20261113120000.
-- Fehlt eines davon, gibt es nichts, woran sich die Sperrliste messen lässt. Lieber hier mit klarer
-- Ansage abbrechen, als eine Sperre auf einer falschen Grundlage anzulegen.
do $$ begin
  if to_regprocedure('public.age_ok(uuid)') is null or to_regclass('public.member_birthdates') is null then
    raise exception 'Erst die Migrationen vom 13.11. und 17.11. einspielen (20261113120000 bis 20261113140000, 20261117120000), dann diese Migration.';
  end if;
end $$;

-- ---------- 1b) Dienstschlüssel: kein Zugriff auf die Geburtsdaten ----------
-- Gemessen in der Produktion: service_role hatte auf public.member_birthdates DELETE, INSERT, SELECT, UPDATE und
--   weitere Rechte. Diese Migration entzieht dem Dienstschlüssel die Rechte auf age_blocks, age_block_secret und die
--   Funktionen und begründet das jeweils mit einem abgeflossenen Dienstschlüssel. Die Tabelle member_birthdates blieb
--   dabei offen, obwohl ihr Primärschlüssel die einzige Sperre dagegen ist, dass ein Mitglied ein Lügendatum nachträgt
--   (siehe Block 10). Ein delete über die Schnittstelle mit dem Dienstschlüssel hätte genügt, danach hätte das Mitglied
--   ein beliebiges Datum nachtragen können.
-- Gefahrlos, weil der Server Geburtsdaten nie über den Dienstschlüssel liest oder schreibt: Geprüft wurde die ganze
--   Quelle des App-Servers auf dem Produktionsrechner. Dort kommt member_birthdates kein einziges Mal vor. Der Server
--   schreibt Geburtsdaten nur in seine eigene SQLite-Tabelle. Die Funktionen dieser Migration laufen als Eigentümer
--   und sind davon nicht betroffen.
-- Das Recht auf member_birthdates für anon und authenticated ist schon in 20261113120000 entzogen; hier kommt
--   service_role dazu.
revoke all on public.member_birthdates from service_role;

-- ---------- 2) Der Pfeffer ----------
-- Ein geheimer Wert, der in den Hash der E-Mail-Adresse eingeht. Ohne ihn ließe sich eine Adresse aus
--   der Sperrliste durch bloßes Durchprobieren zurückgewinnen. Mit ihm wird die Tabelle wertlos,
--   falls sie einmal allein abfließt.
create table if not exists public.age_block_secret (
  id     int primary key default 1 check (id = 1),
  pepper bytea not null
);
-- Zeilenschutz an, aber absichtlich OHNE Policy: Dann darf kein Mitglied die Zeile lesen, auch nicht
-- über eine Funktion, die anon oder authenticated aufrufen könnten.
alter table public.age_block_secret enable row level security;
revoke all on public.age_block_secret from anon, authenticated, service_role;
-- service_role ist hier mit gesperrt: Ein abgeflossener Dienstschlüssel soll den Pfeffer nicht lesen
--   können. Die Tabelle braucht der Server nie.
-- WICHTIG: "on conflict do nothing" ist hier nicht Kosmetik. Ein neuer Pfeffer würde jeden bestehenden
--   Hash ungültig machen und damit die ganze Sperrliste still entwerten: Keine Sperre griffe mehr,
--   und niemand würde es merken. Der Pfeffer darf nie neu erzeugt werden. Dieser Befehl legt ihn nur an,
--   wenn er fehlt. Bei jedem weiteren Lauf der Datei bleibt der bestehende Wert unangetastet.
insert into public.age_block_secret (id, pepper) values (1, extensions.gen_random_bytes(32))
  on conflict (id) do nothing;

-- ---------- 3) Die Sperrliste ----------
-- Bewusst KEIN Geburtsdatum: nur der Schlüssel (Hash der Adresse) und der Tag, an dem die Sperre endet
--   (der 16. Geburtstag). Die Zeile ist danach bedeutungslos und wird entfernt: bei jeder Anmeldung
--   (Block 8 in handle_new_user()) und bei jedem Löschen (Block 5 in remember_age_block()). Es gibt keinen
--   Zeitplaner; so räumt jede Anmeldung und jede Löschung auf, und die Aussage in der Datenschutzerklärung
--   stimmt ohne Zeitplaner.
-- Datensparsamkeit: Eine Spalte mit dem Zeitpunkt der Löschung (set_at) gibt es nicht. Sie wurde nirgends
--   gelesen, und die Datenschutzerklärung nennt nur Hash und Stichtag.
create table if not exists public.age_blocks (
  key           bytea primary key,
  blocked_until date not null
);
alter table public.age_blocks enable row level security;  -- absichtlich ohne Policy
revoke all on public.age_blocks from anon, authenticated, service_role;
-- service_role ist mit gesperrt, siehe Block 2. Ein abgeflossener Dienstschlüssel soll die Liste nicht
--   deanonymisieren können, auch wenn service_role an RLS vorbeikommt (rolbypassrls). Das Recht auf die
--   Tabelle fehlt aber schon, bevor RLS überhaupt greift.

-- ---------- 4) Der Schlüssel: gepfefferter Hash der E-Mail-Adresse ----------
-- Die Adresse wird vorher klein geschrieben und um Leerzeichen bereinigt. Sonst zählt „Max@x.de“ und
--   „max@x.de“ als zwei verschiedene Konten, und die Sperre umgeht man mit einer Großschreibung.
-- Der Zusatz nach einem „+“ (max+neu@x.de) wird vor dem Hash entfernt. Beide Adressen landen in derselben
--   Mailbox und beim selben Bestätigungs-Link. Ohne diesen Schritt wäre ein neuer Zusatz die billigste
--   Umgehung der Sperre.
-- WICHTIG: Jede Änderung an age_block_key() entwertet alle bestehenden Zeilen, weil sich der Schlüssel
--   ändert. Eine Zeile mit altem Schlüssel findet dann keine Adresse mehr, und die Sperre greift nicht.
--   Das geht nur jetzt gefahrlos, solange die Sperrliste leer ist. Später wäre eine Neuberechnung nötig,
--   die ohne die Klartext-Adressen unmöglich ist.
-- BEWUSST OFFEN: Punkte in Gmail-Adressen (ma.x@gmail.com gleich max@gmail.com) werden NICHT entfernt.
--   Das wäre anbieterspezifisches Raten und eine Altlast in der Pflege. Aus demselben Grund bleibt eine
--   völlig neue Adresse ein Weg, den die Sperrliste nicht verhindert.
create or replace function public.age_block_key(p_email text)
returns bytea language sql stable security definer set search_path = '' as $$
  select extensions.digest(
    (select s.pepper from public.age_block_secret s where s.id = 1)
      || convert_to(regexp_replace(lower(btrim(p_email)), '\+[^@]*@', '@'), 'UTF8'),
    'sha256')
$$;
-- Kein Ausführungsrecht für Mitglieder, sonst könnte jeder prüfen, ob eine fremde Adresse gesperrt ist.
revoke execute on function public.age_block_key(text) from public, anon, authenticated, service_role;

-- ---------- 5) Sperre setzen, vor dem Löschen eines Kontos ----------
-- Wird aus den beiden Löschwegen aufgerufen, VOR dem delete auf auth.users. Danach ist die E-Mail-Adresse
--   noch lesbar, und das Geburtsdatum hängt noch am Profil.
create or replace function public.remember_age_block(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_bd        date;
  v_email     text;
  v_confirmed timestamptz;
begin
  -- Abgelaufene Zeilen aufräumen, hier UNBEGRENZT (kein limit, kein skip locked). Das ist Absicht: Die Funktion
  --   läuft nur beim Löschen eines Kontos, in derselben Transaktion wie das Löschen selbst. Die Tabelle ist klein,
  --   denn sie enthält nur Zeilen für Konten unter 16 und wird bei jeder Anmeldung und Löschung weiter abgebaut.
  --   Begrenzt aufgeräumt wird nur in handle_new_user(), weil dort eine Anmeldung nicht warten soll.
  delete from public.age_blocks where blocked_until <= current_date;
  -- Kein Geburtsdatum hinterlegt: nichts tun. Es gibt dann nichts Ehrliches zu bewahren, und wir legen
  --   keine Spur über Leute an, die das nichts angeht.
  select b.birthdate into v_bd from public.member_birthdates b where b.id = p_user;
  if v_bd is null then return; end if;
  -- Schon 16: die Altersgrenze hat hier nichts mehr zu sperren.
  if (v_bd + interval '16 years')::date <= current_date then return; end if;
  -- Unbestätigte Adresse: keine Sperre. Eine unbestätigte Adresse ist kein Nachweis, dass sie der Person
  --   gehört. Ohne diese Bedingung wäre die Sperrliste eine Waffe gegen Unbeteiligte: Wer eine fremde
  --   Adresse besetzt und ein Datum unter 16 angibt, lässt die Sperre durch die berechtigte Löschung des
  --   Admins entstehen. Ein Angreifer kann eine fremde Adresse nicht bestätigen, deshalb schließt die
  --   Bedingung den Weg vollständig. Der Verlust ist zu verkraften: Ein unbestätigtes Konto kann sich
  --   ohnehin nicht anmelden, und Anbieter-Anmeldungen über Apple oder Google kommen bestätigt herein.
  -- WARNUNG (Vermerk zu diesem Block): Der Schutz gegen das Aussperren Unbeteiligter hängt vollständig daran,
  --   dass email_confirmed_at nur nach echter Verifikation gesetzt wird. Stand der Prüfung am laufenden
  --   Auth-Container: GOTRUE_MAILER_AUTOCONFIRM=false, GOTRUE_DISABLE_SIGNUP=false. Wird Autoconfirm je
  --   eingeschaltet oder ein Anbieter ergänzt, der unbestätigte Adressen zusichert, ist das Aussperren
  --   Unbeteiligter sofort wieder möglich.
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = p_user;
  if v_confirmed is null then return; end if;
  -- Ohne E-Mail-Adresse gibt es keinen Schlüssel. Dann nichts tun.
  if coalesce(btrim(v_email), '') = '' then return; end if;
  insert into public.age_blocks (key, blocked_until)
    values (public.age_block_key(v_email), (v_bd + interval '16 years')::date)
    on conflict (key) do update
      -- Die strengere, also spätere Sperre gewinnt. Ein zweites Löschen mit einem früheren Datum
      --   verkürzt eine bestehende Sperre nie, ein späteres verlängert sie.
      set blocked_until = greatest(public.age_blocks.blocked_until, excluded.blocked_until);
end;
$$;
revoke execute on function public.remember_age_block(uuid) from public, anon, authenticated, service_role;

-- ---------- 6) Konto löschen: Sperre vor dem Löschen setzen ----------
-- Grundlage: delete_my_account() aus supabase/017_security.sql (Zeilen 58-73), übernommen. Neu sind der
--   perform-Aufruf unmittelbar vor dem delete auf auth.users und das Auffangnetz darum.
-- Der perform steht in einem eigenen begin ... exception: Scheitert die Sperre (fehlt die Pfeffer-Zeile,
--   ist age_blocks nicht beschreibbar, fehlt extensions.digest), läuft das Löschen trotzdem weiter.
--   Abwägung: Eine fehlende Sperre ist ein Schaden, den die Admin-Prüfung über den Support abfangen kann.
--   Eine blockierte Löschung verletzt dagegen das Recht auf Löschung (Art. 17 DSGVO) und hilft niemandem.
--   Deshalb lieber eine fehlende Sperre als eine blockierte Löschung. Der Protokolleintrag hält die Lücke
--   sichtbar. Er enthält keine Adresse und kein Datum.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.';
  end if;
  if not public.mfa_ok() then
    raise exception 'Bitte bestätige zuerst deinen 2FA-Code.';
  end if;
  select email into v_email from auth.users where id = auth.uid();
  delete from public.newsletter where email = lower(v_email);
  begin
    perform public.remember_age_block(auth.uid());
  exception when others then
    raise log 'delete_my_account: Altersgrenzen-Sperre nicht gesetzt, Löschen läuft weiter (SQLSTATE %)', sqlstate;
  end;
  delete from auth.users where id = auth.uid();
end;
$$;
-- Die Ausführungsrechte setzen wir hier ausdrücklich neu. Dann stimmen sie, egal ob die Funktion vorher
--   schon existierte und mit welchen Rechten.
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- 7) Admin-Löschung: dieselbe Sperre wie bei der Selbstlöschung ----------
-- Grundlage: admin_delete_member() aus supabase/schema.sql (Zeilen 274-285), übernommen. Neu sind der
--   perform-Aufruf vor dem delete und das Auffangnetz darum (Begründung siehe Block 6). Ohne den Aufruf
--   wäre die Admin-Löschung der offene Nebeneingang: Ein Admin löscht ein unter-16-Konto, und die Sperre
--   entsteht nicht.
create or replace function public.admin_delete_member(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Nur für Admins.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Du kannst dich hier nicht selbst löschen.';
  end if;
  begin
    perform public.remember_age_block(p_id);
  exception when others then
    raise log 'admin_delete_member: Altersgrenzen-Sperre nicht gesetzt, Löschen läuft weiter (SQLSTATE %)', sqlstate;
  end;
  delete from auth.users where id = p_id;
end;
$$;
revoke execute on function public.admin_delete_member(uuid) from public, anon;
grant execute on function public.admin_delete_member(uuid) to authenticated;

-- ---------- 8) Anmeldung: Geburtsdatum aus der Sperrliste wiederherstellen ----------
-- Grundlage: handle_new_user() aus 20261118160000_altersgrenze_nachbesserung.sql, Rumpf übernommen.
--   Geändert sind die declare-Variablen, der Block direkt nach dem Einfügen in public.profiles (vor dem
--   bestehenden Block "if bd is not null and bd <= current_date") und die Aufräumzeile darin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date := public.birthdate_from_text(d->>'birthdate');
  v_until date;
  v_block_bd date;
begin
  insert into public.profiles (id, name, headline, about, phase, category, offer, seek,
                               linkedin, instagram, website, is_public)
  values (
    new.id,
    left(coalesce(nullif(d->>'name', ''), nullif(d->>'full_name', ''), ''), 80),
    left(coalesce(d->>'headline', ''), 120),
    left(coalesce(d->>'about', ''), 1500),
    case when d->>'phase' in ('idee', 'nebenberuflich', 'vollzeit', 'team') then d->>'phase' end,
    left(coalesce(d->>'category', ''), 60),
    left(coalesce(d->>'offer', ''), 600),
    left(coalesce(d->>'seek', ''), 600),
    public.normalize_url(d->>'linkedin'),
    public.normalize_url(d->>'instagram'),
    public.normalize_url(d->>'website'),
    coalesce((d->>'is_public')::boolean, false)
  );

  -- Sperrliste: Ein Konto, das schon einmal unter 16 gelöscht wurde, bekommt sein Datum zurück.
  --   Ohne diesen Block wäre die Löschung der Weg zurück in die Altersgrenze: Dieselbe Adresse meldet sich
  --   mit einem Lügendatum neu an, und das Datum gilt wieder.
  -- Die Anmeldung darf dabei NICHT scheitern. Kein raise nach außen: Wer gesperrt ist, bekommt ein Konto,
  --   aber kein Mitgliedsprofil. Das ist die bestehende Linie der App, weil Apple und Google kein
  --   Geburtsdatum liefern.
  -- Das Nachsehen steht in einem eigenen begin ... exception. Fällt es aus, wird das mit einem
  --   Protokolleintrag festgehalten, ohne Adresse und ohne Datum. Vorher schluckte es alles lautlos: Die
  --   Sperre war dann still abgeschaltet, ohne Spur im Protokoll.
  begin
    -- Fehlt der Pfeffer, liefert age_block_key() null, und der Vergleich unten findet nichts, ohne Fehler.
    --   Dieser Fall muss deshalb ausdrücklich als Fehler gelten, sonst bliebe er ohne Spur.
    if not exists (select 1 from public.age_block_secret s where s.id = 1) then
      raise exception 'Pfeffer fehlt';
    end if;
    select a.blocked_until into v_until from public.age_blocks a
     where a.key = public.age_block_key(new.email) and a.blocked_until > current_date;
    -- Aufräumen abgelaufener Sperren. Die Reihenfolge ist nicht sicherheitsrelevant. Der select nimmt nur Zeilen mit
    --   blocked_until > current_date, dieses delete nur Zeilen mit blocked_until <= current_date. Die beiden Bedingungen
    --   überschneiden sich nicht, die Umstellung ändert also an keinem Ergebnis etwas. Das delete steht hinter dem
    --   select aus Gründen der Lesbarkeit: Erst wird beantwortet, worum es geht (gibt es eine gültige Sperre?), dann
    --   wird aufgeräumt.
    -- Warum hier und nicht nur beim Löschen: Ohne diese Zeile läge eine abgelaufene Sperre liegen, bis jemand
    --   ein Konto löscht, und das kann Monate dauern. So räumt jede Anmeldung und jede Löschung auf. Die
    --   Aussage in der Datenschutzerklärung stimmt dadurch ohne Zeitplaner.
    -- Begrenzt und ohne Warten. Aufräumen darf keine Anmeldung aufhalten: limit 10 begrenzt die Arbeit, und
    --   for update skip locked überspringt Zeilen, die eine gleichzeitige Anmeldung gerade sperrt, statt darauf
    --   zu warten. Was übrig bleibt, räumt die nächste Anmeldung oder Löschung weg.
    -- Scheitert das Aufräumen, springt der begin/exception-Block dieser Stelle ein. Aufräumen darf keine
    --   Anmeldung kosten.
    delete from public.age_blocks where key in (
      select key from public.age_blocks where blocked_until <= current_date
       limit 10 for update skip locked);
    if v_until is not null then
      v_block_bd := (v_until - interval '16 years')::date;
      -- Das spätere Geburtsdatum ist das jüngere und damit das strengere. Trägt jemand bei der
      --   Neuanmeldung ein noch jüngeres Datum ein, bleibt dieses stehen.
      if bd is null or bd < v_block_bd then bd := v_block_bd; end if;
    end if;
  exception when others then
    -- Nur der SQLSTATE, ohne Adresse und ohne Datum: Das Protokoll ist unverschlüsselt und langlebig.
    raise log 'handle_new_user: Sperrlisten-Prüfung übersprungen, Anmeldung läuft weiter (SQLSTATE %)', sqlstate;
  end;

  -- Ein gültiges Datum wird jetzt immer übernommen, auch unter 16. Vorher wurde ein zu junges Datum
  -- still verworfen und anschließend aus den Metadaten gelöscht. Danach war das einzige belastbare
  -- Alterssignal weg, und die Person konnte über das Formular auf der Profilseite ein falsches Datum
  -- nachtragen, das angenommen wurde. Jetzt steht die Wahrheit in member_birthdates. Der
  -- Primärschlüssel verhindert jede Änderung, und profile_review_problem() hält das Profil mit dem
  -- Grund birthdate auf pending. Ein ungültiges Datum (nicht lesbar) wird weiter ignoriert. Daran
  -- scheitert keine Anmeldung.
  -- Zukunftsdatum: Es wird nicht gespeichert (siehe Kommentar oben bei Block 3). Ein Tippfehler wie
  -- 2027-01-01 wäre sonst unwiderruflich, weil der Primärschlüssel jede Korrektur verhindert.
  if bd is not null and bd <= current_date then
    insert into public.member_birthdates (id, birthdate) values (new.id, bd) on conflict (id) do nothing;
    update public.profiles set status = status where id = new.id and status = 'pending';
  end if;

  -- Kein Newsletter-Eintrag hier: seit 007 läuft jede Einwilligung über Brevo Double-Opt-in.

  -- Das Geburtsdatum kam als Anmelde-Metadatum herein. Supabase legt raw_user_meta_data als
  -- user_metadata in JEDES Access-Token – und das Token liegt als JS-lesbares Cookie für
  -- .xyntal.de. Das Geburtsdatum gehört nicht dorthin, es steht jetzt in member_birthdates.
  -- Deshalb hier entfernen, sobald es übernommen ist. Der Wert dort wäre ohnehin wertlos,
  -- weil Mitglieder user_metadata über auth.updateUser() selbst überschreiben können.
  -- Bewusst mit Auffangnetz: Das ist der einzige Schreibzugriff dieses Triggers auf auth.users.
  -- Fehlt dem Eigentümer der Funktion dort das Schreibrecht, würde sonst JEDE Registrierung
  -- scheitern – auch die ohne Geburtsdatum. Das Datum steht dann weiter in den Metadaten,
  -- aber niemand wird ausgesperrt. Das ist die richtige Reihenfolge der Übel.
  if d ? 'birthdate' then
    begin
      update auth.users set raw_user_meta_data = raw_user_meta_data - 'birthdate' where id = new.id;
    exception when others then null;
    end;
  end if;

  return new;
end;
$$;

-- ---------- 9) Nachtrag für den Bestand: bewusst leer ----------
-- Hier steht bewusst KEIN update. Konten, die heute unter 16 sind und ein Datum hinterlegt haben, sind
--   noch nicht gelöscht. Es gibt also nichts in die Sperrliste nachzutragen: Die Sperre entsteht erst
--   beim Löschen. Ein Update würde nur Zeilen treffen, die das Löschen noch nicht gesehen hat, und das
--   wäre eine Vermutung statt eines Befunds.

-- ---------- 10) Sperre auf Antrag löschen (nur Admin) ----------
-- Zweck: Wer zu Unrecht getroffen wird (eine recycelte Adresse, eine Familienadresse, die ein Kind benutzt
--   hat), braucht einen Ausweg. Die Datenschutzerklärung sagt Berichtigung über die Kontaktadresse zu
--   (Art. 16 und 17 DSGVO). Der Support muss außerdem feststellen können, OB eine Sperre der Grund ist.
-- ORAKEL: Ein Admin kann mit dieser Funktion herausfinden, ob eine Adresse gesperrt ist. Das ist gewollt,
--   denn genau das braucht der Support. Deshalb ausschließlich für Admins (Rechte unten).
-- Das Protokoll schreibt nur, DASS gelöscht wurde, und die ID des Admins. Die Adresse steht nicht darin.
--   Sonst würden Geburtsdaten Minderjähriger in Logs landen, die lange bestehen.
-- Diese Funktion löscht ausdrücklich KEIN Geburtsdatum. Sie entfernt nur die Zeile in public.age_blocks.
--   Der Primärschlüssel von member_birthdates ist die einzige Sperre dagegen, dass ein Mitglied ein Lügendatum
--   nachträgt. Wer die Zeile löscht, gibt das Nachtragen frei und hebt damit die ganze Altersgrenze auf -
--   gemessen. Ein falsch hinterlegtes Datum berichtigt der Admin mit public.admin_set_birthdate(p_id uuid,
--   p_birthdate text). Die Funktion ÜBERSCHREIBT das Datum, statt es zu löschen, stößt das Profil selbst neu
--   an und lässt die Sperre gegen das Nachtragen intakt. Beachte die Signatur: das zweite Argument ist text,
--   nicht date.
-- Kein Anstoß am Profil, keine Rückstufung, keine Karten-Abschaltung: Es verschwindet kein Datum, also ändert
--   sich am Konto nichts. Das Konto bleibt, wie es ist.
create or replace function public.admin_clear_age_block(p_email text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_key   bytea;
  v_found boolean;
begin
  if not public.is_admin() then raise exception 'Nur für Admins.'; end if;
  v_key := public.age_block_key(p_email);
  delete from public.age_blocks where key = v_key;
  v_found := found;
  raise log 'admin_clear_age_block: Sperre % durch %',
    case when v_found then 'entfernt' else 'nicht vorhanden' end, auth.uid();
  return v_found;
end;
$$;
-- service_role ist mit gesperrt: Das Standardrecht der Datenbank gibt ihr EXECUTE auf jede neue Funktion in public.
--   is_admin() hält den Aufruf zwar auf, der Entzug ist aber dieselbe Linie wie bei den Tabellen oben. Ein
--   abgeflossener Dienstschlüssel soll Sperren nicht aufheben können.
revoke execute on function public.admin_clear_age_block(text) from public, anon, service_role;
grant execute on function public.admin_clear_age_block(text) to authenticated;

commit;
