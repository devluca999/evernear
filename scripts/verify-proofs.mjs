#!/usr/bin/env node
// Re-verifies every row of the recorded live run (fixtures/recorded/live-run.json) against public
// testnet infrastructure and writes docs/hackathon/payment-proofs.json.
//
//   node scripts/verify-proofs.mjs
//
// Base Sepolia hashes (0x...) are read from a public Base Sepolia JSON-RPC: receipt, transaction and
// ERC-20 Transfer logs. NEAR testnet hashes (base58) are read from NEAR testnet RPC (archival, since
// regular nodes drop transactions after a few epochs); when the signer is not in the recorded row it
// is looked up on the nearblocks testnet API first. Tidepool intent ids, refusals and simulated
// signals have no transaction to check and are classified as such. No keys, no secrets, no writes to
// any chain. One failed request never stops the run: the error is recorded in that row.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = resolve(ROOT, "fixtures/recorded/live-run.json");
const SEED = resolve(ROOT, "seed/astro.ts");
const OUT = resolve(ROOT, "docs/hackathon/payment-proofs.json");

const TIMEOUT_MS = 15_000;
const BASE_RPCS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"];
const NEAR_RPCS = ["https://rpc.testnet.near.org", "https://archival-rpc.testnet.near.org", "https://archival-rpc.testnet.fastnear.com"];
const NEARBLOCKS = "https://api-testnet.nearblocks.io/v1/txns/";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DECIMALS = 6;
// The Tidepool omft token on NEAR is named after its Base Sepolia contract.
const BASE_USDC_FROM_ASSET = (asset) => (asset?.match(/base-(0x[0-9a-f]{40})\./i) || [])[1]?.toLowerCase() ?? null;

const fmt6 = (raw) => {
  const v = BigInt(raw);
  const neg = v < 0n, a = neg ? -v : v;
  const s = a.toString().padStart(DECIMALS + 1, "0");
  return `${neg ? "-" : ""}${s.slice(0, -DECIMALS)}.${s.slice(-DECIMALS)}`;
};

