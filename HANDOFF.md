# HANDOFF — "The Flood That Wasn't Water" (Great Molasses Flood, Boston 1919)

> Copy everything below the line into a new agent. It has the ElevenLabs key and can reach the internet.

---

## What this is

A complete animated cartoon short, built with the workflow in `MASTER-PROMPT.md`: flat 2D
canvas-drawn stickman characters inside a toon-shaded 3D world, rendered frame-by-frame with
Three.js in headless Chromium. Deliverable: 9:16 vertical, 1080×1920, 30 fps, ~80 s, with
voiceover + music + SFX.

**Story:** the Great Molasses Flood (Boston, 15 Jan 1919). **Script:** `project/work/script.txt`
(220 words, 36 sentences) — already approved by the user, who asked for maximum twists.
**Duration decision:** the user originally picked 60 s, but 220 words at natural narration is
~80 s. We chose **~80 s (2396 frames)** so no twists get cut. Do not regress to 60 s.

## Repo state

- Branch: `arena/dac85033-prompt` (branched from `main` @ `77e654d`). **Create a new branch from
  this one and do all work there.** Never touch `main`.
- Everything is already written and working. `project/` holds the whole pipeline.
- `.gitignore` excludes `.venv/`, `node_modules/`, `web/bundle.js`, `work/`, `stills/`, `out/`,
  `.secrets/`. Do not commit those.

## What is DONE (do not redo)

- Engine: `project/web/src/` — `stickman.ts` (canvas stickman, OUTFITS incl. walker/painter/
  kid2/suit/auditor/victim, hats incl. bowler), `world.ts` (North End: streets, houses, rails),
  `molasses.ts` (the 1919 set: 50-ft tank, wave, pool, firehouse, railcar, barrels, office
  cutaway, burst jet/patch/tear, drips/steam/planks), `cast.ts`, `story.ts` (37 beat cases),
  `main.js` (headless harness), `shade.ts`/`paint.ts`/`lights.ts`/`grade.ts`/`lensblur.ts`/`ink.ts`.
- Timing: `project/build_cues.py` → `work/cues.json` — **37 shots, 2396 frames, longest shot
  81 frames** (rule: never >90). Uses `work/phrases.json` when it exists, else the pacing model
  (0.331 s/word + 0.20 s pause).
- Shot plan: `project/PLAN.md` (every shot: frames, narration, beat, light, camera, staging).
- Audio: `project/audio.py` → `work/music.npy` + `work/sfx.npy` (period plucked-string waltz that
  **stops at the twist line** and leaves a low drone; SFX cue table keyed to shot frames).
  `project/mix.py` → `work/mix.npy` (music at −6 dB RMS vs voice, ducked −3 dB while words are
  spoken; SFX peaks capped at 0.7× voice peak).
- Encode: `project/finish.py` (frames + audio → MP4, 1080×1920, 30 fps, H.264 High CRF 17,
  AAC 192 k, loudnorm −14 LUFS / −1 dBTP).
- QA: `project/qa.py` (no black frames, no frozen span ≥0.4 s, frame count check).
- Tooling: `project/render_all.mjs` (resumable full render), `render.mjs` (stills),
  `sheet.py`/`cmap.py`/`preview.py` (vision-free frame previews), `thumbs.py` (step 16).
- Look check already passed at 540×960: 25 stills in `project/stills/check/`, sheet in
  `project/stills/contact_sheet.jpg`. Lighting was fixed this session (steel texture brightened,
  molasses material colour un-multiplied, office cutaway lit, golden preset lifted, burst shot
  re-angled).

## What is LEFT

### 1. Voiceover (BLOCKED in the original sandbox — you should be able to do it)

`api.elevenlabs.io` was unreachable from the original sandbox (DNS+TCP OK, **TLS reset**,
`curl` returns `000`). The ElevenLabs key is at `project/.secrets/elevenlabs.key`
(gitignored — **never print it, never commit it**). If your environment also cannot reach it,
ask the user to run step 1a locally and drop the two files into `project/work/`.

```bash
cd project && python3 eleven.py
```

