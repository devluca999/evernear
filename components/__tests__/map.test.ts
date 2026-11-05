import { describe, expect, it } from "vitest";
import { MAP } from "../workspace/map/generated";
import { cumulative, pointAt, type Pt } from "../workspace/map/route";

const inside = ([x, y]: readonly number[]) => x > 0 && x < MAP.width && y > 0 && y < MAP.height;

describe("shipment map", () => {
  it("has real land and border outlines", () => {
    expect(MAP.land.length).toBeGreaterThan(20_000);
    expect(MAP.borders.length).toBeGreaterThan(5_000);
  });
  it("puts every place inside the frame, west to east across the Pacific", () => {
    for (const p of Object.values(MAP.pins)) expect(inside(p)).toBe(true);
    const x = (n: keyof typeof MAP.pins) => MAP.pins[n][0];
    expect(x("Stuttgart")).toBeLessThan(x("Shenzhen"));
    expect(x("Shenzhen")).toBeLessThan(x("Osaka"));
    expect(x("Osaka")).toBeLessThan(x("Chicago"));
  });
  it("flies from Shenzhen to Chicago across the Pacific, inside the frame", () => {
    const r = MAP.route as readonly Pt[];
    const near = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 2;
    expect(near(r[0], MAP.pins.Shenzhen)).toBe(true);
    expect(near(r[MAP.stops.dock], MAP.pins.Chicago)).toBe(true);
    expect(MAP.stops.origin).toBeLessThan(MAP.stops.szx);
    expect(MAP.stops.szx).toBeLessThan(MAP.stops.ord);
    expect(r.every(inside)).toBe(true);
    expect(MAP.airKm).toBeGreaterThan(12_000);
    expect(MAP.airKm).toBeLessThan(13_500);
  });
  it("finds the point a share of the way along the route", () => {
    const pts: Pt[] = [[0, 0], [10, 0], [10, 10]];
    expect(pointAt(pts, 0)).toEqual([0, 0]);
    expect(pointAt(pts, 0.5)).toEqual([10, 0]);
    expect(pointAt(pts, 0.75)).toEqual([10, 5]);
    expect(pointAt(pts, 2)).toEqual([10, 10]);
    expect(cumulative(pts)).toEqual([0, 10, 20]);
  });
});
