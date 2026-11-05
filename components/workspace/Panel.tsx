import { createContext, useContext, useState, type ReactNode } from "react";
import { GripVertical, Pin, PinOff } from "lucide-react";
import type { PanelId } from "@/scenario/types";
import s from "./workspace.module.css";

/** Pinned panels stay on screen across scenes; dragging a panel's grip reorders the workspace (scenario/layout.ts). */
export const PinContext = createContext<{
  pinned: readonly PanelId[]; toggle: (id: PanelId) => void; move: (id: PanelId, over: PanelId) => void; nudge: (id: PanelId, by: -1 | 1) => void;
} | null>(null);

const DRAG_TYPE = "application/x-evernear-panel";

export function Panel({ id, title, pulse, children, meta }: { id: PanelId; title: string; pulse: boolean; children: ReactNode; meta?: ReactNode }) {
  const pins = useContext(PinContext);
  const [over, setOver] = useState(false);
  const isPinned = !!pins?.pinned.includes(id);
  return (
    <section className={`${s.panel} ${pulse ? s.pulse : ""}`} data-panel={id} data-pinned={isPinned} data-drop={over} aria-label={title}
      onDragOver={(e) => { if (pins && e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const from = e.dataTransfer.getData(DRAG_TYPE) as PanelId; if (pins && from) { e.preventDefault(); pins.move(from, id); } }}>
      <header className={s.panelHead}>
        {pins && (
          <button type="button" className={s.gripBtn} draggable aria-label={`Move ${title}`} title="Drag to reorder. Alt and the arrow keys move it too"
            onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, id); e.dataTransfer.effectAllowed = "move"; }}
            onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); e.stopPropagation(); pins.nudge(id, e.key === "ArrowLeft" ? -1 : 1); } }}>
            <GripVertical size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
        <h2 className={s.panelTitle}>{title}</h2>
        <span className={s.panelMeta}>
          {meta}
          {pins && (
            <button type="button" className={s.pinBtn} aria-pressed={isPinned} aria-label={`${isPinned ? "Unpin" : "Pin"} ${title}`}
              title={isPinned ? "Unpin: let the scene decide" : "Pin: keep on screen in every scene"} onClick={() => pins.toggle(id)}>
              {isPinned ? <PinOff size={14} strokeWidth={2} aria-hidden="true" /> : <Pin size={14} strokeWidth={2} aria-hidden="true" />}
            </button>
          )}
        </span>
      </header>
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}
