import { describe, expect, it } from "vitest";
import { plainEngine as e } from "../plain";
import {
  requiredApprovals, canLockFunds, checkPriceChange, priceChangeBps,
} from "../policy";
import { createEscrow, release, reclaimHeld, refundOnDeadline } from "../escrow";
import { cents, formatUsd, scaleTestnet } from "../money";
import { astro, bom10MA, suppliers, offers, policy, PO, NEED_BY } from "../../seed/astro";

const motorLine = bom10MA.find((l) => l.part === "Actuator motor")!;
const sup = (name: string) => suppliers.find((s) => s.name.startsWith(name))!;
const offersOf = (name: string) => offers.filter((o) => o.supplierId === sup(name).id);

describe("seed data", () => {
  it("has the 10MA with exactly 14 BOM lines", () => {
    expect(bom10MA).toHaveLength(14);
    expect(motorLine.specs).toEqual({
      shaftDiameter: "6 mm", mountingFlange: "NEMA 17", voltage: "48 V", encoderConnector: "Molex",
    });
  });
  it("has six suppliers and Huaxin offers 11 of 14 lines", () => {
    expect(suppliers).toHaveLength(6);
    expect(offersOf("Huaxin")).toHaveLength(11);
  });
  it("is Astro's company", () => {
    expect(astro.name).toBe("Astro Robotics Inc.");
  });
});

describe("fitment", () => {
  it("Kansai fits every spec but cannot deliver before Dec 14", () => {
    const r = e.scoreFitment(bom10MA, offersOf("Kansai"), sup("Kansai"), policy, NEED_BY);
    expect(r.pass).toBe(false);
    expect(r.mismatches).toEqual([]);
    expect(r.policyFailures).toEqual(["too_late"]);
  });
  it("Rheinwerk fits every spec but fails policy: not approved, 2.4x cap", () => {
    const r = e.scoreFitment(bom10MA, offersOf("Rheinwerk"), sup("Rheinwerk"), policy);
    expect(r.mismatches).toEqual([]);
    expect(r.pass).toBe(false);
    expect(r.policyFailures).toEqual(["not_approved", "over_price_cap"]);
    expect(r.priceCapMultiple).toBe(2.4);
  });
  it("Huaxin fails exactly 3 lines with the exact specs", () => {
    const r = e.scoreFitment(bom10MA, offersOf("Huaxin"), sup("Huaxin"), policy);
    expect(r.pass).toBe(false);
    expect(new Set(r.mismatches.map((m) => m.line)).size).toBe(3);
    expect(r.mismatches.map((m) => m.offered).sort()).toEqual(["36 V", "JST-GH", "NEMA 23"]);
    expect(r.linesOffered).toBe(11);
  });
  it("Haoyun passes", () => {
    const r = e.scoreFitment(bom10MA, offersOf("Haoyun"), sup("Haoyun"), policy);
    expect(r).toMatchObject({ pass: true, mismatches: [], policyFailures: [] });
  });
});

describe("approvals", () => {
  it("routine reorder under the cap with a known supplier needs no human", () => {
    expect(requiredApprovals({ totalCents: cents(5562), supplier: sup("Ultra") }, policy)).toBe(0);
  });
  it("$63K from a new supplier needs 2 approvals and cannot lock before them", () => {
    const order = { totalCents: PO.revisedTotalCents, supplier: sup("Haoyun") };
    expect(requiredApprovals(order, policy)).toBe(2);
    expect(canLockFunds(order, 0, policy)).toBe(false);
    expect(canLockFunds(order, 1, policy)).toBe(false);
    expect(canLockFunds(order, 2, policy)).toBe(true);
  });
});

describe("price limit", () => {
  const orig = PO.originalUnitCents;
  it("uses the exact quote numbers", () => {
    expect(orig).toBe(120_000);
    expect(PO.confirmedUnitCents).toBe(132_000);
    expect(PO.revisedUnitCents).toBe(126_000);
    expect(PO.revisedTotalCents).toBe(cents(63000));
    expect(PO.quantity).toBe(50);
  });
  it("+10% stops", () => {
    expect(checkPriceChange(orig, 132_000, policy.priceChangeLimitBps).pass).toBe(false);
    expect(priceChangeBps(orig, 132_000)).toBe(1000);
  });
  it("+5% passes: the urgent ceiling", () => {
    expect(checkPriceChange(orig, 126_000, policy.priceChangeLimitBps).pass).toBe(true);
    expect(priceChangeBps(orig, 126_000)).toBe(500);
  });
  it("+6% would not pass", () => {
    expect(checkPriceChange(orig, Math.round(orig * 1.06), policy.priceChangeLimitBps).pass).toBe(false);
  });
});

