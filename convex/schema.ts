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
  // Per-PO escrow state (engine/escrow.ts Escrow). The escrow wallet key is never stored here:
  // convex/escrows.ts derives it at run time from OUTLAYER_API_KEY and the PO seed.
  escrows: defineTable({
    restockId: v.optional(v.id("restocks")), po: v.string(), supplier: v.string(), owner: v.string(),
    lockedCents: v.number(), releasedCents: v.number(), reclaimedCents: v.number(), deadlineMs: v.number(), closed: v.boolean(),
    escrowAccount: v.string(), refundJobId: v.optional(v.id("_scheduled_functions")),
    outcome: v.optional(v.union(v.literal("released"), v.literal("reclaimed"), v.literal("refunded"))),
  }).index("by_po", ["po"]),
  approvals: defineTable({ restockId: v.id("restocks"), approver: v.string(), signedAt: v.number(), proofId: v.optional(v.id("proofs")) }).index("by_restock", ["restockId"]),
  proofs: defineTable({
    restockId: v.optional(v.id("restocks")), scene: v.number(), kind: v.string(), label: v.string(), call: v.string(),
    hash: v.string(), explorerUrl: v.optional(v.string()), codePath: v.string(), network,
    response: v.any(), replay: v.boolean(), synthetic: v.boolean(), at: v.number(),
  }).index("by_restock", ["restockId"]).index("by_scene", ["scene"]),
});