`eleven.py` calls ElevenLabs **v4** (`model_id=eleven_v4`, voice `21m00Tcm4TlvDq8ikWAM`,
`/with-timestamps`) with the bracket-tagged read in `work/script_tagged.txt` (v4 emotion/
delivery tags, no SSML). It writes:
- `work/voice.mp3`
- `work/phrases.json` — `{"fps":30,"total":N,"phrases":[{"text","a","b","fa","fb"}, ...]}`

### 2. Re-time and re-render

```bash
cd project
python3 build_cues.py          # now uses phrases.json -> new shot list
npx esbuild web/src/main.js --bundle --format=iife --outfile=web/bundle.js
python3 audio.py               # music + SFX keyed to the new cues
python3 mix.py                 # voice + music + sfx
python3 render_all.mjs 0 <cues.total>     # or: LD_LIBRARY_PATH=web/lib/stubs node render_all.mjs 0 <total>
python3 finish.py
python3 qa.py
```

Node runs need the NSS stubs Chromium requires (apt is unavailable, so they are gcc stubs):
```bash
export LD_LIBRARY_PATH=/home/user/PROMPT/project/web/lib/stubs
```

### 3. Deliver

- `project/out/molasses_flood.mp4` — present it to the user with a one-line description per shot
  (see `project/PLAN.md`).
- Thumbnails (step 16): `python3 thumbs.py` → `stills/thumbs.jpg`, 3 dramatic frames
  (burst / wave_front / smell). Let the user pick.
- Upload details (step 17): already written at `project/work/upload.md` — title, 3 alternatives,
  description, 19 SEO tags, 3 Shorts hashtags.
- `google_drive` is connected and **ON** — push the MP4 there.

## Hard style rules (QA gate — do not violate)

- Heads: large imperfect hand-drawn circles, **pure white** fill, thick plum `#2c1a2e`/`#1a1a2e`
  ink. Round white eyes + black dot pupils, bold curved brows, small mouth. **No nose. No face
  shading.**
- Body: flat coloured blob from the OUTFITS entry, black outline. Arms/legs: thin **black stick
  lines** ending in round black dot hands. **No shoes, no feet.**
- Characters always **face their movement direction** (no backward walking).
- Walk phase from `walk()` — never a zero step (no gliding).
- Every character gets `idle()` + `blinkAt()` every frame — never frozen >4 frames.
- Camera angle never repeats in consecutive shots; every shot creeps (never static).
- **Twist line** (final shot, "On a hot day, they say, you can still smell it."): music stops,
  low hit, push-in with a 4° roll, golden light.
- Music −6 dB under the voice; SFX peaks ≤ 0.7× voice peak; no frozen span ≥ 0.4 s; no black frames.
- Shot length ≤ 90 frames (3 s).

## Known gotchas

- `build_cues.py` must keep the DFS split with the 500-iteration guard (a BFS `pop(0)` version hung).
- `SHOT_DEFS` sentence indices must match `script.txt` exactly; re-verify before hand-editing.
- esbuild once threw a duplicate `setSize` (bloom mip) — it was renamed `mipSetSize`.
- Never add `void <ident>;` probes in `world.ts` (caused `ReferenceError`).
- Chromium 153 needs `libnss3`/`libnssutil3`/`libnspr4`; stubs live in `web/lib/stubs/`.
- Puppeteer launch fails with `Code: null` if a chromium is already resident — `pkill -f chrom` first.
- ffmpeg is the imageio-ffmpeg binary at
  `/home/user/PROMPT/.venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2`.
- Rendering cost: ~2.9 s/frame at 1080×1920 → 2396 frames ≈ 2 h. Run it in the background and
  report progress periodically.

## Commands cheat sheet

```bash
cd project
python3 eleven.py                 # 1. voiceover (needs internet + key)
python3 build_cues.py            # 2. re-time
npx esbuild web/src/main.js --bundle --format=iife --outfile=web/bundle.js
python3 audio.py && python3 mix.py
LD_LIBRARY_PATH=web/lib/stubs node render_all.mjs 0 2396
python3 finish.py && python3 qa.py
python3 thumbs.py
```
