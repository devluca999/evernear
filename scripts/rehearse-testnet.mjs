#!/usr/bin/env node
// Registers Astro's wallet on OutLayer TESTNET and claims the connector trial key.
// Writes keys to .env.local (gitignored). Never prints a key. Never touches mainnet.
import { appendFileSync, readFileSync, existsSync } from "node:fs";

const BASE = "https://testnet-api.outlayer.ai";
const env = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
if (/^OUTLAYER_API_KEY=wk_/m.test(env)) { console.log("A testnet wallet is already in .env.local; nothing to do."); process.exit(0); }

const reg = await fetch(`${BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
const r = await reg.json();
if (!reg.ok || !r.api_key) { console.error("register failed", reg.status, r); process.exit(1); }

const tk = await fetch(`${BASE}/trial-key`, { method: "POST", headers: { Authorization: `Bearer ${r.api_key}` } });
const t = tk.ok ? await tk.json() : {};

appendFileSync(".env.local", [
  "", "# OutLayer TESTNET (scripts/rehearse-testnet.mjs)",
  `OUTLAYER_API_KEY=${r.api_key}`, `OUTLAYER_WALLET_ID=${r.wallet_id}`, `OUTLAYER_NEAR_ACCOUNT=${r.near_account_id}`,
  t.payment_key ? `OUTLAYER_PAYMENT_KEY=${t.payment_key}` : "# trial key not issued", "",
].join("\n"));

console.log(`Testnet wallet ${r.wallet_id}, account ${r.near_account_id}. Trial key: ${t.payment_key ? "yes" : "no"}.`);
console.log(`Set the owner policy at https://app.outlayer.ai/wallet?key=<OUTLAYER_API_KEY from .env.local> (testnet toggle).`);
