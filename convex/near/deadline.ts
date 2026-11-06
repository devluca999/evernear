// Per-PO escrow lifecycle on the Agent API, and the deadline refund (docs/NOTES.md 10.7 and 14).
// lock: open a NEW account for this order (never one used before), set its policy for this PO, top up
// Astro's treasury if needed, commit the PO total into it, then schedule the deadline refund with
// ctx.scheduler.runAt. At the deadline the job asks the engine (refundOnDeadline) and moves whatever
// is still held back to Astro's treasury. Once the escrow is settled (full release, reclaim or
// refund) the job is cancelled and the account is closed: Evernear's grant revoked, the account
// frozen, a "Wallet closed" proof recorded. A closed escrow refuses every later move before any call.
// The refund is triggered by Evernear's scheduler, not by the chain.
//
// No reuse: Tidepool never deletes agents and a key holds 25, so one key supports about 25 orders.
// When none is left, lock refuses with accounts_full and records that refusal as a proof row.
// Each run gets a fresh `ref`, which keys every idempotent call, so a rerun of the demo is a new payment.
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
import { AccountsFull, EscrowAdapter, type PoAccount } from "./escrow";
import {
  agentApiBase,
  ownerFromPkcs8,
} from "./agentapi";
import type { Fetch, ProofInput } from "./http";
import type { Escrow, Lifecycle } from "../../engine/escrow";

/** Scene numbers for the drawer: funds commit in scene 6, release in scene 8. */
const LOCK_SCENE = 6, RELEASE_SCENE = 8;

/** Rows written before `lifecycle` existed: derived from the amounts. */
const lifecycleOf = (d: Doc<"escrows">): Lifecycle => d.lifecycle
  ?? (d.lockedCents - d.releasedCents - d.reclaimedCents <= 0 ? "settled" : d.releasedCents > 0 ? "partly_released" : "funded");

const toEscrow = (d: Doc<"escrows">): Escrow => ({
  supplier: d.supplier, owner: d.owner, lockedCents: d.lockedCents, releasedCents: d.releasedCents,
  reclaimedCents: d.reclaimedCents, deadlineMs: d.deadlineMs, closed: d.closed, lifecycle: lifecycleOf(d),
});

const isClosed = (d: Doc<"escrows">) => lifecycleOf(d) === "closed";

const fetcher: Fetch = (url, init) => fetch(url, init);

function adapter(sink: (p: ProofInput) => void) {
  const env = process.env;
  const owner = env.AGENT_OWNER_PRIVATE_KEY_PKCS8 && env.AGENT_OWNER_ACCOUNT_ID && env.AGENT_OWNER_PUBLIC_KEY
    ? ownerFromPkcs8({ accountId: env.AGENT_OWNER_ACCOUNT_ID, publicKey: env.AGENT_OWNER_PUBLIC_KEY, pkcs8Base64: env.AGENT_OWNER_PRIVATE_KEY_PKCS8 })
    : undefined;
  return new EscrowAdapter({ fetch: fetcher, apiKey: env.AGENT_API_KEY, baseUrl: agentApiBase(env.AGENT_API_BASE_URL), owner, sink, treasuryId: env.AGENT_TREASURY_ID });
}

/** Runs an adapter call and stores every proof it emits, also when the call throws. */
async function withProofs<T>(ctx: ActionCtx, scene: number, restockId: Id<"restocks"> | undefined, run: (a: EscrowAdapter) => Promise<T>, runId?: Id<"liveRuns">): Promise<T> {
  const proofs: ProofInput[] = [];
  try {
    return await run(adapter((p) => { proofs.push(p); }));
  } finally {
    for (const p of proofs) await ctx.runMutation(internal.proofs.record, { ...p, restockId, runId, scene });
  }
}

/**
 * Stores a money move. Once nothing is left it closes the order's account; a failed close leaves the
 * escrow settled (its money already moved) and is reported, and closeWallet can retry it.
 */
async function store(ctx: ActionCtx, scene: number, e: Doc<"escrows">, next: Escrow, outcome: "released" | "reclaimed" | "refunded", runId?: Id<"liveRuns">): Promise<{ ok: true; walletClosed: boolean; reason?: string }> {
  const settled = next.lifecycle === "settled";
  await ctx.runMutation(internal.near.escrowState.moved, { escrowId: e._id, releasedCents: next.releasedCents, reclaimedCents: next.reclaimedCents, closed: settled, lifecycle: next.lifecycle, outcome });
  if (!settled) return { ok: true, walletClosed: false };
  try {
    const c = await withProofs(ctx, scene, e.restockId, (a) => a.close({ escrow: { ...next, closed: true }, agentId: e.agentId, grantId: e.grantId, po: e.po }), runId);
    if (!c.ok) return { ok: true, walletClosed: false, reason: c.reason };
    await ctx.runMutation(internal.near.escrowState.walletClosed, { escrowId: e._id });
    return { ok: true, walletClosed: true };
  } catch (err) {
    return { ok: true, walletClosed: false, reason: `close_failed: ${(err as Error).message}` };
  }
}

