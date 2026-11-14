// An approver signs the live order's exact terms on their own device and submits the signature.
// The key never leaves this machine; the server checks it against the pinned public keys.
//   npx tsx scripts/approve.mts --name Luca --key .approver-keys/Luca.key [--scenario happy|adjusted] [--ttl-min 60] [--revoke <nonce>]
// As a NEAR testnet account (NEP-413, the approver pinned with accountId in APPROVER_KEYS):
//   npx tsx scripts/approve.mts --name Jordan --near-credentials ~/.near-credentials/testnet/jordan.testnet.json
// Reads NEXT_PUBLIC_CONVEX_URL (or CONVEX_URL) for the deployment.
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { signApproval, signApprovalNep413, signRevoke } from "../engine/approvals";
import { base58 } from "@scure/base";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const name = arg("name"), nearFile = arg("near-credentials"), keyFile = arg("key") ?? nearFile, scenario = (arg("scenario") ?? "happy") as "happy" | "adjusted";
const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!name || !keyFile || !url) { console.error("usage: NEXT_PUBLIC_CONVEX_URL=... npx tsx scripts/approve.mts --name <Name> --key <file> [--scenario happy|adjusted]"); process.exit(1); }
// A NEAR credentials file holds {account_id, private_key: "ed25519:<base58 of seed + public key>"}.
const nearJson = nearFile ? JSON.parse(readFileSync(nearFile, "utf8")) as { account_id?: string; private_key: string } : null;
// Older near-cli files omit account_id: the file is named <account>.json.
const near = nearJson ? { ...nearJson, account_id: nearJson.account_id ?? nearFile!.split("/").pop()!.replace(/\.json$/, "") } : null;
const sk = near ? base58.decode(near.private_key.replace(/^ed25519:/, "")).slice(0, 32)
  : Uint8Array.from(readFileSync(keyFile, "utf8").trim().match(/../g)!.map((h) => parseInt(h, 16)));
const client = new ConvexHttpClient(url);

const revoke = arg("revoke");
if (revoke) {
  console.log(await client.mutation(api.approvals.revoke, { nonce: revoke, signature: signRevoke(revoke, sk) }));
} else {
  const { terms, digest } = await client.query(api.approvals.terms, { scenario });
  console.log("You are approving exactly these terms:\n" + JSON.stringify(terms, null, 2) + `\ndigest ${digest}`);
  const now = Date.now();
  const base = { approver: name, secretKey: sk, digest, nonce: crypto.randomUUID(), issuedAt: now, expiresAt: now + Number(arg("ttl-min") ?? 60) * 60_000 };
  const approval = near ? signApprovalNep413({ ...base, accountId: near.account_id }) : signApproval(base);
  const r = await client.mutation(api.approvals.submit, { approval });
  console.log(r.ok ? `approved (nonce ${approval.nonce})` : `refused: ${r.reason}`);
}
