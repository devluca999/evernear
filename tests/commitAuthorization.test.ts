// @vitest-environment edge-runtime
// The authorization boundary between approvals and the money: every attack below goes through the
// real entry points (api.live.runStep, api.approvals.submit, internal.near.deadline.lock) against a
// fake Tidepool, and each one must end with no order wallet opened and nothing committed.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api, internal } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC } from "@/convex/near/agentapi";
import { commitTerms, liveTerms, SETTLEMENT_ASSET } from "@/convex/approvalTerms";
import { signRevoke, termsDigest } from "@/engine/approvals";
import { APPROVER_KEYS, KEYS, approveLive, authorizedRun, liveDigest, pub, setApprovers, sign } from "./approvalFixtures";

const modules = import.meta.glob("../convex/**/*.ts");
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "LIVE_ENABLED", "APPROVER_KEYS"];
const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const QUICKSHIP = "quickship-motion.testnet";
const T0 = Date.UTC(2026, 10, 10, 9);

async function world() {
  const tp = fakeTidepool();
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  Object.assign(process.env, {
    AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId, AGENT_OWNER_PUBLIC_KEY: owner.publicKey,
    AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId, LIVE_ENABLED: "1",
  });
  setApprovers();
  vi.stubGlobal("fetch", tp.fetch);
  const t = convexTest(schema, modules);
  const agentsBefore = tp.agents.size;
  const { runId } = await t.mutation(api.live.start, {});
  /** Nothing opened, nothing committed: no new agent, no transfer, no payout. */
  const nothingMoved = () => {
    expect(tp.agents.size).toBe(agentsBefore);
    expect(tp.sent.filter((s) => s.method === "POST" && /\/(transfer|withdraw)$/.test(s.path))).toHaveLength(0);
    expect(tp.payouts).toHaveLength(0);
  };
  const commit = (scenario?: "happy" | "adjusted") => t.action(api.live.runStep, { runId: runId!, step: "commit", ...(scenario ? { scenario } : {}) });
  const submit = (approval: ReturnType<typeof sign>) => t.mutation(api.approvals.submit, { approval });
  return { tp, t, runId: runId!, nothingMoved, commit, submit, agentsBefore };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("commit authorization: the money path refuses unapproved or mismatched commitments", () => {
  it("the asset in the signed terms is the asset the wallet commits", () => {
    expect(SETTLEMENT_ASSET).toBe(BASE_USDC);
    expect(liveTerms("happy")).toMatchObject({ totalCents: 6_300_000, approvalsRequired: 2, settlement: { units: "63000000" } });
  });

  it("no approvals: refused, recorded, nothing opened", async () => {
    const w = await world();
    expect(await w.commit()).toEqual({ ok: false, reason: "not_enough_approvals" });
    w.nothingMoved();
    const r = (await w.t.query(api.live.getRun, { runId: w.runId }))!;
    expect(r.run.done).toEqual([]);
    expect(r.proofs.find((p) => p.codePath === "convex/approvals.ts#claimCommit")).toMatchObject({ kind: "refusal", response: { reason: "not_enough_approvals", valid: 0, required: 2 } });
  });

  it("one approval only", async () => {
    const w = await world();
    await approveLive(w.t, "happy", ["Luca"]);
    expect(await w.commit()).toEqual({ ok: false, reason: "not_enough_approvals" });
    w.nothingMoved();
  });

  it("the same approver twice", async () => {
    const w = await world();
    await approveLive(w.t, "happy", ["Luca", "Luca"]);
    expect(await w.commit()).toEqual({ ok: false, reason: "duplicate_approver" });
    w.nothingMoved();
  });

  it("an approver who is not pinned, or who signs under another approver's name", async () => {
    const w = await world();
    expect(await w.submit(sign("Mallory", liveDigest()))).toEqual({ ok: false, reason: "unknown_approver" });
    expect(await w.submit(sign("Mallory", liveDigest(), { as: "Jordan" }))).toEqual({ ok: false, reason: "key_mismatch" });
    await approveLive(w.t, "happy", ["Luca"]);
    expect(await w.commit()).toEqual({ ok: false, reason: "not_enough_approvals" });
    w.nothingMoved();
  });

  it("a forged signature", async () => {
    const w = await world();
    const a = sign("Jordan", liveDigest());
    expect(await w.submit({ ...a, signature: a.signature.replace(/^./, (c) => (c === "0" ? "1" : "0")) })).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("expired approvals", async () => {
    const w = await world();
    await approveLive(w.t);
    vi.setSystemTime(T0 + 2 * 3_600_000); // the fixtures sign for one hour
    expect(await w.commit()).toEqual({ ok: false, reason: "expired" });
    w.nothingMoved();
  });

  it("approvals for another supplier, a smaller amount, another wallet or an older PO version do not match the terms committed", async () => {
    const w = await world();
    const other = [
      commitTerms({ po: "1042", supplierAddress: QUICKSHIP, quantity: 50, unitCents: 126_000 })!, // another supplier and wallet
      commitTerms({ po: "1042", supplierAddress: HAOYUN, quantity: 50, unitCents: 120_000 })!, // smaller amount
      commitTerms({ po: "1042", supplierAddress: HAOYUN, quantity: 44, unitCents: 126_000 })!, // other quantity
      { ...liveTerms(), termsVersion: 1 }, // obsolete PO version
      { ...liveTerms(), supplierAddress: "0x000000000000000000000000000000000000dead" }, // other payout wallet
    ];
    for (const terms of other) {
      expect(await w.submit(sign("Luca", termsDigest(terms)))).toEqual({ ok: false, reason: "terms_mismatch" });
    }
    expect(await w.commit()).toEqual({ ok: false, reason: "not_enough_approvals" });
    w.nothingMoved();
  });

  it("approvals for the $1,260 deal do not authorize the $1,320 one: changed terms need new approvals", async () => {
    const w = await world();
    await approveLive(w.t, "happy");
    expect(await w.commit("adjusted")).toEqual({ ok: false, reason: "not_enough_approvals" });
    w.nothingMoved();
  });

  it("client-controlled approval state: rows planted in the table without valid signatures are refused at the claim", async () => {
    const w = await world();
    const digest = liveDigest();
    await w.t.run(async (ctx) => {
      for (const name of ["Luca", "Jordan"]) {
        const s = sign(name, digest);
        await ctx.db.insert("commitApprovals", { ...s, signature: "00".repeat(64), po: "1042", status: "pending", at: Date.now() });
      }
    });
    expect(await w.commit()).toEqual({ ok: false, reason: "bad_signature" });
    w.nothingMoved();
  });

  it("a revoked approval, and a revoked approver", async () => {
    const w = await world();
    const luca = sign("Luca", liveDigest());
    expect(await w.submit(luca)).toEqual({ ok: true });
    expect(await w.submit(sign("Jordan", liveDigest()))).toEqual({ ok: true });
    expect(await w.t.mutation(api.approvals.revoke, { nonce: luca.nonce, signature: signRevoke(luca.nonce, KEYS.Jordan) })).toEqual({ ok: false, reason: "bad_signature" });
    expect(await w.t.mutation(api.approvals.revoke, { nonce: luca.nonce, signature: signRevoke(luca.nonce, KEYS.Luca) })).toEqual({ ok: true });
    expect(await w.commit()).toEqual({ ok: false, reason: "not_enough_approvals" });
    // Jordan's key revoked in the registry after signing.
    await approveLive(w.t, "happy", ["Luca"]);
    setApprovers(JSON.stringify([{ name: "Luca", publicKey: pub("Luca") }, { name: "Jordan", publicKey: pub("Jordan"), revoked: true }, { name: "Sam", publicKey: pub("Mallory") }]));
    expect(await w.commit()).toEqual({ ok: false, reason: "approver_revoked" });
    w.nothingMoved();
  });

  it("no approver keys configured: fail closed", async () => {
    const w = await world();
    await approveLive(w.t);
    delete process.env.APPROVER_KEYS;
    expect(await w.commit()).toEqual({ ok: false, reason: "approvals_not_configured" });
    w.nothingMoved();
  });

  it("two approvals for exactly these terms: committed once, and the approvals cannot be replayed", async () => {
    const w = await world();
    const luca = sign("Luca", liveDigest()), jordan = sign("Jordan", liveDigest());
    expect(await w.submit(luca)).toEqual({ ok: true });
    expect(await w.submit(jordan)).toEqual({ ok: true });
    expect(await w.commit()).toEqual({ ok: true });
    expect(w.tp.agents.size).toBe(w.agentsBefore + 1);
    const r = (await w.t.query(api.live.getRun, { runId: w.runId }))!;
    expect(r.run.commit).toMatchObject({ digest: liveDigest(), approvers: ["Luca", "Jordan"] });
    expect(r.proofs.find((p) => p.kind === "approval")?.label).toMatch(/Commit authorized: Luca and Jordan signed these exact terms/);
    // The same signed approvals, submitted again for a new run, are refused.
    expect(await w.submit(luca)).toEqual({ ok: false, reason: "replayed" });
    expect(await w.submit(jordan)).toEqual({ ok: false, reason: "replayed" });
  });

  it("two concurrent commit requests open one wallet", async () => {
    const w = await world();
    await approveLive(w.t);
    const [a, b] = await Promise.all([w.commit(), w.commit()]);
    const results = [a, b];
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.find((x) => !x.ok)).toEqual({ ok: false, reason: "step_in_progress" });
    expect(w.tp.agents.size).toBe(w.agentsBefore + 1);
  });

  it("two concurrent advance requests send one withdraw, and the run can still go on", async () => {
    const w = await world();
    await approveLive(w.t);
    expect(await w.commit()).toEqual({ ok: true });
    const adv = () => w.t.action(api.live.runStep, { runId: w.runId, step: "advance" });
    const results = await Promise.all([adv(), adv()]);
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    expect(results.find((x) => !x.ok)).toEqual({ ok: false, reason: "step_in_progress" });
    expect(w.tp.sent.filter((s) => s.method === "POST" && s.path.endsWith("/withdraw"))).toHaveLength(1);
    const r = (await w.t.query(api.live.getRun, { runId: w.runId }))!;
    expect(r.run.done).toEqual(["commit", "advance"]);
    expect(r.proofs.filter((p) => p.kind === "payout")).toHaveLength(1);
    expect(await w.t.action(api.live.runStep, { runId: w.runId, step: "pay" })).toEqual({ ok: true });
  });

  it("a PO already funded in an open wallet cannot be committed again, even with fresh approvals", async () => {
    const w = await world();
    await approveLive(w.t);
    expect(await w.commit()).toEqual({ ok: true });
    // A second run for the same PO while the first wallet still holds the money.
    vi.setSystemTime(T0 + 31 * 60_000);
    const second = (await w.t.mutation(api.live.start, {})).runId!;
    await approveLive(w.t);
    expect(await w.t.action(api.live.runStep, { runId: second, step: "commit" })).toEqual({ ok: false, reason: "po_already_committed" });
    expect(w.tp.agents.size).toBe(w.agentsBefore + 1);
  });

  it("the alternate path: calling the wallet's lock directly without a claimed, matching authorization", async () => {
    const w = await world();
    const lock = (a: { runId?: typeof w.runId; cents: number; supplier?: string }) => w.t.action(internal.near.deadline.lock, { po: "1042", supplier: a.supplier ?? HAOYUN, cents: a.cents, orderedQty: 50, deadlineMs: T0 + 86_400_000, ...(a.runId ? { runId: a.runId } : {}) });
    expect(await lock({ cents: 6_300_000 })).toEqual({ status: "refused", reason: "no_authorization" });
    expect(await lock({ runId: w.runId, cents: 6_300_000 })).toEqual({ status: "refused", reason: "not_claimed" });
    // A run authorized for $63,000 cannot lock $66,000, nor pay into another supplier's terms.
    const authorized = await authorizedRun(w.t, { po: "1042", supplierAddress: HAOYUN, quantity: 50, unitCents: 126_000 });
    expect(await lock({ runId: authorized, cents: 6_600_000 })).toEqual({ status: "refused", reason: "terms_mismatch" });
    expect(await lock({ runId: authorized, cents: 6_300_000, supplier: QUICKSHIP })).toEqual({ status: "refused", reason: "terms_mismatch" });
    w.nothingMoved();
    const proofs = await w.t.run((ctx) => ctx.db.query("proofs").collect());
    expect(proofs.filter((p) => p.codePath === "convex/near/deadline.ts#lock" && p.kind === "refusal")).toHaveLength(4);
  });

  it("the registry is pinned from the environment: approvals keyed to the test approvers", () => {
    expect(JSON.parse(APPROVER_KEYS).map((a: { name: string }) => a.name)).toEqual(["Luca", "Jordan"]);
  });
});
