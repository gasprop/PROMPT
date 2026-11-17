// Cast machinery: one canvas per distinct character drawing (pooled), drawn as camera-facing lit billboards on the
// NOINK layer, plus unlit effect cards and multiply ground contact blobs. The story module produces Place/FxPlace
// lists; this file turns them into meshes and binds their textures.
import * as THREE from "three";
import { Pen, fxBlob, fxContact, fxShadow } from "./toon";
import { NOINK } from "./ink";
import { cardShade, blobMaterial, CARD_K } from "./cardshade";

type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
export const SU = 0.00216; // metres per design unit (1000 units = 2.16 m)
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);

export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null; key = "";
  constructor(parent: THREE.Object3D) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(BODY, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null; key = "";
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.r!.key.includes("|blob|")) {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else { this.mat.map = t; this.soft.map = t; this.mesh.renderOrder = 0; }
  }
}

export type Place = {
  key: string; draw: (p: Pen) => void; x: number; y: number; z: number;
  scale?: number; yaw?: number; roll?: number; size?: [number, number, number]; flat?: boolean; rot?: number;
};
export type FxPlace = { key: string; cw: number; ch: number; draw: (p: Pen) => void; x: number; y: number; z: number; w: number; h: number; flat?: boolean; rot?: number; soft?: boolean };
export type CamInfo = { pos: THREE.Vector3; right: THREE.Vector3; sun?: THREE.Vector3 };

/** contact shadow under a standing character (multiply blob, blue-violet) */
export const blob = (out: FxPlace[], x: number, y: number, z: number, sc = 1, col = "#8d8ab0") =>
  out.push({ key: `blob|contact|${col}`, cw: 128, ch: 128, draw: (p) => fxContact(p, col), x, y: y + 0.02, z, w: 0.62 * sc, h: 0.46 * sc, flat: true, rot: 0 });

/** soft sun-direction tail shadow (day look) */
export const tail = (out: FxPlace[], x: number, y: number, z: number, sc = 1, col = "#9a94b8") =>
  out.push({ key: `blob|shadow|${col}`, cw: 128, ch: 256, draw: (p) => fxShadow(p, col), x, y: y + 0.018, z, w: 0.72 * sc, h: 1.5 * sc, flat: true, rot: 0 });

/** turn placements into meshes for one frame */
export class Cast {
  pool = new Pool();
  private actors = new Map<string, Actor>();
  private fxs = new Map<string, Fx>();
  constructor(private scene: THREE.Object3D) { }

  apply(places: Place[], fx: FxPlace[], cam: CamInfo) {
    const seenA = new Set<string>(), seenF = new Set<string>();
    for (const p of places) {
      seenA.add(p.key);
      let a = this.actors.get(p.key);
      if (!a) { a = new Actor(this.scene); this.actors.set(p.key, a); }
      a.key = p.key;
      const s = p.scale ?? 1;
      a.mesh.position.set(p.x, p.y, p.z);
      const yaw = p.yaw ?? Math.atan2(cam.pos.x - p.x, cam.pos.z - p.z);
      a.mesh.rotation.set(0, yaw, p.roll ?? 0);
      a.mesh.scale.setScalar(s);
      a.mesh.visible = true;
      a.r = this.pool.req(p.key, 600, 1000, 1, p.draw);
      a.bind();
    }
    for (const [, a] of this.actors) if (!seenA.has(a.key)) a.mesh.visible = false;

    for (const p of fx) {
      const id = `${p.key}|${p.x.toFixed(2)}|${p.z.toFixed(2)}`;
      seenF.add(id);
      let m = this.fxs.get(id);
      if (!m) { m = new Fx(this.scene); this.fxs.set(id, m); }
      m.key = id;
      m.mesh.position.set(p.x, p.y, p.z);
      m.mesh.scale.set(p.w, p.h, 1);
      m.mesh.rotation.set(0, Math.atan2(cam.pos.x - p.x, cam.pos.z - p.z), p.rot ?? 0);
      m.mesh.visible = true;
      m.r = this.pool.req(p.key, p.cw, p.ch, 1, p.draw);
      m.bind();
    }
    for (const [id, m] of this.fxs) if (!seenF.has(m.key)) m.mesh.visible = false;

    this.pool.flush();
    // bind after flush: the pool assigns the shared texture to every request
    for (const [, a] of this.actors) if (a.mesh.visible) a.bind();
    for (const [, m] of this.fxs) if (m.mesh.visible) m.bind();
  }
}
