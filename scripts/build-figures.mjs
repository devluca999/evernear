#!/usr/bin/env node
// Draws the 10MA exploded view (Fig 1) and the actuator motor close-up (Fig 2) with the
// Anatomy kit (vendor/anatomy, MIT) and writes them as static SVG strings for the BOM panel.
//
//   node scripts/build-figures.mjs                 write components/workspace/figures/generated.ts
//   node scripts/build-figures.mjs --audit         also prove the geometry (clearance, depth order, supports)
//   node scripts/build-figures.mjs --pages <dir>   also write standalone dark and light preview pages
//   --only fig1 | fig2                             build one figure (generated.ts is written only for both)
//
// Every part records its true shape into an audit recorder; the painter's order comes from
// A.settle, never from hand-tuned keys. Fig 1 is modelled assembled and drawn apart: each
// assembly moves along its explode vector, and the audit checks the assembled pose, the apart
// pose and every frame between them.
import { writeFileSync } from "node:fs";
import * as k from "../vendor/anatomy/iso-kit.mjs";
import * as G from "../vendor/anatomy/lathe.mjs";
import { tubePieces, tubeSvg, crossingsOf } from "../vendor/anatomy/tube.mjs";
import * as A from "../vendor/anatomy/audit.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const at = argv.indexOf(name);
  return at < 0 ? null : argv[at + 1];
};
const ONLY = flag("--only");
const PAGES = flag("--pages");

const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const X = [1, 0, 0];
const Y = [0, 1, 0];
const Z = [0, 0, 1];

// ---------------------------------------------------------------------------------------------
// A scene: one projection, one recorder, and drawing helpers that record what they draw.
function scene(P, { moves = {}, order = [], spring = {} } = {}) {
  const R = A.recorder(P, { order, spring });
  const V = G.viewOf(P);
  const KS = G.scaleOf(P);
  const at = (p) => k.iso(p, P);
  const moveOf = (piece) => moves[piece] ?? [0, 0, 0];
  const put = (piece, ref, svg, { bias = 0, shapes = [], name, route, chunk } = {}) =>
    R.put({ piece, at: ref, bias, svg, move: moveOf(piece), shapes, name: name ?? R.nameFor(`${piece}.item`), route, chunk });

  const box = (piece, plan, z, h, style = {}, { extra = "", inner = "", bias = 0, steps = 3, bevel = 0.5, name, owner, ground } = {}) => {
    const id = R.nameFor(name ?? `${piece}.box`);
    const shape = R.solid(A.slab(plan, z, h, { name: id, owner, ground }, steps));
    put(piece, [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, { bias, name: id, shapes: [shape] });
    return shape;
  };
  const ring3 = (ring, z, h, piece, style = {}, { extra = "", inner = "", bias = 0, name, owner, bevel = 0.5 } = {}) => {
    const id = R.nameFor(name ?? `${piece}.plate`);
    const shape = R.solid(A.extruded(ring, z, h, { name: id, owner }));
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    put(piece, [cx, cy, z + h / 2], S(k.extrude(ring, z, h, P, { convex: false, bevel }), { tone: "mid", ...style, inner }) + extra, { bias, name: id, shapes: [shape] });
    return shape;
  };
  const cyl = (piece, cx, cy, r, z, h, style = {}, { extra = "", inner = "", bias = 0, steps = 28, bevel = 0, name, owner } = {}) => {
    const id = R.nameFor(name ?? `${piece}.post`);
    const shape = R.solid(A.cylinder(cx, cy, r, z, h, { name: id, owner }));
    put(piece, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, steps, bevel), { tone: "mid", ...style, inner }) + extra, { bias, name: id, shapes: [shape] });
    return shape;
  };
  const turned = (piece, F, profile, style = {}, { extra = "", inner = "", bias = 0, bevel = 0, name, owner, smooth, rims, steps, meta = {} } = {}) => {
    const id = R.nameFor(name ?? `${piece}.turned`);
    const soft = smooth ?? profile.some((p) => p[2]);
    const paths = G.solidOf(profile, F, P, { bevel, smooth: soft, ...(rims ? { rims } : {}), ...(steps ? { steps } : {}) });
    const shape = R.solid(A.solid(F, profile, { name: id, owner, curve: soft && !soft.slope ? profile : undefined, ...meta }));
    const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
    put(piece, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "mid", ...style, inner }) + extra, { bias, name: id, shapes: [shape] });
    return shape;
  };
  const disc = (piece, F, s0, s1, r, style = {}, options = {}) => turned(piece, F, [[s0, r], [s1, r]], style, options);
  const prism = (piece, F, poly, s0, s1, style = {}, { extra = "", inner = "", bias = 0, name, owner } = {}) => {
    const id = R.nameFor(name ?? `${piece}.prism`);
    const shape = R.solid(A.prism(F, poly, s0, s1, { name: id, owner }));
    put(piece, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(G.prismOf(F, poly, s0, s1, P), { tone: "mid", ...style, inner }) + extra, { bias, name: id, shapes: [shape] });
    return shape;
  };
  const ball = (piece, c, r, style = {}, { bias = 0, name, owner } = {}) => {
    const id = R.nameFor(name ?? `${piece}.ball`);
    const shape = R.solid(A.ball(c, r, { name: id, owner }));
    put(piece, c, S(G.sphereOf(c, r, P, { steps: G.stepsFor(r, 24) }), { tone: "mid", ...style }), { bias, name: id, shapes: [shape] });
    return shape;
  };

  // A cable: chunks depth-sorted on their own, an end on its own assembly gets a terminal dot,
  // an end that lands on another assembly gets a connector shell that stays with the cable.
  const CABLES = [];
  const CLAMP_HALF = 0.7;
  const cable = (piece, points, { r = 0.5, bend = 3, name, bundle, touch, clamps = [], shells = [false, false], shellR, shellLen = 2.2, free, tone = "mid", rings, dots = [true, true], maxLength = 12 } = {}) => {
    const route = G.fillet(points, bend, 12, { P, tube: r });
    const total = G.pathLength(route);
    const sr = shellR ?? r * 1.9;
    const gaps = [
      ...clamps.flatMap(({ centre, axis, radius }) => crossingsOf(route, centre, axis, radius).map((s) => [s - CLAMP_HALF - 0.05, s + CLAMP_HALF + 0.05])),
      ...(shells[0] ? [[0, shellLen]] : []),
      ...(shells[1] ? [[total - shellLen, total]] : []),
    ];
    const id = R.nameFor(name ?? `${piece}.cable`);
    CABLES.push({ piece, id });
    R.route(id, route, r, { owner: id, touch, bundle, limp: true, gaps, free, piece, move: moveOf(piece), rims: shells.map((on) => (on ? sr : r)) });
    tubePieces(route, r, P, { maxLength, spacing: 0.8, gaps, ...(rings ? { rings } : {}) }).forEach((part, index) =>
      put(piece, part.mid, tubeSvg(part, { tone }), { bias: 0.05, name: `${id}:${index}`, route: id, chunk: index, shapes: [A.tube(part.points, part.radii)] }),
    );
    [0, 1].forEach((index) => {
      const end = index ? route[route.length - 1] : route[0];
      const tangent = G.tangentAlong(route, index ? total : 0);
      if (!shells[index]) {
        if (dots[index]) put(piece, end, Dots([at(end)], { size: 0.5, tone: "hi" }), { bias: 0.2, name: `${id}.end`, shapes: [A.ball(end, 0.5 / KS)] });
        return;
      }
      const F = G.frameAlong(end, tangent);
      const [s0, s1] = index ? [-shellLen, 0] : [0, shellLen];
      const face = index ? s0 : s1;
      const facing = G.dot3(G.mul3(F.a, index ? -1 : 1), V) > 0.2;
      put(piece, G.add3(end, G.mul3(tangent, (s0 + s1) / 2)), S(G.disc(s0, s1, sr, F, P, { bevel: 0.2 }), { tone: "mid" }) + (facing ? Ln(G.circleOf(F, face, sr * 0.58, P, 12), { tone: "faint" }) : ""), {
        bias: 0.1,
        name: `${id}.shell`,
        shapes: [R.solid(A.disc(F, s0, s1, sr, { name: `${id}.shell`, owner: id }))],
      });
    });
    return { route, id, total };
  };
  const clamp = (piece, centre, axis, r, { name, bundle } = {}) => {
    const F = G.frameAlong(centre, axis);
    const id = R.nameFor(name ?? `${piece}.clamp`);
    put(piece, centre, S(G.disc(-CLAMP_HALF, CLAMP_HALF, r, F, P), { tone: "mid" }), { bias: 0.15, name: id, shapes: [R.solid(A.disc(F, -CLAMP_HALF, CLAMP_HALF, r, { name: id, anchor: false, bundle, fitting: true }))] });
    return { centre, axis, radius: r };
  };

  return { R, P, V, KS, at, put, box, ring3, cyl, turned, disc, prism, ball, cable, clamp, CABLES, moveOf };
}

