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
| `public/front.css` | Startseite: dunkles Grau (#1C1C1C), Off-White (#ECEAE4), Serifen-Überschriften (Source Serif 4), Text in IBM Plex Sans; Einstieg, Zitat, Fragen und Antworten, Beta-Link, Newsletter. Keine Karten, keine Verläufe, keine Effekte |
| `public/brief.html`, `public/brief.css` | Der Brief von Nico als eigene Seite (`/brief`): eine schmale Textspalte in Serifenschrift |
| `public/cosmos.css`, `public/backdrop.css`, `public/site-header.css`, `public/site-footer.css` | Gemeinsame Ebene der Unterseiten, Hintergrund, Kopf- und Fußzeile – dasselbe Grau, dieselben Schriften wie die Startseite |
| `public/landing.js` | Startseite: Newsletter-Formular (Brevo), Einladungslink; die Swipe-Demo läuft nur noch auf Seiten mit `[data-demo]` |
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
| `ANMELDUNG-EINRICHTEN.md` | Anleitung: Brevo-SMTP einrichten; Google, Apple, LinkedIn und SMS einschalten |

## Seiten

| Adresse | Inhalt |
|---|---|
| `/` | Startseite: Einstieg, Zitat von Nico, Fragen und Antworten (für wen, Unterschied zu LinkedIn/Discord, Mac/Windows, was schon geht, Bewerbung, wer dahintersteht), Beta-Link, Newsletter. Demo und Karten-Builder liegen auf `/demo` und `/meine-karte` |
| `/brief` | Der Brief von Nico: warum es Xyntal gibt, Stand der Beta, Bewerbung |
| `/mitglied-werden` | Nur noch Weiterleitung auf `/beta#bewerben`: ein Konto gibt es ausschließlich mit der Beta-Bewerbung (alte Links, Aliase `/register`, `/signup`, `/registrieren` und die Desktop-App landen dort) |
| `/beta` | Beta-Programm: was Tester bekommen, Bewerbung nur mit Konto. Gäste legen im selben Formular ein Konto an (E-Mail/Passwort oder Google/Apple); die Bewerbung wird bis zur E-Mail-Bestätigung im Browser zwischengespeichert und danach automatisch abgeschickt. Mitglieder sehen nur die Bewerbung oder den Stand ihrer Bewerbung; Bewerbungen erscheinen im Admin-Bereich |
| `/login` | Einloggen per E-Mail, Google, Apple, LinkedIn oder Handynummer, „Passwort vergessen?“ |
| `/passwort-neu` | Neues Passwort setzen (Link aus der E-Mail) |
| `/profil` | Profil bearbeiten, Passwort ändern, Konto löschen |
| `/community` | Feed: Updates, Fragen, Erfolge mit Kommentaren und Likes (Gäste sehen nur öffentliche Beiträge) |
| `/projekte` | Projekte mit offenen Rollen; Mitglieder melden sich für Rollen, Inhaber sehen die Meldungen und markieren Rollen als besetzt (`?neu=1` öffnet das Formular) |
| `/boerse` | Gesuche & Angebote mit Kontaktaufnahme (Gäste sehen nur öffentliche Einträge) |
| `/events` | Kommende und vergangene Treffen, Zu- und Absagen; Admins verwalten Termine und Teilnehmerlisten |
| `/nachrichten` | Dieselben Gespräche wie in der Xyntal-App über den App-Server (`public/pages/nachrichten.js`, `public/chat.css`): Liste mit Filtern, Verlauf mit Einblick zur Zusammenarbeit, Gruppen, Antworten, Reaktionen, @-Erwähnungen, /projekt, GIFs, Dateien, Sprachnachrichten, Link-Vorschauen (Bild vom App-Server; YouTube, TikTok, Instagram und Vimeo spielen nach Klick an Ort und Stelle, `frame-src` in `hosting/daki/server.cjs`), Live-Updates; `?an=<Website-ID>` öffnet das Gespräch mit einem Mitglied |
| `/mitglieder` | Mitglieder mit eingerichteter, öffentlicher Xyntal-Karte (ohne Karte keine Kachel); Gäste sehen nur öffentliche |
| `/name` | Öffentliche Karte unter dem Wunsch-Link (`u.html`); vor einem Daki-Neustart leitet `404.html` dorthin weiter |
| `/meine-karte` | Eigene Xyntal-Karte ansehen und gestalten, Wunsch-Link und Sichtbarkeit ändern (Login nötig; eingebettet im Profil mit `?embed=1`) |
| `/profil` | Registerkarten Profil (Bio, Bild, Links) · Matching · Xyntal-Karte · Sicherheit (E-Mail, Passwort, 2FA, Anmeldemethoden, überall abmelden, Konto löschen) |
| `/profil#matching` | „Für besseres Matching“: Skills, Tech-Stack, Ziele, Interessen, Sprachen, Zeitzone, Verfügbarkeit, Stunden, Sichtbarkeit – gespeichert auf dem App-Server (`api.xyntal.de`), dieselben Daten wie in der Desktop-App (`public/app-api.js`, `public/pages/profil-matching.js`) |
| `/arbeitsstil` | Arbeitsstil-Test der App (28 Blöcke, „am meisten“/„am wenigsten“), ausgewertet auf dem App-Server |
| `/matching` | Öffentliche Erklärung, wie die Passung berechnet wird (zehn Bereiche, Gewichte je Art der Zusammenarbeit, Plus/Minus, Risiko und Aussagekraft, Auswahl der Vorschläge) – bei Änderungen an `server/src/matching/scoring.ts` mitziehen |
| `/fuer-dich` | Vorschläge aus dem Matching des App-Servers mit Erklärung, Speichern, „Passt nicht“ und „Nachricht schreiben“; `xyntal.de/name` zeigt angemeldeten Mitgliedern zusätzlich „Eure Passung“ |
| `/tarif` | Tarif und KI-Guthaben des App-Kontos (`GET /billing` des App-Servers): Ablauf, Monatsbudget, Guthaben aufladen, Upgrade für Start-Konten und das Stripe-Abo-Portal; Stripe schickt danach mit `?checkout=…` hierher zurück |
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
