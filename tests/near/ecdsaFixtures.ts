// Test helpers: sign like a NEAR AI TEE (Ethereum personal_sign over the text) with a throwaway key.
import { secp256k1 } from "@noble/curves/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export function ethAddressOf(priv: Uint8Array): string {
  const pub = secp256k1.getPublicKey(priv, false).slice(1);
  return "0x" + bytesToHex(keccak_256(pub).slice(-20));
}

export function signed(text: string, priv: Uint8Array) {
  const msg = utf8ToBytes(text);
  const digest = keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
  const sig = secp256k1.sign(digest, priv);
  const signature = "0x" + sig.toCompactHex() + (27 + sig.recovery).toString(16);
  return { text, signature, signing_address: ethAddressOf(priv), signing_algo: "ecdsa", signature_kind: "provider_tee" };
}
