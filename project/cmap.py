#!/usr/bin/env python3
"""Colour-class ASCII map of a frame: which regions are sky/white-ink/black/molasses/brick/grass/grey.
usage: python3 cmap.py <frame.jpg> [cols]
"""
import sys, numpy as np
from PIL import Image

def classify(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(2); mn = a.min(2); d = mx - mn + 1e-6
    v = mx; s = d / (mx + 1e-6)
    # hue in degrees
    h = np.zeros_like(mx)
    m = (mx == r); h[m] = ((g - b) / d)[m] % 6
    m = (mx == g) & (mx != r); h[m] = ((b - r) / d)[m] + 2
    m = (mx == b) & (mx != r) & (mx != g); h[m] = ((r - g) / d)[m] + 4
    h = h * 60
    out = np.full(mx.shape, ".", dtype="<U1")
    out[(v > 0.90) & (s < 0.14)] = "W"                      # stark white (heads, clouds, paper)
    out[(v < 0.13)] = "K"                                    # ink / black limbs
    out[(s < 0.16) & (v >= 0.13) & (v <= 0.90)] = "E"        # grey (street, steel)
    out[(s >= 0.16) & (v >= 0.13)] = "?"
    out[(h >= 185) & (h <= 265) & (s > 0.12)] = "S"          # sky blue
    out[(h > 70) & (h < 175) & (s > 0.20)] = "G"             # grass / trees
    out[(h >= 12) & (h <= 45) & (s > 0.30) & (v < 0.72)] = "B"  # molasses / brown wood
    out[((h < 12) | (h > 340)) & (s > 0.28)] = "R"           # brick / red
    out[(h > 45) & (h <= 70) & (s > 0.30)] = "Y"             # gold / warm light
    out[(s > 0.16) & (v < 0.13)] = "K"
    return out

def main(path, cols=48):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    h, w, _ = a.shape
    cls = classify(a)
    rows = max(1, int(cols * h / w * 0.5))
    small = np.asarray(im.resize((cols, rows), Image.LANCZOS).convert("RGB")).astype(np.float32) / 255.0
    sc = classify(small)
    print(f"{path}  {w}x{h}")
    print("  +" + "-" * cols + "+")
    for r in range(rows):
        print("  |" + "".join(sc[r]) + "|")
    print("  +" + "-" * cols + "+")
    flat = sc.reshape(-1)
    tot = flat.size
    counts = {c: int((flat == c).sum()) for c in "WKESGBRY.?"}
    print("  " + "  ".join(f"{c}={100*n/tot:.0f}%" for c, n in counts.items() if n))

if __name__ == "__main__":
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 48
    for p in sys.argv[1:2] if len(sys.argv) > 2 else sys.argv[1:]:
        main(p, cols)
