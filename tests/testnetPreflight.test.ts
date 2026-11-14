// Read-only check of the real Tidepool testnet key: order wallets left and treasury test USDC.
// Runs only with TESTNET_PREFLIGHT=1. Prints no secret.
import { describe, it } from "vitest";
import { loadTestnetEnv } from "./testnetEnv";
import { EscrowAdapter } from "@/convex/near/escrow";
import { agentApiBase, ownerFromPkcs8, BASE_USDC, NEAR_USDC, AgentApiClient } from "@/convex/near/agentapi";

describe.skipIf(process.env.TESTNET_PREFLIGHT !== "1")("testnet preflight (read only)", () => {
  it("reports wallets left and treasury balance", async () => {
    loadTestnetEnv();
    const e = process.env;
    const owner = ownerFromPkcs8({ accountId: e.AGENT_OWNER_ACCOUNT_ID!, publicKey: e.AGENT_OWNER_PUBLIC_KEY!, pkcs8Base64: e.AGENT_OWNER_PRIVATE_KEY_PKCS8! });
    const opts = { fetch: (u: string, i?: RequestInit) => fetch(u, i), apiKey: e.AGENT_API_KEY, baseUrl: agentApiBase(e.AGENT_API_BASE_URL), owner, sink: () => {} };
    const a = new EscrowAdapter({ ...opts, treasuryId: e.AGENT_TREASURY_ID });
    const c = new AgentApiClient(opts);
    const p = await a.preflight({ cents: 6_300_000 });
    const base = await c.balance(e.AGENT_TREASURY_ID!, BASE_USDC), near = await c.balance(e.AGENT_TREASURY_ID!, NEAR_USDC);
    console.log("PREFLIGHT", JSON.stringify({ host: new URL(agentApiBase(e.AGENT_API_BASE_URL)).host, walletsLeft: p.walletsLeft, walletLimit: p.walletLimit, treasuryBaseUnits: String(base), treasuryNearUnits: String(near), needUnits: p.needUnits }));
  }, 60_000);
});
