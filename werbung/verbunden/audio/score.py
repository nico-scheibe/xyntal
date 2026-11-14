# /// script
# requires-python = ">=3.10"
# dependencies = ["librosa>=0.10", "numpy", "scipy", "soundfile"]
# ///
"""Xyntal – Verbunden: bespoke score + VO edit on the grid.

    MOTION_REEL_SKILL=<skill> uv run verbunden/audio/score.py

84 BPM, D minor -> F major lift at the reveal. Each VO line (audio/vo/takes.json, one ElevenLabs take per
line with character alignment) lands its speech onset on a half beat. The music follows the story:
  piano alone (the idea)  ->  dark pad (the night)  ->  silence ("Aber hier ist der Punkt")
  ->  a heartbeat pulse that builds (the other lights)  ->  full lift on "Lerne Xyntal kennen".
Writes music.wav, vo.wav, ../beats.json, ../vo.json (lines + words in film time).
"""
import json
import os
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
from scipy import signal


def _skill_dir():
    if os.environ.get("MOTION_REEL_SKILL"):
        return Path(os.environ["MOTION_REEL_SKILL"])
    found = sorted((Path.home() / ".claude/plugins").glob("**/skills/motion-reel/scripts/dsp.py"))
    if found:
        return found[-1].parent.parent
    sys.exit("set MOTION_REEL_SKILL")


sys.path.insert(0, str(_skill_dir() / "scripts"))
from dsp import *  # noqa: E402,F403

HERE = Path(__file__).resolve().parent
FILM = HERE.parent
BPM = 84
BEAT = 60 / BPM
seed(20261114)

# silence wanted before each line (s); the line then starts on the next half beat
GAP = {0: 0.0, 1: 0.45, 2: 0.45, 3: 0.4, 4: 0.85, 5: 0.55, 6: 0.55, 7: 0.9, 8: 1.25, 9: 0.6,
       10: 0.45, 11: 0.45, 12: 0.6, 13: 1.05, 14: 0.6, 15: 0.55}
FIRST_BEAT = 0.5
WHOLE = {7, 13, 15}  # these lines start on a whole beat (the turn, the reveal, the CTA)
TAIL = 4.2          # end card hold after the last word


def T(b):
    return b * BEAT


# ---------------------------------------------------------------- VO edit

def load_lines():
    takes = json.loads((HERE / "vo" / "takes.json").read_text())
    out = []
    for tk in takes:
        y, _ = librosa.load(HERE / "vo" / tk["mp3"], sr=SR, mono=True)
        al = json.loads((HERE / "vo" / tk["mp3"]).with_suffix(".json").read_text())
        ch, st, en = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
        # words from characters
        words, cur = [], None
        for c, s, e in zip(ch, st, en):
            if c.isspace():
                if cur:
                    words.append(cur)
                cur = None
                continue
            if cur is None:
                cur = {"w": c, "t0": s, "t1": e}
            else:
                cur["w"] += c
                cur["t1"] = e
        if cur:
            words.append(cur)
        # true speech onset/offset from the envelope (alignment runs a little late)
        hop = int(SR * 0.005)
        rms = librosa.feature.rms(y=y, frame_length=hop * 4, hop_length=hop)[0]
        db = 20 * np.log10(rms + 1e-9) - 20 * np.log10(rms.max())
        loud = np.nonzero(db > -34)[0]
        on, off = loud[0] * 0.005, loud[-1] * 0.005 + 0.04
        out.append({"i": tk["i"], "text": tk["text"], "y": y, "on": on, "off": off, "words": words})
    return out


def place(lines):
    b = FIRST_BEAT
    t_end = 0.0
    for ln in lines:
        if ln["i"] > 0:
            need = t_end + GAP[ln["i"]]
            q = 1.0 if ln["i"] in WHOLE else 0.5
            b = np.ceil(need / (BEAT * q) - 1e-6) * q
        ln["beat"] = float(b)
        ln["shift"] = T(b) - ln["on"]
        t_end = ln["off"] + ln["shift"]
        ln["t0"], ln["t1"] = T(b), t_end
    return lines


