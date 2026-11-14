# Competitive analysis: escrow, procurement and agent-payment entries

Researched 2026-11-13/14 from primary sources only:
- the official directory data (`GET https://nearhackathon.com/api/projects`, 1,200 entries, scraped copy `all.json`);
- each team's demo post (read through the public fxtwitter mirror);
- each team's public repo, cloned read-only;
- read-only NEAR RPC queries (`rpc.testnet.fastnear.com`, `rpc.mainnet.fastnear.com` and their archival endpoints): `view_account`, `view_access_key_list`, `call_function` views, `tx`.

No code from these repos was copied into Evernear. Nothing was posted, starred, forked or signed, and no transaction was sent.

**Confidence labels used throughout**

| Label | Meaning |
|---|---|
| **code** | Confirmed in their source, with a file and line cited. |
| **chain** | Confirmed by an RPC read made for this document: account keys, view state or transaction status, signer and method. |
| **claimed** | Their README or post says it, and it was not checked or does not match. |
| **not found** | Searched for and not located. |

"Source in repo" never means "deployed". **No deployed WASM was rebuilt and hash-matched by us.** The exceptions are:
- the Clear to Pay factory artifact, which we hash-matched;
- VeilProcure, where we matched the code hash to the one its README publishes, but did not rebuild it.

**"Confirmed submission"** means the entry is in the official directory data. Its directory `id` is cited because several names collide: two Accords, two Provens, three Vetos and three Wardens.

---

## 1. Inkwell (the reference competitor)

