# Generate the VO line by line with ElevenLabs (proxy injects the key), cached by text+voice+settings.
import json, sys, hashlib, base64, urllib.request, pathlib
HERE = pathlib.Path(__file__).parent
VOICE = "8JVx5Pi9Aj6zoPqNTCiH"   # Bella Brenell (library voice closest to the reference)
MODEL = "eleven_multilingual_v2"
SET = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True, "speed": 1.0}
lines = [l.strip() for l in (HERE / "script.txt").read_text().splitlines() if l.strip()]
only = set(int(a) for a in sys.argv[1:])
out = []
for i, text in enumerate(lines):
    say = text.replace("Xyntal", "Xyntal")
    key = hashlib.sha1(json.dumps([say, VOICE, MODEL, SET]).encode()).hexdigest()[:10]
    mp3 = HERE / "vo" / f"l{i:02d}_{key}.mp3"
    js = mp3.with_suffix(".json")
    if not mp3.exists() or (only and i in only):
        body = {"text": say, "model_id": MODEL, "language_code": "de", "voice_settings": SET,
                "previous_text": lines[i-1] if i else None, "next_text": lines[i+1] if i+1 < len(lines) else None}
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}/with-timestamps?output_format=mp3_44100_192",
            data=json.dumps(body).encode(), headers={"xi-api-key": "dummy", "Content-Type": "application/json"})
        r = json.load(urllib.request.urlopen(req))
        mp3.write_bytes(base64.b64decode(r["audio_base64"]))
        js.write_text(json.dumps(r["alignment"]))
    a = json.loads(js.read_text())
    out.append({"i": i, "text": text, "mp3": mp3.name, "dur": a["character_end_times_seconds"][-1]})
    print(i, round(out[-1]["dur"], 2), text)
(HERE / "vo" / "takes.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("total speech", round(sum(o["dur"] for o in out), 1))
