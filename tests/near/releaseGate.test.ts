// The release gate path: the order's grant belongs to worker/release-gate (here the fake in
// fakeReleaseGate.ts, which follows the worker through the tested TypeScript twin), each stage is
// sent from the enclave, and the server checks the signed answer before it records a payment.
import { describe, expect, it } from "vitest";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC, grantHash, grantToken } from "@/convex/near/agentapi";
import { GateConfigError, OutlayerReleaseGate, parseRunResult, releaseGateFromEnv, type ReleaseGate } from "@/convex/near/releaseGate";
import { createEscrow, type Escrow, type Stage } from "@/engine/escrow";
import { gateIdempotencyKey, signGateOutput } from "@/engine/releaseGate";
import { fakeTidepool, FAKE_BASE } from "./fakeTidepool";
import { fakeReleaseGate, GATE_PUBLIC_KEY, GATE_SEED, outlayerWithGate } from "./fakeReleaseGate";
import { sinkRecorder } from "./mockFetch";
import { API_KEY, testOwner } from "./agentFixtures";
import { evidence } from "./evidence";

const HAOYUN = "0x2003975a521c6fa45238dbc402c9e4adcb8863e0";
const UNIT = 126_000, LOCKED = 6_300_000;
const WK = "wk_" + "e".repeat(64);

async function setup(o: { tamper?: Parameters<typeof fakeReleaseGate>[0]["tamper"]; pinned?: string; viaOutlayer?: boolean } = {}) {
  const tp = fakeTidepool();
  const { owner } = testOwner();
  const { proofs, sink } = sinkRecorder();
  const fake = fakeReleaseGate({ fetch: tp.fetch, apiKey: API_KEY, tamper: o.tamper });
  const wire = outlayerWithGate(fake.gate, tp.fetch);
  const gate: ReleaseGate = o.viaOutlayer ? new OutlayerReleaseGate({ fetch: wire.fetch, walletKey: WK, wasmUrl: fake.gate.wasmUrl, wasmSha256: fake.gate.wasmSha256 }) : fake.gate;
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  const esc = new EscrowAdapter({ fetch: wire.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink, treasuryId, gate, gatePublicKey: o.pinned });
  const treasury = await esc.treasuryAccount();
  return { tp, esc, proofs, fake, wire, treasury };
}

async function locked(s: Awaited<ReturnType<typeof setup>>) {
  const acct = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
  expect(await s.esc.fund({ cents: LOCKED })).toEqual({ ok: true });
  expect((await s.esc.lock({ po: "1042", ref: "g1", agentId: acct.agentId, account: acct.account, cents: LOCKED })).ok).toBe(true);
  return { acct, escrow: createEscrow({ supplier: HAOYUN, owner: s.treasury, lockedCents: LOCKED, deadlineMs: 10_000 }) };
}

const run = (s: Awaited<ReturnType<typeof setup>>, a: { agentId: string; gatePublicKey?: string }, escrow: Escrow, stage: Stage, drop: string[] = []) =>
  s.esc.releaseStage({ escrow, agentId: a.agentId, stage, to: HAOYUN, evidence: evidence(stage, drop), unitCents: UNIT, po: "1042", ref: "g1", nowMs: 1, path: "gate", gatePublicKey: a.gatePublicKey, payee: "Haoyun" });

