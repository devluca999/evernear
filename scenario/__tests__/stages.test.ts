import { describe, expect, it } from "vitest";
import { STAGES, RAIL, advance } from "../stages";

describe("stage machine", () => {
  it("has the nine stages in order and an eight step rail", () => {
    expect(STAGES).toEqual(["low", "sourcing", "approval", "confirmed", "funds_locked", "shipped", "dock", "paid", "closed"]);
    expect(RAIL.map((r) => r.label)).toEqual(["Low", "Sourcing", "Approval", "Confirmed", "Funds locked", "Shipped", "Dock", "Paid"]);
  });
  it("moves forward one step at a time only", () => {
    expect(advance("low", "sourcing", {}).ok).toBe(true);
    expect(advance("low", "approval", {}).ok).toBe(false);
    expect(advance("sourcing", "low", {}).ok).toBe(false);
  });
  it("cannot confirm before the approvals are in", () => {
    expect(advance("approval", "confirmed", { approvals: 1, requiredApprovals: 2 })).toMatchObject({ ok: false, reason: "approvals_missing" });
    expect(advance("approval", "confirmed", { approvals: 2, requiredApprovals: 2 }).ok).toBe(true);
  });
  it("cannot lock funds while the price change is over the limit", () => {
    expect(advance("confirmed", "funds_locked", { priceOk: false })).toMatchObject({ ok: false, reason: "price_over_limit" });
    expect(advance("confirmed", "funds_locked", { priceOk: true }).ok).toBe(true);
  });
  it("cannot pay before the dock check", () => {
    expect(advance("dock", "paid", {})).toMatchObject({ ok: false, reason: "dock_check_missing" });
    expect(advance("dock", "paid", { dockChecked: true }).ok).toBe(true);
  });
});
