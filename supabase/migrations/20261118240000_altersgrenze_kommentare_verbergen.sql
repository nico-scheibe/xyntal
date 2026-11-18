-- Verbirgt Kommentare, Kommentar-Reaktionen, Beitrags-Likes, Börsen-Likes und Kommentare an Börse und Projekten
--   eines als unter 16 erkannten Kontos vor MITGLIEDERN und GÄSTEN. Admins sehen sie weiter.
--   Schließt den letzten Teil der Altersgrenze für 16: 20261118200000 deckt Beiträge, Börse und Projekte, 20261118230000
--   den Nachzug am Geburtstag. Diese Datei zieht die fünf Tabellen nach, die bisher nur eine Mitgliedschaft verlangen.
--
-- DIE LÜCKE: Die Leseregeln dieser fünf Tabellen prüfen für Mitglieder den BETRACHTER (is_approved_member()), nicht den
--   Urheber. Ein Mitglied über 16 sieht deshalb jeden Kommentar, jede Reaktion und jedes Like eines erkannten Kontos unter
--   16, auch an einem fremden, weiter sichtbaren Beitrag oder Projekt. Gemessen (Zeilenzahlen am 18.11.2026): post_comments 0,
--   post_comment_reactions 0, post_likes 0, listing_likes 1, content_comments 0. Der Nachtrag trifft also so gut wie nichts.
--   Die Maßnahme ist vorbeugend.
--
--   Betroffen sind GENAU diese fünf Tabellen, und jede ist einzeln geprüft. Nicht betroffen und bewusst NICHT angefasst:
--   event_rsvps (nur das Mitglied selbst und Admins), project_interest (nur das Mitglied und der Rollen-Inhaber) und
--   message_reactions (nur die zwei Beteiligten der Nachricht). Dort ist nichts für andere Mitglieder offen.
--
--   Urheber-Spalte je Tabelle, mit der die Spalte author_age_ok gefüllt wird:
--     post_comments           author_id   Leseregel "Kommentare lesen"               (003_community.sql:142)
--     post_comment_reactions  member_id   Leseregel "Kommentar-Reaktionen lesen"      (20261028230500:69)
--     post_likes             user_id     Leseregel "Likes lesen"                    (003_community.sql:159)
--     listing_likes          user_id     Leseregel "Listing-Likes lesen"            (008_listing_likes.sql:37)
--     content_comments        author_id   Leseregel "Comments follow parent visibility" (20261027163301:20)
--
-- DIE LÖSUNG: Eine Spalte author_age_ok je Tabelle, die in der Leseregel als zusätzliche Bedingung steht. Dasselbe Muster
--   wie bei posts, listings und projects (20261118200000), und aus demselben Grund: Eine Funktion, die zu einer fremden
--   Konto-Kennung das Alter beantwortet, wäre ein Orakel über das Alter jedes Kontos. Die Leseregel liest hier nur eine
--   Spalte der Zeile selbst. Die Spalte wird von sync_author_age_ok() gepflegt (Block 3), die Funktion hat kein
--   Ausführungsrecht für anon, authenticated oder service_role.
--
-- KEIN RECHT AUF DIE SPALTE: Diese Datei erteilt AUSDRÜCKLICH KEIN Recht auf author_age_ok. Gemessen (table_schema =
--   'public'): post_comments, post_likes, listing_likes und content_comments haben für authenticated nur spaltenweises
--   INSERT und kein UPDATE. Nur post_comment_reactions hat tabellenweites INSERT. Dort hätte ein Mitglied die neue Spalte
--   setzen können. Block 4b stellt diese eine Tabelle auf spaltenweise Rechte um, ohne author_age_ok. Danach kann authenticated die Spalte
--   auf keiner der fünf Tabellen nennen. Der Schutz hängt damit nicht allein an der restriktiven Altersregel.
--   Gelesen werden kann sie über das Tabellen-SELECT. Das ist unkritisch, weil die Leseregel eine Zeile mit false für
--   alle außer Admins ausblendet. Der Dienstschlüssel kann sie setzen, wie bei posts, listings und projects
--   (20261118200000, Kopf). Das ist ohne Belang, weil service_role die Zeilenschutzregeln ohnehin umgeht.
--
-- STANDARDWERT true: Anlegen setzt auf allen fünf Tabellen is_approved_member() oder is_active_member() voraus, und beide
--   enthalten age_ok(id) (20261118120000 bzw. 20261113140000). Wer anlegen darf, ist also über 16. Die Lücke entsteht nur,
--   wenn ein Konto später unter 16 wird. Das fängt der Nachtrag (Block 5) und der Trigger auf profiles (20261118230000) auf.
--   Bei post_comments, post_likes, post_comment_reactions und listing_likes greift zusätzlich die restriktive Regel
--   "Altersgrenze: nichts anlegen" (20261118140000, Liste dort Zeile 58-59). Bei content_comments gibt es diese Regel nicht.
--
-- WARUM content_comments KEINE RESTRIKTIVE REGEL HAT: Das ist kein Versehen, und eine Nachrüstung ist nicht nötig. Die
--   Anlege-Regel "Members comment on open visible content" (20261027163301) verlangt is_active_member(). Darin steckt
--   age_ok(id) (20261113140000, Zeile 110). Ein Konto unter 16 kann dort also nichts anlegen. Die Tabelle ist über die
--   Schnittstelle beschreibbar: authenticated hat INSERT auf project_id, listing_id und body (20261117150000, Zeile 77),
--   author_id kommt aus dem Standardwert auth.uid(). Die Altersprüfung hängt also an der Anlege-Regel. Wer hier eine
--   restriktive Regel ergänzt, bekommt eine zweite Prüfung, die nichts Neues tut. Dabei kann etwas anderes brechen.
--
-- DIE FÜNF LESEREGELN, ALLE MIT DEM ADMIN-ZWEIG AUSSEN: Die Form ist überall dieselbe wie bei posts: die bisherige Bedingung
--   in Klammern UND author_age_ok, der Admin-Zweig AUSSERHALB. Die Klammern sind Pflicht, sonst bindet "and" stärker als "or".
--   Rollen, aus den Migrationsdateien gelesen (pg_policies nicht abgefragt):
--     post_comments           "Kommentare lesen"                    to authenticated        (003_community.sql:142)
--     post_comment_reactions  "Kommentar-Reaktionen lesen"          to authenticated        (20261028230500:69)
--     post_likes              "Likes lesen"                         to authenticated        (003_community.sql:159)
--     listing_likes           "Listing-Likes lesen"                 to authenticated        (008_listing_likes.sql:37)
--     content_comments        "Comments follow parent visibility"   to anon, authenticated  (20261027163301:20)
--   Achtung: Im Befehl steht "to anon, authenticated" OHNE Klammern. Die Form {anon,authenticated} aus pg_policies ist kein
--   gültiges SQL. Die Rollen sind hier je Tabelle einzeln festgelegt.
--
-- DER ADMIN-ZWEIG BEI post_likes, listing_likes UND content_comments: Diese drei Leseregeln haben heute KEINEN Admin-Zweig.
--   Bei post_likes und listing_likes sieht ein Admin die Zeilen heute nur über is_approved_member(). Ohne den eigenen Zweig
--   würde er sie durch die neue Klausel verlieren. Der Zweig erhält diesen Zustand. Er erweitert nur für einen Admin, für
--   den is_approved_member() heute falsch ist (nicht freigeschaltet, gesperrt oder unter 16). Für diesen Admin sieht er dann
--   auch Likes, die er heute nicht sieht. Bei content_comments ist es eine Berichtigung: Die DELETE-Regel "Author or owner
--   moderates comments" (20261027163301:27) erlaubt einem Admin schon heute, jeden Kommentar zu löschen. Ein Admin, der löschen
--   darf, aber nicht sehen kann, ist widersinnig.
--   Bei post_comments und post_comment_reactions hat der Admin-Zweig schon heute gegolten. Er bleibt unverändert.
--
-- BEWUSSTE FOLGE, KEIN FEHLER: Ein zurückgehaltenes Konto (author_age_ok = false) sieht seine EIGENEN Kommentare, Reaktionen
--   und Likes nicht. Das ist beabsichtigt und soll nicht als Fehler "repariert" werden. Die Folge ist nicht endgültig:
--   author_age_ok wird in beide Richtungen nachgezogen. Die Zeilen bleiben vollständig in der Datenbank, nichts wird gelöscht.
--
-- SICHERHEITSNETZ UND REIHENFOLGE: Diese Datei setzt voraus: 20261118200000_altersgrenze_inhalte_verbergen (Spalten
--   author_age_ok auf posts, listings, projects; die drei Leseregeln) und 20261118230000_altersgrenze_inhalte_nachziehen
--   (sync_author_age_ok mit den drei Updates, der Trigger auf profiles). Fehlt eines davon, bricht die Migration ab.
--   Außerdem age_ok(uuid), is_approved_member(), is_active_member(), is_admin() und die fünf Tabellen selbst.
--
-- Läuft als Transaktion. Darf mehrfach laufen. Einmal im Supabase SQL Editor ausführen, nach 20261118230000.
begin;
-- Sperrzeit: Hält eine fremde Transaktion einen Lock auf einer dieser fünf Tabellen, bricht die Migration nach 5 Sekunden
--   ab, statt alle Zugriffe dahinter zu stauen. Bei 0 bis 1 Zeilen ist das sonst bedeutungslos.
set local lock_timeout = '5s';

