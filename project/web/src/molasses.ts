// The 1919 North End set: Commercial Street, the row houses, the great riveted molasses tank, the firehouse,
// the railcars, barrels, and the molasses itself (pool + curling wave + drips + steam).
// Everything is driven by 0..1 progress values that story.ts sets per shot, so a shot can hold a pose.
import * as THREE from "three";
import { ctex, rng } from "./paint";
import { twoTone } from "./shade";
import { lam } from "./world";
import { NOINK } from "./ink";

export const FPS = 30;
const MOL = "#4a2410";        // molasses albedo (dark warm brown, readable on screen)
const MOL_LIT = "#8a5226";    // crest / wet highlight
const STEEL = "#7d8894";

// ---------------- painted textures ----------------
const steelHD = () => ctex("steelHD", 1024, 1024, (g, r) => {
  g.fillStyle = "#c2cad4"; g.fillRect(0, 0, 1024, 1024);
  // plate courses
  const rows = 8, cols = 10;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = (i * 1024) / cols, y = (j * 1024) / rows, w = 1024 / cols, h = 1024 / rows;
    const l = 1.0 + r() * 0.30;
    g.fillStyle = `rgb(${Math.round(190 * l)},${Math.round(202 * l)},${Math.round(216 * l)})`;
    g.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
    g.strokeStyle = "rgba(20,26,34,0.75)"; g.lineWidth = 2.5; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    // rivets along the plate edges
    g.fillStyle = "rgba(28,34,44,0.9)";
    const n = 7;
    for (let k = 0; k < n; k++) {
      const rx = x + 8 + (k * (w - 16)) / (n - 1);
      g.beginPath(); g.arc(rx, y + 6, 3.4, 0, 7); g.fill();
      g.beginPath(); g.arc(rx, y + h - 6, 3.4, 0, 7); g.fill();
    }
    g.beginPath(); g.arc(x + 6, y + h / 2, 3.4, 0, 7); g.fill();
    g.beginPath(); g.arc(x + w - 6, y + h / 2, 3.4, 0, 7); g.fill();
  }
  // rust / molasses streaks running down
  for (let i = 0; i < 16; i++) {
    const x = r() * 1024, w = 6 + r() * 30, h = 90 + r() * 460, y0 = r() * 420;
    const gr = g.createLinearGradient(0, y0, 0, y0 + h);
    gr.addColorStop(0, "rgba(96,52,24,0.30)"); gr.addColorStop(1, "rgba(96,52,24,0)");
    g.fillStyle = gr; g.fillRect(x, y0, w, h);
  }
  // grime at the base
  const b = g.createLinearGradient(0, 780, 0, 1024);
  b.addColorStop(0, "rgba(40,26,14,0)"); b.addColorStop(1, "rgba(40,26,14,0.30)");
  g.fillStyle = b; g.fillRect(0, 780, 1024, 244);
});

