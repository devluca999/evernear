import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stage = v.union(
  v.literal("low"), v.literal("sourcing"), v.literal("approval"), v.literal("confirmed"),
  v.literal("funds_locked"), v.literal("shipped"), v.literal("dock"), v.literal("paid"), v.literal("closed"),
);

export const network = v.union(v.literal("testnet"), v.literal("mainnet"), v.literal("offchain"));

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
  // Per-PO escrow state (engine/escrow.ts Escrow), committed in one Agent API account per PO
  // (convex/near/deadline.ts). No key is stored here: grant tokens are derived at run time from
  // AGENT_API_KEY and only their sha256 is kept. Amounts are story cents; the account runs at 1:`scale`.
  escrows: defineTable({
    restockId: v.optional(v.id("restocks")), po: v.string(), ref: v.string(), supplier: v.string(), owner: v.string(),
    lockedCents: v.number(), releasedCents: v.number(), reclaimedCents: v.number(), deadlineMs: v.number(), closed: v.boolean(),
    escrowAccount: v.string(), agentId: v.string(), grantHash: v.string(), scale: v.number(),
    refundJobId: v.optional(v.id("_scheduled_functions")),
    outcome: v.optional(v.union(v.literal("released"), v.literal("reclaimed"), v.literal("refunded"))),
  }).index("by_po", ["po"]),
  // The pool of reused PO accounts (Tidepool never deletes agents). Busy while an escrow is open.
  poAccounts: defineTable({ agentId: v.string(), account: v.string(), grantHash: v.string(), busy: v.boolean() })
    .index("by_busy", ["busy"]).index("by_agent", ["agentId"]),
  approvals: defineTable({ restockId: v.id("restocks"), approver: v.string(), signedAt: v.number(), proofId: v.optional(v.id("proofs")) }).index("by_restock", ["restockId"]),
  proofs: defineTable({
    restockId: v.optional(v.id("restocks")), scene: v.number(), kind: v.string(), label: v.string(), call: v.string(),
    hash: v.string(), explorerUrl: v.optional(v.string()), codePath: v.string(), network,
    response: v.any(), replay: v.boolean(), synthetic: v.boolean(), at: v.number(),
  }).index("by_restock", ["restockId"]).index("by_scene", ["scene"]),
});
