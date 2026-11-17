-- Tabellenrechte in public auf die Absicht aus dem Repo zurücksetzen, Tabelle für Tabelle.
--
-- Warum das nötig ist: Auf der laufenden Datenbank haben anon und authenticated
-- INSERT, UPDATE, DELETE und TRUNCATE auf ALLEN Spalten dieser Tabellen. Das sind
-- Supabases Standardrechte, die beim Umzug von Supabase Cloud mitgekommen sind; die
-- gezielten revoke/grant-Zeilen aus dem Repo waren dort nie wirksam. RLS hält bisher
-- allein die Linie. Gleiches Muster wie 20261117140000_profiles_grants_zurueck.sql.
--
-- Soll-Zustand pro Tabelle: alle grant/revoke-Zeilen aus supabase/schema.sql,
-- supabase/0NN_*.sql und supabase/migrations/ (in dieser Reihenfolge, die spätere
-- Zeile gewinnt). Jeder Block entzieht anon und authenticated zuerst alle Rechte und
-- setzt dann nur den Soll-Zustand. Herkunft und Schreibzugriffe stehen im Kommentar
-- über jedem Block. Schreibzugriffe über sb.rpc(...) brauchen keine Tabellenrechte,
-- die Funktionen laufen als postgres.
--
-- Spalten, die eine Migration erst per ADD COLUMN einführt, bekommen ihren Grant nur,
-- wenn die Spalte existiert (do-Block mit information_schema.columns). Betroffen:
-- beta_applications.admin_note (20261025210417), mailed_status und mailed_at
-- (20261103140000), messages.reply_to, edited_at, deleted_at (20261028140000),
-- post_comments.edited_at und parent_id (20261028230500), project_interest.status
-- (20261028120000), projects.image_path (020_project_images.sql) und
-- waitlist_referrals.credited_at (014_admin_actions.sql).
--
-- Bewusst NICHT in dieser Migration:
--   profiles: eigene Migration 20261117140000.
-- Die drei Tabellen am Ende (waitlist_cards, beta_application_events, Xyntal) haben im
-- Repo keine grant-Zeile. Ihr Soll-Zustand ist deshalb aus den Policies und den
-- tatsächlichen Zugriffen abgeleitet und im jeweiligen Block begründet.
-- Sequenzen (zum Beispiel content_comments_id_seq, message_attachments_id_seq) werden
-- nicht angefasst; sie sind nicht Teil der Tabellenrechte.
-- service_role und postgres werden nicht angefasst.

begin;

-- ---------- beta_applications ----------
-- Rechte: lesen und löschen; Status aktualisieren; Notiz und Mail-Spalten nur bedingt.
-- Soll aus: 20261025210417_beta_admin_workflow.sql:27-29, 20261103140000_beta_status_mail.sql:9.
-- Schreibend zugreifend: public/pages/admin-people.js:530 (admin_note), :549 (delete),
-- public/pages/admin.js:437 (status); hosting/daki/server.cjs:413 (mailed_status,
-- mailed_at, PATCH mit dem Token des angemeldeten Admins). Anlegen über apply_for_beta.
revoke all on public.beta_applications from anon, authenticated;
grant select, delete on public.beta_applications to authenticated;
grant update (status) on public.beta_applications to authenticated;
do $$
declare c text;
begin
  foreach c in array array['admin_note', 'mailed_status', 'mailed_at'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'beta_applications' and column_name = c) then
      execute format('grant update (%I) on public.beta_applications to authenticated', c);
    end if;
  end loop;
end $$;

-- ---------- blocked_terms ----------
-- Rechte: lesen, eintragen, löschen (authenticated).
-- Soll aus: 20261028150000_content_safety.sql:14-15.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.blocked_terms from anon, authenticated;
grant select, insert, delete on public.blocked_terms to authenticated;

