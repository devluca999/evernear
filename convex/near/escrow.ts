// Per-PO escrow: one Agent API account per PO (Tidepool testnet), owned by Astro's owner key.
// Its policy lets money go to exactly two places: a withdraw to the supplier's address on Base
// Sepolia, and a transfer back to Astro's treasury account; at most the PO amount per transaction;
// `frozen` is the kill switch. Each order gets a fresh account and never shares it: once the order
// is settled the account is closed (Evernear's grant revoked, the account frozen) and kept as the
// order's receipt. A key holds 25 agents on Tidepool, so `open` refuses with accounts_full when none
// is left. Two layers refuse a wrong address: the engine's three-exit rule (here,
// before any call) and the account's policy (in the Agent API, shown live by policyRefusal).
//
// Honest limit: this is a commitment, not a lock. Tidepool's server enforces the policy, not the
// chain, and Astro as owner can sign a policy change or unfreeze at any time. The supplier cannot
// enforce it. Amounts run at 1:1,000 of the story (engine/money.ts TESTNET_SCALE).
import { AgentApiClient, BASE_USDC, NEAR_USDC, agentRoom, grantHash, grantToken, isAgentQuotaError, type ActResult, type Owner } from "./agentapi";
import type { Fetch, ProofSink } from "./http";
import { closeWallet, release as ruleRelease, reclaimHeld, refundOnDeadline, type Escrow } from "../../engine/escrow";
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

/** Astro's treasury: funds each PO account. Any destination, since each order gets a new account. */
export function treasuryPolicy() {
  return {
    frozen: false, actions: ["swap", "transfer"], confidential: false, owner_approval: false, assets: "any",
    limits: { per_transaction: { [BASE_USDC]: "50000000", [NEAR_USDC]: "100000000" } }, max_actions_per_hour: null,
    destinations: { mode: "any", list: [] }, budget: { daily_usd: null, weekly_usd: null, monthly_usd: null }, timelock_ms: 0,
  };
}

export interface PoAccount { agentId: string; account: string; grantHash: string; grantId?: string }
type Moved = { ok: true; escrow: Escrow } | { ok: false; reason: string };

/** The key has no agent left for a new order wallet. A refusal proof row was recorded before this is thrown. */
export class AccountsFull extends Error {
  readonly reason = "accounts_full";
  constructor(readonly limit?: number) { super("accounts_full"); }
}

export class EscrowAdapter {
  private client: AgentApiClient;
  private treasuryAcct?: string;
  constructor(private o: { fetch: Fetch; apiKey?: string; baseUrl: string; owner?: Owner; sink: ProofSink; treasuryId?: string; idem?: () => string }) {
    this.client = new AgentApiClient({ fetch: o.fetch, apiKey: o.apiKey, baseUrl: o.baseUrl, owner: o.owner, sink: o.sink, idem: o.idem });
  }

