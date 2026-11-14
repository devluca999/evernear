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
| 11 | Tampered evidence | gate; server dock-count signature check when devices are pinned | `count_mismatch`, `dock_bad_signature`, `dock_wrong_po`, `dock_unsigned`, `dock_stale` | gate twin + server ([escrow.test.ts](../../tests/near/escrow.test.ts) "signed dock count") | **Gap remains**: a pinned device that reports a false count is paid; the deployed gate (v3) checks the signature inside the enclave since Nov 14 (on-chain probe `8S4uYwhT…`) |
| 12 | Reused evidence (second advance / balance) | engine, gate, idempotency | `already_released`, `nothing_due` | engine + gate twin | No |
| 13 | Wrong policy version | engine reads [`policy/astro.json`](../../policy/astro.json); gate v2 pins `ADVANCE_PERCENT` | `percent_not_policy` | engine + gate twin + Rust v2 | v1 (recorded run) took it from the caller; v3 (deployed Nov 14) pins it |
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

## The 14 release cases, mapped (Nov 14 brief)

Layer key: **E** reference engine (server, before any call) · **B** application backend (Convex state, claims, reconcile) · **G** TEE release gate (OutLayer, wasm-bound) · **P** NEAR Intents Agent API account policy on Tidepool (provider-enforced) · **N** settlement network (NEAR testnet / Base Sepolia). A backend or engine refusal is not presented as a blockchain restriction.

| # | Case | Refused by | Test | Real testnet evidence |
|---|---|---|---|---|
| 1 | Missing authorization | P (grant layer) | matrix 1 | Nov 6 run: server withdraw `grant_invalid` |
| 2 | Invalid release grant | P | matrix 2 | same |
| 3 | Valid grant, prohibited destination | P (allowlist) + E | matrix 8 | Nov 5 probe: `policy_destination_denied`, same grant then paid Haoyun (tx `0x34da8955…`) |
| 4 | Excessive withdrawal | P (per-tx cap) + E (`over_balance`, `bad_quantity`) + G (`over_locked`, `received_over_ordered`) | matrix 9 | — |
| 5 | Wrong purchase-order identity | B (server check of the gate's signed answer) + G v2 (account read by agent id) | matrix 4 | — |
| 6 | Incorrect payout amount | B (`amount_mismatch`) + G v3 (`released_not_on_chain`, `locked_not_on_chain`) | matrix 5, Rust `v2_*` | — **Bound:** v3 does not bind unit price and quantity to the approved terms (Rust `v3_bound_unit_price_not_bound_to_approved_terms`) |
| 7 | Missing milestone evidence | E + G | matrix 10 | — |
| 8 | Tampered or replayed evidence | G (`count_mismatch`; v3: `dock_unsigned`, `dock_bad_signature`, `dock_wrong_po`), B (signed dock count: `replayed`, stale) | matrix 11, dockLive.test | — |
| 9 | Duplicate release attempt | E (`already_released`), B (step claim, reconcile), P (idempotency key) | matrix 7, 12, 15; commitAuthorization "concurrent advance" | — |
| 10 | Out-of-order settlement | B (`out_of_order`) + E (missing signals) | live.test | — |
| 11 | Revoked grant | P | matrix 3 | grants revoked at close (intent ids) |
| 12 | Expired approval or deadline | B (`expired`), E (`past_deadline`) | commitAuthorization "expired", matrix 16 | — |
| 13 | Valid authorized release | (pays) | matrix 14 | $18.90 and $36.54 to Haoyun, gate signatures decoded from chain |
| 14 | Valid return of remaining funds | P (owner-only policy) + E (`reclaimHeld`) | escrow.test "reclaims" | $7.56 back to Astro, verified |
| + | Unsigned dock count (gate v3) | G v3 | Rust `v3_balance_needs_a_pinned_dock_signature` | **Nov 14 on chain**: signed refusal `dock_unsigned`, tx `8S4uYwhT…` |
| + | Frozen account (gate v2) | G v2 reads the account: `account_frozen` | Rust `v2_refuses_an_account_that_is_not_locked_down` | **Nov 14 on chain**: signed refusal, tx `4qXdn52Z…` |
| + | Commit with 0 or 1 approval | B (`claimCommit`) | commitAuthorization | **Nov 14 real Tidepool**: refused, agent count unchanged |
