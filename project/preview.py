#!/usr/bin/env python3
"""Numeric + ASCII preview of a rendered frame (for agents without vision)."""
import sys, numpy as np
from PIL import Image

def main(path, cols=54):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32) / 255.0
    h, w, _ = a.shape
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    print(f"{path}: {w}x{h}")
    print(f"  luma mean={lum.mean():.3f} p5={np.percentile(lum,5):.3f} p50={np.percentile(lum,50):.3f} p95={np.percentile(lum,95):.3f}")
    print(f"  sat mean={a.std(axis=2).mean():.3f}  near-black={100*(lum<0.02).mean():.1f}%  near-white={100*(lum>0.95).mean():.1f}%")
    rows = int(cols * h / w * 0.5)
    small = np.asarray(im.resize((cols, rows), Image.LANCZOS).convert("L")).astype(np.float32) / 255.0
    chars = " .:-=+*#%@"
    print("  +-" * cols)
    for r in range(rows):
        print("  |" + "".join(chars[min(9, int(v * 10))] for v in small[r]) + "|")
    print("  +-" * cols)

if __name__ == "__main__":
    for p in sys.argv[1:]:
        main(p)
