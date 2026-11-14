// Writes docs/hackathon/reconciliation.json: the canonical order's settlement computed by the engine
// (engine/order.ts) next to the amounts read from chain by scripts/verify-proofs.mjs
// (docs/hackathon/payment-proofs.json). Nothing typed by hand. Exits non-zero if they disagree.
//   npx tsx scripts/reconcile.mts
import { readFileSync, writeFileSync } from "node:fs";
import { buildPurchaseOrder, settlementPlan } from "../engine/order";
import { TESTNET_SCALE } from "../engine/money";
import { MOTOR_BASE_CENTS, MOTOR_PART, PO, policy, suppliers } from "../seed/astro";

const haoyun = suppliers.find((s) => s.id === "haoyun")!;
const plan = buildPurchaseOrder({ supplier: haoyun, part: MOTOR_PART, quantity: PO.quantity, unitCents: PO.revisedUnitCents, baseUnitCents: MOTOR_BASE_CENTS }, policy);
if (!plan.ok) throw new Error(plan.reason);
const s = settlementPlan(plan.po, PO.receivedQty)!;
const units = (cents: number) => String(BigInt(Math.round(cents / TESTNET_SCALE)) * 10_000n);
const proofs = JSON.parse(readFileSync("docs/hackathon/payment-proofs.json", "utf8"));
const chain = proofs.reconciliation as { commitRaw: string; advanceRaw: string; balanceRaw: string; reclaimRaw: string; reconciles: boolean };
const rows = [
  { step: "commit", commercialCents: plan.po.totalCents, expectedUnits: units(plan.po.totalCents), chainUnits: chain.commitRaw },
  { step: "advance", commercialCents: s.advanceCents, expectedUnits: units(s.advanceCents), chainUnits: chain.advanceRaw },
  { step: "balance", commercialCents: s.balanceCents, expectedUnits: units(s.balanceCents), chainUnits: chain.balanceRaw },
  { step: "returned", commercialCents: s.returnedCents, expectedUnits: units(s.returnedCents), chainUnits: chain.reclaimRaw },
].map((r) => ({ ...r, matches: r.expectedUnits === r.chainUnits }));
const out = {
  generatedBy: "scripts/reconcile.mts",
  order: { po: PO.number, supplier: haoyun.name, quantity: plan.po.quantity, unitCents: plan.po.unitCents, totalCents: plan.po.totalCents, priceChangeBps: plan.po.priceChangeBps, approvalsRequired: plan.po.approvalsRequired, receivedQty: s.receivedQty },
  invariant: { committedCents: plan.po.totalCents, paidCents: s.paidCents, returnedCents: s.returnedCents, heldCents: plan.po.totalCents - s.paidCents - s.returnedCents, holds: s.paidCents + s.returnedCents === plan.po.totalCents },
  scale: `testnet 1:${TESTNET_SCALE}; 6-decimal test USDC units = cents x 10`,
  chainSource: { file: "docs/hackathon/payment-proofs.json", checkedAt: proofs.checkedAt, reconcilesOnChain: chain.reconciles },
  rows,
  allMatch: rows.every((r) => r.matches) && chain.reconciles === true,
};
writeFileSync("docs/hackathon/reconciliation.json", JSON.stringify(out, null, 2) + "\n");
console.log(rows.map((r) => `${r.step.padEnd(9)} $${(r.commercialCents / 100).toLocaleString("en-US")}  expected ${r.expectedUnits}  on chain ${r.chainUnits}  ${r.matches ? "ok" : "MISMATCH"}`).join("\n"));
console.log(out.allMatch ? "reconciled: engine and chain agree" : "NOT RECONCILED");
if (!out.allMatch) process.exitCode = 1;
