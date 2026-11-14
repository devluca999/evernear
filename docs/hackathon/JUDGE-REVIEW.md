# Judge panel review: EverNEAR

Reviewed at `hackathon/p0-hardening` **HEAD 6780d8b** (2026-11-13, local, not pushed). Seven adversarial judges, each trying to break one claim. Every file:line below is at that commit. During the review someone else committed (67df486, 908c5d4, 6780d8b) and left uncommitted edits to `vitest.config.mts`, `tsconfig.json` and `eslint.config.mjs`. Those edits are noted where they matter; nothing in this review depends on them.

Each challenge says where it ran:
- **real testnet**: public NEAR testnet or Base Sepolia RPC, read-only.
- **simulated provider**: `tests/near/fakeTidepool.ts` driven through convex-test. It shows what our code does, not what Tidepool does.
- **local**: pure code, or a build and server on localhost.

"False" means the review showed it to be false. Anything not shown is marked **unbacked** or **unverified**.

## What we ran

| Command | Result |
|---|---|
| `npm run attack` | **42/42 pass** (3 files). |
| `npx vitest run` | **Exit 1** at HEAD: 4 failing files, 1 failing test, all under the untracked `content/remotion/node_modules/zod/...`. The root `exclude` (`vitest.config.mts:10`) does not match nested `node_modules`. With `--exclude 'content/**'`: **49 files, 455 tests pass** (READINESS says 452). An uncommitted working-tree edit adds `content/**` to the excludes. |
| `cargo test` (worker/release-gate) | 25 pass (as claimed). |
| `node scripts/verify-proofs.mjs` | Exit 0. 6 rows verified on chain, 8 Tidepool intent ids not independently verifiable, 6 simulated signals, 2 refusals with no tx. Reconciliation 18.90 + 36.54 + 7.56 = 63.00 holds. The script rewrites `docs/hackathon/payment-proofs.json`; the only change was `checkedAt`, and the original was restored. |
| `node scripts/demo.mjs --check` | **Exit 1, "demo check failed"**, although `next build` and `next start` both succeeded. The check looks for `<title>Evernear</title>` (`scripts/demo.mjs:27`); the page serves `<title>everNEAR</title>` (`app/layout.tsx:9`, since cd75f47 on Nov 5). Note: Next loaded the local `.env.local` during the build (the reviewer did not open it), so "clean clone, no keys" was **not** tested. |
| 4 probe tests (Appendix A) | All 4 reproduce, on the simulated provider. |
| `request_execution` args of gate tx `3fQzuEro…6XLV` (archival RPC) | Real testnet. wasm `04f6d241…1979` matches the local `target/wasm32-wasip2/release/release-gate.wasm`. The input carries `"source":"simulated"` signals and was paid. |

---

## Judge 1: Payments. "Can this agent cause an unauthorized payment?"

**Strongest feature.** No live commit happens without two ed25519 signatures over the server-recomputed terms. The claim, the nonce spend and the run claim happen in one Convex transaction (`convex/approvals.ts:69-103`), and `lock` checks again (`convex/near/deadline.ts:117-127`). No model ever picks an amount or an address: they come from `seed/astro.ts` and the engine (`convex/live.ts:92-114`).

**Most serious flaw.** In the demo, Evernear's backend holds everything needed to pay anyone:
- Astro's owner key (`AGENT_OWNER_PRIVATE_KEY_PKCS8`, `deadline.ts:65-67`).
- The treasury grant, derived from `AGENT_API_KEY`. The treasury policy is `destinations: { mode: "any" }`, has no budget, and allows 100 USDC per transaction (`convex/near/escrow.ts:83-89`).

So the backend can send treasury funds anywhere. It can also re-point any PO wallet, and the code already does this legitimately: `ownerOnly()` rewrites the policy and issues the server a grant (`escrow.ts:375-385`). Approvals and the release gate bound only the honest code path, never the key holder. README:216-218 says this, but TRUST-MODEL.md:54 says the opposite (see Judge 7).

**Reproducible challenge** (simulated provider). Appendix A, probe **A**: using only the Convex env, it commits PO 1042, sends `policy_update` (destinations any) and `grant_issue`, then withdraws $63.00 to `0x…dead`. It pays. The treasury path is simpler still: `act(treasuryId, grant("treasury"), "transfer", {recipient: <anyone>})`.

