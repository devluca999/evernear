// The NEAR Intents Agent API, on Tidepool's community-run testnet by default (docs/NOTES.md section 14).
// Tidepool is not affiliated with NEAR; it runs NEAR's Intents verifier on testnet. Mainnet is only a
// base URL switch, and agentApiBase refuses it without Luca's explicit yes.
//
// Two kinds of call:
// - owner intents (agent_create, grant_issue, policy_update, agent_freeze, agent_unfreeze), signed by
//   Astro's owner key with NEP-413; and
// - agent actions (transfer, withdraw, swap, deposit) under a grant token. Grant tokens are derived at
//   run time from AGENT_API_KEY, so a token is never stored; Tidepool keeps only its sha256.
// Every call writes a proof row through the sink, refusals included.
import { createAgentApi, AgentApiError, type AgentApi } from "@near-intents-agent-api/sdk";
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { base64url } from "@scure/base";
import { MainnetRefused, TESTNET_EXPLORER, redact, type Fetch, type ProofSink } from "./http";

export const TIDEPOOL_BASE = "https://www.usetidepool.tech";
const MAINNET_HOST = "api.agentsonintents.com";
export const NEAR_USDC = "nep141:usdc.tidepool-sandbox.testnet";
export const BASE_USDC = "nep141:base-0x38d81431b9f76d9699af7517040d5221d9dea252.tp-omft.testnet";
export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org/tx/";
const PATH = "convex/near/agentapi.ts";