/** Opens a new account for this order, sets its policy, commits the total and starts the deadline clock. */
export const lock = internalAction({
  args: { restockId: v.optional(v.id("restocks")), runId: v.optional(v.id("liveRuns")), po: v.string(), supplier: v.string(), cents: v.number(), deadlineMs: v.number() },
  handler: async (ctx, a): Promise<{ status: string; escrowId?: Id<"escrows">; reason?: string }> => {
    const supplier = a.supplier.toLowerCase();
    let acct: PoAccount;
    try {
      acct = await withProofs(ctx, LOCK_SCENE, a.restockId, (e) => e.open({ po: a.po, supplier, lockedCents: a.cents }), a.runId);
    } catch (err) {
      if (err instanceof AccountsFull) return { status: "refused", reason: "accounts_full" };
      throw err;
    }
    const ref = `${a.po}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const r = await withProofs(ctx, LOCK_SCENE, a.restockId, async (e) => {
      const f = await e.fund({ cents: a.cents });
      if (!f.ok) return { ok: false as const, code: f.reason ?? "fund_failed" };
      return e.lock({ po: a.po, ref, agentId: acct.agentId, account: acct.account, cents: a.cents });
    }, a.runId);
    // The new account stays empty and is never handed to another order.
    if (!r.ok) return { status: "refused", reason: r.code };
    const owner = await adapter(() => {}).treasuryAccount();
    const escrowId: Id<"escrows"> = await ctx.runMutation(internal.near.escrowState.locked, {
      restockId: a.restockId, po: a.po, ref, supplier, owner, lockedCents: a.cents, deadlineMs: a.deadlineMs,
      escrowAccount: acct.account, agentId: acct.agentId, grantHash: acct.grantHash, grantId: acct.grantId,
    });
    return { status: "success", escrowId };
  },
});

/** Release to the supplier on Base Sepolia. The engine's three-exit rule refuses any other address before a call. */
export const release = internalAction({
  args: { escrowId: v.id("escrows"), to: v.string(), cents: v.number(), runId: v.optional(v.id("liveRuns")) },
  handler: async (ctx, { escrowId, to, cents, runId }): Promise<{ ok: boolean; reason?: string; walletClosed?: boolean }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) =>
      a.release({ escrow: toEscrow(e), agentId: e.agentId, to: to.toLowerCase(), cents, po: e.po, ref: e.ref, nowMs: Date.now() }), runId);
    if (!r.ok) return { ok: false, reason: r.reason };
    return store(ctx, RELEASE_SCENE, e, r.escrow, "released", runId);
  },
});

/** Scene 8, live: the same kind of withdraw to an off-list address, sent straight to the API, is refused by the PO account's policy. */
export const policyRefusal = internalAction({
  args: { escrowId: v.id("escrows"), to: v.string(), cents: v.number(), runId: v.optional(v.id("liveRuns")) },
  handler: async (ctx, { escrowId, to, cents, runId }): Promise<{ refused: boolean; code?: string }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { refused: false, code: "no_escrow" };
    if (isClosed(e)) return { refused: false, code: "closed" };
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.policyRefusal({ agentId: e.agentId, to: to.toLowerCase(), cents, po: e.po, ref: e.ref }), runId);
    return r.ok ? { refused: false } : { refused: true, code: r.code };
  },
});

/** Astro takes the held part back after a partial release. */
export const reclaim = internalAction({
  args: { escrowId: v.id("escrows"), runId: v.optional(v.id("liveRuns")) },
  handler: async (ctx, { escrowId, runId }): Promise<{ ok: boolean; reason?: string; walletClosed?: boolean }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    const r = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.reclaim({ escrow: toEscrow(e), agentId: e.agentId, po: e.po, ref: e.ref, nowMs: Date.now() }), runId);
    if (!r.ok) return { ok: false, reason: r.reason };
    return store(ctx, RELEASE_SCENE, e, r.escrow, "reclaimed", runId);
  },
});

/** Kill switch: freezes the PO account. The escrow stays open; its deadline job will find the account frozen and record that. A closed account is already frozen: no call. */
export const freeze = internalAction({
  args: { escrowId: v.id("escrows"), runId: v.optional(v.id("liveRuns")) },
  handler: async (ctx, { escrowId, runId }): Promise<{ ok: boolean }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e || isClosed(e)) return { ok: false };
    await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.freeze({ agentId: e.agentId, po: e.po }), runId);
    return { ok: true };
  },
});

/** Scheduled at the deadline by `locked`. Refunds whatever is still held; a no-op once the escrow is closed. */
export const refundAtDeadline = internalAction({
  args: { escrowId: v.id("escrows"), runId: v.optional(v.id("liveRuns")) },
  handler: async (ctx, { escrowId, runId }): Promise<{ ok: boolean; reason?: string; walletClosed?: boolean }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    if (e.closed || isClosed(e)) return { ok: false, reason: "closed" };
    const r = await withProofs(ctx, LOCK_SCENE, e.restockId, (a) => a.refundIfDue({ escrow: toEscrow(e), agentId: e.agentId, po: e.po, ref: e.ref, nowMs: Date.now() }), runId);
    if (!r.ok) return { ok: false, reason: r.reason };
    return store(ctx, LOCK_SCENE, e, r.escrow, "refunded", runId);
  },
});

/** Retries closing a settled order's account (when the close after the last move failed). Refused before any call unless settled. */
export const closeWallet = internalAction({
  args: { escrowId: v.id("escrows"), runId: v.optional(v.id("liveRuns")) },
  handler: async (ctx, { escrowId, runId }): Promise<{ ok: boolean; reason?: string }> => {
    const e = await ctx.runQuery(internal.near.escrowState.get, { escrowId });
    if (!e) return { ok: false, reason: "no_escrow" };
    const c = await withProofs(ctx, RELEASE_SCENE, e.restockId, (a) => a.close({ escrow: toEscrow(e), agentId: e.agentId, grantId: e.grantId, po: e.po }), runId);
    if (!c.ok) return { ok: false, reason: c.reason };
    await ctx.runMutation(internal.near.escrowState.walletClosed, { escrowId });
    return { ok: true };
  },
});
