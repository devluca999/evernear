// The two-stage release (policy/astro.json): the advance once the goods have left, the balance once
// they are here and counted. Amounts exact to the cent, never above what was committed.
import { describe, expect, it } from "vitest";
import { balance, createEscrow, reclaimHeld, releaseStage, RELEASE_RULES, type Escrow, type SignalId } from "../escrow";
import { cents } from "../money";
import { PO } from "../../seed/astro";

const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const ALL: SignalId[] = ["bill_of_lading", "export_cleared", "import_cleared", "dock_count"];
const fresh = (unitCents = PO.revisedUnitCents): Escrow => createEscrow({ supplier: HAOYUN, owner: "astro", lockedCents: unitCents * PO.quantity, deadlineMs: 1_000 });
const advance = (e: Escrow, signals: SignalId[] = ALL, unitCents = PO.revisedUnitCents) => releaseStage(e, { stage: "advance", to: HAOYUN, signals, unitCents, nowMs: 1 });
const balanceOf = (e: Escrow, signals: SignalId[] = ALL, receivedQty: number = PO.receivedQty, unitCents = PO.revisedUnitCents) =>
  releaseStage(e, { stage: "balance", to: HAOYUN, signals, unitCents, receivedQty, nowMs: 2 });
const without = (s: SignalId) => ALL.filter((x) => x !== s);

describe("two-stage release rules", () => {
  it("reads the rules from policy/astro.json: 30% advance, and each stage's signals", () => {
    expect(RELEASE_RULES).toEqual({ advancePercent: 30, requires: { advance: ["bill_of_lading", "export_cleared"], balance: ["import_cleared", "dock_count"] } });
  });

  it("refuses the advance without the bill of lading", () => {
    expect(advance(fresh(), without("bill_of_lading"))).toEqual({ ok: false, reason: "missing_signal", missing: ["bill_of_lading"] });
  });
  it("refuses the advance without export clearance", () => {
    expect(advance(fresh(), without("export_cleared"))).toEqual({ ok: false, reason: "missing_signal", missing: ["export_cleared"] });
  });
  it("refuses the advance on the balance's signals alone", () => {
    expect(advance(fresh(), ["import_cleared", "dock_count"])).toMatchObject({ ok: false, missing: ["bill_of_lading", "export_cleared"] });
  });
  it("refuses the balance without import customs cleared", () => {
    const a = advance(fresh());
    if (!a.ok) throw new Error();
    expect(balanceOf(a.escrow, without("import_cleared"))).toEqual({ ok: false, reason: "missing_signal", missing: ["import_cleared"] });
  });
  it("refuses the balance without the attested dock count", () => {
    const a = advance(fresh());
    if (!a.ok) throw new Error();
    expect(balanceOf(a.escrow, without("dock_count"))).toEqual({ ok: false, reason: "missing_signal", missing: ["dock_count"] });
  });

  it("at $1,260: advance $18,900, balance 44 x $1,260 - $18,900 = $36,540, held $7,560", () => {
    const e = fresh();
    expect(e.lockedCents).toBe(cents(63_000));
    const a = advance(e);
    expect(a).toMatchObject({ ok: true, amountCents: cents(18_900), escrow: { lifecycle: "advance_released" } });
    if (!a.ok) throw new Error();
    const b = balanceOf(a.escrow);
    expect(b).toMatchObject({ ok: true, amountCents: cents(36_540), escrow: { lifecycle: "balance_released", releasedCents: cents(55_440) } });
    if (!b.ok) throw new Error();
    expect(balance(b.escrow)).toBe(cents(7_560));
    const back = reclaimHeld(b.escrow, { to: "astro", nowMs: 3 });
    expect(back).toMatchObject({ ok: true, amountCents: cents(7_560), escrow: { lifecycle: "settled" } });
  });

  it("at $1,320: advance $19,800, balance $38,280, held $7,920", () => {
    const e = fresh(132_000);
    expect(e.lockedCents).toBe(cents(66_000));
    const a = advance(e, ALL, 132_000);
    expect(a).toMatchObject({ ok: true, amountCents: cents(19_800) });
    if (!a.ok) throw new Error();
    const b = balanceOf(a.escrow, ALL, 44, 132_000);
    expect(b).toMatchObject({ ok: true, amountCents: cents(38_280) });
    if (!b.ok) throw new Error();
    expect(balance(b.escrow)).toBe(cents(7_920));
  });

  it("never releases more than the $63,000 committed, whatever arrives (sweep)", () => {
    for (let received = 0; received <= 2 * PO.quantity; received++) {
      for (const withAdvance of [true, false]) {
        let e = fresh();
        if (withAdvance) {
          const a = advance(e);
          if (!a.ok) throw new Error();
          e = a.escrow;
        }
        const b = balanceOf(e, ALL, received);
        const total = b.ok ? b.escrow.releasedCents : e.releasedCents;
        expect(total, `received ${received}`).toBeLessThanOrEqual(cents(63_000));
        if (b.ok) expect(b.escrow.releasedCents).toBe(received * PO.revisedUnitCents);
        else expect(["nothing_due", "over_balance", "bad_quantity"]).toContain(b.reason);
      }
    }
  });

  it("refuses a second advance", () => {
    const a = advance(fresh());
    if (!a.ok) throw new Error();
    expect(advance(a.escrow)).toEqual({ ok: false, reason: "already_released" });
  });

  it("refuses any address but the supplier's, before it looks at the signals", () => {
    expect(releaseStage(fresh(), { stage: "advance", to: "0x000000000000000000000000000000000000dead", signals: [], unitCents: PO.revisedUnitCents, nowMs: 1 }))
      .toEqual({ ok: false, reason: "address_not_allowed" });
  });

  it("settles when the whole order arrived, so nothing is held", () => {
    const a = advance(fresh());
    if (!a.ok) throw new Error();
    const b = balanceOf(a.escrow, ALL, PO.quantity);
    expect(b).toMatchObject({ ok: true, amountCents: cents(44_100), escrow: { lifecycle: "settled" } });
  });
});
