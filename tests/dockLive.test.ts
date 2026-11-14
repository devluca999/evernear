// @vitest-environment edge-runtime
// The live balance paid on a count signed at the dock (convex/dock.ts, /dock page), not on the
// scenario's fixed 44, once dock devices are pinned.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC } from "@/convex/near/agentapi";
import { signDockCount } from "@/engine/attestation";
import { approveLive, setApprovers } from "./approvalFixtures";

const modules = import.meta.glob("../convex/**/*.ts");
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "LIVE_ENABLED", "APPROVER_KEYS", "DOCK_DEVICE_KEYS"];
const DEVICE = new Uint8Array(32).fill(7);
const T0 = Date.UTC(2026, 10, 10, 9);
let WALLET = "";
const sign = (count: number, po = "1042", key = DEVICE, agentId = WALLET) => signDockCount({ po, agentId, count, at: new Date(Date.now()).toISOString(), device: "dock-3-scanner", secretKey: key });

async function world() {
  const tp = fakeTidepool();
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 100_000_000n);
  Object.assign(process.env, {
    AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId, AGENT_OWNER_PUBLIC_KEY: owner.publicKey,
    AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId, LIVE_ENABLED: "1",
    DOCK_DEVICE_KEYS: JSON.stringify([{ device: "dock-3-scanner", publicKey: sign(1, "1042", DEVICE, "x").publicKey }]),
  });
  setApprovers();
  vi.stubGlobal("fetch", tp.fetch);
  const t = convexTest(schema, modules);
  const { runId } = await t.mutation(api.live.start, {});
  await approveLive(t);
  const step = async (s: "commit" | "advance" | "pay" | "refuse" | "reclaim") => {
    const r = await t.action(api.live.runStep, { runId: runId!, step: s });
    if (s === "commit" && r.ok) WALLET = (await t.query(api.dock.openOrder, { po: "1042" }))!.agentId;
    return r;
  };
  return { tp, t, runId: runId!, step };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("live balance on a signed dock count", () => {
  it("waits for the clerk's signed count, then pays exactly for what it says", async () => {
    const w = await world();
    expect(await w.step("commit")).toEqual({ ok: true });
    expect(await w.step("advance")).toEqual({ ok: true });
    vi.setSystemTime(T0 + 60_000);
    expect(await w.step("pay")).toEqual({ ok: false, reason: "awaiting_dock_count" });
    expect(await w.t.mutation(api.dock.submit, { attestation: sign(44) })).toEqual({ ok: true });
    expect(await w.step("pay")).toEqual({ ok: true });
    expect(w.tp.payouts.map((p) => p.amount)).toEqual([18_900_000n, 36_540_000n]);
    const r = (await w.t.query(api.live.getRun, { runId: w.runId }))!;
    const dock = r.proofs.find((p) => (p.response as { event?: string })?.event === "dock_count");
    expect((dock?.response as { evidence_status?: string }).evidence_status).toBe("received, signed by device dock-3-scanner; not a physical fact");
    expect(await w.step("refuse")).toEqual({ ok: true });
    expect(await w.step("reclaim")).toEqual({ ok: true });
  });
  it("a count of 40 signed by the dock pays for 40", async () => {
    const w = await world();
    await w.step("commit"); await w.step("advance");
    vi.setSystemTime(T0 + 60_000);
    await w.t.mutation(api.dock.submit, { attestation: sign(40) });
    expect(await w.step("pay")).toEqual({ ok: true });
    expect(w.tp.payouts.at(-1)!.amount).toBe(BigInt(40 * 1_260 - 18_900) * 1_000n * 10n / 10n);
  });
  it("refuses a count from an unpinned device, for another PO, or altered after signing", async () => {
    const w = await world();
    expect(await w.t.mutation(api.dock.submit, { attestation: sign(44, "1042", new Uint8Array(32).fill(8)) })).toEqual({ ok: false, reason: "key_mismatch" });
    expect(await w.t.mutation(api.dock.submit, { attestation: { ...sign(44), count: 50 } })).toEqual({ ok: false, reason: "bad_signature" });
    const other = sign(44, "1043");
    expect(await w.t.mutation(api.dock.submit, { attestation: other })).toEqual({ ok: true }); // valid for PO 1043, never used for 1042
    await w.step("commit"); await w.step("advance");
    expect(await w.step("pay")).toEqual({ ok: false, reason: "awaiting_dock_count" });
  });
  it("a signed count is accepted once, and a count signed before the run started is never used for it", async () => {
    const w = await world();
    await w.step("commit"); await w.step("advance");
    vi.setSystemTime(T0 + 60_000);
    // Signed an hour before this run (a previous run's count), submitted during this one.
    const old = signDockCount({ po: "1042", agentId: WALLET, count: 50, at: new Date(T0 - 3_600_000).toISOString(), device: "dock-3-scanner", secretKey: DEVICE });
    expect(await w.t.mutation(api.dock.submit, { attestation: old })).toEqual({ ok: true });
    expect(await w.t.mutation(api.dock.submit, { attestation: old })).toEqual({ ok: false, reason: "replayed" });
    expect(await w.step("pay")).toEqual({ ok: false, reason: "awaiting_dock_count" });
  });
});
