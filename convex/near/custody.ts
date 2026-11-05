// Astro's wallet on OutLayer agent custody (testnet). Owner keys stay with Astro;
// Evernear only ever holds the capped wk_ key the owner policy restricts.
// Endpoints: docs/NOTES.md section 1.
import { httpJson, outlayerBase, proofHash, redact, sha256Hex, TESTNET_EXPLORER, type Fetch, type ProofSink } from "./http";

export const USDC_TESTNET = "usdc.fakes.testnet";
const PATH = "convex/near/custody.ts";

export interface Registered { api_key: string; wallet_id: string; near_account_id: string; handoff_url?: string }

export function policyHandoffUrl(apiKey: string) {
  return `https://app.outlayer.ai/wallet?key=${encodeURIComponent(apiKey)}`;
}

/** The owner policy Astro signs. Amounts are in token base units (USDC has 6 decimals). */
export function ownerPolicy(i: { walletId: string; whitelist: string[]; perTxUsdc: number; approvers: { id: string; pubkey?: string }[]; threshold: number }) {
  return {
    wallet_id: i.walletId,
    rules: {
      transaction_types: ["call", "transfer"],
      allowed_tokens: [USDC_TESTNET],
      addresses: { mode: "whitelist", list: i.whitelist },
      limits: { per_transaction: { [USDC_TESTNET]: String(Math.round(i.perTxUsdc * 1e6)) } },
    },
    approval: { threshold: { required: i.threshold }, approvers: i.approvers.map((a) => ({ ...a, role: "signer" })) },
  };
}

export const usdcUnits = (cents: number) => String(cents * 10_000);

export class Custody {
  constructor(private o: { fetch: Fetch; apiKey?: string; sink: ProofSink; idem?: () => string }) {}
  private base = outlayerBase();
  private auth() {
    if (!this.o.apiKey) throw new Error("OUTLAYER_API_KEY not configured");
    return { Authorization: `Bearer ${this.o.apiKey}` };
  }

  async register(): Promise<Registered> {
    const r = await httpJson<Registered>({ fetch: this.o.fetch, base: this.base, method: "POST", path: "/register", body: {} });
    await this.o.sink({ kind: "wallet", label: "Wallet registered", call: "POST /register", codePath: `${PATH}#register`, network: "testnet", hash: await proofHash(r.requestText, r.responseText), response: redact(r.json), replay: false, synthetic: false });
    return r.json;
  }

  async address(): Promise<{ wallet_id: string; address: string; public_key: string }> {
    const r = await httpJson<{ wallet_id: string; address: string; public_key: string }>({ fetch: this.o.fetch, base: this.base, method: "GET", path: "/wallet/v1/address?chain=near", headers: this.auth() });
    return r.json;
  }

  async policy(): Promise<unknown> {
    const r = await httpJson({ fetch: this.o.fetch, base: this.base, method: "GET", path: "/wallet/v1/policy", headers: this.auth() });
    await this.o.sink({ kind: "policy", label: "Owner policy read back", call: "GET /wallet/v1/policy", codePath: `${PATH}#policy`, network: "testnet", hash: await proofHash(r.requestText, r.responseText), response: r.json, replay: false, synthetic: false });
    return r.json;
  }

  async balance(token = USDC_TESTNET): Promise<string> {
    const r = await httpJson<{ balance: string }>({ fetch: this.o.fetch, base: this.base, method: "GET", path: `/wallet/v1/balance?chain=near&token=${token}`, headers: this.auth() });
    return r.json.balance;
  }

  /** USDC transfer: ft_transfer on the token contract, 1 yocto deposit. */
  async payUsdc(i: { to: string; cents: number; memo: string; label: string; kind?: string }) {
    const body = {
      receiver_id: USDC_TESTNET, method_name: "ft_transfer",
      args: { receiver_id: i.to, amount: usdcUnits(i.cents), memo: i.memo }, gas: "30000000000000", deposit: "1",
    };
    const r = await httpJson<{ request_id: string; status: string; tx_hash?: string }>({
      fetch: this.o.fetch, base: this.base, method: "POST", path: "/wallet/v1/call",
      headers: { ...this.auth(), "X-Idempotency-Key": this.o.idem?.() ?? crypto.randomUUID() }, body,
    });
    await this.o.sink({
      kind: i.kind ?? "payment_receipt", label: i.label, call: "POST /wallet/v1/call ft_transfer", codePath: `${PATH}#payUsdc`, network: "testnet",
      hash: r.json.tx_hash ?? (await proofHash(r.requestText, r.responseText)),
      explorerUrl: r.json.tx_hash ? TESTNET_EXPLORER + r.json.tx_hash : undefined, response: r.json, replay: false, synthetic: false,
    });
    return r.json;
  }

  /** A sub-agent wallet: wk_ + hex(sha256("<seed>:0:<parent wk_>")). */
  async createSubWallet(seed: string): Promise<{ apiKey: string; wallet_id: string; near_account_id: string }> {
    if (!this.o.apiKey) throw new Error("OUTLAYER_API_KEY not configured");
    const apiKey = "wk_" + (await sha256Hex(`${seed}:0:${this.o.apiKey}`));
    const key_hash = await sha256Hex(apiKey);
    const r = await httpJson<{ wallet_id: string; near_account_id: string }>({ fetch: this.o.fetch, base: this.base, method: "PUT", path: "/wallet/v1/api-key", headers: this.auth(), body: { seed, key_hash } });
    return { apiKey, ...r.json };
  }

  async request(id: string) {
    return (await httpJson<{ status: string; tx_hash?: string }>({ fetch: this.o.fetch, base: this.base, method: "GET", path: `/wallet/v1/requests/${id}`, headers: this.auth() })).json;
  }
}
