// Per-PO escrow rules. Exactly three exits: release to the supplier,
// reclaim of the held part by the owner, and a full refund to the owner at the deadline.
// Honest limit: the owner can always change policy or withdraw on the real wallet.
// This models the rules the wallet policy enforces, not a lock the supplier can enforce.

export interface Escrow {
  supplier: string;
  owner: string;
  lockedCents: number;
  releasedCents: number;
  reclaimedCents: number;
  deadlineMs: number;
  closed: boolean;
}

export type Refusal = { ok: false; reason: "address_not_allowed" | "past_deadline" | "over_balance" | "closed" | "not_due" };

export function createEscrow(i: { supplier: string; owner: string; lockedCents: number; deadlineMs: number }): Escrow {
  return { ...i, releasedCents: 0, reclaimedCents: 0, closed: false };
}

export const balance = (e: Escrow) => e.lockedCents - e.releasedCents - e.reclaimedCents;

export function release(e: Escrow, r: { to: string; amountCents: number; nowMs: number }):
  { ok: true; escrow: Escrow } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.to !== e.supplier) return { ok: false, reason: "address_not_allowed" };
  if (r.nowMs > e.deadlineMs) return { ok: false, reason: "past_deadline" };
  if (r.amountCents <= 0 || r.amountCents > balance(e)) return { ok: false, reason: "over_balance" };
  return { ok: true, escrow: { ...e, releasedCents: e.releasedCents + r.amountCents } };
}

export function reclaimHeld(e: Escrow, r: { to: string; nowMs: number }):
  { ok: true; escrow: Escrow; amountCents: number } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.to !== e.owner) return { ok: false, reason: "address_not_allowed" };
  if (e.releasedCents === 0) return { ok: false, reason: "not_due" };
  const amountCents = balance(e);
  return { ok: true, amountCents, escrow: { ...e, reclaimedCents: e.reclaimedCents + amountCents, closed: true } };
}

export function refundOnDeadline(e: Escrow, r: { nowMs: number }):
  { ok: true; escrow: Escrow; amountCents: number; to: string } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.nowMs <= e.deadlineMs) return { ok: false, reason: "not_due" };
  const amountCents = balance(e);
  return { ok: true, to: e.owner, amountCents, escrow: { ...e, reclaimedCents: e.reclaimedCents + amountCents, closed: true } };
}
