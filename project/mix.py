#!/usr/bin/env python3
"""Mix the voiceover with the music and SFX stems -> work/mix.wav (48 kHz stereo float32).
Rules (MASTER-PROMPT step 14):
  * music sits at -6 dB RMS relative to the voice (gated), and is ducked a further 3 dB while words are spoken
  * SFX peaks are capped at 0.7 x the voice peak
Usage: python3 mix.py [voice.mp3] [music.wav] [sfx.wav]
"""
import json, pathlib, subprocess, sys, shutil
import numpy as np

SR = 48000
ROOT = pathlib.Path(__file__).resolve().parent
WORK = ROOT / "work"
_FFMPEG_DEFAULT = "/home/user/PROMPT/.venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2"
FFMPEG = _FFMPEG_DEFAULT if pathlib.Path(_FFMPEG_DEFAULT).exists() else (shutil.which("ffmpeg") or "ffmpeg")

def decode(path, dur=None):
    cmd = [FFMPEG, "-y", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(SR), "-f", "f32le", "pipe:1"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def load_stem(path):
    if path.endswith(".npy"):
        return np.load(path).astype(np.float32)
    return decode(path)

def gated_rms(x, thr_db=-45):
    """RMS of the loudest 60 % of 50 ms frames (i.e. the speech, not the pauses)"""
    n = int(0.05 * SR)
    if len(x) < n: return float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    f = x[: len(x) // n * n].reshape(-1, n)
    r = np.sqrt(np.mean(f ** 2, axis=1))
    r = r[r > 0]
    if r.size == 0: return 1e-9
    k = max(1, int(r.size * 0.6))
    top = np.sort(r)[-k:]
    return float(np.sqrt(np.mean(top ** 2)) + 1e-9)

def main():
    voice_p = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else WORK / "voice.mp3"
    music_p = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else (WORK / "music.npy" if (WORK / "music.npy").exists() else WORK / "music.wav")
    sfx_p = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else (WORK / "sfx.npy" if (WORK / "sfx.npy").exists() else WORK / "sfx.wav")
    for p in (voice_p, music_p, sfx_p):
        if not p.exists():
            sys.exit(f"missing {p}")

    def anyload(p):
        return np.load(p).astype(np.float32) if p.suffix == ".npy" else decode(p)
    v = anyload(voice_p)
    m = anyload(music_p)
    s = anyload(sfx_p)
    total = json.loads((WORK / "cues.json").read_text())["total"]
    T = total / 30.0 + 0.5
    n = int(T * SR)
    def fit(x):
        y = np.zeros(n, np.float32)
        k = min(n, len(x)); y[:k] = x[:k]
        return y
    v, m, s = fit(v), fit(m), fit(s)

    v_rms = gated_rms(v)
    v_peak = float(np.abs(v).max()) or 1.0
    # music: -6 dB RMS vs the voice, ducked another 3 dB while words are spoken
    cues = json.loads((WORK / "cues.json").read_text())["shots"]
    words = np.zeros(n, bool)
    for sh in cues:
        a = int(sh["a"] / 30 * SR); b = int(sh["b"] / 30 * SR) + 1
        words[a:b] = True
    mg = np.ones(n, np.float32) * (v_rms / (gated_rms(m) or 1e-9)) * 10 ** (-6 / 20)
    mg[words] *= 10 ** (-3 / 20)
    m = m * mg
    # sfx: peaks capped at 0.7 x voice peak
    s = s * min(1.0, (0.7 * v_peak) / (np.abs(s).max() or 1.0))

    mix = v + m + s
    # keep the voice on top: nothing may clip
    pk = float(np.abs(mix).max()) or 1.0
    if pk > 0.99: mix *= 0.99 / pk
    st = np.stack([mix, mix], axis=1)
    np.save(WORK / "mix.npy", st)
    print(f"voice rms {v_rms:.4f} peak {v_peak:.3f}")
    print(f"music rms after gain {gated_rms(m):.4f}  ({20*np.log10(gated_rms(m)/v_rms):.1f} dB vs voice)")
    print(f"sfx peak {np.abs(s).max():.3f} (cap {0.7*v_peak:.3f})")
    print(f"wrote work/mix.npy  {len(mix)/SR:.2f}s  peak {np.abs(mix).max():.3f}")

if __name__ == "__main__":
    main()
