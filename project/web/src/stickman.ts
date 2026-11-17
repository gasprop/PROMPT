// Flat 2D hand-drawn stickman cast, drawn on a canvas (MASTER-PROMPT step 9, "THE STICKMAN STYLE").
// Design space 600 x 1000 units, soles at y = 975. Pure-white head, black stick limbs, no nose, no face shading.
import { Pen, blobPts, mul } from "./toon";

export const INK = "#2a1a30";        // dark plum-navy, like a thick marker
export const WHITE = "#ffffff";
const MOUTH = "#5a1e28";

export type BodyKind = "tunic" | "suit" | "dress" | "robe" | "armor";
export type Hat = "none" | "cap" | "helm" | "hood" | "top" | "straw" | "crown" | "bowler";
export type Prop = "none" | "spear" | "sword" | "shield" | "staff" | "flag" | "hammer" | "scroll"
  | "jar" | "brush" | "paper" | "spoon" | "stamp";
export type Outfit = {
  body: string; kind?: BodyKind; legs?: string; belt?: string; hat?: Hat; hatCol?: string;
  cape?: string; prop?: Prop; propCol?: string; scale?: number;
};
/** Add new outfits for a story's characters here. */
export const OUTFITS: Record<string, Outfit> = {
  hero: { body: "#b8322f", kind: "tunic", legs: "#3b3f52", belt: "#f1efe6", hat: "helm", cape: "#8f2228", prop: "spear" },
  worker: { body: "#3f6fb5", kind: "suit", legs: "#2f3340", belt: "#6b4a2c", hat: "cap", hatCol: "#e2453c", prop: "hammer" },
  elder: { body: "#7b5ac9", kind: "robe", legs: "#3b3f52", hat: "hood", hatCol: "#5a4480", prop: "staff" },
  kid: { body: "#f08a2c", kind: "tunic", legs: "#3b5b9a", hat: "cap", hatCol: "#e2453c", scale: 0.72 },
  guard: { body: "#357650", kind: "armor", legs: "#3d4440", belt: "#f1efe6", hat: "helm", hatCol: "#8d949c", prop: "shield" },
  // ---- 1919 North End cast ----
  walker: { body: "#6b4a2c", kind: "tunic", legs: "#33383f", belt: "#d8cfb8", hat: "cap", hatCol: "#3f4a52" },
  painter: { body: "#4a6fa5", kind: "suit", legs: "#2f3340", belt: "#6b4a2c", hat: "cap", hatCol: "#c8b06a", prop: "brush" },
  kid2: { body: "#3f8a5a", kind: "tunic", legs: "#3b5b9a", hat: "cap", hatCol: "#e2453c", scale: 0.66, prop: "jar" },
  suit: { body: "#2f3540", kind: "suit", legs: "#23282f", belt: "#c8a04a", hat: "bowler", hatCol: "#1e222a", prop: "paper" },
  auditor: { body: "#5a4480", kind: "robe", legs: "#3b3f52", hat: "none", prop: "stamp" },
  victim: { body: "#8a7a5a", kind: "tunic", legs: "#4a4438", hat: "none" },
};

export type Expr = "neutral" | "smile" | "grin" | "laugh" | "shock" | "stern" | "nervous" | "sad" | "dazed" | "curious";
type EyeK = "open" | "half" | "wide" | "closed";
type MouthK = "flat" | "smile" | "frown" | "grin" | "open" | "o" | "wave" | "teeth";
const FACE: Record<Expr, { brow: number; eye: EyeK; mouth: MouthK }> = {
  neutral: { brow: 0, eye: "open", mouth: "flat" },
  smile: { brow: -2, eye: "open", mouth: "smile" },
  grin: { brow: -5, eye: "open", mouth: "grin" },
  laugh: { brow: -7, eye: "closed", mouth: "open" },
  shock: { brow: -11, eye: "wide", mouth: "o" },
  stern: { brow: 9, eye: "half", mouth: "frown" },
  nervous: { brow: 4, eye: "half", mouth: "wave" },
  sad: { brow: 6, eye: "half", mouth: "frown" },
  dazed: { brow: 0, eye: "half", mouth: "wave" },
  curious: { brow: -7, eye: "open", mouth: "flat" },
};

