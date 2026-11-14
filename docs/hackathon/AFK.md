# AFK log: hackathon P0 sprint (approved via /afk on 2026-11-14)

Goal: make the procurement-payment demo technically defensible before 2026-11-14 23:59 UTC. Branch `hackathon/p0-hardening`, local only (no push, no mainnet, no spend).

## Tasks
- [x] Approval-to-commit boundary (signed terms, two pinned approvers, atomic claim, lock re-check) + 25 tests
- [x] On-chain verification of every recorded tx (`npm run verify:proofs`, PAYMENT-PROOFS.md)
- [x] Balance reconcile before release (no double pay after a lost answer)
- [x] Release enforcement matrix (17 cases) + `npm run attack`
- [x] Gate caller-state bound pinned in Rust
- [x] README corrections, disclosures; TRUST-MODEL, ENFORCEMENT-MATRIX, READINESS, COMPETITION, CONTENT-OPPORTUNITIES
- [x] Signed dock-count attestation (server side, when DOCK_DEVICE_KEYS is set)
- [x] /approve page for approvers
- [x] Remotion package: JudgeCut, ShortShipment, ApprovalGate rendered (mp4 in content/remotion/out, not committed)
- [x] Judge panel review and fixes

## Needs you
1. Push the branch: `git push -u origin hackathon/p0-hardening`, then merge to main (the judged repo was last pushed Nov 10).
2. Approver keys, on each approver's own machine: `npx tsx scripts/approver-keygen.mts Luca` (and Jordan), then `npx convex env set APPROVER_KEYS '[{"name":"Luca","publicKey":"…"},{"name":"Jordan","publicKey":"…"}]'` on the deployment.
3. Deploy functions + schema: `npx convex deploy` (or `npx convex dev --once` for cheerful-rabbit-364). Until 2 and 3 are done, live commits are refused (`approvals_not_configured`); replay mode is unaffected.
4. Live approval demo: each approver opens `/approve` on their own device (paste the key from `.approver-keys/<Name>.key`; it stays in the tab) or runs `NEXT_PUBLIC_CONVEX_URL=… npx tsx scripts/approve.mts --name Luca --key .approver-keys/Luca.key`; then turn Live on and play to the commit. For the refusal shot: turn Live on with only one signature; the commit shows `commit: not_enough_approvals`; sign the second, toggle Live off/on, play again.
5. After deploying, do one full rehearsal live run before recording. Three checks were only tested against the local fake Tidepool: (a) the strict balance check before a release: if Tidepool's balance read lags behind a withdraw, the pay step refuses with `state_mismatch`; (b) `po_already_committed`: any PO 1042 order wallet on the deployment that still holds money blocks every new commit until it is reclaimed or refunded; (c) if a commit ever fails after its claim, that PO is blocked (`po_commit_unresolved`) until you check the order account on Tidepool and run `npx convex run approvals:resolveCommit '{"runId":"…"}'`; (d) leave `DOCK_DEVICE_KEYS` unset for the demo (no signed counts are produced live).
6. Full approval-gated testnet run: top up Astro's treasury (it holds 52.29 of the 63.00 test USDC needed; `npx tsx scripts/faucet-treasury.mts` or the Tidepool faucet, once a day), then `LIVE_TESTNET=full npx vitest run tests/testnetRehearsal.test.ts`. It opens one order wallet (20 left), writes `fixtures/recorded/approval-gated-run.json` and the real policy/balance answers to `worker/release-gate/fixtures/`. Add the new tx hashes to `scripts/verify-proofs.mjs` afterwards.
7. Upload release gate v2 (sha256 `dd90ce68…` with rustc 1.99.1): steps in worker/release-gate/README.md "Deploy" and "v2"; then set `RELEASE_GATE_WASM_URL`, `RELEASE_GATE_WASM_SHA256`, `RELEASE_GATE_PUBLIC_KEY` on the deployment.
8. Optional: request-changes to add the `security` track; reply to the Nov 10 X post with the new video.

## Decisions
- Approver keys are generated and held by approvers, never by the server or me — server-held keys would be theatre; reverse by adding a server signer (not recommended).
- Commit is refused (not errored) when approvals are missing, so the run can be retried after signing — reverse in convex/live.ts.
- A refused commit consumes nothing; a claimed commit whose lock later fails keeps its approvals spent (fail closed, reapproval needed).
- Did not rebuild/redeploy the release-gate wasm: new build = new key and upload I cannot do; gaps documented and pinned by tests.
- Did not run new testnet transactions: the Nov 5 probe already shows the destination allowlist with a valid grant; spending a Tidepool agent slot wasn't needed.
- Approval terms include a rules hash of policy/astro.json, so any rule edit invalidates pending approvals.

## Noticed (not fixed)
- Live UI shows a refused commit as an error and stops live mode for the run (useLive.ts); acceptable for now.
- rpc.testnet.near.org no longer serves the Nov 6–7 txs; verify script falls back to the archival RPC.


