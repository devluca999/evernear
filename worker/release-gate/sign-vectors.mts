// Signs the release vectors' terms approvals and dock counts with TEST-ONLY keys (seeds 41, 42, 43),
// the keys the Rust tests pin under cfg(test). Never use a real approver or dock key here: a real
// signature in a public vector would be a reusable approval.
//   npx tsx worker/release-gate/sign-vectors.mts
import { readFileSync, writeFileSync } from "node:fs";
import { signApproval, signApprovalNep413, termsDigest, type CommitTerms } from "../../engine/approvals";
import { signDockCount } from "../../engine/attestation";

const P = "worker/release-gate/vectors.json";
const seed = (n: number) => new Uint8Array(32).fill(n);
const v = JSON.parse(readFileSync(P, "utf8"));
let n = 0;
for (const c of v.release_cases) {
  const i = c.input;
  if (typeof i !== "object" || !i || i.mode !== "release") continue;
  const terms = {
    v: 1, po: i.po, termsVersion: 3, buyer: "Astro Robotics Inc. (test vector)", supplierId: "haoyun", supplierAddress: String(i.to).toLowerCase(), supplierChain: "base",
    part: "Actuator motor", quantity: i.ordered_qty, unitCents: i.unit_cents, totalCents: i.locked_cents, priceChangeBps: 500, withinCeiling: true, currency: "USD",
    settlement: { asset: "test", chain: "base", scale: 1000, units: "0" }, rulesHash: "test-vector", approvalsRequired: 2,
  } as unknown as CommitTerms;
  const digest = termsDigest(terms);
  const at = { issuedAt: 1_800_000_000_000, expiresAt: 1_800_003_600_000 };
  i.terms = terms;
  i.approvals = [
    signApprovalNep413({ approver: "Luca", accountId: "luca-test.testnet", secretKey: seed(41), digest, nonce: `vec-${c.name}-l`, ...at }),
    signApproval({ approver: "Jordan", secretKey: seed(42), digest, nonce: `vec-${c.name}-j`, ...at }),
  ];
  const dc = i.signals?.dock_count;
  if (i.stage === "balance" && dc && typeof dc === "object" && typeof dc.count === "number") {
    dc.attestation = signDockCount({ po: i.po, agentId: i.agent_id, count: dc.count, at: "2026-11-11T08:40:00Z", device: "dock-3-scanner", secretKey: seed(43) });
  }
  n++;
}
writeFileSync(P, JSON.stringify(v, null, 2) + "\n");
console.log(`signed ${n} release cases with test-only keys`);
