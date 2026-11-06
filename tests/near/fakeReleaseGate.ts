// A stand-in for worker/release-gate running on OutLayer, for unit tests only. It behaves as the
// worker does, through the TypeScript twin (engine/releaseGate.ts, tested against the worker's own
// vectors): it derives the grant token from a secret only it holds, outputs only its hash on
// enroll, decides each stage, sends the withdraw itself to the fake Tidepool with its own
// idempotency key, and signs every answer with a test ed25519 key. Never calls OutLayer.
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { Fetch } from "@/convex/near/http";
import type { GateRun, ReleaseGate } from "@/convex/near/releaseGate";
import { BASE_USDC } from "@/convex/near/agentapi";
import {
  canonical, centsToBaseUnits, evidenceSha256, gateDecide, gateGrantHash, gateIdempotencyKey, grantTokenFromMac, GATE_GRANT_PREFIX, signGateOutput,
  type GateEnrollOutput, type GateReleaseInput, type GateReleaseOutput,
} from "@/engine/releaseGate";
import { ed25519 } from "@noble/curves/ed25519.js";
import { FAKE_BASE } from "./fakeTidepool";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
export const GATE_SEED = new Uint8Array(32).fill(7);
export const GATE_PUBLIC_KEY = hex(ed25519.getPublicKey(GATE_SEED));

export function fakeReleaseGate(o: { fetch: Fetch; apiKey: string; tamper?: (out: GateReleaseOutput) => GateReleaseOutput; seed?: Uint8Array }) {
  const secret = new TextEncoder().encode("enclave-only-secret");
  const token = (agentId: string) => grantTokenFromMac(hmac(sha256, secret, new TextEncoder().encode(GATE_GRANT_PREFIX + agentId)));
  const seed = o.seed ?? GATE_SEED;
  const runs: { mode: string; input: unknown }[] = [];
  const run = (n: number): GateRun => ({ call: "outlayer run --wasm (request_execution on outlayer.testnet)", txHash: `GATETX${n}`, requestId: `req${n}` });

  const gate: ReleaseGate = {
    wasmUrl: "https://main.fastfs.io/evernear.testnet/outlayer.testnet/release-gate.wasm",
    wasmSha256: "ab".repeat(32),
    async enroll(agentId) {
      runs.push({ mode: "enroll", input: { agent_id: agentId } });
      const output: GateEnrollOutput = { mode: "enroll", agent_id: agentId, grant_hash: gateGrantHash(token(agentId)), public_key: hex(ed25519.getPublicKey(seed)) };
      return { output, run: run(runs.length) };
    },
    async release(input: GateReleaseInput) {
      runs.push({ mode: "release", input });
      const base = { stage: input.stage, po: input.po, agent_id: input.agent_id, evidence_sha256: evidenceSha256(input) };
      const d = gateDecide(input);
      const sign = (b: Record<string, unknown>) => (o.tamper ?? ((x) => x))(signGateOutput(b, seed));
      if (!d.ok) return { output: sign({ ...base, ok: false, reason: d.reason, missing: d.missing }), run: run(runs.length) };
      const res = await o.fetch(`${FAKE_BASE}/v1/agents/${input.agent_id}/withdraw`, {
        method: "POST",
        headers: { "x-api-key": o.apiKey, "x-grant-token": token(input.agent_id), "idempotency-key": gateIdempotencyKey(input.agent_id, input.po, input.stage), "content-type": "application/json" },
        body: canonical({ asset: BASE_USDC, amount: centsToBaseUnits(d.amount_cents), chain: "base", recipient: input.to }),
      });
      const body = (await res.json()) as { correlation_id?: string; status?: string; errors?: { code: string }[] };
      if (res.status !== 202) return { output: sign({ ...base, ok: false, reason: "withdraw_refused", missing: [], tx: { http_status: res.status, error_code: body.errors?.[0]?.code } }), run: run(runs.length) };
      return {
        output: sign({ ...base, ok: true, amount_cents: d.amount_cents, held_cents: d.held_cents, to: input.to, signals: d.signal_ids, tx: { http_status: 202, correlation_id: body.correlation_id, status: body.status } }),
        run: run(runs.length),
      };
    },
  };
  return { gate, runs, token };
}

/**
 * OutLayer's custody `POST /wallet/v1/call` for `request_execution`, answered by the fake gate, so the
 * real OutlayerReleaseGate client is exercised end to end. Everything else goes to `rest`.
 */
export function outlayerWithGate(gate: ReleaseGate, rest: Fetch) {
  const calls: { headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let n = 0;
  const fetch: Fetch = async (url, init) => {
    if (!url.startsWith("https://testnet-api.outlayer.ai/wallet/v1/call")) return rest(url, init);
    const body = JSON.parse(String(init?.body)) as { args: { input_data: string } } & Record<string, unknown>;
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit).forEach((v, k) => { headers[k] = v; });
    calls.push({ headers, body });
    const input = JSON.parse(body.args.input_data) as { mode: string; agent_id: string };
    const { output } = input.mode === "enroll" ? await gate.enroll(input.agent_id) : await gate.release(input as unknown as GateReleaseInput);
    return new Response(JSON.stringify({ request_id: `wreq${++n}`, status: "success", tx_hash: `RUNTX${n}`, result: JSON.stringify(output) }), { status: 200 });
  };
  return { fetch, calls };
}
