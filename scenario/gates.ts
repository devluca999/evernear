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

/**
 * Present mode stops at every beat worth narrating: a new scene, a message, a fitment check, an
 * off-list attempt, the commit, the dock count, a payment, the reclaim, a rules change, the end.
 * Beats that only animate (shipment progress, checkpoints, the rail, the phone) play between stops.
 */
const STOP_TYPES = new Set(["message", "fitment", "refused", "lock_funds", "dock", "release", "reclaim", "rules", "end_card"]);
export const isStop = (b: Beat) => !!b.gate || STOP_TYPES.has(b.ev.type) || (b.ev.type === "scene" && b.scene > 0);

const SENDER: Record<string, string> = { "haoyun-precision.example": "Haoyun", "ultra-motion.example": "Ultra Motion" };

const clip = (t: string, n = 64) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** What happens at a stop, for the "Next:" button. */
export function describeStop(b: Beat, sceneTitle: (id: number) => string, supplierAddress: string): string {
  if (b.gate) return b.gate.action;
  const ev = b.ev;
  switch (ev.type) {
    case "scene": return sceneTitle(ev.id);
    case "message": {
      const m = ev.message;
      if (m.channel === "telegram") return m.direction === "out" ? `Stockbot: ${clip(m.text)}` : `You reply: ${clip(m.text, 40)}`;
      if (m.direction === "in") return `Deliver ${SENDER[m.from.split("@")[1] ?? ""] ?? m.from}'s reply`;
      return `Evernear emails ${m.to?.split("@")[1]?.split(".")[0] ?? "the supplier"}`;
    }
    case "fitment": return `Check ${ev.supplierId === "haoyun" ? "Haoyun Precision" : ev.supplierId === "kansai" ? "Kansai Servo Works" : ev.supplierId === "rheinwerk" ? "Rheinwerk" : ev.supplierId === "huaxin" ? "Huaxin Robotics" : ev.supplierId} against the BOM`;
    case "refused": return "The agent tries an off-list email";
    case "lock_funds": return "Commit the PO total";
    case "dock": return "Count the delivery at the dock";
    case "release": return ev.to === supplierAddress ? "Pay Haoyun for what arrived" : "Try a payment to a wrong address";
    case "reclaim": return "At the deadline, return the rest to Astro";
    case "rules": return "Apply the new limit";
    case "end_card": return "Close the order";
    default: return "Continue";
  }
}
