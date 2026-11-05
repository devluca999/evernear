// Recovers the address that signed a NEAR AI Cloud chat signature (Ethereum personal_sign over `text`),
// so the binding check rests on the signature itself, not on the address the server reports.
// Spec: .agents/skills/near-ai-cloud/references/chat-verification.md ("Verify the Signature").
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/** Lowercase 0x address of the signer, or null when the signature does not parse. */
export function recoverSigner(text: string, signatureHex: string): string | null {
  try {
    const raw = hexToBytes(signatureHex.replace(/^0x/, ""));
    if (raw.length !== 65) return null;
    const v = raw[64] >= 27 ? raw[64] - 27 : raw[64];
    if (v !== 0 && v !== 1) return null;
    const msg = utf8ToBytes(text);
    const digest = keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
    const pub = secp256k1.Signature.fromCompact(raw.slice(0, 64)).addRecoveryBit(v).recoverPublicKey(digest).toRawBytes(false).slice(1);
    return "0x" + bytesToHex(keccak_256(pub).slice(-20));
  } catch {
    return null;
  }
}