-- ---------- business_contracts ----------
-- Rechte: lesen, eintragen, ändern, löschen (authenticated); anon nichts.
-- Soll aus: 20261109150000_business_contracts.sql:63-64.
-- Schreibend zugreifend: public/pages/admin-contracts.js:295 (insert/update), :296 (insert),
-- :373 (delete).
revoke all on public.business_contracts from anon, authenticated;
grant select, insert, update, delete on public.business_contracts to authenticated;

-- ---------- content_comments ----------
-- Rechte: lesen für anon und authenticated; eintragen (project_id, listing_id, body) und
-- löschen für authenticated.
-- Soll aus: 20261027163301_content_comments.sql:15-18.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.content_comments from anon, authenticated;
grant select on public.content_comments to anon, authenticated;
grant insert (project_id, listing_id, body) on public.content_comments to authenticated;
grant delete on public.content_comments to authenticated;

-- ---------- event_rsvps ----------
-- Rechte: nur lesen (authenticated). Anmeldung läuft über set_event_attendance.
-- Soll aus: 006_events.sql:25, 29.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden (nur RPC).
revoke all on public.event_rsvps from anon, authenticated;
grant select on public.event_rsvps to authenticated;

-- ---------- event_signups ----------
-- Rechte: eintragen für anon und authenticated; lesen nur für authenticated.
-- Soll aus: schema.sql:143, 166, 167.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden. Lesen: public/pages/admin.js:45.
revoke all on public.event_signups from anon, authenticated;
grant insert on public.event_signups to anon, authenticated;
grant select on public.event_signups to authenticated;

-- ---------- events ----------
-- Rechte: lesen für anon und authenticated; eintragen und ändern (Spaltenliste) für authenticated.
-- Soll aus: 006_events.sql:25-28.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert (title, description, starts_at, place, address, is_public) on public.events to authenticated;
grant update (title, description, starts_at, place, address, is_public, cancelled) on public.events to authenticated;

-- ---------- listing_likes ----------
-- Rechte: lesen, eintragen (listing_id), löschen für authenticated.
-- Soll aus: 008_listing_likes.sql:32-35.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.listing_likes from anon, authenticated;
grant select on public.listing_likes to authenticated;
grant insert (listing_id) on public.listing_likes to authenticated;
grant delete on public.listing_likes to authenticated;

-- ---------- listings ----------
-- Rechte: lesen für anon und authenticated; eintragen, ändern (Spaltenliste) und löschen für authenticated.
-- Soll aus: 003_community.sql:111-112 (revoke), 172-175.
-- Schreibend zugreifend: kein Client; public/pages/nachrichten.js:2276 liest nur.
revoke all on public.listings from anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (type, category, title, body, is_public) on public.listings to authenticated;
grant update (type, category, title, body, is_public, closed) on public.listings to authenticated;
grant delete on public.listings to authenticated;

-- ---------- member_referrals ----------
-- Rechte: nur lesen (authenticated). Die service_role-Rechte aus 20261107220000 bleiben unberührt.
-- Soll aus: 20261107220000_member_invites.sql:26.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.member_referrals from anon, authenticated;
grant select on public.member_referrals to authenticated;

-- ---------- message_attachments ----------
-- Rechte: lesen, eintragen (Spaltenliste), löschen für authenticated.
-- Soll aus: 20261028140000_message_features.sql:307-311.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.message_attachments from anon, authenticated;
grant select on public.message_attachments to authenticated;
grant insert (message_id, path, kind, mime, size, name, width, height, duration)
  on public.message_attachments to authenticated;
grant delete on public.message_attachments to authenticated;

-- ---------- message_reactions ----------
-- Rechte: lesen, eintragen (message_id, emoji), löschen für authenticated.
-- Soll aus: 20261028140000_message_features.sql:233-236.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.message_reactions from anon, authenticated;
grant select on public.message_reactions to authenticated;
grant insert (message_id, emoji) on public.message_reactions to authenticated;
grant delete on public.message_reactions to authenticated;

