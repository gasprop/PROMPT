#!/usr/bin/env python3
"""Step 16: pick 3 dramatic stills from the rendered frames and build a choice sheet.
usage: python3 thumbs.py [framesDir] [out.jpg]
Frames default to the most striking beats: the burst, the wave front, and the twist.
"""
import pathlib, sys, json
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent
FPS = 30

PICKS = [("burst", "the tank lets go"), ("wave_front", "the wave hits the street"),
         ("smell", "the twist line")]

def main():
    d = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "frames"
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "stills" / "thumbs.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    cues = json.loads((ROOT / "work" / "cues.json").read_text())["shots"]
    by = {s["beat"]: s for s in cues}
    cards = []
    for beat, label in PICKS:
        s = by.get(beat)
        if not s: continue
        f = (s["a"] + s["b"]) // 2
        p = d / f"f_{f:05d}.jpg"
        if not p.exists():
            # fall back to the nearest rendered frame
            cand = sorted(d.glob("f_*.jpg"))
            if not cand: continue
            p = min(cand, key=lambda q: abs(int(q.stem.split("_")[1]) - f))
        im = Image.open(p).convert("RGB")
        im.thumbnail((360, 640))
        cards.append((im, f"{beat}\nframes {s['a']}-{s['b']}  ·  {label}"))
    if not cards: sys.exit("no frames to pick from")
    W = sum(c[0].width + 16 for c in cards) + 16
    H = max(c[0].height for c in cards) + 44
    sheet = Image.new("RGB", (W, H), (250, 250, 250))
    dr = ImageDraw.Draw(sheet)
    x = 16
    for im, cap in cards:
        sheet.paste(im, (x, 32))
        dr.text((x, 8), cap, fill=(20, 20, 20))
        x += im.width + 16
    sheet.save(out, quality=90)
    print("wrote", out, sheet.size)

if __name__ == "__main__":
    main()