def vo_chain(x):
    x = filt(x, "highpass", 80, 2)
    x = peq(x, 250, -2.0, 1.0)
    x = peq(x, 3000, 2.5, 0.9)
    x = peq(x, 10000, 1.5, 0.7)
    e = env_follow(x, 0.004, 0.08)
    over = np.maximum(20 * np.log10(e + 1e-9) + 22, 0)
    return x * 10 ** ((-over * (1 - 1 / 2.5) + 3) / 20)


# ---------------------------------------------------------------- instruments

def piano(note, length=2.4, vel=1.0):
    """Soft felt-piano-ish tone: FM with a quick bright attack, inharmonic shimmer, long decay."""
    n = int(length * SR)
    t = tvec(n)
    f = hz(note)
    idx = (1.0 + 0.8 * vel) * np.exp(-t / 0.12)
    x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    x += 0.22 * np.sin(2 * np.pi * f * 2.003 * t) * np.exp(-t / 0.5)
    x += 0.08 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.25)
    x = filt(x, "lowpass", 2400 + 2400 * vel)
    env = np.exp(-t / (0.9 + 0.6 * (f < 300))) * (1 - np.exp(-t / 0.004))
    env *= np.clip((length - t) / 0.08, 0, 1)
    return x * env * vel


def heart(gain=1.0):
    """Soft low thump (felt kick)."""
    n = int(0.5 * SR)
    t = tvec(n)
    f = 46 + 50 * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    return np.tanh(1.3 * x) * (1 - np.exp(-t / 0.002)) * gain


def bell(note, length=2.0):
    n = int(length * SR)
    t = tvec(n)
    f = hz(note)
    x = np.sin(2 * np.pi * f * t + 1.6 * np.exp(-t / 0.4) * np.sin(2 * np.pi * f * 3.5 * t))
    return x * np.exp(-t / 0.7) * (1 - np.exp(-t / 0.002))


def swell(length, f0=200, f1=3000):
    """Reverse-cymbal-like noise swell (rising), ends on the downbeat."""
    n = int(length * SR)
    p = np.linspace(0, 1, n)
    x = sweep_filter(rng.standard_normal(n), f0 * (f1 / f0) ** p, "bandpass", 0.9)
    return x * p ** 3


# ---------------------------------------------------------------- score

