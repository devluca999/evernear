// Per-PO escrow: one Agent API account per PO (Tidepool testnet), owned by Astro's owner key.
// Its policy lets money go to exactly two places: a withdraw to the supplier's address on Base
// Sepolia, and a transfer back to Astro's treasury account; at most the PO amount per transaction;
// `frozen` is the kill switch. Each order gets a fresh account and never shares it: once the order
// is settled the account is closed (every grant revoked, the account frozen) and kept as the
// order's receipt. A key holds 25 agents on Tidepool, so `open` refuses with accounts_full when none
// is left. Two layers refuse a wrong address: the engine's rule (here, before any call) and the
// account's policy (in the Agent API, shown live by policyRefusal).
//
// Two-stage release (policy/astro.json, engine/escrow.ts releaseStage): the advance once the bill of
// lading and export clearance are in, the balance once import customs cleared and the dock count is
// attested. Every stage asks the engine first; a missing signal is refused, and recorded, before any
// call. Who sends the money depends on the release gate (worker/release-gate):
// - configured: the grant on the order's account is the gate's, derived inside OutLayer's enclave
//   and bound to that exact wasm; Evernear's server never holds a grant that can pay the supplier.
//   The gate's signed answer is checked (signature, key, amount) before a payment is recorded.
// - not configured: Evernear's server holds a grant derived from AGENT_API_KEY and sends the
//   withdraw itself, and every release proof says so in its label and response.
// Reclaim, refund and close stay with Astro's owner key and the server in both cases.
//
// Honest limit: this is a commitment, not a lock. Tidepool's server enforces the policy, not the
// chain, and Astro as owner can sign a policy change or unfreeze at any time. The supplier cannot
// enforce it. Amounts run at 1:1,000 of the story (engine/money.ts TESTNET_SCALE).
import { AgentApiClient, BASE_USDC, NEAR_USDC, agentRoom, grantHash, grantToken, isAgentQuotaError, type ActResult, type Owner, type ProofMeta } from "./agentapi";
import type { Fetch, ProofSink } from "./http";
import { checkEnroll, verifyGateRelease, type ReleaseGate } from "./releaseGate";
import { closeWallet, reclaimHeld, refundOnDeadline, releaseStage, RELEASE_RULES, type Escrow, type SignalId, type Stage } from "../../engine/escrow";
import { evidenceId, verifyGateSignature, type Evidence, type GateReleaseInput, type GateReleaseOutput } from "../../engine/releaseGate";
import { formatUsd, scaleTestnet, TESTNET_SCALE } from "../../engine/money";

const PATH = "convex/near/escrow.ts";
/** One faucet drip is 100 test NEAR USDC; the swap into Base USDC keeps a little back for its fee. */
const SWAP_HEADROOM = 1_000_000n;

/** Story cents to 6 decimal test USDC units at 1:1,000. */
export const testnetUnits = (storyCents: number): bigint => BigInt(scaleTestnet(storyCents)) * 10_000n;
const shown = (storyCents: number) => `${formatUsd(scaleTestnet(storyCents))} (1:${TESTNET_SCALE.toLocaleString("en-US")} of ${formatUsd(storyCents)})`;

/** Which code sent a release. Every release proof carries it. */
export type ReleasePath = "gate" | "server";
export const SENT_BY: Record<ReleasePath, string> = {
  gate: "Sent by the release gate in OutLayer's enclave; Evernear's server holds no grant that can pay",
  server: "Sent by Evernear's server; the release gate is not deployed",
};

/** The evidence a stage was decided on, keyed by signal. The dock count's evidence carries `count`. */
export type SignalEvidence = Partial<Record<SignalId, Evidence>>;

const SIGNAL_LABEL: Record<SignalId, string> = {
  bill_of_lading: "bill of lading issued", export_cleared: "export cleared", import_cleared: "import customs cleared", dock_count: "dock count attested",
};
const STAGE_LABEL: Record<Stage, string> = { advance: "Advance", balance: "Balance" };

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

/**
 * The PO account's policy once only Astro may be paid: the supplier's destination removed, before
 * the server is given a grant to send the held part back (release gate path only).
 */
export function ownerOnlyPolicy(i: { owner: string; lockedCents: number }) {
  const p = poPolicy({ supplier: "none", owner: i.owner, lockedCents: i.lockedCents });
  return { ...p, actions: ["transfer"], destinations: { mode: "only", list: [{ action: "transfer", address: i.owner, confidential: false }] } };
}