describe("short shipment", () => {
  it("44 of 50 are worth exactly $55,440 and $7,560 is held for the 6 missing", () => {
    const m = e.matchReceipt({ orderedQty: 50, receivedQty: 44, unitCents: 126_000 });
    expect(m.releaseCents).toBe(cents(55440));
    expect(m.holdCents).toBe(cents(7560));
    expect(formatUsd(m.releaseCents)).toBe("$55,440.00");
  });
  it("never releases more than ordered", () => {
    const m = e.matchReceipt({ orderedQty: 50, receivedQty: 55, unitCents: 126_000 });
    expect(m.releaseCents).toBe(cents(63000));
    expect(m.holdCents).toBe(0);
  });
  it("testnet runs at 1:1,000: $63.00 committed, $18.90 advance, $36.54 balance, $7.56 back", () => {
    expect(scaleTestnet(cents(63000))).toBe(6300);
    expect(scaleTestnet(cents(18900))).toBe(1890);
    expect(scaleTestnet(cents(36540))).toBe(3654);
    expect(scaleTestnet(cents(7560))).toBe(756);
  });
});

describe("three exits", () => {
  const parties = { supplier: "haoyun.testnet", owner: "astro.testnet" };
  const fresh = () => createEscrow({ ...parties, lockedCents: cents(63000), deadlineMs: 1000 });

  it("releases to the supplier", () => {
    const r = release(fresh(), { to: "haoyun.testnet", amountCents: cents(55440), nowMs: 10 });
    expect(r.ok).toBe(true);
  });
  it("refuses a release to any other address", () => {
    const r = release(fresh(), { to: "mallory.testnet", amountCents: cents(55440), nowMs: 10 });
    expect(r).toMatchObject({ ok: false, reason: "address_not_allowed" });
  });
  it("lets Astro reclaim the held part after a partial release", () => {
    const after = release(fresh(), { to: "haoyun.testnet", amountCents: cents(55440), nowMs: 10 });
    if (!after.ok) throw new Error("release failed");
    const r = reclaimHeld(after.escrow, { to: "astro.testnet", nowMs: 20 });
    expect(r.ok && r.amountCents).toBe(cents(7560));
    const bad = reclaimHeld(after.escrow, { to: "haoyun.testnet", nowMs: 20 });
    expect(bad.ok).toBe(false);
  });
  it("refunds Astro in full if nothing is released by the deadline", () => {
    expect(refundOnDeadline(fresh(), { nowMs: 999 }).ok).toBe(false);
    const r = refundOnDeadline(fresh(), { nowMs: 1001 });
    expect(r.ok && r.to).toBe("astro.testnet");
    expect(r.ok && r.amountCents).toBe(cents(63000));
  });
  it("refuses a release after the deadline", () => {
    const r = release(fresh(), { to: "haoyun.testnet", amountCents: 1, nowMs: 1001 });
    expect(r).toMatchObject({ ok: false, reason: "past_deadline" });
  });
});

describe("reading replies and documents", () => {
  it("sorts replies into quoted, confirmed and price change", () => {
    expect(e.classifyReply("Our quote: USD 1200.00 per unit, MOQ 10.")).toBe("quoted");
    expect(e.classifyReply("We confirm PO 1042 at USD 1260.00 per unit.")).toBe("confirmed");
    expect(e.classifyReply("Agreed: all 50 by Dec 14 at USD 1260.00 per unit for PO 1042.")).toBe("confirmed");
    expect(e.classifyReply("With the urgent fee the unit price is now USD 1320.00.")).toBe("price_change");
  });
  it("reads a packing slip quantity", () => {
    const d = e.readDocument({ kind: "packing_slip", text: "PO: 1042\nQuantity shipped: 44\nOrdered: 50" });
    expect(d).toMatchObject({ kind: "packing_slip", po: "1042", quantity: 44, ordered: 50 });
  });
});
