#!/usr/bin/env python3
"""Build work/cues.json: the shot list, timed to the voiceover.

Source of truth for the picture. Each shot names the narration it carries (by 1-based sentence index in
work/script.txt, optionally a word range for a mid-sentence cut), a light preset, a camera pose and a creep
target, and a `beat` that story.ts stages. Shots longer than MAXF frames are split at a word boundary.

Timings come from work/phrases.json when it exists (real ElevenLabs v4 alignment); otherwise a pacing model
calibrated to the 1-minute / ~220-word budget is used, so the picture can be built before the audio lands.
"""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
FPS = 30
TOTAL = 1800
MAXF = 90                      # MASTER-PROMPT step 8: no shot holds longer than 90 frames
WPS = 0.331                    # seconds per spoken word (provisional model; real timings come from phrases.json)
PAUSE = 0.20                   # seconds of silence after each sentence

# ---------------------------------------------------------------- shot table
# cam: pos [x,y,z], look [x,y,z], fov (vertical deg), roll (deg). move: partial end pose (the creep).
SHOT_DEFS = [
    dict(beat="hook_face", light="day", sents=[(1, 0, None)],
         cam=dict(pos=[0.10, 1.50, 2.95], look=[0.0, 1.46, 2.0], fov=40),
         move=dict(pos=[0.06, 1.50, 2.72], fov=37),
         note="MCU the walker's white face; the molasses wall looms behind him. SFX: low rumble."),
    dict(beat="wave_street", light="day", sents=[(2, 0, None)],
         cam=dict(pos=[-3.0, 1.05, 9.0], look=[9.0, 2.0, -5.0], fov=52),
         move=dict(pos=[-2.0, 1.30, 7.6], look=[11.0, 1.8, -5.0]),
         note="Low down the street; the wave races across frame. SFX: whoosh + deep surge."),
    dict(beat="birdseye", light="day", sents=[(3, 0, None)],
         cam=dict(pos=[0.0, 46.0, 22.0], look=[0.0, 0.0, -8.0], fov=40),
         move=dict(pos=[0.0, 40.0, 19.0], look=[0.0, 0.0, -10.0]),
         note="Bird's eye over the North End rooftops to the tank. SFX: wind."),
    dict(beat="tank_low", light="day", sents=[(4, 0, None)],
         cam=dict(pos=[-14.0, 1.00, -1.0], look=[-14.0, 12.0, -26.0], fov=46),
         move=dict(pos=[-14.0, 1.15, -3.4], look=[-14.0, 13.0, -26.0]),
         note="Low angle up the tank; a worker crosses for scale. SFX: metal creak, drips."),
    dict(beat="tank_wall", light="day", sents=[(5, 0, None), (6, 0, None)],
         cam=dict(pos=[-14.0, 3.40, -11.0], look=[-14.0, 3.00, -25.0], fov=24),
         move=dict(pos=[-14.0, 3.20, -11.6], look=[-14.0, 2.20, -25.0], fov=22),
         note="Insert CU: riveted plates, rust streaks, a slow drip. SFX: drip, drip."),
    dict(beat="painter", light="day", sents=[(7, 0, None), (8, 0, None)],
         cam=dict(pos=[-11.6, 2.10, -9.2], look=[-10.3, 2.50, -14.0], fov=34),
         move=dict(pos=[-11.3, 2.20, -9.8], look=[-10.2, 2.30, -14.0]),
         note="Two-shot: painter on the ladder, brush loaded with brown paint. SFX: brush strokes."),
    dict(beat="kids_jars", light="day", sents=[(9, 0, None)],
         cam=dict(pos=[-16.5, 1.60, -5.0], look=[-12.0, 1.10, -13.0], fov=42),
         move=dict(pos=[-15.6, 1.55, -5.8], look=[-11.6, 1.05, -13.4]),
         note="Two kids run in with jars held out under the drips. SFX: running, laughing."),
    dict(beat="letter", light="day", sents=[(10, 0, None), (11, 0, None)],
         cam=dict(pos=[69.0, 2.20, 49.0], look=[68.6, 1.30, 38.8], fov=34),
         move=dict(pos=[69.4, 2.15, 48.2], look=[68.6, 1.26, 38.8]),
         note="Insert: the company man reads a warning letter at his desk. SFX: paper."),
    dict(beat="barrels", light="day", sents=[(12, 0, None)],
         cam=dict(pos=[-25.0, 1.70, 7.0], look=[-19.5, 1.10, 1.0], fov=44),
         move=dict(pos=[-24.0, 1.60, 6.2], look=[-19.0, 1.00, 0.6]),
         note="Warm molasses is barrelled in; steam rises. SFX: barrel rolls, splash."),
    dict(beat="sun_warm", light="day", sents=[(13, 0, None), (14, 0, None)],
         cam=dict(pos=[-6.0, 2.60, 12.0], look=[-12.0, 3.00, -22.0], fov=46),
         move=dict(pos=[-6.6, 2.40, 11.0], look=[-12.4, 3.20, -23.0]),
         note="Wide: the tank in hard sun, heat shimmer, a man wipes his brow. SFX: wind, distant crowd."),
    dict(beat="burst", light="golden", sents=[(15, 0, None)],
         cam=dict(pos=[-13.0, 1.10, -6.0], look=[-14.0, 6.00, -26.0], fov=48, roll=-3),
         move=dict(pos=[-13.2, 1.20, -7.0], look=[-14.0, 7.00, -26.0], roll=-5),
         note="THE BURST: the tank wall lets go and molasses erupts. SFX: metal tear, huge surge, 7-frame shake."),
    dict(beat="syrup", light="day", sents=[(16, 0, None), (17, 0, None), (18, 0, None)],
         cam=dict(pos=[-12.4, 1.10, -11.2], look=[-13.2, 0.40, -16.0], fov=26),
         move=dict(pos=[-12.7, 1.00, -11.7], look=[-13.4, 0.30, -16.4], fov=24),
         note="Insert CU: a slow thread of syrup falls into the pool. Thick. Slow. SFX: slow drip, plop."),
    dict(beat="curious", light="day", sents=[(19, 0, None)],
         cam=dict(pos=[1.20, 1.55, 4.40], look=[0.90, 1.42, 2.20], fov=38),
         move=dict(pos=[1.10, 1.55, 4.10], look=[0.86, 1.40, 2.10], fov=36),
         note="Reaction CU: the walker tilts his head, genuinely curious. SFX: tiny music lift."),
    dict(beat="wave_front", light="day", sents=[(20, 0, None), (21, 0, None)],
         cam=dict(pos=[-28.0, 5.40, 14.0], look=[-6.0, 2.00, -6.0], fov=44),
         move=dict(pos=[-26.0, 5.00, 12.6], look=[-4.0, 1.90, -6.4]),
         note="Wide: the front of the flood advancing down the street. SFX: deep surge."),
    dict(beat="birdseye_flood", light="day", sents=[(22, 0, None), (23, 0, None)],
         cam=dict(pos=[6.0, 40.0, 12.0], look=[16.0, 0.00, -2.0], fov=42),
         move=dict(pos=[7.5, 36.0, 10.5], look=[17.0, 0.00, -2.5]),
         note="Bird's eye: brown water filling the street, the railcar adrift. SFX: surge, wood groan."),
    dict(beat="buildings", light="golden", sents=[(24, 0, None)],
         cam=dict(pos=[4.0, 2.20, 9.0], look=[16.0, 3.00, -13.0], fov=42),
         move=dict(pos=[7.0, 2.00, 7.6], look=[16.6, 2.80, -13.4]),
         note="Environment move: the firehouse slides off its foundation. SFX: crash, brick rumble."),
    dict(beat="railcar", light="golden", sents=[(25, 0, None)],
         cam=dict(pos=[17.0, 1.10, 6.5], look=[22.0, 1.60, -1.0], fov=40, roll=-4),
         move=dict(pos=[17.8, 1.05, 5.8], look=[22.4, 1.55, -1.4], roll=-6),
         note="Low angle: the railcar lifted clean off its trucks. SFX: metal clang, wood splinter."),
    dict(beat="cools", light="golden", sents=[(26, 0, None), (27, 0, None)],
         cam=dict(pos=[-4.0, 1.60, 12.0], look=[2.0, 0.60, 2.0], fov=40),
         move=dict(pos=[-3.2, 1.45, 11.0], look=[2.6, 0.50, 1.4]),
         note="Golden: the surface skins over, the flow slows to a standstill. SFX: dripping stops."),
    dict(beat="glue", light="golden", sents=[(28, 0, None)],
         cam=dict(pos=[0.5, 1.20, 9.0], look=[4.0, 0.50, 3.0], fov=34),
         move=dict(pos=[1.0, 1.10, 8.2], look=[4.4, 0.45, 2.6]),
         note="CU: a boot and a hand stuck fast in the cooling glue. SFX: sticky tug."),
    dict(beat="stuck", light="golden", sents=[(29, 0, None)],
         cam=dict(pos=[-2.0, 2.40, 14.0], look=[2.0, 1.20, 2.0], fov=44),
         move=dict(pos=[-1.0, 2.20, 12.6], look=[2.6, 1.10, 1.4]),
         note="Wide: figures stuck to their waists, waving for help. SFX: crowd murmur, calls."),
    dict(beat="blame", light="night", sents=[(30, 0, None)],
         cam=dict(pos=[69.2, 2.10, 49.4], look=[68.6, 1.35, 38.9], fov=32),
         move=dict(pos=[69.5, 2.05, 48.8], look=[68.6, 1.32, 38.9]),
         note="Night office: he points at a map and blames anarchists. SFX: low drone."),
    dict(beat="empty_night", light="night", sents=[(31, 0, None)],
         cam=dict(pos=[-2.0, 2.20, 16.0], look=[-14.0, 3.00, -24.0], fov=42, roll=2),
         move=dict(pos=[-3.0, 2.00, 14.6], look=[-14.4, 2.80, -25.0], roll=4),
         note="Night: the empty street, the tank standing alone. No anarchists. SFX: wind, distant bell."),
    dict(beat="tank_brown", light="day", sents=[(32, 0, None)],
         cam=dict(pos=[-14.0, 2.20, -2.0], look=[-14.0, 5.00, -22.0], fov=40),
         move=dict(pos=[-14.0, 2.40, -4.0], look=[-14.0, 5.40, -22.0]),
         note="Wide: the tank, its coat of brown paint, and the hurt neighbours in the yard. SFX: crowd."),
    dict(beat="court", light="day", sents=[(33, 0, None)],
         cam=dict(pos=[68.8, 2.30, 48.6], look=[68.6, 1.25, 38.8], fov=34),
         move=dict(pos=[69.1, 2.25, 47.8], look=[68.6, 1.22, 38.8]),
         note="The auditor's desk, five years of papers. SFX: clock, paper."),
    dict(beat="verdict", light="day", sents=[(34, 0, None)],
         cam=dict(pos=[69.6, 1.90, 41.4], look=[69.4, 1.45, 39.2], fov=26),
         move=dict(pos=[69.8, 1.85, 41.0], look=[69.4, 1.44, 39.2], fov=24),
         note="Insert CU: the stamp comes down on the finding. SFX: stamp thud, sting."),
    dict(beat="rule", light="day", sents=[(35, 0, None)],
         cam=dict(pos=[69.4, 1.85, 41.2], look=[69.4, 1.47, 39.2], fov=24),
         move=dict(pos=[69.5, 1.80, 40.9], look=[69.4, 1.46, 39.2], fov=22),
         note="Insert CU: the drawing, the signature, the seal. SFX: pen, paper."),
    dict(beat="smell", light="golden", sents=[(36, 0, None)],
         cam=dict(pos=[1.60, 1.60, 8.0], look=[0.40, 1.20, 2.0], fov=38, roll=0),
         move=dict(pos=[1.20, 1.55, 6.4], look=[0.20, 1.15, 1.2], fov=33, roll=4),
         note="TWIST: push-in with roll on the brown stain and the kid with the jar. Music stops, low hit. SFX: sting."),
]


