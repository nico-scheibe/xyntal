# Datenschutz für Apps

*Xchange-Bibliothek · ab Builder · Stand November 2026*

Eine Checkliste für Apps und Web-Apps aus Deutschland, Österreich und der Schweiz, die sich an Nutzer:innen in der EU richten. Sie hilft dir, eine Datenschutzerklärung zu schreiben, die zu deiner App passt, und die Punkte zu finden, die oft vergessen werden.

> **Kein Rechtsrat.** Das hier sind Erfahrungswerte aus dem Aufbau eigener Produkte. Lass deine Erklärung vor dem Launch von einer Fachperson prüfen, besonders bei Gesundheits-, Finanz- oder Kinderdaten.

## Schritt 1: Erst aufschreiben, was die App wirklich tut

Bevor du einen Text schreibst, mach eine Liste. Für jede Datenart eine Zeile:

| Was? | Wozu? | Woher? | Wer bekommt es? | Wie lange? |
|---|---|---|---|---|
| E-Mail-Adresse | Konto, Anmeldung | Registrierung | Hosting-Anbieter, E-Mail-Dienst | bis Konto gelöscht wird |
| IP-Adresse | Sicherheit, Fehlersuche | automatisch | Hosting-Anbieter | 7 Tage in Logs |
| Absturzberichte | Fehler beheben | App | Crash-Reporting-Dienst | 90 Tage |
| Zahlungsdaten | Abrechnung | Kasse | Zahlungsanbieter | gesetzliche Aufbewahrung |

Schau dafür in deinen Code und in jedes eingebundene SDK. Analyse-, Werbe- und Crash-Bibliotheken senden oft mehr, als man denkt.

## Schritt 2: Was in die Erklärung gehört (Art. 13 DSGVO)

- [ ] **Verantwortliche:r** mit Name, Anschrift und E-Mail-Adresse
- [ ] **Datenschutzbeauftragte:r**, falls du eine:n brauchst oder hast
- [ ] **Zwecke und Rechtsgrundlagen** je Verarbeitung (meist Vertrag, Art. 6 Abs. 1 lit. b; berechtigtes Interesse, lit. f; Einwilligung, lit. a)
- [ ] **Berechtigte Interessen**, wenn du dich darauf stützt, konkret benannt
- [ ] **Empfänger:innen**: alle Dienstleister (Hosting, E-Mail, Zahlung, Analyse, KI-Anbieter)
- [ ] **Übermittlung in Drittländer** (z. B. USA) und die Grundlage dafür (Angemessenheitsbeschluss wie das EU-US Data Privacy Framework oder Standardvertragsklauseln)
- [ ] **Speicherdauer** oder die Kriterien dafür
- [ ] **Rechte** der Nutzer:innen: Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Widerspruch, Widerruf einer Einwilligung
- [ ] **Beschwerderecht** bei einer Aufsichtsbehörde
- [ ] Ob die Angabe von Daten **Pflicht** ist und was passiert, wenn man sie nicht angibt
- [ ] **Automatisierte Entscheidungen** oder Profiling, falls vorhanden

## Schritt 3: Häufig vergessen

- [ ] **Speichern auf dem Gerät:** Cookies, Local Storage, Gerätekennungen. In Deutschland braucht der Zugriff auf das Endgerät eine Einwilligung, wenn er nicht unbedingt erforderlich ist (§ 25 TDDDG). Reichweitenmessung und Werbung sind das in der Regel nicht.
- [ ] **Auftragsverarbeitungsverträge (AVV)** mit jedem Dienstleister, der Daten in deinem Auftrag verarbeitet. Bei den meisten großen Anbietern klickst du sie im Konto an.
- [ ] **Push-Mitteilungen:** Gerätetoken, Zustelldienst von Apple oder Google.
- [ ] **KI-Funktionen:** Welche Eingaben gehen an welchen Anbieter, wird damit trainiert?
- [ ] **Anmeldung mit Google, Apple & Co.:** welche Daten du dabei bekommst.
- [ ] **Konto löschen:** Apple verlangt, dass Nutzer:innen ihr Konto in der App löschen können, wenn man es dort anlegen kann. Google Play verlangt zusätzlich einen Weg außerhalb der App.
- [ ] **Mindestalter:** Willigt ein Kind unter 16 Jahren bei einem Online-Dienst ein, braucht es in Deutschland die Zustimmung der Eltern (Art. 8 DSGVO). Österreich setzt die Grenze bei 14 Jahren.
- [ ] **Store-Angaben:** Die Datenschutzangaben im App Store und bei Google Play müssen zur Erklärung passen.
- [ ] **E-Mail-Newsletter:** Double-Opt-in und Abmeldelink.

## Schritt 4: Technische Grundlagen

- [ ] Verbindungen nur verschlüsselt (HTTPS/TLS)
- [ ] Passwörter nur als Hash (z. B. Argon2, bcrypt)
- [ ] Zugriff auf Produktionsdaten nur für die, die ihn brauchen
- [ ] Logs ohne Passwörter, Tokens oder unnötige personenbezogene Daten
- [ ] Ein Plan, was du bei einer Datenpanne tust: Die Meldung an die Aufsichtsbehörde muss in der Regel innerhalb von 72 Stunden erfolgen (Art. 33 DSGVO)

## Schritt 5: Aktuell halten

Jedes neue SDK, jeder neue Dienstleister und jede neue Funktion mit Daten bedeutet: Liste aus Schritt 1 ergänzen, Erklärung anpassen. Am besten als fester Punkt in deiner Release-Checkliste.
