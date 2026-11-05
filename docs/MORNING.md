# Morning

All 8 build batches ran. Everything is committed locally and **nothing is pushed**: Claude Code's permission check blocked creating the GitHub repo, so there is no remote, no CI run and no Vercel preview yet. 92 tests pass, and `DEMO_MODE=1 npm run demo` works from a fresh clone with no keys.

## 1. Links

- Local repo: `~/Documents/devluca999/everNEAR/evernear` (10 commits on `main`).
- Run the demo now: `cd ~/Documents/devluca999/everNEAR/evernear && DEMO_MODE=1 npm run demo`, then open http://localhost:3000 (`?scene=7` jumps to a scene, `?mode=light` for light).
- GitHub and Vercel: none yet. See item 1 below.

## 2. Keys and accounts needed

1. **GitHub repo** (blocked overnight by Claude Code's permission check). Run `gh repo create Everstock-Inc/evernear --private --source . --push` from the repo (or `devluca999/evernear` if the org refuses). This unblocks CI and Vercel.
2. **Vercel project** `evernear`: import the GitHub repo, set env `DEMO_MODE=1`, no secrets. Gives the phone link.
3. **OutLayer testnet wallet** (registration was blocked overnight): `node scripts/rehearse-testnet.mjs` registers and claims the trial key into `.env.local` (`OUTLAYER_API_KEY`, `OUTLAYER_WALLET_ID`, `OUTLAYER_NEAR_ACCOUNT`, `OUTLAYER_PAYMENT_KEY`). Then set the owner policy at app.outlayer.ai/wallet (testnet toggle). The trial's 7 days start at registration.
4. **NEAR testnet accounts** for you and Jordy, with full-access keys in a wallet that signs NEP-413 on a phone (approvers). Put yours in `OUTLAYER_OWNER_ACCOUNT`.
5. **usdc.fakes.testnet tokens**: how to get them is not documented. Ask OutLayer.
6. **NEAR AI Cloud key** from cloud.near.ai ($10 hackathon credits via NEAR Builders): `NEARAI_API_KEY` in `.env.local` and the Convex env.
7. **Convex deployment** (new team, your login): `npx convex dev`. The local anonymous backend works for tests, but webhooks need a cloud deployment with a public URL.
8. **Telegram bot**: token from @BotFather as `TELEGRAM_BOT_TOKEN`, a random `TELEGRAM_WEBHOOK_SECRET`, your chat id as `TELEGRAM_BUYER_CHAT_ID`. All three go in the Convex env.
9. **Inbound email** provider and `INBOUND_EMAIL_SECRET`, plus a demo email domain `DEMO_EMAIL_DOMAIN`. Both go in the Convex env.
10. **Gmail on OutLayer**: connect a dedicated demo Gmail at app.outlayer.ai/connect/gmail (testnet), set its policy `recipients` to the supplier mailboxes.
11. **Rust** with the `wasm32-wasip2` target to build `worker/dock-check`, then `outlayer login testnet` to deploy it. Put the build's sha256 in `DOCK_CHECK_WASM_SHA256`.
12. **Funded mainnet wallet** for the finale, later, and only with your explicit yes.

## 3. Commands to run

```bash
cd ~/Documents/devluca999/everNEAR/evernear
gh repo create Everstock-Inc/evernear --private --source . --push
npx skills add near/agent-skills && npx convex ai-files install     # setup the permission check also blocked
node scripts/rehearse-testnet.mjs
npx convex dev
npx convex env set TELEGRAM_BOT_TOKEN ... && npx convex env set TELEGRAM_WEBHOOK_SECRET ... && npx convex env set INBOUND_EMAIL_SECRET ...
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=<convex site url>/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET
npm run typecheck && npm run lint && npm test && npm run check:ip
```

## 4. Design questions

Full detail with sources and the safest option for each: `docs/NOTES.md` section 10.

1. **Payment checks break "three exits only"** (mainnet only, bypass the whitelist, the claimer picks the amount, expiry never refunds). Recommend paying the finale by whitelisted `intents/transfer` instead, or keeping the check key until the dock check passes. Needs your call.
2. **Approvals have no amount threshold.** Built as: the $10K and new-supplier rule in code (`engine/policy.ts`), the main wallet with a 2-vote multisig, and a small capped operating wallet for routine reorders.
3. **Gmail connector has no Reply-To** and cannot read replies. Replies must come in by forwarding or direct to the inbound webhook.
4. **Escrow keys are derivable from Astro's parent key**, so the escrow is a commitment, not a lock. Already the README's honest limit, and worth saying more plainly. It is still unverified whether the whitelist checks the recipient inside an `ft_transfer`. First testnet test to run.
5. **Dock check**: built as an attestation check in Convex (`convex/near/dockcheck.ts`: approved wasm hash, input and output hashes, amount equals the engine). It is not a secret bound to the wasm hash, because those secrets only work for on-chain runs.
6. **Deadline refund** needs a Convex scheduled job; the escrow logic is written and tested, the scheduler wiring is not.
7. **Finale "on Haoyun's chain"**: bridge minimums may refuse $3.42 cross-chain. Fallback: settle on NEAR, labelled.
8. **Huaxin's 3 failing lines**: the brief lists flange and connector, which are both motor specs. I modelled the connector failure on a separate "Encoder harness" BOM line so exactly 3 lines fail. Change it if you meant otherwise.
9. **Font**: the brief says Inter until the V2 tokens arrive; the tokens use Space Grotesk, so the UI follows the tokens.

## 5. Done and verified / blocked

Done (local, all checks green: 92 tests, typecheck, lint, check:ip, `next build`, demo from a clean clone):
- Engine and seed data with the exact numbers; stage machine; 100 s scenario runner, scenes 0 to 9.
- Workspace UI: rail, five panels, drawer, phone, camera corner, dark and light, voice test on every scene.
- NEAR adapters (custody, approvals, escrow, Gmail, NEAR AI inference with attestation binding, guarded mainnet payout), tested against mocks only, including the no-leak check.
- Telegram and inbound email paths in Convex, with demand and supplier simulators.
- Dock-check worker source, shared vectors and the attested release gate.
- Anatomy figures, first pass: 10MA exploded view and motor close-up.
- README with every claim linked to its file and test.

Blocked or not done:
- Repo, CI, Vercel preview: the GitHub repo was not created (permission check).
- Any live testnet call: OutLayer registration was blocked by the permission check; no NEAR AI key.
- Real proofs: all on-screen proofs are synthetic and labelled so.
- The UI replays the scenario only; panels are not yet driven by live Convex queries.
- Rust build of the worker: no toolchain on this machine; the Rust tests are written but have not run.
- Anatomy figures: the kit audit and the 4x detail pass are not done (you said to upscale later).
- Setup skills (near/agent-skills, OutLayer skills, Convex AI files): the permission check blocked them.

## Decisions I made

- Repo scaffolded at `everNEAR/evernear`, with the brief files left beside it. To reverse: move the folder.
- Only `tokens.css` from the design zip is in the repo, because its readme and SKILL name an internal product the IP check blocks. To reverse: add them after editing those names out.
- Space Grotesk font, per the tokens. To reverse: change `app/layout.tsx`.
- `CLAUDE.md` is exempt from `check:ip`, because it states the rule and so names the blocked words. To reverse: edit `scripts/check-ip.mjs`.
- The Haoyun motor costs $18.54, the price cap is $19.10 a unit, and Rheinwerk is $45.84 (2.4x). The routine reorder is 300 motors for $5,562. The 10MA uses 4 motors, with 24 on hand. To reverse: edit `seed/astro.ts`.
- Adapter tests live in `tests/`, outside `convex/`, so the Convex bundler skips them.
