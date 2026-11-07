import { describe, expect, it } from "vitest";
import { amounts, HOLD_UNIT, SCENARIOS } from "../scenes";
import { stateAt } from "../runner";
import { PO } from "@/seed/astro";

const end = (id: keyof typeof SCENARIOS) => stateAt(SCENARIOS[id].totalMs, SCENARIOS[id].timeline);
const gates = (id: keyof typeof SCENARIOS) => SCENARIOS[id].timeline.filter((b) => b.gate).map((b) => b.gate!.id);
const happy = amounts(PO.revisedUnitCents);
const adj = amounts(HOLD_UNIT);

describe("three scenarios", () => {
  it("prices the deal as Luca set it: $63,000 at +5%, $18,900 on departure, $36,540 for the 44 that arrived, $7,560 held", () => {
    expect(happy).toEqual({ lockedCents: 6_300_000, advanceCents: 1_890_000, balanceCents: 3_654_000, releaseCents: 5_544_000, holdCents: 756_000 });
    expect(adj).toEqual({ lockedCents: 6_600_000, advanceCents: 1_980_000, balanceCents: 3_828_000, releaseCents: 5_808_000, holdCents: 792_000 });
  });
  it("happy path: committed, advance and balance paid for what arrived, the rest back", () => {
    const s = end("happy");
    expect(s.halted).toBeNull();
    expect(s.escrow).toMatchObject({ lockedCents: happy.lockedCents, releasedCents: happy.releaseCents, reclaimedCents: happy.holdCents, closed: true });
    expect(s.dock).toMatchObject({ receivedQty: PO.receivedQty, orderedQty: PO.quantity, releaseCents: happy.balanceCents, holdCents: happy.holdCents });
    expect(gates("happy")).toEqual(["start_sourcing", "pick_supplier", "approve_luca", "approve_jordy", "packing_slip"]);
    expect(s.endCard).toBe(true);
  });
  it("bad path: both hold at +10%, over the 5% ceiling, so nothing is committed and the PO waits for a person", () => {
    const s = end("standoff");
    expect(s.escrow).toBeNull();
    expect(s.halted?.reason).toBe("Haoyun's price change of +10% is over your 5% limit. The PO stops before any money is committed.");
    expect(s.price.history.map((h) => [h.unitCents, h.pass])).toEqual([[HOLD_UNIT, false], [HOLD_UNIT, false]]);
    expect(gates("standoff")).toEqual(["start_sourcing", "on_hold"]);
    expect(SCENARIOS.standoff.scenes.map((x) => x.title)).toEqual(["The 10MA", "The gap", "Ultra's reply", "Search", "Negotiation", "On hold"]);
  });
  it("bad path, adjusted: you raise the ceiling to 10% with two approvals, and Haoyun's all-50 offer goes through at $66,000", () => {
    const s = end("adjusted");
    expect(s.halted).toBeNull();
    expect(s.policy.priceChangeLimitBps).toBe(1000);
    expect(s.policy.priceCaps["Actuator motor"]).toBe(HOLD_UNIT);
    expect(s.price.history.at(-1)).toMatchObject({ unitCents: HOLD_UNIT, pass: true });
    expect(s.escrow).toMatchObject({ lockedCents: adj.lockedCents, releasedCents: adj.releaseCents, reclaimedCents: adj.holdCents, closed: true });
    expect(gates("adjusted")).toEqual(["start_sourcing", "raise_limit", "approve_raise", "approve_luca", "approve_jordy", "packing_slip"]);
    expect(SCENARIOS.adjusted.scenes.map((x) => x.title)).toEqual(["The 10MA", "The gap", "Ultra's reply", "Search", "Negotiation", "Adjustment", "Approve and commit", "Shenzhen to the Chicago dock", "Paid"]);
    expect(s.limitApprovals.map((a) => a.by)).toEqual(["Luca", "Jordan"]);
    expect(s.dock).toMatchObject({ releaseCents: adj.balanceCents, holdCents: adj.holdCents });
    const labels = s.proofs.map((p) => p.label).join("\n");
    expect(labels).toContain("Committed for PO 1042: $66.00 (1:1,000 of $66,000.00)");
    expect(labels).toContain("Advance paid to Haoyun on Base Sepolia for PO 1042: $19.80 (1:1,000 of $19,800.00)");
    expect(labels).toContain("Balance paid to Haoyun on Base Sepolia for PO 1042: $38.28 (1:1,000 of $38,280.00)");
  });
  it("every scenario numbers its chapters 0, 1, 2 and every beat sits inside its chapter", () => {
    for (const sc of Object.values(SCENARIOS)) {
      expect(sc.scenes.map((x) => x.id)).toEqual(sc.scenes.map((_, i) => i));
      expect(sc.timeline.at(-1)!.atMs).toBeLessThan(sc.totalMs);
    }
  });
});
