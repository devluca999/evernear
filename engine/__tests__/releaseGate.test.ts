// The TypeScript twin against the worker's own vectors (worker/release-gate/vectors.json, which
// `cargo test` also reads), so the Rust gate and the TypeScript check cannot drift.
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import vectors from "../../worker/release-gate/vectors.json";
import {
  canonical, centsToBaseUnits, evidenceSha256, gateDecide, gateGrantHash, gateIdempotencyKey, gateUrlAllowed, grantTokenFromMac,
  GATE_SIGN_PREFIX, signGateOutput, signedMessage, verifyGateSignature, type GateReleaseInput, type GateReleaseOutput,
} from "../releaseGate";
import { BASE_USDC } from "../../convex/near/agentapi";

const fromHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("release gate twin: shared vectors", () => {
  it("uses the worker's constants", () => {
    expect(vectors.constants.sign_prefix).toBe(GATE_SIGN_PREFIX);
    expect(vectors.constants.asset).toBe(BASE_USDC);
  });

  for (const c of vectors.release_cases) {
    it(`decides "${c.name}" as the worker does`, () => {
      const d = gateDecide(c.input as unknown as GateReleaseInput);
      const e = c.expect as { ok: boolean; amount_cents?: number; held_cents?: number; base_units?: string; signals?: string[]; reason?: string; missing?: string[] };
      if (e.ok) {
        expect(d).toEqual({ ok: true, amount_cents: e.amount_cents, held_cents: e.held_cents, signal_ids: e.signals });
        if (d.ok) expect(centsToBaseUnits(d.amount_cents)).toBe(e.base_units);
      } else {
        expect(d).toEqual({ ok: false, reason: e.reason, missing: e.missing ?? [] });
      }
    });
  }

  it("scales cents to Base USDC base units exactly (1:1,000)", () => {
    for (const s of vectors.scale_cases) expect(centsToBaseUnits(s.cents)).toBe(s.base_units);
  });

  it("derives the same idempotency key per agent, order and stage", () => {
    for (const k of vectors.idempotency_cases) expect(gateIdempotencyKey(k.agent_id, k.po, k.stage)).toBe(k.key);
  });

  it("forms the grant token and its hash as the worker does", () => {
    for (const t of vectors.token_cases) {
      const token = grantTokenFromMac(fromHex(t.mac_hex));
      expect(token).toBe(t.token);
      expect(gateGrantHash(token)).toBe(t.grant_hash);
    }
  });

  it("allows only Tidepool's agent paths", () => {
    for (const h of vectors.host_cases) expect(gateUrlAllowed(h.url), h.url).toBe(h.allowed);
  });

  it("verifies the worker's signed refusal byte for byte", () => {
    const s = vectors.signature_case;
    const out = s.output as GateReleaseOutput;
    expect(signedMessage(out as unknown as Record<string, unknown>)).toBe(s.message);
    expect(verifyGateSignature(out)).toBe(true);
    expect(hex(ed25519.getPublicKey(fromHex(s.seed_hex)))).toBe(s.public_key_hex);
    const input = vectors.release_cases.find((c) => c.name === s.input_case)!.input as unknown as GateReleaseInput;
    expect(evidenceSha256(input)).toBe(out.evidence_sha256);
    // Same seed, same bytes: the twin signs exactly what the worker signed.
    const { signature: _s, public_key: _p, ...body } = s.output;
    void _s; void _p;
    expect(signGateOutput(body, fromHex(s.seed_hex)).signature).toBe(s.signature_hex);
  });

  it("rejects a tampered output, a swapped key and a malformed signature", () => {
    const out = vectors.signature_case.output as GateReleaseOutput;
    expect(verifyGateSignature({ ...out, reason: "nothing_due" })).toBe(false);
    expect(verifyGateSignature({ ...out, missing: [] })).toBe(false);
    expect(verifyGateSignature({ ...out, public_key: hex(ed25519.getPublicKey(new Uint8Array(32).fill(9))) })).toBe(false);
    expect(verifyGateSignature({ ...out, signature: "00" })).toBe(false);
    expect(verifyGateSignature({ ...out, signature: undefined })).toBe(false);
  });

  it("writes canonical JSON with sorted keys and no spaces", () => {
    expect(canonical({ b: 1, a: [true, "x", { d: null, c: 2 }] })).toBe('{"a":[true,"x",{"c":2,"d":null}],"b":1}');
  });
});

describe("gate v2 pins the advance percent the buyer's rules set", () => {
  it("TS twin, Rust build and policy/astro.json agree", async () => {
    const { readFileSync } = await import("node:fs");
    const rules = JSON.parse(readFileSync("policy/astro.json", "utf8"));
    const rust = readFileSync("worker/release-gate/src/lib.rs", "utf8");
    const { GATE_ADVANCE_PERCENT } = await import("../releaseGate");
    expect(GATE_ADVANCE_PERCENT).toBe(rules.escrow.advance_percent);
    expect(rust).toContain(`pub const ADVANCE_PERCENT: u64 = ${rules.escrow.advance_percent};`);
  });
});
