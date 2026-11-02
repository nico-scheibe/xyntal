# Xyntal TikTok-Ads im Novaire-Stil

Sechs Spots, jeder nach einem der sechs analysierten Novaire-Videos gebaut, plus der
gemeinsame Look, der sie zu einer Serie macht. Alle Texte sind fertig zum Setzen,
alle Voiceovers fertig zum Einsprechen. Format 9:16, 1080×1920, 30 fps.

---

## 1. Was den Novaire-Stil ausmacht (und wie Xyntal ihn übernimmt)

| Element | Novaire | Xyntal |
|---|---|---|
| Hintergrund | Tiefschwarz, feine Sternen-/Staubpartikel | `#07070B`, dazu das Neon-Netzwerk aus `cosmos.js` ganz leicht (10 % Deckkraft) im Hintergrund |
| UI | Keine Screen-Recordings. Einzelne UI-Bausteine (Karten, Pills, Chat-Bubbles) schweben frei in der Mitte | Genauso. Bausteine aus der Website und der Desktop-App nachgebaut: Projektkarte, Rollen-Pill, Passungs-Ring, Xyntal-Karte, Chat-Bubble |
| Glow | Pro Feature eine Neonfarbe als Kantenlicht (Rot, Grün, Blau, Lila) | Logo-Verlauf: Lila `#B95CFF`, Pink `#FF5FD2`, Blau `#5B8CFF`, Cyan `#3FD8FF`. Grün `#34C759` nur für „passt / erledigt“, Amber `#F59E0B` nur für „teilweise“ |
| Schrift | SF Pro / Inter, fett, weiß, Sekundärtext grau `#8E8E93` | Inter (liegt schon in `public/fonts`), Bold 700 für Hooks, Medium 500 für UI-Text, JetBrains Mono für Code |
| Typo-Trick | Ein Wort pro Satz im Akzentverlauf | Ein Wort pro Satz im Xyntal-Verlauf (`--grad`), Rest weiß |
| Audio | Energischer, junger deutscher Sprecher + UI-Klicks, Pops, Swooshes, Bass-Drop vor dem CTA | Gleich. Zusätzlich ein „Match-Chime“ als wiederkehrendes Sound-Logo |
| Tempo | 0,5–1,5 s pro Textkarte im Hook, 1–3 s pro Feature in der Demo | Gleich |
| Endcard | Logo, Produktkategorie, „Private Beta · Link in Bio“, Kleingedruckt „Nur eine Demonstration“ | `xyntal`-Wortmarke im Verlauf, Kategorie-Pill, „Beta · Link in Bio“, Kleingedruckt „Nur eine Demonstration · Beispieldaten“ |

**Warum das Kleingedruckte bei Xyntal Pflicht ist:** Vorschläge und gemeinsame Workspaces
sind laut Startseite und Beta-Seite noch im Bau. Jeder Spot zeigt deshalb die Zielfunktion
mit Beispieldaten (Projekt „Loopr“, Jana Weiß, Lukas Brandl, Mira Schreiner, Felix Raab aus
`public/landing.js`) und sagt das in der Endcard.

**Gemeinsames Story-Gerüst aller sechs Spots**

1. Hook (0–5 s): ein Schmerz, den jeder mit einer Idee kennt.
2. Demo (5–40 s): zwei bis fünf UI-Momente, nie ein ganzer Screen.
3. Hero-Moment: die Passung mit Begründung. Das ist Xyntals „Live Orb“.
4. Beta-Einladung (letzte 10 s): „Link zur Beta in der Bio“, Pfeil nach oben.

---

## 2. Die sechs Spots

### Spot A · „POV Feature-Rad“ (15 s, ohne Voiceover)

Vorlage: Novaire „POV: Du hast dich für die Novaire-Beta beworben“ (Rad aus Feature-Karten,
rastet auf einem Feature ein, das Feature expandiert zur Demo). Reiner Musik-Spot,
UI-Klicks synchron zum Rad.

**Fixer Header (0:00–0:15, oben, weiß, zentriert):**
`POV: Du hast dich für die Xyntal-Beta beworben`

**Phase 1 · Rad (0:00–0:08).** Vertikales 3D-Rad, jede Karte: Icon · Name · Untertitel. Kantenglow wechselt pro Karte durch den Verlauf.

