"use client";
// Live mode: as the story reaches each money step (scenario/gates.ts liveStepOf: commit, advance,
// refuse, pay, reclaim), the clock holds while convex/live.ts runs the real step on Tidepool testnet;
// the drawer then shows the real proof. `releasePath` says who sent the releases: "gate" (the
// release gate in OutLayer's enclave) or "server" (Evernear's server, the gate not deployed). Every
// release proof's label and response say the same.
// Only available when NEXT_PUBLIC_CONVEX_URL is set; demo mode keeps the replay.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LiveStep } from "@/scenario/gates";
import type { Proof } from "@/scenario/types";
import { liveKeyOf, type LiveRow } from "@/scenario/liveLog";

const URL = process.env.NEXT_PUBLIC_CONVEX_URL;

type LiveProofRow = LiveRow;

export type ReleasePath = "gate" | "server";
export { liveKeyOf };

/** What the deployment says before a run: order wallets left on the key and whether the treasury covers the commit. */
export interface Preflight { ok: boolean; walletsLeft: number | null; walletLimit: number | null; treasuryUsd: number; needUsd: number; message: string }

export function useLive() {
  // Created in the browser only, after the page loads (never during the prerender).
  const [client, setClient] = useState<ConvexClient | null>(null);
  useEffect(() => {
    if (!URL) return;
    const c = new ConvexClient(URL);
    queueMicrotask(() => setClient(c));
    return () => { void c.close(); };
  }, []);
  const [on, setOn] = useState(false);
  const [runId, setRunId] = useState<Id<"liveRuns"> | null>(null);
  const [done, setDone] = useState<LiveStep[]>([]);
  const [proofs, setProofs] = useState<LiveProofRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<LiveStep | null>(null);
  const [releasePath, setReleasePath] = useState<ReleasePath | null>(null);
  const starting = useRef<Promise<Id<"liveRuns"> | null> | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);

  // Before a run starts: how many order wallets are left and whether the treasury covers the commit.
  const check = useCallback(async () => {
    if (!client) return null;
    try {
      const p = (await client.action(api.live.preflight, {})) as Preflight;
      setPreflight(p);
      return p;
    } catch (e) {
      const p: Preflight = { ok: false, walletsLeft: null, walletLimit: null, treasuryUsd: 0, needUsd: 0, message: `Could not check the Tidepool key: ${(e as Error).message}` };
      setPreflight(p);
      return p;
    }
  }, [client]);

  useEffect(() => {
    if (!client || !runId) return;
    return client.onUpdate(api.live.getRun, { runId }, (r) => {
      if (!r) return;
      setDone(r.run.done as LiveStep[]);
      setProofs(r.proofs as unknown as LiveProofRow[]);
      setReleasePath(r.releasePath);
      if (r.run.error) setError(r.run.error);
    });
  }, [client, runId]);

  const ensureRun = useCallback(async () => {
    if (runId) return runId;
    starting.current ??= check().then((p) => {
      // Refuse before anything moves: no wallet left, or the treasury cannot cover the commit.
      if (!p || !p.ok) { setError(p?.message ?? "could not check the Tidepool key"); return null; }
      return client!.mutation(api.live.start, {});
    }).then((r) => {
      if (!r) return null;
      if (!r.runId) { setError(r.refused ?? "could not start"); return null; }
      setRunId(r.runId);
      return r.runId;
    });
    return starting.current;
  }, [client, runId, check]);

  /** Runs a step once. Errors stop live mode for this run; the replay carries on. */
  const run = useCallback(async (step: LiveStep, scenario?: "happy" | "adjusted") => {
    if (!client || pending || error) return;
    setPending(step);
    try {
      const id = await ensureRun();
      if (!id) return;
      const r = await client.action(api.live.runStep, { runId: id, step, ...(scenario ? { scenario } : {}) });
      if (r.ok) setDone((d) => (d.includes(step) ? d : [...d, step]));
      else setError(`${step}: ${r.reason}`);
    } catch (e) {
      setError(`${step}: ${(e as Error).message}`);
    } finally {
      setPending(null);
    }
  }, [client, pending, error, ensureRun]);

  const reset = useCallback(() => { setRunId(null); setDone([]); setProofs([]); setError(null); setPending(null); setReleasePath(null); starting.current = null; }, []);

  /** Live proofs keyed like the scene proofs. */
  const byKey = useMemo(() => {
    const out: Record<string, Proof> = {};
    for (const p of proofs) {
      const key = liveKeyOf(p);
      if (key) out[key] = { id: key, scene: p.scene, kind: p.kind, label: p.label, call: p.call, codePath: p.codePath, network: p.network, hash: p.hash, explorerUrl: p.explorerUrl ?? null, response: p.response, replay: false, synthetic: false, wallMs: p.at };
    }
    return out;
  }, [proofs]);

  return {
    available: !!client, on: on && !!client,
    setOn: (v: boolean) => { setOn(v); reset(); if (v) void check(); },
    done, pending, error, run, byKey, reset, releasePath,
    /** Every real row of this run, in the order it landed. */
    rows: proofs, preflight, check,
  };
}
