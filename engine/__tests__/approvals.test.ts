import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { APPROVAL_MAX_TTL_MS, parseApprovers, signApproval, termsDigest, verifyApprovals, type CommitTerms } from "../approvals";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const K = { Luca: new Uint8Array(32).fill(1), Jordan: new Uint8Array(32).fill(2) };
const approvers = [{ name: "Luca", publicKey: hex(ed25519.getPublicKey(K.Luca)) }, { name: "Jordan", publicKey: hex(ed25519.getPublicKey(K.Jordan)) }];
const NOW = 1_800_000_000_000;
const terms: CommitTerms = {
  v: 1, po: "1042", termsVersion: 2, buyer: "Astro Robotics Inc.", supplierId: "haoyun", supplierAddress: "0x2003975a521c6fa45238dbc402c9e4adcb8863e0", supplierChain: "base",
  part: "Actuator motor", quantity: 50, unitCents: 126_000, totalCents: 6_300_000, priceChangeBps: 500, withinCeiling: true, currency: "USD", settlement: { asset: "a", chain: "base", scale: 1000, units: "63000000" },
  rulesHash: "r1", approvalsRequired: 2,
};
const sign = (name: "Luca" | "Jordan", t: CommitTerms = terms, o: { issuedAt?: number; ttl?: number; nonce?: string } = {}) =>
  signApproval({ approver: name, secretKey: K[name], digest: termsDigest(t), nonce: o.nonce ?? `${name}-1`, issuedAt: o.issuedAt ?? NOW - 1000, expiresAt: (o.issuedAt ?? NOW - 1000) + (o.ttl ?? 3_600_000) });
const verify = (approvals: ReturnType<typeof sign>[], t: CommitTerms = terms, consumed: string[] = []) =>
  verifyApprovals({ terms: t, approvals, approvers, nowMs: NOW, consumed: new Set(consumed) });

describe("commit approvals (engine/approvals.ts)", () => {
  it("two distinct pinned approvers over the exact terms authorize them", () => {
    expect(verify([sign("Luca"), sign("Jordan")])).toMatchObject({ ok: true, approvers: ["Luca", "Jordan"], nonces: ["Luca-1", "Jordan-1"] });
  });
  it("any change in terms changes the digest: supplier, amount, quantity, wallet, version, currency units, rules", () => {
    const changes: Partial<CommitTerms>[] = [
      { supplierId: "quickship" }, { unitCents: 125_999 }, { totalCents: 6_299_900 }, { quantity: 49 }, { supplierAddress: "0xdead" },
      { termsVersion: 1 }, { settlement: { ...terms.settlement, units: "63000001" } }, { rulesHash: "r2" }, { approvalsRequired: 1 }, { po: "1043" },
    ];
    for (const c of changes) {
      const changed = { ...terms, ...c };
      expect(termsDigest(changed)).not.toBe(termsDigest(terms));
      expect(verify([sign("Luca"), sign("Jordan")], changed)).toMatchObject({ ok: false, reason: "terms_mismatch" });
    }
  });
  it("a payment-rule change between approval and commit needs reapproval", () => {
    expect(verify([sign("Luca"), sign("Jordan")], { ...terms, rulesHash: "rules-after-edit" })).toMatchObject({ ok: false, reason: "terms_mismatch", valid: 0 });
  });
  it("one approval, the same approver twice, a reused nonce", () => {
    expect(verify([sign("Luca")])).toMatchObject({ ok: false, reason: "not_enough_approvals", valid: 1 });
    expect(verify([sign("Luca"), sign("Luca", terms, { nonce: "Luca-2" })])).toMatchObject({ ok: false, reason: "duplicate_approver" });
    expect(verify([sign("Luca", terms, { nonce: "x" }), sign("Jordan", terms, { nonce: "x" })])).toMatchObject({ ok: false, reason: "duplicate_nonce" });
  });
  it("a replayed approval (nonce already consumed)", () => {
    expect(verify([sign("Luca"), sign("Jordan")], terms, ["Jordan-1"])).toMatchObject({ ok: false, reason: "replayed" });
  });
  it("expired, not yet valid, and over-long approvals", () => {
    expect(verify([sign("Luca", terms, { issuedAt: NOW - 7_200_000 }), sign("Jordan")])).toMatchObject({ ok: false, reason: "expired" });
    expect(verify([sign("Luca", terms, { issuedAt: NOW + 3_600_000 }), sign("Jordan")])).toMatchObject({ ok: false, reason: "not_yet_valid" });
    expect(verify([sign("Luca", terms, { ttl: APPROVAL_MAX_TTL_MS + 1 }), sign("Jordan")])).toMatchObject({ ok: false, reason: "ttl_too_long" });
  });
  it("tampering with any signed field breaks the signature", () => {
    const a = sign("Luca");
    expect(verify([{ ...a, expiresAt: a.expiresAt + 1 }, sign("Jordan")])).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verify([{ ...a, nonce: "other" }, sign("Jordan")])).toMatchObject({ ok: false, reason: "bad_signature" });
  });
  it("fails closed without a registry, and parses only well-formed keys", () => {
    expect(verifyApprovals({ terms, approvals: [sign("Luca"), sign("Jordan")], approvers: [], nowMs: NOW, consumed: new Set() })).toMatchObject({ ok: false, reason: "approvals_not_configured" });
    expect(parseApprovers(undefined)).toEqual([]);
    expect(parseApprovers("not json")).toEqual([]);
    expect(parseApprovers(JSON.stringify([{ name: "A", publicKey: "zz" }, { name: "B", publicKey: "AB".repeat(32) }]))).toEqual([{ name: "B", publicKey: "ab".repeat(32) }]);
  });
  it("an order that needs no approvals passes with none", () => {
    expect(verify([], { ...terms, approvalsRequired: 0 })).toMatchObject({ ok: true, approvers: [] });
  });
});

import { nep413Bytes, nep413Payload, signApprovalNep413 } from "../approvals";
import { nep413Hash } from "../../convex/near/agentapi";

describe("NEAR-account approvers (NEP-413)", () => {
  const nearApprovers = [approvers[0], { ...approvers[1], accountId: "jordan-bennett.testnet" }];
  const jordanNear = () => signApprovalNep413({ approver: "Jordan", accountId: "jordan-bennett.testnet", secretKey: K.Jordan, digest: termsDigest(terms), nonce: "j-near", issuedAt: NOW - 1000, expiresAt: NOW + 3_600_000 });
  it("signs exactly the NEP-413 bytes a NEAR wallet signs (same as the owner-intent signer)", () => {
    const a = jordanNear();
    expect(Buffer.from(nep413Bytes(a)).toString("hex")).toBe(Buffer.from(nep413Hash(nep413Payload(a))).toString("hex"));
  });
  it("a NEAR-account approver counts only with a NEP-413 signature as that account", () => {
    const v = (j: ReturnType<typeof sign>) => verifyApprovals({ terms, approvals: [sign("Luca"), j], approvers: nearApprovers, nowMs: NOW, consumed: new Set() });
    expect(v(jordanNear())).toMatchObject({ ok: true });
    expect(v(sign("Jordan"))).toMatchObject({ ok: false, reason: "key_mismatch" });
    expect(v({ ...jordanNear(), accountId: "mallory.testnet" })).toMatchObject({ ok: false, reason: "key_mismatch" });
    expect(v({ ...jordanNear(), scheme: "ed25519" })).toMatchObject({ ok: false, reason: "key_mismatch" });
  });
});
