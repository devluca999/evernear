// The demo waits for the viewer at each human moment (scenes.ts beats with a `gate`), and in live
// mode it also holds at each money step until the real call finished (`blocked`).
// Beats behind the clock count as passed, so jumping to a scene never asks twice.
import { timeline } from "./scenes";
import type { Beat } from "./types";

export type Blocked = (b: Beat) => boolean;
const gatesOnly = (waitForMe: boolean): Blocked => (b) => waitForMe && !!b.gate;

/** The next blocking beat strictly after t, if any. */
export function nextBlock(t: number, blocked: Blocked, beats: Beat[] = timeline): Beat | null {
  return beats.find((b) => b.atMs > t && blocked(b)) ?? null;
}
export const nextGate = (t: number, beats: Beat[] = timeline) => nextBlock(t, gatesOnly(true), beats);

/** Moves the clock from `from` towards `to`, stopping 1 ms before a blocking beat. */
export function stepClockWith(from: number, to: number, blocked: Blocked, beats: Beat[] = timeline): number {
  const g = nextBlock(from, blocked, beats);
  return g && to >= g.atMs ? Math.max(from, g.atMs - 1) : to;
}
export const stepClock = (from: number, to: number, waitForMe: boolean, beats: Beat[] = timeline) => stepClockWith(from, to, gatesOnly(waitForMe), beats);

/** The beat the clock is held at right now, if any. */
export function heldAt(t: number, blocked: Blocked, beats: Beat[] = timeline): Beat | null {
  const g = nextBlock(t, blocked, beats);
  return g && t >= g.atMs - 1 ? g : null;
}
export const waitingAt = (t: number, waitForMe: boolean, beats: Beat[] = timeline) => heldAt(t, gatesOnly(waitForMe), beats);

/** The live money steps, and the beat each one runs at. */
export type LiveStep = "commit" | "refuse" | "pay" | "reclaim";
export function liveStepOf(b: Beat, supplierAddress: string): LiveStep | null {
  if (b.ev.type === "lock_funds") return "commit";
  if (b.ev.type === "release") return b.ev.to === supplierAddress ? "pay" : "refuse";
  if (b.ev.type === "reclaim") return "reclaim";
  return null;
}