// The visible edges of a prism's cross-section at s: a seam, lamination line or band that wraps
// every face it can see and ends on the silhouette (the prism analogue of k.sideSeam).
function prismSeam(F, poly, s, P) {
  const V = G.viewOf(P);
  const n = poly.length;
  let area = 0;
  for (let j = 0; j < n; j++) area += poly[j][0] * poly[(j + 1) % n][1] - poly[(j + 1) % n][0] * poly[j][1];
  const sign = area > 0 ? 1 : -1;
  const seen = poly.map(([x0, y0], j) => {
    const [x1, y1] = poly[(j + 1) % n];
    return G.dot3(G.add3(G.mul3(F.u, sign * (y1 - y0)), G.mul3(F.v, -sign * (x1 - x0))), V) > 1e-6;
  });
  const start = seen.findIndex((on, j) => on && !seen[(j - 1 + n) % n]);
  if (start < 0) return "";
  const pts = [];
  for (let step = 0; step <= n; step++) {
    const j = (start + step) % n;
    pts.push(poly[j]);
    if (!seen[j]) break;
  }
  const world = ([x, y]) => G.add3(F.o, G.add3(G.mul3(F.a, s), G.add3(G.mul3(F.u, x), G.mul3(F.v, y))));
  return k.pathOf(pts.map((p) => k.iso(world(p), P)));
}

const chamfered = (h, c) => [[h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c], [-h + c, -h], [h - c, -h]];
const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const local = (F, s, u, v) => G.add3(F.o, G.add3(G.mul3(F.a, s), G.add3(G.mul3(F.u, u), G.mul3(F.v, v))));

// ---------------------------------------------------------------------------------------------
// The actuator motor: NEMA 17 (42.3 mm square, 31 mm hole pitch, 22 mm pilot boss), 6 mm shaft
// with a flat, a rear encoder cap and a 5-way Molex encoder header with its plug. Built in one
// frame F (F.a points along the shaft, F.u toward the connector), in millimetres times `mm`,
// and drawn as one item so it highlights as one group. Returns the plug's cable face.
function motor(sc, piece, F, mm, { shaft = 24, flat = 15, seams = 6, holes = true, label = null, name = "motor" } = {}) {
  const { P, V, R, put } = sc;
  const m = (value) => value * mm;
  const toward = G.dot3(F.a, V);
  const id = R.nameFor(`${piece}.${name}`);
  const own = { owner: id };
  const CAP = chamfered(m(21.15), m(4.6));
  const STACK = chamfered(m(20.7), m(3.4));
  const S0 = m(12); // encoder cap ends, rear end cap starts
  const S1 = S0 + m(9); // stack
  const S2 = S1 + m(30); // front end cap
  const S3 = S2 + m(9); // flange face
  const BOSS = S3 + m(2);
  const TIP = BOSS + m(shaft);
  const FLAT = TIP - m(flat);
  const parts = [];
  const shapes = [];
  const add = (s, svg, shape) => {
    parts.push({ s, svg });
    if (shape) shapes.push(shape);
  };
  // encoder cap: a square cover a little smaller than the end caps, with a seam at its lid
  const ENC = chamfered(m(19.6), m(4.2));
  add(S0 / 2, S(G.prismOf(F, ENC, 0, S0, P), { tone: "hi", lit: true, inner: Ln(prismSeam(F, ENC, m(3), P), { tone: "faint" }) }), A.prism(F, ENC, 0, S0, { name: `${id}.encoder`, ...own }));
  // rear end cap, lamination stack (a seam per sheet group), front end cap
  add((S0 + S1) / 2, S(G.prismOf(F, CAP, S0, S1, P), { tone: "hi", lit: true }), A.prism(F, CAP, S0, S1, { name: `${id}.rear`, ...own }));
  const seamAt = Array.from({ length: seams }, (_, i) => S1 + ((S2 - S1) * (i + 1)) / (seams + 1));
  add((S1 + S2) / 2, S(G.prismOf(F, STACK, S1, S2, P), { tone: "hi", lit: true, inner: Ln(seamAt.map((s) => prismSeam(F, STACK, s, P)).join(""), { tone: "lo" }) }), A.prism(F, STACK, S1, S2, { name: `${id}.stack`, ...own }));
  let face = "";
  if (holes && toward > 0.12) {
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const HF = G.frameOf(local(F, 0, m(15.5) * u, m(15.5) * v), F.a, F.u, F.v);
      face += Ln(G.circleOf(HF, S3, m(1.9), P, 14), { tone: "lo" }) + Dots([k.iso(local(F, S3, m(15.5) * u, m(15.5) * v), P)], { size: Math.max(0.35, m(0.9) * G.scaleOf(P)), tone: "lo" });
    }
  }
  add((S2 + S3) / 2, S(G.prismOf(F, CAP, S2, S3, P), { tone: "hi", lit: true }) + face, A.prism(F, CAP, S2, S3, { name: `${id}.front`, ...own }));
  if (label) add((S1 + S2) / 2 + 0.01, label(F, { S1, S2, m }), null);
  // pilot boss and shaft: round, then a D-flat turned to face the viewer
  add((S3 + BOSS) / 2, S(G.disc(S3, BOSS, m(11), F, P, { bevel: 0.3 }), { tone: "hi", lit: true }), A.disc(F, S3, BOSS, m(11), { name: `${id}.boss`, ...own }));
  add((BOSS + FLAT) / 2, S(G.disc(BOSS, FLAT, m(3), F, P), { tone: "lit", lit: true, crease: "none" }), A.disc(F, BOSS, FLAT, m(3), { name: `${id}.shaft`, ...own }));
  const side = G.sub3(V, G.mul3(F.a, toward));
  const phi = Math.atan2(G.dot3(side, F.v), G.dot3(side, F.u));
  const n = [Math.cos(phi), Math.sin(phi)];
  const D = [];
  for (let i = 0; i < 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    let p = [m(3) * Math.cos(t), m(3) * Math.sin(t)];
    const over = p[0] * n[0] + p[1] * n[1] - m(2.5);
    if (over > 0) p = [p[0] - n[0] * over, p[1] - n[1] * over];
    D.push(p);
  }
  add((FLAT + TIP) / 2, S(G.prismOf(F, D, FLAT, TIP, P), { tone: "lit", lit: true, crease: "none" }), A.prism(F, D, FLAT, TIP, { name: `${id}.flat`, ...own }));
  // Molex header on the encoder cover's top face, the mated plug behind it and its latch; the
  // plug overhangs the rear face and its cable leaves backward along the axis
  const HDR = rect(m(19.6), m(25.6), -m(5.6), m(5.6));
  add(m(8), S(G.prismOf(F, HDR, m(4), S0, P), { tone: "hi", lit: true }), A.prism(F, HDR, m(4), S0, { name: `${id}.header`, ...own }));
  const PLUG = rect(m(19.6), m(25), -m(4.9), m(4.9));
  add(m(0.5), S(G.prismOf(F, PLUG, -m(3), m(4), P), { tone: "mid" }), A.prism(F, PLUG, -m(3), m(4), { name: `${id}.plug`, ...own }));
  const LATCH = rect(m(25), m(26.4), -m(1.7), m(1.7));
  add(m(0.6), S(G.prismOf(F, LATCH, -m(2), m(3), P), { tone: "mid" }), A.prism(F, LATCH, -m(2), m(3), { name: `${id}.latch`, ...own }));
  parts.sort((a, b) => a.s * toward - b.s * toward);
  const svg = `<g data-part="motor">${parts.map((p) => p.svg).join("")}</g>`;
  for (const shape of shapes) R.solid(shape);
  put(piece, local(F, (TIP + 0) / 2, 0, 0), svg, { name: id, shapes });
  return {
    id,
    plugFace: local(F, -m(3), m(22.3), 0),
    tip: local(F, TIP, 0, 0),
  };
}