**Remediation.**
1. Say it plainly in TRUST-MODEL: whoever holds the deployment env can pay anyone. (Docs only.)
2. Give the treasury `destinations: only` with the PO-account factory pattern, or a `budget.daily_usd`. This needs an owner intent on Tidepool, which is a live action.
3. Long term, follow README:218: owner intents go to Astro's wallet (generate/submit split) and the server never holds the owner key.

**Scores.** Autonomous Business 6 · Real-World Money 5 · AI Security & Defense 5 · Agent Economy 6.

## Judge 2: Security. "What prevents forged approvals, replay and duplicate withdrawals?"

**Strongest feature.** The approval verifier is tight and tested at the real entry points:
- 25 commit-path cases in `tests/commitAuthorization.test.ts`, plus 9 engine cases.
- Pinned keys, a domain-separated message (`engine/approvals.ts:24,87-89`), a 24-hour TTL cap, and a nonce spent atomically with the claim.
- Revocation is signed by the approver.
- The registry fails closed (`approvals.ts:146-148`).
- Before every release, the escrow balance is reconciled against the on-chain balance (`escrow.ts:300-309`).

**Most serious flaw.** Duplicate withdrawals are stopped only by Tidepool's idempotency key. Our own state machine is not atomic for releases:
- `runStep` is a **public, unauthenticated** action (`convex/live.ts:78`).
- Its "already done / in order" check reads state and acts later (`live.ts:84-85`).
- `mark` appends to `done` without dedup (`live.ts:61`).

Two concurrent `runStep("advance")` calls both pass reconcile, because neither withdraw has landed yet, and both POST a withdraw. With Tidepool's idempotency, one payout goes out. The result:
- **Two "Advance paid" proof rows** for one payment.
- `done = [commit, advance, advance]`.
- Every later `pay` returns `out_of_order`, so the supplier's balance can never be paid through the live flow. The deadline job then refunds the 70% to Astro.

Only the commit has an atomic claim.

Secondary findings:
- Approvals bind the terms, not one commitment. The same PO 1042 can be funded into a second wallet by a second pair of signatures over the identical digest, and nothing checks that the PO is already funded (`convex/approvalTerms.ts:20-31`).
- `commitTerms` never checks `supplier.approved`. `canLockFunds` (`engine/policy.ts:13`) has no caller outside tests.
- `live.start` is public too. Six calls an hour lock out legitimate live runs (`live.ts:44-53`).

**Reproducible challenge** (simulated provider). Appendix A:
- Probe **C**: `withdrawPosts: 2, payouts: 1, payoutProofs: 2, done: [commit, advance, advance], pay: out_of_order`.
- Probe **B**: two PO 1042 wallets.

**Remediation.**
1. Claim each money step in an `internalMutation` before the action runs, the same pattern as `claimCommit`: refuse when the step is already claimed or in flight.
2. Make `mark` idempotent.
3. Add a "PO already has an open or settled escrow" check to `claimCommit`.

All of this is code and tests, under 2 hours. It needs a Convex deploy to reach the hosted demo.

**Scores.** AI Security & Defense 6 · Autonomous Business 6 · Real-World Money 5.

## Judge 3: Confidential computing. "What exactly does the TEE prove?"

**Strongest feature.** The grant key really is bound to the code:
- `bind: "wasm"` keys (`worker/release-gate/manifest.json`), and the token is derived inside the module (`lib.rs:433-440`). Enroll outputs only its hash.
- The on-chain run names wasm sha256 `04f6d241…1979`, which reproduces from the committed source with the local toolchain. Different code yields a different grant, which Tidepool refuses.
- The limits are documented honestly: worker README "What it does not guarantee", TRUST-MODEL B4/B5.

