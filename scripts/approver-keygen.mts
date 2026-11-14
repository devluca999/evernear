// Makes an approver key on the approver's own machine. The private key is written to a file only
// you hold (mode 600, gitignored under .approver-keys/); the public key is printed for APPROVER_KEYS.
//   npx tsx scripts/approver-keygen.mts Luca
import { ed25519 } from "@noble/curves/ed25519.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";

const name = process.argv[2];
if (!name || !/^[A-Za-z][A-Za-z0-9 _-]{0,31}$/.test(name)) { console.error("usage: npx tsx scripts/approver-keygen.mts <Name>"); process.exit(1); }
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const dir = ".approver-keys", file = `${dir}/${name}.key`;
if (existsSync(file)) { console.error(`${file} exists; refusing to overwrite`); process.exit(1); }
mkdirSync(dir, { recursive: true, mode: 0o700 });
const sk = ed25519.utils.randomSecretKey();
writeFileSync(file, hex(sk) + "\n", { mode: 0o600 });
console.log(`private key: ${file} (keep it on this device)`);
console.log(`registry entry: ${JSON.stringify({ name, publicKey: hex(ed25519.getPublicKey(sk)) })}`);
console.log(`set on the Convex deployment: npx convex env set APPROVER_KEYS '[<entry for each approver>]'`);
