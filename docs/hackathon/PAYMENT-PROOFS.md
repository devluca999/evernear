# Payment proofs: PO 1042

This page lists every step of the recorded live run for PO 1042 and says, for each one, what was checked on a public chain and what could not be. The machine-readable version is [`payment-proofs.json`](payment-proofs.json), written by [`scripts/verify-proofs.mjs`](../../scripts/verify-proofs.mjs) from [`fixtures/recorded/live-run.json`](../../fixtures/recorded/live-run.json). Last checked 2026-11-14T03:07Z.

## The deal

Astro orders 50 motors from Haoyun Precision at $1,260 each: $63,000 committed. A 30% advance ($18,900) is paid at bill of lading and export clearance. 44 motors arrive, so the balance is 44 x $1,260 - $18,900 = $36,540. The 6 missing motors ($7,560) go back to Astro.

Everything runs on testnet at a scale of 1:1,000, in a 6-decimal test USDC: $63,000 becomes 63.000000 test USDC (raw 63000000). No production funds were used anywhere.

## Where each part runs

- **Escrow account, grants, policies:** Tidepool, a community-run testnet of the NEAR Intents Agent API. It is not NEAR infrastructure and is not affiliated with NEAR. It runs the Intents verifier contract `verifier.tidepool-sandbox.testnet` on NEAR testnet.
- **Commit, swap, reclaim and the NEAR side of each payout:** NEAR testnet transactions on that verifier, signed by Tidepool's relayer `maker.tidepool-sandbox.testnet`.
- **Payouts to Haoyun:** Base Sepolia (chain 84532), token `0x38d81431b9f76d9699af7517040d5221d9dea252` (USDC, 6 decimals, Tidepool's bridged test token).
- **Release gate:** an OutLayer testnet WASM worker, called with `request_execution` on `outlayer.testnet`, signed by `evernear-luca.testnet`.

Account ids used below: Astro treasury `1e8dd17b…2df3`, PO 1042 escrow account `a93551f5…455a` (Tidepool agent `agent_9ab195d10797557d177ca925`), Haoyun `0x2003975a521c6fa45238dbc402c9e4adcb8863e0` (from [`seed/astro.ts`](../../seed/astro.ts)).

## Evidence classes

| Class | Meaning |
|---|---|
| real-testnet-verified | The tx hash was read from a public RPC; status, parties and amount match the record. |
| real-testnet-unverifiable | A real step, but no hash to check, or the check failed. |
| provider-intent-id | A Tidepool `intent_…` id. Tidepool returned `transaction_hash: null`; there is nothing on a chain to look up. We rely on Tidepool's response. |
| refusal-no-tx | A refusal. A refusal produces no transaction. |
| simulated-offchain-signal | Carrier, customs or dock events from the simulated feed. Not on any chain. |

## Lifecycle

Commercial amounts are in USD; testnet units are the 6-decimal test USDC that actually moved (raw in brackets).

| # | Step | Business meaning | Commercial | Testnet units | Network | Sender | Recipient | Tx id | Verification | Source | Class |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Open account | PO 1042 escrow account created with policy: pay only Haoyun or Astro, at most $63.00 per tx | $63,000 cap | 63.000000 cap | Tidepool | Astro owner key | `agent_9ab195d1…` | `intent_d928c19645dd2164be722dab` | None possible: `transaction_hash: null`. Tidepool reported SUCCESS, policy revision 1 | `convex/near/escrow.ts#open` | provider-intent-id |
| 2 | Enroll | Release gate enrolled; grant token derived in the OutLayer enclave, only its hash left | – | – | NEAR testnet (OutLayer) | `evernear-luca.testnet` | `outlayer.testnet` | [`D7u85U3b…aZsqxjT`](https://testnet.nearblocks.io/txns/D7u85U3bUT8qy9JKMdoVnzTC992wp5qUE8j7aAZsqxjT) | NEAR archival RPC `tx`: SUCCESS, FINAL, `request_execution`, no receipt failures | `convex/near/escrow.ts#enroll` | real-testnet-verified |
| 3 | Grant | Payout grant issued to the release gate only | – | – | Tidepool | Astro owner (`e6c1d43a…616b`) | `agent_9ab195d1…` | `intent_5cc0c0de1957ba19dbe2aca6` | None possible (grant `grant_f2033585…`) | `convex/near/escrow.ts#grant` | provider-intent-id |
| 4 | Swap | Treasury funding: NEAR-side test USDC into Base-bridged test USDC | – | 63.005921 in, 62.999620 out | NEAR testnet | `maker.tidepool-sandbox.testnet` | `verifier.tidepool-sandbox.testnet` | [`8JLEFyqq…VfHRaf`](https://testnet.nearblocks.io/txns/8JLEFyqqrgoPuWx3VxUYWeMVBfFxu6sQFP4mGgVfHRaf) | NEAR archival RPC: SUCCESS; `token_diff` treasury -63.005921 NEAR USDC / +62.999620 Base USDC | `convex/near/escrow.ts#fund` | real-testnet-verified |
| 5 | Commit | $63,000 moved from Astro's treasury into the PO 1042 account | $63,000.00 | 63.000000 (63000000) | NEAR testnet | treasury `1e8dd17b…2df3` | PO account `a93551f5…455a` | [`366nhBeJ…62ynC1`](https://testnet.nearblocks.io/txns/366nhBeJvx6Ch7kpx2ZR8ZchQvBDrxVhtPFe8J62ynC1) | NEAR archival RPC: SUCCESS; `mt_transfer` and dip4 `transfer` 63000000, treasury to PO account | `convex/near/escrow.ts#lock` | real-testnet-verified |
| 6–7 | Signals | Bill of lading, export cleared | – | – | offchain | simulated feed | – | `sim-bol`, `sim-export` | None (simulated) | `scenarios/tracking.ts#signal` | simulated-offchain-signal |
| 8 | Advance | 30% advance to Haoyun, sent by the release gate | $18,900.00 | 18.900000 (18900000) | Base Sepolia | `0x2e6ad9e6…dad2` (Tidepool contract; tx signer `0x55f2c804…0e93`) | Haoyun `0x2003975a…63e0` | [`0x5d8dab61…5973b`](https://sepolia.basescan.org/tx/0x5d8dab61c8c5cffd8339041ec581d8b23faffc3fc1f291a914e170511935973b) | Base Sepolia RPC: status 1, block 55463052, ERC-20 Transfer 18.900000 of `0x38d8…a252` to Haoyun. NEAR leg [`6qWRaBGA…nDr`](https://testnet.nearblocks.io/txns/6qWRaBGAHNsk5N85HFxAoQHqPt7ok1rtpTza3fqj6nDr): `ft_withdraw` 18900000 from the PO account, memo `WITHDRAW_TO:0x2003…63e0`, SUCCESS. Gate call [`3fQzuEro…6XLV`](https://testnet.nearblocks.io/txns/3fQzuEroAQyrmeMhBbpirQ97JH7ML2DCNVmMxX7T6XLV): `request_execution` SUCCESS | `convex/near/escrow.ts#release` | real-testnet-verified |
| 9–10 | Signals | Import cleared, dock count 44 | – | – | offchain | simulated feed | – | `sim-import`, `dock-1042` | None (simulated) | `scenarios/tracking.ts#signal` | simulated-offchain-signal |
| 11 | Refused, in code | Balance to `0x…dead` refused by Evernear's own rule before any call | $36,540.00 attempted | 0 moved | none | – | `0x…dead` | `none` | No tx. Recorded reason `address_not_allowed` | `engine/escrow.ts` via `convex/near/escrow.ts#release` | refusal-no-tx |
| 12 | Refused, at Tidepool | Withdraw to `0x…dead` sent from Evernear's server, which holds no grant | $36,540.00 attempted | 0 moved | Tidepool, HTTP 403 | Evernear's server, no grant | `0x…dead` | `none` | No tx. Recorded 403 `grant_invalid`, layer `grant` | `convex/near/escrow.ts#policyRefusal` | refusal-no-tx |
| 13–14 | Signals | Import cleared, dock count 44 (re-sent for the balance stage) | – | – | offchain | simulated feed | – | `sim-import`, `dock-1042` | None (simulated) | `scenarios/tracking.ts#signal` | simulated-offchain-signal |
| 15 | Balance | Balance for 44 delivered motors, sent by the release gate | $36,540.00 | 36.540000 (36540000) | Base Sepolia | `0x2e6ad9e6…dad2` (tx signer `0x55f2c804…0e93`) | Haoyun `0x2003975a…63e0` | [`0x0fcba050…6045`](https://sepolia.basescan.org/tx/0x0fcba0506d7873c2fa9065d74309f703d349df3beb37c299c63a8e8536cd6045) | Base Sepolia RPC: status 1, block 55463183, ERC-20 Transfer 36.540000 to Haoyun. NEAR leg [`GJotyDGt…CWis`](https://testnet.nearblocks.io/txns/GJotyDGtSZbTBpyKTKREXgYLJ7u5H2BkDHmVf5zfCWis): `ft_withdraw` 36540000 from the PO account, SUCCESS. Gate call [`9d8vrp3x…AHTm`](https://testnet.nearblocks.io/txns/9d8vrp3xstjBjcbpMmoMtnhwT73v8nHj5Wyo8m12AHTm): `request_execution` SUCCESS | `convex/near/escrow.ts#release` | real-testnet-verified |
| 16 | Owner-only policy | Haoyun's destination removed; account may now pay only Astro | – | – | Tidepool | Astro owner | `agent_9ab195d1…` | `intent_47d74e68eaf99aceb75de7f7` | None possible; Tidepool reported policy revision 2 | `convex/near/escrow.ts#ownerOnly` | provider-intent-id |
| 17 | Owner-only grant | Grant to Evernear that can only return money to Astro | – | – | Tidepool | Astro owner | `agent_9ab195d1…` | `intent_9969e3f4e4c1899d9b7d1deb` | None possible (grant `grant_91f2f637…`) | `convex/near/escrow.ts#grant` | provider-intent-id |
| 18 | Reclaim | Held part (6 motors) returned to Astro | $7,560.00 | 7.560000 (7560000) | NEAR testnet | PO account `a93551f5…455a` | treasury `1e8dd17b…2df3` | [`4rrfjsTZ…dvEM`](https://testnet.nearblocks.io/txns/4rrfjsTZxqEf2dcrSVFVUYfqfKjZddS576jrZyuxvdEM) | NEAR archival RPC: SUCCESS; `mt_transfer` 7560000, PO account to treasury | `convex/near/escrow.ts#reclaim` | real-testnet-verified |
| 19 | Revoke | Owner-only grant `grant_91f2f637…` revoked | – | – | Tidepool | Astro owner | – | `intent_aa68177ff63ed3a023441c8d` | None possible | `convex/near/escrow.ts#close` | provider-intent-id |
| 20 | Revoke | Release gate grant `grant_f2033585…` revoked | – | – | Tidepool | Astro owner | – | `intent_54c0b4b4045161dc924bf508` | None possible | `convex/near/escrow.ts#close` | provider-intent-id |
| 21 | Freeze | Account frozen for good (policy revision 3) | – | – | Tidepool | Astro owner | – | `intent_20a10fdc0b02ebae8b5cd80a` | None possible | `convex/near/escrow.ts#close` | provider-intent-id |
| 22 | Close | Summary row: frozen, 2 grants revoked, balance 0, kept as receipt | – | 0 left | Tidepool | – | – | `intent_20a10fdc0b02ebae8b5cd80a` (same as 21) | None possible; the balance 0 is Tidepool's report | `convex/near/escrow.ts#close` | provider-intent-id |

Full hashes, block numbers, decoded logs and RPC endpoints for every row are in [`payment-proofs.json`](payment-proofs.json).

## Reconciliation

Amounts read from chain, not from the recording:

| Leg | Read from | Amount |
|---|---|---|
| Commit | NEAR testnet `mt_transfer`, tx `366nhBeJ…` | 63.000000 |
| Advance | Base Sepolia ERC-20 Transfer, tx `0x5d8dab61…` | 18.900000 |
| Balance | Base Sepolia ERC-20 Transfer, tx `0x0fcba050…` | 36.540000 |
| Reclaim | NEAR testnet `mt_transfer`, tx `4rrfjsTZ…` | 7.560000 |

18.900000 + 36.540000 + 7.560000 = 63.000000, equal to the commit. It reconciles exactly. In dollars: $18,900 + $36,540 + $7,560 = $63,000.

Two things that are true but easy to misread:

- The swap (row 4) produced 62.999620 Base USDC, 0.000380 less than the 63.000000 committed. The commit is drawn from the treasury balance, which held Base USDC left over from earlier runs, so the swap and the commit are not meant to match one-to-one. The swap is a funding step, not part of the PO money flow.
- The Base Sepolia transfers come from `0x2e6ad9e6…dad2`, a contract run by Tidepool, not from an account Astro or Evernear owns. The NEAR side shows the PO account burning exactly the same amount with the memo `WITHDRAW_TO:0x2003975a…63e0`. The link between that burn and the Base Sepolia send is made by Tidepool's relayer; the two chains do not prove it to each other.

## What this does and does not prove

It proves:

- Real testnet transactions exist for the commit, both payouts, the reclaim, the swap and the three OutLayer gate calls, and every one succeeded.
- The amounts and recipients on chain are the ones the record claims: 63.00 into the PO account, 18.90 and 36.54 to Haoyun's address on Base Sepolia, 7.56 back to Astro's treasury. The three outgoing amounts add up to the full 63.00 committed; that the account then held 0 is Tidepool's report (row 22), not something we read from chain.
- The payouts' NEAR legs were signed for the PO account (`a93551f5…455a`), and the release gate's `request_execution` calls on OutLayer testnet happened right before each payout.

It does not prove:

- **The wrong-address refusal in this run is a grant refusal, not an allowlist refusal.** Row 12 failed with `grant_invalid` at layer `grant` because Evernear's server held no grant on the account. That shows Evernear cannot pay on its own. It is not evidence that the destination allowlist refuses a withdraw sent with a valid grant. Row 11 is a refusal in Evernear's own code, also not a Tidepool policy check. The allowlist evidence is the separate Nov 5 probe below, and that refusal exists only in project notes.
- **Policy, grant, revoke and freeze steps** (`intent_…` rows) are Tidepool's word. Tidepool returned `transaction_hash: null` for them; no chain records them that we can query.
- **The release gate's decision.** The OutLayer txs prove the gate WASM was requested; they do not show its inputs or output on chain. The gate's signature and evidence hash are in the recorded response only.
- **The release signals are simulated.** Bill of lading, customs and dock count come from a simulated feed.
- **Tidepool is community-run.** It is a testnet of the NEAR Intents Agent API run by a third party, not by NEAR. Base Sepolia sends depend on its relayer.
- **No production funds.** All tokens are no-value testnet tokens (the NEAR-side token is labeled "Tidepool Testnet USDC on Base Sepolia (bridged, no value)").

## Nov 5 probe: the allowlist with a valid grant

A different, older scenario: $38,000 locked, $34,200 paid, $3,800 returned (scaled $38.00 / $34.20 / $3.80). It is not PO 1042. Source: [`docs/NOTES.md`](../NOTES.md) section 14, "Live probe of our PO path, Nov 5 2026". PO account `agent_fe8606f9c6dc60f3f1768ed9`, policy `destinations: only` [withdraw on Base to Haoyun, transfer to the treasury].

| Step | Business meaning | Commercial | Testnet units | Network | Tx id | Verification | Class |
|---|---|---|---|---|---|---|---|
| Swap | Treasury funding, 45 NEAR USDC into Base USDC | – | 45.000000 in, 44.995500 out | NEAR testnet | [`J8f6eQ9Q…rEDy`](https://testnet.nearblocks.io/txns/J8f6eQ9QqHu3KUdNNEfXtpPuzCKCXaJd4jbvxobyrEDy) | NEAR archival RPC: SUCCESS; `token_diff` matches the notes (44.9955) | real-testnet-verified |
| Lock | Treasury moves 38.00 into the PO account | $38,000.00 | 38.000000 | Tidepool / NEAR testnet | `DB11Cg1i…FarE` | This is an Intents intent hash, not a tx hash; the notes record no NEAR tx for the lock. Not checked | provider-intent-id |
| Refusal | Withdraw to `0x…dead` **with a valid grant**: 403 `policy_destination_denied`, layer `policy` | – | 0 moved | Tidepool, HTTP 403 | `none` | Recorded in project notes, no tx (synchronous 403); not independently verifiable | refusal-no-tx |
| Payout | Same grant, withdraw 34.20 to Haoyun | $34,200.00 | 34.200000 (34200000) | Base Sepolia | [`0x34da8955…206d7`](https://sepolia.basescan.org/tx/0x34da89551ea6036bc288b1726bbeb049a787a5f0adfd5079e7748f46cde206d7) | Base Sepolia RPC: status 1, block 54956069, ERC-20 Transfer 34.200000 of `0x38d8…a252` to Haoyun | real-testnet-verified |
| Payout, NEAR leg | `ft_withdraw` from the PO account (`81d22ef7…7216`) | $34,200.00 | 34.200000 | NEAR testnet | [`PjeJk6tL…HTu9B`](https://testnet.nearblocks.io/txns/PjeJk6tLYS7woEAykkYa1HgfPVruEhAHAbmsZQTHu9B) | NEAR archival RPC: SUCCESS; `ft_withdraw` 34200000, memo `WITHDRAW_TO:0x2003…63e0` | real-testnet-verified |
| Return | 3.80 back to the treasury | $3,800.00 | 3.800000 | Tidepool / NEAR testnet | not recorded | The notes record SUCCESS but no hash | real-testnet-unverifiable |

What it adds: the account's destination allowlist refused an off-list withdraw while the caller held a valid grant, and the same grant then paid the allowlisted supplier, which is on chain. The refusal itself is a synchronous HTTP 403 with no transaction, so it rests on the project notes, not on a chain. 34.20 + 3.80 = 38.00 is consistent with the notes, but only the 34.20 is verified on chain.

Omitted: `docs/MORNING.md` mentions a Nov 5 Convex run with Base Sepolia tx `0xa1ca4983cccd01c2f40f3565c453ebb44668…`. Only that truncated prefix exists in the repo and its git history, so it is not listed or verified.

## How to re-verify

```bash
node scripts/verify-proofs.mjs
```

Node 22 or later, no install, no keys. The script reads public endpoints only: `https://sepolia.base.org` (fallback `https://base-sepolia-rpc.publicnode.com`) for Base Sepolia; `https://rpc.testnet.near.org`, then the archival nodes `https://archival-rpc.testnet.near.org` and `https://archival-rpc.testnet.fastnear.com` for NEAR testnet (the regular node no longer keeps these transactions and answers `UNKNOWN_TRANSACTION`; the script records that and moves on); and `https://api-testnet.nearblocks.io` to find the signer of a NEAR tx when the record does not name it. Each request times out after 15 seconds; a failure is written into that row's `verification.details` and the run continues. It rewrites `docs/hackathon/payment-proofs.json`.