**Most serious flaw.** The TEE proves less than the narrative implies, and nothing in the repo verifies the parts it does prove:
1. **No attestation is checked.** No OutLayer TDX quote is fetched or verified anywhere: grep finds none in `convex/`, `engine/` or `scripts/`, and `live-run.json` has no attestation artefact. The server trusts the gate's ed25519 key from enroll's own output. Pinning it with `RELEASE_GATE_PUBLIC_KEY` is optional (`releaseGate.ts:163-168`).
2. **The gate decides on whatever the caller sends.** `to`, `released_cents`, `advance_percent`, `received_qty` and the signals all come from the caller (`lib.rs:150-227`). Evidence counts if it has an `id` and an `at`. The real paid run's input says `"source":"simulated"`.
3. **The server holds the key the gate is bound to.** The binding is wasm hash plus signer, and the server holds the signer's NEAR key (`RELEASE_GATE_NEAR_KEY`, `releaseGate.ts:152-156`). So the server can make the gate pay Haoyun up to the locked total. This is documented as a gap, but README:208 still says "Evernear's server never holds a key that can pay Haoyun".
4. **`verify-proofs` checks the gate tx for success only** (`scripts/verify-proofs.mjs:307-309`, `expect` null). It does not check the wasm hash in the args, the gate's signed output, or that the input's `to` and amount match the payout.
5. **NEAR AI inference**: `inference.ts:51-56` fetches the attestation report but never verifies the quote. It computes `bound`, but no caller refuses when `bound` is false (`inference.ts:66-77`).
6. **The "attested dock check"** (`convex/near/dockcheck.ts:16-25`) compares three caller-supplied hashes, with no signature over them. It has no caller outside its test.

**Reproducible challenge** (real testnet).
```
curl -s https://archival-rpc.testnet.near.org -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tx","params":{"tx_hash":"3fQzuEroAQyrmeMhBbpirQ97JH7ML2DCNVmMxX7T6XLV","sender_account_id":"evernear-luca.testnet","wait_until":"NONE"}}' | jq -r '.result.transaction.actions[0].FunctionCall.args' | base64 -d
```
It shows `secrets_ref` owned by `evernear-luca.testnet`, the wasm hash, and `"source":"simulated"` evidence that was paid.

**Remediation.**
- **No deploy, about 1 hour:** extend `verify-proofs.mjs` to decode `request_execution` args and assert the wasm hash equals the pinned value. Also assert that input `to`, `stage` and amount match the Base Sepolia transfer. Then exit non-zero on any mismatch.
- **No deploy, about 30 minutes:** make `RELEASE_GATE_PUBLIC_KEY` mandatory when the gate is configured. Refuse inference results with `bound === false`.
- **Needs a new wasm build:** read `released_cents` from the account's balance inside the gate. Verify an OutLayer attestation for the result key.

**Scores.** AI Security & Defense 5 · Agent Economy 5 · Autonomous Business 5.

## Judge 4: Procurement. "Would this help someone actually buying goods overseas?"

**Strongest feature.** The commercial logic is right for a short shipment:
- 30% advance on bill of lading plus export clearance.
- Balance = received × unit − released.
- The missing 6 motors are never paid.
- Integer-cent arithmetic, shared between TypeScript and Rust vectors (`engine/escrow.ts:63-83`, `lib.rs:183-226`).

The comparison with a prepaid wire or a letter of credit (README:200-206) is the right framing for a buyer. Real money moved on testnet and reconciles to the cent.

**Most serious flaw.** The supplier side and the evidence side are not real yet:
- **The supplier is weakly protected.** README:206 says "the rest visibly locked", but `reclaimHeld` lets the owner take the held 70% back as soon as the advance is paid, with no arrival signal and no dispute window (`engine/escrow.ts:85-92`). The supplier ships on the strength of a lock the buyer can open at any time. TRUST-MODEL admits it is "a commitment, not a lock", but the procurement pitch reads otherwise.
- **The evidence is simulated.** Every signal is simulated (`scenarios/tracking.ts`). In live runs the dock count is the constant `PO.receivedQty` (`live.ts:109,114`). The signed dock-count feature (`engine/attestation.ts`) has **no producer**: nothing in the live path attaches an attestation (`deadline.ts:179-185`). Setting `DOCK_DEVICE_KEYS` would refuse every live balance.
- **One PO only.** It is hard-coded (PO 1042, Haoyun, one SKU), supplier replies are simulated, and there are no Incoterms, partial-shipment or dispute flows, invoices, or a CSV for accounting (asked for in the Real-World Money track).

**Reproducible challenge** (simulated provider). Appendix A, probe **D**: commit, advance, then `internal.near.deadline.reclaim` returns `{ok: true, walletClosed: true}` before any import or dock signal. This is not a public exploit: `runStep` order blocks it. It is an engine rule.