# thin-lens focus target per beat (world metres) and infinity-blur radius in px at 1080x1920
FOCUS = {
    "hook_face": [0.0, 1.46, 2.0], "wave_street": [8.0, 2.0, -5.0], "tank_low": [-14.0, 8.0, -26.0],
    "tank_wall": [-14.0, 3.0, -25.0], "painter": [-10.4, 2.4, -12.8], "kids_jars": [-13.0, 1.2, -12.0],
    "letter": [70.0, 1.30, 38.5], "barrels": [-19.0, 1.1, 1.5], "sun_warm": [-12.0, 4.0, -24.0],
    "burst": [-14.0, 5.0, -24.0], "syrup": [-13.0, 0.5, -14.0], "curious": [0.9, 1.45, 2.2],
    "wave_front": [0.0, 2.0, -3.0], "buildings": [16.0, 3.0, -13.0], "railcar": [22.0, 1.6, 0.0],
    "cools": [0.0, 0.6, 0.0], "glue": [4.0, 0.8, 2.0], "stuck": [0.0, 1.2, 2.0],
    "blame": [70.0, 1.40, 38.5], "empty_night": [-14.0, 4.0, -24.0], "tank_brown": [-14.0, 4.0, -20.0],
    "court": [70.0, 1.30, 38.5], "verdict": [70.0, 1.40, 39.0], "rule": [70.0, 1.40, 39.0],
    "smell": [0.0, 1.20, 1.5],
}
CINF = {
    "birdseye": 0, "birdseye_flood": 0, "hook_face": 16, "tank_wall": 18, "syrup": 18, "curious": 16,
    "letter": 16, "blame": 16, "court": 16, "verdict": 20, "rule": 20, "smell": 14, "burst": 14,
    "glue": 16, "painter": 15, "kids_jars": 15, "wave_low": 14,
}
FLASH = {"burst", "smell"}
# sun azimuth per shot, CAMERA-RELATIVE degrees: 0 = dead ahead (backlight), 180 = behind the camera (frontal).
# Chosen so the face the camera sees is always lit.
AZ = {
    "hook_face": 200, "wave_street": 150, "birdseye": 180, "tank_low": 195, "tank_wall": 185,
    "painter": 185, "kids_jars": 195, "letter": 180, "barrels": 205, "sun_warm": 150, "burst": 115,
    "syrup": 190, "curious": 175, "wave_front": 215, "birdseye_flood": 180, "buildings": 160,
    "railcar": 150, "cools": 150, "glue": 150, "stuck": 150, "blame": 180, "empty_night": 200,
    "tank_brown": 185, "court": 180, "verdict": 180, "rule": 180, "smell": 70,
}


