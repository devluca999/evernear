// The attested dock check. The release is computed inside an OutLayer worker; Convex accepts it
// only if the attestation names the approved build and binds this exact input and output.
import { sha256Hex } from "./http";
import { plainEngine } from "../../engine/plain";

export interface DockInput { po: string; ordered_qty: number; received_qty: number; unit_cents: number }
export interface DockOutput { po: string; accepted_qty: number; release_cents: number; hold_cents: number }
export interface WorkerAttestation { wasmSha256: string; inputSha256: string; outputSha256: string }

/** Canonical bytes: fixed key order, no spaces. Hashes are over exactly these. */
export const canonicalInput = (i: DockInput) =>
  JSON.stringify({ po: i.po, ordered_qty: i.ordered_qty, received_qty: i.received_qty, unit_cents: i.unit_cents });

export type Verdict = { ok: true; releaseCents: number; holdCents: number } | { ok: false; reason: "wrong_build" | "input_mismatch" | "output_mismatch" | "amount_mismatch" | "no_approved_build" };

export async function verifyAttestedRelease(i: { input: DockInput; outputText: string; attestation: WorkerAttestation; approvedWasmSha256: string | undefined }): Promise<Verdict> {
  if (!i.approvedWasmSha256) return { ok: false, reason: "no_approved_build" };
  if (i.attestation.wasmSha256.toLowerCase() !== i.approvedWasmSha256.toLowerCase()) return { ok: false, reason: "wrong_build" };
  if (i.attestation.inputSha256 !== (await sha256Hex(canonicalInput(i.input)))) return { ok: false, reason: "input_mismatch" };
  if (i.attestation.outputSha256 !== (await sha256Hex(i.outputText))) return { ok: false, reason: "output_mismatch" };
  const out = JSON.parse(i.outputText) as DockOutput;
  const want = plainEngine.matchReceipt({ orderedQty: i.input.ordered_qty, receivedQty: i.input.received_qty, unitCents: i.input.unit_cents });
  if (out.release_cents !== want.releaseCents || out.hold_cents !== want.holdCents || out.po !== i.input.po) return { ok: false, reason: "amount_mismatch" };
  return { ok: true, releaseCents: out.release_cents, holdCents: out.hold_cents };
}