// ---------------------------------------------------------------------------------------------
function page(svg, { fig, title, theme, width }) {
  const body = k.plateHtml({ fig, title, body: svg });
  return k.pageHtml({ title, theme, body, width });
}

function output(sc, back, { W, H, label, state = 1 }) {
  const { R, P, V } = sc;
  A.settle(R, P);
  const items = R.items.slice().sort((a, b) => A.keyAt(a, state, V) - A.keyAt(b, state, V));
  if (argv.includes("--sizes")) for (const item of items.slice().sort((a, b) => b.svg.length - a.svg.length).slice(0, 14)) console.log(`  ${(item.svg.length / 1024).toFixed(1)} KB  ${item.name}`);
  const groups = [];
  let open = null;
  for (const item of items) {
    const shift = G.mul3(item.move ?? [0, 0, 0], A.shareOf(item, state));
    const t = shift.some((c) => Math.abs(c) > 1e-6) ? k.translateAlong(P, shift) : "";
    if (!open || open.t !== t) groups.push((open = { t, svg: [] }));
    open.svg.push(item.svg);
  }
  const body = [...back, ...groups.map((g) => (g.t ? `<g transform="${g.t}">${g.svg.join("")}</g>` : g.svg.join("")))];
  return k.figureSvg({ width: W, height: H, label, body });
}

// A projection whose viewBox is as wide as the drawing needs at height H, so the panel's
// max-height decides the drawing's size and no empty margin is shipped.
function fitTight(points, H, options) {
  const wide = k.fitProjection(points, 4000, H, options);
  const xs = points.map((p) => k.iso(p, wide)[0]);
  const W = Math.ceil(Math.max(...xs) - Math.min(...xs) + 2 * (options.pad ?? 24));
  return { W, P: k.fitProjection(points, W, H, options) };
}

