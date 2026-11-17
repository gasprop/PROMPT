#!/usr/bin/env python3
"""Contact sheet: tile a folder of frames into one labelled JPEG.
usage: python3 sheet.py <dir> <out.jpg> [cols] [thumb-w]
"""
import sys, os, re
from PIL import Image, ImageDraw

d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 270
files = [f for f in os.listdir(d) if f.lower().endswith((".jpg", ".jpeg", ".png"))]
files.sort(key=lambda f: int(re.sub(r"\D", "", f) or 0))
ims = [Image.open(os.path.join(d, f)).convert("RGB") for f in files]
th = round(tw * 16 / 9)
thumbs = []
for f, im in zip(files, ims):
    t = im.copy(); t.thumbnail((tw, th))
    canvas = Image.new("RGB", (tw, th + 18), (12, 12, 16))
    canvas.paste(t, ((tw - t.width) // 2, 0))
    ImageDraw.Draw(canvas).text((4, th + 3), f, fill=(235, 230, 220))
    thumbs.append(canvas)
rows = (len(thumbs) + cols - 1) // cols
sheet = Image.new("RGB", (cols * tw, rows * (th + 18)), (12, 12, 16))
for i, t in enumerate(thumbs):
    sheet.paste(t, ((i % cols) * tw, (i // cols) * (th + 18)))
sheet.save(out, quality=88)
print(f"{out}  {sheet.size}  {len(thumbs)} frames")
