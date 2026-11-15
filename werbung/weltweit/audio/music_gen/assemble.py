# /// script
# dependencies = ["numpy", "soundfile", "librosa"]
# ///
"""Lay the two ElevenLabs Music parts on the film's timeline -> audio/music.wav.
Part 1 (alone, journey, reflection) from 0, faded into the breath before the reveal; part 2 placed so its
drop lands on "Meet Xyntal". beats.json is left alone. Run after score.py."""
import json, pathlib, subprocess
import numpy as np, soundfile as sf, librosa
HERE = pathlib.Path(__file__).resolve().parent
AUDIO, FILM = HERE.parent, HERE.parent.parent
SR = 48000
def load(p):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(p), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)
P1, P2 = load(HERE / "part_1.mp3"), load(HERE / "part_2.mp3")
vo = json.loads((FILM / "vo.json").read_text())
DUR = vo["duration"]
meet = next(l for l in vo["lines"] if l["text"].startswith("Meet"))["t0"]
y = P2.mean(axis=0); hop = 480
# the drop: of the onsets after the snare roll starts, the one followed by the loudest 150 ms
rms = librosa.feature.rms(y=y, frame_length=hop * 2, hop_length=hop)[0]
db = 20 * np.log10(rms + 1e-9)
on = librosa.onset.onset_detect(y=y, sr=SR, hop_length=hop, units="time", backtrack=True)
cand = on[(on > 1.5) & (on < 6)]
score = [db[int(c * SR / hop):int((c + 0.15) * SR / hop)].mean() for c in cand]
drop = float(cand[int(np.argmax(score))])
print(f"part 2 drop at {drop:.3f}s; 'Meet Xyntal' at {meet:.3f}s")
out = np.zeros((2, int(DUR * SR) + SR))
n1 = min(P1.shape[1], int((meet - 0.05) * SR))
a = P1[:, :n1].copy(); f = int(1.2 * SR); a[:, -f:] *= np.linspace(1, 0, f) ** 1.5
out[:, :n1] += a
s2 = int((meet - drop) * SR)
b = P2.copy(); fi = int(0.05 * SR); b[:, :fi] *= np.linspace(0, 1, fi)
n2 = min(b.shape[1], out.shape[1] - s2)
out[:, s2:s2 + n2] += b[:, :n2]
out = out[:, :int(DUR * SR)]
tail = int(1.5 * SR); out[:, -tail:] *= np.linspace(1, 0, tail) ** 2
out /= np.abs(out).max() + 1e-9; out *= 0.6
sf.write(AUDIO / "music.wav", out.T, SR, subtype="PCM_24")
print(f"part 2 from {s2 / SR:.2f}s to {(s2 + P2.shape[1]) / SR:.2f}s; film {DUR:.1f}s")
