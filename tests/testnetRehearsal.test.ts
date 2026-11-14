// @vitest-environment edge-runtime
// A real Tidepool testnet run through the approval-gated live path (api.live.runStep), in process:
// convex-test with the real fetch and the AGENT_* keys from .env.local (never printed). Approvals are
// signed by two in-memory REHEARSAL keys, generated per run and never written: this proves the
// approval-gated code runs against real testnet, not that two humans approved, and not the hosted
// deployment. Server path (the release-gate keys live only on the Convex deployment).
//   LIVE_TESTNET=refusals  commit with 0 and 1 approvals: refused, no wallet opened (quota unchanged). Spends nothing.
//   LIVE_TESTNET=full      the above, then 2 approvals and all five steps: opens 1 order wallet, commits 63.00
//                          test USDC from Astro's treasury (needs >= 63.00 Base USDC, or Base + NEAR USDC to swap).
// Output: fixtures/recorded/approval-gated-run.json (proof rows), and on a full run the order
// account's real policy and balances in worker/release-gate/fixtures/ for the gate v2 parser.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { ed25519 } from "@noble/curves/ed25519.js";
import schema from "@/convex/schema";
import { api, internal } from "@/convex/_generated/api";
import { AgentApiClient, agentApiBase, agentRoom, ownerFromPkcs8 } from "@/convex/near/agentapi";
import { liveTerms } from "@/convex/approvalTerms";
import { signApproval, termsDigest } from "@/engine/approvals";
import { loadTestnetEnv } from "./testnetEnv";

const modules = import.meta.glob("../convex/**/*.ts");
const MODE = process.env.LIVE_TESTNET;
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const SECRET = /(naa_|ngt_|wk_)[A-Za-z0-9_-]{8,}/;

describe.skipIf(MODE !== "refusals" && MODE !== "full")(`testnet rehearsal (${MODE})`, () => {
  it("runs the approval-gated live path against Tidepool testnet", async () => {
    loadTestnetEnv();
    const e = process.env;
    const keys = { a: ed25519.utils.randomSecretKey(), b: ed25519.utils.randomSecretKey() };
    e.APPROVER_KEYS = JSON.stringify([{ name: "rehearsal-approver-1", publicKey: hex(ed25519.getPublicKey(keys.a)) }, { name: "rehearsal-approver-2", publicKey: hex(ed25519.getPublicKey(keys.b)) }]);
    e.LIVE_ENABLED = "1";
    const owner = ownerFromPkcs8({ accountId: e.AGENT_OWNER_ACCOUNT_ID!, publicKey: e.AGENT_OWNER_PUBLIC_KEY!, pkcs8Base64: e.AGENT_OWNER_PRIVATE_KEY_PKCS8! });
    const client = new AgentApiClient({ fetch: (u, i) => fetch(u, i), apiKey: e.AGENT_API_KEY, baseUrl: agentApiBase(e.AGENT_API_BASE_URL), owner, sink: () => {} });
    const used = async () => agentRoom(await client.quotas())?.used ?? null;
    const t = convexTest(schema, modules);
    const { runId } = await t.mutation(api.live.start, {});
    const digest = termsDigest(liveTerms("happy"));
    const sign = (name: string, sk: Uint8Array) => { const now = Date.now(); return signApproval({ approver: name, secretKey: sk, digest, nonce: crypto.randomUUID(), issuedAt: now, expiresAt: now + 3_600_000 }); };
    const commit = () => t.action(api.live.runStep, { runId: runId!, step: "commit" });
    const log: Record<string, unknown> = { mode: MODE, at: new Date().toISOString(), host: new URL(agentApiBase(e.AGENT_API_BASE_URL)).host, approvers: "two in-memory rehearsal keys, not people" };

    // Free tier: refused before any call; the provider's agent count does not move.
    const before = await used();
    log.zeroApprovals = await commit();
    expect(await t.mutation(api.approvals.submit, { approval: sign("rehearsal-approver-1", keys.a) })).toEqual({ ok: true });
    log.oneApproval = await commit();
    const after = await used();
    log.agentsUsedBefore = before; log.agentsUsedAfter = after;
    log.quotaUnchanged = before !== null && after === before;
    expect(log.zeroApprovals).toEqual({ ok: false, reason: "not_enough_approvals" });
    expect(log.oneApproval).toEqual({ ok: false, reason: "not_enough_approvals" });
    expect(log.quotaUnchanged).toBe(true);

    if (MODE === "full") {
      expect(await t.mutation(api.approvals.submit, { approval: sign("rehearsal-approver-2", keys.b) })).toEqual({ ok: true });
      const fx = "worker/release-gate/fixtures";
      mkdirSync(fx, { recursive: true });
      const steps: Record<string, unknown> = {};
      for (const step of ["commit", "advance", "pay", "refuse", "reclaim"] as const) {
        steps[step] = await t.action(api.live.runStep, { runId: runId!, step });
        const run = await t.query(api.live.getRun, { runId: runId! });
        const esc = run?.run.escrowId ? await t.run((ctx) => ctx.db.get(run.run.escrowId!)) : null;
        if (esc && (step === "commit" || step === "advance")) {
          writeFileSync(`${fx}/tidepool-policy-after-${step}.json`, JSON.stringify(await client.policy(esc.agentId), null, 2) + "\n");
          const bal = await fetch(`${agentApiBase(e.AGENT_API_BASE_URL)}/v1/agents/${esc.agentId}/balances`, { headers: { "x-api-key": e.AGENT_API_KEY! } }).then((r) => r.json());
          writeFileSync(`${fx}/tidepool-balances-after-${step}.json`, JSON.stringify(bal, null, 2) + "\n");
          log.agentId = esc.agentId; log.account = esc.escrowAccount;
        }
        if (!(steps[step] as { ok: boolean }).ok) {
          // Abort safety: try to send the held part back now; else the deadline refund (needs the process alive) or the owner by hand.
          if (esc && step !== "commit") steps.recovery = await t.action(internal.near.deadline.reclaim, { escrowId: esc._id, runId: runId! }).catch((x) => String(x));
          break;
        }
      }
      log.steps = steps;
    }
    const run = (await t.query(api.live.getRun, { runId: runId! }))!;
    const out = JSON.stringify({ _note: "A real Tidepool testnet run through the approval-gated live path, in process (tests/testnetRehearsal.test.ts). Approvals were signed by two in-memory rehearsal keys, not by people, and not on the hosted deployment.", ...log, rows: run.proofs.map(({ _id, _creationTime, runId: _r, ...p }) => p) }, null, 2);
    expect(SECRET.test(out)).toBe(false);
    writeFileSync("fixtures/recorded/approval-gated-run.json", out + "\n");
  }, 15 * 60_000);
});
