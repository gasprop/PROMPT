#!/usr/bin/env python3
"""Sound design for "The Great Molasses Flood": writes work/music.wav and work/sfx.wav (48 kHz stereo float).
Music: a small period plucked-string + bass loop that STOPS at the twist line (shot 31) and leaves a low drone.
SFX: a cue table keyed to work/cues.json frame numbers. Levels are set relative to the voice in mix.py.
"""
import json, os, pathlib
import numpy as np

SR = 48000
ROOT = pathlib.Path(__file__).resolve().parent
WORK = ROOT / "work"
FPS = 30

# ---------------------------------------------------------------- helpers
def ns(t): return int(round(t * SR))
def env(n, a=0.01, r=0.08, k=0.4):
    """attack/decay envelope of length n samples"""
    e = np.ones(n, np.float32)
    na, nr = max(1, ns(a)), max(1, ns(r))
    na, nr = min(na, n), min(nr, n - na)
    e[:na] = np.linspace(0, 1, na) ** 2
    e[n - nr:] *= np.linspace(1, 0, nr) ** 2
    e *= (1 - k * np.linspace(0, 1, n))
    return e
def tone(f, t, phase=0.0):
    return np.sin(2 * np.pi * f * t + phase)
def placement(buf, sig, t0):
    i = ns(t0); j = min(len(buf), i + len(sig))
    if i < j: buf[i:j] += sig[: j - i]
def stereo(buf, width=0.55):
    """mono float buffer -> stereo with a little width"""
    out = np.zeros((len(buf), 2), np.float32)
    d = np.roll(buf, 9)
    out[:, 0] = buf * (1 - width * 0.5) + d * width * 0.5
    out[:, 1] = buf * (1 - width * 0.5) + np.roll(buf, -9) * width * 0.5
    return out
def karplus(f, dur, amp=0.5, damp=0.996):
    """plucked string"""
    p = max(2, int(SR / f))
    n = ns(dur)
    buf = (np.random.default_rng(int(f * 1000)).random(p) * 2 - 1).astype(np.float32)
    out = np.zeros(n, np.float32)
    idx = 0
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx + 1) % p
        buf[idx] = (buf[idx] + buf[nxt]) * 0.5 * damp
        idx = nxt
    return out * amp
def noise(dur, lp=0.12):
    n = ns(dur)
    x = np.random.default_rng(7).standard_normal(n).astype(np.float32)
    # one-pole lowpass
    y = np.empty(n, np.float32); acc = 0.0
    for i in range(n):
        acc += lp * (x[i] - acc); y[i] = acc
    return y
def sweep(f0, f1, dur, amp=0.4):
    t = np.arange(ns(dur)) / SR
    ph = 2 * np.pi * (f0 * t + (f1 - f0) * t * t / (2 * dur))
    return np.sin(ph) * env(ns(dur), 0.02, dur * 0.5, 0.2) * amp

