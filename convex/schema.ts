import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stage = v.union(
  v.literal("low"), v.literal("sourcing"), v.literal("approval"), v.literal("confirmed"),
  v.literal("funds_locked"), v.literal("shipped"), v.literal("dock"), v.literal("paid"), v.literal("closed"),
);

export const network = v.union(v.literal("testnet"), v.literal("mainnet"), v.literal("offchain"));

/** engine/escrow.ts Lifecycle: created, funded, advance released, balance released, settled (nothing left), closed (frozen, grant revoked). */
export const lifecycle = v.union(
  v.literal("created"), v.literal("funded"), v.literal("advance_released"), v.literal("balance_released"), v.literal("settled"), v.literal("closed"),
  // Rows written before the two-stage release.
  v.literal("partly_released"),
);

/** convex/near/escrow.ts ReleasePath: who sends a release, the release gate in OutLayer's enclave or Evernear's server. */
export const releasePath = v.union(v.literal("gate"), v.literal("server"));

/** convex/live.ts steps, in story order. */
export const liveStep = v.union(v.literal("commit"), v.literal("advance"), v.literal("refuse"), v.literal("pay"), v.literal("reclaim"));

export default defineSchema({
  companies: defineTable({ slug: v.string(), name: v.string(), city: v.string(), country: v.string(), ownerAccount: v.optional(v.string()) }).index("by_slug", ["slug"]),
  products: defineTable({ companyId: v.id("companies"), slug: v.string(), name: v.string(), kind: v.string() }).index("by_slug", ["slug"]),
  bomLines: defineTable({ productId: v.id("products"), part: v.string(), qty: v.number(), specs: v.record(v.string(), v.string()) }).index("by_product", ["productId"]),
  suppliers: defineTable({
    slug: v.string(), name: v.string(), city: v.string(), country: v.string(),
    approved: v.boolean(), isNew: v.boolean(), receiveChain: v.string(), receiveAddress: v.string(), email: v.optional(v.string()),
  }).index("by_slug", ["slug"]).index("by_email", ["email"]),
  offers: defineTable({
    supplierId: v.id("suppliers"), part: v.string(), unitCents: v.number(), specs: v.record(v.string(), v.string()),
    fitment: v.optional(v.record(v.string(), v.boolean())),
  }).index("by_supplier", ["supplierId"]),
  restocks: defineTable({
    productId: v.id("products"), part: v.string(), stage, supplierId: v.optional(v.id("suppliers")), po: v.optional(v.string()),
    unitCents: v.number(), originalUnitCents: v.number(), quantity: v.number(), totalCents: v.number(), heldCents: v.number(),
    releasedCents: v.number(), receivedQty: v.optional(v.number()), escrowAccount: v.optional(v.string()),
  }).index("by_po", ["po"]),
  messages: defineTable({
    channel: v.union(v.literal("telegram"), v.literal("email")), direction: v.union(v.literal("in"), v.literal("out")),
    from: v.string(), to: v.optional(v.string()), subject: v.optional(v.string()), text: v.string(),
    photo: v.optional(v.string()), reading: v.optional(v.string()), restockId: v.optional(v.id("restocks")),
    externalId: v.optional(v.string()), receivedAt: v.number(),
  }).index("by_channel", ["channel", "receivedAt"]).index("by_external", ["channel", "externalId"]),
  // Per-PO escrow state (engine/escrow.ts Escrow), committed in a new Agent API account per order
  // (convex/near/deadline.ts), never reused: once settled the account is closed and the row is the
  // order's receipt. No key is stored here: grant tokens are derived at run time from AGENT_API_KEY
  // and only their sha256 is kept (`grantId` is the grant's public id, used to revoke it). On the
  // release gate path the token exists only inside the enclave: `grantHash` is what enroll returned,
  // `gatePublicKey` the gate's result key every release answer must be signed with.
  // Amounts are story cents; the account runs at 1:`scale`. `lifecycle` is optional only for rows
  // written before it existed (convex/near/deadline.ts toEscrow derives it for those).
  escrows: defineTable({
    restockId: v.optional(v.id("restocks")), po: v.string(), ref: v.string(), supplier: v.string(), owner: v.string(),
    lockedCents: v.number(), releasedCents: v.number(), reclaimedCents: v.number(), deadlineMs: v.number(), closed: v.boolean(),
    lifecycle: v.optional(lifecycle),
    escrowAccount: v.string(), agentId: v.string(), grantHash: v.string(), grantId: v.optional(v.string()), scale: v.number(),
    orderedQty: v.optional(v.number()), releasePath: v.optional(releasePath), gatePublicKey: v.optional(v.string()),
    refundJobId: v.optional(v.id("_scheduled_functions")),
    outcome: v.optional(v.union(v.literal("released"), v.literal("reclaimed"), v.literal("refunded"))),
  }).index("by_po", ["po"]),
  // Legacy: the pool of reused PO accounts, from before order wallets were never reused (Nov 6).
  // Nothing reads or writes it now; it stays declared only so rows on existing deployments validate.
  poAccounts: defineTable({ agentId: v.string(), account: v.string(), grantHash: v.string(), busy: v.boolean() })
    .index("by_busy", ["busy"]).index("by_agent", ["agentId"]),
  approvals: defineTable({ restockId: v.id("restocks"), approver: v.string(), signedAt: v.number(), proofId: v.optional(v.id("proofs")) }).index("by_restock", ["restockId"]),
  // A live run from the workspace (convex/live.ts): one PO committed, its advance paid, a wrong
  // address refused, the balance paid, the held part returned and the wallet closed, on Tidepool.
  liveRuns: defineTable({
    startedAt: v.number(), escrowId: v.optional(v.id("escrows")), error: v.optional(v.string()),
    done: v.array(liveStep),
    // The money step running now, claimed in a mutation before any call, so two concurrent requests cannot both run it.
    inFlight: v.optional(liveStep),
    inFlightAt: v.optional(v.number()),
    // The commit's authorization, claimed atomically with the approvals it consumed (convex/approvals.ts claimCommit).
    commit: v.optional(v.object({ digest: v.string(), po: v.optional(v.string()), approvers: v.array(v.string()), nonces: v.array(v.string()), claimedAt: v.number() })),
    // An operator marked a claimed commit as checked by hand (e.g. it failed before any money moved), so it no longer blocks the PO.
    commitResolved: v.optional(v.boolean()),
  }).index("by_started", ["startedAt"]),
  // Signed dock counts from pinned receiving devices (engine/attestation.ts, convex/dock.ts).
  dockCounts: defineTable({
    po: v.string(), agentId: v.optional(v.string()), count: v.number(), at: v.string(), device: v.string(), publicKey: v.string(), signature: v.string(), receivedAt: v.number(),
  }).index("by_po", ["po", "receivedAt"]),
  // Signed commit approvals (engine/approvals.ts): one row per signature, spent once by claimCommit.
  commitApprovals: defineTable({
    digest: v.string(), po: v.string(), approver: v.string(), publicKey: v.string(), nonce: v.string(),
    issuedAt: v.number(), expiresAt: v.number(), signature: v.string(),
    accountId: v.optional(v.string()), scheme: v.optional(v.union(v.literal("ed25519"), v.literal("nep413"))),
    status: v.union(v.literal("pending"), v.literal("consumed"), v.literal("revoked")),
    runId: v.optional(v.id("liveRuns")), at: v.number(),
  }).index("by_digest_status", ["digest", "status"]).index("by_nonce", ["nonce"]).index("by_run", ["runId"]),
  proofs: defineTable({
    restockId: v.optional(v.id("restocks")), runId: v.optional(v.id("liveRuns")), scene: v.number(), kind: v.string(), label: v.string(), call: v.string(),
    hash: v.string(), explorerUrl: v.optional(v.string()), codePath: v.string(), network,
    response: v.any(), replay: v.boolean(), synthetic: v.boolean(), at: v.number(),
  }).index("by_restock", ["restockId"]).index("by_scene", ["scene"]).index("by_run", ["runId"]),
});