-- ---------- messages ----------
-- Rechte: lesen; eintragen (recipient_id, body, reply_to); ändern (read_at, body, edited_at, deleted_at)
-- für authenticated. reply_to, edited_at und deleted_at nur bedingt.
-- Soll aus: 003_community.sql:111-112 (revoke), 195-197; 20261028140000_message_features.sql:34-35.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (recipient_id, body) on public.messages to authenticated;
grant update (read_at, body) on public.messages to authenticated;
do $$
declare c text;
begin
  foreach c in array array['reply_to'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'messages' and column_name = c) then
      execute format('grant insert (%I) on public.messages to authenticated', c);
    end if;
  end loop;
  foreach c in array array['edited_at', 'deleted_at'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'messages' and column_name = c) then
      execute format('grant update (%I) on public.messages to authenticated', c);
    end if;
  end loop;
end $$;

-- ---------- newsletter ----------
-- Rechte: nur lesen (authenticated). Eintragen läuft über subscribe_newsletter.
-- Soll aus: schema.sql:143, 176.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden. Lesen: public/pages/admin.js:46.
revoke all on public.newsletter from anon, authenticated;
grant select on public.newsletter to authenticated;

-- ---------- next_event ----------
-- Rechte: lesen für anon und authenticated; ändern (Spaltenliste) für authenticated.
-- Soll aus: schema.sql:143, 182-183.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.next_event from anon, authenticated;
grant select on public.next_event to anon, authenticated;
grant update (date_text, time_text, place, address, updated_at) on public.next_event to authenticated;

-- ---------- notifications ----------
-- Rechte: lesen und read_at ändern für authenticated.
-- Soll aus: 004_notifications.sql:21-23.
-- Schreibend zugreifend: public/notifications.js:112 und :121 (update read_at).
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- page_templates ----------
-- Rechte: keine. Das Repo vergibt keinen Grant, nur den Entzug.
-- Soll aus: 20261108210000_page_pro.sql:47.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden (kein Schreibzugriff von der Website, nur über RPC).
revoke all on public.page_templates from anon, authenticated;

-- ---------- page_versions ----------
-- Rechte: keine. Das Repo vergibt keinen Grant, nur den Entzug.
-- Soll aus: 20261108210000_page_pro.sql:35.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden (kein Schreibzugriff von der Website, nur über RPC).
revoke all on public.page_versions from anon, authenticated;

-- ---------- password_checks ----------
-- Rechte: keine. Nur die Prüffunktion greift darauf zu.
-- Soll aus: 018_open_projects_messages.sql:115.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden (kein Schreibzugriff von der Website, nur über RPC).
revoke all on public.password_checks from anon, authenticated;

-- ---------- post_comment_reactions ----------
-- Rechte: lesen, eintragen und löschen für authenticated.
-- Soll aus: 20261028230500_community_comment_features.sql:65-66.
-- Schreibend zugreifend: public/pages/community.js:297 (insert), :295, :299 (delete).
revoke all on public.post_comment_reactions from anon, authenticated;
grant select, insert, delete on public.post_comment_reactions to authenticated;

-- ---------- post_comments ----------
-- Rechte: lesen und löschen für authenticated; eintragen (post_id, body, parent_id);
-- ändern (body, edited_at). parent_id und edited_at nur bedingt.
-- Soll aus: 003_community.sql:111-112 (revoke), 138-140; 20261028230500_community_comment_features.sql:45, 88.
-- Schreibend zugreifend: public/pages/community.js:253 (delete), :357 (update body, edited_at),
-- :363 (update body), :386 und :390 (insert).
revoke all on public.post_comments from anon, authenticated;
grant select on public.post_comments to authenticated;
grant insert (post_id, body) on public.post_comments to authenticated;
grant update (body) on public.post_comments to authenticated;
grant delete on public.post_comments to authenticated;
do $$
declare c text;
begin
  foreach c in array array['parent_id'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'post_comments' and column_name = c) then
      execute format('grant insert (%I) on public.post_comments to authenticated', c);
    end if;
  end loop;
  foreach c in array array['edited_at'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'post_comments' and column_name = c) then
      execute format('grant update (%I) on public.post_comments to authenticated', c);
    end if;
  end loop;
