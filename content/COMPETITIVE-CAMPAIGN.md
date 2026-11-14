# Competitive campaign: engineering changes as stories

Category line, not a dig at anyone: **"AI can handle procurement. It doesn't get to invent the payment rules."**
Rules for every piece: no competitor named or depicted; never "the only" or "the first" (other entries also settle partial deliveries pro-rata, see [COMPETITIVE-ANALYSIS.md](../docs/hackathon/COMPETITIVE-ANALYSIS.md)); never "trustless escrow" (the order wallet is provider-policy custody the buyer can override); label testnet 1:1,000 and simulated signals on screen. Luca publishes; nothing here is posted by the agent.

Readiness: **ready** = verified and media rendered or capturable now · **capture** = verified, needs a screen recording · **blocked** = needs Luca's action first.

---

## 1. "What if the AI only gets one approval?"
- **Problem:** the live commit path never checked approvals; the two on screen were presentation.
- **Fix:** approvers sign the exact terms (supplier, payout address, amount, quantity, PO version, price premium, rules hash); the server verifies two distinct pinned approvers and spends them once; the wallet's `lock` re-checks. An approver can be a NEAR testnet account (NEP-413).
- **Proof:** [commitAuthorization.test.ts](../tests/commitAuthorization.test.ts) (21 cases); real Tidepool testnet: commits with 0 and 1 approval refused, agent count 5 → 5 ([fixture](../fixtures/recorded/approval-gated-run.json)).
- **Why it matters:** the agent can prepare a $63,000 order; it cannot commit it.
- **Hook:** "We gave an AI a $63,000 purchase. Here's the one thing it couldn't do."
- **Video:** order on screen → "commit" → refused, 0 of 2 → Luca signs on his NEAR account → refused, 1 of 2 → Jordan signs → committed (real tx). Change the price by $60 → old signatures stop counting.
- **Explainer:** what the terms digest covers; where it is checked (backend, before any call) and what it does not stop (whoever holds the treasury key).
- **Storyboard (9:16):** 0–3 s hook · 3–10 s PO card · 10–18 s refusal 0/2, 1/2 · 18–26 s two signatures · 26–32 s commit receipt · 32–38 s "changed terms = no approval" · end line.
- **Recordings needed:** terminal running `scripts/hosted-live-run.mts` while Luca and Jordan sign (AFK Needs you 1–3); `/approve` page on a phone.
- **Remotion:** ApprovalGate, PurchaseOrder, TransactionReceipt (composition `ApprovalGate` exists).
- **Narration:** "Our agent found the supplier and negotiated the price. Then it tried to commit sixty-three thousand dollars. One signature: refused. Two people sign these exact terms, and only then does the money move."
- **X:** Our AI agent negotiated a $63,000 parts order. It could not commit a cent until two people signed the exact terms, and changing the price by $60 voided their signatures. Real testnet refusal + 21 tests. Built at NEAR HACKATHON @NEARProtocol #NEARHackathon
- **IG/TikTok:** The AI can negotiate. It can't approve itself. #NEARHackathon #AIagents
- **Readiness:** test-capture **ready**; live capture **blocked** on Luca's signatures.

## 2. "We ordered 50 motors. Six disappeared."
- **Problem:** amounts had to agree across UI, engine, gate and chain, and a short shipment had to change the payment, not the refund dispute.
- **Fix:** one order pipeline ([engine/order.ts](../engine/order.ts)) feeds the signed terms, the server's release rules and the gate; reconciliation generated from engine and chain.
- **Proof:** [orderPipeline.test.ts](../tests/orderPipeline.test.ts) (1,000 random orders agree to the cent); `npm run reconcile`; `npm run verify:proofs` (18.90 + 36.54 + 7.56 = 63.00 from chain).
- **Hook:** "Escrow can hold a payment. But what happens when only part of the order shows up?"
- **Video:** milestones vs a single release/refund; 44 of 50 → $36,540 balance, $7,560 back; the three real receipts.
- **Recordings:** `/audit` page scroll; Short mode (`?mode=short`) payout section.
- **Remotion:** `PartialShipment` (9:16), `ShortShipment` (9:16), PayoutComparison.
- **X:** We ordered 50 motors. 44 arrived. The supplier was paid for 44 in two stages and $7,560 went back to the buyer, every amount checkable on testnet. Built at NEAR HACKATHON @NEARProtocol #NEARHackathon
- **Readiness:** **ready**.

