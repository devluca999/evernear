#!/usr/bin/env node
// Draws the 10MA exploded view and the actuator motor close-up with the Anatomy kit
// (vendor/anatomy, MIT) and writes them as static SVG strings. Run: node scripts/build-figures.mjs
import { writeFileSync } from "node:fs";
import * as k from "../vendor/anatomy/iso-kit.mjs";

const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);

/** Paint whole parts far to near: each part is { at: [x,y,z], svg } */
function paint(parts, P) {
  return [...parts].sort((a, b) => k.depthOf(a.at, P) - k.depthOf(b.at, P)).map((p) => p.svg).join("");
}

function stand(plan, P) {
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, -10, 8, P)}"/>`];
  for (const [x, y] of k.corners(plan, 12)) out.push(S(k.cylinder(x, y, 4, -10, 2, P, 20), { tone: "lo" }));
  out.push(S(k.slabOf(plan, -8, 8, P, 8, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(plan, 4), 0, P), { tone: "lo" }));
  const screws = k.corners(plan, 8);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 1.8, 0, P, 14)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => k.iso([x, y, 0], P)), { size: 0.45 }));
  return out.join("");
}

function ruler(from, to, y, P) {
  const strip = { x: from, y, w: to - from, d: 6, r: 1 };
  const t = k.topTicks(from + 3, to - 3, 4, 5, y + 0.6, 0.5, [1.8, 3.2], P);
  return S(k.slabOf(strip, 0, 0.5, P, 3), { tone: "lo", crease: "none" }) + L(t.minor, { tone: "lo" }) + L(t.major, { tone: "mid" });
}

// --- One NEMA 17 actuator: square body, flange, pilot boss, shaft. Shaft along +z.
function motorParts(cx, cy, z, s, P, lit) {
  const half = 21.15 * s, body = { x: cx - half, y: cy - half, w: half * 2, d: half * 2, r: 3 * s };
  const len = 40 * s, cap = 6 * s;
  const tone = lit ? "hi" : "mid";
  const out = [];
  out.push(S(k.slabOf(k.insetPlan(body, 1.2 * s), z, cap, P, 6, 0.4), { tone, lit }));
  out.push(S(k.slabOf(body, z + cap, len - cap * 2, P, 6, 0.5 * s), { tone, lit, inner: L([0.33, 0.66].map((f) => k.sideSeam(body, z + cap + (len - cap * 2) * f, P)).join(""), { tone: "faint" }) }));
  out.push(S(k.slabOf(body, z + len - cap, cap, P, 6, 0.6 * s), { tone, lit }));
  const top = z + len;
  const holes = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [cx + a * 15.5 * s, cy + b * 15.5 * s]);
  out.push(L(holes.map(([x, y]) => k.ring(x, y, 1.6 * s, top, P, 14)).join(""), { tone: "lo" }));
  out.push(D(holes.map(([x, y]) => k.iso([x, y, top], P)), { size: 0.4 * s, tone: "mid" }));
  out.push(S(k.cylinder(cx, cy, 11 * s, top, 2 * s, P, 40), { tone, lit }));
  out.push(S(k.cylinder(cx, cy, 3 * s, top + 2 * s, 20 * s, P, 20), { tone: lit ? "lit" : "hi", lit, crease: "none" }));
  out.push(L(k.lineOnTop([cx - 3 * s, cy + 1.4 * s], [cx + 3 * s, cy + 1.4 * s], top + 22 * s, P), { tone: "lo" }));
  return { svg: `<g data-part="motor">${out.join("")}</g>`, top: top + 22 * s, bottom: z };
}

