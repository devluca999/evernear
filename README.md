# Evernear

Evernear is an agent that sources a scarce part, checks it fits, negotiates, commits the money and pays the supplier only for what arrived, on NEAR. The buyer's money stays in the buyer's own wallet the whole time; Evernear never holds funds.

> **Status, Nov 5 2026.** Every NEAR call runs on testnet. The per-PO escrow and the payout run on [Tidepool](#tidepool), a community-run testnet of the NEAR Intents Agent API, at 1:1,000 of the story amounts; they have run live once through Convex (`docs/NOTES.md` section 14). Every proof on screen today is a synthetic placeholder from [`fixtures/synthetic/`](fixtures/synthetic/proofs.json), labelled "synthetic" in the UI ([test](components/__tests__/workspace.test.tsx)). Real recordings replace them before submission.

## Run it

| Mode | Needs | Command |
| --- | --- | --- |
| Demo | Nothing | `npm ci && DEMO_MODE=1 npm run demo`, then open `http://localhost:3000` (`?scene=7` jumps to a scene, `?mode=light` for light) |
| Testnet | OutLayer testnet key, NEAR AI key, a Tidepool key with Astro's testnet owner and treasury, Convex | copy `.env.example` to `.env.local`, fill it in, `npx convex dev`, `npm run dev` |
| Rehearsal | Testnet keys plus the `REHEARSE_*` accounts in [steps.ts](scripts/rehearse/steps.ts) | `RECORD=1 npm run rehearse` runs the scenes on testnet and writes real proofs to `fixtures/recorded/`; refuses missing keys and any mainnet host, and commits nothing before both approvals ([test](tests/record.test.ts) "rehearsal") |

Checks: `npm run typecheck && npm run lint && npm test && npm run check:ip`.

## The story

Astro Robotics, a robot maker in Chicago, cannot get the actuator motor for its 10MA. Its usual supplier is out for 6 weeks. Evernear scans four alternatives against the 10MA's bill of materials, gets two approvals, negotiates a price change down to the buyer's limit, commits $38,000 for PO 1042, checks that 1,800 of 2,000 motors arrived and releases $34,200, holding $3,800.

## What each scene does

| # | Scene | NEAR call | File | Test |
| --- | --- | --- | --- | --- |
| 0 | Onboarding | OutLayer custody `POST /register`, owner policy with whitelist and cap | [custody.ts](convex/near/custody.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "custody" |
| 1 | Bottleneck | none | [scenarios/demand.ts](scenarios/demand.ts) | [channels.test.ts](tests/channels.test.ts) "demand simulator" |
| 2 | Routine reorder | custody `POST /wallet/v1/call` `ft_transfer`, no human step | [custody.ts](convex/near/custody.ts), [policy.ts](engine/policy.ts) | [engine.test.ts](engine/__tests__/engine.test.ts) "approvals", [runner.test.ts](scenario/__tests__/runner.test.ts) "routine reorder" |
| 3 | Sourcing and fitment | NEAR AI Cloud private inference with attestation | [inference.ts](convex/near/inference.ts), [plain.ts](engine/plain.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "private inference", [engine.test.ts](engine/__tests__/engine.test.ts) "fitment" |
| 4 | Approval | custody approvals `POST /wallet/v1/approve/{id}` | [approval.ts](convex/near/approval.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "approvals", [engine.test.ts](engine/__tests__/engine.test.ts) "approvals" |
| 5 | Negotiation | OutLayer Gmail connector `send`, allowlisted | [gmail.ts](convex/near/gmail.ts), [suppliers.ts](scenarios/suppliers.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "gmail connector", [channels.test.ts](tests/channels.test.ts) "supplier simulator" |
| 6 | Funds committed | one Agent API account per PO on Tidepool: policy `destinations: only` [withdraw to Haoyun on Base Sepolia, transfer to Astro], per transaction at most the PO amount; Astro's treasury transfers $38.00 (1:1,000) in | [escrow.ts](convex/near/escrow.ts), [agentapi.ts](convex/near/agentapi.ts), [deadline.ts](convex/near/deadline.ts) | [escrow.test.ts](tests/near/escrow.test.ts) "EscrowAdapter on the Agent API", [deadline.test.ts](tests/deadline.test.ts) |
| 7 | Dock | OutLayer worker, attested over code, input and output | [dockcheck.ts](convex/near/dockcheck.ts), [worker/dock-check](worker/dock-check/src/lib.rs) | [dockcheck.test.ts](tests/dockcheck.test.ts) |
| 8 | Paid | Agent API withdraw of $34.20 to Haoyun on Base Sepolia, $3.80 back to Astro; a withdraw to a wrong address refused live by the account's policy | [escrow.ts](convex/near/escrow.ts), [deadline.ts](convex/near/deadline.ts) | [escrow.test.ts](tests/near/escrow.test.ts), [deadline.test.ts](tests/deadline.test.ts) |
| 9 | End card | none | [Workspace.tsx](components/workspace/Workspace.tsx) | [workspace.test.tsx](components/__tests__/workspace.test.tsx) "ends on the end card" |

## Acceptance checks

| Check | Test |
| --- | --- |
| Routine reorder under the cap pays with no human step | [engine.test.ts](engine/__tests__/engine.test.ts), [runner.test.ts](scenario/__tests__/runner.test.ts) |
| Fitment: Kansai fails on shaft, Rheinwerk on policy, Huaxin on exactly 3 lines, Haoyun passes | [engine.test.ts](engine/__tests__/engine.test.ts) "fitment" |
| No plain-text BOM or supplier list in any outbound call except to private inference | [adapters.test.ts](tests/near/adapters.test.ts) "no leak" |
| The $38K order cannot commit funds before 2 approvals | [engine.test.ts](engine/__tests__/engine.test.ts), [stages.test.ts](scenario/__tests__/stages.test.ts), [record.test.ts](tests/record.test.ts) "rehearsal" |
| Price limit: +8% stops, +2.5% passes, +4% would not | [engine.test.ts](engine/__tests__/engine.test.ts) "price limit" |
| Off-list email is refused | [adapters.test.ts](tests/near/adapters.test.ts) "gmail connector" |
| 1,800 of 2,000 releases exactly $34,200 and holds $3,800; on testnet exactly $34.20 reaches Haoyun on Base Sepolia and $3.80 goes back to Astro | [engine.test.ts](engine/__tests__/engine.test.ts) "short shipment", [dockcheck.test.ts](tests/dockcheck.test.ts), [escrow.test.ts](tests/near/escrow.test.ts) "releases exactly $34.20" |
| A release to any address but Haoyun's or Astro's is refused twice: in code before any call, and live by the PO account's policy (`policy_destination_denied`), each with a proof row | [engine.test.ts](engine/__tests__/engine.test.ts) "three exits", [escrow.test.ts](tests/near/escrow.test.ts) "refuses a release", "second layer", [deadline.test.ts](tests/deadline.test.ts) "refuses a wrong address twice" |
| No release by the deadline refunds Astro, triggered by Evernear's Convex scheduler at the deadline, not by the chain ([deadline.ts](convex/near/deadline.ts)); after a partial release the held part Astro never reclaimed is refunded at the deadline; a release of the whole amount cancels it | [engine.test.ts](engine/__tests__/engine.test.ts), [escrow.test.ts](tests/near/escrow.test.ts), [deadline.test.ts](tests/deadline.test.ts) "commit and deadline refund" |
| The kill switch freezes a PO account: every later move is refused with `wallet_frozen` | [escrow.test.ts](tests/near/escrow.test.ts) "kill switch", [deadline.test.ts](tests/deadline.test.ts) "kill switch" |
| Every Agent API call writes a proof row with its tx hash and explorer link; refusals are proof rows too ([agentapi.ts](convex/near/agentapi.ts)) | [agentapi.test.ts](tests/near/agentapi.test.ts) "AgentApiClient" |
| No Agent API key or grant token is stored; only the grant's sha256 | [deadline.test.ts](tests/deadline.test.ts) "stores no token", [agentapi.test.ts](tests/near/agentapi.test.ts) "grant tokens" |
| The Agent API mainnet host is refused without Luca's yes | [agentapi.test.ts](tests/near/agentapi.test.ts) "agentApiBase" |
| A release not from the approved dock-check build is refused | [dockcheck.test.ts](tests/dockcheck.test.ts) |
| A Telegram message shows on the virtual phone within 1 s | [channels.test.ts](tests/channels.test.ts) "Telegram Stockbot" |
| A recorded proof in `fixtures/recorded/` replaces its synthetic placeholder and shows as "replay" with its real hash; the synthetic label stays on every proof with no recording ([proofs.ts](scenario/proofs.ts)) | [record.test.ts](tests/record.test.ts) "proofFor prefers a real recording" |
| Recorded proofs never contain an API key, payment key, check key or bot token ([recorder.ts](scripts/rehearse/recorder.ts)) | [record.test.ts](tests/record.test.ts) "secrets never reach disk" |
| `DEMO_MODE=1 npm run demo` runs from a clean clone with no keys | `node scripts/demo.mjs --check` ([demo.mjs](scripts/demo.mjs)) |

The adapter tests run against a recording mock of `fetch`, and the escrow tests against an in-memory stand-in for the Agent API ([fakeTidepool.ts](tests/near/fakeTidepool.ts)) that enforces the rules the live API showed; unit tests never create real agents. They prove the requests we send and how we handle the answers; they do not prove the live services behave as documented. That is what the testnet rehearsal is for.

## What is simulated

Only Astro and the people around it: Astro Robotics itself ([seed/astro.ts](seed/astro.ts)), its customers ([scenarios/demand.ts](scenarios/demand.ts)) its suppliers ([scenarios/suppliers.ts](scenarios/suppliers.ts)), and the shipment's checkpoints and photos ([scenario/shipment.ts](scenario/shipment.ts), [test](components/__tests__/tracking.test.tsx)). The photos are drawn stand-ins, labelled "synthetic photo" on screen. Supplier replies go through the real inbound email path ([convex/channels/email.ts](convex/channels/email.ts)). The negotiation is not canned: Haoyun's simulator sends the +2.5% revision only if the agent's counter stayed within the 3% limit ([test](tests/channels.test.ts)).

## The reference engine

Everstock's production engine is private. Evernear ships a deliberately plain reference engine in [`engine/`](engine/): fitment is exact spec equality per BOM line, receipt matching is received quantity times unit price with the rest held, and replies sort into quoted, confirmed and price change. Amounts, thresholds and releases are computed in code only; models read documents and draft messages, nothing more ([tests](engine/__tests__/engine.test.ts)).

## Tidepool

The per-PO escrow and the payout use the official [`@near-intents-agent-api/sdk`](https://github.com/NEAR-Intents-Agent-API/skills) against [Tidepool](https://www.usetidepool.tech), a community-run testnet of the NEAR Intents Agent API and 1Click. **Tidepool is not affiliated with NEAR.** It runs NEAR's Intents verifier on testnet, and its tokens have no value. The base URL comes from `AGENT_API_BASE_URL` ([agentapi.ts](convex/near/agentapi.ts)), so mainnet is a base URL switch; it is refused without Luca's explicit yes ([test](tests/near/agentapi.test.ts) "agentApiBase"). No real assets are sent to Tidepool.

The faucet drips 100 test USDC an hour, so the demo runs at 1:1,000: $38.00 committed, $34.20 paid, $3.80 back. The screen keeps the story amounts and labels the scale ([RulesPanel.tsx](components/workspace/panels/RulesPanel.tsx), [test](components/__tests__/design.test.tsx) "commitment at 1:1,000").

## The honest limit

**The escrow is a commitment, not a lock.** Each PO account's rules (pay only Haoyun on Base Sepolia or Astro, at most the PO amount) are enforced by Tidepool's server, not by the chain, and Astro as owner can sign a policy change or unfreeze at any time. It is a visible, rule-bound commitment to the supplier, not a lock the supplier can enforce ([escrow.ts](convex/near/escrow.ts)). The screen stamps it "Committed".

In this demo Evernear's Convex deployment holds Astro's dedicated testnet owner key (never a founder's wallet) to sign each PO account's policy, and Evernear's Agent API key; grant tokens are derived from that key at run time ([deadline.ts](convex/near/deadline.ts)). No key or token is written to the database, only each grant's sha256 ([test](tests/deadline.test.ts) "stores no token"), but whoever controls the deployment can sign what that owner key can sign. In production these owner intents go to Astro's own wallet for a signature at approval time; the Agent API's generate and submit split is built for that.

## Credits

Map outlines from [Natural Earth](https://www.naturalearthdata.com/) 1:50m via [world-atlas](https://github.com/topojson/world-atlas) (public domain), projected with [d3-geo](https://github.com/d3/d3-geo) at build time by [scripts/build-map.mjs](scripts/build-map.mjs) ([test](components/__tests__/map.test.ts)).

Figures drawn with [Anatomy](https://github.com/wheresryan22/anatomy) by Ryan, MIT ([vendor/anatomy](vendor/anatomy/LICENSE)).

License: MIT.
