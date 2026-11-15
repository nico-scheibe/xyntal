# Two composed parts from ElevenLabs Music; part 2's drop is placed on "Meet Xyntal" by assemble.py.
import json, urllib.request, sys, pathlib
HERE = pathlib.Path(__file__).parent
G_POS = ["instrumental", "cinematic", "modern viral TikTok business storytelling", "high-end production", "no vocals", "84 BPM"]
G_NEG = ["vocals", "singing", "lyrics", "spoken word", "choir words"]
PARTS = {
  "1": {"positive_global_styles": G_POS + ["A minor", "curious", "documentary"], "negative_global_styles": G_NEG + ["EDM drop", "big drums"],
        "sections": [
          {"section_name": "alone", "positive_local_styles": ["soft felt piano motif", "intimate", "warm sub pad", "a little lonely", "sparse"], "negative_local_styles": ["drums"], "duration_ms": 17860, "lines": []},
          {"section_name": "journey", "positive_local_styles": ["light pulsing rhythm", "plucked marimba arpeggio", "soft kick on every beat", "sense of travel across the world", "curious and moving"], "negative_local_styles": ["heavy drums", "drop"], "duration_ms": 15710, "lines": []},
          {"section_name": "reflection", "positive_local_styles": ["drops back to piano and strings", "reflective", "tension slowly rising", "ends almost silent, holding its breath"], "negative_local_styles": ["drums", "drop"], "duration_ms": 17860, "lines": []}]},
  "2": {"positive_global_styles": G_POS + ["hybrid trap", "epic", "uplifting", "C major"], "negative_global_styles": G_NEG,
        "sections": [
          {"section_name": "riser", "positive_local_styles": ["short reverse swell and riser", "snare roll", "builds into a drop"], "negative_local_styles": ["long intro"], "duration_ms": 3000, "lines": []},
          {"section_name": "drop", "positive_local_styles": ["big cinematic drop", "hard 808", "punchy claps", "soaring strings", "bright synth lead", "triumphant", "global, connected, hopeful", "motivational business anthem"], "negative_local_styles": ["quiet", "lo-fi"], "duration_ms": 14000, "lines": []},
          {"section_name": "finale", "positive_local_styles": ["keeps the energy", "final big impact hit", "then a long cinematic ring out"], "negative_local_styles": ["abrupt ending"], "duration_ms": 9000, "lines": []}]},
}
for k in (sys.argv[1:] or list(PARTS)):
    body = {"composition_plan": PARTS[k], "model_id": "music_v1"}
    req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", data=json.dumps(body).encode(),
                                 headers={"xi-api-key": "dummy", "Content-Type": "application/json"})
    try:
        (HERE / f"part_{k}.mp3").write_bytes(urllib.request.urlopen(req, timeout=600).read()); print(k, "ok")
    except urllib.error.HTTPError as e:
        print(k, e.code, e.read()[:300])
