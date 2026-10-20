# Anmeldung mit Google, Apple, LinkedIn und Handynummer einrichten

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
