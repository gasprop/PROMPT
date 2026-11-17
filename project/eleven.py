#!/usr/bin/env python3
"""ElevenLabs v4 voiceover + word timings for the molasses short.
Reads the API key from $ELEVEN_API_KEY or .secrets/elevenlabs.key (gitignored).
Usage: python3 eleven.py [--voice VOICE_ID] [--out DIR]
Writes <out>/voice.mp3 and <out>/phrases.json (sentence frame ranges at 30 fps).
"""
import base64, json, os, re, sys, urllib.request, urllib.error, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
FPS = 30
MODEL = "eleven_v4"

# FREE PLAN: the API only accepts PREMADE voices. A "library" voice (e.g. Rachel
# 21m00Tcm4TlvDq8ikWAM) returns HTTP 402 paid_plan_required even though GET /v1/voices
# lists it. These premade ids are verified to work on the free tier.
PREMADE = {
    "nPczCjzI2devNBz1zQrb": "Brian - deep, resonant, authoritative (best for this story)",
    "JBFqnCBsd6RMkjVDRZzb": "George - warm British storyteller, heavyweight",
    "CwhRBWXzGAHq8TQ4Fs17": "Roger - laid-back, casual, good with emotion tags",
    "EXAVITQu4vr4xnSDxMaL": "Sarah",
    "cgSgspJ2msm6clMCkdW9": "Jessica - playful",
    "pNInz6obpgDQGcFmaJgB": "Adam - dominant, firm",
}
DEFAULT_VOICE = "nPczCjzI2devNBz1zQrb"   # Brian
FFMPEG = "/home/user/PROMPT/.venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2"

def load_key():
    k = os.environ.get("ELEVEN_API_KEY", "").strip()
    if k:
        return k
    f = ROOT / ".secrets" / "elevenlabs.key"
    if f.exists():
        return f.read_text().strip()
    sys.exit("no API key: set ELEVEN_API_KEY or write .secrets/elevenlabs.key")

def strip_tags(t):
    return re.sub(r"[ \t]*\n[ \t]*", " ", re.sub(r"\[[^\]]*\]", "", t)).strip()

def probe(key):
    """Isolate key vs plan vs voice in one shot (see the free-plan brief)."""
    req = urllib.request.Request("https://api.elevenlabs.io/v1/user",
                                 headers={"xi-api-key": key})
    with urllib.request.urlopen(req, timeout=30) as r:
        u = json.loads(r.read())
    sub = u.get("subscription", {})
    print(f"HTTP 200 - key OK. plan={sub.get('tier')}  characters_used={sub.get('character_count')}"
          f"/{sub.get('character_limit')}  next_reset={sub.get('next_reset_period_chars')}")
    return u

def audio_seconds(path):
    import subprocess
    p = subprocess.run([FFMPEG, "-v", "error", "-i", str(path), "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"time=(\d+):(\d+):([\d.]+)", p.stderr)
    if not m:
        return None
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

def main():
    args = sys.argv[1:]
    key = load_key()
    if "--probe" in args:
        probe(key)
        return
    voice = os.environ.get("ELEVEN_VOICE_ID", DEFAULT_VOICE)
    out = ROOT / "work"
    if "--voice" in args:
        voice = args[args.index("--voice") + 1]
    if "--out" in args:
        out = pathlib.Path(args[args.index("--out") + 1])
    out.mkdir(parents=True, exist_ok=True)
    if voice not in PREMADE:
        print(f"WARNING: {voice} is not in the known PREMADE list. On the free plan a "
              f"library voice returns HTTP 402 paid_plan_required. Known premade ids:")
        for k, v in PREMADE.items():
            print(f"  {k}  {v}")

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
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            ctype = r.headers.get("Content-Type", "")
            raw = r.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        # free-plan 402 is almost always the voice_id, not the key
        print(f"HTTP {e.code}: {body}")
        if e.code == 402:
            print("-> paid_plan_required. On the free plan this means the voice_id is a "
                  "LIBRARY voice. Swap to a premade id:")
            for k, v in PREMADE.items():
                print(f"     {k}  {v}")
        raise
    if "json" in ctype:
        data = json.loads(raw)
        audio = base64.b64decode(data["audio_base64"])
        align = data.get("alignment") or {}
    else:
        audio, align = raw, {}
    (out / "voice.mp3").write_bytes(audio)
    print("wrote", out / "voice.mp3", len(audio), "bytes")

    if not align:
        # with-timestamps unavailable: still usable. Measure the real audio length and
        # spread the sentences across it in proportion to their word count.
        print("no alignment returned - falling back to measured duration + word-proportional timing")
        dur = audio_seconds(out / "voice.mp3")
        if not dur:
            print("could not measure voice.mp3; write phrases.json by hand")
            return
        sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", plain) if s.strip()]
        counts = [max(1, len(s.split())) for s in sents]
        tot = sum(counts)
        t = 0.0
        phrases = []
        for s, c in zip(sents, counts):
            d = dur * c / tot
            phrases.append({"text": s, "a": t, "b": t + d,
                            "fa": round(t * FPS), "fb": round((t + d) * FPS)})
            t += d
        (out / "phrases.json").write_text(json.dumps(
            {"fps": FPS, "total": round(dur * FPS), "phrases": phrases,
             "note": "word-proportional fallback (no alignment from API)"}, indent=1))
        print("wrote", out / "phrases.json", "| sentences:", len(phrases),
              "| total frames:", round(dur * FPS))
        return
    chars = align.get("characters", [])
    t0 = align.get("char_start_times_seconds", [])
    t1 = align.get("char_end_times_seconds", [])
    # word spans in the plain text
    words = [(m.start(), m.end(), m.group(0)) for m in re.finditer(r"\S+", plain)]
    phrases, cur, cur_start = [], [], None
    for ws, we, w in words:
        ts = [t0[k] for k in range(min(len(chars), len(t0))) if cmap[k] is not None and ws <= cmap[k] < we]
        te = [t1[k] for k in range(min(len(chars), len(t1))) if cmap[k] is not None and ws <= cmap[k] < we]
        if not ts:
            continue
        a, b = min(ts), max(te)
        cur.append({"w": w, "a": a, "b": b})
        if cur_start is None:
            cur_start = a
        if w.rstrip().endswith((".", "!", "?")):
            phrases.append({"text": " ".join(x["w"] for x in cur), "a": cur_start, "b": b,
                            "fa": round(cur_start * FPS), "fb": round(b * FPS)})
            cur, cur_start = [], None
    if cur:
        phrases.append({"text": " ".join(x["w"] for x in cur), "a": cur_start, "b": cur[-1]["b"],
                        "fa": round(cur_start * FPS), "fb": round(cur[-1]["b"] * FPS)})
    total = round((phrases[-1]["b"] if phrases else 0) * FPS)
    (out / "phrases.json").write_text(json.dumps({"fps": FPS, "total": total, "phrases": phrases}, indent=1))
    print("wrote", out / "phrases.json", "| sentences:", len(phrases), "| total frames:", total)

if __name__ == "__main__":
    main()
