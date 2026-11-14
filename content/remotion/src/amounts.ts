// Pure settlement math in integer US cents. No imports, so `node --test` can load it directly.
// Mirrors engine/escrow.ts releaseStage/reclaimHeld: advance = fixed share of the committed total,
// balance = received x unit - already released, the rest returns to the buyer.

export type SettlementInput = {
  readonly orderedQty: number;
  readonly unitCents: number;
  readonly receivedQty: number;
  readonly advancePercent: number;
};

export type Settlement = {
  readonly orderedQty: number;
  readonly receivedQty: number;
  readonly missingQty: number;
  readonly unitCents: number;
  readonly orderTotalCents: number;
  readonly advanceCents: number;
  readonly deliveredValueCents: number;
  readonly balanceCents: number;
  readonly paidCents: number;
  readonly returnedCents: number;
  readonly missingValueCents: number;
};

const assertInt = (name: string, n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative safe integer, got ${n}`);
  }
};

export function computeSettlement(i: SettlementInput): Settlement {
  assertInt("orderedQty", i.orderedQty);
  assertInt("unitCents", i.unitCents);
  assertInt("receivedQty", i.receivedQty);
  assertInt("advancePercent", i.advancePercent);
  if (i.receivedQty > i.orderedQty) {
    throw new Error(`receivedQty ${i.receivedQty} exceeds orderedQty ${i.orderedQty}`);
  }
  if (i.advancePercent > 100) throw new Error("advancePercent must be <= 100");

  const orderTotalCents = i.orderedQty * i.unitCents;
  if ((orderTotalCents * i.advancePercent) % 100 !== 0) {
    // engine/escrow.ts refuses an inexact advance ("not_exact"); so do we.
    throw new Error("advance is not a whole number of cents");
  }
  const advanceCents = (orderTotalCents * i.advancePercent) / 100;
  const deliveredValueCents = i.receivedQty * i.unitCents;
  const balanceCents = Math.max(0, deliveredValueCents - advanceCents);
  const paidCents = advanceCents + balanceCents;
  const returnedCents = orderTotalCents - paidCents;
  const missingQty = i.orderedQty - i.receivedQty;

  return {
    orderedQty: i.orderedQty,
    receivedQty: i.receivedQty,
    missingQty,
    unitCents: i.unitCents,
    orderTotalCents,
    advanceCents,
    deliveredValueCents,
    balanceCents,
    paidCents,
    returnedCents,
    missingValueCents: missingQty * i.unitCents,
  };
}

/**
 * Testnet runs at 1:scale of the story amounts with 6-decimal test USDC.
 * At 1:1,000, raw units = commercial cents x 10 (payment-proofs.json "scale").
 */
export function toTestnetRaw(cents: number, scale: number): number {
  assertInt("cents", cents);
  // raw = cents / 100 dollars / scale * 1e6
  const raw = (cents * 1_000_000) / (100 * scale);
  if (!Number.isSafeInteger(raw)) throw new Error(`cents ${cents} not representable at 1:${scale}`);
  return raw;
}

/** "63.00" style test-USDC amount from raw 6-decimal units (2 decimals when exact). */
export function formatTestUsdc(raw: number): string {
  const whole = Math.floor(raw / 1_000_000);
  const frac = raw % 1_000_000;
  if (frac % 10_000 === 0) return `${whole}.${String(frac / 10_000).padStart(2, "0")}`;
  return `${whole}.${String(frac).padStart(6, "0")}`;
}

/** "$63,000" (no cents when whole) or "$1,260.50". */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = abs % 100;
  return frac === 0 ? `${sign}$${whole}` : `${sign}$${whole}.${String(frac).padStart(2, "0")}`;
}

export const formatInt = (n: number): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
