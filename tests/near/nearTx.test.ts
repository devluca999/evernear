import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { base58 } from "@scure/base";
import { callFunction, encodeTx, parseNearKey, signTx } from "@/convex/near/nearTx";
import { answerFromRun, GateConfigError, NearKeyReleaseGate, releaseGateFromEnv } from "@/convex/near/releaseGate";

const seed = new Uint8Array(32).fill(7);
const pub = ed25519.getPublicKey(seed);
const key = `ed25519:${base58.encode(new Uint8Array([...seed, ...pub]))}`;
const blockHash = new Uint8Array(32).fill(9);
const URL_ = "https://test.fastfs.io/evernear-luca.testnet/outlayer.testnet/x.wasm";
const SHA = "04f6d241fc0514dc9a2199c5d9a3f945d33f63e2304900792632485dbc261979";

describe("NEAR transaction signer", () => {
  it("encodes a function call as borsh: signer, ed25519 key, nonce, receiver, block hash, one FunctionCall", () => {
    const b = encodeTx({ signerId: "a.testnet", publicKey: pub, nonce: 5n, receiverId: "outlayer.testnet", blockHash, actions: [{ methodName: "m", args: new Uint8Array([1, 2]), gas: 3n, deposit: 4n }] });
    const dv = new DataView(b.buffer);
    expect(dv.getUint32(0, true)).toBe(9); // "a.testnet"
    expect(b[13]).toBe(0); // key type ed25519
    expect([...b.slice(14, 46)]).toEqual([...pub]);
    expect(dv.getBigUint64(46, true)).toBe(5n);
    expect(dv.getUint32(54, true)).toBe(16); // "outlayer.testnet"
    const at = 58 + 16 + 32;
    expect(dv.getUint32(at, true)).toBe(1); // one action
    expect(b[at + 4]).toBe(2); // FunctionCall
    expect(b.length).toBe(at + 4 + 1 + (4 + 1) + (4 + 2) + 8 + 16);
  });
  it("reads a NEAR ed25519 key and refuses a mismatched pair", () => {
    expect([...parseNearKey(key).publicKey]).toEqual([...pub]);
    const bad = `ed25519:${base58.encode(new Uint8Array([...seed, ...new Uint8Array(32)]))}`;
    expect(() => parseNearKey(bad)).toThrow("key pair does not match");
  });
  it("signs sha256 of the encoded transaction; the signature verifies against the account key", () => {
    const t = { signerId: "a.testnet", publicKey: pub, nonce: 1n, receiverId: "outlayer.testnet", blockHash, actions: [] };
    const { signedBase64, hash } = signTx(t, seed);
    const signed = Buffer.from(signedBase64, "base64");
    const body = encodeTx(t);
    expect(base58.decode(hash)).toEqual(sha256(body));
    expect(signed[body.length]).toBe(0);
    expect(ed25519.verify(signed.subarray(body.length + 1), sha256(body), pub)).toBe(true);
  });
  it("sends with the next nonce, waits for finality, and returns the decoded value and logs", async () => {
    const calls: { method: string; params: Record<string, unknown> }[] = [];
    const fetch = async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
      calls.push(b);
      const result = b.method === "query" ? { nonce: 41, block_hash: base58.encode(blockHash) }
        : b.method === "send_tx" ? { final_execution_status: "INCLUDED" }
        : { status: { SuccessValue: Buffer.from('{"mode":"enroll"}').toString("base64") }, transaction: { hash: "H" }, receipts_outcome: [{ outcome: { status: {}, logs: ["l1"] } }] };
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: "x", result }));
    };
    const r = await callFunction({ fetch, account: "a.testnet", key, receiverId: "outlayer.testnet", call: { methodName: "m", args: new Uint8Array(), gas: 1n, deposit: 0n } });
    expect(r).toEqual({ hash: "H", value: '{"mode":"enroll"}', logs: ["l1"] });
    expect(calls.map((c) => c.method)).toEqual(["query", "send_tx", "tx"]);
    expect(calls[1].params.wait_until).toBe("INCLUDED");
    expect(calls[2].params.wait_until).toBe("FINAL");
    const signed = Buffer.from(String(calls[1].params.signed_tx_base64), "base64");
    expect(new DataView(signed.buffer, signed.byteOffset).getBigUint64(46, true)).toBe(42n); // access key nonce 41, plus one
  });
  it("keeps polling through RPC timeouts until the run is final", async () => {
    let polls = 0;
    const fetch = async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { method: string };
      if (b.method === "tx" && ++polls < 3) return new Response(JSON.stringify({ error: { cause: { name: "TIMEOUT_ERROR" } } }));
      const result = b.method === "query" ? { nonce: 1, block_hash: base58.encode(blockHash) } : b.method === "send_tx" ? {}
        : { status: { SuccessValue: Buffer.from("1").toString("base64") }, transaction: { hash: "H" }, receipts_outcome: [] };
      return new Response(JSON.stringify({ result }));
    };
    const r = await callFunction({ fetch, account: "a.testnet", key, receiverId: "x", call: { methodName: "m", args: new Uint8Array(), gas: 1n, deposit: 0n }, pollMs: 0 });
    expect(r.value).toBe("1");
    expect(polls).toBe(3);
  });
  it("refuses any RPC that is not testnet", async () => {
    await expect(callFunction({ fetch: async () => new Response("{}"), rpcUrl: "https://rpc.mainnet.near.org", account: "a.testnet", key, receiverId: "x", call: { methodName: "m", args: new Uint8Array(), gas: 1n, deposit: 0n } })).rejects.toThrow("testnet RPC only");
  });
});