| Zeit | Karte | Untertitel |
|---|---|---|
| 0:00 | Projekte | offene Rollen, klare Erwartungen |
| 0:01 | Xyntal-Karte | xyntal.de/deinname |
| 0:02 | Arbeitsstil-Test | 28 Blöcke, dein Builder-Profil |
| 0:03 | Nachrichten | Threads, Sprachnachrichten, live |
| 0:04 | Workspaces | Aufgaben, Meilensteine, Team-Chat |
| 0:05 | Community | Updates, Fragen, Erfolge |
| 0:06 | Treffen | vor Ort und remote |
| 0:07 | Rad bremst, rastet ein auf: **Passung** | zehn Bereiche, ein Grund pro Zahl |

**Phase 2 · Demo (0:08–0:14).** Die Karte „Passung“ wächst zu einem Panel:

- Kopfzeile: `Für dich` · grüner Punkt `● live`
- Prompt-Pill: `Jana sucht: Mobile-Entwicklung · 10 Std./Woche`
- Drei Profilkarten fliegen rein, Ring füllt sich: `Lukas 91`, `Sara 68`, `Tim 57`
- Lukas-Karte klappt auf, drei Zeilen tickern:
  `✓ Swift, AVFoundation` · `✓ 10 von 10 Std.` · `✓ vor Ort, abends`
- Letztes Bild: `Match-Chime`, grünes Häkchen, Text `Deshalb passt's.`

**Endcard (0:14–0:15):** Wortmarke `xyntal` im Verlauf · `Beta · Link in Bio`.

---

### Spot B · „Wetten?“ (60 s, Voiceover)

Vorlage: Novaire „Wetten? Bevor dieses Video vorbei ist, hast du ein komplettes Referat“.
Roter Timer oben rechts, leeres Raster, das sich im Lauf des Spots füllt, Konfetti am Ende.
Bei Xyntal wird aus „0/10 Folien“ ein „0/3 Rollen besetzt“.

**Sprecher:** jung, direkt, schnell, leichtes Grinsen in der Stimme.