// =============================================================================================
// Fig 1: Astro Robotics 10MA on a display stand, taken apart into its assemblies.
function figureOne() {
  const H = 340;
  const AZ = 74;
  const EL = 25;
  const PLINTH = { x: -190, y: -38, w: 380, d: 76, r: 8 };
  // Explode vectors: the head lifts off the neck, the arms come off the shoulder shafts and rise
  // with the frame, and the frame (battery in its bay) lifts off the drive base.
  const FRAME_UP = 22;
  const moves = {
    head: [0, 0, FRAME_UP + 18],
    armL: [-100, 0, FRAME_UP],
    armR: [100, 0, FRAME_UP],
    frame: [0, 0, FRAME_UP],
  };
  const order = ["head", "armL", "armR", "frame", "base", "stand"];
  const spring = { stagger: 0.035, stiffness: 64, damping: 14.2, substeps: 4 };
  const { W, P } = fitTight([...k.boxCorners(PLINTH, -16, 0), [0, -26, 185 + moves.head[2]], [0, 18, 170 + moves.head[2]], [-176, 0, 150], [176, 0, 150]], H, { pad: 8, azimuth: AZ, elevation: EL });
  const sc = scene(P, { moves, order, spring });
  const { R, at, put, box, ring3, cyl, turned, disc, ball, cable } = sc;
  const back = [];

  // --- Display stand: plinth on feet, groove, corner screws, ruler strip, label plate --------
  back.push(`<path class="iso-halo" d="${k.haloOf(PLINTH, -16, 14, P)}"/>`);
  const FEET = [...k.corners(PLINTH, 18), [0, PLINTH.y + 18], [0, PLINTH.y + PLINTH.d - 18]].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of FEET) {
    back.push(S(k.cylinder(x, y, 7, -16, 1.6, P, 28), { tone: "lo" }));
    back.push(S(k.cylinder(x, y, 5.4, -14.4, 2.4, P, 28), { tone: "mid" }));
    R.solid(A.cylinder(x, y, 7, -16, 4, { name: "stand.foot" }));
  }
  back.push(S(k.slabOf(PLINTH, -12, 12, P, 8, 1.4), { tone: "mid", inner: Ln(k.sideSeam(PLINTH, -4, P, 8), { tone: "faint" }) }));
  R.solid(A.slab(PLINTH, -12, 12, { name: "stand.plinth" }));
  back.push(Ln(k.planOutline(k.insetPlan(PLINTH, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLINTH, 10);
  back.push(Ln(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  back.push(Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // an engraved index circle the robot stands on, degree ticks hanging inward from its ring
  const tt = k.radialTicks(0, 0, 70, 72, 6, 0, [1.4, 3], P);
  back.push(Ln(k.ring(0, 0, 70, 0, P, 120), { tone: "lo" }), Ln(tt.minor, { tone: "faint" }), Ln(tt.major, { tone: "lo" }));
  // ruler strip along the front edge, ticks rooted on its edge
  const STRIP = { x: -176, y: PLINTH.y + PLINTH.d - 13, w: 170, d: 7, r: 1 };
  back.push(S(k.slabOf(STRIP, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(STRIP.x + 4, STRIP.x + STRIP.w - 4, 4, 5, STRIP.y + 0.6, 0.6, [2, 3.8], P);
  back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  back.push(Dots([at([STRIP.x + 2, STRIP.y + 3.5, 0.6]), at([STRIP.x + STRIP.w - 2, STRIP.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate with the one engraved label
  const LABEL = { x: -178, y: -31, w: 36, d: 14, r: 1.4 };
  back.push(S(k.slabOf(LABEL, 0, 0.8, P, 3), { tone: "mid" }));
  back.push(Ln(k.planOutline(k.insetPlan(LABEL, 1.4), 0.8, P, 3), { tone: "faint" }));
  back.push(k.faceTextSvg(k.topMatrix([LABEL.x + 4, LABEL.y + 7.6], 0.8, P, "x"), "10MA", { size: 5, tone: "lo" }));
  back.push(Ln([0, 1].map((row) => k.onTop([[LABEL.x + 4, LABEL.y + 10 + row * 1.8], [LABEL.x + (row ? 20 : 28), LABEL.y + 10 + row * 1.8]], 0.8, P)).join(""), { tone: "lo", free: true }));
  back.push(Dots([at([LABEL.x + 2, LABEL.y + 2, 0.8]), at([LABEL.x + LABEL.w - 2, LABEL.y + 2, 0.8])], { size: 0.4 }));
  // fastener kit: a tray with its screws laid in a row
  const TRAY = { x: 132, y: 10, w: 40, d: 22, r: 2 };
  box("stand", TRAY, 0, 3, { tone: "lo" }, { name: "stand.tray", bevel: 0.4, extra: Ln(k.planOutline(k.insetPlan(TRAY, 1.6), 3, P, 3), { tone: "faint" }) });
  for (let i = 0; i < 6; i++) {
    const F = G.frameOf([TRAY.x + 6, TRAY.y + 5 + i * 2.6, 3 + 0.8], X, Z, Y);
    const prof = [[0, 1.1], [1.2, 1.1], [1.2, 0.55], [9 - (i % 3) * 1.5, 0.55]];
    turned("stand", F, prof, { tone: "mid" }, { name: "stand.screw", steps: 16 });
  }
  for (let i = 0; i < 4; i++) {
    const F = G.frameOf([TRAY.x + 25 + (i % 2) * 6, TRAY.y + 7 + Math.floor(i / 2) * 7, 3], Z, X, Y);
    turned("stand", F, [[0, 2], [1.2, 2]], { tone: "mid" }, { name: "stand.nut", steps: 18, extra: Ln(G.circleOf(F, 1.2, 1, P, 14), { tone: "lo" }) });
  }

  // --- Base: deck, casters, two drive actuators on cradles, wheels, drive harness ------------
  const DECK = { x: -40, y: -30, w: 80, d: 60, r: 6 };
  box("base", DECK, 6, 4, { tone: "mid" }, { name: "base.deck", steps: 6, bevel: 0.6, extra: Ln(k.planOutline(k.insetPlan(DECK, 3), 10, P, 6), { tone: "faint" }) + Dots(k.corners(DECK, 4).map(([x, y]) => at([x, y, 10])), { size: 0.42 }) });
  const BUMPER = { x: -34, y: 30, w: 68, d: 2.4, r: 0.8 };
  box("base", BUMPER, 6, 4.5, { tone: "mid" }, { name: "base.bumper", steps: 3, bevel: 0.3, inner: Ln(k.sideSeam(BUMPER, 8.2, P, 3), { tone: "faint" }) });
  for (const y of [-22, 22]) {
    const F = G.frameOf([0, y, 0], Z, X, Y);
    const caster = ball("base", [0, y, 2.6], 2.6, { tone: "lo" }, { name: "base.caster-ball" });
    const rim = 2.6 * Math.sin(Math.acos(1.2 / 2.6));
    turned("base", F, [[2.6 + 1.2, rim], [4.4, 3.6], [6, 3.6]], { tone: "mid" }, { name: "base.caster", steps: 24, meta: { seated: true, cut: [caster] } });
  }
  const AXLE = 24;
  const motors = [];
  for (const side of [-1, 1]) {
    box("base", { x: side > 0 ? 22 : -38, y: -7, w: 16, d: 14, r: 1 }, 10, AXLE - 10.575 - 10, { tone: "mid" }, { name: "base.cradle", extra: Dots([at([side * 36, -5, AXLE - 10.575]), at([side * 36, 5, AXLE - 10.575])], { size: 0.38, tone: "lo" }) });
    const F = G.frameOf([side * 14, 0, AXLE], [side, 0, 0], Z, [0, side, 0]);
    const m = motor(sc, "base", F, 0.5, { shaft: 8, flat: 5, seams: 5, name: "drive-motor" });
    motors.push({ side, m });
    // wheel on the shaft: hub boss on the shaft's end, tyre with rounded shoulders, hub cap
    const WF = G.frameOf([m.tip[0], 0, AXLE], [side, 0, 0], Z, [0, side, 0]);
    disc("base", WF, 0, 3, 4.5, { tone: "mid" }, { name: "base.wheel-hub", steps: 32 });
    const tyre = (s) => 21.6 + 2.4 * (1 - ((s - 9) / 6) ** 4);
    const tyreSlope = (s) => (-2.4 * 4 * ((s - 9) / 6) ** 3) / 6;
    const knots = Array.from({ length: 11 }, (_, i) => 3 + (12 * i) / 10);
    const prof = [[3, 11], ...knots.map((s, i) => [s, tyre(s), i && i < 10 ? 1 : 0]), [15, 11]];
    const outward = G.dot3(WF.a, sc.V) > 0;
    turned("base", WF, prof, { tone: "mid" }, {
      name: "base.wheel",
      smooth: { slope: tyreSlope, rows: 2 },
      steps: 72,
      inner: Ln(G.arcOf(WF, 9, 24, P), { tone: "faint" }),
      extra: outward ? Ln(G.circleOf(WF, 15, 16.5, P, 64), { tone: "lo" }) + Dots(G.dotsOf(WF, 15, 13.6, 6, P, { all: true }), { size: 0.45, tone: "mid" }) : "",
    });
    disc("base", WF, 15, 16.6, 6.5, { tone: "mid" }, { name: "base.hubcap", bevel: 0.3, steps: 40, extra: outward ? Ln(G.circleOf(WF, 16.6, 3, P, 24), { tone: "faint" }) : "" });
  }
  // drive harness: each encoder plug down to a junction block in the middle of the deck
  const JB = { x: -4.5, y: -5, w: 9, d: 10, r: 1 };
  box("base", JB, 10, 5, { tone: "mid" }, { name: "base.junction", extra: Dots([at([-2.2, 3.4, 15]), at([2.2, 3.4, 15])], { size: 0.35, tone: "lo" }) });
  for (const { side, m } of motors) {
    const f = m.plugFace;
    cable("base", [f, [side * 2.4, f[1], f[2]], [side * 2.4, f[1], 15]], { r: 0.45, bend: 1.6, name: "base.encoder-harness", dots: [false, true] });
  }
  // navigation camera module on a bracket at the front of the deck
  box("base", { x: -30, y: 21, w: 12, d: 4, r: 0.6 }, 10, 3, { tone: "mid" }, { name: "base.cam-foot" });
  box("base", { x: -29, y: 23, w: 10, d: 2, r: 0.4 }, 13, 10, { tone: "mid" }, { name: "base.cam-board", extra: Dots([at([-28, 25, 14.2]), at([-20, 25, 14.2]), at([-28, 25, 21.8]), at([-20, 25, 21.8])], { size: 0.35, tone: "lo" }) });
  const NAV = G.frameOf([-24, 25, 18], Y, Z, X);
  turned("base", NAV, [[0, 3.4], [1.2, 3.4], [1.2, 2.7], [3.6, 2.7]], { tone: "mid" }, { name: "base.cam-lens", bevel: 0.2, steps: 32, extra: Ln(G.circleOf(NAV, 3.6, 1.6, P, 24), { tone: "lo" }) });

  // --- Frame: four posts, lower plate, battery bay, rails, top plate with a cable notch -----
  const POSTS = [[-34, -24], [34, -24], [-34, 24], [34, 24]];
  const LOWER = { x: -38, y: -28, w: 76, d: 56, r: 4 };
  const TOPZ = 108;
  const RZ = 78;
  for (const [x, y] of POSTS) box("frame", { x: x - 2, y: y - 2, w: 4, d: 4, r: 0.5 }, 10, 30, { tone: "mid" }, { name: "frame.post-low", steps: 2, bevel: 0.3 });
  box("frame", LOWER, 40, 3, { tone: "mid" }, { name: "frame.lower", steps: 4, bevel: 0.5, extra: Dots(POSTS.map(([x, y]) => at([x, y, 43])), { size: 0.42 }) });
  for (const [x, y] of POSTS) box("frame", { x: x - 2, y: y - 2, w: 4, d: 4, r: 0.5 }, 43, TOPZ - 43, { tone: "mid" }, { name: "frame.post", steps: 2, bevel: 0.3 });
  const TOP_RING = [[-38, -28], [38, -28], [38, 28], [7, 28], [7, 8], [-7, 8], [-7, 28], [-38, 28]];
  ring3(TOP_RING, TOPZ, 3, "frame", { tone: "mid" }, { name: "frame.top", extra: Dots(POSTS.map(([x, y]) => at([x, y, TOPZ + 3])), { size: 0.42 }) });
  // cross rails all round at mid height, and the speaker on its own plate
  for (const y of [-24, 24]) box("frame", { x: -32, y: y - 1.5, w: 64, d: 3, r: 0.4 }, RZ, 4, { tone: "mid" }, { name: "frame.rail", steps: 2, bevel: 0.3 });
  for (const x of [-34, 34]) box("frame", { x: x - 1.5, y: -22, w: 3, d: 44, r: 0.4 }, RZ, 4, { tone: "mid" }, { name: "frame.side-rail", steps: 2, bevel: 0.3 });
  box("frame", { x: -32, y: 25.5, w: 18, d: 1.6, r: 0.4 }, RZ - 4, 22, { tone: "mid" }, { name: "frame.speaker-plate", extra: Dots([at([-30.6, 27.1, RZ - 2.6]), at([-15.4, 27.1, RZ - 2.6]), at([-30.6, 27.1, RZ + 16.6]), at([-15.4, 27.1, RZ + 16.6])], { size: 0.38, tone: "lo" }) });
  const SPK = G.frameOf([-23, 27.1, RZ + 7], Y, Z, X);
  const grille = [];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
    const u = i * 1.25 + (j % 2 ? 0.62 : 0);
    const v = j * 1.08;
    if (Math.hypot(u, v) < 4.6) grille.push(k.iso(local(SPK, 1.8, v, u), P));
  }
  turned("frame", SPK, [[0, 7], [1.8, 7]], { tone: "mid" }, { name: "frame.speaker", bevel: 0.3, steps: 40, extra: Ln(G.circleOf(SPK, 1.8, 5.6, P, 40), { tone: "lo" }) + Dots(grille, { size: 0.32, tone: "lo" }) });

  // controller board on standoffs, between the shoulder actuators
  const BOARD = { x: -10, y: -16, w: 20, d: 22, r: 1 };
  for (const [x, y] of k.corners(BOARD, 1.8)) cyl("frame", x, y, 1, TOPZ + 3, 2, { tone: "mid" }, { name: "frame.standoff", steps: 14 });
  box("frame", BOARD, TOPZ + 5, 0.9, { tone: "mid" }, {
    name: "frame.board",
    steps: 2,
    bevel: 0,
    extra: Ln(k.planOutline(k.insetPlan(BOARD, 0.8), TOPZ + 5.9, P, 2), { tone: "faint" }) + Dots(k.corners(BOARD, 1.8).map(([x, y]) => at([x, y, TOPZ + 5.9])), { size: 0.4, tone: "lo" }),
  });
  const BZ = TOPZ + 5.9;
  box("frame", { x: -4.5, y: -13, w: 9, d: 7, r: 0.4 }, BZ, 1.4, { tone: "mid" }, { name: "frame.mcu", steps: 2, bevel: 0.2, extra: Dots([at([-3.2, -11.8, BZ + 1.4])], { size: 0.3, tone: "lo" }) });
  for (const side of [-1, 1]) box("frame", { x: side > 0 ? 5.5 : -8.5, y: -13, w: 3, d: 5, r: 0.3 }, BZ, 1, { tone: "mid" }, { name: "frame.driver", steps: 2, bevel: 0 });
  for (const side of [-1, 1]) box("frame", { x: side * 2.4 - 1.6, y: -2, w: 3.2, d: 4, r: 0.3 }, BZ, 2.6, { tone: "mid" }, { name: "frame.header", steps: 2, bevel: 0.2 });
  box("frame", { x: -3, y: 2, w: 6, d: 3, r: 0.3 }, BZ, 2.4, { tone: "mid" }, { name: "frame.power-header", steps: 2, bevel: 0.2 });
  // shoulder actuators on cradles, plugs inward to the board's headers
  const SH = TOPZ + 3 + 1.5 + 10.575;
  const shoulders = [];
  for (const side of [-1, 1]) {
    box("frame", { x: side > 0 ? 22 : -36, y: -7, w: 14, d: 14, r: 1 }, TOPZ + 3, 1.5, { tone: "mid" }, { name: "frame.cradle", steps: 2, bevel: 0.3 });
    const F = G.frameOf([side * 14, 0, SH], [side, 0, 0], Z, [0, side, 0]);
    const m = motor(sc, "frame", F, 0.5, { shaft: 8, flat: 6, seams: 5, name: "shoulder-motor" });
    shoulders.push({ side, m });
    const f = m.plugFace;
    cable("frame", [f, [side * 2.4, f[1], f[2]], [side * 2.4, f[1], BZ + 2.6]], { r: 0.45, bend: 1.6, name: "frame.encoder-harness", dots: [false, true] });
  }
  // neck column behind the board
  const HZ = 138;
  const NECK = { x: -6, y: -26, w: 12, d: 8, r: 1.2 };
  box("frame", NECK, TOPZ + 3, HZ - TOPZ - 3, { tone: "mid" }, { name: "frame.neck", steps: 3, bevel: 0.4, inner: Ln(k.sideSeam(NECK, HZ - 8, P, 3), { tone: "faint" }) });
  // wiring loom: two power leads from the board, down through the top plate's notch to the
  // battery's connector
  const LOOM = [-1.3, 1.3];
  for (const x of LOOM)
    cable("frame", [[x, 5, BZ + 1.2], [x, 11.5, BZ + 1.2], [x, 11.5, 66]], { r: 0.5, bend: 3, name: "frame.loom", bundle: "loom", dots: [true, true] });

  // --- Battery: 48 V pack in its bay on the lower plate --------------------------------------
  const BATT = { x: -22, y: -16, w: 44, d: 32, r: 2.4 };
  box("frame", BATT, 43, 20, { tone: "mid" }, {
    name: "battery.pack",
    steps: 4,
    bevel: 0.6,
    inner: Ln(k.sideSeam(BATT, 49, P, 4), { tone: "faint" }),
    extra:
      Ln([0, 1, 2, 3, 4].map((i) => k.planOutline({ x: 12 + i * 2, y: -10, w: 0.9, d: 14, r: 0.45 }, 63, P, 2)).join(""), { tone: "lo" }) +
      Dots([0, 1, 2, 3].map((i) => at([-17 + i * 2.2, 13, 63])), { size: 0.45, tone: "lo" }),
  });
  box("frame", { x: -3, y: 7, w: 6, d: 6, r: 0.6 }, 63, 3, { tone: "mid" }, { name: "battery.connector", steps: 2, bevel: 0.2 });
  for (const x of [-15, -7]) cyl("frame", x, -6, 1.6, 63, 2, { tone: "mid" }, { name: "battery.terminal", steps: 18, bevel: 0.2 });

  // --- Arms: hub on the shoulder shaft, link plate, elbow servo and horn, forearm, gripper ---
  for (const { side, m } of shoulders) {
    const piece = side > 0 ? "armR" : "armL";
    const x0 = m.tip[0];
    const outer = (x, w) => (side > 0 ? x : x - w); // plan x for a part of width w starting at x, outward
    const HF = G.frameOf([x0, 0, SH], [side, 0, 0], Z, [0, side, 0]);
    disc(piece, HF, 0, 3, 6, { tone: "mid" }, { name: `${piece}.hub`, bevel: 0.3, steps: 40, extra: G.dot3(HF.a, sc.V) > 0.12 ? Dots(G.dotsOf(HF, 3, 4.2, 4, P, { all: true, phase: Math.PI / 4 }), { size: 0.38, tone: "lo" }) : "" });
    const lx = x0 + side * 3;
    const LINK = { x: outer(lx, 2.6), y: -6, w: 2.6, d: 12, r: 1.4 };
    box(piece, LINK, SH - 38, 45.5, { tone: "mid" }, { name: `${piece}.link`, steps: 3, bevel: 0.3 });
    const sx = lx + side * 2.6;
    const SERVO = { x: outer(sx, 10), y: -11, w: 10, d: 22, r: 1 };
    box(piece, SERVO, SH - 50, 14, { tone: "mid" }, { name: `${piece}.servo`, steps: 3, bevel: 0.4, inner: Ln(k.sideSeam(SERVO, SH - 40, P, 3), { tone: "faint" }) });
    box(piece, { x: outer(sx, 10), y: -14, w: 10, d: 28, r: 0.6 }, SH - 36, 1.2, { tone: "mid" }, { name: `${piece}.servo-ears`, steps: 2, bevel: 0, extra: Dots([at([sx + side * 5, -12.6, SH - 34.8]), at([sx + side * 5, 12.6, SH - 34.8])], { size: 0.38, tone: "lo" }) });
    const ox = sx + side * 10;
    const OF = G.frameOf([ox, 5, SH - 43], [side, 0, 0], Z, [0, side, 0]);
    disc(piece, OF, 0, 1.6, 3.6, { tone: "mid" }, { name: `${piece}.horn`, steps: 32, extra: G.dot3(OF.a, sc.V) > 0.12 ? Ln(G.circleOf(OF, 1.6, 1.5, P, 20), { tone: "faint" }) : "" });
    const fx = ox + side * 1.6;
    const FORE = { x: outer(fx, 2.6), y: 0, w: 2.6, d: 10, r: 1 };
    box(piece, FORE, SH - 62, 24, { tone: "mid" }, { name: `${piece}.forearm`, steps: 3, bevel: 0.3 });
    const PALM = { x: outer(fx - side * 2.5, 7.6), y: -2, w: 7.6, d: 14, r: 1.2 };
    box(piece, PALM, SH - 67, 5, { tone: "mid" }, { name: `${piece}.palm`, steps: 3, bevel: 0.3 });
    for (const y of [-1, 8.4]) box(piece, { x: PALM.x + 2, y, w: 3.6, d: 2.6, r: 0.5 }, SH - 73, 6, { tone: "mid" }, { name: `${piece}.finger`, steps: 2, bevel: 0.2 });
  }

  // --- Head: shell on the neck, camera module, microphone array, lidar, carry handle ---------
  const HEAD = { x: -26, y: -26, w: 52, d: 44, r: 10 };
  const HTOP = HZ + 32;
  const MICS = [[-20, -20], [20, -20], [20, 12], [-20, 12]];
  box("head", HEAD, HZ, HTOP - HZ, { tone: "mid" }, {
    name: "head.shell",
    steps: 8,
    bevel: 1,
    inner: Ln(k.sideSeam(HEAD, HZ + 12, P, 8), { tone: "faint" }),
    extra:
      Ln(k.planOutline(k.insetPlan(HEAD, 4), HTOP, P, 8), { tone: "faint" }) +
      Ln(MICS.map(([x, y]) => k.ring(x, y, 1.6, HTOP, P, 14)).join(""), { tone: "lo" }) +
      Dots(MICS.map(([x, y]) => at([x, y, HTOP])), { size: 0.4, tone: "lo" }),
  });
  // vents on the right side face are closed slots
  const vents = [0, 1, 2, 3].map((i) => {
    const y = -16 + i * 5;
    return k.pathOf([[26, y, HZ + 17], [26, y + 2.4, HZ + 17], [26, y + 2.4, HZ + 26], [26, y, HZ + 26]].map((p) => at(p)), true);
  });
  put("head", [26, -6, HZ + 21], Ln(vents.join(""), { tone: "lo" }), { bias: 0.3, name: "head.vents", shapes: [A.box([25.9, -16.2, HZ + 16.8], [26.1, 1.6, HZ + 26.2], { name: "head.vents" })] });
  box("head", { x: 1.5, y: 18, w: 13.5, d: 1.4, r: 0.4 }, HZ + 8, 14, { tone: "mid" }, { name: "head.cam-board", steps: 2, bevel: 0, extra: Dots([at([2.9, 19.4, HZ + 9.4]), at([13.6, 19.4, HZ + 9.4]), at([2.9, 19.4, HZ + 20.6]), at([13.6, 19.4, HZ + 20.6])], { size: 0.35, tone: "lo" }) });
  const CAM = G.frameOf([8.25, 19.4, HZ + 15], Y, Z, X);
  turned("head", CAM, [[0, 4.2], [1.4, 4.2], [1.4, 3.4], [4.4, 3.4], [4.4, 2.6], [5.2, 2.6]], { tone: "mid" }, { name: "head.cam-lens", bevel: 0.2, steps: 36, extra: Ln(G.circleOf(CAM, 5.2, 1.5, P, 24), { tone: "lo" }) });
  for (const x of [-9, 9]) cyl("head", x, -21, 1.3, HTOP, 5, { tone: "mid" }, { name: "head.handle-post", steps: 14 });
  box("head", { x: -10.6, y: -22.6, w: 21.2, d: 3.2, r: 1.2 }, HTOP + 5, 2, { tone: "mid" }, { name: "head.handle", steps: 3, bevel: 0.3 });
  const LF = G.frameOf([0, -4, HTOP], Z, X, Y);
  turned("head", LF, [[0, 10], [3, 10]], { tone: "mid" }, { name: "head.lidar-base", bevel: 0.4, steps: 56, extra: Dots(G.dotsOf(LF, 3, 8.6, 12, P, { fade: [0.04, 0.42] }), { size: 0.38, tone: "lo" }) });
  const win = (s) => 8.4 + 0.8 * Math.sin(((s - 3) / 7) * Math.PI);
  const winSlope = (s) => ((0.8 * Math.PI) / 7) * Math.cos(((s - 3) / 7) * Math.PI);
  turned("head", LF, Array.from({ length: 9 }, (_, i) => [3 + (7 * i) / 8, win(3 + (7 * i) / 8), i && i < 8 ? 1 : 0]), { tone: "hi" }, { name: "head.lidar-window", smooth: { slope: winSlope, rows: 2 }, steps: 56, inner: Ln(G.arcOf(LF, 6.5, win(6.5), P), { tone: "faint" }) });
  turned("head", LF, [[10, 9.4], [12.4, 9.4], [13.4, 8.2]], { tone: "mid" }, { name: "head.lidar-cap", steps: 56, extra: Ln(G.circleOf(LF, 13.4, 4, P, 32), { tone: "faint" }) });

  const label =
    "Astro Robotics 10MA helper robot taken apart on a display stand: the drive base with two actuator motors on the wheel axle, the chassis frame lifted off it, carrying the 48 V battery pack in its bay, the controller board, speaker, wiring loom and two shoulder actuator motors, the two arms lifted off the shoulder shafts, and the head with camera, microphone array and lidar.";
  const svg = output(sc, back, { W, H, label });
  return { sc, svg, W, H };
}

// =============================================================================================
// Fig 2: one actuator motor on a test cradle, flange toward the viewer, cable to a driver board.
function figureTwo() {
  const H = 300;
  const AZ = 34;
  const EL = 28;
  const BASE = { x: -70, y: -32, w: 136, d: 70, r: 5 };
  const { W, P } = fitTight([...k.boxCorners(BASE, -12, 0), [-30, 0, 52], [30, 0, 52], [-46, 0, 52], [58, 0, 30]], H, { pad: 8, azimuth: AZ, elevation: EL });
  const sc = scene(P);
  const { R, at, box, cyl, cable } = sc;
  const back = [];
  back.push(`<path class="iso-halo" d="${k.haloOf(BASE, -12, 10, P)}"/>`);
  for (const [x, y] of k.corners(BASE, 10).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))) {
    back.push(S(k.cylinder(x, y, 5.2, -12, 1.4, P, 24), { tone: "lo" }));
    back.push(S(k.cylinder(x, y, 4, -10.6, 2.6, P, 24), { tone: "mid" }));
    R.solid(A.cylinder(x, y, 5.2, -12, 4, { name: "stand.foot" }));
  }
  back.push(S(k.slabOf(BASE, -8, 8, P, 6, 1.2), { tone: "mid", inner: Ln(k.sideSeam(BASE, -3, P, 6), { tone: "faint" }) }));
  R.solid(A.slab(BASE, -8, 8, { name: "stand.base" }));
  back.push(Ln(k.planOutline(k.insetPlan(BASE, 4), 0, P, 6), { tone: "lo" }));
  // the base is a fixture plate: a grid of M3 tapped holes on an 8 pitch inside the groove
  back.push(Dots(k.dotGrid(BASE.x + 12, BASE.y + 11, 16, 7, 8, 0, P), { size: 0.42, tone: "lo" }));
  const screws = k.corners(BASE, 8);
  back.push(Ln(screws.map(([x, y]) => k.ring(x, y, 1.8, 0, P, 14)).join(""), { tone: "lo" }));
  back.push(Dots(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const STRIP = { x: -20, y: BASE.y + BASE.d - 10, w: 74, d: 5, r: 0.8 };
  back.push(S(k.slabOf(STRIP, 0, 0.5, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(STRIP.x + 2, STRIP.x + STRIP.w - 2, 2, 5, STRIP.y + 0.5, 0.5, [1.4, 2.8], P);
  back.push(Ln(ticks.minor, { tone: "lo" }), Ln(ticks.major, { tone: "mid" }));
  back.push(Dots([at([STRIP.x + 1, STRIP.y + 2.5, 0.5]), at([STRIP.x + STRIP.w - 1, STRIP.y + 2.5, 0.5])], { size: 0.4 }));
  const PLATE = { x: 38, y: -27, w: 26, d: 12, r: 1 };
  back.push(S(k.slabOf(PLATE, 0, 0.7, P, 3), { tone: "mid" }));
  back.push(Ln(k.planOutline(k.insetPlan(PLATE, 1.2), 0.7, P, 3), { tone: "faint" }));
  back.push(Ln([0, 1, 2].map((row) => k.onTop([[PLATE.x + 3, PLATE.y + 3.6 + row * 2.4], [PLATE.x + [20, 15, 18][row], PLATE.y + 3.6 + row * 2.4]], 0.7, P)).join(""), { tone: "lo", free: true }));

  // the motor rests on a cradle under its two end caps, shaft axis 26 above the base
  const MZ = 26;
  const CR = { x: -17, y: -25, w: 46, d: 50, r: 1.4 };
  const CZ = MZ - 21.15;
  box("stand", CR, 0, CZ, { tone: "mid" }, {
    name: "stand.cradle",
    bevel: 0.4,
    inner: Ln(k.sideSeam(CR, 2, P, 3), { tone: "faint" }),
    extra: Dots(k.corners(CR, 2).map(([x, y]) => at([x, y, CZ])), { size: 0.42, tone: "lo" }) + Ln(k.planOutline({ x: -7, y: -14, w: 26, d: 28, r: 1 }, CZ, P, 3), { tone: "faint" }),
  });
  // four locating fences on the cradle, touching the end caps' side faces
  for (const [x0, y0] of [[-16, -24.4], [22, -24.4], [-16, 21.15], [22, 21.15]]) {
    const plan = { x: x0, y: y0, w: 6, d: 3.25, r: 0.5 };
    box("stand", plan, CZ, 9, { tone: "mid" }, { name: "stand.fence", steps: 2, bevel: 0.3, extra: Dots([at([x0 + 1.6, y0 + 1.6, CZ + 9]), at([x0 + 4.4, y0 + 1.6, CZ + 9])], { size: 0.4, tone: "lo" }) });
  }
  // two datum dowels in the fixture plate that the cradle is set against
  for (const [x, y] of [[-18.6, -19], [30.6, 19]]) cyl("stand", x, y, 1.6, 0, 3.6, { tone: "mid" }, { name: "stand.dowel", steps: 16, bevel: 0.2 });
  const F = G.frameOf([-30, 0, MZ], X, Z, Y);
  const engraving = (FF, { S1, S2, m }) => {
    const h = m(20.7);
    const plate = rect(-m(9), m(9), h, h + 0.3);
    const lines = [0, 1].map((row) => k.pathOf([local(FF, S1 + m(5), m(5.5) - row * m(3), h + 0.3), local(FF, S1 + m(row ? 15 : 21), m(5.5) - row * m(3), h + 0.3)].map((p) => k.iso(p, P)))).join("");
    return (
      S(G.prismOf(FF, plate, S1 + m(2.5), S2 - m(2.5), P), { tone: "mid" }) +
      Ln(lines, { tone: "lo", free: true }) +
      k.faceTextSvg(k.sideMatrix([FF.o[0] + S1 + (S2 - S1) / 2, h + 0.3], FF.o[2] - m(5.2), P, "left"), "48 V", { size: 6, tone: "lo", anchor: "middle" })
    );
  };
  const mo = motor(sc, "motor", F, 1, { shaft: 24, flat: 15, seams: 13, label: engraving });

  // driver board on four standoffs: driver IC, capacitors, 48 V terminal block, encoder header
  const DB = { x: -66, y: 10, w: 30, d: 24, r: 1 };
  for (const [x, y] of k.corners(DB, 2.4)) cyl("stand", x, y, 1.4, 0, 3, { tone: "mid" }, { name: "stand.standoff", steps: 14 });
  box("stand", DB, 3, 1.2, { tone: "mid" }, {
    name: "stand.driver-board",
    steps: 2,
    bevel: 0,
    extra: Ln(k.planOutline(k.insetPlan(DB, 1), 4.2, P, 2), { tone: "faint" }) + Dots(k.corners(DB, 2.4).map(([x, y]) => at([x, y, 4.2])), { size: 0.45, tone: "lo" }),
  });
  box("stand", { x: -63, y: 13, w: 9, d: 9, r: 0.6 }, 4.2, 1.6, { tone: "mid" }, { name: "stand.driver-ic", steps: 2, bevel: 0.2 });
  // finned heatsink bonded to the driver IC
  box("stand", { x: -62.6, y: 13.4, w: 8.2, d: 8.2, r: 0.4 }, 5.8, 0.8, { tone: "mid" }, { name: "stand.heatsink", steps: 2, bevel: 0 });
  for (let i = 0; i < 4; i++) box("stand", { x: -62.6 + i * 2.47, y: 13.4, w: 0.8, d: 8.2, r: 0.2 }, 6.6, 3.4, { tone: "mid" }, { name: "stand.fin", steps: 2, bevel: 0 });
  for (const y of [12.5, 16.5]) cyl("stand", -38.6, y, 1.5, 4.2, 3.4, { tone: "mid" }, { name: "stand.capacitor", steps: 16, extra: Ln(k.ring(-38.6, y, 0.8, 7.6, P, 12), { tone: "faint" }) });
  box("stand", { x: -52, y: 12.5, w: 4, d: 2.2, r: 1 }, 4.2, 1.2, { tone: "mid" }, { name: "stand.crystal", steps: 3, bevel: 0 });
  for (let i = 0; i < 3; i++) box("stand", { x: -52 + i * 2.2, y: 16.2, w: 1.4, d: 2.6, r: 0.2 }, 4.2, 0.7, { tone: "mid" }, { name: "stand.resistor", steps: 2, bevel: 0 });
  cyl("stand", -60.5, 30.5, 0.9, 4.2, 1.6, { tone: "hi" }, { name: "stand.led", steps: 12 });
  const TB = { x: -63, y: 23, w: 9, d: 6, r: 0.5 };
  box("stand", TB, 4.2, 4.6, { tone: "mid" }, { name: "stand.terminal", steps: 2, bevel: 0.2, extra: Ln([TB.x + 2.4, TB.x + 6.6].map((x) => k.ring(x, TB.y + 3.5, 1.2, 8.8, P, 14)).join(""), { tone: "lo" }) + Ln([TB.x + 2.4, TB.x + 6.6].map((x) => k.lineOnTop([x - 0.85, TB.y + 3.5], [x + 0.85, TB.y + 3.5], 8.8, P)).join(""), { tone: "lo" }) });
  const HDR = { x: -50, y: 22, w: 12, d: 6, r: 0.5 };
  box("stand", HDR, 4.2, 6, { tone: "mid" }, { name: "stand.header", steps: 2, bevel: 0.2 });
  // encoder cable: braided, back from the Molex plug, down behind the motor, then forward along
  // the base into the header's face
  const f = mo.plugFace;
  cable("motor", [f, [-42, 0, f[2]], [-44, 25, 24], [-44, 25, 10.2]], {
    r: 1.1,
    bend: 5,
    name: "motor.encoder-cable",
    shells: [false, true],
    shellLen: 3,
    shellR: 2.2,
    dots: [false, false],
    maxLength: 10,
    rings: { pitch: 1.4, twist: 1.2, cross: true, fade: [0.1, 0.55] },
  });
  const label = "One 10MA actuator motor on a test cradle: NEMA 17 body with lamination seams, flange face with four M3 tapped holes and a 22 mm pilot boss, 6 mm shaft with a flat, rear encoder cap and a Molex connector whose braided cable runs to the header on the driver board. Rated 48 V.";
  const svg = output(sc, back, { W, H, label, state: 0 });
  return { sc, svg, W, H };
}


// =============================================================================================
const built = {};
if (!ONLY || ONLY === "fig1") built.fig1 = figureOne();
if (!ONLY || ONLY === "fig2") built.fig2 = figureTwo();
for (const [name, fig] of Object.entries(built)) {
  console.log(`${name}: ${fig.sc.R.items.length} items · ${fig.sc.R.solids.length} solids · ${fig.sc.CABLES.length} cables · ${(fig.svg.length / 1024).toFixed(0)} KB`);
  if (argv.includes("--audit")) {
    console.log(`--- audit ${name}`);
    A.auditOrExit(fig.sc.R, fig.sc.P, {});
  }
  if (PAGES) {
    const titles = { fig1: "10MA · exploded", fig2: "Actuator motor" };
    for (const theme of ["dark", "light"]) writeFileSync(`${PAGES}/${name}-${theme}.html`, page(fig.svg, { fig: name === "fig1" ? "Fig 1" : "Fig 2", title: titles[name], theme, width: name === "fig1" ? 900 : 640 }));
  }
}
if (built.fig1 && built.fig2) {
  const out = `// Generated by scripts/build-figures.mjs with the Anatomy kit (MIT). Do not edit.
export const EXPLODED_10MA_SVG = ${JSON.stringify(built.fig1.svg)};
export const MOTOR_SVG = ${JSON.stringify(built.fig2.svg)};
`;
  writeFileSync("components/workspace/figures/generated.ts", out);
  console.log("wrote components/workspace/figures/generated.ts", out.length, "bytes");
}
