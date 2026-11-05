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
    expect(x("Osaka")).toBeLessThan(x("Long Beach"));
    expect(x("Long Beach")).toBeLessThan(x("Chicago"));
  });
  it("routes from Shenzhen by sea to Long Beach, then by rail to Chicago", () => {
    const r = MAP.route as readonly Pt[];
    const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;
    expect(near(r[0], MAP.pins.Shenzhen)).toBe(true);
    expect(near(r[MAP.seaPoints - 1], MAP.pins["Long Beach"])).toBe(true);
    expect(near(r[r.length - 1], MAP.pins.Chicago)).toBe(true);
    expect(r.every(inside)).toBe(true);
    expect(MAP.seaKm).toBeGreaterThan(11_000);
    expect(MAP.railKm).toBeGreaterThan(2_500);
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
