# Werbung – Motion-Design-Spots

## `verbunden/` – „Verbunden“ (TikTok, 9:16, 73 s)

Storytelling-Spot: der Einzige im Umfeld, der etwas aufbauen will → irgendwo sitzt jemand genauso da →
Xyntal verbindet sie → echte App-Screens (Finde deine Leute, 89 % Match) → „Hör auf, allein zu bauen.“

Der Film ist Code: `verbunden/film.js` zeichnet jedes Bild als Funktion der Zeit (Canvas), getaktet auf ein
84-BPM-Raster. Plan und Kritik stehen in `verbunden/docs/` (`skript.md`, `shotlist.md`, `critique.md`).

| Datei | Inhalt |
|---|---|
| `verbunden/film.js` | alle Szenen, Kamerafahrten, Sound-Hits (`HITS`) |
| `verbunden/audio/script.txt`, `vo.py` | Sprechertext; erzeugt die Stimme zeilenweise über ElevenLabs (Stimme „Bella Brenell“) |
| `verbunden/audio/vo/` | die erzeugten Takes (mp3 + Zeichen-Timing) |
| `verbunden/audio/score.py` | eigene Musik + Platzierung der Sätze auf dem Raster → `music.wav`, `vo.wav`, `beats.json`, `vo.json` |
| `verbunden/assets/` | Marke (Logo, Farben, Schriften Archivo + JetBrains Mono) |

App-Screenshots (nicht eingecheckt, aus `public/assets/img/`):

```sh
mkdir -p verbunden/assets/app
ffmpeg -i ../public/assets/img/discover-2880.webp verbunden/assets/app/discover-2880.png
ffmpeg -i ../public/assets/img/profil-2880.webp verbunden/assets/app/profil-2880.png
```

Rendern (Motion-Reel-Skill, Playwright + ffmpeg):

```sh
npm install
MOTION_REEL_SKILL=<skill> uv run verbunden/audio/score.py
node <skill>/scripts/render.mjs --film verbunden --format 9x16 --video-only
node <skill>/scripts/sfx.mjs verbunden && node <skill>/scripts/mix.mjs verbunden
```