| Zeit | On-Screen-Text | Visual | Voiceover |
|---|---|---|---|
| 0:00 | **Wetten?** | Großes Wort, Timer-Pill oben rechts startet `0:00` | „Wetten?“ |
| 0:01–0:03 | Bevor dieses Video vorbei ist, hat deine Idee ein **Team**. | Kinetische Typo, „Team“ im Verlauf | „Bevor dieses Video vorbei ist, hat deine Idee ein Team.“ |
| 0:04–0:05 | `0/3 Rollen besetzt` · `Workspace 0 %` | Drei leere, gestrichelte Rollen-Slots + leerer Workspace-Rahmen | – |
| 0:06–0:10 | Kein „Suche Mitgründer“-Post mehr, auf den niemand antwortet. · ❓ *Wer hat überhaupt Zeit?* | Mockup eines LinkedIn-ähnlichen Posts mit `0 Kommentare`, Cursor lädt neu | „Kein ‚Suche Mitgründer‘-Post mehr, auf den keiner antwortet. Und keine Ahnung, wer überhaupt Zeit hat.“ |
| 0:11–0:12 | Pass auf: **Xyntal** | Wortmarke blendet auf, Netzwerk-Glow dahinter | „Pass auf: Xyntal.“ |
| 0:13–0:18 | 🚀 Projekt: **Loopr** · *KI-App, die aus Summen einen Song macht* · Rollen: `Mobile` `Design` `KI & Audio` | Projektkarte wird getippt, drei Rollen-Pills poppen rein | „Du legst dein Projekt an. Drei Rollen, und zu jeder: welche Fähigkeiten, wie viel Zeit, wie ihr zusammenarbeitet.“ |
| 0:19 | Und Xyntal schlägt dir die Leute vor. | Lade-Ring im Verlauf | „Und Xyntal schlägt dir die Leute vor.“ |
| 0:20–0:24 | `Für dich` · **Lukas Brandl** · `91` · *Swift-Entwickler, Regensburg* | Erste Vorschlagskarte, Ring füllt sich auf 91 | „Nicht irgendwen. Lukas: baut seit Jahren Audio auf dem iPhone, hat zehn Stunden die Woche, wohnt um die Ecke.“ |
| 0:25–0:27 | **Deshalb:** `✓ Swift, Audio` `✓ 10 von 10 Std.` `✓ vor Ort, abends` | Drei Begründungszeilen tickern unter die Karte | „Und du siehst, warum.“ |
| 0:28–0:31 | **Zehn Bereiche statt einer Zahl** · `Vision` `Fähigkeiten` `Umsetzung` `Verfügbarkeit` `Persönlichkeit` … | Zehn kleine Balken fahren hoch, jeder mit Wert | „Zehn Bereiche statt einer Zahl. Vision, Fähigkeiten, Zeit, Arbeitsstil.“ |
| 0:33 | **Und jetzt kommt's** | Bold, Bass-Drop | „Und jetzt kommt's.“ |
| 0:34–0:39 | 💬 *Lukas:* „Bis Sonntag steht ein Aufnahme-Prototyp, den wir am Handy testen können.“ · `Ich wäre dabei ✓` | Chat-Bubble + grüner Button, der sich selbst drückt | „Eine Nachricht. Und Lukas sagt: Bis Sonntag steht ein Prototyp.“ |
| 0:40–0:44 | Mira · `88` · Design ✓ · Felix · `94` · KI & Audio ✓ | Zwei weitere Karten rasten in die Slots | „Mira übernimmt Design. Felix die KI. Beide mit Begründung, beide mit Zeit.“ |
| 0:45–0:47 | **Workspace: Loopr** · `3 Mitglieder` · `Aufgaben` `Meilensteine` `Team-Chat` | Workspace-Rahmen füllt sich mit drei Avataren und Modulen | „Und aus drei Vorschlägen wird ein Workspace: Aufgaben, Meilensteine, Team-Chat.“ |
| 0:48–0:50 | Erste Aufgabe: *Aufnahme-Screen prototypen* · `✓` | Task-Karte, Häkchen | „Erste Aufgabe. Erledigt.“ |
| 0:51–0:53 | Und: Video noch nicht mal vorbei! · 🟢 *Wette gewonnen ✓* · `3/3 Rollen besetzt` `Workspace 100 %` | Timer stoppt, Slots voll, Konfetti im Verlauf | „Und: Video noch nicht mal vorbei. Wette gewonnen.“ |
| 0:54–0:56 | ✦ **Projekte & Passung** · *Link zur Beta in der Bio* ↑ | CTA-Pill mit Glow, Pfeil nach oben | „Projekte und Passung mit Xyntal. Link zur Beta in der Bio.“ |
| 0:57–0:60 | **xyntal** · 🚀 *Projekte* · *Beta · Link in Bio* · *Nur eine Demonstration · Beispieldaten* | Endcard | (Match-Chime) |

---

### Spot C · „Die Beta schließt“ (62 s, Voiceover)

Vorlage: Novaire „Okay, okay, okay, jetzt wird's ernst“ (Flip-Clock, Schloss, dann
Behind-the-Scenes im Code-Editor, Gold-Text für „die Ersten“). Nur schalten, wenn es
wirklich einen Bewerbungsschluss gibt. Datum und Uhrzeit sind Platzhalter.

**Sprecher:** erst hektisch-amüsiert, ab 0:20 ruhig und nah am Mikro, ab 0:31 wieder voll.

