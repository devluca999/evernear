// @vitest-environment edge-runtime
// One real NEAR testnet RPC call through approvals:checkApproverKeys, against Evernear's public testnet
// account (the release gate's signer): one of its full-access keys, read from the chain, and a made-up
// key on the same account. TESTNET_KEYCHECK=1. No secret is used.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { base58 } from "@scure/base";
import schema from "@/convex/schema";
import { api } from "@/convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe.skipIf(process.env.TESTNET_KEYCHECK !== "1")("approver key check on NEAR testnet", () => {
  it("a real full-access key is true; a key the account does not have is false", async () => {
    const acct = "evernear-luca.testnet";
    const list = await fetch("https://rpc.testnet.near.org", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_access_key_list", finality: "final", account_id: acct } }) }).then((r) => r.json());
    const full = list.result.keys.find((k: { access_key: { permission: unknown } }) => k.access_key.permission === "FullAccess").public_key as string;
    const pk = hex(base58.decode(full.replace(/^ed25519:/, "")));
    process.env.APPROVER_KEYS = JSON.stringify([{ name: "evernear-luca", publicKey: pk, accountId: acct }, { name: "bogus", publicKey: "ab".repeat(32), accountId: acct }]);
    const r = await convexTest(schema, modules).action(api.approvals.checkApproverKeys, {});
    console.log("KEYCHECK", JSON.stringify(r.map((x) => ({ name: x.name, fullAccess: x.fullAccess, detail: x.detail }))));
    expect(r.map((x) => x.fullAccess)).toEqual([true, false]);
    expect(r[1].detail).toBe("access_key_not_found");
  }, 60_000);
});