**Remediation.**
1. Allow `reclaimHeld` only after the balance stage or a dispute window (engine plus test, about 30 minutes; Convex deploy for the hosted demo).
2. Wire a signed dock count through an HTTP action, so the attestation path has a producer.
3. Export a ledger CSV from `payment-proofs.json`.

**Scores.** Real-World Money 5 · Autonomous Business 6 · Agent Economy 5.

## Judge 5: NEAR ecosystem. "Why is NEAR essential rather than decorative?"

**Strongest feature.** Real NEAR-native rails carry the money:
- The commit, swap, reclaim and each payout's `ft_withdraw` leg are NEAR testnet transactions on the Intents verifier. They were read from archival RPC and verified.
- The release gate is an OutLayer `request_execution` on `outlayer.testnet`, with the Intents verifier bridging to Base Sepolia.
- Removing NEAR removes the escrow account model, the cross-chain payout, and the code-bound grant.

**Most serious flaw.** The guarantees that matter are enforced off-chain or by a third party, not by NEAR:
- Policy, grants and idempotency are enforced by **Tidepool's server**, a community testnet that is not run by NEAR. 8 of 22 recorded steps are Tidepool intent ids with `transaction_hash: null`.
- Approvals are Convex rows with off-chain ed25519 signatures, not NEAR multisig, NEP-413 or function-call keys.
- The deadline refund is a Convex cron.

Competitors in COMPETITION.md (Clear to Pay, Veto) enforce in their own NEAR contracts. The NEAR AI inference (chapter 4) is a synthetic placeholder in the demo (README:5).

**Reproducible challenge** (real testnet). `node scripts/verify-proofs.mjs`: count the `provider-intent-id ... not-independently-verifiable` lines (8). Every policy, grant, revoke and freeze is unverifiable on chain.

**Remediation.**
1. Have approvers sign NEP-413 messages with their NEAR accounts. The repo already has NEP-413 code in `convex/near/approval.ts` and the rehearsal. Verify against on-chain access keys. Under 2 hours, but needs a Convex deploy.
2. Long term: move the order wallet's rules into a small NEAR contract, or use OutLayer custody approvals.

**Scores.** Autonomous Business 5 · Agent Economy 5 · Real-World Money 4 · AI Security & Defense 5.

## Judge 6: Product. "Can I understand and use the system?"

**Strongest feature.**
- The story is concrete and the numbers carry through every screen: $63,000, $18,900, $36,540, $7,560.
- Present, Autoplay and Short modes exist, with clear "Synthetic placeholder" and "Simulated feed" labels.
- PAYMENT-PROOFS.md is a model of honest evidence classes.
- `npm run attack` is a one-command security demo.

**Most serious flaw.** The two commands an AI screen runs first both exit 1:
- `node scripts/demo.mjs --check`, cited at README:164, because of the title mismatch.
- `npx vitest run`, in any checkout where `content/remotion` has its dependencies installed.

The README is also very long (240 lines; half of it covers camera, cursor and zoom choreography) before it says what is real.

Live mode needs a Tidepool key, approver keys, a Convex deploy and `scripts/approve.mts` or `/approve`. A judge cannot try the money path.

Small inconsistencies:
- README:11 says "`?scene=7` jumps to chapter 7 of 8"; `demo.mjs:17` prints "?scene=0 to 9".
- `engine/approvals.ts:92` and `convex/approvals.ts:2` cite `scripts/approve.mjs`; the file is `approve.mts`.

**Reproducible challenge** (local). `node scripts/demo.mjs --check; echo $?` prints `demo check failed` and `1`.

**Remediation.**
1. Change `demo.mjs:27` to match `everNEAR`, or match case-insensitively (1 line).
2. Commit the `content/**` excludes.
3. Move a 10-line "What is real / what is simulated / how to verify" box to the top of the README, and push the camera material to a separate doc.

All under 1 hour, no deploy.

**Scores.** Autonomous Business 6 · Real-World Money 5 · Agent Economy 6.

## Judge 7: Code audit. "Do README, docs, source and execution agree?"

