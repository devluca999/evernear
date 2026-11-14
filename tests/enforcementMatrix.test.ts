// The release enforcement matrix (docs/hackathon/ENFORCEMENT-MATRIX.md): each case is attacked at
// the one layer that should refuse it, with the other layers out of the way, so a refusal at one
// layer is never presented as proof of another. Layers:
//   engine   engine/escrow.ts releaseStage (Evernear's server, before any call)
//   gate     engine/releaseGate.ts gateDecide, the twin of worker/release-gate (tested against the
//            worker's own vectors), and verifyGateRelease (the server's check of the gate's answer)
//   provider tests/near/fakeTidepool.ts, a local model of Tidepool's grant, policy, frozen and
//            idempotency checks, built from its docs. Real-testnet evidence is listed in the matrix doc.
//   approvals engine/approvals.ts (commit side; tests/commitAuthorization.test.ts covers it end to end)
import { describe, expect, it } from "vitest";
import { AgentApiClient, BASE_USDC, grantToken } from "@/convex/near/agentapi";
import { EscrowAdapter } from "@/convex/near/escrow";
import { createEscrow, releaseStage, type Escrow } from "@/engine/escrow";
import { gateDecide, signGateOutput, type GateReleaseInput } from "@/engine/releaseGate";
import { verifyGateRelease } from "@/convex/near/releaseGate";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";

const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const OFF_LIST = "0x000000000000000000000000000000000000dead";
const UNIT = 126_000, LOCKED = 6_300_000;
const ADV = ["bill_of_lading", "export_cleared"] as const;
const BAL = ["import_cleared", "dock_count"] as const;
const funded = (): Escrow => createEscrow({ supplier: HAOYUN, owner: "astro", lockedCents: LOCKED, deadlineMs: 1_000 });
const engine = (e: Escrow, o: Partial<Parameters<typeof releaseStage>[1]> = {}) =>
  releaseStage(e, { stage: "advance", to: HAOYUN, signals: [...ADV], unitCents: UNIT, nowMs: 10, ...o });

const gateInput = (o: Partial<GateReleaseInput> = {}): GateReleaseInput => ({
  mode: "release", stage: "advance", po: "1042", agent_id: "agent_fe8606f9c6dc60f3f1768ed9", to: HAOYUN, unit_cents: UNIT, ordered_qty: 50,
  locked_cents: LOCKED, released_cents: 0, advance_percent: 30,
  signals: { bill_of_lading: { id: "sim-bol", at: "2026-11-05T13:40:00Z" }, export_cleared: { id: "sim-export", at: "2026-11-05T20:15:00Z" } }, ...o,
});
const SEED = new Uint8Array(32).fill(9);
const signedAdvance = (o: Record<string, unknown> = {}) => signGateOutput({ ok: true, stage: "advance", po: "1042", agent_id: "agent_fe8606f9c6dc60f3f1768ed9", to: HAOYUN, amount_cents: 1_890_000, held_cents: 4_410_000, ...o }, SEED);
const gateKey = signedAdvance().public_key!;
const want = { publicKey: gateKey, stage: "advance", po: "1042", agentId: "agent_fe8606f9c6dc60f3f1768ed9", to: HAOYUN, amountCents: 1_890_000 };

/** A funded PO account on the fake provider, its server grant, and a raw client to attack it with. */
async function provider() {
  const tp = fakeTidepool();
  const { owner } = testOwner();
  const boot = new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {}, treasuryId: "pending" });
  const treasuryId = await boot.createTreasury();
  const esc = new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {}, treasuryId });
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  const acct = await esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
  await esc.lock({ po: "1042", ref: "m", agentId: acct.agentId, account: acct.account, cents: LOCKED });
  const client = new AgentApiClient({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} });
  const validGrant = grantToken(API_KEY, `pool:${acct.agentId}`);
  const withdraw = (grant: string | null, to: string, units: bigint, key?: string) =>
    client.act(acct.agentId, grant, "withdraw", { asset: BASE_USDC, amount: String(units), chain: "base", recipient: to }, { kind: "payout", label: "matrix", codePath: "tests/enforcementMatrix.test.ts" }, key);
  return { tp, esc, acct, validGrant, withdraw };
}