def load_phrases():
    f = ROOT / "work" / "phrases.json"
    if f.exists():
        d = json.loads(f.read_text())
        if d.get("phrases"):
            return d, True
    return provisional(), False


def provisional():
    """Sentence/word timings from the pacing model, used only until the real audio lands."""
    txt = (ROOT / "work" / "script.txt").read_text().strip()
    sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", txt) if s.strip()]
    phrases, t = [], 0.0
    for s in sents:
        words = s.split()
        ws, a = [], t
        for w in words:
            ws.append(dict(w=w, a=a, b=a + WPS, fa=round(a * FPS), fb=round((a + WPS) * FPS)))
            a += WPS
        phrases.append(dict(text=s, a=t, b=a, fa=round(t * FPS), fb=round(a * FPS), words=ws))
        t = a + PAUSE
    total = round(t * FPS)
    return dict(fps=FPS, total=total, phrases=phrases, model=True)


def seg_frames(phrases, seg):
    """frame range for (sentence index 1-based, word0, word1|None)"""
    i, w0, w1 = seg
    ph = phrases[i - 1]
    ws = ph["words"]
    if not ws:
        return ph["fa"], ph["fb"]
    w1 = len(ws) if w1 is None else min(w1, len(ws))
    w0 = max(0, min(w0, w1 - 1))
    return ws[w0]["fa"], ws[w1 - 1]["fb"]


