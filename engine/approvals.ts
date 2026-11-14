// Commit approvals: the human authorization that must exist before an order's money is committed.
//
// An approval is an ed25519 signature, made on the approver's own device, over the digest of the
// exact commercial terms being committed (PO, terms version, supplier and its payout address,
// quantity, unit price, total, currency, testnet settlement units, payment-rule hash), plus a nonce,
// an issue time and an expiry. The server recomputes the terms itself from what it is about to
// commit and never takes them from the caller, so an approval for any other supplier, amount,
// wallet, PO version or rule set does not match and is refused (`terms_mismatch`): changed terms
// need a new approval.
//
// verifyApprovals is pure (no clock, no network, no database): the caller passes `nowMs`, the
// pinned approver registry and the nonces already consumed. convex/approvals.ts consumes the
// nonces in the same transaction that claims the commit, so an approval set is spent once.
//
// Honest limit: this is enforced by Evernear's backend, immediately before the commit call
// (convex/live.ts and again in convex/near/deadline.ts lock). Whoever holds the treasury grant
// (Astro's owner key, or a compromised backend) can still move money without it. The Tidepool
// testnet does not support provider-side approvals (docs/NOTES.md section 14: 501 not_supported).
import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { canonical } from "./releaseGate";
import { TESTNET_SCALE } from "./money";
import { base64 } from "@scure/base";

export const APPROVAL_PREFIX = "evernear-approval:v1:";
export const REVOKE_PREFIX = "evernear-approval-revoke:v1:";
/** An approval is good for at most this long after it was signed. */
export const APPROVAL_MAX_TTL_MS = 24 * 3_600_000;
/** Clock skew allowed for an approval signed "in the future". */
export const APPROVAL_SKEW_MS = 5 * 60_000;

/** The commercial terms an approval binds. Every field is part of the signed digest. */
export interface CommitTerms {
  v: 1;
  po: string;
  termsVersion: number;
  buyer: string;
  supplierId: string;
  supplierAddress: string;
  supplierChain: string;
  part: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  currency: "USD";
  /** What actually moves on testnet: the total at 1:TESTNET_SCALE, in 6-decimal Base USDC units. */
  settlement: { asset: string; chain: string; scale: number; units: string };
  /** sha256 of the buyer's payment rules (policy/astro.json), so a rule change needs reapproval. */
  rulesHash: string;
  approvalsRequired: number;
}

/** A pinned approver. With `accountId`, the approver is a NEAR account: it must sign with NEP-413 using that account's key. */
export interface Approver { name: string; publicKey: string; accountId?: string; revoked?: boolean }

export interface SignedApproval {
  approver: string;
  publicKey: string;
  digest: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
  /** NEP-413 approvals from a NEAR account: the account, and `scheme: "nep413"`. */
  accountId?: string;
  scheme?: "ed25519" | "nep413";
}

export type ApprovalRefusal =
  | "approvals_not_configured" | "not_enough_approvals" | "unknown_approver" | "approver_revoked" | "key_mismatch"
  | "bad_signature" | "terms_mismatch" | "expired" | "not_yet_valid" | "ttl_too_long" | "replayed" | "duplicate_approver" | "duplicate_nonce" | "bad_input";

export interface ApprovalVerdict { approver: string; nonce: string; ok: boolean; reason?: ApprovalRefusal }
export type ApprovalResult =
  | { ok: true; approvers: string[]; nonces: string[]; verdicts: ApprovalVerdict[] }
  | { ok: false; reason: ApprovalRefusal; valid: number; required: number; verdicts: ApprovalVerdict[] };

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const isHex = (s: unknown, n: number): s is string => typeof s === "string" && new RegExp(`^[0-9a-f]{${n}}$`).test(s);

export const sha256Hex = (s: string) => hex(sha256(enc(s)));

/** Story cents to 6-decimal test USDC units at 1:1,000 (same as convex/near/escrow.ts testnetUnits). */
export const settlementUnits = (totalCents: number) => (BigInt(Math.round(totalCents / TESTNET_SCALE)) * 10_000n).toString();

