# Judge panel 2: adversarial review of EverNEAR

Reviewed 2026-11-14 (UTC), branch `hackathon/p0-hardening`. The tests ran at `38c2af5`/`e3d4ad3`. HEAD moved to `b8ebea7` during the review; that range changes only docs and two UI test timeouts. Eight judges, each told to break claims rather than trust the docs.

The panel did not read `.env.local` or `.approver-keys`, call mainnet, create Tidepool agents, sign anything, spend funds, commit or push.

The baseline is the first panel's revised scores ([JUDGE-REVIEW.md](JUDGE-REVIEW.md) "Revised scores"): Autonomous Business 6.5, Real-World Money 5.5, AI Security 6.5, Agent Economy 5.5.

## What we ran, and what came back

| Command | Result |
|---|---|
| `npm run attack` | **49 passed**, 3 files. About 6 of the 49 are positive-path checks, not refusals: approvals.test "two distinct pinned approvers… authorize", "an order that needs no approvals passes", "signs exactly the NEP-413 bytes", and matrix 14 "paid, exact amounts". |
| `npx vitest run --maxWorkers=4` | 472 passed, 2 failed, 4 skipped. Both failures were 5 s timeouts (`focus.test.tsx`, `frames.test.tsx`). Rerun alone: **7/7 passed**. Load was environmental. Net: 474 pass. Commit `1e691f3` has since raised those timeouts. |
| `npm run verify:proofs` | `verify passed: 10 legs verified, each gate result signed and matching its payout, money reconciles`. The file it rewrites was restored with `git checkout`. |
| `npm run reconcile` | commit 63000000, advance 18900000, balance 36540000, returned 7560000, all `ok`. The file it rewrites was restored with `git checkout`. |
| `cargo test` (worker/release-gate) | **35 passed**. |
| Our own RPC check of both gate probes | Both verified. See below. |
| Our own reproducible build of the gate | `cargo build --release --target wasm32-wasip2` at HEAD with rustc 1.99.1 gives sha256 **`e60577955c36…887c14`**. That is byte-identical to the v3 wasm named in tx `8S4uYwhT…`. |
| Our own exploit test on that same source | **Gate v3 overpays the balance.** See Judge 3. |

### On-chain probes, checked by us

We called `tx` on `https://archival-rpc.testnet.near.org` with sender `evernear-luca.testnet`. We decoded the `SuccessValue`, checked the ed25519 signature over `evernear-release-gate:v1:` + canonical JSON, and recomputed `evidence_sha256` = sha256(canonical(signals)). The script is in the reviewer's scratchpad (`probe.mjs`).

| Fixture | tx | Block time (UTC) | Signer → receiver | Wasm hash in tx args | Input = fixture | Output = fixture | Signature | Evidence hash |
|---|---|---|---|---|---|---|---|---|
| gate-v2-frozen-probe | `4qXdn52Z…2vH` | 2026-11-14 05:22:59 | evernear-luca.testnet → outlayer.testnet, `request_execution` | `dd90ce68…8955` | yes | yes, `account_frozen` | valid (key `96f3d04f…`) | matches |
| gate-v3-unsigned-dock-probe | `8S4uYwhT…Lqh1` | 2026-11-14 05:45:27 | same | `e6057795…7c14` | yes | yes, `dock_unsigned` | valid (key `815975ba…`) | matches |

The fixtures are honest. Their limits:
- Both are **refusals** on an already-closed wallet. Neither v2 nor v3 has ever paid.
- The v3 refusal fires before any Tidepool read, so `8S4uYwhT` does not show v3 reading the account.
- Neither probe is in `npm run verify:proofs`. Only `content/remotion/CAPTURE.md:66` says so.

---

## Judge 1: Autonomous Business ("meaningful commercial work, or a replayed scenario?")

