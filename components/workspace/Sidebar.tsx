// The app's sidebar: each item opens its card on the workspace and keeps it there (a pin);
// click again to hand it back to the scene. Collapses to a 64px icon rail. A count marks the
// cards that need you. Icons are Lucide (icons carry category, colour carries state).
import { Box, ChevronLeft, ChevronRight, CircleDollarSign, Mail, Package, Pin, Receipt, Scale, Truck, type LucideIcon } from "lucide-react";
import type { PanelId } from "@/scenario/types";
import { PANEL_ORDER, PANEL_NAMES } from "@/scenario/layout";
import { Dot } from "./Panel";
import s from "./shell.module.css";

const ICONS: Record<PanelId, LucideIcon> = { products: Package, stock: Box, orders: Receipt, inbox: Mail, map: Truck, rules: Scale, money: CircleDollarSign };

export type StatusTone = "active" | "attention" | "success" | undefined;

const Mark = () => <span className={s.mark} aria-hidden="true"><span className={s.markRing} /><span className={s.markDot} /></span>;

export function Sidebar({ open, onToggle, onScreen, pinned, needs, status, onPick, onClear }: {
  open: boolean; onToggle: () => void;
  /** Cards on the workspace right now. */
  onScreen: readonly PanelId[];
  /** Cards you opened yourself: they stay until you close them. */
  pinned: readonly PanelId[];
  needs: Partial<Record<PanelId, number>>;
  status: { tone: StatusTone; text: string };
  onPick: (id: PanelId) => void; onClear: () => void;
}) {
  return (
    <nav className={s.nav} data-open={open} aria-label="Workspace panels">
      <div className={s.brand}>
        <Mark />
        {open && <span className={s.brandText}><span className={s.brandName}>Astro Robotics</span><span className={s.brandSub}>Supply workspace</span></span>}
      </div>
      {open && <span className={`es-micro ${s.navLabel}`}>Panels</span>}
      <ul className={s.navList}>
        {PANEL_ORDER.map((id) => {
          const Icon = ICONS[id];
          const on = onScreen.includes(id);
          const mine = pinned.includes(id);
          const count = needs[id] ?? 0;
          const title = mine ? `${PANEL_NAMES[id]} is pinned to your workspace. Click to unpin it` : `Pin ${PANEL_NAMES[id]} to the workspace`;
          return (
            <li key={id}>
              {open ? (
                <button type="button" className={s.navItem} data-on={on} aria-pressed={mine} onClick={() => onPick(id)} title={title}>
                  <Icon size={16} strokeWidth={2} aria-hidden="true" />
                  <span>{PANEL_NAMES[id]}</span>
                  <span className={s.navTail}>
                    {count > 0 && <span className="es-count es-count-attention" aria-label={`${count} needs you`}>{count}</span>}
                    {mine && <span className={s.navPin}><Pin size={12} strokeWidth={2} aria-label="pinned" /></span>}
                  </span>
                </button>
              ) : (
                <button type="button" className={`${s.navItem} ${s.navIcon}`} data-on={on} aria-pressed={mine} onClick={() => onPick(id)} title={title} aria-label={PANEL_NAMES[id]}>
                  <Icon size={18} strokeWidth={2} aria-hidden="true" />
                  {count > 0 && <span className={`es-count es-count-attention ${s.navBadge}`} aria-label={`${count} needs you`}>{count}</span>}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {open && pinned.length > 0 && <button type="button" className={s.navClear} onClick={onClear}>Unpin all</button>}
      <div className={s.navFoot}>
        {open ? (
          <>
            <span className={s.navStatus} role="status"><Dot tone={status.tone} />{status.text}</span>
            <button type="button" className={s.navToggle} onClick={onToggle} aria-expanded={open}><ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />Collapse</button>
            <span className={s.powered}>Powered by Evernear</span>
          </>
        ) : (
          <>
            <span role="status" title={status.text}><Dot tone={status.tone} /><span className="sr-only">{status.text}</span></span>
            <button type="button" className={s.navToggle} onClick={onToggle} aria-expanded={open} aria-label="Expand sidebar"><ChevronRight size={16} strokeWidth={2} aria-hidden="true" /></button>
            <span className={s.eMark} title="Powered by Evernear">E</span>
          </>
        )}
      </div>
    </nav>
  );
}