describe("the gate run signed with a NEAR key", () => {
  it("reads the gate's answer from the final value, and a failed run from its logs", () => {
    expect(answerFromRun('{"ok":true,"stage":"advance"}', [])).toMatchObject({ ok: true });
    expect(() => answerFromRun("null", ['Execution failed: "wasm_url could not be fetched". Resources: {}'])).toThrow("wasm_url could not be fetched");
  });
  it("is chosen when RELEASE_GATE_NEAR_ACCOUNT and RELEASE_GATE_NEAR_KEY are set, testnet accounts only, both or neither", () => {
    const base = { RELEASE_GATE_WASM_URL: URL_, RELEASE_GATE_WASM_SHA256: SHA };
    expect(releaseGateFromEnv({ ...base, RELEASE_GATE_NEAR_ACCOUNT: "evernear-luca.testnet", RELEASE_GATE_NEAR_KEY: key }, fetch)).toBeInstanceOf(NearKeyReleaseGate);
    expect(() => releaseGateFromEnv({ ...base, RELEASE_GATE_NEAR_ACCOUNT: "evernear-luca.testnet" }, fetch)).toThrow(GateConfigError);
    expect(() => releaseGateFromEnv({ ...base, RELEASE_GATE_NEAR_ACCOUNT: "evernear.near", RELEASE_GATE_NEAR_KEY: key }, fetch)).toThrow("testnet only");
  });
  it("sends request_execution to outlayer.testnet with the CLI's arguments and parses the enroll answer", async () => {
    let sent: Uint8Array | null = null;
    const fetch = async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
      if (b.method === "send_tx") sent = Buffer.from(String(b.params.signed_tx_base64), "base64");
      const out = { agent_id: "agent_x", grant_hash: "a".repeat(64), mode: "enroll", public_key: "b".repeat(64) };
      const result = b.method === "query" ? { nonce: 1, block_hash: base58.encode(blockHash) }
        : b.method === "send_tx" ? {}
        : { status: { SuccessValue: Buffer.from(JSON.stringify(out)).toString("base64") }, transaction: { hash: "T" }, receipts_outcome: [] };
      return new Response(JSON.stringify({ result }));
    };
    const gate = new NearKeyReleaseGate({ fetch, account: "evernear-luca.testnet", key, wasmUrl: URL_, wasmSha256: SHA });
    const r = await gate.enroll("agent_x");
    expect(r.output).toMatchObject({ mode: "enroll", agent_id: "agent_x" });
    expect(r.run.txHash).toBe("T");
    const text = new TextDecoder().decode(sent!);
    expect(text).toContain("outlayer.testnet");
    expect(text).toContain("request_execution");
    expect(text).toContain('"input_data":"{\\"agent_id\\":\\"agent_x\\",\\"mode\\":\\"enroll\\"}"');
    expect(text).toContain(`"hash":"${SHA}"`);
    // The run names the signer's secrets row, or the gate never sees the Tidepool API key.
    expect(text).toContain('"secrets_ref":{"account_id":"evernear-luca.testnet","profile":"default"}');
  });
});

import { GateRunTransient, retryTransient } from "@/convex/near/releaseGate";

describe("release gate: a run the OutLayer worker did not complete", () => {
  it("is recognised from the logs (seen on testnet Nov 14: 'Execution promise failed', deposit refunded)", () => {
    expect(() => answerFromRun("null", ["[[yNEAR charged: \"1\"]]", "Execution promise failed: Failed. Refunded 1000100000000000000000 yoctoNEAR"])).toThrow(GateRunTransient);
  });
  it("is retried, at most 3 times, and only that failure", async () => {
    let n = 0;
    expect(await retryTransient(async () => { if (++n < 3) throw new GateRunTransient(); return "ok"; })).toBe("ok");
    n = 0;
    await expect(retryTransient(async () => { n++; throw new GateRunTransient(); })).rejects.toBeInstanceOf(GateRunTransient);
    expect(n).toBe(3);
    n = 0;
    await expect(retryTransient(async () => { n++; throw new Error("wasm_url could not be fetched"); })).rejects.toThrow("wasm_url");
    expect(n).toBe(1);
  });
});
