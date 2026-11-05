/* eslint-disable @typescript-eslint/no-explicit-any -- a test fake that reads and writes loose JSON bodies */
// An in-memory stand-in for the Tidepool Agent API (/v1), for unit tests only. It enforces what the
// live probe showed (docs/NOTES.md section 14): NEP-413 owner signatures, grant hashes, frozen,
// destinations "only", per-transaction limits and balances, with the same error codes and layers.
// Unit tests use this and never create real agents.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base58 } from "@scure/base";
import type { Fetch } from "@/convex/near/http";

export const FAKE_BASE = "https://www.usetidepool.tech";

interface Agent {
  id: string; account: string; ownerPub: string; policy: Record<string, any>; revision: number;
  grants: string[]; balances: Record<string, bigint>;
}
interface Exec { correlation_id: string; status: string; failure_code: string | null; type: string; details: Record<string, unknown> }
export interface Sent { method: string; path: string; headers: Record<string, string>; body: any }

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const bstr = (s: string) => { const x = new TextEncoder().encode(s); return concat(u32(x.length), x); };
const concat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const err = (status: number, code: string, layer: string) => [status, { errors: [{ status: String(status), code, layer, title: code, detail: code, meta: { retryable: false } }], meta: { request_id: "req_fake" } }] as const;

