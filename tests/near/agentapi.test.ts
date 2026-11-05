import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { AgentApiClient, agentApiBase, grantHash, grantToken, nep413Hash, TIDEPOOL_BASE, BASE_USDC } from "@/convex/near/agentapi";
import { MainnetRefused } from "@/convex/near/http";
import { fakeTidepool, FAKE_BASE } from "./fakeTidepool";
import { sinkRecorder } from "./mockFetch";
import { API_KEY, testOwner } from "./agentFixtures";


describe("agentApiBase", () => {
  it("defaults to Tidepool testnet and strips a trailing /v1", () => {
    expect(agentApiBase()).toBe(TIDEPOOL_BASE);
    expect(agentApiBase("https://www.usetidepool.tech/v1/")).toBe(TIDEPOOL_BASE);
  });
  it("refuses the mainnet Agent API host without Luca's yes, and any unknown host", () => {
    expect(() => agentApiBase("https://api.agentsonintents.com")).toThrow(MainnetRefused);
    expect(agentApiBase("https://api.agentsonintents.com", { mainnetYes: true })).toBe("https://api.agentsonintents.com");
    expect(() => agentApiBase("https://evil.example")).toThrow(/unknown Agent API host/);
  });
});

describe("owner signing (NEP-413)", () => {
  it("signs the same bytes Tidepool's reference script signs, verifiable with node:crypto", () => {
    const { owner, node } = testOwner();
    const payload = { message: '{"type":"agent_create"}', nonce: Buffer.alloc(32, 7).toString("base64"), recipient: "verifier.tidepool-sandbox.testnet" };
    const sig = owner.sign(payload);
    // e2e.js: sha256(u32(2**31+413) + bstr(message) + nonce + bstr(recipient) + [0]), signed with ed25519.
    const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
    const bstr = (s: string) => Buffer.concat([u32(Buffer.byteLength(s)), Buffer.from(s)]);
    const ref = crypto.createHash("sha256").update(Buffer.concat([u32(2 ** 31 + 413), bstr(payload.message), Buffer.from(payload.nonce, "base64"), bstr(payload.recipient), Buffer.from([0])])).digest();
    expect(Buffer.from(nep413Hash(payload)).equals(ref)).toBe(true);
    expect(sig).toBe(crypto.sign(null, ref, node).toString("base64"));
  });
});

describe("grant tokens", () => {
  it("are derived, stable per label, and match Tidepool's ngt_ pattern", () => {
    const a = grantToken(API_KEY, "pool:agent_1");
    expect(a).toMatch(/^ngt_[A-Za-z0-9_-]{43}$/);
    expect(grantToken(API_KEY, "pool:agent_1")).toBe(a);
    expect(grantToken(API_KEY, "pool:agent_2")).not.toBe(a);
    expect(grantHash(a)).toBe(crypto.createHash("sha256").update(a).digest("hex"));
  });
});

describe("AgentApiClient", () => {
  async function setup() {
    const tp = fakeTidepool();
    const { owner } = testOwner();
    const { proofs, sink } = sinkRecorder();
    const client = new AgentApiClient({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner, sink });
    const policy = { frozen: false, actions: ["transfer", "withdraw"], limits: { per_transaction: { [BASE_USDC]: "1000000" } }, destinations: { mode: "only", list: [{ action: "withdraw", chain: "base", address: "0xabc" }] } };
    const created = await client.owned("agent_create", { name: "t", owner: { type: "near", account_id: owner.accountId, public_key: owner.publicKey }, policy }, { kind: "policy", label: "PO account created", codePath: "x#y" });
    const agentId = created.details!.agent_id as string;
    const grant = grantToken(API_KEY, `pool:${agentId}`);
    await client.owned("grant_issue", { agent_id: agentId, label: "t", credential: grantHash(grant), expires_at: new Date(Date.now() + 1e6).toISOString() }, { kind: "policy", label: "Grant issued", codePath: "x#y" });
    tp.credit(agentId, BASE_USDC, 5_000_000n);
    return { tp, client, proofs, agentId, grant };
  }

  it("runs owner intents with a valid signature and records a proof for each", async () => {
    const { proofs, tp } = await setup();
    expect(proofs.map((p) => p.label)).toEqual(["PO account created", "Grant issued"]);
    expect(proofs.every((p) => p.network === "testnet")).toBe(true);
    expect(tp.sent.every((s) => s.headers["x-api-key"] === API_KEY)).toBe(true);
  });

  it("withdraws under the grant, with an idempotency key, and the proof carries the Base tx and its explorer link", async () => {
    const { client, agentId, grant, proofs, tp } = await setup();
    const r = await client.act(agentId, grant, "withdraw", { asset: BASE_USDC, amount: "900000", chain: "base", recipient: "0xabc" }, { kind: "payout", label: "Paid", codePath: "x#y" }, "k1");
    expect(r.ok).toBe(true);
    const sent = tp.sent.find((s) => s.path.endsWith("/withdraw"))!;
    expect(sent.headers["x-grant-token"]).toBe(grant);
    expect(sent.headers["idempotency-key"]).toBe("k1");
    const p = proofs.at(-1)!;
    expect(p.kind).toBe("payout");
    expect(p.hash).toMatch(/^0x/);
    expect(p.explorerUrl).toBe(`https://sepolia.basescan.org/tx/${p.hash}`);
    expect(JSON.stringify(p.response)).not.toContain(grant);
  });

  it("returns a policy refusal and records it as a proof, without throwing", async () => {
    const { client, agentId, grant, proofs } = await setup();
    const r = await client.act(agentId, grant, "withdraw", { asset: BASE_USDC, amount: "900000", chain: "base", recipient: "0xdead" }, { kind: "payout", label: "Paid", codePath: "x#y" });
    expect(r).toEqual({ ok: false, code: "policy_destination_denied", layer: "policy", status: 403 });
    expect(proofs.at(-1)).toMatchObject({ kind: "refusal", hash: "none", response: { code: "policy_destination_denied", layer: "policy" } });
    const over = await client.act(agentId, grant, "withdraw", { asset: BASE_USDC, amount: "1000001", chain: "base", recipient: "0xabc" }, { kind: "payout", label: "Paid", codePath: "x#y" });
    expect(over).toMatchObject({ ok: false, code: "policy_transaction_limit_exceeded" });
  });

  it("refuses without an API key, and owner intents without an owner key", async () => {
    const { sink } = sinkRecorder();
    expect(() => new AgentApiClient({ fetch: fakeTidepool().fetch, baseUrl: FAKE_BASE, sink })).toThrow(/AGENT_API_KEY/);
    const c = new AgentApiClient({ fetch: fakeTidepool().fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, sink });
    await expect(c.owned("agent_freeze", { agent_id: "a" }, { kind: "policy", label: "x", codePath: "x" })).rejects.toThrow(/owner key/);
  });

  it("a bad owner signature is refused by the API", async () => {
    const tp = fakeTidepool();
    const { owner } = testOwner();
    const { sink } = sinkRecorder();
    const forged = { ...owner, sign: () => Buffer.alloc(64).toString("base64") };
    const c = new AgentApiClient({ fetch: tp.fetch, apiKey: API_KEY, baseUrl: FAKE_BASE, owner: forged, sink });
    await expect(c.owned("agent_create", { name: "x", owner: {}, policy: {} }, { kind: "policy", label: "x", codePath: "x" })).rejects.toThrow();
  });
});
