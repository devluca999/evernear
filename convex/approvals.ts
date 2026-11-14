// Commit approvals on the server. Approvers sign the exact terms on their own devices
// (scripts/approve.mts or the /approve page, engine/approvals.ts signApproval) and submit the signature here; the server
// never holds an approver's key. claimCommit is the authorization boundary: in one transaction it
// recomputes the terms from what is about to be committed, verifies two distinct pinned approvers
// over that digest, spends their nonces and claims the run's commit, before any call moves money.
// convex/near/deadline.ts lock checks the claim again right before it opens the order's wallet.
// Approver public keys are pinned in the APPROVER_KEYS env variable; when it is missing or has too
// few keys, every commit is refused (`approvals_not_configured`): fail closed.
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { base58 } from "@scure/base";
import { v } from "convex/values";
import { parseApprovers, termsDigest, verifyApprovals, verifyRevoke, verifySignature, type SignedApproval } from "../engine/approvals";
import { commitTerms, liveTerms, type Scenario } from "./approvalTerms";

const scenarioArg = v.optional(v.union(v.literal("happy"), v.literal("adjusted")));
const approvers = () => parseApprovers(process.env.APPROVER_KEYS);
const approvalArg = v.object({ approver: v.string(), publicKey: v.string(), digest: v.string(), nonce: v.string(), issuedAt: v.number(), expiresAt: v.number(), signature: v.string(),
  accountId: v.optional(v.string()), scheme: v.optional(v.union(v.literal("ed25519"), v.literal("nep413"))) });

/** What an approver is asked to sign: the live order's terms and their digest, and who has signed so far. */
export const terms = query({
  args: { scenario: scenarioArg },
  handler: async (ctx, { scenario }) => {
    const t = liveTerms(scenario as Scenario | undefined);
    const digest = termsDigest(t);
    const pending = await ctx.db.query("commitApprovals").withIndex("by_digest_status", (q) => q.eq("digest", digest).eq("status", "pending")).take(20);
    return { terms: t, digest, approvers: approvers().filter((a) => !a.revoked).map((a) => a.name), signed: [...new Set(pending.filter((p) => p.expiresAt > Date.now()).map((p) => p.approver))] };
  },
});

/**
 * An approver's signed approval. Checked on arrival (pinned key, signature, terms of a live order,
 * fresh nonce) so junk is refused early; claimCommit checks everything again before money moves.
 */
export const submit = mutation({
  args: { approval: approvalArg },
  handler: async (ctx, { approval: a }): Promise<{ ok: boolean; reason?: string }> => {
    const reg = approvers().find((x) => x.name === a.approver);
    if (!reg) return { ok: false, reason: "unknown_approver" };
    if (reg.revoked) return { ok: false, reason: "approver_revoked" };
    if (reg.publicKey !== a.publicKey) return { ok: false, reason: "key_mismatch" };
    if (reg.accountId && (a.scheme !== "nep413" || a.accountId !== reg.accountId)) return { ok: false, reason: "key_mismatch" };
    if (!verifySignature(a)) return { ok: false, reason: "bad_signature" };
    const live = (["happy", "adjusted"] as const).map((s) => liveTerms(s));
    const t = live.find((x) => termsDigest(x) === a.digest);
    if (!t) return { ok: false, reason: "terms_mismatch" };
    if (Date.now() >= a.expiresAt) return { ok: false, reason: "expired" };
    if (await ctx.db.query("commitApprovals").withIndex("by_nonce", (q) => q.eq("nonce", a.nonce)).first()) return { ok: false, reason: "replayed" };
    await ctx.db.insert("commitApprovals", { ...a, po: t.po, status: "pending", at: Date.now() });
    return { ok: true };
  },
});