const rad = (d: number) => (d * Math.PI) / 180;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const rnd = (seed: number, k: number) => { const x = Math.sin(seed * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

export type StickOpts = {
  view?: "front" | "side";
  facing?: 1 | -1;          // side view: 1 = faces screen-right
  phase?: number;           // walk phase 0..1
  moving?: boolean;
  expr?: Expr;
  blink?: number;           // 0 open .. 1 shut
  look?: number;            // -1..1 pupil offset
  lean?: number;            // degrees, + leans right
  seed?: number;
  bob?: number;             // idle breathing bob (units)
  sway?: number;            // idle sway (degrees)
  outfit: Outfit;
};

// ---------------- body contours (all clockwise on screen) ----------------
const headPts = (cx: number, cy: number, a: number, seed: number) =>
  blobPts(cx, cy, { a, b: a * (0.96 + 0.05 * (rnd(seed, 1) - 0.5)), nTop: 2.0, nBot: 2.1, egg: -0.04, asym: 0.03 * (rnd(seed, 6) < 0.5 ? -1 : 1), rot: rad(4 * (rnd(seed, 7) - 0.5)), noise: 0.012, seed }, 64);

type Torso = { pts: [number, number][]; cx: number; cy: number; rx: number; ry: number };
function torsoShape(kind: BodyKind, cx: number, top: number, hip: number, W: number): Torso {
  const ry = (hip - top) / 2, cy = (top + hip) / 2;
  if (kind === "suit") {
    const rx = W * 0.30, r = rx * 0.32, p: [number, number][] = [];
    for (let i = 0; i <= 8; i++) p.push([cx - rx + 2 * r + i * ((2 * rx - 2 * r) / 8), top]);
    p.push([cx + rx, top + r], [cx + rx, hip - r], [cx + rx - r, hip], [cx - rx + r, hip], [cx - rx, hip - r], [cx - rx, top + r], [cx - rx + r, top]);
    return { pts: p, cx, cy, rx, ry };
  }
  if (kind === "dress") {
    const rx = W * 0.46, rt = W * 0.22, p: [number, number][] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; p.push([cx + rt + (rx - rt) * t * t, top + (hip - top) * t]); }
    for (let i = 16; i >= 0; i--) { const t = i / 16; p.push([cx - rt - (rx - rt) * t * t, top + (hip - top) * t]); }
    return { pts: p, cx, cy, rx, ry };
  }
  if (kind === "robe") {
    const rx = W * 0.34, rt = W * 0.24, bot = hip + 60, p: [number, number][] = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; p.push([cx + rt + (rx - rt) * t, top + (bot - top) * t]); }
    for (let i = 16; i >= 0; i--) { const t = i / 16; p.push([cx - rt - (rx - rt) * t, top + (bot - top) * t]); }
    return { pts: p, cx, cy: (top + bot) / 2, rx, ry: (bot - top) / 2 };
  }
  if (kind === "armor") {
    const rx = W * 0.33, p: [number, number][] = [];
    for (let i = 0; i < 28; i++) { const t = (i / 28) * Math.PI * 2; p.push([cx + rx * Math.sign(Math.cos(t)) * Math.abs(Math.cos(t)) ** 0.6, cy + ry * Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** 0.6]); }
    return { pts: p, cx, cy, rx, ry };
  }
  const rx = W * 0.31;
  return { pts: blobPts(cx, cy, { a: rx, b: ry, nTop: 2.0, nBot: 2.4, egg: 0.05, asym: 0, rot: 0, noise: 0.01, seed: 3 }, 40), cx, cy, rx, ry };
}