**Most compelling capability.**
- The commercial outcome flows through one code path: `engine/order.ts` `buildPurchaseOrder`.
- That path produces the signed commit terms (`convex/approvalTerms.ts:24`), the server release rules and the gate amounts.
- `tests/orderPipeline.test.ts` checks that these agree for 1,000 random orders.
- The negotiation simulator is conditional: Haoyun takes +5% only if the counter stayed inside the ceiling (`tests/channels.test.ts`).

**Most serious weakness.** The business is one fixed order.
- PO 1042, one SKU and five seeded offers (`seed/astro.ts`); `convex/live.ts:5` says "the PO, Haoyun's address, the unit price and the dock count come from seed/astro.ts".
- Supplier evaluation is "Agent (deterministic fitment)" over fixed offers (`scenario/auditTrail.ts:55`), and supplier replies are a simulator.
- The live path cannot buy anything else: `liveTerms` only knows two scenarios (`convex/approvalTerms.ts:38`).
- The only paying run (Nov 6) is a replay that predates the approval check.
- So the agent's autonomy is a well-instrumented state machine around one scripted deal, not an agent doing open-ended commercial work.

**Adversarial test (ran).**
- `grep -n "PO.number\|HAOYUN\|PO.quantity" convex/live.ts`: every money step uses constants.
- `/audit` events 1–4 are labelled `simulated` or `computed by the engine`.
- Nothing in the money path takes an order from outside the seed.

**Improvement (about 2 h, no deploy for the code; deploying it is optional).** Accept a second seeded PO (a different supplier, quantity and price) through the same `buildPurchaseOrder → commitTerms → releaseStage` path, so `/audit` can show two orders. This proves the pipeline is general, not hand-fitted to 1042.

**Score.** Autonomous Business **6.5** (unchanged). Agent Economy **5.5** (unchanged).

## Judge 2: Real-World Money ("are payments tied to meaningful real-world conditions?")

**Most compelling capability.**
- Money legs are reconciled from chain reads: 18.90 + 36.54 + 7.56 = 63.00, re-verified today.
- The balance is quantity-priced: 44 × $1,260 − $18,900 advance.
- The *design* ties the balance to a signed dock count. v3 refuses an unsigned one on chain (`8S4uYwhT`, verified).

**Most serious weakness.** No payment that actually happened was conditioned on a real-world fact.
- The recorded advance and balance went through gate **v1**, on simulated `sim-bol`/`sim-export`/`sim-import` and an **unsigned constant 44** (`docs/hackathon/PAYMENT-PROOFS.md` rows 6–14; `scenario/auditTrail.ts:64`).
- In a live run the advance pays immediately after commit on the simulated feed (`convex/live.ts:124-126`).
- The pinned dock device's key was created by the operator's own tooling (`docs/hackathon/AFK.md:44`, "dock device key `.approver-keys/dock-3-scanner.key`").
- So "a dock count signed by a pinned device" is, today, the operator signing for the dock.

**Adversarial test (ran).**
- `grep -n "sim-\|dock-1042" docs/hackathon/payment-proofs.json`: every signal row is `simulated-offchain-signal`.
- `grep -n "receivedQty" convex/live.ts:167`: without `DOCK_DEVICE_KEYS`, the count is `PO.receivedQty`.

**Improvement (1–2 h, needs the hosted deployment but no gate redeploy).** Run the already-written `scripts/hosted-live-run.mts` with real approvers and a dock clerk who are different people on different machines. Record it and add its hashes to `verify-proofs.mjs`. This is the first payment ever made through v3 on a signed count. The AFK.md "Needs you" steps 1–5 already script this. It needs Luca and Jordan, and one Tidepool wallet.

**Score.** Real-World Money **5.5** (unchanged; the v3 probe is real but not a payment).

## Judge 3: AI Security & Defense ("can a compromised agent/backend cause an unauthorized payment? which layer stops what?")

**Most compelling capability.**
- Layer separation is documented case by case: ENFORCEMENT-MATRIX, 17 release cases plus 13 commit cases.
- The gate is reproducible: we rebuilt `e6057795…` from HEAD and it matches the hash OutLayer ran on chain. Few hackathon entries can show that.
- Its signed results verify, and the grant is wasm-bound.