| Zeit | On-Screen-Text | Visual | Voiceover |
|---|---|---|---|
| 0:00–0:02 | Okay, okay, okay · ha ha · jetzt wird's **ernst** | Schwarz/Weiß-Blitzschnitte, Lach-SFX | „Okay, okay, okay. Ha. Jetzt wird's ernst.“ |
| 0:02–0:04 | **BETA** · Die Xyntal-Beta schließt **heute** | Frosted-Glass-Panel öffnet sich | „Die Xyntal-Beta schließt heute.“ |
| 0:05–0:08 | **BEWERBUNGSSCHLUSS** · `[TT.MM]` · `23:59` | Mechanische Flip-Clock, Klick-SFX pro Ziffer | „Bewerbungsschluss: heute, 23:59.“ |
| 0:09–0:10 | 🔒 Danach ist das Fenster zu | Schloss rastet ein | „Danach ist das Fenster zu.“ |
| 0:11–0:12 | Noch nicht beworben? `[Für die Beta bewerben →]` | Cursor klickt den Verlaufs-Button | „Noch nicht beworben? Drei Minuten. Ohne Konto.“ |
| 0:13–0:14 | `✓ Beworben` · Und an alle, die sich beworben haben: | Grüne Häkchen vervielfachen sich | „Und an alle, die sich beworben haben:“ |
| 0:15–0:19 | Ich lese jede Bewerbung **selbst**. · 📩 *Antwort kommt per E-Mail* | Neon-Umschlag, Push-Banner `Xyntal · Du bist dabei.` | „Ich lese jede Bewerbung selbst. Die Antwort kommt per E-Mail.“ |
| 0:20–0:30 | *Und während du das hier siehst …* · Editor `scoring.ts` · `// Ideen sollen nicht an fehlenden Mitstreitern scheitern.` · `export function passung(a, b) {` … · `✓ 10 Bereiche · 142 Tests grün` | Code-Editor in JetBrains Mono, Zeilen tippen sich, Test-Popup grün, Cursor klickt `Deploy` | (leise, nah) „Und während du das hier siehst, baue ich weiter. Am Matching. An den Workspaces. Damit Ideen nicht an fehlenden Mitstreitern scheitern.“ |
| 0:31–0:35 | **Jetzt fängt es erst richtig an** · `[Beta-Tester]` · Ihr seid die **Ersten**, die mit Xyntal ein Team finden | „Ersten“ im Verlauf mit Shimmer | „Jetzt fängt es erst richtig an. Ihr seid die Ersten, die mit Xyntal ein Team finden.“ |
| 0:36–0:38 | 🐞 Ihr findet die Fehler · ✓ ich fixe sie | Roter Bug morpht in grünes Häkchen | „Ihr findet die Fehler, ich fixe sie.“ |
| 0:39–0:41 | Ihr sagt mir, was fehlt · und ich baue weiter | Feedback-Bubbles `Direkt an Nico` poppen auf | „Ihr sagt mir, was fehlt. Ich baue weiter.“ |
| 0:42–0:43 | ◔ `38 %` → `100 %` · Bis Xyntal bereit ist für alle | Fortschrittsring im Verlauf füllt sich | „Bis Xyntal bereit ist für alle.“ |
| 0:44–0:45 | Aber dafür musst du **dabei** sein. | Leiser Fade | „Aber dafür musst du dabei sein.“ |
| 0:46–0:50 | Heute · `23:59` · **BEWERBUNGSSCHLUSS** · 🔒 Danach ist zu | Flip-Clock + Schloss, zweiter Durchlauf | „Heute. 23:59. Danach ist zu.“ |
| 0:51–0:52 | ✦ · Link zur Beta in der Bio · ↓ | App-Icon pulsiert | „Link zur Beta in der Bio.“ |
| 0:53–0:62 | Wir sehen uns · **xyntal** · ⏱ *Bewerbungsschluss heute · 23:59* · *Beta · Link in Bio* | Outro-Lockup | „Wir sehen uns.“ |

---

### Spot D · „Hey Xyntal“ (62 s, zwei Stimmen)

Vorlage: Novaire „Hey Nova, hilf mir bei Vektoren“ (Partikel-Orb als KI, zwei Dialogrunden,
Lichtstrahl zeichnet die Antwort, dann „Schluss mit 100 Videos“, dann Beta-Einladung).
Statt eines Orbs nutzt Xyntal sein Neon-Netzwerk: Knoten und Linien, die sich zu Menschen
verbinden. Die „Antwort“ ist jeweils eine Passung mit Begründung.

**Stimmen:** *Jana* (jung, weiblich, natürlich) und *Xyntal* (ruhig, warm, nicht robotisch).

