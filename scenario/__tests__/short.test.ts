// Short mode's script: 9 sections, each cut to its target length, every step inside it, every tap
// reachable by the presenter cursor, and the whole run replays the happy path to the end.
import { describe, expect, it } from "vitest";
import { HOLD_TO_PRESS, SECTIONS, SHORT, SHORT_ASK_MS, settledMs, TARGET_MS } from "../short";
import { stateAt, sceneStartMs } from "../runner";
import { LOOKAHEAD_MS } from "../cursor";
import { IN_MS } from "../camera";
import { SCENARIOS } from "../scenes";

const TITLES = ["The company", "The gap", "Search", "Negotiation", "Approve and commit", "Ship and dock", "Paid", "On chain", "End frame"];

describe("Short mode script", () => {
  it("has the 9 sections in order, each as long as its target", () => {
    expect(SECTIONS.map((s) => s.title)).toEqual(TITLES);
    expect(SECTIONS.map((s) => s.durationMs)).toEqual([...TARGET_MS]);
    expect(SHORT.totalMs).toBe(TARGET_MS.reduce((a, b) => a + b, 0));
  });

  for (const sc of SECTIONS) {
    it(`section ${sc.id + 1}, ${sc.title}: every step, and the zoom it brings, finishes within ${sc.durationMs / 1000} s`, () => {
      for (const [at, , x] of sc.beats) {
        const zoomIn = x && "focus" in x && x.focus ? IN_MS : 0;
        expect(at + zoomIn, `${sc.title} at ${at} ms`).toBeLessThanOrEqual(sc.durationMs);
      }
      expect(settledMs(sc)).toBeLessThanOrEqual(sc.durationMs);
    });
  }

  it("starts nothing by itself: the only beat before the first press is the opening frame", () => {
    const first = SHORT.timeline.filter((b) => b.atMs === 0).map((b) => b.ev.type);
    expect(first.sort()).toEqual(["scene", "wallet"]);
    // Each later section opens with its scene beat, the one place the clock stops.
    for (let i = 1; i < SECTIONS.length; i++) {
      const start = sceneStartMs(i, SHORT.scenes);
      expect(SHORT.timeline.find((b) => b.atMs === start && b.ev.type === "scene")?.scene).toBe(i);
    }
  });

  it("gives the cursor time for every tap: a click is never closer to its press than the glide, and its button shows early enough", () => {
    expect(SHORT_ASK_MS).toBeGreaterThan(LOOKAHEAD_MS);
    const taps = SHORT.timeline.filter((b) => b.clickTarget);
    expect(taps.map((b) => b.gate?.id ?? b.clickTarget)).toEqual(["products.tab.10ma", "start_sourcing", "pick_supplier", "approve_luca", "approve_jordy", "packing_slip"]);
    for (const b of taps) expect(b.atMs - sceneStartMs(b.scene, SHORT.scenes), b.clickTarget).toBeGreaterThanOrEqual(LOOKAHEAD_MS);
  });

  it("ends each zooming section on a zoom that holds until the next press", () => {
    for (const sc of SECTIONS.slice(0, 8)) {
      const zooms = sc.beats.filter(([, , x]) => x && "focus" in x && x.focus);
      if (!zooms.length) continue;
      const lastZoom = zooms.at(-1)![2] as { focus: { holdMs?: number } };
      const sectionEndsZoomed = ["The company", "Search", "Approve and commit", "Ship and dock", "Paid", "On chain"].includes(sc.title);
      expect(lastZoom.focus.holdMs === HOLD_TO_PRESS, sc.title).toBe(sectionEndsZoomed);
    }
  });

  it("replays the happy path to the end: two approvals, $63,000 committed, 44 of 50 counted, a refused lookalike, closed", () => {
    const end = stateAt(SHORT.totalMs, SHORT.timeline);
    const happy = stateAt(SCENARIOS.happy.totalMs, SCENARIOS.happy.timeline);
    expect(end.halted).toBeNull();
    expect(end.stage).toBe("closed");
    expect(end.approvals.map((a) => a.by)).toEqual(["Luca", "Jordan"]);
    expect(end.escrow?.lockedCents).toBe(6_300_000);
    expect(end.escrow?.lockedCents).toBe(happy.escrow?.lockedCents);
    expect(end.escrow?.lifecycle).toBe(happy.escrow?.lifecycle);
    expect(end.dock?.receivedQty).toBe(44);
    expect(end.refused.some((r) => r.kind === "wrong_address_release")).toBe(true);
    expect(end.endCard).toBe(true);
    expect(end.pin).toBeNull();
    expect(end.fitment.filter((f) => f.pass).map((f) => f.supplierId).sort()).toEqual(["haoyun", "quickship"]);
  });

  it("holds the drawer on the commit during On chain", () => {
    const onChain = sceneStartMs(7, SHORT.scenes);
    expect(stateAt(onChain + 1000, SHORT.timeline).pin).toBe("escrow_wallet");
    expect(stateAt(sceneStartMs(8, SHORT.scenes) + 500, SHORT.timeline).pin).toBeNull();
  });
});