async function fetchJson(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { "content-type": "application/json", accept: "application/json", ...(init?.headers || {}) } });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error(`HTTP ${r.status}, non-JSON body: ${text.slice(0, 200)}`); }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
    return body;
  } catch (e) {
    if (e.name === "AbortError") throw new Error(`timeout after ${TIMEOUT_MS} ms: ${url}`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function rpc(url, method, params) {
  const body = await fetchJson(url, { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (body.error) throw new Error(`${method} at ${url}: ${JSON.stringify(body.error).slice(0, 300)}`);
  return body.result;
}

// ---------- Base Sepolia ----------

async function verifyBase(hash, expect) {
  const errors = [];
  for (const url of BASE_RPCS) {
    try {
      const [receipt, tx] = await Promise.all([rpc(url, "eth_getTransactionReceipt", [hash]), rpc(url, "eth_getTransactionByHash", [hash])]);
      if (!receipt || !tx) { errors.push(`${url}: transaction not found`); continue; }
      const transfers = receipt.logs
        .filter((l) => l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC && l.topics.length === 3)
        .map((l) => {
          const raw = BigInt(l.data).toString();
          return { token: l.address.toLowerCase(), from: "0x" + l.topics[1].slice(26).toLowerCase(), to: "0x" + l.topics[2].slice(26).toLowerCase(), amountRaw: raw, amount: fmt6(raw) };
        });
      const status = receipt.status === "0x1" ? "success" : "reverted";
      const match = transfers.find((t) => t.to === expect.recipient && t.amountRaw === expect.amountRaw && (!expect.token || t.token === expect.token));
      const checks = {
        txStatusSuccess: status === "success",
        transferToExpectedRecipient: transfers.some((t) => t.to === expect.recipient),
        amountEqualsExpected: transfers.some((t) => t.amountRaw === expect.amountRaw),
        tokenEqualsExpected: expect.token ? transfers.some((t) => t.token === expect.token) : null,
        allMatchInOneTransfer: Boolean(match),
      };
      let tokenDecimals = null, senderIsContract = null;
      try { if (match) tokenDecimals = parseInt(await rpc(url, "eth_call", [{ to: match.token, data: "0x313ce567" }, "latest"]), 16); } catch (e) { errors.push(`decimals(): ${e.message || e}`); }
      try { if (match) senderIsContract = (await rpc(url, "eth_getCode", [match.from, "latest"])) !== "0x"; } catch (e) { errors.push(`getCode: ${e.message || e}`); }
      checks.tokenDecimalsIs6 = tokenDecimals == null ? null : tokenDecimals === DECIMALS;
      const ok = checks.txStatusSuccess && checks.allMatchInOneTransfer && checks.tokenDecimalsIs6 !== false;
      return {
        method: `Base Sepolia JSON-RPC ${url}: eth_getTransactionReceipt + eth_getTransactionByHash, ERC-20 Transfer logs decoded`,
        status: ok ? "verified" : "mismatch",
        sender: match?.from ?? transfers[0]?.from ?? null,
        recipient: match?.to ?? transfers[0]?.to ?? null,
        details: {
          rpc: url,
          txStatus: status,
          blockNumber: parseInt(receipt.blockNumber, 16),
          txFrom: tx.from.toLowerCase(),
          txTo: tx.to?.toLowerCase() ?? null,
          transfers,
          tokenDecimals,
          transferSenderIsContract: senderIsContract,
          expected: { recipient: expect.recipient, amountRaw: expect.amountRaw, amount: fmt6(expect.amountRaw), token: expect.token },
          checks,
          ...(errors.length ? { earlierErrors: errors } : {}),
        },
      };
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  return { method: `Base Sepolia JSON-RPC (${BASE_RPCS.join(", ")})`, status: "error", sender: null, recipient: null, details: { errors } };
}

// ---------- NEAR testnet ----------

const parseEvents = (logs) => logs.filter((l) => l.startsWith("EVENT_JSON:")).map((l) => { try { return JSON.parse(l.slice(11)); } catch { return { unparsed: l }; } });

function summarizeNearEvents(events) {
  const out = [];
  for (const ev of events) {
    for (const d of ev.data || []) {
      if (ev.standard === "nep245" && /^mt_(transfer|burn|mint)$/.test(ev.event)) {
        d.token_ids.forEach((tok, i) => out.push({ standard: "nep245", event: ev.event, token: tok, from: d.old_owner_id ?? d.owner_id ?? null, to: d.new_owner_id ?? (ev.event === "mt_mint" ? d.owner_id : null), amountRaw: d.amounts[i], amount: fmt6(d.amounts[i]) }));
      } else if (ev.standard === "nep141" && /^ft_(transfer|burn|mint)$/.test(ev.event)) {
        out.push({ standard: "nep141", event: ev.event, from: d.old_owner_id ?? d.owner_id ?? null, to: d.new_owner_id ?? null, amountRaw: d.amount, amount: fmt6(d.amount), memo: d.memo ?? null });
      } else if (ev.standard === "dip4" && ev.event === "transfer") {
        for (const [tok, amt] of Object.entries(d.tokens || {})) out.push({ standard: "dip4", event: "transfer", token: tok, from: d.account_id, to: d.receiver_id, amountRaw: amt, amount: fmt6(amt) });
      } else if (ev.standard === "dip4" && ev.event === "token_diff") {
        for (const [tok, amt] of Object.entries(d.diff || {})) out.push({ standard: "dip4", event: "token_diff", token: tok, account: d.account_id, amountRaw: amt, amount: fmt6(amt) });
      } else if (ev.standard === "dip4" && ev.event === "ft_withdraw") {
        out.push({ standard: "dip4", event: "ft_withdraw", token: d.token, from: d.account_id, to: d.receiver_id, amountRaw: d.amount, amount: fmt6(d.amount), memo: d.memo ?? null });
      }
    }
  }
  return out;
}

async function nearblocksSigner(hash) {
  const body = await fetchJson(NEARBLOCKS + hash);
  const t = body?.txns?.[0];
  if (!t) throw new Error(`nearblocks: no transaction ${hash}`);
  return { signer: t.signer_account_id, receiver: t.receiver_account_id, success: t.outcomes?.status ?? null, block: t.block?.block_height ?? null };
}

async function verifyNear(hash, knownSender, expect) {
  const errors = [];
  let sender = knownSender, nb = null;
  if (!sender) {
    try { nb = await nearblocksSigner(hash); sender = nb.signer; } catch (e) { errors.push(String(e.message || e)); }
  }
  if (sender) {
    for (const url of NEAR_RPCS) {
      try {
        const r = await rpc(url, "tx", { tx_hash: hash, sender_account_id: sender, wait_until: "NONE" });
        const outcomes = [r.transaction_outcome, ...r.receipts_outcome];
        const failures = outcomes.filter((o) => o.outcome.status?.Failure).map((o) => ({ executor: o.outcome.executor_id, failure: o.outcome.status.Failure }));
        const allLogs = outcomes.flatMap((o) => o.outcome.logs);
        const events = parseEvents(allLogs);
        const transfers = summarizeNearEvents(events);
        const success = r.status && "SuccessValue" in r.status && failures.length === 0;
        let checks = null, ok = success;
        if (expect) {
          const m = transfers.find((t) => t.amountRaw === expect.amountRaw && (!expect.recipient || t.to === expect.recipient) && (!expect.from || t.from === expect.from));
          checks = { txSuccess: success, transferMatchesExpected: Boolean(m) };
          ok = success && Boolean(m);
        }
        return {
          method: `NEAR testnet RPC ${url}: tx (sender ${sender}${knownSender ? ", from the recorded row" : ", from nearblocks"}), receipts and EVENT_JSON logs read`,
          status: ok ? "verified" : success ? "mismatch" : "failed-on-chain",
          sender: r.transaction.signer_id,
          recipient: r.transaction.receiver_id,
          details: {
            rpc: url,
            signer: r.transaction.signer_id,
            receiver: r.transaction.receiver_id,
            finalExecutionStatus: r.final_execution_status ?? null,
            status: r.status,
            receiptFailures: failures,
            methods: r.transaction.actions.map((a) => a.FunctionCall?.method_name ?? Object.keys(a)[0]),
            tokenMovements: transfers,
            ...(expect ? { expected: { ...expect, amount: fmt6(expect.amountRaw) }, checks } : {}),
            otherEvents: events.filter((e) => !(e.standard === "nep245" || e.standard === "nep141" || (e.standard === "dip4" && ["transfer", "token_diff", "ft_withdraw"].includes(e.event)))).map((e) => ({ standard: e.standard, event: e.event })),
            ...(errors.length ? { earlierErrors: errors } : {}),
          },
        };
      } catch (e) {
        errors.push(String(e.message || e));
      }
    }
  }
  if (nb) {
    return { method: "nearblocks testnet API only (NEAR RPC failed)", status: nb.success ? "indexer-only" : "failed-on-chain", sender: nb.signer, recipient: nb.receiver, details: { nearblocks: nb, errors } };
  }
  return { method: `NEAR testnet RPC (${NEAR_RPCS.join(", ")}) and nearblocks`, status: "error", sender: null, recipient: null, details: { errors } };
}

// ---------- row meaning ----------

const isBase = (h) => /^0x[0-9a-fA-F]{64}$/.test(h);
const isNear = (h) => /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(h);

function describe(row, supplier) {
  const L = row.label, k = row.kind, req = row.response?.request || row.response?.details?.request || {};
  const m = (re) => re.test(L);
  if (k === "policy" && row.call.includes("agent_create")) return { stage: "commit-setup", businessMeaning: "Open the PO 1042 escrow account on Tidepool with a policy: pay only the supplier or Astro, at most the PO total per transaction.", commercialCents: 6300000 };
  if (k === "enclave") return { stage: "enroll", businessMeaning: "Enroll the release gate (OutLayer TEE worker) for PO 1042: the grant token is derived inside the enclave, only its hash leaves.", commercialCents: null };
  if (k === "policy" && row.call.includes("grant_issue") && m(/release gate/)) return { stage: "grant", businessMeaning: "Issue the payout grant to the release gate only. Evernear's server never holds it.", commercialCents: null };
  if (k === "swap") return { stage: "swap", businessMeaning: "Treasury funding step: swap NEAR-side test USDC into Base Sepolia test USDC (omft) inside NEAR Intents, so the commit can be paid in the payout asset.", commercialCents: null };
  if (k === "escrow") return { stage: "commit", businessMeaning: "Commit the PO total: move $63,000 (scaled $63.00) from Astro's treasury account into the PO 1042 escrow account.", commercialCents: 6300000, expect: { amountRaw: req.amount, recipient: req.recipient } };
  if (k === "signal") return { stage: "signal", businessMeaning: `Release condition input: ${row.response?.event ?? "signal"} (${row.response?.source ?? "?"} feed).`, commercialCents: null };
  if (k === "payout" && m(/Advance/)) return { stage: "advance", businessMeaning: "Advance: 30% of $63,000 = $18,900 to Haoyun after bill of lading and export clearance.", commercialCents: 1890000, expect: { amountRaw: req.amount, recipient: supplier } };
  if (k === "payout" && m(/Balance/)) return { stage: "balance", businessMeaning: "Balance for the 44 motors delivered: 44 x $1,260 = $55,440 less the $18,900 advance = $36,540, after import clearance and dock count.", commercialCents: 3654000, expect: { amountRaw: req.amount, recipient: supplier } };
  if (k === "refusal" && row.response?.layer === "grant") return { stage: "refused-offlist", businessMeaning: "Attempted $36,540 withdraw to an off-list address (0x...dead), sent from Evernear's server, which holds no grant on the account. Refused by Tidepool at the grant layer (403 grant_invalid).", commercialCents: 3654000 };
  if (k === "refusal") return { stage: "refused-offlist", businessMeaning: "Same off-list balance attempt refused locally by Evernear's deterministic release rule (engine/escrow.ts) before any network call: address_not_allowed.", commercialCents: 3654000 };
  if (k === "policy" && row.call.includes("policy_update")) return { stage: "owner-only", businessMeaning: "Policy revision 2: the supplier destination is removed; the account may now pay only Astro.", commercialCents: null };
  if (k === "policy" && row.call.includes("grant_issue")) return { stage: "owner-only", businessMeaning: "Grant to Evernear that can only return money to Astro (under the owner-only policy).", commercialCents: null };
  if (k === "reclaim") return { stage: "reclaim", businessMeaning: "Return the held part to Astro: 6 motors not delivered x $1,260 = $7,560.", commercialCents: 756000, expect: { amountRaw: req.amount, recipient: req.recipient } };
  if (k === "policy" && row.call.includes("grant_revoke")) return { stage: "revoke", businessMeaning: `Revoke grant ${row.response?.details?.grant_id ?? "?"} on the PO 1042 account.`, commercialCents: null };
  if (k === "freeze") return { stage: "freeze", businessMeaning: "Freeze the PO 1042 account permanently (policy revision 3).", commercialCents: null };
  if (k === "wallet") return { stage: "close", businessMeaning: "Close summary: account frozen, grants revoked, balance 0, kept as the order's receipt.", commercialCents: null };
  return { stage: k, businessMeaning: L, commercialCents: null };
}

const testnetUnitsOf = (cents) => (cents == null ? null : { raw: String(BigInt(cents) * 10n), amount: fmt6(BigInt(cents) * 10n) }); // 1:1,000 scale, 6 decimals: cents * 10

// ---------- Nov 5 probe (docs/NOTES.md section 14) ----------

async function verifyProbeNov5(supplier, checkedAt) {
  const src = "docs/NOTES.md section 14, \"Live probe of our PO path, Nov 5 2026\"";
  const entries = [];
  const push = (e) => { entries.push(e); process.stdout.write(`[probe-nov5] ${e.classification.padEnd(28)} ${String(e.verification.status).padEnd(30)} ${e.txId}\n`); };

  const swap = await verifyNear("J8f6eQ9QqHu3KUdNNEfXtpPuzCKCXaJd4jbvxobyrEDy", null, null);
  push({ label: "Treasury swap: 45 NEAR USDC into Base USDC (notes record 44.9955 out)", businessMeaning: "Funding step for the probe, not a payment.", commercialCents: null, testnetUnits: null, network: "NEAR testnet", sender: swap.sender, recipient: swap.recipient, txId: "J8f6eQ9QqHu3KUdNNEfXtpPuzCKCXaJd4jbvxobyrEDy", explorerUrl: "https://testnet.nearblocks.io/txns/J8f6eQ9QqHu3KUdNNEfXtpPuzCKCXaJd4jbvxobyrEDy", verification: { method: swap.method, checkedAt, status: swap.status, details: swap.details }, codePath: src, classification: swap.status === "verified" ? "real-testnet-verified" : "real-testnet-unverifiable" });

  push({ label: "Lock: treasury transferred 38.000000 Base USDC into PO account agent_fe8606f9c6dc60f3f1768ed9", businessMeaning: "Commit for the older $38,000 scenario, scaled to $38.00.", commercialCents: 3800000, testnetUnits: testnetUnitsOf(3800000), network: "Tidepool / NEAR testnet", sender: "treasury agent_bd29fdad161bb80b3b07599c", recipient: "agent_fe8606f9c6dc60f3f1768ed9", txId: "DB11Cg1ibKAgb1TUxRHZPzCT11BpL7GWqnX4xKi1FarE", explorerUrl: null, verification: { method: "This is an Intents intent hash, not a NEAR transaction hash; the notes record no NEAR tx hash for the lock. Not looked up as a tx.", checkedAt, status: "not-independently-verifiable", details: { recordedIn: src } }, codePath: src, classification: "provider-intent-id" });

  push({ label: "Withdraw to 0x000000000000000000000000000000000000dead with a valid grant: 403 policy_destination_denied, layer policy", businessMeaning: "Off-list destination refused by the account's destination allowlist while the caller held a valid grant.", commercialCents: null, testnetUnits: null, network: "Tidepool (community-run testnet), HTTP 403", sender: "grant holder on agent_fe8606f9c6dc60f3f1768ed9", recipient: "0x000000000000000000000000000000000000dead", txId: "none", explorerUrl: null, verification: { method: "none: recorded in project notes, no tx (synchronous 403); not independently verifiable", checkedAt, status: "no-tx", details: { recordedIn: src, code: "policy_destination_denied", layer: "policy" } }, codePath: src, classification: "refusal-no-tx" });

  const base = await verifyBase("0x34da89551ea6036bc288b1726bbeb049a787a5f0adfd5079e7748f46cde206d7", { recipient: supplier, amountRaw: "34200000", token: "0x38d81431b9f76d9699af7517040d5221d9dea252" });
  push({ label: "Same grant, withdraw 34.200000 to Haoyun on Base Sepolia", businessMeaning: "Paid to the allowlisted supplier with the same grant that was refused for 0x...dead.", commercialCents: 3420000, testnetUnits: testnetUnitsOf(3420000), network: "Base Sepolia (chain 84532)", sender: base.sender, recipient: base.recipient, txId: "0x34da89551ea6036bc288b1726bbeb049a787a5f0adfd5079e7748f46cde206d7", explorerUrl: "https://sepolia.basescan.org/tx/0x34da89551ea6036bc288b1726bbeb049a787a5f0adfd5079e7748f46cde206d7", verification: { method: base.method, checkedAt, status: base.status, details: base.details }, codePath: src, classification: base.status === "verified" ? "real-testnet-verified" : "real-testnet-unverifiable" });

  const leg = await verifyNear("PjeJk6tLYS7woEAykkYa1HgfPVruEhAHAbmsZQTHu9B", null, { amountRaw: "34200000" });
  push({ label: "NEAR leg of the 34.20 withdraw (ft_withdraw on the Tidepool verifier)", businessMeaning: "Burns the omft on NEAR testnet and triggers the Base Sepolia send.", commercialCents: 3420000, testnetUnits: testnetUnitsOf(3420000), network: "NEAR testnet", sender: leg.sender, recipient: leg.recipient, txId: "PjeJk6tLYS7woEAykkYa1HgfPVruEhAHAbmsZQTHu9B", explorerUrl: "https://testnet.nearblocks.io/txns/PjeJk6tLYS7woEAykkYa1HgfPVruEhAHAbmsZQTHu9B", verification: { method: leg.method, checkedAt, status: leg.status, details: leg.details }, codePath: src, classification: leg.status === "verified" ? "real-testnet-verified" : "real-testnet-unverifiable" });

  push({ label: "Transfer 3.800000 back to the treasury", businessMeaning: "Held part returned in the older scenario.", commercialCents: 380000, testnetUnits: testnetUnitsOf(380000), network: "Tidepool / NEAR testnet", sender: "agent_fe8606f9c6dc60f3f1768ed9", recipient: "treasury agent_bd29fdad161bb80b3b07599c", txId: null, explorerUrl: null, verification: { method: "none: the notes record SUCCESS but no tx hash", checkedAt, status: "no-hash-recorded", details: { recordedIn: src } }, codePath: src, classification: "real-testnet-unverifiable" });

  return {
    scenario: "Older deal, separate from PO 1042: $38.00 locked / $34.20 paid / $3.80 returned (1:1,000 of $38,000 / $34,200 / $3,800)",
    source: src,
    poAccount: "agent_fe8606f9c6dc60f3f1768ed9",
    omitted: [{ what: "docs/MORNING.md Nov 5 Convex run Base tx 0xa1ca4983cccd01c2f40f3565c453ebb44668... ", why: "only a truncated prefix exists in the repo and git history; the full hash was not found, so it is not verified or listed" }],
    entries,
  };
}

// ---------- main ----------

async function main() {
  const fixture = JSON.parse(await readFile(FIXTURE, "utf8"));
  const seed = await readFile(SEED, "utf8");
  const sup = seed.match(/id:\s*"haoyun"[^}]*receiveAddress:\s*"(0x[0-9a-fA-F]{40})"/);
  const supplier = sup ? sup[1].toLowerCase() : null;
  const checkedAt = new Date().toISOString();
  const entries = [];

  for (const row of fixture.rows) {
    const d = describe(row, supplier);
    const det = row.response?.details || {};
    const h = row.hash;
    const entry = {
      label: row.label,
      stage: d.stage,
      kind: row.kind,
      businessMeaning: d.businessMeaning,
      commercialCents: d.commercialCents,
      commercialUsd: d.commercialCents == null ? null : (d.commercialCents / 100).toFixed(2),
      testnetUnits: testnetUnitsOf(d.commercialCents),
      network: null,
      sender: null,
      recipient: null,
      txId: h,
      explorerUrl: row.explorerUrl,
      verification: null,
      codePath: row.codePath,
      call: row.call,
      recordedAt: new Date(row.at).toISOString(),
      classification: null,
      related: [],
    };

    if (isBase(h)) {
      entry.network = "Base Sepolia (chain 84532)";
      const v = await verifyBase(h.toLowerCase(), { recipient: (d.expect?.recipient || "").toLowerCase(), amountRaw: d.expect?.amountRaw, token: BASE_USDC_FROM_ASSET(det.request?.asset) });
      entry.sender = v.sender; entry.recipient = v.recipient;
      entry.verification = { method: v.method, checkedAt, status: v.status, details: v.details };
      entry.classification = v.status === "verified" ? "real-testnet-verified" : "real-testnet-unverifiable";
      // NEAR legs of the same payout: the ft_withdraw intent tx and the OutLayer request_execution tx.
      if (det.tx_hash && isNear(det.tx_hash)) {
        const rv = await verifyNear(det.tx_hash, null, { amountRaw: d.expect?.amountRaw });
        entry.related.push({ role: "NEAR testnet leg: ft_withdraw intent on the Tidepool verifier that burns the omft and triggers the Base Sepolia send", txId: det.tx_hash, explorerUrl: `https://testnet.nearblocks.io/txns/${det.tx_hash}`, verification: { method: rv.method, checkedAt, status: rv.status, sender: rv.sender, recipient: rv.recipient, details: rv.details } });
      }
      if (row.response?.gate_tx && isNear(row.response.gate_tx)) {
        const rv = await verifyNear(row.response.gate_tx, "evernear-luca.testnet", null);
        entry.related.push({ role: "OutLayer testnet: request_execution of the release gate WASM (signed by evernear-luca.testnet)", txId: row.response.gate_tx, explorerUrl: `https://testnet.nearblocks.io/txns/${row.response.gate_tx}`, verification: { method: rv.method, checkedAt, status: rv.status, sender: rv.sender, recipient: rv.recipient, details: rv.details } });
      }
    } else if (isNear(h)) {
      entry.network = "NEAR testnet";
      const known = /signed by ([a-z0-9._-]+\.testnet)/.exec(row.call)?.[1] ?? null;
      const v = await verifyNear(h, known, d.expect ? { amountRaw: d.expect.amountRaw, recipient: d.expect.recipient } : null);
      entry.sender = v.sender; entry.recipient = v.recipient;
      entry.verification = { method: v.method, checkedAt, status: v.status, details: v.details };
      entry.classification = v.status === "verified" ? "real-testnet-verified" : "real-testnet-unverifiable";
      if (d.expect) {
        // business-level parties inside the Intents verifier (the tx signer is Tidepool's relayer)
        const mv = (v.details?.tokenMovements || []).find((t) => t.amountRaw === d.expect.amountRaw && t.to === d.expect.recipient);
        if (mv) entry.intentsTransfer = { from: mv.from, to: mv.to, token: mv.token, amountRaw: mv.amountRaw, amount: mv.amount };
      }
    } else if (/^intent_[0-9a-f]+$/.test(h)) {
      entry.network = "Tidepool (community-run testnet of the NEAR Intents Agent API)";
      entry.classification = "provider-intent-id";
      entry.verification = { method: "none available: Tidepool submit-intent id with no on-chain transaction (transaction_hash null in the recorded response)", checkedAt, status: "not-independently-verifiable", details: { recordedStatus: row.response?.status ?? null, type: row.response?.type ?? null, transaction_hash: det.transaction_hash ?? null } };
      entry.sender = det.grant?.owner_message?.owner?.account_id ?? null;
      entry.recipient = det.grant?.wallet_id ?? det.agent_id ?? row.response?.agent_id ?? null;
    } else if (h === "none") {
      entry.network = row.response?.layer === "grant" ? "Tidepool (community-run testnet), HTTP 403" : "none (refused in Evernear's engine before any call)";
      entry.classification = "refusal-no-tx";
      entry.sender = row.response?.sent_by ?? null;
      entry.recipient = row.response?.request?.recipient ?? row.response?.to ?? null;
      entry.verification = { method: "none: a refusal produces no transaction", checkedAt, status: "no-tx", details: { recorded: row.response } };
    } else {
      entry.network = "offchain (simulated)";
      entry.classification = "simulated-offchain-signal";
      entry.verification = { method: "none: simulated carrier/customs/dock feed, not on any chain", checkedAt, status: "simulated", details: { recorded: row.response } };
    }
    if (!entry.related.length) delete entry.related;
    entries.push(entry);
    process.stdout.write(`${entry.classification.padEnd(28)} ${String(entry.verification.status).padEnd(30)} ${h}\n`);
  }

  // Reconciliation: commit = advance + balance + reclaim, on-chain amounts.
  const amt = (stage) => {
    const e = entries.find((x) => x.stage === stage && (x.classification === "real-testnet-verified"));
    if (!e) return null;
    const exp = stage === "commit" || stage === "reclaim" ? e.intentsTransfer?.amountRaw : e.verification.details.transfers?.find((t) => t.to === supplier)?.amountRaw;
    return exp ? BigInt(exp) : null;
  };
  const [c, a, b, r] = ["commit", "advance", "balance", "reclaim"].map(amt);
  const reconciliation = {
    commitRaw: c?.toString() ?? null, advanceRaw: a?.toString() ?? null, balanceRaw: b?.toString() ?? null, reclaimRaw: r?.toString() ?? null,
    sumOutRaw: a != null && b != null && r != null ? (a + b + r).toString() : null,
    reconciles: c != null && a != null && b != null && r != null ? a + b + r === c : null,
    note: "Amounts read from chain: commit and reclaim from NEAR testnet Intents events, advance and balance from Base Sepolia ERC-20 Transfer logs. null means that leg did not verify.",
  };

  // Separate, older scenario: the Nov 5 server-path probe recorded in docs/NOTES.md section 14
  // ($38.00 locked / $34.20 paid / $3.80 returned). Not part of the PO 1042 run above.
  const probe = await verifyProbeNov5(supplier, checkedAt);

  const out = {
    generatedBy: "scripts/verify-proofs.mjs",
    checkedAt,
    source: { fixture: "fixtures/recorded/live-run.json", runId: fixture.runId, deployment: fixture.deployment, releasePath: fixture.releasePath, startedAt: new Date(fixture.startedAt).toISOString() },
    scale: "1:1,000; 6-decimal test USDC; raw units = commercial cents x 10",
    supplier: { id: "haoyun", receiveAddress: supplier, source: "seed/astro.ts" },
    reconciliation,
    entries,
    "probe-nov5": probe,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nreconciliation: ${JSON.stringify(reconciliation)}`);
  console.log(`wrote ${OUT}`);
  // Fail loudly: any recorded tx that read back different from the record, or money that does not reconcile.
  const bad = entries.filter((e) => ["mismatch", "failed-on-chain"].includes(e.verification?.status));
  if (bad.length || reconciliation.reconciles !== true) {
    console.error(`VERIFY FAILED: ${bad.length} mismatched entries; reconciles=${reconciliation.reconciles}`);
    process.exitCode = 1;
  } else console.log("verify passed: every checkable tx matches its record and the money reconciles");
}

main().catch((e) => { console.error(e); process.exit(1); });
