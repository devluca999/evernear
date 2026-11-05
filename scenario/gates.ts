// The demo waits for the viewer at each human moment (scenes.ts beats with a `gate`).
// Gates behind the clock count as passed, so jumping to a scene never asks twice.
import { timeline } from "./scenes";
import type { Beat } from "./types";

/** The next gated beat strictly after t, if any. */
export function nextGate(t: number, beats: Beat[] = timeline): Beat | null {
  return beats.find((b) => b.gate && b.atMs > t) ?? null;
}

/** Moves the clock from `from` towards `to`, stopping 1 ms before a gate when waiting is on. */
export function stepClock(from: number, to: number, waitForMe: boolean, beats: Beat[] = timeline): number {
  if (!waitForMe) return to;
  const g = nextGate(from, beats);
  return g && to >= g.atMs ? Math.max(from, g.atMs - 1) : to;
}

/** The gate the viewer is being asked about right now. */
export function waitingAt(t: number, waitForMe: boolean, beats: Beat[] = timeline): Beat | null {
  if (!waitForMe) return null;
  const g = nextGate(t, beats);
  return g && t >= g.atMs - 1 ? g : null;
}