describe("release enforcement matrix", () => {
  it("1. no release authorization: provider refuses at the grant layer", async () => {
    const p = await provider();
    expect(await p.withdraw(null, HAOYUN, 18_900_000n)).toMatchObject({ ok: false, code: "grant_invalid", layer: "grant" });
    expect(p.tp.payouts).toHaveLength(0);
  });
  it("2. invalid release authorization (a token Astro never registered): provider, grant layer", async () => {
    const p = await provider();
    expect(await p.withdraw(grantToken(API_KEY, "forged"), HAOYUN, 18_900_000n)).toMatchObject({ ok: false, code: "grant_invalid" });
  });
  it("3. expired or revoked authorization: provider, grant layer (revocation shown; Tidepool grant expiry is not modelled locally)", async () => {
    const p = await provider();
    const grants = await new AgentApiClient({ fetch: p.tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner: testOwner().owner, sink: () => {} }).grants(p.acct.agentId);
    await p.esc.close({ escrow: { ...funded(), releasedCents: LOCKED, lifecycle: "settled" }, agentId: p.acct.agentId, grantId: grants[0].grant_id, po: "1042" });
    expect(await p.withdraw(p.validGrant, HAOYUN, 1n)).toMatchObject({ ok: false });
    expect(p.tp.payouts).toHaveLength(0);
  });
  it("4. authorization for another purchase order: the server rejects a gate answer for another PO or account", () => {
    expect(verifyGateRelease(signedAdvance({ po: "1043" }), want)).toEqual({ ok: false, reason: "field_mismatch" });
    expect(verifyGateRelease(signedAdvance({ agent_id: "agent_other" }), want)).toEqual({ ok: false, reason: "field_mismatch" });
  });
  it("5. authorization for another amount: rejected at the server's check of the signed answer", () => {
    expect(verifyGateRelease(signedAdvance({ amount_cents: 1_890_001 }), want)).toEqual({ ok: false, reason: "amount_mismatch" });
  });
  it("6. authorization for another destination: rejected at the server's check; a tampered answer fails its signature", () => {
    expect(verifyGateRelease(signedAdvance({ to: OFF_LIST }), want)).toEqual({ ok: false, reason: "field_mismatch" });
    expect(verifyGateRelease({ ...signedAdvance(), to: OFF_LIST }, { ...want, to: OFF_LIST })).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("7. duplicate authorization: the same idempotency key with another body is a conflict; with the same body a replay, not a second payment", async () => {
    const p = await provider();
    expect(await p.withdraw(p.validGrant, HAOYUN, 18_900_000n, "rg1-advance-x")).toMatchObject({ ok: true });
    expect(await p.withdraw(p.validGrant, HAOYUN, 18_900_000n, "rg1-advance-x")).toMatchObject({ ok: true });
    expect(await p.withdraw(p.validGrant, HAOYUN, 18_900_001n, "rg1-advance-x")).toMatchObject({ ok: false, code: "idempotency_conflict" });
    expect(p.tp.payouts).toHaveLength(1);
  });
  it("8. valid grant, prohibited recipient: provider policy refuses (destination allowlist), independent of the grant", async () => {
    const p = await provider();
    expect(await p.withdraw(p.validGrant, OFF_LIST, 1_000_000n)).toMatchObject({ ok: false, code: "policy_destination_denied", layer: "policy" });
    // The same grant pays an allowed address: the refusal above was the destination, not the grant.
    expect(await p.withdraw(p.validGrant, HAOYUN, 1_000_000n)).toMatchObject({ ok: true });
    // And the engine refuses it before any call.
    expect(engine(funded(), { to: OFF_LIST })).toMatchObject({ ok: false, reason: "address_not_allowed" });
  });
  it("9. valid grant, excessive amount: provider per-transaction limit; engine and gate refuse above the balance", async () => {
    const p = await provider();
    expect(await p.withdraw(p.validGrant, HAOYUN, 63_000_001n)).toMatchObject({ ok: false, code: "policy_transaction_limit_exceeded", layer: "policy" });
    expect(gateDecide(gateInput({ stage: "balance", released_cents: 0, received_qty: 51, signals: { import_cleared: { id: "i", at: "x" }, dock_count: { id: "d", at: "x", count: 51 } } }))).toMatchObject({ ok: false, reason: "received_over_ordered" });
    expect(engine({ ...funded(), releasedCents: 1_890_000 }, { stage: "balance", signals: [...BAL], receivedQty: 51 })).toMatchObject({ ok: false, reason: "bad_quantity" });
  });
  it("10. valid grant but missing milestone evidence: engine and gate refuse and name what is missing", () => {
    expect(engine(funded(), { signals: ["bill_of_lading"] })).toMatchObject({ ok: false, reason: "missing_signal", missing: ["export_cleared"] });
    expect(gateDecide(gateInput({ signals: { bill_of_lading: { id: "sim-bol", at: "x" } } }))).toMatchObject({ ok: false, reason: "missing_signals", missing: ["export_cleared"] });
  });
  it("11. tampered evidence: a dock count that disagrees with the release, or malformed evidence, is refused by the gate. A well-formed false report is NOT detected (evidence is not source-signed)", () => {
    const bal = (count: number, received: number) => gateInput({ stage: "balance", released_cents: 1_890_000, received_qty: received, signals: { import_cleared: { id: "i", at: "x" }, dock_count: { id: "d", at: "x", count } } });
    expect(gateDecide(bal(50, 44))).toMatchObject({ ok: false, reason: "count_mismatch" });
    expect(gateDecide(gateInput({ signals: { bill_of_lading: { id: "bad id with spaces", at: "x" }, export_cleared: { id: "e", at: "x" } } }))).toMatchObject({ ok: false, reason: "missing_signals" });
    // Known gap, pinned: a consistent but false count of 50 pays for 50.
    expect(gateDecide(bal(50, 50))).toMatchObject({ ok: true, amount_cents: 50 * UNIT - 1_890_000 });
  });
  it("12. reused evidence: a second advance or a second balance on the same order is refused", () => {
    const after = engine(funded());
    if (!after.ok) throw new Error(after.reason);
    expect(engine(after.escrow)).toMatchObject({ ok: false, reason: "already_released" });
    const bal = engine(after.escrow, { stage: "balance", signals: [...BAL], receivedQty: 44 });
    if (!bal.ok) throw new Error(bal.reason);
    expect(engine(bal.escrow, { stage: "balance", signals: [...BAL], receivedQty: 44 })).toMatchObject({ ok: false, reason: "nothing_due" });
    expect(gateDecide(gateInput({ released_cents: 1_890_000 }))).toMatchObject({ ok: false, reason: "already_released" });
  });
  it("13. wrong policy version: the engine reads the release rules from policy/astro.json; gate v2 pins the advance percent in its build", () => {
    expect(gateDecide(gateInput({ advance_percent: 100 }))).toMatchObject({ ok: false, reason: "percent_not_policy" });
    const r = engine(funded());
    expect(r).toMatchObject({ ok: true, amountCents: 1_890_000 });
  });
  it("14. correct authorization, evidence and recipient: paid, exact amounts", async () => {
    const a = engine(funded());
    if (!a.ok) throw new Error(a.reason);
    const b = engine(a.escrow, { stage: "balance", signals: [...BAL], receivedQty: 44 });
    expect([a.amountCents, b.ok && b.amountCents]).toEqual([1_890_000, 3_654_000]);
    expect(gateDecide(gateInput())).toMatchObject({ ok: true, amount_cents: 1_890_000, held_cents: 4_410_000 });
    const p = await provider();
    expect(await p.withdraw(p.validGrant, HAOYUN, 18_900_000n)).toMatchObject({ ok: true });
  });
  it("15. repeat payout after a successful release: refused by the engine; a stale record is caught by the balance reconcile (tests/near/escrow.test.ts)", () => {
    const a = engine(funded());
    if (!a.ok) throw new Error(a.reason);
    expect(engine(a.escrow)).toMatchObject({ ok: false, reason: "already_released" });
  });
  it("16. payment after the deadline or after the order is settled: engine refuses", () => {
    expect(engine(funded(), { nowMs: 1_001 })).toMatchObject({ ok: false, reason: "past_deadline" });
    expect(engine({ ...funded(), closed: true, lifecycle: "closed" })).toMatchObject({ ok: false, reason: "closed" });
  });
  it("17. payment while frozen: provider refuses with wallet_frozen, even with a valid grant to an allowed address", async () => {
    const p = await provider();
    await p.esc.freeze({ agentId: p.acct.agentId, po: "1042" });
    expect(await p.withdraw(p.validGrant, HAOYUN, 1_000_000n)).toMatchObject({ ok: false, code: "wallet_frozen" });
    expect(p.tp.payouts).toHaveLength(0);
  });
});
