// The TypeScript twin of worker/release-gate/src/lib.rs: the same decision, the same canonical
// JSON, the same signed bytes, the same idempotency key and the same testnet scale, tested against
// the worker's own worker/release-gate/vectors.json (engine/__tests__/releaseGate.test.ts), so the
// Rust and the TypeScript cannot drift. Pure: no host, no clock, no network.
//
// The server uses it to check what the gate sent back: the amount the gate paid must be the amount
// this code (and engine/escrow.ts releaseStage) computes for the same input, and the gate's ed25519
// signature must cover exactly the output it returned.
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { base64url } from "@scure/base";

export const GATE_TIDEPOOL_HOST = "www.usetidepool.tech";
export const GATE_SIGN_PREFIX = "evernear-release-gate:v1:";
export const GATE_GRANT_PREFIX = "tidepool-grant:v1:";
export const GATE_MAX_OUTPUT_BYTES = 900;
export const GATE_ADVANCE_SIGNALS = ["bill_of_lading", "export_cleared"] as const;
export const GATE_BALANCE_SIGNALS = ["import_cleared", "dock_count"] as const;

const MAX_ID_LEN = 48;

/** One piece of evidence for a signal: a non-empty object with a string `id` and an `at`. */
export interface Evidence { id: string; at: string | number; source?: string; ref?: string; count?: number; [k: string]: unknown }

/** The release input, exactly as the worker reads it (snake_case, integer cents). */
export interface GateReleaseInput {
  mode: "release";
  stage: string;
  po: string;
  agent_id: string;
  to: string;
  unit_cents: number;
  ordered_qty: number;
  locked_cents: number;
  released_cents: number;
  advance_percent: number;
  received_qty?: number;
  signals: Record<string, unknown>;
  idempotency_key?: string;
}

export type GateDecision =
  | { ok: true; amount_cents: number; held_cents: number; signal_ids: string[] }
  | { ok: false; reason: string; missing: string[] };

export interface GateEnrollOutput { mode: "enroll"; agent_id: string; grant_hash: string; public_key: string }
/** A signed result or a signed refusal. Unparseable input answers unsigned `{ok:false, reason:"bad_input"}`. */
export interface GateReleaseOutput {
  ok: boolean; stage?: string; po?: string; agent_id?: string; amount_cents?: number; held_cents?: number; to?: string;
  signals?: string[]; missing?: string[]; reason?: string; evidence_sha256?: string; public_key?: string; signature?: string;
  tx?: Record<string, unknown>; detail?: string;
}

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const refuse = (reason: string, missing: string[] = []): GateDecision => ({ ok: false, reason, missing });
const isU64 = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

/** Short identifiers that end up in signed output and in URLs: a fixed safe alphabet. */
export const validId = (s: string) => s.length > 0 && s.length <= MAX_ID_LEN && /^[A-Za-z0-9_.:-]+$/.test(s);
/** Tidepool agent ids look like `agent_fe8606f9c6dc60f3f1768ed9`. */
export const validAgentId = (s: string) => /^agent_[A-Za-z0-9]{1,40}$/.test(s);
export const validEvmAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

/** The id of one evidence object, or null when it does not count. */
export function evidenceId(e: unknown): string | null {
  if (!e || typeof e !== "object" || Array.isArray(e)) return null;
  const o = e as Record<string, unknown>;
  if (Object.keys(o).length === 0) return null;
  if (typeof o.id !== "string") return null;
  const atOk = (typeof o.at === "string" && o.at.length > 0) || typeof o.at === "number";
  return validId(o.id) && atOk ? o.id : null;
}

export function requiredSignals(stage: string): readonly string[] | null {
  return stage === "advance" ? GATE_ADVANCE_SIGNALS : stage === "balance" ? GATE_BALANCE_SIGNALS : null;
}

