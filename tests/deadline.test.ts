// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api, internal } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC, grantToken } from "@/convex/near/agentapi";
import { cents } from "@/engine/money";

const modules = import.meta.glob("../convex/**/*.ts");
const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
const DAY = 86_400_000;
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID"];

/** A fake Tidepool with Astro's treasury holding 100 Base USDC, and the env Convex reads. */
async function world(tp = fakeTidepool()) {
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  Object.assign(process.env, {
    AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId,
    AGENT_OWNER_PUBLIC_KEY: owner.publicKey, AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId,
  });
  vi.stubGlobal("fetch", tp.fetch);
  const treasuryAccount = tp.agents.get(treasuryId)!.account;
  return { tp, treasuryId, treasuryAccount, t: convexTest(schema, modules) };
}

const transfers = (tp: ReturnType<typeof fakeTidepool>) => tp.sent.filter((s) => s.method === "POST" && s.path.endsWith("/transfer")).map((s) => s.body);

async function lockPo(t: ReturnType<typeof convexTest>, po = "1042") {
  const r = await t.action(internal.near.deadline.lock, { po, supplier: HAOYUN, cents: cents(38000), deadlineMs: T0 + DAY });
  expect(r.status).toBe("success");
  return r.escrowId!;
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("commit and deadline refund on the Agent API", () => {
  it("commits $38.00 (1:1,000 of $38,000) into a PO account and stores no token", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e).toMatchObject({ po: "1042", supplier: HAOYUN, owner: treasuryAccount, lockedCents: cents(38000), scale: 1000, closed: false, lifecycle: "funded" });
    expect(tp.agents.get(e.agentId)!.balances[BASE_USDC]).toBe(38_000_000n);
    const dump = JSON.stringify(await t.run(async (ctx) => [await ctx.db.query("escrows").collect(), await ctx.db.query("proofs").collect()]));
    expect(dump).not.toContain(API_KEY);
    expect(dump).not.toContain(grantToken(API_KEY, `pool:${e.agentId}`));
    expect(dump).not.toMatch(/ngt_|naa_/);
  });

  it("refunds Astro in full when nothing was released by the deadline", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(transfers(tp).at(-1)).toEqual({ asset: BASE_USDC, amount: "38000000", recipient: treasuryAccount });
    expect(await t.run((ctx) => ctx.db.get(escrowId))).toMatchObject({ closed: true, lifecycle: "closed", reclaimedCents: cents(38000), releasedCents: 0, outcome: "refunded" });
    const proofs = await t.query(api.proofs.latest, {});
    expect(proofs.find((p) => p.kind === "refund")).toMatchObject({ network: "testnet", synthetic: false, codePath: "convex/near/escrow.ts#refund" });
  });

  it("does nothing before the deadline", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    const n = tp.sent.length;
    vi.advanceTimersByTime(DAY - 1000);
    expect(await t.action(internal.near.deadline.refundAtDeadline, { escrowId })).toEqual({ ok: false, reason: "not_due" });
    expect(tp.sent.length).toBe(n);
  });

  it("refunds the unreclaimed held part to Astro at the deadline after a partial release", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    vi.advanceTimersByTime(DAY / 2);
    expect(await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(34200) })).toEqual({ ok: true, walletClosed: false });
    expect((await t.run((ctx) => ctx.db.get(escrowId)))!.lifecycle).toBe("partly_released");
    expect(tp.payouts).toEqual([expect.objectContaining({ chain: "base", recipient: HAOYUN, amount: 34_200_000n })]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(transfers(tp).at(-1)).toEqual({ asset: BASE_USDC, amount: "3800000", recipient: treasuryAccount });
    expect(await t.run((ctx) => ctx.db.get(escrowId))).toMatchObject({ releasedCents: cents(34200), reclaimedCents: cents(3800), closed: true, lifecycle: "closed", outcome: "refunded" });
  });

  it("cancels the refund and closes the wallet once the whole amount was released", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    expect(await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(38000) })).toEqual({ ok: true, walletClosed: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e).toMatchObject({ closed: true, lifecycle: "closed", outcome: "released" });
    expect((await t.run((ctx) => ctx.db.system.get(e.refundJobId!)))?.state.kind).toBe("canceled");
    expect(tp.agents.get(e.agentId)!.policy.frozen).toBe(true);
    const n = tp.sent.length;
    vi.advanceTimersByTime(2 * DAY);
    expect(await t.action(internal.near.deadline.refundAtDeadline, { escrowId })).toEqual({ ok: false, reason: "closed" });
    expect(tp.sent.length).toBe(n);
  });

  it("reclaims the held part, which closes the escrow", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(34200) });
    expect(await t.action(internal.near.deadline.reclaim, { escrowId })).toEqual({ ok: true, walletClosed: true });
    expect(transfers(tp).at(-1)).toEqual({ asset: BASE_USDC, amount: "3800000", recipient: treasuryAccount });
    expect(await t.run((ctx) => ctx.db.get(escrowId))).toMatchObject({ closed: true, lifecycle: "closed", outcome: "reclaimed" });
  });

  it("refuses a wrong address twice: in code, and live in the PO account's policy", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    expect(await t.action(internal.near.deadline.release, { escrowId, to: "0x000000000000000000000000000000000000dEaD", cents: cents(34200) })).toEqual({ ok: false, reason: "address_not_allowed" });
    expect(await t.action(internal.near.deadline.policyRefusal, { escrowId, to: "0x000000000000000000000000000000000000dEaD", cents: cents(34200) })).toEqual({ refused: true, code: "policy_destination_denied" });
    expect(tp.payouts).toEqual([]);
    const refusals = (await t.query(api.proofs.latest, {})).filter((p) => p.kind === "refusal");
    expect(refusals.map((p) => p.codePath).sort()).toEqual(["convex/near/escrow.ts#policyRefusal", "convex/near/escrow.ts#release"]);
  });

  it("gives each order its own account: a closed order's account is never handed to a later one", async () => {
    const { t, tp } = await world();
    const first = await lockPo(t, "1042");
    await t.action(internal.near.deadline.release, { escrowId: first, to: HAOYUN, cents: cents(38000) });
    const agents = tp.agents.size;
    const second = await lockPo(t, "1043");
    const [a, b] = await t.run(async (ctx) => [await ctx.db.get(first), await ctx.db.get(second)]);
    expect(a!.lifecycle).toBe("closed");
    expect(b!.agentId).not.toBe(a!.agentId);
    expect(b!.escrowAccount).not.toBe(a!.escrowAccount);
    expect(b!.ref).not.toBe(a!.ref);
    expect(tp.agents.size).toBe(agents + 1);
    expect(tp.agents.get(a!.agentId)!.policy.frozen).toBe(true);
    expect(tp.agents.get(b!.agentId)!.policy.frozen).toBe(false);
  });

  it("two open orders use two different accounts", async () => {
    const { t } = await world();
    const [x, y] = [await lockPo(t, "1042"), await lockPo(t, "1043")];
    const [a, b] = await t.run(async (ctx) => [await ctx.db.get(x), await ctx.db.get(y)]);
    expect(a!.agentId).not.toBe(b!.agentId);
  });

  it("refuses with accounts_full when the key has no agent left, and records it as a proof row", async () => {
    const { t, tp } = await world(fakeTidepool({ agentLimit: 3 }));
    await lockPo(t, "1042");
    await lockPo(t, "1043");
    const n = tp.agents.size;
    expect(await t.action(internal.near.deadline.lock, { po: "1099", supplier: HAOYUN, cents: cents(100), deadlineMs: T0 + DAY })).toEqual({ status: "refused", reason: "accounts_full" });
    expect(tp.agents.size).toBe(n);
    const refusal = (await t.query(api.proofs.latest, {})).find((p) => p.codePath === "convex/near/escrow.ts#open" && p.kind === "refusal");
    expect(refusal).toMatchObject({ scene: 6, label: "This key has used all 3 order wallets; a new Tidepool key is needed", response: { reason: "accounts_full", limit: 3, used: 3 } });
    expect(await t.run((ctx) => ctx.db.query("escrows").collect())).toHaveLength(2);
  });

  it("records the Wallet closed proof once settled, and walks the lifecycle funded, partly released, closed", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    const life = async () => (await t.run((ctx) => ctx.db.get(escrowId)))!.lifecycle;
    expect(await life()).toBe("funded");
    await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(34200) });
    expect(await life()).toBe("partly_released");
    await t.action(internal.near.deadline.reclaim, { escrowId });
    expect(await life()).toBe("closed");
    const proofs = await t.query(api.proofs.latest, {});
    expect(proofs.filter((p) => p.label.startsWith("Wallet closed"))).toEqual([expect.objectContaining({ kind: "wallet", codePath: "convex/near/escrow.ts#close", synthetic: false, scene: 8 })]);
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e.grantId).toBeDefined();
    expect(tp.agents.get(e.agentId)!.grants).toEqual([]);
  });

  it("a closed escrow refuses release, reclaim, refund, the off-list probe and the kill switch, with no API call", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(38000) });
    const n = tp.sent.length;
    vi.advanceTimersByTime(2 * DAY);
    expect(await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(1) })).toEqual({ ok: false, reason: "closed" });
    expect(await t.action(internal.near.deadline.reclaim, { escrowId })).toEqual({ ok: false, reason: "closed" });
    expect(await t.action(internal.near.deadline.refundAtDeadline, { escrowId })).toEqual({ ok: false, reason: "closed" });
    expect(await t.action(internal.near.deadline.policyRefusal, { escrowId, to: HAOYUN, cents: cents(1) })).toEqual({ refused: false, code: "closed" });
    expect(await t.action(internal.near.deadline.freeze, { escrowId })).toEqual({ ok: false });
    expect(await t.action(internal.near.deadline.closeWallet, { escrowId })).toEqual({ ok: false, reason: "closed" });
    expect(tp.sent.length).toBe(n);
  });

  it("a failed close leaves the escrow settled, and closeWallet finishes it later", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    const realFetch = tp.fetch;
    vi.stubGlobal("fetch", (u: string, i?: RequestInit) => (i?.body && String(i.body).includes("agent_freeze") ? Promise.reject(new Error("network down")) : realFetch(u, i)));
    const r = await t.action(internal.near.deadline.release, { escrowId, to: HAOYUN, cents: cents(38000) });
    expect(r).toMatchObject({ ok: true, walletClosed: false, reason: expect.stringContaining("close_failed") });
    expect((await t.run((ctx) => ctx.db.get(escrowId)))!).toMatchObject({ closed: true, lifecycle: "settled" });
    vi.stubGlobal("fetch", realFetch);
    expect(await t.action(internal.near.deadline.closeWallet, { escrowId })).toEqual({ ok: true });
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e.lifecycle).toBe("closed");
    expect(tp.agents.get(e.agentId)!.policy.frozen).toBe(true);
    expect(tp.agents.get(e.agentId)!.grantViews.filter((g) => !g.revoked_at)).toEqual([]);
  });

  it("after the kill switch the deadline refund is refused and recorded, and nothing moves", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    await t.action(internal.near.deadline.freeze, { escrowId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e.closed).toBe(false);
    expect(tp.agents.get(e.agentId)!.balances[BASE_USDC]).toBe(38_000_000n);
    expect((await t.query(api.proofs.latest, {})).find((p) => p.kind === "refusal")).toMatchObject({ response: { code: "wallet_frozen" } });
  });

  it("refuses to run without the Agent API key in the environment", async () => {
    const { t } = await world();
    const escrowId = await lockPo(t);
    delete process.env.AGENT_API_KEY;
    vi.advanceTimersByTime(2 * DAY);
    await expect(t.action(internal.near.deadline.refundAtDeadline, { escrowId })).rejects.toThrow("AGENT_API_KEY not configured");
  });
});
