// Every number and hash on screen comes from here, and everything here comes from the repo:
//   seed/astro.ts                         PO, quantities, unit price, people, supplier
//   policy/astro.json                     approvals required, advance %, release signals
//   engine/money.ts                       testnet scale (1:1,000)
//   docs/hackathon/payment-proofs.json    the ONLY source of tx hashes and explorer URLs
//   docs/hackathon/ENFORCEMENT-MATRIX.md, TRUST-MODEL.md
//                                         refusal and trust facts below (test/facts.spec.mjs checks
//                                         that each quoted code appears in those documents)
import { PO, astro, suppliers, offers, policy as seedPolicy, MOTOR_PART, MOTOR_BASE_CENTS, NEED_BY } from "../../../seed/astro";
import { TESTNET_SCALE } from "../../../engine/money";
import rules from "../../../policy/astro.json";
import proofsJson from "../../../docs/hackathon/payment-proofs.json";
import { computeSettlement, formatTestUsdc, toTestnetRaw, type Settlement } from "./amounts";

export const PROOFS_DOC = "docs/hackathon/PAYMENT-PROOFS.md";

// ---- payment-proofs.json, loosely typed -------------------------------------------------------

type Recorded = Record<string, unknown>;
type ProofEntry = {
  label: string;
  stage?: string;
  kind?: string;
  businessMeaning?: string;
  commercialCents: number | null;
  testnetUnits: { raw: string; amount: string } | null;
  network: string;
  sender: string | null;
  recipient: string | null;
  txId: string | null;
  explorerUrl: string | null;
  classification: string;
  verification: { status: string; method: string; details?: Record<string, unknown> & { recorded?: Recorded } };
};
type Proofs = {
  checkedAt: string;
  scale: string;
  source: { runId: string; deployment: string; releasePath: string; startedAt: string };
  reconciliation: { commitRaw: string; advanceRaw: string; balanceRaw: string; reclaimRaw: string; reconciles: boolean };
  entries: ProofEntry[];
  "probe-nov5": { scenario: string; source: string; poAccount: string; entries: ProofEntry[] };
};
const proofs = proofsJson as unknown as Proofs;

const one = (pred: (e: ProofEntry) => boolean, what: string, list = proofs.entries): ProofEntry => {
  const hits = list.filter(pred);
  if (hits.length === 0) throw new Error(`payment-proofs.json: no entry for ${what}`);
  return hits[0];
};

// ---- types handed to components ----------------------------------------------------------------

export type Receipt = {
  readonly title: string;
  readonly meaning: string;
  readonly network: string;
  readonly txId: string;
  readonly sender: string;
  readonly recipient: string;
  readonly amountTestUsdc: string; // proof raw units, shown as "63.00"
  readonly explorerUrl: string | null;
  readonly verified: boolean;
  readonly classification: string;
  /** Proof raw units equal the amount computed from data (cents x 10 at 1:1,000). */
  readonly matchesComputed: boolean;
  readonly computedTestUsdc: string;
};

export type Signal = {
  readonly id: string;
  readonly event: string;
  readonly label: string;
  readonly at: string;
  readonly ref: string | null;
  readonly count: number | null;
  readonly unlocks: "advance" | "balance";
};

export type RefusalFact = {
  readonly attempt: string;
  readonly layer: string;
  readonly code: string;
  readonly httpStatus: number | null;
  readonly where: string;
  readonly proofNote: string;
};

const SIGNAL_LABELS: Record<string, string> = {
  bill_of_lading: "Bill of lading",
  export_cleared: "Export cleared",
  import_cleared: "Import cleared",
  dock_count: "Dock count",
};

