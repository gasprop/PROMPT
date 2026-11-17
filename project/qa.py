#!/usr/bin/env python3
"""QA gate for the rendered short (MASTER-PROMPT step 15):
  1. no black frames (mean luma < 8 / 255) — a blank frame is a render failure
  2. no frozen span >= 0.4 s (12 frames) — every frame must move
  3. frame count == cues.total
usage: python3 qa.py [framesDir]
"""
import pathlib, sys, json
import numpy as np
from PIL import Image

FPS = 30
ROOT = pathlib.Path(__file__).resolve().parent

def main():
    d = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "frames"
    files = sorted(d.glob("f_*.jpg"))
    total = json.loads((ROOT / "work" / "cues.json").read_text())["total"]
    print(f"{len(files)} frames (expected {total})")
    if not files: sys.exit("no frames")

    lums = np.zeros(len(files), np.float32)
    diffs = np.zeros(len(files), np.float32)
    prev = None
    for i, f in enumerate(files):
        a = np.asarray(Image.open(f).convert("L"), np.float32)
        lums[i] = a.mean()
        if prev is not None:
            diffs[i] = np.abs(a - prev).mean()
        prev = a
        if i % 300 == 0 and i: print(f"  scanned {i}/{len(files)}")

    black = np.where(lums < 8)[0]
    print(f"black frames (<8/255): {len(black)} {list(black[:10])}")
    print(f"luma min {lums.min():.1f}  mean {lums.mean():.1f}  max {lums.max():.1f}")
    print(f"mean |frame diff| {diffs[1:].mean():.2f}  min {diffs[1:].min():.2f}")

    # frozen spans: consecutive frames with tiny diff
    thr = 0.35
    frozen = diffs[1:] < thr
    runs, cur = [], 0
    for i, b in enumerate(frozen):
        if b: cur += 1
        elif cur: runs.append((i - cur, i - 1, cur)); cur = 0
    if cur: runs.append((len(frozen) - cur, len(frozen) - 1, cur))
    bad = [r for r in runs if r[2] >= 12]
    print(f"frozen spans >= 0.4s (12f, diff<{thr}): {len(bad)}")
    for a, b, n in bad[:10]:
        print(f"   frames {a+1}..{b+1}  {n} frames  {n/FPS:.2f}s  diff {diffs[a+1:b+1].max():.2f}")

    # per-shot motion report (every shot should have some)
    cues = json.loads((ROOT / "work" / "cues.json").read_text())["shots"]
    worst = []
    for s in cues:
        a, b = s["a"], min(s["b"], len(files) - 1)
        if a >= len(files): continue
        m = float(diffs[a + 1:b + 1].mean()) if b > a else 0.0
        worst.append((m, s["id"], s["beat"]))
    worst.sort()
    print("quietest shots (mean frame diff):")
    for m, i, beat in worst[:6]:
        print(f"   {i:<16} {m:.3f}")
    ok = len(black) == 0 and len(bad) == 0 and len(files) == total
    print("QA:", "PASS" if ok else "FAIL")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
