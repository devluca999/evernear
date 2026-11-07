// One faucet drip into Astro's Tidepool treasury (testnet only): 100 test NEAR USDC, at most one claim
// per address every 24 hours. The commit swaps it into Base Sepolia USDC when it needs to. Reads AGENT_*
// from .env.local, prints the treasury's balance before and after, never prints a key.
// Run with main(false) to only read the balance, main(true) to claim the drip (through Vitest, which
// loads the ESM-only SDK). Faucet tokens are testnet tokens with no value.
import { existsSync, readFileSync } from "node:fs";
import { AgentApiClient, agentApiBase, BASE_USDC, NEAR_USDC } from "../convex/near/agentapi";

function env(path = ".env.local"): Record<string, string> {
  if (!existsSync(path)) throw new Error("run from the repo folder: no .env.local here");
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
  }
  return out;
}

/** 6 decimal test USDC units as dollars. */
const usd = (units: bigint) => (Number(units / 10_000n) / 100).toFixed(2);

export async function main(drip = false): Promise<void> {
  const e = env();
  for (const k of ["AGENT_API_KEY", "AGENT_TREASURY_ID"]) if (!e[k]) throw new Error(`${k} is not set in .env.local`);
  const baseUrl = agentApiBase(e.AGENT_API_BASE_URL); // refuses mainnet without Luca's yes
  const client = new AgentApiClient({ fetch: (u, i) => fetch(u, i), apiKey: e.AGENT_API_KEY, baseUrl, sink: () => {} });
  const t = e.AGENT_TREASURY_ID;
  const show = async (when: string) => {
    const b = await client.balance(t, BASE_USDC), n = await client.balance(t, NEAR_USDC);
    console.log(`${when}: Base USDC $${usd(b)}, NEAR USDC $${usd(n)}, total $${usd(b + n)}`);
  };
  await show("treasury before");
  if (!drip) { console.log("read only: pass true to claim one faucet drip"); return; }
  const r = await client.act(t, null, "deposit", { origin_asset: NEAR_USDC, testnet_faucet: true },
    { kind: "faucet", label: "Treasury funded from the testnet faucet", codePath: "scripts/faucet-treasury.mts" });
  console.log(r.ok ? "faucet drip: done" : `faucet drip refused: ${r.code} (one claim per address every 24 hours)`);
  await show("treasury after");
}
