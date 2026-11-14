// @vitest-environment edge-runtime
// Cross-language check of the release gate v4 input: the real server path (approvals signed and
// consumed at commit, convex/approvals.ts forRun, deadline.releaseStage, escrow.releaseByGate, the
// OutLayer call) composes the exact JSON the enclave receives. This test captures it into
// worker/release-gate/server-inputs.json, and the Rust test `v4_accepts_the_servers_own_inputs`
// runs the gate on those exact bytes. Keys are the TEST-ONLY seeds the Rust tests pin (41, 42, 43).
// Regenerate after a change to the input shape: UPDATE_GATE_FIXTURE=1 npx vitest run tests/gateInputE2E.test.ts
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC } from "@/convex/near/agentapi";
import { fakeReleaseGate, GATE_PUBLIC_KEY, outlayerWithGate } from "./near/fakeReleaseGate";
import { signApproval, signApprovalNep413 } from "@/engine/approvals";
import { signDockCount } from "@/engine/attestation";

const modules = import.meta.glob("../convex/**/*.ts");
const FIXTURE = "worker/release-gate/server-inputs.json";
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "LIVE_ENABLED",
  "RELEASE_GATE_WASM_URL", "RELEASE_GATE_WASM_SHA256", "RELEASE_GATE_WALLET_KEY", "RELEASE_GATE_PUBLIC_KEY", "APPROVER_KEYS", "DOCK_DEVICE_KEYS"];
const seed = (n: number) => new Uint8Array(32).fill(n);
const pub = (n: number) => Buffer.from(ed25519.getPublicKey(seed(n))).toString("hex");

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 10, 10, 9)); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("release gate v4 input, as the server composes it", () => {
  it("the advance and balance inputs carry the signed terms, both approvals and a wallet-bound signed count", async () => {
    const tp = fakeTidepool();
    const { owner, pkcs8Base64 } = testOwner();
    const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
    tp.credit(treasuryId, BASE_USDC, 100_000_000n);
    const fake = fakeReleaseGate({ fetch: tp.fetch, apiKey: API_KEY });
    Object.assign(process.env, {
      AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId, AGENT_OWNER_PUBLIC_KEY: owner.publicKey,
      AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId, LIVE_ENABLED: "1",
      RELEASE_GATE_WASM_URL: fake.gate.wasmUrl, RELEASE_GATE_WASM_SHA256: fake.gate.wasmSha256, RELEASE_GATE_WALLET_KEY: "wk_" + "e".repeat(64), RELEASE_GATE_PUBLIC_KEY: GATE_PUBLIC_KEY,
      APPROVER_KEYS: JSON.stringify([{ name: "Luca", publicKey: pub(41), accountId: "luca-test.testnet" }, { name: "Jordan", publicKey: pub(42) }]),
      DOCK_DEVICE_KEYS: JSON.stringify([{ device: "dock-3-scanner", publicKey: pub(43) }]),
    });
    const wire = outlayerWithGate(fake.gate, tp.fetch);
    vi.stubGlobal("fetch", wire.fetch);
    const t = convexTest(schema, modules);
    const { runId } = await t.mutation(api.live.start, {});
    const { digest } = await t.query(api.approvals.terms, { scenario: "happy" });
    const now = Date.now(), at = { issuedAt: now, expiresAt: now + 3_600_000 };
    expect(await t.mutation(api.approvals.submit, { approval: signApprovalNep413({ approver: "Luca", accountId: "luca-test.testnet", secretKey: seed(41), digest, nonce: "e2e-luca", ...at }) })).toEqual({ ok: true });
    expect(await t.mutation(api.approvals.submit, { approval: signApproval({ approver: "Jordan", secretKey: seed(42), digest, nonce: "e2e-jordan", ...at }) })).toEqual({ ok: true });
    const step = (s: "commit" | "advance" | "pay") => t.action(api.live.runStep, { runId: runId!, step: s });
    expect(await step("commit")).toEqual({ ok: true });
    expect(await step("advance")).toEqual({ ok: true });
    vi.setSystemTime(now + 60_000);
    const { agentId } = (await t.query(api.dock.openOrder, { po: "1042" }))!;
    expect(await t.mutation(api.dock.submit, { attestation: signDockCount({ po: "1042", agentId, count: 44, at: new Date(Date.now()).toISOString(), device: "dock-3-scanner", secretKey: seed(43) }) })).toEqual({ ok: true });
    expect(await step("pay")).toEqual({ ok: true });

    const inputs = wire.calls.map((c) => (c.body.args as { input_data: string }).input_data).filter((s) => JSON.parse(s).mode === "release");
    expect(inputs).toHaveLength(2);
    const [adv, bal] = inputs.map((s) => JSON.parse(s));
    for (const i of [adv, bal]) {
      expect(i.terms).toMatchObject({ po: "1042", quantity: 50, unitCents: 126_000, totalCents: 6_300_000, approvalsRequired: 2 });
      expect(i.approvals.map((a: { approver: string }) => a.approver).sort()).toEqual(["Jordan", "Luca"]);
    }
    expect(bal.signals.dock_count.attestation).toMatchObject({ agentId: bal.agent_id, count: 44, po: "1042" });
    const body = JSON.stringify({ _note: "Release inputs composed by the server path in tests/gateInputE2E.test.ts, signed with TEST-ONLY keys; run by the Rust test v4_accepts_the_servers_own_inputs.", advance: inputs[0], balance: inputs[1] }, null, 2) + "\n";
    if (process.env.UPDATE_GATE_FIXTURE === "1") writeFileSync(FIXTURE, body);
    else expect(readFileSync(FIXTURE, "utf8")).toBe(body);
  });
});
