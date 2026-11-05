import type { Policy, Supplier } from "./types";

export interface OrderForApproval {
  totalCents: number;
  supplier: Pick<Supplier, "isNew" | "approved">;
}

export function requiredApprovals(order: OrderForApproval, policy: Policy): number {
  const overCap = order.totalCents >= policy.autoApproveUnderCents;
  return overCap || order.supplier.isNew ? policy.approversRequired : 0;
}

export function canLockFunds(order: OrderForApproval, approvals: number, policy: Policy): boolean {
  if (!order.supplier.approved) return false;
  return approvals >= requiredApprovals(order, policy);
}

/** Price change in basis points, rounded to the nearest point. */
export function priceChangeBps(originalCents: number, newCents: number): number {
  return Math.round(((newCents - originalCents) * 10_000) / originalCents);
}

export function checkPriceChange(originalCents: number, newCents: number, limitBps: number) {
  const bps = priceChangeBps(originalCents, newCents);
  return { pass: bps <= limitBps, bps };
}
