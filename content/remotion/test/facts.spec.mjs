// The refusal and trust facts in src/data.ts are quoted from docs/hackathon. Keep them in sync.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const repo = new URL("../../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, repo), "utf8");
const matrix = read("docs/hackathon/ENFORCEMENT-MATRIX.md");
const trust = read("docs/hackathon/TRUST-MODEL.md");
const proofs = JSON.parse(read("docs/hackathon/payment-proofs.json"));
const data = readFileSync(new URL("../src/data.ts", import.meta.url), "utf8");

test("approval refusal facts appear in ENFORCEMENT-MATRIX.md", () => {
  assert.match(matrix, /No approvals \/ one approval \| `claimCommit` \| `not_enough_approvals`/);
  assert.match(matrix, /Terms changed after approval \(\$1,260 to \$1,320\).*`not_enough_approvals`/);
  assert.match(matrix, /Not yet run against the live deployment: approver keys must be provisioned first/);
  assert.match(data, /Not yet run against the live deployment: approver keys must be provisioned first/);
  assert.match(data, /tests\/commitAuthorization\.test\.ts/);
  assert.match(matrix, /tests\/commitAuthorization\.test\.ts/);
});

test("grant-layer refusal is the recorded gate-path run; destination refusal is the Nov 5 probe", () => {
  assert.match(matrix, /recorded gate-path run, server's withdraw to `0x…dead` refused with `grant_invalid`/);
  assert.match(matrix, /\*\*Yes, Nov 5\*\*: server-path account, withdraw to `0x…dead` answered 403 `policy_destination_denied`/);
  const grant = proofs.entries.filter((e) => e.verification.details?.recorded?.layer === "grant");
  assert.equal(grant.length, 1);
  assert.equal(grant[0].verification.details.recorded.code, "grant_invalid");
  assert.equal(grant[0].txId, "none");
  const dest = proofs["probe-nov5"].entries.filter((e) => e.verification.details?.code === "policy_destination_denied");
  assert.equal(dest.length, 1);
  assert.notEqual(proofs["probe-nov5"].poAccount, proofs.entries.find((e) => e.stage === "commit-setup").recipient);
});

test("trust boundary names appear in TRUST-MODEL.md", () => {
  for (const name of ["Approval to commit", "Release decision", "Where money may go", "Who may release", "Evidence"]) {
    assert.ok(trust.includes(`| ${name} |`), name);
  }
  assert.match(trust, /community-run testnet, not NEAR infrastructure/);
  assert.match(trust, /\(SIMULATED in demo\)/);
});

test("receipts used by the video are verified entries with explorer URLs", () => {
  for (const stage of ["commit", "advance", "balance", "reclaim"]) {
    const e = proofs.entries.find((x) => x.stage === stage);
    assert.equal(e.verification.status, "verified", stage);
    assert.ok(e.explorerUrl && e.explorerUrl.includes(e.txId), stage);
  }
});
