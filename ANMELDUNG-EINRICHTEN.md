# Anmeldung und E-Mail-Versand einrichten

Die Website ist fertig vorbereitet: Sobald ein Anbieter in Supabase eingeschaltet ist, erscheint
sein Button automatisch auf **/login** und **/mitglied-werden**. Du musst nur die Zugangsdaten beim
jeweiligen Anbieter anlegen und in Supabase eintragen.

**Diese Adresse brauchst du bei Google, Apple und LinkedIn als „Redirect URL“ / „Callback URL“:**

```
https://rralgrlujoupprwlvoyo.supabase.co/auth/v1/callback
```

Eingetragen wird alles in Supabase unter
**Authentication → Sign In / Providers** → Anbieter anklicken → einschalten → Daten einfügen → **Save**.

---

## E-Mail-Bestätigung und Passwort-Reset mit Brevo

**Stand:** Die Website unterstützt beide Abläufe bereits. SMTP ist erst aktiv,
wenn die folgenden Einstellungen im Dashboard gespeichert und getestet wurden.
Ein Repository-Update allein schaltet den Versand nicht frei.

### 1. Konto und Absender vorbereiten

1. Ein [Brevo-Konto](https://www.brevo.com/de/) anlegen. Prüfe vor der Auswahl
   eines Tarifs dessen aktuelle Versandgrenzen; für diesen Schritt keinen kostenpflichtigen Tarif buchen.
2. In Brevo unter **Einstellungen → Absender, Domains & dedizierte IPs** einen
   Absender einrichten. Absendername: **Xyntal**. Die Absenderadresse muss dir gehören
   und von Brevo bestätigt sein.
3. Wenn du eine eigene Domain hast, diese in Brevo hinzufügen und die dort
   angezeigten DNS-Einträge bei deinem Domainanbieter setzen. Verwende genau die
   Werte aus deinem Brevo-Konto. Ohne Domain erst prüfen, welche Absender Brevo
   für dein Konto zulässt; die GitHub-Pages-Adresse ist keine E-Mail-Domain,
   deren DNS du verwalten kannst.
4. In **SMTP & API → SMTP** den angezeigten **SMTP-Login** kopieren und einen
   **SMTP-Schlüssel** erstellen. Dieser Schlüssel ist das SMTP-Passwort,
   nicht dein Brevo-Kontopasswort und nicht ein API-Schlüssel.

### 2. In Supabase eintragen

[SMTP-Einstellungen für Xyntal öffnen](https://supabase.com/dashboard/project/rralgrlujoupprwlvoyo/auth/smtp)
und **Enable custom SMTP** aktivieren:

| Feld | Wert |
|---|---|
| Sender email address | Deine in Brevo verifizierte Absenderadresse |
| Sender name | `Xyntal` |
| Host | `smtp-relay.brevo.com` |
| Port number | `587` (STARTTLS) |
| Username | Der SMTP-Login, den Brevo anzeigt |
| Password | Dein Brevo-SMTP-Schlüssel |
| Minimum interval per user | Zunächst `60` Sekunden |

Speichern. SMTP-Schlüssel ausschließlich hier eintragen, niemals in `config.js`,
Git, Screenshots oder Chat. Unter **Authentication → Rate Limits** die
Versandgrenzen prüfen und passend zu den verfügbaren Brevo-Kontingenten setzen.

### 3. Weiterleitungen prüfen

Unter **Authentication → URL Configuration**:

- **Site URL:** `https://nico-scheibe.github.io/xyntal/`
- **Redirect URLs:** `https://nico-scheibe.github.io/xyntal/**`
- Für lokale Tests zusätzlich: `http://localhost:4173/**`

E-Mail-Bestätigung unter dem E-Mail-Anbieter aktiviert lassen. Link-Tracking
beim Maildienst für Auth-Mails deaktivieren, falls aktiv: Bestätigungslinks
sollen unverändert bleiben.

### 4. Versand wirklich testen

1. Auf der Live-Seite ein neues Konto mit einer eigenen Testadresse anlegen,
   die **nicht** zum Supabase-Team gehört. Nicht die bestehende Admin-Adresse verwenden.
2. Bestätigungsmail auch im Spamordner suchen, Link öffnen und prüfen, ob
   das neue Profil erscheint. Das Profil muss zunächst auf Freigabe warten.
3. Ausloggen, auf **Login → Passwort vergessen?** die Testadresse eintragen.
   Den neuesten Reset-Link öffnen, neues Passwort setzen und damit einloggen.
4. In Brevo die Transaktionslogs und in Supabase die Auth-Logs prüfen, wenn
   keine Mail ankommt. Keine wiederholten Versuche in kurzer Folge auslösen.
5. Das Testkonto anschließend über sein Profil löschen, wenn es nicht mehr gebraucht wird.

Erst nach beiden erfolgreichen Tests gilt der Mailversand als eingerichtet.
Typische Fehler: nicht verifizierter Absender, API- statt SMTP-Schlüssel,
falscher SMTP-Login, nicht aktivierter SMTP-Versand oder erreichte Versandlimits.

Quellen: [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Brevo: Supabase-SMTP-Anbindung](https://developers.brevo.com/docs/supabase-smtp-integration),
[Brevo SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP).

---

## Google (kostenlos, ca. 10 Minuten)

1. https://console.cloud.google.com öffnen → oben **Neues Projekt** → Name „Xyntal“.
2. **APIs & Dienste → OAuth-Zustimmungsbildschirm**: Typ **Extern**, App-Name „Xyntal“, deine E-Mail als Support-Adresse. Speichern.
3. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**
   - Anwendungstyp: **Webanwendung**
   - Autorisierte Weiterleitungs-URIs: die Callback-URL von oben
4. **Client-ID** und **Clientschlüssel** kopieren → in Supabase bei **Google** eintragen.
5. Zum Schluss im Zustimmungsbildschirm die App **veröffentlichen** („In Produktion“), sonst können sich nur Testnutzer anmelden.

## LinkedIn (kostenlos, ca. 10 Minuten) – passt gut zu einem Gründer-Club

1. https://www.linkedin.com/developers/apps → **Create app**. LinkedIn verlangt dafür eine Unternehmensseite (z. B. eine Seite „Xyntal“).
2. Reiter **Products** → **Sign In with LinkedIn using OpenID Connect** hinzufügen.
3. Reiter **Auth** → **Authorized redirect URLs**: Callback-URL von oben.
4. **Client ID** und **Primary Client Secret** → in Supabase bei **LinkedIn (OIDC)** eintragen.

## Apple (kostet 99 $/Jahr, ca. 20 Minuten)

Voraussetzung: Mitgliedschaft im **Apple Developer Program**.

1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**.
2. **Identifiers → App IDs**: neue App ID, Capability **Sign in with Apple** anhaken.
3. **Identifiers → Services IDs**: neue Services ID, z. B. `de.xyntal.web` → **Sign in with Apple** konfigurieren:
   - Domain: `rralgrlujoupprwlvoyo.supabase.co`
   - Return URL: Callback-URL von oben
4. **Keys**: neuer Key mit **Sign in with Apple** → `.p8`-Datei herunterladen, Key ID und Team ID notieren.
5. In Supabase bei **Apple**: Services ID als Client ID eintragen. Für das „Secret“ erzeugt man aus der `.p8`-Datei einen Schlüssel – Supabase verlinkt dafür in den Apple-Einstellungen eine Anleitung bzw. ein Werkzeug.
6. Wichtig: Dieses Secret läuft nach **6 Monaten** ab und muss dann neu erzeugt werden.

## Handynummer per SMS (kostet pro SMS, ca. 15 Minuten)

Supabase verschickt keine SMS selbst, du brauchst einen SMS-Dienst. Am einfachsten: **Twilio**.

1. Konto auf https://www.twilio.com anlegen und Guthaben aufladen (eine SMS nach Deutschland kostet einige Cent).
2. Unter **Messaging → Services** einen Messaging Service anlegen und eine Absender-Nummer bzw. einen Absendernamen hinzufügen.
3. Notieren: **Account SID**, **Auth Token**, **Messaging Service SID**.
4. In Supabase bei **Phone**: einschalten, SMS-Anbieter **Twilio** wählen, die drei Werte eintragen.
5. Tipp: Unter **Authentication → Rate Limits** begrenzen, wie viele SMS pro Stunde verschickt werden dürfen – schützt vor Missbrauch und Kosten.

---

## Sicherheit

- Client-Secrets, Auth Tokens und `.p8`-Dateien gehören **nur** in Supabase – nie in die Website-Dateien.
- Wenn die Seite online ist: die echte Domain in Supabase unter **Authentication → URL Configuration**
  als Site URL und als Redirect URL (`https://deine-domain.de/**`) eintragen.
- Bei Google/Apple/LinkedIn ändert sich die Callback-URL dadurch nicht.

## Was nach der Anmeldung passiert

- Neue Mitglieder landen auf **/profil** mit dem Hinweis, ihr Profil zu vervollständigen.
- Den Namen übernimmt das Profil automatisch von Google/Apple/LinkedIn (falls vorhanden).
- Im Admin-Bereich siehst du bei jedem Mitglied E-Mail bzw. Handynummer und den Anmeldeweg.
- Wie bisher: Erst nach deiner Freischaltung sehen neue Mitglieder alle Profile.