  private grant = (label: string) => grantToken(this.o.apiKey!, label);
  // The "pool:" prefix is kept from when accounts were reused: it is only the token's derivation
  // string, and changing it would orphan the grant of every account opened before.
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
  private async issueGrant(agentId: string, label: string, token: string): Promise<string | undefined> {
    const st = await this.client.owned("grant_issue", { agent_id: agentId, label, credential: grantHash(token), expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() },
      { kind: "policy", label: `Grant issued to Evernear (${label})`, codePath: `${PATH}#grant` });
    return (st.details?.grant as { grant_id?: string } | null | undefined)?.grant_id;
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

  /** Records the accounts_full refusal as a proof row, then throws AccountsFull. */
  private async full(po: string, call: string, room: { limit: number; used: number } | null, code?: string): Promise<never> {
    const limit = room?.limit ?? 25;
    await this.o.sink({ kind: "refusal", label: `This key has used all ${limit} order wallets; a new Tidepool key is needed`, call, codePath: `${PATH}#open`,
      network: this.client.network, hash: "none", response: { po, status: "refused", reason: "accounts_full", limit: room?.limit ?? null, used: room?.used ?? null, code: code ?? null }, replay: false, synthetic: false });
    throw new AccountsFull(room?.limit);
  }

  /** How many agents the key may hold and holds, or null when the quota answer is missing or unknown. */
  async room(): Promise<{ limit: number; used: number } | null> {
    try { return agentRoom(await this.client.quotas()); } catch { return null; }
  }

  /**
   * A new PO account for this order, with the PO's policy, and Evernear's grant on it. Never reuses
   * an account. Refuses with AccountsFull (and a proof row) when the key has no agent left: from the
   * quota answer before any intent, or from agent_create's own quota refusal.
   */
  async open(i: { po: string; supplier: string; lockedCents: number }): Promise<PoAccount> {
    const room = await this.room();
    if (room && room.used >= room.limit) return this.full(i.po, "GET /v1/quotas", room);
    const policy = poPolicy({ supplier: i.supplier, owner: await this.treasuryAccount(), lockedCents: i.lockedCents });
    const label = `PO ${i.po} account: pays only the supplier or Astro, at most ${shown(i.lockedCents)}`;
    let agentId: string;
    try {
      const st = await this.client.owned("agent_create", { name: `Evernear PO ${i.po} account`, owner: this.ownerRef(), policy }, { kind: "policy", label, codePath: `${PATH}#open` });
      agentId = st.details!.agent_id as string;
    } catch (e) {
      if (isAgentQuotaError(e)) return this.full(i.po, "POST /v1/generate-intent agent_create", room, (e as { code?: string }).code ?? "quota_exceeded");
      throw e;
    }
    const grantId = await this.issueGrant(agentId, `evernear PO ${i.po}`, this.poGrant(agentId));
    const account = (await this.client.wallet(agentId)).near_account_id;
    return { agentId, account, grantHash: grantHash(this.poGrant(agentId)), grantId };
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

  /**
   * Closes a settled order's account for good: Astro revokes Evernear's grant and freezes the account,
   * then a "Wallet closed" proof row is recorded. Refused by the engine (closeWallet) before any call
   * when the escrow still holds money or is already closed. The account is never handed to another order.
   */
  async close(i: { escrow: Escrow; agentId: string; grantId?: string; po: string }): Promise<Moved> {
    const rule = closeWallet(i.escrow);
    if (!rule.ok) return { ok: false, reason: rule.reason };
    let live: string[];
    try {
      live = (await this.client.grants(i.agentId)).filter((g) => !g.revoked_at).map((g) => g.grant_id);
    } catch {
      live = i.grantId ? [i.grantId] : [];
    }
    for (const grant_id of live) {
      await this.client.owned("grant_revoke", { agent_id: i.agentId, grant_id }, { kind: "policy", label: `Evernear's grant on the PO ${i.po} account revoked`, codePath: `${PATH}#close` });
    }
    const pol = await this.client.policy(i.agentId);
    const frozen = pol.policy.frozen ? null
      : await this.client.owned("agent_freeze", { agent_id: i.agentId }, { kind: "freeze", label: `PO ${i.po} account frozen for good`, codePath: `${PATH}#close` });
    const left = await this.client.balance(i.agentId, BASE_USDC);
    const d = frozen?.details ?? {};
    await this.o.sink({
      kind: "wallet", label: `Wallet closed: PO ${i.po} frozen, grant revoked, kept as the order's receipt`, call: "POST /v1/submit-intent grant_revoke, agent_freeze",
      codePath: `${PATH}#close`, network: this.client.network, hash: d.tx_hash ?? d.transaction_hash ?? frozen?.correlation_id ?? "none",
      response: { agent_id: i.agentId, frozen: true, grants_revoked: live.length, grant: "revoked", lifecycle: "closed", balance: String(left), reused: false },
      replay: false, synthetic: false,
    });
    return { ok: true, escrow: rule.escrow };
  }

  /** Kill switch: Astro freezes the PO account; every move after this is refused with wallet_frozen. */
  async freeze(i: { agentId: string; po: string }) {
    return this.client.owned("agent_freeze", { agent_id: i.agentId }, { kind: "freeze", label: `PO ${i.po} account frozen by Astro`, codePath: `${PATH}#freeze` });
  }
}
