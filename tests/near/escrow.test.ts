import { describe, expect, it } from "vitest";
import { EscrowAdapter, poPolicy, testnetUnits } from "@/convex/near/escrow";
import { BASE_USDC, NEAR_USDC, grantHash, grantToken } from "@/convex/near/agentapi";
import { createEscrow } from "@/engine/escrow";
import { fakeTidepool, FAKE_BASE } from "./fakeTidepool";
import { sinkRecorder } from "./mockFetch";
import { API_KEY, testOwner } from "./agentFixtures";

const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const LOCKED = 3_800_000; // $38,000 in the story: 2,000 motors at $19.00
const RELEASE = 3_420_000; // 1,800 of 2,000 arrived

async function setup() {
  const tp = fakeTidepool();
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

  it("reuses a pool account for the next PO: it rewrites the policy instead of creating an agent", async () => {
    const s = await setup();
    const first = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    const agentsBefore = s.tp.agents.size;
    const again = await s.esc.open({ po: "1043", supplier: HAOYUN, lockedCents: 1_000_000, slot: first.agentId });
    expect(again.agentId).toBe(first.agentId);
    expect(s.tp.agents.size).toBe(agentsBefore);
    expect(s.tp.agents.get(first.agentId)!.policy.limits.per_transaction[BASE_USDC]).toBe("10000000");
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
