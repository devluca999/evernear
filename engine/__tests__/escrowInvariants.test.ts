// Property-style test of the escrow state machine: thousands of seeded random sequences of
// releases, reclaims, refunds, closes and bad inputs, checking after every step that money is
// conserved, never negative, never above the commitment, and that refusals change nothing.
import { describe, expect, it } from "vitest";
import { balance, closeWallet, createEscrow, reclaimHeld, refundOnDeadline, releaseStage, type Escrow, type SignalId } from "../escrow";

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}
const SUPPLIER = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0", OWNER = "astro";
const ALL: SignalId[] = ["bill_of_lading", "export_cleared", "import_cleared", "dock_count"];
const QTYS = [0, 1, 6, 44, 50, 51, -1, 44.5, Number.NaN, Number.POSITIVE_INFINITY, 1e15];

function invariant(e: Escrow, locked: number) {
  expect(e.lockedCents).toBe(locked);
  expect(e.releasedCents).toBeGreaterThanOrEqual(0);
  expect(e.reclaimedCents).toBeGreaterThanOrEqual(0);
  expect(balance(e)).toBeGreaterThanOrEqual(0);
  expect(e.releasedCents + e.reclaimedCents + balance(e)).toBe(locked);
  for (const v of [e.releasedCents, e.reclaimedCents]) expect(Number.isSafeInteger(v)).toBe(true);
}

describe("escrow invariants under random sequences", () => {
  it("released + reclaimed + held = committed, nothing negative, refusals change nothing (2,000 runs)", () => {
    for (let seed = 1; seed <= 2_000; seed++) {
      const r = rng(seed);
      const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
      const unit = pick([126_000, 132_000, 1_900, 3]);
      const qty = pick([50, 1, 220]);
      const locked = unit * qty;
      let e = createEscrow({ supplier: SUPPLIER, owner: OWNER, lockedCents: locked, deadlineMs: 1_000 });
      let paidAdvance = 0;
      for (let step = 0; step < 8; step++) {
        const before = { ...e };
        const now = pick([10, 10, 10, 2_000]);
        const op = pick(["advance", "balance", "balance", "reclaim", "refund", "close", "wrongTo"]);
        const signals = ALL.filter(() => r() > 0.2);
        let res: { ok: boolean; escrow?: Escrow };
        if (op === "advance" || op === "balance" || op === "wrongTo") {
          res = releaseStage(e, { stage: op === "advance" ? "advance" : "balance", to: op === "wrongTo" ? "0xdead" : SUPPLIER, signals, unitCents: unit, receivedQty: pick(QTYS), nowMs: now });
          if (res.ok && op === "advance") paidAdvance++;
        } else if (op === "reclaim") res = reclaimHeld(e, { to: pick([OWNER, SUPPLIER]), nowMs: now });
        else if (op === "refund") res = refundOnDeadline(e, { nowMs: now });
        else res = closeWallet(e);
        if (res.ok) e = res.escrow!;
        else expect(e).toEqual(before);
        invariant(e, locked);
        expect(paidAdvance).toBeLessThanOrEqual(1);
        // Never paid to the supplier more than the units that could have arrived.
        expect(e.releasedCents).toBeLessThanOrEqual(locked);
      }
    }
  });
  it("refuses fractional, negative, NaN and over-ordered counts instead of rounding", () => {
    const e = { ...createEscrow({ supplier: SUPPLIER, owner: OWNER, lockedCents: 6_300_000, deadlineMs: 1_000 }), releasedCents: 1_890_000, lifecycle: "advance_released" as const };
    for (const q of [44.5, -1, Number.NaN, 51, Number.POSITIVE_INFINITY]) {
      expect(releaseStage(e, { stage: "balance", to: SUPPLIER, signals: ALL, unitCents: 126_000, receivedQty: q, nowMs: 10 })).toMatchObject({ ok: false, reason: "bad_quantity" });
    }
    expect(releaseStage(e, { stage: "balance", to: SUPPLIER, signals: ALL, unitCents: 126_000, receivedQty: 44, nowMs: 10 })).toMatchObject({ ok: true, amountCents: 3_654_000 });
  });
});
