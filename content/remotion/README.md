# EverNEAR videos (Remotion)

Data-driven demo videos for the PO 1042 story: an AI procurement agent orders actuator motors from Haoyun Precision, two people sign the exact terms, the money waits in a per-order wallet, and only what arrived is paid.

This folder is self-contained: its own `package.json`, `node_modules` and lint setup. The root app does not depend on it. The root `tsconfig.json`, `vitest.config.mts` and `eslint.config.mjs` exclude `content/` so the Next build, root tests and root lint never see it.

## Compositions

| Id | Size | Length | What it is |
|---|---|---|---|
| `JudgeCut` | 1920x1080 | 89 s | Full story for judges: hook, PO, approval gate (refused with one signature, then two), wallet, simulated milestones, advance receipt, dock count, balance receipt, returned receipt, grant-layer refusal, trust boundaries and what remains simulated, end card |
| `ShortShipment` | 1080x1920 | 39 s | Social cut of the same story. Payoff: "Your AI can execute the purchase. The payment rules still protect your money." |
| `ApprovalGate` | 1080x1920 | 30 s | "We gave an AI a $63,000 purchasing decision. Here's what it couldn't do." |
| `PromoSquare` | 1080x1080 still | | Promo image |
| `JudgeCutThumb`, `ShortShipmentThumb`, `ApprovalGateThumb` | stills | | Thumbnails |

(The dollar figure in the `ApprovalGate` title is computed, like every other figure.)

Reusable components in `src/components/`: `PurchaseOrder`, `AgentDecision`, `ApprovalGate`, `EscrowWallet`, `ShipmentMilestones`, `PayoutComparison`, `SecurityRefusal`, `TransactionReceipt`, `TrustBoundary`, `ExplainerDiagram`.

## Run

```bash
cd content/remotion
npm install
npm run dev          # Remotion Studio
npm test             # amounts and doc facts (node --test)
npm run typecheck
npm run stills       # out/*.png
npm run render:judge # out/JudgeCut.mp4 (h264)
npm run render:short # out/ShortShipment.mp4
npm run render:approval
```

If renders time out with `Waiting for root component to load`, the downloaded `chrome-headless-shell` is not painting on this machine (seen on macOS here). Point Remotion at an installed Chrome instead; `remotion.config.ts` reads this variable:

```bash
export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Where the numbers come from

Nothing on screen is typed into a scene. `src/data.ts` imports the repo's own files at build time:

| Source | Used for |
|---|---|
| `seed/astro.ts` | PO number, quantity, unit price ($1,260 = 126000 cents), received quantity, first quote, price ceiling, people (Luca, Jordan Bennett), supplier name and address |
| `policy/astro.json` | approvals required, auto-approve limit, advance percent, which signals unlock advance and balance |
| `engine/money.ts` | testnet scale (1:1,000) |
| `docs/hackathon/payment-proofs.json` | the only source of tx hashes, explorer URLs, senders, recipients, recorded testnet amounts, the simulated signal records and the refusal records |
| `docs/hackathon/ENFORCEMENT-MATRIX.md`, `TRUST-MODEL.md` | refusal codes and layers, trust boundaries (quoted in `src/data.ts`; `test/facts.spec.mjs` fails if the docs stop saying so) |

Amounts are computed in integer cents by `src/amounts.ts` (`computeSettlement`): total = qty x unit, advance = total x advance% (refused if not whole cents), balance = received x unit - advance, returned = total - paid. `test/amounts.spec.mjs` checks the result against `reconciliation` in `payment-proofs.json` (63.00 / 18.90 / 36.54 / 7.56 test USDC).

Every composition takes one prop, `receivedQty` (default `null` = seed value). Change it in Studio or with `--props='{"receivedQty":40}'` and every amount, caption and comparison is recomputed. Receipts keep showing the recorded run and say so: "Recorded run differs from computed 31.50".

## What is real, what is simulated

- **Real, verified on testnet** (per `payment-proofs.json`): the commit and the returned part on NEAR testnet, the advance and the balance on Base Sepolia. Receipts show full hashes and explorer URLs as text, wrapped, never cropped.
- **Wallet**: a NEAR Intents Agent API account on Tidepool, a community-run testnet, not NEAR infrastructure. Its destination policy is enforced by Tidepool's server, not on chain.
- **Refusal scene**: the recorded gate-path withdraw to `0x...dead` was refused at the **grant** layer (`grant_invalid`, the server holds no grant). The destination allowlist refusal (`policy_destination_denied`) happened on a different, Nov 5 server-path account and is only mentioned as a separate event.
- **Approvals**: `not_enough_approvals` comes from the test suite (`tests/commitAuthorization.test.ts`). The matrix says commit approval has not yet been run against the live deployment; the scene says so.
- **Simulated**: carrier, customs and dock-count signals (tagged "Simulated feed" on screen), the company, supplier and people, and the amounts (testnet at 1:1,000).
- No explorer screenshots, no invented success screens.
