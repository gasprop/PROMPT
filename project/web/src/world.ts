// The 3D toon world: gradient sky, fog, sun + hemisphere, painted ground, hills, mountains, trees, houses,
// clouds and water. Everything is built from three.js primitives with Canvas2D-painted textures (paint.ts)
// and the two-tone toon lighting (shade.ts). Characters/effects go on the NOINK layer (see ink.ts).
import * as THREE from "three";
import { twoTone, untone } from "./shade";
import { LIGHTS, LOOK, LightPreset, WorldLook } from "./lights";
import { grassHD, stoneHD, roofHD, facadeHD, cloudHD, water as waterTex, CLOUD_DAY, CLOUD_GOLD } from "./paint";
import { NOINK } from "./ink";

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mat = new Map<string, THREE.Material>();
/** cached two-tone Lambert material by key (map optional) */
export const lam = (key: string, make: () => THREE.MeshLambertMaterialParameters) => {
  let m = mat.get(key) as THREE.MeshLambertMaterial | undefined;
  if (!m) { m = twoTone(new THREE.MeshLambertMaterial(make())); mat.set(key, m); }
  return m;
};

// ---------------- sky ----------------
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 c4;
uniform float e0; uniform float e1; uniform float e2; uniform float e3; uniform float e4;
varying vec3 vDir;
void main() {
  float el = degrees(asin(clamp(normalize(vDir).y, -1.0, 1.0)));
  vec3 col = mix(c0, c1, smoothstep(e0, e1, el));
  col = mix(col, c2, smoothstep(e1, e2, el));
  col = mix(col, c3, smoothstep(e2, e3, el));
  col = mix(col, c4, smoothstep(e3, e4, el));
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------------- geometry helpers ----------------
const boxGeo = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
/** constant texel density: repeat a texture so 1 tile = `tile` metres */
const tbox = (geo: THREE.BufferGeometry, w: number, h: number, d: number, tile: number, map: THREE.Texture) => {
  const t = map.clone();
  t.needsUpdate = true;
  const per = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nor = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const face = ny > 0.5 ? 2 : nx > 0.5 ? 0 : 4;
    const [a, b] = per[face];
    uv.setXY(i, (pos.getX(i) + (face === 0 ? d / 2 : 0)) / tile, (pos.getY(i) + (face === 2 ? h / 2 : 0)) / tile);
    void a; void b;
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

export type WorldOpts = {
  size?: number;          // ground half-extent (m)
  hills?: [number, number, number, number][];   // x, z, r, y
  mountains?: [number, number, number][];       // x, z, h
  trees?: [number, number, number][];           // x, z, scale
  houses?: { x: number; z: number; w: number; h: number; d: number; rot?: number; wall?: string; roof?: string; brick?: boolean; door?: boolean }[];
  water?: { x: number; z: number; w: number; d: number; y?: number };
  clouds?: number;
};

export class World {
  root = new THREE.Group();
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  sky!: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];
  private waterMesh: THREE.Mesh | null = null;
  private flags: THREE.Mesh[] = [];
  private look: WorldLook = LOOK.day;

  constructor(opts: WorldOpts = {}) {
    const o = { size: 240, hills: [], mountains: [], trees: [], houses: [], clouds: 7, ...opts };
    const g = this.root;

    // lights
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -90; cam.right = 90; cam.top = 90; cam.bottom = -90; cam.near = 0.5; cam.far = 400;
    this.sun.shadow.bias = -0.0003;
    g.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xdcecff, 0xb49a78, 0.55);
    g.add(this.hemi);

    // sky dome
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() },
        c3: { value: new THREE.Color() }, c4: { value: new THREE.Color() },
        e0: { value: 0 }, e1: { value: 3 }, e2: { value: 8 }, e3: { value: 16 }, e4: { value: 40 },
      },
    }));
    this.sky.layers.set(NOINK);
    this.sky.frustumCulled = false;
    g.add(this.sky);

    // ground
    const gt = grassHD();
    const ground = new THREE.Mesh(new THREE.CircleGeometry(o.size, 48), lam("ground", () => ({ map: gt })) as THREE.MeshLambertMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    g.add(ground);

    // hills: half-buried spheres
    for (const [x, z, r, y] of o.hills) {
      const hm = lam("hill", () => ({ map: grassHD(), color: new THREE.Color("#9ccb7a") })) as THREE.MeshLambertMaterial;
      const h = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), hm);
      h.position.set(x, y - r * 0.35, z);
      h.scale.y = 0.55;
      h.receiveShadow = true; h.castShadow = false;
      g.add(h);
    }
    // mountains: cones + snow caps
    for (const [x, z, h] of o.mountains) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.75, h, 7), lam("mount", () => ({ color: new THREE.Color("#7f8ea8") })) as THREE.MeshLambertMaterial);
      m.position.set(x, h / 2 - 2, z);
      g.add(m);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.28, h * 0.34, 7), lam("snow", () => ({ color: new THREE.Color("#f4f7fb") })) as THREE.MeshLambertMaterial);
      cap.position.set(x, h - h * 0.17 - 2, z);
      g.add(cap);
    }
    // trees
    for (const [x, z, s] of o.trees) g.add(this.makeTree(x, z, s));
    // houses
    for (const h of o.houses) g.add(this.makeHouse(h));
    // water
    if (o.water) {
      const wt = waterTex();
      const w = new THREE.Mesh(new THREE.PlaneGeometry(o.water.w, o.water.d), lam("water", () => ({ map: wt })) as THREE.MeshLambertMaterial);
      w.rotation.x = -Math.PI / 2;
      w.position.set(o.water.x, o.water.y ?? 0.02, o.water.z);
      w.receiveShadow = true;
      this.waterMesh = w;
      g.add(w);
    }
    // clouds
    for (let i = 0; i < o.clouds; i++) {
      const seed = i * 17 + 3;
      const tex = cloudHD(seed, CLOUD_DAY);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      const a = (i / o.clouds) * Math.PI * 2;
      const r = 90 + (i % 3) * 40;
      m.position.set(Math.cos(a) * r, 42 + (i % 4) * 9, Math.sin(a) * r);
      m.scale.setScalar(26 + (i % 3) * 9);
      m.layers.set(NOINK);
      m.userData.speed = 0.35 + (i % 3) * 0.12;
      this.clouds.push(m);
      g.add(m);
    }
  }

  makeTree(x: number, z: number, s = 1) {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.42 * s, 2.4 * s, 7), lam("trunk", () => ({ color: new THREE.Color("#8a5a3c") })) as THREE.MeshLambertMaterial);
    trunk.position.y = 1.2 * s; trunk.castShadow = true;
    const leafMat = lam("leaf", () => ({ color: new THREE.Color("#5fae4a") })) as THREE.MeshLambertMaterial;
    const c1 = new THREE.Mesh(new THREE.SphereGeometry(1.7 * s, 14, 10), leafMat);
    c1.position.y = 3.4 * s; c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.SphereGeometry(1.25 * s, 12, 9), leafMat);
    c2.position.set(0.7 * s, 2.7 * s, 0.3 * s); c2.castShadow = true;
    t.add(trunk, c1, c2);
    t.position.set(x, 0, z);
    t.rotation.y = (x * 13.7 + z * 7.3) % 6.28;
    return t;
  }

  makeHouse(h: WorldOpts["houses"][number]) {
    const g = new THREE.Group();
    const wall = h.wall ?? "#e8d9b8", roof = h.roof ?? "#b4503a";
    const fkey = "h" + wall + h.w + (h.brick ? "b" : "") + (h.door ? "d" : "");
    const body = new THREE.Mesh(boxGeo(h.w, h.h, h.d), lam("house" + fkey, () => ({ map: facadeHD(fkey, h.w, h.h, { wall, shutter: "#7a9a5a", brick: h.brick, door: h.door }) })) as THREE.MeshLambertMaterial);
    body.position.y = h.h / 2;
    body.castShadow = true; body.receiveShadow = true;
    const roofM = new THREE.Mesh(new THREE.CylinderGeometry(0.01, h.w * 0.78, h.h * 0.55, 4, 1), lam("roof" + roof, () => ({ map: roofHD(roof) })) as THREE.MeshLambertMaterial);
    roofM.rotation.y = Math.PI / 4;
    roofM.scale.set(1, 1, h.d / h.w);
    roofM.position.y = h.h + h.h * 0.27;
    roofM.castShadow = true;
    g.add(body, roofM);
    g.position.set(h.x, 0, h.z);
    g.rotation.y = h.rot ?? 0;
    return g;
  }

  /** add a waving flag (secondary motion) */
  addFlag(x: number, y: number, z: number, col = "#c0353a") {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.4, 6), lam("pole", () => ({ color: new THREE.Color("#6b4a2c") })) as THREE.MeshLambertMaterial);
    pole.position.set(x, y + 1.7, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 8, 4), new THREE.MeshLambertMaterial({ color: new THREE.Color(col), side: THREE.DoubleSide }));
    flag.position.set(x + 0.78, y + 2.9, z);
    flag.userData.base = flag.geometry.attributes.position.array.slice();
    this.flags.push(flag);
    this.root.add(pole, flag);
    return flag;
  }

  /** per-frame world pose: light preset, sun (camera-relative), clouds, water, flags */
  update(light: LightPreset, look: WorldLook, f: number, camPos: THREE.Vector3, camFwd?: THREE.Vector3) {
    this.look = look;
    // sky stops (untone so the tone map lands on the painted target)
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    const cs = look.sky.c.map((c) => untone(c));
    (u.c0.value as THREE.Color).copy(cs[0]); (u.c1.value as THREE.Color).copy(cs[1]); (u.c2.value as THREE.Color).copy(cs[2]);
    (u.c3.value as THREE.Color).copy(cs[3]); (u.c4.value as THREE.Color).copy(cs[4]);
    (u.e0.value as number) = look.sky.e[0]; (u.e1.value as number) = look.sky.e[1]; (u.e2.value as number) = look.sky.e[2];
    (u.e3.value as number) = look.sky.e[3]; (u.e4.value as number) = look.sky.e[4];
    this.sky.position.copy(camPos);

    // fog = horizon colour (per-preset near/far, see lights.ts)
    void look;
    // sun CAMERA-RELATIVE: az measured from the camera's forward axis (0 = dead ahead = backlight,
    // 180 = behind the camera = frontal light), el = elevation. Frozen per shot.
    const az = (light.az * Math.PI) / 180, el = (light.el * Math.PI) / 180;
    const fw = camFwd ? camFwd.clone() : new THREE.Vector3(0, 0, -1);
    fw.y = 0; if (fw.lengthSq() < 1e-6) fw.set(0, 0, -1); fw.normalize();
    const hx = fw.x * Math.cos(az) + fw.z * Math.sin(az);
    const hz = -fw.x * Math.sin(az) + fw.z * Math.cos(az);
    const dir = new THREE.Vector3(hx * Math.cos(el), Math.sin(el), hz * Math.cos(el));
    this.sun.position.copy(camPos).add(dir.clone().multiplyScalar(120));
    this.sun.target.position.copy(camPos);
    this.sun.color.set(light.sunCol);
    this.sun.intensity = light.sunI;
    this.hemi.color.set(light.sky); this.hemi.groundColor.set(light.ground); this.hemi.intensity = light.hemiI;
    this.sun.shadow.bias = light.bias;
    this.sun.shadow.normalBias = light.normalBias;

    // clouds drift + face the camera; tinted per light preset (night = cold blue multiply)
    const t = f / 30;
    const cm = this.clouds.length ? (this.clouds[0].material as THREE.MeshBasicMaterial) : null;
    if (cm) {
      const lum = new THREE.Color(look.cloud.lit).getHSL({ h: 0, s: 0, l: 0 }).l;
      const k = lum > 0.9 ? 1 : 0.40 + 0.34 * lum;
      cm.color.setRGB(k * (0.55 + 0.45 * lum), k * (0.62 + 0.38 * lum), Math.min(1, k * (0.85 + 0.35 * lum)));
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * 0.016;
      if (c.position.x > 160) c.position.x = -160;
      c.lookAt(camPos);
    }
    // flags wave
    for (const fl of this.flags) {
      const pos = fl.geometry.attributes.position as THREE.BufferAttribute;
      const base = fl.userData.base as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 3.1 + t * 6 + y) * 0.16 * (x + 0.75));
      }
      pos.needsUpdate = true;
    }
    // water shimmer
    if (this.waterMesh) {
      const m = this.waterMesh.material as THREE.MeshLambertMaterial;
      if (m.map) { m.map.offset.set(Math.sin(t * 0.2) * 0.05, t * 0.015); }
    }

  }

  setFog(scene: THREE.Scene, look: WorldLook, light?: LightPreset) {
    const near = light?.fogNear ?? 25, far = light?.fogFar ?? 300;
    scene.fog = new THREE.Fog(untone(look.sky.c[0]), near, far);
  }
}
