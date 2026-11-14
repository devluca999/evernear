// Loads the AGENT_* testnet variables from .env.local into process.env without printing them.
import { readFileSync } from "node:fs";
export function loadTestnetEnv(names = ["AGENT_API_BASE_URL", "AGENT_API_KEY", "AGENT_OWNER_ACCOUNT_ID", "AGENT_OWNER_PUBLIC_KEY", "AGENT_OWNER_PRIVATE_KEY_PKCS8", "AGENT_TREASURY_ID"]) {
  const lines = readFileSync(".env.local", "utf8").split("\n");
  for (const l of lines) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim());
    if (m && names.includes(m[1])) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new Error(`missing in .env.local: ${missing.join(", ")}`);
  if (/agentsonintents/.test(process.env.AGENT_API_BASE_URL ?? "")) throw new Error("refusing: mainnet host");
}
