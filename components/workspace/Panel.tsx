import { createContext, useContext, type ReactNode } from "react";
import type { PanelId } from "@/scenario/types";
import s from "./workspace.module.css";

/** Pinned panels stay on screen across scenes (scenario/layout.ts). */
export const PinContext = createContext<{ pinned: readonly PanelId[]; toggle: (id: PanelId) => void } | null>(null);

export function Panel({ id, title, pulse, children, meta }: { id: PanelId; title: string; pulse: boolean; children: ReactNode; meta?: ReactNode }) {
  const pins = useContext(PinContext);
  const isPinned = !!pins?.pinned.includes(id);
  return (
    <section className={`${s.panel} ${pulse ? s.pulse : ""}`} data-panel={id} data-pinned={isPinned} aria-label={title}>
      <header className={s.panelHead}>
        <h2 className={s.panelTitle}>{title}</h2>
        <span className={s.panelMeta}>
          {meta}
          {pins && (
            <button type="button" className={s.pinBtn} aria-pressed={isPinned} aria-label={`${isPinned ? "Unpin" : "Pin"} ${title}`}
              title={isPinned ? "Unpin: let the scene decide" : "Pin: keep on screen in every scene"} onClick={() => pins.toggle(id)}>
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M6 2h4l-.5 4 2.5 2.5v1H4v-1L6.5 6z M8 9.5V14" fill={isPinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </span>
      </header>
      <div className={s.panelBody}>{children}</div>
    </section>
  );
}
