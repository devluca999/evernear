"use client";
// Live mode: as the story reaches each money step (scenario/gates.ts liveStepOf), the clock holds
// while convex/live.ts runs the real step on Tidepool testnet; the drawer then shows the real proof.
// Only available when NEXT_PUBLIC_CONVEX_URL is set; demo mode keeps the replay.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConvexClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LiveStep } from "@/scenario/gates";
import type { Proof } from "@/scenario/types";

const URL = process.env.NEXT_PUBLIC_CONVEX_URL;

interface LiveProofRow { _id: string; at: number; kind: string; label: string; call: string; codePath: string; network: Proof["network"]; hash: string; explorerUrl?: string; response: unknown; scene: number }

/** Which scene proof a live call stands in for. */
export function liveKeyOf(p: { codePath: string; kind: string }): string | null {
  if (p.codePath.endsWith("escrow.ts#lock") && p.kind === "escrow") return "escrow_wallet";
  if (p.codePath.endsWith("escrow.ts#policyRefusal") && p.kind === "refusal") return "refused_release";
  if (p.codePath.endsWith("escrow.ts#release") && p.kind === "payout") return "intents_payout";
  return null;
}

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
  const starting = useRef<Promise<Id<"liveRuns"> | null> | null>(null);

  useEffect(() => {
    if (!client || !runId) return;
    return client.onUpdate(api.live.getRun, { runId }, (r) => {
      if (!r) return;
      setDone(r.run.done as LiveStep[]);
      setProofs(r.proofs as unknown as LiveProofRow[]);
      if (r.run.error) setError(r.run.error);
    });
  }, [client, runId]);

  const ensureRun = useCallback(async () => {
    if (runId) return runId;
    starting.current ??= client!.mutation(api.live.start, {}).then((r) => {
      if (!r.runId) { setError(r.refused ?? "could not start"); return null; }
      setRunId(r.runId);
      return r.runId;
    });
    return starting.current;
  }, [client, runId]);

  /** Runs a step once. Errors stop live mode for this run; the replay carries on. */
  const run = useCallback(async (step: LiveStep) => {
    if (!client || pending || error) return;
    setPending(step);
    try {
      const id = await ensureRun();
      if (!id) return;
      const r = await client.action(api.live.runStep, { runId: id, step });
      if (r.ok) setDone((d) => (d.includes(step) ? d : [...d, step]));
      else setError(`${step}: ${r.reason}`);
    } catch (e) {
      setError(`${step}: ${(e as Error).message}`);
    } finally {
      setPending(null);
    }
  }, [client, pending, error, ensureRun]);

  const reset = useCallback(() => { setRunId(null); setDone([]); setProofs([]); setError(null); setPending(null); starting.current = null; }, []);

  /** Live proofs keyed like the scene proofs. */
  const byKey = useMemo(() => {
    const out: Record<string, Proof> = {};
    for (const p of proofs) {
      const key = liveKeyOf(p);
      if (key) out[key] = { id: key, scene: p.scene, kind: p.kind, label: p.label, call: p.call, codePath: p.codePath, network: p.network, hash: p.hash, explorerUrl: p.explorerUrl ?? null, response: p.response, replay: false, synthetic: false, wallMs: p.at };
    }
    return out;
  }, [proofs]);

  return { available: !!client, on: on && !!client, setOn: (v: boolean) => { setOn(v); reset(); }, done, pending, error, run, byKey, reset };
}