end $$;

-- ---------- post_likes ----------
-- Rechte: lesen, eintragen (post_id), löschen für authenticated.
-- Soll aus: 003_community.sql:111-112 (revoke), 155-157.
-- Schreibend zugreifend: public/pages/community.js:217 (delete), :220 (insert).
revoke all on public.post_likes from anon, authenticated;
grant select on public.post_likes to authenticated;
grant insert (post_id) on public.post_likes to authenticated;
grant delete on public.post_likes to authenticated;

-- ---------- posts ----------
-- Rechte: lesen für anon und authenticated; eintragen und ändern (Spaltenliste) und löschen für authenticated.
-- Soll aus: 003_community.sql:111-112 (revoke), 115-118.
-- Schreibend zugreifend: public/pages/community.js:190 (insert), :248 (delete).
revoke all on public.posts from anon, authenticated;
grant select on public.posts to anon, authenticated;
grant insert (kind, body, is_public) on public.posts to authenticated;
grant update (kind, body, is_public) on public.posts to authenticated;
grant delete on public.posts to authenticated;

-- ---------- profile_links ----------
-- Rechte: keine. Das Repo vergibt keinen Grant; Lesen und Schreiben laufen nur über Funktionen.
-- Soll aus: 20261107250000_link_page.sql:25.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden (kein Schreibzugriff von der Website, nur über RPC).
revoke all on public.profile_links from anon, authenticated;

-- ---------- project_interest ----------
-- Rechte: lesen, eintragen (role_id, note), löschen für authenticated; status nur bedingt.
-- Soll aus: 009_projects.sql:98, 155-157; 20261028120000_application_status.sql:11.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.project_interest from anon, authenticated;
grant select on public.project_interest to authenticated;
grant insert (role_id, note) on public.project_interest to authenticated;
grant delete on public.project_interest to authenticated;
do $$
declare c text;
begin
  foreach c in array array['status'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'project_interest' and column_name = c) then
      execute format('grant update (%I) on public.project_interest to authenticated', c);
    end if;
  end loop;
end $$;

-- ---------- project_roles ----------
-- Rechte: lesen für anon und authenticated; eintragen, ändern (Spaltenliste) und löschen für authenticated.
-- Soll aus: 009_projects.sql:98, 128-131.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.project_roles from anon, authenticated;
grant select on public.project_roles to anon, authenticated;
grant insert (project_id, name, need, hours) on public.project_roles to authenticated;
grant update (name, need, hours, filled) on public.project_roles to authenticated;
grant delete on public.project_roles to authenticated;

-- ---------- projects ----------
-- Rechte: lesen für anon und authenticated; eintragen, ändern (Spaltenliste) und löschen für authenticated.
-- image_path nur bedingt.
-- Soll aus: 009_projects.sql:98, 101-104; 020_project_images.sql:11-12.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.projects from anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert (title, pitch, body, phase, place, is_public) on public.projects to authenticated;
grant update (title, pitch, body, phase, place, is_public, closed) on public.projects to authenticated;
grant delete on public.projects to authenticated;
do $$
declare c text;
begin
  foreach c in array array['image_path'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'projects' and column_name = c) then
      execute format('grant insert (%I) on public.projects to authenticated', c);
    end if;
  end loop;
  foreach c in array array['image_path'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'projects' and column_name = c) then
      execute format('grant update (%I) on public.projects to authenticated', c);
    end if;
  end loop;
end $$;

-- ---------- site_settings ----------
-- Rechte: lesen und ändern für authenticated. Schreiben ist per RLS auf Admins begrenzt
-- (Policy "Einstellungen verwalten", is_admin()).
-- Soll aus: 20261105110000_auto_approve_profiles.sql:32-33.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden.
revoke all on public.site_settings from anon, authenticated;
grant select, update on public.site_settings to authenticated;

