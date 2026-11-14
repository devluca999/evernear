# AFK log: hackathon P0 sprint (approved via /afk on 2026-11-14)

Goal: make the procurement-payment demo technically defensible before 2026-11-14 23:59 UTC. Branch `hackathon/p0-hardening`, local only (no push, no mainnet, no spend).

## Tasks
- [x] Approval-to-commit boundary (signed terms, two pinned approvers, atomic claim, lock re-check) + 25 tests
- [x] On-chain verification of every recorded tx (`npm run verify:proofs`, PAYMENT-PROOFS.md)
- [x] Balance reconcile before release (no double pay after a lost answer)
- [x] Release enforcement matrix (17 cases) + `npm run attack`
- [x] Gate caller-state bound pinned in Rust
- [x] README corrections, disclosures; TRUST-MODEL, ENFORCEMENT-MATRIX, READINESS, COMPETITION, CONTENT-OPPORTUNITIES
- [ ] Signed dock-count attestation (server side)
- [ ] Remotion package (background agent)

## Needs you
1. Push the branch: `git push -u origin hackathon/p0-hardening`, then merge to main (the judged repo was last pushed Nov 10).
2. Approver keys, on each approver's own machine: `npx tsx scripts/approver-keygen.mts Luca` (and Jordan), then `npx convex env set APPROVER_KEYS '[{"name":"Luca","publicKey":"…"},{"name":"Jordan","publicKey":"…"}]'` on the deployment.
3. Deploy functions + schema: `npx convex deploy` (or `npx convex dev --once` for cheerful-rabbit-364). Until 2 and 3 are done, live commits are refused (`approvals_not_configured`); replay mode is unaffected.
4. Live approval demo: start a live run, then `NEXT_PUBLIC_CONVEX_URL=… npx tsx scripts/approve.mts --name Luca --key .approver-keys/Luca.key` (and Jordan) before pressing commit.
5. Optional: request-changes to add the `security` track; reply to the Nov 10 X post with the new video.

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
