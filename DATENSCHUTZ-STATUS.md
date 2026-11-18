# Impressum und Datenschutz – Stand 18.11.2026

## Umgesetzt
- Name Nico Scheibe und bestehende Kontaktadresse auf ausdrücklichen Wunsch eingetragen.
- Keine Anschrift veröffentlicht: Nutzer wünscht ausdrücklich deren Ausschluss. Hinweis auf unvollständiges Impressum bleibt sichtbar; nicht als rechtlich fertig bezeichnen.
- Datenschutzhinweise an vorhandene Funktionen angepasst: GitHub Pages, Supabase, Brevo, Gmail, Google-Login, Community/DM, Avatare, Events, Benachrichtigungen, Browser-Sitzungen, Rechte und tatsächliche Löschfunktionen.
- Keine unbelegte Zusicherung ausschließlicher EU-Verarbeitung oder angeblich abgeschlossener AV-Verträge.
- Pflichtfeld bei Anmeldung bestätigt Kenntnisnahme der Datenschutzhinweise; freiwillige Veröffentlichung und Newsletter bleiben separat.
- Alle zwölf Seiten laden Inter, Space Grotesk und JetBrains Mono lokal. 16 WOFF2-Dateien mit Unicode-Subsets, SIL-OFL-Lizenzen und Herkunft in public/fonts. Asset-Version 8.
- Supabase-JavaScript 2.117.2 lokal in public/vendor; npm-Tarball-Integrität überprüft, Bundle bytegleich zur bisherigen CDN-Datei. Alle zwölf Seiten ohne externe Script-URLs. Keine jsDelivr-Verbindung mehr für die Bibliothek.
- Newsletter: Brevo-Formular mit verpflichtender Einwilligung und Double-Opt-in. Neue Abonnenten werden erst nach E-Mail-Bestätigung in die separate Brevo-Liste „Xyntal Newsletter – bestätigt“ aufgenommen. Abmeldung erfolgt über den Link in jeder Newsletter-Mail. Die frühere lokale Tabelle bleibt nur als Archiv bestehen.

- Beta-Programm (23.10.2026, seit 03.11.2026 nur mit Konto): Bewerbung mit Pflicht-Einwilligung, Name und E-Mail aus dem Konto, Bewerbung mit `user_id` verknüpft, Abschnitt 6 der Datenschutzerklärung, nur Admins lesen die Bewerbungen. Keine automatische Löschung; Löschung auf Anfrage beschrieben.

- Hosting (23.10.2026): Abschnitt 2 von GitHub Pages auf Daki mit Cloudflare (DNS, HTTPS, Tunnel) umgestellt; IONOS nur Registrar und E-Mail. Firmierung und Sitz von Daki sowie Protokollierung bei Daki und Cloudflare noch nicht bestätigt.

- Altersgrenze 16 und Sperrliste (18.11.2026): Ein gültiges Geburtsdatum wird jetzt immer gespeichert, auch unter 16; vorher wurde ein zu junges Datum verworfen, womit das einzige belastbare Alterssignal verschwand und ein falsches Datum nachgetragen werden konnte. Liegt das Datum unter 16, bleibt das Profil zurückgehalten, Karte und Profil werden nicht öffentlich, und Lesen wie Schreiben der Mitgliederfunktionen sind gesperrt. Beim Löschen eines Kontos, das zu diesem Zeitpunkt noch unter 16 war und dessen E-Mail-Adresse bestätigt war, bleibt eine Zeile in public.age_blocks zurück: ein mit einem geheimen Pfeffer gebildeter sha256 der Adresse und der Tag des 16. Geburtstags. Kein Name, keine Adresse im Klartext, kein Geburtsdatumsfeld. Zweck ist allein, dass Löschen und Neuanmeldung mit derselben Adresse die Altersgrenze nicht aushebeln. Aufbewahrung bis zum 16. Geburtstag; danach wirkt der Eintrag nicht mehr und wird bei der nächsten Anmeldung oder Löschung entfernt. Rechtsgrundlage: berechtigtes Interesse am Jugendschutz (Art. 6 Abs. 1 lit. f DSGVO) im Zusammenspiel mit Art. 8 DSGVO. Beschrieben in Abschnitt 3 und Abschnitt 10 der Datenschutzerklärung.
  - Bewusste Abwägung, vom Betreiber entschieden: Der gespeicherte Tag ist genau 16 Jahre nach der Geburt, das Geburtsdatum ist daraus also zurückrechenbar. Ein auf den Monat gerundeter Stichtag würde das verschleiern, aber die betroffene Person bis zu einem Monat über ihren 16. Geburtstag hinaus festhalten, ohne dass sie das Datum selbst berichtigen kann. Der konkrete Nachteil für einen echten Menschen wiegt schwerer als die Verschleierung eines Werts, der ohne den Pfeffer keiner Person zuzuordnen ist. Die Rückrechenbarkeit steht deshalb ausdrücklich in der Datenschutzerklärung.
  - Grenzen, ausdrücklich festgehalten: Eine andere E-Mail-Adresse umgeht die Sperre, ebenso Punkt-Varianten bei Gmail und eine neue Apple-Relay-Adresse. Der Plus-Zusatz (name+x@) ist abgedeckt. Die Sperre ist eine Bremse, keine Mauer. Eine unbestätigte Adresse erzeugt absichtlich keine Sperre, damit niemand durch Besetzen einer fremden Adresse einen Unbeteiligten aussperren kann.
  - Berichtigung und Löschung (Art. 16 und 17 DSGVO), zwei Schritte in dieser Reihenfolge: Erst public.admin_clear_age_block(adresse) — hebt NUR die Sperre auf, damit sie nicht wieder zuschlägt, und berührt kein Geburtsdatum. Dann public.admin_set_birthdate(konto, richtiges_datum) — überschreibt das aufgezwungene Datum und stößt das Profil neu an. Beide nur für Admins, beide protokollieren ohne Adresse und ohne Datum. Warum admin_clear_age_block ausdrücklich kein Geburtsdatum löscht: Der Primärschlüssel von member_birthdates ist die einzige Sperre dagegen, dass ein Mitglied selbst ein falsches Datum nachträgt. Eine frühere Fassung löschte die Zeile und hob damit die ganze Altersgrenze auf; das wurde in der Prüfung gemessen und behoben. Praktische Einschränkung: Beide Funktionen sind in der Weboberfläche nicht angebunden und müssen im SQL-Editor aufgerufen werden. Nach der Berichtigung wird das Profil wieder freigeschaltet, die öffentliche Sichtbarkeit muss die Person selbst einmal neu setzen.
  - Das Geburtsdatum selbst lässt sich nach dem Eintragen nicht mehr durch das Mitglied ändern; eine Berichtigung läuft über die Kontaktadresse. Eine Änderungshistorie gibt es nicht.

