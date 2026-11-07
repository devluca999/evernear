// A minimal NEAR transaction signer for one action kind, a function call: borsh encoding of a
// Transaction (V0), an ed25519 signature over its sha256, and the RPC calls to send it and read the
// final outcome. Used to run the release gate as a direct OutLayer wasm run signed by Evernear's own
// NEAR testnet account (the account the gate's enclave-bound keys belong to). Testnet only.
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { base58 } from "@scure/base";
import type { Fetch } from "./http";

const utf8 = (s: string) => new TextEncoder().encode(s);
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const uint = (n: bigint, bytes: number) => { const b = new Uint8Array(bytes); let v = n; for (let i = 0; i < bytes; i++) { b[i] = Number(v & 0xffn); v >>= 8n; } if (v !== 0n) throw new Error("integer too large"); return b; };
const str = (s: string) => { const x = utf8(s); return cat(u32(x.length), x); };
const bytes = (x: Uint8Array) => cat(u32(x.length), x);

export interface FunctionCall { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint }
export interface Tx { signerId: string; publicKey: Uint8Array; nonce: bigint; receiverId: string; blockHash: Uint8Array; actions: FunctionCall[] }

/** borsh(Transaction V0) with function-call actions only (Action enum index 2). */
export function encodeTx(t: Tx): Uint8Array {
  if (t.publicKey.length !== 32 || t.blockHash.length !== 32) throw new Error("public key and block hash must be 32 bytes");
  const actions = t.actions.map((a) => cat(new Uint8Array([2]), str(a.methodName), bytes(a.args), uint(a.gas, 8), uint(a.deposit, 16)));
  return cat(str(t.signerId), new Uint8Array([0]), t.publicKey, uint(t.nonce, 8), str(t.receiverId), t.blockHash, u32(actions.length), ...actions);
}

/** A NEAR ed25519 private key (`ed25519:` + base58 of 64 bytes, or of the 32-byte seed). */
export function parseNearKey(key: string): { seed: Uint8Array; publicKey: Uint8Array } {
  if (!key.startsWith("ed25519:")) throw new Error("expected an ed25519: key");
  const raw = base58.decode(key.slice(8));
  if (raw.length !== 64 && raw.length !== 32) throw new Error("expected a 32 or 64 byte ed25519 key");
  const seed = raw.slice(0, 32);
  const publicKey = ed25519.getPublicKey(seed);
  if (raw.length === 64 && !raw.slice(32).every((b, i) => b === publicKey[i])) throw new Error("key pair does not match");
  return { seed, publicKey };
}

/** Signs: the hash is sha256(borsh(tx)); the signed transaction is tx + Signature(ed25519). */
export function signTx(t: Tx, seed: Uint8Array): { signedBase64: string; hash: string } {
  const body = encodeTx(t);
  const digest = sha256(body);
  const sig = ed25519.sign(digest, seed);
  const signed = cat(body, new Uint8Array([0]), sig);
  return { signedBase64: Buffer.from(signed).toString("base64"), hash: base58.encode(digest) };
}

async function rpc<T>(fetch: Fetch, url: string, method: string, params: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: "evernear", method, params }) });
  const j = (await r.json()) as { result?: T; error?: { message?: string; data?: unknown; cause?: { name?: string } } };
  if (j.error || j.result === undefined) throw new Error(`NEAR RPC ${method} failed: ${j.error?.cause?.name ?? j.error?.message ?? "no result"}`);
  return j.result;
}

export const TESTNET_RPC = "https://rpc.testnet.fastnear.com";

interface Outcome { status: { SuccessValue?: string; Failure?: unknown }; logs: string[] }
interface FinalTx { status: { SuccessValue?: string; Failure?: unknown }; transaction: { hash: string }; receipts_outcome: { outcome: Outcome }[] }

/**
 * Sends one function call signed by `account`, waits for finality and returns the transaction's
 * final return value (decoded) plus every receipt log. A failed transaction throws.
 */
/** Polls a transaction until it is final; an RPC timeout or a not-yet-known transaction means try again. */
async function finalOf(fetch: Fetch, url: string, hash: string, account: string, pollMs: number, maxPolls: number): Promise<FinalTx> {
  for (let i = 0; i < maxPolls; i++) {
    try {
      return await rpc<FinalTx>(fetch, url, "tx", { tx_hash: hash, sender_account_id: account, wait_until: "FINAL" });
    } catch (e) {
      if (!/TIMEOUT_ERROR|UNKNOWN_TRANSACTION/.test(String(e))) throw e;
    }
    if (pollMs) await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`transaction ${hash} was not final after ${maxPolls} polls`);
}

export async function callFunction(o: { fetch: Fetch; rpcUrl?: string; account: string; key: string; receiverId: string; call: FunctionCall; pollMs?: number; maxPolls?: number }): Promise<{ hash: string; value: string | null; logs: string[] }> {
  const url = o.rpcUrl ?? TESTNET_RPC;
  if (!/testnet/.test(url)) throw new Error("testnet RPC only");
  const { seed, publicKey } = parseNearKey(o.key);
  const pk = `ed25519:${base58.encode(publicKey)}`;
  const ak = await rpc<{ nonce: number | string; block_hash: string }>(o.fetch, url, "query", { request_type: "view_access_key", finality: "final", account_id: o.account, public_key: pk });
  const tx: Tx = { signerId: o.account, publicKey, nonce: BigInt(ak.nonce) + 1n, receiverId: o.receiverId, blockHash: base58.decode(ak.block_hash), actions: [o.call] };
  const { signedBase64, hash } = signTx(tx, seed);
  // An OutLayer run resolves later than an RPC call waits, so: send until included, then poll by hash.
  await rpc(o.fetch, url, "send_tx", { signed_tx_base64: signedBase64, wait_until: "INCLUDED" });
  const r = await finalOf(o.fetch, url, hash, o.account, o.pollMs ?? 3000, o.maxPolls ?? 40);
  if (r.status.Failure !== undefined) throw new Error(`transaction ${hash} failed: ${JSON.stringify(r.status.Failure).slice(0, 300)}`);
  const v = r.status.SuccessValue;
  const value = v ? Buffer.from(v, "base64").toString("utf8") : null;
  return { hash: r.transaction?.hash ?? hash, value, logs: r.receipts_outcome.flatMap((x) => x.outcome.logs) };
}
