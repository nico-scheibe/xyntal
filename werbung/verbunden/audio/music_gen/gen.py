# Two composed parts from ElevenLabs Music (composition plans), joined in the film's silence.
import json, urllib.request, sys, pathlib
HERE = pathlib.Path(__file__).parent
G_POS = ["instrumental", "cinematic", "84 BPM", "modern viral TikTok business motivation", "high-end production", "no vocals"]
G_NEG = ["vocals", "singing", "lyrics", "spoken word", "choir words"]
PARTS = {
  "A": {"positive_global_styles": G_POS + ["D minor", "emotional", "intimate"], "negative_global_styles": G_NEG + ["drums", "trap hi-hats", "EDM drop"],
        "sections": [
          {"section_name": "idea", "positive_local_styles": ["soft felt piano motif", "warm sub pad", "sparse", "hopeful but lonely", "gentle"], "negative_local_styles": ["drums"], "duration_ms": 21800, "lines": []},
          {"section_name": "night", "positive_local_styles": ["darker", "low cello drone", "ambient pads", "ticking clock percussion", "slow tension build", "piano lower register"], "negative_local_styles": ["big drums", "drop"], "duration_ms": 20600, "lines": []}]},
  "B": {"positive_global_styles": G_POS + ["hybrid trap", "epic", "uplifting"], "negative_global_styles": G_NEG,
        "sections": [
          {"section_name": "build", "positive_local_styles": ["starts almost silent", "heartbeat kick pulse", "rising arpeggiated synth", "trap hi-hats gradually rolling faster", "tension riser", "D minor", "builds steadily to a big drop"], "negative_local_styles": ["full drums at the start", "drop too early"], "duration_ms": 26300, "lines": []},
          {"section_name": "drop", "positive_local_styles": ["massive cinematic drop", "hard 808 bass", "punchy claps", "soaring strings and bright synth lead", "triumphant", "F major", "motivational business anthem", "viral TikTok energy", "ends with a final impact and ring out"], "negative_local_styles": ["quiet", "lo-fi"], "duration_ms": 16700, "lines": []}]},
}
which = sys.argv[1:] or list(PARTS)
for k in which:
    body = {"composition_plan": PARTS[k], "model_id": "music_v1"}
    req = urllib.request.Request("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_192", data=json.dumps(body).encode(),
                                 headers={"xi-api-key": "dummy", "Content-Type": "application/json"})
    try:
        data = urllib.request.urlopen(req, timeout=600).read()
    except urllib.error.HTTPError as e:
        print(k, e.code, e.read()[:400]); continue
    (HERE / f"part_{k}.mp3").write_bytes(data)
    print(k, len(data), "bytes")