// ---------------- face ----------------
function drawEye(p: Pen, kind: EyeK, x: number, y: number, u: number, look: number, blink: number) {
  if (blink >= 0.99) kind = "closed";
  else if (blink >= 0.5 && kind === "open") kind = "half";
  const lx = x + look * 4 * u;
  switch (kind) {
    case "open": p.ell(x, y, 15 * u, 18 * u, WHITE, 4 * u); p.dot(lx, y + 1 * u, 6 * u, INK); break;
    case "half": p.arc(x, y - 2 * u, 17 * u, 9 * u, 200, 340, 7 * u, INK); break;
    case "wide": p.ell(x, y, 19 * u, 22 * u, WHITE, 4 * u); p.dot(lx, y + 2 * u, 4.5 * u, INK); break;
    case "closed": p.arc(x, y - 3 * u, 16 * u, 10 * u, 20, 160, 7 * u, INK); break;
  }
}
function drawBrow(p: Pen, x: number, y: number, side: number, ang: number, u: number) {
  const a = rad(ang * side), x0 = x - side * 20 * u, y0 = y + Math.sin(a) * 10 * u;
  const x1 = x + side * 12 * u, y1 = y - Math.sin(a) * 12 * u - 3 * u;
  p.stroke([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 - 4 * u], [x1, y1]], 9 * u, INK);
}
function drawMouth(p: Pen, kind: MouthK, x: number, y: number, u: number) {
  switch (kind) {
    case "flat": p.stroke([[x - 16 * u, y], [x + 16 * u, y - 2 * u]], 8 * u, INK); break;
    case "smile": p.arc(x, y - 8 * u, 24 * u, 16 * u, 25, 155, 8 * u, INK); break;
    case "frown": p.arc(x, y + 10 * u, 22 * u, 14 * u, 205, 335, 8 * u, INK); break;
    case "grin":
      p.ell(x, y, 26 * u, 16 * u, MOUTH, 6 * u, 0, 180);
      p.clip([[x - 26 * u, y], [x + 26 * u, y], [x + 26 * u, y + 6 * u], [x - 26 * u, y + 6 * u]], () => p.ell(x, y, 26 * u, 16 * u, WHITE, 0, 0, 180));
      p.ell(x, y, 26 * u, 16 * u, null, 5 * u, 0, 180);
      break;
    case "open": p.ell(x, y + 2 * u, 22 * u, 24 * u, MOUTH, 6 * u); p.ell(x, y + 14 * u, 11 * u, 7 * u, "#e86e78", 0); break;
    case "o": p.ell(x, y + 2 * u, 12 * u, 14 * u, MOUTH, 5 * u); break;
    case "wave": {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 12; i++) pts.push([x - 20 * u + i * (40 * u) / 12, y + 3 * u * Math.sin(i * 1.3)]);
      p.stroke(pts, 6 * u, INK);
      break;
    }
    case "teeth":
      p.poly([[x - 24 * u, y - 8 * u], [x + 24 * u, y - 8 * u], [x + 22 * u, y + 8 * u], [x - 22 * u, y + 8 * u]], WHITE, 5 * u);
      for (const j of [-1, 0, 1]) p.stroke([[x + j * 12 * u, y - 8 * u], [x + j * 12 * u, y + 8 * u]], 2 * u, INK);
      break;
  }
}