**Most serious weakness (new finding).** Gate v3 does not bind the unit price or ordered quantity to anything.
- `decide()` checks only that `ordered_qty × unit_cents == locked_cents` (`worker/release-gate/src/lib.rs:173-176`).
- `check_against_chain` checks only `locked_cents`, `to` and `released_cents` (`lib.rs:515-530`).
- A compromised backend holding a **genuine** signed count of 44 can send `ordered_qty: 45, unit_cents: 140000`. Then 45 × 1,400 = 63,000 still equals the on-chain cap.
- The gate signs and sends a balance of **$42,700 instead of $36,540**: $6,160 of the $7,560 that should go back to Astro. It goes to the allowlisted supplier only.
- The signed result's `evidence_sha256` is identical in both cases. It hashes signals only, not terms, so an auditor reading the result cannot see the tampering.
- Reproduced with a scratch copy of the crate, test `judge_unit_price_not_bound_to_terms`: HONEST `amount_cents 3654000, held 756000`; TAMPERED `amount_cents 4270000, held 140000`, `ok: true`.
- No doc discloses this.

Second, by code reading: the signed dock message is `{at, count, device, po}` (`lib.rs:549`).
- It carries no wallet `agent_id`, and the gate has no clock (README:31 says so).
- Every live run uses PO "1042".
- So **any** earlier signed count for PO 1042, for example a count of 50, replays into a later wallet's balance at the gate.
- The server's `since` filter (`convex/dock.ts:34-42`) blocks this only while the backend is honest.

Context:
- The bigger hole remains the one already disclosed. The backend holds Astro's owner key, which can rewrite policy and pay anyone (TRUST-MODEL "Trusted parties" 2).
- And both "two people" are provisioned by one operator: Luca's NEAR account plus a Jordan key "made in `.approver-keys/Jordan.key`" (AFK.md:44). That contradicts AFK.md:28: "never by the server or me".

**Adversarial test (ran).** Append to a copy of `worker/release-gate/src/tests.rs`:

```rust
let mut input = case("balance at $1260");
input["ordered_qty"] = json!(45); input["unit_cents"] = json!(140000);
let out = run_case(&MockHost::accepting(), &input);
assert_eq!(out["ok"], true); assert_eq!(out["amount_cents"], json!(4270000)); // honest: 3654000
```

**Improvement.**
- **Without a deploy (30 min):** pin this bound as a test in `src/tests.rs` (it does not change the wasm), and disclose it in TRUST-MODEL B4, worker README:42 and ENFORCEMENT-MATRIX case 6.
- **The real fix (about 1 h of code, then a gate redeploy, re-enroll and Luca):**
  - pin `unit_cents`/`ordered_qty` per order by including the approvers' terms digest and two approver signatures in the gate input, verified in the enclave against pinned approver keys;
  - or have the owner write the unit price into the policy's memo;
  - and bind the dock message to `agent_id` with a nonce.
  - A new build means a new hash, so the reproducible-build match must be redone.

**Score.** AI Security **6.0** (down from 6.5). The gate is real and reproducible, but the "a compromised backend can no longer make the gate overpay" claim is false as written.

## Judge 4: NEAR engineer ("what is enforced by NEAR vs a backend vs a provider?")

**Most compelling capability.**
- An honest split, mostly kept: [TRUST-MODEL.md](TRUST-MODEL.md) labels B1 off-chain, B3 provider and B7 a Convex job.
- The OutLayer runs are real `request_execution` txs whose results we decoded and verified ourselves.
- The NEAR-side money legs (`366nhBeJ`, `4rrfjsTZ`, the `ft_withdraw` legs) are real verifier txs.

