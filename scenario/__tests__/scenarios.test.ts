import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../scenes";
import { stateAt } from "../runner";

const end = (id: keyof typeof SCENARIOS) => stateAt(SCENARIOS[id].totalMs, SCENARIOS[id].timeline);
const gates = (id: keyof typeof SCENARIOS) => SCENARIOS[id].timeline.filter((b) => b.gate).map((b) => b.gate!.id);

describe("three scenarios", () => {
  it("happy path: committed $38,000, paid $34,200 for the 1,800 that arrived, $3,800 back", () => {
    const s = end("happy");
    expect(s.halted).toBeNull();
    expect(s.escrow).toMatchObject({ lockedCents: 3_800_000, releasedCents: 3_420_000, reclaimedCents: 380_000, closed: true });
    expect(s.endCard).toBe(true);
  });
  it("bad path: Haoyun holds at +8%, over the 3% limit, so nothing is committed and the PO waits for a person", () => {
    const s = end("standoff");
    expect(s.escrow).toBeNull();
    expect(s.halted?.reason).toBe("Haoyun's price change of +8% is over your 3% limit. The PO stops before any money is committed.");
    expect(s.price.history.map((h) => [h.unitCents, h.pass])).toEqual([[2002, false], [2002, false]]);
    expect(gates("standoff")).toEqual(["start_sourcing", "price_limit", "on_hold"]);
    expect(SCENARIOS.standoff.scenes.map((x) => x.title)).toEqual(["The 10MA", "The gap", "Ultra's reply", "Search", "Negotiation", "On hold"]);
  });
  it("bad path, adjusted: you raise the limit to 8% with two approvals, and it goes through at $20.02", () => {
    const s = end("adjusted");
    expect(s.halted).toBeNull();
    expect(s.policy.priceChangeLimitBps).toBe(800);
    expect(s.policy.priceCaps["Actuator motor"]).toBe(2010);
    expect(s.price.history.at(-1)).toMatchObject({ unitCents: 2002, pass: true });
    expect(s.escrow).toMatchObject({ lockedCents: 4_004_000, releasedCents: 3_603_600, reclaimedCents: 400_400, closed: true });
    expect(gates("adjusted")).toEqual(["start_sourcing", "price_limit", "raise_limit", "approve_raise", "approve_luca", "approve_jordy", "packing_slip", "approve_release"]);
    expect(SCENARIOS.adjusted.scenes.map((x) => x.title)).toEqual(["The 10MA", "The gap", "Ultra's reply", "Search", "Negotiation", "Adjustment", "Approve and commit", "Day 9 · Chicago dock", "Paid"]);
    expect(s.limitApprovals.map((a) => a.by)).toEqual(["Luca", "Jordy"]);
    expect(s.dock).toMatchObject({ releaseCents: 3_603_600, holdCents: 400_400 });
    const labels = s.proofs.map((p) => p.label).join("\n");
    expect(labels).toContain("Committed for PO 1042: $40.04 (1:1,000 of $40,040.00)");
    expect(labels).toContain("Paid supplier on Base Sepolia for PO 1042: $36.04 (1:1,000 of $36,036.00)");
    expect(SCENARIOS.adjusted.timeline.find((b) => b.gate?.id === "approve_release")!.gate!.prompt).toBe("Reply YES on Telegram to release $36,036 and hold $4,004.");
  });
  it("every scenario numbers its chapters 0, 1, 2 and every beat sits inside its chapter", () => {
    for (const sc of Object.values(SCENARIOS)) {
      expect(sc.scenes.map((x) => x.id)).toEqual(sc.scenes.map((_, i) => i));
      expect(sc.timeline.at(-1)!.atMs).toBeLessThan(sc.totalMs);
    }
  });
});