/** Astro's treasury: funds each PO account. Any destination, since each order gets a new account. Commits up to 100 test USDC. */
export function treasuryPolicy() {
  return {
    frozen: false, actions: ["swap", "transfer"], confidential: false, owner_approval: false, assets: "any",
    limits: { per_transaction: { [BASE_USDC]: "100000000", [NEAR_USDC]: "100000000" } }, max_actions_per_hour: null,
    destinations: { mode: "any", list: [] }, budget: { daily_usd: null, weekly_usd: null, monthly_usd: null }, timelock_ms: 0,
  };
}

export interface PoAccount { agentId: string; account: string; grantHash: string; grantId?: string; releasePath: ReleasePath; gatePublicKey?: string }
type Moved = { ok: true; escrow: Escrow } | { ok: false; reason: string };
export type StageMoved = { ok: true; escrow: Escrow; amountCents: number } | { ok: false; reason: string; missing?: SignalId[] };

/** The key has no agent left for a new order wallet. A refusal proof row was recorded before this is thrown. */
export class AccountsFull extends Error {
  readonly reason = "accounts_full";
  constructor(readonly limit?: number) { super("accounts_full"); }
}

export class EscrowAdapter {
  private client: AgentApiClient;
  private treasuryAcct?: string;
  constructor(private o: { fetch: Fetch; apiKey?: string; baseUrl: string; owner?: Owner; sink: ProofSink; treasuryId?: string; idem?: () => string; gate?: ReleaseGate | null; gatePublicKey?: string }) {
    this.client = new AgentApiClient({ fetch: o.fetch, apiKey: o.apiKey, baseUrl: o.baseUrl, owner: o.owner, sink: o.sink, idem: o.idem });
  }

  /** Which path a new order's releases take: the gate when one is configured. */
  get releasePath(): ReleasePath { return this.o.gate ? "gate" : "server"; }

  private grant = (label: string) => grantToken(this.o.apiKey!, label);
  // The "pool:" prefix is kept from when accounts were reused: it is only the token's derivation
  // string, and changing it would orphan the grant of every account opened before.
  private poGrant = (agentId: string) => this.grant(`pool:${agentId}`);
  /** The server's grant for sending the held part back, issued only after the account may pay Astro alone. */
  private ownerOnlyGrant = (agentId: string) => this.grant(`owner-only:${agentId}`);
  private treasuryId() {
    if (!this.o.treasuryId) throw new Error("AGENT_TREASURY_ID not configured");
    return this.o.treasuryId;
  }
  private ownerRef() {
    const ow = this.o.owner;
    if (!ow) throw new Error("owner key not configured (AGENT_OWNER_PRIVATE_KEY_PKCS8)");
    return { type: "near", account_id: ow.accountId, public_key: ow.publicKey };
  }
  private async issueGrant(agentId: string, label: string, credential: string, proofLabel = `Grant issued to Evernear (${label})`): Promise<string | undefined> {
    const st = await this.client.owned("grant_issue", { agent_id: agentId, label, credential, expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString() },
      { kind: "policy", label: proofLabel, codePath: `${PATH}#grant` });
    return (st.details?.grant as { grant_id?: string } | null | undefined)?.grant_id;
  }

