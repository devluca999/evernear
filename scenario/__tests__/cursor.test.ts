import { describe, expect, it } from "vitest";
import { clickTargetOf, fitGlide, FORBIDDEN, moveMs, MOVE_MAX_MS, MOVE_MIN_MS, PRESS_MS, CAUSE_MS, restPoint, tapPoint } from "../cursor";
import { PHONE_TAP, SCENARIOS, type ScenarioId } from "../scenes";

describe("presenter cursor: the glide", () => {
  it("takes 450 to 700 ms, longer for a longer way, and never teleports", () => {
    expect(moveMs({ x: 0, y: 0 }, { x: 20, y: 0 }, false)).toBeGreaterThanOrEqual(MOVE_MIN_MS);
    expect(moveMs({ x: 0, y: 0 }, { x: 4000, y: 3000 }, false)).toBe(MOVE_MAX_MS);
    expect(moveMs({ x: 0, y: 0 }, { x: 600, y: 0 }, false)).toBeGreaterThan(moveMs({ x: 0, y: 0 }, { x: 100, y: 0 }, false));
  });
  it("jumps with reduced motion, and stays put when it is already there", () => {
    expect(moveMs({ x: 0, y: 0 }, { x: 900, y: 500 }, true)).toBe(0);
    expect(moveMs({ x: 10, y: 10 }, { x: 10, y: 10 }, false)).toBe(0);
  });
  it("shortens to fit a click the running clock reaches, so the press still lands before the change", () => {
    expect(fitGlide(600, 2000)).toBe(600);
    expect(fitGlide(600, 500)).toBe(500 - PRESS_MS - CAUSE_MS);
    expect(fitGlide(600, 100)).toBe(0);
  });
  it("clicks an element's middle and rests inside its lower right", () => {
    expect(tapPoint({ x: 100, y: 50, w: 40, h: 20 })).toEqual({ x: 120, y: 60 });
    const r = restPoint({ x: 0, y: 0, w: 200, h: 100 });
    expect(r.x).toBeGreaterThan(100); expect(r.x).toBeLessThan(200); expect(r.y).toBeLessThan(100);
  });
});

describe("presenter cursor: which steps click", () => {
  for (const id of Object.keys(SCENARIOS) as ScenarioId[]) {
    const TL = SCENARIOS[id].timeline;
    it(`${SCENARIOS[id].title}: every human moment is a tap, and only real clicks in the app click`, () => {
      for (const b of TL.filter((x) => x.gate)) expect(clickTargetOf(b), b.gate!.id).toBe(b.gate!.tap ?? PHONE_TAP);
      const clicks = TL.filter((b) => clickTargetOf(b));
      for (const b of clicks) {
        expect(b.gate || b.ev.type === "product", `${b.step ?? b.ev.type} at ${b.atMs}`).toBeTruthy();
        expect(FORBIDDEN.test(clickTargetOf(b)!)).toBe(false);
      }
      // Steps that only animate (a payment, the dock count, the ship, a message) click nothing.
      for (const b of TL.filter((x) => ["release", "dock", "shipment", "lock_funds", "reveal", "explain", "fitment", "search", "highlight"].includes(x.ev.type)))
        expect(clickTargetOf(b)).toBeNull();
    });
  }
  it("names the happy path's clicks", () => {
    const names = SCENARIOS.happy.timeline.filter((b) => clickTargetOf(b)).map((b) => b.gate?.action ?? clickTargetOf(b));
    expect(names).toEqual(["products.tab.kip", "products.tab.porter", "products.tab.10ma", "Start sourcing", "Choose Haoyun", "YES, approve as Luca", "YES, approve as Jordan", "Send packing slip photo"]);
  });
});
