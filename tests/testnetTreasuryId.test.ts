// Prints the public NEAR account id of Astro's Tidepool treasury (for the site faucet). TESTNET_TREASURY=1.
import { describe, it } from "vitest";
import { loadTestnetEnv } from "./testnetEnv";
import { AgentApiClient, agentApiBase } from "@/convex/near/agentapi";
describe.skipIf(process.env.TESTNET_TREASURY !== "1")("treasury account id", () => {
  it("prints it", async () => {
    loadTestnetEnv(["AGENT_API_BASE_URL", "AGENT_API_KEY", "AGENT_TREASURY_ID"]);
    const c = new AgentApiClient({ fetch: (u, i) => fetch(u, i), apiKey: process.env.AGENT_API_KEY, baseUrl: agentApiBase(process.env.AGENT_API_BASE_URL), sink: () => {} });
    console.log("TREASURY", (await c.wallet(process.env.AGENT_TREASURY_ID!)).near_account_id);
  }, 60_000);
});
