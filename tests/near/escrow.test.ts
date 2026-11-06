import { describe, expect, it } from "vitest";
import { AccountsFull, EscrowAdapter, poPolicy, testnetUnits } from "@/convex/near/escrow";
import { BASE_USDC, NEAR_USDC, grantHash, grantToken } from "@/convex/near/agentapi";
import { createEscrow } from "@/engine/escrow";
import { fakeTidepool, FAKE_BASE } from "./fakeTidepool";
import { sinkRecorder } from "./mockFetch";
import { API_KEY, testOwner } from "./agentFixtures";

const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const LOCKED = 3_800_000; // $38,000 in the story: 2,000 motors at $19.00
const RELEASE = 3_420_000; // 1,800 of 2,000 arrived

async function setup(tp = fakeTidepool()) {
  const { owner } = testOwner();
  const { proofs, sink } = sinkRecorder();
  // Astro's treasury agent, as scripts made it: transfer and swap, any destination.
  const boot = new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {}, treasuryId: "pending" });
  const treasuryId = await boot.createTreasury();
  const esc = new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink, treasuryId });
  const treasuryAccount = await esc.treasuryAccount();
  return { tp, esc, proofs, treasuryId, treasuryAccount };
}

async function openAndLock(s: Awaited<ReturnType<typeof setup>>, ref = "run1") {
  s.tp.credit(s.treasuryId, BASE_USDC, 100_000_000n);
  const acct = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
  const lock = await s.esc.lock({ po: "1042", ref, agentId: acct.agentId, account: acct.account, cents: LOCKED });
  const escrow = createEscrow({ supplier: HAOYUN, owner: s.treasuryAccount, lockedCents: LOCKED, deadlineMs: 10_000 });
  return { acct, lock, escrow };
}

describe("testnet scale", () => {
  it("runs the story amounts at 1:1,000 in 6 decimal USDC units", () => {
    expect(testnetUnits(LOCKED)).toBe(38_000_000n); // $38.00
    expect(testnetUnits(RELEASE)).toBe(34_200_000n); // $34.20
    expect(testnetUnits(LOCKED - RELEASE)).toBe(3_800_000n); // $3.80
  });
});

describe("PO account policy", () => {
  it("only lets money go to Haoyun on Base or back to Astro, at most the PO amount per transaction", () => {
    const p = poPolicy({ supplier: HAOYUN, owner: "astro", lockedCents: LOCKED });
    expect(p.frozen).toBe(false);
    expect(p.actions).toEqual(["transfer", "withdraw"]);
    expect(p.destinations).toEqual({ mode: "only", list: [
      { action: "withdraw", chain: "base", address: HAOYUN, memo: null },
      { action: "transfer", address: "astro", confidential: false },
    ] });
    expect(p.limits.per_transaction).toEqual({ [BASE_USDC]: "38000000" });
  });
});

