// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api, internal } from "@/convex/_generated/api";
import { mockFetch } from "./near/mockFetch";
import { subWalletKey } from "@/convex/near/custody";
import { cents } from "@/engine/money";

const modules = import.meta.glob("../convex/**/*.ts");
const KEY = "wk_" + "a".repeat(64);
const haoyun = "haoyun-precision.testnet", astro = "astro-robotics.testnet";
const ESCROW_ACCOUNT = "ee".repeat(32);
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0);
const DAY = 86_400_000;

function routes() {
  let n = 0;
  return mockFetch({
    "PUT /wallet/v1/api-key": () => ({ wallet_id: "w-po", near_account_id: ESCROW_ACCOUNT }),
    "POST /wallet/v1/call": () => ({ request_id: `r${++n}`, status: "success", tx_hash: `TX${n}` }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  process.env.OUTLAYER_API_KEY = KEY;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.OUTLAYER_API_KEY;
});

async function lockPo(t: ReturnType<typeof convexTest>) {
  const r = await t.action(internal.escrows.lock, { po: "1042", supplier: haoyun, owner: astro, cents: cents(38000), deadlineMs: T0 + DAY });
  expect(r.status).toBe("success");
  return r.escrowId!;
}

describe("deadline refund", () => {
  it("refunds Astro in full when nothing was released by the deadline", async () => {
    const m = routes();
    vi.stubGlobal("fetch", m.fetch);
    const t = convexTest(schema, modules);
    const escrowId = await lockPo(t);
    expect(m.sent).toHaveLength(2); // sub wallet, lock

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const refund = m.sent[2];
    expect(JSON.parse(refund.body).args).toEqual({ receiver_id: astro, amount: "38000000000", memo: "PO 1042 deadline refund" });
    expect(refund.headers.Authorization).toBe(`Bearer ${await subWalletKey("po-1042", KEY)}`);
    expect(refund.url.startsWith("https://testnet-api.outlayer.ai/")).toBe(true);
    const e = await t.run((ctx) => ctx.db.get(escrowId));
    expect(e).toMatchObject({ closed: true, reclaimedCents: cents(38000), releasedCents: 0, outcome: "refunded" });
    const proofs = await t.query(api.proofs.latest, {});
    expect(proofs.find((p) => p.label === "Deadline passed, refunded to Astro")).toMatchObject({ hash: "TX2", network: "testnet", synthetic: false });
  });

  it("does nothing before the deadline", async () => {
    const m = routes();
    vi.stubGlobal("fetch", m.fetch);
    const t = convexTest(schema, modules);
    const escrowId = await lockPo(t);
    vi.advanceTimersByTime(DAY - 1000);
    expect(await t.action(internal.escrows.refundAtDeadline, { escrowId })).toEqual({ ok: false, reason: "not_due" });
    expect(m.sent).toHaveLength(2);
  });

  it("refunds the unreclaimed held part to Astro at the deadline after a partial release", async () => {
    const m = routes();
    vi.stubGlobal("fetch", m.fetch);
    const t = convexTest(schema, modules);
    const escrowId = await lockPo(t);
    vi.advanceTimersByTime(DAY / 2);
    expect(await t.action(internal.escrows.release, { escrowId, to: haoyun, cents: cents(34200) })).toEqual({ ok: true });
    const mid = await t.run((ctx) => ctx.db.get(escrowId));
    expect((await t.run((ctx) => ctx.db.system.get(mid!.refundJobId!)))?.state.kind).toBe("pending");

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(m.sent.map((s) => JSON.parse(s.body).args?.memo).filter(Boolean)).toEqual(["PO 1042 escrow", "PO 1042 release", "PO 1042 deadline refund"]);
    expect(JSON.parse(m.sent[3].body).args).toEqual({ receiver_id: astro, amount: "3800000000", memo: "PO 1042 deadline refund" });
    const e = await t.run((ctx) => ctx.db.get(escrowId));
    expect(e).toMatchObject({ releasedCents: cents(34200), reclaimedCents: cents(3800), closed: true, outcome: "refunded" });
  });

  it("cancels the refund once the whole amount was released", async () => {
    const m = routes();
    vi.stubGlobal("fetch", m.fetch);
    const t = convexTest(schema, modules);
    const escrowId = await lockPo(t);
    vi.advanceTimersByTime(DAY / 2);
    expect(await t.action(internal.escrows.release, { escrowId, to: haoyun, cents: cents(38000) })).toEqual({ ok: true });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(m.sent.map((s) => JSON.parse(s.body).args?.memo).filter(Boolean)).toEqual(["PO 1042 escrow", "PO 1042 release"]);
    const e = await t.run((ctx) => ctx.db.get(escrowId));
    expect(e).toMatchObject({ releasedCents: cents(38000), reclaimedCents: 0, closed: true, outcome: "released" });
    expect((await t.run((ctx) => ctx.db.system.get(e!.refundJobId!)))?.state.kind).toBe("canceled");
    // Even if the job had already started, the action refuses to refund.
    vi.advanceTimersByTime(2 * DAY);
    expect(await t.action(internal.escrows.refundAtDeadline, { escrowId })).toEqual({ ok: false, reason: "closed" });
    expect(m.sent).toHaveLength(3);
  });

  it("never stores the escrow key", async () => {
    vi.stubGlobal("fetch", routes().fetch);
    const t = convexTest(schema, modules);
    await lockPo(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const sub = await subWalletKey("po-1042", KEY);
    const dump = JSON.stringify(await t.run(async (ctx) => [await ctx.db.query("escrows").collect(), await ctx.db.query("proofs").collect()]));
    expect(dump).not.toContain(sub);
    expect(dump).not.toContain(KEY);
  });

  it("refuses to refund without the parent key in the environment", async () => {
    vi.stubGlobal("fetch", routes().fetch);
    const t = convexTest(schema, modules);
    const escrowId = await lockPo(t);
    delete process.env.OUTLAYER_API_KEY;
    vi.advanceTimersByTime(2 * DAY);
    await expect(t.action(internal.escrows.refundAtDeadline, { escrowId })).rejects.toThrow("OUTLAYER_API_KEY not configured");
  });
});
