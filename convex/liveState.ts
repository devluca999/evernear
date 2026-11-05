import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const run = internalQuery({
  args: { runId: v.id("liveRuns") },
  handler: (ctx, { runId }) => ctx.db.get(runId),
});