| Zeit | On-Screen-Text | Visual | Audio |
|---|---|---|---|
| 0:00–0:02 | `Hey Xyntal, ich brauch jemanden für Mobile.` | Netzwerk pulsiert in Lila/Cyan, Untertitel unten | *Jana:* „Hey Xyntal, ich brauch jemanden für Mobile.“ |
| 0:02–0:04 | `XYNTAL: Klar, Jana. Zehn Stunden die Woche, Audio auf dem iPhone, richtig?` | Netzwerk zieht einen Lichtfaden zur Mitte | *Xyntal:* „Klar, Jana. Zehn Stunden die Woche, Audio auf dem iPhone, richtig?“ |
| 0:04–0:06 | `XYNTAL: Schau, den hab ich dir rausgesucht.` | Lichtstrahl „zeichnet“ eine Profilkarte | *Xyntal:* „Schau, den hab ich dir rausgesucht.“ |
| 0:07–0:13 | **LUKAS BRANDL** · `91` · `Vision 88` `Fähigkeiten 95` `Verfügbarkeit 100` `Arbeitsstil 84` · *Hat eine Stimmgeräte-App mit 20.000 Downloads gebaut.* | Ring füllt sich, vier Bereichsbalken fahren hoch, ein Satz Begründung | Swoosh pro Balken, Match-Chime bei 91 |
| 0:14–0:16 | `JANA: Okay, und wer macht das Design?` | Netzwerk wechselt zu Pink/Blau | *Jana:* „Okay, und wer macht das Design?“ |
| 0:17–0:18 | `XYNTAL: Kein Problem. Schau hier.` | Zweiter Lichtstrahl | *Xyntal:* „Kein Problem. Schau hier.“ |
| 0:19–0:28 | **MIRA SCHREINER** · `88` · *Hat eine Musik-Lern-App gestaltet und mit Jugendlichen getestet.* · `✓ 8 von 8 Std.` · `✓ vor Ort` · ⚠ `Jonas 61 · 5 von 8 Std.` | Zweite Karte, daneben ein zweiter Vorschlag in Amber mit dem Grund, warum er nur teilweise passt | *Xyntal:* „Mira. Hat genau deine Zielgruppe schon mal getestet. Jonas wär auch gut, hat aber nur fünf Stunden.“ |
| 0:29–0:36 | **SCHLUSS MIT 100 DMs.** | Raster aus LinkedIn-Posts, Discord-Threads, Slack-Nachrichten, alle `0 Antworten`, fliegen weg und zerbrechen | Schnelle Riser, Kamerafahrt |
| 0:37–0:41 | **LASS DIR DIE RICHTIGEN LEUTE ZEIGEN.** | „RICHTIGEN“ im Verlauf | Bass-Drop |
| 0:44–0:48 | **XYNTAL IST NOCH NICHT FERTIG.** · **UND GENAU DESHALB BRAUCHEN WIR DICH.** | Ruhige, schwere Typo | *Xyntal:* „Xyntal ist noch nicht fertig. Und genau deshalb brauchen wir dich.“ |
| 0:49–0:52 | **WIR WOLLEN DAS MATCHING BESSER MACHEN.** · **MIT DIR.** | – | *Xyntal:* „Wir wollen das Matching besser machen. Mit dir.“ |
| 0:55–0:58 | **WIR SUCHEN BETA-TESTER** → **WIR SUCHEN DICH.** | Wort-Morph | – |
| 0:59–0:62 | **xyntal** · `BETA` · `[ Für die Beta bewerben ]` · *Kostenlos · ohne Konto · drei Minuten* · *Nur eine Demonstration · Beispieldaten* | Endcard mit Button | Match-Chime |

---

### Spot E · „Und, wie läuft's mit dem Startup?“ (62 s, Voiceover)

Vorlage: Novaire „Mama: Hast du gelernt?“ (iMessage-Bubbles als Hook, Karten fallen und
explodieren, dann modulare Feature-Tour mit 1–3 s pro Feature, Feature-Karussell, CTA).

**Sprecher:** jung, trocken, schnell.

