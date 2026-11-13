# Regeln gegen KI-Slop

Gesammelt aus [motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) (Analyse von Profi-Motion-Design), [claude-motion](https://github.com/whaleyxbt/claude-motion) und dem [LottieFiles motion-design-skill](https://github.com/lottiefiles/motion-design-skill). Vorlage für die Umsetzung: `r12-ideen-typ-pro/film.js`.

## Nie

- **Page Chrome:** Labels in Ecken, Versalien-Labels („XYNTAL-APP · DEMO“, „MAX“), Zähler, Zeitcodes, Fortschrittsbalken.
- **Deck-Layouts:** Überschrift plus Gerät, Kicker über Überschrift, Screenshot als Karte mit Untertitel darunter.
- **Schwebende Karten:** ein kleiner Screenshot mit Rahmen auf flacher Fläche.
- **Erfundene Screens oder Zahlen.** Nur die echte App-Demo zeigen, Beispieldaten am Ende benennen.
- **Getippte Überschriften** mit Cursor, Werbesprache („die Zukunft von“, „nahtlos“).
- **Blenden als Standard:** Elemente kommen durch Bewegung, nicht durch Deckkraft.
- **Schnelle Federn mit Überschwingen.** Überschwingen höchstens selten und langsam.
- **Tote Frames:** nie mehr als 3 gleiche Frames in Folge.
- **Endkarte wie ein Website-Footer.** Das Ende ist kurz und eher kleiner.

## Immer

- **Die App füllt das Bild** und wird vom Rand beschnitten. Die Kamera vergrößert, was gerade gesagt wird.
- **UI-Text mindestens 4 % der Bildhöhe** (77 px bei 1920), sonst näher heran.
- **Zuerst zeigt das Produkt die Aussage, dann wird sie gesagt.** Problem kurz, Lösung lang.
- **Harte Schnitte auf dem gesprochenen Wort,** beide Seiten in Bewegung.
- **Wörter erscheinen im Sprechrhythmus** (Wort-Zeitstempel aus der ElevenLabs-Transkription, `vo.py` mit `"words": true`).
- **Ankommen bremst ab:** `bezier(0.16, 1, 0.3, 1)`, etwa 10 Frames Weg, 6 Frames Deckkraft. Verlassen beschleunigt, halb so lang.
- **Ständige leichte Kamerabewegung**, Ankommen aus der Nähe (etwa 10 % Zoom, der sich löst).
- **Hintergrund mit Licht und Struktur:** das Partikel-X der Startseite, darüber Filmkorn.
- **Eine Hauptsache pro Bild.**
- **Ende höchstens 1,4 Sekunden halten,** die letzte Szene höchstens 25 % des Films.
- **Ton:** -14 LUFS, Voice-over statt Musik.

## Prüfen vor dem Abgeben

1. Streifen über den ganzen Film rendern (`render.mjs --strip`) und jede Szene ansehen.
2. Stillstand prüfen: `mpdecimate` auf 540×960, keine Folge über 3 Frames.
3. Sprachspur transkribieren und mit dem Text vergleichen.
