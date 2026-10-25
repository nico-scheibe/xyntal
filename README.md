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
| `public/landing.css`, `public/landing.js` | Startseite: eigenes Design (Anthrazit + Eisblau) und interaktive Demo mit Beispieldaten, ohne Supabase |
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
| `supabase/010_beta_applications.sql` | Beta-Programm: Bewerbungen ohne Konto (nur über `apply_for_beta`), lesen und bewerten nur Admins; **noch auszuführen** |
| `ANMELDUNG-EINRICHTEN.md` | Anleitung: Brevo-SMTP einrichten; Google, Apple, LinkedIn und SMS einschalten |

## Seiten

| Adresse | Inhalt |
|---|---|
| `/` | Startseite: Hero, interaktive Team-Demo (Beispieldaten, nichts wird gespeichert), Geschichte „Idee → Verbindungen → Team → Fortschritt“, Einstieg |
| `/mitglied-werden` | Konto und Profil anlegen (mit E-Mail-Bestätigung) |
| `/beta` | Beta-Programm: was Tester bekommen, Bewerbung mit „Warum sollte ich dich nehmen?“; Bewerbungen erscheinen im Admin-Bereich |
| `/login` | Einloggen per E-Mail, Google, Apple, LinkedIn oder Handynummer, „Passwort vergessen?“ |
| `/passwort-neu` | Neues Passwort setzen (Link aus der E-Mail) |
| `/profil` | Profil bearbeiten, Passwort ändern, Konto löschen |
| `/community` | Feed: Updates, Fragen, Erfolge mit Kommentaren und Likes (Gäste sehen nur öffentliche Beiträge) |
| `/projekte` | Projekte mit offenen Rollen; Mitglieder melden sich für Rollen, Inhaber sehen die Meldungen und markieren Rollen als besetzt (`?neu=1` öffnet das Formular) |
| `/boerse` | Gesuche & Angebote mit Kontaktaufnahme (Gäste sehen nur öffentliche Einträge) |
| `/events` | Kommende und vergangene Treffen, Zu- und Absagen; Admins verwalten Termine und Teilnehmerlisten |
| `/nachrichten` | Direktnachrichten zwischen Mitgliedern, mit Live-Updates |
| `/mitglieder` | Freigeschaltete Profile (Gäste sehen nur öffentliche) |
| `/admin` | Mitglieder freischalten, frühere Anmeldungen & Newsletter (CSV), Link zur Treffen-Verwaltung |

## Design und Sprachen

- **Look:** „Xyntal OS“ – dunkles Terminal mit dem Logo-Verlauf Lila/Pink → Blau → Cyan. Die gemeinsame Ebene für alle Seiten steckt in `public/cosmos.css` und `public/cosmos.js` (Neon-Netzwerk im Hintergrund, Entschlüsseln von Überschriften, interaktive Konsole im Hero der Startseite mit Befehlen wie `help`, `join`, `demo`, `lang en`).
- **Deutsch/Englisch:** Umschalter DE/EN oben in der Kopfzeile, Standard ist Deutsch, die Wahl merkt sich der Browser (`localStorage` „xyntal-lang“). `public/i18n.js` tauscht Texte aus, `public/i18n-en.js` ist das Wörterbuch (deutscher Text → englischer Text, plus Muster für Texte mit Zahlen/Namen).
- **Neue Texte:** Wer einen deutschen Text ändert oder neu einbaut, ergänzt die englische Fassung in `i18n-en.js` – sonst bleibt er in der englischen Ansicht deutsch. Bereiche mit `data-no-i18n` werden nicht übersetzt.

## Admin werden

1. Auf `/mitglied-werden` ein Konto anlegen und die E-Mail bestätigen.
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

- Foto als `public/nico.jpg` ablegen und in `public/index.html` einbinden (Kommentar im Abschnitt „Wer steckt dahinter?“)
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
(`xyntal-wunschrollen`) als Vorschlag an `/mitglied-werden` und das Projektformular weiter.
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

Unter **Mein Profil → Dein Profilbild** ein JPG, PNG oder WebP bis 8 MB wählen,
den mittigen quadratischen Ausschnitt prüfen und mit **Bild speichern** hochladen.
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
Mitglieder und Karten sind durchsuchbar. Beta-Bewerbungen bieten Suche, Bereichs-
und Statusfilter, Sortierung, 15 Einträge pro Seite, interne Notizen und CSV-Export.
Statuswechsel verschicken keine E-Mails und vergeben keine Kontorechte.

Die Erweiterung für Beta-Bewerbungen steht unter
`supabase/migrations/20261025210417_beta_admin_workflow.sql`. Lesen, Bearbeiten und
Löschen sind per RLS auf Admins beschränkt; direkte anonyme Tabellenzugriffe sind
gesperrt. `apply_for_beta` ist absichtlich ein öffentlich aufrufbarer, validierender
Schreib-Endpunkt für Bewerbungen ohne Konto. Der Supabase Advisor markiert den
SECURITY-DEFINER-Endpunkt deshalb als Warnung; er liefert keine Bewerberdaten
zurück. Das entspricht dem bisherigen Formularmodell und wird nicht durch eine
öffentlich lesbare Tabelle ersetzt.

UI-Logik prüfen: `node tests/admin-ui.cjs` (Beispieldaten, keine Live-Datenbank).
Öffentlicher Testablauf und Feedback: `/beta#testen`.
