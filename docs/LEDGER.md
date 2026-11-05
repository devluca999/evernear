# Ledger

Each batch: goal, status (todo, doing, done, blocked), commits, what was verified.

| # | Batch | Status | Commits | Verified |
| --- | --- | --- | --- | --- |
| 0 | Repo scaffold: Next.js 16, TS strict, Convex, Vitest, ESLint, CI, check:ip | done (local only, push blocked) | see git log | typecheck, lint, 4 tests, check:ip, `next build` |
| N | Learn: docs/NOTES.md | done | batch 4 commit | 9 services read; 9 contradictions listed in NOTES section 10 |
| H | Hosting: Vercel preview, Convex local | partly: Convex local anonymous backend works; Vercel blocked (no GitHub repo) | | `convex dev --once` deploys schema locally; convex-test suites pass |
| 1 | Reference engine and seed data | done | 2e9c3de | 27 tests: fitment, approvals, price limit, short shipment, three exits, deadline refund |
| 2 | Stage machine and scenario runner | done | 0934cbb | 17 tests: guards, 8 s routine, approvals before lock, drawer 3 s, pulse, synthetic labels |
| 3 | Workspace UI | done | batch 3 commit | 9 UI tests (jsdom): camera corner, rail, max 3 panels, exact fitment text, dock figures, synthetic labels, end card; voice test over every scene; screenshots of scenes 3 to 7 in dark and light |
| 4 | NEAR adapters | done (mocks; live testnet rehearsal pending keys) | batch 4 commit | 21 adapter tests: testnet host guard, ft_transfer units, sub-wallet key derivation, approval message, escrow exits before any call, Gmail allowlist, attestation binding, mainnet gate, no-leak |
| 5 | Channels and simulators | done (local Convex) | batch 5 commit | 8 tests via convex-test: Telegram secret and DM-only, phone sync under 1 s and deduped, inbound email secret and reading, negotiation depends on the agent counter, demand reaches 14 for 6 |
| 6 | Attested dock check worker | partly done: Rust source and release gate written; wasm build blocked (no Rust toolchain), deploy needs Luca | batch 6 commit | 7 TS tests: engine matches shared vectors; release refused for wrong build, no approved build, forged output, wrong amount, other input. Rust tests written, not yet run |
| 7 | Anatomy figures | done (first pass) | batch 7 commit | 3 tests: four motors marked, close-up rating, no fixed colours; screenshots in dark and light. Not yet run: the kit audit and 4x detail sweep |
| 8 | README and checks | done | batch 8 commit | README per section 9 with every claim linked; `demo --check` and 92 tests pass in a fresh clone |
| 9 | Record mode and deadline refund scheduler | done (mocks and convex-test; live rehearsal not run, needs keys and Luca) | fda4d66, 43d2e88, docs commit | 20 new tests (121 total): recorder keys and index, secrets never on disk, proofFor prefers recordings, rehearsal refuses missing env and mainnet and skips the payout, scheduled refund at the deadline, release cancels it, escrow key never stored. `convex dev --once` deploys the `escrows` table locally |
| 10 | Tidepool: per-PO escrow and payout through the NEAR Intents Agent API on testnet (design change from Luca, Nov 5) | done: steps 1 to 5. Agent API client (`convex/near/agentapi.ts`), escrow on it (`convex/near/escrow.ts`), Convex lifecycle and deadline job (`convex/near/deadline.ts`, `escrowState.ts`) with a pool of 4 reused PO accounts; payout.ts and the finale removed; UI stamps "Committed" with the 1:1,000 note; BUILD, CLAUDE, README, MORNING patched; `docs/VIDEO.md` started. Live once through Convex: commit, both refusals, $34.20 to Haoyun on Base Sepolia, deadline refund of $3.80 | 153 tests (fake Tidepool, no real agents), typecheck, lint, check:ip | NOTES section 14. Scale 1:1,000, decided with Luca. Open: approvals gate an OutLayer request that no longer moves the PO money (MORNING 4.1). The SDK uses `Buffer`, so the escrow actions run in Convex's Node runtime |
| 11 | Interactive workspace (Luca, Nov 5): pins, waits at human moments, sidebar, stats, Products, map planner | done: panels pin across scenes (up to 5); the demo waits for a click at start sourcing, both approvals, the 3% limit and the packing slip (`scenario/gates.ts`, "Waits for me" off or `?autoplay=1` for recording); collapsible sidebar opens components; stats bar; Products and BOM (scroll, specs, explode; sample BOMs for Kip and Porter); map shows every supplier HQ with an icon and plans an order with an arrival estimate that moves with the ship date; everNEAR wordmark | 181 tests, typecheck, lint, check:ip | Not done: a more robot-like 10MA figure (asked, scoped separately). Panels still replay the script, not live Convex data |