def main():
    lines = place(load_lines())
    L = {ln["i"]: ln["beat"] for ln in lines}
    END_T = lines[-1]["t1"] + TAIL
    DUR = float(np.ceil(END_T * 10) / 10)
    N = int(DUR * SR)
    NB = int(DUR / BEAT) + 1
    print(f"duration {DUR:.1f}s, {NB} beats")
    for (ln, nx) in zip(lines, lines[1:] + [None]):
        gap = (nx["t0"] - ln["t1"]) if nx else 0
        print(f"  L{ln['i']:02d} beat {ln['beat']:6.1f}  {ln['t0']:6.2f}-{ln['t1']:6.2f}  gap {gap*1000:5.0f}ms  {ln['text'][:50]}")

    # ---- VO
    vo = np.zeros(N + SR)
    for ln in lines:
        y = ln["y"]
        s = int(round(ln["shift"] * SR))
        if s < 0:
            y = y[-s:]
            s = 0
        vo[s:s + len(y)] += y[: len(vo) - s]
    vo = vo_chain(vo[:N])
    vo = vo / (np.abs(vo).max() + 1e-9) * 0.7
    sf.write(HERE / "vo.wav", np.stack([vo, vo]).T, SR, subtype="PCM_24")

    # ---- sections in beats
    b_night = L[4] - 1          # pad darkens
    b_cut = L[7] - 0.5          # everything stops before "Aber hier ist der Punkt"
    b_lift = L[13]              # the reveal
    b_pulse = b_lift - 4 * np.floor((b_lift - (L[8] - 1)) / 4)   # heartbeat: whole bars into the lift
    b_end = DUR / BEAT

    piano_b, pad_b, perc_b, bass_b, fx_b = (Bus(DUR, BPM) for _ in range(5))

    # D minor: i - VI - III - VII  (Dm Bb F C), one chord per bar
    prog_min = [("D", ["D3", "F3", "A3"], ["A4", "D5", "F5", "A4"]),
                ("Bb", ["Bb2", "D3", "F3"], ["F4", "Bb4", "D5", "F4"]),
                ("F", ["F2", "A2", "C3"], ["C5", "F5", "A5", "C5"]),
                ("C", ["C3", "E3", "G3"], ["G4", "C5", "E5", "G4"])]
    # the lift: Bb - F - C - Dm in a brighter, wider voicing (F major feel)
    prog_maj = [("Bb", ["Bb2", "F3", "D4"], ["D5", "F5", "Bb5", "F5"]),
                ("F", ["F2", "C3", "A3"], ["C5", "F5", "A5", "G5"]),
                ("C", ["C3", "G3", "E4"], ["E5", "G5", "C6", "G5"]),
                ("D", ["D3", "A3", "F4"], ["F5", "A5", "D6", "A5"])]

    # ---- 1) the idea: piano arpeggio in eighths/quarters, with a pad that darkens at night
    bar = 0
    b = 0.0
    while b < b_cut:
        root, chord, arp = prog_min[bar % 4]
        night = b >= b_night
        pad_b.add(pad_chord(chord, T(4.2), 700 if night else 1100, attack=0.6, release=0.8, voices=4, detune=0.08),
                  b, 0.33 if night else 0.22)
        bass_b.add(piano(chord[0][:-1] + "2", T(4), 0.7), b, 0.35)
        step = 1.0 if night else 0.5
        for k in range(int(4 / step)):
            bb = b + k * step
            if bb >= b_cut - 0.25:
                break
            nt = arp[k % 4]
            if night:
                nt = nt[:-1] + str(int(nt[-1]) - 1)
            piano_b.add(piano(nt, 2.2, 0.55 if k % 2 else 0.7), bb, 0.42, pan=(-0.25 if k % 2 else 0.2))
        b += 4
        bar += 1

    # ---- 2) the turn: a single low piano note and air under "Aber hier ist der Punkt:"
    piano_b.add(piano("D2", 4.0, 0.9), L[7], 0.6)
    piano_b.add(piano("A3", 3.0, 0.5), L[7], 0.3, pan=0.2)
    fx_b.add(swell(T(b_pulse - L[7]), 150, 1800), L[7], 0.12)

    # ---- 3) the other lights: heartbeat pulse, bass eighths, rising arpeggio, riser into the lift
    b = b_pulse
    bar = 0
    while b < b_lift:
        root, chord, arp = prog_min[bar % 4]
        prog = (b - b_pulse) / max(1, b_lift - b_pulse)
        for k in (0, 2):
            if b + k < b_lift:
                perc_b.add(heart(0.8 + 0.3 * prog), b + k, 0.9)
        if prog > 0.45:
            for k in (1, 3):
                if b + k < b_lift:
                    perc_b.add(heart(0.5), b + k, 0.5)
        for k in range(8):
            bb = b + k * 0.5
            if bb >= b_lift - 0.01:
                break
            bass_b.add(bass_note(chord[0][:-1] + "2", BEAT * 0.42, 500 + 900 * prog), bb, 0.22 + 0.12 * prog)
            nt = arp[k % 4]
            piano_b.add(piano(nt, 1.6, 0.45 + 0.3 * prog), bb, 0.3 + 0.15 * prog, pan=(-0.3 if k % 2 else 0.3))
        pad_b.add(pad_chord(chord, T(4.2), (600 + 2000 * prog), attack=0.4, release=0.6, voices=4, detune=0.1),
                  b, 0.22 + 0.1 * prog)
        b += 4
        bar += 1
    rl = min(4.0, b_lift - b_pulse)
    fx_b.add(riser(T(rl)), b_lift - rl, 0.2)
    fx_b.add(swell(T(2), 300, 6000), b_lift - 2, 0.25)

    # ---- 4) the lift: open chords, bells, a steady soft four-on-the-floor
    fx_b.add(sub_drop(1.6, 70, 32), b_lift, 0.75)
    fx_b.add(crash(2.4), b_lift, 0.18)
    b = b_lift
    bar = 0
    while b < b_end - 0.01:
        root, chord, arp = prog_maj[bar % 4]
        last = b + 4 >= b_end - 4.5
        hold = T(b_end - b) if last else T(4.3)
        pad_b.add(pad_chord(chord + [arp[1]], hold, 2600, attack=0.05 if bar == 0 else 0.3, release=1.2,
                            voices=5, detune=0.14), b, 0.34)
        bass_b.add(bass_note(chord[0], min(hold, T(3.8)), 700), b, 0.32)
        if not last:
            for k in range(4):
                perc_b.add(heart(0.9), b + k, 0.8)
                perc_b.add(hat(), b + k + 0.5, 0.05, pan=0.3)
            for k in range(8):
                piano_b.add(piano(arp[k % 4], 1.8, 0.75), b + k * 0.5, 0.36, pan=(-0.3 if k % 2 else 0.3))
            piano_b.add(bell(arp[2], 2.2), b, 0.14, pan=0.4)
        else:
            piano_b.add(piano(chord[0], 6.0, 0.9), b, 0.5)
            for j, nt in enumerate(arp[:3]):
                piano_b.add(piano(nt, 6.0, 0.7), b + j * 0.25, 0.3, pan=(j - 1) * 0.3)
            piano_b.add(bell(arp[2], 4.0), b + 1, 0.16)
            break
        b += 4
        bar += 1

    # ---- mix
    ir = reverb_ir(2.4, 0.7)
    wet_src = piano_b.x * 0.6 + pad_b.x * 0.3 + fx_b.x * 0.2
    wet = np.stack([signal.fftconvolve(wet_src[c], ir[c])[: wet_src.shape[1]] for c in range(2)])
    kick_t = [T(x) for x in np.arange(b_pulse, b_end, 1.0)]
    pump = sidechain(kick_t, pad_b.x.shape[1], 0.25, 0.15)
    bed = piano_b.x * 0.9 + pad_b.x * pump + perc_b.x * 0.9 + bass_b.x * 0.85 + fx_b.x * 0.8 + wet * 0.55
    bed = np.stack([filt(ch, "highpass", 30) for ch in bed])[:, :N]
    # hard silence before the turn line except the reverb tail of the last piano notes
    a = int(T(b_cut) * SR)
    z = int(T(L[7]) * SR)
    g = np.ones(N)
    g[a:z] = np.linspace(1, 0, z - a) ** 3
    bed[:, a:z] *= g[a:z]
    bed /= np.abs(bed).max() + 1e-9
    bed *= 0.55
    fade = int(1.2 * SR)
    bed[:, -fade:] *= np.linspace(1, 0, fade) ** 2
    sf.write(HERE / "music.wav", bed.T, SR, subtype="PCM_24")

    # ---- grid: designed, so write it directly (the measured fit would only find the pulse section)
    beats = [round(T(i), 5) for i in range(NB)]
    sections = {"idee": [0, b_night], "nacht": [b_night, b_cut], "wendung": [b_cut, b_pulse],
                "lichter": [b_pulse, b_lift], "xyntal": [b_lift, b_end]}
    grid = {"bpm": BPM, "period": round(BEAT, 6), "offset": 0.0, "beats": beats, "downbeats": beats[::4],
            "sections": {k: [round(v[0], 2), round(v[1], 2)] for k, v in sections.items()},
            "source": "verbunden/audio/score.py (designed grid)"}
    (FILM / "beats.json").write_text(json.dumps(grid, indent=1))

    vo_json = []
    for ln in lines:
        ws = [{"w": w["w"], "t0": round(w["t0"] + ln["shift"], 3), "t1": round(w["t1"] + ln["shift"], 3)} for w in ln["words"]]
        vo_json.append({"i": ln["i"], "text": ln["text"], "beat": ln["beat"], "t0": round(ln["t0"], 3),
                        "t1": round(ln["t1"], 3), "words": ws})
    (FILM / "vo.json").write_text(json.dumps({"bpm": BPM, "duration": DUR, "sections": grid["sections"],
                                              "lines": vo_json}, ensure_ascii=False, indent=1))
    fj = json.loads((FILM / "film.json").read_text())
    fj["duration"] = DUR
    (FILM / "film.json").write_text(json.dumps(fj, indent=2))
    print("sections (beats):", grid["sections"])


if __name__ == "__main__":
    main()