| Zeit | On-Screen-Text | Visual | Voiceover |
|---|---|---|---|
| 0:00–0:04 | **Kumpel** · `Und, wie läuft's mit dem Startup?` · **Ich** · `Mega! Ich hab eine Idee!` | iMessage-Bubbles, dahinter stapeln sich Notizzettel mit Skizzen | *Kumpel:* „Und, wie läuft's mit dem Startup?“ · *Ich:* „Mega! Ich hab eine Idee!“ |
| 0:05–0:07 | **Eine Idee.** · **Kein Team.** | Zettelstapel explodiert über den Screen | „Eine Idee. Kein Team.“ |
| 0:08–0:10 | Ab jetzt findest du's · `[Projekte]` `[Passung]` · **Mit Xyntal** | UI-Pills mit Verlaufsglow erscheinen | „Ab jetzt findest du's. Mit Xyntal.“ |
| 0:11–0:16 | **Karte anlegen** · `Alex` · `Entwicklung · Fortgeschritten` · `Sucht: Mitgründer:in` · `8 Std./Woche` · `xyntal.de/alex` · `✓ Reserviert` | Xyntal-Karte baut sich auf, Wunsch-Link tippt sich | „Eine Minute: Was du kannst, wie viel Zeit du hast, wen du suchst. Und dein Link ist reserviert.“ |
| 0:17–0:22 | **Arbeitsstil** · `Block 12/28` · *am meisten* ✓ *am wenigsten* ✕ · `Dein Builder-Profil ✓` | Zwei Aussagen pro Block, Swipe rechts/links, am Ende ein Profil-Badge | „Dann der Arbeitsstil-Test: 28 Blöcke, am meisten, am wenigsten. Fertig ist dein Builder-Profil.“ |
| 0:23–0:28 | **Projekt** · `Loopr` · Rollen: `Mobile` `Design` `KI` · *Mitgründung mit Beteiligung* · `Ich wäre dabei` | Projektkarte, Art der Zusammenarbeit als Pill, Button leuchtet | „Dein Projekt: offene Rollen, und von Anfang an klar, ob Mitgründung, bezahlt oder Nebenprojekt.“ |
| 0:29–0:40 | Und für alle, die's **wirklich** wissen wollen · **PASSUNG** · `Lukas 91` · `Vision` `Fähigkeiten` `Umsetzung` `Verfügbarkeit` `Persönlichkeit` … · `+4 Stark ergänzende Rollen` · `−6 Zeit passt nicht` · **Deshalb.** | Riser, dann Panel mit zehn Balken, Plus- und Minuspunkte tickern | „Und für alle, die's wirklich wissen wollen: die Passung. Zehn Bereiche, Pluspunkte, Minuspunkte. Keine Zahl ohne Grund.“ |
| 0:41–0:49 | **Nachrichten** · 💬 *Mira:* „Ich kann Donnerstagabend für den Kickoff.“ · 🎙 Sprachnachricht `0:08` · `@Felix` · `/projekt Loopr` | Chat mit Reaktion, Sprachnachricht, Erwähnung | „Schreiben, Sprachnachricht, Projekt verlinken. Donnerstag Kickoff.“ |
| 0:50–0:54 | `Karte` → `Arbeitsstil` → `Projekt` → `Passung` → `Nachrichten` · **Alles für dein Team** | Fünf Pills im Karussell, Glow wechselt durch den Verlauf | „Karte, Arbeitsstil, Projekt, Passung, Nachrichten. Alles für dein Team.“ |
| 0:55–0:58 | ✦ **Xyntal** · *Jetzt in der Beta* · *Link zur Beta in der Bio* ↑ | App-Icon, Pfeil | „Xyntal. Jetzt in der Beta. Link in der Bio.“ |
| 0:59–0:62 | **xyntal** · 🤝 *Dein Team* · *Beta · Link in Bio* · *Nur eine Demonstration · Beispieldaten* | Endcard | Match-Chime |

---

### Spot F · „Kickoff morgen“ (58 s, zwei Stimmen)

Vorlage: Novaire „Mündliche Prüfung – Morgen – 8 Uhr“ (Stress-Hook in 0,5-s-Karten,
Dialog mit der KI, Konzept-Tracker oben, Tipp in Lila, Schnellrunde, Note mit
Stark/Üben-Auswertung). Bei Xyntal ist die „Prüfung“ das erste Gespräch mit einem
möglichen Mitgründer, und die „Note“ ist die Passung mit Stärken und Risiken.

**Stimmen:** *Jana* (erst nervös, dann sicher) und *Xyntal* (ruhig, ermutigend).