// --- The 10MA exploded view -------------------------------------------------
function exploded() {
  const W = 520, H = 440;
  const BASE = { x: -150, y: -70, w: 300, d: 140, r: 8 };
  const P = k.fitProjection([...k.boxCorners(BASE, -10, 0), [0, 0, 285], [150, 0, 190], [-150, 0, 190]], W, H, { pad: 18, azimuth: 40 });
  const parts = [];
  const add = (at, svg) => parts.push({ at, svg });

  // Drive deck with casters and two drive motors at its sides
  const deck = { x: -48, y: -36, w: 96, d: 72, r: 10 };
  add([0, 0, 22], (() => {
    const o = [];
    for (const [x, y] of k.corners(deck, 14)) o.push(S(k.cylinder(x, y, 4, 12, 8, P, 20), { tone: "lo" }));
    o.push(S(k.slabOf(deck, 20, 10, P, 8, 1), { tone: "mid" }));
    o.push(L(k.planOutline(k.insetPlan(deck, 5), 30, P), { tone: "faint" }));
    o.push(D(k.corners(deck, 6).map(([x, y]) => k.iso([x, y, 30], P)), { size: 0.45 }));
    return o.join("");
  })());
  for (const side of [-1, 1]) {
    const m = motorParts(side * 92, 0, 14, 0.62, P, true);
    add([side * 92, 0, 26], m.svg);
  }

  // Battery pack 48 V
  const batt = { x: -36, y: -26, w: 72, d: 52, r: 4 };
  add([0, 0, 64], S(k.slabOf(batt, 56, 20, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(batt, 62, P), { tone: "faint" }) })
    + L(k.planOutline(k.insetPlan(batt, 4), 76, P), { tone: "faint" })
    + S(k.cylinder(batt.x + 14, 0, 3, 76, 3, P, 16), { tone: "hi" }) + S(k.cylinder(batt.x + 26, 0, 3, 76, 3, P, 16), { tone: "mid" }));

  // Controller board with chips and a header
  const pcb = { x: -40, y: -30, w: 80, d: 60, r: 2 };
  add([0, 0, 106], S(k.slabOf(pcb, 104, 2, P, 4), { tone: "mid", crease: "none" })
    + S(k.slabOf({ x: -12, y: -12, w: 24, d: 24, r: 1 }, 106, 4, P, 3), { tone: "hi" })
    + S(k.slabOf({ x: 18, y: -20, w: 14, d: 10, r: 0.5 }, 106, 3, P, 3), { tone: "mid" })
    + D(Array.from({ length: 8 }, (_, i) => k.iso([-30 + i * 4, 24, 106], P)), { size: 0.4 })
    + D(k.corners(pcb, 3).map(([x, y]) => k.iso([x, y, 106], P)), { size: 0.45, tone: "lo" }));

  // Torso shell with front panel, vents and a seam
  const torso = { x: -46, y: -34, w: 92, d: 68, r: 14 };
  add([0, 0, 168], S(k.slabOf(torso, 134, 70, P, 10, 1.4), { tone: "mid", inner: L(k.sideSeam(torso, 170, P), { tone: "faint" }) })
    + L(k.planOutline(k.insetPlan(torso, 6), 204, P), { tone: "lo" })
    + L(k.planOutline({ x: -8, y: -20, w: 16, d: 40, r: 3 }, 204, P), { tone: "faint" })
    + D(k.corners(k.insetPlan(torso, 3), 6).map(([x, y]) => k.iso([x, y, 204], P)), { size: 0.45 }));

  // Shoulder motors and arms
  for (const side of [-1, 1]) {
    const m = motorParts(side * 86, 0, 160, 0.62, P, true);
    add([side * 86, 0, 170], m.svg);
    const arm = { x: side > 0 ? 112 : -130, y: -9, w: 18, d: 18, r: 5 };
    add([side * 121, 0, 165], S(k.slabOf(arm, 140, 44, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(arm, 162, P), { tone: "faint" }) })
      + S(k.cylinder(side * 121, 0, 7, 134, 6, P, 24), { tone: "mid" })
      + L(k.knurl(side * 121, 0, 7, 134, 140, 24, P), { tone: "lo" }));
  }

  // Head with camera ring and lidar puck
  const head = { x: -32, y: -26, w: 64, d: 52, r: 16 };
  add([0, 0, 250], S(k.slabOf(head, 230, 36, P, 10, 1.2), { tone: "mid" })
    + L(k.planOutline(k.insetPlan(head, 5), 266, P), { tone: "faint" })
    + S(k.cylinder(0, 0, 12, 266, 3, P, 36), { tone: "mid" })
    + S(k.cylinder(0, 0, 9, 269, 8, P, 36), { tone: "hi" })
    + L(k.knurl(0, 0, 9, 269, 277, 36, P), { tone: "lo" })
    + L(k.ring(0, 0, 4, 277, P, 20), { tone: "mid" }));

  // Explode axis: dotted rises between stacked parts, ending on faces
  const axis = [[30, 56], [76, 104], [110, 134], [204, 230]].map(([a, b]) => L(k.rise([0, 0], a, b, P), { tone: "faint", dotted: true })).join("");

  const body = [stand(BASE, P), ruler(BASE.x + 12, BASE.x + BASE.w - 12, BASE.y + BASE.d - 12, P), L(k.rise([0, 0], 0, 12, P), { tone: "faint", dotted: true }), paint(parts, P), axis];
  return k.figureSvg({ width: W, height: H, label: "10MA helper robot, exploded: drive deck with two actuator motors, battery pack, controller board, torso with two shoulder actuator motors and arms, head with camera and lidar.", body });
}

