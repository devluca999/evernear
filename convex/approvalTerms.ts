// The commit terms an approval binds (engine/approvals.ts CommitTerms), built on the server from
// what is about to be committed: the PO, the supplier's payout address, the quantity and unit price.
// Never from the caller. Used by convex/approvals.ts (claim) and convex/near/deadline.ts (lock).
import { termsDigest, settlementUnits, sha256Hex, type CommitTerms } from "../engine/approvals";
import { canonical } from "../engine/releaseGate";
import { buildPurchaseOrder } from "../engine/order";
/** Same as convex/near/agentapi.ts BASE_USDC (not imported: that module loads the Node-only SDK). Test pins them equal. */
export const SETTLEMENT_ASSET = "nep141:base-0x38d81431b9f76d9699af7517040d5221d9dea252.tp-omft.testnet";
import { astro, MOTOR_BASE_CENTS, MOTOR_PART, PO, policy, suppliers } from "../seed/astro";
import rules from "../policy/astro.json";

/** Bumped whenever the PO's commercial terms change shape; an approval for an older version never matches. */
export const TERMS_VERSION = 3;
export const RULES_HASH = sha256Hex(canonical(rules));

export type Scenario = "happy" | "adjusted";
/** The unit price each scenario commits at: the happy path at Haoyun's $1,260, the adjusted one at $1,320. */
export const UNIT_CENTS: Record<Scenario, number> = { happy: PO.revisedUnitCents, adjusted: PO.confirmedUnitCents };

export function commitTerms(i: { po: string; supplierAddress: string; quantity: number; unitCents: number }): CommitTerms | null {
  const s = suppliers.find((x) => x.receiveAddress.toLowerCase() === i.supplierAddress.toLowerCase());
  if (!s) return null;
  // The negotiated offer becomes the PO here (engine/order.ts): the same plan the release rules pay on.
  const plan = buildPurchaseOrder({ supplier: s, part: MOTOR_PART, quantity: i.quantity, unitCents: i.unitCents, baseUnitCents: MOTOR_BASE_CENTS }, policy);
  if (!plan.ok) return null;
  const { totalCents } = plan.po;
  return {
    v: 1, po: i.po, termsVersion: TERMS_VERSION, buyer: astro.name, supplierId: s.id, supplierAddress: s.receiveAddress.toLowerCase(), supplierChain: s.receiveChain,
    part: MOTOR_PART, quantity: i.quantity, unitCents: i.unitCents, totalCents, priceChangeBps: plan.po.priceChangeBps, withinCeiling: plan.po.withinCeiling, currency: "USD",
    settlement: { asset: SETTLEMENT_ASSET, chain: "base", scale: 1000, units: settlementUnits(totalCents) },
    rulesHash: RULES_HASH,
    approvalsRequired: plan.po.approvalsRequired,
  };
}

const HAOYUN = suppliers.find((s) => s.id === "haoyun")!.receiveAddress;
/** The live run's terms for a scenario (convex/live.ts). */
export const liveTerms = (scenario: Scenario = "happy") => commitTerms({ po: PO.number, supplierAddress: HAOYUN, quantity: PO.quantity, unitCents: UNIT_CENTS[scenario] })!;
export { termsDigest };
