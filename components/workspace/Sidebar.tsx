// The app's sidebar: each item opens its component on the workspace and keeps it there
// (a pin, scenario/layout.ts); click again to hand it back to the scene. Collapses to icons.
import type { PanelId } from "@/scenario/types";
import { PANEL_ORDER, PANEL_NAMES } from "@/scenario/layout";
import s from "./workspace.module.css";

const ICONS: Record<PanelId, string> = {
  demand: "M2 12h3V7H2zM6.5 12h3V4h-3zM11 12h3V2h-3z",
  map: "M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2zM6 2v10M10 4v10",
  inbox: "M2 3h12v10H2zM2 3l6 5 6-5",
  bom: "M3 2h10v12H3zM5.5 5h5M5.5 8h5M5.5 11h3",
  rules: "M8 1.5l5.5 2v4c0 3.5-2.5 5.8-5.5 7-3-1.2-5.5-3.5-5.5-7v-4z",
};

export function Sidebar({ open, onToggle, pinned, onPick, onClear }: {
  open: boolean; onToggle: () => void; pinned: readonly PanelId[]; onPick: (id: PanelId) => void; onClear: () => void;
}) {
  return (
    <nav className={s.nav} data-open={open} aria-label="Workspace components">
      <button type="button" className={s.navToggle} onClick={onToggle} aria-expanded={open} aria-label={open ? "Collapse sidebar" : "Expand sidebar"}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={open ? "M10 3L5 8l5 5" : "M6 3l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      </button>
      {open && <span className={s.micro}>WORKSPACE</span>}
      <ul className={s.navList}>
        {PANEL_ORDER.map((id) => (
          <li key={id}>
            <button type="button" className={s.navItem} aria-pressed={pinned.includes(id)} onClick={() => onPick(id)}
              title={pinned.includes(id) ? `${PANEL_NAMES[id]}: on the workspace, click to hand it back to the scene` : `Open ${PANEL_NAMES[id]} on the workspace`}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={ICONS[id]} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
              <span className={s.navLabel}>{PANEL_NAMES[id]}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && pinned.length > 0 && <button type="button" className={s.pinClear} onClick={onClear}>Clear pins</button>}
    </nav>
  );
}
