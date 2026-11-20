# /// script
# dependencies = ["numpy", "soundfile", "librosa"]
# ///
"""Join the two ElevenLabs Music parts into audio/music.wav on the film's timeline.

Part A (the idea + the night) runs from 0 and has faded out before "But here's the thing".
Part B (build + drop) starts in that silence, placed so its drop lands on "Meet Xyntal";
eight beats of the drop are repeated so it carries under the end card. beats.json is left alone:
the picture keeps its designed grid. Run after score.py (which rewrites music.wav with the synth bed).
"""
import json, pathlib, subprocess
import numpy as np, soundfile as sf, librosa
HERE = pathlib.Path(__file__).resolve().parent
AUDIO, FILM = HERE.parent, HERE.parent.parent
SR = 48000
def load(p):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(p), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)
A, B = load(HERE / "part_A.mp3"), load(HERE / "part_B.mp3")
vo = json.loads((FILM / "vo.json").read_text())
DUR = vo["duration"]
meet = next(l for l in vo["lines"] if l["text"].startswith("Meet"))["t0"]     # "Meet Xyntal"
# the drop in part B: the biggest short-term level rise between 20 and 30 s, snapped to its onset
y = B.mean(axis=0); hop = 480
rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop)[0]
db = np.convolve(20 * np.log10(rms + 1e-9), np.ones(4) / 4, "same"); t = np.arange(len(db)) * hop / SR
w = np.where((t > 20) & (t < 30))[0]; j = w[np.argmax(np.diff(db)[w])]
on = librosa.onset.onset_detect(y=y, sr=SR, hop_length=hop, units="time", backtrack=True)
drop = float(on[np.argmin(np.abs(on - t[j]))])
tempo, _ = librosa.beat.beat_track(y=y, sr=SR, hop_length=hop)
beat = 60 / float(np.atleast_1d(tempo)[0])
print(f"part B drop at {drop:.3f}s, beat {beat:.3f}s; 'Meet Xyntal' at {meet:.3f}s")
# extend the drop: repeat eight beats starting four beats after the drop
a, b = int((drop + 4 * beat) * SR), int((drop + 12 * beat) * SR)
fade = int(0.012 * SR)
seg = B[:, a:b].copy()
ramp = np.linspace(0, 1, fade)
join = B[:, b - fade:b] * np.cos(ramp * np.pi / 2) + B[:, a - fade:a] * np.sin(ramp * np.pi / 2)   # equal-power splice
Bx = np.concatenate([B[:, :b - fade], join, seg, B[:, b:]], axis=1)
out = np.zeros((2, int(DUR * SR) + SR))
out[:, :A.shape[1]] += A
start = int((meet - drop) * SR)
n = min(Bx.shape[1], out.shape[1] - start)
out[:, start:start + n] += Bx[:, :n]
out = out[:, :int(DUR * SR)]
tail = int(1.5 * SR); out[:, -tail:] *= np.linspace(1, 0, tail) ** 2
out /= np.abs(out).max() + 1e-9; out *= 0.6
sf.write(AUDIO / "music.wav", out.T, SR, subtype="PCM_24")
print(f"part B starts at {start / SR:.2f}s, ends at {(start + Bx.shape[1]) / SR:.2f}s; film {DUR:.1f}s -> music.wav")
