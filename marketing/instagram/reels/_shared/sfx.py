# /// script
# requires-python = ">=3.10"
# ///
"""Legt hochwertige Effekte (ElevenLabs, _shared/sfx/*.mp3) leise auf Bild-Ereignisse.
<film>/sfx.json: [[name, "Ausdruck in Beats", Pegel_dB, "peak"|"onset"], ...]
Ausdrücke dürfen K[i], wt(zeile, wort) und END verwenden (aus timing.js). Schreibt <film>/audio/sfx.wav.
Aufruf: uv run _shared/sfx.py <film>"""
import json, os, subprocess, sys, array

film = sys.argv[1].rstrip("/")
s = open(os.path.join(film, "timing.js")).read(); T = json.loads(s[s.index("{"):s.rindex("}") + 1])
env = {"K": T["cards"], "END": T["end"], "wt": lambda l, i: T["words"][l][i][1]}
dur = json.load(open(os.path.join(film, "film.json")))["duration"]
D = os.path.join(os.path.dirname(__file__), "sfx")

def peak_onset(mp3):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True).stdout
    a = array.array("h", raw); m = max(range(len(a)), key=lambda i: abs(a[i]))
    on = next((i for i, x in enumerate(a) if abs(x) > 0.1 * abs(a[m])), 0)
    return m / 8000, on / 8000, abs(a[m]) / 32768

ins, parts = [], []
for i, (name, expr, db, align) in enumerate(json.load(open(os.path.join(film, "sfx.json")))):
    mp3 = os.path.join(D, name + ".mp3")
    pk, on, amp = peak_onset(mp3)
    t = eval(expr, {}, env) * 0.5 - (pk if align == "peak" else on)
    norm = -20 * __import__("math").log10(amp) - 6          # Spitze auf -6 dBFS, dann Pegel
    ins += ["-i", mp3]
    parts.append(f"[{i}]volume={norm + db:.1f}dB,adelay={max(0, int(t * 1000))}:all=1[s{i}]")
graph = ";".join(parts) + ";" + "".join(f"[s{i}]" for i in range(len(parts))) + f"amix=inputs={len(parts)}:normalize=0,apad=whole_dur={dur}[out]"
subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *ins, "-filter_complex", graph, "-map", "[out]", "-ar", "48000", "-ac", "2", "-t", str(dur),
                os.path.join(film, "audio", "sfx.wav")], check=True)
print(f"{film}: {len(parts)} Effekte -> audio/sfx.wav")
