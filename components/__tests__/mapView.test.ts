import { describe, expect, it } from "vitest";
import { clampView, fullView, panBy, zoomAt, zoomOf, MAX_ZOOM } from "../workspace/map/view";

const W = 720, H = 300;

describe("map pan and zoom", () => {
  it("zooms in around the pointer and keeps that point under it", () => {
    const v = zoomAt(fullView(W, H), 2, 0.5, 0.5, W, H);
    expect(v).toEqual({ x: 180, y: 75, w: 360, h: 150 });
    expect(zoomOf(v, W)).toBe(2);
  });
  it("never zooms out past the whole map or in past the limit", () => {
    expect(zoomAt(fullView(W, H), 0.5, 0.5, 0.5, W, H)).toEqual(fullView(W, H));
    expect(zoomOf(zoomAt(fullView(W, H), 100, 0.5, 0.5, W, H), W)).toBe(MAX_ZOOM);
  });
  it("pans with the drag, scaled to the zoom, and stops at the map's edge", () => {
    const v = zoomAt(fullView(W, H), 2, 0.5, 0.5, W, H);
    expect(panBy(v, 100, 0, 720, W, H).x).toBeCloseTo(180 - 50);
    expect(panBy(v, 10_000, 10_000, 720, W, H)).toMatchObject({ x: 0, y: 0 });
    expect(clampView({ x: 9999, y: 9999, w: 360, h: 150 }, W, H)).toMatchObject({ x: 360, y: 150 });
  });
});
