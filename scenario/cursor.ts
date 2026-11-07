// The presenter cursor's rules: where it goes, how long the glide takes, and when a step clicks.
// Pure, so it is tested without a browser (scenario/__tests__/cursor.test.ts). The drawing and the
// timers live in components/workspace/Cursor.tsx; it moves inside the camera's stage, in layout pixels.
import type { Beat } from "./types";
import type { Rect } from "./camera";

/** A glide takes 450 to 700 ms, longer for a longer way. */
export const MOVE_MIN_MS = 450;
export const MOVE_MAX_MS = 700;
/** From the cursor landing to the press, and from the press to the change it causes. */
export const PRESS_MS = 120;
export const CAUSE_MS = 140;
/** The real mouse takes over once it has moved this far. */
export const TAKEOVER_PX = 40;

export interface Point { x: number; y: number }

/** How long the glide from `a` to `b` takes. With reduced motion it is a jump. */
export function moveMs(a: Point, b: Point, reduced: boolean): number {
  if (reduced) return 0;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (d < 2) return 0;
  return Math.round(Math.min(MOVE_MAX_MS, MOVE_MIN_MS + d * 0.25));
}

/** Where the arrow's tip lands to click an element: its middle. */
export const tapPoint = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Where the cursor rests beside content it does not click: just past its lower right, inside it. */
export const restPoint = (r: Rect): Point => ({ x: r.x + r.w * 0.8, y: r.y + Math.min(r.h * 0.85, r.h - 8) });

/** The element a step clicks, if the step is a click in the app. Animation-only steps click nothing. */
export const clickTargetOf = (b: Beat): string | null => b.clickTarget ?? null;

/** Ids the cursor may never click: the demo's own controls live outside the stage and carry none. */
export const FORBIDDEN = /^(demo|rail|live|restart|scenario)\b/i;

/** How far ahead of a step that clicks while the clock runs the cursor sets off. */
export const LOOKAHEAD_MS = MOVE_MAX_MS + PRESS_MS + CAUSE_MS;

/**
 * A step that clicks while the clock runs (not one the presenter advances to) is `remainingMs`
 * away: the glide shortens to fit, so the press still lands just before the step's change.
 */
export const fitGlide = (wantedMs: number, remainingMs: number) => Math.max(0, Math.min(wantedMs, remainingMs - PRESS_MS - CAUSE_MS));
