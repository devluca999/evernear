// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC } from "@/convex/near/agentapi";

const modules = import.meta.glob("../convex/**/*.ts");
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "LIVE_ENABLED"];

async function world(live = true) {
  const tp = fakeTidepool();
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  Object.assign(process.env, {
    AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId, AGENT_OWNER_PUBLIC_KEY: owner.publicKey,
    AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId, ...(live ? { LIVE_ENABLED: "1" } : {}),
  });
  vi.stubGlobal("fetch", tp.fetch);
  return { tp, t: convexTest(schema, modules) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 10, 9)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("live mode", () => {
  it("runs commit, the refused withdraw, the payout and the reclaim, in order, with proofs under the run", async () => {
    const { t, tp } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    expect(await t.action(api.live.runStep, { runId: runId!, step: "pay" })).toEqual({ ok: false, reason: "out_of_order" });
    for (const step of ["commit", "refuse", "pay", "reclaim"] as const) expect(await t.action(api.live.runStep, { runId: runId!, step })).toEqual({ ok: true });
    expect(tp.payouts).toEqual([expect.objectContaining({ chain: "base", amount: 34_200_000n })]);
    const r = (await t.query(api.live.getRun, { runId: runId! }))!;
    expect(r.run.done).toEqual(["commit", "refuse", "pay", "reclaim"]);
    const kinds = r.proofs.map((p) => p.kind);
    expect(kinds).toEqual(expect.arrayContaining(["escrow", "refusal", "payout", "reclaim"]));
    expect(r.proofs.find((p) => p.codePath.endsWith("#policyRefusal"))?.response).toMatchObject({ code: "policy_destination_denied" });
    // A repeated step is a no-op, not a second payment.
    expect(await t.action(api.live.runStep, { runId: runId!, step: "pay" })).toEqual({ ok: true });
    expect(tp.payouts).toHaveLength(1);
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
  it("commits at Haoyun's $20.02 ($40.04 at 1:1,000) and pays $36.04 for the 1,800 that arrived", async () => {
    const { t, tp } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    for (const step of ["commit", "refuse", "pay", "reclaim"] as const) expect(await t.action(api.live.runStep, { runId: runId!, step, scenario: "adjusted" })).toEqual({ ok: true });
    expect(tp.payouts).toEqual([expect.objectContaining({ amount: 36_040_000n })]); // $36,036 at 1:1,000 is $36.04
  });
});