**Strongest feature.**
- Every relative link in README.md, docs/hackathon/*.md and the worker README resolves: 0 missing.
- Every test name the README cites exists in the file it names: 36 vitest names and 18 Rust names checked.
- The Rust test count (25) matches.
- On-chain amounts reconcile.
- The release gate's wasm reproduces the deployed hash.

**Most serious flaw.** The trust documents contradict each other and the code about who can move money, and the README's headline commands fail.

### Claims shown to be false

| # | Claim | Where | Evidence |
|---|---|---|---|
| F1 | `DEMO_MODE=1 npm run demo` "runs from a clean clone", checked by `node scripts/demo.mjs --check` | README:164 | The check exits 1 on a successful build (`demo.mjs:27` vs `layout.tsx:9`). The cited check is broken; the demo itself serves. |
| F2 | Evernear's backend "Cannot pay anyone outside the allowlist" | TRUST-MODEL.md:54 | The backend holds the owner key and the treasury grant (`destinations: any`). Probe A pays `0x…dead` (simulated provider). It also contradicts README:216-218 and the code in `escrow.ts:375-385`. |
| F3 | Compromised-backend worst case is "overpay Haoyun up to the $63.00 total, to the allowlisted address only" | TRUST-MODEL.md:42 (B4), README:214 | Same as F2: that is the bound for the gate path, not for the backend. |
| F4 | "Evernear's server never holds a key that can pay Haoyun" | README:208 | The server holds `RELEASE_GATE_NEAR_KEY`, the signer the gate's key is bound to, and can drive the gate to pay Haoyun up to the total (pinned by `understated_released_overpays_up_to_locked_never_beyond`). It also holds the owner key. |
| F5 | "`npx vitest run`: 452 passed"; "Tests and build pass" | READINESS.md:21,74 | At HEAD, exit 1 with content/remotion installed. 455 pass when it is excluded. |

### Claims not backed (no code path or test carries them)

- README:3, "Evernear never holds funds… the buyer's money stays in the buyer's own wallet". The wallet is controlled by a key held in Evernear's deployment (disclosed only at README:218).
- README:160, "A release not from the approved dock-check build is refused". `verifyAttestedRelease` has no caller in the money path, and its "attestation" is unsigned hashes.
- README:153, "a lost answer or a stale record cannot pay twice". True sequentially. Under concurrency, two withdraws are sent and only provider idempotency prevents a second payout (probe C).
- README:206, "the rest visibly locked". `reclaimHeld` lets the owner take it back right after the advance (probe D).
- TRUST-MODEL.md:49, "when devices are pinned, the server refuses a balance on an unsigned… count". True, but no path produces a signed count, so pinning blocks every live balance.
- ENFORCEMENT-MATRIX cases 1-3, 7-9 and 17, "refused by provider". Refused by `fakeTidepool.ts`, the repo's own model. The matrix says so, but `npm run attack` output reads as provider refusals.
- B0 private inference attestation "verified". The report is fetched, not verified, and `bound` is not enforced. In the demo it is a synthetic placeholder.

### Stale or inconsistent

- READINESS.md:44 says "no in-app approve page"; `app/approve/page.tsx` exists (908c5d4).
- 452 vs 455 tests.
- `approve.mjs` vs `approve.mts`.
- `?scene` range.

### Not verified (browser-only)

Zoom counts, Cmd+K press counts, and "22 / 11 / 21 zooms pass" (README:64,79-83) need `check-frames.mjs` in Chrome, which the panel did not run.

**Reproducible challenge** (local). The demo check and vitest commands above, plus Appendix A.

**Remediation.**
1. Fix F1 and F5 (minutes).
2. Rewrite TRUST-MODEL:42,54 and README:3,208 to name the three keys the backend holds (owner, treasury grant, gate signer) and what each lets it do (30 minutes, docs).
3. Add a test that asserts the trust claim, for example "backend env can re-point a PO wallet", so the docs cannot drift again.

**Scores.** Autonomous Business 6 · Real-World Money 5 · AI Security & Defense 5 · Agent Economy 6.

---

## Panel summary

| Judge | Autonomous Business | Real-World Money | AI Security & Defense | Agent Economy |
|---|---|---|---|---|
| 1 Payments | 6 | 5 | 5 | 6 |
| 2 Security | 6 | 5 | 6 | – |
| 3 TEE | 5 | – | 5 | 5 |
| 4 Procurement | 6 | 5 | – | 5 |
| 5 NEAR | 5 | 4 | 5 | 5 |
| 6 Product | 6 | 5 | – | 6 |
| 7 Code audit | 6 | 5 | 5 | 6 |
| **Mean** | **5.7** | **4.8** | **5.2** | **5.5** |

## Top remediations, ranked by impact / effort

| Rank | Fix | Impact | Effort | Under 2 h, no deploy? |
|---|---|---|---|---|
| 1 | `scripts/demo.mjs:27`: match `everNEAR` (or `/<title>everNEAR<\/title>/i`). Re-run `--check` from a clean clone with no `.env.local`. | The README's own reproducibility check passes; this is the first thing the AI screen runs. | 5 min | **Yes** |
| 2 | Commit the `content/**` exclude in `vitest.config.mts` (already in the working tree, uncommitted), plus tsconfig and eslint. Update the READINESS test count. | `npx vitest run` / `npm test` go green. | 5 min | **Yes** |
| 3 | Correct F2-F4 and README:3. List the backend's three powers (owner key, treasury grant with `destinations: any`, gate signer). Add probe A as a permanent test of the documented limit. | Removes the panel's only demonstrated false security claims; credibility with the security and code-audit judges. | 30-45 min | **Yes** (docs plus a test) |
| 4 | Make the live money steps atomic: an `internalMutation` claims `{runId, step}` before `releaseStage`/`reclaim` run, `mark` dedups, and probe C becomes a test asserting one withdraw POST and one proof row. | Closes the double-proof and wedged-run bug. Duplicate payout no longer rests on Tidepool idempotency alone. | 1-1.5 h | Yes for code and test. **Needs a Convex deploy** to reach the hosted demo. |
| 5 | `verify-proofs.mjs`: decode gate `request_execution` args and assert wasm hash = `04f6d241…`, `to` = Haoyun and stage amount = the Base Sepolia transfer. Exit non-zero on any mismatch. Make `RELEASE_GATE_PUBLIC_KEY` mandatory when the gate is configured. | The TEE claim becomes independently checkable: "this exact code paid this exact transfer". | 1 h | **Yes** for the script. The key pin is a config change (deploy). |

Next in line:
- **PO uniqueness and `supplier.approved` in `claimCommit`** (1 h, Convex deploy).
- **`reclaimHeld` only after the balance stage or a dispute window** (30 min, Convex deploy).
- **Authenticate `live.start` and `runStep`** (Convex deploy).
- **Gate reads `released_cents` from chain, and attestation verification** (new wasm build: **not** doable without deploy).
- **Restricting the treasury policy** (a live Tidepool owner intent).

---

## Appendix A: probe tests

To reproduce, save this block as `tests/zz_judgeProbe.test.ts` and run:

```
npx vitest run tests/zz_judgeProbe.test.ts --reporter=verbose
```

It needs no keys and makes no network calls: it uses fakeTidepool through convex-test. A copy is at `docs/hackathon/judge-probe.test.ts.txt`.

Observed output:
- C: `withdrawPosts: 2, payouts: 1`, then `done: ["commit","advance","advance"], payoutProofs: 2, pay: {ok: false, reason: "out_of_order"}`.
- D: `{ok: true, walletClosed: true}`.
- A and B pass as asserted.

```ts
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "@/convex/schema";
import { api, internal } from "@/convex/_generated/api";
import { fakeTidepool, FAKE_BASE } from "./near/fakeTidepool";
import { API_KEY, testOwner } from "./near/agentFixtures";
import { EscrowAdapter } from "@/convex/near/escrow";
import { BASE_USDC, grantHash, grantToken } from "@/convex/near/agentapi";
import { approveLive, setApprovers } from "./approvalFixtures";

const modules = import.meta.glob("../convex/**/*.ts");
const ENV = ["AGENT_API_KEY", "AGENT_API_BASE_URL", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID", "LIVE_ENABLED", "APPROVER_KEYS"];
const T0 = Date.UTC(2026, 10, 10, 9);

async function world() {
  const tp = fakeTidepool();
  const { owner, pkcs8Base64 } = testOwner();
  const treasuryId = await new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} }).createTreasury();
  tp.credit(treasuryId, BASE_USDC, 1_000_000_000n);
  Object.assign(process.env, { AGENT_API_KEY: API_KEY, AGENT_API_BASE_URL: FAKE_BASE, AGENT_OWNER_ACCOUNT_ID: owner.accountId, AGENT_OWNER_PUBLIC_KEY: owner.publicKey, AGENT_OWNER_PRIVATE_KEY_PKCS8: pkcs8Base64, AGENT_TREASURY_ID: treasuryId, LIVE_ENABLED: "1" });
  setApprovers();
  vi.stubGlobal("fetch", tp.fetch);
  return { tp, t: convexTest(schema, modules), owner };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); for (const k of ENV) delete process.env[k]; });

