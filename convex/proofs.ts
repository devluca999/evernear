import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";
import { network } from "./schema";

export const record = internalMutation({
  args: {
    restockId: v.optional(v.id("restocks")), scene: v.number(), kind: v.string(), label: v.string(), call: v.string(),
    hash: v.string(), explorerUrl: v.optional(v.string()), codePath: v.string(), network,
    response: v.any(), replay: v.boolean(), synthetic: v.boolean(),
  },
  handler: async (ctx, a) => ctx.db.insert("proofs", { ...a, at: Date.now() }),
});

export const latest = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => ctx.db.query("proofs").order("desc").take(limit ?? 20),
});
