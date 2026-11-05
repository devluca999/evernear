// Pure helpers over the projected route: point and length at a share of the trip.
export type Pt = readonly [number, number];

export function cumulative(pts: readonly Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return out;
}

/** The point a share t (0..1) of the way along the polyline. */
export function pointAt(pts: readonly Pt[], t: number, cum = cumulative(pts)): Pt {
  const total = cum[cum.length - 1];
  const want = Math.min(1, Math.max(0, t)) * total;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < want) i++;
  const seg = cum[i] - cum[i - 1] || 1;
  const f = (want - cum[i - 1]) / seg;
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f];
}

export const polyline = (pts: readonly Pt[]) => "M" + pts.map((p) => `${p[0]},${p[1]}`).join("L");
