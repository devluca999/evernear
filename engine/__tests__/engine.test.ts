import { describe, expect, it } from "vitest";
import { plainEngine as e } from "../plain";
import {
  requiredApprovals, canLockFunds, checkPriceChange, priceChangeBps,
} from "../policy";
import { createEscrow, release, reclaimHeld, refundOnDeadline } from "../escrow";
import { cents, formatUsd, scaleTestnet } from "../money";
import { astro, bom10MA, suppliers, offers, policy, PO } from "../../seed/astro";

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
  it("has five suppliers and Huaxin offers 11 of 14 lines", () => {
    expect(suppliers).toHaveLength(5);
    expect(offersOf("Huaxin")).toHaveLength(11);
  });
  it("is Astro's company", () => {
    expect(astro.name).toBe("Astro Robotics Inc.");
  });
});

describe("fitment", () => {
  it("Kansai fails on the 8 mm shaft only", () => {
    const r = e.scoreFitment(bom10MA, offersOf("Kansai"), sup("Kansai"), policy);
    expect(r.pass).toBe(false);
    expect(r.mismatches).toEqual([
      { line: "Actuator motor", spec: "shaftDiameter", required: "6 mm", offered: "8 mm" },
    ]);
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
  it("$38K from a new supplier needs 2 approvals and cannot lock before them", () => {
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
    expect(orig).toBe(1854);
    expect(PO.confirmedUnitCents).toBe(2002);
    expect(PO.revisedUnitCents).toBe(1900);
    expect(PO.revisedTotalCents).toBe(cents(38000));
  });
  it("+8% stops", () => {
    expect(checkPriceChange(orig, 2002, policy.priceChangeLimitBps).pass).toBe(false);
    expect(Math.round(priceChangeBps(orig, 2002) / 100)).toBe(8);
  });
  it("+2.5% passes", () => {
    expect(checkPriceChange(orig, 1900, policy.priceChangeLimitBps).pass).toBe(true);
    expect(Math.round(priceChangeBps(orig, 1900) / 10)).toBe(25);
  });
  it("+4% would not pass", () => {
    const four = Math.round(orig * 1.04);
    expect(checkPriceChange(orig, four, policy.priceChangeLimitBps).pass).toBe(false);
  });
});

describe("short shipment", () => {
  it("1,800 of 2,000 releases exactly $34,200 and holds $3,800", () => {
    const m = e.matchReceipt({ orderedQty: 2000, receivedQty: 1800, unitCents: 1900 });
    expect(m.releaseCents).toBe(cents(34200));
    expect(m.holdCents).toBe(cents(3800));
    expect(formatUsd(m.releaseCents)).toBe("$34,200.00");
  });
  it("never releases more than ordered", () => {
    const m = e.matchReceipt({ orderedQty: 2000, receivedQty: 2100, unitCents: 1900 });
    expect(m.releaseCents).toBe(cents(38000));
    expect(m.holdCents).toBe(0);
  });
  it("testnet runs at 1:1,000: $38.00 committed, $34.20 paid, $3.80 back", () => {
    expect(scaleTestnet(cents(38000))).toBe(3800);
    expect(scaleTestnet(cents(34200))).toBe(3420);
    expect(scaleTestnet(cents(3800))).toBe(380);
  });
});

describe("three exits", () => {
  const parties = { supplier: "haoyun.testnet", owner: "astro.testnet" };
  const fresh = () => createEscrow({ ...parties, lockedCents: cents(38000), deadlineMs: 1000 });

  it("releases to the supplier", () => {
    const r = release(fresh(), { to: "haoyun.testnet", amountCents: cents(34200), nowMs: 10 });
    expect(r.ok).toBe(true);
  });
  it("refuses a release to any other address", () => {
    const r = release(fresh(), { to: "mallory.testnet", amountCents: cents(34200), nowMs: 10 });
    expect(r).toMatchObject({ ok: false, reason: "address_not_allowed" });
  });
  it("lets Astro reclaim the held part after a partial release", () => {
    const after = release(fresh(), { to: "haoyun.testnet", amountCents: cents(34200), nowMs: 10 });
    if (!after.ok) throw new Error("release failed");
    const r = reclaimHeld(after.escrow, { to: "astro.testnet", nowMs: 20 });
    expect(r.ok && r.amountCents).toBe(cents(3800));
    const bad = reclaimHeld(after.escrow, { to: "haoyun.testnet", nowMs: 20 });
    expect(bad.ok).toBe(false);
  });
  it("refunds Astro in full if nothing is released by the deadline", () => {
    expect(refundOnDeadline(fresh(), { nowMs: 999 }).ok).toBe(false);
    const r = refundOnDeadline(fresh(), { nowMs: 1001 });
    expect(r.ok && r.to).toBe("astro.testnet");
    expect(r.ok && r.amountCents).toBe(cents(38000));
  });
  it("refuses a release after the deadline", () => {
    const r = release(fresh(), { to: "haoyun.testnet", amountCents: 1, nowMs: 1001 });
    expect(r).toMatchObject({ ok: false, reason: "past_deadline" });
  });
});

describe("reading replies and documents", () => {
  it("sorts replies into quoted, confirmed and price change", () => {
    expect(e.classifyReply("Our quote: USD 18.54 per unit, MOQ 500.")).toBe("quoted");
    expect(e.classifyReply("We confirm PO 1042 at USD 18.54 per unit.")).toBe("confirmed");
    expect(e.classifyReply("Due to copper costs the unit price is now USD 20.02.")).toBe("price_change");
  });
  it("reads a packing slip quantity", () => {
    const d = e.readDocument({ kind: "packing_slip", text: "PO: 1042\nQuantity shipped: 1,800\nOrdered: 2,000" });
    expect(d).toMatchObject({ kind: "packing_slip", po: "1042", quantity: 1800, ordered: 2000 });
  });
});