**Most serious weakness.** NEAR consensus enforces almost nothing about *this order*.
- The policy, grant, revoke and freeze rows are Tidepool intent ids with `transaction_hash: null`: 12 of 22 rows.
- The order wallet is a provider policy the owner key can rewrite.
- Approvals are backend code.
- The deadline refund is a Convex scheduler.
- The Base payouts are linked to the NEAR burn only by Tidepool's relayer (PAYMENT-PROOFS "easy to misread").
- NEAR's role is OutLayer compute (attested, but the TDX quote is not verified by anyone here) and the Intents verifier ledger, run by a community operator.

**Adversarial test (ran).** Run `node probe.mjs` on both fixtures:
- signer `evernear-luca.testnet`, receiver `outlayer.testnet`, method `request_execution`, wasm hash in the args;
- `SuccessValue` decodes to the fixture's output; signature valid.

Separately, `grep -c provider-intent-id docs/hackathon/payment-proofs.json`.

**Improvement (45 min, no deploy).**
- Add both probe txs to `scripts/verify-proofs.mjs`. Check the wasm hash in the tx args equals the fixture's, decode and verify the signed refusal, and recompute `evidence_sha256`.
- Add a `npm run verify:gate-build` that rebuilds the wasm and compares it to `e6057795…`.
- This turns "we say v3 is deployed and is this source" into a check any judge runs.

**Score.** AI Security **6.0** (same as Judge 3), Agent Economy **5.5**.

## Judge 5: Procurement expert ("is the 50/44 advance + balance + return math commercially coherent?")

**Most compelling capability.**
- The arithmetic is exact and conservative.
- The balance is `received × unit − released`, refused rather than rounded.
- The advance is exact or refused (`advance_not_exact`).
- 2,000-sequence invariants and 1,000-order agreement tests back this.
- A 30% advance on shipping documents with the balance on receipt is a recognisable trade-finance shape.

**Most serious weakness: the commercial terms around the math are missing or contradictory.**
1. **Risk transfer.**
   - The advance pays on a bill of lading (the feed's ref is actually an air waybill, `AWB 784-SIMULATED`, `scenarios/tracking.ts:39`).
   - If the transport document covers 50 units, under FOB/FCA terms the 6 lost units are the buyer's (and its insurer's) risk, and the supplier is owed for them.
   - If only 44 were shipped, the document should say 44, and the advance should be computed on what shipped.
   - No Incoterm appears anywhere in the repo (grep for `incoterm|FOB|DDP|CIF`: none outside JUDGE-REVIEW).
   - A real supplier rejects "we deduct what didn't arrive" without DAP/DDP terms or a shortage clause.
2. **The advance is never clawed back.**
   - `settlementPlan` pays `max(received × unit, advance)` (`engine/order.ts:50`).
   - Below 15 units delivered, the supplier keeps the full $18,900 advance. At 0 delivered the buyer has paid $18,900 for nothing, with no recourse path.
   - That is defensible, since an advance is the supplier's protection, but it is undocumented.
3. **The 6 missing motors are not backordered.**
   - The wallet closes and the $7,560 goes back (or Astro reclaims it at any time, `engine/escrow.ts:88`).
   - The Dec 14 shortage is then still 6 short.
   - There is no credit note, re-ship or dispute window. Roadmap item 1 admits the dispute part.
4. **The supplier's protection is weak.** Astro can reclaim the held part before the goods arrive. "Visibly committed" is not a payment guarantee, and a supplier would still ask for an LC on the balance.

**Adversarial test (ran by reading; runnable):**

```
npx tsx -e "import {buildPurchaseOrder,settlementPlan} from './engine/order';import {policy} from './seed/astro';const p=buildPurchaseOrder({supplier:{id:'haoyun',approved:true,isNew:true,receiveAddress:'0x',receiveChain:'base'},part:'AM-17',quantity:50,unitCents:126000,baseUnitCents:120000},policy);console.log(settlementPlan(p.po,0),settlementPlan(p.po,10))"
```

Expected: received 0 means paid 1,890,000 and returned 4,410,000; received 10 likewise. The supplier keeps the advance.

