// Headless render harness: the 1919 North End posed per frame, rendered through the toon post chain
// (ink -> lens pre -> lens main -> bloom -> neutral tone map -> grade) and read back frame by frame.
// The shot list arrives from work/cues.json (build_cues.py) via window.__CUES__.
import * as THREE from "three";
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, ToneMappingMode, BlendFunction } from "postprocessing";
import { World } from "./world";
import { Cast } from "./cast";
import { Set } from "./molasses";
import { InkPass, noInkFallback } from "./ink";
import { LensBlur, GrainEffect } from "./lensblur";
import { GradeEffect, GRADES, GRADE_STRENGTH, gradeFor } from "./grade";
import { LIGHTS, LOOK } from "./lights";
import { FPS, TOTAL, cueAt, camAt, lightAt, setCues, stage, TOTAL_FRAMES } from "./story";

const canvas = document.getElementById("c");
const params = new URLSearchParams(location.search);
let W = parseInt(params.get("w") || "540", 10);
let H = parseInt(params.get("h") || "960", 10);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.2, 1500);
scene.add(camera);

// ---------------- the North End, January 1919 ----------------
const houses = [];
for (let x = -44; x <= 44; x += 8) {
  if (x >= -26 && x <= 2) continue;                     // the tank yard
  if (x >= 8 && x <= 24) continue;                      // the firehouse
  houses.push({ x, z: -14, w: 7.5, h: 5.4 + ((x + 44) % 3) * 0.7, d: 7, rot: 0.0, wall: "#a8502f", roof: "#6a4a3a", brick: true, door: true });
}
for (let x = -44; x <= 44; x += 8) {
  houses.push({ x: x + 3, z: 14, w: 7.5, h: 5.0 + ((x + 44) % 4) * 0.6, d: 7, rot: Math.PI, wall: "#b8693a", roof: "#5a4a6a", brick: true, door: true });
}
// a second, taller row behind the north side for skyline depth
for (let x = -52; x <= 52; x += 13) {
  if (x >= -26 && x <= 2) continue;
  houses.push({ x, z: -26, w: 9, h: 8.5, d: 8, rot: 0.0, wall: "#8a4a34", roof: "#4a3a4a", brick: true });
}

const world = new World({
  size: 280,
  hills: [[-90, -120, 70, 3], [110, -140, 90, 5], [0, -190, 120, 8]],
  mountains: [[-180, -240, 120], [190, -260, 150]],
  trees: [[-52, 20, 1.3], [48, 24, 1.1], [-60, -6, 1.2], [58, 8, 1.4]],
  houses,
  water: { x: 0, z: -105, w: 420, d: 90, y: 0.01 },
  clouds: 8,
});
scene.add(world.root);

const set = new Set();
scene.add(set.group);
set.addFlag(6, 0, -6, "#c0353a");
noInkFallback(scene);
if (params.get("noshadow") === "1") scene.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
if (params.get("castshadow") === "0") world.sun.castShadow = false;
const dbgMat = params.get("basic") || "";
if (dbgMat) {
  set.tank.traverse((o) => {
    if (!o.isMesh) return;
    o.material = dbgMat === "1" ? new THREE.MeshBasicMaterial({ color: 0x999999 })
      : dbgMat === "2" ? new THREE.MeshPhongMaterial({ color: 0x888888 })
      : dbgMat === "4" ? new THREE.MeshLambertMaterial({ color: 0x888888, side: THREE.DoubleSide })
      : dbgMat === "5" ? new THREE.MeshNormalMaterial()
      : dbgMat === "6" ? new THREE.MeshBasicMaterial({ map: set.tankWall.material.map })
      : new THREE.MeshLambertMaterial({ color: 0x888888 });
  });
}

const cast = new Cast(scene);

// ---------------- post chain ----------------
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 4, stencilBuffer: false });
composer.addPass(new RenderPass(scene, camera));
const ink = new InkPass(scene, camera);
if (params.get("ink") !== "0") composer.addPass(ink);
const lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
composer.addPass(lens.pre);
composer.addPass(lens.main);
const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
const mip = bloom.mipmapBlurPass;
const mipSetSize = mip.setSize.bind(mip);
mip.setSize = (w, h) => mipSetSize(Math.round((1920 * w) / Math.max(h, 1)), 1920);
const tone = new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL });
const grade = new GradeEffect(GRADES.day, GRADE_STRENGTH.day);
const grain = new GrainEffect({ amount: 0.025, cellPx: 1.5 });
composer.addPass(new EffectPass(camera, bloom, tone, grade, grain));

const flashEl = document.getElementById("flash");