/** Tidepool testnet unless told otherwise. The mainnet host needs Luca's explicit yes; any other host is refused. */
export function agentApiBase(raw: string | undefined = undefined, o: { mainnetYes?: boolean } = {}): string {
  const url = new URL((raw?.trim() || TIDEPOOL_BASE).replace(/\/v1\/?$/, ""));
  const base = url.origin;
  if (url.host === "www.usetidepool.tech" || url.host === "usetidepool.tech") return base;
  if (url.host === MAINNET_HOST) {
    if (!o.mainnetYes) throw new MainnetRefused("Agent API mainnet host");
    return base;
  }
  throw new Error(`unknown Agent API host ${url.host}: only Tidepool testnet, or mainnet with Luca's yes`);
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const utf8 = (s: string) => new TextEncoder().encode(s);
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const concat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const bstr = (s: string) => { const x = utf8(s); return concat(u32(x.length), x); };
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export interface Nep413Payload { message: string; nonce: string; recipient: string }

/** sha256(borsh(tag 2^31+413, message, nonce[32], recipient, callbackUrl none)), the bytes NEP-413 signs. */
export function nep413Hash(p: Nep413Payload): Uint8Array {
  const nonce = fromB64(p.nonce);
  if (nonce.length !== 32) throw new Error("NEP-413 nonce must be 32 bytes");
  return sha256(concat(u32(2 ** 31 + 413), bstr(p.message), nonce, bstr(p.recipient), new Uint8Array([0])));
}

export interface Owner { accountId: string; publicKey: string; sign(p: Nep413Payload): string }

/** Astro's owner key from its PKCS8 DER (base64). The seed is the DER's last 32 bytes. */
export function ownerFromPkcs8(i: { accountId: string; publicKey: string; pkcs8Base64: string }): Owner {
  const der = fromB64(i.pkcs8Base64);
  if (der.length !== 48) throw new Error("expected a 48 byte ed25519 PKCS8 key");
  const seed = der.slice(16);
  return { accountId: i.accountId, publicKey: i.publicKey, sign: (p) => toB64(ed25519.sign(nep413Hash(p), seed)) };
}

/** `ngt_` + base64url(HMAC-SHA256(apiKey, "evernear-grant:<label>")): 43 characters, as Tidepool requires. */
export function grantToken(apiKey: string, label: string): string {
  return "ngt_" + base64url.encode(hmac(sha256, utf8(apiKey), utf8(`evernear-grant:${label}`))).replace(/=+$/, "");
}
export const grantHash = (token: string) => hex(sha256(utf8(token)));

export interface ExecDetails { agent_id?: string; tx_hash?: string | null; destination_tx_hash?: string | null; destination_tx_url?: string | null; transaction_hash?: string | null; intent_hash?: string | null; [k: string]: unknown }
export interface Exec { correlation_id: string; status: string; failure_code: string | null; details?: ExecDetails }
export type ActResult = { ok: true; exec: Exec } | { ok: false; code: string; layer?: string; status: number };
export interface ProofMeta { kind: string; label: string; codePath: string }

const TERMINAL = new Set(["SUCCESS", "FAILED", "REFUNDED", "UNCERTAIN", "NEEDS_REVIEW"]);

export class AgentApiClient {
  private api: AgentApi;
  private network: "testnet" | "mainnet";
  constructor(private o: { fetch: Fetch; apiKey?: string; baseUrl: string; owner?: Owner; sink: ProofSink; idem?: () => string; maxPolls?: number }) {
    if (!o.apiKey) throw new Error("AGENT_API_KEY not configured");
    this.network = new URL(o.baseUrl).host === MAINNET_HOST ? "mainnet" : "testnet";
    this.api = createAgentApi({ apiKey: o.apiKey, baseUrl: o.baseUrl, fetch: ((u: string | URL, init?: RequestInit) => o.fetch(String(u), init)) as typeof fetch });
  }

  private idem = () => this.o.idem?.() ?? crypto.randomUUID();

  private async settle(id: string): Promise<Exec> {
    for (let i = 0; i < (this.o.maxPolls ?? 6); i++) {
      const s = (await this.api.getStatus(id, { waitMs: 30_000 })) as unknown as Exec;
      if (TERMINAL.has(s.status)) return s;
    }
    throw new Error(`status ${id} did not settle`);
  }

  private async proof(m: ProofMeta, call: string, exec: Exec | null, response: unknown) {
    const d = exec?.details ?? {};
    const hash = d.destination_tx_hash ?? d.tx_hash ?? d.transaction_hash ?? d.intent_hash ?? exec?.correlation_id ?? "none";
    const explorerUrl = d.destination_tx_url ?? (d.tx_hash ? TESTNET_EXPLORER + d.tx_hash : undefined);
    await this.o.sink({ kind: m.kind, label: m.label, call, codePath: m.codePath, network: this.network, hash, explorerUrl, response: redact(response), replay: false, synthetic: false });
  }

  /** An owner intent: generate, sign with Astro's owner key, submit, wait. Throws unless it succeeds. */
  async owned(type: string, body: Record<string, unknown>, m: ProofMeta): Promise<Exec> {
    const owner = this.o.owner;
    if (!owner) throw new Error("owner key not configured (AGENT_OWNER_PRIVATE_KEY_PKCS8)");
    const g = (await this.api.generateIntent({ type, ...body } as never, { idempotencyKey: this.idem() })) as unknown as { correlation_id: string; intent: { payload: Nep413Payload } };
    const payload = g.intent.payload;
    await this.api.submitIntent({ type, correlation_id: g.correlation_id, signed_data: { standard: "nep413", payload, public_key: owner.publicKey, signature: owner.sign(payload) } } as never);
    const exec = await this.settle(g.correlation_id);
    await this.proof(m, `POST /v1/submit-intent ${type}`, exec, { type, status: exec.status, failure_code: exec.failure_code, details: exec.details });
    if (exec.status !== "SUCCESS") throw new Error(`${type} ended ${exec.status} (${exec.failure_code})`);
    return exec;
  }

  /** An agent action under a grant. A refusal (policy, frozen, grant) is a proof row too, and is returned, not thrown. */
  async act(agentId: string, grant: string | null, kind: "transfer" | "withdraw" | "swap" | "deposit", body: Record<string, unknown>, m: ProofMeta, idempotencyKey = this.idem()): Promise<ActResult> {
    const api = grant ? this.api.forGrant(grant) : this.api;
    const call = `POST /v1/agents/{id}/${kind}`;
    let accepted: Exec;
    try {
      accepted = (await (api[kind] as (a: string, b: unknown, o: unknown) => Promise<unknown>).call(api, agentId, body, { idempotencyKey })) as Exec;
    } catch (e) {
      if (!(e instanceof AgentApiError)) throw e;
      await this.o.sink({ kind: "refusal", label: `${m.label}: refused`, call, codePath: m.codePath, network: this.network, hash: "none", response: { request: body, status: e.status, code: e.code, layer: e.layer }, replay: false, synthetic: false });
      return { ok: false, code: e.code ?? "error", layer: e.layer, status: e.status };
    }
    const exec = TERMINAL.has(accepted.status) ? accepted : await this.settle(accepted.correlation_id);
    await this.proof(exec.status === "SUCCESS" ? m : { ...m, kind: "failed", label: `${m.label}: ${exec.status}` }, call, exec, { request: body, status: exec.status, failure_code: exec.failure_code, details: exec.details });
    if (exec.status !== "SUCCESS") return { ok: false, code: exec.failure_code ?? exec.status, layer: "execution", status: 202 };
    return { ok: true, exec };
  }

  async wallet(agentId: string) { return (await this.api.getWallet(agentId)) as unknown as { wallet_id: string; near_account_id: string }; }
  async policy(agentId: string) { return (await this.api.getPolicy(agentId)) as unknown as { revision: number; policy: { frozen?: boolean; [k: string]: unknown } }; }
  async balance(agentId: string, asset: string): Promise<bigint> {
    const b = (await this.api.getBalances(agentId)) as unknown as { balances: { asset_id: string; balance_raw: string }[] };
    return BigInt(b.balances.find((x) => x.asset_id === asset)?.balance_raw ?? "0");
  }
}

export { PATH as AGENT_API_PATH };
