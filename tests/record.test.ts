import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mockFetch } from "./near/mockFetch";
import { createRecorder, indexSource, keyFor, PROOF_KEYS, scrub } from "@/scripts/rehearse/recorder";
import { assertTestnet, guardFetch, missingEnv, REQUIRED_ENV, rehearse, RehearsalRefused, type Env } from "@/scripts/rehearse/steps";
import { makeProofFor, proofFor, proofKeys, recordedKeys } from "@/scenario/proofs";
import { Custody } from "@/convex/near/custody";
import { Gmail } from "@/convex/near/gmail";
import { EscrowAdapter } from "@/convex/near/escrow";
import type { ProofInput } from "@/convex/near/http";
import { createEscrow } from "@/engine/escrow";
import synthetic from "@/fixtures/synthetic/proofs.json";

const KEY = "wk_" + "a".repeat(64);
const PAY = "astro.testnet:0:" + "s3cretPaymentKeyValue";
const NEARAI = "sk-nearai-" + "b".repeat(24);
const BOT = "123456:" + "TelegramBotTokenValueXYZ";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "evernear-rec-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const proof = (p: Partial<ProofInput>): ProofInput => ({
  kind: "wallet", label: "x", call: "c", codePath: "convex/near/custody.ts#register", network: "testnet", hash: "h", response: {}, replay: false, synthetic: false, ...p,
});

describe("record mode: keys", () => {
  it("uses exactly the synthetic fixture keys", () => {
    expect([...PROOF_KEYS].sort()).toEqual(Object.keys(synthetic).filter((k) => !k.startsWith("_")).sort());
  });
  it("maps each adapter call to its scene proof key", () => {
    const cases: [Partial<ProofInput>, string | null][] = [
      [{ codePath: "convex/near/custody.ts#register" }, "wallet_created"],
      [{ codePath: "convex/near/custody.ts#policy" }, "policy_set"],
      [{ codePath: "convex/near/custody.ts#payUsdc", kind: "payment_receipt" }, "payment_receipt"],
      [{ codePath: "convex/near/custody.ts#payUsdc", kind: "escrow" }, "escrow_wallet"],
      [{ codePath: "convex/near/custody.ts#payUsdc", kind: "release" }, null],
      [{ codePath: "convex/near/inference.ts#read" }, "inference_attestation"],
      [{ codePath: "convex/near/approval.ts#submit", label: "Approval 1 of 2: Luca" }, "approval_luca"],
      [{ codePath: "convex/near/approval.ts#submit", label: "Approval 2 of 2: Jordy" }, "approval_jordy"],
      [{ codePath: "convex/near/gmail.ts#send", kind: "connector_receipt" }, "connector_receipt"],
      [{ codePath: "convex/near/gmail.ts#send", kind: "refusal" }, "refused_email"],
      [{ codePath: "convex/near/escrow.ts#release", kind: "refusal" }, "refused_release"],
      [{ codePath: "convex/near/payout.ts#claim" }, "intents_payout"],
    ];
    for (const [p, k] of cases) expect(keyFor(proof(p))).toBe(k);
  });
  it("writes the right files from real adapter calls, and a static index", async () => {
    const { fetch } = mockFetch({
      "POST /register": () => ({ api_key: KEY, wallet_id: "w1", near_account_id: "ab".repeat(32) }),
      "POST /wallet/v1/call": () => ({ request_id: "r1", status: "success", tx_hash: "TX1" }),
    });
    const rec = createRecorder({ dir, enabled: true, secrets: [KEY] });
    await new Custody({ fetch, sink: rec.sink }).register();
    await new Custody({ fetch, apiKey: KEY, sink: rec.sink }).payUsdc({ to: "ultra.testnet", cents: 100, memo: "m", label: "Routine reorder paid" });
    await new Gmail({ fetch, allowlist: ["a@b.example"], sink: rec.sink }).send({ to: "x@y.example", subject: "PO", body: "b" });
    const e = createEscrow({ supplier: "s.testnet", owner: "o.testnet", lockedCents: 100, deadlineMs: 10 });
    await new EscrowAdapter({ fetch, sink: rec.sink }).release({ escrow: e, escrowApiKey: KEY, to: "mallory.testnet", cents: 1, po: "1", nowMs: 1 });
    expect(rec.written).toEqual(["wallet_created", "payment_receipt", "refused_email", "refused_release"]);
    expect(readdirSync(dir).sort()).toEqual(["index.ts", "payment_receipt.json", "refused_email.json", "refused_release.json", "wallet_created.json"]);
    const pay = JSON.parse(readFileSync(join(dir, "payment_receipt.json"), "utf8"));
    expect(pay).toMatchObject({ hash: "TX1", explorerUrl: "https://testnet.nearblocks.io/txns/TX1", replay: true, synthetic: false });
    const idx = readFileSync(join(dir, "index.ts"), "utf8");
    expect(idx).toContain('import payment_receipt from "./payment_receipt.json";');
    expect(idx).toContain("export const recorded: Record<string, unknown> = { payment_receipt, refused_email, refused_release, wallet_created };");
  });
  it("writes nothing unless RECORD is on", async () => {
    const rec = createRecorder({ dir, enabled: false, secrets: [] });
    await rec.sink(proof({}));
    expect(readdirSync(dir)).toEqual([]);
  });
  it("refuses to record a synthetic or a mainnet proof", () => {
    const rec = createRecorder({ dir, enabled: true, secrets: [] });
    expect(() => rec.sink(proof({ synthetic: true }))).toThrow("synthetic");
    expect(() => rec.sink(proof({ network: "mainnet", codePath: "convex/near/payout.ts#claim" }))).toThrow("mainnet");
  });
  it("matches the committed empty index", () => {
    expect(readFileSync("fixtures/recorded/index.ts", "utf8")).toBe(indexSource(recordedKeys.length ? recordedKeys : []));
  });
});