/** Decide one release, as the worker's `decide` does. Exact integer arithmetic (BigInt). */
export function gateDecide(r: GateReleaseInput): GateDecision {
  const required = requiredSignals(r.stage);
  if (!required) return refuse("bad_stage");
  if (!validAgentId(r.agent_id)) return refuse("bad_agent_id");
  if (!validEvmAddress(r.to)) return refuse("bad_recipient");
  for (const n of [r.unit_cents, r.ordered_qty, r.locked_cents, r.released_cents, r.advance_percent]) if (!isU64(n)) return refuse("bad_input");
  if (r.received_qty !== undefined && !isU64(r.received_qty)) return refuse("bad_input");
  if (r.unit_cents === 0 || r.ordered_qty === 0) return refuse("bad_terms");
  const U64_MAX = 2n ** 64n - 1n;
  const unit = BigInt(r.unit_cents), ordered = BigInt(r.ordered_qty), locked = BigInt(r.locked_cents), released = BigInt(r.released_cents);
  const total = ordered * unit;
  if (total > U64_MAX || total !== locked) return refuse("locked_mismatch");
  if (released > locked) return refuse("over_locked");

  const missing: string[] = [], signalIds: string[] = [];
  for (const name of required) {
    const id = evidenceId(r.signals?.[name]);
    if (id) signalIds.push(id); else missing.push(name);
  }
  if (missing.length) return { ok: false, reason: "missing_signals", missing };

  let amount: bigint;
  if (r.stage === "advance") {
    if (released !== 0n) return refuse("already_released");
    if (r.advance_percent === 0 || r.advance_percent > 100) return refuse("bad_percent");
    const product = locked * BigInt(r.advance_percent);
    if (product > U64_MAX) return refuse("bad_terms");
    if (product % 100n !== 0n) return refuse("inexact_amount");
    amount = product / 100n;
  } else {
    if (r.received_qty === undefined) return refuse("missing_received_qty");
    const received = BigInt(r.received_qty);
    if (received > ordered) return refuse("received_over_ordered");
    const counted = (r.signals?.dock_count as { count?: unknown } | undefined)?.count;
    if (!isU64(counted) || BigInt(counted) !== received) return refuse("count_mismatch");
    const due = received * unit - released;
    if (due <= 0n) return refuse("nothing_due");
    amount = due;
  }
  if (amount === 0n) return refuse("nothing_due");
  if (released + amount > locked) return refuse("over_locked");
  return { ok: true, amount_cents: Number(amount), held_cents: Number(locked - released - amount), signal_ids: signalIds };
}

/** Canonical JSON: object keys sorted, no whitespace. The same bytes serde_json writes for these values. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** The exact bytes the gate's `result` key signs: the prefix, then the output without `signature`. */
export function signedMessage(output: Record<string, unknown>): string {
  const { signature: _drop, ...rest } = output;
  void _drop;
  return GATE_SIGN_PREFIX + canonical(rest);
}

/** True when `signature` is the ed25519 signature of `public_key` over the output. */
export function verifyGateSignature(output: GateReleaseOutput): boolean {
  const { signature, public_key } = output;
  if (typeof signature !== "string" || typeof public_key !== "string" || !/^[0-9a-f]{128}$/.test(signature) || !/^[0-9a-f]{64}$/.test(public_key)) return false;
  try {
    return ed25519.verify(fromHex(signature), enc(signedMessage(output as unknown as Record<string, unknown>)), fromHex(public_key));
  } catch {
    return false;
  }
}

/** sha256 of the canonical evidence the stage was decided on (only that stage's signals). */
export function evidenceSha256(r: Pick<GateReleaseInput, "stage" | "signals">): string {
  const used: Record<string, unknown> = {};
  for (const name of requiredSignals(r.stage) ?? []) if (r.signals?.[name] !== undefined) used[name] = r.signals[name];
  return hex(sha256(enc(canonical(used))));
}

/** Story cents to Base USDC base units at the testnet scale of 1:1,000: cents x 10. */
export const centsToBaseUnits = (c: number): string => (BigInt(c) * 10n).toString();

/** The gate's own idempotency key: one per agent, order and stage. */
export function gateIdempotencyKey(agentId: string, po: string, stage: string): string {
  return `rg1-${stage}-${hex(sha256(enc(`evernear-release-gate:v1:idem:${agentId}:${po}:${stage}`))).slice(0, 32)}`;
}

/** `ngt_` + base64url without padding of the 32 MAC bytes. */
export function grantTokenFromMac(mac: Uint8Array): string {
  if (mac.length !== 32) throw new Error(`mac must be 32 bytes, got ${mac.length}`);
  return "ngt_" + base64url.encode(mac).replace(/=+$/, "");
}
export const gateGrantHash = (token: string) => hex(sha256(enc(token)));

/** The worker's host check: only `https://www.usetidepool.tech/v1/agents/...`. */
export function gateUrlAllowed(url: string): boolean {
  if (!url.startsWith("https://")) return false;
  const rest = url.slice(8);
  const i = rest.indexOf("/");
  const authority = i < 0 ? rest : rest.slice(0, i), path = i < 0 ? "" : rest.slice(i);
  return authority === GATE_TIDEPOOL_HOST && path.startsWith("/v1/agents/") && !/\.\.|[?#]/.test(path);
}

/** Signs an output as the worker does (sorted keys, prefix). For test fakes only: the real key lives in the enclave. */
export function signGateOutput(body: Record<string, unknown>, seed: Uint8Array): GateReleaseOutput {
  const withKey = { ...body, public_key: hex(ed25519.getPublicKey(seed)) };
  const signature = hex(ed25519.sign(enc(signedMessage(withKey)), seed));
  return JSON.parse(canonical({ ...withKey, signature })) as GateReleaseOutput;
}
