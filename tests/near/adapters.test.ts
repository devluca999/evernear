import { describe, expect, it } from "vitest";
import { mockFetch, sinkRecorder } from "./mockFetch";
import { Custody, usdcUnits, ownerPolicy } from "@/convex/near/custody";
import { Approvals, approvalMessage } from "@/convex/near/approval";
import { Gmail } from "@/convex/near/gmail";
import { Inference, isConfidential } from "@/convex/near/inference";
import { secp256k1 } from "@noble/curves/secp256k1";
import { ethAddressOf, signed } from "./ecdsaFixtures";
import type { Fetch, ProofSink } from "@/convex/near/http";
import { MainnetRefused, outlayerBase, sha256Hex } from "@/convex/near/http";
import { cents } from "@/engine/money";
import { bom10MA, suppliers } from "@/seed/astro";

const KEY = "wk_" + "a".repeat(64);
const onlyTestnet = (sent: { url: string }[]) => sent.every((s) => s.url.startsWith("https://testnet-api.outlayer.ai/") || s.url.startsWith("https://cloud-api.near.ai/"));

describe("network guard", () => {
  it("uses the testnet host and refuses mainnet", () => {
    expect(outlayerBase()).toBe("https://testnet-api.outlayer.ai");
    expect(() => outlayerBase({ mainnet: true })).toThrow(MainnetRefused);
  });
});

