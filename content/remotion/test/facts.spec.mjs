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

// ---- PartialShipment / JudgeDemo facts ----------------------------------------------------------
const readiness = read("docs/hackathon/READINESS.md");
const proofsMd = read("docs/hackathon/PAYMENT-PROOFS.md");
const approvalRun = JSON.parse(read("fixtures/recorded/approval-gated-run.json"));
const gateV2 = JSON.parse(read("fixtures/recorded/gate-v2-frozen-probe.json"));

test("real testnet approval refusals: 0 and 1 approvals refused, agent count 5 before and after", () => {
  assert.equal(approvalRun.zeroApprovals.reason, "not_enough_approvals");
  assert.equal(approvalRun.oneApproval.reason, "not_enough_approvals");
  assert.equal(approvalRun.agentsUsedBefore, 5);
  assert.equal(approvalRun.agentsUsedAfter, 5);
  assert.equal(approvalRun.quotaUnchanged, true);
  assert.match(approvalRun.approvers, /rehearsal keys, not people/);
  assert.deepEqual(approvalRun.rows.filter((r) => r.kind === "refusal").map((r) => r.response.valid), [0, 1]);
  assert.ok(approvalRun.rows.every((r) => r.hash === "none" && r.response.total_cents === 6_300_000));
  assert.match(proofsMd, /The full approval-gated run .* was not run/);
  assert.match(data, /Test suite only: the full approval-gated testnet run has not been done/);
});

test("commit receipt is the Nov 6 run, before the approval check existed", () => {
  assert.match(gateV2._note, /Nov 6 run/);
  assert.match(data, /RECORDED_RUN_LABEL = "Nov 6"/);
  assert.match(readiness, /Live commit did not check approvals/);
  assert.equal(proofs.entries.find((e) => e.stage === "commit").txId, "366nhBeJvx6Ch7kpx2ZR8ZchQvBDrxVhtPFe8J62ynC1");
});

test("gate v2 refused a frozen account on chain with a signed account_frozen", () => {
  assert.equal(gateV2.tx, "4qXdn52ZYn6Xwhy5KeXxL3fFqzaaWojp4nyaZcxkp2vH");
  assert.equal(gateV2.output.ok, false);
  assert.equal(gateV2.output.reason, "account_frozen");
  assert.equal(gateV2.signature_valid, true);
  assert.ok(gateV2.explorer.includes(gateV2.tx));
  assert.match(gateV2._note, /Nov 14/);
  const deployed = trust.match(/Gate (v\d) \(deployed Nov 14; has only refused on chain so far\)/);
  assert.ok(deployed, "TRUST-MODEL names the deployed gate");
  assert.match(data, new RegExp(`DEPLOYED_GATE = "${deployed[1]}"`));
  const v4 = JSON.parse(read("fixtures/recorded/gate-v4-exploit-probe.json"));
  assert.equal(v4.output.reason, "terms_missing");
  assert.equal(v4.output.ok, false);
  assert.ok(v4.explorer.includes(v4.tx));
  assert.match(trust, /Through the gate that paid the recorded run \(v1\)/);
  const v3 = JSON.parse(read("fixtures/recorded/gate-v3-unsigned-dock-probe.json"));
  assert.equal(v3.output.reason, "dock_unsigned");
  assert.equal(v3.output.ok, false);
  assert.ok(v3.explorer.includes(v3.tx));
});

test("reconciliation 18.90 + 36.54 + 7.56 = 63.00 comes from chain reads in payment-proofs.json", () => {
  const r = proofs.reconciliation;
  assert.equal(Number(r.advanceRaw) + Number(r.balanceRaw) + Number(r.reclaimRaw), Number(r.commitRaw));
  assert.equal(r.sumOutRaw, r.commitRaw);
  assert.match(readiness, /18\.90 \+ 36\.54 \+ 7\.56 = 63\.00 read from chain/);
});

test("agent autonomy rows are quoted from READINESS.md", async () => {
  const rows = [...data.matchAll(/\{ step: "([^"]+)", cls: "([^"]+)"/g)];
  assert.ok(rows.length >= 8);
  for (const [, step, cls] of rows) assert.ok(readiness.includes(`| ${step} | ${cls} |`), step);
  assert.ok(readiness.includes("No step lets a model choose an amount, an address or whether money moves."));
});

test("still simulated / trusted quotes match the docs", () => {
  const sim = data.match(/STILL_SIMULATED_DOC =\s*"([^"]+)"/)[1];
  assert.ok(readiness.includes(sim));
  assert.match(trust, /could skip approvals and commit; could make the gate overpay Haoyun up to the order total/);
  assert.match(trust, /keeps the gate's grant and signing key bound to the wasm hash/);
  assert.match(trust, /when devices are pinned/);
  assert.match(trust, /without pinned devices the scenario's 44 is used and labelled unsigned/);
  assert.match(trust, /since Nov 14 the deployed gate \(v\d\) checks it too/);
  assert.match(trust, /with the owner key it can rewrite a funded order wallet's policy and pay any address/);
  assert.doesNotMatch(data, /does not check the signature yet|paying key lives only/);
  const dock = proofs.entries.find((e) => e.txId === "dock-1042");
  assert.equal(dock.verification.status, "simulated");
});

test("npm run attack has 49 test cases (counted in its three files)", () => {
  const pkg = JSON.parse(read("package.json"));
  const files = pkg.scripts.attack.match(/\S+\.test\.ts/g);
  assert.equal(files.length, 3);
  const n = files.reduce((a, f) => a + (read(f).match(/^\s*(?:it|test)\(/gm) ?? []).length, 0);
  assert.equal(n, 49);
  assert.match(data, /cases: 49,/);
  assert.ok(pkg.scripts["verify:proofs"]);
});
