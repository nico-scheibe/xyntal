# Werbung – Motion-Design-Spots

## `verbunden/` – „Connected“ (TikTok, 9:16, 86 s, Englisch)

Storytelling-Spot: der Einzige im Umfeld, der etwas aufbauen will → irgendwo auf der Welt sitzt jemand genauso da
(Lagos, Seoul, São Paulo auf einem gepunkteten Globus) → Xyntal verbindet sie → echte englische App-Screens
(Find your people, 91 % match) → „Stop building alone.“ Skript: `verbunden/docs/script_en.md`.

Der Film ist Code: `verbunden/film.js` zeichnet jedes Bild als Funktion der Zeit (Canvas), getaktet auf ein
84-BPM-Raster. Plan und Kritik stehen in `verbunden/docs/` (`skript.md`, `shotlist.md`, `critique.md`).

| Datei | Inhalt |
|---|---|
| `verbunden/film.js` | alle Szenen, Kamerafahrten, Sound-Hits (`HITS`) |
| `verbunden/audio/script.txt`, `vo.py` | Sprechertext mit ElevenLabs-v3-Audio-Tags; erzeugt die Stimme zeilenweise (Bibliotheksstimme „Dahlia“, „Xyntal“ wird als „Ksintal“ geschickt) |
| `verbunden/audio/vo/` | die erzeugten Takes (mp3 + Zeichen-Timing) |
| `verbunden/audio/score.py` | eigene Musik + Platzierung der Sätze auf dem Raster → `music.wav`, `vo.wav`, `beats.json`, `vo.json` |
| `verbunden/assets/` | Marke (Logo, Farben, Schriften Archivo + JetBrains Mono), `world.json` (Landpunkte, `tools/world.py`) |

App-Screenshots (nicht eingecheckt, aus `public/assets/img/en/`):

```sh
mkdir -p verbunden/assets/app
ffmpeg -i ../public/assets/img/en/discover-2880.webp verbunden/assets/app/en-discover-2880.png
ffmpeg -i ../public/assets/img/en/profil-2880.webp verbunden/assets/app/en-profil-2880.png
```

Rendern (Motion-Reel-Skill, Playwright + ffmpeg):

```sh
npm install
MOTION_REEL_SKILL=<skill> uv run verbunden/audio/score.py
node <skill>/scripts/render.mjs --film verbunden --format 9x16 --video-only
node <skill>/scripts/sfx.mjs verbunden && node <skill>/scripts/mix.mjs verbunden
```