const shortDate = (iso: string) => {
  const d = new Date(iso);
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${m} ${d.getUTCDate()}`;
};

export type StoryOverrides = { readonly receivedQty?: number | null };

export function buildStory(o: StoryOverrides = {}) {
  const supplier = suppliers.find((s) => s.id === proofsJson.supplier.id);
  if (!supplier) throw new Error("supplier from payment-proofs.json not found in seed/astro.ts");
  if (supplier.receiveAddress !== proofsJson.supplier.receiveAddress) {
    throw new Error("supplier address in seed and payment-proofs.json disagree");
  }

  const receivedQty = o.receivedQty ?? PO.receivedQty;
  const settlement: Settlement = computeSettlement({
    orderedQty: PO.quantity,
    unitCents: PO.revisedUnitCents,
    receivedQty,
    advancePercent: rules.escrow.advance_percent,
  });
  const raw = (c: number) => toTestnetRaw(c, TESTNET_SCALE);
  const testUsdc = (c: number) => formatTestUsdc(raw(c));

  const receipt = (stage: string, title: string, computedCents: number): Receipt => {
    const e = one((x) => x.stage === stage && x.txId !== null && x.verification.status === "verified", `stage ${stage}`);
    return {
      title,
      meaning: e.businessMeaning ?? e.label,
      network: e.network,
      txId: e.txId as string,
      sender: e.sender ?? "not recorded",
      recipient: e.recipient ?? "not recorded",
      amountTestUsdc: e.testnetUnits ? formatTestUsdc(Number(e.testnetUnits.raw)) : "",
      explorerUrl: e.explorerUrl,
      verified: e.verification.status === "verified",
      classification: e.classification,
      matchesComputed: e.testnetUnits !== null && Number(e.testnetUnits.raw) === raw(computedCents),
      computedTestUsdc: testUsdc(computedCents),
    };
  };

  // Signals: simulated feed entries, deduplicated by id (the proof file repeats some).
  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const e of proofs.entries) {
    if (e.stage !== "signal" || !e.txId || seen.has(e.txId)) continue;
    seen.add(e.txId);
    const r = (e.verification.details?.recorded ?? {}) as Recorded;
    const event = String(r.event);
    signals.push({
      id: e.txId,
      event,
      label: SIGNAL_LABELS[event] ?? event,
      at: shortDate(String(r.at)),
      ref: typeof r.ref === "string" ? r.ref : null,
      count: typeof r.count === "number" ? r.count : null,
      unlocks: rules.escrow.releases.advance.requires.includes(event) ? "advance" : "balance",
    });
  }
  const order = [...rules.escrow.releases.advance.requires, ...rules.escrow.releases.balance.requires];
  signals.sort((a, b) => order.indexOf(a.event) - order.indexOf(b.event));

  // Wallet account (policy set at commit-setup; an intent id, not a tx hash).
  const setup = one((x) => x.stage === "commit-setup", "commit-setup");

  // Refusal at the GRANT layer, on the recorded gate-path run (PO 1042).
  const grantEntry = one(
    (x) => x.stage === "refused-offlist" && (x.verification.details?.recorded as Recorded | undefined)?.layer === "grant",
    "grant-layer refusal",
  );
  const g = grantEntry.verification.details!.recorded as Recorded;
  const gReq = g.request as Recorded;
  const grantRefusal: RefusalFact = {
    attempt: `Withdraw ${formatTestUsdc(Number(gReq.amount))} test USDC to ${String(gReq.recipient)}`,
    layer: String(g.layer),
    code: String(g.code),
    httpStatus: typeof g.status === "number" ? g.status : null,
    where: `Sent by ${String(g.sent_by)}, to the PO ${PO.number} account on Tidepool`,
    proofNote: `No tx: refused before any transfer. Recorded on run ${proofs.source.runId}.`,
  };

  // Refusal by the DESTINATION ALLOWLIST: a different, older account (Nov 5 server path).
  const probe = proofs["probe-nov5"];
  const destEntry = one((x) => x.verification.details?.code === "policy_destination_denied", "destination refusal", probe.entries);
  const paidAfter = one((x) => x.classification === "real-testnet-verified" && x.network.startsWith("Base"), "probe payout", probe.entries);
  const destinationRefusal: RefusalFact & { paidAfterTx: string; paidAfterAmount: string; account: string } = {
    attempt: `Withdraw to ${destEntry.recipient} with a valid grant`,
    layer: String(destEntry.verification.details?.layer),
    code: String(destEntry.verification.details?.code),
    httpStatus: 403,
    where: `Nov 5 server-path account ${probe.poAccount}, an older deal, not PO ${PO.number}`,
    proofNote: "No tx (synchronous 403). Recorded in project notes, not independently verifiable.",
    paidAfterTx: paidAfter.txId as string,
    paidAfterAmount: paidAfter.testnetUnits?.amount ?? "",
    account: probe.poAccount,
  };

  const haoyunOffer = offers.find((x) => x.supplierId === supplier.id && x.part === MOTOR_PART);
  if (!haoyunOffer || !haoyunOffer.arrives) throw new Error("no dated motor offer for the supplier in seed/astro.ts");
  const arrives: string = haoyunOffer.arrives;
  const priceCapCents = seedPolicy.priceCaps[MOTOR_PART];

  const approvers = [astro.buyer, astro.fullNames[astro.secondApprover] ?? astro.secondApprover];
  if (approvers.length < rules.approvers_required) throw new Error("fewer approvers than required");

  return {
    buyer: { name: astro.name, short: astro.name.replace(/ Inc\.$/, ""), city: astro.city },
    approvers,
    supplier: { name: supplier.name, city: supplier.city, country: supplier.country, address: supplier.receiveAddress, chain: supplier.receiveChain },
    po: {
      number: PO.number,
      part: MOTOR_PART,
      orderedQty: PO.quantity,
      receivedQty,
      unitCents: PO.revisedUnitCents,
      firstQuoteUnitCents: PO.confirmedUnitCents,
      baseUnitCents: MOTOR_BASE_CENTS,
      priceCapCents,
      arrives,
      needBy: NEED_BY,
      specs: haoyunOffer.specs,
    },
    policy: {
      approversRequired: rules.approvers_required,
      autoApproveUnderCents: rules.auto_approve_under_usd * 100,
      priceChangeLimitPercent: rules.price_change_limit_percent,
      advancePercent: rules.escrow.advance_percent,
      advanceRequires: rules.escrow.releases.advance.requires.map((x) => SIGNAL_LABELS[x] ?? x),
      balanceRequires: rules.escrow.releases.balance.requires.map((x) => SIGNAL_LABELS[x] ?? x),
    },
    settlement,
    testnet: {
      scale: TESTNET_SCALE,
      scaleLabel: `1:${TESTNET_SCALE.toLocaleString("en-US")}`,
      total: testUsdc(settlement.orderTotalCents),
      advance: testUsdc(settlement.advanceCents),
      balance: testUsdc(settlement.balanceCents),
      returned: testUsdc(settlement.returnedCents),
    },
    wallet: {
      account: setup.recipient as string,
      intentId: setup.txId as string,
      network: setup.network,
      provider: "Tidepool",
      providerNote: "community-run testnet of the NEAR Intents Agent API",
    },
    receipts: {
      commit: receipt("commit", "Committed to the order wallet", settlement.orderTotalCents),
      advance: receipt("advance", `Advance paid to ${supplier.name}`, settlement.advanceCents),
      balance: receipt("balance", `Balance paid to ${supplier.name}`, settlement.balanceCents),
      returned: receipt("reclaim", `Held part returned to ${astro.name.replace(/ Inc\.$/, "")}`, settlement.returnedCents),
    },
    signals,
    refusals: {
      grant: grantRefusal,
      destination: destinationRefusal,
      approval: APPROVAL_REFUSAL,
      changedTerms: CHANGED_TERMS_REFUSAL,
    },
    trust: TRUST,
    stillSimulated: stillSimulated({ scaleLabel: `1:${TESTNET_SCALE.toLocaleString("en-US")}`, receivedQty, part: MOTOR_PART }),
    run: { ...proofs.source, checkedAt: proofs.checkedAt },
    reconciles: proofs.reconciliation.reconciles,
  };
}

export type Story = ReturnType<typeof buildStory>;

// ---- facts quoted from docs/hackathon (verified by test/facts.spec.mjs) ------------------------

/** ENFORCEMENT-MATRIX.md, Commit table: "No approvals / one approval". */
export const APPROVAL_REFUSAL = {
  code: "not_enough_approvals",
  layer: "Evernear backend (off-chain code)",
  environment: "convex-test + simulated provider",
  test: "tests/commitAuthorization.test.ts",
  liveNote: "Not yet run against the live deployment: approver keys must be provisioned first.",
} as const;

/** ENFORCEMENT-MATRIX.md, Commit table: "Terms changed after approval". */
export const CHANGED_TERMS_REFUSAL = {
  code: "not_enough_approvals",
  note: "Changed terms need new approvals",
} as const;

/** TRUST-MODEL.md boundaries B1..B5, in the order the money meets them. */
export const TRUST = [
  { id: "B1", name: "Approval to commit", by: "Evernear backend", kind: "off-chain code" },
  { id: "B2", name: "Release decision", by: "engine + release gate", kind: "code" },
  { id: "B3", name: "Where money may go", by: "Tidepool account policy", kind: "provider-enforced" },
  { id: "B4", name: "Who may release", by: "OutLayer TEE grant binding", kind: "TEE + provider grant" },
  { id: "B5", name: "Evidence", by: "simulated feed", kind: "simulated" },
] as const;

export const stillSimulated = (s: { scaleLabel: string; receivedQty: number; part: string }) =>
  [
    "Carrier, customs and dock-count signals: simulated feed",
    "Astro Robotics, Haoyun Precision and the people: fictional cast",
    `Money: testnet only, at ${s.scaleLabel} (test USDC)`,
    "Approval refusals: from the test suite, not yet on the live deployment",
    `A TEE proves the code ran on its input, not that ${s.receivedQty} ${s.part.toLowerCase()}s arrived`,
  ] as const;
