# /// script
# dependencies = ["numpy", "scipy", "soundfile", "librosa"]
# ///
"""Lay the two ElevenLabs Music parts on the film's timeline -> audio/music.wav. Run after score.py.

Part 1 (dark, driving) starts on its first hit at frame 0, is stretched by repeating whole bars so it runs to
a hard stop just before "But you don't have to.", then silence. Part 2 (uplifting) is placed so its fade-out
ends with the film; it comes in muffled under "Somewhere, someone…" and its low-pass opens up until it is
fully open on "That's exactly who Xyntal finds for you." (the drop). beats.json is left alone.
"""
import json, os, pathlib, subprocess, sys
import numpy as np, soundfile as sf, librosa
HERE = pathlib.Path(__file__).resolve().parent
AUDIO, FILM = HERE.parent, HERE.parent.parent
found = sorted((pathlib.Path.home() / ".claude/plugins").glob("**/skills/motion-reel/scripts/dsp.py"))
sys.path.insert(0, os.environ.get("MOTION_REEL_SKILL", "") + "/scripts" if os.environ.get("MOTION_REEL_SKILL") else str(found[-1].parent))
from dsp import sweep_filter  # noqa: E402
SR = 48000
def load(p):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(p), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)
P1, P2 = load(HERE / "part_1.mp3"), load(HERE / "part_2.mp3")
vo = json.loads((FILM / "vo.json").read_text())
DUR = vo["duration"]
L = {l["i"]: l for l in vo["lines"]}
turn, hope, drop = L[7]["t0"], L[8]["t0"], L[9]["t0"]
db = lambda x, hop=480: 20 * np.log10(librosa.feature.rms(y=x.mean(axis=0), frame_length=hop * 2, hop_length=hop)[0] + 1e-9)
# part 1: from its first hit; repeat whole bars until it reaches the stop
d1 = db(P1); lead = int(np.argmax(d1 > d1.max() - 8)) * 480 / SR
on = librosa.onset.onset_detect(y=P1.mean(axis=0), sr=SR, units="time", backtrack=True)
lead = float(on[np.argmin(np.abs(on - lead))])
tempo, beats = librosa.beat.beat_track(y=P1.mean(axis=0), sr=SR, units="time")
bar = 4 * 60 / float(np.atleast_1d(tempo)[0])
stop = turn - 0.25
need = stop - (P1.shape[1] / SR - lead)
nbars = max(0, int(np.ceil((need + 4.0) / bar)))      # +4 s: the part fades at its end, so cut before that
a = beats[np.argmin(np.abs(beats - (lead + 8 * bar)))]; b = a + nbars * bar
ia, ib, f = int(a * SR), int(b * SR), int(0.01 * SR)
seg = P1[:, ia:ib]
ramp = np.linspace(0, 1, f)
join = P1[:, ib - f:ib] * np.cos(ramp * np.pi / 2) + P1[:, ia - f:ia] * np.sin(ramp * np.pi / 2)
P1x = np.concatenate([P1[:, :ib - f], join, seg, P1[:, ib:]], axis=1)[:, int(lead * SR):]
out = np.zeros((2, int(DUR * SR) + SR))
n1 = int(stop * SR)
part1 = P1x[:, :n1].copy(); hs = int(0.02 * SR); part1[:, -hs:] *= np.linspace(1, 0, hs)
out[:, :n1] += part1
print(f"part 1: from {lead:.2f}s, {nbars} bars ({bar:.2f}s) repeated, hard stop at {stop:.2f}s")
# part 2: placed so its own fade ends with the film; muffled -> open from "Somewhere" to the drop
d2 = db(P2); end2 = (len(d2) - np.argmax(d2[::-1] > -40)) * 480 / SR
s2 = DUR - 0.3 - end2
seg2 = P2.copy()
t = np.arange(seg2.shape[1]) / SR + s2
pr = np.clip((t - hope + 0.5) / (drop - hope + 0.5), 0, 1)
fc = 250 * (18000 / 250) ** (pr ** 1.6)
seg2 = np.stack([sweep_filter(ch, fc, "lowpass", 0.9) for ch in seg2])
gain = np.where(t < hope - 0.5, 0.0, 10 ** ((-14 + 14 * pr ** 1.2) / 20))
seg2 *= gain
i2 = int(s2 * SR)
k0 = max(0, -i2); n2 = min(seg2.shape[1] - k0, out.shape[1] - max(i2, 0))
out[:, max(i2, 0):max(i2, 0) + n2] += seg2[:, k0:k0 + n2]
out = out[:, :int(DUR * SR)]
tail = int(1.2 * SR); out[:, -tail:] *= np.linspace(1, 0, tail) ** 2
out /= np.abs(out).max() + 1e-9; out *= 0.6
sf.write(AUDIO / "music.wav", out.T, SR, subtype="PCM_24")
print(f"part 2 from {s2:.2f}s (fade ends {s2 + end2:.2f}s); opens {hope:.2f}s -> fully open {drop:.2f}s; film {DUR:.1f}s")