/** The terms digest every approval signs: sha256 of the canonical JSON of the terms. */
export const termsDigest = (t: CommitTerms) => sha256Hex(canonical(t));

/** The exact bytes an approver signs. */
export function approvalMessage(a: Pick<SignedApproval, "approver" | "publicKey" | "digest" | "nonce" | "issuedAt" | "expiresAt" | "accountId">): string {
  return APPROVAL_PREFIX + canonical({ accountId: a.accountId, approver: a.approver, digest: a.digest, expiresAt: a.expiresAt, issuedAt: a.issuedAt, nonce: a.nonce, publicKey: a.publicKey });
}

/** NEP-413 recipient for every EverNEAR approval, so a signature for another app never counts here. */
export const NEP413_RECIPIENT = "evernear";
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const bstr = (x: string) => { const b = enc(x); return cat(u32(b.length), b); };
/** The 32-byte NEP-413 nonce for an approval: sha256 of its nonce string. */
export const nep413Nonce = (nonce: string) => sha256(enc(nonce));
/** The bytes a NEAR wallet signs for this approval (NEP-413: sha256 of borsh(tag, message, nonce, recipient, no callback)). */
export function nep413Bytes(a: Parameters<typeof approvalMessage>[0]): Uint8Array {
  return sha256(cat(u32(2 ** 31 + 413), bstr(approvalMessage(a)), nep413Nonce(a.nonce), bstr(NEP413_RECIPIENT), new Uint8Array([0])));
}
/** The NEP-413 payload as a wallet's signMessage takes it. */
export const nep413Payload = (a: Parameters<typeof approvalMessage>[0]) => ({ message: approvalMessage(a), nonce: base64.encode(nep413Nonce(a.nonce)), recipient: NEP413_RECIPIENT });
export const revokeMessage = (nonce: string) => REVOKE_PREFIX + nonce;

/** Signs an approval. Runs on the approver's device (scripts/approve.mts or the /approve page) and in tests; never on the server. */
export function signApproval(i: { approver: string; secretKey: Uint8Array; digest: string; nonce: string; issuedAt: number; expiresAt: number }): SignedApproval {
  const publicKey = hex(ed25519.getPublicKey(i.secretKey));
  const body = { approver: i.approver, publicKey, digest: i.digest, nonce: i.nonce, issuedAt: i.issuedAt, expiresAt: i.expiresAt };
  return { ...body, signature: hex(ed25519.sign(enc(approvalMessage(body)), i.secretKey)) };
}

export const signRevoke = (nonce: string, secretKey: Uint8Array) => hex(ed25519.sign(enc(revokeMessage(nonce)), secretKey));

export function verifySignature(a: SignedApproval): boolean {
  if (!isHex(a.signature, 128) || !isHex(a.publicKey, 64)) return false;
  const bytes = a.scheme === "nep413" ? nep413Bytes(a) : enc(approvalMessage(a));
  try { return ed25519.verify(fromHex(a.signature), bytes, fromHex(a.publicKey)); } catch { return false; }
}

/** Signs an approval as a NEAR account would through NEP-413 (scripts/approve.mts with a NEAR credentials file, and tests). */
export function signApprovalNep413(i: { approver: string; accountId: string; secretKey: Uint8Array; digest: string; nonce: string; issuedAt: number; expiresAt: number }): SignedApproval {
  const publicKey = hex(ed25519.getPublicKey(i.secretKey));
  const body = { approver: i.approver, accountId: i.accountId, publicKey, digest: i.digest, nonce: i.nonce, issuedAt: i.issuedAt, expiresAt: i.expiresAt, scheme: "nep413" as const };
  return { ...body, signature: hex(ed25519.sign(nep413Bytes(body), i.secretKey)) };
}

export function verifyRevoke(nonce: string, signature: string, publicKey: string): boolean {
  if (!isHex(signature, 128) || !isHex(publicKey, 64)) return false;
  try { return ed25519.verify(fromHex(signature), enc(revokeMessage(nonce)), fromHex(publicKey)); } catch { return false; }
}

