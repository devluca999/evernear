# Morning

Status, Nov 5 2026: everything is on `main` at https://github.com/Everstock-Inc/evernear (private, CI green). 129 tests pass; typecheck, lint, check:ip and `next build` are green. `DEMO_MODE=1 npm run demo` works from a fresh clone with no keys. No live testnet call has run yet: that is the next step and needs your keys.

## 1. Links

- Repo: https://github.com/Everstock-Inc/evernear (private).
- Local demo: `DEMO_MODE=1 npm run demo`, then http://localhost:3000 (`?scene=7` jumps to a scene, `?mode=light` for light).
- Vercel: blocked. The only team the connector sees is uhome corp, on Hobby, and Hobby cannot link a private repo owned by an organisation (`repo_owned_by_org`). The offered fix is Pro, which costs money, so it is parked (item 2).

## 2. Keys and accounts needed, in order

1. **OutLayer testnet wallet**: `node scripts/rehearse-testnet.mjs`. It writes `OUTLAYER_API_KEY`, `OUTLAYER_WALLET_ID`, `OUTLAYER_NEAR_ACCOUNT` and `OUTLAYER_PAYMENT_KEY` to `.env.local` and never prints a key. Then set the owner policy at app.outlayer.ai/wallet (testnet toggle). The trial's 7 days start at registration.
2. **Vercel**: pick one. (a) Make the repo public after `npm run check:ip`, then the Hobby team can link it. (b) A Pro team (money, your call). (c) `npx vercel login`, then `npx vercel deploy` from the local folder with `DEMO_MODE=1`, no Git link.
3. **NEAR testnet accounts** for you and Jordy, with keys in a wallet that signs NEP-413 on a phone. Put yours in `OUTLAYER_OWNER_ACCOUNT`.
4. **Supplier stand-ins**: two testnet accounts for Ultra Motion and Haoyun, plus a demo mailbox (`REHEARSE_*` in `.env.example`).
5. **usdc.fakes.testnet tokens**: how to get them is not documented. Ask OutLayer.
6. **NEAR AI Cloud key** from cloud.near.ai: `NEARAI_API_KEY` in `.env.local` and the Convex env.
7. **Convex cloud deployment** (your login): `npx convex dev`. Webhooks need its public URL.
8. **Telegram bot**: token from @BotFather as `TELEGRAM_BOT_TOKEN`, a random `TELEGRAM_WEBHOOK_SECRET`, your chat id as `TELEGRAM_BUYER_CHAT_ID`, all in the Convex env.
9. **Inbound email** provider, `INBOUND_EMAIL_SECRET` and `DEMO_EMAIL_DOMAIN` in the Convex env.
10. **Gmail on OutLayer**: a dedicated demo Gmail at app.outlayer.ai/connect/gmail (testnet), policy `recipients` set to the supplier mailboxes.
11. **Rust** with `wasm32-wasip2` to build `worker/dock-check`, then `outlayer login testnet` to deploy it; its sha256 goes in `DOCK_CHECK_WASM_SHA256`.
12. **Funded mainnet wallet** for the finale, later, and only with your explicit yes.

Then: `RECORD=1 npm run rehearse` writes real proofs to `fixtures/recorded/`, which replace the synthetic ones on screen.

## 3. Decisions settled with you

- Convex holds Astro's capped agent key; the README says so plainly.
- After a partial release, a held part Astro never reclaimed is refunded at the deadline (`convex/escrows.ts`, `tests/escrows.test.ts`). Only a release of the whole amount cancels the refund.
- A throwaway testnet wallet registration is fine.

## 4. Open design questions

Full detail: `docs/NOTES.md` section 10.

1. **Finale payout**: payment checks break "three exits only" (mainnet only, bypass the whitelist, the claimer picks the amount, expiry never refunds). Recommended: a whitelisted `intents/transfer` instead.
2. **Finale on Haoyun's chain**: bridge minimums may refuse $3.42 cross-chain. Fallback: settle on NEAR, labelled.
3. **Whitelist inside `ft_transfer`**: unverified whether the policy checks the recipient. First testnet test to run.
4. **Huaxin's 3 failing lines**: the connector failure sits on a separate "Encoder harness" line. Change it if you meant otherwise.

## 5. Not done

- Live testnet calls and real proofs (keys, section 2).
- Panels replay the scenario; they are not yet driven by live Convex queries.
- Rust worker not built (no toolchain).
- Figures: in the exploded view the robot's arms read small and far from the body.
