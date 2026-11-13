# Instagram @xyntal

Alles für den Instagram-Start: fertige Posts, Reels, Captions und der Plan für Woche 1. Der Gesamtplan (30 Tage, Rechenweg, Hebel) liegt als Seite unter https://claude.ai/artifact/5LxmBnoVnVJKNwxcFrvzT2.

Ausgangslage: 0 Follower, kein Gesicht vor der Kamera, kein Werbebudget. Die Inhalte erstellt Claude. Als Preise für das Gewinnspiel in Woche 3 gibt es 3 Xyntal-Ultra-Abos.

## Fertige Dateien

| Ordner | Inhalt |
|---|---|
| `export/c0*/` | Carousels als PNG (1080×1350) plus `caption.txt` |
| `export/reels/` | Reels als MP4 (1080×1920, 60 fps, Ton auf -14 LUFS) plus Titelbild |
| `export/profilbild.png` | Profilbild 1080×1080 |
| `reels/captions.md` | Captions zu allen Reels |

## Profil einrichten (Tag 1, vor dem ersten Post)

1. Professional-Konto (Creator) einschalten. Nur damit gibt es Insights, Trial Reels und Collab-Posts.
2. Name: `Xyntal · Mitgründer & Team finden`
3. Bio:
   ```
   Hier finden Leute, die etwas bauen, ihr Team.
   Jeden Tag: wer gerade wen sucht ↓
   Gründer · Devs · Designer · DACH
   ```
4. Link: `https://xyntal.de/?utm_source=instagram&utm_medium=bio`
5. Profilbild: `export/profilbild.png`

## Posting-Plan Woche 1

„Trial“ heißt: als Trial Reel posten (beim Teilen „Trial“ einschalten). Es wird nur Nicht-Followern gezeigt. Gibt es die Option im Konto noch nicht, normal posten.

| Tag | Uhrzeit | Was | Datei |
|---|---|---|---|
| 1 | 12:00 | Carousel: Was ist Xyntal | `export/c01-was-ist-xyntal/` |
| 1 | 13:00 | Reel: Produkt Entdecken | `export/reels/r07-produkt-entdecken.mp4` |
| 1 | 18:00 | Reel: Tag 1 von 30 | `export/reels/r01-tag-1.mp4` |
| 1 | | Alle drei anpinnen | |
| 2 | 08:00 | Carousel: 7 Orte, an denen du einen Mitgründer findest | `export/c02-7-orte-mitgruender/` |
| 2 | 12:00 | Trial: Tag 1, Variante | `export/reels/r06-tag-1-variante.mp4` |
| 2 | 18:00 | Reel: POV Der Ideen-Typ | `export/reels/r02-pov-5050.mp4` |
| 3 | 12:00 | Trial: POV Gründer-Event | `export/reels/r08-pov-event.mp4` |
| 3 | 18:00 | Reel: POV Logo | `export/reels/r03-pov-logo.mp4` |
| 4 | 08:00 | Carousel: 10 Fragen vor dem Gründen | `export/c03-10-fragen-vor-dem-gruenden/` |
| 4 | 12:00 | Trial: Vesting in 30 Sekunden | `export/reels/r04-vesting.mp4` |
| 4 | 18:00 | Reel: Tag 4 von 30 mit echten Zahlen | wird nach Zahlen erstellt |
| 5 | 12:00 | Trial: 5 Red Flags | `export/reels/r10-red-flags.mp4` |
| 5 | 18:00 | Reel: POV Keine Zeit | `export/reels/r05-pov-keine-zeit.mp4` |
| 6 | 08:00 | Carousel: Equity-Split | `export/c04-equity-split/` |
| 6 | 12:00 | Trial: Variante des besten Reels | wird nach Zahlen erstellt |
| 6 | 18:00 | Reel: POV Sechs Monate später | `export/reels/r09-pov-sechs-monate.mp4` |
| 7 | 12:00 | Trial: zweite Variante des besten Reels | wird nach Zahlen erstellt |
| 7 | 18:00 | Reel: Tag 7 von 30 mit Wochenzahlen | wird nach Zahlen erstellt |

**Für Tag 4, 6 und 7 brauche ich:** Follower, Aufrufe und „Geteilt“ pro Reel aus den Insights. Ein Screenshot reicht.

## Jeden Tag

- In der ersten Stunde nach jedem Post auf jeden Kommentar antworten.
- 3 bis 5 Stories: Reel teilen, Umfrage („Wen suchst du gerade?“), Blick hinter die Kulissen.
- Ab Tag 3: 20 Minuten bei großen deutschsprachigen Gründer-Accounts sinnvoll kommentieren.

## Neue Inhalte erzeugen

Carousels: Text in `carousels/*.json` schreiben, dann

```sh
node src/render-carousels.cjs carousels/woche1.json
```

Reels: In `reels/` gibt es zwei Vorlagen. `_shared/chat.js` macht Chat-POVs, `_shared/cards.js` macht Text-Reels. Ein neues Reel ist ein Ordner mit einer kurzen `film.js` (siehe `r02-pov-5050/film.js` und `r01-tag-1/film.js`), angelegt mit

```sh
cd reels && _shared/new-reel.sh r11-name 18 "Titel"
_shared/final.sh r11-name
```

Die Reels basieren auf dem motion-reel-Skill (Render-Gerüst `_shared/motion.js`). Alle Bildschirmaufnahmen kommen aus der echten App-Demo unter `/demo`.

### Voice-over statt Musik

Alle Reels laufen ohne Musik und Effekte, mit Stimmen von ElevenLabs (Modell `eleven_v3`, 10 % schneller). Jedes Reel hat eine `vo.json` mit dem gesprochenen Text. `_shared/vo.py` erzeugt die Zeilen, legt sie hintereinander und schreibt `timing.js`: Nachrichten und Karten erscheinen genau dann, wenn sie gesprochen werden.

```sh
uv run _shared/vo.py r11-name      # Sprachspur und Timing
_shared/final-vo.sh r11-name       # Video mit Voice-over, ohne Musik
```

| Rolle | Stimme |
|---|---|
| Erzählerin (Hook, Pointe, Erklär-Reels) | Lucy Fennek |
| Ich-Stimme der Challenge (Tag X von 30) | Reel Alex |
| Gegenüber im Chat | Ben, Christian Plasa, Reel Alex, Anna, Laura |
| „Du“ im Chat | Vali (Dev), Laura (Designerin) |

Der Name „Xyntal“ wird nicht gesprochen, solange die Aussprache nicht festgelegt ist. Er steht auf der Endkarte. Geklonte Stimmen echter Personen werden nicht verwendet.