function setSize(w, h) {
  W = w; H = h;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const fwd = new THREE.Vector3(), fpt = new THREE.Vector3(), look = new THREE.Vector3(), tmpFwd = new THREE.Vector3();
function renderFrame(f) {
  const t = f / FPS;
  const cue = cueAt(f);
  const c = camAt(f);
  const base = LIGHTS[cue.light];
  const light = cue.az === undefined ? base : { ...base, az: cue.az };
  if (params.get("az")) light.az = Number(params.get("az"));
  if (params.get("el")) light.el = Number(params.get("el"));
  const lk = LOOK[cue.light];

  // debug override: ?cam=px,py,pz,lx,ly,lz,fov
  const ov = params.get("cam");
  if (ov) {
    const v = ov.split(",").map(Number);
    c.pos = [v[0], v[1], v[2]]; c.look = [v[3], v[4], v[5]]; if (v[6]) c.fov = v[6];
  }
  camera.position.set(c.pos[0], c.pos[1], c.pos[2]);
  look.set(c.look[0], c.look[1], c.look[2]);
  camera.lookAt(look);
  // dramatic rolls (twist / disaster beats) + a 7-frame impact shake on the burst
  let roll = c.roll;
  if (cue.beat === "burst" && f - cue.a < 7) {
    const s = (1 - (f - cue.a) / 7) * 0.9;
    camera.position.x += Math.sin(f * 1.7) * 0.06 * s;
    camera.position.y += Math.cos(f * 2.3) * 0.05 * s;
    roll += Math.sin(f * 3.1) * 1.2 * s;
  }
  camera.rotateZ(roll * Math.PI / 180);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();

  world.setFog(scene, lk, light);
  camera.getWorldDirection(tmpFwd);
  world.update(light, lk, f, camera.position, tmpFwd);
  set.update(f);

  const camInfo = { pos: camera.position.clone(), right: new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion) };
  const { places, fx } = stage(f, cue, camInfo, set);
  cast.apply(places, fx, camInfo);

  // thin-lens focus: on the look point unless the beat asks for a specific subject
  const d = cue.focus ? cue.focus : null;
  camera.getWorldDirection(fwd);
  if (d) fpt.set(d[0], d[1], d[2]); else fpt.copy(look);
  lens.focus = Math.max(0.3, fpt.sub(camera.position).dot(fwd));
  lens.cInf = cue.cinf ?? 12;
  gradeFor(grade, cue.light);
  grain.seed = f;

  // 6-frame white flash on a time jump
  if (flashEl) flashEl.style.opacity = cue.flash && f - cue.a < 6 ? String(0.85 * (1 - (f - cue.a) / 6)) : "0";

  if (params.get("shadow") === "0") renderer.shadowMap.enabled = false;
  if (params.get("post") === "0") renderer.render(scene, camera);
  else composer.render();
  return true;
}

window.__debug = () => {
  const out = [];
  scene.traverse((o) => {
    if (o.isMesh && o.layers.mask === 1 << 3 && o.visible) {
      const v = new THREE.Vector3(); o.getWorldPosition(v); v.project(camera);
      out.push({ pos: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)], scale: +o.scale.x.toFixed(3) });
    }
  });
  const wp = (o) => { const v = new THREE.Vector3(); o.getWorldPosition(v); return v.toArray().map((n) => +n.toFixed(2)); };
  const c = cueAt(0);
  return {
    camera: camera.position.toArray().map((n) => +n.toFixed(2)), look: look.toArray().map((n) => +n.toFixed(2)),
    ndc: out.slice(0, 8), cue: c ? c.id : 0, beat: c ? c.beat : "-", shots: window.__CUES__ ? window.__CUES__.length : 0,
    set: { tank: wp(set.tank), wave: wp(set.wave), pool: wp(set.pool), firehouse: wp(set.firehouse), railcar: wp(set.railcar), office: wp(set.office), jet: wp(set.jet), patch: wp(set.patch) },
  };
};

window.__ray = (nx, ny) => {
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = rc.intersectObjects(scene.children, true).slice(0, 3);
  return hits.map((h) => {
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null;
    const m = h.object.material || {};
    const wp = new THREE.Vector3(); h.object.getWorldPosition(wp);
    return { d: +h.distance.toFixed(2), type: m.type, col: m.color ? m.color.getHexString() : "-", n: n ? n.toArray().map((v) => +v.toFixed(2)) : null, pt: h.point.toArray().map((v) => +v.toFixed(2)), obj: h.object.type, grp: h.object.parent && h.object.parent.type, geo: h.object.geometry && h.object.geometry.type, rad: h.object.geometry && h.object.geometry.parameters ? h.object.geometry.parameters.radiusTop : null, ht: h.object.geometry && h.object.geometry.parameters ? h.object.geometry.parameters.height : null };
  });
};
window.__sun = () => ({
  pos: world.sun.position.toArray().map((n) => +n.toFixed(1)),
  target: world.sun.target.position.toArray().map((n) => +n.toFixed(1)),
  cam: camera.position.toArray().map((n) => +n.toFixed(1)),
  fwd: tmpFwd.toArray().map((n) => +n.toFixed(3)),
  intensity: world.sun.intensity, color: world.sun.color.getHexString(),
  hemi: world.hemi.intensity,
});
window.__proj = (x, y, z) => {
  const v = new THREE.Vector3(x, y, z).project(camera);
  return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
};
window.__setCues = (d) => {
  const shots = (d && d.shots) || [];
  setCues(shots, (d && d.total) || TOTAL);
  window.__CUES__ = shots;
  window.__TOTAL = (d && d.total) || TOTAL;
  window.__SHOTS = shots.length;
  window.__AUDIO = !!(d && d.real_audio);
};

setSize(W, H);
window.__setSize = setSize;
window.__renderFrame = renderFrame;
window.__TOTAL = TOTAL_FRAMES || TOTAL;
window.__FPS = FPS;
window.__SHOTS = (window.__CUES__ || []).length;
window.__ready = true;