-- ---------- waitlist_referrals ----------
-- Rechte: lesen und löschen für authenticated; Gutschrift-Zeitpunkt (credited_at) nur bedingt ändern.
-- Soll aus: 013_waitlist_perks.sql:34; 014_admin_actions.sql:11-12.
-- Schreibend zugreifend: public/pages/admin.js:403 (update credited_at), :407 (delete).
revoke all on public.waitlist_referrals from anon, authenticated;
grant select, delete on public.waitlist_referrals to authenticated;
do $$
declare c text;
begin
  foreach c in array array['credited_at'] loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'waitlist_referrals' and column_name = c) then
      execute format('grant update (%I) on public.waitlist_referrals to authenticated', c);
    end if;
  end loop;
end $$;

-- ---------- waitlist_referrers ----------
-- Rechte: lesen und löschen für authenticated.
-- Soll aus: 013_waitlist_perks.sql:34.
-- Schreibend zugreifend: kein Client per Tabellen-Zugriff gefunden; lesen: public/pages/admin.js:53.
revoke all on public.waitlist_referrers from anon, authenticated;
grant select, delete on public.waitlist_referrers to authenticated;

-- ---------- waitlist_cards ----------
-- Im Repo steht für diese Tabelle keine grant-Zeile; der Soll-Zustand unten ist deshalb
-- aus dem abgeleitet, was wirklich darauf zugreift, und aus den Policies.
-- Alle vier Policies auf der Tabelle verlangen is_admin() und gelten nur für authenticated
-- ("Karten lesen (Admins)", "Karten bearbeiten (Admins)", "Karten löschen (Admins)", dazu
-- "2FA erzwingen" als einschränkende Regel). anon hat gar keine Policy, kann die Tabelle
-- also schon heute nicht lesen -- die öffentliche Karte kommt über get_public_card() und
-- get_member_cards(), beide security definer. Eine INSERT-Policy gibt es nicht, Karten
-- entstehen über Funktionen.
-- Schreibend zugreifend, ausschließlich die Admin-Oberfläche:
--   public/pages/admin.js:250 und :354 (note), :277 (is_public), :292 (handle),
--   :323 und :336 (delete), :50 (select *); public/pages/admin-people.js:475 (handle).
-- is_public bleibt absichtlich schreibbar: Der Trigger member_cards_public prüft bei jedem
-- Schreibvorgang die Altersfreigabe, auch beim Admin. Das Recht ist hier die Hand, die
-- Prüfung sitzt im Trigger.
revoke all on public.waitlist_cards from anon, authenticated;
grant select on public.waitlist_cards to authenticated;
grant update (note, is_public, handle) on public.waitlist_cards to authenticated;
grant delete on public.waitlist_cards to authenticated;

-- ---------- beta_application_events ----------
-- Kommt im Repo nicht vor: keine Definition, keine grant-Zeile, kein Client-Zugriff.
-- Auf der Datenbank existiert sie (id, user_id, email_hash, event, status, created_at),
-- ist leer und hat eine Lese-Policy "Bewerbungsverlauf lesen (Admins)". Geschrieben wird
-- sie von den Triggern auf beta_applications, die als Eigentümer laufen.
-- Also: lesen ja (die Policy begrenzt es auf Admins), schreiben nein.
revoke all on public.beta_application_events from anon, authenticated;
grant select on public.beta_application_events to authenticated;

-- ---------- Xyntal ----------
-- Kommt im Repo nicht vor. Auf der Datenbank eine leere Tabelle mit genau zwei Spalten
-- (id, created_at) -- das ist der Zuschnitt, den Supabase einer neu angelegten Tabelle
-- gibt. Sie hat nur die einschränkende Regel "2FA erzwingen" und keine erlaubende Policy,
-- es kommt also ohnehin niemand an sie heran. Hier nur die Rechte wegnehmen; ob die
-- Tabelle weg kann, entscheidet der Mensch, nicht diese Migration.
revoke all on public."Xyntal" from anon, authenticated;

commit;
