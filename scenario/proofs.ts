import synthetic from "../fixtures/synthetic/proofs.json";
import type { Proof } from "./types";

type Entry = Omit<Proof, "id" | "scene" | "hash" | "explorerUrl" | "replay" | "synthetic">;
const table = synthetic as unknown as Record<string, Entry>;

/** Stable placeholder hash so the drawer has something to show. Never a real transaction. */
function placeholderHash(key: string): string {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `synthetic-${h.toString(16).padStart(8, "0")}`;
}

export function proofFor(key: string, scene: number): Proof {
  const e = table[key];
  if (!e) throw new Error(`no fixture for proof ${key}`);
  return { ...e, id: key, scene, hash: placeholderHash(key), explorerUrl: null, replay: true, synthetic: true };
}

export const proofKeys = Object.keys(table).filter((k) => !k.startsWith("_"));