describe("record mode: secrets never reach disk", () => {
  it("drops api_key, payment_key, check_key and bot_token, by field and by value", async () => {
    const response = {
      api_key: KEY, payment_key: PAY, check_key: "ck_" + "c".repeat(30), bot_token: BOT, apiKey: KEY,
      nested: { echo: `Bearer ${KEY}`, note: `paid with ${PAY}`, nearai: NEARAI, token_hint: BOT },
      wallet_id: "w1", near_account_id: "ab".repeat(32),
    };
    const rec = createRecorder({ dir, enabled: true, secrets: [KEY, PAY, NEARAI, BOT] });
    await rec.sink(proof({ response, label: `registered ${KEY}` }));
    const text = readFileSync(join(dir, "wallet_created.json"), "utf8");
    for (const s of [KEY, PAY, NEARAI, BOT, "s3cretPaymentKeyValue", "c".repeat(30), "a".repeat(64)]) expect(text).not.toContain(s);
    const j = JSON.parse(text);
    expect(j.response).toMatchObject({ api_key: "redacted", payment_key: "redacted", check_key: "redacted", bot_token: "redacted", apiKey: "redacted", wallet_id: "w1" });
  });
  it("scrubs key-shaped strings even when the value was not passed in", () => {
    expect(scrub({ x: `key ${KEY}` }, [])).toEqual({ x: "key redacted" });
    expect(scrub({ x: "deadbeef.testnet:3:abcdefghijklmnopqrstuv" }, [])).toEqual({ x: "redacted" });
  });
});

describe("proofFor prefers a real recording", () => {
  const rec = {
    payment_receipt: {
      kind: "payment_receipt", label: "Routine reorder paid", call: "POST /wallet/v1/call ft_transfer", codePath: "convex/near/custody.ts#payUsdc",
      network: "testnet", hash: "REALTX", explorerUrl: "https://testnet.nearblocks.io/txns/REALTX", response: { status: "success" }, replay: true, synthetic: false,
    },
  };
  const pf = makeProofFor(rec);
  it("uses the recording, as replay, with its real hash and explorer link", () => {
    expect(pf("payment_receipt", 2)).toMatchObject({ id: "payment_receipt", scene: 2, hash: "REALTX", explorerUrl: "https://testnet.nearblocks.io/txns/REALTX", replay: true, synthetic: false });
  });
  it("keeps the synthetic label only on entries with no recording", () => {
    for (const k of proofKeys) expect(pf(k, 0).synthetic).toBe(k !== "payment_receipt");
    expect(pf("wallet_created", 0).hash).toMatch(/^synthetic-/);
  });
  it("works with zero recordings: every proof is synthetic", () => {
    for (const k of proofKeys) expect(proofFor(k, 0).synthetic).toBe(!recordedKeys.includes(k));
  });
});

const fullEnv: Env = {
  OUTLAYER_API_KEY: KEY, OUTLAYER_NEAR_ACCOUNT: "astro.testnet", OUTLAYER_PAYMENT_KEY: PAY, OUTLAYER_OWNER_ACCOUNT: "astro.testnet",
  NEARAI_API_KEY: NEARAI, REHEARSE_ULTRA_ACCOUNT: "ultra.testnet", REHEARSE_HAOYUN_ACCOUNT: "haoyun.testnet", REHEARSE_HAOYUN_EMAIL: "sales@demo.example",
  TELEGRAM_BOT_TOKEN: BOT, REHEARSE_POLL_MS: "0",
};