// ---------------- hats / props ----------------
function drawHat(p: Pen, hat: Hat, col: string, cx: number, crown: number, W: number, u: number) {
  if (hat === "none") return;
  if (hat === "cap") {
    p.ell(cx, crown + 6 * u, W * 0.30, W * 0.20, col, 8 * u, 0, 180);
    p.ell(cx, crown + 6 * u, W * 0.30, W * 0.20, null, 6 * u, 0, 180);
    p.ell(cx + 18 * u, crown + 10 * u, 26 * u, 7 * u, mul(col, 0.85), 5 * u, 0, 180);
  } else if (hat === "helm") {
    p.ell(cx, crown + 10 * u, W * 0.31, W * 0.24, col, 8 * u, 0, 180);
    p.ell(cx, crown + 10 * u, W * 0.31, W * 0.24, null, 6 * u, 0, 180);
    p.poly([[cx - 4 * u, crown + 4 * u], [cx + 4 * u, crown + 4 * u], [cx + 4 * u, crown + 40 * u], [cx - 4 * u, crown + 40 * u]], col, 4 * u);
    p.ell(cx, crown - 8 * u, 10 * u, 10 * u, "#2b7a4b", 4 * u);
  } else if (hat === "hood") {
    p.ell(cx, crown + 14 * u, W * 0.36, W * 0.30, col, 9 * u, 120, 390);
  } else if (hat === "top") {
    const hw = W * 0.22, ht = W * 0.34;
    p.poly([[cx - hw, crown + 14 * u], [cx + hw, crown + 14 * u], [cx + hw * 0.8, crown - ht], [cx - hw * 0.8, crown - ht]], col, 8 * u);
    p.ell(cx, crown + 14 * u, hw * 1.5, 9 * u, mul(col, 0.8), 6 * u);
  } else if (hat === "straw") {
    p.ell(cx, crown + 12 * u, W * 0.44, 10 * u, col, 6 * u);
    p.ell(cx, crown + 4 * u, W * 0.24, W * 0.17, col, 6 * u, 0, 180);
  } else if (hat === "bowler") {
    p.ell(cx, crown + 12 * u, W * 0.26, 8 * u, mul(col, 0.82), 6 * u);          // brim
    p.ell(cx, crown + 4 * u, W * 0.19, W * 0.16, col, 7 * u, 0, 360);           // dome
    p.ell(cx, crown + 4 * u, W * 0.19, W * 0.16, null, 5 * u, 0, 360);
    p.band([[cx - W * 0.19, crown + 8 * u], [cx + W * 0.19, crown + 8 * u]], "#12161c", 6 * u, 1.5 * u);
  } else if (hat === "crown") {
    const hw = W * 0.24, y0 = crown + 4 * u;
    p.poly([[cx - hw, y0], [cx - hw, y0 - 26 * u], [cx - hw * 0.4, y0 - 12 * u], [cx, y0 - 30 * u], [cx + hw * 0.4, y0 - 12 * u], [cx + hw, y0 - 26 * u], [cx + hw, y0]], col, 5 * u);
  }
}
function drawProp(p: Pen, prop: Prop, col: string, hx: number, hy: number, u: number, facing: number) {
  if (prop === "none") return;
  if (prop === "spear") {
    p.band([[hx, hy + 70 * u], [hx, hy - 190 * u]], "#8a5a34", 7 * u, 2 * u, "round");
    p.poly([[hx - 11 * u, hy - 190 * u], [hx + 11 * u, hy - 190 * u], [hx, hy - 236 * u]], col, 4 * u);
  } else if (prop === "staff") {
    p.band([[hx, hy + 80 * u], [hx, hy - 200 * u]], "#8a5a34", 8 * u, 2 * u, "round");
    p.ell(hx, hy - 208 * u, 13 * u, 13 * u, col, 4 * u);
  } else if (prop === "sword") {
    p.band([[hx, hy], [hx + facing * 60 * u, hy - 90 * u]], col, 9 * u, 2 * u, "round");
    p.band([[hx - facing * 14 * u, hy - 12 * u], [hx + facing * 14 * u, hy - 12 * u]], "#c9ccd2", 6 * u, 1.5 * u, "round");
  } else if (prop === "shield") {
    p.ell(hx + facing * 12 * u, hy + 20 * u, 44 * u, 52 * u, col, 8 * u);
    p.ell(hx + facing * 12 * u, hy + 20 * u, 16 * u, 18 * u, mul(col, 0.75), 4 * u);
  } else if (prop === "hammer") {
    p.band([[hx, hy + 20 * u], [hx, hy - 60 * u]], "#8a5a34", 8 * u, 2 * u, "round");
    p.poly([[hx - 24 * u, hy - 92 * u], [hx + 24 * u, hy - 92 * u], [hx + 24 * u, hy - 56 * u], [hx - 24 * u, hy - 56 * u]], col, 5 * u);
  } else if (prop === "flag") {
    p.band([[hx, hy + 80 * u], [hx, hy - 210 * u]], "#8a5a34", 7 * u, 2 * u, "round");
    p.poly([[hx, hy - 210 * u], [hx + facing * 90 * u, hy - 180 * u], [hx, hy - 150 * u]], col, 5 * u);
  } else if (prop === "jar") {
    // a small open jar held out to catch the drips
    p.ell(hx + facing * 6 * u, hy - 6 * u, 17 * u, 13 * u, "#c8b48a", 5 * u);
    p.ell(hx + facing * 6 * u, hy - 8 * u, 12 * u, 5 * u, "#3a1c0c", 3 * u, 0, 360);
  } else if (prop === "brush") {
    p.band([[hx, hy + 6 * u], [hx + facing * 26 * u, hy - 34 * u]], "#8a5a34", 6 * u, 1.5 * u, "round");
    p.ell(hx + facing * 30 * u, hy - 42 * u, 9 * u, 12 * u, "#7a4a26", 4 * u);
  } else if (prop === "paper") {
    p.poly([[hx - 16 * u, hy - 22 * u], [hx + 18 * u, hy - 18 * u], [hx + 14 * u, hy + 16 * u], [hx - 18 * u, hy + 12 * u]], "#f2ead6", 4 * u);
    for (let i = 0; i < 4; i++) p.stroke([[hx - 10 * u, hy - 12 * u + i * 8 * u], [hx + 8 * u, hy - 10 * u + i * 8 * u]], 2 * u, "#6a6058");
  } else if (prop === "spoon") {
    p.band([[hx, hy + 10 * u], [hx + facing * 30 * u, hy - 26 * u]], "#c9ccd2", 5 * u, 1.5 * u, "round");
    p.ell(hx + facing * 34 * u, hy - 32 * u, 11 * u, 8 * u, "#c9ccd2", 4 * u);
    p.ell(hx + facing * 34 * u, hy - 33 * u, 8 * u, 5 * u, "#3a1c0c", 0);
  } else if (prop === "stamp") {
    p.band([[hx, hy], [hx + facing * 8 * u, hy - 30 * u]], "#8a5a34", 9 * u, 2 * u, "round");
    p.poly([[hx - facing * 12 * u, hy - 30 * u], [hx + facing * 26 * u, hy - 30 * u], [hx + facing * 22 * u, hy - 40 * u], [hx - facing * 8 * u, hy - 40 * u]], "#b08a3a", 4 * u);
  } else if (prop === "scroll") {
    p.ell(hx, hy, 20 * u, 26 * u, "#f1ece0", 5 * u);
    p.stroke([[hx - 10 * u, hy - 8 * u], [hx + 10 * u, hy - 8 * u]], 3 * u, INK);
    p.stroke([[hx - 10 * u, hy + 4 * u], [hx + 10 * u, hy + 4 * u]], 3 * u, INK);
  }
}

