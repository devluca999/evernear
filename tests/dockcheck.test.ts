import { describe, expect, it } from "vitest";
import vectors from "@/worker/dock-check/vectors.json";
import { plainEngine } from "@/engine/plain";
import { canonicalInput, verifyAttestedRelease, type DockInput } from "@/convex/near/dockcheck";
import { sha256Hex } from "@/convex/near/http";

const APPROVED = "ab".repeat(32);
const input: DockInput = { po: "1042", ordered_qty: 2000, received_qty: 1800, unit_cents: 1900 };
const outputText = JSON.stringify({ po: "1042", accepted_qty: 1800, release_cents: 3420000, hold_cents: 380000 });
const att = async (o: Partial<{ wasm: string; inText: string; outText: string }> = {}) => ({
  wasmSha256: o.wasm ?? APPROVED,
  inputSha256: await sha256Hex(o.inText ?? canonicalInput(input)),
  outputSha256: await sha256Hex(o.outText ?? outputText),
});

describe("dock check vectors", () => {
  it("the engine and the worker agree on every shared vector", () => {
    for (const v of vectors) {
      const m = plainEngine.matchReceipt({ orderedQty: v.input.ordered_qty, receivedQty: v.input.received_qty, unitCents: v.input.unit_cents });
      expect({ accepted_qty: m.acceptedQty, release_cents: m.releaseCents, hold_cents: m.holdCents }).toEqual({
        accepted_qty: v.output.accepted_qty, release_cents: v.output.release_cents, hold_cents: v.output.hold_cents,
      });
    }
  });
});

describe("attested release", () => {
  it("accepts the approved build: release $34,200, hold $3,800", async () => {
    expect(await verifyAttestedRelease({ input, outputText, attestation: await att(), approvedWasmSha256: APPROVED })).toEqual({ ok: true, releaseCents: 3420000, holdCents: 380000 });
  });
  it("refuses a release request not from the approved build", async () => {
    expect(await verifyAttestedRelease({ input, outputText, attestation: await att({ wasm: "cd".repeat(32) }), approvedWasmSha256: APPROVED })).toEqual({ ok: false, reason: "wrong_build" });
  });
  it("refuses when no build is approved yet", async () => {
    expect((await verifyAttestedRelease({ input, outputText, attestation: await att(), approvedWasmSha256: undefined })).ok).toBe(false);
  });
  it("refuses an output the attestation does not cover", async () => {
    const forged = JSON.stringify({ po: "1042", accepted_qty: 2000, release_cents: 3800000, hold_cents: 0 });
    expect(await verifyAttestedRelease({ input, outputText: forged, attestation: await att(), approvedWasmSha256: APPROVED })).toMatchObject({ ok: false, reason: "output_mismatch" });
  });
  it("refuses an attested output whose amount disagrees with the engine", async () => {
    const wrong = JSON.stringify({ po: "1042", accepted_qty: 2000, release_cents: 3800000, hold_cents: 0 });
    expect(await verifyAttestedRelease({ input, outputText: wrong, attestation: await att({ outText: wrong }), approvedWasmSha256: APPROVED })).toMatchObject({ ok: false, reason: "amount_mismatch" });
  });
  it("refuses an attestation over a different input", async () => {
    const other = canonicalInput({ ...input, received_qty: 2000 });
    expect(await verifyAttestedRelease({ input, outputText, attestation: await att({ inText: other }), approvedWasmSha256: APPROVED })).toMatchObject({ ok: false, reason: "input_mismatch" });
  });
});
