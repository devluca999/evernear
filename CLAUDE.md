# Evernear: guide for Claude Code

Evernear is Everstock's NEAR Hackathon entry: an agent that sources, verifies and pays for parts for a fictional robot maker (Astro Robotics, flagship 10MA). The full brief is `docs/BUILD.md`; read it before any work. Progress lives in `docs/LEDGER.md`.

Hackathon: development ends **Nov 14, 2026, 23:59 UTC**. Target submission Nov 13. Submission needs a public repo and a public demo post on X.

## Setup (run once)

```bash
npx skills add near/agent-skills                     # near-ai-cloud, near-api-js, near-cli-rs, near-contract-audit, near-dapp, near-intents, near-kit, near-smart-contracts
npx skills add wheresryan22/anatomy -a claude-code   # isometric machine figures
npx convex ai-files install                          # Convex agent guidance
npm install -g near-cli-rs@latest
claude mcp add --transport http near-docs https://docs.near.org/mcp
mkdir -p .claude/skills
git clone https://github.com/out-layer/skills /tmp/outlayer-skills
for d in /tmp/outlayer-skills/*/; do [ -f "$d/SKILL.md" ] && cp -R "$d" .claude/skills/; done
git clone https://github.com/NEAR-Intents-Agent-API/skills /tmp/naa-skills && cp -R /tmp/naa-skills/near-intents-agent-api .claude/skills/
```

## Read the llms.txt first

Before building against any service, read its llms.txt (or the skill that replaces it) and note what you learned in `docs/NOTES.md` with links. Try `<docs domain>/llms.txt` for every source below; when there is none, use the listed skill or docs page.

- NEAR: https://docs.near.org/llms.txt
- NEAR Intents Agent API: https://api.agentsonintents.com/llms.txt
- Tidepool (testnet Agent API): https://www.usetidepool.tech/llms.txt
- Convex: https://docs.convex.dev/llms.txt
- Vercel, Next.js, OutLayer, NEAR AI, Telegram: try `/llms.txt` on each docs domain, else the docs and skills below
- Hackathon agent brief: https://nearhackathon.com/HACKATHON.md

## Sources

**Hackathon:** https://nearhackathon.com · track prompts https://github.com/nearai/near-hackathon-prompt-examples (tracks 03, 04, 06, 08) · https://nearbuilders.org/build

**OutLayer (main platform, testnet first)**
- Entry skill: https://skills.outlayer.ai/outlayer/SKILL.md (routes to the rest)
- agent-custody, building-outlayer-apps, outlayer-cli, outlayer-connectors, gmail-connector, mercury-connector: https://skills.outlayer.ai
- Docs: https://app.outlayer.ai/docs · workers: https://workers.outlayer.ai · source: https://github.com/out-layer/outlayer
- Testnet API: `https://testnet-api.outlayer.ai` (exactly this host). Contract `outlayer.testnet`, connectors `connectors.outlayer.testnet`, stablecoin `usdc.fakes.testnet`. On OutLayer, NEAR Intents (swaps, cross-chain, intents balances, payment checks) are mainnet only, so the escrow and payout run on the Agent API through Tidepool instead.

**NEAR**
- Agent skills: https://github.com/near/agent-skills · tools for AI: https://docs.near.org/getting-started/tools-for-ai
- NEAR AI private inference: https://docs.near.ai/ · https://github.com/nearai/cloud-api
- NEAR Intents: https://docs.near-intents.org/ · https://github.com/near/intents
- NEAR Intents Agent API (per-PO escrow and payout): https://github.com/NEAR-Intents-Agent-API/skills · SDK `@near-intents-agent-api/sdk` (Node 24) · mainnet host `api.agentsonintents.com`, never called without Luca's yes

**Tidepool (escrow and payout, testnet)**
- https://www.usetidepool.tech · guide https://www.usetidepool.tech/docs/guides/agent-api · spec https://www.usetidepool.tech/v1/openapi.json · notes in `docs/NOTES.md` section 14
- A community-run testnet of the Agent API (`/v1`) and 1Click (`/v0`), not affiliated with NEAR; it runs NEAR's Intents verifier on testnet. The SDK points at it with `baseUrl` from `AGENT_API_BASE_URL`.
- Limits: 25 agents per key, never deleted; 5 keys per IP per day; one faucet claim per address every 24 hours. Each order gets a fresh account, never reused: once settled it is frozen, its grant revoked, and kept as the order's receipt (Luca, Nov 6). A full key refuses with `accounts_full`. Unit tests use `tests/near/fakeTidepool.ts` and never create agents.
- Trezu multisig (optional): https://trezu.org

**Design:** Anatomy https://github.com/wheresryan22/anatomy (MIT, credit in README) · design rules in `docs/BUILD.md` section 10

## Rules

1. **IP boundary.** You have no access to Everstock's private code and must not seek it. Build only from `docs/BUILD.md`. Before any push, `npm run check:ip` must pass: it searches for Everstock-internal names (write the script to fail on `ENG-`, `S5[0-9]`, `S6[0-9]`, `S7[0-9]`, `S8[0-9]`, `S9[0-9]` spec ids, and the words `restock-chain`, `composio`, `everbot`).
2. **Real, not staged.** Every NEAR call is real. Only Astro, its customers and its suppliers are simulated, through the real inbound paths. Recorded responses live in `fixtures/` and are shown as "replay"; synthetic placeholders live in `fixtures/synthetic/` and must be replaced by real recordings before submission.
3. **README is audited** by Claude Code, Codex and the judges. Every claim links to its file and its test; a claim without a test is removed.
4. **Deterministic spine.** Amounts, thresholds and releases are computed in code. Models only read documents and draft messages.
5. **Evernear never holds funds.** Owner keys belong to Astro; the agent gets a limited key.
6. **Never commit secrets.** `.env.example` only; real values in gitignored `.env.local` or the host's env settings.
7. **Networks.** Testnet for everything, including the escrow and payout (Tidepool, at 1:1,000). Mainnet is optional and later, only by switching `AGENT_API_BASE_URL`, and no mainnet call, ever, without Luca's explicit yes in this session. No real assets are sent to Tidepool. Never spend money, buy anything or start a paid plan.
8. **Repo stays private** until Luca makes it public after the IP check. Never push to `Everstock-Inc/everstock`.
9. **Voice and design** per `docs/BUILD.md` section 10.

@AGENTS.md

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