/** Parses the pinned approver registry (APPROVER_KEYS: JSON array of {name, publicKey, revoked?}). Bad input gives an empty registry: fail closed. */
export function parseApprovers(raw: string | undefined): Approver[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a) => a && typeof a.name === "string" && isHex(String(a.publicKey).toLowerCase(), 64))
      .map((a) => ({ name: a.name, publicKey: String(a.publicKey).toLowerCase(), ...(typeof a.accountId === "string" ? { accountId: a.accountId } : {}), ...(a.revoked ? { revoked: true } : {}) }));
  } catch { return []; }
}

/** One approval on its own: signature, approver, terms, time. Replay and duplicates are checked over the set. */
function checkOne(a: SignedApproval, i: { digest: string; approvers: Approver[]; nowMs: number }): ApprovalRefusal | null {
  if (!a || typeof a.approver !== "string" || typeof a.nonce !== "string" || !a.nonce || a.nonce.length > 128 || !Number.isSafeInteger(a.issuedAt) || !Number.isSafeInteger(a.expiresAt)) return "bad_input";
  const reg = i.approvers.find((x) => x.name === a.approver);
  if (!reg) return "unknown_approver";
  if (reg.revoked) return "approver_revoked";
  if (reg.publicKey !== a.publicKey) return "key_mismatch";
  // A NEAR-account approver must sign as that account, through NEP-413.
  if (reg.accountId && (a.scheme !== "nep413" || a.accountId !== reg.accountId)) return "key_mismatch";
  if (!verifySignature(a)) return "bad_signature";
  if (a.digest !== i.digest) return "terms_mismatch";
  if (a.expiresAt - a.issuedAt > APPROVAL_MAX_TTL_MS) return "ttl_too_long";
  if (a.issuedAt > i.nowMs + APPROVAL_SKEW_MS) return "not_yet_valid";
  if (i.nowMs >= a.expiresAt) return "expired";
  return null;
}

/**
 * Whether `approvals` authorize committing exactly `terms` now: at least `terms.approvalsRequired`
 * distinct, pinned, unrevoked approvers, each with a valid signature over this terms digest, unexpired,
 * and a nonce never consumed before. Returns the approvers and nonces to consume, or the reason.
 */
export function verifyApprovals(i: { terms: CommitTerms; approvals: SignedApproval[]; approvers: Approver[]; nowMs: number; consumed: ReadonlySet<string> }): ApprovalResult {
  const required = i.terms.approvalsRequired;
  const digest = termsDigest(i.terms);
  const verdicts: ApprovalVerdict[] = [];
  if (required > 0 && i.approvers.filter((a) => !a.revoked).length < required) {
    return { ok: false, reason: "approvals_not_configured", valid: 0, required, verdicts };
  }
  const seenApprover = new Set<string>(), seenNonce = new Set<string>();
  const good: SignedApproval[] = [];
  for (const a of i.approvals) {
    let reason = checkOne(a, { digest, approvers: i.approvers, nowMs: i.nowMs });
    if (!reason && i.consumed.has(a.nonce)) reason = "replayed";
    if (!reason && seenNonce.has(a.nonce)) reason = "duplicate_nonce";
    if (!reason && seenApprover.has(a.approver)) reason = "duplicate_approver";
    verdicts.push({ approver: String(a?.approver), nonce: String(a?.nonce), ok: !reason, ...(reason ? { reason } : {}) });
    if (reason) continue;
    seenApprover.add(a.approver); seenNonce.add(a.nonce); good.push(a);
  }
  if (good.length >= required) {
    const use = good.slice(0, required);
    return { ok: true, approvers: use.map((a) => a.approver), nonces: use.map((a) => a.nonce), verdicts };
  }
  // Name the most telling failure: the first refused approval's reason, else simply too few.
  const first = verdicts.find((v) => !v.ok)?.reason;
  return { ok: false, reason: first ?? "not_enough_approvals", valid: good.length, required, verdicts };
}
