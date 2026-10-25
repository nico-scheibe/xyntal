# E-Mails für die Warteliste (Brevo)

Zwei Vorlagen im Look der Website. Das Logo wird von `https://xyntal.de/email/logo.png` geladen –
erst **pushen**, dann in Brevo einrichten, sonst fehlt das Logo.

| Datei | Wofür | Betreff | Vorschautext |
|---|---|---|---|
| `bestaetigung.html` | Double-Opt-in: Bestätigungs-Mail | Bestätige deine Anmeldung bei Xyntal | Nur noch ein Klick – dann bist du auf der Xyntal-Warteliste. |
| `willkommen.html` | Nach der Bestätigung | Willkommen bei Xyntal – kurze Frage an dich | Du bist dabei. Und ich hab eine Frage an dich. |

Absendername überall: **Nico von Xyntal** (wirkt persönlicher als „xyntal“ und wird öfter geöffnet).

## Bestätigungs-Mail einrichten

1. Brevo → **Marketing → Vorlagen** (Templates) → **Vorlage erstellen**.
2. Name, Absender, Betreff und Vorschautext aus der Tabelle eintragen.
3. Als Editor **„Eigenen Code einfügen“ / HTML-Editor** wählen und den kompletten Inhalt von `bestaetigung.html` einfügen.
4. Der Button verlinkt auf `{{ doubleoptin }}` – das ist der Bestätigungslink. Speichern und aktivieren.
5. Brevo → **Marketing → Formulare** → dein Wartelisten-Formular → **Einstellungen** →
   „Double-Opt-in-Bestätigungs-E-Mail“ → die neue Vorlage auswählen → speichern.
6. **Testen:** mit einer eigenen Adresse auf xyntal.de eintragen und auf den Button klicken.

Falls Brevo im HTML-Editor `{{ doubleoptin }}` nicht als Bestätigungslink erkennt (der Button führt dann ins Leere):
Vorlage stattdessen im **Drag-&-Drop-Editor** nachbauen – Hintergrund `#07070B`, Karte `#121219`, Text `#F5F5F7` / `#B4B4BE`,
Button `#C04BD8` mit runden Ecken – und beim Button unter **Link-Einstellungen → Link-Typ → „Double-Opt-in-Link“** wählen.
Anleitung von Brevo: https://help.brevo.com/hc/de/articles/360019540880

## Willkommens-Mail einrichten

1. Wie oben eine neue Vorlage anlegen und `willkommen.html` einfügen.
2. Im Formular unter **Einstellungen** die „Abschließende Bestätigungs-E-Mail“ (final confirmation) einschalten
   und diese Vorlage auswählen.
3. Der Abmeldelink nutzt `{{ unsubscribe }}` (Brevo-Standard).

Antworten auf die Willkommens-Mail landen in deinem Postfach – ideal, um Leute von Hand zu matchen
(zusammen mit dem Reiter **Karten** im Admin-Bereich).
