// The causal chain, checked end to end for any order: negotiated offer -> PO plan (engine/order.ts) ->
// signed commit terms (convex/approvalTerms.ts) -> release amounts in the server's rules
// (engine/escrow.ts) and in the release gate (engine/releaseGate.ts, the worker's twin) -> what returns
// to the buyer. Change the quantity, the price or the count at the dock and every layer moves together.
import { describe, expect, it } from "vitest";
import { buildPurchaseOrder, settlementPlan } from "@/engine/order";
import { createEscrow, releaseStage, reclaimHeld, balance, type SignalId } from "@/engine/escrow";
import { gateDecide } from "@/engine/releaseGate";
import { commitTerms, UNIT_CENTS, liveTerms } from "@/convex/approvalTerms";
import { termsDigest } from "@/engine/approvals";
import { haoyunReplyTo, MAILBOX, counterPriceCents } from "@/scenarios/suppliers";
import { MOTOR_BASE_CENTS, PO, policy, suppliers } from "@/seed/astro";

const HAOYUN = suppliers.find((s) => s.id === "haoyun")!;
const ALL: SignalId[] = ["bill_of_lading", "export_cleared", "import_cleared", "dock_count"];
function rng(seed: number) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; }; }

describe("order pipeline: one negotiated offer, every layer agrees", () => {
  it("the live run's unit prices are what the negotiation simulator agrees to, not separate constants", () => {
    const priceOf = (counterUsd: string) => counterPriceCents(haoyunReplyTo({ to: MAILBOX.haoyun, body: `Counter: USD ${counterUsd} per unit` })!.text);
    expect(priceOf("1260.00")).toBe(UNIT_CENTS.happy); // a counter inside the 5% ceiling: Haoyun agrees at $1,260
    expect(priceOf("1300.00")).toBe(UNIT_CENTS.adjusted); // a counter over the ceiling: Haoyun holds at $1,320
  });

  it("the canonical order: 50 x $1,260, 44 arrive -> $18,900 + $36,540 paid, $7,560 back; signed terms carry it", () => {
    const plan = buildPurchaseOrder({ supplier: HAOYUN, part: "Actuator motor", quantity: 50, unitCents: 126_000, baseUnitCents: MOTOR_BASE_CENTS }, policy);
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.po).toMatchObject({ totalCents: 6_300_000, advanceCents: 1_890_000, priceChangeBps: 500, withinCeiling: true, approvalsRequired: 2 });
    expect(settlementPlan(plan.po, 44)).toEqual({ receivedQty: 44, advanceCents: 1_890_000, balanceCents: 3_654_000, paidCents: 5_544_000, returnedCents: 756_000 });
    expect(liveTerms("happy")).toMatchObject({ totalCents: 6_300_000, priceChangeBps: 500, withinCeiling: true, approvalsRequired: 2 });
    expect(liveTerms("adjusted")).toMatchObject({ totalCents: 6_600_000, priceChangeBps: 1000, withinCeiling: false, approvalsRequired: 2 });
  });

  it("for 1,000 random orders, the plan, the signed terms, the server's release rules and the gate agree to the cent", () => {
    for (let seed = 1; seed <= 1_000; seed++) {
      const r = rng(seed);
      const quantity = 1 + Math.floor(r() * 400);
      const unitCents = (1 + Math.floor(r() * 3_000)) * 100; // whole dollars keep the 30% advance exact
      const received = Math.floor(r() * (quantity + 1));
      const plan = buildPurchaseOrder({ supplier: HAOYUN, part: "Actuator motor", quantity, unitCents, baseUnitCents: MOTOR_BASE_CENTS }, policy);
      if (!plan.ok) throw new Error(`${seed}: ${plan.reason}`);
      const want = settlementPlan(plan.po, received)!;
      // Signed terms: same total and approvals; a different quantity or price is a different digest.
      const terms = commitTerms({ po: PO.number, supplierAddress: HAOYUN.receiveAddress, quantity, unitCents })!;
      expect(terms.totalCents).toBe(plan.po.totalCents);
      expect(terms.approvalsRequired).toBe(plan.po.approvalsRequired);
      if (quantity > 1) expect(termsDigest(commitTerms({ po: PO.number, supplierAddress: HAOYUN.receiveAddress, quantity: quantity - 1, unitCents })!)).not.toBe(termsDigest(terms));
      // Server rules.
      let e = createEscrow({ supplier: HAOYUN.receiveAddress, owner: "astro", lockedCents: plan.po.totalCents, deadlineMs: 1e15 });
      const adv = releaseStage(e, { stage: "advance", to: HAOYUN.receiveAddress, signals: ALL, unitCents, nowMs: 1 });
      if (!adv.ok) throw new Error(`${seed}: ${adv.reason}`);
      expect(adv.amountCents).toBe(want.advanceCents);
      e = adv.escrow;
      const bal = releaseStage(e, { stage: "balance", to: HAOYUN.receiveAddress, signals: ALL, unitCents, receivedQty: received, nowMs: 2 });
      expect(bal.ok ? bal.amountCents : 0).toBe(want.balanceCents);
      if (bal.ok) e = bal.escrow;
      const back = balance(e) > 0 ? reclaimHeld(e, { to: "astro", nowMs: 3 }) : null;
      expect(back && back.ok ? back.amountCents : 0).toBe(want.returnedCents);
      // Release gate (the worker's twin) on the same input.
      const signals = { bill_of_lading: { id: "b", at: "x" }, export_cleared: { id: "e", at: "x" }, import_cleared: { id: "i", at: "x" }, dock_count: { id: "d", at: "x", count: received } };
      const base = { mode: "release" as const, po: PO.number, agent_id: "agent_x1", to: HAOYUN.receiveAddress, unit_cents: unitCents, ordered_qty: quantity, locked_cents: plan.po.totalCents, advance_percent: 30, signals };
      const gAdv = gateDecide({ ...base, stage: "advance", released_cents: 0 });
      expect(gAdv.ok && gAdv.amount_cents).toBe(want.advanceCents);
      const gBal = gateDecide({ ...base, stage: "balance", released_cents: want.advanceCents, received_qty: received });
      expect(gBal.ok ? gBal.amount_cents : 0).toBe(want.balanceCents);
      // Conservation.
      expect(want.advanceCents + want.balanceCents + want.returnedCents).toBe(plan.po.totalCents);
    }
  });
});