## Batch 10 audit: what touches the escrow, the payout, payment checks or the mainnet finale

Nothing below has changed yet. "Becomes" is the plan for step 3; the adapter interface the app calls stays.

| File | Today | Becomes |
| --- | --- | --- |
| `convex/near/escrow.ts` | `EscrowAdapter`: OutLayer sub-agent wallet per PO (`PUT /wallet/v1/api-key`), storage deposit, `ft_transfer` lock, release, reclaim, deadline refund; `escrowPolicy` whitelist | Same class shape, new implementation on the Agent API: `agent_create` per PO with a `destinations: only` policy [Haoyun on Base Sepolia, Astro], `per_transaction` = PO amount; fund; withdraw to Haoyun; transfer back to Astro; `agent_freeze` as kill switch. OutLayer version removed once the new path passes |
| `convex/near/payout.ts` | Mainnet OutLayer payment check, `FinaleGate`, `finaleAmounts` at 1:10,000 | Removed after the new path passes: the payout is the escrow withdraw on testnet. A mainnet payout is later, optional, a base-URL switch with Luca's yes |
| `convex/escrows.ts` | Lock, release and the scheduled deadline refund; derives the escrow key from `OUTLAYER_API_KEY` | Deadline job moves to `convex/near/deadline.ts`; lock and release call the new adapter; no derived key (the PO account is driven by the API key plus a grant token) |
| `convex/schema.ts` | `escrows` table with `escrowAccount`, `refundJobId` | Adds `agentId`, `grantTokenHash`, scale; never the grant token itself |
| `convex/near/http.ts` | `outlayerBase`, `MainnetRefused`, mainnet constants | Adds `agentApiBase()` from `AGENT_API_BASE_URL` (default Tidepool), refusing `api.agentsonintents.com` without Luca's yes. OutLayer parts stay (approvals, Gmail, dock check, custody) |
| `convex/near/custody.ts` | Astro's wallet, `payUsdc`, `createSubWallet`, `subWalletKey`, `registerStorage` | Stays for Astro's custody wallet; `createSubWallet`, `subWalletKey` and `registerStorage` removed if nothing else uses them |
| `engine/escrow.ts` | Three exits: release, reclaim, refund at deadline | Unchanged: still checked in code before every call |
| `engine/money.ts` | `FINALE_SCALE` 10,000, `scaleFinale` | `TESTNET_SCALE` 1,000 for amounts sent to Tidepool; finale scale removed |
| `scenario/scenes.ts`, `scenario/runner.ts`, `scenario/types.ts` | Proofs `escrow_wallet` (scene 6) and `intents_payout` (scene 8, mainnet) | Same scenes; proofs become the Agent API calls (create, fund, withdraw, refused withdraw, transfer back); payout proof on testnet |
| `components/workspace/panels/RulesPanel.tsx`, `MapPanel.tsx`, `Phone.tsx` | "Locked", "paid into escrow" | Stamp reads "Committed"; a note says the scale and that the owner could change the rules; amounts stay the story amounts |
| `fixtures/synthetic/proofs.json` | Synthetic `escrow_wallet`, `intents_payout` (mainnet) | Synthetic placeholders for the new proof keys, testnet, until recorded |
| `scripts/rehearse/steps.ts`, `recorder.ts`, `scripts/rehearse.ts` | Rehearsal opens an OutLayer sub-wallet; payout skipped as mainnet | Rehearsal runs the Agent API escrow on Tidepool from a small reused pool of PO accounts, including the payout |
| `scripts/rehearse-testnet.mjs` | Registers Astro's OutLayer wallet | Unchanged (custody, approvals) |
| `.env.example` | `FINALE_ENABLED` | Adds `AGENT_API_BASE_URL`, `AGENT_API_KEY`, the owner account id and the escrow pool; `FINALE_ENABLED` removed with `payout.ts` |
| `tests/near/adapters.test.ts` | escrow, finale payout, no-leak | escrow tests rewritten against a mocked SDK fetch; finale tests removed; no-leak covers the Agent API |
| `tests/escrows.test.ts` | Deadline refund through OutLayer calls | Same four behaviours against the new adapter |
| `tests/record.test.ts` | Maps `escrow.ts`, `payout.ts#claim` proofs | Maps the new proof keys |
| `engine/__tests__/engine.test.ts`, `scenario/__tests__/runner.test.ts` | Finale 1:10,000; story amounts | Testnet scale 1:1,000; story amounts unchanged |
| `README.md`, `docs/BUILD.md`, `CLAUDE.md`, `docs/MORNING.md` | OutLayer escrow, mainnet finale | Patched per step 5: Tidepool named as community-run, not affiliated with NEAR; mainnet is a base-URL switch |
| Node: `.nvmrc`, `package.json` engines, CI, Vercel | Node 22 | Node 24 (the SDK needs it) |
