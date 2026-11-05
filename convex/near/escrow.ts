// Per-PO escrow: one Agent API account per PO (Tidepool testnet), owned by Astro's owner key.
// Its policy lets money go to exactly two places: a withdraw to the supplier's address on Base
// Sepolia, and a transfer back to Astro's treasury account; at most the PO amount per transaction;
// `frozen` is the kill switch. Two layers refuse a wrong address: the engine's three-exit rule (here,
// before any call) and the account's policy (in the Agent API, shown live by policyRefusal).
//
// Honest limit: this is a commitment, not a lock. Tidepool's server enforces the policy, not the
// chain, and Astro as owner can sign a policy change or unfreeze at any time. The supplier cannot
// enforce it. Amounts run at 1:1,000 of the story (engine/money.ts TESTNET_SCALE).
import { AgentApiClient, BASE_USDC, NEAR_USDC, grantHash, grantToken, type ActResult, type Owner } from "./agentapi";
import type { Fetch, ProofSink } from "./http";
import { release as ruleRelease, reclaimHeld, refundOnDeadline, type Escrow } from "../../engine/escrow";
import { formatUsd, scaleTestnet, TESTNET_SCALE } from "../../engine/money";

const PATH = "convex/near/escrow.ts";
/** One faucet drip is 100 test NEAR USDC; the swap into Base USDC keeps a little back for its fee. */
const SWAP_HEADROOM = 1_000_000n;

/** Story cents to 6 decimal test USDC units at 1:1,000. */
export const testnetUnits = (storyCents: number): bigint => BigInt(scaleTestnet(storyCents)) * 10_000n;
const shown = (storyCents: number) => `${formatUsd(scaleTestnet(storyCents))} (1:${TESTNET_SCALE.toLocaleString("en-US")} of ${formatUsd(storyCents)})`;

export function poPolicy(i: { supplier: string; owner: string; lockedCents: number }) {
  return {
    frozen: false,
    actions: ["transfer", "withdraw"],
    confidential: false,
    owner_approval: false,
    assets: "any",
    limits: { per_transaction: { [BASE_USDC]: String(testnetUnits(i.lockedCents)) } },
    max_actions_per_hour: null,
    destinations: { mode: "only", list: [
      { action: "withdraw", chain: "base", address: i.supplier, memo: null },
      { action: "transfer", address: i.owner, confidential: false },
    ] },
    budget: { daily_usd: null, weekly_usd: null, monthly_usd: null },
    timelock_ms: 0,
  };
}

/** Astro's treasury: funds each PO account. Any destination, since PO accounts are made as needed. */
export function treasuryPolicy() {
  return {
    frozen: false, actions: ["swap", "transfer"], confidential: false, owner_approval: false, assets: "any",
    limits: { per_transaction: { [BASE_USDC]: "50000000", [NEAR_USDC]: "100000000" } }, max_actions_per_hour: null,
    destinations: { mode: "any", list: [] }, budget: { daily_usd: null, weekly_usd: null, monthly_usd: null }, timelock_ms: 0,
  };
}

export interface PoAccount { agentId: string; account: string; grantHash: string }
type Moved = { ok: true; escrow: Escrow } | { ok: false; reason: string };

export class EscrowAdapter {
  private client: AgentApiClient;
  private treasuryAcct?: string;
  constructor(private o: { fetch: Fetch; apiKey?: string; baseUrl: string; owner?: Owner; sink: ProofSink; treasuryId?: string; idem?: () => string }) {
    this.client = new AgentApiClient({ fetch: o.fetch, apiKey: o.apiKey, baseUrl: o.baseUrl, owner: o.owner, sink: o.sink, idem: o.idem });
  }

  private grant = (label: string) => grantToken(this.o.apiKey!, label);
  private poGrant = (agentId: string) => this.grant(`pool:${agentId}`);
  private treasuryId() {
    if (!this.o.treasuryId) throw new Error("AGENT_TREASURY_ID not configured");
    return this.o.treasuryId;
  }
  private ownerRef() {
    const ow = this.o.owner;
    if (!ow) throw new Error("owner key not configured (AGENT_OWNER_PRIVATE_KEY_PKCS8)");
    return { type: "near", account_id: ow.accountId, public_key: ow.publicKey };
  }
  private async issueGrant(agentId: string, label: string, token: string) {
    await this.client.owned("grant_issue", { agent_id: agentId, label, credential: grantHash(token), expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() },
      { kind: "policy", label: `Grant issued to Evernear (${label})`, codePath: `${PATH}#grant` });
  }

