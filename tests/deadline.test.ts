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
import type { Id } from "@/convex/_generated/dataModel";
import { authorizedRun, setApprovers } from "./approvalFixtures";

const modules = import.meta.glob("../convex/**/*.ts");
const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
const DAY = 86_400_000;
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "APPROVER_KEYS"];

/** A fake Tidepool with Astro's treasury holding 100 Base USDC, and the env Convex reads. */
async function world(tp = fakeTidepool()) {
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  Object.assign(process.env, {
    AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId,
    AGENT_OWNER_PUBLIC_KEY: owner.publicKey, AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId,
  });
  setApprovers();
  vi.stubGlobal("fetch", tp.fetch);
  const treasuryAccount = tp.agents.get(treasuryId)!.account;
  return { tp, treasuryId, treasuryAccount, t: convexTest(schema, modules) };
}

const transfers = (tp: ReturnType<typeof fakeTidepool>) => tp.sent.filter((s) => s.method === "POST" && s.path.endsWith("/transfer")).map((s) => s.body);

async function lockPo(t: ReturnType<typeof convexTest>, po = "1042") {
  const runId = await authorizedRun(t, { po, supplierAddress: HAOYUN, quantity: 50, unitCents: cents(1260) });
  const r = await t.action(internal.near.deadline.lock, { runId, po, supplier: HAOYUN, cents: cents(63000), orderedQty: 50, deadlineMs: T0 + DAY });
  expect(r.status).toBe("success");
  return r.escrowId!;
}