export function fakeTidepool() {
  let n = 0;
  const id = (p: string) => `${p}_${String(++n).padStart(4, "0")}`;
  const agents = new Map<string, Agent>();
  const execs = new Map<string, Exec>();
  const intents = new Map<string, { type: string; body: any; payload: any }>();
  const idem = new Map<string, { body: string; correlation_id: string }>();
  const payouts: { chain: string; recipient: string; asset: string; amount: bigint; tx: string }[] = [];
  const sent: Sent[] = [];
  const byAccount = (acct: string) => [...agents.values()].find((a) => a.account === acct);

  function done(type: string, details: Record<string, unknown>, status = "SUCCESS", failure: string | null = null): Exec {
    const e = { correlation_id: id("exec"), status, failure_code: failure, type, details };
    execs.set(e.correlation_id, e);
    return e;
  }

  function verify(pub: string, payload: { message: string; nonce: string; recipient: string }, sig: string) {
    const hash = sha256(concat(u32(2 ** 31 + 413), bstr(payload.message), b64(payload.nonce), bstr(payload.recipient), new Uint8Array([0])));
    return ed25519.verify(b64(sig), hash, base58.decode(pub.replace(/^ed25519:/, "")));
  }

  function applyIntent(type: string, body: any, pub: string): Exec {
    if (type === "agent_create") {
      const accountBytes = sha256(new TextEncoder().encode(`acct-${n}`));
      const a: Agent = { id: id("agent"), account: hex(accountBytes), ownerPub: pub, policy: body.policy, revision: 1, grants: [], balances: {} };
      agents.set(a.id, a);
      return done(type, { agent_id: a.id, revision: 1, policy_hash: "ph" + n });
    }
    const a = agents.get(body.agent_id);
    if (!a) return done(type, {}, "FAILED", "agent_not_found");
    if (a.ownerPub !== pub) return done(type, {}, "FAILED", "not_owner");
    switch (type) {
      case "grant_issue": { a.grants.push(body.credential); return done(type, { grant: { grant_id: id("grant"), label: body.label } }); }
      case "policy_update": {
        if (body.expected_revision !== a.revision) return done(type, {}, "FAILED", "revision_conflict");
        a.policy = body.policy; a.revision += 1;
        return done(type, { revision: a.revision, policy_hash: "ph" + n });
      }
      case "agent_freeze": a.policy = { ...a.policy, frozen: true }; a.revision += 1; return done(type, { revision: a.revision });
      case "agent_unfreeze": a.policy = { ...a.policy, frozen: false }; a.revision += 1; return done(type, { revision: a.revision });
    }
    return done(type, {}, "FAILED", "unsupported_intent_type");
  }

  /** The agent-side money actions. Returns an HTTP answer: [status, body]. */
  function act(a: Agent, kind: string, body: any, grant: string | undefined): readonly [number, unknown] {
    if (kind !== "deposit") {
      if (!grant || !a.grants.includes(hex(sha256(new TextEncoder().encode(grant))))) return err(403, "grant_invalid", "grant");
    }
    if (body.dry) return [200, { dry: true, type: kind, quote: { ...body, network_fee: "0" }, fee: { amount_usd: 0, percent: 0 }, warnings: [] }];
    if (a.policy.frozen && kind !== "deposit") return err(409, "wallet_frozen", "wallet");
    if (kind === "deposit") {
      const k = "nep141:usdc.tidepool-sandbox.testnet";
      a.balances[k] = (a.balances[k] ?? 0n) + 100_000_000n;
      return [202, done("deposit", { action: "deposit", near_account_id: a.account })];
    }
    if (!a.policy.actions.includes(kind)) return err(403, "policy_action_denied", "policy");
    const asset = kind === "swap" ? body.origin_asset : body.asset;
    if (kind !== "swap") {
      const d = a.policy.destinations;
      const listed = d.list.some((x: any) => x.action === kind && x.address === body.recipient && (kind !== "withdraw" || x.chain === body.chain));
      if ((d.mode === "only" && !listed) || (d.mode === "except" && listed)) return err(403, "policy_destination_denied", "policy");
    }
    const cap = a.policy.limits?.per_transaction?.[asset];
    if (cap !== undefined && BigInt(body.amount) > BigInt(cap)) return err(403, "policy_transaction_limit_exceeded", "policy");
    const amount = BigInt(body.amount);
    if ((a.balances[asset] ?? 0n) < amount) return [202, done(kind, { failure_reason: "insufficient_balance" }, "FAILED", "insufficient_balance")];
    a.balances[asset] -= amount;
    const tx = "NEARTX" + n;
    if (kind === "swap") {
      a.balances[body.destination_asset] = (a.balances[body.destination_asset] ?? 0n) + (amount * 9999n) / 10000n;
      return [202, done(kind, { action: "swap", amount_out: String((amount * 9999n) / 10000n), tx_hash: tx })];
    }
    if (kind === "transfer") {
      const to = byAccount(body.recipient);
      if (to) to.balances[asset] = (to.balances[asset] ?? 0n) + amount;
      return [202, done(kind, { action: "transfer", request: body, intent_hash: "IH" + n, tx_hash: null })];
    }
    const dest = "0x" + "b".repeat(63) + (n % 10);
    payouts.push({ chain: body.chain, recipient: body.recipient, asset, amount, tx: dest });
    return [202, done(kind, { action: "withdraw", request: body, intent_hash: "IH" + n, tx_hash: tx, destination_chain: body.chain, destination_tx_hash: dest, destination_tx_url: `https://sepolia.basescan.org/tx/${dest}` })];
  }

  async function route(method: string, url: URL, headers: Record<string, string>, body: any): Promise<readonly [number, unknown]> {
    const p = url.pathname;
    if (!headers["x-api-key"]?.startsWith("naa_")) return err(401, "unauthorized", "auth");
    if (method === "POST" && p === "/v1/generate-intent") {
      const correlation_id = id("intent");
      const payload = { message: JSON.stringify({ type: body.type, n }), nonce: btoa(String.fromCharCode(...sha256(new TextEncoder().encode(correlation_id)))), recipient: "verifier.tidepool-sandbox.testnet" };
      const { type, ...rest } = body;
      intents.set(correlation_id, { type, body: rest, payload });
      return [201, { correlation_id, type, intent: { standard: "nep413", payload } }];
    }
    if (method === "POST" && p === "/v1/submit-intent") {
      const it = intents.get(body.correlation_id);
      if (!it) return err(404, "not_found", "request");
      const sd = body.signed_data;
      if (!verify(sd.public_key, sd.payload, sd.signature)) return err(400, "invalid_signature", "request");
      const e = applyIntent(it.type, it.body, sd.public_key);
      execs.delete(e.correlation_id);
      const out = { ...e, correlation_id: body.correlation_id };
      execs.set(body.correlation_id, out);
      return [202, out];
    }
    if (method === "GET" && p === "/v1/status") {
      const e = execs.get(url.searchParams.get("correlation_id") ?? "");
      return e ? [200, e] : err(404, "not_found", "request");
    }
    const m = p.match(/^\/v1\/agents\/([^/]+)\/?(\w+)?$/);
    const a = m && agents.get(m[1]);
    if (!a) return err(404, "agent_not_found", "request");
    const sub = m![2];
    if (method === "GET" && sub === "wallet") return [200, { wallet_id: a.id, near_account_id: a.account, evm_account_id: null, solana_account_id: null }];
    if (method === "GET" && sub === "policy") return [200, { wallet_id: a.id, revision: a.revision, policy: a.policy, status: "APPLIED" }];
    if (method === "GET" && sub === "balances") return [200, { near_account_id: a.account, balances: Object.entries(a.balances).map(([asset_id, v]) => ({ asset_id, balance_raw: String(v) })) }];
    if (method === "POST" && sub && ["transfer", "withdraw", "deposit", "swap"].includes(sub)) {
      if (!body.dry) {
        const k = headers["idempotency-key"];
        if (!k) return err(400, "idempotency_key_required", "request");
        const prev = idem.get(k);
        if (prev) return prev.body === JSON.stringify(body) ? [202, execs.get(prev.correlation_id)] : err(409, "idempotency_conflict", "request");
        const out = act(a, sub, body, headers["x-grant-token"]);
        if (out[0] === 202) idem.set(k, { body: JSON.stringify(body), correlation_id: (out[1] as Exec).correlation_id });
        return out;
      }
      return act(a, sub, body, headers["x-grant-token"]);
    }
    return err(404, "no_route", "request");
  }

  const fetch: Fetch = async (input, init) => {
    const url = new URL(String(input));
    const h: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => { h[k] = v; });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    sent.push({ method: init?.method ?? "GET", path: url.pathname + url.search, headers: h, body });
    if (url.origin !== FAKE_BASE) return new Response(JSON.stringify({ error: "wrong host" }), { status: 599 });
    const [status, out] = await route(init?.method ?? "GET", url, h, body);
    return new Response(JSON.stringify(out), { status, headers: { "content-type": "application/json" } });
  };

  /** Test setup only: put a balance in an agent without going through the API. */
  const credit = (agentId: string, asset: string, amount: bigint) => { const a = agents.get(agentId)!; a.balances[asset] = (a.balances[asset] ?? 0n) + amount; };
  return { fetch, sent, agents, payouts, credit };
}
