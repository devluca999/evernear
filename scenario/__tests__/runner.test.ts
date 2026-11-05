import { describe, expect, it } from "vitest";
import { scenes, timeline, totalDurationMs } from "../scenes";
import { stateAt, sceneStartMs } from "../runner";
import { cents } from "../../engine/money";

const end = stateAt(totalDurationMs);

describe("scenario runner", () => {
  it("has scenes 0 to 9", () => {
    expect(scenes.map((s) => s.id)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("starts at Low with nothing done", () => {
    const s = stateAt(0);
    expect(s.stage).toBe("low");
    expect(s.escrow).toBeNull();
  });
  it("never shows more than 3 panels", () => {
    for (let t = 0; t <= totalDurationMs; t += 250) expect(stateAt(t).layout.length).toBeLessThanOrEqual(3);
  });
  it("runs the routine reorder in 8 s, green end to end, with no approvals", () => {
    const s2 = scenes.find((s) => s.id === 2)!;
    expect(s2.durationMs).toBe(8000);
    const s = stateAt(sceneStartMs(3));
    expect(s.routine.stage).toBe("closed");
    expect(s.routine.approvals).toBe(0);
    expect(s.proofs.some((p) => p.kind === "payment_receipt")).toBe(true);
  });
  it("shows the bottleneck numbers", () => {
    const s = stateAt(sceneStartMs(2) - 1);
    expect(s.demand.headline).toBe("14 robots ordered, motors for 6");
  });
  it("scores fitment through the engine: 3 fail, Haoyun passes", () => {
    const s = stateAt(sceneStartMs(4));
    expect(s.fitment.filter((f) => !f.pass).map((f) => f.supplierId).sort()).toEqual(["huaxin", "kansai", "rheinwerk"]);
    expect(s.fitment.find((f) => f.supplierId === "haoyun")!.pass).toBe(true);
  });
  it("collects 2 approvals before funds lock", () => {
    const lockAt = timeline.find((b) => b.ev.type === "lock_funds")!.atMs;
    const before = stateAt(lockAt - 1);
    expect(before.approvals).toHaveLength(2);
    expect(before.escrow).toBeNull();
    expect(stateAt(lockAt).escrow!.lockedCents).toBe(cents(38000));
  });
  it("stops at +8% and passes at +2.5%", () => {
    const s = stateAt(sceneStartMs(6));
    expect(s.price.history.map((h) => [h.unitCents, h.pass])).toEqual([[2002, false], [1900, true]]);
    expect(s.refused.some((r) => r.kind === "offlist_email")).toBe(true);
  });
  it("ends paid: $34,200 released, $3,800 held and reclaimed, wrong address refused", () => {
    expect(end.stage).toBe("closed");
    expect(end.escrow).toMatchObject({ lockedCents: cents(38000), releasedCents: cents(34200), reclaimedCents: cents(3800) });
    expect(end.dock).toMatchObject({ receivedQty: 1800, orderedQty: 2000 });
    expect(end.refused.some((r) => r.kind === "wrong_address_release")).toBe(true);
    expect(end.endCard).toBe(true);
  });
  it("labels every synthetic proof as synthetic", () => {
    expect(end.proofs.length).toBeGreaterThan(5);
    for (const p of end.proofs) expect(p.synthetic).toBe(true);
  });
  it("opens the drawer about 3 s per proof moment", () => {
    const b = timeline.find((x) => x.ev.type === "proof")!;
    expect(stateAt(b.atMs + 100).drawer).not.toBeNull();
    expect(stateAt(b.atMs + 3100).drawer).toBeNull();
  });
  it("pulses the panel a Stockbot message refers to", () => {
    const b = timeline.find((x) => x.ev.type === "message" && x.ev.message.refersTo)!;
    expect(stateAt(b.atMs + 50).pulse).not.toBeNull();
  });
});
