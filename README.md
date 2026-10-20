# Xyntal – Website

Website des Gründer-Clubs Xyntal in Regensburg mit Mitgliederprofilen, Newsletter und Anmeldung zu Treffen.
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
| `supabase/schema.sql` | Datenbank: Tabellen, Zugriffsregeln, Funktionen (bereits ausgeführt) |
| `supabase/002_login_methods.sql` | Ergänzung für Google/Apple/LinkedIn/Handy-Login (bereits ausgeführt) |
| `supabase/003_community.sql` | Community: Feed, Kommentare, Likes, Börse, Direktnachrichten (bereits ausgeführt) |
| `supabase/004_notifications.sql` | Benachrichtigungen mit RLS und Triggern; nach 003 im SQL Editor ausführen |
| `ANMELDUNG-EINRICHTEN.md` | Anleitung: Brevo-SMTP einrichten; Google, Apple, LinkedIn und SMS einschalten |

## Seiten

| Adresse | Inhalt |
|---|---|
| `/` | Startseite mit Treffen-Anmeldung und Newsletter |
| `/mitglied-werden` | Konto und Profil anlegen (mit E-Mail-Bestätigung) |
| `/login` | Einloggen per E-Mail, Google, Apple, LinkedIn oder Handynummer, „Passwort vergessen?“ |
| `/passwort-neu` | Neues Passwort setzen (Link aus der E-Mail) |
| `/profil` | Profil bearbeiten, Passwort ändern, Konto löschen |
| `/community` | Feed: Updates, Fragen, Erfolge mit Kommentaren und Likes (Gäste sehen nur öffentliche Beiträge) |
| `/boerse` | Gesuche & Angebote mit Kontaktaufnahme (Gäste sehen nur öffentliche Einträge) |
| `/nachrichten` | Direktnachrichten zwischen Mitgliedern, mit Live-Updates |
| `/mitglieder` | Freigeschaltete Profile (Gäste sehen nur öffentliche) |
| `/admin` | Mitglieder freischalten, Anmeldungen & Newsletter (CSV), nächstes Treffen eintragen |

## Admin werden

1. Auf `/mitglied-werden` ein Konto anlegen und die E-Mail bestätigen.
2. Im Supabase-Dashboard → SQL Editor ausführen:

```sql
update public.profiles
set is_admin = true, status = 'approved'
where id = (select id from auth.users where email = 'deine@email.de');
```

## Online

Live unter **https://nico-scheibe.github.io/xyntal/** (GitHub Pages, Repository `nico-scheibe/xyntal`).

GitHub Pages veröffentlicht den Branch `gh-pages`, der genau den Inhalt von `public/` enthält.
Änderungen veröffentlichen:

```sh
git add -A && git commit -m "Beschreibung der Änderung"
git push
git subtree push --prefix public origin gh-pages
```

Nach ein bis zwei Minuten ist die neue Version online.

Wenn du `style.css` oder eine `.js`-Datei änderst, erhöhe die Versionsnummer `?v=…` in den HTML-Dateien (z. B. von `?v=3` auf `?v=4`), damit Browser die neue Datei laden statt der zwischengespeicherten.

In Supabase (Authentication → URL Configuration) sind `https://nico-scheibe.github.io/xyntal/` als Site URL
sowie `https://nico-scheibe.github.io/xyntal/**` und `http://localhost:4173/**` als Redirect URLs eingetragen.
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

## Benachrichtigungen aktivieren

`supabase/004_notifications.sql` nach den bestehenden Migrationen einmal komplett
im Supabase SQL Editor ausführen. Sie läuft als Transaktion. Nicht erneut ausführen,
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
