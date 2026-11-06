import type { SignalEvidence } from "@/convex/near/escrow";
import type { Stage } from "@/engine/escrow";

/** The simulated feed's evidence for a stage, and the dock count for the balance. */
export function evidence(stage: Stage, drop: string[] = [], count = 44): SignalEvidence {
  const all: SignalEvidence = stage === "advance"
    ? { bill_of_lading: { id: "sim-bol", at: "2026-11-05T13:40:00Z", source: "simulated" }, export_cleared: { id: "sim-export", at: "2026-11-05T20:15:00Z", source: "simulated" } }
    : { import_cleared: { id: "sim-import", at: "2026-11-11T06:50:00Z", source: "simulated" }, dock_count: { id: "dock-1042", at: "2026-11-11T08:40:00Z", count, source: "simulated" } };
  for (const d of drop) delete all[d as keyof SignalEvidence];
  return all;
}

