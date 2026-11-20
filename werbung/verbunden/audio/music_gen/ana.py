# /// script
# dependencies = ["librosa", "numpy", "soundfile"]
# ///
import librosa, numpy as np, sys
for f in ["part_A.mp3", "part_B.mp3"]:
    y, sr = librosa.load(f, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
    rms = librosa.feature.rms(y=y, hop_length=512)[0]; t = librosa.times_like(rms, sr=sr, hop_length=512)
    db = 20*np.log10(rms+1e-9)
    print(f, "tempo", np.round(tempo, 1), "dur", round(len(y)/sr, 2))
    for s in range(0, int(len(y)/sr), 2):
        m = (t >= s) & (t < s+2); print(f"  {s:2d}s {db[m].mean():6.1f} dB")
    if f == "part_B.mp3":
        lo = librosa.feature.rms(y=librosa.effects.preemphasis(y, coef=-0.95), hop_length=512)[0]
        win = (t > 20) & (t < 32)
        d = np.diff(np.convolve(db, np.ones(4)/4, 'same'))
        idx = np.where(win[1:])[0]
        j = idx[np.argmax(d[idx])]
        on = librosa.onset.onset_detect(y=y, sr=sr, units='time', backtrack=True)
        near = on[(on > t[j]-0.3) & (on < t[j]+0.3)]
        print("  biggest rise at", round(t[j], 3), "onsets near", np.round(near, 3))
        print("  beats around:", np.round(librosa.frames_to_time(beats, sr=sr)[(librosa.frames_to_time(beats, sr=sr) > 22) & (librosa.frames_to_time(beats, sr=sr) < 30)], 3))
