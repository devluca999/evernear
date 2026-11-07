"use client";
// The presenter camera. Everything but the demo rail sits on one stage, laid out at full size; a
// step with a `focus` pans and scales that stage in one CSS transform so the element sits in the
// middle, holds, then eases back to the full view (unless the next step has its own focus). The
// text stays crisp because the browser re-renders the layout at the new scale, never a bitmap.
// Click-follow zooms gently toward a click and drifts back after 2 s without clicks.
// With reduced motion the moves cut instead of easing. Maths: scenario/camera.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Focus } from "@/scenario/types";
import { cameraTarget, DEFAULT_HOLD_MS, FOLLOW_IDLE_MS, FOLLOW_ZOOM, FULL, motion, toLayout, transformOf, type Rect, type View } from "@/scenario/camera";
import s from "./shell.module.css";

export type CameraMode = "full" | "step" | "held" | "follow";
export interface CameraState { mode: CameraMode; focusId: string | null; zoom: number }

/** The viewer's reduced motion setting, kept up to date. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
    if (!mq) return;
    queueMicrotask(() => setReduced(mq.matches));
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** The first element on the stage with this focus id that has a box. */
export function findFocus(root: ParentNode | null, id: string): HTMLElement | null {
  if (!root) return null;
  const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, "\\$&");
  const all = Array.from(root.querySelectorAll<HTMLElement>(`[data-focus="${safe}"]`));
  return all.find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 || r.height > 0; }) ?? all[0] ?? null;
}

/** How long the camera waits for a step's element to show what it declares, then zooms anyway. */
const MAX_TRIES = 40;
/** A short move when the frame corrects after the content grew. */
const REFIT_MS = 240;
/** The element holds every text the step says it shows. */
export const showsAll = (el: HTMLElement, shows: string[]) => {
  const text = (el.textContent ?? "").replace(/\s+/g, " ");
  return shows.every((x) => text.includes(x));
};

/** What the presenter cursor asks of the camera: where an element sits on the stage, in layout pixels. */
export interface CameraApi { locate: (id: string) => Rect | null }