**Improvement (1 h, no deploy).**
- Add `incoterm: "DAP Chicago"` to `policy/astro.json`/PO terms, so it enters the rules hash and the signed terms.
- Say in README "Two-stage settlement" that the shortage risk sits with the supplier until the dock, and that the advance is not refundable.
- Add a "backorder or cancel the 6" line to `/audit` event 12.

**Score.** Real-World Money **5.5**.

## Judge 6: Competing-team reviewer ("where would a simpler contract escrow beat EverNEAR?")

**Most compelling capability.** No rival audited in [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md) combines a staged advance on shipping documents, a quantity-priced balance, a two-approver exact-terms commit and a TEE-bound executor. That analysis is unusually careful: it labels code against chain, and it credits rivals where they win.

**Most serious weakness.** Accord (mainnet vault, fixed payee, quantity bound in-contract to a supplier-confirmed invoice) and Day One (per-PO escrow with **0 access keys**, pro-rata on chain) give the supplier and buyer guarantees enforced by validators. EverNEAR's equivalents are:
- a provider policy the backend's owner key can rewrite;
- a unit price the gate doesn't bind (Judge 3);
- 12 legs a judge cannot open in an explorer.

Accord's contract binds `amount = quantity × agreed unit_price` with `unit_price` fixed at funding. EverNEAR's gate takes `unit_cents` from the caller. On that exact property, a 300-line contract beats the enclave.

**Adversarial test.**
- `sed -n 173,176p worker/release-gate/src/lib.rs` (the only price check is the product).
- Compare with Accord's `request_payment` (`lib.rs` around 304–410 as cited in COMPETITIVE-ANALYSIS 2.1), which uses the stored `unit_price`.

**Improvement (30 min, no deploy).**
- Correct [COMPETITION.md:182-184](COMPETITION.md). Line 184 still says the wrong-address refusal "comes from both the gate code and the account policy"; the recorded one was `grant_invalid`. Line 182 says Accord "shows no NEAR mechanism or proof".
- Correct the COMPETITIVE-ANALYSIS comparison table, line 321, "not checked by the deployed gate" (stale since v3).
- Judges cross-read these files.

**Score.** No track change; it feeds Judges 2 and 3.

## Judge 7: Product judge ("can I understand it in under two minutes?")

**Most compelling capability.**
- README:3 is a one-line thesis: "The agent runs the purchase. It doesn't get to invent the payment rules."
- The `/audit` page is the best artefact in the repo:
  - five summary tiles (Committed, Arrived 44 of 50, Paid, Returned, Engine vs chain);
  - 15 events, each with actor, layer and status (`verified on chain` / `simulated` / …);
  - a re-check footer naming the three commands.
- A judge gets the story in about 90 seconds.

**Most serious weakness.** The top of the README overloads and contradicts.
- README:9 packs gate v3, signed dock counts, two people and "$55,440 paid … reconciled against the chain" into one paragraph.
- A reader concludes the paid order went through v3 on a signed count. It went through v1 on an unsigned 44.
- README:67 says "Since Nov 6: a live commit needs two signed approvals", then in the same paragraph "The recorded Nov 6 run below predates the approval check". AGENT-GUIDE:82 says "Since Nov 14".
- `/audit` event 9 says "Release gate (wasm-bound grant) + Tidepool policy" without saying that gate was v1, which trusted the caller.

**Adversarial test (ran).** Read README:1–20 cold. Then open `/audit` (`scenario/auditTrail.ts:58-66`). Check whether event 9 or 13 tells you which gate version paid. It doesn't; only README:186 does, 180 lines down.

**Improvement (20 min, no deploy).**
- In README:9, add "(the recorded payouts went through gate v1 on a simulated, unsigned count; v3 has so far only refused, on chain)".
- Fix README:67's "Since Nov 6".
- Append "gate v1, which took amounts from the caller" to auditTrail events 9 and 13.

