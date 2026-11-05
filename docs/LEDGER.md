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
