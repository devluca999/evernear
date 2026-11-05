# Morning

Status, Nov 5 2026: everything is on `main` at https://github.com/devluca999/evernear (private). 153 tests pass; typecheck, lint and check:ip are green. `DEMO_MODE=1 npm run demo` works from a fresh clone with no keys. The per-PO escrow and payout now run on the NEAR Intents Agent API through Tidepool (testnet, 1:1,000), and have run live once end to end through Convex (section 6). The other live calls (OutLayer approvals, Gmail, NEAR AI, dock check) still need your keys.

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
12. **Mainnet**: optional and later. It is only a switch of `AGENT_API_BASE_URL`, and only with your explicit yes. Nothing needs funding now.

Then: `RECORD=1 npm run rehearse` writes real proofs to `fixtures/recorded/`, which replace the synthetic ones on screen.

## 3. Decisions settled with you

- Convex holds Astro's capped agent key; the README says so plainly.
- After a partial release, a held part Astro never reclaimed is refunded at the deadline (`convex/near/deadline.ts`, `tests/deadline.test.ts`). Only a release of the whole amount cancels the refund.
- Escrow and payout on Tidepool at 1:1,000; the escrow is called a commitment, not a lock, on screen ("Committed"), in the README and in `docs/VIDEO.md` (Nov 5).
- A throwaway testnet wallet registration is fine.

## 4. Open design questions

Full detail: `docs/NOTES.md` section 10.

1. **Approvals now gate an OutLayer request that moves no PO money.** The two approvals still sign an OutLayer pending request (Astro's wallet into a PO sub-wallet, fake USDC), and only then does the rehearsal commit on Tidepool. It works, but the approved request is no longer the money that moves. Options: keep it as the approval artefact, or have the approvers sign a NEP-413 vote that Convex verifies. My pick: keep it until the demo is recorded, then decide.
2. **Convex holds Astro's testnet owner key** to sign each PO account's policy (README, honest limit). In production Astro's wallet would sign at approval time.
3. **Whitelist inside `ft_transfer`**: unverified whether the policy checks the recipient. First testnet test to run.
4. **Huaxin's 3 failing lines**: the connector failure sits on a separate "Encoder harness" line. Change it if you meant otherwise.

## 5. Not done

- Real recorded proofs: `RECORD=1 npm run rehearse` needs the approvals (section 2), so the escrow proofs on screen are still synthetic. The live run's proofs are in the local Convex `proofs` table.
- Panels replay the scenario; they are not yet driven by live Convex queries.
- Figures: in the exploded view the robot's arms read small and far from the body.

## 6. Tidepool (testnet Agent API, community-run, not affiliated with NEAR)

- **Key**: `AGENT_API_KEY` in `.env.local` (from `POST /v1/keys`, no account). 25 agents per key in total, never deleted.
- **Astro's owner**: a dedicated implicit testnet account made for this, never a founder wallet: `e6c1d43a7d90094dbeabf630c06687f0b1c24cea68830ae4123c3b5df014616b`. Its key is `AGENT_OWNER_PRIVATE_KEY_PKCS8` in `.env.local` only. Back it up somewhere private: losing it means the PO accounts can no longer be frozen or changed.
- **Node 24** is now required (the SDK). CI and Vercel are switched. Locally: Node 24.22.2 is installed in `~/.local/opt/node24` (checksum verified), beside the old Node 22 in `~/.local/opt/node`. To make it the default, put `export PATH="$HOME/.local/opt/node24/bin:$PATH"` in `~/.zshrc`. Tests, typecheck and `check:ip` pass on it.
- Tidepool's own end-to-end check passed 18 of 18, including a Base Sepolia withdraw.
- **Astro's treasury** agent `agent_bd29fdad161bb80b3b07599c` (`AGENT_TREASURY_ID`): it funds each PO account and takes the held part back. It tops itself up from the faucet (one drip an hour) and swaps into Base USDC.
- **Haoyun's Base Sepolia address**: `0x2003975a521c6fa45238dbc402c9e4adcb8863e0` (seed). Its demo key is `HAOYUN_BASE_PRIVATE_KEY` in `.env.local` only.
- **PO account pool**: `agent_fe8606f9c6dc60f3f1768ed9` is slot 1, registered in the local Convex `poAccounts` table. At most 4 accounts (`POOL_MAX`), reused for every run, so the hosted "Run scenario" button will not use up the 25 agents. Agents used so far: 2 of 25.
- **Live run through Convex, Nov 5** (local backend): $38.00 committed; a release to `0x...dead` refused in code and then refused live by the account's policy (`policy_destination_denied`); $34.20 to Haoyun, Base Sepolia tx `0xa1ca4983cccd01c2f40f3565c453ebb44668...` (sepolia.basescan.org); the deadline job refunded the held $3.80 to Astro. Each step wrote a proof row with its explorer link.
- **For a cloud Convex deployment**: set `AGENT_API_BASE_URL`, `AGENT_API_KEY`, `AGENT_OWNER_ACCOUNT_ID`, `AGENT_OWNER_PUBLIC_KEY`, `AGENT_OWNER_PRIVATE_KEY_PKCS8` and `AGENT_TREASURY_ID` in its env, then register the pool slot again (`npx convex run near/escrowState:addAccount`).