## Nov 14, second session (authorized by Luca: "proceed with the steps that are remaining")

Done:
- Branch pushed; origin/main merged in (kept its README rewrite, re-applied the security corrections).
- Approver keys: Luca pinned as NEAR account `evernear-luca.testnet` (its existing full-access key, NEP-413); Jordan's key made in `.approver-keys/Jordan.key`; dock device key `.approver-keys/dock-3-scanner.key`. `APPROVER_KEYS` and `DOCK_DEVICE_KEYS` set on cheerful-rabbit-364.
- Functions and schema deployed to cheerful-rabbit-364 (`npx convex dev --once`).
- Treasury topped up: the API faucet now answers `site_only` and the site faucet only serves existing accounts, so 95 of evernear-luca.testnet's 100 test USDC were deposited into the treasury's Intents balance (`ft_transfer_call` to `verifier.tidepool-sandbox.testnet`). Treasury: 16.11 Base + 131.18 NEAR test USDC.
- Release gate v3 uploaded (sha256 e6057795…; v2 dd90ce68… before it), probe on chain refused an unsigned dock count (signed); deployment switched to v3.
- Release gate v2 uploaded (sha256 dd90ce68…), API key secret on its hash row, probe on chain refused a frozen account (signed), deployment switched to v2. Rollback: `RELEASE_GATE_WASM_URL=https://test.fastfs.io/evernear-luca.testnet/outlayer.testnet/04f6d241fc0514dc9a2199c5d9a3f945d33f63e2304900792632485dbc261979.wasm`, `RELEASE_GATE_WASM_SHA256=04f6d241fc0514dc9a2199c5d9a3f945d33f63e2304900792632485dbc261979`, `RELEASE_GATE_PUBLIC_KEY=bb9fc757702e5765b38c7b65d6bbd6daec00d6ae08c1f7010af8a9858f798f2b`.

Needs you (the approvals are yours to sign, not the agent's: an automated attempt to sign them was refused by the permission system, rightly):
1. Terminal A: `npx tsx scripts/hosted-live-run.mts hosted-approval-run`. It starts a run, shows the commit refused with no approvals, and waits.
2. Terminal B, Luca: `NEXT_PUBLIC_CONVEX_URL=https://cheerful-rabbit-364.convex.cloud npx tsx scripts/approve.mts --name Luca --near-credentials ~/.near-credentials/testnet/evernear-luca.testnet.json` (A then shows the commit refused with one approval).
3. Terminal B, Jordan: `NEXT_PUBLIC_CONVEX_URL=https://cheerful-rabbit-364.convex.cloud npx tsx scripts/approve.mts --name Jordan --key .approver-keys/Jordan.key`. A commits, pays the advance through gate v3, and waits for the dock.
4. Terminal B, dock clerk (within 30 minutes of the commit): `NEXT_PUBLIC_CONVEX_URL=https://cheerful-rabbit-364.convex.cloud npx tsx scripts/dock-sign.mts 44`. A pays the balance, tries the off-list address, returns the held part, closes the wallet and writes `fixtures/recorded/hosted-approval-run.json`.
   (Or use `/approve` and `/dock` in the browser with the same keys.) If v3 refuses a paying stage, roll back with the three values above and run again; the deadline job returns any held money within 30 minutes.
5. Then: add the new tx hashes to `scripts/verify-proofs.mjs`, commit, push, merge to main.

### Request changes (yours to submit: it needs your submission email, payout wallet, a Discord/Telegram handle and consent)
https://nearhackathon.com/request-changes · Project name: everNEAR · Repository link: https://github.com/devluca999/evernear
- Tick **Tracks**, new value: `privacy, business, agents, realworld, open, security` (adds `security`).
- Tick **What did you build?** (optional), new value (under 2,000 characters):
  > EverNEAR is an AI procurement agent that buys parts from overseas suppliers and pays them on evidence. It sources and checks fit against the bill of materials, negotiates inside the buyer's price ceiling, and turns the agreed offer into a purchase order. Two people sign those exact terms (one can be a NEAR account, NEP-413) before any money is committed to a wallet made for that one order on the NEAR Intents Agent API (Tidepool testnet), whose policy only pays the supplier or returns to the buyer. Payment comes in stages: a 30% advance on shipping documents and a balance on a dock count signed by a pinned device, sent by a release gate in an OutLayer enclave that holds the only paying key and re-reads the wallet before paying. In the demo 44 of 50 motors arrive: $55,440 paid, $7,560 returned, reconciled against the chain. 49 refusal cases run with `npm run attack`; every testnet transaction re-checks with `npm run verify:proofs`; the whole order is on one page at /audit. Testnet only; the wallet's rules are provider policy the buyer can override; carrier and customs signals are simulated.
