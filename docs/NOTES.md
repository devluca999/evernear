# Evernear: service notes

Research notes for building Evernear against each outside service. Read on 2026-11-05, from public documentation only (no keys used, no writes, nothing registered). Every fact links to the page it came from. "Unverified" means the docs did not settle it and it must be tested on testnet before we rely on it.

Sections: [OutLayer](#1-outlayer-main-platform) · [NEAR AI Cloud](#2-near-ai-cloud-private-inference) · [NEAR Intents](#3-near-intents) · [NEAR Intents Agent API](#4-near-intents-agent-api) · [NEAR protocol](#5-near-protocol-docs) · [Convex](#6-convex) · [Telegram Bot API](#7-telegram-bot-api) · [Hackathon brief](#8-hackathon-brief-and-track-prompts) · [Vercel and Next.js](#9-vercel-and-nextjs) · [Contradictions with BUILD.md](#10-contradictions-with-buildmd)

---

## 1. OutLayer (main platform)

Sources read: [skills index](https://skills.outlayer.ai/outlayer/SKILL.md), [agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md) and its references ([register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md), [payment-checks](https://skills.outlayer.ai/agent-custody/references/payment-checks.md), [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md), [wallet-ops](https://skills.outlayer.ai/agent-custody/references/wallet-ops.md), [funding-and-payment-keys](https://skills.outlayer.ai/agent-custody/references/funding-and-payment-keys.md)), [outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md), [gmail-connector](https://skills.outlayer.ai/gmail-connector/SKILL.md) and [its connect page](https://skills.outlayer.ai/gmail-connector/references/connect.md), [building-outlayer-apps](https://skills.outlayer.ai/building-outlayer-apps/SKILL.md) and [signing-keys](https://skills.outlayer.ai/building-outlayer-apps/references/signing-keys.md), [outlayer-cli](https://skills.outlayer.ai/outlayer-cli/SKILL.md), [docs llms.txt](https://app.outlayer.ai/llms.txt), [full docs text](https://app.outlayer.ai/llms-full.txt), [TEE attestation docs](https://app.outlayer.ai/docs/tee-attestation), [OpenAPI spec (testnet copy)](https://testnet-api.outlayer.ai/openapi.json), [repo](https://github.com/out-layer/outlayer). `https://skills.outlayer.ai/llms.txt` returned 404; the skills index replaces it.

### Hosts and contract ids

| | Mainnet | Testnet | Source |
|---|---|---|---|
| API base | `https://api.outlayer.ai` | `https://testnet-api.outlayer.ai` (exactly; `api-testnet.` and `testnet.api.` do not resolve) | [agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md) |
| Dashboard and docs | `https://app.outlayer.ai` | same URL, switch network in the UI | [skills index](https://skills.outlayer.ai/outlayer/SKILL.md) |
| Contract | `outlayer.near` | `outlayer.testnet` | [skills index](https://skills.outlayer.ai/outlayer/SKILL.md) |
| Curated connectors | `connectors.outlayer.near` | `connectors.outlayer.testnet` | [skills index](https://skills.outlayer.ai/outlayer/SKILL.md) |
| Stablecoin (6 decimals) | USDC `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | `usdc.fakes.testnet` | [agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md) |
| RPC named by OutLayer | `https://rpc.mainnet.fastnear.com` | `https://rpc.testnet.fastnear.com` | [llms.txt](https://app.outlayer.ai/llms.txt) |
| Interactive API reference | `https://api.outlayer.ai/docs` | | [full docs](https://app.outlayer.ai/llms-full.txt) |
| TypeScript SDK | `@outlayer/sdk` ([source](https://github.com/out-layer/sdk-js)) | | [full docs](https://app.outlayer.ai/llms-full.txt) |

- There is no network parameter on any call; the host picks the network. A `wk_` key, a payment key or a wallet address from one network means nothing on the other. ([agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md))
- NEAR Intents (swaps, cross-chain, intents balances) are mainnet only; on testnet the coordinator answers HTTP 503 for every `/wallet/v1/intents/*` route, all `/wallet/v1/confidential/*` routes **and the payment-check routes**. Address, balance, `transfer`, `call`, `sign-message`, policy and approvals work on both networks. ([full docs, Agent Custody API Endpoints](https://app.outlayer.ai/llms-full.txt))
- The OpenAPI spec lists both servers; version `0.1.0-alpha.4` at time of reading. ([openapi.json](https://testnet-api.outlayer.ai/openapi.json))

### Auth

| Header | Used for | Format | Where it comes from |
|---|---|---|---|
| `Authorization: Bearer wk_...` | every `/wallet/v1/*` endpoint, `POST /trial-key` | `wk_` + 64 hex | `POST /register` (no auth), shown once |
| `Authorization: Bearer near:<base64url>` | alternative to `wk_` for deterministic wallets | base64url JSON `{account_id, seed, pubkey, timestamp, signature}`, message `auth:<seed>:<timestamp>`, window plus or minus 30 s, raw ed25519 base58 signature (not NEP-413) | your own NEAR full-access key |
| `X-Payment-Key: owner:nonce:secret` | `POST /call/{owner}/{project}` (connectors and our own WASI) | `owner:nonce:key`; nonce 0 is the trial key | `POST /trial-key` or `POST /wallet/v1/create-payment-key` |
| `X-Wallet-Id` | connector or WASI run that needs the caller's wallet | the `wallet_id` from `GET /wallet/v1/address` | |
| none | `/register`, `/health`, `/public/*`, `POST /wallet/v1/approve/{id}` (the vote is the proof) | | |

There is no `X-API-Key` header on OutLayer. A `wk_` cannot pay for `/call` (`401 wk_is_not_a_payer`). Sources: [llms.txt](https://app.outlayer.ai/llms.txt), [register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md), [outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md), [openapi.json](https://testnet-api.outlayer.ai/openapi.json).

### Custody wallet endpoints we need

All under the API base. Source: [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md) unless noted.

| Method and path | Key request fields | Key response fields | Notes |
|---|---|---|---|
| `POST /register` | empty body (random wallet); or `{vault_id}`; or deterministic `{account_id, seed, pubkey, message:"register:<seed>:<ts>", signature}` | `api_key` (once), `wallet_id`, `near_account_id` (64 hex implicit), `handoff_url`, `trial {available, calls:50, days:7}` | no gas, no tx ([agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md)) |
| `PUT /wallet/v1/api-key` | Bearer parent `wk_` + `{seed, key_hash}` | `{wallet_id, near_account_id}` | creates a sub-agent wallet; sub key is `wk_` + hex(sha256("<seed>:0:<parent wk_>")), `key_hash` = sha256(sub key); idempotent ([register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md)) |
| `DELETE /wallet/v1/api-key/{key_hash}` | | | 409 if last active key |
| `GET /wallet/v1/address?chain=near` | | `wallet_id`, `chain`, `address`, `public_key` | NEAR account is `address` ([agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md)) |
| `GET /wallet/v1/balance?chain=near&token=<ft>` | | `balance`, `token`, `account_id` | `&source=intents` for the intents balance |
| `POST /wallet/v1/transfer` | `{chain:"near", to, amount}` (yocto) | `request_id`, `status` | on-chain, needs about 0.001 NEAR gas; sending both `to` and legacy `receiver_id` is a 400 |
| `POST /wallet/v1/call` | `{receiver_id, method_name, args, gas, deposit}` | `request_id`, `status`, `tx_hash`, `result` | FT send = `ft_transfer` on the token contract with deposit `"1"`; receiver must have storage on the token ([wallet-ops](https://skills.outlayer.ai/agent-custody/references/wallet-ops.md)); 409 `wallet busy` if another money op is running ([openapi.json](https://testnet-api.outlayer.ai/openapi.json)) |
| `POST /wallet/v1/storage-deposit` | `{token, account_id?}` | `already_registered` | about 0.00125 NEAR ([wallet-ops](https://skills.outlayer.ai/agent-custody/references/wallet-ops.md)) |
| `GET /wallet/v1/requests/{id}` | | status | statuses: `success`, `failed`, `processing`, `pending_approval`, ... ([agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md)) |
| `GET /wallet/v1/audit?limit=50` | | event history | |
| `GET /wallet/v1/policy` | | decrypted policy | ([full docs](https://app.outlayer.ai/llms-full.txt)) |
| `POST /wallet/v1/encrypt-policy` then `POST /wallet/v1/sign-policy`, then a NEAR tx `store_wallet_policy(wallet_pubkey, encrypted_base64, signature)` on the OutLayer contract, then `POST /wallet/v1/invalidate-cache` | `{wallet_id, rules, approval, capabilities, admin_quorum?, webhook_url?, authorized_key_hashes?, refund_addresses?}` | | the first `store_wallet_policy` caller becomes the policy owner; only that owner can update or freeze ([full docs, Policy Setup and contract section](https://app.outlayer.ai/llms-full.txt)). The dashboard does this for the owner at `https://app.outlayer.ai/wallet?key={api_key}` ([agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md)) |
| `GET /wallet/v1/pending_approvals` (agent, Bearer `wk_`) | | `approval_id`, `type`, `op`, `request_hash`, `required`, `approved`, `expires_at` | ([openapi.json](https://testnet-api.outlayer.ai/openapi.json)) |
| `GET /wallet/v1/approval/{id}` | | approval detail | no session needed for one approval by id ([api-index errors](https://skills.outlayer.ai/agent-custody/references/api-index.md)) |
| `POST /wallet/v1/approve/{id}` and `POST /wallet/v1/reject/{id}` | exactly one of NEP-413 `{signature, public_key, account_id, nonce}` over `approve:{approval_id}:{wallet_pubkey}:{request_hash}` (recipient = the wallet contract id), or `ContractVoteAuth` | `{approval_id, status: pending|approved|rejected|expired, approved, required, request_id}` | no API key; signer must be a full-access key of an approver listed in policy; 401 `invalid_signature`, 403 `not_approver`, 409 `already_approved`; threshold met = auto-execute; max 16 votes per request ([openapi.json](https://testnet-api.outlayer.ai/openapi.json), [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md)) |
| `POST /wallet/v1/create-payment-key` | `{initial_deposit_usdc:"2.00"}` or `{initial_deposit_near:"1.0"}` | `payment_key` | on-chain ([funding-and-payment-keys](https://skills.outlayer.ai/agent-custody/references/funding-and-payment-keys.md)) |
| `POST /trial-key` | Bearer `wk_` | `payment_key` (nonce 0), `calls: 50`, `expires_at`, `project_ids: ["connectors.../*"]` | connectors only; claim right after register ([outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md)) |

Owner hand-off links (send with an explanation, never ask for secrets in chat): policy `https://app.outlayer.ai/wallet?key={api_key}`, fund `https://app.outlayer.ai/wallet/fund?to={near_account_id}&amount={amount}&token={token}&msg={msg}&dest=intents`, connector credential `https://app.outlayer.ai/secrets?project={connector_project_id}&name={VAR}`. ([agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md))

### Policy model (what the TEE enforces)

From [full docs, Policy Format](https://app.outlayer.ai/llms-full.txt) and [openapi.json](https://testnet-api.outlayer.ai/openapi.json):

- `rules.transaction_types`: allowlist of `call`, `transfer`, `withdraw`, `cross_chain_withdraw`, `limit_order`, `deposit`, `swap`, `confidential`. The deposit family gates as `call`.
- `rules.allowed_tokens`, `rules.addresses: {mode: "whitelist"|"blacklist", list}`.
- `rules.limits.per_transaction` (stateless, exact, enforced on every signature), `hourly`/`daily`/`monthly` (stateful, best-effort under concurrency: "a burst can overshoot a cumulative cap"; for hard stops use per-transaction, multisig or freeze), `hourly_tx_count`.
- `approval: {threshold: N | {required: N}, approvers: [{id, pubkey?, role: admin|signer}], excluded_types}`. Admin may also change policy and freeze; signer only approves.
- `capabilities`: default DENY under a policy for `raw_sign`, `swap`, `cross_chain_withdraw`, `limit_order`, `payment_check`, `evm_sign`, `solana_sign`, `confidential`; `sign_message` default allow. A wallet with **no policy is unrestricted**.
- Evaluation order inside the keystore TEE: frozen, transaction_types, allowed_tokens, whitelist, per-tx limit, velocity, time, capabilities, multisig trigger. Decision: `Allow`, `Deny`, `RequiresApproval`, `Frozen`.
- Owner can freeze on chain with `freeze_wallet(wallet_pubkey)`, 2 to 5 s latency.
- `payment_check` is "whitelist-BYPASS: funds reach an arbitrary holder via the link" and is **not** wired into the multisig trigger (cap-gated only, even on a multisig wallet).
- Approval of a `transfer`/`call`/`withdraw` binds the exact op ("Built" bind mode: the keystore builds the tx from the approved op). For Trusted ops (swap, cross-chain) the approval binds whether it runs and the recipient, not the value terms.
- Unverified: whether the address whitelist applies to the `args.receiver_id` of an `ft_transfer` sent through `/wallet/v1/call`, or only to the call's contract `receiver_id`. The docs describe whitelist checks on `to` for transfer/withdraw; for account binding they say a decoder denies anything it cannot state, but nothing equivalent is documented for a custody wallet `call`. Test it.
- Unverified: whether approvals can be triggered only above an amount. The `ApprovalConfig` schema has only a count (`threshold`), approvers and `excluded_types`; the `/wallet/v1/call` description says "if the call exceeds limits, the response carries `status=pending_approval`", and the multisig flow diagram shows `amount > threshold`. No amount field is documented.

### Sub-agent wallets

- Exist: `PUT /wallet/v1/api-key` with the parent's `wk_` and `{seed, key_hash}` derives a separate wallet (own `wallet_id`, own address, own policy since policy is one per `wallet_id`). Same seed always gives the same sub-wallet. ([register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md), [full docs, Shared Policy](https://app.outlayer.ai/llms-full.txt))
- The sub key is computable by anyone holding the parent `wk_` (it is a hash of seed and parent key). So whoever holds the parent key can always act as the sub-wallet. ([register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md))
- Simple alternative with no parent link: another `POST /register`. ([register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md))

### Payment checks (mainnet only)

Source: [payment-checks](https://skills.outlayer.ai/agent-custody/references/payment-checks.md), [full docs, Payment Checks](https://app.outlayer.ai/llms-full.txt).

| Method and path | Request | Response |
|---|---|---|
| `POST /wallet/v1/payment-check/create` | `{token (plain contract id), amount, memo? (256 chars), expires_in? (s)}`; send `X-Idempotency-Key` and `X-Answer-Within` | `check_id`, `check_key` (shown once, 64 hex, it is the raw ed25519 key of an ephemeral account on `intents.near`), `status: unclaimed|creating`, `expires_at` |
| `POST /wallet/v1/payment-check/batch-create` | `{checks: [...]}` up to 10 | `{checks: [...]}` |
| `POST /wallet/v1/payment-check/claim` | recipient's Bearer + `{check_key, amount?}` (partial claim) | `status: claimed|partially_claimed`, `amount_claimed`, `remaining`, `intent_hash` |
| `POST /wallet/v1/payment-check/reclaim` | creator's Bearer + `{check_id, amount?}` (partial reclaim) | `status`, `amount_reclaimed`, `remaining`, `intent_hash` |
| `GET /wallet/v1/payment-check/status?check_id=` | | `amount`, `claimed_amount`, `reclaimed_amount`, `status`, `claimed_by` |
| `POST /wallet/v1/payment-check/peek` | `{check_key}` | live `balance`, `status` |
| `GET /wallet/v1/payment-check/list?status=&limit=` | | `{checks}` |

- Paid from the **intents** balance; gasless; a short balance is refused `400 insufficient_balance` before policy.
- The recipient decides how much to claim. Whoever holds `check_key` (plus any wallet API key) can claim; an external wallet can claim on chain directly and **bypass the expiry**, which only the API enforces.
- Reclaim works any time there is a remainder, only by the creator. Expiry does not refund by itself: the creator must call reclaim.
- Requires the `payment_check` capability in the policy.

### Connectors (generic call)

Source: [outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md), [openapi.json](https://testnet-api.outlayer.ai/openapi.json).

```
POST https://testnet-api.outlayer.ai/call/connectors.outlayer.testnet/<connector>
X-Payment-Key: <key owned by the calling wallet>
Content-Type: application/json
{"input": {"operation": "<name>", ...}, "secrets_ref": {"account_id": "<owner>", "profile": "<connector id>"}, "async": false}
```

- Response `{call_id, status: completed|failed|pending, output, error, compute_cost, instructions, time_ms, poll_url, attestation_url}`. The connector's own answer `{success, operation, output, error, logs}` is inside `output`. A connector refusal is HTTP 200 with `output.success: false`; owner policy refusals start `policy_denied:`.
- `408 timeout`: do not resend (it may still run and is charged); poll `GET /calls/{call_id}`.
- Cost: about $0.001 compute plus the operation fee. A refused run is still charged.

### Gmail connector

Source: [gmail-connector](https://skills.outlayer.ai/gmail-connector/SKILL.md), [connect](https://skills.outlayer.ai/gmail-connector/references/connect.md).

- Live on testnet (`testnet-api.outlayer.ai` + `connectors.outlayer.testnet`) and mainnet.
- Operations: `status` (free plus compute; proves the credential and returns the policy), `send` ($0.01 plus compute), `task_status`, `tasks`, `task_cancel`, `task_delete`.
- `send` fields: `to` (string or array, bare addresses only, no display names, no commas), `cc`, `subject`, `body` (plain text), `attachments: [{filename, content_type, data(base64)}]`. **No `reply_to`, no `from`, no headers field.** Every message leaves as the connected Google account. The connector **cannot read the mailbox** (scope `gmail.send` only).
- Owner policy fields: `recipient_domains`, `recipients` (exact addresses), `max_per_day`, `max_recipients`, `max_attachment_kb` (absent = no attachments), `subject_prefix`, `confirm: ["send"]` (every send waits for the owner, answers `awaiting_owner` with a `link`). An empty policy `{}` (what the connect page writes) allows anyone. One disallowed address refuses the whole message with `policy_denied:`.
- A refused send costs the same $0.011 as a delivered one.
- Ceiling: 500 sends per rolling day per calling wallet (`operation_limit_reached`, `retry_after_seconds`).
- Setup (human only): owner connects at `https://app.outlayer.ai/connect/gmail` on the right network (dashboard toggle), signs one wallet tx (needs a little NEAR), then grants our payer account on the secrets row `gmail`. The Google app is unverified and admits at most 100 accounts; users see an "unverified app" warning.

### WASI workers, secrets, signing keys, attestation

- WASI P1 (`wasm32-wasip1`, no HTTP) or P2 (`wasm32-wasip2`, HTTP). P2 is needed for HTTP and for the OutLayer SDK storage, signing and encryption interfaces. ([building-outlayer-apps](https://skills.outlayer.ai/building-outlayer-apps/SKILL.md))
- Deploy: build, `outlayer upload <wasm>` (FastFS, prints sha256), `outlayer deploy <name> <URL>`. Uploads need `outlayer login testnet` with a NEAR private key, not a `wk_`. ([building-outlayer-apps](https://skills.outlayer.ai/building-outlayer-apps/SKILL.md), [outlayer-cli](https://skills.outlayer.ai/outlayer-cli/SKILL.md))
- HTTPS run: `POST /call/{owner}/{project}` with a **funded** payment key. The trial key reaches connectors only; there is no free tier for our own WASI. ([outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md), [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md))
- Secrets accessors: `--project owner/name`, `--wasm-hash <sha256>`, `--repo` (delete only). "`--wasm-hash` is the row a direct `run --wasm` reads", and a direct `run --wasm` uses **on-chain mode** (`request_execution` on the OutLayer contract, a signed NEAR tx). Without `--access`, "a new hash row admits everyone". ([outlayer-cli](https://skills.outlayer.ai/outlayer-cli/SKILL.md))
- Signing keys (P2): a module declares ed25519 or secp256k1 keys in its manifest; `bind: "wasm"` derives the key from the exact code sha256 plus the caller (new binary, new key); `bind: "project"` follows the project uuid across versions (whoever publishes new versions signs with the same key). Never sign caller-supplied bytes. ([signing-keys](https://skills.outlayer.ai/building-outlayer-apps/references/signing-keys.md))
- Wallet host functions inside WASI (`outlayer:wallet/api@0.1.0`): `get-id`, `get-address`, `withdraw`, `withdraw-dry-run`, `get-request-status`, `list-tokens`, `transfer` (native NEAR), `get-balance`, `intents-deposit`, `swap`. No generic contract `call` (so no `ft_transfer`). Only when the run carries a valid `X-Wallet-Id`; 50 calls per execution. ([full docs, Worker WASI host functions](https://app.outlayer.ai/llms-full.txt))
- Attestation contents: WASM sha256, input sha256, output sha256, worker TDX measurements (MRTD, RTMR0 to 3), full TDX quote; REPORTDATA bytes 568 to 600 hold a task hash. Verify: Intel signature chain, `is_measurements_approved` on `worker.outlayer.near`, task hash, input/output hashes, wasm hash. The page names no per-call attestation endpoint beyond the dashboard (`/executions`, "View Attestation") and `GET /public/collateral?fmspc=&at=`; the `/call` response carries `attestation_url` ("the TEE quote for this execution"). Unverified: the format behind `attestation_url`, and the testnet equivalent of `worker.outlayer.near`. ([TEE attestation](https://app.outlayer.ai/docs/tee-attestation), [openapi.json](https://testnet-api.outlayer.ai/openapi.json))

### Rate limits and quotas

| Limit | Value | Source |
|---|---|---|
| Free custody operations | 100 per wallet per day (dry-runs count, quotes do not), `429 operation_limit_reached` with `Retry-After` | [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md) |
| Connector trial | 50 calls within the wallet's first 7 days (counted from registration); `402 trial_exhausted` / `trial_expired` are terminal | [outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md) |
| Paid key | no call count, bounded by money; `429 rate_limit_exceeded` per key with no `Retry-After` | [outlayer-connectors](https://skills.outlayer.ai/outlayer-connectors/SKILL.md) |
| Gmail | 500 sends per rolling day per wallet | [gmail-connector](https://skills.outlayer.ai/gmail-connector/SKILL.md) |
| WASI wallet host calls | 50 per execution | [full docs](https://app.outlayer.ai/llms-full.txt) |
| Approval votes | 16 per signing request | [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md) |
| HTTPS payload | 10 MB with a payment key, about 1.5 MB via blockchain tx | [building-outlayer-apps](https://skills.outlayer.ai/building-outlayer-apps/SKILL.md) |

### Changes our design

- Register Astro's wallet with `POST https://testnet-api.outlayer.ai/register`; claim the trial key in the same step (the 7 days run from registration, and 50 calls must cover all Gmail `status` and `send` calls in rehearsal).
- Astro's owner (a NEAR testnet account held by Luca) must sign `store_wallet_policy`; until then the wallet is unrestricted. Scene 0 must show a policy actually stored, not just a wallet.
- Approvers (Luca, Jordy) need NEAR testnet accounts with full-access keys in a wallet that can sign NEP-413 on a phone. Approval happens on the OutLayer dashboard or via `POST /wallet/v1/approve/{id}`.
- FT movement on testnet is `POST /wallet/v1/call` with `ft_transfer` on `usdc.fakes.testnet` (deposit 1 yocto, storage registered for each recipient, gas paid in testnet NEAR by the sending wallet). Each escrow wallet needs a little testnet NEAR for gas.
- How to obtain `usdc.fakes.testnet` tokens is not documented in the pages read (unverified).
- Store per proof: `request_id`, `tx_hash` (testnet), `call_id` and `attestation_url` (connector and worker runs), `approval_id` and vote count.
- Use `X-Idempotency-Key` on every money call; treat `408` and `processing` as "poll, do not resend".

---

## 2. NEAR AI Cloud (private inference)

Sources: [llms.txt](https://docs.near.ai/llms.txt), [quickstart](https://docs.near.ai/cloud/quickstart.md), [models](https://docs.near.ai/cloud/models.md), [OpenAI compatibility](https://docs.near.ai/cloud/guides/openai-compatibility.md), [chat completion reference](https://docs.near.ai/api-reference/chat/create-chat-completion.md), [attestation report](https://docs.near.ai/api-reference/attestation/get-attestation-report.md), [signature endpoint](https://docs.near.ai/api-reference/attestation/get-completion-or-responses-api-signature.md), [model attestations](https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md), [response signatures](https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md), [gateway attestation](https://docs.near.ai/cloud/verification/cloud-api/gateway-attestation.md), [cloud-api repo](https://github.com/nearai/cloud-api), live model list `GET https://cloud-api.near.ai/v1/models` (public).

### Endpoint and auth

- Base URL `https://cloud-api.near.ai/v1`, OpenAI compatible: override `base_url`/`baseURL` in the OpenAI SDK. ([quickstart](https://docs.near.ai/cloud/quickstart.md), [OpenAI compatibility](https://docs.near.ai/cloud/guides/openai-compatibility.md))
- Auth header `Authorization: Bearer <API key>`. Key: sign up at `https://cloud.near.ai`, add credits, "API Keys" section. ([quickstart](https://docs.near.ai/cloud/quickstart.md)) Hackathon: $10 credits by joining NEAR Builders ([HACKATHON.md Q-000](https://nearhackathon.com/HACKATHON.md)).
- `POST /v1/chat/completions`: `{model, messages}`; message content accepts `image_url` parts (packing-slip photos). Response `{id, object, model, choices[].message.content, usage}`. `429` means rate limited or overloaded, retry with backoff. ([chat completion reference](https://docs.near.ai/api-reference/chat/create-chat-completion.md))
- Responses include an `X-Request-Id` header. ([quickstart](https://docs.near.ai/cloud/quickstart.md))
- No testnet or mainnet split; one hosted service.

### Models

- Privacy tiers: **Confidential TEE** (NEAR AI's own GPU fleet, attestation and signatures), **3P Confidential TEE** ("Attested 3P"), **Incognito** (OpenAI, Anthropic, Gemini and others: routed through the TEE gateway but the model runs outside a TEE). ([models](https://docs.near.ai/cloud/models.md))
- Live list on 2026-11-05 (`GET https://cloud-api.near.ai/v1/models`) with image input and `owned_by: nearai`: `Qwen/Qwen3-VL-30B-A3B-Instruct`, `Qwen/Qwen3.8-27B`, `z-ai/glm-5.3-flash`, `deepseek-ai/DeepSeek-V4.1-Flash-1017`. Text only, `owned_by: nearai`: `Qwen/Qwen3.6-35B-A3B-FP8`. Unverified: that `owned_by: nearai` equals the Confidential TEE tier; confirm on the [model catalog](https://near.ai/models) or by a non-empty `model_attestations[]` with `provider=near`.
- The quickstart example model `zai-org/GLM-5.1-FP8` is not in the live list: read model ids from `/v1/models` at runtime, never hard-code from docs. ([quickstart](https://docs.near.ai/cloud/quickstart.md))

### Attestation and per-read proof

1. Preflight, before the completion: `GET https://cloud-api.near.ai/v1/attestation/report?model=<MODEL_ID>&provider=near&signing_algo=ecdsa&nonce=<64 hex, fresh>&include_tls_fingerprint=false` with `Authorization: Bearer <key>` and `x-no-aliasing: true`. Response: `gateway_attestation {signing_address, signing_algo, intel_quote, event_log, report_data, request_nonce, info, tls_cert_fingerprint?}` and `model_attestations[]` (NEAR model reports: `intel_quote`, `event_log`, `request_nonce`, `signing_address`, `signing_algo`, `signing_public_key`, `nvidia_payload`, `info.tcb_info.app_compose`). Retrieval needs an API key and is not billed. Reject a missing or empty `model_attestations[]` if model evidence is required. ([attestation report](https://docs.near.ai/api-reference/attestation/get-attestation-report.md), [model attestations](https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md))
2. Verify each report: Intel DCAP quote (for example `dcap-qvl`), echoed nonce, event log replay to RTMR3, `app_compose` hash to MRCONFIGID. ([model attestations](https://docs.near.ai/cloud/verification/cloud-api/model-attestations.md))
3. Send the completion with the canonical model id and `x-no-aliasing: true`; keep the exact request bytes and raw response bytes (ask `Accept-Encoding: identity`).
4. `GET https://cloud-api.near.ai/v1/signature/<completion id>?signing_algo=ecdsa`. `text` should equal `<MODEL_ID>:<sha256(request bytes)>:<sha256(response bytes)>` for `signature_kind: provider_tee`, or `<req hash>:<resp hash>` for `gateway`. For ecdsa, recover the EIP-191 signer from `text` and `signature` and compare to `signing_address`. Defaults differ (`/v1/signature` ecdsa, report ed25519 for gateway), so pass `signing_algo` on both. A 404 or a 2xx carrying `error_code` means unverified; short bounded retry only. ([response signatures](https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md))
5. Only `provider_tee` binds a reply to the model TEE. The gateway signs itself on streamed completions, on alias resolution and on the Responses API, so use **non-streaming** chat completions with no alias. ([response signatures](https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md))
6. Browser alternative for judges: the [Verification Center](https://docs.near.ai/cloud/verification/verification-center.md).

### Rate limits

- No published numbers in the pages read. `429` on overload; per-organization concurrent request limits exist (admin endpoint "Update organization concurrent request limit"); a "Check API key validity" endpoint checks rate limits and credits. ([llms.txt](https://docs.near.ai/llms.txt), [chat completion reference](https://docs.near.ai/api-reference/chat/create-chat-completion.md))

### Changes our design

- `convex/near/inference.ts` stores per read: model id, nonce, verified report signer, completion id, request and response sha256, signature, `signature_kind`. Show "Verified" only when `provider_tee` matches the preflight report.
- Restrict document reads to Confidential TEE models; an Incognito model would break the "no leak" acceptance check because the plaintext BOM leaves the TEE.
- Non-streaming only for proof reads.

---

## 3. NEAR Intents

Sources: [llms.txt](https://docs.near-intents.org/llms.txt), [Explorer API intro](https://docs.near-intents.org/integration/distribution-channels/1click-api/explorer/introduction.md), [HACKATHON.md](https://nearhackathon.com/HACKATHON.md).

- No testnet exists or is planned; use mainnet with separate dev accounts, tiny amounts and `dry: true` quotes. ([HACKATHON.md Q-007](https://nearhackathon.com/HACKATHON.md))
- 1Click JWT not required; without it a 0.2% fee applies. Register at `https://partners.near-intents.org`. ([HACKATHON.md Q-006](https://nearhackathon.com/HACKATHON.md))
- Verifier contract on mainnet is `intents.near` (the custody docs credit balances there, [agent-custody](https://skills.outlayer.ai/agent-custody/SKILL.md)).
- Explorer: `https://explorer.near-intents.org/`; Explorer API `https://explorer.near-intents.org/api/v0`, JWT required, 1 request per 5 s per partner, covers 1Click swap transactions only. ([Explorer API](https://docs.near-intents.org/integration/distribution-channels/1click-api/explorer/introduction.md)) Unverified: a public explorer URL format for an `intent_hash` from a payment-check claim (it is not a 1Click swap). A NEAR explorer link to the settling transaction on `intents.near` may be the honest proof link; test.

### Changes our design

- The final payout proof should link a mainnet NEAR transaction, not assume an Intents Explorer page for a payment-check `intent_hash`.

---

## 4. NEAR Intents Agent API

Sources: [llms.txt](https://api.agentsonintents.com/llms.txt), [skill](https://github.com/NEAR-Intents-Agent-API/skills/blob/main/near-intents-agent-api/SKILL.md), OpenAPI at `https://api.agentsonintents.com/openapi.json` (not read in full).

- Host `https://api.agentsonintents.com`, **mainnet only, real funds**. Auth `X-API-Key: naa_...` from the partner dashboard `https://partners.near-intents.org/` (backend only). Agent actions also need `X-Grant-Token` (`ngt_...`) from an owner grant. Writes take `Idempotency-Key` (8 to 128 chars). ([skill](https://github.com/NEAR-Intents-Agent-API/skills/blob/main/near-intents-agent-api/SKILL.md), [llms.txt](https://api.agentsonintents.com/llms.txt))
- Owner actions: `POST /v1/generate-intent` -> owner signs (`nep413`, `nep366`, `eip712`, `webauthn`) -> `POST /v1/submit-intent` -> `GET /v1/status?correlation_id=&wait_ms=30000`.
- Policy: `{frozen, actions [swap|transfer|withdraw], confidential, owner_approval, assets, limits, max_actions_per_hour, destinations {mode: only|except|any, list}, budget, timelock_ms, schedule?, native?}`. `destinations.mode: "only"` is an exact allowlist; `owner_approval` holds outgoing money actions for an `approval_vote`.
- Executions: `POST /v1/agents/{agent_id}/transfer {asset, amount, recipient}`, `/withdraw {asset, amount, chain, recipient, memo?, dry?}`, `/swap`, `/deposit`. Status values include `PENDING_APPROVAL`, `SUCCESS`, `REFUNDED`, `FAILED`, `UNCERTAIN`.
- No payment-check (claimable link) primitive is listed.
- Quotas (deployment defaults): 100 agent admissions per 24 h, 100 deposit addresses per agent per 24 h, 10 unrevoked keys, 10 concurrent status waits per key, 10-minute cooldown on policy edits. ([llms.txt](https://api.agentsonintents.com/llms.txt))
- Public health: `GET /v1/network`. ([skill](https://github.com/NEAR-Intents-Agent-API/skills/blob/main/near-intents-agent-api/SKILL.md))

### Changes our design

- If the finale must refuse a wrong-address release on mainnet, this API's `destinations: only` does that; OutLayer payment checks cannot (see section 10).

---

## 5. NEAR protocol docs

Sources: [llms.txt](https://docs.near.org/llms.txt), [RPC providers](https://docs.near.org/api/rpc/providers.md).

- Testnet RPC options: `https://test.rpc.fastnear.com`, `https://archival-rpc.testnet.near.org` (severely rate limited), `https://near-testnet.drpc.org`, `https://testnet-rpc.intea.rs`. OutLayer names `https://rpc.testnet.fastnear.com` ([llms.txt](https://app.outlayer.ai/llms.txt)). ([RPC providers](https://docs.near.org/api/rpc/providers.md))
- Free testnet NEAR: [faucet page](https://docs.near.org/getting-started/faucet.md) ([HACKATHON.md Q-008](https://nearhackathon.com/HACKATHON.md)).
- Access keys page (function-call key caveats) is the one track 06 points to: [access keys](https://docs.near.org/protocol/accounts-contracts/access-keys.md) (not read in full).

---

## 6. Convex

Sources: [llms.txt](https://docs.convex.dev/llms.txt), [HTTP actions](https://docs.convex.dev/functions/http-actions.md), [actions](https://docs.convex.dev/functions/actions.md), [convex-test](https://docs.convex.dev/testing/convex-test.md), [agent mode](https://docs.convex.dev/cli/agent-mode.md), [local deployments](https://docs.convex.dev/cli/local-deployments.md), [limits](https://docs.convex.dev/production/state/limits.md), [Vercel hosting](https://docs.convex.dev/production/hosting/vercel.md).

- HTTP actions: export an `httpRouter()` from `convex/http.ts`; served at `https://<deployment>.convex.site` (not `.convex.cloud`). No request size limit except `multipart/form-data` (20 MiB); response 100 MiB; 64 MiB memory; bodies via `.text()`, `.json()`, `.blob()`, `.arrayBuffer()`; no Node APIs (call an action for Node); not auto-retried. ([HTTP actions](https://docs.convex.dev/functions/http-actions.md))
- Actions call external APIs with `fetch` in the default runtime (faster, no cold start) or `"use node"`; write via `ctx.runMutation`. Timeouts: Node runtime 10 min, Convex runtime action 30 min per [limits](https://docs.convex.dev/production/state/limits.md) (the [actions page](https://docs.convex.dev/functions/actions.md) says 10 min for actions; treat 10 min as the safe ceiling). Memory 512 MB Node, 64 MB Convex runtime.
- convex-test: `npm install --save-dev convex-test vitest @edge-runtime/vm`, Vitest `edge-runtime` environment, `import.meta.glob` of function modules; `t.fetch("/path", {...})` calls HTTP actions; mocking global `fetch` does not affect `t.fetch`; `vi.useFakeTimers()` plus `t.finishAllScheduledFunctions(vi.runAllTimers)` for scheduled work (deadline refund test). ([convex-test](https://docs.convex.dev/testing/convex-test.md))
- Anonymous/local dev: in a non-interactive shell with no deployment configured and no `CONVEX_DEPLOY_KEY`, `npx convex dev --once` provisions a local deployment automatically, no login. ([agent mode](https://docs.convex.dev/cli/agent-mode.md)) The variable `CONVEX_AGENT_MODE=anonymous` does **not** appear in the pages read (unverified).
- Local deployments have **no public URL**, so Telegram webhooks and inbound email cannot reach them without a tunnel; Node actions run on the local Node version. ([local deployments](https://docs.convex.dev/cli/local-deployments.md)) For webhooks use a cloud dev deployment with a scoped deploy key (`npx convex deployment create --type dev ... --select`, `npx convex deployment token create agent-token --save-env`). ([agent mode](https://docs.convex.dev/cli/agent-mode.md))

### Changes our design

- `DEMO_MODE=1 npm run demo` can run on an anonymous local deployment (no keys), but the live Telegram and email paths need a cloud deployment.
- The deadline-refund acceptance test uses fake timers and scheduled functions.

---

## 7. Telegram Bot API

Sources: [Bot API](https://core.telegram.org/bots/api), [Bots FAQ](https://core.telegram.org/bots/faq).

- Requests: `https://api.telegram.org/bot<token>/METHOD_NAME`, GET or POST, query string, form, JSON (not for uploads) or multipart. Response `{ok, result | description}`. ([Bot API, Making requests](https://core.telegram.org/bots/api))
- `setWebhook`: `url` (HTTPS), `secret_token` (1 to 256 chars, `A-Z a-z 0-9 _ -`), `allowed_updates`, `drop_pending_updates`, `max_connections` (1 to 100, default 40). Every webhook POST then carries header `X-Telegram-Bot-Api-Secret-Token`. Non-2xx responses are retried. While a webhook is set, `getUpdates` does not work. ([Bot API, setWebhook](https://core.telegram.org/bots/api))
- `sendMessage`: `chat_id`, `text` (1 to 4096 chars after entity parsing), `parse_mode`. ([Bot API](https://core.telegram.org/bots/api))
- `sendPhoto`: `chat_id`, `photo` (file_id, HTTP URL, or multipart upload; max 10 MB; width plus height at most 10000; ratio at most 20), `caption`. ([Bot API](https://core.telegram.org/bots/api))
- Incoming photos arrive as an array of `PhotoSize {file_id, file_unique_id, width, height, file_size}`. `getFile {file_id}` returns a `File` with `file_path`; download from `https://api.telegram.org/file/bot<token>/<file_path>` (valid at least 1 hour, files up to 20 MB). ([Bot API, getFile](https://core.telegram.org/bots/api))
- Limits: about 1 message per second per chat (bursts then 429), 20 per minute in a group, about 30 per second broadcast. ([Bots FAQ](https://core.telegram.org/bots/faq))
- Key: from @BotFather (standard; the token format `123456:ABC-...` is shown in the request example). No testnet.

### Changes our design

- `convex/channels/telegram.ts` rejects any webhook POST whose `X-Telegram-Bot-Api-Secret-Token` does not match, and ignores non-private chats (DM only).
- The file download URL contains the bot token: fetch it server side, never send it to the browser or store it in `messages`.

---

## 8. Hackathon brief and track prompts

Sources: [HACKATHON.md](https://nearhackathon.com/HACKATHON.md), track prompts [03](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/03-privacy.md), [04](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/04-business.md), [06](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/06-security.md), [08](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md).

- Development ends 2026-11-14T23:59:00Z; repo public by then; judging from 2026-11-16; results by 2026-11-18. One submission per project, `POST https://nearhackathon.com/api/applications`, only after the human confirms the printed payload; fixes go through `https://nearhackathon.com/request-changes`. Track ids for us: `privacy`, `business`, `security`, `realworld`. Hosted demo should stay up to 2026-11-18, ideally 2026-11-25. Add a LICENSE file. Claude Code and Codex screen projects (reproducibility, feature verification), humans decide. README should give "do X, see Y" steps. ([HACKATHON.md](https://nearhackathon.com/HACKATHON.md))
- Track 03 asks for a TEE model chosen from the models endpoint, an attestation report fetched with a fresh random nonce and verified, a "Verified" panel listing what was checked, fictional sample documents, and "keep nothing server-side after a response returns".
- Track 04 asks for the agent's own NEAR account via OutLayer custody or a scoped function-call key, a public ledger of every sale, cost and payout, and a testnet demo loop under two minutes.
- Track 06 asks for a function-call key scoped to one contract (README explains its limits) and an attack demo where a prompt-injected agent tries to pay a bad address and is stopped, with the log shown.
- Track 08 asks for paid, pending or refunded status with transaction links and a CSV export an accountant can open.

### Changes our design

- Scene 8's refused wrong-address release doubles as the track 06 attack demo if we show the log.
- Track 03's "keep nothing server-side" conflicts with storing documents for replay; the prompts are hints, not rules (Q-011), but the README should say what we keep (hashes, signatures) and what we do not.

---

## 9. Vercel and Next.js

Sources: [Convex on Vercel](https://docs.convex.dev/production/hosting/vercel.md), [Vercel environment variables](https://vercel.com/docs/environment-variables.md), [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables.md).

- Build command `npx convex deploy --cmd 'npm run build'`; `CONVEX_DEPLOY_KEY` set per Vercel environment (production key for Production only, a preview deploy key for Preview only). ([Convex on Vercel](https://docs.convex.dev/production/hosting/vercel.md))
- Each Vercel preview gets a fresh Convex backend with no data; seed with `--preview-run 'functionName'`; Convex env values for previews come from project default environment variables. ([Convex on Vercel](https://docs.convex.dev/production/hosting/vercel.md))
- Vercel env vars apply to the next deployment of the chosen environment; preview vars can be scoped per branch; 64 KB total per deployment (5 KB for edge runtime). ([Vercel environment variables](https://vercel.com/docs/environment-variables.md))
- `NEXT_PUBLIC_*` values are inlined at build time into the browser bundle; anything else stays server side. ([Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables.md))

### Changes our design

- Only `NEXT_PUBLIC_CONVEX_URL` and the network id go to the browser. OutLayer `wk_` and payment keys, NEAR AI key and the bot token live in Convex env vars, not Vercel.
- Telegram's webhook can point at one deployment only; previews must not call `setWebhook`.

---

## 10. Contradictions with BUILD.md

Checked against [BUILD.md](BUILD.md) section 5 (architecture) and section 8 (acceptance checks).

### 10.1 Sub-agent escrow wallets

- BUILD.md: one OutLayer sub-agent wallet per PO, whitelisted to the supplier and Astro only, in `usdc.fakes.testnet`.
- Sources: sub-agent wallets exist and each has its own policy ([register-and-auth](https://skills.outlayer.ai/agent-custody/references/register-and-auth.md), [full docs](https://app.outlayer.ai/llms-full.txt)). But (a) the sub key is derivable by anyone holding the parent `wk_`, so Evernear's Convex backend can act as every escrow wallet; (b) a wallet with no stored policy is unrestricted, and a policy needs an on-chain `store_wallet_policy` by the owner; (c) whether the whitelist checks the `receiver_id` inside an `ft_transfer` args (how `usdc.fakes.testnet` moves) is unverified.
- Safest build option: create each escrow wallet, have Astro's owner account store its policy (`transaction_types: ["call"]`, `addresses` whitelist, `allowed_tokens: ["usdc.fakes.testnet"]`, `per_transaction` cap of the PO total) before any funds move, and write a testnet test that attempts `ft_transfer` to a third address and expects a refusal. If the whitelist does not cover FT args, keep the escrow but enforce exits in a pinned check in `convex/near/escrow.ts` and say so in the README, or move the testnet escrow token to native testnet NEAR via `/wallet/v1/transfer` (whitelist on `to` is documented). Keep the README "honest limit" and add: the parent key can derive the escrow key.

### 10.2 Approvals and the $10K auto-approve cap

- BUILD.md: auto-approve under $10K; new supplier needs 2 approvers; $38K cannot lock funds before 2 approvals.
- Sources: multisig approvals exist and work on testnet ([full docs](https://app.outlayer.ai/llms-full.txt)); the `ApprovalConfig` schema has a vote count, approvers and `excluded_types`, and **no amount threshold** ([openapi.json](https://testnet-api.outlayer.ai/openapi.json)). Whether approval can be limited to amounts above $10K is unverified. "New supplier" is not a policy concept at all.
- Safest build option: two wallets. Astro's main wallet carries `approval.threshold: 2` (Luca and Jordy as approvers), so the $38K move into escrow returns `pending_approval` and executes only after both votes (the TEE enforces this). A small operating wallet with `per_transaction` at $10K and no approval pays routine reorders. The $10K and new-supplier routing rule is computed in code (deterministic spine) and tested; the TEE-enforced part is "the main wallet cannot move money without 2 votes". Approvers need NEAR testnet accounts with full-access keys.

### 10.3 Payment checks for the final payout

- BUILD.md: final payout through an OutLayer payment check via NEAR Intents (partial claim plus reclaim), mainnet. Acceptance: three exits only, a release to any address but Haoyun's or Astro's is refused; no release by the deadline refunds Astro.
- Sources: payment checks are mainnet only (testnet answers 503), gasless, from the intents balance, and support partial claim and partial reclaim ([payment-checks](https://skills.outlayer.ai/agent-custody/references/payment-checks.md), [full docs](https://app.outlayer.ai/llms-full.txt)). They agree with "mainnet" in BUILD.md. They do **not** support "three exits only": the `payment_check` capability is a whitelist bypass, anyone holding `check_key` can claim, the claimer chooses the amount, external on-chain claims bypass expiry, and expiry never refunds by itself (the creator must reclaim). Payment checks are also excluded from multisig.
- Safest build option: keep `check_key` inside Evernear until the attested dock check passes; reclaim the $0.38 first, then hand over the key for the remaining $3.42 (so the supplier cannot over-claim); have a scheduled job reclaim everything at the deadline. Show the wrong-address refusal on a whitelisted path instead: on mainnet `POST /wallet/v1/intents/transfer` or `/intents/withdraw` from a wallet whose policy whitelists Haoyun and Astro (whitelist enforced, [openapi.json](https://testnet-api.outlayer.ai/openapi.json)), or the Agent API with `destinations: only` ([llms.txt](https://api.agentsonintents.com/llms.txt)). Simplest honest option: pay the finale by whitelisted `intents/transfer` and drop the payment check, or label the payment check as the "claimable" variant and run the three-exits test on the testnet escrow only. Every mainnet call needs Luca's explicit yes.

### 10.4 Payment checks on testnet

- BUILD.md does not claim testnet payment checks, and CLAUDE.md already says they are mainnet only. Confirmed: every intents-dependent endpoint, payment checks included, answers 503 on testnet ([full docs](https://app.outlayer.ai/llms-full.txt)). Testnet rehearsal of scene 8 must use the testnet escrow (`ft_transfer` of `usdc.fakes.testnet`), not a check. Payment-check code paths can only be tested against mocks plus one approved mainnet run.

### 10.5 Gmail connector: Reply-To and recipient allowlist

- BUILD.md: supplier email out through the OutLayer Gmail connector with a recipient allowlist; Reply-To on the demo domain. Acceptance: off-list email is refused by the connector policy.
- Sources: the recipient allowlist exists (`recipients`, `recipient_domains`, refusal `policy_denied:`) and is the owner's policy, so the off-list check is real ([gmail-connector](https://skills.outlayer.ai/gmail-connector/SKILL.md)). But `send` has **no Reply-To or header field** and the From is always the connected Gmail account; the connector cannot read replies. An empty policy (the default after connecting) allows anyone, and attachments are refused unless `max_attachment_kb` is set. Each refused send still costs $0.011 and one trial call.
- Safest build option: drop Reply-To from the design. Connect a dedicated demo Gmail account; set its policy to `recipients` = the four supplier mailboxes, `max_recipients: 1`, `max_per_day` small, `subject_prefix`, and `max_attachment_kb` only if we attach POs. Route replies in by Gmail forwarding from that account to the inbound webhook address (manual owner setup) or by having the simulated supplier mailboxes reply straight to the inbound address. Verify the allowlist with `status` before sending, and make the off-list refusal test a single deliberate call.

### 10.6 WASI P2 dock check with a wasm-hash-bound release secret

- BUILD.md: attested dock check as an OutLayer WASI P2 module; the release secret is bound to its `--wasm-hash`. Acceptance: a release request not from the approved dock-check build is refused.
- Sources: WASI P2 and `--wasm-hash` secret rows exist ([outlayer-cli](https://skills.outlayer.ai/outlayer-cli/SKILL.md)). But a wasm-hash row is what a **direct `run --wasm`** reads, and direct runs use on-chain mode (a NEAR tx to `outlayer.testnet`), not the HTTPS `/call/{owner}/{project}` path; a new hash row admits everyone unless `--access whitelist:...` is set. The WASI wallet host functions offer no `ft_transfer`, so the module cannot move `usdc.fakes.testnet` through them; it would need the escrow `wk_` as a secret and HTTP calls to the custody API (unverified that outbound calls to the OutLayer API are allowed from a worker). And the escrow `wk_` is derivable from the parent key (10.1), so a secret bound to the build is not the only way to release. OutLayer's signing keys with `bind: "wasm"` give a key tied to the exact code sha256 ([signing-keys](https://skills.outlayer.ai/building-outlayer-apps/references/signing-keys.md)), and each run returns an `attestation_url` carrying wasm, input and output hashes ([TEE attestation](https://app.outlayer.ai/docs/tee-attestation)).
- Safest build option: the dock check only computes and signs `{po, received, unit_price, release, hold}` with a `bind: "wasm"` signing key (or as a project run whose attestation carries the wasm hash). `convex/near/escrow.ts` releases only when the signature verifies against the pinned public key of the approved build and the attestation's wasm hash equals the pinned hash; anything else is refused and logged. If we keep a secret, bind it with `--access whitelist:<our account>` and document the on-chain run mode. README states that the refusal is enforced by Evernear's release code checking the attestation, while the TEE-enforced limits are the escrow policy's exits and caps.

### 10.7 Deadline refund

- BUILD.md acceptance: no release by the deadline refunds Astro.
- Sources: OutLayer policies have `time_restrictions` (allowed hours and days), not an expiry that moves funds; payment-check expiry blocks API claims but needs an explicit reclaim ([full docs](https://app.outlayer.ai/llms-full.txt), [payment-checks](https://skills.outlayer.ai/agent-custody/references/payment-checks.md)).
- Safest build option: a Convex scheduled function at the deadline that transfers the escrow balance back to Astro (Astro is on the escrow whitelist) and records the proof; test it with convex-test fake timers. Say in the README that the refund is triggered by Evernear's scheduler, not by the chain.

### 10.8 Private inference and the no-leak check

- BUILD.md: document reads on NEAR AI Cloud private inference; no plain-text BOM in any outbound call except to private inference.
- Sources: Incognito models on the same endpoint run outside a TEE ([models](https://docs.near.ai/cloud/models.md)).
- Safest build option: an allowlist of Confidential TEE model ids in code, checked against a non-empty verified `model_attestations[]` before each read; the no-leak test also asserts the model id is on that list.

### 10.9 Final payout "on Haoyun's chain"

- BUILD.md: the mainnet finale pays on Haoyun's chain.
- Sources: a payment-check claim lands in the claimer's intents balance; moving to another chain is a separate `/wallet/v1/intents/withdraw` with `chain`, which needs the `cross_chain_withdraw` type and capability in policy and `async: true` ([payment-checks](https://skills.outlayer.ai/agent-custody/references/payment-checks.md), [api-index](https://skills.outlayer.ai/agent-custody/references/api-index.md), [full docs](https://app.outlayer.ai/llms-full.txt)). 1Click has bridge minimums (`upstream_rejected`), so a $3.42 cross-chain leg may be refused (unverified).
- Safest build option: quote with `withdraw/dry-run` first; if the amount is under the bridge minimum, settle on NEAR (intents transfer to Haoyun's account) and label the scaled amounts on screen, rather than raising amounts without Luca's yes.
