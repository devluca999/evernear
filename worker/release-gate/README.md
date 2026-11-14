# release-gate

An OutLayer WASI P2 module that holds the grant token for one order's escrow account on Tidepool and releases money from it only when the stage's signals are present. The token is derived inside the TEE from a key bound to this exact wasm build and to Evernear's NEAR testnet account, so Evernear's server never holds it and cannot release on its own.

Logic: [`src/lib.rs`](src/lib.rs) (pure, no host). Host glue: [`src/main.rs`](src/main.rs). Tests: [`src/tests.rs`](src/tests.rs), against the shared [`vectors.json`](vectors.json). Manifest: [`manifest.json`](manifest.json), embedded in the `outlayer.manifest` custom section.

## The deal it enforces

PO 1042: 50 AM-17 actuator motors at $1,260 ($63,000 locked in the order's own account).

| Stage | Requires | Amount | At $1,260 | At $1,320 |
|---|---|---|---|---|
| advance | `bill_of_lading`, `export_cleared` | locked x advance_percent / 100 | $18,900 | $19,800 |
| balance | `import_cleared`, `dock_count` | received x unit, minus released | 44 x 1,260 - 18,900 = $36,540 | 44 x 1,320 - 19,800 = $38,280 |
| held | (not this module) | locked - released | $7,560 | $7,920 |

Amounts are integer cents. The module refuses rather than rounds (`inexact_amount`), and never lets released plus this release exceed locked (`over_locked`). Tests: `exact_amounts_at_1260`, `exact_amounts_at_1320`, `total_paid_never_above_locked`.

## What it guarantees

- **Only this build, run by Evernear's account, can derive the grant token.** The token is `"ngt_" + base64url_nopad(mac("grant", b"tidepool-grant:v1:" + agent_id))`. The `grant` key has `bind: "wasm"`, so the keystore derives it from this wasm's sha256 plus the run's signer. Any other build, or any other signer running this build, gets a different token, which does not match the hash Astro registered. Test: `token_format`.
- **The token never leaves the module.** Enroll outputs only its sha256. Tests: `enroll_never_outputs_the_token`, `release_output_never_contains_token_or_api_key`.
- **No signal, no withdraw.** Each required signal must be a non-empty object with a string `id` and an `at`; the balance's `dock_count` must also carry `count` equal to `received_qty`. Tests: `advance_refused_without_bill_of_lading`, `advance_refused_without_export_clearance`, `balance_refused_without_import_clearance`, `balance_refused_without_dock_count`, `shared_release_vectors`.
- **Every answer to a release is signed**, refusals included, by the `result` ed25519 key (`bind: "wasm"`), over `evernear-release-gate:v1:` + canonical JSON of the result without `signature`. The module composes every signed byte itself. Tests: `refusal_is_signed_and_sends_nothing`, `signature_vector`.
- **One host.** Requests go only to `https://www.usetidepool.tech/v1/agents/...`, checked in `lib.rs` and again in `main.rs` right before sending; never the mainnet `api.agentsonintents.com`. Test: `only_tidepool_is_allowed`.
- **One payment per stage.** The module sends its own `idempotency-key`, `rg1-<stage>-` + the first 32 hex of sha256(`evernear-release-gate:v1:idem:<agent_id>:<po>:<stage>`). Tidepool replays a repeated key with the same body and refuses it with another body (`idempotency_conflict`). The input's `idempotency_key` is accepted and ignored. Test: `idempotency_vectors`.
- **The API key comes only from the env** (`AGENT_API_KEY`, an OutLayer secret), never from the input. Test: `api_key_comes_only_from_env`.

## v3 (uploaded Nov 14, live on the deployment): the balance needs a signed dock count

v3 = v2 plus one check inside the enclave: the balance is paid only when the dock count carries a signature from a receiving device pinned in the build (`PINNED_DOCK_DEVICES`, the same key as the deployment's `DOCK_DEVICE_KEYS`), over `evernear-dock-count:v1:` + canonical {at, count, device, po}, for this PO and equal to `received_qty`. Refusals: `dock_unsigned`, `dock_unknown_device`, `dock_bad_signature`, `dock_wrong_po`, `dock_count_mismatch`. So a compromised backend can no longer pay a balance on a count it made up; it would need the dock device's key. A signature shows which device reported the count, not that the motors are on the dock. Freshness is checked by the server (`convex/dock.ts`), not here (no clock in the module). sha256 `e60577955c36e09dd078c102704d13c0e27ef33c10635f0257d70883ea887c14`, result key `815975ba…8076`. On chain: a balance with an unsigned count for the closed Nov 6 wallet was refused `dock_unsigned`, signed, nothing sent (tx [`8S4uYwhT…`](https://testnet.nearblocks.io/txns/8S4uYwhTjER6BibGyM6gJ6qFHtc6R6d8DCMJ4WaZLqh1), [fixture](../../fixtures/recorded/gate-v3-unsigned-dock-probe.json)). Tests: `v3_*` in [`src/tests.rs`](src/tests.rs); the shared vectors' balance cases carry a signed count.

## v2 (uploaded Nov 14; superseded by v3, which includes it): it reads the order account instead of trusting the caller

The v1 build (`04f6d241…`, Nov 6, used for the recorded run) takes the committed total, the amount already released and the recipient from its caller. v2 (sha256 `dd90ce689d45c3dcddceb9b92fd42563b0edaad9ab7b974c9a41cd75cbfa8955` with rustc 1.99.1; rebuild to confirm) reads them from Tidepool before it pays:

- `GET /v1/agents/{id}/policy`: the account must be `APPLIED`, not frozen, `destinations.mode: "only"` with exactly one `withdraw` address on Base, and a per-transaction cap. The cap is the committed total (the owner set it to the PO amount at open); the withdraw address is the only recipient.
- `GET /v1/agents/{id}/balances`: what the account still holds; released = committed minus held.
- The caller's `locked_cents` and `to` must equal those, and its `released_cents` may not be less than what has left the account (balances are floored to whole cents, so dust sent in from outside never blocks a release), or the run is refused and signed (`locked_not_on_chain`, `recipient_not_on_chain`, `released_not_on_chain`, `policy_not_restrictive`, `account_frozen`, `policy_withdraw_ambiguous`, `policy_no_cap`, `chain_unreadable`, `chain_unavailable`), and nothing is sent.
- `advance_percent` is pinned in the build (`ADVANCE_PERCENT = 30`, from `policy/astro.json`); any other value is refused (`percent_not_policy`).

Effect: a compromised backend can no longer make the gate overpay by understating what was released, pay a second advance, or pay an address the account's policy does not name. It still supplies the evidence and the dock count. Tests: the `v2_` tests in [`src/tests.rs`](src/tests.rs). **Live on testnet:** uploaded to [FastFS](https://test.fastfs.io/evernear-luca.testnet/outlayer.testnet/dd90ce689d45c3dcddceb9b92fd42563b0edaad9ab7b974c9a41cd75cbfa8955.wasm), API key secret on its hash row (direct calls from `evernear-luca.testnet` only), result key `96f3d04f…94f2`, and the deployment's `RELEASE_GATE_*` point at it. First on-chain run: a release request for the frozen Nov 6 wallet was refused `account_frozen`, signed, nothing sent (tx [`4qXdn52Z…`](https://testnet.nearblocks.io/txns/4qXdn52ZYn6Xwhy5KeXxL3fFqzaaWojp4nyaZcxkp2vH), [fixture](../../fixtures/recorded/gate-v2-frozen-probe.json)). Not yet exercised on a paying order. Deploying v2 was a new wasm, so a new grant key and result key: upload, set the secret on the new hash, set `RELEASE_GATE_WASM_URL`, `RELEASE_GATE_WASM_SHA256` and `RELEASE_GATE_PUBLIC_KEY` (from a probe enroll), and new orders enroll with it.

## What it does not guarantee

- It proves that this exact code ran on the input it was given. The evidence for the signals is supplied by the caller, and in the demo it is simulated. The attestation commits to the input hash, so anyone can see what evidence the release was decided on (`evidence_sha256` in the output), but not that the evidence is true.
- (v1, the deployed build) `released_cents` is supplied by the caller; v2 checks it against the account's balance. A direct wasm run has no project, so the module keeps no state of its own. Two things bound a caller who lies: the order's account holds only the locked total, and the per-stage idempotency key makes a second advance or a second balance a replay or a conflict, not a new payment (as long as Tidepool keeps the key; its retention window is not documented).
- Astro, as owner, can still change the policy, revoke the grant, or issue a grant to someone else. The destinations allowlist (Haoyun and Astro's treasury) is Tidepool policy, not this module.
- The output of an on-chain run is public. That is why only the hash of the token is ever output.
- Tidepool answers a withdraw with 202 and a `correlation_id`; the output's `tx` carries that and any hashes already known. The final status is polled by the caller (`GET /v1/status?correlation_id=...`).

## Why `bind: "wasm"`

A `project` key follows the project's on-chain uuid: whoever publishes the next version signs and derives with the same key, so the token would follow the publisher, not the code. A `wasm` key follows this exact binary: a new build is a new key, a new token, and needs a new grant from Astro. That is the property we want: the code Astro approved is the only code that can release.

The cost: runs must be direct wasm runs, on chain: `outlayer run --wasm <url> '<input>'`, signed by Evernear's NEAR testnet account (the signer is the key's caller). A run through a project is refused before it starts. The manifest also sets `callers` to admit only the direct door (no contract, HTTPS or meta-transaction runs), so no contract Evernear transacts with can start a release under Evernear's key.

## Input and output

Enroll:

```json
{"mode":"enroll","agent_id":"agent_fe8606f9c6dc60f3f1768ed9"}
```
```json
{"agent_id":"agent_fe8606f9c6dc60f3f1768ed9","grant_hash":"<sha256 hex of the token>","mode":"enroll","public_key":"<hex of the result key>"}
```

Astro then issues the grant (`grant_issue`) with `grant_hash` as the commitment.

Release:

```json
{"mode":"release","stage":"balance","po":"1042","agent_id":"agent_fe8606f9c6dc60f3f1768ed9",
 "to":"0x2003975a521c6fa45238dbc402c9e4adcb8863e0","unit_cents":126000,"ordered_qty":50,
 "locked_cents":6300000,"released_cents":1890000,"advance_percent":30,"received_qty":44,
 "signals":{"import_cleared":{"id":"imp-US-1042","at":"2026-11-20T15:00:00Z"},
            "dock_count":{"id":"dock-1042","at":"2026-11-21T10:00:00Z","count":44}}}
```

Success (keys sorted, as signed):

```json
{"agent_id":"...","amount_cents":3654000,"evidence_sha256":"...","held_cents":756000,"ok":true,"po":"1042",
 "public_key":"...","signals":["imp-US-1042","dock-1042"],"signature":"...","stage":"balance",
 "to":"0x...","tx":{"correlation_id":"...","http_status":202,"status":"QUEUED"}}
```

Refusal:

```json
{"agent_id":"...","evidence_sha256":"...","missing":["dock_count"],"ok":false,"po":"1042",
 "public_key":"...","reason":"missing_signals","signature":"...","stage":"balance"}
```

Reasons: `missing_signals`, `bad_stage`, `bad_agent_id`, `bad_recipient`, `bad_terms`, `locked_mismatch`, `over_locked`, `already_released`, `bad_percent`, `inexact_amount`, `missing_received_qty`, `received_over_ordered`, `count_mismatch`, `nothing_due`, `api_key_missing`, `mac_unavailable`, `host_not_allowed`, `withdraw_unknown` (sent or not, run again with the same input), `withdraw_refused` (with `tx.error_code`). Unparseable input answers unsigned `{"ok":false,"reason":"bad_input","detail":...}`.

Verify: drop `signature`, write the rest as canonical JSON (keys sorted, no spaces; `JSON.stringify` with sorted keys for these values), prefix `evernear-release-gate:v1:`, check ed25519 against `public_key`, and check `public_key` is the one enroll returned under an attestation naming this wasm sha256. The output stays within 900 bytes, the on-chain limit (test: `worst_case_output_fits_on_chain`).

The withdraw sent: `POST https://www.usetidepool.tech/v1/agents/{agent_id}/withdraw`, headers `x-api-key`, `x-grant-token`, `idempotency-key`, `content-type: application/json`, body `{"amount":"<cents x 10>","asset":"nep141:base-0x38d81431b9f76d9699af7517040d5221d9dea252.tp-omft.testnet","chain":"base","recipient":"<to>"}`. The amount is Base USDC base units at the testnet scale of 1:1,000: $18,900 is `"18900000"` (18.900000 test USDC). Test: `testnet_scale`, `withdraw_request_shape`.

## Build

```bash
cargo test
cargo build --release --target wasm32-wasip2
shasum -a 256 target/wasm32-wasip2/release/release-gate.wasm
wasm-tools component wit target/wasm32-wasip2/release/release-gate.wasm | grep 'import outlayer:'   # encryption-keys and signing-keys
wasm-tools print target/wasm32-wasip2/release/release-gate.wasm | grep -c 'outlayer.manifest'       # 1
```

The sha256 depends on the toolchain (built here with rustc 1.99.1). For a hash anyone can reproduce, build with OutLayer's `scripts/build_github_wasm.sh --target wasm32-wasip2`.

## Deploy (needs Luca)

Every step below is a real testnet action and is not done by code or tests.

1. `outlayer login testnet` with Evernear's NEAR testnet account (the account that will sign every run).
2. `outlayer upload target/wasm32-wasip2/release/release-gate.wasm`: prints the FastFS URL and the sha256.
3. Set the API key on the row a direct run reads, limited to Evernear's account (a new hash row otherwise admits everyone): `outlayer secrets set '{"AGENT_API_KEY":"<naa_ key>"}' --wasm-hash <sha256> --access whitelist:<evernear account>`.
4. Fund the account for on-chain runs (testnet NEAR only).
5. Per order: `outlayer run --wasm <url> '{"mode":"enroll","agent_id":"<agent>"}'`, then Astro signs `grant_issue` with the returned `grant_hash`.
6. Per stage: `outlayer run --wasm <url> '<release input>'`.

A new build changes the sha256, so it needs a new secret row, a new enroll and a new grant for every open order.
