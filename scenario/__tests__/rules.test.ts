import { describe, expect, it } from "vitest";
import { stateAt, sceneStartMs } from "../runner";
import { timeline, totalDurationMs } from "../scenes";
import { policy } from "@/seed/astro";
import { loadPolicy } from "@/components/workspace/rules";

const end = (p = policy) => stateAt(totalDurationMs, timeline, p);

describe("the story follows your rules", () => {
  it("Astro's own rules play the whole story with no stop", () => {
    expect(end().halted).toBeNull();
    expect(end().escrow?.releasedCents).toBe(3_420_000);
  });
  it("a 2% price limit stops PO 1042 before any money is committed", () => {
    const s = end({ ...policy, priceChangeLimitBps: 200 });
    expect(s.halted?.reason).toBe("Haoyun's price change of +2.5% is over your 2% limit. The PO stops before any money is committed.");
    expect(s.escrow).toBeNull();
    expect(s.halted?.scene).toBe(6);
  });
  it("3 approvers stops it at the confirmation, with 2 signed", () => {
    const s = end({ ...policy, approversRequired: 3 });
    expect(s.requiredApprovals).toBe(3);
    expect(s.halted?.reason).toBe("Your rules need 3 approvals for PO 1042; it has 2. Nothing is committed.");
    expect(s.escrow).toBeNull();
  });
  it("a motor price cap below Haoyun's quote means no supplier passes, and sourcing stops", () => {
    const s = end({ ...policy, priceCaps: { ...policy.priceCaps, "Actuator motor": 1800 } });
    expect(s.halted?.reason).toMatch(/^No supplier passes your rules \(motor price cap \$18\)/);
    expect(s.stage).toBe("sourcing");
  });
  it("a cap below the routine reorder holds it for a person, without stopping PO 1042", () => {
    const s = stateAt(sceneStartMs(3), timeline, { ...policy, autoApproveUnderCents: 100_000 });
    expect(s.routine.held).toBe("Under your rules this $5,562 reorder needs approval, so it waits for a person.");
    expect(end({ ...policy, autoApproveUnderCents: 100_000 }).halted).toBeNull();
  });
  it("reads saved rules safely: malformed or out of range values fall back or clamp", () => {
    expect(loadPolicy("not json")).toEqual(policy);
    expect(loadPolicy(JSON.stringify({ approversRequired: 9, priceChangeLimitBps: 150 }))).toMatchObject({ approversRequired: 3, priceChangeLimitBps: 150, autoApproveUnderCents: policy.autoApproveUnderCents });
  });
});
