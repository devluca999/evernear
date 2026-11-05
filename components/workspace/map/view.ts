// Pan and zoom for the map: a viewBox that can be dragged and zoomed, kept inside the map.
export interface View { x: number; y: number; w: number; h: number }
export const MAX_ZOOM = 4;

export const fullView = (W: number, H: number): View => ({ x: 0, y: 0, w: W, h: H });

/** Keeps the view inside the map and between 1x and MAX_ZOOM. */
export function clampView(v: View, W: number, H: number): View {
  const w = Math.min(W, Math.max(W / MAX_ZOOM, v.w));
  const h = (w * H) / W;
  return { w, h, x: Math.min(W - w, Math.max(0, v.x)), y: Math.min(H - h, Math.max(0, v.y)) };
}

/** Zooms by `factor` (>1 zooms in) around a point given as a share of the view (0..1). */
export function zoomAt(v: View, factor: number, fx: number, fy: number, W: number, H: number): View {
  const w = v.w / factor, h = v.h / factor;
  return clampView({ w, h, x: v.x + (v.w - w) * fx, y: v.y + (v.h - h) * fy }, W, H);
}

/** Pans by a drag of (dx, dy) screen pixels on an element `px` wide. */
export function panBy(v: View, dx: number, dy: number, px: number, W: number, H: number): View {
  const k = v.w / px;
  return clampView({ ...v, x: v.x - dx * k, y: v.y - dy * k }, W, H);
}

export const zoomOf = (v: View, W: number) => W / v.w;