describe("release gate path", () => {
  it("at lock, enrolls the new account and registers the gate's grant hash, never a server-derived grant", async () => {
    const s = await setup();
    const acct = await s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED });
    expect(acct).toMatchObject({ releasePath: "gate", gatePublicKey: GATE_PUBLIC_KEY, grantHash: grantHash(s.fake.token(acct.agentId)) });
    const a = s.tp.agents.get(acct.agentId)!;
    expect(a.grants).toEqual([acct.grantHash]);
    expect(a.grants).not.toContain(grantHash(grantToken(API_KEY, `pool:${acct.agentId}`)));
    expect(s.proofs.find((p) => p.codePath.endsWith("#enroll"))).toMatchObject({ kind: "enclave", response: { mode: "enroll", grant_hash: acct.grantHash, public_key: GATE_PUBLIC_KEY } });
    expect(JSON.stringify(s.proofs)).not.toContain(s.fake.token(acct.agentId));
  });

  it("sends the advance and the balance from the enclave, checks each signed answer, and says so on the proof", async () => {
    const s = await setup();
    const { acct, escrow } = await locked(s);
    const a = await run(s, acct, escrow, "advance");
    expect(a).toMatchObject({ ok: true, amountCents: 1_890_000 });
    if (!a.ok) throw new Error();
    const b = await run(s, acct, a.escrow, "balance");
    expect(b).toMatchObject({ ok: true, amountCents: 3_654_000, escrow: { lifecycle: "balance_released" } });
    expect(s.tp.payouts.map((p) => p.amount)).toEqual([18_900_000n, 36_540_000n]);
    const withdraws = s.tp.sent.filter((x) => x.path.endsWith("/withdraw"));
    expect(withdraws.map((w) => w.headers["idempotency-key"])).toEqual([gateIdempotencyKey(acct.agentId, "1042", "advance"), gateIdempotencyKey(acct.agentId, "1042", "balance")]);
    expect(withdraws.every((w) => w.headers["x-grant-token"] === s.fake.token(acct.agentId))).toBe(true);
    const pays = s.proofs.filter((p) => p.kind === "payout");
    expect(pays.map((p) => p.label)).toEqual([
      "Advance paid to Haoyun on Base Sepolia for PO 1042: $18.90 (1:1,000 of $18,900.00). Sent by the release gate in OutLayer's enclave; Evernear's server holds no grant that can pay",
      "Balance paid to Haoyun on Base Sepolia for PO 1042: $36.54 (1:1,000 of $36,540.00). Sent by the release gate in OutLayer's enclave; Evernear's server holds no grant that can pay",
    ]);
    expect(pays[0].response).toMatchObject({ stage: "advance", released_by: "gate", gate: { ok: true, amount_cents: 1_890_000, public_key: GATE_PUBLIC_KEY, signature: expect.stringMatching(/^[0-9a-f]{128}$/) } });
  });

  it("refuses a missing signal in the engine before the gate even runs", async () => {
    const s = await setup();
    const { acct, escrow } = await locked(s);
    const runs = s.fake.runs.length;
    expect(await run(s, acct, escrow, "advance", ["export_cleared"])).toEqual({ ok: false, reason: "missing_signal", missing: ["export_cleared"] });
    expect(s.fake.runs.length).toBe(runs);
    expect(s.tp.payouts).toEqual([]);
  });

  it("the server cannot pay on its own: its withdraw is refused at the grant, even to Haoyun", async () => {
    const s = await setup();
    const { acct } = await locked(s);
    const r = await s.esc.policyRefusal({ agentId: acct.agentId, to: HAOYUN, cents: 1_890_000, po: "1042", ref: "g1", path: "gate" });
    expect(r).toMatchObject({ ok: false, code: "grant_invalid" });
    expect(s.proofs.at(-1)!.label).toContain("from Evernear's server, which holds no grant on it");
    expect(s.tp.payouts).toEqual([]);
  });

  it("does not record a payment when the answer's signature does not cover what it says", async () => {
    const s = await setup({ tamper: (o) => (o.ok ? { ...o, amount_cents: 1 } : o) });
    const { acct, escrow } = await locked(s);
    expect(await run(s, acct, escrow, "advance")).toEqual({ ok: false, reason: "gate_bad_signature" });
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", response: { reason: "bad_signature", engine_amount_cents: 1_890_000 } });
    expect(s.proofs.some((p) => p.kind === "payout")).toBe(false);
  });

  it("does not record a payment signed by another key", async () => {
    const other = new Uint8Array(32).fill(3);
    const s = await setup({ tamper: (o) => { const { signature: _s, public_key: _p, ...rest } = o; void _s; void _p; return signGateOutput(rest, other); } });
    const { acct, escrow } = await locked(s);
    expect(await run(s, acct, escrow, "advance")).toEqual({ ok: false, reason: "gate_wrong_key" });
  });

  it("does not record a payment whose signed amount differs from the engine's", async () => {
    const s = await setup({ tamper: (o) => { const { signature: _s, public_key: _p, ...rest } = o; void _s; void _p; return o.ok ? signGateOutput({ ...rest, amount_cents: 1_800_000 }, GATE_SEED) : o; } });
    const { acct, escrow } = await locked(s);
    expect(await run(s, acct, escrow, "advance")).toEqual({ ok: false, reason: "gate_amount_mismatch" });
  });

  it("records the gate's own signed refusal, and nothing moves", async () => {
    const s = await setup();
    const { acct, escrow } = await locked(s);
    // The engine's rule passes (the address is this escrow's supplier) but the gate pays only an EVM address on Base.
    const odd = { ...escrow, supplier: "haoyun.testnet" };
    const r = await s.esc.releaseStage({ escrow: odd, agentId: acct.agentId, stage: "advance", to: "haoyun.testnet", evidence: evidence("advance"), unitCents: UNIT, po: "1042", ref: "g1", nowMs: 1, path: "gate", gatePublicKey: acct.gatePublicKey });
    expect(r).toEqual({ ok: false, reason: "bad_recipient" });
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", label: "Advance refused by the release gate in OutLayer's enclave: bad_recipient", response: { released_by: "gate", signature_valid: true, gate: { ok: false, reason: "bad_recipient" } } });
    expect(s.tp.payouts).toEqual([]);
  });

  it("refuses to send when the order's grant is the gate's but no gate is configured here", async () => {
    const s = await setup();
    const { acct, escrow } = await locked(s);
    const plain = new EscrowAdapter({ fetch: s.tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner: testOwner().owner, sink: () => {}, treasuryId: "t" });
    expect(await plain.releaseStage({ escrow, agentId: acct.agentId, stage: "advance", to: HAOYUN, evidence: evidence("advance"), unitCents: UNIT, po: "1042", ref: "g1", nowMs: 1, path: "gate", gatePublicKey: acct.gatePublicKey }))
      .toEqual({ ok: false, reason: "gate_unavailable" });
    expect(s.tp.payouts).toEqual([]);
  });

  it("returns the held $7.56 only after Astro limits the account to paying Astro, then closes it with every grant revoked", async () => {
    const s = await setup();
    const { acct, escrow } = await locked(s);
    const a = await run(s, acct, escrow, "advance");
    if (!a.ok) throw new Error();
    const b = await run(s, acct, a.escrow, "balance");
    if (!b.ok) throw new Error();
    const back = await s.esc.reclaim({ escrow: b.escrow, agentId: acct.agentId, po: "1042", ref: "g1", nowMs: 3, path: "gate" });
    expect(back).toMatchObject({ ok: true, escrow: { lifecycle: "settled" } });
    const ag = s.tp.agents.get(acct.agentId)!;
    expect(ag.policy.destinations.list).toEqual([{ action: "transfer", address: s.treasury, confidential: false }]);
    expect(s.tp.sent.filter((x) => x.path.endsWith("/transfer")).at(-1)!.body).toMatchObject({ amount: "7560000", recipient: s.treasury });
    if (!back.ok) throw new Error();
    expect((await s.esc.close({ escrow: back.escrow, agentId: acct.agentId, po: "1042" })).ok).toBe(true);
    expect(ag.grants).toEqual([]);
    expect(ag.grantViews.every((g) => g.revoked_at)).toBe(true);
    expect(ag.grantViews).toHaveLength(2);
    expect(ag.policy.frozen).toBe(true);
  });

  it("refuses an enroll answer with a key other than the pinned one, and records it", async () => {
    const s = await setup({ pinned: "cd".repeat(32) });
    await expect(s.esc.open({ po: "1042", supplier: HAOYUN, lockedCents: LOCKED })).rejects.toThrow("enroll_unexpected_key");
    expect(s.proofs.at(-1)).toMatchObject({ kind: "refusal", codePath: "convex/near/escrow.ts#enroll", response: { reason: "enroll_unexpected_key" } });
  });
});

