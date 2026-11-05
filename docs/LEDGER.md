# Ledger

Each batch: goal, status (todo, doing, done, blocked), commits, what was verified.

| # | Batch | Status | Commits | Verified |
| --- | --- | --- | --- | --- |
| 0 | Repo scaffold: Next.js 16, TS strict, Convex, Vitest, ESLint, CI, check:ip | done (local only, push blocked) | see git log | typecheck, lint, 4 tests, check:ip, `next build` |
| N | Learn: docs/NOTES.md | done | batch 4 commit | 9 services read; 9 contradictions listed in NOTES section 10 |
| H | Hosting: Vercel preview, Convex local | todo | | |
| 1 | Reference engine and seed data | done | 2e9c3de | 27 tests: fitment, approvals, price limit, short shipment, three exits, deadline refund |
| 2 | Stage machine and scenario runner | done | 0934cbb | 17 tests: guards, 8 s routine, approvals before lock, drawer 3 s, pulse, synthetic labels |
| 3 | Workspace UI | done | batch 3 commit | 9 UI tests (jsdom): camera corner, rail, max 3 panels, exact fitment text, dock figures, synthetic labels, end card; voice test over every scene; screenshots of scenes 3 to 7 in dark and light |
| 4 | NEAR adapters | done (mocks; live testnet rehearsal pending keys) | batch 4 commit | 21 adapter tests: testnet host guard, ft_transfer units, sub-wallet key derivation, approval message, escrow exits before any call, Gmail allowlist, attestation binding, mainnet gate, no-leak |
| 5 | Channels and simulators | done (local Convex) | batch 5 commit | 8 tests via convex-test: Telegram secret and DM-only, phone sync under 1 s and deduped, inbound email secret and reading, negotiation depends on the agent counter, demand reaches 14 for 6 |
| 6 | Attested dock check worker | partly done: Rust source and release gate written; wasm build blocked (no Rust toolchain), deploy needs Luca | batch 6 commit | 7 TS tests: engine matches shared vectors; release refused for wrong build, no approved build, forged output, wrong amount, other input. Rust tests written, not yet run |
| 7 | Anatomy figures | todo | | |
| 8 | README and checks | todo | | |