describe("rehearsal", () => {
  it("refuses to run without its env, naming each missing variable, before any call", async () => {
    const { fetch, sent } = mockFetch({});
    const env = { ...fullEnv, NEARAI_API_KEY: "", REHEARSE_HAOYUN_EMAIL: undefined };
    expect(missingEnv(env)).toEqual(["NEARAI_API_KEY", "REHEARSE_HAOYUN_EMAIL"]);
    await expect(rehearse({ env, fetch, ask: async () => null, log: () => {}, dir })).rejects.toThrow("missing in .env.local: NEARAI_API_KEY, REHEARSE_HAOYUN_EMAIL");
    expect(missingEnv({})).toEqual([...REQUIRED_ENV]);
    expect(sent).toHaveLength(0);
  });
  it("refuses any mainnet host", async () => {
    expect(() => assertTestnet({ OUTLAYER_API_URL: "https://api.outlayer.ai" })).toThrow(RehearsalRefused);
    expect(() => assertTestnet({ FINALE_ENABLED: "1" })).toThrow(RehearsalRefused);
    expect(() => assertTestnet({ OUTLAYER_API_URL: "https://testnet-api.outlayer.ai" })).not.toThrow();
    const { fetch, sent } = mockFetch({});
    await expect(guardFetch(fetch)("https://api.outlayer.ai/register")).rejects.toThrow(RehearsalRefused);
    expect(sent).toHaveLength(0);
    await expect(rehearse({ env: { ...fullEnv, OUTLAYER_API_URL: "https://api.outlayer.ai" }, fetch, ask: async () => null, log: () => {}, dir })).rejects.toThrow("mainnet");
    expect(sent).toHaveLength(0);
  });
  it("runs the scene steps in order, records what ran, and skips the human and mainnet steps cleanly", async () => {
    const { fetch, sent } = mockFetch({
      "POST /register": () => ({ api_key: "wk_" + "f".repeat(64), wallet_id: "w9", near_account_id: "cd".repeat(32) }),
      "POST /wallet/v1/call": () => ({ request_id: "r1", status: "success", tx_hash: "TXR" }),
      "GET /v1/models": () => ({ data: [{ id: "m", owned_by: "nearai" }] }),
      "GET /v1/attestation/report": () => ({ model_attestations: [{ signing_address: "0x1" }] }),
      "POST /v1/chat/completions": () => ({ id: "c1", choices: [{ message: { content: "{\"unit price\":\"18.54\"}" } }] }),
      "GET /v1/signature/": () => ({}),
      "PUT /wallet/v1/api-key": () => ({ wallet_id: "w2", near_account_id: "ee".repeat(32) }),
      "POST /wallet/v1/storage-deposit": () => ({ already_registered: false }),
    });
    const logs: string[] = [];
    const { results, written } = await rehearse({ env: { ...fullEnv, RECORD: "1" }, fetch, ask: async () => null, log: (s) => logs.push(s), dir });
    expect(written).toEqual(["wallet_created", "payment_receipt", "inference_attestation", "refused_email", "refused_release"]);
    const skippedTitles = results.filter((r) => r.result.status === "skipped").map((r) => r.title);
    expect(skippedTitles).toEqual(expect.arrayContaining([expect.stringContaining("owner policy"), expect.stringContaining("Gmail"), expect.stringContaining("mainnet")]));
    expect(logs.join("\n")).toContain("needs FINALE_ENABLED=1 and Luca's explicit yes");
    expect(sent.every((s) => s.url.startsWith("https://testnet-api.outlayer.ai/") || s.url.startsWith("https://cloud-api.near.ai/"))).toBe(true);
    const all = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
    for (const s of [KEY, PAY, NEARAI, BOT, "f".repeat(64)]) expect(all).not.toContain(s);
    expect(logs.join("\n")).not.toContain(KEY);
  });
  it("submits both approvals when the approvers paste their signed votes", async () => {
    let votes = 0;
    const { fetch } = mockFetch({
      "POST /register": () => ({ api_key: "wk_" + "f".repeat(64), wallet_id: "w9", near_account_id: "cd".repeat(32) }),
      "GET /wallet/v1/policy": () => ({ rules: { addresses: { mode: "whitelist" } } }),
      "PUT /wallet/v1/api-key": () => ({ wallet_id: "w2", near_account_id: "ee".repeat(32) }),
      "POST /wallet/v1/storage-deposit": () => ({}),
      "POST /wallet/v1/call": () => ({ request_id: "r1", status: "pending_approval" }),
      "GET /wallet/v1/pending_approvals": () => ({ approvals: [{ approval_id: "ap1", type: "call", op: {}, request_hash: "H", required: 2, approved: 0 }] }),
      "POST /wallet/v1/approve/ap1": () => ({ approval_id: "ap1", status: votes++ ? "approved" : "pending", approved: votes, required: 2 }),
      "GET /wallet/v1/requests/r1": () => ({ status: "success", tx_hash: "LOCKTX" }),
    });
    const vote = JSON.stringify({ signature: "sig", public_key: "ed25519:PK", account_id: "luca.testnet", nonce: "n" });
    const ask = async (q: string) => (q.startsWith("Paste") ? vote : "");
    const { written } = await rehearse({ env: { ...fullEnv, RECORD: "1" }, fetch, ask, log: () => {}, dir });
    expect(written).toEqual(expect.arrayContaining(["policy_set", "approval_luca", "approval_jordy", "escrow_wallet"]));
    expect(JSON.parse(readFileSync(join(dir, "escrow_wallet.json"), "utf8"))).toMatchObject({ hash: "LOCKTX", synthetic: false, replay: true });
  });
});
