# Enforcement matrix

Which component refuses each attack on the money, tested on its own so a refusal at one layer is never presented as proof of another. Tests: [`tests/enforcementMatrix.test.ts`](../../tests/enforcementMatrix.test.ts) (releases), [`tests/commitAuthorization.test.ts`](../../tests/commitAuthorization.test.ts) (commit), [`tests/near/escrow.test.ts`](../../tests/near/escrow.test.ts) "failure injection", `cargo test` in [`worker/release-gate`](../../worker/release-gate).

Environments:
- **local engine**: pure TypeScript, no network ([`engine/escrow.ts`](../../engine/escrow.ts), [`engine/approvals.ts`](../../engine/approvals.ts)).
- **local gate twin**: [`engine/releaseGate.ts`](../../engine/releaseGate.ts), checked against the Rust worker's own [`vectors.json`](../../worker/release-gate/vectors.json).
- **simulated provider**: [`tests/near/fakeTidepool.ts`](../../tests/near/fakeTidepool.ts), a local model of Tidepool's grant, policy, frozen and idempotency rules written from its docs and live probes. It shows what our code does with each answer; it does not prove Tidepool behaves this way.
- **real testnet**: a call that reached Tidepool / NEAR testnet / OutLayer testnet. See [PAYMENT-PROOFS.md](PAYMENT-PROOFS.md).

## Commit (money into the order's wallet)

| Attack | Refused by | Code | Environment | Test |
|---|---|---|---|---|
| No approvals / one approval | `claimCommit` | `not_enough_approvals` | Convex (convex-test) + simulated provider | commitAuthorization "no approvals", "one approval only" |
| Same approver twice | `verifyApprovals` | `duplicate_approver` | same | "the same approver twice" |
| Unpinned approver / someone else's name | `approvals.submit` | `unknown_approver`, `key_mismatch` | same | "an approver who is not pinned" |
| Forged signature | `approvals.submit`, `claimCommit` | `bad_signature` | same | "a forged signature", "client-controlled approval state" |
| Expired approval | `claimCommit` | `expired` | same | "expired approvals" |
| Replayed approval | `approvals.submit` (nonce spent) | `replayed` | same | "committed once, and the approvals cannot be replayed" |
| Approval for another supplier, smaller amount, other quantity, other wallet, older PO version | digest mismatch | `terms_mismatch` | same | "do not match the terms committed" |
| Terms changed after approval ($1,260 to $1,320) | digest mismatch | `not_enough_approvals` for the new terms | same | "changed terms need new approvals" |
| Payment rules changed after approval | `rulesHash` in the digest | `terms_mismatch` | local engine | approvals.test "a payment-rule change" |
| Revoked approval / revoked approver | `approvals.revoke`, registry | `approver_revoked` | Convex | "a revoked approval, and a revoked approver" |
| No approver keys configured | fail closed | `approvals_not_configured` | Convex | "fail closed" |
| Two concurrent commits | run claim in one transaction | `commit_already_claimed` | Convex | "two concurrent commit requests open one wallet" |
| Direct call to the wallet's `lock`, bypassing `runStep` | `lock` re-checks the claim | `no_authorization`, `not_claimed`, `terms_mismatch` | Convex | "the alternate path" |

Not yet run against the live deployment: approver keys must be provisioned first (see READINESS, Needs you).

## Release (money out of the order's wallet)

| # | Attack | Layer that refuses | Code | Environment | Real-testnet evidence |
|---|---|---|---|---|---|
| 1 | No release authorization | provider, grant | `grant_invalid` | simulated provider | Yes: recorded gate-path run, server's withdraw to `0x…dead` refused with `grant_invalid` (no tx) |
| 2 | Invalid (unregistered) grant token | provider, grant | `grant_invalid` | simulated provider | Same as 1 |
| 3 | Revoked authorization | provider, grant | refused | simulated provider | Grants revoked at close (intent ids in PAYMENT-PROOFS); no post-revoke attempt recorded. Grant expiry not modelled |
| 4 | Gate answer for another PO or account | server check of the signed gate answer | `field_mismatch` | local gate twin | No |
| 5 | Gate answer for another amount | server check | `amount_mismatch` | local gate twin | No |
| 6 | Gate answer for another destination / tampered answer | server check | `field_mismatch` / `bad_signature` | local gate twin | No |
| 7 | Duplicate authorization (same idempotency key) | provider, idempotency | replay, or `idempotency_conflict` | simulated provider | No |
| 8 | **Valid grant, prohibited recipient** | provider, **destination policy** (and engine first) | `policy_destination_denied` (engine: `address_not_allowed`) | simulated provider + engine | **Yes, Nov 5**: server-path account, withdraw to `0x…dead` answered 403 `policy_destination_denied`; the same grant then paid Haoyun 34.20 (Base Sepolia `0x34da8955…`). The 403 itself has no tx; recorded in [NOTES.md](../NOTES.md) section 14 |
| 9 | Valid grant, excessive amount | provider per-transaction cap; engine `bad_quantity` / `over_balance`; gate `received_over_ordered` / `over_locked` | `policy_transaction_limit_exceeded` | simulated provider + engine + gate | Tidepool's own e2e script showed the cap refusal on Nov 5 (not our account) |
| 10 | Missing milestone evidence | engine and gate | `missing_signal(s)` | engine + gate twin (+ Rust) | Refusal proof rows in the app; no testnet call is made |
| 11 | Tampered evidence | gate; server dock-count signature check when devices are pinned | `count_mismatch`, `dock_bad_signature`, `dock_wrong_po`, `dock_unsigned`, `dock_stale` | gate twin + server ([escrow.test.ts](../../tests/near/escrow.test.ts) "signed dock count") | **Gap remains**: a pinned device that reports a false count is paid; and the deployed gate does not check the signature itself |
| 12 | Reused evidence (second advance / balance) | engine, gate, idempotency | `already_released`, `nothing_due` | engine + gate twin | No |
| 13 | Wrong policy version | engine reads [`policy/astro.json`](../../policy/astro.json) | n/a | engine | **Gap**: the deployed gate takes `advance_percent` from its caller (pinned by test) |
| 14 | Correct authorization, evidence, recipient | (pays) | | all | **Yes**: $18.90 and $36.54 to Haoyun on Base Sepolia, read from chain |
| 15 | Repeat payout after success | engine; balance reconcile; idempotency | `already_released`, `state_mismatch` | engine + simulated provider | No |
| 16 | After deadline or settlement | engine | `past_deadline`, `closed` | engine | No |
| 17 | Frozen wallet | provider | `wallet_frozen` | simulated provider | Account frozen at close (intent id); no post-freeze attempt recorded |

## What is authoritative for "no duplicate payout"

1. **The order account's balance** (Tidepool): it only ever holds the committed total, so nothing can pay more than $63.00 in all.
2. **Per-stage idempotency key** sent by the gate (`rg1-<stage>-…`): a second advance or balance is a replay or a conflict for as long as Tidepool keeps the key (retention not documented).
3. **Balance reconcile** before every release ([`escrow.ts`](../../convex/near/escrow.ts) `#reconcile`): the escrow row must agree with the on-chain balance or nothing is sent.
4. **Engine and run state** (`already_released`, `runStep` step order): correct only while the backend is honest.

The gate itself is stateless and cannot guarantee idempotency on its own.