// ---------------- main ----------------
/** Draw one stickman. The canvas transform already scales the 600x1000 design space. */
export const drawStickman = (p: Pen, o: StickOpts) => {
  const { view = "front", facing = 1, phase = 0, moving = false, expr = "neutral", blink = 0, look = 0, lean = 0, seed = 1, bob = 0 } = o;
  const out = o.outfit, kind = out.kind ?? "tunic";
  const s = out.scale ?? 1;
  const g = p.g;
  g.save();
  g.translate(300, 975);
  g.scale(s, s);
  g.rotate(rad(lean) / 6);
  g.translate(-300, -975);
  const legCol = out.legs ?? INK;
  const F = FACE[expr];
  const lid = clamp(blink, 0, 1);
  const hipY = 700 + bob * 0.4, shY = 470 + bob * 0.4;
  const W = 210, u = W / 100;
  const thick = rad(-120); // outline thickest away from a top-left light

  // cape (behind everything)
  if (out.cape) {
    const cp = blobPts(300, (shY + 830) / 2, { a: 150, b: (830 - shY) / 2 + 30, nTop: 2.0, nBot: 2.8, egg: 0.1, asym: 0, rot: 0, noise: 0.02, seed: 11 }, 32);
    p.poly(cp, out.cape, 8);
  }

  // legs: black sticks, no feet
  const swing = moving ? Math.sin(2 * Math.PI * phase) : 0;
  const sideAmp = view === "side" ? 62 * facing : 0;
  const leg = (side: -1 | 1, off: number) => {
    const sw = moving ? Math.sin(2 * Math.PI * (phase + off)) : 0;
    const lift = moving ? Math.max(0, Math.sin(2 * Math.PI * (phase + off))) * 34 : 0;
    const hx = 300 + side * 26, hy = hipY;
    const fx = 300 + side * 30 - sw * 44 + sideAmp * sw;
    const fy = 975 - lift;
    const kx = (hx + fx) / 2 + (lift > 1 ? side * 8 : 0), ky = (hy + fy) / 2;
    p.stroke([[hx, hy], [kx, ky], [fx, fy]], 12, legCol);
  };
  leg(-1, 0);
  leg(1, 0.5);

  // torso
  const T = torsoShape(kind, 300, shY, hipY, W);
  p.poly(T.pts, out.body, 0);
  p.inkRing(T.pts, 9, thick, 0.35, INK);
  if (out.belt) p.band([[T.cx - T.rx * 0.95, shY + (hipY - shY) * 0.42], [T.cx + T.rx * 0.95, shY + (hipY - shY) * 0.42]], out.belt, 10, 2);

  // arms: black sticks with dot hands (opposite swing to the same-side leg)
  const armSwing = moving ? swing * 30 : 0;
  const arm = (side: -1 | 1) => {
    const sx = 300 + side * T.rx * 0.92, sy = shY + 26;
    const hx = sx + (side === -1 ? armSwing : -armSwing) + side * 6;
    const hy = shY + 150 + bob * 0.2;
    p.stroke([[sx, sy], [(sx + hx) / 2 + side * 6, (sy + hy) / 2], [hx, hy]], 10, INK);
    p.dot(hx, hy, 10, INK);
    return [hx, hy] as [number, number];
  };
  arm(-1);
  const aR = arm(1);

  // head
  const hcx = 300, hcy = 300 + bob * 0.3;
  const hp = headPts(hcx, hcy, 105, seed);
  p.poly(hp, WHITE, 0);
  p.inkRing(hp, 12, thick, 0.4, INK);

  if (view === "front") {
    const ex = 300 + look * 5, ey = hcy - 4;
    drawEye(p, F.eye, ex - 30, ey, u / 2.1, look, lid);
    drawEye(p, F.eye, ex + 30, ey, u / 2.1, look, lid);
    drawBrow(p, ex - 30, ey - 40, -1, F.brow, u / 2.1);
    drawBrow(p, ex + 30, ey - 40, 1, F.brow, u / 2.1);
    drawMouth(p, F.mouth, ex, hcy + 62, u / 2.1);
  } else {
    const dir = facing;
    drawEye(p, F.eye, hcx + dir * 34, hcy - 2, u / 2.1, dir * 0.6, lid);
    drawBrow(p, hcx + dir * 34, hcy - 42, dir, F.brow, u / 2.1);
    drawMouth(p, F.mouth, hcx + dir * 54, hcy + 60, u / 2.1);
  }

  drawHat(p, out.hat ?? "none", out.hatCol ?? "#3a3d47", hcx, hcy - 105, W, u / 2.1);
  drawProp(p, out.prop ?? "none", out.propCol ?? "#8d949c", aR[0], aR[1], u / 2.1, facing);

  g.restore();
};
