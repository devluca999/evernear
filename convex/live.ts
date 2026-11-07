// Live mode: the workspace runs the real escrow steps on Tidepool testnet as the story reaches them
// (scenario/gates.ts liveStepOf): commit, the advance as the motors leave, a refused withdraw to an
// off-list address, the balance for what arrived, and at the end the held part back to Astro, which
// closes the order's wallet. Public, so the page can call it, but nothing here takes an amount or
// an address from the caller: the PO, Haoyun's address, the unit price and the dock count come
// from seed/astro.ts, and the amounts from the engine. One run at a time, a few an hour, and every
// run closes itself: its deadline is LIVE_DEADLINE_MS out, so an abandoned run is refunded to Astro
// by the scheduled job.
import { action, internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { PO, suppliers } from "../seed/astro";
import { liveStep } from "./schema";

export const LIVE_DEADLINE_MS = 30 * 60_000;
export const LIVE_RUNS_PER_HOUR = 6;
const HAOYUN = suppliers.find((s) => s.id === "haoyun")!.receiveAddress;
const OFF_LIST = "0x000000000000000000000000000000000000dead";
/** The story's order: the balance is paid at the dock (chapter 7), the wrong-address attempt comes in Paid (chapter 8). */
const ORDER = ["commit", "advance", "pay", "refuse", "reclaim"] as const;
/** The unit price each scenario commits at, fixed here: the happy path at Haoyun's $1,260, the adjusted one at $1,320. */
const UNIT_CENTS = { happy: PO.revisedUnitCents, adjusted: PO.confirmedUnitCents } as const;

/**
 * Before a live run, for the page: order wallets left on the Tidepool key and whether Astro's treasury
 * covers the commit. `ok` is false, with a plain message, when no wallet is left or the money is short.
 */
export const preflight = action({
  args: { scenario: v.optional(v.union(v.literal("happy"), v.literal("adjusted"))) },
  handler: async (ctx, { scenario }): Promise<{ ok: boolean; walletsLeft: number | null; walletLimit: number | null; treasuryUsd: number; needUsd: number; message: string }> => {
    if (process.env.LIVE_ENABLED !== "1") return { ok: false, walletsLeft: null, walletLimit: null, treasuryUsd: 0, needUsd: 0, message: "Live mode is off on this deployment." };
    const cents = UNIT_CENTS[scenario ?? "happy"] * PO.quantity;
    const p = await ctx.runAction(internal.near.deadline.preflight, { cents });
    const usd = (units: string) => Number(BigInt(units) / 10_000n) / 100;
    const treasuryUsd = usd(p.treasuryUnits), needUsd = usd(p.needUnits);
    const base = { walletsLeft: p.walletsLeft, walletLimit: p.walletLimit, treasuryUsd, needUsd };
    if (p.walletsLeft === 0) return { ok: false, ...base, message: "No order wallets left on this Tidepool key (all " + p.walletLimit + " used). A new key is needed before a live run." };
    if (!p.covered) return { ok: false, ...base, message: "Astro's treasury holds $" + treasuryUsd.toFixed(2) + " test USDC; a live order needs $" + needUsd.toFixed(2) + ". Top it up from the faucet first." };
    return { ok: true, ...base, message: (p.walletsLeft ?? "An unknown number of") + " order wallets left on this key; the treasury covers the $" + needUsd.toFixed(2) + " commit." };
  },
});

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
  args: { runId: v.id("liveRuns"), step: v.optional(liveStep), escrowId: v.optional(v.id("escrows")), error: v.optional(v.string()) },
  handler: async (ctx, { runId, step: st, escrowId, error }) => {
    const r = await ctx.db.get(runId);
    if (!r) return;
    await ctx.db.patch(runId, { ...(st ? { done: [...r.done, st] } : {}), ...(escrowId ? { escrowId } : {}), ...(error ? { error } : {}) });
  },
});

/** The run, its proofs, and which path its releases take ("gate" or "server"), so the page can say which one paid. */
export const getRun = query({
  args: { runId: v.id("liveRuns") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run) return null;
    const proofs = await ctx.db.query("proofs").withIndex("by_run", (q) => q.eq("runId", runId)).take(60);
    const escrow = run.escrowId ? await ctx.db.get(run.escrowId) : null;
    return { run, proofs, releasePath: escrow ? (escrow.releasePath ?? "server") : null };
  },
});

/** Runs one money step of a live run, in story order. */
export const runStep = action({
  args: { runId: v.id("liveRuns"), step: liveStep, scenario: v.optional(v.union(v.literal("happy"), v.literal("adjusted"))) },
  handler: async (ctx, { runId, step: st, scenario }): Promise<{ ok: boolean; reason?: string }> => {
    const data = await ctx.runQuery(internal.liveState.run, { runId });
    if (!data) return { ok: false, reason: "no_run" };
    if (data.error) return { ok: false, reason: "run_failed" };
    if (data.done.includes(st)) return { ok: true };
    if (data.done.length !== ORDER.indexOf(st)) return { ok: false, reason: "out_of_order" };
    try {
      if (st === "commit") {
        const unit = UNIT_CENTS[scenario ?? "happy"];
        const r = await ctx.runAction(internal.near.deadline.lock, { runId, po: PO.number, supplier: HAOYUN, cents: unit * PO.quantity, orderedQty: PO.quantity, deadlineMs: Date.now() + LIVE_DEADLINE_MS });
        if (r.status !== "success" || !r.escrowId) throw new Error(r.reason ?? r.status);
        await ctx.runMutation(internal.live.mark, { runId, step: st, escrowId: r.escrowId });
        return { ok: true };
      }
      const escrowId = data.escrowId!;
      if (st === "advance") {
        const r = await ctx.runAction(internal.near.deadline.releaseStage, { runId, escrowId, stage: "advance", to: HAOYUN, payee: "Haoyun" });
        if (!r.ok) throw new Error(r.reason ?? "advance failed");
      }
      if (st === "refuse") {
        // Both layers, live: the engine refuses the off-list address in code, then the account refuses the same withdraw sent straight to it.
        const escrow = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
        if (!escrow) throw new Error("no escrow");
        // After the balance, what is left is the held part: the wrong address tries to take that.
        const due = Math.max(1, escrow.lockedCents - escrow.releasedCents - escrow.reclaimedCents);
        await ctx.runAction(internal.near.deadline.releaseStage, { runId, escrowId, stage: "balance", to: OFF_LIST, dockCount: PO.receivedQty });
        const r = await ctx.runAction(internal.near.deadline.policyRefusal, { runId, escrowId, to: OFF_LIST, cents: due });
        if (!r.refused) throw new Error("the PO account paid an off-list address");
      }
      if (st === "pay") {
        const r = await ctx.runAction(internal.near.deadline.releaseStage, { runId, escrowId, stage: "balance", to: HAOYUN, dockCount: PO.receivedQty, payee: "Haoyun" });
        if (!r.ok) throw new Error(r.reason ?? "balance failed");
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
