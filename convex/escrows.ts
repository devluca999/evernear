// Per-PO escrow lifecycle and the deadline refund (docs/NOTES.md 10.7).
// When funds lock, a refund is scheduled at the deadline with ctx.scheduler.runAt. At the deadline it
// loads the escrow, calls EscrowAdapter.refundIfDue (engine/escrow.ts refundOnDeadline decides), records
// the proof and closes the escrow. A release before the deadline cancels the job, and the job is a
// no-op anyway once anything was released: the held part then goes back through reclaim, not refund.
// The refund is triggered by Evernear's scheduler, not by the chain.
//
// Keys: the escrow wallet key is never written to the database. It is derived at run time from
// OUTLAYER_API_KEY (Astro's parent wk_ key, a Convex env variable) and the PO seed, exactly as
// OutLayer derives sub-agent keys (convex/near/custody.ts subWalletKey).
import { internalAction, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { EscrowAdapter, escrowSeed } from "./near/escrow";
import { subWalletKey } from "./near/custody";
import type { Fetch, ProofInput } from "./near/http";
import type { Escrow } from "../engine/escrow";

/** Scene numbers for the drawer: funds lock in scene 6, release in scene 8. */
const LOCK_SCENE = 6, RELEASE_SCENE = 8;

const toEscrow = (d: Doc<"escrows">): Escrow => ({
  supplier: d.supplier, owner: d.owner, lockedCents: d.lockedCents, releasedCents: d.releasedCents,
  reclaimedCents: d.reclaimedCents, deadlineMs: d.deadlineMs, closed: d.closed,
});

function parentKey(): string {
  const k = process.env.OUTLAYER_API_KEY;
  if (!k) throw new Error("OUTLAYER_API_KEY not configured");
  return k;
}

const fetcher: Fetch = (url, init) => fetch(url, init);

/** Runs an adapter call and stores every proof it emits. */
async function withProofs<T>(ctx: ActionCtx, scene: number, restockId: Id<"restocks"> | undefined, run: (sink: (p: ProofInput) => void) => Promise<T>): Promise<T> {
  const proofs: ProofInput[] = [];
  const out = await run((p) => { proofs.push(p); });
  for (const p of proofs) await ctx.runMutation(internal.proofs.record, { ...p, restockId, scene });
  return out;
}

export const get = internalQuery({
  args: { escrowId: v.id("escrows") },
  handler: (ctx, { escrowId }) => ctx.db.get(escrowId),
});

/** Funds are locked: store the escrow and schedule the deadline refund. */
export const locked = internalMutation({
  args: {
    restockId: v.optional(v.id("restocks")), po: v.string(), supplier: v.string(), owner: v.string(),
    lockedCents: v.number(), deadlineMs: v.number(), escrowAccount: v.string(),
  },
  handler: async (ctx, a) => {
    const escrowId = await ctx.db.insert("escrows", { ...a, releasedCents: 0, reclaimedCents: 0, closed: false });
    // refundOnDeadline is due strictly after the deadline.
    const refundJobId = await ctx.scheduler.runAt(a.deadlineMs + 1, internal.escrows.refundAtDeadline, { escrowId });
    await ctx.db.patch(escrowId, { refundJobId });
    return escrowId;
  },
});

export const released = internalMutation({
  args: { escrowId: v.id("escrows"), releasedCents: v.number() },
  handler: async (ctx, { escrowId, releasedCents }) => {
    const e = await ctx.db.get(escrowId);
    if (!e) return;
    if (e.refundJobId) {
      const job = await ctx.db.system.get(e.refundJobId);
      if (job?.state.kind === "pending") await ctx.scheduler.cancel(e.refundJobId);
    }
    await ctx.db.patch(escrowId, { releasedCents, outcome: "released" });
  },
});

export const refunded = internalMutation({
  args: { escrowId: v.id("escrows"), reclaimedCents: v.number() },
  handler: async (ctx, { escrowId, reclaimedCents }) => {
    await ctx.db.patch(escrowId, { reclaimedCents, closed: true, outcome: "refunded" });
  },
});

/** Opens the PO wallet, moves the total in from Astro's wallet and, once it succeeded, starts the deadline clock. */
export const lock = internalAction({
  args: { restockId: v.optional(v.id("restocks")), po: v.string(), supplier: v.string(), owner: v.string(), cents: v.number(), deadlineMs: v.number() },
  handler: async (ctx, a): Promise<{ status: string; escrowId?: Id<"escrows"> }> => {
    const adapter = (sink: (p: ProofInput) => void) => new EscrowAdapter({ fetch: fetcher, parentApiKey: parentKey(), sink });
    const sub = await withProofs(ctx, LOCK_SCENE, a.restockId, (sink) => adapter(sink).open(a.po));
    const r = await withProofs(ctx, LOCK_SCENE, a.restockId, (sink) => adapter(sink).lock({ po: a.po, escrowAccount: sub.near_account_id, cents: a.cents }));
    if (r.status !== "success") return { status: r.status };
    const escrowId: Id<"escrows"> = await ctx.runMutation(internal.escrows.locked, {
      restockId: a.restockId, po: a.po, supplier: a.supplier, owner: a.owner, lockedCents: a.cents, deadlineMs: a.deadlineMs, escrowAccount: sub.near_account_id,
    });
    return { status: r.status, escrowId };
  },
});

/** Release to the supplier. The engine's three-exit rule refuses any other address before a call. */
export const release = internalAction({
  args: { escrowId: v.id("escrows"), to: v.string(), cents: v.number() },
  handler: async (ctx, { escrowId, to, cents }): Promise<{ ok: boolean; reason?: string }> => {
    const e = await ctx.runQuery(internal.escrows.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    const escrowApiKey = await subWalletKey(escrowSeed(e.po), parentKey());
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (sink) =>
      new EscrowAdapter({ fetch: fetcher, parentApiKey: parentKey(), sink }).release({ escrow: toEscrow(e), escrowApiKey, to, cents, po: e.po, nowMs: Date.now() }));
    if (!r.ok) return { ok: false, reason: r.reason };
    await ctx.runMutation(internal.escrows.released, { escrowId, releasedCents: r.escrow.releasedCents });
    return { ok: true };
  },
});

/** Scheduled at the deadline by `locked`. A no-op when the escrow is closed or anything was released. */
export const refundAtDeadline = internalAction({
  args: { escrowId: v.id("escrows") },
  handler: async (ctx, { escrowId }): Promise<{ ok: boolean; reason?: string }> => {
    const e = await ctx.runQuery(internal.escrows.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    if (e.closed) return { ok: false, reason: "closed" };
    if (e.releasedCents > 0) return { ok: false, reason: "released" };
    const escrowApiKey = await subWalletKey(escrowSeed(e.po), parentKey());
    const r = await withProofs(ctx, LOCK_SCENE, e.restockId, (sink) =>
      new EscrowAdapter({ fetch: fetcher, parentApiKey: parentKey(), sink }).refundIfDue({ escrow: toEscrow(e), escrowApiKey, po: e.po, nowMs: Date.now() }));
    if (!r.ok) return { ok: false, reason: r.reason };
    await ctx.runMutation(internal.escrows.refunded, { escrowId, reclaimedCents: r.escrow.reclaimedCents });
    return { ok: true };
  },
});
