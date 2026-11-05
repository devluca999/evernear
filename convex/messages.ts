import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

export const channel = v.union(v.literal("telegram"), v.literal("email"));

/** Live feed for the virtual phone and the supplier inbox. */
export const recent = query({
  args: { channel, limit: v.optional(v.number()) },
  handler: async (ctx, { channel, limit }) =>
    (await ctx.db.query("messages").withIndex("by_channel", (q) => q.eq("channel", channel)).order("desc").take(limit ?? 50)).reverse(),
});

export const insert = internalMutation({
  args: {
    channel, direction: v.union(v.literal("in"), v.literal("out")), from: v.string(), to: v.optional(v.string()),
    subject: v.optional(v.string()), text: v.string(), photo: v.optional(v.string()), reading: v.optional(v.string()),
    externalId: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    if (a.externalId) {
      const dup = await ctx.db.query("messages").withIndex("by_external", (q) => q.eq("channel", a.channel).eq("externalId", a.externalId)).first();
      if (dup) return dup._id;
    }
    return ctx.db.insert("messages", { ...a, receivedAt: Date.now() });
  },
});
