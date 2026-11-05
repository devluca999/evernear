import { createContext, useContext, type ReactNode } from "react";
import { GripVertical, Lock, LockOpen, X } from "lucide-react";
import type { PanelId } from "@/scenario/types";
import s from "./workspace.module.css";

/** The board (scenario/board.ts): drag a card by its grip to a spot, lock it there, or close it. */
export const BoardContext = createContext<{
  isMine: (id: PanelId) => boolean; isLocked: (id: PanelId) => boolean; dragging: PanelId | null;
  startDrag: (id: PanelId, e: React.PointerEvent) => void; step: (id: PanelId, dx: number, dy: number) => void;
  lock: (id: PanelId) => void; close: (id: PanelId) => void;
} | null>(null);

export function Panel({ id, title, pulse, children, meta }: { id: PanelId; title: string; pulse: boolean; children: ReactNode; meta?: ReactNode }) {
  const board = useContext(BoardContext);
  const locked = !!board?.isLocked(id);
  const mine = !!board?.isMine(id);
  return (
    <section className={`${s.panel} ${pulse ? s.pulse : ""}`} data-panel={id} data-locked={locked} data-dragging={board?.dragging === id} aria-label={title}>
      <header className={s.panelHead} data-draggable={!!board && !locked}
        onPointerDown={(e) => {
          // The whole header drags the card, except its buttons.
          if (!board || locked || e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
          board.startDrag(id, e);
        }}>
        {board && (
          <button type="button" className={s.gripBtn} aria-label={`Move ${title}`} disabled={locked}
            title={locked ? "Locked in place" : "Drag to a spot on the workspace. Alt and the arrow keys move it too"}
            onPointerDown={(e) => { if (!locked && e.button === 0) board.startDrag(id, e); }}
            onKeyDown={(e) => {
              const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
              if (e.altKey && d) { e.preventDefault(); e.stopPropagation(); board.step(id, d[0], d[1]); }
            }}>
            <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        <h2 className={s.panelTitle}>{title}</h2>
        <span className={s.panelMeta}>
          {meta}
          {board && (
            <button type="button" className={s.pinBtn} aria-pressed={locked} aria-label={`${locked ? "Unlock" : "Lock"} ${title}`}
              title={locked ? "Unlock: it stays here, and you can move it again" : "Lock: keep it in this spot"} onClick={() => board.lock(id)}>
              {locked ? <Lock size={14} strokeWidth={2} aria-hidden="true" /> : <LockOpen size={14} strokeWidth={2} aria-hidden="true" />}
            </button>
          )}
          {board && mine && !locked && (
            <button type="button" className={s.pinBtn} aria-label={`Close ${title}`} title="Close" onClick={() => board.close(id)}>
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </span>
      </header>
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}
