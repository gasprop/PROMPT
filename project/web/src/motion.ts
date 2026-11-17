// Motion helpers for the stickman cast (MASTER-PROMPT step 9/10).
// walk(f, f0, speed, stride) -> { phase, bob, swing, lift }  (phase 0..1, footfalls at 0 and 0.5)
// idle(f, seed)              -> { bob, sway, breathe }       (always-on life, never frozen)
// blinkAt(f, seed)           -> 0 open .. 1 shut             (4-frame blinks every 0.5-2.3 s)
export const FPS = 30;
const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** deterministic per-character random in [0,1) */
export const hash = (seed: number, k: number) => {
  const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Walk cycle. f = frame, f0 = frame the walk started, speed = cycles/second, stride = step length multiplier. */
export const walk = (f: number, f0 = 0, speed = 0.66, stride = 1) => {
  const cyc = Math.max(0, (f - f0) / FPS) * speed;
  const phase = ((cyc % 1) + 1) % 1;
  // bob: lowest at the two footfalls (phase 0 and .5), highest mid-swing
  const bob = Math.cos(4 * Math.PI * phase); // +1 at contact, -1 mid-swing
  const swing = Math.sin(2 * Math.PI * phase); // leg/arm swing, + = forward
  const lift = Math.max(0, Math.sin(2 * Math.PI * phase)); // foot clearance 0..1
  return { phase, bob, swing, lift, stride, cyc };
};

/** Idle life: breathing bob + tiny sway. Never zero for long, so nobody freezes. */
export const idle = (f: number, seed = 1) => {
  const t = f / FPS;
  return {
    bob: Math.sin(t * 1.7 + seed * 1.3) * 1.6,
    sway: Math.sin(t * 0.9 + seed * 2.1) * 0.9,
    breathe: Math.sin(t * 1.7 + seed * 1.3),
    t,
  };
};

const LID = [0.5, 1, 1, 0.5];
/** Blink: 4-frame eyelid every 0.5-2.3 s, deterministic per seed. */
export const blinkAt = (f: number, seed = 1) => {
  let s = Math.round(-60 * hash(seed, 9));
  for (let n = 0; s <= f && n < 400; n++) {
    const k = f - s;
    if (k >= 0 && k < 4) return LID[k];
    s += Math.round(15 + 54 * hash(seed * 31 + n, 13));
  }
  return 0;
};

/** Smooth 0..1 ease (smootherstep) for camera glides and set-piece progress. */
export const smooth = (x: number) => {
  const u = clamp01(x);
  return u * u * u * (u * (6 * u - 15) + 10);
};
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export { clamp01 };
