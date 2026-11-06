import { describe, expect, it } from "vitest";
import { cameraTarget, motion, spring, springEasing, toLayout, transformOf, ZOOM_MAX, ZOOM_MIN, IN_MS, OUT_MS } from "../camera";
import { SCENARIOS } from "../scenes";

const VP = { w: 1200, h: 800 };

describe("camera target", () => {
  it("centres a small element in the middle of the viewport at the asked zoom", () => {
    const v = cameraTarget({ x: 500, y: 300, w: 200, h: 100 }, VP, 2);
    expect(v.k).toBe(2);
    // The element's centre (600, 350) lands on the viewport centre (600, 400).
    expect(600 * v.k + v.x).toBeCloseTo(600);
    expect(350 * v.k + v.y).toBeCloseTo(400);
  });
  it("zooms less when the element would not fit with padding", () => {
    const v = cameraTarget({ x: 100, y: 100, w: 1000, h: 200 }, VP, 2.5, 48);
    expect(v.k).toBeCloseTo((1200 - 96) / 1000);
  });
  it("keeps the zoom between 1.0 and 2.5", () => {
    expect(cameraTarget({ x: 590, y: 390, w: 20, h: 20 }, VP, 9).k).toBe(ZOOM_MAX);
    expect(cameraTarget({ x: 0, y: 0, w: 5000, h: 5000 }, VP, 2).k).toBe(ZOOM_MIN);
  });
  it("never shows past the edge of the workspace, even for an element in a corner", () => {
    const v = cameraTarget({ x: 0, y: 0, w: 100, h: 50 }, VP, 2);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    const w = cameraTarget({ x: 1150, y: 760, w: 50, h: 40 }, VP, 2);
    expect(w.x).toBe(VP.w - VP.w * 2);
    expect(w.y).toBe(VP.h - VP.h * 2);
  });
  it("reads an element's layout box back from its zoomed screen box", () => {
    expect(toLayout({ left: 260, top: 140, width: 200, height: 100 }, { left: 60, top: 40 }, 2)).toEqual({ x: 100, y: 50, w: 100, h: 50 });
  });
  it("moves pan and zoom together in one transform", () => {
    expect(transformOf({ k: 1.5, x: -120.333, y: -40 })).toBe("translate(-120.33px, -40px) scale(1.5)");
  });
});

describe("camera motion", () => {
  it("eases with a spring that overshoots by no more than 2% and lands exactly", () => {
    const samples = Array.from({ length: 1001 }, (_, i) => spring(i / 1000));
    expect(samples[0]).toBe(0);
    expect(samples.at(-1)).toBe(1);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.02);
    expect(springEasing()).toMatch(/^linear\(0, .*, 1\)$/);
  });
  it("takes 700 ms in and 500 ms out, and cuts instead with reduced motion", () => {
    expect(motion(false)).toMatchObject({ inMs: IN_MS, outMs: OUT_MS });
    expect([IN_MS, OUT_MS]).toEqual([700, 500]);
    expect(motion(true)).toEqual({ inMs: 0, outMs: 0, easing: "linear" });
  });
});

describe("focus plan", () => {
  const plan = SCENARIOS.happy.timeline.filter((b) => b.focus).map((b) => [b.scene + 1, b.step, b.focus!.id, b.focus!.zoom]);
  it("follows the plan: 18 steps across the eight chapters, five of them explainers", () => {
    expect(plan).toEqual([
      [1, "Product switch", "products.figure", 1.5],
      [1, "Motor highlight", "products.motor", 2.2],
      [2, "The gap", "stock.shortfall", 1.8],
      [3, "Ultra's reply", "inbox.reply", 1.7],
      [4, "Search typed", "map.search", 1.8],
      [4, "Private inference", "developer.attestation", 1.5],
      [4, "Attestation", "developer.attestation", 1.8],
      [4, "Pins resolve", "map.results", 1.4],
      [4, "Orange reasons", "map.results.partial", 2.0],
      [5, "Offers side by side", "negotiation.threads", 1.3],
      [5, "Haoyun's offer", "negotiation.haoyun", 1.9],
      [6, "Approvals", "rules.approvals", 1.8],
      [6, "Funds move", "money.escrow", 2.0],
      [6, "Order wallet", "developer.policy", 1.6],
      [7, "Dock count", "dock.count", 2.0],
      [7, "Signed result", "developer.signed", 1.7],
      [8, "Paid and refused", "money.payout", 1.8],
      [8, "Wallet lifecycle", "money.lifecycle", 1.6],
    ]);
  });
  it("keeps every zoom in every scenario between 1.0 and 2.5", () => {
    for (const sc of Object.values(SCENARIOS)) for (const b of sc.timeline.filter((x) => x.focus)) {
      expect(b.focus!.zoom).toBeGreaterThanOrEqual(1);
      expect(b.focus!.zoom).toBeLessThanOrEqual(2.5);
    }
  });
});
