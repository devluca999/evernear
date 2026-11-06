import { describe, expect, it } from "vitest";
import { AccountsFull, EscrowAdapter, poPolicy, testnetUnits, type SignalEvidence } from "@/convex/near/escrow";
import { BASE_USDC, NEAR_USDC, grantHash, grantToken } from "@/convex/near/agentapi";
import { createEscrow, type Escrow, type Stage } from "@/engine/escrow";
import { fakeTidepool, FAKE_BASE } from "./fakeTidepool";
import { sinkRecorder } from "./mockFetch";
import { API_KEY, testOwner } from "./agentFixtures";
import { evidence } from "./evidence";

const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const OFF_LIST = "0x000000000000000000000000000000000000dead";
const UNIT = 126_000; // $1,260 a motor
const LOCKED = 6_300_000; // $63,000 in the story: 50 motors at $1,260
const ADVANCE = 1_890_000; // 30%
const BALANCE = 3_654_000; // 44 arrived: 44 x $1,260 - $18,900
const HELD = 756_000; // the 6 missing

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

const stageOf = (s: Awaited<ReturnType<typeof setup>>, i: { escrow: Escrow; agentId: string; stage: Stage; ev?: SignalEvidence; to?: string; nowMs?: number }) =>
  s.esc.releaseStage({ escrow: i.escrow, agentId: i.agentId, stage: i.stage, to: i.to ?? HAOYUN, evidence: i.ev ?? evidence(i.stage), unitCents: UNIT, po: "1042", ref: "run1", nowMs: i.nowMs ?? 1, payee: "Haoyun" });

/** Advance then balance, both paid. */
async function paidBoth(s: Awaited<ReturnType<typeof setup>>, escrow: Escrow, agentId: string) {
  const a = await stageOf(s, { escrow, agentId, stage: "advance" });
  if (!a.ok) throw new Error(a.reason);
  const b = await stageOf(s, { escrow: a.escrow, agentId, stage: "balance", nowMs: 2 });
  if (!b.ok) throw new Error(b.reason);
  return b.escrow;
}

describe("testnet scale", () => {
  it("runs the story amounts at 1:1,000 in 6 decimal USDC units", () => {
    expect(testnetUnits(LOCKED)).toBe(63_000_000n); // $63.00
    expect(testnetUnits(ADVANCE)).toBe(18_900_000n); // $18.90
    expect(testnetUnits(BALANCE)).toBe(36_540_000n); // $36.54
    expect(testnetUnits(HELD)).toBe(7_560_000n); // $7.56
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
    expect(p.limits.per_transaction).toEqual({ [BASE_USDC]: "63000000" });
  });
});