| Zeit | On-Screen-Text | Visual | Audio |
|---|---|---|---|
| 0:00–0:02 | `Kickoff` → `📅 Morgen` → `19:00` | 0,5-s-Textkarten, Sternenhintergrund | *Jana:* „Kickoff. Morgen. 19 Uhr.“ |
| 0:02–0:03 | `PROFIL 1/1` · `Lukas Brandl` · `Swift` | Profilkarte | *Jana:* „Sein Profil kenn ich auswendig …“ |
| 0:03–0:05 | 🎙 · aber **passen wir?** · `Keine Ahnung` *(glüht pink)* | Waveform, Text glüht | *Jana:* „… aber ob wir zusammenpassen? Keine Ahnung.“ |
| 0:05–0:06 | Also · `[ ✦ Eure Passung ]` | Pill klickt | *Jana:* „Also: Eure Passung.“ |
| 0:06–0:11 | `JANA × LUKAS` · `Bereiche 0/10` · *Ich rechne zehn Bereiche durch. Fangen wir mit dem Wichtigsten an: Wollt ihr dasselbe bauen?* | Tracker oben, Netzwerk-Knoten in der Mitte, Text tippt sich | *Xyntal:* „Ich rechne zehn Bereiche durch. Fangen wir mit dem Wichtigsten an: Wollt ihr dasselbe bauen?“ |
| 0:12–0:15 | `Vision` · `Mitgründung ↔ Mitgründung` · `Langfristig ↔ Langfristig` · **92** · `Bereiche 1/10` | Erster Balken füllt sich grün | *Xyntal:* „Beide Mitgründung, beide langfristig. 92.“ |
| 0:16–0:18 | `● Nachgefragt` · *Und ergänzt ihr euch, oder könnt ihr beide dasselbe?* | Lila Punkt, Text | *Xyntal:* „Und ergänzt ihr euch, oder könnt ihr beide dasselbe?“ |
| 0:19–0:21 | `Jana: Produkt, Community` · `Lukas: Swift, Audio` · `Ergänzende Fähigkeiten` **95** | Zwei Skill-Wolken ohne Überschneidung, Balken | *Xyntal:* „Null Überschneidung. 95.“ |
| 0:22–0:24 | 💡 **TIPP:** *Lukas hat „vor Ort, abends“ angegeben. Du „remote, flexibel“.* | Tipp-Karte in Lila | *Xyntal:* „Kleiner Hinweis: Lukas will abends vor Ort. Du remote.“ |
| 0:25–0:29 | `Verfügbarkeit` **61** ⚠ · `−6 Eure verfügbare Zeit passt nicht ganz` | Balken in Amber, Minuspunkt tickert | *Jana:* „Okay, das klären wir morgen als Erstes.“ |
| 0:30–0:37 | **Stark** · ⚡ **SCHNELLRUNDE** · `Umsetzung?` → `Aktiv in den letzten 7 Tagen ✓ +3` · `Vertrauen?` → `Profil vollständig, verifiziert ✓` · `Persönlichkeit?` → `Arbeitsstile ergänzen sich ✓` | Drei Fragen/Antworten im Stakkato, Balken 3, 4, 5 füllen sich | *Xyntal:* „Umsetzung?“ *Jana:* „Er war diese Woche aktiv!“ *Xyntal:* „Vertrauen?“ *Jana:* „Profil komplett!“ *Xyntal:* „Persönlichkeit?“ *Jana:* „Ergänzt sich!“ |
| 0:38–0:47 | **Auswertung** → **Eure Passung: 87** · **Stark:** `✓ Gleiche Vision` `✓ Rollen ergänzen sich stark (+4)` · **Klären:** `↗ Verfügbarkeit: abends vor Ort vs. remote` `↗ Erste gemeinsame Aufgabe festlegen` | Großer grüner Ring mit 87, darunter zwei Spalten | *Xyntal:* „Fertig. Eure Passung: 87. Stark: gleiche Vision, Rollen ergänzen sich. Klären: die Verfügbarkeit, und die erste gemeinsame Aufgabe.“ |
| 0:48–0:50 | `Verfügbarkeit ⚠` · *Das mit der Zeit war fair.* | Amber-Pill | *Jana:* „Das mit der Zeit war fair.“ |
| 0:50–0:54 | Mit ✦ · **Wisst's, bevor's zählt.** · *Link zur Beta* ↑ | Tagline, Pfeil | *Jana:* „Eure Passung mit Xyntal. Wisst's, bevor's zählt. Link zur Beta in der Bio.“ |
| 0:55–0:58 | ✦ **xyntal** · 🤝 *Eure Passung* · *Beta · Link in Bio* · *Nur eine Demonstration · Beispieldaten* | Endcard | Bass-Hit, Match-Chime |

