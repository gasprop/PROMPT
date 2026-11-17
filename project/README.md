# Animated short — project

Engine: three.js (r167) + postprocessing, rendered frame-by-frame in headless Chromium
(@sparticuz/chromium + SwiftShader WebGL2). Character art is canvas-drawn flat stickman
billboards; the world is toon-shaded primitives with painted Canvas2D textures.

## Layout
- `web/src/`      engine + story modules (stickman.ts, world.ts, cast.ts, story.ts, molasses.ts, main.js, …)
- `web/index.html`, `web/bundle.js` (esbuild output)
- `web/lib/stubs/`  stub libnss3/libnspr4/libnssutil3 built by `make_stubs.py`
- `render.mjs`    frame renderer (puppeteer)
- `preview.py`, `sheet.py`, `cmap.py`   frame previews for agents without vision
- `PLAN.md`       the 31-shot plan generated from `work/cues.json`
- `build_cues.py` timing model -> `work/cues.json` (uses `work/phrases.json` when present)
- `eleven.py`     ElevenLabs v4 voiceover + word timings -> `work/voice.mp3`, `work/phrases.json`
- `audio.py`      music + SFX stems -> `work/music.npy`, `work/sfx.npy`
- `mix.py`        voice + music + SFX -> `work/mix.npy` (music −6 dB RMS under the voice, −3 dB more while words are spoken)
- `finish.py`     frames + audio -> MP4 (1080×1920, 30 fps, H.264 High, AAC 192 k)
- `work/`         timing data, stems; `stills/` look checks; `out/` final video
- `../../.venv`   python toolchain (numpy, Pillow, scipy, imageio-ffmpeg)

## Commands
- bundle: `npx esbuild web/src/main.js --bundle --format=iife --outfile=web/bundle.js`
- cues:   `python3 build_cues.py`  (after `python3 eleven.py`)
- stills: `node render.mjs stills/check 540 960 "30,150,290"`
- frames: `node render.mjs out/frames 1080 1920 "0-1799"`
- audio:  `python3 audio.py && python3 mix.py`
- video:  `python3 finish.py`

Every node run needs the NSS stubs: `LD_LIBRARY_PATH=web/lib/stubs node render.mjs …`