**Score.** Product polish lifts Autonomous Business by perception, not by substance. Unchanged at **6.5**.

## Judge 8: Code auditor ("do README, docs, videos and code agree?")

**Most compelling capability.**
- Hashes and amounts in the Remotion package are never typed. `content/remotion/src/data.ts` reads them from `payment-proofs.json` and `receipt()` accepts only `verified` entries.
- The fixtures match the chain byte for byte, and the gate source matches the deployed wasm.

**Most serious weakness.**
- The "deployed gate" is described as v1 in five places and as v3 in four.
- Test counts in READINESS are stale three ways.
- Video captions overstate custody.

See the full list below.

**Adversarial test (ran).**
- `grep -n "deployed gate (v1)\|v1, the deployed build\|deployed (v1)\|Deployed v1 still" README.md worker/release-gate/README.md docs/hackathon/*.md`
- `grep -n "v3.*live" README.md`
- Counts compared against `attack.txt`, `vitest.txt` and `cargo.txt` from this run.

**Improvement (45 min, no deploy).** Make a single sweep with the list below, plus a CI check: a vitest that greps docs for "deployed gate (v1)" and for count literals and compares them with the actual numbers. That stops the drift.

---

## Claims found false, stale or overstated

File:line at HEAD `b8ebea7`.

### False

| # | Where | Claim | Evidence |
|---|---|---|---|
| F1 | worker/release-gate/README.md:42 | "Effect: a compromised backend can no longer make the gate overpay by understating what was released…" | True of `released_cents`, but by omission it implies the gate cannot be made to overpay. The gate overpays the balance by $6,160 when `unit_cents`/`ordered_qty` are misreported (Judge 3 test, on source byte-identical to deployed v3). The same gap sits under ENFORCEMENT-MATRIX.md:73 ("Incorrect payout amount … G v2"), TRUST-MODEL.md:42 ("refuses a caller who disagrees"), and README:9 ("re-reads the wallet before it pays"). |
| F2 | worker/release-gate/README.md:31 | "a compromised backend can no longer pay a balance on a count it made up; it would need the dock device's key" | It needs only *any* earlier signed count for PO "1042". The signed message has no wallet id or nonce, the gate has no clock, and every live run is PO 1042 (`lib.rs:549-553`, `convex/live.ts:118`). |
| F3 | README.md:67 | "Since Nov 6: a live commit needs two signed approvals" | The same paragraph says the Nov 6 run "predates the approval check". AGENT-GUIDE.md:82 says "Since Nov 14". The approvals code landed on this branch (commits dated Nov 13/14 UTC). |
| F4 | README.md:9 | "the paying key lives only inside an OutLayer enclave" | The backend holds Astro's owner key, which can change policy and pay any address (README:188, TRUST-MODEL "Trusted parties" 2). The same overstatement is in content/remotion/src/compositions/PartialShipment.tsx:79. |
| F5 | content/remotion/src/data.ts:381 (shown in JudgeDemo) | "the deployed gate does not check the signature yet" | v3 is live and checks it; on-chain refusal `8S4uYwhT` verified. |
| F6 | docs/hackathon/COMPETITION.md:184 | "the wrong-address refusal comes from both the gate code and the account policy" | The recorded refusal is `grant_invalid` at the grant layer (PAYMENT-PROOFS row 12). The file has a "superseded in part" banner at line 3, but this line is not corrected. |
| F7 | docs/hackathon/AFK.md:28 vs :44 | "Approver keys are generated and held by approvers, never by the server or me" | Line 44: "Jordan's key made in `.approver-keys/Jordan.key`", and the dock device key likewise. In the hosted setup both approvers and the dock are provisioned by one operator. This undercuts "two people sign" (README:9, :60) for the hosted deployment. |

### Stale or self-contradictory