describe("OutlayerReleaseGate: a direct on-chain wasm run", () => {
  it("sends request_execution on outlayer.testnet with the wasm URL and hash, signed through the custody wallet, and reads the answer", async () => {
    const s = await setup({ viaOutlayer: true });
    const { acct, escrow } = await locked(s);
    const a = await run(s, acct, escrow, "advance");
    expect(a).toMatchObject({ ok: true, amountCents: 1_890_000 });
    const [enroll, release] = s.wire.calls;
    expect(enroll.headers.authorization).toBe(`Bearer ${WK}`);
    expect(release.body).toMatchObject({
      receiver_id: "outlayer.testnet", method_name: "request_execution", gas: "300000000000000",
      args: { source: { WasmUrl: { url: s.fake.gate.wasmUrl, hash: s.fake.gate.wasmSha256, build_target: "wasm32-wasip2" } }, response_format: "Json" },
    });
    expect(JSON.stringify(release.body)).not.toMatch(/Project|project_id/);
    const input = JSON.parse((release.body.args as { input_data: string }).input_data);
    expect(input).toMatchObject({ mode: "release", stage: "advance", po: "1042", unit_cents: UNIT, ordered_qty: 50, locked_cents: LOCKED, released_cents: 0, advance_percent: 30 });
    expect(input.signals).toMatchObject({ bill_of_lading: { id: "sim-bol" }, export_cleared: { id: "sim-export" } });
    expect(s.proofs.find((p) => p.kind === "payout")).toMatchObject({ call: expect.stringContaining("outlayer run --wasm") });
  });

  it("reads the gate's answer as a JSON value, a JSON string, or under output", () => {
    const out = { ok: false, reason: "missing_signals" };
    expect(parseRunResult(out)).toEqual(out);
    expect(parseRunResult(JSON.stringify(out))).toEqual(out);
    expect(parseRunResult({ output: JSON.stringify(out) })).toEqual(out);
    expect(() => parseRunResult({ something: 1 })).toThrow("no output");
    expect(() => parseRunResult("not json")).toThrow("not JSON");
  });

  it("is off without RELEASE_GATE_WASM_URL, and refuses half a configuration rather than falling back", () => {
    const f = fakeTidepool().fetch;
    expect(releaseGateFromEnv({}, f)).toBeNull();
    expect(() => releaseGateFromEnv({ RELEASE_GATE_WASM_URL: "https://x.example/g.wasm" }, f)).toThrow(GateConfigError);
    expect(() => releaseGateFromEnv({ RELEASE_GATE_WASM_URL: "https://x.example/g.wasm", RELEASE_GATE_WASM_SHA256: "ab".repeat(32) }, f)).toThrow("RELEASE_GATE_WALLET_KEY");
    expect(() => releaseGateFromEnv({ RELEASE_GATE_WASM_URL: "http://x.example/g.wasm", RELEASE_GATE_WASM_SHA256: "ab".repeat(32), RELEASE_GATE_WALLET_KEY: WK }, f)).toThrow("https");
    expect(releaseGateFromEnv({ RELEASE_GATE_WASM_URL: "https://x.example/g.wasm", RELEASE_GATE_WASM_SHA256: "AB".repeat(32), RELEASE_GATE_WALLET_KEY: WK }, f)).toMatchObject({ wasmSha256: "ab".repeat(32) });
  });
});
