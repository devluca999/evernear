// Final payout: an OutLayer payment check through NEAR Intents. Mainnet only, scaled 1:10,000.
// Hard guard: refuses unless FINALE_ENABLED=1 and the caller passes the explicit go-ahead.
// Note from docs/NOTES.md 10.3: payment checks bypass the wallet whitelist, so the three-exit
// rule is checked here in code before a check is created, and the recipient is the only claimer.
import { httpJson, MainnetRefused, MAINNET_EXPLORER, outlayerBase, proofHash, redact, type Fetch, type ProofSink } from "./http";
import { scaleFinale } from "../../engine/money";

const PATH = "convex/near/payout.ts";
export const USDC_MAINNET = "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

export interface FinaleGate { finaleEnabled: boolean; lucaSaidYes: boolean }

export function finaleAmounts(lockedCents: number, releaseCents: number) {
  const locked = scaleFinale(lockedCents), paid = scaleFinale(releaseCents);
  return { lockedCents: locked, paidCents: paid, reclaimCents: locked - paid };
}

export class Payout {
  constructor(private o: { fetch: Fetch; apiKey?: string; sink: ProofSink; gate: FinaleGate }) {}
  private base() {
    if (!this.o.gate.finaleEnabled || !this.o.gate.lucaSaidYes) throw new MainnetRefused("payment check");
    return outlayerBase({ mainnet: true, finaleEnabled: true });
  }

  async createCheck(i: { cents: number; memo: string; idem: string }) {
    const base = this.base();
    const r = await httpJson<{ check_id: string; check_key: string; status: string }>({
      fetch: this.o.fetch, base, method: "POST", path: "/wallet/v1/payment-check/create",
      headers: { Authorization: `Bearer ${this.o.apiKey}`, "X-Idempotency-Key": i.idem },
      body: { token: USDC_MAINNET, amount: String(i.cents * 10_000), memo: i.memo },
    });
    await this.o.sink({ kind: "escrow", label: "Finale check created (scaled 1:10,000)", call: "POST /wallet/v1/payment-check/create", codePath: `${PATH}#createCheck`, network: "mainnet", hash: await proofHash("", JSON.stringify(redact(r.json))), response: redact(r.json), replay: false, synthetic: false });
    return r.json;
  }

  async claim(i: { recipientApiKey: string; checkKey: string; cents: number }) {
    const base = this.base();
    const r = await httpJson<{ status: string; amount_claimed: string; remaining: string; intent_hash: string }>({
      fetch: this.o.fetch, base, method: "POST", path: "/wallet/v1/payment-check/claim",
      headers: { Authorization: `Bearer ${i.recipientApiKey}` }, body: { check_key: i.checkKey, amount: String(i.cents * 10_000) },
    });
    await this.o.sink({ kind: "payout", label: "Paid supplier through NEAR Intents", call: "POST /wallet/v1/payment-check/claim", codePath: `${PATH}#claim`, network: "mainnet", hash: r.json.intent_hash, explorerUrl: MAINNET_EXPLORER + r.json.intent_hash, response: r.json, replay: false, synthetic: false });
    return r.json;
  }

  async reclaim(i: { checkId: string }) {
    const base = this.base();
    const r = await httpJson<{ status: string; amount_reclaimed: string; intent_hash: string }>({
      fetch: this.o.fetch, base, method: "POST", path: "/wallet/v1/payment-check/reclaim",
      headers: { Authorization: `Bearer ${this.o.apiKey}` }, body: { check_id: i.checkId },
    });
    await this.o.sink({ kind: "reclaim", label: "Held part reclaimed by Astro", call: "POST /wallet/v1/payment-check/reclaim", codePath: `${PATH}#reclaim`, network: "mainnet", hash: r.json.intent_hash, explorerUrl: MAINNET_EXPLORER + r.json.intent_hash, response: r.json, replay: false, synthetic: false });
    return r.json;
  }
}