## 3. "We tried paying the same invoice twice."
- **Problem:** two concurrent advance requests sent two withdraws; a lost answer could pay again on retry.
- **Fix:** each money step claimed atomically; balance reconcile before every release; the gate (v3) reads what already left the account and refuses an understated release.
- **Proof:** commitAuthorization "concurrent advance"; escrow.test "failure injection"; Rust `v2_understated_released_is_refused`, `v2_second_advance_is_refused_by_the_balance`.
- **Hook:** "The network timed out. Did we pay? Here's why the agent won't guess."
- **Recordings:** terminal `npm run attack` filtered to these cases.
- **Readiness:** **capture** (tests only; no on-chain double-pay attempt recorded).

## 4. "We tried paying a supplier the wrong amount."
- **Fix:** the server checks the gate's signed answer (amount, PO, recipient); gate v3 reads the commitment and recipient from the account itself.
- **Proof:** matrix cases 4–6; Rust `v2_recipient_and_commitment_must_match_the_policy`.
- **Readiness:** **capture** (tests).

## 5. "We tried paying the wrong account."
- **Fix:** documented two distinct protections instead of one: the grant (recorded run, `grant_invalid`) and the destination allowlist with a valid grant (Nov 5, `policy_destination_denied`, same grant then paid Haoyun).
- **Proof:** [ENFORCEMENT-MATRIX.md](../docs/hackathon/ENFORCEMENT-MATRIX.md) cases 1–3; explorer link for the 34.20 payout.
- **Hook:** "Our own server tried to pay an unknown address. Two different locks said no."
- **Readiness:** **ready** (recorded rows + explorer); the Nov 5 403 has no tx and is shown as a recorded response.

## 6. "How does an AI know a shipment arrived?"
- **Fix:** dock count signed by a pinned device (`/dock`), checked by the server and, since v3, inside the enclave; replays and stale counts refused.
- **Proof:** [dockLive.test.ts](../tests/dockLive.test.ts); Rust `v3_balance_needs_a_pinned_dock_signature`; on-chain v3 refusal `dock_unsigned` (tx `8S4uYwhT…`).
- **Must say:** a signature shows which device reported the count, not that 44 motors are on the dock. Carrier and customs signals are still simulated.
- **Readiness:** **ready** for the explainer; live capture with `/dock` after Needs you 4.

## 7. "What does the TEE actually do?"
- **Proof:** gate results decoded from chain with valid signatures (verify-proofs); v2 probe `account_frozen`, v3 probe `dock_unsigned`; wasm hashes and keys in the worker README.
- **Must say:** it proves this code ran on this input and holds the only paying grant; it does not prove the evidence is true; the backend still holds the key that can ask it to run.
- **Readiness:** **ready**.

## 8. "Don't trust the animation. Check the transaction."
- **Proof:** `npm run verify:proofs` (exits non-zero on any mismatch), `/audit`, explorer links.
- **Readiness:** **ready**.

## 9. "Our agent can negotiate. It can't ignore the buyer's budget."
- **Proof:** price ceiling and approvals from [engine/order.ts](../engine/order.ts); the signed terms carry the premium (+5% inside the ceiling, +10% over it needs the exception); [orderPipeline.test.ts](../tests/orderPipeline.test.ts) "the live run's unit prices are what the negotiation simulator agrees to".
- **Must say:** supplier replies are simulated (conditional on the agent's counter).
- **Readiness:** **capture** (Present mode, bad path adjusted).

---

## Publishing order (by verified milestone)
1. #2 (ready now) as the reply to the Nov 10 submission post, with `PartialShipment` or `ShortShipment`.
2. #8 as a short thread with the explorer links.
3. #1 once Luca's hosted run with real signatures is recorded.
4. #7, #6, then #3–#5 as technical explainers.
