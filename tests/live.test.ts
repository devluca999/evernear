// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC } from "@/convex/near/agentapi";
import { fakeReleaseGate, GATE_PUBLIC_KEY, outlayerWithGate } from "./near/fakeReleaseGate";

const modules = import.meta.glob("../convex/**/*.ts");
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "LIVE_ENABLED",
  "RELEASE_GATE_WASM_URL", "RELEASE_GATE_WASM_SHA256", "RELEASE_GATE_WALLET_KEY", "RELEASE_GATE_PUBLIC_KEY"];
const STEPS = ["commit", "advance", "pay", "refuse", "reclaim"] as const; // the story's order: the balance at the dock, then the wrong address in Paid

async function world(live = true, gate = false) {
  const tp = fakeTidepool();
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  Object.assign(process.env, {
    AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId, AGENT_OWNER_PUBLIC_KEY: owner.publicKey,
    AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId, ...(live ? { LIVE_ENABLED: "1" } : {}),
  });
  if (gate) {
    const fake = fakeReleaseGate({ fetch: tp.fetch, apiKey: API_KEY });
    Object.assign(process.env, { RELEASE_GATE_WASM_URL: fake.gate.wasmUrl, RELEASE_GATE_WASM_SHA256: fake.gate.wasmSha256, RELEASE_GATE_WALLET_KEY: "wk_" + "e".repeat(64), RELEASE_GATE_PUBLIC_KEY: GATE_PUBLIC_KEY });
    vi.stubGlobal("fetch", outlayerWithGate(fake.gate, tp.fetch).fetch);
  } else {
    vi.stubGlobal("fetch", tp.fetch);
  }
  return { tp, t: convexTest(schema, modules) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 10, 9)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("live mode", () => {
  it("runs commit, the advance, the balance, the refused withdraw and the reclaim, in the story's order, with proofs under the run", async () => {
    const { t, tp } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    expect(await t.action(api.live.runStep, { runId: runId!, step: "pay" })).toEqual({ ok: false, reason: "out_of_order" });
    for (const step of STEPS) expect(await t.action(api.live.runStep, { runId: runId!, step })).toEqual({ ok: true });
    // 1:1,000: $18.90 advance and $36.54 balance to Haoyun, $7.56 back to Astro.
    expect(tp.payouts.map((p) => [p.chain, p.amount])).toEqual([["base", 18_900_000n], ["base", 36_540_000n]]);
    const r = (await t.query(api.live.getRun, { runId: runId! }))!;
    expect(r.run.done).toEqual([...STEPS]);
    expect(r.releasePath).toBe("server");
    const kinds = r.proofs.map((p) => p.kind);
    expect(kinds).toEqual(expect.arrayContaining(["escrow", "signal", "refusal", "payout", "reclaim", "wallet"]));
    expect(r.proofs.find((p) => p.codePath.endsWith("#policyRefusal"))?.response).toMatchObject({ code: "policy_destination_denied" });
    // No release proof claims the enclave when the server sent it.
    const pays = r.proofs.filter((p) => p.kind === "payout");
    expect(pays.map((p) => p.response.stage)).toEqual(["advance", "balance"]);
    expect(pays.every((p) => p.label.endsWith("Sent by Evernear's server; the release gate is not deployed") && p.response.released_by === "server")).toBe(true);
    expect(JSON.stringify(r.proofs)).not.toMatch(/enclave/);
    // A repeated step is a no-op, not a second payment.
    expect(await t.action(api.live.runStep, { runId: runId!, step: "pay" })).toEqual({ ok: true });
    expect(tp.payouts).toHaveLength(2);
  });
  it("with the release gate configured, both stages are sent from the enclave and the server never holds a paying grant", async () => {
    const { t, tp } = await world(true, true);
    const { runId } = await t.mutation(api.live.start, {});
    for (const step of STEPS) expect(await t.action(api.live.runStep, { runId: runId!, step })).toEqual({ ok: true });
    expect(tp.payouts.map((p) => p.amount)).toEqual([18_900_000n, 36_540_000n]);
    const r = (await t.query(api.live.getRun, { runId: runId! }))!;
    expect(r.releasePath).toBe("gate");
    const pays = r.proofs.filter((p) => p.kind === "payout");
    expect(pays.every((p) => p.response.released_by === "gate" && p.label.includes("Sent by the release gate in OutLayer's enclave"))).toBe(true);
    // The off-list probe from the server is refused at the grant: it holds none.
    expect(r.proofs.find((p) => p.codePath.endsWith("#policyRefusal"))?.response).toMatchObject({ code: "grant_invalid" });
    const e = (await t.run((ctx) => ctx.db.query("escrows").collect()))[0];
    expect(e).toMatchObject({ releasePath: "gate", gatePublicKey: GATE_PUBLIC_KEY, lifecycle: "closed" });
  });
  it("allows one open run at a time", async () => {
    const { t } = await world();
    await t.mutation(api.live.start, {});
    expect(await t.mutation(api.live.start, {})).toEqual({ refused: "another live run is in progress" });
  });
  it("is off unless LIVE_ENABLED=1 on the deployment", async () => {
    const { t } = await world(false);
    expect(await t.mutation(api.live.start, {})).toEqual({ refused: "live mode is off on this deployment" });
  });
});

describe("live mode, adjusted scenario", () => {
  it("commits at $1,320 ($66.00 at 1:1,000), pays the $19.80 advance and the $38.28 balance, and returns $7.92", async () => {
    const { t, tp } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    for (const step of STEPS) expect(await t.action(api.live.runStep, { runId: runId!, step, scenario: "adjusted" })).toEqual({ ok: true });
    expect(tp.payouts.map((p) => p.amount)).toEqual([19_800_000n, 38_280_000n]);
    const back = tp.sent.filter((x) => x.path.endsWith("/transfer")).at(-1)!.body;
    expect(back).toMatchObject({ amount: "7920000" });
  });
});
