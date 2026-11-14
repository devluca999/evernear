// The judge's audit trail for PO 1042: one timeline from the request to the final reconciliation.
// Every event is built from a source that exists in this repo: the seed and engine (computed), the
// recorded Nov 6 testnet run (fixtures/recorded/live-run.json), the Nov 14 approval-gated refusals
// (fixtures/recorded/approval-gated-run.json), the gate v2 probe, and the chain check
// (docs/hackathon/reconciliation.json). Nothing here is typed as a result; each event says how it is known.
import live from "../fixtures/recorded/live-run.json";
import gated from "../fixtures/recorded/approval-gated-run.json";
import v2 from "../fixtures/recorded/gate-v2-frozen-probe.json";
import recon from "../docs/hackathon/reconciliation.json";
import { buildPurchaseOrder, settlementPlan } from "../engine/order";
import { formatUsd } from "../engine/money";
import { counterPriceCents, haoyunReplyTo, MAILBOX } from "../scenarios/suppliers";
import { MOTOR_BASE_CENTS, MOTOR_PART, offers, PO, policy, suppliers } from "../seed/astro";

/** How an event is known. */
export type Status = "verified on chain" | "recorded testnet response" | "real testnet refusal (no tx)" | "computed by the engine" | "simulated" | "signed off-chain";

export interface AuditEvent {
  n: number;
  title: string;
  actor: string;
  at: string | null;
  amountCents: number | null;
  enforcement: string;
  evidence: string;
  status: Status;
  tx: { hash: string; url: string } | null;
  source: string;
  detail: string;
}

type Row = (typeof live.rows)[number];
const rows = live.rows as Row[];
const find = (pred: (r: Row) => boolean) => rows.find(pred);
const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);
const txOf = (r?: Row) => (r && r.explorerUrl ? { hash: r.hash, url: r.explorerUrl } : null);

