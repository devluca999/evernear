import crypto from "node:crypto";
import { base58 } from "@scure/base";
import { ownerFromPkcs8 } from "@/convex/near/agentapi";

/** A throwaway owner, an implicit account made like Astro's. Tests only. */
export function testOwner() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x!, "base64url");
  const pkcs8Base64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
  return { node: privateKey, pkcs8Base64, owner: ownerFromPkcs8({ accountId: raw.toString("hex"), publicKey: "ed25519:" + base58.encode(raw), pkcs8Base64 }) };
}
export const API_KEY = "naa_" + "k".repeat(43);
