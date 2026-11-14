// Signed dock-count attestations: evidence received from a known receiving device, not a fact.
// A receiving device (a scanner at Astro's dock) holds an ed25519 key whose public half Astro pins
// (DOCK_DEVICE_KEYS). It signs {po, count, at, device}. A valid signature shows WHICH pinned device
// reported THIS count for THIS order at THIS time and that nobody changed it since. It does not show
// the count is true: a device, or whoever holds its key, can still report a wrong number.
import { ed25519 } from "@noble/curves/ed25519.js";
import { canonical } from "./releaseGate";

export const DOCK_PREFIX = "evernear-dock-count:v1:";
/** A count older than this is refused: the release must be decided on a fresh count. */
export const DOCK_MAX_AGE_MS = 7 * 86_400_000;

export interface DockDevice { device: string; publicKey: string }
export interface DockAttestation { po: string; count: number; at: string; device: string; publicKey: string; signature: string }
export type DockRefusal = "unsigned" | "unknown_device" | "key_mismatch" | "bad_signature" | "wrong_po" | "stale" | "future" | "bad_count";

const enc = (s: string) => new TextEncoder().encode(s);
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

export const dockMessage = (a: Pick<DockAttestation, "po" | "count" | "at" | "device">) => DOCK_PREFIX + canonical({ at: a.at, count: a.count, device: a.device, po: a.po });

/** Signs a count on the receiving device (and in tests). Never on Evernear's server. */
export function signDockCount(i: { po: string; count: number; at: string; device: string; secretKey: Uint8Array }): DockAttestation {
  const body = { po: i.po, count: i.count, at: i.at, device: i.device };
  return { ...body, publicKey: hex(ed25519.getPublicKey(i.secretKey)), signature: hex(ed25519.sign(enc(dockMessage(body)), i.secretKey)) };
}

export function parseDockDevices(raw: string | undefined): DockDevice[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a.filter((d) => d && typeof d.device === "string" && /^[0-9a-f]{64}$/i.test(d.publicKey)).map((d) => ({ device: d.device, publicKey: d.publicKey.toLowerCase() })) : [];
  } catch { return []; }
}

/** Whether `a` is a fresh count for `po` signed by a pinned device. */
export function verifyDockCount(a: Partial<DockAttestation> | undefined, i: { po: string; devices: DockDevice[]; nowMs: number }): { ok: true; device: string; count: number } | { ok: false; reason: DockRefusal } {
  if (!a || typeof a.signature !== "string" || typeof a.publicKey !== "string" || typeof a.device !== "string") return { ok: false, reason: "unsigned" };
  if (!Number.isSafeInteger(a.count) || (a.count as number) < 0) return { ok: false, reason: "bad_count" };
  const dev = i.devices.find((d) => d.device === a.device);
  if (!dev) return { ok: false, reason: "unknown_device" };
  if (dev.publicKey !== a.publicKey.toLowerCase()) return { ok: false, reason: "key_mismatch" };
  let valid = false;
  try { valid = /^[0-9a-f]{128}$/.test(a.signature) && ed25519.verify(fromHex(a.signature), enc(dockMessage(a as DockAttestation)), fromHex(dev.publicKey)); } catch { valid = false; }
  if (!valid) return { ok: false, reason: "bad_signature" };
  if (a.po !== i.po) return { ok: false, reason: "wrong_po" };
  const at = Date.parse(String(a.at));
  if (!Number.isFinite(at) || at > i.nowMs + 5 * 60_000) return { ok: false, reason: "future" };
  if (i.nowMs - at > DOCK_MAX_AGE_MS) return { ok: false, reason: "stale" };
  return { ok: true, device: a.device, count: a.count as number };
}
