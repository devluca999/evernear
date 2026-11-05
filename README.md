# Evernear

Evernear is an agent that sources a scarce part, checks it fits, negotiates, locks the money and pays the supplier only for what arrived, on NEAR. The buyer's money stays in the buyer's own wallet the whole time; Evernear never holds funds.

> **Status, Nov 5 2026.** Rehearsed on testnet, final payout live on mainnet: that is the target, and it has **not happened yet**. Every proof on screen today is a synthetic placeholder from [`fixtures/synthetic/`](fixtures/synthetic/proofs.json), labelled "synthetic" in the UI ([test](components/__tests__/workspace.test.tsx)). Real recordings replace them before submission.

## Run it

| Mode | Needs | Command |
| --- | --- | --- |
| Demo | Nothing | `npm ci && DEMO_MODE=1 npm run demo`, then open `http://localhost:3000` (`?scene=7` jumps to a scene, `?mode=light` for light) |
| Testnet | OutLayer testnet key, NEAR AI key, Convex | copy `.env.example` to `.env.local`, fill it in, `npx convex dev`, `npm run dev` |
| Finale | Testnet plus a funded mainnet wallet, and `FINALE_ENABLED=1` | recorded once for the video; refused otherwise ([guard](convex/near/payout.ts), [test](tests/near/adapters.test.ts)) |

Checks: `npm run typecheck && npm run lint && npm test && npm run check:ip`.

## The story

Astro Robotics, a robot maker in Chicago, cannot get the actuator motor for its 10MA. Its usual supplier is out for 6 weeks. Evernear scans four alternatives against the 10MA's bill of materials, gets two approvals, negotiates a price change down to the buyer's limit, locks $38,000 for PO 1042, checks that 1,800 of 2,000 motors arrived and releases $34,200, holding $3,800.

## What each scene does

