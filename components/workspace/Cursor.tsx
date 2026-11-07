"use client";
// The presenter cursor: an on-screen arrow that glides to what a step clicks and presses it, so a
// recording shows a cursor at work while the presenter only presses Cmd+K or the right arrow. It
// lives inside the camera's stage, in layout pixels, so it lines up at every zoom; the arrow itself
// is scaled back so it stays the same size on screen. It clicks only what the app really does at
// that step (a tab, a button, a tap on the phone); a step that only animates gets no click. While
// it is on, the system cursor is hidden over the workspace until the mouse moves more than 40 px.
// Rules: scenario/cursor.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Rect } from "@/scenario/camera";
import { CAUSE_MS, fitGlide, FORBIDDEN, moveMs, PRESS_MS, restPoint, tapPoint, TAKEOVER_PX, type Point } from "@/scenario/cursor";
import s from "./shell.module.css";

export interface GhostState { x: number; y: number; ms: number; press: number }
const START: Point = { x: 960, y: 640 };

export function useGhost({ on, locate, reduced }: { on: boolean; locate: (id: string) => Rect | null; reduced: boolean }) {
  const [g, setG] = useState<GhostState>({ ...START, ms: 0, press: 0 });
  const pos = useRef<Point>(START);
  const timers = useRef<number[]>([]);
  const busy = useRef(false);
  const [mouse, setMouse] = useState(false);
  const anchor = useRef<Point | null>(null);
  const later = useCallback((fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach((id) => window.clearTimeout(id)); }, []);

  const glide = useCallback((to: Point, ms: number) => {
    pos.current = to;
    setG((x) => ({ ...x, x: to.x, y: to.y, ms }));
  }, []);
  const press = useCallback(() => setG((x) => ({ ...x, press: x.press + 1 })), []);
  /** The presenter is back on the keyboard: hide the system cursor again. */
  const takeBack = useCallback(() => { anchor.current = null; setMouse(false); }, []);

  /** Glide to `id`, press it, then run `then` (the change the click causes). No element: no click. */
  const tap = useCallback((id: string, then: () => void) => {
    const r = on && !FORBIDDEN.test(id) ? locate(id) : null;
    if (!r) { then(); return; }
    if (busy.current) return; // one tap at a time; a second press mid-tap waits for this one
    busy.current = true;
    takeBack();
    const to = tapPoint(r), ms = moveMs(pos.current, to, reduced);
    glide(to, ms);
    later(press, ms + PRESS_MS);
    later(() => { busy.current = false; then(); }, ms + PRESS_MS + CAUSE_MS);
  }, [on, locate, reduced, glide, press, later, takeBack]);

  /** A click on a step the running clock reaches by itself, `remainingMs` away: land just before it. */
  const tapBy = useCallback((id: string, remainingMs: number) => {
    const r = on && !busy.current && !FORBIDDEN.test(id) ? locate(id) : null;
    if (!r) return;
    const to = tapPoint(r), ms = fitGlide(moveMs(pos.current, to, reduced), remainingMs);
    glide(to, ms);
    later(press, ms + PRESS_MS);
  }, [on, locate, reduced, glide, press, later]);

  /** Rest beside a step's content once it has drawn. No click. */
  const rest = useCallback((id: string) => {
    if (!on) return;
    takeBack();
    let tries = 0;
    const attempt = () => {
      if (busy.current) return;
      const r = locate(id);
      if (!r) { if (tries++ < 10) later(attempt, 80); return; }
      const to = restPoint(r);
      glide(to, moveMs(pos.current, to, reduced));
    };
    later(attempt, 160);
  }, [on, locate, reduced, glide, later, takeBack]);

  // The real mouse takes over after 40 px; the next step from the keyboard hands it back.
  useEffect(() => {
    if (!on) return;
    const move = (e: PointerEvent) => {
      if (!anchor.current) { anchor.current = { x: e.clientX, y: e.clientY }; return; }
      if (Math.hypot(e.clientX - anchor.current.x, e.clientY - anchor.current.y) > TAKEOVER_PX) setMouse(true);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [on]);

  return { g, tap, tapBy, rest, shown: on && !mouse };
}

/** The arrow, with a press and a ring on each click. */
export function GhostCursor({ g, shown, reduced }: { g: GhostState; shown: boolean; reduced: boolean }) {
  return (
    <div className={s.ghost} data-shown={shown} data-press={g.press} aria-hidden="true"
      style={{ transform: `translate(${g.x}px, ${g.y}px)`, transition: g.ms ? `transform ${g.ms}ms cubic-bezier(0.25, 0.8, 0.3, 1)` : "none" }}>
      <div className={s.ghostScale}>
        {g.press > 0 && <span key={`r${g.press}`} className={s.ghostRing} />}
        <svg key={`a${g.press}`} className={s.ghostArrow} data-press={g.press > 0 && !reduced} width="22" height="26" viewBox="0 0 22 26">
          <path d="M2 1.5 L2 20 L6.6 15.8 L9.6 22.8 L12.9 21.4 L9.9 14.6 L16.2 14.6 Z" fill="#fff" stroke="#111" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
