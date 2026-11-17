#!/usr/bin/env python3
"""ElevenLabs v4 voiceover + word timings for the molasses short.
Reads the API key from $ELEVEN_API_KEY or .secrets/elevenlabs.key (gitignored).
Usage: python3 eleven.py [--voice VOICE_ID] [--out DIR]
Writes <out>/voice.mp3 and <out>/phrases.json (sentence frame ranges at 30 fps).
"""
import base64, json, os, re, sys, urllib.request, pathlib, ssl

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:
    SSL_CTX = ssl._create_unverified_context()

ROOT = pathlib.Path(__file__).resolve().parent
FPS = 30
MODEL = "eleven_v4"
# a steady, warm narrator; override with --voice or $ELEVEN_VOICE_ID / $ELEVENLABS_VOICE_ID
DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"

def load_key():
    k = os.environ.get("ELEVEN_API_KEY", "").strip() or os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if k:
        return k
    f = ROOT / ".secrets" / "elevenlabs.key"
    if f.exists():
        return f.read_text().strip()
    sys.exit("no API key: set ELEVEN_API_KEY or write .secrets/elevenlabs.key")

def strip_tags(t):
    return re.sub(r"[ \t]*\n[ \t]*", " ", re.sub(r"\[[^\]]*\]", "", t)).strip()

def main():
    args = sys.argv[1:]
    voice = os.environ.get("ELEVEN_VOICE_ID", DEFAULT_VOICE)
    out = ROOT / "work"
    if "--voice" in args:
        voice = args[args.index("--voice") + 1]
    if "--out" in args:
        out = pathlib.Path(args[args.index("--out") + 1])
    out.mkdir(parents=True, exist_ok=True)

    tagged = (ROOT / "work" / "script_tagged.txt").read_text().strip()
    # map every character of `tagged` to its index in `plain` (None inside a tag)
    cmap, plain_chars, i, n = [], [], 0, len(tagged)
    while i < n:
        if tagged[i] == "[":
            j = tagged.index("]", i)
            cmap.extend([None] * (j + 1 - i))
            i = j + 1
        else:
            cmap.append(len(plain_chars)); plain_chars.append(tagged[i]); i += 1
    plain = "".join(plain_chars).strip()
    script = (ROOT / "work" / "script.txt").read_text().strip()
    if script != plain:
        # the tagged read is the one that gets synthesized; report any drift vs script.txt
        print("WARNING: tagged script and script.txt differ")
        print("  tagged:", len(plain.split()), "words | script.txt:", len(script.split()), "words")

    body = json.dumps({"text": tagged, "model_id": MODEL}).encode()
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128"
    req = urllib.request.Request(url, data=body, headers={
        "xi-api-key": load_key(), "Content-Type": "application/json", "Accept": "application/json",
    })
    print("calling ElevenLabs v4 ...")
    with urllib.request.urlopen(req, timeout=180, context=SSL_CTX) as r:
        ctype = r.headers.get("Content-Type", "")
        raw = r.read()
    if "json" in ctype:
        data = json.loads(raw)
        audio = base64.b64decode(data["audio_base64"])
        align = data.get("alignment") or {}
    else:
        audio, align = raw, {}
    (out / "voice.mp3").write_bytes(audio)
    print("wrote", out / "voice.mp3", len(audio), "bytes")

    if not align:
        print("no alignment returned; run timing.py separately")
        return
    chars = align.get("characters", [])
    t0 = align.get("character_start_times_seconds") or align.get("char_start_times_seconds", [])
    t1 = align.get("character_end_times_seconds") or align.get("char_end_times_seconds", [])
    # word spans in the plain text
    words = [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"\S+", plain)]
    phrases, cur, cur_start = [], [], None
    for ws, we, w in words:
        ts = [t0[k] for k in range(min(len(chars), len(t0))) if cmap[k] is not None and ws <= cmap[k] < we]
        te = [t1[k] for k in range(min(len(chars), len(t1))) if cmap[k] is not None and ws <= cmap[k] < we]
        if not ts:
            continue
        a, b = min(ts), max(te)
        cur.append({"w": w, "a": a, "b": b, "fa": round(a * FPS), "fb": round(b * FPS)})
        if cur_start is None:
            cur_start = a
        if w.rstrip().endswith((".", "!", "?")):
            phrases.append({"text": " ".join(x["w"] for x in cur), "a": cur_start, "b": b,
                            "fa": round(cur_start * FPS), "fb": round(b * FPS), "words": list(cur)})
            cur, cur_start = [], None
    if cur:
        phrases.append({"text": " ".join(x["w"] for x in cur), "a": cur_start, "b": cur[-1]["b"],
                        "fa": round(cur_start * FPS), "fb": round(cur[-1]["b"] * FPS), "words": list(cur)})
    total = round((phrases[-1]["b"] if phrases else 0) * FPS)
    (out / "phrases.json").write_text(json.dumps({"fps": FPS, "total": total, "phrases": phrases}, indent=1))
    print("wrote", out / "phrases.json", "| sentences:", len(phrases), "| total frames:", total)

if __name__ == "__main__":
    main()