-- ---------- 1) Sicherheitsnetz ----------
-- Fehlt eines der Vorgänger-Objekte, bricht die Migration ab, statt auf einer falschen Grundlage zu laufen.
do $$ begin
  if to_regprocedure('public.sync_author_age_ok(uuid)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'posts' and column_name = 'author_age_ok') then
    raise exception 'Erst 20261118200000 und 20261118230000 einspielen, dann diese Migration.';
  end if;
end $$;

-- ---------- Block 1: die Spalten ----------
-- Standardwert true, siehe Kopf. KEIN Recht auf die Spalte für authenticated oder anon (siehe Kopf).
alter table public.post_comments            add column if not exists author_age_ok boolean not null default true;
alter table public.post_comment_reactions   add column if not exists author_age_ok boolean not null default true;
alter table public.post_likes               add column if not exists author_age_ok boolean not null default true;
alter table public.listing_likes            add column if not exists author_age_ok boolean not null default true;
alter table public.content_comments         add column if not exists author_age_ok boolean not null default true;

-- ---------- Block 2: die fünf Leseregeln ----------
-- Namen und Rollen aus den Migrationsdateien (siehe Kopf). drop policy if exists trifft die laufende Regel.
-- Die Klammern sind Pflicht. Der Admin-Zweig steht AUSSEN.
drop policy if exists "Kommentare lesen" on public.post_comments;
create policy "Kommentare lesen" on public.post_comments
  for select to authenticated
  using (((select public.is_approved_member()) and author_age_ok) or (select public.is_admin()));

drop policy if exists "Kommentar-Reaktionen lesen" on public.post_comment_reactions;
create policy "Kommentar-Reaktionen lesen" on public.post_comment_reactions
  for select to authenticated
  using (((select public.is_approved_member()) and author_age_ok) or (select public.is_admin()));

-- Neuer Admin-Zweig, siehe Kopf: erhält den Zustand, für einen freigeschalteten, volljährigen Admin.
drop policy if exists "Likes lesen" on public.post_likes;
create policy "Likes lesen" on public.post_likes
  for select to authenticated
  using (((select public.is_approved_member()) and author_age_ok) or (select public.is_admin()));

-- Neuer Admin-Zweig, siehe Kopf.
drop policy if exists "Listing-Likes lesen" on public.listing_likes;
create policy "Listing-Likes lesen" on public.listing_likes
  for select to authenticated
  using (((select public.is_approved_member()) and author_age_ok) or (select public.is_admin()));

-- Parent-Sichtbarkeit wie bisher, Bedingung in Klammern mit author_age_ok. Neuer Admin-Zweig, siehe Kopf.
-- Rollen anon UND authenticated: Die Leseregel gilt für Gäste auf Beiträge an Börse und Projekten.
drop policy if exists "Comments follow parent visibility" on public.content_comments;
create policy "Comments follow parent visibility" on public.content_comments
  for select to anon, authenticated
  using (((exists(select 1 from public.projects p where p.id=project_id) or exists(select 1 from public.listings l where l.id=listing_id))
          and author_age_ok)
         or (select public.is_admin()));

-- ---------- Block 3: die eine Stelle, sync_author_age_ok(p_id), jetzt für alle acht Tabellen ----------
-- Die drei vorhandenen Updates aus 20261118230000 zeichengleich. Die fünf neuen sind hinten angehängt, mit der richtigen
--   Urheber-Spalte je Tabelle (siehe Kopf). "is distinct from" schreibt nur die Zeilen, deren Wert sich ändert.
-- Eine Stelle für alle acht Tabellen. Der Trigger auf profiles ruft diese Funktion. Damit ist auch für die fünf neuen
--   Tabellen das Nachziehen am 16. Geburtstag erledigt, ohne dass der Trigger geändert werden muss.
-- Die fünf Updates ändern nur author_age_ok. Die Trigger auf diesen Tabellen feuern dadurch nicht: Die Zähler-Trigger
--   sind AFTER INSERT OR DELETE, der Parent-Trigger ist BEFORE ... OF parent_id, der Schutzfilter ist BEFORE ... OF body,
--   und der Zeitfenster-Trigger liegt auf posts, nicht auf den fünf Tabellen.
create or replace function public.sync_author_age_ok(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.posts    set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.listings set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.projects set author_age_ok = public.age_ok(p_id) where owner_id  = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.post_comments           set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.post_comment_reactions  set author_age_ok = public.age_ok(p_id) where member_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.post_likes              set author_age_ok = public.age_ok(p_id) where user_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.listing_likes           set author_age_ok = public.age_ok(p_id) where user_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
  update public.content_comments        set author_age_ok = public.age_ok(p_id) where author_id = p_id and author_age_ok is distinct from public.age_ok(p_id);
end;
$$;
-- Ausdrücklich entzogen, wie in 20261118230000. Kein Ausführungsrecht für die Rollen der Anwendung und nicht für den
--   Dienstschlüssel. Aufgerufen wird die Funktion nur aus den Funktionen, die als Eigentümer laufen.
revoke execute on function public.sync_author_age_ok(uuid) from public, anon, authenticated, service_role;

-- ---------- Block 4: Indizes auf den Urheber-Spalten der fünf neuen Tabellen ----------
-- Der Primärschlüssel hilft nicht, weil die Urheber-Spalte dort an zweiter Stelle steht oder gar nicht vorkommt:
--   post_likes (post_id, user_id), listing_likes (listing_id, user_id), post_comment_reactions (comment_id, member_id, emoji).
--   Ein Index mit führendem user_id fehlt also. post_comments hat nur den Primärschlüssel auf (id). content_comments hat
--   bereits content_comments_author (author_id, created_at), dort ist nichts zu tun.
-- Die Funktion sucht bei jedem Speichern eines Profils die Zeilen dieses Urhebers in acht Tabellen. Ohne Index ist das je
--   ein vollständiger Scan. Für die drei ersten Tabellen wurde das in 20261118230000 gemessen: 0,11 ms je Speichern mit Index.
--   Die Namen folgen dem Muster <tabelle>_<spalte>_idx der bestehenden Indizes (zum Beispiel posts_author_idx). Kein
--   "concurrently": Die Tabellen sind klein, und die Migration läuft als Transaktion.
create index if not exists post_comments_author_idx           on public.post_comments (author_id);
create index if not exists post_likes_user_idx                on public.post_likes (user_id);
create index if not exists listing_likes_user_idx             on public.listing_likes (user_id);
create index if not exists post_comment_reactions_member_idx  on public.post_comment_reactions (member_id);

-- ---------- Block 4b: Rechte auf post_comment_reactions von tabellenweit auf spaltenweise ----------
-- DAS PROBLEM: authenticated hat auf post_comment_reactions TABELLENWEITES INSERT. Ein tabellenweites Recht gilt für jede
--   Spalte, auch für die neue author_age_ok. Die Lücke ist heute nicht ausnutzbar: Es gibt keine erlaubende UPDATE-Regel,
--   und das Anlegen sperrt die restriktive Regel "Altersgrenze: nichts anlegen" bereits für Konten unter 16. Der Schutz
--   soll aber nicht allein an dieser Regel hängen. Lockert sie jemand später, wäre die Spalte fälschbar.
-- NUR DIESE EINE TABELLE. Gemessen (table_schema = 'public') hat authenticated tabellenweit auf post_comment_reactions
--   DELETE, INSERT, SELECT. Auf post_likes, post_comments, listing_likes und content_comments nur DELETE und SELECT.
--   INSERT ist auf diesen vieren spaltenweise, UPDATE auf keiner der fünf tabellenweit. Deshalb bleibt Block 4b auf dieser
--   einen Tabelle. post_likes, post_comments, listing_likes und content_comments werden NICHT angefasst.
-- WARNUNG ZUR MESSUNG: Ohne Schema-Filter irreführt die Messung. Das Schema xyntal_app hat gleichnamige Tabellen
--   (post_likes, posts, projects, ...). Ohne table_schema = 'public' bekommt man doppelte Einträge und falsche Rechte.
--   Eine künftige Messung muss immer mit table_schema = 'public' laufen.
-- DIE LÖSUNG: Das Muster aus 20261117150000_tabellenrechte_zurueck.sql (spaltenweise Rechte statt tabellenweitem INSERT).
--   Die Spaltenliste entspricht dem, was laut Messung schon spaltenweise erteilt ist: comment_id, member_id, emoji,
--   created_at. author_age_ok steht in keiner Liste. DELETE und SELECT bleiben unangetastet. Kein UPDATE erteilen, es gibt
--   dort keine erlaubende UPDATE-Regel.
-- WAS DIE WEBSITE SENDET (nachgesehen): public/pages/community.js Zeile 297 sendet bei einer Reaktion nur { comment_id,
--   emoji }. member_id kommt aus dem Standardwert auth.uid(). Der Tausch bricht also nichts.
-- Ohne diesen Block kann ein Mitglied author_age_ok beim Anlegen einer Reaktion nennen. Mit diesem Block kann es die Spalte
--   gar nicht erst nennen.
revoke insert on public.post_comment_reactions from authenticated;
grant insert (comment_id, member_id, emoji, created_at) on public.post_comment_reactions to authenticated;

-- ---------- Block 5: Nachtrag für den Bestand, idempotent, in BEIDE Richtungen ----------
-- Spiegelt die Tatsache author_age_ok = age_ok(Urheber) für alle Zeilen der fünf neuen Tabellen. Ein zweiter Lauf findet
--   nichts mehr, solange sich an age_ok nichts geändert hat. Die drei Updates aus 20261118230000 bleiben unverändert.
-- Zeilen von Konten unter 16 werden false, Zeilen von Konten über 16 mit veraltetem Wert werden wieder true.
-- "is distinct from" macht einen zweiten Lauf zu einem No-op.
update public.post_comments          set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);
update public.post_comment_reactions set author_age_ok = public.age_ok(member_id) where author_age_ok is distinct from public.age_ok(member_id);
update public.post_likes             set author_age_ok = public.age_ok(user_id)   where author_age_ok is distinct from public.age_ok(user_id);
update public.listing_likes          set author_age_ok = public.age_ok(user_id)   where author_age_ok is distinct from public.age_ok(user_id);
update public.content_comments       set author_age_ok = public.age_ok(author_id) where author_age_ok is distinct from public.age_ok(author_id);

commit;