| # | Where | Says | Reality |
|---|---|---|---|
| S1 | README.md:186; worker/release-gate/README.md:47; TRUST-MODEL.md:42 ("deployed (v1)"); ENFORCEMENT-MATRIX.md:47 ("Deployed v1 still takes it from the caller") | The deployed gate is v1 | README:58, worker README:29, AFK.md:47 and our tx check say v3 is deployed. v1 is the build that *paid* the recorded run. |
| S2 | TRUST-MODEL.md:42 | "Gate v2 … live on the deployment" | v3 superseded it. Remotion `data.ts:375` (`GATE_V2_SCOPE`) says the same. |
| S3 | COMPETITIVE-ANALYSIS.md:321 | Delivery evidence: "signed dock-count path built, not checked by the deployed gate" | v3 checks it. |
| S4 | READINESS.md:24, :83 | "`npm run attack` (44 cases)", "44 passed" | 49 today. |
| S5 | READINESS.md:78, :80 | "470 passed, 3 skipped"; "cargo test: 33 passed" and "25 passed" in the same file | 474 passed, 4 skipped; cargo 35. |
| S6 | READINESS.md:3 | Branch "local, not pushed" | `origin/hackathon/p0-hardening` exists (AFK.md:43 "Branch pushed"); local is ahead. |
| S7 | READINESS.md:65 | Dock count "Fixed demonstration data (44)" | With `DOCK_DEVICE_KEYS` set, the hosted live path waits for a signed count (`convex/live.ts:166-171`). |
| S8 | COMPETITION.md:182 | Accord's "first post shows no NEAR mechanism or proof" | COMPETITIVE-ANALYSIS 2.1: mainnet vault, tx `F8tY6ieg…`. |

### Overstated

| # | Where | Claim | Why |
|---|---|---|---|
| O1 | README.md:9 | "a balance on a dock count signed by a pinned device … gate v3 … In the demo 44 of 50 motors arrive: $55,440 paid" | The paid demo used gate v1 and an unsigned simulated 44. v3 has only refused. |
| O2 | README.md:9, :79 | "reconciled against the chain (`npm run reconcile`)" | `scripts/reconcile.mts:15` reads the cached `payment-proofs.json` and makes no RPC call. Only `verify:proofs` touches the chain. |
| O3 | README.md:17, :81 | `verify:proofs` "reads every recorded testnet transaction back" | The two gate probe fixtures are not covered (CAPTURE.md:66 admits it). |
| O4 | README.md:17, :80 | "49 attacks on the money path, each refused at its named layer" | About 6 of the 49 are positive-path tests (they authorize or pay). |
| O5 | README.md:148 | Balance "once import customs AND the attested dock count agree" | The paying run's count was unsigned and unattested. The dock-check worker is not deployed (README:63). |
| O6 | content/remotion ApprovalGateVideo.tsx:95-97, :102; scenes.tsx:354; ShortShipment.tsx:25-29 | "What it couldn't do · 3: pay out from the order wallet"; "2 humans and the payment rules decide the money"; "The payment rules still protect your money"; "Two people sign…" over the recorded commit | The owner key held by the backend can pay out. The recorded commit had no approvals. The rules are an owner-overridable provider policy. |
| O7 | content/remotion JudgeDemo.tsx:81, :101; Stills.tsx:65 | "Commit with no approvals: refused on real testnet" | Evernear's own backend code refused it in process; Tidepool only confirms no wallet was opened. |
| O8 | scenario/auditTrail.ts:62, :66 (/audit events 9, 13) | "Release gate (wasm-bound grant) + Tidepool policy" | Does not say the paying gate was v1, which trusted the caller's amounts. |

The Remotion items O6–O7 and F5 come from a delegated read of `content/remotion/src`. We spot-checked `data.ts:375`, `data.ts:381` and `PartialShipment.tsx:79` against the files.

---

## Top 5 improvements: under 2 h each, no mainnet

Ranked by impact over effort.

