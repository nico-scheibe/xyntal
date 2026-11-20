# Two composed parts from ElevenLabs Music: dark and driving up to "Build it alone", then the turn.
import json, urllib.request, sys, pathlib
HERE = pathlib.Path(__file__).parent
G_NEG = ["vocals", "singing", "lyrics", "spoken word", "choir words", "rap vocals"]
PARTS = {
  "1": {"positive_global_styles": ["instrumental", "dark motivational", "104 BPM", "G sharp minor", "aggressive", "gritty", "TikTok motivation edit", "high-end production", "no vocals"],
        "negative_global_styles": G_NEG + ["happy", "major key"],
        "sections": [
          {"section_name": "hook", "positive_local_styles": ["starts immediately with a hard dark beat", "heavy 808", "dark piano stabs", "punchy kick and snare", "tense"], "negative_local_styles": ["slow intro", "silence"], "duration_ms": 13000, "lines": []},
          {"section_name": "pressure", "positive_local_styles": ["adds distorted bass", "rolling hi-hats", "dark strings", "more pressure"], "negative_local_styles": ["drop out"], "duration_ms": 14000, "lines": []},
          {"section_name": "grind", "positive_local_styles": ["relentless driving rhythm", "focused", "ends with a sudden hard stop into silence"], "negative_local_styles": ["fade out"], "duration_ms": 6400, "lines": []}]},
  "2": {"positive_global_styles": ["instrumental", "cinematic", "uplifting", "hopeful", "104 BPM", "B major", "high-end production", "no vocals"],
        "negative_global_styles": G_NEG + ["dark", "aggressive"],
        "sections": [
          {"section_name": "turn", "positive_local_styles": ["one soft warm piano chord", "almost silent", "breath"], "negative_local_styles": ["drums"], "duration_ms": 3000, "lines": []},
          {"section_name": "hope", "positive_local_styles": ["warm piano arpeggio", "soft pads", "gentle pulse", "building hope", "riser at the end"], "negative_local_styles": ["heavy drums"], "duration_ms": 8400, "lines": []},
          {"section_name": "drop", "positive_local_styles": ["big uplifting drop", "warm 808", "claps", "soaring strings", "bright synth lead", "triumphant together"], "negative_local_styles": ["dark"], "duration_ms": 7000, "lines": []},
          {"section_name": "finale", "positive_local_styles": ["final big impact hit", "long cinematic ring out"], "negative_local_styles": ["abrupt ending"], "duration_ms": 4500, "lines": []}]},
}
for k in (sys.argv[1:] or list(PARTS)):
    body = {"composition_plan": PARTS[k], "model_id": "music_v1"}
    req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", data=json.dumps(body).encode(),
                                 headers={"xi-api-key": "dummy", "Content-Type": "application/json"})
    try:
        (HERE / f"part_{k}.mp3").write_bytes(urllib.request.urlopen(req, timeout=600).read()); print(k, "ok")
    except urllib.error.HTTPError as e:
        print(k, e.code, e.read()[:300])
