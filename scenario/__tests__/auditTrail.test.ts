import { describe, expect, it } from "vitest";
import { auditTrail } from "../auditTrail";

describe("audit trail", () => {
  it("has the 15 events in order, the outcome reconciles, and every on-chain event carries its real tx", () => {
    const { events, summary } = auditTrail();
    expect(events).toHaveLength(15);
    expect(summary).toEqual({ committedCents: 6_300_000, paidCents: 5_544_000, returnedCents: 756_000, orderedQty: 50, receivedQty: 44, reconciled: true });
    for (const e of events.filter((x) => x.status === "verified on chain" && x.n < 15)) expect(e.tx?.hash, e.title).toMatch(/^(0x[0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{43,44})$/);
    expect(events.map((e) => e.amountCents).filter((x) => x !== null)).toEqual(expect.arrayContaining([6_300_000, 1_890_000, 3_654_000, 756_000]));
    // Nothing simulated is labelled as verified.
    expect(events.filter((e) => /simulated/i.test(e.actor)).every((e) => e.status !== "verified on chain")).toBe(true);
  });
});