---

## 3. Hook-Bank für weitere Varianten

Jeder Hook funktioniert als Textkarte in Spot-A-Länge (15 s) mit demselben Rad oder als
Opener für einen 60er.

- `POV: Du hast seit 3 Monaten eine Idee und seit 3 Monaten kein Team`
- `Wetten? Bevor dieses Video vorbei ist, weißt du, warum ihr zusammenpasst.`
- `„Suche Mitgründer, Equity verhandelbar.“ · 0 Kommentare · 4 Monate alt`
- `Kumpel: Und, wann launcht ihr? · Ich: Wir sind noch zu zweit. · Ich: Also ich.`
- `Zehn Bereiche. Eine Zahl. Ein Grund pro Zahl.`
- `Dein Mitgründer ist online. Du kennst ihn nur noch nicht.`
- `Hey Xyntal, wer hat Donnerstag Zeit und kann Swift?`

---

## 4. Produktionsnotizen

**Bausteine, die einmal gebaut und in allen Spots wiederverwendet werden**

1. Sternen-/Partikelhintergrund mit sehr leisem Neon-Netzwerk (aus `cosmos.js` ableiten).
2. Glass-Karte: `#111117` bei 70 % Deckkraft, 1 px Rand `rgba(255,255,255,.08)`, Radius 20 px, Kantenglow in der jeweiligen Verlaufsfarbe, Blur 24 px.
3. Passungs-Ring: 0–100, füllt sich in 0,8 s mit Ease-out, Farbe ab 65 grün, 40–64 amber, darunter pink.
4. Bereichsbalken: zehn Zeilen, Label links, Wert rechts, Balken im Verlauf.
5. Pill: 36 px hoch, `#1A1A22`, Text weiß 500, optionaler Punkt in Grün („live“, „erledigt“).
6. Chat-Bubble: eigene Nachricht im Verlaufs-Button-Stil (`--grad-btn`), fremde Nachricht in `#1F1C2E`.
7. Xyntal-Karte: 1:1 wie der Kartenbuilder auf der Startseite (Farbschema „Aurora“).
8. Endcard: Wortmarke `xyntal` im Verlauf, Kategorie-Pill, zwei Zeilen Kleingedrucktes.

**Audio**

- Sprecher: ein junger deutscher Sprecher für alle Voiceover-Spots (B, C, E), damit die Serie eine Stimme hat. Für D und F zusätzlich eine weibliche Stimme (Jana) und eine ruhige Stimme für „Xyntal“.
- Sound-Logo „Match-Chime“: zwei aufsteigende Töne, 0,4 s, immer wenn ein Ring auf ≥ 85 rastet und in jeder Endcard.
- SFX-Liste: UI-Tap, Tastatur-Tippen, Swoosh (Karte rein), Pop (Pill), Flip-Clock-Klick, Schloss, Bass-Drop, Riser, Konfetti-Chime, iMessage-Send/Receive.
- Musik: treibender Electro-Beat, 120–128 BPM, bei Spot C Tempowechsel bei 0:20 und 0:31.

**Werkzeuge**

- After Effects oder Jitter für die UI-Animation, alternativ Remotion (React), weil die Bausteine dann aus dem echten CSS der Website kommen.
- Untertitel immer eingebrannt, Hook-Text in der oberen Drittel-Zone, nichts in den unteren 20 % (TikTok-UI).
- Erste Version jedes Spots als 1080×1920 ProRes, dann H.264 mit 12 Mbit/s.

**Caption-Vorlage für TikTok**

> Deine Idee braucht die richtigen Leute. Xyntal ist in der Beta: Projekt vorstellen, Passung sehen, Team finden. Link in der Bio. #startup #gründen #mitgründer #indiehacker #buildinpublic #xyntal

**Reihenfolge zum Testen**

1. Spot A (15 s, günstig, kein Voiceover): Format und Look validieren.
2. Spot E (Feature-Tour): breiteste Botschaft.
3. Spot B und F (Passung als Hero): Differenzierung.
4. Spot D (Dialog): teuerste Produktion, erst wenn A/E/B Signal zeigen.
5. Spot C nur mit echtem Bewerbungsschluss.
