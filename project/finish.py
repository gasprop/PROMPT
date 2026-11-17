#!/usr/bin/env python3
"""Assemble the finished short from rendered frames + the mixed audio.
Usage: python3 finish.py [out.mp4] [--frames DIR] [--audio FILE] [--res WxH]
Rules: 1080x1920, 30 fps, H.264 High + AAC 192k, yuv420p, faststart.
"""
import pathlib, subprocess, sys, json
import numpy as np

FFMPEG = "/home/user/PROMPT/.venv/lib/python3.11/site-packages/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v9.0.2"
ROOT = pathlib.Path(__file__).resolve().parent
FPS = 30

def main():
    args = sys.argv[1:]
    out = ROOT / "out" / "molasses_flood.mp4"
    frames = ROOT / "out" / "frames"
    audio = ROOT / "work" / "mix.npy"
    W, H = 1080, 1920
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--frames": frames = pathlib.Path(args[i+1]); i += 2
        elif a == "--audio": audio = pathlib.Path(args[i+1]); i += 2
        elif a == "--res": W, H = map(int, args[i+1].split("x")); i += 2
        else:
            out = pathlib.Path(a); i += 1
    out.parent.mkdir(parents=True, exist_ok=True)
    if not frames.exists():
        sys.exit(f"missing frames dir {frames} (run render.mjs out/frames 1080 1920 all)")
    files = sorted(frames.glob("f_*.jpg"))
    n = len(files)
    if n == 0: sys.exit(f"no frames in {frames}")
    # ffmpeg's image2 sequence needs a dense run from 0; if the run is sparse, pipe raw frames instead
    dense = [int(f.stem.split("_")[1]) for f in files]
    sparse = dense != list(range(dense[0], dense[0] + n))

    if audio.suffix == ".npy":
        x = np.load(audio).astype(np.float32)
        if x.ndim == 1: x = np.stack([x, x], 1)
        wav = ROOT / "work" / "mix.wav"
        subprocess.run([FFMPEG, "-y", "-v", "error", "-f", "f32le", "-ar", "48000", "-ac", "2",
                        "-i", "pipe:0", "-c:a", "pcm_s16le", str(wav)], input=x.tobytes(), check=True)
        audio = wav

    # --- loudness: measure first, then normalise to -14 LUFS / -1 dBTP (MASTER-PROMPT step 14)
    probe = subprocess.run([FFMPEG, "-v", "info", "-i", str(audio),
                            "-af", "loudnorm=I=-14:TP=-1.0:LRA=11:print_format=json",
                            "-f", "null", "-"], capture_output=True, text=True)
    import re
    m = re.search(r"\{[^{}]*\}", probe.stderr)
    if m:
        j = json.loads(m.group(0))
        ln = (f"loudnorm=I=-14:TP=-1.0:LRA=11:measured_I={j['input_i']}:"
              f"measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
              f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}")
        print(f"loudness measured I={j['input_i']} TP={j['input_tp']} LRA={j['input_lra']}")
    else:
        ln = "loudnorm=I=-14:TP=-1.0:LRA=11"
        print("loudness probe failed; using one-pass normalisation")

    cmd = [FFMPEG, "-y", "-v", "error"]
    if sparse:
        cmd += ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-framerate", str(FPS), "-i", "pipe:0"]
    else:
        cmd += ["-framerate", str(FPS), "-start_number", str(dense[0]),
                "-i", str(frames / "f_%05d.jpg")]
    cmd += ["-i", str(audio), "-af", ln,
            "-c:v", "libx264", "-preset", "medium", "-crf", "17",
            "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
            "-vf", f"scale={W}:{H}:flags=lanczos",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-movflags", "+faststart", "-shortest", str(out)]
    print(f"{n} frames ({'sparse' if sparse else 'dense'}) -> {out}")
    if sparse:
        # read each jpeg and convert to raw rgb24 once, in order
        raw = bytearray()
        for f in files:
            p = subprocess.run([FFMPEG, "-y", "-v", "error", "-i", str(f), "-f", "rawvideo",
                                "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "pipe:1"], capture_output=True, check=True)
            raw += p.stdout
        subprocess.run(cmd, input=bytes(raw), check=True)
    else:
        subprocess.run(cmd, check=True)
    subprocess.run([FFMPEG, "-y", "-v", "error", "-i", str(out), "-f", "null", "-"], check=True)
    print("done:", out, f"{out.stat().st_size/1e6:.1f} MB")

if __name__ == "__main__":
    main()
