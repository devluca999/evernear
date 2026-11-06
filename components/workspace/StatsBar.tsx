// The numbers the scenario keeps track of, always on top, in two groups: stock, then money.
// A value that is still empty (nothing paid yet) is dimmed so the live ones lead.
import type { WorkspaceState } from "@/scenario/types";
import { demand, PO } from "@/seed/astro";
import { formatInt, formatUsdShort } from "@/engine/money";
import s from "./shell.module.css";

interface Stat { label: string; value: string; alert?: boolean; empty?: boolean }

export function stats(st: WorkspaceState): { stock: Stat[]; money: Stat[] } {
  const onHand = st.demand.motorsOnHand + (st.dock?.receivedQty ?? 0);
  const needed = st.demand.ordered * demand.motorsPerRobot;
  const short = Math.max(0, needed - onHand);
  const e = st.escrow;
  const placed = st.scene >= 3 && st.fitment.some((f) => f.pass);
  const usd = (c: number) => ({ value: formatUsdShort(c), empty: c === 0 });
  return {
    stock: [
      { label: "Motors on hand", value: formatInt(onHand) },
      { label: "Robots ordered", value: formatInt(st.demand.ordered), empty: st.demand.ordered === 0 },
      { label: "Motors short", value: formatInt(short), alert: short > 0, empty: short === 0 },
    ],
    money: [
      { label: "PO", ...(placed || e ? { value: PO.number } : { value: "None", empty: true }) },
      { label: "Committed", ...usd(e?.lockedCents ?? 0) },
      { label: "Paid to supplier", ...usd(e?.releasedCents ?? 0) },
      { label: "Back to Astro", ...usd(e?.reclaimedCents ?? 0) },
    ],
  };
}

function Group({ name, items }: { name: string; items: Stat[] }) {
  return (
    <dl className={s.statGroup} aria-label={name}>
      <span className={s.statName}>{name}</span>
      {items.map((x) => (
        <div key={x.label} className={s.stat} data-alert={x.alert ? "true" : undefined} data-empty={x.empty ? "true" : undefined}>
          <dt className="es-micro">{x.label}</dt>
          <dd className="es-num">{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatsBar({ st, title }: { st: WorkspaceState; title?: boolean }) {
  const { stock, money } = stats(st);
  return (
    <div className={s.strip} role="group" aria-label="Scenario numbers">
      {title && <span className={s.stripTitle}>Astro Robotics</span>}
      <Group name="Stock" items={stock} />
      <Group name="Money" items={money} />
    </div>
  );
}
