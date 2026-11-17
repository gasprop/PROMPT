// Story module: the shot list (cues) and the per-frame staging for "The Great Molasses Flood".
// build_cues.py writes work/cues.json (one row per shot, timed to the voiceover); render.mjs hands it to the
// page and setCues() installs it. Cameras always creep from cam -> move over the shot with a smootherstep.
import type * as THREE from "three";
import { Pen } from "./toon";
import { drawStickman, OUTFITS, Outfit, Expr } from "./stickman";
import { walk, idle, blinkAt, smooth, clamp01 } from "./motion";
import { blob, tail, Place, FxPlace, CamInfo } from "./cast";
import type { Set } from "./molasses";
import type { LightName } from "./lights";

export type V3 = [number, number, number];
export const FPS = 30;
export const TOTAL = 1800;

export type Cue = {
  id: number; a: number; b: number; beat: string; light: LightName; part: number;
  cam: { pos: V3; look: V3; fov: number; roll?: number };
  move: Partial<{ pos: V3; look: V3; fov: number; roll: number }>;
  text: string; note: string; flash?: boolean;
  focus?: V3;            // world point for the thin-lens focus (defaults to the look point)
  cinf?: number;         // infinity blur radius in px at 1080x1920
  az?: number;           // camera-relative sun azimuth override (deg)
};

let CUES: Cue[] = [];
export let TOTAL_FRAMES = TOTAL;
/** install the shot list (from work/cues.json) */
export function setCues(c: Cue[], total: number) { CUES = c; TOTAL_FRAMES = total; }
export const cueAt = (f: number): Cue => CUES.find((c) => f >= c.a && f <= c.b) ?? CUES[CUES.length - 1];
export const lightAt = (f: number): LightName => cueAt(f).light;

const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
/** camera pose for frame f: cam -> move over the shot, plus a 1.5 % micro-creep so no hold is ever static */
export const camAt = (f: number): { pos: V3; look: V3; fov: number; roll: number } => {
  const c = cueAt(f);
  const u = smooth((f - c.a) / Math.max(1, c.b - c.a));
  const pos = mix(c.cam.pos, c.move.pos ?? c.cam.pos, u);
  const look = mix(c.cam.look, c.move.look ?? c.cam.look, u);
  const fov = c.cam.fov + ((c.move.fov ?? c.cam.fov) - c.cam.fov) * u;
  const roll = (c.cam.roll ?? 0) + ((c.move.roll ?? c.cam.roll ?? 0) - (c.cam.roll ?? 0)) * u;
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  const d = Math.hypot(dx, dy, dz) || 1;
  const k = 0.015 * u;
  return { pos: [pos[0] + (dx / d) * d * k, pos[1] + (dy / d) * d * k, pos[2] + (dz / d) * d * k], look, fov, roll };
};

// ---------------- staging helpers ----------------
const q = (v: number, n = 20) => Math.round(v * n) / n;
type PersonOpts = {
  outfit: Outfit; view?: "front" | "side"; dir?: V3; facing?: 1 | -1; phase?: number; moving?: boolean;
  expr?: Expr; seed?: number; scale?: number; blink?: number; bob?: number; look?: number; lean?: number;
};
/** one stickman card. `dir` (world motion) decides facing, so nobody ever walks backwards. */
function person(out: Place[], id: string, x: number, z: number, o: PersonOpts, cam: CamInfo) {
  let facing: 1 | -1 = o.facing ?? 1;
  if (o.dir) {
    const rx = cam.right.x, rz = cam.right.z;
    const n = Math.hypot(rx, rz) || 1;
    facing = (o.dir[0] * rx + o.dir[1] * rz) / n >= 0 ? 1 : -1;
  }
  const view = o.view ?? "front";
  const expr = o.expr ?? "neutral";
  const bob = o.bob ?? 0, sway = 0, lean = o.lean ?? 0, look = o.look ?? 0, scale = o.scale ?? 1;
  const phase = o.phase ?? 0, moving = !!o.moving, blink = o.blink ?? 0;
  const key = [id, view, facing, q(phase, 24), moving ? 1 : 0, expr, q(bob, 12), q(sway, 12), blink.toFixed(2), q(look, 8), q(lean, 8), scale, o.outfit.body].join("|");
  out.push({
    key, x, y: 0, z, scale,
    draw: (p: Pen) => drawStickman(p, { view, facing, phase, moving, expr, blink, look, lean, bob, seed: o.seed ?? 3, outfit: o.outfit }),
  });
}
/** idle life for a standing character: breathing bob + blink, never frozen */
const life = (f: number, seed: number) => ({ bob: idle(f, seed).bob, blink: blinkAt(f, seed) });
/** walking life: leg phase from walk() + the walk bob + blink */
const walkLife = (f: number, f0: number, seed: number, speed = 0.62) => {
  const w = walk(f, f0, speed, 1);
  return { phase: w.phase, moving: true, bob: w.bob * 2.2, blink: blinkAt(f, seed) };
};

