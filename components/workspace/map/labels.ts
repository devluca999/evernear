// Where the supplier labels sit on the search map, so none overlaps another, a pin, or the map's
// edge. Each label tries spots around its pin (beside it, above, below, then a step further out) and
// takes the first that is free; the suppliers that fit go first, so theirs always get the best spot.
// Pure, in pixels of the map box: tested in components/__tests__/mapLabels.test.ts.
import { MAP } from "./generated";
import type { View } from "./view";

/** Where each supplier sits on the map. */
export const SUPPLIER_CITY: Record<string, keyof typeof MAP.pins> = { kansai: "Osaka", rheinwerk: "Stuttgart", huaxin: "Dongguan", haoyun: "Shenzhen", quickship: "Busan", ultra: "Rockford" };
/** Shenzhen and Dongguan are neighbours: in the search their pins sit a little apart so both show. */
const NUDGE: Record<string, [number, number]> = { haoyun: [2.5, 2], huaxin: [-3.5, -3] };
/** A supplier's pin in map units (`bare`: the search map, with neighbours nudged apart). */
export const pinAt = (id: string, bare: boolean): [number, number] => {
  const [x, y] = MAP.pins[SUPPLIER_CITY[id]];
  const [nx, ny] = bare ? NUDGE[id] ?? [0, 0] : [0, 0];
  return [x + nx, y + ny];
};
/** A search pin's place in the map box, as a fraction of its width and height. */
export const pinFrac = (id: string, view: View): [number, number] => {
  const [x, y] = pinAt(id, true);
  return [(x - view.x) / view.w, (y - view.y) / view.h];
};

export interface Box { x: number; y: number; w: number; h: number }
export interface LabelIn {
  id: string;
  /** The pin, in px from the map box's top left. */
  px: number; py: number;
  /** The label's size in px. */
  w: number; h: number;
  /** Placed first (the suppliers that fit). */
  first?: boolean;
}
export interface LabelOut { id: string; x: number; y: number }

/** Room between a pin and its label, and around everything else. */
export const GAP = 12;
const PIN_R = 9;

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
const outside = (b: Box, area: Box) => b.w * b.h - overlap(b, area);

/** The spots a label may take around its pin: beside, below and above it, at growing distances. */
function spots(l: LabelIn): Box[] {
  const out: Box[] = [];
  for (const g of [GAP, GAP * 2.2, GAP * 3.8, GAP * 5.6]) {
    const xs = [l.px + g, l.px - g - l.w, l.px - l.w / 2, l.px + g / 2 - l.w * 0.2, l.px - g / 2 - l.w * 0.8];
    const ys = [l.py - l.h / 2, l.py + g, l.py - g - l.h, l.py + g / 2, l.py - g / 2 - l.h];
    for (const x of xs) for (const y of ys) {
      const b = { x, y, w: l.w, h: l.h };
      // Never on its own pin.
      if (overlap(b, { x: l.px - PIN_R, y: l.py - PIN_R, w: 2 * PIN_R, h: 2 * PIN_R }) === 0) out.push(b);
    }
  }
  return out;
}

/** How far a label sits from its pin: the gap between the pin and the nearest point of the box. */
const reach = (b: Box, l: LabelIn) => Math.hypot(Math.max(b.x - l.px, 0, l.px - (b.x + b.w)), Math.max(b.y - l.py, 0, l.py - (b.y + b.h)));

/** Every order of a short list (the labels are few: at most 5, so at most 120 orders). */
function orders<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** One greedy pass in a given order: each label takes its cheapest free spot. */
function greedy(order: LabelIn[], all: LabelIn[], area: Box, avoid: Box[]): { cost: number; at: Map<string, Box> } {
  const pins: Box[] = all.map((l) => ({ x: l.px - PIN_R, y: l.py - PIN_R, w: 2 * PIN_R, h: 2 * PIN_R }));
  const placed: Box[] = [];
  const at = new Map<string, Box>();
  let total = 0;
  for (const l of order) {
    let best: Box | null = null, bestCost = Infinity;
    for (const b of spots(l)) {
      const room = grow(b, GAP / 2);
      const clash = placed.reduce((c, p) => c + overlap(room, p), 0) + avoid.reduce((c, p) => c + overlap(room, p), 0)
        + pins.reduce((c, p) => c + overlap(b, p), 0) + outside(b, area) * 2;
      // A clash outweighs any distance; among free spots the nearest wins, the suppliers that fit most.
      const cost = clash * 1000 + reach(b, l) * (l.first ? 4 : 1);
      if (cost < bestCost) { best = b; bestCost = cost; }
    }
    placed.push(best!);
    at.set(l.id, best!);
    total += bestCost;
  }
  return { cost: total, at };
}

/**
 * Places every label. `area` is where labels may go (the map box); `avoid` holds what to keep clear
 * of (the search bar, Astro's HQ name). The suppliers that fit are placed first; every order within
 * each group is tried and the arrangement with the fewest clashes, then the shortest reach, wins.
 */
export function placeLabels(labels: LabelIn[], area: Box, avoid: Box[] = []): LabelOut[] {
  const first = labels.filter((l) => l.first), rest = labels.filter((l) => !l.first);
  let best: { cost: number; at: Map<string, Box> } | null = null;
  for (const a of orders(first)) for (const b of orders(rest)) {
    const r = greedy([...a, ...b], labels, area, avoid);
    if (!best || r.cost < best.cost) best = r;
  }
  return labels.map((l) => ({ id: l.id, x: best!.at.get(l.id)!.x, y: best!.at.get(l.id)!.y }));
}

/** Below this map width the suppliers that do not fit show a short reason (the full one on hover). */
export const COMPACT_BELOW = 1050;
/** A non-fitting supplier's reason, cut to its first words on a narrow map: "Late", "Fails policy". */
export const labelWhy = (text: string, pass: boolean, mapW: number) => (pass || mapW >= COMPACT_BELOW ? text : text.split(/[:,]/)[0]);

/** A label's size before it is measured: its two lines at the label's type sizes. */
export function estimateLabel(name: string, why: string): { w: number; h: number } {
  return { w: Math.ceil(22 + Math.max(14 + name.length * 7.9, 14 + why.length * 6.6)), h: 52 };
}

export const boxesOverlap = (a: Box, b: Box) => overlap(a, b) > 0;