  /** One time setup (scripts): Astro's treasury agent and its grant. Returns the agent id. */
  async createTreasury(): Promise<string> {
    const st = await this.client.owned("agent_create", { name: "Astro Robotics treasury", owner: this.ownerRef(), policy: treasuryPolicy() },
      { kind: "wallet", label: "Astro treasury account created", codePath: `${PATH}#createTreasury` });
    const id = st.details!.agent_id as string;
    await this.issueGrant(id, "evernear treasury", this.grant("treasury"));
    return id;
  }

  async treasuryAccount(): Promise<string> {
    this.treasuryAcct ??= (await this.client.wallet(this.treasuryId())).near_account_id;
    return this.treasuryAcct;
  }

  /** A PO account with the PO's policy: reuses a pool account when given one (rewrites its policy), else creates one. */
  async open(i: { po: string; supplier: string; lockedCents: number; slot?: string }): Promise<PoAccount> {
    const policy = poPolicy({ supplier: i.supplier, owner: await this.treasuryAccount(), lockedCents: i.lockedCents });
    const label = `PO ${i.po} account: pays only the supplier or Astro, at most ${shown(i.lockedCents)}`;
    let agentId = i.slot;
    if (agentId) {
      let cur = await this.client.policy(agentId);
      if (cur.policy.frozen) {
        await this.client.owned("agent_unfreeze", { agent_id: agentId }, { kind: "policy", label: `PO account unfrozen for PO ${i.po}`, codePath: `${PATH}#open` });
        cur = await this.client.policy(agentId);
      }
      await this.client.owned("policy_update", { agent_id: agentId, expected_revision: cur.revision, policy }, { kind: "policy", label, codePath: `${PATH}#open` });
    } else {
      const st = await this.client.owned("agent_create", { name: `Evernear PO account (first PO ${i.po})`, owner: this.ownerRef(), policy }, { kind: "policy", label, codePath: `${PATH}#open` });
      agentId = st.details!.agent_id as string;
      await this.issueGrant(agentId, "evernear pool", this.poGrant(agentId));
    }
    const account = (await this.client.wallet(agentId)).near_account_id;
    return { agentId, account, grantHash: grantHash(this.poGrant(agentId)) };
  }

  /** Makes sure the treasury holds enough Base USDC: a faucet drip if NEAR USDC is short, then a swap. */
  async fund(i: { cents: number }): Promise<{ ok: boolean; reason?: string }> {
    const need = testnetUnits(i.cents);
    const t = this.treasuryId(), g = this.grant("treasury");
    const have = await this.client.balance(t, BASE_USDC);
    if (have >= need) return { ok: true };
    const swapIn = need - have + SWAP_HEADROOM;
    if ((await this.client.balance(t, NEAR_USDC)) < swapIn) {
      const d = await this.client.act(t, null, "deposit", { origin_asset: NEAR_USDC, testnet_faucet: true }, { kind: "faucet", label: "Treasury funded from the testnet faucet", codePath: `${PATH}#fund` });
      if (!d.ok) return { ok: false, reason: d.code };
    }
    const s = await this.client.act(t, g, "swap", { origin_asset: NEAR_USDC, destination_asset: BASE_USDC, amount: String(swapIn) }, { kind: "swap", label: "Treasury swapped test USDC into Base Sepolia USDC", codePath: `${PATH}#fund` });
    return s.ok ? { ok: true } : { ok: false, reason: s.code };
  }

  /** Commit: move the PO total from Astro's treasury into the PO account. */
  async lock(i: { po: string; ref: string; agentId: string; account: string; cents: number }): Promise<ActResult> {
    return this.client.act(this.treasuryId(), this.grant("treasury"), "transfer", { asset: BASE_USDC, amount: String(testnetUnits(i.cents)), recipient: i.account },
      { kind: "escrow", label: `Committed for PO ${i.po}: ${shown(i.cents)}`, codePath: `${PATH}#lock` }, `${i.ref}:lock`);
  }

