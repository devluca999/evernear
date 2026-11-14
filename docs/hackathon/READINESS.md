# EverNEAR hackathon readiness

Updated 2026-11-14 ~03:30 UTC. Development ends **2026-11-14 23:59 UTC** ([COMPETITION.md](COMPETITION.md)). Branch: `hackathon/p0-hardening` (local, not pushed).

**Submission state.** EverNEAR is already submitted (directory entry "everNEAR", tracks privacy, business, agents, realworld, open; demo post on X Nov 10). Do not submit again (409). The public repo was last pushed Nov 10: judges and the AI screen see that state until this branch is pushed. Track changes (adding `security`) go through https://nearhackathon.com/request-changes.

## Quality gates (directive section 19)

| # | Gate | State | Evidence |
|---|---|---|---|
| 1 | Live commit enforces required approvals | **Done in code**; live deployment needs approver keys | [commitAuthorization.test.ts](../../tests/commitAuthorization.test.ts) |
| 2 | Financial rules not bypassable through UI or a direct server action | Done for commit (`lock` re-checks). Releases: engine + provider policy; a compromised backend can still overpay the allowlisted supplier up to the total (documented) | [TRUST-MODEL.md](TRUST-MODEL.md) |
| 3 | Settlement reconciles | Done: 18.90 + 36.54 + 7.56 = 63.00 read from chain | [PAYMENT-PROOFS.md](PAYMENT-PROOFS.md), `npm run verify:proofs` |
| 4 | Duplicate payouts: authoritative layer identified | Done: account balance + Tidepool idempotency key + new balance reconcile | [ENFORCEMENT-MATRIX.md](ENFORCEMENT-MATRIX.md) |
| 5 | Destination and grant protections tested separately | Done locally; real testnet evidence for both (grant: Nov 6 run; destination: Nov 5 probe, no tx for a 403) | matrix cases 1, 2, 8 |
| 6 | Release gate role and limits precise | Done | [TRUST-MODEL.md](TRUST-MODEL.md), worker README |
| 7 | Live transactions independently inspectable | Done | `npm run verify:proofs` |
| 8 | Simulation labelled | Done in app and docs (signals, dock check, pre-money steps) | README "What is simulated" |
| 9 | Reference engine matches demo values | Done | engine + gate vectors, escrow tests |
| 10 | README matches implementation | Updated on this branch (approvals, destination vs grant, gate limits, disclosures) | README |
| 11 | Tests and build pass | see Tests run below; `next build` passes; demo check fixed (it looked for the wrong page title) | this file |
| 12 | Recorded demo replays reliably | Unchanged; replay tests pass | short/scenario tests |
| 13 | Live demo's supported path works | **Blocked**: live commit now needs approvals (fail closed until keys are set and the backend redeployed) | Needs you 2-3 |
| 14 | Security refusals reproducible | Done: `npm run attack` (42 cases) | |
| 15 | Business story understandable | Existing UI and Short mode | |
| 16 | Judge video shows real proof | In progress (Remotion package, data from payment-proofs.json) | content/remotion |
| 17 | Official submission complete | Submitted Nov 10; push + post update needed | Needs you 1, 4 |
| 18 | No security regression for demo looks | Holds: replay mode untouched; live fails closed | |

## Risk-ranked backlog

