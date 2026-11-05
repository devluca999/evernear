// Per-PO escrow: one OutLayer sub-agent wallet per PO, whitelisted to the supplier and Astro only.
// Two layers refuse a wrong address: the engine's three-exit rule (here, before any call)
// and the wallet's whitelist policy (in the OutLayer TEE).
// Honest limit: the owner can always change the policy or withdraw. This is a visible,
// rule-bound commitment to the supplier, not a lock the supplier can enforce.
import { Custody, ownerPolicy, USDC_TESTNET } from "./custody";
import { type Fetch, type ProofSink } from "./http";
import { release as ruleRelease, reclaimHeld, refundOnDeadline, type Escrow } from "../../engine/escrow";

const PATH = "convex/near/escrow.ts";

export const escrowSeed = (po: string) => `po-${po}`;

export function escrowPolicy(i: { walletId: string; supplier: string; owner: string; lockedCents: number }) {
  return ownerPolicy({ walletId: i.walletId, whitelist: [i.supplier, i.owner], perTxUsdc: i.lockedCents / 100, approvers: [], threshold: 0 });
}

export class EscrowAdapter {
  constructor(private o: { fetch: Fetch; parentApiKey?: string; sink: ProofSink }) {}

  async open(po: string) {
    const parent = new Custody({ fetch: this.o.fetch, apiKey: this.o.parentApiKey, sink: this.o.sink });
    return parent.createSubWallet(escrowSeed(po));
  }

  /** Lock: move the PO total from Astro's wallet into the PO wallet. */
  async lock(i: { po: string; escrowAccount: string; cents: number }) {
    const parent = new Custody({ fetch: this.o.fetch, apiKey: this.o.parentApiKey, sink: this.o.sink });
    await parent.registerStorage(i.escrowAccount);
    return parent.payUsdc({ to: i.escrowAccount, cents: i.cents, memo: `PO ${i.po} escrow`, label: `Locked for PO ${i.po}`, kind: "escrow" });
  }

  /** Release to the supplier. Refused locally, with a proof row, if the address is not an exit. */
  async release(i: { escrow: Escrow; escrowApiKey: string; to: string; cents: number; po: string; nowMs: number }) {
    const rule = ruleRelease(i.escrow, { to: i.to, amountCents: i.cents, nowMs: i.nowMs });
    if (!rule.ok) {
      await this.o.sink({ kind: "refusal", label: "Release refused", call: "engine/escrow.ts release", codePath: `${PATH}#release`, network: "testnet", hash: "none", response: { to: i.to, status: "refused", reason: rule.reason }, replay: false, synthetic: false });
      return { ok: false as const, reason: rule.reason };
    }
    const sub = new Custody({ fetch: this.o.fetch, apiKey: i.escrowApiKey, sink: this.o.sink });
    const r = await sub.payUsdc({ to: i.to, cents: i.cents, memo: `PO ${i.po} release`, label: `Released to supplier for PO ${i.po}`, kind: "release" });
    return { ok: true as const, escrow: rule.escrow, request: r };
  }

  async reclaim(i: { escrow: Escrow; escrowApiKey: string; po: string; nowMs: number }) {
    const rule = reclaimHeld(i.escrow, { to: i.escrow.owner, nowMs: i.nowMs });
    if (!rule.ok) return { ok: false as const, reason: rule.reason };
    const sub = new Custody({ fetch: this.o.fetch, apiKey: i.escrowApiKey, sink: this.o.sink });
    await sub.payUsdc({ to: i.escrow.owner, cents: rule.amountCents, memo: `PO ${i.po} held part returned`, label: `Held part returned to Astro`, kind: "reclaim" });
    return { ok: true as const, escrow: rule.escrow };
  }

  /** Called by a scheduled Convex job at the deadline. */
  async refundIfDue(i: { escrow: Escrow; escrowApiKey: string; po: string; nowMs: number }) {
    const rule = refundOnDeadline(i.escrow, { nowMs: i.nowMs });
    if (!rule.ok) return { ok: false as const, reason: rule.reason };
    const sub = new Custody({ fetch: this.o.fetch, apiKey: i.escrowApiKey, sink: this.o.sink });
    await sub.payUsdc({ to: rule.to, cents: rule.amountCents, memo: `PO ${i.po} deadline refund`, label: "Deadline passed, refunded to Astro", kind: "refund" });
    return { ok: true as const, escrow: rule.escrow };
  }
}

export { USDC_TESTNET };