describe("judge probe", () => {
  it("A. the backend env (owner key) re-points a committed PO wallet and pays an off-list address", async () => {
    const { tp, t, owner } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    await approveLive(t);
    expect(await t.action(api.live.runStep, { runId: runId!, step: "commit" })).toEqual({ ok: true });
    const run = (await t.query(api.live.getRun, { runId: runId! }))!;
    const esc = (await t.query(internal.near.escrowState.get, { escrowId: run.run.escrowId! }))!;
    const a = new EscrowAdapter({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink: () => {} });
    const c = (a as unknown as { client: { owned: Function; act: Function; policy: Function } }).client;
    const pol = await c.policy(esc.agentId);
    await c.owned("policy_update", { agent_id: esc.agentId, expected_revision: pol.revision, policy: { ...pol.policy, destinations: { mode: "any", list: [] } } }, { kind: "policy", label: "x", codePath: "x" });
    const tok = grantToken(API_KEY, "attacker");
    await c.owned("grant_issue", { agent_id: esc.agentId, label: "attacker", credential: grantHash(tok), expires_at: new Date(Date.now() + 86_400_000).toISOString() }, { kind: "policy", label: "x", codePath: "x" });
    const r = await c.act(esc.agentId, tok, "withdraw", { asset: BASE_USDC, amount: "63000000", chain: "base", recipient: "0x000000000000000000000000000000000000dead" }, { kind: "payout", label: "x", codePath: "x" });
    expect(r.ok).toBe(true);
    expect(tp.payouts.find((p) => p.recipient === "0x000000000000000000000000000000000000dead")?.amount).toBe(63_000_000n);
  });

  it("B. the same PO 1042 is committed into a second wallet; nothing checks the PO was already funded", async () => {
    const { tp, t } = await world();
    const before = tp.agents.size;
    const r1 = await t.mutation(api.live.start, {});
    await approveLive(t);
    expect(await t.action(api.live.runStep, { runId: r1.runId!, step: "commit" })).toEqual({ ok: true });
    vi.setSystemTime(T0 + 31 * 60_000);
    const r2 = await t.mutation(api.live.start, {});
    await approveLive(t);
    expect(await t.action(api.live.runStep, { runId: r2.runId!, step: "commit" })).toEqual({ ok: true });
    expect(tp.agents.size).toBe(before + 2);
  });

  it("C. two concurrent public runStep('advance') calls both reach the provider", async () => {
    const { tp, t } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    await approveLive(t);
    await t.action(api.live.runStep, { runId: runId!, step: "commit" });
    const [a, b] = await Promise.all([t.action(api.live.runStep, { runId: runId!, step: "advance" }), t.action(api.live.runStep, { runId: runId!, step: "advance" })]);
    const withdraws = tp.sent.filter((s) => s.method === "POST" && /\/withdraw$/.test(s.path));
    console.log("PROBE C", JSON.stringify({ a, b, withdrawPosts: withdraws.length, payouts: tp.payouts.length }));
    expect(withdraws.length).toBe(2);
    expect(tp.payouts.length).toBe(1);
    const run = (await t.query(api.live.getRun, { runId: runId! }))!;
    const pay = await t.action(api.live.runStep, { runId: runId!, step: "pay" });
    console.log("PROBE C2", JSON.stringify({ done: run.run.done, payoutProofs: run.proofs.filter((p) => p.kind === "payout").length, pay }));
  });

  it("D. after the advance, the held 70% can be reclaimed before the goods arrive", async () => {
    const { tp, t } = await world();
    const { runId } = await t.mutation(api.live.start, {});
    await approveLive(t);
    await t.action(api.live.runStep, { runId: runId!, step: "commit" });
    await t.action(api.live.runStep, { runId: runId!, step: "advance" });
    const run = (await t.query(api.live.getRun, { runId: runId! }))!;
    const r = await t.action(internal.near.deadline.reclaim, { escrowId: run.run.escrowId!, runId: runId! });
    console.log("PROBE D", JSON.stringify(r), tp.payouts.length);
    expect(r.ok).toBe(true);
  });
});
```
