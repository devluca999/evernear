// The release gate client: runs worker/release-gate on OutLayer as a direct wasm run, on chain, and
// reads its answer. A direct run is a `request_execution` call on outlayer.testnet with a `WasmUrl`
// source, signed by Evernear's NEAR testnet account: that account and the wasm's sha256 are what
// the gate's keys are bound to (`bind: "wasm"`, worker/release-gate/README.md). It is never a
// project or HTTPS call, which the gate's manifest refuses.
//
// The transaction is sent through OutLayer's custody wallet API (`POST /wallet/v1/call`, the same
// route `outlayer run --wasm` takes when logged in with a wallet key), so the signer is the custody
// wallet behind RELEASE_GATE_WALLET_KEY, and Evernear's server holds no NEAR private key.
//
// Behind the ReleaseGate interface, so tests use a fake (tests/near/fakeReleaseGate.ts) and never
// call OutLayer. Not configured (no RELEASE_GATE_WASM_URL): releaseGateFromEnv answers null and
// the escrow keeps the server-derived grant, labelled so on every release proof.
import { canonical, type GateEnrollOutput, type GateReleaseInput, type GateReleaseOutput, verifyGateSignature } from "../../engine/releaseGate";
import { httpJson, outlayerBase, type Fetch } from "./http";

export const OUTLAYER_CONTRACT_TESTNET = "outlayer.testnet";
/** 300 TGas, the most a call may attach. */
const GAS = "300000000000000";
/** 0.1 testnet NEAR for the run; OutLayer refunds what the run does not use. */
const DEFAULT_DEPOSIT_YOCTO = "100000000000000000000000";
const RESOURCE_LIMITS = { max_instructions: 2_000_000_000, max_memory_mb: 128, max_execution_seconds: 60 };

/** What one run cost and where to find it. */
export interface GateRun { call: string; txHash: string | null; requestId: string | null }

export interface ReleaseGate {
  readonly wasmUrl: string;
  readonly wasmSha256: string;
  /** Derives the order wallet's grant token inside the enclave; only its sha256 comes out. */
  enroll(agentId: string): Promise<{ output: GateEnrollOutput; run: GateRun }>;
  /** Decides one stage inside the enclave and, if every signal is there, sends the withdraw itself. */
  release(input: GateReleaseInput): Promise<{ output: GateReleaseOutput; run: GateRun }>;
}

export class GateConfigError extends Error {}

/**
 * The gate's answer from a `/wallet/v1/call` result. OutLayer resolves the execution's output into
 * the transaction's return value; depending on response_format and the coordinator it arrives as a
 * JSON value, a JSON string, or `{output: ...}`. Anything else is refused rather than guessed.
 */
export function parseRunResult(result: unknown): Record<string, unknown> {
  let v: unknown = result;
  for (let i = 0; i < 4; i++) {
    if (typeof v === "string") {
      try { v = JSON.parse(v); } catch { throw new Error("release gate answer is not JSON"); }
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ("ok" in o || "mode" in o || "reason" in o) return o;
      if ("output" in o) { v = o.output; continue; }
      if ("result" in o) { v = o.result; continue; }
    }
    break;
  }
  throw new Error("release gate answer has no output");
}

export class OutlayerReleaseGate implements ReleaseGate {
  private base = outlayerBase();
  constructor(private o: { fetch: Fetch; walletKey: string; wasmUrl: string; wasmSha256: string; depositYocto?: string }) {}
  get wasmUrl() { return this.o.wasmUrl; }
  get wasmSha256() { return this.o.wasmSha256; }

