// Test approvers: two fixed ed25519 keys standing in for Luca's and Jordan's devices, and helpers
// to sign the live order's terms or to authorize a lock directly. Test keys only.
import type { convexTest } from "convex-test";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { signApproval, termsDigest, type SignedApproval } from "@/engine/approvals";
import { commitTerms, liveTerms, type Scenario } from "@/convex/approvalTerms";
import { ed25519 } from "@noble/curves/ed25519.js";

type T = ReturnType<typeof convexTest>;
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export const KEYS: Record<string, Uint8Array> = {
  Luca: new Uint8Array(32).fill(11),
  Jordan: new Uint8Array(32).fill(22),
  Mallory: new Uint8Array(32).fill(33),
};
export const pub = (name: string) => hex(ed25519.getPublicKey(KEYS[name]));
export const APPROVER_KEYS = JSON.stringify([{ name: "Luca", publicKey: pub("Luca") }, { name: "Jordan", publicKey: pub("Jordan") }]);
export const setApprovers = (raw = APPROVER_KEYS) => { process.env.APPROVER_KEYS = raw; };

let n = 0;
export function sign(name: string, digest: string, o: { nowMs?: number; ttlMs?: number; nonce?: string; as?: string; key?: string } = {}): SignedApproval {
  const now = o.nowMs ?? Date.now();
  return signApproval({ approver: o.as ?? name, secretKey: KEYS[o.key ?? name], digest, nonce: o.nonce ?? `n-${name}-${++n}-${now}`, issuedAt: now, expiresAt: now + (o.ttlMs ?? 3_600_000) });
}

export const liveDigest = (scenario: Scenario = "happy") => termsDigest(liveTerms(scenario));

/** Luca and Jordan sign the live order's terms and submit, as scripts/approve.mjs does. */
export async function approveLive(t: T, scenario: Scenario = "happy", who = ["Luca", "Jordan"]) {
  for (const name of who) {
    const r = await t.mutation(api.approvals.submit, { approval: sign(name, liveDigest(scenario)) });
    if (!r.ok) throw new Error(`approval refused: ${r.reason}`);
  }
}

/** A run whose commit was claimed with two consumed approvals for these terms: what lock checks. */
export async function authorizedRun(t: T, i: { po: string; supplierAddress: string; quantity: number; unitCents: number }): Promise<Id<"liveRuns">> {
  const terms = commitTerms(i)!;
  const digest = termsDigest(terms);
  return t.run(async (ctx) => {
    const runId = await ctx.db.insert("liveRuns", { startedAt: Date.now(), done: [], commit: { digest, approvers: ["Luca", "Jordan"], nonces: ["a", "b"], claimedAt: Date.now() } });
    for (const [name, nonce] of [["Luca", `a-${runId}`], ["Jordan", `b-${runId}`]]) {
      const s = sign(name, digest, { nonce });
      await ctx.db.insert("commitApprovals", { ...s, po: i.po, status: "consumed", runId, at: Date.now() });
    }
    return runId;
  });
}