  /** One time setup (scripts): Astro's treasury agent and its grant. Returns the agent id. */
  async createTreasury(): Promise<string> {
    const st = await this.client.owned("agent_create", { name: "Astro Robotics treasury", owner: this.ownerRef(), policy: treasuryPolicy() },
      { kind: "wallet", label: "Astro treasury account created", codePath: `${PATH}#createTreasury` });
    const id = st.details!.agent_id as string;
    await this.issueGrant(id, "evernear treasury", grantHash(this.grant("treasury")));
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

  /** Runs enroll in the enclave for a new account and records it. Throws when the answer does not check out. */
  private async enrollGate(po: string, agentId: string): Promise<{ grantHash: string; publicKey: string }> {
    const gate = this.o.gate!;
    const { output, run } = await gate.enroll(agentId);
    const check = checkEnroll(output, agentId, this.o.gatePublicKey);
    await this.o.sink({
      kind: check.ok ? "enclave" : "refusal",
      label: check.ok ? `Release gate enrolled for PO ${po}: the grant token was derived in OutLayer's enclave and only its hash left it` : `Release gate enroll refused for PO ${po}: ${check.reason}`,
      call: run.call, codePath: `${PATH}#enroll`, network: "testnet", hash: run.txHash ?? "none",
      response: { mode: "enroll", agent_id: output.agent_id, grant_hash: output.grant_hash, public_key: output.public_key, wasm_url: gate.wasmUrl, wasm_sha256: gate.wasmSha256, request_id: run.requestId, ...(check.ok ? {} : { reason: check.reason }) },
      replay: false, synthetic: false,
    });
    if (!check.ok) throw new Error(check.reason);
    return { grantHash: output.grant_hash, publicKey: output.public_key };
  }

  /**
   * A new PO account for this order, with the PO's policy, and one grant on it: the release gate's
   * when the gate is configured (Astro's owner registers the hash enroll returned), else Evernear's
   * server-derived one. Never reuses an account. Refuses with AccountsFull (and a proof row) when the
   * key has no agent left: from the quota answer before any intent, or from agent_create's own refusal.
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
    if (this.o.gate) {
      const en = await this.enrollGate(i.po, agentId);
      const grantId = await this.issueGrant(agentId, `release gate PO ${i.po}`, en.grantHash, `Grant issued to the release gate for PO ${i.po}: only its enclave can derive the token`);
      const account = (await this.client.wallet(agentId)).near_account_id;
      return { agentId, account, grantHash: en.grantHash, grantId, releasePath: "gate", gatePublicKey: en.publicKey };
    }
    const hash = grantHash(this.poGrant(agentId));
    const grantId = await this.issueGrant(agentId, `evernear PO ${i.po}`, hash);
    const account = (await this.client.wallet(agentId)).near_account_id;
    return { agentId, account, grantHash: hash, grantId, releasePath: "server" };
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

  /** One proof row per signal the stage was decided on, from the tracking adapter (or the dock check). */
  private async recordSignals(po: string, stage: Stage, evidence: SignalEvidence) {
    for (const s of RELEASE_RULES.requires[stage]) {
      const e = evidence[s];
      if (!e || !evidenceId(e)) continue;
      const simulated = e.source === "simulated";
      await this.o.sink({
        kind: "signal", label: `Signal: ${SIGNAL_LABEL[s]} for PO ${po}${simulated ? " (simulated feed)" : ""}`,
        call: s === "dock_count" ? "dock check count" : `tracking.events (${simulated ? "simulated carrier and customs feed" : e.source ?? "tracking feed"})`,
        codePath: "scenarios/tracking.ts#signal", network: "offchain", hash: e.id,
        response: { event: s, po, source: e.source ?? null, id: e.id, at: e.at, ...(e.ref ? { ref: e.ref } : {}), ...(e.count !== undefined ? { count: e.count } : {}) },
        replay: false, synthetic: false,
      });
    }
  }

  /**
   * One stage of the two-stage release. The engine decides first, on the signals that carry valid
   * evidence and, for the balance, the dock count's own `count`; a refusal is a proof row and no
   * call is made. Then the money moves on the escrow's path: the gate sends it and the server checks
   * the gate's signed answer, or the server sends it, and the proof says which.
   */
  async releaseStage(i: { escrow: Escrow; agentId: string; stage: Stage; to: string; evidence: SignalEvidence; unitCents: number; po: string; ref: string; nowMs: number; path?: ReleasePath; gatePublicKey?: string; payee?: string }): Promise<StageMoved> {
    const path = i.path ?? "server";
    const signals = (Object.keys(i.evidence) as SignalId[]).filter((s) => evidenceId(i.evidence[s]));
    const counted = i.evidence.dock_count?.count;
    const receivedQty = typeof counted === "number" ? counted : undefined;
    await this.recordSignals(i.po, i.stage, i.evidence);
    const rule = releaseStage(i.escrow, { stage: i.stage, to: i.to, signals, unitCents: i.unitCents, receivedQty, nowMs: i.nowMs });
    if (!rule.ok) {
      const why = rule.reason === "missing_signal" ? `missing ${rule.missing!.join(", ")}` : rule.reason;
      await this.o.sink({
        kind: "refusal", label: `${STAGE_LABEL[i.stage]} refused before any call: ${why}`, call: "engine/escrow.ts releaseStage", codePath: `${PATH}#release`,
        network: "testnet", hash: "none", response: { stage: i.stage, to: i.to, status: "refused", reason: rule.reason, missing: rule.missing ?? [] }, replay: false, synthetic: false,
      });
      return { ok: false, reason: rule.reason, ...(rule.missing ? { missing: rule.missing } : {}) };
    }
    const amount = testnetUnits(rule.escrow.releasedCents) - testnetUnits(i.escrow.releasedCents);
    const request = { asset: BASE_USDC, amount: String(amount), chain: "base", recipient: i.to };
    const meta: ProofMeta = {
      kind: "payout", label: `${STAGE_LABEL[i.stage]} paid to ${i.payee ?? "the supplier"} on Base Sepolia for PO ${i.po}: ${shown(rule.amountCents)}. ${SENT_BY[path]}`,
      codePath: `${PATH}#release`, note: { stage: i.stage, released_by: path, sent_by: SENT_BY[path], signals, held_cents: rule.escrow.lockedCents - rule.escrow.releasedCents },
    };
    if (path === "server") {
      const r = await this.client.act(i.agentId, this.poGrant(i.agentId), "withdraw", request, meta, `${i.ref}:${i.stage}`);
      return r.ok ? { ok: true, escrow: rule.escrow, amountCents: rule.amountCents } : { ok: false, reason: r.code };
    }
    return this.releaseByGate(i, rule, request, meta);
  }

  private async releaseByGate(
    i: { escrow: Escrow; agentId: string; stage: Stage; to: string; evidence: SignalEvidence; unitCents: number; po: string; gatePublicKey?: string },
    rule: { escrow: Escrow; amountCents: number }, request: Record<string, unknown>, meta: ProofMeta,
  ): Promise<StageMoved> {
    const gate = this.o.gate;
    if (!gate || !i.gatePublicKey) {
      await this.o.sink({ kind: "refusal", label: `${STAGE_LABEL[i.stage]} not sent: this order's grant belongs to the release gate, which is not configured here`, call: "convex/near/releaseGate.ts", codePath: `${PATH}#release`, network: "testnet", hash: "none", response: { stage: i.stage, status: "refused", reason: "gate_unavailable" }, replay: false, synthetic: false });
      return { ok: false, reason: "gate_unavailable" };
    }
    const input: GateReleaseInput = {
      mode: "release", stage: i.stage, po: i.po, agent_id: i.agentId, to: i.to, unit_cents: i.unitCents, ordered_qty: i.escrow.lockedCents / i.unitCents,
      locked_cents: i.escrow.lockedCents, released_cents: i.escrow.releasedCents, advance_percent: RELEASE_RULES.advancePercent,
      ...(i.stage === "balance" && typeof i.evidence.dock_count?.count === "number" ? { received_qty: i.evidence.dock_count.count } : {}),
      signals: i.evidence as Record<string, unknown>,
    };
    const { output, run } = await gate.release(input);
    if (!output.ok) {
      await this.o.sink({
        kind: "refusal", label: `${STAGE_LABEL[i.stage]} refused by the release gate in OutLayer's enclave: ${output.reason}${output.missing?.length ? ` (missing ${output.missing.join(", ")})` : ""}`,
        call: run.call, codePath: `${PATH}#release`, network: "testnet", hash: run.txHash ?? "none",
        response: { stage: i.stage, released_by: "gate", signature_valid: verifyGateSignatureSafe(output, i.gatePublicKey), gate: output }, replay: false, synthetic: false,
      });
      return { ok: false, reason: output.reason ?? "gate_refused", ...(output.missing?.length ? { missing: output.missing as SignalId[] } : {}) };
    }
    const verdict = verifyGateRelease(output, { publicKey: i.gatePublicKey, stage: i.stage, po: i.po, agentId: i.agentId, to: i.to, amountCents: rule.amountCents });
    if (!verdict.ok) {
      await this.o.sink({
        kind: "refusal", label: `${STAGE_LABEL[i.stage]} not recorded as paid: the release gate's answer failed the check (${verdict.reason}); check the account before anything else moves`,
        call: run.call, codePath: `${PATH}#release`, network: "testnet", hash: run.txHash ?? "none",
        response: { stage: i.stage, released_by: "gate", reason: verdict.reason, engine_amount_cents: rule.amountCents, gate: output }, replay: false, synthetic: false,
      });
      return { ok: false, reason: `gate_${verdict.reason}` };
    }
    const correlation = output.tx?.correlation_id;
    if (typeof correlation !== "string") return { ok: false, reason: "gate_no_correlation_id" };
    const r = await this.client.settled(correlation, `${run.call}, then POST /v1/agents/{id}/withdraw from the enclave`, { ...meta, note: { ...meta.note, gate: output, gate_tx: run.txHash } }, request);
    return r.ok ? { ok: true, escrow: rule.escrow, amountCents: rule.amountCents } : { ok: false, reason: r.code };
  }

  /**
   * The second layer, live: a withdraw to an off-list address sent straight to the API, past the
   * engine rule, and its refusal recorded. On the server path the account's policy refuses it. On
   * the gate path the server holds no grant at all, so the account refuses it at the grant.
   */
  async policyRefusal(i: { agentId: string; to: string; cents: number; po: string; ref: string; path?: ReleasePath }): Promise<ActResult> {
    const gate = i.path === "gate";
    return this.client.act(i.agentId, this.poGrant(i.agentId), "withdraw", { asset: BASE_USDC, amount: String(testnetUnits(i.cents)), chain: "base", recipient: i.to },
      { kind: "payout", label: gate ? `PO ${i.po} account refused a withdraw to ${i.to} from Evernear's server, which holds no grant on it` : `PO ${i.po} account refused a withdraw to ${i.to}`, codePath: `${PATH}#policyRefusal`, note: { sent_by: gate ? "Evernear's server, without a grant" : "Evernear's server" } },
      `${i.ref}:offlist`);
  }

  /** Gate path only: before the server may move the held part, Astro's owner limits the account to paying Astro, then grants the server that. */
  private async ownerOnly(i: { escrow: Escrow; agentId: string; po: string }) {
    const pol = await this.client.policy(i.agentId);
    const list = (pol.policy.destinations as { list?: { action: string }[] } | undefined)?.list ?? [];
    if (list.some((d) => d.action === "withdraw")) {
      await this.client.owned("policy_update", { agent_id: i.agentId, expected_revision: pol.revision, policy: ownerOnlyPolicy({ owner: i.escrow.owner, lockedCents: i.escrow.lockedCents }) },
        { kind: "policy", label: `PO ${i.po} account may now pay only Astro: the supplier's destination removed before the held part moves`, codePath: `${PATH}#ownerOnly` });
    }
    const hash = grantHash(this.ownerOnlyGrant(i.agentId));
    const grants = await this.client.grants(i.agentId).catch(() => []);
    if (!grants.some((g) => g.label === `owner-only PO ${i.po}` && !g.revoked_at)) await this.issueGrant(i.agentId, `owner-only PO ${i.po}`, hash, `Grant issued to Evernear for PO ${i.po}: it can only return money to Astro`);
  }

  private async back(i: { escrow: Escrow; next: Escrow; agentId: string; po: string; ref: string; step: string; kind: string; label: string; path?: ReleasePath }): Promise<Moved> {
    const held = (e: Escrow) => testnetUnits(e.lockedCents) - testnetUnits(e.releasedCents) - testnetUnits(e.reclaimedCents);
    const amount = held(i.escrow);
    if (i.path === "gate") await this.ownerOnly(i);
    const grant = i.path === "gate" ? this.ownerOnlyGrant(i.agentId) : this.poGrant(i.agentId);
    const r = await this.client.act(i.agentId, grant, "transfer", { asset: BASE_USDC, amount: String(amount), recipient: i.escrow.owner },
      { kind: i.kind, label: i.label, codePath: `${PATH}#${i.step}` }, `${i.ref}:${i.step}`);
    return r.ok ? { ok: true, escrow: i.next } : { ok: false, reason: r.code };
  }

  /** The held part back to Astro after a partial release. */
  async reclaim(i: { escrow: Escrow; agentId: string; po: string; ref: string; nowMs: number; path?: ReleasePath }): Promise<Moved> {
    const rule = reclaimHeld(i.escrow, { to: i.escrow.owner, nowMs: i.nowMs });
    if (!rule.ok) return { ok: false, reason: rule.reason };
    return this.back({ ...i, next: rule.escrow, step: "reclaim", kind: "reclaim", label: `Held part returned to Astro for PO ${i.po}: ${shown(rule.amountCents)}` });
  }

  /** Called by the scheduled job in convex/near/deadline.ts. */
  async refundIfDue(i: { escrow: Escrow; agentId: string; po: string; ref: string; nowMs: number; path?: ReleasePath }): Promise<Moved> {
    const rule = refundOnDeadline(i.escrow, { nowMs: i.nowMs });
    if (!rule.ok) return { ok: false, reason: rule.reason };
    return this.back({ ...i, next: rule.escrow, step: "refund", kind: "refund", label: `Deadline passed, refunded to Astro for PO ${i.po}: ${shown(rule.amountCents)}` });
  }

  /**
   * Closes a settled order's account for good: Astro revokes every grant on it (Evernear's or the
   * gate's) and freezes the account, then a "Wallet closed" proof row is recorded. Refused by the
   * engine (closeWallet) before any call when the escrow still holds money or is already closed.
   * The account is never handed to another order.
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
      await this.client.owned("grant_revoke", { agent_id: i.agentId, grant_id }, { kind: "policy", label: `A grant on the PO ${i.po} account revoked`, codePath: `${PATH}#close` });
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

/** Whether a gate refusal is signed by this order's gate key over exactly what it says. */
function verifyGateSignatureSafe(out: GateReleaseOutput, key: string): boolean {
  return out.public_key === key.toLowerCase() && verifyGateSignature(out);
}
