// npm test  (Node >= 22.18 strips the types from src/amounts.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeSettlement, toTestnetRaw, formatTestUsdc, formatUsd } from "../src/amounts.ts";

const repo = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, repo), "utf8");
const rules = JSON.parse(read("policy/astro.json"));
const proofs = JSON.parse(read("docs/hackathon/payment-proofs.json"));
const seed = read("seed/astro.ts");
const num = (re) => Number(seed.match(re)[1].replace(/_/g, ""));
// Read PO values from seed/astro.ts text (it imports engine code, so it is not loaded here).
const PO = {
  quantity: num(/quantity:\s*([\d_]+)/),
  revisedUnitCents: num(/revisedUnitCents:\s*([\d_]+)/),
  receivedQty: num(/receivedQty:\s*([\d_]+)/),
};
const SCALE = Number(read("engine/money.ts").match(/TESTNET_SCALE\s*=\s*([\d_]+)/)[1].replace(/_/g, ""));

const story = () =>
  computeSettlement({ orderedQty: PO.quantity, unitCents: PO.revisedUnitCents, receivedQty: PO.receivedQty, advancePercent: rules.escrow.advance_percent });

test("seed values are the story's", () => {
  assert.deepEqual(PO, { quantity: 50, revisedUnitCents: 126_000, receivedQty: 44 });
  assert.equal(rules.escrow.advance_percent, 30);
  assert.equal(SCALE, 1000);
});

test("settlement in integer cents", () => {
  const s = story();
  assert.equal(s.orderTotalCents, 6_300_000);
  assert.equal(s.advanceCents, 1_890_000);
  assert.equal(s.deliveredValueCents, 5_544_000);
  assert.equal(s.balanceCents, 3_654_000);
  assert.equal(s.paidCents, 5_544_000);
  assert.equal(s.returnedCents, 756_000);
  assert.equal(s.missingQty, 6);
  assert.equal(s.advanceCents + s.balanceCents + s.returnedCents, s.orderTotalCents);
  for (const v of Object.values(s)) assert.ok(Number.isInteger(v));
});

test("computed testnet amounts equal the chain-read amounts in payment-proofs.json", () => {
  const s = story();
  const r = proofs.reconciliation;
  assert.equal(String(toTestnetRaw(s.orderTotalCents, SCALE)), r.commitRaw);
  assert.equal(String(toTestnetRaw(s.advanceCents, SCALE)), r.advanceRaw);
  assert.equal(String(toTestnetRaw(s.balanceCents, SCALE)), r.balanceRaw);
  assert.equal(String(toTestnetRaw(s.returnedCents, SCALE)), r.reclaimRaw);
  assert.equal(r.reconciles, true);
});

test("formatting", () => {
  assert.equal(formatUsd(6_300_000), "$63,000");
  assert.equal(formatUsd(126_000), "$1,260");
  assert.equal(formatUsd(3_654_000), "$36,540");
  assert.equal(formatTestUsdc(63_000_000), "63.00");
  assert.equal(formatTestUsdc(18_900_000), "18.90");
  assert.equal(formatTestUsdc(36_540_000), "36.54");
  assert.equal(formatTestUsdc(7_560_000), "7.56");
  assert.equal(formatTestUsdc(1), "0.000001");
});

test("every amount follows receivedQty", () => {
  const s = computeSettlement({ orderedQty: 50, unitCents: 126_000, receivedQty: 40, advancePercent: 30 });
  assert.equal(s.balanceCents, 40 * 126_000 - 1_890_000);
  assert.equal(s.returnedCents, 6_300_000 - 1_890_000 - s.balanceCents);
  // Fewer arrived than the advance covers: nothing more is due, the rest returns.
  const low = computeSettlement({ orderedQty: 50, unitCents: 126_000, receivedQty: 10, advancePercent: 30 });
  assert.equal(low.balanceCents, 0);
  assert.equal(low.returnedCents, 6_300_000 - 1_890_000);
});

test("refuses bad input", () => {
  assert.throws(() => computeSettlement({ orderedQty: 50, unitCents: 126_000, receivedQty: 51, advancePercent: 30 }));
  assert.throws(() => computeSettlement({ orderedQty: 50, unitCents: 1.5, receivedQty: 1, advancePercent: 30 }));
  assert.throws(() => computeSettlement({ orderedQty: 1, unitCents: 1, receivedQty: 1, advancePercent: 30 }));
});
