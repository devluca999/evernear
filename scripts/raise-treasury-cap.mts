#!/usr/bin/env -S npx tsx
// Run with main(false) for a dry run, main(true) to submit (through Vitest, which loads the ESM-only SDK).
// One-off, testnet only: sets Astro's Tidepool treasury policy to the code's treasuryPolicy()
// (transfers and swaps, at most 100 test USDC per transaction), so the $63 and $66 commits (at
// 1:1,000) are not refused. Reads AGENT_* from .env.local, prints the limit before and after,
// never prints a key. Without --yes it only shows what it would change.
import { existsSync, readFileSync } from "node:fs";
import { AgentApiClient, agentApiBase, ownerFromPkcs8 } from "../convex/near/agentapi";
import { treasuryPolicy } from "../convex/near/escrow";

function env(path = ".env.local"): Record<string, string> {
  if (!existsSync(path)) throw new Error("run from the repo folder: no .env.local here");
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "");
  }
  return out;
}

export async function main(yes = process.argv.includes("--yes")) {
  const e = env();
  for (const k of ["AGENT_API_KEY", "AGENT_TREASURY_ID", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8"]) if (!e[k]) throw new Error(`${k} is not set in .env.local`);
  const baseUrl = agentApiBase(e.AGENT_API_BASE_URL); // refuses mainnet without Luca's yes
  const owner = ownerFromPkcs8({ accountId: e.AGENT_OWNER_ACCOUNT_ID, publicKey: e.AGENT_OWNER_PUBLIC_KEY, pkcs8Base64: e.AGENT_OWNER_PRIVATE_KEY_PKCS8 });
  const client = new AgentApiClient({ fetch: (u, i) => fetch(u, i), apiKey: e.AGENT_API_KEY, baseUrl, owner, sink: () => {} });
  const limits = (p: { policy: Record<string, unknown> }) => JSON.stringify((p.policy.limits as { per_transaction?: unknown } | undefined)?.per_transaction ?? null);
  const before = await client.policy(e.AGENT_TREASURY_ID);
  console.log(`treasury ${e.AGENT_TREASURY_ID} on ${baseUrl}, revision ${before.revision}, per transaction now: ${limits(before)}`);
  const want = treasuryPolicy();
  console.log(`would set per transaction: ${JSON.stringify(want.limits.per_transaction)}`);
  if (!yes) { console.log("dry run: pass --yes to submit the policy_update"); return; }
  await client.owned("policy_update", { agent_id: e.AGENT_TREASURY_ID, expected_revision: before.revision, policy: want },
    { kind: "policy", label: "Treasury per-transaction cap raised to 100 test USDC", codePath: "scripts/raise-treasury-cap.mts" });
  const after = await client.policy(e.AGENT_TREASURY_ID);
  console.log(`done: revision ${after.revision}, per transaction now: ${limits(after)}`);
}

if (process.argv[1]?.endsWith("raise-treasury-cap.mts")) main().catch((err) => { console.error(String(err instanceof Error ? err.message : err).replace(/(naa_|ngt_|wk_)[A-Za-z0-9_-]+/g, "$1<redacted>")); process.exit(1); });