# ---------------------------------------------------------------- music
def music(total_s, twist_t):
    """A.h. Fowler-style music-box waltz in D minor: plucked melody + pizzicato bass + a soft brush.
    Stops dead at the twist; a low drone carries the last shot."""
    buf = np.zeros(ns(total_s), np.float32)
    # D minor waltz, 3/4 at 132 bpm -> bar 1.364 s
    bpm, beat = 132, 60 / 132
    bar = 3 * beat
    # melody (D minor, music-box): (midi, beats)
    mel = [(62, 1), (65, 1), (69, 1), (67, 1.5), (65, 0.5), (62, 1), (60, 1), (62, 2),
           (65, 1), (69, 1), (74, 1), (72, 1.5), (69, 0.5), (65, 1), (62, 1), (60, 2),
           (58, 1), (62, 1), (65, 1), (69, 1.5), (67, 0.5), (65, 1), (62, 1), (58, 2),
           (62, 1), (65, 1), (69, 1), (72, 2), (74, 1), (69, 3)]
    bass = [45, 41, 43, 40] * 4          # D2 F2 G2 A2 ... one per bar
    f = lambda m: 440 * 2 ** ((m - 69) / 12)
    t = 0.4
    for i, (m, b) in enumerate(mel):
        if t > twist_t - 0.15: break
        placement(buf, karplus(f(m), min(b * beat * 0.9, 1.6), 0.30, 0.9965), t)
        t += b * beat
    tb = 0.55
    for i in range(int(min(twist_t, total_s) / bar) + 1):
        if tb > twist_t - 0.15: break
        placement(buf, karplus(f(bass[i % len(bass)]), 0.9, 0.34, 0.99), tb)
        tb += bar
    # soft brush on 2 and 3
    for k in range(1, 3):
        tb = 0.55 + k * beat
        while tb < min(twist_t - 0.15, total_s):
            placement(buf, noise(0.09, 0.5) * 0.05, tb)
            tb += bar
    # low drone after the twist
    if total_s > twist_t + 0.2:
        t = np.arange(ns(total_s - twist_t - 0.1)) / SR
        dr = (np.sin(2 * np.pi * 55 * t) * 0.5 + np.sin(2 * np.pi * 82.4 * t) * 0.25 + np.sin(2 * np.pi * 110 * t) * 0.15)
        dr *= env(len(t), 0.6, total_s - twist_t, 0.1)
        placement(buf, dr * 0.30, twist_t + 0.1)
    return buf

