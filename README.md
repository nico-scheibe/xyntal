# Xyntal – Website

Website von Xyntal – der Plattform, auf der Entwickler, Designer, Gründer und alle, die etwas aufbauen wollen, ihr Team finden und gemeinsam Projekte starten. Mit Mitgliederprofilen, Projekten mit offenen Rollen, Community, Newsletter und Treffen.
Daten und Login laufen über **Supabase** (Projekt „Xyntal“, Organisation „noxi“).

## Lokal ansehen

```sh
python3 server.py
```

Dann http://localhost:4173 öffnen. Der Server liefert nur die Dateien aus `public/` aus.

## Aufbau

| Datei / Ordner | Inhalt |
|---|---|
| `public/` | Die komplette Website (HTML, CSS, JS) – das ist alles, was online muss |
| `public/config.js` | Supabase-Adresse und öffentlicher Schlüssel |
| `public/front.css` | Startseite: dunkles Grau (#1C1C1C), Off-White (#ECEAE4), Serifen-Überschriften (Source Serif 4), Text in IBM Plex Sans, Mono für Kapitelnummern und Labels, Blau (#8FB8FF) als einzige Signalfarbe. Einstieg mit Status-Zeile und drei erfundenen Mitgliedern als echte Xyntal-Karten (gefächert, `xcard.js`/`xcard.css`/`banners.css`, Porträts aus der App-Demo verkleinert in `public/samples/`; Klick holt die nächste nach vorn, sonst wechselt der Fächer alle sechs Sekunden), „Wen du hier findest“ (drei Spalten mit Linien), Zitat, nummerierte Fragen und Antworten, Zugang, Newsletter. Keine Verläufe, kein Glas; Einblenden beim Laden und Scrollen (`.reveal`, landing.js), bei `prefers-reduced-motion` ohne Bewegung |
| `public/brief.html`, `public/brief.css` | Der Brief von Nico als eigene Seite (`/brief`): eine schmale Textspalte in Serifenschrift |
| `public/cosmos.css`, `public/backdrop.css`, `public/site-header.css`, `public/site-footer.css` | Gemeinsame Ebene der Unterseiten, Hintergrund, Kopf- und Fußzeile – dasselbe Grau, dieselben Schriften wie die Startseite |
| `public/landing.js` | Startseite: Newsletter-Formular (Brevo), Einladungslink; die Swipe-Demo läuft nur noch auf Seiten mit `[data-demo]` |
| `public/link-icons.js`, `public/link-editor.js`, `public/linkpage.css` | Linktree-Seite: Symbole und Erkennung aus der Adresse (`link-icons.js`), Editor im Bereich „Deine Links“ von `/meine-karte` (anlegen, ordnen, ausblenden, speichern; `link-editor.js`), Aussehen der Link-Schaltflächen und des Editors (`linkpage.css`). `u.js` zeigt die Links einspaltig unter der Karte und zählt Klicks; ohne eigene Links erscheinen LinkedIn, Instagram und Website aus dem Profil |
| `supabase/schema.sql` | Datenbank: Tabellen, Zugriffsregeln, Funktionen (bereits ausgeführt) |
| `supabase/002_login_methods.sql` | Ergänzung für Google/Apple/LinkedIn/Handy-Login (bereits ausgeführt) |
| `supabase/003_community.sql` | Community: Feed, Kommentare, Likes, Börse, Direktnachrichten (bereits ausgeführt) |
| `supabase/004_notifications.sql` | Benachrichtigungen mit RLS und Triggern; nach 003 im SQL Editor ausführen |
| `supabase/005_profile_avatars.sql` | Privater Profilbild-Speicher und Sichtbarkeitsregeln; am 20.10.2026 ausgeführt |
| `supabase/006_events.sql` | Mehrere Treffen, private Zusagen und RPCs; am 20.10.2026 ausgeführt |
| `supabase/007_newsletter_double_opt_in.sql` | Anmeldung schreibt nicht mehr direkt in den Newsletter; **noch auszuführen** (siehe `UEBERGABE-NEWSLETTER.md`) |
| `supabase/008_listing_likes.sql` | Reaktionen auf Börsen-Einträge |
| `supabase/009_projects.sql` | Projekte mit offenen Rollen und „Ich wäre dabei“-Meldungen; **noch auszuführen** |
| `supabase/011_waitlist_cards.sql` | Xyntal-Karten von der Warteliste, nur für Admins lesbar; ausgeführt am 25.10.2026 |
| `supabase/012_waitlist_cards_more.sql` | Karten: Stadt, Arbeitsweise, Erfahrung, Link (Foto und Gestaltung bleiben im Browser) |
| `supabase/013_waitlist_perks.sql` | Wunsch-Link (xyntal.de/name, eindeutig) und Einladungen: Code pro Adresse, geworbene Adressen; nur Admins lesen |
| `supabase/014_admin_actions.sql` | Admins können Einladungen gutschreiben (nur `credited_at`) |
| `supabase/015_public_cards.sql` | Wunsch-Links öffnen: `xyntal.de/name` zeigt die Karte nur mit Zustimmung (`is_public`), sonst „reserviert“; `get_public_card` liefert nur öffentliche Felder |
| `supabase/016_account_cards.sql` | Karte mit Konto verknüpfen: nach Login mit derselben (bestätigten) E-Mail Karte laden/ändern (`get_my_card`, `save_my_card`); öffentliches Profil zeigt zusätzlich Über mich, Angebot, Suche, Links und Profilbild |
| `supabase/017_security.sql` | Sicherheit im Profil: 2FA (Authenticator-App) wird in allen Tabellen, Admin-Rechten und beim Löschen durchgesetzt; `verify_my_password` prüft das aktuelle Passwort (max. 5 Versuche / 15 Min.) |
| `supabase/018_open_projects_messages.sql` | Projekte anlegen, für Rollen melden und Nachrichten schreiben schon mit bestätigtem Konto (ohne Freischaltung); Abgelehnte ausgeschlossen; Spam-Grenzen: 5 Projekte/Tag, 30 Nachrichten und 3 neue Gespräche pro Stunde |
| `supabase/010_beta_applications.sql` | Beta-Programm: Bewerbungstabelle (ursprünglich ohne Konto), lesen und bewerten nur Admins |
| `supabase/migrations/20261103120000_beta_requires_account.sql` | Beta-Programm: Bewerbung nur mit Konto (`apply_for_beta` nur für `authenticated`, `user_id` je Bewerbung, `get_my_beta_application` für den eigenen Stand) |
| `supabase/migrations/20261103130000_beta_accepted_sets_badge.sql` | Beta-Programm: Status „angenommen“ setzt den Beta-Tester-Badge per Trigger |
| `supabase/migrations/20261103140000_beta_status_mail.sql` | Beta-Programm: Spalten `mailed_status`/`mailed_at` für Status-Mails über IONOS; **noch auszuführen** |
| `supabase/migrations/20261103160000_account_requires_beta_application.sql` | Beta-Programm: Bewerbung ist Pflicht für jedes Konto (`beta_application_required`, `is_active_member` verlangt sie für neue Konten); **noch auszuführen** |
| `supabase/migrations/20261103170000_banned_accounts.sql` | Gesperrte Konten (Bann aus dem App-Admin, Spalten `profiles.banned`/`banned_until`, vom App-Server gesetzt): kein Ändern von Profil und Karte, Karte und Profil für andere unsichtbar (nicht gelöscht), keine Mitgliedsrechte; **noch auszuführen** |
| `supabase/migrations/20261103180000_website_ban.sql` | Sperren im Website-Admin (`admin_set_ban`, befristet oder unbefristet, `ban_active` lässt befristete Sperren von selbst enden); danach ausführen, **noch auszuführen** |
| `supabase/migrations/20261105110000_auto_approve_profiles.sql` | Profile automatisch freischalten: `pending` wird `approved`, sobald Name (≥ 2 Zeichen) und „Woran arbeitest du?“ (≥ 10 Zeichen) stehen, die E-Mail bestätigt ist **oder** die Anmeldung über Apple/Google läuft (verborgene Apple-Adressen bekommen keine Bestätigungsmail), das Konto nicht gesperrt ist und kein Text gegen `content_problem` verstößt. Eine Admin-Entscheidung (`admin_set_status`) sperrt die Automatik für dieses Profil (`review_locked`). Abschalten: `site_settings.auto_approve_profiles`. `my_profile_review()` nennt dem Mitglied, was noch fehlt. Schickt bestehende wartende Profile einmal durch die Prüfung; **noch auszuführen** |
| `supabase/migrations/20261105120000_auto_approve_without_content_filter.sql` | Fix dazu: Die Standard-Prüfung nutzt den Schutzfilter `content_problem` nur, wenn `20261028150000_content_safety.sql` ausgeführt ist (sonst scheiterte das Speichern wartender Profile); **direkt nach der vorigen ausführen** |
| `supabase/migrations/20261107120000_card_banners_premium.sql` | Kartenbanner und Paid-Extras: `profiles.is_premium` (setzt der App-Server per Service Role alle 5 Minuten aus dem Tarif, oder ein Admin per `admin_set_premium`; Mitglieder nicht selbst), eigenes Banner-Bild in `profiles.banner_path` + privater Bucket `banners` (JPG/PNG/WebP/GIF, 4 MB, nur mit Paid hochladbar), Profilbilder mit Paid auch als GIF/WebP (Bucket `avatars` bis 4 MB). `get_member_cards` / `get_public_card` liefern `is_premium` und `banner_path`; Banner-Vorlagen stehen in `design.banner` (Liste in `public/banners.js`). Nach `20261103180000_website_ban.sql`; **noch auszuführen** |
| `supabase/migrations/20261107140000_admin_premium.sql` | Admins haben immer die Paid-Extras: ein Trigger hält `profiles.is_premium` bei `is_admin` auf true (auch gegen den Tarif-Abgleich der App), bestehende Admins werden einmal gesetzt. Nach `20261107120000_card_banners_premium.sql`; **noch auszuführen** |
| `supabase/migrations/20261107150000_banner_video.sql` | Eigenes Banner auch als Video: `banner_path` und die Upload-Regel erlauben `.mp4`/`.webm`, Bucket `banners` nimmt `video/mp4`/`video/webm` bis 12 MB (die Seite prüft Dauer ≤ 30 s). Nach `20261107120000_card_banners_premium.sql`; **noch auszuführen** |
| `supabase/migrations/20261107160000_banner_video_limits.sql` | Banner-Video je Tarif: `profiles.plan` (spiegelt der App-Server per Service Role alle 5 Minuten aus dem Tarif, `premiumSync.ts`, oder ein Admin per `admin_set_plan`; Mitglieder nicht selbst), `banner_video_limit_bytes(plan, admin)` (Plus 25 MB, Pro 60 MB, Ultra 150 MB, Enterprise 500 MB, Admins ohne Grenze; Sekunden dazu in `public/banners.js`), Bucket `banners` auf 512 MB, die Upload-Regel prüft die Größe eines Videos gegen den Tarif. Nach `20261107150000_banner_video.sql`; **noch auszuführen** |
| `supabase/migrations/20261107170000_avatar_video.sql` | Profilbild auch als Video (MP4/WebM, stumm in Schleife) und Grenzen je Tarif: `avatar_path`, Bucket `avatars` (512 MB) und die Upload-Regel erlauben `.mp4`/`.webm`; `avatar_video_limit_bytes` (Plus 10 MB, Pro 25 MB, Ultra 60 MB, Enterprise 150 MB) und `avatar_animated_limit_bytes` für GIF/WebP (Plus 4 MB, Pro 8 MB, Ultra 16 MB, Enterprise 32 MB), Admins ohne Grenze; Sekunden dazu in `public/avatars.js`. Nach `20261107160000_banner_video_limits.sql`; **noch auszuführen** |
| `supabase/migrations/20261107190000_banner_limits_table.sql` | Banner mit denselben Grenzen je Tarif wie das Profilbild: Video Plus 10 MB · 15 s, Pro 25 MB · 30 s, Ultra 60 MB · 60 s, Enterprise 150 MB · 2 min; GIF/WebP 4 / 8 / 16 / 32 MB; Admins ohne Grenze (`banner_video_limit_bytes` neu, Upload-Regel prüft auch GIF/WebP). `get_member_cards` liefert `avatar_path` mit (Profilbild auf den Karten in der App). Nach `20261107170000_avatar_video.sql`; **noch auszuführen** |
| `supabase/migrations/20261107200000_cards_always_public.sql` | Mitgliederkarten sind immer öffentlich: Ein Trigger setzt `waitlist_cards.is_public` bei Karten mit Konto auf „hat einen Wunsch-Link“ (für `save_my_card` wie für den App-Server); meine-karte und die App verlangen deshalb einen Wunsch-Link. Ein Admin kann eine Karte weiter ausblenden, bis das Mitglied sie neu speichert. Bestehende Mitgliederkarten mit Link werden einmal öffentlich. Wartelisten-Karten ohne Konto bleiben unverändert. Nach `20261107190000_banner_limits_table.sql`; **noch auszuführen** |
| `supabase/migrations/20261107210000_account_without_beta_application.sql` | Konto ohne Beta-Bewerbung: `beta_application_required()` liefert immer false, damit neue Konten aus dem Login-Panel nicht auf `/beta?pflicht=1` landen und `is_active_member()` keine Bewerbung mehr verlangt. Nach `20261107200000_cards_always_public.sql`; **noch auszuführen** |
| `supabase/migrations/20261107220000_member_invites.sql` | Einladungsprogramm nur mit Konto: Der persönliche Link ist der Wunsch-Link `xyntal.de/deinname`. `claim_referral(handle)` löst die Einladung ein (nur neue Konten ≤ 7 Tage mit bestätigter E-Mail, nicht selbst, nicht bei gesperrten Werbenden, max. 4 pro Werbende:r in 3 Monaten), `get_my_invites()` liefert den eigenen Stand, `member_referrals` lesen nur Admins. Den alten E-Mail-Code (`?ref=`, `waitlist_referrals`) gibt es nicht mehr. 7 Tage Plus für beide bucht der App-Server (`referralSync.ts`) und setzt `*_credited_at`. Frontend: `public/invite.js` (Box auf Startseite und /meine-karte), Link-Name merkt `u.js`, Einlösen in `account-menu.js`; Test `tests/member_invites.sql`. Nach `20261107210000_account_without_beta_application.sql`; **noch auszuführen** |
| `supabase/migrations/20261107250000_link_page.sql` | Linktree-Seite unter `xyntal.de/name`: Tabelle `profile_links` (Titel, Adresse nur http/https, Symbol, Reihenfolge, ausblendbar, Klickzähler), nur über Funktionen zugänglich: `get_my_links`, `save_my_links` (ersetzt die Liste, behält Ids und Klicks, Grenze 15 Links, mit Paid/Admin 100), `track_link_click`. `get_public_card` liefert `links` (nur aktive, ohne Klickzahlen); Klickzahlen sieht nur, wer Paid/Admin ist. Test: `tests/link_page.sql`. Nach `20261107210000_account_without_beta_application.sql`; **noch auszuführen** |
| `supabase/migrations/20261108110000_custom_page.sql` | Freie Seite unter `xyntal.de/name`: `waitlist_cards.page` (Layout als JSON: Hintergrund, Höhe, Elemente Text/Link/Bild mit Position, Größe, Farben), `get_my_page`/`save_my_page` (prüft Typen, Anzahl – Free 20, Paid 100 –, eigene Bildpfade), `get_public_card` liefert `page`, öffentlicher Bucket `page-media` (JPG/PNG/WebP/GIF ≤ 3 MB, nur im eigenen Ordner), `meine-seite` als Wunsch-Link gesperrt. Editor: öffnet sich direkt auf `xyntal.de/name` (Adresse mit `#gestalten`, Knopf „Seite frei gestalten“ für die Besitzerin bzw. den Besitzer; `u.js` lädt `page-editor.js/.css`; `meine-seite.html` leitet nur dorthin weiter) – Ziehen, Skalieren, Drehen, Fenster/Text/Link/Bild, Rückgängig, Bild-Upload; Darstellung für Editor und Seite gemeinsam in `page-canvas.js/.css`. Tests: `tests/custom_page.sql`, `tests/custom-page.cjs`. Nach `20261108100000_link_text_entries.sql`; **noch auszuführen** |
| `supabase/migrations/20261108120000_page_blocks.sql` | Freie Seite: die Bausteine der Profilseite (Karte, Steckbrief, Über mich, Ich biete, Ich suche, Skills) sind als Elemente `type: block` mit `kind` frei platzierbar; `save_my_page` erlaubt sie. Der Editor liegt direkt auf der Profilseite (kein eigenes Layout mehr), Werkzeugleiste unten, Eigenschaften nur bei Auswahl. Nach `20261108110000_custom_page.sql`; **noch auszuführen** |
| `supabase/migrations/20261108130000_page_more_elements.sql` | Freie Seite: mehr Elemente – Formen (`shape`: Rechteck, Kreis, Linie, Verlauf), Knopf mit eigener Adresse (`button`, nur http/https), Link-Symbole (`icons`: alle aktiven Links als Symbole) und Einbettungen (`embed`: YouTube, Vimeo, Spotify, nur geprüfte Ids); Rahmen und Schatten für alle Elemente. Menü „+ Mehr“ im Editor mit Vorlagen (Überschrift, Zitat, Sticker, Badge, Info-Fenster). CSP `frame-src` um `open.spotify.com` erweitert (`hosting/daki/server.cjs`, wirkt nach Daki-Neustart). Nach `20261108120000_page_blocks.sql`; **noch auszuführen** |
| `supabase/migrations/20261108140000_page_animations.sql` | Freie Seite: Animationen pro Element (`anim`): zwölf fertige Effekte (Einblenden, Von unten, Von links, Heranzoomen, Schweben, Pulsieren, Hüpfen, Wackeln, Schütteln, Drehen, Leuchten, Farbwechsel) oder eigener Code in einer Mini-Sprache (`verschieben`, `drehen`, `skalieren`, `schräg`, `deckkraft`, `unschärfe`, `farbton`, `helligkeit`, `farbe`, `hintergrund`; Schritte in Prozent). Auslöser beim Laden, beim Scrollen oder bei Maus; Dauer, Verzögerung, Wiederholung. Das CSS baut `public/page-canvas.js` (`compileAnim`) nur aus geprüften Zahlen und `#rrggbb`-Farben; `save_my_page` prüft Effektname, Länge und erlaubte Zeichen. Bei „Bewegung reduzieren“ keine Animationen. Nach `20261108130000_page_more_elements.sql`; **noch auszuführen** |
| `supabase/migrations/20261108150000_page_embed_own.sql` | Freie Seite: Video / Musik nur als eigenes Projekt. Der Editor verlangt vor dem Einbetten (und nach jeder neuen Adresse) die Bestätigung „mein eigenes Projekt“ (`own: true`); `save_my_page` lehnt Einbettungen ohne Bestätigung ab, die öffentliche Seite zeigt sie nicht. Regel in `community-richtlinien.html#video-musik` (Urheberrecht, Grad B, kann zur Sperre führen). Nach `20261108140000_page_animations.sql`; **noch auszuführen** |
| `supabase/migrations/20261108160000_page_hover.sql` | Freie Seite: Hover-Effekte für Knöpfe, Links, Link-Symbole, Fenster/Texte, Bilder und Formen (`hover`: Anheben, Aufploppen, Leuchten, Neon, Glanz, Füllen, Ring, Rahmen-Puls, Regenbogen, 3D-Kippen, Wackeln, Fokus); `save_my_page` prüft den Namen. Nach `20261108150000_page_embed_own.sql`; **noch auszuführen** |
| `supabase/migrations/20261108170000_page_hover_spotlight.sql` | Freie Seite: Hover-Effekt „Spotlight“ – ein Lichtkreis in der Farbe des Elements folgt der Maus. `save_my_page` kennt den Namen. Nach `20261108160000_page_hover.sql`; **noch auszuführen** |
| `supabase/migrations/20261108180000_page_hover_names.sql` | Freie Seite: mehr Hover-Effekte, alle mit englischen Namen (Motion: Lift, Pop, Pulse, Stretch, Jelly, Shake, Flip, Tilt 3D, Magnet · Light: Glow, Neon, Reflection, Shine, Spotlight, Rainbow, Focus · Fill & Border: Fill, Reveal, Ring, Pulse Ring, Border Flow, Underline · Text: Type, Spread, Glitch). `save_my_page` prüft den Namen nur noch auf die Form (`^[a-z]{0,16}$`), die Liste steht in `public/page-canvas.js` – neue Effekte brauchen kein SQL mehr. Nach `20261108170000_page_hover_spotlight.sql`; **noch auszuführen** |
| `supabase/migrations/20261108190000_page_extras.sql` | Freie Seite: Countdown-Element (`countdown`, Datum geprüft), Hintergrund-Video (`page.bgv`, nur aus dem eigenen Ordner und als eigenes bestätigt), Bucket `page-media` nimmt MP4/WebM (bis 15 MB). Ohne Datenbank-Änderung dazu: Parallax pro Element, Text-Effekte (Gradient, Shimmer, Outline, Letters), Glas-Look, eigener Cursor (Dot, Ring, Glow, Emoji), Partikel/Netz-Overlay, bewegter Verlauf, Themes (Cyberpunk, Minimal, Pastel, Retro, Ocean, Space), Ebenen-Liste und Mehrfachauswahl mit Ausrichten/Verteilen, Vorlagen „Status“, „Verlaufstext“, „Glas-Fenster“. Nach `20261108180000_page_hover_names.sql`; **noch auszuführen** |
| `supabase/migrations/20261108210000_page_pro.sql` | Freie Seite, Ausbau: Entwurf mit automatischem Speichern (`page_draft`, `save_my_page_draft`, `get_my_page_state`), Veröffentlichen legt Versionen an (`page_versions`, letzte 10; `list_my_page_versions`, `get_my_page_version`), Inhaltsfilter (`content_problem`) über alle Texte, Free-Grenze 40 Elemente, Aufrufe (`page_views`, `track_page_view`, `get_public_card` liefert `views`), neue Elemente `contact` und `counter`, Vorlagen-Galerie (`page_templates`, `share_page_template`, `list_page_templates`, `delete_my_page_template`; ohne Bilder, Videos, Links) und `get_my_page_media_refs` (Editor räumt unbenutzte Uploads auf). Nach `20261108200000_restore_card_functions.sql`. |
| `supabase/migrations/20261108220000_page_media_admin.sql` | Freie Seite: Admins laden Bilder und Videos (Hintergrund-Video) ohne Größenlimit hoch; Bucket `page-media` bis 500 MB, für alle anderen prüft die Upload-Regel weiter 3 MB (Bild) bzw. 15 MB (Video). Nach `20261108210000_page_pro.sql`. |
| `supabase/migrations/20261108230000_page_media_server.sql` | Freie Seite: Bilder und Hintergrund-Videos dürfen auch auf dem eigenen Server liegen (`s/<konto>/<datei>`, ausgeliefert unter `xyntal.de/media/…`; Upload über `hosting/daki/media-store.cjs` in den Hetzner-Bucket, Admins bis 5 GB). Ersetzt `page_check`. Nach `20261108220000_page_media_admin.sql`. |
| `supabase/migrations/20261109120000_security_hardening.sql` | Sicherheits-Durchsicht: 2FA auch für Link-Seite, freie Seite, Beta-Bewerbung und Uploads; gesperrte Konten können nichts mehr posten, kommentieren, liken oder ändern (`is_approved_member` prüft die Sperre); Karten von Konten lassen sich ohne Login nicht mehr überschreiben, eine übernommene Warteliste-Karte verliert ihren Link; höchstens 3 Profilbild-Dateien (Premium 10); Emoji-Reaktionen nur aus der Auswahl; keine `javascript:`-Links; alte Empfehlungs-Funktionen ohne Login gesperrt. Test: `tests/security_hardening.sql`. **Noch auszuführen**, nach allen anderen. |
| `supabase/migrations/20261108090000_link_limits_by_plan.sql` | Links je Tarif: Free 5, Plus 25, Pro 50, Ultra 100, Enterprise 250, Admins 1000 (`link_limit`); vorhandene Links darüber bleiben erhalten. Dieselbe Tabelle in `public/link-editor.js`. Nach `20261107250000_link_page.sql`; **noch auszuführen** |
| `supabase/migrations/20261108100000_link_text_entries.sql` | Links-Einträge dürfen statt einer Adresse auch Text enthalten (z. B. „Username: nico“); `xyntal.de/name` zeigt sie zum Kopieren. Nach `20261108090000_link_limits_by_plan.sql`; **noch auszuführen** |
| `hosting/hetzner/` | Eigener Server (Hetzner): Website, App-Backend, HTTPS und Backups mit Docker Compose; Einrichtung und Umzug in `hosting/hetzner/README.md` |
| `ANMELDUNG-EINRICHTEN.md` | Anleitung: Brevo-SMTP einrichten; Google, Apple, Discord, LinkedIn und SMS einschalten |

## Seiten

| Adresse | Inhalt |
|---|---|
| `/` | Startseite: Einstieg, Zitat von Nico, Fragen und Antworten (für wen, Unterschied zu LinkedIn/Discord, Mac/Windows, was schon geht, Bewerbung, wer dahintersteht), Beta-Link, Newsletter. Demo und Karten-Builder liegen auf `/demo` und `/meine-karte` |
| `/brief` | Der Brief von Nico: warum es Xyntal gibt, Stand der Beta, Bewerbung |
| `/mitglied-werden` | Nur noch Weiterleitung auf `/login#registrieren`: Konto anlegen geht direkt im Login-Panel (alte Links, Aliase `/register`, `/signup`, `/registrieren` und die Desktop-App landen dort) |
| `/beta` | Beta-Programm: was Tester bekommen, Bewerbung nur mit Konto. Gäste legen im selben Formular ein Konto an (E-Mail/Passwort oder Google/Apple); die Bewerbung wird bis zur E-Mail-Bestätigung im Browser zwischengespeichert und danach automatisch abgeschickt. Mitglieder sehen nur die Bewerbung oder den Stand ihrer Bewerbung; Bewerbungen erscheinen im Admin-Bereich |
| `/login` | Login als Panel in der Mitte (`public/login.css`): „Willkommen bei Xyntal“, Reiter **Einloggen / Konto anlegen** im selben Panel (`/login#registrieren` öffnet „Konto anlegen“: Name, E-Mail, Passwort mit Stärke-Anzeige, danach Bestätigungsmail), Google, Apple, Discord, LinkedIn oder Handynummer (je nachdem, was in Supabase eingeschaltet ist, siehe `ANMELDUNG-EINRICHTEN.md`), Passwort mit Anzeigen-Auge, „Passwort vergessen?“, 2FA-Code |
| `/passwort-neu` | Neues Passwort setzen (Link aus der E-Mail) |
| `/profil` | Profil bearbeiten, Passwort ändern, Konto löschen |
| `/community` | Feed: Updates, Fragen, Erfolge mit Kommentaren und Likes (Gäste sehen nur öffentliche Beiträge) |
| `/projekte` | Projekte mit offenen Rollen; Mitglieder melden sich für Rollen, Inhaber sehen die Meldungen und markieren Rollen als besetzt (`?neu=1` öffnet das Formular) |
| `/boerse` | Gesuche & Angebote mit Kontaktaufnahme (Gäste sehen nur öffentliche Einträge) |
| `/events` | Kommende und vergangene Treffen, Zu- und Absagen; Admins verwalten Termine und Teilnehmerlisten |
| `/nachrichten` | Dieselben Gespräche wie in der Xyntal-App über den App-Server (`public/pages/nachrichten.js`, `public/chat.css`): Bereiche **Alle · Privat · Teams · Gruppen** (Teams = an Arbeitsbereich oder Projekt gebundene Chats, Gruppen = öffentliche), **Gruppen entdecken** (`?entdecken=1`; Suche, Themen, „Passt zu dir“ nach Skills, Beitreten/Anfragen), Gruppen gründen mit Sichtbarkeit (privat/Arbeitsbereich/öffentlich), Beitritt (offen/Anfrage/Einladung), Thema, Stichwörtern, Höchstzahl und Voraussetzungen (Skills, Sprachen, bestätigtes Konto, Kontoalter) – geprüft auf dem App-Server (`server/src/messaging/groups.ts`, Migration 106); Beitrittsanfragen und Einladungslinks (`?gruppe=<id>&einladung=<code>`) für Inhaber/Admins in der rechten Spalte; Liste mit Filtern, Verlauf mit Einblick zur Zusammenarbeit, Gruppen, Antworten, Reaktionen, @-Erwähnungen, /projekt, GIFs, Dateien, Sprachnachrichten, Link-Vorschauen (Bild vom App-Server; YouTube, TikTok, Instagram und Vimeo spielen nach Klick an Ort und Stelle, `frame-src` in `hosting/daki/server.cjs`), Live-Updates; `?an=<Website-ID>` öffnet das Gespräch mit einem Mitglied |
| `/mitglieder` | Mitglieder mit eingerichteter, öffentlicher Xyntal-Karte (ohne Karte keine Kachel); Gäste sehen nur öffentliche |
| `/name` | Öffentliche Karte unter dem Wunsch-Link (`u.html`); vor einem Daki-Neustart leitet `404.html` dorthin weiter; Admins (`is_admin`) bekommen eine exklusive Seite: Karte mit Metallrahmen, die sich zum Mauszeiger neigt, „Offizielles Konto“ und ein „Team Xyntal“-Ausweis mit Siegel (drehender Schriftring) und Rolle/Status/Zuständig |
| `/meine-karte` | Eigene Xyntal-Karte ansehen und gestalten, Wunsch-Link und Sichtbarkeit ändern (Login nötig; eingebettet im Profil mit `?embed=1`) |
| `/profil` | Registerkarten Profil (Bio, Bild, Links) · Matching · Xyntal-Karte · Links (eigene Links für xyntal.de/name, `link-editor.js`, `#links`) · Tarif & Rechnungen · Sicherheit (E-Mail, Passwort, 2FA, Anmeldemethoden, überall abmelden, Konto löschen) |
| `/profil#matching` | „Für besseres Matching“: Skills, Tech-Stack, Ziele, Interessen, Sprachen, Zeitzone, Verfügbarkeit, Stunden, Sichtbarkeit – gespeichert auf dem App-Server (`api.xyntal.de`), dieselben Daten wie in der Desktop-App (`public/app-api.js`, `public/pages/profil-matching.js`) |
| `/arbeitsstil` | Arbeitsstil-Test der App (28 Blöcke, „am meisten“/„am wenigsten“), ausgewertet auf dem App-Server |
| `/matching` | Öffentliche Erklärung, wie die Passung berechnet wird (zehn Bereiche, Gewichte je Art der Zusammenarbeit, Plus/Minus, Risiko und Aussagekraft, Auswahl der Vorschläge) – bei Änderungen an `server/src/matching/scoring.ts` mitziehen |
| `/fuer-dich` | Vorschläge aus dem Matching des App-Servers mit Erklärung, Speichern, „Passt nicht“ und „Nachricht schreiben“; `xyntal.de/name` zeigt angemeldeten Mitgliedern zusätzlich „Eure Passung“ |
| `/tarif` | Tarif und KI-Guthaben des App-Kontos (`GET /billing` des App-Servers): Ablauf, Monatsbudget, Guthaben aufladen, Grenzen des Tarifs mit Verbrauch (Automationen, Agenten, Rollen, Verlauf, Versionen, Papierkorb, gemerkte Personen), Upgrade für Free-Konten und das Stripe-Abo-Portal; Stripe schickt danach mit `?checkout=…` hierher zurück |
| Herkunft & Feedback | `public/prompts.js` auf Profil, Für dich, Nachrichten, Tarif und Arbeitsstil: einmal „Wie bist du auf Xyntal aufmerksam geworden?“, später „Wie hilfreich ist Xyntal für dich?“ (frühestens nach 7 Tagen, höchstens alle 30 Tage – über App und Website zusammen; Logik im App-Server, `GET /me/prompts`). Auswertung im Admin unter **Feedback & Herkunft** |
| `/admin` | Derselbe Admin-Bereich wie in der Xyntal-App, über den App-Server (`public/pages/admin-platform.js`, `app-api.js`): Übersicht, Nutzer (Sperren, Verwarnen, Stummschalten, 2FA, Sitzungen, Staff-Rollen, Notizen), Konsole (`user`, `ban`, `warn`, `mute`, `kick`, `alts`, `note`, `audit` …), Projekte und Arbeitsbereiche nach Inhaber gruppiert, Support-Tickets, Meldungen, Nachrichtenzugriff, Sicherheit je Konto, KI, Matching, Systemzustand, Ankündigungen, Audit-Log; Weltkarte der Mitgliederländer aus `public/world-geo.js` (Kopie von `qml/components/WorldGeo.js` der App) – sichtbar für Konten mit Staff-Rolle auf dem App-Server. Dazu die Website-Gruppe (`public/pages/admin.js`, Supabase): Warteliste & Beta, Mitglieder freischalten, Karten, Archiv, Newsletter – sichtbar für `profiles.is_admin` |

## Design und Sprachen

- **Look:** „Xyntal OS“ – dunkles Terminal mit dem Logo-Verlauf Lila/Pink → Blau → Cyan. Die gemeinsame Ebene für alle Seiten steckt in `public/cosmos.css` und `public/cosmos.js` (Neon-Netzwerk im Hintergrund, Entschlüsseln von Überschriften, interaktive Konsole im Hero der Startseite mit Befehlen wie `help`, `join`, `demo`, `lang en`).
- **Ankündigungen:** Was Staff in der App oder unter `/admin` → Ankündigungen veröffentlicht, sehen angemeldete Mitglieder auf jeder Seite als Banner unter der Kopfzeile (`public/announcements.js`, geladen von `account-menu.js`; Quelle `GET /announcements/active` des App-Servers). Weggeklickte Banner merkt sich der Browser.
- **Deutsch/Englisch:** Umschalter DE/EN oben in der Kopfzeile, Standard ist Deutsch, die Wahl merkt sich der Browser (`localStorage` „xyntal-lang“). `public/i18n.js` tauscht Texte aus, `public/i18n-en.js` ist das Wörterbuch (deutscher Text → englischer Text, plus Muster für Texte mit Zahlen/Namen).
- **Neue Texte:** Wer einen deutschen Text ändert oder neu einbaut, ergänzt die englische Fassung in `i18n-en.js` – sonst bleibt er in der englischen Ansicht deutsch. Bereiche mit `data-no-i18n` werden nicht übersetzt.

## Admin werden

1. Auf `/beta` ein Konto anlegen (Konto und Bewerbung in einem Schritt) und die E-Mail bestätigen.
2. Im Supabase-Dashboard → SQL Editor ausführen:

```sql
update public.profiles
set is_admin = true, status = 'approved'
where id = (select id from auth.users where email = 'deine@email.de');
```

## Online

Die Website wird bei **Daki** gehostet. **https://xyntal.de/** und **https://www.xyntal.de/**
sind über den verschlüsselten Cloudflare-Tunnel `xyntal-daki` mit Daki verbunden.
IONOS bleibt der Domain-Registrar; DNS liegt bei Cloudflare. Nach der erstmaligen Umstellung
müssen DNS-Verteilung und die automatische Ausstellung des Cloudflare-Zertifikats abgeschlossen sein.
Details zum Betrieb stehen in `hosting/daki/README.md`.

Daki prüft den öffentlichen Branch `main` alle 30 Sekunden und übernimmt `public/`
automatisch. Bei einem Abruffehler bleibt die bisherige Version online.
Änderungen veröffentlichen (auf `main`):

```sh
git add -A && git commit -m "Beschreibung der Änderung"
git push
```

Nach etwa 30 Sekunden plus Übertragungszeit ist die neue Version online.
Der Endpunkt `/__deployment` zeigt den veröffentlichten Git-Commit.
Ein Push nach `gh-pages` ist für die Daki-Website nicht erforderlich.

Wenn du `style.css` oder eine `.js`-Datei änderst, erhöhe die Versionsnummer `?v=…` in den HTML-Dateien (z. B. von `?v=3` auf `?v=4`), damit Browser die neue Datei laden statt der zwischengespeicherten.

In Supabase (Authentication → URL Configuration) sind `https://xyntal.de/` als Site URL
sowie `https://xyntal.de/**`, `https://www.xyntal.de/**` und `http://localhost:4173/**` als Redirect URLs eingetragen.
Bei einer eigenen Domain beides dort ergänzen.

Alle Links in `public/` sind relativ (`community` statt `/community`), damit die Seite auch im Unterordner `/xyntal/` funktioniert.

## Wichtig

- Den **secret / service_role key** von Supabase nie in die Website einbauen.
- Der eingebaute Mailversand von Supabase ist nur zum Testen gedacht: wenige Mails pro Stunde und
  laut Supabase nur an Mitglieder deines Supabase-Teams. Vor dem Start einen eigenen Mail-Dienst
  (z. B. Brevo, Resend) unter **Authentication → Emails → SMTP Settings** eintragen.

## Noch offen

- Instagram- und LinkedIn-Links im Footer von `public/index.html`
- Impressum und vollständige Datenschutzerklärung in `public/impressum.html` (Supabase als Dienstleister nennen)
- AGB (`public/agb.html`, `/agb`) und Widerrufsbelehrung (`public/widerruf.html`, `/widerruf`) sind seit 05.11.2026 online, erzeugt aus `docs/rechtliches/AGB-ENTWURF.md` und `WIDERRUF-ENTWURF.md`; noch anwaltlich prüfen lassen und Änderungen in beiden Fassungen nachziehen
- Newsletter versenden: Adressen im Admin als CSV exportieren und z. B. in Brevo oder MailerLite importieren

## Projekte aktivieren

`supabase/009_projects.sql` einmal komplett im Supabase SQL Editor ausführen (läuft als Transaktion).
Bis dahin zeigt `/projekte` den Hinweis „Projekte werden gerade eingerichtet“, der Rest der Seite
funktioniert normal.

- Gäste sehen öffentliche Projekte, freigeschaltete Mitglieder alle.
- Projekte und Rollen anlegen dürfen nur freigeschaltete Mitglieder, höchstens acht Rollen pro Projekt.
- Meldungen („Ich wäre dabei“) sehen nur die meldende Person und der Projektinhaber; für eigene Projekte,
  besetzte Rollen und geschlossene Projekte sind keine Meldungen möglich.
- Wird ein Konto gelöscht, verschwinden seine Projekte, Rollen und Meldungen mit.

SQL-Regressionstest in einer **leeren, separaten lokalen PostgreSQL-Datenbank** (mit Rollen `anon` und
`authenticated`): `psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/projects.sql`. Erwartete letzte Ausgabe: `projects ok`.

Die Demo auf der Startseite gibt die Rollen des Demo-Teams über den lokalen Browser-Speicher
(`xyntal-wunschrollen`) als Vorschlag an das Projektformular weiter.
Das Vorschaubild für geteilte Links ist `public/og-image.jpg` (1200 × 630).

## Benachrichtigungen aktivieren

`supabase/004_notifications.sql` wurde am 20.10.2026 im Xyntal-Projekt erfolgreich
ausgeführt. RLS, beide Policies, alle drei Trigger und die eingeschränkten
Client-Rechte wurden danach per SQL geprüft. Für weitere Umgebungen nach den
bestehenden Migrationen einmal komplett im Supabase SQL Editor ausführen. Sie läuft als Transaktion. Nicht erneut ausführen,
wenn sie schon erfolgreich war. Die Website blendet die Glocke aus, solange die
Tabelle noch fehlt. Es werden nur neue Aktivitäten nach der Migration erfasst.

Freigeschaltete Mitglieder erhalten Hinweise für Direktnachrichten und Kommentare
anderer Mitglieder unter ihren eigenen Beiträgen. Die Glocke zeigt die letzten 30
Hinweise sowie die Gesamtzahl ungelesener Hinweise. Aktualisierung beim Öffnen,
beim Zurückkehren in den Tab und alle 30 Sekunden bei sichtbarem Tab. Keine
Browser-Push- oder E-Mail-Benachrichtigungen. Nachrichteninhalte werden nicht
zusätzlich in der Hinweistabelle gespeichert. „Alle gelesen“ markiert die Hinweise;
die Unterhaltung selbst wird erst beim Öffnen in Nachrichten als gelesen markiert.

SQL-Regressionstest: in einer **leeren, separaten lokalen PostgreSQL-Datenbank**
aus dem Repository-Ordner mit `psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/notifications.sql`
ausführen. Niemals gegen das produktive Supabase-Projekt ausführen: Der Test
legt vereinfachte Tabellen und Testrollen an.

Mailversand: Am 20.10.2026 wurde Brevo-SMTP in Supabase gespeichert und der Empfang
einer Passwort-Reset-Mail vom Betreiber bestätigt. Eine Neuregistrierung mit
Bestätigung und das vollständige Zurücksetzen eines Passworts sind separat noch
zu prüfen. Die Gmail-Absenderadresse ist bei Brevo verifiziert; eine eigene
Absenderdomain ist noch nicht eingerichtet.

## Profilbilder

Unter **Mein Profil** ein JPG, PNG oder WebP bis 8 MB direkt auf den Avatar ziehen
oder den Avatar doppelklicken und eine Datei auswählen. Das Bild wird mittig
quadratisch zugeschnitten und automatisch gespeichert (auch per Enter/Leertaste auswählbar).
Die Website kodiert das Bild neu als JPEG (512 × 512 Pixel, ohne ursprüngliche
Dateimetadaten). Der private Storage-Bucket `avatars` akzeptiert nur JPEG bis 1 MB.
Die Website nutzt Downloads mit RLS und lokale Blob-URLs, keine öffentlichen
Storage-URLs oder weitergebbaren Signed URLs. Bereits heruntergeladene Bilder
lassen sich beim Empfänger nicht nachträglich zurückholen.

`005_profile_avatars.sql` wurde am 20.10.2026 im Xyntal-Projekt ausgeführt;
Bucket-Einstellungen, RLS, Policies und Spaltenrechte wurden per SQL geprüft.
Öffentliche freigeschaltete Profile haben öffentlich sichtbare Bilder. Bei
privaten Profilen dürfen nur freigeschaltete Mitglieder, der Eigentümer und
Admins zugreifen. Nicht freigeschaltete Nutzer können ihr eigenes Bild bearbeiten.
Eigene, nicht mehr verknüpfte Uploads bleiben ausschließlich dem Eigentümer und
Admins zugänglich. Jeder Upload bekommt einen neuen Dateinamen; Überschreiben
ist nicht erlaubt. Fehlerhafte oder nicht erreichbare Bilder zeigen Initialen.

Ersetzen und Entfernen räumt die alte Datei über die Storage-API auf. Bei einem
Aufräumfehler bietet der Editor einen erneuten Versuch an. Vor einer Konto-
oder Admin-Mitgliedslöschung räumt die Website alle Bilder des Mitglieds auf.
Bei Löschungen direkt im Supabase-Dashboard müssen die Storage-Dateien ebenfalls
zuerst über Storage entfernt werden; SQL-DELETE auf `storage.objects` löscht
keine eigentlichen Dateien. Falls ein Kontolöschen nach der Dateibereinigung
fehlschlägt, bleibt das Konto erhalten, die Bilder sind jedoch bereits entfernt.

Prüfung: Browserabläufe mit lokal simuliertem Speicher (Auswahl, Speichern,
Ersetzen, Dateiaufräumen, Entfernen, ungültiger Dateityp), Desktop und 375 px,
keine Konsolenfehler. Ein echtes Nutzerfoto wurde dafür nicht hochgeladen.
Der Security Advisor zeigte keine Fehler und Warnungen zu bestehenden
Tabellen/Funktionen, keine zum neuen Profilbild-Speicher.

`tests/avatars.sql` prüft die Rechte in einer **separaten leeren lokalen**
PostgreSQL-Datenbank mit den Rollen `anon` und `authenticated`:
`psql -v ON_ERROR_STOP=1 -d AVATAR_TESTDATENBANK -f tests/avatars.sql`.
Der Test simuliert Storage-Tabellen; niemals im produktiven Projekt ausführen.

## Mehrere Treffen und Zusagen

Auf `/events` können Gäste öffentliche Treffen ansehen. Freigeschaltete Mitglieder
sehen auch interne Treffen, können **Ich bin dabei** wählen und die Zusage wieder
zurücknehmen. Pro Mitglied und Treffen gibt es maximal eine Zusage. Nach Beginn
oder Absage des Treffens lässt der Server keine neuen Zusagen zu; bestehende
Zusagen lassen sich weiterhin zurücknehmen. Andere Besucher sehen nur die Anzahl
zusagender Mitglieder, keine Namen.

Als Admin unter `/admin` im Reiter **Treffen** auf **Treffen verwalten** klicken
(oder `/events?verwalten=1` öffnen). Dort lassen sich Titel, Datum/Uhrzeit, Ort,
Adresse, Beschreibung und öffentliche Sichtbarkeit bearbeiten. **Zusagen ansehen**
zeigt die Teilnehmerliste ausschließlich Admins. **Treffen absagen** braucht zwei
Klicks; Termine und Zusagen werden dabei als Historie behalten. Kein endgültiges
Löschen und kein automatischer E-Mail-Versand für Terminänderungen/Absagen.
Der Hinweis im Editor erinnert daran, Teilnehmende persönlich zu informieren.

Die Datumseingabe nutzt die dort angezeigte Geräte-Zeitzone und speichert UTC;
die Terminliste zeigt konsequent `Europe/Berlin` (mit Sommer-/Winterzeit).
Die Seite lädt 30 Termine je Seite und bietet weitere Seiten an. Eine manuelle
Aktualisierung ist vorhanden. Auf der Startseite erscheinen die nächsten drei
sichtbaren, nicht abgesagten Treffen. In Produktion werden keine Demo-Termine
angelegt. Die Beispieltermine in den Screenshots sind ausschließlich lokale Testdaten.

`006_events.sql` wurde am 20.10.2026 ausgeführt. Beide Tabellen haben RLS und
gezielte Grants. `set_event_attendance` prüft Freigabe und Terminstatus selbst,
schreibt nur für `auth.uid()` und sperrt die Eventzeile gegen parallele Absagen.
`event_counts` liefert nur Summen zu den für den Aufrufer sichtbaren Treffen.
Client-Rollen dürfen `event_rsvps` nicht direkt beschreiben; Teilnehmerlisten
sind per RLS auf den eigenen Datensatz bzw. Admins eingeschränkt.

`next_event` und `event_signups` bleiben als Altbestand erhalten. Die neue Seite
schreibt nicht mehr in diese Tabellen. Frühere Anmeldungen sind im Admin-Bereich
als Archiv verfügbar. Bei der Umstellung war kein konkreter Alttermin eingetragen
und es gab keine alten Anmeldungen. Ein unbekanntes Textdatum wird grundsätzlich
nicht automatisch als neuer Termin interpretiert.

Prüfung: `tests/events.sql` in einer **separaten leeren lokalen PostgreSQL-DB**
mit vorhandenen Rollen `anon`/`authenticated` ausführen. Der Test prüft Sichtbarkeit,
Adminrechte, Schutz der Teilnehmernamen, doppelte Zusagen, Zurücknehmen sowie
abgesagte/vergangene Treffen. Anschließend kann `tests/events-race.py` in derselben
lokalen Testumgebung laufen (`127.0.0.1:55439`, Datenbank `events_test`): es prüft eine
parallel zur Absage wartende Zusage. **Nie gegen das produktive Projekt ausführen.**
Die Browserabläufe wurden mit lokal simulierten Daten für Admins, Mitglieder
und Gäste sowie bei 375 px und Desktop geprüft. Echte Termine werden vom Betreiber
angelegt; ein echter zweiter Teilnehmer war für diesen Test nicht verfügbar.

Live-Nachprüfung der Event-Migration: alle acht SQL-Checks bestanden; anonyme
REST-Anfragen auf die Terminliste und Zählfunktion erfolgreich, Teilnehmerdaten
für Gäste mit HTTP 401 gesperrt. Der Security Advisor zeigte keine Fehler.
Er markiert die beiden bewusst aufrufbaren `SECURITY DEFINER`-RPCs als Warnungen:
`event_counts` liefert ausschließlich gefilterte Summen, `set_event_attendance`
prüft den angemeldeten Nutzer und dessen Freigabe. Diese Aufrufrechte sind für
die beschriebenen Funktionen erforderlich; die Berechtigungen und Schutzfälle
sind durch die SQL-Tests abgedeckt.

## Xyntal-Karten (Karten-Builder auf der Startseite)

Besucher bauen auf der Startseite ihre Karte (Vorname, Bereich, Skills, Zeit, was sie suchen, ein Satz).
Die Karte bleibt im Browser (`localStorage` „xyntal-karte“) und lässt sich als Bild speichern oder teilen.
Wer sich in die Warteliste einträgt und „Meine Karte mitschicken“ anhakt, landet zusätzlich in Supabase.

Einrichten: `supabase/011_waitlist_cards.sql` und danach `supabase/012_waitlist_cards_more.sql` je einmal komplett im Supabase SQL Editor ausführen (laufen als Transaktion).
Die Karte ist frei gestaltbar (Farben, hell/dunkel, Layout, Fotoform, Reihenfolge und Sichtbarkeit der Blöcke) und kann ein Foto enthalten. Foto und Gestaltung bleiben im Browser; mitgeschickt werden nur die Angaben.
Bis dahin funktioniert die Warteliste normal; die Karte wird nur nicht gespeichert.

- Gäste können Karten nur über `submit_waitlist_card()` speichern, nicht lesen.
- Eine Karte lässt sich nur 30 Minuten nach dem ersten Eintrag noch ändern, damit niemand fremde Karten überschreibt.
- Im Admin-Bereich gibt es den Reiter **Karten**: Filter nach Bereich bzw. „Haben eine Idee“ / „Wollen mitbauen“,
  Stand (Neu, Kontaktiert, Gematcht), eine Notiz pro Karte (speichert beim Verlassen des Feldes) und CSV-Export.

SQL-Regressionstest in einer **leeren, separaten lokalen PostgreSQL-Datenbank** mit den Rollen `anon` und `authenticated`:
`psql -v ON_ERROR_STOP=1 -d TESTDATENBANK -f tests/waitlist_cards.sql`. Erwartete letzte Ausgabe: `waitlist cards ok`.

## Admin und Beta-Verwaltung

`/admin` ist ausschließlich für bestehende Admin-Konten zugänglich. Die neue Übersicht
zeigt die bestätigte Brevo-Gesamtzahl getrennt von Karten und Beta-Bewerbungen.
Wer auf dem App-Server eine Staff-Rolle hat, sieht den Eintrag „Admin-Bereich“ im Kontomenü
(`account-menu.js` fragt `XyntalApp.me` still ab) auch ohne `profiles.is_admin`.
Mitglieder und Karten sind durchsuchbar. Beta-Bewerbungen bieten Suche, Bereichs-
und Statusfilter, Sortierung, 15 Einträge pro Seite, interne Notizen und CSV-Export.
Jeder Statuswechsel außer „Neu“ schickt dem Bewerber eine Status-Mail über IONOS
(siehe `hosting/daki/README.md`, Abschnitt Status-Mails); „Angenommen“ setzt den Beta-Tester-Badge.

Die Erweiterung für Beta-Bewerbungen steht unter
`supabase/migrations/20261025210417_beta_admin_workflow.sql`. Lesen, Bearbeiten und
Löschen sind per RLS auf Admins beschränkt; direkte anonyme Tabellenzugriffe sind
gesperrt. Seit `supabase/migrations/20261103120000_beta_requires_account.sql` ist die Bewerbung
an ein Konto gebunden: `apply_for_beta` ist nur für eingeloggte Nutzer aufrufbar, nimmt
Name und E-Mail aus dem Konto und speichert die `user_id` an der Bewerbung (eine pro
Konto). `get_my_beta_application` zeigt Mitgliedern nur Stand und Datum der eigenen
Bewerbung, nie die Admin-Notiz. Alte Bewerbungen ohne Konto bleiben erhalten und
werden beim nächsten Login über die E-Mail dem Konto zugeordnet; im Admin-Bereich
stehen sie als „ohne Konto (alt)“. Seit
`supabase/migrations/20261103130000_beta_accepted_sets_badge.sql` setzt der Status
„angenommen“ per Trigger den Beta-Tester-Badge am verknüpften Konto (und damit die
Desktop-Downloads im Profil); wechselt der Status wieder weg, wird der Badge entfernt.
Der Badge lässt sich zusätzlich weiterhin von Hand am Mitglied setzen.

Seit `supabase/migrations/20261103160000_account_requires_beta_application.sql` gilt die
Umkehrung: **Die Bewerbung ist Pflicht für jedes Konto.** `/mitglied-werden` leitet nur noch auf
`/beta` weiter, alle „Konto anlegen“-Links führen dorthin. Weil Google, Apple, LinkedIn und SMS
(auf `/login`) das Konto trotzdem vor der Bewerbung anlegen, prüft `beta_application_required()`,
ob einem Konto die Bewerbung fehlt: `is_active_member()` (Projekte, Nachrichten, Kommentare) ist
dann `false`, und `currentMember()` in `public/app.js` schickt solche Konten auf jeder
Mitgliederseite nach `/beta?pflicht=1`, wo nur noch die Bewerbung auszufüllen ist. Betroffen sind
Konten, die ab dem 3. 11. 2026 18:00 UTC angelegt wurden; ältere Konten bleiben unberührt. Alte
Bewerbungen ohne Konto zählen über die E-Mail-Adresse.

UI-Logik prüfen: `node tests/admin-ui.cjs` (Beispieldaten, keine Live-Datenbank).
Öffentlicher Testablauf und Feedback: `/beta#testen`.
