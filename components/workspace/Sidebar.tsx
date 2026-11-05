// The app's sidebar: each item opens its component on the workspace and keeps it there
// (a pin, scenario/layout.ts); click again to hand it back to the scene. Collapses to a 56px icon rail.
// Icons are Lucide (design system: icons carry category, colour carries state).
import { ClipboardList, Inbox, ListChecks, MapPinned, Package, PanelLeftClose, PanelLeftOpen, ShieldCheck, type LucideIcon } from "lucide-react";
import type { PanelId } from "@/scenario/types";
import { PANEL_ORDER, PANEL_NAMES } from "@/scenario/layout";
import s from "./workspace.module.css";

const ICONS: Record<PanelId, LucideIcon> = { products: Package, demand: ClipboardList, map: MapPinned, inbox: Inbox, bom: ListChecks, rules: ShieldCheck };

export function Sidebar({ open, onToggle, pinned, onPick, onClear }: {
  open: boolean; onToggle: () => void; pinned: readonly PanelId[]; onPick: (id: PanelId) => void; onClear: () => void;
}) {
  const Toggle = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <nav className={s.nav} data-open={open} aria-label="Workspace components">
      <button type="button" className={s.navToggle} onClick={onToggle} aria-expanded={open} aria-label={open ? "Collapse sidebar" : "Expand sidebar"}>
        <Toggle size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      {open && <span className={s.micro}>WORKSPACE</span>}
      <ul className={s.navList}>
        {PANEL_ORDER.map((id) => {
          const Icon = ICONS[id];
          const on = pinned.includes(id);
          return (
            <li key={id}>
              <button type="button" className={s.navItem} aria-pressed={on} onClick={() => onPick(id)}
                title={on ? `${PANEL_NAMES[id]} is on your workspace. Click to close it` : `Open ${PANEL_NAMES[id]} on the workspace`}>
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
                <span className={s.navLabel}>{PANEL_NAMES[id]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open && pinned.length > 0 && <button type="button" className={s.pinClear} onClick={onClear}>Clear workspace</button>}
    </nav>
  );
}
