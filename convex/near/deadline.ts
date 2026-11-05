// Per-PO escrow lifecycle on the Agent API, and the deadline refund (docs/NOTES.md 10.7 and 14).
// lock: claim a PO account from the pool (or open one while the pool is under POOL_MAX), set its
// policy for this PO, top up Astro's treasury if needed, commit the PO total into it, then schedule
// the deadline refund with ctx.scheduler.runAt. At the deadline the job asks the engine
// (refundOnDeadline) and moves whatever is still held back to Astro's treasury. Only closing the
// escrow (full release, reclaim or refund) cancels the job and frees the pool account.
// The refund is triggered by Evernear's scheduler, not by the chain.
//
// Pool: Tidepool never deletes agents and a key holds 25, so PO accounts are reused. Each run gets
// a fresh `ref`, which keys every idempotent call, so a rerun of the demo is a new payment.
//
// Keys: Convex env variables only, never the database. AGENT_API_KEY is Evernear's key; grant
// tokens are derived from it at run time (only their sha256 is stored, as `grantHash`).
// AGENT_OWNER_* is Astro's testnet owner key, used to sign each PO account's policy (see README,
// honest limits: in production Astro's wallet signs these intents at approval time).
"use node";
import { internalAction, type ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { EscrowAdapter } from "./escrow";
import { agentApiBase, ownerFromPkcs8 } from "./agentapi";
import type { Fetch, ProofInput } from "./http";
import type { Escrow } from "../../engine/escrow";

/** Scene numbers for the drawer: funds commit in scene 6, release in scene 8. */
const LOCK_SCENE = 6, RELEASE_SCENE = 8;

const toEscrow = (d: Doc<"escrows">): Escrow => ({
  supplier: d.supplier, owner: d.owner, lockedCents: d.lockedCents, releasedCents: d.releasedCents,
  reclaimedCents: d.reclaimedCents, deadlineMs: d.deadlineMs, closed: d.closed,
});

const fetcher: Fetch = (url, init) => fetch(url, init);

function adapter(sink: (p: ProofInput) => void) {
  const env = process.env;
  const owner = env.AGENT_OWNER_PRIVATE_KEY_PKCS8 && env.AGENT_OWNER_ACCOUNT_ID && env.AGENT_OWNER_PUBLIC_KEY
    ? ownerFromPkcs8({ accountId: env.AGENT_OWNER_ACCOUNT_ID, publicKey: env.AGENT_OWNER_PUBLIC_KEY, pkcs8Base64: env.AGENT_OWNER_PRIVATE_KEY_PKCS8 })
    : undefined;
  return new EscrowAdapter({ fetch: fetcher, apiKey: env.AGENT_API_KEY, baseUrl: agentApiBase(env.AGENT_API_BASE_URL), owner, sink, treasuryId: env.AGENT_TREASURY_ID });
}

/** Runs an adapter call and stores every proof it emits, also when the call throws. */
async function withProofs<T>(ctx: ActionCtx, scene: number, restockId: Id<"restocks"> | undefined, run: (a: EscrowAdapter) => Promise<T>): Promise<T> {
  const proofs: ProofInput[] = [];
  try {
    return await run(adapter((p) => { proofs.push(p); }));
  } finally {
    for (const p of proofs) await ctx.runMutation(internal.proofs.record, { ...p, restockId, scene });
  }
}

/** Claims a PO account, sets its policy, commits the total and starts the deadline clock. */
export const lock = internalAction({
  args: { restockId: v.optional(v.id("restocks")), po: v.string(), supplier: v.string(), cents: v.number(), deadlineMs: v.number() },
  handler: async (ctx, a): Promise<{ status: string; escrowId?: Id<"escrows">; reason?: string }> => {
    const { slot, canOpen } = await ctx.runMutation(internal.near.escrowState.claimAccount, {});
    if (!slot && !canOpen) return { status: "refused", reason: "pool_full" };
    const supplier = a.supplier.toLowerCase();
    let agentId = slot?.agentId;
    try {
      const acct = await withProofs(ctx, LOCK_SCENE, a.restockId, (e) => e.open({ po: a.po, supplier, lockedCents: a.cents, slot: slot?.agentId }));
      agentId = acct.agentId;
      if (!slot) await ctx.runMutation(internal.near.escrowState.addAccount, acct);
      const ref = `${a.po}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      const r = await withProofs(ctx, LOCK_SCENE, a.restockId, async (e) => {
        const f = await e.fund({ cents: a.cents });
        if (!f.ok) return { ok: false as const, code: f.reason ?? "fund_failed" };
        return e.lock({ po: a.po, ref, agentId: acct.agentId, account: acct.account, cents: a.cents });
      });
      if (!r.ok) {
        await ctx.runMutation(internal.near.escrowState.freeAccount, { agentId: acct.agentId });
        return { status: "refused", reason: r.code };
      }
      const owner = await adapter(() => {}).treasuryAccount();
      const escrowId: Id<"escrows"> = await ctx.runMutation(internal.near.escrowState.locked, {
        restockId: a.restockId, po: a.po, ref, supplier, owner, lockedCents: a.cents, deadlineMs: a.deadlineMs,
        escrowAccount: acct.account, agentId: acct.agentId, grantHash: acct.grantHash,
      });
      return { status: "success", escrowId };
    } catch (err) {
      if (agentId) await ctx.runMutation(internal.near.escrowState.freeAccount, { agentId });
      throw err;
    }
  },
});

/** Release to the supplier on Base Sepolia. The engine's three-exit rule refuses any other address before a call. */
export const release = internalAction({
  args: { escrowId: v.id("escrows"), to: v.string(), cents: v.number() },
  handler: async (ctx, { escrowId, to, cents }): Promise<{ ok: boolean; reason?: string }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) =>
      a.release({ escrow: toEscrow(e), agentId: e.agentId, to: to.toLowerCase(), cents, po: e.po, ref: e.ref, nowMs: Date.now() }));
    if (!r.ok) return { ok: false, reason: r.reason };
    const closed = r.escrow.lockedCents - r.escrow.releasedCents - r.escrow.reclaimedCents <= 0;
    await ctx.runMutation(internal.near.escrowState.moved, { escrowId, releasedCents: r.escrow.releasedCents, reclaimedCents: r.escrow.reclaimedCents, closed, outcome: "released" });
    return { ok: true };
  },
});

/** Scene 8, live: the same kind of withdraw to an off-list address, sent straight to the API, is refused by the PO account's policy. */
export const policyRefusal = internalAction({
  args: { escrowId: v.id("escrows"), to: v.string(), cents: v.number() },
  handler: async (ctx, { escrowId, to, cents }): Promise<{ refused: boolean; code?: string }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { refused: false, code: "no_escrow" };
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.policyRefusal({ agentId: e.agentId, to: to.toLowerCase(), cents, po: e.po, ref: e.ref }));
    return r.ok ? { refused: false } : { refused: true, code: r.code };
  },
});

/** Astro takes the held part back after a partial release. */
export const reclaim = internalAction({
  args: { escrowId: v.id("escrows") },
  handler: async (ctx, { escrowId }): Promise<{ ok: boolean; reason?: string }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.reclaim({ escrow: toEscrow(e), agentId: e.agentId, po: e.po, ref: e.ref, nowMs: Date.now() }));
    if (!r.ok) return { ok: false, reason: r.reason };
    await ctx.runMutation(internal.near.escrowState.moved, { escrowId, releasedCents: r.escrow.releasedCents, reclaimedCents: r.escrow.reclaimedCents, closed: true, outcome: "reclaimed" });
    return { ok: true };
  },
});

/** Kill switch: freezes the PO account. The escrow stays open; its deadline job will find the account frozen and record that. */
export const freeze = internalAction({
  args: { escrowId: v.id("escrows") },
  handler: async (ctx, { escrowId }): Promise<{ ok: boolean }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false };
    await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.freeze({ agentId: e.agentId, po: e.po }));
    return { ok: true };
  },
});

/** Scheduled at the deadline by `locked`. Refunds whatever is still held; a no-op once the escrow is closed. */
export const refundAtDeadline = internalAction({
  args: { escrowId: v.id("escrows") },
  handler: async (ctx, { escrowId }): Promise<{ ok: boolean; reason?: string }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    if (e.closed) return { ok: false, reason: "closed" };
    const r = await withProofs(ctx, LOCK_SCENE, e.restockId, (a) => a.refundIfDue({ escrow: toEscrow(e), agentId: e.agentId, po: e.po, ref: e.ref, nowMs: Date.now() }));
    if (!r.ok) return { ok: false, reason: r.reason };
    await ctx.runMutation(internal.near.escrowState.moved, { escrowId, releasedCents: r.escrow.releasedCents, reclaimedCents: r.escrow.reclaimedCents, closed: true, outcome: "refunded" });
    return { ok: true };
  },
});
