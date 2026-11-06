// Escrow state for convex/near/deadline.ts: the escrow rows and the deadline job. Queries and
// mutations live here because deadline.ts runs in the Node runtime ("use node"), which may hold only
// actions. Each row is one order and one Agent API account; an account is never reused, so a closed
// row stays as that order's receipt.
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { TESTNET_SCALE } from "../../engine/money";
import { lifecycle, releasePath } from "../schema";

export const get = internalQuery({
  args: { escrowId: v.id("escrows") },
  handler: (ctx, { escrowId }) => ctx.db.get(escrowId),
});

/** Funds are committed into a new account: store the escrow and schedule the deadline refund. */
export const locked = internalMutation({
  args: {
    restockId: v.optional(v.id("restocks")), po: v.string(), ref: v.string(), supplier: v.string(), owner: v.string(),
    lockedCents: v.number(), deadlineMs: v.number(), escrowAccount: v.string(), agentId: v.string(), grantHash: v.string(), grantId: v.optional(v.string()),
    orderedQty: v.optional(v.number()), releasePath: v.optional(releasePath), gatePublicKey: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const escrowId = await ctx.db.insert("escrows", { ...a, scale: TESTNET_SCALE, releasedCents: 0, reclaimedCents: 0, closed: false, lifecycle: "funded" });
    // refundOnDeadline is due strictly after the deadline.
    const refundJobId = await ctx.scheduler.runAt(a.deadlineMs + 1, internal.near.deadline.refundAtDeadline, { escrowId });
    await ctx.db.patch(escrowId, { refundJobId });
    return escrowId;
  },
});

/** Stores the engine's new escrow state; once settled (nothing left) it cancels the deadline job. */
export const moved = internalMutation({
  args: {
    escrowId: v.id("escrows"), releasedCents: v.number(), reclaimedCents: v.number(), closed: v.boolean(), lifecycle,
    outcome: v.union(v.literal("released"), v.literal("reclaimed"), v.literal("refunded")),
  },
  handler: async (ctx, { escrowId, ...next }) => {
    const e = await ctx.db.get(escrowId);
    if (!e) return;
    if (next.closed && e.refundJobId) {
      const job = await ctx.db.system.get(e.refundJobId);
      if (job?.state.kind === "pending") await ctx.scheduler.cancel(e.refundJobId);
    }
    await ctx.db.patch(escrowId, next);
  },
});

/** The order's account is closed for good (grant revoked, frozen): the row is its receipt. */
export const walletClosed = internalMutation({
  args: { escrowId: v.id("escrows") },
  handler: async (ctx, { escrowId }) => {
    const e = await ctx.db.get(escrowId);
    if (!e) return;
    await ctx.db.patch(escrowId, { closed: true, lifecycle: "closed" });
  },
});
