import synthetic from "../fixtures/synthetic/proofs.json";
import { recorded } from "../fixtures/recorded";
import type { Proof } from "./types";

type Entry = Omit<Proof, "id" | "scene" | "hash" | "explorerUrl" | "replay" | "synthetic">;
type Recorded = Entry & { hash: string; explorerUrl?: string | null };
const table = synthetic as unknown as Record<string, Entry>;

/** Stable placeholder hash so the drawer has something to show. Never a real transaction. */
function placeholderHash(key: string): string {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `synthetic-${h.toString(16).padStart(8, "0")}`;
}

/**
 * A real recording in fixtures/recorded/ wins (shown as "replay", real hash and explorer link);
 * otherwise the synthetic placeholder (labelled "synthetic"). Static imports only: client code uses this.
 */
export function makeProofFor(rec: Record<string, unknown>, syn: Record<string, Entry> = table) {
  return function proofFor(key: string, scene: number): Proof {
    const r = rec[key] as Recorded | undefined;
    if (r) {
      return {
        kind: r.kind, label: r.label, call: r.call, codePath: r.codePath, network: r.network, response: r.response,
        id: key, scene, hash: r.hash, explorerUrl: r.explorerUrl ?? null, replay: true, synthetic: false,
      };
    }
    const e = syn[key];
    if (!e) throw new Error(`no fixture for proof ${key}`);
    return { ...e, id: key, scene, hash: placeholderHash(key), explorerUrl: null, replay: true, synthetic: true };
  };
}

export const proofFor = makeProofFor(recorded);

export const proofKeys = Object.keys(table).filter((k) => !k.startsWith("_"));
export const recordedKeys = Object.keys(recorded);