export type Stage = { places: Place[]; fx: FxPlace[] };

export const TANK = { x: -14, z: -26, r: 12.5, h: 15 };
export const WALL_Z = TANK.z + TANK.r;      // -15: the tank face toward the street
export const FH = { x: 16, z: -13 };        // firehouse
export const RC = { x: 22, z: 0 };          // railcar
export const BAR = { x: -20, z: 2 };        // barrels
export const OFF = { x: 70, z: 40 };        // cutaway office

/** pose the set pieces + cast for frame f of `cue` */
export function stage(f: number, cue: Cue, cam: CamInfo, set: Set): Stage {
  const places: Place[] = [], fx: FxPlace[] = [];
  const u = clamp01((f - cue.a) / Math.max(1, cue.b - cue.a));
  const t = f / FPS;
  const beat = cue.beat;

  // default: everything off, then the beat turns on what it needs
  set.wave.visible = false; set.pool.visible = false; set.jet.visible = false;
  set.patch.visible = false; set.tear.visible = false;
  set.tank.position.set(TANK.x, 0, TANK.z); set.tank.rotation.set(0, 0, 0); set.tank.scale.set(1, 1, 1);
  set.firehouse.position.set(FH.x, 0, FH.z); set.firehouse.rotation.set(0, 0.12, 0);
  set.railcar.position.set(RC.x, 0, RC.z); set.railcar.rotation.set(0, Math.PI / 2, 0);
  set.barrels.position.set(BAR.x, 0, BAR.z); set.barrels.rotation.set(0, 0, 0);
  set.setDrips([]); set.setSteam([]); set.setPlanks([]);

  const W = OUTFITS.walker, KID = OUTFITS.kid, KID2 = OUTFITS.kid2, SUIT = OUTFITS.suit,
    PAINT = OUTFITS.painter, AUD = OUTFITS.auditor, VIC = OUTFITS.victim, WORK = OUTFITS.worker;

  switch (beat) {
    case "hook_face": {
      person(places, "walker", 0, 2.0, { outfit: W, expr: "shock", seed: 5, ...life(f, 5) }, cam);
      blob(fx, 0, 0, 2.0, 1);
      set.wave.visible = true;
      set.wave.position.set(0, 0, -3.6); set.wave.rotation.set(0, 0, 0); set.wave.scale.set(1.15, 1.15, 1.15);
      set.pool.visible = true; set.pool.position.set(0, 0.05, 2.0); set.pool.scale.set(4, 4, 1);
      break;
    }
    case "wave_street": {
      const wx = -2 + 9 * u;
      set.wave.visible = true; set.wave.position.set(wx, 0, -1.5); set.wave.rotation.set(0, 0, 0); set.wave.scale.set(1.25, 1.25, 1.25);
      set.pool.visible = true; set.pool.position.set(wx - 6, 0.05, -1.5); set.pool.scale.set(9, 7, 1);
      const r1 = walkLife(f, cue.a, 5, 0.85);
      person(places, "walker", 7 + 2.5 * u, 1.5, { outfit: W, view: "side", dir: [1, 0], expr: "shock", seed: 5, ...r1 }, cam);
      blob(fx, 7 + 2.5 * u, 0, 1.5, 1);
      const r2 = walkLife(f, cue.a + 6, 11, 0.9);
      person(places, "kid", 10 + 2.0 * u, -1.0, { outfit: KID, view: "side", dir: [1, 0], expr: "shock", seed: 11, ...r2 }, cam);
      blob(fx, 10 + 2.0 * u, 0, -1.0, 0.72);
      break;
    }
    case "birdseye": {
      set.pool.visible = true; set.pool.position.set(0, 0.05, 0); set.pool.scale.set(16, 8, 1);
      const a = walkLife(f, 0, 5, 0.5);
      person(places, "walker", -14 + 6 * u, 2.5, { outfit: W, view: "side", dir: [1, 0], seed: 5, ...a }, cam);
      const b = walkLife(f, 20, 11, 0.55);
      person(places, "kid", -18 + 6 * u, 4.0, { outfit: KID, view: "side", dir: [1, 0], seed: 11, ...b }, cam);
      const c2 = walkLife(f, 40, 17, 0.5);
      person(places, "kid2", -10 + 6 * u, -2.0, { outfit: KID2, view: "side", dir: [1, 0], seed: 17, ...c2 }, cam);
      break;
    }
    case "tank_low": {
      const wl = walkLife(f, cue.a, 21, 0.55);
      person(places, "worker", -20 + 11 * u, -11.5, { outfit: WORK, view: "side", dir: [1, 0], expr: "neutral", seed: 21, ...wl }, cam);
      blob(fx, -20 + 11 * u, 0, -11.5, 1);
      set.setDrips([{ x: TANK.x - 6, z: WALL_Z + 0.4, h: 9 }, { x: TANK.x + 3, z: WALL_Z + 0.3, h: 9 }]);
      break;
    }
    case "tank_wall": {
      set.setDrips([
        { x: TANK.x - 1.5, z: WALL_Z + 0.25, h: 6.5 }, { x: TANK.x + 0.5, z: WALL_Z + 0.2, h: 6.5 },
        { x: TANK.x + 2.2, z: WALL_Z + 0.3, h: 6.5 }, { x: TANK.x - 3.0, z: WALL_Z + 0.28, h: 6.5 },
      ]);
      const kl = walkLife(f, cue.a, 11, 0.7);
      person(places, "kid", TANK.x + 1.0, WALL_Z + 2.4, { outfit: KID, view: "side", dir: [0.4, 1], expr: "grin", seed: 11, ...kl, scale: 0.72 }, cam);
      blob(fx, TANK.x + 1.0, 0, WALL_Z + 2.4, 0.72);
      break;
    }
    case "painter": {
      set.patch.visible = true;
      const p = cue.part === 0 ? 0.25 + 0.55 * u : 0.8 + 0.2 * u;
      set.patch.scale.set(p, p, 1);
      const swing = Math.sin(t * 2.2) * 6;
      person(places, "painter", TANK.x + 3.6, WALL_Z + 2.2, {
        outfit: PAINT, view: "side", dir: [0, -1], expr: "neutral", seed: 31,
        lean: swing * 0.6, bob: life(f, 31).bob, blink: blinkAt(f, 31),
      }, cam);
      blob(fx, TANK.x + 3.6, 0, WALL_Z + 2.2, 1);
      set.setDrips([{ x: TANK.x - 5.5, z: WALL_Z + 0.3, h: 8 }]);
      break;
    }
    case "kids_jars": {
      const k1 = walkLife(f, cue.a, 11, 0.9), k2 = walkLife(f, cue.a + 5, 17, 0.95);
      person(places, "kid", -16 + 3.5 * u, -6 - 6 * u, { outfit: KID, view: "side", dir: [0.32, -0.95], expr: "grin", seed: 11, ...k1 }, cam);
      person(places, "kid2", -14 + 3.2 * u, -4 - 7 * u, { outfit: KID2, view: "side", dir: [0.32, -0.95], expr: "grin", seed: 17, ...k2 }, cam);
      blob(fx, -16 + 3.5 * u, 0, -6 - 6 * u, 0.72);
      blob(fx, -14 + 3.2 * u, 0, -4 - 7 * u, 0.66);
      set.setDrips([{ x: TANK.x + 2, z: WALL_Z + 0.3, h: 7 }, { x: TANK.x - 2, z: WALL_Z + 0.3, h: 7 }]);
      break;
    }
    case "letter": {
      const lx = OFF.x - 2.2, lz = OFF.z - 1.0;
      person(places, "suit", lx, lz, {
        outfit: SUIT, expr: cue.part === 0 ? "neutral" : "smile", seed: 41,
        lean: cue.part === 0 ? 0 : Math.sin(t * 3) * 3, look: cue.part === 0 ? 0.2 : -0.2,
        bob: life(f, 41).bob, blink: blinkAt(f, 41),
      }, cam);
      break;
    }
    case "barrels": {
      set.setSteam([{ x: BAR.x + 2, z: BAR.z + 1, s: 1.2 }, { x: BAR.x - 1, z: BAR.z - 1, s: 1.0 }]);
      const wl = walkLife(f, cue.a, 21, 0.7);
      person(places, "worker", BAR.x - 5 + 4 * u, BAR.z + 2.5, { outfit: WORK, view: "side", dir: [1, 0.2], expr: "neutral", seed: 21, ...wl }, cam);
      blob(fx, BAR.x - 5 + 4 * u, 0, BAR.z + 2.5, 1);
      person(places, "walker", BAR.x + 4, BAR.z - 2.5, { outfit: W, expr: "neutral", seed: 5, ...life(f, 5) }, cam);
      break;
    }
    case "sun_warm": {
      set.setSteam([{ x: TANK.x, z: TANK.z + 6, s: 2.2 }, { x: TANK.x + 4, z: TANK.z + 4, s: 1.6 }]);
      person(places, "walker", -8, -9, { outfit: W, expr: "dazed", seed: 5, lean: -4, ...life(f, 5) }, cam);
      blob(fx, -8, 0, -9, 1);
      const kl = walkLife(f, cue.a, 11, 0.5);
      person(places, "kid", -4 + 3 * u, -7.5, { outfit: KID, view: "side", dir: [1, 0], expr: "neutral", seed: 11, ...kl }, cam);
      break;
    }
    case "burst": {
      set.tear.visible = true;
      set.tear.scale.set(0.4 + 1.2 * u, 0.3 + 1.4 * u, 1);
      set.tank.scale.set(1 + 0.03 * Math.sin(u * Math.PI), 1 - 0.02 * u, 1 + 0.03 * Math.sin(u * Math.PI));
      set.jet.visible = true;
      set.jet.rotation.set(Math.PI / 2, 0, 0.25);
      set.jet.position.set(TANK.x + 1.5, 1.6 + 2.2 * u, WALL_Z + 5 + 4 * u);
      set.jet.scale.set(0.6 + 0.9 * u, 0.35 + 1.5 * u, 0.6 + 0.9 * u);
      set.wave.visible = true; set.wave.position.set(TANK.x + 2, 0, WALL_Z + 6 + 5 * u);
      set.wave.rotation.set(0, 0, 0); set.wave.scale.set(1.2, 1.2 + 0.5 * u, 1.2);
      const r1 = walkLife(f, cue.a, 5, 1.0);
      person(places, "walker", -6 + 9 * u, -6 + 2 * u, { outfit: W, view: "side", dir: [1, 0.3], expr: "shock", seed: 5, ...r1 }, cam);
      const r2 = walkLife(f, cue.a + 3, 11, 1.05);
      person(places, "kid", -3 + 8 * u, -3 + 2 * u, { outfit: KID, view: "side", dir: [1, 0.3], expr: "shock", seed: 11, ...r2 }, cam);
      set.setPlanks([{ x: -4, z: -8, rot: 0.4 }, { x: 0, z: -5, rot: 1.2 }]);
      break;
    }
    case "syrup": {
      set.pool.visible = true; set.pool.position.set(TANK.x + 1, 0.05, WALL_Z + 2.5); set.pool.scale.set(4.5, 3.2, 1);
      set.setDrips([{ x: TANK.x + 0.6, z: WALL_Z + 2.0, h: 4.2 }]);
      person(places, "walker", TANK.x + 5.5, WALL_Z + 4.0, { outfit: W, expr: "neutral", seed: 5, ...life(f, 5) }, cam);
      break;
    }
    case "curious": {
      person(places, "walker", 0.9, 2.2, { outfit: W, expr: "curious", look: 0.35, lean: 3, seed: 5, ...life(f, 5) }, cam);
      blob(fx, 0.9, 0, 2.2, 1);
      set.pool.visible = true; set.pool.position.set(0.4, 0.05, 0.4); set.pool.scale.set(7, 6, 1);
      break;
    }
    case "wave_front": {
      const wx = -14 + 12 * u;
      set.wave.visible = true; set.wave.position.set(wx, 0, -3); set.wave.rotation.set(0, 0, 0); set.wave.scale.set(1.4, 1.4, 1.4);
      set.pool.visible = true; set.pool.position.set(wx - 8, 0.05, -3); set.pool.scale.set(12, 8, 1);
      const r1 = walkLife(f, cue.a, 5, 0.9);
      person(places, "walker", 4 + 6 * u, 3.0, { outfit: W, view: "side", dir: [1, 0], expr: "shock", seed: 5, ...r1 }, cam);
      break;
    }
    case "birdseye_flood": {
      set.pool.visible = true; set.pool.position.set(8, 0.05, 0); set.pool.scale.set(22, 12, 1);
      set.railcar.position.set(RC.x + 2.5 * u, 0.5 * u, RC.z); set.railcar.rotation.set(0, Math.PI / 2 + 0.3 * u, 0.16 * u);
      const a = walkLife(f, cue.a, 5, 0.6);
      person(places, "walker", 2 + 5 * u, 3.5, { outfit: W, view: "side", dir: [1, 0], expr: "shock", seed: 5, ...a }, cam);
      const b = walkLife(f, cue.a + 4, 11, 0.65);
      person(places, "kid", 5 + 5 * u, -3.0, { outfit: KID, view: "side", dir: [1, 0], expr: "shock", seed: 11, ...b }, cam);
      set.setPlanks([{ x: 8, z: 2, rot: 0.8 }, { x: 12, z: -2, rot: 2.1 }, { x: 4, z: -4, rot: 1.5 }]);
      break;
    }
    case "buildings": {
      set.firehouse.position.set(FH.x + 1.4 * u, 0.15 * u, FH.z + 0.4 * u);
      set.firehouse.rotation.set(0.02 * u, 0.12, 0.07 * u);
      set.pool.visible = true; set.pool.position.set(FH.x - 6, 0.05, 0); set.pool.scale.set(14, 10, 1);
      const r1 = walkLife(f, cue.a, 5, 0.8);
      person(places, "walker", FH.x - 8 + 5 * u, 6.0, { outfit: W, view: "side", dir: [1, 0], expr: "shock", seed: 5, ...r1 }, cam);
      set.setPlanks([{ x: FH.x - 4, z: -8, rot: 0.9 }, { x: FH.x - 9, z: -4, rot: 2.4 }]);
      break;
    }
    case "railcar": {
      set.railcar.position.set(RC.x, 0.9 * u, RC.z + 0.6 * u);
      set.railcar.rotation.set(0.1 * u, Math.PI / 2 + 0.5 * u, 0.28 * u);
      set.pool.visible = true; set.pool.position.set(RC.x - 4, 0.05, 0); set.pool.scale.set(16, 12, 1);
      const r1 = walkLife(f, cue.a, 21, 0.7);
      person(places, "worker", RC.x - 8 + 4 * u, 5.0, { outfit: WORK, view: "side", dir: [1, 0], expr: "shock", seed: 21, ...r1 }, cam);
      break;
    }
    case "cools": {
      set.pool.visible = true; set.pool.position.set(0, 0.05, 0); set.pool.scale.set(20, 13, 1);
      person(places, "walker", -2, 4.0, { outfit: W, expr: "sad", seed: 5, ...life(f, 5) }, cam);
      blob(fx, -2, 0, 4.0, 1);
      person(places, "victim", 3.5, -1.0, { outfit: VIC, expr: "sad", seed: 51, ...life(f, 51) }, cam);
      break;
    }
    case "glue": {
      set.pool.visible = true; set.pool.position.set(4.0, 0.05, 2.0); set.pool.scale.set(8, 6, 1);
      person(places, "victim", 4.0, 2.0, { outfit: VIC, expr: "dazed", seed: 51, bob: life(f, 51).bob, blink: blinkAt(f, 51) }, cam);
      places[places.length - 1].y = -0.75;   // waist-deep: only torso and head clear of the glue
      break;
    }
    case "stuck": {
      set.pool.visible = true; set.pool.position.set(0, 0.05, 0); set.pool.scale.set(24, 16, 1);
      const xs = [-6, -1.5, 3.5];
      xs.forEach((x, i) => {
        person(places, "victim" + i, x, 2 + i * 1.5, {
          outfit: VIC, expr: i === 1 ? "shock" : "sad", seed: 51 + i * 3,
          lean: Math.sin(t * 1.4 + i) * 3, bob: life(f, 51 + i * 3).bob, blink: blinkAt(f, 51 + i * 3),
        }, cam);
        places[places.length - 1].y = -0.85;
      });
      const r1 = walkLife(f, cue.a, 5, 0.6);
      person(places, "walker", -10 + 6 * u, -4.0, { outfit: W, view: "side", dir: [1, 0], expr: "sad", seed: 5, ...r1 }, cam);
      break;
    }
    case "blame": {
      person(places, "suit", OFF.x - 2.2, OFF.z - 1.0, {
        outfit: SUIT, expr: "stern", lean: 6, look: -0.3, seed: 41,
        bob: life(f, 41).bob, blink: blinkAt(f, 41),
      }, cam);
      break;
    }
    case "empty_night": {
      set.pool.visible = true; set.pool.position.set(-8, 0.05, -6); set.pool.scale.set(16, 12, 1);
      break;
    }
    case "tank_brown": {
      set.patch.visible = true; set.patch.scale.set(1.15, 1.15, 1);
      set.setDrips([{ x: TANK.x - 6, z: WALL_Z + 0.3, h: 8 }]);
      const hurt = [{ x: TANK.x - 6, z: WALL_Z + 5, e: "sad" as Expr }, { x: TANK.x + 2, z: WALL_Z + 6, e: "dazed" as Expr }];
      hurt.forEach((h, i) => {
        person(places, "victim" + i, h.x, h.z, { outfit: VIC, expr: h.e, seed: 61 + i * 5, ...life(f, 61 + i * 5) }, cam);
        blob(fx, h.x, 0, h.z, 1);
      });
      person(places, "walker", TANK.x + 7, WALL_Z + 7, { outfit: W, expr: "stern", seed: 5, ...life(f, 5) }, cam);
      break;
    }
    case "court": {
      person(places, "auditor", OFF.x - 2.2, OFF.z - 1.0, { outfit: AUD, expr: "stern", seed: 71, ...life(f, 71) }, cam);
      person(places, "suit", OFF.x + 1.6, OFF.z - 1.6, { outfit: SUIT, expr: "nervous", seed: 41, ...life(f, 41) }, cam);
      break;
    }
    case "verdict": {
      person(places, "auditor", OFF.x - 2.2, OFF.z - 1.0, {
        outfit: AUD, expr: "stern", lean: 8 * Math.sin(u * Math.PI), seed: 71,
        bob: life(f, 71).bob, blink: blinkAt(f, 71),
      }, cam);
      break;
    }
    case "rule": {
      person(places, "auditor", OFF.x - 2.2, OFF.z - 1.0, { outfit: AUD, expr: "neutral", seed: 71, ...life(f, 71) }, cam);
      break;
    }
    default: {
      // smell / fallback: the twist image
      set.pool.visible = true; set.pool.position.set(0.2, 0.05, 1.2); set.pool.scale.set(6, 4.5, 1);
      set.setSteam([{ x: 0.4, z: 1.0, s: 0.9 }]);
      const kl = walkLife(f, cue.a, 11, 0.8);
      person(places, "kid", -1.5 + 3.5 * u, 2.4, { outfit: KID, view: "side", dir: [1, 0], expr: "curious", seed: 11, ...kl, scale: 0.72 }, cam);
      blob(fx, -1.5 + 3.5 * u, 0, 2.4, 0.72);
      person(places, "walker", 2.6, 0.4, { outfit: W, expr: "neutral", seed: 5, ...life(f, 5) }, cam);
      break;
    }
  }
  return { places, fx };
}

export { THREE };
