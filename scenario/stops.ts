// Which beats Present mode stops at. Its own module, so the script (scenes.ts) and the clock
// (gates.ts) share it without importing each other.
import type { Beat } from "./types";

/**
 * Present mode stops at every beat worth narrating: a new chapter, a message, a named step with a
 * camera focus, an off-list attempt, the commit, the dock count, a payment, the reclaim, a rules
 * change, the end. Beats that only animate (fitment pins resolving, shipment progress, checkpoints,
 * the rail, the phone) play between stops. A chapter's first step that `rides` plays with the press
 * that enters the chapter (scenes.ts buildTimeline).
 */
const STOP_TYPES = new Set(["message", "refused", "lock_funds", "dock", "release", "reclaim", "rules", "end_card"]);
export const isStop = (b: Beat) => !!b.gate || (!b.rides && (!!b.focus || STOP_TYPES.has(b.ev.type))) || (b.ev.type === "scene" && b.scene > 0);