  /** Release to the supplier on Base Sepolia. Refused in code, with a proof row, if the address is not an exit. */
  async release(i: { escrow: Escrow; agentId: string; to: string; cents: number; po: string; ref: string; nowMs: number }): Promise<Moved> {
    const rule = ruleRelease(i.escrow, { to: i.to, amountCents: i.cents, nowMs: i.nowMs });
    if (!rule.ok) {
      await this.o.sink({ kind: "refusal", label: "Release refused", call: "engine/escrow.ts release", codePath: `${PATH}#release`, network: "testnet", hash: "none", response: { to: i.to, status: "refused", reason: rule.reason }, replay: false, synthetic: false });
      return { ok: false, reason: rule.reason };
    }
    const amount = testnetUnits(rule.escrow.releasedCents) - testnetUnits(i.escrow.releasedCents);
    const r = await this.client.act(i.agentId, this.poGrant(i.agentId), "withdraw", { asset: BASE_USDC, amount: String(amount), chain: "base", recipient: i.to },
      { kind: "payout", label: `Paid supplier on Base Sepolia for PO ${i.po}: ${shown(i.cents)}`, codePath: `${PATH}#release` }, `${i.ref}:release:${rule.escrow.releasedCents}`);
    return r.ok ? { ok: true, escrow: rule.escrow } : { ok: false, reason: r.code };
  }

  /** The second layer, live: send a withdraw to an off-list address straight to the API, past the engine rule, and record its refusal. */
  async policyRefusal(i: { agentId: string; to: string; cents: number; po: string; ref: string }): Promise<ActResult> {
    return this.client.act(i.agentId, this.poGrant(i.agentId), "withdraw", { asset: BASE_USDC, amount: String(testnetUnits(i.cents)), chain: "base", recipient: i.to },
      { kind: "payout", label: `PO ${i.po} account refused a withdraw to ${i.to}`, codePath: `${PATH}#policyRefusal` }, `${i.ref}:offlist`);
  }

  private async back(i: { escrow: Escrow; next: Escrow; agentId: string; po: string; ref: string; step: string; kind: string; label: string }): Promise<Moved> {
    const held = (e: Escrow) => testnetUnits(e.lockedCents) - testnetUnits(e.releasedCents) - testnetUnits(e.reclaimedCents);
    const amount = held(i.escrow);
    const r = await this.client.act(i.agentId, this.poGrant(i.agentId), "transfer", { asset: BASE_USDC, amount: String(amount), recipient: i.escrow.owner },
      { kind: i.kind, label: i.label, codePath: `${PATH}#${i.step}` }, `${i.ref}:${i.step}`);
    return r.ok ? { ok: true, escrow: i.next } : { ok: false, reason: r.code };
  }

  /** The held part back to Astro after a partial release. */
  async reclaim(i: { escrow: Escrow; agentId: string; po: string; ref: string; nowMs: number }): Promise<Moved> {
    const rule = reclaimHeld(i.escrow, { to: i.escrow.owner, nowMs: i.nowMs });
    if (!rule.ok) return { ok: false, reason: rule.reason };
    return this.back({ ...i, next: rule.escrow, step: "reclaim", kind: "reclaim", label: `Held part returned to Astro for PO ${i.po}: ${shown(rule.amountCents)}` });
  }

  /** Called by the scheduled job in convex/near/deadline.ts. */
  async refundIfDue(i: { escrow: Escrow; agentId: string; po: string; ref: string; nowMs: number }): Promise<Moved> {
    const rule = refundOnDeadline(i.escrow, { nowMs: i.nowMs });
    if (!rule.ok) return { ok: false, reason: rule.reason };
    return this.back({ ...i, next: rule.escrow, step: "refund", kind: "refund", label: `Deadline passed, refunded to Astro for PO ${i.po}: ${shown(rule.amountCents)}` });
  }

  /** Kill switch: Astro freezes the PO account; every move after this is refused with wallet_frozen. */
  async freeze(i: { agentId: string; po: string }) {
    return this.client.owned("agent_freeze", { agent_id: i.agentId }, { kind: "freeze", label: `PO ${i.po} account frozen by Astro`, codePath: `${PATH}#freeze` });
  }
}