describe("custody", () => {
  it("registers, records a proof and never stores the api key", async () => {
    const { fetch, sent } = mockFetch({ "POST /register": () => ({ api_key: KEY, wallet_id: "w1", near_account_id: "ab".repeat(32) }) });
    const { proofs, sink } = sinkRecorder();
    const r = await new Custody({ fetch, sink }).register();
    expect(r.wallet_id).toBe("w1");
    expect(proofs).toHaveLength(1);
    expect(JSON.stringify(proofs[0].response)).not.toContain(KEY);
    expect(onlyTestnet(sent)).toBe(true);
  });
  it("pays USDC as ft_transfer in 6 decimal units with an idempotency key", async () => {
    const { fetch, sent } = mockFetch({ "POST /wallet/v1/call": () => ({ request_id: "r1", status: "success", tx_hash: "TX1" }) });
    const { proofs, sink } = sinkRecorder();
    await new Custody({ fetch, apiKey: KEY, sink, idem: () => "idem-1" }).payUsdc({ to: "ultra-motion.testnet", cents: cents(5562), memo: "routine", label: "Routine reorder paid" });
    const body = JSON.parse(sent[0].body);
    expect(body).toMatchObject({ receiver_id: "usdc.fakes.testnet", method_name: "ft_transfer", deposit: "1", args: { receiver_id: "ultra-motion.testnet", amount: "5562000000" } });
    expect(sent[0].headers["X-Idempotency-Key"]).toBe("idem-1");
    expect(sent[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(proofs[0]).toMatchObject({ hash: "TX1", explorerUrl: "https://testnet.nearblocks.io/txns/TX1", synthetic: false });
  });
  it("derives the sub-agent key the documented way", async () => {
    const { fetch, sent } = mockFetch({ "PUT /wallet/v1/api-key": () => ({ wallet_id: "w2", near_account_id: "cd".repeat(32) }) });
    const r = await new Custody({ fetch, apiKey: KEY, sink: () => {} }).createSubWallet("po-1042");
    expect(r.apiKey).toBe("wk_" + (await sha256Hex(`po-1042:0:${KEY}`)));
    expect(JSON.parse(sent[0].body)).toEqual({ seed: "po-1042", key_hash: await sha256Hex(r.apiKey) });
  });
  it("builds an owner policy with a whitelist and a per-transaction cap", () => {
    const p = ownerPolicy({ walletId: "w1", whitelist: ["a.testnet"], perTxUsdc: 10000, approvers: [{ id: "luca" }, { id: "jordy" }], threshold: 2 });
    expect(p.rules.addresses).toEqual({ mode: "whitelist", list: ["a.testnet"] });
    expect(p.rules.limits.per_transaction["usdc.fakes.testnet"]).toBe("10000000000");
    expect(p.approval.threshold).toEqual({ required: 2 });
    expect(usdcUnits(cents(38000))).toBe("38000000000");
  });
  it("says plainly when no key is configured", async () => {
    await expect(new Custody({ fetch: mockFetch({}).fetch, sink: () => {} }).address()).rejects.toThrow("not configured");
  });
});

describe("approvals", () => {
  it("signs the documented message and records each vote", async () => {
    expect(approvalMessage("ap1", "ed25519:PK", "H")).toBe("approve:ap1:ed25519:PK:H");
    const { fetch, sent } = mockFetch({ "POST /wallet/v1/approve/ap1": () => ({ approval_id: "ap1", status: "pending", approved: 1, required: 2 }) });
    const { proofs, sink } = sinkRecorder();
    await new Approvals({ fetch, sink }).submit({ approvalId: "ap1", approver: "Luca", signature: "sig", public_key: "ed25519:PK", account_id: "luca.testnet", nonce: "n" });
    expect(sent[0].headers.Authorization).toBeUndefined();
    expect(proofs[0].label).toBe("Approval 1 of 2: Luca");
  });
});

describe("gmail connector", () => {
  const allowlist = ["sales@haoyun-precision.example"];
  it("refuses an off-list address without calling the connector", async () => {
    const { fetch, sent } = mockFetch({});
    const { proofs, sink } = sinkRecorder();
    const r = await new Gmail({ fetch, paymentKey: "o:1:k", ownerAccount: "astro.testnet", allowlist, sink }).send({ to: "deals@unknown-broker.example", subject: "PO 1042", body: "x" });
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect(proofs[0].label).toBe("Email to an off list address refused");
  });
  it("sends through the testnet connector with the payment key", async () => {
    const { fetch, sent } = mockFetch({ "POST /call/connectors.outlayer.testnet/gmail": () => ({ call_id: "c1", status: "completed", output: { success: true } }) });
    const { proofs, sink } = sinkRecorder();
    const r = await new Gmail({ fetch, paymentKey: "o:1:k", ownerAccount: "astro.testnet", allowlist, sink }).send({ to: allowlist[0], subject: "PO 1042", body: "USD 19.00" });
    expect(r.ok).toBe(true);
    expect(sent[0].headers["X-Payment-Key"]).toBe("o:1:k");
    expect(JSON.parse(sent[0].body)).toMatchObject({ input: { operation: "send", to: allowlist[0] }, secrets_ref: { profile: "gmail" } });
    expect(proofs[0].kind).toBe("connector_receipt");
  });
  it("records the connector's own policy refusal", async () => {
    const { fetch } = mockFetch({ "POST /call/": () => ({ call_id: "c2", status: "completed", output: { success: false, error: "policy_denied: recipient" } }) });
    const { proofs, sink } = sinkRecorder();
    const r = await new Gmail({ fetch, paymentKey: "o:1:k", ownerAccount: "a", allowlist, sink }).send({ to: allowlist[0], subject: "PO", body: "b" });
    expect(r.ok).toBe(false);
    expect(proofs[0].kind).toBe("refusal");
  });
});

describe("private inference", () => {
  const model = "Qwen/Qwen3-VL-30B-A3B-Instruct";
  const teeKey = secp256k1.utils.randomPrivateKey();
  const otherKey = secp256k1.utils.randomPrivateKey();
  const TEE = ethAddressOf(teeKey);
  function routes(o: { sig?: (reqSha: string, resSha: string) => unknown; attAddress?: string | null; withAtt?: boolean; notFoundTimes?: number } = {}) {
    let reqBody = "";
    let misses = o.notFoundTimes ?? 0;
    const resBody = { id: "chatcmpl-1", choices: [{ message: { content: JSON.stringify({ po: "1042", quantity: 1800 }) } }] };
    const att = o.attAddress === null ? {} : { signing_address: o.attAddress ?? TEE };
    return mockFetch({
      "GET /v1/models": () => ({ data: [{ id: "openai/gpt", owned_by: "openai" }, { id: model, owned_by: "nearai" }] }),
      "GET /v1/attestation/report": () => ({ model_attestations: o.withAtt === false ? [] : [att] }),
      "POST /v1/chat/completions": (req) => { reqBody = req.body; return resBody; },
      "GET /v1/signature/chatcmpl-1": async () => {
        if (misses-- > 0) return [404, { detail: "Chat id not found or expired" }];
        const a = await sha256Hex(reqBody), b = await sha256Hex(JSON.stringify(resBody));
        return o.sig ? o.sig(a, b) : signed(`${model}:${a}:${b}`, teeKey);
      },
    });
  }
  const read = (fetch: Fetch, sink: ProofSink = () => {}) =>
    new Inference({ fetch, apiKey: "k", sink, sleep: async () => {} }).read<{ quantity: number }>({ kind: "packing_slip", text: "Qty 1800", fields: ["po", "quantity"], label: "Packing slip read privately" });

  it("only picks confidential TEE models", () => {
    expect(isConfidential({ id: "x", owned_by: "openai" })).toBe(false);
    expect(isConfidential({ id: model, owned_by: "nearai" })).toBe(true);
  });
  it("refuses to send a document when the model has no attestation", async () => {
    const { fetch, sent } = routes({ withAtt: false });
    await expect(read(fetch)).rejects.toThrow("no model attestation");
    expect(sent.some((s) => s.url.includes("/chat/completions"))).toBe(false);
  });
  it("binds the reply when the signer recovered from the signature is the attested TEE key", async () => {
    const { fetch, sent } = routes();
    const { proofs, sink } = sinkRecorder();
    const r = await read(fetch, sink);
    expect(r.fields.quantity).toBe(1800);
    expect(r.record.bound).toBe(true);
    expect(r.record.recoveredAddress).toBe(TEE.toLowerCase());
    expect(proofs[0].kind).toBe("attestation");
    const lookup = sent.find((s) => s.url.includes("/signature/"))!;
    expect(new URL(lookup.url).searchParams.get("model")).toBe(model);
    expect(new URL(lookup.url).searchParams.get("signing_algo")).toBe("ecdsa");
  });
  it("marks the read unbound when the signed text does not match", async () => {
    const { fetch } = routes({ sig: () => signed("other", teeKey) });
    expect((await read(fetch)).record.bound).toBe(false);
  });
  it("marks the read unbound when another key signed, even if the reported address is the TEE's", async () => {
    const { fetch } = routes({ sig: (a, b) => ({ ...signed(`${model}:${a}:${b}`, otherKey), signing_address: TEE }) });
    const r = await read(fetch);
    expect(r.record.bound).toBe(false);
    expect(r.record.recoveredAddress).toBe(ethAddressOf(otherKey).toLowerCase());
  });
  it("marks the read unbound when the attestation names no signing address", async () => {
    const { fetch } = routes({ attAddress: null });
    expect((await read(fetch)).record.bound).toBe(false);
  });
  it("retries the signature lookup while the serving node is not found", async () => {
    const { fetch, sent } = routes({ notFoundTimes: 2 });
    expect((await read(fetch)).record.bound).toBe(true);
    expect(sent.filter((s) => s.url.includes("/signature/"))).toHaveLength(3);
  });
});

describe("no leak", () => {
  it("sends no plain-text BOM specs or supplier list anywhere except private inference", async () => {
    const { fetch, sent } = mockFetch({
      "POST /wallet/v1/call": () => ({ request_id: "r", status: "success", tx_hash: "T" }),
      "POST /call/": () => ({ call_id: "c", status: "completed", output: { success: true } }),
      "GET /v1/models": () => ({ data: [{ id: "m", owned_by: "nearai" }] }),
      "GET /v1/attestation/report": () => ({ model_attestations: [{ signing_address: "0x1" }] }),
      "POST /v1/chat/completions": () => ({ id: "c1", choices: [{ message: { content: "{}" } }] }),
      "GET /v1/signature/": () => ({}),
    });
    const sink = () => {};
    const bomText = bom10MA.map((l) => `${l.part}: ${Object.values(l.specs).join(", ")}`).join("\n");
    await new Inference({ fetch, apiKey: "k", sink }).read({ kind: "offer", text: bomText, fields: ["fitment"], label: "Fitment read" });
    await new Custody({ fetch, apiKey: KEY, sink }).payUsdc({ to: "haoyun-precision.testnet", cents: 100, memo: "PO 1042 escrow", label: "lock" });
    await new Gmail({ fetch, paymentKey: "o:1:k", ownerAccount: "a", allowlist: ["sales@haoyun-precision.example"], sink }).send({ to: "sales@haoyun-precision.example", subject: "PO 1042", body: "We can accept USD 19.00 per unit for 2,000 units." });

    const outside = sent.filter((s) => !s.url.startsWith("https://cloud-api.near.ai/"));
    expect(outside.length).toBeGreaterThan(0);
    const secrets = [...new Set(bom10MA.flatMap((l) => [l.part, ...Object.values(l.specs)]))].filter((x) => x.length > 3);
    const others = suppliers.filter((s) => s.id !== "haoyun").map((s) => s.name);
    for (const s of outside) {
      for (const word of [...secrets, ...others]) expect(s.body, `${s.url} leaks ${word}`).not.toContain(word);
    }
    expect(sent.some((s) => s.url.startsWith("https://cloud-api.near.ai/") && s.body.includes("NEMA 17"))).toBe(true);
  });
});