  private async run(input: Record<string, unknown>): Promise<{ output: Record<string, unknown>; run: GateRun }> {
    const args = {
      source: { WasmUrl: { url: this.o.wasmUrl, hash: this.o.wasmSha256, build_target: "wasm32-wasip2" } },
      input_data: canonical(input),
      resource_limits: RESOURCE_LIMITS,
      response_format: "Json",
    };
    const r = await httpJson<{ request_id?: string; status?: string; tx_hash?: string; result?: unknown; error?: string }>({
      fetch: this.o.fetch, base: this.base, method: "POST", path: "/wallet/v1/call",
      headers: { Authorization: `Bearer ${this.o.walletKey}` },
      body: { receiver_id: OUTLAYER_CONTRACT_TESTNET, method_name: "request_execution", args, gas: GAS, deposit: this.o.depositYocto ?? DEFAULT_DEPOSIT_YOCTO },
    });
    const run: GateRun = { call: `outlayer run --wasm (request_execution on ${OUTLAYER_CONTRACT_TESTNET})`, txHash: r.json.tx_hash ?? null, requestId: r.json.request_id ?? null };
    if (r.json.status !== "success") throw new Error(`release gate run ended ${r.json.status ?? "without a status"}${r.json.error ? `: ${r.json.error}` : ""}`);
    return { output: parseRunResult(r.json.result), run };
  }

  async enroll(agentId: string) {
    const { output, run } = await this.run({ mode: "enroll", agent_id: agentId });
    return { output: output as unknown as GateEnrollOutput, run };
  }

  async release(input: GateReleaseInput) {
    const { output, run } = await this.run(input as unknown as Record<string, unknown>);
    return { output: output as unknown as GateReleaseOutput, run };
  }
}

/** The gate from the env, or null when RELEASE_GATE_WASM_URL is not set. Half a configuration is refused, never a silent fallback. */
export function releaseGateFromEnv(env: Record<string, string | undefined>, fetch: Fetch): ReleaseGate | null {
  const url = env.RELEASE_GATE_WASM_URL?.trim();
  if (!url) return null;
  const sha = env.RELEASE_GATE_WASM_SHA256?.trim().toLowerCase();
  const key = env.RELEASE_GATE_WALLET_KEY?.trim();
  if (!url.startsWith("https://")) throw new GateConfigError("RELEASE_GATE_WASM_URL must be https");
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) throw new GateConfigError("release gate configured without RELEASE_GATE_WASM_SHA256");
  if (!key) throw new GateConfigError("release gate configured without RELEASE_GATE_WALLET_KEY");
  return new OutlayerReleaseGate({ fetch, walletKey: key, wasmUrl: url, wasmSha256: sha, depositYocto: env.RELEASE_GATE_DEPOSIT_YOCTO?.trim() || undefined });
}

/** Checks an enroll answer: for this agent, a sha256 grant hash, an ed25519 key (the pinned one, when pinned). */
export function checkEnroll(out: GateEnrollOutput, agentId: string, pinnedKey?: string): { ok: true } | { ok: false; reason: string } {
  if (out.mode !== "enroll" || out.agent_id !== agentId) return { ok: false, reason: "enroll_wrong_agent" };
  if (!/^[0-9a-f]{64}$/.test(out.grant_hash ?? "")) return { ok: false, reason: "enroll_bad_grant_hash" };
  if (!/^[0-9a-f]{64}$/.test(out.public_key ?? "")) return { ok: false, reason: "enroll_bad_public_key" };
  if (pinnedKey && pinnedKey.toLowerCase() !== out.public_key) return { ok: false, reason: "enroll_unexpected_key" };
  return { ok: true };
}

export type GateVerdict = { ok: true } | { ok: false; reason: "bad_signature" | "wrong_key" | "field_mismatch" | "amount_mismatch" };

/**
 * Before a gate result is recorded as a payment: the signature covers exactly this output, the key
 * is the one enroll returned for this order, and the output pays what the engine computed, to the
 * supplier, for this order, stage and account.
 */
export function verifyGateRelease(out: GateReleaseOutput, want: { publicKey: string; stage: string; po: string; agentId: string; to: string; amountCents: number }): GateVerdict {
  if (!verifyGateSignature(out)) return { ok: false, reason: "bad_signature" };
  if (out.public_key !== want.publicKey.toLowerCase()) return { ok: false, reason: "wrong_key" };
  if (out.ok !== true || out.stage !== want.stage || out.po !== want.po || out.agent_id !== want.agentId || out.to?.toLowerCase() !== want.to.toLowerCase()) return { ok: false, reason: "field_mismatch" };
  if (out.amount_cents !== want.amountCents) return { ok: false, reason: "amount_mismatch" };
  return { ok: true };
}