describe("EscrowAdapter on the Agent API", () => {
  it("opens one PO account owned by Astro with that policy, and stores only the grant hash", async () => {
    const s = await setup();
    const acct = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    const a = s.tp.agents.get(acct.agentId)!;
    expect(a.policy).toEqual(poPolicy({ supplier: HAOYUN, owner: s.treasuryAccount, lockedCents: LOCKED }));
    expect(acct.grantHash).toBe(grantHash(grantToken(API_KEY, `pool:${acct.agentId}`)));
    expect(a.grants).toEqual([acct.grantHash]);
    expect(JSON.stringify(acct)).not.toMatch(/ngt_/);
  });

  it("commits exactly $38.00 from Astro's treasury into the PO account", async () => {
    const s = await setup();
    const { acct, lock } = await openAndLock(s);
    expect(lock.ok).toBe(true);
    expect(s.tp.agents.get(acct.agentId)!.balances[BASE_USDC]).toBe(38_000_000n);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "escrow", codePath: "convex/near/escrow.ts#lock", network: "testnet" });
  });

  it("releases exactly $34.20 to Haoyun on Base Sepolia, then returns the held $3.80 to Astro", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const r = await s.esc.release({ escrow, agentId: acct.agentId, to: HAOYUN, cents: RELEASE, po: "1042", ref: "run1", nowMs: 1 });
    expect(r.ok).toBe(true);
    expect(s.tp.payouts).toEqual([expect.objectContaining({ chain: "base", recipient: HAOYUN, asset: BASE_USDC, amount: 34_200_000n })]);
    const pay = s.proofs.at(-1)!;
    expect(pay).toMatchObject({ kind: "payout", codePath: "convex/near/escrow.ts#release" });
    expect(pay.explorerUrl).toMatch(/^https:\/\/sepolia\.basescan\.org\/tx\/0x/);
    if (!r.ok) throw new Error();
    const back = await s.esc.reclaim({ escrow: r.escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 2 });
    expect(back.ok).toBe(true);
    expect(s.tp.agents.get(acct.agentId)!.balances[BASE_USDC]).toBe(0n);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "reclaim" });
  });

  it("refuses a release to any other address in code first, with a proof, and never calls the API", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const before = s.tp.sent.length;
    const r = await s.esc.release({ escrow, agentId: acct.agentId, to: "0x000000000000000000000000000000000000dead", cents: RELEASE, po: "1042", ref: "run1", nowMs: 1 });
    expect(r).toEqual({ ok: false, reason: "address_not_allowed" });
    expect(s.tp.sent.length).toBe(before);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", codePath: "convex/near/escrow.ts#release" });
  });

  it("shows the second layer live: the same withdraw sent to the API is refused by the PO account's policy", async () => {
    const s = await setup();
    const { acct } = await openAndLock(s);
    const r = await s.esc.policyRefusal({ agentId: acct.agentId, to: "0x000000000000000000000000000000000000dead", cents: RELEASE, po: "1042", ref: "run1" });
    expect(r).toMatchObject({ ok: false, code: "policy_destination_denied", layer: "policy" });
    expect(s.tp.payouts).toEqual([]);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", codePath: "convex/near/escrow.ts#policyRefusal", response: { code: "policy_destination_denied" } });
  });

  it("refunds everything still held to Astro after the deadline, and nothing before it", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    expect(await s.esc.refundIfDue({ escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 10_000 })).toEqual({ ok: false, reason: "not_due" });
    const r = await s.esc.refundIfDue({ escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 10_001 });
    expect(r.ok).toBe(true);
    expect(s.tp.agents.get(acct.agentId)!.balances[BASE_USDC]).toBe(0n);
    expect(s.tp.agents.get(s.treasuryId)!.balances[BASE_USDC]).toBe(100_000_000n);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refund" });
  });

  it("after a partial release, the deadline refund returns only the unreclaimed held part", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const r = await s.esc.release({ escrow, agentId: acct.agentId, to: HAOYUN, cents: RELEASE, po: "1042", ref: "run1", nowMs: 1 });
    if (!r.ok) throw new Error();
    const d = await s.esc.refundIfDue({ escrow: r.escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 10_001 });
    expect(d.ok).toBe(true);
    const lastTransfer = s.tp.sent.filter((x) => x.path.endsWith("/transfer")).at(-1)!;
    expect(lastTransfer.body).toMatchObject({ asset: BASE_USDC, amount: "3800000", recipient: s.treasuryAccount });
  });

  it("opens a new account for every order: two orders, two agents, and no reuse option", async () => {
    const s = await setup();
    const first = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    const second = await s.esc.open({ po: "1043", supplier: HAOYUN, lockedCents: 1_000_000 });
    expect(second.agentId).not.toBe(first.agentId);
    expect(second.account).not.toBe(first.account);
    expect(s.tp.agents.get(first.agentId)!.policy.limits.per_transaction[BASE_USDC]).toBe("38000000");
    expect(s.tp.agents.get(second.agentId)!.policy.limits.per_transaction[BASE_USDC]).toBe("10000000");
    expect(s.tp.sent.filter((x) => x.body?.type === "policy_update")).toEqual([]);
  });

  it("closes a settled wallet: revokes Evernear's grant, freezes it and records the Wallet closed proof", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    expect(escrow.lifecycle).toBe("funded");
    const paid = await s.esc.release({ escrow, agentId: acct.agentId, to: HAOYUN, cents: RELEASE, po: "1042", ref: "run1", nowMs: 1 });
    if (!paid.ok) throw new Error();
    expect(paid.escrow.lifecycle).toBe("partly_released");
    const back = await s.esc.reclaim({ escrow: paid.escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 2 });
    if (!back.ok) throw new Error();
    expect(back.escrow.lifecycle).toBe("settled");
    const c = await s.esc.close({ escrow: back.escrow, agentId: acct.agentId, grantId: acct.grantId, po: "1042" });
    expect(c).toMatchObject({ ok: true, escrow: { closed: true, lifecycle: "closed" } });
    const a = s.tp.agents.get(acct.agentId)!;
    expect(a.policy.frozen).toBe(true);
    expect(a.grants).toEqual([]);
    expect(a.grantViews).toEqual([expect.objectContaining({ grant_id: acct.grantId, revoked_at: expect.any(String) })]);
    const intents = s.tp.sent.filter((x) => x.path === "/v1/generate-intent").map((x) => x.body.type);
    expect(intents.slice(-2)).toEqual(["grant_revoke", "agent_freeze"]);
    expect(s.proofs.at(-1)).toMatchObject({
      kind: "wallet", label: "Wallet closed: PO 1042 frozen, grant revoked, kept as the order's receipt", codePath: "convex/near/escrow.ts#close", network: "testnet",
      response: { agent_id: acct.agentId, frozen: true, grant: "revoked", lifecycle: "closed", balance: "0", reused: false }, synthetic: false,
    });
    // Revoked: even a move the policy allows is refused at the grant now.
    expect(await s.esc.policyRefusal({ agentId: acct.agentId, to: HAOYUN, cents: 1, po: "1042", ref: "after" })).toMatchObject({ ok: false, code: "grant_invalid" });
  });

  it("a closed wallet refuses release, reclaim, refund and a second close in code, and makes no API call", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const refunded = await s.esc.refundIfDue({ escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 10_001 });
    if (!refunded.ok) throw new Error();
    const c = await s.esc.close({ escrow: refunded.escrow, agentId: acct.agentId, grantId: acct.grantId, po: "1042" });
    if (!c.ok) throw new Error();
    const closed = c.escrow;
    const before = s.tp.sent.length;
    expect(await s.esc.release({ escrow: closed, agentId: acct.agentId, to: HAOYUN, cents: 1, po: "1042", ref: "run1", nowMs: 1 })).toEqual({ ok: false, reason: "closed" });
    expect(await s.esc.reclaim({ escrow: closed, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 2 })).toEqual({ ok: false, reason: "closed" });
    expect(await s.esc.refundIfDue({ escrow: closed, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 20_000 })).toEqual({ ok: false, reason: "closed" });
    expect(await s.esc.close({ escrow: closed, agentId: acct.agentId, grantId: acct.grantId, po: "1042" })).toEqual({ ok: false, reason: "closed" });
    expect(s.tp.sent.length).toBe(before);
  });

  it("will not close a wallet that still holds money, before any call", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const before = s.tp.sent.length;
    expect(await s.esc.close({ escrow, agentId: acct.agentId, grantId: acct.grantId, po: "1042" })).toEqual({ ok: false, reason: "not_settled" });
    expect(s.tp.sent.length).toBe(before);
  });

  it("refuses to open an account with accounts_full when the quota says the key is used up, and records the refusal", async () => {
    const s = await setup(fakeTidepool({ agentLimit: 2 }));
    await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    const agents = s.tp.agents.size;
    await expect(s.esc.open({ po: "1043", supplier: HAOYUN, lockedCents: LOCKED })).rejects.toBeInstanceOf(AccountsFull);
    expect(s.tp.agents.size).toBe(agents);
    expect(s.tp.sent.filter((x) => x.path === "/v1/generate-intent" && x.body.type === "agent_create")).toHaveLength(2);
    expect(s.proofs.at(-1)).toMatchObject({
      kind: "refusal", label: "This key has used all 2 order wallets; a new Tidepool key is needed", call: "GET /v1/quotas",
      codePath: "convex/near/escrow.ts#open", response: { status: "refused", reason: "accounts_full", limit: 2, used: 2 },
    });
  });

  it("without a quota answer it still refuses with accounts_full when agent_create hits the cap", async () => {
    const s = await setup(fakeTidepool({ agentLimit: 1, quotas: false }));
    await expect(s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED })).rejects.toBeInstanceOf(AccountsFull);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", call: "POST /v1/generate-intent agent_create", response: { reason: "accounts_full", code: "quota_exceeded" } });
  });

  it("the kill switch freezes the PO account: every later move is refused with wallet_frozen", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    await s.esc.freeze({ agentId: acct.agentId, po: "1042" });
    expect(s.proofs.at(-1)).toMatchObject({ kind: "freeze" });
    const r = await s.esc.release({ escrow, agentId: acct.agentId, to: HAOYUN, cents: RELEASE, po: "1042", ref: "run1", nowMs: 1 });
    expect(r).toMatchObject({ ok: false, reason: "wallet_frozen" });
    expect(s.tp.payouts).toEqual([]);
  });

  it("tops up the treasury: faucet NEAR USDC when short, then swaps into Base USDC", async () => {
    const s = await setup();
    const r = await s.esc.fund({ cents: LOCKED });
    expect(r.ok).toBe(true);
    const kinds = s.tp.sent.filter((x) => x.method === "POST" && /\/(deposit|swap)$/.test(x.path)).map((x) => x.path.split("/").at(-1));
    expect(kinds).toEqual(["deposit", "swap"]);
    expect(s.tp.agents.get(s.treasuryId)!.balances[BASE_USDC]! >= 38_000_000n).toBe(true);
    expect(s.tp.agents.get(s.treasuryId)!.balances[NEAR_USDC]).toBeDefined();
  });

  it("does not top up when the treasury already holds enough Base USDC", async () => {
    const s = await setup();
    s.tp.credit(s.treasuryId, BASE_USDC, 40_000_000n);
    expect((await s.esc.fund({ cents: LOCKED })).ok).toBe(true);
    expect(s.tp.sent.some((x) => /\/(deposit|swap)$/.test(x.path))).toBe(false);
  });
});