export function Camera({ on, follow, request, fullSeq, holdNext, onChange, apiRef, overlay, children }: {
  on: boolean; follow: boolean;
  /** A step that just ran with a focus; `seq` changes for every new step. */
  request: { seq: number; focus: Focus } | null;
  /** Changes when the presenter asks for the full view (key 0). */
  fullSeq: number;
  /** The next step has its own focus: after the hold, stay put and move straight there. */
  holdNext: boolean;
  onChange?: (c: CameraState) => void;
  apiRef?: React.RefObject<CameraApi | null>;
  /** Drawn on the stage above everything, moving with it (the presenter cursor). */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(FULL);
  const [dur, setDur] = useState(0);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const mode = useRef<CameraMode>("full");
  const timers = useRef<number[]>([]);
  const reduced = useReducedMotion();
  const m = motion(reduced);
  const holdNextRef = useRef(holdNext);
  useEffect(() => { holdNextRef.current = holdNext; });
  const report = useRef(onChange);
  useEffect(() => { report.current = onChange; });

  const clear = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  /** The stage's zoom as drawn right now (mid-move too); 1 where layout is not measured. */
  const liveZoom = () => { const el = stage.current; if (!el || !el.offsetWidth) return 1; return el.getBoundingClientRect().width / el.offsetWidth; };
  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      locate: (id) => {
        const el = findFocus(stage.current, id);
        if (!el || !stage.current) return null;
        return toLayout(el.getBoundingClientRect(), stage.current.getBoundingClientRect(), liveZoom());
      },
    };
  });
  const viewport = () => { const r = frame.current?.getBoundingClientRect(); return { w: r?.width ?? 0, h: r?.height ?? 0 }; };

  const goFull = useCallback((ms: number) => {
    clear();
    mode.current = "full";
    setSpot(null); setFocusId(null); setDur(ms); setView(FULL);
  }, []);

  // A step with a focus: wait until its element shows what the step declares (scenes.ts `shows`),
  // move there so the whole element fits with room around it, hold, come back. Once the move lands
  // the element is measured again, and the frame corrects if the content grew on the way.
  useEffect(() => {
    if (!request || !on) return;
    clear();
    let tries = 0, alive = true;
    const measure = (el: HTMLElement) => toLayout(el.getBoundingClientRect(), stage.current!.getBoundingClientRect(), liveZoom());
    const target = (rect: Rect) => { const vp = viewport(); return vp.w ? cameraTarget(rect, vp, request.focus.zoom) : { ...FULL, k: request.focus.zoom }; };
    const attempt = () => {
      if (!alive) return;
      const el = findFocus(stage.current, request.focus.id);
      const ready = !!el && showsAll(el, request.focus.shows);
      if (!ready && tries++ < MAX_TRIES) { later(attempt, 50); return; }
      if (!el) return;
      const rect = measure(el);
      mode.current = "step";
      setFocusId(request.focus.id);
      setDur(m.inMs);
      setView(target(rect));
      setSpot(request.focus.spotlight ? rect : null);
      later(() => {
        const again = findFocus(stage.current, request.focus.id);
        if (!again || mode.current !== "step") return;
        const r2 = measure(again);
        if (Math.abs(r2.w - rect.w) > 2 || Math.abs(r2.h - rect.h) > 2 || Math.abs(r2.x - rect.x) > 2 || Math.abs(r2.y - rect.y) > 2) {
          setDur(REFIT_MS); setView(target(r2)); if (request.focus.spotlight) setSpot(r2);
        }
      }, m.inMs + 30);
      later(() => {
        setSpot(null);
        if (holdNextRef.current) mode.current = "held";
        else goFull(m.outMs);
      }, m.inMs + (request.focus.holdMs ?? DEFAULT_HOLD_MS));
    };
    // Two frames first, so a card that just changed has laid out.
    requestAnimationFrame(() => requestAnimationFrame(attempt));
    return () => { alive = false; clear(); };
    // A new step is a new seq (turning the camera back on does not replay the last one).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.seq]);

  // Held for the next step, but the next step changed (a jump, a new chapter): come back.
  useEffect(() => { if (!holdNext && mode.current === "held") queueMicrotask(() => goFull(m.outMs)); }, [holdNext, goFull, m.outMs]);
  // Camera off, or the full view asked for.
  useEffect(() => { if (!on) queueMicrotask(() => goFull(m.outMs)); }, [on, goFull, m.outMs]);
  useEffect(() => { if (fullSeq > 0) queueMicrotask(() => goFull(m.outMs)); }, [fullSeq, goFull, m.outMs]);
  useEffect(() => () => clear(), []);
  useEffect(() => { report.current?.({ mode: mode.current, focusId, zoom: view.k }); }, [view, focusId]);

  // Click-follow: after the click lands (so the zoom never moves what you clicked), lean toward it.
  const onClick = (e: React.MouseEvent) => {
    if (!on || !follow || mode.current === "step" || mode.current === "held" || !stage.current) return;
    const k = liveZoom();
    const sr = stage.current.getBoundingClientRect();
    const target = cameraTarget({ x: (e.clientX - sr.left) / k, y: (e.clientY - sr.top) / k, w: 0, h: 0 }, viewport(), FOLLOW_ZOOM, 0);
    clear();
    mode.current = "follow";
    setFocusId(null); setDur(m.inMs); setView(target);
    later(() => goFull(m.outMs), FOLLOW_IDLE_MS);
  };

  return (
    <div ref={frame} className={s.camFrame} onClick={onClick} data-camera={on ? "on" : "off"} data-follow={follow} data-zoom={+view.k.toFixed(3)} data-focus-on={focusId ?? undefined}
      data-shows={focusId && request?.focus.id === focusId ? JSON.stringify(request.focus.shows) : undefined}>
      <div ref={stage} className={s.camStage} style={{ transform: transformOf(view), transition: dur ? `transform ${dur}ms ${m.easing}` : "none",
          ["--cam-k" as string]: view.k, ["--cam-move" as string]: dur ? `transform ${dur}ms ${m.easing}` : "none" }}>
        {children}
        {overlay}
        {spot && <div className={s.spotlight} data-reduced={reduced} style={{ left: spot.x - 8, top: spot.y - 8, width: spot.w + 16, height: spot.h + 16 }} aria-hidden="true" />}
      </div>
    </div>
  );
}