| # | Improvement | Effort | Deploy? | Fixes |
|---|---|---|---|---|
| 1 | **Disclose and pin the unit-price bound.** Add the Judge 3 test to `worker/release-gate/src/tests.rs` (tests don't change the wasm, so the `e6057795` match holds). Correct worker README:31 and :42, TRUST-MODEL B4, ENFORCEMENT-MATRIX case 6 and README:186 to say: "v3 does not bind unit price or quantity; a backend with a genuine signed count can overpay the balance up to the held part, to the supplier only; a signed count for PO 1042 can be replayed into a later wallet". Add it to READINESS as P1 with the real fix (terms digest + approver signatures checked in the enclave; dock message bound to `agent_id`), which needs a redeploy. | 45 min | No | F1, F2; the AI Security credibility hit |
| 2 | **One sweep over the gate version and the counts.** Replace every "deployed (v1)" with "v1 paid the recorded run; v3 is deployed and has only refused". Fix README:67 "Since Nov 6", READINESS counts and push state (S4–S7), COMPETITIVE-ANALYSIS:321, COMPETITION:182/184, and AFK.md:28 versus :44. Add a vitest that fails if docs say "deployed gate (v1)" or an attack count other than the script's. | 45 min | No | F3, F6, F7, S1–S8 |
| 3 | **Bring both gate probes, and the gate build, under the verifier.** In `scripts/verify-proofs.mjs`: read `4qXdn52Z` and `8S4uYwhT`, check the wasm hash in the tx args against the fixture, decode `SuccessValue`, verify the signature and recompute `evidence_sha256` (this review's `probe.mjs` does exactly that in 50 lines). Add `npm run verify:gate-build`, which rebuilds with rustc 1.99.1 and compares to `e6057795…`. | 1 h | No | O3; Judge 4's "verify without trusting us" |
| 4 | **Make the README top and `/audit` say which gate paid.** README:9 gets one parenthesis (v1 paid on an unsigned simulated count; v3 has only refused) and changes `npm run reconcile` to `npm run verify:proofs` for the chain claim. auditTrail events 9 and 13 add "gate v1 (caller-supplied amounts)". Event 15 cites the v3 probe as well as v2. Re-render JudgeDemo with `data.ts:375/381` corrected. Reword the custody captions (O6, O7) to "the agent and Evernear's code can't pay out; the owner key can". | 1 h, plus a render | Hosted site only if `/audit` is redeployed | F4, F5, O1, O2, O5–O8 |
| 5 | **State the commercial terms the math assumes.** Add `incoterm` (for example DAP Chicago, with shortage risk on the supplier until the dock) and `advance_refundable: false` to `policy/astro.json`, so they enter `RULES_HASH` and the signed terms. Note that the engine pays `max(received × unit, advance)`. Add a "6 short: backorder or cancel" step to `/audit` event 12. | 1 h | No (existing pending approvals become invalid because the rules hash changes, which is the intended behaviour) | Judge 5's coherence objections |

Out of scope for under 2 h, but the highest-value next step: one paying run through gate v3, with two approvers and a dock clerk on separate machines (AFK.md "Needs you" steps 1–5). It needs Luca, Jordan and one Tidepool wallet. It would move Real-World Money and AI Security more than any doc fix.

## Revised scores

| Track | Panel 1 | Panel 2 | Why |
|---|---|---|---|
| Autonomous Business | 6.5 | **6.5** | The order pipeline is now one code path from offer to payout (good), but it is still one seeded PO with a simulated counterparty. |
| Real-World Money | 5.5 | **5.5** | Chain reconciliation re-verified. The v3 signed-count gate is real on chain but has never paid. Incoterm/risk transfer and advance clawback are undefined. |
| AI Security & Defense | 6.5 | **6.0** | The reproducible gate build and the verified probes are strong. But the docs claim the gate cannot be made to overpay, and it can by $6,160 on the deployed source. The dock signature replays across same-PO wallets. Approvers and dock key are provisioned by one operator. |
| Agent Economy | 5.5 | **5.5** | Unchanged: NEP-413 approver support exists, but agent-to-agent commerce is a simulator. |