| | |
|---|---|
| Directory | **Confirmed submission.** `id 98bfa3a0-3e4d-4f02-b8c6-839c4707ce86`, tracks `privacy, business, swarms, security, agents` (not `realworld`) |
| Post | [x.com/clareonchain/status/2121138990640214371](https://x.com/clareonchain/status/2121138990640214371), Nov 13; video, 125 likes, 2,608 views |
| App | https://inkwell-virid-two.vercel.app (also https://clare-dev.github.io/INKWELL/) |
| Repo | [github.com/Clare-dev/INKWELL](https://github.com/Clare-dev/INKWELL), MIT, created 2026-11-07, last push 2026-11-12. Found through the `REPO` constant in the app's `order.html`; GitHub search by name does not surface it |
| Contract | `escrow.inkwell.testnet` (testnet), near-sdk-js, source [`contract/escrow.js`](https://github.com/Clare-dev/INKWELL/blob/main/contract/escrow.js), 27 lines |

### What it actually is

The pitch is "an AI content studio, pay into escrow, released on delivery or refunded on failure."

What runs: a GitHub Action runs a Node script that writes a short thread with a NEAR AI Cloud model. Around that, it moves testnet NEAR through a 27-line escrow contract:
1. deposit;
2. three "agent" payouts to sub-accounts;
3. a 70/30 profit split.

The customer, the agents, the treasury and the contributors are all sub-accounts of `inkwell.testnet`, set up by the same script.

**Order flow** (code: `relay/worker.js`, `.github/workflows/order-web.yml`, `scripts/run-web-order.js`, `src/studio.js`):
1. The browser calls a Cloudflare Worker, which dispatches a GitHub workflow.
2. The workflow loads `INKWELL_KEYS_JSON`, the **manager and customer keys together**, from GitHub secrets.
3. It runs `runOrder`.
4. It posts the ledger back to the Worker's KV and commits a redacted ledger to `orders/`.

### Answers

**What is autonomous**
- The scripted manager runs the "auction". Bids are random numbers from `run-web-order.js:16-18`, which the README admits: "bidders' prices (scripted)".
- It pays three sub-accounts and splits the remainder.
- The "research/writer/fact-check agents" do no work. One model call (`src/ai.js` `draft`) writes the text, and the agent accounts are only payees.
- **Confidence: code.**

**Where funds are held**
- In the contract account `escrow.inkwell.testnet`, keyed by order id (`escrow.js:7-10`).
- **Confidence: chain.** `get_order("order-1")` and `get_order("web-fefcb20c5768")` return `payer: customer.inkwell.testnet`, with `released == amount`.

**Who can release**
- `release` can be called only by `manager.inkwell.testnet` (`escrow.js:11-12`).
- The manager account's only key is a FunctionCall key for receiver `escrow.inkwell.testnet`, method `release` (setup in `scripts/setup.js:29-31`).
- **Confidence: code + chain** (`view_access_key_list`).

**Who can refund**
- `refund` can be called only by the order's `payer`, at any time, and it returns whatever is unreleased (`escrow.js:20-25`).
- The payer is `customer.inkwell.testnet`, a **studio-owned account**. Its key sits in the same GitHub secret as the manager key (`chain.js:10-14`).
- The README says: "In this test version the studio funds orders from that wallet… Payment is not yet checked per order."
- So the post's "you can get a refund" means the studio's own wallet refunds itself. A visitor never deposits or receives anything.
- **Confidence: code + chain.** Refund tx [`HcTJMv9R…`](https://testnet.nearblocks.io/txns/HcTJMv9RLMNdfrs8mMFDsnaRFoe9UTRxKVXrfyXR5Ka): signer `customer.inkwell.testnet`, method `refund`, success.

**Release conditions**
- On chain:
  - the caller is the manager;
  - the order exists;
  - `amount <= cap` (0.25 NEAR, fixed at init);
  - cumulative `released <= deposit`.
- **No delivery condition and no payee restriction.** `payee` is any account passed as an argument (`escrow.js:11-18`).
- **Confidence: code.**

**What prevents unauthorized withdrawal**
- The manager key can call only `release`, and only up to each order's own deposit.
- **It can pay any payee, including itself or an outside account, up to the full deposit of every open order.** The allowlist (`*.inkwell.testnet`), the blocklist, the per-task cap of 15 and the daily cap of 40 are enforced only in `src/studio.js:11-33`, an off-chain script.
- The on-chain cap of 0.25 NEAR is above every order: the price range is 30-60 units at 0.001 NEAR, so 0.03-0.06 NEAR.
- **The escrow account still has a FullAccess key** (`ed25519:AhkQmeVp…`). Whoever holds it can redeploy the contract and take the roughly 7 testnet NEAR on the account.
- `setup.js` generates that key in memory and never writes it to `.keys.json`, so it *may* have been discarded. This cannot be shown either way.
- **Confidence: code + chain.**

**How delivery is established**
- "Delivered" is a log line written when `draft()` returns non-null text (`studio.js:49-61`). No buyer acceptance, no hash, no on-chain record.
- Payouts happen once a draft exists. The "delivered" row is logged after the payouts.
- **The recorded proof run of Nov 8 delivered the offline stub** (`testnet-proof.json`: `"preview": "Thread draft (offline): …"`). That is the text `draft()` returns when no model key is set.
- **Confidence: code.**

**Partial fulfillment and milestones**
- No partial fulfillment.
- No milestones. There are three sub-payouts per order, but none is conditional on a stage.
- **Confidence: code.**

**Can terms change after authorization**
- There are no terms on chain beyond the deposit amount. Payees and amounts are chosen at release time by the manager.
- **Confidence: code.**

**On-chain policy enforcement**
- The manager-only check, the per-payout cap and the not-above-deposit check (contract).
- The method restriction (FunctionCall key).
- Everything else is off-chain.
- **Confidence: code.**

**Owner override**
- The `customer` account can refund at any time.
- The holder of the escrow's full-access key can redeploy.
- `killSwitch` exists in `config.json` and the off-chain script only.
- **Confidence: code + chain.**

**Agent misbehaviour**
- A compromised manager key, or the GitHub secret, can drain every unreleased deposit to any account in chunks of up to 0.25 NEAR.
- Their attack demo shows only:
  - a refusal of a 99-unit release, which is over the cap at the Nov 8 unit size and, per their README note, now refused only because it exceeds the escrow;
  - a refusal of `refund` by the FunctionCall key.
- The two `chain_rejected` rows in `testnet-proof.json` **carry no tx hash**. Failed function calls do land on chain, but the proof file does not link them.
- The blocklist and over-cap "blocked" rows are off-chain refusals.
- **Confidence: code.**

**Wrong delivery and disputes**
- Not handled. There is no dispute path, no arbiter and no deadline.
- **Confidence: code.**

**Demonstrated on testnet**
- The Nov 8 recorded run, deposit [`97mwUnqF…`](https://testnet.nearblocks.io/txns/97mwUnqFxJLDThjizDnbpk2U9JxGoPZDYwoYjoM9Yjxy), then:
  - payouts `3jg7HixN…`, `6w54vNSn…`, `42VDYbpx…`;
  - splits `4qVCLurY…`, `2CoZvp6h…`.
- 28 committed web orders under `orders/`, for example `web-fefcb20c5768`:
  - deposit [`7oFELf2t…`](https://testnet.nearblocks.io/txns/7oFELf2trD1E71AqMov1qVqVHRth8AKUodbUg23YsCV3), signer `customer.inkwell.testnet`, method `create_order`, success;
  - payout [`GvMsoUfw…`](https://testnet.nearblocks.io/txns/GvMsoUfwAMqYjXMj6Aq4xwxMXrmkLWio1EJgcDfkfN3Y), signer `manager.inkwell.testnet`, method `release`, success.
- At least three on-chain `refund` calls by `customer.inkwell.testnet`.
- **Confidence: chain** for the transactions named here.

**Mocked, per their own README and FAQ**
- The payment token: "pay with USDC@base" is a label, and NEAR Intents is not used.
- Bidder prices.
- The "Run the studio" browser console.
- Customer payment: the studio funds every order.
- Full attestation verification. They check that the nonce is echoed and that `intel_quote` is present (`ai.js:64-67`), not the quote's signature.
- No mainnet.

**Why NEAR is necessary (their claim)**
- "The contract holds the money, not me", plus function-call keys.
- In practice the FunctionCall key restriction is the only NEAR-specific guarantee that does real work.

### Bottom line on Inkwell

The architecture is **contract custody with a method-scoped hot key**. It is simple, it is on-chain and it is easy for a judge to verify in the explorer. That is a real advantage.

The economics do not match the pitch:
- The money is the operator's on both sides.
- Release is not conditioned on delivery.
- The refund belongs to the operator.
- The agent's spending rules beyond "not above the deposit" are off-chain.

**Its strengths are presentation and reach:** a hosted live order, about a one-minute loop and 2.6k views. **Its weaknesses are exactly the dimensions EverNEAR is built on:** approval-bound terms, staged settlement, partial fulfilment and independently constrained execution.

---

## 2. Other confirmed entries (procurement, escrow, agent payment)

Entries are in order of overlap with Evernear. Clear to Pay, Day One, Veto, Proven and Fulfil were audited by parallel read-only passes; rows marked chain were RPC-checked.

### 2.1 Accord ([@pelz0x](https://x.com/pelz0x/status/2121333372161261909)): the closest match, and it is on mainnet

| | |
|---|---|
| Directory | **Confirmed submission.** `id 7de962f6-5940-4e2a-a85e-961c03320349`, tracks `business, security, realworld`. A different "Accord" (`id f63cc81d…`, @quant_compute) is unrelated |
| Repo | [github.com/Pelz01/accord](https://github.com/Pelz01/accord): Rust vault in `contracts/vault/src/`, React/Fastify app, VPS worker. Linked from the third post of the thread. `docs/hackathon/COMPETITION.md` said "repo not found"; **that is now wrong** |
| App | https://accord-payments.vercel.app (mainnet by default) |

- **Model: on-chain per-order vault on NEAR mainnet holding native USDC** (chain).
  - The vault is the implicit account `10f816f5…80bf`, code hash `DqUgbgpB…`.
  - `get_order("PO-7886D7BD")` returns ordered 2, accepted 1, paid 1, pending 0, funded 20000 (0.02 USDC), unit price 10000.
- **Autonomy:** an off-chain worker discovers eligible payments and calls `request_payment`. Its mainnet operator account `eb9d09da…250c` has a FunctionCall key limited to `request_payment` on the vault (chain).
  - AI (NEAR AI Cloud) only extracts invoice fields for supplier review (README).
  - There is no negotiation or sourcing agent.
- **Release conditions** (code, `lib.rs` `request_payment` around lines 304-410):
  - the caller is `terms.operator`;
  - a **supplier-confirmed invoice** commitment exists (`invoices.rs:122`), binding network, vault, order, terms hash, document SHA-256, line, quantity, token and amount;
  - quantity ≤ `accepted − paid − pending`;
  - amount = quantity × the agreed `unit_price`;
  - the payee is fixed at `terms.payout`;
  - the request id is consumed once.
- **Delivery:** `confirm_delivery` by `terms.receiver`, the buyer or a delegated reviewer, with a strictly increasing cumulative quantity (code, `lib.rs:267-300`). It is self-reported by the buyer side, not attested.
- **Partial fulfilment: yes, pro-rata by accepted quantity** (code + chain). The mainnet order shows 1 of 2 cartons paid and the other 0.01 USDC returned on mutual close. Evidence file `fixtures/mainnet-settlement-evidence.json`; payment tx `F8tY6iegPD3VNi3sE5e2Dv4uA9dySPkv3ZwjjwCR9YAL`, signer the operator, method `request_payment`, success (chain).
- **Milestones:** incremental deliveries and payments against one order; no staged advance (code).
- **Terms after authorization:** fixed by the `terms_hash` that the supplier accepts. Funding must equal `unit_price × ordered` exactly. A changed invoice needs a fresh supplier confirmation (code, README).
- **Refunds and disputes:**
  - Unused funds return to the original buyer only, through **mutual** `propose_close`/`accept_close` by buyer and supplier (`recovery.rs:236-300`).
  - `expires_at` only gates acceptance and funding. In our read we found no unilateral deadline refund (code, by grep, not exhaustive).
  - There is no arbiter.
- **Owner override:** no admin sweep method in the contract (code; `SECURITY.md:39` claims the same). However:
  - **the vault account has a FullAccess key** (chain), and the team has upgraded contracts in place on testnet (README "upgrade retained orders");
  - **the operator account also keeps a FullAccess key** (chain).
- **On mainnet, every role was a controlled account** ("controlled demonstration with the owner's funds", `MAINNET_RELEASE.md:3`): the buyer is `mainnett12.near`, and the supplier and operator are implicit accounts funded by the owner.
- **NEAR Intents:** a 0.01 NEAR → USDC conversion via Intear (`nearblocks 6nSRXWEH…`), separate from order funding. Claimed with a tx link; we did not verify it.
- **Why NEAR:** contract custody, FunctionCall keys, NEP-141 USDC and NEP-413 sign-in.

**Threat to Evernear: highest in Real-World Money and Autonomous Business.**
- It opens with Evernear's own line: "pay only for what arrived".
- It does quantity-based partial settlement with **contract custody on mainnet with real USDC**.
- It lacks negotiation, a staged advance on shipping documents, TEE-bound release and two-approver commit.

### 2.2 Clear to Pay ([@joezzyweb3](https://x.com/joezzyweb3/status/2119220897345122339), [repo](https://github.com/joezzy-web3/clear-to-pay))

- **Directory:** confirmed. `id 2b198e26-7589-45a4-b6d9-0c838c248657`, tracks `privacy, business, agents, realworld`.
- **Model:** a buyer-funded pool in the testnet contract `guard.cleartopay.testnet`, holding Circle testnet USDC (chain).
  - It is a payment guardrail for the buyer, **not** an escrow that protects the supplier. The README says supplier escrow is future work.
- **Autonomy:** the agent's FunctionCall key on the buyer account allows only `submit_invoice` and `execute_payment` (chain).
  - The contract computes CLEARED, HELD or SEIZED deterministically (`src/inspection.rs:443-783`).
  - The AI reading, done off-chain in NEAR AI Cloud and OutLayer, is ignored by the contract (README line 253).
- **Release conditions** (code, `inspection.rs:524-713`, `payments.rs:524-592`):
  - the supplier's ed25519 signature over the invoice and document hash;
  - the payee equals a route registered at least 72h earlier;
  - no duplicate invoice, document or delivery note;
  - quantity and price ≤ delivered and ≤ remaining on the PO;
  - **N distinct delivery-signer roles signed on chain** (storekeeper and weighbridge keys);
  - per-invoice and per-period limits.
- **Partial fulfilment:** pays per delivered quantity, with several invoices per order (code). No locked total.
- **Override:** the owner can withdraw unreserved funds, change limits and delivery policy, and register signers and suppliers (code).
  - **The live guard keeps a FullAccess key** (chain).
  - Factory-made instances have **0 keys**, and the code hash matches the committed WASM; we computed it (chain).
- **Disputes and timeouts:** none for the supplier. Authorizations expire after 7 days (code).
- **Proof:**
  - [`23MoTFoV…`](https://testnet.nearblocks.io/txns/23MoTFoV): `submit_invoice` by the agent key → 7.8 USDC paid, Settled (chain).
  - `8HgbsoAv…` on the demo contract: Seized, `invalid_supplier_signature`, `payee_mismatch` (chain).
- **Mocked:** fictional companies.
  - Its Intents step runs on **Tidepool**, the same community sandbox Evernear uses.
  - The cross-chain payout is "route_needs_intents" off-contract.
  - The OutLayer reader is "experimental" (README).

**Threat:** high in AI Security and Real-World Money. Its delivery evidence is cryptographically signed and verified on chain, which is the step Evernear simulates.

### 2.3 Day One ([@CoderofVibes](https://x.com/CoderofVibes/status/2121303854788857875), [repo](https://github.com/CoderofVibes/day-one))

- **Directory:** confirmed. `id 80061107-323e-4c92-8e9f-20aac01ceb3d`, tracks `business, security, agents, realworld, open`.
- **Model:** per-PO escrow in `spend-policy-v2.acme-holdings.testnet`, settling in its own token DTUSD (chain). An older deployment uses Circle testnet USDC.
- **The v2 escrow account has 0 access keys:** the delete-key tx `dUyRgg9m…` succeeded (chain). It is therefore locked against redeploy, unlike Inkwell, Accord, VeilProcure, Lot Passport and the Clear to Pay guard.
- **Autonomy:** the agent "Kevin" submits POs within per-PO, monthly and category limits. A director's `approve_po` is needed above those limits and expires after 24h (code, `lib.rs:519-709`).
  - Above `signed_above`, a NEAR AI signature is checked with `ecrecover` on chain (code). The audit found the bound request hash is not checked, so the agent picks both the prompt and `po_hash`.
- **Release:** supplier `accept_po` → `mark_shipped` → receiver `confirm_receipt(qty)` → QC `qc_release`. Payee fixed at submission (code).
- **Partial fulfilment: pro-rata** (code + chain). Tx `7At9Ynuw…` paid 355 and returned 355 ("50000000 of 100000000 received").
- **Weaknesses:**
  - Staff receipt and QC run as meta-transactions through a server that **holds the staff keys**, and SMS is simulated (README lines 154-160).
  - The owner can reconfigure roles, agents and suppliers, so in practice can reroute money (code).
  - A known hole: quantity is not bound to the approved hash (their own test `tests/settlement.rs:332`).
  - No disputes and no deadlines.
- **Proof:**
  - `3bYd13vy…` refused over the limit (chain);
  - `3F2TYKZ1…` `qc_release` paid 5,150 DTUSD (chain).

**Threat:** high in Autonomous Business. It is the closest "AI purchasing agent plus on-chain per-PO escrow plus pro-rata" story, with a locked contract. The demo reached few viewers: 13 views.

### 2.4 VeilProcure ([@OlabanjiOlalek2](https://x.com/OlabanjiOlalek2/status/2121345911481680023), [repo](https://github.com/Olalekan2345/veilprocure))

- **Directory:** confirmed. `id a354e49a-a4f2-4a81-85c0-bdb03ff84eb1`, tracks `privacy, realworld`.
- **Model:** a human-driven sealed-bid RFQ with a single-award escrow in testnet contract `veilprocure-106725.testnet` (chain).
  - Code hash `3BnxCPhb…` equals the hash the README publishes for its WASM build; we did not rebuild it.
  - The account holds about 10 NEAR.
- **Autonomy:** none in payments. Every on-chain step is signed by a human wallet, and the server never holds keys (README).
  - The AI (NEAR AI Cloud, attested) writes an advisory evaluation note only.
- **Funds and release** (code, `contracts/veilprocure/core/src/lib.rs`, `docs/CONTRACT_INVARIANTS.md`):
  - The buyer funds the exact award amount.
  - The supplier accepts, then calls `submit_delivery(evidence_hash)` (self-reported).
  - The buyer calls `approve_release`, **or** the supplier calls `claim_after_review` after a review deadline.
  - Payee fixed to `award.supplier`; refund only to `rfq.buyer`.
- **Disputes:** yes. An optional reviewer, fixed at award and accepted by the supplier, can resolve with exactly two outcomes. Mutual-cancel refund. Failed-transfer retry (code). No timeout for an unresolved dispute (their own doc).
- **Override:** there is no admin method, but **the contract account keeps a FullAccess key**, which their invariants doc names as a residual risk (chain + doc).
- **Partial fulfilment:** none.
- **Milestones:** none (code).
- **Proof:** payout [`HY2vAtUm…`](https://testnet.nearblocks.io/txns/HY2vAtUmsp2Vft7BsxNTJMWBe8vNk2GcSTzXeQDs5Pc6), signer `vp-106725-test-buyer.testnet`, method `approve_release`, success (chain).
- NEAR Intents is not used (README).

**Threat:** moderate in Privacy and Real-World Money. It has the best-engineered escrow state machine in the field (supplier protection, dispute path, review-deadline self-claim), but no agent autonomy.

### 2.5 Lot Passport ([@navzuhdy](https://x.com/navzuhdy/status/2120244076327157910), [repo](https://github.com/nauvalzuhdy/lot-passport))

- **Directory:** confirmed. `id 73623146-ea42-4664-a0bf-3fea21c1dc82`, tracks `realworld, nfts`.
- **Model:** USDC locked per lot in testnet contract `nauval-lp-contract.testnet`.
- **Inspection:** the contract draws the cartons to inspect from the block seed (ISO 2859-1 AQL plan), and **only the agreed inspector account** can call `submit_inspection` (code).
- **Payout:**
  - pass pays 90% now, with 10% retention for 7 days; the retention is releasable by the buyer early or by **anyone** after 7 days;
  - fail is a full refund (README, code `lib.rs:499-575`).
- **Two-stage settlement on chain**, which Evernear does not have on chain.
- No AI agent. The inspector is a human key.
- **The contract account has a FullAccess key** (chain).
- **Proof:** `submit_inspection` tx `JAEjvvDU…` by `nauval-lp-v-trust.testnet`, success (chain).

**Threat:** low on reach (27 views), but a clean counter-example of trust-minimized staged release.

### 2.6 Veto, Proven, Fulfil

See section 2.7 below. These were audited by separate passes, and their results are appended there.

---

## 3. Comparison table

Columns separate **who enforces** the payout rules, **who can override**, and **whether a third party can verify the money movement from chain alone**. No entry here is trustless: every money contract we checked keeps a FullAccess key or an owner reconfiguration path (including the mainnet contracts of Veto `treasury.veto-mainnet.near`, Fulfil `nearfullfil.near` and Proven `proven-escrow.near`, chain), except Day One v2 and Clear to Pay factory instances (0 keys).

| Dimension | **Evernear** | Inkwell | Accord | Clear to Pay | Day One | VeilProcure | Lot Passport |
|---|---|---|---|---|---|---|---|
| Commercial autonomy | Sourcing against BOM, two negotiations in a price ceiling, PO draft (code; inference in NEAR AI TEE) | Scripted auction with random bids; one LLM call writes text | Worker auto-pays eligible invoices; AI extracts invoice fields | Agent submits invoices; contract decides | Agent buys within limits; sealed quotes | None (human wallets) | None |
| Approval-bound commitment | Two pinned ed25519 approvers over exact terms + rules hash, once (**off-chain**, backend-enforced) | None | Supplier accepts `terms_hash` on chain; exact funding | Owner registers order and limits | Director `approve_po` on chain above limits | Buyer awards and funds exact amount on chain | Buyer mints the lot on chain |
| Multi-stage settlement | Advance 30% on bill of lading and export clearance, balance on dock count (engine + gate) | No | Incremental per delivery | Per invoice | No | No | 90% / 10% retention **on chain** |
| Partial-fulfilment economics | Balance = received × unit − released; short shipment returns $7,560 (code; signals simulated) | No | **Pro-rata by accepted qty, on mainnet** | Per delivered qty | **Pro-rata, on chain** | No | Pass/fail of the whole lot |
| Independently constrained execution | Release gate in OutLayer TEE holds the only grant, wasm-bound; provider destination policy | FunctionCall key `release` only; payee unconstrained on chain | FunctionCall key `request_payment`; payee fixed in contract | FunctionCall key; payee route fixed and 72h aged | FunctionCall key; payee fixed | Human signatures | Human inspector key |
| Delivery evidence | **Simulated** carrier, customs and dock feed; signed dock-count path built, not checked by the deployed gate | Draft non-null (off-chain) | Buyer's own `confirm_delivery` + supplier-confirmed invoice hash | **Signed by N delivery keys, verified on chain** | Staff keys held by the server | Supplier evidence hash + buyer approval | Inspector counts; contract decides |
| Who enforces the payout rules | Evernear backend + OutLayer gate + **Tidepool server policy** | Contract (cap only) + off-chain script | Contract | Contract | Contract | Contract | Contract |
| Custody / override | Tidepool Agent API account; **Astro's owner key can change policy, unfreeze and withdraw; the demo backend holds that key** | Contract; studio refunds itself; escrow FullAccess key on chain | Contract; vault FullAccess key on chain (upgradable) | Owner pool; guard FullAccess key | **Contract, 0 keys** | Contract; FullAccess key | Contract; FullAccess key |
| Third-party verifiable on chain | Partial. 4 money legs have tx (2 NEAR testnet `mt_transfer`, 2 Base Sepolia); **12 of 22 proof rows are Tidepool intent ids with no tx** | Yes, all legs | Yes, mainnet | Yes, testnet | Yes, testnet | Yes, testnet | Yes, testnet |
| Network | NEAR testnet (via community Tidepool) + Base Sepolia + OutLayer testnet | NEAR testnet | **NEAR mainnet** (real USDC, cents) | NEAR testnet | NEAR testnet | NEAR testnet | NEAR testnet |
| Reproducibility | Replay by default; live needs keys and Tidepool quota (25 accounts per key) | Hosted live order in about 1 min, no setup | Hosted; read-only mainnet check command | Hosted console | Video + tx | Hosted, sign-in | curl RPC reads |

### Where a simpler contract escrow beats Evernear

1. **Custody is trust-minimized, Evernear's is not.**
   - A NEAR contract that fixes the payee and amount at funding and has no admin method gives the supplier a guarantee enforced by validators. A contract whose account has deleted its keys (Day One v2, Clear to Pay factory) also cannot be upgraded.
   - Evernear's order wallet is a policy on Tidepool's server that Astro's owner key can rewrite at any time. In this demo, Evernear's backend holds that key.
   - Evernear's own README: "The escrow is a commitment, not a lock."
2. **The supplier is protected in the contract designs and not in Evernear.**
   - VeilProcure: review-deadline self-claim and a dispute reviewer.
   - Accord: mutual close only.
   - Lot Passport: anyone can release the retention after 7 days.
   - In Evernear, Astro can reclaim the held part before arrival (`reclaimHeld`), and the deadline refund is a Convex scheduled job, not the chain.
3. **Verification is cheaper.** A judge can open every leg in one explorer. Evernear's open, grant, policy, revoke and freeze rows are provider responses with `transaction_hash: null`.
4. **Mainnet.** Accord shows real USDC partial settlement on mainnet. Evernear has no mainnet leg.

### Where Evernear is genuinely ahead

- **Staged trade-finance release.** It is the only entry found with an advance on shipping documents plus a balance on a count. Lot Passport's 90/10 split is the only other staged split, and it is on inspection, not shipping.
- **Two-approver, exact-terms commit with replay and revocation.** Day One has a single director, and Accord has supplier terms acceptance only.
- **Release executor bound to a TEE code hash that holds the only grant.** No other entry here routes the payout key through an enclave, though Proven and Fulfil use OutLayer as a verifier.
- **An agent that negotiates and sources.**

---

## 4. Guarantees Evernear must independently establish

Judges will put Evernear next to these entries and ask, for each claim, "enforced by whom, and can I check it without trusting you?" Each item below names the guarantee and the evidence a judge could check.

1. **Who can move the committed money, today.**
   - State plainly that Astro's owner key can change the order wallet's policy, unfreeze it and withdraw.
   - State that in the demo Evernear's backend holds that key.
   - State that the deadline refund is a Convex job.
   - Do not use "escrow" or "lock" without "policy-enforced by Tidepool, owner-overridable" next to it. Inkwell, Accord and Day One can all say "a contract holds it".
2. **"Pays only for what arrived."**
   - Show the balance stage refusing until a count signed by a pinned device key arrives.
   - Show the gate, not only the server, checking that signature.
   - Until then, say "pays on a reported count; the reporting is simulated".
   - Clear to Pay verifies delivery signatures on chain. Accord binds a supplier-confirmed invoice on chain.
3. **The approval gate.** It is off-chain code in Evernear's backend.
   - Show the live refusals (0 and 1 approval) with their recorded responses.
   - Name the guarantee's limit: a compromised backend skips it.
   - Day One's director approval and Accord's `terms_hash` acceptance are on chain.
4. **The release gate's binding.**
   - Publish the gate's wasm hash.
   - Give a reproducible build and the OutLayer tx in which it ran.
   - Explain why the server cannot pay: the live `grant_invalid` refusal.
   - Be explicit that v1 trusts the caller's `released_cents`, and say whether v2 has paid a real order yet.
5. **On-chain proof coverage.**
   - For each money leg give a tx a judge can open: commit `366nhBeJ…`, advance `0x5d8dab61…`, balance `0x0fcba050…`, reclaim `4rrfjsTZ…`.
   - Mark everything else as a provider response.
   - Competitors show every leg in an explorer.
6. **The partial-fulfilment arithmetic.**
   - Point to `engine/escrow.ts` and the 2,000-sequence invariant test.
   - Show that 18.90 + 36.54 + 7.56 = 63.00 reconciles from chain reads, as `PAYMENT-PROOFS.md` already does.
   - This is Evernear's strongest differentiator. Accord and Day One also do pro-rata, so the edge is the staged advance plus the pro-rata balance.
7. **Supplier-side guarantee.**
   - Either show what the supplier can rely on, or state that the held part is reclaimable by the buyer.
   - VeilProcure and Lot Passport give the supplier enforceable claims.
8. **Reproducibility without Evernear's keys.**
   - Give a no-key verification command, for example `scripts/verify-proofs.mjs`.
   - Give a hosted replay.
   - Inkwell lets anyone run a live order in a minute. Evernear's live path needs Tidepool quota and owner keys.

---

## 2.7 Veto, Proven, Fulfil

### Veto ([@sentinel_dapper](https://x.com/sentinel_dapper/status/2119799385798185178), [repo](https://github.com/0xdopewilly/veto)) — confirmed, `id 6930cfcc-eed7-405b-9ec1-3eba610d16b2`, tracks privacy, business, security, agents, realworld, open
- **Model:** USDC vault contract; agent can only `propose`; a NEAR AI Cloud model (Qwen3-VL) run by an off-chain "guardian" signs PASS/VETO; contract **recovers the signature on-chain with `ecrecover`** over a request it rebuilds itself and requires an approved signer (code: `contract/src/lib.rs:581-645`, `verdict.rs:51-70`). Model can only block; caps re-checked at execution. TEE attestation is checked off-chain only (owner approves the key, `lib.rs:860`).
- **Mainnet:** vault `treasury.veto-mainnet.near` (chain), caps $25/payment, $50/week; `submit_verdict` PASS tx `41G7RkNd…` paid 2.02 USDC to a 1Click deposit; VETO tx `3gEJXNCe…` refused with NEW_PAYEE etc. (chain via audit pass). **Vault has a FullAccess key** (chain; not disclosed for mainnet in README). Owner can `withdraw_to_owner` immediately; cap raises and overrides are time-delayed (code).
- **Agent API (mainnet):** an Agent API account with owner policy ($0.10/tx, $2/day, allowlisted destinations), grant held by Veto's web server, which itself checks the verdict before calling — an off-chain gate (code `apps/web/lib/server/agentapi.ts`), amounts scaled 1:2000; **no tx hashes given, claimed only**. This is the same custody class as Evernear's order wallet, on the real mainnet host.
- Partial fulfilment / milestones / disputes: none (code). Expiry after screen deadline by anyone (code).
- **Threat: highest in AI Security** (on-chain verified AI veto, public 50/50 bench, mainnet).

### Proven ([@Stephenololade](https://x.com/Stephenololade/status/2121350647454847046), [repo](https://github.com/Ololadestephen/Proven)) — confirmed, `id dcb47e69-d7d5-4139-b4b7-b69eba402d55`, tracks swarms, security, agents (not business/realworld). A different "PROVEN" (`id dd0fea75…`, @cryptoAYA33, open) is unrelated.
- **Model:** mainnet job escrow `proven-escrow.near` and PR-bounty contract `proven-bounties.near` (native NEAR); verdict written only in a `#[private]` callback from `outlayer.near.request_execution` running a deterministic check WASM pinned by hash (code: `escrow/src/lib.rs:890-931, 1297-1350`). Release/refund/expire callable by anyone but only per job state, to recorded worker/buyer (code). No owner method moves funds; but **FullAccess (upgrade) keys on all three money contracts** (chain; disclosed). TDX quote not verified on-chain (README). Payouts to keyless NEP-616 vaults (chain).
- **Mainnet proof:** `GDD4uBwF…` `check_merge` → OutLayer run 3001 → 0.06 NEAR paid; job 6 Released after runs 3004/3005; `6bYMFE5W…` refund (chain via audit pass). Owner operated both sides (README).
- Partial fulfilment / milestones / disputes: none (README states no dispute process).
- **Threat:** high in AI Security / Agent Economy as the cleanest "verifier decides, contract pays, anyone can trigger" design; not entered in business or realworld.

### Fulfil ([@cuongdc_real](https://x.com/cuongdc_real/status/2121286811813298337)) — confirmed, `id b5627a66-ca4a-4c6e-a81a-ac3e71a4255a`, tracks defi, business, security, agents, realworld, open
- **Repo:** the thread links `github.com/cuongdcdev/fullfil`; it returns **404** to `gh api` today (private or deleted). Audit used deployed WASM (`view_code`, exports/strings), view calls and tx status only; no file/line citations possible.
- **Model:** mainnet contract `nearfullfil.near`; buyer USDC held as NEP-245 balance on `intents.near` owned by `nearfullfil.near` (chain). Gasless buyer intent → `on_auth` → `outlayer.near.request_execution` → `on_verify_result` → `mt_transfer` to the filler (chain, e.g. `14CV7M5a…`, `9duGzaUh…`). Release trusts OutLayer's callback; WASM imports only `sha256` (no signature check); verifier `version_key: null`, i.e. **not pinned** despite docs (chain). In-person orders release on buyer QR-secret hash.
- **Override:** **FullAccess key on `nearfullfil.near`** (chain), used to redeploy 6 times and change kinds/config; owner is also the arbiter (`resolve_dispute`, used on mainnet `4CJPtWdB…`). Deadline refund via `expire` (buyer-signed in the shown case, `Gw8N2NEk…`). About $15 settled, single test buyer.
- Partial fulfilment / milestones: not found.
- **Threat:** high in Real-World Money / Autonomous Business on story and mainnet NEAR Intents use; weak on custody (operator-upgradeable, unpinned verifier).

### Not audited
Supply (@moltycarlo, `id 01d2b5be…`) was cloned but not audited; see `COMPETITION.md` for its claimed design (1Click / Confidential Intents on mainnet, human approval per PO).
