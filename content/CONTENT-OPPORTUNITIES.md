# Content opportunities

Series: **"What happens when AI gets permission to spend money?"** Every piece below is tied to a change that passed its tests, or is labelled as not yet verified. Hashes and amounts come from [`docs/hackathon/payment-proofs.json`](../docs/hackathon/payment-proofs.json); never retype them.

Status scale: idea · script ready · capture ready · editing · verified · exported.

---

## 1. The approval gate — "What an AI agent cannot do without two human approvals"

- **Engineering finding:** the live commit path called the wallet directly; the two approvals on screen were not checked by the code that moves money.
- **Change implemented:** approvers sign the exact terms (supplier, payout address, amount, quantity, PO version, rules hash); the server verifies two distinct pinned keys, spends them once, and the wallet's lock re-checks before anything opens.
- **Evidence:** `npm run attack` — 16 commit cases in [commitAuthorization.test.ts](../tests/commitAuthorization.test.ts): one approval, same approver twice, forged, expired, replayed, other supplier/amount/wallet, concurrent commits, direct call to lock.
- **Audience question:** if an AI can buy things, who actually says yes?
- **Hook:** "We gave an AI a $63,000 purchasing decision. Here's what it couldn't do."
- **Visual proof:** terminal running `npm run attack` (real output); the refusal proof row `Commit refused before any call: 1 of 2 valid approvals`; after Needs-you step 2, a live run where the commit is refused, then both approvers sign and it commits (real tx).
- **Story (≤60 s):** agent prepares the order → tries to commit with one signature → refused, nothing opened → second approver signs the exact terms → committed. Then: change the price by $60 → old signatures no longer count.
- **Required assets:** terminal capture (exists, reproducible); live capture needs approver keys deployed.
- **Status:** script ready (test capture) · live capture blocked on keys.

## 2. Pay only for what arrives — "We ordered 50 motors. Only 44 arrived."

- **Engineering finding:** amounts had to agree across UI, engine, gate and chain.
- **Change implemented:** every recorded transaction verified on public RPCs; reconciliation 18.90 + 36.54 + 7.56 = 63.00 read from chain.
- **Evidence:** `npm run verify:proofs`; Base Sepolia `0x0fcba050…6045` transfers 36.540000 to Haoyun (checked independently).
- **Audience question:** what happens to your money when a shipment comes up short?
- **Hook:** "We ordered 50 motors. Only 44 arrived. The supplier got paid for 44."
- **Visual proof:** app Short mode + the three explorer pages (real) + the PayoutComparison graphic.
- **Story:** $63,000 committed → $18,900 when the goods leave → 44 counted → $36,540 → $7,560 never left the buyer.
- **Honesty line on screen:** "Testnet, 1:1,000. Shipment signals simulated."
- **Status:** capture ready · Remotion `ShortShipment` / `JudgeCut` in progress.

## 3. The wrong account — "We tried to pay the wrong account"

- **Engineering finding:** the recorded refusal was `grant_invalid` (no grant), and the README presented it as the destination allowlist.
- **Change implemented:** the two layers are now tested and described separately; the Nov 5 testnet probe shows `policy_destination_denied` with a grant that then paid Haoyun.
- **Evidence:** [ENFORCEMENT-MATRIX.md](../docs/hackathon/ENFORCEMENT-MATRIX.md) cases 1, 2, 8.
- **Hook:** "Our AI's backend tried to pay the wrong account. Two different locks said no."
- **Visual proof:** proof rows for both refusals; the successful 34.20 payout from the same grant (Base Sepolia `0x34da8955…`). No fake error screens: the 403 has no tx and is shown as a recorded response.
- **Status:** script ready.

## 4. Paying the same invoice twice — "We tried to make the agent pay twice"

- **Engineering finding:** a lost answer followed by a retry could pay again.
- **Change implemented:** the order account's on-chain balance must match the record before any release (`state_mismatch`).
- **Evidence:** [escrow.test.ts](../tests/near/escrow.test.ts) "failure injection"; matrix cases 7, 12, 15.
- **Hook:** "The network timed out. Did we pay? Here's why the agent won't guess."
- **Status:** script ready (test capture only).

## 5. The TEE release gate — "This payment could only be released by approved code"

- **Evidence:** enroll and gate-call txs on NEAR testnet (`D7u85U3b…`, `3fQzuEro…`, `9d8vrp3x…`), wasm sha256 in the worker README, signed result checked by the server.
- **Must say:** a TEE proves the code ran on the input; it does not prove the motors arrived. A compromised backend could still overpay the allowlisted supplier up to the total (pinned by test).
- **Status:** script ready.

## 6. The trust boundary — "Does confidential AI mean you can trust its decisions?"

- **Evidence:** [TRUST-MODEL.md](../docs/hackathon/TRUST-MODEL.md).
- **Story:** private inference keeps documents private; policy limits where money can go; evidence is still only as good as its source.
- **Status:** idea → script ready.

## 7. How do you prove a shipment to an AI? (evidence received ≠ fact established)

- **Status:** idea. Blocked on the signed dock-count attestation (backlog P1). Do not publish as a feature until built and tested.

## 8. Don't trust our demo — check the transaction

- **Evidence:** `npm run verify:proofs`, explorer links in PAYMENT-PROOFS.md.
- **Status:** capture ready.

---

## Publishing order (by verified milestone, not by calendar)

1. Reply to the Nov 10 submission post with the updated short (#2) once the branch is pushed. 2. #1 terminal version. 3. #3. 4. #8 as a thread. Later: #5, #6. #7 only after the attestation ships.

## Posting package: #2 (ready to paste after review)

- **Title:** We ordered 50 motors. Only 44 arrived.
- **Hooks:** "We ordered 50 motors. Only 44 arrived." / "Our AI bought $63,000 of parts. The supplier got paid for exactly what showed up." / "Pay for what arrives, not for what was promised."
- **X:** We ordered 50 motors. 44 arrived. Our procurement agent paid the supplier for 44 and the buyer kept $7,560, with every payment checkable on testnet. Built at NEAR HACKATHON @NEARProtocol #NEARHackathon (testnet at 1:1,000; shipment signals simulated)
- **Instagram:** An AI agent negotiated a $63,000 order. Only 44 of 50 motors arrived. The payment rules paid for 44 and returned the rest. Testnet demo, real transactions. #NEARHackathon #AIagents #procurement
- **TikTok:** 50 ordered. 44 arrived. Who pays for the missing 6? #NEARHackathon #AI #supplychain
- **First comment:** The receipts: docs/hackathon/PAYMENT-PROOFS.md in the repo, or run `npm run verify:proofs`.
- **Technical references:** NEAR Intents Agent API (Tidepool community testnet), OutLayer TEE release gate, Base Sepolia.
- Posting is outward: Luca publishes.