| P | Item | State |
|---|---|---|
| P0 | Live commit did not check approvals (`convex/live.ts` called `lock` directly) | **Fixed**: signed terms digest, two pinned approvers, nonce spent atomically, `lock` re-check |
| P0 | Concurrent `runStep(commit)` could open two wallets | **Fixed**: commit claimed in one transaction |
| P0 | README claimed a live `policy_destination_denied` refusal for the recorded run; it was `grant_invalid` | **Fixed** wording; matrix separates the layers |
| P0 | Lost answer / stale escrow row could double-pay on retry | **Fixed**: on-chain balance reconcile before every release (`state_mismatch`) |
| P0 | Remote repo stale (Nov 10) | **Needs you**: push |
| P0 | Live mode on the hosted deployment will refuse commits until `APPROVER_KEYS` is set and functions deployed | **Needs you** |
| P1 | Gate trusts caller `released_cents`, `advance_percent`, `to`, evidence | Documented and pinned by tests; fix needs a new wasm build (new key, new upload): parked |
| P1 | Evidence not source-signed; dock count is a constant in live runs | **Partly fixed**: signed dock-count attestation enforced by the server when `DOCK_DEVICE_KEYS` is set; not in the deployed gate; carrier/customs signals still simulated |
| P1 | Tidepool is a community testnet; rivals show mainnet | Needs Luca's explicit yes for any mainnet call (CLAUDE.md rule 7) |
| P1 | `security` track not on the submission | Needs you (request-changes) |
| P2 | Live UI: a refused commit stops live mode for the run with `commit: <reason>` (toggle Live to retry). Approvers sign at `/approve` or with `scripts/approve.mts` | Open |
| P0 | Judge panel (JUDGE-REVIEW.md): trust docs overstated what a compromised backend cannot do; concurrent advance sent two withdraws; same PO could be committed twice; demo check always failed | **Fixed**: docs name the three backend keys; money steps claimed atomically; one open commitment per PO; demo check matches the title |
| P1 | Backend holds owner key + treasury grant (any destination) in this demo | Open: production design moves them to Astro's wallet; treasury policy could be narrowed with a live Tidepool owner action (needs you) |
| P2 | Grant expiry not modelled in the fake provider | Open |

## Agent autonomy, step by step (directive section 9)

| Step | Class | Where |
|---|---|---|
| Requirement intake (50 short) | Deterministic business logic on fixed demo data | [scenarios/demand.ts](../../scenarios/demand.ts), seed |
| Supplier search and fitment | Deterministic business logic | `engine` fitment, [seed/astro.ts](../../seed/astro.ts) offers (fixed) |
| Reading quotes and documents | Real external integration (NEAR AI Cloud private inference) where keys are set; replay otherwise | [inference.ts](../../convex/near/inference.ts) |
| Negotiation | Deterministic counter inside the 5% ceiling; supplier replies are simulated but conditional on the counter, through the real inbound email path | [scenarios/suppliers.ts](../../scenarios/suppliers.ts) |
| Recommendation (Haoyun all-50 at $1,260) | Deterministic rule (meets date and ceiling) | scenario |
| PO and commit terms | Deterministic, recomputed server-side | [convex/approvalTerms.ts](../../convex/approvalTerms.ts) |
| Approval routing (2 required over $10K or new supplier) | Deterministic business logic | [engine/policy.ts](../../engine/policy.ts) |
| Approvals | **Human-controlled action**: ed25519 signatures from approver devices (live); simulated taps in replay | [engine/approvals.ts](../../engine/approvals.ts) |
| Commitment | Actual external integration (Tidepool testnet) | [deadline.ts](../../convex/near/deadline.ts) |
| Milestone monitoring | **Mocked third-party response** (simulated carrier/customs feed) | [scenarios/tracking.ts](../../scenarios/tracking.ts) |
| Dock count | **Fixed demonstration data** (44) | `convex/live.ts` |
| Release decision and amount | Deterministic, in engine and in the OutLayer gate | engine, worker |
| Release execution | Actual external integration (OutLayer testnet enclave, Tidepool, Base Sepolia) | escrow.ts |
| Refund / reclaim | Actual external integration, triggered by Evernear | escrow.ts |

No step lets a model choose an amount, an address or whether money moves.

## What remains simulated

Astro, its customers and suppliers; supplier replies; shipment signals; the dock count; the attested dock-check worker (not deployed); the approvals and pre-money steps in replay mode; Astro's owner key is held by the backend in this demo.

## Tests run (this branch)

- `npx vitest run`: 457 passed (was 408 before this branch).
- `cargo test` in worker/release-gate: 25 passed.
- `npx tsc --noEmit`, `npx eslint convex engine tests scripts`, `npm run check:ip`: clean.
- `DEMO_MODE=1 node scripts/demo.mjs --check` from a fresh clone with no `.env.local`: passed.
- `npm run attack`: 44 passed. `npm run verify:proofs`: every recorded tx verified on public RPCs.

## Content readiness

See [content/CONTENT-OPPORTUNITIES.md](../../content/CONTENT-OPPORTUNITIES.md). The Remotion package lives in `content/remotion/` and reads `payment-proofs.json` for every hash.
