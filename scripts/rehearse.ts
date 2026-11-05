#!/usr/bin/env -S npx tsx
// RECORD=1 npm run rehearse
// Runs the scene steps in order against OutLayer TESTNET and NEAR AI Cloud with the keys in
// .env.local, and with RECORD=1 writes each real proof to fixtures/recorded/<key>.json.
// Refuses to start when a variable is missing or anything points at mainnet. Never prints a key.
// Steps that need a person (owner policy, approvals signed on a phone, Gmail connection) print
// exact instructions and wait; with no terminal attached they are skipped. The mainnet payout is
// always skipped. Steps: scripts/rehearse/steps.ts.
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { rehearse, RehearsalRefused, type Env } from "./rehearse/steps";

function loadEnvFile(path: string): Env {
  if (!existsSync(path)) return {};
  const out: Env = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env: Env = { ...loadEnvFile(".env.local"), ...process.env };
const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const ask = async (q: string) => (rl ? rl.question(q) : null);

try {
  const { results, written } = await rehearse({ env, fetch: (u, i) => fetch(u, i), ask, log: (s) => console.log(s), dir: "fixtures/recorded" });
  const skippedSteps = results.filter((r) => r.result.status === "skipped");
  console.log(`\n${results.length - skippedSteps.length} of ${results.length} steps done. Recorded: ${written.length ? written.join(", ") : "nothing"}${env.RECORD === "1" ? "" : " (set RECORD=1 to write fixtures)"}.`);
  console.log("intents_payout needs FINALE_ENABLED=1 and Luca's explicit yes; it is never run from here.");
} catch (e) {
  if (e instanceof RehearsalRefused) { console.error(`Refused: ${e.message}`); process.exitCode = 1; } else throw e;
} finally {
  rl?.close();
}