def build():
    data, real = load_phrases()
    phrases = data["phrases"]
    cues, problems = [], []
    for sd in SHOT_DEFS:
        segs = sd["sents"]
        a, b = seg_frames(phrases, segs[0])[0], seg_frames(phrases, segs[-1])[1]
        # split any shot over MAXF frames at the word boundary nearest the middle
        todo, parts, guard = [(a, b)], [], 0
        while todo:
            x, y = todo.pop()
            guard += 1
            if guard > 500:
                raise RuntimeError(f"{sd['beat']}: split did not converge")
            if y - x + 1 <= MAXF:
                parts.append((x, y))
                continue
            mid = (x + y) / 2
            best = None
            for ph in phrases:
                for w in ph["words"]:
                    if x <= w["fa"] <= y and (best is None or abs(w["fa"] - mid) < abs(best - mid)):
                        best = w["fa"]
            if best is None or best <= x or best >= y:
                problems.append(f"{sd['beat']}: {y - x + 1}f cannot be split")
                parts.append((x, y))
                continue
            todo.append((x, best - 1))
            todo.append((best, y))
        for k, (x, y) in enumerate(sorted(parts)):
            c = dict(sd)
            c.pop("sents")
            c["id"] = len(cues) + 1
            c["a"], c["b"] = int(x), int(y)
            c["text"] = text_of(phrases, sd["sents"], x, y)
            c["part"] = k
            c["focus"] = FOCUS.get(sd["beat"])
            c["cinf"] = CINF.get(sd["beat"], 12)
            c["flash"] = sd["beat"] in FLASH
            c["az"] = AZ.get(sd["beat"], 180)
            cues.append(c)
    # fix any overlaps
    for i in range(len(cues) - 1):
        if cues[i]["b"] >= cues[i + 1]["a"]:
            cues[i]["b"] = cues[i + 1]["a"] - 1

    # bridge gaps between shots so every frame belongs to a shot (no frozen spans)
    if cues:
        cues[0]["a"] = 0
    for i in range(len(cues) - 1):
        gap = cues[i + 1]["a"] - cues[i]["b"] - 1
        if gap > 0:
            l1 = cues[i]["b"] - cues[i]["a"] + 1
            l2 = cues[i + 1]["b"] - cues[i + 1]["a"] + 1
            room1 = max(0, MAXF - l1)
            room2 = max(0, MAXF - l2)
            add1 = min(gap, room1)
            if gap - add1 > room2:
                add1 = max(0, gap - room2)
            add2 = gap - add1
            cues[i]["b"] += add1
            cues[i + 1]["a"] -= add2

    # the last shot may absorb the tail (a beat of silence under the final image) as long as it stays <= MAXF
    audio_total = data.get("total", TOTAL)
    if cues and cues[-1]["b"] + 1 < audio_total:
        room = MAXF - (cues[-1]["b"] - cues[-1]["a"] + 1)
        cues[-1]["b"] = min(audio_total - 1, cues[-1]["b"] + max(0, room))
    total = cues[-1]["b"] + 1
    out = dict(fps=FPS, total=total, target=TOTAL, real_audio=real, shots=cues)
    (ROOT / "work" / "cues.json").write_text(json.dumps(out, indent=1))
    print(f"wrote work/cues.json  shots={len(cues)}  frames={total} ({total / FPS:.1f}s)  audio={'real' if real else 'MODEL'}")
    if problems:
        print("PROBLEMS:")
        for p in problems:
            print("  " + p)
    over = [c for c in cues if c["b"] - c["a"] + 1 > MAXF]
    if over:
        print("OVER-LONG SHOTS:", [(c["id"], c["beat"], c["b"] - c["a"] + 1) for c in over])
    return out


def text_of(phrases, segs, fa, fb):
    """the narration text inside [fa,fb]"""
    out = []
    for ph in phrases:
        for w in ph["words"]:
            if fa <= w["fa"] <= fb:
                out.append(w["w"])
    return " ".join(out)


if __name__ == "__main__":
    build()
