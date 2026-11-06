// The numbers the scenario keeps track of, always on top, in two groups: stock, then money.
// A value that is still empty (nothing paid yet) is dimmed so the live ones lead.
import type { WorkspaceState } from "@/scenario/types";
import { demand, PO } from "@/seed/astro";
import { formatInt, formatUsdShort } from "@/engine/money";
import s from "./workspace.module.css";

interface Stat { label: string; value: string; alert?: boolean; empty?: boolean }

export function stats(st: WorkspaceState): { stock: Stat[]; money: Stat[] } {
  const onHand = st.demand.motorsOnHand + (st.dock?.receivedQty ?? 0);
  const needed = st.demand.ordered * demand.motorsPerRobot;
  const short = Math.max(0, needed - onHand);
  const e = st.escrow;
  const held = e ? e.lockedCents - e.releasedCents - e.reclaimedCents : 0;
  const usd = (c: number) => ({ value: formatUsdShort(c), empty: c === 0 });
  return {
    stock: [
      { label: "Motors on hand", value: formatInt(onHand) },
      { label: "Robots ordered", value: formatInt(st.demand.ordered), empty: st.demand.ordered === 0 },
      { label: "Motors short", value: formatInt(short), alert: short > 0, empty: short === 0 },
    ],
    money: [
      { label: `PO ${PO.number}`, ...(e ? { value: formatUsdShort(e.lockedCents) } : { value: "not placed", empty: true }) },
      { label: "Committed", ...usd(held) },
      { label: "Paid to supplier", ...usd(e?.releasedCents ?? 0) },
      { label: "Back to Astro", ...usd(e?.reclaimedCents ?? 0) },
    ],
  };
}

function Group({ name, items }: { name: string; items: Stat[] }) {
  return (
    <div className={s.statGroup} role="group" aria-label={name}>
      <span className={s.statGroupName}>{name.toUpperCase()}</span>
      <div className={s.statRow}>
        {items.map((x) => (
          <div key={x.label} className={s.statCell} data-alert={x.alert ? "true" : undefined} data-empty={x.empty ? "true" : undefined}>
            <dt className={s.micro}>{x.label.toUpperCase()}</dt>
            <dd className={s.statValue}>{x.value}</dd>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatsBar({ st }: { st: WorkspaceState }) {
  const { stock, money } = stats(st);
  return (
    <dl className={s.statsBar} aria-label="Scenario numbers">
      <Group name="Stock" items={stock} />
      <Group name="Money" items={money} />
    </dl>
  );
}
