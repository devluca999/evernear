// Escrow state for convex/near/deadline.ts: the escrow rows, the pool of PO accounts and the deadline
// job. Queries and mutations live here because deadline.ts runs in the Node runtime ("use node"),
// which may hold only actions.
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { TESTNET_SCALE } from "../../engine/money";

export const POOL_MAX = 4;

export const get = internalQuery({
  args: { escrowId: v.id("escrows") },
  handler: (ctx, { escrowId }) => ctx.db.get(escrowId),
});

/** Takes a free pool account, or reports whether a new one may be opened. */
export const claimAccount = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ slot: Doc<"poAccounts"> | null; canOpen: boolean }> => {
    const free = await ctx.db.query("poAccounts").withIndex("by_busy", (q) => q.eq("busy", false)).first();
    if (free) {
      await ctx.db.patch(free._id, { busy: true });
      return { slot: free, canOpen: false };
    }
    const all = await ctx.db.query("poAccounts").take(POOL_MAX);
    return { slot: null, canOpen: all.length < POOL_MAX };
  },
});

export const addAccount = internalMutation({
  args: { agentId: v.string(), account: v.string(), grantHash: v.string() },
  handler: (ctx, a) => ctx.db.insert("poAccounts", { ...a, busy: true }),
});

export const freeAccount = internalMutation({
  args: { agentId: v.string() },
  handler: async (ctx, { agentId }) => {
    const row = await ctx.db.query("poAccounts").withIndex("by_agent", (q) => q.eq("agentId", agentId)).unique();
    if (row) await ctx.db.patch(row._id, { busy: false });
  },
});

/** Funds are committed: store the escrow and schedule the deadline refund. */
export const locked = internalMutation({
  args: {
    restockId: v.optional(v.id("restocks")), po: v.string(), ref: v.string(), supplier: v.string(), owner: v.string(),
    lockedCents: v.number(), deadlineMs: v.number(), escrowAccount: v.string(), agentId: v.string(), grantHash: v.string(),
  },
  handler: async (ctx, a) => {
    const escrowId = await ctx.db.insert("escrows", { ...a, scale: TESTNET_SCALE, releasedCents: 0, reclaimedCents: 0, closed: false });
    // refundOnDeadline is due strictly after the deadline.
    const refundJobId = await ctx.scheduler.runAt(a.deadlineMs + 1, internal.near.deadline.refundAtDeadline, { escrowId });
    await ctx.db.patch(escrowId, { refundJobId });
    return escrowId;
  },
});

/** Stores the engine's new escrow state; closing it cancels the deadline job and frees the PO account. */
export const moved = internalMutation({
  args: {
    escrowId: v.id("escrows"), releasedCents: v.number(), reclaimedCents: v.number(), closed: v.boolean(),
    outcome: v.union(v.literal("released"), v.literal("reclaimed"), v.literal("refunded")),
  },
  handler: async (ctx, { escrowId, ...next }) => {
    const e = await ctx.db.get(escrowId);
    if (!e) return;
    if (next.closed) {
      if (e.refundJobId) {
        const job = await ctx.db.system.get(e.refundJobId);
        if (job?.state.kind === "pending") await ctx.scheduler.cancel(e.refundJobId);
      }
      const row = await ctx.db.query("poAccounts").withIndex("by_agent", (q) => q.eq("agentId", e.agentId)).unique();
      if (row) await ctx.db.patch(row._id, { busy: false });
    }
    await ctx.db.patch(escrowId, next);
  },
});
