// The dock clerk signs the received count on the dock device and submits it (the CLI twin of /dock).
//   NEXT_PUBLIC_CONVEX_URL=... npx tsx scripts/dock-sign.mts <count> [--key .approver-keys/dock-3-scanner.key] [--device dock-3-scanner]
import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { signDockCount } from "../engine/attestation";
import { PO } from "../seed/astro";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const count = Number(process.argv[2]);
const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!Number.isSafeInteger(count) || !url) { console.error("usage: NEXT_PUBLIC_CONVEX_URL=... npx tsx scripts/dock-sign.mts <count>"); process.exit(1); }
const sk = Uint8Array.from(readFileSync(arg("key") ?? ".approver-keys/dock-3-scanner.key", "utf8").trim().match(/../g)!.map((h) => parseInt(h, 16)));
const c = new ConvexHttpClient(url);
const order = await c.query(api.dock.openOrder, { po: PO.number });
if (!order) { console.error(`no open order wallet for PO ${PO.number}`); process.exit(1); }
const a = signDockCount({ po: PO.number, agentId: order.agentId, count, at: new Date().toISOString(), device: arg("device") ?? "dock-3-scanner", secretKey: sk });
console.log(await c.mutation(api.dock.submit, { attestation: a }));
