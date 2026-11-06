// Per-PO escrow rules. Exactly three exits: release to the supplier,
// reclaim of the held part by the owner, and a full refund to the owner at the deadline.
// Two-stage release (policy/astro.json): an advance once the goods have left (bill of lading AND
// export clearance), then the balance once they are here (import customs AND the attested dock
// count), computed as received x unit price minus what was already released. A release with a
// missing signal is refused. Lifecycle: created, funded, advance released, balance released,
// settled (nothing left), closed (frozen, the agent's grant revoked, kept as the order's receipt).
// A wallet serves one order and is never reused.
import rules from "../policy/astro.json";
// Honest limit: the owner can always change policy or withdraw on the real wallet.
// This models the rules the wallet policy enforces, not a lock the supplier can enforce.

export type Lifecycle = "created" | "funded" | "advance_released" | "balance_released" | "settled" | "closed";
export const LIFECYCLE: Lifecycle[] = ["created", "funded", "advance_released", "balance_released", "settled", "closed"];

/** The signals a release waits for, each checked by code and recorded as a proof. */
export type SignalId = "bill_of_lading" | "export_cleared" | "import_cleared" | "dock_count";
export type Stage = "advance" | "balance";
export interface ReleaseRules { advancePercent: number; requires: Record<Stage, SignalId[]> }
export const RELEASE_RULES: ReleaseRules = {
  advancePercent: rules.escrow.advance_percent,
  requires: { advance: rules.escrow.releases.advance.requires as SignalId[], balance: rules.escrow.releases.balance.requires as SignalId[] },
};

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

export type Refusal = { ok: false; reason: "address_not_allowed" | "past_deadline" | "over_balance" | "closed" | "not_due" | "missing_signal" | "already_released" | "nothing_due" | "not_exact"; missing?: SignalId[] };

export function createEscrow(i: { supplier: string; owner: string; lockedCents: number; deadlineMs: number }): Escrow {
  return { ...i, releasedCents: 0, reclaimedCents: 0, closed: false, lifecycle: i.lockedCents > 0 ? "funded" : "created" };
}

/** Where the money stands after a release: settled once nothing is left, else advance or balance released. */
const after = (e: Escrow, prev: Lifecycle): Lifecycle => (balance(e) <= 0 ? "settled" : prev === "funded" ? "advance_released" : "balance_released");

export const balance = (e: Escrow) => e.lockedCents - e.releasedCents - e.reclaimedCents;

export function release(e: Escrow, r: { to: string; amountCents: number; nowMs: number }):
  { ok: true; escrow: Escrow } | Refusal {
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.to !== e.supplier) return { ok: false, reason: "address_not_allowed" };
  if (r.nowMs > e.deadlineMs) return { ok: false, reason: "past_deadline" };
  if (r.amountCents <= 0 || r.amountCents > balance(e)) return { ok: false, reason: "over_balance" };
  const next = { ...e, releasedCents: e.releasedCents + r.amountCents };
  return { ok: true, escrow: { ...next, lifecycle: after(next, e.lifecycle) } };
}

/**
 * One stage of the two-stage release, amount computed here: the advance is a fixed share of the
 * committed total; the balance is what arrived times the unit price, minus what was already
 * released. Refused when a required signal is missing (the refusal names them), and never more
 * than the wallet holds.
 */
export function releaseStage(e: Escrow, r: { stage: Stage; to: string; signals: SignalId[]; unitCents: number; receivedQty?: number; nowMs: number; rules?: ReleaseRules }):
  { ok: true; escrow: Escrow; amountCents: number } | Refusal {
  const R = r.rules ?? RELEASE_RULES;
  if (e.closed) return { ok: false, reason: "closed" };
  if (r.to !== e.supplier) return { ok: false, reason: "address_not_allowed" };
  if (r.nowMs > e.deadlineMs) return { ok: false, reason: "past_deadline" };
  const missing = R.requires[r.stage].filter((x) => !r.signals.includes(x));
  if (missing.length) return { ok: false, reason: "missing_signal", missing };
  let amountCents: number;
  if (r.stage === "advance") {
    if (e.releasedCents > 0) return { ok: false, reason: "already_released" };
    if ((e.lockedCents * R.advancePercent) % 100 !== 0) return { ok: false, reason: "not_exact" };
    amountCents = (e.lockedCents * R.advancePercent) / 100;
  } else {
    amountCents = (r.receivedQty ?? 0) * r.unitCents - e.releasedCents;
    if (amountCents <= 0) return { ok: false, reason: "nothing_due" };
  }
  if (amountCents > balance(e)) return { ok: false, reason: "over_balance" };
  const next = { ...e, releasedCents: e.releasedCents + amountCents };
  return { ok: true, amountCents, escrow: { ...next, lifecycle: balance(next) <= 0 ? "settled" : r.stage === "advance" ? "advance_released" : "balance_released" } };
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
