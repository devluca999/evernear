# Morning

Status, Nov 5 2026: everything is on `main` at https://github.com/devluca999/evernear (private, CI green). 129 tests pass; typecheck, lint, check:ip and `next build` are green. `DEMO_MODE=1 npm run demo` works from a fresh clone with no keys. No live testnet call has run yet: that is the next step and needs your keys.

## 1. Links

- Repo: https://github.com/devluca999/evernear (private).
- Local demo: `DEMO_MODE=1 npm run demo`, then http://localhost:3000 (`?scene=7` jumps to a scene, `?mode=light` for light).
- Demo: https://evernear-psi.vercel.app (public; Vercel project `evernear` in the uhome corp team, `DEMO_MODE=1`, no secrets; every push to `main` deploys). `evernear.vercel.app` is someone else's app.

## 2. Keys and accounts needed, in order

1. **OutLayer testnet wallet**: `node scripts/rehearse-testnet.mjs`. It writes `OUTLAYER_API_KEY`, `OUTLAYER_WALLET_ID`, `OUTLAYER_NEAR_ACCOUNT` and `OUTLAYER_PAYMENT_KEY` to `.env.local` and never prints a key. Then set the owner policy at app.outlayer.ai/wallet (testnet toggle). The trial's 7 days start at registration.
2. **Vercel**: done. Commits in this repo are authored as `devluca999` (GitHub no-reply), so Hobby accepts them. If the demo should not be public yet, turn on protection for production in the project settings.
3. **NEAR testnet accounts** for you and Jordy, with keys in a wallet that signs NEP-413 on a phone. Put yours in `OUTLAYER_OWNER_ACCOUNT`. The faucet funds a new one with test NEAR: `near account create-account sponsor-by-faucet-service <name>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create` (needs `npm i -g near-cli-rs`). Then send 1 test NEAR to Astro's wallet for gas (NOTES 13).
4. **Supplier stand-ins**: two testnet accounts for Ultra Motion and Haoyun, plus a demo mailbox (`REHEARSE_*` in `.env.example`).
5. **usdc.fakes.testnet tokens**: how to get them is not documented. Ask OutLayer.
6. **NEAR AI Cloud key** from cloud.near.ai: `NEARAI_API_KEY` in `.env.local` and the Convex env.
7. **Convex cloud deployment** (your login): `npx convex dev`. Webhooks need its public URL.
8. **Telegram bot**: token from @BotFather as `TELEGRAM_BOT_TOKEN`, a random `TELEGRAM_WEBHOOK_SECRET`, your chat id as `TELEGRAM_BUYER_CHAT_ID`, all in the Convex env.
9. **Inbound email** provider, `INBOUND_EMAIL_SECRET` and `DEMO_EMAIL_DOMAIN` in the Convex env.
10. **Gmail on OutLayer**: a dedicated demo Gmail at app.outlayer.ai/connect/gmail (testnet), policy `recipients` set to the supplier mailboxes.
11. **Rust**: installed (rustc 1.99.1, wasm32-wasip2). `cargo test` passes (2 tests, shared vectors) and the release build is `1ba889c6...cb990`, 136 KB, now in `.env.local` as `DOCK_CHECK_WASM_SHA256`. Left: `outlayer login testnet` and deploy, then use the hash OutLayer reports.
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
- Figures: in the exploded view the robot's arms read small and far from the body.

## 6. Tidepool (testnet Agent API, community-run, not affiliated with NEAR)

- **Key**: `AGENT_API_KEY` in `.env.local` (from `POST /v1/keys`, no account). 25 agents per key in total, never deleted.
- **Astro's owner**: a dedicated implicit testnet account made for this, never a founder wallet: `e6c1d43a7d90094dbeabf630c06687f0b1c24cea68830ae4123c3b5df014616b`. Its key is `AGENT_OWNER_PRIVATE_KEY_PKCS8` in `.env.local` only. Back it up somewhere private: losing it means the PO accounts can no longer be frozen or changed.
- **Node 24** is now required (the SDK). CI and Vercel are switched. Locally: Node 24.22.2 is installed in `~/.local/opt/node24` (checksum verified), beside the old Node 22 in `~/.local/opt/node`. To make it the default, put `export PATH="$HOME/.local/opt/node24/bin:$PATH"` in `~/.zshrc`. Tests, typecheck and `check:ip` pass on it.
- Tidepool's own end-to-end check passed 18 of 18, including a Base Sepolia withdraw.