## Offen vor einem vollständigen rechtlichen Abschluss
- Altersgrenze: Bereits öffentliche Beiträge, Börseneinträge und Projekte eines erkannten unter-16-Kontos bleiben online; zurückgezogen werden nur Profil und Karte. Für die Altersgrenze noch zu schließen.
- Altersgrenze: Mit dem 16. Geburtstag fällt der Prüfgrund weg, freigeschaltet wird das Profil aber erst beim nächsten Speichern. Wer sein Profil nie wieder anfasst, bleibt zurückgehalten. Bei Profilen mit gesetzter Prüfsperre (aktuell 8 von 16) entscheidet ohnehin ein Admin. Auf der Produktionsdatenbank am 18.11.2026 gemessen.
- Ladungsfähige Anschrift gemäß § 5 DDG fehlt auf ausdrücklichen Nutzerwunsch. Keine Adresse aus anderen Quellen ermitteln oder veröffentlichen.
- Rechtsform/Firma, Registerangaben, USt-IdNr. sind nicht bestätigt; nicht erfinden. Anwendbarkeit redaktioneller Verantwortlichkeit § 18 Abs. 2 MStV bei entsprechender Ausrichtung klären.
- Tatsächliche Vertragsparteien, AV-Verträge, Drittlandgarantien, Supabase-Projektregion sowie konkrete Provider-Log-/Backupfristen anhand der Kontoverträge bestätigen. Bisher nicht als abgeschlossen verifiziert.
- Brevo-Öffnungs-/Klicktracking der Kontomails im Konto prüfen. Auf der Website keine Analytics/Werbetracker; keine pauschale Aussage zu Mailtracking ergänzt.
- Vor dem ersten Newsletterversand: Brevo-Kampagne mit Abmeldelink verwenden und Versand/Abmeldung einmal an einer eigenen Testadresse prüfen. Keine Massenmails versendet.
- Automatische Löschfristen für alte Zusagen, Alteinträge und abgelehnte Anmeldungen fehlen; aktuelle Aufbewahrung transparent beschrieben. Löschkonzept implementieren, bevor konkrete automatische Fristen zugesichert werden.

## Quellen
- https://www.gesetze-im-internet.de/ddg/__5.html
- https://www.gesetze-im-internet.de/ttdsg/__25.html
- https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Broschueren/INFO1.pdf
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq
- https://supabase.com/legal/customer-resources/data-processing-addendum
- https://www.brevo.com/de/legal/privacypolicy/
- https://www.jsdelivr.com/terms/privacy-policy
- https://www.lda.bayern.de/de/beschwerde.html

## Prüfung
Statische Prüfung aller zwölf Seiten: keine Google-Fonts-URLs oder Preconnects, korrekte lokale Pfade, Fontdateien als WOFF2 und HTTP 200. Browserprüfung 1280 px und 375 px ohne horizontalen Überlauf und ohne Konsolenfehler. Keine Datenbankänderung. Am 21.10.2026 Syntaxprüfung des lokalen Bundles und Browser-Datenabruf der Treffen-Seite erfolgreich; keine Konsolenfehler.
