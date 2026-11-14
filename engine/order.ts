// From an accepted supplier offer to a purchase order and its settlement plan: the one place where the
// commercial outcome of the negotiation becomes the numbers money moves on. Pure, integer cents.
// convex/approvalTerms.ts builds the signed commit terms from this, engine/escrow.ts releaseStage and
// the release gate compute the same amounts (tests/orderPipeline.test.ts checks they agree for any order).
import { checkPriceChange, requiredApprovals } from "./policy";
import { RELEASE_RULES, type ReleaseRules } from "./escrow";
import type { Policy, Supplier } from "./types";

export interface AcceptedOffer {
  supplier: Pick<Supplier, "id" | "approved" | "isNew" | "receiveAddress" | "receiveChain">;
  part: string;
  quantity: number;
  unitCents: number;
  /** The part's usual price, to measure the urgent premium against the buyer's ceiling. */
  baseUnitCents: number;
}

export interface PurchaseOrderPlan {
  quantity: number;
  unitCents: number;
  totalCents: number;
  /** Premium over the usual price, basis points, and whether it is inside the buyer's ceiling. */
  priceChangeBps: number;
  withinCeiling: boolean;
  approvalsRequired: number;
  advanceCents: number;
}

export type OrderRefusal = "supplier_not_approved" | "bad_quantity" | "bad_price" | "advance_not_exact";

export function buildPurchaseOrder(o: AcceptedOffer, policy: Policy, rules: ReleaseRules = RELEASE_RULES): { ok: true; po: PurchaseOrderPlan } | { ok: false; reason: OrderRefusal } {
  if (!o.supplier.approved) return { ok: false, reason: "supplier_not_approved" };
  if (!Number.isSafeInteger(o.quantity) || o.quantity <= 0) return { ok: false, reason: "bad_quantity" };
  if (!Number.isSafeInteger(o.unitCents) || o.unitCents <= 0 || !Number.isSafeInteger(o.baseUnitCents) || o.baseUnitCents <= 0) return { ok: false, reason: "bad_price" };
  const totalCents = o.quantity * o.unitCents;
  if (!Number.isSafeInteger(totalCents)) return { ok: false, reason: "bad_price" };
  if ((totalCents * rules.advancePercent) % 100 !== 0) return { ok: false, reason: "advance_not_exact" };
  const change = checkPriceChange(o.baseUnitCents, o.unitCents, policy.priceChangeLimitBps);
  return { ok: true, po: {
    quantity: o.quantity, unitCents: o.unitCents, totalCents, priceChangeBps: change.bps, withinCeiling: change.pass,
    // Over the ceiling still needs the approvers (the buyer's exception), never fewer.
    approvalsRequired: Math.max(requiredApprovals({ totalCents, supplier: o.supplier }, policy), change.pass ? 0 : policy.approversRequired),
    advanceCents: (totalCents * rules.advancePercent) / 100,
  } };
}

/** What a delivery of `receivedQty` settles to: paid in all, the balance after the advance, and what returns to the buyer. */
export function settlementPlan(po: Pick<PurchaseOrderPlan, "quantity" | "unitCents" | "totalCents" | "advanceCents">, receivedQty: number) {
  if (!Number.isSafeInteger(receivedQty) || receivedQty < 0 || receivedQty > po.quantity) return null;
  const paidCents = Math.max(receivedQty * po.unitCents, po.advanceCents);
  return { receivedQty, advanceCents: po.advanceCents, balanceCents: paidCents - po.advanceCents, paidCents, returnedCents: po.totalCents - paidCents };
}
