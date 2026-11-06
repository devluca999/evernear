// Per-PO escrow rules. Exactly three exits: release to the supplier,
// reclaim of the held part by the owner, and a full refund to the owner at the deadline.
// Lifecycle: created, funded, partly released, settled (nothing left), closed (frozen, the agent's
// grant revoked, kept as the order's receipt). A wallet serves one order and is never reused.
// Honest limit: the owner can always change policy or withdraw on the real wallet.
// This models the rules the wallet policy enforces, not a lock the supplier can enforce.

export type Lifecycle = "created" | "funded" | "partly_released" | "settled" | "closed";
export const LIFECYCLE: Lifecycle[] = ["created", "funded", "partly_released", "settled", "closed"];

export interface Escrow {
  supplier: string;
  owner: string;
  lockedCents: number;
  releasedCents: number;
  reclaimedCents: number;
  deadlineMs: number;
  closed: boolean;
  lifecycle: Lifecycle;
}

export type Refusal = { ok: false; reason: "address_not_allowed" | "past_deadline" | "over_balance" | "closed" | "not_due" };

export function createEscrow(i: { supplier: string; owner: string; lockedCents: number; deadlineMs: number }): Escrow {
  return { ...i, releasedCents: 0, reclaimedCents: 0, closed: false, lifecycle: i.lockedCents > 0 ? "funded" : "created" };
}

/** Where the money stands after a move: settled once nothing is left, else partly released. */
const after = (e: Escrow): Lifecycle => (balance(e) <= 0 ? "settled" : "partly_released");

export const balance = (e: Escrow) => e.lockedCents - e.releasedCents - e.reclaimedCents;

export function release(e: Escrow, r: { to: string; amountCents: number; nowMs: number }):
  { ok: true; escrow: Escrow } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.to !== e.supplier) return { ok: false, reason: "address_not_allowed" };
  if (r.nowMs > e.deadlineMs) return { ok: false, reason: "past_deadline" };
  if (r.amountCents <= 0 || r.amountCents > balance(e)) return { ok: false, reason: "over_balance" };
  const next = { ...e, releasedCents: e.releasedCents + r.amountCents };
  return { ok: true, escrow: { ...next, lifecycle: after(next) } };
}

export function reclaimHeld(e: Escrow, r: { to: string; nowMs: number }):
  { ok: true; escrow: Escrow; amountCents: number } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.to !== e.owner) return { ok: false, reason: "address_not_allowed" };
  if (e.releasedCents === 0) return { ok: false, reason: "not_due" };
  const amountCents = balance(e);
  return { ok: true, amountCents, escrow: { ...e, reclaimedCents: e.reclaimedCents + amountCents, closed: true, lifecycle: "settled" } };
}

export function refundOnDeadline(e: Escrow, r: { nowMs: number }):
  { ok: true; escrow: Escrow; amountCents: number; to: string } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.nowMs <= e.deadlineMs) return { ok: false, reason: "not_due" };
  const amountCents = balance(e);
  return { ok: true, to: e.owner, amountCents, escrow: { ...e, reclaimedCents: e.reclaimedCents + amountCents, closed: true, lifecycle: "settled" } };
}

/**
 * Closing the order's wallet: only once settled (nothing left in it). It is frozen and the agent's
 * grant revoked; every later move is refused (`closed`), and it is never reused for another order.
 */
export function closeWallet(e: Escrow): { ok: true; escrow: Escrow } | { ok: false; reason: "not_settled" | "closed" } {
  if (e.lifecycle === "closed") return { ok: false, reason: "closed" };
  if (balance(e) > 0) return { ok: false, reason: "not_settled" };
  return { ok: true, escrow: { ...e, closed: true, lifecycle: "closed" } };
}