/** An approver withdraws an approval that was not spent yet, signed with the same key. */
export const revoke = mutation({
  args: { nonce: v.string(), signature: v.string() },
  handler: async (ctx, { nonce, signature }): Promise<{ ok: boolean; reason?: string }> => {
    const row = await ctx.db.query("commitApprovals").withIndex("by_nonce", (q) => q.eq("nonce", nonce)).first();
    if (!row) return { ok: false, reason: "not_found" };
    if (!verifyRevoke(nonce, signature, row.publicKey)) return { ok: false, reason: "bad_signature" };
    if (row.status === "consumed") return { ok: false, reason: "already_consumed" };
    await ctx.db.patch(row._id, { status: "revoked" });
    return { ok: true };
  },
});

/**
 * The authorization boundary for a live commit. Atomic: verifies the approvals for the terms the
 * server is about to commit, consumes their nonces and claims the run's commit, or records why not.
 * A second claim on the same run is refused, so two concurrent commits cannot both pass.
 */
export const claimCommit = internalMutation({
  args: { runId: v.id("liveRuns"), scenario: scenarioArg },
  handler: async (ctx, { runId, scenario }): Promise<{ ok: true; digest: string } | { ok: false; reason: string }> => {
    const run = await ctx.db.get(runId);
    if (!run) return { ok: false, reason: "no_run" };
    if (run.commit) return { ok: false, reason: "commit_already_claimed" };
    const t = liveTerms(scenario as Scenario | undefined);
    const digest = termsDigest(t);
    // One open commitment per PO: a PO already funded in a wallet that is not settled cannot be committed again.
    const open = (await ctx.db.query("escrows").withIndex("by_po", (q) => q.eq("po", t.po)).collect())
      .find((e) => !e.closed && e.lifecycle !== "closed" && e.lifecycle !== "settled" && e.lockedCents - e.releasedCents - e.reclaimedCents > 0);
    if (open) return { ok: false, reason: "po_already_committed" };
    // Also any other run that claimed a commit for this PO and has not provably finished: its money
    // may have moved even if no escrow row was written (a failure between the transfer and the row).
    const recent = await ctx.db.query("liveRuns").withIndex("by_started").order("desc").take(200);
    const pending = [];
    for (const r of recent) {
      if (r._id === runId || !r.commit || r.commitResolved || (r.commit.po ?? t.po) !== t.po || r.done.includes("reclaim")) continue;
      const e = r.escrowId ? await ctx.db.get(r.escrowId) : null;
      if (e && (e.closed || e.lifecycle === "closed" || e.lifecycle === "settled")) continue;
      pending.push(r._id);
    }
    if (pending.length) return { ok: false, reason: "po_commit_unresolved" };
    const rows = await ctx.db.query("commitApprovals").withIndex("by_digest_status", (q) => q.eq("digest", digest).eq("status", "pending")).take(50);
    const consumed = new Set<string>();
    for (const r of rows) {
      const spent = await ctx.db.query("commitApprovals").withIndex("by_nonce", (q) => q.eq("nonce", r.nonce)).collect();
      if (spent.some((x) => x.status === "consumed")) consumed.add(r.nonce);
    }
    const approvals: SignedApproval[] = rows.map(({ approver, publicKey, digest: d, nonce, issuedAt, expiresAt, signature, accountId, scheme }) => ({ approver, publicKey, digest: d, nonce, issuedAt, expiresAt, signature, ...(accountId ? { accountId } : {}), ...(scheme ? { scheme } : {}) }));
    const res = verifyApprovals({ terms: t, approvals, approvers: approvers(), nowMs: Date.now(), consumed });
    if (!res.ok) {
      await ctx.db.insert("proofs", {
        runId, scene: 6, kind: "refusal", label: `Commit refused before any call: ${res.valid} of ${res.required} valid approvals for these exact terms (${res.reason})`,
        call: "engine/approvals.ts verifyApprovals", codePath: "convex/approvals.ts#claimCommit", network: "offchain", hash: "none",
        response: { status: "refused", reason: res.reason, valid: res.valid, required: res.required, digest, po: t.po, total_cents: t.totalCents, supplier: t.supplierAddress, verdicts: res.verdicts },
        replay: false, synthetic: false, at: Date.now(),
      });
      return { ok: false, reason: res.reason };
    }
    for (const r of rows) if (res.nonces.includes(r.nonce)) await ctx.db.patch(r._id, { status: "consumed", runId });
    await ctx.db.patch(runId, { commit: { digest, po: t.po, approvers: res.approvers, nonces: res.nonces, claimedAt: Date.now() } });
    await ctx.db.insert("proofs", {
      runId, scene: 6, kind: "approval", label: `Commit authorized: ${res.approvers.join(" and ")} signed these exact terms (${t.quantity} x ${t.unitCents / 100} USD to ${t.supplierAddress})`,
      call: "engine/approvals.ts verifyApprovals", codePath: "convex/approvals.ts#claimCommit", network: "offchain", hash: digest,
      response: { status: "authorized", digest, approvers: res.approvers, nonces: res.nonces, terms: t }, replay: false, synthetic: false, at: Date.now(),
    });
    return { ok: true, digest };
  },
});

