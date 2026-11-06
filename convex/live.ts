// Live mode: the workspace runs the real escrow steps on Tidepool testnet as the story reaches them
// (scenario/gates.ts liveStepOf). Public, so the page can call it, but nothing here takes an amount
// or an address from the caller: the PO, Haoyun's address and the amounts come from seed/astro.ts
// and the engine. One run at a time, a few an hour, and every run closes itself: its deadline is
// LIVE_DEADLINE_MS out, so an abandoned run is refunded to Astro by the scheduled job.
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { PO, suppliers } from "../seed/astro";
import { plainEngine } from "../engine/plain";

export const LIVE_DEADLINE_MS = 30 * 60_000;
export const LIVE_RUNS_PER_HOUR = 6;
const HAOYUN = suppliers.find((s) => s.id === "haoyun")!.receiveAddress;
const OFF_LIST = "0x000000000000000000000000000000000000dead";
const RECEIVED = 1_800;
const step = v.union(v.literal("commit"), v.literal("refuse"), v.literal("pay"), v.literal("reclaim"));
/** The unit price each scenario commits at, fixed here: the happy path at $19.00, the adjusted one at Haoyun's $20.02. */
const UNIT_CENTS = { happy: PO.revisedUnitCents, adjusted: 2002 } as const;

/** Starts a run, or refuses while another is open or the hourly limit is reached. */
export const start = mutation({
  args: {},
  handler: async (ctx): Promise<{ runId?: Id<"liveRuns">; refused?: string }> => {
    if (process.env.LIVE_ENABLED !== "1") return { refused: "live mode is off on this deployment" };
    const recent = await ctx.db.query("liveRuns").withIndex("by_started", (q) => q.gt("startedAt", Date.now() - 3_600_000)).take(LIVE_RUNS_PER_HOUR + 1);
    if (recent.length >= LIVE_RUNS_PER_HOUR) return { refused: "hourly limit reached" };
    const open = recent.find((r) => !r.error && !r.done.includes("reclaim") && r.startedAt > Date.now() - LIVE_DEADLINE_MS);
    if (open) return { refused: "another live run is in progress" };
    return { runId: await ctx.db.insert("liveRuns", { startedAt: Date.now(), done: [] }) };
  },
});

export const mark = internalMutation({
  args: { runId: v.id("liveRuns"), step: v.optional(step), escrowId: v.optional(v.id("escrows")), error: v.optional(v.string()) },
  handler: async (ctx, { runId, step: st, escrowId, error }) => {
    const r = await ctx.db.get(runId);
    if (!r) return;
    await ctx.db.patch(runId, { ...(st ? { done: [...r.done, st] } : {}), ...(escrowId ? { escrowId } : {}), ...(error ? { error } : {}) });
  },
});

export const getRun = query({
  args: { runId: v.id("liveRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    const proofs = await ctx.db.query("proofs").withIndex("by_run", (q) => q.eq("runId", runId)).take(50);
    return { run, proofs };
  },
});

/** Runs one money step of a live run, in story order. */
export const runStep = action({
  args: { runId: v.id("liveRuns"), step, scenario: v.optional(v.union(v.literal("happy"), v.literal("adjusted"))) },
  handler: async (ctx, { runId, step: st, scenario }): Promise<{ ok: boolean; reason?: string }> => {
    const data = await ctx.runQuery(internal.liveState.run, { runId });
    if (!data) return { ok: false, reason: "no_run" };
    const order = ["commit", "refuse", "pay", "reclaim"] as const;
    if (data.error) return { ok: false, reason: "run_failed" };
    if (data.done.includes(st)) return { ok: true };
    if (data.done.length !== order.indexOf(st)) return { ok: false, reason: "out_of_order" };
    try {
      if (st === "commit") {
        const r = await ctx.runAction(internal.near.deadline.lock, { runId, po: PO.number, supplier: HAOYUN, cents: UNIT_CENTS[scenario ?? "happy"] * PO.quantity, deadlineMs: Date.now() + LIVE_DEADLINE_MS });
        if (r.status !== "success" || !r.escrowId) throw new Error(r.reason ?? r.status);
        await ctx.runMutation(internal.live.mark, { runId, step: st, escrowId: r.escrowId });
        return { ok: true };
      }
      const escrowId = data.escrowId!;
      // The release follows what was committed, whichever scenario committed it.
      const escrow = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
      if (!escrow) throw new Error("no escrow");
      const release = plainEngine.matchReceipt({ orderedQty: PO.quantity, receivedQty: RECEIVED, unitCents: escrow.lockedCents / PO.quantity }).releaseCents;
      if (st === "refuse") {
        // Both layers, live: the engine's rule refuses in code, then the account's policy refuses the same withdraw.
        await ctx.runAction(internal.near.deadline.release, { runId, escrowId, to: OFF_LIST, cents: release });
        const r = await ctx.runAction(internal.near.deadline.policyRefusal, { runId, escrowId, to: OFF_LIST, cents: release });
        if (!r.refused) throw new Error("the PO account paid an off-list address");
      }
      if (st === "pay") {
        const r = await ctx.runAction(internal.near.deadline.release, { runId, escrowId, to: HAOYUN, cents: release });
        if (!r.ok) throw new Error(r.reason ?? "payout failed");
      }
      if (st === "reclaim") {
        const r = await ctx.runAction(internal.near.deadline.reclaim, { runId, escrowId });
        if (!r.ok) throw new Error(r.reason ?? "reclaim failed");
      }
      await ctx.runMutation(internal.live.mark, { runId, step: st });
      return { ok: true };
    } catch (e) {
      const reason = (e as Error).message.slice(0, 200);
      await ctx.runMutation(internal.live.mark, { runId, error: `${st}: ${reason}` });
      return { ok: false, reason };
    }
  },
});