# ---------------------------------------------------------------- sfx
def sfx(total_s, twist_t, shots):
    buf = np.zeros(ns(total_s), np.float32)
    def beat(f0, f1, dur, amp): placement(buf, sweep(f0, f1, dur, amp), 0.0)
    # find shots by beat
    by = {s["beat"]: s for s in shots}
    def t(s): return s / FPS
    # hook: low rumble under the whole first shot
    rum = noise(3.0, 0.05) * 0.5
    placement(buf, rum, 0.0)
    # tank drips (shots 4,5,13)
    for b, n in [("tank_low", 5), ("tank_wall", 6), ("syrup", 4)]:
        s = by.get(b)
        if not s: continue
        for k in range(n):
            tt = t(s["a"]) + 0.25 + k * (t(s["b"] - s["a"]) / n)
            placement(buf, karplus(900 + 120 * (k % 3), 0.12, 0.16, 0.9) , tt)
            placement(buf, karplus(220, 0.2, 0.14, 0.8), tt + 0.03)
    # painter: brush strokes
    s = by.get("painter")
    if s:
        for k in range(8):
            placement(buf, noise(0.22, 0.25) * 0.16, t(s["a"]) + 0.2 + k * 0.35)
    # kids: small running steps + a laugh-ish chirp
    s = by.get("kids_jars")
    if s:
        for k in range(9):
            placement(buf, noise(0.07, 0.3) * 0.13, t(s["a"]) + 0.1 + k * 0.16)
    # barrels: rolls + a splash
    s = by.get("barrels")
    if s:
        for k in range(6):
            placement(buf, karplus(160 + 20 * k, 0.3, 0.16, 0.93), t(s["a"]) + 0.15 + k * 0.22)
        placement(buf, noise(0.5, 0.2) * 0.2, t(s["a"]) + 1.2)
    # letter / court: paper
    for b in ("letter", "court"):
        s = by.get(b)
        if s: placement(buf, noise(0.18, 0.45) * 0.10, t(s["a"]) + 0.3)
    # verdict: stamp thud
    s = by.get("verdict")
    if s:
        placement(buf, karplus(120, 0.25, 0.5, 0.85), t(s["b"]) - 0.25)
        placement(buf, noise(0.12, 0.15) * 0.25, t(s["b"]) - 0.25)
    # THE BURST: metal tear + huge surge
    s = by.get("burst")
    if s:
        placement(buf, sweep(900, 90, 0.5, 0.5), t(s["a"]))
        placement(buf, noise(2.6, 0.10) * 0.55, t(s["a"]) + 0.05)
        placement(buf, sweep(300, 40, 1.6, 0.4), t(s["a"]) + 0.1)
    # buildings: crash + brick rumble
    s = by.get("buildings")
    if s:
        placement(buf, noise(1.1, 0.14) * 0.5, t(s["a"]) + 0.1)
        for k in range(7):
            placement(buf, karplus(180 + 30 * k, 0.4, 0.2, 0.9), t(s["a"]) + 0.15 + k * 0.12)
    # railcar: metal clang + splinter
    s = by.get("railcar")
    if s:
        placement(buf, karplus(620, 0.9, 0.4, 0.94), t(s["a"]) + 0.1)
        placement(buf, karplus(930, 0.5, 0.25, 0.94), t(s["a"]) + 0.18)
        placement(buf, noise(0.5, 0.3) * 0.2, t(s["a"]) + 0.1)
    # cools: the dripping stops -> a couple of last plops
    s = by.get("cools")
    if s:
        for k in range(3):
            placement(buf, karplus(260, 0.25, 0.14, 0.85), t(s["a"]) + 0.4 + k * 0.5)
    # glue: sticky tug
    s = by.get("glue")
    if s:
        placement(buf, sweep(180, 90, 0.5, 0.25), t(s["a"]) + 0.2)
    # stuck: crowd murmur + calls
    s = by.get("stuck")
    if s:
        placement(buf, noise(t(s["b"] - s["a"]), 0.09) * 0.16, t(s["a"]))
        for k in range(4):
            placement(buf, sweep(500 + 60 * k, 380, 0.25, 0.07), t(s["a"]) + 0.3 + k * 0.4)
    # blame: low drone swell
    s = by.get("blame")
    if s: placement(buf, sweep(70, 55, 1.2, 0.22), t(s["a"]))
    # empty night: wind + a distant bell
    s = by.get("empty_night")
    if s:
        placement(buf, noise(t(s["b"] - s["a"]), 0.06) * 0.16, t(s["a"]))
        placement(buf, karplus(1180, 1.6, 0.10, 0.998), t(s["a"]) + 0.6)
    # tank_brown: crowd
    s = by.get("tank_brown")
    if s: placement(buf, noise(t(s["b"] - s["a"]), 0.08) * 0.14, t(s["a"]))
    # rule: pen on paper
    s = by.get("rule")
    if s:
        for k in range(5):
            placement(buf, noise(0.08, 0.5) * 0.08, t(s["a"]) + 0.3 + k * 0.3)
    # TWIST: low hit + sting, then nothing but the drone
    placement(buf, karplus(70, 1.4, 0.7, 0.9), twist_t)
    placement(buf, noise(0.5, 0.08) * 0.4, twist_t)
    placement(buf, sweep(1200, 300, 0.7, 0.18), twist_t + 0.02)
    # whooshes on the big camera moves
    for b in ("wave_street", "wave_front", "birdseye_flood", "wave_low"):
        s = by.get(b)
        if s: placement(buf, sweep(220, 700, 0.5, 0.10), t(s["a"]) + 0.05)
    return buf

def main():
    cues = json.loads((WORK / "cues.json").read_text())
    total = cues["total"]
    shots = cues["shots"]
    twist = max(s["a"] for s in shots if s["beat"] == "smell") / FPS
    total_s = total / FPS + 0.5
    m = music(total_s, twist)
    s = sfx(total_s, twist, shots)
    # gentle master safety: nothing above -1 dBFS before mix.py
    for b, name in ((m, "music.wav"), (s, "sfx.wav")):
        pk = float(np.abs(b).max()) or 1.0
        if pk > 0.95: b *= 0.95 / pk
        np.save(WORK / name.replace(".wav", ".npy"), b)
        print(f"wrote work/{name}  {len(b)/SR:.2f}s  peak {np.abs(b).max():.3f}")
    print(f"twist at {twist:.2f}s")

if __name__ == "__main__":
    main()
