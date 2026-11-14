# Trust model

What EverNEAR guarantees, who enforces each guarantee, and what it cannot guarantee.

```
             BUYER (Astro)                                         SUPPLIER (Haoyun)
   owner key · budget · rules · approvers                         Base Sepolia address
        |  signs policy           | approvers sign terms                 ^
        v                         v                                      |
 +---------------------+   +------------------------+                    |
 | Procurement agent   |   | Approval verifier      |                    |
 | (Evernear backend)  |-->| engine/approvals.ts    |                    |
 | search, compare,    |   | convex/approvals.ts    |                    |
 | negotiate, draft PO |   +-----------+------------+                    |
 +---+-------------+---+               | [B1] two pinned keys,           |
     |             |                   |      exact terms, once          |
     | [B0] reads  |                   v                                 |
     v documents   |        +------------------------+   [B3] policy:    |
 +----------------+|        | Order wallet           |   only Haoyun or  |
 | NEAR AI Cloud  ||        | NEAR Intents Agent API |   Astro, <= total |
 | private        ||        | on Tidepool (community |-------------------+
 | inference (TEE)||        | testnet), one per PO   |
 +----------------+|        +----+-------------+-----+
                   |             ^ [B4] grant  | transfer back
   evidence        v             |  held only  v
 +----------------------+   +----+--------+  +------------------+
 | Evidence providers   |-->| Release gate|  | Buyer treasury   |
 | carrier, customs,    |   | OutLayer TEE|  | (Astro)          |
 | dock count           |   | wasm-bound  |  +------------------+
 | (SIMULATED in demo)  |   +-------------+
 +----------------------+        [B5] evidence is presented, not proven
```

## Boundaries

| | Boundary | Enforced by | Kind | What it guarantees | What it does not |
|---|---|---|---|---|---|
| B0 | Agent reads documents | NEAR AI Cloud confidential models ([`inference.ts`](../../convex/near/inference.ts)) | provider TEE | The BOM and offers are read inside the provider's enclave; each read keeps the attestation signer and response hash | That the model read correctly; amounts never come from the model, they are computed by the engine |
| B1 | Approval to commit | [`engine/approvals.ts`](../../engine/approvals.ts), [`convex/approvals.ts`](../../convex/approvals.ts), re-checked in [`deadline.ts`](../../convex/near/deadline.ts) `lock` | **off-chain, code-enforced by Evernear's backend** | No live commit without two distinct pinned approvers' ed25519 signatures over the exact terms (supplier address, amount, quantity, PO version, rules hash), each spent once | Protection against a compromised backend or anyone holding the treasury grant: Tidepool testnet has no provider-side approvals |
| B2 | Release decision | [`engine/escrow.ts`](../../engine/escrow.ts) (server) and the gate's own copy | code-enforced | Advance only after bill of lading + export clearance; balance = received x unit - released; never above locked; exact integer cents | That the signals are true |
| B3 | Where money may go | Tidepool account policy `destinations: only` + per-transaction cap ([`escrow.ts`](../../convex/near/escrow.ts) `poPolicy`) | **provider-enforced** (Tidepool server, not the chain) | A valid grant still cannot pay anyone but Haoyun or Astro, or more than $63.00 at once (seen live Nov 5: `policy_destination_denied`) | Astro, as owner, can change the policy or unfreeze at any time: a commitment, not a lock |
| B4 | Who may release | Grant registered by Astro = hash of a token only the gate's wasm can derive (`bind: "wasm"`) ([worker README](../../worker/release-gate/README.md)) | TEE key binding + provider grant check | Evernear's server holds no grant that can pay Haoyun (live: its withdraw was refused `grant_invalid`); a different build derives a different token | That the caller told the gate the truth: `released_cents`, `advance_percent`, `to` and the evidence come from the backend. Worst case for a compromised backend: overpay Haoyun up to the $63.00 total, to the allowlisted address only |
| B5 | Evidence | none yet: simulated feed ([`scenarios/tracking.ts`](../../scenarios/tracking.ts)) | **simulated** | The gate commits to the evidence it decided on (`evidence_sha256` in its signed answer) | That 44 motors physically arrived. A TEE proves the code ran on the input; it does not establish facts about the world |
| B6 | Idempotency | Tidepool idempotency keys; balance reconcile before every release | provider + code | No second advance or balance while Tidepool keeps the key; no release while the record and the account disagree | Global idempotency inside the stateless gate |
| B7 | Deadline refund | Convex scheduled job | off-chain service | Held money returns to Astro at the deadline | That it runs if Evernear's backend is down; the chain does not enforce it |

## Evidence received is not a fact established

The release gate can show *which* evidence a payment was decided on and that the rules were applied to it exactly. It cannot show the evidence is true. Today the carrier, customs and dock-count signals are simulated and every proof row says so. The smallest real improvement is a signed dock-count attestation from a named receiving device whose public key Astro pins, checked by the gate; it is designed, not built (READINESS backlog).

## Trusted parties, in order of what they could do if dishonest

1. **Astro's owner key**: anything (change policy, unfreeze, withdraw). By design, it is the buyer's money.
2. **Evernear's backend** (Convex deployment, holds Astro's testnet owner key in this demo, the treasury grant, and the right to call the gate): could skip approvals and commit; could make the gate overpay Haoyun up to the order total. Cannot pay anyone outside the allowlist.
3. **Tidepool** (community-run testnet, not NEAR infrastructure): enforces grants, policy and idempotency on its server.
4. **OutLayer TEE**: keeps the gate's grant and signing key bound to the wasm hash.
5. **Evidence sources**: simulated.