export function auditTrail(): { events: AuditEvent[]; summary: { committedCents: number; paidCents: number; returnedCents: number; orderedQty: number; receivedQty: number; reconciled: boolean } } {
  const haoyun = suppliers.find((s) => s.id === "haoyun")!;
  const agreed = counterPriceCents(haoyunReplyTo({ to: MAILBOX.haoyun, body: `Counter: USD ${(PO.revisedUnitCents / 100).toFixed(2)} per unit` })!.text)!;
  const plan = buildPurchaseOrder({ supplier: haoyun, part: MOTOR_PART, quantity: PO.quantity, unitCents: agreed, baseUnitCents: MOTOR_BASE_CENTS }, policy);
  if (!plan.ok) throw new Error(plan.reason);
  const s = settlementPlan(plan.po, PO.receivedQty)!;
  const commit = find((r) => r.kind === "escrow");
  const policyRow = find((r) => r.kind === "policy" && r.label.startsWith("PO 1042 account: pays only"));
  const pays = rows.filter((r) => r.kind === "payout");
  const sig = (id: string) => find((r) => r.kind === "signal" && r.hash === id);
  const grantRefusal = find((r) => r.kind === "refusal" && r.codePath.endsWith("#policyRefusal"));
  const reclaim = find((r) => r.kind === "reclaim");
  const closeRow = find((r) => r.kind === "wallet");
  const fitting = offers.filter((o) => o.part === MOTOR_PART).map((o) => o.supplierId);

  const ev: Omit<AuditEvent, "n">[] = [
    { title: "Request: 50 actuator motors short for the 10MA build", actor: "Astro's stock levels (simulated buyer)", at: null, amountCents: null, enforcement: "none (input)", evidence: "seed/astro.ts demand and build plan", status: "simulated", tx: null, source: "scenarios/demand.ts", detail: `${PO.quantity} motors needed by Dec 14; the usual supplier is out for 6 weeks.` },
    { title: "Supplier evaluation", actor: "Agent (deterministic fitment)", at: null, amountCents: null, enforcement: "engine fitment and buyer policy", evidence: `${fitting.length} offers checked against the bill of materials, price cap and date`, status: "computed by the engine", tx: null, source: "engine/plain.ts, seed/astro.ts offers", detail: "Haoyun and QuickShip fit; Kansai is late; Rheinwerk is not an approved supplier; Huaxin fails on specs." },
    { title: "Negotiated price", actor: "Agent counter, supplier reply (simulated supplier)", at: null, amountCents: agreed, enforcement: "5% urgent ceiling (engine/policy.ts)", evidence: "Haoyun's reply to a counter inside the ceiling", status: "simulated", tx: null, source: "scenarios/suppliers.ts haoyunReplyTo", detail: `Opening +10% (${formatUsd(PO.confirmedUnitCents)}); counter inside the ceiling; agreed ${formatUsd(agreed)} for all ${PO.quantity}.` },
    { title: "Buyer-policy evaluation", actor: "Engine", at: null, amountCents: plan.po.totalCents, enforcement: "engine/order.ts buildPurchaseOrder", evidence: `+${plan.po.priceChangeBps / 100}% vs usual price, ${plan.po.withinCeiling ? "inside" : "over"} the ceiling; ${plan.po.approvalsRequired} approvals required (over $10,000, new supplier)`, status: "computed by the engine", tx: null, source: "engine/order.ts, engine/policy.ts", detail: `PO ${PO.number}: ${PO.quantity} x ${formatUsd(agreed)} = ${formatUsd(plan.po.totalCents)}.` },
    { title: "Approvals: commit refused with 0 and with 1 signature", actor: "Approval verifier (Evernear backend)", at: (gated as { at?: string }).at ?? null, amountCents: null, enforcement: "convex/approvals.ts claimCommit (off-chain, before any call)", evidence: "Real Tidepool testnet run of the live code: agent count 5 before and after, no wallet opened. Signed by rehearsal keys, not people.", status: "real testnet refusal (no tx)", tx: null, source: "fixtures/recorded/approval-gated-run.json, tests/commitAuthorization.test.ts", detail: "Two distinct pinned approvers must sign the exact terms digest; replayed, expired, mismatched or planted approvals are refused. The recorded Nov 6 commit below predates this check." },
    { title: "Funding commitment", actor: "Astro's treasury -> the order's own wallet", at: iso(commit?.at), amountCents: plan.po.totalCents, enforcement: "Tidepool (NEAR Intents Agent API) transfer", evidence: commit?.label ?? "", status: "verified on chain", tx: txOf(commit), source: "convex/near/escrow.ts#lock", detail: "Recorded Nov 6, before the approval check existed. 63.00 test USDC at 1:1,000." },
    { title: "Payment-account restrictions", actor: "Astro's owner key (policy)", at: iso(policyRow?.at), amountCents: plan.po.totalCents, enforcement: "Tidepool account policy: destinations only [Haoyun on Base, Astro], per-transaction cap", evidence: policyRow?.label ?? "", status: "recorded testnet response", tx: null, source: "convex/near/escrow.ts poPolicy", detail: "Provider-enforced, not on-chain; the owner can change it. Release grant held by the OutLayer release gate." },
    { title: "Advance evidence: bill of lading + export clearance", actor: "Tracking feed (simulated carrier and customs)", at: iso(sig("sim-bol")?.at), amountCents: null, enforcement: "engine releaseStage and the release gate require both signals", evidence: "sim-bol, sim-export", status: "simulated", tx: null, source: "scenarios/tracking.ts", detail: "Evidence received, not a real-world fact established." },
    { title: "Advance release (30%)", actor: "Release gate v1 in OutLayer's enclave (the build that paid the recorded run; v4 is deployed now)", at: iso(pays[0]?.at), amountCents: s.advanceCents, enforcement: "Release gate (wasm-bound grant) + Tidepool policy", evidence: pays[0]?.label ?? "", status: "verified on chain", tx: txOf(pays[0]), source: "worker/release-gate, convex/near/escrow.ts#release", detail: "Gate's signed result decoded from chain and checked by npm run verify:proofs." },
    { title: "Wrong-address attempt refused", actor: "Evernear's server (no grant)", at: iso(grantRefusal?.at), amountCents: null, enforcement: "Code (address_not_allowed), then Tidepool grant layer (grant_invalid)", evidence: "Recorded 403 grant_invalid; the destination allowlist refusal (policy_destination_denied) was seen separately on Nov 5", status: "recorded testnet response", tx: null, source: "docs/hackathon/ENFORCEMENT-MATRIX.md", detail: "Two different protections; the recorded one is the grant." },
    { title: "Delivery evidence: import clearance + dock count 44", actor: "Tracking feed (simulated) and dock count", at: iso(sig("dock-1042")?.at), amountCents: null, enforcement: "engine and gate require both; a dock count signed by a pinned device when configured", evidence: "sim-import, dock-1042", status: "simulated", tx: null, source: "scenarios/tracking.ts, convex/dock.ts", detail: "The recorded run used the unsigned demo count of 44." },
    { title: "Shortfall calculation", actor: "Engine", at: null, amountCents: s.returnedCents, enforcement: "engine/order.ts settlementPlan = engine/escrow.ts releaseStage = gate", evidence: `${PO.receivedQty} of ${PO.quantity}: ${PO.receivedQty} x ${formatUsd(agreed)} - ${formatUsd(s.advanceCents)} advance = ${formatUsd(s.balanceCents)}; ${PO.quantity - PO.receivedQty} missing = ${formatUsd(s.returnedCents)} held`, status: "computed by the engine", tx: null, source: "tests/orderPipeline.test.ts", detail: "Checked to the cent for 1,000 random orders across plan, signed terms, server rules and gate. Trade terms (policy/astro.json): DAP Chicago; the 6 missing units are cancelled, not backordered." },
    { title: "Final release (balance)", actor: "Release gate v1 in OutLayer's enclave (recorded run, on the unsigned demo count)", at: iso(pays[1]?.at), amountCents: s.balanceCents, enforcement: "Release gate + Tidepool policy", evidence: pays[1]?.label ?? "", status: "verified on chain", tx: txOf(pays[1]), source: "convex/near/escrow.ts#release", detail: "" },
    { title: "Return of the remainder", actor: "Astro (owner) via a grant that can only pay Astro", at: iso(reclaim?.at), amountCents: s.returnedCents, enforcement: "Policy narrowed to Astro only, then transfer", evidence: reclaim?.label ?? "", status: "verified on chain", tx: txOf(reclaim), source: "convex/near/escrow.ts#reclaim", detail: `Wallet then frozen and its grants revoked: ${closeRow?.label ?? ""}` },
    { title: "Final balance and reconciliation", actor: "scripts/reconcile.mts + scripts/verify-proofs.mjs", at: (recon as { chainSource: { checkedAt: string } }).chainSource.checkedAt, amountCents: plan.po.totalCents, enforcement: "Independent re-check against public RPCs", evidence: `paid ${formatUsd(s.paidCents)} + returned ${formatUsd(s.returnedCents)} = committed ${formatUsd(plan.po.totalCents)}; on chain 18.90 + 36.54 + 7.56 = 63.00`, status: recon.allMatch ? "verified on chain" : "computed by the engine", tx: null, source: "docs/hackathon/reconciliation.json", detail: `Release gate v2 later refused a frozen order wallet on chain, signed (${(v2 as { tx: string }).tx.slice(0, 10)}…).` },
  ];
  return {
    events: ev.map((e, i) => ({ n: i + 1, ...e })),
    summary: { committedCents: plan.po.totalCents, paidCents: s.paidCents, returnedCents: s.returnedCents, orderedQty: PO.quantity, receivedQty: PO.receivedQty, reconciled: recon.allMatch },
  };
}