/** The advance, then the balance for the 44 counted at the dock. */
const advance = (t: ReturnType<typeof convexTest>, escrowId: Id<"escrows">) => t.action(internal.near.deadline.releaseStage, { escrowId, stage: "advance", to: HAOYUN });
const balance = (t: ReturnType<typeof convexTest>, escrowId: Id<"escrows">, dockCount = 44) => t.action(internal.near.deadline.releaseStage, { escrowId, stage: "balance", to: HAOYUN, dockCount });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("commit and deadline refund on the Agent API", () => {
  it("commits $63.00 (1:1,000 of $63,000) into a PO account and stores no token", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e).toMatchObject({ po: "1042", supplier: HAOYUN, owner: treasuryAccount, lockedCents: cents(63000), orderedQty: 50, scale: 1000, closed: false, lifecycle: "funded", releasePath: "server" });
    expect(tp.agents.get(e.agentId)!.balances[BASE_USDC]).toBe(63_000_000n);
    const dump = JSON.stringify(await t.run(async (ctx) => [await ctx.db.query("escrows").collect(), await ctx.db.query("proofs").collect()]));
    expect(dump).not.toContain(API_KEY);
    expect(dump).not.toContain(grantToken(API_KEY, `pool:${e.agentId}`));
    expect(dump).not.toMatch(/ngt_|naa_/);
  });

  it("refunds Astro in full when nothing was released by the deadline", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(transfers(tp).at(-1)).toEqual({ asset: BASE_USDC, amount: "63000000", recipient: treasuryAccount });
    expect(await t.run((ctx) => ctx.db.get(escrowId))).toMatchObject({ closed: true, lifecycle: "closed", reclaimedCents: cents(63000), releasedCents: 0, outcome: "refunded" });
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

  it("pays the advance and the balance, then refunds the $7,560 held for the 6 missing to Astro at the deadline", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    vi.advanceTimersByTime(DAY / 4);
    expect(await advance(t, escrowId)).toEqual({ ok: true, walletClosed: false, amountCents: cents(18900), releasePath: "server" });
    expect((await t.run((ctx) => ctx.db.get(escrowId)))!.lifecycle).toBe("advance_released");
    vi.advanceTimersByTime(DAY / 4);
    expect(await balance(t, escrowId)).toEqual({ ok: true, walletClosed: false, amountCents: cents(36540), releasePath: "server" });
    expect((await t.run((ctx) => ctx.db.get(escrowId)))!.lifecycle).toBe("balance_released");
    expect(tp.payouts.map((p) => [p.chain, p.recipient, p.amount])).toEqual([["base", HAOYUN, 18_900_000n], ["base", HAOYUN, 36_540_000n]]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(transfers(tp).at(-1)).toEqual({ asset: BASE_USDC, amount: "7560000", recipient: treasuryAccount });
    expect(await t.run((ctx) => ctx.db.get(escrowId))).toMatchObject({ releasedCents: cents(55440), reclaimedCents: cents(7560), closed: true, lifecycle: "closed", outcome: "refunded" });
  });

  it("refuses a stage whose signal is missing before any call, and records the refusal with its name", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    await advance(t, escrowId);
    const n = tp.sent.length;
    // No dock count yet: the balance waits for it.
    expect(await t.action(internal.near.deadline.releaseStage, { escrowId, stage: "balance", to: HAOYUN })).toMatchObject({ ok: false, reason: "missing_signal", missing: ["dock_count"] });
    expect(tp.sent.length).toBe(n);
    expect(tp.payouts).toHaveLength(1);
    const refusal = (await t.query(api.proofs.latest, {})).find((p) => p.kind === "refusal");
    expect(refusal).toMatchObject({ label: "Balance refused before any call: missing dock_count", response: { missing: ["dock_count"] } });
  });

  it("records the simulated feed's signals as proofs, labelled so", async () => {
    const { t } = await world();
    const escrowId = await lockPo(t);
    await advance(t, escrowId);
    await balance(t, escrowId);
    const signals = (await t.query(api.proofs.latest, { limit: 50 })).filter((p) => p.kind === "signal").map((p) => p.response.event).sort();
    expect(signals).toEqual(["bill_of_lading", "dock_count", "export_cleared", "import_cleared"]);
    expect((await t.query(api.proofs.latest, { limit: 50 })).filter((p) => p.kind === "signal").every((p) => p.label.endsWith("(simulated feed)"))).toBe(true);
  });

  it("cancels the refund and closes the wallet once the whole order arrived and was paid", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    await advance(t, escrowId);
    expect(await balance(t, escrowId, 50)).toEqual({ ok: true, walletClosed: true, amountCents: cents(44100), releasePath: "server" });
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

  it("reclaims the held $7,560, which closes the escrow", async () => {
    const { t, tp, treasuryAccount } = await world();
    const escrowId = await lockPo(t);
    await advance(t, escrowId);
    await balance(t, escrowId);
    expect(await t.action(internal.near.deadline.reclaim, { escrowId })).toEqual({ ok: true, walletClosed: true });
    expect(transfers(tp).at(-1)).toEqual({ asset: BASE_USDC, amount: "7560000", recipient: treasuryAccount });
    expect(await t.run((ctx) => ctx.db.get(escrowId))).toMatchObject({ closed: true, lifecycle: "closed", outcome: "reclaimed" });
  });

  it("refuses a wrong address twice: in code, and live in the PO account's policy", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    expect(await t.action(internal.near.deadline.releaseStage, { escrowId, stage: "advance", to: "0x000000000000000000000000000000000000dEaD" })).toMatchObject({ ok: false, reason: "address_not_allowed" });
    expect(await t.action(internal.near.deadline.policyRefusal, { escrowId, to: "0x000000000000000000000000000000000000dEaD", cents: cents(36540) })).toEqual({ refused: true, code: "policy_destination_denied" });
    expect(tp.payouts).toEqual([]);
    const refusals = (await t.query(api.proofs.latest, {})).filter((p) => p.kind === "refusal");
    expect(refusals.map((p) => p.codePath).sort()).toEqual(["convex/near/escrow.ts#policyRefusal", "convex/near/escrow.ts#release"]);
  });

  it("gives each order its own account: a closed order's account is never handed to a later one", async () => {
    const { t, tp } = await world();
    const first = await lockPo(t, "1042");
    await advance(t, first);
    await balance(t, first, 50);
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
    const runId = await authorizedRun(t, { po: "1099", supplierAddress: HAOYUN, quantity: 1, unitCents: cents(100) });
    expect(await t.action(internal.near.deadline.lock, { runId, po: "1099", supplier: HAOYUN, cents: cents(100), orderedQty: 1, deadlineMs: T0 + DAY })).toEqual({ status: "refused", reason: "accounts_full" });
    expect(tp.agents.size).toBe(n);
    const refusal = (await t.query(api.proofs.latest, {})).find((p) => p.codePath === "convex/near/escrow.ts#open" && p.kind === "refusal");
    expect(refusal).toMatchObject({ scene: 6, label: "This key has used all 3 order wallets; a new Tidepool key is needed", response: { reason: "accounts_full", limit: 3, used: 3 } });
    expect(await t.run((ctx) => ctx.db.query("escrows").collect())).toHaveLength(2);
  });

  it("records the Wallet closed proof once settled, and walks the lifecycle funded, advance released, balance released, closed", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    const life = async () => (await t.run((ctx) => ctx.db.get(escrowId)))!.lifecycle;
    expect(await life()).toBe("funded");
    await advance(t, escrowId);
    expect(await life()).toBe("advance_released");
    await balance(t, escrowId);
    expect(await life()).toBe("balance_released");
    await t.action(internal.near.deadline.reclaim, { escrowId });
    expect(await life()).toBe("closed");
    const proofs = await t.query(api.proofs.latest, {});
    expect(proofs.filter((p) => p.label.startsWith("Wallet closed"))).toEqual([expect.objectContaining({ kind: "wallet", codePath: "convex/near/escrow.ts#close", synthetic: false, scene: 8 })]);
    const e = (await t.run((ctx) => ctx.db.get(escrowId)))!;
    expect(e.grantId).toBeDefined();
    expect(tp.agents.get(e.agentId)!.grants).toEqual([]);
  });

  it("a closed escrow refuses both stages, reclaim, refund, the off-list probe and the kill switch, with no API call", async () => {
    const { t, tp } = await world();
    const escrowId = await lockPo(t);
    await advance(t, escrowId);
    await balance(t, escrowId, 50);
    const n = tp.sent.length;
    vi.advanceTimersByTime(2 * DAY);
    expect(await advance(t, escrowId)).toMatchObject({ ok: false, reason: "closed" });
    expect(await balance(t, escrowId)).toMatchObject({ ok: false, reason: "closed" });
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
    await advance(t, escrowId);
    const r = await balance(t, escrowId, 50);
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
    expect(tp.agents.get(e.agentId)!.balances[BASE_USDC]).toBe(63_000_000n);
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