| # | Scene | NEAR call | File | Test |
| --- | --- | --- | --- | --- |
| 0 | Onboarding | OutLayer custody `POST /register`, owner policy with whitelist and cap | [custody.ts](convex/near/custody.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "custody" |
| 1 | Bottleneck | none | [scenarios/demand.ts](scenarios/demand.ts) | [channels.test.ts](tests/channels.test.ts) "demand simulator" |
| 2 | Routine reorder | custody `POST /wallet/v1/call` `ft_transfer`, no human step | [custody.ts](convex/near/custody.ts), [policy.ts](engine/policy.ts) | [engine.test.ts](engine/__tests__/engine.test.ts) "approvals", [runner.test.ts](scenario/__tests__/runner.test.ts) "routine reorder" |
| 3 | Sourcing and fitment | NEAR AI Cloud private inference with attestation | [inference.ts](convex/near/inference.ts), [plain.ts](engine/plain.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "private inference", [engine.test.ts](engine/__tests__/engine.test.ts) "fitment" |
| 4 | Approval | custody approvals `POST /wallet/v1/approve/{id}` | [approval.ts](convex/near/approval.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "approvals", [engine.test.ts](engine/__tests__/engine.test.ts) "approvals" |
| 5 | Negotiation | OutLayer Gmail connector `send`, allowlisted | [gmail.ts](convex/near/gmail.ts), [suppliers.ts](scenarios/suppliers.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "gmail connector", [channels.test.ts](tests/channels.test.ts) "supplier simulator" |
| 6 | Funds locked | sub-agent wallet per PO, whitelisted to Haoyun and Astro | [escrow.ts](convex/near/escrow.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "escrow" |
| 7 | Dock | OutLayer worker, attested over code, input and output | [dockcheck.ts](convex/near/dockcheck.ts), [worker/dock-check](worker/dock-check/src/lib.rs) | [dockcheck.test.ts](tests/dockcheck.test.ts) |
| 8 | Paid | release from the PO wallet; finale as an OutLayer payment check through NEAR Intents | [escrow.ts](convex/near/escrow.ts), [payout.ts](convex/near/payout.ts) | [adapters.test.ts](tests/near/adapters.test.ts) "escrow", "finale payout" |
| 9 | End card | none | [Workspace.tsx](components/workspace/Workspace.tsx) | [workspace.test.tsx](components/__tests__/workspace.test.tsx) "ends on the end card" |

## Acceptance checks

| Check | Test |
| --- | --- |
| Routine reorder under the cap pays with no human step | [engine.test.ts](engine/__tests__/engine.test.ts), [runner.test.ts](scenario/__tests__/runner.test.ts) |
| Fitment: Kansai fails on shaft, Rheinwerk on policy, Huaxin on exactly 3 lines, Haoyun passes | [engine.test.ts](engine/__tests__/engine.test.ts) "fitment" |
| No plain-text BOM or supplier list in any outbound call except to private inference | [adapters.test.ts](tests/near/adapters.test.ts) "no leak" |
| The $38K order cannot lock funds before 2 approvals | [engine.test.ts](engine/__tests__/engine.test.ts), [stages.test.ts](scenario/__tests__/stages.test.ts) |
| Price limit: +8% stops, +2.5% passes, +4% would not | [engine.test.ts](engine/__tests__/engine.test.ts) "price limit" |
| Off-list email is refused | [adapters.test.ts](tests/near/adapters.test.ts) "gmail connector" |
| 1,800 of 2,000 releases exactly $34,200 and holds $3,800 | [engine.test.ts](engine/__tests__/engine.test.ts) "short shipment", [dockcheck.test.ts](tests/dockcheck.test.ts) |
| A release to any address but Haoyun's or Astro's is refused | [engine.test.ts](engine/__tests__/engine.test.ts) "three exits", [adapters.test.ts](tests/near/adapters.test.ts) "escrow" |
| No release by the deadline refunds Astro | [engine.test.ts](engine/__tests__/engine.test.ts), [adapters.test.ts](tests/near/adapters.test.ts) |
| A release not from the approved dock-check build is refused | [dockcheck.test.ts](tests/dockcheck.test.ts) |
| A Telegram message shows on the virtual phone within 1 s | [channels.test.ts](tests/channels.test.ts) "Telegram Stockbot" |
| `DEMO_MODE=1 npm run demo` runs from a clean clone with no keys | `node scripts/demo.mjs --check` ([demo.mjs](scripts/demo.mjs)) |

The adapter tests run against a recording mock of `fetch`. They prove the requests we send and how we handle the answers; they do not prove the live services behave as documented. That is what the testnet rehearsal is for.

## What is simulated

Only Astro and the people around it: Astro Robotics itself ([seed/astro.ts](seed/astro.ts)), its customers ([scenarios/demand.ts](scenarios/demand.ts)) and its suppliers ([scenarios/suppliers.ts](scenarios/suppliers.ts)). Supplier replies go through the real inbound email path ([convex/channels/email.ts](convex/channels/email.ts)). The negotiation is not canned: Haoyun's simulator sends the +2.5% revision only if the agent's counter stayed within the 3% limit ([test](tests/channels.test.ts)).

## The reference engine

Everstock's production engine is private. Evernear ships a deliberately plain reference engine in [`engine/`](engine/): fitment is exact spec equality per BOM line, receipt matching is received quantity times unit price with the rest held, and replies sort into quoted, confirmed and price change. Amounts, thresholds and releases are computed in code only; models read documents and draft messages, nothing more ([tests](engine/__tests__/engine.test.ts)).

## The honest limit

The owner can always change the policy or withdraw. The per-PO escrow is a visible, rule-bound commitment to the supplier, not a lock the supplier can enforce ([escrow.ts](convex/near/escrow.ts)).

## Credits

Map outlines from [Natural Earth](https://www.naturalearthdata.com/) 1:50m via [world-atlas](https://github.com/topojson/world-atlas) (public domain), projected with [d3-geo](https://github.com/d3/d3-geo) at build time by [scripts/build-map.mjs](scripts/build-map.mjs) ([test](components/__tests__/map.test.ts)).

Figures drawn with [Anatomy](https://github.com/wheresryan22/anatomy) by Ryan, MIT ([vendor/anatomy](vendor/anatomy/LICENSE)).

License: MIT.
