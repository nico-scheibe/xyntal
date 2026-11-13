# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Voice-over für Chat-Reels mit ElevenLabs.

Liest <film>/vo.json, erzeugt jede Zeile per ElevenLabs (gecacht in <film>/audio/vo/),
schneidet Stille ab, legt die Zeilen hintereinander und schreibt:
  <film>/audio/vo.wav    die fertige Sprachspur
  <film>/timing.js       Zeitpunkte in Beats für film.js (Nachrichten erscheinen, wenn sie gesprochen werden)
  <film>/film.json       Dauer passend zur Sprachspur

vo.json:
  { "voices": {"N": "<id>", "L": "<id>", "R": "<id>"},   N = Erzähler, L = Gegenüber, R = du
    "model": "eleven_v3",
    "hook": "...", "msgs": [["l", "gesprochener Text"], ["d", "..."], ...], "punch": "...", "end": "..." }
Aufruf: uv run _shared/vo.py <film>
"""
import hashlib, json, os, subprocess, sys

API = "https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128"
SR = 44100
BEAT = 0.5  # 120 bpm, wie beats.json


def sh(*a):
    return subprocess.run(a, check=True, capture_output=True, text=True).stdout


def tts(film, text, vid, model, settings, tempo=1.0):
    key = hashlib.sha1(json.dumps([text, vid, model, settings], ensure_ascii=False).encode()).hexdigest()[:16]
    d = os.path.join(film, "audio", "vo"); os.makedirs(d, exist_ok=True)
    mp3, wav = os.path.join(d, key + ".mp3"), os.path.join(d, f"{key}_{tempo:.2f}.wav")
    if not os.path.exists(mp3):
        body = {"text": text, "model_id": model, "voice_settings": settings}
        if model != "eleven_v3":
            body["language_code"] = "de"
        out = subprocess.run(["curl", "-sS", "-f", "-X", "POST", API.format(vid=vid), "-H", "xi-api-key: dummy",
                              "-H", "Content-Type: application/json", "-d", json.dumps(body), "-o", mp3],
                             capture_output=True, text=True)
        if out.returncode != 0:
            if os.path.exists(mp3): os.remove(mp3)
            raise SystemExit(f"ElevenLabs-Fehler bei '{text[:40]}': {out.stderr.strip()}")
    if not os.path.exists(wav):
        # Stille vorn und hinten abschneiden, mono, 44.1 kHz
        flt = ("silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,"
               f"areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.06,areverse,atempo={tempo}")
        sh("ffmpeg", "-loglevel", "error", "-y", "-i", mp3, "-af", flt, "-ac", "1", "-ar", str(SR), wav)
    dur = float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav))
    return wav, dur


def main():
    film = sys.argv[1].rstrip("/")
    spec = json.load(open(os.path.join(film, "vo.json"), encoding="utf-8"))
    V, model = spec["voices"], spec.get("model", "eleven_v3")
    S = spec.get("settings", {"stability": 0.5, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": True})
    tempo, gap, typing = spec.get("tempo", 1.1), spec.get("gap", 0.1), spec.get("typing", 0.3)
    _tts = tts
    def tts_(film, text, vid, model, S):
        return _tts(film, text, vid, model, S, tempo)
    globals()["tts"] = tts_
    place = []  # (startsekunde, wav)

    if "cards" in spec:
        t, card_t = 0.1, []
        for item in spec["cards"]:
            key, text = (item[0], item[1]) if isinstance(item, list) else ("N", item)
            w, d = tts(film, text, V[key], model, S)
            card_t.append(t); place.append((t, w)); t += d + spec.get("card_gap", 0.35)
        end_t = t
        w, d = tts(film, spec["end"], V["N"], model, S); place.append((end_t + 0.6, w))
        total = int((end_t + 0.6 + d + 0.9) * 2 + 1) / 2
        T = {"cards": [round(x / BEAT, 3) for x in card_t], "end": round(end_t / BEAT, 3)}
        return finish(film, place, total, T, card_t[min(2, len(card_t) - 1)] + 0.8)

    t, intro_t, until = 0.1, [], None
    for key, text in spec.get("intro", []):
        w, d = tts(film, text, V[key], model, S)
        intro_t.append(t); place.append((t, w)); t += d + spec.get("intro_gap", 0.2)
    if intro_t:
        until = t; t += 0.35
    if spec.get("hook"):
        w, d = tts(film, spec["hook"], V["N"], model, S); place.append((t, w)); t += d + 0.25
    msg_t = []
    for m in spec["msgs"]:
        side, text = m[0], m[1]
        if side == "l":
            t += typing  # Zeit für die Tippen-Anzeige
        voice = V[m[2]] if len(m) > 2 else V["N"] if side == "d" else V["L" if side == "l" else "R"]
        w, d = tts(film, text, voice, model, S)
        msg_t.append(t); place.append((t, w)); t += d + gap
    punch_t = t + 0.2
    w, d = tts(film, spec["punch"], V["N"], model, S); place.append((punch_t + 0.2, w))
    end_t = punch_t + 0.2 + d + 0.35
    w, d = tts(film, spec["end"], V["N"], model, S); place.append((end_t + 0.6, w))
    total = end_t + 0.6 + d + 0.9
    total = int(total * 2 + 1) / 2  # auf halbe Sekunden aufrunden

    T = {"msgs": [round(x / BEAT, 3) for x in msg_t], "punch": round(punch_t / BEAT, 3), "end": round(end_t / BEAT, 3)}
    if intro_t:
        T["intro"] = [round(x / BEAT, 3) for x in intro_t]; T["until"] = round(until / BEAT, 3)
    finish(film, place, total, T, msg_t[min(3, len(msg_t) - 1)] + 1.0)


def finish(film, place, total, T, poster):
    # Sprachspur zusammensetzen
    inputs, parts = [], []
    for i, (st, wav) in enumerate(place):
        inputs += ["-i", wav]
        parts.append(f"[{i}]adelay={int(st * 1000)}:all=1[a{i}]")
    graph = ";".join(parts) + ";" + "".join(f"[a{i}]" for i in range(len(place))) + \
        f"amix=inputs={len(place)}:normalize=0,apad=whole_dur={total}[out]"
    sh("ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex", graph, "-map", "[out]",
       "-ar", str(SR), "-ac", "2", "-t", str(total), os.path.join(film, "audio", "vo.wav"))

    open(os.path.join(film, "timing.js"), "w").write("// Von _shared/vo.py erzeugt: Zeitpunkte in Beats.\nexport default " + json.dumps(T) + ";\n")
    fj = os.path.join(film, "film.json"); F = json.load(open(fj))
    F["duration"] = total; F["poster"] = round(poster, 2)
    json.dump(F, open(fj, "w"), ensure_ascii=False, indent=1)
    print(f"{film}: {len(place)} Zeilen, {total:.1f} s")


main()