describe("EscrowAdapter on the Agent API", () => {
  it("opens one PO account owned by Astro with that policy, and stores only the grant hash", async () => {
    const s = await setup();
    const acct = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    const a = s.tp.agents.get(acct.agentId)!;
    expect(a.policy).toEqual(poPolicy({ supplier: HAOYUN, owner: s.treasuryAccount, lockedCents: LOCKED }));
    expect(acct.grantHash).toBe(grantHash(grantToken(API_KEY, `pool:${acct.agentId}`)));
    expect(acct.releasePath).toBe("server");
    expect(a.grants).toEqual([acct.grantHash]);
    expect(JSON.stringify(acct)).not.toMatch(/ngt_/);
  });

  it("commits exactly $63.00 from Astro's treasury into the PO account", async () => {
    const s = await setup();
    const { acct, lock } = await openAndLock(s);
    expect(lock.ok).toBe(true);
    expect(s.tp.agents.get(acct.agentId)!.balances[BASE_USDC]).toBe(63_000_000n);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "escrow", codePath: "convex/near/escrow.ts#lock", network: "testnet" });
  });

  it("pays the $18.90 advance, then the $36.54 balance, to Haoyun on Base Sepolia, then returns the held $7.56 to Astro", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const a = await stageOf(s, { escrow, agentId: acct.agentId, stage: "advance" });
    expect(a).toMatchObject({ ok: true, amountCents: ADVANCE, escrow: { lifecycle: "advance_released" } });
    if (!a.ok) throw new Error();
    const b = await stageOf(s, { escrow: a.escrow, agentId: acct.agentId, stage: "balance", nowMs: 2 });
    expect(b).toMatchObject({ ok: true, amountCents: BALANCE, escrow: { lifecycle: "balance_released" } });
    if (!b.ok) throw new Error();
    expect(s.tp.payouts.map((p) => [p.chain, p.recipient, p.asset, p.amount])).toEqual([["base", HAOYUN, BASE_USDC, 18_900_000n], ["base", HAOYUN, BASE_USDC, 36_540_000n]]);
    const pays = s.proofs.filter((p) => p.kind === "payout");
    expect(pays.map((p) => p.label)).toEqual([
      "Advance paid to Haoyun on Base Sepolia for PO 1042: $18.90 (1:1,000 of $18,900.00). Sent by Evernear's server; the release gate is not deployed",
      "Balance paid to Haoyun on Base Sepolia for PO 1042: $36.54 (1:1,000 of $36,540.00). Sent by Evernear's server; the release gate is not deployed",
    ]);
    expect(pays[0]).toMatchObject({ codePath: "convex/near/escrow.ts#release", response: { stage: "advance", released_by: "server", signals: ["bill_of_lading", "export_cleared"] } });
    expect(pays[1]).toMatchObject({ response: { stage: "balance", released_by: "server", held_cents: HELD } });
    expect(pays[1].explorerUrl).toMatch(/^https:\/\/sepolia\.basescan\.org\/tx\/0x/);
    const back = await s.esc.reclaim({ escrow: b.escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 3 });
    expect(back.ok).toBe(true);
    expect(s.tp.sent.filter((x) => x.path.endsWith("/transfer")).at(-1)!.body).toMatchObject({ amount: "7560000", recipient: s.treasuryAccount });
    expect(s.tp.agents.get(acct.agentId)!.balances[BASE_USDC]).toBe(0n);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "reclaim" });
  });

  it("records each signal the stage was decided on, labelled as the simulated feed", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    await stageOf(s, { escrow, agentId: acct.agentId, stage: "advance" });
    const signals = s.proofs.filter((p) => p.kind === "signal");
    expect(signals.map((p) => [p.label, p.codePath, p.network])).toEqual([
      ["Signal: bill of lading issued for PO 1042 (simulated feed)", "scenarios/tracking.ts#signal", "offchain"],
      ["Signal: export cleared for PO 1042 (simulated feed)", "scenarios/tracking.ts#signal", "offchain"],
    ]);
    expect(signals[0].response).toMatchObject({ event: "bill_of_lading", po: "1042", source: "simulated", id: "sim-bol" });
  });

  for (const [stage, drop] of [["advance", "bill_of_lading"], ["advance", "export_cleared"], ["balance", "import_cleared"], ["balance", "dock_count"]] as const) {
    it(`refuses the ${stage} without ${drop} before any call, and records the refusal with the missing signal`, async () => {
      const s = await setup();
      const { acct, escrow } = await openAndLock(s);
      let e = escrow;
      if (stage === "balance") {
        const a = await stageOf(s, { escrow, agentId: acct.agentId, stage: "advance" });
        if (!a.ok) throw new Error();
        e = a.escrow;
      }
      const before = s.tp.sent.length;
      const r = await stageOf(s, { escrow: e, agentId: acct.agentId, stage, ev: evidence(stage, [drop]) });
      expect(r).toEqual({ ok: false, reason: "missing_signal", missing: [drop] });
      expect(s.tp.sent.length).toBe(before);
      expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", label: `${stage === "advance" ? "Advance" : "Balance"} refused before any call: missing ${drop}`, codePath: "convex/near/escrow.ts#release", response: { stage, reason: "missing_signal", missing: [drop] } });
    });
  }

  it("refuses a second advance before any call", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const a = await stageOf(s, { escrow, agentId: acct.agentId, stage: "advance" });
    if (!a.ok) throw new Error();
    const before = s.tp.sent.length;
    expect(await stageOf(s, { escrow: a.escrow, agentId: acct.agentId, stage: "advance" })).toEqual({ ok: false, reason: "already_released" });
    expect(s.tp.sent.length).toBe(before);
    expect(s.tp.payouts).toHaveLength(1);
  });

  it("refuses a release to any other address in code first, with a proof, and never calls the API", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const before = s.tp.sent.length;
    const r = await stageOf(s, { escrow, agentId: acct.agentId, stage: "advance", to: OFF_LIST });
    expect(r).toEqual({ ok: false, reason: "address_not_allowed" });
    expect(s.tp.sent.length).toBe(before);
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", codePath: "convex/near/escrow.ts#release" });
  });

  it("shows the second layer live: the same withdraw sent to the API is refused by the PO account's policy", async () => {
    const s = await setup();
    const { acct } = await openAndLock(s);
    const r = await s.esc.policyRefusal({ agentId: acct.agentId, to: OFF_LIST, cents: BALANCE, po: "1042", ref: "run1" });
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

  it("after both stages, the deadline refund returns only the $7.56 held for the missing motors", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const paid = await paidBoth(s, escrow, acct.agentId);
    const d = await s.esc.refundIfDue({ escrow: paid, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 10_001 });
    expect(d.ok).toBe(true);
    const lastTransfer = s.tp.sent.filter((x) => x.path.endsWith("/transfer")).at(-1)!;
    expect(lastTransfer.body).toMatchObject({ asset: BASE_USDC, amount: "7560000", recipient: s.treasuryAccount });
  });

  it("opens a new account for every order: two orders, two agents, and no reuse option", async () => {
    const s = await setup();
    const first = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    const second = await s.esc.open({ po: "1043", supplier: HAOYUN, lockedCents: 1_000_000 });
    expect(second.agentId).not.toBe(first.agentId);
    expect(second.account).not.toBe(first.account);
    expect(s.tp.agents.get(first.agentId)!.policy.limits.per_transaction[BASE_USDC]).toBe("63000000");
    expect(s.tp.agents.get(second.agentId)!.policy.limits.per_transaction[BASE_USDC]).toBe("10000000");
    expect(s.tp.sent.filter((x) => x.body?.type === "policy_update")).toEqual([]);
  });

  it("closes a settled wallet: revokes Evernear's grant, freezes it and records the Wallet closed proof", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    expect(escrow.lifecycle).toBe("funded");
    const paid = await paidBoth(s, escrow, acct.agentId);
    expect(paid.lifecycle).toBe("balance_released");
    const back = await s.esc.reclaim({ escrow: paid, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 3 });
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

  it("a closed wallet refuses both stages, reclaim, refund and a second close in code, and makes no API call", async () => {
    const s = await setup();
    const { acct, escrow } = await openAndLock(s);
    const refunded = await s.esc.refundIfDue({ escrow, agentId: acct.agentId, po: "1042", ref: "run1", nowMs: 10_001 });
    if (!refunded.ok) throw new Error();
    const c = await s.esc.close({ escrow: refunded.escrow, agentId: acct.agentId, grantId: acct.grantId, po: "1042" });
    if (!c.ok) throw new Error();
    const closed = c.escrow;
    const before = s.tp.sent.length;
    expect(await stageOf(s, { escrow: closed, agentId: acct.agentId, stage: "advance" })).toEqual({ ok: false, reason: "closed" });
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
    const r = await stageOf(s, { escrow, agentId: acct.agentId, stage: "advance" });
    expect(r).toMatchObject({ ok: false, reason: "wallet_frozen" });
    expect(s.tp.payouts).toEqual([]);
  });

  it("tops up the treasury: faucet NEAR USDC when short, then swaps into Base USDC", async () => {
    const s = await setup();
    const r = await s.esc.fund({ cents: LOCKED });
    expect(r.ok).toBe(true);
    const kinds = s.tp.sent.filter((x) => x.method === "POST" && /\/(deposit|swap)$/.test(x.path)).map((x) => x.path.split("/").at(-1));
    expect(kinds).toEqual(["deposit", "swap"]);
    expect(s.tp.agents.get(s.treasuryId)!.balances[BASE_USDC]! >= 63_000_000n).toBe(true);
    expect(s.tp.agents.get(s.treasuryId)!.balances[NEAR_USDC]).toBeDefined();
  });

  it("does not top up when the treasury already holds enough Base USDC", async () => {
    const s = await setup();
    s.tp.credit(s.treasuryId, BASE_USDC, 70_000_000n);
    expect((await s.esc.fund({ cents: LOCKED })).ok).toBe(true);
    expect(s.tp.sent.some((x) => /\/(deposit|swap)$/.test(x.path))).toBe(false);
  });
});