// --- Actuator motor close-up ------------------------------------------------
function closeUp() {
  const W = 360, H = 300;
  const BASE = { x: -70, y: -60, w: 140, d: 120, r: 6 };
  const s = 1.4;
  const P = k.fitProjection([...k.boxCorners(BASE, -10, 0), [0, 0, 160]], W, H, { pad: 16, azimuth: 40 });
  const parts = [];
  // Encoder cap, exploded below the body, with a Molex connector on its side
  const enc = { x: -18 * s, y: -18 * s, w: 36 * s, d: 36 * s, r: 4 * s };
  parts.push({ at: [0, 0, 20], svg: S(k.slabOf(enc, 6, 22, P, 8, 0.6), { tone: "mid" })
    + L(k.planOutline(k.insetPlan(enc, 3), 28, P), { tone: "faint" })
    + S(k.slabOf({ x: enc.x + enc.w, y: -6, w: 8, d: 12, r: 1 }, 10, 9, P, 3), { tone: "hi" })
    + D([0, 1, 2, 3].map((i) => k.iso([enc.x + enc.w + 8, -4.5 + i * 3, 14.5], P)), { size: 0.4, tone: "hi" }) });
  const m = motorParts(0, 0, 62, s, P, true);
  parts.push({ at: [0, 0, 100], svg: m.svg });
  // A short cable from the connector to a terminal on the stand
  const from = k.iso([enc.x + enc.w + 8, 0, 12], P), to = k.iso([enc.x + enc.w + 26, 30, 0], P);
  const body = [stand(BASE, P), ruler(BASE.x + 8, BASE.x + BASE.w - 8, BASE.y + BASE.d - 10, P),
    paint(parts, P), L(k.rise([0, 0], 28, 62, P), { tone: "faint", dotted: true }),
    k.wireSvg(from, to, { tone: "mid" }),
    k.faceTextSvg(k.sideMatrix([21.15 * s, -6], 62 + 24, P, "right"), "48 V", { size: 5, tone: "mid", anchor: "middle" })];
  return k.figureSvg({ width: W, height: H, label: "10MA actuator motor: NEMA 17 square body with flange and pilot boss, 6 mm shaft on top, encoder cap below with a Molex connector, rated 48 V.", body });
}

const out = `// Generated by scripts/build-figures.mjs with the Anatomy kit (MIT). Do not edit.
export const EXPLODED_10MA_SVG = ${JSON.stringify(exploded())};
export const MOTOR_SVG = ${JSON.stringify(closeUp())};
`;
writeFileSync("components/workspace/figures/generated.ts", out);
console.log("wrote components/workspace/figures/generated.ts", out.length, "bytes");
