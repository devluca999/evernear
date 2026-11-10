# Evernear: a guide for AI agents

This page is for an AI agent (Claude Code, Codex, Cursor or a judge's tool) that has been handed this repository and needs to understand it, check what the README says, or run it. Read this first, then [README.md](../README.md) for the full story and the claim-by-claim test table.

## In one paragraph

Evernear is a demo of an agent that sources a scarce part for Astro Robotics (a fictional robot maker), negotiates within Astro's rules, gets two human approvals, commits the money into a wallet made for that one order, and pays the supplier in two stages only on proof: an advance when the goods ship, and a balance for exactly what arrived (44 of 50 motors). The money for the 6 missing motors never leaves Astro. Escrow and payout run on the NEAR Intents Agent API through Tidepool, a community-run testnet (not affiliated with NEAR), at 1:1,000 of the story amounts. Private inference runs on NEAR AI Cloud, and the release gate runs as a WASI module in an OutLayer enclave on NEAR testnet.

All of the code was written during NEAR HACKATHON (Nov 1 to Nov 14, 2026); the first commit is dated Nov 5, 2026. The only code not written for the hackathon is third-party: npm dependencies and the MIT-licensed figure library in `vendor/anatomy`.

## Which parts decide what

| Layer | Where | What it does | Deterministic? |
| --- | --- | --- | --- |
| Engine | [`engine/`](../engine) | Fitment, price ceiling, approvals, the two-stage release amounts, the three allowed exits. Pure TypeScript, integer cents. | Yes. Every amount is computed here. |
| Policy | [`policy/astro.json`](../policy/astro.json) | Astro's rules as data: caps, the 5% urgent ceiling, approvals, the advance percentage. | Yes |
| Scenario | [`scenario/`](../scenario), [`scenarios/`](../scenarios), [`seed/`](../seed) | The story as a timeline of steps: scenes, camera, cursor, explainers, Short mode. The simulated people around Astro (customers, suppliers, tracking feed). | Yes |
| Backend | [`convex/`](../convex) | Convex functions: NEAR adapters in [`convex/near/`](../convex/near), inbound email and Telegram in [`convex/channels/`](../convex/channels), Live runs in [`convex/live.ts`](../convex/live.ts), the proofs table. | Calls real services |
| Workers | [`worker/release-gate`](../worker/release-gate/README.md), [`worker/dock-check`](../worker/dock-check/README.md) | Rust WASI modules for OutLayer. The release gate is the only thing holding the grant that can pay the supplier. | Yes, shares test vectors with the engine |
| UI | [`app/`](../app), [`components/workspace/`](../components/workspace) | The Next.js workspace, the developer drawer, the virtual phone, the `/present` remote. | Display only |
| Proofs | [`fixtures/recorded/`](../fixtures/recorded), [`fixtures/synthetic/`](../fixtures/synthetic) | Recorded real testnet calls, replayed in demo mode, and the placeholders still labelled "synthetic". | Data |

The rule throughout: models only read documents and draft messages. Amounts, thresholds and releases are computed in code. If you are checking a money figure, look in `engine/` and its tests, not in a prompt.

## Run it

Node 24 or newer is required (`package.json` `engines`; the Agent API SDK needs it).

### 1. Demo, no keys (start here)

```bash
npm ci
DEMO_MODE=1 npm run demo        # builds, then serves http://localhost:3000
```

No Convex deployment, no API keys and no network calls to NEAR are needed: the happy path replays the recorded testnet run in [`fixtures/recorded/live-run.json`](../fixtures/recorded/live-run.json) with its real hashes and explorer links. To check it starts without a browser: `node scripts/demo.mjs --check` (prints `demo check passed`).

Useful URLs:

| URL | What it opens |
| --- | --- |
| `/` | The workspace, chapter 1 |
| `/?scene=7` | Jump to a chapter |
| `/?mode=light` | Light theme |
| `/?mode=short` | Short mode: the happy path as 9 sections, played hands-free after one press of Play |
| `/present` | A remote for the presenter, opened in a second window of the same browser |

In the workspace, **Present** moves one step per Cmd+K (or right arrow) and waits at each approval; **Autoplay** plays a whole scenario. The demo panel switches between the happy path, the bad path (Evernear stops before money moves) and the adjusted bad path.

### 2. Checks

```bash
npm run typecheck
npm run lint
npm test                 # vitest: engine, scenario, adapters, components
npm run check:ip
```

The Rust workers have their own tests: `cargo test` inside `worker/release-gate` and `worker/dock-check` (needs a Rust toolchain with the `wasm32-wasip2` target for builds; tests run on the host target).

With the app running, `npm run check:frames -- --url http://localhost:3000/` walks every scenario in headless Chrome at 1920x1080 and checks that every zoom shows its card in full.

Unit tests never touch the network: adapters run against a recording mock of `fetch` ([`tests/near/mockFetch.ts`](../tests/near/mockFetch.ts)) and the escrow against an in-memory Tidepool ([`tests/near/fakeTidepool.ts`](../tests/near/fakeTidepool.ts)). They prove what Evernear sends and how it handles answers; the recorded testnet run is the evidence that the live services behave that way.

### 3. Testnet and Live (only if you have the keys)

Copy `.env.example` to `.env.local` and fill it in; every variable is described there. Then `npx convex dev` and `npm run dev`. Live mode also needs `LIVE_ENABLED=1` in the Convex environment (not in `.env.local`). A live run spends one Tidepool order wallet (25 per key, never deleted), so do not start one just to look around; the replay shows the same history.

`RECORD=1 npm run rehearse` runs the scenes on testnet and writes proofs to `fixtures/recorded/`. It refuses missing keys and any mainnet host.

## How to verify a claim

1. Find the claim in the README. Each row links its code and its test.
2. Run that test alone, for example `npx vitest run engine/__tests__/engine.test.ts -t "short shipment"`.
3. For an on-chain claim, open the explorer link: Base Sepolia payouts on sepolia.basescan.org, NEAR testnet transactions on testnet.nearblocks.io. The hashes are in `fixtures/recorded/live-run.json`.
4. Check the label. Anything shown as "synthetic" or "Synthetic placeholder, nothing sent" is not a real call, and the README's status note lists which steps those are. A proof only shows "replay" with an explorer button when it has a real transaction hash ([`scenario/proofs.ts`](../scenario/proofs.ts), [`scenario/liveLog.ts`](../scenario/liveLog.ts)).

## What is real and what is simulated

Real, on testnet: the per-order wallet and its policy, the commit, the advance and balance payouts (sent from the release gate in the enclave), the refused wrong-address payment, the return to Astro and the wallet closing.

Simulated, and labelled so on screen: Astro, its customers and suppliers, the shipment signals (bill of lading, customs, from a simulated tracking feed), and the steps before the money in the recorded run (private inference, the Gmail counter offer, the approvals). The dock-check worker is not deployed. The README's "The honest limit" section explains why the escrow is a commitment enforced by Tidepool's server rather than a lock enforced by the chain.

## Rules for an agent working in this repo

- **Testnet only.** Never call the Agent API mainnet host (`api.agentsonintents.com`); the code refuses it ([`tests/near/agentapi.test.ts`](../tests/near/agentapi.test.ts) "agentApiBase"). No real assets are sent to Tidepool.
- **Never commit secrets.** Real values live in `.env.local` (gitignored) or the Convex environment. Recorded proofs are scrubbed of keys ([`tests/record.test.ts`](../tests/record.test.ts) "secrets never reach disk").
- **Tests never create Tidepool agents.** Use the fakes in `tests/near/`.
- **Keep the README honest.** Every claim links its file and its test; a claim without a test is removed.
- **Next.js here may differ from your training data.** Check `node_modules/next/dist/docs/` before changing app code (see [AGENTS.md](../AGENTS.md)). For Convex code, read `convex/_generated/ai/guidelines.md` first.