/**
 * Checked by convex/near/deadline.ts lock right before the wallet is opened: the run claimed its
 * commit for exactly these terms, and the approvals it consumed are still on record for it.
 */
export const commitAuthorized = internalQuery({
  args: { runId: v.id("liveRuns"), po: v.string(), supplierAddress: v.string(), quantity: v.number(), unitCents: v.number() },
  handler: async (ctx, a): Promise<{ ok: boolean; reason?: string; digest?: string }> => {
    const t = commitTerms(a);
    if (!t) return { ok: false, reason: "bad_terms" };
    const digest = termsDigest(t);
    if (t.approvalsRequired === 0) return { ok: true, digest };
    const run = await ctx.db.get(a.runId);
    if (!run?.commit) return { ok: false, reason: "not_claimed" };
    if (run.commit.digest !== digest) return { ok: false, reason: "terms_mismatch" };
    const used = await ctx.db.query("commitApprovals").withIndex("by_run", (q) => q.eq("runId", a.runId)).collect();
    const ok = used.filter((u) => u.status === "consumed" && u.digest === digest);
    if (new Set(ok.map((u) => u.approver)).size < t.approvalsRequired) return { ok: false, reason: "not_enough_approvals" };
    return { ok: true, digest };
  },
});

/**
 * Operator only (internal, run from the dashboard or CLI): after checking the order account by hand,
 * mark a claimed commit that never produced an escrow row as resolved, so it stops blocking its PO.
 */
export const resolveCommit = internalMutation({
  args: { runId: v.id("liveRuns") },
  handler: async (ctx, { runId }) => { if (await ctx.db.get(runId)) await ctx.db.patch(runId, { commitResolved: true }); },
});

/**
 * For approvers pinned as NEAR testnet accounts: asks NEAR testnet RPC whether each pinned key is a
 * full-access key of its account right now. A key the account removed, or never had, shows false;
 * the operator then revokes it in APPROVER_KEYS. Reads only.
 */
export const checkApproverKeys = action({
  args: {},
  handler: async (): Promise<{ name: string; accountId?: string; fullAccess: boolean | null; detail?: string }[]> => {
    const out = [];
    for (const a of approvers()) {
      if (!a.accountId) { out.push({ name: a.name, fullAccess: null, detail: "not a NEAR account approver" }); continue; }
      const key = "ed25519:" + base58.encode(Uint8Array.from(a.publicKey.match(/../g)!.map((h) => parseInt(h, 16))));
      try {
        const r = await fetch(process.env.NEAR_TESTNET_RPC ?? "https://rpc.testnet.near.org", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key", finality: "final", account_id: a.accountId, public_key: key } }) });
        const j = await r.json() as { result?: { permission?: unknown; error?: string }; error?: { cause?: { name?: string } } };
        const detail = j.error ? (j.error.cause?.name ?? "rpc_error") : j.result?.error ? "access_key_not_found" : j.result?.permission !== "FullAccess" ? "not_full_access" : undefined;
        out.push({ name: a.name, accountId: a.accountId, fullAccess: j.result?.permission === "FullAccess", ...(detail ? { detail } : {}) });
      } catch (e) {
        out.push({ name: a.name, accountId: a.accountId, fullAccess: null, detail: (e as Error).message.slice(0, 80) });
      }
    }
    return out;
  },
});