const molassesSurf = () => ctex("molSurf", 1024, 1024, (g, r) => {
  g.fillStyle = "#4a2410"; g.fillRect(0, 0, 1024, 1024);
  // slow swirls / ribbons of lighter syrup
  for (let i = 0; i < 120; i++) {
    const x = r() * 1024, y = r() * 1024, len = 60 + r() * 300, a = r() * Math.PI;
    g.strokeStyle = `rgba(${120 + r() * 70 | 0},${60 + r() * 40 | 0},${26 + r() * 22 | 0},${0.10 + r() * 0.22})`;
    g.lineWidth = 6 + r() * 26; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + (r() - 0.5) * 60, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // wet glints
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,235,210,${0.05 + r() * 0.16})`;
    g.beginPath(); g.ellipse(r() * 1024, r() * 1024, 12 + r() * 46, 3 + r() * 9, r() * 3, 0, 7); g.fill();
  }
});

const poolEdge = () => ctex("poolEdge", 512, 512, (g, r) => {
  g.clearRect(0, 0, 512, 512);
  const cx = 256, cy = 256;
  g.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const rad = 200 * (1 + 0.16 * Math.sin(a * 3 + 1.1) + 0.09 * Math.sin(a * 7 + 0.4) + 0.05 * (r() - 0.5));
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fillStyle = "#4a2410"; g.fill();
  g.strokeStyle = "rgba(150,90,44,0.85)"; g.lineWidth = 10; g.stroke();
});

const steamTex = () => ctex("steam", 256, 256, (g, r) => {
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    const x = 128 + (r() - 0.5) * 150, y = 128 + (r() - 0.5) * 150, rad = 20 + r() * 55;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, "rgba(255,246,235,0.30)"); gr.addColorStop(1, "rgba(255,246,235,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
  }
});

// ---------------- materials ----------------
const molassesMat = () => twoTone(new THREE.MeshPhongMaterial({
  color: new THREE.Color("#ffffff"), specular: new THREE.Color("#c88a5a"), shininess: 90,
  map: molassesSurf(), emissive: new THREE.Color("#180a04"),
}));
const crestMat = () => twoTone(new THREE.MeshPhongMaterial({
  color: new THREE.Color(MOL_LIT), specular: new THREE.Color("#ffb070"), shininess: 130,
}));

// ---------------- helpers ----------------
const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt: number, rb: number, h: number, m: THREE.Material, seg = 18) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);

/** a curling wall of molasses: profile extruded across the street */
function makeWave(): THREE.Group {
  const grp = new THREE.Group();
  const H = 4.6, D = 3.4, W = 13;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, H * 0.72);
  s.quadraticCurveTo(0, H * 1.06, D * 0.42, H * 1.02);
  s.quadraticCurveTo(D * 0.92, H * 0.98, D, H * 0.62);
  s.lineTo(D, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 14 });
  geo.translate(0, 0, -W / 2);
  const body = new THREE.Mesh(geo, molassesMat());
  body.castShadow = true; body.receiveShadow = true;
  grp.add(body);
  // crest: a rounded ridge along the lip
  const crest = cyl(0.55, 0.55, W, crestMat(), 12);
  crest.rotation.x = Math.PI / 2;
  crest.position.set(D * 0.94, H * 0.72, 0);
  crest.scale.set(1, 1, 1.5);
  grp.add(crest);
  // a second, smaller chop in front
  const chop = box(D * 0.8, 0.5, W * 0.94, molassesMat());
  chop.position.set(D * 1.5, 0.25, 0);
  grp.add(chop);
  grp.userData = { H, D, W };
  return grp;
}

export class Set {
  group = new THREE.Group();
  tank = new THREE.Group();
  wave = makeWave();
  pool: THREE.Mesh;
  firehouse = new THREE.Group();
  railcar = new THREE.Group();
  barrels = new THREE.Group();
  lamp: THREE.Group;
  drips: THREE.Mesh[] = [];
  steam: THREE.Mesh[] = [];
  planks: THREE.Mesh[] = [];
  jet: THREE.Mesh;
  patch: THREE.Mesh;
  tear: THREE.Mesh;
  flag: THREE.Mesh | null = null;
  private tankWall: THREE.Mesh;
  private tankTop: THREE.Mesh;

  constructor() {
    const g = this.group;
    // Commercial Street: cobbles, cambered slightly, running along +X
    const cob = ctex("cobbleHD", 2048, 2048, (gg, r) => {
      gg.fillStyle = "#9a938c"; gg.fillRect(0, 0, 2048, 2048);
      const rnd = rng(7);
      for (let y = 0; y < 46; y++) for (let x = 0; x < 46; x++) {
        const px = (x * 2048) / 46 + (y % 2) * 22, py = (y * 2048) / 46;
        const l = 0.82 + rnd() * 0.4;
        gg.fillStyle = `rgb(${Math.round(150 * l)},${Math.round(143 * l)},${Math.round(136 * l)})`;
        gg.beginPath();
        gg.ellipse(px, py, 22 + rnd() * 5, 15 + rnd() * 4, rnd() * 0.4, 0, 7);
        gg.fill();
        gg.strokeStyle = "rgba(52,48,46,0.55)"; gg.lineWidth = 2.4; gg.stroke();
      }
      for (let i = 0; i < 260; i++) { // wet patches / grime
        gg.fillStyle = `rgba(40,32,26,${0.05 + rnd() * 0.12})`;
        gg.beginPath(); gg.ellipse(rnd() * 2048, rnd() * 2048, 20 + rnd() * 90, 14 + rnd() * 60, rnd() * 3, 0, 7); gg.fill();
      }
    });
    const street = new THREE.Mesh(new THREE.PlaneGeometry(96, 15), twoTone(new THREE.MeshLambertMaterial({ map: cob })));
    street.rotation.x = -Math.PI / 2;
    street.position.set(2, 0.02, 0);
    street.receiveShadow = true;
    g.add(street);
    // pavements
    const paveMat = lam("pave", () => ({ color: new THREE.Color("#b9b2a8") })) as THREE.MeshLambertMaterial;
    for (const pz of [-8.4, 8.4]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(96, 0.22, 3.0), paveMat);
      p.position.set(2, 0.11, pz); p.receiveShadow = true;
      g.add(p);
    }
    const steel = twoTone(new THREE.MeshPhongMaterial({ map: steelHD(), color: new THREE.Color("#c8ccd2"), specular: new THREE.Color("#4a5460"), shininess: 24 }));
    const steelDark = lam("steelDark", () => ({ color: new THREE.Color("#4a525c") })) as THREE.MeshLambertMaterial;
    const wood = lam("wood", () => ({ color: new THREE.Color("#7a5230") })) as THREE.MeshLambertMaterial;
    const woodDark = lam("woodDark", () => ({ color: new THREE.Color("#4a3220") })) as THREE.MeshLambertMaterial;
    const brick = lam("brickWall", () => ({ color: new THREE.Color("#a8502f") })) as THREE.MeshLambertMaterial;

    // ---- the tank: 27 m across, 15 m tall, on a low steel skirt ----
    const R = 12.5, TH = 15;
    this.tankWall = cyl(R, R, TH, steel, 56);
    this.tankWall.position.y = TH / 2 + 1.2;
    this.tankWall.castShadow = true; this.tankWall.receiveShadow = true;
    this.tankTop = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 12, 0, Math.PI * 2, 0, Math.PI * 0.30), steel);
    this.tankTop.scale.y = 0.42; this.tankTop.position.y = TH + 1.2;
    this.tankTop.castShadow = true;
    const skirt = cyl(R * 0.98, R * 1.02, 1.2, steelDark, 40);
    skirt.position.y = 0.6;
    // legs / frame
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const leg = box(0.5, 3.2, 0.5, steelDark);
      leg.position.set(Math.cos(a) * R * 0.93, 1.2, Math.sin(a) * R * 0.93);
      leg.castShadow = true;
      this.tank.add(leg);
    }
    // ladder + fill pipe
    const ladder = new THREE.Group();
    for (let i = 0; i < 12; i++) { const r = box(0.5, 0.07, 0.07, steelDark); r.position.y = i * 1.2; ladder.add(r); }
    const railA = box(0.07, 14.6, 0.07, steelDark); railA.position.set(-0.3, 7.2, 0);
    const railB = box(0.07, 14.6, 0.07, steelDark); railB.position.set(0.3, 7.2, 0);
    ladder.add(railA, railB);
    ladder.position.set(0, 0, R + 0.1);
    const pipe = cyl(0.45, 0.45, 6, steelDark, 12);
    pipe.rotation.z = Math.PI / 2.4; pipe.position.set(R * 0.7, TH + 2.4, 0);
    this.tank.add(this.tankWall, this.tankTop, skirt, ladder, pipe);
    this.tank.position.set(-14, 0, -26);
    g.add(this.tank);

    // ---- molasses pool (unit disc, scaled per shot) ----
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), twoTone(new THREE.MeshPhongMaterial({
      map: poolEdge(), transparent: true, color: new THREE.Color("#ffffff"), specular: new THREE.Color("#7a4a2c"), shininess: 60, depthWrite: false,
    })));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.05;
    this.pool.renderOrder = 0.2;
    g.add(this.pool);

    // ---- wave ----
    this.wave.visible = false;
    g.add(this.wave);

    // ---- firehouse (Engine 31): brick, big door, hose tower ----
    const fh = this.firehouse;
    const fhBody = box(9, 6.5, 7, brick); fhBody.position.y = 3.25; fhBody.castShadow = true; fhBody.receiveShadow = true;
    const fhRoof = cyl(0.01, 7.2, 3.2, lam("roofT", () => ({ color: new THREE.Color("#8a3b2c") })) as THREE.MeshLambertMaterial, 4);
    fhRoof.rotation.y = Math.PI / 4; fhRoof.scale.set(1, 1, 0.8); fhRoof.position.y = 8.1;
    const tower = box(3.2, 10.5, 3.2, brick); tower.position.set(3.4, 5.25, -1.6); tower.castShadow = true;
    const towerCap = cyl(0.01, 2.6, 1.8, lam("roofT2", () => ({ color: new THREE.Color("#8a3b2c") })) as THREE.MeshLambertMaterial, 4);
    towerCap.rotation.y = Math.PI / 4; towerCap.position.set(3.4, 11.4, -1.6);
    const door = box(3.6, 4.2, 0.4, woodDark); door.position.set(-1.6, 2.1, 3.55);
    const doorTrim = box(4.2, 4.8, 0.2, lam("trim", () => ({ color: new THREE.Color("#e8dcc4") })) as THREE.MeshLambertMaterial);
    doorTrim.position.set(-1.6, 2.4, 3.45);
    fh.add(fhBody, fhRoof, tower, towerCap, doorTrim, door);
    fh.position.set(16, 0, -13);
    fh.rotation.y = 0.12;
    g.add(fh);

    // ---- railcar on tracks ----
    const rc = this.railcar;
    const rcBody = box(8.5, 2.6, 2.6, lam("rcBody", () => ({ color: new THREE.Color("#6a3a24") })) as THREE.MeshLambertMaterial);
    rcBody.position.y = 2.0; rcBody.castShadow = true;
    const rcTop = box(7.4, 0.7, 2.2, woodDark); rcTop.position.y = 3.6;
    rc.add(rcBody, rcTop);
    for (const [wx, wz] of [[-3, -1.1], [-3, 1.1], [3, -1.1], [3, 1.1]] as const) {
      const wheel = cyl(0.62, 0.62, 0.3, steelDark, 16);
      wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.62, wz);
      rc.add(wheel);
    }
    // tracks
    const track = new THREE.Group();
    for (const tz of [-1.1, 1.1]) { const r = box(40, 0.16, 0.16, steelDark); r.position.set(0, 0.08, tz); track.add(r); }
    for (let i = -19; i <= 19; i += 1.6) { const s = box(0.24, 0.1, 3.0, woodDark); s.position.set(i, 0.03, 0); track.add(s); }
    track.rotation.y = Math.PI / 2;   // rails cross the street (along Z)
    track.position.set(22, 0, 0);
    this.group.add(track);
    rc.rotation.y = Math.PI / 2;
    rc.position.set(22, 0, 0);
    g.add(rc);

    // ---- barrels (warm shipment) ----
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group();
      const body = cyl(0.62, 0.62, 1.5, wood, 16); body.position.y = 0.75; body.castShadow = true;
      const hoop1 = cyl(0.65, 0.65, 0.1, steelDark, 16); hoop1.position.y = 0.3;
      const hoop2 = cyl(0.65, 0.65, 0.1, steelDark, 16); hoop2.position.y = 1.2;
      b.add(body, hoop1, hoop2);
      b.position.set(i * 1.9 - 4, 0, (i % 2) * 1.1);
      b.rotation.y = i * 0.7;
      this.barrels.add(b);
    }
    this.barrels.position.set(-20, 0, 2);
    g.add(this.barrels);

    // ---- lamp posts ----
    this.lamp = new THREE.Group();
    for (const lx of [-24, -12, 0, 12, 26]) {
      const p = new THREE.Group();
      const pole = cyl(0.09, 0.13, 5.2, steelDark, 10); pole.position.y = 2.6; pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 8), lam("lampGlow", () => ({ color: new THREE.Color("#ffe6b0") })) as THREE.MeshLambertMaterial);
      head.position.y = 5.3;
      p.add(pole, head);
      p.position.set(lx, 0, 6.4);
      this.lamp.add(p);
    }
    g.add(this.lamp);

    // ---- drips (falling molasses) ----
    const dripMat = molassesMat();
    for (let i = 0; i < 9; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.14 + (i % 3) * 0.05, 8, 6), dripMat);
      d.visible = false;
      d.userData = { x: 0, z: 0, h: 0, sp: 0.6 + (i % 4) * 0.22, off: i * 0.37 };
      this.drips.push(d); g.add(d);
    }

    // ---- steam puffs ----
    const st = steamTex();
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, opacity: 0.5 }));
      m.visible = false; m.userData = { off: i * 0.5, x: 0, z: 0, s: 1 };
      m.layers.set(NOINK);
      this.steam.push(m); g.add(m);
    }

    // ---- painter's ladder + bucket at the tank base ----
    const ladder2 = new THREE.Group();
    for (let i = 0; i < 8; i++) { const r = box(0.7, 0.08, 0.08, wood); r.position.y = i * 0.85; ladder2.add(r); }
    const la = box(0.09, 7.0, 0.09, wood); la.position.set(-0.34, 3.4, 0);
    const lb = box(0.09, 7.0, 0.09, wood); lb.position.set(0.34, 3.4, 0);
    ladder2.add(la, lb);
    ladder2.position.set(-9.4, 0, -16.2);
    ladder2.rotation.set(-0.22, 0.1, 0.0);
    g.add(ladder2);
    const bucket = cyl(0.34, 0.26, 0.5, lam("bucket", () => ({ color: new THREE.Color("#8a8f96") })) as THREE.MeshLambertMaterial, 14);
    bucket.position.set(-8.2, 0.25, -15.0); bucket.castShadow = true;
    g.add(bucket);

    // ---- the burst jet: molasses erupting from the tank base ----
    this.jet = cyl(0.9, 1.5, 12, molassesMat(), 16);
    this.jet.rotation.z = Math.PI / 2;
    this.jet.visible = false;
    this.jet.castShadow = true;
    g.add(this.jet);

    // ---- the brown paint patch on the tank wall (grows while the painter works) ----
    this.patch = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 7.5), twoTone(new THREE.MeshPhongMaterial({
      color: new THREE.Color("#4a2a14"), specular: new THREE.Color("#7a4a2c"), shininess: 40, transparent: true, opacity: 0.92,
    })));
    this.patch.position.set(-10.4, 4.2, -15.2);
    this.patch.rotation.y = 0.12;
    this.patch.visible = false;
    g.add(this.patch);

    // ---- the tear in the tank wall (dark jagged gap, scales open at the burst) ----
    this.tear = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 9.0), new THREE.MeshBasicMaterial({ color: new THREE.Color("#120802"), side: THREE.DoubleSide }));
    this.tear.position.set(-14.0, 4.0, -15.05);
    this.tear.visible = false;
    g.add(this.tear);

    this.buildOffice();

    // ---- debris planks ----
    for (let i = 0; i < 8; i++) {
      const p = box(1.8 + (i % 3) * 0.7, 0.16, 0.4, woodDark);
      p.visible = false; p.userData = { x: 0, z: 0, rot: 0 };
      this.planks.push(p); g.add(p);
    }
  }

  /** place the tank-relative drips: x,z = world spawn, h = fall height */
  setDrips(list: { x: number; z: number; h: number }[]) {
    this.drips.forEach((d, i) => {
      const it = list[i % Math.max(1, list.length)];
      d.visible = !!it;
      if (it) d.userData.x = it.x, d.userData.z = it.z, d.userData.h = it.h;
    });
  }
  setSteam(list: { x: number; z: number; s: number }[]) {
    this.steam.forEach((m, i) => {
      const it = list[i % Math.max(1, list.length)];
      m.visible = !!it;
      if (it) m.userData.x = it.x, m.userData.z = it.z, m.userData.s = it.s;
    });
  }
  setPlanks(list: { x: number; z: number; rot: number }[]) {
    this.planks.forEach((p, i) => {
      const it = list[i % Math.max(1, list.length)];
      p.visible = !!it;
      if (it) p.userData.x = it.x, p.userData.z = it.z, p.userData.rot = it.rot;
    });
  }

  /** per-frame secondary motion: drips fall and reset, steam billows, planks rock */
  update(f: number) {
    const t = f / FPS;
    for (const d of this.drips) {
      if (!d.visible) continue;
      const u = (t * d.userData.sp + d.userData.off) % 1;
      d.position.set(d.userData.x, d.userData.h * (1 - u) + 0.1, d.userData.z);
      d.scale.setScalar(0.7 + u * 0.9);
    }
    for (const m of this.steam) {
      if (!m.visible) continue;
      const u = (t * 0.32 + m.userData.off) % 1;
      const s = m.userData.s * (0.6 + u * 1.5);
      m.position.set(m.userData.x + Math.sin(u * 5 + m.userData.off * 9) * 0.5, 1.2 + u * 5.5, m.userData.z);
      m.scale.setScalar(s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - u);
      m.lookAt(m.position.clone().add(new THREE.Vector3(0, 0, 1)));
    }
    for (const p of this.planks) {
      if (!p.visible) continue;
      p.position.set(p.userData.x, 0.12 + Math.sin(t * 0.9 + p.userData.x) * 0.05, p.userData.z);
      p.rotation.set(0, p.userData.rot, Math.sin(t * 0.7 + p.userData.z) * 0.05);
    }
    if (this.flag) {
      const pos = this.flag.geometry.attributes.position as THREE.BufferAttribute;
      const base = this.flag.userData.base as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1];
        pos.setZ(i, Math.sin(x * 3.1 + t * 6 + y) * 0.16 * (x + 0.75));
      }
      pos.needsUpdate = true;
    }
  }

  /** cutaway office: dark room box + desk + chair + lamp, used for the company/corridor inserts */
  office = new THREE.Group();
  private buildOffice() {
    const o = this.office;
    const wallM = lam("officeWall", () => ({ color: new THREE.Color("#7a6a80") })) as THREE.MeshLambertMaterial;
    const floorM = lam("officeFloor", () => ({ map: ctex("officeFloor", 512, 512, (g, r) => { g.fillStyle = "#9a7a54"; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,220,180,${0.03 + r() * 0.05})`; g.fillRect(0, i * 20, 512, 3); } }) })) as THREE.MeshLambertMaterial;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), floorM);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.02; floor.receiveShadow = true;
    const back = box(12, 6, 0.4, wallM); back.position.set(0, 3, -4.3);
    const left = box(0.4, 6, 9, wallM); left.position.set(-5.8, 3, 0);
    const right = box(0.4, 6, 9, wallM); right.position.set(5.8, 3, 0);
    const ceil = box(12, 0.4, 9, wallM); ceil.position.set(0, 6.1, 0);
    // desk
    const wood = lam("deskWood", () => ({ color: new THREE.Color("#5a3a22") })) as THREE.MeshLambertMaterial;
    const top = box(4.4, 0.22, 2.2, wood); top.position.set(0, 1.35, -1.0); top.castShadow = true;
    for (const [lx, lz] of [[-2.0, -1.9], [2.0, -1.9], [-2.0, -0.1], [2.0, -0.1]] as const) {
      const leg = box(0.2, 1.35, 0.2, wood); leg.position.set(lx, 0.67, lz); o.add(leg);
    }
    // paper on the desk
    const paperTex = ctex("paperTex", 512, 360, (g) => {
      g.fillStyle = "#f2ead6"; g.fillRect(0, 0, 512, 360);
      g.strokeStyle = "#8a7f6a"; g.lineWidth = 3; g.strokeRect(10, 10, 492, 340);
      // a tank drawing: elevation + plan, dimension lines
      g.strokeStyle = "#4a5a8a"; g.lineWidth = 4;
      g.strokeRect(40, 150, 240, 150);                       // tank body
      g.beginPath(); g.ellipse(160, 150, 120, 40, 0, Math.PI, 0); g.stroke();   // roof
      for (const x of [80, 160, 240]) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x, 300); g.stroke(); }
      g.beginPath(); g.moveTo(40, 320); g.lineTo(280, 320); g.stroke();
      g.beginPath(); g.moveTo(40, 312); g.lineTo(40, 328); g.moveTo(280, 312); g.lineTo(280, 328); g.stroke();
      g.strokeRect(330, 170, 140, 120);                     // plan view
      g.beginPath(); g.arc(400, 230, 55, 0, 7); g.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(400, 230); g.lineTo(400 + Math.cos(a) * 55, 230 + Math.sin(a) * 55); g.stroke(); }
      g.fillStyle = "#b02a22"; g.beginPath(); g.arc(430, 300, 26, 0, 7); g.fill();   // wax seal
      g.strokeStyle = "#b02a22"; g.lineWidth = 2.5; g.beginPath(); g.arc(430, 300, 20, 0, 7); g.stroke();
      g.strokeStyle = "#3a3428"; g.lineWidth = 3;            // signature
      g.beginPath(); g.moveTo(60, 60);
      for (let i = 0; i < 12; i++) g.quadraticCurveTo(60 + i * 14, 30 + ((i * 37) % 40), 60 + (i + 1) * 14, 58);
      g.stroke();
    });
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshLambertMaterial({ map: paperTex, side: THREE.DoubleSide }));
    paper.rotation.x = -Math.PI / 2; paper.rotation.z = 0.2; paper.position.set(-0.7, 1.47, -1.0);
    // inkwell + pen
    const ink = cyl(0.12, 0.14, 0.22, lam("ink", () => ({ color: new THREE.Color("#141820") })) as THREE.MeshLambertMaterial, 10);
    ink.position.set(0.9, 1.55, -1.4);
    // lamp
    const lampM = lam("deskLamp", () => ({ color: new THREE.Color("#2f6a4a") })) as THREE.MeshLambertMaterial;
    const lampArm = cyl(0.05, 0.05, 1.4, lampM, 8); lampArm.position.set(1.6, 2.0, -1.2); lampArm.rotation.z = -0.4;
    const lampHead = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.5, 12), lampM); lampHead.position.set(1.95, 2.7, -1.2);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffe6b0") }));
    glow.position.set(1.95, 2.55, -1.2);
    // chair
    const chair = new THREE.Group();
    const seat = box(1.1, 0.14, 1.1, wood); seat.position.y = 0.95;
    const backr = box(1.1, 1.3, 0.14, wood); backr.position.set(0, 1.7, -0.5);
    chair.add(seat, backr);
    for (const [cx2, cz2] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]] as const) {
      const l = box(0.1, 0.95, 0.1, wood); l.position.set(cx2, 0.47, cz2); chair.add(l);
    }
    chair.position.set(0.2, 0, 1.6);
    const lampLight = new THREE.PointLight(0xffd9a8, 22, 12, 2); lampLight.position.set(0.4, 3.4, 0.6); o.add(lampLight);
    o.add(floor, back, left, right, top, paper, ink, lampArm, lampHead, glow, chair);   // no ceiling: the sun lights the cutaway
    o.position.set(70, 0, 40);
    o.rotation.y = 0;
    this.group.add(o);
  }

  addFlag(x: number, y: number, z: number, col = "#c0353a") {
    const pole = cyl(0.05, 0.05, 3.4, lam("pole", () => ({ color: new THREE.Color("#6b4a2c") })) as THREE.MeshLambertMaterial, 6);
    pole.position.set(x, y + 1.7, z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 8, 4), new THREE.MeshLambertMaterial({ color: new THREE.Color(col), side: THREE.DoubleSide }));
    flag.position.set(x + 0.78, y + 2.9, z);
    flag.userData.base = flag.geometry.attributes.position.array.slice();
    this.flag = flag;
    this.group.add(pole, flag);
    return flag;
  }
}
