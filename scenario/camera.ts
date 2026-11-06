// The presenter camera's maths: where to point, how far to zoom, and how the move eases. Pure, so it
// is tested without a browser (scenario/__tests__/camera.test.ts). Components/workspace/Camera.tsx
// applies it as one CSS transform on a container laid out at full size, so text re-renders crisp.

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.5;
/** Ease in to a focus, and back out to the full view. */
export const IN_MS = 700;
export const OUT_MS = 500;
/** How long a focus holds when its step names no hold. */
export const DEFAULT_HOLD_MS = 2200;
/** Click-follow: a gentle zoom toward the click, back to full after this long without clicks. */
export const FOLLOW_ZOOM = 1.4;
export const FOLLOW_IDLE_MS = 2000;
/** Room kept around the focused element, in screen pixels. */
export const PAD = 48;
/** Spotlight: what stays visible of everything outside the focus (40%). */
export const SPOTLIGHT_KEEP = 0.4;

/** The camera's view: translate(x, y) then scale(k), from the top left corner. */
export interface View { k: number; x: number; y: number }
export const FULL: View = { k: 1, x: 0, y: 0 };
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * The view that puts `rect` (in unzoomed layout pixels) in the middle of the viewport at `zoom`,
 * zooming less if the element would not fit with padding, and never showing past the workspace edge.
 */
export function cameraTarget(rect: Rect, vp: Size, zoom: number, pad = PAD): View {
  const fit = Math.min(rect.w > 0 ? (vp.w - 2 * pad) / rect.w : Infinity, rect.h > 0 ? (vp.h - 2 * pad) / rect.h : Infinity);
  const k = Math.max(ZOOM_MIN, Math.min(clampZoom(zoom), fit));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  const x = Math.min(0, Math.max(vp.w - vp.w * k, vp.w / 2 - cx * k));
  const y = Math.min(0, Math.max(vp.h - vp.h * k, vp.h / 2 - cy * k));
  return { k, x, y };
}

/** Where an element sits in layout pixels, given its screen box, the stage's screen box and the stage's zoom. */
export function toLayout(el: { left: number; top: number; width: number; height: number }, stage: { left: number; top: number }, k: number): Rect {
  return { x: (el.left - stage.left) / k, y: (el.top - stage.top) / k, w: el.width / k, h: el.height / k };
}

/**
 * A spring with no more than about 1% overshoot (damping ratio 0.82), normalised so it starts at 0
 * and ends exactly at 1. t runs 0 to 1 over the move.
 */
export const DAMPING = 0.82;
const OMEGA = 6.6;
export function spring(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const z = DAMPING, wd = OMEGA * Math.sqrt(1 - z * z);
  const raw = (u: number) => 1 - Math.exp(-z * OMEGA * u) * (Math.cos(wd * u) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * u));
  return raw(t) / raw(1);
}

/** The spring as a CSS `linear()` easing, sampled at `steps` points. */
export function springEasing(steps = 48): string {
  const pts = Array.from({ length: steps + 1 }, (_, i) => +spring(i / steps).toFixed(4));
  return `linear(${pts.join(", ")})`;
}

/** How a move plays: animated, or a cut when the viewer asked for reduced motion. */
export function motion(reduced: boolean): { inMs: number; outMs: number; easing: string } {
  return reduced ? { inMs: 0, outMs: 0, easing: "linear" } : { inMs: IN_MS, outMs: OUT_MS, easing: springEasing() };
}

/** The CSS transform for a view. Pan and zoom always travel together in this one transform. */
export const transformOf = (v: View) => `translate(${+v.x.toFixed(2)}px, ${+v.y.toFixed(2)}px) scale(${+v.k.toFixed(4)})`;
