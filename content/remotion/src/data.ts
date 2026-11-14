// Every number and hash on screen comes from here, and everything here comes from the repo:
//   seed/astro.ts                         PO, quantities, unit price, people, supplier
//   policy/astro.json                     approvals required, advance %, release signals
//   engine/money.ts                       testnet scale (1:1,000)
//   docs/hackathon/payment-proofs.json    the ONLY source of tx hashes and explorer URLs
//   fixtures/recorded/approval-gated-run.json   real testnet approval refusals (Nov 14)
//   fixtures/recorded/gate-v2-frozen-probe.json release gate v2 signed refusal on chain (Nov 14)
//   fixtures/recorded/gate-v3-unsigned-dock-probe.json release gate v3 signed dock_unsigned refusal (Nov 14)
//   fixtures/recorded/gate-v4-exploit-probe.json  release gate v4 (deployed) signed terms_missing refusal (Nov 14)
//   docs/hackathon/ENFORCEMENT-MATRIX.md, TRUST-MODEL.md, READINESS.md
//                                         refusal and trust facts below (test/facts.spec.mjs checks
//                                         that each quoted code appears in those documents)
import { PO, astro, suppliers, offers, policy as seedPolicy, MOTOR_PART, MOTOR_BASE_CENTS, NEED_BY } from "../../../seed/astro";
import { TESTNET_SCALE } from "../../../engine/money";
import rules from "../../../policy/astro.json";
import proofsJson from "../../../docs/hackathon/payment-proofs.json";
import approvalRunJson from "../../../fixtures/recorded/approval-gated-run.json";
import gateV2Json from "../../../fixtures/recorded/gate-v2-frozen-probe.json";
import gateV3Json from "../../../fixtures/recorded/gate-v3-unsigned-dock-probe.json";
import gateV4Json from "../../../fixtures/recorded/gate-v4-exploit-probe.json";
import { compareWithBinaryEscrow, computeSettlement, formatTestUsdc, toTestnetRaw, type Settlement } from "./amounts";

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
  reconciliation: { commitRaw: string; advanceRaw: string; balanceRaw: string; reclaimRaw: string; sumOutRaw: string; reconciles: boolean; note: string };
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

  // Real testnet approval refusals (in process, real Tidepool key, rehearsal approver keys).
  const ar = approvalRunJson;
  const refusalRows = ar.rows.filter((r) => r.kind === "refusal");
  for (const r of refusalRows) {
    if (r.response.total_cents !== settlement.orderTotalCents) {
      throw new Error("approval-gated-run.json refused a different total than the PO");
    }
    if (r.response.supplier !== supplier.receiveAddress) throw new Error("approval-gated-run.json names another supplier address");
  }
  const approvalRun = {
    date: shortDate(ar.at),
    host: ar.host,
    approvers: ar.approvers,
    attempts: refusalRows.map((r) => ({ valid: r.response.valid, required: r.response.required, reason: r.response.reason, hash: r.hash })),
    zeroReason: ar.zeroApprovals.reason,
    oneReason: ar.oneApproval.reason,
    agentsBefore: ar.agentsUsedBefore,
    agentsAfter: ar.agentsUsedAfter,
    walletOpened: !(ar.quotaUnchanged && ar.agentsUsedBefore === ar.agentsUsedAfter),
    digest: refusalRows[0]?.response.digest ?? "",
    source: "fixtures/recorded/approval-gated-run.json",
  };

  // Release gate v2: signed refusal for the frozen PO account, on chain.
  const gv = gateV2Json;
  const gateV2 = {
    tx: gv.tx,
    explorerUrl: gv.explorer,
    network: gv.network,
    signer: gv.signer,
    contract: gv.contract,
    stage: gv.input.stage,
    po: gv.input.po,
    reason: gv.output.reason,
    ok: gv.output.ok,
    signatureValid: gv.signature_valid,
    publicKey: gv.output.public_key,
    wasmSha256: gv.wasm_sha256,
    date: GATE_V2_DATE,
    source: "fixtures/recorded/gate-v2-frozen-probe.json",
  };

  const gateV3 = { tx: gateV3Json.tx, explorerUrl: gateV3Json.explorer, reason: gateV3Json.output.reason, ok: gateV3Json.output.ok, stage: gateV3Json.output.stage, source: "fixtures/recorded/gate-v3-unsigned-dock-probe.json" };

  const gateV4 = { tx: gateV4Json.tx, explorerUrl: gateV4Json.explorer, reason: gateV4Json.output.reason, ok: gateV4Json.output.ok, stage: gateV4Json.output.stage, source: "fixtures/recorded/gate-v4-exploit-probe.json" };

  // Reconciliation read from chain (payment-proofs.json), not recomputed.
  const rc = proofs.reconciliation;
  const reconciliation = {
    advance: formatTestUsdc(Number(rc.advanceRaw)),
    balance: formatTestUsdc(Number(rc.balanceRaw)),
    returned: formatTestUsdc(Number(rc.reclaimRaw)),
    sumOut: formatTestUsdc(Number(rc.sumOutRaw)),
    commit: formatTestUsdc(Number(rc.commitRaw)),
    reconciles: rc.reconciles && rc.sumOutRaw === rc.commitRaw,
    note: rc.note,
  };

  return {
    comparison: compareWithBinaryEscrow(settlement),
    approvalRun,
    gateV2,
    gateV3,
    gateV4,
    reconciliation,
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

// ---- facts for PartialShipment and JudgeDemo (verified by test/facts.spec.mjs) ------------------

/** The recorded money run is called "the Nov 6 run" in the docs (its UTC start is Nov 7 01:20). */
export const RECORDED_RUN_LABEL = "Nov 6";
/** The commit receipt predates the approval check (READINESS: "Live commit did not check approvals"). */
export const COMMIT_RECORDED_NOTE = `Recorded ${RECORDED_RUN_LABEL}, before the approval check existed.`;
/** PAYMENT-PROOFS.md: "The full approval-gated run (...) was not run". */
export const TWO_SIGNATURES_SEEN = "Test suite only: the full approval-gated testnet run has not been done";
/** The order wallet is a provider account with a policy, not a contract (TRUST-MODEL.md B3). */
export const WALLET_RULES_NOTE = "Rules enforced by the wallet provider, not a smart contract";
/** gate-v2-frozen-probe.json _note: "Release gate v2 on OutLayer testnet, Nov 14". */
export const GATE_V2_DATE = "Nov 14";
/** TRUST-MODEL.md B4: the deployed gate version (test/facts.spec.mjs reads it from the doc). */
export const DEPLOYED_GATE = "v4";
/** TRUST-MODEL.md B4: v2 to v4 have only refused on chain; the paid run went through v1. */
export const GATE_SCOPE = `The deployed gate is ${DEPLOYED_GATE}. Gates v2 to ${DEPLOYED_GATE} have only refused on chain so far; the recorded paying run went through v1, on an unsigned, simulated count of 44.`;
/** TRUST-MODEL.md B4 + trusted party 2: the release grant is in the enclave, the owner key is not. */
export const OWNER_KEY_NOTE = "The buyer's owner key (held by our backend in this demo) can still change the wallet's rules.";
export const RELEASE_GRANT_NOTE = `The release grant is held by the enclave. ${OWNER_KEY_NOTE}`;
/** approval-gated-run.json: a backend refusal, run against the real Tidepool testnet, not an on-chain refusal. */
export const APPROVAL_RUN_NOTE = "Refused by our backend before any call, run against the real Tidepool testnet (no wallet opened)";

/** TRUST-MODEL.md, "Evidence received is not a fact established". */
export const DOCK_SIGNING = {
  capability: `Since Nov 14 the deployed gate (${DEPLOYED_GATE}) requires a dock count signed by the pinned device for this order`,
  recorded: "The recorded paying run went through gate v1 on a simulated, unsigned count of 44",
  gap: "A signed count shows who reported it, not that it is true",
} as const;

export type AutonomyKind = "deterministic" | "real" | "simulated" | "human" | "fixed";
/** READINESS.md, "Agent autonomy, step by step": step and class quoted from the table. */
export const AUTONOMY: readonly { step: string; cls: string; kind: AutonomyKind; tag: string }[] = [
  { step: "Requirement intake (50 short)", cls: "Deterministic business logic on fixed demo data", kind: "fixed", tag: "Deterministic" },
  { step: "Supplier search and fitment", cls: "Deterministic business logic", kind: "deterministic", tag: "Deterministic" },
  { step: "Reading quotes and documents", cls: "Real external integration (NEAR AI Cloud private inference) where keys are set; replay otherwise", kind: "real", tag: "Real / replay" },
  { step: "Negotiation", cls: "Deterministic counter inside the 5% ceiling; supplier replies are simulated but conditional on the counter, through the real inbound email path", kind: "simulated", tag: "Det. + simulated replies" },
  { step: "Recommendation (Haoyun all-50 at $1,260)", cls: "Deterministic rule (meets date and ceiling)", kind: "deterministic", tag: "Deterministic" },
  { step: "Approvals", cls: "**Human-controlled action**: ed25519 signatures from approver devices (live); simulated taps in replay", kind: "human", tag: "Human" },
  { step: "Milestone monitoring", cls: "**Mocked third-party response** (simulated carrier/customs feed)", kind: "simulated", tag: "Simulated" },
  { step: "Dock count", cls: "Signed by a pinned dock device for the order's wallet when `DOCK_DEVICE_KEYS` is set (it is on the deployment); the recorded Nov 6 run used fixed demo data (44)", kind: "fixed", tag: "Signed / demo 44" },
  { step: "Release decision and amount", cls: "Deterministic, in engine and in the OutLayer gate", kind: "deterministic", tag: "Deterministic" },
];
/** READINESS.md, closing line of the autonomy table. */
export const AUTONOMY_RULE = "No step lets a model choose an amount, an address or whether money moves.";

/** READINESS.md, "What remains simulated" (quoted). */
export const STILL_SIMULATED_DOC =
  "Astro, its customers and suppliers; supplier replies; shipment signals; the dock count; the attested dock-check worker (not deployed); the approvals and pre-money steps in replay mode; Astro's owner key is held by the backend in this demo.";

/** TRUST-MODEL.md, "Trusted parties, in order of what they could do if dishonest" (condensed). */
export const TRUSTED_PARTIES = [
  { who: "Astro's owner key", could: "anything: change policy, unfreeze, withdraw. By design, it is the buyer's money." },
  { who: "Evernear's backend", could: "holds Astro's testnet owner key in this demo: could skip approvals and commit; could make the gate overpay Haoyun up to the order total; with the owner key it can rewrite a funded order wallet's policy and pay any address." },
  { who: "Tidepool", could: "community-run testnet, not NEAR infrastructure: enforces grants, policy and idempotency on its server." },
  { who: "OutLayer TEE", could: "keeps the gate's grant and signing key bound to the wasm hash." },
  { who: "Evidence sources", could: "simulated." },
] as const;

/** Root package.json "attack" script; 49 cases counted by running it on 2026-11-13 (READINESS.md still says 44). */
export const ATTACK = {
  command: "npm run attack",
  cases: 49,
  files: ["tests/commitAuthorization.test.ts", "tests/enforcementMatrix.test.ts", "engine/__tests__/approvals.test.ts"],
} as const;

/** scripts/verify-proofs.mjs header. */
export const VERIFY = {
  command: "npm run verify:proofs",
  does: "Re-reads every recorded transaction on public testnet RPCs (Base Sepolia, NEAR testnet), checks amounts, recipients and the gate's ed25519 signatures, and writes docs/hackathon/payment-proofs.json. No keys, no writes to any chain.",
} as const;
