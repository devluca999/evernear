// The numbers the scenario keeps track of, always on top. All derived from the replayed state.
import type { WorkspaceState } from "@/scenario/types";
import { demand, PO } from "@/seed/astro";
import { formatInt, formatUsdShort } from "@/engine/money";
import s from "./workspace.module.css";

export function stats(st: WorkspaceState) {
  const onHand = st.demand.motorsOnHand + (st.dock?.receivedQty ?? 0);
  const needed = st.demand.ordered * demand.motorsPerRobot;
  const e = st.escrow;
  return [
    { label: "Motors on hand", value: formatInt(onHand) },
    { label: "Robots ordered", value: formatInt(st.demand.ordered) },
    { label: "Motors short", value: formatInt(Math.max(0, needed - onHand)), alert: needed > onHand },
    { label: `PO ${PO.number}`, value: e ? formatUsdShort(e.lockedCents) : "not placed" },
    { label: "Committed", value: formatUsdShort(e ? e.lockedCents - e.releasedCents - e.reclaimedCents : 0) },
    { label: "Paid to supplier", value: formatUsdShort(e?.releasedCents ?? 0) },
    { label: "Back to Astro", value: formatUsdShort(e?.reclaimedCents ?? 0) },
  ];
}

export function StatsBar({ st }: { st: WorkspaceState }) {
  return (
    <dl className={s.stats} aria-label="Scenario numbers">
      {stats(st).map((x) => (
        <div key={x.label} className={s.stat} data-alert={x.alert ? "true" : undefined}>
          <dt className={s.micro}>{x.label.toUpperCase()}</dt>
          <dd className={s.statValue}>{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}
